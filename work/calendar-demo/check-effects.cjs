const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Shanghai'}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await page.context().setOffline(true);
  await page.clock.setFixedTime(new Date('2026-11-04T18:36:00+08:00'));
  await page.goto(pathToFileURL(path.resolve('outputs/浮光-日历金句-本地演示.html')).href);await page.waitForFunction(()=>window.clockAppReady);await page.evaluate(()=>document.fonts.ready);
  await page.locator('[data-tab="display"]').click();assert(await page.locator('#demo-appearance-settings').evaluate(e=>e.open));
  await page.locator('#use-glass').uncheck();assert(await page.locator('body').evaluate(e=>e.classList.contains('plain-digits')));await page.locator('#use-glass').check();assert(!(await page.locator('body').evaluate(e=>e.classList.contains('plain-digits'))));
  await page.locator('#show-seconds').check();assert(await page.locator('#seconds-cluster').isVisible());await page.locator('#show-seconds').uncheck();assert(await page.locator('#seconds-cluster').isHidden());
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fuguang-calendar-prototype-clock')));
  for(const [id,value,key]of [['digit-size','500','size'],['digit-weight','700','weight'],['digit-spacing','4','spacing']]){await page.locator('#'+id).fill(value);assert.equal((await saved())[key],Number(value));}
  assert.equal(await page.locator('.clock').evaluate(e=>getComputedStyle(e).getPropertyValue('--digit-weight').trim()),'700');
  assert.equal(await page.locator('.clock').evaluate(e=>getComputedStyle(e).getPropertyValue('--digit-spacing').trim()),'4px');
  await page.locator('#digit-font').selectOption('jetbrainsmono');assert((await page.locator('.clock').evaluate(e=>getComputedStyle(e).getPropertyValue('--clock-font'))).includes('JetBrains'));
  await page.locator('#demo-appearance-controls details').evaluateAll(es=>es.forEach(e=>e.open=true));
  for(const [id,key]of [['date-size','dateSize'],['weekday-size','weekdaySize'],['companion-size','companionSize']]){assert.equal(await page.locator('#'+id).getAttribute('max'),'500');await page.locator('#'+id).fill('500');assert.equal((await saved())[key],500);}
  const largeSizes=await page.evaluate(()=>({date:parseFloat(getComputedStyle(document.querySelector('#date')).fontSize),weekday:parseFloat(getComputedStyle(document.querySelector('#weekday')).fontSize),companion:Number(document.querySelector('.stick-world').dataset.effectiveScale)}));
  assert(largeSizes.date>14&&largeSizes.weekday>14&&largeSizes.companion>1,JSON.stringify(largeSizes));
  await page.locator('#appearance-reset').click();assert.equal((await saved()).size,100);assert.equal((await saved()).dateSize,100);
  await page.locator('#demo-motion-settings > summary').click();await page.locator('#motion-speed').fill('1.5');assert.equal((await saved()).motionSpeed,1.5);
  await page.locator('#day-cycle').click();assert.equal(await page.locator('#day-cycle').getAttribute('aria-pressed'),'true');await page.waitForTimeout(250);const cycleStart=await page.locator('#day-cycle-time').textContent();await page.waitForTimeout(500);assert.notEqual(await page.locator('#day-cycle-time').textContent(),cycleStart);await page.locator('#day-cycle').click();assert.equal(await page.locator('#day-cycle').getAttribute('aria-pressed'),'false');
  await page.locator('[data-preview="rain"]').click();assert.equal(await page.locator('body').getAttribute('data-weather'),'rain');await page.locator('[data-preview="noon"]').click();assert.equal(await page.locator('body').getAttribute('data-phase'),'day');
  await page.locator('.demo-term-controls > summary').click();assert.equal(await page.locator('#demo-term-choice option').count(),25);
  const termChecks=await page.evaluate(()=>{
    const choice=document.querySelector('#demo-term-choice'),button=document.querySelector('#demo-term-play'),enabled=document.querySelector('#demo-term-enabled');
    const baseline={cloudCover:.12,intensity:0,wind:8,rainAmount:0,snowAmount:0,fogAmount:0,stormAmount:0,hailAmount:0,overcastAmount:0};
    const now=new Date('2026-11-04T18:36:00+08:00'),rows=[];
    for(const option of [...choice.options].slice(1)){
      choice.value=option.value;choice.dispatchEvent(new Event('change'));button.click();const start=performance.now(),target={...baseline};window.calendarDemoTermWeather(target,now,start+6000);
      const active=document.body.dataset.termEffect;const restored={...baseline};window.calendarDemoTermWeather(restored,now,start+41000);
      rows.push({name:option.value,active,target,restored,ended:!document.body.dataset.termEffect});
    }
    window.calendarDemoDate=null;
    const hour=new Date('2026-11-07T21:00:00+08:00'),start=performance.now();window.calendarDemoTermWeather({...baseline},hour,start);const auto=document.body.dataset.termEffect;
    window.calendarDemoTermWeather({...baseline},hour,start+41000);window.calendarDemoTermWeather({...baseline},hour,start+42000);const duplicate=!!document.body.dataset.termEffect;
    const next=new Date('2026-11-07T22:00:00+08:00');window.calendarDemoTermWeather({...baseline},next,start+43000);const nextHour=document.body.dataset.termEffect;
    enabled.checked=false;enabled.dispatchEvent(new Event('change'));const cancelled=!document.body.dataset.termEffect;window.calendarDemoTermWeather({...baseline},new Date('2026-11-07T23:00:00+08:00'),start+44000);const disabled=!document.body.dataset.termEffect;
    enabled.checked=true;enabled.dispatchEvent(new Event('change'));window.calendarDemoTermWeather({...baseline},new Date('2026-11-08T00:00:00+08:00'),start+45000);const nextDay=document.body.dataset.termEffect;
    window.calendarDemoTermWeather({...baseline},now,start+86000);window.calendarDemoTermWeather({...baseline},new Date('2026-12-31T23:00:00+08:00'),start+87000);const december=document.body.dataset.termEffect;
    window.calendarDemoTermWeather({...baseline},now,start+128000);window.calendarDemoTermWeather({...baseline},new Date('2027-01-01T00:00:00+08:00'),start+129000);const unsupportedYear=!document.body.dataset.termEffect;
    return {baseline,rows,auto,duplicate,nextHour,nextDay,cancelled,disabled,december,unsupportedYear};
  });
  assert.equal(termChecks.rows.length,24);for(const row of termChecks.rows){assert.equal(row.active,row.name);assert(row.ended);assert.deepEqual(row.restored,termChecks.baseline);assert.notDeepEqual(row.target,termChecks.baseline);for(const [key,value]of Object.entries(row.target))assert(Number.isFinite(value)&&value>=0&&value<=(key==='wind'?200:1),`${row.name}:${key}=${value}`);}
  assert.equal(new Set(termChecks.rows.map(x=>JSON.stringify(x.target))).size,24);assert.equal(termChecks.auto,'立冬');assert.equal(termChecks.nextHour,'立冬');assert.equal(termChecks.nextDay,'立冬');assert(!termChecks.duplicate&&termChecks.cancelled&&termChecks.disabled&&termChecks.unsupportedYear);assert.equal(termChecks.december,'冬至');
  await page.locator('#demo-term-choice').selectOption('大雪');await page.locator('#demo-term-play').click();await page.waitForTimeout(6500);assert.equal(await page.locator('body').getAttribute('data-term-effect'),'大雪');assert.equal(await page.locator('body').getAttribute('data-phase'),'day');
  await page.locator('#fullscreen').click();await page.waitForTimeout(300);assert(await page.locator('.control-panel').isHidden());await page.screenshot({path:'work/calendar-demo/term-snow-fullscreen.png'});
  await page.evaluate(()=>window.calendarDemoTermWeather({cloudCover:.12,intensity:0,wind:8,rainAmount:0,snowAmount:0,fogAmount:0,stormAmount:0,hailAmount:0,overcastAmount:0},new Date(),performance.now()+41000));
  await page.keyboard.press('Escape');await page.waitForTimeout(200);if(await page.locator('.control-panel').isHidden())await page.locator('#clock-stage').dblclick({position:{x:20,y:20}});await page.locator('#demo-sky').selectOption('night');assert.equal(await page.locator('body').getAttribute('data-phase'),'night');await page.locator('#fullscreen').click();
  await page.clock.setFixedTime(new Date('2026-11-04T19:00:00+08:00'));await page.waitForTimeout(400);assert.equal(await page.locator('body').getAttribute('data-term-effect'),'霜降');assert(await page.locator('.control-panel').isHidden());assert.equal(await page.locator('body').getAttribute('data-phase'),'night');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  fs.writeFileSync('work/calendar-demo/effects-results.json',JSON.stringify({pass:true,errors,requests,largeSizes,termChecks},null,2));console.log('PASS: restored controls, 500% settings, weather/day playback, 24 terms, hourly deduplication, cancellation/expiry, full-screen continuity');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
