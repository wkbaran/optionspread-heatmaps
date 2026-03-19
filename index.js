#!/usr/bin/env node

const fs   = require('fs');
const path = require('path');
const wiScript = fs.readFileSync(path.join(__dirname, 'whatif.js'), 'utf8');

const csvFile = process.argv[2];
if (!csvFile) {
  console.error('Usage: node index.js <csv-file>');
  process.exit(1);
}

// ── CSV Parsing ──────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Row layout (from header row 1):
// 0:Name  1:Total Return %  2:Total Return $  3:Created At  4:Expiration
// 5:Net Debit/Credit  6:Chance  7:Max Loss  8:Max Profit  9:High  10:Low
// 11:Delta  12:Theta  13:Gamma  14:Vega  15:Rho  16:IV  17:Link  18:Group
//
// Leg rows start with "." — skip them.
function loadSpreads(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const spreads = [];
  for (let i = 2; i < lines.length; i++) {
    const v = parseCSVLine(lines[i]);
    if (!v[0] || v[0].startsWith('.')) continue;
    if (!v[0].toLowerCase().includes('spread')) continue;
    spreads.push({
      name:       v[0],
      underlying: v[0].split(' ')[0],
      expiration: v[4],
      delta:      parseFloat(v[11]) || 0,
      gamma:      parseFloat(v[13]) || 0,
    });
  }
  return spreads;
}

// ── Color Scale ──────────────────────────────────────────────────────────────

// Diverging: negative → red, zero → light gray, positive → green
function heatColor(value, absMax) {
  if (absMax === 0) return '#e0e0e0';
  const t = Math.max(-1, Math.min(1, value / absMax));
  if (t < 0) {
    const i = -t;
    return `rgb(${Math.round(220 + 35 * i)},${Math.round(220 - 180 * i)},${Math.round(220 - 180 * i)})`;
  } else {
    const i = t;
    return `rgb(${Math.round(220 - 180 * i)},${Math.round(185 + 35 * i)},${Math.round(220 - 180 * i)})`;
  }
}

