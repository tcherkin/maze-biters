import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLiveSnakeRenderer, makeLiveSnakePath} from '../src/render/live-snake.js';

// The older retreat suite establishes continuity and non-folding, but those
// properties also hold for a body that bows across the inside of every bend.
// This independent test checks the GEOMETRIC LOCUS, radius and local physical
// span, and separately checks the accepted head-first / tail-push cadence.
// No Canvas, pixel reads, fixture motion paths or renderer implementation kind.
const CELL = 36, TILE = 16, SCALE = TILE / CELL, RADIUS = CELL / 2;
const HEAD = 215.5 * (57 / 160 * CELL) / 76;
const POSITION_EPSILON = .02, TANGENT_EPSILON = .002, CURVE_EPSILON = .0001;
const directions = [{x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}];
const staircase = [{x: 7, y: 3}, {x: 6, y: 3}, {x: 6, y: 2}, {x: 5, y: 2},
  {x: 5, y: 1}, {x: 4, y: 1}, {x: 4, y: 0}];
const copy = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => a.x === b.x && a.y === b.y;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const failures = [];
const stats = {fixedCommits: 0, randomCommits: 0, reverseCommits: 0, modeSwitches: 0,
  frames: 0, points: 0, chordChecks: 0, maxRailError: 0, maxCoreCurvature: 0,
  minChordRatio: 1, maxJoinGap: 0, maxPrefixFold: 0, worstRailFrame: '', worstFoldFrame: '',
  worstFoldCommit: null, firstRandomCoreFailure: null, captureChecks: 0,
  maxStressRailError: 0, nativeRandomCommits: 0, interruptedCommits: 0};
let failureCount = 0;
let currentCommit = null;
function check(ok, message) {
  if (!ok) { failureCount++; if (failures.length < 20) failures.push(message); }
}

