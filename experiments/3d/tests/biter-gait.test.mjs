import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {BiterGait} from '../biter-gait.mjs';
import {BiterGait as PreviousGait} from '../biter-gait-v2.mjs';
import {createCrystalBiter} from '../models/crystal-biter.mjs';

function fixture(Gait=BiterGait){
  const root=new THREE.Group(),body=new THREE.Group(),paws=[];
  root.scale.setScalar(2.1);root.add(body);
  for(const [x,z]of [[-.19,.165],[.19,.165],[-.205,-.185],[.205,-.185]]){
    const p=new THREE.Group();p.userData.homeX=x;p.userData.homeZ=z;p.position.set(x,0,z);
    root.add(p);paws.push(p);
  }
  const gait=new Gait({body,paws}),player={dead:false,hidden:false};
  gait.update(root,player,0,1/60);
  return {root,body,paws,gait,player,time:0};
}
function move(f,dx,dz,dt=1/60){
  f.root.position.x+=dx;f.root.position.z+=dz;f.time+=dt*1000;
  f.gait.update(f.root,f.player,f.time,dt);
}
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);

function strideMetrics(Gait,speed,fps,diagonal=false){
  const f=fixture(Gait),dt=1/fps,heading=diagonal?Math.PI/4:0;
  f.root.rotation.y=heading;f.gait.anchor(f.root,0);
  const dx=Math.sin(heading)*speed*dt,dz=Math.cos(heading)*speed*dt,s=Math.sin(heading),c=Math.cos(heading);
  const previous=f.paws.map(()=>({x:0,z:0,y:0,stance:false,phase:0,active:false,slip:0,travel:0,samples:0}));
  let stanceSamples=0,adjacentSamples=0,completeContacts=0,fullSlip=0,fullTravel=0,completeSamples=0;
  let minBob=Infinity,maxBob=-Infinity,oldBob=0,olderBob=0,peaks=0;
  let nearFloorSamples=0,nearFloorDrift=0,nearFloorTravel=0;
  for(let frame=0;frame<fps*6;frame++){
    move(f,dx,dz,dt);
    const measured=frame>=fps*2;
    if(measured){
      minBob=Math.min(minBob,f.body.position.y);maxBob=Math.max(maxBob,f.body.position.y);
      if(oldBob>olderBob&&oldBob>f.body.position.y)peaks++;
    }
    olderBob=oldBob;oldBob=f.body.position.y;
    for(let i=0;i<4;i++){
      const paw=f.paws[i],foot=f.gait.feet[i],prev=previous[i];
      const x=f.root.position.x+2.1*(paw.position.x*c+paw.position.z*s);
      const z=f.root.position.z+2.1*(-paw.position.x*s+paw.position.z*c);
      const continued=foot.stance&&prev.stance&&foot.phase>=prev.phase;
      if(measured){
        if(foot.stance)stanceSamples++;
        if(paw.position.y<=.003)nearFloorSamples++;
        if(paw.position.y<=.003&&prev.y<=.003&&foot.phase>=prev.phase){
          nearFloorDrift+=Math.hypot(x-prev.x,z-prev.z);nearFloorTravel+=speed*dt;
        }
        if(foot.stance&&!continued){prev.active=true;prev.slip=0;prev.travel=0;prev.samples=0;}
        if(continued){
          adjacentSamples++;
          if(prev.active){prev.slip+=Math.hypot(x-prev.x,z-prev.z);prev.travel+=speed*dt;prev.samples++;}
        }
        if(!foot.stance&&prev.stance&&prev.active){
          completeContacts++;fullSlip+=prev.slip;fullTravel+=prev.travel;completeSamples+=prev.samples;prev.active=false;
        }
      }else prev.active=false;
      prev.x=x;prev.z=z;prev.y=paw.position.y;prev.stance=foot.stance;prev.phase=foot.phase;
    }
  }
  return {speed,fps,diagonal,cadence:f.gait.cadence,bobPeakToPeak:maxBob-minBob,bobPeaksPerSecond:peaks/4,
    contactCoverage:stanceSamples/(fps*4*4),completeContacts,completeSamples,adjacentSamples,
    wholeContactSlipRatio:fullTravel>0?fullSlip/fullTravel:null,
    nearFloorCoverage:nearFloorSamples/(fps*4*4),nearFloorDriftRatio:nearFloorTravel>0?nearFloorDrift/nearFloorTravel:null};
}

