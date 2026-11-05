// Run: node work/check-weather-clock.cjs [http://127.0.0.1:8765/glass-clock.html]
// Uses installed Chrome/Playwright; all weather/location responses are deterministic test fixtures.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8765/glass-clock.html';
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//);
const results=[], errors=[], screenshots=[];
async function wait(page, fn, arg) {
  for(let i=0;i<150;i++){if(await page.evaluate(fn,arg))return;await new Promise(resolve=>setTimeout(resolve,40));}
  throw Error('Timed out waiting for '+String(fn));
}
const stamp = value => Date.parse(value)/1000;
let currentTime='2026-10-16T12:34:56+08:00';
const dailyStarts=Array.from({length:4},(_,i)=>stamp(`2026-10-${15+i}T00:00:00+08:00`));
function fixture(code=0, cloud=0) {
  return {current:{time:stamp(currentTime),weather_code:code,is_day:1,cloud_cover:cloud,precipitation:code>=51?3:0,wind_speed_10m:12},daily:{time:dailyStarts,
    sunrise:dailyStarts.map(d=>d+6*3600),sunset:dailyStarts.map(d=>d+18*3600),moonrise:dailyStarts.map(d=>d+17*3600),moonset:dailyStarts.map(d=>d+5*3600),moon_phase:dailyStarts.map(()=>.3)}};
}
async function check(name, fn) {
  try {await fn();results.push({name,passed:true});console.log('PASS',name);}
  catch(error){results.push({name,passed:false,error:error.message});console.error('FAIL',name,error.stack);}
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
  const contexts=[];
  try {
    async function open(options={}) {
      const context=await browser.newContext({viewport:{width:1440,height:960},timezoneId:'Asia/Shanghai',geolocation:{latitude:31.23456,longitude:121.47891},permissions:['geolocation']});contexts.push(context);
      const state={data:fixture(),fetches:[],fail:false,geocodes:0};
      await context.route('**/*',route=>{
        const target=new URL(route.request().url());
        if(target.origin===new URL(url).origin)return route.continue();
        if(target.hostname==='api.open-meteo.com'){
          state.fetches.push(target);if(state.fail)return route.abort();
          return route.fulfill({contentType:'application/json',body:JSON.stringify(state.data)});
        }
        if(target.hostname==='geocoding-api.open-meteo.com') {state.geocodes++;return route.fulfill({contentType:'application/json',body:JSON.stringify({results:[{name:'杭州',admin1:'浙江',country:'中国',latitude:30.2741,longitude:120.1551}]})});}
        return route.abort();
      });
      await context.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){return get.call(this,type,type==='2d'?{...options,willReadFrequently:true}:options);};});
      if(options.denied)await context.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success,failure){queueMicrotask(()=>failure({code:1}));}}}));
      if(options.noStorage)await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage disabled','SecurityError');}}));
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.clock.install({time:new Date(currentTime)});
      await page.clock.pauseAt(new Date(Date.parse(currentTime)+1000));await page.clock.setSystemTime(new Date(currentTime));await page.goto(url);
      await wait(page,()=>document.body.dataset.phase==='day');
      return {page,state,context};
    }
    const main=await open(), {page,state,context}=main;
    const digits=()=>page.locator('.static.top .numeral').allTextContents();
    const setTime=async value=>{currentTime=value;await page.clock.setSystemTime(new Date(value));await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));};
    const refresh=async(code,cloud=0)=>{
      state.data=fixture(code,cloud);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
      await wait(page,expected=>{try{return JSON.parse(localStorage.getItem('floating-light-weather')).data.current.weather_code===expected && !document.querySelector('#weather-status').textContent.includes('正在');}catch{return false;}},code);
    };
    const signature=()=>page.locator('#weather-canvas').evaluate(canvas=>{const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let hash=2166136261;for(let i=0;i<d.length;i+=97)hash=Math.imul(hash^d[i],16777619);return hash>>>0;});
    const shot=async name=>{const filename=path.join(__dirname,`weather-${name}.png`);await page.screenshot({path:filename,animations:'disabled'});screenshots.push(filename);return filename;};

    await check('clock/date/weekday/flip/seconds persist and midnight updates',async()=>{
      assert.deepEqual(await digits(),['12','34','56']);assert.equal(await page.locator('#date').getAttribute('datetime'),'2026-10-16');assert.equal(await page.locator('#weekday').textContent(),'星期五');
      await page.clock.runFor(1020);assert.deepEqual(await digits(),['12','34','57']);assert.equal(await page.locator('[data-unit="seconds"]').evaluate(el=>el.classList.contains('flipping')),true);
      assert.deepEqual(await page.locator('[data-unit="seconds"] .numeral').allTextContents(),['57','56','56','57']);await page.clock.runFor(750);assert.equal(await page.locator('.flipping').count(),0);
      await page.locator('#show-seconds').uncheck();assert.equal(await page.locator('#seconds-cluster').isHidden(),true);assert.doesNotMatch(await page.locator('#clock-description').textContent(),/秒/);
      await page.reload();await wait(page,()=>document.body.dataset.phase==='day');assert.equal(await page.locator('#show-seconds').isChecked(),false);await page.locator('#show-seconds').check();
      for(const [before,after,weekday]of[['2026-10-31T23:59:59+08:00','2026-11-01','星期日'],['2026-12-31T23:59:59+08:00','2027-01-01','星期五'],['2028-02-28T23:59:59+08:00','2028-02-29','星期二']]){
        await setTime(before);await page.clock.runFor(1020);assert.deepEqual(await digits(),['00','00','00']);assert.equal(await page.locator('#date').getAttribute('datetime'),after);assert.equal(await page.locator('#weekday').textContent(),weekday);
      }
      await setTime('2026-10-16T12:34:56+08:00');await refresh(0);
    });

    await check('all WMO codes map to weather scenes; rain/snow/storm/fog animate',async()=>{
      const groups={clear:[0,1],cloudy:[2],overcast:[3],fog:[45,48],rain:[51,53,55,56,57,61,63,65,66,67,80,81,82],snow:[71,73,75,77,85,86],storm:[95,96,97,99]};
      for(const [kind,codes]of Object.entries(groups))for(const code of codes){await refresh(code,kind==='clear'?0:80);assert.equal(await page.locator('body').getAttribute('data-weather'),kind);}
      for(const [code,kind]of [[63,'rain'],[73,'snow'],[95,'storm'],[45,'fog']]){
        await refresh(code,85);const before=await signature();await page.clock.runFor(500);assert.notEqual(await signature(),before,`${kind} canvas did not animate`);
        if(kind==='rain')await shot('rain');
      }
      await refresh(95,85);await page.clock.runFor(1100);const stormOnly=await signature();await refresh(96,85);await page.clock.runFor(1100);assert.notEqual(await signature(),stormOnly,'hail particles missing for code 96');await refresh(99,85);await page.clock.runFor(1100);assert.notEqual(await signature(),stormOnly,'hail particles missing for code 99');
      await refresh(0);await shot('daytime');
    });

    await check('sunrise/sunset/night and glass light direction follow actual event times',async()=>{
      const light=[];
      for(const [time,phase]of [['06:00','sunrise'],['08:00','day'],['16:00','day'],['18:00','sunset'],['22:00','night']]){
        await setTime(`2026-10-16T${time}:00+08:00`);await refresh(0);assert.equal(await page.locator('body').getAttribute('data-phase'),phase);
        if(phase==='day')light.push(await page.locator('[data-unit="hours"]').evaluate(el=>[el.style.getPropertyValue('--digit-x'),el.style.getPropertyValue('--light-angle')]));
      }
      assert.notDeepEqual(light[0],light[1]);assert.notEqual(light[0][1],light[1][1]);await shot('night');
      state.data=fixture(0);state.data.daily.sunrise=dailyStarts.slice();state.data.daily.sunset=dailyStarts.slice();state.data.current.is_day=0;
      await page.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(page,()=>document.body.dataset.phase==='night');
      state.data.current.is_day=1;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(page,()=>document.body.dataset.phase==='day');
      await setTime('2026-10-16T12:34:56+08:00');await refresh(0);
    });

    await check('10 minute weather refresh, rounded location, failure and stale cache are explicit',async()=>{
      const first=state.fetches[0];assert.equal(first.searchParams.get('latitude'),'30.26');assert.equal(first.searchParams.get('longitude'),'120.13');assert.equal(first.searchParams.get('timeformat'),'unixtime');
      await page.locator('#locate').click();await wait(page,()=>JSON.parse(localStorage.getItem('floating-light-weather')).location.source==='device');
      assert.equal(state.fetches.at(-1).searchParams.get('latitude'),'31.23');assert.equal(state.fetches.at(-1).searchParams.get('longitude'),'121.48');
      let count=state.fetches.length;await page.clock.fastForward(599000);assert.equal(state.fetches.length,count);
      await page.clock.fastForward(1100);await wait(page,()=>!document.querySelector('#weather-status').textContent.includes('正在'));assert.equal(state.fetches.length,count+1);
      state.fail=true;await page.clock.fastForward(600100);await wait(page,()=>document.querySelector('#weather-status').textContent.includes('无法更新'));assert.match(await page.locator('#weather-status').textContent(),/离线晴天/);
      await page.clock.fastForward(601000);assert.match(await page.locator('#weather-age').textContent(),/已过期/);
      await page.reload();await wait(page,()=>document.querySelector('#weather-status').textContent.includes('无法更新'));assert.match(await page.locator('#weather-age').textContent(),/已过期/);
      state.fail=false;await setTime('2026-10-16T12:34:56+08:00');await refresh(0);
    });

    await check('fullscreen exposes only date/time and forbids editing; double click restores controls',async()=>{
      await page.locator('#fullscreen').click();await wait(page,()=>!!document.fullscreenElement && document.body.classList.contains('is-fullscreen'));
      assert.equal(await page.locator('#date').isVisible(),true);assert.equal(await page.locator('.clock').isVisible(),true);
      assert.equal(await page.locator('.editor-only').evaluateAll(els=>els.every(el=>getComputedStyle(el).display==='none'&&el.inert)),true);
      const visibleText=await page.evaluate(()=>{const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const text=[];while(walker.nextNode()){const n=walker.currentNode,p=n.parentElement;if(!n.textContent.trim()||['SCRIPT','STYLE'].includes(p.tagName)||p.closest('.sr-only'))continue;const r=document.createRange();r.selectNodeContents(n);if([...r.getClientRects()].some(rect=>rect.width&&rect.height)&&getComputedStyle(p).visibility!=='hidden')text.push(n.textContent.trim());}return text;});
      assert.ok(visibleText.every(text=>/^\d{2}$/.test(text)||/^\d{4}年\d{1,2}月\d{1,2}日$/.test(text)||/^星期[一二三四五六日]$/.test(text)),visibleText.join(' | '));
      const before=await page.locator('#show-seconds').isChecked();await page.locator('#show-seconds').evaluate(el=>{el.checked=!el.checked;el.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(await page.locator('#show-seconds').isChecked(),before);
      await page.locator('#city-toggle').evaluate(el=>el.click());assert.equal(await page.locator('#city-form').isHidden(),true);
      await shot('fullscreen');await page.locator('.clock').dblclick();await wait(page,()=>!document.fullscreenElement&&!document.body.classList.contains('is-fullscreen'));assert.equal(await page.locator('#show-seconds').isVisible(),true);assert.equal(await page.locator('.settings').evaluate(el=>el.inert),false);
    });

    await check('mobile/landscape fit; black frame; reduced motion stops effects and flips',async()=>{
      for(const [width,height]of [[320,600],[390,844],[844,390],[768,600],[1440,960]])for(const seconds of [true,false]){
        await page.setViewportSize({width,height});await page.locator('#show-seconds').setChecked(seconds,{force:true});
        const box=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,rect:document.querySelector('.clock').getBoundingClientRect().toJSON()}));assert.ok(box.scroll<=width,`${width}x${height}: horizontal scroll ${box.scroll}`);assert.ok(box.rect.left>=-1&&box.rect.right<=width+1,`${width}x${height}: clock offscreen`);
      }
      await page.setViewportSize({width:1440,height:960});await page.locator('#show-seconds').check();await refresh(63,80);await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())));await page.evaluate(()=>{window.__motionChanged=false;matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>window.__motionChanged=true,{once:true});});await page.emulateMedia({reducedMotion:'reduce'});await wait(page,()=>window.__motionChanged);const before=await signature();await page.clock.runFor(1100);assert.equal(await signature(),before);assert.equal(await page.locator('.flipping').count(),0);
      await page.emulateMedia({reducedMotion:'no-preference'});
      const python='from PIL import Image\nimport sys\nfor p in sys.argv[1:]:\n im=Image.open(p).convert("RGB");w,h=im.size\n for x,y in [(0,0),(w//2,0),(w-1,0),(0,h//2),(w-1,h//2),(0,h-1),(w//2,h-1),(w-1,h-1)]:\n  assert im.getpixel((x,y))==(0,0,0),(p,x,y,im.getpixel((x,y)))\nprint("All outer-edge samples are pure black")';
      assert.match(execFileSync('python3',['-c',python,...screenshots],{encoding:'utf8'}),/pure black/);
    });

    await check('denied location has honest fallback; city search refreshes; no-storage clock survives',async()=>{
      const denied=await open({denied:true});assert.equal(await denied.page.locator('body').getAttribute('data-phase'),'day');assert.match(await denied.page.locator('#weather-status').textContent(),/杭州.*西湖区/);
      await denied.page.locator('#locate').click();await wait(denied.page,()=>!document.querySelector('#notice').hidden&&document.querySelector('#notice').textContent.includes('定位未获允许'));await denied.page.clock.runFor(1000);assert.equal(await denied.page.locator('#notice').isVisible(),true);
      await denied.page.locator('#city-toggle').click();assert.equal(await denied.page.locator('#city-form').isVisible(),true);
      await denied.page.locator('#city-name').fill('杭州');await denied.page.locator('#city-form').evaluate(form=>form.requestSubmit());await denied.page.locator('.city-result').filter({hasText:'西湖区'}).click();await wait(denied.page,()=>document.body.dataset.phase==='day'&&!document.querySelector('#weather-status').textContent.includes('正在'));assert.match(await denied.page.locator('#weather-status').textContent(),/杭州/);assert.equal(denied.state.fetches.at(-1).searchParams.get('latitude'),'30.26');
      const count=denied.state.fetches.length;await denied.page.clock.fastForward(600100);await wait(denied.page,()=>!document.querySelector('#weather-status').textContent.includes('正在'));assert.equal(denied.state.fetches.length,count+1);
      const isolated=await open({noStorage:true});assert.deepEqual(await isolated.page.locator('.static.top .numeral').allTextContents(),['12','34','56']);await isolated.page.locator('#show-seconds').uncheck();assert.equal(await isolated.page.locator('#seconds-cluster').isHidden(),true);
    });
    await check('no browser script errors',async()=>assert.deepEqual(errors,[]));
    const report={passed:results.filter(r=>r.passed).length,total:results.length,results,screenshots,note:'Browser tests use mocked weather/geolocation on localhost; live weather service availability and real location permissions are separate checks.'};
    fs.writeFileSync(path.join(__dirname,'weather-check-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=results.some(r=>!r.passed)?1:0;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
