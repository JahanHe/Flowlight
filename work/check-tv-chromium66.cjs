// Run: node work/check-tv-chromium66.cjs. Capability simulation in current Chromium, NOT a Chrome 66 binary or TV benchmark.
// Support boundaries checked against https://github.com/mdn/browser-compat-data (TextMetrics, HTMLElement.focus, CSS min/max/clamp/inset/gap/fullscreen).
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const original=fs.readFileSync('outputs/glass-clock-tv.html','utf8'),removedCSS=new Set();
// Only the delivered HTML is changed in memory. Keep grid-gap and minmax(), both supported by 66.
const chrome66HTML=(source,removedCSS=new Set())=>source.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi,(_,attributes,css)=>'<style'+attributes+'>'+css
 .replace(/([^{}]+)\{([^{}]*)\}/g,(rule,selector)=>/:focus-visible|:fullscreen\b/.test(selector)?'':rule)
 .replace(/([-\w]+)\s*:\s*([^;{}]+)(;|(?=\}))/g,(declaration,property,value)=>{
  if(/^(?:inset(?:-.+)?|color-scheme|accent-color|(?:-webkit-)?backdrop-filter|text-underline-offset|text-decoration-thickness)$/.test(property)||/\b(?:min|max|clamp|env)\(/.test(value)||/\b[\d.]+(?:svh|svw|dvh|dvw|lvh|lvw)\b/.test(value)||property==='gap'){
   removedCSS.add(property+':'+value.trim());return '';
  }
  return declaration;
 })+'</style>');
