/* What-if row injector — embedded in generated reports */
(function () {
  'use strict';

  // ── Random pill color (fixed S/L, random hue → cohesive palette) ───────────
  function randomColor() {
    var h = Math.floor(Math.random() * 360);
    var s = 0.68, l = 0.63;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var rv, gv, bv;
    if      (h <  60) { rv = c; gv = x; bv = 0; }
    else if (h < 120) { rv = x; gv = c; bv = 0; }
    else if (h < 180) { rv = 0; gv = c; bv = x; }
    else if (h < 240) { rv = 0; gv = x; bv = c; }
    else if (h < 300) { rv = x; gv = 0; bv = c; }
    else              { rv = c; gv = 0; bv = x; }
    var R = Math.round((rv + m) * 255);
    var G = Math.round((gv + m) * 255);
    var B = Math.round((bv + m) * 255);
    return {
      main: 'rgb('  + R + ',' + G + ',' + B + ')',
      bg:   'rgba(' + R + ',' + G + ',' + B + ',0.12)',
    };
  }

  // ── Color scale functions (mirror server-side) ─────────────────────────────
  function rnd(n) { return Math.round(n); }

  function heatColor(v, absMax) {
    if (absMax === 0) return '#e0e0e0';
    var t = Math.max(-1, Math.min(1, v / absMax));
    if (t < 0) { var i = -t; return 'rgb('+rnd(220+35*i)+','+rnd(220-180*i)+','+rnd(220-180*i)+')'; }
    else        { var j =  t; return 'rgb('+rnd(220-180*j)+','+rnd(185+35*j)+','+rnd(220-180*j)+')'; }
  }

  function cGreen(v, max) {
    var t = Math.max(0, Math.min(1, max > 0 ? v / max : 0));
    return 'rgb('+rnd(230-170*t)+','+rnd(230)+','+rnd(230-170*t)+')';
  }

  function cRed(absV, absMax) {
    var t = Math.max(0, Math.min(1, absMax > 0 ? absV / absMax : 0));
    return 'rgb('+rnd(230+25*t)+','+rnd(230-190*t)+','+rnd(230-190*t)+')';
  }

  function cAmber(v, max) {
    var t = Math.max(0, Math.min(1, max > 0 ? v / max : 0));
    return 'rgb('+rnd(220+20*t)+','+rnd(220-80*t)+','+rnd(220-200*t)+')';
  }

  function cDiverging(v, min, max) {
    var abs = Math.max(Math.abs(min), Math.abs(max), 1e-9);
    var t = Math.max(-1, Math.min(1, v / abs));
    if (t < 0) { var i = -t; return 'rgb('+rnd(220+35*i)+','+rnd(220-180*i)+','+rnd(220-180*i)+')'; }
    else        { var j =  t; return 'rgb('+rnd(220-180*j)+','+rnd(185+35*j)+','+rnd(220-180*j)+')'; }
  }

  function fgFor(bg) {
    var m = bg.match(/\d+/g);
    if (!m) return '#111';
    return (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) < 140 ? '#fff' : '#111';
  }

  // ── Read existing cell values for scale computation ────────────────────────
  function isNonDataRow(row) {
    var td = row.querySelector('td');
    return !td || /^total/i.test(td.textContent.trim());
  }

  function existingValCells(tbody) {
    var vals = [];
    tbody.querySelectorAll('tr:not(.wi-row)').forEach(function (row) {
      if (isNonDataRow(row)) return;
      var td = row.querySelector('td.val');
      if (!td) return;
      var v = parseFloat(td.textContent);
      if (!isNaN(v)) vals.push(v);
    });
    return vals;
  }

  function gridDataVals(tbody) {
    var vals = [];
    tbody.querySelectorAll('tr:not(.wi-row)').forEach(function (row) {
      if (isNonDataRow(row)) return;
      var tds = row.querySelectorAll('td');
      tds.forEach(function (td, i) {
        if (i === 0) return; // sym column
        if (td.classList.contains('empty')) return;
        if (td.classList.contains('tcol') || td.classList.contains('total-col')) return;
        var v = parseFloat(td.textContent);
        if (!isNaN(v)) vals.push(v);
      });
    });
    return vals;
  }

  // Returns {bg, fg} for a cell given the section type and current table data
  function cellColors(sectionType, tbody, value) {
    var vals, absMax, max, bg;
    if (sectionType === 'delta-individual' || sectionType === 'gamma-individual') {
      vals   = existingValCells(tbody);
      absMax = vals.reduce(function (m, v) { return Math.max(m, Math.abs(v)); }, 1e-9);
      bg     = heatColor(value, absMax);
      return { bg: bg, fg: fgFor(bg) };
    }
    if (sectionType === 'delta-combined' || sectionType === 'gamma-combined') {
      vals   = gridDataVals(tbody);
      absMax = vals.reduce(function (m, v) { return Math.max(m, Math.abs(v)); }, 1e-9);
      bg     = heatColor(value, absMax);
      return { bg: bg, fg: fgFor(bg) };
    }
    if (sectionType === 'theta-grid') {
      vals = gridDataVals(tbody);
      max  = vals.reduce(function (m, v) { return Math.max(m, v); }, 1e-9);
      bg   = cGreen(value, max);
      return { bg: bg, fg: fgFor(bg) };
    }
    if (sectionType === 'vega-grid' || sectionType === 'gamma-grid') {
      vals   = gridDataVals(tbody);
      absMax = vals.reduce(function (m, v) { return Math.max(m, Math.abs(v)); }, 1e-9);
      bg     = cRed(Math.abs(value), absMax);
      return { bg: bg, fg: fgFor(bg) };
    }
    if (sectionType === 'delta-grid') {
      vals   = gridDataVals(tbody);
      var gmin = vals.reduce(function (m, v) { return Math.min(m, v); }, Infinity);
      var gmax = vals.reduce(function (m, v) { return Math.max(m, v); }, -Infinity);
      bg = cDiverging(value, gmin === Infinity ? 0 : gmin, gmax === -Infinity ? 0 : gmax);
      return { bg: bg, fg: fgFor(bg) };
    }
    if (sectionType === 'quality-tg' || sectionType === 'quality-tv') {
      vals = existingValCells(tbody);
      max  = vals.reduce(function (m, v) { return Math.max(m, v); }, 1e-9);
      bg   = cAmber(value, max);
      return { bg: bg, fg: fgFor(bg) };
    }
    return null;
  }

  // ── Parsing — handles comma-CSV and tab-separated (Excel paste) ───────────
  function parseCSVLine(line) {
    // If the line contains tabs but no commas outside quotes, treat as TSV
    if (line.indexOf('\t') >= 0) {
      return line.split('\t').map(function (s) { return s.trim(); });
    }
    var result = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    result.push(cur.trim());
    return result;
  }

  function parsePct(s)    { return parseFloat((s || '').replace('%', '')) || 0; }
  function parseDollar(s) {
    if (!s) return 0;
    var neg = s.indexOf('(') >= 0;
    return (neg ? -1 : 1) * (parseFloat(s.replace(/[^0-9.]/g, '')) || 0);
  }

  function parseRow(line) {
    var v    = parseCSVLine(line);
    var name = (v[0] || '').trim();
    if (!name || name.charAt(0) === '.' || name.toLowerCase().indexOf('spread') < 0) return null;
    var gamma   = parseFloat(v[13]) || 0;
    var theta   = parseFloat(v[12]) || 0;
    var vega    = parseFloat(v[14]) || 0;
    var chance  = parsePct(v[6]) / 100;
    var maxLoss   = Math.abs(parseDollar(v[7]));
    var maxProfit = Math.abs(parseDollar(v[8]));
    return {
      name:       name,
      underlying: name.split(' ')[0],
      expiration: (v[4] || '').trim(),
      type:       name.indexOf('Bull Put')  >= 0 ? 'Bull Put'  :
                  name.indexOf('Bear Call') >= 0 ? 'Bear Call' : 'Other',
      returnPct:  parsePct(v[1]),
      credit:     Math.abs(parseDollar(v[5])),
      chance:     chance,
      maxLoss:    maxLoss,
      maxProfit:  maxProfit,
      ev:         chance * maxProfit - (1 - chance) * maxLoss,
      delta:      parseFloat(v[11]) || 0,
      theta:      theta,
      gamma:      gamma,
      vega:       vega,
      iv:         parsePct(v[16]),
      tgRatio:    gamma !== 0 ? theta / Math.abs(gamma) : null,
      tvRatio:    vega  !== 0 ? theta / Math.abs(vega)  : null,
    };
  }

  // ── Expiration helpers ─────────────────────────────────────────────────────
  function expsMatch(a, b) {
    var da = new Date(a), db = new Date(b);
    if (isNaN(da) || isNaN(db)) return false;
    return da.getFullYear() === db.getFullYear() &&
           da.getMonth()    === db.getMonth()    &&
           da.getDate()     === db.getDate();
  }

  function fmtExp(s) {
    var d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  }

  // Decimal places per section type
  var DECIMALS = {
    'delta-individual': 4, 'gamma-individual': 4,
    'delta-combined':   2, 'gamma-combined':   2,
    'theta-grid': 3, 'vega-grid': 3, 'delta-grid': 3, 'gamma-grid': 3,
  };

  // ── State ──────────────────────────────────────────────────────────────────
  var nextId = 1;

  // ── Pills ──────────────────────────────────────────────────────────────────
  function addPill(id, sp, color) {
    var wrap  = document.getElementById('wi-pills-wrap');
    var pills = document.getElementById('wi-pills');
    var pill  = document.createElement('div');
    pill.className = 'wi-pill';
    pill.id = 'wi-pill-' + id;
    pill.style.setProperty('--wi-accent', color.main);
    pill.style.setProperty('--wi-bg',     color.bg);
    var span = document.createElement('span');
    span.textContent = sp.name;
    var btn = document.createElement('button');
    btn.innerHTML = '&times;';
    btn.title = 'Remove';
    (function (cid) { btn.onclick = function () { window.__wiRemove(cid); }; }(id));
    pill.appendChild(span);
    pill.appendChild(btn);
    pills.appendChild(pill);
    wrap.style.display = 'flex';
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function findTotalRow(tbody) {
    var rows = tbody.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var td = rows[i].querySelector('td');
      if (td && /^total/i.test(td.textContent.trim())) return rows[i];
    }
    return null;
  }

  function mkRow(id, color) {
    var tr = document.createElement('tr');
    tr.className = 'wi-row';
    tr.dataset.wiId = String(id);
    tr.style.setProperty('--wi-accent', color.main);
    tr.style.setProperty('--wi-bg',     color.bg);
    return tr;
  }

  function mkTd(cls, text) {
    var td = document.createElement('td');
    if (cls) td.className = cls;
    if (text !== undefined) td.textContent = text;
    return td;
  }

  function colorTd(td, colors) {
    if (!colors) return;
    td.style.background = colors.bg;
    td.style.color      = colors.fg;
  }

  // ── Total updaters ─────────────────────────────────────────────────────────
  function updateIndividualTotal(tbody, dec) {
    var totalRow = findTotalRow(tbody);
    if (!totalRow) return;
    var valCell = totalRow.querySelector('td.val');
    if (!valCell) return;
    if (valCell.dataset.wiBase === undefined)
      valCell.dataset.wiBase = String(parseFloat(valCell.textContent) || 0);
    var base = parseFloat(valCell.dataset.wiBase) || 0;
    var wiSum = 0;
    tbody.querySelectorAll('tr.wi-row td.val').forEach(function (td) {
      wiSum += parseFloat(td.textContent) || 0;
    });
    valCell.textContent = (base + wiSum).toFixed(dec);
  }

  // Column-aligned footer update: footer[j] = base[j] + sum of wi-row[j] (non-empty)
  function updateGridTotals(tbody, dec) {
    var totalRow = findTotalRow(tbody);
    if (!totalRow) return;
    var footerCells = Array.from(totalRow.querySelectorAll('td'));
    var wiRows = Array.from(tbody.querySelectorAll('tr.wi-row'));
    for (var j = 1; j < footerCells.length; j++) {
      var cell = footerCells[j];
      if (cell.dataset.wiBase === undefined)
        cell.dataset.wiBase = String(parseFloat(cell.textContent) || 0);
      var base = parseFloat(cell.dataset.wiBase) || 0;
      var wiSum = 0;
      wiRows.forEach(function (tr) {
        var cells = tr.querySelectorAll('td');
        if (cells[j] && !cells[j].classList.contains('empty')) {
          var v = parseFloat(cells[j].textContent);
          if (!isNaN(v)) wiSum += v;
        }
      });
      cell.textContent = (base + wiSum).toFixed(dec);
    }
  }

  function refreshTotals() {
    document.querySelectorAll('section[data-section]').forEach(function (section) {
      var type  = section.dataset.section;
      var tbody = section.querySelector('tbody');
      if (!tbody) return;
      var dec = DECIMALS[type] || 3;
      if (type === 'delta-individual')
        updateIndividualTotal(tbody, dec);
      else if (type === 'delta-combined' || type === 'theta-grid' || type === 'vega-grid' ||
               type === 'delta-grid'     || type === 'gamma-grid')
        updateGridTotals(tbody, dec);
    });
  }

  // ── Sorted insertion helpers ───────────────────────────────────────────────
  // Individual tables: descending sort by val. Stops at null-ratio rows (no td.val).
  function individualInsertBefore(tbody, value) {
    var totalRow = findTotalRow(tbody);
    var rows = Array.from(tbody.querySelectorAll('tr:not(.exp-divider)'));
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row === totalRow) return totalRow;
      var valTd = row.querySelector('td.val');
      if (!valTd) return row;  // hit a null-ratio row — insert before it
      var rv = parseFloat(valTd.textContent);
      if (!isNaN(rv) && value > rv) return row;
    }
    return totalRow;
  }

  // Sort directions for concentration grids (used by gridInsertBefore)
  var GRID_SORT = { 'theta-grid': 'desc', 'delta-grid': 'desc', 'gamma-grid': 'asc', 'vega-grid': 'asc' };

  // Grid tables: always sorted by greek value using GRID_SORT direction.
  function gridInsertBefore(tbody, newValue, sectionType) {
    var totalRow = findTotalRow(tbody);
    var dir = GRID_SORT[sectionType];
    if (dir && newValue !== undefined) {
      var desc = dir === 'desc';
      var rows = Array.from(tbody.querySelectorAll('tr:not(.exp-divider)'));
      var dataRows = rows.filter(function (r) {
        return r !== totalRow && !r.classList.contains('wi-row');
      });
      for (var k = 0; k < dataRows.length; k++) {
        var tcol = dataRows[k].querySelector('td.tcol');
        if (!tcol) continue;
        var rv = parseFloat(tcol.textContent);
        if (isNaN(rv)) continue;
        if (desc  && newValue > rv) return dataRows[k];
        if (!desc && newValue < rv) return dataRows[k];
      }
    }
    return totalRow;
  }

  // ── Per-type injection ─────────────────────────────────────────────────────
  function injectIndividual(section, tbody, id, value, sp, dec, color) {
    var isNull = (value === null);
    var tr = mkRow(id, color);
    tr.appendChild(mkTd('sym', sp.underlying));
    tr.appendChild(mkTd('exp expd', fmtExp(sp.expiration)));
    tr.appendChild(mkTd('pos', sp.name));

    var valTd = mkTd('val', isNull ? '\u2014' : value.toFixed(dec));
    if (!isNull) colorTd(valTd, cellColors(section.dataset.section, tbody, value));
    tr.appendChild(valTd);

    var before = isNull ? findTotalRow(tbody) : individualInsertBefore(tbody, value);
    before ? tbody.insertBefore(tr, before) : tbody.appendChild(tr);
    updateIndividualTotal(tbody, dec);
  }

  function injectGrid(section, tbody, id, sp, value, dec, color) {
    var ths  = Array.from(section.querySelectorAll('thead th'));
    var type = section.dataset.section;

    var existingSyms = Array.from(tbody.querySelectorAll('tr:not(.wi-row) td.sym'))
      .map(function (td) { return td.textContent.trim(); });
    var existsAlready = existingSyms.indexOf(sp.underlying) >= 0;
    var label = existsAlready ? sp.underlying + ' (+)' : sp.underlying;

    var tr = mkRow(id, color);
    tr.appendChild(mkTd('sym', label));

    var hasTotal = false;
    ths.forEach(function (th) {
      var isTotal = th.classList.contains('total-col') || th.classList.contains('tcol');
      if (isTotal) { hasTotal = true; return; }
      var expStr = th.dataset.exp;
      if (!expStr) return; // sym column
      var td = document.createElement('td');
      if (expsMatch(expStr, sp.expiration)) {
        td.textContent = value.toFixed(dec);
        colorTd(td, cellColors(type, tbody, value));
      } else {
        td.className = 'empty';
      }
      tr.appendChild(td);
    });

    if (hasTotal) {
      var totalTd = document.createElement('td');
      totalTd.style.cssText = 'text-align:right;font-weight:700';
      totalTd.textContent   = value.toFixed(dec);
      colorTd(totalTd, cellColors(type, tbody, value));
      tr.appendChild(totalTd);
    }

    var before = gridInsertBefore(tbody, value, type);
    before ? tbody.insertBefore(tr, before) : tbody.appendChild(tr);
    updateGridTotals(tbody, dec);
  }

  // ── Scorecard coloring ─────────────────────────────────────────────────────
  // td indices: 0=sym, 1=badge, 2=expd, then keys at 3..14
  var SC_KEYS = ['chance','credit','maxProfit','maxLoss','ev','theta','vega','gamma','iv','tgRatio','tvRatio','returnPct'];

  function parseScoreVal(key, text) {
    if (!text || text === '\u2014') return null;
    switch (key) {
      case 'chance':    return parseFloat(text) / 100;
      case 'credit': case 'maxProfit': case 'maxLoss':
        return parseFloat(text.replace(/[^0-9.]/g, '')) || 0;
      case 'ev': {
        var neg = text.charAt(0) === '-';
        return (neg ? -1 : 1) * (parseFloat(text.replace(/[^0-9.]/g, '')) || 0);
      }
      default: return parseFloat(text);  // theta, vega, gamma, iv, ratios, returnPct
    }
  }

  function getScorecardStats(tbody) {
    var stats = {};
    SC_KEYS.forEach(function (key, ki) {
      var colIdx = ki + 3;
      var vals = [];
      tbody.querySelectorAll('tr:not(.wi-row):not(.exp-divider)').forEach(function (row) {
        if (isNonDataRow(row)) return;
        var td = row.querySelectorAll('td')[colIdx];
        if (!td) return;
        var v = parseScoreVal(key, td.textContent.trim());
        if (v !== null && !isNaN(v)) vals.push(v);
      });
      stats[key] = vals.length ? {
        min:    Math.min.apply(null, vals),
        max:    Math.max.apply(null, vals),
        absMax: Math.max.apply(null, vals.map(Math.abs).concat([1e-9])),
      } : { min: 0, max: 1, absMax: 1 };
    });
    return stats;
  }

  function scorecardCellBg(key, value, stats) {
    if (value === null || isNaN(value)) return null;
    var st = stats[key];
    if (!st) return null;
    var bg;
    switch (key) {
      case 'chance': case 'credit': case 'maxProfit': case 'theta':
        bg = cGreen(value, st.max); break;
      case 'maxLoss':
        bg = cRed(value, st.max); break;
      case 'vega':
        bg = cRed(Math.abs(value), st.absMax); break;
      case 'ev': case 'gamma': case 'returnPct':
        bg = cDiverging(value, st.min, st.max); break;
      case 'iv': case 'tgRatio': case 'tvRatio':
        bg = cAmber(value, st.max); break;
      default: return null;
    }
    return { bg: bg, fg: fgFor(bg) };
  }

  // Parse the formatted exp string back to a Date for cross-group ordering
  function parseFormattedExp(str) {
    return new Date(str.replace(/'(\d{2})/, '20$1'));
  }

  // Returns the next non-wi-row sibling, or fallback if none found.
  function nextNonWi(row, fallback) {
    var ref = row ? row.nextElementSibling : null;
    while (ref && ref.classList.contains('wi-row')) ref = ref.nextElementSibling;
    return ref || fallback;
  }

  function scorecardInsertBefore(tbody, sp) {
    var totalRow  = findTotalRow(tbody);
    var spExpFmt  = fmtExp(sp.expiration);
    var spExpDate = new Date(sp.expiration);
    var rows = Array.from(tbody.querySelectorAll('tr:not(.exp-divider):not(.wi-row)'));
    var lastMatchRow = null;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row === totalRow) break;
      var expTd = row.querySelector('td.expd');
      if (!expTd) continue;
      var rowExpFmt = expTd.textContent.trim();
      if (rowExpFmt === spExpFmt) {
        // Same expiration group — sort by theta descending
        var thetaTd = row.querySelectorAll('td')[8];
        var rowTheta = thetaTd ? (parseFloat(thetaTd.textContent) || 0) : 0;
        if (sp.theta > rowTheta) return row;
        lastMatchRow = row;
      } else {
        // Moving past the matching expiration group — insert after its last row
        if (lastMatchRow) return nextNonWi(lastMatchRow, totalRow);
        // Haven't seen matching group yet — insert before first group with a later date
        var rowExpDate = parseFormattedExp(rowExpFmt);
        if (!isNaN(rowExpDate) && !isNaN(spExpDate) && spExpDate < rowExpDate) return row;
      }
    }
    // End of data rows — insert at end of matching group (before its trailing divider)
    return lastMatchRow ? nextNonWi(lastMatchRow, totalRow) : totalRow;
  }

  function injectScorecard(tbody, id, sp, color) {
    var stats = getScorecardStats(tbody);

    function fmt(k) {
      switch (k) {
        case 'chance':    return (sp.chance * 100).toFixed(1) + '%';
        case 'credit':    return '$' + sp.credit.toFixed(0);
        case 'maxProfit': return '$' + sp.maxProfit.toFixed(0);
        case 'maxLoss':   return '$' + sp.maxLoss.toFixed(0);
        case 'ev':        return (sp.ev < 0 ? '-$' : '$') + Math.abs(sp.ev).toFixed(0);
        case 'theta':     return sp.theta.toFixed(3);
        case 'vega':      return sp.vega.toFixed(3);
        case 'gamma':     return sp.gamma.toFixed(4);
        case 'iv':        return sp.iv.toFixed(1) + '%';
        case 'tgRatio':   return sp.tgRatio != null ? sp.tgRatio.toFixed(2) : '\u2014';
        case 'tvRatio':   return sp.tvRatio != null ? sp.tvRatio.toFixed(2) : '\u2014';
        case 'returnPct': return sp.returnPct.toFixed(1) + '%';
        default:          return '\u2014';
      }
    }

    // Raw value for color lookup (mirrors sp field but in same units as parsed stats)
    var rawVal = {
      chance: sp.chance, credit: sp.credit, maxProfit: sp.maxProfit,
      maxLoss: sp.maxLoss, ev: sp.ev, theta: sp.theta, vega: sp.vega,
      gamma: sp.gamma, iv: sp.iv,
      tgRatio: sp.tgRatio, tvRatio: sp.tvRatio, returnPct: sp.returnPct,
    };

    var tr = mkRow(id, color);
    tr.appendChild(mkTd('sym', sp.underlying));
    var badgeTd = document.createElement('td');
    var badge   = document.createElement('span');
    badge.className   = 'badge ' + (sp.type === 'Bull Put' ? 'bull' : 'bear');
    badge.textContent = sp.type === 'Bull Put' ? 'Bull Put' : 'Bear Call';
    badgeTd.appendChild(badge);
    tr.appendChild(badgeTd);
    tr.appendChild(mkTd('expd', fmtExp(sp.expiration)));
    SC_KEYS.forEach(function (k) {
      var td = mkTd('', fmt(k));
      colorTd(td, scorecardCellBg(k, rawVal[k], stats));
      tr.appendChild(td);
    });

    var before = scorecardInsertBefore(tbody, sp);
    before ? tbody.insertBefore(tr, before) : tbody.appendChild(tr);
  }

  function injectSection(section, id, sp, color) {
    var type  = section.dataset.section;
    var tbody = section.querySelector('tbody');
    if (!tbody) return;
    var dec = DECIMALS[type] || 3;

    if      (type === 'delta-individual') injectIndividual(section, tbody, id, sp.delta, sp, dec, color);
    else if (type === 'gamma-individual') injectIndividual(section, tbody, id, sp.gamma, sp, dec, color);
    else if (type === 'delta-combined')   injectGrid(section, tbody, id, sp, sp.delta, dec, color);
    else if (type === 'gamma-combined')   injectGrid(section, tbody, id, sp, sp.gamma, dec, color);
    else if (type === 'theta-grid')       injectGrid(section, tbody, id, sp, sp.theta, dec, color);
    else if (type === 'vega-grid')        injectGrid(section, tbody, id, sp, sp.vega,  dec, color);
    else if (type === 'delta-grid')       injectGrid(section, tbody, id, sp, sp.delta, dec, color);
    else if (type === 'gamma-grid')       injectGrid(section, tbody, id, sp, sp.gamma, dec, color);
    else if (type === 'quality-tg')       injectIndividual(section, tbody, id, sp.tgRatio, sp, 3, color);
    else if (type === 'quality-tv')       injectIndividual(section, tbody, id, sp.tvRatio, sp, 3, color);
    else if (type === 'scorecard')        injectScorecard(tbody, id, sp, color);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.__wiRemove = function (id) {
    var pill = document.getElementById('wi-pill-' + id);
    if (pill) pill.remove();
    document.querySelectorAll('[data-wi-id="' + id + '"]').forEach(function (el) { el.remove(); });
    refreshTotals();
    if (!document.querySelector('.wi-pill')) {
      var wrap = document.getElementById('wi-pills-wrap');
      if (wrap) wrap.style.display = 'none';
    }
  };

  function addHypothetical(raw) {
    var sp    = parseRow(raw.trim());
    if (!sp) {
      alert('Could not parse that row. Paste a spread (not a leg or header row) from the CSV.');
      return;
    }
    var id    = nextId++;
    var color = randomColor();
    addPill(id, sp, color);
    document.querySelectorAll('section[data-section]').forEach(function (s) {
      injectSection(s, id, sp, color);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var inp = document.getElementById('wi-input');
    var btn = document.getElementById('wi-btn');
    if (!inp || !btn) return;
    function submit() {
      var v = inp.value.trim();
      if (v) { addHypothetical(v); inp.value = ''; }
    }
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  });
}());
