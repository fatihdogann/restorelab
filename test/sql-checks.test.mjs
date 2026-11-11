import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { withFixturePostgres } from '../src/postgres.mjs';
import { loadSqlSuite, runSqlChecks } from '../src/sql-checks.mjs';

test('a suite is validated and its version follows the checks and image', async (t) => {
  const dir = await mkdtemp('/tmp/restorelab-suite-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'checks.json');
  const load = async (checks, image = 'postgres:16-alpine') => {
    await writeFile(file, JSON.stringify(checks));
    return loadSqlSuite(file, image);
  };
  const check = { label: 'Stock is available', sql: '1 > 0' };
  for (const invalid of [[], [check, check], [{ label: ' ', sql: 'true' }],
    [{ label: 'multiple statements', sql: 'true); SELECT true; --' }],
    [{ label: 'missing SQL' }], [{ ...check, english: 123 }]]) {
    await assert.rejects(load(invalid), /SQL suite/);
  }
  const valid = await load([check]);
  assert.deepEqual(valid.checks, [check]);
  assert.notEqual(valid.version, (await load([{ ...check, sql: '1 > 1' }])).version);
  assert.notEqual(valid.version, (await load([check], 'postgres:17-alpine')).version);
});

test('SQL assertions interpret false, NULL and query errors without storing SQL output', async () => {
  await withFixturePostgres(async (db) => {
    await db.psql(['-c', 'CREATE TABLE stock (qty int); INSERT INTO stock VALUES (1); CREATE FUNCTION erase_stock() RETURNS boolean LANGUAGE sql AS $$ DELETE FROM stock; SELECT true $$;']);
    const checks = [
      { label: 'In stock', sql: 'EXISTS (SELECT FROM stock WHERE qty > 0)' },
      { label: 'Sold out', sql: 'EXISTS (SELECT FROM stock WHERE qty = 0)' },
      { label: 'Null result', sql: 'NULL::boolean' },
      { label: 'Invalid query', sql: 'private_column = 1' },
      { label: 'Cannot write', sql: 'erase_stock()' },
      { label: 'Stock preserved', sql: 'EXISTS (SELECT FROM stock)' },
    ];
    const results = await runSqlChecks(db, checks, new AbortController().signal);
    assert.deepEqual(results.map(({ passed, observed }) => [passed, observed]), [
      [true, ['true']], [false, ['false']], [false, ['false']], [false, ['SQL error']],
      [false, ['SQL error']], [true, ['true']],
    ]);
    assert.doesNotMatch(JSON.stringify(results), /private_column/);
  });
});

test('the CLI restores two inventory dumps in Docker and detects the missing reservation', {
  skip: process.env.RESTORELAB_TEST_DOCKER !== '1',
  timeout: 180_000,
}, async (t) => {
  const dir = await mkdtemp('/tmp/restorelab-inventory-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const good = join(dir, 'dumps', 'healthy.dump');
  const bad = join(dir, 'dumps', 'incomplete.dump');
  await promisify(execFile)(process.execPath, ['examples/make-inventory-dumps.mjs', join(dir, 'dumps')], { timeout: 80_000 });

  const run = (backup, backupAt) => promisify(execFile)(process.execPath,
    ['restorelab.mjs', 'drill', 'examples/sql-profile.mjs'], {
      env: { ...process.env, RESTORELAB_STATE: dir, DRILL_PROJECT_ID: 'inventory',
        DRILL_APP_VERSION: '1.0', DRILL_BACKUP: backup, DRILL_BACKUP_AT: backupAt,
        DRILL_SQL_SUITE: 'examples/inventory-checks.json' },
      timeout: 80_000,
    });
  await run(good, '2026-11-10T01:00:00Z');
  await assert.rejects(run(bad, '2026-11-11T01:00:00Z'), { code: 1 });
  const files = (await readdir(dir)).filter(name => name.endsWith('.json'));
  const runs = await Promise.all(files.map(async name => JSON.parse(await readFile(join(dir, name), 'utf8'))));
  runs.sort((a, b) => a.backupAt.localeCompare(b.backupAt));
  assert.deepEqual(runs.map(run => [run.restore, run.status, run.checks.map(check => check.passed)]),
    [['passed', 'passed', [true, true]], ['passed', 'failed', [false, true]]]);
});
