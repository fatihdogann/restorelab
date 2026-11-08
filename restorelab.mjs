import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runDemo } from './src/drill.mjs';
import { renderReport } from './src/report.mjs';

const [, , command, directory = 'out', extra] = process.argv;
if (command !== 'demo' || extra !== undefined) {
  console.error('Kullanım: node restorelab.mjs demo [çıktı-dizini]');
  process.exitCode = 2;
} else {
  const interruption = new AbortController();
  for (const name of ['SIGINT', 'SIGTERM']) {
    process.on(name, () => interruption.abort(new Error('Tatbikat kesildi.')));
  }
  try {
    const report = await runDemo(interruption.signal);
    const output = resolve(directory);
    await mkdir(output, { recursive: true, mode: 0o700 });
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await writeFile(join(output, 'index.html'), renderReport(report), { mode: 0o600, flag: 'wx' });
    console.log(join(output, 'index.html'));
    const [restricted, permissive] = report.runs;
    const expectedChecks = [true, true, false, true];
    const exposed = permissive.checks[2];
    const expectedFailure = exposed.httpStatus === 200 && exposed.observed.includes('ayse-task') &&
      permissive.checks.every((check, index) => check.passed === expectedChecks[index]);
    if (restricted.status !== 'passed' || !expectedFailure) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