const engine = readFileSync(new URL('../src/engine/game.js', import.meta.url), 'utf8');
function extract(name) {
  const start = engine.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  assert.ok(start >= 0, `production function ${name}`);
  for (let end = engine.indexOf('}', start); end >= 0; end = engine.indexOf('}', end + 1)) {
    const source = engine.slice(start, end + 1);
    try { new vm.Script(source); return source; } catch {}
  }
  throw Error(`Unterminated production function ${name}`);
}
const retreatSource = extract('retreatOneStep');
function nativeRetreat(s) {
  const context = vm.createContext({s, dirs: directions, playerAt: () => null,
    canEnter: () => false,
    chooseTailRetreatDirection() { throw Error('The test supplies one legal native exit.'); }});
  vm.runInContext(retreatSource, context);
  return next => {
    context.canEnter = (x, y) => x === next.x && y === next.y;
    assert.equal(vm.runInContext('retreatOneStep(s)', context), true);
  };
}
function startRetreat(s) {
  const tail = s.body.at(-1), before = s.body.at(-2);
  s.tailGuide = {...tail, dir: {x: tail.x - before.x, y: tail.y - before.y}};
  s.tailGuideHistory = [{...tail}];
  s.reversing = true;
}
function checkJoin(service, s, before, t, label) {
  const after = service.inspect(s, t);
  const gap = Math.max(distance(before.tail, after.tail), distance(before.rear, after.rear));
  stats.maxJoinGap = Math.max(stats.maxJoinGap, gap);
  check(gap < .002, `${label}: commit gap ${gap} reference px`);
}
function inspectFrame(service, s, time, rail, label, {protectedJoin = null, strictRail = true} = {}) {
  const g = service.getWorldGeometry(s, time);
  const end = g.bodyEndDistance;
  const headAt = rail.project(g.head.x / SCALE, g.head.y / SCALE, rail.headHint ?? 0), head = rail.sample(headAt);
  // The protected boundary is the exact WORLD tangent oldTail+.5cell toward
  // its neighbour, not a guessed number of pixels from the moving tail tip.
  // Read the material boundary, then verify that it really lands on that
  // independently known native tangent rather than trusting its metadata.
  const motion = protectedJoin ? service.capture(s, time).state.motion : null;
  const hasPrefix = Number.isFinite(motion?.prefixLength);
  const prefixBoundary = hasPrefix ? (motion.prefixLength - motion.total) * SCALE + g.length : 0;
  const start = hasPrefix ? Math.max(0, Math.min(end, prefixBoundary)) : 0;
  const protectedHead = !hasPrefix || prefixBoundary <= end + 1e-7;
  // Prefix metadata locates the proposed boundary; it does not certify it.
  // Check the actual sample against the known native tangent, and prevent a
  // purported local prefix from swallowing arbitrary amounts of the body.
  if (hasPrefix && strictRail) {
    check(motion.prefixLength <= 2 * CELL + .01, `${label}: leading corner exceeds its two-cell local neighbourhood`);
    if (prefixBoundary >= 0)
      check(distance(g.sample(prefixBoundary), {x: protectedJoin.x * SCALE, y: protectedJoin.y * SCALE}) <= POSITION_EPSILON * SCALE,
        `${label}: proposed local-prefix join is not the independently known unchanged world tangent`);
  }
  if (strictRail && protectedHead) {
    check(distance(head, {x: g.head.x / SCALE, y: g.head.y / SCALE}) <= POSITION_EPSILON,
      `${label}: rigid nape attachment leaves the known rail`);
    check(Math.abs(Math.atan2(Math.sin(g.head.angle - head.angle), Math.cos(g.head.angle - head.angle))) < TANGENT_EPSILON,
      `${label}: rigid head orientation disagrees with its known nape tangent`);
    if (hasPrefix && start > 0 && end > start + .01)
      check(distance(g.sample(start), {x: protectedJoin.x * SCALE, y: protectedJoin.y * SCALE}) <= POSITION_EPSILON * SCALE,
        `${label}: known unchanged tangent is not preserved at its true material boundary`);
  }
  check(Math.abs(g.head.span / SCALE - HEAD) < 1e-7, `${label}: authored rigid head changes physical size`);
  check(distance(g.sample(g.length - g.head.span), g.head) < 1e-7,
    `${label}: rigid head detaches from the sampled body nape`);
  // A newly selected tail corner may legitimately reshape its leading cap.
  // That exception does NOT extend to the unchanged central body and nape.
  for (let n = 0; n <= 32; n++) {
    const p = g.sample(g.bodyEndDistance * n / 32);
    const fold = Math.abs(p.curve) * g.diameter / 2;
    if (fold > stats.maxPrefixFold) {
      stats.maxPrefixFold = fold; stats.worstFoldFrame = label; stats.worstFoldCommit = currentCommit;
    }
    check(Number.isFinite(fold) && fold < 1, `${label}: inner ribbon folds (${fold})`);
  }
  if (end - start > .01) {
    const count = 64;
    for (let i = 0; i <= count; i++) {
      const d = start + (end - start) * i / count;
      const p = g.sample(d), x = p.x / SCALE, y = p.y / SCALE;
      const at = rail.project(x, y, headAt - (end - d) / SCALE), q = rail.sample(at);
      const error = Math.hypot(x - q.x, y - q.y);
      const tangentError = Math.hypot(p.tx - q.tx, p.ty - q.ty);
      const curvature = Math.abs(p.curve) * SCALE;
      if (currentCommit && strictRail && !stats.firstRandomCoreFailure &&
          (error > POSITION_EPSILON || curvature > 1 / RADIUS + CURVE_EPSILON))
        stats.firstRandomCoreFailure = {label, error, curvature, point: i, distance: d / SCALE, commit: currentCommit};
      if (strictRail) {
        if (error > stats.maxRailError) { stats.maxRailError = error; stats.worstRailFrame = label; }
        stats.maxCoreCurvature = Math.max(stats.maxCoreCurvature, curvature);
        check(error <= POSITION_EPSILON, `${label}: body bows ${error} reference px off its actual rounded rail`);
        check(tangentError <= TANGENT_EPSILON, `${label}: rail tangent error ${tangentError}`);
        check(curvature <= 1 / RADIUS + CURVE_EPSILON,
          `${label}: unchanged body radius tightens below ${RADIUS}px (${curvature})`);
      } else stats.maxStressRailError = Math.max(stats.maxStressRailError, error);
      check(Math.abs(Math.hypot(p.tx, p.ty) - 1) < 1e-6, `${label}: non-unit tangent`);
      // A16px material interval on an accepted radius18 rail cannot have a
      // chord shorter than this. Unit arc length alone would miss pinching.
      const span = 16 * SCALE;
      if (d + span <= end) {
        const next = g.sample(d + span), chord = distance(p, next) / SCALE;
        const minimum = 2 * RADIUS * Math.sin(16 / (2 * RADIUS));
        if (strictRail) {
          stats.minChordRatio = Math.min(stats.minChordRatio, chord / minimum);
          check(chord >= minimum - .02, `${label}: local16px material span pinches to ${chord}px`);
        }
        stats.chordChecks++;
      }
      stats.points++;
    }
  }
  stats.frames++;
}

