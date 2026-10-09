// Isolated motion study. The shared maze fixture remains unchanged.
import {
  CELL, WORLD_WIDTH, WORLD_HEIGHT, ROUTE_VERTICES, ROUTE_CELLS
} from '../snake-ready-v1/snake-maze-walk/game-maze.js?v=1.02.03.00';

export const TILE = CELL;
export const WIDTH = WORLD_WIDTH, HEIGHT = WORLD_HEIGHT;
export const W = WIDTH, H = HEIGHT;
export const MOVE_SECONDS = .218;
export const SPEED = TILE / MOVE_SECONDS;
export const WAIST = .4 * TILE;
export const RIGID = .8 * TILE;
export const CORNER_TRIM = TILE / 2;
export const LUT_STEPS = 512;

const HALF_PI = Math.PI / 2;
const mod = (value, period) => {
  const remainder = value % period;
  return remainder < 0 ? remainder + period : remainder;
};
const clamp01 = value => Math.max(0, Math.min(1, value));
const smootherstep = u => u * u * u * (u * (u * 6 - 15) + 10);
const smootherstepDerivative = u => 30 * u * u * (1 - u) * (1 - u);
const heading = u => HALF_PI * smootherstep(u);
const headingDerivative = u => HALF_PI * smootherstepDerivative(u);

// Integrate unit tangent, not an eased position. Distance is the independent
// variable, so a constant clock speed also means a constant route speed.
const integralX = new Float64Array(LUT_STEPS + 1);
const integralY = new Float64Array(LUT_STEPS + 1);
for (let i = 1; i <= LUT_STEPS; i++) {
  const a = (i - 1) / LUT_STEPS, b = i / LUT_STEPS, m = (a + b) / 2;
  const factor = (b - a) / 6;
  integralX[i] = integralX[i - 1] + factor * (
    Math.cos(heading(a)) + 4 * Math.cos(heading(m)) + Math.cos(heading(b)));
  integralY[i] = integralY[i - 1] + factor * (
    Math.sin(heading(a)) + 4 * Math.sin(heading(m)) + Math.sin(heading(b)));
}
// Symmetry gives equal x/y integrals. Averaging removes roundoff asymmetry.
const quarterIntegral = (integralX[LUT_STEPS] + integralY[LUT_STEPS]) / 2;
integralX[LUT_STEPS] = integralY[LUT_STEPS] = quarterIntegral;
export const CORNER_LENGTH = CORNER_TRIM / quarterIntegral;

// Quintic Hermite interpolation preserves position, tangent, and second
// derivative at every LUT knot. A linear LUT would introduce tiny kinks.
function hermiteIntegral(values, u, sine) {
  if (u <= 0) return 0;
  if (u >= 1) return quarterIntegral;
  const scaled = u * LUT_STEPS, i = Math.floor(scaled), v = scaled - i;
  const a = i / LUT_STEPS, b = (i + 1) / LUT_STEPS, h = 1 / LUT_STEPS;
  const ha = heading(a), hb = heading(b);
  const d0 = (sine ? Math.sin(ha) : Math.cos(ha)) * h;
  const d1 = (sine ? Math.sin(hb) : Math.cos(hb)) * h;
  const dd0 = (sine ? Math.cos(ha) : -Math.sin(ha)) * headingDerivative(a) * h * h;
  const dd1 = (sine ? Math.cos(hb) : -Math.sin(hb)) * headingDerivative(b) * h * h;
  const c0 = values[i], c1 = d0, c2 = dd0 / 2;
  const delta = values[i + 1] - c0 - c1 - c2;
  const velocity = d1 - c1 - 2 * c2, acceleration = dd1 - 2 * c2;
  const c3 = 10 * delta - 4 * velocity + acceleration / 2;
  const c4 = -15 * delta + 7 * velocity - acceleration;
  const c5 = 6 * delta - 3 * velocity + acceleration / 2;
  return c0 + v * (c1 + v * (c2 + v * (c3 + v * (c4 + v * c5))));
}

