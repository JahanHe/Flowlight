const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});try{
 const page=await browser.newPage({viewport:{width:900,height:506},deviceScaleFactor:1,timezoneId:'Asia/Shanghai'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const html=fs.readFileSync('outputs/glass-clock.html','utf8');
 await page.addInitScript(()=>{for(const key of ['requestFullscreen','webkitRequestFullscreen'])Object.defineProperty(Element.prototype,key,{value:undefined,configurable:true});localStorage.setItem('floating-light-render-quality','fine');localStorage.setItem('floating-light-clock',JSON.stringify({glass:true,seconds:false,companion:true,size:100,weight:400,spacing:-5,font:'inter',effectsVersion:1,immersive:true,motionSpeed:1}));});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='flow.test'?r.fulfill({body:html,contentType:'text/html'}):r.abort());
 const at=new Date('2026-10-17T21:10:00+08:00');await page.clock.install({time:at});await page.clock.pauseAt(at);await page.clock.setFixedTime(at);await page.goto('http://flow.test/');await page.evaluate(()=>document.fonts.ready);await page.clock.runFor(500);
 await page.evaluate(()=>{document.querySelector('[data-preview="night"]').click();document.querySelector('#fullscreen').click();});await page.clock.runFor(5000);
 const dir='work/flow-preview-frames';fs.mkdirSync(dir,{recursive:true});
 for(let i=0;i<80;i++){await page.clock.runFor(100);await page.screenshot({path:`${dir}/${String(i).padStart(3,'0')}.png`});}
 await page.screenshot({path:'outputs/浮光-1.3.4-星空预览.png'});
 assert.deepEqual(errors,[]);console.log('PASS: final HTML night motion capture at 1x; no runtime errors.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
