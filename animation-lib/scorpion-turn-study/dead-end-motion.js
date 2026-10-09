// Explicit study fixtures: a narrow dead end with a room behind it, and a
// dead end inside a room. Neither fixture changes the frozen maze or game AI.
import {TILE, WIDTH, HEIGHT, SPEED, MOVE_SECONDS, WAIST} from './motion.js';

export {TILE, WIDTH, HEIGHT};
export const DEAD_END_TURN_SECONDS = 3 * MOVE_SECONDS;
export const DEAD_END_RETREAT_SPEED = SPEED / 2;
export const DEAD_END_FLIP_SECONDS = .85;
export const DEAD_END_EXCHANGE_SECONDS = .85;
export const DEAD_END_COMPACT_SECONDS = .85;
export const COMPACT_MIN_SCALE = .66;
export const DEAD_END_LANDING_SECONDS = .16;
export const DEAD_END_FLIP_HEIGHT = 1.55 * TILE;
export const DEAD_END_LANDING_HEIGHT = .055 * TILE;
const EASE_SECONDS = MOVE_SECONDS;
const WALL_HOLD_SECONDS = .09;
const TURN_HOLD_SECONDS = .08;
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = u => u * u * u * (u * (u * 6 - 15) + 10);
const smoothDerivative = u => 30 * u * u * (1 - u) * (1 - u);
const smoothSecondDerivative = u => 60 * u * (1 - u) * (1 - 2 * u);
// Integral from 0 to u of smootherstep. Its value at 1 is exactly one half.
const smoothIntegral = u => u * u * u * u * (u * u - 3 * u + 2.5);
const liftShape = u => 64 * u * u * u * (1 - u) * (1 - u) * (1 - u);
const liftDerivative = u => 192 * u * u * (1 - u) * (1 - u) * (1 - 2 * u);
const liftSecondDerivative = u => 384 * u - 2304 * u * u + 3840 * u * u * u - 1920 * u * u * u * u;

// Uniform size only: the source shape is not bent or stretched. The minimum
// retains a raster margin against the measured bright wall paint; faint
// lighting halos are not treated as solid walls.
export function compactScale(progress, minimum = COMPACT_MIN_SCALE) {
  if (!(minimum > 0 && minimum <= 1)) throw new RangeError('Compact scale minimum must be in (0, 1]');
  return 1 - (1 - minimum) * liftShape(clamp01(progress));
}

