import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {createCrystalBiter} from '../models/crystal-biter.mjs';
import {createCrystalBiter as createCrystalBiterV3} from '../models/crystal-biter-v3.mjs';
import {createSnakeFinish} from '../snake-light.mjs';

const meshList=root=>{const list=[];root.traverse(o=>{if(o.isMesh)list.push(o);});return list;};
const materialState=material=>({
  color:material.color.toArray(),emissive:material.emissive?.toArray(),emissiveIntensity:material.emissiveIntensity,
  attenuation:material.attenuationColor?.toArray(),roughness:material.roughness,metalness:material.metalness,
  transmission:material.transmission,thickness:material.thickness,opacity:material.opacity,
  transparent:material.transparent,depthWrite:material.depthWrite,version:material.version
});

test('Biter articulation stays within the existing player footprint and above the floor',()=>{
  const look=createCrystalBiter(),root=look.model,v=new THREE.Vector3();
  for(let step=0;step<=30;step++){
    root.userData.jaw.rotation.x=step/100;root.userData.applyPose();root.updateMatrixWorld(true);
    root.traverse(o=>{
      assert.ok(!o.isLight,'The alternate actor adds no light');
      if(!o.isMesh)return;
      assert.ok(!/helmet|visor|ruby/i.test(o.name));
      const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;
      assert.ok(p.array.every(Number.isFinite)&&n.array.every(Number.isFinite));
      for(let i=0;i<p.count;i++){
        v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
        assert.ok(Math.hypot(v.x,v.z)<=.414001,'Geometry fits the old collision envelope');
        assert.ok(v.y>=-1e-6&&v.y<.80,'Compact silhouette stays above the floor, including open jaw');
      }
    });
  }
  assert.ok(root.getObjectByName('Nine swept emerald crystal tufts').material.transmission>.8);
  assert.ok(root.getObjectByName('Uplifted lime face').material.transmission>.8,'The peridot face is glass too');
  look.dispose();
});
test('Instances share geometry and updates reuse resources while restoring every material baseline',()=>{
  const a=createCrystalBiter(),b=createCrystalBiter();
  const first=meshList(a.model),second=meshList(b.model);
  assert.deepEqual(first.map(o=>o.geometry),second.map(o=>o.geometry));
  assert.notEqual(a.model.userData.jaw,b.model.userData.jaw);
  const materials=[...new Set(first.map(o=>o.material))],geometries=first.map(o=>o.geometry);
  const baseline=materials.map(materialState),otherBaseline=second.map(o=>materialState(o.material));
  assert.equal(materials.length,6,'Colored shell tints, smoke, quartz, mouth and one core material');
  assert.equal(materials.filter(m=>m.transmission>0).length,3,'Only two broad glass tints and small quartz details transmit');
  for(let i=0;i<20;i++){
    a.update({shield:true,powered:i%2===0});assert.ok(a.material.emissiveIntensity>.055);
    a.update({shield:false,powered:true});assert.deepEqual(materials.map(materialState),baseline);
    a.update({powered:false,dead:true});a.update(null);
    assert.deepEqual(materials.map(materialState),baseline);
  }
  assert.deepEqual(first.map(o=>o.geometry),geometries);
  assert.deepEqual([...new Set(meshList(a.model).map(o=>o.material))],materials);
  assert.deepEqual(second.map(o=>materialState(o.material)),otherBaseline,'Feedback is local to one instance');
  const disposals=new Map(materials.map(m=>[m,0]));
  for(const material of materials)material.addEventListener('dispose',()=>disposals.set(material,disposals.get(material)+1));
  a.dispose();b.dispose();
  assert.ok([...disposals.values()].every(count=>count===1),'Every owned material is disposed exactly once');
});

test('Colored glass preserves the exact v3 exterior, expression, articulation and rig',()=>{
  const previous=createCrystalBiterV3(),current=createCrystalBiter();
  const oldMeshes=meshList(previous.model).filter(o=>o.name!=='Warm green crystal roots');
  const newMeshes=meshList(current.model).filter(o=>!o.userData.insetCore);
  assert.deepEqual(newMeshes.map(o=>o.name),oldMeshes.map(o=>o.name),'Only inset structures are added or replaced');
  for(let i=0;i<oldMeshes.length;i++){
    for(const attribute of ['position','normal'])assert.deepEqual(newMeshes[i].geometry.attributes[attribute].array,
      oldMeshes[i].geometry.attributes[attribute].array,'Nine blunt prisms and every exterior/face vertex stay identical');
    assert.deepEqual(newMeshes[i].geometry.index?.array,oldMeshes[i].geometry.index?.array);
    assert.equal(newMeshes[i].parent.name,oldMeshes[i].parent.name);
  }
  for(const angle of [.0,.012,.15,.30]){
    for(const root of [previous.model,current.model]){root.userData.jaw.rotation.x=angle;root.userData.applyPose();root.updateMatrixWorld(true);}
    for(let i=0;i<oldMeshes.length;i++)assert.deepEqual(newMeshes[i].matrixWorld.elements,oldMeshes[i].matrixWorld.elements);
  }
  assert.deepEqual(current.model.userData.paws.map(p=>p.userData),previous.model.userData.paws.map(p=>p.userData));
  assert.equal(current.model.userData.idleJaw,previous.model.userData.idleJaw);
  assert.equal(current.model.userData.idleJawAmplitude,previous.model.userData.idleJawAmplitude);
  assert.equal(current.model.userData.modelVersion,'crystal-biter-v4');
  current.dispose();previous.dispose();
});

