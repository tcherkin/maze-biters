// Turn-study only. Material boundary measured from the approved P1 RIGHT open
// atlas, first 160px frame, at the first opaque green pixel below the red cap.
// Atlas pixels already have the approved +12.5% horizontal fit. Convert their
// exact sample columns back to the canonical 160px rig used by BACK_CAP_SEAM.
import {BACK_CAP_SEAM,backCapSeam} from './back-geometry.js';

const sideNativeSamples=[
  [13,95.5],[18,97.5],[24,98.5],[29,97.5],[35,95.5],[41,92.5],
  [46,88.5],[52,84.5],[58,81.5],[63,78.5],[69,76.5],[74,74.5],
  [80,72.5],[86,72.5],[91,72.5],[97,71.5],[103,72.5],[108,72.5],
  [114,73.5],[119,73.5],[125,74.5],[131,74.5],[136,74.5],
  [142,77.5],[148,86.5],
];
export const SIDE_CAP_SEAM=Object.freeze(sideNativeSamples.map(([x,y])=>Object.freeze([80+(x-80)/1.125,y])));

function interpolate(points,x){
  if(x<=points[0][0])return points[0][1];
  for(let i=1;i<points.length;i++)if(x<=points[i][0]){
    const [a,ay]=points[i-1],[b,by]=points[i];
    return ay+(by-ay)*(x-a)/(b-a);
  }
  return points.at(-1)[1];
}
export function sideSurfaceSeam(rawX){
  if(!Number.isFinite(rawX))throw new TypeError('Invalid side seam coordinate');
  return interpolate(SIDE_CAP_SEAM,rawX);
}
export function rearSurfaceSeam(rawX,closure=0,mirror=false){
  if(![rawX,closure].every(Number.isFinite)||typeof mirror!=='boolean')throw new TypeError('Invalid rear seam coordinate');
  return backCapSeam(mirror?160-rawX:rawX)+6*(1-Math.max(0,Math.min(1,closure)));
}

const number=n=>Number(n).toFixed(8);
function shaderCurve(name,points){
  let source=`float ${name}(float x){\n  if(x<=${number(points[0][0])})return ${number(points[0][1])};\n`;
  for(let i=1;i<points.length;i++){
    const [a,ay]=points[i-1],[b,by]=points[i];
    source+=`  if(x<=${number(b)})return mix(${number(ay)},${number(by)},(x-${number(a)})/${number(b-a)});\n`;
  }
  return source+`  return ${number(points.at(-1)[1])};\n}\n`;
}

// Inputs/outputs are normalized, horizontally FITTED canonical UVs, before
// mirroring to actual texture coordinates. Call only on the rear transition.
// This aligns the paint boundary, not silhouette UVs. A smooth 6..12px local
// band avoids shifting the eye, teeth or broad cap highlights. The contributing
// source is exactly unchanged at both turn endpoints. Rear cap opening drops
// 6px; the side-view cap itself is fixed by the approved mouth animation.
export const capSeamGLSL=`
${shaderCurve('sideCapSeamRaw',SIDE_CAP_SEAM)}
${shaderCurve('rearCapSeamRaw',BACK_CAP_SEAM)}
vec4 alignedRearCapUV(vec2 a,vec2 b,float t,float closure,float mirror){
  float ax=80.0+(a.x*160.0-80.0)/1.125;
  float bx=80.0+(b.x*160.0-80.0)/1.125;
  bx=mix(bx,160.0-bx,mirror);
  float sa=sideCapSeamRaw(ax);
  float sb=rearCapSeamRaw(bx)+6.0*(1.0-clamp(closure,0.0,1.0));
  float da=a.y*160.0-sa;
  float db=b.y*160.0-sb;
  float common=mix(da,db,t);
  float local=1.0-smoothstep(6.0,12.0,max(abs(da),abs(db)));
  a.y=mix(a.y,(sa+common)/160.0,local);
  b.y=mix(b.y,(sb+common)/160.0,local);
  return vec4(a,b);
}
`;
