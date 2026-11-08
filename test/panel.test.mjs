import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { runDrill } from '../src/history.mjs';
import { servePanel } from '../src/panel.mjs';

test('the loopback panel exposes only the selected project and escapes report observations', async () => {
  const state = await mkdtemp('/tmp/restorelab-panel-');
  const profile = { id: 'demo', title: 'Demo', applicationVersion: 'v1', suiteVersion: 'v1' };
  const server = servePanel([profile], state, 0);
  try {
    await once(server, 'listening');
    const url = 'http://127.0.0.1:' + server.address().port;
    assert.match(await (await fetch(url)).text(), /İlk tatbikat henüz çalıştırılmadı/);
    const backup = join(state, 'synthetic.dump');
    await writeFile(backup, 'dummy archive');
    const options = { ...profile, backup, backupAt: '2026-11-08T00:00:00Z', async exercise({ restoreBackup }) {
      await restoreBackup(async () => {});
      return [{ label: 'Safe display', expected: ['expected'], observed: ['<script>test</script>'], passed: false }];
    } };
    const run = await runDrill(options, state);
    const other = await runDrill({ ...options, id: 'other' }, state);
    const index = await (await fetch(url)).text();
    assert.match(index, /Testleri geçen en yeni yedek/);
    assert.ok(index.includes('/runs/' + run.id));
    const response = await fetch(url + '/runs/' + run.id);
    assert.equal(response.status, 200);
    const detail = await response.text();
    assert.match(detail, /&lt;script&gt;test&lt;\/script&gt;/);
    assert.doesNotMatch(detail, /<script>/);
    assert.equal((await fetch(url + '/runs/' + other.id)).status, 404);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(state, { recursive: true, force: true });
  }
});

test('the English panel localizes the overview and the drill report', async () => {
  const state = await mkdtemp('/tmp/restorelab-panel-en-');
  const profile = { id: 'demo', title: 'Demo', applicationVersion: 'v1', suiteVersion: 'v1' };
  const server = servePanel([profile], state, 0, 'en');
  try {
    await once(server, 'listening');
    const url = 'http://127.0.0.1:' + server.address().port;
    const overview = await (await fetch(url)).text();
    assert.match(overview, /<html lang="en">/);
    assert.match(overview, /Newest passing backup/);
    const backup = join(state, 'synthetic.dump');
    await writeFile(backup, 'dummy archive');
    const run = await runDrill({
      ...profile, backup, backupAt: '2026-11-08T00:00:00Z',
      async exercise({ restoreBackup }) {
        await restoreBackup(async () => {});
        return [{ label: 'Kontrol', english: 'Check', expected: ['ok'], observed: ['ok'], passed: true }];
      },
    }, state);
    const detail = await (await fetch(url + '/runs/' + run.id)).text();
    assert.match(detail, /Back to drills/);
    assert.match(detail, /<h3>Check<\/h3>/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(state, { recursive: true, force: true });
  }
});
