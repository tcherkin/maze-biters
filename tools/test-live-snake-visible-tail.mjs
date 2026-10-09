import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';

// A curved nominal prefix is not sufficient: v97 put its first arc35.817
// reference pixels after the tip, beyond all28.0547px of painted tail. The
// two-cell creature therefore turned its tail as a rigid straight stick.
// Sample ONLY the actual tailRibbon interval returned by getWorldGeometry.
const TILE = 16, REFERENCE = 36, SCALE = TILE / REFERENCE;
const TAIL = 35 * (57 / 160 * REFERENCE) / 16 * SCALE;
const HEAD = 215.5 * (57 / 160 * REFERENCE) / 76 * SCALE;
const copy = value => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const directions = [{x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}];
const failures = [];
const stats = {turns: 0, frames: 0, samples: 0, captureChecks: 0, minPeakReverseDegrees: Infinity,
  minPeakCentralDegrees: Infinity, minPeakReverseSag: Infinity, minPeakForwardDegrees: Infinity,
  maxFold: 0, maxTailSizeError: 0, maxHeadSizeError: 0, maxCommitGap: 0,
  temporalHeadingChecks: 0, interruptedChecks: 0, biteChecks: 0, splitCaptureChecks: 0,
  maxBiteSetupGap: 0};
let failureCount = 0;
function check(ok, message) { if (!ok) { failureCount++; if (failures.length < 16) failures.push(message); } }
const engine = readFileSync(new URL('../src/engine/game.js', import.meta.url), 'utf8');
function nativeFunction(name) {
  const start = engine.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  assert.ok(start >= 0);
  for (let end = engine.indexOf('}', start); end >= 0; end = engine.indexOf('}', end + 1)) {
    const source = engine.slice(start, end + 1);
    try { new vm.Script(source); return source; } catch {}
  }
  throw Error(`Unterminated ${name}`);
}
const retreatSource = nativeFunction('retreatOneStep');
function tailMetrics(g, label, validate = true) {
  const tip = g.sample(0), base = g.sample(g.tailSpan), chord = distance(tip, base);
  let prior = tip, angle = 0, signed = 0, central = 0, sag = 0, polylineLength = 0;
  for (let i = 1; i <= 100; i++) {
    const p = g.sample(g.tailSpan * i / 100), delta = wrap(p.angle - prior.angle);
    angle += Math.abs(delta); signed += delta;
    if (i > 15 && i <= 85) central += Math.abs(delta);
    polylineLength += distance(prior, p);
    sag = Math.max(sag, Math.abs((p.x - tip.x) * (base.y - tip.y) - (p.y - tip.y) * (base.x - tip.x)) / Math.max(1e-9, chord));
    if (validate) {
      const fold = Math.abs(p.curve) * g.diameter / 2;
      stats.maxFold = Math.max(stats.maxFold, fold);
      check([p.x, p.y, p.angle, p.curve].every(Number.isFinite), `${label}: finite painted tail`);
      check(fold < 1, `${label}: painted tail ribbon folds (${fold})`);
      check(Math.abs(Math.hypot(p.tx, p.ty) - 1) < 1e-6, `${label}: tail tangent is not unit`);
      stats.samples++;
    }
    prior = p;
  }
  if (validate) {
    const tailError = Math.abs(g.tailSpan - TAIL), headError = Math.abs(g.head.span - HEAD);
    stats.maxTailSizeError = Math.max(stats.maxTailSizeError, tailError);
    stats.maxHeadSizeError = Math.max(stats.maxHeadSizeError, headError);
    check(tailError < 1e-7, `${label}: painted tail changes size (${g.tailSpan} vs ${TAIL})`);
    check(headError < 1e-7, `${label}: rigid head changes size`);
    check(Math.abs(polylineLength - g.tailSpan) < .002, `${label}: painted tail material is scaled or pinched`);
    check(distance(g.sample(g.length - g.head.span), g.head) < 1e-7, `${label}: head detaches from its nape`);
    check(g.indexAt(g.tailSpan * .5) === 1, `${label}: actual tail is still the native rear material`);
    check(Math.abs(angle - Math.abs(signed)) < .01, `${label}: a single90deg turn adds an unrelated S-bend`);
  }
  return {angle, central, sag};
}
function outline(g) { return Array.from({length: 33}, (_, i) => g.sample(g.tailSpan * i / 32)); }
function compareOutline(a, b, label, tolerance = .002) {
  for (let i = 0; i < a.length; i++) {
    const gap = distance(a[i], b[i]); stats.maxCommitGap = Math.max(stats.maxCommitGap, gap);
    check(gap < tolerance, `${label}: tail material point${i} jumps ${gap}px`);
    check(Math.abs(wrap(a[i].angle - b[i].angle)) < .002, `${label}: tail tangent jumps at point${i}`);
  }
}

