// Run: node work/check-clock.cjs [http://127.0.0.1:8765/glass-clock.html]
// Requires the local preview server and the already-installed Playwright/Chrome.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8765/glass-clock.html';
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//);
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, passed:true }); console.log('PASS', name); }
  catch (error) { results.push({ name, passed:false, error:error.message }); console.error('FAIL', name, error.message); }
}

(async () => {
  const browser = await chromium.launch({ headless:true, executablePath:process.env.CLOCK_CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ viewport:{width:1440,height:1000} });
    const external = [], errors = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId:'Asia/Shanghai' });
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time:new Date('2026-10-16T12:34:55+08:00') });
    await page.goto(url);
    await page.clock.pauseAt(new Date('2026-10-16T12:34:56+08:00'));
    const refresh = () => page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    const setTime = async time => { await page.clock.setSystemTime(new Date(time)); await refresh(); };
    const digits = () => page.locator('.static.top .numeral').allTextContents();
    await refresh();
    await context.setOffline(true);

    await check('initial date, weekday, time and offline timer', async () => {
      assert.deepEqual(await digits(), ['12','34','56']);
      assert.equal(await page.locator('#date').getAttribute('datetime'), '2026-10-16');
      assert.equal(await page.locator('#weekday').textContent(), '星期五');
      await page.clock.runFor(1020);
      assert.deepEqual(await digits(), ['12','34','57']);
      assert.deepEqual(external, []);
    });

    await check('flip uses old/new half faces and settles', async () => {
      await setTime('2026-10-16T12:34:56+08:00');
      await page.clock.runFor(1020);
      const tile = page.locator('[data-unit="seconds"]');
      assert.equal(await tile.evaluate(el => el.classList.contains('flipping')), true);
      assert.deepEqual(await tile.locator('.numeral').allTextContents(), ['57','56','56','57']);
      await page.clock.runFor(750);
      assert.equal(await tile.evaluate(el => el.classList.contains('flipping')), false);
      assert.deepEqual(await tile.locator('.numeral').allTextContents(), ['57','57','57','57']);
    });

    await check('seconds checkbox and theme persist after reload', async () => {
      await page.locator('#show-seconds').uncheck({ force:true });
      assert.equal(await page.locator('#seconds-cluster').isHidden(), true);
      assert.match(await page.locator('body').getAttribute('class'), /seconds-hidden/);
      assert.doesNotMatch(await page.locator('#clock-description').textContent(), /秒/);
      await page.locator('[data-theme="night"].theme-button').click({ force:true });
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'night');
      await context.setOffline(false);
      await page.reload();
      await context.setOffline(true);
      assert.equal(await page.locator('#show-seconds').isChecked(), false);
      assert.equal(await page.locator('#seconds-cluster').isHidden(), true);
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'night');
      await page.locator('#show-seconds').check({ force:true });
      assert.equal(await page.locator('#seconds-cluster').isVisible(), true);
      assert.match(await page.locator('#clock-description').textContent(), /秒/);
    });

    await check('midnight month, year and leap day change date and weekday', async () => {
      for (const [before, after, day] of [
        ['2026-10-31T23:59:59+08:00','2026-11-01','星期日'],
        ['2026-12-31T23:59:59+08:00','2027-01-01','星期五'],
        ['2028-02-28T23:59:59+08:00','2028-02-29','星期二']
      ]) {
        await setTime(before); await page.clock.runFor(1020);
        assert.equal(await page.locator('#date').getAttribute('datetime'), after);
        assert.equal(await page.locator('#weekday').textContent(), day);
        assert.deepEqual(await digits(), ['00','00','00']);
      }
    });

    await check('system timezone changes update time, date, weekday and UTC offset', async () => {
      await setTime('2026-10-16T00:30:00+08:00');
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId:'America/Los_Angeles' });
      await refresh();
      assert.deepEqual(await digits(), ['09','30','00']);
      assert.equal(await page.locator('#date').getAttribute('datetime'), '2026-10-15');
      assert.equal(await page.locator('#date').textContent(), '2026年10月15日');
      assert.equal(await page.locator('#weekday').textContent(), '星期四');
      assert.equal(await page.locator('#timezone').textContent(), '本地时间 · UTC−07:00');
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId:'Asia/Shanghai' });
      await refresh();
    });

    await check('reduced motion settles digits without animation', async () => {
      await page.emulateMedia({ reducedMotion:'reduce' });
      await setTime('2026-10-16T12:34:56+08:00');
      await page.clock.runFor(1020);
      assert.equal(await page.locator('.flipping').count(), 0);
      assert.deepEqual(await page.locator('[data-unit="seconds"] .numeral').allTextContents(), ['57','57','57','57']);
      await page.emulateMedia({ reducedMotion:'no-preference' });
    });

    await check('mobile and desktop layouts fit with seconds on or off', async () => {
      for (const width of [320,390,641,768,1440]) {
        for (const height of [600,900]) {
          for (const seconds of [true,false]) {
            await page.setViewportSize({ width,height });
            await page.locator('#show-seconds').setChecked(seconds, { force:true });
            const size = await page.evaluate(() => ({ scroll:document.documentElement.scrollWidth, viewport:innerWidth, clock:document.querySelector('.clock').getBoundingClientRect().toJSON() }));
            assert.ok(size.scroll <= size.viewport, `${width}x${height}, seconds=${seconds}: scrollWidth=${size.scroll}`);
            assert.ok(size.clock.left >= -1 && size.clock.right <= width+1, `${width}x${height}, seconds=${seconds}: clock edges ${size.clock.left}, ${size.clock.right}`);
          }
        }
      }
    });

    await check('checkbox keyboard interaction', async () => {
      await page.locator('#show-seconds').check({ force:true });
      await page.locator('#show-seconds').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#show-seconds').isChecked(), false);
      assert.equal(await page.locator('#seconds-cluster').isHidden(), true);
    });

    await check('fullscreen enters and exits when supported', async () => {
      if (!(await page.evaluate(() => document.fullscreenEnabled))) throw new Error('Fullscreen unsupported by this test browser');
      await page.locator('#fullscreen').click({ force:true });
      await page.waitForFunction(() => Boolean(document.fullscreenElement) && document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'true', null, { polling:100,timeout:3000 });
      assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'), 'true');
      await page.locator('#fullscreen').click({ force:true });
      await page.waitForFunction(() => !document.fullscreenElement && document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'false', null, { polling:100,timeout:3000 });
      assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'), 'false');
    });

    await check('storage denial keeps clock and settings functional', async () => {
      const isolated = await browser.newContext({ timezoneId:'Asia/Shanghai' });
      await isolated.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage disabled','SecurityError'); } }));
      const blocked = await isolated.newPage();
      blocked.on('pageerror', error => errors.push(error.message));
      await blocked.clock.setFixedTime(new Date('2026-10-16T08:09:10+08:00'));
      await blocked.goto(url);
      await isolated.setOffline(true);
      assert.deepEqual(await blocked.locator('.static.top .numeral').allTextContents(), ['08','09','10']);
      await blocked.locator('#show-seconds').uncheck();
      assert.equal(await blocked.locator('#seconds-cluster').isHidden(), true);
      await blocked.locator('[data-theme="sky"].theme-button').click();
      assert.equal(await blocked.locator('html').getAttribute('data-theme'), 'sky');
      await isolated.close();
    });
    await check('no external requests or browser script errors', async () => {
      assert.deepEqual(external, []); assert.deepEqual(errors, []);
    });
    await page.setViewportSize({ width:1440,height:960 });
    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.locator('#show-seconds').check({ force:true });
    await page.locator('[data-theme="warm"].theme-button').click({ force:true });
    await setTime('2026-10-16T14:28:36+08:00');
    await page.screenshot({ path:require('node:path').join(__dirname,'../outputs/glass-clock-preview.png'), fullPage:true, animations:'disabled' });
    console.log(JSON.stringify({ passed:results.filter(r=>r.passed).length, total:results.length, results, note:'Browser tests use a localhost preview with offline mode after loading; file:// opening is not browser-verified.' }, null, 2));
    process.exitCode = results.some(r=>!r.passed) ? 1 : 0;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
