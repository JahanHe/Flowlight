// Run: node work/check-daylight-phases.cjs — deterministic, no browser or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const sceneSource=fs.readFileSync(process.env.CLOCK_SCENE||'work/weather-scene.js','utf8');
const sandbox=vm.createContext({});
vm.runInContext(fs.readFileSync('work/solar-position.js','utf8')+sceneSource,sandbox);
const {clockSkyAt,clockIdealSky,clockDaylight,clockLightSource}=vm.runInContext('({clockSkyAt,clockIdealSky,clockDaylight,clockLightSource})',sandbox);
const rgb=value=>typeof value==='string'?value.split(',').map(Number):Array.from(value);
const distance=(a,b)=>Math.hypot(...rgb(a).map((n,i)=>n-rgb(b)[i]));
const warmth=value=>{const c=rgb(value);return c[0]-c[2];};
const start=Date.UTC(2026,9,18,16);
const realSky=minute=>clockSkyAt(new Date(start+minute*60000),30.26,120.13,480);
const measure=state=>({state,day:clockDaylight(state),light:clockLightSource({...state,motionTime:0},1280,720)});
const periods=[['dawn',6.5],['morning',8],['noon',12],['afternoon',15],['sunset',17],['twilight',18],['night',20]];
const samples=Object.fromEntries(periods.map(([name,hour])=>[name,measure(realSky(hour*60))]));
const colorKeys=['rgb','halo','rim','skyTop','skyBottom','ambientRgb'];
for(const [name,{day,light}] of Object.entries(samples)){
 for(const key of colorKeys){const color=rgb(day[key]);assert.equal(color.length,3,`${name}.${key}`);assert(color.every(n=>Number.isFinite(n)&&n>=0&&n<=255),`${name}.${key} invalid`);}
 assert(Object.values(light).filter(value=>typeof value==='number').every(Number.isFinite),`${name} light contains invalid geometry`);
 for(const [key,min,max] of [['diskScale',.95,1.2],['haloScale',.7,1.5],['diskFlatten',.9,1.01],['twilight',0,1],['afterglow',0,1]])assert(Number.isFinite(day[key])&&day[key]>=min&&day[key]<=max,`${name}.${key} must stay physically restrained: ${day[key]}`);
}
const noon=rgb(samples.noon.light.rgb);
assert(Math.max(...noon)-Math.min(...noon)<=16,`high daytime light must remain near white, got ${noon}`);
assert(warmth(samples.dawn.light.rgb)>warmth(noon)+35,'low dawn sunlight must be warmer than noon');
assert(warmth(samples.sunset.light.rgb)>warmth(noon)+45,'sunset sunlight must be warmer than noon');
assert(distance(samples.morning.light.rgb,samples.noon.light.rgb)>=8,'morning and noon glass lighting must be distinguishable');
assert(distance(samples.afternoon.light.rgb,samples.noon.light.rgb)>=8,'afternoon and noon glass lighting must be distinguishable');
assert(distance(samples.morning.day.ambientRgb,samples.afternoon.day.ambientRgb)>0,'morning and afternoon ambient reflection must differ');
assert(samples.afternoon.light.x-samples.morning.light.x>1280*.3,'morning and afternoon light must strike opposite sides of the digits');
assert(warmth(samples.night.light.rgb)<-25,'night light should retain a cool moonlit tint');
assert(samples.noon.light.strength>samples.night.light.strength*1.4,'daylight must remain stronger than moonlight');
assert(samples.noon.light.strength>samples.dawn.light.strength,'high sun must be stronger than low sunrise');
assert(samples.dawn.day.diskScale>samples.noon.day.diskScale+.02,'near-horizon solar appearance should be modestly broader');
assert(samples.sunset.day.haloScale>samples.noon.day.haloScale+.1,'low sun must have a more diffuse halo');
assert(samples.sunset.day.diskFlatten<samples.noon.day.diskFlatten,'low sun should flatten subtly near the horizon');
assert(distance(samples.morning.day.skyTop,samples.noon.day.skyTop)>8,'morning and noon sky must differ');
assert(distance(samples.dawn.day.skyBottom,samples.sunset.day.skyBottom)>8,'morning and evening horizons must not be identical');
const clear=measure({...realSky(390),condition:'clear',cloudCover:0});
const overcast=measure({...realSky(390),condition:'overcast',cloudCover:1});
assert(overcast.light.strength<clear.light.strength*.35,'overcast must suppress direct sunlight');
assert(overcast.light.visibility<clear.light.visibility*.1,'overcast must veil the solar disk');
assert(warmth(overcast.day.rgb)<warmth(clear.day.rgb)*.35,'overcast cannot retain clear-sky orange glass lighting');

