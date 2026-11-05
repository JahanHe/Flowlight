// Run: node work/check-stick-volume.cjs. Isolated development page, no network or user browser access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
let source=fs.readFileSync(path.join(__dirname,'stick-figure.js'),'utf8');
const marker='const api={setState,refresh,onFlip,setEnabled,destroy};';assert.ok(source.includes(marker));
source=source.replace(marker,`const api={setState,refresh,onFlip,setEnabled,destroy,
 forcePose(next){motion=null;pose(next,100);draw();},advance(dt){update(dt);draw();return structuredClone(renderedPose);},
 point(px,py){motion=null;x=px;y=py;draw();},joints(){return structuredClone(renderedPose);},
 read(){return {x,y,size,scale,mode,light,elapsed,protectedRects};}
};`);
const markup='<style>body{margin:0;background:radial-gradient(ellipse at 60% 40%,#223f58,black 70%);color:#f6f8fa;font-family:Arial}.intro{position:absolute;top:220px;left:390px;width:240px;text-align:center}.clock{position:absolute;top:35%;left:10%;width:80%;display:flex;gap:20px}.tile{position:relative;width:28%;height:270px}.numeral{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 150px/1 Arial;letter-spacing:-8px}button#control{position:absolute;bottom:80px;left:40px}</style><div class="intro">2026 年 10 月 16 日 星期五</div><div class="clock"><div class="tile" data-unit="hours"><div class="static top"><span class="numeral">12</span></div></div><div class="tile" data-unit="minutes"><div class="static top"><span class="numeral">34</span></div></div><div class="tile" data-unit="seconds"><div class="static top"><span class="numeral">56</span></div></div></div><button id="control">控制</button>';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366},hasTouch:true,deviceScaleFactor:2});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(markup);await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'stick-figure.css'),'utf8')});
  await page.addScriptTag({content:'window.requestAnimationFrame=()=>1;window.events=[];document.addEventListener("companionactivity",e=>events.push(e.detail));'+source+';window.pet=createStickFigure();pet.setState({phase:"day",condition:"clear"});'});
  const result=await page.evaluate(()=>{
   createStickFigure();const states=['stand','sit','walk','tap','jump','drag','wave','startle','sleep','sleep-turn','stretch','bored','curious','mischief','dance'],results=[];
   const diff=(a,b)=>Math.max(...Object.keys(a).flatMap(k=>a[k].map((n,i)=>Math.abs(n-b[k][i]))));
   for(const mode of states){const previous=pet.joints();pet.forcePose(mode);const immediate=pet.joints();let last=immediate,max=0;for(let i=0;i<30;i++){const next=pet.advance(1/30);max=Math.max(max,diff(last,next));last=next;}const before=pet.joints();for(let i=0;i<24;i++)pet.advance(1/30);results.push({mode,jump:diff(previous,immediate),max,movement:diff(before,pet.joints())});}
   pet.setScale(1.8);pet.point(840,1100);pet.forcePose('stand');for(let i=0;i<20;i++)pet.advance(1/30);
   pet.setLight({x:0,y:0,rgb:'255,255,255',strength:.9,elevation:35,isDay:true});pet.advance(.1);
   const c=document.querySelector('.stick-canvas'),first=c.toDataURL(),right=+document.querySelector('.stick-world').dataset.shadowX;
   pet.setLight({x:1024,y:100,rgb:'179,207,255',strength:.6,elevation:25,isDay:false});pet.advance(.1);
   const left=+document.querySelector('.stick-world').dataset.shadowX,second=c.toDataURL();
   pet.setScale(99);const high=pet.read().scale;pet.setScale(-10);const low=pet.read().scale;pet.setScale(NaN);const invalid=pet.read().scale;pet.setScale(1.8);
   pet.point(400,650);pet.forcePose('dance');for(let i=0;i<20;i++)pet.advance(1/30);
   const rect=c.getBoundingClientRect(),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data,r=pet.read().protectedRects[1];let overlap=0;
   for(let yy=0;yy<c.height;yy++)for(let xx=0;xx<c.width;xx++){const gx=rect.left+(xx+.5)*rect.width/c.width,gy=rect.top+(yy+.5)*rect.height/c.height;if(gx>r.left+1&&gx<r.right-1&&gy>r.top+1&&gy<r.bottom-1&&pixels[(yy*c.width+xx)*4+3]>0)overlap++;}
   const count=document.querySelectorAll('.stick-canvas').length,eventsBefore=events.length;pet.setEnabled(false);pet.advance(1);const disabledEvents=events.slice(eventsBefore).filter(event=>event.energy!==0).length;pet.setEnabled(true);
   return {states:results,firstChanged:first!==second,right,left,high,low,invalid,overlap,count,disabledEvents,events:events.length};
  });
  for(const row of result.states){assert.ok(row.jump<1e-8,row.mode+' pose discontinuity');assert.ok(row.max<10,row.mode+' unstable joints');assert.ok(row.movement>.015,row.mode+' freezes');}
  assert.equal(result.count,1);assert.ok(result.firstChanged);assert.ok(result.right>0&&result.left<0,'light direction must reverse the projected shadow');assert.equal(result.high,1.8);assert.equal(result.low,.65);assert.equal(result.invalid,.65);assert.equal(result.overlap,0);assert.equal(result.disabledEvents,0);assert.ok(result.events>100);
  await page.evaluate(()=>{pet.setScale(1.2);pet.point(130,200);});
  for(const target of [{x:850,y:1180},{x:130,y:1180},{x:850,y:180},{x:130,y:180}]){
   const box=await page.locator('.stick-hit').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:8});await page.mouse.up();
   const point=await page.evaluate(()=>pet.read());assert.ok(Math.abs(point.x-target.x)<3);assert.ok(Math.abs(point.y-target.y)<100);assert.equal(point.mode,'curious');
  }
  await page.evaluate(()=>{document.body.classList.add('is-fullscreen');window.double=0;document.addEventListener('dblclick',()=>double++);});await page.locator('.stick-hit').dblclick();assert.equal(await page.evaluate(()=>double),0);
  await page.evaluate(()=>{pet.point(720,930);pet.forcePose('mischief');for(let i=0;i<40;i++)pet.advance(1/30);pet.setLight({x:200,y:100,rgb:'255,255,255',strength:.95,elevation:40,isDay:true});pet.advance(.1);});
  await page.screenshot({path:path.join(__dirname,'stick-volume-preview.png')});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);const still=await page.locator('.stick-canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(120);assert.ok(await page.locator('.stick-canvas').evaluate(c=>c.toDataURL())===still,'reduced motion stays still');
  await page.evaluate(()=>pet.destroy());assert.equal(await page.locator('.stick-world').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS 15 living eased poses; one volumetric character; adjustable 65–180%; light-responsive projected shadows; drag to all screen quadrants; zero numeral overlay; activity events; fullscreen gesture isolation; reduced motion; cleanup');
  console.log(JSON.stringify({states:result.states,shadowDirection:[result.right,result.left],overlap:result.overlap,events:result.events}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
