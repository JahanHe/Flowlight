function createStickFigure() {
  const existing = document.querySelector('.stick-world');
  if (existing?.stickFigure) return existing.stickFigure;
  const world = document.createElement('div'); world.className = 'stick-world';
  const canvas = document.createElement('canvas'); canvas.className = 'stick-canvas'; canvas.setAttribute('aria-hidden','true');
  const button = document.createElement('button'); button.className = 'stick-hit'; button.type = 'button'; button.setAttribute('aria-label','和小生灵互动，可触摸拖动');
  world.append(canvas, button); document.body.append(world);
  const ctx = canvas.getContext('2d'), measure = document.createElement('canvas').getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  let state = {phase:'unknown',condition:'clear',wind:0}, enabled = true, platforms = [], active = 0, obstacles=[];
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
    const next = [];obstacles=[];
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
      // Avoid the text by choosing clear routes. No pixels are masked or erased.
      obstacles.push({left:rect.left-4,top:crown-4,right:rect.right+4,bottom:crown+height+4});
      chars.forEach((char,i) => {
        const width = widths[i];
        // ponytail: each glyph is a small flat ledge at its crown; a full collision mesh is unnecessary for this companion.
        next.push({unit:tile.dataset.unit,left:start+width*.25,right:start+width*.75,center:start+width/2,top:rect.top+(rect.height-height)/2+plainShift-14*size});
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
      const r=element.getBoundingClientRect();if(r.width>0&&r.height>0&&getComputedStyle(element).visibility!=='hidden')obstacles.push({left:r.left-3,top:r.top-3,right:r.right+3,bottom:r.bottom+3});
    }
    const density = Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(canvasWidth*density)||canvas.height!==Math.round(canvasHeight*density)){canvas.width=Math.round(canvasWidth*density);canvas.height=Math.round(canvasHeight*density);ctx.setTransform(density,0,0,density,0,0);}
    keepOnScreen();if(!drag&&!motion){const safe=clearPoint({x,y});x=safe.x;y=safe.y;}world.dataset.scale=String(scale);
    world.hidden = !enabled;
    draw(); schedule();
  }
  function queueRefresh() {
    if (!refreshFrame) refreshFrame = requestAnimationFrame(() => { refreshFrame=0; refresh(); });
  }
  function exclusionRects() {
    return obstacles.map(r=>({left:r.left-34*size,right:r.right+34*size,top:r.top-9*size,bottom:r.bottom+72*size}));
  }
  function inside(point,r) {return point.x>r.left&&point.x<r.right&&point.y>r.top&&point.y<r.bottom;}
  function screenPoint(point) {return {x:clamp(point.x,35*size,Math.max(35*size,innerWidth-35*size)),y:clamp(point.y,72*size+8,Math.max(72*size+8,innerHeight-14))};}
  function clearPoint(point) {
    const rects=exclusionRects(),start=screenPoint(point);
    if(!rects.some(r=>inside(start,r)))return start;
    // A few text rectangles are enough for this local canvas; no collision dependency or clipping layer.
    const candidates=[];
    for(const r of rects)for(const px of [r.left-2,start.x,r.right+2])for(const py of [r.top-2,start.y,r.bottom+2])candidates.push(screenPoint({x:px,y:py}));
    return candidates.filter(p=>!rects.some(r=>inside(p,r))).sort((a,b)=>Math.hypot(a.x-start.x,a.y-start.y)-Math.hypot(b.x-start.x,b.y-start.y))[0]||screenPoint({x:innerWidth*.1,y:innerHeight*.8});
  }
  function clearSegment(a,b,rects) {
    return !rects.some(r=>{
      let lo=0,hi=1;
      for(const [v,d,min,max] of [[a.x,b.x-a.x,r.left+.1,r.right-.1],[a.y,b.y-a.y,r.top+.1,r.bottom-.1]]) {
        if(Math.abs(d)<.0001){if(v<=min||v>=max)return false;continue;}
        const t1=(min-v)/d,t2=(max-v)/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;
      }
      return hi>0&&lo<1;
    });
  }
  function routeTo(destination) {
    const rects=exclusionRects(),start={x,y},exit=clearPoint(start),end=clearPoint(destination);
    const points=[exit,end];
    for(const r of rects)for(const px of [r.left-2,r.right+2])for(const py of [r.top-2,r.bottom+2]) {
      const point=screenPoint({x:px,y:py});if(!rects.some(o=>inside(point,o)))points.push(point);
    }
    const distance=points.map(()=>Infinity),previous=points.map(()=>-1),visited=new Set();distance[0]=0;
    while(visited.size<points.length) {
      let next=-1;for(let i=0;i<points.length;i++)if(!visited.has(i)&&(next<0||distance[i]<distance[next]))next=i;
      if(next<0||!Number.isFinite(distance[next])||next===1)break;visited.add(next);
      for(let i=0;i<points.length;i++)if(!visited.has(i)&&clearSegment(points[next],points[i],rects)) {
        const candidate=distance[next]+Math.hypot(points[next].x-points[i].x,points[next].y-points[i].y);
        if(candidate<distance[i]){distance[i]=candidate;previous[i]=next;}
      }
    }
    if(!Number.isFinite(distance[1]))return [start,exit];
    const path=[];for(let i=1;i>=0;i=previous[i]){path.unshift(points[i]);if(i===0)break;}
    return [start,...path.filter((p,i)=>i>0||Math.hypot(p.x-start.x,p.y-start.y)>.5)];
  }
  function travel(index,targetX,forced=false) {
    if(!platforms.length||drag)return;active=index;travelTo(surface(index,targetX),forced);
  }
  function travelTo(dest,forced=false) {
    if(drag)return;
    const points=routeTo(dest),lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)),distance=lengths.reduce((a,b)=>a+b,0);
    const end=points[points.length-1];direction=end.x>=x?1:-1;
    if(reduced.matches){x=end.x;y=end.y;motion=null;pose('wave',1.8);return;}
    const jump=forced||distance>42*size;
    motion={points,lengths,total:distance,start:elapsed,duration:clamp(distance/100,.8,12),jump};
    if(jump)jumpCount++;pose(jump?'jump':'walk',motion.duration);
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
      const progress=clamp((elapsed-motion.start)/motion.duration,0,1);
      let distance=smooth(progress)*motion.total;
      for(let i=0;i<motion.lengths.length;i++) {
        const length=motion.lengths[i];
        if(distance<=length||i===motion.lengths.length-1) {
          const amount=length?clamp(distance/length,0,1):1,a=motion.points[i],b=motion.points[i+1];
          x=a.x+(b.x-a.x)*amount;y=a.y+(b.y-a.y)*amount;break;
        }
        distance-=length;
      }
      if(progress>=1){motion=null;ringUntil=elapsed+.45;pose(night()&&elapsed>=awakeUntil?'sleep':'stand',.8);}
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
      const speed=motion?motion.total/motion.duration:26, stride=clamp(speed/4,3,8), cadence=clamp(speed/(stride*4),.75,1.6);
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
  // Cubic contours and frame-rate-independent spring settling keep the body supple.
  // References: MDN Canvas bezierCurveTo and pmndrs/react-spring's spring-first motion.
  function softShape(p,t) {
    const asleep=p.props[0],stretch=mode==='stretch'?Math.sin(clamp((elapsed-poseStarted)/2.2,0,1)*Math.PI):0;
    const sway=(p.chest[0]+p.head[0])*.35, breathing=breath(t)-.4;
    const dragStretch=clamp((-p.handL[1]-35)/20,0,1)*(2+Math.sin(t*1.4)*.7);
    const cx=p.hip[0]*.25+sway*.3,cy=asleep>0.5?-12:p.hip[1]*.2-20;
    const height=21+breathing*.8+stretch*5+dragStretch-asleep*9;
    const width=15-breathing*.35-stretch*1.6-dragStretch*.22+asleep*7;
    const lean=(p.head[0]-p.hip[0])*.35+Math.sin(t*.58)*.5;
    return {cx,cy,height,width,lean,asleep};
  }
  function bodyContour(shape) {
    const {cx,cy,height:h,width:w,lean:l}=shape;
    ctx.beginPath();ctx.moveTo(cx+l,cy-h);
    ctx.bezierCurveTo(cx+w*.82+l,cy-h*.98,cx+w*.95,cy-h*.28,cx+w,cy+h*.26);
    ctx.bezierCurveTo(cx+w*1.09,cy+h*.82,cx+w*.47,cy+h,cx,cy+h);
    ctx.bezierCurveTo(cx-w*.59,cy+h*1.03,cx-w*1.08,cy+h*.75,cx-w,cy+h*.18);
    ctx.bezierCurveTo(cx-w*.91,cy-h*.42,cx-w*.65+l,cy-h*1.02,cx+l,cy-h);ctx.closePath();
  }
  function softLimb(a,b,width,bend,shade=false) {
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.max(1,Math.hypot(dx,dy)),nx=-dy/length,ny=dx/length;
    ctx.beginPath();ctx.moveTo(a[0]+nx*width/2,a[1]+ny*width/2);
    ctx.bezierCurveTo(a[0]+dx*.45+nx*bend,a[1]+dy*.45+ny*bend,b[0]+nx*width*.4,b[1]+ny*width*.4,b[0]+nx*width*.35,b[1]+ny*width*.35);
    ctx.quadraticCurveTo(b[0]+dx/length*width*.5,b[1]+dy/length*width*.5,b[0]-nx*width*.35,b[1]-ny*width*.35);
    ctx.bezierCurveTo(b[0]-nx*width*.4,b[1]-ny*width*.4,a[0]+dx*.4+nx*(bend-width),a[1]+dy*.4+ny*(bend-width),a[0]-nx*width/2,a[1]-ny*width/2);ctx.closePath();
    ctx.fillStyle=shade?'rgba(183,194,202,.96)':'rgba(223,227,227,.98)';ctx.fill();
  }
  function paintCompanion(p,t,shadow=false) {
    const shape=softShape(p,t),{cx,cy,width,height,asleep}=shape;
    const dx=light.x-x,dy=light.y-y,d=Math.max(1,Math.hypot(dx,dy)),strength=clamp(light.strength||0,0,1);
    if(shadow){bodyContour(shape);ctx.fill();return;}
    // Short tapering limbs bend as ribbons, with no elbows, knees or rigid segment lengths.
    const reach=.58+clamp((-p.handL[1]-30)/30,0,1)*.2;
    softLimb([cx-width*.7,cy+4],[cx-width-6+(p.handL[0]+10)*.35,cy+11+(p.handL[1]+17)*reach],6,3,true);
    softLimb([cx-7,cy+height-3],[cx-9+p.footL[0]*.25,cy+height+4-asleep*4],8,1,true);
    softLimb([cx+7,cy+height-3],[cx+9+p.footR[0]*.25,cy+height+4-asleep*4],8,-1);
    const rgb=Array.isArray(light.rgb)?light.rgb:String(light.rgb).split(',').map(Number);
    const tone=(level,tint)=>`rgb(${[0,1,2].map(i=>Math.round(clamp(level+(Number.isFinite(rgb[i])?rgb[i]-255:0)*tint*strength,0,255))).join(',')})`;
    const material=ctx.createRadialGradient(cx+dx/d*width*.4,cy+dy/d*height*.35,2,cx,cy,Math.max(width,height)*1.3);
    material.addColorStop(0,tone(251,.25));material.addColorStop(.48,tone(237,.3));material.addColorStop(.83,tone(207,.35));material.addColorStop(1,tone(170,.3));
    bodyContour(shape);ctx.fillStyle=material;ctx.fill();
    // A soft small highlight follows the same sun/moon as the numerals; no face or hard outline.
    ctx.save();bodyContour(shape);ctx.clip();
    const glow=ctx.createRadialGradient(cx+dx/d*width*.5,cy+dy/d*height*.5,0,cx+dx/d*width*.5,cy+dy/d*height*.5,width*.85);
    glow.addColorStop(0,`rgba(255,255,255,${.12+strength*.11})`);glow.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=glow;ctx.fillRect(cx-width*2,cy-height*2,width*4,height*4);ctx.restore();
    softLimb([cx+width*.76,cy+5],[cx+width+6+(p.handR[0]-11)*.45,cy+12+(p.handR[1]+17)*reach],6,-3);
  }
  function paintShadow(p,t) {
    const dx=x-light.x,dy=y-light.y,distance=Math.max(1,Math.hypot(dx,dy));
    const elevation=Math.abs(Number(light.elevation)||35),visibility=clamp(Number.isFinite(light.visibility)?light.visibility:1,0,1);
    const amount=clamp(1.3-elevation/90,.24,1.1)*visibility,sx=dx/distance*amount,sy=dy/distance*amount*.42;
    world.dataset.shadowX=sx.toFixed(3);world.dataset.shadowY=sy.toFixed(3);
    ctx.save();ctx.globalAlpha=.09+clamp(light.strength||0,0,1)*visibility*.15;ctx.fillStyle='#060910';ctx.shadowColor='rgba(0,0,0,.25)';ctx.shadowBlur=7;
    ctx.transform(1,0,-sx,-sy,0,3);paintCompanion(p,t,true);ctx.restore();
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
    paintShadow(p,t);
    if(elapsed<ringUntil&&!reduced.matches) {
      const fade=Math.min(1,ringUntil-elapsed),ripple=(1-fade)*11;
      ctx.strokeStyle=`rgba(217,232,250,${fade*.22})`;ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(0,1,11+ripple,2.5+ripple*.12,0,0,Math.PI*2);ctx.stroke();
    }
    paintCompanion(p,t);
    ctx.restore();
    world.dataset.mode=mode;world.dataset.mood=mood();world.dataset.platform=String(active);world.dataset.jumps=String(jumpCount);
    world.dataset.x=x.toFixed(2);world.dataset.y=y.toFixed(2);
    if(elapsed-lastActivity>=.09||lastActivity<0) {
      const movement=Math.hypot(x-previousX,y-previousY)/Math.max(.09,elapsed-lastActivity);
      const energy=drag?.9:['tap','mischief'].includes(mode)?.65+Math.sin(t*4.3)*.2:mode==='dance'?.5:Math.min(.55,movement/240);
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
    if(moved){active=closest(x);ringUntil=elapsed+.6;const safe=clearPoint({x,y});if(Math.hypot(safe.x-x,safe.y-y)>.5)travelTo(safe);else pose('curious',2.6);}else interact();draw();schedule();
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
