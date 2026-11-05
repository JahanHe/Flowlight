// Run: node work/check-tv-compat.cjs. Host Chromium with missing-API simulation, not an old-TV hardware test.
const fs=require('node:fs'), assert=require('node:assert/strict'), {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const shim=fs.readFileSync('work/tv-compat.js','utf8'),measure=fs.readFileSync('work/text-metrics.js','utf8'), fixture='work/tv-compat-fixture.html';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 try {
  const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('about:blank');
  await page.evaluate(()=>{
   window.clockTVReady=true;
   for(const [object,key] of [[Object,'hasOwn'],[Object,'fromEntries'],[Element.prototype,'replaceChildren'],[Document.prototype,'replaceChildren'],[DocumentFragment.prototype,'replaceChildren'],[MediaQueryList.prototype,'addEventListener'],[MediaQueryList.prototype,'removeEventListener']])Object.defineProperty(object,key,{value:undefined,writable:true,configurable:true});
  });
  await page.addScriptTag({content:measure});await page.addScriptTag({content:shim});
  assert.deepEqual(await page.evaluate(()=>{
   const symbol=Symbol('test'), value=Object.fromEntries([['__proto__',17],[symbol,42],['v',1],['v',2]]);
   const parent=document.createElement('div'), child=document.createElement('b');parent.appendChild(child);parent.replaceChildren('first',child,'last');
   const fragment=document.createDocumentFragment();fragment.replaceChildren('kept');
   const m=matchMedia('(min-width: 900px)');let called=0,removed=0;
   m.addListener=fn=>{if(typeof fn==='function')called++;};m.removeListener=fn=>{if(typeof fn==='function')removed++;};
   function change(){}m.addEventListener('change',change);m.removeEventListener('change',change);
   return {own:Object.hasOwn(value,'__proto__'),prototypeSafe:Object.getPrototypeOf(value)===Object.prototype,protoValue:value.__proto__,symbol:value[symbol],last:value.v,children:parent.textContent,moved:parent.children[0]===child,fragment:fragment.textContent,called,removed,incompatible:window.clockTVIncompatible};
  }),{own:true,prototypeSafe:true,protoValue:17,symbol:42,last:2,children:'firstlast',moved:true,fragment:'kept',called:1,removed:1,incompatible:false});
  const original='<!doctype html><style>.test{color:red}</style><script>const sharedTVValue={nested:{answer:42}};</script><script>window.__bundleResult=sharedTVValue?.nested?.answer??0;</script><script type="application/json">{"unchanged":true}</script>';
  fs.writeFileSync(fixture,original);execFileSync(process.execPath,['work/build-tv-bundle.cjs',fixture],{stdio:'pipe'});
  const bundled=fs.readFileSync(fixture,'utf8');assert(bundled.includes('<style>.test{color:red}</style>'));assert(bundled.includes('<script type="application/json">{"unchanged":true}</script>'));assert(!bundled.includes('?.'));assert(!bundled.includes('??'));
  await page.setContent(bundled);assert.equal(await page.evaluate(()=>window.__bundleResult),42,'cross-script lexical values survive compilation');
  for(const version of [65,55]){
   const old=await browser.newPage({userAgent:`Mozilla/5.0 (Linux; Android 6.0) AppleWebKit/537.36 Chrome/${version}.0.0.0 Safari/537.36`});
   await old.setContent('<body></body>');await old.addScriptTag({content:measure});await old.addScriptTag({content:shim});
   assert.match(await old.locator('#tv-compat-error').textContent(),/WebView 66/);assert.equal(await old.evaluate(()=>window.clockTVIncompatible),true);await old.close();
  }
  for(const field of ['actualBoundingBoxAscent','actualBoundingBoxDescent']){
   const missingMetrics=await browser.newPage({userAgent:'Mozilla/5.0 (Linux; Android 9) AppleWebKit/537.36 Chrome/66.0.3359.158 Safari/537.36'});await missingMetrics.setContent('<body></body>');
   await missingMetrics.evaluate(field=>Object.defineProperty(TextMetrics.prototype,field,{get:()=>field==='actualBoundingBoxAscent'?undefined:NaN,configurable:true}),field);
   await missingMetrics.addScriptTag({content:measure});await missingMetrics.addScriptTag({content:shim});
   assert.equal(await missingMetrics.evaluate(()=>window.clockTVIncompatible),false,'missing '+field+' must use pixel metrics');
   assert(await missingMetrics.evaluate(()=>{const ctx=document.createElement('canvas').getContext('2d');ctx.font='100px sans-serif';const m=clockMeasureText(ctx,'08');return Number.isFinite(m.actualBoundingBoxAscent)&&Number.isFinite(m.actualBoundingBoxDescent)&&m.width>0&&m.actualBoundingBoxAscent+m.actualBoundingBoxDescent>0;}),'fallback must produce actual glyph bounds');
   assert.equal(await missingMetrics.locator('#tv-compat-error').count(),0);
   await missingMetrics.close();
  }
  const noCanvas=await browser.newPage();await noCanvas.setContent('<body></body>');
  await noCanvas.evaluate(()=>{const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type){return type==='2d'?null:getContext.apply(this,arguments);};});
  await noCanvas.addScriptTag({content:measure});await noCanvas.addScriptTag({content:shim});
  assert.equal(await noCanvas.evaluate(()=>window.clockTVIncompatible),true,'missing Canvas 2D still fails explicitly');assert.match(await noCanvas.locator('#tv-compat-error').textContent(),/Canvas/);await noCanvas.close();
  assert.deepEqual(errors,[]);
  const result={passed:true,compiler:require('./tv-tooling/node_modules/esbuild').version,target:'chrome66',checks:['missing Object.hasOwn/fromEntries, replaceChildren, and MediaQueryList listeners','safe __proto__ and symbol keys; moved child preserved','cross-script scope and JSON/CSS preserved by compiler','Chrome 65 and 55 show explicit version failure','missing actualBoundingBoxAscent or Descent uses finite pixel metrics','Canvas 2D unavailable still fails explicitly'],scope:'API/UA simulation on current Chromium, not actual Chrome 66 or TV hardware'};
  fs.writeFileSync('work/tv-compat-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 } finally {await browser.close();if(fs.existsSync(fixture))fs.unlinkSync(fixture);}
})().catch(error=>{console.error(error);process.exitCode=1;});
