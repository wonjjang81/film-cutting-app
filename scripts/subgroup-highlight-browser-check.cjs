// Synthetic local fixture only. No production storage or project writes.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dist = path.resolve(__dirname, '../dist');
const server = http.createServer((req,res)=>{
  let file=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(dist+path.sep))file=path.join(dist,'index.html');
  if(!path.extname(file))file+='.html';
  if(!fs.existsSync(file))file=path.join(dist,'index.html');
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:610,height:884}});
    await page.route('**/api/**',async route=>{
      assert.equal(route.request().method()==='PUT',false,'highlight must not mutate projects');
      const session=route.request().url().includes('/auth/session');
      await route.fulfill({status:session?200:404,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':`http://127.0.0.1:${server.address().port}`,'Access-Control-Allow-Credentials':'true'},body:session?JSON.stringify({user:{id:'highlight-test',email:'test@example.invalid',role:'owner'}}):'{}'});
    });
    await page.addInitScript(()=>{
      const form={brand:'영림',productNumber:'TEST',rollWidth:'1220',pieceWidth:'300',pieceLength:'600',cutAllowance:'0',quantity:'2',gap:'0',sideMargin:'5',startEndMargin:'5',allowRotation:true};
      localStorage.setItem('film-cutting-current-group-estimate',JSON.stringify({pieces:[{id:'g1',name:'대그룹1',pieces:[{id:'p1',name:'상부',form},{id:'p2',name:'하부',form}],subgroups:[{id:'s1',name:'상부장',pieceIds:['p1'],siteCount:1},{id:'s2',name:'하부장',pieceIds:['p2'],siteCount:1}]}]}));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/planning`);
    const combo=page.getByRole('combobox',{name:'소그룹 강조 선택',exact:true});
    await combo.waitFor();
    const pieces=page.locator('g[aria-label^="병합 제품"]');
    const before=await pieces.evaluateAll(items=>items.map(item=>{const r=item.querySelector('rect');return ['x','y','width','height'].map(a=>r.getAttribute(a));}));
    assert.equal(before.length,4);
    await combo.selectOption({label:'대그룹1 · 상부장 · 2개'});
    assert.equal(await pieces.locator('xpath=self::*[@opacity="0.12"]').count(),2);
    assert.equal(await page.getByText('소그룹 강조 · 대그룹1 · 상부장 (2개)',{exact:true}).count(),1);
    const after=await pieces.evaluateAll(items=>items.map(item=>{const r=item.querySelector('rect');return ['x','y','width','height'].map(a=>r.getAttribute(a));}));
    assert.deepEqual(after,before,'highlight must preserve geometry');
    await page.getByRole('button',{name:'소그룹 강조 전체 보기'}).click();
    assert.equal(await combo.inputValue(),'');
    assert.equal(await pieces.locator('xpath=self::*[@opacity="0.12"]').count(),0);
    assert.equal(await combo.locator('option').filter({hasText:'전체'}).count(),0,'all is a separate button, not a combo option');
    await page.setViewportSize({width:390,height:844});
    await combo.selectOption({label:'대그룹1 · 하부장 · 2개'});
    assert.equal(await pieces.locator('xpath=self::*[@opacity="0.12"]').count(),2);
    console.log('PASS: subgroup combo highlights pieces; separate All restores view; mobile-width selection works; geometry unchanged.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
