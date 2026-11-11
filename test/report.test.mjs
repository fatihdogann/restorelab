import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { renderPanel } from '../src/panel.mjs';
import { renderReport } from '../src/report.mjs';

const profile = { id: 'inventory', title: 'Inventory', applicationVersion: 'v1', suiteVersion: 'v1' };
const run = {
  ...profile, project: 'inventory', id: 'abc', backup: 'fixture.dump',
  backupAt: '2026-11-07T01:00:00.000Z', recordedAt: '2026-11-07T01:30:00.000Z',
  restoreMs: 0, restore: 'passed', status: 'failed', failure: 'checks', checks: [],
};

test('report and history distinguish failed and incomplete checks from failed restores', () => {
  const rows = [
    [{ restore: 'failed', failure: 'restore' }, /Restore failed/],
    [{ checks: [{ label: 'Data', expected: ['x'], observed: [], passed: false }] }, /Application check failed/],
    [{}, /Application checks did not finish/],
    [{ restore: 'not-run', failure: 'backup', restoreMs: null }, /Backup preparation failed/],
  ];
  for (const [changes, expected] of rows) {
    const record = { ...run, ...changes };
    const report = renderReport({ recordedAt: record.recordedAt, runs: [record] }, { live: true, lang: 'en' });
    assert.match(report, expected);
    assert.match(renderPanel([profile], [record], 'en'), expected);
  }
  const report = renderReport({ recordedAt: run.recordedAt, runs: [run] }, { live: true, lang: 'en' });
  assert.match(report, /Restore time/);
  assert.match(report, /0 ms/);
});

test('backup age and last attempt use different timestamps and future dates are called out', () => {
  const future = { ...run, id: 'future', status: 'passed', failure: null, backupAt: '2035-01-01T01:00:00.000Z' };
  const html = renderPanel([profile], [future, { ...run, recordedAt: '2026-11-10T10:30:00.000Z' }], 'en');
  assert.match(html, /Backup date is in the future/);
  assert.match(html, /Most recent drill[\s\S]*?datetime="2026-11-10T10:30:00.000Z"/);
  const past = renderPanel([profile], [{ ...run, status: 'passed', failure: null }], 'en');
  assert.match(past, /Age of the passing backup[\s\S]*?ago/);
});

test('a failed CLI drill can export a private report and preserves an existing file', async (t) => {
  const dir = await mkdtemp('/tmp/restorelab-export-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = join(dir, 'profile.mjs');
  const output = join(dir, 'report.html');
  await writeFile(config, 'export default ' + JSON.stringify({
    ...profile, backup: join(dir, 'missing.dump'), backupAt: run.backupAt,
  }).slice(0, -1) + ', async exercise() {} };');
  const invoke = () => promisify(execFile)(process.execPath, ['restorelab.mjs', 'drill', config, '--report', output], {
    env: { ...process.env, RESTORELAB_STATE: join(dir, 'history'), RESTORELAB_LANG: 'en' },
  });
  await assert.rejects(invoke(), { code: 1 });
  const html = await readFile(output, 'utf8');
  assert.match(html, /Backup file could not be found/);
  assert.doesNotMatch(html, /Back to drills/);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  await assert.rejects(invoke(), { code: 1 });
  assert.equal(await readFile(output, 'utf8'), html);
});
