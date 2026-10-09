// In-place U bend: the ground trajectory remains the original straight
// approach and departure. The full-size body bends through the stop without
// a waiting interval between translation and shape movement.
import {TILE, WIDTH, HEIGHT, SPEED, MOVE_SECONDS} from './motion.js';
import {DEAD_END_VARIANTS, deadEndPose} from './dead-end-motion.js';

export {TILE, WIDTH, HEIGHT, SPEED};
export const FRONT_OFFSET = 14.4;
export const REAR_OFFSET = -25.2;
export const HEAD_RIGID_LENGTH = 21.6;
export const TAIL_RIGID_LENGTH = 10.8;
export const FLEX_LENGTH = FRONT_OFFSET - REAR_OFFSET;
export const MATERIAL_LENGTH = FLEX_LENGTH + HEAD_RIGID_LENGTH + TAIL_RIGID_LENGTH;
export const BODY_HALF_WIDTH = 9;
export const BENT_MIN_SCALE = 1;
export const BENT_TURN_SECONDS = 1.2;
export const FRONT_TURN_END_PROGRESS = .58;
export const REAR_TURN_START_PROGRESS = .42;
export const ROTATION_LEAD_SECONDS = .08;
export const ROTATION_TAIL_SECONDS = .08;
export const CENTER_Y = 270;
export const STOP_X = 17 * TILE;
export const START_X = 7 * TILE;
export const EXIT_X = 3 * TILE;

const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = u => Math.max(0, Math.min(1, u * u * u * (u * (u * 6 - 15) + 10)));
const smoothDerivative = u => 30 * u * u * (1 - u) * (1 - u);
const smoothSecondDerivative = u => 60 * u * (1 - u) * (1 - 2 * u);
export const MAX_BEND_ANGLE = Math.PI * (smooth(.5 / FRONT_TURN_END_PROGRESS) -
  smooth((.5 - REAR_TURN_START_PROGRESS) / (1 - REAR_TURN_START_PROGRESS)));
export const MAX_CURVATURE = MAX_BEND_ANGLE / FLEX_LENGTH;
const baseFixture = DEAD_END_VARIANTS.compact;
const arriveTime = baseFixture.approachEnd;
const turnStart = arriveTime - ROTATION_LEAD_SECONDS;
const turnEnd = turnStart + BENT_TURN_SECONDS;
const departStart = turnEnd - ROTATION_TAIL_SECONDS;
const departureShift = departStart - baseFixture.departStart;
export const BENT_DURATION = baseFixture.duration + departureShift;

// Position and angular clocks overlap. Rotation has already started when
// braking ends, and departure has already started when rotation finishes.
export const BENT_TIMELINE = Object.freeze([
  ...baseFixture.phases.filter(phase => phase.end <= arriveTime),
  Object.freeze({stage: 'body-bend', phase: 'turn', kind: 'body-bend',
    phaseLabel: 'Тялото се извива непрекъснато',
    start: arriveTime, end: departStart, duration: departStart - arriveTime,
    fromX: STOP_X, toX: STOP_X, velocity: 0}),
  ...baseFixture.phases.filter(phase => phase.start >= baseFixture.departStart)
    .map(phase => Object.freeze({...phase,
      start: phase.start + departureShift, end: phase.end + departureShift}))
]);

export const BENT_STUDY = Object.freeze({
  id: 'bent', label: 'U-образно извиване на място',
  duration: BENT_DURATION, startX: START_X, stopX: STOP_X, turnX: STOP_X,
  exitX: EXIT_X, y: CENTER_Y, scaleOriginY: CENTER_Y,
  turnStart, turnEnd, arriveTime, inspectionTime: turnStart + BENT_TURN_SECONDS / 2,
  frontTurnEnd: turnStart + FRONT_TURN_END_PROGRESS * BENT_TURN_SECONDS,
  rearTurnStart: turnStart + REAR_TURN_START_PROGRESS * BENT_TURN_SECONDS,
  approachEnd: arriveTime, brakeStart: baseFixture.brakeStart,
  brakeEnd: baseFixture.brakeEnd, departStart, departEnd: BENT_DURATION,
  frontOffset: FRONT_OFFSET, rearOffset: REAR_OFFSET,
  materialLength: MATERIAL_LENGTH, maxCurvature: MAX_CURVATURE, maxBendAngle: MAX_BEND_ANGLE,
  rotationLeadSeconds: ROTATION_LEAD_SECONDS, rotationTailSeconds: ROTATION_TAIL_SECONDS,
  minimumScale: 1, timeline: BENT_TIMELINE, phases: BENT_TIMELINE,
  fixture: 'narrow', corridor: baseFixture.corridor, room: DEAD_END_VARIANTS.narrow.room
});

