// Canonical 160px landmarks BEFORE the approved 1.125 horizontal fit.
// The frontal crest is asymmetric. A mirrored profile therefore needs its
// own front cage: reflecting a right/front cage samples the wrong crest.
export const FRONT_PAIRS = [
  // Actual tip and notch measured on the approved, fitted open artwork.
  [106.6667,15,106.6667,13], [97.7778,24,98.6667,22], [116,34,115,34],
  [66,25,62,25], [36,44,32,43], [22,65,20,65],
  [21,91,18,90], [24,119,20,119], [39,139,37,140],
  [70,150,68,150], [106,150,104,150], [125,139,133,138],
  [138,94,141,99], [132,78,135,83], [129,48,128,49],
  // The visible right-profile eye becomes the front-left eye.
  [99,49,43,54], [108,50,50,55], [121,57,59,61],
  [126,65,65,70], [122,72,60,79], [111,74,50,81],
  [101,70,39,77], [97,59,35,65],
  [115.6,58,53.3,65], [120,64,59.6,69], [119.1,72,56.9,77],
  [130,54,109,53], [133,64,123,65], [133,76,120,79],
  // Upper lip / corners / teeth / cavity / lower lip.
  [39,91,20,93], [66,79,25,83], [88,77,32,82],
  [112,81,75,85], [137,89,138,93],
  [80,105,39,105], [84,120,42,121], [100,130,77,132],
  [119,128,119,128], [127,108,126,109],
  [101,100,54,101], [113,101,66,101],
  [101,108,54,109], [113,109,66,110],
  [124,102,98,102], [129,104,108,103],
  [124,110,98,110], [129,111,108,111],
  [68,132,38,133], [88,141,76,142], [117,143,118,143],
];

export const FRONT_MIRRORED_PAIRS = FRONT_PAIRS.map((pair, index) => {
  const result=pair.slice();
  // The final shader reflects UV and screen X together. Its semantic target
  // tip/notch must consequently address the mirror of the actual front art.
  // Keep the enclosing skull's winding: reflecting every outline landmark
  // would reverse the curl's contour order and fold a planar mesh.
  if(index<2)result[2]=160-result[2];
  return result;
});