test('Whole support intervals stop dragging; short fast contacts and calm body are quantified against archived v2',()=>{
  const reports=[];
  for(const speed of [2000/95*.25,2000/95*.5,2000/95,42]){
    const referenceBefore=strideMetrics(PreviousGait,speed,960);
    const referenceAfter=strideMetrics(BiterGait,speed,960);
    // The 960Hz reference resolves each entire contact, including contacts
    // shorter than one 30/60Hz frame. Low sample counts never become fake 0%.
    assert.ok(referenceAfter.completeContacts>=30&&referenceAfter.completeSamples>100);
    assert.ok(referenceAfter.wholeContactSlipRatio<1e-7);
    assert.ok(referenceBefore.wholeContactSlipRatio>.5);
    assert.ok(referenceAfter.nearFloorDriftRatio<referenceBefore.nearFloorDriftRatio*.75,
      'Near-floor transfers improve too; measuring only short zero-height contacts would hide visible sliding');
    assert.ok(referenceAfter.contactCoverage>.03&&referenceAfter.contactCoverage<.20);
    assert.ok(referenceAfter.bobPeakToPeak<referenceBefore.bobPeakToPeak*.3);
    assert.ok(referenceAfter.bobPeaksPerSecond<referenceBefore.bobPeaksPerSecond*.6);
    if(speed>20)assert.ok(referenceAfter.bobPeakToPeak<.001);
    const renderSampling=[];
    for(const fps of [15,30,60,120])for(const diagonal of [false,true]){
      const sampled=strideMetrics(BiterGait,speed,fps,diagonal);
      if(sampled.wholeContactSlipRatio!==null)assert.ok(sampled.wholeContactSlipRatio<1e-7);
      renderSampling.push({fps,diagonal,contactCoverage:sampled.contactCoverage,
        completeContacts:sampled.completeContacts,completeSamples:sampled.completeSamples,
        continuingStanceSamples:sampled.adjacentSamples,slipRatio:sampled.wholeContactSlipRatio});
    }
    reports.push({before960Hz:referenceBefore,after960Hz:referenceAfter,renderSampling});
  }
  console.log(JSON.stringify({wholeStrideComparison:reports}));
});

test('Distance drives diagonal-pair steps independently of frame rate and direction; fast bursts have a cadence cap',()=>{
  for(const speed of [2000/95*.25,2000/95*.5,2000/95,42]){
    let expected;
    for(const fps of [15,30,60,120])for(const diagonal of [false,true]){
      const f=fixture(),dt=1/fps;
      let peak=0,lifted=false,planted=false;
      for(let frame=0;frame<fps*2;frame++){
        const step=speed*dt/(diagonal?Math.SQRT2:1);
        move(f,diagonal?step:0,step,dt);
        peak=Math.max(peak,f.body.position.y);
        lifted||=f.paws.some(p=>p.position.y>.01);
        planted||=f.paws.some(p=>p.position.y===0);
        assert.ok(f.gait.cadence<=7+1e-10);
        assert.ok(f.body.position.y>=0&&f.body.position.y<=.006+1e-10);
        assert.ok(Math.abs(f.body.rotation.x)<=.006&&Math.abs(f.body.rotation.z)<=.006);
        close(f.gait.feet[0].phase,f.gait.feet[3].phase);
        close(f.gait.feet[1].phase,f.gait.feet[2].phase);
        for(const p of f.paws){
          assert.ok(Math.hypot(p.position.x,p.position.z)<=.318+1e-10);
          assert.ok(p.position.y>=0&&p.position.y<=.026+1e-10);
        }
      }
      assert.ok(lifted&&peak>0&&f.gait.footfalls>0,'Feet still run even while the body is quiet');
      // A 12ms contact can fall entirely between 15/30Hz render frames.
      if(fps>=120)assert.ok(planted,'High-cadence presentation captures real contact');
      close(f.gait.distance,speed*2);
      if(expected===undefined)expected=f.gait.phase;
      // Phase wraps at a full cycle, so 0 and 1 agree numerically.
      const delta=Math.abs(f.gait.phase-expected);assert.ok(Math.min(delta,1-delta)<1e-8);
    }
  }
});

