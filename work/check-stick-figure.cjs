// Run: node work/check-stick-figure.cjs — isolated iPad-sized browser checks, no server or network required.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const script=fs.readFileSync(path.join(__dirname,'stick-figure.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'stick-figure.css'),'utf8');
const markup=`<style>body{margin:0;background:#000;color:#fff;font-family:Arial}.clock{position:absolute;top:42%;left:10%;width:80%;display:flex;gap:30px}.tile{position:relative;width:26%;height:270px}.numeral{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 150px/1 Arial;letter-spacing:-8px}button#control{position:absolute;bottom:80px;left:40px}</style><div class="clock"><div class="tile" data-unit="hours"><div class="static top"><span class="numeral">12</span></div></div><div class="tile" data-unit="minutes"><div class="static top"><span class="numeral">34</span></div></div><div class="tile" data-unit="seconds"><div class="static top"><span class="numeral">56</span></div></div></div><button id="control">控制</button>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 const context=await browser.newContext({viewport:{width:1024,height:1366},hasTouch:true,isMobile:true,deviceScaleFactor:2});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.setContent(markup);await page.addStyleTag({content:css});await page.addScriptTag({content:script+';window.pet=createStickFigure();window.pet.setState({phase:"day",condition:"clear"});'});
  assert.equal(await page.locator('.stick-world').count(),1);
  assert.equal(await page.getByRole('button',{name:'和火柴人互动'}).count(),1);
  await page.evaluate(()=>createStickFigure());assert.equal(await page.locator('.stick-canvas').count(),1);
  let box=await page.locator('.stick-hit').boundingBox();assert.ok(box.x>0&&box.y>0&&box.x+box.width<=1024);assert.ok(box.width>=44&&box.height>=44);
  await page.getByRole('button',{name:'和火柴人互动'}).tap();assert.equal(await page.locator('.stick-world').getAttribute('data-mode'),'wave');
  const checkMode=async mode=>assert.equal(await page.locator('.stick-world').getAttribute('data-mode'),mode);
  await page.evaluate(()=>{pet.setState({phase:'night',condition:'clear'});});
  // An interaction keeps it awake briefly; a fresh untouched nighttime entity sleeps immediately.
  await page.evaluate(()=>{pet.destroy();pet=createStickFigure();pet.setState({phase:'night',condition:'rain'});});await checkMode('sleep');
  const sleep=await page.locator('.stick-canvas').evaluate(c=>c.toDataURL());
  await page.getByRole('button',{name:'和火柴人互动'}).tap();await checkMode('wave');
  await page.evaluate(()=>{document.body.classList.add('is-fullscreen');window.doubles=0;document.addEventListener('dblclick',()=>window.doubles++);});
  await page.getByRole('button',{name:'和火柴人互动'}).dblclick();assert.equal(await page.evaluate(()=>window.doubles),0);
  const touch=await context.newCDPSession(page);
  box=await page.locator('.stick-hit').boundingBox();
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+42,y:box.y+48}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:700,y:420}]});
  await checkMode('drag');
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(1200);box=await page.locator('.stick-hit').boundingBox();assert.ok(box.x>500);
  box=await page.locator('.stick-hit').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(800,500,{steps:6});
  await checkMode('drag');await page.mouse.up();assert.equal(await page.locator('.stick-world').getAttribute('data-mode'),'jump');
  await page.waitForTimeout(1200);box=await page.locator('.stick-hit').boundingBox();assert.ok(box.x>500);assert.equal(await page.locator('.stick-canvas').count(),1);
  await page.mouse.move(box.x+42,box.y+48);await page.mouse.down();await page.mouse.move(700,1100,{steps:6});
  const clearance=await page.evaluate(()=>{
    const tile=document.querySelector('.tile'),span=tile.querySelector('.numeral'),style=getComputedStyle(span),ctx=document.createElement('canvas').getContext('2d');
    ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;const m=ctx.measureText(span.textContent),rect=tile.getBoundingClientRect();
    const crown=rect.top+(rect.height-m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2;
    const canvas=document.querySelector('.stick-canvas'),paint=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let bottom=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(paint[(y*canvas.width+x)*4+3]>2)bottom=y;
    return crown-(canvas.getBoundingClientRect().top+bottom*160/canvas.height);
  });assert.ok(clearance>0,'downward dragging must keep every painted pixel above the digits');await page.mouse.up();
  await page.evaluate(()=>{pet.setState({phase:'day',condition:'snow'});});
  assert.equal(await page.locator('.stick-world').getAttribute('data-condition'),'snow');
  const snow=await page.locator('.stick-canvas').evaluate(c=>c.toDataURL());assert.notEqual(snow,sleep);
  await page.evaluate(()=>{pet.setState({phase:'day',condition:'storm'});});await checkMode('startle');
  await page.evaluate(()=>{window.controls=0;document.querySelector('#control').onclick=()=>window.controls++;});await page.click('#control');assert.equal(await page.evaluate(()=>controls),1);
  await page.setViewportSize({width:1366,height:1024});await page.evaluate(()=>pet.refresh());box=await page.locator('.stick-hit').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=1366&&box.y>0);
  await page.evaluate(()=>{pet.onFlip(document.querySelector('.stick-world').dataset.platform<2?'hours':'minutes');pet.setEnabled(false);});assert.equal(await page.locator('.stick-world').isVisible(),false);
  await page.evaluate(()=>pet.setEnabled(true));assert.equal(await page.locator('.stick-world').isVisible(),true);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);await page.evaluate(()=>{pet.setState({phase:'night',condition:'clear'});});await checkMode('sleep');
  const still=await page.locator('.stick-canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(150);assert.equal(await page.locator('.stick-canvas').evaluate(c=>c.toDataURL()),still);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.clock.install();
  await page.evaluate(()=>{pet.destroy();pet=createStickFigure();pet.setState({phase:'night',condition:'clear'});});
  const modes=[],pictures=[];
  for(const ms of [0,3000,3800,2200,6300]){
    if(ms)await page.clock.runFor(ms);
    await page.evaluate(()=>pet.setState({phase:'night',condition:'clear'}));
    modes.push(await page.locator('.stick-world').getAttribute('data-mode'));
    pictures.push(await page.locator('.stick-canvas').evaluate(c=>c.toDataURL()));
  }
  assert.ok(modes.includes('sleep-turn')&&modes.includes('stretch'),'night must include rolling and stretching within 16 seconds: '+modes.join(','));
  assert.ok(new Set(pictures).size>=4,'visible nighttime breathing/poses must keep changing');
  await page.evaluate(()=>pet.destroy());assert.equal(await page.locator('.stick-world').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS single entity, glyph ledges, iPad touch, drag landing, zero painted overlap with digits, night breathing/roll/stretch/wake, rain/snow/storm, fullscreen gesture isolation, resize, control passthrough, preference, cleanup');
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
