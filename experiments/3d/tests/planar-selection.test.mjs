import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three.module.min.js';
import {buildDuskMaze,disposeDuskMaze} from '../environment.mjs';
import {CONCEPT_MAZE} from '../maze-layout.mjs';
import {worldLayout} from '../world.mjs';
import {PlanarWallMirrors} from '../planar-wall-mirrors.mjs';
import {ProjectionCamera} from '../projection-camera.mjs';

// Real maze geometry with a CPU canvas substitute for its generated textures.
// This exercises the exposed ends of short walls as well as long wall faces;
// a length threshold alone would accidentally discard the short exposed ends.
const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
globalThis.document={createElement(name){
  assert.equal(name,'canvas');
  return {width:0,height:0,getContext(){return {
    createImageData(width,height){return {data:new Uint8ClampedArray(width*height*4)};},
    putImageData(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}
  };}};
}};
let maze;
try{maze=buildDuskMaze(CONCEPT_MAZE);}
finally{
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);
  else delete globalThis.document;
}
const layout=worldLayout(CONCEPT_MAZE),bounds=maze.userData.wallBounds;
test.after(()=>disposeDuskMaze(maze));
const inside=(x,z)=>bounds.some(b=>x>b.minX-1e-6&&x<b.maxX+1e-6&&z>b.minZ-1e-6&&z<b.maxZ+1e-6);

function makeMirrors(){const mirrors=new PlanarWallMirrors({});mirrors.attach(maze);return mirrors;}
function cameraAt(tilt=45,zoom=1,panX=0,panZ=0,projection=0,aspect=16/9){
  const radians=THREE.MathUtils.degToRad(tilt),groundProjection=Math.cos(radians);
  const projectedHeight=(layout.height+1)*groundProjection+2*Math.sin(radians)+1.2;
  const viewH=Math.max(projectedHeight,(layout.width+1.6)/aspect)/zoom,viewW=viewH*aspect;
  const camera=new ProjectionCamera();
  camera.left=-viewW/2;camera.right=viewW/2;camera.top=viewH/2;camera.bottom=-viewH/2;
  camera.setProjection(projection);
  camera.position.set(panX,camera.focusDistance*groundProjection,panZ+camera.focusDistance*Math.sin(radians));
  camera.lookAt(panX,0,panZ);camera.updateMatrixWorld();return camera;
}
const selectedKeys=mirrors=>mirrors.selected.map(entry=>entry.key);
const plusZKeys=[535,375,295,215,135,-25,-105,-265,-425,-585].map(constant=>`0:1:${constant}`);

test('planar registry contains exposed concept walls, excluding joints inside the wall structure',()=>{
  const mirrors=makeMirrors();
  try{
    const plusZ=mirrors.planes.filter(entry=>entry.plane.normal.z>.999);
    assert.deepEqual(plusZ.map(entry=>entry.key).sort(),plusZKeys.toSorted(),
      'all ten exposed front planes remain, including short dead-end wall faces');
    assert.ok(plusZ.some(entry=>entry.segments.reduce((sum,b)=>sum+b.maxX-b.minX,0)<3),
      'a real short exposed end is preserved');
    for(const entry of mirrors.planes){
      assert.ok(entry.segments.length>0);
      const normal=entry.plane.normal;
      for(const segment of entry.segments){
        const x=(segment.minX+segment.maxX)/2,z=(segment.minZ+segment.maxZ)/2;
        assert.equal(inside(x+normal.x*.05,z+normal.z*.05),false,`${entry.key} faces open space, not another stone`);
        assert.equal(inside(x-normal.x*.05,z-normal.z*.05),true,`${entry.key} has solid wall behind it`);
      }
    }
  }finally{mirrors.dispose();}
});

test('every visible mirror keeps its capture while actors move, disappear, split or change count',()=>{
  const mirrors=makeMirrors(),camera=cameraAt();
  try{
    mirrors.choose(camera,[]);
    const expected=selectedKeys(mirrors);
    assert.equal(expected.length,10,'the whole visible board has all ten front mirror planes');
    assert.deepEqual(expected.toSorted(),plusZKeys.toSorted());
    const actorSets=[[],[{position:new THREE.Vector3(0,0,0),player:true}],
      [{position:new THREE.Vector3(500,0,500),player:true}]];
    for(let step=0;step<24;step++){
      actorSets.push(Array.from({length:1+step*7},(_,i)=>({player:i===0,
        position:new THREE.Vector3(-30+(i*7+step*3)%61,0,-20+(i*13+step*5)%41)})));
    }
    for(const actors of [...actorSets,...actorSets.toReversed()]){
      mirrors.choose(camera,actors);
      assert.deepEqual(selectedKeys(mirrors),expected,
        'actor proximity and ordering cannot swap a wall between reflection techniques or atlas slots');
    }
  }finally{mirrors.dispose();}
});

