// Run with installed Chrome: node work/check-clock-appearance.cjs [localhost URL]
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {chromium}=require('playwright');
const url=process.argv[2]||'http://127.0.0.1:8765/glass-clock.html';assert.match(url,/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//);
const results=[],errors=[];
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(error){results.push({name,passed:false,error:error.message});console.error('FAIL',name,error.stack);}}
const time=Date.parse('2026-10-16T12:34:56+08:00'), days=Array.from({length:4},(_,i)=>Date.parse(`2026-10-${15+i}T00:00:00+08:00`)/1000);
const data={current:{time:time/1000,weather_code:0,is_day:1,cloud_cover:0,precipitation:0,wind_speed_10m:12},daily:{time:days,sunrise:days.map(x=>x+21600),sunset:days.map(x=>x+64800),moonrise:days.map(x=>x+61200),moonset:days.map(x=>x+18000),moon_phase:days.map(()=>.3)}};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:960},timezoneId:'Asia/Shanghai',hasTouch:true});
  await context.route('**/*',route=>{const target=new URL(route.request().url());if(target.origin===new URL(url).origin)return route.continue();if(target.hostname==='api.open-meteo.com')return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date(time)});await page.clock.pauseAt(new Date(time+1000));await page.clock.setSystemTime(new Date(time));
  await page.goto(url);await page.waitForFunction(()=>document.body.dataset.phase==='day');
  const open=async()=>{if(await page.locator('#weather-gallery').isVisible())await page.locator('#gallery-close').click();if(await page.locator('#appearance-panel').isHidden())await page.locator('#appearance-toggle').click();};
  const setRange=async(id,value)=>{await page.locator(id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);await page.clock.runFor(40);};
  const settings=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('floating-light-clock')));
  const current=()=>page.evaluate(()=>({glass:document.querySelector('#use-glass').checked,size:Number(document.querySelector('#digit-size').value),weight:Number(document.querySelector('#digit-weight').value),spacing:Number(document.querySelector('#digit-spacing').value),font:document.querySelector('#digit-font').value}));
  const typography=()=>page.locator('[data-unit="hours"] .static.top .numeral').evaluate(el=>{const s=getComputedStyle(el);return {size:parseFloat(s.fontSize),weight:s.fontWeight,font:s.fontFamily,spacing:s.letterSpacing,opacity:s.opacity};});


  await check('one-touch plain/glass mode keeps visible numerals and changing sun shadows',async()=>{
   assert.equal(await page.locator('#use-glass').isChecked(),true);
   await page.waitForFunction(()=>document.documentElement.classList.contains('glass-digits-ready'));
   await page.locator('#use-glass').uncheck();await page.clock.runFor(80);
   assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('plain-digits')),true);
   assert.equal((await typography()).opacity,'1');
   assert.equal(await page.locator('.glass-numeral').evaluateAll(els=>els.every(el=>getComputedStyle(el).display==='none')),true);
   const shadows=[];
   await page.locator('#weather-browse').click();
   for(const id of ['sunrise','sunset']){await page.locator(`.preview-option[data-preview="${id}"]`).click();await page.clock.runFor(80);shadows.push(await page.locator('[data-unit="hours"] .static.top .numeral').evaluate(el=>getComputedStyle(el).textShadow+'|'+getComputedStyle(el).filter));}
   assert.notEqual(shadows[0],shadows[1]);await page.locator('#gallery-close').click();
   await page.locator('#use-glass').check();await page.clock.runFor(80);assert.equal((await typography()).opacity,'0');
   assert.equal(await page.locator('[data-unit="hours"] .static.top .glass-numeral').isVisible(),true);
  });

  await check('size/weight/spacing/font controls change actual typography and persist after reload',async()=>{
   await open();const baseline=await typography();
   await setRange('#digit-size',70);const small=await typography();await setRange('#digit-size',120);const large=await typography();assert.ok(large.size>small.size);
   await setRange('#digit-weight',800);assert.equal((await typography()).weight,'800');
   await setRange('#digit-spacing',18);assert.equal((await typography()).spacing,'18px');
   await page.locator('#digit-font').selectOption('serif');await page.clock.runFor(80);assert.notEqual((await typography()).font,baseline.font);assert.match((await typography()).font,/Iowan|Georgia/);
   const chosen=await current();await page.reload();await page.waitForFunction(()=>document.body.dataset.phase==='day');await page.clock.runFor(80);
   assert.deepEqual(await current(),chosen);assert.equal((await typography()).weight,'800');assert.equal((await typography()).spacing,'18px');
   assert.deepEqual(Object.fromEntries(Object.entries(await settings()).filter(([key])=>key in chosen)),chosen);
  });

  await check('four presets apply and reset restores the complete default appearance',async()=>{
   await open();const snapshots=[];
   for(const name of ['minimal','classic','rounded','mono']){await page.locator(`[data-clock-preset="${name}"]`).click();await page.clock.runFor(60);assert.equal(await page.locator(`[data-clock-preset="${name}"]`).getAttribute('aria-pressed'),'true');snapshots.push(JSON.stringify(await current()));}
   assert.equal(new Set(snapshots).size,4);
   await page.locator('#appearance-close').click();await page.locator('#use-glass').uncheck();await open();await page.locator('#appearance-reset').click();await page.clock.runFor(60);
   assert.deepEqual(await current(),{glass:true,size:100,weight:400,spacing:-5,font:'inter'});
   await page.locator('#appearance-close').click();
  });

  await check('extreme settings fit phone and iPad sizes without clipped digit canvases',async()=>{
   for(const [width,height]of [[320,600],[768,1024],[1024,768]]){
    await page.setViewportSize({width,height});await open();await setRange('#digit-size',140);await setRange('#digit-weight',800);await setRange('#digit-spacing',24);
    for(const font of await page.locator('#digit-font option').evaluateAll(options=>options.map(option=>option.value))){
     await page.locator('#digit-font').selectOption(font);await page.clock.runFor(60);
     await page.locator('#appearance-close').click();
     for(const seconds of [true,false]){
      await page.locator('#show-seconds').setChecked(seconds,{force:true});await page.clock.runFor(80);
      const detail=await page.evaluate(()=>{
       const rect=document.querySelector('.clock').getBoundingClientRect(),glyphs=[];
       for(const canvas of document.querySelectorAll('.static.top .glass-numeral')){
        if(!canvas.getBoundingClientRect().width)continue;
        const ctx=canvas.getContext('2d'),d=ctx.getImageData(0,0,canvas.width,canvas.height).data;let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
        for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(d[(y*canvas.width+x)*4+3]>20){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
        glyphs.push({w:canvas.width,h:canvas.height,minX,minY,maxX,maxY});
       }
       return {scroll:document.documentElement.scrollWidth,left:rect.left,right:rect.right,glyphs};
      });
      assert.ok(detail.scroll<=width,`${width} ${font} seconds ${seconds}: horizontal overflow ${detail.scroll}`);
      assert.ok(detail.left>=-1&&detail.right<=width+1,`${width} ${font}: clock outside viewport`);
      for(const glyph of detail.glyphs){assert.ok(glyph.maxX>=glyph.minX,'empty glass glyph');assert.ok(glyph.minX>0&&glyph.maxX<glyph.w-1&&glyph.minY>0&&glyph.maxY<glyph.h-1,`${width} ${font} seconds ${seconds}: clipped ${JSON.stringify(glyph)}`);}
     }
     await open();
    }
    await page.locator('#appearance-close').click();
   }
   await page.setViewportSize({width:1440,height:960});await page.locator('#show-seconds').check();await open();await page.locator('#appearance-reset').click();await page.clock.runFor(80);await page.locator('#appearance-close').click();
  });

  await check('native and fallback fullscreen lock every appearance control and preserve companion interaction',async()=>{
   const before=await current();
   for(const fallback of [false,true]){
    if(fallback)await page.evaluate(()=>{document.documentElement.requestFullscreen=undefined;document.documentElement.webkitRequestFullscreen=undefined;});
    await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.body.classList.contains('is-fullscreen'));await page.clock.runFor(80);
    assert.equal(await page.locator('.editor-only').evaluateAll(els=>els.every(el=>el.inert&&getComputedStyle(el).display==='none')),true);
    await page.locator('#use-glass').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});
    for(const [id,value]of [['#digit-size',70],['#digit-weight',800],['#digit-spacing',24]])await setRange(id,value);
    await page.locator('#digit-font').evaluate(el=>{el.value='serif';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.locator('[data-clock-preset="rounded"]').evaluate(el=>el.click());await page.locator('#appearance-reset').evaluate(el=>el.click());await page.locator('#appearance-toggle').evaluate(el=>el.click());
    assert.deepEqual(await current(),before);assert.equal(await page.locator('#appearance-panel').isHidden(),true);
    await page.locator('.stick-hit').tap();assert.equal(await page.locator('.stick-world').getAttribute('data-mode'),'wave');
    await page.touchscreen.tap(20,20);await page.touchscreen.tap(20,20);await page.waitForFunction(()=>!document.body.classList.contains('is-fullscreen'));
   }
  });

  await check('invalid saved appearance fields return to valid defaults',async()=>{
   await page.evaluate(()=>localStorage.setItem('floating-light-clock',JSON.stringify({glass:'no',size:10000,weight:-10,spacing:'18px',font:'unknown font',seconds:true,companion:true})));
   await page.reload();await page.waitForFunction(()=>document.body.dataset.phase==='day');await page.clock.runFor(80);
   assert.deepEqual(await current(),{glass:true,size:100,weight:400,spacing:-5,font:'inter'});
  });
  await check('no appearance browser script errors',async()=>assert.deepEqual(errors,[]));


  const report={passed:results.filter(r=>r.passed).length,total:results.length,results,note:'Localhost Chromium with deterministic weather and touch input; no claim of Safari hardware verification.'};
  fs.writeFileSync(path.join(__dirname,'appearance-check-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=results.some(r=>!r.passed)?1:0;
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
