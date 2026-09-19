import * as THREE from './vendor/three.module.min.js';
import {dragonSegmentClear} from './dragon-motion.mjs';

// Distance-driven four-beat gait: world-space support, short low recovery,
// level touchdown. Route bones and gameplay still own the body and contact root.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>x*x*(3-2*x);
const GROUND=.002,HALF_STRIDE=.30;
export class DragonPaddling{
  constructor({rig,walls=[]}){
    if(rig?.paws?.length!==4)throw new Error('Dragon gait requires four articulated legs');
    this.root=rig.model;this.walls=walls;this.nearWalls=[];
    this.feet=rig.paws.map(p=>{
      const upper=p.elbow.position.clone(),lower=p.wrist.position.clone();
      return {...p,upper,lower,a:upper.length(),b:lower.length(),
        neutral:p.pivot.position.clone().add(upper).add(lower),
        // A short hind-leg delay opens a four-beat rhythm: the fore paw clears
        // the shared side before the hind paw comes forward beneath it.
        offset:(p.side>0?.5:0)+(p.front?0:.30),anchor:new THREE.Vector3(),
        target:new THREE.Vector3(),desired:new THREE.Vector3(),lastTarget:new THREE.Vector3(),neutralWorld:new THREE.Vector3(),
        inverse:new THREE.Matrix4(),stance:false,initialized:false,released:false};
    });
    this.v=new THREE.Vector3();this.direction=new THREE.Vector3();this.pole=new THREE.Vector3();
    this.knee=new THREE.Vector3();this.hipWorld=new THREE.Vector3();this.kneeWorld=new THREE.Vector3();
    this.ankleWorld=new THREE.Vector3();this.pawCenter=new THREE.Vector3();this.local=new THREE.Vector3();
    this.q=new THREE.Quaternion();this.reset();
  }
  reset(){
    this.lastTime=null;this.lastX=0;this.lastZ=0;this.generation=null;this.level=null;this.routeEpoch=null;
    this.phase=.28;this.totalCycles=0;this.speed=0;this.activity=0;this.cadence=0;this.duty=.56;
    this.wasDead=false;this.wasPaused=false;this.scale=2.1;this.compactness=0;this.visualLength=2;this.halfStride=HALF_STRIDE;
    for(const foot of this.feet){foot.initialized=false;foot.stance=false;foot.released=false;
      for(const joint of foot.joints)joint.object.quaternion.copy(joint.restQuaternion);}
  }
  anchor(root,snapshot,player){
    this.lastX=root.position.x;this.lastZ=root.position.z;this.lastTime=snapshot.time??0;
    this.generation=snapshot.generation??null;this.level=snapshot.level??null;this.routeEpoch=player.route?.epoch??null;
  }
  prepare(root,walls=this.walls){
    this.root=root;this.scale=root.scale.x;this.walls=walls??[];this.nearWalls.length=0;
    this.compactness=root.userData.dragonCompactness??0;
    this.visualLength=root.userData.dragonVisualLength??2-this.compactness;
    this.halfStride=THREE.MathUtils.lerp(HALF_STRIDE,.14,this.compactness);
    const reach=Math.max(5,this.visualLength*2+1);
    for(const w of this.walls)if(w.maxX>root.position.x-reach&&w.minX<root.position.x+reach&&
      w.maxZ>root.position.z-reach&&w.minZ<root.position.z+reach)this.nearWalls.push(w);
    root.updateWorldMatrix(true,true);
    for(const f of this.feet){
      f.inverse.copy(f.pivot.parent.matrixWorld).invert();
      f.neutralWorld.copy(f.neutral);
      if(!f.front)f.neutralWorld.z+=.10*this.compactness;
      f.neutralWorld.applyMatrix4(f.pivot.parent.matrixWorld);
      f.neutralWorld.y=GROUND+f.soleOffset*this.scale;
    }
  }
  update(root,player,snapshot,elapsed,walls=this.walls){
    if(!player)return;
    if(player.dead||player.hidden){this.wasDead=true;return;}
    const time=snapshot.time??0;
    if(this.wasDead||this.lastTime!==null&&(time<this.lastTime||this.generation!==(snapshot.generation??null)||
      this.level!==(snapshot.level??null)||this.routeEpoch!==(player.route?.epoch??null)))this.reset();
    if(snapshot.paused&&this.lastTime!==null){this.wasPaused=true;this.anchor(root,snapshot,player);return;}
    if(this.wasPaused){this.wasPaused=false;this.anchor(root,snapshot,player);return;}
    const first=this.lastTime===null,distance=first?0:Math.hypot(root.position.x-this.lastX,root.position.z-this.lastZ);
    if(!Number.isFinite(distance)||distance>Math.max(2.5,elapsed*80)){
      this.reset();this.update(root,player,snapshot,0,walls);return;
    }
    const previousForm=this.visualLength;
    this.anchor(root,snapshot,player);this.prepare(root,walls);
    const changingForm=Math.abs(this.visualLength-previousForm)>.00001;
    const dt=Number.isFinite(elapsed)&&elapsed>0&&elapsed<=.25?elapsed:0;
    this.speed=dt?distance/dt:0;const moving=this.speed>.07;
    const profile=clamp((this.speed-5.263)/15.789,0,1);
    this.duty=.56-.16*profile;
    this.activity+=(Number(moving)-this.activity)*(1-Math.exp(-24*dt));
    if(this.activity<.00001)this.activity=0;
    // ~4.2 full strides/sec at 1x: a slightly shorter, better separated stride.
    // Blocked keys cannot cause running in place.
    this.cadence=moving?this.speed*this.duty/(2*this.halfStride*this.scale):0;
    const cycles=moving?distance*this.duty/(2*this.halfStride*this.scale):0;
    this.totalCycles+=cycles;this.phase=(this.phase+cycles)%1;
    for(const f of this.feet){
      if(first||!f.initialized||changingForm){
        if(changingForm&&moving)this.trajectory(f,(this.phase+f.offset-(f.front?0:.18*this.compactness))%1,1,profile);
        else f.target.copy(f.neutralWorld);
        f.anchor.copy(f.target);f.lastTarget.copy(f.target);
        f.initialized=true;f.stance=false;
      }else if(!moving){
        // Preserve support locations; put any lifted feet down promptly.
        f.target.copy(f.lastTarget);f.target.y+=(f.neutralWorld.y-f.target.y)*(1-Math.exp(-28*dt));
        if(Math.abs(f.target.y-f.neutralWorld.y)<.0001)f.target.y=f.neutralWorld.y;
        f.stance=true;f.anchor.copy(f.target);f.released=false;
      }else{
        const t=(this.phase+f.offset-(f.front?0:.18*this.compactness))%1,stance=t<this.duty;
        this.trajectory(f,t,1,profile);
        if(stance){
          if(!f.stance){f.anchor.copy(f.target);f.released=false;}
          if(!f.released){
            this.local.copy(f.anchor).applyMatrix4(f.inverse).sub(f.pivot.position);
            // Replant after an instant reversal, rather than stretching bones.
            if(this.local.length()>f.a+f.b-.008)f.released=true;
            else f.target.copy(f.anchor);
          }
        }
        f.stance=stance;
      }
      this.place(f);f.lastTarget.copy(f.target);
    }
  }
  trajectory(f,t,activity,profile){
    const stance=t<this.duty,u=stance?t/this.duty:(t-this.duty)/(1-this.duty);
    const stride=this.halfStride;
    let z=stride*(1-2*u),lift=0;
    if(!stance){
      // Hermite return matches support velocity at both ends. Only 10–16 cm
      // clearance, and zero vertical velocity at touchdown and toe-off.
      const m=-2*stride*(1-this.duty)/this.duty;
      z=-stride+2*stride*smooth(u)+m*u*(1-u)*(1-2*u);
      lift=(.10+.06*profile)*Math.sin(Math.PI*u)**2;
    }
    f.target.copy(f.neutral);f.target.z+=z*activity;
    if(!f.front)f.target.z+=.10*this.compactness;
    f.target.applyMatrix4(f.pivot.parent.matrixWorld);
    f.target.y=GROUND+f.soleOffset*this.scale+lift*activity;
  }
  pose(phase,activity=1,profile=0){
    this.prepare(this.root);this.duty=.56-.16*profile;
    for(const f of this.feet){this.trajectory(f,((phase+f.offset-(f.front?0:.18*this.compactness))%1+1)%1,activity,profile);this.place(f);}
  }
  solve(f){
    this.local.copy(f.target).applyMatrix4(f.inverse).sub(f.pivot.position);
    const distance=clamp(this.local.length(),Math.abs(f.a-f.b)+.0001,f.a+f.b-.0001);
    this.direction.copy(this.local).normalize();
    this.pole.set(f.side*THREE.MathUtils.lerp(.40,.70,this.compactness),-.12,
      THREE.MathUtils.lerp(f.front?-1:.85,f.front?-.25:.25,this.compactness));
    this.pole.addScaledVector(this.direction,-this.pole.dot(this.direction)).normalize();
    const along=(f.a*f.a-f.b*f.b+distance*distance)/(2*distance);
    this.knee.copy(this.direction).multiplyScalar(along).addScaledVector(this.pole,Math.sqrt(Math.max(0,f.a*f.a-along*along)));
    f.pivot.quaternion.setFromUnitVectors(this.v.copy(f.upper).normalize(),this.local.copy(this.knee).normalize());
    this.v.copy(this.direction).multiplyScalar(distance).sub(this.knee).normalize();
    this.q.copy(f.pivot.quaternion).invert();this.v.applyQuaternion(this.q);
    f.elbow.quaternion.setFromUnitVectors(this.direction.copy(f.lower).normalize(),this.v);
    // Cancel leg flexion at the ankle to keep a flat sole.
    f.wrist.quaternion.copy(f.pivot.quaternion).multiply(f.elbow.quaternion).invert();
    f.pivot.updateWorldMatrix(false,true);
  }
  clear(f){
    if(!this.nearWalls.length)return true;
    f.pivot.getWorldPosition(this.hipWorld);f.elbow.getWorldPosition(this.kneeWorld);f.wrist.getWorldPosition(this.ankleWorld);
    this.pawCenter.set(0,0,.062).applyMatrix4(f.wrist.matrixWorld);
    return dragonSegmentClear(this.hipWorld,this.kneeWorld,f.clearance.upper*this.scale,this.nearWalls)&&
      dragonSegmentClear(this.kneeWorld,this.ankleWorld,f.clearance.lower*this.scale,this.nearWalls)&&
      dragonSegmentClear(this.pawCenter,this.pawCenter,f.clearance.paw*this.scale,this.nearWalls);
  }
  place(f){
    this.solve(f);
    if(this.clear(f))return;
    // Find the longest clear step continuously instead of switching between
    // half/quarter strides, which makes toes jump when skimming a corner.
    f.desired.copy(f.target);f.released=true;let lo=0,hi=1;
    for(let i=0;i<9;i++){
      const t=(lo+hi)/2;f.target.lerpVectors(f.neutralWorld,f.desired,t);this.solve(f);
      if(this.clear(f))lo=t;else hi=t;
    }
    f.target.lerpVectors(f.neutralWorld,f.desired,lo);this.solve(f);
  }
  diagnostics(){return {kind:'grounded-four-beat',phase:this.phase,cycles:this.totalCycles,speed:this.speed,activity:this.activity,
    cadence:this.cadence,duty:this.duty,stride:2*this.halfStride*this.scale,paused:this.wasPaused,
    contacts:this.feet.map(f=>f.stance&&!f.released)};}
}
