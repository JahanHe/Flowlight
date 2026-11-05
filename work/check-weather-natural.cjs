// Run: node work/check-weather-natural.cjs
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const app=fs.readFileSync('work/weather-app.js','utf8');
  const data=vm.runInNewContext(app.slice(app.indexOf('const previewBase ='),app.indexOf('let previewIndex'))+';({previewBase,previews})');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<style>body{margin:0;background:#000}canvas{position:fixed;inset:0;width:100%;height:100%;mask-image:radial-gradient(ellipse 50% 50% at center,#000 42%,rgba(0,0,0,.93) 64%,rgba(0,0,0,.5) 80%,transparent 96%)}</style><canvas></canvas>');
  await page.evaluate(()=>{
    // This test repeatedly reads pixels. Pin the readback backend so Chrome's GPU-to-CPU
    // fallback cannot introduce 1–2 level rounding differences into identical-frame checks.
    const nativeContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,options){return nativeContext.call(this,type,{...options,willReadFrequently:true});};
    window.testNow=0;Object.defineProperty(performance,'now',{value:()=>testNow});window.queue=new Map();window.serial=0;
    window.requestAnimationFrame=fn=>{queue.set(++serial,fn);return serial;};window.cancelAnimationFrame=id=>queue.delete(id);
    window.motion={matches:false,addEventListener:(_,fn)=>window.motionChanged=fn};
  });
  await page.addScriptTag({content:fs.readFileSync('work/weather-scene.js','utf8').replace('  resize();', '  window.inspectClouds=()=>[...cloudSprites.values()]; resize();')});
  await page.evaluate(()=>{
    window.scene=createWeatherScene(document.querySelector('canvas'),motion);
    scene.setClockBounds({left:220,top:290,width:840,height:230});
    window.advance=ms=>{testNow+=ms;const [id,fn]=[...queue][0]||[];if(fn){queue.delete(id);fn(testNow);}};
    window.pixels=()=>document.querySelector('canvas').getContext('2d').getImageData(0,0,1280,800).data;
  });
  const results=[];
  for(const [id,label,variant] of data.previews){
    const state={...data.previewBase,...variant};
    const result=await page.evaluate(({id,state})=>{
      scene.setState(state);advance(1100);const before=pixels(),snapshot=document.querySelector('canvas').toDataURL();
      scene.setState(state);const unchangedOnRepeat=snapshot===document.querySelector('canvas').toDataURL();advance(4000);const after=pixels();
      let changed=0,total=0;for(let i=0;i<after.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(after[i+c]-before[i+c]);if(d>4)changed++;total+=d;}
      return{id,changedPixels:changed,meanRGBChange:total/(1280*800*3),unchangedOnRepeat,raf:queue.size};
    },{id,state});
    assert(result.changedPixels>3000,`${label}: visible weather must keep moving`);assert(result.unchangedOnRepeat,`${label}: the same state must not restart the animation`);assert.equal(result.raf,1);results.push(result);
    if(['noon','sunset','cloudy','cloudy-night','rain','snow','fog','night','storm'].includes(id)) fs.writeFileSync(`work/weather-natural-${id}.png`,Buffer.from((await (await page.context().newCDPSession(page)).send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  const continuity=await page.evaluate(()=>{
    const first=document.querySelector('canvas').toDataURL();scene.setState({});
    const sameAtSameTime=first===document.querySelector('canvas').toDataURL();advance(4000);
    const keepsMoving=first!==document.querySelector('canvas').toDataURL();
    const edgeLeaks=inspectClouds().reduce((total,sprite)=>{const p=sprite.getContext('2d').getImageData(0,0,sprite.width,sprite.height).data;for(let y=0;y<sprite.height;y++)for(let x=0;x<sprite.width;x++)if((x===0||y===0||x===sprite.width-1||y===sprite.height-1)&&p[(y*sprite.width+x)*4+3]!==0)total++;return total;},0);
    return{sameAtSameTime,keepsMoving,edgeLeaks};
  });
  assert(continuity.sameAtSameTime);assert(continuity.keepsMoving);assert.equal(continuity.edgeLeaks,0);
  const stable=await page.evaluate(()=>{
    motion.matches=true;motionChanged();const before=document.querySelector('canvas').toDataURL(),p1=pixels();testNow+=4000;scene.setState({});const p2=pixels();let changed=0;for(let i=0;i<p2.length;i++)if(p1[i]!==p2[i])changed++;
    const unchanged=before===document.querySelector('canvas').toDataURL();scene.setClockBounds({left:NaN,top:0,width:Infinity,height:2});
    return{unchanged,changed,raf:queue.size};
  });
  console.log(stable);assert(stable.unchanged);assert.equal(stable.raf,0);assert.deepEqual(errors,[]);
  fs.writeFileSync('work/weather-natural-results.json',JSON.stringify({results,continuity,reducedMotion:stable,errors},null,2));
  console.log(`PASS: all ${results.length} previews animate continuously; 4-second pixel comparisons; single RAF; reduced motion; invalid bounds; no errors.`);
  console.log(continuity);
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
