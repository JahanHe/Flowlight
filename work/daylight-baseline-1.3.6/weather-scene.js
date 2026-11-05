function clockWeatherAmounts(state) {
  const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
  const amount=(key,fallback)=>clamp(Number.isFinite(state[key])?state[key]:fallback?1:0);
  const layers={rain:amount('rainAmount',['rain','storm'].includes(state.condition)),snow:amount('snowAmount',state.condition==='snow'),fog:amount('fogAmount',state.condition==='fog'),storm:amount('stormAmount',state.condition==='storm'),hail:amount('hailAmount',state.hail),overcast:amount('overcastAmount',state.condition==='overcast')};
  layers.cover=Math.max(clamp(state.cloudCover),layers.storm*.98,layers.fog*.90,layers.overcast*.94,layers.rain*(.68+.20*clamp(state.intensity)),layers.snow*.70);
  return layers;
}
function clockDaylight(state) {
  const altitude=Number.isFinite(state.sunAltitude)?state.sunAltitude:['sunrise','sunset'].includes(state.phase)?3:60;
  const low=Math.max(0,Math.min(1,(12-altitude)/12)),warmth=low*low*(3-2*low);
  const cloud=clockWeatherAmounts(state).cover;
  const environmentWarmth=warmth*(1-cloud*.85);
  const tint=(amount,green,blue)=>[255,Math.round(255-(255-green)*amount),Math.round(255-(255-blue)*amount)].join(',');
  // ponytail: altitude controls a daylight-adapted palette, not a full atmospheric simulation.
  // Above 12 degrees direct light stays neutral; low-angle warmth is muted by cloud cover.
  return {warmth,environmentWarmth,rgb:tint(environmentWarmth,190,112),halo:tint(warmth,185,115),rim:tint(warmth,216,154)};
}
function clockLightSource(state, width, height) {
  const clamp=(n,low=0,high=1)=>Math.min(high,Math.max(low,Number.isFinite(n)?n:low));
  const smooth=(a,b,n)=>{const x=clamp((n-a)/(b-a));return x*x*(3-2*x);};
  const mix=(a,b,t)=>a+(b-a)*t;
  const hasAltitude=Number.isFinite(state.sunAltitude)&&(state.phase!=='night'||state.timeline);
  const sunAltitude=hasAltitude?state.sunAltitude:state.phase==='night'?-35:['sunrise','sunset'].includes(state.phase)?3:60;
  const moonAltitude=Number.isFinite(state.moonAltitude)?state.moonAltitude:42;
  const progress=clamp(Number.isFinite(state.sunProgress)?state.sunProgress:.5),moonProgress=clamp(Number.isFinite(state.moonProgress)?state.moonProgress:.88);
  const sunX=width*(.16+.68*progress),sunY=height*(.72-.53*Math.sin(hasAltitude?clamp(sunAltitude,-15,90)*Math.PI/180:progress*Math.PI));
  const moonX=Number.isFinite(state.moonProgress)?width*(.16+.68*moonProgress):width*.76;
  const moonY=Number.isFinite(state.moonAltitude)?height*(.72-.53*Math.sin(clamp(moonAltitude,-15,90)*Math.PI/180)):Number.isFinite(state.moonProgress)?height*(.72-.53*Math.sin(moonProgress*Math.PI)):height*.23;
  const daylight=smooth(-7,5,sunAltitude),blend=state.source==='sun'?1:state.source==='moon'?0:smooth(-6,2,sunAltitude);
  const cloud=clockWeatherAmounts(state).cover,phase=clamp(Number.isFinite(state.moonPhase)?state.moonPhase:.5);
  const moonLight=(1-Math.cos(phase*Math.PI*2))*.5;
  const t=Number.isFinite(state.motionTime)?state.motionTime:typeof performance!=='undefined'?performance.now()/1000:0;
  // ponytail: the shared soft light approximates two light sources at dusk; it is not ray tracing.
  const cloudShadow=1-cloud*(.04+.055*(.5+.5*Math.sin(t*.17+Math.sin(t*.041))));
  const sunVisible=state.sunVisible!==false&&sunAltitude>-.8,moonVisible=state.moonVisible!==false&&moonAltitude>-.8;
  const sunVisibility=(sunVisible?1:0)*smooth(-.8,2,sunAltitude)*clamp(1-cloud*1.04);
  const moonVisibility=(moonVisible?1:0)*smooth(-.8,2,moonAltitude)*(1-smooth(.35,.95,cloud));
  const sunStrength=(.11+(sunVisible?.89*smooth(-.8,9,sunAltitude):0))*(1-cloud*.80);
  const moonStrength=(.11+(moonVisible?.40*moonLight:0))*(1-cloud*.65);
  const strength=mix(moonStrength,sunStrength,blend)*cloudShadow;
  const warm=clockDaylight(state).rgb.split(',').map(Number),rgb=warm.map((n,i)=>Math.round(mix([180,207,242][i],n,blend))).join(',');
  const x=mix(moonX,sunX,blend),y=mix(moonY,sunY,blend),elevation=mix(moonAltitude,sunAltitude,blend);
  const visibility=clamp(mix(moonVisibility,sunVisibility,blend));
  const length=10+55*(1-Math.sin(clamp(elevation,0,90)*Math.PI/180));
  const dx=width*.5-x,dy=height*.54-y,distance=Math.max(1,Math.hypot(dx,dy));
  return {x,y,rgb,strength,shadowX:dx/distance*length,shadowY:dy/distance*length,elevation,isDay:blend>.5,visible:visibility>.001,visibility,daylight};
}
function createWeatherScene(canvas, reducedMotion, onPaint = () => {}) {
  const tv = window.clockTV === true;
  const full = !tv && window.clockFullEffects === true;
  const quality=()=>full?(window.clockQuality||{}):{},detail=()=>quality().detail||1;
  if(tv)window.clockTVFrameRate=20;
  let averagePaint=0;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setState() {} };
  let state = { phase:'unknown', condition:'clear', cloudCover:0, intensity:0, sunProgress:.5, moonPhase:.5, moonVisible:true, wind:0, variant:'' };
  let w=1,h=1,frame=0,lastPaint=0,lastFrameTime=0,cloudTime=0,starTravel=0,skyOrbit=0,lastDayProgress=null,rainTravel=0,snowTravel=0,windTravel=0,lastMotionTime=null,iceAmount=0,motionTime=0,immersion=0;
  let planetEpoch=null,starAtlas=null,galaxyStars=null,spiralLayers=null,detailCanvas=null,detailCtx=null;
  const skyImages=new Map();let frontCanvas=null,frontCtx=null,readableAreas=[],dateArea=null;
  function refreshReadableAreas(){dateArea=document.querySelector('.date-line')?.getBoundingClientRect();readableAreas=Array.from(document.querySelectorAll('.tile:not([hidden]),.date-line')).map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);}
  function foreground(){
    if(!frontCanvas){frontCanvas=document.createElement('canvas');frontCanvas.id='weather-foreground';frontCanvas.setAttribute('aria-hidden','true');frontCanvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;opacity:.32';const mask=getComputedStyle(canvas).maskImage||getComputedStyle(canvas).webkitMaskImage;frontCanvas.style.maskImage=mask;frontCanvas.style.webkitMaskImage=mask;(document.querySelector('.shell')||document.body).appendChild(frontCanvas);frontCtx=frontCanvas.getContext('2d');refreshReadableAreas();}
    const width=Math.max(1,Math.round(canvas.width*.65)),height=Math.max(1,Math.round(canvas.height*.65));
    if(frontCanvas.width!==width||frontCanvas.height!==height){frontCanvas.width=width;frontCanvas.height=height;frontCtx.setTransform(width/w,0,0,height/h,0,0);}
    return frontCtx;
  }
  function clearSkyDetail(){
    if(!full)return;
    if(!detailCanvas){
      detailCanvas=document.createElement('canvas');detailCanvas.id='sky-detail-canvas';detailCanvas.setAttribute('aria-hidden','true');
      detailCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen';
      const style=getComputedStyle(canvas),mask=style.maskImage||style.webkitMaskImage;detailCanvas.style.maskImage=mask;detailCanvas.style.webkitMaskImage=mask;
      canvas.insertAdjacentElement('afterend',detailCanvas);detailCtx=detailCanvas.getContext('2d');canvas.clockDetailCanvas=detailCanvas;
    }
    if(!detailCtx)return;
    // ponytail: sharp pinpoints use a separate 720p ceiling, while soft weather retains its smaller budget.
    const scale=Math.min(1.5,window.devicePixelRatio||1,Math.sqrt(1280*720/(w*h))),width=Math.max(1,Math.floor(w*scale)),height=Math.max(1,Math.floor(h*scale));
    if(detailCanvas.width!==width||detailCanvas.height!==height){detailCanvas.width=width;detailCanvas.height=height;}
    detailCtx.setTransform(width/w,0,0,height/h,0,0);detailCtx.clearRect(0,0,w,h);
    detailCanvas.clockPaintVersion=(detailCanvas.clockPaintVersion||0)+1;
  }
  function paintStarfield(t,cover,alpha){
    const target=full?detailCtx:ctx;if(!target)return;
    target.save();target.globalAlpha=alpha;starfield(t,cover,target);target.restore();
  }
  function softenForeground(){
    if(!frontCtx||!frontCanvas.width)return;
    frontCtx.save();frontCtx.globalCompositeOperation='destination-out';
    for(const r of readableAreas){frontCtx.save();frontCtx.translate(r.left+r.width/2,r.top+r.height/2);frontCtx.scale(r.width*.94,r.height*.94);const g=frontCtx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'rgba(0,0,0,.73)');g.addColorStop(.78,'rgba(0,0,0,.73)');g.addColorStop(1,'rgba(0,0,0,0)');frontCtx.fillStyle=g;frontCtx.fillRect(-1,-1,2,2);frontCtx.restore();}
    frontCtx.restore();
  }
  const clamp=(n,low=0,high=1)=>Math.min(high,Math.max(low,Number.isFinite(n)?n:low));
  const still=()=>typeof reducedMotion==='boolean'?reducedMotion:!!reducedMotion?.matches;
  const smooth=(a,b,n)=>{const x=clamp((n-a)/(b-a));return x*x*(3-2*x);};
  const wrap=(n,range)=>((n%range)+range)%range;
  let seed=1+Math.floor(Math.random()*2147483645);
  const random=()=>((seed=(seed*16807)%2147483647)-1)/2147483646;
  const noiseGrid=Float32Array.from({length:4096},random);
  function noise(x,y) {
    const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v);
    const a=noiseGrid[((iy&63)<<6)+(ix&63)],b=noiseGrid[((iy&63)<<6)+((ix+1)&63)];
    const c=noiseGrid[(((iy+1)&63)<<6)+(ix&63)],d=noiseGrid[(((iy+1)&63)<<6)+((ix+1)&63)];
    return (a+(b-a)*s)*(1-t)+(c+(d-c)*s)*t;
  }
  const fractal=(x,y)=>noise(x,y)*.55+noise(x*2.03+5,y*2.03+9)*.27+noise(x*4.11+17,y*4.11)*.13+noise(x*8.17,y*8.17+4)*.05;
  const stars=Array.from({length:full?560:390},()=>({x:random(),y:random()*.84,r:.30+random()**2*1.15,phase:random()*6.28,warm:random()>.8}));
  const particles=Array.from({length:full?660:470},()=>({x:random(),y:random(),z:random(),size:.65+random(),speed:.65+random()*.7,phase:random()*6.28})).sort((a,b)=>a.z-b.z);
  const clouds=Array.from({length:18},(_,i)=>({x:(i===0?.22:i===3?.72:(i%4)*.52)+random()*.18,y:.17+random()*.34,z:(i+Math.floor(i/3))%3,shape:[0,1,2,0,3,5,4,0,2,1,5,3,0,4,2,5,1,0][i],scale:.96+random()*.48,phase:random()*6.28}));
  const craters=Array.from({length:22},()=>({x:(random()-.5)*1.5,y:(random()-.5)*1.5,r:.035+random()*.10}));
  const cloudFields=new Map(),cloudSprites=new Map();
  const cloudFrames=clouds.map(()=>({}));let cloudCount=0,solarTransmission=1;
  // Method references: github.com/g3sthousen/weather-animations/blob/main/src/core/clouds.ts
  // and src/core/particles.ts: cached clouds, depth layers and time-based gusts. This renderer is independent.
  function cloudField(shape) {
    if(cloudFields.has(shape))return cloudFields.get(shape);
    // ponytail: six 320px cloud fields and at most 30 tinted/rim sprites use under 8 MiB;
    // quality changes reuse them rather than blocking a frame with repeated noise generation.
    const sw=full?320:512,sh=sw*5/8,field=new Uint8Array(sw*sh),alpha=new Uint8Array(sw*sh);
    // ponytail: bake turbulent density once, then move six cached cloud banks. No per-frame volume marching.
    // Cumulus, cirrus, stratocumulus, altocumulus, cumulonimbus and rain sheet have distinct connected structures.
    const family=full?shape%6:0,lobes=[];
    if(family===0)lobes.push({x:0,y:.23,rx:1.03,ry:.30});
    if(family===2||family===3)lobes.push({x:0,y:.12,rx:1.16,ry:family===2?.42:.28});
    if(family===4)lobes.push({x:-.12,y:.18,rx:.82,ry:.42},{x:.13,y:-.54,rx:.91,ry:.22});
    if(family===5)lobes.push({x:0,y:0,rx:1.36,ry:.53});
    const count=[13,10,16,22,18,9][family];
    for(let i=0;i<count;i++){
      const n=noise(i*3.1+shape*9,7),m=noise(i*2.7+8,shape+19),u=i/(count-1);
      if(family===1){lobes.push({x:-.94+u*1.85,y:-.15+u*u*.40,rx:.36+n*.26,ry:.09+m*.09});continue;}
      const x=(n-.5)*(family===4?1.05:2.0),cap=1-Math.abs(x)*.65;
      lobes.push({x,y:family===4?-.55+m*.91:family===3?-.18+m*.36:.15-m*cap*.58,rx:family===3?.14+n*.13:.24+n*.22,ry:family===3?.10+m*.13:family===5?.16+m*.12:.24+m*.24});
    }
    for(let y=0;y<sh;y++)for(let x=0;x<sw;x++) {
      const px=x/sw,py=y/sh,u=(px-.5)*2.7,v=(py-.5)*2.1;
      const warp=fractal(px*4+shape*7,py*4+11)-.5;
      const wx=u+warp*.22,wy=v+(noise(px*7+3,py*5+shape*7)-.5)*.13;
      let envelope=-1;
      for(const lobe of lobes){const e=1-((wx-lobe.x)/lobe.rx)**2-((wy-lobe.y)/lobe.ry)**2,join=Math.max(0,.5-Math.abs(e-envelope))/.5;envelope=Math.max(envelope,e)+join*join*.125;}
      const texture=fractal(px*13+warp*.8+shape*12,py*(family===1?42:14)+warp+shape*4);
      const fine=fractal(px*38+shape*9,py*36+shape*5);
      let density=envelope+(texture-.5)*1.25+(fine-.5)*.24;
      if(family===1)density*=smooth(.25,.66,fractal(px*3+shape,py*34+u*.9));
      const i=y*sw+x;
      field[i]=clamp(texture*.48+Math.sqrt(Math.max(0,envelope))*.44+fine*.08)*255;
      const border=smooth(0,.10,px)*smooth(0,.10,1-px)*smooth(0,.10,py)*smooth(0,.10,1-py);
      const base=family===0?1-smooth(.32,.58,v+warp*.08):1;
      alpha[i]=smooth(family===1?0:-.16,family===1?.50:.55,density)*base*border*255*(family===1?.68:family===3?.76:.98);
    }
    const result={width:sw,height:sh,field,alpha};cloudFields.set(shape,result);return result;
  }
  function cloudSprite(shape,palette) {
    const key=shape+':'+palette;
    if(cloudSprites.has(key))return cloudSprites.get(key);
    const source=cloudField(shape),off=document.createElement('canvas');off.width=source.width;off.height=source.height;
    const c=off.getContext('2d'),pixels=c.createImageData(off.width,off.height),data=pixels.data;
    const rgb=palette==='night'?[132,151,181]:palette==='storm'?[133,147,163]:palette==='warm'?[252,210,178]:[238,244,248];
    for(let y=0;y<off.height;y++)for(let x=0;x<off.width;x++) {
      const i=y*off.width+x,j=i*4;
      const divisor=255,above=source.field[Math.max(0,i-off.width*6)]/divisor,below=source.field[Math.min(source.field.length-1,i+off.width*6)]/divisor;
      const relief=clamp(.91-y/off.height*.32+source.field[i]/divisor*.20+(below-above)*.32,.50,1.04);
      data[j]=rgb[0]*relief;data[j+1]=rgb[1]*relief;data[j+2]=rgb[2]*relief;data[j+3]=source.alpha[i];
      if(palette==='rim') {
        // ponytail: cache a thin cloud boundary once; live sunlight only changes its intensity/position.
        const inset=source.alpha[Math.max(0,i-off.width*2)];
        data[j]=255;data[j+1]=252;data[j+2]=244;data[j+3]=Math.max(0,source.alpha[i]-inset)*.55;
      }
    }
    c.putImageData(pixels,0,0);cloudSprites.set(key,off);return off;
  }
  function discardSkyImage(image){if(image instanceof HTMLCanvasElement)image.width=image.height=0;else{image.onload=null;image.src='';}}
  function spaceSprite(kind) {
    if(skyImages.has(kind)){const image=skyImages.get(kind);return image.complete&&image.naturalWidth?image:null;}
    const asset=window.clockSkyAssets&&window.clockSkyAssets[kind];if(!asset)return null;
    // ponytail: 1280px dust keeps fine stars in separate vector paths; decoded sky assets stay under 5 MiB.
    if(!['galaxy','spiral'].includes(kind))for(const [key,image]of skyImages)if(!['galaxy','spiral'].includes(key)){discardSkyImage(image);skyImages.delete(key);}
    const image=new Image();image.clockTexture=kind;
    if(kind==='galaxy')image.onload=()=>{
      if(skyImages.get(kind)!==image||!image.naturalWidth)return;
      const small=document.createElement('canvas');small.width=1280;small.height=640;small.clockTexture=kind;
      small.getContext('2d').drawImage(image,0,0,small.width,small.height);
      small.complete=true;small.naturalWidth=small.width;small.naturalHeight=small.height;skyImages.set(kind,small);discardSkyImage(image);
    };
    skyImages.set(kind,image);image.src=asset.src;return image.complete&&image.naturalWidth?image:null;
  }
  function cachedStars(galactic=false){
    if(galactic?galaxyStars:starAtlas)return galactic?galaxyStars:starAtlas;
    // ponytail: cached vector paths preserve subpixel stars without raster-atlas enlargement or per-frame point loops.
    // Nine filled paths per star family cover 1460 points; resize rebuilds the paths, not a giant texture.
    const span=galactic?Math.min(w*.91,h*1.48):Math.hypot(w,h)*1.05,points=galactic?window.clockSkyStars||[]:stars;
    const layers=Array.from({length:3},()=>Array.from({length:3},(_,bucket)=>{const path=new Path2D();path.clockTexture=galactic?'galaxy-stars':'starfield';path.clockPointRadius=[.27,.42,.68][bucket];path.clockStarCount=0;return path;}));
    for(let i=0;i<points.length;i++){
      const p=points[i],brightness=galactic?p[3]:p.r/1.45,bucket=brightness>.78?2:brightness>.44?1:0,path=layers[i%3][bucket];
      const x=((galactic?p[0]/2048:p.x)-.5)*span,y=((galactic?p[1]/1024:p.y)-(galactic?.5:.42))*span*(galactic?.5:1),r=path.clockPointRadius;
      path.moveTo(x+r,y);path.arc(x,y,r,0,Math.PI*2);path.clockStarCount++;
    }
    const result={layers,span};if(galactic)galaxyStars=result;else starAtlas=result;return result;
  }
  function drawStarPaths(target,stars,alpha){
    for(let bucket=0;bucket<3;bucket++){target.fillStyle=`rgba(${['196,216,244','218,232,250','241,245,252'][bucket]},${alpha*[.46,.70,.94][bucket]})`;target.fill(stars[bucket]);}
  }
  const galaxyShift=(v,t,span)=>span*(.020*Math.sin(t*.18+v*4.7)+.010*Math.sin(t*.29+v*11.3));
  function deepSky(t,angle,target) {
    if(immersion<=.001)return;
    const ctx=target,sky=spaceSprite('galaxy'),rotation=-.24+Math.sin(angle*.25)*.16+t*.009;
    // Keep the whole luminous band inside the safe sky, even as its angle changes.
    const span=Math.min(w*.91/(Math.abs(Math.cos(rotation))+.5*Math.abs(Math.sin(rotation))),h*.74/(Math.abs(Math.sin(rotation))+.5*Math.abs(Math.cos(rotation))));
    if(sky){
      ctx.save();ctx.globalAlpha*=immersion*.83;ctx.globalCompositeOperation='screen';ctx.translate(w*.5,h*.44);ctx.rotate(rotation);
      ctx.drawImage(sky,-span*.5,-span*.25,span,span*.5);
      const opacity=ctx.globalAlpha;ctx.globalAlpha*=.24;
      for(let i=0;i<4;i++){const v=(i+.5)/4,shift=galaxyShift(v,t,span);ctx.drawImage(sky,0,i*sky.naturalHeight/4,sky.naturalWidth,sky.naturalHeight/4,-span*.5+shift,-span*.25+i*span/8,span,span/8+.1);}
      const field=cachedStars(true);ctx.globalAlpha=opacity;
      for(let layer=0;layer<3;layer++){
        ctx.save();ctx.globalAlpha*=.76+.20*Math.sin(t*(.28+layer*.07)+layer)**2;
        ctx.rotate(t*(.007+layer*.006));const dx=galaxyShift((layer+.5)/3,t,span),dy=Math.sin(t*(.06+layer*.017)+layer)*span*.004;
        ctx.translate(dx,dy);ctx.scale(span/field.span,span/field.span);drawStarPaths(ctx,field.layers[layer],1);ctx.restore();
      }
      ctx.restore();
    }
    const spiral=spaceSprite('spiral');if(spiral){
      if(!spiralLayers){
        // Cached feathered annuli let the arms flow relative to the nucleus: three 256px textures, <0.8 MiB.
        spiralLayers=Array.from({length:3},(_,band)=>{
          const layer=document.createElement('canvas');layer.width=layer.height=256;layer.clockTexture='spiral';layer.clockBand=band;
          const c=layer.getContext('2d');c.drawImage(spiral,0,0,256,256);c.globalCompositeOperation='destination-in';
          const mask=c.createRadialGradient(128,128,0,128,128,181);
          const weights=[[1,1,0,0,0,0],[0,0,1,1,0,0],[0,0,0,0,1,1]],stops=[0,.12,.24,.38,.55,1];
          stops.forEach((stop,i)=>mask.addColorStop(stop,`rgba(255,255,255,${weights[band][i]})`));c.fillStyle=mask;c.fillRect(0,0,256,256);return layer;
        });
      }
      const size=Math.min(w,h)*.25;
      ctx.save();ctx.globalAlpha*=immersion*.78;ctx.globalCompositeOperation='screen';ctx.translate(w*(w>h?.67:.5)+Math.sin(t*.009)*w*.012,h*.27);
      for(let band=0;band<3;band++){
        ctx.save();ctx.rotate(-.55+t*(.027+band*.011));const breath=1+Math.sin(t*.19+band)*.006;
        ctx.drawImage(spiralLayers[band],-size*breath/2,-size*breath/2,size*breath,size*breath);ctx.restore();
      }
      ctx.restore();
    }
    ctx.save();ctx.globalAlpha*=immersion;
    for(let i=0;i<Math.round(48*detail());i++) {
      const p=stars[i],depth=wrap(p.phase/6.28-t*(.009+i%3*.003),1),scale=.42/(depth+.20);
      const x=w*(.5+(p.x-.5)*scale*1.65),y=h*(.39+(p.y-.42)*scale*1.6);
      if(x<0||x>w||y<0||y>h)continue;
      const fade=smooth(0,.10,depth)*(1-smooth(.87,1,depth)),center=1-.60*(1-smooth(.14,.40,Math.abs(x/w-.5)))*(1-smooth(.10,.28,Math.abs(y/h-.55)));
      const a=fade*center*(.24+p.r*.30)*(.84+Math.sin(t*.55+p.phase)*.16),r=Math.min(.95,(.16+p.r*.26)*scale);
      ctx.fillStyle=`rgba(211,229,250,${a})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function passingJupiter(t,target) {
    if(immersion<=.001)return;
    const ctx=target;
    if(planetEpoch===null)planetEpoch=t;
    const planets=['jupiter','saturn','mars','venus','neptune','mercury','uranus'],elapsed=t-planetEpoch,kind=planets[Math.floor(elapsed/32)%planets.length];
    const image=spaceSprite(kind),age=wrap(elapsed,32),p=clamp((age-3)/23),alpha=smooth(3,5,age)*(1-smooth(23,27,age));
    if(!image||alpha<=.001)return;
    const x=w*(.76-.53*p),y=h*(.29+Math.sin(p*Math.PI)*.025),size=Math.min(w,h)*(.035+(kind==='saturn'?.38:.29)*p*p),ratio=image.naturalHeight/image.naturalWidth;
    const protection=dateArea?1-.88*smooth(0,.30,Math.min((dateArea.width/2+size/2-Math.abs(x-dateArea.left-dateArea.width/2))/size,(dateArea.height/2+size*ratio/2-Math.abs(y-dateArea.top-dateArea.height/2))/(size*ratio))):1;
    // A gentle presentation rotation, not a claim about the planet's physical rotation period.
    ctx.save();ctx.globalAlpha*=immersion*alpha*.88*protection;ctx.translate(x,y);ctx.rotate(.08+t*.012);
    ctx.drawImage(image,-size*.5,-size*ratio*.5,size,size*ratio);ctx.restore();
  }
  function aurora(t,cover,target){
    const ctx=target;
    if(immersion<=.001)return;
    const strength=immersion*(1-cover)*(state.idealPolar==='night'?.8:.28+.18*Math.sin(t*.026));
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let layer=0;layer<3;layer++){
      const ridge=u=>h*(.19+layer*.028+Math.sin(u*5.5+t*.08+layer*.55)*.065+Math.sin(u*13-t*.045)*.025);
      const height=u=>h*(.08+.09*(.5+.5*Math.sin(u*9+t*.14+layer)))*Math.sin(u*Math.PI);
      const g=ctx.createLinearGradient(0,h*.02,0,h*.40);g.addColorStop(0,'rgba(32,87,148,0)');g.addColorStop(.35,`rgba(47,138,193,${strength*.08})`);g.addColorStop(.68,`rgba(72,215,161,${strength*.16})`);g.addColorStop(1,'rgba(72,203,162,0)');
      ctx.beginPath();for(let i=0;i<=96;i++){const u=i/96,x=w*(.05+u*.90),y=ridge(u)-height(u);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
      for(let i=96;i>=0;i--){const u=i/96;ctx.lineTo(w*(.05+u*.90),ridge(u));}ctx.closePath();ctx.fillStyle=g;ctx.fill();
    }
    ctx.restore();
  }
  function cloudWeatherWeight(shape,layers){
    const depth=smooth(.2,.85,layers.cover);
    return [1,.36*(1-depth*.6),.16+depth*.84,.18+depth*.60,.03+layers.storm*.97,.06+Math.max(layers.rain,layers.overcast,layers.storm)*.94][shape];
  }
  function flightClouds(t,daylight,layers) {
    if(immersion<=.001||daylight<=.01)return;
    const dark=Math.max(layers.storm,layers.overcast,layers.rain),density=.14+.86*layers.cover,front=foreground();
    for(let i=0;i<8;i++) {
      const p=clouds[i],near=i>=5,age=wrap((near?(i-5)/3:p.phase/6.28)+t*(near?.020:.012+p.z*.002),1),depth=.45+age*age*(near?1.7:1.3);
      const vx=near?[-.37,.37,-.26][i-5]:(p.x/1.8-.5)*1.9,vy=near?[-.24,-.14,.26][i-5]:(p.y-.32)*.85;
      const x=w*(.5+vx*depth+Math.sin(t*.10+p.phase)*age*.025),y=h*((near?.49:.28)+vy*depth);
      const width=w*(near?.48:.30)*p.scale*depth,height=width*.625,cross=near?smooth(.42,.68,age):0;
      const alpha=immersion*daylight*density*smooth(0,.10,age)*(1-smooth(.82,1,age))*(near?.90:.45)*(1-layers.fog*.65)*cloudWeatherWeight(p.shape,layers);
      // The same cloud amount reaches both sides of the digits; the palette fades with weather too.
      for(const [palette,weight]of [['day',1-dark],['storm',dark]])if(weight>.001) {
        const sprite=cloudSprite(p.shape,palette);
        ctx.save();ctx.globalAlpha=alpha*weight*.32*(1-cross);ctx.drawImage(sprite,x-width*.5,y-height*.5,width,height);ctx.restore();
        if(cross>.001){front.save();front.globalAlpha=alpha*weight*cross;front.drawImage(sprite,x-width*.5,y-height*.5,width,height);front.restore();}
      }
    }
    softenForeground();
  }
  function glow(x,y,rx,ry,color,opacity=1,target) {
    const c=target||ctx;
    c.save();c.translate(x,y);c.scale(rx,ry);
    const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(${color},${opacity})`);g.addColorStop(.35,`rgba(${color},${opacity*.42})`);g.addColorStop(1,`rgba(${color},0)`);
    c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();
  }
  function sun(t,cover) {
    const source=clockLightSource({...state,source:'sun'},w,h);
    const {x,y}=source,light=clockDaylight(state),tint=light.halo;
    const r=Math.max(13,Math.min(w,h)*(.027+.005*light.warmth));
    const visibility=source.visibility*(full?.30+.70*solarTransmission:1);
    const motion=state.idealCycle?1.8:1;
    const breath=.94+Math.sin(t*.31*motion)*.065+Math.sin(t*.71*motion)*.025;
    const driftX=Math.sin(t*.11*motion)*r*1.2,driftY=Math.cos(t*.15*motion)*r*.8;
    glow(x+driftX,y+driftY,r*(16+Math.sin(t*.19)),r*(12+Math.cos(t*.17)),tint,(.21+.08*light.warmth)*(1-cover*.86)*breath*source.daylight);
    glow(x-driftX*1.8,y-driftY,r*9,r*5.5,'226,240,255',.07*breath*source.daylight);
    if(full&&source.daylight>.01&&source.visibility>.01) {
      // Soft shafts fan out from this sun through the same moving cloud openings, behind the clouds.
      const scattering=(1-solarTransmission)*(1-cover*.78)*source.daylight;
      if(scattering>.005)for(let i=0;i<5;i++) {
        const angle=-.58+i*.29+Math.sin(t*.07+i)*.035,length=h*(.45+i%2*.12),spread=.025+.018*(.5+.5*Math.sin(t*.13+i));
        const beam=ctx.createRadialGradient(x,y,r,x,y,length);beam.addColorStop(0,`rgba(${tint},${scattering*.14})`);beam.addColorStop(.48,`rgba(${tint},${scattering*.07})`);beam.addColorStop(1,`rgba(${tint},0)`);
        ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(angle-spread)*length,y+Math.cos(angle-spread)*length);ctx.lineTo(x+Math.sin(angle+spread)*length,y+Math.cos(angle+spread)*length);ctx.closePath();ctx.fill();ctx.restore();
      }
    }
    if(visibility<=.01)return;
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=visibility;
    glow(x,y,r*7.5*breath,r*7.5*breath,tint,.18+.04*light.warmth);
    const corona=ctx.createRadialGradient(x,y,0,x,y,r*2.5);
    corona.addColorStop(0,'rgba(255,255,255,1)');corona.addColorStop(.28,'rgba(255,255,255,.99)');
    corona.addColorStop(.38,`rgba(${light.rim},.94)`);
    corona.addColorStop(.47,`rgba(${tint},.48)`);
    corona.addColorStop(.67,`rgba(${tint},.12)`);corona.addColorStop(1,`rgba(${tint},0)`);
    ctx.fillStyle=corona;ctx.fillRect(x-r*2.5,y-r*2.5,r*5,r*5);
    ctx.translate(x,y);ctx.rotate(-.22+Math.sin(t*.07)*.025);glow(0,0,r*8,r*.6,tint,.04*breath);ctx.restore();
  }
  function moon(t) {
    const source=clockLightSource({...state,source:'moon'},w,h);
    if(!source.visible)return;
    const {x,y}=source,r=Math.max(13,Math.min(w,h)*.031),breath=.94+Math.sin(t*.33)*.06;
    const daylight=clockLightSource(state,w,h).daylight,dayMoon=full?daylight*.26*Math.sin(state.moonPhase*Math.PI*2)**2:0;
    ctx.save();ctx.globalAlpha=clamp((1-daylight)*1.1+dayMoon)*clamp(source.visibility*1.3);
    if(ctx.globalAlpha<=0){ctx.restore();return;}
    glow(x,y,r*7*breath,r*7*breath,'155,184,223',.14*(1-state.cloudCover*.55)*(1-daylight));
    glow(x,y,r*2.2,r*2.2,'201,221,243',.11*(1-daylight));
    ctx.save();ctx.translate(x,y);
    if(daylight<.999){const alpha=ctx.globalAlpha;ctx.globalAlpha*=1-daylight;ctx.fillStyle='#172234';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=alpha;}
    if(state.moonPhase>.5)ctx.scale(-1,1);
    const k=-Math.cos(state.moonPhase*Math.PI*2);
    ctx.beginPath();ctx.arc(0,0,r,-Math.PI/2,Math.PI/2);ctx.ellipse(0,0,Math.max(.001,Math.abs(k)*r),r,0,Math.PI/2,Math.PI*1.5,k<0);ctx.closePath();ctx.clip();
    const light=ctx.createRadialGradient(-r*.28,-r*.32,0,0,0,r*1.1);light.addColorStop(0,'#e9eee9');light.addColorStop(.7,'#bdc9d0');light.addColorStop(1,'#8fa2b4');ctx.fillStyle=light;ctx.fillRect(-r,-r,r*2,r*2);
    for(const crater of craters)glow(crater.x*r,crater.y*r,crater.r*r*1.2,crater.r*r,'70,91,114',.12);
    ctx.restore();ctx.restore();
  }
  function starfield(t,cover,target) {
    const ctx=target;
    const visibility=(1-smooth(.2,.92,cover))**1.5;
    if(visibility<.001)return;
    ctx.save();ctx.globalAlpha*=visibility;
    // The pole stays fixed while the sky turns. Preview time speeds the orbit, not the twinkle.
    const orbit=full?skyOrbit:(state.idealCycle||state.timeline)&&Number.isFinite(state.dayProgress)?state.dayProgress*Math.PI*2:state.idealPolar==='night'?t*.022:t*Math.PI*2/86164;
    // ponytail: full mode gently accelerates the live sky, not astronomical sidereal time.
    // Accumulated one-way rotation stays visible without reversing or resetting on weather changes.
    const angle=orbit+(full?starTravel:0);
    const cos=Math.cos(angle),sin=Math.sin(angle),span=Math.hypot(w,h)*1.05;
    const ideal=state.idealCycle||state.idealPolar==='night',rich=ideal||state.enhancedSky||full;
    deepSky(t,angle,ctx);
    if(ideal&&immersion<.99) {
      ctx.save();ctx.translate(w*.5,h*.19);ctx.rotate(angle-.4);
      glow(0,h*.25,w*.60,h*.13,'145,169,218',.075*(1-cover),ctx);
      glow(w*.11,h*.24,w*.30,h*.075,'185,199,232',.045*(1-cover),ctx);
      ctx.restore();
    }
    if(full){
      const field=cachedStars();
      for(let layer=0;layer<3;layer++){
        ctx.save();ctx.translate(w*.5,h*.43);ctx.rotate(angle*(.90+layer*.10));ctx.globalAlpha*=.72+.20*Math.sin(t*(.32+layer*.08)+layer)**2;
        const shift=Math.sin(t*(.06+layer*.02)+layer)*span*.008;ctx.translate(shift,0);drawStarPaths(ctx,field.layers[layer],1);ctx.restore();
      }
    }else for(let i=0;i<Math.min(stars.length,rich?390:260);i++) {
      const p=stars[i],sparkle=.66+Math.sin(t*(.27+p.r*.1)+p.phase)*.20+Math.sin(t*.93+p.phase*3)*.06;
      const dx=(p.x-.5)*span,dy=(p.y-.42)*span,x=w*.5+dx*cos-dy*sin,y=h*.19+dx*sin+dy*cos;
      if(x<-5||x>w+5||y<-5||y>h+5)continue;
      const a=clamp(sparkle*(1-cover*.91)*(.45+p.r*.3)*(rich?1.55:1));
      ctx.fillStyle=`rgba(${p.warm?'249,231,208':'210,228,249'},${a})`;ctx.beginPath();ctx.arc(x,y,p.r,0,Math.PI*2);ctx.fill();
      if(p.r>1.2)glow(x,y,p.r*3.2,p.r*3.2,'175,203,241',a*.13,ctx);
    }
    if(ideal&&!still()) {
      const elapsed=Number.isFinite(state.cycleElapsed)?state.cycleElapsed:t,period=6.2,age=wrap(elapsed+2,period),pass=Math.floor((elapsed+2)/period);
      if(age<.85) {
        const progress=age/.85,alpha=Math.sin(progress*Math.PI)*.46*(1-cover),length=Math.min(130,w*.16);
        const x=w*(.25+.25*(.5+.5*Math.sin(pass*2.1)))+progress*w*.17,y=h*(.16+.14*(.5+.5*Math.cos(pass*3.7)))+progress*h*.12;
        const tail=ctx.createLinearGradient(x-length,y-length*.48,x,y);tail.addColorStop(0,'rgba(193,217,248,0)');tail.addColorStop(1,`rgba(220,234,252,${alpha})`);
        ctx.strokeStyle=tail;ctx.lineWidth=1;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x-length,y-length*.48);ctx.lineTo(x,y);ctx.stroke();
      }
    }
    aurora(t,cover,ctx);
    passingJupiter(t,ctx);
    ctx.restore();
  }
  function prepareClouds(t,daylight,layers) {
    // ponytail: retain a few drifting clouds on clear days without imposing a permanent 46% cloud floor.
    const cover=layers.cover,depth=smooth(.2,.85,cover),density=full?.14+.86*cover:Math.max(.20,cover),source=clockLightSource({...state,source:'sun'},w,h);
    cloudCount=Math.min(clouds.length,Math.round(14*(full?detail():1)));solarTransmission=1;
    for(let i=0;i<cloudCount;i++) {
      const p=clouds[i],layer=p.z,motion=full?cloudTime:t;
      const speed=full?(layer===1?-.0062:.0048+layer*.0045)*(.75+noise(i+14,p.phase)*.65):.0036+layer*.0042;
      const gust=full?(noise(motion*.035+p.phase,i+10)-.5)*.14:Math.sin(t*.10+p.phase)*.014+Math.sin(t*.027+p.phase)*.009;
      const baseWidth=w*(.62+layer*.13)*p.scale*(full?[1,1.16,1.2,.95,.88,1.35][p.shape]:1),margin=baseWidth*1.05;
      const width=baseWidth*(.95+noise(motion*.032+p.phase,i+37)*.10);
      // Wrap only once the complete cloud bank is off screen, including the enlarged near clouds.
      const x=wrap(p.x*w+cloudTime*speed*w+gust*w+margin*.5,w+margin)-margin*.5;
      const y=(p.y+(full?(noise(motion*.04+p.phase,i+23)-.5)*.10:Math.sin(t*.035+p.phase)*.020+(state.idealCycle?(noise(t*.025+i,23)-.5)*.08:0)))*h;
      const weatherWeight=cloudWeatherWeight(p.shape,layers);
      const opacity=density*(.14+.98*daylight)*(1-layer*.10)*(1-layers.fog*.72)*(i<6?1:.30+depth*.70)*weatherWeight;
      const alpha=clamp(opacity*(.88+noise(motion*.05+p.phase,i+51)*.24)*(state.idealCycle?1.2:1.05),0,.78);
      const drawHeight=width*.625*(.96+noise(motion*.045+p.phase,i+63)*.08);
      const left=x-width*.5,top=y-drawHeight*.5,c=cloudFrames[i];Object.assign(c,{x,y,left,top,width,height:drawHeight,alpha,shape:p.shape});
      if(full&&daylight>.001) {
        const u=(source.x-left)/width,v=(source.y-top)/drawHeight;
        if(u>0&&u<1&&v>0&&v<1) {
          const field=cloudField(p.shape),fx=u*(field.width-1),fy=v*(field.height-1),ix=Math.floor(fx),iy=Math.floor(fy),a=fx-ix,b=fy-iy;
          const index=iy*field.width+ix,at=field.alpha;
          const coverage=((at[index]*(1-a)+at[index+1]*a)*(1-b)+(at[index+field.width]*(1-a)+at[index+field.width+1]*a)*b)/255;
          solarTransmission*=1-coverage*alpha*.96;
        }
      }
    }
    // The same actual moving cloud coverage dims the solar disk, glass lighting and the companion.
    canvas.clockSolarTransmission=solarTransmission;
  }
  function cloudscape(t,daylight,layers) {
    const cover=layers.cover,dark=Math.max(layers.storm,layers.rain*.8,layers.overcast),warm=(1-layers.storm)*(1-layers.fog)*clockDaylight(state).environmentWarmth*daylight;
    const source=clockLightSource({...state,source:'sun'},w,h);
    for(let i=0;i<cloudCount;i++) {
      const c=cloudFrames[i],{left,top,width,height,alpha,shape}=c;
      ctx.save();ctx.globalAlpha=alpha*daylight*(1-warm)*(1-dark);
      if(ctx.globalAlpha>.001)ctx.drawImage(cloudSprite(shape,'day'),left,top,width,height);
      if(dark>.001&&daylight>.001){ctx.globalAlpha=alpha*daylight*(1-warm)*dark;ctx.drawImage(cloudSprite(shape,'storm'),left,top,width,height);}
      if(daylight<.999){ctx.globalAlpha=alpha*(1-daylight);ctx.drawImage(cloudSprite(shape,'night'),left,top,width,height);}
      if(warm>.001){ctx.globalAlpha=alpha*warm;ctx.drawImage(cloudSprite(shape,'warm'),left,top,width,height);}
      if(full&&daylight>.001&&source.visibility>.01) {
        const dx=source.x-c.x,dy=source.y-(top+height*.5),near=Math.exp(-((dx/(width*.7))**2+(dy/(height*1.2))**2)),distance=Math.max(1,Math.hypot(dx,dy));
        ctx.globalCompositeOperation='screen';ctx.globalAlpha=alpha*daylight*(1-dark*.9)*near*.85*source.visibility;
        ctx.drawImage(cloudSprite(shape,'rim'),left+dx/distance*1.5,top+dy/distance*1.5,width,height);
      }
      ctx.restore();
    }
    if(cover>.75){const color=[16,25,41].map((n,i)=>Math.round(n+([121,140,158][i]*(1-layers.storm)+[38,50,70][i]*layers.storm-n)*daylight)).join(',');glow(w*.5,h*.2,w*.65,h*.38,color,(cover-.75)*1.1);}
  }
  function mist(t,daylight,heavy,amount=1) {
    const color=[114,137,163].map((n,i)=>Math.round(n+([196,211,219][i]-n)*daylight)).join(',');
    for(let i=0;i<7;i++) {
      const p=clouds[i],x=(wrap(p.x+t*(.0025+i*.0006),2)-.5)*w;
      const y=h*(.28+i*.075+Math.sin(t*.10+p.phase)*.016),width=w*(.65+i*.025),height=h*(.10+i*.009);
      const alpha=(heavy?.17:.045)*(1+i*.04)*amount;
      ctx.save();ctx.globalAlpha=alpha*daylight;if(daylight>.001)ctx.drawImage(cloudSprite(p.shape,'day'),x-width*.5,y-height*.5,width,height);
      ctx.globalAlpha=alpha*(1-daylight);if(daylight<.999)ctx.drawImage(cloudSprite(p.shape,'night'),x-width*.5,y-height*.5,width,height);ctx.restore();
      if(heavy)glow(x,y,width*.65,height*1.4,color,(.055+state.intensity*.025)*amount);
    }
  }
  function precipitation(t,daylight,kind,amount) {
    const snow=kind==='snow',hail=kind==='hail',drizzle=1-smooth(.16,.35,state.intensity);
    const wind=clamp(state.wind,0,85),gust=Math.sin(t*.44)*.16+Math.sin(t*.19+1)*.09;
    const count=Math.min(particles.length,Math.round(((snow?115:hail?80:175-drizzle*75)+state.intensity*(snow?230:hail?120:290))*(full?detail():1)));
    ctx.save();ctx.globalAlpha*=amount;
    for(let i=0;i<count;i++) {
      const p=particles[i],z=.30+p.z*.70;
      const sway=snow?Math.sin(t*(.32+p.z*.25)+p.phase)*(.008+p.z*.008):0;
      const x=(wrap(p.x+t*(snow?.012:.018)+windTravel*(snow?.0012:.0008)*z+(gust*.025+sway)*z,1.4)-.20)*w;
      const y=(wrap(p.y+(snow?snowTravel:rainTravel)*z*p.speed,1.3)-.15)*h;
      const opacity=(snow?.20+p.z*.40:.09+p.z*.28)*(.83+.17*daylight);
      if(snow) {
        const size=(.45+p.z*2.0)*p.size;
        if(p.z>.82)glow(x,y,size*2,size*2,'232,242,251',opacity*.30);
        ctx.fillStyle=`rgba(237,245,250,${opacity})`;ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();
      } else if(hail) {
        const size=.75+p.z*2.0;ctx.fillStyle=`rgba(214,233,248,${opacity+.14})`;ctx.beginPath();ctx.ellipse(x,y,size,size*.8,.2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=`rgba(255,255,255,${opacity})`;ctx.beginPath();ctx.arc(x-size*.2,y-size*.2,size*.3,0,Math.PI*2);ctx.fill();
      } else {
        const length=((8+p.z*22)*(1-drizzle)+(3+p.z*6)*drizzle)*(1-iceAmount*.28)*(h/800+.25);
        const dx=length*(.10+wind*.011+gust*.18),dy=length;
        const tail=ctx.createLinearGradient(x,y,x+dx,y+dy);
        const color=[174,204,225].map((n,i)=>Math.round(n+([210,237,250][i]-n)*iceAmount)).join(',');tail.addColorStop(0,`rgba(${color},0)`);tail.addColorStop(1,`rgba(${color},${opacity})`);
        ctx.strokeStyle=tail;ctx.lineWidth=.55-drizzle*.10+p.z*.65;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();
      }
    }
    // Tiny lower-sky ripples add depth without inventing a ground plane behind the clock.
    if(!snow&&!hail&&drizzle<.99)for(let i=0;i<10;i++) {
      const p=particles[i*7],age=wrap(t*(.6+p.speed*.2)+p.phase,1);
      const x=w*(.18+p.x*.64),y=h*(.70+p.y*.10),r=age*(5+p.z*9);
      ctx.strokeStyle=`rgba(159,189,211,${(1-age)**2*.13*(1-drizzle)})`;ctx.lineWidth=.6;ctx.beginPath();ctx.ellipse(x,y,r,r*.19,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }
  function paintWeather(time) {
    const t=still()?20:time/1000,source=clockLightSource({...state,motionTime:t},w,h);
    const daylight=source.daylight,light=clockDaylight(state),layers=clockWeatherAmounts(state);
    if(full)clearSkyDetail();
    if(frontCtx&&frontCanvas.width)frontCtx.clearRect(0,0,w,h);
    prepareClouds(t,daylight,layers);
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    if(state.phase==='unknown') {
      glow(w*(.5+Math.sin(t*.07)*.035),h*.43,w*.49,h*.46,'55,78,104',.32+Math.sin(t*.27)*.035);mist(t,0,false);return;
    }
    let daytime=full?[45,129,224]:[64,139,213];
    for(const [weight,color]of [[layers.overcast,[94,115,139]],[layers.rain*.65,[86,108,129]],[layers.snow,[116,137,156]],[layers.fog,[139,151,163]],[layers.storm,[67,79,94]]])daytime=daytime.map((n,i)=>n+(color[i]-n)*weight);
    const blend=(a,b)=>a.map((n,i)=>Math.round(n+(b[i]-n)*daylight)).join(',');
    const enhanced=state.idealCycle||state.enhancedSky||full,nightLight=enhanced?(1-daylight):0;
    const cloudTint=Math.max(layers.overcast,layers.storm,layers.fog,layers.rain*.75),nightColor=(enhanced?[52,79,128]:[26,49,88]).map((n,i)=>n+([43,56,76][i]-n)*cloudTint);
    const atmosphere=blend(nightColor.map(n=>n*(1-immersion*.65)),daytime);
    if(full&&daylight>.001) {
      const sun=clockLightSource({...state,source:'sun'},w,h),warm=light.environmentWarmth,evening=state.sunProgress>.5;
      const horizon=evening?[249,150,93]:[250,185,160],zenith=evening?[83,102,172]:[93,153,210];
      const color=(a,b,k)=>a.map((v,i)=>Math.round(v+(b[i]-v)*k)).join(',');
      const veil=Math.max(smooth(.30,1,layers.cover)*.75,layers.overcast,layers.rain*.8,layers.snow*.85,layers.fog,layers.storm);
      const skyTop=[28,99,193].map((n,i)=>n+(daytime[i]*.88-n)*veil),skyBottom=[72,159,234].map((n,i)=>n+(daytime[i]*1.08+20-n)*veil);
      const gradient=ctx.createLinearGradient(0,h*.08,0,h*.88);
      gradient.addColorStop(0,`rgba(${color(skyTop,zenith,warm*(1-veil))},${daylight*(.70+veil*.08)})`);
      gradient.addColorStop(.55,`rgba(${color(skyBottom,horizon,warm*(1-veil))},${daylight*(.53+veil*.12)})`);
      gradient.addColorStop(1,'rgba(27,62,103,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
      if(warm>.01)glow(sun.x,h*.66,w*.42,h*.24,horizon.join(','),warm*daylight*.5);
    }
    glow(w*.51,h*.39,w*.62,h*.66,atmosphere,(.60+.18*daylight+nightLight*.20)*(.94+Math.sin(t*.21)*.06));
    glow(w*(.49+Math.sin(t*.09)*.02),h*.67,w*.5,h*.35,blend(enhanced?[62,82,126]:[36,48,83],[150,186,217]),(.20+.05*daylight+nightLight*.08)*(1-immersion*(1-daylight)*.70));
    if(nightLight>.001)glow(w*(.44+Math.sin(t*.12)*.08),h*(.38+Math.cos(t*.10)*.05),w*.33,h*.28,'111,143,192',nightLight*(.10+Math.sin(t*.31)*.025)*(1-immersion*.85));
    if(full&&Number.isFinite(state.sunAltitude)) {
      // Twilight reaches the visible middle sky too; the black-edge mask must not swallow the entire warm horizon.
      const twilight=(1-smooth(0,22,state.sunAltitude))*smooth(-12,-2,state.sunAltitude)*(1-layers.cover*.78);
      if(twilight>.001) {
        const solar=clockLightSource({...state,source:'sun'},w,h),evening=state.sunProgress>.5;
        glow(solar.x*.55+w*.225,h*.56,w*.48,h*.34,evening?'249,123,71':'252,174,142',twilight*.62);
        glow(w*.5,h*.30,w*.44,h*.25,evening?'145,104,159':'160,148,196',twilight*.13);
      }
    }
    if(daylight>.001&&light.environmentWarmth>.001) {
      const sunriseSource=clockLightSource({...state,source:'sun'},w,h);
      const sx=sunriseSource.x,sy=sunriseSource.y;
      glow(sx,sy,w*.38,h*.20,'255,158,85',.48*light.environmentWarmth*daylight);
      glow(w*(.43+Math.sin(t*.06)*.03),h*.68,w*.48,h*.26,'214,139,143',.18*light.environmentWarmth*daylight);
    }
    if(daylight<.999)paintStarfield(t,layers.cover,(1-daylight)**1.6);
    if(daylight<.999||full)moon(t);
    if(daylight>.001)sun(t,layers.cover);
    cloudscape(t,daylight,layers);
    flightClouds(t,daylight,layers);
    if(layers.fog>.001)mist(t,daylight,true,layers.fog);
    for(const kind of ['rain','snow','hail'])if(layers[kind]>.001)precipitation(t,daylight,kind,layers[kind]);
    const blownMist=Math.max(layers.rain,layers.snow)*smooth(.65,1,state.intensity);
    if(blownMist>.001)mist(t,daylight,false,blownMist);
    if(layers.storm>.001&&!still()) {
      // ponytail: slow, diffuse in-cloud illumination stays below one pulse per 17 seconds; no full-screen strobe.
      const cycle=wrap(t+2,17),flash=layers.storm*(cycle<2.2?Math.sin(cycle/2.2*Math.PI)**3:0);
      if(flash) {glow(w*.67,h*.24,w*.31,h*.24,'157,180,224',flash*.22);glow(w*.54,h*.28,w*.12,h*.14,'202,218,242',flash*.09);}
    }
  }
  function paint(time, frameInterval) {
    // One set of accumulated displacements serves every overlay; weather changes do not restart it.
    const now=still()?20:time/1000,elapsed=lastMotionTime===null?0:Math.max(0,Math.min(5,now-lastMotionTime));lastMotionTime=now;
    const speed=full&&Number.isFinite(window.clockMotion?.speed)?clamp(window.clockMotion.speed,.25,3):1,delta=elapsed*speed;
    if(full){motionTime+=delta;state.motionTime=motionTime;if(window.clockMotion)window.clockMotion.time=motionTime;}
    const t=full?motionTime:now,target=full&&window.clockMotion?.immersive!==false?1:0;
    immersion+=(target-immersion)*(1-Math.exp(-elapsed*3));
    if(!target&&immersion<.003){immersion=0;for(const image of skyImages.values())discardSkyImage(image);skyImages.clear();if(spiralLayers){for(const layer of spiralLayers)layer.width=layer.height=0;spiralLayers=null;}galaxyStars=null;planetEpoch=null;if(frontCanvas)frontCanvas.width=frontCanvas.height=0;}
    const wind=clamp(state.wind,0,85),intensity=clamp(state.intensity);
    cloudTime+=delta*(1+state.wind*.026)*(state.idealCycle?3.5*(.65+noise(t*.025,9)*.7):full?1.8:1);
    if(full){
      // Keep unbounded phase: wrapping before different layer multipliers causes visible rotation jumps.
      starTravel+=delta*.009;
      if((state.idealCycle||state.timeline)&&Number.isFinite(state.dayProgress)){
        if(lastDayProgress!==null){const change=state.dayProgress-lastDayProgress;skyOrbit+=(change-Math.round(change))*Math.PI*2;}
        lastDayProgress=state.dayProgress;
      }else{skyOrbit+=delta*(state.idealPolar==='night'?.022:Math.PI*2/86164);lastDayProgress=null;}
    }
    windTravel+=delta*wind;
    rainTravel+=delta*(.24+smooth(.16,.35,intensity)*(.24+intensity*.20));
    snowTravel+=delta*(.046+smooth(.6,1,intensity)*.074);
    iceAmount+=((state.variant==='freezing-rain'?1:0)-iceAmount)*(1-Math.exp(-delta*1.5));
    const started=tv||full?performance.now():0;
    paintWeather(full?motionTime*1000:time);
    if(tv){averagePaint=averagePaint*.9+(performance.now()-started)*.1;window.clockTVFrameRate=averagePaint>28?10:averagePaint>15?15:20;}
    if(tv||full)canvas.clockPaintVersion=(canvas.clockPaintVersion||0)+1;
    onPaint();
    if(full&&quality().reportFrame)quality().reportFrame(performance.now()-started,frameInterval);
  }
  function schedule() { if (!frame && !document.hidden && !still()) frame = requestAnimationFrame(animate); }
  function animate(time) {
    frame = 0;
    if (document.hidden || still()) return;
    const elapsed=time-lastPaint;
    const period=1000/(tv?(document.body.classList.contains('tv-settings-open')?4:window.clockTVFrameRate||20):full?(quality().fps||30):30);
    if(elapsed>=period){const interval=full&&lastFrameTime>0?time-lastFrameTime:undefined;lastFrameTime=time;lastPaint=time-(Math.max(0,elapsed)%period);paint(time,interval);}
    schedule();
  }
  function resize() {
    const box = canvas.getBoundingClientRect();
    if(w!==Math.max(1,box.width)||h!==Math.max(1,box.height)){starAtlas=galaxyStars=null;}
    w = Math.max(1, box.width); h = Math.max(1, box.height);
    // ponytail: soft weather uses a 540p budget on TV and 360p in its 640px preview; text is rasterized separately.
    const budget=document.body.classList.contains('tv-settings-open')?640*360:960*540;
    const dpr = tv ? Math.min(1,Math.sqrt(budget/(w*h))) : full ? Math.min(quality().weatherDpr||2,window.devicePixelRatio||1,Math.sqrt((quality().weatherPixels||1920*1080)/(w*h)),2048/w,2048/h) : Math.min(2, window.devicePixelRatio || 1);
    canvas.width = full?Math.floor(w*dpr):Math.round(w*dpr); canvas.height = full?Math.floor(h*dpr):Math.round(h*dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);if(full)refreshReadableAreas();if(full)lastPaint=lastFrameTime=0;paint(performance.now());schedule();
  }
  function resume() {
    cancelAnimationFrame(frame); frame = 0;lastMotionTime=null;if(full)lastPaint=lastFrameTime=0;
    if (!document.hidden) { paint(performance.now()); schedule(); }
  }
  window.addEventListener('resize', resize);
  if(full){window.addEventListener('clocklayoutchange',refreshReadableAreas);window.addEventListener('scroll',refreshReadableAreas,{passive:true});if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(refreshReadableAreas);for(const el of document.querySelectorAll('#clock-stage,.clock,.date-line'))observer.observe(el);}}
  if(full)window.addEventListener('clockqualitychange',()=>requestAnimationFrame(resize));
  document.addEventListener('visibilitychange', resume);
  if (typeof reducedMotion?.addEventListener === 'function') reducedMotion.addEventListener('change', resume);
  resize();
  return { setState(next) {
    const previous=state;
    state = { ...state, ...next };
    if (!['unknown', 'day', 'sunrise', 'sunset', 'night'].includes(state.phase)) state.phase = 'unknown';
    if (!['clear', 'cloudy', 'overcast', 'fog', 'rain', 'snow', 'storm'].includes(state.condition)) state.condition = 'clear';
    for (const key of ['cloudCover', 'intensity', 'sunProgress', 'moonPhase']) state[key] = clamp(state[key]);
    state.wind = clamp(state.wind, 0, 200);
    const changed=['condition','variant','hail'].some(key=>state[key]!==previous[key]);
    if (!document.hidden && (still()||(!tv&&!full&&(!state.timeline||changed)))) paint(performance.now());
    schedule();
  } };
}