test('Glass covers every colored exterior while smoke and a dark mouth preserve facial readability',()=>{
  const current=createCrystalBiter(),root=current.model;
  const shell=current.model.getObjectByName('Nine swept emerald crystal tufts').material;
  const face=root.getObjectByName('Uplifted lime face').material;
  for(const name of ['Satin belly and hips','Attached small foot and ankle']){
    for(const mesh of meshList(root).filter(o=>o.name===name))assert.equal(mesh.material,shell);
  }
  for(const name of ['Round smile chin','Soft eye sockets','Small warm forehead crystal'])assert.equal(root.getObjectByName(name).material,face);
  assert.ok(shell.isMeshPhysicalMaterial&&face.isMeshPhysicalMaterial);
  assert.ok(face.color.r>shell.color.r&&face.color.g>shell.color.g,'Peridot stays lighter than emerald');
  const eyes=root.getObjectByName('Curious dark eyes').material;
  assert.equal(root.getObjectByName('Short round nose').material,eyes);
  assert.ok(eyes.isMeshPhysicalMaterial&&eyes.transmission<=.05&&eyes.opacity===1);
  assert.ok(eyes.color.toArray().every(channel=>channel<.015),'Smoked eyes remain dark');
  for(const name of ['Small smile cavity','Inner hinged smile'])assert.ok(root.getObjectByName(name).material.color.toArray().every(channel=>channel<.01));
  assert.equal(root.getObjectByName('Small eye catchlights').material,root.getObjectByName('Two little bite teeth').material);
  const snake=createSnakeFinish(0x249a66),shader=()=>({uniforms:{},vertexShader:'void main() {}',fragmentShader:'#include <emissivemap_fragment>'});
  const actorShader=shader(),snakeShader=shader();shell.onBeforeCompile(actorShader);snake.material.onBeforeCompile(snakeShader);
  assert.match(actorShader.fragmentShader,/emeraldEdge/);assert.match(snakeShader.fragmentShader,/neonRim/);
  assert.doesNotMatch(snakeShader.fragmentShader,/emerald/);
  current.dispose();snake.dispose();
});

test('Small luminous structures have real depth clearance and avoid face details and mouth',()=>{
  const look=createCrystalBiter(),root=look.model;root.updateMatrixWorld(true);
  const meshes=meshList(root),cores=meshes.filter(o=>o.userData.insetCore);
  assert.equal(cores.length,2,'One merged emerald root/body draw and one small face draw');
  assert.equal(cores[0].material,cores[1].material,'Both core colors use shared vertex-colored basic material');
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const boundaries=meshes.filter(o=>!o.userData.insetCore).map(o=>{
    const mesh=new THREE.Mesh(o.geometry,material);mesh.matrixWorld.copy(o.matrixWorld);return mesh;
  });
  const ray=new THREE.Raycaster(),center=new THREE.Vector3(),vertex=new THREE.Vector3(),direction=new THREE.Vector3();
  let triangles=0;
  for(const core of cores){
    assert.ok(core.material.isMeshBasicMaterial&&core.material.vertexColors);
    assert.equal(core.castShadow,false);assert.equal(core.receiveShadow,false);
    assert.equal(core.parent,root.userData.bodyRig,'Static inset structures follow the body, never the moving jaw');
    const geometry=core.geometry,p=geometry.attributes.position,colors=geometry.attributes.color;
    assert.ok(colors.array.every(Number.isFinite)&&colors.array.some(value=>value>1),'Concentrated emissive color lives inside the shell');
    triangles+=p.count/3;
    let counted=0;
    for(const part of geometry.userData.insetParts){
      assert.equal(part.start,counted);counted+=part.count;center.fromArray(part.center).applyMatrix4(core.matrixWorld);
      for(let i=part.start;i<part.start+part.count;i++){
        vertex.fromBufferAttribute(p,i).applyMatrix4(core.matrixWorld);
        direction.subVectors(vertex,center);const radius=direction.length();
        assert.ok(radius<.112,'No large uniformly glowing body fill');
        ray.set(center,direction.normalize());ray.far=radius+.006;
        assert.equal(ray.intersectObjects(boundaries,false).length,0,'Inset structures leave at least 6 mm radial space before every exterior, socket or mouth surface');
      }
      const enclosing=root.getObjectByName(core.name==='Inset peridot forehead core'?'Uplifted lime face':'Nine swept emerald crystal tufts');
      const shell=new THREE.Mesh(enclosing.geometry,material);shell.matrixWorld.copy(enclosing.matrixWorld);
      ray.set(center,new THREE.Vector3(0,1,0));ray.far=Infinity;
      assert.ok(ray.intersectObject(shell,false).length>0,'Every core has an actual glass shell above it');
    }
    assert.equal(counted,p.count,'Every luminous vertex is covered by the clearance check');
  }
  assert.ok(triangles<=2300,'Limited shared geometry for internal structures');
  material.dispose();look.dispose();
});
