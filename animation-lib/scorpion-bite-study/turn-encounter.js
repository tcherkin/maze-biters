import {bentPose, BENT_STUDY, BENT_TURN_SECONDS} from '../scorpion-turn-study/bent-motion.js';
import {smooth} from '../snake-bite-study/bite-state.js';
import {createPlayerMouthPlan, samplePlayerMouth} from '../snake-bite-study/player-mouth.js';
import {TILE, WIDTH, HEIGHT, PLAYER_SPEED, SCORPION_SPEED, PLAYER_SIZE,
  PLAYER_MOUTH_REACH, PLAYER_MOUTH_DROP} from './encounter.js';

export {TILE, WIDTH, HEIGHT};
export const TURN_PHASES = Object.freeze([.25, .5, .75]);
export const TURN_BENT_START_TIME = 1.8;
export const TURN_CONSUMPTION_DURATION = .20;
export const PLAYER_STOP_X = 632;
export const PLAYER_BRAKE_SECONDS = .218;
export const CALIBRATION_LOOKBACK = .15;
export const CALIBRATION_SAMPLES = 12;

const point = (x, y) => Object.freeze({x, y});
const smoothDerivative = u => 30 * u * u * (1 - u) * (1 - u);
const smoothIntegral = u => u ** 4 * (2.5 + u * (-3 + u));

