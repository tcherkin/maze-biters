import * as THREE from './vendor/three.module.min.js';

// Preserve the original 2D sequence and game-clock timing while keeping the
// physical 3D mouthful visible through the lighter vapor and small sparks.
export const BLOOM_MS=340,FLASH_MS=82,CLOUD_START_MS=18,CLOUD_END_MS=260;
export const SUCTION_START_MS=54,SUCTION_TRAVEL_MS=248;
const POOL_SIZE=12,OFFSETS=[-.22,.18,-.10,.26];
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};

function textureFor(kind){
  const size=kind==='cloud'?128:96,canvas=document.createElement('canvas');
  canvas.width=canvas.height=size;
  const context=canvas.getContext('2d'),pixels=context.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5-size/2)/(size/2),v=(y+.5-size/2)/(size/2),i=(y*size+x)*4;
    const edge=(1-smooth((Math.abs(u)-.65)/.35))*(1-smooth((Math.abs(v)-.65)/.35));
    let density;
    if(kind==='cloud'){
      const warp=.20*Math.sin(u*5.1)+.11*Math.sin(v*7.3+u*3.2);
      const grain=.66+.15*Math.sin(u*17+v*11)*Math.sin(v*19-u*8)+.12*Math.sin(u*31-v*22);
      density=Math.exp(-2.6*u*u-5.2*(v+warp)**2)*grain*edge;
    }else{
      const radius=Math.hypot(u,v),glow=Math.exp(-6*radius*radius)*edge;
      const rays=kind==='flash'?.60*(Math.exp(-Math.abs(u)*35-Math.abs(v)*5)+Math.exp(-Math.abs(v)*35-Math.abs(u)*5)):0;
      density=(glow+rays)*edge;
    }
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;
    pixels.data[i+3]=Math.round(255*clamp(density));
  }
  context.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

export class ConsumptionBloom{
  constructor({poolSize=POOL_SIZE,assets=null}={}){
    this.group=new THREE.Group();this.group.name='Consumption flash, vapor and suction';
    this.assets=assets??{textures:{flash:textureFor('flash'),cloud:textureFor('cloud'),glow:textureFor('glow')},
      sparkGeometry:new THREE.OctahedronGeometry(1,0),spillGeometry:new THREE.PlaneGeometry(1,1)};
    this.textures=this.assets.textures;this.sparkGeometry=this.assets.sparkGeometry;this.spillGeometry=this.assets.spillGeometry;
    const sprite=(texture,opacity=0)=>new THREE.Sprite(new THREE.SpriteMaterial({map:texture,
      transparent:true,opacity,depthWrite:false,depthTest:true,toneMapped:false,blending:THREE.AdditiveBlending}));
    this.slots=Array.from({length:poolSize},()=>{
      const group=new THREE.Group(),flash=sprite(this.textures.flash);
      flash.material.color.set(0xfff9eb);flash.name='Small white bite glint';
      const clouds=[sprite(this.textures.cloud),sprite(this.textures.cloud)];
      const spill=new THREE.Mesh(this.spillGeometry,new THREE.MeshBasicMaterial({map:this.textures.glow,
        transparent:true,opacity:0,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      spill.rotation.x=-Math.PI/2;
      const motes=Array.from({length:4},()=>{
        const group=new THREE.Group(),core=new THREE.Mesh(this.sparkGeometry,new THREE.MeshBasicMaterial({
          transparent:true,opacity:0,depthWrite:false,toneMapped:false})),glow=sprite(this.textures.glow);
        group.add(core,glow);return {group,core,glow};
      });
      group.add(flash,...clouds,spill,...motes.map(m=>m.group));group.visible=false;
      this.group.add(group);
      return {event:null,group,flash,clouds,spill,motes,origin:new THREE.Vector3(),side:new THREE.Vector3(),seed:0};
    });
  }
  reset(){
    for(const slot of this.slots){slot.event=null;slot.group.visible=false;}
  }
  spawn(event,origin,time,color=event.snake.color,dir=event.player.dir,flashLift=event.kind==='head'?.55:.40){
    const slot=this.slots.find(s=>!s.event||time-s.event.time>=BLOOM_MS)
      ??this.slots.reduce((a,b)=>a.event.time<b.event.time?a:b);
    slot.event=event;slot.origin.copy(origin);slot.group.visible=true;slot.flashLift=flashLift;
    const length=Math.hypot(dir.x,dir.y)||1;
    slot.side.set(-dir.y/length,0,dir.x/length);slot.seed=(event.id*.61803398875%1)*Math.PI*2;
    for(const sprite of [...slot.clouds,slot.spill])sprite.material.color.set(color);
    for(const mote of slot.motes){
      mote.glow.material.color.set(color);
      mote.core.material.color.set(color).lerp(new THREE.Color(0xfff8e8),.55);
    }
  }
  update(time,mouth){
    for(const slot of this.slots){
      if(!slot.event)continue;
      const age=time-slot.event.time;
      if(age<0||age>=BLOOM_MS){slot.event=null;slot.group.visible=false;continue;}
      const {origin,flash,clouds,spill,motes,seed}=slot;
      const impact=clamp(age/FLASH_MS);
      flash.visible=age<FLASH_MS;flash.position.copy(origin);
      // Keep the contact glint on the visible surface of the opaque mouthful,
      // rather than buried in its centre. The vapor keeps the original source.
      flash.position.y+=slot.flashLift;
      flash.scale.setScalar(.68+impact*1.15);flash.material.opacity=.80*(1-impact)**2;
      flash.material.rotation=seed*.3;
      const cloud=clamp((age-CLOUD_START_MS)/(CLOUD_END_MS-CLOUD_START_MS));
      const strength=4*cloud*(1-cloud),spread=1.1+cloud*1.3;
      for(let i=0;i<clouds.length;i++){
        const puff=clouds[i],side=i===0?-1:1;
        puff.visible=age>=CLOUD_START_MS&&age<CLOUD_END_MS;
        puff.position.copy(origin).addScaledVector(slot.side,side*(.12+.18*cloud));
        puff.position.y+=.08+cloud*.38+i*.08;
        puff.scale.set(spread*(1.08+i*.12),spread*(.67+i*.10),1);
        puff.material.rotation=seed+side*(.35+cloud*.35);
        puff.material.opacity=(i===0?.30:.22)*strength;
      }
      // A faint local reflection binds the glint/vapor to the dark tiled floor.
      spill.position.copy(origin);spill.position.y=.055;
      spill.scale.setScalar(1.15+cloud*1.65);
      spill.material.opacity=.17*(1-impact)**2+.08*strength;
      spill.visible=spill.material.opacity>.001;
      for(let i=0;i<motes.length;i++){
        const mote=motes[i],p=(age-SUCTION_START_MS-i*15)/SUCTION_TRAVEL_MS;
        mote.group.visible=p>=0&&p<1;
        if(!mote.group.visible)continue;
        const pull=p*p,arc=4*p*(1-p),side=OFFSETS[(i+slot.event.id)&3]*arc*2;
        mote.group.position.lerpVectors(origin,mouth,pull).addScaledVector(slot.side,side);
        mote.group.position.y+=arc*(.18+i*.055);
        const alpha=smooth(p*6)*(1-p),size=.075-.035*p;
        mote.core.scale.set(size,size*1.5,size);
        mote.core.rotation.set(seed+p*3,i+p*4,seed*.5+p*2);
        mote.core.material.opacity=.95*alpha;
        mote.glow.scale.setScalar(.34-.14*p);mote.glow.material.opacity=.68*alpha;
      }
    }
  }
}
