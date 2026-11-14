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
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/api/**',async route=>{
      assert.equal(route.request().method()==='PUT',false,'estimate editing must not mutate projects');
      const session=route.request().url().includes('/auth/session');
      await route.fulfill({status:session?200:404,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':`http://127.0.0.1:${server.address().port}`,'Access-Control-Allow-Credentials':'true'},body:session?JSON.stringify({user:{id:'estimate-test',email:'test@example.invalid',role:'owner'}}):'{}'});
    });
    await page.addInitScript(()=>{
      const form={brand:'영림',productNumber:'TEST',rollWidth:'1220',pieceWidth:'300',pieceLength:'600',cutAllowance:'0',quantity:'2',gap:'0',sideMargin:'5',startEndMargin:'5',allowRotation:true};
      localStorage.setItem('film-cutting-current-group-estimate',JSON.stringify({pieces:[{id:'g1',name:'대그룹1',pieces:[{id:'p1',name:'상부',form},{id:'p2',name:'하부',form}],subgroups:[{id:'s1',name:'상부장',pieceIds:['p1'],siteCount:1},{id:'s2',name:'하부장',pieceIds:['p2'],siteCount:1}]}]}));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/estimate`);
    const card=page.getByText('AUTO ESTIMATE · PROJECT TOTAL',{exact:true}).locator('..');
    const total=async()=>Number((await card.getByText(/^[\d,]+원$/).first().textContent()).replace(/[^\d]/g,''));
    const section=label=>page.getByRole('button',{name:label,exact:true});
    await section('기타잡비 상세').click();
    const original=await total();
    const subtotal=original-Math.round(original*0.09);
    const withExpense=(extras,rate=9)=>subtotal+extras+Math.round((subtotal+extras)*(rate/(100-rate)));
    await section('+ 프라이머').click();
    assert.equal(await section('견적 PDF·인쇄').isDisabled(),true);
    await page.getByRole('textbox',{name:'기타잡비 1 수량'}).fill('2');
    await page.getByRole('textbox',{name:'기타잡비 1 단가'}).fill('2500');
    assert.equal(await total(),withExpense(5000));
    await section('기초작업 상세').click();
    await section('+ 프라이머 도포').click();
    await page.getByRole('textbox',{name:'기초작업 1 단가'}).fill('12000');
    assert.equal(await total(),withExpense(17000));
    await page.getByRole('switch',{name:'기초작업 1 기존 견적에 포함'}).click();
    assert.equal(await total(),withExpense(5000));
    await section('부자재비 상세').click();
    await section('+ 연마재').click();
    await page.getByRole('textbox',{name:'부자재비 1 단가'}).fill('1000');
    await section('경비 상세').click();
    await section('경비 14%').click();
    assert.equal(await total(),withExpense(6000,14));
    await page.waitForFunction(()=>Object.entries(localStorage).some(([key,value])=>key.startsWith('film-estimate-extras-v1:')&&value.includes('"expenseRate":14')));
    await page.reload();
    await section('기타잡비 상세').click();
    assert.equal(await page.getByRole('textbox',{name:'기타잡비 1 단가'}).inputValue(),'2500');
    assert.equal(await total(),withExpense(6000,14));
    console.log('PASS: four cost categories, included items, export guard, mobile-width editing and reload persistence.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
