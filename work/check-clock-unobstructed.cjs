// Targeted regression for unobstructed digits and inline editing panels.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {chromium}=require('playwright');
const url=process.argv[2]||'http://127.0.0.1:8765/glass-clock.html';assert.match(url,/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//);
const time=Date.parse('2026-10-16T12:34:56+08:00'),days=Array.from({length:4},(_,i)=>Date.parse(`2026-10-${15+i}T00:00:00+08:00`)/1000);
const fixture={current:{time:time/1000,weather_code:0,is_day:1,cloud_cover:0,precipitation:0,wind_speed_10m:12},daily:{time:days,sunrise:days.map(x=>x+21600),sunset:days.map(x=>x+64800),moonrise:days.map(x=>x+61200),moonset:days.map(x=>x+18000),moon_phase:days.map(()=>.3)}};
const results=[],errors=[];
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(error){results.push({name,passed:false,error:error.message});console.error('FAIL',name,error.stack);}}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:768},timezoneId:'Asia/Shanghai',hasTouch:true});
  await context.route('**/*',route=>{const target=new URL(route.request().url());if(target.origin===new URL(url).origin)return route.continue();if(target.hostname==='api.open-meteo.com')return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)});return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date(time)});await page.clock.pauseAt(new Date(time+1000));await page.clock.setSystemTime(new Date(time));
  await page.goto(url);await page.waitForFunction(()=>document.body.dataset.phase==='day');await page.clock.runFor(100);
  const geometry=async selector=>page.evaluate(selector=>{const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return {width:innerWidth,height:innerHeight,scrollX:scrollX,scrollY:scrollY,scrollWidth:document.documentElement.scrollWidth,clock:rect(document.querySelector('.clock')),panel:rect(document.querySelector(selector)),toolbar:rect(document.querySelector('.settings')),date:rect(document.querySelector('.date-line'))};},selector);
  const inspect=async(selector,label,fit=true)=>{
   const g=await geometry(selector);
   const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
   assert.equal(overlap(g.clock,g.panel),false,`${label}: panel covers clock ${JSON.stringify(g)}`);
   assert.equal(overlap(g.clock,g.toolbar),false,`${label}: toolbar covers clock`);
   assert.equal(overlap(g.clock,g.date),false,`${label}: date covers clock`);
   assert.ok(g.scrollWidth<=g.width,`${label}: horizontal overflow`);
   if(fit){assert.ok(g.clock.top>=0&&g.clock.bottom<=g.height,`${label}: clock outside viewport ${JSON.stringify(g)}`);assert.ok(g.panel.top>=0&&g.panel.bottom<=g.height+1,`${label}: panel outside viewport ${JSON.stringify(g)}`);}
   return g;
  };
  await check('iPad inline appearance/weather panels never overlap digits and fit default landscape/portrait view',async()=>{
   for(const [width,height]of [[1024,768],[768,1024]]){
    await page.setViewportSize({width,height});await page.clock.runFor(100);
    const before=await page.locator('#digit-size').inputValue();
    await page.locator('#appearance-toggle').tap();await page.clock.runFor(100);await inspect('#appearance-panel',`${width} appearance`);
    assert.equal(await page.locator('#digit-size').inputValue(),before);
    await page.locator('#appearance-close').tap();await page.clock.runFor(100);assert.equal(await page.locator('#digit-size').inputValue(),before);
    await page.locator('#weather-browse').tap();await page.clock.runFor(100);await inspect('#weather-gallery',`${width} weather`);
    await page.locator('.preview-option[data-preview="night"]').tap();await page.clock.runFor(100);assert.equal(await page.locator('body').getAttribute('data-preview'),'night');await inspect('#weather-gallery',`${width} night`);
    await page.locator('#weather-gallery [data-return-live]').tap();assert.equal(await page.locator('body').getAttribute('data-preview'),'live');
    await page.locator('#gallery-close').tap();await page.clock.runFor(100);
   }
  });
  await check('inline setting changes remain live and panel switching preserves values without overlapping digits',async()=>{
   for(const [width,height]of [[1024,768],[768,1024]]){
    await page.setViewportSize({width,height});await page.locator('#appearance-toggle').tap();
    await page.locator('[data-clock-preset="mono"]').tap();await page.clock.runFor(80);assert.equal(await page.locator('#digit-font').inputValue(),'jetbrainsmono');await inspect('#appearance-panel',`${width} mono`);
    await page.locator('#digit-size').evaluate(el=>{el.value='140';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.clock.runFor(80);await inspect('#appearance-panel',`${width} max-size`,false);
    const chosen=await page.evaluate(()=>localStorage.getItem('floating-light-clock'));
    await page.locator('#weather-browse').tap();await page.clock.runFor(80);assert.equal(await page.locator('#appearance-panel').isHidden(),true);await inspect('#weather-gallery',`${width} max-size gallery`,false);
    await page.locator('.preview-option[data-preview="rain"]').tap();await page.clock.runFor(80);assert.equal(await page.locator('body').getAttribute('data-preview'),'rain');
    await page.locator('#appearance-toggle').tap();await page.clock.runFor(80);assert.equal(await page.locator('#weather-gallery').isHidden(),true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('floating-light-clock')),chosen);await inspect('#appearance-panel',`${width} return appearance`,false);
    await page.locator('#appearance-reset').tap();await page.clock.runFor(80);await inspect('#appearance-panel',`${width} reset`);
    await page.locator('#appearance-close').tap();await page.clock.runFor(80);
   }
  });
  await check('no inline-panel script errors',async()=>assert.deepEqual(errors,[]));
  const report={passed:results.filter(r=>r.passed).length,total:results.length,results};fs.writeFileSync(path.join(__dirname,'unobstructed-check-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=results.some(r=>!r.passed)?1:0;
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
