'use strict';

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, 'reports');

// "live-active-by-symbol-2026-03-16_14-44" → "Live · Active · 2026-03-16 14:44"
function describe(basename) {
  const m = basename.match(/^(.*?)-(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})$/);
  if (!m) return basename;
  const [, prefix, date, hh, mm] = m;
  const parts = prefix.split('-');
  const group = parts[0][0].toUpperCase() + parts[0].slice(1);
  const type  = parts[1][0].toUpperCase() + parts[1].slice(1);
  return `${group} · ${type} · ${date} ${hh}:${mm}`;
}

// Returns the Monday of the week containing the given YYYY-MM-DD string
function weekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weekLabel(monday) {
  const d = new Date(monday + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const SHARED_STYLE = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      padding: 40px 32px;
      line-height: 1.6;
    }
    h1 {
      font-size: 1.1rem;
      font-weight: 600;
      color: #e6edf3;
      margin-bottom: 28px;
      letter-spacing: .03em;
    }
    a {
      color: #58a6ff;
      text-decoration: none;
      font-weight: 600;
    }
    a:hover { text-decoration: underline; }
    .muted { color: #6e7681; font-size: 12px; }
`;

function generateLanding(latest) {
  const { base, heatmaps, portfolio } = latest;
  const label = describe(base);
  const links = [];
  if (heatmaps)  links.push(`<a href="${heatmaps}">Heatmaps</a>`);
  if (portfolio) links.push(`<a href="${portfolio}">Portfolio</a>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Reports</title>
  <style>${SHARED_STYLE}
    .latest {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 24px 28px;
      max-width: 480px;
    }
    .latest-label {
      font-size: 13px;
      color: #8b949e;
      margin-bottom: 14px;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-weight: 600;
    }
    .latest-title {
      font-size: 15px;
      color: #e6edf3;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .latest-links { display: flex; gap: 20px; }
    .latest-links a {
      font-size: 14px;
      padding: 6px 18px;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 6px;
    }
    .latest-links a:hover { background: #2d333b; text-decoration: none; }
    .archive-link {
      margin-top: 24px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <h1>Reports</h1>
  <div class="latest">
    <div class="latest-label">Most Recent</div>
    <div class="latest-title">${label}</div>
    <div class="latest-links">${links.join('')}</div>
  </div>
  <div class="archive-link"><a href="archive.html">Archive →</a></div>
</body>
</html>`;
}

function generateArchive(sorted) {
  // Group by week
  const weeks = new Map(); // monday ISO → [{base, heatmaps, portfolio}]
  for (const [base, files] of sorted) {
    const m = base.match(/(\d{4}-\d{2}-\d{2})/);
    const monday = m ? weekStart(m[1]) : '0000-00-00';
    if (!weeks.has(monday)) weeks.set(monday, []);
    weeks.get(monday).push({ base, ...files });
  }

  const todayMonday = weekStart(new Date().toISOString().slice(0, 10));

  const sections = [...weeks.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monday, entries]) => {
      const open = monday === todayMonday ? ' open' : '';
      const rows = entries.map(({ base, heatmaps, portfolio }) => {
        const label = describe(base);
        const links = [];
        if (heatmaps)  links.push(`<a href="${heatmaps}">heatmaps</a>`);
        if (portfolio) links.push(`<a href="${portfolio}">portfolio</a>`);
        return `        <li>${label} — ${links.join(' &nbsp; ')}</li>`;
      }).join('\n');
      return `  <details${open}>
    <summary>Week of ${weekLabel(monday)} <span class="muted">(${entries.length})</span></summary>
    <ul>
${rows}
    </ul>
  </details>`;
    }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Reports — Archive</title>
  <style>${SHARED_STYLE}
    details {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 6px;
      margin-bottom: 8px;
      max-width: 640px;
    }
    summary {
      padding: 10px 16px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: #e6edf3;
      user-select: none;
      list-style: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary::before {
      content: '▸ ';
      color: #58a6ff;
      font-size: 11px;
    }
    details[open] > summary::before { content: '▾ '; }
    ul { list-style: none; padding: 0 16px 12px 16px; }
    li {
      padding: 7px 0;
      border-top: 1px solid #21262d;
      font-size: 13px;
    }
    .back { margin-bottom: 24px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Reports — Archive</h1>
  <div class="back"><a href="index.html">← Latest</a></div>
${sorted.length ? sections : '<p class="muted">No reports yet.</p>'}
</body>
</html>`;
}

module.exports = function generateIndex(fileList) {
  const files = (fileList || fs.readdirSync(REPORTS_DIR))
    .filter(f => f.endsWith('.html') && f !== 'index.html' && f !== 'archive.html');

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

  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  if (sorted.length) {
    const [latestBase, latestFiles] = sorted[0];
    fs.writeFileSync(
      path.join(REPORTS_DIR, 'index.html'),
      generateLanding({ base: latestBase, ...latestFiles })
    );
  } else {
    fs.writeFileSync(path.join(REPORTS_DIR, 'index.html'), generateLanding({ base: '', heatmaps: null, portfolio: null }));
  }

  fs.writeFileSync(path.join(REPORTS_DIR, 'archive.html'), generateArchive(sorted));

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
