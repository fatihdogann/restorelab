import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

test('both archives restore, and only the permissive policy exposes the other task', { timeout: 90_000 }, async () => {
  const output = await mkdtemp(join(tmpdir(), 'restorelab-report-'));
  try {
    await promisify(execFile)(process.execPath, ['restorelab.mjs', 'demo', output], { timeout: 80_000 });
    const { runs } = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
    assert.deepEqual(runs.map((run) => [run.backup, run.restore, run.status]), [
      ['restricted.dump', 'passed', 'passed'],
      ['permissive.dump', 'passed', 'failed'],
    ]);
    const [restricted, permissive] = runs;
    assert.deepEqual(restricted.checks.map((check) => check.passed), [true, true, true, true]);
    assert.deepEqual(permissive.checks.map((check) => check.passed), [true, true, false, true]);
    const boundary = permissive.checks[2];
    assert.equal(boundary.httpStatus, 200);
    assert.deepEqual(boundary.expected, ['bora-task']);
    assert.deepEqual(boundary.observed, ['ayse-task', 'bora-task']);
    const html = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(html, /permissive\.dump/);
    assert.match(html, /HTTP 200/);
    assert.match(html, /ayse-task/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
