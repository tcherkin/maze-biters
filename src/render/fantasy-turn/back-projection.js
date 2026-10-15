// Projection study only. Compress visible facial features toward the rim as
// the head turns away, while the outer skull and crest keep their established
// trajectories. Lips follow at half the feature acceleration so the rim stays
// attached to the jaw throughout every mouth pose. No timing/asset changes.
import {CAGES,cageVertices} from './geometry.js';
import {forwardBackCapY} from './back-geometry.js';
import {createPairedMesh} from './paired-mesh.js';

export const BACK_PROJECTION = Object.freeze({
  controlScale:.25, rimControlScale:.125, referenceSize:160, maximumEntries:98,
  equation:'mix(a,b,t) + 4*t*(1-t)*controlDelta',
});

// Keys are side-view feature landmarks. The rear image has no face, so its
// corresponding texture coordinates can occupy a narrow, ordered skin strip.
// They remain real rear pixels, never fabricated feature colors.
const targets=new Map([
  ['98,48',[129,49]],['113,48',[130,49]],['123,57',[134,59]],
  ['125,69',[138,71]],['111,74',[137,77]],['97,65',[134,69]],
  ['80,105',[136,116]],['84,120',[133,128]],['100,130',[131,136]],
  ['119,128',[137,127]],['127,108',[140,109]],
  ['101,100',[138,105]],['113,101',[139,106]],
  ['101,108',[137,113]],['113,109',[138,114]],
  ['124,102',[140,104]],['129,104',[141,105]],
  ['124,110',[139,112]],['129,111',[140,113]],
  // Lip silhouette travels with the disappearing cavity. Old UV targets lay
  // below/outside the rear jaw and left a detached green hook after occlusion.
  ['138,94',[140,96]],['137,89',[139,91]],['112,81',[134,87.1]],
  ['125,139',[129,139]],['117,143',[124,143]],['88,141',[116,145]],
]);
const rimPoints=new Set(['138,94','137,89','112,81','125,139','117,143','88,141']);
const cache=new Map();
const fit=x=>(80+(x-80)*1.125)/160;

function choose(n,k){let v=1;for(let i=1;i<=k;i++)v=v*(n-i+1)/i;return v;}
function bernstein(coefficients){
  const n=coefficients.length-1;
  return coefficients.map((_,k)=>coefficients.slice(0,k+1).reduce((v,c,i)=>v+c*choose(k,i)/choose(n,i),0));
}
function split(values){
  const left=[values[0]],right=[values.at(-1)];let row=values;
  while(row.length>1){row=row.slice(1).map((v,i)=>(v+row[i])*.5);left.push(row[0]);right.push(row.at(-1));}
  return [left,right.reverse()];
}
function certify(values,depth=0){
  const lower=Math.min(...values),upper=Math.max(...values);
  if(lower>1e-10)return {passed:true,lower};
  if(upper<=1e-10||depth>=16)return {passed:false,lower};
  const halves=split(values).map(v=>certify(v,depth+1));
  return {passed:halves.every(v=>v.passed),lower:Math.min(...halves.map(v=>v.lower))};
}
function pointCoefficients(a,b,d){return [a,a.map((v,k)=>b[k]-v+4*d[k]),d.map(v=>-4*v)];}
export function projectedTriangleBound(a,b,controlDelta,triangle){
  const points=triangle.map(i=>pointCoefficients(a[i],b[i],controlDelta[i]));
  const edges=[1,2].map(k=>points[k].map((p,j)=>p.map((v,axis)=>v-points[0][j][axis])));
  const coefficients=Array(5).fill(0);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)coefficients[i+j]+=edges[0][i][0]*edges[1][j][1]-edges[0][i][1]*edges[1][j][0];
  return {...certify(bernstein(coefficients)),coefficients};
}

export function createProjectedBackCage(closure=0,mirror=false){
  if(!Number.isFinite(closure)||typeof mirror!=='boolean')throw Error('Invalid rear projection');
  const frame=Math.round(Math.max(0,Math.min(1,closure))*48),key=`${mirror}:${frame}`;
  if(cache.has(key))return cache.get(key);
  const base=cageVertices('back',frame/48,mirror),raw=CAGES[mirror?'backMirrored':'back'];
  const a=base.a.map(p=>p.slice()),b=base.b.map(p=>p.slice());
  const feature=[],controlScale=[];
  for(let i=0;i<a.length;i++){
    const name=raw.open[i].join(','),next=targets.get(name);feature[i]=!!next;
    controlScale[i]=next?(rimPoints.has(name)?BACK_PROJECTION.rimControlScale:BACK_PROJECTION.controlScale):0;
    if(next)b[i]=[fit(next[0]),forwardBackCapY(next[0],next[1],frame/48,mirror)/160];
  }
  const mesh=createPairedMesh(a.map((p,i)=>[...p,...b[i]]));
  const controlDelta=a.map((p,i)=>p.map((v,axis)=>controlScale[i]?(b[i][axis]-v)*controlScale[i]:0));
  let minimum=Infinity;
  for(const triangle of mesh.triangles){
    const bound=projectedTriangleBound(a,b,controlDelta,triangle);
    if(!bound.passed)throw Object.assign(Error(`Rear projection folds: ${key}, triangle ${triangle}`),{details:bound});
    minimum=Math.min(minimum,bound.lower);
  }
  const result={a,b,controlDelta,controlScale,triangles:mesh.triangles,minimum,feature,frame,mirror};
  cache.set(key,result);return result;
}

export function projectedBackPositions(cage,t){
  if(!Number.isFinite(t))throw Error('Invalid projection phase');
  t=Math.max(0,Math.min(1,t));
  return cage.a.map((p,i)=>p.map((v,k)=>v+(cage.b[i][k]-v)*t+4*t*(1-t)*cage.controlDelta[i][k]));
}
export function backProjectionDiagnostics(){return {entries:cache.size,maximumEntries:98,...BACK_PROJECTION};}
