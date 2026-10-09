import assert from 'node:assert/strict';
import {shapeDistance, sweepContact, createContactTracker, CONTACT_TOLERANCE}
  from '../src/engine/continuous-contact.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const circle = (x, y, r = 1, id = 'circle') => ({parts: [{id, kind: 'circle', x, y, r}]});
const polygon = (points, id = 'outline') => ({parts: [{id, kind: 'polygon', points: points.map(([x, y]) => ({x, y}))}]});
const box = (x, y, w, h, id) => polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], id);
const capsule = (ax, ay, bx, by, r = 1) => ({parts: [{id: 'capsule', kind: 'capsule', ax, ay, bx, by, r}]});
const constant = shape => () => shape;
let distanceChecks = 0, sweepChecks = 0;

const shapeCases = [
  [circle(0, 0), circle(5, 0), 3],
  [circle(0, 0), circle(2, 0), 0],
  [circle(0, 0, 2), circle(1, 0, 2), 0],
  [capsule(0, 0, 10, 0), capsule(12, 0, 20, 0), 0],
  [capsule(0, 0, 10, 0), capsule(0, 5, 10, 5), 3],
  [capsule(0, 0, 10, 10, 0), capsule(0, 10, 10, 0, 0), 0],
  [box(0, 0, 4, 4), box(6, 0, 4, 4), 2],
  [box(0, 0, 4, 4), box(4, 4, 4, 4), 0],
  [box(0, 0, 8, 8), box(2, 2, 1, 1), 0],
  [box(0, 0, 4, 4), circle(6, 2), 1],
  [box(0, 0, 4, 4), capsule(6, 1, 6, 3), 1],
  [box(0, 0, 4, 4), capsule(-2, 2, 6, 2, 0), 0],
  [polygon([[0, 0], [10, 0], [10, 3], [4, 3], [4, 7], [10, 7], [10, 10], [0, 10]], 'teeth'), circle(8, 5, .5), 1.5],
  [polygon([[0, 0], [12, -4], [12, 4]], 'tail-tip'), circle(-3, 0), 2]
];
for (const [a, b, expected] of shapeCases) {
  const beforeA = JSON.stringify(a), beforeB = JSON.stringify(b), out = {};
  assert.equal(shapeDistance(a, b, out), out); near(out.distance, expected);
  near(shapeDistance(b, a).distance, expected);
  assert.equal(out.partA, a.parts[0]); assert.equal(out.partB, b.parts[0]);
  assert.equal(JSON.stringify(a), beforeA); assert.equal(JSON.stringify(b), beforeB);
  distanceChecks += 2;
}
const hole = {parts: [box(0, 0, 2, 10, 'left').parts[0], box(8, 0, 2, 10, 'right').parts[0],
  box(2, 0, 6, 2, 'top').parts[0], box(2, 8, 6, 2, 'bottom').parts[0]]};
near(shapeDistance(hole, circle(5, 5, 1)).distance, 2);
near(shapeDistance(circle(0, 0, 2), circle(1, 0, 2)).normal.x, 1);
near(shapeDistance(circle(1, 0, 2), circle(0, 0, 2)).normal.x, -1);
assert.equal(shapeDistance({parts: []}, circle(0, 0)).distance, Infinity);
assert.throws(() => shapeDistance(polygon([[0, 0], [1, 0], [NaN, 1]]), circle(0, 0)), /finite/);
assert.throws(() => shapeDistance({parts: [{kind: 'circle', x: 0, y: 0, r: -1}]}, circle(0, 0)), /Invalid/);

