#!/usr/bin/env node

const fs       = require('fs');
const path     = require('path');
const wiScript = fs.readFileSync(path.join(__dirname, 'whatif.js'), 'utf8');

const csvFile = process.argv[2];
if (!csvFile) { console.error('Usage: node portfolio.js <csv-file>'); process.exit(1); }

// ── CSV Parsing ──────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}

function parsePct(s)    { return parseFloat((s || '').replace('%', '')) || 0; }
function parseDollar(s) {
  if (!s) return 0;
  const neg = s.includes('(');
  const n   = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
  return neg ? -n : n;
}

// Row layout:
// 0:Name  1:Return%  2:Return$  3:CreatedAt  4:Expiration  5:NetCredit  6:Chance
// 7:MaxLoss  8:MaxProfit  9:High  10:Low  11:Delta  12:Theta  13:Gamma
// 14:Vega  15:Rho  16:IV  17:Link  18:Group
function loadSpreads(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const out   = [];
  for (let i = 2; i < lines.length; i++) {
    const v = parseCSVLine(lines[i]);
    if (!v[0] || v[0].startsWith('.'))               continue;
    if (!v[0].toLowerCase().includes('spread'))      continue;

    const name      = v[0];
    const gamma     = parseFloat(v[13]) || 0;
    const theta     = parseFloat(v[12]) || 0;
    const vega      = parseFloat(v[14]) || 0;
    const chance    = parsePct(v[6]) / 100;
    const maxLoss   = Math.abs(parseDollar(v[7]));
    const maxProfit = Math.abs(parseDollar(v[8]));

    out.push({
      name,
      underlying:      name.split(' ')[0],
      expiration:      v[4],
      type:            name.includes('Bull Put')  ? 'Bull Put'  :
                       name.includes('Bear Call') ? 'Bear Call' : 'Other',
      returnPct:       parsePct(v[1]),
      credit:          Math.abs(parseDollar(v[5])),
      chance,
      maxLoss,
      maxProfit,
      ev:              chance * maxProfit - (1 - chance) * maxLoss,
      delta:           parseFloat(v[11]) || 0,
      theta,
      gamma,
      vega,
      iv:              parsePct(v[16]),
      tgRatio:         gamma !== 0 ? theta / Math.abs(gamma) : null,
      tvRatio:         vega  !== 0 ? theta / Math.abs(vega)  : null,
    });
  }
  return out;
}

// ── Color Scales ─────────────────────────────────────────────────────────────

// negative=red ← gray → green=positive
function cDiverging(v, min, max) {
  const abs = Math.max(Math.abs(min), Math.abs(max), 1e-9);
  const t   = Math.max(-1, Math.min(1, v / abs));
  if (t < 0) { const i = -t; return `rgb(${r(220+35*i)},${r(220-180*i)},${r(220-180*i)})`; }
  else        { const i =  t; return `rgb(${r(220-180*i)},${r(185+35*i)},${r(220-180*i)})`; }
}

// low=light gray → high=saturated green
function cGreen(v, max) {
  const t = Math.max(0, Math.min(1, max > 0 ? v / max : 0));
  return `rgb(${r(230-170*t)},${r(230)},${r(230-170*t)})`;
}

// low=light gray → high=saturated red  (pass Math.abs(value))
function cRed(absV, absMax) {
  const t = Math.max(0, Math.min(1, absMax > 0 ? absV / absMax : 0));
  return `rgb(${r(230+25*t)},${r(230-190*t)},${r(230-190*t)})`;
}

// low=light gray → high=amber
function cAmber(v, max) {
  const t = Math.max(0, Math.min(1, max > 0 ? v / max : 0));
  return `rgb(${r(220+20*t)},${r(220-80*t)},${r(220-200*t)})`;
}

function r(n)      { return Math.round(n); }
function fg(bg)    {
  const m = bg.match(/\d+/g);
  if (!m) return '#111';
  const [rv, g, b] = m.map(Number);
  return (0.299*rv + 0.587*g + 0.114*b) < 140 ? '#fff' : '#111';
}

