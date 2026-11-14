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
    page.setDefaultTimeout(8000);
    await page.route('**/api/**',async route=>{
      assert.equal(route.request().method()==='PUT',false,'grouping must not mutate projects');
      const session=route.request().url().includes('/auth/session');
      await route.fulfill({status:session?200:404,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':`http://127.0.0.1:${server.address().port}`,'Access-Control-Allow-Credentials':'true'},body:session?JSON.stringify({user:{id:'cut-group-test',email:'test@example.invalid',role:'owner'}}):'{}'});
    });
    await page.addInitScript(()=>{
      const form={brand:'영림',productNumber:'TEST',rollWidth:'1220',pieceWidth:'300',pieceLength:'600',cutAllowance:'0',quantity:'2',gap:'0',sideMargin:'5',startEndMargin:'5',allowRotation:true};
      localStorage.setItem('film-cutting-current-group-estimate',JSON.stringify({pieces:[{id:'g1',name:'대그룹1',pieces:[{id:'p1',name:'상부',form},{id:'p2',name:'하부',form}],subgroups:[{id:'s1',name:'상부장',pieceIds:['p1'],siteCount:1},{id:'s2',name:'하부장',pieceIds:['p2'],siteCount:1}]}]}));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/planning`);
    const button=name=>page.getByRole('button',{name,exact:true});
    const piece=id=>page.getByRole('checkbox',{name:`그룹에 조각 ${id} 선택`,exact:true});
    const lines=page.locator('g[aria-label^="그룹 1 끝"]');
    await button('그룹화 배치').click();
    await piece(3).click();
    await button('그룹 만들기 (1개)').click();
    await piece(1).click();
    await button('그룹 만들기 (1개)').click();
    await button('그룹 2 위로').click();
    assert.equal(await page.getByText(/현재 .*mm → 그룹화/).count(),0);
    await button('사용 길이 비교').click();
    await page.getByText(/현재 .*mm → 그룹화/).waitFor();
    assert.equal(await lines.count(),0,'preview must not mutate applied plan');
    await button('그룹화 적용').click();
    await lines.waitFor();
    const boundary = Number(await lines.locator('line').getAttribute('y1'));
    const first = page.locator('g[aria-label="병합 제품 1 상세 보기"] > rect').first();
    assert.equal(Number(await first.getAttribute('y'))+Number(await first.getAttribute('height')),boundary);
    assert.equal(await button('완전히 빈 구간 제거').isDisabled(),true);
    await button('배치와 재단완료 저장').click();
    await page.getByText(/배치와 재단완료 표시를 이 기기에 저장했습니다/).waitFor();
    await page.reload();
    await lines.waitFor();
    assert.equal(Number(await lines.locator('line').getAttribute('y1')),boundary);
    await button('일반 자동배치로 전환').click();
    await lines.waitFor({state:'detached'});
    console.log('PASS: select, reorder, preview, apply, save/reload dashed boundary, and return to automatic layout.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
