// Run: node work/check-daylight-color.cjs (serve outputs on localhost:8765).
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {chromium}=require('playwright');
const sandbox=vm.createContext({});
vm.runInContext(fs.readFileSync('work/solar-position.js','utf8')+fs.readFileSync('work/weather-scene.js','utf8'),sandbox);
const altitude=(iso,lat,lon)=>vm.runInContext(`clockSolarPosition(new Date('${iso}'),${lat},${lon}).altitude`,sandbox);
assert.ok(altitude('2026-03-20T12:00:00Z',0,0)>85,'equinox sun must be high at equatorial noon');
assert.ok(altitude('2026-03-20T00:00:00Z',0,0)<-85,'equatorial midnight must be dark');
assert.ok(altitude('2026-10-16T04:00:00Z',30.26,120.13)>45,'Hangzhou noon must not be treated as sunset');
assert.ok(altitude('2026-10-16T16:00:00Z',30.26,120.13)<-40,'longitude must be applied to Hangzhou night');
assert.ok(altitude('2026-06-21T04:00:00Z',30.26,120.13)>altitude('2026-12-21T04:00:00Z',30.26,120.13)+40,'seasonal solar height must change');
for(const sunAltitude of [45,60,85]){const rgb=sandbox.clockDaylight({sunAltitude,sunProgress:.5,cloudCover:0}).rgb.split(',').map(Number);assert.ok(Math.max(...rgb)-Math.min(...rgb)<=16,'high sun stays near neutral');}
assert.ok(sandbox.clockDaylight({sunAltitude:3,cloudCover:0}).environmentWarmth>sandbox.clockDaylight({sunAltitude:3,cloudCover:1}).environmentWarmth*5);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:8765/glass-clock.html');await page.locator('#weather-browse').click();
  const measurements={};
  for(const id of ['noon','sunrise','sunset','overcast','rain']){
   await page.locator(`.preview-option[data-preview="${id}"]`).click();
   measurements[id]=await page.evaluate(id=>{
    const canvas=document.querySelector('#weather-canvas'),ctx=canvas.getContext('2d');
    const progress=id==='sunrise'?.08:id==='sunset'?.92:.5;
    const source=clockLightSource({phase:id==='sunrise'?'sunrise':id==='sunset'?'sunset':'day',sunProgress:progress,sunAltitude:['sunrise','sunset'].includes(id)?3:60,cloudCover:0},canvas.width,canvas.height);
    const sx=source.x,sy=source.y;
    const pixel=(x,y)=>Array.from(ctx.getImageData(Math.round(x),Math.round(y),1,1).data).slice(0,3);
    return {light:getComputedStyle(document.querySelector('.tile')).getPropertyValue('--number-light'),sun:pixel(sx,sy),sky:pixel(canvas.width*.35,canvas.height*.3)};
   },id);
  }
  for(const id of ['noon','overcast','rain']){const rgb=measurements[id].light.match(/\d+/g).map(Number);assert.ok(Math.max(...rgb)-Math.min(...rgb)<=16,`${id} numeral lighting is tinted yellow`);}
  const noon=measurements.noon;
  assert.ok(Math.max(...noon.sun)-Math.min(...noon.sun)<=8,`noon sun must be neutral: ${noon.sun}`);
  assert.ok(noon.sky[2]>noon.sky[0]+10,`daylight sky must be blue, not orange: ${noon.sky}`);
  for(const id of ['sunrise','sunset']){const rgb=measurements[id].light.match(/\d+/g).map(Number);assert.ok(rgb[0]-rgb[2]>60,`${id} should retain low-sun warmth`);}
  assert.deepEqual(errors,[]);
  fs.writeFileSync('work/daylight-color-results.json',JSON.stringify(measurements,null,2)+'\n');
  console.log('PASS: solar latitude/longitude/seasons, neutral noon/rain/overcast digit light, white sun pixels, blue daytime sky, warm dawn/dusk.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
