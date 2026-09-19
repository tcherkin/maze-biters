import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {createNeonHedgehog} from '../models/neon-hedgehog.mjs';
import {BiterGait} from '../biter-gait.mjs';
import {MAX_ACTOR_RADIUS,PLAYER_SCALE} from '../world.mjs';

const meshes=root=>{const list=[];root.traverse(o=>{if(o.isMesh)list.push(o);});return list;};
const materials=root=>[...new Set(meshes(root).flatMap(o=>Array.isArray(o.material)?o.material:[o.material]))];
const materialState=m=>({
  color:m.color?.toArray(),emissive:m.emissive?.toArray(),emissiveIntensity:m.emissiveIntensity,
  attenuation:m.attenuationColor?.toArray(),roughness:m.roughness,metalness:m.metalness,
  transmission:m.transmission,thickness:m.thickness,opacity:m.opacity,transparent:m.transparent,
  depthWrite:m.depthWrite,version:m.version
});
function checkEnvelope(root){
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),local=new THREE.Matrix4(),v=new THREE.Vector3();
  for(const mesh of meshes(root)){
    local.multiplyMatrices(inverse,mesh.matrixWorld);
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).applyMatrix4(local);
      assert.ok(Number.isFinite(v.x+v.y+v.z));
      assert.ok(Math.hypot(v.x,v.z)*PLAYER_SCALE<=MAX_ACTOR_RADIUS+1e-5,
        `${mesh.name} exceeds the physical player envelope`);
      assert.ok(v.y>=-1e-5,`${mesh.name} sinks below the floor: ${v.y}`);
      assert.ok(v.y*PLAYER_SCALE<2,'The compact animal stays below two world units tall');
    }
  }
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);

test('Hedgehog geometry is finite and articulated poses fit the real corridor envelope',()=>{
  const look=createNeonHedgehog(),root=look.model;
  try{
    assert.ok(root.userData.bodyRig?.isGroup&&root.userData.bodyRig.parent===root);
    assert.deepEqual(root.userData.bodyRig.position.toArray(),[0,0,0]);
    root.traverse(o=>assert.ok(!o.isLight,'A model opt-in cannot silently change the scene lighting'));
    for(const mesh of meshes(root)){
      const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
      assert.ok(p?.count>0&&n?.count===p.count,`${mesh.name} has positions and normals`);
      assert.ok(p.array.every(Number.isFinite)&&n.array.every(Number.isFinite));
      if(g.index)assert.ok(g.index.array.every(index=>Number.isInteger(index)&&index>=0&&index<p.count));
      g.computeBoundingSphere();assert.ok(Number.isFinite(g.boundingSphere.radius));
    }
    for(const angle of [0,.04,.12,.22,.28,.30]){
      root.userData.jaw.rotation.x=angle;root.userData.applyPose();checkEnvelope(root);
    }
    const bounds=new THREE.Box3().setFromObject(root),height=bounds.max.y-bounds.min.y;
    const center=root.userData.consumptionCenterY;
    assert.ok(Number.isFinite(center)&&center>bounds.min.y&&center<bounds.max.y,'Swallowing declares a center inside the shorter animal');
    assert.ok(Math.abs(center-(bounds.min.y+bounds.max.y)/2)<height*.2,'Predation centers the hedgehog, not the taller helmeted actor');
  }finally{look.dispose();}
});

