import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadHistory, runDrill, summarize } from '../src/history.mjs';

test('history retains a failed restore and finds the newest passing backup for the same app and suite', async () => {
  const state = await mkdtemp('/tmp/restorelab-history-');
  try {
    const backup = join(state, 'archive.dump');
    const profile = { id: 'sample', title: 'Sample', applicationVersion: 'v1', suiteVersion: '2' };
    async function run(date, restore, version = 'v1') {
      await writeFile(backup, date);
      return runDrill({
        ...profile, applicationVersion: version, backup, backupAt: date,
        async exercise({ restoreBackup }) {
          await restoreBackup(restore);
          return [{ label: 'Can read', expected: ['x'], observed: ['x'], httpStatus: 200, passed: true }];
        },
      }, state);
    }
    const good = await run('2026-11-01T00:00:00Z', async () => {});
    const broken = await run('2026-11-03T00:00:00Z', async () => { throw new Error('private credentials'); });
    await run('2026-11-02T00:00:00Z', async () => {});
    await run('2026-11-04T00:00:00Z', async () => {}, 'v0');
    const history = await loadHistory(state);
    const row = summarize(history, profile);
    assert.equal(history.length, 4);
    assert.equal(row.latest.id, broken.id);
    assert.equal(row.lastPassing.backupAt, '2026-11-02T00:00:00.000Z');
    assert.equal(broken.restore, 'failed');
    assert.equal(broken.status, 'failed');
    assert.notEqual(good.backupHash, broken.backupHash);
    assert.ok(!JSON.stringify(history).includes('private credentials'));
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test('a missing backup has a safe diagnostic in history and the report', async () => {
  const state = await mkdtemp('/tmp/restorelab-missing-');
  try {
    const result = await runDrill({
      id: 'sample', title: 'Sample', applicationVersion: 'v1', suiteVersion: 'v1',
      backup: join(state, 'missing.dump'), backupAt: '2026-11-08T00:00:00Z',
      async exercise() { assert.fail('Setup must not run'); },
    }, state);
    assert.equal(result.diagnostic, 'backup-missing');
    assert.equal(result.restore, 'not-run');
    const [stored] = await loadHistory(state);
    assert.equal(stored.diagnostic, 'backup-missing');
    assert.ok(!JSON.stringify(stored).includes(state));
    const { renderReport } = await import('../src/report.mjs');
    assert.match(renderReport({ recordedAt: stored.recordedAt, runs: [stored] }, { lang: 'en' }), /Backup file could not be found/);
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});
