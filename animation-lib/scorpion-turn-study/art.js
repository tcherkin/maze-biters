import {TILE, WAIST, travelPoint} from './motion.js';

const SOURCE = 160;
const SCALE = TILE / SOURCE;
const STRIPS = 16;
const FRONT_ANCHOR = 32, REAR_ANCHOR = 128;
const BODY_TOP = 44, BODY_HEIGHT = 72;
const WAIST_SOURCE = FRONT_ANCHOR * 2;
const GUARD = 2;
const CLIP_OVERLAP = .16;
const CLIP_MITER_LIMIT = .6;
let loading;

// The shell silhouette at the original two-cell join. Its narrow front
// notch is intentional: rectangular extraction also picks up nearby legs.
const SHELL_TOP = [
  124, 52, 128, 50, 132, 47, 136, 46, 140, 44, 144, 44,
  148, 44, 152, 44, 156, 45, 160, 46, 164, 49, 168, 51,
  172, 56, 176, 52, 180, 49, 184, 47, 188, 47, 192, 46, 196, 45
];

function shellTop(x) {
  if (x <= SHELL_TOP[0]) return SHELL_TOP[1];
  for (let i = 2; i < SHELL_TOP.length; i += 2) {
    if (x <= SHELL_TOP[i]) {
      const t = (x - SHELL_TOP[i - 2]) / (SHELL_TOP[i] - SHELL_TOP[i - 2]);
      return SHELL_TOP[i - 1] + t * (SHELL_TOP[i + 1] - SHELL_TOP[i - 1]);
    }
  }
  return SHELL_TOP[SHELL_TOP.length - 1];
}

function cacheLegs(headContext, tailContext) {
  const width = SOURCE * 2, pixels = new Uint8ClampedArray(width * SOURCE * 4);
  const headPixels = headContext.getImageData(0, 0, SOURCE, SOURCE).data;
  const tailPixels = tailContext.getImageData(0, 0, SOURCE, SOURCE).data;
  for (let y = 0; y < SOURCE; y++) {
    pixels.set(tailPixels.subarray(y * SOURCE * 4, (y + 1) * SOURCE * 4), y * width * 4);
    pixels.set(headPixels.subarray(y * SOURCE * 4, (y + 1) * SOURCE * 4), (y * width + SOURCE) * 4);
  }
  const seen = new Uint8Array(width * SOURCE), queue = new Int32Array(width * SOURCE);
  const legs = [];
  for (let side = 0; side < 2; side++) {
    const firstY = side ? 116 : 0, lastY = side ? 159 : 43;
    for (let y = firstY; y <= lastY; y++) for (let x = 100; x < 226; x++) {
      const seed = y * width + x;
      if (seen[seed] || pixels[seed * 4 + 3] < 32) continue;
      let read = 0, count = 1, minX = x, maxX = x, minY = y, maxY = y;
      queue[0] = seed;
      seen[seed] = 1;
      while (read < count) {
        const index = queue[read++], py = Math.floor(index / width), px = index % width;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy, next = ny * width + nx;
          if (nx < 100 || nx >= 226 || ny < firstY || ny > lastY ||
            seen[next] || pixels[next * 4 + 3] < 32) continue;
          seen[next] = 1;
          queue[count++] = next;
        }
      }
      if (count < 24) continue;
      let rootTotal = 0, rootCount = 0;
      for (let i = 0; i < count; i++) {
        const py = Math.floor(queue[i] / width);
        if (side ? py <= minY + 2 : py >= maxY - 2) {
          rootTotal += queue[i] % width; rootCount++;
        }
      }
      const anchor = rootTotal / rootCount;
      minX = Math.max(100, minX - 2); maxX = Math.min(225, maxX + 2);
      minY = side ? Math.max(0, Math.floor(159 - shellTop(anchor)) - 4) : Math.max(0, minY - 2);
      maxY = side ? Math.min(159, maxY + 2) : Math.min(159, Math.ceil(shellTop(anchor)) + 4);
      const leg = canvas(maxX - minX + 1, maxY - minY + 1);
      const legContext = leg.getContext('2d');
      const data = legContext.createImageData(leg.width, leg.height);
      for (let row = 0; row < leg.height; row++) {
        const start = ((minY + row) * width + minX) * 4;
        data.data.set(pixels.subarray(start, start + leg.width * 4), row * leg.width * 4);
      }
      legContext.putImageData(data, 0, 0);
      // Remove the complete limb, including a small root guard that is drawn
      // under the shell again. Its image never changes shape while turning.
      tailContext.clearRect(minX, minY, leg.width, leg.height);
      headContext.clearRect(minX - SOURCE, minY, leg.width, leg.height);
      legs.push({image: leg, anchor, x: minX, y: minY});
    }
  }
  return legs;
}

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}

