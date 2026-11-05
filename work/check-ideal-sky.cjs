// Run: node work/check-ideal-sky.cjs. Test the independent Canvas renderer at controlled times.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<style>body{margin:0;background:black}canvas{width:1024px;height:768px}</style><canvas></canvas>');
  await page.evaluate(()=>{
   const native=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,options){return native.call(this,type,{...options,willReadFrequently:true});};
   window.now=1000;Object.defineProperty(performance,'now',{value:()=>now});window.raf=new Map();let id=0;
   window.requestAnimationFrame=fn=>{raf.set(++id,fn);return id;};window.cancelAnimationFrame=id=>raf.delete(id);
  });
  await page.addScriptTag({content:fs.readFileSync('work/solar-position.js','utf8')+'\n'+fs.readFileSync('work/weather-scene.js','utf8')});
  const result=await page.evaluate(()=>{
   const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
   const scene=createWeatherScene(canvas,false),paint=next=>scene.setState({...next,timeline:false}),pixels=()=>ctx.getImageData(0,0,1024,768).data;
   const difference=(a,b)=>{let changed=0,total=0;for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(a[i+c]-b[i+c]);if(d>8)changed++;total+=d;}return {changed,mean:total/(1024*768*3)};};
   paint({phase:'night',condition:'clear',cloudCover:0,intensity:0,sunAltitude:-35,moonVisible:false,idealCycle:true,dayProgress:.8,cycleElapsed:2});
   now+=1200;paint({});const starsBefore=pixels();paint({dayProgress:.84});const starRotation=difference(starsBefore,pixels());
   const meteorBefore=pixels();paint({cycleElapsed:4.6});const meteor=difference(meteorBefore,pixels());
   paint({cycleElapsed:2});const meteorAfter=pixels();const meteorGone=difference(meteorBefore,meteorAfter);
   paint({phase:'day',sunVisible:true,sunAltitude:55,sunProgress:.4,cloudCover:.2,idealCycle:false,dayProgress:.4,cycleElapsed:2});
   now+=1200;paint({});const dayBefore=pixels();now+=4000;paint({});const liveMotion=difference(dayBefore,pixels());
   paint({idealCycle:true});now+=1200;paint({});const idealBefore=pixels();now+=4000;paint({});const idealMotion=difference(idealBefore,pixels());
   const before=pixels();scene.setClockBounds?.({left:100,top:240,width:800,height:230});paint({});const clockMask=difference(before,pixels());
   const nights=[];
   for(const hour of [19,20,21,22,23,0,1,2,3,5]) {
    const elapsed=((hour-6+24)%24)/24*60;
    paint(clockIdealSky(hour/24,elapsed));now+=1200;paint({});const before=pixels();
    let light=0,count=0,bright=0;
    for(let y=154;y<576;y++)for(let x=205;x<819;x++){const i=(y*1024+x)*4,l=before[i]*.2126+before[i+1]*.7152+before[i+2]*.0722;light+=l;count++;if(l>30)bright++;}
    now+=1000;paint(clockIdealSky(hour/24+1/60,elapsed+1));
    nights.push({hour,meanLight:light/count,brightPixels:bright,motion:difference(before,pixels())});
   }
   paint(clockIdealSky(23/24,42.5));const cycleBefore=pixels();now+=60000;paint(clockIdealSky(23/24,102.5));const nextCycle=difference(cycleBefore,pixels());
   return {starRotation,meteor,meteorGone,liveMotion,idealMotion,clockMask,nights,nextCycle,frames:raf.size};
  });
  assert.ok(result.starRotation.changed>500,'ideal starfield does not visibly turn');
  assert.ok(result.meteor.changed>25&&result.meteor.changed<10000,'preview meteor missing or full-screen flash');
  assert.equal(result.meteorGone.changed,0,'meteor leaves a trail permanently painted');
  assert.ok(result.liveMotion.changed>10000&&result.idealMotion.changed>10000,'cloud and halo motion stopped');
  for(const night of result.nights){assert.ok(night.meanLight>15&&night.brightPixels>40000,`${night.hour}: ideal night is too dark`);assert.ok(night.motion.changed>5000,`${night.hour}: ideal night does not visibly move each second`);}
  assert.ok(result.nextCycle.changed>10000,'the next day repeats the same cloud/halo image');
  assert.equal(result.clockMask.changed,0,'clock bounds add a background mask');assert.equal(result.frames,1);assert.deepEqual(errors,[]);
  fs.writeFileSync('work/ideal-sky-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
