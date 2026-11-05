// Network fixtures only: preserve provider -> app -> scene. Run with node work/check-live-weather-pipeline.cjs.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const fallbackOnly=process.argv.includes('--fallback-only');
const html=fs.readFileSync(process.env.CLOCK_HTML||'outputs/glass-clock.html','utf8'),template=JSON.parse(fs.readFileSync('work/references/cma-hangzhou-live.json','utf8'));
const seam=/\(\s*\(\)\s*=>\s*\{\s*['"]use strict['"];/;assert(seam.test(html));
const observed=html.replace(seam,match=>`const originalSkyScene=createWeatherScene;createWeatherScene=function(){const scene=originalSkyScene.apply(this,arguments),set=scene.setState.bind(scene);scene.setState=next=>{window.__sceneState={...next};set(next);};return scene;};const originalGlass=createGlassDigits;createGlassDigits=function(){const glass=originalGlass.apply(this,arguments),set=glass.setLight.bind(glass);glass.setLight=light=>{window.__sceneLight={...light};set(light);};return glass;};`+match);
function fixture(code,wall){const value=structuredClone(template);value.data.lastUpdate=wall.slice(0,16).replace('T',' ').replaceAll('-','/');value.data.now.precipitation=0;value.data.now.windSpeed=1;for(const d of value.data.daily){d.dayCode=d.nightCode=code;d.dayText=d.nightText=['晴','多云','阴'][code];}return value;}
function instrument(){
 let seed=1217;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
 for(const key of ['requestFullscreen','webkitRequestFullscreen'])Object.defineProperty(Element.prototype,key,{value:undefined,configurable:true});
 localStorage.setItem('floating-light-render-quality','smooth');localStorage.setItem('floating-light-clock',JSON.stringify({glass:true,seconds:false,companion:false,size:100,weight:400,spacing:-5,font:'inter',effectsVersion:1,immersive:true,motionSpeed:1}));
 localStorage.setItem('floating-light-calendar-hourly','false'); // Isolate observed weather from optional hourly art.
 window.pipelineSample=()=>{
  const canvas=document.querySelector('#weather-canvas'),sample=document.createElement('canvas');sample.width=64;sample.height=36;const ctx=sample.getContext('2d');ctx.drawImage(canvas,0,0,64,36);const all=ctx.getImageData(0,0,64,36).data,pixels=[];let r=0,g=0,b=0,n=0;
  for(let y=6;y<29;y++)for(let x=9;x<55;x++){const i=(y*64+x)*4;pixels.push(all[i],all[i+1],all[i+2]);r+=all[i];g+=all[i+1];b+=all[i+2];n++;}
  const cache=JSON.parse(localStorage.getItem('floating-light-weather')||'null');
  return {state:__sceneState,light:__sceneLight,motion:clockMotion.time,at:performance.now(),date:Date.now(),pixels,mean:[r/n,g/n,b/n],transmission:canvas.clockSolarTransmission,preview:document.body.dataset.preview,source:cache?.data?.providerId,current:cache?.data?.current,status:document.querySelector('#weather-status').textContent,cycle:document.querySelector('#day-cycle').getAttribute('aria-pressed'),clock:[...document.querySelectorAll('.tile')].filter(n=>n.getBoundingClientRect().width).map(n=>n.querySelector('.static.top .numeral').textContent)};
 };
}
const distance=(a,b)=>a.pixels.reduce((sum,v,i)=>sum+Math.abs(v-b.pixels[i]),0)/a.pixels.length;
const compact=({pixels,...sample})=>sample;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']}),results=[],failures=[];
 const verify=(condition,message)=>{if(!condition)failures.push(message);};
 async function start(wall,initial=0,fallback=false,portrait=false){
  const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1,timezoneId:'Asia/Shanghai',userAgent:'Mozilla/5.0 (Linux; Android 13; Test Phone) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36'}),network={code:initial,wall,calls:[],errors:[]};
  if(portrait)await page.setViewportSize({width:390,height:844});page.on('pageerror',e=>network.errors.push(e.message));await page.addInitScript(instrument);
  await page.clock.install({time:new Date(wall)});await page.clock.pauseAt(new Date(wall));await page.clock.setFixedTime(new Date(wall));
  await page.route('**/*',async route=>{const url=new URL(route.request().url());
   if(url.hostname==='appassets.androidplatform.net')return route.fulfill({body:observed,contentType:'text/html'});
   if(url.hostname==='weather.cma.cn'){network.calls.push({code:network.code,url:route.request().url(),kind:'cma'});return fallback?route.fulfill({status:406,body:'Not Acceptable',headers:{'access-control-allow-origin':'*'}}):route.fulfill({json:fixture(network.code,network.wall),headers:{'access-control-allow-origin':'*'}});}
   if(url.hostname==='api.open-meteo.com'){network.calls.push({kind:fallback?'open-meteo':'unexpected-fallback'});if(!fallback)return route.abort();const now=Date.parse(network.wall)/1000,day=Math.floor((now+28800)/86400)*86400-28800,days=[day-86400,day,day+86400];return route.fulfill({json:{utc_offset_seconds:28800,current:{time:now,weather_code:[0,2,3][network.code],is_day:1,cloud_cover:[8,50,96][network.code],precipitation:0,wind_speed_10m:3.6},daily:{time:days,sunrise:days.map(d=>d+21600),sunset:days.map(d=>d+64800),moonrise:days.map(()=>null),moonset:days.map(()=>null),moon_phase:days.map(()=>null)}},headers:{'access-control-allow-origin':'*'}});}
   return route.abort();
  });
  await page.goto('https://appassets.androidplatform.net/assets/glass-clock.html?ramMB=4096&availableMB=2048&cores=8');await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>window.clockAppReady&&window.clockCalendarReady&&document.querySelector('#weather-canvas').clockCloudAtlasReady);await page.waitForFunction(provider=>JSON.parse(localStorage.getItem('floating-light-weather')||'null')?.data?.providerId===provider,fallback?'open-meteo':'cma');
  await page.evaluate(()=>document.getElementById('fullscreen').click());await page.clock.runFor(8000);return {page,network};
 }
 try{
  for(const [period,wall] of fallbackOnly?[]:[['noon','2026-10-17T12:00:00+08:00'],['dawn','2026-10-17T06:15:00+08:00']]){
   const samples=[];for(const code of [0,1,2]){
    const {page,network}=await start(wall,code),sample=await page.evaluate(()=>pipelineSample());samples.push(sample);
    await page.screenshot({path:`work/live-weather-${period}-${['clear','cloudy','overcast'][code]}.png`});
    verify(sample.source==='cma'&&network.calls.length===1,period+' provider was not exercised');verify(sample.state.condition===['clear','cloudy','overcast'][code],period+' lost condition '+code);verify(Math.abs(sample.state.cloudCover-[.08,.50,1][code])<.02,period+' lost cloud fraction '+code);verify(sample.preview==='live',period+' accidentally tested preview');verify(Number.isFinite(sample.state.sunAltitude)&&sample.state.timeline===true,period+' live sky lost continuous astronomy');verify(!network.errors.length,period+' runtime errors');
    results.push({type:'same-time-weather',period,code,network,...compact(sample)});await page.close();
   }
   const deltas={clearCloudy:distance(samples[0],samples[1]),cloudyOvercast:distance(samples[1],samples[2]),clearOvercast:distance(samples[0],samples[2])};
   // Explicit design thresholds, not human-perception standards: central RGB differs by >4% of 8-bit range,
   // clear/cloudy uses at least 35% of the full clear/overcast range, and overcast removes 65% of noon blue bias.
   verify(deltas.clearCloudy>10,period+' clear/cloudy needs >10/255 mean pixel difference');verify(deltas.clearCloudy/deltas.clearOvercast>.35,period+' clear/cloudy collapsed into the same visual state');verify(deltas.cloudyOvercast>8,period+' cloudy/overcast pixel difference is too weak');verify(samples[0].light.strength>samples[2].light.strength+.10,period+' overcast does not visibly dim the light');
   if(period==='noon')verify(samples[2].mean[2]-samples[2].mean[0]<(samples[0].mean[2]-samples[0].mean[0])*.35,'noon overcast retains too much saturated blue sky');
   results.push({type:'weather-pixel-distance',period,deltas});
  }
  if(fallbackOnly){
   const samples=[];for(const [code,portrait] of [[0,false],[2,false],[2,true]]){const {page,network}=await start('2026-10-17T12:00:00+08:00',code,true,portrait),sample=await page.evaluate(()=>pipelineSample());samples.push(sample);await page.screenshot({path:`work/live-weather-openmeteo-${code===0?'clear':'overcast96'}-${portrait?'portrait':'landscape'}.png`});verify(sample.source==='open-meteo','CMA406 did not fall back to Open-Meteo');verify(sample.state.condition===(code===0?'clear':'overcast'),'Open-Meteo condition lost');verify(Math.abs(sample.state.cloudCover-(code===0?.08:.96))<.02,'Open-Meteo cloud coverage lost');verify(!network.errors.length,'fallback runtime error');results.push({type:'cma406-openmeteo',portrait,network,...compact(sample)});await page.close();}
   const delta=distance(samples[0],samples[1]);verify(delta>12,'96% overcast insufficiently differs from clear');verify(samples[1].mean[2]-samples[1].mean[0]<(samples[0].mean[2]-samples[0].mean[0])*.35,'96% overcast retains too much saturated blue sky');results.push({type:'fallback-pixel-distance',delta});
   const report={pass:!failures.length,htmlSha256:createHash('sha256').update(html).digest('hex'),scope:'CMA406 then Open-Meteo200 fixture through actual network/provider/app/renderer; physical phone not tested',failures,results};fs.writeFileSync('work/live-weather-fallback-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,failures,delta},null,2));if(failures.length)process.exitCode=1;return;
  }
  const {page,network}=await start('2026-10-17T12:00:00+08:00',0);
  await page.keyboard.press('Escape');await page.evaluate(()=>document.getElementById('day-cycle').click());await page.clock.runFor(2500);
  const continuity=[];
  for(const code of [1,2,0]){
   const before=await page.evaluate(()=>pipelineSample()),calls=network.calls.length;network.code=code;
   await page.clock.fastForward(600000);await page.waitForFunction(count=>JSON.parse(localStorage.getItem('floating-light-weather')).data.current.weather_code===[0,2,3][count],code);await page.clock.runFor(250);
   const during=await page.evaluate(()=>pipelineSample());
   verify(network.calls.length===calls+1,'ten-minute timer did not issue exactly one new provider request');verify(during.state.condition===['clear','cloudy','overcast'][code],'refresh did not reach scene');verify(during.state.timeline===true&&during.cycle==='true','weather refresh disabled day cycle');verify(during.motion>before.motion,'weather refresh reset animation time');verify(during.clock.join(':')===before.clock.join(':'),'sky fast-forward changed fixed wall clock');
   const phaseError=Math.abs(((during.state.dayProgress-before.state.dayProgress-(during.at-before.at)/60000+1.5)%1+1)%1-.5);
   verify(phaseError<.005,'weather refresh reset simulated day phase');
   for(let i=0;i<14;i++){await page.clock.fastForward(1000);await page.clock.runFor(40);}const after=await page.evaluate(()=>pipelineSample());
   verify(Math.abs(after.state.cloudCover-[.08,.50,1][code])<.02,'weather transition did not settle');continuity.push({code,phaseError,before:compact(before),during:compact(during),after:compact(after)});
  }
  verify(!network.errors.length,'continuity runtime errors');results.push({type:'ten-minute-refresh-during-day-cycle',network,samples:continuity});await page.close();
  const report={pass:!failures.length,htmlSha256:createHash('sha256').update(html).digest('hex'),scope:'Offline network fixtures with actual CMA provider parser, app controls and renderer; Android UA desktop Chromium, not physical Android or live provider availability',failures,results};fs.writeFileSync('work/live-weather-pipeline-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,failures,weatherDifferences:results.filter(r=>r.type==='weather-pixel-distance'),refreshes:continuity.length},null,2));if(failures.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
