import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.min.js';
import {buildDuskMaze,disposeDuskMaze} from '../environment.mjs';
import {worldLayout} from '../world.mjs';
import {CONCEPT_MAZE} from '../maze-layout.mjs';

// Capture texture construction. Geometry, rays and cleanup use local Three.js
// in Node without a browser or graphics context.
const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
globalThis.document={createElement(name){
  assert.equal(name,'canvas');
  const canvas={width:0,height:0,pixels:null};
  canvas.getContext=()=>({
    createImageData(width,height){return {data:new Uint8ClampedArray(width*height*4)};},
    putImageData(image){canvas.pixels=new Uint8ClampedArray(image.data);},
    beginPath(){},moveTo(){},lineTo(){},stroke(){}
  });
  return canvas;
}};

const fixtures={
  small:['#'],
  narrow:['#.#','#.#','#.#','#.#','#.#','#.#','#.#'],
  odd:['#####','#...#','###.#','#...#','#####'],
  concept:CONCEPT_MAZE
};
const TOP=-.005,BASE_TOP=-.05,BASE_BEVEL_BOTTOM=-.064,EPS=1e-6;
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
const floorOf=group=>group.children.find(object=>object.isInstancedMesh&&object.material.map);
const baseOf=group=>group.children.find(object=>object.isMesh&&!object.isInstancedMesh&&object.position.y<-.1);
const bytes=value=>Buffer.from(value.buffer,value.byteOffset,value.byteLength);
const signature=floor=>{
  const hash=createHash('sha256');
  hash.update(bytes(floor.instanceMatrix.array));hash.update(bytes(floor.instanceColor.array));
  hash.update(bytes(floor.material.map.image.pixels));
  return hash.digest('hex');
};
let tileChecks=0,contactChecks=0,coverageChecks=0,disposedResources=0,conceptTiles=0;