// Sweeps catch complete crossings whose endpoints are both visibly separate,
// at wildly different speeds and all headings. No frame-sized sample step.
for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
  for (const speed of [.001, .01, .1, 1, 10, 100, 10000]) {
    for (const radius of [.001, .1, 1, 3]) {
      const dx = Math.cos(angle), dy = Math.sin(angle), start = 123, travel = 100;
      const a = time => circle((-50 + (time - start) * speed) * dx, (-50 + (time - start) * speed) * dy, radius);
      const event = sweepContact({sampleA: a, sampleB: constant(circle(0, 0, radius)), start,
        end: start + travel / speed, speedA: speed, speedB: 0});
      assert.ok(event, 'fast crossing must not tunnel');
      const expected = start + (50 - 2 * radius) / speed;
      assert.ok(event.time <= expected + 1e-7);
      assert.ok(expected - event.time <= CONTACT_TOLERANCE / speed + 1e-7);
      assert.ok(event.distance <= CONTACT_TOLERANCE);
      assert.ok(event.safeTime <= event.time);
      assert.ok(shapeDistance(a(start), circle(0, 0, radius)).distance > 0);
      assert.ok(shapeDistance(a(start + travel / speed), circle(0, 0, radius)).distance > 0);
      sweepChecks++;
    }
  }
}

// A tapered tail leading a retreat contacts a stationary human at its visible
// tip even though no player movement impulse or shared logical cell occurs.
const tail = time => polygon([[-time * .2, 0], [12 - time * .2, -4], [12 - time * .2, 4]], 'tail-material-19');
const retreat = sweepContact({sampleA: constant(circle(-5, 0)), sampleB: tail,
  start: 0, end: 100, speedA: 0, speedB: .2});
near(retreat.time, 20); assert.equal(retreat.partB.id, 'tail-material-19');
assert.equal(sweepContact({sampleA: constant(circle(0, 0)), sampleB: constant(circle(5, 0)),
  start: 0, end: 1e6, speedA: 0, speedB: 0}), null);
assert.equal(sweepContact({sampleA: constant(circle(0, 0)), sampleB: constant({parts: []}),
  start: 0, end: 1e6, speedA: 1, speedB: 1}), null);

// Curved motion and rotating thin parts use the same geometric sampler as the
// renderer. Their surface-speed bound includes angular/deformation movement.
for (let index = 0; index < 80; index++) {
  const radius = 8 + index / 10, omega = .01 + index / 10000;
  const moving = time => circle(radius * Math.cos(omega * time), radius * Math.sin(omega * time), .15);
  const fixed = circle(0, radius, .15);
  const event = sweepContact({sampleA: moving, sampleB: constant(fixed), start: 0,
    end: Math.PI / omega, speedA: radius * omega, speedB: 0});
  assert.ok(event); assert.ok(event.time < Math.PI / (2 * omega));
  assert.ok(shapeDistance(moving(event.time), fixed).distance <= CONTACT_TOLERANCE);
  const before = moving(event.time - .05);
  assert.ok(shapeDistance(before, fixed).distance > CONTACT_TOLERANCE);
  sweepChecks++;
}
const rotating = time => {
  const a = time * Math.PI / 100, c = Math.cos(a), s = Math.sin(a);
  return polygon([[-10, -.05], [10, -.05], [10, .05], [-10, .05]].map(([x, y]) => [x * c - y * s, x * s + y * c]));
};
const rotateHit = sweepContact({sampleA: rotating, sampleB: constant(circle(0, 8, .1)),
  start: 0, end: 100, speedA: Math.hypot(10, .05) * Math.PI / 100, speedB: 0});
assert.ok(rotateHit && rotateHit.time < 50);

// A jump to another atlas contour must be declared; the event is attributed
// to the change instant, not a fictitious interpolated shape beforehand.
const appearing = time => time < 50 ? {parts: []} : circle(0, 0);
const jump = sweepContact({sampleA: appearing, sampleB: constant(circle(0, 0)), start: 0,
  end: 100, speedA: 0, speedB: 0, breakpoints: [50]});
near(jump.time, 50); assert.equal(jump.discontinuous, true);
const initial = sweepContact({sampleA: constant(circle(0, 0)), sampleB: constant(circle(0, 0)),
  start: 17, end: 17, speedA: 0, speedB: 0});
assert.equal(initial.initialOverlap, true); near(initial.time, 17);
assert.throws(() => sweepContact({sampleA: rotating, sampleB: constant(circle(0, 8, .1)),
  start: 0, end: 100, speedA: 100, speedB: 0, maxIterations: 1}),
  error => error instanceof RangeError && Number.isFinite(error.safeTime));
assert.throws(() => sweepContact({sampleA: rotating, sampleB: rotating,
  start: 0, end: 1, speedA: Infinity, speedB: 0}), /Finite/);

