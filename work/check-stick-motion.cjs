// Run: node work/check-stick-motion.cjs. Test-only pose access is injected into the loaded source, never the deliverable.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
let source=fs.readFileSync(path.join(__dirname,'stick-figure.js'),'utf8');
const marker='const api={setState,refresh,onFlip,setEnabled,destroy};';assert.ok(source.includes(marker));
source=source.replace(marker,`const api={setState,refresh,onFlip,setEnabled,destroy,
  forcePose(next){motion=null;pose(next,100);draw();},
  advance(dt){update(dt);draw();return structuredClone(renderedPose);},
  joints(){return structuredClone(renderedPose);}
};`);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1366}});
  await page.setContent('<style>.clock{margin:400px 100px;display:flex}.tile{width:220px;height:270px;position:relative}.numeral{position:absolute;inset:0;font:500 150px Arial}</style><div class="clock"><div class="tile" data-unit="hours"><div class="static top"><span class="numeral">12</span></div></div><div class="tile" data-unit="minutes"><div class="static top"><span class="numeral">34</span></div></div></div>');
  await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'stick-figure.css'),'utf8')});
  await page.addScriptTag({content:source+';window.pet=createStickFigure();'});
  const result=await page.evaluate(()=>{
    const states=['stand','sit','walk','tap','jump','drag','wave','startle','sleep','sleep-turn','stretch'],results=[];
    const difference=(a,b)=>Math.max(...Object.keys(a).flatMap(key=>a[key].map((n,i)=>Math.abs(n-b[key][i]))));
    for(const mode of states){
      const previous=pet.joints();pet.forcePose(mode);const immediate=pet.joints();let last=immediate,maxStep=0;
      for(let i=0;i<30;i++){const next=pet.advance(1/30);maxStep=Math.max(maxStep,difference(last,next));last=next;}
      const settled=pet.joints();for(let i=0;i<24;i++)pet.advance(1/30);
      results.push({mode,instantJump:difference(previous,immediate),maxFrameStep:maxStep,idleMovement:difference(settled,pet.joints())});
    }
    pet.setState({phase:'night',condition:'rain'});pet.forcePose('sleep');for(let i=0;i<30;i++)pet.advance(1/30);
    const beforeWake=pet.joints();pet.forcePose('wave');const immediateWake=pet.joints();for(let i=0;i<30;i++)pet.advance(1/30);
    return {states:results,wakeJump:difference(beforeWake,immediateWake),wet:pet.joints().props[1],count:document.querySelectorAll('.stick-canvas').length};
  });
  for(const row of result.states){assert.ok(row.instantJump<1e-9,row.mode+' must transition without a position discontinuity');assert.ok(row.maxFrameStep<9.5,row.mode+' must ease rather than snap');assert.ok(row.idleMovement>.015,row.mode+' must retain subtle life');}
  assert.ok(result.wakeJump<1e-9);assert.equal(result.count,1);assert.ok(result.wet>.99);
  console.log('PASS all 11 poses stay alive, zero instantaneous pose jumps, eased per-frame joint motion, continuous wet sleep/wake, single entity');
  console.log(JSON.stringify(result.states));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
