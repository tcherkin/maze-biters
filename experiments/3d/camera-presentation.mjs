import {cameraSpring} from './camera-follow.mjs';

// Presentation owns the rendered zoom, independently of movement samples.
// Losing a life can clear velocity history without changing the current view.
export class CameraPresentation {
  constructor(){this.zoom=1;this.velocity=0;this.beginLevel();}
  beginLevel(){this.overview=true;this.intro=true;this.introTime=0;}
  update(snapshot,baseZoom,motionFactor,dt){
    const p=snapshot.player,ended=snapshot.complete||snapshot.gameOver;
    const active=!snapshot.paused&&snapshot.started!==false&&!ended;
    const step=Number.isFinite(dt)?Math.max(0,Math.min(.05,dt)):0;
    // Replaying from a close frame first eases out, then approaches the new
    // spawn. Initial loading already starts at exactly 1x behind the menu.
    if(this.overview&&active&&Math.abs(this.zoom-1)<.002&&Math.abs(this.velocity)<.01)
      this.overview=false;
    if(!this.overview&&this.intro&&active){
      this.introTime+=step;
      if(this.introTime>=3.5)this.intro=false;
    }
    this.focus=!this.overview&&!ended&&!p?.hidden;
    let target=this.overview||ended||!p||p.hidden?1:
      p.dead?Math.min(baseZoom,1.12):baseZoom*(this.intro?1:motionFactor);
    target=Math.max(1,target);
    // Pausing holds the ongoing presentation. Manual view adjustments still
    // work after the intro, using the same smooth path as normal play.
    const held=snapshot.paused&&(this.intro||p?.dead||p?.hidden);
    this.target=held?this.zoom:target;
    const next=cameraSpring(this.zoom,this.velocity,this.target,held?0:step,2.8);
    this.zoom=next.position;this.velocity=next.velocity;
    if(this.zoom<1){this.zoom=1;this.velocity=0;}
    if(Math.abs(this.zoom-this.target)<.00005&&Math.abs(this.velocity)<.0001){
      this.zoom=this.target;this.velocity=0;
    }
    return this.zoom;
  }
}

// A small directional bias, not a large velocity-driven chase target.
// The ellipse caps the offset inside the visible window, including portrait
// screens and diagonals. Velocity is already filtered from real displacement.
export function cameraLookAhead(vx,vy,viewWidth,viewHeight){
  const x=vx*.12,y=vy*.12;
  const rx=Math.max(.01,viewWidth*.08),ry=Math.max(.01,viewHeight*.08);
  const scale=1/Math.max(1,Math.hypot(x/rx,y/ry));
  return {x:x*scale,y:y*scale};
}
