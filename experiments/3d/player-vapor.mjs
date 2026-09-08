import * as THREE from './vendor/three.module.min.js';

const PUFFS=48,LIFETIME=1100;
const hash=(x,y)=>{
  let n=Math.imul(x+173,374761393)^Math.imul(y+37,668265263);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
};
const smooth=t=>t*t*(3-2*t);
function noise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),u),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),u),v);
}
function vaporTexture(){
  const canvas=document.createElement('canvas');canvas.width=192;canvas.height=128;
  const context=canvas.getContext('2d'),pixels=context.createImageData(192,128);
  for(let y=0;y<128;y++)for(let x=0;x<192;x++){
    const nx=(x-95.5)/96,ny=(y-63.5)/64,i=(y*192+x)*4;
    // Broad, warped wisps have no circular boundary or central round nucleus.
    // Large-scale folds and finer grain dissolve into transparent margins.
    const bend=.24*Math.sin(nx*3.3)+.35*(noise(x/42+9,y/38)-.5);
    const wx=nx+.20*(noise(x/51,y/45+21)-.5),wy=ny+bend;
    const grain=.55*noise(x/27,y/23)+.30*noise(x/12+17,y/12)+.15*noise(x/5,y/5+29);
    const edgeX=1-smooth(THREE.MathUtils.clamp((Math.abs(nx)-.65)/.35,0,1));
    const edgeY=1-smooth(THREE.MathUtils.clamp((Math.abs(ny)-.55)/.45,0,1));
    const density=Math.exp(-1.9*wx**4-3.8*wy**2)*(.22+.95*grain)*edgeX*edgeY;
    pixels.data[i]=221;pixels.data[i+1]=205;pixels.data[i+2]=225;
    pixels.data[i+3]=Math.round(255*density);
  }
  context.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

// A fixed pool of soft billboards follows recent world poses, so a turn leaves
// the old wisps behind instead of rotating the whole trail around the helmet.
// Lifetimes use game time; pause, restarts and respawns never accumulate smoke.
export class PlayerVapor{
  constructor(){
    this.group=new THREE.Group();this.group.name='Soft vapor behind the helmet';
    this.texture=vaporTexture();this.history=[];this.viewDirection=new THREE.Vector3();
    this.puffs=Array.from({length:PUFFS},(_,i)=>{
      const material=new THREE.SpriteMaterial({map:this.texture,color:i%3===0?0xc6aed4:0xe0caca,transparent:true,opacity:0,depthWrite:false,depthTest:true,toneMapped:false});
      const sprite=new THREE.Sprite(material);sprite.name='Rising vapor wisp';sprite.visible=false;
      this.group.add(sprite);return sprite;
    });
  }
  reset(){
    this.history.length=0;this.group.visible=false;
    for(const puff of this.puffs){puff.visible=false;puff.material.opacity=0;}
  }
  sample(time){
    const history=this.history;
    for(let i=1;i<history.length;i++)if(history[i].time>=time){
      const a=history[i-1],b=history[i],f=THREE.MathUtils.clamp((time-a.time)/(b.time-a.time),0,1);
      return {x:THREE.MathUtils.lerp(a.x,b.x,f),z:THREE.MathUtils.lerp(a.z,b.z,f),dx:THREE.MathUtils.lerp(a.dx,b.dx,f),dz:THREE.MathUtils.lerp(a.dz,b.dz,f),speed:THREE.MathUtils.lerp(a.speed,b.speed,f)};
    }
    return history.at(-1);
  }
  update(time,position,yaw,visible,camera=null){
    if(!visible){this.reset();return;}
    const previous=this.history.at(-1),pose={time,x:position.x,z:position.z,dx:Math.sin(yaw),dz:Math.cos(yaw),speed:0};
    if(!previous||time<previous.time||Math.hypot(pose.x-previous.x,pose.z-previous.z)>4){
      this.reset();this.history.push({...pose,time:time-LIFETIME},pose);
    }else if(time>previous.time){
      pose.speed=Math.hypot(pose.x-previous.x,pose.z-previous.z)*1000/(time-previous.time);
      this.history.push(pose);
      while(this.history.length>2&&this.history[1].time<time-LIFETIME)this.history.shift();
    }
    this.group.visible=true;
    if(camera)camera.updateMatrixWorld();
    for(let i=0;i<PUFFS;i++){
      // Uneven emission phases remove the regular bead spacing. The fixed
      // pool and deterministic phases still freeze exactly with game time.
      const shifted=time+(i+.6*hash(i,101))*LIFETIME/PUFFS,cycle=Math.floor(shifted/LIFETIME),age=(shifted-cycle*LIFETIME)/LIFETIME;
      const origin=this.sample(time-age*LIFETIME),seed=hash(i,cycle),turn=seed*Math.PI*2;
      const directionLength=Math.hypot(origin.dx,origin.dz)||1,dx=origin.dx/directionLength,dz=origin.dz/directionLength;
      const distance=.52+age*.95,sideways=-.15-age*.35+Math.sin(turn+age*3)*(.25+age*.65);
      const puff=this.puffs[i];
      puff.position.set(origin.x-dx*distance+dz*sideways,1.08+age*.85,origin.z-dz*distance-dx*sideways);
      // Retain emitted wisps in world space for their whole lifetime. Clipping
      // them by distance from the current player erased the trail at game speed.
      const moving=THREE.MathUtils.clamp(origin.speed/20,0,1);
      const fadeIn=smooth(Math.min(1,age/.12)),fadeOut=1-smooth(age);
      puff.material.opacity=(.14+.12*moving)*fadeIn*fadeOut;
      // Stretch overlapping wisps along the projected travel direction rather
      // than a fixed screen axis, so every heading retains a connected wake.
      this.viewDirection.set(dx,0,dz);
      if(camera)this.viewDirection.transformDirection(camera.matrixWorldInverse);
      else this.viewDirection.set(dx,-dz,0);
      const angle=Math.atan2(this.viewDirection.y,this.viewDirection.x);
      puff.material.rotation=moving>.05?angle+.16*Math.sin(turn+age*2):turn+age*.4;
      const size=.80+age*1.4;
      // Open up across the route as the cloud ages, rather than leaving a
      // narrow jet. Keep the long-axis overlap that hides individual stamps.
      puff.scale.set(size*(1.5+.7*moving+.35*seed),size*(1.45+.55*seed+age*.35),1);
      puff.visible=puff.material.opacity>.001;
    }
  }
}
