import {createEncounter, sampleEncounter} from './encounter.js';
import {createScorpionBiteArt, drawEncounter} from './art.js';
import {createPlayerMouthAtlases} from '../snake-bite-study/player-mouth-art.js';
import {drawDeadEndMaze} from '../scorpion-turn-study/dead-end-maze.js';
import {loadBentArt} from '../scorpion-turn-study/bent-art.js';
import {createTurnContactProbe} from './turn-contact.js';
import {createTurnEncounter, sampleTurnEncounter} from './turn-encounter.js';

const $ = id => document.getElementById(id);
const controls = [...document.querySelectorAll('button,select,input')];
controls.forEach(control => control.disabled = true);
const canvas = $('scene'), ctx = canvas.getContext('2d'), prior = $('before').getContext('2d');
const state = {time: 0, playing: !matchMedia('(prefers-reduced-motion: reduce)').matches};
const framePose = {};
let cfg, art, mouths, maze, loaded = false, raf = null, last = null, lastUi = -1;
const turnConfigs = new Map();
let contactStats;
const makeCanvas = (width, height) => {
  const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
};
async function image(url) { const im = new Image(); im.src = url; await im.decode(); return im; }
function configure() {
  const turning = $('mode').value === 'turn';
  cfg = turning ? turnConfigs.get(Number($('turnPhase').value)) : createEncounter({direction: $('direction').value, mode: $('mode').value});
  $('direction').disabled = turning;
  $('turnPhaseControl').hidden = !turning;
  $('sceneNote').textContent = turning
    ? 'Захапване по време на готовия 180° завой · 200 ms · извиването и крачетата продължават · същият тесен тунел.'
    : `Една обща хапка · ${Math.round(cfg.headDuration * 1000)} ms · ${cfg.mode === 'headOn' ? 'по-ранно видимо смаляване откъм щипките' : 'приетото поглъщане откъм опашката'}.`;
  state.time = 0; last = null; lastUi = -1;
  $('time').max = Math.ceil(cfg.totalTime * 1000);
}
function sample(time, out) { return cfg.mode === 'turn' ? sampleTurnEncounter(time, cfg, out) : sampleEncounter(time, cfg, out); }
function camera(c, pose) {
  const zoom = Number($('zoom').value), focus = {
    x: (pose.player.x + pose.scorpion.x) / 2,
    y: (pose.player.y + pose.scorpion.y) / 2
  };
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#060910'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.setTransform(2, 0, 0, 2, 0, 0);
  c.translate(378, 200); c.scale(zoom, zoom); c.translate(-focus.x, -focus.y);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  // Same narrow fixture, rotated as a scene for the four controlled approaches.
  c.save(); c.translate(378, 270); c.rotate(pose.player.angle); c.translate(-378, -270);
  c.drawImage(maze, 0, 0, 756, 540); c.restore();
}
function guides(c, pose) {
  if (!$('guides').checked) return;
  c.save(); c.lineWidth = .5;
  for (const [point, color] of [[cfg.contactPoint, '#ffc979'], [pose.player.mouth, '#8ce8cd']]) {
    c.strokeStyle = color; c.beginPath(); c.arc(point.x, point.y, 2, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
}
function paint(force = false) {
  if (!loaded) return;
  const pose = sample(state.time, framePose);
  camera(ctx, pose); drawEncounter(ctx, pose, art, mouths); guides(ctx, pose);
  if ($('compare').checked) { camera(prior, pose); drawEncounter(prior, pose, art, mouths, true); guides(prior, pose); }
  // Text updates are throttled; the visual clock is not.
  if (force || Math.abs(state.time - lastUi) > .04) {
    lastUi = state.time;
    $('time').value = Math.round(state.time * 1000);
    $('timeLabel').textContent = `${state.time.toFixed(3)} s`;
    $('play').textContent = state.playing ? 'Пауза' : 'Продължи';
    $('phase').textContent = pose.complete ? 'Скорпионът е погълнат' : pose.active ? 'Цялото тяло се прибира в устата' : cfg.mode === 'turn' ? 'Завой в задънена улица · човечето го настига' : 'Приближаване · отваряне преди допира';
    $('status').textContent = `${state.playing ? 'Движение' : 'Пауза'} · ${$('speed').value}× · ${pose.logicalCells} игрови клетки · ${Math.round(pose.progress * 100)}% поглъщане · контакт ${cfg.firstBite.toFixed(3)} s · продължителност ${Math.round(cfg.headDuration * 1000)} ms`;
  }
}
function schedule() { if (loaded && state.playing && !document.hidden && raf === null) raf = requestAnimationFrame(tick); }
function tick(now) {
  raf = null;
  if (!state.playing || document.hidden) { last = null; return; }
  if (last !== null) state.time += Math.min(.08, (now - last) / 1000) * Number($('speed').value);
  last = now;
  if (state.time >= cfg.totalTime) {
    if ($('repeat').checked) state.time %= cfg.totalTime;
    else { state.time = cfg.totalTime; state.playing = false; last = null; }
    lastUi = -1;
  }
  paint(); schedule();
}
function setPlaying(value) {
  state.playing = value; last = null;
  if (raf !== null) cancelAnimationFrame(raf); raf = null;
  paint(true); schedule();
}
function seek(time) { state.time = Math.max(0, Math.min(cfg.totalTime, time)); setPlaying(false); }
$('play').addEventListener('click', () => { if (state.time >= cfg.totalTime) state.time = 0; setPlaying(!state.playing); });
$('restart').addEventListener('click', () => { state.time = 0; setPlaying(true); });
$('bite').addEventListener('click', () => { state.time = cfg.firstBite - .15; setPlaying(true); });
for (const id of ['direction', 'mode', 'turnPhase']) $(id).addEventListener('change', () => { configure(); setPlaying(true); });
$('compare').addEventListener('change', () => {
  $('stages').classList.toggle('compare', $('compare').checked);
  $('previous').hidden = !$('compare').checked; paint(true);
});
for (const id of ['zoom', 'guides', 'repeat']) $(id).addEventListener('change', () => paint(true));
$('speed').addEventListener('change', () => { last = null; paint(true); });
$('time').addEventListener('input', () => seek(Number($('time').value) / 1000));
$('stepBack').addEventListener('click', () => seek(state.time - 1 / 120));
$('stepNext').addEventListener('click', () => seek(state.time + 1 / 120));
for (const button of document.querySelectorAll('[data-progress]')) button.addEventListener('click', () => {
  const progress = Number(button.dataset.progress);
  if (progress === 0 || progress === 1) return seek(cfg.firstBite + cfg.headDuration * progress);
  // Milestones refer to the visible absorption, not its non-linear clock.
  let low = cfg.firstBite, high = cfg.firstBite + cfg.headDuration;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (sample(mid).progress < progress) low = mid; else high = mid;
  }
  seek((low + high) / 2);
});
document.addEventListener('visibilitychange', () => {
  last = null;
  if (document.hidden && raf !== null) { cancelAnimationFrame(raf); raf = null; }
  else schedule();
});
function fail(error) {
  loaded = false; state.playing = false;
  if (raf !== null) cancelAnimationFrame(raf); raf = null;
  controls.forEach(control => control.disabled = true);
  $('error').hidden = false; $('error').textContent = `Неуспешно зареждане: ${error.message || error}`;
  console.error(error);
}
window.addEventListener('error', event => fail(event.error || event.message));
window.addEventListener('unhandledrejection', event => fail(event.reason));
async function start() {
  const [scorpion, player, walls, bentArt] = await Promise.all([
    image('../scorpion-turn-study/assets/scorpion.png'),
    image('../snake-bite-study/assets/player-characters.png'),
    image('../snake-ready-v1/snake-maze-walk/assets/game-maze-pipes.png'), loadBentArt()
  ]);
  art = createScorpionBiteArt(scorpion, makeCanvas, bentArt);
  mouths = createPlayerMouthAtlases(player, makeCanvas);
  const probe = createTurnContactProbe(bentArt, mouths, makeCanvas);
  try {
    for (const turnPhase of [.25, .5, .75]) turnConfigs.set(turnPhase,
      createTurnEncounter({turnPhase, measureContact: probe.measureContact}));
    contactStats = probe.stats();
  } finally { probe.dispose(); }
  maze = makeCanvas(1512, 1080); const c = maze.getContext('2d'); c.scale(2, 2); drawDeadEndMaze(c, walls, 'narrow');
  loaded = true; controls.forEach(control => control.disabled = false); configure();
  // Explicit development seam: deterministic inspection without a second clock.
  window.scorpionBiteStudy = {seek, setPlaying, sample: () => sample(state.time), config: () => cfg, state, stats: art.stats, contactStats};
  paint(true); schedule();
}
start().catch(fail);