const corners = ROUTE_VERTICES.map((vertex, index, vertices) => {
  const previous = vertices[mod(index - 1, vertices.length)];
  const next = vertices[(index + 1) % vertices.length];
  const incoming = {x: Math.sign(vertex[0] - previous[0]), y: Math.sign(vertex[1] - previous[1])};
  const outgoing = {x: Math.sign(next[0] - vertex[0]), y: Math.sign(next[1] - vertex[1])};
  const turnSign = incoming.x * outgoing.y - incoming.y * outgoing.x;
  if (Math.abs(turnSign) !== 1) throw new Error('Scorpion fixture requires orthogonal quarter turns');
  return {
    vertexIndex: index, incoming, outgoing, turnSign,
    incomingAngle: Math.atan2(incoming.y, incoming.x),
    entry: {x: vertex[0] - incoming.x * CORNER_TRIM, y: vertex[1] - incoming.y * CORNER_TRIM},
    exit: {x: vertex[0] + outgoing.x * CORNER_TRIM, y: vertex[1] + outgoing.y * CORNER_TRIM}
  };
});

const pieces = [];
let total = 0;
function append(piece) {
  piece.start = total;
  piece.end = total + piece.length;
  piece.index = pieces.length;
  total = piece.end;
  pieces.push(Object.freeze(piece));
}
for (let i = 0; i < corners.length; i++) {
  const corner = corners[i];
  append({
    type: 'turn', vertexIndex: i, incomingAngle: corner.incomingAngle,
    turnSign: corner.turnSign, length: CORNER_LENGTH,
    entry: corner.entry, exit: corner.exit,
    point(localDistance, out = {}) {
      const u = clamp01(localDistance / CORNER_LENGTH);
      const x = CORNER_LENGTH * hermiteIntegral(integralX, u, false);
      const y = corner.turnSign * CORNER_LENGTH * hermiteIntegral(integralY, u, true);
      const angle = corner.incomingAngle + corner.turnSign * heading(u);
      out.x = corner.entry.x + corner.incoming.x * x - corner.incoming.y * y;
      out.y = corner.entry.y + corner.incoming.y * x + corner.incoming.x * y;
      out.angle = angle;
      out.tx = Math.cos(angle);
      out.ty = Math.sin(angle);
      out.u = u;
      out.curvature = corner.turnSign * headingDerivative(u) / CORNER_LENGTH;
      return out;
    }
  });
  const next = corners[(i + 1) % corners.length];
  const length = Math.hypot(next.entry.x - corner.exit.x, next.entry.y - corner.exit.y);
  // The fixture's one-cell U bend has touching turns and no intervening line.
  if (length < 1e-9) continue;
  const angle = Math.atan2(corner.outgoing.y, corner.outgoing.x);
  append({
    type: 'line', vertexIndex: i, incomingAngle: angle, length,
    entry: corner.exit, exit: next.entry,
    point(localDistance, out = {}) {
      const d = Math.max(0, Math.min(length, localDistance));
      out.x = corner.exit.x + corner.outgoing.x * d;
      out.y = corner.exit.y + corner.outgoing.y * d;
      out.angle = angle;
      out.tx = corner.outgoing.x;
      out.ty = corner.outgoing.y;
      out.curvature = 0;
      out.u = d / length;
      return out;
    }
  });
}

export const smoothRoute = Object.freeze({
  pieces: Object.freeze(pieces), total,
  point(distance, out = {}) {
    const s = mod(distance, total);
    let low = 0, high = pieces.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (s >= pieces[middle].end) low = middle + 1;
      else high = middle;
    }
    const piece = pieces[low];
    piece.point(s - piece.start, out);
    out.s = s;
    out.pieceIndex = low;
    out.type = piece.type;
    return out;
  }
});

