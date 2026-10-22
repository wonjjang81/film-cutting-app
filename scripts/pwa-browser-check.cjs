const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..', process.env.PWA_PUBLIC_DIR || 'public');
let version = 'v1';
const server = createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  const prefix = url.pathname.startsWith('/film-cutting-app/') ? '/film-cutting-app/' : '/';
  const path = url.pathname.slice(prefix.length);
  res.setHeader('Cache-Control','no-store');
  if (path.startsWith('api/')) {res.setHeader('Content-Type','application/json');res.end('{"private":"do-not-cache"}');return;}
  if (path.startsWith('_expo/static/')) {res.setHeader('Content-Type','application/javascript');res.end('window.testStaticLoaded=true');return;}
  if (['','login','projects','settings'].includes(path)) {
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<html lang="ko"><head><link rel="manifest" href="${prefix}manifest.webmanifest"><script defer src="${prefix}pwa.js"></script></head><body><h1>Private page fixture</h1></body></html>`);return;
  }
  try {
    const file=resolve(root,path);if(!file.startsWith(root+require('node:path').sep))throw new Error('outside');
    const type=path.endsWith('.js')?'application/javascript':path.endsWith('.webmanifest')?'application/manifest+json':path.endsWith('.png')?'image/png':'text/html';
    res.setHeader('Content-Type',type+(type==='image/png'?'':'; charset=utf-8'));
    const bytes=readFileSync(file);res.end(path==='sw.js'?bytes.toString().replace(/const PWA_VERSION = '[^']+';/,`const PWA_VERSION = '${version}';`):bytes);
  }catch{res.statusCode=404;res.end('missing');}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  for(const prefix of ['/','/film-cutting-app/']) {
   version='v1';
   const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(15000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+prefix+'login');
   try { await page.waitForFunction(()=>!!navigator.serviceWorker.controller); }
   catch(error) { console.error({errors, registrationError:await page.evaluate(async()=>{try{await navigator.serviceWorker.register(new URL('sw.js',document.querySelector('script').src));return 'registered';}catch(e){return e.message;}})});throw error; }
   console.log(`PASS: worker controls ${prefix}`);
   const manifest=await page.evaluate(async()=>{const url=document.querySelector('link[rel="manifest"]').href;return {url,data:await(await fetch(url)).json()};});
   assert.equal(manifest.data.display,'standalone');
   const devtools=await context.newCDPSession(page);
   const parsed=await devtools.send('Page.getAppManifest');
   assert.deepEqual(parsed.errors,[], 'browser parses install manifest without errors');
   await devtools.detach();
   assert.equal(new URL(manifest.data.start_url,manifest.url).pathname,prefix+'projects');
   for(const icon of manifest.data.icons){const data=await(await context.request.get(new URL(icon.src,manifest.url).href)).body();const size=Number(icon.sizes.split('x')[0]);assert.equal(data.readUInt32BE(16),size);assert.equal(data.readUInt32BE(20),size);}
   await page.getByRole('button',{name:'앱 설치 안내',exact:true}).click();
   assert.ok(await page.getByText('기기에 설치하면 브라우저 탭 대신 별도 앱 창으로 실행합니다.',{exact:false}).isVisible());
   await page.getByRole('button',{name:'설치 안내 닫기'}).click();
   await page.evaluate(async(prefix)=>{await fetch(prefix+'api/auth/session');await fetch(prefix+'api/library');await fetch(prefix+'_expo/static/js/web/app-hashed.js');},prefix);
   const keys=await page.evaluate(async()=>{const urls=[];for(const k of await caches.keys()){for(const req of await(await caches.open(k)).keys())urls.push(req.url);}return urls;});
   assert.ok(keys.some(k=>k.includes('app-hashed.js')));
   assert.ok(!keys.some(k=>k.includes('/api/')||k.endsWith('/login')||k.endsWith('/projects')),'private routes never cached');
   await context.setOffline(true);
   await page.goto(origin+prefix+'projects');
   assert.ok(await page.getByRole('heading',{name:'인터넷 연결을 확인해 주세요'}).isVisible());
   assert.equal(await page.evaluate(async(prefix)=>{try{await fetch(prefix+'api/library');return 'cached';}catch{return 'network-only';}},prefix),'network-only');
   await context.setOffline(false);await page.goto(origin+prefix+'login');
   version='v2';
   await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;await r.update();});
   await page.getByRole('button',{name:'저장 후 업데이트',exact:true}).waitFor();
   assert.ok(await page.evaluate(async()=>!!(await navigator.serviceWorker.ready).waiting),'new worker waits; does not overwrite running app');
   page.once('dialog',dialog=>dialog.accept());
   await page.getByRole('button',{name:'저장 후 업데이트',exact:true}).click();
   await page.waitForFunction(async()=>{const keys=await caches.keys();return keys.some(k=>k.endsWith('-v2'))&&!keys.some(k=>k.endsWith('-v1'));});
   assert.deepEqual(errors,[]);
   await context.close();
  }
  console.log('PASS: root/subpath manifest, icons, installation help, offline fallback, private API exclusion and consent-based worker update');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
