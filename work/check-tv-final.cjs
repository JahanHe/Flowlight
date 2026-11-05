// Final targeted smoke test. Reuses the audited Chrome 66 capability simulation; never claims a real old engine.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const {simulate66,chrome66HTML}=require('./check-tv-chromium66.cjs');
const original=fs.readFileSync('outputs/glass-clock-tv.html','utf8'),html=chrome66HTML(original);
const userAgent='Mozilla/5.0 (Linux; Android 9; TV) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/66.0.3359.158 Safari/537.36';
function visibleDigits(){
 return Array.from(document.querySelectorAll('.tile')).filter(tile=>tile.getClientRects().length&&tile.getBoundingClientRect().width).map(tile=>({unit:tile.dataset.unit,text:tile.querySelector('.static.top .numeral').textContent,halves:Array.from(tile.querySelectorAll('.static')).map(half=>{
  const glyph=half.querySelector('.glass-numeral'),span=half.querySelector('.numeral'),css=getComputedStyle(span),data=glyph&&glyph.width&&glyph.height?glyph.getContext('2d').getImageData(0,0,glyph.width,glyph.height).data:[],box=half.getBoundingClientRect();let ink=0;for(let i=3;i<data.length;i+=4)if(data[i]>80)ink++;
  return {ready:half.classList.contains('glass-half-ready'),ink,plainOpacity:Number(css.opacity),plainText:span.textContent,width:box.width,height:box.height};
 })}));
}
function previewSample(){
 const c=document.querySelector('#tv-preview-canvas'),data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=2166136261,bright=0;
 for(let i=0;i<data.length;i+=4){if(data[i]+data[i+1]+data[i+2]>360)bright++;hash=Math.imul(hash^data[i],16777619);}
 return {hash:hash>>>0,bright,width:c.width,height:c.height};
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CLOCK_CHROMIUM_PATH,headless:true}),results=[];
 async function pageFor(body,viewport,fault){
  const page=await browser.newPage({viewport,timezoneId:'Asia/Shanghai',deviceScaleFactor:1,userAgent}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(simulate66);
  if(fault)await page.addInitScript(fault);
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='clock.test'?route.fulfill({contentType:'text/html',body}):route.abort());
  await page.clock.install({time:new Date('2026-10-16T12:34:10+08:00')});await page.clock.pauseAt(new Date('2026-10-16T12:34:10+08:00'));
  await page.goto('http://clock.test/');return {page,errors};
 }
 try{
  // Inspect the delivered first screen before the app executes, including actual template parsing.
  const {page:boot}=await pageFor(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{width:1280,height:720});
  const first=await boot.evaluate(()=>({classes:document.body.className,template:document.querySelector('#font-licenses') instanceof HTMLTemplateElement,leaked:document.body.innerText.includes('SIL OPEN FONT LICENSE'),oldControls:Array.from(document.querySelectorAll('.editor-only')).filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').length,bootVisible:!!document.querySelector('#tv-boot').getClientRects().length,version:document.querySelector('meta[name="clock-tv-version"]').content}));
  assert(first.classes.includes('tv-booting')&&first.classes.includes('tv-settings-open')&&first.template&&first.bootVisible);assert.equal(first.oldControls,0);assert.equal(first.leaked,false);assert.equal(first.version,'1.0.3');await boot.close();
  for(const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:3840,height:2160}]){
   const {page,errors}=await pageFor(html,viewport);await page.evaluate(()=>document.fonts.ready);await page.clock.runFor(900);
   assert(await page.evaluate(()=>typeof clockTVRemote==='function'&&window.clockAppReady===true&&window.clockTVReady===true),'native readiness contract');
   assert.equal(await page.evaluate(()=>window.clockTVDiagnostics.firstError),'');assert.equal(await page.locator('#tv-version').textContent(),'1.0.3');assert.equal(await page.locator('#tv-boot').count(),0);
   assert.equal(await page.evaluate(()=>document.querySelector('#font-licenses') instanceof HTMLTemplateElement&&!document.body.innerText.includes('SIL OPEN FONT LICENSE')),true);
   assert.equal(await page.locator('.shell').evaluate(n=>getComputedStyle(n).visibility),'hidden','underlying clock must not be composited behind settings');
   const digits=await page.evaluate(visibleDigits);assert.deepEqual(digits.map(d=>d.text),['12','34']);
   for(const digit of digits)for(const half of digit.halves)assert(half.width>0&&half.height>0&&half.ready&&half.ink>50,digit.unit+' static glass half missing');
   const before=await page.evaluate(previewSample);assert(before.bright>300,'preview must contain legible light digits');assert.equal(before.width*9,before.height*16);await page.clock.runFor(750);const after=await page.evaluate(previewSample);assert.notEqual(before.hash,after.hash,'preview must remain animated with hidden source layers');
   const geometry=await page.evaluate(()=>{
    const box=n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};},panel=box(document.querySelector('#tv-panel')),content=box(document.querySelector('#tv-content'));
    return {panel,preview:box(document.querySelector('.tv-preview-frame')),toggles:Array.from(document.querySelectorAll('.tv-toggles button')).map(n=>{const range=document.createRange();range.selectNodeContents(n);const text=range.getBoundingClientRect();return {box:box(n),text:{left:text.left,right:text.right},lines:range.getClientRects().length};}),steppers:Array.from(document.querySelectorAll('.tv-stepper')).map(n=>{const r=box(n);return r.top>=content.top&&r.bottom<=content.bottom;}),overflow:document.documentElement.scrollWidth>innerWidth+1,canvasBytes:Array.from(document.querySelectorAll('canvas')).reduce((n,c)=>n+c.width*c.height*4,0)};
   });
   assert.equal(geometry.toggles.length,3);assert(geometry.toggles.every(t=>t.lines===1&&t.text.left>=t.box.left&&t.text.right<=t.box.right));assert(Math.max(...geometry.toggles.map(t=>t.box.top))-Math.min(...geometry.toggles.map(t=>t.box.top))<1);
   assert.equal(geometry.steppers.length,4);assert(geometry.steppers.every(Boolean));assert(!geometry.overflow);assert(geometry.panel.left>=viewport.width*.039&&geometry.panel.top>=viewport.height*.039&&geometry.panel.right<=viewport.width*.961&&geometry.panel.bottom<=viewport.height*.961);assert(Math.abs(geometry.preview.height-geometry.preview.width*9/16)<2.5);
   await page.screenshot({path:`work/tv-final-${viewport.width}-settings.png`});
   // Initial confirm is the native D-pad OK action: the exact same clock must appear immediately.
   await page.keyboard.press('Enter');await page.clock.runFor(250);assert(await page.locator('#tv-panel').isHidden());assert.equal(await page.locator('.shell').evaluate(n=>getComputedStyle(n).visibility),'visible');
   const clock=await page.evaluate(visibleDigits);for(const digit of clock)for(const half of digit.halves)assert(half.ready&&half.ink>50,digit.unit+' disappears on fullscreen transition');
   await page.screenshot({path:`work/tv-final-${viewport.width}-clock.png`});
   await page.keyboard.press('Enter');await page.clock.runFor(250);assert(await page.locator('#tv-panel').isVisible());await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');assert(await page.evaluate(()=>document.querySelector('#tv-panel').contains(document.activeElement)));
   // One reversible plain/glass toggle exercises the fallback representation used by drawing failures.
   await page.evaluate(()=>{const input=document.querySelector('#use-glass');input.checked=false;input.dispatchEvent(new Event('change'));});await page.clock.runFor(300);
   assert((await page.evaluate(visibleDigits)).every(d=>d.halves.every(h=>h.plainOpacity>0)));assert((await page.evaluate(previewSample)).bright>300);
   await page.clock.fastForward(15100);assert(await page.locator('#tv-panel').isHidden());assert.equal(await page.evaluate(()=>window.clockTVRemote('Escape')),false);assert.deepEqual(errors,[]);
   results.push({viewport,passed:true,geometry,digits,preview:after});await page.close();
  }
  // Continuous GPU-to-glyph copy failure must leave ordinary digits readable and keep TV controls ready.
  const {page:fallback,errors:fallbackErrors}=await pageFor(html,{width:1280,height:720},()=>{
   const copy=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(){if(this.canvas.className==='glass-numeral')throw Error('synthetic glyph copy failure');return copy.apply(this,arguments);};
  });
  await fallback.evaluate(()=>document.fonts.ready);await fallback.clock.runFor(900);
  assert(await fallback.evaluate(()=>window.clockAppReady&&window.clockTVReady),'copy failure must not break native readiness');
  const plain=await fallback.evaluate(visibleDigits);assert(plain.every(d=>d.halves.every(h=>!h.ready&&h.plainOpacity>0&&h.plainText.length===2)),'failed glass must preserve plain digits');assert((await fallback.evaluate(previewSample)).bright>300);await fallback.screenshot({path:'work/tv-final-draw-failure.png'});
  await fallback.keyboard.press('Enter');await fallback.clock.runFor(250);assert(await fallback.locator('#tv-panel').isHidden());assert.equal(await fallback.locator('.shell').evaluate(n=>getComputedStyle(n).visibility),'visible');assert((await fallback.evaluate(visibleDigits)).every(d=>d.halves.every(h=>!h.ready&&h.plainOpacity>0&&h.plainText.length===2)),'failed glass must preserve fullscreen digits');assert.deepEqual(fallbackErrors,[]);await fallback.screenshot({path:'work/tv-final-draw-failure-clock.png'});await fallback.close();
  const {page:noCanvas}=await pageFor(html,{width:1280,height:720},()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type){return type==='2d'?null:original.apply(this,arguments);};});
  assert.equal(await noCanvas.evaluate(()=>window.clockTVDiagnostics.stage),'unsupported');assert.equal(await noCanvas.evaluate(()=>!!window.clockTVReady),false);assert(await noCanvas.locator('#tv-compat-error').isVisible());await noCanvas.close();
  let index=0;const damaged=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,block=>++index===2?'<script>function {</script>':block);
  const {page:broken}=await pageFor(damaged,{width:1280,height:720});assert(await broken.evaluate(()=>window.clockTVDiagnostics.firstError.length>0&&!window.clockTVReady));assert.equal(await broken.evaluate(()=>document.body.innerText.includes('SIL OPEN FONT LICENSE')),false);assert(await broken.locator('#tv-boot').isVisible());await broken.close();
  const report={passed:true,htmlSha256:createHash('sha256').update(original).digest('hex'),version:'1.0.3',firstScreen:first,results,faults:['missing post-66 TextMetrics is supported','continuous glass copy failure leaves plain digits and preview','missing Canvas2D remains explicit failure','syntax error survives in native-readable preflight diagnostics'],scope:'Current desktop Chromium with post-66 APIs/CSS removed. No actual Chromium66/Android/GPU-driver/1GB performance claim. canvasBytes counts only DOM canvas backing buffers, not all controlled allocations or process RSS.'};
  fs.writeFileSync('work/tv-final-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,version:report.version,sha256:report.htmlSha256,viewports:results.map(r=>r.viewport),faults:report.faults},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
