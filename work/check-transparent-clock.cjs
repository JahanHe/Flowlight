// Run: node work/check-transparent-clock.cjs (outputs served on localhost:8765).
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PNG}=require('pngjs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},timezoneId:'Asia/Shanghai'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(fs.readFileSync('outputs/glass-clock.html','utf8').replace(/<script>[\s\S]*?<\/script>/g,''));
  await page.addStyleTag({content:'.tile,.half{animation:none!important}.stick-world{display:none!important}'});
  await page.addScriptTag({content:fs.readFileSync('work/weather-scene.js','utf8')+'\n'+fs.readFileSync('work/glass-digits.js','utf8')});
  await page.evaluate(async()=>{
   await document.fonts.ready;
   window.scene=createWeatherScene(document.querySelector('#weather-canvas'),true);
   scene.setState({phase:'day',condition:'clear',cloudCover:.1,intensity:0,sunProgress:.4,sunAltitude:60,moonVisible:false});
   window.glass=createGlassDigits(document.querySelector('#weather-canvas'));glass.draw();
  });
  const styleReport=await page.evaluate(()=>['.clock','.intro','.date-line','.tile','.static.top','.static.bottom','.flap'].map(selector=>{
   const style=getComputedStyle(document.querySelector(selector));return {selector,background:style.backgroundColor,image:style.backgroundImage,backdrop:style.backdropFilter};
  }));
  for(const result of styleReport){assert.equal(result.background,'rgba(0, 0, 0, 0)',`${result.selector}: opaque background`);assert.equal(result.image,'none');assert.equal(result.backdrop,'none');}
  const glyphReport=await page.evaluate(()=>[...document.querySelectorAll('.glass-numeral')].filter(c=>c.width>0&&c.height>0).map(canvas=>{
   const {width:w,height:h}=canvas,p=canvas.getContext('2d').getImageData(0,0,w,h).data;
   let cornerInk=0,ink=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const alpha=p[(y*w+x)*4+3];if(alpha)ink++;if((x<4||x>=w-4)&&(y<4||y>=h-4)&&alpha)cornerInk++;}
   return {cornerInk,ink};
  }));
  assert.ok(glyphReport.some(r=>r.ink>500),'glyph renderer is empty');assert.ok(glyphReport.every(r=>r.cornerInk===0),'glass canvas corners contain material');
  const regions=await page.locator('.tile').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));
  const baseline=PNG.sync.read(await page.screenshot());
  await page.addStyleTag({content:'.clock,.intro{visibility:hidden!important}'});
  const hidden=PNG.sync.read(await page.screenshot());
  let cornerDifference=0;for(const r of regions)for(const [x,y]of [[r.left+3,r.top+3],[r.right-4,r.top+3],[r.left+3,r.bottom-4],[r.right-4,r.bottom-4]]){
   const i=(Math.floor(y)*baseline.width+Math.floor(x))*4;for(let c=0;c<3;c++)cornerDifference=Math.max(cornerDifference,Math.abs(baseline.data[i+c]-hidden.data[i+c]));
  }
  assert.ok(cornerDifference<=2,`clock rectangle changes background at transparent corners: ${cornerDifference}`);
  await page.addStyleTag({content:'.clock,.intro{visibility:visible!important}'});
  await page.locator('.tile').evaluateAll(els=>els.forEach(el=>el.classList.add('flipping')));await page.evaluate(()=>glass.draw());
  const flipStyles=await page.locator('.flap').evaluateAll(els=>els.map(el=>({background:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage})));
  assert.ok(flipStyles.every(s=>s.background==='rgba(0, 0, 0, 0)'&&s.image==='none'),'flip faces have rectangular paint');
  await page.screenshot({path:'work/qa-transparent-clock.png'});
  const sceneUnmasked=await page.evaluate(()=>{
   const canvas=document.querySelector('#weather-canvas'),before=canvas.toDataURL();
   scene.setClockBounds?.({left:150,top:200,width:700,height:250});scene.setState({});
   return before===canvas.toDataURL();
  });assert.ok(sceneUnmasked,'clock bounds dim the background');

  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.clock.install({time:new Date('2026-10-16T15:00:00+08:00')});
  await page.clock.pauseAt(new Date('2026-10-16T15:00:00.001+08:00'));
  for(const [width,height]of [[1024,768],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:8765/glass-clock.html');await page.clock.runFor(150);
   const button=page.locator('#day-cycle');assert.ok(await button.isVisible());const r=await button.boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=width&&r.y+r.height<=height,`${width}: day preview is outside first screen`);
   const caption=await button.evaluate(el=>el.parentElement.innerText);assert.match(caption,/60\s*秒|一分钟|1\s*分钟/,'preview must explain the one-minute cycle visibly');
  }
  await page.setViewportSize({width:1024,height:768});await page.clock.runFor(100);
  await page.locator('#day-cycle').click();await page.clock.runFor(1200);
  const before=await page.evaluate(()=>Array.from(document.querySelector('#weather-canvas').getContext('2d').getImageData(0,0,1024,768).data));
  const statusBefore=await page.locator('#day-cycle-status').innerText();
  await page.clock.runFor(5000);
  const difference=await page.evaluate(before=>{
   const after=document.querySelector('#weather-canvas').getContext('2d').getImageData(0,0,1024,768).data;let changed=0,total=0;
   for(let i=0;i<after.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(after[i+c]-before[i+c]);total+=delta;if(delta>12)changed++;}
   return {changed,mean:total/(1024*768*3)};
  },before);
  assert.ok(difference.changed>20000&&difference.mean>1.5,'five seconds of day preview is not visibly advancing');
  assert.notEqual(await page.locator('#day-cycle-status').innerText(),statusBefore,'preview clock progress is static');
  await page.screenshot({path:'work/qa-day-cycle-visible.png'});
  assert.deepEqual(errors,[]);
  const report={styleReport,glyphCornersTransparent:true,cornerDifference,flipFacesTransparent:true,sceneUnmasked,dayCycleVisible:true,fiveSecondWeatherDifference:difference,errors};
  fs.writeFileSync('work/transparent-clock-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