// The DOM-free model receives real rendered-alpha measurements from startup.
// A measurement is the furthest right PLAYER CENTER before first overlap,
// plus an actual pair-of-pixels touching point. No bounding-box substitute is
// silently used when the renderer / player-mouth atlas is unavailable.
export function createTurnEncounter({turnPhase = .5, startBentTime = TURN_BENT_START_TIME,
  duration = TURN_CONSUMPTION_DURATION, measureContact, playerStopX = PLAYER_STOP_X} = {}) {
  if (!TURN_PHASES.includes(turnPhase)) throw new RangeError('Turn bite phase must be .25, .5, or .75');
  if (!Number.isFinite(startBentTime) || startBentTime < 0 || !Number.isFinite(duration) || duration <= 0)
    throw new RangeError('Turn encounter timing must be finite and duration positive');
  if (typeof measureContact !== 'function') throw new TypeError('Turn encounter needs rendered-alpha measureContact');
  if (!Number.isFinite(playerStopX) || playerStopX > PLAYER_STOP_X)
    throw new RangeError('Player stop must stay before the dead-end wall');
  const contactBentTime = BENT_STUDY.turnStart + BENT_TURN_SECONDS * turnPhase;
  const firstBite = contactBentTime - startBentTime;
  if (!(firstBite > 0)) throw new RangeError('Bent animation must start before the selected contact');
  const phrase = {headBiteAt: firstBite, headDuration: duration,
    biteTimes: Object.freeze([]), playerSpeed: PLAYER_SPEED};
  phrase.playerMouthPlan = createPlayerMouthPlan(phrase);
  const poseScratch = {};
  function measure(time) {
    const pose = bentPose(startBentTime + time, poseScratch);
    const result = measureContact({time, bentTime: pose.time, pose,
      closure: samplePlayerMouth(time, phrase).closure,
      playerY: BENT_STUDY.y, playerSize: PLAYER_SIZE, playerBank: 0});
    if (!result || !Number.isFinite(result.playerX) ||
        !Number.isFinite(result.contactPoint?.x) || !Number.isFinite(result.contactPoint?.y))
      throw new TypeError('Alpha contact measurement needs finite playerX and contactPoint');
    return {playerX: result.playerX, contactPoint: point(result.contactPoint.x, result.contactPoint.y),
      precision: Number.isFinite(result.precision) && result.precision > 0 ? result.precision : null};
  }
  const measured = measure(firstBite), rawContact = bentPose(contactBentTime);
  const playerContact = point(measured.playerX, BENT_STUDY.y);
  const playerStart = point(playerContact.x - PLAYER_SPEED * firstBite, BENT_STUDY.y);
  const initialForward = rawContact.seam.x - playerContact.x - PLAYER_MOUTH_REACH;
  if (!(initialForward > 0) || !(playerStopX > playerContact.x))
    throw new RangeError('Measured turn contact must leave room ahead of the player and before the wall');

  // Check the preceding rendered poses, including the real jaw-opening clock.
  // This bounded startup check is explicit metadata, not a claim of continuous
  // collision proof. Runtime sampling never reads pixels or invokes callback.
  const lookback = Math.min(CALIBRATION_LOOKBACK, firstBite);
  let minimumGap = Infinity;
  for (let i = 0; i < CALIBRATION_SAMPLES; i++) {
    const time = firstBite - lookback * (1 - i / CALIBRATION_SAMPLES);
    const sample = measure(time);
    const gap = sample.playerX - (playerStart.x + PLAYER_SPEED * time);
    minimumGap = Math.min(minimumGap, gap);
    if (gap < -1e-5)
      throw new RangeError(`Earlier alpha contact at ${time.toFixed(6)} s (${(-gap).toFixed(4)} px overlap)`);
  }

  // Preserve native approach velocity until contact. If the wall is close,
  // shorten braking rather than starting it before the calibrated collision.
  // Integral of (1-smootherstep) is exactly one half, so stop x is exact.
  const availableDistance = playerStopX - playerContact.x;
  const brakeDuration = Math.min(PLAYER_BRAKE_SECONDS, 2 * availableDistance / PLAYER_SPEED);
  const brakeStartX = playerStopX - PLAYER_SPEED * brakeDuration / 2;
  const brakeStart = firstBite + Math.max(0, (brakeStartX - playerContact.x) / PLAYER_SPEED);
  const stopTime = brakeStart + brakeDuration;
  const initialRelativeVelocity = rawContact.signedSpeed - PLAYER_SPEED;
  const initialRelativeAcceleration = rawContact.acceleration;
  const decayA = initialRelativeVelocity / initialForward;
  const decayB = .5 * (initialRelativeAcceleration / initialForward - decayA * decayA);
  if (!(decayA < 0) || decayB > 1e-10)
    throw new RangeError('Selected contact cannot use a monotone mouth-relative capture');
  const cfg = {
    mode: 'turn', direction: 'right', fixture: 'narrow', turnPhase,
    dx: 1, dy: 0, playerAngle: 0, playerBank: 0,
    startBentTime, contactBentTime, firstBite, biteAt: firstBite, headBiteAt: firstBite,
    duration, consumeDuration: duration, headDuration: duration,
    consumptionEnd: firstBite + duration,
    totalTime: Math.max(firstBite + duration + .22, stopTime + .12),
    contactKind: 'turning-body', contactPoint: measured.contactPoint,
    nominalContactPoint: measured.contactPoint,
    playerStart, playerContact, playerSpeed: PLAYER_SPEED, scorpionSpeed: SCORPION_SPEED,
    speedRatio: PLAYER_SPEED / SCORPION_SPEED,
    playerVelocity: point(PLAYER_SPEED, 0),
    scorpionContact: point(rawContact.seam.x, rawContact.seam.y),
    centerSeparation: rawContact.seam.x - playerContact.x,
    playerMouthReach: PLAYER_MOUTH_REACH, playerMouthDrop: PLAYER_MOUTH_DROP,
    playerStopX, brakeStartX, brakeStart, brakeDuration, playerStopTime: stopTime,
    initialForward, initialRelativeVelocity, initialRelativeAcceleration, decayA, decayB,
    biteTimes: phrase.biteTimes, playerMouthPlan: phrase.playerMouthPlan,
    calibration: Object.freeze({method: 'rendered-alpha', contactBentTime,
      playerX: measured.playerX, checks: CALIBRATION_SAMPLES, lookback,
      minimumGap, precision: measured.precision, earlierOverlap: false, continuousProof: false})
  };
  return Object.freeze(cfg);
}

