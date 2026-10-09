const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://diagram-test.invalid/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.resolve(__dirname,'../public/construction-cabinets.html'),'utf8')}));
 await page.goto('https://diagram-test.invalid/');
 await page.evaluate(()=>window.postMessage({type:'diagram-init',canSelect:true,presets:[
 {id:'P1',part:'upper',name:'상부장A',shapes:[{id:1,role:'side',name:'옆판',cells:[0,24]}]},
 {id:'P2',part:'shelf',name:'책장A',roles:{custom1:'선반',single:'싱글장'},shapes:[{id:2,role:'custom1',name:'선반',cells:[0,24]},{id:3,role:'single',name:'장',cells:[0]},{id:4,role:'single',name:'장',cells:[4]}]}
 ]},'*'));
 await page.locator('[data-custom-preset] option[value="P1"]').waitFor({state:'attached'});
 assert.equal(await page.locator('[data-custom-preset] option[value="P2"]').count(),0,'shelf presets hidden in upper section');
 await page.locator('[data-view]').selectOption('shelf');
 assert.equal(await page.locator('[data-custom-preset]').inputValue(),'P2');
 assert.equal(await page.locator('[data-custom-preset] option[value="P1"]').count(),0);
 assert.equal(await page.locator('[data-custom-preset] option[value="P2"]').innerText(),'책장A');
 assert.equal(await page.locator('[data-preset-shape="2"] rect').getAttribute('width'),'20','one-cell side/member width is never forced thin');
 const a=Number(await page.locator('[data-preset-shape="3"] rect').getAttribute('x')),b=Number(await page.locator('[data-preset-shape="4"] rect').getAttribute('x'));
 assert.equal(b-a-20,20,'internal grid spacing shrinks to one third');
 assert.equal(await page.locator('[data-overlap="2"]').count(),1);
 await page.locator('[data-preset-shape="3"]').click();const first=await page.locator('[data-search]').inputValue();
 await page.locator('[data-preset-shape="3"]').click();const second=await page.locator('[data-search]').inputValue();
 assert.notEqual(first,second,'illustration clicks cycle overlapping members');assert([first,second].some(s=>s.includes('선반')),'custom role shown in selection');
 await page.locator('[data-view]').selectOption('upper');
 assert.equal(await page.locator('[data-custom-preset]').inputValue(),'P1');assert.equal(await page.locator('[data-custom-preset] option[value="P1"]').innerText(),'상부장A');
 assert.deepEqual(errors,[]);console.log('PASS: part-specific preset filtering, exact names, drawn thickness, source geometry, custom roles and layered selection');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