function textColor(value, absMax) {
  return absMax > 0 && Math.abs(value) / absMax > 0.55 ? '#fff' : '#111';
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtExp(exp) {
  return new Date(exp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function label(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// ── Heatmap 1 & 2: Individual positions, sorted by value ────────────────────

function individualHeatmap(spreads, key, title, showTotal = false) {
  const sorted = [...spreads].sort((a, b) => b[key] - a[key]);
  const vals = sorted.map(s => s[key]);
  const absMax = Math.max(...vals.map(Math.abs), 1e-9);

  const rows = sorted.map(s => {
    const val = s[key];
    const bg  = heatColor(val, absMax);
    const fg  = textColor(val, absMax);
    return `<tr style="background:${bg};color:${fg}">
      <td class="sym">${s.underlying}</td>
      <td class="exp">${fmtExp(s.expiration)}</td>
      <td class="pos">${s.name}</td>
      <td class="val">${val.toFixed(4)}</td>
    </tr>`;
  }).join('\n');

  let totalRow = '';
  if (showTotal) {
    const total = vals.reduce((a, b) => a + b, 0);
    const bg = heatColor(total, absMax);
    const fg = textColor(total, absMax);
    totalRow = `<tr class="total-row" style="background:${bg};color:${fg}">
      <td class="sym" colspan="3">TOTAL</td>
      <td class="val">${total.toFixed(4)}</td>
    </tr>`;
  }

  return `
<section data-section="${key}-individual">
  <h2>${title}</h2>
  <div class="legend">
    <span class="leg-neg">Negative</span>
    <div class="leg-grad"></div>
    <span class="leg-pos">Positive</span>
    <span class="leg-range">&nbsp;range: ${Math.min(...vals).toFixed(4)} &rarr; ${Math.max(...vals).toFixed(4)}</span>
  </div>
  <table>
    <thead><tr><th>Symbol</th><th>Expiry</th><th>Position</th><th>${label(key)}</th></tr></thead>
    <tbody>${rows}${totalRow}</tbody>
  </table>
</section>`;
}

// ── Heatmap 3 & 4: Summed by underlying × expiration ────────────────────────

function combinedHeatmap(spreads, key, title, showTotal = false) {
  const underlyings = [...new Set(spreads.map(s => s.underlying))].sort();
  const expirations = [...new Set(spreads.map(s => s.expiration))]
    .sort((a, b) => new Date(a) - new Date(b));

  const grid = {};
  for (const s of spreads) {
    const k = `${s.underlying}||${s.expiration}`;
    grid[k] = (grid[k] || 0) + s[key];
  }

  const allVals = Object.values(grid);
  const absMax = Math.max(...allVals.map(Math.abs), 1e-9);

  // Per-expiration totals for the Total column
  const expTotals = {};
  for (const s of spreads) {
    expTotals[s.expiration] = (expTotals[s.expiration] || 0) + s[key];
  }
  const grandTotal = spreads.reduce((a, s) => a + s[key], 0);

  const totalAbsMax = showTotal
    ? Math.max(absMax, ...Object.values(expTotals).map(Math.abs), 1e-9)
    : absMax;

  const headerCells = expirations.map(e => `<th data-exp="${e}">${fmtExp(e)}</th>`).join('');
  const totalHeader = showTotal ? '<th class="total-col">Total</th>' : '';

  const bodyRows = underlyings.map(u => {
    const cells = expirations.map(e => {
      const k = `${u}||${e}`;
      if (k in grid) {
        const val = grid[k];
        const bg  = heatColor(val, absMax);
        const fg  = textColor(val, absMax);
        return `<td style="background:${bg};color:${fg}" title="${u} ${fmtExp(e)}: ${val.toFixed(4)}">${val.toFixed(2)}</td>`;
      }
      return '<td class="empty"></td>';
    }).join('');

    let totalCell = '';
    if (showTotal) {
      const rowTotal = expirations.reduce((a, e) => a + (grid[`${u}||${e}`] || 0), 0);
      const bg = heatColor(rowTotal, totalAbsMax);
      const fg = textColor(rowTotal, totalAbsMax);
      totalCell = `<td class="total-col" style="background:${bg};color:${fg}" title="${u} total: ${rowTotal.toFixed(4)}">${rowTotal.toFixed(2)}</td>`;
    }

    return `<tr><td class="sym">${u}</td>${cells}${totalCell}</tr>`;
  }).join('\n');

  let totalFooterRow = '';
  if (showTotal) {
    const footerCells = expirations.map(e => {
      const val = expTotals[e] || 0;
      const bg = heatColor(val, totalAbsMax);
      const fg = textColor(val, totalAbsMax);
      return `<td class="total-row" style="background:${bg};color:${fg}">${val.toFixed(2)}</td>`;
    }).join('');
    const gtBg = heatColor(grandTotal, totalAbsMax);
    const gtFg = textColor(grandTotal, totalAbsMax);
    totalFooterRow = `<tr>
      <td class="sym total-row">TOTAL</td>${footerCells}
      <td class="total-col total-row" style="background:${gtBg};color:${gtFg}">${grandTotal.toFixed(2)}</td>
    </tr>`;
  }

  return `
<section data-section="${key}-combined">
  <h2>${title}</h2>
  <div class="legend">
    <span class="leg-neg">Negative</span>
    <div class="leg-grad"></div>
    <span class="leg-pos">Positive</span>
    <span class="leg-range">&nbsp;range: ${Math.min(...allVals).toFixed(4)} &rarr; ${Math.max(...allVals).toFixed(4)}</span>
  </div>
  <table>
    <thead><tr><th>Symbol</th>${headerCells}${totalHeader}</tr></thead>
    <tbody>${bodyRows}${totalFooterRow}</tbody>
  </table>
</section>`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const spreads = loadSpreads(csvFile);
if (!spreads.length) { console.error('No spread rows found in', csvFile); process.exit(1); }
console.log(`Parsed ${spreads.length} spread positions from ${path.basename(csvFile)}`);

const basename = path.basename(csvFile, '.csv');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Heatmaps — ${basename}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      padding: 28px 24px;
      line-height: 1.4;
    }
    h1 {
      font-size: 1.3rem;
      font-weight: 600;
      color: #e6edf3;
      text-align: center;
      margin-bottom: 36px;
      letter-spacing: .03em;
    }
    h2 {
      font-size: .78rem;
      color: #8b949e;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: .1em;
      font-weight: 600;
    }
    section {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 20px 22px;
      margin-bottom: 32px;
      overflow-x: auto;
    }
    table {
      border-collapse: collapse;
      font-size: 12px;
      min-width: 100%;
    }
    th {
      background: #21262d;
      color: #8b949e;
      padding: 7px 14px;
      text-align: left;
      border: 1px solid #30363d;
      white-space: nowrap;
      font-weight: 600;
      letter-spacing: .04em;
      font-size: 11px;
    }
    td {
      padding: 5px 14px;
      border: 1px solid #21262d;
      white-space: nowrap;
      transition: filter .1s;
    }
    tr:hover td { filter: brightness(1.12); }
    td.sym  { font-weight: 700; font-size: 13px; min-width: 70px; }
    td.exp  { font-size: 11px; min-width: 80px; }
    td.pos  { max-width: 340px; overflow: hidden; text-overflow: ellipsis; }
    td.val  { text-align: right; font-family: 'Cascadia Code', 'Fira Mono', monospace; font-weight: 600; min-width: 80px; }
    td.empty { background: #0d1117; min-width: 70px; }
    .legend {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #8b949e;
      margin-bottom: 10px;
    }
    .leg-grad {
      width: 100px;
      height: 12px;
      background: linear-gradient(to right, rgb(255,40,40), #ddd, rgb(40,220,40));
      border-radius: 2px;
    }
    .leg-neg { color: rgb(255,120,120); font-weight: 600; }
    .leg-pos { color: rgb(80,210,80);   font-weight: 600; }
    .leg-range { color: #555; }
    td.total-row, td.total-col { font-weight: 700; border-top: 2px solid #58a6ff; text-align: right; }
    td.total-col { border-left: 2px solid #58a6ff; }
    /* ── What-if panel ── */
    #wi-panel { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 18px; margin-bottom: 28px; }
    #wi-pills-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    #wi-pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .wi-pill { display: inline-flex; align-items: center; gap: 5px; background: var(--wi-bg); border: 1px solid var(--wi-accent); border-radius: 20px; padding: 3px 8px 3px 11px; font-size: 11px; color: var(--wi-accent); font-weight: 600; }
    .wi-pill button { background: none; border: none; color: var(--wi-accent); cursor: pointer; font-size: 15px; line-height: 1; padding: 0 2px; opacity: .7; }
    .wi-pill button:hover { opacity: 1; }
    #wi-row { display: flex; gap: 8px; }
    #wi-input { flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-family: 'Cascadia Code', 'Fira Mono', monospace; font-size: 12px; padding: 7px 12px; outline: none; transition: border-color .15s; }
    #wi-input:focus { border-color: #58a6ff; }
    #wi-btn { background: #58a6ff; border: none; border-radius: 6px; color: #0d1117; cursor: pointer; font-size: 12px; font-weight: 700; padding: 7px 16px; letter-spacing: .04em; transition: background .15s; }
    #wi-btn:hover { background: #79b8ff; }
    #wi-hint { font-size: 10px; color: #555; margin-top: 7px; }
    tr.wi-row { --wi-accent: #58a6ff; --wi-bg: rgba(88,166,255,.10); }
    tr.wi-row td { border-top-color: var(--wi-accent) !important; border-bottom-color: var(--wi-accent) !important; }
    tr.wi-row td:first-child { border-left: 2px solid var(--wi-accent) !important; }
    tr.wi-row td:last-child  { border-right: 2px solid var(--wi-accent) !important; }
    tr.wi-row:hover td { filter: brightness(1.15); }
  </style>
</head>
<body>
<h1>Options Spread Heatmaps &mdash; ${basename}</h1>
<div id="wi-panel">
  <div id="wi-pills-wrap" style="display:none"><div id="wi-pills"></div></div>
  <div id="wi-row">
    <input id="wi-input" type="text" placeholder="Paste a spread CSV row to model it as a what-if…" spellcheck="false" autocomplete="off" />
    <button id="wi-btn">Add</button>
  </div>
  <p id="wi-hint">Paste a spread row from the exported CSV. Press Enter or click Add. Each spread appears as a pill above and is highlighted in every table below.</p>
</div>
${individualHeatmap(spreads, 'delta', 'Position Deltas — Individual', true)}
${individualHeatmap(spreads, 'gamma', 'Position Gammas — Individual')}
${combinedHeatmap(spreads, 'delta', 'Combined Delta by Underlying × Expiration', true)}
${combinedHeatmap(spreads, 'gamma', 'Combined Gamma by Underlying × Expiration')}
<script>${wiScript}</script>
</body>
</html>`;

const reportsDir = path.join(__dirname, 'reports');
fs.mkdirSync(reportsDir, { recursive: true });
const outFile = path.join(reportsDir, basename + '-heatmaps.html');
fs.writeFileSync(outFile, html);
console.log(`Wrote → ${outFile}`);
require('./generate-index')();
