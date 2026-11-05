// Repeatable desktop Chromium comparison. Real timers/performance; no phone memory/FPS claim.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const sha=x=>createHash('sha256').update(x).digest('hex');
const cloudMode=process.argv.includes('--clouds');
const mode=process.argv.includes('--baseline')?'before':'after';
const source=process.env.CLOCK_HTML||(mode==='before'?(cloudMode?'work/cloud-baseline-1.3.4/glass-clock.html':'work/sky-detail-baseline-1.3.2/glass-clock.html'):'outputs/glass-clock.html');
const html=fs.readFileSync(source,'utf8');
function instrument(){
 window.__lp={counts:{},canvases:[],frameDraws:[],lastWeather:0};const s=__lp;
 const inc=k=>s.counts[k]=(s.counts[k]||0)+1;
 const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type){const result=get.apply(this,arguments);if(result&&!s.canvases.some(c=>c.canvas===this))s.canvases.push({canvas:this,type});return result;};
 for(const name of ['clearRect','drawImage','arc','fillRect','getImageData','putImageData','createRadialGradient','fill','stroke']){const fn=CanvasRenderingContext2D.prototype[name];CanvasRenderingContext2D.prototype[name]=function(){inc('2d.'+name);if(this.canvas.id==='weather-canvas'){inc('weather.'+name);if(name==='clearRect'){s.lastWeather=performance.now();s.frameDraws=[];}if(name==='drawImage'&&s.frameDraws.length<200){const image=arguments[0];s.frameDraws.push({texture:image.clockTexture||null,transform:Array.from(this.getTransform().toFloat64Array()),kind:image.tagName||image.constructor.name,w:image.naturalWidth||image.width,h:image.naturalHeight||image.height,args:Array.from(arguments).slice(1),alpha:this.globalAlpha});}}if(this.canvas.id==='sky-detail-canvas')inc('detail.'+name);if(this.canvas.id==='weather-foreground')inc('foreground.'+name);if(this.canvas.className==='glass-numeral')inc('glass.'+name);if(this.canvas.className==='stick-canvas')inc('actor.'+name);return fn.apply(this,arguments);};}
 for(const proto of [window.WebGLRenderingContext&&WebGLRenderingContext.prototype,window.WebGL2RenderingContext&&WebGL2RenderingContext.prototype].filter(Boolean))for(const name of ['drawArrays','drawElements','readPixels','texImage2D']){const fn=proto[name];proto[name]=function(){inc('gl.'+name);return fn.apply(this,arguments);};}
 window.lpSnapshot=()=>({now:performance.now(),counts:{...s.counts},quality:{...clockQuality,reportFrame:undefined,setMode:undefined},motion:clockMotion.time,weatherRevision:document.querySelector('#weather-canvas').clockPaintVersion,canvases:s.canvases.map(({canvas:c,type})=>({id:c.id,className:c.className,width:c.width,height:c.height,pixels:c.width*c.height,connected:c.isConnected,type})),frameDraws:s.frameDraws,clock:[...document.querySelectorAll('.tile')].filter(n=>n.getBoundingClientRect().width).map(n=>n.querySelector('.static.top .numeral').textContent)});
}
function metrics(m){return Object.fromEntries(m.metrics.map(x=>[x.name,x.value]));}
function delta(a,b){const out={};for(const k of ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'])out[k]=b[k]-a[k];return out;}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});const results=[];
 try{for(const profile of ['smooth','fine']){
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:2,timezoneId:'Asia/Shanghai'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(instrument);
  await page.addInitScript(profile=>{for(const key of ['requestFullscreen','webkitRequestFullscreen'])Object.defineProperty(Element.prototype,key,{value:undefined,configurable:true});localStorage.setItem('floating-light-render-quality',profile);localStorage.setItem('floating-light-clock',JSON.stringify({glass:true,seconds:false,companion:true,size:100,weight:400,spacing:-5,font:'inter',effectsVersion:1,immersive:true,motionSpeed:1}));},profile);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='lowpower.test'?r.fulfill({contentType:'text/html',body:html}):r.abort());
  await page.clock.setFixedTime(new Date('2026-10-17T21:10:00+08:00'));await page.goto('http://lowpower.test/?ramMB=8192&availableMB=4096&cores=8');await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>window.clockAppReady);
  await page.evaluate(cloudMode=>{document.querySelector('[data-preview="'+(cloudMode?'noon':'night')+'"]').click();document.getElementById('fullscreen').click();},cloudMode);
  await page.waitForTimeout(3000);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');const first=await page.evaluate(()=>lpSnapshot());await page.screenshot({path:`work/${cloudMode?'cloud-perf':'sky-detail'}-${mode}-${profile}-before.png`});
  await page.evaluate(()=>__lp.counts={});const m0=metrics(await cdp.send('Performance.getMetrics')),t0=await page.evaluate(()=>performance.now());
  await page.waitForTimeout(6000);
  const m1=metrics(await cdp.send('Performance.getMetrics')),last=await page.evaluate(()=>lpSnapshot());await page.screenshot({path:`work/${cloudMode?'cloud-perf':'sky-detail'}-${mode}-${profile}-after.png`});
  const elapsedMS=last.now-t0,actualPixels=last.canvases.reduce((a,c)=>a+c.pixels,0),counts=last.counts;
  assert.deepEqual(errors,[]);assert.deepEqual(last.clock,first.clock,'sky motion must not change frozen wall clock');assert(last.motion>first.motion,'sky virtual time advances');assert((counts['weather.clearRect']||0)>50,'weather continues painting');
  const row={profile,elapsedMS,metrics:delta(m0,m1),JSHeapUsedSize:m1.JSHeapUsedSize,JSHeapTotalSize:m1.JSHeapTotalSize,canvasTotalPixels:actualPixels,canvasRawRGBABytes:actualPixels*4,weatherFPS:counts['weather.clearRect']/(elapsedMS/1000),counts,first,last,errors};results.push(row);
  console.log(JSON.stringify({mode,profile,elapsedMS,metrics:row.metrics,JSHeapUsedSize:row.JSHeapUsedSize,canvasTotalPixels:actualPixels,weatherFPS:row.weatherFPS,level:[first.quality.level,last.quality.level],counts}));await page.close();
 }
 const frozen=JSON.parse(fs.readFileSync('work/tv-frozen-1.0.4.json'));for(const [file,expected]of Object.entries(frozen))assert.equal(sha(fs.readFileSync('outputs/'+file)),expected,'TV changed '+file);
 const report={pass:true,mode,htmlSha256:sha(html),source,browser:browser.version(),viewport:{width:1280,height:720,dpr:2},warmupSeconds:3,sampleSeconds:6,realTimers:true,scope:'Desktop Chrome headless with SwiftShader allowed, no virtual animation clock; wall Date fixed only. CDP CPU and JS heap are not whole-app RSS or physical phone FPS/memory. Canvas raw RGBA totals are allocation indicators, not total GPU/browser memory. Both runs use the same instrumentation for weather draw transforms; overhead applies to both.',results,TVUnchanged:true};
 fs.writeFileSync(`work/${cloudMode?'cloud-perf':'sky-detail'}-${mode}-results.json`,JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
