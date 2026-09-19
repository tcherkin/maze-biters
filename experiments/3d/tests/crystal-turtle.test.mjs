import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {TurtleGait} from '../turtle-gait.mjs';
import {BiterGait} from '../biter-gait.mjs';
import {MAX_ACTOR_RADIUS,PLAYER_SCALE} from '../world.mjs';

const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
const meshes=root=>{const list=[];root.traverse(o=>{if(o.isMesh)list.push(o);});return list;};
const materials=root=>[...new Set(meshes(root).flatMap(o=>Array.isArray(o.material)?o.material:[o.material]))];
const materialState=m=>({color:m.color?.toArray(),emissive:m.emissive?.toArray(),emissiveIntensity:m.emissiveIntensity,
  attenuation:m.attenuationColor?.toArray(),roughness:m.roughness,metalness:m.metalness,transmission:m.transmission,
  thickness:m.thickness,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,version:m.version});
async function createTurtle(){return (await import('../models/crystal-turtle.mjs')).createCrystalTurtle();}
function fixture(Gait=TurtleGait){
  const root=new THREE.Group(),body=new THREE.Group(),paws=[];root.scale.setScalar(PLAYER_SCALE);root.add(body);
  for(const [x,z]of [[-.17,.17],[.17,.17],[-.19,-.16],[.19,-.16]]){
    const paw=new THREE.Group();paw.userData.homeX=x;paw.userData.homeZ=z;paw.position.set(x,0,z);root.add(paw);paws.push(paw);
  }
  const gait=new Gait({body,paws,scale:PLAYER_SCALE}),player={dead:false,hidden:false};gait.update(root,player,0,1/120);
  return {root,body,paws,gait,player,time:0};
}
function step(f,speed,heading,dt){
  f.root.rotation.y=heading;f.root.position.x+=Math.sin(heading)*speed*dt;f.root.position.z+=Math.cos(heading)*speed*dt;
  f.gait.update(f.root,f.player,f.time+=dt*1000,dt);
}
function footprint(root){
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),v=new THREE.Vector3();
  for(const mesh of meshes(root)){
    matrix.multiplyMatrices(inverse,mesh.matrixWorld);const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).applyMatrix4(matrix);
      assert.ok(Number.isFinite(v.x+v.y+v.z));
      assert.ok(Math.hypot(v.x,v.z)*PLAYER_SCALE<=MAX_ACTOR_RADIUS+1e-5,`${mesh.name} exceeds the corridor envelope`);
      assert.ok(v.y>=-1e-5,`${mesh.name} penetrates the floor (${v.y})`);
      assert.ok(v.y*PLAYER_SCALE<2,'The compact turtle stays below two world units tall');
    }
  }
}

test('Turtle gait preserves real travel while keeping a moderate cadence and quieter body',()=>{
  const rows=[];
  for(const speed of [2000/95*.25,2000/95*.5,2000/95]){
    let referencePhase;
    for(const fps of [30,60,120])for(const heading of [0,Math.PI/4,Math.PI/2]){
      const f=fixture(),old=fixture(BiterGait);f.root.rotation.y=old.root.rotation.y=heading;
      f.gait.anchor(f.root,0);old.gait.anchor(old.root,0);let minimum=Infinity,maximum=-Infinity,oldMaximum=0,oldMinimum=Infinity;
      const active=new Set();
      for(let frame=0;frame<fps*4;frame++){
        step(f,speed,heading,1/fps);step(old,speed,heading,1/fps);
        assert.ok(f.gait.cadence>0&&f.gait.cadence<=5.5);
        f.paws.forEach((paw,i)=>{if(paw.position.y>.001)active.add(i);});
        if(frame>=fps){minimum=Math.min(minimum,f.body.position.y);maximum=Math.max(maximum,f.body.position.y);
          oldMinimum=Math.min(oldMinimum,old.body.position.y);oldMaximum=Math.max(oldMaximum,old.body.position.y);}
      }
      near(f.gait.distance,speed*4);assert.equal(active.size,4);
      near(f.root.position.x,Math.sin(heading)*speed*4);near(f.root.position.z,Math.cos(heading)*speed*4);
      assert.ok(maximum-minimum<=.002&&maximum-minimum<(oldMaximum-oldMinimum)*.4,'Body bounce is materially calmer than existing Biter gait');
      if(referencePhase===undefined)referencePhase=f.gait.totalPhase;else near(f.gait.totalPhase,referencePhase,1e-7);
      if(fps===120&&heading===0)rows.push({speed,cadence:f.gait.cadence,bobPeakToPeak:maximum-minimum});
    }
  }
  console.log(JSON.stringify({turtleGait:rows}));
});

