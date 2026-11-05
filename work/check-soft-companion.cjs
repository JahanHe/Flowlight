const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
let source=fs.readFileSync(path.join(__dirname,'stick-figure.js'),'utf8');
assert.ok(!source.includes('destination-out'),'No mask may erase any part of the character');
assert.ok(source.includes('ctx.lineWidth=2.15')&&source.includes('circle(...p.head,5.5)')&&!source.includes('softShape')&&!source.includes('paintHead'),'Original thin strokes and hollow round head restored');
const marker='const api={setState,refresh,onFlip,setEnabled,destroy};';
source=source.replace(marker,`const api={setState,refresh,onFlip,setEnabled,destroy,
  forcePose(next){motion=null;pose(next,100);},
  advance(dt){update(dt);draw();return structuredClone(renderedPose);},
  place(px,py){motion=null;x=px;y=py;draw();},
  route(px,py){return {path:routeTo({x:px,y:py}),rects:exclusionRects()};},
  release(){const safe=clearPoint({x,y});travelTo(safe);},
  freeze(){cancelAnimationFrame(frame);frame=0;},
  pixels(){const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=3;i<data.length;i+=4)if(data[i]>240)count++;return count;}
};`);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768}});
  await page.setContent('<style>html,body{margin:0;background:radial-gradient(ellipse at 48% 28%,#193752,transparent 65%),#000;color:white;height:100%;font-family:Arial}.intro{position:absolute;top:215px;left:390px;font-size:14px;color:#a4afbe}.clock{position:absolute;left:140px;top:300px;display:flex;gap:10px}.tile{width:240px;height:200px;position:relative}.numeral{position:absolute;inset:0;text-align:center;font:300 200px Arial;color:#d6dde3}</style><div class="intro">2026年10月16日　星期五</div><div class="clock"><div class="tile" data-unit="hours"><div class="static top"><span class="numeral">12</span></div></div><div class="tile" data-unit="minutes"><div class="static top"><span class="numeral">34</span></div></div><div class="tile" data-unit="seconds"><div class="static top"><span class="numeral">56</span></div></div></div>');
  await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'stick-figure.css'),'utf8')});
  await page.addScriptTag({content:source+';window.pet=createStickFigure();pet.freeze();'});
  const result=await page.evaluate(()=>{
    pet.setState({phase:'day',condition:'clear'});pet.setScale(1.6);pet.setLight({x:120,y:70,strength:.8,rgb:'255,255,255'});pet.forcePose('sit');for(let i=0;i<60;i++)pet.advance(1/30);pet.freeze();
    const count=[];for(const at of [[200,180],[240,450],[460,270]]){pet.place(...at);count.push(pet.pixels());}
    pet.place(240,450);pet.release();for(let i=0;i<180;i++)pet.advance(1/30);
    const released={x:+document.querySelector('.stick-world').dataset.x,y:+document.querySelector('.stick-world').dataset.y};
    const {path,rects}=pet.route(900,600);pet.place(320,290);pet.forcePose('wave');for(let i=0;i<30;i++)pet.advance(1/30);pet.freeze();
    return {count,released,path,rects,entityCount:document.querySelectorAll('.stick-canvas').length};
  });
  assert.equal(result.entityCount,1);assert.ok(result.count.every(n=>Math.abs(n-result.count[0])/result.count[0]<.02),'Character stays complete over time/date/empty sky');
  const inside=(p,r)=>p.x>r.left&&p.x<r.right&&p.y>r.top&&p.y<r.bottom;
  assert.ok(!result.rects.some(r=>inside(result.released,r)),'Release smoothly returns to clear space');
  for(let i=1;i<result.path.length;i++)for(let step=0;step<=40;step++){const t=step/40,a=result.path[i-1],b=result.path[i],p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};assert.ok(!result.rects.some(r=>inside(p,r)),'Autonomous route avoids text');}
  await page.screenshot({path:path.join(__dirname,'stick-restored-preview.png')});
  await page.locator('.stick-canvas').screenshot({path:path.join(__dirname,'stick-restored-detail.png')});
  console.log('PASS single original line figure, complete unmasked silhouette over text, smooth release to open space, text-aware travel, rendered preview');
  console.log(JSON.stringify({ink:result.count,release:result.released,waypoints:result.path.length}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