// A visibility flag flips at the horizon; brightness and opacity must still start at zero.
const moonEdge=altitude=>clockLightSource({timeline:true,phase:'night',sunAltitude:-35,sunProgress:1,moonAltitude:altitude,moonProgress:.5,moonPhase:.5,moonVisible:altitude>0,cloudCover:0,motionTime:0},1280,720);
const moonBelow=moonEdge(-.0001),moonAbove=moonEdge(.0001);
assert(Math.abs(moonAbove.strength-moonBelow.strength)<.001,'moonrise must not switch full moonlight on abruptly');
assert(Math.abs(moonAbove.visibility-moonBelow.visibility)<.001,'moonrise opacity must fade from the actual horizon');

// A ten-minute weather update blends cloud coverage over the same solar phase.
let previousWeather=null,maxWeatherColorStep=0;
for(let step=0;step<=100;step++){
 const current=measure({...realSky(390),cloudCover:step/100});
 if(previousWeather)maxWeatherColorStep=Math.max(maxWeatherColorStep,...rgb(current.light.rgb).map((n,i)=>Math.abs(n-rgb(previousWeather.light.rgb)[i])));
 previousWeather=current;
}
assert(maxWeatherColorStep<=3,'changing weather must not switch the daylight palette abruptly');

// Minute sampling catches discontinuities during normal playback and the 60-second day preview.
const continuity=[];
for(const [name,stateAt] of [['Hangzhou',realSky],['Longyearbyen-polar-day',minute=>clockSkyAt(new Date(Date.UTC(2026,5,20,22)+minute*60000),78.22,15.65,120)],['ideal',minute=>clockIdealSky(minute/1440,minute/24)],['polar-day',minute=>clockIdealSky(minute/1440,minute/24,'day')],['polar-night',minute=>clockIdealSky(minute/1440,minute/24,'night')]]){
 let before=null,maxColorStep=0,maxStrengthStep=0,maxSolarSizeStep=0;
 for(let minute=0;minute<=1440;minute++){
  const current=measure(stateAt(minute));
  if(name==='Longyearbyen-polar-day')assert(current.state.sunAltitude>0,'actual Arctic midsummer sun must stay above the horizon');
  if(before){
   for(const key of colorKeys){const a=rgb(before.day[key]),b=rgb(current.day[key]);maxColorStep=Math.max(maxColorStep,...a.map((n,i)=>Math.abs(n-b[i])));}
   maxColorStep=Math.max(maxColorStep,...rgb(before.light.rgb).map((n,i)=>Math.abs(n-rgb(current.light.rgb)[i])));
   maxStrengthStep=Math.max(maxStrengthStep,Math.abs(current.light.strength-before.light.strength));
   for(const key of ['diskScale','haloScale','diskFlatten'])maxSolarSizeStep=Math.max(maxSolarSizeStep,Math.abs(current.day[key]-before.day[key]));
  }
  before=current;
 }
 assert(maxColorStep<=16,`${name} color jumps ${maxColorStep}/255 within one simulated minute`);
 assert(maxStrengthStep<.06,`${name} light intensity jumps ${maxStrengthStep} within one simulated minute`);
 assert(maxSolarSizeStep<.03,`${name} solar size jumps ${maxSolarSizeStep} within one simulated minute`);
 continuity.push({name,samples:1441,maxColorStep,maxStrengthStep,maxSolarSizeStep});
}
const report={pass:true,scope:'Pure Node shared daylight palette/light-source behavior; not a visual or device-performance test',sourceSHA256:crypto.createHash('sha256').update(sceneSource).digest('hex'),samples:Object.fromEntries(Object.entries(samples).map(([name,row])=>[name,{altitude:row.state.sunAltitude,progress:row.state.sunProgress,day:row.day,light:row.light}])),continuity,moonHorizon:{below:moonBelow,above:moonAbove},maxWeatherColorStep};
fs.writeFileSync('work/daylight-phases-results.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS: seven daylight periods, neutral noon, shared glass tint, overcast attenuation, five continuous 24-hour timelines, including actual Arctic midsummer.');
console.log(JSON.stringify(continuity));
