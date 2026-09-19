import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {createCrystalDragon} from '../models/crystal-dragon.mjs';
import {MirrorCaptureMaterials} from '../mirror-capture.mjs';
import {PLAYER_SCALE,CELL_SIZE} from '../world.mjs';

const meshes=root=>{const result=[];root.traverse(o=>{if(o.isMesh)result.push(o);});return result;};
const materials=root=>[...new Set(meshes(root).map(o=>o.material))];
function bounds(root){
  root.updateMatrixWorld(true);root.userData.dragonRig.skeleton.update();
  const box=new THREE.Box3(),v=new THREE.Vector3();
  for(const mesh of meshes(root)){
    const g=mesh.geometry,p=g.attributes.position;
    assert.ok(p.array.every(Number.isFinite)&&g.attributes.normal.array.every(Number.isFinite));
    if(g.index)assert.ok(g.index.array.every(i=>i>=0&&i<p.count));
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,v);
      v.applyMatrix4(mesh.matrixWorld);assert.ok(v.toArray().every(Number.isFinite));box.expandByPoint(v);
    }
  }return box;
}

test('Dragon is exactly two cells long, narrower than one cell, and stands with an articulated mouth',()=>{
  const look=createCrystalDragon(),root=look.model;root.scale.setScalar(PLAYER_SCALE);
  try{
    const box=bounds(root),size=box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.z-2*CELL_SIZE)<1e-5,`Length ${size.z}`);
    assert.ok(size.x<CELL_SIZE,`Width ${size.x}`);assert.ok(box.min.y>=-.005&&box.min.y<.015);
    const positions=meshes(root).map(m=>m.matrixWorld.elements.slice());
    root.userData.jaw.rotation.x=.30;root.userData.applyPose();const open=bounds(root);
    assert.ok(open.min.y>0,'The opened jaw cannot hit the floor');
    assert.ok(meshes(root).some((m,i)=>m.matrixWorld.elements.some((n,j)=>Math.abs(n-positions[i][j])>1e-5)));
    assert.equal(root.userData.paws.length,4);
    assert.equal(new Set(root.userData.paws).size,4);
    root.userData.paws.forEach(p=>assert.ok(p.parent.isBone));
  }finally{look.dispose();}
});

test('Dragon shell and visible inner body share normalized skin weights and a rigid head',()=>{
  const look=createCrystalDragon(),root=look.model,rig=root.userData.dragonRig;
  try{
    assert.equal(rig.bodyShell.skeleton,rig.bodyCore.skeleton);
    assert.equal(root.userData.headRig.parent,rig.bones[0]);
    for(const mesh of [rig.bodyShell,rig.bodyCore]){
      const {skinIndex:index,skinWeight:weight}=mesh.geometry.attributes;
      for(let i=0;i<weight.count;i++){
        const w=[weight.getX(i),weight.getY(i),weight.getZ(i),weight.getW(i)];
        assert.ok(w.every(n=>n>=0&&n<=1));assert.ok(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-6);
        assert.ok(index.getX(i)<rig.bones.length&&index.getY(i)<rig.bones.length);
      }
    }
    assert.ok(rig.bodyShell.material.transmission>.5);
    assert.ok(meshes(root).filter(m=>m.userData.insetCore).length>=3,'Chest, head and warm mouth contain actual interior geometry');
    const anchor=new THREE.Vector3();root.userData.getBiteAnchor(anchor);const initial=anchor.clone();
    root.position.set(7,.3,-5);root.rotation.y=1.3;root.scale.setScalar(PLAYER_SCALE);
    root.userData.getBiteAnchor(anchor);assert.ok(anchor.distanceTo(initial)<1e-7,'The eating anchor remains root-local');
    root.userData.headRig.rotation.y=.3;root.updateMatrixWorld(true);root.userData.getBiteAnchor(anchor);
    assert.ok(anchor.distanceTo(initial)>.01,'The eating anchor follows the rigid muzzle');
    bounds(root);
  }finally{look.dispose();}
});

test('Dragon effects restore their finish without rebuilding geometry or materials',()=>{
  const look=createCrystalDragon(),root=look.model,objects=meshes(root),geometries=objects.map(m=>m.geometry),mats=materials(root);
  const state=()=>mats.map(m=>({color:m.color.toArray(),emissive:m.emissive?.toArray(),gain:m.emissiveIntensity,
    transmission:m.transmission,opacity:m.opacity,version:m.version}));
  try{
    look.update({shield:false,powered:false});const original=state();
    for(let i=0;i<120;i++){look.update({shield:i%3===0,powered:i%3===1});root.userData.jaw.rotation.x=(i%30)/100;root.userData.applyPose();}
    look.update({shield:false,powered:false});assert.deepEqual(state(),original);
    assert.deepEqual(meshes(root),objects);assert.deepEqual(objects.map(o=>o.geometry),geometries);assert.deepEqual(materials(root),mats);
  }finally{look.dispose();}
});

test('Dragon mirrors retain real glass, inner patterns and animated material state; legacy actors keep their capture finish',()=>{
  const look=createCrystalDragon(),root=look.model,capture=new MirrorCaptureMaterials({unlit:true});
  const legacy=new THREE.MeshPhysicalMaterial({color:0xe20057,emissive:0xe20057,transmission:.7});
  try{
    assert.equal(capture.material(look.material),look.material,'The shell must transmit the real inner facets, not obscure them with an opaque proxy');
    assert.ok(capture.material(legacy).isMeshBasicMaterial,'Existing actors retain their previous capture finish');
    const objects=meshes(root),geometries=objects.map(o=>o.geometry),mats=objects.map(o=>o.material);
    for(const powered of [false,true]){
      look.update({shield:false,powered});
      const finish=mats.map(m=>[m.transmission,m.emissiveIntensity,m.color.getHex(),m.emissive?.getHex(),m.onBeforeCompile]);
      capture.begin(root);assert.deepEqual(objects.map(o=>o.geometry),geometries);
      assert.deepEqual(objects.map(o=>o.material),mats,'Eyes, lids, shells and inner inclusions all retain their actual materials');
      assert.deepEqual(mats.map(m=>[m.transmission,m.emissiveIntensity,m.color.getHex(),m.emissive?.getHex(),m.onBeforeCompile]),finish);
      assert.ok(objects.filter(o=>o.userData.insetCore).every(o=>o.visible),'Inner crystal patterns remain visible');
      capture.end();
    }
    capture.end();assert.deepEqual(objects.map(o=>o.material),mats);
    const count=capture.cache.size;capture.begin(root);capture.end();assert.equal(capture.cache.size,count);
  }finally{capture.dispose();look.dispose();legacy.dispose();}
});
