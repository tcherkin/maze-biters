import * as THREE from './vendor/three.module.min.js';

// Smaller transverse section, same route length. Head/tail conversions and
// game collisions keep their original committed cells and timing.
export const RUINS_WIDTH=.72,RUINS_HEIGHT=.78;
const z=[-.37,-.35,-.30,-.22,.22,.30,.35,.37];
function shell(radii){
  const points=z.map((v,i)=>new THREE.Vector2(radii[i],v));
  const g=new THREE.LatheGeometry(points,16);g.rotateX(Math.PI/2);g.scale(1,.87,1);
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export const ruinsSegmentGeometry=shell([0,.14,.195,.218,.218,.195,.14,0]);
const tail=shell([0,.018,.037,.070,.166,.178,.14,0]);
export const ruinsTailGeometry=ruinsSegmentGeometry.clone();
ruinsTailGeometry.morphAttributes.position=[tail.attributes.position];
ruinsTailGeometry.morphAttributes.normal=[tail.attributes.normal];
ruinsTailGeometry.computeBoundingSphere();tail.dispose();
// Two thin luminous collars, visible through the glass around each joint.
const ring=new THREE.LatheGeometry([new THREE.Vector2(.181,-.298),new THREE.Vector2(.198,-.282),new THREE.Vector2(.199,-.271)],16);
ring.rotateX(Math.PI/2);ring.scale(1,.87,1);
const other=ring.clone();other.rotateY(Math.PI);
export const ruinsAccentGeometry=new THREE.BufferGeometry();
for(const name of ['position','normal','uv']){
  const a=ring.toNonIndexed(),b=other.toNonIndexed(),values=new Float32Array(a.attributes[name].array.length+b.attributes[name].array.length);
  values.set(a.attributes[name].array);values.set(b.attributes[name].array,a.attributes[name].array.length);
  ruinsAccentGeometry.setAttribute(name,new THREE.BufferAttribute(values,a.attributes[name].itemSize));a.dispose();b.dispose();
}
ring.dispose();other.dispose();ruinsAccentGeometry.computeBoundingSphere();

export function setRuinsFinish(finish,enabled){
  // The base look remains authoritative for the glass. Only the removable
  // etched accents change from dark chevrons into saturated luminous collars.
  finish.accentMaterial.emissiveIntensity=enabled?2.3:.60;
}