test('Turtle planted feet preserve world anchors over complete contacts, including fast arcade travel',()=>{
  for(const speed of [2000/95*.25,2000/95*.5,2000/95])for(const heading of [0,Math.PI/4,Math.PI/2]){
    const f=fixture(),fps=480,previous=f.paws.map(()=>({stance:false,x:0,z:0,phase:0,active:false,samples:0}));
    f.root.rotation.y=heading;f.gait.anchor(f.root,0);let complete=0,plantedSamples=0,maxSlip=0;
    for(let frame=0;frame<fps*4;frame++){
      step(f,speed,heading,1/fps);const s=Math.sin(heading),c=Math.cos(heading);
      f.paws.forEach((paw,i)=>{
        const foot=f.gait.feet[i],p=previous[i],x=f.root.position.x+PLAYER_SCALE*(paw.position.x*c+paw.position.z*s),
          z=f.root.position.z+PLAYER_SCALE*(-paw.position.x*s+paw.position.z*c);
        const continued=foot.stance&&p.stance&&foot.phase>=p.phase;
        if(frame>=fps){
          if(foot.stance&&!continued){p.active=true;p.samples=0;}
          if(continued&&p.active){maxSlip=Math.max(maxSlip,Math.hypot(x-p.x,z-p.z));p.samples++;plantedSamples++;}
          if(!foot.stance&&p.stance&&p.active){if(p.samples>=2)complete++;p.active=false;}
        }
        p.stance=foot.stance;p.phase=foot.phase;p.x=x;p.z=z;
      });
    }
    assert.ok(complete>=20&&plantedSamples>=100,'Measure resolved full contacts; no samples must never count as zero slip');
    assert.ok(maxSlip<1e-7,'The planted feet are fixed in the real world, not a slowed proxy path');
  }
});

test('Turtle turns and warm restarts stay reachable and continuous without resetting the stride',()=>{
  for(const speed of [2000/95*.25,2000/95*.5,2000/95]){
    const f=fixture(),dt=1/120;let heading=0,maxJump=0;
    for(let frame=0;frame<720;frame++){
      const target=frame<180?0:frame<360?Math.PI/4:frame<540?Math.PI/2:-Math.PI/4;
      const previousHeading=heading;
      heading+=Math.atan2(Math.sin(target-heading),Math.cos(target-heading))*(1-Math.exp(-18*dt));
      const old=f.paws.map(p=>p.position.clone()),phase=f.gait.totalPhase;
      step(f,speed,heading,dt);assert.ok(f.gait.totalPhase>phase);
      f.paws.forEach((paw,i)=>{
        maxJump=Math.max(maxJump,paw.position.distanceTo(old[i]));
        // A world-planted foot must move backward locally by the root's real
        // travel. At 2x that alone is .084 native units per 120Hz frame; it
        // must not be mistaken for a discontinuity. Allow smooth swing speed
        // in addition to the exact translation/rotation compensation.
        const physicalBudget=speed*dt/PLAYER_SCALE+2*Math.sin(Math.abs(heading-previousHeading)/2)*.316+2.7*dt;
        assert.ok(paw.position.distanceTo(old[i])<=physicalBudget,'No local jump beyond root compensation and smooth transfer');
        assert.ok(Math.hypot(paw.position.x,paw.position.z)<=.316001);
        assert.ok(Math.hypot(paw.position.x-paw.userData.homeX,paw.position.z-paw.userData.homeZ)<=.068001);
        assert.ok(paw.position.y>=0&&paw.position.y<=.026001);
      });
      assert.ok(Math.abs(f.body.rotation.x)<=.0024&&Math.abs(f.body.rotation.z)<=.0024);
    }
    assert.ok(maxJump<.136,'No paw teleports across its full reach during a smooth turn');
    while(f.gait.phase<.97)step(f,speed,heading,dt);
    const phase=f.gait.phase;
    for(let i=0;i<150;i++)f.gait.update(f.root,f.player,f.time+=dt*1000,dt);
    near(f.gait.phase,phase);const positions=f.paws.map(p=>p.position.clone());
    step(f,speed,heading,dt);
    f.paws.forEach((p,i)=>assert.ok(p.position.distanceTo(positions[i])<speed*dt/PLAYER_SCALE+2.7*dt,
      'Restart just before wrap cannot jump beyond physical travel and smooth transfer'));
  }
});

