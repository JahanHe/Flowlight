const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try {
  const context=await browser.newContext({viewport:{width:1024,height:768},timezoneId:'Asia/Shanghai',hasTouch:true});
  const page=await context.newPage();
  // Only ideal previews are captured; these shots do not represent live Hangzhou weather.
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.clock.install({time:new Date('2026-10-16T21:47:00+08:00')});
  await page.clock.pauseAt(new Date('2026-10-16T21:48:00+08:00'));
  await page.goto('http://127.0.0.1:8765/glass-clock.html');
  await page.clock.runFor(160);
  console.log('Page ready');
  await page.locator('#day-cycle').click();await page.clock.fastForward(45000);await page.clock.runFor(160);
  console.log('Ideal midnight ready');
  await page.screenshot({path:path.resolve('outputs/glass-clock-day-cycle.png'),animations:'disabled'});
  await page.locator('#fullscreen').click();
  await page.clock.runFor(180);
  await page.screenshot({path:path.resolve('outputs/glass-clock-preview.png'),animations:'disabled'});
  await page.keyboard.press('Escape');
  await page.locator('#use-glass').uncheck();
  await page.clock.fastForward(30000);await page.clock.runFor(160);
  await page.locator('#fullscreen').click();
  await page.clock.runFor(180);
  await page.screenshot({path:path.resolve('outputs/glass-clock-plain.png'),animations:'disabled'});
  await page.keyboard.press('Escape');
  await page.locator('#weather-browse').click();await page.locator('.preview-option[data-preview="rain"]').click();await page.locator('#gallery-close').click();
  for(let i=0;i<8;i++){await page.clock.fastForward(1000);await page.clock.runFor(40);}
  await page.locator('#fullscreen').click();await page.clock.runFor(160);
  await page.screenshot({path:path.resolve('outputs/glass-clock-rain.png'),animations:'disabled'});
  console.log(JSON.stringify({screenshots:['outputs/glass-clock-day-cycle.png','outputs/glass-clock-preview.png','outputs/glass-clock-plain.png','outputs/glass-clock-rain.png'],time:await page.locator('#clock-description').textContent(),notice:'Continuous day preview with offline clear/manual rain weather; not actual Hangzhou weather.'},null,2));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
