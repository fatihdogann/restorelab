import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./report.css', import.meta.url), 'utf8');
const text = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const duration = new Intl.NumberFormat('tr-TR');
const date = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const path = (passed) => passed ? '<path d="m5 12 4 4 10-10"/>' : '<path d="m7 7 10 10M17 7 7 17"/>';
const icon = (passed) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path(passed)}</svg>`;
const mark = '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="7" rx="11" ry="4"/><path d="M5 7v17c0 2.2 4.9 4 11 4s11-1.8 11-4V7M5 15c0 2.2 4.9 4 11 4s11-1.8 11-4"/></svg>';

function renderRun(run, index) {
  const passed = run.status === 'passed';
  const rows = run.checks.map((check) => `
    <li class="check">
      <span class="status-icon ${check.passed ? 'pass' : 'fail'}">${icon(check.passed)}<span class="visually-hidden">${check.passed ? 'Geçti' : 'Başarısız'}</span></span>
      <div>
        <h3>${text(check.label)}</h3>
        <dl><div><dt>Beklenen</dt><dd>${text(check.expected.join(', '))}${check.expectation === 'includes' ? ' görünür' : ''}</dd></div>
        <div><dt>Gözlenen</dt><dd>${text(check.observed.join(', ') || 'Boş')}</dd></div></dl>
      </div>
      <span class="http">HTTP ${text(check.httpStatus)}</span>
    </li>`).join('');
  return `
    <article id="run-${index}" aria-labelledby="title-${index}">
      <div class="run-heading">
        <div>
          <code>${text(run.backup)}</code>
          <h2 id="title-${index}" class="${passed ? 'pass' : 'fail'}">${passed ? 'Uygulama testleri geçti' : 'Uygulama testi başarısız'}</h2>
        </div>
        <span class="duration">${duration.format(run.restoreMs)} ms</span>
      </div>
      <div class="restore"><span class="status-icon pass">${icon(true)}</span> PostgreSQL yedeği geri yüklendi</div>
      <ul class="checks">${rows}</ul>
    </article>`;
}

export function renderReport(report) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>RestoreLab · Kurtarma raporu</title>
<style>${css}</style>
</head>
<body>
<header class="shell masthead"><span class="brand">${mark} RestoreLab</span><span class="sample">Sentetik örnek</span></header>
<main class="shell">
  <div class="intro">
    <div><h1>Kurtarma raporu</h1><p>Görev uygulaması · PostgreSQL · İki kullanıcıyla erişim kontrolü</p></div>
    <time datetime="${text(report.recordedAt)}">${date.format(new Date(report.recordedAt))} UTC</time>
  </div>
  <nav aria-label="Tatbikatlar">${report.runs.map((run, index) =>
    `<a href="#run-${index}">${text(run.backup)} <span class="${run.status === 'passed' ? 'pass' : 'fail'}">${run.status === 'passed' ? 'Geçti' : 'Başarısız'}</span></a>`).join('')}</nav>
  <div class="runs">${report.runs.map(renderRun).join('')}</div>
</main>
</body>
</html>`;
}
