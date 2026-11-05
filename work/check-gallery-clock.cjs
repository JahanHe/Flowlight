// Run: node work/check-gallery-clock.cjs http://127.0.0.1:8765/glass-clock.html
// Deterministic browser checks; remote weather/location are fixtures.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8765/glass-clock.html';
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//);
const results = [], errors = [], screenshots = [];
const fixedTime = '2026-10-16T12:34:56+08:00';
const stamp = value => Date.parse(value) / 1000;
const dailyStarts = Array.from({length: 4}, (_, i) => stamp(`2026-10-${15+i}T00:00:00+08:00`));
function fixture(code = 0, cloud = 0) {
  return {current: {time: stamp(fixedTime), weather_code: code, is_day: 1, cloud_cover: cloud, precipitation: code >= 51 ? 3 : 0, wind_speed_10m: 12}, daily: {time: dailyStarts,
    sunrise: dailyStarts.map(d => d + 6*3600), sunset: dailyStarts.map(d => d + 18*3600), moonrise: dailyStarts.map(d => d + 17*3600), moonset: dailyStarts.map(d => d + 5*3600), moon_phase: dailyStarts.map(() => .3)}};
}
async function wait(page, fn, arg) {
  for(let i=0; i<150; i++) {if(await page.evaluate(fn, arg)) return; await new Promise(resolve => setTimeout(resolve, 40));}
  throw Error('Timed out waiting for ' + String(fn));
}
async function check(name, fn) {
  try {await fn(); results.push({name, passed: true}); console.log('PASS', name);}
  catch(error) {results.push({name, passed: false, error: error.message}); console.error('FAIL', name, error.stack);}
}
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CLOCK_CHROMIUM_PATH, args:['--enable-unsafe-swiftshader']});
  try {
    const context = await browser.newContext({viewport: {width:1440, height:960}, timezoneId:'Asia/Shanghai', geolocation:{latitude:31.23456,longitude:121.47891}, permissions:['geolocation']});
    const state = {data:fixture(), fetches:[], fail:false};
    await context.route('**/*', route => {
      const target = new URL(route.request().url());
      if(target.origin === new URL(url).origin) return route.continue();
      if(target.hostname === 'api.open-meteo.com') {
        state.fetches.push(target); if(state.fail) return route.abort();
        return route.fulfill({contentType:'application/json', body:JSON.stringify(state.data)});
      }
      return route.abort();
    });
    await context.addInitScript(() => {
      window.__glassAudit = {weatherTextureUploads:0, weatherReadbacks:0, weatherDraws:0, canvasCopies:0};
      for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
        for (const method of ['texImage2D', 'texSubImage2D']) {
          const original = type.prototype[method];
          type.prototype[method] = function(...args) {
            if(args.some(arg => arg instanceof HTMLCanvasElement && arg.id === 'weather-canvas')) window.__glassAudit.weatherTextureUploads++;
            return original.apply(this,args);
          };
        }
      }
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(source,...args) {
        if(source instanceof HTMLCanvasElement) window.__glassAudit.canvasCopies++;
        if(source instanceof HTMLCanvasElement && source.id === 'weather-canvas') window.__glassAudit.weatherDraws++;
        return draw.call(this,source,...args);
      };
      const read = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        if(this.canvas.id === 'weather-canvas') window.__glassAudit.weatherReadbacks++;
        return read.apply(this,args);
      };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({time:new Date(fixedTime)});
    await page.clock.pauseAt(new Date(Date.parse(fixedTime)+1000));
    await page.clock.setSystemTime(new Date(fixedTime));
    await page.goto(url);
    await wait(page, () => document.body.dataset.phase === 'day');
    const digits = () => page.locator('.static.top .numeral').allTextContents();
    const signature = selector => page.locator(selector).evaluate(canvas => {
      const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let hash=2166136261, nonzero=0, opaque=0;
      for(let i=0;i<d.length;i+=4) {if(d[i+3]) nonzero++; if(d[i+3]===255) opaque++;}
      for(let i=0;i<d.length;i+=97) hash=Math.imul(hash^d[i],16777619);
      return {hash:hash>>>0, coverage:nonzero/(d.length/4), opaque:opaque/(d.length/4)};
    });
    const shot=async name=>{const filename=path.join(__dirname,`gallery-${name}.png`);await page.screenshot({path:filename,animations:'disabled'});screenshots.push(filename);};


    const select = async id => {
      if(await page.locator('#weather-gallery').isHidden()) await page.locator('#weather-browse').click();
      await page.locator(`.preview-option[data-preview="${id}"]`).click();
      await page.clock.runFor(80);
      assert.equal(await page.locator('body').getAttribute('data-preview'),id);
    };
    const returnLive = async () => {
      if(await page.locator('#weather-gallery').isHidden()) await page.locator('#weather-browse').click();
      await page.locator('#weather-gallery [data-return-live]').click();
      assert.equal(await page.locator('body').getAttribute('data-preview'),'live');
    };
    const currentDigits = () => page.evaluate(() => {const now=new Date();return [now.getHours(),now.getMinutes(),now.getSeconds()].map(value=>String(value).padStart(2,'0'));});
    const sceneSpecs = [
      ['sunrise','日出','sunrise','clear'],['noon','正午晴天','day','clear'],['sunset','日落','sunset','clear'],['night','星空月夜','night','clear'],
      ['cloudy','多云','day','cloudy'],['cloudy-night','多云月夜','night','cloudy'],['overcast','阴天','day','overcast'],['fog','雾','day','fog'],
      ['drizzle','毛毛雨','day','rain'],['rain','下雨','day','rain'],['downpour','暴雨','day','rain'],['freezing-rain','冻雨','night','rain'],
      ['snow','飘雪','day','snow'],['blizzard','暴雪','day','snow'],['storm','雷雨','day','storm'],['hail','雷雨冰雹','day','storm'],
      ['polar-day','极昼巡游','day','clear'],['polar-night','极夜星河','night','clear']
    ];
    await check('all 18 weather previews are labeled, selectable, distinct, and preserve live clock',async()=>{
      assert.match(await page.locator('#weather-status').textContent(),/杭州.*西湖区/);
      assert.equal(await page.locator('#weather-gallery').isHidden(),true);
      await page.locator('#weather-browse').click();
      assert.equal(await page.locator('#weather-browse').getAttribute('aria-expanded'),'true');
      assert.equal(await page.locator('.preview-option').count(),sceneSpecs.length);
      const requests=state.fetches.length, cache=await page.evaluate(()=>localStorage.getItem('floating-light-weather'));
      const hashes=[];
      for(const [id,label,phase,condition] of sceneSpecs) {
        await select(id);
        assert.equal(await page.locator('body').getAttribute('data-phase'),phase);
        assert.equal(await page.locator('body').getAttribute('data-weather'),condition);
        assert.match(await page.locator('#preview-name').textContent(),new RegExp(`效果预览.*${label}`));
        assert.equal(await page.locator(`.preview-option[data-preview="${id}"]`).getAttribute('aria-pressed'),'true');
        assert.equal(await page.locator('.preview-option[aria-pressed="true"]').count(),1);
        assert.equal(await page.locator('#weather-status').isHidden(),true);
        assert.deepEqual(await digits(),await currentDigits());
        assert.equal(await page.locator('#date').getAttribute('datetime'),'2026-10-16');
        assert.equal(await page.locator('#weekday').textContent(),'星期五');
        await page.clock.runFor(1100); // Wait for the one-second weather crossfade.
        hashes.push((await signature('#weather-canvas')).hash);
      }
      assert.equal(new Set(hashes).size,sceneSpecs.length);
      assert.equal(state.fetches.length,requests);
      assert.equal(await page.evaluate(()=>localStorage.getItem('floating-light-weather')),cache);
      await page.locator('#gallery-close').click();
      assert.equal(await page.locator('#weather-gallery').isHidden(),true);
      assert.equal(await page.locator('#preview-mode').isVisible(),true);
      await page.locator('#preview-mode [data-return-live]').click();
      assert.equal(await page.locator('body').getAttribute('data-preview'),'live');
      assert.equal(await page.locator('#preview-mode').isHidden(),true);
      assert.equal(await page.locator('#weather-status').isVisible(),true);
    });

    await check('glass digits sample actual weather pixels with transparent glyph boundaries and dynamic refraction',async()=>{
      await select('noon');
      await wait(page,()=>document.documentElement.classList.contains('glass-digits-ready'));
      const audit=await page.evaluate(()=>window.__glassAudit);
      assert.ok(audit.weatherTextureUploads>0 || audit.weatherDraws>0,'No actual weather canvas sampling');
      assert.equal(await page.locator('.static.top .glass-numeral').count(),3);
      const selector='[data-unit="hours"] .static.top .glass-numeral';
      const daylight=await signature(selector);
      assert.ok(daylight.coverage>.015 && daylight.coverage<.75,JSON.stringify(daylight));
      const style=await page.locator('[data-unit="hours"]').evaluate(el=>{const s=getComputedStyle(el);return {background:s.background,filter:s.backdropFilter};});
      assert.equal(style.filter,'none');assert.match(style.background,/rgba\(0, 0, 0, 0\)/);
      await select('night');const night=await signature(selector);
      assert.notEqual(daylight.hash,night.hash,'Digits do not react to day/night pixels');
      await select('rain');const before=await signature(selector);await page.clock.runFor(380);const after=await signature(selector);
      assert.notEqual(before.hash,after.hash,'Weather motion does not change refracted digits');
      await page.locator('#gallery-close').click();await shot('glass-rain');
      await returnLive();await page.locator('#gallery-close').click();
    });

    await check('automatic gallery cycles all scenes and stops for native fullscreen; hidden controls cannot edit',async()=>{
      await page.locator('#weather-browse').click();await page.locator('#preview-play').click();
      const visited=new Set([await page.locator('body').getAttribute('data-preview')]);
      for(let i=1;i<sceneSpecs.length;i++){await page.clock.fastForward(5000);visited.add(await page.locator('body').getAttribute('data-preview'));}
      assert.equal(visited.size,sceneSpecs.length);
      await page.locator('#gallery-close').click();await page.locator('#fullscreen').click();
      await wait(page,()=>!!document.fullscreenElement && document.body.classList.contains('is-fullscreen'));
      const preview=await page.locator('body').getAttribute('data-preview');
      assert.equal(await page.locator('#preview-play').getAttribute('aria-pressed'),'false');
      await page.clock.fastForward(11000);assert.equal(await page.locator('body').getAttribute('data-preview'),preview);
      assert.equal(await page.locator('.editor-only').evaluateAll(els=>els.every(el=>getComputedStyle(el).display==='none' && el.inert)),true);
      assert.equal(await page.locator('#date').isVisible(),true);assert.equal(await page.locator('.clock').isVisible(),true);
      const seconds=await page.locator('#show-seconds').isChecked();
      await page.locator('#show-seconds').evaluate(el=>{el.checked=!el.checked;el.dispatchEvent(new Event('change',{bubbles:true}));});
      assert.equal(await page.locator('#show-seconds').isChecked(),seconds);
      await page.locator('.preview-option[data-preview="noon"]').evaluate(el=>el.click());
      await page.locator('#preview-play').evaluate(el=>el.click());
      await page.locator('#weather-gallery [data-return-live]').evaluate(el=>el.click());
      assert.equal(await page.locator('body').getAttribute('data-preview'),preview);
      assert.equal(await page.locator('#preview-play').getAttribute('aria-pressed'),'false');
      const visibleText=await page.evaluate(()=>{const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),text=[];while(walker.nextNode()){const n=walker.currentNode,p=n.parentElement;if(!n.textContent.trim()||['SCRIPT','STYLE'].includes(p.tagName)||p.closest('.sr-only'))continue;const r=document.createRange();r.selectNodeContents(n);if([...r.getClientRects()].some(rect=>rect.width&&rect.height)&&getComputedStyle(p).visibility!=='hidden')text.push(n.textContent.trim());}return text;});
      assert.ok(visibleText.every(text=>/^\d{2}$/.test(text)||/^\d{4}年\d{1,2}月\d{1,2}日$/.test(text)||/^星期[一二三四五六日]$/.test(text)),visibleText.join(' | '));
      await shot('fullscreen');
      await page.locator('body').dblclick({position:{x:20,y:20}});
      await wait(page,()=>!document.fullscreenElement&&!document.body.classList.contains('is-fullscreen'));
      assert.equal(await page.locator('#weather-browse').isVisible(),true);
      await returnLive();await page.locator('#gallery-close').click();
    });

    await check('10 minute live update survives preview and returning live uses the latest real weather',async()=>{
      state.data=fixture(0);await page.reload();await wait(page,()=>document.body.dataset.phase==='day');
      assert.equal(state.fetches.at(-1).searchParams.get('latitude'),'30.26');assert.equal(state.fetches.at(-1).searchParams.get('longitude'),'120.13');
      await select('night');await page.locator('#gallery-close').click();
      state.data=fixture(63,85);const count=state.fetches.length;
      await page.clock.fastForward(598000);assert.equal(state.fetches.length,count);
      await page.clock.fastForward(2100);await wait(page,()=>JSON.parse(localStorage.getItem('floating-light-weather')).data.current.weather_code===63);
      assert.equal(state.fetches.length,count+1);
      assert.equal(await page.locator('body').getAttribute('data-preview'),'night');assert.equal(await page.locator('body').getAttribute('data-phase'),'night');
      await page.locator('#preview-mode [data-return-live]').click();
      assert.equal(await page.locator('body').getAttribute('data-preview'),'live');assert.equal(await page.locator('body').getAttribute('data-weather'),'rain');
      assert.equal(await page.locator('body').getAttribute('data-phase'),'day');assert.match(await page.locator('#weather-status').textContent(),/降雨/);
      await select('sunset');await page.reload();await wait(page,()=>document.body.dataset.preview==='live');
      assert.equal(await page.locator('#preview-mode').isHidden(),true);
    });

    await check('mobile and iPad portrait/landscape layouts fit; immersive fallback locks controls and exits on blank double tap',async()=>{
      for(const [width,height] of [[320,600],[390,844],[844,390],[768,1024],[1024,768],[1440,960]]) {
        await page.setViewportSize({width,height});
        for(const seconds of [true,false]) {
          await page.locator('#show-seconds').setChecked(seconds,{force:true});
          const box=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,clock:document.querySelector('.clock').getBoundingClientRect().toJSON()}));
          assert.ok(box.scroll<=width,`${width}x${height}: horizontal scroll ${box.scroll}`);
          assert.ok(box.clock.left>=-1 && box.clock.right<=width+1,`${width}x${height}: clock outside viewport`);
        }
        await page.locator('#weather-browse').click();
        const gallery=await page.locator('#weather-gallery').boundingBox();
        // Editor panels flow below the clock; small phones can scroll without covering the time.
        const clockBox=await page.locator('.clock').boundingBox();
        assert.ok(gallery.x>=0 && gallery.x+gallery.width<=width+1,`${width}x${height}: gallery exceeds viewport width`);
        assert.ok(gallery.y>=clockBox.y+clockBox.height,`${width}x${height}: gallery covers clock`);
        await page.locator('#gallery-close').click();
      }
      await page.evaluate(()=>{document.documentElement.requestFullscreen=undefined;document.documentElement.webkitRequestFullscreen=undefined;});
      for(const [width,height] of [[768,1024],[1024,768]]) {
        await page.setViewportSize({width,height});await page.locator('#fullscreen').click();
        assert.equal(await page.evaluate(()=>document.fullscreenElement),null);
        assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('is-fullscreen')),true);
        assert.equal(await page.locator('.editor-only').evaluateAll(els=>els.every(el=>getComputedStyle(el).display==='none' && el.inert)),true);
        const before=await page.locator('#show-seconds').isChecked();
        await page.locator('#show-seconds').evaluate(el=>{el.checked=!el.checked;el.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(await page.locator('#show-seconds').isChecked(),before);
        await page.locator('body').dblclick({position:{x:20,y:20}});assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('is-fullscreen')),false);
      }
      await page.setViewportSize({width:1440,height:960});await page.locator('#show-seconds').check();
    });

    await check('no browser script errors',async()=>assert.deepEqual(errors,[]));


    const report = {passed:results.filter(r=>r.passed).length,total:results.length,results,screenshots,note:'Deterministic localhost checks with weather fixtures; visual quality and live weather service checked separately.'};
    fs.writeFileSync(path.join(__dirname,'gallery-check-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
    process.exitCode=results.some(r=>!r.passed)?1:0;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
