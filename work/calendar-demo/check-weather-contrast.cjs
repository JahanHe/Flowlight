const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const output=path.resolve(process.env.CLOCK_QA_DIR||'work/calendar-demo');fs.mkdirSync(output,{recursive:true});
const url=pathToFileURL(path.resolve(process.env.CLOCK_HTML||'outputs/浮光-日历金句-本地演示.html')).href;
function observeCanvas(){
 const p=CanvasRenderingContext2D.prototype,original={};for(const key of ['clearRect','drawImage','beginPath','moveTo','lineTo','arc','ellipse','stroke'])original[key]=p[key];
 window.weatherFrame={clouds:[],rain:[]};window.weatherCloudTextures={};
 p.clearRect=function(...args){if(this.canvas.id==='weather-canvas')window.weatherFrame={clouds:[],rain:[]};return original.clearRect.apply(this,args);};
 p.drawImage=function(image,...args){
  if(this.canvas.id==='weather-canvas'&&Number.isInteger(image.clockCloudShape)&&args.length===4){
   const shape=image.clockCloudShape;
   const [x,y,width,height]=args,visibleArea=Math.max(0,Math.min(innerWidth,x+width)-Math.max(0,x))*Math.max(0,Math.min(innerHeight,y+height)-Math.max(0,y));
   if(this.globalAlpha>.04&&this.globalCompositeOperation!=='screen'&&visibleArea>innerWidth*innerHeight*.005){
    // Count a visible bank once, even when day/warm/night palettes draw the same rectangle.
    const previous=window.weatherFrame.clouds.find(c=>c.shape===shape&&c.x===x&&c.y===y&&c.width===width&&c.height===height);
    if(previous)previous.alpha=Math.max(previous.alpha,this.globalAlpha);
    else window.weatherFrame.clouds.push({x,y,width,height,alpha:this.globalAlpha,shape,source:image.clockCloudSource});
   }
   // Inspect each actual atlas sprite once; transparent rectangles or repeated cells must fail.
   if(image.clockCloudSource==='atlas'&&!window.weatherCloudTextures[shape]){
    const pixels=image.getContext('2d').getImageData(0,0,image.width,image.height).data,total=image.width*image.height;
    let blank=0,body=0,soft=0,minLight=255,maxLight=0,hash=2166136261;
    for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3];if(a<8)blank++;if(a>128){body++;minLight=Math.min(minLight,pixels[i]);maxLight=Math.max(maxLight,pixels[i]);}if(a>=8&&a<=247)soft++;hash=Math.imul(hash^a,16777619);}
    window.weatherCloudTextures[shape]={shape,width:image.width,height:image.height,blank:blank/total,body:body/total,soft:soft/total,lightRange:maxLight-minLight,alphaHash:hash>>>0};
   }
  }
  return original.drawImage.call(this,image,...args);
 };
 p.beginPath=function(...args){if(this.canvas.id==='weather-canvas')this.weatherPath=[];return original.beginPath.apply(this,args);};
 for(const name of ['moveTo','lineTo'])p[name]=function(...args){if(this.canvas.id==='weather-canvas'&&this.weatherPath)this.weatherPath.push({name,x:args[0],y:args[1]});return original[name].apply(this,args);};
 for(const name of ['arc','ellipse'])p[name]=function(...args){if(this.canvas.id==='weather-canvas')this.weatherPath=null;return original[name].apply(this,args);};
 p.stroke=function(...args){const a=this.weatherPath;if(this.canvas.id==='weather-canvas'&&a?.length===2&&a[0].name==='moveTo'&&a[1].name==='lineTo'&&typeof this.strokeStyle==='object')window.weatherFrame.rain.push({x:a[0].x,y:a[0].y,length:Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),width:this.lineWidth,alpha:this.globalAlpha});return original.stroke.apply(this,args);};
}
async function sample(page){return page.evaluate(()=>{
 const c=document.querySelector('#weather-canvas'),ctx=c.getContext('2d'),pixels=ctx.getImageData(0,0,c.width,c.height).data,rgb=[0,0,0];let n=0;
 for(let y=4;y<c.height;y+=12)for(let x=4;x<c.width;x+=12){const i=(y*c.width+x)*4;for(let k=0;k<3;k++)rgb[k]+=pixels[i+k];n++;}
 for(let k=0;k<3;k++)rgb[k]/=n;
 const frame=window.weatherFrame,clouds=frame.clouds,rain=frame.rain;
 const cloudAspectRatios=clouds.map(p=>p.width/p.height),cloudWidthRatios=clouds.map(p=>p.width/innerWidth),cloudPositions=clouds.map(({shape,x,y,width,height})=>({shape,x,y,width,height}));
 return {phase:document.body.dataset.phase,preview:document.body.dataset.preview,paint:c.clockPaintVersion,atlasReady:c.clockCloudAtlasReady,cloudSources:[...new Set(clouds.map(c=>c.source))],cloudShapes:[...new Set(clouds.map(c=>c.shape))],cloudWidthRatios,cloudPositions,cloudAspectRatios,solarTransmission:c.clockSolarTransmission,rgb,luminance:rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,blueChroma:rgb[2]-rgb[0],cloudDraws:clouds.length,cloudArea:clouds.reduce((sum,p)=>sum+Math.max(0,Math.min(innerWidth,p.x+p.width)-Math.max(0,p.x))*Math.max(0,Math.min(innerHeight,p.y+p.height)-Math.max(0,p.y))*p.alpha,0)/(innerWidth*innerHeight),rainCount:rain.length,rainLength:rain.reduce((sum,p)=>sum+p.length,0)/Math.max(1,rain.length),rainWidth:rain.reduce((sum,p)=>sum+p.width,0)/Math.max(1,rain.length),rainHead:rain[0]||null};
 });}
