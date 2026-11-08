import { readFileSync } from 'node:fs';
import { describeFailure } from './diagnostics.mjs';

const css = readFileSync(new URL('./report.css', import.meta.url), 'utf8');
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const copy = {
  tr: {
    title: 'Kurtarma raporu', demo: 'Sentetik örnek', live: 'Tatbikat kaydı',
    intro: 'Görev uygulaması · PostgreSQL · İki kullanıcıyla erişim kontrolü',
    pass: 'Geçti', fail: 'Başarısız', passed: 'Uygulama testleri geçti',
    failed: 'Uygulama testi başarısız', expected: 'Beklenen', observed: 'Gözlenen',
    empty: 'Boş', visible: ' görünür', restore: 'PostgreSQL yedeği geri yüklendi',
    restoreFailed: 'Geri yükleme başarısız', notRestored: 'Geri yükleme yapılmadı',
    back: 'Tatbikatlara dön',
    comparison: 'İki yedek açıldı. Biri yetki testini geçemedi.',
    compareLead: 'Bora kendi görevlerini istedi. İki yanıtta da HTTP 200 var; yalnız birinde Ayşe’nin görevi de dönüyor.',
    archive: 'Yedek', response: 'API yanıtı', result: 'Yetki testi', detail: 'Tüm kontroller',
  },
  en: {
    title: 'Recovery report', demo: 'Synthetic example', live: 'Drill record',
    intro: 'Task application · PostgreSQL · Two-user access test',
    pass: 'Passed', fail: 'Failed', passed: 'Application checks passed',
    failed: 'Application check failed', expected: 'Expected', observed: 'Observed',
    empty: 'Empty', visible: ' is visible', restore: 'PostgreSQL backup restored',
    restoreFailed: 'Restore failed', notRestored: 'Restore did not run',
    back: 'Back to drills',
    comparison: 'Both backups restored. One failed the access check.',
    compareLead: 'Bora requested his own tasks. Both responses returned HTTP 200; only one also returned Ayşe’s task.',
    archive: 'Backup', response: 'API response', result: 'Access check', detail: 'All checks',
  },
};
const path = (passed) => passed ? '<path d="m5 12 4 4 10-10"/>' : '<path d="m7 7 10 10M17 7 7 17"/>';
const icon = (passed) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path(passed)}</svg>`;
const mark = '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="7" rx="11" ry="4"/><path d="M5 7v17c0 2.2 4.9 4 11 4s11-1.8 11-4V7M5 15c0 2.2 4.9 4 11 4s11-1.8 11-4"/></svg>';

function renderRun(run, index, lang, strings) {
  const passed = run.status === 'passed';
  const restored = run.restore === 'passed';
  const restoreText = restored ? strings.restore : run.restore === 'failed' ? strings.restoreFailed : strings.notRestored;
  const heading = passed ? strings.passed : restored ? strings.failed : restoreText;
  const diagnostic = run.checks.length ? '' : describeFailure(run, lang);
  const duration = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US');
  const rows = run.checks.map((check) => `
    <li class="check${check.passed ? '' : ' failed-check'}">
      <span class="status-icon ${check.passed ? 'pass' : 'fail'}">${icon(check.passed)}<span class="visually-hidden">${check.passed ? strings.pass : strings.fail}</span></span>
      <div>
        <h3>${escapeHtml(lang === 'en' ? (check.english ?? check.label) : check.label)}</h3>
        <dl><div><dt>${strings.expected}</dt><dd>${escapeHtml(check.expected.join(', '))}${check.expectation === 'includes' ? strings.visible : ''}</dd></div>
        <div><dt>${strings.observed}</dt><dd>${escapeHtml(check.observed.join(', ') || strings.empty)}</dd></div></dl>
      </div>
      ${check.httpStatus ? `<span class="http">HTTP ${escapeHtml(check.httpStatus)}</span>` : ''}
    </li>`).join('');
  return `
    <article id="run-${index}" aria-labelledby="title-${index}">
      <div class="run-heading">
        <div><code>${escapeHtml(run.backup)}</code><h2 id="title-${index}" class="${passed ? 'pass' : 'fail'}">${heading}</h2></div>
        ${run.restoreMs === null ? '' : `<span class="duration">${duration.format(run.restoreMs)} ms</span>`}
      </div>
      <div class="restore"><span class="status-icon ${restored ? 'pass' : 'fail'}">${icon(restored)}</span> ${restoreText}</div>
      ${diagnostic ? `<p class="empty">${escapeHtml(diagnostic)}</p>` : ''}
      ${rows ? `<ul class="checks">${rows}</ul>` : ''}
    </article>`;
}

export function htmlPage(lang, title, badge, body) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>RestoreLab · ${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
<header class="shell masthead"><span class="brand">${mark} RestoreLab</span><span class="sample">${escapeHtml(badge)}</span></header>
<main class="shell">
${body.replace(/[ \t]+$/gm, '')}
</main>
</body>
</html>`;
}

function renderComparison(runs, strings) {
  const checkIndex = runs.find(run => run.status === 'failed')?.checks.findIndex(check => !check.passed) ?? -1;
  if (checkIndex < 0 || runs.some(run => !run.checks[checkIndex])) return '';
  return `<section class="comparison" aria-labelledby="comparison-title">
    <h2 id="comparison-title">${strings.comparison}</h2>
    <p>${strings.compareLead}</p>
    <table>
      <thead><tr><th scope="col">${strings.archive}</th><th scope="col">${strings.response}</th><th scope="col">${strings.result}</th></tr></thead>
      <tbody>${runs.map((run, index) => {
        const check = run.checks[checkIndex];
        return `<tr><th scope="row"><a href="#run-${index}"><code>${escapeHtml(run.backup)}</code></a></th>
          <td><span class="http">HTTP ${escapeHtml(check.httpStatus)}</span> <code>${escapeHtml(check.observed.join(', '))}</code></td>
          <td class="${check.passed ? 'pass' : 'fail'}">${check.passed ? strings.pass : strings.fail}</td></tr>`;
      }).join('')}</tbody>
    </table>
  </section>`;
}

export function renderReport(report, { lang = 'tr', live = false } = {}) {
  const strings = copy[lang];
  const date = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
  });
  const title = live ? report.runs[0].title : strings.title;
  const details = live
    ? `${report.runs[0].applicationVersion} · ${report.runs[0].suiteVersion}` : strings.intro;
  return htmlPage(lang, title, live ? strings.live : strings.demo, `
    ${live ? `<p class="back"><a href="/">${strings.back}</a></p>` : ''}
    <div class="intro">
      <div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(details)}</p></div>
      <time datetime="${escapeHtml(report.recordedAt)}">${date.format(new Date(report.recordedAt))} UTC</time>
    </div>
    ${live ? '' : `${renderComparison(report.runs, strings)}<h2 class="detail-title">${strings.detail}</h2>`}
    <div class="runs${live ? ' single-run' : ''}">${report.runs.map((run, index) => renderRun(run, index, lang, strings)).join('')}</div>`);
}
