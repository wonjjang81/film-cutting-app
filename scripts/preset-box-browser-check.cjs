const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://diagram-test.invalid/**', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.resolve(__dirname, '../public/construction-cabinets.html'), 'utf8') }));
    await page.goto('https://diagram-test.invalid/');
    await page.evaluate(() => window.postMessage({ type: 'diagram-init', canSelect: true, presets: [{ id: 'P1', part: 'vanity', name: '화장대', size: { cols: 24, rows: 16 }, shapes: [{ id: 7, role: 'double', name: '양문', cells: [25,26,27,49,50,51] }, { id: 8, role: 'single', name: '싱글', cells: [28,29,52,53] }, { id: 9, role: 'side', name: '옆판', cells: [24,48,72] }, { id: 10, role: 'molding', name: '몰딩', cells: [1,2,3,4,5] }, { id: 11, role: 'bottom', name: '밑판', cells: [73,74,75,76,77] }] }] }, '*'));
    await page.locator('[data-custom-preset] option[value="P1"]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('[data-custom-preset] option[value="P1"]').innerText(), '화장대');
    await page.locator('[data-custom-preset]').selectOption('P1');
    assert.equal(await page.locator('[data-preset-shape="7"] rect').count(), 1, 'one smooth box, not six cell rectangles');
    assert.equal(await page.locator('[data-preset-shape="7"] [data-door-divider]').count(), 1, 'double cabinet door divider');
    assert.equal(Number(await page.locator('[data-preset-shape="9"] rect').getAttribute('width')), 6, 'side panel is thin');
    assert.equal(Number(await page.locator('[data-preset-shape="11"] rect').getAttribute('height')), 6, 'bottom panel is thin');
    assert.equal(Number(await page.locator('[data-preset-shape="10"] rect').getAttribute('height')), 12, 'molding is thicker than panels');
    assert.equal(await page.locator('[data-preset-shape="9"] text').count(), 0, 'narrow panel uses selection info instead of overflowing text');
    const before = Number(await page.locator('[data-preset-shape="7"] rect').getAttribute('width'));
    await page.locator('[data-illustration-gap]').fill('8');
    await page.locator('[data-illustration-gap]').dispatchEvent('input');
    assert(Number(await page.locator('[data-preset-shape="7"] rect').getAttribute('width')) < before, 'gap adjustment affects display only');
    await page.locator('[data-preset-shape="7"]').click();
    assert.equal(await page.locator('[data-search]').inputValue(), 'P1-G07 양문장');
    assert.equal(await page.locator('[data-popup-input]').isDisabled(), false);
    assert.deepEqual(errors, []);
    console.log('PASS: duplicate part/name removed; smooth box shapes; door divider; adjustable illustration gaps; stable selection ID');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
