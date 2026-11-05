// Final HTML A/B: identical seed/time, with only aurora disabled in the control page.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const {PNG}=require('pngjs');
const preview=process.argv.includes('--preview');
const html=fs.readFileSync(process.env.CLOCK_HTML||'outputs/glass-clock.html','utf8');
const aurora=/function aurora\([^)]*\)\s*\{/,boundary=/\(\s*\(\)\s*=>\s*\{\s*['"]use strict['"];/;
assert(aurora.test(html)&&boundary.test(html)&&html.includes('const skyImages=new Map;'),'final HTML instrumentation seams');
// A common fixed-step RAF clock excludes initial texture-baking time from the A/B phase.
const observed=html.replace('const skyImages=new Map;','const skyImages=new Map;window.__auroraDecode=()=>Promise.all([...skyImages.values()].filter(image=>image instanceof HTMLImageElement).map(image=>image.decode().catch(()=>{})));').replace(aurora,m=>m+'if(window.__disableAurora)return;').replace(boundary,m=>`
let auroraTestNow=0,auroraTestSerial=0;const auroraTestFrames=new Map();Object.defineProperty(performance,'now',{value:()=>auroraTestNow,configurable:true});window.requestAnimationFrame=callback=>{auroraTestFrames.set(++auroraTestSerial,callback);return auroraTestSerial;};window.cancelAnimationFrame=id=>auroraTestFrames.delete(id);window.__auroraAdvance=ms=>{const end=auroraTestNow+ms;while(auroraTestNow<end){auroraTestNow=Math.min(end,auroraTestNow+1000/60);const frames=[...auroraTestFrames.values()];auroraTestFrames.clear();for(const callback of frames)callback(auroraTestNow);}};
const originalAuroraScene=createWeatherScene;createWeatherScene=function(){const scene=originalAuroraScene.apply(this,arguments),set=scene.setState.bind(scene);scene.setState=next=>{const state={...next,condition:window.__cover>.8?'overcast':'clear',cloudCover:window.__cover,overcastAmount:window.__cover>.8?1:0,rainAmount:0,snowAmount:0,fogAmount:0,stormAmount:0};window.__sceneState=state;set(state);};return scene;};
const originalAuroraGlass=createGlassDigits;createGlassDigits=function(){const glass=originalAuroraGlass.apply(this,arguments),set=glass.setLight.bind(glass);glass.setLight=light=>{window.__sceneLight=light;set(light);};return glass;};`+m);
function initialize({mode,immersive,cover,disabled}){
 let seed=1217;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
 window.__disableAurora=disabled;window.__cover=cover;
 for(const key of ['requestFullscreen','webkitRequestFullscreen'])Object.defineProperty(Element.prototype,key,{value:undefined,configurable:true});
 localStorage.setItem('floating-light-render-quality',mode);
 localStorage.setItem('floating-light-clock',JSON.stringify({glass:true,seconds:false,companion:false,size:100,weight:400,spacing:-5,font:'inter',effectsVersion:1,immersive,motionSpeed:1}));
 window.auroraSample=()=>{
  const read=canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,step=Math.max(1,Math.ceil(Math.sqrt(canvas.width*canvas.height/6000))),pixels=[];for(let y=0;y<canvas.height;y+=step)for(let x=0;x<canvas.width;x+=step){const i=(y*canvas.width+x)*4;pixels.push(data[i],data[i+1],data[i+2],data[i+3]);}return {width:canvas.width,height:canvas.height,pixels,cornerAlpha:data[3]};};
  const visible=[...document.querySelectorAll('.tile,.date-line')].filter(e=>e.getBoundingClientRect().width);
  return {motion:clockMotion.time,quality:clockQuality.level,source:document.querySelector('#weather-canvas').clockAuroraLight,light:window.__sceneLight,state:window.__sceneState,glass:[...document.querySelectorAll('.static .glass-numeral')].filter(c=>c.width&&c.getBoundingClientRect().width).map(read),rects:visible.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}),backgrounds:[...document.querySelectorAll('.clock,.date-line,.tile')].filter(e=>e.getBoundingClientRect().width).map(e=>getComputedStyle(e).backgroundColor),clock:visible.filter(e=>e.classList.contains('tile')).map(e=>e.querySelector('.static.top .numeral').textContent)};
 };
}
function visibleDelta(on,off,rects){
 assert.equal(on.width,off.width);assert.equal(on.height,off.height);
 const vector=[];let changed=0,peak=0;
 for(let y=Math.floor(on.height*.10);y<on.height*.67;y+=2)for(let x=Math.floor(on.width*.10);x<on.width*.90;x+=2){
  if(rects.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height))continue;
  const i=(y*on.width+x)*4,d=[0,1,2].map(c=>on.data[i+c]-off.data[i+c]);vector.push(...d);const sum=d.reduce((n,v)=>n+Math.abs(v),0);if(sum>12)changed++;peak=Math.max(peak,...d.map(Math.abs));
 }
 return {vector,mean:vector.reduce((n,v)=>n+Math.abs(v),0)/vector.length,changedFraction:changed/(vector.length/3),peak};
}
function glassDelta(on,off){
 assert.equal(on.length,off.length);let total=0,count=0,changed=0,peak=0;
 on.forEach((a,index)=>{const b=off[index];assert.equal(a.pixels.length,b.pixels.length);for(let i=0;i<a.pixels.length;i+=4)if(Math.min(a.pixels[i+3],b.pixels[i+3])>80){const d=[0,1,2].map(c=>Math.abs(a.pixels[i+c]-b.pixels[i+c]));total+=d.reduce((n,v)=>n+v,0);count++;peak=Math.max(peak,...d);if(d.some(v=>v>2))changed++;}});
 return {mean:total/Math.max(1,count*3),changedFraction:changed/Math.max(1,count),peak,samples:count};
}
const compact=sample=>({...sample,glass:sample.glass.map(({pixels,...rest})=>rest)});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']}),results=[],failures=[];
 const verify=(condition,message)=>{if(!condition)failures.push(message);};
 async function start(config,disabled){
  const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1,timezoneId:'Asia/Shanghai'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(initialize,{...config,disabled});
  const wall=new Date(`2026-10-19T${config.hour}:00:00+08:00`);await page.clock.install({time:wall});await page.clock.pauseAt(wall);await page.clock.setFixedTime(wall);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='aurora.test'?r.fulfill({body:observed,contentType:'text/html'}):r.abort());
  await page.goto('http://aurora.test/?ramMB=4096&availableMB=2048&cores=8');await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>document.getElementById('fullscreen').click());await page.evaluate(()=>__auroraAdvance(1000));await page.evaluate(()=>__auroraDecode());await page.evaluate(()=>__auroraAdvance(5000));
  return {page,errors};
 }
 async function sample(pair){
  const samples=await Promise.all(pair.map(({page})=>page.evaluate(()=>auroraSample()))),screens=await Promise.all(pair.map(async({page})=>PNG.sync.read(await page.screenshot())));
  assert(Math.abs(samples[0].motion-samples[1].motion)<1e-8,`A/B animation clocks differ: ${samples[0].motion} vs ${samples[1].motion}`);assert.deepEqual(samples[0].clock,samples[1].clock);assert.equal(samples[0].state.sunAltitude,samples[1].state.sunAltitude);
  for(const s of samples){assert(s.state.sunAltitude<-6,'test must run at actual night');for(const bg of s.backgrounds)verify(['rgba(0, 0, 0, 0)','transparent'].includes(bg),'opaque clock/date background');verify(s.glass.every(c=>c.cornerAlpha===0),'glass canvas background must stay transparent');}
  for(const screen of screens)for(const [x,y]of [[0,0],[959,0],[0,539],[959,539]])verify(Math.max(...screen.data.subarray((y*screen.width+x)*4,(y*screen.width+x)*4+3))<=3,'screen corners must remain black');
  return {samples,screens,sky:visibleDelta(screens[0],screens[1],samples[0].rects),glass:glassDelta(samples[0].glass,samples[1].glass)};
 }
 try{
  const configs=preview?[{mode:'fine',hour:'02',immersive:true,cover:.08}]:[{mode:'smooth',hour:'21',immersive:true,cover:.08},{mode:'fine',hour:'02',immersive:true,cover:.08},{mode:'fine',hour:'02',immersive:false,cover:.08},{mode:'fine',hour:'02',immersive:true,cover:1}];
  for(const config of configs){
   const label=`${config.mode}-${config.hour}-${config.immersive?'on':'off'}-${config.cover===1?'overcast':'clear'}`,pair=[];
   try{
    for(const disabled of [false,true])pair.push(await start(config,disabled));
    const before=await sample(pair);let motion=null;
    verify(before.samples.every(s=>s.quality===(config.mode==='smooth'?0:1)),label+' must exercise its requested rendering tier');
    if(config.immersive&&config.cover<.9){
     verify(before.sky.mean>1.2,label+' visible aurora contributes >1.2/255 mean RGB');verify(before.sky.changedFraction>.08,label+' aurora must cover a visible sky area');verify(before.sky.peak>12,label+' aurora needs a clear peak');
     verify(before.glass.mean>.05&&before.glass.changedFraction>.01,label+' actual glass pixels must reflect aurora');
     await Promise.all(pair.map(({page})=>page.evaluate(()=>__auroraAdvance(10000))));const after=await sample(pair);
     motion=after.sky.vector.reduce((total,value,i)=>total+Math.abs(value-before.sky.vector[i]),0)/after.sky.vector.length;
     verify(motion>.6,label+' isolated aurora must visibly move over ten seconds');
     fs.writeFileSync(`work/aurora-${label}.png`,PNG.sync.write(after.screens[0]));
    }else verify(before.sky.mean<.05&&before.glass.mean<.05,label+' hidden aurora must not leave a visible/light contribution');
    verify(pair.every(p=>!p.errors.length),label+' runtime errors');
    const {vector,...sky}=before.sky;results.push({config,sky,glass:before.glass,isolatedTenSecondMotion:motion,on:compact(before.samples[0]),off:compact(before.samples[1]),errors:pair.flatMap(p=>p.errors)});
    console.log(JSON.stringify({label,sky,glass:before.glass,motion}));
   }finally{await Promise.all(pair.map(({page})=>page.close()));}
  }
  const report={pass:!failures.length,htmlSha256:createHash('sha256').update(html).digest('hex'),scope:'Final bundled HTML A/B with only aurora disabled, fixed seed, fixed-step animation clock and true night wall times. Final screenshot sky pixels and actual glass pixels. Desktop Chromium, not physical-phone performance.',failures,results};
  fs.writeFileSync(preview?'work/aurora-preview-results.json':'work/aurora-results.json',JSON.stringify(report,null,2));assert.deepEqual(failures,[]);console.log(preview?'PASS preview: fine-tier 02:00 isolated aurora visibility, ten-second motion, glass response and transparent background.':'PASS: visible, moving aurora at evening/deep night in both ordinary tiers; glass response, immersion/overcast gates, transparent clock and black edges.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
