// Source-only extraction of the accepted stronger-open.js jaw coordinate helpers.
// No raster generation, asset loading, sprite copies or mouth timing changes.
// Isolated amplitude study. The approved gentle rig and all of its art stay
// untouched; this variant still uses exactly one original open drawing.
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{const t=clamp(x);return t*t*t*(10+t*(-15+6*t));};
export const STRONGER_RIG=Object.freeze({
  fixedThroughY:111,translationFromY:135,rightLift:16,downLift:20,
  rearDrop:6,rampShoulder:.10,flattenFromClosure:.50,flattenAtClosure:.80,
  minimumJacobian:2/27,
});
function validate(direction,closure){
  if(!['right','down'].includes(direction)||!Number.isFinite(closure))throw new TypeError('Invalid stronger mouth pose');
}
function lateralWeight(x,direction){
  return direction==='right'?ease((x-24)/66):ease((x-16)/28)*ease((144-x)/28);
}
// Integral of a quintic smoothstep. The derivative gently reaches a plateau,
// rather than accumulating the old 1.875 centre slope when amplitude doubles.
const integral=v=>v*v*v*v*(2.5+v*(-3+v));
export function boundedJawRamp(value){
  const u=clamp(value),a=STRONGER_RIG.rampShoulder;
  if(u<a)return a*integral(u/a)/(1-a);
  if(u>1-a)return 1-a*integral((1-u)/a)/(1-a);
  return (u-a/2)/(1-a);
}
function jawRamp(value,closure){
  const mix=ease((closure-STRONGER_RIG.flattenFromClosure)/(STRONGER_RIG.flattenAtClosure-STRONGER_RIG.flattenFromClosure));
  const original=ease(value);
  return original+(boundedJawRamp(value)-original)*mix;
}
export function forwardJawY(x,y,direction,closure){
  validate(direction,closure);
  if(!Number.isFinite(x)||!Number.isFinite(y))throw new TypeError('Invalid jaw coordinates');
  const t=clamp(closure),lift=direction==='right'?STRONGER_RIG.rightLift:STRONGER_RIG.downLift;
  return y-lift*t*lateralWeight(x,direction)*jawRamp((y-111)/24,t);
}
