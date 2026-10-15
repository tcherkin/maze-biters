import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createPairedContext, pairedContextStatus} from '../src/render/neon-context.js?v=1.02.05.00';
import {createNeonMaterial, enhancePixels, emissionPixels} from '../src/render/neon-material.js?v=1.02.05.00';

const require = createRequire(import.meta.url);
let runtime;
for (const location of [process.env.CODEX_CANVAS_PACKAGE, '@napi-rs/canvas',
  join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)) {
  try { runtime = require(location); break; } catch { /* Try the bundled native test runtime. */ }
}
if (!runtime) throw new Error('Native canvas is required; set CODEX_CANVAS_PACKAGE');
const {createCanvas} = runtime;
const tests = [];
const test = (name, run) => tests.push({name, run});
const pixels = canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
const blank = (w = 180, h = 180) => createCanvas(w, h);

function sprite(w = 160, h = 57) {
  const canvas = blank(w, h), context = canvas.getContext('2d');
  context.fillStyle = '#42b52b'; context.fillRect(4, 4, w - 8, h - 8);
  context.fillStyle = '#9bf020'; context.fillRect(8, 8, w - 16, Math.min(12, h - 16));
  context.fillStyle = '#111913'; context.fillRect(13, 24, 9, 12);
  context.fillStyle = '#f0f0f0'; context.fillRect(24, 24, 5, 8);
  context.clearRect(32, 25, 7, 10);
  return canvas;
}
function lossFactory({poll = true} = {}) {
  const surfaces = [];
  const factory = (w, h) => {
    const canvas = createCanvas(w, h), ctx = canvas.getContext('2d'), listeners = new Map();
    let lost = false;
    ctx.isContextLost = poll ? () => lost : undefined;
    canvas.addEventListener = (name, listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    };
    canvas.removeEventListener = (name, listener) => listeners.get(name)?.delete(listener);
    const emit = name => { for (const listener of listeners.get(name) || []) listener(); };
    const tracked = {
      canvas,
      lose(event = true) {
        lost = true; ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (event) emit('contextlost');
      },
      restore(event = true) { lost = false; if (event) emit('contextrestored'); },
      listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
    };
    surfaces.push(tracked); return canvas;
  };
  return {factory, surfaces};
}
function localDraw(ctx, image) {
  ctx.save();
  ctx.translate(72, 65); ctx.rotate(.35); ctx.scale(.82, .91);
  ctx.beginPath(); ctx.moveTo(-55, -35); ctx.lineTo(55, -35);
  ctx.lineTo(55, 40); ctx.lineTo(-55, 40); ctx.closePath(); ctx.clip();
  ctx.globalAlpha = .78;
  ctx.drawImage(image, 0, 0, 160, 57, -60, -21, 120, 43);
  ctx.save(); ctx.translate(0, 30); ctx.rotate(-.4);
  ctx.fillStyle = '#466688'; ctx.fillRect(-30, -5, 60, 10);
  ctx.strokeStyle = '#fce958'; ctx.lineWidth = 2; ctx.setLineDash([3, 2]);
  ctx.beginPath(); ctx.moveTo(-30, -8); ctx.lineTo(30, -8); ctx.stroke();
  ctx.restore(); ctx.restore();
}

test('paired draws preserve primary pixels and register world-space capture without copying the camera', () => {
  const image = sprite(), primary = blank(), baseline = blank(), capture = blank(), expectedCapture = blank();
  const main = primary.getContext('2d'), direct = baseline.getContext('2d');
  main.setTransform(.87, 0, 0, .87, 19, 25); direct.setTransform(.87, 0, 0, .87, 19, 25);
  const paired = createPairedContext(main, capture.getContext('2d'));
  assert.equal(paired.canvas, primary);
  assert.equal(paired.drawImage, paired.drawImage, 'method identity is stable');
  assert.equal(paired.getTransform().e, 19, 'transform reads use primary camera');
  localDraw(paired, image); localDraw(direct, image);
  localDraw(expectedCapture.getContext('2d'), image);
  assert.deepEqual(pixels(primary), pixels(baseline));
  assert.deepEqual(pixels(capture), pixels(expectedCapture));
  assert.equal(capture.getContext('2d').getTransform().e, 0, 'capture returns to its own identity');
  assert.deepEqual(pairedContextStatus(paired), {secondaryEnabled: true, failures: 0, lastError: null});
});

