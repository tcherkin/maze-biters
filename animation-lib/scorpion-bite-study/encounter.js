import {GAME_TIMING, smooth} from '../snake-bite-study/bite-state.js';
import {createPlayerMouthPlan, samplePlayerMouth} from '../snake-bite-study/player-mouth.js';

// Isolated presentation: native NORMAL average rates, not the original grid
// commit/119.9 ms scorpion slide/98.1 ms rest pattern. No game state is changed.
export const TILE = 36, WIDTH = 756, HEIGHT = 540;
export const PLAYER_STEP = GAME_TIMING.playerStep;
export const SCORPION_STEP = GAME_TIMING.snakeStep;
export const PLAYER_SPEED = TILE / PLAYER_STEP;
export const SCORPION_SPEED = TILE / SCORPION_STEP;
export const PLAYER_SIZE = TILE * .88;
// Preserve the accepted player size and mouth controller. Contact itself uses
// the independently measured silhouette table below, not this broad lip.
export const PLAYER_REACH = PLAYER_SIZE * 74 / 160;
// Unlike the older head study's destination, these authored mouth pixels are
// fully opaque in every one of the 49 cached poses, in all four banks.
export const PLAYER_MOUTH_REACH = PLAYER_SIZE * .175;
export const PLAYER_MOUTH_DROP = PLAYER_SIZE * .18125;
export const FIRST_BITE = .65, CONSUMPTION_DURATION = .22;
// A head-on encounter closes at the SUM of both speeds. The old 220 ms
// envelope left a nearly full-sized pincer/torso inside the player too long.
// Use the accepted snake-head duration; the exact first-touch event is intact.
export const HEAD_ON_DURATION = .14;
export const GAIT_HALF_STEP = SCORPION_STEP / 2;
export const CENTER = Object.freeze({x: WIDTH / 2, y: HEIGHT / 2});
export const DIRECTIONS = Object.freeze({
  right: Object.freeze({x: 1, y: 0, angle: 0, bank: 0, number: 2}),
  down: Object.freeze({x: 0, y: 1, angle: Math.PI / 2, bank: 1, number: 3}),
  left: Object.freeze({x: -1, y: 0, angle: Math.PI, bank: 2, number: 4}),
  up: Object.freeze({x: 0, y: -1, angle: -Math.PI / 2, bank: 3, number: 1})
});
const BANK_DIRECTIONS = Object.freeze(['right', 'down', 'left', 'up']);

// Seam-to-player-center separation along PLAYER heading at fully-open first
// contact. Original RGBA alpha >= 32, intersecting pixel-edge intervals;
// player scale 31.68/160, whole scorpion scale 36/160, banks R/D/L/U.
// The back bank includes the existing open cap-drop treatment. Head-on claws
// touch before the central face: using a 72x36 rectangle would bite too early.
// Independent dense checks of the final 109 ms found no earlier overlap for
// the default .65 s contact, including all 49 mouth poses and gait changes.
// This is a calibrated visual contact, NOT the production grid-cell rule.
export const CONTACT_SEPARATIONS = Object.freeze({
  chase: Object.freeze([
    Object.freeze([49.131, 48.735, 49.131, 48.537]),
    Object.freeze([49.131, 48.735, 49.131, 48.537])
  ]),
  headOn: Object.freeze([
    Object.freeze([46.359, 48.537, 46.701, 48.537]),
    Object.freeze([46.926, 48.537, 47.520, 48.537])
  ])
});
const witnesses = values => Object.freeze(values.map(([forward, cross]) => Object.freeze({forward, cross})));
// One actual touching pixel-pair witness for each profile measurement, in
// player forward/perpendicular coordinates; perpendicular=(-dy,dx).
export const CONTACT_WITNESSES = Object.freeze({
  chase: Object.freeze([
    witnesses([[14.256, -.522], [13.860, -2.214], [14.256, -.945], [13.662, -2.214]]),
    witnesses([[14.256, -.522], [13.860, -1.368], [14.256, -.945], [13.662, -2.0025]])
  ]),
  headOn: Object.freeze([
    witnesses([[11.484, 3.159], [13.662, -4.527], [12.276, -2.736], [13.662, -3.4695]]),
    witnesses([[12.276, -2.5245], [13.662, -4.527], [12.870, -2.5245], [13.662, -3.4695]])
  ])
});

