import * as THREE from './vendor/three.module.min.js';

// Secondary joint animation only. DragonMotion owns the route bones; this
// swimmer never moves the contact root, head, jaw, wings or shoulder origins.
// Shoulder pitch / outward shoulder roll / elbow flex / wrist compensation.
// Return, reach, power stroke and folded recovery all keep rigid segment lengths.
const POSES=[[-.10,.07,.50,-.30],[-.42,.13,-.22,.40],[.38,.08,.15,-.20],[.22,-.08,1.10,-1.15]];
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const smooth=x=>x*x*(3-2*x);

export class DragonPaddling{
  constructor({rig}){
    if(rig?.paws?.length!==4)throw new Error('Dragon paddling requires four permanent shoulder pivots');
    this.feet=rig.paws.map(({pivot,elbow,wrist,side,front,joints,tip})=>{
      if(!elbow||!wrist||!joints||!tip)throw new Error('Dragon paddling requires shoulder, elbow and wrist joints');
      return {pivot,elbow,wrist,side,front,joints,tip,offset:(side>0?.5:0)+(front?0:.61)};
    });
    this.offsetRotation=new THREE.Euler();this.offsetQuaternion=new THREE.Quaternion();
    this.reset();
  }
  reset(){
    this.lastTime=null;this.lastX=0;this.lastZ=0;this.generation=null;this.level=null;this.routeEpoch=null;
    this.phase=0;this.totalCycles=0;this.speed=0;this.activity=0;this.cadence=0;this.sweep=0;this.tuck=0;
    this.wasDead=false;this.wasPaused=false;
    for(const foot of this.feet)for(const joint of foot.joints)joint.object.quaternion.copy(joint.restQuaternion);
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
      for(const foot of this.feet)for(const joint of foot.joints)joint.object.quaternion.copy(joint.restQuaternion);return;}
    const glide=smooth(clamp((this.speed-5)/17,0,1));
    // A faster dragon keeps the same readable reach. Only the recovery timing
    // and a modest cadence change, instead of erasing the stroke amplitude.
    this.cadence=1.02+.24*clamp(this.speed/21,0,1);
    this.totalCycles+=this.cadence*dt;this.phase=(this.phase+this.cadence*dt)%1;
    this.pose(this.phase,this.activity,glide);
  }
  pose(phase,activity=1,glide=0){
    this.sweep=.80;this.tuck=glide;
    const reachEnd=.24-.035*glide,strokeEnd=.59+.045*glide,foldEnd=.79+.025*glide;
    for(const foot of this.feet){
      const t=((phase+foot.offset)%1+1)%1;
      let a,b,u;
      if(t<reachEnd){a=0;b=1;u=t/reachEnd;}
      else if(t<strokeEnd){a=1;b=2;u=(t-reachEnd)/(strokeEnd-reachEnd);}
      else if(t<foldEnd){a=2;b=3;u=(t-strokeEnd)/(foldEnd-strokeEnd);}
      else{a=3;b=0;u=(t-foldEnd)/(1-foldEnd);}
      u=smooth(u);
      const gain=(foot.front?1:.87)*activity;
      const shoulder=(POSES[a][0]+(POSES[b][0]-POSES[a][0])*u)*gain;
      const spread=(POSES[a][1]+(POSES[b][1]-POSES[a][1])*u)*gain*foot.side;
      const elbow=(POSES[a][2]+(POSES[b][2]-POSES[a][2])*u)*gain;
      const wrist=(POSES[a][3]+(POSES[b][3]-POSES[a][3])*u)*gain;
      this.setJoint(foot.joints[0],shoulder,spread);
      this.setJoint(foot.joints[1],elbow,0);
      this.setJoint(foot.joints[2],wrist,0);
    }
  }
  setJoint(joint,x,z){
    this.offsetRotation.set(x,0,z,'XYZ');this.offsetQuaternion.setFromEuler(this.offsetRotation);
    joint.object.quaternion.copy(joint.restQuaternion).multiply(this.offsetQuaternion);
  }

  diagnostics(){return {phase:this.phase,cycles:this.totalCycles,speed:this.speed,activity:this.activity,
    cadence:this.cadence,sweep:this.sweep,tuck:this.tuck,paused:this.wasPaused};}
}
