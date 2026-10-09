const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://diagram-test.invalid/**', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.resolve(__dirname, '../public/construction-diagram.html'), 'utf8') }));
    await page.goto('https://diagram-test.invalid/?mode=editor');
    await page.evaluate(() => window.postMessage({ type: 'diagram-init', state: { version: 2, part: 'upper', next: 8, nextPreset: 1, selected: 7, drawings: { upper: [{ id: 7, role: 'molding', name: '몰딩', cells: [0] }] }, presets: [] } }, '*'));
    await page.waitForFunction(() => document.querySelector('[data-info]').value.length > 0);
    assert.equal(await page.locator('[data-info]').inputValue(), 'G07 몰딩');
    await page.locator('[data-name]').fill('상부 테두리');
    assert.equal(await page.locator('[data-info]').inputValue(), 'G07 몰딩', 'custom name must not be appended to selection info');
    assert.equal(await page.locator('[data-name]').inputValue(), '상부 테두리', 'saved editable name is retained');
    console.log('PASS: selection information is ID + role only; editable custom names retained');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
