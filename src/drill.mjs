import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { withDemoApi } from '../demo/api.mjs';
import { withDockerPostgres } from './docker.mjs';
import { runDrill } from './history.mjs';
import { withFixturePostgres } from './postgres.mjs';

const schema = new URL('../demo/schema.sql', import.meta.url);

function withDemoDocker(use) {
  return withDockerPostgres('postgres:16-alpine', async (db) => {
    await db.psql(['-c', 'CREATE ROLE ayse LOGIN; CREATE ROLE bora LOGIN;']);
    return use(db);
  });
}

function result(label, english, response, expected, match, status = 200, expectation = 'exact') {
  return {
    label,
    english,
    expected,
    expectation,
    observed: response.ids,
    httpStatus: response.status,
    passed: response.status === status && match(response.ids),
  };
}

async function verify(db) {
  return withDemoApi(db, async (request) => {
    const ayse = await request('ayse');
    const bora = await request('bora');
    const write = await request('bora', 'POST');
    const afterWrite = await request('bora');
    const saved = afterWrite.status === 200 && afterWrite.ids.includes('new-task');
    return [
      result('Ayşe kendi görevini görüyor', 'Ayşe can see her task', ayse, ['ayse-task'], (ids) => ids.includes('ayse-task'), 200, 'includes'),
      result('Bora kendi görevini görüyor', 'Bora can see his task', bora, ['bora-task'], (ids) => ids.includes('bora-task'), 200, 'includes'),
      result('Bora yalnız kendi görevini görüyor', 'Bora can only see his own task', bora, ['bora-task'],
        (ids) => ids.length === 1 && ids[0] === 'bora-task'),
      result('Bora yeni görev ekleyebiliyor', 'Bora can create a task', write, ['new-task'],
        (ids) => saved && ids.length === 1 && ids[0] === 'new-task', 201),
    ];
  });
}

export async function runDemo(signal, { dockerState } = {}) {
  const fixtures = await mkdtemp('/tmp/restorelab-archives-');
  const backups = ['restricted.dump', 'permissive.dump'];
  try {
    const prepare = dockerState ? withDemoDocker : withFixturePostgres;
    await prepare(async (db) => {
      await db.psql(['-c', await readFile(schema, 'utf8')]);
      await db.dump(join(fixtures, backups[0]));
      await db.psql(['-c', 'ALTER POLICY read_tasks ON tasks USING (true)']);
      await db.dump(join(fixtures, backups[1]));
    });
    const runs = [];
    const backupAt = Date.now();
    for (const backup of backups) {
      signal.throwIfAborted();
      if (dockerState) {
        const profile = {
          id: 'task-demo', title: 'Task demo', applicationVersion: 'demo-v1', suiteVersion: 'access-v1',
          backup: join(fixtures, backup), backupAt: new Date(backupAt + runs.length).toISOString(),
          exercise: ({ restoreBackup }) => withDemoDocker(async (db) => {
            await restoreBackup(db.restore);
            return verify(db);
          }),
        };
        runs.push(await runDrill(profile, dockerState, signal));
        continue;
      }
      const run = await withFixturePostgres(async (db) => {
        const started = performance.now();
        await db.restore(join(fixtures, backup));
        const restoreMs = Math.round(performance.now() - started);
        const checks = await verify(db);
        const status = checks.every((check) => check.passed) ? 'passed' : 'failed';
        return { backup, restore: 'passed', restoreMs, status, checks };
      });
      runs.push(run);
    }
    signal.throwIfAborted();
    return { recordedAt: new Date().toISOString(), runs };
  } finally {
    await rm(fixtures, { recursive: true, force: true });
  }
}
