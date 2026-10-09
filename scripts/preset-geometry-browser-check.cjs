const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://diagram-test.invalid/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.resolve(__dirname,'../public/construction-cabinets.html'),'utf8')}));
 await page.goto('https://diagram-test.invalid/');
 await page.evaluate(()=>window.addEventListener('message',e=>{if(e.data.type==='diagram-save')window.lastSaved=e.data.state;}));
 const init=async shapes=>{
   await page.evaluate(shapes=>window.postMessage({type:'diagram-init',canSelect:true,presets:[{id:'P1',part:'upper',name:'상부장A',size:{cols:24,rows:16},shapes}]},'*'),shapes);
   await page.locator('[data-custom-preset] option[value="P1"]').waitFor({state:'attached'});
   await page.locator('[data-custom-preset]').selectOption('P1');
 };
 const box=id=>page.locator(`[data-preset-shape="${id}"] rect`).evaluate(r=>Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(r.getAttribute(k))])));
 // Minimal reproduction: individual packing destroys the source's relative position.
 await init([{id:1,role:'side',name:'좌판',cells:[0,24]},{id:2,role:'side',name:'우판',cells:[4,28]}]);
 let a=await box(1),b=await box(2);
 assert.equal(b.x-a.x,80,'four grid columns must remain four columns apart');
 // Symmetric frame: both inner gaps and the bottom endpoints must match the grid.
 const rect=(x,y,w,h)=>Array.from({length:w*h},(_,i)=>(y+Math.floor(i/w))*24+x+i%w);
 const shapes=[{id:1,role:'side',name:'좌판',cells:rect(0,0,1,12)},{id:2,role:'side',name:'우판',cells:rect(9,0,1,12)},{id:3,role:'top',name:'윗판',cells:rect(1,0,8,2)},{id:4,role:'front',name:'앞판',cells:rect(2,4,6,7)}];
 await init(shapes);const original=await Promise.all([1,2,3,4].map(box));
 assert.equal(original[3].x-(original[0].x+original[0].width),original[1].x-(original[3].x+original[3].width),'symmetric grid gaps stay symmetric');
 assert.equal(original[0].y+original[0].height,original[1].y+original[1].height,'equal side lengths have equal endpoints');
 assert.equal(original[3].height,140,'seven-cell front keeps all seven cells');
 assert.equal(await page.locator('[data-illustration-gap]').inputValue(),'1','default gap is 1');
 await page.locator('[data-illustration-gap]').fill('4');await page.locator('[data-illustration-gap]').dispatchEvent('input');
 assert.deepEqual(await Promise.all([1,2,3,4].map(box)),original,'gap adjustment never resizes or relocates source members');
 assert.equal(await page.locator('[data-member-separator]').first().getAttribute('stroke-width'),'4','gap controls visible member separation');
 await page.locator('[data-preset-shape="4"]').click();assert.equal(await page.locator('[data-search]').inputValue(),'P1-G04 앞판');
 if(process.env.DIAGRAM_SCREENSHOT)await page.screenshot({path:process.env.DIAGRAM_SCREENSHOT,fullPage:true});
 const saved=await page.evaluate(()=>window.lastSaved);assert.equal(saved.illustrationGap,4);
 await page.reload();
 await page.evaluate(({saved,shapes})=>window.postMessage({type:'diagram-init',state:saved,canSelect:true,presets:[{id:'P1',part:'upper',name:'상부장A',size:{cols:24,rows:16},shapes}]},'*'),{saved,shapes});
 await page.locator('[data-custom-preset] option[value="P1"]').waitFor({state:'attached'});await page.locator('[data-custom-preset]').selectOption('P1');
 assert.equal(await page.locator('[data-illustration-gap]').inputValue(),'4','saved gap survives reload');
 assert.deepEqual(await Promise.all([1,2,3,4].map(box)),original,'source geometry survives reload');
 assert.deepEqual(errors,[]);console.log('PASS: source geometry, symmetric gaps/endpoints, adjustable default-1 separators, stable selection');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