async function leaveFullscreen(page){await page.keyboard.press('Escape');await page.waitForTimeout(150);if(await page.locator('.control-panel').isHidden())await page.locator('#clock-stage').dblclick({position:{x:15,y:15}});}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 const cases=[['noon','晴空万里'],['few-clouds','少云'],['cloudy','多云'],['overcast','乌云 / 阴天'],['drizzle','小雨'],['downpour','瓢泼大雨']],results=[],shots=[],errors=[],requests=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720},timezoneId:'Asia/Shanghai'});await page.context().setOffline(true);await page.addInitScript(observeCanvas);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.clock.setFixedTime(new Date('2026-11-04T12:36:00+08:00'));await page.goto(url);await page.waitForFunction(()=>window.clockAppReady&&document.querySelector('#weather-canvas').clockCloudAtlasReady);await page.evaluate(()=>document.fonts.ready);
  await page.locator('[data-tab="display"]').click();await page.locator('#demo-motion-settings > summary').click();
  for(const [id,label]of cases){
   await page.locator('[data-preview="'+id+'"]').click();await page.locator('#fullscreen').click();await page.waitForTimeout(5500);
   const first=await sample(page);await page.waitForTimeout(id==='cloudy'?1200:550);const last=await sample(page);
   assert.equal(last.phase,'day');assert(last.paint>first.paint,`${id}: canvas keeps animating`);assert.equal(last.atlasReady,true);assert(last.cloudSources.every(source=>source==='atlas'),`${id}: no cached fallback clouds remain after atlas decoding`);
   if(last.rainCount)assert(last.rainHead&&first.rainHead&&Math.hypot(last.rainHead.x-first.rainHead.x,last.rainHead.y-first.rainHead.y)>1,`${id}: rain moves`);
   if(id==='cloudy'){
    assert(new Set([...first.cloudShapes,...last.cloudShapes]).size>=3,'cloudy sky visibly uses at least three silhouettes across the motion sample');
    assert(Math.max(...last.cloudWidthRatios)>=.55,'a broad main cloud occupies at least 55% of screen width');
    assert(Math.max(...last.cloudWidthRatios)-Math.min(...last.cloudWidthRatios)>=.12,'visible near and far clouds have different scales');
    assert(first.cloudPositions.some(c=>last.cloudPositions.some(next=>next.shape===c.shape&&Math.abs(next.width-c.width)<c.width*.02&&Math.abs(next.y-c.y)<15&&Math.abs(next.x-c.x)>1&&Math.abs(next.x-c.x)<180)),'the same visible cloud continues to drift');
   }
   const bytes=await page.screenshot({path:path.join(output,'weather-'+id+'.png')});shots.push({label,data:'data:image/png;base64,'+bytes.toString('base64')});results.push({id,label,...last});
   console.log(id,JSON.stringify({cloudDraws:last.cloudDraws,cloudArea:last.cloudArea,rainCount:last.rainCount,rainLength:last.rainLength,rgb:last.rgb}));await leaveFullscreen(page);
  }
  const byId=Object.fromEntries(results.map(r=>[r.id,r])),clear=byId.noon,few=byId['few-clouds'],cloudy=byId.cloudy,overcast=byId.overcast,light=byId.drizzle,heavy=byId.downpour;
  assert(clear.cloudArea<.01,'clear sky does not retain a permanent cloud floor');assert(few.cloudArea>clear.cloudArea+.005,'few clouds are visible');assert(cloudy.cloudArea>few.cloudArea*1.4,'cloudy sky adds meaningful coverage');
  assert(clear.blueChroma>overcast.blueChroma+30,'overcast is visibly less blue');assert(light.luminance>heavy.luminance+8,'downpour darkens the actual sky');
  assert(heavy.rainCount>light.rainCount*2.5,'heavy rain has more streaks');assert(heavy.rainLength>light.rainLength*2,'heavy rain has longer streaks');assert(heavy.rainWidth>light.rainWidth*1.1,'heavy rain has stronger streaks');
  assert(light.rainWidth>=.9,'light rain stays visible in the weather raster');assert(light.rainLength>=5,'light rain has visible streak length');
  assert.equal(clear.rainCount,0);assert.equal(cloudy.rainCount,0);
  const textures=await page.evaluate(()=>Object.values(window.weatherCloudTextures));
  assert.equal(textures.length,6,'all six atlas cloud families reach the renderer');
  for(const texture of textures){assert(texture.width<=480&&texture.height<=320,'cloud texture memory stays bounded');assert(texture.blank>.03,`cloud ${texture.shape}: transparent space remains`);assert(texture.body>.005,`cloud ${texture.shape}: a visible cloud body exists`);assert(texture.soft>.002,`cloud ${texture.shape}: soft alpha edges remain`);assert(texture.lightRange>12,`cloud ${texture.shape}: internal shading is not flat`);}
  assert.equal(new Set(textures.map(t=>t.alphaHash)).size,6,'cloud families use distinct transparency patterns, not the same atlas cell');
  const contact=await browser.newPage({viewport:{width:1280,height:1176}});await contact.setContent('<canvas width="1280" height="1176"></canvas><style>body{margin:0;background:#13171e}</style>');
  const collage=await contact.evaluate(async shots=>{const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.fillStyle='#13171e';ctx.fillRect(0,0,c.width,c.height);for(let i=0;i<shots.length;i++){const im=new Image;im.src=shots[i].data;await im.decode();const x=i%2*640,y=Math.floor(i/2)*392;ctx.drawImage(im,x,y+32,640,360);ctx.fillStyle='#e8edf5';ctx.font='16px -apple-system, sans-serif';ctx.fillText(shots[i].label,x+16,y+23);}return c.toDataURL('image/png');},shots);fs.writeFileSync(path.join(output,'weather-contrast-contact.png'),Buffer.from(collage.split(',')[1],'base64'));await contact.close();
  await page.setViewportSize({width:390,height:844});const phone=[];
  for(const id of ['drizzle','downpour']){await page.locator('[data-preview="'+id+'"]').click();await page.locator('#fullscreen').click();await page.waitForTimeout(5500);const s=await sample(page);assert(s.rainCount>0);assert(s.cloudAspectRatios.length>0&&s.cloudAspectRatios.every(ratio=>ratio>=1.2),`${id}: phone clouds are not stretched vertically; horizontal rain mist may be wider: ${JSON.stringify(s.cloudAspectRatios)}`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));phone.push({id,...s});await page.screenshot({path:path.join(output,'phone-weather-'+id+'.png')});await leaveFullscreen(page);}
  assert(phone[1].rainCount>phone[0].rainCount*2.5);assert(phone[1].rainLength>phone[0].rainLength*2);assert(phone[0].rainWidth>=.9);assert(phone[0].rainLength>=5);assert.deepEqual(errors,[]);
  if(process.env.CLOCK_HTML)assert(requests.every(url=>/^https:\/\/(weather\.cma\.cn|api\.open-meteo\.com)\//.test(url)),'production only requests its weather providers');else assert.deepEqual(requests,[]);
  fs.writeFileSync(path.join(output,'weather-contrast-results.json'),JSON.stringify({pass:true,scope:'offline preview render at the same noon timeline; not a real network weather test or a naturalness judgment',errors,requests,textures,desktop:results,phone},null,2));console.log('PASS: six atlas cloud families, distinct weather renders, continuous animation, rain intensity, desktop/phone');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
