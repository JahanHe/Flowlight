// Exercise real clock-face markup and network parsers. Device time is UTC, Hangzhou weather is UTC+8.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const entry = pathToFileURL(path.resolve(process.env.CLOCK_HTML || 'outputs/glass-clock.html')).href;
const now = Date.parse('2026-11-27T23:30:00+08:00');
const midnight = Date.parse('2026-11-28T00:00:00+08:00') / 1000;
const days = [-2,-1,0,1].map(n => midnight + n * 86400);
const meteo = {
  timezone: 'Asia/Shanghai', utc_offset_seconds: 28800,
  current: {time: now/1000, temperature_2m: 0, weather_code: 2, is_day: 0, cloud_cover: 50, precipitation: 0, wind_speed_10m: 14,
    apparent_temperature: -3, relative_humidity_2m: 68, wind_direction_10m: 45, uv_index: 0},
  hourly: {time: [-1,0,1,2,3,6,7,8].map(n => midnight + n * 3600), temperature_2m: [12,-2,0,4,7,9,11,12],
    apparent_temperature: [-2,-4,-7,4,7,9,11,12], precipitation_probability: [0,80,65,0,0,0,0,0],
    precipitation: [0,1,0.3,0,0,0,0,0], weather_code: [2,80,61,2,2,2,2,2], uv_index: [0,0,0,0,0,0,0,0]},
  daily: {time: days, sunrise: days.map(d => d+22000), sunset: days.map(d => d+62500),
    moonrise: days.map(() => null), moonset: days.map(() => null), moon_phase: days.map(() => null),
    weather_code: [2,2,3,0], temperature_2m_min: [6,5,-4,-1], temperature_2m_max: [19,18,6,11]}
};
const cma = JSON.parse(fs.readFileSync('work/references/cma-hangzhou-live.json'));
cma.data.lastUpdate = '2026/11/27 23:20';
cma.data.now.temperature = 13;
cma.data.daily = days.map((day,i) => ({...cma.data.daily[0], date: new Date((day+28800)*1000).toISOString().slice(0,10).replaceAll('-','/'),
  high: 20+i, low: 7+i, dayCode: 1, nightCode: 1, dayText: '多云', nightText: '多云'}));
