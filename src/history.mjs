import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const safeId = /^[a-z0-9][a-z0-9-]{0,63}$/;
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const shortText = (value) => nonempty(value) && value.length <= 200;
const checkIsValid = (check) => check && shortText(check.label) && (check.english === undefined || shortText(check.english)) && typeof check.passed === 'boolean' &&
  [check.expected, check.observed].every((values) => Array.isArray(values) && values.length <= 20 && values.every(shortText)) &&
  (check.httpStatus === undefined || (Number.isInteger(check.httpStatus) && check.httpStatus >= 100 && check.httpStatus <= 599));

export function validateIdentity(profile) {
  if (!profile || typeof profile.id !== 'string' || !safeId.test(profile.id) ||
    ![profile.title, profile.applicationVersion, profile.suiteVersion].every(shortText)) {
    throw new Error('Profile requires id, title, applicationVersion and suiteVersion.');
  }
}

export async function runDrill(profile, state, signal = new AbortController().signal) {
  validateIdentity(profile);
  if (!nonempty(profile.backup) || !nonempty(profile.backupAt) ||
    !Number.isFinite(Date.parse(profile.backupAt)) || typeof profile.exercise !== 'function') {
    throw new Error('Profile requires a backup file, its timestamp and an exercise function.');
  }
  const backupAt = new Date(profile.backupAt).toISOString();
  const record = {
    id: randomUUID(), project: profile.id, title: profile.title,
    applicationVersion: profile.applicationVersion, suiteVersion: profile.suiteVersion,
    backup: basename(profile.backup), backupAt, backupHash: null,
    recordedAt: new Date().toISOString(), restore: 'not-run', restoreMs: null,
    status: 'failed', checks: [], failure: 'backup',
  };

  const workspace = await mkdtemp('/tmp/restorelab-run-');
  try {
    const archive = join(workspace, 'backup.dump');
    await copyFile(profile.backup, archive);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archive)) {
      signal.throwIfAborted();
      hash.update(chunk);
    }
    record.backupHash = hash.digest('hex');
    record.failure = 'setup';
    const restoreBackup = async (restore) => {
      signal.throwIfAborted();
      if (record.restore !== 'not-run') throw new Error('Restore can run only once per drill.');
      const started = performance.now();
      record.restore = 'failed';
      record.failure = 'restore';
      try {
        await restore(archive);
        record.restore = 'passed';
        record.failure = 'checks';
      } finally {
        record.restoreMs = Math.round(performance.now() - started);
      }
    };
    signal.throwIfAborted();
    const checks = await profile.exercise({ restoreBackup, signal });
    signal.throwIfAborted();
    if (record.restore === 'passed' && Array.isArray(checks) && checks.length && checks.every(checkIsValid)) {
      record.checks = checks.map(({ label, english, expected, observed, passed, httpStatus, expectation }) =>
        ({ label, english, expected, observed, passed, httpStatus, expectation: expectation === 'includes' ? expectation : 'exact' }));
      if (record.checks.every((check) => check.passed)) {
        record.status = 'passed';
        record.failure = null;
      }
    }
  } catch (error) {
    if (signal.aborted) {
      record.failure = 'interrupted';
    } else if (record.failure === 'backup' && error?.code === 'ENOENT') {
      record.diagnostic = 'backup-missing';
    } else if (record.failure === 'backup' && ['EACCES', 'EPERM'].includes(error?.code)) {
      record.diagnostic = 'backup-denied';
    } else if (record.failure === 'setup' && error?.code === 'ENOENT' && error.syscall === 'spawn docker') {
      record.diagnostic = 'docker-missing';
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
  await mkdir(state, { recursive: true, mode: 0o700 });
  const filename = join(state, record.id + '.json');
  await writeFile(filename + '.tmp', JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(filename + '.tmp', filename);
  return record;
}

export async function loadHistory(state) {
  let names;
  try {
    names = await readdir(state);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return Promise.all(names.filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
    .map(async (name) => JSON.parse(await readFile(join(state, name), 'utf8'))));
}

export function summarize(history, profile) {
  const comparable = history.filter((run) => run.project === profile.id &&
    run.applicationVersion === profile.applicationVersion && run.suiteVersion === profile.suiteVersion);
  comparable.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const seen = new Set();
  const latestPerBackup = comparable.filter((run) => {
    const key = run.backupHash ?? run.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  latestPerBackup.sort((a, b) => b.backupAt.localeCompare(a.backupAt));
  return { latest: latestPerBackup[0], lastPassing: latestPerBackup.find((run) => run.status === 'passed') };
}
