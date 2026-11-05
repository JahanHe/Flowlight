function createWeatherScene(canvas, reducedMotion, onPaint = () => {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setState() {}, setClockBounds() {} };
  let state = { phase: 'unknown', condition: 'clear', cloudCover: 0, intensity: 0, sunProgress: .5, moonPhase: .5, moonVisible: true, wind: 0 };
  let w = 1, h = 1, frame = 0, lastPaint = 0, clockBounds = null;
  const clamp = (n, low = 0, high = 1) => Math.min(high, Math.max(low, Number.isFinite(n) ? n : low));
  const still = () => typeof reducedMotion === 'boolean' ? reducedMotion : !!reducedMotion?.matches;
  // ponytail: seeded particles keep one dependency-free scene stable across weather refreshes.
  let seed = 4207;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const stars = Array.from({ length: 175 }, () => ({ x: random(), y: random() * .76, r: .4 + random() * 1.1, phase: random() * 6.28 }));
  const particles = Array.from({ length: 210 }, () => ({ x: random(), y: random(), r: .4 + random() * 1.8, speed: .5 + random(), phase: random() * 6.28 }));
  const clouds = Array.from({ length: 15 }, () => ({ x: random(), y: .09 + random() * .57, r: .11 + random() * .13, speed: .6 + random(), phase: random() * 6.28 }));
  function glow(x, y, rx, ry, color, opacity = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `rgba(${color},${opacity})`);
    gradient.addColorStop(.38, `rgba(${color},${opacity * .45})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gradient; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
  }
  function moon(x, y, r, t) {
    const breath = Math.sin(t * .38);
    glow(x, y, r * (6 + breath * .4), r * (6 - breath * .25), '166,197,231', .23 + breath * .045);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#17202c'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    if (state.moonPhase > .5) ctx.scale(-1, 1);
    const k = -Math.cos(state.moonPhase * Math.PI * 2);
    ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.ellipse(0, 0, Math.max(.001, Math.abs(k) * r), r, 0, Math.PI / 2, Math.PI * 1.5, k < 0);
    ctx.closePath();
    const light = ctx.createLinearGradient(-r, -r, r, r);
    light.addColorStop(0, '#c1d0dc'); light.addColorStop(.55, '#edf0e8'); light.addColorStop(1, '#879caf');
    ctx.fillStyle = light; ctx.fill(); ctx.clip();
    [[.25, -.2, .18], [-.28, .3, .22], [.3, .4, .11], [-.15, -.52, .13]].forEach(([a, b, c]) => glow(a * r, b * r, c * r, c * r, '66,85,106', .18));
    ctx.restore();
  }
  function paintWeather(time) {
    const t = still() ? 20 : time / 1000;
    const night = state.phase === 'night';
    const edge = state.phase === 'sunrise' || state.phase === 'sunset';
    const storm = state.condition === 'storm';
    const wet = state.condition === 'rain' || storm;
    const snow = state.condition === 'snow';
    const fog = state.condition === 'fog';
    const cover = state.cloudCover;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    if (state.phase === 'unknown') {
      glow(w * (.5 + Math.sin(t * .11) * .035), h * (.45 + Math.cos(t * .09) * .02), w * .48, h * .48, '55,73,90', .3 + Math.sin(t * .37) * .045);
      glow(w * (.35 + Math.sin(t * .07) * .1), h * .43, w * .3, h * .14, '80,103,126', .12 + Math.sin(t * .4) * .025);
      return;
    }
    const breath = night ? .92 + Math.sin(t * .44) * .08 : .94 + Math.sin(t * .38) * .06;
    const atmosphere = night ? '37,60,99' : edge ? '187,94,47' : storm ? '61,75,96' : '74,137,180';
    glow(w * (.53 + Math.sin(t * .07) * .012), h * .39, w * .59, h * .62, atmosphere, (night ? .62 : .76) * breath);
    glow(w * (.5 + Math.sin(t * .09 + 1) * .024), h * .67, w * .43, h * .29, night ? '44,47,81' : edge ? '166,82,72' : '105,152,169', (night ? .22 : .28) * (1.06 - Math.sin(t * .29) * .06));
    if (edge) {
      glow(w * .66, h * .37, w * .39, h * .24, state.phase === 'sunrise' ? '255,175,96' : '227,125,81', .38);
      glow(w * .29, h * .27, w * .29, h * .32, '110,77,129', .28);
    }
    if (night) {
      for (const star of stars) {
        const twinkle = .67 + .26 * Math.sin(t * .55 + star.phase);
        ctx.fillStyle = `rgba(213,228,246,${twinkle * (1 - cover * .74)})`;
        const x = (star.x + Math.sin(t * .14 + star.phase) * .0025) * w;
        const y = (star.y + Math.cos(t * .11 + star.phase) * .0015) * h;
        ctx.beginPath(); ctx.arc(x, y, star.r, 0, Math.PI * 2); ctx.fill();
        if (star.r > 1.35) glow(x, y, star.r * 4, star.r * 4, '163,191,230', twinkle * .11 * (1 - cover));
      }
      if (state.moonVisible) moon(w * .76, h * .23, Math.max(15, Math.min(w, h) * .043), t);
    } else {
      const x = w * (.16 + .68 * state.sunProgress);
      const y = h * (.72 - .53 * Math.sin(state.sunProgress * Math.PI));
      const r = Math.max(24, Math.min(w, h) * .07);
      const tint = edge ? '255,177,97' : '255,226,168';
      glow(x, y, r * (7.7 + Math.sin(t * .38) * .35), r * 6.5, tint, (.36 + Math.sin(t * .38) * .065) * (1 - cover * .6));
      if (state.sunVisible !== false) {
        // Soft moving shafts have no hard triangle edges, and keep the sun at the shared light-source position.
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(h * .56 - y, w * .5 - x));
        const reach = Math.min(w, h) * .78;
        glow(reach * .4, Math.sin(t * .11) * h * .018, reach * .75, h * .16, tint, .075 * (1 - cover * .75) * breath);
        glow(reach * .72, Math.sin(t * .09 + 1) * h * .027, reach * .63, h * .11, tint, .055 * (1 - cover * .75) * (2 - breath));
        ctx.restore();
      }
      if (state.sunVisible !== false) {
      glow(x, y, r * (2.25 + Math.sin(t * .38) * .08), r * (2.25 + Math.sin(t * .38) * .08), tint, .35 + Math.sin(t * .38) * .045);
      const sun = ctx.createRadialGradient(x - r * .25, y - r * .3, 0, x, y, r);
      sun.addColorStop(0, '#fff8df'); sun.addColorStop(.82, edge ? '#ffd795' : '#fff0c4'); sun.addColorStop(1, edge ? '#efa265' : '#ffde98');
      ctx.globalAlpha = 1 - cover * .78; ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    const cloudAmount = Math.max(cover, .16);
    if (cloudAmount > .02) {
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i];
        const drift = t * (.0018 + clamp(state.wind, 0, 100) * .000035) * cloud.speed;
        const x = ((cloud.x + drift) % 1.6 - .3) * w;
        const y = (cloud.y + Math.sin(t * .025 + cloud.phase) * .014) * h;
        const rx = w * cloud.r, ry = h * (.045 + cloud.r * .23);
        glow(x, y, rx * 1.3, ry * 1.8, night ? '8,14,24' : storm ? '22,31,45' : '35,55,72', cloudAmount * .62);
        glow(x - rx * .12, y - ry * .24, rx, ry, night ? '67,79,103' : edge ? '176,143,130' : '174,191,196', cloudAmount * (night ? .25 : .32));
      }
      if (cover > .65) glow(w * .65, h * .23, w * .45, h * .3, night ? '10,16,25' : '43,58,71', (cover - .65) * 1.4);
    }
    if (fog) {
      for (let i = 0; i < 6; i++) {
        const x = w * (.45 + Math.sin(t * .025 + i * 1.6) * .22);
        glow(x, h * (.28 + i * .09), w * .48, h * .1, night ? '97,116,138' : '176,186,183', .11 + state.intensity * .04);
      }
    }
    if (wet || snow) {
      const count = Math.round((snow ? 110 : 70) + state.intensity * (snow ? 70 : 130));
      const wind = Math.min(state.wind, 70) * .0009;
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        const velocity = snow ? .028 * p.speed : .42 * p.speed;
        const x = ((p.x + t * (snow ? .007 + wind * .12 : .04 + wind) + (snow ? Math.sin(t * .4 + p.phase) * .018 : 0)) % 1.2 - .1) * w;
        const y = ((p.y + t * velocity) % 1.2 - .1) * h;
        if (snow || (state.hail && i % 3 === 0)) {
          ctx.fillStyle = `rgba(229,239,246,${.24 + p.r * .19})`;
          ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
        } else {
          const length = (10 + p.speed * 13) * (h / 800 + .4);
          ctx.strokeStyle = `rgba(184,209,227,${.12 + p.r * .055})`; ctx.lineWidth = .5 + p.r * .25;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + length * (.2 + wind * 4), y + length); ctx.stroke();
        }
      }
    }
    if (storm && !still()) {
      // ponytail: one broad, soft cloud glow per 19 seconds avoids flashing lightning.
      const cycle = t % 19;
      if (cycle < 1.8) glow(w * .62, h * .25, w * .43, h * .32, '174,189,221', Math.sin(cycle / 1.8 * Math.PI) ** 2 * .18);
    }
  }
  function protectClock() {
    if (!clockBounds) return;
    const { x, y, width, height } = clockBounds;
    // ponytail: one feathered veil quiets every weather layer together; glass digits sample this same protected scene.
    ctx.save(); ctx.translate(x + width / 2, y + height / 2); ctx.scale(width * .7 + 30, height * .95 + 25);
    const veil = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    veil.addColorStop(0, 'rgba(0,0,0,.46)'); veil.addColorStop(.48, 'rgba(0,0,0,.44)'); veil.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = veil; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
  }
  function paint(time) { paintWeather(time); protectClock(); onPaint(); }
  function schedule() { if (!frame && !document.hidden && !still()) frame = requestAnimationFrame(animate); }
  function animate(time) {
    frame = 0;
    if (document.hidden || still()) return;
    if (time - lastPaint >= 1000 / 30) { paint(time); lastPaint = time; }
    schedule();
  }
  function resize() {
    const box = canvas.getBoundingClientRect();
    w = Math.max(1, box.width); h = Math.max(1, box.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); paint(performance.now()); schedule();
  }
  function resume() {
    cancelAnimationFrame(frame); frame = 0;
    if (!document.hidden) { paint(performance.now()); schedule(); }
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', resume);
  if (typeof reducedMotion?.addEventListener === 'function') reducedMotion.addEventListener('change', resume);
  resize();
  return { setClockBounds(rect) {
    const box = canvas.getBoundingClientRect();
    const next = rect && [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0
      ? { x: rect.left - (box.left || 0), y: rect.top - (box.top || 0), width: rect.width, height: rect.height } : null;
    if (next && clockBounds && ['x','y','width','height'].every(key => Math.abs(next[key] - clockBounds[key]) < .5)) return;
    if (!next && !clockBounds) return;
    clockBounds = next;
    if (!document.hidden) paint(performance.now());
  }, setState(next) {
    state = { ...state, ...next };
    if (!['unknown', 'day', 'sunrise', 'sunset', 'night'].includes(state.phase)) state.phase = 'unknown';
    if (!['clear', 'cloudy', 'overcast', 'fog', 'rain', 'snow', 'storm'].includes(state.condition)) state.condition = 'clear';
    for (const key of ['cloudCover', 'intensity', 'sunProgress', 'moonPhase']) state[key] = clamp(state[key]);
    state.wind = clamp(state.wind, 0, 200);
    if (!document.hidden) paint(performance.now());
    schedule();
  } };
}
