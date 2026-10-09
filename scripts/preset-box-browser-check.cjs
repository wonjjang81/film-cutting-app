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
    await page.locator('[data-view]').selectOption('vanity');
    await page.locator('[data-custom-preset] option[value="P1"]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('[data-custom-preset] option[value="P1"]').innerText(), '화장대');
    await page.locator('[data-custom-preset]').selectOption('P1');
    assert.equal(await page.locator('[data-preset-shape="7"] rect').count(), 1, 'one smooth box, not six cell rectangles');
    assert.equal(await page.locator('[data-preset-shape="7"] [data-door-divider]').count(), 1, 'double cabinet door divider');
    assert.equal(Number(await page.locator('[data-preset-shape="9"] rect').getAttribute('width')), 20, 'side panel preserves one grid cell thickness');
    assert.equal(Number(await page.locator('[data-preset-shape="11"] rect').getAttribute('height')), 20, 'bottom panel preserves drawn thickness');
    assert.equal(Number(await page.locator('[data-preset-shape="10"] rect').getAttribute('height')), 20, 'molding has no forced thickness');
    assert.equal(await page.locator('[data-preset-shape="9"] title').count(), 1, 'member details remain available');
    // Preserve intentionally thick parts and collapse only unused grid space.
    await page.evaluate(() => window.postMessage({ type: 'diagram-init', canSelect: true, presets: [{ id: 'P2', part: 'vanity', name: '간격 테스트', size: { cols: 24, rows: 16 }, shapes: [
      { id: 1, role: 'side', name: '옆판', cells: [0,1,24,25] },
      { id: 2, role: 'bottom', name: '밑판', cells: [168,169,192,193] },
      { id: 3, role: 'molding', name: '몰딩', cells: [7,8,31,32] }
    ] }] }, '*'));
    await page.locator('[data-custom-preset] option[value="P2"]').waitFor({ state: 'attached' });
    await page.locator('[data-custom-preset]').selectOption('P2');
    const geometry = () => page.evaluate(() => [1,2,3].map(id => { const r = document.querySelector(`[data-preset-shape="${id}"] rect`); return ['x','y','width','height'].map(k => Number(r.getAttribute(k))); }));
    let boxes = await geometry();
    assert.equal(boxes[0][2], 40, 'two-cell side thickness is preserved');
    assert.equal(boxes[1][3], 40, 'two-cell bottom thickness is preserved');
    assert.equal(boxes[2][3], 40, 'two-cell molding thickness is preserved');
    assert.equal(boxes[2][0] - (boxes[0][0] + boxes[0][2]), 2, 'unused columns also collapse to a small gap');
    const before = boxes[1][1] - (boxes[0][1] + boxes[0][3]);
    assert.equal(before, 2, 'five unused rows collapse to one small illustration gap');
    await page.locator('[data-illustration-gap]').fill('8');
    await page.locator('[data-illustration-gap]').dispatchEvent('input');
    boxes = await geometry();
    assert.equal(boxes[1][1] - (boxes[0][1] + boxes[0][3]), 8, 'gap control adjusts unused space, not part size');
    assert.equal(boxes[0][2], 40, 'gap control preserves part size');
    await page.evaluate(() => window.postMessage({ type: 'diagram-init', canSelect: true, presets: [{ id: 'P3', part: 'upper', name: '형태 보존', size: { cols: 24, rows: 16 }, shapes: [
      { id: 1, role: 'single', name: 'ㄱ자', cells: [0,24,48,49,50] },
      { id: 2, role: 'empty', name: 'Empty', cells: [3,4,27,28,51,52] },
      { id: 3, role: 'drawer', name: '서랍장', cells: [5,6,29,30,53,54] },
      { id: 4, role: 'front', name: '앞판', cells: [8,9,32,33] }
    ] }] }, '*'));
    await page.locator('[data-view]').selectOption('upper');
    await page.locator('[data-custom-preset] option[value="P3"]').waitFor({ state: 'attached' });
    await page.locator('[data-custom-preset]').selectOption('P3');
    assert.equal(await page.locator('[data-preset-shape="1"] rect').count(), 0, 'irregular silhouette is not replaced with a box');
    assert.equal(await page.locator('[data-preset-shape="1"] path').first().getAttribute('d'), 'M4 4h20v20h-20zM4 24h20v20h-20zM4 44h20v20h-20zM24 44h20v20h-20zM44 44h20v20h-20z', 'occupied L shape keeps scale and internal opening');
    assert.equal(Number(await page.locator('[data-preset-shape="2"] rect').getAttribute('width')), 40, 'explicit Empty space is preserved');
    assert.equal(await page.locator('[data-preset-shape="3"] [data-door-divider]').count(), 0, 'drawer illustration has no horizontal divider');
    await page.locator('[data-preset-shape="4"]').click();
    assert.equal(await page.locator('[data-search]').inputValue(),'P3-G04 앞판');
    assert.equal(await page.locator('[data-popup-input]').isDisabled(),false,'front panel connects to cutting input');
    await page.locator('[data-preset-shape="2"]').click();
    assert.equal(await page.locator('[data-popup-input]').isDisabled(), true, 'Empty is still non-cuttable');
    // Restore the cabinet fixture to verify ID selection still works.
    await page.reload();
    await page.evaluate(() => window.postMessage({ type: 'diagram-init', canSelect: true, presets: [{ id: 'P1', part: 'vanity', name: '화장대', size: { cols: 24, rows: 16 }, shapes: [{ id: 7, role: 'double', name: '양문', cells: [25,26,27,49,50,51] }] }] }, '*'));
    await page.locator('[data-view]').selectOption('vanity');
    await page.locator('[data-custom-preset] option[value="P1"]').waitFor({ state: 'attached' });
    await page.locator('[data-custom-preset]').selectOption('P1');
    await page.locator('[data-preset-shape="7"]').click();
    assert.equal(await page.locator('[data-search]').inputValue(), 'P1-G07 양문장');
    assert.equal(await page.locator('[data-popup-input]').isDisabled(), false);
    assert.deepEqual(errors, []);
    console.log('PASS: compact illustration gaps; two-cell sizes; one-cell thin panels; irregular/Empty spaces; stable selection ID');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
