// Run: node work/check-day-cycle.cjs with outputs served at localhost:8765.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {chromium}=require('playwright');
const sandbox=vm.createContext({});vm.runInContext(fs.readFileSync('work/solar-position.js','utf8'),sandbox);
const sky=(iso,lat=30.26,lon=120.13)=>vm.runInContext(`clockSkyAt(new Date('${iso}'),${lat},${lon},480)`,sandbox);
const frames=Array.from({length:1441},(_,i)=>sky(new Date(Date.UTC(2026,9,15,16)+i*60000).toISOString()));
assert.equal(frames[0].phase,'night');assert.equal(frames[720].phase,'day');assert.equal(frames[1440].phase,'night');
assert.ok(frames.some(f=>f.phase==='sunrise'));assert.ok(frames.some(f=>f.phase==='sunset'));
for(let i=1;i<frames.length;i++){
 assert.ok(Math.abs(frames[i].sunAltitude-frames[i-1].sunAltitude)<.3,'sun altitude jumped between minutes');
 assert.ok(Math.abs(frames[i].moonAltitude-frames[i-1].moonAltitude)<.3,'moon altitude jumped between minutes');
 assert.ok(Number.isFinite(frames[i].sunProgress)&&Number.isFinite(frames[i].moonProgress));
}
assert.notEqual(sky('2026-10-16T04:00:00.000Z').sunAltitude,sky('2026-10-16T04:00:00.100Z').sunAltitude,'subsecond sky must advance');
for(const lat of [-90,90])for(const month of [6,12])assert.ok(Number.isFinite(sky(`2026-${String(month).padStart(2,"0")}-21T04:00:00Z`,lat).sunProgress),'polar sky invalid');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},timezoneId:'Asia/Shanghai'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.clock.install({time:new Date('2026-10-16T04:00:00+08:00')});
  await page.clock.pauseAt(new Date('2026-10-16T04:01:00+08:00'));
  await page.goto('http://127.0.0.1:8765/glass-clock.html');await page.clock.runFor(500);
  assert.equal(await page.locator('body').getAttribute('data-phase'),'night');
  assert.match(await page.locator('#weather-status').textContent(),/离线晴天/);
  await page.locator('#day-cycle').click();assert.equal(await page.locator('body').getAttribute('data-preview'),'day-cycle');
  const lightBefore=await page.locator('.tile').first().getAttribute('style');
  await page.clock.fastForward(15000);await page.clock.runFor(300);
  assert.equal(await page.locator('body').getAttribute('data-phase'),'day');
  assert.notEqual(await page.locator('.tile').first().getAttribute('style'),lightBefore);
  assert.equal(await page.locator('.tile[data-unit="hours"] .static.top .numeral').textContent(),'04','preview changed actual clock hour');
  await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.reject(new Error('test fallback'));});await page.locator('#fullscreen').click();
  assert.equal(await page.locator('#day-cycle').isVisible(),false);assert.equal(await page.locator('#day-cycle-status').isVisible(),false);
  await page.clock.fastForward(30000);await page.clock.runFor(300);assert.equal(await page.locator('body').getAttribute('data-phase'),'night');
  assert.match(await page.locator('#day-cycle-label').textContent(),/深夜|月夜/,'night preview must not be labeled dawn');
  await page.keyboard.press('Escape');await page.locator('#day-cycle').click();assert.equal(await page.locator('body').getAttribute('data-preview'),'live');
  await page.locator('#appearance-toggle').click();await page.locator('#companion-size').fill('180');await page.locator('#companion-size').dispatchEvent('input');
  assert.match(await page.locator('#companion-size-value').textContent(),/180/);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('floating-light-clock')));assert.equal(stored.companionSize,180);
  await page.reload();await page.clock.runFor(300);assert.equal(await page.locator('#companion-size').inputValue(),'180');
  assert.equal(await page.locator('.stick-canvas').count(),1);assert.deepEqual(errors,[]);
  console.log('PASS ideal dawn/noon/night with real clock untouched; 1441 minute sky samples, subsecond orbit, polar fallback, offline clear, 60 second day cycle, real clock preserved, fullscreen preview, scale persistence, single character.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
