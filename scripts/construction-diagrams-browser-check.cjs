// Local production-build smoke test. All API traffic is intercepted; no server data is modified.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dist = path.resolve(__dirname, '../dist');
const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.resolve(dist, '.' + requested);
  if (!file.startsWith(dist + path.sep)) file = path.join(dist, 'index.html');
  if (!path.extname(file)) file += '.html';
  if (!fs.existsSync(file)) file = path.join(dist, 'index.html');
  const ext = path.extname(file);
  res.setHeader('Content-Type', ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : ext === '.html' ? 'text/html' : 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://film-cutting-app.pages.dev/api/**', async route => {
      const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS', 'Content-Type': 'application/json' };
      const session = route.request().url().includes('/auth/session');
      await route.fulfill({ status: session ? 200 : 404, headers, body: session ? JSON.stringify({ user: { id: 'diagram-browser-test', email: 'test@example.invalid', role: 'owner' } }) : '{}' });
    });
    await page.goto(base + '/input');
    const picker = page.frameLocator('iframe[title="시공부위 도면선택"]');
    await picker.locator('[data-input-board]').waitFor();
    const board = await picker.locator('[data-input-board]').boundingBox();
    await picker.locator('[data-input-board]').click({ position: { x: board.width * 5 / 24, y: board.height * 5 / 16 } });
    await picker.locator('[data-use-selection]').click();
    await page.getByRole('textbox', { name: /G02.*소그룹 이름/ }).waitFor();
    const subgroupCount = await page.getByRole('textbox', { name: /소그룹 이름/ }).count();
    await picker.locator('[data-use-selection]').click();
    assert.equal(await page.getByRole('textbox', { name: /소그룹 이름/ }).count(), subgroupCount, 'same ID reopens subgroup without duplication');
    await page.getByRole('tab', { name: /모눈 제작/ }).click();
    const editor = page.frameLocator('iframe[title="모눈 도면제작"]');
    await editor.locator('[data-editor-screen]').waitFor();
    await editor.locator('[data-part]').selectOption('vanity');
    await editor.locator('[data-grow-x]').click(); await editor.locator('[data-grow-y]').click();
    await editor.locator('select[data-role]').selectOption('top');
    const grid = await editor.locator('[data-board]').boundingBox();
    await page.mouse.move(grid.x + grid.width * 2.5 / 25, grid.y + grid.height * 2.5 / 17);
    await page.mouse.down();
    await page.mouse.move(grid.x + grid.width * 7.5 / 25, grid.y + grid.height * 6.5 / 17, { steps: 6 });
    await page.mouse.up();
    assert.equal(await editor.locator('[data-svg] .cell[data-role="top"]').count(), 30);
    await editor.locator('[data-preset-name]').fill('화장대 윗판'); await editor.locator('[data-save-preset]').click();
    await page.waitForFunction(() => Object.keys(localStorage).some(k => k.includes('diagrams-v1') && localStorage.getItem(k).includes('화장대 윗판')));
    await page.getByRole('tab', { name: /재단 계산/ }).click();
    await picker.locator('[data-input-part]').selectOption('vanity');
    await picker.locator('[data-input-svg] .cell[data-role="top"]').first().waitFor();
    assert.equal(await picker.locator('[data-input-svg] .cell').count(),30);
    await picker.locator('[data-input-svg] .cell[data-role="top"]').first().click();
    console.log('picker after selection:', await picker.locator('[data-input-selection]').innerText(), await picker.locator('[data-input-svg]').getAttribute('viewBox'));
    await picker.locator('[data-use-selection]').click();
    await page.getByRole('textbox', { name: /G05.*소그룹 이름/ }).waitFor();
    for (const width of [360, 736]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no page overflow ' + width);
      assert(await picker.locator('#construction-grid-editor').evaluate(el => el.scrollWidth <= el.clientWidth), 'no diagram overflow ' + width);
    }
    await page.goto(base + '/diagrams');
    await editor.locator('[data-svg] .cell[data-role="top"]').first().waitFor();
    assert.equal(await editor.locator('[data-svg]').getAttribute('viewBox'), '0 0 500 340');
    assert.equal(await editor.locator('[data-svg] .cell[data-role="top"]').count(),30);
    assert.deepEqual(errors, []);
    console.log('PASS: production build picker/subgroup ID; duplicate prevention; editor grid/roles/preset persistence; tab synchronization; reload; mobile widths; no runtime errors');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
