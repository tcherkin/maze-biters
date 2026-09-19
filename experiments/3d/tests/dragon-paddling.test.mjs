import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {DragonPaddling} from '../dragon-paddling.mjs';
import {createCrystalDragon} from '../models/crystal-dragon.mjs';
import {PLAYER_SCALE} from '../world.mjs';
const close=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,a+' differs from '+b);
function fixture(){
  const look=createCrystalDragon(),root=look.model;root.scale.setScalar(PLAYER_SCALE);
  const gait=new DragonPaddling({rig:root.userData.paddleRig}),player={dead:false,hidden:false,route:{epoch:1}};
  const snapshot={time:0,paused:false,generation:1,level:1};
  gait.update(root,player,snapshot,1/60);return {look,root,gait,player,snapshot,paws:root.userData.paddleRig.paws};
}
function step(f,speed=0,dt=1/60,heading=0){
  f.root.position.x+=Math.sin(heading)*speed*dt;f.root.position.z+=Math.cos(heading)*speed*dt;
  f.snapshot.time+=dt*1000;f.gait.update(f.root,f.player,f.snapshot,dt);
}
const poses=f=>f.paws.flatMap(p=>p.joints.map(j=>j.object.quaternion.toArray()));
const sole=p=>p.wrist.getWorldPosition(new THREE.Vector3()).y-p.soleOffset*PLAYER_SCALE;

test('Cadence follows distance at half, normal and double speed independently of frame rate',()=>{
  const rates=[];
  for(const multiplier of [.5,1,1.5,2]){
    const cycles=[];
    for(const fps of [30,60,120]){
      const f=fixture();try{
        for(let i=0;i<fps*3;i++)step(f,2000/95*.5*multiplier,1/fps);
        cycles.push(f.gait.totalCycles);
        assert.ok(f.gait.cadence>1.9&&f.gait.cadence<6.8);
        if(fps===60)rates.push(f.gait.cadence);
      }finally{f.look.dispose();}
    }
    close(Math.max(...cycles),Math.min(...cycles),1e-8);
  }
  assert.ok(rates[1]>4&&rates[1]<4.5,'1x retains a brisk, readable trot with shorter steps');
  assert.ok(rates[3]>rates[0]*2.5);
});

test('Support feet stay on the floor and stationary in world space while the body passes over them',()=>{
  const f=fixture();let supports=0,swings=0,maxLift=0;
  try{
    let previous=f.paws.map(p=>p.wrist.getWorldPosition(new THREE.Vector3()));
    let previousContacts=[false,false,false,false];
    for(let i=0;i<600;i++){
      step(f,2000/95*.5,1/120);
      const contacts=f.gait.diagnostics().contacts;
      f.paws.forEach((paw,p)=>{
        const position=paw.wrist.getWorldPosition(new THREE.Vector3()),y=sole(paw);
        assert.ok(y>=.0019,'Paw '+p+' penetrates the floor: '+y);
        assert.ok(y<=.163,'Recovery must remain close to the floor');
        if(contacts[p]){
          close(y,.002);
          if(previousContacts[p]){assert.ok(position.distanceTo(previous[p])<1e-7,'The planted sole slides');supports++;}
        }else{swings++;maxLift=Math.max(maxLift,y);}
        previous[p].copy(position);
      });
      previousContacts=contacts;
    }
    assert.ok(supports>500&&swings>500);assert.ok(maxLift>.10);
  }finally{f.look.dispose();}
});

test('Stopping does not keep cycling; raised paws settle in place within a quarter second',()=>{
  const f=fixture();try{
    for(let i=0;i<77;i++)step(f,10);
    const phase=f.gait.totalCycles;
    for(let i=0;i<30;i++)step(f,0);
    close(f.gait.totalCycles,phase);close(f.gait.cadence,0);
    for(const paw of f.paws)close(sole(paw),.002,.0001);
    const stopped=poses(f);
    for(let i=0;i<100;i++)step(f,0);
    assert.deepEqual(poses(f),stopped);
  }finally{f.look.dispose();}
});

test('Pause and death preserve pose; respawn and route resets give four grounded feet',()=>{
  const f=fixture();try{
    for(let i=0;i<80;i++)step(f,12);
    const paused=poses(f),cycles=f.gait.totalCycles;
    f.snapshot.paused=true;for(let i=0;i<120;i++)step(f,0);
    assert.deepEqual(poses(f),paused);close(f.gait.totalCycles,cycles);
    f.snapshot.paused=false;f.gait.update(f.root,f.player,f.snapshot,10);
    assert.deepEqual(poses(f),paused);step(f,12);assert.ok(f.gait.totalCycles>cycles);
    const dead=poses(f);f.player.dead=true;for(let i=0;i<30;i++)step(f,0);
    assert.deepEqual(poses(f),dead);
    f.player.dead=false;step(f,0);close(f.gait.totalCycles,0);
    for(const paw of f.paws)close(sole(paw),.002);
    for(const reason of ['generation','level','epoch','rewind','teleport']){
      for(let i=0;i<30;i++)step(f,8);
      if(reason==='epoch')f.player.route.epoch++;else if(reason==='rewind')f.snapshot.time=0;
      else if(reason==='teleport')f.root.position.x+=20;else f.snapshot[reason]++;
      step(f,0);close(f.gait.totalCycles,0);for(const paw of f.paws)close(sole(paw),.002);
    }
  }finally{f.look.dispose();}
});

