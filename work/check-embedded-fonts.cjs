// Run: node work/check-embedded-fonts.cjs (serve outputs on localhost:8765).
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const fonts=JSON.parse(fs.readFileSync('work/embedded-fonts.json','utf8'));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},reducedMotion:'reduce'}),errors=[],externalFonts=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();
   if(route.request().resourceType()==='font')externalFonts.push(route.request().url());
   return route.abort();
  });
  await page.goto('http://127.0.0.1:8765/glass-clock.html');
  await page.locator('#appearance-toggle').click();
  assert.equal(await page.locator('#digit-font option[data-family]').count(),8);
  const shapes=[];
  for(const font of fonts){
   await page.locator('#digit-font').selectOption(font.id);
   const detail=await page.evaluate(async family=>{
    const faces=await document.fonts.load(`500 100px "${family}"`,'0123456789:');
    const canvas=document.createElement('canvas');canvas.width=500;canvas.height=150;
    const ctx=canvas.getContext('2d');
    const samples=[300,800].map(weight=>{
     ctx.clearRect(0,0,500,150);ctx.font=`${weight} 100px "${family}"`;ctx.fillText('012345',10,110);
     const pixels=ctx.getImageData(0,0,500,150).data;let ink=0,hash=2166136261;
     for(let i=3;i<pixels.length;i+=4){ink+=pixels[i]/255;hash=Math.imul(hash^pixels[i],16777619);}
     return {ink,hash:hash>>>0,widths:[...'0123456789'].map(char=>ctx.measureText(char).width)};
    });
    return {loaded:faces.some(face=>face.status==='loaded'),samples};
   },font.cssFamily);
   assert.ok(detail.loaded,`${font.id}: embedded font failed to decode offline`);
   assert.ok(detail.samples[1].ink>detail.samples[0].ink*1.15,`${font.id}: weight control does not change actual strokes`);
   assert.ok(detail.samples.every(sample=>Math.max(...sample.widths)-Math.min(...sample.widths)<.02),`${font.id}: digits are not stable-width`);
   shapes.push(detail.samples[0].hash);
  }
  assert.equal(new Set(shapes).size,8,'embedded faces must have distinct real glyphs');
  await page.reload();
  assert.equal(await page.locator('#digit-font').inputValue(),fonts.at(-1).id,'embedded selection lost on reload');
  assert.deepEqual(externalFonts,[],'fonts must not require an external request');assert.deepEqual(errors,[]);
  console.log('PASS: 8 distinct offline embedded fonts, real 300–800 weights, tabular digits, saved selection, no external font requests or script errors.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
