const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('fs'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:601,height:884}});
 await page.route('https://diagram-test.invalid/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('public/construction-cabinets.html','utf8')}));await page.goto('https://diagram-test.invalid/');
 const cols=32,rect=(x,y,w,h)=>Array.from({length:w*h},(_,i)=>(y+Math.floor(i/w))*cols+x+i%w);
 const shapes=[{id:42,role:'side',name:'외좌',cells:rect(0,0,1,32)},{id:43,role:'molding',name:'몰딩',cells:rect(2,0,20,2)},{id:44,role:'side',name:'외우',cells:rect(23,0,1,32)},{id:45,role:'top',name:'윗판',cells:rect(2,3,20,1)},{id:47,role:'side',name:'내좌',cells:rect(2,5,1,27)},{id:48,role:'side',name:'내우',cells:rect(21,5,1,27)},{id:49,role:'top',name:'윗판',cells:rect(4,23,16,1)},{id:50,role:'single',name:'하부장',cells:rect(4,25,16,7)},{id:51,role:'front',name:'뒷판',cells:rect(4,5,16,17)}];
 await page.evaluate(({shapes,cols})=>window.postMessage({type:'diagram-init',canSelect:true,presets:[{id:'P4',part:'shelf',name:'A',size:{cols,rows:40},shapes}]},'*'),{shapes,cols});await page.locator('[data-view]').selectOption('shelf');await page.locator('[data-custom-preset]').selectOption('P4');
 const box=id=>page.locator(`[data-preset-shape="${id}"] rect`).evaluate(r=>Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(r.getAttribute(k))])));
 const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 const b=Object.fromEntries(await Promise.all(shapes.map(async s=>[s.id,await box(s.id)])));
 assert(b[43].width<400,'G43 must shorten to fitted opening');assert(b[45].width<400,'G45 must shorten to fitted opening');
 for(const id of [47,48,50])close(b[id].y+b[id].height,b[42].y+b[42].height);
 close(b[47].x-b[42].x-b[42].width,b[44].x-b[48].x-b[48].width);
 close(b[51].x-b[47].x-b[47].width,b[48].x-b[51].x-b[51].width);
 await page.locator('[data-preset-shape="50"]').click();assert.equal(await page.locator('[data-search]').inputValue(),'P4-G50 싱글장');
 if(process.env.DIAGRAM_SCREENSHOT)await page.screenshot({path:process.env.DIAGRAM_SCREENSHOT,fullPage:true});
 console.log('PASS: shelf top spans shrink, inner sides and lower cabinet reach bottom, symmetric spaces and stable IDs');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
