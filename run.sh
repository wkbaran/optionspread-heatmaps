#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Downloading..."
csv=$(node --env-file=.env download.js | tail -n1)

if [[ -z "$csv" ]]; then
  echo "ERROR: download.js produced no output path" >&2
  exit 1
fi

echo "==> CSV: $csv"
echo "==> Generating heatmaps..."
node index.js "$csv"

echo "==> Generating portfolio..."
node portfolio.js "$csv"

echo "==> Done."
