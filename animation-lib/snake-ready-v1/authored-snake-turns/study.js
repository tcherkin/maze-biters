import { registerSheet } from './sprite-registration.js';
import { FRAME_COUNT, TIMING, frameAt, snapAt, playbackAt, elapsedForPhase, clamp } from './study-model.js';

const $ = id => document.getElementById(id);
const panels = [$('before'), $('after')];
const contexts = panels.map(c => c.getContext('2d'));
const controls = ['mode', 'baseline', 'speed', 'zoom', 'pause', 'restart', 'prev', 'next', 'phase'];
controls.forEach(id => { $(id).disabled = true; });
let elapsed = 0, playing = true, lastTime = null, request = null, loaded = false;
let lastLabel = 0, lastStrip = '', renderCount = 0;
let sprites, original, backgrounds;
const metadata = {};
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Original 160px BODY has 57 opaque cross-section pixels, not an assumed
// half-cell width. Match that measured diameter at the 40px world tile scale.
const bodyThickness = 57 / 160 * 40;
const anchors = { head: { x: 190, y: 130 }, tail: { x: 245, y: 193 } };

function fail(error) {
  playing = false;
  if (request !== null) cancelAnimationFrame(request);
  request = null;
  $('error').hidden = false;
  $('error').textContent = `Прегледът не може да се зареди: ${error?.message || error}. Основната игра не е променена.`;
  $('status').textContent = 'Зареждането е прекъснато.';
  console.error(error);
}
window.addEventListener('error', event => fail(event.error || event.message));
window.addEventListener('unhandledrejection', event => fail(event.reason));

function newCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}
async function image(url) {
  const result = new Image(); result.src = url;
  await result.decode(); return result;
}

// Registration only: the authored pixels are cropped at their flat attachment,
// uniformly scaled, and cached. No frame morph, crossfade, dynamic mesh, or
// independent head rotation is used to manufacture the turn.
function prepareSheet(source, kind) {
  const scratch = newCanvas(source.width, source.height);
  const c = scratch.getContext('2d', { willReadFrequently: true });
  c.drawImage(source, 0, 0);
  const entries = registerSheet(c.getImageData(0, 0, source.width, source.height), {
    cols: 4, rows: 2, attachment: kind === 'head' ? 'left' : 'right',
  });
  const cacheAnchor = kind === 'head' ? { x: 40, y: 60 } : { x: 180, y: 60 };
  metadata[kind] = entries;
  const frames = entries.map(entry => {
    const canvas = newCanvas(256, 256), target = canvas.getContext('2d');
    const scale = bodyThickness * 2 / entry.anchor.diameter;
    const r = entry.sourceRect;
    target.drawImage(source, r.x, r.y, r.width, r.height,
      cacheAnchor.x + (r.x - entry.anchor.x) * scale,
      cacheAnchor.y + (r.y - entry.anchor.y) * scale,
      r.width * scale, r.height * scale);
    // Background under the supplied mouth holes is intentionally not invented.
    // The source alpha is preserved. The opaque mouth-mask pass of the live
    // renderer is a separate integration gate, not claimed by this art study.
    return canvas;
  });
  scratch.width = scratch.height = 1;
  return frames;
}

function atlas(c, col, row, x, y, w = 40, h = 40) {
  c.drawImage(original, col * 160, row * 160, 160, 160, x, y, w, h);
}
function horizontalBody(c, start, end, y) {
  // This exact source strip ends at the registered attachment; there is no
  // underlying fixed corner or head to peek out from the composite artwork.
  for (let x = start; x < end; x += 40) {
    const width = Math.min(40, end - x);
    c.drawImage(original, 320, 160, width / 40 * 160, 160, x, y - 20 + .125, width, 40);
  }
}
function verticalBody(c, x, start, end) {
  for (let y = start; y < end; y += 40) {
    const height = Math.min(40, end - y);
    c.drawImage(original, 320, 0, 160, height / 40 * 160, x - 20 + .125, y, 40, height);
  }
}
function untouchedBody(c, kind) {
  if (kind === 'head') {
    atlas(c, 4, 1, 50, 110); // left-pointing tail
    horizontalBody(c, 90, anchors.head.x, anchors.head.y);
  } else {
    verticalBody(c, anchors.tail.x, anchors.tail.y, 273);
    atlas(c, 0, 2, anchors.tail.x - 20, 273); // down-facing original head
  }
}
function drawnPatch(c, kind, index) {
  const a = anchors[kind];
  if (kind === 'head') c.drawImage(sprites.head[index], a.x - 20, a.y - 30, 128, 128);
  else {
    // One fixed coordinate-system rotation of the ENTIRE connected tail clip,
    // baked poses still supply all animation. This is not the rejected rotating
    // tail + fixed elbow trick. Its lighting orientation is a known art caveat.
    c.save(); c.translate(a.x, a.y); c.rotate(Math.PI / 2);
    c.drawImage(sprites.tail[index], -90, -30, 128, 128); c.restore();
  }
}
function originalPatch(c, kind, phase) {
  // Static original atlas poses are only a visual reference, NOT a claim to run
  // the live production movement scheduler. The matched baseline is the fair
  // causal comparison: it switches these same new composites at mid-phase.
  const end = phase >= .5;
  if (kind === 'head') {
    horizontalBody(c, 190, 230, 130);
    if (!end) atlas(c, 0, 1, 230, 110);
    else { atlas(c, 3, 3, 230, 110); atlas(c, 0, 2, 230, 150); }
  } else if (!end) {
    atlas(c, 4, 1, 185, 143);
    atlas(c, 3, 3, 225, 143);
    verticalBody(c, 245, 183, 193);
  } else atlas(c, 4, 2, 225, 153);
}