const html=chrome66HTML(original,removedCSS);
function simulate66() {
 const remove=(object,key)=>{if(object)Object.defineProperty(object,key,{value:undefined,writable:true,configurable:true});};
 for(const [object,names] of [[Object,['hasOwn','fromEntries']],[Array.prototype,['flat','flatMap','at','findLast','findLastIndex','toSorted','toReversed','toSpliced','with']],[String.prototype,['replaceAll','at']],[Promise,['allSettled','any','withResolvers']],[Element.prototype,['replaceChildren']],[Document.prototype,['replaceChildren']],[DocumentFragment.prototype,['replaceChildren']],[CanvasRenderingContext2D.prototype,['roundRect','reset','getContextAttributes']],[window,['OffscreenCanvas','structuredClone']]])for(const name of names)remove(object,name);
 for(const name of Object.getOwnPropertyNames(TextMetrics.prototype))if(name!=='constructor'&&name!=='width')Object.defineProperty(TextMetrics.prototype,name,{get:()=>undefined,configurable:true});
 // Android ignores preventScroll even when desktop Chrome supports it. Exercise the real remote behavior.
 const focus=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(){return focus.call(this);};
 if(Object.getOwnPropertyDescriptor(HTMLElement.prototype,'inert'))delete HTMLElement.prototype.inert;
 remove(Element.prototype,'requestFullscreen');remove(Document.prototype,'exitFullscreen');
 const nativeMeasure=CanvasRenderingContext2D.prototype.measureText;
 window.__nativeTextMetrics=()=>nativeMeasure.call(document.createElement('canvas').getContext('2d'),'08');
 window.__actorEvents=0;document.addEventListener('companionactivity',event=>{
  if(![event.detail.x,event.detail.y,event.detail.energy].every(Number.isFinite))throw Error('Non-finite companion geometry');
  window.__actorEvents++;
 });
}
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CLOCK_CHROMIUM_PATH,headless:true}),results=[];
 try{
  for(const viewport of [{width:1280,height:720},{width:3840,height:2160}]){
   const page=await browser.newPage({viewport,deviceScaleFactor:1,timezoneId:'Asia/Shanghai',userAgent:'Mozilla/5.0 (Linux; Android 9; TV) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/66.0.3359.158 Safari/537.36'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(simulate66);
   let requests=0,weatherCode=0;
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.fulfill({contentType:'text/html',body:html});
    if(url.hostname==='api.open-meteo.com'){
     requests++;const stamp=await page.evaluate(()=>Date.now()/1000),day=Math.floor((stamp+28800)/86400)*86400-28800;
     return route.fulfill({contentType:'application/json',body:JSON.stringify({utc_offset_seconds:28800,current:{time:stamp,weather_code:weatherCode,is_day:1,cloud_cover:weatherCode?90:8,precipitation:weatherCode?2:0,wind_speed_10m:12},daily:{time:[day],sunrise:[day+21600],sunset:[day+64800],moonrise:[null],moonset:[null],moon_phase:[.5]}})});
    }
    return route.abort();
   });
   await page.clock.install({time:new Date('2026-10-16T12:00:00+08:00')});await page.clock.pauseAt(new Date('2026-10-16T12:00:30+08:00'));
   await page.goto('http://127.0.0.1/glass-clock-tv.html');await page.evaluate(()=>document.fonts.ready);await page.clock.runFor(250);
   assert.deepEqual(await page.evaluate(()=>[window.clockAppReady,window.clockTVReady,window.clockTVIncompatible,window.clockTVDiagnostics.stage]),[true,true,false,'ready']);
   assert.equal(await page.evaluate(()=>window.__nativeTextMetrics().actualBoundingBoxAscent),undefined);
   async function waitFor(predicate){for(let attempt=0;attempt<100;attempt++){if(await page.evaluate(predicate))return;await page.clock.runFor(20);}throw Error('Timed out waiting for mocked weather response');}
   await waitFor(()=>document.querySelector('#weather-status').textContent.includes('晴'));
   // Discover directional paths using the actual remote handler, then replay with real key events.
   async function travel(selector){
    const path=await page.evaluate(selector=>{
     const panel=document.querySelector('#tv-panel'),scroll=document.querySelector('#tv-content'),nodes=Array.from(panel.querySelectorAll('button')).filter(n=>!n.disabled&&n.getClientRects().length),start=document.activeElement,target=panel.querySelector(selector),top=scroll.scrollTop;
     if(!target)throw Error('Missing '+selector);
     const stamp=(n,y)=>nodes.indexOf(n)+'@'+Math.round(y),queue=[[start,top,[]]],seen=new Set([stamp(start,top)]);
     while(queue.length){const [node,y,path]=queue.shift();if(node===target){start.focus();scroll.scrollTop=top;return path;}
      for(const key of ['ArrowDown','ArrowRight','ArrowUp','ArrowLeft']){node.focus();scroll.scrollTop=y;window.clockTVRemote(key);const next=document.activeElement,ny=scroll.scrollTop,id=stamp(next,ny);if(nodes.includes(next)&&!seen.has(id)){seen.add(id);queue.push([next,ny,path.concat(key)]);}}
     }
     throw Error('Remote cannot reach '+selector);
    },selector);
    for(const key of path)await page.keyboard.press(key);
    assert(await page.locator(selector).evaluate(node=>node===document.activeElement),'remote path '+selector);
   }
   const activate=async selector=>{await travel(selector);await page.keyboard.press('Enter');};
   await activate('[aria-label="减小数字大小"]');assert.equal(await page.locator('#digit-size').inputValue(),'135');
   await activate('[aria-label="增大数字大小"]');
   await activate('[data-tab="fonts"]');
   const fonts=await page.locator('[data-font]').evaluateAll(nodes=>nodes.map(n=>n.dataset.font)),fontResults=[];
   for(const font of fonts){
    await activate(`[data-font="${font}"]`);assert.equal(await page.locator('#digit-font').inputValue(),font);await page.evaluate(()=>document.fonts.ready);
    const samples=[];
    for(const weight of viewport.width===1280?[300,400,500,600,650,700,800]:[300,800]){
     await page.evaluate(weight=>{const input=document.querySelector('#digit-weight');input.value=weight;input.dispatchEvent(new Event('input'));},weight);
     await page.evaluate(()=>document.fonts.ready);await page.clock.runFor(80);
     const result=await page.evaluate(()=>{
      const fronts=Array.from(document.querySelectorAll('.static.top .glass-numeral')).filter(c=>c.getBoundingClientRect().width>0).map(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=3;i<data.length;i+=4)if(data[i]>100)ink++;return ink;});
      const rect=document.querySelector('.clock').getBoundingClientRect(),css=getComputedStyle(document.querySelector('.numeral'));
      return {fronts,width:rect.width,left:rect.left,right:rect.right,weight:css.fontWeight,font:css.fontFamily,finite:[rect.width,rect.height].every(Number.isFinite)};
     });
     assert(result.finite&&result.left>=0&&result.right<=viewport.width+1,font+' clock bounds');assert(result.fronts.every(n=>n>200),font+' missing glass pixels at '+weight);assert.equal(result.weight,String(weight));samples.push({weight,ink:result.fronts.reduce((a,b)=>a+b,0)});
    }
    if(!['system','rounded','mono','serif'].includes(font))assert(samples[samples.length-1].ink>samples[0].ink*1.08,font+' real weight change');
    fontResults.push({font,samples});
   }
   await activate('[data-tab="display"]');await activate('[data-toggle="show-seconds"]');await page.clock.runFor(700);
   const beforeSeconds=await page.locator('.tile[data-unit="seconds"] .static.top .numeral').textContent();await page.clock.fastForward(2100);await page.clock.runFor(650);
   assert.notEqual(await page.locator('.tile[data-unit="seconds"] .static.top .numeral').textContent(),beforeSeconds);
   await activate('[data-toggle="use-glass"]');assert(await page.locator('body').evaluate(n=>n.classList.contains('plain-digits')));await activate('[data-toggle="use-glass"]');
   await activate('[data-tab="weather"]');await activate('#tv-day-cycle');await page.clock.runFor(250);
   const progress=()=>page.locator('#day-cycle-progress').evaluate(n=>parseFloat(n.style.width));
   const beforeRain=await progress();await activate('[data-weather="rain"]');await page.clock.runFor(100);
   assert((await progress())>=beforeRain&&(await progress())-beforeRain<1,'rain must retain timeline');assert.equal(await page.locator('body').getAttribute('data-weather'),'rain');
   const pixelHash=()=>page.evaluate(()=>['#weather-canvas','.stick-canvas'].map(selector=>{const c=document.querySelector(selector),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let h=2166136261;for(let i=0;i<d.length;i+=17)h=Math.imul(h^d[i],16777619);return h>>>0;}));
   const beforeMove=await pixelHash();await page.clock.runFor(600);const afterMove=await pixelHash();assert.notEqual(beforeMove[0],afterMove[0]);assert.notEqual(beforeMove[1],afterMove[1]);
   await activate('#tv-live-weather');assert.equal(await page.locator('#day-cycle').getAttribute('aria-pressed'),'true');
   if(viewport.width===1280){
    const oldRequests=requests;weatherCode=61;await page.clock.fastForward(600100);await page.clock.runFor(100);
    await waitFor(()=>document.querySelector('#weather-status').textContent.includes('雨'));await page.clock.runFor(100);
    assert(requests>oldRequests,'10 minute weather refresh');assert.equal(await page.locator('body').getAttribute('data-weather'),'rain');assert.equal(await page.locator('#day-cycle').getAttribute('aria-pressed'),'true');
    if(await page.locator('#tv-panel').isHidden())await page.keyboard.press('Enter');
   }
   await activate('[data-tab="cities"]');await activate('[data-region="AZJ"]');await page.keyboard.press('Escape');assert(await page.locator('[data-region="AZJ"]').isVisible());
   await activate('[data-city="杭州 · 西湖区"]');await activate('[data-tab="display"]');
   const bounds=await page.evaluate(()=>{const p=document.querySelector('#tv-panel').getBoundingClientRect();return {left:p.left,top:p.top,right:p.right,bottom:p.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1,gridGap:getComputedStyle(document.querySelector('.tv-tabs')).columnGap,actorEvents:window.__actorEvents};});
   assert(bounds.left>=0&&bounds.top>=0&&bounds.right<=viewport.width&&bounds.bottom<=viewport.height&&!bounds.overflow);assert(parseFloat(bounds.gridGap)>0);assert(bounds.actorEvents>0);
   await page.screenshot({path:`work/tv-chromium66-${viewport.width}-settings.png`});
   await page.clock.fastForward(15100);assert(await page.locator('#tv-panel').isHidden());assert.equal(await page.locator('.editor-only:visible').count(),0);
   const beforeIdle=await pixelHash();await page.clock.runFor(200);const afterIdle=await pixelHash();assert.notEqual(beforeIdle[0],afterIdle[0]);
   await page.keyboard.press('Enter');assert(await page.locator('#tv-panel').isVisible());await page.keyboard.press('Escape');assert(await page.locator('#tv-panel').isHidden());assert.equal(await page.evaluate(()=>window.clockTVRemote('Escape')),false);
   const clock=await page.evaluate(()=>({hours:document.querySelector('.tile[data-unit="hours"] .static.top .numeral').textContent,minutes:document.querySelector('.tile[data-unit="minutes"] .static.top .numeral').textContent,now:[String(new Date().getHours()).padStart(2,'0'),String(new Date().getMinutes()).padStart(2,'0')]}));
   assert.deepEqual([clock.hours,clock.minutes],clock.now);assert.deepEqual(errors,[]);
   await page.screenshot({path:`work/tv-chromium66-${viewport.width}-clock.png`});
   results.push({viewport,fonts:fontResults,bounds,weatherRequests:requests,passed:true});await page.close();
  }
  const report={passed:true,htmlSha256:createHash('sha256').update(original).digest('hex'),scope:'Current desktop Chromium with post-66 APIs and CSS disabled; UA 66 only exercises version guard. NOT actual Chrome 66, Android, GPU-driver, or 1 GB TV verification.',hostVersion:browser.version(),removedCSS:Array.from(removedCSS),results};
  fs.writeFileSync('work/tv-chromium66-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,hostVersion:report.hostVersion,viewports:results.map(r=>r.viewport),fontWeightCases:results.reduce((n,r)=>n+r.fonts.reduce((n,f)=>n+f.samples.length,0),0),scope:report.scope},null,2));
 }finally{await browser.close();}
}
module.exports={simulate66,chrome66HTML};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
