// Run: node work/check-continuous-weather.cjs. This checks weather/timeline composition, not rendering pixels.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},timezoneId:'Asia/Shanghai'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let html=fs.readFileSync('outputs/glass-clock.html','utf8');
  const provider='const clockFetchWeather=clockWeatherProvider.fetchWeather;',boundary='  const tiles = [...document.querySelectorAll';
  assert(html.includes(provider)&&html.includes(boundary),'test seams changed; update observation boundary');
  html=html.replace(provider,'const clockFetchWeather=window.__fetchWeather;').replace(boundary,
   '  const auditSetState=scene.setState.bind(scene);scene.setState=next=>{window.__sample={state:{...next},at:performance.now(),wall:Date.now()};auditSetState(next);};\n'+boundary);
  await page.addInitScript(()=>{
   localStorage.setItem('floating-light-clock',JSON.stringify({glass:false,companion:false}));
   window.__weatherCalls=0;window.__weatherFail=false;
   window.__fetchWeather=async()=>{
    const i=Math.min(window.__weatherCalls++,2);if(window.__weatherFail)throw Error('test weather unavailable');
    const now=Date.now(),day=Math.floor((now+28800000)/86400000)*86400-28800;
    const days=[day-86400,day,day+86400];
    return {providerId:'open-meteo',providerName:'Test weather sequence',utc_offset_seconds:28800,
     current:{time:Math.floor(now/1000),weather_code:[0,63,3][i],is_day:1,cloud_cover:[8,92,100][i],precipitation:[0,3,0][i],wind_speed_10m:12},
     daily:{time:days,sunrise:days.map(d=>d+21600),sunset:days.map(d=>d+64800),moonrise:days.map(()=>null),moonset:days.map(()=>null),moon_phase:days.map(()=>null)}};
   };
  });
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.fulfill({contentType:'text/html',body:html}):r.abort());
  await page.clock.install({time:new Date('2026-10-16T12:34:00+08:00')});
  await page.clock.pauseAt(new Date('2026-10-16T12:35:00+08:00'));
  await page.goto('http://127.0.0.1:8765/glass-clock.html');await page.clock.runFor(160);
  const sample=()=>page.evaluate(()=>window.__sample);
  const advance=async ms=>{await page.clock.fastForward(ms);await page.clock.runFor(160);};
  const active=()=>page.locator('#day-cycle').getAttribute('aria-pressed');
  // Blend dt is intentionally capped: advance short discontinuous frames, not thousands of rendered frames.
  const settleWeather=async()=>{for(let i=0;i<14;i++){await page.clock.fastForward(1000);await page.clock.runFor(40);}};
  const phaseDistance=(a,b)=>Math.abs(((a-b+1.5)%1)-.5);
  const phaseContinues=(before,after,label)=>{
   assert(Number.isFinite(before.state.dayProgress)&&Number.isFinite(after.state.dayProgress),label+' has no day progress');
   const expected=(before.state.dayProgress+(after.at-before.at)/60000)%1;
   assert(phaseDistance(after.state.dayProgress,expected)<.004,label+' reset the accelerated day');
  };
  const realClock=async()=>{
   const value=await page.evaluate(()=>({hour:document.querySelector('.tile[data-unit="hours"] .static.top .numeral').textContent,
    minute:document.querySelector('.tile[data-unit="minutes"] .static.top .numeral').textContent,now:[new Date().getHours(),new Date().getMinutes()]}));
   assert.deepEqual([value.hour,value.minute],value.now.map(v=>String(v).padStart(2,'0')),'fast sky changed the actual clock');
  };
  const select=async id=>{await page.locator('#weather-browse').click();await page.locator(`.preview-option[data-preview="${id}"]`).click();await page.locator('#gallery-close').click();await page.clock.runFor(160);};
  assert.equal(await page.evaluate(()=>window.__weatherCalls),1);assert.equal((await sample()).state.condition,'clear');
  await page.locator('#day-cycle').click();await advance(7200);
  let before=await sample();assert.equal(before.state.timeline,true);assert.equal(await active(),'true');
  await advance(600000);let after=await sample();
  assert.equal(await page.evaluate(()=>window.__weatherCalls),2);assert.equal(after.state.condition,'rain');
  assert(after.state.rainAmount>0&&after.state.rainAmount<1,'rain must fade in');
  assert(after.state.cloudCover>.08&&after.state.cloudCover<.92,'cloud cover must interpolate');
  assert.equal(after.state.timeline,true);phaseContinues(before,after,'rain refresh');await realClock();
  await settleWeather();after=await sample();assert(after.state.rainAmount>.99);assert(after.state.cloudCover>.91);
  before=after;await advance(600000);after=await sample();
  assert.equal(await page.evaluate(()=>window.__weatherCalls),3);assert.equal(after.state.condition,'overcast');phaseContinues(before,after,'overcast refresh');
  assert(after.state.rainAmount>0&&after.state.rainAmount<1,'rain must fade out during overcast transition');
  assert(after.state.overcastAmount>0&&after.state.overcastAmount<1,'overcast must fade in');
  await settleWeather();after=await sample();assert(after.state.rainAmount<.01);assert(after.state.overcastAmount>.99);
  for(const id of ['rain','snow']){
   before=await sample();await select(id);after=await sample();assert.equal(after.state.condition,id);assert.equal(after.state.timeline,true);
   assert.equal(await active(),'true','manual weather stopped accelerated sky');phaseContinues(before,after,'manual '+id);
   if(id==='snow'){assert(after.state.rainAmount>0&&after.state.rainAmount<1);assert(after.state.snowAmount>0&&after.state.snowAmount<1,'rain/snow must briefly coexist');}
   await settleWeather();after=await sample();assert(after.state[id+'Amount']>.99);if(id==='snow')assert(after.state.rainAmount<.01,'old rain did not fade out');
  }
  await page.locator('#day-cycle').click();await page.clock.runFor(160);after=await sample();
  assert.equal(await active(),'false');assert.equal(after.state.condition,'snow','stop removed manual weather');assert.equal(after.state.timeline,true);
  const expectedAltitude=await page.evaluate(()=>clockSolarPosition(new Date(window.__sample.wall),30.26,120.13).altitude);
  assert(Math.abs(after.state.sunAltitude-expectedAltitude)<.0001,'stop did not restore actual solar position');
  before=after;await advance(60000);after=await sample();assert.equal(after.state.condition,'snow');assert.notEqual(after.state.sunAltitude,before.state.sunAltitude,'manual weather froze solar movement');
  await page.locator('#day-cycle').click();await advance(4200);before=await sample();assert.equal(before.state.condition,'snow','restart discarded manual weather');
  await page.locator('[data-return-live]:visible').first().click();await page.clock.runFor(160);after=await sample();
  assert.equal(after.state.condition,'overcast');assert.equal(await active(),'true','return live stopped accelerated sky');phaseContinues(before,after,'return live');await realClock();
  await page.evaluate(()=>{window.__weatherFail=true;window.dispatchEvent(new Event('online'));});await page.clock.runFor(160);
  assert.equal((await sample()).state.condition,'overcast','failed refresh replaced recent weather with clear sky');
  assert.match(await page.locator('#weather-status').textContent(),/保留|最近|上次|缓存/);
  await page.context().setOffline(true);await page.clock.runFor(160);
  assert.equal((await sample()).state.condition,'overcast','offline event erased recent weather');
  assert.doesNotMatch(await page.locator('#weather-status').textContent(),/离线晴天/,'offline status misrepresents cached weather');
  await page.locator('#day-cycle').click();await page.clock.runFor(160);
  for(const id of ['sunrise','noon','sunset','night']){
   await select(id);before=await sample();assert.equal(before.state.timeline,true,id+' has a frozen timeline');
   await advance(5000);after=await sample();assert.notDeepEqual([after.state.sunAltitude,after.state.moonAltitude],[before.state.sunAltitude,before.state.moonAltitude],id+' anchors never advance');
  }
  assert.deepEqual(errors,[]);
  const result={passed:true,checks:['10-minute clear/rain/overcast updates inside accelerated day','weather weights interpolate and rain/snow coexist during transition','weather updates preserve loop phase','actual clock stays real','manual rain/snow preserve accelerated timeline','stop restores actual astronomy while retaining manual weather','return live restores current weather without stopping acceleration','fresh weather survives failed refresh and offline event','sunrise/noon/sunset/night anchors continuously advance'],weatherCalls:await page.evaluate(()=>window.__weatherCalls)};
  fs.writeFileSync('work/continuous-weather-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