// A saved older geometry view is allowed to reactivate its own historical
// clock. That must not change a later bite/split clone's frozen source curve.
// Specifically, a local tail-corner prefix used to snapshot its source for
// painting but accidentally re-read the mutable original source in clone().
{
  const s = {body: copy(staircase), dir: {x: 1, y: 0}, reversing: false};
  const service = createLiveSnakeRenderer(), retreat = nativeRetreat(s); service.capture(s, 0);
  const step = (next, t) => {
    const oldBody = copy(s.body), wasReversing = !!s.reversing;
    if (!s.reversing) startRetreat(s);
    retreat(next); service.recordStep(s, {oldBody, t, duration: 436, wasReversing});
  };
  step({x: 4, y: -1}, 0);
  const historical = service.getWorldGeometry(s, 109);
  step({x: 3, y: -1}, 436);
  service.inspect(s, 600);
  const before = service.capture(s, 600).state.motion;
  historical.sample(0);
  const after = service.capture(s, 600).state.motion;
  for (const progress of [.15, .4, .8, 1]) {
    before.update(progress); after.update(progress);
    check(Math.abs(before.total - after.total) < .001, 'historical seek changes a later ghost material span');
    for (let i = 0; i <= 32; i++) {
      check(distance(before.sample(before.total * i / 32), after.sample(after.total * i / 32)) < .001,
        `historical seek changes captured corner ghost at progress${progress}, sample${i}`);
      stats.captureChecks++;
    }
  }
}

