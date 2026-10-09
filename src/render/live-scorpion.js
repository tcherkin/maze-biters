import {loadBentArt} from '../../animation-lib/scorpion-turn-study/bent-art.js?v=1.02.03.00';

// Live visual adapter only. Grid positions, AI, collision ownership, item
// timers, and player movement belong to the engine and are never written here.
const STUDY_TILE = 36;
const DEFAULT_STEP = 218;
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const u = clamp(value); return u ** 3 * (10 + u * (-15 + 6 * u)); };
const easeD = u => 30 * u * u * (1 - u) * (1 - u);
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);

// Same curvature-smooth quarter-turn construction as the accepted study,
// without importing or replaying its fixture route. Integrate unit tangent.
const LUT_N = 512, ix = new Float64Array(LUT_N + 1), iy = new Float64Array(LUT_N + 1);
const quarterAngle = u => Math.PI / 2 * ease(u);
for (let i = 1; i <= LUT_N; i++) {
  const a = (i - 1) / LUT_N, b = i / LUT_N, m = (a + b) / 2, h = (b - a) / 6;
  ix[i] = ix[i - 1] + h * (Math.cos(quarterAngle(a)) + 4 * Math.cos(quarterAngle(m)) + Math.cos(quarterAngle(b)));
  iy[i] = iy[i - 1] + h * (Math.sin(quarterAngle(a)) + 4 * Math.sin(quarterAngle(m)) + Math.sin(quarterAngle(b)));
}
const quarterIntegral = (ix[LUT_N] + iy[LUT_N]) / 2;
ix[LUT_N] = iy[LUT_N] = quarterIntegral;
function integral(values, u, sine) {
  if (u <= 0) return 0;
  if (u >= 1) return quarterIntegral;
  const scaled = u * LUT_N, i = Math.floor(scaled), v = scaled - i;
  const a = i / LUT_N, b = (i + 1) / LUT_N, h = 1 / LUT_N;
  const ha = quarterAngle(a), hb = quarterAngle(b);
  const c0 = values[i], c1 = (sine ? Math.sin(ha) : Math.cos(ha)) * h;
  const c2 = (sine ? Math.cos(ha) : -Math.sin(ha)) * Math.PI / 2 * easeD(a) * h * h / 2;
  const d1 = (sine ? Math.sin(hb) : Math.cos(hb)) * h;
  const dd1 = (sine ? Math.cos(hb) : -Math.sin(hb)) * Math.PI / 2 * easeD(b) * h * h;
  const delta = values[i + 1] - c0 - c1 - c2, velocity = d1 - c1 - 2 * c2, acceleration = dd1 - 2 * c2;
  const c3 = 10 * delta - 4 * velocity + acceleration / 2;
  const c4 = -15 * delta + 7 * velocity - acceleration;
  const c5 = 6 * delta - 3 * velocity + acceleration / 2;
  return c0 + v * (c1 + v * (c2 + v * (c3 + v * (c4 + v * c5))));
}
function sinc(x) {
  if (Math.abs(x) < 1e-4) { const x2 = x * x; return 1 - x2 / 6 + x2 * x2 / 120; }
  return Math.sin(x) / x;
}
function sampleShape(offset, pose, out = {}) {
  const arc = Math.max(pose.rearOffset, Math.min(pose.frontOffset, offset));
  const k = pose.curvature, angle = pose.rearAngle + k * (arc - pose.rearOffset);
  const middle = pose.angle + k * arc / 2, distance = arc * sinc(k * arc / 2);
  const tx = Math.cos(angle), ty = Math.sin(angle), extension = offset - arc;
  out.x = pose.x + distance * Math.cos(middle) + extension * tx;
  out.y = pose.y + distance * Math.sin(middle) + extension * ty;
  out.angle = angle; out.tx = tx; out.ty = ty;
  out.curvature = extension ? 0 : k; out.offset = offset;
  return out;
}

