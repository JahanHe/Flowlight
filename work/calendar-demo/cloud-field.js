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
