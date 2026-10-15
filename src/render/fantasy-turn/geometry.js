// An isolated, projection-aware sprite cage. Coordinates refer to the original
// 160px open artwork, before the approved centered 1.125 horizontal fit.
// Shared GPU triangles avoid antialiased Canvas clip seams between pieces.
import {createPairedMesh} from './paired-mesh.js';
import {forwardJawY} from './jaw-rig.js';
import {BACK_PAIRS,BACK_MIRRORED_PAIRS,forwardBackCapY} from './back-geometry.js';
import {FRONT_PAIRS,FRONT_MIRRORED_PAIRS} from './front-geometry.js';

const border = [];
for (let x = 0; x <= 160; x += 20) border.push([x, 0, x, 0]);
for (let y = 20; y <= 160; y += 20) border.push([160, y, 160, y]);
for (let x = 140; x >= 0; x -= 20) border.push([x, 160, x, 160]);
for (let y = 140; y > 0; y -= 20) border.push([0, y, 0, y]);

const front = FRONT_PAIRS;
// The side face travels to the rim, where it is occluded by the back of the
// skull. It is never rotated flat onto the screen or flipped upside down.
const back = BACK_PAIRS;

export const CAGES = Object.freeze({
  front: createPairedMesh([...border, ...front]),
  back: createPairedMesh([...border, ...back]),
  frontMirrored: createPairedMesh([...border, ...FRONT_MIRRORED_PAIRS]),
  backMirrored: createPairedMesh([...border, ...BACK_MIRRORED_PAIRS]),
});
const fitX = x => (80 + (x - 80) * 1.125) / 160;
const posedCages=new Map();
export function cageVertices(kind, closure = 0, mirror = false) {
  if (!['front','back'].includes(kind) || !Number.isFinite(closure) || typeof mirror!=='boolean') throw Error('Invalid turn cage');
  const cageKind=kind+(mirror?'Mirrored':'');
  const frame=Math.round(Math.max(0,Math.min(1,closure))*48),key=`${cageKind}:${frame}`;
  if(posedCages.has(key))return posedCages.get(key);
  const cage = CAGES[cageKind], c = frame/48;
  const row = (points, direction) => points.map(([x,y]) => [
    // Keep the transparent enclosing boundary on the canvas boundary.
    x === 0 || x === 160 ? x/160 : fitX(x),
    (x===0 || x===160 || y===0 || y===160 ? y : direction === 'up' ? forwardBackCapY(x,y,c,mirror) : forwardJawY(x,y,direction,c)) / 160,
  ]);
  const a=row(cage.open,'right'),b=row(cage.closed,kind==='front'?'down':'up');
  // A monotone jaw deformation does not guarantee that the OLD straight-edge
  // triangulation remains nonfolding. Certify a shared topology for each of
  // the 49 actual mouth poses; cache it, never silently keep an invalid cage.
  const mesh=createPairedMesh(a.map((p,i)=>[...p,...b[i]]));
  const result={a,b,triangles:mesh.triangles,minimum:mesh.minimum};
  posedCages.set(key,result);return result;
}

// Canonical side→front/back, reflected only in coordinates for left-facing
// transitions. Both sources still use their actual unmodified cardinal art.
export function canonicalPair(from, to, mix) {
  if (!Number.isFinite(mix)) throw Error('Invalid turn phase');
  const side = [from,to].find(d=>d==='right'||d==='left');
  const end = [from,to].find(d=>d==='down'||d==='up');
  if (!side || !end || from===to) throw Error('Turn requires adjacent directions');
  return {side,end,kind:end==='down'?'front':'back',mirror:side==='left',t:from===side?mix:1-mix};
}
