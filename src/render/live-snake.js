import {createHybridProfile} from '../../animation-lib/snake-ready-v1/snake-maze-walk/head-hybrid.js?v=1.02.03.00';
import {createMouthAtlas} from '../../animation-lib/snake-ready-v1/snake-maze-walk/head-mouth-smooth.js?v=1.02.03.00';
import {mouthState} from '../../animation-lib/snake-ready-v1/snake-maze-walk/head-mouth.js?v=1.02.03.00';
import {registerSheet} from '../../animation-lib/snake-ready-v1/authored-snake-turns/sprite-registration.js?v=1.02.03.00';
import {createNativeSnakePalette} from './snake-palette.js?v=1.02.03.00';
import {createMaterialCurve, createRigidHeadCurve, createRouteWindowCurve, createJoinedPrefixCurve, attachRetiringTail} from './live-snake-curve.js?v=1.02.03.00';
import {prepareSpriteContours} from './contact-shapes.js?v=1.02.03.00';

// Geometry stays in the accepted 36-unit reference space. The sole outer
// conversion makes it independent of the production game's 16-unit cells.
const CELL = 36, DIAMETER = 57 / 160 * CELL, TAIL = 35 * DIAMETER / 16;
const HEAD = 215.5 * DIAMETER / 76, BODY_GAP = 4;
const PALETTES = Object.freeze(['Green', 'Yellow', 'Blue', 'Pink', 'Orange']);
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const u = clamp(value); return u * u * u * (10 + u * (-15 + 6 * u)); };
const HEAD_VISIBLE_PHASE=(()=>{let low=0,high=1;for(let i=0;i<64;i++){
  const middle=(low+high)/2;if(smooth(middle)>.001)high=middle;else low=middle;
}return high;})();
const mix = (a, b, u) => a + (b - a) * u;
const mod = (a, b) => ((a % b) + b) % b;
const copyCells = cells => cells.map(p => ({x: p.x, y: p.y}));
const sameCell = (a, b) => a && b && a.x === b.x && a.y === b.y;

export function snakePalette(color = '') {
  const c = String(color).toLowerCase();
  if (/66c2ff|blue/.test(c)) return 'Blue';
  if (/ff8873|orange|red/.test(c)) return 'Orange';
  if (/d66bff|ff5fa2|pink|magenta/.test(c)) return 'Pink';
  if (/35e55b|green/.test(c)) return 'Green';
  return 'Yellow';
}

function glide(phase, start, end) {
  if (phase <= start) return 0;
  if (phase >= end) return 1;
  const u = (phase - start) / (end - start), ramp = .2;
  if (u >= ramp && u <= 1 - ramp) return (u - ramp / 2) / (1 - ramp);
  const q = u < ramp ? u : 1 - u;
  const result = .5 * (q - ramp / Math.PI * Math.sin(Math.PI * q / ramp)) / (1 - ramp);
  return u < ramp ? result : 1 - result;
}
export function liveSnakePulse(phase, length, backwards = false, out = {}) {
  const u = clamp(phase), p = backwards ? 1 - u : u;
  const head = glide(p, .45, 1), gather = glide(p, 0, .5);
  const body = Math.max(0, length - HEAD - TAIL);
  const capacity = Math.min(16, Math.max(0, body - BODY_GAP), body * .3, .6 * CELL * Math.PI / 4);
  const advance = .4 * p + .6 * head;
  out.progress = backwards ? 1 - advance : advance;
  out.compression = capacity * (gather - head);
  out.phase = p;
  return out;
}

// An OPEN path through actual live cells, not the fixture's closed route.
// Collinear cells need no corner object. Every real right angle keeps the
// accepted half-cell radius, including consecutive one-cell U-turn corners.
export function makeLiveSnakePath(cells, direction = {x: 1, y: 0}) {
  const vertices = [];
  for (const cell of cells) {
    const p = {x: (cell.x + .5) * CELL, y: (cell.y + .5) * CELL};
    if (!vertices.length || Math.hypot(p.x - vertices.at(-1).x, p.y - vertices.at(-1).y) > 1e-7)
      vertices.push(p);
  }
  if (!vertices.length) throw new RangeError('Live snake path requires a cell');
  const cellCenters=vertices.slice(),cellDistances=new Float64Array(vertices.length);
  const first = vertices[0], last = vertices.at(-1);
  let firstX = direction.x, firstY = direction.y, lastX = direction.x, lastY = direction.y;
  if (vertices.length > 1) {
    const a = vertices[1], b = vertices.at(-2), da = Math.hypot(a.x - first.x, a.y - first.y), db = Math.hypot(last.x - b.x, last.y - b.y);
    firstX = (a.x - first.x) / da; firstY = (a.y - first.y) / da;
    lastX = (last.x - b.x) / db; lastY = (last.y - b.y) / db;
  }
  vertices.unshift({x: first.x - firstX * CELL * 2, y: first.y - firstY * CELL * 2});
  vertices.push({x: last.x + lastX * CELL * 2, y: last.y + lastY * CELL * 2});
  const pieces = [];
  let distance = 0, previous = vertices[0];
  function line(a, b) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-8) return;
    pieces.push({type: 'line', x: a.x, y: a.y, tx: (b.x - a.x) / length,
      ty: (b.y - a.y) / length, start: distance, length});
    distance += length;
  }
  for (let i = 1; i < vertices.length - 1; i++) {
    const a = vertices[i - 1], b = vertices[i], c = vertices[i + 1];
    const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
    const ix = (b.x - a.x) / before, iy = (b.y - a.y) / before;
    const ox = (c.x - b.x) / after, oy = (c.y - b.y) / after;
    const cross = ix * oy - iy * ox, dot = ix * ox + iy * oy;
    if (Math.abs(cross) < .5 || Math.abs(dot) > 1e-6) {
      line(previous, b);cellDistances[i-1]=distance;previous = b;continue;
    }
    const radius = Math.min(CELL / 2, before / 2, after / 2), sign = Math.sign(cross);
    const entry = {x: b.x - ix * radius, y: b.y - iy * radius};
    const exit = {x: b.x + ox * radius, y: b.y + oy * radius};
    const cx = entry.x + ox * radius, cy = entry.y + oy * radius;
    line(previous, entry);
    const length = radius * Math.PI / 2;
    cellDistances[i-1]=distance+length/2;
    pieces.push({type: 'arc', cx, cy, radius, sign,
      angle: Math.atan2(entry.y - cy, entry.x - cx), start: distance, length});
    distance += length; previous = exit;
  }
  line(previous, vertices.at(-1));
  function sample(s, out = {}) {
    let low = 0, high = pieces.length - 1;
    while (low < high) { const middle = (low + high) >> 1; if (s < pieces[middle].start + pieces[middle].length) high = middle; else low = middle + 1; }
    const p = pieces[low], local = s - p.start;
    if (p.type === 'line') { out.x = p.x + p.tx * local; out.y = p.y + p.ty * local; out.tx = p.tx; out.ty = p.ty; out.curve = 0; }
    else { const angle = p.angle + p.sign * local / p.radius;
      out.x = p.cx + p.radius * Math.cos(angle); out.y = p.cy + p.radius * Math.sin(angle);
      out.tx = -p.sign * Math.sin(angle); out.ty = p.sign * Math.cos(angle); out.curve = p.sign / p.radius; }
    out.angle = Math.atan2(out.ty, out.tx); return out;
  }
  function project(x, y,preferredDistance=0) {
    let best = Infinity, result = 0;
    for (const p of pieces) {
      let local;
      if (p.type === 'line') local = Math.max(0, Math.min(p.length, (x - p.x) * p.tx + (y - p.y) * p.ty));
      else {
        let turn = Math.atan2(y - p.cy, x - p.cx) - p.angle;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn)) * p.sign;
        local = Math.max(0, Math.min(p.length, turn * p.radius));
      }
      const q = sample(p.start + local), error = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (error < best-1e-10 || Math.abs(error-best)<=1e-10
        &&Math.abs(p.start+local-preferredDistance)<Math.abs(result-preferredDistance)) {
        best = error; result = p.start + local;
      }
    }
    return result;
  }
  function ribbonSpan(s, maximum, direction = 1) {
    // Stay inside one straight piece. Curves retain the accepted fine mesh.
    // The tiny directional probe chooses the correct side at shared vertices.
    const probe = s + direction * 1e-7;
    let low = 0, high = pieces.length - 1;
    while (low < high) { const middle = (low + high) >> 1;
      if (probe < pieces[middle].start + pieces[middle].length) high = middle; else low = middle + 1; }
    const piece = pieces[low];
    const remaining = direction > 0 ? piece.start + piece.length - s : s - piece.start;
    if (remaining <= 1e-7) return Math.min(maximum, 1.6);
    return Math.min(maximum, remaining, piece.type === 'line' ? Infinity : 1.6);
  }
  function cellArc(cell,fromHead=false){
    const x=(cell.x+.5)*CELL,y=(cell.y+.5)*CELL;
    // A head may legally enter the simultaneously vacated tail cell. Those
    // equal coordinates are two different occurrences on the route, never a
    // nearest-point search. Endpoint extensions can cross other cells too.
    for(let n=0;n<cellCenters.length;n++){
      const index=fromHead?cellCenters.length-1-n:n,p=cellCenters[index];
      if(p.x===x&&p.y===y)return cellDistances[index];
    }
    throw new RangeError('Snake cell is not an occurrence on its committed route');
  }
  return {pieces, total: distance, sample, project, ribbonSpan,cellArc,cellArcAt(index){return cellDistances[index];}};
}

