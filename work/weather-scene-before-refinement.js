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
  let w=1,h=1,frame=0,lastPaint=0,cloudTime=0,starTravel=0,rainTravel=0,snowTravel=0,windTravel=0,lastMotionTime=null,iceAmount=0,motionTime=0,immersion=0;
  let galaxySprite=null,jupiterSprite=null,planetEpoch=null;
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
  const clouds=Array.from({length:full?26:18},(_,i)=>({x:random()*1.8,y:.10+(i%3)*.17+random()*.12,z:i%3,shape:i%6,scale:.8+random()*.5,phase:random()*6.28}));
  const craters=Array.from({length:22},()=>({x:(random()-.5)*1.5,y:(random()-.5)*1.5,r:.035+random()*.10}));
  const cloudFields=new Map(),cloudSprites=new Map();
  // Method references: github.com/g3sthousen/weather-animations/blob/main/src/core/clouds.ts
  // and src/core/particles.ts: cached clouds, depth layers and time-based gusts. This renderer is independent.
  function cloudField(shape) {
    if(cloudFields.has(shape))return cloudFields.get(shape);
    const sw=full?(detail()<1?320:detail()>1?640:512):512,sh=sw*5/8,field=tv?new Uint8Array(sw*sh):new Float32Array(sw*sh),alpha=tv?new Uint8Array(sw*sh):new Float32Array(sw*sh);
    const lobes=Array.from({length:7},(_,i)=>{
      const center=1-Math.abs(i-3)/3;
      return{x:-.78+i*.26,y:.08-center*.32+noise(i+shape*9,7)*.12,rx:.26+noise(i,shape+31)*.15,ry:.30+center*(.32+noise(i+8,shape+19)*.20)};
    });
    for(let y=0;y<sh;y++)for(let x=0;x<sw;x++) {
      const u=(x/sw-.5)*2.7,v=(y/sh-.5)*2.4;
      let envelope=-1;
      for(const lobe of lobes)envelope=Math.max(envelope,1-((u-lobe.x)/lobe.rx)**2-((v-lobe.y)/lobe.ry)**2);
      const texture=fractal(x*256/sw*.035+shape*12,y*160/sh*.035+shape*4);
      const density=envelope+(texture-.5)*.68;
      const i=y*sw+x;
      field[i]=(texture*.65+Math.max(0,envelope)*.35)*(tv?255:1);
      const border=smooth(0,.12,x/(sw-1))*smooth(0,.12,1-x/(sw-1))*smooth(0,.12,y/(sh-1))*smooth(0,.12,1-y/(sh-1));
      alpha[i]=smooth(-.22,.42,density)*(1-smooth(.34,.84,v))*border*(tv?255:1);
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
      const divisor=tv?255:1,above=source.field[Math.max(0,i-off.width*6)]/divisor,below=source.field[Math.min(source.field.length-1,i+off.width*6)]/divisor;
      const relief=clamp(.76-y/off.height*.25+source.field[i]/divisor*.23+(below-above)*.95,.42,1.08);
      data[j]=rgb[0]*relief;data[j+1]=rgb[1]*relief;data[j+2]=rgb[2]*relief;data[j+3]=source.alpha[i]*(tv?1:255);
    }
    c.putImageData(pixels,0,0);cloudSprites.set(key,off);return off;
  }
  function spaceSprite(kind) {
    const cached=kind==='galaxy'?galaxySprite:jupiterSprite;if(cached)return cached;
    // ponytail: two bounded, lazy textures (1.69 MiB total), never a per-frame sky render target.
    const off=document.createElement('canvas');off.clockTexture=kind;off.width=kind==='galaxy'?768:384;off.height=384;
    const c=off.getContext('2d'),pixels=c.createImageData(off.width,off.height),data=pixels.data;
    for(let y=0;y<off.height;y++)for(let x=0;x<off.width;x++) {
      const u=x/off.width*2-1,v=y/off.height*2-1,j=(y*off.width+x)*4;
      if(kind==='galaxy') {
        const center=Math.sin(u*3.2)*.10+Math.sin(u*7)*.025,n=fractal(x*.023+19,y*.023+7);
        const band=Math.exp(-(((v-center)/(.22+n*.17))**2)),ends=smooth(0,.20,1-Math.abs(u));
        const lane=Math.exp(-(((v-center-.025-Math.sin(u*8)*.025)/(.025+n*.052))**2));
        const core=Math.exp(-(((u-.15)/.43)**2)),dust=(.30+n*.70)*(1-lane*.85);
        data[j]=133+core*48+n*22;data[j+1]=155+core*29+n*20;data[j+2]=191+core*8+n*18;data[j+3]=255*band*ends*dust*(.27+core*.26);
      } else {
        const rr=u*u+v*v;if(rr>=1)continue;
        const z=Math.sqrt(1-rr),lat=Math.asin(v),lon=Math.atan2(u,z),n=fractal(lon*4+15,lat*13+27);
        const belt=.5+.5*Math.sin(lat*35+Math.sin(lon*7+lat*3)*.24+n*.85),fine=.5+.5*Math.sin(lat*113+n*3);
        const spot=Math.exp(-(((lon+.36)/.24)**2+((lat-.24)/.095)**2)*1.7);
        const light=clamp(.10+(-u*.34-v*.23+z*.88)*.95,.06,1)*(.57+z*.43);
        const rgb=[221-71*belt-8*fine,202-87*belt-10*fine,171-91*belt-9*fine];
        for(let k=0;k<3;k++)data[j+k]=(rgb[k]+([170,75,43][k]-rgb[k])*spot*.90)*light;
        data[j+3]=255*smooth(0,.055,z);
      }
    }
    c.putImageData(pixels,0,0);
    if(kind==='galaxy') {
      for(let i=0;i<1800;i++) {
        const x=random()*off.width,u=x/off.width*2-1,center=.10*Math.sin(u*3.2)+.025*Math.sin(u*7);
        const v=(random()+random()+random()-1.5)*.37+center,y=(v+1)*off.height*.5,r=.18+random()**3*.68;
        c.fillStyle=`rgba(${i%5?'211,226,246':'247,224,191'},${(.18+random()*.68)*smooth(0,.18,1-Math.abs(u))})`;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
      }
      galaxySprite=off;
    } else jupiterSprite=off;
    return off;
  }
  function deepSky(t,angle) {
    if(immersion<=.001)return;
    const span=Math.hypot(w,h)*1.28;
    ctx.save();ctx.globalAlpha*=immersion*.83;ctx.translate(w*.51,h*.40);ctx.rotate(-.34+angle);
    ctx.drawImage(spaceSprite('galaxy'),-span*.5,-span*.25,span,span*.5);ctx.restore();
    ctx.save();ctx.globalAlpha*=immersion;
    for(let i=0;i<160;i++) {
      const p=stars[i],depth=wrap(p.phase/6.28-t*(.006+i%3*.002),1),scale=.42/(depth+.20);
      const x=w*(.5+(p.x-.5)*scale*1.65),y=h*(.39+(p.y-.42)*scale*1.6);
      if(x<0||x>w||y<0||y>h)continue;
      const fade=smooth(0,.10,depth)*(1-smooth(.87,1,depth)),center=1-.60*(1-smooth(.14,.40,Math.abs(x/w-.5)))*(1-smooth(.10,.28,Math.abs(y/h-.55)));
      const a=fade*center*(.22+p.r*.25)*(.88+Math.sin(t*.4+p.phase)*.12),r=(.28+p.r*.45)*scale;
      ctx.fillStyle=`rgba(211,229,250,${a})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function passingJupiter(t) {
    if(immersion<=.001)return;
    if(planetEpoch===null)planetEpoch=t;
    const age=wrap(t-planetEpoch,32),p=clamp((age-3)/23),alpha=smooth(3,5,age)*(1-smooth(23,27,age));
    if(alpha<=.001)return;
    const x=w*(.87-1.24*p**1.1),y=h*(.14+Math.sin(p*Math.PI)*.07),size=Math.min(w,h)*(.035+.40*p*p);
    ctx.save();ctx.globalAlpha*=immersion*alpha*.92;ctx.translate(x,y);ctx.rotate(.17);
    ctx.drawImage(spaceSprite('jupiter'),-size*.5,-size*.5,size,size);ctx.restore();
  }
  function flightClouds(t,daylight,layers) {
    if(immersion<=.001||daylight<=.01)return;
    const palette=Math.max(layers.storm,layers.overcast,layers.rain)>.5?'storm':'day';
    for(let i=0;i<8;i++) {
      const p=clouds[i],near=i>=5,age=wrap((near?(i-5)/3:p.phase/6.28)+t*(near?.016:.012+p.z*.002),1),depth=.45+age*age*(near?1.5:1.3);
      const vx=near?[-.38,.38,-.30][i-5]:(p.x/1.8-.5)*1.9,vy=near?[-.25,-.14,.26][i-5]:(p.y-.32)*.85;
      const x=w*(.5+vx*depth+Math.sin(t*.10+p.phase)*age*.025),y=h*((near?.49:.28)+vy*depth);
      const width=w*(near?.30:.16)*p.scale*depth,height=width*(near?.36:.30);
      const center=1-.72*(1-smooth(.16,.40,Math.abs(x/w-.5)))*(1-smooth(.08,.28,Math.abs(y/h-.55)));
      const alpha=immersion*daylight*smooth(0,.10,age)*(1-smooth(.78,1,age))*((near?.24:.12)+age*.12)*center*(1-layers.fog*.65);
      ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(cloudSprite(p.shape,palette),x-width*.5,y-height*.5,width,height);ctx.restore();
    }
  }
  function glow(x,y,rx,ry,color,opacity=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
    const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(${color},${opacity})`);g.addColorStop(.35,`rgba(${color},${opacity*.42})`);g.addColorStop(1,`rgba(${color},0)`);
    ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  function sun(t,cover) {
    const source=clockLightSource({...state,source:'sun'},w,h);
    const {x,y}=source,light=clockDaylight(state),tint=light.halo;
    const r=Math.max(13,Math.min(w,h)*(.027+.005*light.warmth));
    const visibility=source.visibility;
    const motion=state.idealCycle?1.8:1;
    const breath=.94+Math.sin(t*.31*motion)*.065+Math.sin(t*.71*motion)*.025;
    const driftX=Math.sin(t*.11*motion)*r*1.2,driftY=Math.cos(t*.15*motion)*r*.8;
    glow(x+driftX,y+driftY,r*(16+Math.sin(t*.19)),r*(12+Math.cos(t*.17)),tint,(.21+.08*light.warmth)*(1-cover*.86)*breath*source.daylight);
    glow(x-driftX*1.8,y-driftY,r*9,r*5.5,'226,240,255',.07*breath*source.daylight);
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
  function starfield(t,cover) {
    const visibility=(1-smooth(.2,.92,cover))**1.5;
    if(visibility<.001)return;
    ctx.save();ctx.globalAlpha*=visibility;
    // The pole stays fixed while the sky turns. Preview time speeds the orbit, not the twinkle.
    const orbit=(state.idealCycle||state.timeline)&&Number.isFinite(state.dayProgress)?state.dayProgress*Math.PI*2:state.idealPolar==='night'?t*.022:t*Math.PI*2/86164;
    // ponytail: full mode gently accelerates the live sky, not astronomical sidereal time.
    // Accumulated one-way rotation stays visible without reversing or resetting on weather changes.
    const angle=orbit+(full?starTravel:0);
    const cos=Math.cos(angle),sin=Math.sin(angle),span=Math.hypot(w,h)*1.05;
    const ideal=state.idealCycle||state.idealPolar==='night',rich=ideal||state.enhancedSky||full;
    deepSky(t,angle);
    if(ideal) {
      ctx.save();ctx.translate(w*.5,h*.19);ctx.rotate(angle-.4);
      glow(0,h*.25,w*.60,h*.13,'145,169,218',.075*(1-cover));
      glow(w*.11,h*.24,w*.30,h*.075,'185,199,232',.045*(1-cover));
      ctx.restore();
    }
    for(let i=0;i<Math.min(stars.length,Math.round((rich?390:260)*(full?detail():1)));i++) {
      const p=stars[i];
      const sparkle=.66+Math.sin(t*(.27+p.r*.1)+p.phase)*.20+Math.sin(t*.93+p.phase*3)*.06;
      const dx=(p.x-.5)*span,dy=(p.y-.42)*span;
      const x=w*.5+dx*cos-dy*sin,y=h*.19+dx*sin+dy*cos;
      if(x<-5||x>w+5||y<-5||y>h+5)continue;
      const a=clamp(sparkle*(1-cover*.91)*(.45+p.r*.3)*(rich?1.55:1));
      ctx.fillStyle=`rgba(${p.warm?'249,231,208':'210,228,249'},${a})`;ctx.beginPath();ctx.arc(x,y,p.r,0,Math.PI*2);ctx.fill();
      if(p.r>1.2)glow(x,y,p.r*3.2,p.r*3.2,'175,203,241',a*.13);
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
    passingJupiter(t);
    ctx.restore();
  }
  function cloudscape(t,daylight,layers) {
    const cover=layers.cover,dark=Math.max(layers.storm,layers.rain*.8,layers.overcast),warm=(1-layers.storm)*(1-layers.fog)*clockDaylight(state).environmentWarmth*.65*daylight;
    const density=Math.max(full?.28:.20,cover),depth=smooth(.2,.85,cover);
    for(let i=0;i<Math.min(clouds.length,Math.round(18*(full?detail():1)));i++) {
      const p=clouds[i],layer=p.z;
      const speed=full?(layer===1?-.0062:.0048+layer*.0045)*(.75+noise(i+14,p.phase)*.65):.0036+layer*.0042;
      const motion=full?cloudTime:t;
      const gust=full?(noise(motion*.035+p.phase,i+10)-.5)*.14:Math.sin(t*.10+p.phase)*.014+Math.sin(t*.027+p.phase)*.009;
      const x=(wrap(p.x+cloudTime*speed+gust,1.9)-.45)*w;
      const y=(p.y+(full?(noise(motion*.04+p.phase,i+23)-.5)*.10:Math.sin(t*.035+p.phase)*.020+(state.idealCycle?(noise(t*.025+i,23)-.5)*.08:0)))*h;
      const width=w*(.30+layer*.11)*p.scale*(full?.82+noise(motion*.032+p.phase,i+37)*.36:1);
      const height=h*(.12+([.13,.23,.31][layer]-.12)*depth+layers.storm*.055)*p.scale;
      const opacity=density*(.25+.28*daylight)*(1-layer*.13)*(1-layers.fog*.72)*(state.idealCycle?1.45-daylight*.25:full?1.15:1)*(i<9?1:depth);
      // Cached cloud fields stretch and thin independently; no texture is regenerated per frame.
      const alpha=opacity*(full?.70+noise(motion*.05+p.phase,i+51)*.50:.92+Math.sin(t*.07+p.phase)*.08),drawHeight=height*(full?.76+noise(motion*.045+p.phase,i+63)*.48:1+Math.sin(t*.09+p.phase)*.026);
      ctx.save();ctx.globalAlpha=alpha*daylight*(1-warm)*(1-dark);
      if(ctx.globalAlpha>.001)ctx.drawImage(cloudSprite(p.shape,'day'),x-width*.5,y-height*.5,width,drawHeight);
      if(dark>.001&&daylight>.001){ctx.globalAlpha=alpha*daylight*(1-warm)*dark;ctx.drawImage(cloudSprite(p.shape,'storm'),x-width*.5,y-height*.5,width,drawHeight);}
      if(daylight<.999){ctx.globalAlpha=alpha*(1-daylight);ctx.drawImage(cloudSprite(p.shape,'night'),x-width*.5,y-height*.5,width,drawHeight);}
      if(warm>.001){ctx.globalAlpha=alpha*warm;ctx.drawImage(cloudSprite(p.shape,'warm'),x-width*.5,y-height*.5,width,drawHeight);}
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
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    if(state.phase==='unknown') {
      glow(w*(.5+Math.sin(t*.07)*.035),h*.43,w*.49,h*.46,'55,78,104',.32+Math.sin(t*.27)*.035);mist(t,0,false);return;
    }
    let daytime=[64,139,213];
    for(const [weight,color]of [[layers.overcast,[94,115,139]],[layers.rain*.65,[86,108,129]],[layers.snow,[116,137,156]],[layers.fog,[139,151,163]],[layers.storm,[67,79,94]]])daytime=daytime.map((n,i)=>n+(color[i]-n)*weight);
    const blend=(a,b)=>a.map((n,i)=>Math.round(n+(b[i]-n)*daylight)).join(',');
    const enhanced=state.idealCycle||state.enhancedSky||full,nightLight=enhanced?(1-daylight):0;
    const cloudTint=Math.max(layers.overcast,layers.storm,layers.fog,layers.rain*.75),nightColor=(enhanced?[52,79,128]:[26,49,88]).map((n,i)=>n+([43,56,76][i]-n)*cloudTint);
    const atmosphere=blend(nightColor,daytime);
    glow(w*.51,h*.39,w*.62,h*.66,atmosphere,(.60+.18*daylight+nightLight*.20)*(.94+Math.sin(t*.21)*.06));
    glow(w*(.49+Math.sin(t*.09)*.02),h*.67,w*.5,h*.35,blend(enhanced?[62,82,126]:[36,48,83],[150,186,217]),.20+.05*daylight+nightLight*.08);
    if(nightLight>.001)glow(w*(.44+Math.sin(t*.12)*.08),h*(.38+Math.cos(t*.10)*.05),w*.33,h*.28,'111,143,192',nightLight*(.10+Math.sin(t*.31)*.025));
    if(daylight>.001&&light.environmentWarmth>.001) {
      const sunriseSource=clockLightSource({...state,source:'sun'},w,h);
      const sx=sunriseSource.x,sy=sunriseSource.y;
      glow(sx,sy,w*.38,h*.20,'255,158,85',.48*light.environmentWarmth*daylight);
      glow(w*(.43+Math.sin(t*.06)*.03),h*.68,w*.48,h*.26,'214,139,143',.18*light.environmentWarmth*daylight);
    }
    if(daylight<.999){ctx.save();ctx.globalAlpha=(1-daylight)**1.6;starfield(t,layers.cover);ctx.restore();}
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
    const t=full?motionTime:now,target=full&&quality().level===2&&window.clockMotion?.immersive!==false?1:0;
    immersion+=(target-immersion)*(1-Math.exp(-elapsed*3));
    if(!target&&immersion<.003){immersion=0;if(galaxySprite)galaxySprite.width=galaxySprite.height=0;if(jupiterSprite)jupiterSprite.width=jupiterSprite.height=0;galaxySprite=jupiterSprite=null;planetEpoch=null;}
    const wind=clamp(state.wind,0,85),intensity=clamp(state.intensity);
    cloudTime+=delta*(1+state.wind*.026)*(state.idealCycle?3.5*(.65+noise(t*.025,9)*.7):full?1.8:1);
    if(full)starTravel=wrap(starTravel+delta*.004,Math.PI*2);
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
    if (elapsed >= 1000 / (tv?(document.body.classList.contains('tv-settings-open')?4:window.clockTVFrameRate||20):full?(quality().fps||60):30) - (tv||full?2:0)) { const interval=full&&lastPaint>0?elapsed:undefined;lastPaint=time;paint(time,interval); }
    schedule();
  }
  function resize() {
    const box = canvas.getBoundingClientRect();
    w = Math.max(1, box.width); h = Math.max(1, box.height);
    // ponytail: soft weather uses a 540p budget on TV and 360p in its 640px preview; text is rasterized separately.
    const budget=document.body.classList.contains('tv-settings-open')?640*360:960*540;
    const dpr = tv ? Math.min(1,Math.sqrt(budget/(w*h))) : full ? Math.min(quality().weatherDpr||2,window.devicePixelRatio||1,Math.sqrt((quality().weatherPixels||1920*1080)/(w*h)),2048/w,2048/h) : Math.min(2, window.devicePixelRatio || 1);
    canvas.width = full?Math.floor(w*dpr):Math.round(w*dpr); canvas.height = full?Math.floor(h*dpr):Math.round(h*dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);if(full)lastPaint=0;paint(performance.now());schedule();
  }
  function resume() {
    cancelAnimationFrame(frame); frame = 0;lastMotionTime=null;if(full)lastPaint=0;
    if (!document.hidden) { paint(performance.now()); schedule(); }
  }
  window.addEventListener('resize', resize);
  if(full)window.addEventListener('clockqualitychange',()=>{cloudFields.clear();for(const sprite of cloudSprites.values())sprite.width=sprite.height=0;cloudSprites.clear();requestAnimationFrame(resize);});
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
