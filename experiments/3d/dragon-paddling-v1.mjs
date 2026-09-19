import * as THREE from './vendor/three.module.min.js';

// Secondary joint animation only. DragonMotion owns the route bones; this
// swimmer never moves the contact root, head, jaw, wings or a shoulder pivot.
const TAU=Math.PI*2;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const smooth=x=>x*x*(3-2*x);

export class DragonPaddling{
  constructor({rig}){
    if(rig?.paws?.length!==4)throw new Error('Dragon paddling requires four permanent shoulder pivots');
    this.feet=rig.paws.map(({pivot,side,front,restQuaternion})=>({
      pivot,side,front,rest:restQuaternion.clone(),
      // Diagonal pairs alternate, with no phase reset on a corner or a cell.
      offset:(side>0?Math.PI:0)+(front?0:Math.PI)
    }));
    this.offsetRotation=new THREE.Euler();this.offsetQuaternion=new THREE.Quaternion();
    this.reset();
  }
  reset(){
    this.lastTime=null;this.lastX=0;this.lastZ=0;this.generation=null;this.level=null;this.routeEpoch=null;
    this.phase=0;this.totalCycles=0;this.speed=0;this.activity=0;this.cadence=0;this.sweep=0;this.tuck=0;
    this.wasDead=false;this.wasPaused=false;
    for(const foot of this.feet)foot.pivot.quaternion.copy(foot.rest);
  }
  anchor(root,snapshot,player){
    this.lastX=root.position.x;this.lastZ=root.position.z;this.lastTime=snapshot.time??0;
    this.generation=snapshot.generation??null;this.level=snapshot.level??null;this.routeEpoch=player.route?.epoch??null;
  }
  update(root,player,snapshot,elapsed){
    if(!player)return;
    if(player.dead||player.hidden){this.wasDead=true;return;}
    const time=snapshot.time??0;
    if(this.wasDead||this.lastTime!==null&&(time<this.lastTime||this.generation!==(snapshot.generation??null)||
      this.level!==(snapshot.level??null)||this.routeEpoch!==(player.route?.epoch??null)))this.reset();
    if(this.lastTime===null){this.anchor(root,snapshot,player);return;}
    if(snapshot.paused){this.wasPaused=true;this.anchor(root,snapshot,player);return;}
    // A resumed frame must not integrate the time spent paused.
    if(this.wasPaused){this.wasPaused=false;this.anchor(root,snapshot,player);return;}
    const distance=Math.hypot(root.position.x-this.lastX,root.position.z-this.lastZ);
    if(!Number.isFinite(distance)||distance>Math.max(2.5,elapsed*80)){
      this.reset();this.anchor(root,snapshot,player);return;
    }
    this.anchor(root,snapshot,player);
    if(!Number.isFinite(elapsed)||elapsed<=0||elapsed>.25)return;
    const dt=Math.min(elapsed,.05),measuredSpeed=distance/elapsed,moving=measuredSpeed>.07;
    this.speed+=(measuredSpeed-this.speed)*(1-Math.exp(-10*dt));
    // 95% engagement in .3 s, 95% withdrawal in .5 s. Blocked input has no
    // travel, so the paws settle even if the direction key remains held.
    const target=moving?clamp(measuredSpeed/.75,0,1):0;
    this.activity+=(target-this.activity)*(1-Math.exp(-(target>this.activity?10:6)*dt));
    if(this.activity<.00001){this.activity=0;this.cadence=0;this.sweep=0;this.tuck=0;
      for(const foot of this.feet)foot.pivot.quaternion.copy(foot.rest);return;}
    const glide=smooth(clamp((this.speed-7)/17,0,1));
    // Real-time cadence saturates at 1.10 Hz. Increasing game speed changes
    // the relaxed gliding posture, never turns the paws into a fast treadmill.
    this.cadence=.92+.18*clamp(this.speed/14,0,1);
    this.totalCycles+=this.cadence*dt;this.phase=(this.phase+this.cadence*dt)%1;
    this.sweep=.145-.065*glide;this.tuck=.075*glide;
    for(const foot of this.feet){
      const angle=this.phase*TAU+foot.offset;
      const x=(this.tuck+Math.sin(angle)*this.sweep)*this.activity;
      const z=foot.side*(Math.cos(angle)*(.03-.01*glide)-.005*glide)*this.activity;
      this.offsetRotation.set(x,0,z,'XYZ');this.offsetQuaternion.setFromEuler(this.offsetRotation);
      foot.pivot.quaternion.copy(foot.rest).multiply(this.offsetQuaternion);
    }
  }
  diagnostics(){return {phase:this.phase,cycles:this.totalCycles,speed:this.speed,activity:this.activity,
    cadence:this.cadence,sweep:this.sweep,tuck:this.tuck,paused:this.wasPaused};}
}