// Straight rear extension of an already curved body: absolutely NO part of
// the old visible rail needs replacing. Old cross-curve interpolation bowed
//7.49997px off this rail and reached curvature .09459, although no edge folded.
for (let rotation = 0; rotation < 4; rotation++) for (const mirror of [-1, 1]) {
  const map = ({x, y}) => {
    y *= mirror;
    for (let i = 0; i < rotation; i++) [x, y] = [-y, x];
    return {x: x + 20, y: y + 20};
  };
  const origin = map({x: 0, y: 0}), axis = map({x: 1, y: 0});
  const s = {body: staircase.map(map), dir: {x: axis.x - origin.x, y: axis.y - origin.y}, reversing: false};
  const service = createLiveSnakeRenderer(), retreat = nativeRetreat(s);
  service.capture(s, 0);
  const extensions = [{x: 4, y: -1}, {x: 4, y: -2}, {x: 4, y: -3}].map(map);
  const rail = makeLiveSnakePath([...extensions].reverse().concat([...s.body].reverse()), s.dir);
  const vacatedHeads = [];
  let time = 0;
  for (const [step, next] of extensions.entries()) {
    const oldBody = copy(s.body), before = service.inspect(s, time), wasReversing = !!s.reversing;
    if (!s.reversing) startRetreat(s);
    vacatedHeads.push({...s.body[0]});
    retreat(next);
    const logical = JSON.stringify(s);
    service.recordStep(s, {oldBody, t: time, duration: 436, wasReversing});
    assert.equal(JSON.stringify(s), logical, 'render adapter does not change native retreat decisions');
    const label = `fixed/${rotation}/${mirror}/reverse${step}`;
    checkJoin(service, s, before, time, label);
    for (let frame = 0; frame <= 48; frame++) inspectFrame(service, s, time + 436 * frame / 48, rail, `${label}/${frame}`);
    time += 436; stats.fixedCommits++;
  }
  // Return along the exact vacated head route. These native legal mode
  // switches must not introduce a cross-corner body morph either.
  for (const [step, next] of vacatedHeads.reverse().entries()) {
    const oldBody = copy(s.body), before = service.inspect(s, time), wasReversing = !!s.reversing;
    assert.ok(!s.body.slice(0, -1).some(cell => same(cell, next)));
    s.dir = {x: next.x - s.body[0].x, y: next.y - s.body[0].y};
    s.body = [next, ...s.body.slice(0, -1)]; s.reversing = false;
    service.recordStep(s, {oldBody, t: time, duration: 218, wasReversing});
    const label = `fixed/${rotation}/${mirror}/resume${step}`;
    checkJoin(service, s, before, time, label);
    for (let frame = 0; frame <= 48; frame++) inspectFrame(service, s, time + 218 * frame / 48, rail, `${label}/${frame}`);
    time += 218; stats.fixedCommits++;
  }
}

// Timing is a separate visual promise. On a straight rail the head retracts
// first, compressing the body; the tail then supplies most of its push in the
// second half. Merely running a rigid translation backwards cannot pass.
for (const count of [3, 7, 11]) for (let rotation = 0; rotation < 4; rotation++) {
  const d = directions[rotation];
  const s = {body: Array.from({length: count}, (_, i) => ({x: 20 - d.x * i, y: 20 - d.y * i})), dir: {...d}};
  const service = createLiveSnakeRenderer(), retreat = nativeRetreat(s); service.capture(s, 0);
  const oldBody = copy(s.body), tail = s.body.at(-1); startRetreat(s);
  retreat({x: tail.x - d.x, y: tail.y - d.y});
  service.recordStep(s, {oldBody, t: 0, duration: 436, wasReversing: false});
  const a = service.inspect(s, 0), b = service.inspect(s, 218), c = service.inspect(s, 436);
  const travel = (p, q) => (p.x - q.x) * d.x + (p.y - q.y) * d.y;
  const headEarly = travel(a.rear, b.rear), headLate = travel(b.rear, c.rear);
  const tailEarly = travel(a.tail, b.tail), tailLate = travel(b.tail, c.tail);
  check(headEarly > headLate * 2, `pulse/${count}/${rotation}: head must lead the retreat`);
  check(tailLate > tailEarly * 1.2, `pulse/${count}/${rotation}: tail push belongs mostly to the second half`);
  check(b.compression > 10 && Math.abs(a.compression) < 1e-7 && Math.abs(c.compression) < 1e-7,
    `pulse/${count}/${rotation}: gather/release must remain visible`);
  check(Math.abs(headEarly + headLate - CELL) < .001 && Math.abs(tailEarly + tailLate - CELL) < .001,
    `pulse/${count}/${rotation}: both ends complete exactly one native cell`);
}

