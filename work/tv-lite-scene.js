// ponytail: the TV clock uses a fixed set of tiny sprites. No shaders, pixel scans, random fields, or lighting simulation.
function createWeatherScene(canvas, reducedMotion, onFrame = () => {}) {
  const ctx=canvas.getContext('2d');
  if(!ctx)return {setState(){},destroy(){}};
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
  const wrap=(value,range)=>((value%range)+range)%range;
  const small=(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
  const background=small(160,90),edge=small(160,90),marks=small(64,16),sun=small(32,32),moon=small(32,32);
  const clouds=[0,1,2].map(shape=>{
    const c=small(160,64),paint=c.getContext('2d');
    // Soft silhouettes are drawn once. Their geometry is fixed, not generated noise.
    for(let layer=3;layer>=0;layer--){
      paint.fillStyle=`rgba(225,237,249,${[.18,.09,.045,.025][layer]})`;
      paint.beginPath();
      [[35,37,30,12],[62,27-shape*2,26,19],[87,31+shape*2,30,17],[116,39,29,11]].forEach(([x,y,rx,ry])=>{paint.moveTo(x+rx+layer*3,y);paint.ellipse(x,y,rx+layer*3,ry+layer*2,0,0,Math.PI*2);});
      paint.fill();
    }
    return c;
  });
  const edgeContext=edge.getContext('2d');edgeContext.scale(160,90);
  const fade=edgeContext.createRadialGradient(.5,.5,.12,.5,.5,.5);fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(.6,'rgba(0,0,0,.12)');fade.addColorStop(1,'#000');edgeContext.fillStyle=fade;edgeContext.fillRect(0,0,1,1);edgeContext.fillStyle='#000';edgeContext.fillRect(0,0,1,1/90);edgeContext.fillRect(0,89/90,1,1/90);edgeContext.fillRect(0,0,1/160,1);edgeContext.fillRect(159/160,0,1/160,1);
  const stamp=marks.getContext('2d');stamp.fillStyle='rgba(200,222,244,.7)';stamp.beginPath();stamp.moveTo(3,0);stamp.lineTo(0,12);stamp.lineTo(1,12);stamp.lineTo(4,0);stamp.fill();
  stamp.fillStyle='#dfebf8';stamp.beginPath();stamp.arc(20,4,2,0,Math.PI*2);stamp.fill();stamp.fillRect(33,1,3,3);stamp.fillStyle='#dae7fa';stamp.fillRect(49,1,2,2);
  const sunContext=sun.getContext('2d');sunContext.fillStyle='#fff7e9';sunContext.beginPath();sunContext.arc(16,16,10,0,Math.PI*2);sunContext.fill();
  let state={phase:'day',condition:'clear',cloudCover:.15,intensity:0,wind:8,sunProgress:.5,moonProgress:.5,moonPhase:.5};
  let timer=0,destroyed=false,backgroundKey='',moonKey=-1,start=performance.now(),lastTime=start;
  function daylight(){if(Number.isFinite(state.sunAltitude))return clamp((state.sunAltitude+7)/14);return state.phase==='night'?0:['sunrise','sunset'].includes(state.phase)?.5:1;}
  function amount(name,condition){return clamp(Number.isFinite(state[name+'Amount'])?state[name+'Amount']:condition?1:0);}
  function paintBackground(){
    const day=Math.round(daylight()*24)/24,cover=Math.round(clamp(state.cloudCover)*8)/8;
    const warm=Math.round((1-clamp(Math.abs((state.sunAltitude??35)-1)/12))*day*(1-cover)*8)/8;
    const key=[day,cover,warm].join('|');
    if(key!==backgroundKey){
      backgroundKey=key;
      const mix=(night,noon)=>night.map((v,i)=>Math.round(v+(noon[i]-v)*day));
      const color=mix([15,29,52],[39,105,163]).map((v,i)=>Math.round(v+([72,83,98][i]-v)*cover*.6+([42,16,-14][i])*warm));
      const c=background.getContext('2d'),fill=c.createLinearGradient(0,0,0,90);
      fill.addColorStop(0,`rgb(${color.map(v=>Math.round(v*.5)).join(',')})`);fill.addColorStop(.55,`rgb(${color.join(',')})`);fill.addColorStop(1,'#030609');c.fillStyle=fill;c.fillRect(0,0,160,90);
    }
    const phase=Math.round(clamp(state.moonPhase)*16);
    if(phase!==moonKey){
      moonKey=phase;const c=moon.getContext('2d');c.clearRect(0,0,32,32);c.globalCompositeOperation='source-over';c.fillStyle='#dce7f6';c.beginPath();c.arc(16,16,10,0,Math.PI*2);c.fill();
      const fullness=(1-Math.cos(phase/16*Math.PI*2))*.5;
      if(fullness<.95){c.globalCompositeOperation='destination-out';c.beginPath();c.arc(16+(phase<8?1:-1)*(2+fullness*18),14,10,0,Math.PI*2);c.fill();}c.globalCompositeOperation='source-over';
    }
  }
  function paint(now){
    const w=canvas.width,h=canvas.height,t=(now-start)/1000*(reducedMotion&&reducedMotion.matches?.55:1),day=daylight(),cover=clamp(state.cloudCover);
    ctx.clearRect(0,0,w,h);ctx.drawImage(background,0,0,w,h);
    if(day<.98){
      for(let i=0;i<40;i++){
        const x=wrap((i*137.51)%640+t*(.7+i%3*.13),640)/640*w,y=(10+(i*47)%230)/360*h;
        ctx.globalAlpha=(1-day)*(1-cover*.8)*(.4+.3*Math.sin(t*.8+i));ctx.drawImage(marks,48,0,4,4,x,y,Math.max(1,w/320),Math.max(1,h/180));
      }
      if(state.moonVisible!==false){ctx.globalAlpha=(1-day)*(1-cover*.8);const progress=clamp(state.moonProgress),x=w*(.14+.72*progress),y=h*(.68-.5*Math.sin(progress*Math.PI));ctx.drawImage(moon,x-w*.026,y-w*.026,w*.052,w*.052);}
    }
    if(day>.02&&state.sunVisible!==false){ctx.globalAlpha=day*(1-cover*.9);const progress=clamp(state.sunProgress),x=w*(.14+.72*progress),y=h*(.68-.5*Math.sin(progress*Math.PI));ctx.drawImage(sun,x-w*.026,y-w*.026,w*.052,w*.052);}
    const count=4+Math.round(cover*5),speed=(reducedMotion&&reducedMotion.matches?1:1.4)*(1+clamp(state.wind,0,60)/90);
    for(let i=0;i<count;i++){
      const width=w*(.30+i%3*.08),x=wrap(i*131+t*(6+i%3*2)*speed,w+width)-width,y=h*(.08+(i%4)*.12);
      ctx.globalAlpha=(.36+cover*.42)*(day*.50+.5);ctx.drawImage(clouds[i%3],x,y,width,width*.4);
    }
    const rain=amount('rain',['rain','storm'].includes(state.condition)),snow=amount('snow',state.condition==='snow'),hail=amount('hail',state.hail),fog=amount('fog',state.condition==='fog');
    for(const [kind,weight,step,travel]of [['rain',rain,0,93],['snow',snow,16,16],['hail',hail,32,65]])if(weight>.01){
      const count=Math.ceil((kind==='rain'?66:36)*(0.45+clamp(state.intensity)*.55));
      ctx.globalAlpha=weight*(kind==='rain'?.68:.8);
      for(let i=0;i<count;i++){
        const x=wrap((i*149)%640+t*(kind==='snow'?4:12),640)/640*w,y=wrap((i*83)%360+t*(travel+i%3*9),360)/360*h;
        const size=kind==='rain'?4:kind==='snow'?8:6;ctx.drawImage(marks,step,0,size,kind==='rain'?14:size,x,y,size*w/640,(kind==='rain'?14:size)*h/360);
      }
    }
    if(fog>.01)for(let i=0;i<3;i++){ctx.globalAlpha=fog*.45;const width=w*.9,x=wrap(i*w*.5+t*(5+i),w+width)-width;ctx.drawImage(clouds[i],x,h*(.28+i*.16),width,h*.34);}
    ctx.globalAlpha=1;ctx.drawImage(edge,0,0,w,h);canvas.clockPaintVersion=(canvas.clockPaintVersion||0)+1;lastTime=now;if(onFrame)onFrame();
  }
  function schedule(){if(!timer&&!destroyed&&!document.hidden)timer=setTimeout(update,document.body.classList.contains('tv-settings-open')?84:50);}
  function update(){timer=0;if(document.hidden||destroyed)return;paint(performance.now());schedule();}
  function resize(){const menu=document.body.classList.contains('tv-settings-open'),ratio=Math.max(.1,innerWidth/Math.max(1,innerHeight)),height=menu?180:360,width=Math.min(menu?320:640,Math.round(height*ratio));canvas.width=width;canvas.height=Math.max(1,Math.round(width/ratio));backgroundKey='';paintBackground();if(!document.hidden)paint(performance.now());schedule();}
  function visibility(){clearTimeout(timer);timer=0;if(!document.hidden){start+=Math.max(0,performance.now()-lastTime);paint(performance.now());schedule();}}
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);resize();
  return {setState(next){state={...state,...next};paintBackground();if(!document.hidden&&!timer)schedule();},destroy(){destroyed=true;clearTimeout(timer);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);for(const c of [background,edge,marks,sun,moon,...clouds])c.width=c.height=0;canvas.width=canvas.height=0;}};
}

