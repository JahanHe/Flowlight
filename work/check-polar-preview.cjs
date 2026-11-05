// Run: node work/check-polar-preview.cjs (outputs served on localhost:8765).
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},timezoneId:'Asia/Shanghai'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Observe state at the renderer boundary without changing the artifact or its behavior.
  const html=fs.readFileSync('outputs/glass-clock.html','utf8').replace('  const tiles = [...document.querySelectorAll',`  const auditState=scene.setState.bind(scene);scene.setState=next=>{window.__lastScene={...next};auditState(next);};\n  const tiles = [...document.querySelectorAll`);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.fulfill({contentType:'text/html',body:html}):r.abort());
  await page.clock.install({time:new Date('2026-10-16T12:34:00+08:00')});await page.clock.pauseAt(new Date('2026-10-16T12:34:00.001+08:00'));
  await page.goto('http://127.0.0.1:8765/glass-clock.html');await page.clock.runFor(150);
  assert.equal(await page.locator('.preview-option').count(),18);
  const select=async id=>{await page.locator('#weather-browse').click();await page.locator(`[data-preview="${id}"].preview-option`).click();await page.locator('#gallery-close').click();await page.clock.fastForward(2300);await page.clock.runFor(120);};
  const reports=[];
  for(const [id,phase,key]of [['polar-day','day','sunProgress'],['polar-night','night','moonProgress']]){
   await select(id);const before=await page.evaluate(()=>window.__lastScene);assert.equal(before.phase,phase);assert.equal(before.idealCycle,true);
   await page.clock.fastForward(3000);await page.clock.runFor(120);const after=await page.evaluate(()=>window.__lastScene);
   assert.ok(Math.abs(after[key]-before[key])>.001,`${id} light source does not move`);assert.equal(await page.locator('.stick-canvas').count(),1);
   await page.screenshot({path:`work/qa-${id}-clock.png`,animations:'disabled'});
   await page.locator('#preview-mode [data-return-live]').click();await page.clock.runFor(120);
   const live=await page.evaluate(()=>window.__lastScene);assert.equal(live.idealCycle,false);assert.equal(live.idealPolar,null);assert.equal(live.cycleElapsed,undefined);reports.push({id,before:before[key],after:after[key],returnedLive:true});
  }
  const ordinary=[];
  for(const id of ['noon','night']){
   await select(id);const state=await page.evaluate(()=>window.__lastScene);assert.equal(state.timeline,false,'ordinary preview inherited a previous moving timeline');
   ordinary.push({id,phase:state.phase,moonAltitude:state.moonAltitude});await page.screenshot({path:`work/qa-${id}-transparent-clock.png`,animations:'disabled'});
  }
  await page.locator('#day-cycle').click();await page.clock.fastForward(5000);await page.clock.runFor(120);assert.equal(await page.evaluate(()=>window.__lastScene.idealCycle),true);
  await page.locator('#day-cycle').click();await page.clock.runFor(120);const afterStop=await page.evaluate(()=>window.__lastScene);
  assert.equal(afterStop.idealCycle,false);assert.equal(afterStop.idealPolar,null);assert.equal(afterStop.cycleElapsed,undefined);assert.equal(await page.locator('#day-cycle-status').isVisible(),false);assert.deepEqual(errors,[]);
  const report={modes:18,reports,ordinary,stopClearsIdealState:true,errors};fs.writeFileSync('work/polar-preview-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
