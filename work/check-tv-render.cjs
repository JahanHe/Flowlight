// Same authored scene, DPR and update schedule: compare normal rendering with TV optimizations.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const html=fs.readFileSync('outputs/glass-clock.html','utf8').replace(/<script>[\s\S]*?<\/script>/g,'');
const source=['text-metrics.js','weather-scene.js','glass-digits.js','stick-figure.js'].map(name=>fs.readFileSync(`work/${name}`,'utf8')).join('\n');
let browser;
(async()=>{
  browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
  const results={};
  for(const mode of ['normal','tv','tv-fallback']) {
    const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:2});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install();await page.clock.pauseAt(new Date());
    await page.setContent(html);await page.evaluate(({mode})=>{
      window.clockTV=mode!=='normal';window.renderStats={uploads:0,allocations:0,subUpdates:0,uploadPixels:0,weatherPaints:0,glyphCopies:0,actorPaints:0,reads:0,rects:0,styles:0};
      const record=window.renderStats;
      const originalContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){return mode==='tv-fallback'&&type==='webgl'?null:originalContext.call(this,type,...args)};
      const rect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(...args){record.rects++;return rect.apply(this,args)};
      const css=window.getComputedStyle;window.getComputedStyle=function(...args){record.styles++;return css.apply(this,args)};
      for(const method of ['texImage2D','texSubImage2D']){
        const original=WebGLRenderingContext.prototype[method];WebGLRenderingContext.prototype[method]=function(...args){const canvas=args.at(-1);if(canvas?.id==='weather-canvas'){record.uploads++;record[method==='texImage2D'?'allocations':'subUpdates']++;record.uploadPixels+=canvas.width*canvas.height;}return original.apply(this,args)};
      }
      const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.id==='weather-canvas')record.weatherPaints++;if(this.canvas.className==='stick-canvas')record.actorPaints++;return clear.apply(this,args)};
      const copy=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.className==='glass-numeral')record.glyphCopies++;return copy.apply(this,args)};
      const read=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(...args){record.reads++;return read.apply(this,args)};
    },{mode});
    await page.addScriptTag({content:source});
    await page.evaluate(()=>{
      document.querySelectorAll('.tile').forEach((tile,i)=>tile.querySelectorAll('.numeral').forEach(span=>span.textContent=['12','34','56'][i]));
      const canvas=document.querySelector('#weather-canvas');
      window.glass=createGlassDigits(canvas);window.actor=createStickFigure();
      window.scene=createWeatherScene(canvas,false,()=>glass.draw());
      window.sceneState={phase:'night',condition:'rain',cloudCover:.7,intensity:.8,wind:20,timeline:true,enhancedSky:true,idealCycle:true,dayProgress:.9,sunAltitude:-24,moonAltitude:45,moonProgress:.3,moonVisible:true,moonPhase:.48};
      window.updateScene=()=>{scene.setState(sceneState);actor.setState(sceneState);const light=clockLightSource(sceneState,innerWidth,innerHeight);actor.setLight(light);glass.setLight(light);glass.draw()};
      updateScene();window.updates=setInterval(updateScene,1000/30);
    });
    await page.clock.runFor(500);await page.evaluate(()=>Object.keys(renderStats).forEach(k=>renderStats[k]=0));
    await page.clock.runFor(1000);
    const stats=await page.evaluate(()=>({...renderStats,backgroundPixels:document.querySelector('#weather-canvas').width*document.querySelector('#weather-canvas').height,glyphWidth:document.querySelector('.glass-numeral').width,visibleCanvases:[...document.querySelectorAll('canvas')].reduce((n,c)=>n+c.width*c.height*4,0)}));
    assert.equal(stats.reads,0,'steady animation must never read back pixels');assert(stats.weatherPaints>=(mode==='normal'?20:8)&&stats.actorPaints>=(mode==='normal'?20:8),'both weather and companion must stay animated');
    assert.equal(await page.locator('.stick-world').count(),1);assert.deepEqual(errors,[]);
    if(mode!=='normal') {
      assert(stats.actorPaints<=32,'TV must not draw companion again for each state update');
      assert(stats.rects<=3&&stats.styles<=3,'stable TV layout must not be read repeatedly');
      if(mode==='tv'){assert(stats.uploads<=32);assert.equal(stats.allocations,0);assert(stats.subUpdates>0);}
      const before=await page.evaluate(()=>{const c=document.querySelector('.glass-numeral');return Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data).reduce((n,v,i)=>n+(i%4===3&&v>200?1:0),0)});
      assert(before>1000,'glass remains visible with WebGL and 2D fallback');
      const hashes=()=>page.evaluate(()=>['#weather-canvas','.stick-canvas'].map(selector=>{const c=document.querySelector(selector),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=2166136261;for(let i=0;i<p.length;i+=17)hash=Math.imul(hash^p[i],16777619);return hash>>>0}));
      const stills=await hashes();await page.clock.runFor(300);const moved=await hashes();
      assert.notEqual(stills[0],moved[0],'rain and clouds must visibly move');assert.notEqual(stills[1],moved[1],'companion must visibly breathe or move');
      for(let i=0;i<16;i++) {
        await page.evaluate(value=>{document.querySelectorAll('.tile')[2].querySelectorAll('.numeral').forEach(span=>span.textContent=String(value).padStart(2,'0'));glass.draw()},i);
        await page.clock.runFor(40);
      }
      assert(await page.locator('.static.bottom .glass-numeral').last().evaluate(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return data.some((v,i)=>i%4===3&&v>200)}),'TV glyph cache eviction must retain current digits');
      await page.setViewportSize({width:3840,height:2160});await page.clock.runFor(100);
      const large=await page.evaluate(()=>{const c=document.querySelector('#weather-canvas');return {width:c.width,height:c.height}});assert(large.width*large.height<=1920*1080,'4K screen weather must fit 1080p budget');
      await page.evaluate(()=>{document.body.style.setProperty('--digit-size','180px');glass.refresh();glass.draw()});await page.clock.runFor(100);
      assert(await page.locator('.glass-numeral').first().evaluate(c=>c.width>0));
      await page.setViewportSize({width:1280,height:720});await page.clock.runFor(100);await page.screenshot({path:`work/${mode}-render.png`});
    }
    results[mode]=stats;await context.close();
  }
  assert(results.tv.glyphWidth>=Math.floor(results.normal.glyphWidth/1.5),'TV outlines must retain one raster pixel per display pixel');
  assert(results.tv.uploadPixels<results.normal.uploadPixels*.40,'TV must materially reduce texture traffic');
  assert(results.tv.actorPaints<results.normal.actorPaints*.7,'remove duplicate companion paints');
  fs.writeFileSync('work/tv-render-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));console.log('PASS: same dynamic rain/moon scene, no steady readback, bounded TV canvas, sharp digits, one continuous companion, WebGL and 2D glass fallback.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