test('explicit setTransform, resetTransform, transforms, clips and nested save/restore mirror identically', () => {
  const primary = blank(), capture = blank(), pair = createPairedContext(primary.getContext('2d'), capture.getContext('2d'));
  pair.setTransform(1.1, .1, -.1, 1.1, 12, 16); pair.save();
  pair.transform(.9, 0, 0, .9, 1, 2); pair.beginPath(); pair.rect(10, 10, 70, 65); pair.clip();
  pair.fillStyle = '#529aef'; pair.fillRect(0, 0, 100, 100); pair.restore();
  pair.resetTransform(); pair.globalAlpha = .5; pair.fillStyle = '#af3879'; pair.fillRect(120, 110, 30, 30);
  assert.deepEqual(pixels(primary), pixels(capture));
});

test('all reads and resource creation are primary-only with their native receiver', () => {
  const names = ['getTransform', 'getLineDash', 'getImageData', 'getContextAttributes', 'measureText',
    'isPointInPath', 'isPointInStroke', 'isContextLost', 'createLinearGradient', 'createRadialGradient',
    'createConicGradient', 'createPattern', 'createImageData'];
  const token = {}, readCounts = new Map(), primary = {drawImage() {}, canvas: token};
  for (const name of names) primary[name] = function(...args) {
    assert.equal(this, primary); assert.deepEqual(args, [1, 2]);
    readCounts.set(name, (readCounts.get(name) || 0) + 1); return token;
  };
  let secondaryReads = 0;
  const secondary = new Proxy({drawImage() {}}, {get(target, key) {
    if (names.includes(key) || key === 'canvas') { secondaryReads++; throw new Error('read must not be mirrored'); }
    return Reflect.get(target, key);
  }});
  const paired = createPairedContext(primary, secondary);
  for (const name of names) assert.equal(paired[name](1, 2), token);
  assert.equal(paired.canvas, token); assert.equal(secondaryReads, 0);
  for (const name of names) assert.equal(readCounts.get(name), 1);
});

test('draw hooks retain the native argument list, receiver and primary return value', () => {
  const calls = [], primary = {drawImage() {}}, secondary = {drawImage() {}}, source = {};
  const pair = createPairedContext(primary, secondary, {
    drawImagePrimary(...args) { assert.equal(this, primary); calls.push(['primary', args]); return 42; },
    drawImageSecondary(...args) { assert.equal(this, secondary); calls.push(['secondary', args]); }
  });
  assert.equal(pair.drawImage(source, 1, 2, 3, 4), 42);
  assert.deepEqual(calls, [['primary', [source, 1, 2, 3, 4]], ['secondary', [source, 1, 2, 3, 4]]]);
});

test('secondary draw failure disables capture and leaves every primary draw identical', () => {
  const image = sprite(), primary = blank(), baseline = blank();
  let calls = 0, notifications = 0;
  const secondary = {drawImage() { calls++; throw new Error('lost capture'); }};
  const pair = createPairedContext(primary.getContext('2d'), secondary, {
    onSecondaryError() { notifications++; throw new Error('also a broken reporter'); }
  });
  for (let i = 0; i < 3; i++) {
    pair.drawImage(image, i, i * 40);
    baseline.getContext('2d').drawImage(image, i, i * 40);
  }
  pair.globalAlpha = .5;
  assert.equal(calls, 1); assert.equal(notifications, 1); assert.equal(secondary.globalAlpha, undefined);
  assert.deepEqual(pixels(primary), pixels(baseline));
  assert.deepEqual(pairedContextStatus(pair), {secondaryEnabled: false, failures: 1, lastError: 'lost capture'});
});

test('secondary setter/method lookup errors are isolated; primary exceptions still propagate normally', () => {
  let primaryDraws = 0, secondaryDraws = 0;
  const primary = {drawImage() { primaryDraws++; }};
  const secondary = {drawImage() { secondaryDraws++; }, set globalAlpha(value) { throw new Error('setter failed'); }};
  const pair = createPairedContext(primary, secondary);
  pair.globalAlpha = .3; pair.drawImage({});
  assert.equal(primary.globalAlpha, .3); assert.equal(primaryDraws, 1); assert.equal(secondaryDraws, 0);
  assert.equal(pairedContextStatus(pair).lastError, 'setter failed');
  const another = createPairedContext({drawImage() {}, save() {}}, {drawImage() {}, get save() { throw new Error('lookup failed'); }});
  another.save(); assert.equal(pairedContextStatus(another).lastError, 'lookup failed');
  const brokenPrimary = createPairedContext({drawImage() { throw new Error('primary failed'); }}, {drawImage() { secondaryDraws++; }});
  assert.throws(() => brokenPrimary.drawImage({}), /primary failed/);
  assert.equal(secondaryDraws, 0); assert.equal(pairedContextStatus(brokenPrimary).secondaryEnabled, true);
});