const strip = '#demo-forecast';
const toggle = '#demo-show-forecast';
const header = {'Access-Control-Allow-Origin': '*'};
const ready = page => page.waitForFunction(() => window.clockAppReady && window.clockCalendarReady);
async function assertGeometry(page) {
  const visible = await page.locator(strip + ' .forecast-hour').evaluateAll(nodes => nodes.every(node => {
    const r = node.getBoundingClientRect(), clock = document.querySelector('#clock-stage .clock').getBoundingClientRect();
    return r.width > 0 && r.left >= -1 && r.right <= innerWidth+1 && r.bottom <= clock.top+1;
  }));
  assert(visible, 'hourly temperatures must stay inside the viewport and clear of the clock');
}
async function checkHours(page, expected) {
  const hours = page.locator(strip + ' .forecast-hour');
  await hours.nth(2).waitFor();
  const text = await hours.allTextContents();
  assert.equal(text.length, expected.length);
  expected.forEach(([hour,temperature],i) => {
    assert.match(text[i], new RegExp('^\\s*'+hour+'(?:时|:00)\\s*'+temperature+'°'), 'wrong local hour or temperature: '+text[i]);
  });
}

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CLOCK_CHROMIUM_PATH});
  const errors = [];
  try {
    const context = await browser.newContext({viewport:{width:360,height:740}, timezoneId:'UTC', reducedMotion:'reduce'});
    const page = await context.newPage();
    page.on('pageerror',err => errors.push(err.message));
    let source = 'meteo', supplement;
    await page.clock.setFixedTime(new Date(now));
    await page.route(/^https?:/, async route => {
      const url = new URL(route.request().url());
      if(source === 'cma' && url.hostname === 'weather.cma.cn' && url.pathname.includes('/view'))
        return route.fulfill({json:cma,headers:header});
      if(source !== 'offline' && url.hostname === 'api.open-meteo.com'){
        if(supplement === false) return route.abort();
        if(supplement) await supplement;
        return route.fulfill({json:meteo,headers:header});
      }
      return route.abort();
    });
    // A returning user has a custom daily quote from version 1.5 with no layout preference yet.
    await context.addInitScript(() => {
      if(!localStorage.getItem('floating-light-calendar'))
        localStorage.setItem('floating-light-calendar',JSON.stringify({mode:'quote',quoteKind:'custom',custom:'来自旧版本的句子'}));
    });
    await page.goto(entry);
    await ready(page);
    const stage = page.locator('#clock-stage');
    const lower = stage.locator('.demo-quote');
    const tomorrow = stage.locator('.forecast-tomorrow:visible');
    const upper = stage.locator(strip);
    const selectFooter = mode => page.locator('[data-mode="'+mode+'"]').click();
    const publicWeather = async () => {
      await page.reload();
      await ready(page);
      await page.waitForFunction(() => window.clockForecast?.cached === false && !window.clockForecast.hoursCached);
      await upper.locator('.forecast-now').waitFor();
    };
    assert.equal(await lower.locator('p').innerText(),'来自旧版本的句子');
    await upper.locator('.forecast-now').waitFor();
    for(const [name,expected] of [
      ['now',/0°/],['feels',/-3°/],['wind',/东北风.*3\s*级/],
      ['humidity',/68%/],['uv',/0/],['rain',/无雨|未下雨/]
    ]) assert.match(await upper.locator('.forecast-'+name).innerText(),expected);
    await page.locator('[data-tab="display"]').click();
    assert.equal(await page.locator('#demo-forecast-style').inputValue(),'trend');
    await selectFooter('advice');
    const advice = lower.locator('.forecast-advice');
    assert.match(await advice.innerText(),/雨|带伞/);
    assert.match(await advice.innerText(),/降|转冷|变冷/);
    assert.equal(await stage.locator('.forecast-advice:visible').count(),1);
    assert.equal(await tomorrow.count(),1);
    assert.equal(await lower.locator('.forecast-tomorrow:visible').count(),1);
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => document.body.classList.contains('is-fullscreen'));
    for(const [width,height] of [[360,740],[740,360]]){
      await page.setViewportSize({width,height});
      await page.waitForFunction(() => {
        const top=document.querySelector('#demo-forecast').getBoundingClientRect();
        const clock=document.querySelector('#clock-stage .clock').getBoundingClientRect();
        const advice=document.querySelector('.demo-quote .forecast-advice').getBoundingClientRect();
        const tomorrow=document.querySelector('.demo-quote .forecast-tomorrow').getBoundingClientRect();
        return top.width>0 && advice.height>0 && tomorrow.height>0 && top.left>=-1 &&
          top.right<=innerWidth+1 && top.bottom<=clock.top+1 && advice.top>=clock.bottom-1 &&
          advice.left>=-1 && advice.right<=innerWidth+1 && tomorrow.bottom<=innerHeight+1;
      },null,{timeout:5000});
    }
    await page.setViewportSize({width:360,height:740});
    await publicWeather();
    assert(await advice.isVisible(),'advice selection persists across relaunch');
    await page.locator('[data-tab="display"]').click();
    await selectFooter('calendar');
    assert(await lower.isHidden(),'blank choice leaves space below the clock empty');
    assert.equal(await tomorrow.count(),1);
    await page.locator('#demo-pure-clock').check();
    assert(await upper.isHidden() && await lower.isHidden() && !(await tomorrow.count()));
    await page.locator('#demo-pure-clock').uncheck();
    await selectFooter('quote');
    assert.equal(await lower.locator('p').innerText(),'来自旧版本的句子');

    // A rainstorm in the third upcoming hourly slot is outside our two-hour window.
    const savedHourly = structuredClone(meteo.hourly);
    meteo.hourly.precipitation_probability = [0,25,10,100,0,0,0,0];
    meteo.hourly.precipitation = [0,0,0,10,0,0,0,0];
    meteo.hourly.weather_code = [2,2,2,95,2,2,2,2];
    await publicWeather();
    await page.locator('[data-tab="display"]').click();
    await selectFooter('advice');
    assert.match(await advice.innerText(),/小概率降雨/);
    assert.doesNotMatch(await advice.innerText(),/有阵雨|带.{0,2}伞|雷雨/);
    meteo.current.precipitation = 3;
    meteo.current.weather_code = 63;
    await publicWeather();
    assert.match(await upper.locator('.forecast-rain').innerText(),/雨/);
    assert.doesNotMatch(await upper.locator('.forecast-rain').innerText(),/无雨/);
    meteo.current.precipitation = 0;
    meteo.current.weather_code = 2;
    meteo.current.relative_humidity_2m = 0;
    meteo.current.precipitation = null;
    delete meteo.hourly.precipitation_probability;
    delete meteo.hourly.precipitation;
    delete meteo.hourly.weather_code;
    await publicWeather();
    assert.match(await upper.locator('.forecast-rain').innerText(), /雨况暂无/,'missing current rainfall is not dry weather');
    assert.match(await upper.locator('.forecast-humidity').innerText(), /0%/,'zero humidity is a known value');
    assert.doesNotMatch(await advice.innerText(),/无雨|不用带伞|无需带伞|降雨可能性低|雨势将停/,'missing short-range rain must not be presented as dry');
    meteo.current.relative_humidity_2m = 68;
    meteo.current.precipitation = 0;
    meteo.hourly = savedHourly;
    await publicWeather();
    await page.locator('[data-tab="display"]').click();
    await selectFooter('quote');
    await page.locator('#demo-forecast-style').selectOption('hourly');
    await page.locator('[data-tab="calendar"]').click();
    await checkHours(page,[['00',-2],['01',0],['02',4]]);
    assert.match(await page.locator(strip+' .forecast-now').textContent(), /现在\s*0°/);
    assert.match(await tomorrow.textContent(), /明天.*阴.*-4.*6°/);
    await assertGeometry(page);

    await page.locator('[data-day="2026-11-26"]').click();
    assert(await page.locator(strip).isHidden(), 'another calendar day must not carry today’s live forecast');
    await page.locator('#demo-today').click();
    await page.locator('[data-tab="display"]').click();
    assert(await page.locator(toggle).isChecked());
    await page.locator(toggle).uncheck();
    assert(await page.locator(strip).isHidden());
    await page.reload();
    await ready(page);
    await page.locator('[data-tab="display"]').click();
    assert(!(await page.locator(toggle).isChecked()), 'forecast preference should survive reload');
    await page.locator(toggle).check();
    await checkHours(page,[['00',-2],['01',0],['02',4]]);
    const before = await page.locator(strip).innerText();
    await page.locator('#demo-motion-settings > summary').click();
    await page.locator('#day-cycle').click();
    assert.equal(await page.locator('#day-cycle').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator(strip).innerText(), before, 'simulated time must not move the forecast');
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => document.body.classList.contains('is-fullscreen'));
    await assertGeometry(page);

    source = 'offline';
    await page.clock.setFixedTime(new Date((midnight + 120)*1000));
    await page.reload();
    await ready(page);
    await page.locator(strip+' .forecast-cache').waitFor();
    await checkHours(page,[['01',0],['02',4],['03',7]]);
    assert.match(await tomorrow.textContent(), /明天.*晴.*-1.*11°/, 'tomorrow must roll over in the city’s time zone');

    await page.locator('[data-tab="display"]').click();
    await page.locator('#city-toggle').click();
    await page.locator('#city-name').fill('北京');
    await page.locator('#city-name').press('Enter');
    await page.locator('#city-results .city-result').first().click();
    await page.waitForFunction(() => document.querySelector('#weather-status').textContent.includes('北京'));
    assert(await page.locator(strip).isHidden(), 'a failed lookup for another city must clear the previous city');
    await page.reload();
    await ready(page);
    assert(await page.locator(strip).isHidden(), 'reopening after a failed city change must not resurrect the previous location');

    await page.clock.setFixedTime(new Date(now));
    await page.evaluate(data => {
      for(const key of ['temperature_2m','apparent_temperature','uv_index','relative_humidity_2m','wind_direction_10m'])delete data.current[key];
      delete data.hourly;
      for(const key of ['weather_code','temperature_2m_min','temperature_2m_max']) delete data.daily[key];
      localStorage.setItem('floating-light-weather', JSON.stringify({data,fetchedAt:Date.now(),location:{latitude:30.26,longitude:120.13,label:'杭州',source:'city'}}));
    },meteo);
    await page.reload();
    await ready(page);
    assert.equal(await upper.locator('.forecast-now, .forecast-feels, .forecast-uv, .forecast-humidity').count(),0,'a pre-upgrade cache must not fabricate zero-valued measurements');

    source = 'cma';
    let resume;
    supplement = new Promise(resolve => {resume=resolve;});
    await page.reload();
    await ready(page);
    await page.locator(strip+' .forecast-now').waitFor();
    assert.match(await page.locator(strip+' .forecast-now').textContent(), /13°/);
    assert.match(await tomorrow.textContent(), /多云.*9.*22°/);
    assert.equal(await page.locator(strip+' .forecast-hour').count(),0);
    resume();
    await checkHours(page,[['00',-2],['01',0],['02',4]]);
    assert.match(await page.locator(strip+' .forecast-now').textContent(), /13°/, 'hourly fallback must preserve the CMA observation');
    supplement = false;
    for(const [minutes,wall,temp] of [[20,'2026/11/27 23:50',14],[360,'2026/11/28 05:30',15]]){
      cma.data.lastUpdate = wall;
      cma.data.now.temperature = temp;
      await page.clock.setFixedTime(new Date(now + minutes*60000));
      await Promise.all([
        page.waitForEvent('requestfailed', req => req.url().includes('api.open-meteo.com')),
        page.evaluate(() => window.dispatchEvent(new Event('online')))
      ]);
      await page.locator(strip+' .forecast-now').filter({hasText:temp+'°C'}).waitFor();
      assert(await tomorrow.isVisible());
      if(minutes === 20){
        await checkHours(page,[['00',-2],['01',0],['02',4]]);
        assert.equal(await page.locator(strip+' .forecast-cache').innerText(),'逐时缓存');
      } else {
        assert.equal(await page.locator(strip+' .forecast-hour').count(),0, 'six-hour-old hourly data must expire even with future slots and a fresh CMA observation');
        assert.equal(await page.locator(strip+' .forecast-cache').count(),0);
      }
    }
    source = 'offline';
    await page.clock.setFixedTime(new Date(now + 12*3600000));
    await page.reload();
    await ready(page);
    assert(await page.locator(strip).isHidden(), 'six-hour-old weather must not appear as current');
    assert.deepEqual(errors,[]);
    console.log('PASS: domestic and fallback forecasts, zero and negative temperatures, city-local midnight, cache and city switches, calendar browsing, fast-forward, fullscreen, narrow layout, real conditions, two-hour clothing/rain advice, footer migration and saved switches.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