function rounded(c, x, y, w, h, r, fill, stroke) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}
function background(kind) {
  const canvas = newCanvas(960, 640), c = canvas.getContext('2d');
  c.scale(2, 2);
  c.fillStyle = '#080e17'; c.fillRect(0, 0, 480, 320);
  c.strokeStyle = '#152026'; c.lineWidth = .3;
  for (let x = 0; x < 480; x += 20) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 320); c.stroke(); }
  for (let y = 0; y < 320; y += 20) { c.beginPath(); c.moveTo(0, y); c.lineTo(480, y); c.stroke(); }
  // Broad test corridor, no stencil clipping to conceal bad geometry.
  const path = new Path2D();
  if (kind === 'head') { path.moveTo(25, 130); path.lineTo(217, 130); path.quadraticCurveTo(240, 130, 240, 153); path.lineTo(240, 290); }
  else { path.moveTo(80, 151); path.lineTo(220, 151); path.quadraticCurveTo(245, 151, 245, 175); path.lineTo(245, 340); }
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.lineWidth = 78; c.strokeStyle = '#372a4f'; c.stroke(path);
  c.lineWidth = 74; c.strokeStyle = '#10182a'; c.stroke(path);
  c.lineWidth = .45; c.strokeStyle = '#254345'; c.stroke(path);
  c.fillStyle = '#6c8c902d';
  for (let i = 0; i < 46; i++) c.fillRect((i * 79 + 9) % 480, (i * 47 + 17) % 320, .6, .6);
  return canvas;
}
function current() { return playbackAt(elapsed, $('mode').value); }
function camera(kind) { return kind === 'head' ? { x: 183, y: 151 } : { x: 231, y: 215 }; }