test('Four separate attached feet and an actual hinged mouth satisfy the existing renderer contract',()=>{
  const look=createNeonHedgehog(),root=look.model;
  try{
    const paws=root.userData.paws;
    assert.equal(paws.length,4);assert.equal(new Set(paws).size,4);
    paws.forEach((paw,i)=>{
      assert.equal(paw.parent,root,'Feet move independently of the body bob');
      assert.ok(meshes(paw).length>0,'Each permanent foot contains real geometry');
      close(paw.position.x,paw.userData.homeX);close(paw.position.z,paw.userData.homeZ);
      assert.ok(paw.position.x*(i%2===0?-1:1)>0,'Gait order is left/right within each pair');
      assert.ok(paw.position.z*(i<2?1:-1)>0,'Front pair precedes rear pair');
      assert.ok(Math.hypot(paw.position.x,paw.position.z)<.316,'Foot centers have reachable gait travel');
    });
    root.userData.jaw.rotation.x=0;root.userData.applyPose();root.updateMatrixWorld(true);
    const before=meshes(root).map(o=>o.matrixWorld.elements.slice()),feet=paws.map(o=>o.position.toArray());
    root.userData.jaw.rotation.x=.30;root.userData.applyPose();root.updateMatrixWorld(true);
    assert.ok(meshes(root).some((o,i)=>o.matrixWorld.elements.some((v,j)=>Math.abs(v-before[i][j])>1e-5)),
      'The bite driver must articulate geometry, not merely update an unused number');
    assert.deepEqual(root.position.toArray(),[0,0,0]);assert.deepEqual(paws.map(o=>o.position.toArray()),feet);

    // The consumption effect aims at this root-local point before applyPose.
    // A double-sided ray from inside a closed cavity crosses its boundary an
    // odd number of times; this catches a snout positioned away from the bite.
    const cavity=root.getObjectByName('Hedgehog dark mouth cavity');assert.ok(cavity?.isMesh);
    const probeMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),probe=new THREE.Mesh(cavity.geometry,probeMaterial);
    probe.matrixWorld.copy(cavity.matrixWorld);
    try{
      assert.deepEqual(root.userData.biteAnchor,[0,.285,.18]);
      const anchor=new THREE.Vector3(0,.285,.18),ray=new THREE.Raycaster(anchor,new THREE.Vector3(1,.137,.29).normalize());
      const hits=ray.intersectObject(probe,false).map(hit=>hit.distance).filter((d,i,a)=>i===0||d-a[i-1]>1e-7);
      assert.equal(hits.length%2,1,'Fixed bite anchor stays inside the actual mouth cavity');
    }finally{probeMaterial.dispose();}
  }finally{look.dispose();}
});

test('Real gait drives the hedgehog at arcade speeds without floor penetration or resource churn',()=>{
  for(const speed of [2000/95*.25,2000/95*.5,2000/95])for(const heading of [0,Math.PI/4,Math.PI/2]){
    const look=createNeonHedgehog(),root=look.model;
    try{
      root.scale.setScalar(PLAYER_SCALE);root.rotation.y=heading;
      const gait=new BiterGait({body:root.userData.bodyRig,paws:root.userData.paws,scale:PLAYER_SCALE});
      const player={dead:false,hidden:false},objects=meshes(root),geometry=objects.map(o=>o.geometry),material=materials(root);
      const moved=new Set();gait.update(root,player,0,1/120);
      for(let frame=1;frame<=120;frame++){
        root.position.x+=Math.sin(heading)*speed/120;root.position.z+=Math.cos(heading)*speed/120;
        const position=root.position.toArray();gait.update(root,player,frame*1000/120,1/120);
        root.userData.jaw.rotation.x=.15+.15*Math.sin(frame*.1);root.userData.applyPose();look.update(player);
        assert.deepEqual(root.position.toArray(),position,'Gait and expression never drive gameplay position');
        root.userData.paws.forEach((paw,i)=>{if(paw.position.y>.001)moved.add(i);});
        if(frame%10===0)checkEnvelope(root);
      }
      assert.equal(moved.size,4,'All four feet participate in actual movement');
      close(gait.diagnostics().distance,speed);
      assert.deepEqual(meshes(root),objects);assert.deepEqual(objects.map(o=>o.geometry),geometry);assert.deepEqual(materials(root),material);
    }finally{look.dispose();}
  }
});

