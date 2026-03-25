'use strict';

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, 'reports');

// "live-active-by-expiration-2026-03-16_14-44" → "Live - Active - as of 2026-03-16 14:44"
function describe(basename) {
  const m = basename.match(/^(.*?)-(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})$/);
  if (!m) return basename;
  const [, prefix, date, hh, mm] = m;
  const parts = prefix.split('-');
  const group = parts[0][0].toUpperCase() + parts[0].slice(1);
  const type  = parts[1][0].toUpperCase() + parts[1].slice(1);
  return `${group} - ${type} - as of ${date} ${hh}:${mm}`;
}

module.exports = function generateIndex(fileList) {
  const files = (fileList || fs.readdirSync(REPORTS_DIR))
    .filter(f => f.endsWith('.html') && f !== 'index.html');

  // Group files by their base key (strip trailing -heatmaps / -portfolio)
  const groups = new Map();
  for (const file of files) {
    const base = file.replace(/-(heatmaps|portfolio)\.html$/, '');
    const type = file.match(/-(heatmaps|portfolio)\.html$/)?.[1];
    if (!type) continue;
    if (!groups.has(base)) groups.set(base, { heatmaps: null, portfolio: null });
    groups.get(base)[type] = file;
  }

  // Sort groups by embedded date descending (most recent first)
  const sorted = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  const rows = sorted.map(([base, { heatmaps, portfolio }]) => {
    const label = describe(base);
    const links = [];
    if (heatmaps) links.push(`<a href="${heatmaps}">heatmaps</a>`);
    if (portfolio) links.push(`<a href="${portfolio}">portfolio</a>`);
    return `    <li>${label} — ${links.join(' &nbsp; ')}</li>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Reports</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      padding: 40px 32px;
      line-height: 1.6;
    }
    h1 {
      font-size: 1.2rem;
      font-weight: 600;
      color: #e6edf3;
      margin-bottom: 24px;
      letter-spacing: .03em;
    }
    ul { list-style: none; }
    li {
      padding: 10px 16px;
      border: 1px solid #21262d;
      border-radius: 6px;
      margin-bottom: 8px;
      background: #161b22;
      font-size: 13px;
    }
    a {
      color: #58a6ff;
      text-decoration: none;
      font-weight: 600;
    }
    a:hover { text-decoration: underline; }
    .empty { color: #6e7681; font-style: italic; }
  </style>
</head>
<body>
<h1>Reports</h1>
${sorted.length ? `<ul>\n${rows}\n</ul>` : '<p class="empty">No reports yet.</p>'}
</body>
</html>`;

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, 'index.html'), html);
  console.log(`Index updated — ${sorted.length} report${sorted.length === 1 ? '' : 's'}`);
};

// CLI: pipe a file list via stdin to generate index from external source (e.g. S3)
//   aws s3 ls s3://bucket/ | awk '{print $4}' | node generate-index.js --stdin
if (require.main === module) {
  if (process.argv.includes('--stdin')) {
    const input = fs.readFileSync('/dev/stdin', 'utf8');
    const files = input.trim().split('\n').filter(Boolean);
    module.exports(files);
  } else {
    module.exports();
  }
}
