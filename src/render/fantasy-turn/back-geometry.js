// Right profile -> rear view. Both columns use the UNFITTED 160px master
// coordinate space. Rear coordinates describe the undeformed master (closed
// mouth), not the open atlas frame whose red cap is already 6px lower.
const commonPairs = [
  [66,25,65,35], [36,44,31,44], [22,65,19,66],
  [21,91,18,90], [24,119,20,119], [39,139,38,139],
  [70,150,70,150], [106,150,106,150], [125,139,133,138],
  [138,94,143,96], [132,78,142,79], [129,48,131,49],
  [98,48,121,49], [113,48,126,51], [123,57,133,59],
  [125,69,138,71], [111,74,133,77], [97,65,126,69],
  [61,51,71,52], [71,65,90,68], [61,76,76,81],
  // The cap/lower-body seam is a shared visible contour, not a smear between
  // unmatched red and green pixels. Positions follow the actual master seam.
  [39,91,42,94.4], [66,79,86,103.5], [88,77,115,96.5],
  [112,81,134,87.1], [137,89,140,90],
  [80,105,119,116], [84,120,123,128], [100,130,131,136],
  [119,128,137,127], [127,108,140,109],
  [101,100,134,105], [113,101,136,106],
  [101,108,134,113], [113,109,136,114],
  [124,102,138,104], [129,104,140,105],
  [124,110,138,112], [129,111,140,113],
  [68,132,102,140], [88,141,119,145], [117,143,132,143],
];

// In a side->rear turn the crest changes handedness. Dense literal matching
// of that reflected hook would reverse contour order and fold the texture.
// Retain a certified sparse crown envelope for this handedness-changing view;
// the surface compositor owns the disappearing and emerging hook paint.
const crestRightBack = [
  [106,14,54,12], [98,26,63,24], [116,34,110,28],
  [40,32,36,36], [50,24,43,31], [120,36,120,34],
];

// The LEFT source is normalized to a right-facing cage by the renderer. Its
// up-texture UVs are also mirrored, but the UP art itself is asymmetric!
// This separate target traces that mirrored artwork; it must not reuse the
// right->up target whose crest points to the other side.
const crestLeftBack = [
  [106,14,106,12],
  [40,32,40,34], [55,21,55,24], [70,15,70,14], [90,11,90,9],
  [103,13,103,10.5], [103,17,102,17], [99,21,98,22], [98,26,97,24],
  [102,29,107,27], [111,31,113,30], [116,34,116,31.5], [120,36,120,33],
];

export const BACK_PAIRS = [...crestRightBack,...commonPairs];
export const BACK_MIRRORED_PAIRS = [...crestLeftBack,...commonPairs.map(p=>p.slice())];

// Measured using the SAME 320px P1 master/backBoundary preparation as the
// approved atlas builder, then expressed in canonical 160px coordinates.
// Reused for all palettes exactly as the approved mouth rig does.
export const BACK_CAP_SEAM = Object.freeze([
  [15,112],[20,90],[25,87],[30,88],[35,89.5],[40,93],[45,96.5],
  [50,99.5],[55,101.5],[60,102.5],[65,103],[70,103.5],[75,103.5],
  [80,103.5],[85,103.5],[90,103.5],[95,103],[100,102.5],[105,101],
  [110,99.5],[115,96.5],[120,93],[125,89.5],[130,87.5],[135,87],
  [140,92],[145,112],
]);

export function backCapSeam(x) {
  if(!Number.isFinite(x))throw new TypeError('Invalid rear-cap coordinate');
  if(x<=15||x>=145)return 112;
  const index=Math.min(BACK_CAP_SEAM.length-2,Math.floor((x-15)/5));
  const [a,ay]=BACK_CAP_SEAM[index],[b,by]=BACK_CAP_SEAM[index+1];
  return ay+(by-ay)*(x-a)/(b-a);
}

export function forwardBackCapY(x,y,closure,mirror=false) {
  if(![x,y,closure].every(Number.isFinite))throw new TypeError('Invalid rear-cap pose');
  if(x===0||x===160||y===0||y===160)return y;
  return y<=backCapSeam(mirror?160-x:x)+1e-7 ? y+6*(1-Math.max(0,Math.min(1,closure))) : y;
}
