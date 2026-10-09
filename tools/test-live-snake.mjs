import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLiveSnakeRenderer, makeLiveSnakePath, liveSnakePulse, snakePalette} from '../src/render/live-snake.js';
import {createNativeSnakePalette} from '../src/render/snake-palette.js';

const require = createRequire(import.meta.url);
let runtime;
for (const location of [process.env.CODEX_CANVAS_PACKAGE, '@napi-rs/canvas',
  join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)) {
  try { runtime = require(location); break; } catch {}
}
if (!runtime) throw Error('Native Canvas is required; set CODEX_CANVAS_PACKAGE to its package directory.');
const {createCanvas, Image, loadImage} = runtime;
const near = (a, b, tolerance = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const copy = value => JSON.parse(JSON.stringify(value));
const snapshot = value => JSON.stringify(value);
let pathChecks = 0, pulseChecks = 0, drawChecks = 0;

for (const cells of [
  [{x: 1, y: 2}, {x: 2, y: 2}, {x: 3, y: 2}],
  [{x: 1, y: 2}, {x: 2, y: 2}, {x: 2, y: 3}, {x: 3, y: 3}],
  [{x: 1, y: 2}, {x: 2, y: 2}, {x: 2, y: 3}, {x: 1, y: 3}],
  [{x: 2, y: 2}]
]) {
  const original = snapshot(cells), path = makeLiveSnakePath(cells), out = {};
  assert.ok(path.total > 0); assert.equal(snapshot(cells), original);
  for (let i = 0; i <= 400; i++) {
    const s = path.total * i / 400, p = path.sample(s, out);
    assert.equal(p, out); near(Math.hypot(p.tx, p.ty), 1);
    assert.ok([p.x, p.y, p.angle, p.curve].every(Number.isFinite));
    const a = path.sample(s - .0001), b = path.sample(s + .0001);
    near(Math.hypot(b.x - a.x, b.y - a.y) / .0002, 1, 1e-6);
    assert.ok(Math.abs(p.curve) * 12.825 / 2 < 1, 'the body ribbon inner edge does not fold');
    pathChecks++;
  }
  for (const p of path.pieces.filter(piece => piece.type === 'arc')) {
    near(p.radius, 18); near(p.length, Math.PI * 9);
    const start = path.sample(p.start - .00001), end = path.sample(p.start + .00001);
    assert.ok(Math.abs(start.tx - end.tx) < 1e-5 && Math.abs(start.ty - end.ty) < 1e-5);
  }
}
for (const length of [36.365625, 72, 144, 252, 396]) for (const backwards of [false, true]) {
  let previousHead = -Infinity, previousTail = backwards ? Infinity : -Infinity;
  for (let i = 0; i <= 1000; i++) {
    const p = liveSnakePulse(i / 1000, length, backwards), head = (backwards ? -36 : 36) * p.progress;
    const tail = head - length + p.compression;
    assert.ok(p.progress >= previousHead - 1e-9); previousHead = p.progress;
    assert.ok(backwards ? tail <= previousTail + 1e-8 : tail >= previousTail - 1e-8);
    previousTail = tail; assert.ok(p.compression >= -1e-8 && p.compression <= 16);
    if (i === 0 || i === 1000) near(p.compression, 0);
    pulseChecks++;
  }
}
assert.deepEqual(['#35e55b', '#66c2ff', '#d66bff', '#ff8873', '#ffe57a'].map(snakePalette),
  ['Green', 'Blue', 'Pink', 'Orange', 'Yellow']);

let canvases = 0, reads = 0;
const preparedCanvases = [];
const oldDocument = globalThis.document, oldImage = globalThis.Image;
globalThis.document = {createElement(tag) {
  assert.equal(tag, 'canvas'); canvases++;
  const c = createCanvas(1, 1), ctx = c.getContext('2d'), read = ctx.getImageData.bind(ctx);
  preparedCanvases.push(c);
  ctx.getImageData = (...args) => { reads++; return read(...args); };
  return c;
}};
// Skia's bundled decoder rejects the optional C2PA caBX metadata in the two
// authored PNGs. Browsers accept it. Drop that ancillary chunk in the TEST
// loader only; IHDR/IDAT pixels, source files, and production loader are intact.
function nativePng(value) {
  const bytes = readFileSync(fileURLToPath(value)), chunks = [bytes.subarray(0, 8)];
  for (let p = 8; p < bytes.length;) {
    const n = bytes.readUInt32BE(p), kind = bytes.toString('ascii', p + 4, p + 8);
    if (kind !== 'caBX') chunks.push(bytes.subarray(p, p + n + 12));
    p += n + 12;
  }
  return Buffer.concat(chunks);
}
globalThis.Image = class extends Image { set src(value) { super.src = nativePng(value); } };
try {
  const player = {x: 8, y: 8, dir: {x: 1, y: 0}, moveDuration: 95};
  let mouthCalls = 0;
  const service = createLiveSnakeRenderer({tile: 16,
    playerPosition(p) { return {x: p.x - .3, y: p.y}; },
    mouthTarget(p, t) { mouthCalls++; return {x: (p.x + .5) * 16 + t / 100, y: (p.y + .7) * 16}; }});
  assert.equal(service.stats().ready, false);
  const ready = await Promise.all([service.prepare(), service.prepare()]); assert.equal(ready[0], ready[1]);
  const stats = service.stats(); assert.equal(stats.ready, true); assert.equal(stats.error, null);
  assert.deepEqual(stats.palettes.sort(), ['Blue', 'Green', 'Orange', 'Pink', 'Yellow']);
  assert.equal(stats.mouthFrames, 97); assert.deepEqual(stats.atlasSize, [1008, 968]);
  assert.ok(stats.cachedBytes < 22 * 1024 ** 2, `bounded palette cache: ${stats.cachedBytes}`);
  assert.equal(stats.paletteSource, 'original-native-atlases'); assert.equal(stats.nativeBodyPixels, true);
  const paletteNames = ['green', 'yellow', 'blue', 'pink', 'orange'];
  const native = [], nativeImages = [], paletteReport = [];
  const bodies = preparedCanvases.filter(c => c.width === 160 && c.height === 57);
  const mouths = preparedCanvases.filter(c => c.width === 1008 && c.height === 968);
  const tails = preparedCanvases.filter(c => c.height > 1 && c.height < 256 && c.width !== 160);
  assert.equal(bodies.length, 5); assert.equal(mouths.length, 5); assert.equal(tails.length, 5);
  for (let n = 0; n < paletteNames.length; n++) {
    const im = await loadImage(fileURLToPath(new URL(`../assets/atlases/4k/snake-${paletteNames[n]}-160.png`, import.meta.url)));
    nativeImages.push(im);
    const surface = createCanvas(800, 640), g = surface.getContext('2d'); g.drawImage(im, 0, 0);
    native.push(g.getImageData(0, 0, 800, 640).data);
    assert.deepEqual(bodies[n].getContext('2d').getImageData(0, 0, 160, 57).data,
      g.getImageData(320, 211, 160, 57).data, `${paletteNames[n]} body equals every original crop RGBA byte`);
    if (!n) continue;
    const transfer = createNativeSnakePalette(native[0], native[n]), mapped = Uint8ClampedArray.from(native[0]);
    transfer.apply(mapped);
    let squared = 0, components = 0;
    for (let i = 0; i < mapped.length; i += 4) {
      assert.equal(native[n][i + 3], native[0][i + 3], 'all original palettes have exactly aligned native alpha geometry');
      assert.equal(mapped[i + 3], native[0][i + 3], 'palette transfer preserves source alpha');
      const neutral = Math.max(...native[0].subarray(i, i + 3)) - Math.min(...native[0].subarray(i, i + 3)) <= 8;
      if (neutral) for (let c = 0; c < 3; c++) assert.equal(mapped[i + c], native[0][i + c], 'neutral eyes/teeth/outlines unchanged');
      if (native[0][i + 3] < 240 || neutral) continue;
      for (let c = 0; c < 3; c++) { squared += (mapped[i + c] - native[n][i + c]) ** 2; components++; }
    }
    const rmse = Math.sqrt(squared / components);
    assert.ok(rmse < 3, `${paletteNames[n]} source-derived RGB error ${rmse}`);
    const witness = (239 * 800 + 400) * 4;
    for (let c = 0; c < 3; c++) near(mapped[witness + c], native[n][witness + c], 2);
    paletteReport.push(`${paletteNames[n]} ${rmse.toFixed(3)}`);
  }
  // Compare cached authored details, not just the transfer function: no color
  // variant may change silhouette or turn neutral teeth/eyes into colored skin.
  for (const group of [mouths, tails]) {
    const base = group[0].getContext('2d').getImageData(0, 0, group[0].width, group[0].height).data;
    for (const art of group.slice(1)) {
      const variant = art.getContext('2d').getImageData(0, 0, art.width, art.height).data;
      for (let i = 0; i < base.length; i += 4) {
        assert.equal(variant[i + 3], base[i + 3]);
        if (base[i + 3] === 255 && Math.max(base[i], base[i + 1], base[i + 2]) - Math.min(base[i], base[i + 1], base[i + 2]) <= 8)
          for (let c = 0; c < 3; c++) assert.equal(variant[i + c], base[i + c]);
      }
    }
  }
  const reviewPath = process.argv.find(value => value.startsWith('--palette-review='))?.split('=').slice(1).join('=');
  if (reviewPath) {
    const sheet = createCanvas(900, 680), g = sheet.getContext('2d');
    g.fillStyle = '#10141a'; g.fillRect(0, 0, 900, 680); g.fillStyle = '#f4f4f4'; g.font = '18px sans-serif';
    g.fillText('Original native head / body / tail', 20, 30); g.fillText('Live authored head / native body / authored tail', 400, 30);
    for (let n = 0; n < 5; n++) {
      const y = 50 + n * 124; g.fillStyle = '#e8e8e8'; g.font = '16px sans-serif'; g.fillText(paletteNames[n], 20, y + 15);
      g.drawImage(nativeImages[n], 0, 160, 160, 160, 20, y + 24, 96, 96);
      g.drawImage(nativeImages[n], 320, 211, 160, 57, 124, y + 52, 112, 40);
      g.drawImage(nativeImages[n], 640, 160, 160, 160, 244, y + 24, 96, 96);
      g.drawImage(mouths[n], 0, 0, 112, 88, 414, y + 24, 122, 96);
      g.drawImage(bodies[n], 546, y + 52, 112, 40);
      const tailPixels = tails[n].getContext('2d').getImageData(0, 0, tails[n].width, tails[n].height).data;
      let top = tails[n].height, bottom = 0;
      for (let ty = 0; ty < tails[n].height; ty++) for (let tx = 0; tx < tails[n].width; tx++)
        if (tailPixels[(ty * tails[n].width + tx) * 4 + 3] >= 128) { top = Math.min(top, ty); bottom = Math.max(bottom, ty + 1); }
      g.drawImage(tails[n], 0, top, tails[n].width, bottom - top, 676, y + 52, 112, 40);
    }
    writeFileSync(reviewPath, sheet.toBuffer('image/png'));
  }
  console.log(`Native palette checks: 45,600 original body pixels byte-exact; authored silhouette/neutral detail preservation; paired-atlas RGB RMSE ${paletteReport.join(', ')}.`);
  const startupCanvases = canvases, startupReads = reads;
  const surface = createCanvas(1024, 768), ctx = surface.getContext('2d');
  function draw(s, t, options) {
    const original = snapshot(s);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 1024, 768);
    ctx.setTransform(3, 0, 0, 3, 0, 0); ctx.globalAlpha = .83; ctx.imageSmoothingEnabled = false;
    const originalAlpha = ctx.globalAlpha;
    assert.equal(service.draw(ctx, s, t, options), true);
    assert.equal(ctx.globalAlpha, originalAlpha); assert.equal(ctx.imageSmoothingEnabled, false);
    const m = ctx.getTransform(); near(m.a, 3); near(m.d, 3); near(m.e, 0); near(m.f, 0);
    assert.equal(snapshot(s), original, 'rendering never mutates simulation entities');
    assert.ok(ctx.getImageData(0, 0, 1024, 768).data.some((v, i) => i % 4 === 3 && v > 0), 'actual accepted artwork was painted');
    drawChecks++;
  }
  const snake = (length, color = '#35e55b') => ({body: Array.from({length}, (_, i) => ({x: 14 - i, y: 8})), dir: {x: 1, y: 0}, reversing: false, color});
  const batchProbe = snake(11), beforeBatch = service.stats().drawCalls;
  draw(batchProbe, 0);
  const straightDraws = service.stats().drawCalls - beforeBatch;
  assert.ok(straightDraws < 50, `straight pieces batch within texture boundaries: ${straightDraws}`);
  for (const color of ['#35e55b', '#66c2ff', '#d66bff', '#ff8873', '#ffe57a']) {
    const s = snake(7, color); draw(s, 0); const old = copy(s.body), prior = service.inspect(s, 0);
    s.body = [{x: 15, y: 8}, ...s.body.slice(0, -1)];
    service.recordStep(s, {oldBody: old, t: 0, duration: 218, wasReversing: false});
    const initial = service.inspect(s, 0); near(initial.rear.x, prior.rear.x); near(initial.rear.y, prior.rear.y);
    for (const t of [0, 36, 95, 150, 218]) draw(s, t);
    near(service.inspect(s, 218).rear.x - initial.rear.x, 36);
    assert.equal(service.inspect(s, 100).palette, snakePalette(color));
    // The next committed route turns down; no scripted route is consulted.
    const beforeTurn = copy(s.body); s.body = [{x: 15, y: 9}, ...s.body.slice(0, -1)]; s.dir = {x: 0, y: 1};
    service.recordStep(s, {oldBody: beforeTurn, t: 218, duration: 218, wasReversing: false});
    for (const t of [218, 270, 340, 436]) draw(s, t);
    const oldReverse = copy(s.body), tail = s.body.at(-1);
    s.body = [...s.body.slice(1), {x: tail.x - 1, y: tail.y}]; s.reversing = true;
    service.recordStep(s, {oldBody: oldReverse, t: 436, duration: 436, wasReversing: false});
    for (const t of [436, 500, 650, 872]) draw(s, t);
    assert.equal(service.inspect(s, 700).backwards, true);
  }
  for (const length of [1, 2]) {
    const s = snake(length, '#66c2ff'); draw(s, 0);
    const old = copy(s.body); s.body = [{x: 15, y: 8}, ...s.body.slice(0, -1)];
    service.recordStep(s, {oldBody: old, t: 0, duration: 218});
    for (const time of [0, 60, 120, 218]) draw(s, time);
    if (length === 1) near(service.inspect(s, 218).length, 36.365625);
  }
  // First movement can arrive before the first paint; oldBody is authoritative.
  const first = snake(4), oldFirst = copy(first.body); first.body = [{x: 15, y: 8}, ...first.body.slice(0, -1)];
  service.recordStep(first, {oldBody: oldFirst, t: 0, duration: 218});
  const start = service.inspect(first, 0), finish = service.inspect(first, 218);
  near(finish.rear.x - start.rear.x, 36);

  const shortened = snake(2); draw(shortened, 0); let token = service.capture(shortened, 100);
  const originalToken = snapshot(token.body); shortened.body.pop();
  const biteTiming = service.biteTail(shortened, token, {t: 100, player});
  assert.deepEqual(biteTiming, {visualStart: 133.25, duration: 95, endAt: 228.25});
  near(service.inspect(shortened, 100).length, 72); near(service.inspect(shortened, 228.25).length, 36.365625);
  assert.equal(service.inspect(shortened, 100).count, 1, 'logical length is immediate; visible shortening is separate');
  for (const t of [100, 133.25, 150, 180, 195, 228.25]) draw(shortened, t);
  assert.equal(snapshot(token.body), originalToken);
  near(service.inspect(shortened, 228.25).solo, 1);
  const collisionArt=service.getCollisionArt();
  assert.equal(collisionArt.contours.length,97);assert.equal(collisionArt.soloContours.length,97);
  assert.ok(collisionArt.contours.every(c=>c.parts.length)&&collisionArt.soloContours.every(c=>c.parts.length));
  function napeX(y,amount){
    if(y>=68)return 21*amount+(21-21*amount)*(y-68)/20;
    const second=y>35,ys=second?[35,52.5,63,68]:[0,7.5,18,35];
    const xs=(second?[1,1,9.5,21]:[21,9,1,1]).map(v=>v*amount);
    const cubic=(p,t)=>{const u=1-t;return u*u*u*p[0]+3*u*u*t*p[1]+3*u*t*t*p[2]+t*t*t*p[3];};
    let lo=0,hi=1;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(cubic(ys,mid)<y)lo=mid;else hi=mid;}
    return cubic(xs,(lo+hi)/2);
  }
  let priorArea=Infinity;
  for(const t of [134,140,150,165,180,190,194]){
    const geometry=service.getWorldGeometry(shortened,t),head=geometry.head;assert.ok(head.solo>0&&head.solo<1);
    let area=0;
    for(const part of head.contour.parts){
      area+=Math.abs(part.points.reduce((sum,p,i)=>{const q=part.points[(i+1)%part.points.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
      for(const p of part.points)assert.ok(p.x>=napeX(p.y,head.solo)-.11,'partial-solo collision excludes the actual clipped neck');
    }
    assert.ok(area<=priorArea+1e-6,'clipping cannot restore already removed nape material');priorArea=area;
  }

  for (const [length, index] of [[7, 3], [4, 1], [4, 2], [4, 0]]) {
    const original = snake(length, '#d66bff'); draw(original, 0); token = service.capture(original, 100);
    const created = [];
    if (index > 0) created.push({...snake(1, original.color), body: copy(original.body.slice(0, index))});
    if (index < length - 1) created.push({...snake(1, original.color), body: copy(original.body.slice(index + 1)).reverse(), dir: {x: -1, y: 0}});
    const frozen = snapshot(created), splitTiming = service.split(original, created, token, {t: 100, index, player});
    assert.deepEqual(splitTiming, {visualStart: 133.25, duration: index === 0 ? 140 : 95, endAt: index === 0 ? 273.25 : 228.25});
    assert.equal(snapshot(created), frozen, 'split adoption does not change the committed fragments');
    for (let n = 0; n < created.length; n++) {
      const child = created[n];
      for (const t of [100, 134, 160, 195, 250]) draw(child, t);
      const pose = service.inspect(child, 250);
      near(pose.length, child.body.length === 1 ? 36.365625 : child.body.length * 36);
      assert.equal(pose.palette, 'Pink');
      const rear = index === 0 || n === 1;
      assert.equal(pose.materialSign, rear ? -1 : 1);
      if (rear) assert.ok(Math.cos(pose.rear.angle) < -.99, 'rear fragment head faces away from the cut');
    }
    if (index === 0) assert.ok(service.stats().ghosts > 0, 'powered head removal retains only the swallowed skull');
  }
  // A second bite may land while a new fragment is still growing its cap.
  const parent = snake(7); draw(parent, 0); token = service.capture(parent, 0);
  const fragments = [{...snake(3), body: copy(parent.body.slice(0, 3))},
    {...snake(3), body: copy(parent.body.slice(4)).reverse(), dir: {x: -1, y: 0}}];
  service.split(parent, fragments, token, {t: 0, index: 3, player});
  const fragment = fragments[1], secondToken = service.capture(fragment, 40); fragment.body.pop();
  service.biteTail(fragment, secondToken, {t: 40, player});
  for (const t of [40, 75, 100, 135, 200]) draw(fragment, t);
  near(service.inspect(fragment, 200).length, 72);

  const eaten = snake(1); draw(eaten, 0); token = service.capture(eaten, 0);
  assert.deepEqual(service.consume(eaten, token, {t: 0, player}), {visualStart: 33.25, duration: 140, endAt: 173.25});
  for (const t of [0, 34, 60, 100, 140, 200, 400]) service.drawGhosts(ctx, t);
  assert.ok(mouthCalls > 0, 'consumed art follows the authoritative live mouth callback');
  assert.equal(service.stats().ghosts, 0);
  const pathCount = service.stats().pathBuilds;
  for (let i = 0; i < 20; i++) draw(fragment, 200 + i * 4);
  assert.equal(service.stats().pathBuilds, pathCount, 'path meshes are rebuilt on events, not each paint');
  assert.equal(canvases, startupCanvases, 'no runtime canvas creation');
  assert.equal(reads, startupReads, 'no runtime pixel reads');
  const stableEntity = snapshot(fragment), generation = service.stats().cacheGeneration;
  service.invalidate('simulated context loss');
  assert.equal(service.stats().ready, false); assert.match(service.stats().error, /context loss/);
  assert.equal(service.draw(ctx, fragment, 300), false, 'invalidated caches request explicit legacy fallback');
  const {prepare: detachedPrepare, draw: detachedDraw} = service;
  await detachedPrepare();
  assert.equal(service.stats().ready, true); assert.equal(service.stats().recoveries, 1);
  assert.equal(service.stats().cacheGeneration, generation + 1); assert.equal(service.stats().error, null);
  assert.equal(service.stats().cachedBytes, stats.cachedBytes, 'recovery replaces rather than accumulates palette memory');
  assert.equal(snapshot(fragment), stableEntity); assert.equal(detachedDraw(ctx, fragment, 300), true);
  const savedDrawImage = ctx.drawImage, savedMatrix = ctx.getTransform(), savedAlpha = ctx.globalAlpha;
  ctx.drawImage = () => { throw new Error('simulated lost image cache'); };
  assert.equal(service.draw(ctx, fragment, 300), false);
  ctx.drawImage = savedDrawImage;
  assert.match(service.stats().error, /simulated lost image cache/);
  assert.equal(ctx.globalAlpha, savedAlpha); assert.deepEqual(ctx.getTransform(), savedMatrix);
  await service.prepare({force: true}); assert.equal(service.stats().recoveries, 2);
  service.reset(); assert.equal(service.stats().ghosts, 0); assert.equal(service.inspect(fragment, 300), null);
  console.log(`Live snake passed: ${pathChecks} live-path samples, ${pulseChecks} forward/backward pulses, ${drawChecks} actual-art draws; five palettes, solo/two-cell/long bodies, 90-degree route changes, half-rate retreat, tail-to-solo, splits with one-cell fragments, overlapping bite transitions and moving-mouth ghosts. Cache ${(stats.cachedBytes / 1024 ** 2).toFixed(2)} MiB; zero per-frame canvases/readbacks and no simulation entity mutation. An 11-cell straight snake uses ${straightDraws} draws; explicit cache loss, recovery, timing returns and detached callbacks verified.`);
} finally {
  if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  if (oldImage === undefined) delete globalThis.Image; else globalThis.Image = oldImage;
}
