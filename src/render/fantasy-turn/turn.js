// Isolated presentation routing. Angles are unwrapped quarter turns:
// right = 0, down = 1, left = 2, up = 3. Positive is clockwise.
// This module owns no actor, animation clock, pixels or game state.
export const DIRECTIONS = Object.freeze(['right', 'down', 'left', 'up']);

const clamp01 = value => Math.max(0, Math.min(1, value));
const wrap = value => ((value % 4) + 4) % 4;
const directionAt = angle => DIRECTIONS[wrap(angle)];
function directionIndex(direction) {
  const result = DIRECTIONS.indexOf(direction);
  if (result < 0) throw new TypeError(`Unknown direction: ${String(direction)}`);
  return result;
}
function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

// Both horizontal reversals expose the front face. Other half turns retain
// the approved clockwise route; adjacent turns still use the shortest path.
const turnDelta=(start,end)=>start===2&&end===0?-2:((end-start+4)%4===3?-1:(end-start+4)%4);
/** Left → right goes through down, just like right → left. */
export function planTurn(from, to) {
  const startAngle = directionIndex(from);
  const endAngle = directionIndex(to);
  const delta = turnDelta(startAngle,endAngle);
  const quarters = Math.abs(delta);
  const step = Math.sign(delta);
  const route = Array.from({length: quarters + 1}, (_, index) =>
    directionAt(startAngle + index * step));
  return {from, to, startAngle, delta, quarters, route};
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') throw new TypeError('A turn plan is required');
  const start = directionIndex(plan.from);
  const end = directionIndex(plan.to);
  finite(plan.startAngle, 'Start angle');
  finite(plan.delta, 'Turn delta');
  finite(plan.quarters, 'Quarter count');
  const delta = turnDelta(start,end);
  if (plan.startAngle !== start || plan.delta !== delta || plan.quarters !== Math.abs(delta)) {
    throw new TypeError('Inconsistent turn plan');
  }
}

/**
 * One quintic envelope spans the WHOLE turn. At the halfway cardinal of a
 * half turn, angular speed is maximal rather than easing to a second stop.
 * `from` and `to` describe the two neighboring poses in travel order. At an
 * exact internal cardinal, `from` is that pose and `mix` is zero. A completed
 * turn returns the final pose for both endpoints, also with mix zero.
 */
export function sampleTurn(plan, progress) {
  validatePlan(plan);
  const t = clamp01(finite(progress, 'Turn progress'));
  if (plan.quarters === 0 || t === 1) {
    return {
      angle: plan.startAngle + plan.delta,
      from: plan.to, to: plan.to, mix: 0, done: true, progress: t,
    };
  }
  const eased = clamp01(t * t * t * (10 + t * (-15 + 6 * t)));
  const traveled = plan.quarters * eased;
  const step = Math.sign(plan.delta);
  // Exact internal quarter boundaries are deterministic in either direction.
  // Keep a near-end sample on its last pair even if floating-point quintic
  // evaluation rounds to 1; only t === 1 marks a moving turn done.
  const segment = Math.min(plan.quarters - 1, Math.floor(traveled));
  const fromAngle = plan.startAngle + step * segment;
  return {
    angle: plan.startAngle + plan.delta * eased,
    from: directionAt(fromAngle),
    to: directionAt(fromAngle + step),
    mix: clamp01(traveled - segment),
    done: false,
    progress: t,
  };
}

/**
 * Choose the nearest unwrapped target from any finite current angle. Exact
 * 180-degree ties go clockwise unless a travel direction is explicitly given.
 * A negative preference keeps an interrupted left→right reversal in front.
 * no automatic wrapping of the current angle or loss of completed rotations.
 */
export function unwrapTarget(angle, target, preferredDirection = 0) {
  finite(angle, 'Current angle');
  if(![-1,0,1].includes(preferredDirection))throw new TypeError('Invalid preferred turn direction');
  const targetIndex = directionIndex(target);
  const clockwise = wrap(targetIndex - wrap(angle));
  const delta = clockwise===0?0:preferredDirection<0?clockwise-4:preferredDirection>0?clockwise:clockwise>2?clockwise-4:clockwise;
  // Targets are cardinal integers. Remove cancellation noise such as -4e-16
  // so a target at right never wraps to a value just below four quarters.
  return Math.round(angle + delta) || 0;
}
