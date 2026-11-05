const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:768},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('floating-light-clock',JSON.stringify({glass:false,companion:false})));
  const page=await context.newPage(),responses=[],failures=[],errors=[],pending=[];
  const relevant=url=>/https:\/\/(?:weather\.cma\.cn|api\.open-meteo\.com)\//.test(url);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',request=>{if(relevant(request.url()))failures.push({url:request.url(),failure:request.failure()?.errorText});});
  page.on('response',response=>{if(relevant(response.url()))pending.push((async()=>{
    let data;try{data=await response.json();}catch{}
    responses.push({provider:response.url().includes('weather.cma.cn')?'cma':'open-meteo',http:response.status(),url:response.url(),
      cors:response.headers()['access-control-allow-origin']||null,current:data?.current||data?.data?.now,
      sourceTime:data?.data?.lastUpdate||data?.current?.time,dailyKeys:Object.keys(data?.daily||{}),error:data?.reason});
  })());});
  await page.goto('http://127.0.0.1:8765/glass-clock.html');console.log('Weather page loaded; awaiting real providers.');
  await page.waitForFunction(()=>!document.querySelector('#weather-status').textContent.includes('正在'),null,{timeout:22000});
  await Promise.all(pending);
  await page.screenshot({path:path.join(__dirname,'weather-live-hangzhou.png')});
  const ui=await page.evaluate(()=>{
    const cache=JSON.parse(localStorage.getItem('floating-light-weather'));
    return {status:document.querySelector('#weather-status').textContent,age:document.querySelector('#weather-age').textContent,
      source:document.querySelector('#weather-source').textContent,sourceURL:document.querySelector('#weather-source').href,
      detail:document.querySelector('#weather-source-detail').textContent,phase:document.body.dataset.phase,weather:document.body.dataset.weather,
      location:cache?.location,provider:cache?.data?.providerId,current:cache?.data?.current,fetchedAt:cache?.fetchedAt};
  });
  const result={testedAt:new Date().toISOString(),responses,failures,ui,errors,
    passed:responses.some(r=>r.http===200&&r.provider===ui.provider)&&ui.phase!=='unknown'&&errors.length===0};
  if(result.passed){await page.locator('#fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement&&document.body.classList.contains('is-fullscreen'));await page.screenshot({path:path.join(__dirname,'weather-live-fullscreen.png')});}
  fs.writeFileSync(path.join(__dirname,'weather-live-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=result.passed?0:1;
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