function buildVariant(id, startCell, turnCell, exitCell, roomFirstCell, label) {
  const geometry = Object.freeze({
    width: WIDTH, height: HEIGHT, tile: TILE,
    corridor: Object.freeze({row: 7, x1: 1, x2: 17}),
    room: Object.freeze({x1: roomFirstCell, x2: roomFirstCell + 3, y1: 6, y2: 8}),
    startX: startCell * TILE, stopX: 17 * TILE,
    turnX: turnCell * TILE, exitX: exitCell * TILE, y: 7.5 * TILE
  });
  const phases = [];
  let clock = 0, x = geometry.startX;
  function append(stage, phase, phaseLabel, kind, duration, velocity = 0) {
    const distance = velocity * duration * (kind === 'cruise' || kind === 'reposition' ? 1 :
      kind === 'accelerate' || kind === 'decelerate' ? .5 : 0);
    phases.push(Object.freeze({
      stage, phase, phaseLabel, kind, start: clock, end: clock + duration,
      duration, fromX: x, toX: x + distance, velocity
    }));
    x += distance;
    clock += duration;
  }
  function travelTo(target, velocity, phase, label) {
    const distance = Math.abs(target - x);
    const easedDistance = Math.abs(velocity) * EASE_SECONDS;
    if (distance < easedDistance - 1e-8)
      throw new Error('Dead-end fixture has insufficient distance for its speed ramps');
    append(`${phase}-accelerate`, phase, label, 'accelerate', EASE_SECONDS, velocity);
    const cruiseDuration = (distance - easedDistance) / Math.abs(velocity);
    if (cruiseDuration > 1e-12)
      append(`${phase}-cruise`, phase, label, 'cruise', cruiseDuration, velocity);
    append(`${phase}-decelerate`, phase, label, 'decelerate', EASE_SECONDS, velocity);
    // Suppress roundoff so the following stationary pivot uses the exact seam.
    x = target;
  }

  // The recorded sequence starts with an already-cruising creature. Brake
  // half a cell early: the integrated .218-second ramp travels exactly .5T.
  const approachDistance = geometry.stopX - geometry.startX - SPEED * EASE_SECONDS / 2;
  append('approach-cruise', 'approach', 'Приближава задънената улица',
    'cruise', approachDistance / SPEED, SPEED);
  const brakeStart = clock;
  append('approach-brake', 'brake', 'Спира пред стената', 'decelerate', EASE_SECONDS, SPEED);
  x = geometry.stopX;
  const approachEnd = clock, brakeEnd = clock;
  append('wall-hold', 'hold', 'Пауза пред стената', 'still', WALL_HOLD_SECONDS);
  const retreatStart = clock;
  if (id === 'somersault' || id === 'exchange') {
    append('recoil', 'recoil', 'Отдръпва се от стената', 'reposition', EASE_SECONDS,
      (geometry.turnX - x) / EASE_SECONDS);
    x = geometry.turnX;
  } else if (id !== 'compact') {
    travelTo(geometry.turnX, -DEAD_END_RETREAT_SPEED, 'retreat', 'Отстъпва към мястото за обръщане');
  }
  const retreatEnd = clock;
  if (id !== 'somersault' && id !== 'exchange' && id !== 'compact')
    append('turn-hold', 'turn-hold', 'Спира в мястото за обръщане', 'still', TURN_HOLD_SECONDS);
  const turnStart = clock;
  const turnPhase = id === 'somersault' ? 'flip' : id === 'exchange' ? 'exchange' :
    id === 'compact' ? 'compact' : 'turn';
  append(turnPhase, turnPhase,
    id === 'somersault' ? 'Превъртане през глава' :
      id === 'exchange' ? 'Щипките и опашката разменят местата си' :
      id === 'compact' ? 'Обръща се по часовниковата стрелка' : 'Обръща се плавно на 180°',
    turnPhase, id === 'somersault' ? DEAD_END_FLIP_SECONDS :
      id === 'exchange' ? DEAD_END_EXCHANGE_SECONDS :
      id === 'compact' ? DEAD_END_COMPACT_SECONDS : DEAD_END_TURN_SECONDS);
  const turnEnd = clock;
  const compactStart = id === 'compact' ? turnStart : null;
  const compactEnd = id === 'compact' ? turnEnd : null;
  const exchangeStart = id === 'exchange' ? turnStart : null;
  const exchangeEnd = id === 'exchange' ? turnEnd : null;
  const flipStart = id === 'somersault' ? turnStart : null;
  const flipEnd = id === 'somersault' ? turnEnd : null;
  const landingStart = id === 'somersault' ? clock : null;
  if (id === 'somersault')
    append('landing', 'landing', 'Приземява се', 'landing', DEAD_END_LANDING_SECONDS);
  const landingEnd = id === 'somersault' ? clock : null;
  const departStart = clock;
  travelTo(geometry.exitX, -SPEED, 'depart', 'Излиза от задънената улица');
  const duration = clock;
  const timeline = Object.freeze({
    brakeStart, brakeEnd, approachEnd, retreatStart, retreatEnd,
    turnStart, turnEnd, compactStart, compactEnd, exchangeStart, exchangeEnd,
    flipStart, flipEnd, landingStart, landingEnd,
    departStart, departEnd: duration, duration,
    phases: Object.freeze(phases)
  });
  return Object.freeze({
    id, label, ...geometry, geometry, timeline, phases: timeline.phases,
    brakeStart, brakeEnd, approachEnd, retreatStart, retreatEnd,
    turnStart, turnEnd, compactStart, compactEnd, exchangeStart, exchangeEnd,
    flipStart, flipEnd, landingStart, landingEnd,
    departStart, departEnd: duration, duration
  });
}

export const DEAD_END_VARIANTS = Object.freeze({
  narrow: buildVariant('narrow', 7, 7, 3, 5, 'Тесен край · обръщане в отвора'),
  wide: buildVariant('wide', 10, 16, 10, 14, 'Широк край · обръщане на място'),
  somersault: buildVariant('somersault', 7, 16.6, 3, 5, 'Тесен край · превъртане през глава'),
  exchange: buildVariant('exchange', 7, 16.6, 3, 5, 'Тесен край · размяна на щипки и опашка'),
  compact: buildVariant('compact', 7, 17, 3, 5, 'Тесен край · плавно обръщане по часовника')
});
// The default scenario is narrow; each variant also exposes its own duration.
export const DEAD_END_DURATION = DEAD_END_VARIANTS.narrow.duration;

