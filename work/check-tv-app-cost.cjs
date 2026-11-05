// Read-only product audit. Variants are changed only in memory; times are host Chrome diagnostics, NOT real-TV FPS.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const original=fs.readFileSync(process.argv[2]||'outputs/glass-clock-tv.html','utf8');
function instrument(spec){
 window.cost={rects:0,clientRects:0,styles:0,styleWrites:0,ignoredStyleWrites:0,mutations:0,previewCopies:0,glyphCopies:0,weatherPaints:0,actorPaints:0,reads:0,properties:{}};
 const cost=window.cost;
 for(const [method,key]of [['getBoundingClientRect','rects'],['getClientRects','clientRects']]){const original=Element.prototype[method];Element.prototype[method]=function(){cost[key]++;return original.apply(this,arguments);};}
 const css=getComputedStyle;window.getComputedStyle=function(){cost.styles++;return css.apply(this,arguments);};
 const set=CSSStyleDeclaration.prototype.setProperty;CSSStyleDeclaration.prototype.setProperty=function(name,value,priority){
  cost.styleWrites++;cost.properties[name]=(cost.properties[name]||0)+1;
  if(spec.trimMetadata&&['--surface-light','--edge-light','--digit-x','--digit-y','--digit-blur'].includes(name)){cost.ignoredStyleWrites++;return;}
  return set.call(this,name,value,priority);
 };
 const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(){if(this.canvas.id==='weather-canvas')cost.weatherPaints++;if(this.canvas.className==='stick-canvas')cost.actorPaints++;return clear.apply(this,arguments);};
 const copy=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(){if(this.canvas.id==='tv-preview-canvas')cost.previewCopies++;if(this.canvas.className==='glass-numeral')cost.glyphCopies++;return copy.apply(this,arguments);};
 const read=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(){cost.reads++;return read.apply(this,arguments);};
 new MutationObserver(records=>{cost.mutations+=records.length;}).observe(document,{attributes:true,childList:true,characterData:true,subtree:true});
 window.resetCost=()=>{for(const key of Object.keys(cost))cost[key]=key==='properties'?{}:0;};
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CLOCK_CHROMIUM_PATH,headless:true}),results=[];
 try{
  for(const spec of [{name:'menu'},{name:'fullscreen',fullscreen:true},{name:'menu-no-preview',noPreview:true},{name:'menu-hidden-underlay',hideUnderlay:true},{name:'menu-fast-day',fastDay:true},{name:'menu-fast-day-trim-metadata',fastDay:true,trimMetadata:true}]){
   let html=original.replace(/<script>\s*window.clockTV=/,`<script>window.beforeClockBoot={tv:document.body.classList.contains('tv'),visibleOldControls:Array.from(document.querySelectorAll('.editor-only')).filter(n=>n.getClientRects().length).length};window.clockTV=`);
   if(spec.noPreview){assert(html.includes('function createClockTVPreview(canvas){'));html=html.replace('function createClockTVPreview(canvas){','function createClockTVPreview(canvas){return {start(){},stop(){}};');}
   if(spec.trimMetadata){assert(html.includes(',dayPreview){const hour='));html=html.replace(',dayPreview){const hour=',',dayPreview&&!tv){const hour=');}
   const page=await browser.newPage({viewport:{width:1920,height:1080},timezoneId:'Asia/Shanghai'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(instrument,spec);
   await page.route('**/*',route=>new URL(route.request().url()).hostname==='clock.test'?route.fulfill({contentType:'text/html',body:html}):route.abort());
   await page.clock.install({time:new Date('2026-10-16T12:00:30+08:00')});await page.clock.pauseAt(new Date('2026-10-16T12:00:30+08:00'));
   const client=await page.context().newCDPSession(page);await client.send('Performance.enable');await client.send('Emulation.setCPUThrottlingRate',{rate:4});
   const bootStart=performance.now();await page.goto('http://clock.test/');await page.evaluate(()=>document.fonts.ready);await page.clock.runFor(200);const bootWallMS=performance.now()-bootStart;
   assert(await page.evaluate(()=>window.clockAppReady&&window.clockTVReady));
   if(spec.fullscreen)await page.evaluate(()=>window.clockTVRemote('Escape'));
   if(spec.hideUnderlay)await page.addStyleTag({content:'.tv-settings-open .shell,.tv-settings-open .ambient,.tv-settings-open .stick-world{visibility:hidden}'});
   if(spec.fastDay)await page.evaluate(()=>document.getElementById('day-cycle').click());
   await page.clock.runFor(400);
   const getMetrics=async()=>Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
   await page.evaluate(()=>resetCost());const start=await getMetrics(),wallStart=performance.now();await page.clock.runFor(2000);const wallMS=performance.now()-wallStart,end=await getMetrics();
   const data=await page.evaluate(()=>({cost:window.cost,before:window.beforeClockBoot,underlayVisibility:getComputedStyle(document.querySelector('.shell')).visibility,previewVisible:!!document.querySelector('#tv-preview-canvas').getClientRects().length}));
   const metrics={};for(const name of ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'])metrics[name]=end[name]-start[name];
   assert.equal(data.cost.reads,0,'steady application must not scan pixels');assert.deepEqual(errors,[]);
   results.push({spec,bootWallMS,wallMS,sampleVirtualMS:2000,metrics,...data});console.log(JSON.stringify({name:spec.name,bootWallMS,wallMS,metrics,cost:data.cost,before:data.before}));await page.close();
  }
  const report={htmlSha256:createHash('sha256').update(original).digest('hex'),hostVersion:browser.version(),scope:'Desktop Chrome; 4x CPU throttle, two virtual seconds per scenario. Diagnostic comparisons, not real-TV FPS or RAM.',results};
  fs.writeFileSync('work/tv-app-cost-results.json',JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
