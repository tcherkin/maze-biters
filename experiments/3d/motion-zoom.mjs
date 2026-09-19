const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const blend=(dt,tau)=>1-Math.exp(-dt/tau);
const smooth=(value,min,max)=>{const t=clamp((value-min)/(max-min),0,1);return t*t*(3-2*t);};
const NORMAL_SPEED=.5/.095; // cells per real second at the initial 3D speed
const HISTORY_SECONDS=2,SAMPLE_SECONDS=.05;

// Adapted from updateGameplayCameraMotion in src/engine/game.js: rendered
// displacement and signed velocity, never keys or the requested direction.
// The 3D version also measures recent spatial extent, so fast small loops
// remain intimate. All distances are logical cells and rotation-independent.
export class MotionZoom {
  constructor(){this.reset();}
  reset(){
    this.factor=this.target=1;this.vx=this.vy=this.speed=this.extent=0;
    this.previous=null;this.history=[];this.clock=this.nextSample=0;this.suspended=false;this.lifeEnded=false;
  }
  anchor(point){
    this.previous=point;this.vx=this.vy=this.speed=this.extent=0;
    this.clock=0;this.nextSample=SAMPLE_SECONDS;this.history=[{x:point.x,y:point.y,t:0}];
    this.target=1;
  }
  update(snapshot,elapsed){
    const p=snapshot.player;
    if(!p||!Number.isFinite(p.visual?.x)||!Number.isFinite(p.visual?.y)){
      this.suspended=true;return this.factor;
    }
    const point={x:p.visual.x,y:p.visual.y,time:snapshot.time,
      generation:snapshot.generation,id:p.id,lives:p.lives};
    const prev=this.previous;
    if(!prev||prev.generation!==point.generation||prev.id!==point.id){
      this.anchor(point);this.lifeEnded=false;
    }
    if(snapshot.paused||snapshot.complete||snapshot.gameOver||snapshot.started===false||p.dead||p.hidden){
      if(p.dead||p.hidden)this.lifeEnded=true;
      this.previous=point;this.suspended=true;return this.factor;
    }
    if(this.lifeEnded||(prev&&prev.lives!==point.lives)){
      this.anchor(point);this.lifeEnded=false;
    }
    const dt=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
    const dx=point.x-this.previous.x,dy=point.y-this.previous.y,distance=Math.hypot(dx,dy);
    if(this.suspended||dt>.25||point.time<this.previous.time||distance>Math.max(1.25,dt*24)){
      // Resume/teleport is not a sprint. Keep the current framing, then ease
      // back naturally, including a fresh life at a distant spawn point.
      this.anchor(point);this.suspended=false;
    }else if(dt>0){
      const motionBlend=blend(dt,.5);
      this.vx+=(dx/dt-this.vx)*motionBlend;this.vy+=(dy/dt-this.vy)*motionBlend;
      this.speed+=(distance/dt-this.speed)*motionBlend;
      const end=this.clock+dt;
      while(this.nextSample<=end+1e-9){
        const t=clamp((this.nextSample-this.clock)/dt,0,1);
        this.history.push({x:this.previous.x+dx*t,y:this.previous.y+dy*t,t:this.nextSample});
        this.nextSample+=SAMPLE_SECONDS;
      }
      this.clock=end;
      while(this.history.length>1&&this.history[1].t<end-HISTORY_SECONDS)this.history.shift();
      let minX=point.x,maxX=point.x,minY=point.y,maxY=point.y;
      for(const sample of this.history){minX=Math.min(minX,sample.x);maxX=Math.max(maxX,sample.x);minY=Math.min(minY,sample.y);maxY=Math.max(maxY,sample.y);}
      this.extent=Math.hypot(maxX-minX,maxY-minY);
      const speed=this.speed/NORMAL_SPEED,progress=Math.hypot(this.vx,this.vy)/NORMAL_SPEED;
      const opening=(.03*Math.min(1,speed)+.09*Math.min(1,progress)+
        (1/6-.12)*clamp(progress-1,0,1))*smooth(this.extent,3,5.5);
      this.target=1-opening;
      this.factor+=(this.target-this.factor)*blend(dt,this.target<this.factor ? .65 : 1.25);
      if(Math.abs(1-this.factor)<.0001&&this.target>.99995)this.factor=1;
    }
    this.previous=point;
    return this.factor;
  }
  diagnostics(){return {factor:this.factor,target:this.target,speed:this.speed,extent:this.extent,samples:this.history.length};}
}
