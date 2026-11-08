import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';

export function docker(args, { input, output, timeout = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: [input ?? 'ignore', output ?? 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk) => { stdout = (stdout + chunk).slice(-1024 * 1024); });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr = (stderr + chunk).slice(-16_384); });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Docker exited with ${signal ?? code}.`));
    });
  });
}

export async function withDockerPostgres(image, use) {
  if (typeof image !== 'string' || !/^[a-z0-9][a-z0-9._/:@-]*$/i.test(image)) {
    throw new Error('Invalid PostgreSQL Docker image.');
  }
  const name = 'restorelab-' + randomUUID();
  let error;
  try {
    await docker(['run', '--detach', '--name', name, '--network', 'none',
      '--security-opt', 'no-new-privileges', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
    const exec = (args, options) => docker(['exec', ...(options?.input === undefined ? [] : ['-i']), name, ...args], options);
    const deadline = Date.now() + 30_000;
    while (true) {
      try {
        // The entrypoint briefly starts a different server during initialization.
        await exec(['pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres'], { timeout: 4_000 });
        break;
      } catch (failure) {
        if (Date.now() >= deadline) throw failure;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
    return await use({
      async psql(args, role = 'postgres') {
        const stdout = await exec(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-Atq', '-U', role, '-d', 'postgres', ...args]);
        return { stdout };
      },
      async dump(archive) {
        const file = await open(archive, 'wx', 0o600);
        try {
          await exec(['pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc'], { output: file.fd });
        } finally {
          await file.close();
        }
      },
      async restore(archive, { skipOwnershipAndGrants = false } = {}) {
        await docker(['cp', archive, name + ':/tmp/restorelab.dump']);
        const metadata = skipOwnershipAndGrants ? ['--no-owner', '--no-privileges'] : [];
        await exec(['pg_restore', '--exit-on-error', '--single-transaction',
          ...metadata, '-U', 'postgres', '-d', 'postgres', '/tmp/restorelab.dump']);
      },
    });
  } catch (failure) {
    error = failure;
    throw failure;
  } finally {
    try {
      await docker(['rm', '--force', '--volumes', name], { timeout: 15_000 });
    } catch (failure) {
      if (!error || !failure.message.includes('No such container')) throw failure;
    }
  }
}
