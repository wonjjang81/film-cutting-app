const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:610,height:1000}});
await page.route('https://vanity-test.invalid/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('public/construction-cabinets.html','utf8')}));
await page.goto('https://vanity-test.invalid/');
const rect=(x,y,w,h)=>Array.from({length:w*h},(_,i)=>(y+Math.floor(i/w))*24+x+i%w);
const shapes=[{id:56,role:'side',cells:[...rect(0,0,1,30),...rect(21,0,1,30)]},{id:57,role:'molding',cells:rect(1,0,20,2)},{id:59,role:'top',cells:rect(1,3,20,1)},{id:60,role:'side',cells:rect(1,4,1,26)},{id:66,role:'side',cells:rect(20,4,1,26)},{id:61,role:'empty',cells:rect(3,4,16,16)},{id:63,role:'drawer',cells:rect(3,20,7,3)},{id:65,role:'drawer',cells:rect(11,20,8,3)},{id:68,role:'front',cells:rect(3,24,16,6)}].map(s=>({...s,name:s.role}));
await page.evaluate(shapes=>window.postMessage({type:'diagram-init',canSelect:true,presets:[{id:'P5',name:'화장대A',part:'vanity',size:{cols:24,rows:32},shapes}]},'*'),shapes);
await page.locator('[data-view]').selectOption('vanity');await page.locator('[data-custom-preset]').selectOption('P5');
const boxes=async id=>page.locator('[data-preset-shape="'+id+'"] rect').evaluateAll(rs=>rs.map(r=>Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(r.getAttribute(k))]))));
const near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-6,m+': '+a+' != '+b);
const outer=await boxes(56),left=(await boxes(60))[0],right=(await boxes(66))[0],top=(await boxes(57))[0],under=(await boxes(59))[0],empty=(await boxes(61))[0],a=(await boxes(63))[0],b=(await boxes(65))[0],front=(await boxes(68))[0];
near(under.y-top.y-top.height,20/3,'molding opening');near(left.x-outer[0].x-outer[0].width,20/3,'outer clearance with Empty');
near(a.x-left.x-left.width,20/3,'left drawer clearance');near(right.x-b.x-b.width,20/3,'right drawer clearance');near(b.x-a.x-a.width,20/3,'drawer split');near(front.y-a.y-a.height,20/3,'drawer-front clearance');
near(empty.width,320,'Empty width retained');near(empty.height,320,'Empty height retained');assert.equal(await page.locator('[data-empty-space] rect').getAttribute('fill'),'none');
if(process.env.DIAGRAM_SCREENSHOT)await page.locator('[data-custom-illustration]').screenshot({path:process.env.DIAGRAM_SCREENSHOT});
console.log('PASS: Empty reservation and local vanity frame gaps coexist');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
