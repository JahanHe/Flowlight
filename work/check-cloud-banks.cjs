// Offline regression for cloud size, long-running drift, complete exits and shared weather weighting.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
let source = fs.readFileSync('work/weather-scene.js', 'utf8');
const marker = '  function prepareClouds(t,daylight,layers) {';
assert(source.includes(marker));
source = source.replace('c.putImageData(pixels,0,0);cloudSprites.set(key,off);return off;', 'c.putImageData(pixels,0,0);off.clockCloudShape=shape;cloudSprites.set(key,off);return off;');
source = source.replace(marker, `
  const originalCloudWeight=cloudWeatherWeight;
  cloudWeatherWeight=(shape,layers)=>originalCloudWeight(shape,layers)*(window.blockedCloud===shape?0:1);
  window.cloudQA={
    sample(time,weather='clear',draw=false){
      cloudTime=time;immersion=1;state={...state,phase:'day',condition:weather,cloudCover:weather==='clear'?0:1,intensity:1,sunAltitude:60};
      const layers=clockWeatherAmounts(state);prepareClouds(time,1,layers);
      window.cloudDraws=[];if(draw){cloudscape(time,1,layers);flightClouds(time,1,layers);}
      return {width:w,height:h,frames:cloudFrames.slice(0,cloudCount).map(c=>({...c})),draws:window.cloudDraws.slice(),weights:Array.from({length:6},(_,s)=>originalCloudWeight(s,layers)),transmission:solarTransmission};
    },
    bounds(){return Array.from({length:6},(_,shape)=>{const f=cloudField(shape);let left=f.width,right=0,top=f.height,bottom=0;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)if(f.alpha[y*f.width+x]>45){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}return {shape,width:(right-left+1)/f.width,height:(bottom-top+1)/f.height};});},
    caches(){for(let shape=0;shape<6;shape++)for(const palette of ['day','night','storm','warm','rim'])cloudSprite(shape,palette);return {fields:[...cloudFields.values()].map(f=>({width:f.width,height:f.height,type:f.field.constructor.name})),sprites:cloudSprites.size};}
  };
${marker}`);
const html = `<!doctype html><style>html,body{margin:0;overflow:hidden}#weather-canvas{width:100vw;height:100vh}</style><canvas id="weather-canvas"></canvas><script>window.clockFullEffects=true;window.clockMotion={speed:1,immersive:true};window.clockQuality={level:0,detail:.55,fps:20,weatherPixels:640*360,weatherDpr:1};</script><script>${source}</script><script>window.scene=createWeatherScene(document.querySelector('canvas'),false);</script>`;
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
  try {
    const page = await browser.newPage({viewport:{width:960,height:540}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(() => {
      let seed=135;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
      window.cloudDraws=[];window.blockedCloud=-1;
      const draw=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(Number.isInteger(image.clockCloudShape))cloudDraws.push({shape:image.clockCloudShape,alpha:this.globalAlpha,canvas:this.canvas.id});return draw.call(this,image,...args);};
    });
    await page.clock.install({time:new Date('2026-10-17T12:00:00+08:00')});
    await page.clock.pauseAt(new Date('2026-10-17T12:00:00+08:00'));
    await page.route('**/*',r=>r.request().url()==='http://cloud.test/'?r.fulfill({contentType:'text/html',body:html}):r.abort());
    await page.goto('http://cloud.test/');
    const sizes=[];
    for(const viewport of [{width:960,height:540},{width:390,height:844}]){
      await page.setViewportSize(viewport);await page.clock.runFor(100);
      const result=await page.evaluate(()=>({sample:cloudQA.sample(25),bounds:cloudQA.bounds()}));
      for(const c of result.sample.frames.filter((c,i)=>c.shape===0&&i<6)){
        const b=result.bounds[c.shape],widthFraction=c.width*b.width/result.sample.width,heightFraction=c.height*b.height/Math.min(result.sample.width,result.sample.height);
        assert(widthFraction>.35,'main cumulus must span more than 35% of the screen width');
        assert(heightFraction>.15,'main cumulus must retain volume rather than a tiny flattened strip');
        assert(c.alpha>.1,'main cumulus must remain visibly opaque');sizes.push({viewport,widthFraction,heightFraction});
      }
    }
    await page.setViewportSize({width:960,height:540});await page.clock.runFor(100);
    const motion=await page.evaluate(()=>{
      const records=[];for(const start of [0,3600,86400]){
        let maxSpeed=0,wraps=0,unsafeWraps=0;
        const offscreen=(c,w)=>c.left+c.width<=.1||c.left>=w-.1;
        const safeExit=(a,b,index)=>{const initial=cloudQA.sample(a),x=initial.frames[index].x;for(let k=0;k<18;k++){const middle=(a+b)/2;if(Math.abs(cloudQA.sample(middle).frames[index].x-x)>initial.width*.5)b=middle;else a=middle;}return offscreen(cloudQA.sample(a).frames[index],initial.width)&&offscreen(cloudQA.sample(b).frames[index],initial.width);};
        for(let offset=0;offset<1200;offset+=.5){
          const a=cloudQA.sample(start+offset),b=cloudQA.sample(start+offset+.05);
          for(let i=0;i<a.frames.length;i++){const before=a.frames[i],after=b.frames[i],dx=Math.abs(after.x-before.x);
            if(dx>a.width*.5){wraps++;if(!safeExit(start+offset,start+offset+.05,i))unsafeWraps++;}
            else maxSpeed=Math.max(maxSpeed,dx/a.width/.05);
          }
        }
        // Scan complete half-second intervals as well, so every exit is included.
        let previous=cloudQA.sample(start);for(let offset=.5;offset<=1200;offset+=.5){const next=cloudQA.sample(start+offset);for(let i=0;i<next.frames.length;i++)if(Math.abs(next.frames[i].x-previous.frames[i].x)>next.width*.5){wraps++;if(!safeExit(start+offset-.5,start+offset,i))unsafeWraps++;}previous=next;}
        records.push({start,maxScreenWidthsPerSecond:maxSpeed,wraps,unsafeWraps});
      }return records;
    });
    for(const m of motion){assert(m.maxScreenWidthsPerSecond<.04,`cloud drift accelerated at ${m.start}s`);assert(m.wraps>0);assert.equal(m.unsafeWraps,0,'cloud loops only after its whole painted bank exits');}
    const weather=await page.evaluate(()=>{
      const rows=[];for(const kind of ['clear','storm']){blockedCloud=-1;const normal=cloudQA.sample(25,kind,true);for(const shape of [4,5]){blockedCloud=shape;const blocked=cloudQA.sample(25,kind,true);rows.push({kind,shape,weight:normal.weights[shape],normalBackground:normal.frames.filter(c=>c.shape===shape).map(c=>c.alpha),blockedBackground:blocked.frames.filter(c=>c.shape===shape).map(c=>c.alpha),normalFront:normal.draws.filter(c=>c.shape===shape&&c.canvas==='weather-foreground').map(c=>c.alpha),blockedFront:blocked.draws.filter(c=>c.shape===shape&&c.canvas==='weather-foreground').map(c=>c.alpha)});}blockedCloud=-1;}return rows;
    });
    for(const row of weather){assert(row.normalBackground.some(a=>a>0));assert(row.blockedBackground.every(a=>a===0));assert(row.normalFront.some(a=>a>0));assert(row.blockedFront.every(a=>a===0),'foreground must honor the same weather gate');}
    for(const shape of [4,5])assert(weather.find(r=>r.kind==='storm'&&r.shape===shape).weight>weather.find(r=>r.kind==='clear'&&r.shape===shape).weight*5);
    const cache=await page.evaluate(()=>cloudQA.caches());assert.equal(cache.fields.length,6);assert(cache.fields.every(f=>f.width===320&&f.height===200&&f.type==='Uint8Array'));assert(cache.sprites<=30);assert.deepEqual(errors,[]);
    const report={pass:true,scope:'Offline Chromium source regression; virtual time, not real-device performance',sizes,motion,weather,cache};
    fs.writeFileSync('work/cloud-banks-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
