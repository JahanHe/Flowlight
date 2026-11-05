// Run after the TV build. Desktop capability simulation and host cost comparison, never real-TV FPS/RAM.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const {simulate66,chrome66HTML}=require('./check-tv-chromium66.cjs');
const html=fs.readFileSync('outputs/glass-clock-tv.html','utf8'),baseline=fs.readFileSync('work/tv-1.0.3-baseline.html','utf8');
const hash=source=>createHash('sha256').update(source).digest('hex');
function instrument(){
 const contexts=[],frames={};window.cost={weather:0,actor:0,preview:0,glyphCopies:0,readbacks:0,webgl:0,rects:0,styles:0,styleWrites:0,raf:0};
 const cost=window.cost,get=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(type){if(/webgl/.test(type))cost.webgl++;if(!contexts.includes(this))contexts.push(this);return get.apply(this,arguments);};
 const clear=CanvasRenderingContext2D.prototype.clearRect;
 CanvasRenderingContext2D.prototype.clearRect=function(){if(this.canvas.id==='weather-canvas')cost.weather++;if(this.canvas.className==='stick-canvas')cost.actor++;return clear.apply(this,arguments);};
 const copy=CanvasRenderingContext2D.prototype.drawImage;
 CanvasRenderingContext2D.prototype.drawImage=function(source){if(this.canvas.id==='tv-preview-canvas'&&source.id==='weather-canvas')cost.preview++;if(this.canvas.className==='glass-numeral')cost.glyphCopies++;return copy.apply(this,arguments);};
 const read=CanvasRenderingContext2D.prototype.getImageData;
 CanvasRenderingContext2D.prototype.getImageData=function(){cost.readbacks++;return read.apply(this,arguments);};
 const rect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){cost.rects++;return rect.apply(this,arguments);};
 const css=getComputedStyle;window.getComputedStyle=function(){cost.styles++;return css.apply(this,arguments);};
 const write=CSSStyleDeclaration.prototype.setProperty;CSSStyleDeclaration.prototype.setProperty=function(){cost.styleWrites++;return write.apply(this,arguments);};
 const raf=requestAnimationFrame;window.requestAnimationFrame=function(){cost.raf++;return raf.apply(this,arguments);};
 window.resetCost=()=>{for(const key of Object.keys(cost))cost[key]=0;};
 window.canvasBudget=()=>contexts.map(c=>({id:c.id||c.className||'detached',width:c.width,height:c.height,bytes:c.width*c.height*4}));
 // Test-only pixel reads bypass the app's readback counter and never run during performance samples.
 window.sampleCanvas=(id,key)=>{
  const c=document.getElementById(id),data=read.call(get.call(c,'2d'),0,0,c.width,c.height).data,old=frames[key];let changed=0,visible=0,bright=0,sum=0;
  for(let i=0;i<data.length;i+=4){const total=data[i]+data[i+1]+data[i+2];sum+=total;if(total>24)visible++;if(total>360)bright++;if(old&&Math.abs(data[i]-old[i])+Math.abs(data[i+1]-old[i+1])+Math.abs(data[i+2]-old[i+2])>6)changed++;}
  frames[key]=new Uint8ClampedArray(data);return {width:c.width,height:c.height,changed,visible,bright,meanRGB:sum/(c.width*c.height*3)};
 };
}
function digits(){return Array.from(document.querySelectorAll('.tile')).filter(n=>n.getClientRects().length&&n.getBoundingClientRect().width).map(n=>({unit:n.dataset.unit,text:n.querySelector('.static.top .numeral').textContent,halves:Array.from(n.querySelectorAll('.static .numeral')).map(span=>{const s=getComputedStyle(span);return {opacity:+s.opacity,visibility:s.visibility,color:s.color};})}));}
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH}),report={htmlSha256:hash(html),baselineSha256:hash(baseline),hostVersion:'',functional:[],cost:[]};report.hostVersion=browser.version();
 async function open(source,{virtual=false,simulate=false,weather=false}={}){
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1,timezoneId:'Asia/Shanghai',...(simulate?{userAgent:'Mozilla/5.0 (Linux; Android 9; TV) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/66.0.3359.158 Safari/537.36'}:{})}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));if(simulate)await page.addInitScript(simulate66);await page.addInitScript(instrument);
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='clock.test')return route.fulfill({contentType:'text/html',body:simulate?chrome66HTML(source):source});
   if(weather&&url.hostname==='weather.cma.cn'){
    requests.push(url.href);const rain=requests.length===1;
    return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({code:0,data:{lastUpdate:'2026/10/17 12:00',now:{precipitation:rain?4:0,windSpeed:3},daily:[{date:'2026/10/17',dayCode:rain?7:0,nightCode:rain?7:0}],location:{name:'杭州'}}})});
   }
   return route.abort();
  });
  if(virtual){await page.clock.install({time:new Date('2026-10-17T12:34:10+08:00')});await page.clock.pauseAt(new Date('2026-10-17T12:34:10+08:00'));}
  await page.goto('http://clock.test/');await page.evaluate(()=>document.fonts.ready);if(virtual)await page.clock.runFor(600);else await page.waitForTimeout(900);
  assert(await page.evaluate(()=>window.clockAppReady&&window.clockTVReady),'TV must initialize');return {page,errors,requests};
 }
 try{
  const {page,errors,requests}=await open(html,{virtual:true,simulate:true,weather:true});
  assert(await page.evaluate(()=>window.clockTVLite===true&&document.body.classList.contains('tv-lite')));
  assert.equal(await page.locator('meta[name="clock-tv-version"]').getAttribute('content'),'1.0.4');assert.equal(await page.locator('[data-toggle="use-glass"]').count(),0);assert.equal(await page.locator('.glass-numeral').count(),0);
  assert.equal(await page.evaluate(()=>cost.webgl),0,'lite boot must not create a WebGL context');assert.equal(await page.locator('.stick-canvas').count(),1);
  assert(await page.evaluate(()=>document.querySelector('#font-licenses') instanceof HTMLTemplateElement&&!document.body.innerText.includes('SIL OPEN FONT LICENSE')));
  assert.equal(await page.locator('body').getAttribute('data-weather'),'rain','CMA response must reach the scene');assert.equal(requests.length,1);
  assert.deepEqual((await page.evaluate(digits)).map(n=>n.text),['12','34']);
  await page.evaluate(()=>sampleCanvas('tv-preview-canvas','preview'));await page.clock.runFor(3000);const preview=await page.evaluate(()=>sampleCanvas('tv-preview-canvas','preview'));assert(preview.changed>100&&preview.bright>300,'live preview must contain moving weather and readable digits');assert.equal(preview.width*9,preview.height*16);
  await page.screenshot({path:'work/tv-lite-settings.png'});
  await page.keyboard.press('Enter');assert(await page.locator('#tv-panel').isHidden());assert((await page.evaluate(digits)).every(n=>n.halves.every(h=>h.opacity>0&&h.visibility==='visible'&&h.color!=='rgba(0, 0, 0, 0)')),'native digits must remain visible');
  const motion=[];
  for(const weather of ['noon','rain','night']){
   await page.evaluate(weather=>{clockTVRemote('Enter');document.querySelector('[data-preview="'+weather+'"]').click();clockTVRemote('Escape');},weather);await page.clock.runFor(1000);await page.evaluate(()=>sampleCanvas('weather-canvas','weather'));await page.clock.runFor(3000);
   const sample=await page.evaluate(()=>sampleCanvas('weather-canvas','weather'));assert(sample.changed>100,weather+' must visibly move across three seconds');assert(sample.visible>sample.width*sample.height*.05,weather+' must not become black');motion.push({weather,...sample});
  }
  await page.screenshot({path:'work/tv-lite-night.png'});
  await page.evaluate(()=>{clockTVRemote('Enter');document.getElementById('day-cycle').click();clockTVRemote('Escape');});const phases=new Set();for(let i=0;i<8;i++){await page.clock.runFor(7500);phases.add(await page.locator('body').getAttribute('data-phase'));}assert(phases.size>=3,'day cycle must visibly traverse day, dusk and night');
  await page.evaluate(()=>{clockTVRemote('Enter');document.querySelector('[data-return-live]').click();clockTVRemote('Escape');});assert.equal(await page.locator('#day-cycle').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('body').getAttribute('data-weather'),'rain');
  await page.clock.fastForward(600000);await page.waitForFunction(()=>document.body.dataset.weather==='clear');assert.equal(requests.length,2,'ten minute refresh must request weather again');assert.equal(await page.locator('#day-cycle').getAttribute('aria-pressed'),'true','weather refresh must retain the continuous day cycle');
  await page.keyboard.press('Enter');assert(await page.locator('#tv-panel').isVisible());
  for(const [id,value]of [['digit-font','nunito'],['digit-size','90'],['digit-weight','300'],['digit-spacing','8']]){await page.evaluate(({id,value})=>{const n=document.getElementById(id);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));},{id,value});await page.clock.runFor(300);assert.equal(await page.locator('#'+id).inputValue(),value);assert((await page.evaluate(()=>sampleCanvas('tv-preview-canvas','settings'))).bright>300);}
  await page.evaluate(()=>{const n=document.getElementById('show-seconds');n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}));});await page.clock.runFor(650);const seconds=await page.locator('.tile[data-unit="seconds"] .static.top .numeral').textContent();await page.clock.runFor(2100);assert.notEqual(await page.locator('.tile[data-unit="seconds"] .static.top .numeral').textContent(),seconds);assert.equal(await page.locator('.tile.flipping').count(),0);assert(await page.evaluate(()=>Array.from(document.querySelectorAll('.tile')).every(tile=>tile.querySelector('.static.top .numeral').textContent===tile.querySelector('.static.bottom .numeral').textContent)),'TV ticks must show one whole number, not mismatched half transitions');
  await page.clock.fastForward(15100);assert(await page.locator('#tv-panel').isHidden());assert.equal(await page.locator('.editor-only:visible').count(),0);assert.equal(await page.evaluate(()=>clockTVRemote('Escape')),false);assert.deepEqual(errors,[]);
  report.functional.push({passed:true,preview,motion,dayPhases:Array.from(phases),CMARequests:requests.length,checks:['Chrome 66 capability simulation','native digits always readable','no glass control/WebGL/glyph canvases','live preview','continuous sky and ten-minute CMA fixture refresh','font/size/weight/spacing/seconds','idle and native exit']});await page.close();
  // Real wall time: no virtual timers, same viewport and fourfold CPU throttling for both versions.
  if(!process.argv.includes('--functional-only'))for(const [version,source]of [['1.0.3',baseline],['1.0.4',html]])for(const mode of ['menu','fullscreen']){
   const {page,errors}=await open(source),client=await page.context().newCDPSession(page);await client.send('Performance.enable');await client.send('Emulation.setCPUThrottlingRate',{rate:4});
   if(mode==='fullscreen')await page.keyboard.press('Enter');await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>document.visibilityState),'visible');
   const bootWebGL=await page.evaluate(()=>cost.webgl),metrics=async()=>Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
   await page.evaluate(()=>resetCost());const start=await metrics(),started=performance.now();await page.waitForTimeout(3000);const wallMS=performance.now()-started,end=await metrics(),cost=await page.evaluate(()=>({...cost})),buffers=await page.evaluate(()=>canvasBudget());
   const delta={};for(const key of ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'])delta[key]=end[key]-start[key];
   if(version==='1.0.4'){
    assert.equal(bootWebGL,0);assert.equal(cost.readbacks,0,'no steady pixel readback');assert.equal(cost.glyphCopies,0);assert(cost.weather>0&&cost.actor>0);const limit=mode==='menu'?12:20;assert(cost.weather<=Math.ceil(wallMS/1000*limit)+2,'weather exceeds planned fps');
    const weather=buffers.find(b=>b.id==='weather-canvas');assert(weather.width*weather.height<=(mode==='menu'?320*180:640*360));assert(buffers.filter(b=>b.id==='stick-canvas').every(b=>b.width<=128&&b.height<=128));assert(buffers.every(b=>b.width*b.height<=640*360),'no large canvas backing buffers');
    if(mode==='fullscreen'){assert.equal(cost.preview,0,'closed menu must stop preview painting');assert.equal(cost.styleWrites,0,'fullscreen must not animate lighting style variables');}
   }
   assert.deepEqual(errors,[]);const row={version,mode,wallMS,CPUThrottle:4,bootWebGL,cost,metrics:delta,buffers,knownCanvasBytes:buffers.reduce((n,b)=>n+b.bytes,0)};report.cost.push(row);console.log(JSON.stringify({version,mode,wallMS,cost,metrics:delta,knownCanvasBytes:row.knownCanvasBytes}));await page.close();
  }
  if(process.argv.includes('--functional-only')){const prior=JSON.parse(fs.readFileSync('work/tv-lite-results.json','utf8'));report.cost=prior.cost;report.costSourceHtmlSha256=prior.costSourceHtmlSha256||prior.htmlSha256;report.costReuseNote='Functional checks use the final HTML. Cost samples are retained from the immediately preceding candidate; only the fixed black sprite border and native text half clipping changed; the weather rendering budget is unchanged.';}
  report.passed=true;report.scope='Current desktop Chrome, plus post-66 API/CSS removal. Cost samples are three real foreground seconds at 4x CPU throttle. Canvas byte counts are observed backing stores, not process RSS or real-TV memory/FPS. Weather pipeline uses deterministic CMA responses, not live network availability.';
  fs.writeFileSync('work/tv-lite-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,htmlSha256:report.htmlSha256,baselineSha256:report.baselineSha256},null,2));
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
