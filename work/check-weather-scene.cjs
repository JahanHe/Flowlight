const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const events = {}, queued = new Map();
let serial = 0, draws = 0;
const gradient = { addColorStop() {} };
const ctx = new Proxy({}, { get(_, key) {
  if (key === 'createImageData') return (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) });
  if (key.startsWith('create')) return () => gradient;
  return (...args) => { args.filter(x => typeof x === 'number').forEach(x => assert.ok(Number.isFinite(x))); draws++; };
}, set() { return true; } });
const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 1200, height: 800 }) };
const document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }), hidden: false, addEventListener: (name, fn) => { events[name] = fn; } };
const motion = { matches: false, addEventListener: (_, fn) => { events.motion = fn; } };
const sandbox = { document, window: { devicePixelRatio: 3, addEventListener: (name, fn) => { events[name] = fn; } }, performance: { now: () => 5000 }, requestAnimationFrame: fn => { queued.set(++serial, fn); return serial; }, cancelAnimationFrame: id => queued.delete(id) };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'weather-scene.js'), 'utf8'), sandbox);
const scene = sandbox.createWeatherScene(canvas, motion);
assert.equal(canvas.width, 2400); assert.equal(queued.size, 1);
for (const phase of ['unknown', 'day', 'sunrise', 'sunset', 'night']) {
  for (const condition of ['clear', 'cloudy', 'overcast', 'fog', 'rain', 'snow', 'storm']) {
    for (const moonPhase of [0, .25, .5, .75, 1]) scene.setState({ phase, condition, cloudCover: .7, intensity: 1, sunProgress: .5, moonPhase, moonVisible: true, wind: 40 });
  }
}
scene.setState({ phase: 'bad', condition: 'bad', cloudCover: NaN, sunProgress: Infinity, wind: -30 });
assert.equal(queued.size, 1, 'state updates must not duplicate animation loops');
events.resize(); events.resize(); assert.equal(queued.size, 1);
document.hidden = true; events.visibilitychange(); assert.equal(queued.size, 0);
document.hidden = false; events.visibilitychange(); assert.equal(queued.size, 1);
motion.matches = true; events.motion(); assert.equal(queued.size, 0);
scene.setState({ phase: 'night' }); assert.equal(queued.size, 0);
motion.matches = false; events.motion(); assert.equal(queued.size, 1);
const [id, callback] = [...queued][0]; queued.delete(id); callback(5100); assert.equal(queued.size, 1);
assert.ok(draws > 0);
console.log('PASS: 175 scene variants, invalid values, DPR cap, single animation loop, visibility, reduced motion.');