test('Turtle pause, blocked input, death, respawn and teleport retain established lifecycle semantics',()=>{
  const f=fixture(),dt=1/120;
  for(let i=0;i<120;i++)step(f,10,0,dt);
  const active=f.gait.diagnostics();f.gait.update(f.root,f.player,f.time,dt,true);assert.deepEqual(f.gait.diagnostics(),active);
  f.gait.update(f.root,f.player,f.time,dt);assert.deepEqual(f.gait.diagnostics(),active);
  for(let i=0;i<180;i++)f.gait.update(f.root,f.player,f.time+=dt*1000,dt);
  near(f.gait.phase,active.phase);near(f.gait.distance,active.distance);assert.equal(f.gait.activity,0);
  f.paws.forEach(p=>assert.deepEqual(p.position.toArray(),[p.userData.homeX,0,p.userData.homeZ]));
  f.gait.update(f.root,{dead:true},f.time+=dt*1000,dt);assert.equal(f.gait.distance,0);
  f.root.position.set(20,0,-10);f.gait.update(f.root,f.player,f.time+=dt*1000,dt);assert.equal(f.gait.distance,0);
  step(f,12,0,dt);near(f.gait.distance,.1);
  f.root.position.x+=10;f.gait.update(f.root,f.player,f.time+=dt*1000,dt);assert.equal(f.gait.distance,0);
  f.gait.update(f.root,{hidden:true},f.time+=dt*1000,dt);assert.equal(f.gait.activity,0);
});

test('Crystal turtle geometry and articulated mouth fit the playable envelope',async()=>{
  const look=await createTurtle(),root=look.model;
  try{
    assert.ok(root.userData.bodyRig?.isGroup&&root.userData.bodyRig.parent===root);
    assert.deepEqual(root.userData.bodyRig.position.toArray(),[0,0,0]);
    assert.equal(root.userData.paws.length,4);assert.equal(new Set(root.userData.paws).size,4);
    root.userData.paws.forEach((p,i)=>{
      assert.equal(p.parent,root);assert.ok(meshes(p).length>0);
      assert.ok(p.userData.homeX*(i%2===0?-1:1)>0&&p.userData.homeZ*(i<2?1:-1)>0);
    });
    root.traverse(o=>assert.ok(!o.isLight,'Opt-in geometry must not silently alter scene lighting'));
    for(const mesh of meshes(root)){
      const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
      assert.ok(p?.count>0&&n?.count===p.count&&p.array.every(Number.isFinite)&&n.array.every(Number.isFinite));
      if(g.index)assert.ok(g.index.array.every(index=>Number.isInteger(index)&&index>=0&&index<p.count));
    }
    let before;
    for(const angle of [0,.04,.12,.22,.28,.30]){
      root.userData.jaw.rotation.x=angle;root.userData.applyPose();footprint(root);
      if(angle===0)before=meshes(root).map(m=>m.matrixWorld.elements.slice());
    }
    assert.ok(meshes(root).some((m,i)=>m.matrixWorld.elements.some((v,j)=>Math.abs(v-before[i][j])>1e-5)),'Chomping articulates actual mouth geometry');
    const box=new THREE.Box3().setFromObject(root),center=root.userData.consumptionCenterY;
    assert.ok(Number.isFinite(center)&&center>box.min.y&&center<box.max.y);
    assert.ok(Math.abs(center-(box.min.y+box.max.y)/2)<(box.max.y-box.min.y)*.2,'Swallowing follows the low turtle silhouette');
  }finally{look.dispose();}
});

