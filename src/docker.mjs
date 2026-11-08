import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

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
      async restore(archive) {
        await docker(['cp', archive, name + ':/tmp/restorelab.dump']);
        await exec(['pg_restore', '--exit-on-error', '--single-transaction', '-U', 'postgres', '-d', 'postgres', '/tmp/restorelab.dump']);
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
