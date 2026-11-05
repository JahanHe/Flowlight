function clockWeatherAmounts(state) {
  const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
  const amount=(key,fallback)=>clamp(Number.isFinite(state[key])?state[key]:fallback?1:0);
  const layers={rain:amount('rainAmount',['rain','storm'].includes(state.condition)),snow:amount('snowAmount',state.condition==='snow'),fog:amount('fogAmount',state.condition==='fog'),storm:amount('stormAmount',state.condition==='storm'),hail:amount('hailAmount',state.hail),overcast:amount('overcastAmount',state.condition==='overcast')};
  layers.rainShade=layers.rain*(.40+.60*clamp(state.intensity));
  layers.cover=Math.max(clamp(state.cloudCover),layers.storm*.98,layers.fog*.90,layers.overcast*.94,layers.rain*(.48+.47*clamp(state.intensity)),layers.snow*.70);
  return layers;
}
// Altitude, zenith, horizon, direct light. Reused by sky, clouds and glass.
const clockDaylightStops=[
  [-12,[20,31,68],[58,72,115],[185,208,241]],
  [-6,[42,53,110],[163,119,156],[236,196,197]],
  [0,[67,103,166],[249,184,157],[255,193,145]],
  [7,[58,122,199],[244,201,165],[255,222,185]],
  [20,[35,118,210],[148,198,237],[255,245,228]],
  [40,[24,105,203],[107,184,244],[255,253,247]],
  [70,[18,94,194],[82,166,240],[255,255,255]]
];
function clockDaylight(state) {
  const altitude=Number.isFinite(state.sunAltitude)?state.sunAltitude:state.phase==='night'?-35:['sunrise','sunset'].includes(state.phase)?3:60;
  const clamp=n=>Math.max(0,Math.min(1,n)),smooth=(a,b,n)=>{const x=clamp((n-a)/(b-a));return x*x*(3-2*x);};
  // Civil-day phase is circular even when a polar sun never sets and its azimuth wraps at midnight.
  const evening=(Number.isFinite(state.dayProgress)?smooth(0,.8,-Math.sin(state.dayProgress*Math.PI*2)):smooth(.48,.88,Number.isFinite(state.sunProgress)?state.sunProgress:state.phase==='sunset'?1:.5))*smooth(-14,-6,altitude);
  let index=1;while(index<clockDaylightStops.length-1&&altitude>clockDaylightStops[index][0])index++;
  const a=clockDaylightStops[index-1],b=clockDaylightStops[index],blend=smooth(a[0],b[0],altitude);
  const palette=column=>a[column].map((n,i)=>n+(b[column][i]-n)*blend);
  const warmth=1-smooth(0,38,altitude),cloud=clockWeatherAmounts(state).cover;
  const twilight=smooth(-14,-4,altitude)*(1-smooth(0,16,altitude));
  const environmentWarmth=warmth*(1-cloud*.85),afterglow=twilight*(1-cloud*.85);
  const skyTop=palette(1).map((n,i)=>n+[19,-13,-8][i]*evening*warmth);
  const skyBottom=palette(2).map((n,i)=>n+[3,-37,-48][i]*evening*warmth);
  const direct=palette(3).map((n,i)=>Math.max(0,Math.min(255,n+[0,-8,-17][i]*evening*warmth)));
  const neutral=[248,250,255],rgb=direct.map((n,i)=>Math.round(n+(neutral[i]-n)*cloud*.85)).join(',');
  const halo=direct.map((n,i)=>Math.round(n+([255,174,105][i]-n)*warmth*.25)).join(',');
  const rim=direct.map(n=>Math.round(n+(255-n)*.35)).join(',');
  const ambientRgb=skyTop.map((n,i)=>Math.round((115+n*.48)*(1-cloud*.85)+[179,187,201][i]*cloud*.85)).join(',');
  const low=1-smooth(0,50,altitude);
  // ponytail: a bounded artistic atmosphere, not spectral ray tracing. Keep the solar disk nearly constant;
  // low-angle scattering changes its surrounding glow much more than its apparent size, with no extra textures.
  return {warmth,environmentWarmth,twilight,afterglow,skyTop,skyBottom,ambientRgb,rgb,halo,rim,
    diskScale:1+low*.12,diskFlatten:1-(1-smooth(0,7,altitude))*.06,haloScale:.78+low*.62};
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
  const moonVisibility=(moonVisible?1:0)*smooth(0,2,moonAltitude)*(1-smooth(.35,.95,cloud));
  const sunStrength=(.11+(sunVisible?.89*smooth(-.8,9,sunAltitude)*(.64+.36*smooth(8,65,sunAltitude)):0))*(1-cloud*.80);
  const moonStrength=(.11+(moonVisible?.40*moonLight*smooth(0,9,moonAltitude):0))*(1-cloud*.65);
  const strength=mix(moonStrength,sunStrength,blend)*cloudShadow;
  const light=clockDaylight(state),warm=light.rgb.split(',').map(Number),rgb=warm.map((n,i)=>Math.round(mix([180,207,242][i],n,blend))).join(',');
  const ambientRgb=light.ambientRgb.split(',').map((n,i)=>Math.round(mix([157,188,230][i],n,smooth(-14,8,sunAltitude)))).join(',');
  const x=mix(moonX,sunX,blend),y=mix(moonY,sunY,blend),elevation=mix(moonAltitude,sunAltitude,blend);
  const visibility=clamp(mix(moonVisibility,sunVisibility,blend));
  const length=10+55*(1-Math.sin(clamp(elevation,0,90)*Math.PI/180));
  const dx=width*.5-x,dy=height*.54-y,distance=Math.max(1,Math.hypot(dx,dy));
  return {x,y,rgb,ambientRgb,strength,shadowX:dx/distance*length,shadowY:dy/distance*length,elevation,isDay:blend>.5,visible:visibility>.001,visibility,daylight};
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
  function refreshReadableAreas(){dateArea=document.querySelector('.date-line')?.getBoundingClientRect();readableAreas=Array.from(document.querySelectorAll('.tile:not([hidden]),.date-line,.demo-dayline,.demo-quote')).map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);}
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
  // ponytail: preserve mixed depths when drawing a low-density subset; sorting hid the near rain.
  const particles=Array.from({length:full?660:470},()=>({x:random(),y:random(),z:random(),size:.65+random(),speed:.65+random()*.7,phase:random()*6.28}));
  // Ten coherent banks share six cloud families; distant cloudlets stay broad and faint.
  const clouds=Array.from({length:10},(_,i)=>{
    const z=[1,0,2,0,1,2,1,2,2,0][i];
    return {x:i<3?[.18,.78,.63][i]+(random()-.5)*.18:random()*1.6-.3,
      y:z===0?.46+random()*.18:z===1?.19+random()*.25:-.12+random()*.30,z,
      shape:[2,1,0,3,1,2,0,5,4,3][i],scale:.88+random()*.24,phase:random()*6.28};
  });
  const craters=Array.from({length:22},()=>({x:(random()-.5)*1.5,y:(random()-.5)*1.5,r:.035+random()*.10}));
  const cloudFields=new Map(),cloudSprites=new Map();
  const cloudFrames=clouds.map(()=>({}));let cloudCount=0,solarTransmission=1;
  // Method references: github.com/g3sthousen/weather-animations/blob/main/src/core/clouds.ts
  // and src/core/particles.ts: cached clouds, depth layers and time-based gusts. This renderer is independent.
  // One embedded atlas supplies vapor detail; movement, sunlight and weather still use the shared scene.
  const cloudAtlas=new Image();let cloudAtlasReady=false;
  cloudAtlas.onload=()=>{
    if(cloudAtlas.naturalWidth!==1536||cloudAtlas.naturalHeight!==1024)return;
    cloudAtlasReady=true;cloudFields.clear();
    for(const sprite of cloudSprites.values())sprite.width=sprite.height=0;
    cloudSprites.clear();canvas.clockCloudAtlasReady=true;
    requestAnimationFrame(()=>paint(performance.now()));
  };
  cloudAtlas.src='__DEMO_CLOUD_ATLAS__';
  function cloudField(shape) {
    if(cloudFields.has(shape))return cloudFields.get(shape);
    if(cloudAtlasReady){
      // ponytail: bake each family once, then only draw cached textures. At most 30 tinted
      // 384x300 sprites + six byte fields + decoded atlas use about 21 MiB, independent of screen size.
      const sw=384,sh=300,off=document.createElement('canvas');off.width=sw;off.height=sh;
      const c=off.getContext('2d');
      c.drawImage(cloudAtlas,shape%3*512,Math.floor(shape/3)*512+56,512,400,0,0,sw,sh);
      const pixels=c.getImageData(0,0,sw,sh).data,field=new Uint8Array(sw*sh),alpha=new Uint8Array(sw*sh);
      for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
        const i=y*sw+x,j=i*4;
        field[i]=pixels[j]*.2126+pixels[j+1]*.7152+pixels[j+2]*.0722;
        alpha[i]=pixels[j+3]*smooth(0,8,x)*smooth(0,8,sw-1-x)*smooth(0,8,y)*smooth(0,8,sh-1-y);
      }
      off.width=off.height=0;
      const result={width:sw,height:sh,field,alpha};cloudFields.set(shape,result);return result;
    }
    // A local procedural fallback keeps the clock usable even if the embedded image cannot decode.
    const sw=320,sh=200,family=shape%6,field=new Uint8Array(sw*sh),alpha=new Uint8Array(sw*sh);
    const volume=new Float32Array(sw*sh),lobes=[];
    const n=(x,y)=>noise(x+shape*17.31,y+shape*9.17);
    if(family===0||family===2||family===4){
      const count=family===2?12:family===4?13:9;
      for(let i=0;i<count;i++){
        const u=i/(count-1),r=n(i*4.1,7),s=n(13,i*3.7);
        const x=.20+u*.60+(r-.5)*.035;
        const ry=family===2?.065+s*.09:family===4?.12+s*.20:.10+s*.20;
        const rx=family===2?.09+r*.08:.095+r*.075;
        const y=(family===2?.55:family===4?.71:.69)-ry*.62;
        lobes.push({x,y,rx,ry,depth:.45+s*.55});
        // Smaller lobes stay attached to large caps, so the edge is billowing rather than scalloped.
        if(family!==2)lobes.push({x:x+(s-.5)*rx,y:y-ry*.70,rx:rx*.48,ry:ry*.43,depth:.22+r*.18});
      }
      if(family===4){
        lobes.push({x:.48,y:.39,rx:.20,ry:.26,depth:.95},{x:.58,y:.23,rx:.28,ry:.105,depth:.55});
      }
    }
    for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
      const px=x/(sw-1),py=y/(sh-1),i=y*sw+x;
      const broad=fractal(px*4+shape*11,py*4+shape*7),fine=fractal(px*22+shape*8,py*20+13);
      const wx=px+(fractal(px*7+31,py*6+shape*9)-.5)*.085;
      const wy=py+(fractal(px*7+shape*7,py*6+41)-.5)*.075;
      let thickness=0;
      if(family===1){
        // Sheared, broken ice-crystal strands with tapered ends; no puffy base silhouette.
        const curve=.36+(wx-.5)*.15+(wx-.5)**2*.30+(broad-.5)*.08;
        const fibers=n(wx*8,wy*72+wx*18),filaments=n(wx*3+8,wy*130-wx*29);
        const band=Math.exp(-(((wy-curve)/.095)**2));
        const taper=smooth(.04,.28,px)*(1-smooth(.66,.97,px));
        thickness=band*taper*smooth(.36,.72,fibers*.72+filaments*.28)*.90;
      }else if(family===3){
        // Altocumulus is a field of unequal small patches separated by slivers of clear sky.
        const drift=fractal(wx*5+7,wy*5+shape*3),cells=fractal(wx*27+drift*2,wy*31+drift);
        const bank=Math.exp(-(((wx-.49)/.44)**4+((wy-.48)/.19)**4));
        thickness=bank*smooth(.36,.66,cells)*(.45+broad*.85);
      }else if(family===5){
        // Rain/stratus is a connected, uneven sheet. Its feathered perimeter can extend
        // beyond the viewport, rather than reading as an isolated oval cloud sticker.
        const center=.44+(fractal(wx*3+17,shape+7)-.5)*.20;
        const bank=Math.exp(-(((wx-.50)/.34)**4+((wy-center)/.22)**2));
        thickness=bank*(.65+broad*1.55+(fine-.5)*.10);
      }else{
        // Analytic line-of-sight thickness through overlapping cloud volumes.
        for(const lobe of lobes){
          const d=1-((wx-lobe.x)/lobe.rx)**2-((wy-lobe.y)/lobe.ry)**2;
          if(d>0)thickness+=Math.sqrt(d)*lobe.depth;
        }
        const baseY=family===2?.61:family===4?.77:.74;
        const connected=Math.exp(-(((wx-.5)/.37)**6+((wy-(baseY-.075))/.095)**4));
        thickness=(thickness+connected*.65)*(.70+broad*.55);
        // A common condensation level produces a flat, gently ragged underside.
        thickness*=1-smooth(baseY-.025,baseY+.025,wy+(fine-.5)*.016);
        thickness=Math.max(0,thickness-Math.max(0,.52-fine)*.50);
      }
      const border=smooth(0,.035,px)*smooth(0,.035,1-px)*smooth(0,.035,py)*smooth(0,.035,1-py);
      volume[i]=thickness;
      alpha[i]=(1-Math.exp(-thickness*(family===1?1.05:family===3?1.8:1.65)))*border*255;
    }
    for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
      const i=y*sw+x,py=y/(sh-1),thickness=volume[i];
      const above=volume[Math.max(0,y-7)*sw+x],below=volume[Math.min(sh-1,y+7)*sw+x];
      // Large-scale light attenuation: bright upper lobes, diffuse grey undersides.
      // Fine noise affects opacity, not embossing; this avoids the old stone-like surface.
      const slope=clamp((below-above)*.09,-.11,.11),thin=Math.exp(-thickness*1.6);
      const base=family===1?.96:family===5?.65+.12*noise(x/sw*4+shape,py*3):.93-smooth(.35,.74,py)*.24;
      field[i]=clamp(base+slope+thin*.075,.42,1)*255;
    }
    const result={width:sw,height:sh,field,alpha};cloudFields.set(shape,result);return result;
  }
  function cloudSprite(shape,palette) {
    const key=shape+':'+palette;if(cloudSprites.has(key))return cloudSprites.get(key);
    const source=cloudField(shape),off=document.createElement('canvas');off.width=source.width;off.height=source.height;
    off.clockCloudShape=shape;off.clockCloudSource=cloudAtlasReady?'atlas':'fallback';
    const c=off.getContext('2d'),pixels=c.createImageData(off.width,off.height),data=pixels.data;
    const hi=palette==='night'?[154,173,201]:palette==='storm'?[128,141,155]:palette==='warm'?[255,219,184]:[255,255,252];
    const lo=palette==='night'?[59,77,106]:palette==='storm'?[48,60,76]:palette==='warm'?[161,139,140]:[136,160,186];
    for(let y=0;y<off.height;y++)for(let x=0;x<off.width;x++){
      const i=y*off.width+x,j=i*4,light=clamp((source.field[i]/255-.40)/.60);
      for(let k=0;k<3;k++)data[j+k]=lo[k]+(hi[k]-lo[k])*light;
      data[j+3]=source.alpha[i];
      if(palette==='rim'){
        const above=source.alpha[Math.max(0,y-3)*off.width+x];
        data[j]=255;data[j+1]=253;data[j+2]=245;data[j+3]=Math.max(0,source.alpha[i]-above)*.48;
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
  let auroraVeil=null;
  function aurora(t,cover,target){
    const ctx=target;
    if(immersion<=.001)return;
    if(!auroraVeil){
      // ponytail: one feathered 512x192 veil (384 KiB), baked once. No live blur or per-frame noise field.
      auroraVeil=document.createElement('canvas');auroraVeil.width=512;auroraVeil.height=192;auroraVeil.clockTexture='aurora';
      const c=auroraVeil.getContext('2d'),pixels=c.createImageData(512,192),data=pixels.data;
      for(let y=0;y<192;y++)for(let x=0;x<512;x++){
        const u=x/511,v=y/191,ridge=.57+Math.sin(u*7+.3)*.08+Math.sin(u*15)*.035;
        const turbulence=fractal(u*6+17,v*3+8),offset=v-ridge+(turbulence-.5)*.13;
        const spread=offset>0?.105:.22,density=Math.exp(-Math.pow(offset/spread,2)*1.6);
        const edge=smooth(0,.15,u)*smooth(0,.15,1-u)*smooth(0,.13,v)*smooth(0,.13,1-v);
        const fold=.48+.52*fractal(u*15+4,v*2.5+19),tint=smooth(-.03,.23,-offset),i=(y*512+x)*4;
        const color=tint<.5?[77,224,169].map((n,k)=>n+([68,165,224][k]-n)*tint*2):[68,165,224].map((n,k)=>n+([159,124,224][k]-n)*(tint-.5)*2);
        data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=255*density*edge*fold*.76;
      }
      c.putImageData(pixels,0,0);
    }
    const strength=immersion*(1-cover*.65)*(.76+.10*Math.sin(t*.08)+.04*Math.cos(t*.17));
    const violet=.5+.5*Math.sin(t*.065),green=[73,226,163],purple=[155,139,238];
    canvas.clockAuroraLight={amount:strength*ctx.globalAlpha,rgb:green.map((n,i)=>Math.round(n+(purple[i]-n)*violet*.65)).join(',')};
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let layer=0;layer<3;layer++){
      const phase=layer*2.1,width=w*(.98+.04*Math.sin(t*.05+phase)),height=h*(.38+.035*Math.sin(t*.07+phase));
      ctx.save();ctx.globalAlpha*=strength*(.78-layer*.14);
      ctx.translate(w*(.5+Math.sin(t*.075+phase)*.065),h*(.28+layer*.043+Math.cos(t*.085+phase)*.025));
      ctx.rotate(Math.sin(t*.065+phase)*.075);ctx.transform(1,Math.sin(t*.11+phase)*.065,Math.cos(t*.09+phase)*.13,1,0,0);
      if(layer===1)ctx.scale(-1,1);
      ctx.drawImage(auroraVeil,-width*.5,-height*.5,width,height);ctx.restore();
    }
    ctx.restore();
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
    const r=Math.max(13,Math.min(w,h)*.027)*light.diskScale,haloRadius=r*light.haloScale;
    const visibility=source.visibility*(full?.30+.70*solarTransmission:1);
    const motion=state.idealCycle?1.8:1;
    const breath=.98+Math.sin(t*.31*motion)*.014+Math.sin(t*.71*motion)*.006;
    const driftX=Math.sin(t*.11*motion)*r*.35,driftY=Math.cos(t*.15*motion)*r*.25;
    glow(x+driftX,y+driftY,haloRadius*(16+Math.sin(t*.19)*.4),haloRadius*(12+Math.cos(t*.17)*.3),tint,(.23+.06*light.warmth)*(1-cover*.86)*breath*source.daylight);
    glow(x-driftX*1.8,y-driftY,haloRadius*9,haloRadius*5.5,light.ambientRgb,.07*breath*source.daylight);
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
    glow(x,y,haloRadius*7.5*breath,haloRadius*7.5*breath,tint,.18+.04*light.warmth);
    ctx.save();ctx.translate(x,y);ctx.scale(1,light.diskFlatten);ctx.translate(-x,-y);
    const corona=ctx.createRadialGradient(x,y,0,x,y,r*2.5);
    corona.addColorStop(0,`rgba(${light.rim},1)`);corona.addColorStop(.28,`rgba(${light.rim},.99)`);
    corona.addColorStop(.38,`rgba(${light.rim},.94)`);
    corona.addColorStop(.47,`rgba(${tint},.48)`);
    corona.addColorStop(.67,`rgba(${tint},.12)`);corona.addColorStop(1,`rgba(${tint},0)`);
    ctx.fillStyle=corona;ctx.fillRect(x-r*2.5,y-r*2.5,r*5,r*5);ctx.restore();
    ctx.translate(x,y);ctx.rotate(-.22+Math.sin(t*.07)*.025);glow(0,0,haloRadius*8,r*.6,tint,.04*breath);ctx.restore();
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
  // Cloud composition. All layers reuse the same cached density fields and daylight.
  let cloudDeck=0;
  function cloudWeatherWeight(shape,layers){
    const depth=smooth(.2,.85,layers.cover);
    // Broad banks and translucent cirrus share the sky; small cloudlets remain a faint distant layer.
    return [.84-depth*.20,.80*(1-depth*.30),.72+depth*.28,.35+depth*.10,.015+layers.storm*.985,.05+Math.max(layers.rain,layers.overcast,layers.storm)*.95][shape];
  }
  function prepareClouds(t,daylight,layers) {
    const cover=layers.cover,source=clockLightSource({...state,source:'sun'},w,h);
    cloudDeck=smooth(.64,.98,cover);
    // ponytail: ten coherent banks replace 24 small repeats; reuse the six existing textures.
    cloudCount=clouds.length;
    // A closed cloud ceiling dims the shared sun even when no individual puff crosses its disk.
    solarTransmission=1-cloudDeck*.94;
    for(let i=0;i<cloudCount;i++) {
      const p=clouds[i],layer=p.z,motion=full?cloudTime:t;
      const speed=[.0018,.0034,.0056][layer]*(.85+noise(i+14,p.phase)*.30);
      const gust=(noise(motion*.018+p.phase,i+10)-.5)*.028;
      const span=Math.max(w,Math.min(h*.9,w*1.5));
      const baseWidth=span*[.40,.58,.72][layer]*p.scale*[1,1.35,1.2,1.22,.9,1.45][p.shape],margin=baseWidth*1.08;
      const width=baseWidth*(.97+noise(motion*.018+p.phase,i+37)*.06);
      const x=wrap(p.x*w+cloudTime*speed*w+gust*w+margin*.5,w+margin)-margin*.5;
      const y=(p.y+(noise(motion*.02+p.phase,i+23)-.5)*.035)*h;
      const threshold=i/cloudCount*.82,visible=smooth(threshold,threshold+.12,cover);
      const opacity=Math.pow(cover,.42)*visible*(.20+.80*daylight)*[.48,.83,1][layer]*(1-layers.fog*.72)*(1-cloudDeck*.76)*cloudWeatherWeight(p.shape,layers);
      const alpha=clamp(opacity*(.94+noise(motion*.025+p.phase,i+51)*.12),0,.92);
      const height=width*.78125*[.65,.87,1][layer],left=x-width*.5,top=y-height*.5;
      Object.assign(cloudFrames[i],{x,y,left,top,width,height,alpha,shape:p.shape});
      if(full&&daylight>.001&&alpha>.001) {
        const u=(source.x-left)/width,v=(source.y-top)/height;
        if(u>0&&u<1&&v>0&&v<1) {
          const field=cloudField(p.shape),fx=u*(field.width-1),fy=v*(field.height-1),ix=Math.floor(fx),iy=Math.floor(fy),a=fx-ix,b=fy-iy,index=iy*field.width+ix,at=field.alpha;
          const coverage=((at[index]*(1-a)+at[index+1]*a)*(1-b)+(at[index+field.width]*(1-a)+at[index+field.width+1]*a)*b)/255;
          solarTransmission*=1-coverage*alpha*.96;
        }
      }
    }
    canvas.clockSolarTransmission=solarTransmission;
  }
  function cloudscape(t,daylight,layers) {
    const light=clockDaylight(state),dark=Math.max(layers.storm,layers.rainShade,layers.overcast);
    const warmth=(1-dark)*(1-layers.fog)*light.environmentWarmth*(daylight+(1-daylight)*light.afterglow*.34);
    const source=clockLightSource({...state,source:'sun'},w,h);
    // ponytail: two broad cached layers form the ceiling; no full-screen pixel shader or new texture.
    if(cloudDeck>.001) {
      for(let layer=0;layer<2;layer++) {
        // Cover portrait screens by cropping a wider bank, never by stretching cloud detail vertically.
        const width=Math.max(w,h*1.28)*(layer?1.22:2.1),height=width*.78125,period=width*.66;
        const shift=wrap(cloudTime*(layer?.0016:.0010)*w+period*.30,period);
        const top=-h*(layer?.20:.66)+Math.sin(t*.018+layer)*h*.025;
        for(let copy=-1;copy<=1;copy++) {
          const left=shift+copy*period-width*.5;
          for(const [palette,weight]of [['day',daylight*(1-dark)*(1-warmth)],['storm',daylight*dark*(1-warmth)],['night',(1-daylight)*(1-warmth)],['warm',warmth]])if(weight>.001) {
            ctx.save();ctx.globalAlpha=cloudDeck*weight*(layer?.40:.76)*(1-layers.fog*.35);
            ctx.drawImage(cloudSprite(layer?2:5,palette),left,top,width,height);ctx.restore();
          }
        }
      }
    }
    for(let i=0;i<cloudCount;i++) {
      const c=cloudFrames[i],{left,top,width,height,alpha,shape}=c;if(alpha<.002)continue;
      const dx=source.x-c.x,dy=source.y-c.y,near=Math.exp(-((dx/(width*.7))**2+(dy/(height*1.2))**2)),distance=Math.max(1,Math.hypot(dx,dy));
      const warm=warmth*(.65+.35*near);
      for(const [palette,weight]of [['day',daylight*(1-warm)*(1-dark)],['storm',daylight*(1-warm)*dark],['night',(1-daylight)*(1-warm)],['warm',warm]])if(weight>.001) {
        ctx.save();ctx.globalAlpha=alpha*weight;ctx.drawImage(cloudSprite(shape,palette),left,top,width,height);ctx.restore();
      }
      if(full&&daylight>.001&&source.visibility>.01) {
        ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=alpha*daylight*(1-dark*.9)*near*.50*source.visibility;
        ctx.drawImage(cloudSprite(shape,'rim'),left+dx/distance*1.5,top+dy/distance*1.5,width,height);ctx.restore();
      }
    }
  }
  function flightClouds(t,daylight,layers) {
    if(immersion<=.001||daylight<=.01||layers.cover<.04)return;
    const front=foreground(),dark=Math.max(layers.storm,layers.overcast,layers.rainShade),warm=clockDaylight(state).environmentWarmth*(1-dark)*(1-layers.fog);
    // Two broad translucent veils pass through the view; no extra duplicated cumulus towers.
    for(let i=0;i<2;i++) {
      const p=clouds[i?5:4],age=wrap(p.phase/6.28+t*(.007+i*.001),1),depth=.85+age*age*.55;
      const x=w*(-.52+age*2.04),y=h*([.12,.60][i]+Math.sin(t*.025+p.phase)*.035);
      const width=Math.max(w,Math.min(h*.9,w*1.5))*(i?.85:1.10)*p.scale*depth,height=width*.78125;
      const cross=smooth(.32,.62,age),alpha=immersion*daylight*Math.pow(layers.cover,.7)*(1-cloudDeck*.9)*smooth(0,.18,age)*(1-smooth(.78,1,age))*.27*(1-layers.fog*.65)*cloudWeatherWeight(p.shape,layers);
      for(const [palette,weight]of [['day',(1-dark)*(1-warm)],['storm',dark*(1-warm)],['warm',warm]])if(weight>.001) {
        const sprite=cloudSprite(p.shape,palette);
        ctx.save();ctx.globalAlpha=alpha*weight*(1-cross)*.45;ctx.drawImage(sprite,x-width*.5,y-height*.5,width,height);ctx.restore();
        front.save();front.globalAlpha=alpha*weight*cross;front.drawImage(sprite,x-width*.5,y-height*.5,width,height);front.restore();
      }
    }
    softenForeground();
  }
  function mist(t,daylight,heavy,amount=1) {
    const color=[114,137,163].map((n,i)=>Math.round(n+([196,211,219][i]-n)*daylight)).join(',');
    for(let i=0;i<7;i++) {
      const p=clouds[i],x=(wrap(p.x+t*(.0025+i*.0006),2)-.5)*w;
      const y=h*(.28+i*.075+Math.sin(t*.10+p.phase)*.016),width=w*(.65+i*.025),height=h*(.10+i*.009);
      const alpha=(heavy?.17:.045)*(1+i*.04)*amount;
      ctx.save();ctx.globalAlpha=alpha*daylight;if(daylight>.001)ctx.drawImage(cloudSprite(5,'day'),x-width*.5,y-height*.5,width,height);
      ctx.globalAlpha=alpha*(1-daylight);if(daylight<.999)ctx.drawImage(cloudSprite(5,'night'),x-width*.5,y-height*.5,width,height);ctx.restore();
      if(heavy)glow(x,y,width*.65,height*1.4,color,(.055+state.intensity*.025)*amount);
    }
  }
  function precipitation(t,daylight,kind,amount) {
    const snow=kind==='snow',hail=kind==='hail',drizzle=1-smooth(.16,.35,state.intensity);
    const wind=clamp(state.wind,0,85),gust=Math.sin(t*.44)*.16+Math.sin(t*.19+1)*.09;
    const count=Math.min(particles.length,Math.round(((snow?115:hail?80:175-drizzle*95)+state.intensity*(snow?230:hail?120:290))*(full?detail():1)));
    ctx.save();ctx.globalAlpha*=amount;
    for(let i=0;i<count;i++) {
      const p=particles[i],z=.30+p.z*.70;
      const sway=snow?Math.sin(t*(.32+p.z*.25)+p.phase)*(.008+p.z*.008):0;
      const x=(wrap(p.x+t*(snow?.012:.018)+windTravel*(snow?.0012:.0008)*z+(gust*.025+sway)*z,1.4)-.20)*w;
      const y=(wrap(p.y+(snow?snowTravel:rainTravel)*z*p.speed,1.3)-.15)*h;
      const opacity=(snow?.20+p.z*.40:hail?.09+p.z*.28:(.24+p.z*.45)*(.72+.45*state.intensity))*(.83+.17*daylight);
      if(snow) {
        const size=(.45+p.z*2.0)*p.size;
        if(p.z>.82)glow(x,y,size*2,size*2,'232,242,251',opacity*.30);
        ctx.fillStyle=`rgba(237,245,250,${opacity})`;ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();
      } else if(hail) {
        const size=.75+p.z*2.0;ctx.fillStyle=`rgba(214,233,248,${opacity+.14})`;ctx.beginPath();ctx.ellipse(x,y,size,size*.8,.2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=`rgba(255,255,255,${opacity})`;ctx.beginPath();ctx.arc(x-size*.2,y-size*.2,size*.3,0,Math.PI*2);ctx.fill();
      } else {
        const length=((8+p.z*22)*(1-drizzle)+(7+p.z*12)*drizzle)*(.65+.75*state.intensity)*(1-iceAmount*.28)*(h/800+.25);
        const dx=length*(.10+wind*.011+gust*.18),dy=length;
        const tail=ctx.createLinearGradient(x,y,x+dx,y+dy);
        const color=[216,233,245].map((n,i)=>Math.round(n+([210,237,250][i]-n)*iceAmount)).join(',');tail.addColorStop(0,`rgba(${color},0)`);tail.addColorStop(1,`rgba(${color},${opacity})`);
        ctx.strokeStyle=tail;ctx.lineWidth=Math.max(1,.65-drizzle*.08+p.z*.7+state.intensity*.35);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();
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
    canvas.clockAuroraLight=null;
    if(frontCtx&&frontCanvas.width)frontCtx.clearRect(0,0,w,h);
    prepareClouds(t,daylight,layers);
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    if(state.phase==='unknown') {
      glow(w*(.5+Math.sin(t*.07)*.035),h*.43,w*.49,h*.46,'55,78,104',.32+Math.sin(t*.27)*.035);mist(t,0,false);return;
    }
    let daytime=full?light.skyTop.map((n,i)=>n*.30+light.skyBottom[i]*.70):[64,139,213];
    for(const [weight,color]of [[layers.overcast,[94,115,139]],[layers.rainShade*.9,[72,91,112]],[layers.snow,[116,137,156]],[layers.fog,[139,151,163]],[layers.storm,[67,79,94]]])daytime=daytime.map((n,i)=>n+(color[i]-n)*weight);
    const blend=(a,b)=>a.map((n,i)=>Math.round(n+(b[i]-n)*daylight)).join(',');
    const enhanced=state.idealCycle||state.enhancedSky||full,nightLight=enhanced?(1-daylight):0;
    const cloudTint=Math.max(layers.overcast,layers.storm,layers.fog,layers.rainShade*.9),nightColor=(enhanced?[52,79,128]:[26,49,88]).map((n,i)=>n+([43,56,76][i]-n)*cloudTint);
    const veil=Math.max(smooth(.30,1,layers.cover)*.75,layers.overcast,layers.rainShade,layers.snow*.85,layers.fog,layers.storm);
    const atmosphere=blend(nightColor.map(n=>n*(1-immersion*.65)),daytime);
    // Edge-to-edge mode fills the same weather canvas sampled by glass refraction.
    if(window.calendarDemoWideSky){
      const sky=ctx.createLinearGradient(0,0,0,h);
      sky.addColorStop(0,'rgb('+blend(nightColor.map(n=>n*.22),daytime.map(n=>n*.58))+')');
      sky.addColorStop(1,'rgb('+blend(nightColor.map(n=>n*.38),daytime.map(n=>n*.76))+')');
      ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    }
    if(full&&daylight>.001) {
      const sun=clockLightSource({...state,source:'sun'},w,h),warm=light.environmentWarmth;
      const skyTop=light.skyTop.map((n,i)=>n+(daytime[i]*.88-n)*veil),skyBottom=light.skyBottom.map((n,i)=>n+(daytime[i]*1.08+20-n)*veil);
      const gradient=ctx.createLinearGradient(0,h*.08,0,h*.88);
      gradient.addColorStop(0,`rgba(${skyTop.map(Math.round).join(',')},${daylight*(.70+veil*.08)})`);
      gradient.addColorStop(.55,`rgba(${skyBottom.map(Math.round).join(',')},${daylight*(.53+veil*.12)})`);
      gradient.addColorStop(1,'rgba(27,62,103,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
      if(warm>.01)glow(sun.x,h*.66,w*.42,h*.24,light.skyBottom.map(Math.round).join(','),warm*daylight*.5);
    }
    glow(w*.51,h*.39,w*.62,h*.66,atmosphere,(.60+.18*daylight+nightLight*.20)*(.94+Math.sin(t*.21)*.06));
    glow(w*(.49+Math.sin(t*.09)*.02),h*.67,w*.5,h*.35,blend(enhanced?[62,82,126]:[36,48,83],full?light.skyBottom.map((n,i)=>n+(daytime[i]-n)*veil):[150,186,217]),(.20+.05*daylight+nightLight*.08)*(1-immersion*(1-daylight)*.70));
    if(nightLight>.001)glow(w*(.44+Math.sin(t*.12)*.08),h*(.38+Math.cos(t*.10)*.05),w*.33,h*.28,'111,143,192',nightLight*(.10+Math.sin(t*.31)*.025)*(1-immersion*.85));
    if(full&&Number.isFinite(state.sunAltitude)) {
      // Twilight reaches the visible middle sky too; the black-edge mask must not swallow the entire warm horizon.
      const twilight=light.afterglow;
      if(twilight>.001) {
        const solar=clockLightSource({...state,source:'sun'},w,h);
        glow(solar.x*.55+w*.225,h*.56,w*.48,h*.34,light.skyBottom.map(Math.round).join(','),twilight*.70);
        glow(w*.5,h*.30,w*.44,h*.25,light.ambientRgb,twilight*.16);
      }
    }
    if(daylight>.001&&light.environmentWarmth>.001) {
      const sunriseSource=clockLightSource({...state,source:'sun'},w,h);
      const sx=sunriseSource.x,sy=sunriseSource.y;
      glow(sx,sy,w*.38,h*.20,light.halo,.30*light.environmentWarmth*daylight);
      glow(w*(.43+Math.sin(t*.06)*.03),h*.68,w*.48,h*.26,light.ambientRgb,.18*light.environmentWarmth*daylight);
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