test('Crystal turtle uses real gait without moving gameplay roots or allocating new render resources',async()=>{
  for(const speed of [2000/95*.25,2000/95*.5,2000/95])for(const heading of [0,Math.PI/4,Math.PI/2]){
    const look=await createTurtle(),root=look.model;
    try{
      root.scale.setScalar(PLAYER_SCALE);root.rotation.y=heading;
      const gait=new TurtleGait({body:root.userData.bodyRig,paws:root.userData.paws,scale:PLAYER_SCALE}),player={dead:false,hidden:false};
      const objects=meshes(root),geometry=objects.map(m=>m.geometry),material=materials(root),moving=new Set();gait.update(root,player,0,1/120);
      for(let frame=1;frame<=120;frame++){
        const angle=heading+(frame<=60?0:Math.PI/4*(1-Math.exp(-(frame-60)*18/120)));
        root.rotation.y=angle;root.position.x+=Math.sin(angle)*speed/120;root.position.z+=Math.cos(angle)*speed/120;
        const position=root.position.toArray();gait.update(root,player,frame*1000/120,1/120);
        root.userData.jaw.rotation.x=.15+.15*Math.sin(frame*.1);root.userData.applyPose();look.update(player);
        assert.deepEqual(root.position.toArray(),position);root.userData.paws.forEach((paw,i)=>{if(paw.position.y>.001)moving.add(i);});
        if(frame%10===0)footprint(root);
      }
      assert.equal(moving.size,4);near(gait.distance,speed);
      assert.deepEqual(meshes(root),objects);assert.deepEqual(objects.map(m=>m.geometry),geometry);assert.deepEqual(materials(root),material);
    }finally{look.dispose();}
  }
});

test('Turtle bite anchor follows the articulated head in root space and stays inside its readable mouth',async()=>{
  const look=await createTurtle(),root=look.model;
  const probeMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  try{
    const cavity=root.getObjectByName('Turtle dark smiling mouth'),eye=root.getObjectByName('Turtle gentle glass eyes and nostrils');
    assert.ok(cavity?.isMesh&&eye?.isMesh&&root.userData.headRig?.isGroup);
    assert.ok(eye.material.transmission<=.05&&eye.material.color.toArray().every(c=>c<.05),'Eyes and nostrils remain dark and readable');
    assert.ok(cavity.material.color.toArray().every(c=>c<.02),'The smiling cavity stays dark');
    const shell=root.getObjectByName('Turtle sculpted glass carapace');
    assert.ok(shell?.material.isMeshPhysicalMaterial&&shell.material.transmission>.5,'The continuous carapace retains actual glass transmission');
    const anchor=new THREE.Vector3(),original=root.userData.getBiteAnchor(anchor).clone();
    assert.deepEqual(original.toArray(),root.userData.biteAnchor);
    root.position.set(4,.2,-7);root.rotation.y=1.2;root.scale.setScalar(PLAYER_SCALE);
    assert.equal(root.userData.getBiteAnchor(anchor),anchor,'The supplied vector is reused');
    assert.ok(anchor.distanceTo(original)<1e-8,'Changing root/world transform does not corrupt a root-local anchor');
    for(const yaw of [-.18,0,.18])for(const jaw of [0,.30]){
      root.userData.headRig.rotation.y=yaw;root.userData.bodyRig.position.y=.0015;
      root.userData.jaw.rotation.x=jaw;root.userData.applyPose();root.updateMatrixWorld(true);
      root.userData.getBiteAnchor(anchor);
      assert.ok(anchor.toArray().every(Number.isFinite));
      assert.ok(anchor.distanceTo(original)>.001,'Anchor follows actual head/body articulation');
      const world=anchor.clone().applyMatrix4(root.matrixWorld),probe=new THREE.Mesh(cavity.geometry,probeMaterial);
      probe.matrixWorld.copy(cavity.matrixWorld);
      const ray=new THREE.Raycaster(world,new THREE.Vector3(1,.137,.29).normalize());
      const hits=ray.intersectObject(probe,false).map(hit=>hit.distance).filter((d,i,a)=>i===0||d-a[i-1]>1e-7);
      assert.equal(hits.length%2,1,'Consumption destination lies inside the transformed mouth, not behind the shell');
    }
  }finally{probeMaterial.dispose();look.dispose();}
});

