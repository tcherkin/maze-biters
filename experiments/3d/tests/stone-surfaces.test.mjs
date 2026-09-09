import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {buildDuskMaze,disposeDuskMaze} from '../environment.mjs';
import {WALL_HEIGHT} from '../world.mjs';

// Texture construction needs a canvas, but the geometry and ray checks run
// entirely in Node. No browser, graphics context or external package is used.
const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
globalThis.document={
  createElement(name){
    assert.equal(name,'canvas');
    return {width:0,height:0,getContext(){
      return {
        createImageData(width,height){return {data:new Uint8ClampedArray(width*height*4)};},
        putImageData(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}
      };
    }};
  }
};

const fixtures={
  horizontal:['.......','.#####.','.......'],
  vertical:['...','.#.','.#.','.#.','...'],
  junction:['.....','.###.','..#..','..#..','.....'],
  filledSquare:['....','.##.','.##.','....']
};
const detailOffsets=new Map([
  ['stone-wall-channels',.004],
  ['stone-wall-inlays',.006],
  ['stone-wall-spill',.008]
]);
const barycentricSamples=[
  [1,0,0],[0,1,0],[0,0,1],
  [.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]
];
const ray=new THREE.Raycaster(),origin=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);
let surfaceChecks=0,geometryVertices=0,boundarySamples=0,disposedResources=0;
let largestOffsetError=0;

try{
  for(const [name,maze] of Object.entries(fixtures)){
    const group=buildDuskMaze(maze),bounds=group.userData.wallBounds;
    group.updateMatrixWorld(true);
    const stone=group.getObjectByName('stone-wall-blocks');
    const owned=group.userData.ownedGeometries,textures=group.userData.surfaceTextures;
    const materials=new Set();
    group.traverse(object=>{
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(material)materials.add(material);
      }
    });
    const resources=[...owned,...textures,...materials],disposals=new Map();
    for(const resource of resources){
      disposals.set(resource,0);
      resource.addEventListener('dispose',()=>disposals.set(resource,disposals.get(resource)+1));
    }
    const sharedStaticGeometry=group.children.find(object=>
      object.isMesh&&!object.isInstancedMesh&&object.position.y<-.1).geometry;
    let sharedDisposed=0;
    const onSharedDispose=()=>sharedDisposed++;
    sharedStaticGeometry.addEventListener('dispose',onSharedDispose);

    try{
      assert.ok(stone,`${name}: the carved wall mesh exists`);
      const wallGeometryNames=['stone-wall-core','stone-wall-blocks',...detailOffsets.keys()];
      const wallGeometries=new Set(wallGeometryNames.map(meshName=>group.getObjectByName(meshName)?.geometry));
      assert.equal(wallGeometries.size,5,`${name}: core plus four merged wall geometries`);
      assert.ok([...wallGeometries].every(geometry=>owned.includes(geometry)),`${name}: every wall geometry is owned`);
      const floor=group.getObjectByName('stone-floor-slabs');
      if(floor){
        assert.ok(owned.includes(floor.geometry),`${name}: merged floor geometry is also owned`);
        assert.ok(textures.includes(floor.material.map)&&textures.includes(floor.material.bumpMap),
          `${name}: both floor atlases are registered for cleanup`);
      }
      assert.equal(new Set(owned).size,owned.length,`${name}: geometries have one owner`);
      assert.equal(new Set(resources).size,resources.length,`${name}: resources are registered once`);
      assert.ok(!owned.includes(sharedStaticGeometry),`${name}: shared chips/base geometry stays reusable`);

      const insideUnion=point=>bounds.some(b=>
        point.x>=b.minX-1e-6&&point.x<=b.maxX+1e-6&&
        point.z>=b.minZ-1e-6&&point.z<=b.maxZ+1e-6);
      for(const meshName of ['stone-wall-core','stone-wall-blocks',...detailOffsets.keys()]){
        const mesh=group.getObjectByName(meshName);
        assert.ok(mesh,`${name}: ${meshName} exists`);
        const positions=mesh.geometry.getAttribute('position');
        const normals=mesh.geometry.getAttribute('normal');
        assert.ok(positions.count>0,`${name}: ${meshName} has geometry`);
        for(let i=0;i<positions.count;i++){
          const point=new THREE.Vector3().fromBufferAttribute(positions,i);
          const normal=new THREE.Vector3().fromBufferAttribute(normals,i);
          geometryVertices++;
          assert.ok(point.toArray().every(Number.isFinite),`${name}: ${meshName} has finite vertices`);
          assert.ok(insideUnion(point),`${name}: ${meshName} stays inside collision/light wall bounds`);
          assert.ok(point.y>=-1e-6&&point.y<=WALL_HEIGHT+1e-6,`${name}: ${meshName} preserves wall height`);
          assert.ok(Math.abs(normal.length()-1)<1e-6,`${name}: ${meshName} has unit normals`);
        }
      }

      for(const [layer,offset] of detailOffsets){
        const positions=group.getObjectByName(layer).geometry.getAttribute('position');
        for(let i=0;i<positions.count;i+=3){
          const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,i+j));
          const centroid=vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1/3);
          for(const weights of barycentricSamples){
            const point=new THREE.Vector3();
            vertices.forEach((vertex,j)=>point.addScaledVector(vertex,weights[j]));
            surfaceChecks++;
            assert.ok(insideUnion(point),`${name}: ${layer} interior remains inside the wall union`);
            origin.set(point.x,WALL_HEIGHT+1,point.z);ray.set(origin,down);
            let hit=ray.intersectObject(stone,false)[0];
            if(!hit){
              // Float32 rounding can put an exact clipped boundary vertex a
              // fraction beyond its stone edge. Move only that boundary sample
              // slightly toward its own triangle interior and check it again.
              assert.ok(weights.includes(0),`${name}: ${layer} interior has stone beneath it`);
              point.lerp(centroid,.0001);
              origin.set(point.x,WALL_HEIGHT+1,point.z);ray.set(origin,down);
              hit=ray.intersectObject(stone,false)[0];
              boundarySamples++;
            }
            assert.ok(hit,`${name}: ${layer} is clipped to the actual carved surface`);
            const gap=point.y-hit.point.y,error=Math.abs(gap-offset);
            largestOffsetError=Math.max(largestOffsetError,error);
            // Checking only vertices missed the original bug: the interiors
            // of a quad crossing a bevel sank up to .046 units into the stone.
            assert.ok(error<2e-6,
              `${name}: ${layer} triangle ${i/3} must follow its face (gap ${gap}, expected ${offset})`);
          }
        }
      }
    }finally{
      disposeDuskMaze(group);
      sharedStaticGeometry.removeEventListener('dispose',onSharedDispose);
    }
    assert.equal(sharedDisposed,0,`${name}: disposing a maze preserves shared chips/base geometry`);
    for(const [resource,count] of disposals){
      assert.equal(count,1,`${name}: ${resource.type||'texture'} is disposed exactly once`);
      disposedResources++;
    }
  }
}finally{
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);
  else delete globalThis.document;
}

console.log(JSON.stringify({
  fixtures:Object.keys(fixtures).length,surfaceChecks,geometryVertices,
  boundarySamples,largestOffsetError,disposedResources
}));
