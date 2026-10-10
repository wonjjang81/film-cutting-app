const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [320, 390, 610]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('https://toolbar-test.invalid/**', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync('public/construction-cabinets.html', 'utf8') }));
      await page.goto('https://toolbar-test.invalid/');
      await page.evaluate(() => window.postMessage({ type: 'diagram-init', canSelect: true, presets: [{ id: 'P1', name: '화장대A', part: 'vanity', size: { cols: 24, rows: 16 }, shapes: [{ id: 1, role: 'single', name: '싱글', cells: [25, 26, 49, 50] }] }] }, '*'));
      await page.locator('[data-view]').selectOption('vanity');
      const buttons = page.locator('.actions > button');
      assert.deepEqual(await buttons.allTextContents(), ['치수 입력', '형태 변경', '삭제', '＋ 추가']);
      const boxes = await buttons.evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right }; }));
      assert.ok(boxes.every(b => Math.abs(b.y - boxes[0].y) < 1 && b.right <= width), 'toolbar stays on one line');
      assert.ok(boxes[3].x > boxes[2].x, 'add button is rightmost');
      await page.locator('[data-custom-preset]').selectOption('');
      await page.locator('[data-plus]').click();
      assert.ok(await page.locator('[data-add-panel]').isVisible(), 'add still opens');
      await page.locator('[data-cancel-add]').click();
      await page.locator('[data-custom-preset]').selectOption('P1');
      assert.equal(await page.locator('[data-gap-control] .hint').count(), 0);
      assert.equal(await page.locator('[data-gap-control]').evaluate(n => getComputedStyle(n).flexDirection), 'row');
      assert.equal((await page.locator('[data-gap-control]').innerText()).trim(), '간격');
      const alignment = await page.evaluate(() => {
        const search = document.querySelector('[data-search]').getBoundingClientRect();
        const gap = document.querySelector('[data-illustration-gap]').getBoundingClientRect();
        return { searchY: search.y, gapY: gap.y, searchRight: search.right, gapX: gap.x };
      });
      assert.ok(Math.abs(alignment.searchY - alignment.gapY) < 1 && alignment.gapX > alignment.searchRight, 'ID left, gap right on same row');
      await page.evaluate(() => {
        window.__centerMessages = [];
        window.addEventListener('message', e => { if (e.data?.type === 'diagram-illustration-center') window.__centerMessages.push(e.data.centerY); });
        window.postMessage({ type: 'diagram-focus-illustration' }, '*');
      });
      await page.waitForFunction(() => window.__centerMessages.length === 1);
      const actualCenter = await page.locator('[data-custom-illustration]').evaluate(n => { const b = n.getBoundingClientRect(); return b.top + b.height / 2; });
      assert.equal(await page.evaluate(() => window.__centerMessages[0]), actualCenter);
      await page.locator('[data-preset-shape="1"]').click();
      assert.equal(await page.locator('[data-popup-input]').isEnabled(), true);
      assert.deepEqual(errors, []);
      assert.equal(await page.locator('[data-view] option[value="bathdoor"]').innerText(), '문/틀');
      assert.equal(await page.locator('[data-view] option[value="door"]').count(), 0);
      await page.evaluate(() => window.postMessage({ type: 'diagram-init', canSelect: true, presets: [
        { id: 'P2', name: '기존 화장실문', part: 'bathdoor', shapes: [{ id: 1, role: 'single', name: '문', cells: [0] }] },
        { id: 'P3', name: '기존 방문', part: 'door', shapes: [{ id: 2, role: 'single', name: '문', cells: [1] }] }
      ] }, '*'));
      await page.locator('[data-view]').selectOption('bathdoor');
      assert.equal(await page.locator('[data-custom-preset] option').count(), 3, 'both legacy door presets retained');
      await page.locator('[data-custom-preset]').selectOption('P3');
      assert.equal(await page.locator('[data-view]').inputValue(), 'bathdoor');
      assert.equal(await page.locator('[data-preset-shape="2"]').count(), 1);
      await page.locator('[data-custom-preset]').selectOption('');
      await page.locator('[data-plus]').click();
      await page.locator('select[data-kind]').selectOption('single');
      await page.locator('[data-confirm-add]').click();
      assert.ok(await page.locator('[data-id^="T"]').count() > 0, 'bathroom illustration used by unified entry');
      await page.close();
    }
    console.log('PASS: compact gap control, single-row toolbar and working add/select at 320/390/610px');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
