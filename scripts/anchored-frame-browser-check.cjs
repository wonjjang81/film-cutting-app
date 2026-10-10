const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:610,height:884}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://diagram-test.invalid/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.resolve(__dirname,'../public/construction-cabinets.html'),'utf8')}));
 await page.goto('https://diagram-test.invalid/');
 const rect=(x,y,w,h)=>Array.from({length:w*h},(_,i)=>(y+Math.floor(i/w))*24+x+i%w);
 const shapes=[{id:90,role:'molding',cells:rect(1,0,18,2)},{id:102,role:'side',cells:rect(0,0,1,30)},{id:104,role:'side',cells:rect(19,0,1,30)},{id:98,role:'side',cells:rect(1,3,1,27)},{id:96,role:'side',cells:rect(18,3,1,27)},{id:99,role:'side',cells:rect(2,4,1,26)},{id:95,role:'side',cells:rect(17,4,1,26)},{id:100,role:'top',cells:rect(3,3,14,1)},{id:101,role:'top',cells:rect(4,4,12,1)},{id:103,role:'front',cells:rect(3,6,14,24)}].map(s=>({...s,name:s.role}));
 const box=id=>page.locator(`[data-preset-shape="${id}"] rect`).evaluate(r=>Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(r.getAttribute(k))])));
 const near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-6,`${m}: ${a} != ${b}`);
 for(const part of ['upper','vanity','shelf','bathdoor']){
 await page.evaluate(({part,shapes})=>window.postMessage({type:'diagram-init',canSelect:true,presets:[{id:'P9',name:'A',part,size:{cols:24,rows:32},shapes}]},'*'),{part,shapes});
 await page.locator('[data-view]').selectOption(part);await page.locator('[data-custom-preset]').selectOption('P9');
 const b={};for(const s of shapes)b[s.id]=await box(s.id);
 near(b[102].x,4,'left outside fixed');near(b[104].x+b[104].width,404,'right outside fixed');near(b[90].y,4,'top fixed');near(b[103].y+b[103].height,604,'bottom fixed');
 near(b[100].y-b[90].y-b[90].height,20/3,'upper gap');near(b[101].y-b[100].y-b[100].height,20/3,'middle gap');near(b[103].y-b[101].y-b[101].height,20/3,'front grows upward');
 near(b[100].x-b[98].x-b[98].width,20/3,'horizontal part expands left');near(b[96].x-b[100].x-b[100].width,20/3,'horizontal part expands right');
 near(b[103].x-b[99].x-b[99].width,20/3,'front left gap');near(b[95].x-b[103].x-b[103].width,20/3,'front right gap');
 }
 assert.deepEqual(errors,[]);console.log('PASS: fixed outside boundaries, uniform local gaps, upper spans and side/front lengths');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