function cachePose(atlas, frame) {
  const headX = (frame * 8 + 2) * SOURCE;
  const tailX = (frame * 8 + 3) * SOURCE;
  const head = canvas(SOURCE, SOURCE), tail = canvas(SOURCE, SOURCE);
  const headContext = head.getContext('2d'), tailContext = tail.getContext('2d');
  headContext.drawImage(atlas, headX, 0, SOURCE, SOURCE, 0, 0, SOURCE, SOURCE);
  tailContext.drawImage(atlas, tailX, 0, SOURCE, SOURCE, 0, 0, SOURCE, SOURCE);
  const legs = cacheLegs(headContext, tailContext);
  headContext.clearRect(0, 0, FRONT_ANCHOR, SOURCE);
  tailContext.clearRect(REAR_ANCHOR, 0, SOURCE - REAR_ANCHOR, SOURCE);

  // Two source-pixel guards permit tiny clip overlap at the rigid joins.
  // The material coordinates still cover exactly the central 64 pixels.
  const torso = canvas(WAIST_SOURCE + GUARD * 2, BODY_HEIGHT);
  const torsoContext = torso.getContext('2d');
  torsoContext.drawImage(atlas, tailX + REAR_ANCHOR - GUARD, BODY_TOP,
    FRONT_ANCHOR + GUARD, BODY_HEIGHT, 0, 0, FRONT_ANCHOR + GUARD, BODY_HEIGHT);
  torsoContext.drawImage(atlas, headX, BODY_TOP,
    FRONT_ANCHOR + GUARD, BODY_HEIGHT, FRONT_ANCHOR + GUARD, 0,
    FRONT_ANCHOR + GUARD, BODY_HEIGHT);
  const torsoPixels = torsoContext.getImageData(0, 0, torso.width, torso.height);
  for (let x = 0; x < torso.width; x++) {
    const top = shellTop(REAR_ANCHOR - GUARD + x), bottom = 159 - top;
    for (let y = 0; y < torso.height; y++) {
      const sourceY = BODY_TOP + y;
      if (sourceY < top || sourceY > bottom) torsoPixels.data[(y * torso.width + x) * 4 + 3] = 0;
    }
  }
  torsoContext.putImageData(torsoPixels, 0, 0);
  return {head, tail, torso, legs};
}

function rigid(ctx, image, point, anchor) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.angle);
  ctx.drawImage(image, -anchor * SCALE, -TILE / 2, TILE, TILE);
  ctx.restore();
}

// Reused scalar scratch keeps triangle clipping allocation-free. Every quad
// has positive orientation because its inner torso edge cannot fold over.
function expandVertex(out, index, x, y, previousX, previousY, nextX, nextY) {
  const dx = x - previousX, dy = y - previousY;
  const ex = nextX - x, ey = nextY - y;
  const inverseLength = 1 / Math.hypot(dx, dy);
  const inverseNextLength = 1 / Math.hypot(ex, ey);
  const nx = dy * inverseLength, ny = -dx * inverseLength;
  const px = ey * inverseNextLength, py = -ex * inverseNextLength;
  let expansion = CLIP_OVERLAP / Math.max(1e-8, 1 + nx * px + ny * py);
  // Thin triangles have acute corners. An unlimited miter can reach several
  // world pixels past its strip and sample an unrelated part of the shell.
  const length = Math.hypot(nx + px, ny + py) * expansion;
  if (length > CLIP_MITER_LIMIT) expansion *= CLIP_MITER_LIMIT / length;
  out[index] = x + (nx + px) * expansion;
  out[index + 1] = y + (ny + py) * expansion;
}

