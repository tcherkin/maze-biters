import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createCreatureNeonEyes,createHunterEyeMasks,dragonEyeFragment} from '../src/render/creature-neon-eyes.js';
import {loadDragonKinArt} from '../src/render/dragon-kin-art.js';
import {composeFantasyPose} from '../src/render/fantasy-player-art.js';
import {createDragonTurnRenderer} from '../src/render/dragon-turn/renderer.js';
import {dragonTurnRig} from '../src/render/dragon-turn/rig.js';
import {createLiveScorpion} from '../src/render/live-scorpion.js';
import {planTurn,sampleTurn,DIRECTIONS} from '../src/render/fantasy-turn/turn.js';
const require=createRequire(import.meta.url);let native;
try{native=require('@napi-rs/canvas');}catch{native=require('C:/Users/tcher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');}
const {createCanvas,loadImage}=native;
const resources=[],makeCanvas=(w=1,h=w)=>{const c=createCanvas(w,h),listeners=new Map();c.addEventListener=(n,f)=>listeners.set(n,f);c.removeEventListener=(n,f)=>{if(listeners.get(n)===f)listeners.delete(n);};c.lose=()=>listeners.get('contextlost')?.();resources.push(c);return c;};
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
const mass=c=>pixels(c).reduce((n,v,i)=>n+(i%4===3?v:0),0);
const report={nativeMaskChecks:0,endpointChecks:0,turnCalls:0,lifecycleChecks:0,scorpionPoses:0};
const shader=dragonEyeFragment(dragonTurnRig.fragment);
assert.ok(shader.includes('farOwner=smoothstep(')&&shader.includes('paint=backSurface('));
assert.ok(!shader.includes('if(uBack>.5)cylindricalCrown('));
assert.ok(!shader.includes('a=cleanScaleSource(a,'));
assert.throws(()=>dragonEyeFragment('wrong anatomy'),/anatomy changed/);
function fakeGL(){let next=1;const resources=new Set(),enums=new Map();return new Proxy({resources,isContextLost:()=>false,getExtension:()=>({loseContext(){}})}, {get(t,k){
  if(k in t)return t[k];if(/^[A-Z0-9_]+$/.test(k)){if(!enums.has(k))enums.set(k,next++);return enums.get(k);}
  if(/^create(Shader|Program|Buffer|Texture)$/.test(k))return()=>{const o={id:next++};resources.add(o);return o;};
  if(/^delete(Shader|Program|Buffer|Texture)$/.test(k))return o=>resources.delete(o);
  if(k==='getShaderParameter'||k==='getProgramParameter')return()=>true;
  if(k==='getUniformLocation')return()=>({});return()=>{};
}});}
for(const profile of ['hd','4k']){
  const pack=await loadDragonKinArt(profile,{makeCanvas,fetchJSON:async url=>JSON.parse(await readFile(url,'utf8')),loadImage:async url=>loadImage(fileURLToPath(url))});
  const start=resources.length,masks=createHunterEyeMasks({arts:new Map(Object.entries(pack.sets)),makeCanvas});
  assert.equal(masks.diagnostics().sourceReads,9);
  const out=makeCanvas(pack.size),ctx=out.getContext('2d');
  for(const palette of ['h1','h3','h4'])for(const dir of DIRECTIONS){
    let previous=Infinity;
    for(let blink=0;blink<25;blink++){
      ctx.clearRect(0,0,pack.size,pack.size);assert.equal(masks.draw(ctx,`${palette}:normal`,dir,blink/24,0,0,pack.size),true);
      const sum=mass(out);if(dir==='up'||blink===24)assert.equal(sum,0,'rear or closed eyelid never emits');
      else if(blink===0)assert.ok(sum>0,'authored iris core exists');
      assert.ok(sum<=previous,'closing lids never increase exposed core');previous=sum;report.nativeMaskChecks++;
    }
  }
  const gl=fakeGL(),surfaces=[],listeners=new Map(),factory=()=>{const c=makeCanvas(pack.size),get=c.getContext.bind(c);
    c.getContext=(name,...args)=>name==='webgl'?gl:get(name,...args);c.addEventListener=(n,f)=>listeners.set(n,f);c.removeEventListener=(n,f)=>{if(listeners.get(n)===f)listeners.delete(n);};surfaces.push(c);return c;};
  const source=makeCanvas(pack.size),sc=source.getContext('2d');
  const drawPose=(ctx,key,dir,closure,blink,x,y,size)=>{composeFantasyPose(sc,pack.sets[`${key}:${dir}`],Math.round(closure*48),Math.round(blink*24));ctx.drawImage(source,x,y,size,size);};
  const renderer=createDragonTurnRenderer({size:pack.size,drawPose,drawEyeMaskPose:masks.draw,canvasFactory:factory,artRig:dragonTurnRig});
  for(const from of DIRECTIONS)for(const to of DIRECTIONS)if(from!==to)for(const t of [0,.25,.5,.75,1])for(const blink of [0,12,24]){
    const pose=sampleTurn(planTurn(from,to),t);ctx.clearRect(0,0,pack.size,pack.size);
    renderer.drawEyeMask(ctx,'h1:normal',pose,18/48,blink/24,0,0,pack.size);report.turnCalls++;
    if(pose.from===pose.to||pose.mix===0||pose.mix===1){
      const actual=Buffer.from(pixels(out));ctx.clearRect(0,0,pack.size,pack.size);
      masks.draw(ctx,'h1:normal',pose.mix===1?pose.to:pose.from,blink/24,0,0,pack.size);
      assert.deepEqual(Buffer.from(pixels(out)),actual,'exact native mask endpoints');report.endpointChecks++;
    }
  }
  assert.equal(renderer.diagnostics().capBuildCount,0,'eye pass does not prepare hidden cap material');
  assert.throws(()=>renderer.drawMask(ctx,'h1:normal',{from:'right',to:'up',mix:.5},0,0,0,pack.size),/No turn aperture/);
  listeners.get('webglcontextlost')({preventDefault(){}});assert.throws(()=>renderer.drawEyeMask(ctx,'h1:normal',{from:'right',to:'up',mix:.5},0,0,0,0,pack.size),/unavailable/);
  renderer.dispose();renderer.dispose();assert.equal(gl.resources.size,0);assert.equal(renderer.diagnostics().nativeSurfaceCount,0);
  assert.ok(surfaces.every(c=>c.width===1&&c.height===1));report.lifecycleChecks+=4;
  resources.slice(start).find(c=>c.width>1).lose();assert.equal(masks.valid,false);assert.equal(masks.draw(ctx,'h1:normal','right',0,0,0,pack.size),false);
  masks.dispose();assert.equal(masks.diagnostics().bytes,0);report.lifecycleChecks+=3;
  const failedGL=fakeGL(),failedFactory=()=>{const c=makeCanvas(pack.size),get=c.getContext.bind(c);c.getContext=(name,...args)=>name==='webgl'?failedGL:get(name,...args);return c;};
  const failed=createDragonTurnRenderer({size:pack.size,drawPose,drawEyeMaskPose(){},canvasFactory:failedFactory,artRig:dragonTurnRig});
  const previousResources=failedGL.resources.size,createTexture=failedGL.createTexture;let attempted=0;
  failedGL.createTexture=()=>{if(++attempted===2)throw Error('Simulated optional eye allocation failure');return createTexture();};
  const eyeCall=()=>failed.drawEyeMask(ctx,'h1:normal',{from:'right',to:'down',mix:.5},0,0,0,0,pack.size);
  assert.throws(eyeCall,/optional eye allocation/);assert.equal(failedGL.resources.size,previousResources);
  assert.throws(eyeCall,/optional eye allocation/);assert.equal(attempted,2,'failed optional effect never retries/leaks per frame');
  assert.equal(failed.diagnostics().disposed,false);assert.ok(failed.diagnostics().eyeFailure);
  failed.draw(ctx,'h1:normal',{from:'right',to:'down',mix:.5},0,0,0,0,pack.size);
  failed.dispose();assert.equal(failedGL.resources.size,0);report.lifecycleChecks+=5;
}
const eyes=createCreatureNeonEyes({makeCanvas,loadImage:async url=>loadImage(fileURLToPath(url))});
assert.equal(await eyes.prepare(),true);assert.equal(eyes.diagnostics().sourceReads,2);
const output=makeCanvas(400),context=output.getContext('2d'),scorpion=createLiveScorpion({tile:160});
for(const route of [0,1,2]){
  const entity={x:1,y:0,tailX:0,tailY:0,dir:{x:1,y:0},moveStartedAt:0,lastMove:0};
  if(route===1)Object.assign(entity,{x:1,y:1,tailX:1,tailY:0,dir:{x:0,y:1}});
  if(route===2)Object.assign(entity,{x:0,y:0,tailX:1,tailY:0,dir:{x:-1,y:0}});
  scorpion.recordStep(entity,{oldHead:{x:1,y:0},oldTail:{x:0,y:0},oldDir:{x:1,y:0},t:0,duration:218,nativeDelay:218});
  for(const t of [0,33,70,109,146,185,218]){
    const pose=scorpion.sample(entity,t);context.clearRect(0,0,400,400);context.save();context.translate(80,100);
    assert.equal(eyes.drawScorpionMask(context,pose,160),true);context.restore();assert.ok(mass(output)>0);report.scorpionPoses++;
  }
}
assert.equal(eyes.diagnostics().sourceReads,2,'no live scorpion pixel reads');
const random=Math.random;Math.random=()=>{throw Error('Gameplay RNG touched');};
try{
  const entity=Object.freeze({brainAggression:.7,get anger(){throw Error('AI mood inferred');}});
  assert.equal(eyes.observe(entity,10000,'hunter'),0);const pulse=eyes.observe(entity,10350,'hunter');assert.ok(pulse>0);
  for(let i=0;i<20;i++)assert.equal(eyes.observe(entity,10350,'hunter'),pulse);
  const count=eyes.diagnostics().events;eyes.observe(entity,10350,'scorpion');assert.equal(eyes.diagnostics().created,2,'families have independent identities');
  eyes.observe(entity,10000,'hunter');assert.equal(eyes.diagnostics().clockRestarts,1);
  assert.equal(eyes.observe(Object.freeze({anger:100}),1,'hunter'),0);assert.equal(eyes.diagnostics().missing,1);
  assert.ok(eyes.diagnostics().events>=count);eyes.reset();assert.equal(eyes.diagnostics().created,0);assert.equal(eyes.observe(entity,0,'hunter'),0);
  assert.equal(eyes.diagnostics().ready,true,'schedule reset preserves valid immutable masks');
}finally{Math.random=random;}
const scorpionMask=resources.find(c=>c.width===176&&c.height===80);scorpionMask.lose();assert.equal(eyes.diagnostics().ready,false);
assert.equal(await eyes.prepare(),true);assert.equal(eyes.diagnostics().sourceReads,4);
const silentlyLost=resources.find(c=>c.width===176&&c.height===80);silentlyLost.getContext('2d').isContextLost=()=>true;
assert.equal(await eyes.prepare(),true,'polled context loss rebuilds even without an event');assert.equal(eyes.diagnostics().sourceReads,6);
eyes.dispose();assert.equal(eyes.diagnostics().maskBytes,0);
assert.equal(await eyes.prepare(),false);report.lifecycleChecks+=4;
let failedLoads=0;
const unavailable=createCreatureNeonEyes({makeCanvas,loadImage:async()=>{failedLoads++;throw Error('Atlas unavailable');}});
for(let i=0;i<40;i++)assert.equal(await unavailable.prepare(),false);
assert.equal(failedLoads,1,'per-frame warmup cannot retry a failed asset');assert.equal(unavailable.diagnostics().failed,true);
unavailable.reset();assert.equal(await unavailable.prepare(),false);assert.equal(failedLoads,2,'explicit reset permits one new attempt');unavailable.dispose();report.lifecycleChecks+=3;
console.log(JSON.stringify({passed:true,...report,note:'Real native mask pixels and simulated GPU API/lifecycle only; real turn shader pixels need browser QA.'},null,2));
