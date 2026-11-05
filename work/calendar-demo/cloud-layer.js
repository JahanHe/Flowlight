// Demo-only cloud composition. All layers reuse the same cached density fields and daylight.
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
