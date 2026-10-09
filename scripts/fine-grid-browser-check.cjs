const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://diagram-test.invalid/**', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.resolve(__dirname, '../public/construction-diagram.html'), 'utf8') }));
    await page.goto('https://diagram-test.invalid/?mode=editor');
    await page.evaluate(() => { window.saved = null; window.addEventListener('message', e => { if (e.data.type === 'diagram-save') window.saved = e.data.state; }); window.postMessage({ type: 'diagram-init' }, '*'); });
    await page.locator('[data-board]').waitFor();
    assert.match(await page.locator('[data-grid-size]').innerText(), /48 × 세로 32/);
    const drag = async (role, x, y, w, h) => {
      await page.locator('select[data-role]').selectOption(role);
      await page.locator('[data-new]').click();
      const count = await page.evaluate(() => window.saved?.drawings.upper.length || 0);
      await page.locator('[data-board]').scrollIntoViewIfNeeded();
      await page.evaluate(() => { const board=document.querySelector('[data-board]'), toolbar=document.querySelector('.toolbar'); window.scrollBy(0,board.getBoundingClientRect().top-toolbar.getBoundingClientRect().height-20); });
      const b = await page.locator('[data-board]').boundingBox();
      const point = (cx, cy) => ({ x: b.x + (cx + 0.5) * b.width / 48, y: b.y + (cy + 0.5) * b.height / 32 });
      const a = point(x,y), z = point(x+w-1,y+h-1);
      assert(await page.evaluate(p => !!document.elementFromPoint(p.x,p.y)?.closest('[data-board]'),a),'drawing target must not be covered by sticky toolbar');
      await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(z.x,z.y,{ steps: 3 }); await page.mouse.up();
      await page.waitForFunction(n => window.saved?.drawings.upper.length === n+1,count);
      return page.evaluate(() => window.saved.drawings.upper.at(-1));
    };
    const bounds = s => { const xs=s.cells.map(i=>i%48), ys=s.cells.map(i=>Math.floor(i/48)); return { w:Math.max(...xs)-Math.min(...xs)+1, h:Math.max(...ys)-Math.min(...ys)+1 }; };
    assert.deepEqual(bounds(await drag('side',0,0,1,6)), {w:2,h:6});
    assert.deepEqual(bounds(await drag('bottom',4,0,8,1)), {w:8,h:2});
    assert.deepEqual(bounds(await drag('top',4,4,8,1)), {w:8,h:2});
    assert.deepEqual(bounds(await drag('molding',15,0,8,1)), {w:8,h:3});
    await drag('drawer',4,10,6,5);
    assert.equal(await page.locator('[data-svg] .detail-line').count(), 0, 'drawer has no horizontal divider');
    const front = await drag('front',15,10,6,5);
    assert.equal(front.name,'앞판');
    await page.locator('[data-preset-name]').fill('세밀 도면'); await page.locator('[data-save-preset]').click();
    await page.waitForFunction(() => window.saved.presets.length === 1);
    const before = await page.evaluate(() => window.saved);
    await page.locator('[data-refine]').click(); await page.locator('[data-yes]').click();
    await page.waitForFunction(() => window.saved.sizes.upper.cols === 96);
    const after = await page.evaluate(() => window.saved);
    assert.deepEqual(after.presets,before.presets,'refinement does not overwrite saved presets');
    for (let i=0;i<before.drawings.upper.length;i++) {
      assert.equal(after.drawings.upper[i].id,before.drawings.upper[i].id);
      assert.equal(after.drawings.upper[i].cells.length,before.drawings.upper[i].cells.length*4);
    }
    assert.equal(await page.locator('[data-refine]').isDisabled(),true);
    // Legacy boards retain their original stride until explicitly refined.
    await page.evaluate(() => window.postMessage({type:'diagram-init',state:{version:1,part:'upper',next:2,nextPreset:1,selected:1,drawings:{upper:[{id:1,role:'side',name:'옆판',cells:[0,24]}]},presets:[]}},'*'));
    await page.waitForFunction(() => document.querySelector('[data-svg]').getAttribute('viewBox') === '0 0 480 320');
    await page.locator('[data-refine]').click(); await page.locator('[data-yes]').click();
    await page.waitForFunction(() => window.saved.sizes.upper.cols === 48);
    assert.deepEqual(await page.evaluate(() => window.saved.drawings.upper[0].cells),[0,1,48,49,96,97,144,145]);
    assert.deepEqual(errors,[]);
    console.log('PASS: fine grid, panel/trim thickness, front panels, drawer without lines, safe refinement and legacy IDs');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
