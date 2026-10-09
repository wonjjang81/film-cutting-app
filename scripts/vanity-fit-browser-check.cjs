const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('fs'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:601,height:884}});await page.route('https://diagram-test.invalid/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('public/construction-cabinets.html','utf8')}));await page.goto('https://diagram-test.invalid/');
 const cols=32,rect=(x,y,w,h)=>Array.from({length:w*h},(_,i)=>(y+Math.floor(i/w))*cols+x+i%w);
 const shapes=[{id:56,role:'side',name:'외좌',cells:rect(0,0,1,32)},{id:57,role:'molding',name:'몰딩',cells:rect(2,0,21,2)},{id:59,role:'top',name:'윗판',cells:rect(2,3,21,1)},{id:60,role:'side',name:'내좌',cells:rect(2,5,1,27)},{id:62,role:'drawer',name:'서랍좌',cells:rect(4,10,8,4)},{id:65,role:'drawer',name:'서랍우',cells:rect(13,10,8,4)},{id:66,role:'side',name:'내우',cells:rect(22,5,1,27)},{id:67,role:'side',name:'외우',cells:rect(24,0,1,32)},{id:68,role:'bottom',name:'밑판',cells:rect(4,15,17,7)}];
 const init=async extra=>{await page.evaluate(({shapes,cols})=>window.postMessage({type:'diagram-init',canSelect:true,presets:[{id:'P5',part:'vanity',name:'A',size:{cols,rows:40},shapes}]},'*'),{shapes:[...shapes,...extra],cols});await page.locator('[data-view]').selectOption('vanity');await page.locator('[data-custom-preset]').selectOption('P5');};
 const box=id=>page.locator(`[data-preset-shape="${id}"] rect`).evaluate(r=>Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(r.getAttribute(k))])));
 const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 await init([]);let b=Object.fromEntries(await Promise.all(shapes.map(async s=>[s.id,await box(s.id)])));
 for(const id of [56,60,66,67])close(b[id].y+b[id].height,b[68].y+b[68].height);
 close(b[62].width,160);close(b[65].width,160);close(b[62].height,80);close(b[65].height,80);
 close(b[65].x-b[62].x-b[62].width,20/3);assert(b[57].width<420);assert(b[68].width<340);
 await init([{id:70,role:'empty',name:'Empty',cells:rect(12,10,1,4)}]);
 b=Object.fromEntries(await Promise.all([62,65,70].map(async id=>[id,await box(id)])));
 close(b[70].width,20);close(b[70].height,80);close(b[65].x-b[62].x-b[62].width,20);
 await page.locator('[data-preset-shape="70"]').click();assert(await page.locator('[data-popup-input]').isDisabled());
 if(process.env.DIAGRAM_SCREENSHOT)await page.screenshot({path:process.env.DIAGRAM_SCREENSHOT,fullPage:true});
 console.log('PASS: vanity side/base endpoints, drawer sizes, real gaps, flexible spans, reserved Empty');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
