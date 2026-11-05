const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']}),results=[];
 try{for(const [name,viewport,hasTouch]of [['desktop',{width:1440,height:900},false],['phone',{width:390,height:844},true]]){
  const context=await browser.newContext({viewport,hasTouch,timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.setOffline(true);await page.clock.setFixedTime(new Date('2026-11-04T18:36:00+08:00'));
  await page.goto(pathToFileURL(path.resolve('outputs/浮光-日历金句-本地演示.html')).href);await page.waitForFunction(()=>window.clockAppReady);await page.evaluate(()=>document.fonts.ready);
  const originalUrl=page.url(),term=page.locator('.demo-term-trigger');
  const expire=()=>page.evaluate(()=>{const baseline={cloudCover:.12,intensity:0,wind:8,rainAmount:0,snowAmount:0,fogAmount:0,stormAmount:0,hailAmount:0,overcastAmount:0},target={...baseline};window.calendarDemoTermWeather(target,new Date(),performance.now()+41000);return {baseline,target,active:document.body.dataset.termEffect||null};});
  assert.equal(await term.textContent(),'霜降时节');assert.equal(await term.getAttribute('data-calendar-term'),'霜降');
  const hit=await term.boundingBox();assert(hit.width>=44&&hit.height>=44,JSON.stringify(hit));
  await term.click();assert.equal(await page.locator('body').getAttribute('data-term-effect'),'霜降');
  let ended=await expire();assert.equal(ended.active,null);assert.deepEqual(ended.target,ended.baseline);
  await term.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('body').getAttribute('data-term-effect'),'霜降');await expire();
  await page.locator('[data-date="2026-11-07"]').click();assert.equal(await term.textContent(),'立冬');
  await term.click();assert.equal(await page.locator('body').getAttribute('data-term-effect'),'立冬');
  const snow=await page.evaluate(()=>{const target={cloudCover:.12,intensity:0,wind:8,rainAmount:0,snowAmount:0,fogAmount:0,stormAmount:0,hailAmount:0,overcastAmount:0};window.calendarDemoTermWeather(target,new Date(),performance.now()+6000);return target.snowAmount;});assert(snow>0);await expire();
  await page.locator('[data-tab="display"]').click();await page.locator('.demo-term-controls > summary').click();await page.locator('#demo-term-enabled').uncheck();
  await term.click();assert.equal(await page.locator('body').getAttribute('data-term-effect'),'立冬');assert.equal(await page.locator('#demo-term-choice').inputValue(),'立冬');await expire();
  await page.locator('#fullscreen').click();await page.waitForTimeout(300);assert(await page.locator('.control-panel').isHidden());const phase=await page.locator('body').getAttribute('data-phase');
  if(hasTouch){await term.tap();await term.tap();}else{await term.click();await term.dblclick();}
  assert.equal(await page.locator('body').getAttribute('data-term-effect'),'立冬');assert(await page.locator('.control-panel').isHidden(),'term double tap must not exit fullscreen');assert.equal(await page.locator('body').getAttribute('data-phase'),phase);
  ended=await expire();assert.equal(ended.active,null);assert.deepEqual(ended.target,ended.baseline);
  assert.equal(page.url(),originalUrl);assert.equal(context.pages().length,1);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  results.push({name,hit,mouse:true,keyboard:true,manualWhileHourlyOff:true,fullscreen:true,expiry:true,errors});await context.close();
 }
 console.log(JSON.stringify({pass:true,results},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
