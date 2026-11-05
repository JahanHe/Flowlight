// Live provider probe at the Android appassets origin; no source changes or request bypasses.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
  const native=fs.readFileSync(path.join(__dirname,'android/src/local/fuguang/clock/ClockActivity.java'),'utf8');
  const csp=native.match(/headers\.put\("Content-Security-Policy", "([^"]+)"\)/)[1];
  const manifest=fs.readFileSync(path.join(__dirname,'android/AndroidManifest.xml'),'utf8');
  const version=manifest.match(/android:versionName="([^"]+)"/)[1];
  const html=require('./android/check-apk-asset.cjs')(`浮光时钟-手机版-${version}.apk`,'glass-clock.html');
  const base='https://appassets.androidplatform.net/assets/glass-clock.html';
  const browser=await chromium.launch({executablePath:process.env.CLOCK_CHROMIUM_PATH,headless:true});
  try {
    const context=await browser.newContext({viewport:{width:720,height:480},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
    await context.route(base,route=>route.fulfill({status:200,contentType:'text/html;charset=utf-8',headers:{'Content-Security-Policy':csp,'Referrer-Policy':'no-referrer','Cache-Control':'no-store'},body:html}));
    await context.addInitScript(()=>localStorage.setItem('floating-light-clock',JSON.stringify({glass:false,companion:false,quality:'smooth'})));
    const page=await context.newPage(),responses=[],failures=[],errors=[],pending=[];
    const relevant=url=>/^https:\/\/(weather\.cma\.cn|api\.open-meteo\.com)\//.test(url);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('requestfailed',request=>{if(relevant(request.url()))failures.push({url:request.url(),error:request.failure()?.errorText});});
    page.on('response',response=>{if(relevant(response.url()))pending.push((async()=>{
      let data;try{data=await response.json();}catch{}
      responses.push({status:response.status(),url:response.url(),cors:response.headers()['access-control-allow-origin']||null,current:data?.current||data?.data?.now,sourceTime:data?.current?.time||data?.data?.lastUpdate,error:data?.reason});
    })());});
    await page.goto(base);
    await page.waitForFunction(()=>window.clockAppReady===true);
    await page.waitForFunction(()=>!document.querySelector('#weather-status').textContent.includes('正在'),null,{timeout:22000});
    await Promise.all(pending);
    const ui=await page.evaluate(()=>({status:document.querySelector('#weather-status').textContent,source:document.querySelector('#weather-source').textContent,phase:document.body.dataset.phase,weather:document.body.dataset.weather,cache:JSON.parse(localStorage.getItem('floating-light-weather'))}));
    const result={testedAt:new Date().toISOString(),origin:base,physicalAndroid:false,responses,failures,errors,ui};
    fs.writeFileSync(path.join(__dirname,'weather-browser-api-probe.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
