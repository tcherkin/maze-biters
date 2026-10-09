import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLiveScorpion, createLiveScorpionRenderer} from '../src/render/live-scorpion.js';

const TILE = 16, STEP = 218, SLIDE = STEP * .55;
const near = (a, b, label, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} versus ${b}`);
const directions = [{x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}];
class Context {
  constructor() { this.matrix = [1, 0, 0, 1, 0, 0]; this.stack = []; this.draws = []; this.globalAlpha = .7; }
  save() { this.stack.push([...this.matrix]); }
  restore() { assert.ok(this.stack.length); this.matrix = this.stack.pop(); }
  scale(x, y) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    const m = this.matrix; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y;
  }
  translate(x, y) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    const m = this.matrix; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y;
  }
  point(p) { const m = this.matrix; return {x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5]}; }
}
const fakeArt = {stats: {runtimePixelReads: false}, draw(ctx, pose) {
  const center = ctx.point(pose.sample(0, {}));
  ctx.draws.push({center, frame: pose.frame, curvature: pose.source.curvature,
    frontAngle: pose.source.frontAngle, rearAngle: pose.source.rearAngle,
    material: [-36, -25.2, -7.2, 0, 7.2, 14.4, 36].map(offset => ctx.point(pose.sample(offset, {}))),
    scale: Math.hypot(ctx.matrix[0], ctx.matrix[1]) / (TILE / 36)});
}};
function makeEntity(dir = directions[0], t = 1000) {
  return {x: 10, y: 10, tailX: 10 - dir.x, tailY: 10 - dir.y, dir: {...dir},
    moveFromX: 10, moveFromY: 10, moveToX: 10, moveToY: 10,
    tailMoveFromX: 10 - dir.x, tailMoveFromY: 10 - dir.y,
    tailMoveToX: 10 - dir.x, tailMoveToY: 10 - dir.y,
    moveStartedAt: t, lastMove: t, bornAt: t, moveDuration: SLIDE, snapMovement: true,
    nextFruitAt: 19000, nextEggAt: 33000};
}
function logicalStep(entity, dir, t, blocked = false) {
  const oldHead = {x: entity.x, y: entity.y}, oldTail = {x: entity.tailX, y: entity.tailY}, oldDir = {...entity.dir};
  if (!blocked) {
    entity.x += dir.x; entity.y += dir.y; entity.tailX = oldHead.x; entity.tailY = oldHead.y; entity.dir = {...dir};
  }
  entity.moveFromX = oldHead.x; entity.moveFromY = oldHead.y;
  entity.moveToX = entity.x; entity.moveToY = entity.y;
  entity.tailMoveFromX = oldTail.x; entity.tailMoveFromY = oldTail.y;
  entity.tailMoveToX = entity.tailX; entity.tailMoveToY = entity.tailY;
  entity.moveStartedAt = t; entity.lastMove = t; entity.moveDuration = SLIDE;
  entity.snapMovement = blocked || oldDir.x !== entity.dir.x || oldDir.y !== entity.dir.y;
  return {oldHead, oldTail, oldDir, t, duration: SLIDE, nativeDelay: STEP};
}
function playerPosition(p, t, out = {}) {
  const u = Math.max(0, Math.min(1, (t - p.moveStartedAt) / p.moveDuration));
  out.x = p.moveFromX + (p.x - p.moveFromX) * u;
  out.y = p.moveFromY + (p.y - p.moveFromY) * u;
  return out;
}
function mouthTarget(p, t, out = {}) {
  const pos = playerPosition(p, t), size = TILE * .88;
  out.x = (pos.x + .5) * TILE + p.dir.x * size * .175;
  out.y = (pos.y + .5) * TILE + p.dir.y * size * .175 + p.dir.x * p.dir.x * size * .18125;
  return out;
}
function eater(entity, atTail, t) {
  const direction = atTail ? entity.dir : {x: -entity.dir.x, y: -entity.dir.y};
  const x = atTail ? entity.tailX : entity.x, y = atTail ? entity.tailY : entity.y;
  return {x, y, dir: {...direction}, prevX: x - direction.x, prevY: y - direction.y,
    moveFromX: x - direction.x, moveFromY: y - direction.y, moveStartedAt: t, moveDuration: 95};
}
let loads = 0;
const service = createLiveScorpion({tile: TILE, playerPosition, mouthTarget,
  loadArt: async () => { loads++; return fakeArt; }});
assert.equal(createLiveScorpionRenderer, createLiveScorpion, 'both agreed export names share implementation');
const initial = makeEntity(), empty = new Context();
assert.equal(service.draw(empty, initial, 1000), false, 'safe native fallback while art loads');
assert.equal(service.consume(initial, eater(initial, true, 1000), 1000, {atTail: true}), false);
const preparing = service.prepare(); assert.equal(service.prepare(), preparing);
assert.equal(await preparing, true); assert.equal(loads, 1); assert.equal(service.stats.ready, true);

let poseChecks = 0, materialChecks = 0, joinChecks = 0, ghostChecks = 0;
for (let incoming = 0; incoming < 4; incoming++) for (const turn of [0, 1, -1, 2]) {
  service.reset();
  const entity = makeEntity(directions[incoming]), t = 1218;
  service.sample(entity, 1000);
  const event = logicalStep(entity, directions[(incoming + turn + 4) % 4], t), saved = JSON.stringify(entity);
  assert.equal(service.recordStep(entity, event), true);
  assert.equal(JSON.stringify(entity), saved, 'adapter cannot mutate logical decisions, grid cells, or timers');
  const duration = turn ? STEP : SLIDE;
  const beginning = service.sample(entity, t, {});
  near(beginning.x, (event.oldHead.x + event.oldTail.x + 1) * TILE / 2, 'exact old seam at movement start');
  near(beginning.y, (event.oldHead.y + event.oldTail.y + 1) * TILE / 2, 'no start offset or recoil');
  for (let i = 0; i <= 400; i++) {
    const time = t + duration * i / 400, pose = service.sample(entity, time, {});
    assert.equal(pose.scale, 1, 'no pre-consumption shrinking');
    assert.equal(pose.lift, 0); assert.equal(pose.pitch, 0);
    assert.equal(pose.frame, Math.floor((time - 1000) / (STEP / 2) + 1e-10) & 1, 'continuous native gait');
    assert.ok(1 - Math.abs(pose.curvature) * TILE / 4 > .25, 'conservative torso band never folds');
    if (turn === 2) {
      near(pose.x, beginning.x, 'reversal swaps grid cells but leaves visual seam fixed');
      near(pose.y, beginning.y, 'no sideways route added for U-turn');
      assert.ok(pose.frontAngle >= beginning.frontAngle - 1e-9, 'clockwise head-led turn');
      assert.ok(pose.frontAngle >= pose.rearAngle - 1e-9);
    }
    for (const offset of [-TILE, -.3 * TILE, -.05 * TILE, .05 * TILE, .3 * TILE, TILE]) {
      const h = TILE * 1e-6, p = pose.sample(offset), left = pose.sample(offset - h), right = pose.sample(offset + h);
      near(Math.hypot((right.x - left.x) / (2 * h), (right.y - left.y) / (2 * h)), 1,
        'unit material arclength and rigid extensions', 1e-6);
      near(Math.hypot(p.tx, p.ty), 1, 'unit tangent'); materialChecks++;
    }
    const ctx = new Context(); assert.equal(service.draw(ctx, entity, time), true);
    near(ctx.draws[0].center.x, pose.x, '36px study art converted to live16px coordinates');
    near(ctx.draws[0].center.y, pose.y, 'no atlas/world unit confusion');
    assert.equal(ctx.stack.length, 0); assert.equal(ctx.globalAlpha, .7, 'engine spawn alpha preserved');
    poseChecks++;
  }
  const end = service.sample(entity, t + duration, {});
  near(end.x, (entity.x + entity.tailX + 1) * TILE / 2, 'exact new seam');
  near(end.y, (entity.y + entity.tailY + 1) * TILE / 2, 'exact new seam');
  near(Math.cos(end.angle), entity.dir.x, 'exact new heading');
  near(Math.sin(end.angle), entity.dir.y, 'exact new heading');
  near(end.curvature, 0, 'no residual body bend after completed step');
  if (turn === 2) {
    const middle = service.sample(entity, t + STEP / 2, {});
    assert.ok(middle.frontAngle - middle.rearAngle > 3, 'true near-180 U, not rigid global spin');
  }
  if (turn) for (const boundary of [t, t + duration]) {
    const h = duration * 1e-4;
    const states = [boundary - h, boundary, boundary + h].map(at => service.sample(entity, at, {}));
    for (const key of ['x', 'y', 'frontAngle', 'rearAngle']) {
      const [left, middle, right] = states.map(p => p[key]);
      const norm = key.includes('Angle') ? Math.PI : TILE;
      near((right - left) / (2 * h) * duration / norm, 0, `${key} C1 endpoint`, 1e-6);
      near((right - 2 * middle + left) / h ** 2 * duration ** 2 / norm, 0, `${key} C2 endpoint`, .008);
      joinChecks++;
    }
  }
  assert.equal(JSON.stringify(entity), saved, 'drawing never changes gameplay state');
}

// Blocked updates are not reversals, and tutorial commits without explicit
// recordStep are discovered from the same public movement fields.
service.reset();
const tutorial = makeEntity(); service.sample(tutorial, 1000);
logicalStep(tutorial, directions[1], 1218);
assert.equal(service.sample(tutorial, 1327).phase, 'quarter', 'lazy tutorial synchronization');
const blockedEvent = logicalStep(tutorial, directions[1], 1436, true);
service.step(tutorial, blockedEvent);
const blocked = service.sample(tutorial, 1500);
assert.equal(blocked.phase, 'still'); assert.equal(blocked.curvature, 0);
assert.equal(blocked.frame, Math.floor((1500 - 1000) / 109) & 1);

for (const atTail of [false, true]) for (const turning of [false, true]) {
  service.reset();
  const entity = makeEntity(); service.sample(entity, 1000);
  if (turning) service.step(entity, logicalStep(entity, directions[2], 1218));
  const killTime = turning ? 1260 : 1100, p = eater(entity, atTail, killTime);
  const savedEntity = JSON.stringify(entity), savedPlayer = JSON.stringify(p);
  const event = service.consume(entity, p, killTime, {atTail});
  assert.ok(event);
  near(event.visualStart, killTime + .35 * 95, 'only visual start waits for player glide');
  assert.equal(event.duration, turning ? 200 : atTail ? 220 : 140);
  assert.equal(JSON.stringify(entity), savedEntity); assert.equal(JSON.stringify(p), savedPlayer);
  const earlier = new Context(); service.drawGhosts(earlier, killTime - 1);
  assert.equal(earlier.draws.length, 0, 'a future capture cannot appear when a tutorial clock rewinds');
  const before = new Context(); service.drawGhosts(before, event.visualStart - .01);
  const reference = service.sample(entity, event.visualStart - .01, {});
  near(before.draws[0].center.x, reference.x, 'waiting ghost retains exact moving native pose');
  near(before.draws[0].center.y, reference.y, 'no early jump to logical player cell');
  near(before.draws[0].scale, 1, 'delay does not secretly erase creature');
  const mouthAtStart = mouthTarget(p, event.visualStart), rawAtStart = service.sample(entity, event.visualStart, {});
  const initialX = rawAtStart.x - mouthAtStart.x, initialY = rawAtStart.y - mouthAtStart.y;
  let lastDistance = Infinity, lastScale = 1;
  const frames = new Set(), curvatures = new Set();
  // A removed game object may now be discarded or reused by external code.
  // Its captured visual descriptor must not follow those mutations.
  entity.x = entity.y = entity.tailX = entity.tailY = 99;
  for (let i = 0; i < 300; i++) {
    const time = event.visualStart + event.duration * i / 300, ctx = new Context();
    service.drawGhosts(ctx, time);
    assert.equal(ctx.draws.length, 1);
    const visible = ctx.draws[0], mouth = mouthTarget(p, time);
    const dx = visible.center.x - mouth.x, dy = visible.center.y - mouth.y, distance = Math.hypot(dx, dy);
    assert.ok(distance <= lastDistance + 1e-8, 'capture never moves away from moving mouth');
    assert.ok(dx * initialX + dy * initialY >= -1e-8, 'capture stays on its incoming side');
    assert.ok(visible.scale <= lastScale + 1e-12 && visible.scale > 0, 'one monotone whole-body scale');
    assert.equal(ctx.globalAlpha, .7, 'no absorption fade');
    assert.equal(ctx.stack.length, 0);
    frames.add(visible.frame); curvatures.add(visible.curvature);
    lastDistance = distance; lastScale = visible.scale; ghostChecks++;
  }
  assert.equal(frames.size, 2, 'native gait keeps running in consumed ghost');
  if (turning) assert.ok(curvatures.size > 10, 'captured bend continues, never freezes or straightens at bite');
  const after = new Context(); service.drawGhosts(after, event.endAt);
  assert.equal(after.draws.length, 0); assert.equal(service.stats.ghosts, 0);
  assert.equal(JSON.stringify(p), savedPlayer, 'consumption cannot move or rotate the player');
}

const failing = createLiveScorpion({loadArt: async () => { throw Error('test unavailable art'); }});
assert.equal(await failing.prepare(), false);
assert.equal(failing.draw(new Context(), makeEntity(), 1000), false);
assert.match(failing.stats.error, /unavailable/);
const entity = makeEntity(), player = eater(entity, true, 1000);
service.consume(entity, player, 1000, {atTail: true});
assert.ok(service.stats.ghosts); service.reset(); assert.equal(service.stats.ghosts, 0);
assert.equal(service.draw(new Context(), {}, 1000), false);
assert.equal(service.sample(entity, NaN), null);
assert.equal(service.recordStep(entity, {}), false);
assert.equal(service.drawGhosts(new Context(), NaN), false);
assert.throws(() => createLiveScorpion({tile: 0}), RangeError);
assert.equal(loads, 1, 'no runtime atlas reloads');

// Context-loss lifecycle of the actual copied bent-art cache. Transparent
// rasters are enough to exercise its real resource ownership and rebuilding;
// the preceding geometry suite uses every material point independently.
const previousDocument = globalThis.document, previousImage = globalThis.Image;
let decodedAtlases = 0;
class CacheCanvas {
  constructor() { this.width = 0; this.height = 0; this.events = new Map(); }
  addEventListener(type, fn) { if (!this.events.has(type)) this.events.set(type, new Set()); this.events.get(type).add(fn); }
  removeEventListener(type, fn) { this.events.get(type)?.delete(fn); }
  emit(type) { for (const fn of this.events.get(type) || []) fn(); }
  getContext() { return {
    drawImage() {}, clearRect() {}, putImageData() {},
    getImageData: (_x, _y, width, height) => ({data: new Uint8ClampedArray(width * height * 4), width, height}),
    createImageData: (width, height) => ({data: new Uint8ClampedArray(width * height * 4), width, height})
  }; }
}
try {
  globalThis.document = {createElement(name) { assert.equal(name, 'canvas'); return new CacheCanvas(); }};
  globalThis.Image = class {
    constructor() { this.naturalWidth = 2560; this.naturalHeight = 160; }
    async decode() { decodedAtlases++; }
  };
  const {loadBentArt} = await import('../animation-lib/scorpion-turn-study/bent-art.js?v=1.02.03.00');
  const recovering = createLiveScorpion({tile: TILE, playerPosition, mouthTarget});
  assert.equal(await recovering.prepare(), true);
  const oldArt = await loadBentArt();
  assert.ok(oldArt.valid && oldArt.resources.length >= 8);
  const recoveringEntity = makeEntity(); recovering.sample(recoveringEntity, 1000);
  recovering.step(recoveringEntity, logicalStep(recoveringEntity, directions[2], 1218));
  const pausedPose = JSON.stringify(recovering.sample(recoveringEntity, 1290, {}));
  const recoveryContext = new Context(); let actualDraws = 0;
  Object.assign(recoveryContext, {rotate() {}, drawImage() { actualDraws++; },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, transform() {}});
  assert.equal(recovering.draw(recoveryContext, makeEntity(), 1000), true);
  assert.ok(actualDraws > 0);
  oldArt.resources[0].emit('contextlost');
  assert.equal(oldArt.valid, false);
  assert.equal(recovering.stats.ready, false);
  const drawsBeforeFallback = actualDraws;
  assert.equal(recovering.draw(recoveryContext, makeEntity(), 1000), false,
    'engine keeps its native scorpion fallback while lost art is rebuilding');
  assert.equal(actualDraws, drawsBeforeFallback, 'invalid cached canvases are never drawn');
  assert.equal(await recovering.prepare(), true);
  const rebuiltArt = await loadBentArt();
  assert.notEqual(rebuiltArt, oldArt); assert.equal(rebuiltArt.valid, true);
  assert.ok(oldArt.resources.every(resource => resource.width === 1 && resource.height === 1),
    'retired lost resources released instead of leaking another full cache');
  assert.equal(decodedAtlases, 1, 'recovery reuses decoded atlas, not a network reload');
  assert.equal(JSON.stringify(recovering.sample(recoveringEntity, 1290, {})), pausedPose,
    'cache rebuild cannot advance, reset or drift a paused movement/bend/gait clock');
  assert.equal(recovering.draw(recoveryContext, makeEntity(), 1000), true);
  rebuiltArt.resources[0].emit('contextlost');
  assert.equal(await recovering.prepare(), true, 'explicit reprepare also detects invalidation');
  assert.equal((await loadBentArt()).valid, true);
} finally {
  if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  if (previousImage === undefined) delete globalThis.Image; else globalThis.Image = previousImage;
}
let validResource = true, recoveryAttempts = 0;
const retrying = createLiveScorpion({loadArt: async () => {
  recoveryAttempts++;
  if (recoveryAttempts === 1) return {...fakeArt, get valid() { return validResource; }};
  if (recoveryAttempts === 2) throw Error('context still recovering');
  return fakeArt;
}});
assert.equal(await retrying.prepare(), true); validResource = false;
assert.equal(retrying.draw(new Context(), makeEntity(), 1000), false);
assert.equal(await retrying.prepare(), false);
assert.equal(retrying.draw(new Context(), makeEntity(), 1000), false, 'retry remains safe native fallback');
assert.equal(await retrying.prepare(), true, 'next visible frame retries after temporary recovery failure');
assert.equal(recoveryAttempts, 3);
assert.equal(retrying.draw(new Context(), makeEntity(), 1000), true);
const source = await readFile(new URL('../src/render/live-scorpion.js', import.meta.url), 'utf8');
assert.ok(!source.includes('getImageData'), 'no runtime pixel reads');
assert.ok(!source.includes('ROUTE_VERTICES') && !source.includes('BENT_STUDY'), 'no experimental path or timing playback');
console.log(`PASS live scorpion: ${poseChecks} four-heading movement samples, ${materialChecks} arclength probes, ` +
  `${joinChecks} C2 turn joins, ${ghostChecks} whole-body bite poses; lazy tutorials, 218ms clockwise U, ` +
  'continuous gait, logical immutability, actual-player mouth tracking, context-loss rebuild/native fallback, no runtime pixel reads.');