function triangle(ctx, texture, scratch,
  ax, ay, bx, by, cx, cy, a, b, c, d, e, f) {
  expandVertex(scratch, 0, ax, ay, cx, cy, bx, by);
  expandVertex(scratch, 2, bx, by, ax, ay, cx, cy);
  expandVertex(scratch, 4, cx, cy, bx, by, ax, ay);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(scratch[0], scratch[1]);
  ctx.lineTo(scratch[2], scratch[3]);
  ctx.lineTo(scratch[4], scratch[5]);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(texture, 0, 0);
  ctx.restore();
}

function renderer(atlas) {
  const frames = [cachePose(atlas, 0), cachePose(atlas, 1)];
  const samples = Array.from({length: STRIPS + 1}, () => ({}));
  const edges = new Float64Array((STRIPS + 1) * 4);
  const triangleScratch = new Float64Array(8);
  const legPoint = {};
  const halfWidth = BODY_HEIGHT * SCALE / 2;
  const sourceStep = WAIST_SOURCE / STRIPS;

  function drawSmooth(ctx, distance, reverse = false, frame = 0, layerMode = 'all') {
    const art = frames[frame & 1], direction = reverse ? -1 : 1;
    for (let i = 0; i <= STRIPS; i++) {
      const point = travelPoint(distance + direction * WAIST * (i / STRIPS - .5),
        reverse, samples[i]);
      const nx = -point.ty * halfWidth, ny = point.tx * halfWidth;
      const offset = i * 4;
      edges[offset] = point.x - nx;
      edges[offset + 1] = point.y - ny;
      edges[offset + 2] = point.x + nx;
      edges[offset + 3] = point.y + ny;
    }
    if (layerMode !== 'torso') {
      for (let i = 0; i < art.legs.length; i++) {
        const leg = art.legs[i];
        if (leg.anchor < REAR_ANCHOR || leg.anchor > SOURCE + FRONT_ANCHOR) {
          const point = leg.anchor < REAR_ANCHOR ? samples[0] : samples[STRIPS];
          const anchor = leg.anchor < REAR_ANCHOR ? REAR_ANCHOR : SOURCE + FRONT_ANCHOR;
          const offset = (leg.anchor - anchor) * SCALE;
          legPoint.x = point.x + offset * point.tx;
          legPoint.y = point.y + offset * point.ty;
          legPoint.angle = point.angle;
        } else {
          travelPoint(distance + direction * (leg.anchor - SOURCE) * SCALE, reverse, legPoint);
        }
        ctx.save();
        ctx.translate(legPoint.x, legPoint.y);
        ctx.rotate(legPoint.angle);
        ctx.drawImage(leg.image, (leg.x - leg.anchor) * SCALE, (leg.y - SOURCE / 2) * SCALE,
          leg.image.width * SCALE, leg.image.height * SCALE);
        ctx.restore();
      }
      rigid(ctx, art.tail, samples[0], REAR_ANCHOR);
      rigid(ctx, art.head, samples[STRIPS], FRONT_ANCHOR);
    }
    if (layerMode === 'rigid') return;

    // Piecewise-affine textured quads curve only the short armored torso.
    // Drawing it last covers the original leg roots at the attachment band.
    // Clip the complete ribbon once. Individual quad clips would antialias
    // every shared boundary and recreate visible dark strip seams.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(edges[0], edges[1]);
    for (let i = 1; i <= STRIPS; i++) ctx.lineTo(edges[i * 4], edges[i * 4 + 1]);
    for (let i = STRIPS; i >= 0; i--) ctx.lineTo(edges[i * 4 + 2], edges[i * 4 + 3]);
    ctx.closePath();
    ctx.clip();
    for (let i = 0; i < STRIPS; i++) {
      const offset = i * 4, next = offset + 4;
      const ax = edges[offset], ay = edges[offset + 1];
      const dx = edges[offset + 2], dy = edges[offset + 3];
      const bx = edges[next], by = edges[next + 1];
      const cx = edges[next + 2], cy = edges[next + 3];
      const sourceX = GUARD + i * sourceStep;
      const a1 = (bx - ax) / sourceStep, b1 = (by - ay) / sourceStep;
      const c1 = (cx - bx) / BODY_HEIGHT, d1 = (cy - by) / BODY_HEIGHT;
      triangle(ctx, art.torso, triangleScratch, ax, ay, bx, by, cx, cy,
        a1, b1, c1, d1, ax - a1 * sourceX, ay - b1 * sourceX);
      const a2 = (cx - dx) / sourceStep, b2 = (cy - dy) / sourceStep;
      const c2 = (dx - ax) / BODY_HEIGHT, d2 = (dy - ay) / BODY_HEIGHT;
      triangle(ctx, art.torso, triangleScratch, ax, ay, cx, cy, dx, dy,
        a2, b2, c2, d2, ax - a2 * sourceX, ay - b2 * sourceX);
    }
    ctx.restore();
  }

  function drawNative(ctx, pose) {
    const bank = ((Math.round(pose.angle / (Math.PI / 2)) + 1) % 4 + 4) % 4;
    const sourceX = ((pose.frame & 1) * 8 + bank * 2) * SOURCE;
    ctx.drawImage(atlas, sourceX + SOURCE, 0, SOURCE, SOURCE,
      pose.tail.x - TILE / 2, pose.tail.y - TILE / 2, TILE, TILE);
    ctx.drawImage(atlas, sourceX, 0, SOURCE, SOURCE,
      pose.head.x - TILE / 2, pose.head.y - TILE / 2, TILE, TILE);
  }

  function drawRigid(ctx, pose) {
    // A dead-end turnaround rotates the complete original two-cell artwork.
    // Both cells share one transform, so proportions and their join stay exact.
    const sourceX = ((pose.frame & 1) * 8 + 2) * SOURCE;
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);
    ctx.drawImage(atlas, sourceX + SOURCE, 0, SOURCE, SOURCE,
      -TILE, -TILE / 2, TILE, TILE);
    ctx.drawImage(atlas, sourceX, 0, SOURCE, SOURCE,
      0, -TILE / 2, TILE, TILE);
    ctx.restore();
  }

  return Object.freeze({drawSmooth, drawNative, drawRigid, stats: Object.freeze({
    sourceWidth: atlas.naturalWidth, sourceHeight: atlas.naturalHeight,
    sourceCellSize: SOURCE, frames: 2, directionBanks: 4,
    cachedCanvases: 6 + frames[0].legs.length + frames[1].legs.length,
    legsPerFrame: Object.freeze([frames[0].legs.length, frames[1].legs.length]),
    strips: STRIPS, triangles: STRIPS * 2,
    routeSamples: STRIPS + 1, smoothDrawCalls: STRIPS * 2 + 2 + Math.max(frames[0].legs.length, frames[1].legs.length),
    nativeDrawCalls: 2, waistCells: .4, rigidCellsPerEnd: .8,
    rigidLegs: true, runtimeCanvasCreation: false
  })});
}

export async function loadScorpionArt() {
  if (!loading) loading = (async () => {
    const atlas = new Image();
    atlas.src = new URL('./assets/scorpion.png', import.meta.url).href;
    await atlas.decode();
    if (atlas.naturalWidth !== SOURCE * 16 || atlas.naturalHeight !== SOURCE) {
      throw new Error('Scorpion study requires the original 2560 × 160 atlas.');
    }
    return renderer(atlas);
  })();
  return loading;
}
