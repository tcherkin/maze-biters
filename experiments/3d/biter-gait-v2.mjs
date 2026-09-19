// A small visual trot, independent of simulation state and the actor root.
// Four permanently allocated feet: front left/right, then rear left/right.
// The body and feet use native model units; only the tracked position is world
// space. Short stance anchors improve contact without stretching tiny legs to
// match the game's much longer, fast arcade steps.
const TAU=Math.PI*2;
const STANCE=.54;
const REACH=.068;
const MAX_CENTER=.318;
const CYCLE_DISTANCE=1.65;
const MAX_CADENCE=8.5;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const smooth=v=>v*v*(3-2*v);

export class BiterGait{
  constructor({body,paws,scale=2.1}){
    if(paws.length!==4)throw new Error('Biter gait needs four permanent paw groups');
    this.body=body;this.scale=scale;
    this.feet=paws.map((paw,i)=>({paw,homeX:paw.userData.homeX??paw.position.x,
      homeZ:paw.userData.homeZ??paw.position.z,offset:i===0||i===3?0:.5,
      anchorX:0,anchorZ:0,fromX:0,fromZ:0,stance:true,phase:0}));
    this.reset();
  }
  reset(){
    this.lastTime=null;this.lastX=0;this.lastZ=0;this.lastYaw=0;
    this.phase=0;this.distance=0;this.activity=0;this.speed=0;this.cadence=0;
    this.pitch=0;this.roll=0;this.footfalls=0;this.moving=false;
    this.settleImmediately();
  }
  settleImmediately(){
    this.body.position.y=0;this.body.rotation.x=0;this.body.rotation.z=0;
    for(let i=0;i<4;i++){
      const f=this.feet[i];f.paw.position.set(f.homeX,0,f.homeZ);
      f.paw.rotation.x=0;f.stance=true;f.phase=(this.phase+f.offset)%1;
    }
  }
  anchor(root,time){
    this.lastX=root.position.x;this.lastZ=root.position.z;this.lastYaw=root.rotation.y;this.lastTime=time;
    const s=Math.sin(this.lastYaw),c=Math.cos(this.lastYaw);
    for(let i=0;i<4;i++){
      const f=this.feet[i],p=f.paw.position;
      f.anchorX=this.lastX+this.scale*(p.x*c+p.z*s);
      f.anchorZ=this.lastZ+this.scale*(-p.x*s+p.z*c);
      f.fromX=p.x;f.fromZ=p.z;
    }
  }
  update(root,player,time,dt,paused=false){
    if(!player||player.dead||player.hidden){
      // Predation may change the root afterwards. Never retain walking feet
      // below a swallowed actor, nor interpret respawn as a travelled route.
      this.reset();return;
    }
    if(paused||time===this.lastTime)return;
    if(this.lastTime===null||time<this.lastTime){this.anchor(root,time);return;}
    const dx=root.position.x-this.lastX,dz=root.position.z-this.lastZ,distance=Math.hypot(dx,dz);
    if(!Number.isFinite(distance)||!Number.isFinite(dt)||dt<=0||distance>Math.max(2.4,dt*50)){
      this.reset();this.anchor(root,time);return;
    }
    const seconds=Math.min(dt,.1),moving=distance>1e-6;
    const yaw=root.rotation.y,s=Math.sin(yaw),c=Math.cos(yaw);
    const speed=distance/seconds,oldSpeed=this.speed;
    const ease=1-Math.exp(-14*seconds);
    this.speed+=(speed-this.speed)*ease;
    this.activity+=((moving?Math.min(1,speed/.8):0)-this.activity)*ease;
    if(this.activity<1e-5)this.activity=0;
    const phaseStep=moving?Math.min(distance/CYCLE_DISTANCE,MAX_CADENCE*seconds):0;
    this.phase=(this.phase+phaseStep)%1;this.distance+=distance;
    this.cadence=phaseStep/seconds;
    const turn=Math.atan2(Math.sin(yaw-this.lastYaw),Math.cos(yaw-this.lastYaw))/seconds;
    const pitchTarget=moving?(.008+clamp((this.speed-oldSpeed)/seconds*.0009,-.014,.018))*this.activity:0;
    const rollTarget=moving?clamp(-turn*.005,-.022,.022)*this.activity:0;
    this.pitch+=(pitchTarget-this.pitch)*ease;this.roll+=(rollTarget-this.roll)*ease;
    this.body.position.y=this.activity*.009*(1-Math.cos(this.phase*TAU*2));
    this.body.rotation.x=this.pitch;this.body.rotation.z=this.roll;
    const forwardX=moving?(dx*c-dz*s)/distance:0,forwardZ=moving?(dx*s+dz*c)/distance:1;
    for(let i=0;i<4;i++){
      const f=this.feet[i],p=f.paw.position;
      if(!moving){
        // Freeze the travelled phase and gently place the paws, rather than
        // playing a walk cycle in place after a stop or against a wall.
        p.x+=(f.homeX-p.x)*ease;p.z+=(f.homeZ-p.z)*ease;p.y*=1-ease;
        f.paw.rotation.x*=1-ease;
        f.anchorX=root.position.x+this.scale*(p.x*c+p.z*s);
        f.anchorZ=root.position.z+this.scale*(-p.x*s+p.z*c);
        if(this.activity===0){p.set(f.homeX,0,f.homeZ);f.paw.rotation.x=0;f.stance=true;}
        continue;
      }
      const footPhase=(this.phase+f.offset)%1,stance=footPhase<STANCE;
      const toX=f.homeX+forwardX*REACH,toZ=f.homeZ+forwardZ*REACH;
      if(!this.moving){
        // Starting again keeps the pose and reanchors it; no phase reset or
        // old world-space anchor may jerk a foot across the floor.
        f.anchorX=root.position.x+this.scale*(p.x*c+p.z*s);
        f.anchorZ=root.position.z+this.scale*(-p.x*s+p.z*c);
        f.fromX=p.x;f.fromZ=p.z;f.stance=stance;
      }
      if(stance){
        if(!f.stance){
          f.anchorX=root.position.x+this.scale*(toX*c+toZ*s);
          f.anchorZ=root.position.z+this.scale*(-toX*s+toZ*c);
          this.footfalls++;
        }
        const ax=(f.anchorX-root.position.x)/this.scale,az=(f.anchorZ-root.position.z)/this.scale;
        p.x=ax*c-az*s;p.z=ax*s+az*c;p.y=0;f.paw.rotation.x=0;
      }else{
        if(f.stance){f.fromX=p.x;f.fromZ=p.z;}
        const u=(footPhase-STANCE)/(1-STANCE),blend=smooth(u);
        p.x=f.fromX+(toX-f.fromX)*blend;p.z=f.fromZ+(toZ-f.fromZ)*blend;
        const lift=Math.sin(Math.PI*u);
        p.y=.036*lift*lift*this.activity;f.paw.rotation.x=.15*Math.sin(TAU*u)*this.activity;
      }
      let ox=p.x-f.homeX,oz=p.z-f.homeZ,reach=Math.hypot(ox,oz);
      if(reach>REACH){p.x=f.homeX+ox*REACH/reach;p.z=f.homeZ+oz*REACH/reach;}
      const radius=Math.hypot(p.x,p.z);
      if(radius>MAX_CENTER){p.x*=MAX_CENTER/radius;p.z*=MAX_CENTER/radius;}
      f.phase=footPhase;f.stance=stance;
    }
    this.moving=moving;this.lastX=root.position.x;this.lastZ=root.position.z;this.lastYaw=yaw;this.lastTime=time;
  }
  // Allocations here are deliberate, on demand for tests/diagnostics only.
  diagnostics(){return {phase:this.phase,distance:this.distance,activity:this.activity,
    bodyY:this.body.position.y,pitch:this.pitch,roll:this.roll,speed:this.speed,cadence:this.cadence,
    footfalls:this.footfalls,paws:this.feet.map(f=>({x:f.paw.position.x,y:f.paw.position.y,
      z:f.paw.position.z,stance:f.stance,phase:f.phase}))};}
}
