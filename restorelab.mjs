import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describeFailure } from './src/diagnostics.mjs';
import { runDemo } from './src/drill.mjs';
import { runDrill } from './src/history.mjs';
import { servePanel } from './src/panel.mjs';
import { renderReport } from './src/report.mjs';

const state = resolve(process.env.RESTORELAB_STATE ?? join(homedir(), '.local', 'state', 'restorelab'));
const [, , command, argument, option, ...extra] = process.argv;
const interruption = new AbortController();
const profile = async (path) => (await import(pathToFileURL(resolve(path)).href)).default;

if (command === 'demo' || command === 'drill') {
  for (const name of ['SIGINT', 'SIGTERM']) {
    process.on(name, () => interruption.abort(new Error('Tatbikat kesildi.')));
  }
}

try {
  if (command === 'demo' && !extra.length && [undefined, '--docker'].includes(option)) {
    const report = await runDemo(interruption.signal, { dockerState: option === '--docker' ? state : undefined });
    const output = resolve(argument ?? 'out');
    await mkdir(output, { recursive: true, mode: 0o700 });
    const write = (file, data) => writeFile(join(output, file), data, { mode: 0o600, flag: 'wx' });
    await write('report.json', JSON.stringify(report, null, 2) + '\n');
    await write('index.html', renderReport(report));
    await write('index.en.html', renderReport(report, { lang: 'en' }));
    console.log(join(output, 'index.html'));

    const [restricted, permissive] = report.runs;
    const expectedChecks = [true, true, false, true];
    const exposed = permissive.checks[2];
    const expectedFailure = exposed?.httpStatus === 200 && exposed.observed.includes('ayse-task') &&
      permissive.checks.every((check, index) => check.passed === expectedChecks[index]);
    if (restricted.status !== 'passed' || !expectedFailure) process.exitCode = 1;
  } else if (command === 'drill' && argument && !option) {
    const report = await runDrill(await profile(argument), state, interruption.signal);
    console.log(`${report.id} · ${report.status}${report.failure ? ` · ${report.failure}` : ''}`);
    if (report.status !== 'passed') {
      const diagnostic = describeFailure(report, process.env.RESTORELAB_LANG);
      if (diagnostic) console.error(diagnostic);
      process.exitCode = 1;
    }
  } else if (command === 'serve' && argument && !extra.length) {
    const port = Number(option ?? 4782);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Geçersiz port.');
    const selected = await profile(argument);
    const server = servePanel(Array.isArray(selected) ? selected : [selected], state, port, process.env.RESTORELAB_LANG ?? 'tr');
    server.once('listening', () => console.log(`http://127.0.0.1:${server.address().port}/`));
    server.once('error', (error) => { console.error(error.message); process.exitCode = 1; });
  } else {
    console.error('Kullanım: node restorelab.mjs demo [dizin] [--docker] | drill <profil.mjs> | serve <profil.mjs> [port]');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
