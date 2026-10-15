// Native capture pixels plus simulated GPU protocol. This does not substitute
// for browser shader/glow verification of the integrated scene.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {createCreatureNeon} from '../src/render/creature-neon.js';
const require=createRequire(import.meta.url);let native;
for(const location of ['@napi-rs/canvas',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')]){try{native=require(location);break;}catch{}}
assert.ok(native,'Native Canvas dependency required');const {createCanvas}=native;
const report={capture:0,fallback:0,recovery:0,bounds:0};
function fixture({gpu=false}={}){
  const surfaces=[],metadata=new WeakMap(),resources=new Set();let reads=0,uploads=0,passes=0,throwUpload=false,resets=0;
  function fakeGL(){
    const enums=new Map();let next=1;
    return new Proxy({isContextLost:()=>false,getExtension:()=>({loseContext(){}})},{get(target,key){
      if(key in target)return target[key];
      if(/^[A-Z0-9_]+$/.test(key)){if(!enums.has(key))enums.set(key,next++);return enums.get(key);}
      if(/^create(Shader|Program|Buffer|Texture)$/.test(key))return()=>{const value={kind:key};resources.add(value);return value;};
      if(/^delete/.test(key))return value=>resources.delete(value);
      if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
      if(key==='getUniformLocation')return()=>({});
      if(key==='getShaderInfoLog'||key==='getProgramInfoLog')return()=>'';
      if(key==='readPixels')return()=>{throw Error('Forbidden GPU pixel readback');};
      if(key==='texImage2D')return()=>{if(throwUpload)throw Error('injected upload failure');uploads++;};
      if(key==='drawArrays')return()=>{passes++;};
      return()=>{};
    }});
  }
  const makeCanvas=(width,height)=>{
    const canvas=createCanvas(width,height),get=canvas.getContext.bind(canvas),events=new Map();
    const meta={events,context:null,read:null,lost:false,gl:null};metadata.set(canvas,meta);
    canvas.getContext=(kind,...args)=>{
      if(kind==='webgl')return gpu?(meta.gl??=fakeGL()):null;
      const ctx=get(kind,...args);
      if(!meta.context){meta.context=ctx;meta.read=ctx.getImageData.bind(ctx);ctx.getImageData=(...values)=>{reads++;return meta.read(...values);};ctx.isContextLost=()=>meta.lost;}
      return ctx;
    };
    canvas.addEventListener=(name,listener)=>{const handlers=events.get(name)||new Set();handlers.add(listener);events.set(name,handlers);};
    canvas.removeEventListener=(name,listener)=>events.get(name)?.delete(listener);
    surfaces.push(canvas);return canvas;
  };
  const eyes={reset(){resets++;},diagnostics:()=>({resets})},service=createCreatureNeon({makeCanvas,eyes});
  const pixel=(surface,x,y)=>Array.from(metadata.get(surface).read(x,y,1,1).data);
  const event=(surface,name)=>{for(const listener of metadata.get(surface).events.get(name)||[])listener({preventDefault(){}});};
  return{service,surfaces,metadata,resources,pixel,event,setUploadFailure:value=>{throwUpload=value;},counts:()=>({reads,uploads,passes,resets})};
}
const bounds={minX:10.13,minY:20.17,maxX:26.13,maxY:36.17};
const matrix=ctx=>{const m=ctx.getTransform();return[m.a,m.b,m.c,m.d,m.e,m.f];};
const f=fixture(),actor=Object.freeze({x:11,y:21,dir:Object.freeze({x:1,y:0}),mouth:18,blink:4});
const actorBefore=JSON.stringify(actor);let calls=0,eyes=0,bodyMatrix,eyeMatrix;
const first=f.service.prepare({kind:'hunter',bounds,scale:5,level:.5,draw(ctx,paintEye){
  calls++;bodyMatrix=matrix(ctx);ctx.fillStyle='#2050a0';ctx.fillRect(actor.x,actor.y,2,2);
  paintEye(mask=>{eyes++;eyeMatrix=matrix(mask);mask.fillStyle='#fff';mask.fillRect(actor.x,actor.y,2,2);return true;});
}});
assert.ok(first);assert.equal(calls,1);assert.equal(eyes,1);assert.deepEqual(bodyMatrix,[5,0,0,5,-50,-100]);assert.deepEqual(eyeMatrix,bodyMatrix);
assert.equal(first.left,10);assert.equal(first.top,20);assert.equal(first.image.width,96);assert.equal(first.mask.height,96);
assert.equal(first.width,96/5);assert.equal(first.height,96/5);assert.equal(first.artwork,first.image);assert.equal(first.emission,null);
const maskReference=createCanvas(1,1),mr=maskReference.getContext('2d');
mr.fillStyle='white';mr.fillRect(0,0,1,1);mr.globalCompositeOperation='source-in';mr.fillStyle='#fff6cb';mr.globalAlpha=.5;mr.fillRect(0,0,1,1);
// Compare this native backend's source-in/globalAlpha result; browser alpha
// rounding is covered separately by the real-browser compositor checks.
assert.equal(f.pixel(first.image,7,7)[3],255);assert.deepEqual(f.pixel(first.mask,7,7),Array.from(mr.getImageData(0,0,1,1).data));
assert.equal(f.counts().reads,0,'capture and fallback do not read native pixels');assert.equal(JSON.stringify(actor),actorBefore);
assert.equal(first.eyeImage,first.mask);report.capture+=18;
const second=f.service.prepare({kind:'hunter',bounds,scale:5,level:0,draw(ctx,paintEye){
  calls++;ctx.fillStyle='#e03040';ctx.fillRect(20,30,2,2);paintEye(()=>{eyes++;throw Error('zero pulse must skip masks');});
}});
assert.equal(second,first);assert.equal(calls,2);assert.equal(eyes,1);assert.equal(second.eyeImage,null);
assert.equal(f.pixel(second.image,7,7)[3],0,'prior actor colour is fully cleared');assert.equal(f.pixel(second.mask,7,7)[3],0,'prior pulse cannot persist');
assert.equal(second.emission,null);assert.equal(f.service.stats().materials.hunter.failed,true);
const allocated=f.surfaces.length;
for(let i=0;i<8;i++)f.service.prepare({kind:'hunter',bounds,scale:5,draw(ctx){calls++;ctx.fillRect(11,21,1,1);}});
assert.equal(f.surfaces.length,allocated,'unsupported GPU does not allocate per frame');assert.equal(calls,10);report.fallback+=10;

// A working GPU may fail after a previous luminous frame: old borrowed outputs
// must never be offered as current emission, and fresh native pixels survive.
const g=fixture({gpu:true});let gpuCalls=0;
const paint=(color,x=11)=>(ctx)=>{gpuCalls++;ctx.fillStyle=color;ctx.fillRect(x,21,2,2);};
const lit=g.service.prepare({kind:'hunter',bounds,scale:5,draw:paint('red')});assert.ok(lit.emission);const oldEmission=lit.emission;
assert.equal(g.counts().uploads,1);assert.equal(g.counts().passes,2);
g.setUploadFailure(true);const failed=g.service.prepare({kind:'hunter',bounds,scale:5,draw:paint('blue',20)});
assert.equal(gpuCalls,2);assert.equal(failed.emission,null);assert.equal(failed.artwork,failed.image);assert.equal(oldEmission.width,1);
assert.equal(g.pixel(failed.image,7,7)[3],0);assert.deepEqual(g.pixel(failed.image,52,7),[0,0,255,255]);assert.equal(g.resources.size,0);
g.setUploadFailure(false);g.service.prepare({kind:'hunter',bounds,scale:5,draw:paint('green')});assert.equal(g.counts().uploads,1,'failure stays latched until invalidation');
g.service.invalidate();assert.ok(g.service.prepare({kind:'hunter',bounds,scale:5,draw:paint('red')}).emission);assert.equal(g.counts().uploads,2);report.fallback+=12;

for(const surface of [first.image,first.mask]){
  const before=calls;f.event(surface,'contextlost');
  assert.equal(f.service.prepare({kind:'hunter',bounds,scale:5,draw(){calls++;}}),null);
  assert.equal(calls,before,'event-only capture loss uses native caller fallback without sampling pose again');
  f.event(surface,'contextrestored');
  const recovered=f.service.prepare({kind:'hunter',bounds,scale:5,draw(ctx){calls++;ctx.fillStyle='white';ctx.fillRect(11,21,2,2);}});
  assert.ok(recovered);assert.equal(f.pixel(recovered.image,7,7)[3],255);assert.equal(recovered.dirty,false);report.recovery+=5;
}
assert.throws(()=>f.service.prepare({kind:'hunter',bounds,scale:5,draw(ctx){
  ctx.save();ctx.beginPath();ctx.rect(10,20,.2,.2);ctx.clip();ctx.translate(900,900);throw Error('injected actor failure');
}}),/injected actor failure/);
assert.equal(first.dirty,true);
const repaired=f.service.prepare({kind:'hunter',bounds,scale:5,draw(ctx){assert.deepEqual(matrix(ctx),bodyMatrix);ctx.fillStyle='white';ctx.fillRect(11,21,2,2);}});
assert.equal(f.pixel(repaired.image,7,7)[3],255,'dirty capture resets leaked save/clip state before the next actor');report.recovery+=3;

// Optional eye failures are swallowed by design, but a failed eye callback
// must not poison later masks via an unbalanced save/clip stack.
const brokenEye=f.service.prepare({kind:'hunter',bounds,scale:5,level:1,draw(ctx,paintEye){
  ctx.fillRect(11,21,2,2);paintEye(mask=>{mask.save();mask.beginPath();mask.rect(10,20,.2,.2);mask.clip();throw Error('injected eye failure');});
}});
assert.equal(brokenEye.eyeImage,null);
const eyeRepaired=f.service.prepare({kind:'hunter',bounds,scale:5,level:1,draw(ctx,paintEye){
  ctx.fillRect(11,21,2,2);paintEye(mask=>{mask.fillStyle='white';mask.fillRect(11,21,2,2);return true;});
}});
assert.equal(f.pixel(eyeRepaired.mask,7,7)[3],255,'eye callback failure cannot leave a persistent clip');report.recovery+=2;

const p=fixture();let boundCalls=0;
const prepare=(kind,b,scale)=>p.service.prepare({kind,bounds:b,scale,draw(){boundCalls++;}});
const small=prepare('hunter',{left:0,top:0,right:18,bottom:18},5);assert.equal(small.image.width,96);
const large=prepare('scorpion',{left:0,top:0,right:66,bottom:66},10);assert.equal(large.image.width,672);assert.notEqual(large.image,small.image);
assert.equal(p.service.stats().pools,2);assert.equal(small.image.width,96,'scorpion capacity cannot inflate the hunter pool');
assert.equal(prepare('scorpion',{left:0,top:0,right:40,bottom:40},10).image.width,672,'same-quality reserve avoids resize churn');
assert.equal(prepare('scorpion',{left:0,top:0,right:66,bottom:66},5).image.width,352,'quality change releases oversized reserve');
assert.equal(prepare('hunter',{left:0,top:0,right:18,bottom:18},10).image.width,192);
const before=boundCalls,allocations=p.surfaces.length;
for(const [kind,b,scale]of [['bad',bounds,5],['hunter',{left:0,top:0,right:1000,bottom:1},10],['hunter',bounds,NaN],['hunter',{left:2,top:2,right:1,bottom:3},5]])assert.equal(prepare(kind,b,scale),null);
assert.equal(boundCalls,before);assert.equal(p.surfaces.length,allocations);assert.equal(p.service.stats().runtimePixelReads,0);
p.service.invalidate();assert.equal(small.image.width,1);assert.equal(large.mask.height,1);assert.equal(p.service.stats().bytes,16);assert.equal(p.counts().resets,1);
assert.ok(prepare('hunter',bounds,5));p.service.reset();assert.equal(p.counts().resets,2);assert.equal(JSON.stringify(actor),actorBefore);report.bounds+=17;
g.service.invalidate();f.service.invalidate();p.service.invalidate();assert.equal(g.resources.size,0);
assert.equal(f.counts().reads+g.counts().reads+p.counts().reads,0);
console.log(JSON.stringify({passed:true,...report,interpretation:'Native capture/mask pixels, bounds, callback count and failure recovery; fake GPU validates resource protocol only, not final shader pixels.'},null,2));
