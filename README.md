# optionspread-heatmaps

Generates heatmap and portfolio analysis visualizations from options spread exports from [OptionStrat](https://optionstrat.com).

## Quick start

```bash
npm ci               # enforces lock file — see Security note below
cp .env.example .env # add your OptionStrat credentials
./run.sh             # download → convert → analyse → reports/
```

## Scripts

| Script | Input | Output |
|---|---|---|
| `run.sh` | — | Full pipeline: download, convert, portfolio |
| `download.js` | — | `data/*.csv` (downloads Group: Live from OptionStrat, converts xlsx → csv) |
| `portfolio.js <csv>` | CSV file | `reports/*-portfolio.html`, `reports/*-portfolio.json` |
| `whatif.js` | — | Embedded in every HTML report (client-side what-if logic) |

After each run, `reports/index.html` is fully regenerated listing all current reports.

## Directory layout

```
data/       source CSVs (downloaded by download.js, gitignored)
reports/    generated HTML reports, JSON snapshots, and index.html (gitignored)
```

## Automated download

`download.js` uses Playwright to log in to OptionStrat, navigate to Saved Trades (Group: Live), trigger the export, download the xlsx, convert it to CSV, and delete the xlsx. Credentials are read from `.env`:

```
OPTIONSTRAT_EMAIL=you@example.com
OPTIONSTRAT_PASSWORD=yourpassword
```

Set `HEADLESS=false` to watch the browser during a run.

The browser session is persisted to `.session.json` after the first successful login. Subsequent runs reuse the session and skip the login flow as long as the session remains valid. The file is gitignored.

### Security note

`npm ci` is intentional: it treats `package-lock.json` as authoritative and fails if anything drifts, preventing a compromised upstream package version from silently entering the build. Never use `npm install` on this project.

## Manual export from OptionStrat

1. Open your positions on [OptionStrat](https://optionstrat.com)
2. Saved Trades → Group: Live → Export → Export as .xlsx (Excel)
3. Convert the xlsx to CSV and pass it to `index.js` or `portfolio.js`

Individual option legs and non-spread positions are filtered out automatically. Only spreads are included.

## What-if modeling

Every generated HTML report contains a **What-if** panel at the top. Paste a spread row from the OptionStrat CSV export (or copy directly from Excel — tab-separated format is also accepted) and click **Add**. The row is inserted into every table in the correct sorted position and highlighted with a colored border. A pill appears at the top for each added spread; click its **×** to remove that spread from all tables. Multiple spreads can be modeled simultaneously. All totals update automatically when rows are added or removed.

This lets you see exactly how a prospective trade would change your greek concentrations, quality rankings, and scorecard before entering the position.

## Portfolio analysis — `portfolio.js`

**Theta Concentration**
Daily time decay by underlying × expiration. Green = more theta collected. Rows sorted by theta total descending. Grand total = how much the whole book earns per day from time decay.

**Vega Concentration**
Short-volatility risk by underlying × expiration. All values are negative (credit spreads are short premium = short vega). More red = more exposure to a volatility spike. Rows sorted by vega total ascending (most exposed first). Grand total = approximate dollar loss across the book per 1% rise in IV.

**Delta Concentration**
Net directional exposure by underlying × expiration. Bull Put spreads contribute positive delta, Bear Call spreads contribute negative delta. Diverging color scale (green = positive, red = negative). Rows sorted by delta total descending (most positive first).

**Gamma Concentration**
Convexity risk by underlying × expiration. All values are negative (credit spreads are short gamma). More red = more exposure to large moves in either direction. Rows sorted by gamma total ascending (most exposed first).

**Theta / |Gamma| Quality**
Each spread ranked by daily theta earned per unit of gamma risk. Higher is better — the position is well-compensated for its convexity exposure. Useful for identifying positions to close to free up capital. Positions with gamma = 0 are listed at the bottom.

**Theta / |Vega| Quality**
Each spread ranked by daily theta earned per unit of vega exposure. Higher is better — the position is well-compensated for its volatility risk. Low values identify the first candidates to close into a volatility spike. Complements Theta/|Gamma|: gamma risk is acute and move-driven; vega risk is broader and regime-driven.

**Position Scorecard**
All metrics side-by-side in one table, each column independently color-normalized. Grouped by expiration, sorted by theta within each group.

| Column | Description |
|---|---|
| Chance | Platform's probability of max profit (both legs expire worthless) |
| Credit | Net premium collected |
| Max Profit | Maximum possible gain |
| Max Loss | Maximum possible loss |
| EV | `Chance × MaxProfit − (1−Chance) × MaxLoss` — binary-outcome expected value. Negative EV is typical since max loss >> max profit; use it as a relative comparison across positions, not an absolute signal. |
| Θ Theta | Daily time decay (positive = earns with each passing day) |
| Vega | Sensitivity to implied volatility (negative = hurt by IV spikes) |
| Γ Gamma | Convexity (negative for credit spreads — large moves in either direction hurt) |
| IV | Implied volatility at entry |
| Θ/\|Γ\| | Quality ratio: theta per unit of gamma risk |
| Θ/\|V\| | Quality ratio: theta per unit of vega exposure |
| Return | Current return on the position |

An expandable column guide at the bottom of the scorecard explains EV and all columns to its right in detail.

**JSON snapshot**
`portfolio.js` also writes `reports/*-portfolio.json` — a machine-readable version of the scorecard. Each file is timestamped and contains all position metrics with ISO-formatted expiration dates. Intended for downstream use: periodic risk checks, alerts on low-quality positions, and trend graphs across snapshots over time.

## Requirements

Node.js 20.6+. Dependencies: `playwright` (browser automation for `download.js`) and `xlsx` (SheetJS, xlsx → csv conversion).
