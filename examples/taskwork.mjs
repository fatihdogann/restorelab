import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, open, rm, writeFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { docker } from '../src/docker.mjs';
import { runDrill } from '../src/history.mjs';

const exec = promisify(execFile);
const exclude = 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';

async function withSupabase(port, use) {
  const directory = await mkdtemp('/tmp/restorelab-supabase-');
  const id = 'rl-' + randomBytes(6).toString('hex');
  const supabase = async (args) => (await exec('supabase', [...args, '--workdir', directory],
    { timeout: 600_000, maxBuffer: 4 * 1024 * 1024 })).stdout;
  let startAttempted = false;
  try {
    await supabase(['init']);
    const file = join(directory, 'supabase', 'config.toml');
    const config = (await readFile(file, 'utf8')).replace(/^project_id = .*$/m, `project_id = "${id}"`)
      .replace(/^(\s*(?:port|shadow_port|inspector_port)\s*=\s*)5432([0-9])\b/gm,
        (_, prefix, offset) => prefix + (port - 1 + Number(offset)));
    await writeFile(file, config);
    startAttempted = true;
    await supabase(['start', '-x', exclude]);
    const { ANON_KEY, API_URL, SERVICE_ROLE_KEY } = JSON.parse(await supabase(['status', '-o', 'json']));
    if (API_URL !== `http://127.0.0.1:${port}` || !ANON_KEY || !SERVICE_ROLE_KEY) {
      throw new Error('Local Supabase endpoint did not match the drill.');
    }
    const container = 'supabase_db_' + id;
    const pg = (command, args, options) =>
      docker(['exec', ...(options?.input === undefined ? [] : ['-i']), container, command, ...args], options);
    const sql = (args, options) => pg('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', ...args], options);
    async function request(path, { token = ANON_KEY, method = 'GET', body } = {}) {
      const response = await fetch(API_URL + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
          Prefer: 'return=representation' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }
    return await use({ container, pg, sql, request, serviceRole: SERVICE_ROLE_KEY });
  } finally {
    if (startAttempted) await supabase(['stop', '--no-backup']);
    await rm(directory, { recursive: true, force: true });
  }
}

function requireStatus(response, expected, action) {
  if (response.status !== expected) throw new Error(`${action} returned HTTP ${response.status}.`);
  return response.body;
}

const readCards = (api, token) => api.request('/rest/v1/cards?select=title&order=title', { token });
const login = (api, account) => api.request('/auth/v1/token?grant_type=password', { method: 'POST', body: account });
const post = (api, path, body, token) => api.request(path, { method: 'POST', body, token });
const titles = (response) => Array.isArray(response.body) ? response.body.map((item) => item.title) : [];

async function seed(api, account, marker) {
  const user = requireStatus(await post(api, '/auth/v1/admin/users', { ...account, email_confirm: true }, api.serviceRole), 200, 'Create user');
  const { access_token: token } = requireStatus(await login(api, account), 200, 'Sign in');
  const board = randomUUID();
  const column = randomUUID();
  requireStatus(await post(api, '/rest/v1/boards', { id: board, owner_id: user.id, title: marker }, token), 201, 'Write board');
  requireStatus(await post(api, '/rest/v1/columns', { id: column, board_id: board, title: marker }, token), 201, 'Write column');
  requireStatus(await post(api, '/rest/v1/cards', { id: randomUUID(), column_id: column, title: marker }, token), 201, 'Write card');
  return column;
}

async function createBackup(api, archive) {
  const file = await open(archive, 'wx', 0o600);
  try {
    await api.pg('pg_dump', ['-U', 'postgres', '-d', 'postgres', '-Fc',
      '--schema=public', '--schema=private', '--schema=auth'], { output: file.fd });
  } finally {
    await file.close();
  }
}

async function restoreBackup(api, archive, work) {
  const remote = '/tmp/restorelab-taskwork.dump';
  await docker(['cp', archive, api.container + ':' + remote]);
  const toc = await api.pg('pg_restore', ['--list', remote]);
  // Supabase already owns the auth schema. Only restore the synthetic accounts and identities.
  const lines = toc.split('\n');
  const users = lines.find((line) => / TABLE DATA auth users /.test(line));
  const identities = lines.find((line) => / TABLE DATA auth identities /.test(line));
  if (!users || !identities) throw new Error('The archive is missing synthetic Auth data.');
  const selected = lines.flatMap((line) => {
    if (line === identities) return [users, identities];
    if (line.startsWith(';')) return [line];
    // The fresh Supabase stack already initialized its platform-owned defaults.
    if (/ DEFAULT ACL public .* supabase_admin$/.test(line)) return [];
    return / auth(?: |$)| SCHEMA - (?:auth|public)(?: |$)| (?:ACL|COMMENT) - SCHEMA (?:auth|public)(?: |$)/.test(line)
      ? [] : [line];
  });
  const path = join(work, 'restore.list');
  await writeFile(path, selected.join('\n') + '\n');
  await docker(['cp', path, api.container + ':/tmp/restorelab-taskwork.list']);
  await api.pg('pg_restore', ['-U', 'postgres', '-d', 'postgres', '--exit-on-error', '--single-transaction',
    '--no-owner', '--use-list=/tmp/restorelab-taskwork.list', remote]);
  await api.sql(['-c', "NOTIFY pgrst, 'reload schema'"]);
}