test('A stance foot stays planted within its short reach, and the logical root is never modified',()=>{
  const f=fixture(),point=new THREE.Vector3();
  move(f,0,.003);f.root.updateMatrixWorld(true);
  const foot=f.paws[0].getWorldPosition(new THREE.Vector3());
  for(let frame=0;frame<10;frame++){
    const expectedZ=f.root.position.z+.003;
    move(f,0,.003);f.root.updateMatrixWorld(true);f.paws[0].getWorldPosition(point);
    close(point.x,foot.x);close(point.y,foot.y);close(point.z,foot.z);
    close(f.root.position.z,expectedZ);close(f.root.position.y,0);
    close(f.root.rotation.x,0);close(f.root.rotation.z,0);close(f.root.scale.x,2.1);
  }
});

test('Stops and blocked movement settle without marching; restart reuses the travelled phase',()=>{
  const f=fixture();
  for(let i=0;i<31;i++)move(f,0,5/60);
  const phase=f.gait.phase,distance=f.gait.distance;
  let lastLift=Math.max(...f.paws.map(p=>p.position.y));
  for(let i=0;i<90;i++){
    move(f,0,0);close(f.gait.phase,phase);close(f.gait.distance,distance);
    const lift=Math.max(...f.paws.map(p=>p.position.y));assert.ok(lift<=lastLift+1e-10);lastLift=lift;
  }
  assert.equal(f.gait.activity,0);assert.equal(f.body.position.y,0);
  for(const p of f.paws){close(p.position.x,p.userData.homeX);close(p.position.z,p.userData.homeZ);close(p.position.y,0);}
  const stoppedPhase=f.gait.phase;
  move(f,0,.04);
  assert.ok(f.gait.phase>stoppedPhase&&f.gait.phase-stoppedPhase<=.04/1.65);
  for(const p of f.paws)assert.ok(p.position.distanceTo(new THREE.Vector3(p.userData.homeX,0,p.userData.homeZ))<.09);
});

test('Cold/restarts near a cycle boundary do not snap a planted foot forward; interrupted transfers stay continuous',()=>{
  for(const phase of [.01,.25,.49,.74,.90,.99,.999]){
    const f=fixture();f.gait.totalPhase=f.gait.phase=phase;
    const world=f.paws.map(p=>p.position.clone().multiplyScalar(2.1));
    move(f,0,(2000/95*.5)/240,1/240);
    // The first 4ms is shorter than the initial physical support stroke.
    // A nearby cycle boundary must not create a new front-foot touchdown.
    for(let i=0;i<4;i++){
      assert.equal(f.gait.feet[i].stance,true);
      close(f.paws[i].position.z*2.1+f.root.position.z,world[i].z);
    }
  }
  const f=fixture();
  for(let frame=0;frame<500;frame++){
    const dt=1/240,walking=frame%17!==0,direction=frame%90<45?1:-1;
    const previous=f.paws.map(p=>p.position.clone());
    move(f,0,walking?direction*(2000/95*.5)*dt:0,dt);
    for(let i=0;i<4;i++){
      const p=f.paws[i];
      assert.ok(p.position.distanceTo(previous[i])<.03,`Short interrupted transfer jump: frame ${frame}, paw ${i}, delta ${p.position.distanceTo(previous[i])}, phase ${f.gait.phase}`);
      assert.ok(p.position.y>=0&&p.position.y<=.026+1e-10);
      assert.ok(Math.hypot(p.position.x,p.position.z)<=.31601);
    }
  }
});

test('Real reversal and changing speed never stretch contacts or shake the body',()=>{
  for(const fps of [15,30,60,120]){
    const f=fixture();
    for(let frame=0;frame<fps*4;frame++){
      const sign=Math.floor(frame/fps)%2?-1:1;
      const speed=frame<fps?2000/95*.25:frame<fps*2?2000/95*.5:frame<fps*3?2000/95:42;
      f.root.rotation.y+=Math.atan2(Math.sin((sign<0?Math.PI:0)-f.root.rotation.y),Math.cos((sign<0?Math.PI:0)-f.root.rotation.y))*(1-Math.exp(-18/fps));
      move(f,0,sign*speed/fps,1/fps);
      assert.ok(f.gait.cadence<7&&f.body.position.y<.006);
      for(const p of f.paws){
        assert.ok(Math.hypot(p.position.x,p.position.z)<.31601);
        assert.ok(Math.hypot(p.position.x-p.userData.homeX,p.position.z-p.userData.homeZ)<.06801);
        assert.ok(p.position.y>=0&&p.position.y<=.02601);
      }
    }
  }
});