// First outgoing seam: midway between native head (3,2) and tail (2,2).
export const START_DISTANCE = CORNER_LENGTH;
export const SMOOTH_LOOP_SECONDS = smoothRoute.total / SPEED;

// Distance is an absolute coordinate on the forward route. In reverse the
// caller decreases it; this function changes the facing direction only.
export function travelPoint(distance, reverse = false, out = {}) {
  smoothRoute.point(distance, out);
  if (reverse) {
    out.angle += Math.PI;
    out.tx = -out.tx;
    out.ty = -out.ty;
    out.curvature = -out.curvature;
  }
  return out;
}

export function scorpionPose(distance, reverse = false) {
  const direction = reverse ? -1 : 1;
  const seam = travelPoint(distance, reverse);
  const front = travelPoint(distance + direction * WAIST / 2, reverse);
  const rear = travelPoint(distance - direction * WAIST / 2, reverse);
  return {
    distance, reverse, seam, front, rear,
    nose: {...front, x: front.x + RIGID * front.tx, y: front.y + RIGID * front.ty},
    sting: {...rear, x: rear.x - RIGID * rear.tx, y: rear.y - RIGID * rear.ty}
  };
}

// Expand the prescribed loop into the same integer cells used by production
// logic. This is a comparison clock, not production AI or collision behavior.
export const NATIVE_ROUTE_CELLS = Object.freeze(ROUTE_CELLS.flatMap((cell, i) => {
  const next = ROUTE_CELLS[(i + 1) % ROUTE_CELLS.length];
  const dx = Math.sign(next[0] - cell[0]), dy = Math.sign(next[1] - cell[1]);
  const count = Math.abs(next[0] - cell[0]) + Math.abs(next[1] - cell[1]);
  return Array.from({length: count}, (_, step) => Object.freeze([cell[0] + dx * step, cell[1] + dy * step]));
}));
export const NATIVE_LOOP_SECONDS = NATIVE_ROUTE_CELLS.length * MOVE_SECONDS;
const nativeCell = index => {
  const [x, y] = NATIVE_ROUTE_CELLS[mod(index, NATIVE_ROUTE_CELLS.length)];
  return {x: (x + .5) * TILE, y: (y + .5) * TILE};
};

export function nativePose(time, reverse = false) {
  const elapsed = Math.max(0, time);
  // Avoid floating-point tick boundaries falling into the previous cell.
  const ticks = elapsed / MOVE_SECONDS;
  const tick = Math.floor(ticks + 1e-10);
  const phase = Math.max(0, Math.min(1, ticks - tick));
  const direction = reverse ? -1 : 1;
  const headIndex = (reverse ? 0 : 1) + direction * tick;
  const logicalHead = nativeCell(headIndex), logicalTail = nativeCell(headIndex - direction);
  const previousHead = nativeCell(headIndex - direction), previousTail = nativeCell(headIndex - 2 * direction);
  const dx = logicalHead.x - logicalTail.x, dy = logicalHead.y - logicalTail.y;
  const oldDx = previousHead.x - previousTail.x, oldDy = previousHead.y - previousTail.y;
  const snapMovement = tick === 0 || dx !== oldDx || dy !== oldDy;
  const progress = snapMovement ? 1 : Math.min(1, phase / .55);
  const interpolate = (a, b) => ({x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress});
  const head = interpolate(previousHead, logicalHead), tail = interpolate(previousTail, logicalTail);
  const angle = Math.atan2(dy, dx);
  return {
    head, tail, logicalHead, logicalTail,
    seam: {x: (head.x + tail.x) / 2, y: (head.y + tail.y) / 2},
    angle, frame: phase < .5 - 1e-10 ? 0 : 1, index: mod(headIndex, NATIVE_ROUTE_CELLS.length),
    tick, phase, progress, snapMovement, reverse,
    cellDuration: MOVE_SECONDS, moveDuration: MOVE_SECONDS * .55
  };
}
