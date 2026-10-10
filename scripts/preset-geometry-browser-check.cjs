const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const equal=(a,b,message)=>typeof a==='number'&&typeof b==='number'?assert.ok(Math.abs(a-b)<1e-7,message):assert.equal(a,b,message);
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
 // Minimal reproduction: the actual empty space, not just an outline, must shrink.
 await init([{id:1,role:'side',name:'좌판',cells:[0,24]},{id:2,role:'side',name:'우판',cells:[4,28]}]);
 let a=await box(1),b=await box(2);
 equal(b.x-a.x-a.width,20,'60-unit empty space becomes 20 at default gap 1');
 await page.locator('[data-illustration-gap]').fill('3');await page.locator('[data-illustration-gap]').dispatchEvent('input');
 a=await box(1);b=await box(2);equal(b.x-a.x-a.width,60,'gap 3 restores original actual spacing');
 await page.locator('[data-illustration-gap]').fill('1');await page.locator('[data-illustration-gap]').dispatchEvent('input');
 a=await box(1);b=await box(2);equal(b.x-a.x-a.width,20,'changing gap moves members closer without resizing');
 equal(a.width,20);equal(a.height,40);equal(b.height,40);
 // Vertical gaps use the same ratio; zero spacing does not create overlaps.
 await init([{id:1,role:'single',name:'위',cells:[0]},{id:2,role:'single',name:'아래',cells:[96]}]);
 a=await box(1);b=await box(2);equal(b.y-a.y-a.height,20,'vertical 60-unit gap also becomes 20');
 await page.locator('[data-illustration-gap]').fill('0');await page.locator('[data-illustration-gap]').dispatchEvent('input');
 a=await box(1);b=await box(2);equal(b.y-a.y-a.height,0,'zero spacing produces touching, not overlapping members');
 await page.locator('[data-illustration-gap]').fill('1');await page.locator('[data-illustration-gap]').dispatchEvent('input');
 // Symmetric frame: both inner gaps and the bottom endpoints must match the grid.
 const rect=(x,y,w,h)=>Array.from({length:w*h},(_,i)=>(y+Math.floor(i/w))*24+x+i%w);
 const shapes=[{id:1,role:'side',name:'좌판',cells:rect(0,0,1,12)},{id:2,role:'side',name:'우판',cells:rect(9,0,1,12)},{id:3,role:'top',name:'윗판',cells:rect(1,0,8,2)},{id:4,role:'front',name:'앞판',cells:rect(2,4,6,7)}];
 await init(shapes);const original=await Promise.all([1,2,3,4].map(box));
 equal(original[3].x-(original[0].x+original[0].width),original[1].x-(original[3].x+original[3].width),'symmetric grid gaps stay symmetric');
 equal(original[0].y+original[0].height,original[1].y+original[1].height,'equal side lengths have equal endpoints');
 equal(original[3].height,140,'seven-cell front keeps all seven cells');
 equal(await page.locator('[data-illustration-gap]').inputValue(),'1','default gap is 1');
 equal(Number(await page.locator('[data-member-separator]').first().getAttribute('stroke-width')),1/3,'default separator is one third of its previous width');
 await page.locator('[data-illustration-gap]').fill('4');await page.locator('[data-illustration-gap]').dispatchEvent('input');
 const adjusted=await Promise.all([1,2,3,4].map(box));
 assert.ok(adjusted[3].width<original[3].width,'front resizes to enlarged gaps while outside frame stays fixed');
 equal(adjusted[3].height,original[3].height,'occupied front height stays fixed');
 assert.ok(adjusted[2].width<original[2].width,'perpendicular top-side joints keep clearance');
 equal(Number(await page.locator('[data-member-separator]').first().getAttribute('stroke-width')),4/3,'gap control uses one-third display scale');
 await page.locator('[data-preset-shape="4"]').click();equal(await page.locator('[data-search]').inputValue(),'P1-G04 앞판');
 if(process.env.DIAGRAM_SCREENSHOT)await page.screenshot({path:process.env.DIAGRAM_SCREENSHOT,fullPage:true});
 const saved=await page.evaluate(()=>window.lastSaved);equal(saved.illustrationGap,4);
 await page.reload();
 await page.evaluate(({saved,shapes})=>window.postMessage({type:'diagram-init',state:saved,canSelect:true,presets:[{id:'P1',part:'upper',name:'상부장A',size:{cols:24,rows:16},shapes}]},'*'),{saved,shapes});
 await page.locator('[data-custom-preset] option[value="P1"]').waitFor({state:'attached'});await page.locator('[data-custom-preset]').selectOption('P1');
 equal(await page.locator('[data-illustration-gap]').inputValue(),'4','saved gap survives reload');
 assert.deepEqual(await Promise.all([1,2,3,4].map(box)),adjusted,'adjusted positions and original dimensions survive reload');
 // Connected frame must preserve bottom offsets and the right-hand opening.
 const frame=[{id:1,role:'side',name:'좌',cells:rect(0,0,1,12)},{id:2,role:'side',name:'우',cells:rect(11,0,1,12)},{id:3,role:'top',name:'상',cells:rect(1,0,10,2)},{id:4,role:'front',name:'앞',cells:rect(2,4,8,7)},{id:5,role:'side',name:'내판',cells:rect(10,2,1,10)}];
 await init(frame);
 await page.locator('[data-illustration-gap]').fill('3');await page.locator('[data-illustration-gap]').dispatchEvent('input');
 const beforeFrame=await Promise.all([1,2,3,4,5].map(box));
 await page.locator('[data-illustration-gap]').fill('1');await page.locator('[data-illustration-gap]').dispatchEvent('input');
 const afterFrame=await Promise.all([1,2,3,4,5].map(box));
 assert.ok(afterFrame[2].width>beforeFrame[2].width,'top expands when exterior clearance shrinks');
 equal(afterFrame[0].y+afterFrame[0].height,afterFrame[1].y+afterFrame[1].height,'shared transform keeps side endpoints aligned');
 equal(afterFrame[4].y+afterFrame[4].height,afterFrame[1].y+afterFrame[1].height,'inner side remains aligned with outer base');
 assert.deepEqual(errors,[]);console.log('PASS: actual gap ratio, connected-frame resizing, occupied face dimensions, symmetry, persistence and stable selection');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
