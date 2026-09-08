import assert from 'node:assert/strict';
import {groundBeamVisibility,rayBoxDistance} from '../flashlight-mask.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} should equal ${b}`);
const dimensions={length:10.2,width:3.1,offset:4.8},reach=9.9;
const wall={minX:-2,maxX:2,minZ:3,maxZ:4};
close(rayBoxDistance(0,0,0,1,wall),3);
assert.equal(rayBoxDistance(3,0,0,1,wall),Infinity,'A parallel ray outside the wall must remain open');
assert.equal(rayBoxDistance(0,0,0,-1,wall),Infinity,'Walls behind the emitter must not block its forward beam');
assert.equal(rayBoxDistance(0,0,0,1,wall,2),Infinity,'A wall beyond the beam endpoint must not shorten it');
close(rayBoxDistance(0,3.5,1,0,wall),0);

const clear=groundBeamVisibility(0,0,0,dimensions);
close(Math.max(...clear.map(p=>p.along)),reach);
close(Math.max(...clear.map(p=>p.across)),dimensions.width/2);
close(Math.min(...clear.map(p=>p.across)),-dimensions.width/2);
const blocked=groundBeamVisibility(0,0,0,dimensions,[wall]);
assert.ok(blocked.every(p=>p.along<3),'A spanning wall must prevent the stamp reappearing on floor beyond it');

// The same arrangement rotated toward screen-right must clip at the same
// distance, without reversing left and right in beam-local coordinates.
const turnedWall={minX:3,maxX:4,minZ:-2,maxZ:2};
const turned=groundBeamVisibility(0,0,Math.PI/2,dimensions,[turnedWall]);
close(Math.max(...turned.map(p=>p.along)),Math.max(...blocked.map(p=>p.along)));
const partialWall={minX:.25,maxX:2,minZ:2,maxZ:3};
const partial=groundBeamVisibility(0,0,0,dimensions,[partialWall]);
assert.ok(partial.some(p=>p.across<0&&Math.abs(p.along-reach)<1e-8),'The open side of a corridor remains lit');
assert.ok(partial.filter(p=>p.across>.7&&p.across/p.along>.13).every(p=>p.along<2),'Rays aimed into the blocked side must not leak behind the wall');
assert.ok(partial.length>clear.length,'Adaptive corner rays preserve a wall edge between coarse samples');
for(const points of [clear,blocked,turned,partial])for(const p of points){
  assert.ok(Number.isFinite(p.across)&&Number.isFinite(p.along));
  assert.ok(Math.abs(p.across)<=dimensions.width/2+1e-8&&p.along>=-1e-8&&p.along<=reach+1e-8);
}
console.log('Flashlight mask: ray slabs, wall occlusion, rotated beam, open-side visibility and finite bounds passed.');
