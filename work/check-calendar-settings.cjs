const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const url=pathToFileURL(path.resolve('outputs/glass-clock.html')).href;
const selectedDate=page=>page.locator('.demo-day.selected').getAttribute('data-day');
async function ready(page){await page.waitForFunction(()=>window.clockAppReady&&window.clockCalendarReady);await page.evaluate(()=>document.fonts.ready);}
async function exitFullscreen(page){await page.keyboard.press('Escape');await page.waitForTimeout(200);if(await page.locator('.control-panel').isHidden())await page.locator('#clock-stage').dblclick({position:{x:15,y:15}});}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']}),results=[];
 try{
  for(const [name,viewport]of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,timezoneId:'Asia/Shanghai'});await context.setOffline(true);
   try{
    await context.addInitScript(()=>{
     // A Chrome 90 build must not depend on Array.prototype.at at runtime.
     Array.prototype.at=undefined;
     if(!localStorage.getItem('calendar-test-seeded')){
      localStorage.setItem('calendar-test-seeded','1');
      localStorage.setItem('floating-light-clock',JSON.stringify({font:'nunito',size:125,weight:650,seconds:true,glass:false,companion:false,effectsVersion:1}));
      localStorage.setItem('floating-light-calendar',JSON.stringify({mode:'quote',quoteKind:'daily',quoteSize:24,custom:'',traditional:true,world:true,terms:true,wideSky:false}));
      localStorage.setItem('floating-light-calendar-hourly','false');
     }
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-04T12:36:00+08:00'));await page.goto(url);await ready(page);
    assert.equal(await selectedDate(page),'2026-11-04');assert.equal(await page.locator('.edition-label').count(),1);assert(await page.locator('.edition-label').isVisible());
    assert.equal(await page.locator('#digit-font').inputValue(),'nunito');assert.equal(await page.locator('#digit-size').inputValue(),'125');assert.equal(await page.locator('#digit-weight').inputValue(),'650');assert(await page.locator('#show-seconds').isChecked());assert(!(await page.locator('#use-glass').isChecked()));assert(!(await page.locator('#show-companion').isChecked()));
    assert(!(await page.locator('#demo-wide-sky').isChecked()));assert.equal(await page.evaluate(()=>window.calendarDemoWideSky),false);assert(!(await page.locator('#demo-term-enabled').isChecked()));
    await page.locator('[data-tab="display"]').click();assert(await page.locator('#weather-status').isVisible());assert(await page.locator('#city-toggle').isVisible());assert(await page.locator('#locate').isVisible());
    await page.locator('#city-toggle').click();assert(await page.locator('#city-name').isVisible());await page.locator('#city-toggle').click();
    await page.locator('#demo-world').uncheck();await page.locator('#demo-traditional').uncheck();await page.locator('#demo-wide-sky').check();
    await page.locator('[data-tab="quote"]').click();await page.locator('#demo-quote-kind').selectOption('custom');await page.locator('#demo-custom').fill('让每一天都有清风。');await page.locator('#demo-quote-size').fill('26');
    await page.locator('[data-tab="calendar"]').click();await page.locator('[data-date="2026-11-07"]').click();assert((await page.locator('#date').textContent()).includes('11月7日'));assert.equal(await page.evaluate(()=>window.calendarDemoDate),'2026-11-07');
    await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.body.classList.contains('is-fullscreen'));
    assert.equal(await page.evaluate(()=>window.calendarDemoDate),null);assert((await page.locator('#date').textContent()).includes('11月4日'));assert(await page.locator('.control-panel').isHidden());
    await page.locator('[data-calendar-term="霜降"]').click();await page.waitForFunction(()=>document.body.dataset.termEffect==='霜降');assert(await page.locator('.control-panel').isHidden());
    await exitFullscreen(page);await page.reload();await ready(page);
    assert.equal(await selectedDate(page),'2026-11-04');assert.equal(await page.evaluate(()=>window.calendarDemoDate),null);assert.equal(await page.locator('.demo-quote p').textContent(),'让每一天都有清风。');assert.equal(await page.locator('#demo-quote-size').inputValue(),'26');assert(await page.locator('#demo-wide-sky').isChecked());assert(!(await page.locator('#demo-world').isChecked()));assert(!(await page.locator('#demo-traditional').isChecked()));assert(!(await page.locator('#demo-term-enabled').isChecked()));
    assert.equal(await page.locator('#digit-font').inputValue(),'nunito');assert.equal(await page.locator('#digit-size').inputValue(),'125');assert(await page.locator('#show-seconds').isChecked());assert(!(await page.locator('#use-glass').isChecked()));
    await page.locator('[data-tab="display"]').click();await page.locator('[data-mode="calendar"]').click();await page.reload();await ready(page);assert(await page.locator('.demo-quote').isHidden());assert(await page.locator('.demo-dayline').isVisible());
    await page.clock.setFixedTime(new Date('2026-11-05T00:01:00+08:00'));await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await page.waitForFunction(()=>document.querySelector('.demo-day.selected')?.dataset.day==='2026-11-05');
    assert.equal(await page.evaluate(()=>window.calendarDemoDate),null);assert((await page.locator('#date').textContent()).includes('11月5日'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
    results.push({name,persistence:true,clockPreferencesPreserved:true,fullscreenReturnsToday:true,termTapInFullscreen:true,midnightRollover:true,overflow:false,errors});
   }finally{await context.close();}
  }
  for(const storageMode of ['malformed','denied']){
   const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});await context.setOffline(true);
   try{
    await context.addInitScript(mode=>{
     if(mode==='denied'){Storage.prototype.getItem=()=>{throw new DOMException('Blocked','SecurityError');};Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError');};}
     else{localStorage.setItem('floating-light-calendar',JSON.stringify({mode:'bad',quoteKind:'bad',quoteSize:1e9,custom:['not text'],wideSky:'false',terms:0,world:null,traditional:{}}));localStorage.setItem('floating-light-calendar-hourly','{"enabled":false}');}
    },storageMode);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-11-04T12:36:00+08:00'));await page.goto(url);await ready(page);
    assert.equal(await page.locator('#demo-quote-kind').inputValue(),'daily');assert.equal(await page.locator('#demo-quote-size').inputValue(),'21');assert.equal(await page.locator('#demo-custom').inputValue(),'');assert(await page.locator('#demo-wide-sky').isChecked());assert(await page.locator('#demo-term-enabled').isChecked());assert(await page.locator('#demo-terms').isChecked());assert(await page.locator('#demo-world').isChecked());assert(await page.locator('#demo-traditional').isChecked());
    await page.locator('[data-tab="quote"]').click();await page.locator('#demo-quote-kind').selectOption('custom');await page.locator('#demo-custom').fill('存储不可用也能继续看时间。');assert.equal(await page.locator('.demo-quote p').textContent(),'存储不可用也能继续看时间。');assert.deepEqual(errors,[]);results.push({storageMode,fallback:true,errors});
   }finally{await context.close();}
  }
  fs.writeFileSync('work/calendar-settings-results.json',JSON.stringify({pass:true,scope:'Desktop Chromium with phone viewport, not physical Android',results},null,2));
  console.log('PASS: calendar settings persistence, legacy clock preferences, fullscreen date safety, term tap, midnight rollover, invalid/denied storage and phone layout');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
