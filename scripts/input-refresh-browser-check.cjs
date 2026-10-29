// Isolated browser regression: local build only, API calls intercepted, no real project writes.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dist = path.resolve(__dirname, '../dist');
const server = http.createServer((req, res) => {
  let requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/film-cutting-app(?=\/|$)/, '');
  let file = path.resolve(dist, '.' + requested);
  if (!file.startsWith(dist + path.sep)) file = path.join(dist, 'index.html');
  if (!path.extname(file)) file += '.html';
  if (!fs.existsSync(file)) file = path.join(dist, 'index.html');
  const ext = path.extname(file);
  res.setHeader('Content-Type', ext === '.js' ? 'application/javascript; charset=utf-8' : ext === '.css' ? 'text/css' : 'text/html; charset=utf-8');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    let page = await browser.newPage({ viewport: { width: 610, height: 884 } });
    await page.clock.install();
    page.on('dialog', dialog => dialog.accept());
    const mockApi = async route => {
      const session = route.request().url().includes('/auth/session');
      assert.equal(route.request().method() === 'PUT', false, 'draft recovery must not write server projects');
      await route.fulfill({ status: session ? 200 : 404, headers: { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Content-Type': 'application/json' }, body: session ? JSON.stringify({ user: { id: 'refresh-test', email: 'refresh@example.invalid', role: 'owner' } }) : '{}' });
    };
    await page.route('**/api/**', mockApi);
    const url = base + '/input';
    await page.goto(url);
    const product = page.getByRole('textbox', {name: /제품 번호/}).first();
    await product.fill('REFRESH-KEEP-27');
    await product.blur();
    assert.equal(await page.evaluate(() => {
      const event=new KeyboardEvent('keydown',{key:'F5',cancelable:true});
      window.dispatchEvent(event);return event.defaultPrevented;
    }),true,'keyboard refresh is prevented');
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.includes('current-group-estimate') && localStorage.getItem(key).includes('REFRESH-KEEP-27')));
    await page.reload();
    await product.waitFor();
    // Retry for async hydration; failure reports the user's exact missing input.
    await product.evaluate(async element => {
      const started = Date.now();
      while (element.value !== 'REFRESH-KEEP-27' && Date.now() - started < 3000) await new Promise(resolve => setTimeout(resolve, 25));
    });
    assert.equal(await product.inputValue(), 'REFRESH-KEEP-27', 'refresh must preserve uncalculated cutting input');
    console.log('PASS: uncalculated product input survives refresh without a server save.');
    // Wait for an actual one-minute automatic backup, then damage temporary input.
    await product.fill('SECOND-VERSION');
    await product.blur();
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.includes('input-draft-v1:') && key.endsWith(':unsaved') && localStorage.getItem(key).includes('SECOND-VERSION')));
    await page.clock.fastForward(60_000);
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.endsWith(':backup') && localStorage.getItem(key).includes('SECOND-VERSION')));
    await page.evaluate(() => {
      const key=Object.keys(localStorage).find(key=>key.includes('input-draft-v1:') && key.endsWith(':unsaved'));
      if(!key)throw Error('draft key missing');
      localStorage.setItem(key,'damaged');
    });
    await page.reload();
    await product.waitFor();
    assert.equal(await product.inputValue(),'SECOND-VERSION','previous generation restores after primary damage');
    console.log('PASS: one-minute local backup restores after temporary input corruption.');
    // Clock mocks intentionally replace Performance navigation entries. Use real navigation
    // timing in a separate context for the explicit new-project/reload distinction.
    await page.close();
    page = await browser.newPage({ viewport: { width: 610, height: 884 } });
    page.on('dialog',dialog=>dialog.accept());
    await page.route('**/api/**',mockApi);
    const newProduct=page.getByRole('textbox',{name:/제품 번호/}).first();
    await page.goto(url+'?newProject=1');
    await newProduct.waitFor();
    assert.equal(await newProduct.inputValue(),'','explicit new project must not inherit old draft');
    await newProduct.fill('NEW-PROJECT-KEEP');
    await newProduct.blur();
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.includes('input-draft-v1:') && key.endsWith(':unsaved') && localStorage.getItem(key).includes('NEW-PROJECT-KEEP')));
    await page.reload();
    await newProduct.waitFor();
    assert.equal(await newProduct.inputValue(),'NEW-PROJECT-KEEP','refresh with newProject query must not reset new input');
    await page.getByRole('button',{name:'입력 초기화',exact:true}).click();
    assert.equal(await newProduct.inputValue(),'','explicit reset clears input');
    await page.reload();await newProduct.waitFor();
    assert.equal(await newProduct.inputValue(),'','explicit reset stays cleared after reload');
    console.log('PASS: new project opens blank but preserves its input on reload.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
