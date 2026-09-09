import * as THREE from './vendor/three.module.min.js';
import {snakeRoute,sampleSnake} from './motion.mjs';
import {createSnakeHead,animateSnakeMouth,snakeSegmentGeometry,snakeSegmentAccentGeometry,snakeTailGeometry} from './models/snake.mjs';
import {snakeMouthOpening} from './snake-mouth.mjs';
import {ConsumptionBloom,BLOOM_MS} from './consumption-bloom.mjs';
import {CELL_SIZE,MODEL_SCALE,HEAD_SCALE} from './world.mjs';
import {createSnakeFinish,snakeCoreGeometry,addSnakeHeadCores,copySnakeCore} from './snake-light.mjs';

// Game milliseconds: roughly a third of a second at the default half speed.
export const SWALLOW_MS=170,TAIL_SETTLE_MS=150,CHOMP_MS=210;
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const mix=THREE.MathUtils.lerp;
const progress=(event,time,duration)=>clamp((time-event.time)/duration);
const plateLength=snakeSegmentGeometry.boundingBox.max.z-snakeSegmentGeometry.boundingBox.min.z;

// These two lofts have the same triangle topology. A surviving armor block
// therefore becomes a tapered tail without replacing its silhouette in a frame.
export const growingTailGeometry=snakeSegmentGeometry.clone();
growingTailGeometry.morphAttributes.position=[snakeTailGeometry.attributes.position];
growingTailGeometry.morphAttributes.normal=[snakeTailGeometry.attributes.normal];
growingTailGeometry.computeBoundingSphere();

export function biteSnakeSample(s,time,index,transition=null){
  const point=sampleSnake(snakeRoute(s,time),index);
  if(!transition||time>=transition.event.time+TAIL_SETTLE_MS)return point;
  const before=biteSourceSample(transition,time,index);
  const blend=smooth(progress(transition.event,time,TAIL_SETTLE_MS));
  return {x:mix(before.x,point.x,blend),y:mix(before.y,point.y,blend),
    dx:mix(before.dx,point.dx,blend),dy:mix(before.dy,point.dy,blend)};
}

function biteSourceSample(transition,time,index){
  const indices=transition.sourceIndices;
  const direction=indices?(indices.length>1?Math.sign(indices[1]-indices[0]):indices[0]===0?1:-1):1;
  const sourceIndex=indices?indices[0]+index*direction:index;
  const p=biteSnakeSample(transition.event.snake,time,sourceIndex,transition.previous);
  return {...p,dx:p.dx*direction,dy:p.dy*direction};
}

export function biteHeadOrigin(transition){
  if(!transition)return null;
  return transition.sourceIndices?.[0]>0?transition:biteHeadOrigin(transition.previous);
}

export function biteHeadGrowth(time,transition){
  const origin=biteHeadOrigin(transition);
  return origin?smooth(progress(origin.event,time,TAIL_SETTLE_MS)):1;
}

export function biteTailShape(s,time,transition=null){
  const targetZ=s.body.length===2?MODEL_SCALE:CELL_SIZE*1.25;
  if(!transition||time>=transition.event.time+TAIL_SETTLE_MS)
    return {morph:1,y:.29*MODEL_SCALE,z:targetZ};
  const index=s.body.length-1;
  const a=biteSourceSample(transition,time,index-.5);
  const b=biteSourceSample(transition,time,index+.5);
  const fromZ=Math.hypot(b.x-a.x,b.y-a.y)*CELL_SIZE*.96/plateLength;
  const blend=smooth(progress(transition.event,time,TAIL_SETTLE_MS));
  return {morph:blend,y:mix(.30,.29,blend)*MODEL_SCALE,z:mix(fromZ,targetZ,blend)};
}