const clockScratch = {};
export function sampleBentClock(time, out = {}) {
  if (typeof time !== 'number' || Number.isNaN(time)) throw new TypeError('Bent-study time must be a number');
  const t = Math.max(0, Math.min(BENT_DURATION, time));
  const p = t <= turnStart ? 0 : t >= turnEnd ? 1 : (t - turnStart) / BENT_TURN_SECONDS;
  const mappedTime = t < arriveTime ? t : t < departStart ?
    baseFixture.approachEnd : baseFixture.departStart + t - departStart;
  const base = deadEndPose(mappedTime, 'compact', false, clockScratch);
  out.time = t; out.x = base.x; out.y = CENTER_Y;
  out.speed = base.speed; out.signedSpeed = base.signedSpeed;
  out.acceleration = base.acceleration;
  out.turnProgress = p;
  out.done = t >= BENT_DURATION;
  out.phase = out.done ? 'stopped' : t >= turnStart && t < turnEnd ? 'turn' : base.phase;
  out.stage = out.done ? 'stopped' : out.phase === 'turn' ? 'body-bend' : base.stage;
  out.phaseLabel = out.done ? 'Спрял' : out.phase === 'turn' ?
    'Щипките и опашката се обръщат непрекъснато' : base.phaseLabel;
  return out;
}

export function bendAngles(progress, out = {}) {
  const p = clamp01(progress);
  const frontU = clamp01(p / FRONT_TURN_END_PROGRESS);
  const rearU = clamp01((p - REAR_TURN_START_PROGRESS) / (1 - REAR_TURN_START_PROGRESS));
  out.frontAngle = Math.PI * smooth(frontU);
  out.rearAngle = Math.PI * smooth(rearU);
  out.curvature = (out.frontAngle - out.rearAngle) / FLEX_LENGTH;
  out.spineCurvature = out.curvature;
  out.seamAngle = out.rearAngle - out.curvature * REAR_OFFSET;
  out.frontAngleVelocity = Math.PI * smoothDerivative(frontU) /
    (BENT_TURN_SECONDS * FRONT_TURN_END_PROGRESS);
  out.rearAngleVelocity = Math.PI * smoothDerivative(rearU) /
    (BENT_TURN_SECONDS * (1 - REAR_TURN_START_PROGRESS));
  out.frontAngleAcceleration = Math.PI * smoothSecondDerivative(frontU) /
    Math.pow(BENT_TURN_SECONDS * FRONT_TURN_END_PROGRESS, 2);
  out.rearAngleAcceleration = Math.PI * smoothSecondDerivative(rearU) /
    Math.pow(BENT_TURN_SECONDS * (1 - REAR_TURN_START_PROGRESS), 2);
  return out;
}

function sinc(value) {
  if (Math.abs(value) < 1e-4) {
    const squared = value * value;
    return 1 - squared / 6 + squared * squared / 120 - squared * squared * squared / 5040;
  }
  return Math.sin(value) / value;
}

// The seam is a material point fixed at offset zero, not the center of a
// bounding box. Integrating the unit tangent preserves every material length.
// A midpoint/sinc identity avoids cancellation for nearly straight frames.
export function sampleBentShape(offset, shape, out = {}) {
  const arcOffset = Math.max(REAR_OFFSET, Math.min(FRONT_OFFSET, offset));
  const k = shape.spineCurvature ?? shape.curvature;
  const seamAngle = shape.rearAngle - k * REAR_OFFSET;
  const halfSweep = k * arcOffset / 2;
  const arcLengthFactor = arcOffset * sinc(halfSweep);
  const middleAngle = seamAngle + halfSweep;
  const angle = seamAngle + k * arcOffset;
  const tx = Math.cos(angle), ty = Math.sin(angle);
  const extension = offset - arcOffset;
  out.x = shape.x + arcLengthFactor * Math.cos(middleAngle) + extension * tx;
  out.y = shape.y + arcLengthFactor * Math.sin(middleAngle) + extension * ty;
  out.angle = angle; out.tx = tx; out.ty = ty;
  out.curvature = extension === 0 ? k : 0;
  out.offset = offset;
  out.materialDistance = offset;
  return out;
}

const shapeScratch = {};
export function sampleBentSpine(offset, progress, out = {}, x = STOP_X, y = CENTER_Y) {
  bendAngles(progress, shapeScratch);
  shapeScratch.x = x; shapeScratch.y = y;
  return sampleBentShape(offset, shapeScratch, out);
}

export function bentScale() { return 1; }

export function bentPose(time, out = {}) {
  sampleBentClock(time, out);
  bendAngles(out.turnProgress, out);
  out.frame = Math.floor(out.time / (MOVE_SECONDS / 2) + 1e-10) & 1;
  out.scale = 1; out.scaleVelocity = 0; out.scaleAcceleration = 0;
  out.scaleOriginY = CENTER_Y;
  out.angle = out.seamAngle;
  out.lift = 0; out.pitch = 0; out.renderMode = 'in-place-bend';
  out.seam = sampleBentShape(0, out, out.seam || {});
  out.front = sampleBentShape(FRONT_OFFSET, out, out.front || {});
  out.rear = sampleBentShape(REAR_OFFSET, out, out.rear || {});
  out.nose = sampleBentShape(FRONT_OFFSET + HEAD_RIGID_LENGTH, out, out.nose || {});
  out.sting = sampleBentShape(REAR_OFFSET - TAIL_RIGID_LENGTH, out, out.sting || {});
  out.head = sampleBentShape(TILE / 2, out, out.head || {});
  out.tail = sampleBentShape(-TILE / 2, out, out.tail || {});
  if (!out.sample || out.sample.bentSamplerOwner !== out) {
    out.sample = (offset, target = {}) => sampleBentShape(offset, out, target);
    out.sample.bentSamplerOwner = out;
  }
  return out;
}
