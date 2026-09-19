// Independent turtle tuning of the proven BiterGait contact algorithm.
// World displacement, planted anchors and presentation ordering are unchanged.
// Contacts have a finite physical stroke: a foot
// lifts when that stroke ends, instead of being clamped and dragged along the
// floor. Fast arcade travel has short contacts and longer, low transfers.
const TAU=Math.PI*2,REACH=.068,MAX_CENTER=.316,CYCLE_DISTANCE=1.85,MAX_CADENCE=5.5;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const smooth=v=>v*v*(3-2*v);
const reachable=(f,x,z)=>Math.hypot(x-f.homeX,z-f.homeZ)<=REACH+1e-9&&Math.hypot(x,z)<=MAX_CENTER+1e-9;

export class TurtleGait{
  constructor({body,paws,scale=2.1}){
    if(paws.length!==4)throw new Error('Turtle gait needs four permanent paw groups');
    this.body=body;this.scale=scale;
    this.feet=paws.map((paw,i)=>({paw,homeX:paw.userData.homeX??paw.position.x,
      homeZ:paw.userData.homeZ??paw.position.z,offset:i===0||i===3?0:.5,
      anchorX:0,anchorZ:0,fromX:0,fromZ:0,frontX:0,frontZ:0,toX:0,toZ:0,
      endTravel:0,liftPhase:0,nextTouch:1,cycle:0,stance:true,phase:0,
      touchdownPhase:0,touchdownTravel:0,contactDistance:0,skipCycle:-1,startY:0,startTilt:0}));
    this.reset();
  }
  reset(){
    this.lastTime=null;this.lastX=0;this.lastZ=0;this.lastYaw=0;
    this.totalPhase=0;this.phase=0;this.distance=0;this.activity=0;this.speed=0;this.cadence=0;
    this.pitch=0;this.roll=0;this.footfalls=0;this.moving=false;this.bobRange=0;
    this.settleImmediately();
  }
  settleImmediately(){
    this.body.position.y=0;this.body.rotation.x=0;this.body.rotation.z=0;
    for(let i=0;i<4;i++){
      const f=this.feet[i];f.paw.position.set(f.homeX,0,f.homeZ);f.paw.rotation.x=0;
      f.stance=true;f.phase=(this.phase+f.offset)%1;f.contactDistance=0;
    }
  }
  anchor(root,time){
    this.lastX=root.position.x;this.lastZ=root.position.z;this.lastYaw=root.rotation.y;this.lastTime=time;
    this.moving=false;
    const s=Math.sin(this.lastYaw),c=Math.cos(this.lastYaw);
    for(let i=0;i<4;i++){
      const f=this.feet[i],p=f.paw.position;
      f.anchorX=this.lastX+this.scale*(p.x*c+p.z*s);
      f.anchorZ=this.lastZ+this.scale*(-p.x*s+p.z*c);
      f.fromX=p.x;f.fromZ=p.z;
    }
  }
  update(root,player,time,dt,paused=false){
    if(!player||player.dead||player.hidden){this.reset();return;}
    if(paused||time===this.lastTime)return;
    if(this.lastTime===null||time<this.lastTime){this.anchor(root,time);return;}
    const dx=root.position.x-this.lastX,dz=root.position.z-this.lastZ,distance=Math.hypot(dx,dz);
    if(!Number.isFinite(distance)||!Number.isFinite(dt)||dt<=0||distance>Math.max(2.4,dt*50)){
      this.reset();this.anchor(root,time);return;
    }
    const seconds=Math.min(dt,.1),moving=distance>1e-6;
    const yaw=root.rotation.y,s=Math.sin(yaw),c=Math.cos(yaw);
    const yawDelta=Math.atan2(Math.sin(yaw-this.lastYaw),Math.cos(yaw-this.lastYaw));
    const speed=distance/seconds,oldSpeed=this.speed,ease=1-Math.exp(-14*seconds);
    this.speed+=(speed-this.speed)*ease;
    this.activity+=((moving?Math.min(1,speed/.8):0)-this.activity)*ease;
    if(this.activity<1e-5)this.activity=0;
    // Smooth saturation with no phase reset at the cadence ceiling. Each
    // increment still needs actual travel; blocked input cannot animate it.
    const baseCadence=speed/CYCLE_DISTANCE;
    const phaseStep=moving?distance/CYCLE_DISTANCE/Math.pow(1+(baseCadence/MAX_CADENCE)**4,.25):0;
    const oldPhase=this.totalPhase,oldTravel=this.distance;
    this.totalPhase+=phaseStep;this.phase=this.totalPhase%1;this.distance+=distance;this.cadence=phaseStep/seconds;
    const calm=1/(1+(this.speed/9)**2);
    this.bobRange=.002*calm*this.activity;
    this.body.position.y=this.bobRange*.5*(1-Math.cos(this.phase*TAU));
    const pitchTarget=moving?(.0012+clamp((this.speed-oldSpeed)/seconds*.00006,-.0008,.0012))*calm*this.activity:0;
    const rollTarget=moving?clamp(-yawDelta/seconds*.0006,-.0024,.0024)*calm*this.activity:0;
    this.pitch+=(pitchTarget-this.pitch)*ease;this.roll+=(rollTarget-this.roll)*ease;
    this.body.rotation.x=this.pitch;this.body.rotation.z=this.roll;
    const forwardX=moving?(dx*c-dz*s)/distance:0,forwardZ=moving?(dx*s+dz*c)/distance:1;
    for(let i=0;i<4;i++){
      const f=this.feet[i],p=f.paw.position;
      if(!moving){
        p.x+=(f.homeX-p.x)*ease;p.z+=(f.homeZ-p.z)*ease;p.y*=1-ease;f.paw.rotation.x*=1-ease;
        if(this.activity===0){p.set(f.homeX,0,f.homeZ);f.paw.rotation.x=0;f.stance=true;}
        continue;
      }
      // Adapt stroke to direction and footprint. Rear/outer feet have
      // slightly less room than front/inner feet.
      const h=f.homeX*forwardX+f.homeZ*forwardZ;
      const circle=Math.sqrt(Math.max(0,h*h+MAX_CENTER*MAX_CENTER-f.homeX*f.homeX-f.homeZ*f.homeZ));
      const front=Math.min(REACH,Math.max(0,circle-h)*.995),back=Math.min(REACH,Math.max(0,circle+h)*.995);
      f.frontX=f.homeX+forwardX*front;f.frontZ=f.homeZ+forwardZ*front;
      const cycle=Math.floor(this.totalPhase+f.offset);
      if(!this.moving){
        const ps=Math.sin(this.lastYaw),pc=Math.cos(this.lastYaw);
        f.anchorX=this.lastX+this.scale*(p.x*pc+p.z*ps);f.anchorZ=this.lastZ+this.scale*(-p.x*ps+p.z*pc);
        f.cycle=Math.floor(oldPhase+f.offset);f.nextTouch=f.cycle+1-f.offset;
        f.endTravel=oldTravel+back*this.scale;f.stance=true;
        f.touchdownPhase=oldPhase;f.touchdownTravel=oldTravel;f.contactDistance=back*this.scale;
        // A restart at phase .99 cannot put a resting foot at the front of a
        // new stride one frame later. Skip that too-close first touchdown;
        // preserve the global rhythm while allowing a complete transfer.
        f.skipCycle=f.nextTouch-oldPhase<.30?f.cycle+1:-1;
        if(f.skipCycle>=0)f.nextTouch+=1;
        f.startY=p.y;f.startTilt=f.paw.rotation.x;
        if(p.y>1e-5){f.stance=false;f.liftPhase=oldPhase;f.fromX=p.x;f.fromZ=p.z;f.toX=f.frontX;f.toZ=f.frontZ;}
      }
      if(cycle!==f.cycle&&cycle===f.skipCycle){f.cycle=cycle;f.skipCycle=-1;}
      else if(cycle!==f.cycle){
        // Interpolate exact touchdown within this presentation interval;
        // low FPS must not stretch an entire support phase.
        const touchdown=cycle-f.offset,t=clamp((touchdown-oldPhase)/phaseStep,0,1);
        const angle=this.lastYaw+yawDelta*t,ts=Math.sin(angle),tc=Math.cos(angle);
        const localX=(dx*tc-dz*ts)/distance,localZ=(dx*ts+dz*tc)/distance;
        // Land where the current transfer was actually aiming. An abrupt
        // reversal must not flip that target under a nearly landed paw.
        const x=f.toX,z=f.toZ,ox=x-f.homeX,oz=z-f.homeZ;
        const reachDot=ox*localX+oz*localZ,rimDot=x*localX+z*localZ;
        const travelReach=reachDot+Math.sqrt(Math.max(0,reachDot*reachDot+REACH*REACH-ox*ox-oz*oz));
        const travelRim=rimDot+Math.sqrt(Math.max(0,rimDot*rimDot+MAX_CENTER*MAX_CENTER-x*x-z*z));
        f.anchorX=this.lastX+dx*t+this.scale*(x*tc+z*ts);
        f.anchorZ=this.lastZ+dz*t+this.scale*(-x*ts+z*tc);
        f.touchdownTravel=oldTravel+distance*t;f.touchdownPhase=touchdown;
        f.contactDistance=Math.max(0,Math.min(travelReach,travelRim))*this.scale;f.endTravel=f.touchdownTravel+f.contactDistance;
        f.cycle=cycle;f.nextTouch=touchdown+1;f.stance=true;f.startY=0;f.startTilt=0;this.footfalls++;
      }
      if(f.stance){
        let end=clamp((f.endTravel-oldTravel)/distance,0,1);
        let angle=this.lastYaw+yawDelta*end,es=Math.sin(angle),ec=Math.cos(angle);
        let ax=(f.anchorX-this.lastX-dx*end)/this.scale,az=(f.anchorZ-this.lastZ-dz*end)/this.scale;
        let x=ax*ec-az*es,z=ax*es+az*ec;
        if(!reachable(f,x,z)){
          // Tight turns/reversals can finish support early. Find the boundary
          // and lift instead of dragging a supposedly planted foot.
          let low=clamp((f.touchdownTravel-oldTravel)/distance,0,1),high=end;
          for(let n=0;n<12;n++){
            const m=(low+high)*.5,a=this.lastYaw+yawDelta*m,ms=Math.sin(a),mc=Math.cos(a);
            const mx=(f.anchorX-this.lastX-dx*m)/this.scale,mz=(f.anchorZ-this.lastZ-dz*m)/this.scale;
            if(reachable(f,mx*mc-mz*ms,mx*ms+mz*mc))low=m;else high=m;
          }
          end=low;angle=this.lastYaw+yawDelta*end;es=Math.sin(angle);ec=Math.cos(angle);
          ax=(f.anchorX-this.lastX-dx*end)/this.scale;az=(f.anchorZ-this.lastZ-dz*end)/this.scale;
          x=ax*ec-az*es;z=ax*es+az*ec;
        }
        if(end<1-1e-10||this.distance>=f.endTravel-1e-10){
          f.stance=false;f.liftPhase=oldPhase+phaseStep*end;f.fromX=x;f.fromZ=z;f.toX=f.frontX;f.toZ=f.frontZ;f.startY=0;f.startTilt=0;
        }else{
          p.set(x,0,z);f.paw.rotation.x=0;
        }
      }
      if(!f.stance){
        const u=clamp((this.totalPhase-f.liftPhase)/Math.max(.001,f.nextTouch-f.liftPhase),0,1),blend=smooth(u);
        p.x=f.fromX+(f.toX-f.fromX)*blend;p.z=f.fromZ+(f.toZ-f.fromZ)*blend;
        // Clear the floor promptly; a squared sine spent too much of the
        // transfer almost touching it, which still looked like sliding.
        const lift=Math.sin(Math.PI*u);p.y=Math.max(f.startY*(1-blend),.026*lift*this.activity);
        f.paw.rotation.x=f.startTilt*(1-blend)+.08*Math.sin(TAU*u)*this.activity;
      }
      f.phase=(this.phase+f.offset)%1;
    }
    this.moving=moving;this.lastX=root.position.x;this.lastZ=root.position.z;this.lastYaw=yaw;this.lastTime=time;
  }
  // Diagnostics allocate only when queried, never per update.
  diagnostics(){return {phase:this.phase,distance:this.distance,activity:this.activity,
    bodyY:this.body.position.y,bobRange:this.bobRange,pitch:this.pitch,roll:this.roll,speed:this.speed,cadence:this.cadence,
    footfalls:this.footfalls,paws:this.feet.map(f=>({x:f.paw.position.x,y:f.paw.position.y,z:f.paw.position.z,
      stance:f.stance,phase:f.phase,anchorX:f.anchorX,anchorZ:f.anchorZ,contactDistance:f.contactDistance,
      touchdownTravel:f.touchdownTravel,liftPhase:f.liftPhase,nextTouch:f.nextTouch}))};}
}
