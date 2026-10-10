const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://frame-test.invalid/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.resolve(__dirname,'../public/construction-cabinets.html'),'utf8')}));
 await page.goto('https://frame-test.invalid/');
 const rect=(x,y,w,h)=>Array.from({length:w*h},(_,i)=>(y+Math.floor(i/w))*24+x+i%w);
 const shapes=[
 {id:90,role:'molding',cells:rect(1,0,18,2)},
 {id:102,role:'side',cells:[...rect(0,0,1,30),...rect(19,0,1,30)]},
 {id:98,role:'side',cells:[...rect(1,3,1,27),...rect(18,3,1,27)]},
 {id:99,role:'side',cells:[...rect(2,4,1,26),...rect(17,4,1,26)]},
 {id:100,role:'top',cells:rect(3,3,14,1)},
 {id:101,role:'top',cells:rect(4,4,12,1)},
 {id:103,role:'front',cells:rect(3,6,14,24)}
 ].map(s=>({...s,name:s.role,sites:3}));
 await page.evaluate(shapes=>{window.addEventListener('message',e=>{if(e.data.type==='diagram-select')window.selection=e.data.selection;});window.postMessage({type:'diagram-init',canSelect:true,presets:[{id:'P9',name:'A',part:'bathdoor',size:{cols:24,rows:32},shapes}]},'*');},shapes);
 await page.locator('[data-view]').selectOption('bathdoor');await page.locator('[data-custom-preset]').selectOption('P9');
 assert.match(await page.locator('[data-custom-hint]').innerText(),/외곽 상하좌우 고정/,'repeated members must receive frame fitting');
 const boxes=async id=>page.locator('[data-preset-shape="'+id+'"] rect').evaluateAll(rs=>rs.map(r=>Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(r.getAttribute(k))]))));
 const near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-6,m+': '+a+' != '+b);
 const outer=await boxes(102),inner=await boxes(98),sides=await boxes(99),top=(await boxes(90))[0],a=(await boxes(100))[0],b=(await boxes(101))[0],front=(await boxes(103))[0];
 assert.equal(outer.length,2);near(outer[0].x,4,'left anchor');near(outer[1].x+outer[1].width,404,'right anchor');
 near(a.y-top.y-top.height,20/3,'top gap');near(b.y-a.y-a.height,20/3,'middle gap');near(front.y-b.y-b.height,20/3,'front gap');
 near(a.x-inner[0].x-inner[0].width,20/3,'left span gap');near(inner[1].x-a.x-a.width,20/3,'right span gap');
 near(front.x-sides[0].x-sides[0].width,20/3,'left front gap');near(sides[1].x-front.x-front.width,20/3,'right front gap');
 for(const s of [...outer,...inner,...sides])near(s.y+s.height,604,'side bottom anchor');
 await page.locator('[data-preset-shape="102"]').last().press('Enter');
 assert.match(await page.locator('[data-selection]').innerText(),/3개소.*수량 6개/);
 await page.locator('[data-popup-input]').click();await page.waitForFunction(()=>window.selection);
 assert.equal(await page.evaluate(()=>window.selection.id),'P9-G102');assert.equal(await page.evaluate(()=>window.selection.quantity),6);
 assert.deepEqual(errors,[]);console.log('PASS: same-ID repeated frame members fit uniform gaps, keep exterior and selection ID/quantity');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
