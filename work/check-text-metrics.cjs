const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent(fs.readFileSync('outputs/glass-clock.html','utf8').replace(/<script>[\s\S]*?<\/script>/g,''));
 await page.addScriptTag({content:fs.readFileSync('work/text-metrics.js','utf8')});
 const comparison=await page.evaluate(async()=>{
   const families=[...document.querySelectorAll('#digit-font option[data-family]')].map(o=>o.dataset.family).concat(['Arial','Georgia']);
   for(const family of families)for(const weight of [300,800])await document.fonts.load(`${weight} 144px ${family}`,'0123456789');
   const original=CanvasRenderingContext2D.prototype.measureText;window.nativeTextMeasure=original;const read=CanvasRenderingContext2D.prototype.getImageData;
   window.metricReads=0;CanvasRenderingContext2D.prototype.getImageData=function(...args){metricReads++;return read.apply(this,args)};
   const c=document.createElement('canvas'),ctx=c.getContext('2d');ctx.font='800 144px Arial';
   const direct=clockMeasureText(ctx,'08');if(direct.width!==original.call(ctx,'08').width||metricReads!==0)throw new Error('native measurement must not scan');
   CanvasRenderingContext2D.prototype.measureText=function(text){const m=original.call(this,text);return{width:m.width}};
   const cases=[];
   for(const family of families)for(const weight of [300,800])for(const size of [18,144,556.8,1113.6])for(const text of ['08','15','59']) {
     ctx.font=`${weight} ${size}px ${family}`;const native=original.call(ctx,text),fallback=clockMeasureText(ctx,text),tolerance=Math.max(2,size/512*1.6);
     const error=Math.max(Math.abs(native.actualBoundingBoxAscent-fallback.actualBoundingBoxAscent),Math.abs(native.actualBoundingBoxDescent-fallback.actualBoundingBoxDescent));
     if(error>tolerance)throw new Error(JSON.stringify({family,weight,size,text,native:{a:native.actualBoundingBoxAscent,d:native.actualBoundingBoxDescent},fallback,error,tolerance}));
     if(!Number.isFinite(fallback.actualBoundingBoxAscent+fallback.actualBoundingBoxDescent)||fallback.width!==native.width)throw new Error('invalid metric');
     cases.push({family,weight,size,text,error});
   }
   ctx.font='800 556.8px Arial';clockMeasureText(ctx,'08');const before=metricReads;for(let i=0;i<500;i++)clockMeasureText(ctx,'08');const repeated=metricReads-before;
   document.fonts.dispatchEvent(new Event('loadingdone'));clockMeasureText(ctx,'08');const afterFontLoad=metricReads-before;
   clockMeasureText.clearCache();clockMeasureText(ctx,'08');const afterClear=metricReads-before;
   ctx.font='800 144px "Late Metrics", Georgia';clockMeasureText(ctx,'08');const beforeActualFontLoad=metricReads;
   const fontURL=document.querySelector('style').textContent.match(/url\((data:font\/woff2;base64,[^)]+)\)/)[1];
   const loadingDone=new Promise(resolve=>document.fonts.addEventListener('loadingdone',resolve,{once:true}));
   document.fonts.add(new FontFace('Late Metrics',`url(${fontURL})`,{weight:'300 800'}));await document.fonts.load('800 144px "Late Metrics"','08');await loadingDone;
   const loaded=clockMeasureText(ctx,'08'),actualFontLoadReads=metricReads-beforeActualFontLoad,nativeLoaded=original.call(ctx,'08');
   if(Math.abs(loaded.actualBoundingBoxAscent-nativeLoaded.actualBoundingBoxAscent)>2)throw new Error('loaded font kept stale bounds');
   return{cases:cases.length,maxError:Math.max(...cases.map(c=>c.error)),repeated,afterFontLoad,afterClear,actualFontLoadReads};
 });
 assert.equal(comparison.repeated,0);assert.equal(comparison.afterFontLoad,1);assert.equal(comparison.afterClear,2);assert.equal(comparison.actualFontLoadReads,1);
 await page.addScriptTag({content:['weather-scene.js','glass-digits.js','stick-figure.js'].map(n=>fs.readFileSync('work/'+n,'utf8')).join('\n')});
 await page.evaluate(()=>{window.clockTV=true;document.querySelectorAll('.tile').forEach((tile,i)=>tile.querySelectorAll('.numeral').forEach(span=>span.textContent=['08','15','59'][i]));const source=document.getElementById('weather-canvas');window.scene=createWeatherScene(source,true);scene.setState({phase:'day',condition:'clear'});window.glass=createGlassDigits(source);glass.draw();window.actor=createStickFigure();actor.setState({phase:'day',condition:'clear'});});
 await page.waitForTimeout(300);
 const rendered=await page.evaluate(()=>{
   const worlds=[...document.querySelectorAll('.stick-world')],world=worlds[0],canvases=[...document.querySelectorAll('.static.top .glass-numeral')].filter(c=>c.getBoundingClientRect().width);
   return{worlds:worlds.length,x:Number(world.dataset.x),y:Number(world.dataset.y),glyphs:canvases.map(half=>{const bottomHalf=half.closest('.tile').querySelector('.static.bottom .glass-numeral'),c=document.createElement('canvas');c.width=half.width;c.height=half.height+bottomHalf.height;const cx=c.getContext('2d');cx.drawImage(half,0,0);cx.drawImage(bottomHalf,0,half.height);const p=cx.getImageData(0,0,c.width,c.height).data;let top=c.height,bottom=-1,filled=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(p[(y*c.width+x)*4+3]>200){top=Math.min(top,y);bottom=Math.max(bottom,y);filled++;}return {width:c.width,height:c.height,filled,centerError:Math.abs((top+bottom)/2-c.height/2),cornerAlpha:p[3]}})};
 });
 assert.equal(rendered.worlds,1);assert(Number.isFinite(rendered.x)&&Number.isFinite(rendered.y));for(const g of rendered.glyphs){assert(g.filled>1000);assert(g.centerError<3);assert.equal(g.cornerAlpha,0)}
 // A plain digit mode still gets finite companion geometry when all extended metrics are absent.
 await page.evaluate(()=>{document.body.classList.add('plain-digits');actor.refresh();});
 assert(await page.locator('.stick-world').evaluate(e=>Number.isFinite(Number(e.dataset.x))&&Number.isFinite(Number(e.dataset.y))));assert.deepEqual(errors,[]);
 await page.evaluate(()=>{CanvasRenderingContext2D.prototype.measureText=nativeTextMeasure;document.body.classList.remove('plain-digits');document.querySelectorAll('.glass-numeral').forEach(c=>c.remove());window.clockTV=false;window.nativeGlass=createGlassDigits(document.getElementById('weather-canvas'));nativeGlass.draw();actor.refresh();});
 assert.equal(await page.locator('.glass-numeral').count(),12);assert(await page.locator('.static.top .glass-numeral').first().evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return p.some((v,i)=>i%4===3&&v>200)}));assert.deepEqual(errors,[]);
 const result={...comparison,rendered,nativeRenderer:true};fs.writeFileSync('work/text-metrics-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));console.log('PASS: native and width-only metrics, embedded fonts/weights/sizes, cache hits and font-load invalidation, visible centered transparent glass, finite companion geometry.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
