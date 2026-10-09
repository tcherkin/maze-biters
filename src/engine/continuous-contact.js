// Pure world-space contact geometry. No DOM, Canvas, clock or game rules.
// A shape is {parts:[...]}; each part is a filled simple polygon, capsule or
// circle. Concave silhouettes are allowed; holes require a union of parts
// (for example cached opaque-alpha row runs), not a hull across the opening.
// Keep part.id tied to material/generation, never a mutable snake array index.
const EPS = 1e-12;
export const CONTACT_TOLERANCE = .001;

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
function pointSegment(px, py, ax, ay, bx, by, out) {
  const dx = bx - ax, dy = by - ay, square = dx * dx + dy * dy;
  const u = square > EPS ? clamp(((px - ax) * dx + (py - ay) * dy) / square, 0, 1) : 0;
  out.x = ax + u * dx; out.y = ay + u * dy;
  return (px - out.x) ** 2 + (py - out.y) ** 2;
}
function segmentDistanceSquared(ax, ay, bx, by, cx, cy, dx, dy, out) {
  const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy;
  const cross = ux * vy - uy * vx;
  if (Math.abs(cross) > EPS) {
    const wx = cx - ax, wy = cy - ay;
    const s = (wx * vy - wy * vx) / cross, t = (wx * uy - wy * ux) / cross;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
      out.ax = out.bx = ax + s * ux; out.ay = out.by = ay + s * uy;
      return 0;
    }
  }
  const point = out.scratch || (out.scratch = {});
  let best = pointSegment(ax, ay, cx, cy, dx, dy, point);
  out.ax = ax; out.ay = ay; out.bx = point.x; out.by = point.y;
  let value = pointSegment(bx, by, cx, cy, dx, dy, point);
  if (value < best) { best = value; out.ax = bx; out.ay = by; out.bx = point.x; out.by = point.y; }
  value = pointSegment(cx, cy, ax, ay, bx, by, point);
  if (value < best) { best = value; out.ax = point.x; out.ay = point.y; out.bx = cx; out.by = cy; }
  value = pointSegment(dx, dy, ax, ay, bx, by, point);
  if (value < best) { best = value; out.ax = point.x; out.ay = point.y; out.bx = dx; out.by = dy; }
  return best;
}
function inside(x, y, points) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
function geometry(part, out) {
  out ||= {points: [], radius: 0};
  if (part.kind === 'polygon') {
    if (!Array.isArray(part.points) || part.points.length < 3) throw new TypeError('Polygon needs at least three points');
    out.points = part.points; out.radius = 0; return out;
  }
  const points = out.roundPoints || (out.roundPoints = [{x: 0, y: 0}, {x: 0, y: 0}]);
  if (part.kind === 'circle') {
    if (!(part.r >= 0) || ![part.x, part.y, part.r].every(Number.isFinite)) throw new TypeError('Invalid circle');
    points[0].x = part.x; points[0].y = part.y;
    out.singlePoint || (out.singlePoint = [points[0]]);
    out.points = out.singlePoint; out.radius = part.r; return out;
  }
  if (part.kind === 'capsule') {
    if (!(part.r >= 0) || ![part.ax, part.ay, part.bx, part.by, part.r].every(Number.isFinite)) throw new TypeError('Invalid capsule');
    points[0].x = part.ax; points[0].y = part.ay; points[1].x = part.bx; points[1].y = part.by;
    out.points = points; out.radius = part.r; return out;
  }
  throw new TypeError(`Unknown contact part kind: ${part.kind}`);
}
function boundsOf(geometry, out = {}) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of geometry.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError('Contact points must be finite');
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  out.minX = minX - geometry.radius; out.minY = minY - geometry.radius;
  out.maxX = maxX + geometry.radius; out.maxY = maxY + geometry.radius;
  return out;
}
function boundsGap(a, b) {
  return Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX),
    Math.max(0, a.minY - b.maxY, b.minY - a.maxY));
}
function boundsContain(bounds, point) {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}
function prepareEdges(g) {
  const points = g.points, edges = g.edges || (g.edges = []);
  g.edgeCount = points.length === 2 ? 1 : points.length;
  for (let i = 0; i < g.edgeCount; i++) {
    const a = points[i], b = points[(i + 1) % points.length], edge = edges[i] || (edges[i] = {});
    edge.ax = a.x; edge.ay = a.y; edge.bx = b.x; edge.by = b.y;
    edge.minX = Math.min(a.x, b.x); edge.minY = Math.min(a.y, b.y);
    edge.maxX = Math.max(a.x, b.x); edge.maxY = Math.max(a.y, b.y);
  }
  g.treeReady = false;
}
function prepareEdgeTree(g) {
  if(g.treeReady)return;
  const nodes=g.edgeNodes||(g.edgeNodes=[]),edges=g.edges;
  function build(start,end,index){
    const node=nodes[index]||(nodes[index]={});node.start=start;node.end=end;
    if(end-start<=4){
      node.left=-1;node.minX=node.minY=Infinity;node.maxX=node.maxY=-Infinity;
      for(let i=start;i<end;i++){
        node.minX=Math.min(node.minX,edges[i].minX);node.minY=Math.min(node.minY,edges[i].minY);
        node.maxX=Math.max(node.maxX,edges[i].maxX);node.maxY=Math.max(node.maxY,edges[i].maxY);
      }
    }else{
      const middle=(start+end)>>1;node.left=index*2+1;node.right=index*2+2;
      const a=build(start,middle,node.left),b=build(middle,end,node.right);
      node.minX=Math.min(a.minX,b.minX);node.minY=Math.min(a.minY,b.minY);
      node.maxX=Math.max(a.maxX,b.maxX);node.maxY=Math.max(a.maxY,b.maxY);
    }
    return node;
  }
  build(0,g.edgeCount,0);g.treeReady=true;
}
function partDistance(a, b, out, scratch, limit = Infinity, metrics) {
  const ap = a.points, bp = b.points;
  out.nx = out.ny = 0;
  let best = (limit + a.radius + b.radius) ** 2, found = false;
  if (ap.length > 2 && boundsContain(a.bounds, bp[0]) && inside(bp[0].x, bp[0].y, ap)) {
    out.ax = out.bx = bp[0].x; out.ay = out.by = bp[0].y; best = 0; found = true;
  } else if (bp.length > 2 && boundsContain(b.bounds, ap[0]) && inside(ap[0].x, ap[0].y, bp)) {
    out.ax = out.bx = ap[0].x; out.ay = out.by = ap[0].y; best = 0; found = true;
  }
  if(best>0){
    if(!a.edgesReady){prepareEdges(a);a.edgesReady=true;}
    if(!b.edgesReady){prepareEdges(b);b.edgesReady=true;}
  }
  if(metrics)metrics.edgePairs=(metrics.edgePairs||0)+a.edgeCount*b.edgeCount;
  function evaluateEdges(startA,endA,startB,endB){
    for(let i=startA;i<endA&&best>0;i++)for(let j=startB;j<endB&&best>0;j++){
      const aa=a.edges[i],bb=b.edges[j];
      const dx = Math.max(0, aa.minX - bb.maxX, bb.minX - aa.maxX);
      const dy = Math.max(0, aa.minY - bb.maxY, bb.minY - aa.maxY);
      if (dx * dx + dy * dy >= best) {
        if (metrics) metrics.edgeRejects = (metrics.edgeRejects || 0) + 1;
        continue;
      }
      if (metrics) metrics.segmentTests = (metrics.segmentTests || 0) + 1;
      const distance = segmentDistanceSquared(aa.ax, aa.ay, aa.bx, aa.by, bb.ax, bb.ay, bb.bx, bb.by, scratch);
      if (distance < best) {
        best = distance; found = true; out.ax = scratch.ax; out.ay = scratch.ay; out.bx = scratch.bx; out.by = scratch.by;
      }
    }
  }
  if(best>0&&a.edgeCount*b.edgeCount>128){
    prepareEdgeTree(a);prepareEdgeTree(b);
    const stackA=scratch.stackA||(scratch.stackA=[]),stackB=scratch.stackB||(scratch.stackB=[]);
    let count=1;stackA[0]=stackB[0]=0;
    while(count&&best>0){
      const na=a.edgeNodes[stackA[--count]],nb=b.edgeNodes[stackB[count]];
      const dx=Math.max(0,na.minX-nb.maxX,nb.minX-na.maxX),dy=Math.max(0,na.minY-nb.maxY,nb.minY-na.maxY);
      if(metrics)metrics.edgeNodePairs=(metrics.edgeNodePairs||0)+1;
      if(dx*dx+dy*dy>=best){
        if(metrics)metrics.edgeRejects=(metrics.edgeRejects||0)+(na.end-na.start)*(nb.end-nb.start);
        continue;
      }
      if(na.left<0&&nb.left<0)evaluateEdges(na.start,na.end,nb.start,nb.end);
      else if(nb.left<0||(na.left>=0&&na.end-na.start>=nb.end-nb.start)){
        const bi=stackB[count];stackA[count]=na.left;stackB[count++]=bi;stackA[count]=na.right;stackB[count++]=bi;
      }else{
        const ai=stackA[count];stackA[count]=ai;stackB[count++]=nb.left;stackA[count]=ai;stackB[count++]=nb.right;
      }
    }
  }else if(best>0)evaluateEdges(0,a.edgeCount,0,b.edgeCount);
  if (!found) return Infinity;
  best = Math.sqrt(best);
  if (best > EPS) {
    const nx = (out.bx - out.ax) / best, ny = (out.by - out.ay) / best;
    out.nx = nx; out.ny = ny;
    out.ax += nx * a.radius; out.ay += ny * a.radius;
    out.bx -= nx * b.radius; out.by -= ny * b.radius;
  }
  return Math.max(0, best - a.radius - b.radius);
}

