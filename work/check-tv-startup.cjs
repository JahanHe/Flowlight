// Run: node work/check-tv-startup.cjs. Simulated failures, not the user's physical TV.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const html=fs.readFileSync('outputs/glass-clock-tv.html','utf8');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CLOCK_CHROMIUM_PATH,headless:true});
  try {
    for(const missingObserver of [false,true]) {
      const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      if(missingObserver)await page.addInitScript(()=>{window.ResizeObserver=undefined;});
      await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fulfill({contentType:'text/html',body:html}):route.abort());
      await page.goto('http://127.0.0.1/clock');await page.waitForFunction(()=>window.clockTVReady);await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>window.clockTVDiagnostics.stage),'ready');
      const before=await page.locator('.tile').first().evaluate(node=>node.getBoundingClientRect().width);
      await page.evaluate(()=>{const input=document.getElementById('digit-size');input.value='70';input.dispatchEvent(new Event('input'));});
      const after=await page.locator('.tile').first().evaluate(node=>node.getBoundingClientRect().width);assert(after<before);
      await page.keyboard.press('Enter');assert(await page.locator('#tv-panel').isHidden());
      await page.evaluate(()=>document.querySelector('.stick-world').stickFigure.destroy());
      assert.deepEqual(errors,[]);await page.close();
    }
    // A separate ES5 preflight survives a syntax failure in the main bundle.
    const broken=await browser.newPage();let script=0;
    const damaged=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,block=>++script===2?'<script>function {</script>':block);
    await broken.setContent(damaged);
    const diagnostic=await broken.evaluate(()=>window.clockTVDiagnostics);
    assert.equal(diagnostic.stage,'script-start');assert(diagnostic.firstError.length>0);await broken.close();
    const old=await browser.newPage({userAgent:'Mozilla/5.0 Chrome/55.0.2883.91'});
    await old.setContent(html);assert.equal(await old.evaluate(()=>window.clockTVDiagnostics.stage),'unsupported');
    assert.match(await old.evaluate(()=>window.clockTVDiagnostics.reason),/55/);assert.equal(await old.evaluate(()=>!!window.clockAppReady),false);await old.close();
    const report={passed:true,checks:['normal startup reports ready','missing ResizeObserver still runs and resizes','companion cleanup without observer','main syntax failure captured by separate preflight','actual old engine reported without guessing'],scope:'desktop Chromium feature/UA/error simulation; no physical TV'};
    fs.writeFileSync('work/tv-startup-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