// Seeded, native-legal choices: real retreatOneStep, body occupancy checks,
// both mode transitions, direction changes and interrupted visual cadence.
let seed;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
for (const interrupted of [false, true]) {
seed = 0x7e71ea7;
for (const count of [3, 7, 11, 2]) {
  const s = {body: Array.from({length: count}, (_, i) => ({x: 20 - i, y: 15})), dir: {x: 1, y: 0}, reversing: false};
  const service = createLiveSnakeRenderer(), retreat = nativeRetreat(s); service.capture(s, 0);
  let time = 0, headFuture = [], tailPast = [];
  for (let step = 0; step < 100; step++) {
    let backwards = step % 9 < 6;
    function choices(reverse) {
      const at = reverse ? s.body.at(-1) : s.body[0];
      const direction = reverse ? {x: at.x - s.body.at(-2).x, y: at.y - s.body.at(-2).y} : s.dir;
      return directions.filter(d => d.x !== -direction.x || d.y !== -direction.y)
        .map(d => ({x: at.x + d.x, y: at.y + d.y}))
        .filter(p => p.x >= 2 && p.y >= 2 && p.x <= 35 && p.y <= 35)
        .filter(p => !(reverse ? s.body : s.body.slice(0, -1)).some(cell => same(cell, p)));
    }
    let options = choices(backwards);
    if (!options.length) { backwards = !backwards; options = choices(backwards); }
    if (!options.length) break;
    const next = options[Math.floor(random() * options.length)];
    const oldBody = copy(s.body), before = service.inspect(s, time), wasReversing = !!s.reversing;
    const previousKind = service.capture(s, time).state.motion?.kind ?? 'static-or-material';
    if (backwards) {
      if (!s.reversing) startRetreat(s);
      retreat(next); s.reversing = true; stats.reverseCommits++;
    } else {
      s.dir = {x: next.x - s.body[0].x, y: next.y - s.body[0].y};
      s.body = [next, ...s.body.slice(0, -1)]; s.reversing = false;
    }
    if (backwards !== wasReversing) stats.modeSwitches++;
    const cells = [...oldBody].reverse();
    if (backwards) {
      cells.unshift(next); cells.push(...headFuture);
      headFuture = [oldBody[0], ...headFuture].slice(0, 3); tailPast = [];
    } else {
      cells.unshift(...tailPast); cells.push(next); headFuture = [];
      tailPast = [...tailPast, oldBody.at(-1)].slice(-3);
    }
    const rail = makeLiveSnakePath(cells, s.dir), duration = backwards ? 436 : 218;
    rail.headHint = rail.cellArcAt(backwards ? count - 1 : cells.length - 1) - HEAD / 2;
    const logical = JSON.stringify(s);
    service.recordStep(s, {oldBody, t: time, duration, wasReversing});
    currentCommit = {count, step, time, duration, interrupted, oldBody, body: copy(s.body), next, wasReversing, backwards,
      previousKind, kind: service.capture(s, time).state.motion?.kind ?? 'material'};
    assert.equal(JSON.stringify(s), logical, 'random render sampling preserves logical game state');
    const label = `${interrupted ? 'interrupted' : 'native'}/${count}/${step}/${backwards ? 'reverse' : 'forward'}`;
    checkJoin(service, s, before, time, label);
    const tail = oldBody.at(-1), neighbour = oldBody.at(-2);
    const protectedJoin = backwards ? {x: (tail.x + .5 + (neighbour.x - tail.x) / 2) * CELL,
      y: (tail.y + .5 + (neighbour.y - tail.y) / 2) * CELL} : null;
    for (let frame = 0; frame <= 12; frame++)
      inspectFrame(service, s, time + duration * frame / 12, rail, `${label}/${frame}`,
        {protectedJoin, strictRail: !interrupted});
    time += duration * (interrupted && step % 7 === 0 ? .8 : 1);
    stats.randomCommits++;
    if (interrupted) stats.interruptedCommits++; else stats.nativeRandomCommits++;
  }
}
}
assert.ok(stats.reverseCommits >= 80 && stats.modeSwitches >= 30, 'seed exercises retreat and both mode transitions');
const {worstFoldCommit, firstRandomCoreFailure, ...summary} = stats;
console.log(JSON.stringify({...summary, ...(failureCount ? {worstFoldCommit, firstRandomCoreFailure} : {}), failures, failureCount}, null, 2));
assert.equal(failureCount, 0, 'Reverse presentation preserves corridor shape, local span and head-first/tail-push cadence');
