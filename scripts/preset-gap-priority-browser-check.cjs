const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://diagram-test.invalid/**', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.resolve(__dirname, '../public/construction-cabinets.html'), 'utf8') }));
    await page.goto('https://diagram-test.invalid/');
    await page.evaluate(()=>window.addEventListener('message',e=>{if(e.data.type==='diagram-init')window.receivedPreset=e.data.presets[0];}));
    const rect = (x,y,w,h) => Array.from({length:w*h}, (_,i) => (y+Math.floor(i/w))*24+x+i%w);
    const shapes = [
      {id:1,role:'side',name:'좌판',cells:rect(0,0,1,6)},
      {id:2,role:'side',name:'우판',cells:rect(5,0,1,6)},
      {id:3,role:'top',name:'윗판',cells:rect(1,0,4,1)},
      {id:4,role:'front',name:'앞판',cells:rect(2,2,2,3)}
    ];
    const box = id => page.locator(`[data-preset-shape="${id}"] rect`).evaluate(r => Object.fromEntries(['x','y','width','height'].map(k => [k,Number(r.getAttribute(k))])));
    const near = (a,b,message) => assert.ok(Math.abs(a-b)<1e-7, `${message}: ${a} != ${b}`);
    for (const part of ['upper','lower','fridge','vanity','door','sash','shoe','island','bathdoor','wardrobe','shelf','dress']) {
      await page.evaluate(({part,shapes}) => window.postMessage({type:'diagram-init',canSelect:true,presets:[{id:'P1',part,name:'검증A',size:{cols:24,rows:16},shapes}]},'*'),{part,shapes});
      // The available part keys come from the application, rather than display names.
      const available = await page.locator(`[data-view] option[value="${part}"]`).count();
      assert.equal(available,1,`${part}: supported construction part`);
      await page.locator('[data-view]').selectOption(part);
      await page.locator('[data-custom-preset]').selectOption('P1');
      await page.locator('[data-illustration-gap]').fill('1'); await page.locator('[data-illustration-gap]').dispatchEvent('input');
      const [left,right,top,front] = await Promise.all([1,2,3,4].map(box));
      near(front.x-left.x-left.width,20/3,`${part}: left opening shrinks even in connected frame`);
      near(right.x-front.x-front.width,20/3,`${part}: right opening equals left`);
      near(front.y-top.y-top.height,20/3,`${part}: vertical opening shrinks`);
      near(top.width,80,`${part}: touching top-side joints stay closed`);
      near(front.width,80-40/3,`${part}: original front openings shrink uniformly`);
      near(left.y+left.height,right.y+right.height,`${part}: sides share lower endpoint`);
      await page.locator('[data-illustration-gap]').fill('3'); await page.locator('[data-illustration-gap]').dispatchEvent('input');
      near((await box(3)).width,80,`${part}: touching top span remains unchanged`);
    }
    const reserved=[...shapes,{id:5,role:'empty',name:'Empty',cells:rect(1,1,4,5)}];
    await page.evaluate(shapes=>window.postMessage({type:'diagram-init',canSelect:true,presets:[{id:'P2',part:'upper',name:'Empty 보존',size:{cols:24,rows:16},shapes}]},'*'),reserved);
    await page.locator('[data-view]').selectOption('upper');
    await page.locator('[data-custom-preset]').selectOption('P2');
    await page.locator('[data-illustration-gap]').fill('0'); await page.locator('[data-illustration-gap]').dispatchEvent('input');
    near((await box(3)).width,80,'explicit Empty keeps reserved opening even at zero gap');
    near((await box(5)).height,100,'Empty retains original size');
    assert.ok(await page.locator('[data-overlap]').count()>0,'shared cell transform retains overlapping-member markings');
    await page.locator('[data-preset-shape="5"]').press('Enter');
    assert.equal(await page.locator('[data-popup-input]').isDisabled(),true,'Empty never creates a cutting piece');
    await page.locator('[data-preset-shape="4"]').press('Enter');
    assert.equal(await page.locator('[data-search]').inputValue(),'P2-G04 앞판','selection retains original ID');
    assert.equal(await page.locator('[data-popup-input]').isDisabled(),false);
    const pristine=JSON.parse(JSON.stringify(reserved));
    const retained=await page.evaluate(()=>window.receivedPreset.shapes);
    assert.deepEqual(retained,pristine,'rendering never mutates source cells, names or IDs');
    assert.deepEqual(errors,[]);
    console.log('PASS: gap-first connected-frame resizing across construction parts');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