test('selection follows the camera view, including zoom, offscreen pan and exact top-down',()=>{
  const mirrors=makeMirrors();
  try{
    mirrors.choose(cameraAt(45,1.5),[]);
    const expected=[375,295,215,135,-25,-105,-265,-425].map(c=>`0:1:${c}`).sort();
    assert.deepEqual(selectedKeys(mirrors).sort(),expected,'the starting camera covers eight exposed bands');
    mirrors.choose(cameraAt(45,1.5,200,200),[{position:new THREE.Vector3(0,0,0),player:true}]);
    assert.equal(mirrors.selected.length,0,'offscreen actors cannot allocate invisible wall captures');
    mirrors.choose(cameraAt(5,1),[]);
    assert.equal(mirrors.selected.length,10,
      'orthographic faces follow parallel view rays, including walls in front of the camera center in world Z');
    mirrors.choose(cameraAt(0,1),[{position:new THREE.Vector3(0,0,0),player:true}]);
    assert.equal(mirrors.selected.length,0,'edge-on vertical walls need no capture in exact top-down view');
    mirrors.choose(cameraAt(45,1),[]);
    assert.equal(mirrors.selected.length,10,'returning the camera restores the same wall coverage');
  }finally{mirrors.dispose();}
});

test('perspective captures both lateral wall directions without an actor priority switch',()=>{
  const mirrors=makeMirrors(),camera=cameraAt(45,1,0,0,1);
  try{
    mirrors.choose(camera,[]);
    const expected=selectedKeys(mirrors);
    assert.ok(expected.length>10,'perspective reveals wall faces that are edge-on in the orthographic view');
    assert.ok(mirrors.selected.some(entry=>entry.plane.normal.x>.999),'left-side walls face the perspective eye');
    assert.ok(mirrors.selected.some(entry=>entry.plane.normal.x<-.999),'right-side walls face the perspective eye');
    for(const entry of mirrors.selected)assert.ok(entry.plane.distanceToPoint(camera.position)>0,'only the eye-facing side is captured');
    for(const actors of [[],[{position:new THREE.Vector3(-15,0,12),player:true}],
      [{position:new THREE.Vector3(15,0,-12),player:true}],[]]){
      mirrors.choose(camera,actors);
      assert.deepEqual(selectedKeys(mirrors),expected,'lateral wall slots remain stable while actors move');
    }
  }finally{mirrors.dispose();}
});

test('the concept maze fits the atlas across supported projection, tilt, zoom and camera pan',t=>{
  const mirrors=makeMirrors();let cases=0,maximum=0,largest;
  try{
    for(const aspect of [.4,.65,1,16/9,2,3,4])for(const projection of [0,.01,.25,.5,.75,1]){
      for(let tilt=0;tilt<=75;tilt+=2.5)for(const zoom of [1,1.25,1.5,1.75,2]){
        const centered=cameraAt(tilt,zoom,0,0,projection,aspect),cos=Math.cos(THREE.MathUtils.degToRad(tilt));
        const boundX=Math.max(0,(layout.width+1)/2-centered.right);
        const boundZ=Math.max(0,(layout.height+1)/2-centered.top/cos);
        for(const fx of [-1,-.5,0,.5,1])for(const fz of [-1,-.5,0,.5,1]){
          const camera=cameraAt(tilt,zoom,boundX*fx,boundZ*fz,projection,aspect);
          mirrors.choose(camera,[]);cases++;
          const count=mirrors.selected.length;
          assert.ok(count<=24,'all visible exposed planes fit, without silently dropping or swapping wall captures');
          assert.equal(new Set(selectedKeys(mirrors)).size,count,'each physical wall plane has exactly one slot');
          if(count>maximum){maximum=count;largest={aspect,projection,tilt,zoom,pan:[boundX*fx,boundZ*fz]};}
        }
      }
    }
    assert.ok(maximum>16,'the sweep exercises views that needed the expanded six-row atlas');
    t.diagnostic(JSON.stringify({cameraCases:cases,maximumVisiblePlanes:maximum,atlasCapacity:24,largest}));
  }finally{mirrors.dispose();}
});
