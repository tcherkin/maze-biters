import {TILE} from './motion.js';

const CELL = 160, WIDTH = CELL * 2, HEIGHT = CELL, SCALE = TILE / CELL;
const CLAW_PIVOT = 272, TAIL_PIVOT = 62;
const clamp01 = value => Math.max(0, Math.min(1, value));
const ease = value => {
  const u = clamp01(value);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
let loading;

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

// These masks follow the original right-facing attachment boundaries. The
// central face at x244,y74..84 belongs to the body, not to the pincers.
function partAt(x, y) {
  const clawEdge = 61 + (x - 224) * .5;
  if (x >= 248 || (x >= 224 && (y <= clawEdge || y >= 159 - clawEdge))) return 1;
  if ((x < 108 && y >= 28 && y <= 128) || (x < 124 && y >= 54 && y <= 106)) return 2;
  return 0;
}

function cacheFacing(atlas, frame, left) {
  const whole = makeCanvas(), context = whole.getContext('2d');
  const bank = left ? 6 : 2;
  const headX = (frame * 8 + bank) * CELL, tailX = headX + CELL;
  context.drawImage(atlas, left ? headX : tailX, 0, CELL, CELL, 0, 0, CELL, CELL);
  context.drawImage(atlas, left ? tailX : headX, 0, CELL, CELL, CELL, 0, CELL, CELL);
  const pixels = context.getImageData(0, 0, WIDTH, HEIGHT);
  const body = makeCanvas(), claws = makeCanvas(), tail = makeCanvas();
  const canvases = [body, claws, tail];
  const contexts = canvases.map(canvas => canvas.getContext('2d'));
  const layers = contexts.map(context => context.createImageData(WIDTH, HEIGHT));
  const counts = [0, 0, 0];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    // Authored left sprites are exact 180-degree versions of the right bank.
    // This transforms only the load-time segmentation mask, never the sprite.
    const part = partAt(left ? WIDTH - 1 - x : x, left ? HEIGHT - 1 - y : y);
    const index = (y * WIDTH + x) * 4;
    layers[part].data[index] = pixels.data[index];
    layers[part].data[index + 1] = pixels.data[index + 1];
    layers[part].data[index + 2] = pixels.data[index + 2];
    layers[part].data[index + 3] = pixels.data[index + 3];
    if (pixels.data[index + 3]) counts[part]++;
  }
  for (let i = 0; i < layers.length; i++) contexts[i].putImageData(layers[i], 0, 0);
  return {whole, body, claws, tail, counts: Object.freeze(counts)};
}

function drawLayer(ctx, image, offset = 0) {
  ctx.drawImage(image, offset * SCALE, 0, WIDTH * SCALE, HEIGHT * SCALE);
}

function clippedLayer(ctx, image, offset, left, right) {
  if (right <= left) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left * SCALE, 0, (right - left) * SCALE, HEIGHT * SCALE);
  ctx.clip();
  drawLayer(ctx, image, offset);
  ctx.restore();
}

function attachment(ctx, image, sourcePivot, targetPivot, angle) {
  ctx.save();
  ctx.translate(targetPivot * SCALE, HEIGHT / 2 * SCALE);
  ctx.rotate(angle);
  ctx.drawImage(image, -sourcePivot * SCALE, -HEIGHT / 2 * SCALE,
    WIDTH * SCALE, HEIGHT * SCALE);
  ctx.restore();
}

function createRenderer(atlas) {
  const frames = [
    {right: cacheFacing(atlas, 0, false), left: cacheFacing(atlas, 0, true)},
    {right: cacheFacing(atlas, 1, false), left: cacheFacing(atlas, 1, true)}
  ];

  function draw(ctx, pose) {
    const progress = clamp01(pose.exchangeProgress ?? pose.turnProgress ?? (pose.facingSwap ? 1 : 0));
    if (!Number.isFinite(progress) || !Number.isFinite(pose.x) || !Number.isFinite(pose.y)) {
      throw new TypeError('Grounded exchange requires a finite position and progress.');
    }
    const frame = frames[pose.frame & 1];
    ctx.save();
    ctx.translate(pose.x - TILE, pose.y - TILE / 2);
    // Endpoint bypasses guarantee the exact complete native silhouettes and
    // original registration, without a final body-position or facing reset.
    if (progress <= 0 || progress >= 1) {
      drawLayer(ctx, progress <= 0 ? frame.right.whole : frame.left.whole);
      ctx.restore();
      return;
    }

    const exchange = ease(progress);
    const localAngle = (pose.reverse ? -1 : 1) * Math.PI * ease((progress - .25) / .5);
    const clawPivot = CLAW_PIVOT + (WIDTH - CLAW_PIVOT * 2) * exchange;
    const tailPivot = TAIL_PIVOT + (WIDTH - TAIL_PIVOT * 2) * exchange;

    // Component centers cross continuously on one ground-level axis. Each
    // attachment folds about its own joint while over the body; the complete
    // creature never rotates, lifts, shrinks, or clips through a hard portal.
    attachment(ctx, frame.right.tail, TAIL_PIVOT, tailPivot, localAngle);

    // A local shell wipe changes which original end is the face. The body is
    // neither spun nor flattened. Hard ownership avoids double translucent
    // legs during the direction change; both halves keep native scale.
    const shellProgress = ease((progress - .35) / .3);
    if (shellProgress <= 0) drawLayer(ctx, frame.right.body);
    else if (shellProgress >= 1) drawLayer(ctx, frame.left.body);
    else {
      // Reveal from the old face toward the old tail. At midpoint the two
      // rounded abdomen halves meet; the opposite sweep creates two faces.
      const boundary = WIDTH * (1 - shellProgress);
      clippedLayer(ctx, frame.left.body, 0, boundary - .5, WIDTH);
      clippedLayer(ctx, frame.right.body, 0, 0, boundary + .5);
    }
    attachment(ctx, frame.right.claws, CLAW_PIVOT, clawPivot, localAngle);
    ctx.restore();
  }

  return Object.freeze({draw, stats: Object.freeze({
    sourceWidth: atlas.naturalWidth, sourceHeight: atlas.naturalHeight,
    sourceCellSize: CELL, cachedCanvases: 16, startupPixelReads: 4,
    runtimeCanvasCreation: false, runtimePixelReads: false,
    maximumDrawCalls: 4, endpointDrawCalls: 1,
    endpointArtwork: 'original right and left directional banks',
    endpointRegistration: 'original two-cell seam',
    wholeSpriteRotation: false, verticalMotion: false,
    localAttachmentRotation: true, componentVisibilityClipping: false,
    clawSourcePivot: CLAW_PIVOT, tailSourcePivot: TAIL_PIVOT,
    componentPixelCounts: Object.freeze(frames.map(frame => Object.freeze({
      right: frame.right.counts, left: frame.left.counts
    })))
  })});
}

export async function loadExchangeArt() {
  if (!loading) loading = (async () => {
    const atlas = new Image();
    atlas.src = new URL('./assets/scorpion.png', import.meta.url).href;
    await atlas.decode();
    if (atlas.naturalWidth !== CELL * 16 || atlas.naturalHeight !== CELL) {
      throw new Error('Grounded exchange requires the original 2560 × 160 scorpion atlas.');
    }
    return createRenderer(atlas);
  })();
  return loading;
}
