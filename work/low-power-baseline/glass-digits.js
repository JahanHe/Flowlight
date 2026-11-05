function createGlassDigits(sourceCanvas) {
  // ponytail: one shared renderer refracts the existing weather canvas; no duplicate weather simulation.
  const tv = window.clockTV === true;
  const full = !tv && window.clockFullEffects === true;
  const entries = [...document.querySelectorAll('.numeral')].map(span => {
    const canvas = document.createElement('canvas');
    canvas.className = 'glass-numeral'; canvas.setAttribute('aria-hidden', 'true');
    span.after(canvas);
    return { span, canvas, ctx: canvas.getContext('2d'), tile: span.closest('.tile'), half: span.parentElement };
  });
  const atlas = document.createElement('canvas');
  let gl = atlas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: !tv&&!full });
  const masks = new Map();
  const maxAtlasSize=gl?Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS)):0;
  let program, uniforms, weatherTexture, light, companion=null, dirty = true, lastLayout = 0, groups = [], enabled = true;
  let queuedDraw=0,lastDraw=-Infinity,lastGPUCheck=-Infinity,weatherWidth=0,weatherHeight=0,weatherRevision=-1;
  const dpr = () => tv ? Math.min(1,document.body.classList.contains('tv-settings-open')?640/innerWidth:1) : Math.min(full?(window.clockQuality?.glyphDpr||2):1.5, window.devicePixelRatio || 1);
  const vertex = `attribute vec2 position; varying vec2 uv;
    void main() { uv=position; gl_Position=vec4(position.x*2.-1.,1.-position.y*2.,0.,1.); }`;
  const fragment = `precision mediump float;
    uniform sampler2D weather, glyph;
    uniform vec2 origin, size, screenSize, lightDirection;
    uniform vec3 lightColor, companionPosition;
    uniform float power, fontSize;
    varying vec2 uv;
    void main() {
      vec4 material=texture2D(glyph,uv);
      ${tv?'':'if(material.r<.006) { gl_FragColor=vec4(0.); return; }'}
      vec2 outward=material.gb*2.-1.;
      float depth=material.a;
      float ridge=1.-depth;
      vec2 bend=outward*fontSize*(.009+.018*ridge*ridge);
      vec2 magnified=(uv-.5)*.98+.5;
      vec2 ray=(origin+magnified*size+bend)/screenSize;
      vec2 dispersion=outward*(.12+ridge*.3)/screenSize;
      vec3 through=vec3(texture2D(weather,ray+dispersion).r,
                        texture2D(weather,ray).g,
                        texture2D(weather,ray-dispersion).b);
      float facing=max(0.,dot(outward,lightDirection));
      float edge=1.-smoothstep(.01,.25,depth);
      float faceLight=.49+.14*dot(.5-uv,lightDirection)+power*.045;
      vec3 softWhite=mix(vec3(.97,.985,1.),lightColor,.12);
      vec3 body=mix(through*1.04,softWhite,faceLight);
      body+=softWhite*edge*(.09+.48*facing)*(.75+power*.25);
      vec2 world=origin+uv*size;
      float occlusion=exp(-dot((world-companionPosition.xy)/vec2(32.,48.),(world-companionPosition.xy)/vec2(32.,48.)));
      body*=1.-occlusion*companionPosition.z*.17;
      gl_FragColor=vec4(body,${tv?'1.':'material.r'});
    }`;
  function shader(type, source) {
    const item = gl.createShader(type); gl.shaderSource(item, source); gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
    return item;
  }
  function texture() {
    const item = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, item);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return item;
  }
  if (gl) {
    try {
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(['weather','glyph','origin','size','screenSize','lightDirection','lightColor','power','fontSize','companionPosition'].map(name => [name,gl.getUniformLocation(program,name)]));
      gl.uniform1i(uniforms.weather, 0); gl.uniform1i(uniforms.glyph, 1);
      weatherTexture = texture();
    } catch (error) { console.warn('Glass renderer is using Canvas fallback.', error.message); gl = null; }
  }
  function showNative() { for(const entry of entries)entry.half.classList.remove('glass-half-ready'); if(full){document.documentElement.classList.remove('glass-digits-ready');for(const entry of entries)entry.canvas.style.visibility='hidden';} }
  function showGlass() {if(full)for(const entry of entries)if(entry.canvas.style.visibility)entry.canvas.style.visibility='';if(!document.documentElement.classList.contains('glass-digits-ready'))document.documentElement.classList.add('glass-digits-ready');}
  function disableGPU() {
    if(gl) { for(const mask of masks.values())if(mask.texture)gl.deleteTexture(mask.texture); if(weatherTexture)gl.deleteTexture(weatherTexture); }
    masks.clear();gl=null;atlas.width=atlas.height=0;showNative();
  }
  atlas.addEventListener('webglcontextlost', event => { event.preventDefault(); if(tv||full){disableGPU();refresh();draw();}else{gl=null;dirty=true;} });
  function maskFor(entry) {
    const original=entry.style, factor=tv?Math.min(1,256/original.fontSize):1;
    const {fontWeight,fontFamily}=original;
    const width=Math.max(1,Math.round(original.width*factor)),height=Math.max(1,Math.round(original.height*factor)),fontSize=original.fontSize*factor,spacing=original.spacing*factor;
    const text = entry.span.textContent.trim();
    const key = [width,height,fontSize,fontWeight,fontFamily,spacing,text].join('|');
    if (masks.has(key)) { const cached=masks.get(key); masks.delete(key); masks.set(key,cached); return cached; }
    if(tv&&!gl)return {key,width,height};
    const mask = document.createElement('canvas'); mask.width=width; mask.height=height;
    const ctx=mask.getContext('2d',{willReadFrequently:true});
    ctx.font=`${fontWeight} ${fontSize}px ${fontFamily}`; ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillStyle='#fff';
    const metrics=clockMeasureText(ctx,text), baseline=(height+metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2;
    const chars=[...text], advances=chars.map(char=>ctx.measureText(char).width);
    let x=(width-advances.reduce((a,b)=>a+b,0)-spacing*(chars.length-1))/2;
    chars.forEach((char,i)=>{ctx.fillText(char,x+advances[i]/2,baseline);x+=advances[i]+spacing;});
    const cached={key,width,height};
    // TV GPU rendering needs only its texture. Rebuild Canvas masks if the context is lost.
    if(!tv) {
      const edge=document.createElement('canvas');edge.width=width;edge.height=height;
      const edgeContext=edge.getContext('2d');edgeContext.drawImage(mask,0,0);edgeContext.globalCompositeOperation='destination-out';edgeContext.drawImage(mask,Math.max(1,dpr()),Math.max(1,dpr()));
      cached.mask=mask;cached.edge=edge;
    }
    if(gl) {
      const pixels=ctx.getImageData(0,0,width,height), distance=new Float32Array(width*height), data=pixels.data;
      for(let i=0;i<distance.length;i++) distance[i]=data[i*4+3]<128?0:10000;
      // The glyph's distance field is generated once, never from weather pixels. It gives the glass its rounded edge.
      for(let y=1;y<height-1;y++) for(let x=1;x<width-1;x++) {
        const i=y*width+x; if(distance[i]) distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-width]+1,distance[i-width-1]+1.414,distance[i-width+1]+1.414);
      }
      for(let y=height-2;y>0;y--) for(let x=width-2;x>0;x--) {
        const i=y*width+x;if(distance[i]) distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+width]+1,distance[i+width-1]+1.414,distance[i+width+1]+1.414);
      }
      const roundness=Math.max(6,fontSize*.055);
      for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
        const i=y*width+x, j=i*4, alpha=data[j+3];
        const nx=distance[Math.max(0,i-3)]-distance[Math.min(distance.length-1,i+3)];
        const ny=distance[Math.max(0,i-width*3)]-distance[Math.min(distance.length-1,i+width*3)];
        const length=Math.max(.001,Math.hypot(nx,ny));
        data[j]=alpha;data[j+1]=128+127*nx/length;data[j+2]=128+127*ny/length;data[j+3]=Math.round(Math.min(1,distance[i]/roundness)*255);
      }
      cached.texture=texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
      if(tv)mask.width=mask.height=0;
    }
    masks.set(key,cached);
    // ponytail: accelerated modes retain six simultaneous flip glyphs; the classic page keeps 32 recent masks.
    while(masks.size>(tv||full?6:32)) {const oldest=masks.keys().next().value, old=masks.get(oldest);if(gl&&old.texture)gl.deleteTexture(old.texture);masks.delete(oldest);}
    return cached;
  }
  function refresh() { dirty=true; if(tv||full){blocked=false;showNative();} }
  function layout(time) {
    if(!dirty&&((tv||full)||time-lastLayout<350)) return;
    lastLayout=time;dirty=false;
    const density=dpr();
    for(const entry of entries) {
      const rect=entry.tile.getBoundingClientRect(), css=getComputedStyle(entry.span);
      entry.rect=rect;
      if(!rect.width||!rect.height) {entry.visible=false;if(tv||full)entry.canvas.width=entry.canvas.height=0;continue;}
      entry.visible=true;
      const scale=full?Math.min(density,Math.sqrt(1024*1024/(rect.width*rect.height))):density;entry.density=scale;
      entry.style={width:full?Math.floor(rect.width*scale):Math.round(rect.width*scale),height:full?Math.floor(rect.height*scale):Math.round(rect.height*scale),fontSize:parseFloat(css.fontSize)*scale,fontWeight:css.fontWeight,fontFamily:css.fontFamily,spacing:(parseFloat(css.letterSpacing)||0)*scale};
      if(!tv&&(entry.canvas.width!==entry.style.width||entry.canvas.height!==entry.style.height)) {entry.canvas.width=entry.style.width;entry.canvas.height=entry.style.height;}
      if(tv) {
        entry.bottom=entry.half.classList.contains('bottom');
        entry.canvas.style.height='100%';
        entry.ctx.font=`${entry.style.fontWeight} ${entry.style.fontSize}px ${entry.style.fontFamily}`;
        const text=entry.span.textContent.trim(),metrics=clockMeasureText(entry.ctx,text);
        entry.baseline=(entry.style.height+metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2;
      }
      const tileCSS=getComputedStyle(entry.tile), angle=parseFloat(tileCSS.getPropertyValue('--light-angle'))*Math.PI/180;
      entry.direction=[Math.sin(angle||0),-Math.cos(angle||0)];
      entry.color=(tileCSS.getPropertyValue('--number-light').match(/[\d.]+/g)||[220,236,255]).slice(0,3).map(Number).map(n=>n/255);
    }
  }
  function fallback(entry, material) {
    const {ctx,canvas,rect}=entry, {mask,edge}=material, sx=sourceCanvas.width/innerWidth, sy=sourceCanvas.height/innerHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-over';
    ctx.drawImage(sourceCanvas,(rect.left+rect.width*.01)*sx,(rect.top+rect.height*.01)*sy,rect.width*.98*sx,rect.height*.98*sy,0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);
    ctx.globalCompositeOperation='source-atop';ctx.fillStyle='rgba(246,250,255,.4)';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='source-over';ctx.save();ctx.globalAlpha=.25;ctx.drawImage(edge,0,0);ctx.restore();
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);ctx.globalCompositeOperation='source-over';
  }
  // TV computes soft refraction at 256px type size, then clips it with native-resolution font outlines.
  // This avoids full-size distance fields and GPU readback while retaining sharp numeral edges.
  const probe=document.createElement('canvas');probe.width=probe.height=16;
  const probeContext=probe.getContext('2d',{willReadFrequently:true});
  function tvHalf(entry, source, material) {
    const {ctx,canvas,style,rect}=entry,text=entry.span.textContent.trim(),height=canvas.height;
    ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,canvas.width,height);
    ctx.font=`${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#fff';
    const chars=[...text],advances=chars.map(char=>ctx.measureText(char).width);
    let x=(style.width-advances.reduce((a,b)=>a+b,0)-style.spacing*(chars.length-1))/2;
    const metrics=clockMeasureText(ctx,text),baseline=(style.height+metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2-(entry.bottom?style.height-height:0);
    chars.forEach((char,i)=>{ctx.fillText(char,x+advances[i]/2,baseline);x+=advances[i]+style.spacing;});
    ctx.globalCompositeOperation='source-in';
    if(source===atlas) {
      ctx.drawImage(atlas,0,entry.bottom?material.height/2:0,material.width,material.height/2,0,0,canvas.width,height);
    } else {
      const sx=sourceCanvas.width/innerWidth,sy=sourceCanvas.height/innerHeight;
      ctx.drawImage(sourceCanvas,rect.left*sx,(rect.top+(entry.bottom?rect.height/2:0))*sy,rect.width*sx,rect.height/2*sy,0,0,canvas.width,height);
      ctx.globalCompositeOperation='source-atop';
      const gradient=ctx.createLinearGradient(0,0,canvas.width,height);
      gradient.addColorStop(0,'rgba(245,250,255,.64)');gradient.addColorStop(1,'rgba(218,232,249,.44)');ctx.fillStyle=gradient;ctx.fillRect(0,0,canvas.width,height);
    }
    ctx.globalCompositeOperation='source-over';
    // Check each new half/text/geometry once, not once per frame. Failed GPUs must never hide the native time.
    const key=material.key+'|'+entry.bottom+'|'+canvas.width+'|'+height+'|'+(source===atlas?'gpu':'2d');
    if(entry.checked!==key) {
      probeContext.clearRect(0,0,16,16);probeContext.drawImage(canvas,0,0,16,16);
      const pixels=probeContext.getImageData(0,0,16,16).data;let ink=0;
      for(let i=3;i<pixels.length;i+=4)if(pixels[i]>32&&Math.max(pixels[i-3],pixels[i-2],pixels[i-1])>24)ink++;
      if(ink<3)throw new Error('Glass half has no visible ink');
      entry.checked=key;
    }
    entry.half.classList.add('glass-half-ready');
  }
  function verifyFull(group) {
    const entry=group.entry,key=group.mask.key+(gl?'|gpu':'|canvas');
    if(entry.checked===key)return;
    probeContext.clearRect(0,0,16,16);probeContext.drawImage(entry.canvas,0,0,16,16);
    const pixels=probeContext.getImageData(0,0,16,16).data;let ink=0;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]>32&&Math.max(pixels[i-3],pixels[i-2],pixels[i-1])>24)ink++;
    if(ink<3)throw new Error('Glass material has no visible ink');entry.checked=key;
  }
  function safeRender() {
    if(!tv&&!full){render();return;}
    try {render();} catch(error) {
      showNative();
      if(gl) {disableGPU();try {render();return;}catch(fallbackError){showNative();}}
      // Native text and its directional CSS lighting remain visible; retry only after a layout/font change.
      blocked=true;console.warn('Glass unavailable; using illuminated native digits.',error.message);
    }
  }
  let blocked=false;
  function draw() {
    if(!tv&&!full) {render();return;}
    if(queuedDraw||blocked||!enabled||document.hidden||document.body.classList.contains('plain-digits'))return;
    // Weather painting and light updates request the same image; coalesce them at the active quality frame rate.
    queuedDraw=requestAnimationFrame(time=>{
      queuedDraw=0;
      const fps=full?(window.clockQuality?.fps||60):document.body.classList.contains('tv-settings-open')?4:(window.clockTVFrameRate||20);
      if(time-lastDraw<1000/fps-2){draw();return;}
      lastDraw=time;safeRender();
    });
  }
  function render() {
    if(!enabled||document.body.classList.contains('plain-digits')||document.hidden||!sourceCanvas.width||!sourceCanvas.height) return;
    layout(performance.now());
    const active=entries.filter(entry=>entry.visible&&(!entry.half.classList.contains('flap')||entry.tile.classList.contains('flipping')));
    if(tv)for(const entry of entries) {
      const on=active.includes(entry),width=on?entry.style.width:0,height=on?Math.ceil(entry.style.height/2):0;
      if(entry.canvas.width!==width||entry.canvas.height!==height){entry.canvas.width=width;entry.canvas.height=height;entry.checked=null;entry.half.classList.remove('glass-half-ready');}
    }
    // An exceptionally small GPU still gets complete Canvas glass instead of failed textures.
    if((tv||full)&&gl&&(sourceCanvas.width>maxAtlasSize||sourceCanvas.height>maxAtlasSize||full&&active.some(entry=>entry.style.width>maxAtlasSize||entry.style.height>maxAtlasSize))) {
      disableGPU();
    }
    const unique=new Map();
    for(const entry of active) {
      const key=[entry.tile.id||Math.floor(entries.indexOf(entry)/4),entry.span.textContent,entry.style.width,entry.style.height].join('|');
      if(!unique.has(key)) unique.set(key,{entry,mask:maskFor(entry),entries:[]});
      unique.get(key).entries.push(entry);
    }
    groups=[...unique.values()];
    if(!gl) {
      for(const group of groups) {
        if(tv)for(const entry of group.entries)tvHalf(entry,sourceCanvas,group.mask);
        else{fallback(group.entry,group.mask);for(const entry of group.entries)if(entry!==group.entry){entry.ctx.clearRect(0,0,entry.canvas.width,entry.canvas.height);entry.ctx.drawImage(group.entry.canvas,0,0);}}
      }
      if(full)for(const group of groups)verifyFull(group);showGlass();return;
    }
    const batchWidth=groups.reduce((sum,g)=>sum+g.entry.canvas.width,0),batched=tv||(full&&batchWidth>maxAtlasSize);
    const width=batched?Math.max(0,...groups.map(g=>g.mask.width)):batchWidth, height=Math.max(1,...groups.map(g=>tv?g.mask.height:g.entry.canvas.height));
    if(!width)return;
    if(atlas.width!==width||atlas.height!==height) {atlas.width=width;atlas.height=height;}
    gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,weatherTexture);
    if((!tv&&!full)||weatherWidth!==sourceCanvas.width||weatherHeight!==sourceCanvas.height) {
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sourceCanvas);
      weatherWidth=sourceCanvas.width;weatherHeight=sourceCanvas.height;weatherRevision=sourceCanvas.clockPaintVersion;
    } else if(sourceCanvas.clockPaintVersion===undefined||weatherRevision!==sourceCanvas.clockPaintVersion) {
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,sourceCanvas);
      weatherRevision=sourceCanvas.clockPaintVersion;
    }
    if((tv||full)&&performance.now()-lastGPUCheck>1000){lastGPUCheck=performance.now();if(gl.getError()!==gl.NO_ERROR)throw new Error('Glass GPU upload failed');}
    gl.uniform2f(uniforms.screenSize,innerWidth,innerHeight);gl.clearColor(0,0,0,0);
    gl.uniform3f(uniforms.companionPosition,companion?.x||-1000,companion?.y||-1000,companion?Math.max(.3,companion.energy)*companion.strength:0);
    // ponytail: TV reuses one glyph-sized atlas, keeping 4K text sharp even on a 2048-limit GPU.
    for(const batch of (batched?groups.map(group=>[group]):[groups])) {
    gl.clear(gl.COLOR_BUFFER_BIT);
    let offset=0;
    for(const group of batch) {
      const {entry,mask}=group,{rect,style}=entry;
      gl.viewport(offset,height-mask.height,mask.width,mask.height);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mask.texture);
      gl.uniform2f(uniforms.origin,rect.left,rect.top);gl.uniform2f(uniforms.size,rect.width,rect.height);
      let direction=entry.direction;
      if(light) {const dx=light.x-rect.left-rect.width/2,dy=light.y-rect.top-rect.height/2,len=Math.max(1,Math.hypot(dx,dy));direction=[dx/len,dy/len];}
      gl.uniform2fv(uniforms.lightDirection,direction);gl.uniform3fv(uniforms.lightColor,light?.color||entry.color);
      gl.uniform1f(uniforms.power,light?.strength??.6);gl.uniform1f(uniforms.fontSize,style.fontSize/(entry.density||dpr()));
      gl.drawArrays(gl.TRIANGLES,0,6);group.offset=offset;offset+=mask.width;
    }
    for(const group of batch) for(const entry of group.entries) {
      if(tv)tvHalf(entry,atlas,group.mask);else{entry.ctx.clearRect(0,0,entry.canvas.width,entry.canvas.height);entry.ctx.drawImage(atlas,group.offset,0,entry.canvas.width,entry.canvas.height,0,0,entry.canvas.width,entry.canvas.height);}
    }
    if(full)for(const group of batch)verifyFull(group);
    }
    showGlass();
  }
  window.addEventListener('resize',refresh);document.addEventListener('fullscreenchange',refresh);
  if(full)window.addEventListener('scroll',()=>{dirty=true;draw();},{passive:true});
  if(full)window.addEventListener('clockqualitychange',()=>{for(const mask of masks.values())if(gl&&mask.texture)gl.deleteTexture(mask.texture);masks.clear();refresh();draw();});
  document.fonts?.addEventListener('loadingdone',()=>{
    for(const mask of masks.values()) if(gl && mask.texture) gl.deleteTexture(mask.texture);
    masks.clear();refresh();draw();
  });
  // ponytail: explicit layout, resize and font events already refresh geometry on older WebViews.
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(refresh):null;if(observer)entries.forEach(entry=>observer.observe(entry.tile));
  return {draw,refresh,setCompanion(value){companion=value;},setEnabled(value) { enabled=!!value; if((tv||full)&&!enabled)showNative(); if(enabled) {refresh();draw();} },setLight(next) {
    const rgb=Array.isArray(next.rgb)?next.rgb:String(next.rgb||'220,236,255').split(',').map(Number);
    light={x:next.x,y:next.y,color:rgb.map(n=>Math.min(1,Math.max(0,n/255))),strength:Math.min(1,Math.max(0,next.strength||0))};
  }};
}
