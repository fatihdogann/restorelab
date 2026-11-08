import { createServer } from 'node:http';
import { loadHistory, summarize, validateIdentity } from './history.mjs';
import { escapeHtml, htmlPage, renderReport } from './report.mjs';

export function servePanel(profiles, state, port) {
  for (const profile of profiles) validateIdentity(profile);
  const server = createServer(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      });
      response.end(body);
    };
    if (request.headers.host !== `127.0.0.1:${server.address().port}`) return send(403, 'Forbidden');
    if (request.method !== 'GET') return send(405, 'Method not allowed');
    try {
      const history = await loadHistory(state);
      const route = /^\/runs\/([a-f0-9-]{36})$/.exec(request.url);
      if (route) {
        const run = history.find((row) => row.id === route[1] &&
          profiles.some((profile) => profile.id === row.project));
        return run ? send(200, renderReport({ recordedAt: run.recordedAt, runs: [run] }, { live: true })) : send(404, 'Rapor bulunamadı.');
      }
      if (request.url !== '/') return send(404, 'Sayfa bulunamadı.');
      return send(200, renderPanel(profiles, history));
    } catch {
      return send(500, 'Tatbikat geçmişi okunamadı.');
    }
  });
  return server.listen(port, '127.0.0.1');
}

const when = (date) => new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC',
}).format(new Date(date)) + ' UTC';

function runLink(run) {
  if (!run) return '<span class="muted">Kayıt yok</span>';
  const passed = run.status === 'passed';
  return `<a class="run-link" href="/runs/${escapeHtml(run.id)}">${escapeHtml(run.backup)}</a>
    <span class="${passed ? 'pass' : 'fail'}">${passed ? 'Geçti' : 'Başarısız'}</span>`;
}

export function renderPanel(profiles, history) {
  const cards = profiles.map((profile) => {
    const { latest, lastPassing } = summarize(history, profile);
    const recent = history.filter((run) => run.project === profile.id)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 20);
    return `<section class="panel-project">
      <header class="run-heading"><div><h2>${escapeHtml(profile.title)}</h2>
      <p class="muted">Uygulama ${escapeHtml(profile.applicationVersion)} · Test paketi ${escapeHtml(profile.suiteVersion)}</p></div></header>
      <dl class="backup-summary">
        <div><dt>Denemeye alınan en yeni yedek</dt><dd>${runLink(latest)}</dd></div>
        <div><dt>Testleri geçen en yeni yedek</dt><dd>${runLink(lastPassing)}</dd></div>
      </dl>
      <h3 class="history-heading">Tatbikat geçmişi</h3>
      ${recent.length ? `<ul class="checks">${recent.map((run) => `<li class="history-row">
        <div>${runLink(run)}<p class="muted">${escapeHtml(run.applicationVersion)} · ${escapeHtml(run.suiteVersion)}</p></div>
        <time datetime="${escapeHtml(run.recordedAt)}">${when(run.recordedAt)}</time>
      </li>`).join('')}</ul>` : '<p class="empty">İlk tatbikat henüz çalıştırılmadı.</p>'}
    </section>`;
  }).join('');
  return htmlPage('tr', 'Tatbikatlar', 'Yerel panel',
    `<div class="intro"><div><h1>Tatbikatlar</h1><p>Geri yüklenen yedekler ve uygulama testlerinin sonuçları.</p></div></div>${cards}`);
}