function bounds(root){
  root.updateMatrixWorld(true);root.userData.dragonRig.skeleton.update();
  const box=new THREE.Box3(),v=new THREE.Vector3();
  root.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,v);
      v.applyMatrix4(mesh.matrixWorld);box.expandByPoint(v);}});
  return box;
}
test('Dense stance and swing poses keep rigid lengths, floor clearance, body size, level soles and bite anchor',()=>{
  const f=fixture(),anchor=new THREE.Vector3(),expected=new THREE.Vector3();
  f.root.userData.getBiteAnchor(expected);
  const before=[];f.root.traverse(o=>before.push([o,o.geometry,o.material]));
  try{
    for(const profile of [0,1])for(let i=0;i<256;i++){
      f.gait.pose(i/256,1,profile);
      const b=bounds(f.root),size=b.getSize(new THREE.Vector3());
      close(size.z,4,1e-5);assert.ok(size.x<2,'Width '+size.x);assert.ok(b.min.y>=-.005,'Floor penetration '+b.min.y);
      f.paws.forEach(p=>{
        const hip=p.pivot.getWorldPosition(new THREE.Vector3()),knee=p.elbow.getWorldPosition(new THREE.Vector3()),ankle=p.wrist.getWorldPosition(new THREE.Vector3());
        close(hip.distanceTo(knee),p.elbow.position.length()*PLAYER_SCALE);
        close(knee.distanceTo(ankle),p.wrist.position.length()*PLAYER_SCALE);
        const up=new THREE.Vector3(0,1,0).applyQuaternion(p.wrist.getWorldQuaternion(new THREE.Quaternion()));
        close(up.y,1);assert.ok(p.joints.every(j=>j.object.quaternion.toArray().every(Number.isFinite)));
      });
      f.root.userData.getBiteAnchor(anchor);assert.ok(anchor.distanceTo(expected)<1e-7);
    }
    const after=[];f.root.traverse(o=>after.push([o,o.geometry,o.material]));assert.deepEqual(after,before);
  }finally{f.look.dispose();}
});

test('Diagonals and instant reversals retain phase and never stretch the chains or modify the head',()=>{
  const f=fixture(),head=f.root.userData.headRig,headPose=head.quaternion.toArray();let previous=0;
  try{
    for(let i=0;i<300;i++){
      const heading=[0,Math.PI/4,Math.PI,-Math.PI/2][Math.floor(i/25)%4];
      f.root.rotation.y=heading;step(f,10,1/60,heading);
      assert.ok(f.gait.totalCycles>previous);previous=f.gait.totalCycles;
      assert.deepEqual(head.quaternion.toArray(),headPose);
      for(const p of f.paws){assert.ok(sole(p)>=.001,'Reversal cannot force feet under the floor');
        assert.ok(p.joints.every(j=>j.object.quaternion.toArray().every(Number.isFinite)));}
    }
  }finally{f.look.dispose();}
});

test('Front and hind paws keep separate footprints throughout the full stride',()=>{
  const f=fixture();
  const pawBox=p=>{
    const b=new THREE.Box3(),v=new THREE.Vector3();
    p.wrist.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;
      for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld);b.expandByPoint(v);}});
    return b;
  };
  let smallest=Infinity;
  try{
    for(const profile of [0,.5,1])for(let i=0;i<512;i++){
      f.gait.pose(i/512,1,profile);f.root.updateMatrixWorld(true);
      for(const side of [-1,1]){
        const fore=pawBox(f.paws.find(p=>p.front&&p.side===side));
        const hind=pawBox(f.paws.find(p=>!p.front&&p.side===side));
        const gap=fore.min.z-hind.max.z;smallest=Math.min(smallest,gap);
        assert.ok(gap>.035,'Front/rear footprints crowd or overlap: gap '+gap);
      }
    }
    assert.ok(smallest>.035);
    // World-space stance anchors, not just the isolated authored poses.
    for(const speed of [5.263,10.526,21.052]){
      f.gait.reset();step(f,0);
      for(let i=0;i<360;i++){
        step(f,speed,1/120);f.root.updateMatrixWorld(true);
        for(const side of [-1,1]){
          const fore=pawBox(f.paws.find(p=>p.front&&p.side===side));
          const hind=pawBox(f.paws.find(p=>!p.front&&p.side===side));
          assert.ok(fore.min.z-hind.max.z>.035,'Live support/recovery feet must keep their spacing');
        }
      }
    }
  }finally{f.look.dispose();}
});