export class BiteEffects{
  constructor(){
    this.group=new THREE.Group();this.group.name='Swallowed snake pieces';
    this.bloom=new ConsumptionBloom();this.group.add(this.bloom.group);
    this.transitions=new Map();this.lastSerial=0;this.time=0;this.latest=null;
    this.mouth=new THREE.Vector3();this.lastPlayer=null;this.updatedAt=null;
    // Fixed slots keep rapid bites cheap. All model geometry remains shared.
    this.slots=Array.from({length:8},()=>{
      const finish=createSnakeFinish('#ffffff'),{material,accentMaterial,coreMaterial}=finish;
      const group=new THREE.Group(),tail=new THREE.Mesh(growingTailGeometry,material);
      const body=new THREE.Mesh(snakeSegmentGeometry,material),accent=new THREE.Mesh(snakeSegmentAccentGeometry,accentMaterial);
      const head=createSnakeHead(material);head.scale.setScalar(HEAD_SCALE);
      addSnakeHeadCores(head,finish);
      const coreTail=new THREE.Mesh(snakeCoreGeometry(growingTailGeometry),coreMaterial),coreBody=new THREE.Mesh(snakeCoreGeometry(snakeSegmentGeometry),coreMaterial);
      coreTail.name='Swallowed tail luminous core';coreBody.name='Swallowed segment luminous core';
      group.add(tail,body,accent,head,coreTail,coreBody);group.visible=false;
      group.traverse(mesh=>{if(mesh.isMesh)mesh.castShadow=mesh.receiveShadow=true;});
      group.traverse(mesh=>{if(mesh.material===coreMaterial)mesh.castShadow=mesh.receiveShadow=false;});
      this.group.add(group);
      return {group,tail,body,accent,head,material,accentMaterial,finish,coreTail,coreBody,event:null,from:new THREE.Vector3()};
    });
  }
  reset(){
    for(const slot of this.slots){slot.event=null;slot.group.visible=false;}
    this.bloom.reset();
    this.transitions.clear();this.lastSerial=0;this.latest=null;this.time=0;this.lastPlayer=null;this.updatedAt=null;
  }
  beginFrame(snapshot,layout,dt){
    // Let the final mouthful finish after victory freezes the game clock.
    // A manual pause still freezes every part of this effect.
    if(snapshot.complete){
      this.time=Math.max(snapshot.time,this.time);
      if(!snapshot.paused)this.time=Math.min(snapshot.time+BLOOM_MS,this.time+dt*1000*(snapshot.speed??.5));
    }else this.time=snapshot.time;
    const player=snapshot.player;
    const visible=Boolean(player&&!player.dead&&!player.hidden);
    const teleported=player&&this.lastPlayer&&Math.hypot(player.visual.x-this.lastPlayer.x,player.visual.y-this.lastPlayer.y)>2;
    if(!visible||teleported){
      for(const slot of this.slots){slot.event=null;slot.group.visible=false;}
      this.bloom.reset();
      this.latest=null;
    }
    if(teleported)this.transitions.clear();
    this.lastPlayer=player?{...player.visual}:null;
    for(const event of snapshot.bites??[]){
      if(event.id<=this.lastSerial)continue;
      this.lastSerial=event.id;
      if(teleported||this.time-event.time>=BLOOM_MS)continue;
      const previous=this.transitions.get(event.snake.id);
      if(visible&&event.playerId===player.id){
        if(this.time-event.time<CHOMP_MS)this.latest=event;
        if(this.time-event.time<SWALLOW_MS)this.spawn(event,layout,previous);
        const source=biteSnakeSample(event.snake,event.time,event.index,previous);
        this.bloom.spawn(event,new THREE.Vector3(layout.x(source.x),event.kind==='head'?.36*HEAD_SCALE:.30*MODEL_SCALE,layout.z(source.y)),this.time);
      }
      // These endpoints belong to surviving snakes. They still form when a
      // split and a lethal counter-bite arrive in the same rendered frame.
      if(event.kind==='tail')this.transitions.set(event.snake.id,{event,previous});
      for(const fragment of event.fragments??[])
        this.transitions.set(fragment.snake.id,{event,previous,sourceIndices:fragment.sourceIndices});
    }
    const ids=new Set(snapshot.snakes.map(s=>s.id));
    for(const [id,transition] of this.transitions){
      if(!ids.has(id)||this.time>=transition.event.time+TAIL_SETTLE_MS)this.transitions.delete(id);
      else if(transition.previous&&this.time>=transition.previous.event.time+TAIL_SETTLE_MS)transition.previous=null;
    }
  }
  spawn(event,layout,previous){
    const slot=this.slots.find(s=>!s.event||this.time-s.event.time>=SWALLOW_MS)
      ??this.slots.reduce((a,b)=>a.event.time<b.event.time?a:b);
    const snake=event.snake,p=biteSnakeSample(snake,event.time,event.index,previous);
    slot.event=event;slot.from.set(layout.x(p.x),0,layout.z(p.y));
    slot.group.position.copy(slot.from);slot.group.scale.setScalar(1);
    slot.group.rotation.set(0,Math.atan2(p.dx||snake.dir.x*.00001,p.dy||snake.dir.y*.00001),0);
    slot.finish.setColor(snake.color);
    slot.tail.visible=event.kind==='tail';slot.body.visible=slot.accent.visible=event.kind==='body';slot.head.visible=event.kind==='head';
    slot.tail.rotation.y=0;
    if(event.kind==='tail'){
      const shape=biteTailShape(snake,event.time,previous);
      slot.tail.morphTargetInfluences[0]=shape.morph;
      slot.tail.position.y=shape.y;slot.tail.scale.set(MODEL_SCALE,MODEL_SCALE,shape.z);
    }else if(event.kind==='body'){
      const a=biteSnakeSample(snake,event.time,event.index-.5,previous),b=biteSnakeSample(snake,event.time,event.index+.5,previous);
      const span=Math.hypot(b.x-a.x,b.y-a.y)*CELL_SIZE*.96;
      for(const mesh of [slot.body,slot.accent]){mesh.position.y=.30*MODEL_SCALE;mesh.scale.set(MODEL_SCALE,MODEL_SCALE,span/plateLength);}
    }else if(event.kind==='head'){
      const growth=biteHeadGrowth(event.time,previous);
      slot.head.scale.setScalar(HEAD_SCALE*growth);slot.head.visible=growth>0;
      animateSnakeMouth(slot.head,snakeMouthOpening(snake.id,event.time));
      if(growth<1){
        const origin=biteHeadOrigin(previous),shape=biteTailShape(origin.event.snake,event.time,origin.previous);
        slot.tail.visible=true;slot.tail.rotation.y=Math.PI;slot.tail.position.y=shape.y;
        slot.tail.morphTargetInfluences[0]=shape.morph;
        slot.tail.scale.set(MODEL_SCALE*(1-growth),MODEL_SCALE*(1-growth),shape.z*(1-growth));
      }
    }
    copySnakeCore(slot.coreTail,slot.tail);copySnakeCore(slot.coreBody,slot.body);
    slot.group.visible=true;
  }
  update(player){
    player.updateWorldMatrix(true,false);
    if(this.updatedAt!==this.time)this.mouth.set(0,.285,.18).applyMatrix4(player.matrixWorld);
    this.updatedAt=this.time;
    this.bloom.update(this.time,this.mouth);
    for(const slot of this.slots){
      if(!slot.event)continue;
      const p=progress(slot.event,this.time,SWALLOW_MS);
      slot.group.visible=p<1;
      if(p>=1){slot.event=null;continue;}
      const swallow=smooth((p-.10)/.90),size=(1-swallow)**1.25;
      slot.group.position.lerpVectors(slot.from,this.mouth,smooth(p));
      // Brief lateral compression bulge, then the luminous piece shrinks into
      // the actual mouth. No fading circles, explosion or detached debris.
      slot.group.scale.set(size*(1+.14*Math.sin(Math.PI*p)),size,size*(1-.30*Math.sin(Math.PI*p)));
    }
    if(this.latest){
      const p=progress(this.latest,this.time,CHOMP_MS),jaw=player.userData.jaw;
      const rest=jaw.rotation.x;
      if(p<.25)jaw.rotation.x=mix(rest,.30,smooth(p/.25));
      else if(p<.72)jaw.rotation.x=mix(.30,.04,smooth((p-.25)/.47));
      else jaw.rotation.x=mix(.04,rest,smooth((p-.72)/.28));
      if(p>=1)this.latest=null;
    }
  }
}