for (let rotation = 0; rotation < 4; rotation++) for (const mirror of [-1, 1]) {
  const map = ({x, y}) => {
    y *= mirror;
    for (let i = 0; i < rotation; i++) [x, y] = [-y, x];
    return {x: x + 12, y: y + 12};
  };
  const head = map({x: 1, y: 0}), tail = map({x: 0, y: 0});
  const initial = {body: [head, tail], dir: {x: head.x - tail.x, y: head.y - tail.y}, reversing: false};
  // Forward control uses the same real artwork interval and native geometry.
  // This guards against a broken metric that only inspects a hidden rail arc.
  const forward = copy(initial), front = createLiveSnakeRenderer(); front.capture(forward, 0);
  const forwardOld = copy(forward.body), newHead = map({x: 1, y: 1});
  forward.body = [newHead, head]; forward.dir = {x: newHead.x - head.x, y: newHead.y - head.y};
  front.recordStep(forward, {oldBody: forwardOld, t: 0, duration: 218, wasReversing: false});
  let forwardBend = 0;
  for (let f = 0; f <= 100; f++) forwardBend = Math.max(forwardBend,
    tailMetrics(front.getWorldGeometry(forward, 218 * f / 100), 'forward-control', false).angle);
  stats.minPeakForwardDegrees = Math.min(stats.minPeakForwardDegrees, forwardBend * 180 / Math.PI);
  check(forwardBend > Math.PI / 3, `forward/${rotation}/${mirror}: control must visibly bend the painted tail`);

  for (const alreadyReversing of [false, true]) {
    const s = copy(initial); s.reversing = alreadyReversing;
    const service = createLiveSnakeRenderer(); service.capture(s, 0);
    const next = map({x: 0, y: 1});
    const native = vm.createContext({s, dirs: directions, playerAt: () => null,
      canEnter: (x, y) => x === next.x && y === next.y,
      chooseTailRetreatDirection() { throw Error('Exactly one native exit is available.'); }});
    vm.runInContext(retreatSource, native);
    const initialOutline = outline(service.getWorldGeometry(s, 0)), oldBody = copy(s.body);
    s.tailGuide = {...tail, dir: {x: tail.x - head.x, y: tail.y - head.y}};
    s.tailGuideHistory = [{...tail}]; s.reversing = true;
    assert.equal(vm.runInContext('retreatOneStep(s)', native), true);
    const nativeState = JSON.stringify(s);
    service.recordStep(s, {oldBody, t: 0, duration: 436, wasReversing: alreadyReversing});
    const label = `${rotation}/${mirror}/${alreadyReversing ? 'continuing' : 'entering'}`;
    compareOutline(initialOutline, outline(service.getWorldGeometry(s, 0)), `${label}/commit0`);
    let bend = 0, central = 0, sag = 0, priorHeadingProgress = -Infinity;
    for (let frame = 0; frame <= 400; frame++) {
      const phase = frame / 400, g = service.getWorldGeometry(s, 436 * phase);
      const m = tailMetrics(g, `${label}/${frame}`);
      const headingProgress = wrap(g.sample(0).angle - initialOutline[0].angle) / (-mirror * Math.PI / 2);
      check(headingProgress >= priorHeadingProgress - 1e-8, `${label}/${frame}: tail tip wobbles backwards during its turn`);
      check(headingProgress >= -1e-8 && headingProgress <= 1 + 1e-8, `${label}/${frame}: tail tip overshoots the native90deg turn`);
      priorHeadingProgress = headingProgress; stats.temporalHeadingChecks++;
      if (phase >= .1 && phase <= .9) {
        bend = Math.max(bend, m.angle); central = Math.max(central, m.central); sag = Math.max(sag, m.sag);
      }
      assert.equal(JSON.stringify(s), nativeState, 'visual sampling leaves all native decisions, body cells and guide state unchanged');
      stats.frames++;
    }
    stats.minPeakReverseDegrees = Math.min(stats.minPeakReverseDegrees, bend * 180 / Math.PI);
    stats.minPeakCentralDegrees = Math.min(stats.minPeakCentralDegrees, central * 180 / Math.PI);
    stats.minPeakReverseSag = Math.min(stats.minPeakReverseSag, sag);
    check(bend >= 25 * Math.PI / 180, `${label}: reverse turn never bends the painted tail by25degrees (peak${bend * 180 / Math.PI})`);
    check(central >= 10 * Math.PI / 180, `${label}: curvature remains hidden at the tail seam instead of crossing its painted middle`);
    check(sag >= .25, `${label}: painted tail remains a rigid straight chord (sag${sag}px)`);

    // Full endpoints and arbitrary seeking must preserve the SAME body, not
    // defer a snap until the native decision or a bite captures the pose.
    compareOutline(outline(service.getWorldGeometry(s, 0)), outline(service.getWorldGeometry(s, .0001)), `${label}/start-limit`);
    compareOutline(outline(service.getWorldGeometry(s, 436 - .0001)), outline(service.getWorldGeometry(s, 436)), `${label}/end-limit`);
    const early = service.getWorldGeometry(s, 109), expected = outline(early);
    const token = service.capture(s, 109), tokenPoint = token.state.motion.sample(token.state.motion.total * .2);
    service.getWorldGeometry(s, 420); compareOutline(expected, outline(early), `${label}/seek`);
    check(distance(tokenPoint, token.state.motion.sample(token.state.motion.total * .2)) < 1e-8,
      `${label}: captured eating pose changes when the renderer advances`);
    stats.captureChecks++;
    const finalOutline = outline(service.getWorldGeometry(s, 436)), secondOld = copy(s.body);
    const followingTail = map({x: 0, y: 2});
    native.canEnter = (x, y) => x === followingTail.x && y === followingTail.y;
    assert.equal(vm.runInContext('retreatOneStep(s)', native), true);
    service.recordStep(s, {oldBody: secondOld, t: 436, duration: 436, wasReversing: true});
    compareOutline(finalOutline, outline(service.getWorldGeometry(s, 436)), `${label}/next-native-commit`);
    stats.turns++;
  }
}

