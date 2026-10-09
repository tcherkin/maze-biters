import {drawPlayerMouth} from '../snake-bite-study/player-mouth-art.js';

// Setup-only alpha-profile contact, using the very same bent renderer as the
// visible scene. No broad rectangle, guessed circular radius or straight-pose
// proxy for a U-shaped animal. Four samples/world pixel; no runtime readbacks.
export function createTurnContactProbe(bentArt, mouths, makeCanvas) {
  const scale = 4, w = 512, h = 144, halfHeight = 18, halfWidth = 64;
  const sc = makeCanvas(w, h), pc = makeCanvas(h, h);
  const s = sc.getContext('2d', {willReadFrequently: true});
  const p = pc.getContext('2d', {willReadFrequently: true});
  if (!s || !p) throw Error('Не може да се провери контактът при завоя.');
  const playerProfiles = new Map();
  let reads = 0, disposed = false;
  function profile(closure, size, bank) {
    const frame = Math.round(closure * 48), key = `${bank}:${size}:${frame}`;
    if (playerProfiles.has(key)) return playerProfiles.get(key);
    p.setTransform(1, 0, 0, 1, 0, 0); p.clearRect(0, 0, h, h);
    p.setTransform(scale, 0, 0, scale, halfHeight * scale, halfHeight * scale);
    drawPlayerMouth(p, mouths, bank, closure, size);
    const pixels = p.getImageData(0, 0, h, h).data, right = new Float64Array(h); right.fill(-Infinity);
    for (let y = 0; y < h; y++) for (let x = h - 1; x >= 0; x--) {
      if (pixels[(y * h + x) * 4 + 3] >= 32) { right[y] = (x + 1) / scale - halfHeight; break; }
    }
    playerProfiles.set(key, right); reads++;
    return right;
  }
  function measureContact({pose, closure, playerY, playerSize, playerBank}) {
    if (disposed) throw Error('Turn contact probe was already released');
    if (playerBank !== 0) throw Error('Dead-end study expects the original right-facing approach');
    const originX = pose.x - halfWidth, originY = playerY - halfHeight;
    s.setTransform(1, 0, 0, 1, 0, 0); s.clearRect(0, 0, w, h);
    s.setTransform(scale, 0, 0, scale, -originX * scale, -originY * scale);
    bentArt.draw(s, pose);
    const pixels = s.getImageData(0, 0, w, h).data, right = profile(closure, playerSize, playerBank);
    reads++;
    let playerX = Infinity, contactPoint = null;
    for (let y = 0; y < h; y++) {
      if (!Number.isFinite(right[y])) continue;
      for (let x = 0; x < w; x++) if (pixels[(y * w + x) * 4 + 3] >= 32) {
        const boundary = originX + x / scale, candidate = boundary - right[y];
        if (candidate < playerX) { playerX = candidate; contactPoint = {x: boundary, y: originY + (y + .5) / scale}; }
        break;
      }
    }
    if (!Number.isFinite(playerX)) throw Error('Няма видим контакт с извиващия се скорпион.');
    return {playerX, contactPoint, precision: 1 / scale};
  }
  return {
    measureContact,
    stats: () => ({reads, playerProfiles: playerProfiles.size, precision: 1 / scale}),
    dispose() { sc.width = sc.height = pc.width = pc.height = 1; playerProfiles.clear(); disposed = true; }
  };
}