function observed(label, expected, result, values, status = 200) {
  return { label, expected, observed: values, httpStatus: result.status,
    passed: result.status === status && JSON.stringify(expected) === JSON.stringify(values) };
}

async function verify(api, accounts, boraColumn) {
  const ayseLogin = await login(api, accounts[0]);
  const boraLogin = await login(api, accounts[1]);
  const checkLogin = (label, response) => observed(label, ['oturum açıldı'], response,
    response.body.access_token ? ['oturum açıldı'] : []);
  const checks = [checkLogin('Ayşe oturum açabiliyor', ayseLogin), checkLogin('Bora oturum açabiliyor', boraLogin)];
  if (!checks.every((check) => check.passed)) return checks;
  const ayse = await readCards(api, ayseLogin.body.access_token);
  const bora = await readCards(api, boraLogin.body.access_token);
  checks.push(observed('Ayşe yalnız kendi görevini görüyor', ['ayse-task'], ayse, titles(ayse)),
    observed('Bora yalnız kendi görevini görüyor', ['bora-task'], bora, titles(bora)));
  const created = await post(api, '/rest/v1/cards',
    { id: randomUUID(), column_id: boraColumn, title: 'bora-new-task' }, boraLogin.body.access_token);
  checks.push(observed('Bora yeni görev yazabiliyor', ['bora-new-task'], created, titles(created), 201));
  const reread = await readCards(api, boraLogin.body.access_token);
  checks.push(observed('Yeni görev yeniden okunabiliyor', ['bora-new-task', 'bora-task'], reread, titles(reread)));
  return checks;
}

async function main() {
  const repository = process.argv[2];
  if (!repository) throw new Error('Usage: node examples/taskwork.mjs <local TaskWork repository>');
  const git = async (args) => (await exec('git', ['-C', resolve(repository), ...args])).stdout.trim();
  const revision = await git(['rev-parse', 'HEAD']);
  const state = resolve(process.env.RESTORELAB_STATE ?? join(homedir(), '.local', 'state', 'restorelab'));
  const port = Number(process.env.RESTORELAB_SUPABASE_PORT ?? 56321);
  if (!Number.isInteger(port) || port < 1025 || port > 65526) throw new Error('Invalid Supabase port.');
  const work = await mkdtemp('/tmp/restorelab-taskwork-');
  const archive = join(work, 'taskwork-synthetic.dump');
  const accounts = ['ayse', 'bora'].map((name) => ({ email: name + '@restorelab.test',
    password: randomBytes(24).toString('base64url') }));
  try {
    const schema = join(work, 'schema.sql');
    const schemaSQL = await git(['show', revision + ':supabase/schema.sql']);
    await writeFile(schema, schemaSQL);
    const boraColumn = await withSupabase(port, async (api) => {
      const input = await open(schema);
      try { await api.sql([], { input: input.fd }); }
      finally { await input.close(); }
      await api.sql(['-c', "NOTIFY pgrst, 'reload schema'"]);
      await seed(api, accounts[0], 'ayse-task');
      const column = await seed(api, accounts[1], 'bora-task');
      await createBackup(api, archive);
      return column;
    });
    const profile = {
      id: 'taskwork', title: 'TaskWork', applicationVersion: revision.slice(0, 7), suiteVersion: 'supabase-schema-v1',
      backup: archive, backupAt: new Date().toISOString(),
      exercise: ({ restoreBackup: measureRestore }) => withSupabase(port, async (api) => {
        try {
          await measureRestore((snapshot) => restoreBackup(api, snapshot, work));
          return verify(api, accounts, boraColumn);
        } catch (error) {
          console.error('Target drill:', error.message);
          throw error;
        }
      }),
    };
    const record = await runDrill(profile, state);
    console.log(JSON.stringify({ id: record.id, restore: record.restore, status: record.status, checks: record.checks }));
    if (record.status !== 'passed') process.exitCode = 1;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  // Do not echo CLI output or secrets from Supabase in reports.
  console.error(error.code ? `TaskWork drill command failed (${error.code}).` : error.message);
  process.exitCode = 1;
});
