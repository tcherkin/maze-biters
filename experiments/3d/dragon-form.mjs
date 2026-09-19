import * as THREE from './vendor/three.module.min.js';
import {ConsumptionBloom,BLOOM_MS} from './consumption-bloom.mjs';
import {animateSnakeMouth} from './models/snake.mjs';
import {snakeMouthOpening} from './snake-mouth.mjs';

// Keep the expressive head full-sized; tuck the torso and tail into its cell.
// Native bounds become approximately [-.47,.47] at the 2.1 world scale.
export function dragonFormZ(z,compactness=0){
  return THREE.MathUtils.lerp(z,.20+.41*z,compactness);
}
export function dragonLengthZ(z,length=2){
  if(length<=2)return dragonFormZ(z,Math.max(0,2-length));
  // Keep the muzzle, neck and front shoulders intact. Add length through the
  // abdomen, carrying the hips and shaped tail back along the committed trail.
  const abdomen=THREE.MathUtils.smoothstep(-z,.50,1.12);
  return z-abdomen*(length-2)*2/2.1;
}

function crystalCrest(){
  const vertices=[[-.14,.54,.16],[.14,.54,.16],[-.17,.54,-.16],[.17,.54,-.16],[0,.67,-.025]];
  const faces=[0,1,4,1,3,4,3,2,4,2,0,4,0,2,1,1,2,3];
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(i=>vertices[i]),3));
  geometry.computeVertexNormals();return geometry;
}

export class DragonForm{
  constructor(model,assets){
    this.model=model;this.wings=[];this.origin=new THREE.Vector3();this.target=new THREE.Vector3();
    this.crestGeometry=crystalCrest();this.crestTransform=new THREE.Object3D();
    this.crests=new THREE.InstancedMesh(this.crestGeometry,model.userData.dragonRig.bodyShell.material,128);
    this.crests.name='Dragon new crystal dorsal plates';this.crests.count=0;this.crests.frustumCulled=false;
    this.crests.castShadow=true;model.add(this.crests);
    model.traverse(o=>{if(o.name.includes('folded bat wing'))this.wings.push(o);});
    this.bloom=new ConsumptionBloom({poolSize:1,assets});this.reset();
  }
  reset(){this.serial=0;this.active=null;this.bloom.reset();this.model.userData.dragonCompactness=0;this.model.userData.dragonVisualLength=2;}
  pose(player){
    const length=Math.max(1,player?.visualLength??player?.length??(2-(player?.compactness??(player?.compact?1:0))));
    const amount=THREE.MathUtils.clamp(2-length,0,1);
    this.model.userData.dragonCompactness=amount;
    this.model.userData.dragonVisualLength=length;
    for(const wing of this.wings)wing.scale.z=THREE.MathUtils.lerp(1,.65,amount);
  }
  update(snapshot,layout,snakes){
    const time=snapshot.time,p=snapshot.player;
    this.updateCrests();
    for(const event of snapshot.dragonEvents??[]){
      if(event.id<=this.serial)continue;
      this.serial=event.id;
      if(event.playerId!==p?.id||time-event.time>=BLOOM_MS||p.dead||p.hidden)continue;
      this.active=event;
      this.origin.set(layout.x(event.x),.45,layout.z(event.y));
      this.bloom.spawn(event,this.origin,time,event.kind==='shed'?0x49dca1:0xa8ed79,event.dir,.18);
    }
    if(p?.dead||p?.hidden){this.active=null;this.bloom.reset();return;}
    const event=this.active;if(!event)return;
    this.target.copy(this.model.position);this.target.y=.65;
    const predator=event.kind==='shed'?snakes.get(event.snakeId):null;
    if(predator){
      predator.head.updateWorldMatrix(true,false);
      this.target.set(0,.295,.24).applyMatrix4(predator.head.matrixWorld);
      const age=time-event.time,phase=Math.min(1,age/310),idle=snakeMouthOpening(event.snakeId,time);
      const opening=phase<.28?THREE.MathUtils.lerp(idle,1,phase/.28)
        :phase<.72?1-(phase-.28)/.44:THREE.MathUtils.lerp(0,idle,(phase-.72)/.28);
      if(age<310)animateSnakeMouth(predator.head,opening);
    }
    this.bloom.update(time,this.target);
    if(time-event.time>=BLOOM_MS)this.active=null;
  }
  updateCrests(){
    const length=this.model.userData.dragonVisualLength??2,extra=Math.max(0,length-2);
    const count=Math.ceil(extra*2),rig=this.model.userData.dragonRig;
    if(count>this.crests.instanceMatrix.count){
      const previous=this.crests;this.crests=new THREE.InstancedMesh(this.crestGeometry,previous.material,count*2);
      this.crests.name=previous.name;this.crests.frustumCulled=false;this.crests.castShadow=true;
      previous.removeFromParent();previous.dispose();this.model.add(this.crests);
    }
    this.crests.count=count;if(!count)return;
    for(let i=0;i<count;i++){
      const distance=(1.8+i)/2.1,amount=Math.min(1,Math.max(0,extra*2-i));
      let a=0,b=rig.restZ.length-1;
      while(b-a>1){const mid=(a+b)>>1;if(-dragonLengthZ(rig.restZ[mid],length)<distance)a=mid;else b=mid;}
      const da=-dragonLengthZ(rig.restZ[a],length),db=-dragonLengthZ(rig.restZ[b],length);
      const t=THREE.MathUtils.clamp((distance-da)/(db-da||1),0,1),pose=this.crestTransform;
      pose.position.lerpVectors(rig.bones[a].position,rig.bones[b].position,t);
      pose.quaternion.copy(rig.bones[a].quaternion).slerp(rig.bones[b].quaternion,t);
      pose.scale.setScalar(amount);pose.position.y=.56*(1-amount);pose.updateMatrix();
      this.crests.setMatrixAt(i,pose.matrix);
    }
    this.crests.instanceMatrix.needsUpdate=true;
  }
}