test('Turns keep paw reach bounded; paused poses freeze and resume without a phase jump',()=>{
  const f=fixture();
  for(let i=0;i<60;i++){
    f.root.rotation.y=Math.min(Math.PI/2,i/60*Math.PI/2);
    move(f,Math.sin(f.root.rotation.y)*5/60,Math.cos(f.root.rotation.y)*5/60);
    assert.ok(Math.abs(f.body.rotation.z)<.023);
    for(const p of f.paws)assert.ok(Math.hypot(p.position.x-p.userData.homeX,p.position.z-p.userData.homeZ)<=.069);
  }
  const before=f.gait.diagnostics();
  for(let i=0;i<120;i++)f.gait.update(f.root,f.player,f.time,1/60,true);
  assert.deepEqual(f.gait.diagnostics(),before);
  f.gait.update(f.root,f.player,f.time,1/60);
  assert.deepEqual(f.gait.diagnostics(),before,'Repeated presentation of the same game time is frozen');
  move(f,.01,0);assert.ok(f.gait.phase>before.phase&&f.gait.phase-before.phase<=.01/1.65);
});

test('Death, hiding, resets, and teleports cannot turn into footsteps or leave detached animated paws',()=>{
  for(const state of ['dead','hidden']){
    const f=fixture();for(let i=0;i<12;i++)move(f,0,.1);
    f.player[state]=true;move(f,0,.1);
    assert.equal(f.gait.distance,0);assert.equal(f.gait.phase,0);assert.equal(f.gait.activity,0);
    assert.equal(f.body.position.y,0);
    for(const p of f.paws){close(p.position.y,0);close(p.rotation.x,0);}
    f.player[state]=false;f.root.position.set(30,0,-30);move(f,0,0);
    assert.equal(f.gait.distance,0);assert.equal(f.gait.phase,0);
    move(f,.05,0);close(f.gait.distance,.05);
  }
  const f=fixture();move(f,0,.1);move(f,20,0);
  assert.equal(f.gait.distance,0);assert.equal(f.gait.phase,0);
  move(f,.1,0);close(f.gait.distance,.1);
  f.gait.reset();move(f,100,100);assert.equal(f.gait.distance,0);
  f.time=-100;f.gait.update(f.root,f.player,f.time,1/60);assert.equal(f.gait.distance,0);
});

test('Actual sculpted paws and body remain above the floor and inside the player envelope while trotting and biting',()=>{
  const look=createCrystalBiter(),root=look.model,player={dead:false,hidden:false};
  const gait=new BiterGait({body:root.userData.bodyRig,paws:root.userData.paws});
  const inverse=new THREE.Matrix4(),relative=new THREE.Matrix4(),v=new THREE.Vector3(),meshes=[];
  root.traverse(o=>{if(o.isMesh)meshes.push(o);});root.scale.setScalar(2.1);
  let time=0,minY=Infinity,maxRadius=0,maxY=0;
  gait.update(root,player,time,1/60);
  for(const speed of [2.5,5,10,21,42])for(let frame=0;frame<90;frame++){
    const dt=1/60,yaw=frame/90*Math.PI*2;
    root.rotation.y=yaw;root.position.x+=Math.sin(yaw)*speed*dt;root.position.z+=Math.cos(yaw)*speed*dt;
    time+=dt*1000;gait.update(root,player,time,dt);
    root.userData.jaw.rotation.x=.30*(.5+.5*Math.sin(frame*.25));root.userData.applyPose();
    root.updateMatrixWorld(true);inverse.copy(root.matrixWorld).invert();
    for(const mesh of meshes){
      relative.multiplyMatrices(inverse,mesh.matrixWorld);
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        v.fromBufferAttribute(positions,i).applyMatrix4(relative);
        minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);maxRadius=Math.max(maxRadius,Math.hypot(v.x,v.z));
      }
    }
  }
  assert.ok(minY>=-1e-6,`No animated vertices dip through the floor: ${minY}`);
  assert.ok(maxRadius<=.414001,`Animated geometry fits the player footprint: ${maxRadius}`);
  assert.ok(maxY<.8,`The low silhouette survives the body spring: ${maxY}`);
  console.log(JSON.stringify({gaitGeometry:{minimumY:minY,maximumRadius:maxRadius,maximumY:maxY}}));
  look.dispose();
});
