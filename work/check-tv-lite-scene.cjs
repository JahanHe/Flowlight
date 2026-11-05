const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH}),page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
 await page.clock.install();await page.clock.pauseAt(new Date());await page.setContent('<style>body{margin:0;background:black}#weather-canvas{position:fixed;inset:0;width:100%;height:100%}.stick-world{position:fixed;inset:0;pointer-events:none}.stick-canvas,.stick-hit{position:absolute;left:0;top:0}.stick-hit{pointer-events:auto;background:none;border:0}</style><canvas id="weather-canvas"></canvas>');
 await page.evaluate(()=>{
  window.created=[];window.cost={frames:0,actors:0,raf:0,reads:0,gpu:0};window.timers=new Set();
  const create=document.createElement.bind(document);document.createElement=function(name,...args){const node=create(name,...args);if(name==='canvas')created.push(node);return node;};
  const read=CanvasRenderingContext2D.prototype.getImageData;window.readPixels=canvas=>read.call(canvas.getContext('2d'),0,0,canvas.width,canvas.height).data;
  CanvasRenderingContext2D.prototype.getImageData=function(...args){cost.reads++;return read.apply(this,args);};
  const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.id==='weather-canvas')cost.frames++;if(this.canvas.className==='stick-canvas')cost.actors++;return clear.apply(this,args);};
  const context=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl'||type==='webgl2'){cost.gpu++;throw Error('GPU forbidden');}return context.call(this,type,...args);};
  const raf=requestAnimationFrame;window.requestAnimationFrame=function(cb){cost.raf++;return raf(cb);};
  const timeout=setTimeout,clearTimeoutOriginal=clearTimeout;window.setTimeout=function(fn,delay){let id=timeout(()=>{timers.delete(id);fn();},delay);timers.add(id);return id;};window.clearTimeout=function(id){timers.delete(id);clearTimeoutOriginal(id);};
  Math.random=()=>{throw Error('Random rendering forbidden');};
  window.snapshot=()=>{const canvas=document.getElementById('weather-canvas'),pixels=readPixels(canvas);return Array.from(pixels).filter((_,i)=>i%16===0);};
  window.budget=()=>{const canvases=[document.getElementById('weather-canvas'),...created];return{count:canvases.length,bytes:canvases.reduce((sum,c)=>sum+c.width*c.height*4,0),sizes:canvases.map(c=>[c.width,c.height]),timers:timers.size,cost:{...cost}};};
 });
 await page.addScriptTag({content:fs.readFileSync('work/tv-lite-scene.js','utf8')});
 await page.evaluate(()=>{window.motion={matches:false};window.scene=createWeatherScene(document.getElementById('weather-canvas'),motion,null);window.figure=createStickFigure();});
 const base=await page.evaluate(()=>budget()),reports=[];assert.equal(base.count,10);assert.equal(base.bytes,1237504);
 for(const condition of ['clear','cloudy','overcast','rain','snow','fog','storm','hail','night']){
  await page.evaluate(condition=>{const night=condition==='night';const state={condition:condition==='hail'?'storm':night?'clear':condition,phase:night?'night':'day',sunAltitude:night?-35:40,moonVisible:true,moonPhase:.5,cloudCover:condition==='clear'||night?.12:.8,hail:condition==='hail',intensity:.75,wind:18};scene.setState(state);figure.setState(state);},condition);
  await page.clock.runFor(100);const before=await page.evaluate(()=>snapshot()),cost=await page.evaluate(()=>({...window.cost}));await page.clock.runFor(3000);const after=await page.evaluate(()=>snapshot()),usage=await page.evaluate(()=>budget());
  const changed=before.reduce((sum,value,i)=>sum+(value!==after[i]),0);assert(changed>before.length*.003,condition+' visibly changes over three seconds');assert(usage.cost.frames-cost.frames<=60);assert.equal(usage.bytes,base.bytes);assert.equal(usage.count,base.count);assert.equal(usage.timers,2);reports.push({condition,changedFraction:changed/before.length,frames:usage.cost.frames-cost.frames});
 }
 await page.evaluate(()=>{motion.matches=true;scene.setState({condition:'clear',phase:'day',sunAltitude:40,cloudCover:.12,hail:false});});const reducedBefore=await page.evaluate(()=>snapshot());await page.clock.runFor(3000);const reducedAfter=await page.evaluate(()=>snapshot());assert.notDeepEqual(reducedBefore,reducedAfter,'reduced motion remains gently animated');
 await page.evaluate(()=>{document.body.classList.add('tv-settings-open');window.dispatchEvent(new Event('resize'));});const menu=await page.evaluate(()=>budget());await page.clock.runFor(3000);const menuEnd=await page.evaluate(()=>budget());assert(menuEnd.cost.frames-menu.cost.frames<=36);assert.equal(menu.bytes,546304);
 await page.evaluate(()=>{window.hiddenTest=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hiddenTest});document.dispatchEvent(new Event('visibilitychange'));});const hidden=await page.evaluate(()=>budget());await page.clock.runFor(3000);const hiddenEnd=await page.evaluate(()=>budget());assert.equal(hiddenEnd.cost.frames,hidden.cost.frames);assert.equal(hiddenEnd.cost.actors,hidden.cost.actors);assert.equal(hiddenEnd.timers,0);
 await page.evaluate(()=>{hiddenTest=false;document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(500);assert.equal(await page.evaluate(()=>timers.size),2);
 await page.evaluate(()=>{document.body.classList.remove('tv-settings-open');window.dispatchEvent(new Event('resize'));figure.setScale(1.8);figure.onFlip('minutes');});await page.clock.runFor(100);assert.equal(await page.locator('.stick-world').count(),1);const figureState=await page.locator('.stick-world').evaluate(e=>({...e.dataset}));assert(Number.isFinite(+figureState.x)&&Number.isFinite(+figureState.y));
 await page.setViewportSize({width:3840,height:2160});await page.clock.runFor(100);await page.screenshot({path:'work/tv-lite-scene-4k.png'});
 const border=await page.evaluate(()=>{const c=document.getElementById('weather-canvas'),p=readPixels(c),indexes=[];for(let x=0;x<c.width;x++)indexes.push(x,(c.height-1)*c.width+x);for(let y=0;y<c.height;y++)indexes.push(y*c.width,y*c.width+c.width-1);return indexes.every(i=>p[i*4]===0&&p[i*4+1]===0&&p[i*4+2]===0&&p[i*4+3]===255);});assert(border,'all four outer edges stay opaque black');
 const final=await page.evaluate(()=>budget());assert.equal(final.bytes,base.bytes);assert.equal(final.cost.raf,0);assert.equal(final.cost.gpu,0);assert.equal(final.cost.reads,0);assert.deepEqual(errors,[]);
 await page.evaluate(()=>{scene.destroy();figure.destroy();});assert.equal(await page.evaluate(()=>timers.size),0);assert.equal(await page.locator('.stick-world').count(),0);
 fs.writeFileSync('work/tv-lite-scene-results.json',JSON.stringify({base,menu,reports,final,scope:'Desktop Chromium with virtual time; checks animation and bounded buffers, not measured TV RAM or FPS.'},null,2));console.log(JSON.stringify({bytes:base.bytes,menuBytes:menu.bytes,canvasCount:base.count,reports,zeroRAF:final.cost.raf,zeroGPU:final.cost.gpu,zeroReadbacks:final.cost.reads},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
