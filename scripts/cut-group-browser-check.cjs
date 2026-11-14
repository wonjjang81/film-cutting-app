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
      const sub=(id,name,pieceId)=>({id,name,pieceIds:[pieceId],siteCount:'1',expanded:true,difficulty:'medium',overallDimensions:{widthMm:'0',heightMm:'0',depthMm:'0',doorCount:'0'}});
      const group={id:'g1',displayId:'1',name:'대그룹1',form,filmName:'',materialCostPerM:'',constructionCostPerM2:'',patternFixed:false,pieces:[{id:'p1',name:'상부',form},{id:'p2',name:'하부',form}],subgroups:[sub('s1','상부장','p1'),sub('s2','하부장','p2')]};
      const owner=location.search.includes('authenticated')?'cut-group-test':'local';
      const key='film-cutting-input-draft-v1:'+owner;
      if(!localStorage.getItem(key+':unsaved')){
        localStorage.setItem(key+':active',JSON.stringify({projectId:null}));
        localStorage.setItem(key+':unsaved',JSON.stringify({version:1,ownerId:owner,updatedAt:new Date().toISOString(),projectId:null,projectName:'테스트',groups:[group],activeGroupId:'g1',activePieceId:'p1',useRemnants:false,diagramPart:'상부장',diagramTargets:{}}));
      }
    });
    const base=`http://127.0.0.1:${server.address().port}`;
    const button=name=>page.getByRole('button',{name,exact:true});
    await page.goto(base+'/input');
    await button('상부장 그룹화 ID A').waitFor();
    await button('하부장 그룹화 ID 추가 B').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('film-cutting-current-group-estimate')).pieces[0].subgroups[1].cutGroupOrder===2);
    await page.reload();
    await button('하부장 그룹화 ID B').waitFor();
    await button('현재 그룹의 모든 조각 자동 배치 계산').click();
    await button('배치계획으로 이동').click();
    const lineA=page.locator('g[aria-label^="그룹 A 끝"]');
    const lineB=page.locator('g[aria-label^="그룹 B 끝"]');
    await lineA.waitFor();
    await lineB.waitFor();
    await button('재단계산에서 그룹화 변경').click();
    await button('하부장 그룹화 ID A').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('film-cutting-current-group-estimate')).pieces[0].subgroups[1].cutGroupOrder===1);
    await button('현재 그룹의 모든 조각 자동 배치 계산').click();
    await button('배치계획으로 이동').click();
    await lineA.waitFor();
    assert.equal(await lineB.count(),0);
    await button('재단계산에서 그룹화 변경').click();
    await button('길이별').click();
    await page.getByRole('switch',{ name: '기본 원단절약 우선' }).click();
    await button('현재 그룹의 모든 조각 자동 배치 계산').click();
    for (const label of ['기본', '소그룹별', '길이별']) {
      await page.getByText(new RegExp('^' + label + '.*m · .*%$')).waitFor();
    }
    await button('배치계획으로 이동').click();
    await button('완전히 빈 구간 제거').waitFor();
    assert.equal(await lineA.count(),0);
    console.log('PASS: default A, create B, restore on reload, same-ID grouping, and alphabetical boundaries.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