const point = (x, y) => Object.freeze({x, y});

export function gaitFrame(time) {
  if (!Number.isFinite(time)) throw new RangeError('Scorpion gait time must be finite');
  return Math.floor(Math.max(0, time) / GAIT_HALF_STEP + 8 * Number.EPSILON) % 2;
}

export function createEncounter({direction = 'right', mode = 'chase',
  firstBite = FIRST_BITE, duration = mode === 'headOn' ? HEAD_ON_DURATION : CONSUMPTION_DURATION} = {}) {
  if (!Object.hasOwn(DIRECTIONS, direction)) throw new RangeError('Unknown encounter direction');
  if (!Object.hasOwn(CONTACT_SEPARATIONS, mode)) throw new RangeError('Unknown encounter mode');
  if (!Number.isFinite(firstBite) || firstBite < 0 || !Number.isFinite(duration) || duration <= 0)
    throw new RangeError('Encounter timing must be finite and duration positive');
  const d = DIRECTIONS[direction], facing = mode === 'chase' ? 1 : -1;
  const scorpionDirection = BANK_DIRECTIONS[(d.bank + (facing < 0 ? 2 : 0)) % 4];
  const sd = DIRECTIONS[scorpionDirection];
  const contactFrame = gaitFrame(firstBite);
  const centerSeparation = CONTACT_SEPARATIONS[mode][contactFrame][d.bank];
  const contactWitness = CONTACT_WITNESSES[mode][contactFrame][d.bank];
  // The near end of the nominal two-cell footprint is staged two cells ahead
  // of the corridor center. Actual silhouette contact is calibrated above.
  const nominalContactPoint = point(CENTER.x + d.x * 2 * TILE, CENTER.y + d.y * 2 * TILE);
  const scorpionContact = point(nominalContactPoint.x + d.x * TILE, nominalContactPoint.y + d.y * TILE);
  const playerContact = point(scorpionContact.x - d.x * centerSeparation,
    scorpionContact.y - d.y * centerSeparation);
  const contactPoint = point(playerContact.x + d.x * contactWitness.forward - d.y * contactWitness.cross,
    playerContact.y + d.y * contactWitness.forward + d.x * contactWitness.cross);
  const cfg = {
    direction, mode, dx: d.x, dy: d.y, playerAngle: d.angle, playerBank: d.bank,
    scorpionDirection, scorpionAngle: sd.angle, scorpionDirectionNumber: sd.number,
    contactKind: mode === 'chase' ? 'tail' : 'head', centerSeparation, contactFrame, contactWitness,
    contactPoint, nominalContactPoint, playerContact, scorpionContact,
    playerStart: point(playerContact.x - d.x * PLAYER_SPEED * firstBite,
      playerContact.y - d.y * PLAYER_SPEED * firstBite),
    scorpionStart: point(scorpionContact.x - sd.x * SCORPION_SPEED * firstBite,
      scorpionContact.y - sd.y * SCORPION_SPEED * firstBite),
    playerVelocity: point(d.x * PLAYER_SPEED, d.y * PLAYER_SPEED),
    scorpionVelocity: point(sd.x * SCORPION_SPEED, sd.y * SCORPION_SPEED),
    playerSpeed: PLAYER_SPEED, scorpionSpeed: SCORPION_SPEED,
    relativeSpeed: PLAYER_SPEED - facing * SCORPION_SPEED,
    speedRatio: PLAYER_SPEED / SCORPION_SPEED,
    playerMouthReach: PLAYER_MOUTH_REACH, playerMouthDrop: PLAYER_MOUTH_DROP,
    firstBite, biteAt: firstBite, headBiteAt: firstBite,
    duration, consumeDuration: duration, headDuration: duration,
    consumptionEnd: firstBite + duration, totalTime: firstBite + duration + .22,
    biteTimes: Object.freeze([])
  };
  // One whole-creature bite uses the accepted head-consumption mouth phrase.
  // Empty biteTimes means there are no fabricated per-cell chewing events.
  cfg.playerMouthPlan = createPlayerMouthPlan(cfg);
  return Object.freeze(cfg);
}

