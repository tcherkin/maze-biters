import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';
import {createRibbonMaterial, drawMaterialRibbon, tailWidth} from '../src/render/snake-material-ribbon.js';
import {napeBodyBoundary, compactNapeBoundary} from '../src/render/snake-head-seam.js';

// Actual native Canvas coverage, five ORIGINAL palettes and a differential
// motion oracle. The baseline is an archived source file, never a replacement
// runtime or an edited copy of the game's current simulation.
const require = createRequire(import.meta.url);
let native;
for (const location of [process.env.CODEX_CANVAS_PACKAGE, '@napi-rs/canvas',
  join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)) {
  try { native = require(location); break; } catch {}
}
if (!native) throw Error('Native Canvas required; set CODEX_CANVAS_PACKAGE.');
const {createCanvas, Image, loadImage} = native;
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const baselinePath = argument('baseline') || process.env.SNAKE_MATERIAL_BASELINE ||
  fileURLToPath(new URL('./baseline/live-snake-v1.02.04.00.js',import.meta.url));
const liveURL = new URL('../src/render/live-snake.js', import.meta.url);
const originalSource = readFileSync(resolve(baselinePath), 'utf8');
const baselineSource = originalSource
  .replace(/from\s+(['"])([^'"]+)\1/g, (_all, quote, specifier) => `from ${quote}${new URL(specifier, liveURL).href}${quote}`)
  .replaceAll('import.meta.url', JSON.stringify(liveURL.href));
const {createLiveSnakeRenderer: createBefore} = await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString('base64')}`);
const names = ['Green', 'Yellow', 'Blue', 'Pink', 'Orange'];
const colors = ['#35e55b', '#ffe57a', '#66c2ff', '#d66bff', '#ff8873'];
const CELL = 36, DIAMETER = 57 / 160 * CELL, TAIL = 35 * DIAMETER / 16, HEAD = 215.5 * DIAMETER / 76;
const copy = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, tolerance = 1e-8, label = 'value') =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const nativeURLs = names.map(name => new URL(`../assets/atlases/4k/snake-${name.toLowerCase()}-160.png`, import.meta.url));
const sourceURLs = [...nativeURLs, new URL('../animation-lib/snake-ready-v1/authored-snake-turns/assets/head-neck-sheet.png', import.meta.url)];
const sourceHashes = sourceURLs.map(url => hash(fileURLToPath(url)));
const originalDocument = globalThis.document, originalImage = globalThis.Image;
let allocations = 0, reads = 0;
const makeCanvas = (width, height) => {
  allocations++;
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d'), read = ctx.getImageData.bind(ctx);
  ctx.getImageData = (...args) => { reads++; return read(...args); };
  return canvas;
};
globalThis.document = {createElement(tag) { assert.equal(tag, 'canvas'); return makeCanvas(1, 1); }};
// Only the test decoder drops ancillary metadata unsupported by native Skia.
// The source PNG files, IDAT bytes and production image loader are untouched.
function nativePng(url) {
  const bytes = readFileSync(fileURLToPath(url)), chunks = [bytes.subarray(0, 8)];
  for (let p = 8; p < bytes.length;) {
    const size = bytes.readUInt32BE(p);
    if (bytes.toString('ascii', p + 4, p + 8) !== 'caBX') chunks.push(bytes.subarray(p, p + size + 12));
    p += size + 12;
  }
  return Buffer.concat(chunks);
}
globalThis.Image = class extends Image { set src(value) { super.src = nativePng(value); } };
const pixels = canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
const stats = {palettePixels: 0, protectedHeadPixels: 0, originalAlphaPixels: 0, changedBodySidePixels: 0,
  napeRGBChecks:0,maxNapeRGB:0,materialFixtures: 0, rootPixels: 0, maxRootRGB: 0, maxRootAlpha: 0, motionFrames: 0, railSamples: 0, eventClocks: 0, liveDraws: 0};
// Independently reviewed conservative curve LEFT of the authored wavy line.
// Taking both source rows and another two-pixel margin protects downsampled AA.
const knots = [[34,0],[38,4],[40,6],[44,9],[48,11],[52,13],[56,14],[60,15],[64,17],
  [72,17],[76,17],[80,16],[84,14],[88,12],[90,9],[94,4],[98,2],[102,0]];
function boundary(y) {
  if (y <= knots[0][0] || y >= knots.at(-1)[0]) return 0;
  const i = knots.findIndex(knot => knot[0] >= y), a = knots[i - 1], b = knots[i];
  return Math.floor(a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]));
}
const compactBoundary = y => Math.max(0, Math.floor((Math.min(boundary(y * 2), boundary(y * 2 + 1)) - 2) / 2));

try {
  const player = {x: 5, y: 8, dir: {x: 1, y: 0}, moveDuration: 95};
  const options = {tile: 16, playerPosition: p => ({x: p.x, y: p.y}),
    mouthTarget: (p, t) => ({x: (p.x + .6) * 16 + t / 10000, y: (p.y + .5) * 16})};
  const beforeService = createBefore(options), service = createLiveSnakeRenderer(options);
  await beforeService.prepare(); await service.prepare();
  assert.equal(service.stats().ready, true); assert.equal(service.stats().error, null);
  assert.deepEqual(service.stats().palettes, names);
  assert.equal(service.stats().mouthFrames, 97); assert.deepEqual(service.stats().atlasSize, [1008, 968]);
  const mouthsBefore = beforeService.getNeonSources().filter(c => c.width === 1008 && c.height === 968);
  const mouths = service.getNeonSources().filter(c => c.width === 1008 && c.height === 968);
  assert.equal(mouthsBefore.length, 5); assert.equal(mouths.length, 5, 'every original palette retains its compact gradual head atlas');
  for (let y = 0; y < 176; y++) assert.equal(napeBodyBoundary(y), boundary(y));
  for (let y = 0; y < 88; y++) assert.equal(compactNapeBoundary(y), compactBoundary(y));
  for (let palette = 0; palette < 5; palette++) {
    const old = pixels(mouthsBefore[palette]), current = pixels(mouths[palette]);
    assert.equal(old.length, current.length, 'no whole-atlas resize or expanded mouth cache');
    for (let y = 0; y < 968; y++) for (let x = 0; x < 1008; x++) {
      const at = (y * 1008 + x) * 4, frame = Math.floor(y / 88) * 9 + Math.floor(x / 112);
      assert.equal(current[at + 3], old[at + 3], `${names[palette]} frame${frame}: original alpha must never change`);
      stats.originalAlphaPixels++;
      if (frame >= 97 || x % 112 >= compactBoundary(y % 88)) {
        for (let channel = 0; channel < 4; channel++) assert.equal(current[at + channel], old[at + channel],
          `${names[palette]} original wavy line/face: frame${frame}, x${x % 112}, y${y % 88}, channel${channel}`);
        stats.protectedHeadPixels++;
      } else if ([0, 1, 2].some(channel => current[at + channel] !== old[at + channel])) stats.changedBodySidePixels++;
    }
  }
  assert.ok(stats.changedBodySidePixels > 0, 'actual integration must apply the approved body-side-only color match');
  const nativeImages = await Promise.all(nativeURLs.map(url => loadImage(nativePng(url))));
  const materials = nativeImages.map(image => createRibbonMaterial(image, makeCanvas));
  const contourWeights = new Map([[0,1],[1,1],[2,1],[3,1],[4,.2],[5,.05],[53,.1],[54,.5],[55,1],[56,1],[57,1]]);
  for (let palette = 0; palette < 5; palette++) {
    const material = materials[palette], source = createCanvas(160, 58), ctx = source.getContext('2d');
    ctx.drawImage(nativeImages[palette], 320, 211, 160, 58, 0, 0, 160, 58);
    const nativePixels = pixels(source), data = pixels(material.image), crop = material.crop;
    assert.deepEqual(crop, {x: 160, y: 8, w: 160, h: 58});
    const medians = Array.from({length: 58}, (_, y) => [0, 1, 2].map(channel =>
      Array.from({length: 160}, (_, x) => nativePixels[(y * 160 + x) * 4 + channel]).sort((a, b) => a - b)[80]));
    for (let y = 0; y < material.image.height; y++) for (let x = 0; x < material.image.width; x++) {
      const sy = Math.max(0, Math.min(57, y - crop.y)), weight = contourWeights.get(sy) || 0;
      const at = (y * material.image.width + x) * 4, sourceAt = (sy * 160 + x % 160) * 4;
      assert.equal(data[at + 3], 255, 'continuous silhouette owns alpha, not individual texture slices');
      for (let channel = 0; channel < 3; channel++) assert.equal(data[at + channel],
        Math.round(nativePixels[sourceAt + channel] * (1 - weight) + medians[sy][channel] * weight),
        `${names[palette]} uses original body palette, core and repeated gutters`);
      stats.palettePixels++;
    }
    // Independently sample the same native body cross-section at the nape.
    // Localized permission alone is not enough: its colors must actually
    // continue THIS palette's material, not a generic green repaint.
    const oldHead=pixels(mouthsBefore[palette]),head=pixels(mouths[palette]);
    const u=(((-HEAD-TAIL)%CELL+CELL)%CELL)/CELL,sx=crop.x+u*crop.w-.5,ix=Math.floor(sx),fx=sx-ix;
    for(let frame=0;frame<97;frame++)for(let y=0;y<88;y++){
      const limit=compactBoundary(y);if(!limit)continue;
      const sy=crop.y+(((2*y+1)-70)/76+.5)*crop.h-.5,iy=Math.floor(sy),fy=sy-iy;
      for(let x=0;x<limit;x++)for(let channel=0;channel<3;channel++){
        let body=0;
        for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)body+=data[((iy+dy)*material.image.width+ix+dx)*4+channel]*(dx?fx:1-fx)*(dy?fy:1-fy);
        const t=x/limit,weight=1-t*t*t*(10+t*(-15+6*t)),at=((Math.floor(frame/9)*88+y)*1008+frame%9*112+x)*4+channel;
        const expected=oldHead[at]*(1-weight)+body*weight,error=Math.abs(head[at]-expected);
        assert.ok(error<=2,`${names[palette]} nape blends original material at frame${frame}, ${x}/${y}: ${error}`);
        stats.napeRGBChecks++;stats.maxNapeRGB=Math.max(stats.maxNapeRGB,error);
      }
    }
  }
  near(tailWidth(0), 0); near(tailWidth(1), 1); near(tailWidth(2), 1);
  const e = 1e-4;
  assert.ok(Math.abs((1 - tailWidth(1 - e)) / e) < 1e-5, 'tail/body root has no tangent kink');
  assert.ok(Math.abs((1 - 2 * tailWidth(1 - e) + tailWidth(1 - 2 * e)) / e ** 2) < .01,
    'tail/body root has no curvature break');

  const fixtureSize = 420, scale = 4, center = fixtureSize / 2;
  function ribbonFixture(material, {reverse, angle, phase, curved, shift = 0, reference = false}) {
    const canvas = createCanvas(fixtureSize, fixtureSize), ctx = canvas.getContext('2d');
    ctx.translate(center + .25, center + .125); ctx.rotate(angle); ctx.scale(scale, scale);
    ctx.translate(-shift,-shift);
    const sign = reverse ? -1 : 1, tip = -sign * TAIL;
    const pointAt = s => curved ? {x: shift+Math.sin(s / 18) * 18, y: shift+(1 - Math.cos(s / 18)) * 18, angle: s / 18}
      : {x: shift+s, y: shift, angle: 0};
    const path = {sample(s, out = {}) { return Object.assign(out, pointAt(s)); }, ribbonSpan(_s, maximum) { return Math.min(maximum, curved ? 1.1 : 36); }};
    const pose = {state: {frontMaterial: HEAD + TAIL + phase, materialSign: sign},
      length: HEAD + TAIL + CELL * 3, solo: 0, rearDistance: 0, compression: 0, path};
    drawMaterialRibbon(ctx, material, pose, sign > 0 ? tip : -CELL, sign > 0 ? CELL : tip,
      {pointAt, step: s => s * sign < 0 ? .35 : 1.1,
        widthAt: reference ? null : s => s * sign < 0 ? tailWidth((s - tip) / -tip) : 1});
    return canvas;
  }
  const gallery = [];
  for (let palette = 0; palette < 5; palette++) for (const reverse of [false, true])
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) for (const phase of [0, 13.4])
    for (const curved of [false, true]) for(const shift of [0,512]) {
      // World coordinates need not be near zero. In particular, the scratch
      // mask must remain visible with a negative world-to-buffer translation.
      const configuration = {reverse, angle, phase, curved,shift}, actual = ribbonFixture(materials[palette], configuration);
      const expected = ribbonFixture(materials[palette], {...configuration, reference: true});
      const a = pixels(actual), b = pixels(expected); let sum = 0, count = 0, maxAlpha = 0;
      for (let y = center - 30; y <= center + 30; y++) for (let x = center - 30; x <= center + 30; x++) {
        const dx = (x + .5 - center - .25) / scale, dy = (y + .5 - center - .125) / scale;
        const longitudinal = dx * Math.cos(angle) + dy * Math.sin(angle), normal = -dx * Math.sin(angle) + dy * Math.cos(angle);
        if (Math.abs(longitudinal) > 1.2 || Math.abs(normal) > DIAMETER * .4) continue;
        const at = (y * fixtureSize + x) * 4;
        assert.ok(a[at + 3] > 230 && b[at + 3] > 230, `${names[palette]} has no crack through joined body/tail root`);
        maxAlpha = Math.max(maxAlpha, Math.abs(a[at + 3] - b[at + 3]));
        for (let channel = 0; channel < 3; channel++) { sum += Math.abs(a[at + channel] - b[at + channel]); count++; }
        stats.rootPixels++;
      }
      const mean = sum / count; assert.ok(count && mean < 6, `joined root follows same body material: ${mean}`);
      assert.ok(maxAlpha <= 15); stats.maxRootRGB = Math.max(stats.maxRootRGB, mean); stats.maxRootAlpha = Math.max(stats.maxRootAlpha, maxAlpha);
      stats.materialFixtures++;
      if (angle === 0 && phase === 0 && !curved&&shift===0) gallery.push({canvas: actual, label: `${names[palette]} ${reverse ? 'reverse cap' : 'tail/body'}`});
    }

  const target = createCanvas(512, 384), ctx = target.getContext('2d');
  const startup = {allocations, reads};
  function geometry(service, entity, t) {
    const g = service.getWorldGeometry(entity, t), {sprite, ...head} = g.head;
    const out = {pose: service.inspect(entity, t), head, ...Object.fromEntries(Object.entries(g).filter(([key, value]) =>
      key !== 'head' && typeof value !== 'function'))};
    for (const key of ['sample', 'stripSpan', 'indexAt']) out[key] = [];
    for (let n = 0; n <= 24; n++) {
      const at = g.length * n / 24; out.sample.push({...g.sample(at)});
      out.stripSpan.push(g.stripSpan(at, 2.5)); out.indexAt.push(g.indexAt(at)); stats.railSamples++;
    }
    out.breakpoints = service.contactBreakpoints(entity, t, t + 50);
    return out;
  }
  function checkPair(pair, t, label) {
    const [old, current] = pair;
    assert.deepEqual(geometry(service, current, t), geometry(beforeService, old, t), `${label}: native rail, clocks and geometry are exact`);
    const frozen = JSON.stringify(current); ctx.clearRect(0, 0, target.width, target.height);
    const matrix = ctx.getTransform(), alpha = ctx.globalAlpha;
    assert.equal(service.draw(ctx, current, t), true, `${label}: prepared original-palette artwork paints`);
    const visible = ctx.getImageData(0,0,target.width,target.height).data.some((value,index)=>index%4===3&&value>0);
    ctx.clearRect(0,0,target.width,target.height);
    assert.equal(beforeService.draw(ctx, old, t), true);
    const previouslyVisible = ctx.getImageData(0,0,target.width,target.height).data.some((value,index)=>index%4===3&&value>0);
    if(previouslyVisible)assert.ok(visible,`${label}: renderer cannot silently drop an entire visible creature at t=${t}`);
    assert.equal(JSON.stringify(current), frozen, 'presentation cannot mutate simulation state');
    assert.deepEqual(ctx.getTransform(), matrix); assert.equal(ctx.globalAlpha, alpha);
    stats.motionFrames++; stats.liveDraws++;
  }
  const snake = (count, color, reverse = false) => ({body: Array.from({length: count}, (_, i) => ({x: 14 - i, y: 8})),
    dir: {x: 1, y: 0}, reversing: reverse, color});
  function fresh(count, color, reverse = false) {
    service.reset(); beforeService.reset();
    const pair = [snake(count, color, reverse), snake(count, color, reverse)];
    beforeService.capture(pair[0], 0); service.capture(pair[1], 0); return pair;
  }
  function commit(pair, t, backwards, next) {
    const duration = backwards ? 436 : 218;
    for (const [i, renderer] of [beforeService, service].entries()) {
      const entity = pair[i], oldBody = copy(entity.body), oldDir = copy(entity.dir), wasReversing = entity.reversing;
      entity.reversing = backwards;
      if (backwards) entity.body = [...entity.body.slice(1), copy(next)];
      else { entity.dir = {x: next.x - entity.body[0].x, y: next.y - entity.body[0].y}; entity.body = [copy(next), ...entity.body.slice(0, -1)]; }
      renderer.recordStep(entity, {oldBody, oldDir, wasReversing, t, duration});
    }
    for (const fraction of [0, .12, .35, .5, .77, 1]) checkPair(pair, t + duration * fraction, 'native step');
  }
  for (const color of colors) for (const count of [1, 2, 7]) {
    let pair = fresh(count, color);
    for (const [index, next] of [{x:15,y:8},{x:15,y:9},{x:14,y:9},{x:13,y:9}].entries()) commit(pair, index * 218, false, next);
    pair = fresh(count, color, true);
    const x = 14 - count;
    for (const [index, next] of [{x,y:8},{x,y:9},{x:x+1,y:9},{x:x+2,y:9}].entries()) commit(pair, index * 436, true, next);
  }
  for (const color of colors) for (const backwards of [false, true]) {
    const pair = fresh(7, color, backwards);
    commit(pair, 0, backwards, backwards ? {x:7,y:8} : {x:15,y:8});
    for (let bite = 0; bite < 6; bite++) {
      const t = 55 + bite * 60, results = [];
      for (const [i, renderer] of [beforeService, service].entries()) {
        const entity = pair[i], token = renderer.capture(entity, t); entity.body.pop();
        results.push(renderer.biteTail(entity, token, {t, player}));
      }
      assert.deepEqual(results[1], results[0], 'every overlapping bite keeps its independent original clock'); stats.eventClocks++;
      for (const delta of [0, 33.25, 45, 60]) checkPair(pair, t + delta, 'overlapping shortening');
    }
    for (const renderer of [beforeService, service]) renderer.hold(pair[renderer === service ? 1 : 0], 450);
    for (const t of [450, 470, 520, 600]) checkPair(pair, t, 'held locomotion with independent shortening');
    const results = [beforeService, service].map((renderer, i) => renderer.consume(pair[i], renderer.capture(pair[i], 650), {t:650, player}));
    assert.deepEqual(results[1], results[0], 'head absorption timing remains original'); stats.eventClocks++;
    for (const t of [650,684,710,750,820,1000]) { service.drawGhosts(ctx,t); beforeService.drawGhosts(ctx,t); }
    assert.equal(service.stats().ghosts, beforeService.stats().ghosts);
  }
  for (const color of colors) for (const index of [0,1,3,5]) {
    const pair = fresh(7, color), children = [], results = [];
    for (const [i, renderer] of [beforeService, service].entries()) {
      const original = pair[i], token = renderer.capture(original, 100), fragments = [];
      if(index) fragments.push({...snake(index,color),body:copy(original.body.slice(0,index))});
      if(index<6) fragments.push({...snake(6-index,color),body:copy(original.body.slice(index+1)).reverse(),dir:{x:-1,y:0}});
      children.push(fragments); results.push(renderer.split(original,fragments,token,{t:100,index,player}));
    }
    assert.deepEqual(results[1],results[0],'split/head-bite event clocks remain original'); stats.eventClocks++;
    for(let n=0;n<children[0].length;n++)for(const t of [100,133.25,145,170,200,230,280])
      checkPair([children[0][n],children[1][n]],t,'front/reversed split fragment');
  }
  assert.equal(allocations, startup.allocations, 'animation allocates no new per-frame canvases');
  assert.equal(reads, startup.reads, 'animation performs no per-frame pixel readbacks');
  assert.equal(service.stats().materialScratchSurfaces, 1, 'all five palettes share one synchronous ribbon scratch');
  assert.ok(service.stats().materialScratchBytes > 4, 'diagnostics include the actual grown scratch, not its initial 1x1 size');
  assert.ok(Object.isFrozen(service.getNeonSources()), 'prepared neon sources cannot be mutated by consumers');
  assert.equal(service.getNeonSources(), service.getNeonSources(), 'neon source inventory is reused between frames');
  assert.deepEqual(sourceURLs.map(url => hash(fileURLToPath(url))), sourceHashes, 'all five native sprites and authored head source stay untouched');
  if (argument('gallery')) {
    const destination = resolve(argument('gallery')), sheet = createCanvas(840, gallery.length / 2 * 245), g = sheet.getContext('2d');
    g.fillStyle = '#090c14'; g.fillRect(0,0,sheet.width,sheet.height); g.font='18px sans-serif'; g.fillStyle='#dcf6cd';
    gallery.forEach((entry,index)=>{const x=index%2*420,y=Math.floor(index/2)*245;g.fillText(entry.label,x+12,y+22);g.drawImage(entry.canvas,0,105,420,220,x,y+25,420,220);});
    mkdirSync(fileURLToPath(new URL('.',pathToFileURL(destination))),{recursive:true});writeFileSync(destination,sheet.toBuffer('image/png'));
  }
  console.log(`PASS original-game material integration: ${JSON.stringify(stats)}; all five palettes, 97 exact protected head poses, joined body/tail material, unchanged native motion/consumption and zero runtime pixel reads/canvas allocations.`);
} finally {
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  if (originalImage === undefined) delete globalThis.Image; else globalThis.Image = originalImage;
}
