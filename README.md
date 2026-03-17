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
| `run.sh` | — | Full pipeline: download, convert, heatmaps, portfolio |
| `download.js` | — | `data/*.csv` (downloads Group: Live from OptionStrat, converts xlsx → csv) |
| `index.js <csv>` | CSV file | `reports/*-heatmaps.html` |
| `portfolio.js <csv>` | CSV file | `reports/*-portfolio.html`, `reports/*-portfolio.json` |

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

### Security note

`npm ci` is intentional: it treats `package-lock.json` as authoritative and fails if anything drifts, preventing a compromised upstream package version from silently entering the build. Never use `npm install` on this project.

## Manual export from OptionStrat

1. Open your positions on [OptionStrat](https://optionstrat.com)
2. Saved Trades → Group: Live → Export → Export as .xlsx (Excel)
3. Convert the xlsx to CSV and pass it to `index.js` or `portfolio.js`

Individual option legs and non-spread positions are filtered out automatically. Only spreads are included.

## Heatmaps — `index.js`

**Position Deltas / Gammas (Individual)**
Each spread as a row, sorted by value. Color encodes the greek — green for positive, red for negative, scaled to the range of the data.

**Combined Delta / Gamma by Underlying × Expiration**
2D grid with underlying symbols as rows and expiration dates as columns. Cell color = summed greek for that ticker and expiry. Includes row totals and a grand total footer row for delta.

## Portfolio analysis — `portfolio.js`

**Theta Concentration**
Daily time decay by underlying × expiration. Green = more theta collected. Grand total = how much the whole book earns per day from time decay.

**Vega Concentration**
Short-volatility risk by underlying × expiration. All values are negative (credit spreads are short premium = short vega). More red = more exposure to a volatility spike. Grand total = approximate dollar loss across the book per 1% rise in IV.

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

Node.js 20.6+. One npm dependency: `xlsx` (SheetJS) for xlsx → csv conversion.