function createStickFigure(){
  const existing=document.querySelector('.stick-world');if(existing&&existing.stickFigure)return existing.stickFigure;
  const world=document.createElement('div');world.className='stick-world';
  const canvas=document.createElement('canvas');canvas.className='stick-canvas';canvas.width=canvas.height=128;canvas.style.width=canvas.style.height='128px';canvas.setAttribute('aria-hidden','true');
  const button=document.createElement('button');button.className='stick-hit';button.type='button';button.setAttribute('aria-label','和火柴人打招呼');button.style.width='64px';button.style.height='100px';
  world.append(canvas,button);document.body.append(world);
  const ctx=canvas.getContext('2d');let state={phase:'day'},enabled=true,timer=0,destroyed=false,size=1,start=performance.now(),lastTime=start,waveUntil=0,footY=innerHeight-12,nightAt=0,lastNight=false;
  const night=()=>state.phase==='night'||Number.isFinite(state.sunAltitude)&&state.sunAltitude< -6;
  function wave(){waveUntil=performance.now()+3000;schedule();}
  function line(points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
  function paint(now){
    if(!ctx||!enabled||destroyed||document.hidden)return;
    const t=(now-start)/1000,sleep=night()&&now>waveUntil,period=(t%72)/72,position=period<.5?period*2:2-period*2;
    if(sleep&&!lastNight)nightAt=position;lastNight=sleep;
    const x=64+Math.max(0,innerWidth-128)*(sleep?nightAt:position),y=footY,breathe=Math.sin(t*2)*.8,walking=!sleep&&now>waveUntil&&Math.floor(t/8)%3!==1;
    canvas.style.transform=`translate(${x-64}px,${y-112}px)`;button.style.transform=`translate(${x-32}px,${y-100}px)`;
    ctx.clearRect(0,0,128,128);ctx.save();ctx.translate(64,112);ctx.scale(size,size);ctx.strokeStyle='rgba(224,236,249,.85)';ctx.lineWidth=1.35;ctx.lineCap='round';ctx.lineJoin='round';
    if(sleep){
      ctx.beginPath();ctx.arc(-22,-8-breathe,5,0,Math.PI*2);ctx.stroke();line([[-17,-8-breathe],[0,-5],[12,-8],[21,0]]);line([[0,-5],[8,0],[22,0]]);line([[-10,-7],[-17,-1],[-25,-2]]);
    }else{
      const swing=walking?Math.sin(t*7)*6:Math.sin(t*2)*1.5,body=-24+breathe;
      ctx.beginPath();ctx.arc(0,-48+breathe,5,0,Math.PI*2);ctx.stroke();line([[0,-43+breathe],[1,body]]);line([[1,body],[-7+swing,-12],[-10+swing,0]]);line([[1,body],[8-swing,-12],[11-swing,0]]);
      line([[0,-38+breathe],[-10-swing*.5,-30],[-17-swing*.5,-23]]);
      if(now<waveUntil||!walking)line([[0,-38+breathe],[12,-43],[18+Math.sin(t*5)*3,-56]]);else line([[0,-38+breathe],[10+swing*.5,-30],[16+swing*.5,-24]]);
    }
    ctx.restore();world.dataset.mode=sleep?'sleep':walking?'walk':'wave';world.dataset.x=x.toFixed(2);world.dataset.y=y.toFixed(2);lastTime=now;
  }
  function schedule(){if(!timer&&enabled&&!destroyed&&!document.hidden)timer=setTimeout(update,document.body.classList.contains('tv-settings-open')?84:50);}
  function update(){timer=0;if(document.hidden||!enabled||destroyed)return;paint(performance.now());schedule();}
  function refresh(){const clock=document.querySelector('.clock'),rect=clock&&clock.getBoundingClientRect();footY=rect&&innerHeight-rect.bottom>105?Math.min(innerHeight-12,rect.bottom+102):innerHeight-12;if(!document.hidden)paint(performance.now());schedule();}
  function visibility(){clearTimeout(timer);timer=0;if(!document.hidden){start+=Math.max(0,performance.now()-lastTime);paint(performance.now());schedule();}}
  button.addEventListener('click',wave);window.addEventListener('resize',refresh);document.addEventListener('visibilitychange',visibility);
  const api={setState(next){state={...state,...next};schedule();},refresh,onFlip(unit){if(unit!=='seconds')wave();},setLight(){},setEnabled(value){enabled=!!value;world.hidden=!enabled;if(enabled){refresh();schedule();}else{clearTimeout(timer);timer=0;}},setScale(value){size=Math.max(.65,Math.min(1.8,Number(value)||1));refresh();},destroy(){destroyed=true;clearTimeout(timer);window.removeEventListener('resize',refresh);document.removeEventListener('visibilitychange',visibility);canvas.width=canvas.height=0;world.remove();}};
  world.stickFigure=api;refresh();return api;
}
