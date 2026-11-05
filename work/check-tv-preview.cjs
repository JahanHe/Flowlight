const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CLOCK_CHROMIUM_PATH,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url()==='http://clock.test/'?route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../outputs/glass-clock-tv.html'))}):route.abort());
  await page.clock.install({time:new Date('2026-10-16T04:34:10Z')});await page.clock.pauseAt(new Date('2026-10-16T04:34:10Z'));
  await page.goto('http://clock.test/');await page.evaluate(()=>document.fonts.ready);await page.clock.runFor(500);
  await page.addScriptTag({path:path.join(__dirname,'tv-preview.js')});
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.id='test-preview';canvas.style.cssText='position:fixed;right:10px;top:10px;width:480px;height:270px;z-index:100';document.body.append(canvas);
   const ctx=canvas.getContext('2d'),draw=ctx.drawImage.bind(ctx);window.previewCopies=0;
   ctx.drawImage=function(source,...args){if(source.id==='weather-canvas')window.previewCopies++;return draw(source,...args);};
   window.preview=createClockTVPreview(canvas);preview.start();
  });
  const pixels=()=>page.evaluate(()=>Array.from(document.getElementById('test-preview').getContext('2d').getImageData(0,0,640,360).data));
  const difference=(a,b)=>{let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;return changed;};
  await page.clock.runFor(500);const first=await pixels();
  assert(first.filter((v,i)=>i%4!==3&&v>35).length>3000,'preview must contain visible clock and sky');
  assert.deepEqual(first.slice(0,4),[0,0,0,255]);
  const before=await page.evaluate(()=>previewCopies);await page.clock.runFor(1000);
  const copies=(await page.evaluate(()=>previewCopies))-before;assert(copies>=3&&copies<=4,'copy no more than 4 fps');
  const moving=await pixels();assert(difference(first,moving)>10,'existing weather/character frames must stay live');
  await page.locator('#test-preview').screenshot({path:path.join(__dirname,'tv-preview.png')});
  await page.evaluate(()=>{preview.stop();});const stopped=await pixels(),stopCopies=await page.evaluate(()=>previewCopies);
  await page.clock.runFor(1000);assert.deepEqual(await pixels(),stopped);assert.equal(await page.evaluate(()=>previewCopies),stopCopies);
  await page.evaluate(()=>{preview.start();preview.start();});await page.clock.runFor(500);assert(await page.evaluate(()=>previewCopies)>stopCopies);
  await page.evaluate(()=>{window.previewTestHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.previewTestHidden});document.dispatchEvent(new Event('visibilitychange'));});
  const hiddenCopies=await page.evaluate(()=>previewCopies);await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>previewCopies),hiddenCopies,'background must stop preview copies');
  await page.evaluate(()=>{window.previewTestHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(300);assert(await page.evaluate(()=>previewCopies)>hiddenCopies,'foreground must resume requested preview');
  await page.evaluate(()=>{delete document.hidden;document.getElementById('test-preview').hidden=true;});
  const invisibleCopies=await page.evaluate(()=>previewCopies);await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>previewCopies),invisibleCopies,'hidden canvas must stop copying');
  await page.evaluate(()=>{document.getElementById('test-preview').hidden=false;preview.start();});

  await page.evaluate(()=>{if(document.getElementById('tv-panel').hidden)clockTVRemote('Enter');const input=document.getElementById('use-glass');input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));const companion=document.getElementById('show-companion');companion.checked=false;companion.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('weather-canvas').remove();});
  assert(await page.evaluate(()=>document.body.classList.contains('plain-digits')));
  await page.clock.runFor(300);let current=await pixels();await page.locator('#test-preview').screenshot({path:path.join(__dirname,'tv-preview-plain.png')});
  const changes={};
  for(const [id,value,event]of [['digit-size','90','input'],['digit-weight','300','input'],['digit-spacing','8','input'],['digit-font','space','input']]){
   await page.evaluate(({id,value,event})=>{const input=document.getElementById(id);if(id==='digit-font')value=Array.from(input.options).find(option=>option.value!==input.value).value;input.value=value;input.dispatchEvent(new Event(event,{bubbles:true}));window.expectedPreviewValue=value;},{id,value,event});
   await page.clock.runFor(300);assert.equal(await page.locator('#'+id).inputValue(),await page.evaluate(()=>String(expectedPreviewValue)));const next=await pixels();changes[id]=difference(current,next);assert(changes[id]>40,id+' must visibly change preview');current=next;
  }
  await page.evaluate(()=>{const input=document.getElementById('show-seconds');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.clock.runFor(300);assert(await page.locator('#show-seconds').isChecked());changes.seconds=difference(current,await pixels());assert(changes.seconds>40);
  await page.evaluate(()=>{preview.stop();});assert.deepEqual(errors,[]);
  const report={passed:true,pixelBudget:640*360,copiesPerSecond:copies,settingChangedPixels:changes,checks:['live shared source pixels','pure black corner','4fps bound','stop freezes all copying','idempotent restart','background and hidden canvas stop; foreground resumes','font/weight/size/spacing/seconds update'],runtime:'desktop Chromium with the actual clock HTML'};
  fs.writeFileSync(path.join(__dirname,'tv-preview-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
