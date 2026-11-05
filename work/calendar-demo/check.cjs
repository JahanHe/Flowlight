const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']}),result=[];
 try{for(const [name,viewport] of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,timezoneId:'Asia/Shanghai'}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await page.context().setOffline(true);
  // Observe actual cached cloud draws, without adding instrumentation to the deliverable.
  await page.addInitScript(()=>{
   const p=CanvasRenderingContext2D.prototype,draw=p.drawImage,clear=p.clearRect;window.demoCloudDraws=[];
   p.clearRect=function(...args){if(this.canvas.id==='weather-canvas')window.demoCloudDraws=[];return clear.apply(this,args);};
   p.drawImage=function(source,...args){
    if(this.canvas.id==='weather-canvas'&&Number.isInteger(source.clockCloudShape)&&args.length===4&&this.globalAlpha>.04&&this.globalCompositeOperation!=='screen'){
     const [x,y,width,height]=args,area=Math.max(0,Math.min(innerWidth,x+width)-Math.max(0,x))*Math.max(0,Math.min(innerHeight,y+height)-Math.max(0,y));
     if(area>innerWidth*innerHeight*.005){
      const previous=window.demoCloudDraws.find(c=>c.shape===source.clockCloudShape&&c.rect.every((n,i)=>n===args[i]));
      if(previous)previous.alpha=Math.max(previous.alpha,this.globalAlpha);
      else window.demoCloudDraws.push({rect:args,shape:source.clockCloudShape,source:source.clockCloudSource,alpha:this.globalAlpha});
     }
    }
    return draw.call(this,source,...args);
   };
  });
  await page.clock.setFixedTime(new Date('2026-11-04T18:36:00+08:00'));
  await page.goto(pathToFileURL(path.resolve('outputs/浮光-日历金句-本地演示.html')).href);await page.waitForFunction(()=>window.clockAppReady&&document.querySelector('#weather-canvas').clockCloudAtlasReady);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
  assert.equal(await page.locator('#demo-month').textContent(),'2026年 11月');assert.equal(await page.locator('.demo-day').count(),30);
  assert.equal(await page.locator('.demo-stage-label').count(),0);assert(!(await page.locator('body').innerText()).includes('此刻 · 每日一页'));
  assert.equal(await page.locator('#digit-font').inputValue(),'manrope');assert(!(await page.locator('.demo-quote p').evaluate(e=>getComputedStyle(e).fontFamily)).includes('Songti'));
  assert(await page.locator('#demo-wide-sky').isChecked());assert(await page.evaluate(()=>window.calendarDemoWideSky));
  await page.screenshot({path:`work/calendar-demo/${name}-today.png`,fullPage:true});
  await page.locator('[data-date="2026-11-07"]').click();assert((await page.locator('#date').textContent()).includes('11月7日'));assert((await page.locator('.demo-dayline').textContent()).includes('立冬'));
  await page.locator('[data-date="2026-09-25"]').click();assert((await page.locator('.demo-dayline').textContent()).includes('中秋节'));assert((await page.locator('#demo-events').textContent()).includes('八月十五'));
  assert((await page.locator('.demo-quote p').textContent()).includes('海上生明月'));await page.locator('[data-tab="quote"]').click();await page.locator('#demo-quote-size').fill('28');assert.equal(await page.locator('.demo-quote p').evaluate(e=>getComputedStyle(e).fontSize),'28px');const q=await page.locator('.demo-quote p').textContent();await page.locator('#demo-change-quote').click();assert.notEqual(await page.locator('.demo-quote p').textContent(),q);
  await page.locator('#demo-quote-kind').selectOption('custom');await page.locator('#demo-custom').fill('把时间留给值得的事情。');assert.equal(await page.locator('.demo-quote p').textContent(),'把时间留给值得的事情。');
  await page.locator('[data-tab="display"]').click();await page.locator('[data-mode="clock"]').click();assert(await page.locator('.demo-dayline').isHidden());assert(await page.locator('.demo-quote').isHidden());await page.locator('[data-mode="quote"]').click();await page.locator('#demo-sky').selectOption('night');await page.waitForTimeout(1500);
  const masks=()=>page.locator('#weather-canvas,#sky-detail-canvas,#weather-foreground').evaluateAll(es=>es.map(e=>({id:e.id,mask:getComputedStyle(e).maskImage})));
  assert((await masks()).every(x=>x.mask==='none'));
  await page.locator('#demo-wide-sky').uncheck();assert.equal(await page.evaluate(()=>window.calendarDemoWideSky),false);assert((await masks()).every(x=>x.mask.includes('radial-gradient')));
  await page.locator('#demo-wide-sky').check();assert((await masks()).every(x=>x.mask==='none'));
  await page.locator('#digit-font').selectOption('nunito');assert((await page.locator('.clock').evaluate(e=>getComputedStyle(e).getPropertyValue('--clock-font'))).includes('Nunito'));await page.locator('#digit-font').selectOption('manrope');
  const edgePixel=()=>page.locator('#weather-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(2,2,1,1).data));
  await page.locator('#fullscreen').click();await page.waitForTimeout(600);assert(await page.locator('.control-panel').isHidden());await page.screenshot({path:`work/calendar-demo/${name}-fullscreen.png`});
  const nightCorner=await edgePixel();assert(nightCorner[2]>4,JSON.stringify(nightCorner));
  const geometry=await page.evaluate(()=>{const s=document.querySelector('#clock-stage').getBoundingClientRect();return [...document.querySelectorAll('.intro,.clock,.demo-quote')].filter(x=>x.getBoundingClientRect().height).map(x=>{const r=x.getBoundingClientRect();return {name:x.className,left:r.left,top:r.top,right:r.right,bottom:r.bottom,inScreen:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1};});});assert(geometry.every(x=>x.inScreen),JSON.stringify(geometry));
  await page.keyboard.press('Escape');await page.waitForTimeout(250);if(await page.locator('.control-panel').isHidden()){await page.locator('#clock-stage').dblclick({position:{x:20,y:20}});await page.waitForTimeout(250);}assert(await page.locator('.control-panel').isVisible());
  await page.locator('#demo-sky').selectOption('noon');await page.waitForTimeout(1600);const dayCorner=await edgePixel();assert(dayCorner[2]>30,JSON.stringify(dayCorner));await page.screenshot({path:`work/calendar-demo/${name}-daylight.png`,fullPage:true});
  await page.locator('#demo-wide-sky').uncheck();await page.waitForTimeout(400);const maskedCorner=await edgePixel();assert(maskedCorner[2]<dayCorner[2]-10,JSON.stringify({maskedCorner,dayCorner}));assert((await masks()).every(x=>x.mask.includes('radial-gradient')));await page.locator('#demo-wide-sky').check();
  await page.locator('#demo-motion-settings > summary').click();await page.locator('[data-preview="cloudy"]').click();await page.waitForTimeout(2500);
  await page.locator('#fullscreen').click();await page.waitForTimeout(700);await page.screenshot({path:`work/calendar-demo/${name}-layered-clouds.png`});
  const cloudsBefore=await page.evaluate(()=>window.demoCloudDraws);await page.waitForTimeout(1200);const cloudsAfter=await page.evaluate(()=>window.demoCloudDraws);
  assert(new Set([...cloudsBefore,...cloudsAfter].map(c=>c.shape)).size>=3,'cloudy sky visibly uses at least three silhouettes across the motion sample');
  assert([...cloudsBefore,...cloudsAfter].every(c=>c.source==='atlas'),'rendered clouds use the decoded atlas, not stale fallback sprites');
  const widths=cloudsBefore.map(c=>c.rect[2]);assert(Math.max(...widths)>=viewport.width*.55,'a broad main cloud is visible');assert(Math.max(...widths)-Math.min(...widths)>=viewport.width*.12,'visible near and far layers differ in size');
  assert(cloudsBefore.some(c=>cloudsAfter.some(next=>next.shape===c.shape&&Math.abs(next.rect[2]-c.rect[2])<c.rect[2]*.02&&Math.abs(next.rect[1]-c.rect[1])<viewport.height*.02&&Math.abs(next.rect[0]-c.rect[0])>1&&Math.abs(next.rect[0]-c.rect[0])<viewport.width*.15)),'the same visible cloud continues to drift');
  await page.keyboard.press('Escape');await page.waitForTimeout(250);if(await page.locator('.control-panel').isHidden())await page.locator('#clock-stage').dblclick({position:{x:20,y:20}});
  await page.locator('[data-tab="calendar"]').click();await page.locator('#demo-today').click();assert.equal(await page.evaluate(()=>window.calendarDemoDate),null);assert((await page.locator('#date').textContent()).includes('11月4日'));assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');result.push({name,errors,requests,geometry,nightCorner,dayCorner,maskedCorner,masks:await masks()});await page.close();
 }
 fs.writeFileSync('work/calendar-demo/check-results.json',JSON.stringify({pass:true,result},null,2));console.log('PASS: offline desktop/phone, dates, quotes, fonts, full-sky day/night, mask round trip, fullscreen');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
