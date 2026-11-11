import { describeStage } from './diagnostics.mjs';
import { createServer } from 'node:http';
import { loadHistory, summarize, validateIdentity } from './history.mjs';
import { escapeHtml, htmlPage, renderReport } from './report.mjs';

const copy = {
  tr: {
    title: 'Tatbikatlar', badge: 'Yerel panel',
    intro: 'Geri yüklenen yedekler ve uygulama testlerinin sonuçları.',
    app: 'Uygulama', suite: 'Test paketi', latest: 'Denemeye alınan en yeni yedek',
    passing: 'Testleri geçen en yeni yedek', history: 'Tatbikat geçmişi',
    empty: 'İlk tatbikat henüz çalıştırılmadı.', noRun: 'Kayıt yok',
    lastAttempt: 'Son tatbikat', backupAge: 'Son geçen yedeğin yaşı',
    future: 'Yedek tarihi gelecekte', withinHour: 'Bir saatten az', missingReport: 'Rapor bulunamadı.',
    missingPage: 'Sayfa bulunamadı.', loadFailed: 'Tatbikat geçmişi okunamadı.',
  },
  en: {
    title: 'Recovery drills', badge: 'Local dashboard',
    intro: 'Restored backups and the results of application checks.',
    app: 'Application', suite: 'Test suite', latest: 'Newest tested backup',
    passing: 'Newest passing backup', history: 'Drill history',
    empty: 'Run your first drill to see its result.', noRun: 'No runs yet',
    lastAttempt: 'Most recent drill', backupAge: 'Age of the passing backup',
    future: 'Backup date is in the future', withinHour: 'Less than an hour', missingReport: 'Report not found.',
    missingPage: 'Page not found.', loadFailed: 'Could not read drill history.',
  },
};

export function servePanel(profiles, state, port, lang = 'tr') {
  if (lang !== 'tr' && lang !== 'en') throw new Error('RESTORELAB_LANG must be tr or en.');
  const strings = copy[lang];
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
        return run ? send(200, renderReport({ recordedAt: run.recordedAt, runs: [run] }, { live: true, lang })) : send(404, strings.missingReport);
      }
      if (request.url !== '/') return send(404, strings.missingPage);
      return send(200, renderPanel(profiles, history, lang));
    } catch {
      return send(500, strings.loadFailed);
    }
  });
  return server.listen(port, '127.0.0.1');
}

function runLink(run, strings, lang) {
  if (!run) return `<span class="muted">${strings.noRun}</span>`;
  const passed = run.status === 'passed';
  return `<a class="run-link" href="/runs/${escapeHtml(run.id)}">${escapeHtml(run.backup)}</a>
    <span class="${passed ? 'pass' : 'fail'}">${describeStage(run, lang)}</span>`;
}

export function renderPanel(profiles, history, lang = 'tr') {
  const strings = copy[lang];
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC',
  });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  const now = Date.now();
  const cards = profiles.map((profile) => {
    const { latest, lastPassing } = summarize(history, profile);
    const recent = history.filter((run) => run.project === profile.id)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    const lastAttempt = recent.find(run => run.applicationVersion === profile.applicationVersion && run.suiteVersion === profile.suiteVersion);
    let age = strings.noRun;
    if (lastPassing) {
      const elapsed = now - Date.parse(lastPassing.backupAt);
      if (elapsed < 0) age = strings.future;
      else if (elapsed < 3_600_000) age = strings.withinHour;
      else if (elapsed < 86_400_000) age = relative.format(-Math.floor(elapsed / 3_600_000), 'hour');
      else age = relative.format(-Math.floor(elapsed / 86_400_000), 'day');
    }
    return `<section class="panel-project">
      <header class="run-heading"><div><h2>${escapeHtml(profile.title)}</h2>
      <p class="muted">${strings.app} ${escapeHtml(profile.applicationVersion)} · ${strings.suite} ${escapeHtml(profile.suiteVersion)}</p></div></header>
      <dl class="backup-summary">
        <div><dt>${strings.latest}</dt><dd>${runLink(latest, strings, lang)}</dd></div>
        <div><dt>${strings.passing}</dt><dd>${runLink(lastPassing, strings, lang)}</dd></div>
        <div><dt>${strings.backupAge}</dt><dd>${age}</dd></div>
        <div><dt>${strings.lastAttempt}</dt><dd>${lastAttempt
          ? `<time datetime="${escapeHtml(lastAttempt.recordedAt)}">${date.format(new Date(lastAttempt.recordedAt))} UTC</time>`
          : strings.noRun}</dd></div>
      </dl>
      <h3 class="history-heading">${strings.history}</h3>
      ${recent.length ? `<ul class="checks">${recent.slice(0, 20).map((run) => `<li class="history-row">
        <div>${runLink(run, strings, lang)}<p class="muted">${escapeHtml(run.applicationVersion)} · ${escapeHtml(run.suiteVersion)}</p></div>
        <time datetime="${escapeHtml(run.recordedAt)}">${date.format(new Date(run.recordedAt))} UTC</time>
      </li>`).join('')}</ul>` : `<p class="empty">${strings.empty}</p>`}
    </section>`;
  }).join('');
  return htmlPage(lang, strings.title, strings.badge,
    `<div class="intro"><div><h1>${strings.title}</h1><p>${strings.intro}</p></div></div>${cards}`);
}