// Returns closest *opaque geometry*, not a cell or convex-hull approximation.
// partA/partB are the original part objects, preserving caller semantic tags.
export function shapeDistance(shapeA, shapeB, out = {}) {
  if (!shapeA?.parts || !shapeB?.parts) throw new TypeError('Contact shape needs parts');
  const aa = out._a || (out._a = []), bb = out._b || (out._b = []);
  function prepare(parts, entries) {
    for (let i = 0; i < parts.length; i++) {
      const entry = entries[i] || (entries[i] = {g: {}, bounds: {}});
      entry.part = parts[i]; geometry(entry.part, entry.g); boundsOf(entry.g, entry.bounds);
      entry.g.bounds = entry.bounds; entry.g.edgesReady = false;
      entry.g.edgeCount = entry.g.points.length === 2 ? 1 : entry.g.points.length;
    }
  }
  prepare(shapeA.parts, aa); prepare(shapeB.parts, bb);
  let best = Infinity, hitA = null, hitB = null;
  const candidate = out._candidate || (out._candidate = {}), scratch = out._scratch || (out._scratch = {});
  const pointA = out.pointA || (out.pointA = {}), pointB = out.pointB || (out.pointB = {});
  const normal = out.normal || (out.normal = {});
  pointA.x = pointA.y = pointB.x = pointB.y = normal.x = normal.y = 0;
  outer: for (let i = 0; i < shapeA.parts.length; i++) for (let j = 0; j < shapeB.parts.length; j++) {
    const a = aa[i], b = bb[j];
    if (boundsGap(a.bounds, b.bounds) >= best) continue;
    const distance = partDistance(a.g, b.g, candidate, scratch, best, out.metrics);
    if (distance < best) {
      best = distance; hitA = a.part; hitB = b.part;
      pointA.x = candidate.ax; pointA.y = candidate.ay; pointB.x = candidate.bx; pointB.y = candidate.by;
      normal.x = candidate.nx; normal.y = candidate.ny;
      if (best === 0) break outer;
    }
  }
  out.distance = best; out.partA = hitA; out.partB = hitB;
  return out;
}

