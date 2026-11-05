const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='warning'||msg.type()==='error')console.log(msg.text())});
await page.setContent(fs.readFileSync('outputs/glass-clock.html','utf8').replace(/<script>[\s\S]*?<\/script>/g,''));
await page.addStyleTag({content:fs.readFileSync('work/glass-digits.css','utf8')+`.tile,.static.top,.static.bottom,.flap {background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.tile::after,.flap::after{display:none}.seam{display:none}.tile{--number-light:rgb(255,237,205)}`});
await page.addScriptTag({content:fs.readFileSync('work/weather-scene.js','utf8')+fs.readFileSync('work/glass-digits.js','utf8')});
await page.evaluate(()=>{
const canvas=document.querySelector('#weather-canvas');
window.scene=createWeatherScene(canvas,true);scene.setState({phase:'day',condition:'rain',cloudCover:.3,intensity:1,sunProgress:.33,moonVisible:false});
const tiles=document.querySelectorAll('.tile');[...tiles].forEach((tile,i)=>tile.querySelectorAll('.numeral').forEach(span=>span.textContent=['12','34','56'][i]));
window.glass=createGlassDigits(canvas);glass.setLight({x:1440*.38,y:220,rgb:'255,237,205',strength:.95});glass.draw();
});
assert.equal(await page.locator('.glass-numeral').count(),12);assert.equal(await page.locator('.glass-digits-ready').count(),1);
let stats=await page.evaluate(()=>{const a=document.querySelector('.glass-numeral');const p=a.getContext('2d').getImageData(0,0,a.width,a.height).data;let filled=0,clear=0;for(let i=3;i<p.length;i+=4){if(p[i]>200)filled++;if(p[i]===0)clear++}return{filled,clear,total:p.length/4}});
assert(stats.filled>5000);assert(stats.clear>stats.total*.5);
await page.screenshot({path:'work/glass-digits-day.png'});
await page.evaluate(()=>{scene.setState({phase:'night',condition:'clear',cloudCover:0});glass.setLight({x:1440*.76,y:1000*.23,rgb:'170,204,255',strength:.4});glass.draw()});
await page.screenshot({path:'work/glass-digits-night.png'});
await page.evaluate(()=>{document.querySelector('.numeral').textContent='09';glass.draw()});
assert.equal(await page.locator('.glass-numeral').count(),12);
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{glass.refresh();glass.draw()});
await page.screenshot({path:'work/glass-digits-mobile.png'});
await page.evaluate(()=>{
  // Cross the bounded glyph cache twice while the active GPU texture unit alternates.
  for(let i=0;i<66;i++){document.querySelector('.numeral').textContent=String(i%60).padStart(2,'0');glass.draw();}
});
const transmitted=await page.evaluate(()=>{
  const source=document.querySelector('#weather-canvas'),ctx=source.getContext('2d');
  function sample(color){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=color;ctx.fillRect(0,0,source.width,source.height);ctx.restore();glass.draw();const canvas=document.querySelector('.glass-numeral'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;const total=[0,0,0];let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>240){count++;for(let c=0;c<3;c++)total[c]+=pixels[i+c];}return total.map(n=>n/count)}
  return {red:sample('#c02020'),blue:sample('#2020c0')};
});
// A soft white light layer brightens both samples; test the transmitted change, not absolute saturation.
assert(transmitted.red[0]-transmitted.blue[0]>30,'red weather must transmit through the glyph');
assert(transmitted.blue[2]-transmitted.red[2]>30,'blue weather must transmit through the glyph');
const fallback=await page.evaluate(()=>{
  document.querySelectorAll('.glass-numeral').forEach(canvas=>canvas.remove());
  const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args)};
  const renderer=createGlassDigits(document.querySelector('#weather-canvas'));renderer.draw();
  HTMLCanvasElement.prototype.getContext=original;
  const canvas=document.querySelector('.glass-numeral'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  return {count:document.querySelectorAll('.glass-numeral').length,filled:Array.from(pixels).filter((value,i)=>i%4===3&&value>200).length};
});
assert.equal(fallback.count,12);assert(fallback.filled>500);
assert.deepEqual(errors,[]);
console.log('PASS: 12 flip-face canvases; glyph transparency; actual GPU weather transmission; 66 glyph-cache updates; text mutation survival; desktop/day/night/mobile; WebGL unavailable fallback; no JS errors.',stats);
await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