test('Hedgehog gait freezes on pause, settles when blocked and reanchors after death or respawn',()=>{
  const look=createNeonHedgehog(),root=look.model;
  try{
    root.scale.setScalar(PLAYER_SCALE);
    const gait=new BiterGait({body:root.userData.bodyRig,paws:root.userData.paws,scale:PLAYER_SCALE}),player={dead:false,hidden:false};
    let time=0;gait.update(root,player,time,1/120);
    for(let i=0;i<60;i++){root.position.z+=.08;gait.update(root,player,time+=1000/120,1/120);}
    const moving=gait.diagnostics();assert.ok(moving.distance>0&&moving.activity>.9);
    gait.update(root,player,time,1/120,true);assert.deepEqual(gait.diagnostics(),moving);
    gait.update(root,player,time,1/120,false);assert.deepEqual(gait.diagnostics(),moving,'Repeated game time cannot animate paws');
    for(let i=0;i<180;i++)gait.update(root,player,time+=1000/120,1/120);
    const stopped=gait.diagnostics();close(stopped.phase,moving.phase);close(stopped.distance,moving.distance);assert.equal(stopped.activity,0);
    root.userData.paws.forEach(p=>assert.deepEqual(p.position.toArray(),[p.userData.homeX,0,p.userData.homeZ]));
    gait.update(root,{dead:true},time+=1000/120,1/120);assert.equal(gait.diagnostics().distance,0);
    root.position.set(20,0,-10);gait.update(root,player,time+=1000/120,1/120);assert.equal(gait.diagnostics().distance,0,'First respawn frame anchors without a synthetic stride');
    root.position.z+=.1;gait.update(root,player,time+=1000/120,1/120);close(gait.diagnostics().distance,.1);
    gait.update(root,{hidden:true},time+=1000/120,1/120);assert.equal(gait.diagnostics().activity,0);checkEnvelope(root);
  }finally{look.dispose();}
});

test('Feedback restores material baselines and disposing one hedgehog preserves other instances',()=>{
  const first=createNeonHedgehog(),second=createNeonHedgehog(),a=materials(first.model),b=materials(second.model);
  const baseline=a.map(materialState),otherBaseline=b.map(materialState),geometries=meshes(first.model).map(o=>o.geometry);
  assert.deepEqual(geometries,meshes(second.model).map(o=>o.geometry),'Instances share static geometry');
  assert.notEqual(first.model.userData.jaw,second.model.userData.jaw);
  try{
    for(let i=0;i<20;i++){
      first.update({shield:true,powered:i%2===0});
      assert.ok(a.some((material,j)=>JSON.stringify(materialState(material))!==JSON.stringify(baseline[j])),'Shield feedback is visible in the finish');
      assert.deepEqual(b.map(materialState),otherBaseline,'Feedback cannot mutate another player');
      first.update({shield:false,powered:true});first.update({dead:true});first.update(null);
      assert.deepEqual(a.map(materialState),baseline,'Normal material state is fully restored');
    }
    assert.deepEqual(materials(first.model),a);assert.deepEqual(meshes(first.model).map(o=>o.geometry),geometries);
    const disposed=new Map(a.map(m=>[m,0]));let secondDisposed=0,geometryDisposed=0;
    a.forEach(m=>m.addEventListener('dispose',()=>disposed.set(m,disposed.get(m)+1)));
    b.forEach(m=>m.addEventListener('dispose',()=>secondDisposed++));
    [...new Set(geometries)].forEach(g=>g.addEventListener('dispose',()=>geometryDisposed++));
    first.dispose();assert.ok([...disposed.values()].every(n=>n===1),'Every owned material is released exactly once');
    assert.equal(secondDisposed,0,'Another instance retains its live materials');assert.equal(geometryDisposed,0,'Shared geometry remains usable');
    second.update({shield:true});second.update(null);assert.deepEqual(b.map(materialState),otherBaseline);
  }finally{second.dispose();}
});
