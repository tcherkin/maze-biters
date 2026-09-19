import * as THREE from './vendor/three.module.min.js';
import {rayBoxDistance} from './flashlight-mask.mjs';

const CAPACITY=12,REAR=.68,TRAVEL=.74,MAX_REACH=1.48;
const hash=n=>{n=Math.imul(n^0x45d9f3b,0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;};

// Replaces vapor entirely: one small point buffer and one shared material.
// No textures, lights or extra reflection passes; positions stay in world space.
export class PlayerCrystalDust{
  constructor(){
    this.group=new THREE.Group();this.group.name='Sparse crystal dust';
    this.positions=new Float32Array(CAPACITY*3);this.sizes=new Float32Array(CAPACITY);
    this.alphas=new Float32Array(CAPACITY);this.colors=new Float32Array(CAPACITY*3);
    this.geometry=new THREE.BufferGeometry();
    for(const [name,array,size] of [['position',this.positions,3],['dustSize',this.sizes,1],['dustAlpha',this.alphas,1],['dustColor',this.colors,3]]){
      this.geometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
    }
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
      blending:THREE.AdditiveBlending,uniforms:{viewportHeight:{value:1}},
      vertexShader:`attribute float dustSize;attribute float dustAlpha;attribute vec3 dustColor;
        uniform float viewportHeight;varying float alpha;varying vec3 tint;
        void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;
          float depth=projectionMatrix[2][3]<-.5?max(.001,-p.z):1.;
          gl_PointSize=max(1.,dustSize*viewportHeight*projectionMatrix[1][1]*.5/depth);
          alpha=dustAlpha;tint=dustColor;}`,
      fragmentShader:`varying float alpha;varying vec3 tint;
        void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);
          if(r>1.||alpha<.002)discard;
          float spot=(.76*exp(-18.*r)+.24*exp(-7.*r))*(1.-smoothstep(.6,1.,r));
          gl_FragColor=vec4(tint,alpha*spot);
          #include <colorspace_fragment>
        }`
    });
    this.points=new THREE.Points(this.geometry,this.material);this.points.frustumCulled=false;
    this.points.name='Tiny green-gold light grains';this.group.add(this.points);
    this.viewport=new THREE.Vector4();
    this.points.onBeforeRender=renderer=>{renderer.getCurrentViewport(this.viewport);this.material.uniforms.viewportHeight.value=this.viewport.w;};
    this.particles=Array.from({length:CAPACITY},()=>({active:false}));this.walls=[];this.enabled=true;
    this.reset();
  }
  setWalls(walls){this.walls=walls.map(b=>({minX:b.minX-.045,maxX:b.maxX+.045,minZ:b.minZ-.045,maxZ:b.maxZ+.045}));}
  setEnabled(enabled){this.enabled=Boolean(enabled);this.reset();}
  reset(){
    this.lastTime=null;this.clock=0;this.travel=0;this.nextBirth=.12;this.serial=0;this.cursor=0;this.active=0;
    this.group.visible=false;this.alphas.fill(0);
    for(const particle of this.particles)particle.active=false;
    this.geometry.attributes.dustAlpha.needsUpdate=true;
  }
  clearPath(ax,az,bx,bz){
    for(const box of this.walls)if(rayBoxDistance(ax,az,bx-ax,bz-az,box,1)!==Infinity)return false;
    return true;
  }
  update(time,position,visible,elapsed){
    if(!this.enabled)return;
    if(!visible){if(this.lastTime!==null)this.reset();return;}
    if(this.lastTime===null||time<this.lastTime||Math.hypot(position.x-this.x,position.z-this.z)>Math.max(4,elapsed*60)){
      this.reset();this.lastTime=time;this.x=position.x;this.z=position.z;return;
    }
    if(time===this.lastTime)return; // Freeze with the game, including pauses.
    const milliseconds=Math.max(0,elapsed)*1000,oldClock=this.clock;
    this.clock+=milliseconds;
    const mx=position.x-this.x,mz=position.z-this.z,distance=Math.hypot(mx,mz),oldTravel=this.travel;
    this.travel+=distance;
    if(distance>.00001){
      // Actual travel, not facing yaw, controls where grains separate from glass.
      const dx=mx/distance,dz=mz/distance;
      while(this.nextBirth<=this.travel){
        const seed=++this.serial,f=THREE.MathUtils.clamp((this.nextBirth-oldTravel)/distance,0,1);
        const px=this.x+mx*f,pz=this.z+mz*f,side=(hash(seed*7+1)-.5)*.36;
        const x=px-dx*REAR+dz*side,z=pz-dz*REAR-dx*side;
        if(hash(seed*7+2)>.16&&this.clearPath(this.x,this.z,px,pz)&&this.clearPath(px,pz,x,z)){
          const index=this.cursor++%CAPACITY,p=this.particles[index];
          Object.assign(p,{active:true,x,z,y:.32+hash(seed*7+3)*.20,born:oldClock+milliseconds*f,
            travel:this.nextBirth,life:300+hash(seed*7+4)*200,
            vx:dz*side*.55-dx*.025,vz:-dx*side*.55-dz*.025,size:.07+hash(seed*7+5)*.035});
          this.colors[index*3]=.58+.12*hash(seed);this.colors[index*3+1]=.68+.08*hash(seed+1);this.colors[index*3+2]=.27+.12*hash(seed+2);
        }
        // Uneven spacing and occasional omissions avoid a continuous dotted line.
        this.nextBirth+=.125+hash(seed*7+6)*.095;
      }
    }
    this.active=0;
    for(let i=0;i<CAPACITY;i++){
      const p=this.particles[i];this.alphas[i]=0;if(!p.active)continue;
      const age=this.clock-p.born,t=age/p.life,trail=(this.travel-p.travel)/TRAVEL;
      const seconds=age/1000,x=p.x+p.vx*seconds,z=p.z+p.vz*seconds;
      if(t>=1||trail>=1||Math.hypot(x-position.x,z-position.z)>MAX_REACH||!this.clearPath(p.x,p.z,x,z)){p.active=false;continue;}
      this.positions[i*3]=x;this.positions[i*3+1]=p.y+seconds*.08;this.positions[i*3+2]=z;
      this.sizes[i]=p.size;
      this.alphas[i]=.58*(1-t*t)*(1-trail*trail)*Math.min(1,age/12);
      if(this.alphas[i]>.008)this.active++;
    }
    for(const attribute of Object.values(this.geometry.attributes))attribute.needsUpdate=true;
    this.group.visible=this.active>0;
    this.lastTime=time;this.x=position.x;this.z=position.z;
  }
  diagnostics(){return {enabled:this.enabled,capacity:CAPACITY,active:this.active,maxReach:MAX_REACH};}
}
