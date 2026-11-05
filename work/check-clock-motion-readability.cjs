// Targeted regression for unobstructed digits and inline editing panels.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {chromium}=require('playwright');
const url=process.argv[2]||'http://127.0.0.1:8765/glass-clock.html';assert.match(url,/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//);
const time=Date.parse('2026-10-16T12:34:56+08:00'),days=Array.from({length:4},(_,i)=>Date.parse(`2026-10-${15+i}T00:00:00+08:00`)/1000);
const fixture={current:{time:time/1000,weather_code:0,is_day:1,cloud_cover:0,precipitation:0,wind_speed_10m:12},daily:{time:days,sunrise:days.map(x=>x+21600),sunset:days.map(x=>x+64800),moonrise:days.map(x=>x+61200),moonset:days.map(x=>x+18000),moon_phase:days.map(()=>.3)}};
const results=[],errors=[];
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(error){results.push({name,passed:false,error:error.message});console.error('FAIL',name,error.stack);}}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:768},timezoneId:'Asia/Shanghai',hasTouch:true});
  await context.route('**/*',route=>{const target=new URL(route.request().url());if(target.origin===new URL(url).origin)return route.continue();if(target.hostname==='api.open-meteo.com')return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)});return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date(time)});await page.clock.pauseAt(new Date(time+1000));await page.clock.setSystemTime(new Date(time));
  await page.goto(url);await page.waitForFunction(()=>document.body.dataset.phase==='day');await page.clock.runFor(100);

  await page.clock.setFixedTime(new Date(time));
  const hash=selector=>page.locator(selector).evaluate(canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let value=2166136261;for(let i=0;i<data.length;i+=37)value=Math.imul(value^data[i],16777619);return value>>>0;});
  await check('all 16 weather scenes animate while wall-clock time is fixed',async()=>{
   await page.locator('#weather-browse').click();
   const ids=await page.locator('.preview-option').evaluateAll(els=>els.map(el=>el.dataset.preview));
   assert.equal(ids.length,16);
   for(const id of ids){await page.locator(`.preview-option[data-preview="${id}"]`).click();await page.clock.runFor(50);const before=await hash('#weather-canvas');await page.clock.runFor(240);assert.notEqual(await hash('#weather-canvas'),before,`${id} weather is static`);}
   await page.locator('.preview-option[data-preview="night"]').click();await page.locator('#gallery-close').click();await page.clock.runFor(60);
   const before=await hash('.stick-canvas');await page.clock.runFor(800);assert.notEqual(await hash('.stick-canvas'),before,'night companion has no breathing motion');
  });
  const occlusion=()=>page.evaluate(()=>{
   const actor=document.querySelector('.stick-canvas'),a=actor.getBoundingClientRect(),ad=actor.getContext('2d').getImageData(0,0,actor.width,actor.height).data;
   const glyphs=[...document.querySelectorAll('.static.top .glass-numeral')].filter(canvas=>canvas.getBoundingClientRect().width).map(canvas=>({rect:canvas.getBoundingClientRect(),width:canvas.width,height:canvas.height,data:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data}));
   let intersections=0,ink=0;
   for(let y=0;y<actor.height;y++)for(let x=0;x<actor.width;x++){
    if(ad[(y*actor.width+x)*4+3]<160)continue;ink++;
    const px=a.left+(x+.5)*a.width/actor.width,py=a.top+(y+.5)*a.height/actor.height;
    for(const glyph of glyphs){const r=glyph.rect;if(px<r.left||px>=r.right||py<r.top||py>=r.bottom)continue;const gx=Math.floor((px-r.left)/r.width*glyph.width),gy=Math.floor((py-r.top)/r.height*glyph.height);if(glyph.data[(gy*glyph.width+gx)*4+3]>60)intersections++;}
   }
   return {intersections,ink};
  });
  await check('visible companion ink never covers glyphs, including dragging into the digits',async()=>{
   for(const id of ['noon','rain','night']){
    await page.locator('#weather-browse').click();await page.locator(`.preview-option[data-preview="${id}"]`).click();await page.locator('#gallery-close').click();await page.clock.runFor(80);
    let coverage=await occlusion();assert.ok(coverage.ink>0);assert.equal(coverage.intersections,0,`${id} visible ink overlaps glyph ${JSON.stringify(coverage)}`);
    const target=await page.locator('[data-unit="minutes"]').boundingBox(),actor=await page.locator('.stick-hit').boundingBox();
    await page.mouse.move(actor.x+actor.width/2,actor.y+actor.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:4});
    coverage=await occlusion();assert.equal(coverage.intersections,0,`${id} dragging covers glyph ${JSON.stringify(coverage)}`);await page.mouse.up();
   }
  });
  await check('no final animation script errors',async()=>assert.deepEqual(errors,[]));
  const report={passed:results.filter(r=>r.passed).length,total:results.length,results};fs.writeFileSync(path.join(__dirname,'motion-readability-check-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=results.some(r=>!r.passed)?1:0;
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
