const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.argv[2]||'http://127.0.0.1:8765/glass-clock.html';
assert.match(url,/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 const reports=[];
 try{for(const viewport of [{width:1024,height:768},{width:768,height:1024},{width:390,height:844}]){
  console.log('START',viewport);const context=await browser.newContext({viewport,hasTouch:true,timezoneId:'Asia/Shanghai'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const fixed=new Date('2026-10-16T12:34:56+08:00');await page.clock.install({time:fixed});await page.clock.pauseAt(new Date(fixed.getTime()+1000));await page.clock.setSystemTime(fixed);
  console.log('CLOCK SET');await page.goto(url);console.log('PAGE');await page.clock.runFor(300);await page.locator('#appearance-toggle').tap();
  await page.locator('#companion-size').evaluate(el=>{el.value='180';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#appearance-close').tap();await page.clock.runFor(150);
  assert.equal(await page.locator('.stick-world').getAttribute('data-scale'),'1.8');console.log('SCALE');
  const pixels=()=>page.locator('.stick-canvas').evaluate(c=>{const {width:w,height:h}=c,d=c.getContext('2d').getImageData(0,0,w,h).data;let minX=w,minY=h,maxX=-1,maxY=-1,n=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>240){n++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return {n,minX,minY,maxX,maxY,w,h};});
  const positions=[];
  for(const [rx,ry] of [[.16,.2],[.84,.2],[.16,.83],[.84,.83]]){
   const box=await page.locator('.stick-hit').boundingBox();const anchor=await page.locator('.stick-world').evaluate(el=>({x:+el.dataset.x,y:+el.dataset.y}));
   const start={x:box.x+box.width/2,y:box.y+box.height/2},target={x:viewport.width*rx-anchor.x+start.x,y:viewport.height*ry-anchor.y+start.y};
   await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:6});
   assert.equal(await page.locator('.stick-world').getAttribute('data-mode'),'drag');
   const ink=await pixels();assert.ok(ink.n>100&&ink.minX>1&&ink.minY>1&&ink.maxX<ink.w-2&&ink.maxY<ink.h-2,'180% figure must remain whole within its transparent canvas');
   const held=await page.locator('.stick-world').evaluate(el=>({x:+el.dataset.x,y:+el.dataset.y}));positions.push(held);console.log('DRAG',held);
   await page.mouse.up();await page.clock.runFor(1800);
  }
  assert.ok(positions.some(p=>p.x<viewport.width*.3)&&positions.some(p=>p.x>viewport.width*.7)&&positions.some(p=>p.y<viewport.height*.35)&&positions.some(p=>p.y>viewport.height*.7),'All four screen areas can be reached');
  const tile=await page.locator('.tile[data-unit="minutes"]').boundingBox(),box=await page.locator('.stick-hit').boundingBox(),anchor=await page.locator('.stick-world').evaluate(el=>({x:+el.dataset.x,y:+el.dataset.y}));
  const sx=box.x+box.width/2,sy=box.y+box.height/2;await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(tile.x+tile.width/2-anchor.x+sx,tile.y+tile.height*.6-anchor.y+sy,{steps:5});
  assert.ok((await pixels()).n>100,'Dragging over a number must not erase the body');await page.mouse.up();for(let step=0;step<120;step++){await page.clock.runFor(100);if(!['jump','walk'].includes(await page.locator('.stick-world').getAttribute('data-mode')))break;}
  const overlap=await page.evaluate(()=>{const el=document.querySelector('.stick-world'),x=+el.dataset.x,y=+el.dataset.y,scale=Math.max(.84,Math.min(1.18,innerWidth/1000))*1.8;return [...document.querySelectorAll('.tile,.intro')].some(el=>{const r=el.getBoundingClientRect();return x>r.left-25*scale&&x<r.right+25*scale&&y>r.top+15&&y<r.bottom+45*scale;});});
  if(overlap){console.log('DEBUG',JSON.stringify(await page.evaluate(()=>({viewport:{w:innerWidth,h:innerHeight},world:{...document.querySelector('.stick-world').dataset},rects:[...document.querySelectorAll('.tile,.intro')].map(e=>({cls:e.className,r:e.getBoundingClientRect().toJSON()}))}))));await page.screenshot({path:path.join(__dirname,'soft-release-debug.png')});}assert.equal(overlap,false,'Release moves back out of the date/time reading area');
  await page.locator('#appearance-toggle').tap();await page.locator('#show-companion').uncheck();assert.equal(await page.locator('.stick-world').isVisible(),false);assert.equal(await page.locator('.stick-hit').isVisible(),false);
  await page.locator('#show-companion').check();await page.locator('#appearance-close').tap();await page.clock.runFor(120);
  await page.locator('#fullscreen').tap();await page.clock.runFor(150);assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),true);
  await page.locator('.stick-hit').tap();assert.equal(await page.locator('.stick-world').getAttribute('data-mode'),'wave');assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('is-fullscreen')),true);
  await page.screenshot({path:path.join(__dirname,`soft-clock-${viewport.width}x${viewport.height}.png`)});
  await page.keyboard.press('Escape');await page.clock.runFor(150);
  await page.evaluate(()=>{document.documentElement.requestFullscreen=undefined;document.documentElement.webkitRequestFullscreen=undefined;});
  await page.locator('#fullscreen').tap();await page.clock.runFor(150);assert.equal(await page.evaluate(()=>document.fullscreenElement),null);
  await page.locator('.stick-hit').tap();assert.equal(await page.locator('.stick-world').getAttribute('data-mode'),'wave');assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('is-fullscreen')),true);
  assert.equal(await page.locator('.stick-canvas').count(),1);assert.deepEqual(errors,[]);
  console.log('PASS viewport',viewport.width,viewport.height);reports.push({viewport,scale:1.8,positions,nativeAndFallbackTouch:true,noClipping:true,hideCleanly:true,errors});await context.close();
 }
 fs.writeFileSync(path.join(__dirname,'soft-companion-integration-results.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
