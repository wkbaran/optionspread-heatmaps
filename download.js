#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EMAIL = process.env.OPTIONSTRAT_EMAIL;
const PASSWORD = process.env.OPTIONSTRAT_PASSWORD;
const HEADLESS = process.env.HEADLESS !== 'false';
const SESSION_FILE = path.join(__dirname, '.session.json');

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
  const sessionExists = fs.existsSync(SESSION_FILE);
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext(
    sessionExists ? { storageState: SESSION_FILE } : {}
  );
  const page = await context.newPage();

  try {
    console.error('Navigating to OptionStrat...');
    await page.goto('https://optionstrat.com', { waitUntil: 'networkidle' });

    // Check if already logged in
    const loggedIn = await page.locator('text=My Account').isVisible().catch(() => false);

    if (!loggedIn) {
      console.error('Session expired or missing — logging in...');
      await page.click('text=Log In');
      await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="mail" i]');

      await page.fill('input[type="email"], input[name="email"], input[placeholder*="mail" i]', EMAIL);
      await page.fill('input[type="password"]', PASSWORD);
      await page.click('button[type="submit"], button:has-text("Log In")');

      await page.waitForSelector('text=My Account', { timeout: 15000 });
      console.error('Logged in. Saving session...');
      await context.storageState({ path: SESSION_FILE });
    } else {
      console.error('Resumed existing session.');
    }

    // Navigate directly to saved trades
    console.error('Opening saved trades...');
    await page.goto('https://optionstrat.com/saved', { waitUntil: 'networkidle' });

    // Ensure "Live" is selected in the Group dropdown
    const groupSelect = page.locator('select, [role="combobox"]').filter({ hasText: /live|group/i }).first();
    const groupVisible = await groupSelect.isVisible().catch(() => false);
    if (groupVisible) {
      const current = await groupSelect.inputValue().catch(() => '');
      if (!current.toLowerCase().includes('live')) {
        console.error('Selecting "Live" group...');
        await groupSelect.selectOption({ label: 'Live' });
        await page.waitForTimeout(1000);
      } else {
        console.error('Group "Live" already selected.');
      }
    } else {
      console.error('Group dropdown not found — proceeding with current selection.');
    }

    // Open export modal
    console.error('Clicking Export...');
    await page.click('button:has-text("Export"), a:has-text("Export")');
    await page.waitForSelector('text=Export as .xlsx', { timeout: 10000 });

    // Click the xlsx button in the modal and capture the download
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.click('button:has-text("Export as .xlsx"), a:has-text("Export as .xlsx")');
    const download = await downloadPromise;

    const tmpPath = await download.path();
    if (!tmpPath) throw new Error('Download failed — no file path returned.');

    // Save xlsx to data/
    const dataDir = path.join(__dirname, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const suggestedName = download.suggestedFilename();
    const xlsxPath = path.join(dataDir, suggestedName);
    fs.copyFileSync(tmpPath, xlsxPath);
    console.error(`Downloaded: ${suggestedName}`);

    // Convert to csv — only delete xlsx if conversion succeeds
    const csvName = suggestedName.replace(/\.xlsx$/i, '.csv');
    const csvPath = path.join(dataDir, csvName);
    const xlsxBuffer = fs.readFileSync(xlsxPath);
    const csv = xlsxToCsv(xlsxBuffer);
    fs.writeFileSync(csvPath, csv);
    fs.unlinkSync(xlsxPath);
    console.error(`Converted: ${csvName}`);

    // Print csv path to stdout for callers to capture
    console.log(csvPath);
  } finally {
    await browser.close();
  }
})();
