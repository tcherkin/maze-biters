import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {createCrystalDragon} from '../models/crystal-dragon.mjs';
import {DragonPresence} from '../dragon-presence.mjs';
import {DragonPaddling} from '../dragon-paddling.mjs';

function fixture(){
  const look=createCrystalDragon(),root=look.model;root.scale.setScalar(2.1);
  const presence=new DragonPresence({rig:root.userData.presenceRig});
  const gait=new DragonPaddling({rig:root.userData.paddleRig});
  const player={dead:false,hidden:false},snapshot={time:1000,generation:1,level:1,paused:false};
  const tick=(dt=1/60,activity=0)=>{
    snapshot.time+=dt*1000;gait.update(root,player,snapshot,dt,[]);
    presence.update(root,player,snapshot,dt,activity);root.updateMatrixWorld(true);
  };
  tick();return {look,root,presence,gait,player,snapshot,tick};
}

test('Quiet breathing moves the chest and head while planted soles, route and contact root stay fixed',()=>{
  const f=fixture(),rig=f.root.userData.presenceRig,feet=f.gait.feet.map(p=>p.wrist.matrixWorld.clone());
  const bones=f.root.userData.dragonRig.bones.map(b=>b.matrixWorld.clone()),root=f.root.matrixWorld.clone();
  let min=1,max=0,maxHead=0;
  try{
    for(let i=0;i<720;i++){
      f.tick();min=Math.min(min,f.presence.breath);max=Math.max(max,f.presence.breath);
      maxHead=Math.max(maxHead,rig.head.position.length());
      assert.deepEqual(f.root.matrixWorld,root);
      f.gait.feet.forEach((p,i)=>assert.deepEqual(p.wrist.matrixWorld,feet[i]));
      f.root.userData.dragonRig.bones.forEach((b,i)=>assert.deepEqual(b.matrixWorld,bones[i]));
      assert.ok(Math.abs(rig.head.rotation.x)<.01&&Math.abs(rig.head.rotation.z)<.004);
    }
    assert.ok(min<.01&&max>.95&&maxHead>.004);
    const g=rig.chest[0].geometry,p=g.attributes.position,m=g.morphAttributes.position[0];
    let raised=0;
    for(let i=0;i<p.count;i++){
      assert.equal(p.getZ(i),m.getZ(i),'Breathing cannot stretch the tail or body length');
      if(p.getY(i)<.18)assert.equal(p.getY(i),m.getY(i),'Belly remains planted');
      raised=Math.max(raised,m.getY(i)-p.getY(i));
    }
    assert.ok(raised>.008&&raised<.014);
  }finally{f.look.dispose();}
});

test('Blinking is brief, irregular and closes actual eyelids over both pupils',()=>{
  const f=fixture(),starts=[];let closedFrames=0,last=0;
  try{
    for(let i=0;i<3600;i++){
      f.tick();const d=f.presence.diagnostics();
      if(d.blinks!==last){starts.push(d.time);last=d.blinks;}
      if(Math.max(...d.blink)>.05)closedFrames++;
      assert.ok(d.blink.every(x=>x>=0&&x<=1));
    }
    assert.ok(starts.length>=7&&starts.length<=20,`${starts.length} blinks/minute`);
    assert.ok(closedFrames/3600<.08,'Eyes stay open for most of the time');
    const intervals=starts.slice(1).map((t,i)=>t-starts[i]);
    assert.ok(Math.max(...intervals)-Math.min(...intervals)>.6);
    f.presence.reset();const lids=f.root.userData.presenceRig.eyelids;
    for(let i=0;i<2;i++){
      const side=i?1:-1,normal=new THREE.Vector3(side*.61,.13,.78).normalize();
      const centre=new THREE.Vector3(side*.246,.552,-.020);
      for(const closure of [0,1]){
        lids[i].morphTargetInfluences[0]=closure;f.root.updateMatrixWorld(true);
        const origin=centre.clone().addScaledVector(normal,1).applyMatrix4(f.root.matrixWorld);
        const direction=normal.clone().transformDirection(f.root.matrixWorld).negate();
        const hits=new THREE.Raycaster(origin,direction).intersectObject(f.root,true);
        assert.ok(hits.length);
        assert.equal(hits[0].object===lids[i],closure===1,'Closed lid must occlude pupil; open lid must uncover it');
      }
    }
  }finally{f.look.dispose();}
});

test('Idle and locomotion blend without a phase restart; pause, death and restart are stable',()=>{
  const f=fixture(),head=f.root.userData.headRig;
  try{
    let previous=head.position.clone();
    for(let i=0;i<900;i++){
      f.tick(1/60,i>=180&&i<540?1:0);
      assert.ok(head.position.distanceTo(previous)<.0007,'No jump at start/stop');previous.copy(head.position);
    }
    assert.ok(f.presence.movement<.001);
    const before=f.presence.diagnostics(),matrix=head.matrixWorld.clone();f.snapshot.paused=true;
    for(let i=0;i<120;i++)f.tick();
    assert.deepEqual(f.presence.diagnostics(),before);assert.deepEqual(head.matrixWorld,matrix);
    f.snapshot.paused=false;f.tick();assert.ok(head.position.distanceTo(previous)<.0007);
    f.player.dead=true;f.tick();const dead=head.matrixWorld.clone();
    for(let i=0;i<30;i++)f.tick();assert.deepEqual(head.matrixWorld,dead);
    f.player.dead=false;f.tick();assert.equal(f.presence.time,0);
    assert.ok(f.presence.blink.every(x=>x===0));
    for(let i=0;i<30;i++)f.tick();f.snapshot.generation++;f.tick();assert.equal(f.presence.time,0);
  }finally{f.look.dispose();}
});

test('Presence timing is frame-rate independent and does not allocate new render resources',()=>{
  const results=[];
  for(const fps of [30,60,120]){
    const f=fixture(),objects=[];f.root.traverse(o=>{if(o.isMesh)objects.push(o);});
    const geometry=objects.map(o=>o.geometry),materials=objects.map(o=>o.material);
    try{
      for(let i=0;i<fps*12;i++)f.tick(1/fps);
      results.push(f.presence.diagnostics());
      assert.deepEqual(objects.map(o=>o.geometry),geometry);assert.deepEqual(objects.map(o=>o.material),materials);
      for(const g of geometry)for(const attrs of Object.values(g.morphAttributes))for(const attr of attrs)assert.ok(attr.array.every(Number.isFinite));
    }finally{f.look.dispose();}
  }
  for(const result of results.slice(1)){
    assert.ok(Math.abs(result.breath-results[0].breath)<1e-9);assert.equal(result.blinks,results[0].blinks);
  }
});
