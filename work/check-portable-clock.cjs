// Run from the project root. Test the distributed ZIP via file://, without a server.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const source=fs.readFileSync('outputs/glass-clock.html','utf8'),version=source.match(/name="clock-mobile-version" content="([\d.]+)"/)[1];
 const name=`浮光时钟-通用版-${version}`,temporary=fs.mkdtempSync(path.join(os.tmpdir(),'浮光 portable '));
 let browser;
 try {
  const unpack=spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),['-m','zipfile','-e',`outputs/${name}.zip`,temporary],{encoding:'utf8'});assert.equal(unpack.status,0,unpack.stderr);
  const entry=path.join(temporary,name,'浮光时钟.html'),html=fs.readFileSync(entry,'utf8');
  assert.deepEqual([...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),'portable packaging must preserve runtime scripts');
  assert(!/\/Users\/|127\.0\.0\.1|localhost/.test(html));
  assert(html.includes('id="font-licenses"')&&html.includes('id="solar-license"'));
  browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
  const context=await browser.newContext({viewport:{width:1440,height:900},offline:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(entry).href);await page.waitForFunction(()=>window.clockAppReady===true);
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.edition-label').textContent(),`通用网页版 ${version}`);
  const resources=await page.evaluate(()=>[...document.querySelectorAll('[src],[srcset],link[href]')].map(e=>e.getAttribute('src')||e.getAttribute('srcset')||e.getAttribute('href')).filter(v=>v&&!v.startsWith('data:')));assert.deepEqual(resources,[]);
  const fonts=await page.evaluate(async()=>{
   const families=[...document.querySelectorAll('#digit-font option[data-family]')].map(e=>JSON.parse(e.dataset.family.split(',')[0]));
   const loaded=await Promise.all(families.map(f=>document.fonts.load(`400 80px "${f}"`,'0123456789')));
   return loaded.map((rows,i)=>({family:families[i],loaded:rows.length>0&&rows.every(f=>f.status==='loaded')}));
  });assert.equal(fonts.length,8);assert(fonts.every(f=>f.loaded));
  await page.waitForFunction(()=>document.querySelector('#weather-status').textContent.includes('离线晴天'));
  assert(await page.locator('#date').textContent());
  await page.locator('[data-tab="display"]').click();
  await page.locator('#show-seconds').uncheck();
  assert(await page.locator('#demo-appearance-settings').isVisible());
  await page.locator('#digit-size').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#digit-size').inputValue(),'71');
  await page.locator('[data-mode="calendar"]').click();
  await page.reload();await page.waitForFunction(()=>window.clockAppReady===true);
  assert.equal(await page.locator('#show-seconds').isChecked(),false);
  assert.equal(await page.locator('#digit-size').inputValue(),'71');
  assert.equal(await page.locator('[data-mode="calendar"]').getAttribute('aria-pressed'),'true');
  const movements=[];
  await page.locator('[data-tab="display"]').click();
  if(!await page.locator('#demo-motion-settings').evaluate(el=>el.open))await page.locator('#demo-motion-settings > summary').click();
  for(const id of ['noon','night']){
   await page.locator(`[data-preview="${id}"]`).click();await page.waitForTimeout(600);
   const before=await page.locator('#weather-canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(1400);
   assert.notEqual(await page.locator('#weather-canvas').evaluate(c=>c.toDataURL()),before,id+' background must move offline');movements.push(id);
  }
  await page.locator('#fullscreen').click();
  await page.waitForFunction(()=>document.body.classList.contains('is-fullscreen'));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.body.classList.contains('is-fullscreen'));
  assert.deepEqual(errors,[]);
  const report={pass:true,version,browser:browser.version(),platform:process.platform,entryProtocol:'file:',offline:true,extractedFromZip:true,fonts,movements,settingsPersist:true,fullscreenExit:true,scriptErrors:errors,htmlSha256:crypto.createHash('sha256').update(html).digest('hex'),scope:'Desktop Chromium via file:// on the reported host platform.'};
  fs.writeFileSync('work/portable-clock-verification.json',JSON.stringify(report,null,2));
  console.log('PASS: extracted ZIP opens via file:// offline; eight fonts, day/night motion, saved settings and fullscreen exit.');
 } finally {if(browser)await browser.close();fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