function reversePath(path) {
  return {total: path.total, sample(s, out = {}) {
    path.sample(path.total - s, out); out.tx = -out.tx; out.ty = -out.ty;
    out.angle = Math.atan2(out.ty, out.tx); out.curve = -out.curve; return out;
  }, project(x, y) { return path.total - path.project(x, y); },
  ribbonSpan(s, maximum, direction = 1) { return path.ribbonSpan(path.total - s, maximum, -direction); }};
}
function canvas(width, height) { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; }
async function image(relative) { const im = new Image(); im.src = new URL(relative, import.meta.url).href; await im.decode(); return im; }
function tint(source, transfer) {
  const result = canvas(source.width, source.height), ctx = result.getContext('2d');
  ctx.drawImage(source, 0, 0);
  if (!transfer) return result;
  const pixels = ctx.getImageData(0, 0, result.width, result.height), data = pixels.data;
  transfer.apply(data);
  ctx.putImageData(pixels, 0, 0); return result;
}

export function createLiveSnakeRenderer({tile = 16, playerPosition = null, mouthTarget = null} = {}) {
  if (!(tile > 0)) throw new RangeError('Positive game tile size required');
  const worldScale = tile / CELL;
  let states = new WeakMap(), ghosts = [], ready = false, failure = null, loading = null, profile, palettes;
  let layerA, layerB, cacheBytes = 0, pathBuilds = 0, drawCalls = 0;
  const motionKinds={forwardRail:0,reverseRail:0,reverseTailJoin:0,materialFallback:0};
  let cacheGeneration = 0, recoveries = 0, ownedCaches = [];
  let paletteTransfers = {};
  let headContours = null,soloHeadContours=null;
  const point = {}, second = {}, sample = {}, pulse = {};

  function invalidate(reason = 'Snake artwork cache invalidated') {
    ready = false; failure = new Error(reason);
  }
  async function prepare({force = false} = {}) {
    if (force) invalidate('Snake artwork cache refresh requested');
    if (ready) return api;
    if (loading) return loading;
    const generation = ++cacheGeneration;
    if (ownedCaches.length) recoveries++;
    for (const surface of ownedCaches) surface.width = surface.height = 1;
    ownedCaches = []; cacheBytes = 0; palettes = null;
    loading = (async () => {
      const root = '../../animation-lib/snake-ready-v1/authored-snake-turns/assets/';
      const [headImage, tailImage, nativeImages] = await Promise.all([
        image(root + 'head-neck-sheet.png'), image(root + 'tail-elbow-sheet-v4.png'),
        Promise.all(PALETTES.map(name => image(`../../assets/atlases/4k/snake-${name.toLowerCase()}-160.png`)))
      ]);
      profile = createHybridProfile({cell: {x: 0, y: 0, width: headImage.naturalWidth / 4, height: headImage.naturalHeight / 2}});
      const full = createMouthAtlas(headImage, profile, canvas);
      const compact = canvas(full.image.width / 2, full.image.height / 2);
      compact.getContext('2d').drawImage(full.image, 0, 0, compact.width, compact.height);
      full.image.width = full.image.height = 1;
      const read = canvas(tailImage.naturalWidth, tailImage.naturalHeight), rc = read.getContext('2d');
      rc.drawImage(tailImage, 0, 0);
      const entry = registerSheet(rc.getImageData(0, 0, read.width, read.height), {cols: 4, rows: 2, attachment: 'right'})[7];
      const sourceWidth = entry.anchor.x - entry.bounds.x;
      const tail = canvas(Math.ceil(sourceWidth / 2), Math.ceil(entry.cell.height / 2));
      tail.getContext('2d').drawImage(tailImage, entry.bounds.x, entry.cell.y, sourceWidth, entry.cell.height, 0, 0, tail.width, tail.height);
      const tailScale = DIAMETER / entry.anchor.diameter;
      const tailY = (entry.cell.y - entry.anchor.y) * tailScale, tailHeight = entry.cell.height * tailScale;
      read.width = read.height = 1;
      const paletteRead = canvas(800, 640), pg = paletteRead.getContext('2d', {willReadFrequently: true});
      pg.drawImage(nativeImages[0], 0, 0);
      const greenPixels = pg.getImageData(0, 0, 800, 640).data;
      palettes = {}; paletteTransfers = {};
      for (let i = 0; i < PALETTES.length; i++) {
        const name = PALETTES[i], nativeImage = nativeImages[i];
        pg.clearRect(0, 0, 800, 640); pg.drawImage(nativeImage, 0, 0);
        const transfer = i ? createNativeSnakePalette(greenPixels, pg.getImageData(0, 0, 800, 640).data) : null;
        // The body is native artwork, byte-for-byte, not a recolored green crop.
        const body = canvas(160, 57); body.getContext('2d').drawImage(nativeImage, 320, 211, 160, 57, 0, 0, 160, 57);
        const art = {mouth: tint(compact, transfer), body, tail: tint(tail, transfer), tailY, tailHeight};
        paletteTransfers[name] = transfer?.stats ?? {source: 'original-green', alphaPreserved: true, neutralDetailsPreserved: true};
        palettes[name] = art;
        for (const part of [art.mouth, art.body, art.tail]) cacheBytes += part.width * part.height * 4;
      }
      compact.width = compact.height = tail.width = tail.height = paletteRead.width = paletteRead.height = 1;
      headContours=prepareSpriteContours(palettes.Green.mouth,Array.from({length:97},(_,frame)=>({
        sx:frame%9*112,sy:Math.floor(frame/9)*88,sw:112,sh:88})),canvas,{threshold:32,tolerance:.25,id:'snake-head'});
      const soloAtlas=canvas(1008,968),sg=soloAtlas.getContext('2d');
      for(let frame=0;frame<97;frame++){
        const x=frame%9*112,y=Math.floor(frame/9)*88;
        sg.save();sg.translate(x,y);sg.beginPath();sg.moveTo(21,0);
        sg.bezierCurveTo(9,7.5,1,18,1,35);sg.bezierCurveTo(1,52.5,9.5,63,21,68);
        sg.lineTo(21,88);sg.lineTo(112,88);sg.lineTo(112,0);sg.closePath();sg.clip();
        sg.drawImage(palettes.Green.mouth,x,y,112,88,0,0,112,88);sg.restore();
      }
      soloHeadContours=prepareSpriteContours(soloAtlas,Array.from({length:97},(_,frame)=>({
        sx:frame%9*112,sy:Math.floor(frame/9)*88,sw:112,sh:88})),canvas,{threshold:32,tolerance:.25,id:'snake-head-solo'});
      soloAtlas.width=soloAtlas.height=1;
      layerA = canvas(256, 256); layerB = canvas(256, 256); cacheBytes += 2 * 256 * 256 * 4;
      ownedCaches = [...Object.values(palettes).flatMap(art => [art.mouth, art.body, art.tail]), layerA, layerB];
      for (const surface of ownedCaches) {
        surface.addEventListener?.('contextlost', () => {
          if (generation === cacheGeneration) invalidate('Snake artwork cache context lost; awaiting restoration');
        });
        surface.addEventListener?.('contextrestored', () => {
          if (generation === cacheGeneration && !ready) {
            // Recovery is observable via stats; the old game renderer can
            // paint during this interval instead of losing the whole frame.
            queueMicrotask(() => { prepare().catch(() => {}); });
          }
        });
      }
      failure = null; ready = true; return api;
    })().catch(error => { ready = false; failure = error; throw error; });
    const pending = loading;
    try { return await pending; }
    finally { if (loading === pending) loading = null; }
  }

  function initial(s, t) {
    const path = makeLiveSnakePath([...s.body].reverse(), s.dir); pathBuilds++;
    const head = s.body[0], distance = path.cellArc(head,true) + HEAD / 2;
    const tailDistance=s.body.length===1?distance-HEAD:path.cellArc(s.body.at(-1),false)-(CELL-HEAD/2);
    return {path, fromHead: distance, toHead: distance, startedAt: t, duration: 218,
      physicalLength:distance-tailDistance,
      backwards: !!s.reversing, count: s.body.length, frontMaterial: s.body.length * CELL,
      materialSign: 1, palette: snakePalette(s.color), trim: null, birth: null, body: copyCells(s.body),
      routeCells:copyCells([...s.body].reverse())};
  }
  function ensure(s, t) { let state = states.get(s); if (!state) { state = initial(s, t); states.set(s, state); } return state; }
  function evaluate(state, t, out = {}) {
    // Holding a native route stops locomotion, not the independent bite clock.
    const motionTime=state.heldAt??t;
    const phase = !state.motion && Math.abs(state.toHead - state.fromHead) < 1e-8 ? 1
      : clamp((motionTime - state.startedAt) / Math.max(1, state.duration));
    // The logical length is still count cells. Rounded corners have a shorter
    // physical centerline, which must not be paid for by pushing the tail
    // farther outside its own logical cell at every subsequent corner.
    liveSnakePulse(phase, state.count * CELL, state.backwards, pulse);
    if(state.motion)state.motion.update(pulse.progress);
    let length = state.motion ? state.motion.total : state.physicalLength??(state.count === 1 ? HEAD : state.count * CELL);
    let solo = state.count === 1 ? 1 : 0;
    let birth = 1;
    if (state.birth) {
      birth = smooth((t - state.birth.at) / state.birth.duration);
      length = mix(state.birth.fromLength, state.birth.toLength, birth);
      solo = state.birth.solo ? birth : 0;
    }
    if (state.trim) {
      const trim=state.trim, base=trim.baseBirth;
      const bp=base?smooth((t-base.at)/base.duration):0;
      length=base?mix(base.fromLength,base.toLength,bp):trim.baseLength;
      solo=base?.solo?bp:trim.baseSolo;
      // Each real bite removes its own material on its own clock. A new bite
      // never replaces an unfinished transition with its future-sized pose.
      for(const part of trim.parts){
        const p=smooth((t-part.at)/part.duration);
        length-=part.amount*p;
        if(part.solo)solo=mix(solo,1,p);
      }
    }
    // The new movement curve already captures the compressed visible span.
    // Do not add that compression back through an absolute bite/birth length.
    const transitionRemaining=state.transitionCompression
      ?1-smooth((t-state.transitionAt)/Math.max(1,state.transitionEnd-state.transitionAt)):1;
    const transitionOffset=(state.trim||state.birth)?(state.transitionCompression||0)*(1-pulse.progress)*transitionRemaining:0;
    length-=transitionOffset;
    // A two-cell bend can shorten an interpolated centerline below the two
    // unchanged end pieces. Never squash the authored tail into that deficit:
    // retain their combined arc space on this SAME path, extending its tail
    // tangent by the small deficit. Head pose is unchanged; ordinary step
    // endpoints already have enough space. Actual bite/birth shortening keeps
    // its explicit morph and is deliberately not subject to this allowance.
    if(state.count>1&&!state.trim&&!state.birth)length=Math.max(length,HEAD+TAIL);
    liveSnakePulse(phase, length, state.backwards, pulse);
    state.motion?.setCompression?.(pulse.compression);
    out.path = state.motion || state.path;
    out.headDistance = state.motion ? state.motion.total : mix(state.fromHead, state.toHead, pulse.progress);
    out.length = length; out.solo = solo; out.birth = birth; out.phase = pulse.phase;
    out.compression = pulse.compression; out.tailDistance = out.headDistance - length + pulse.compression;
    out.transitionOffset=transitionOffset;
    out.rearDistance = out.headDistance - HEAD; out.state = state;
    return out;
  }
  function capture(s, t) {
    if (!s?.body?.length) return null;
    const state = ensure(s, t), saved = {...state, body: copyCells(s.body),
      motion: state.motion?.clone(), trim: state.trim ? {...state.trim,
        baseBirth:state.trim.baseBirth?{...state.trim.baseBirth}:null,
        parts:state.trim.parts.map(part=>({...part}))} : null, birth: state.birth ? {...state.birth} : null};
    return {state: saved, at: t, count: s.body.length, body: copyCells(s.body), color: s.color};
  }
  function recordStep(s, {oldBody, t, duration = 218, wasReversing = false} = {}) {
    if (!s?.body?.length || !Number.isFinite(t)) return;
    if (!states.has(s) && oldBody?.length) states.set(s, initial({body: oldBody,
      dir: s.dir, reversing: wasReversing, color: s.color}, t));
    const state = ensure(s, t), previous = evaluate(state, t, {});
    previous.path.sample(previous.rearDistance, point);
    const priorRear = {...point};
    if(state.body.length===s.body.length&&state.body.every((cell,i)=>sameCell(cell,s.body[i])))return;
    const cells = [...(oldBody?.length ? oldBody : state.body)].reverse();
    // Logical tail cells disappear before their95ms painted material does.
    // Keep the incoming corner of that still-visible interval as well as the
    // usual three-cell route guard; otherwise a bite can truncate the rail
    // and make a valid curved tail fail the continuity check below.
    const pendingLength=Math.max(0,previous.length-(state.trim?.to??state.birth?.toLength??previous.length));
    const historyGuard=3+Math.ceil(pendingLength/CELL);
    if(state.routeCells){
      // Retain the traversed corner behind the tail. Rebuilding an incoming
      // tail tangent from only occupied cells would otherwise erase it early.
      const history=state.routeCells;
      for(let start=history.length-cells.length;start>=0;start--){
        if(cells.every((cell,i)=>sameCell(cell,history[start+i]))){
          if(s.reversing)cells.push(...copyCells(history.slice(start+cells.length,start+cells.length+3)));
          else cells.unshift(...copyCells(history.slice(Math.max(0,start-historyGuard),start)));
          break;
        }
      }
    }
    if (s.reversing) {
      const newTail = s.body.at(-1); if (!sameCell(newTail, cells[0])) cells.unshift({...newTail});
    } else if (!sameCell(s.body[0], cells.at(-1))) cells.push({...s.body[0]});
    // Three historical cells include the incoming arc of the visible tail
    // even when every cell is a corner. Two retain its coordinate but can
    // replace the last few pixels of that incoming arc with an extension.
    if (!s.reversing&&cells.length > s.body.length + historyGuard) cells.splice(0, cells.length - s.body.length - historyGuard);
    if (s.reversing&&cells.length > s.body.length + 4) cells.length=s.body.length+4;
    const path = makeLiveSnakePath(cells, s.dir); pathBuilds++;
    const head = s.body[0];
    const bodyStart=s.reversing?0:cells.length-s.body.length;
    const targetHead = path.cellArcAt(bodyStart+s.body.length-1) + HEAD / 2;
    const tail = s.body.at(-1), targetTail = s.body.length===1 ? targetHead-HEAD
      : path.cellArcAt(bodyStart)-(CELL-HEAD/2);
    if(s.body.length===1){
      // The engine's forward-facing direction is authoritative even when a
      // solitary head travels backwards along its own route history.
      const angle=Math.atan2(s.dir.y,s.dir.x);
      const target={x:(head.x+.5)*CELL-Math.cos(angle)*HEAD/2,
        y:(head.y+.5)*CELL-Math.sin(angle)*HEAD/2,angle};
      const oldHead=(oldBody?.length?oldBody:state.body)[0];
      const centerVia=state.count===1&&!state.trim&&!state.birth
        ?{x:(oldHead.x+.5)*CELL,y:(oldHead.y+.5)*CELL}:null;
      state.motion=createRigidHeadCurve(priorRear,target,HEAD,centerVia);
      if((state.trim||state.birth)&&previous.tailDistance<previous.rearDistance-1e-7)
        state.motion=attachRetiringTail(state.motion,previous.path,previous.rearDistance);
    }else{
      let rail=null;
      {
        // Consumption changes the visible interval, not the occupied route.
        // An active bite must not force the entire surviving body to morph
        // between cell-indexed curves. Verify its actual captured rail below
        // exactly as for an uneaten snake; only a genuine mismatch needs a
        // local leading-corner join or the existing material fallback.
        const oldHead=(oldBody?.length?oldBody:state.body)[0];
        const oldHeadIndex=s.reversing?s.body.length:cells.length-2;
        const preferred=path.cellArcAt(oldHeadIndex)-HEAD/2;
        let rear=path.project(priorRear.x,priorRear.y,preferred);
        // A partly presented leading-tail turn can include a short snake's
        // nape. Align by the unchanged head-side continuation in that case.
        if(s.reversing){
          const pendingPrefix=state.motion?.kind==='joined-prefix'&&state.motion.materialProgress<1?state.motion.prefixLength:0;
          const anchorDistance=Math.max(previous.headDistance,pendingPrefix)+CELL;
          const anchor=previous.path.sample(anchorDistance),projected=path.project(anchor.x,anchor.y,
            preferred+HEAD+anchorDistance-previous.headDistance);
          const matched=path.sample(projected);
          if(Math.hypot(anchor.x-matched.x,anchor.y-matched.y)<1e-5
            &&Math.hypot(anchor.tx-matched.tx,anchor.ty-matched.ty)<1e-6)
            rear=projected-(anchorDistance-previous.rearDistance);
        }
        const fromHead=rear+HEAD,visibleLength=previous.headDistance-previous.tailDistance;
        const fromTail=fromHead-visibleLength;
        let continuous=true;
        // Only the body and the nape live on the rail. The rigid head artwork
        // projects ahead from that nape; its imaginary nose-path is not a
        // constraint on adding a future turn. Check positions AND tangents.
        for(let i=0;i<=24&&continuous;i++){
          const offset=(previous.rearDistance-previous.tailDistance)*i/24;
          const a=previous.path.sample(previous.tailDistance+offset),b=path.sample(fromTail+offset);
          continuous=Math.hypot(a.x-b.x,a.y-b.y)<1e-5&&Math.hypot(a.tx-b.tx,a.ty-b.ty)<1e-6;
        }
        if(continuous&&(s.reversing?targetHead<=fromHead+1e-7:targetHead>=fromHead-1e-7))
          rail=createRouteWindowCurve(path,fromHead,visibleLength,targetHead,targetHead-targetTail);
        else if(s.reversing){
          // A new tail decision can replace the already visible leading tip.
          // Join at the first unchanged outgoing tangent, not by moving every
          // existing body corner sideways to its next material position.
          const oldCells=(oldBody?.length?oldBody:state.body),oldTail=oldCells.at(-1),next=oldCells.at(-2);
          const jx=(oldTail.x+.5)*CELL+(next.x-oldTail.x)*CELL/2;
          const jy=(oldTail.y+.5)*CELL+(next.y-oldTail.y)*CELL/2;
          let join=path.project(jx,jy,path.cellArcAt(1)+CELL/2);
          let fromJoin=previous.rearDistance+(join-rear);
          if(state.motion?.kind==='joined-prefix'&&state.motion.materialProgress<1&&fromJoin<state.motion.prefixLength){
            join+=state.motion.prefixLength-fromJoin;fromJoin=state.motion.prefixLength;
          }
          let coreMatches=fromJoin>previous.tailDistance&&join>targetTail&&Number.isFinite(fromJoin);
          for(let i=0;i<=24&&coreMatches;i++){
            const offset=Math.max(0,previous.rearDistance-fromJoin)*i/24;
            const a=previous.path.sample(fromJoin+offset),b=path.sample(join+offset);
            coreMatches=Math.hypot(a.x-b.x,a.y-b.y)<1e-5&&Math.hypot(a.tx-b.tx,a.ty-b.ty)<1e-6;
          }
          if(coreMatches)rail=createJoinedPrefixCurve(previous.path,previous.tailDistance,fromJoin,previous.headDistance,
            path,targetTail,join,targetHead,s.body.length===2?TAIL:0);
        }
      }
      // Native cadence can change before the preceding visual pulse finishes.
      // Capture its ACTUAL compressed tip, not the uncompressed material start,
      // or resetting the new pulse to zero makes the tail jump backwards.
      state.motion=rail||createMaterialCurve(previous.path,previous.tailDistance,previous.headDistance,
        path,targetTail,targetHead);
      if(rail?.kind==='route-window')motionKinds[s.reversing?'reverseRail':'forwardRail']++;
      else if(rail)motionKinds.reverseTailJoin++;
      else motionKinds.materialFallback++;
    }
    state.path=path;state.fromHead=0;state.toHead=targetHead;
    state.transitionCompression=(state.trim||state.birth)?previous.compression+previous.transitionOffset:0;
    state.transitionAt=t;
    state.transitionEnd=Math.max(state.trim?.endAt??-Infinity,
      state.birth?state.birth.at+state.birth.duration:-Infinity);
    state.startedAt = t; state.duration = Math.max(1, duration); state.backwards = !!s.reversing;
    delete state.heldAt;
    state.count = s.body.length; state.body = copyCells(s.body);state.routeCells=copyCells(cells);
    if(state.trim&&t>=(state.trim.endAt??state.trim.at+state.trim.duration))state.trim=null;
    if(state.birth&&t>=state.birth.at+state.birth.duration)state.birth=null;
    // The simulator owns half-speed retreat; do not multiply its duration a
    // second time or flip the forward-facing head when time runs backwards.
    state.modeChanged = wasReversing !== state.backwards;
  }
  function schedule(t, player, duration = 95) {
    const step = Number.isFinite(player?.moveDuration) ? player.moveDuration : 95;
    const lead = Math.min(33.25, Math.max(0, step * .35));
    return {at: t + lead, duration: Math.max(25, duration)};
  }
  const timingResult = timing => ({visualStart: timing.at, duration: timing.duration, endAt: timing.at + timing.duration});
  function biteTail(s, token, {t = token?.at, player = null} = {}) {
    if (!token || !s?.body?.length) return null;
    const state = states.get(s) || {...token.state}, timing = schedule(t, player);
    const current = evaluate(state, t, {});
    const survivingLength=state.trim?.to??state.birth?.toLength??current.length;
    state.count = s.body.length; state.body = copyCells(s.body);
    const removed=Math.max(0,token.count-state.count),bodyRatio=Math.max(0,survivingLength-HEAD)/Math.max(.01,token.count*CELL-HEAD);
    const to=state.count===1?HEAD:Math.max(HEAD,survivingLength-removed*CELL*bodyRatio);
    const prior=state.trim, continuing=prior&&t<(prior.endAt??prior.at+prior.duration);
    const baseBirth=!prior&&state.birth?{...state.birth}:null;
    state.trim = {...timing, from: current.length, to,
      fromSolo: current.solo, toSolo: state.count === 1 ? 1 : 0,
      baseLength:continuing?prior.baseLength:current.length+current.transitionOffset,
      baseSolo:continuing?prior.baseSolo:current.solo,
      baseBirth:continuing?prior.baseBirth:baseBirth,
      parts:[...(continuing?prior.parts:[]),{...timing,amount:survivingLength-to,solo:state.count===1}],
      endAt:Math.max(timing.at+timing.duration,continuing?prior.endAt??prior.at+prior.duration:-Infinity)};
    states.set(s, state);
    return timingResult(timing);
  }
  function addGhost(token, options, headOnly = false) {
    if (!token) return null;
    const t = options.t ?? token.at, timing = schedule(t, options.player, 95);
    // A caller's capture remains the exact event-time material snapshot.
    // Forecasting the bite-facing angle, and later advancing a swallowed
    // skull, must mutate only this ghost's private motion evaluator.
    const playback={...token,state:{...token.state,motion:token.state.motion?.clone()}};
    const player=options.player, facing=player?.dir
      ?Math.atan2(player.dir.y,player.dir.x)+(player.controllerTiltDegrees||0)*Math.PI/180:null;
    const start=evaluate(playback.state,timing.at,{}),sourceFacing=start.path.sample(start.rearDistance).angle;
    const targetFacing=facing===null?null:sourceFacing+Math.atan2(Math.sin(facing-sourceFacing),Math.cos(facing-sourceFacing));
    const ghost = {token:playback, player, sourceFacing, targetFacing, at: timing.at, duration: options.duration ?? 140, headOnly};
    ghosts.push(ghost); return timingResult(ghost);
  }
  function consume(s, token, options = {}) { const result = addGhost(token, options, false); states.delete(s); return result; }
  function split(original, created, token, {t = token?.at, index, player = null} = {}) {
    if (!token || !Array.isArray(created) || !Number.isInteger(index)) return null;
    const before = evaluate(token.state, t, {}), timing = schedule(t, player);
    if(before.path.snapshot)before.path=before.path.snapshot();
    const fromNose = (index + .5) * CELL;
    const nominalBody = Math.max(.01, before.length - HEAD - TAIL);
    const bodyRate = (nominalBody - before.compression) / nominalBody;
    const cut = fromNose <= HEAD ? before.headDistance - fromNose
      : fromNose >= before.length - TAIL ? before.tailDistance + before.length - fromNose
      : before.rearDistance - (fromNose - HEAD) * bodyRate;
    const frontCount = index, rearCount = token.count - index - 1;
    let childIndex = 0;
    for (const role of ['front', 'rear']) {
      const count = role === 'front' ? frontCount : rearCount;
      if (!count) continue;
      const child = created[childIndex++]; if (!child?.body?.length) continue;
      const reverse = role === 'rear', path = reverse ? reversePath(before.path) : before.path;
      const headDistance = reverse ? before.path.total - before.tailDistance : before.headDistance;
      const state = {path, fromHead: headDistance, toHead: headDistance, startedAt: t, duration: 218,
        backwards: false, count: child.body.length, palette: token.state.palette,
        frontMaterial: reverse ? token.state.frontMaterial - token.state.materialSign * before.length : token.state.frontMaterial,
        materialSign: reverse ? -token.state.materialSign : token.state.materialSign,
        body: copyCells(child.body), trim: null,
        // New fragments inherit the actual occupied rail, including the
        // consumed cell's incoming corner, while their cut ends form.
        routeCells:copyCells(reverse?[...(token.state.routeCells??token.body.slice().reverse())].reverse()
          :token.state.routeCells??token.body.slice().reverse()),
        birth: {...timing, role, fromLength: reverse ? cut - before.tailDistance : before.headDistance - cut,
          toLength: count === 1 ? HEAD : count * CELL, solo: count === 1}};
      states.set(child, state);
    }
    const result = index === 0 ? addGhost(token, {t, player}, true) : timingResult(timing);
    states.delete(original);
    return result;
  }

  function bodyRibbon(ctx, pose, start, end, art) {
    if (!(end > start + .001)) return;
    const state = pose.state, nominal = Math.max(.01, pose.length - HEAD - TAIL * (1 - pose.solo));
    const rate = nominal / Math.max(.01, nominal - pose.compression);
    for (let s = start; s < end - 1e-6;) {
      const material = state.frontMaterial - state.materialSign * (HEAD + (pose.rearDistance - s) * rate);
      const u = mod(material - TAIL, CELL) / CELL;
      const direction = state.materialSign, toBoundary = (direction > 0 ? 1 - u : u || 1) * CELL / rate;
      const ds = pose.path.ribbonSpan(s, Math.min(end - s, Math.max(.0001, toBoundary)));
      const sourceW = Math.min(160, ds * rate / CELL * 160);
      let sx = direction > 0 ? u * 160 : u * 160 - sourceW;
      if (sx < -.0001) sx = 160 - sourceW;
      sx = Math.max(0, Math.min(160 - sourceW, sx));
      pose.path.sample(s + ds / 2, point);
      ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(point.angle);
      try {
        if (direction < 0) ctx.scale(-1, 1);
        ctx.drawImage(art.body, sx, 0, sourceW, 57, -ds / 2 - .28, -DIAMETER / 2, ds + .56, DIAMETER);
      } finally { ctx.restore(); }
      drawCalls++; s += ds;
    }
  }
  function tailRibbon(ctx, pose, tip, base, art) {
    const span = Math.abs(base - tip), sign = Math.sign(base - tip);
    if (span < .02) return;
    for (let d = 0; d < span; d += 1.2) {
      const ds = Math.min(1.2, span - d); pose.path.sample(tip + sign * (d + ds / 2), point);
      ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(point.angle + (sign < 0 ? Math.PI : 0));
      try { ctx.drawImage(art.tail, d / span * art.tail.width, 0, ds / span * art.tail.width, art.tail.height,
        -ds / 2 - .3, art.tailY, ds + .6, art.tailHeight); }
      finally { ctx.restore(); }
      drawCalls++;
    }
  }
  function scratchLayer(surface, center, paint) {
    const c = surface.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 256, 256);
    c.setTransform(2, 0, 0, 2, 128 - center.x * 2, 128 - center.y * 2); paint(c); return c;
  }
  function compositeLayer(ctx, surface, center, alpha = 1) {
    ctx.save(); ctx.globalAlpha *= alpha;
    try { ctx.drawImage(surface, center.x - 64, center.y - 64, 128, 128); }
    finally { ctx.restore(); }
    drawCalls++;
  }
  function cap(ctx, pose, tip, base, progress, art) {
    if (Math.abs(base - tip) < .02) return;
    if (progress >= 1) { tailRibbon(ctx, pose, tip, base, art); return; }
    pose.path.sample((tip + base) / 2, second); const center = {x: second.x, y: second.y};
    const a = scratchLayer(layerA, center, c => bodyRibbon(c, pose, Math.min(tip, base), Math.max(tip, base), art));
    scratchLayer(layerB, center, c => tailRibbon(c, pose, tip, base, art));
    a.save(); a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'destination-in';
    a.drawImage(layerB, 0, 0); a.globalAlpha = 1 - progress; a.fillRect(0, 0, 256, 256);
    a.globalCompositeOperation = 'lighter'; a.globalAlpha = progress; a.drawImage(layerB, 0, 0); a.restore();
    compositeLayer(ctx, layerA, center);
  }
  function roundedNape(ctx, amount) {
    if (amount <= 0) return;
    const k = profile.width / 218, x = v => profile.offsetX + (v - 220) * k;
    const y = v => profile.offsetY + (v - 128) * k, a = amount;
    ctx.beginPath(); ctx.moveTo(x(220 + 42 * a), y(128));
    ctx.bezierCurveTo(x(220 + 18 * a), y(143), x(220 + 2 * a), y(164), x(220 + 2 * a), y(198));
    ctx.bezierCurveTo(x(220 + 2 * a), y(233), x(220 + 19 * a), y(254), x(220 + 42 * a), y(264));
    ctx.lineTo(x(262), y(304)); ctx.lineTo(x(444), y(304)); ctx.lineTo(x(444), y(128)); ctx.closePath(); ctx.clip();
  }
  function head(ctx, pose, art, alpha = 1, closureOverride = null) {
    if (alpha <= 0) return;
    pose.path.sample(pose.rearDistance, point);
    const closure = closureOverride ?? mouthState(pose.phase, true, 'thrust').closure;
    const frame = Math.round(clamp(closure) * 96), k = profile.width / 218;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(point.x, point.y); ctx.rotate(point.angle); roundedNape(ctx, pose.solo);
    try { ctx.drawImage(art.mouth, frame % 9 * 112, Math.floor(frame / 9) * 88, 112, 88,
      profile.offsetX, profile.offsetY, 224 * k, 176 * k); }
    finally { ctx.restore(); }
    drawCalls++;
  }
  function paint(ctx, pose, headOnly = false, closure = null) {
    const art = palettes[pose.state.palette];
    if (headOnly) { head(ctx, {...pose, solo: 1}, art, 1, closure); return; }
    const birth = pose.state.birth, backBirth = birth?.role === 'rear';
    const headSpan = backBirth ? mix(TAIL, HEAD, pose.birth) : HEAD;
    const bodyEnd = pose.headDistance - headSpan;
    let span = TAIL * (1 - pose.solo) * (birth ? pose.birth : 1);
    span = Math.min(span, Math.max(0, bodyEnd - pose.tailDistance));
    const base = pose.tailDistance + span;
    bodyRibbon(ctx, pose, base, bodyEnd + .15, art);
    if (span > .02) {
      if(pose.solo>0){
        pose.path.sample((pose.tailDistance+base)/2,second);const center={x:second.x,y:second.y};
        scratchLayer(layerA,center,c=>tailRibbon(c,pose,pose.tailDistance,base,art));
        compositeLayer(ctx,layerA,center,1-pose.solo);
      }else cap(ctx, pose, pose.tailDistance, base, birth ? pose.birth : 1, art);
    }
    if (backBirth && pose.birth < 1) {
      pose.path.sample(pose.headDistance - TAIL / 2, second); const center = {x: second.x, y: second.y};
      scratchLayer(layerA, center, c => tailRibbon(c, pose, pose.headDistance, pose.headDistance - TAIL, art));
      compositeLayer(ctx, layerA, center, 1 - pose.birth);
    }
    head(ctx, pose, art, backBirth ? pose.birth : 1, closure);
  }
  function draw(ctx, s, t, {freeze = false} = {}) {
    if (!ready || !s?.body?.length || ctx.isContextLost?.()) return false;
    const state = ensure(s, t), clock = typeof freeze === 'number' && Number.isFinite(freeze)
      ? freeze : freeze ? state.lastPaintTime ?? t : t;
    if (!freeze) state.lastPaintTime = clock;
    evaluate(state, clock, sample);
    ctx.save(); ctx.scale(worldScale, worldScale); ctx.imageSmoothingEnabled = true;
    try { paint(ctx, sample); return true; }
    catch (error) { invalidate(`Snake artwork draw failed: ${error.message}`); return false; }
    finally { ctx.restore(); }
  }
  function target(player, t, fallback) {
    const authoritative = mouthTarget?.(player, t);
    if (authoritative && Number.isFinite(authoritative.x) && Number.isFinite(authoritative.y))
      return {x: authoritative.x / worldScale, y: authoritative.y / worldScale};
    const p = playerPosition?.(player, t) || player;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return fallback;
    const direction = player?.dir || {x: 1, y: 0};
    return {x: (p.x + .5 + direction.x * .175) * CELL,
      y: (p.y + .5 + direction.y * .175 + .18125 * direction.x ** 2) * CELL};
  }
  function drawGhosts(ctx, t) {
    if (!ready || ctx.isContextLost?.()) return;
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const ghost = ghosts[i], p = smooth((t - ghost.at) / ghost.duration);
      if (p >= 1) { ghosts.splice(i, 1); continue; }
      const pose = evaluate(ghost.token.state, t, {});
      pose.path.sample(pose.rearDistance, point);
      const center = {x: point.x + Math.cos(point.angle) * HEAD / 2, y: point.y + Math.sin(point.angle) * HEAD / 2};
      const mouth = target(ghost.player, t, center);
      ctx.save(); ctx.scale(worldScale, worldScale); ctx.imageSmoothingEnabled = true;
      ctx.translate(mix(center.x, mouth.x, p), mix(center.y, mouth.y, p));
      if((ghost.headOnly||ghost.token.count===1)&&ghost.targetFacing!==null){
        // Latch the bite-facing direction: a later native player bank change
        // must not snap an already shrinking, non-collidable skull sideways.
        const sourceFacing=ghost.sourceFacing+Math.atan2(Math.sin(point.angle-ghost.sourceFacing),Math.cos(point.angle-ghost.sourceFacing));
        // Keep the chosen shortest branch across a moving skull's antipode;
        // recomputing a principal target delta each frame flips its sign there.
        ctx.rotate((ghost.targetFacing-sourceFacing)*p);
      }
      ctx.scale(1 - p, 1 - p); ctx.translate(-center.x, -center.y);
      try { paint(ctx, pose, ghost.headOnly, mix(mouthState(pose.phase, true, 'thrust').closure, 1, p)); }
      catch (error) { invalidate(`Snake swallowed-art draw failed: ${error.message}`); return; }
      finally { ctx.restore(); }
    }
  }
  function collisionArt() {
    if(!ready)return null;
    const k=profile.width/218;
    return {image:palettes.Green.mouth,contours:headContours,soloContours:soloHeadContours,frames:97,cols:9,sw:112,sh:88,
      dx:profile.offsetX*worldScale,dy:profile.offsetY*worldScale,
      dw:224*k*worldScale,dh:176*k*worldScale};
  }
  function getWorldGeometry(s,t) {
    if(!s?.body?.length||!Number.isFinite(t))return null;
    const state=ensure(s,t),pose=evaluate(state,t,{}),path=pose.path;
    const progress=path.materialProgress;
    const activate=()=>{if(progress!==undefined)path.update(progress);path.setCompression?.(pose.compression);};
    const at=distance=>{activate();const p=path.sample(distance);return {x:p.x*worldScale,y:p.y*worldScale,angle:p.angle};};
    const backBirth=state.birth?.role==='rear',headSpan=backBirth?mix(TAIL,HEAD,pose.birth):HEAD;
    const end=pose.headDistance-headSpan;
    const tailSpan=Math.min(TAIL*(1-pose.solo)*(state.birth?pose.birth:1),Math.max(0,end-pose.tailDistance));
    const closure=mouthState(pose.phase,true,'thrust').closure,frame=Math.round(clamp(closure)*96);
    const art=collisionArt();
    const baseContour=(pose.solo>=1?soloHeadContours:headContours)?.[frame]??null;
    const head={...at(pose.rearDistance),span:HEAD*worldScale,closure,frame,solo:pose.solo,alpha:backBirth?pose.birth:1,
      contour:baseContour&&pose.solo>0&&pose.solo<1?clipNapeContour(baseContour,pose.solo):baseContour,
      clipPolygon:pose.solo>0&&pose.solo<1?napePolygon(pose.solo):null,
      sprite:art?{...art,sx:frame%9*112,sy:Math.floor(frame/9)*88}:null};
    const count=state.count;
    return {head,tail:at(pose.tailDistance),length:(pose.headDistance-pose.tailDistance)*worldScale,
      logicalLength:state.count,compression:pose.compression*worldScale,tailSpan:tailSpan*worldScale,
      collisionTailDistance:Math.max(0,pose.length-(state.trim?.to??state.birth?.toLength??pose.length))*worldScale,
      bodyEndDistance:Math.max(0,end-pose.tailDistance)*worldScale,diameter:DIAMETER*worldScale,
      backwards:state.backwards,birth:pose.birth,
      sample(distance,out={}) {
        activate();path.sample(pose.tailDistance+distance/worldScale,out);
        out.x*=worldScale;out.y*=worldScale;out.curve/=worldScale;return out;
      },
      stripSpan(distance,maximum) {
        // Coalesce the existing 1.25-world-pixel collider strips only while
        // their curve, taper and material role are exactly linear/unchanged.
        // Retaining their old lattice leaves every curved polygon untouched.
        const unit=1.25,arc=pose.tailDistance+distance/worldScale;
        activate();let limit=Math.min(maximum,path.ribbonSpan(arc,maximum/worldScale)*worldScale);
        const cap=tailSpan*worldScale;
        if(cap>distance+1e-7)limit=Math.min(limit,cap-distance);
        const rear=(pose.rearDistance-pose.tailDistance)*worldScale;
        if(rear>distance+1e-7)limit=Math.min(limit,rear-distance);
        if(count>2&&pose.rearDistance>pose.tailDistance+tailSpan){
          const range=pose.rearDistance-pose.tailDistance-tailSpan;
          for(let k=1;k<count-2;k++){
            const boundary=(pose.rearDistance-range*k/(count-2)-pose.tailDistance)*worldScale;
            if(boundary>distance+1e-7)limit=Math.min(limit,boundary-distance);
          }
        }
        const multiples=Math.floor((limit+1e-8)/unit);
        return Math.min(maximum,multiples>=1?multiples*unit:unit);
      },
      indexAt(distance) {
        // The body texture and semantic cells share this head-relative material
        // coordinate, including the accepted compression pulse. End caps are
        // explicitly classified instead of extending rounded capsules past tip.
        const arc=pose.tailDistance+distance/worldScale;
        if(arc>=pose.rearDistance)return 0;
        if(arc<=pose.tailDistance+tailSpan||count<=2)return count-1;
        const fromHead=(pose.rearDistance-arc)/Math.max(.01,pose.rearDistance-pose.tailDistance-tailSpan);
        return Math.max(1,Math.min(count-2,1+Math.floor(fromHead*(count-2))));
      }};
  }
  function napePolygon(amount) {
    // Same two Bezier curves as roundedNape, in112x88 source-frame units.
    // The caller can clip the cached head alpha against this convex boundary
    // during the brief partial-solo consumption transition.
    const points=[{x:21*amount,y:0}],a=amount;
    const curve=(p0,p1,p2,p3)=>{for(let i=1;i<=12;i++){const t=i/12,u=1-t;
      points.push({x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,
        y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y});}};
    curve(points[0],{x:9*a,y:7.5},{x:a,y:18},{x:a,y:35});
    curve(points.at(-1),{x:a,y:52.5},{x:9.5*a,y:63},{x:21*a,y:68});
    points.push({x:21,y:88},{x:112,y:88},{x:112,y:0});return points;
  }
  function clipNapeContour(contour,amount) {
    const boundary=napePolygon(amount),curved=boundary.slice(0,25);
    // Split at the lower Bezier join. Each mask is convex; their union is
    // exactly the curved nape plus its lower quadrilateral, without assuming
    // the complete mask or the source mouth silhouette is convex.
    const masks=[[...curved,{x:112,y:68},{x:112,y:0}],
      [curved.at(-1),{x:21,y:88},{x:112,y:88},{x:112,y:68}]],parts=[];
    const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
    for(const mask of masks){
      const area=mask.reduce((sum,a,i)=>{const b=mask[(i+1)%mask.length];return sum+a.x*b.y-a.y*b.x;},0),sign=Math.sign(area);
      for(const part of contour.parts){let points=part.points;
        for(let i=0;i<mask.length&&points.length;i++){
          const a=mask[i],b=mask[(i+1)%mask.length],next=[];
          for(let j=0;j<points.length;j++){
            const p=points[j],q=points[(j+1)%points.length],dp=cross(a,b,p)*sign,dq=cross(a,b,q)*sign;
            if(dp>=-1e-9)next.push(p);
            if((dp>=0)!==(dq>=0)){const u=dp/(dp-dq);next.push({x:mix(p.x,q.x,u),y:mix(p.y,q.y,u)});}
          }points=next;
        }
        if(points.length>=3)parts.push({...part,id:`${part.id}-nape-${parts.length}`,points});
      }
    }
    return {...contour,parts};
  }
  function hold(s,t) {
    if(!s?.body?.length||!Number.isFinite(t))return false;
    const state=ensure(s,t);if(state.heldAt===undefined)state.heldAt=t;return true;
  }
  function surfaceSpeedBound(s,from,to) {
    const state=states.get(s);
    if(!state)return 0;
    if(!Number.isFinite(from)||!Number.isFinite(to)||to<from)return 3;
    const movement=state.heldAt===undefined&&(state.motion||Math.abs(state.toHead-state.fromHead)>1e-8);
    const end=Math.max(movement?state.startedAt+state.duration:-Infinity,
      state.trim?state.trim.endAt:-Infinity,
      state.birth?state.birth.at+state.birth.duration:-Infinity);
    return from>=end?0:3;
  }
  function contactBreakpoints(s,from,to) {
    const state=states.get(s);
    if(!state||!Number.isFinite(from)||!Number.isFinite(to)||to<from)return [];
    const end=to,times=[];
    const add=time=>{if(time>=from&&time<=end)times.push(time);};
    // Rear fragments fade a newly authored head into view. Its collision
    // silhouette is admitted at alpha>.001, an actual appearance even when
    // the newborn has not yet made its first logical movement commit.
    if(state.birth?.role==='rear'){
      const birth=state.birth;let at=birth.at+HEAD_VISIBLE_PHASE*birth.duration;
      while(smooth((at-birth.at)/birth.duration)<=.001)at+=Math.max(Number.MIN_VALUE,Math.abs(at)*Number.EPSILON);
      add(at);
    }
    // Partial solo napes use the matching continuous clip; the exact endpoint
    // switches to the precomputed source-alpha contour and is announced too.
    for(const transition of [state.birth,...(state.trim?.parts||[])])if(transition){add(transition.at);add(transition.at+transition.duration);}
    // round(96 * (1-sin(pi*p)^4)) changes only at these192 analytic
    // half-integer crossings. Inverting each monotone half avoids a sampling
    // grid entirely, including arbitrarily short frame spans near extrema.
    if(state.motion||Math.abs(state.toHead-state.fromHead)>1e-8)for(let frame=0;frame<96;frame++){
      const phase=Math.asin((1-(frame+.5)/96)**.25)/Math.PI;
      for(const p of [phase,1-phase]){
        const time=state.startedAt+p*state.duration;
        if(time<=(state.heldAt??Infinity))add(time);
      }
    }
    return [...new Set(times)].sort((a,b)=>a-b);
  }
  // All callbacks close over state and are safe to pass without `.bind(api)`.
  const api = {prepare, invalidate, recordStep, capture, biteTail, split, consume, draw, drawGhosts,
    getWorldGeometry,getCollisionArt:collisionArt,hold,contactBreakpoints,surfaceSpeedBound,
    reset() { states = new WeakMap(); ghosts = []; },
    inspect(s, t) { const state = states.get(s); if (!state) return null; const pose = evaluate(state, t, {});
      const rear = pose.path.sample(pose.rearDistance), tail = pose.path.sample(pose.tailDistance);
      return {length: pose.length, solo: pose.solo, compression: pose.compression, phase: pose.phase,
        palette: state.palette, count: state.count, materialSign: state.materialSign,
        rear, tail, headDistance: pose.headDistance, frontMaterial: state.frontMaterial, backwards: state.backwards}; },
    stats() { return {ready, error: failure?.message || null, palettes: ready ? Object.keys(palettes) : [],
      cachedBytes: cacheBytes, mouthFrames: 97, atlasSize: [1008, 968], pathBuilds, drawCalls,motionKinds:{...motionKinds},
      ghosts: ghosts.length, preparing: !!loading, recoveries, cacheGeneration,
      paletteSource: 'original-native-atlases', nativeBodyPixels: true, paletteTransfers,
      runtimeCanvasCreation: false, runtimePixelReads: false}; }
  };
  return api;
}
