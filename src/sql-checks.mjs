import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const labelIsValid = (value) => typeof value === 'string' && value.trim() && value.length <= 200;

export async function loadSqlSuite(file, image) {
  if (!file) throw new Error('Set DRILL_SQL_SUITE to a trusted SQL suite JSON file.');
  let suite;
  try {
    suite = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Error('SQL suite could not be read as JSON.');
  }
  if (!Array.isArray(suite) || !suite.length || suite.length > 20) {
    throw new Error('SQL suite must contain 1–20 checks.');
  }

  const labels = new Set();
  const checks = suite.map((check) => {
    if (!labelIsValid(check?.label) || (check.english !== undefined && !labelIsValid(check.english)) ||
        typeof check.sql !== 'string' || !check.sql.trim() || check.sql.length > 8_000 || /[;\0]/.test(check.sql)) {
      throw new Error('Each SQL suite check needs a label and one boolean expression without semicolons.');
    }
    const label = check.label.trim();
    if (labels.has(label)) throw new Error('SQL suite labels must be unique.');
    labels.add(label);
    return { label, ...(check.english === undefined ? {} : { english: check.english.trim() }), sql: check.sql.trim() };
  });
  const fingerprint = createHash('sha256').update(JSON.stringify([image, checks])).digest('hex');
  return { version: 'sql-v1:' + fingerprint, checks };
}

export async function runSqlChecks(db, checks, signal) {
  const results = [];
  for (const { label, english, sql } of checks) {
    signal.throwIfAborted();
    let observed;
    try {
      const { stdout } = await db.psql([
        '-c', "BEGIN READ ONLY; SET LOCAL statement_timeout = '5s'",
        '-c', 'SELECT (' + sql + '\n) IS TRUE',
        '-c', 'ROLLBACK',
      ]);
      observed = stdout.trim() === 't' ? 'true' : 'false';
    } catch {
      observed = 'SQL error';
    }
    signal.throwIfAborted();
    results.push({ label, english, expected: ['true'], observed: [observed], passed: observed === 'true' });
  }
  return results;
}