function activeTurn() {
  const s = {body: [{x: 11, y: 10}, {x: 10, y: 10}], dir: {x: 1, y: 0}, reversing: false};
  const service = createLiveSnakeRenderer(); service.capture(s, 0);
  const native = vm.createContext({s, dirs: directions, playerAt: () => null,
    canEnter: (x, y) => x === 10 && y === 11,
    chooseTailRetreatDirection() { throw Error('Exactly one native exit is available.'); }});
  vm.runInContext(retreatSource, native);
  const oldBody = copy(s.body); s.tailGuide = {x: 10, y: 10, dir: {x: -1, y: 0}};
  s.tailGuideHistory = [{x: 10, y: 10}]; s.reversing = true;
  assert.equal(vm.runInContext('retreatOneStep(s)', native), true);
  service.recordStep(s, {oldBody, t: 0, duration: 436, wasReversing: false});
  return {s, service, native};
}
for (const at of [109, 142, 218]) {
  // A shortened native interval can replace the turn at its visible peak.
  // The next step must preserve the already painted curved tail, not capture
  // only its old straight nominal prefix and straighten it at the commit.
  {
    const {s, service, native} = activeTurn();
    const before = outline(service.getWorldGeometry(s, at)), oldBody = copy(s.body);
    native.canEnter = (x, y) => x === 10 && y === 12;
    assert.equal(vm.runInContext('retreatOneStep(s)', native), true);
    service.recordStep(s, {oldBody, t: at, duration: 436, wasReversing: true});
    compareOutline(before, outline(service.getWorldGeometry(s, at)), `interrupted/${at}`);
    stats.interruptedChecks++;
  }
  {
    const {s, service} = activeTurn(), before = service.getWorldGeometry(s, at);
    const beforeTip = before.sample(0), token = service.capture(s, at);
    const tailCoordinate = token.state.motion.total - before.length / SCALE;
    const captured = Array.from({length: 33}, (_, i) => token.state.motion.sample(tailCoordinate + before.tailSpan / SCALE * i / 32));
    s.body.pop();
    const timing = service.biteTail(s, token, {t: at, player: {moveDuration: 95}});
    // Known separate schedule issue: trim.from uses the future visualStart
    // length. Report its small pre-animation shift; this test must not claim
    // it was introduced/fixed by the new curvature or hide it as zero.
    stats.maxBiteSetupGap = Math.max(stats.maxBiteSetupGap, distance(beforeTip, service.getWorldGeometry(s, at).sample(0)));
    let previousSpan = Infinity;
    for (let frame = 0; frame <= 100; frame++) {
      const t = at + (timing.endAt - at) * frame / 100, g = service.getWorldGeometry(s, t);
      check(g.tailSpan <= previousSpan + 1e-7, `bite/${at}/${frame}: consumed tail grows back`);
      previousSpan = g.tailSpan;
      check(Math.abs(g.head.span - HEAD) < 1e-7, `bite/${at}/${frame}: eating changes rigid head size`);
      for (let i = 0; i <= 16; i++) {
        const p = g.sample(g.tailSpan * i / 16);
        check([p.x, p.y, p.angle, p.curve].every(Number.isFinite), `bite/${at}/${frame}: invalid curved tail`);
        check(Math.abs(p.curve) * g.diameter / 2 < 1, `bite/${at}/${frame}: remaining tail folds`);
      }
      stats.biteChecks++;
    }
    const completed = service.getWorldGeometry(s, timing.endAt);
    check(completed.tailSpan < 1e-8 && completed.head.solo === 1, `bite/${at}: tail curvature disappears with consumed tail`);
    for (let i = 0; i < captured.length; i++) {
      const p = token.state.motion.sample(tailCoordinate + before.tailSpan / SCALE * i / 32);
      check(distance(captured[i], p) < 1e-8 && Math.abs(wrap(captured[i].angle - p.angle)) < 1e-8,
        `bite/${at}: consumed token loses its originally captured curved tail`);
      stats.captureChecks++;
    }
  }
  {
    const {s, service} = activeTurn(), g = service.getWorldGeometry(s, at), token = service.capture(s, at);
    const total = token.state.motion.total, tailCoordinate = total - g.length / SCALE;
    const rear = {body: [copy(s.body[1])], dir: {x: 0, y: 1}};
    service.split(s, [rear], token, {t: at, index: 0, player: {moveDuration: 95}});
    const source = service.capture(rear, at).state.path;
    for (let i = 0; i <= 32; i++) {
      const material = tailCoordinate + g.tailSpan / SCALE * i / 32;
      const before = token.state.motion.sample(material), after = source.sample(total - material);
      check(distance(before, after) < .002 && Math.abs(wrap(before.angle - after.angle - Math.PI)) < .002,
        `split/${at}/${i}: reversed newborn source loses the captured painted-tail bend`);
      stats.splitCaptureChecks++;
    }
  }
}
console.log(JSON.stringify({...stats, failures, failureCount}, null, 2));
assert.equal(failureCount, 0, 'Two-cell retreat bends the actual full-size painted tail, continuously and without changing native state');
