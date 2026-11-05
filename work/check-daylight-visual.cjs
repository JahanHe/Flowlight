// Same digits, seed, weather and animation age: only the real Hangzhou solar sample changes.
// Run: node work/check-daylight-visual.cjs. Desktop Chromium evidence, not phone performance.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const html=fs.readFileSync('outputs/glass-clock.html','utf8');
const boundary=/\(\s*\(\)\s*=>\s*\{\s*['"]use strict['"];/;
assert(boundary.test(html));assert.equal(html.split('clockSkyAt(now,').length,2,'production astronomy call seam');
const observed=html.replace('clockSkyAt(now,','clockSkyAt(new Date(window.__qaSkyDate),').replace(boundary,match=>
 `const originalSkyScene=createWeatherScene;createWeatherScene=function(){const scene=originalSkyScene.apply(this,arguments),set=scene.setState.bind(scene);scene.setState=next=>{window.__sceneState={...next};set(next);};return scene;};const originalGlass=createGlassDigits;createGlassDigits=function(){const glass=originalGlass.apply(this,arguments),set=glass.setLight.bind(glass);glass.setLight=light=>{window.__sceneLight={...light};set(light);};return glass;};`+match);
const periods=[['dawn','清晨','06:08'],['morning','上午','09:00'],['noon','正午','12:00'],['afternoon','下午','15:00'],['sunset','傍晚','17:05'],['twilight','黄昏','17:45'],['night','夜晚','21:00']];
const fixture=JSON.parse(fs.readFileSync('work/references/cma-hangzhou-live.json','utf8'));
fixture.data.lastUpdate='2026/10/19 11:11';fixture.data.now.precipitation=0;fixture.data.now.windSpeed=1;
for(const d of fixture.data.daily){d.dayCode=d.nightCode=0;d.dayText=d.nightText='晴';}
function observe(date){
 window.__qaSkyDate='2026-10-19T'+date+':00+08:00';
 let seed=1217;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
 for(const key of ['requestFullscreen','webkitRequestFullscreen'])Object.defineProperty(Element.prototype,key,{value:undefined,configurable:true});
 localStorage.setItem('floating-light-render-quality','fine');
 localStorage.setItem('floating-light-clock',JSON.stringify({glass:true,seconds:false,companion:false,size:100,weight:400,spacing:-5,font:'inter',effectsVersion:1,immersive:true,motionSpeed:1}));
 window.daylightSample=()=>{
  const sample=canvas=>{
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   let r=0,g=0,b=0,ink=0,total=0,hash=2166136261;
   for(let y=0;y<canvas.height;y+=2)for(let x=0;x<canvas.width;x+=2){const i=(y*canvas.width+x)*4;total++;hash=Math.imul(hash^pixels[i]^pixels[i+1]^pixels[i+2]^pixels[i+3],16777619);if(pixels[i+3]>64){r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];ink++;}}
   return {width:canvas.width,height:canvas.height,hash:hash>>>0,r:r/Math.max(1,ink),g:g/Math.max(1,ink),b:b/Math.max(1,ink),ink,coverage:ink/total,cornerAlpha:pixels[3]};
  };
  const visible=n=>n.getBoundingClientRect().width>0;
  return {scene:__sceneState,light:__sceneLight,palette:clockDaylight(__sceneState),quality:clockQuality.level,motion:clockMotion.time,
   weather:sample(document.getElementById('weather-canvas')),
   glass:[...document.querySelectorAll('.static .glass-numeral')].filter(c=>visible(c)&&c.width&&c.height).map(sample),
   clock:[...document.querySelectorAll('.tile')].filter(visible).map(n=>n.querySelector('.static.top .numeral').textContent),
   transparent:[...document.querySelectorAll('.clock,.date-line,.tile')].filter(visible).map(n=>({class:n.className,background:getComputedStyle(n).backgroundColor})),
   glassReady:document.documentElement.classList.contains('glass-digits-ready'),solarTransmission:document.getElementById('weather-canvas').clockSolarTransmission};
 };
}
const meanGlass=s=>s.glass.reduce((rgb,g)=>rgb.map((v,i)=>v+g[['r','g','b'][i]]/s.glass.length),[0,0,0]);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']}),samples=[],failures=[];
 const verify=(ok,message)=>{if(!ok)failures.push(message);};
 try{
  for(const [name,label,hour] of [...periods,['portrait','手机 · 傍晚','17:05']]){
   const portrait=name==='portrait',page=await browser.newPage({viewport:portrait?{width:390,height:844}:{width:1280,height:720},deviceScaleFactor:1,timezoneId:'Asia/Shanghai'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.addInitScript(observe,hour);
   await page.route('**/*',r=>{const url=new URL(r.request().url());return url.hostname==='daylight.test'?r.fulfill({body:observed,contentType:'text/html'}):url.hostname==='weather.cma.cn'?r.fulfill({json:fixture,headers:{'access-control-allow-origin':'*'}}):r.abort();});
   const wall=new Date('2026-10-19T11:11:00+08:00');await page.clock.install({time:wall});await page.clock.pauseAt(wall);await page.clock.setFixedTime(wall);
   await page.goto('http://daylight.test/?ramMB=4096&availableMB=2048&cores=8');await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>window.clockAppReady);
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('floating-light-weather')||'null')?.data?.providerId==='cma');
   await page.evaluate(()=>document.getElementById('fullscreen').click());await page.clock.runFor(6000);
   const sample=await page.evaluate(()=>daylightSample()),path=`work/daylight-visual-${name}.png`;
   await page.screenshot({path});samples.push({name,label,hour,path,errors,...sample,glassMean:meanGlass(sample)});
   verify(!errors.length,name+' runtime/console errors: '+errors.join('; '));verify(sample.glassReady&&sample.glass.length>0&&sample.glass.every(g=>g.ink>30),name+' missing glass numerals');
   verify(sample.glass.every(g=>g.cornerAlpha===0),name+' numeral canvas has opaque backing');
   for(const item of sample.transparent)verify(['rgba(0, 0, 0, 0)','transparent'].includes(item.background),name+' opaque backing: '+item.class);
   verify(sample.clock.join(':')===samples[0].clock.join(':'),name+' changed the fixed wall clock');
   await page.close();
  }
  const byName=Object.fromEntries(samples.map(s=>[s.name,s])),noon=byName.noon,sunset=byName.sunset,twilight=byName.twilight;
  verify(noon.weather.b>noon.weather.r+10,'midday must remain blue, not yellow');
  verify(sunset.weather.r/sunset.weather.b>noon.weather.r/noon.weather.b+.12,'sunset atmosphere must visibly warm');
  verify(twilight.weather.b<noon.weather.b*.75,'twilight must become visibly dimmer than noon');
  verify(sunset.glassMean[0]/sunset.glassMean[2]>noon.glassMean[0]/noon.glassMean[2]+.04,'warm light must reach actual glass pixels');
  // A product regression threshold, not a perceptual standard: daytime palettes may not collapse to one blue.
  for(const [a,b] of [['morning','noon'],['noon','afternoon'],['morning','afternoon']])verify(['r','g','b'].reduce((sum,c)=>sum+Math.abs(byName[a].weather[c]-byName[b].weather[c]),0)/3>2,a+'/'+b+' daylight color difference is too weak');
  for(let i=1;i<periods.length;i++)verify(samples[i].glass.some((g,j)=>g.hash!==samples[i-1].glass[j].hash),'glass remains static between '+samples[i-1].name+' and '+samples[i].name);
  const gallery=await browser.newPage({viewport:{width:1280,height:1560},deviceScaleFactor:1});
  await gallery.setContent('<style>body{margin:0;background:#080a0e;color:#eee;font:15px sans-serif;display:grid;grid-template-columns:1fr 1fr}figure{margin:0;height:390px;display:flex;flex-direction:column;align-items:center}figcaption{height:30px;line-height:30px}img{height:360px;max-width:640px;object-fit:contain}</style>'+samples.map(s=>`<figure><figcaption>${s.label} · ${s.hour}</figcaption><img src="data:image/png;base64,${fs.readFileSync(s.path).toString('base64')}"></figure>`).join(''));
  await gallery.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
  await gallery.screenshot({path:'work/daylight-visual-contact.png'});await gallery.close();
  const report={pass:!failures.length,htmlSha256:createHash('sha256').update(html).digest('hex'),scope:'Final bundled app; fixed 11:11 clock, seeded random, clear CMA fixture, real Hangzhou solar positions, identical 6-second animation age. Mac desktop Chromium, not physical-phone verification.',failures,samples};
  fs.writeFileSync('work/daylight-visual-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,htmlSha256:report.htmlSha256,failures,samples:samples.map(s=>({name:s.name,altitude:s.scene.sunAltitude,sky:[s.weather.r,s.weather.g,s.weather.b],glass:s.glassMean}))},null,2));if(failures.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