function fmtExp(exp) {
  return new Date(exp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ── Section 1 & 2: Concentration grids (underlying × expiration) ─────────────

function concentrationGrid(spreads, key, title, colorFn, subtitle) {
  const sectionId = key + '-grid';
  const underlyings = [...new Set(spreads.map(s => s.underlying))].sort();
  const expirations = [...new Set(spreads.map(s => s.expiration))]
    .sort((a, b) => new Date(a) - new Date(b));

  const grid = {};
  for (const s of spreads) {
    const k = `${s.underlying}||${s.expiration}`;
    grid[k] = (grid[k] || 0) + s[key];
  }

  const allVals  = Object.values(grid);
  const gMin     = Math.min(...allVals);
  const gMax     = Math.max(...allVals);
  const gAbsMax  = Math.max(Math.abs(gMin), Math.abs(gMax), 1e-9);

  const headerCells = expirations.map(e => `<th data-exp="${e}">${fmtExp(e)}</th>`).join('');

  const bodyRows = underlyings.map(u => {
    const rowTotal = expirations.reduce((sum, e) => sum + (grid[`${u}||${e}`] || 0), 0);
    const cells    = expirations.map(e => {
      const k = `${u}||${e}`;
      if (!(k in grid)) return '<td class="empty"></td>';
      const val = grid[k];
      const bg  = colorFn(val, gMin, gMax, gAbsMax);
      return `<td style="background:${bg};color:${fg(bg)}" title="${val.toFixed(4)}">${val.toFixed(3)}</td>`;
    }).join('');
    const rtBg = colorFn(rowTotal, gMin, gMax, gAbsMax);
    return `<tr>
      <td class="sym">${u}</td>${cells}
      <td class="tcol" style="background:${rtBg};color:${fg(rtBg)}">${rowTotal.toFixed(3)}</td>
    </tr>`;
  }).join('\n');

  const grandTotal   = spreads.reduce((sum, s) => sum + s[key], 0);
  const footerCells  = expirations.map(e => {
    const val = spreads.filter(s => s.expiration === e).reduce((sum, s) => sum + s[key], 0);
    const bg  = colorFn(val, gMin, gMax, gAbsMax);
    return `<td class="trow" style="background:${bg};color:${fg(bg)}">${val.toFixed(3)}</td>`;
  }).join('');
  const gtBg = colorFn(grandTotal, gMin, gMax, gAbsMax);

  return `
<section data-section="${sectionId}">
  <h2>${title}</h2>
  ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
  <table>
    <thead><tr><th>Symbol</th>${headerCells}<th class="tcol">Total</th></tr></thead>
    <tbody>
      ${bodyRows}
      <tr>
        <td class="sym trow">TOTAL</td>${footerCells}
        <td class="tcol trow" style="background:${gtBg};color:${fg(gtBg)}">${grandTotal.toFixed(3)}</td>
      </tr>
    </tbody>
  </table>
</section>`;
}

// ── Section 3: Theta/|Gamma| quality ranked list ──────────────────────────────

function qualityList(spreads) {
  const withRatio    = [...spreads].filter(s => s.tgRatio !== null)
                                   .sort((a, b) => b.tgRatio - a.tgRatio);
  const withoutRatio = spreads.filter(s => s.tgRatio === null);

  const maxVal = Math.max(...withRatio.map(s => s.tgRatio), 1e-9);

  const rows = [...withRatio, ...withoutRatio].map(s => {
    if (s.tgRatio === null) {
      return `<tr>
        <td class="sym">${s.underlying}</td>
        <td class="expd">${fmtExp(s.expiration)}</td>
        <td class="pos">${s.name}</td>
        <td class="na" title="Gamma = 0; ratio undefined">—</td>
      </tr>`;
    }
    const bg = cAmber(s.tgRatio, maxVal);
    return `<tr style="background:${bg};color:${fg(bg)}">
      <td class="sym">${s.underlying}</td>
      <td class="expd">${fmtExp(s.expiration)}</td>
      <td class="pos">${s.name}</td>
      <td class="val">${s.tgRatio.toFixed(3)}</td>
    </tr>`;
  }).join('\n');

  return `
<section data-section="quality-tg">
  <h2>Theta / |Gamma| Quality</h2>
  <p class="subtitle">Daily time decay collected per unit of convexity risk. Higher = better compensated. Sorted best &rarr; worst.</p>
  <table>
    <thead><tr><th>Symbol</th><th>Expiry</th><th>Position</th><th>Θ / |Γ|</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

// ── Section 3b: Theta/|Vega| quality ranked list ─────────────────────────────

function vegaQualityList(spreads) {
  const withRatio    = [...spreads].filter(s => s.tvRatio !== null)
                                   .sort((a, b) => b.tvRatio - a.tvRatio);
  const withoutRatio = spreads.filter(s => s.tvRatio === null);

  const maxVal = Math.max(...withRatio.map(s => s.tvRatio), 1e-9);

  const rows = [...withRatio, ...withoutRatio].map(s => {
    if (s.tvRatio === null) {
      return `<tr>
        <td class="sym">${s.underlying}</td>
        <td class="expd">${fmtExp(s.expiration)}</td>
        <td class="pos">${s.name}</td>
        <td class="na" title="Vega = 0; ratio undefined">—</td>
      </tr>`;
    }
    const bg = cAmber(s.tvRatio, maxVal);
    return `<tr style="background:${bg};color:${fg(bg)}">
      <td class="sym">${s.underlying}</td>
      <td class="expd">${fmtExp(s.expiration)}</td>
      <td class="pos">${s.name}</td>
      <td class="val">${s.tvRatio.toFixed(3)}</td>
    </tr>`;
  }).join('\n');

  return `
<section data-section="quality-tv">
  <h2>Theta / |Vega| Quality</h2>
  <p class="subtitle">Daily time decay collected per unit of volatility exposure. Higher = better compensated for a vol spike. Sorted best &rarr; worst.</p>
  <table>
    <thead><tr><th>Symbol</th><th>Expiry</th><th>Position</th><th>Θ / |V|</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

// ── Section 4: Per-position scorecard ────────────────────────────────────────

function scorecard(spreads) {
  const sorted = [...spreads].sort((a, b) => {
    const d = new Date(a.expiration) - new Date(b.expiration);
    return d !== 0 ? d : b.theta - a.theta;
  });

  // Column spec: key, header, format, colorFn(value, colStats)
  const cols = [
    { key: 'chance',    hdr: 'Chance',    fmt: v => (v*100).toFixed(1)+'%',
      color: (v, st) => cGreen(v, st.max) },
    { key: 'credit',    hdr: 'Credit',    fmt: v => '$'+v.toFixed(0),
      color: (v, st) => cGreen(v, st.max) },
    { key: 'maxProfit', hdr: 'Max Profit',fmt: v => '$'+v.toFixed(0),
      color: (v, st) => cGreen(v, st.max) },
    { key: 'maxLoss',   hdr: 'Max Loss',  fmt: v => '$'+v.toFixed(0),
      color: (v, st) => cRed(v, st.max) },
    { key: 'ev',        hdr: 'EV',        fmt: v => (v<0?'-$':'$')+Math.abs(v).toFixed(0),
      color: (v, st) => cDiverging(v, st.min, st.max) },
    { key: 'theta',     hdr: 'Θ Theta',   fmt: v => v.toFixed(3),
      color: (v, st) => cGreen(v, st.max) },
    { key: 'vega',      hdr: 'Vega',      fmt: v => v.toFixed(3),
      color: (v, st) => cRed(Math.abs(v), st.absMax) },
    { key: 'gamma',     hdr: 'Γ Gamma',   fmt: v => v.toFixed(4),
      color: (v, st) => cDiverging(v, st.min, st.max) },
    { key: 'iv',        hdr: 'IV',        fmt: v => v.toFixed(1)+'%',
      color: (v, st) => cAmber(v, st.max) },
    { key: 'tgRatio',   hdr: 'Θ/|Γ|',    fmt: v => v == null ? '—' : v.toFixed(2),
      color: (v, st) => v == null ? '#1e2330' : cAmber(v, st.max), nullable: true },
    { key: 'tvRatio',   hdr: 'Θ/|V|',    fmt: v => v == null ? '—' : v.toFixed(2),
      color: (v, st) => v == null ? '#1e2330' : cAmber(v, st.max), nullable: true },
    { key: 'returnPct', hdr: 'Return',    fmt: v => v.toFixed(1)+'%',
      color: (v, st) => cDiverging(v, st.min, st.max) },
  ];

  // Per-column stats
  const stats = {};
  for (const col of cols) {
    const vals = sorted.map(s => s[col.key]).filter(v => v != null && !isNaN(v));
    stats[col.key] = {
      min:    Math.min(...vals),
      max:    Math.max(...vals),
      absMax: Math.max(...vals.map(Math.abs), 1e-9),
    };
  }

  const headerCells = cols.map(c => `<th>${c.hdr}</th>`).join('');

  let lastExp = null;
  const rows = sorted.map(s => {
    let sep = '';
    if (s.expiration !== lastExp) {
      if (lastExp !== null) sep = `<tr class="exp-divider"><td colspan="${cols.length + 3}"></td></tr>`;
      lastExp = s.expiration;
    }
    const cells = cols.map(col => {
      const val = s[col.key];
      if (val == null || isNaN(val)) return `<td class="na">—</td>`;
      const bg = col.color(val, stats[col.key]);
      return `<td style="background:${bg};color:${fg(bg)}">${col.fmt(val)}</td>`;
    }).join('');
    const badge = s.type === 'Bull Put'
      ? '<span class="badge bull">Bull Put</span>'
      : '<span class="badge bear">Bear Call</span>';
    return `${sep}<tr>
      <td class="sym">${s.underlying}</td>
      <td>${badge}</td>
      <td class="expd">${fmtExp(s.expiration)}</td>
      ${cells}
    </tr>`;
  }).join('\n');

  // Summary footer
  const totalCells = cols.map(col => {
    // Averages for rates/ratios
    if (col.key === 'chance') {
      const avg = spreads.reduce((a, s) => a + s.chance, 0) / spreads.length;
      const bg  = col.color(avg, stats[col.key]);
      return `<td class="trow" style="background:${bg};color:${fg(bg)}">${(avg*100).toFixed(1)}% avg</td>`;
    }
    if (col.key === 'iv') {
      const avg = spreads.reduce((a, s) => a + s.iv, 0) / spreads.length;
      const bg  = col.color(avg, stats[col.key]);
      return `<td class="trow" style="background:${bg};color:${fg(bg)}">${avg.toFixed(1)}% avg</td>`;
    }
    if (col.key === 'tgRatio') {
      // Portfolio-level ratio: sum(theta) / |sum(gamma)|
      const tTotal = spreads.reduce((a, s) => a + s.theta, 0);
      const gTotal = spreads.reduce((a, s) => a + s.gamma, 0);
      const ratio  = gTotal !== 0 ? tTotal / Math.abs(gTotal) : null;
      if (ratio == null) return `<td class="trow na">—</td>`;
      const bg = col.color(ratio, stats[col.key]);
      return `<td class="trow" style="background:${bg};color:${fg(bg)}">${ratio.toFixed(2)}</td>`;
    }
    const total = spreads.reduce((a, s) => a + (s[col.key] || 0), 0);
    const bg    = col.color(total, stats[col.key]);
    return `<td class="trow" style="background:${bg};color:${fg(bg)}">${col.fmt(total)}</td>`;
  }).join('');

  return `
<section data-section="scorecard">
  <h2>Position Scorecard</h2>
  <p class="subtitle">Each column normalized independently. Grouped by expiration, sorted by Theta within each group.</p>
  <table>
    <thead><tr><th>Symbol</th><th>Type</th><th>Expiry</th>${headerCells}</tr></thead>
    <tbody>
      ${rows}
      <tr class="exp-divider"><td colspan="${cols.length + 3}"></td></tr>
      <tr>
        <td class="sym trow" colspan="3">TOTAL / AVG</td>
        ${totalCells}
      </tr>
    </tbody>
  </table>
  <details class="col-guide">
    <summary>Column guide — EV &amp; Greeks</summary>
    <dl>
      <dt>EV</dt>
      <dd>
        Binary-outcome expected value: <code>Chance × Max Profit − (1 − Chance) × Max Loss</code>.
        Treats the trade as either expiring fully worthless (max profit) or reaching max loss — nothing in between.
        <strong>Negative EV is normal and expected</strong> for credit spreads: max loss is typically 4–10× max profit,
        so even an 80% winner produces a negative number. Use EV as a <em>relative</em> ranking across positions,
        not as an absolute signal. A less-negative EV means the risk/reward ratio is better for a given probability.
      </dd>

      <dt>Θ Theta</dt>
      <dd>
        Daily time decay in dollars. Positive means the position earns money each day that passes with everything else held constant.
        Credit spreads are short premium, so theta is always positive — you are the one collecting the decay.
        The Theta Concentration section at the top of this page shows how this is distributed across underlyings and expirations.
      </dd>

      <dt>Vega</dt>
      <dd>
        Dollar change in position value per 1% rise in implied volatility (IV).
        Negative for all credit spreads — you sold premium, so a spike in IV increases the value of what you owe and hurts you.
        The magnitude tells you how exposed a position is to a volatility event.
        The Vega Concentration section shows this aggregated across the book.
      </dd>

      <dt>Γ Gamma</dt>
      <dd>
        Rate of change of delta per $1 move in the underlying. Negative for credit spreads — a large move in either direction
        increases your directional exposure in the wrong direction (losses accelerate as the underlying moves against you).
        Near-expiry, at-the-money positions carry the most gamma risk.
      </dd>

      <dt>IV</dt>
      <dd>
        Implied volatility of the underlying at the time the position was entered.
        Higher IV at entry means you collected more premium relative to the width of the spread —
        generally a more favourable entry environment for credit strategies.
        Not updated in real time; it reflects the entry conditions.
      </dd>

      <dt>Θ / |Γ|</dt>
      <dd>
        Quality ratio: how much daily theta you earn per unit of gamma risk.
        Higher is better — the position is well compensated for the convexity exposure it carries.
        Useful for comparing two positions with similar probability profiles but different risk/reward dynamics.
        Positions with gamma = 0 (deep in- or out-of-the-money, no convexity) are excluded from ranking.
      </dd>

      <dt>Θ / |V|</dt>
      <dd>
        How much daily theta you earn per dollar lost if implied volatility rises by 1%.
        Higher is better — the position is well compensated for its volatility exposure.
        Low values identify positions that are cheapest to close into a vol spike: you are earning little
        time decay relative to how much a sustained IV expansion would hurt you.
        Complements Θ/|Γ| — gamma risk is acute and move-driven, vega risk is broader and regime-driven.
        A position can score well on one and poorly on the other.
      </dd>

      <dt>Return</dt>
      <dd>
        Current mark-to-market return on the position as a percentage of max profit.
        100% means the spread has expired worthless and you kept all the premium.
        Negative means the position is currently at a loss relative to entry.
        Colour is diverging: green for positive return, red for negative.
      </dd>
    </dl>
  </details>
</section>`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const spreads = loadSpreads(csvFile);
if (!spreads.length) { console.error('No spreads found in', csvFile); process.exit(1); }
console.log(`Parsed ${spreads.length} spread positions`);

const basename = path.basename(csvFile, '.csv');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Portfolio — ${basename}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #0a0e1a;
      color: #c9d1d9;
      padding: 28px 24px;
      line-height: 1.4;
    }
    h1 {
      font-size: 1.3rem;
      font-weight: 600;
      color: #e6edf3;
      text-align: center;
      margin-bottom: 6px;
      letter-spacing: .03em;
    }
    .page-sub {
      text-align: center;
      color: #6e7681;
      font-size: 12px;
      margin-bottom: 36px;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    h2 {
      font-size: .78rem;
      color: #f0a500;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: .1em;
      font-weight: 700;
    }
    section {
      background: #10151f;
      border: 1px solid #2a3040;
      border-radius: 8px;
      padding: 20px 22px;
      margin-bottom: 32px;
      overflow-x: auto;
    }
    p.subtitle {
      font-size: 11px;
      color: #6e7681;
      margin-bottom: 12px;
    }
    p.footnote {
      font-size: 11px;
      color: #6e7681;
      margin-top: 10px;
      font-style: italic;
    }
    table {
      border-collapse: collapse;
      font-size: 12px;
      min-width: 100%;
    }
    th {
      background: #1c2230;
      color: #8b949e;
      padding: 7px 12px;
      text-align: left;
      border: 1px solid #2a3040;
      white-space: nowrap;
      font-weight: 600;
      letter-spacing: .04em;
      font-size: 11px;
    }
    td {
      padding: 5px 12px;
      border: 1px solid #1c2230;
      white-space: nowrap;
      transition: filter .1s;
    }
    tr:hover td { filter: brightness(1.14); }
    td.sym  { font-weight: 700; font-size: 13px; min-width: 68px; }
    td.expd { font-size: 11px; color: #8b949e; min-width: 78px; }
    td.pos  { max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
    td.val  { text-align: right; font-family: 'Cascadia Code', 'Fira Mono', monospace; font-weight: 600; min-width: 72px; }
    td.na   { color: #444; text-align: center; background: #10151f; }
    td.empty { background: #0a0e1a; min-width: 64px; }
    td.tcol { border-left: 2px solid #f0a500; font-weight: 700; text-align: right; }
    td.trow { border-top: 2px solid #f0a500; font-weight: 700; text-align: right; }
    td.trow.na { border-top: 2px solid #f0a500; }
    th.tcol { border-left: 2px solid #f0a500; }
    tr.exp-divider td { padding: 2px 0; background: #0a0e1a; border: none; }
    details.col-guide {
      margin-top: 16px;
      border: 1px solid #2a3040;
      border-radius: 6px;
      padding: 0;
    }
    details.col-guide[open] { padding-bottom: 16px; }
    details.col-guide summary {
      cursor: pointer;
      padding: 10px 14px;
      font-size: 11px;
      font-weight: 700;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: .08em;
      list-style: none;
      user-select: none;
    }
    details.col-guide summary::-webkit-details-marker { display: none; }
    details.col-guide summary::before {
      content: '▸ ';
      color: #f0a500;
    }
    details.col-guide[open] summary::before { content: '▾ '; }
    details.col-guide dl {
      margin: 4px 14px 0;
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 20px;
    }
    details.col-guide dt {
      font-family: 'Cascadia Code', 'Fira Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      color: #f0a500;
      padding-top: 2px;
      white-space: nowrap;
    }
    details.col-guide dd {
      font-size: 12px;
      color: #8b949e;
      line-height: 1.55;
    }
    details.col-guide dd strong { color: #c9d1d9; }
    details.col-guide dd em { color: #adbac7; font-style: italic; }
    details.col-guide dd code {
      font-family: 'Cascadia Code', 'Fira Mono', monospace;
      font-size: 11px;
      color: #e6edf3;
      background: #1c2230;
      border-radius: 3px;
      padding: 1px 5px;
    }
    .badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 10px;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .badge.bull { background: rgba(40,180,40,.18); color: rgb(80,210,80); border: 1px solid rgba(80,210,80,.3); }
    .badge.bear { background: rgba(220,60,60,.18); color: rgb(240,100,100); border: 1px solid rgba(220,60,60,.3); }
    /* ── What-if panel ── */
    #wi-panel { background: #10151f; border: 1px solid #2a3040; border-radius: 8px; padding: 14px 18px; margin-bottom: 28px; }
    #wi-pills-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    #wi-pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .wi-pill { display: inline-flex; align-items: center; gap: 5px; background: var(--wi-bg); border: 1px solid var(--wi-accent); border-radius: 20px; padding: 3px 8px 3px 11px; font-size: 11px; color: var(--wi-accent); font-weight: 600; }
    .wi-pill button { background: none; border: none; color: var(--wi-accent); cursor: pointer; font-size: 15px; line-height: 1; padding: 0 2px; opacity: .7; }
    .wi-pill button:hover { opacity: 1; }
    #wi-row { display: flex; gap: 8px; }
    #wi-input { flex: 1; background: #0a0e1a; border: 1px solid #2a3040; border-radius: 6px; color: #c9d1d9; font-family: 'Cascadia Code', 'Fira Mono', monospace; font-size: 12px; padding: 7px 12px; outline: none; transition: border-color .15s; }
    #wi-input:focus { border-color: #f0a500; }
    #wi-btn { background: #f0a500; border: none; border-radius: 6px; color: #0a0e1a; cursor: pointer; font-size: 12px; font-weight: 700; padding: 7px 16px; letter-spacing: .04em; transition: background .15s; }
    #wi-btn:hover { background: #f5b830; }
    #wi-hint { font-size: 10px; color: #555; margin-top: 7px; }
    tr.wi-row { --wi-accent: #f0a500; --wi-bg: rgba(240,165,0,.10); }
    tr.wi-row td { border-top-color: var(--wi-accent) !important; border-bottom-color: var(--wi-accent) !important; }
    tr.wi-row td:first-child { border-left: 2px solid var(--wi-accent) !important; }
    tr.wi-row td:last-child  { border-right: 2px solid var(--wi-accent) !important; }
    tr.wi-row:hover td { filter: brightness(1.15); }
  </style>
</head>
<body>
<h1>Portfolio Analysis &mdash; ${basename}</h1>
<p class="page-sub">Theta &middot; Vega &middot; Quality &middot; Scorecard</p>
<div id="wi-panel">
  <div id="wi-pills-wrap" style="display:none"><div id="wi-pills"></div></div>
  <div id="wi-row">
    <input id="wi-input" type="text" placeholder="Paste a spread CSV row to model it as a what-if…" spellcheck="false" autocomplete="off" />
    <button id="wi-btn">Add</button>
  </div>
  <p id="wi-hint">Paste a spread row from the exported CSV. Press Enter or click Add. Each spread appears as a pill above and is highlighted in every table below.</p>
</div>

${concentrationGrid(
  spreads, 'theta',
  'Theta Concentration',
  (v, min, max, absMax) => cGreen(v, max),
  'Daily time decay accrual by underlying and expiration. Grand total = portfolio theta.'
)}

${concentrationGrid(
  spreads, 'vega',
  'Vega Concentration — Short Volatility Risk',
  (v, min, max, absMax) => cRed(Math.abs(v), absMax),
  'All values are negative (short premium = short vega). More red = more exposure to a volatility spike. Grand total = how much the book loses per 1% rise in IV across all positions.'
)}

${qualityList(spreads)}

${vegaQualityList(spreads)}

${scorecard(spreads)}

<script>${wiScript}</script>
</body>
</html>`;

const reportsDir = path.join(__dirname, 'reports');
fs.mkdirSync(reportsDir, { recursive: true });
const outFile = path.join(reportsDir, basename + '-portfolio.html');
fs.writeFileSync(outFile, html);
console.log(`Wrote → ${outFile}`);

// ── JSON snapshot ─────────────────────────────────────────────────────────────
// Mirrors the Position Scorecard. Saved to data/ alongside the source CSV so
// each snapshot is timestamped and can be used for trend graphs or risk checks.

function fmtExpISO(expStr) {
  // "4/17/26 14:00" or "4/17/2026 14:00" → "2026-04-17"
  const m = (expStr || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return expStr;
  const year = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${year}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  source:      path.basename(csvFile),
  positions:   spreads.map(s => ({
    name:       s.name,
    underlying: s.underlying,
    expiration: fmtExpISO(s.expiration),
    type:       s.type,
    chance:     s.chance,
    credit:     s.credit,
    maxProfit:  s.maxProfit,
    maxLoss:    s.maxLoss,
    ev:         s.ev,
    returnPct:  s.returnPct,
    theta:      s.theta,
    vega:       s.vega,
    gamma:      s.gamma,
    delta:      s.delta,
    iv:         s.iv,
    tgRatio:    s.tgRatio,
    tvRatio:    s.tvRatio,
  })),
};

const jsonFile = path.join(reportsDir, basename + '-portfolio.json');
fs.writeFileSync(jsonFile, JSON.stringify(snapshot, null, 2));
console.log(`Wrote → ${jsonFile}`);

require('./generate-index')();