test('Production bite presentation targets the turtle mouth while preserving chomp timing and legacy anchors',async()=>{
  const {BiteEffects,SWALLOW_MS,CHOMP_MS}=await import('../bite-effects.mjs');
  const look=await createTurtle(),root=look.model;
  try{
    root.position.set(4,0,-6);root.rotation.y=.9;root.scale.setScalar(PLAYER_SCALE);
    root.userData.headRig.rotation.y=.12;root.userData.bodyRig.position.y=.001;
    // Exercise the production update method without allocating its unrelated
    // canvas sprite pool. The actual actor, mouth, jaw driver and swallowed
    // group use Three transforms; only the bloom renderer is inert here.
    const bite=Object.create(BiteEffects.prototype),event={time:1000},piece=new THREE.Group();
    Object.assign(bite,{time:1000,updatedAt:null,mouth:new THREE.Vector3(),bloom:{update(){}},
      slots:[{event,group:piece,from:new THREE.Vector3(-2,0,4)}],latest:event});
    const expected=new THREE.Vector3(),rootPosition=root.position.clone();let previousSize=Infinity;
    for(const age of [0,CHOMP_MS*.25,SWALLOW_MS*.6,SWALLOW_MS*.9]){
      bite.time=event.time+age;root.userData.jaw.rotation.x=.015;BiteEffects.prototype.update.call(bite,root);root.userData.applyPose();
      root.userData.getBiteAnchor(expected);expected.applyMatrix4(root.matrixWorld);
      assert.ok(bite.mouth.distanceTo(expected)<1e-8,'Real consumption uses the articulated head destination');
      assert.ok(piece.scale.y<=previousSize&&piece.scale.y>0);previousSize=piece.scale.y;
      assert.ok(root.position.distanceTo(rootPosition)<1e-12,'Presentation never moves the gameplay root');
      if(age===CHOMP_MS*.25)near(root.userData.jaw.rotation.x,.30);
    }
    assert.ok(piece.position.distanceTo(expected)<piece.position.distanceTo(bite.slots[0].from),'Mouthful approaches the turtle mouth');
    bite.time=event.time+SWALLOW_MS;BiteEffects.prototype.update.call(bite,root);
    assert.equal(piece.visible,false);assert.equal(bite.slots[0].event,null,'Swallow completion uses the unchanged event duration');
    root.userData.jaw.rotation.x=.015;bite.time=event.time+CHOMP_MS;BiteEffects.prototype.update.call(bite,root);
    near(root.userData.jaw.rotation.x,.015);assert.equal(bite.latest,null);

    const legacy=new THREE.Group();legacy.position.set(-3,0,5);legacy.rotation.y=-.7;legacy.scale.setScalar(PLAYER_SCALE);
    bite.time++;BiteEffects.prototype.update.call(bite,legacy);
    expected.set(0,.285,.18).applyMatrix4(legacy.matrixWorld);
    assert.ok(bite.mouth.distanceTo(expected)<1e-8,'Actors without an anchor provider retain the established destination');
  }finally{look.dispose();}
});

test('Turtle feedback restores its finish and disposal preserves other instances and shared geometry',async()=>{
  const first=await createTurtle(),second=await createTurtle(),a=materials(first.model),b=materials(second.model);
  const baseline=a.map(materialState),other=b.map(materialState),geometry=meshes(first.model).map(m=>m.geometry);
  let disposedFirst=false;
  try{
    assert.deepEqual(geometry,meshes(second.model).map(m=>m.geometry));assert.notEqual(first.model.userData.jaw,second.model.userData.jaw);
    for(let i=0;i<20;i++){
      first.update({shield:true,powered:i%2===0});assert.ok(a.some((m,j)=>JSON.stringify(materialState(m))!==JSON.stringify(baseline[j])));
      assert.deepEqual(b.map(materialState),other);first.update({shield:false,powered:true});first.update({dead:true});first.update(null);
      assert.deepEqual(a.map(materialState),baseline);
    }
    assert.deepEqual(materials(first.model),a);assert.deepEqual(meshes(first.model).map(m=>m.geometry),geometry);
    const count=new Map(a.map(m=>[m,0]));let foreignDisposals=0,geometryDisposals=0;
    a.forEach(m=>m.addEventListener('dispose',()=>count.set(m,count.get(m)+1)));
    b.forEach(m=>m.addEventListener('dispose',()=>foreignDisposals++));[...new Set(geometry)].forEach(g=>g.addEventListener('dispose',()=>geometryDisposals++));
    first.dispose();disposedFirst=true;
    assert.ok([...count.values()].every(n=>n===1));assert.equal(foreignDisposals,0);assert.equal(geometryDisposals,0);
    second.update({shield:true});second.update(null);assert.deepEqual(b.map(materialState),other);
  }finally{if(!disposedFirst)first.dispose();second.dispose();}
});
