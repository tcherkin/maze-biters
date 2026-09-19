// A fixed, gentle response avoids speeding up the camera during a sprint and
// then braking abruptly against a wall. Closed-form integration is FPS stable.
const OMEGA=2/.55;
export function cameraSpring(position,velocity,target,dt,omega=OMEGA){
  const offset=position-target,drive=velocity+omega*offset,decay=Math.exp(-omega*dt);
  return {position:target+(offset+drive*dt)*decay,
    velocity:(velocity-omega*drive*dt)*decay};
}
export class CameraFollow {
  constructor(){this.reset();}
  reset(){this.vx=this.vy=0;}
  update(center,x,y,dt,omega=OMEGA){
    if(!(dt>0)||!Number.isFinite(dt))return;
    const a=cameraSpring(center.x,this.vx,x,dt,omega),b=cameraSpring(center.y,this.vy,y,dt,omega);
    center.x=a.position;center.y=b.position;this.vx=a.velocity;this.vy=b.velocity;
    if(Math.hypot(center.x-x,center.y-y)<.0001&&Math.hypot(this.vx,this.vy)<.0001){
      center.x=x;center.y=y;this.reset();
    }
  }
  clamp(center,minX,maxX,minY,maxY){
    const x=Math.max(minX,Math.min(maxX,center.x)),y=Math.max(minY,Math.min(maxY,center.y));
    if(x!==center.x)this.vx=0;if(y!==center.y)this.vy=0;
    center.x=x;center.y=y;
  }
}
