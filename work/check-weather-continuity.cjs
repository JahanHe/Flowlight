// Run: node work/check-weather-continuity.cjs
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const source=fs.readFileSync('work/weather-scene.js','utf8'),sandbox=vm.createContext({});
vm.runInContext(source,sandbox);
const light=state=>sandbox.clockLightSource({phase:'day',sunAltitude:40,sunProgress:.5,moonAltitude:40,moonProgress:.7,moonVisible:true,moonPhase:.5,cloudCover:0,motionTime:0,timeline:true,...state},1200,800);
const morning=light({sunProgress:.15,sunAltitude:15}),evening=light({sunProgress:.85,sunAltitude:15});
assert(morning.shadowX>0&&evening.shadowX<0,'shadows must oppose the light');
const overhead=light({sunAltitude:75});
assert(Math.hypot(morning.shadowX,morning.shadowY)>Math.hypot(overhead.shadowX,overhead.shadowY),'low sun stretches projected shadows');
const noon=light({sunAltitude:65}),horizon=light({sunAltitude:3});
assert.equal(noon.rgb,'255,255,255');assert(horizon.rgb.split(',')[0]-horizon.rgb.split(',')[2]>60);
assert(noon.y<horizon.y,'solar elevation controls vertical position');
const moonLeft=light({phase:'night',sunAltitude:-35,moonProgress:.2}),moonRight=light({phase:'night',sunAltitude:-35,moonProgress:.8});
assert(moonLeft.shadowX>0&&moonRight.shadowX<0,'moving moon reverses projection');
for(const state of [{moonVisible:false},{moonAltitude:-20},{moonPhase:0}])assert(light({phase:'night',sunAltitude:-35,...state}).strength<=.111,'no strong moonlight without an illuminated moon');
assert(!light({phase:'night',sunAltitude:-35,moonVisible:false}).visible);
let previous=light({sunAltitude:-8});
for(let altitude=-7.99;altitude<=5;altitude+=.01){
 const current=light({sunAltitude:altitude});
 assert(Math.hypot(current.x-previous.x,current.y-previous.y)<2,'twilight illumination position jumped');
 assert(Math.abs(current.strength-previous.strength)<.003,'twilight illumination strength jumped');
 assert(current.rgb.split(',').every((n,i)=>Math.abs(n-previous.rgb.split(',')[i])<=1),'twilight tint jumped');
 previous=current;
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<style>body{margin:0}canvas{position:fixed;inset:0;width:100%;height:100%}</style><canvas></canvas>');
  await page.evaluate(()=>{window.testTime=1000;Object.defineProperty(performance,'now',{value:()=>testTime});window.callbacks=new Map();window.serial=0;window.requestAnimationFrame=fn=>{callbacks.set(++serial,fn);return serial;};window.cancelAnimationFrame=id=>callbacks.delete(id);});
  await page.addScriptTag({content:source.replace('  resize();','  window.inspectScene=()=>({transition:!!transition,state,clouds}); resize();')});
  const result=await page.evaluate(()=>{
   const scene=createWeatherScene(document.querySelector('canvas'),false);
   const advance=ms=>{testTime+=ms;const [id,fn]=[...callbacks][0];callbacks.delete(id);fn(testTime);};
   const state={phase:'day',condition:'clear',cloudCover:0,wind:4,sunProgress:.5,sunAltitude:60,moonProgress:.8,moonAltitude:30,moonVisible:true,moonPhase:.5,timeline:true};
   scene.setState(state);advance(1200);
   const before=document.querySelector('canvas').toDataURL();advance(4000);const cloudsMove=before!==document.querySelector('canvas').toDataURL();
   const transitionChecks=[];
   for(const [phase,sunAltitude] of [['sunset',3],['night',-5],['night',-35],['sunrise',-2],['day',45]]){scene.setState({...state,phase,sunAltitude});transitionChecks.push(inspectScene().transition);advance(34);}
   scene.setState({...state,condition:'rain',cloudCover:.8,intensity:1});const weatherCrossfade=inspectScene().transition;advance(1200);
   const rain=[];for(let i=0;i<10;i++){rain.push(document.querySelector('canvas').toDataURL());advance(100);}
   return {cloudsMove,transitionChecks,weatherCrossfade,rainFrames:new Set(rain).size,raf:callbacks.size};
  });
  assert(result.cloudsMove);assert(result.transitionChecks.every(x=>!x),'continuous solar time must not restart scene transitions');assert(result.weatherCrossfade,'actual weather changes should crossfade');assert.equal(result.rainFrames,10,'rain must continue each sampled frame');assert.equal(result.raf,1);assert.deepEqual(errors,[]);
  fs.writeFileSync('work/weather-continuity-results.json',JSON.stringify({light:{morning,evening,noon,moonLeft,moonRight},...result,errors},null,2)+'\n');
  console.log('PASS: shared sun/moon direction, physical elevation, moving projections, neutral noon, no moon/no strong shadow, smooth twilight, timeline without snapshot resets, persistent clouds/rain, one RAF.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
