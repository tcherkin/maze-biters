// Palette transfer learned from corresponding pixels of the ORIGINAL game
// atlases. It is not a guessed hue rotation: gold/orange also lose saturation,
// and the authored cyan/white details have their own source-derived mapping.
// This module is preparation-only. No table or pixel read is used per frame.
const LEVELS = 32, LAST = LEVELS - 1, SIZE = LEVELS ** 3;
const keyOf = (r, g, b) => (r << 16) | (g << 8) | b;
const binOf = (r, g, b) => (Math.round(r * LAST / 255) * LEVELS + Math.round(g * LAST / 255)) * LEVELS + Math.round(b * LAST / 255);

export function createNativeSnakePalette(source, target) {
  if (source.length !== target.length || source.length % 4) throw new RangeError('Aligned native RGBA palettes required');
  const exact = new Map(), delta = new Float32Array(SIZE * 3), weight = new Uint32Array(SIZE);
  let samples = 0;
  for (let i = 0; i < source.length; i += 4) {
    // Semi-transparent edge RGB can be noisy after unpremultiplication. The
    // authored edge retains its own alpha and receives the opaque color map.
    if (source[i + 3] < 240 || target[i + 3] < 240) continue;
    const r = source[i], g = source[i + 1], b = source[i + 2], key = keyOf(r, g, b);
    let entry = exact.get(key);
    if (!entry) { entry = [0, 0, 0, 0]; exact.set(key, entry); }
    const bin = binOf(r, g, b), j = bin * 3;
    for (let c = 0; c < 3; c++) { entry[c] += target[i + c]; delta[j + c] += target[i + c] - source[i + c]; }
    entry[3]++; weight[bin]++; samples++;
  }
  if (!samples) throw new RangeError('Native palette contains no opaque source pixels');
  for (const entry of exact.values()) for (let c = 0; c < 3; c++) entry[c] /= entry[3];

  // Propagate occupied bins to unused colors, then trilinearly interpolate
  // color DELTAS. This keeps authored gradients continuous and their local
  // brightness/detail intact outside the original atlas's exact RGB values.
  const owner = new Int32Array(SIZE).fill(-1), queue = new Int32Array(SIZE);
  let read = 0, write = 0, occupied = 0;
  for (let i = 0; i < SIZE; i++) if (weight[i]) {
    owner[i] = i; queue[write++] = i; occupied++;
    for (let c = 0; c < 3; c++) delta[i * 3 + c] /= weight[i];
  }
  while (read < write) {
    const i = queue[read++], r = Math.floor(i / 1024), g = Math.floor(i / 32) % 32, b = i % 32;
    const neighbors = [r ? i - 1024 : -1, r < LAST ? i + 1024 : -1,
      g ? i - 32 : -1, g < LAST ? i + 32 : -1, b ? i - 1 : -1, b < LAST ? i + 1 : -1];
    for (const next of neighbors) if (next >= 0 && owner[next] < 0) { owner[next] = owner[i]; queue[write++] = next; }
  }
  for (let i = 0; i < SIZE; i++) if (!weight[i]) for (let c = 0; c < 3; c++) delta[i * 3 + c] = delta[owner[i] * 3 + c];

  return {
    stats: Object.freeze({samples, exactColors: exact.size, occupiedBins: occupied, grid: LEVELS,
      source: 'paired-original-atlas-RGB', alphaPreserved: true, neutralDetailsPreserved: true}),
    apply(data) {
      for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Teeth, sclera, dark mouth cavity and black outlines are details,
        // not skin. Preserve neutral pixels exactly, including antialiasing.
        if (Math.max(r, g, b) - Math.min(r, g, b) <= 8) continue;
        const match = exact.get(keyOf(r, g, b));
        if (match) { data[i] = match[0]; data[i + 1] = match[1]; data[i + 2] = match[2]; continue; }
        const rr = r * LAST / 255, gg = g * LAST / 255, bb = b * LAST / 255;
        const r0 = Math.floor(rr), g0 = Math.floor(gg), b0 = Math.floor(bb);
        const fr = rr - r0, fg = gg - g0, fb = bb - b0;
        let dr = 0, dg = 0, db = 0;
        for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
          const w = (x ? fr : 1 - fr) * (y ? fg : 1 - fg) * (z ? fb : 1 - fb);
          const j = ((Math.min(LAST, r0 + x) * LEVELS + Math.min(LAST, g0 + y)) * LEVELS + Math.min(LAST, b0 + z)) * 3;
          dr += delta[j] * w; dg += delta[j + 1] * w; db += delta[j + 2] * w;
        }
        data[i] = r + dr; data[i + 1] = g + dg; data[i + 2] = b + db;
      }
      return data;
    }
  };
}