test('unavailable secondary during construction does not prevent the first primary draw', () => {
  let draws = 0;
  const primary = {drawImage() { draws++; }};
  const pair = createPairedContext(primary, {get drawImage() { throw new Error('context lost before frame'); }});
  pair.drawImage({}); assert.equal(draws, 1);
  assert.deepEqual(pairedContextStatus(pair), {secondaryEnabled: false, failures: 1, lastError: 'context lost before frame'});
  const primaryOnly = createPairedContext(primary, null);
  primaryOnly.drawImage({}); assert.equal(draws, 2);
  assert.deepEqual(pairedContextStatus(primaryOnly), {secondaryEnabled: false, failures: 0, lastError: null});
});

test('70% pure pixels exactly match accepted study fixture and preserve source/alpha/dark art', () => {
  const source = new Uint8ClampedArray([0,0,0,255,24,36,12,255,240,240,240,255,180,180,180,128,
    15,200,40,0,40,180,30,255,20,100,240,128,230,50,120,255,255,200,20,200]);
  const untouched = source.slice();
  const enhanced = enhancePixels(source, .7), emission = emissionPixels(source, .7);
  assert.deepEqual([...enhanced], [0,0,0,255,24,36,12,255,240,240,240,255,180,180,180,128,
    15,200,40,0,52,195,42,255,45,117,243,128,235,71,135,255,255,206,46,200]);
  assert.deepEqual([...emission], [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,53,240,40,92,21,105,252,75,250,54,130,148,255,200,20,118]);
  assert.deepEqual(source, untouched);
  for (let i = 3; i < source.length; i += 4) {
    assert.equal(enhanced[i], source[i]); assert.ok(emission[i] <= source[i]);
  }
  assert.deepEqual(enhancePixels(source, 0), source);
  assert.ok(emissionPixels(source, 0).every(v => v === 0));
});

test('prewarm uses one read/two bounded surfaces; paired material and emission never modify the sprite', () => {
  let allocations = 0;
  const factory = (w, h) => { allocations++; return createCanvas(w, h); };
  const material = createNeonMaterial({canvasFactory: factory, strength: .7});
  const image = sprite(), original = pixels(image).slice();
  const primary = blank(), emission = blank();
  material.prewarm([image]);
  const visible = material.wrapContext(primary.getContext('2d'));
  const luminous = material.wrapEmissionContext(emission.getContext('2d'));
  assert.equal(visible, material.wrapContext(primary.getContext('2d')));
  assert.equal(visible, material.wrapContext(visible));
  const paired = createPairedContext(visible, luminous);
  for (let i = 0; i < 100; i++) paired.drawImage(image, 3, 4);
  assert.deepEqual(pixels(image), original);
  assert.equal(allocations, 2); assert.equal(material.stats().pixelReads, 1);
  assert.equal(material.stats().cacheBuilds, 1); assert.equal(material.stats().cachedSprites, 1);
  assert.equal(material.stats().totalCachedBytes, 160 * 57 * 8);
  assert.ok(pixels(emission).some(v => v > 0));
  assert.notDeepEqual(pixels(primary).slice(0, 160 * 57 * 4), original);
  material.prewarm([image]); assert.equal(allocations, 2, 'repeat prewarm is cached');
});

test('mutable scratch surfaces pass through and produce no stale emission', () => {
  let allocations = 0;
  const material = createNeonMaterial({canvasFactory(w, h) { allocations++; return createCanvas(w, h); }});
  const image = sprite(256, 256), primary = blank(256, 256), emission = blank(256, 256);
  const visible = material.wrapContext(primary.getContext('2d'));
  const light = material.wrapEmissionContext(emission.getContext('2d'));
  visible.drawImage(image, 0, 0); light.drawImage(image, 0, 0);
  assert.deepEqual(pixels(primary), pixels(image)); assert.ok(pixels(emission).every(v => v === 0));
  image.getContext('2d').fillStyle = '#ff5577'; image.getContext('2d').fillRect(0, 0, 256, 256);
  visible.drawImage(image, 0, 0); assert.deepEqual(pixels(primary), pixels(image));
  assert.equal(allocations, 0); assert.equal(material.stats().pixelReads, 0);
});

