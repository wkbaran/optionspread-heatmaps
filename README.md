# optionspread-heatmaps

Generates heatmap visualizations from options spread CSV exports from [OptionStrat](https://optionstrat.com). Produces self-contained HTML files with no dependencies.

## Usage

```bash
node index.js <csv-file>
node portfolio.js <csv-file>
```

Each script reads the CSV and writes an HTML file to the same directory:

| Script | Output | Contents |
|---|---|---|
| `index.js` | `*-heatmaps.html` | Delta and gamma heatmaps |
| `portfolio.js` | `*-portfolio.html` | Theta, vega, quality, and full scorecard |

## Downloading from OptionStrat (automated)

```bash
npm ci               # use ci, not install — enforces the lock file exactly
cp .env.example .env # add your credentials
node download.js     # downloads Group: Live → CSV
```

`npm ci` is intentional: it fails if `package-lock.json` doesn't match `package.json`, preventing a compromised upstream version from silently entering the build.

## Exporting from OptionStrat (manual)

1. Open your positions on [OptionStrat](https://optionstrat.com)
2. Use the **Live Active by Expiration** export
3. Pass the downloaded CSV to either script

Individual option legs and non-spread positions (long calls, long puts) are filtered out automatically. Only spreads are included.

## Heatmaps

### `index.js` — Delta & Gamma

**Position Deltas / Gammas (Individual)**
Each spread as a row, sorted by value. Color encodes the greek — green for positive, red for negative, scaled to the range of the data.

**Combined Delta / Gamma by Underlying × Expiration**
2D grid with underlying symbols as rows and expiration dates as columns. Cell color = summed greek for that ticker and expiry. Includes row totals and a grand total footer row for delta.

---

### `portfolio.js` — Theta, Vega, Quality & Scorecard

**Theta Concentration**
Daily time decay by underlying × expiration. Green = more theta collected. Grand total = how much the whole book earns per day from time decay.

**Vega Concentration**
Short-volatility risk by underlying × expiration. All values are negative (credit spreads are short premium = short vega). More red = more exposure to a volatility spike hitting that position. Grand total = approximate dollar loss across the book per 1% rise in IV.

**Theta / |Gamma| Quality**
Each spread ranked by how much daily theta it earns per unit of gamma risk. Higher is better — the position is well-compensated for its convexity exposure. Positions with gamma = 0 are listed at the bottom.

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
| Return | Current return on the position |

## Requirements

Node.js 16+. No npm dependencies.
