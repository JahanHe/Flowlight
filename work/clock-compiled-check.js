
function createGlassDigits(sourceCanvas) {
  // ponytail: one shared renderer refracts the existing weather canvas; no duplicate weather simulation.
  const entries = [...document.querySelectorAll('.numeral')].map(span => {
    const canvas = document.createElement('canvas');
    canvas.className = 'glass-numeral'; canvas.setAttribute('aria-hidden', 'true');
    span.after(canvas);
    return { span, canvas, ctx: canvas.getContext('2d'), tile: span.closest('.tile'), half: span.parentElement };
  });
  const atlas = document.createElement('canvas');
  let gl = atlas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true });
  const masks = new Map();
  let program, uniforms, weatherTexture, light, dirty = true, lastLayout = 0, groups = [], enabled = true;
  const dpr = () => Math.min(1.5, window.devicePixelRatio || 1);
  const vertex = `attribute vec2 position; varying vec2 uv;
    void main() { uv=position; gl_Position=vec4(position.x*2.-1.,1.-position.y*2.,0.,1.); }`;
  const fragment = `precision mediump float;
    uniform sampler2D weather, glyph;
    uniform vec2 origin, size, screenSize, lightDirection;
    uniform vec3 lightColor;
    uniform float power, fontSize;
    varying vec2 uv;
    void main() {
      vec4 material=texture2D(glyph,uv);
      if(material.r<.006) { gl_FragColor=vec4(0.); return; }
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
      gl_FragColor=vec4(body,material.r);
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
      uniforms = Object.fromEntries(['weather','glyph','origin','size','screenSize','lightDirection','lightColor','power','fontSize'].map(name => [name,gl.getUniformLocation(program,name)]));
      gl.uniform1i(uniforms.weather, 0); gl.uniform1i(uniforms.glyph, 1);
      weatherTexture = texture();
    } catch (error) { console.warn('Glass renderer is using Canvas fallback.', error.message); gl = null; }
  }
  atlas.addEventListener('webglcontextlost', event => { event.preventDefault(); gl = null; dirty = true; });
  function maskFor(entry) {
    const { width, height, fontSize, fontWeight, fontFamily, spacing } = entry.style;
    const text = entry.span.textContent.trim();
    const key = [width,height,fontSize,fontWeight,fontFamily,spacing,text].join('|');
    if (masks.has(key)) { const cached=masks.get(key); masks.delete(key); masks.set(key,cached); return cached; }
    const mask = document.createElement('canvas'); mask.width=width; mask.height=height;
    const ctx=mask.getContext('2d',{willReadFrequently:true});
    ctx.font=`${fontWeight} ${fontSize}px ${fontFamily}`; ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillStyle='#fff';
    const metrics=ctx.measureText(text), baseline=(height+metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2;
    const chars=[...text], advances=chars.map(char=>ctx.measureText(char).width);
    let x=(width-advances.reduce((a,b)=>a+b,0)-spacing*(chars.length-1))/2;
    chars.forEach((char,i)=>{ctx.fillText(char,x+advances[i]/2,baseline);x+=advances[i]+spacing;});
    const edge=document.createElement('canvas');edge.width=width;edge.height=height;
    const edgeContext=edge.getContext('2d');edgeContext.drawImage(mask,0,0);edgeContext.globalCompositeOperation='destination-out';edgeContext.drawImage(mask,Math.max(1,dpr()),Math.max(1,dpr()));
    const cached={mask,edge,key};
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
    }
    masks.set(key,cached);
    // ponytail: 32 masks cover active flips and recent digits; old sizes and glyphs release GPU memory.
    if(masks.size>32) {const oldest=masks.keys().next().value, old=masks.get(oldest);if(gl&&old.texture)gl.deleteTexture(old.texture);masks.delete(oldest);}
    return cached;
  }
  function refresh() { dirty=true; }
  function layout(time) {
    if(!dirty&&time-lastLayout<350) return;
    lastLayout=time;dirty=false;
    const scale=dpr();
    for(const entry of entries) {
      const rect=entry.tile.getBoundingClientRect(), css=getComputedStyle(entry.span);
      entry.rect=rect;
      if(!rect.width||!rect.height) {entry.visible=false;continue;}
      entry.visible=true;
      entry.style={width:Math.round(rect.width*scale),height:Math.round(rect.height*scale),fontSize:parseFloat(css.fontSize)*scale,fontWeight:css.fontWeight,fontFamily:css.fontFamily,spacing:(parseFloat(css.letterSpacing)||0)*scale};
      if(entry.canvas.width!==entry.style.width||entry.canvas.height!==entry.style.height) {entry.canvas.width=entry.style.width;entry.canvas.height=entry.style.height;}
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
  function draw() {
    if(!enabled||document.body.classList.contains('plain-digits')||document.hidden||!sourceCanvas.width||!sourceCanvas.height) return;
    layout(performance.now());
    const active=entries.filter(entry=>entry.visible&&(!entry.half.classList.contains('flap')||entry.tile.classList.contains('flipping')));
    const unique=new Map();
    for(const entry of active) {
      const key=[entry.tile.id||Math.floor(entries.indexOf(entry)/4),entry.span.textContent,entry.style.width,entry.style.height].join('|');
      if(!unique.has(key)) unique.set(key,{entry,mask:maskFor(entry),entries:[]});
      unique.get(key).entries.push(entry);
    }
    groups=[...unique.values()];
    if(!gl) {for(const group of groups)for(const entry of group.entries)fallback(entry,group.mask);document.documentElement.classList.add('glass-digits-ready');return;}
    const width=groups.reduce((sum,g)=>sum+g.entry.canvas.width,0), height=Math.max(1,...groups.map(g=>g.entry.canvas.height));
    if(!width)return;
    if(atlas.width!==width||atlas.height!==height) {atlas.width=width;atlas.height=height;}
    gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,weatherTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sourceCanvas);
    gl.uniform2f(uniforms.screenSize,innerWidth,innerHeight);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    let offset=0;
    for(const group of groups) {
      const {entry,mask}=group,{rect,style}=entry;
      gl.viewport(offset,height-style.height,style.width,style.height);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mask.texture);
      gl.uniform2f(uniforms.origin,rect.left,rect.top);gl.uniform2f(uniforms.size,rect.width,rect.height);
      let direction=entry.direction;
      if(light) {const dx=light.x-rect.left-rect.width/2,dy=light.y-rect.top-rect.height/2,len=Math.max(1,Math.hypot(dx,dy));direction=[dx/len,dy/len];}
      gl.uniform2fv(uniforms.lightDirection,direction);gl.uniform3fv(uniforms.lightColor,light?.color||entry.color);
      gl.uniform1f(uniforms.power,light?.strength??.6);gl.uniform1f(uniforms.fontSize,style.fontSize/dpr());
      gl.drawArrays(gl.TRIANGLES,0,6);group.offset=offset;offset+=style.width;
    }
    for(const group of groups) for(const entry of group.entries) {
      entry.ctx.clearRect(0,0,entry.canvas.width,entry.canvas.height);
      entry.ctx.drawImage(atlas,group.offset,0,entry.canvas.width,entry.canvas.height,0,0,entry.canvas.width,entry.canvas.height);
    }
    document.documentElement.classList.add('glass-digits-ready');
  }
  window.addEventListener('resize',refresh);document.addEventListener('fullscreenchange',refresh);
  const observer=new ResizeObserver(refresh);entries.forEach(entry=>observer.observe(entry.tile));
  return {draw,refresh,setEnabled(value) { enabled=!!value; if(enabled) {refresh();draw();} },setLight(next) {
    const rgb=Array.isArray(next.rgb)?next.rgb:String(next.rgb||'220,236,255').split(',').map(Number);
    light={x:next.x,y:next.y,color:rgb.map(n=>Math.min(1,Math.max(0,n/255))),strength:Math.min(1,Math.max(0,next.strength||0))};
  }};
}

function createWeatherScene(canvas, reducedMotion, onPaint = () => {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setState() {}, setClockBounds() {} };
  let state = { phase: 'unknown', condition: 'clear', cloudCover: 0, intensity: 0, sunProgress: .5, moonPhase: .5, moonVisible: true, wind: 0 };
  let w = 1, h = 1, frame = 0, lastPaint = 0, clockBounds = null;
  const clamp = (n, low = 0, high = 1) => Math.min(high, Math.max(low, Number.isFinite(n) ? n : low));
  const still = () => typeof reducedMotion === 'boolean' ? reducedMotion : !!reducedMotion?.matches;
  // ponytail: seeded particles keep one dependency-free scene stable across weather refreshes.
  let seed = 4207;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const stars = Array.from({ length: 175 }, () => ({ x: random(), y: random() * .76, r: .4 + random() * 1.1, phase: random() * 6.28 }));
  const particles = Array.from({ length: 210 }, () => ({ x: random(), y: random(), r: .4 + random() * 1.8, speed: .5 + random(), phase: random() * 6.28 }));
  const clouds = Array.from({ length: 15 }, () => ({ x: random(), y: .09 + random() * .57, r: .11 + random() * .13, speed: .6 + random(), phase: random() * 6.28 }));
  function glow(x, y, rx, ry, color, opacity = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `rgba(${color},${opacity})`);
    gradient.addColorStop(.38, `rgba(${color},${opacity * .45})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gradient; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
  }
  function moon(x, y, r, t) {
    const breath = Math.sin(t * .38);
    glow(x, y, r * (6 + breath * .4), r * (6 - breath * .25), '166,197,231', .23 + breath * .045);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#17202c'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    if (state.moonPhase > .5) ctx.scale(-1, 1);
    const k = -Math.cos(state.moonPhase * Math.PI * 2);
    ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.ellipse(0, 0, Math.max(.001, Math.abs(k) * r), r, 0, Math.PI / 2, Math.PI * 1.5, k < 0);
    ctx.closePath();
    const light = ctx.createLinearGradient(-r, -r, r, r);
    light.addColorStop(0, '#c1d0dc'); light.addColorStop(.55, '#edf0e8'); light.addColorStop(1, '#879caf');
    ctx.fillStyle = light; ctx.fill(); ctx.clip();
    [[.25, -.2, .18], [-.28, .3, .22], [.3, .4, .11], [-.15, -.52, .13]].forEach(([a, b, c]) => glow(a * r, b * r, c * r, c * r, '66,85,106', .18));
    ctx.restore();
  }
  function paintWeather(time) {
    const t = still() ? 20 : time / 1000;
    const night = state.phase === 'night';
    const edge = state.phase === 'sunrise' || state.phase === 'sunset';
    const storm = state.condition === 'storm';
    const wet = state.condition === 'rain' || storm;
    const snow = state.condition === 'snow';
    const fog = state.condition === 'fog';
    const cover = state.cloudCover;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    if (state.phase === 'unknown') {
      glow(w * (.5 + Math.sin(t * .11) * .035), h * (.45 + Math.cos(t * .09) * .02), w * .48, h * .48, '55,73,90', .3 + Math.sin(t * .37) * .045);
      glow(w * (.35 + Math.sin(t * .07) * .1), h * .43, w * .3, h * .14, '80,103,126', .12 + Math.sin(t * .4) * .025);
      return;
    }
    const breath = night ? .92 + Math.sin(t * .44) * .08 : .94 + Math.sin(t * .38) * .06;
    const atmosphere = night ? '37,60,99' : edge ? '187,94,47' : storm ? '61,75,96' : '74,137,180';
    glow(w * (.53 + Math.sin(t * .07) * .012), h * .39, w * .59, h * .62, atmosphere, (night ? .62 : .76) * breath);
    glow(w * (.5 + Math.sin(t * .09 + 1) * .024), h * .67, w * .43, h * .29, night ? '44,47,81' : edge ? '166,82,72' : '105,152,169', (night ? .22 : .28) * (1.06 - Math.sin(t * .29) * .06));
    if (edge) {
      glow(w * .66, h * .37, w * .39, h * .24, state.phase === 'sunrise' ? '255,175,96' : '227,125,81', .38);
      glow(w * .29, h * .27, w * .29, h * .32, '110,77,129', .28);
    }
    if (night) {
      for (const star of stars) {
        const twinkle = .67 + .26 * Math.sin(t * .55 + star.phase);
        ctx.fillStyle = `rgba(213,228,246,${twinkle * (1 - cover * .74)})`;
        const x = (star.x + Math.sin(t * .14 + star.phase) * .0025) * w;
        const y = (star.y + Math.cos(t * .11 + star.phase) * .0015) * h;
        ctx.beginPath(); ctx.arc(x, y, star.r, 0, Math.PI * 2); ctx.fill();
        if (star.r > 1.35) glow(x, y, star.r * 4, star.r * 4, '163,191,230', twinkle * .11 * (1 - cover));
      }
      if (state.moonVisible) moon(w * .76, h * .23, Math.max(15, Math.min(w, h) * .043), t);
    } else {
      const x = w * (.16 + .68 * state.sunProgress);
      const y = h * (.72 - .53 * Math.sin(state.sunProgress * Math.PI));
      const r = Math.max(24, Math.min(w, h) * .07);
      const tint = edge ? '255,177,97' : '255,226,168';
      glow(x, y, r * (7.7 + Math.sin(t * .38) * .35), r * 6.5, tint, (.36 + Math.sin(t * .38) * .065) * (1 - cover * .6));
      if (state.sunVisible !== false) {
        // Soft moving shafts have no hard triangle edges, and keep the sun at the shared light-source position.
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(h * .56 - y, w * .5 - x));
        const reach = Math.min(w, h) * .78;
        glow(reach * .4, Math.sin(t * .11) * h * .018, reach * .75, h * .16, tint, .075 * (1 - cover * .75) * breath);
        glow(reach * .72, Math.sin(t * .09 + 1) * h * .027, reach * .63, h * .11, tint, .055 * (1 - cover * .75) * (2 - breath));
        ctx.restore();
      }
      if (state.sunVisible !== false) {
      glow(x, y, r * (2.25 + Math.sin(t * .38) * .08), r * (2.25 + Math.sin(t * .38) * .08), tint, .35 + Math.sin(t * .38) * .045);
      const sun = ctx.createRadialGradient(x - r * .25, y - r * .3, 0, x, y, r);
      sun.addColorStop(0, '#fff8df'); sun.addColorStop(.82, edge ? '#ffd795' : '#fff0c4'); sun.addColorStop(1, edge ? '#efa265' : '#ffde98');
      ctx.globalAlpha = 1 - cover * .78; ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    const cloudAmount = Math.max(cover, .16);
    if (cloudAmount > .02) {
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i];
        const drift = t * (.0018 + clamp(state.wind, 0, 100) * .000035) * cloud.speed;
        const x = ((cloud.x + drift) % 1.6 - .3) * w;
        const y = (cloud.y + Math.sin(t * .025 + cloud.phase) * .014) * h;
        const rx = w * cloud.r, ry = h * (.045 + cloud.r * .23);
        glow(x, y, rx * 1.3, ry * 1.8, night ? '8,14,24' : storm ? '22,31,45' : '35,55,72', cloudAmount * .62);
        glow(x - rx * .12, y - ry * .24, rx, ry, night ? '67,79,103' : edge ? '176,143,130' : '174,191,196', cloudAmount * (night ? .25 : .32));
      }
      if (cover > .65) glow(w * .65, h * .23, w * .45, h * .3, night ? '10,16,25' : '43,58,71', (cover - .65) * 1.4);
    }
    if (fog) {
      for (let i = 0; i < 6; i++) {
        const x = w * (.45 + Math.sin(t * .025 + i * 1.6) * .22);
        glow(x, h * (.28 + i * .09), w * .48, h * .1, night ? '97,116,138' : '176,186,183', .11 + state.intensity * .04);
      }
    }
    if (wet || snow) {
      const count = Math.round((snow ? 110 : 70) + state.intensity * (snow ? 70 : 130));
      const wind = Math.min(state.wind, 70) * .0009;
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        const velocity = snow ? .028 * p.speed : .42 * p.speed;
        const x = ((p.x + t * (snow ? .007 + wind * .12 : .04 + wind) + (snow ? Math.sin(t * .4 + p.phase) * .018 : 0)) % 1.2 - .1) * w;
        const y = ((p.y + t * velocity) % 1.2 - .1) * h;
        if (snow || (state.hail && i % 3 === 0)) {
          ctx.fillStyle = `rgba(229,239,246,${.24 + p.r * .19})`;
          ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
        } else {
          const length = (10 + p.speed * 13) * (h / 800 + .4);
          ctx.strokeStyle = `rgba(184,209,227,${.12 + p.r * .055})`; ctx.lineWidth = .5 + p.r * .25;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + length * (.2 + wind * 4), y + length); ctx.stroke();
        }
      }
    }
    if (storm && !still()) {
      // ponytail: one broad, soft cloud glow per 19 seconds avoids flashing lightning.
      const cycle = t % 19;
      if (cycle < 1.8) glow(w * .62, h * .25, w * .43, h * .32, '174,189,221', Math.sin(cycle / 1.8 * Math.PI) ** 2 * .18);
    }
  }
  function protectClock() {
    if (!clockBounds) return;
    const { x, y, width, height } = clockBounds;
    // ponytail: one feathered veil quiets every weather layer together; glass digits sample this same protected scene.
    ctx.save(); ctx.translate(x + width / 2, y + height / 2); ctx.scale(width * .7 + 30, height * .95 + 25);
    const veil = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    veil.addColorStop(0, 'rgba(0,0,0,.46)'); veil.addColorStop(.48, 'rgba(0,0,0,.44)'); veil.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = veil; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
  }
  function paint(time) { paintWeather(time); protectClock(); onPaint(); }
  function schedule() { if (!frame && !document.hidden && !still()) frame = requestAnimationFrame(animate); }
  function animate(time) {
    frame = 0;
    if (document.hidden || still()) return;
    if (time - lastPaint >= 1000 / 30) { paint(time); lastPaint = time; }
    schedule();
  }
  function resize() {
    const box = canvas.getBoundingClientRect();
    w = Math.max(1, box.width); h = Math.max(1, box.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); paint(performance.now()); schedule();
  }
  function resume() {
    cancelAnimationFrame(frame); frame = 0;
    if (!document.hidden) { paint(performance.now()); schedule(); }
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', resume);
  if (typeof reducedMotion?.addEventListener === 'function') reducedMotion.addEventListener('change', resume);
  resize();
  return { setClockBounds(rect) {
    const box = canvas.getBoundingClientRect();
    const next = rect && [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0
      ? { x: rect.left - (box.left || 0), y: rect.top - (box.top || 0), width: rect.width, height: rect.height } : null;
    if (next && clockBounds && ['x','y','width','height'].every(key => Math.abs(next[key] - clockBounds[key]) < .5)) return;
    if (!next && !clockBounds) return;
    clockBounds = next;
    if (!document.hidden) paint(performance.now());
  }, setState(next) {
    state = { ...state, ...next };
    if (!['unknown', 'day', 'sunrise', 'sunset', 'night'].includes(state.phase)) state.phase = 'unknown';
    if (!['clear', 'cloudy', 'overcast', 'fog', 'rain', 'snow', 'storm'].includes(state.condition)) state.condition = 'clear';
    for (const key of ['cloudCover', 'intensity', 'sunProgress', 'moonPhase']) state[key] = clamp(state[key]);
    state.wind = clamp(state.wind, 0, 200);
    if (!document.hidden) paint(performance.now());
    schedule();
  } };
}

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
  let state = {phase:'unknown',condition:'clear',wind:0}, enabled = true, platforms = [], active = 0;
  let x = 0, y = 0, size = 1, direction = 1, mode = 'sit', motion = null, drag = null;
  let elapsed = 0, until = 2, awakeUntil = 0, ringUntil = 0, jumpCount = 0, actionCount = 0, poseStarted = 0, sleepCycle = 0, sleepFacing = 1;
  let frame = 0, lastPaint = 0, lastStep = 0, geometryKey = '', refreshFrame = 0, wakeTimer = 0, destroyed = false;
  const night = () => state.phase === 'night' || (state.phase === 'unknown' && (new Date().getHours()<6 || new Date().getHours()>=19));
  function syncMode() { world.dataset.mode = mode; world.dataset.condition = state.condition; }
  const sleeping = () => ['sleep','sleep-turn','stretch'].includes(mode);
  const safeY = () => Math.min(...platforms.map(p=>p.top));
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
    size = clamp(innerWidth/1000,.76,1.18);
    const next = [];
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
      if (!drag) { const point = surface(active,first?undefined:x); x=point.x; y=point.y; motion=null; }
      const density = Math.min(devicePixelRatio||1,2);
      canvas.width = Math.round(180*density); canvas.height = Math.round(160*density); ctx.setTransform(density,0,0,density,0,0);
    }
    world.hidden = !enabled;
    draw(); schedule();
  }
  function queueRefresh() {
    if (!refreshFrame) refreshFrame = requestAnimationFrame(() => { refreshFrame=0; refresh(); });
  }
  function travel(index, targetX, forced = false) {
    if (!platforms.length || drag) return;
    const dest = surface(index,targetX), distance = Math.abs(dest.x-x);
    direction = dest.x>=x ? 1 : -1;
    active = index;
    if (reduced.matches) {x=dest.x;y=dest.y;motion=null;pose('wave',1.8);return;}
    const jump = forced || distance>42*size || Math.abs(dest.y-y)>8;
    motion = {fromX:x,fromY:y,toX:dest.x,toY:dest.y,start:elapsed,duration:jump?clamp(distance/250,.55,1.1):clamp(distance/26,.5,1.8),jump};
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
      else {if(mode==='sleep-turn')sleepFacing*=-1;pose('sleep',6+sleepCycle%3);}
      return;
    }
    if (reduced.matches) { pose('sit',8); return; }
    actionCount++;
    if (state.condition==='storm' && actionCount%3===1) {pose('startle',1.1);ringUntil=elapsed+.7;return;}
    if (actionCount%4===1) {
      const next = (active+direction+platforms.length)%platforms.length;
      travel(next,undefined,true);
    } else if(actionCount%4===2) pose('sit',4.5);
    else if(actionCount%4===3) { pose('tap',2.2);ringUntil=elapsed+2.2; }
    else travel(active,direction>0?platforms[active].right:platforms[active].left);
  }
  function update(delta) {
    elapsed += delta;
    if (drag) return;
    if (motion) {
      const progress = clamp((elapsed-motion.start)/motion.duration,0,1), smooth = progress*progress*(3-2*progress);
      x = motion.fromX+(motion.toX-motion.fromX)*smooth;
      y = motion.fromY+(motion.toY-motion.fromY)*smooth-(motion.jump?Math.sin(progress*Math.PI)*42*size:0);
      if (progress>=1) {motion=null;ringUntil=elapsed+.45;pose(night() && elapsed>=awakeUntil?'sleep':'stand',.8);}
    } else if (elapsed>=until) chooseAction();
  }
  function path(points) {
    ctx.beginPath(); points.forEach((p,i)=> i?ctx.lineTo(...p):ctx.moveTo(...p)); ctx.stroke();
  }
  function circle(cx,cy,r,fill=false) {ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);fill?ctx.fill():ctx.stroke();}
  function draw() {
    if (!ctx || !enabled || !platforms.length || document.hidden || destroyed) return;
    // The whole companion, including its shadow and accessories, stays above every visible digit.
    y=Math.min(y,safeY());
    ctx.clearRect(0,0,180,160);
    canvas.style.transform = `translate(${x-90}px,${y-108}px)`;
    button.style.transform = `translate(${x-42}px,${y-83}px)`;
    const t = reduced.matches?0:elapsed, wet = state.condition==='rain' || state.condition==='storm';
    ctx.save();ctx.beginPath();ctx.rect(0,0,180,108+5*size);ctx.clip();ctx.translate(90,108);ctx.scale(size,size);
    // One skeleton is painted once per cleared frame; the soft ellipse is only its contact shadow.
    ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(2,3,mode.startsWith('sleep')?22:12,3.6,0,0,Math.PI*2);ctx.fill();
    if (elapsed<ringUntil && !reduced.matches) {
      const fade = Math.min(1,ringUntil-elapsed), ripple = (1-fade)*11;
      ctx.strokeStyle=`rgba(255,220,162,${fade*.42})`;ctx.lineWidth=.8;
      ctx.beginPath();ctx.ellipse(0,2,12+ripple,3+ripple*.15,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.strokeStyle = night()?'#dce7ef':'#ffefd8';ctx.fillStyle=night()?'#cfdae6':'#fff2dc';
    ctx.lineWidth=2.15;ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowColor='rgba(0,0,0,.9)';ctx.shadowBlur=5;ctx.shadowOffsetY=2;
    if (mode==='sleep' || mode==='sleep-turn') {
      const breathe=Math.sin(t*1.7)*1.8;
      const turn=mode==='sleep-turn'?clamp((elapsed-poseStarted)/1.8,0,1):0;
      ctx.scale(sleepFacing*(mode==='sleep-turn'?Math.cos(turn*Math.PI):1),1);
      ctx.translate(0,-Math.sin(turn*Math.PI)*5);
      ctx.translate(0,-2);ctx.rotate(-.08);
      circle(-18,-7+breathe*.5,5.4);
      path([[-12,-6+breathe],[1,-7+breathe],[10,-3],[19,-4]]);
      path([[1,-7+breathe],[9,-10],[18,-8]]);
      path([[-8,-7],[-10,-1],[-19,-1]]);
      ctx.shadowBlur=0;ctx.strokeStyle='rgba(223,233,240,.6)';ctx.lineWidth=1;
      path([[-21,-7],[-18,-6]]);
      if(state.condition==='snow') {ctx.strokeStyle='#d6a181';ctx.lineWidth=3;path([[-9,-7],[9,-7]]);}
      if(wet) {
        ctx.strokeStyle='#f2cfa8';ctx.lineWidth=1.5;path([[22,1],[22,-40]]);
        ctx.fillStyle='rgba(183,142,101,.24)';ctx.beginPath();ctx.moveTo(-6,-25);ctx.quadraticCurveTo(20,-55,46,-25);ctx.quadraticCurveTo(33,-30,20,-25);ctx.quadraticCurveTo(7,-30,-6,-25);ctx.fill();ctx.stroke();
      }
    } else {
      const walking = mode==='walk', jumping = mode==='jump', sitting = mode==='sit', tapping=mode==='tap', stretching=mode==='stretch';
      const reach=stretching?Math.sin(clamp((elapsed-poseStarted)/2.2,0,1)*Math.PI):0;
      const stride = walking?Math.sin(t*9)*9:0, bounce = walking?Math.abs(Math.sin(t*9))*1.7:0;
      const lean = mode==='drag'?Math.sin(t*5)*4 : mode==='startle'?Math.sin(t*25)*1.8 : tapping?3:0;
      const hipY = sitting?-13:-21-bounce-reach*3, neckY = hipY-15;
      ctx.scale(direction,1);
      circle(lean,neckY-8,5.5);
      path([[lean,neckY-2],[lean*.45,hipY]]);
      if (sitting) {path([[0,hipY],[10,-4],[20,-4]]);path([[0,hipY],[2,-2],[12,-2]]);}
      else if (jumping || mode==='drag') {path([[0,hipY],[-10,-13],[-6,-4]]);path([[0,hipY],[8,-11],[16,-13]]);}
      else {path([[0,hipY],[-7-stride,-10],[-9-stride,0]]);path([[0,hipY],[6+stride,-10],[9+stride,0]]);}
      if(stretching) {
        path([[lean,neckY+3],[-10,neckY-reach*10],[-17,neckY-5-reach*16]]);
        path([[lean,neckY+3],[10,neckY-reach*10],[17,neckY-5-reach*16]]);
      } else if (mode==='wave' || mode==='startle') {
        path([[lean,neckY+3],[-10,neckY-1],[-14-Math.sin(t*11)*3,neckY-13]]);
        path([[lean,neckY+3],[10,neckY+10],[14,neckY+3]]);
      } else if (wet) {
        path([[lean,neckY+3],[10,neckY+11],[14,neckY+5]]);path([[lean,neckY+3],[-7,hipY+4]]);
      } else if (tapping) {
        path([[lean,neckY+3],[14,-19],[15+Math.sin(t*10)*2,-2]]);path([[lean,neckY+3],[-7,hipY+4]]);
      } else if (jumping || mode==='drag') {
        path([[lean,neckY+3],[-11,neckY-4],[-16,neckY-9]]);path([[lean,neckY+3],[11,neckY-5],[15,neckY-10]]);
      } else {
        path([[lean,neckY+3],[-7+stride*.6,hipY-2],[-9+stride*.6,hipY+5]]);
        path([[lean,neckY+3],[7-stride*.6,hipY-2],[9-stride*.6,hipY+5]]);
      }
      if (state.condition==='snow') {
        ctx.strokeStyle='#d6a181';ctx.lineWidth=3;
        path([[-4,neckY],[5,neckY],[9,neckY+9+Math.sin(t*4)*2]]);
      }
      if (wet) {
        ctx.shadowBlur=3;ctx.lineWidth=1.5;ctx.strokeStyle='#f2cfa8';
        path([[14,neckY+5],[14,-66]]);
        ctx.fillStyle='rgba(183,142,101,.24)';
        ctx.beginPath();ctx.moveTo(-8,-51);ctx.quadraticCurveTo(14,-82,36,-51);ctx.quadraticCurveTo(25,-56,14,-51);ctx.quadraticCurveTo(3,-56,-8,-51);ctx.fill();ctx.stroke();
        path([[14,-66],[14,-52]]);
      }
    }
    ctx.restore();
    world.dataset.mode=mode;world.dataset.platform=String(active);world.dataset.jumps=String(jumpCount);
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
    if (!enabled || drag || motion || reduced.matches || platforms[active]?.unit!==unit) return;
    if (sleeping()) {ringUntil=elapsed+.35;draw();return;}
    travel(active,x,true);
  }
  function setEnabled(value) {
    enabled=Boolean(value);world.hidden=!enabled;
    if (!enabled) {cancelAnimationFrame(frame);frame=0;drag=null;lastStep=0;} else {refresh();schedule();}
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
    x=clamp(event.clientX+drag.offsetX,70,innerWidth-70);y=Math.min(safeY(),clamp(event.clientY+drag.offsetY,128,innerHeight-24));
    draw();
  }
  function pointerUp(event) {
    if(!drag || drag.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();const moved=drag.moved;drag=null;
    if(button.hasPointerCapture(event.pointerId))button.releasePointerCapture(event.pointerId);
    if(moved)travel(closest(x),x,true);else interact();draw();schedule();
  }
  function pointerCancel(event) {
    if(!drag || drag.id!==event.pointerId)return;
    drag=null;travel(closest(x),x,true);draw();schedule();
  }
  function buttonClick(event) {event.stopPropagation();if(event.detail===0)interact();}
  function stopDouble(event) {event.preventDefault();event.stopPropagation();}
  function summon(event) {
    if (!enabled || drag || event.defaultPrevented || event.detail>1 || !platforms.length || !(event.target instanceof Element)) return;
    if(event.target.closest('button,input,label,a,select,textarea,form,.editor-only,.stick-world'))return;
    const clock=document.querySelector('.clock')?.getBoundingClientRect();
    if(!clock || event.clientY<clock.top-100 || event.clientY>clock.bottom+80)return;
    wake();travel(closest(event.clientX),event.clientX,true);draw();schedule();
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
  const api={setState,refresh,onFlip,setEnabled,destroy};world.stickFigure=api;
  refresh();if(night())pose('sleep',6);draw();schedule();
  return api;
}

(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const pad = value => String(value).padStart(2, '0');
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const secondsInput = $('#show-seconds'), secondsCluster = $('#seconds-cluster');
  const dateElement = $('#date'), weekdayElement = $('#weekday'), description = $('#clock-description');
  const fullscreen = $('#fullscreen'), status = $('#weather-status'), locateButton = $('#locate');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains('is-fullscreen'));
  const glassDigits = createGlassDigits($('#weather-canvas'));
  const stickFigure = createStickFigure();
  const scene = createWeatherScene($('#weather-canvas'), reducedMotion, () => glassDigits.draw());
  const tiles = [...document.querySelectorAll('.tile')].map(element => ({
    element, unit:element.dataset.unit, value:null, timer:null,
    top:element.querySelector('.static.top .numeral'), bottom:element.querySelector('.static.bottom .numeral'),
    foldTop:element.querySelector('.flap.top .numeral'), foldBottom:element.querySelector('.flap.bottom .numeral')
  }));
  const REFRESH_MS = 10 * 60 * 1000;
  const knownCodes = [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,97,99];
  const previewBase = {phase:'day',condition:'clear',sunProgress:.5,sunVisible:true,cloudCover:0,intensity:0,wind:5,moonPhase:.35,moonVisible:false,hail:false};
  const previews = [
    ['sunrise','日出',{phase:'sunrise',sunProgress:.08,cloudCover:.12}],
    ['noon','正午晴天',{}],
    ['sunset','日落',{phase:'sunset',sunProgress:.92,cloudCover:.14}],
    ['night','星空月夜',{phase:'night',sunVisible:false,moonVisible:true}],
    ['cloudy','多云',{condition:'cloudy',cloudCover:.5,sunProgress:.36,wind:12}],
    ['cloudy-night','多云月夜',{phase:'night',condition:'cloudy',cloudCover:.57,moonVisible:true,sunVisible:false,wind:14}],
    ['overcast','阴天',{condition:'overcast',cloudCover:1,wind:18}],
    ['fog','雾',{condition:'fog',cloudCover:.85,intensity:.8,wind:2}],
    ['drizzle','毛毛雨',{condition:'rain',cloudCover:.7,intensity:.16,wind:6}],
    ['rain','下雨',{condition:'rain',cloudCover:.86,intensity:.5,wind:20}],
    ['downpour','暴雨',{condition:'rain',cloudCover:1,intensity:1,wind:50}],
    ['freezing-rain','冻雨',{condition:'rain',phase:'night',sunVisible:false,cloudCover:.9,intensity:.35,wind:14}],
    ['snow','飘雪',{condition:'snow',cloudCover:.8,intensity:.32,wind:8}],
    ['blizzard','暴雪',{condition:'snow',cloudCover:1,intensity:1,wind:55}],
    ['storm','雷雨',{condition:'storm',cloudCover:1,intensity:.8,wind:38}],
    ['hail','雷雨冰雹',{condition:'storm',cloudCover:1,intensity:1,wind:40,hail:true}]
  ];
  let previewIndex=-1, previewTimer=null;
  const defaultAppearance={glass:true,size:100,weight:500,spacing:0,font:'system'};
  const fontFamilies={system:'-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',rounded:'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", sans-serif',mono:'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',serif:'ui-serif, "Iowan Old Style", Georgia, "Times New Roman", serif'};
  const presets={minimal:{size:100,weight:300,spacing:-2,font:'system'},classic:{size:100,weight:500,spacing:0,font:'system'},rounded:{size:105,weight:650,spacing:0,font:'rounded'},mono:{size:95,weight:500,spacing:2,font:'mono'}};
  const settingBounds={size:[70,140],weight:[300,800],spacing:[-4,24]};
  let settings = {seconds:true,companion:true,...defaultAppearance};
  const fontMeasure=document.createElement('canvas').getContext('2d');
  let timer, noticeTimer, refreshTimer, lastAttempt = 0, weatherRequest = 0, locationRequest = 0;
  let weatherController, searchController, locating = false;
  const DEFAULT_LOCATION = {latitude:30.26, longitude:120.13, label:'杭州 · 西湖区', source:'city'};
  let weather = {location:DEFAULT_LOCATION, data:null, fetchedAt:0};
  let latestScene = {phase:'unknown', condition:'clear', sunProgress:.5, cloudCover:0, intensity:0, wind:0, moonPhase:.5, moonVisible:false};
  // ponytail: preferences and weather cache are optional; storage denial must never break the clock.
  try {
    const saved = JSON.parse(localStorage.getItem('floating-light-clock'));
    for(const key of ['seconds','companion','glass']) if (typeof saved?.[key] === 'boolean') settings[key] = saved[key];
    for(const [key,[min,max]] of Object.entries(settingBounds)) if(Number.isFinite(saved?.[key]) && saved[key]>=min && saved[key]<=max) settings[key]=saved[key];
    if(Object.hasOwn(fontFamilies,saved?.font)) settings.font=saved.font;
  } catch {}
  function saveSettings() { try { localStorage.setItem('floating-light-clock', JSON.stringify(settings)); } catch {} }
  function layoutDigits() {
    const units=settings.seconds?3:2, family=fontFamilies[settings.font], spacing=settings.spacing;
    fontMeasure.font=`${settings.weight} 100px ${family}`;
    const pairWidth=Math.max(...'0123456789'.split('').map(char=>fontMeasure.measureText(char).width))*2/100;
    const available=Math.min(1360,innerWidth-(innerWidth<700?40:80));
    const editing=document.body.classList.contains('panel-open') && !isFullscreen();
    const desired=Math.min(220,innerWidth*(units===3?.16:.235),innerHeight*(editing?.19:.32))*settings.size/100;
    const size=Math.max(24,Math.min(desired,(available-units*(spacing+12)-(units-1)*spacing*1.5)/(units*pairWidth+(units-1)*.24),innerHeight*(isFullscreen()?.52:.36)));
    const style=document.body.style;
    style.setProperty('--digit-size',`${size}px`);style.setProperty('--tile-width',`${Math.ceil(size*pairWidth+spacing+12)}px`);
    style.setProperty('--tile-height',`${Math.ceil(size*1.12+16)}px`);style.setProperty('--colon-width',`${Math.max(12,size*.24+spacing*1.5)}px`);
    style.setProperty('--digit-weight',settings.weight);style.setProperty('--digit-spacing',`${spacing}px`);style.setProperty('--clock-font',family);
    glassDigits.refresh();stickFigure.refresh();scene.setClockBounds?.($('.clock').getBoundingClientRect());applyLight(latestScene);
  }
  function applySettings() {
    secondsInput.checked = settings.seconds;
    secondsCluster.hidden = !settings.seconds;
    document.body.classList.toggle('seconds-hidden', !settings.seconds);
    $('#show-companion').checked=settings.companion; stickFigure.setEnabled(settings.companion);
    $('#use-glass').checked=settings.glass;
    document.body.classList.toggle('plain-digits',!settings.glass);glassDigits.setEnabled(settings.glass);
    for(const key of ['size','weight','spacing']) { $(`#digit-${key}`).value=settings[key];$(`#${key}-value`).textContent=`${settings[key]}${key==='size'?'%':key==='spacing'?' px':''}`; }
    $('#digit-font').value=settings.font;
    document.querySelectorAll('[data-clock-preset]').forEach(button=>button.setAttribute('aria-pressed',String(Object.entries(presets[button.dataset.clockPreset]).every(([key,value])=>settings[key]===value))));
    requestAnimationFrame(layoutDigits);
  }
  function settle(tile) {
    clearTimeout(tile.timer); tile.element.classList.remove('flipping');
    tile.top.textContent = tile.bottom.textContent = tile.foldTop.textContent = tile.foldBottom.textContent = tile.value;
  }
  function setTile(tile, value, animate) {
    if (value === tile.value) { if (!animate) settle(tile); return; }
    const previous = tile.value; settle(tile); tile.value = value;
    if (previous === null || !animate || reducedMotion.matches) { settle(tile); return; }
    tile.top.textContent = value; tile.bottom.textContent = previous;
    tile.foldTop.textContent = previous; tile.foldBottom.textContent = value;
    void tile.element.offsetWidth;
    tile.element.classList.add('flipping'); tile.timer = setTimeout(() => settle(tile), 600);
    stickFigure.onFlip(tile.unit);
  }
  function applyLight(state) {
    const daylight = ['day','sunrise','sunset'].includes(state.phase);
    const lowSun = daylight ? 1 - Math.sin(Math.PI * state.sunProgress) : 0;
    const strength = daylight ? (1 - state.cloudCover * .8) * (state.sunVisible===false ? .2 : 1) : state.moonVisible ? .5*(1-state.cloudCover*.65) : .16;
    const sx = innerWidth * (daylight ? .16 + .68 * state.sunProgress : .76);
    const sy = innerHeight * (daylight ? .72 - .53 * Math.sin(Math.PI * state.sunProgress) : .23);
    const rgb = daylight ? `255,${Math.round(237-lowSun*54)},${Math.round(205-lowSun*90)}` : '170,204,255';
    document.documentElement.style.setProperty('--accent', daylight ? `rgb(${rgb})` : '#b8cced');
    document.documentElement.style.setProperty('--flip', daylight ? '#31343a' : '#171e2b');
    for (const tile of tiles) {
      const rect = tile.element.getBoundingClientRect(); if (!rect.width) continue;
      const dx = sx - rect.left - rect.width / 2, dy = sy - rect.top - rect.height / 2;
      const length = Math.max(1, Math.hypot(dx,dy)), shadow = (7 + lowSun*30) * strength;
      const style = tile.element.style;
      style.setProperty('--light-angle', `${Math.atan2(dx,-dy)*180/Math.PI}deg`);
      style.setProperty('--surface-light', `rgba(${rgb},${.04+strength*.21})`);
      style.setProperty('--edge-light', `rgba(${rgb},${.15+strength*.65})`);
      style.setProperty('--digit-x', `${-dx/length*shadow}px`);
      style.setProperty('--digit-y', `${-dy/length*shadow}px`);
      style.setProperty('--digit-blur', `${2+(1-strength)*6}px`);
      style.setProperty('--plain-shadow-x',`${-dx/length*2*strength}px`);style.setProperty('--plain-shadow-y',`${-dy/length*2*strength+1}px`);
      style.setProperty('--number-light', daylight ? `rgb(${rgb})` : '#f0f5ff');
      style.setProperty('--number-shade', daylight ? '#b7c5d3' : '#b2c5de');
      style.setProperty('--cast-x', `${-dx/length*(12+lowSun*23)*strength}px`);
      style.setProperty('--cast-y', `${-dy/length*(12+lowSun*23)*strength+12}px`);
    }
    glassDigits.setLight({x:sx,y:sy,rgb,strength});
    glassDigits.draw();
  }
  function weatherKind(code) {
    if (code >= 95) return ['storm',[96,99].includes(code)?'雷雨伴冰雹':code===97?'强雷雨':'雷雨'];
    if ([71,73,75,77,85,86].includes(code)) return ['snow','降雪'];
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return ['rain',[56,57,66,67].includes(code)?'冻雨':'降雨'];
    if ([45,48].includes(code)) return ['fog','雾'];
    return code === 3 ? ['overcast','阴天'] : code === 2 ? ['cloudy','多云'] : ['clear',code === 1 ? '晴间多云' : '晴'];
  }
  function updateSky(now) {
    const data = weather.data, stamp = now.getTime();
    let state = {...latestScene, phase:'unknown', condition:'clear', cloudCover:0, intensity:0, moonVisible:false};
    if (data && stamp-weather.fetchedAt < 6*3600000 && stamp >= weather.fetchedAt-3600000) {
      const seconds = stamp/1000, daily = data.daily;
      const index = daily.time.findIndex((start,i) => seconds >= start && seconds < (daily.time[i+1] ?? start+86400));
      if (index >= 0) {
        const rise = daily.sunrise[index], set = daily.sunset[index];
        const validSun = Number.isFinite(rise) && Number.isFinite(set) && set > rise;
        const isDay = validSun ? seconds >= rise && seconds < set : data.current.is_day === 1;
        let phase = isDay ? 'day' : 'night';
        const transition = 35*60;
        if (validSun && set-rise < 23.5*3600) {
          if (Math.abs(seconds-rise) < transition) phase = 'sunrise';
          else if (Math.abs(seconds-set) < transition) phase = 'sunset';
        }
        const lunarEvents = daily.moonrise.map(time => ({time,type:'rise'})).concat(daily.moonset.map(time => ({time,type:'set'})))
          .filter(event => Number.isFinite(event.time) && event.time <= seconds).sort((a,b) => b.time-a.time);
        const kind = weatherKind(data.current.weather_code);
        state = {phase, sunVisible:isDay, condition:kind[0], hail:[96,99].includes(data.current.weather_code), cloudCover:clamp(data.current.cloud_cover/100),
          intensity:clamp(data.current.precipitation/5,.16,1), wind:data.current.wind_speed_10m,
          sunProgress:validSun ? clamp((seconds-rise)/(set-rise)) : .5,
          moonPhase:Number.isFinite(daily.moon_phase[index]) ? daily.moon_phase[index] : 0,
          moonVisible:lunarEvents[0]?.type === 'rise'};
      }
    }
    latestScene = previewIndex<0 ? state : {...previewBase,...previews[previewIndex][2]};
    document.body.dataset.phase = latestScene.phase; document.body.dataset.weather = latestScene.condition;
    document.body.dataset.preview = previewIndex<0 ? 'live' : previews[previewIndex][0];
    scene.setState(latestScene); applyLight(latestScene);stickFigure.setState(latestScene);
    const stale = weather.fetchedAt && (stamp-weather.fetchedAt > REFRESH_MS*2);
    $('#weather-age').textContent = weather.fetchedAt
      ? `${stale ? '上次获取（已过期）' : '最近获取'} ${new Date(weather.fetchedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})} · 每 10 分钟刷新`
      : '每 10 分钟刷新天气 · 光影随时间连续变化';
  }
  function render(animate = true) {
    const now = new Date(), values = {hours:pad(now.getHours()),minutes:pad(now.getMinutes()),seconds:pad(now.getSeconds())};
    tiles.forEach(tile => setTile(tile,values[tile.unit],animate && (tile.unit !== 'seconds' || settings.seconds)));
    const key = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    if (dateElement.dateTime !== key) {
      dateElement.dateTime = key; dateElement.textContent = now.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});
      weekdayElement.textContent = now.toLocaleDateString('zh-CN',{weekday:'long'});
    }
    description.textContent = `${dateElement.textContent} ${weekdayElement.textContent} ${values.hours}时${values.minutes}分${settings.seconds ? values.seconds+'秒' : ''}`;
    const offset = -now.getTimezoneOffset();
    $('#timezone').textContent = `本地时间 · UTC${offset<0?'−':'+'}${pad(Math.floor(Math.abs(offset)/60))}:${pad(Math.abs(offset)%60)}`;
    updateSky(now);
  }
  function tick(animate = true) { clearTimeout(timer); if(document.hidden) return; render(animate); timer = setTimeout(tick,1000-Date.now()%1000+12); }
  const gallery=$('#weather-gallery'), previewGrid=$('#preview-grid');
  const appearance=$('#appearance-panel');
  function syncPanels() {document.body.classList.toggle('panel-open',!appearance.hidden||!gallery.hidden);requestAnimationFrame(layoutDigits);}
  function closeAppearance() {appearance.hidden=true;$('#appearance-toggle').setAttribute('aria-expanded','false');syncPanels();}
  $('#appearance-toggle').addEventListener('click',()=>{
    if(isFullscreen())return;
    const show=appearance.hidden;appearance.hidden=!show;$('#appearance-toggle').setAttribute('aria-expanded',String(show));
    if(show){gallery.hidden=true;$('#weather-browse').setAttribute('aria-expanded','false');$('#digit-font').focus({preventScroll:true});}
    syncPanels();
  });
  $('#appearance-close').addEventListener('click',()=>{if(!isFullscreen()){closeAppearance();$('#appearance-toggle').focus();}});
  for(const key of ['size','weight','spacing','font']) $(`#digit-${key}`).addEventListener('input',event=>{
    if(isFullscreen()){applySettings();return;}
    const value=key==='font'?event.target.value:Number(event.target.value);
    if(key==='font'?!Object.hasOwn(fontFamilies,value):!Number.isFinite(value)||value<settingBounds[key][0]||value>settingBounds[key][1])return;
    settings[key]=value;applySettings();saveSettings();tick(false);
  });
  $('#use-glass').addEventListener('change',event=>{if(isFullscreen()){applySettings();return;}settings.glass=event.target.checked;applySettings();saveSettings();tick(false);});
  document.querySelectorAll('[data-clock-preset]').forEach(button=>button.addEventListener('click',()=>{if(isFullscreen())return;Object.assign(settings,presets[button.dataset.clockPreset]);applySettings();saveSettings();tick(false);}));
  $('#appearance-reset').addEventListener('click',()=>{if(isFullscreen())return;Object.assign(settings,defaultAppearance);applySettings();saveSettings();tick(false);});
  function pausePreview() {
    clearInterval(previewTimer);previewTimer=null;
    $('#preview-play').textContent='自动轮播';$('#preview-play').setAttribute('aria-pressed','false');
  }
  function choosePreview(index) {
    if(isFullscreen()) return;
    previewIndex=index;
    $('#preview-mode').hidden=index<0;
    $('#preview-name').textContent=index<0 ? '' : `效果预览 · ${previews[index][1]}`;
    $('#gallery-current').textContent=index<0 ? '实时天气' : `正在预览：${previews[index][1]}`;
    $('.weather-info').classList.toggle('preview-active',index>=0);
    previewGrid.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
    tick(false);
  }
  previews.forEach(([id,label],index)=>{
    const button=document.createElement('button');button.type='button';button.dataset.preview=id;
    button.className='preview-option';button.textContent=label;button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{if(isFullscreen())return;pausePreview();choosePreview(index);});previewGrid.append(button);
  });
  $('#weather-browse').addEventListener('click',()=>{
    if(isFullscreen())return;
    closeAppearance();
    gallery.hidden=!gallery.hidden;$('#weather-browse').setAttribute('aria-expanded',String(!gallery.hidden));
    if(!gallery.hidden) (previewGrid.children[Math.max(0,previewIndex)]).focus({preventScroll:true});
    syncPanels();
  });
  $('#gallery-close').addEventListener('click',()=>{
    if(isFullscreen())return;
    gallery.hidden=true;$('#weather-browse').setAttribute('aria-expanded','false');$('#weather-browse').focus();
    syncPanels();
  });
  document.querySelectorAll('[data-return-live]').forEach(button=>button.addEventListener('click',()=>{if(!isFullscreen()){pausePreview();choosePreview(-1);}}));
  $('#preview-play').addEventListener('click',()=>{
    if(isFullscreen())return;
    if(previewTimer){pausePreview();return;}
    choosePreview((previewIndex+1)%previews.length);
    $('#preview-play').textContent='暂停轮播';$('#preview-play').setAttribute('aria-pressed','true');
    previewTimer=setInterval(()=>{if(!document.hidden&&!isFullscreen())choosePreview((previewIndex+1)%previews.length);},5000);
  });
  function validLocation(value) {
    return value && Number.isFinite(value.latitude) && Math.abs(value.latitude)<=90 && Number.isFinite(value.longitude) && Math.abs(value.longitude)<=180 && ['device','city'].includes(value.source);
  }
  function validateWeather(data) {
    const c=data?.current, d=data?.daily;
    if (!c || !d || !knownCodes.includes(c.weather_code) || ![0,1].includes(c.is_day) || ![c.time,c.cloud_cover,c.precipitation,c.wind_speed_10m].every(Number.isFinite) || c.cloud_cover<0 || c.cloud_cover>100 || c.precipitation<0 || c.wind_speed_10m<0) throw Error('天气数据不完整');
    if (!Array.isArray(d.time) || !d.time.length || !d.time.every(Number.isFinite) || !['sunrise','sunset','moonrise','moonset','moon_phase'].every(key => Array.isArray(d[key]) && d[key].length===d.time.length && d[key].every(v => v===null || Number.isFinite(v)))) throw Error('日月数据不完整');
    return data;
  }
  function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if(document.hidden) scheduleRefresh(); else refreshWeather(); }, REFRESH_MS); }
  async function loadWeather() {
    const location=weather.location; if(!validLocation(location)) return;
    const request=++weatherRequest; weatherController?.abort(); weatherController=new AbortController();
    const controller=weatherController, timeout=setTimeout(()=>controller.abort(),15000);
    lastAttempt=Date.now(); status.textContent=`${location.label} · 正在更新天气…`; scheduleRefresh();
    const params=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),current:'weather_code,cloud_cover,is_day,precipitation,wind_speed_10m',daily:'sunrise,sunset,moonrise,moonset,moon_phase',timezone:'auto',timeformat:'unixtime',past_days:'1',forecast_days:'3'});
    try {
      const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok) throw Error(`天气服务暂不可用（${response.status}）`);
      const data=validateWeather(await response.json()); if(request!==weatherRequest) return;
      weather={location,data,fetchedAt:Date.now()};
      try {localStorage.setItem('floating-light-weather',JSON.stringify(weather));} catch {}
      status.textContent=`${location.label} · ${weatherKind(data.current.weather_code)[1]}`;
      tick(false);
    } catch(error) {
      if(request!==weatherRequest) return;
      status.textContent=`天气暂时无法更新${weather.data ? '，保留上次天气' : '，等待恢复连接'}。稍后自动重试。`;
    } finally {clearTimeout(timeout);}
  }
  function selectLocation(location) {
    const changed=!weather.location || location.latitude!==weather.location.latitude || location.longitude!==weather.location.longitude;
    weather.location=location;
    if(changed) {weather.data=null;weather.fetchedAt=0;}
    tick(false); loadWeather();
  }
  function locate(manual = true) {
    if(locating && !manual) return;
    const request=++locationRequest; locating=true; locateButton.disabled=true;
    status.textContent='正在获取当地位置…';
    const failure=error => {
      if(request!==locationRequest) return;
      locating=false;locateButton.disabled=false;
      const message=error?.code===1 ? '定位未获允许，可在浏览器中允许定位，或手动选择城市。' : '暂时无法定位，可重试或手动选择城市。';
      if(manual) {
        const notice=$('#notice');notice.textContent=message;notice.hidden=false;
        clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.hidden=true,7000);
      }
      if(weather.location) {loadWeather();status.textContent=message+' 正沿用上次位置查询。';}
      else {status.textContent=message;$('#city-form').hidden=false;$('#city-toggle').setAttribute('aria-expanded','true');}
    };
    if(!navigator.geolocation || !window.isSecureContext) {failure();return;}
    navigator.geolocation.getCurrentPosition(position => {
      if(request!==locationRequest) return;
      locating=false;locateButton.disabled=false;
      // Weather grids do not need exact coordinates; send only about 1 km precision.
      const location={latitude:Math.round(position.coords.latitude*100)/100,longitude:Math.round(position.coords.longitude*100)/100,label:'当前位置',source:'device'};
      if(!validLocation(location)) {failure();return;} selectLocation(location);
    },failure,{enableHighAccuracy:false,timeout:12000,maximumAge:REFRESH_MS});
  }
  function refreshWeather() { if(weather.location?.source==='city') loadWeather(); else if(weather.location) locate(false); }
  const cityForm=$('#city-form'), cityResults=$('#city-results');
  $('#city-toggle').addEventListener('click',() => {
    if(isFullscreen()) return;
    cityForm.hidden=!cityForm.hidden;$('#city-toggle').setAttribute('aria-expanded',String(!cityForm.hidden));
    if(!cityForm.hidden) $('#city-name').focus();
  });
  cityForm.addEventListener('submit',async event => {
    event.preventDefault(); if(isFullscreen()) return;
    const name=$('#city-name').value.trim(); if(name.length<2) {cityResults.textContent='请输入至少两个字的城市名。';return;}
    searchController?.abort(); const controller=searchController=new AbortController(), timeout=setTimeout(()=>controller.abort(),12000);
    cityResults.textContent='正在查找城市…';
    try {
      const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({name,count:'5',language:'zh',format:'json'})}`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok) throw Error(); const data=await response.json(); if(searchController!==controller) return;
      const results=(Array.isArray(data.results)?data.results:[]).filter(item=>validLocation({...item,source:'city'}));
      cityResults.replaceChildren(); if(!results.length) cityResults.textContent='没有找到，可试试城市英文名。';
      results.forEach(item=>{
        const button=document.createElement('button');button.type='button';button.className='city-result';
        const label=[item.name,item.admin1,item.country].filter(v=>typeof v==='string').join(' · ');
        button.textContent=label;
        button.addEventListener('click',()=>{
          if(isFullscreen()) return;
          ++locationRequest;locating=false;locateButton.disabled=false;
          selectLocation({latitude:Math.round(item.latitude*100)/100,longitude:Math.round(item.longitude*100)/100,label,source:'city'});
          cityForm.hidden=true;$('#city-toggle').setAttribute('aria-expanded','false');
        });cityResults.append(button);
      });
    } catch {if(searchController===controller) cityResults.textContent='城市查询暂不可用，请稍后重试。';} finally {clearTimeout(timeout);}
  });
  secondsInput.addEventListener('change',()=>{if(isFullscreen()){applySettings();return;}settings.seconds=secondsInput.checked;applySettings();saveSettings();tick(false);});
  $('#show-companion').addEventListener('change',event=>{if(isFullscreen()){applySettings();return;}settings.companion=event.target.checked;applySettings();saveSettings();});
  locateButton.addEventListener('click',()=>{if(!isFullscreen()) locate();});
  document.addEventListener('visibilitychange',()=>{tick(false);if(!document.hidden && Date.now()-lastAttempt>=REFRESH_MS) refreshWeather();});
  window.addEventListener('online',()=>{if(weather.location) loadWeather();});
  window.addEventListener('pageshow',()=>tick(false));
  window.addEventListener('resize',layoutDigits);
  window.addEventListener('scroll',()=>scene.setClockBounds?.($('.clock').getBoundingClientRect()),{passive:true});
  reducedMotion.addEventListener('change',()=>tick(false));
  function syncFullscreen(active) {
    if(active) pausePreview();
    document.body.classList.toggle('is-fullscreen',active);
    document.querySelectorAll('.editor-only').forEach(element=>element.inert=active);
    fullscreen.setAttribute('aria-pressed',String(active));
    window.scrollTo(0,0); glassDigits.refresh(); tick(false);
    requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  }
  fullscreen.addEventListener('click',async()=>{
    const enter=document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
    // ponytail: older iPad browsers use an in-page immersive view when native fullscreen is unavailable.
    try {if(!enter) throw Error(); await enter.call(document.documentElement);}
    catch {syncFullscreen(true);}
  });
  for(const name of ['fullscreenchange','webkitfullscreenchange']) document.addEventListener(name,()=>syncFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement)));
  async function exitFullscreen() {
    const exit=document.exitFullscreen || document.webkitExitFullscreen;
    if((document.fullscreenElement || document.webkitFullscreenElement) && exit) {try {await exit.call(document);} catch {}}
    else syncFullscreen(false);
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && isFullscreen()) exitFullscreen();});
  document.addEventListener('dblclick',event=>{if(isFullscreen() && !event.target.closest('button,input,label,a')) exitFullscreen();});
  let lastTouch=null;
  document.addEventListener('pointerup',event=>{
    if(event.pointerType!=='touch' || !isFullscreen() || event.target.closest('button,input,label,a')) return;
    const touch={x:event.clientX,y:event.clientY,time:performance.now()};
    if(lastTouch && touch.time-lastTouch.time<340 && Math.hypot(touch.x-lastTouch.x,touch.y-lastTouch.y)<24) {lastTouch=null;exitFullscreen();}
    else lastTouch=touch;
  });
  try {
    const cached=JSON.parse(localStorage.getItem('floating-light-weather'));
    if(validLocation(cached?.location)) {
      weather.location={...cached.location,label:typeof cached.location.label==='string'?cached.location.label:'上次位置'};
      if(Number.isFinite(cached.fetchedAt) && Date.now()-cached.fetchedAt<6*3600000 && cached.fetchedAt<=Date.now()+60000) {
        weather.data=validateWeather(cached.data);weather.fetchedAt=cached.fetchedAt;
        status.textContent='显示上次天气，正在更新…';
      }
    }
  } catch {}
  applySettings();tick(false);
  if(weather.location?.source==='city') loadWeather();else locate(false);
})();

  