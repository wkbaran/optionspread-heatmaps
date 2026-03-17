#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EMAIL = process.env.OPTIONSTRAT_EMAIL;
const PASSWORD = process.env.OPTIONSTRAT_PASSWORD;
const HEADLESS = process.env.HEADLESS !== 'false';

if (!EMAIL || !PASSWORD) {
  console.error('Missing OPTIONSTRAT_EMAIL or OPTIONSTRAT_PASSWORD in .env');
  process.exit(1);
}


function xlsxToCsv(xlsxBuffer) {
  const workbook = XLSX.read(xlsxBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
}

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to OptionStrat...');
    await page.goto('https://optionstrat.com', { waitUntil: 'networkidle' });

    // Click Log In in the top-right
    await page.click('text=Log In');
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="mail" i]');

    console.log('Logging in...');
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="mail" i]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"], button:has-text("Log In")');

    // Wait for login to complete — nav should show account area
    await page.waitForSelector('text=My Account', { timeout: 15000 });
    console.log('Logged in.');

    // Navigate directly to saved trades
    console.log('Opening saved trades...');
    await page.goto('https://optionstrat.com/saved', { waitUntil: 'networkidle' });

    // Ensure "Live" is selected in the Group dropdown
    const groupSelect = page.locator('select, [role="combobox"]').filter({ hasText: /live|group/i }).first();
    const groupVisible = await groupSelect.isVisible().catch(() => false);
    if (groupVisible) {
      const current = await groupSelect.inputValue().catch(() => '');
      if (!current.toLowerCase().includes('live')) {
        console.log('Selecting "Live" group...');
        await groupSelect.selectOption({ label: 'Live' });
        await page.waitForTimeout(1000);
      } else {
        console.log('Group "Live" already selected.');
      }
    } else {
      console.log('Group dropdown not found — proceeding with current selection.');
    }

    // Open export modal
    console.log('Clicking Export...');
    await page.click('button:has-text("Export"), a:has-text("Export")');
    await page.waitForSelector('text=Export as .xlsx', { timeout: 10000 });

    // Click the xlsx button in the modal and capture the download
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.click('button:has-text("Export as .xlsx"), a:has-text("Export as .xlsx")');
    const download = await downloadPromise;

    const tmpPath = await download.path();
    if (!tmpPath) throw new Error('Download failed — no file path returned.');

    // Derive output name from the downloaded filename (replace .xlsx extension with .csv)
    const suggestedName = download.suggestedFilename();
    const csvName = suggestedName.replace(/\.xlsx$/i, '.csv');
    const outPath = path.join(__dirname, csvName);

    const xlsxBuffer = fs.readFileSync(tmpPath);
    const csv = xlsxToCsv(xlsxBuffer);
    fs.writeFileSync(outPath, csv);
    console.log(`Saved: ${csvName}`);
  } finally {
    await browser.close();
  }
})();
