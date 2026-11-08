import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function withFixturePostgres(use) {
  // A short socket path avoids the Unix socket path limit on macOS.
  const root = await mkdtemp('/tmp/restorelab-');
  const data = join(root, 'data');
  const env = { PATH: process.env.PATH, LC_ALL: 'C' };
  const run = (command, args) => exec(command, args, { env, timeout: 35_000 });
  const connection = (role = 'restorelab') => ['-h', root, '-p', '5432', '-U', role, '-d', 'postgres'];
  const psql = (args, role) => run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atq', ...connection(role), ...args]);

  try {
    await run('initdb', ['-D', data, '-U', 'restorelab', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    await run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-w', '-t', '20', '-o',
      `-k ${root} -c listen_addresses='' -c unix_socket_permissions=0700 -c max_connections=12`, 'start']);
    await psql(['-c', 'CREATE ROLE ayse LOGIN; CREATE ROLE bora LOGIN;']);
    return await use({
      psql,
      dump: (file) => run('pg_dump', [...connection(), '-Fc', '-f', file]),
      restore: (file) => run('pg_restore', [...connection(), '--exit-on-error', '--single-transaction', file]),
    });
  } finally {
    if (existsSync(join(data, 'postmaster.pid'))) {
      await run('pg_ctl', ['-D', data, '-w', '-t', '20', '-m', 'fast', 'stop']);
    }
    await rm(root, { recursive: true, force: true });
  }
}
