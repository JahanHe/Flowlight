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
  current: {time: now/1000, temperature_2m: 0, weather_code: 2, is_day: 0, cloud_cover: 50, precipitation: 0, wind_speed_10m: 3},
  hourly: {time: [-1,0,1,2,3,6,7,8].map(n => midnight + n * 3600), temperature_2m: [12,-2,0,4,7,9,11,12]},
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
    await page.goto(entry);
    await ready(page);
    await checkHours(page,[['00',-2],['01',0],['02',4]]);
    assert.match(await page.locator(strip+' .forecast-now').textContent(), /现在\s*0°/);
    assert.match(await page.locator(strip+' .forecast-tomorrow').textContent(), /明天.*阴.*-4.*6°/);
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
    assert.match(await page.locator(strip+' .forecast-tomorrow').textContent(), /明天.*晴.*-1.*11°/, 'tomorrow must roll over in the city’s time zone');

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
      delete data.current.temperature_2m;
      delete data.hourly;
      for(const key of ['weather_code','temperature_2m_min','temperature_2m_max']) delete data.daily[key];
      localStorage.setItem('floating-light-weather', JSON.stringify({data,fetchedAt:Date.now(),location:{latitude:30.26,longitude:120.13,label:'杭州',source:'city'}}));
    },meteo);
    await page.reload();
    await ready(page);
    assert(await page.locator(strip).isHidden(), 'a pre-upgrade cache must not fabricate 0°C');

    source = 'cma';
    let resume;
    supplement = new Promise(resolve => {resume=resolve;});
    await page.reload();
    await ready(page);
    await page.locator(strip+' .forecast-now').waitFor();
    assert.match(await page.locator(strip+' .forecast-now').textContent(), /13°/);
    assert.match(await page.locator(strip+' .forecast-tomorrow').textContent(), /多云.*9.*22°/);
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
      assert(await page.locator(strip+' .forecast-tomorrow').isVisible());
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
    console.log('PASS: domestic and fallback forecasts, zero and negative temperatures, city-local midnight, cache and city switches, calendar browsing, fast-forward, fullscreen, narrow layout and saved switch.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
