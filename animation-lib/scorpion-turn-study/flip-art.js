import {TILE} from './motion.js';

// A deliberately isolated 2.5D flight study, not a new anatomical 3D model.
// The unmodified top artwork is a rigid face of a shallow extruded silhouette.
// Cached underside and edges keep it visible while that face turns edge-on.
export const FLIP_DEPTH = .07 * TILE;
export const HEIGHT_PROJECTION = .65;
const SOURCE = 160, SCALE = TILE / SOURCE, EDGE_STEP = 2;
let loading;

export function flipProjection(pose, out = {}) {
  const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
  const cy = Math.cos(pose.angle), sy = Math.sin(pose.angle);
  out.a = cp * cy;
  out.b = cp * sy + HEIGHT_PROJECTION * sp;
  out.c = -sy;
  out.d = cy;
  out.nx = sp * cy;
  out.ny = sp * sy - HEIGHT_PROJECTION * cp;
  out.x = pose.x;
  // Offset by the resting top-face height: endpoints match drawRigid exactly.
  out.y = pose.y - HEIGHT_PROJECTION * pose.lift + HEIGHT_PROJECTION * FLIP_DEPTH;
  out.determinant = out.a * out.d - out.b * out.c;
  return out;
}

function canvas(width, height) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  return c;
}

function cacheFrame(atlas, frame) {
  const top = canvas(320, 160), tc = top.getContext('2d');
  const sourceX = (frame * 8 + 2) * SOURCE;
  tc.drawImage(atlas, sourceX + SOURCE, 0, SOURCE, SOURCE, 0, 0, SOURCE, SOURCE);
  tc.drawImage(atlas, sourceX, 0, SOURCE, SOURCE, SOURCE, 0, SOURCE, SOURCE);
  const underside = canvas(320, 160), uc = underside.getContext('2d');
  uc.drawImage(top, 0, 0);
  uc.globalCompositeOperation = 'source-atop';
  uc.fillStyle = 'rgba(39,20,67,.62)'; uc.fillRect(0, 0, 320, 160);
  uc.globalCompositeOperation = 'source-over';
  // Extract a small contour grid once. No pixel reads or canvases while flying.
  const pixels = tc.getImageData(0, 0, 320, 160).data;
  const w = 320 / EDGE_STEP, h = 160 / EDGE_STEP, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    mask[y * w + x] = pixels[((y * EDGE_STEP + 1) * 320 + x * EDGE_STEP + 1) * 4 + 3] >= 96 ? 1 : 0;
  }
  const edges = [], occupied = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
  const edge = (x1, y1, x2, y2) => edges.push(
    (x1 * EDGE_STEP - 160) * SCALE, (y1 * EDGE_STEP - 80) * SCALE,
    (x2 * EDGE_STEP - 160) * SCALE, (y2 * EDGE_STEP - 80) * SCALE);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!occupied(x, y)) continue;
    if (!occupied(x, y - 1)) edge(x, y, x + 1, y);
    if (!occupied(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
    if (!occupied(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
    if (!occupied(x - 1, y)) edge(x, y + 1, x, y);
  }
  return {top, underside, edges: new Float64Array(edges)};
}

export async function loadFlipArt() {
  if (!loading) loading = (async () => {
    const atlas = new Image(); atlas.src = new URL('./assets/scorpion.png', import.meta.url).href;
    await atlas.decode();
    if (atlas.naturalWidth !== 2560 || atlas.naturalHeight !== 160) throw new Error('Unexpected scorpion atlas size');
    const frames = [cacheFrame(atlas, 0), cacheFrame(atlas, 1)], projection = {};

    function shadow(ctx, pose) {
      ctx.save(); ctx.translate(pose.x, pose.y + TILE * .08); ctx.rotate(pose.angle);
      const height = Math.min(1, pose.lift / (1.55 * TILE));
      const length = TILE * (.47 + .43 * Math.abs(Math.cos(pose.pitch)));
      for (let i = 3; i >= 0; i--) {
        ctx.beginPath(); ctx.ellipse(0, 0, length + i * 1.4, TILE * .24 + i * .9, 0, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(0,0,0,${(.1 - height * .045)})`; ctx.fill();
      }
      ctx.restore();
    }

    function draw(ctx, pose) {
      shadow(ctx, pose);
      const p = flipProjection(pose, projection), frame = frames[pose.frame & 1];
      const ox = p.nx * FLIP_DEPTH, oy = p.ny * FLIP_DEPTH, edges = frame.edges;
      ctx.save(); ctx.beginPath();
      for (let i = 0; i < edges.length; i += 4) {
        const x1 = p.x + p.a * edges[i] + p.c * edges[i + 1];
        const y1 = p.y + p.b * edges[i] + p.d * edges[i + 1];
        const x2 = p.x + p.a * edges[i + 2] + p.c * edges[i + 3];
        const y2 = p.y + p.b * edges[i + 2] + p.d * edges[i + 3];
        ctx.moveTo(x1 + ox, y1 + oy); ctx.lineTo(x2 + ox, y2 + oy);
        ctx.lineTo(x2 - ox, y2 - oy); ctx.lineTo(x1 - ox, y1 - oy); ctx.closePath();
      }
      ctx.fillStyle = '#5b2d91'; ctx.fill();
      if (Math.abs(p.determinant) > 1e-5) {
        const face = p.determinant > 0 ? 1 : -1;
        ctx.transform(p.a, p.b, p.c, p.d, p.x + face * ox, p.y + face * oy);
        ctx.drawImage(face > 0 ? frame.top : frame.underside, -TILE, -TILE / 2, TILE * 2, TILE);
      }
      ctx.restore();
    }
    return Object.freeze({draw, shadow, projection: flipProjection, stats: Object.freeze({
      cachedCanvases: 4, contourEdges: frames.map(f => f.edges.length / 4),
      runtimeCanvasCreation: false, rigidSourceArtwork: true, depthCells: .14,
      model: 'Stylized extruded sprite, not an anatomical 3D model'
    })});
  })();
  return loading;
}