try{
  for(const [name,maze] of Object.entries(fixtures)){
    const group=buildDuskMaze(maze),layout=worldLayout(maze),floor=floorOf(group),base=baseOf(group);
    assert.ok(floor&&base,name+': instanced paving and its continuous backing exist');
    const resources=[floor,floor.material,floor.material.map],disposals=new Map(resources.map(resource=>[resource,0]));
    for(const resource of resources)resource.addEventListener('dispose',()=>disposals.set(resource,disposals.get(resource)+1));
    let sharedDisposed=0;
    const onSharedDispose=()=>sharedDisposed++;
    floor.geometry.addEventListener('dispose',onSharedDispose);
    try{
      assert.equal(group.children.filter(object=>object.isInstancedMesh&&object.material.map).length,1,
        name+': paving shares a single instanced draw');
      assert.equal(floor.count,group.userData.pavingCount,name+': metadata matches rendered tiles');
      assert.ok(floor.count>0&&floor.receiveShadow&&!floor.castShadow,name+': paving receives scene and flashlight shadows');
      assert.equal(floor.geometry,base.geometry,name+': paving and backing reuse the same bevelled block');
      assert.ok(!group.userData.ownedGeometries.includes(floor.geometry),name+': cleanup does not own shared geometry');
      assert.ok(floor.material.isMeshPhysicalMaterial,name+': restored paving keeps its reflective material');
      assert.ok(floor.material.roughness>.5&&floor.material.clearcoat>0&&floor.material.metalness>0,
        name+': paving remains rough stone with restrained reflections');
      assert.ok(!floor.material.displacementMap&&!floor.material.transparent,name+': appearance creates no terrain or holes');
      const texture=floor.material.map;
      assert.equal(group.userData.surfaceTextures.filter(item=>item===texture).length,1,name+': mineral texture has one cleanup owner');
      assert.equal(texture.colorSpace,THREE.SRGBColorSpace);
      assert.equal(texture.image.width,256);assert.equal(texture.image.height,256);
      assert.equal(texture.wrapS,THREE.RepeatWrapping);assert.equal(texture.wrapT,THREE.RepeatWrapping);

      group.updateMatrixWorld(true);floor.geometry.computeBoundingBox();
      const matrix=new THREE.Matrix4(),box=new THREE.Box3(),centres=[],color=new THREE.Color();
      for(let i=0;i<floor.count;i++){
        floor.getMatrixAt(i,matrix);
        assert.ok(matrix.elements.every(Number.isFinite),name+': tile transforms remain finite');
        box.copy(floor.geometry.boundingBox).applyMatrix4(matrix);
        assert.ok(box.max.x>box.min.x&&box.max.z>box.min.z,name+': no degenerate tile');
        assert.ok(Math.abs(box.max.y-TOP)<EPS,name+': every tile keeps the original walking plane');
        assert.ok(box.min.x>=-layout.width/2-.15-EPS&&box.max.x<=layout.width/2+.15+EPS&&
          box.min.z>=-layout.height/2-.15-EPS&&box.max.z<=layout.height/2+.15+EPS,
          name+': paving fits inside the board');
        floor.getColorAt(i,color);
        assert.ok(color.b>color.r&&color.r>color.g,name+': original dark purple paving is retained');
        centres.push(new THREE.Vector3().setFromMatrixPosition(matrix));tileChecks++;
      }
      // Sample real instanced triangles, including first and last tiles.
      // Checking every instance would turn this bounded audit into O(n²) rays.
      const sampled=new Set([0,floor.count-1,...Array.from({length:8},(_,i)=>Math.floor(i*(floor.count-1)/7))]);
      for(const i of sampled){
        const p=centres[i];ray.set(new THREE.Vector3(p.x,1,p.z),down);
        const hit=ray.intersectObject(floor,false)[0];
        assert.ok(hit&&Math.abs(hit.point.y-TOP)<EPS,name+': tile centres provide a flat contact surface');
        contactChecks++;
      }
      // Inset joints reveal continuous backing. Its original outside bevel
      // descends slightly near the first row, unlike the flat paving tops.
      const first=centres[0],second=centres[1];
      floor.getMatrixAt(0,matrix);box.copy(floor.geometry.boundingBox).applyMatrix4(matrix);
      const seamX=box.max.x+.0065;
      assert.ok(second&&Math.abs(first.z-second.z)<EPS,name+': first row contains adjacent paving');
      ray.set(new THREE.Vector3(seamX,1,first.z),down);
      const seamHit=ray.intersectObjects([floor,base],false)[0];
      assert.ok(seamHit?.object===base&&seamHit.point.y>=BASE_BEVEL_BOTTOM&&seamHit.point.y<=BASE_TOP+EPS,
        name+': backing closes visible joints');
      for(const x of [-layout.width/2,0,layout.width/2])for(const z of [-layout.height/2,0,layout.height/2]){
        ray.set(new THREE.Vector3(x,1,z),down);
        const hit=ray.intersectObjects([floor,base],false)[0];
        assert.ok(hit&&hit.point.y>=BASE_BEVEL_BOTTOM&&hit.point.y<=TOP+EPS,name+': board and areas under walls stay covered');
        coverageChecks++;
      }
      if(name==='concept'){
        conceptTiles=floor.count;
        assert.ok(conceptTiles>1000,name+': original fine paving replaces the experimental broad slabs');
      }
      const duplicate=buildDuskMaze(maze);
      try{
        const duplicateFloor=floorOf(duplicate);
        assert.equal(signature(duplicateFloor),signature(floor),name+': transforms, tints and mineral grain are deterministic');
        assert.equal(duplicateFloor.geometry,floor.geometry,name+': rebuilding reuses bevel geometry');
        assert.notEqual(duplicateFloor.material,floor.material,name+': each maze owns its material');
        assert.notEqual(duplicateFloor.material.map,texture,name+': each maze owns its mineral texture');
      }finally{disposeDuskMaze(duplicate);}
    }finally{
      disposeDuskMaze(group);floor.geometry.removeEventListener('dispose',onSharedDispose);
    }
    assert.equal(sharedDisposed,0,name+': rebuilding/disposal preserves reusable block geometry');
    for(const count of disposals.values()){
      assert.equal(count,1,name+': instances, material and texture are each disposed once');disposedResources++;
    }
  }
}finally{
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);
  else delete globalThis.document;
}
console.log(JSON.stringify({fixtures:Object.keys(fixtures).length,conceptTiles,tileChecks,contactChecks,coverageChecks,disposedResources}));