export function createLiveScorpion({tile = 16, playerPosition, mouthTarget, loadArt = loadBentArt} = {}) {
  if (!Number.isFinite(tile) || tile <= 0) throw new RangeError('Live scorpion needs a positive logical tile');
  let records = new WeakMap(), art = null, preparing = null, lastError = null, recoveryPending = false;
  let stepCount = 0, drawCount = 0, consumeCount = 0, captureFallbacks = 0;
  const ghosts = [], capacity = 16, unitScale = tile / STUDY_TILE;
  const positionScratch = {};
  const renderPose = {frame: 0, source: null, sample(offset, out) {
    this.source.sample(offset * unitScale, out);
    out.x /= unitScale; out.y /= unitScale; out.curvature *= unitScale;
    return out;
  }};

  function makeRecord(entity, oldHead, oldTail, oldDir, t, duration, nativeDelay, previous) {
    const fromX = (oldHead.x + oldTail.x + 1) * tile / 2;
    const fromY = (oldHead.y + oldTail.y + 1) * tile / 2;
    const toX = (entity.x + entity.tailX + 1) * tile / 2;
    const toY = (entity.y + entity.tailY + 1) * tile / 2;
    const next = entity.dir || oldDir, dot = oldDir.x * next.x + oldDir.y * next.y;
    const cross = oldDir.x * next.y - oldDir.y * next.x;
    const moved = oldHead.x !== entity.x || oldHead.y !== entity.y || oldTail.x !== entity.tailX || oldTail.y !== entity.tailY;
    const kind = !moved ? 'still' : dot < -.5 ? 'reverse' : Math.abs(cross) > .5 ? 'quarter' : 'straight';
    const delta = kind === 'reverse' ? Math.PI : kind === 'quarter' ? Math.sign(cross) * Math.PI / 2 : 0;
    const stepMs = Number.isFinite(nativeDelay) && nativeDelay > 0 ? nativeDelay : DEFAULT_STEP;
    const slideMs = Number.isFinite(duration) && duration > 0 ? duration : stepMs * .55;
    const record = {
      kind, startedAt: t, duration: kind === 'quarter' || kind === 'reverse' ? stepMs : slideMs,
      nativeDelay: stepMs, gaitOrigin: previous?.gaitOrigin ?? (entity.lastMove ?? entity.bornAt ?? t),
      fromX, fromY, toX, toY, incomingX: oldDir.x, incomingY: oldDir.y,
      fromAngle: Math.atan2(oldDir.y, oldDir.x), delta, turnSign: Math.sign(cross) || 1,
      logicalX: entity.x, logicalY: entity.y, tailX: entity.tailX, tailY: entity.tailY,
      dirX: next.x, dirY: next.y, stamp: entity.moveStartedAt ?? entity.lastMove ?? t,
      scratch: previous?.scratch || {}
    };
    return record;
  }
  function recordStep(entity, {oldHead, oldTail, oldDir, t, duration, nativeDelay} = {}) {
    if (!entity || !finitePoint(oldHead) || !finitePoint(oldTail) || !finitePoint(oldDir) || !Number.isFinite(t)) return false;
    records.set(entity, makeRecord(entity, oldHead, oldTail, oldDir, t, duration, nativeDelay, records.get(entity)));
    stepCount++;
    return true;
  }
  function sync(entity, t) {
    if (!entity || !Number.isFinite(entity.x) || !Number.isFinite(entity.y) ||
        !Number.isFinite(entity.tailX) || !Number.isFinite(entity.tailY)) return null;
    let record = records.get(entity);
    const stamp = entity.moveStartedAt ?? entity.lastMove ?? t;
    if (!record || record.stamp !== stamp || record.logicalX !== entity.x || record.logicalY !== entity.y ||
        record.tailX !== entity.tailX || record.tailY !== entity.tailY ||
        record.dirX !== entity.dir?.x || record.dirY !== entity.dir?.y) {
      const oldHead = {x: entity.moveFromX ?? entity.x, y: entity.moveFromY ?? entity.y};
      const oldTail = {x: entity.tailMoveFromX ?? entity.tailX, y: entity.tailMoveFromY ?? entity.tailY};
      const dx = oldHead.x - oldTail.x, dy = oldHead.y - oldTail.y;
      const oldDir = Math.abs(dx) + Math.abs(dy) === 1 ? {x: dx, y: dy} : (entity.dir || {x: 1, y: 0});
      record = makeRecord(entity, oldHead, oldTail, oldDir, stamp, entity.moveDuration, DEFAULT_STEP, record);
      records.set(entity, record);
    }
    return record;
  }
  function sampleRecord(record, t, out = {}) {
    const u = clamp((t - record.startedAt) / record.duration), q = ease(u);
    const turning = record.kind === 'quarter' || record.kind === 'reverse';
    out.x = record.fromX + (record.toX - record.fromX) * (turning ? q : u);
    out.y = record.fromY + (record.toY - record.fromY) * (turning ? q : u);
    if (record.kind === 'quarter') {
      const length = tile / 2 / quarterIntegral;
      const x = length * integral(ix, q, false), y = record.turnSign * length * integral(iy, q, true);
      out.x = record.fromX + record.incomingX * x - record.incomingY * y;
      out.y = record.fromY + record.incomingY * x + record.incomingX * y;
    }
    const frontEnd = record.kind === 'reverse' ? .58 : .8;
    const rearStart = record.kind === 'reverse' ? .42 : .2;
    out.frontAngle = record.fromAngle + record.delta * ease(u / frontEnd);
    out.rearAngle = record.fromAngle + record.delta * ease((u - rearStart) / (1 - rearStart));
    out.frontOffset = record.kind === 'reverse' ? .4 * tile : .2 * tile;
    out.rearOffset = record.kind === 'reverse' ? -.7 * tile : -.2 * tile;
    out.curvature = (out.frontAngle - out.rearAngle) / (out.frontOffset - out.rearOffset);
    out.angle = out.rearAngle - out.curvature * out.rearOffset;
    out.frame = Math.floor(Math.max(0, t - record.gaitOrigin) / (record.nativeDelay / 2) + 1e-10) & 1;
    out.time = t; out.phase = record.kind; out.turnProgress = turning ? u : 0;
    out.scale = 1; out.lift = 0; out.pitch = 0;
    out.seam = out.seam || {}; out.seam.x = out.x; out.seam.y = out.y; out.seam.angle = out.angle;
    if (!out.sample || out.sample.owner !== out) {
      out.sample = (offset, target = {}) => sampleShape(offset, out, target);
      out.sample.owner = out;
    }
    out.head = out.sample(tile / 2, out.head || {});
    out.tail = out.sample(-tile / 2, out.tail || {});
    return out;
  }
  function sample(entity, t, out) {
    if (!Number.isFinite(t)) return null;
    const record = sync(entity, t);
    return record ? sampleRecord(record, t, out || record.scratch) : null;
  }
  function drawPose(ctx, pose) {
    renderPose.frame = pose.frame; renderPose.source = pose;
    ctx.save(); ctx.scale(unitScale, unitScale); art.draw(ctx, renderPose); ctx.restore();
  }
  function draw(ctx, entity, t) {
    if (!art || art.valid === false) {
      if (art?.valid === false) { art = null; preparing = null; recoveryPending = true; }
      if (recoveryPending && !preparing) prepare();
      return false;
    }
    const pose = sample(entity, t);
    if (!pose) return false;
    drawPose(ctx, pose); drawCount++;
    return true;
  }
  function geometry(entity,t,options={},out={}){
    if(!art||art.valid===false||typeof art.geometry!=='function')return null;
    const pose=sample(entity,t);if(!pose)return null;
    renderPose.frame=pose.frame;renderPose.source=pose;
    const result=art.geometry(renderPose,{scale:unitScale},out);
    if(result){const record=records.get(entity);result.time=t;result.phase=pose.phase;result.turnProgress=pose.turnProgress;
      result.gaitInterval=record.nativeDelay/2;result.gaitOrigin=record.gaitOrigin;}
    return result;
  }
  function contactBranchBreakpoints(record){
    if(record.kind!=='quarter'&&record.kind!=='reverse')return [];
    if(!art?.contactStraight)return [];
    if(record.contactBranchArt===art)return record.contactBranchTimes;
    const pose={},times=[],middle=record.startedAt+record.duration/2;
    const straight=t=>{
      renderPose.source=sampleRecord(record,t,pose);
      return art.contactStraight(renderPose);
    };
    // Native whole-art and isolated bent components have independently traced
    // contours. Announce both sides of their exact renderer branch changes;
    // continuous speed bounds cannot cover a source-contour replacement.
    // The turn opens and closes once. Bisect each monotone endpoint bracket
    // to adjacent representable times, not an arbitrary millisecond lattice.
    for(const interval of [[record.startedAt,middle],[middle,record.startedAt+record.duration]]){
      let [lo,hi]=interval;const before=straight(lo);
      if(straight(hi)===before)continue;
      for(let i=0;i<128;i++){
        const mid=lo+(hi-lo)/2;if(mid===lo||mid===hi)break;
        if(straight(mid)===before)lo=mid;else hi=mid;
      }
      times.push(lo,hi);
    }
    record.contactBranchArt=art;record.contactBranchTimes=times;
    return times;
  }
  function breakpoints(entity,from,to,out=[]){
    out.length=0;const record=sync(entity,from);if(!record||!(to>from))return out;
    const interval=record.nativeDelay/2,origin=record.gaitOrigin;
    for(let n=Math.max(1,Math.floor((from-origin)/interval)+1),t=origin+n*interval;t<to;n++,t=origin+n*interval)out.push(t);
    for(const t of contactBranchBreakpoints(record))if(t>from&&t<to)out.push(t);
    out.sort((a,b)=>a-b);
    return out;
  }
  function speedBound(entity,from,to){
    const record=sync(entity,from);if(!record)return 0;
    const translation=Math.hypot(record.toX-record.fromX,record.toY-record.fromY)*2.5/record.duration;
    const rotation=4*tile*Math.abs(record.delta)*1.875/(.58*record.duration);
    return translation+rotation;
  }
  function resolveMouth(player, t, out, callbacks) {
    const target = callbacks?.mouthTarget || mouthTarget;
    if (target) {
      const result = target(player, t, out) || out;
      if (finitePoint(result)) { out.x = result.x; out.y = result.y; return out; }
    }
    const position = callbacks?.playerPosition || playerPosition;
    const p = position ? (position(player, t, positionScratch) || positionScratch) : player;
    if (!finitePoint(p)) return null;
    const dx = player.dir?.x || 0, dy = player.dir?.y || 0, size = tile * .88;
    out.x = (p.x + .5) * tile + dx * size * .175;
    out.y = (p.y + .5) * tile + dy * size * .175 + dx * dx * size * .18125;
    return out;
  }
  function consume(entity, player, t, options = {}) {
    if (!art || art.valid === false || !player || !Number.isFinite(t)) return false;
    const record = sync(entity, t);
    if (!record) return false;
    const delay = options.delay ?? .35 * Math.max(1, player.moveDuration || 95);
    const visualStart = t + Math.max(0, delay);
    const activeTurn = (record.kind === 'quarter' || record.kind === 'reverse') && t < record.startedAt + record.duration;
    const duration = options.duration ?? (activeTurn ? 200 : options.atTail ? 220 : 140);
    if (!Number.isFinite(duration) || duration <= 0) return false;
    const captured = {...record, scratch: {}};
    const pose = sampleRecord(captured, visualStart, {}), mouth = resolveMouth(player, visualStart, {}, options);
    if (!mouth) return false;
    const dx = pose.x - mouth.x, dy = pose.y - mouth.y, radius = Math.hypot(dx, dy);
    const h = .1;
    const left = sampleRecord(captured, visualStart - h, {}), right = sampleRecord(captured, visualStart + h, {});
    const ml = resolveMouth(player, visualStart - h, {}, options), mr = resolveMouth(player, visualStart + h, {}, options);
    if (!ml || !mr) return false;
    const vx = ((right.x - mr.x) - (left.x - ml.x)) / (2 * h);
    const vy = ((right.y - mr.y) - (left.y - ml.y)) / (2 * h);
    const ax = ((right.x - mr.x) - 2 * dx + (left.x - ml.x)) / (h * h);
    const ay = ((right.y - mr.y) - 2 * dy + (left.y - ml.y)) / (h * h);
    const squared = Math.max(1e-12, radius * radius);
    const radialRate = (dx * vx + dy * vy) / squared;
    const angularRate = (dx * vy - dy * vx) / squared;
    const logSecond = (vx * vx + vy * vy + dx * ax + dy * ay) / squared - 2 * radialRate * radialRate;
    const angularSecond = (dx * ay - dy * ax) / squared - 2 * radialRate * angularRate;
    // Legal approaches normally close already. A pathological caller may be
    // moving away: prioritise bounded ingestion over an outward launch.
    const a = Math.min(-1e-9, radialRate);
    if (radialRate > 1e-9) captureFallbacks++;
    if (ghosts.length >= capacity) ghosts.shift();
    ghosts.push({record: captured, player, callbacks: options, createdAt: t, visualStart, duration, endAt: visualStart + duration,
      pose, x: dx, y: dy, radius, angle: Math.atan2(dy, dx), a, b: logSecond / a,
      angularRate, angularSecond, mouth: {}, target: {}});
    consumeCount++;
    return {visualStart, duration, endAt: visualStart + duration};
  }
  function sampleGhost(ghost, t) {
    const pose = sampleRecord(ghost.record, t, ghost.pose), target = ghost.target;
    target.scale = 1; target.x = pose.x; target.y = pose.y;
    if (t < ghost.visualStart) return target;
    const elapsed = Math.max(0, Math.min(ghost.duration, t - ghost.visualStart));
    const progress = t >= ghost.endAt ? 1 : ease(elapsed / ghost.duration), remaining = 1 - progress;
    const mouth = resolveMouth(ghost.player, t, ghost.mouth, ghost.callbacks);
    if (!mouth) { target.scale = 0; return target; }
    // Integrating an always-negative logarithmic radial speed preserves the
    // initial two derivatives while making distance strictly non-increasing.
    const logRadius = Math.abs(ghost.b) < 1e-12 ? ghost.a * elapsed :
      ghost.a / ghost.b * Math.expm1(Math.min(50, ghost.b * elapsed));
    const radius = ghost.radius * Math.exp(Math.min(0, logRadius)) * remaining;
    const angularTravel = ghost.angularRate * elapsed + .5 * ghost.angularSecond * elapsed * elapsed;
    const angle = ghost.angle + Math.PI / 3 * Math.tanh(angularTravel / (Math.PI / 3));
    target.x = mouth.x + radius * Math.cos(angle); target.y = mouth.y + radius * Math.sin(angle);
    target.scale = remaining;
    return target;
  }
  function drawGhosts(ctx, t) {
    if (!art || art.valid === false || !Number.isFinite(t)) {
      if (art?.valid === false) { art = null; preparing = null; recoveryPending = true; }
      if (recoveryPending && !preparing) prepare();
      return false;
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const ghost = ghosts[i];
      if (t < ghost.createdAt) continue;
      if (t >= ghost.endAt) { ghosts.splice(i, 1); continue; }
      const target = sampleGhost(ghost, t);
      if (!(target.scale > 0)) continue;
      ctx.save(); ctx.translate(target.x, target.y); ctx.scale(target.scale, target.scale);
      ctx.translate(-ghost.pose.x, -ghost.pose.y); drawPose(ctx, ghost.pose); ctx.restore();
    }
    return true;
  }
  function reset() { records = new WeakMap(); ghosts.length = 0; }
  function stats() {
    return {ready: !!art && art.valid !== false, error: lastError, steps: stepCount, draws: drawCount, consumed: consumeCount,
      ghosts: ghosts.length, captureFallbacks, tile, quarterWaist: .4 * tile, reverseWaist: 1.1 * tile,
      reverseDuration: DEFAULT_STEP, nativeMaterialLength: 2 * tile,
      runtimePixelReads: false, art: art?.stats || null};
  }
  function prepare() {
    if (art?.valid === false) { art = null; preparing = null; recoveryPending = true; }
    if (!preparing) preparing = Promise.resolve().then(loadArt).then(value => {
      if (!value || value.valid === false || typeof value.draw !== 'function') throw new TypeError('Scorpion art did not provide a valid renderer');
      art = value; lastError = null; recoveryPending = false; return true;
    }).catch(error => { lastError = String(error?.message || error); preparing = null; return false; });
    return preparing;
  }
  return Object.freeze({prepare, recordStep, step: recordStep, sample, draw, geometry,breakpoints,speedBound,consume, drawGhosts, reset,
    diagnostics: stats, get stats() { return stats(); }});
}

export const createLiveScorpionRenderer = createLiveScorpion;
