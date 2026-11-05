// Coordinate evidence comes from actual Canvas draw calls, not a separate motion formula.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const current=fs.readFileSync('work/weather-scene.js','utf8');
const baseline=fs.existsSync('work/phone-motion-before.js')?fs.readFileSync('work/phone-motion-before.js','utf8'):null;
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
const quantile=(values,p)=>values.sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
async function sample(browser,source,name,level=1){
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.clock.install();await page.clock.pauseAt(new Date());
  await page.setContent('<style>html,body{margin:0;background:#000;width:100%;height:100%;overflow:hidden}canvas{position:fixed;width:100%;height:100%}p{position:fixed;width:100%;text-align:center;top:43%;margin:0;color:#e8edf5;font:600 66px system-ui;letter-spacing:-5px}small{display:block;font:14px system-ui;letter-spacing:2px;margin-top:10px;color:#bac6d7}</style><canvas id="weather-canvas"></canvas><p>12:34<small>10月17日 · 星期六</small></p>');
  await page.evaluate(level=>{
   Math.random=()=>.321;window.clockFullEffects=true;window.clockMotion={matches:false,addEventListener(){}};
   window.clockQuality=[{fps:30,weatherPixels:960*540,weatherDpr:1.25,detail:.75},{fps:60,weatherPixels:1600*900,weatherDpr:1.75,detail:1},{fps:60,weatherPixels:1920*1080,weatherDpr:2,detail:1.4}][level];
   window.stats={canvas:0,uploads:0};window.motion={stars:[],clouds:[]};window.previous=null;window.maxCloudStep=0;
   const create=document.createElement.bind(document);document.createElement=function(tag,...args){if(tag==='canvas')stats.canvas++;return create(tag,...args);};
   const proto=CanvasRenderingContext2D.prototype,clear=proto.clearRect,arc=proto.arc,draw=proto.drawImage,put=proto.putImageData;
   proto.clearRect=function(...args){if(this.canvas.id==='weather-canvas'){previous=motion;motion={stars:[],clouds:[]};}return clear.apply(this,args);};
   proto.arc=function(x,y,r,...args){if(this.canvas.id==='weather-canvas'&&r<2)motion.stars.push({x,y,r});return arc.call(this,x,y,r,...args);};
   proto.drawImage=function(image,x,y,w,h,...args){if(this.canvas.id==='weather-canvas'&&image.width>=320&&image.height===image.width*5/8){const cloud={x,y,w,h,alpha:this.globalAlpha};const prev=previous&&previous.clouds[motion.clouds.length];if(prev){const dx=cloud.x-prev.x;if(Math.abs(dx)<390)maxCloudStep=Math.max(maxCloudStep,Math.hypot(dx,cloud.y-prev.y));}motion.clouds.push(cloud);}return draw.call(this,image,x,y,w,h,...args);};
   proto.putImageData=function(...args){stats.uploads++;return put.apply(this,args);};
  },level);
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{window.scene=createWeatherScene(document.getElementById('weather-canvas'),clockMotion);window.common={timeline:true,idealCycle:false,dayProgress:.1,cloudCover:.12,intensity:0,condition:'clear',wind:4,moonPhase:.5,moonAltitude:35,moonProgress:.4};scene.setState({...common,phase:'night',sunAltitude:-30});});
  const result={name,level};
  for(const mode of ['night','day']){
   await page.evaluate(mode=>scene.setState({...common,phase:mode,sunAltitude:mode==='night'?-30:45}),mode);await page.clock.runFor(1000);await page.evaluate(()=>{maxCloudStep=0;});
   const captures=[];
   for(let i=0;i<3;i++){
    if(i)await page.clock.runFor(5000);
    captures.push(await page.evaluate(()=>({motion,stats:{...stats},size:[document.querySelector('canvas').width,document.querySelector('canvas').height],maxCloudStep})));
    if(level===1)await page.screenshot({path:`work/phone-visible-${name}-${mode}-${i*5}s.png`});
   }
   const [a,b,c]=captures;assert.deepEqual(a.stats,c.stats,'cached cloud textures must not regenerate during motion');assert(a.size[0]*a.size[1]<=await page.evaluate(()=>clockQuality.weatherPixels));
   if(mode==='night'){
    const points=a.motion.stars.filter(p=>p.r>.65&&p.x>30&&p.x<360&&p.y>50&&p.y<710&&Math.hypot(p.x-195,p.y-844*.19)>140).map(p=>{const q=b.motion.stars.find(q=>q.r===p.r),r=c.motion.stars.find(q=>q.r===p.r);return q&&r?{p,q,r,d5:Math.hypot(q.x-p.x,q.y-p.y),d10:Math.hypot(r.x-p.x,r.y-p.y)}:null;}).filter(Boolean);
    assert(points.length>20);
    result.stars={count:points.length,median5:median(points.map(p=>p.d5)),median10:median(points.map(p=>p.d10)),p10at5:quantile(points.map(p=>p.d5),.1),p90at5:quantile(points.map(p=>p.d5),.9),examples:points.slice(0,4)};
    if(name==='after'){
     assert(result.stars.median5>=3&&result.stars.median5<=10,JSON.stringify(result.stars));assert(result.stars.median10>=6&&result.stars.median10<=20);
     for(const {p,q,r} of points){const cross=(a,b)=>(a.x-195)*(b.y-844*.19)-(a.y-844*.19)*(b.x-195);assert(cross(p,q)>0&&cross(q,r)>0,'sky rotates in one direction');}
    }
   }else{
    const clouds=a.motion.clouds.map((p,i)=>{const q=b.motion.clouds[i],r=c.motion.clouds[i];return {index:i,dx5:q.x-p.x,dy5:q.y-p.y,d5:Math.hypot(q.x-p.x,q.y-p.y),d10:Math.hypot(r.x-p.x,r.y-p.y),widthChange5:q.w/p.w-1,heightChange5:q.h/p.h-1,alphaChange5:q.alpha/p.alpha-1,from:p,to5:q,to10:r};}).filter(p=>Math.abs(p.dx5)<390);
    result.clouds={count:clouds.length,median5:median(clouds.map(p=>p.d5)),median10:median(clouds.map(p=>p.d10)),maxFrameStep:c.maxCloudStep,samples:clouds};
    if(name==='after'){
     assert(clouds.some(p=>p.dx5<-4)&&clouds.some(p=>p.dx5>4),'layers drift in distinct directions');assert(result.clouds.median5>8&&result.clouds.median10>16);assert(clouds.filter(p=>Math.abs(p.widthChange5)>.02||Math.abs(p.heightChange5)>.02).length>=3,'several cloud silhouettes change visibly');assert(c.maxCloudStep<2,'no visible frame-to-frame jumps');
    }
   }
  }
  // Weather replacement keeps the accumulated trajectories, and ideal preview remains animated.
  await page.evaluate(()=>scene.setState({condition:'rain',cloudCover:.7,intensity:.6}));await page.clock.runFor(32);
  const beforeIdeal=await page.evaluate(()=>motion.clouds[0]);await page.evaluate(()=>scene.setState({idealCycle:true,dayProgress:.8}));await page.clock.runFor(32);const afterIdeal=await page.evaluate(()=>motion.clouds[0]);assert(Math.abs(afterIdeal.x-beforeIdeal.x)<2,'ideal mode does not reset cloud trajectory');
  assert.deepEqual(errors,[]);return result;
 }finally{await page.close();}
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});try{const results=[];if(baseline)results.push(await sample(browser,baseline,'before'));for(const tier of [0,1,2])results.push(await sample(browser,current,'after',tier));fs.writeFileSync('work/phone-visible-motion-results.json',JSON.stringify({scope:'Actual Canvas coordinates and screenshots at 390x844 CSS pixels; deterministic seed, virtual elapsed time, no phone hardware FPS claim.',results},null,2));console.log(JSON.stringify(results.map(({name,level,stars,clouds})=>({name,level,stars:{count:stars.count,median5:stars.median5,median10:stars.median10,p10at5:stars.p10at5,p90at5:stars.p90at5},clouds:{median5:clouds.median5,median10:clouds.median10,maxFrameStep:clouds.maxFrameStep}})),null,2));}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
