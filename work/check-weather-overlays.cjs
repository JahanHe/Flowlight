// Run: node work/check-weather-overlays.cjs. No server or remote network needed.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<style>body{margin:0;background:black}canvas{width:1024px;height:768px}</style><canvas id="weather"></canvas>');
  await page.evaluate(()=>{
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,options){return original.call(this,type,{...options,willReadFrequently:true});};
   window.now=100000;Object.defineProperty(performance,'now',{value:()=>now});window.frames=new Map();let next=0;
   window.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};window.cancelAnimationFrame=id=>frames.delete(id);
   window.calls={rain:[],snow:[],clouds:[],fullFrameCopies:0};
   for(const [method,kind]of [['moveTo','rain'],['arc','snow'],['drawImage','clouds']]){
    const native=CanvasRenderingContext2D.prototype[method];
    CanvasRenderingContext2D.prototype[method]=function(...args){
     if(this.canvas.id==='weather'){
      if(kind==='clouds'){
       const source=args[0];if(source.width===512&&source.height===320)calls.clouds.push(args.slice(1));
       if(source.width===1024&&source.height===768)calls.fullFrameCopies++;
      }else calls[kind].push(args.slice(0,2));
     }return native.apply(this,args);
    };
   }
  });
  await page.addScriptTag({content:fs.readFileSync('work/weather-scene.js','utf8')});
  const result=await page.evaluate(()=>{
   const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),scene=createWeatherScene(canvas,false);
   const baseline={timeline:false,phase:'day',condition:'rain',sunAltitude:60,sunProgress:.4,moonVisible:false,cloudCover:.6,wind:8,intensity:.7,rainAmount:.5,snowAmount:.5,fogAmount:.2,stormAmount:0,hailAmount:0,overcastAmount:.3};
   const pixels=()=>ctx.getImageData(0,0,1024,768).data;
   const reset=()=>{calls={rain:[],snow:[],clouds:[],fullFrameCopies:0};};
   const render=next=>{reset();scene.setState(next);return{pixels:pixels(),calls:structuredClone(calls)};};
   const diff=(a,b)=>{let changed=0;for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(a[i+c]-b[i+c]);if(d>5)changed++;}return changed;};
   const moved=(a,b)=>a.reduce((n,p,i)=>n+(b[i]&&(Math.abs(p[0]-b[i][0])>.01||Math.abs(p[1]-b[i][1])>.01)?1:0),0);
   const start=render(baseline),sameAmounts=render({condition:'snow'});
   const semanticChange=diff(start.pixels,sameAmounts.pixels);
   now+=100;const running=render({});
   const overlapping={rain:start.calls.rain.length,snow:start.calls.snow.length,rainMoved:moved(sameAmounts.calls.rain,running.calls.rain),snowMoved:moved(sameAmounts.calls.snow,running.calls.snow)};
   const rainOnly=render({snowAmount:0}),snowOnly=render({snowAmount:.5,rainAmount:0});
   const layerDifferences={withoutSnow:diff(running.pixels,rainOnly.pixels),withoutRain:diff(running.pixels,snowOnly.pixels)};
   const slow=render({rainAmount:.5,snowAmount:.5,wind:8}),fast=render({wind:55});
   const instantaneousWindChange={rainPositions:moved(slow.calls.rain,fast.calls.rain),cloudPositions:moved(slow.calls.clouds,fast.calls.clouds)};
   now+=200;const windMotion=render({});
   const resumedWind={rainMoved:moved(fast.calls.rain,windMotion.calls.rain),cloudMoved:moved(fast.calls.clouds,windMotion.calls.clouds)};
   const sky={...baseline,phase:'night',timeline:true,sunAltitude:-30,moonAltitude:45,moonVisible:true,moonPhase:.5,rainAmount:0,snowAmount:0,fogAmount:0,overcastAmount:1,cloudCover:.1};
   const cloudy=render({...sky,timeline:false});
   const celestial={moonVisibility:clockLightSource({...sky,source:'moon'},1024,768).visibility,sunVisibility:clockLightSource({...sky,phase:'day',sunAltitude:60,source:'sun'},1024,768).visibility,visibleStarOrMoonDiscs:cloudy.calls.snow.length};
   const legacy=clockWeatherAmounts({condition:'storm',hail:true,cloudCover:.8,intensity:.6});
   const center=cloudy.pixels.slice((350*1024+512)*4,(350*1024+512)*4+3);
   return {semanticChange,overlapping,layerDifferences,instantaneousWindChange,resumedWind,celestial,legacy,center:Array.from(center),textureDimensions:[512,320],cloudImages:start.calls.clouds.length,fullFrameCopies:start.calls.fullFrameCopies+running.calls.fullFrameCopies+fast.calls.fullFrameCopies,frames:frames.size};
  });
  assert.equal(result.semanticChange,0,'semantic weather switch changes pixels despite identical continuous weights');
  assert.ok(result.overlapping.rain>100&&result.overlapping.snow>100,'rain and snow are not painted together');
  assert.ok(result.overlapping.rainMoved>100&&result.overlapping.snowMoved>100,'old or new precipitation is frozen');
  assert.ok(result.layerDifferences.withoutSnow>500&&result.layerDifferences.withoutRain>500,'weather weights do not independently control visible overlays');
  assert.deepEqual(result.instantaneousWindChange,{rainPositions:0,cloudPositions:0},'changing wind teleports particles or clouds');
  assert.ok(result.resumedWind.rainMoved>100&&result.resumedWind.cloudMoved>5,'new wind is not integrated into continued motion');
  assert.ok(result.celestial.moonVisibility<.005&&result.celestial.sunVisibility<.03);assert.equal(result.celestial.visibleStarOrMoonDiscs,0,'overcast sky shows stars or a bright moon');
  assert.ok(result.legacy.rain===1&&result.legacy.storm===1&&result.legacy.hail===1,'legacy condition-only states no longer work');
  assert.ok(result.cloudImages>10);assert.equal(result.fullFrameCopies,0,'renderer still crossfades full-scene screenshots');assert.equal(result.frames,1);assert.deepEqual(errors,[]);
  fs.writeFileSync('work/weather-overlays-results.json',JSON.stringify(result,null,2));await page.screenshot({path:'work/qa-overlay-overcast-night.png'});console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