function drawPanel(c, proposed, state) {
  const zoom = Number($('zoom').value), center = camera(state.kind);
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 960, 640);
  c.save(); c.scale(2, 2); c.translate(240, 160); c.scale(zoom, zoom); c.translate(-center.x, -center.y);
  c.drawImage(backgrounds[state.kind], 0, 0, 480, 320);
  if (!state.resetting) {
    untouchedBody(c, state.kind);
    if (proposed || $('baseline').value === 'matched') drawnPatch(c, state.kind, proposed ? frameAt(state.phase) : snapAt(state.phase));
    else originalPatch(c, state.kind, state.phase);
  }
  c.restore();
  c.save(); c.scale(2, 2);
  rounded(c, 14, 14, 128, 25, 12, '#091115ed', '#31443a');
  c.font = '11px "Segoe UI",sans-serif'; c.fillStyle = '#b3c8b0';
  c.fillText(state.kind === 'head' ? 'ГЛАВА + ШИЯ  → ↓' : 'ОПАШКА + ИЗВИВКА', 25, 30);
  if (state.resetting) {
    c.fillStyle = '#a6baa9'; c.textAlign = 'center'; c.font = '13px "Segoe UI",sans-serif';
    c.fillText('Нов повтор', 240, 160);
  }
  c.restore();
}
function drawStrip(kind, selected) {
  const key = `${kind}:${selected}`; if (lastStrip === key) return; lastStrip = key;
  const c = $('contact-sheet').getContext('2d');
  c.clearRect(0, 0, 1200, 360); c.fillStyle = '#080f13'; c.fillRect(0, 0, 1200, 360);
  for (let i = 0; i < FRAME_COUNT; i++) {
    const x = i * 150;
    rounded(c, x + 6, 18, 138, 291, 13, i === selected ? '#193025' : '#101a19', i === selected ? '#97cc67' : '#263832');
    c.fillStyle = i === selected ? '#c3fa86' : '#81998b'; c.font = '13px "Segoe UI",sans-serif';
    c.fillText(`${String(i + 1).padStart(2, '0')}  /  ${Math.round(i / 7 * 100)}%`, x + 18, 43);
    c.save(); c.translate(x + 12, 73);
    const frame = sprites[kind][i];
    c.drawImage(frame, 0, 0, 128, 128);
    // The seam marker is beneath the art, not painted over the sprite.
    const ax = kind === 'head' ? 20 : 90;
    c.strokeStyle = '#92b68770'; c.setLineDash([3, 4]);
    c.beginPath(); c.moveTo(ax, 179); c.lineTo(ax, 206); c.stroke();
    c.setLineDash([]); c.fillStyle = '#95b080'; c.beginPath(); c.arc(ax, 179, 2.5, 0, 7); c.fill();
    c.restore();
  }
  c.fillStyle = '#839b8a'; c.font = '12px "Segoe UI",sans-serif';
  c.fillText('Точката показва фиксираното място на свързване. Самата опашка тук е в посоката на рисуваната серия.', 16, 340);
}
function label(state) {
  const index = frameAt(state.phase), matched = $('baseline').value === 'matched';
  $('phase').value = Math.round(state.phase * 1000);
  $('phaseLabel').value = `${Math.round(state.phase * 100)}% · кадър ${index + 1} / ${FRAME_COUNT}`;
  $('status').textContent = `${state.kind === 'head' ? 'Глава и шия' : 'Опашка и извивка'} · ${playing ? (state.resetting ? 'нов повтор' : 'в движение') : 'пауза'} · ${TIMING.turn} ms преход при 1×`;
  $('pause').textContent = playing ? 'Пауза' : 'Продължи';
  $('before-title').textContent = matched ? 'Рязка смяна' : 'Оригинални спрайтове';
  $('before-caption').textContent = matched
    ? 'Същите нови крайни пози — без междинни кадри.'
    : 'Ориентир за стила. Това не е изпълнение на игровата логика.';
}
function paint(forceLabel = false) {
  if (!loaded) return;
  const state = current(); contexts.forEach((c, i) => drawPanel(c, i === 1, state));
  drawStrip(state.kind, frameAt(state.phase)); renderCount++;
  if (forceLabel || performance.now() - lastLabel > 80) { label(state); lastLabel = performance.now(); }
}
function schedule() {
  if (request === null && playing && loaded && !document.hidden) request = requestAnimationFrame(tick);
}
function tick(now) {
  request = null;
  if (!playing || document.hidden) { lastTime = null; return; }
  if (lastTime !== null) elapsed += Math.min(80, Math.max(0, now - lastTime)) * Number($('speed').value);
  lastTime = now; paint(); schedule();
}
function setPlaying(value) {
  playing = value; lastTime = null;
  if (!playing && request !== null) { cancelAnimationFrame(request); request = null; }
  paint(true); schedule();
}
function seek(phase) {
  setPlaying(false); elapsed = elapsedForPhase(elapsed, phase); paint(true);
}
$('pause').addEventListener('click', () => setPlaying(!playing));
$('restart').addEventListener('click', () => { elapsed = 0; lastTime = null; setPlaying(true); });
$('phase').addEventListener('input', event => { const phase = Number(event.target.value) / 1000; seek(phase); });
$('prev').addEventListener('click', () => seek(clamp(frameAt(current().phase) - 1, 0, 7) / 7));
$('next').addEventListener('click', () => seek(clamp(frameAt(current().phase) + 1, 0, 7) / 7));
$('mode').addEventListener('change', () => { elapsed = 0; lastTime = null; lastStrip = ''; paint(true); });
for (const id of ['zoom', 'baseline']) $(id).addEventListener('change', () => paint(true));
$('speed').addEventListener('change', () => { lastTime = null; paint(true); });
document.addEventListener('visibilitychange', () => {
  lastTime = null;
  if (document.hidden && request !== null) { cancelAnimationFrame(request); request = null; }
  else schedule();
});

async function start() {
  const [head, tail, source] = await Promise.all([
    image('./assets/head-neck-sheet.png'), image('./assets/tail-elbow-sheet-v4.png'), image('./assets/original-green-160.png'),
  ]);
  original = source; sprites = { head: prepareSheet(head, 'head'), tail: prepareSheet(tail, 'tail') };
  backgrounds = { head: background('head'), tail: background('tail') };
  loaded = true; playing = !reducedMotion;
  controls.forEach(id => { $(id).disabled = false; });
  $('validation').textContent = '8 кадъра за глава + 8 за опашка. Фиксирана сглобка с оригиналното тяло. Новият рисунък не е пикселно идентичен с оригиналните крайни пози; няма потвърдено преливане към игровия рендер. Това е тест на рисуваните форми, не готова замяна.';
  // Read-only diagnostic snapshot for a local test harness; no remote telemetry.
  Object.defineProperty(window, '__authoredTurnStudy', { get: () => ({
    loaded, playing, phase: current().phase, kind: current().kind,
    renderCount, frameCount: FRAME_COUNT, metadata,
    cacheBytes: (16 * 256 * 256 + 2 * 960 * 640) * 4,
    productionIntegrated: false,
  }) });
  paint(true); schedule();
}
start().catch(fail);
