const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:900}});
  const fixture={version:1,part:'upper',next:8,nextPreset:2,selected:null,drawings:{upper:[]},presets:[{id:'P1',part:'upper',name:'기존 상부장',shapes:[{id:7,role:'side',name:'옆판',cells:[0,24]}]}]};
  await page.route('https://diagram-test.invalid/**',r=>r.fulfill({contentType:'text/html',body:r.request().url().includes('/host')?`<iframe style="width:100%;height:1050px;border:0" src="/editor?mode=editor" sandbox="allow-scripts"></iframe><script>const frame=document.querySelector('iframe');window.saved=null;window.addEventListener('message',e=>{if(e.source!==frame.contentWindow)return;if(e.data.type==='diagram-ready')frame.contentWindow.postMessage({type:'diagram-init',state:${JSON.stringify(fixture)}},'*');if(e.data.type==='diagram-height')frame.style.height=e.data.height+'px';if(e.data.type==='diagram-save')window.saved=e.data.state;});</script>`:fs.readFileSync(path.resolve(__dirname,'../public/construction-diagram.html'),'utf8')}));
  await page.goto('https://diagram-test.invalid/host');
  const editor=page.frameLocator('iframe');
  await editor.locator('[data-preset]').selectOption('P1');
  await editor.locator('[data-delete-preset]').click();
  await editor.locator('[data-confirm]').evaluate(el=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const confirm=await editor.locator('[data-confirm]').boundingBox();
  assert(confirm&&confirm.y>=0&&confirm.y+confirm.height<=900,'delete confirmation must be visible next to action, not offscreen above grid: '+JSON.stringify(confirm));
  await editor.locator('[data-no]').click();
  assert.equal(await editor.locator('[data-preset] option[value="P1"]').count(),1,'cancel preserves preset');
  await editor.locator('[data-refine]').click(); await editor.locator('[data-yes]').click();
  await page.waitForFunction(()=>window.saved!==null);
  const result=await page.evaluate(()=>window.saved);
  assert.deepEqual(result.presets[0].size,{cols:48,rows:32},'selected legacy preset is refined and saved, not an unrelated blank board');
  assert.deepEqual(result.presets[0].shapes[0].cells,[0,1,48,49,96,97,144,145]);
  assert.equal(result.presets[0].shapes[0].id,7);
  await editor.locator('[data-delete-preset]').click(); await editor.locator('[data-yes]').click();
  await page.waitForFunction(()=>window.saved.presets.length===0);
  assert.equal(await editor.locator('[data-preset] option[value="P1"]').count(),0);
  console.log('PASS: visible confirmation; cancel/delete selected preset; refine selected saved preset with stable IDs');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