function resolveVariant(variant) {
  if (typeof variant === 'string') {
    if (!Object.hasOwn(DEAD_END_VARIANTS, variant))
      throw new RangeError(`Unknown dead-end variant: ${variant}`);
    return DEAD_END_VARIANTS[variant];
  }
  if (variant === DEAD_END_VARIANTS.narrow || variant === DEAD_END_VARIANTS.wide ||
      variant === DEAD_END_VARIANTS.somersault || variant === DEAD_END_VARIANTS.exchange ||
      variant === DEAD_END_VARIANTS.compact) return variant;
  throw new TypeError('Expected narrow, wide, somersault, exchange, compact, or one of DEAD_END_VARIANTS');
}

function assignPoint(out, key, x, y, angle, tx, ty) {
  const point = out[key] || (out[key] = {});
  point.x = x; point.y = y; point.angle = angle;
  point.tx = tx; point.ty = ty; point.curvature = 0;
}

function samplePose(time, variant, reverse, instant, out) {
  const fixture = resolveVariant(variant);
  // Infinite times clamp naturally; NaN is a programmer error, not a pose.
  if (typeof time !== 'number' || Number.isNaN(time))
    throw new TypeError('Dead-end time must be a number');
  const t = Math.max(0, Math.min(fixture.duration, time));
  let current = null;
  for (const phase of fixture.phases) {
    if (t < phase.end) { current = phase; break; }
  }
  let x = fixture.exitX, velocity = 0, acceleration = 0;
  if (current) {
    const u = clamp01((t - current.start) / current.duration);
    x = current.fromX;
    if (current.kind === 'cruise') {
      x += current.velocity * current.duration * u;
      velocity = current.velocity;
    } else if (current.kind === 'accelerate') {
      x += current.velocity * current.duration * smoothIntegral(u);
      velocity = current.velocity * smooth(u);
      acceleration = current.velocity * smoothDerivative(u) / current.duration;
    } else if (current.kind === 'decelerate') {
      x += current.velocity * current.duration * (u - smoothIntegral(u));
      velocity = current.velocity * (1 - smooth(u));
      acceleration = -current.velocity * smoothDerivative(u) / current.duration;
    } else if (current.kind === 'reposition') {
      const delta = current.toX - current.fromX;
      x += delta * smooth(u);
      velocity = delta * smoothDerivative(u) / current.duration;
      acceleration = delta * smoothSecondDerivative(u) / (current.duration * current.duration);
    }
  }
  const turningDuration = fixture.turnEnd - fixture.turnStart;
  const turnProgress = clamp01((t - fixture.turnStart) / turningDuration);
  const flipping = fixture.id === 'somersault';
  const exchanging = fixture.id === 'exchange';
  const compacting = fixture.id === 'compact';
  const exchangeProgress = exchanging ? (instant ? (t >= fixture.turnStart ? 1 : 0) : turnProgress) : 0;
  const exchangeEase = smooth(exchangeProgress);
  const facingSwap = exchanging && exchangeProgress >= .5 - 1e-10;
  const flipProgress = flipping ? turnProgress : 0;
  const sense = !compacting && reverse ? -1 : 1;
  const angle = sense * Math.PI * (exchanging ? (facingSwap ? 1 : 0) :
    instant ? (t >= fixture.turnStart ? 1 : 0) : smooth(turnProgress));
  const tx = Math.cos(angle), ty = Math.sin(angle);
  out.x = x; out.y = fixture.y; out.angle = angle;
  out.time = t; out.duration = fixture.duration; out.variant = fixture.id;
  out.reverse = compacting ? false : !!reverse; out.instant = instant;
  out.phase = current ? current.phase : 'stopped';
  out.stage = current ? current.stage : 'stopped';
  out.phaseLabel = current ? current.phaseLabel : 'Спрял';
  out.speed = Math.abs(velocity); out.signedSpeed = velocity; out.speedX = velocity;
  out.acceleration = acceleration;
  out.turnProgress = turnProgress;
  out.renderMode = compacting ? 'compact' : exchanging ? 'exchange' : flipping ? 'somersault' : 'rigid';
  out.compactProgress = compacting ? turnProgress : 0;
  out.compactActive = compacting && t >= fixture.turnStart && t < fixture.turnEnd;
  out.compactStart = fixture.compactStart;
  out.compactEnd = fixture.compactEnd;
  out.scale = compacting && !instant ? compactScale(turnProgress) : 1;
  out.scaleVelocity = compacting && !instant ? -(1 - COMPACT_MIN_SCALE) *
    liftDerivative(turnProgress) / turningDuration : 0;
  out.scaleAcceleration = compacting && !instant ? -(1 - COMPACT_MIN_SCALE) *
    liftSecondDerivative(turnProgress) / (turningDuration * turningDuration) : 0;
  out.exchangeProgress = exchangeProgress;
  out.exchangeEase = exchangeEase;
  out.facingSwap = facingSwap;
  out.exchangeActive = exchanging && t >= fixture.turnStart && t < fixture.turnEnd;
  out.exchangeStart = fixture.exchangeStart;
  out.exchangeEnd = fixture.exchangeEnd;
  out.headOffsetX = exchanging ? TILE / 2 * (1 - 2 * exchangeEase) : tx * TILE / 2;
  out.tailOffsetX = -out.headOffsetX;
  out.headOffset = out.headOffsetX;
  out.tailOffset = out.tailOffsetX;
  out.flipProgress = flipProgress;
  out.pitch = flipping && !instant ? 2 * Math.PI * smooth(flipProgress) : 0;
  out.pitchVelocity = flipping && !instant ? 2 * Math.PI * smoothDerivative(flipProgress) / turningDuration : 0;
  out.pitchAcceleration = flipping && !instant ? 2 * Math.PI * smoothSecondDerivative(flipProgress) /
    (turningDuration * turningDuration) : 0;
  out.lift = 0; out.liftVelocity = 0; out.liftAcceleration = 0;
  if (flipping && !instant) {
    const landing = t >= fixture.landingStart;
    const liftProgress = landing ? clamp01((t - fixture.landingStart) / DEAD_END_LANDING_SECONDS) : flipProgress;
    const liftDuration = landing ? DEAD_END_LANDING_SECONDS : DEAD_END_FLIP_SECONDS;
    const amplitude = landing ? DEAD_END_LANDING_HEIGHT : DEAD_END_FLIP_HEIGHT;
    out.lift = amplitude * liftShape(liftProgress);
    out.liftVelocity = amplitude * liftDerivative(liftProgress) / liftDuration;
    out.liftAcceleration = amplitude * liftSecondDerivative(liftProgress) / (liftDuration * liftDuration);
  }
  out.groundY = fixture.y;
  out.angularVelocity = instant || exchanging ? 0 : sense * Math.PI * smoothDerivative(turnProgress) / turningDuration;
  out.angularAcceleration = instant || exchanging ? 0 : sense * Math.PI * smoothSecondDerivative(turnProgress) /
    (turningDuration * turningDuration);
  out.frame = Math.floor(t / (MOVE_SECONDS / 2) + 1e-10) & 1;
  out.done = t >= fixture.duration;
  // Head/tail are physical cell centers. In exchange mode the components
  // translate through the center on one axis; angle is logical facing only
  // and MUST NOT be applied as a global rotation by its renderer.
  assignPoint(out, 'seam', x, fixture.y, angle, tx, ty);
  if (exchanging) {
    const direction = 1 - 2 * exchangeEase;
    const facing = facingSwap ? -1 : 1;
    const componentAngle = facing === 1 ? 0 : sense * Math.PI;
    assignPoint(out, 'head', x + direction * TILE / 2, fixture.y, componentAngle, facing, 0);
    assignPoint(out, 'tail', x - direction * TILE / 2, fixture.y, componentAngle, facing, 0);
    assignPoint(out, 'front', x + direction * WAIST / 2, fixture.y, componentAngle, facing, 0);
    assignPoint(out, 'rear', x - direction * WAIST / 2, fixture.y, componentAngle, facing, 0);
  } else {
    assignPoint(out, 'head', x + tx * TILE / 2, fixture.y + ty * TILE / 2, angle, tx, ty);
    assignPoint(out, 'tail', x - tx * TILE / 2, fixture.y - ty * TILE / 2, angle, tx, ty);
    assignPoint(out, 'front', x + tx * WAIST / 2, fixture.y + ty * WAIST / 2, angle, tx, ty);
    assignPoint(out, 'rear', x - tx * WAIST / 2, fixture.y - ty * WAIST / 2, angle, tx, ty);
  }
  return out;
}

export function deadEndPose(time, variant = 'narrow', reverse = false, out = {}) {
  return samplePose(time, variant, reverse, false, out);
}

// Immediate-turn comparison: identical ground trajectory and timings, with
// an instantaneous facing change at pivot start and no pitch or lift.
// This controlled comparison is not original game AI.
export function deadEndInstantPose(time, variant = 'narrow', reverse = false, out = {}) {
  return samplePose(time, variant, reverse, true, out);
}
