import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDemoApi } from '../demo/api.mjs';
import { withFixturePostgres } from './postgres.mjs';

const schema = fileURLToPath(new URL('../demo/schema.sql', import.meta.url));

function result(label, response, expected, match, status = 200, expectation = 'exact') {
  return {
    label,
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
      result('Ayşe kendi görevini görüyor', ayse, ['ayse-task'], (ids) => ids.includes('ayse-task'), 200, 'includes'),
      result('Bora kendi görevini görüyor', bora, ['bora-task'], (ids) => ids.includes('bora-task'), 200, 'includes'),
      result('Bora yalnız kendi görevini görüyor', bora, ['bora-task'],
        (ids) => ids.length === 1 && ids[0] === 'bora-task'),
      result('Bora yeni görev ekleyebiliyor', write, ['new-task'],
        (ids) => saved && ids.length === 1 && ids[0] === 'new-task', 201),
    ];
  });
}

export async function runDemo(signal) {
  const fixtures = await mkdtemp('/tmp/restorelab-archives-');
  const backups = ['restricted.dump', 'permissive.dump'];
  try {
    await withFixturePostgres(async (db) => {
      await db.psql(['-f', schema]);
      await db.dump(join(fixtures, backups[0]));
      await db.psql(['-c', 'ALTER POLICY read_tasks ON tasks USING (true)']);
      await db.dump(join(fixtures, backups[1]));
    });
    const runs = [];
    for (const backup of backups) {
      signal.throwIfAborted();
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
