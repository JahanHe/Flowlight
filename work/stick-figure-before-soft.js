function createStickFigure() {
  const existing = document.querySelector('.stick-world');
  if (existing?.stickFigure) return existing.stickFigure;
  const world = document.createElement('div'); world.className = 'stick-world';
  const canvas = document.createElement('canvas'); canvas.className = 'stick-canvas'; canvas.setAttribute('aria-hidden','true');
  const button = document.createElement('button'); button.className = 'stick-hit'; button.type = 'button'; button.setAttribute('aria-label','和火柴人互动');
  world.append(canvas, button); document.body.append(world);
  const ctx = canvas.getContext('2d'), measure = document.createElement('canvas').getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  let state = {phase:'unknown',condition:'clear',wind:0}, enabled = true, platforms = [], active = 0, protectedRects=[];
  let x = 0, y = 0, size = 1, scale = 1, direction = 1, mode = 'sit', motion = null, drag = null;
  let light = {x:innerWidth*.3,y:0,rgb:'255,255,255',strength:.8,elevation:45,isDay:true};
  let elapsed = 0, until = 2, awakeUntil = 0, ringUntil = 0, jumpCount = 0, actionCount = 0, poseStarted = 0, sleepCycle = 0;
  let frame = 0, lastPaint = 0, lastStep = 0, geometryKey = '', refreshFrame = 0, wakeTimer = 0, destroyed = false;
  let renderedPose = null, poseVelocity = null, lastPoseTime = 0, lastActivity = -1, previousX=0, previousY=0;
  const canvasWidth=420,canvasHeight=330,originX=210,originY=210;
  const smooth = n => {const v=clamp(n,0,1);return v*v*v*(v*(v*6-15)+10);};
  const night = () => state.phase === 'night' || (state.phase === 'unknown' && (new Date().getHours()<6 || new Date().getHours()>=19));
  function syncMode() { world.dataset.mode = mode; world.dataset.condition = state.condition; world.dataset.mood=mood(); }
  const mood = () => ({sleep:'sleepy','sleep-turn':'sleepy',sit:'relaxed',bored:'bored',curious:'curious',mischief:'playful',dance:'happy',tap:'playful',startle:'surprised',wave:'happy',drag:'curious'})[mode]||'content';
  const sleeping = () => ['sleep','sleep-turn','stretch'].includes(mode);
  function keepOnScreen() {x=clamp(x,28*size,Math.max(28*size,innerWidth-28*size));y=clamp(y,67*size+8,Math.max(67*size+8,innerHeight-12));}
  function pose(next, duration = 2) { mode = next; poseStarted=elapsed; until = elapsed + duration; syncMode(); }
  function anchor(target, px) {
    return {x:clamp(px,target.left,target.right), y:target.top};
  }
  function closest(px) {
    return platforms.reduce((best,p,i) => Math.abs(p.center-px)<Math.abs(platforms[best].center-px)?i:best,0);
  }
  function surface(index, px) {
    const p = platforms[index];
    if (!p) return {x:innerWidth/2,y:innerHeight/2};
    return anchor(p,px ?? p.center);
  }
  function refresh() {
    if (destroyed) return;
    size = clamp(innerWidth/1000,.84,1.18)*scale;
    const next = [];protectedRects=[];
    for (const tile of document.querySelectorAll('.tile')) {
      const rect = tile.getBoundingClientRect(), span = tile.querySelector('.static.top .numeral');
      if (!span || rect.width<1 || rect.height<1) continue;
      const style = getComputedStyle(span), font = parseFloat(style.fontSize), spacing = parseFloat(style.letterSpacing)||0;
      measure.font = `${style.fontWeight} ${font}px ${style.fontFamily}`;
      const chars = [...span.textContent.trim()], widths = chars.map(c=>measure.measureText(c).width);
      const metric = measure.measureText(chars.join(''));
      const height = metric.actualBoundingBoxAscent + metric.actualBoundingBoxDescent;
      // Native text centers its line box; glass centers the painted glyph itself.
      const plainShift = document.body.classList.contains('plain-digits') && Number.isFinite(metric.fontBoundingBoxAscent)
        ? (metric.fontBoundingBoxAscent-metric.fontBoundingBoxDescent-metric.actualBoundingBoxAscent+metric.actualBoundingBoxDescent)/2 : 0;
      let start = rect.left+(rect.width-widths.reduce((a,b)=>a+b,0)-spacing*(chars.length-1))/2;
      const crown=rect.top+(rect.height-height)/2+plainShift;
      // ponytail: the numeral's ink bounds are an occluder; this keeps moving limbs and their shadows behind every clock font without a collision mesh.
      protectedRects.push({left:rect.left-4,top:crown-4,right:rect.right+4,bottom:crown+height+4});
      chars.forEach((char,i) => {
        const width = widths[i];
        // ponytail: each glyph is a small flat ledge at its crown; a full collision mesh is unnecessary for this companion.
        next.push({unit:tile.dataset.unit,left:start+width*.25,right:start+width*.75,center:start+width/2,top:rect.top+(rect.height-height)/2+plainShift-6*size});
        start += width + spacing;
      });
    }
    if (!next.length) { world.hidden = true; return; }
    const key = next.map(p=>[p.unit,p.left,p.right,p.top].join(',')).join('|');
    if (key !== geometryKey) {
      const first = !platforms.length; platforms = next; geometryKey = key;
      active = first ? Math.min(1,platforms.length-1) : closest(x);
      if (first) {const point=surface(active);x=point.x;y=point.y;} else keepOnScreen();
      motion=null;
    }
    for(const element of document.querySelectorAll('.intro,.colon,.editor-only')) {
      const r=element.getBoundingClientRect();if(r.width>0&&r.height>0&&getComputedStyle(element).visibility!=='hidden')protectedRects.push({left:r.left-3,top:r.top-3,right:r.right+3,bottom:r.bottom+3});
    }
    const density = Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(canvasWidth*density)||canvas.height!==Math.round(canvasHeight*density)){canvas.width=Math.round(canvasWidth*density);canvas.height=Math.round(canvasHeight*density);ctx.setTransform(density,0,0,density,0,0);}
    keepOnScreen();world.dataset.scale=String(scale);
    world.hidden = !enabled;
    draw(); schedule();
  }
  function queueRefresh() {
    if (!refreshFrame) refreshFrame = requestAnimationFrame(() => { refreshFrame=0; refresh(); });
  }
  function travel(index, targetX, forced = false) {
    if (!platforms.length || drag) return;
    active = index;travelTo(surface(index,targetX),forced);
  }
  function travelTo(dest, forced = false) {
    if(drag)return;
    dest={x:clamp(dest.x,28*size,innerWidth-28*size),y:clamp(dest.y,67*size+8,innerHeight-12)};
    const distance = Math.hypot(dest.x-x,dest.y-y);
    direction = dest.x>=x ? 1 : -1;
    if (reduced.matches) {x=dest.x;y=dest.y;motion=null;pose('wave',1.8);return;}
    const jump = forced || distance>42*size || Math.abs(dest.y-y)>8;
    motion = {fromX:x,fromY:y,toX:dest.x,toY:dest.y,start:elapsed,duration:jump?clamp(distance/190,.8,4.2):clamp(distance/38,.7,3.5),height:distance<10?12:Math.min(27,12+distance*.08),jump};
    if(jump) jumpCount++;
    pose(jump?'jump':'walk',motion.duration);
  }
  function wake() {
    awakeUntil = elapsed + 12; ringUntil = elapsed+.8; clearTimeout(wakeTimer);
    if(reduced.matches) wakeTimer=setTimeout(()=>{awakeUntil=elapsed;pose(night()?'sleep':'sit',5);draw();},12000);
  }
  function interact() {
    if (!enabled || !platforms.length) return;
    wake(); motion=null; pose('wave',2.4); draw(); schedule();
  }
  function chooseAction() {
    if (night() && elapsed>=awakeUntil) {
      if(mode==='sleep' && !reduced.matches) {sleepCycle++;pose(sleepCycle%2?'sleep-turn':'stretch',sleepCycle%2?1.8:2.2);}
      else pose('sleep',6+sleepCycle%3);
      return;
    }
    if (reduced.matches) { pose('sit',8); return; }
    actionCount++;
    if (state.condition==='storm' && actionCount%3===1) {pose('startle',1.1);ringUntil=elapsed+.7;return;}
    const action=actionCount%10;
    if(action===1||action===5||action===9) {
      // A deterministic wandering route reaches all quadrants without stopping the weather animation.
      const column=(actionCount*.61803398875)%1,row=(actionCount*.41421356237)%1;
      travelTo({x:innerWidth*(.08+column*.84),y:innerHeight*(.12+row*.82)},true);
    } else if(action===2) pose('curious',3.8);
    else if(action===3) pose('bored',5.4);
    else if(action===4) {pose('mischief',3.5);ringUntil=elapsed+1.2;}
    else if(action===6) {const next=(active+direction+platforms.length)%platforms.length;travel(next,undefined,true);}
    else if(action===7) pose('dance',4.2);
    else if(action===8) {pose('tap',2.8);ringUntil=elapsed+2.8;}
    else pose('sit',4.5);
  }
  function update(delta) {
    elapsed += delta;
    if (drag) return;
    if (motion) {
      const progress = clamp((elapsed-motion.start)/motion.duration,0,1), flight=motion.jump?clamp((progress-.14)/.7,0,1):progress, move=smooth(flight);
      x = motion.fromX+(motion.toX-motion.fromX)*move;
      y = motion.fromY+(motion.toY-motion.fromY)*move-(motion.jump?Math.sin(flight*Math.PI)*motion.height*size:0);
      if (progress>=1) {motion=null;ringUntil=elapsed+.45;pose(night() && elapsed>=awakeUntil?'sleep':'stand',.8);}
    } else if (elapsed>=until) chooseAction();
  }
  function path(points) {
    ctx.beginPath(); points.forEach((p,i)=> i?ctx.lineTo(...p):ctx.moveTo(...p)); ctx.stroke();
  }
  function circle(cx,cy,r,fill=false) {ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);fill?ctx.fill():ctx.stroke();}
  // Motion principles: asymmetric breath/weight settling (Virtual3D/NPCMotion),
  // frame-rate independent damping (three.js MathUtils). These are local 2D poses, with no runtime dependency.
  function breath(t) {
    const phase=((t*.22)%1+1)%1;
    return phase<.36?smooth(phase/.36):phase<.91?1-smooth((phase-.36)/.55):0;
  }
  function targetPose(t) {
    const age=elapsed-poseStarted, breathing=breath(t)-.4, delayed=breath(t-.18)-.4;
    const drift=Math.sin(t*.67)*.28+Math.sin(t*1.13+.8)*.12;
    const shift=(smooth((t%15-5.8)/1.3)-smooth((t%15-12.6)/1.4)-.5)*.9;
    const asleep=mode==='sleep'||mode==='sleep-turn', wet=state.condition==='rain'||state.condition==='storm';
    const p={hip:[shift,-22],chest:[shift*.65+drift,-36-breathing*1.2],head:[shift*.65+drift,-44.5-delayed],
      handL:[-10+Math.sin(t*.87)*.35,-17+breathing*.25],handR:[11+Math.sin(t*.73+1.4)*.35,-17+delayed*.25],
      footL:[-7,0],footR:[7,0],bends:[1,-1,1,-1],props:[asleep?1:0,wet?1:0,state.condition==='snow'?1:0,direction]};
    if(asleep) {
      const turn=mode==='sleep-turn'?Math.sin(smooth(age/1.8)*Math.PI):0;
      p.hip=[1,-7-turn*1.5];p.chest=[-11+turn*1.4,-8-breathing*1.6-turn*1.7];
      p.head=[-20+turn*.8,-9-delayed*.65-turn*.65];
      p.handL=[-20,-2+Math.sin(t*.71)*.16];p.handR=[-9+turn*2,-3-breathing*.3];
      p.footL=[20-turn*4,-1-turn*3];p.footR=[17-turn*5,-4-turn*4];p.bends=[-1,-1,-1,1];
    } else if(mode==='sit') {
      p.hip=[-3+shift*.3,-11];p.chest=[-3+drift,-25-breathing*.75];p.head=[-2.5+drift,-33.5-delayed*.6];
      p.handL=[-9,-8+Math.sin(t*.9)*.22];p.handR=[9+Math.sin(t*.7)*.25,-8];
      p.footL=[18,-1];p.footR=[13,-2];p.bends=[-1,-1,1,-1];
    } else if(mode==='walk') {
      const speed=motion?Math.abs(motion.toX-motion.fromX)/motion.duration:26, stride=clamp(speed/4,3,8), cadence=clamp(speed/(stride*4),.75,1.6);
      const step=offset=>{const phase=(t*cadence+offset)%1;return phase<.62?[stride*(1-2*phase/.62),0]:[-stride+2*stride*smooth((phase-.62)/.38),-Math.sin((phase-.62)/.38*Math.PI)*3.2];};
      p.footL=step(0);p.footR=step(.5);
      const gait=Math.sin(t*cadence*Math.PI*2);
      p.hip=[1.1,-21.8+Math.cos(t*cadence*Math.PI*4)*.45];p.chest[0]+=1.8;p.head[0]+=2.2;
      p.handL[0]-=gait*4;p.handR[0]+=gait*4;p.bends[0]=p.bends[1]=-1;
    } else if(mode==='jump') {
      const progress=motion?clamp((elapsed-motion.start)/motion.duration,0,1):.5;
      const tuck=Math.sin(clamp((progress-.12)/.72,0,1)*Math.PI), crouch=progress<.14?smooth(progress/.14)*3.2:progress>.84?Math.sin((progress-.84)/.16*Math.PI)*2.2:0;
      p.hip[1]+=crouch;p.chest[1]+=crouch;p.head[1]+=crouch;
      p.footL=[-7-tuck*2,-tuck*5];p.footR=[9+tuck*3,-tuck*8];
      p.handL=[-13,-29-tuck*13];p.handR=[14,-29-tuck*15];
    } else if(mode==='drag') {
      p.hip=[Math.sin(t*1.8)*.4,-20];p.chest[0]=Math.sin(t*1.7)*.55;p.head[0]=Math.sin(t*1.6)*.7;
      p.handL=[-12+Math.sin(t*2.2)*.3,-46];p.handR=[13+Math.sin(t*1.9)*.3,-46.5];
      p.footL=[-5,-2+Math.sin(t*1.6)*.4];p.footR=[10,-5+Math.sin(t*1.4+1)*.45];
    } else if(mode==='wave') {
      const wave=Math.sin(age*5.2)*Math.sin(Math.min(1,age/.35)*Math.PI/2);
      p.handL=[-13+wave*2.3,-51+Math.sin(age*5.2+.5)*.65];p.head[0]+=Math.sin(age*1.4)*.45;
    } else if(mode==='stretch') {
      const reach=Math.sin(smooth(age/2.2)*Math.PI);
      p.chest[1]-=reach*1.5;p.head[1]-=reach*1.8;
      p.handL=[-10-reach*2,-49-reach*8];p.handR=[11+reach*2,-50-reach*8];
    } else if(mode==='startle') {
      const recoil=Math.exp(-age*3.3);
      p.hip[1]+=recoil*1.7;p.chest[0]-=recoil*1.3;p.head[0]-=recoil*1.8;
      p.handL=[-12-Math.sin(age*17)*recoil*.45,-43];p.handR=[13,-43+Math.sin(age*15)*recoil*.35];
    } else if(mode==='tap') {
      const tap=(1+Math.cos(age*4.1))*.5;
      p.hip=[2,-17];p.chest=[5+drift,-25-breathing*.4];p.head=[9+drift,-33-delayed*.4];
      p.handL=[-7,-11];p.handR=[15,-4-tap*2];
    } else if(mode==='bored') {
      const fidget=Math.sin(t*2.8)*1.4;
      p.hip=[-3,-12];p.chest=[-5+drift,-25-breathing*.8];p.head=[-2+drift,-33-delayed*.7];
      p.handL=[-11,-9];p.handR=[1,-29+Math.sin(t*.9)*.3];p.footL=[17,-1];p.footR=[14+fidget,-2];p.bends=[-1,-1,1,-1];
    } else if(mode==='curious') {
      const peek=Math.sin(age*.9)*2.3;
      p.hip=[-2,-20];p.chest=[3+peek,-33-breathing];p.head=[6+peek,-42-delayed];
      p.handL=[-8,-19];p.handR=[11+peek,-39];p.footL=[-8,0];p.footR=[10,-.6];
    } else if(mode==='mischief') {
      const prod=(1+Math.sin(age*4.3))*.5;
      p.hip=[1,-18];p.chest=[6+drift,-31-breathing*.8];p.head=[8+drift,-40-delayed];
      p.handL=[-6,-17];p.handR=[18+prod*5,-29-prod*4];p.footL=[-9,0];p.footR=[10,-.6];
    } else if(mode==='dance') {
      const sway=Math.sin(age*2.8),bounce=Math.sin(age*5.6)*.9;
      p.hip=[sway*3,-22+bounce];p.chest=[sway*4,-36+bounce-breathing];p.head=[sway*4.6,-45+bounce-delayed];
      p.handL=[-16+sway*3,-37-Math.sin(age*2.8+.5)*6];p.handR=[17+sway*3,-37+Math.sin(age*2.8+.5)*6];
      p.footL=[-7,-Math.max(0,sway)*2];p.footR=[7,-Math.max(0,-sway)*2];
    }
    if(wet&&!asleep) p.handR=[14+Math.sin(t*.63)*.25,p.chest[1]+7];
    if(!asleep) {p.head[0]+=Math.sin(t*.43+.7)*.35;p.handL[1]+=Math.sin(t*1.31+.4)*.18;p.handR[1]+=Math.sin(t*1.07+1.3)*.18;}
    for(const key of ['hip','chest','head','handL','handR','footL','footR'])p[key][0]*=direction;
    p.bends=p.bends.map(n=>n*direction);
    return p;
  }
  function limb(start,end,length,bend) {
    // Two-bone geometry preserves joint length as the chest breathes and the feet stay planted.
    const dx=end[0]-start[0],dy=end[1]-start[1],distance=Math.max(.01,Math.hypot(dx,dy));
    const reach=Math.min(distance,length*2-.01),height=Math.sqrt(Math.max(0,length*length-reach*reach/4));
    const joint=[(start[0]+end[0])/2-dy/distance*height*bend,(start[1]+end[1])/2+dx/distance*height*bend];
    path([start,joint,end]);
  }
  function joint(start,end,length,bend) {
    const dx=end[0]-start[0],dy=end[1]-start[1],distance=Math.max(.01,Math.hypot(dx,dy));
    const reach=Math.min(distance,length*2-.01),height=Math.sqrt(Math.max(0,length*length-reach*reach/4));
    return [(start[0]+end[0])/2-dy/distance*height*bend,(start[1]+end[1])/2+dx/distance*height*bend];
  }
  function tube(a,b,width,back=false) {
    const dx=b[0]-a[0],dy=b[1]-a[1],distance=Math.max(.01,Math.hypot(dx,dy));
    const nx=-dy/distance,ny=dx/distance,mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
    const lx=(light.x-x)/Math.max(size,1),ly=(light.y-y)/Math.max(size,1),length=Math.max(1,Math.hypot(lx,ly));
    const facing=(nx*lx+ny*ly)/length,shine=clamp((facing+1)/2,.12,.88);
    const rgb=Array.isArray(light.rgb)?light.rgb:String(light.rgb).split(',').map(Number);
    const strength=clamp(light.strength||0,0,1),shade=(back?.72:1)*(.72+strength*.28),visibility=clamp(Number.isFinite(light.visibility)?light.visibility:1,0,1);
    const color=level=>`rgb(${[0,1,2].map(i=>Math.round(clamp((level+(Number.isFinite(rgb[i])?rgb[i]:230)-255)*shade,0,255))).join(',')})`;
    const gradient=ctx.createLinearGradient(mx-nx*width*.65,my-ny*width*.65,mx+nx*width*.65,my+ny*width*.65);
    gradient.addColorStop(0,color(73+strength*32));gradient.addColorStop(clamp(shine*.8+.1,.15,.85),color(226+strength*27));gradient.addColorStop(1,color(96+strength*32));
    ctx.lineWidth=width;ctx.strokeStyle=gradient;path([a,b]);
    ctx.lineWidth=Math.max(.55,width*.13);ctx.strokeStyle=`rgba(255,255,255,${.12+strength*visibility*.29})`;
    const side=facing>=0?1:-1;path([[a[0]+nx*width*.23*side,a[1]+ny*width*.23*side],[b[0]+nx*width*.23*side,b[1]+ny*width*.23*side]]);
  }
  function volumeLimb(a,b,length,bend,width,back=false) {
    const middle=joint(a,b,length,bend);tube(a,middle,width,back);tube(middle,b,width*.9,back);
  }
  function paintShadow(p,sleepAmount) {
    const dx=x-light.x,dy=y-light.y,distance=Math.max(1,Math.hypot(dx,dy));
    const elevation=Math.abs(Number(light.elevation)||35),stretch=clamp(1.5-elevation/78,.28,1.4);
    const visibility=clamp(Number.isFinite(light.visibility)?light.visibility:1,0,1);
    const sx=dx/distance*stretch*visibility,sy=dy/distance*stretch*.52*visibility;
    world.dataset.shadowX=sx.toFixed(3);world.dataset.shadowY=sy.toFixed(3);
    ctx.save();ctx.globalAlpha=.08+clamp(light.strength||0,0,1)*visibility*.36;ctx.fillStyle='#000';ctx.strokeStyle='#000';ctx.lineWidth=4.8;
    ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=4;ctx.transform(1,0,-sx,-sy,0,2);
    limb(p.hip,p.footL,12.4,p.bends[0]);limb(p.hip,p.footR,12.4,p.bends[1]);limb(p.chest,p.handL,10.7,p.bends[2]);limb(p.chest,p.handR,10.7,p.bends[3]);path([p.hip,p.chest,p.head]);circle(...p.head,7.1,true);ctx.restore();
    ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(1,2,10+sleepAmount*14,2.2,0,0,Math.PI*2);ctx.fill();
  }
  function paintHead(p,sleepAmount,t) {
    const [hx,hy]=p.head,dx=light.x-x,dy=light.y-y,d=Math.max(1,Math.hypot(dx,dy)),strength=clamp(light.strength||0,0,1);
    const rgb=Array.isArray(light.rgb)?light.rgb:String(light.rgb).split(',').map(Number);
    const tone=(level,tint)=>`rgb(${[0,1,2].map(i=>Math.round(clamp(level*(.72+strength*.28)+(Number.isFinite(rgb[i])?rgb[i]-255:0)*tint*strength,0,255))).join(',')})`;
    const head=ctx.createRadialGradient(hx+dx/d*3,hy+dy/d*3,1,hx,hy,7.4);
    head.addColorStop(0,tone(252,.35));head.addColorStop(.4,tone(231,.65));head.addColorStop(.8,tone(162,.45));head.addColorStop(1,tone(88,.25));
    ctx.fillStyle=head;circle(hx,hy,7.3,true);
    ctx.strokeStyle=`rgba(255,255,255,${.2+strength*.3})`;ctx.lineWidth=.55;circle(hx,hy,7.2);
    const blinkPhase=t%5.7,blink=blinkPhase>5.3&&blinkPhase<5.48?Math.sin((blinkPhase-5.3)/.18*Math.PI):0;
    const look=p.props[3],eyeY=hy-.5,faceX=hx+look*1.7,closed=sleepAmount>.6||blink>.55;
    ctx.shadowBlur=0;ctx.strokeStyle='#31404c';ctx.fillStyle='#26343e';ctx.lineWidth=.8;
    for(const offset of [-1.7,1.7]){if(closed)path([[faceX+offset-.65,eyeY],[faceX+offset+.65,eyeY+.15]]);else{ctx.beginPath();ctx.ellipse(faceX+offset,eyeY,.58,mode==='startle'?1.15:.86,0,0,Math.PI*2);ctx.fill();}}
    const happy=['wave','dance','mischief'].includes(mode);
    ctx.beginPath();ctx.moveTo(faceX-1.1,hy+2.5);ctx.quadraticCurveTo(faceX,hy+(happy?4:mode==='bored'?1.8:2.9),faceX+1.1,hy+2.5);ctx.stroke();
    if(mode==='curious'||mode==='mischief'){ctx.lineWidth=.65;path([[faceX-2.5,hy-2.5],[faceX-1.1,hy-3]]);}
  }
  function draw() {
    if (!ctx || !enabled || !platforms.length || document.hidden || destroyed) return;
    keepOnScreen();ctx.clearRect(0,0,canvasWidth,canvasHeight);
    const hitWidth=Math.max(60,64*size),hitHeight=Math.max(72,82*size);
    canvas.style.transform=`translate(${x-originX}px,${y-originY}px)`;
    button.style.width=`${hitWidth}px`;button.style.height=`${hitHeight}px`;button.style.transform=`translate(${clamp(x-hitWidth/2,0,Math.max(0,innerWidth-hitWidth))}px,${clamp(y-hitHeight+10,0,Math.max(0,innerHeight-hitHeight))}px)`;
    const t=reduced.matches?0:elapsed, target=targetPose(t), delta=Math.max(0,elapsed-lastPoseTime);
    // A pose request changes targets, never the rendered joints on that same frame.
    const decay=Math.exp(-12*delta);lastPoseTime=elapsed;
    if(!renderedPose) {
      renderedPose=Object.fromEntries(Object.entries(target).map(([key,values])=>[key,[...values]]));
      poseVelocity=Object.fromEntries(Object.entries(target).map(([key,values])=>[key,values.map(()=>0)]));
    } else for(const key in target)target[key].forEach((value,i)=>{
      if(reduced.matches){renderedPose[key][i]=value;poseVelocity[key][i]=0;return;}
      const offset=renderedPose[key][i]-value,travel=(poseVelocity[key][i]+12*offset)*delta;
      renderedPose[key][i]=value+(offset+travel)*decay;poseVelocity[key][i]=(poseVelocity[key][i]-12*travel)*decay;
    });
    const p=renderedPose,[sleepAmount,wet,snow,look]=p.props;
    ctx.save();ctx.translate(originX,originY);ctx.scale(size,size);ctx.lineCap='round';ctx.lineJoin='round';
    paintShadow(p,sleepAmount);
    if(elapsed<ringUntil&&!reduced.matches) {
      const fade=Math.min(1,ringUntil-elapsed),ripple=(1-fade)*11;
      ctx.strokeStyle=`rgba(217,232,250,${fade*.22})`;ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(0,1,11+ripple,2.5+ripple*.12,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.shadowColor='rgba(0,0,0,.25)';ctx.shadowBlur=1.5;ctx.shadowOffsetY=.7;
    volumeLimb(p.hip,p.footL,12.4,p.bends[0],4.4,true);volumeLimb(p.chest,p.handL,10.7,p.bends[2],3.9,true);
    tube(p.hip,p.chest,5.7);
    volumeLimb(p.hip,p.footR,12.4,p.bends[1],4.5);volumeLimb(p.chest,p.handR,10.7,p.bends[3],4);
    tube(p.chest,p.head,3.2);paintHead(p,sleepAmount,t);
    if(snow>.005) {
      ctx.globalAlpha=snow;ctx.strokeStyle='#c98c76';ctx.lineWidth=3.1;
      const scarf=p.chest,flutter=Math.sin(t*2.1+.8)*.7+Math.sin(t*1.3)*.4;
      path([[scarf[0]-3,scarf[1]+1],[scarf[0]+3,scarf[1]+1],[scarf[0]+8+flutter,scarf[1]+8-sleepAmount*5]]);
    }
    if(wet>.005) {
      ctx.globalAlpha=wet;ctx.strokeStyle='#cbd9e4';ctx.lineWidth=1.4;
      const gripX=p.handR[0]*(1-sleepAmount)+22*sleepAmount,gripY=p.handR[1]*(1-sleepAmount)-3*sleepAmount;
      const sway=(Math.sin(t*.82)*.7+Math.sin(t*1.21)*.25)*(1+clamp((state.wind||0)/60,0,1)*.65);
      ctx.save();ctx.translate(gripX,gripY);ctx.rotate(sway*.018);path([[0,2],[0,-34]]);
      const fabric=ctx.createLinearGradient(-23,-40,22,-18);fabric.addColorStop(0,'rgba(185,210,225,.75)');fabric.addColorStop(.48,'rgba(104,145,170,.65)');fabric.addColorStop(1,'rgba(47,82,109,.82)');ctx.fillStyle=fabric;
      ctx.beginPath();ctx.moveTo(-22,-22);ctx.quadraticCurveTo(0,-48,22,-22);ctx.quadraticCurveTo(11,-27,0,-22);ctx.quadraticCurveTo(-11,-27,-22,-22);ctx.fill();ctx.stroke();
      ctx.globalAlpha=wet*.5;path([[0,-35],[0,-23]]);ctx.restore();
    }
    ctx.restore();
    // The companion travels across the whole screen but passes behind the time, date and controls.
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';
    for(const r of protectedRects)ctx.fillRect(r.left-x+originX,r.top-y+originY,r.right-r.left,r.bottom-r.top);
    ctx.restore();
    world.dataset.mode=mode;world.dataset.mood=mood();world.dataset.platform=String(active);world.dataset.jumps=String(jumpCount);
    world.dataset.x=x.toFixed(2);world.dataset.y=y.toFixed(2);
    if(elapsed-lastActivity>=.09||lastActivity<0) {
      const movement=Math.hypot(x-previousX,y-previousY)/Math.max(.09,elapsed-lastActivity);
      const behindText=protectedRects.some(r=>x-25*size>r.left&&x+25*size<r.right&&y-75*size>r.top&&y+10*size<r.bottom);
      const energy=behindText?0:drag?.9:['tap','mischief'].includes(mode)?.65+Math.sin(t*4.3)*.2:mode==='dance'?.5:Math.min(.55,movement/240);
      document.dispatchEvent(new CustomEvent('companionactivity',{detail:{x,y,energy,mood:mood()}}));
      previousX=x;previousY=y;lastActivity=elapsed;
    }
  }

  function animate(now) {
    frame=0;if(destroyed || document.hidden || !enabled) return;
    if (now-lastPaint>=1000/30-1) {
      const delta = lastStep ? Math.min((now-lastStep)/1000,.08) : 0;lastStep=now;lastPaint=now;
      update(delta);draw();
    }
    schedule();
  }
  function schedule() {if(!frame && !destroyed && !document.hidden && enabled && !reduced.matches)frame=requestAnimationFrame(animate);}
  function setState(next) {
    const previousNight=night(), previousCondition=state.condition;
    state={...state,...next};
    if (!drag && !motion && ((night() && !previousNight) || (night() && awakeUntil<=elapsed && !sleeping()))) pose('sleep',6);
    if (!night() && previousNight) pose('wave',2);
    if (state.condition==='storm' && previousCondition!=='storm' && !night() && !drag) pose('startle',1);
    syncMode();draw();schedule();
  }
  function onFlip(unit) {
    queueRefresh();
    if (!enabled || drag || motion || reduced.matches || platforms[active]?.unit!==unit || Math.abs(y-platforms[active].top)>12*size) return;
    if (sleeping()) {ringUntil=elapsed+.35;draw();return;}
    travel(active,x,true);
  }
  function setEnabled(value) {
    enabled=Boolean(value);world.hidden=!enabled;
    if (!enabled) {cancelAnimationFrame(frame);frame=0;drag=null;lastStep=0;document.dispatchEvent(new CustomEvent('companionactivity',{detail:{x,y,energy:0,mood:'hidden'}}));} else {lastActivity=-1;refresh();schedule();}
  }
  function setScale(value) {const next=Number(value);if(!Number.isFinite(next))return;scale=clamp(next,.65,1.8);refresh();}
  function setLight(next) {
    if(!next||!Number.isFinite(next.x)||!Number.isFinite(next.y))return;
    light={...light,...next,strength:clamp(Number(next.strength)||0,0,1)};
    if(reduced.matches)draw();
  }
  function pointerDown(event) {
    if (!enabled || drag || (event.button!==undefined && event.button!==0)) return;
    event.stopPropagation();event.preventDefault();
    button.setPointerCapture(event.pointerId);wake();motion=null;
    drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:x-event.clientX,offsetY:y-event.clientY,moved:false};
    pose('drag');draw();schedule();
  }
  function pointerMove(event) {
    if(!drag || drag.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    drag.moved ||= Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>5;
    x=event.clientX+drag.offsetX;y=event.clientY+drag.offsetY;keepOnScreen();
    draw();
  }
  function pointerUp(event) {
    if(!drag || drag.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();const moved=drag.moved;drag=null;
    if(button.hasPointerCapture(event.pointerId))button.releasePointerCapture(event.pointerId);
    if(moved){active=closest(x);ringUntil=elapsed+.6;pose('curious',2.6);}else interact();draw();schedule();
  }
  function pointerCancel(event) {
    if(!drag || drag.id!==event.pointerId)return;
    drag=null;pose('stand',1.2);draw();schedule();
  }
  function buttonClick(event) {event.stopPropagation();if(event.detail===0)interact();}
  function stopDouble(event) {event.preventDefault();event.stopPropagation();}
  function summon(event) {
    if (!enabled || drag || event.defaultPrevented || event.detail>1 || !platforms.length || !(event.target instanceof Element)) return;
    if(event.target.closest('button,input,label,a,select,textarea,form,.editor-only,.stick-world'))return;
    wake();travelTo({x:event.clientX,y:event.clientY+24*size},true);draw();schedule();
  }
  function visibility() {
    cancelAnimationFrame(frame);frame=0;lastStep=0;lastPaint=0;
    if (!document.hidden) {refresh();schedule();}
  }
  function motionPreference() {cancelAnimationFrame(frame);frame=0;lastStep=0;motion=null;pose(night()?'sleep':'sit',5);refresh();schedule();}
  button.addEventListener('pointerdown',pointerDown);button.addEventListener('pointermove',pointerMove);
  button.addEventListener('pointerup',pointerUp);button.addEventListener('pointercancel',pointerCancel);
  button.addEventListener('lostpointercapture',pointerCancel);button.addEventListener('click',buttonClick);button.addEventListener('dblclick',stopDouble);
  document.addEventListener('click',summon);document.addEventListener('visibilitychange',visibility);
  window.addEventListener('resize',queueRefresh);window.addEventListener('scroll',queueRefresh,{passive:true});
  document.addEventListener('fullscreenchange',queueRefresh);reduced.addEventListener('change',motionPreference);
  window.visualViewport?.addEventListener('resize',queueRefresh);
  const observer=new ResizeObserver(queueRefresh);const clock=document.querySelector('.clock');if(clock)observer.observe(clock);
  function destroy() {
    destroyed=true;cancelAnimationFrame(frame);cancelAnimationFrame(refreshFrame);clearTimeout(wakeTimer);observer.disconnect();
    document.removeEventListener('click',summon);document.removeEventListener('visibilitychange',visibility);
    window.removeEventListener('resize',queueRefresh);window.removeEventListener('scroll',queueRefresh);
    document.removeEventListener('fullscreenchange',queueRefresh);reduced.removeEventListener('change',motionPreference);window.visualViewport?.removeEventListener('resize',queueRefresh);
    world.remove();
  }
  const api={setState,refresh,onFlip,setEnabled,destroy};Object.assign(api,{setScale,setLight});world.stickFigure=api;
  refresh();if(night())pose('sleep',6);draw();schedule();
  return api;
}