export const DEFAULT_ENCOUNTER = createEncounter();

export function sampleEncounter(time, cfg = DEFAULT_ENCOUNTER, out = {}) {
  if (!Number.isFinite(time)) throw new RangeError('Encounter sample time must be finite');
  const t = Math.max(0, Math.min(cfg.totalTime, time));
  const player = out.player ??= {}, mouth = player.mouth ??= {};
  const scorpion = out.scorpion ??= {}, center = scorpion.center ??= {};
  const free = out.freeScorpion ??= {};
  player.x = cfg.playerStart.x + cfg.playerVelocity.x * t;
  player.y = cfg.playerStart.y + cfg.playerVelocity.y * t;
  player.angle = cfg.playerAngle;
  player.bank = cfg.playerBank;
  player.size = PLAYER_SIZE;
  mouth.x = player.x + cfg.dx * cfg.playerMouthReach;
  mouth.y = player.y + cfg.dy * cfg.playerMouthReach + cfg.playerMouthDrop * cfg.dx * cfg.dx;
  const jaws = samplePlayerMouth(t, cfg);
  player.closure = jaws.closure;
  player.mouthPhase = jaws.phase;
  player.mouthAction = jaws.action;
  player.travelledCells = jaws.travelledCells;
  free.x = cfg.scorpionStart.x + cfg.scorpionVelocity.x * t;
  free.y = cfg.scorpionStart.y + cfg.scorpionVelocity.y * t;
  free.angle = cfg.scorpionAngle;
  const consumed = t >= cfg.firstBite;
  const elapsed = consumed ? Math.min(cfg.consumeDuration, t - cfg.firstBite) : 0;
  const progress = consumed ? smooth(elapsed / cfg.consumeDuration) : 0;
  const remaining = 1 - progress;
  scorpion.x = free.x;
  scorpion.y = free.y;
  if (consumed) {
    // Stay on the incoming side of the moving mouth. Interpolating an ongoing
    // head-on free trajectory would cross behind it before .22 s elapses.
    // D=D0*exp(a*t-a*a*t*t/2)*(1-smooth(t/T)): D remains nonnegative and
    // decreasing, D'(0) is the incoming relative velocity, D''(0)=0, and
    // D/D'/D'' all vanish at the end. Thus both joins are genuinely C2.
    const initialForward = cfg.centerSeparation - cfg.playerMouthReach;
    const a = -cfg.relativeSpeed / initialForward;
    const forward = initialForward * Math.exp(a * elapsed - .5 * a * a * elapsed * elapsed) * remaining;
    const drop = cfg.playerMouthDrop * cfg.dx * cfg.dx;
    scorpion.x = mouth.x + cfg.dx * forward;
    scorpion.y = mouth.y + cfg.dy * forward - drop * remaining;
  }
  center.x = scorpion.x;
  center.y = scorpion.y;
  scorpion.angle = cfg.scorpionAngle;
  scorpion.renderMode = 'straight';
  scorpion.bentPose = null;
  scorpion.transformAnchor = null;
  scorpion.frame = gaitFrame(t);
  scorpion.scale = remaining;
  scorpion.alpha = 1;
  scorpion.visible = remaining > 0;
  scorpion.width = 2 * TILE * remaining;
  scorpion.height = TILE * remaining;
  scorpion.consumed = consumed;
  out.time = t;
  out.phase = !consumed ? 'approach' : progress < 1 ? 'consuming' : 'complete';
  out.phaseLabel = !consumed ? (cfg.mode === 'chase' ? 'Догонване на опашката' : 'Среща отпред')
    : progress < 1 ? 'Поглъщане на целия скорпион' : 'Погълнат';
  out.consumed = consumed;
  out.active = consumed && progress < 1;
  out.complete = progress === 1;
  out.progress = progress;
  out.logicalCells = consumed ? 0 : 2;
  out.remainingCells = out.logicalCells;
  out.contactPoint = cfg.contactPoint;
  out.done = t >= cfg.totalTime;
  return out;
}