test('zero strength is exact original/no emission and does not allocate', () => {
  const material = createNeonMaterial({canvasFactory() { throw new Error('must not allocate'); }, strength: 0});
  const source = sprite(), primary = blank(160, 57), emission = blank(160, 57);
  material.wrapContext(primary.getContext('2d')).drawImage(source, 0, 0);
  material.wrapEmissionContext(emission.getContext('2d')).drawImage(source, 0, 0);
  assert.deepEqual(pixels(primary), pixels(source)); assert.ok(pixels(emission).every(v => v === 0));
  assert.equal(material.stats().failures, 0); assert.equal(material.stats().pixelReads, 0);
});

test('failed cache degrades to original once, then explicit invalidation recovers', () => {
  let failing = true, allocations = 0;
  const material = createNeonMaterial({canvasFactory(w, h) {
    allocations++;
    if (failing) throw new Error('simulated unavailable cache');
    return createCanvas(w, h);
  }});
  const image = sprite(), primary = blank(160, 57), context = material.wrapContext(primary.getContext('2d'));
  context.drawImage(image, 0, 0); context.drawImage(image, 0, 0);
  assert.deepEqual(pixels(primary), pixels(image)); assert.equal(allocations, 1);
  assert.equal(material.stats().failures, 1); assert.equal(material.stats().cachedBytes, 0);
  failing = false; material.invalidate('renderer art re-prepared'); material.prewarm([image]);
  assert.equal(material.stats().cacheGeneration, 1); assert.equal(material.stats().cachedSprites, 1);
  assert.equal(material.stats().lastInvalidation, 'renderer art re-prepared');
  context.clearRect(0, 0, 160, 57); context.drawImage(image, 0, 0);
  assert.notDeepEqual(pixels(primary), pixels(image)); assert.equal(allocations, 3);
});

test('cache resource budget is bounded and repeated resets release only owned surfaces', () => {
  const surfaces = [], bytes = 160 * 57 * 8;
  const material = createNeonMaterial({maxCacheBytes: bytes * 2,
    canvasFactory(w, h) { const c = createCanvas(w, h); surfaces.push(c); return c; }});
  const sources = [sprite(), sprite(), sprite()], originals = sources.map(c => pixels(c).slice());
  material.prewarm(sources); material.prewarm(sources);
  assert.equal(material.stats().totalCachedBytes, bytes * 2);
  assert.equal(material.stats().cachedSprites, 2); assert.equal(material.stats().failures, 1);
  assert.equal(surfaces.length, 4, 'budget fallback does not attempt another allocation');
  material.reset(); assert.equal(material.stats().totalCachedBytes, 0);
  assert.ok(surfaces.every(c => c.width === 1 && c.height === 1));
  for (let i = 0; i < sources.length; i++) assert.deepEqual(pixels(sources[i]), originals[i]);
  for (let generation = 0; generation < 3; generation++) {
    material.prewarm(sources.slice(0, 2)); assert.equal(material.stats().totalCachedBytes, bytes * 2);
    material.invalidate('context recovered');
  }
  assert.equal(material.stats().cachedSprites, 0);
  assert.ok(surfaces.every(c => c.width === 1 && c.height === 1));
});

test('failed enhanced draw releases cached textures and falls back without a retry storm', () => {
  const image = sprite(), calls = [], material = createNeonMaterial({canvasFactory: createCanvas});
  const raw = {drawImage(texture, ...rects) {
    calls.push([texture, rects]);
    if (texture !== image) throw new Error('cached surface lost');
  }};
  const wrapped = material.wrapContext(raw); wrapped.drawImage(image, 1, 2); wrapped.drawImage(image, 3, 4);
  assert.equal(calls.length, 3); assert.equal(calls[1][0], image); assert.equal(calls[2][0], image);
  assert.equal(material.stats().cacheBuilds, 1); assert.equal(material.stats().cachedSprites, 0);
  assert.equal(material.stats().failures, 1); assert.equal(material.stats().totalCachedBytes, 0);
});

