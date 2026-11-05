// Verify the packaged phone page under the native origin, CSP and memory hint URL.
// Desktop Chromium is not a physical Android WebView or a phone performance measurement.
const readPackagedHtml = require('./check-apk-asset.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'src/local/fuguang/clock/ClockActivity.java'),'utf8');
 const manifest=fs.readFileSync(path.join(__dirname,'AndroidManifest.xml'),'utf8');
 const versionName=manifest.match(/android:versionName="([^"]+)"/)[1],versionCode=manifest.match(/android:versionCode="([^"]+)"/)[1];
 const headers={};for(const name of ['Content-Security-Policy','Cache-Control','Referrer-Policy'])headers[name]=source.match(new RegExp('headers\\.put\\("'+name+'", "([^"]+)"\\)'))[1];
 assert.equal(headers['Cache-Control'],'no-store, max-age=0');assert.equal(headers['Referrer-Policy'],'no-referrer');
 const html=readPackagedHtml(`浮光时钟-手机版-${versionName}.apk`, 'glass-clock.html');
 const backScript=JSON.parse(source.match(/private static final String BACK_SCRIPT = ("(?:\\.|[^"\\])*");/)[1]);
 const base='https://appassets.androidplatform.net/assets/glass-clock.html';
 const pageURL=base+'?v='+versionCode+'&ramMB=4096&availableMB=2048&cores=8&lowRam=0&heapMB=256';
 const browser=await chromium.launch({executablePath:process.env.CLOCK_CHROMIUM_PATH,headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{for(const key of ['requestFullscreen','webkitRequestFullscreen'])Object.defineProperty(Element.prototype,key,{value:undefined,configurable:true});});
  const requests=[];
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin+url.pathname===base)return route.fulfill({status:200,contentType:'text/html;charset=utf-8',headers,body:html});
   requests.push({url:request.url(),referer:request.headers().referer||''});return route.abort();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pageURL);await page.waitForFunction(()=>window.clockAppReady===true);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('meta[name="clock-mobile-version"]').getAttribute('content'),versionName);
  assert.equal(await page.evaluate(()=>window.isSecureContext),true);
  assert.equal(await page.locator('.stick-world').count(),1);
  assert.equal(await page.evaluate(backScript),false,'ordinary screen lets native Back exit');
  await page.locator('[data-tab="display"]').click();assert(await page.locator('#demo-appearance-settings').isVisible());
  await page.locator('#digit-size').evaluate(input=>{input.value='105';input.dispatchEvent(new Event('input',{bubbles:true}));});
  const saved=await page.evaluate(()=>localStorage.getItem('floating-light-clock'));assert(saved);
  assert.equal(await page.evaluate(backScript),false,'inline appearance controls do not trap native Back');
  if(!await page.locator('#demo-motion-settings').evaluate(el=>el.open))await page.locator('#demo-motion-settings > summary').click();
  assert(await page.locator('#preview-grid').isVisible());
  assert.equal(await page.evaluate(backScript),false,'inline weather controls do not trap native Back');
  await page.locator('#city-toggle').click();assert(await page.locator('#city-form').isVisible());
  assert.equal(await page.evaluate(backScript),true);assert.equal(await page.locator('#city-form').isVisible(),false);
  assert.equal(await page.locator('#city-toggle').getAttribute('aria-expanded'),'false');
  await page.locator('#fullscreen').click();assert.equal(await page.evaluate(()=>document.body.classList.contains('is-fullscreen')),true);
  assert.equal(await page.evaluate(backScript),true);assert.equal(await page.evaluate(()=>document.body.classList.contains('is-fullscreen')),false);
  await page.setViewportSize({width:844,height:390});assert.equal(await page.evaluate(backScript),false);
  await page.goto(base+'?v='+(Number(versionCode)-1));await page.waitForFunction(()=>window.clockAppReady===true);
  assert.equal(await page.locator('#digit-size').inputValue(),'105');
  assert.equal(await page.evaluate(()=>localStorage.getItem('floating-light-clock')),saved,'version and memory query changes must preserve preferences');
  await page.goto(pageURL);await page.waitForFunction(()=>window.clockAppReady===true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('floating-light-clock')),saved);
  const weatherRequests=requests.filter(item=>/api\.open-meteo\.com|weather\.cma\.cn/.test(item.url));
  assert(weatherRequests.length>0,'exercise a real weather request through the local page');
  for(const request of weatherRequests){assert.equal(request.referer,'','native hardware hints must not leave as Referer');for(const key of ['ramMB','availableMB','cores','lowRam','heapMB'])assert(!new URL(request.url).searchParams.has(key),'local hardware hint must not be sent to weather');}
  assert.deepEqual(errors,[]);
  const report={passed:true,versionName,versionCode,pageURL,checks:['packaged phone version matches manifest','native secure origin and CSP','native local no-store and no-referrer headers','one companion','inline calendar/display controls allow native exit; native Back closes visible city form and CSS fullscreen','portrait/landscape','settings survive version and memory URL change','weather requests contain no native memory/CPU hints'],runtime:'desktop Chromium emulating touch; not physical Android or memory/FPS verification'};
  fs.mkdirSync(path.join(__dirname,'build'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'build/appassets-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
