#!/usr/bin/env bash
# Generate a fresh report and publish it to S3/CloudFront.
# Same steps as .github/workflows/update-portfolio.yml, for running under cron.
set -euo pipefail

cd "$(dirname "$0")"

BUCKET="${S3_BUCKET:-optionspread-heatmaps-billbaran}"
DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-E3AR100VQDUFIT}"

echo "==> $(date '+%Y-%m-%d %H:%M:%S %Z') starting publish"

bash run.sh

echo "==> Uploading data and reports to s3://$BUCKET/"
aws s3 sync data/ "s3://$BUCKET/data/" --only-show-errors
aws s3 sync reports/ "s3://$BUCKET/" --exclude 'index.html' --only-show-errors

echo "==> Regenerating index from S3 contents"
aws s3 ls "s3://$BUCKET/" | awk '{print $4}' | node generate-index.js --stdin
aws s3 cp reports/index.html "s3://$BUCKET/index.html" --only-show-errors
aws s3 cp reports/archive.html "s3://$BUCKET/archive.html" --only-show-errors

echo "==> Invalidating CloudFront cache"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text

echo "==> $(date '+%Y-%m-%d %H:%M:%S %Z') publish complete"