export function sampleTurnPlayer(time, cfg, out = {}) {
  if (!Number.isFinite(time)) throw new RangeError('Turn player time must be finite');
  const t = Math.max(0, Math.min(cfg.totalTime, time));
  if (t < cfg.brakeStart) {
    out.x = cfg.playerStart.x + PLAYER_SPEED * t;
    out.speed = PLAYER_SPEED; out.acceleration = 0;
  } else if (t < cfg.playerStopTime) {
    const u = (t - cfg.brakeStart) / cfg.brakeDuration;
    out.x = cfg.brakeStartX + PLAYER_SPEED * cfg.brakeDuration * (u - smoothIntegral(u));
    out.speed = PLAYER_SPEED * (1 - smooth(u));
    out.acceleration = -PLAYER_SPEED * smoothDerivative(u) / cfg.brakeDuration;
  } else {
    out.x = cfg.playerStopX; out.speed = 0; out.acceleration = 0;
  }
  out.y = BENT_STUDY.y;
  out.angle = 0; out.bank = 0; out.size = PLAYER_SIZE;
  out.stopped = t >= cfg.playerStopTime;
  out.travelledCells = (out.x - cfg.playerStart.x) / TILE;
  return out;
}

export function sampleTurnEncounter(time, cfg, out = {}) {
  if (!Number.isFinite(time)) throw new RangeError('Turn encounter time must be finite');
  if (!cfg || cfg.mode !== 'turn') throw new TypeError('Turn encounter needs its calibrated configuration');
  const t = Math.max(0, Math.min(cfg.totalTime, time));
  const player = sampleTurnPlayer(t, cfg, out.player ??= {}), mouth = player.mouth ??= {};
  mouth.x = player.x + cfg.playerMouthReach;
  mouth.y = player.y + cfg.playerMouthDrop;
  // Mouth event timing is unchanged. Its quiet walking phase follows actual
  // travelled distance through braking instead of accumulating phantom steps.
  const jaws = samplePlayerMouth(t, {playerMouthPlan: cfg.playerMouthPlan,
    playerSpeed: t > 0 ? (player.x - cfg.playerStart.x) / t : PLAYER_SPEED});
  player.closure = jaws.closure; player.mouthPhase = jaws.phase; player.mouthAction = jaws.action;
  const scorpion = out.scorpion ??= {};
  const raw = bentPose(cfg.startBentTime + t, scorpion.bentPose ??= {});
  const center = scorpion.center ??= {}, free = out.freeScorpion ??= {};
  free.x = raw.seam.x; free.y = raw.seam.y; free.angle = raw.angle;
  const consumed = t >= cfg.firstBite;
  const elapsed = !consumed ? 0 : t >= cfg.consumptionEnd ? cfg.consumeDuration : t - cfg.firstBite;
  const progress = consumed ? smooth(elapsed / cfg.consumeDuration) : 0;
  const remaining = 1 - progress;
  scorpion.x = raw.seam.x; scorpion.y = raw.seam.y;
  if (consumed) {
    // Positive relative distance cannot pass behind the independently moving
    // mouth. Exponent curvature matches the captured seam acceleration as well
    // as velocity, then the quintic envelope makes the final join C2 too.
    const forward = cfg.initialForward * Math.exp(cfg.decayA * elapsed + cfg.decayB * elapsed * elapsed) * remaining;
    scorpion.x = mouth.x + forward;
    scorpion.y = mouth.y - cfg.playerMouthDrop * remaining;
  }
  center.x = scorpion.x; center.y = scorpion.y;
  scorpion.transformAnchor = raw.seam;
  scorpion.anchor = raw.seam;
  scorpion.angle = raw.angle;
  scorpion.frame = raw.frame;
  scorpion.scale = remaining; scorpion.alpha = 1;
  scorpion.width = 2 * TILE * remaining; scorpion.height = TILE * remaining;
  scorpion.visible = remaining > 0; scorpion.consumed = consumed;
  scorpion.renderMode = 'bent';
  out.time = t; out.bentTime = raw.time; out.turnProgress = raw.turnProgress;
  out.phase = !consumed ? 'approach' : progress < 1 ? 'consuming' : 'complete';
  out.phaseLabel = !consumed ? 'Догонване по време на обръщането'
    : progress < 1 ? 'Извиването продължава при поглъщането' : 'Скорпионът е погълнат';
  out.consumed = consumed; out.active = consumed && progress < 1;
  out.complete = progress === 1; out.progress = progress;
  out.logicalCells = consumed ? 0 : 2; out.remainingCells = out.logicalCells;
  out.contactPoint = cfg.contactPoint; out.done = t >= cfg.totalTime;
  return out;
}