test('silent loss of either cached surface preserves native primary until both recover', () => {
  for (const lostIndex of [0, 1]) {
    const {factory, surfaces} = lossFactory();
    const image = sprite(), original = pixels(image).slice(), material = createNeonMaterial({canvasFactory: factory});
    const primary = blank(160, 57), emission = blank(160, 57);
    const visible = material.wrapContext(primary.getContext('2d')), luminous = material.wrapEmissionContext(emission.getContext('2d'));
    material.prewarm([image]); const bytes = material.stats().totalCachedBytes;
    surfaces[lostIndex].lose(false);
    for (let i = 0; i < 20; i++) {
      visible.clearRect(0, 0, 160, 57); luminous.clearRect(0, 0, 160, 57);
      visible.drawImage(image, 0, 0); luminous.drawImage(image, 0, 0);
      assert.deepEqual(pixels(primary), original);
      assert.ok(pixels(emission).every(v => v === 0));
    }
    assert.equal(surfaces.length, 2); assert.equal(material.stats().pixelReads, 1);
    assert.equal(material.stats().contextLosses, 1); assert.equal(material.stats().totalCachedBytes, bytes);
    surfaces[lostIndex].restore(false);
    visible.clearRect(0, 0, 160, 57); visible.drawImage(image, 0, 0); luminous.drawImage(image, 0, 0);
    assert.equal(surfaces.length, 4, 'material and emission regenerate as one pair');
    assert.equal(material.stats().pixelReads, 2); assert.equal(material.stats().contextRecoveries, 1);
    assert.equal(material.stats().totalCachedBytes, bytes);
    assert.equal(surfaces[0].listenerCount(), 0); assert.equal(surfaces[1].listenerCount(), 0);
    assert.equal(surfaces[0].canvas.width, 1); assert.equal(surfaces[1].canvas.width, 1);
    assert.notDeepEqual(pixels(primary), original); assert.ok(pixels(emission).some(v => v > 0));
    assert.deepEqual(pixels(image), original);
  }
});

test('event-only context loss waits for every lost surface and cleans listeners on reset', () => {
  const {factory, surfaces} = lossFactory({poll: false});
  const image = sprite(), material = createNeonMaterial({canvasFactory: factory});
  const primary = blank(160, 57), visible = material.wrapContext(primary.getContext('2d'));
  material.prewarm([image]);
  assert.equal(material.stats().cachedContextListeners, 4);
  surfaces[0].lose(); surfaces[1].lose();
  visible.drawImage(image, 0, 0); assert.deepEqual(pixels(primary), pixels(image));
  surfaces[0].restore(); visible.drawImage(image, 0, 0);
  assert.equal(surfaces.length, 2, 'one restored surface is insufficient');
  surfaces[1].restore(); visible.clearRect(0, 0, 160, 57); visible.drawImage(image, 0, 0);
  assert.equal(surfaces.length, 4); assert.notDeepEqual(pixels(primary), pixels(image));
  assert.equal(material.stats().cachedContextListeners, 4);
  material.reset();
  assert.equal(material.stats().cachedContextListeners, 0);
  assert.ok(surfaces.every(surface => surface.listenerCount() === 0));
  assert.equal(material.stats().totalCachedBytes, 0);
});

test('explicit invalidate also recovers an indefinitely lost cache without retaining listeners', () => {
  const {factory, surfaces} = lossFactory();
  const image = sprite(), material = createNeonMaterial({canvasFactory: factory});
  material.prewarm([image]); surfaces[0].lose();
  material.invalidate('global renderer recovery'); material.prewarm([image]);
  assert.equal(surfaces.length, 4); assert.equal(material.stats().cachedSprites, 1);
  assert.equal(material.stats().cachedContextListeners, 4);
  assert.equal(surfaces[0].listenerCount(), 0); assert.equal(surfaces[1].listenerCount(), 0);
});

test('invalid inputs fail before allocating and strength changes invalidate only when changed', () => {
  assert.throws(() => createPairedContext(null, null), /Primary/);
  assert.throws(() => createNeonMaterial({maxCacheBytes: Infinity}), /cache budget/);
  assert.throws(() => enhancePixels([1, 2, 3]), /RGBA/);
  assert.throws(() => emissionPixels([1, 2, 3, 4], NaN), /finite/);
  const material = createNeonMaterial({canvasFactory: createCanvas});
  const image = sprite(); material.prewarm([image]); material.setStrength(.7);
  assert.equal(material.stats().cacheGeneration, 0);
  material.setStrength(.5); assert.equal(material.stats().cacheGeneration, 1);
  assert.equal(material.stats().cachedBytes, 0); assert.equal(material.setStrength(-1), 0);
  assert.equal(material.setStrength(3), 2);
  assert.throws(() => material.prewarm(null), /Iterable/);
});

let failures = 0;
for (const {name, run} of tests) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`${tests.length - failures}/${tests.length} neon context/material tests passed`);
if (failures) process.exitCode = 1;
