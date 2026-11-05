// Run: node work/check-clock-light-interaction.cjs, serving outputs on localhost:8765.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:768},timezoneId:'Asia/Shanghai',hasTouch:true});
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await context.addInitScript(()=>{
   window.__activity=[];window.__uniforms={};const names=new WeakMap();
   const get=WebGLRenderingContext.prototype.getUniformLocation,set=WebGLRenderingContext.prototype.uniform3f;
   WebGLRenderingContext.prototype.getUniformLocation=function(program,name){const value=get.call(this,program,name);if(value)names.set(value,name);return value;};
   WebGLRenderingContext.prototype.uniform3f=function(location,...values){window.__uniforms[names.get(location)]=values;return set.call(this,location,...values);};
   document.addEventListener('companionactivity',event=>{window.__activity.push(event.detail);if(window.__activity.length>100)window.__activity.shift();});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-16T12:34:00+08:00')});await page.clock.pauseAt(new Date('2026-10-16T12:34:00.001+08:00'));
  await page.goto('http://127.0.0.1:8765/glass-clock.html');await page.clock.runFor(100);
  await page.locator('#appearance-toggle').tap();await page.locator('#companion-size').fill('180');await page.locator('#companion-size').dispatchEvent('input');await page.locator('#appearance-close').tap();
  const select=async name=>{await page.locator('#weather-browse').tap();await page.locator(`[data-preview="${name}"].preview-option`).tap();await page.locator('#gallery-close').tap();await page.clock.runFor(1200);};
  const drag=async(x,y)=>{const r=await page.locator('.stick-hit').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(x,y,{steps:10});await page.clock.runFor(120);await page.mouse.up();await page.clock.runFor(120);};
  const occlusion=()=>page.evaluate(()=>{
   const c=document.querySelector('.stick-canvas'),r=c.getBoundingClientRect(),d=c.width/r.width,ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height).data;const regions=[];
   const measure=document.createElement('canvas').getContext('2d');
   for(const tile of document.querySelectorAll('.tile')){const rect=tile.getBoundingClientRect();if(!rect.width)continue;const span=tile.querySelector('.static.top .numeral'),style=getComputedStyle(span);measure.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;const m=measure.measureText(span.textContent),h=m.actualBoundingBoxAscent+m.actualBoundingBoxDescent;const shift=document.body.classList.contains('plain-digits')&&Number.isFinite(m.fontBoundingBoxAscent)?(m.fontBoundingBoxAscent-m.fontBoundingBoxDescent-m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)/2:0;regions.push({left:rect.left,top:rect.top+(rect.height-h)/2+shift,right:rect.right,bottom:rect.top+(rect.height+h)/2+shift});}
   for(const el of document.querySelectorAll('.intro,.colon')){const a=el.getBoundingClientRect();regions.push(a);}
   let ink=0;for(const a of regions){for(let y=Math.max(0,Math.ceil((a.top-r.top)*d));y<Math.min(c.height,Math.floor((a.bottom-r.top)*d));y++)for(let x=Math.max(0,Math.ceil((a.left-r.left)*d));x<Math.min(c.width,Math.floor((a.right-r.left)*d));x++)if(data[(y*c.width+x)*4+3]>8)ink++;}
   return {ink,x:Number(document.querySelector('.stick-world').dataset.x),y:Number(document.querySelector('.stick-world').dataset.y),width:innerWidth,height:innerHeight,count:document.querySelectorAll('.stick-canvas').length};
  });
  await select('sunrise');await drag(512,650);
  const dawn=await page.evaluate(()=>({x:Number(document.querySelector('.stick-world').dataset.shadowX),cast:Number.parseFloat(document.querySelector('.tile').style.getPropertyValue('--cast-x'))}));
  await select('sunset');
  const dusk=await page.evaluate(()=>({x:Number(document.querySelector('.stick-world').dataset.shadowX),cast:Number.parseFloat(document.querySelector('.tile').style.getPropertyValue('--cast-x'))}));
  assert.ok(dawn.x>0&&dusk.x<0,'character shadow did not reverse with sunlight');assert.ok(dawn.cast>0&&dusk.cast<0,'digit shadow did not reverse with sunlight');
  await select('night');const moon=await page.evaluate(()=>({x:Number(document.querySelector('.stick-world').dataset.shadowX),cast:Number.parseFloat(document.querySelector('.tile').style.getPropertyValue('--cast-x'))}));assert.ok(moon.x<0&&moon.cast<0,'moon source not shared by figure and digits');
  await select('noon');
  for(const [width,height]of [[1024,768],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});await page.clock.runFor(120);await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.reject(new Error('fallback'));});await page.locator('#fullscreen').tap();await page.clock.runFor(120);
   for(const [x,y]of [[.1,.3],[.9,.3],[.1,.9],[.9,.9],[.5,.52]]){await drag(width*x,height*y);const check=await occlusion();assert.equal(check.ink,0,`${width} actor ink obscures time/date`);assert.equal(check.count,1);assert.ok(check.x>=0&&check.x<=width&&check.y>=0&&check.y<=height);if(y===.9)assert.ok(check.y>height*.7,'character cannot roam lower screen');}
   assert.equal(await page.locator('#day-cycle').isVisible(),false);assert.equal(await page.locator('#companion-size').isVisible(),false);await page.keyboard.press('Escape');await page.clock.runFor(120);
  }
  await page.setViewportSize({width:1024,height:768});await page.clock.runFor(120);
  const tile=await page.locator('.tile').first().boundingBox();await drag(tile.x+tile.width/2,tile.y+tile.height*.15);
  const link=await page.evaluate(()=>({events:window.__activity.length,energy:Math.max(...window.__activity.map(a=>a.energy)),uniform:window.__uniforms.companionPosition,shade:Number(document.querySelector('.tile').style.getPropertyValue('--actor-shade'))}));
  assert.ok(link.events>5&&link.energy>.5,'actual companion gestures not producing activity');assert.ok(link.uniform?.[2]>0,'companion activity not reaching glass shader');assert.ok(link.shade<.999,'companion activity not reaching normal digit shading');
  await page.locator('#use-glass').uncheck();await page.clock.runFor(120);const filter=await page.locator('.tile .static.top .numeral').first().evaluate(el=>getComputedStyle(el).filter);assert.match(filter,/brightness\(0\./,'ordinary digits not applying actor shading');
  await page.screenshot({path:'work/qa-clock-light-interaction.png'});assert.deepEqual(errors,[]);
  const report={passed:true,checks:['sunrise/sunset and moon share directional shadows across figure and digits','180% figure roams all quadrants on iPad landscape/portrait and phone','zero painted character pixels over time/date while traversing','fullscreen hides editing UI','actual gesture activity reaches glass shader and ordinary digit shading'],light:{dawn,dusk,moon},link,note:'Touch-capable Chromium emulation; no physical iPad Safari or Android device verification.'};fs.writeFileSync('work/clock-light-interaction-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