// Coordinate subtraction can place an exactly authored contact skin a few
// ulps above its threshold. Resolve that numerical boundary in one probe;
// a meaningful positive gap still remains separated (no wider gameplay skin).
for(const origin of [0,128,1024])for(const tolerance of [.001,.025]){
  const a=circle(origin,origin,1),b=circle(origin+2+tolerance,origin,1);
  const hit=sweepContact({sampleA:constant(a),sampleB:constant(b),start:18000,end:18016,
    speedA:3,speedB:3,tolerance,maxIterations:4});
  assert.ok(hit);assert.equal(hit.iterations,1);assert.equal(hit.time,18000);
  assert.ok(hit.numericalAllowance<1e-9);
  assert.equal(sweepContact({sampleA:constant(a),sampleB:constant(circle(origin+2+tolerance+1e-6,origin,1)),
    start:18000,end:18016,speedA:0,speedB:0,tolerance}),null);
}

// A long render interval gives the same earliest event as smaller intervals.
for (const rate of [30, 60, 120]) {
  const a = time => circle(-20 + .25 * time, 0, 1);
  let sliced = null;
  for (let t = 0; t < 200 && !sliced; t += 1000 / rate) {
    sliced = sweepContact({sampleA: a, sampleB: constant(circle(0, 0)),
      start: t, end: Math.min(200, t + 1000 / rate), speedA: .25, speedB: 0});
  }
  near(sliced.time, 72, .0041); sweepChecks++;
}

const tracker = createContactTracker(), player = {}, snake = {};
assert.equal(tracker.claim(player, 'mouth', snake, 'tail-material-9'), true);
assert.equal(tracker.claim(snake, 'tail-material-9', player, 'mouth'), false, 'pair order does not duplicate');
assert.equal(tracker.claim(player, 'mouth', snake, 'tail-material-8'), true, 'new tail can be eaten without a cooldown');
assert.equal(tracker.size, 2);
assert.equal(tracker.release(player, 'mouth', snake, 'tail-material-9'), true);
assert.equal(tracker.claim(player, 'mouth', snake, 'tail-material-9'), true, 'a measured separation rearms contact');
tracker.forgetActor(snake); assert.equal(tracker.size, 0);
tracker.claim(player, 'mouth', snake, 'tail-material-8'); tracker.reset(); assert.equal(tracker.size, 0);

// Exact edge-AABB pruning: compare against an independent unpruned reference
// on detailed disjoint concave outlines, not only low-vertex primitives.
{
  const ring=(cx,n,r)=>Array.from({length:n},(_,i)=>{const angle=i/n*2*Math.PI;
    const radius=r*(1+.12*Math.cos(angle*7));return {x:cx+Math.cos(angle)*radius,y:Math.sin(angle)*radius};});
  const a={parts:[{id:'jaw',kind:'polygon',points:ring(0,73,7)}]};
  const b={parts:[{id:'scorpion',kind:'polygon',points:ring(30,311,16)}]};
  const squared=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y;
    const u=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    return (p.x-a.x-u*dx)**2+(p.y-a.y-u*dy)**2;};
  let reference=Infinity;
  for(const [one,two] of [[a,b],[b,a]])for(const p of one.parts[0].points)
    for(let j=0;j<two.parts[0].points.length;j++)reference=Math.min(reference,squared(p,two.parts[0].points[j],two.parts[0].points[(j+1)%two.parts[0].points.length]));
  const out={metrics:{}};shapeDistance(a,b,out);near(out.distance,Math.sqrt(reference),1e-10);
  assert.ok(out.metrics.edgeRejects/out.metrics.edgePairs>.95,'detailed outlines reject over95% of unnecessary segment-distance tests');
  console.log(`Detailed-outline pruning: ${out.metrics.segmentTests}/${out.metrics.edgePairs} exact segment tests; distance identical to brute force.`);
}

console.log(`PASS continuous contact: ${distanceChecks} exact geometry checks, ${sweepChecks} swept crossings/curves/rate checks; ` +
  'tooth gap, tapered retreat tip, rotation, atlas discontinuities, budget safety and material-identity dedupe.');