// Conservative advancement cannot tunnel when speedA/B bound the maximum
// world-space speed of EVERY surface point over the interval, including
// deformation/rotation. Time units are caller-defined; speeds use px/unit.
// Supply every discrete sprite/atlas change in breakpoints. A finite bound
// cannot represent teleports, appearing parts or unannounced shape changes.
// Empty shapes mean no contact; a later appearance requires a breakpoint.
export function sweepContact({sampleA, sampleB, start, end, speedA, speedB,
  tolerance = CONTACT_TOLERANCE, breakpoints = [], maxIterations = 4096}) {
  if (typeof sampleA !== 'function' || typeof sampleB !== 'function') throw new TypeError('Two shape samplers required');
  if (![start, end, speedA, speedB, tolerance].every(Number.isFinite) || end < start ||
      speedA < 0 || speedB < 0 || tolerance <= 0 || !Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new RangeError('Finite ordered times, nonnegative speed bounds and positive tolerance/budget required');
  }
  const stops = [...new Set(breakpoints.filter(time => Number.isFinite(time) && time > start && time <= end)), end].sort((a, b) => a - b);
  const speed = speedA + speedB, stateA = {}, stateB = {}, distance = {};
  let time = start, safeTime = start, iterations = 0, stopIndex = 0, previous = null;
  while (true) {
    if (++iterations > maxIterations) {
      const error = new RangeError('Continuous contact iteration budget exhausted; do not advance past safeTime');
      error.safeTime = safeTime; error.time = time; error.iterations = iterations - 1;
      throw error;
    }
    shapeDistance(sampleA(time, stateA), sampleB(time, stateB), distance);
    // Comparisons at the contact boundary need the same machine-precision
    // allowance as the world-coordinate subtraction that produced distance.
    // This is normally ~1e-11px here, not an extra gameplay collision skin.
    const numericalAllowance=64*Number.EPSILON*Math.max(1,tolerance,
      Math.abs(distance.pointA.x),Math.abs(distance.pointA.y),Math.abs(distance.pointB.x),Math.abs(distance.pointB.y));
    if (distance.distance <= tolerance + numericalAllowance) {
      // At exact coincidence the closest-point normal can be indeterminate;
      // retain the preceding separated normal, useful to the contact resolver.
      const n = Math.hypot(distance.normal.x, distance.normal.y) > EPS ? distance.normal : previous?.normal || distance.normal;
      return {time, safeTime, distance: distance.distance, iterations, numericalAllowance,
        initialOverlap: time === start && distance.distance === 0,
        atTolerance: distance.distance > 0,
        discontinuous: time !== start && breakpoints.includes(time),
        point: {x: (distance.pointA.x + distance.pointB.x) / 2, y: (distance.pointA.y + distance.pointB.y) / 2},
        pointA: {...distance.pointA}, pointB: {...distance.pointB}, normal: {...n},
        partA: distance.partA, partB: distance.partB};
    }
    if (time >= end) return null;
    safeTime = time;
    previous = {normal: {...distance.normal}};
    while (stopIndex < stops.length && stops[stopIndex] <= time) stopIndex++;
    const stop = stops[stopIndex] ?? end;
    const safeStep = speed > 0 && Number.isFinite(distance.distance) ? distance.distance / speed : Infinity;
    const next = Math.min(stop, time + safeStep);
    if (!(next > time)) {
      const error = new RangeError('Continuous contact lost time precision; do not advance past safeTime');
      error.safeTime = safeTime; throw error;
    }
    time = next;
  }
}

// Explicit active-contact identities, not a time cooldown. A newly exposed
// tail/fragment must have a new material part id and can trigger immediately.
// Release only after measured separation or semantic removal; forget actors
// on death/removal, and reset when the simulation clock/world is replaced.
export function createContactTracker() {
  let sequence = 0;
  const identities = new Map(), active = new Map();
  function identity(value) {
    if (!identities.has(value)) identities.set(value, ++sequence);
    return identities.get(value);
  }
  function key(actorA, partA, actorB, partB) {
    const a = `${identity(actorA)}:${identity(partA)}`, b = `${identity(actorB)}:${identity(partB)}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  return Object.freeze({
    claim(actorA, partA, actorB, partB) {
      const id = key(actorA, partA, actorB, partB);
      if (active.has(id)) return false;
      active.set(id, {actorA, actorB}); return true;
    },
    release(actorA, partA, actorB, partB) { return active.delete(key(actorA, partA, actorB, partB)); },
    forgetActor(actor) {
      for (const [id, pair] of active) if (pair.actorA === actor || pair.actorB === actor) active.delete(id);
      identities.delete(actor);
    },
    reset() { active.clear(); identities.clear(); sequence = 0; },
    get size() { return active.size; }
  });
}
