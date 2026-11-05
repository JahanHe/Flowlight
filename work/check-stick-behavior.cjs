// Focused actor tests. Test-only state access is injected; the product API remains small.
const fs=require('node:fs'),assert=require('node:assert/strict');
const lowPower=process.argv.includes('--low-power');
const {chromium}=require('playwright');
let source=fs.readFileSync('work/stick-figure.js','utf8');
const marker='const api={setState,refresh,onFlip,setEnabled,destroy};';assert(source.includes(marker));
source=source.replace(marker,`const api={setState,refresh,onFlip,setEnabled,destroy,
 forcePose(next){motion=null;pose(next,100);draw();},advance(dt,paint=true){update(dt);if(paint)draw();},
 point(px,py){motion=null;x=px;y=py;draw();},choose(){chooseAction();draw();},
 read(){return {x,y,size,scale,mode,behavior:{...behavior},until,elapsed,actionCount,canvasWidth,canvasHeight,originX,originY,pose:structuredClone(renderedPose)};}
};`);
const markup='<style>body{margin:0;background:#07131f;color:#eaf5ff}.intro{position:absolute;top:10%;left:33%;width:34%;height:20px}.clock{position:absolute;top:43%;left:23%;width:54%;display:flex;gap:10px}.tile{width:48%;height:140px;position:relative}.numeral{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 92px/1 Arial;letter-spacing:-3px}</style><div class="intro">2026年10月17日 星期六</div><div class="clock"><div class="tile" data-unit="hours"><div class="static top"><span class="numeral">21</span></div></div><div class="tile" data-unit="minutes"><div class="static top"><span class="numeral">10</span></div></div></div>';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});try{
 const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true,deviceScaleFactor:2}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.setContent('<div class="shell" style="position:relative;z-index:1">'+markup+'</div>');await page.addStyleTag({content:fs.readFileSync('work/stick-figure.css','utf8')});
 await page.addScriptTag({content:(lowPower?'window.clockFullEffects=true;window.clockQuality={fps:24,glyphDpr:1.25};':'')+'window.requestAnimationFrame=()=>1;window.clockMotion={matches:false,addEventListener(){},removeEventListener(){}};'+fs.readFileSync('work/text-metrics.js','utf8')+'\n'+source+';window.pet=createStickFigure();pet.setState({phase:"day",condition:"clear"});'});
 const behavior=await page.evaluate(()=>{
  const simulate=(activity,rest)=>{
   pet.destroy();let seed=73;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
   pet=createStickFigure();pet.setState({phase:'day',condition:'clear'});pet.setBehavior({activity,rest});
   let restSeconds=0;const modes=new Set(),quadrants=new Set();
   for(let i=0;i<3000;i++){pet.advance(.2,false);const s=pet.read();if(['sit','bored'].includes(s.mode))restSeconds+=.2;modes.add(s.mode);quadrants.add((s.x>innerWidth/2?'R':'L')+(s.y>innerHeight/2?'B':'T'));}
   return {activity,rest,actions:pet.read().actionCount,restSeconds,modes:[...modes],quadrants:[...quadrants]};
  };
  const slow=simulate(1,3),active=simulate(5,3),littleRest=simulate(3,1),muchRest=simulate(3,5),rich=simulate(5,1);
  pet.forcePose('sit');const unchanged=pet.read().until;pet.setBehavior({activity:5,rest:1});const afterSame=pet.read().until;
  pet.setBehavior({activity:NaN,rest:null});const invalid=pet.read().behavior;pet.setBehavior({activity:99,rest:-1});const clamped=pet.read().behavior;
  return {slow,active,littleRest,muchRest,rich,unchanged,afterSame,invalid,clamped};
 });
 assert(behavior.active.actions>behavior.slow.actions*1.15,JSON.stringify(behavior));
 assert(behavior.muchRest.restSeconds>behavior.littleRest.restSeconds*1.7,JSON.stringify(behavior));
 for(const mode of ['reach','balance','hop','stretch','dance','jump'])assert(behavior.rich.modes.includes(mode),mode);
 assert.equal(behavior.rich.quadrants.length,4);assert.equal(behavior.unchanged,behavior.afterSame);
 assert.deepEqual(behavior.invalid,{activity:5,rest:1});assert.deepEqual(behavior.clamped,{activity:5,rest:1});
 const poses=await page.evaluate(()=>{
  const rows=[],diff=(a,b)=>Math.max(...Object.keys(a).flatMap(k=>a[k].map((v,i)=>Math.abs(v-b[k][i]))));
  for(const mode of ['reach','balance','hop','stretch','sit','bored','sleep','sleep-turn']){
   const before=pet.read().pose;pet.forcePose(mode);const immediate=pet.read().pose;
   for(let i=0;i<30;i++)pet.advance(1/30);const settled=pet.read().pose;
   for(let i=0;i<24;i++)pet.advance(1/30);rows.push({mode,instant:diff(before,immediate),movement:diff(settled,pet.read().pose)});
  }return rows;
 });for(const row of poses){assert(row.instant<1e-8,row.mode);assert(row.movement>.015,row.mode+' must breathe/move');}
 const bounds=[];
 for(const [width,height]of [[390,844],[844,390],[1024,768]]){
  await page.setViewportSize({width,height});
  const row=await page.evaluate(()=>{
   pet.setScale(5);pet.refresh();pet.setState({phase:'day',condition:'rain'});createStickFigure();
   const positions=[[0,0],[innerWidth,0],[0,innerHeight],[innerWidth,innerHeight]],checks=[];
   for(const [px,py]of positions)for(const mode of ['reach','balance','hop','stretch','sleep']){
    pet.point(px,py);pet.forcePose(mode);for(let i=0;i<24;i++)pet.advance(1/30);
    const s=pet.read(),c=document.querySelector('.stick-canvas'),hit=document.querySelector('.stick-hit').getBoundingClientRect();
    const joints=['hip','chest','head','handL','handR','footL','footR'].map(k=>[s.x+s.pose[k][0]*s.size,s.y+s.pose[k][1]*s.size]);
    const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let inkAtCanvasEdge=0;
    for(let x=0;x<c.width;x++)for(const y of [0,1,c.height-2,c.height-1])inkAtCanvasEdge+=pixels[(y*c.width+x)*4+3];
    for(let y=0;y<c.height;y++)for(const x of [0,1,c.width-2,c.width-1])inkAtCanvasEdge+=pixels[(y*c.width+x)*4+3];
    checks.push({mode,joints,hit:[hit.left,hit.top,hit.right,hit.bottom],inkAtCanvasEdge});
   }
   pet.point(innerWidth*.5,innerHeight*.58);pet.forcePose('stand');pet.advance(.1);
   const world=document.querySelector('.stick-world'),c=document.querySelector('.stick-canvas');
   return {width:innerWidth,height:innerHeight,scale:pet.read().scale,size:pet.read().size,effective:Number(world.dataset.effectiveScale),pixels:c.width*c.height,checks,count:document.querySelectorAll('.stick-world').length,overlap:world.dataset.overlapping,opacity:c.style.opacity};
  });
  assert.equal(row.scale,5);assert.equal(row.count,1);assert(row.effective<=5);assert(row.pixels<=(lowPower?768*1024:2*1024*1024)+3000);
  for(const c of row.checks){assert.equal(c.inkAtCanvasEdge,0,'local canvas must not cut '+c.mode);assert(c.joints.every(([x,y])=>x>=0&&x<=width&&y>=0&&y<=height),JSON.stringify(c));assert(c.hit[0]>=0&&c.hit[1]>=0&&c.hit[2]<=width+.01&&c.hit[3]<=height+.01);}
  if(row.overlap==='true')assert.equal(row.opacity,'0.2','large actor must yield to digits');bounds.push({width,height,size:row.size,effective:row.effective,pixels:row.pixels});
 }
 const settingsHit=await page.evaluate(()=>{
  pet.setScale(5);pet.point(innerWidth*.6,innerHeight*.7);const hit=document.querySelector('.stick-hit').getBoundingClientRect();
  const panel=document.createElement('div');panel.className='control-panel';panel.style.cssText='position:fixed;z-index:12;left:'+hit.left+'px;top:'+hit.top+'px;width:100px;height:50px';
  panel.innerHTML='<button id="actor-settings-check" style="width:100px;height:50px">设置</button>';document.querySelector('.shell').append(panel);window.settingsClicks=0;panel.querySelector('button').onclick=()=>window.settingsClicks++;
  return {parent:document.querySelector('.stick-world').parentElement.className,target:document.elementFromPoint(hit.left+50,hit.top+25).id};
 });
 assert.equal(settingsHit.parent,'shell');assert.equal(settingsHit.target,'actor-settings-check');await page.locator('#actor-settings-check').click();assert.equal(await page.evaluate(()=>window.settingsClicks),1);await page.locator('.control-panel').evaluate(p=>p.remove());
 await page.evaluate(()=>{pet.setScale(1);pet.setState({phase:'day',condition:'clear'});pet.point(150,220);});
 let box=await page.locator('.stick-hit').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(850,650,{steps:8});
 assert.equal(await page.locator('.stick-world').getAttribute('data-mode'),'drag');await page.mouse.up();
 assert.equal(await page.locator('.stick-world').count(),1);await page.evaluate(()=>pet.destroy());assert.equal(await page.locator('.stick-world').count(),0);assert.deepEqual(errors,[]);
 const report={passed:true,lowPower,behavior,poses,bounds,settingsHit,scope:'Isolated desktop actor tests; no phone frame-rate claim.'};fs.writeFileSync(lowPower?'work/lowpower-stick-behavior-results.json':'work/stick-behavior-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
