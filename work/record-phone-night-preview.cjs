const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const lowPower=process.argv.includes('--low-power'),immersive=lowPower||process.argv.includes('--immersive'),frameCount=lowPower?80:immersive?150:120;
const recordingKind=lowPower?'lowpower':immersive?'immersive':'night';
const root=process.cwd(),source=fs.readFileSync('outputs/glass-clock.html'),folder=root+'/work/phone-'+recordingKind+'-preview-frames';
const version=fs.readFileSync('work/android/AndroidManifest.xml','utf8').match(/android:versionName="([^"]+)"/)[1];
fs.mkdirSync(folder,{recursive:true});console.log('Record',version,'launching final HTML',source.length,'bytes');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});const deadline=setTimeout(()=>{console.error('Recording exceeded ten minutes; closing its browser');browser.close().catch(()=>{});},600000);try{
 const page=await browser.newPage({viewport:{width:720,height:405},deviceScaleFactor:1,timezoneId:'Asia/Shanghai'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.previewStars=[];window.previewSpace=[];const proto=CanvasRenderingContext2D.prototype,clear=proto.clearRect,arc=proto.arc,draw=proto.drawImage;
  proto.clearRect=function(...args){if(this.canvas.id==='weather-canvas'){previewStars=[];previewSpace=[];}return clear.apply(this,args);};
  proto.arc=function(x,y,r,...args){if(this.canvas.id==='weather-canvas'&&r<2){const m=this.getTransform();previewStars.push({x,y,r,transform:[m.a,m.b,m.c,m.d,m.e,m.f]});}return arc.call(this,x,y,r,...args);};
  proto.drawImage=function(image,...args){if(this.canvas.id==='weather-canvas'&&image.clockTexture){const m=this.getTransform();previewSpace.push({kind:image.clockTexture,args,alpha:this.globalAlpha,transform:[m.a,m.b,m.c,m.d,m.e,m.f]});}return draw.call(this,image,...args);};
 });
 // Serve the final HTML bytes unchanged. Remote weather is irrelevant to the selected night preview.
 await page.route('**/*',route=>route.request().url()==='http://clock-preview.test/'?route.fulfill({contentType:'text/html',body:source}):route.abort());
 const wall=new Date('2026-10-17T21:10:00+08:00');await page.clock.install({time:wall});await page.clock.pauseAt(wall);await page.clock.setFixedTime(wall);
 await page.goto('http://clock-preview.test/');await page.evaluate(()=>document.fonts.ready);await page.clock.runFor(1000);console.log('Page loaded; selecting normal-speed immersive night');
 await page.locator('#show-seconds').uncheck({force:true});
 if(immersive){await page.locator('#render-quality').selectOption(lowPower?'smooth':'ultra');await page.locator('#immersive-sky').check({force:true});await page.locator('#motion-speed').evaluate(input=>{input.value='1';input.dispatchEvent(new Event('input',{bubbles:true}));});}
 await page.locator('#weather-browse').click();await page.locator('[data-preview="night"]').click();await page.locator('#gallery-close').click();await page.locator('#fullscreen').click();await page.clock.runFor(immersive?6000:2500);
 // Image decoding is asynchronous even while elapsed animation time is controlled.
 if(immersive){let ready=false;for(let i=0;i<80;i++){ready=await page.evaluate(()=>previewSpace.some(d=>d.kind==='galaxy')&&previewSpace.some(d=>d.kind==='jupiter'));if(ready)break;await page.clock.runFor(100);}assert(ready,'decoded galaxy and Jupiter must actually draw before recording');}
 console.log('Images actually drawn; recording',frameCount,'frames');
 const state=await page.evaluate(()=>({version:document.querySelector('meta[name="clock-mobile-version"]').content,full:document.body.classList.contains('is-fullscreen'),preview:document.body.dataset.preview,fast:document.getElementById('day-cycle').getAttribute('aria-pressed'),seconds:document.getElementById('show-seconds').checked,glass:document.documentElement.classList.contains('glass-digits-ready'),actorCount:document.querySelectorAll('.stick-canvas').length,quality:clockQuality.name,fps:clockQuality.fps,clock:Array.from(document.querySelectorAll('.tile')).filter(t=>t.getBoundingClientRect().width).map(t=>t.querySelector('.static.top .numeral').textContent)}));
 assert.equal(state.version,version);assert(state.full&&state.glass);assert.equal(state.preview,'night');assert.equal(state.fast,'false');assert.equal(state.seconds,false);assert.equal(state.actorCount,1);assert.deepEqual(state.clock,['21','10']);
 if(lowPower){state.glyphInk=await page.evaluate(()=>[...document.querySelectorAll('.static .glass-numeral')].filter(c=>c.width&&c.getBoundingClientRect().width).map(c=>{const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>100)ink++;return ink;}));assert.equal(state.glyphInk.length,4);assert(state.glyphInk.every(ink=>ink>50),'all four clock halves must contain visible glass');}
 if(immersive){assert.deepEqual(await page.evaluate(()=>({level:clockQuality.level,mode:clockQuality.mode,immersive:clockMotion.immersive,speed:clockMotion.speed})),{level:lowPower?0:2,mode:lowPower?'smooth':'ultra',immersive:true,speed:1});}
 const before=await page.evaluate(()=>previewStars);
 const spaceFrames=[];
 for(let i=0;i<frameCount;i++){if(i)await page.clock.runFor(100);if(immersive){const frame=await page.evaluate(()=>{const galaxy=previewSpace.find(d=>d.kind==='galaxy');return {level:clockQuality.level,paintVersion:document.getElementById('weather-canvas').clockPaintVersion,glass:document.documentElement.classList.contains('glass-digits-ready'),draws:previewSpace,galaxyStars:previewStars.filter(s=>galaxy&&s.transform.every((v,i)=>v===galaxy.transform[i]))};});assert.equal(frame.level,lowPower?0:2,'recording must keep the selected actual tier');assert(frame.glass,'glass remains active throughout recording');spaceFrames.push(frame);}await page.screenshot({path:folder+'/'+String(i).padStart(3,'0')+'.png'});if(i%30===29)console.log('Recorded',i+1,'/',frameCount);}
 const after=await page.evaluate(()=>previewStars),displacements=before.filter(p=>p.r>.65&&p.x>20&&p.x<700&&p.y>30&&p.y<375).map(p=>{const next=after.find(q=>q.r===p.r);return next?Math.hypot(next.x-p.x,next.y-p.y):null;}).filter(v=>v!==null).sort((a,b)=>a-b);
 if(!lowPower){assert(displacements.length>10);assert(displacements[Math.floor(displacements.length/2)]>3);}assert.deepEqual(errors,[]);
 let spaceEvidence=null,output=null;
 if(lowPower){
  const first=spaceFrames[0],last=spaceFrames[frameCount-1],layerEvidence={};
  assert(last.paintVersion>first.paintVersion,'weather must repaint during the recording');
  for(const kind of ['starfield','galaxy-stars']){
   const start=first.draws.filter(d=>d.kind===kind),end=last.draws.filter(d=>d.kind===kind);
   assert.equal(start.length,3,kind+' has three cached layers');assert.equal(end.length,3);
   const rotations=start.map((s,i)=>Math.atan2(end[i].transform[1],end[i].transform[0])-Math.atan2(s.transform[1],s.transform[0]));
   assert(start.every((s,i)=>JSON.stringify([s.args,s.transform])!==JSON.stringify([end[i].args,end[i].transform])),kind+' layers keep moving');
   assert(Math.max(...rotations)-Math.min(...rotations)>1e-5,kind+' layers rotate at different rates');
   layerEvidence[kind]={count:3,rotationChanges:rotations,first:start,last:end};
  }
  const firstDust=first.draws.filter(d=>d.kind==='galaxy'&&d.args.length===8),lastDust=last.draws.filter(d=>d.kind==='galaxy'&&d.args.length===8);
  assert.equal(firstDust.length,4);assert.equal(lastDust.length,4);const dustShifts=firstDust.map((d,i)=>lastDust[i].args[4]-d.args[4]);assert(Math.max(...dustShifts)-Math.min(...dustShifts)>.1,'dust layers drift independently');
  const jupiter=spaceFrames.flatMap(f=>f.draws.filter(d=>d.kind==='jupiter'));assert(jupiter.length>20,'planet must actually draw');
  assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('.tile')).filter(t=>t.getBoundingClientRect().width).map(t=>t.querySelector('.static.top .numeral').textContent)),['21','10'],'wall clock remains fixed while the sky moves');
  spaceEvidence={actualLevel:0,mode:'smooth',immersive:true,backgroundSpeed:1,paintVersions:[first.paintVersion,last.paintVersion],layers:layerEvidence,dustLayers:4,dustShifts,jupiterFrames:jupiter.length};
  output='outputs/浮光-低功耗沉浸-'+version+'.gif';
 }else if(immersive){
  const jupiter=spaceFrames.flatMap(frame=>frame.draws.filter(d=>d.kind==='jupiter')),galaxy=spaceFrames.flatMap(frame=>frame.draws.filter(d=>d.kind==='galaxy'));
  const firstBands=spaceFrames[0].draws.filter(d=>d.kind==='galaxy'),lastBands=spaceFrames[frameCount-1].draws.filter(d=>d.kind==='galaxy');
  assert(jupiter.length>30&&firstBands.length>1&&lastBands.length===firstBands.length);assert(Math.max(...jupiter.map(d=>d.args[2]))>jupiter[0].args[2]*1.5,'Jupiter visibly approaches');assert.notDeepEqual(galaxy[0].transform,galaxy[galaxy.length-1].transform,'galaxy must move');
  const middle=Math.floor(firstBands.length/2),bandShearChange=Math.abs((lastBands[0].args[4]-lastBands[middle].args[4])-(firstBands[0].args[4]-firstBands[middle].args[4]));assert(bandShearChange>.1,'galaxy bands must flow independently of the overall rotation');
  const starsStart=spaceFrames[0].galaxyStars,starsEnd=spaceFrames[frameCount-1].galaxyStars;
  assert(starsStart.length>100&&starsStart.length===starsEnd.length);const localStarMotion=starsStart.map((s,i)=>Math.hypot(s.x-starsEnd[i].x,s.y-starsEnd[i].y)).sort((a,b)=>a-b),medianLocalStarMotion=localStarMotion[Math.floor(localStarMotion.length/2)];assert(medianLocalStarMotion>1,'galactic stars must move inside the galaxy, independently of its camera rotation');
  spaceEvidence={actualLevel:2,immersive:true,backgroundSpeed:1,jupiterFrames:jupiter.length,firstJupiter:jupiter[0],lastJupiter:jupiter[jupiter.length-1],maxJupiterDiameter:Math.max(...jupiter.map(d=>d.args[2])),galaxyBandsPerFrame:firstBands.length,bandShearChange,independentStarCount:starsStart.length,medianLocalStarMotion,firstGalaxy:galaxy[0],lastGalaxy:galaxy[galaxy.length-1]};
  output='outputs/浮光-沉浸星空-'+version+'.gif';
 }
 if(output){
  execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','10','-i',folder+'/%03d.png','-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle','-frames:v',String(frameCount),'-loop','0',output]);
 }
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('outputs/glass-clock.html')).digest('hex'),crypto.createHash('sha256').update(source).digest('hex'),'recording source must remain frozen');
 const report={source:'outputs/glass-clock.html',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),sourceBytes:source.length,viewport:[720,405],frames:frameCount,frameMs:100,playbackSeconds:frameCount/10,wallClock:'2026-10-17 21:10:00 Asia/Shanghai',normalMotion:true,dayFastForward:false,state,visibleStarCount:displacements.length,starMedianDisplacement:displacements[Math.floor(displacements.length/2)],spaceEvidence,framesFolder:folder,output,scope:'Unchanged final HTML, UI-selected settings, fixed wall clock and virtual elapsed time, read-only canvas observation. Preview capture is not a device FPS measurement.'};
 fs.writeFileSync('work/phone-'+recordingKind+'-preview-recording.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{clearTimeout(deadline);await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
