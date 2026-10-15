import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createSnakeNeonEyes} from '../src/render/snake-neon-eyes.js';
import {createEyeGlintPainter,EYE_REGION,eyeMaskPixels} from '../src/render/neon-eye-glints.js';
import {aggressionCadence} from '../src/render/neon-aggression-schedule.js';
import {createHybridProfile} from '../animation-lib/snake-ready-v1/snake-maze-walk/head-hybrid.js';
import {createMouthAtlas} from '../animation-lib/snake-ready-v1/snake-maze-walk/head-mouth-smooth.js';

const require=createRequire(import.meta.url);
let native;
try{native=require('@napi-rs/canvas');}
catch{native=require('C:/Users/tcher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');}
const {createCanvas,loadImage}=native;
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-8,`${label}: ${a} vs ${b}`);
const source=await loadImage(fileURLToPath(new URL('../animation-lib/snake-ready-v1/authored-snake-turns/assets/head-neck-sheet.png',import.meta.url)));
const profile=createHybridProfile({cell:{x:0,y:0,width:source.width/4,height:source.height/2}});
const full=createMouthAtlas(source,profile,createCanvas),atlas=createCanvas(full.image.width/2,full.image.height/2);
atlas.getContext('2d').drawImage(full.image,0,0,atlas.width,atlas.height);
full.image.width=full.image.height=1;
const art={image:atlas},head={x:60,y:55,angle:.45,alpha:1,sprite:{dx:0,dy:-11.8125,dw:37.8,dh:29.7,sw:112,sh:88}},geometry={head};
const output=createCanvas(160,140),ctx=output.getContext('2d');
const original=atlas.getContext('2d').getImageData(0,0,atlas.width,atlas.height).data;
const factory=()=>createSnakeNeonEyes({makeCanvas:createCanvas});

// Source eye stays rigid and registered in every mouth frame and all five
// palettes share this same authoritative collision artwork/alpha geometry.
const r=EYE_REGION,sourceEye=atlas.getContext('2d').getImageData(r.x,r.y,r.width,r.height).data;
for(let frame=1;frame<97;frame++)assert.deepEqual(
  atlas.getContext('2d').getImageData(frame%9*112+r.x,Math.floor(frame/9)*88+r.y,r.width,r.height).data,
  sourceEye,`Eye registration in mouth pose ${frame}`);
const mask=eyeMaskPixels(sourceEye);
for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
  const i=(y*r.width+x)*4,d=Math.hypot((r.x+x+.5-r.cx)/r.rx,(r.y+y+.5-r.cy)/r.ry);
  if(d>=1||Math.min(sourceEye[i],sourceEye[i+1])<=85)assert.equal(mask[i+3],0,'Pupil and outside-eye pixels do not emit');
  if(mask[i+3])assert.deepEqual([...mask.slice(i,i+3)],[255,247,214],'Accepted stronger champagne iris');
}

// Fail immediately if a visual call touches the gameplay random source or
// requests mutable AI state. Frozen entities also catch property writes.
const savedRandom=Math.random;
Math.random=()=>{throw Error('Rendering consumed gameplay RNG');};
try{
  const snake=Object.freeze({brainAggression:.7,color:'#35e55b',anger:3,
    get brainState(){throw Error('Rendering inspected mutable brain state');},
    get threatByPlayer(){throw Error('Rendering selected an AI target');}});
  const eyes=factory();
  const transform=ctx.getTransform().toJSON(),alpha=ctx.globalAlpha;
  assert.equal(eyes.draw(ctx,snake,geometry,art,1000000),false,'First activation begins at zero amplitude');
  assert.equal(eyes.draw(ctx,snake,geometry,art,1000350),true,'Game-time origin supports long-running sessions');
  assert.ok(ctx.getImageData(0,0,160,140).data.some((v,i)=>i%4===3&&v>0),'Real iris and fringe pixels were drawn');
  assert.deepEqual(ctx.getTransform().toJSON(),transform);close(ctx.globalAlpha,alpha,'Caller alpha restored');
  assert.equal(ctx.globalCompositeOperation,'source-over');
  const paused=eyes.diagnostics();
  for(let i=0;i<20;i++)eyes.draw(ctx,snake,geometry,art,1000350);
  assert.equal(eyes.diagnostics().lastLevel,paused.lastLevel,'Frozen game clock freezes pulse exactly');
  assert.equal(eyes.diagnostics().events,paused.events,'Repainting does not schedule duplicate pulses');
  assert.equal(eyes.diagnostics().painter.pixelReads,1,'Repeated drawing never re-reads eye pixels');
  assert.equal(eyes.diagnostics().painter.builds,1);
  assert.equal(eyes.diagnostics().gameplayRandomCalls,0);

  const missing=factory();
  for(const s of [{},{brainAggression:NaN},{brainAggression:Infinity},{anger:100,temperament:1}])
    assert.equal(missing.draw(ctx,s,geometry,art,400),false,'Missing authoritative attention is not an invented mood');
  assert.equal(missing.diagnostics().created,0);assert.equal(missing.diagnostics().events,0);
  assert.equal(missing.diagnostics().painter,null);
  const calm=factory(),calmSnake=Object.freeze({brainAggression:0});
  for(let t=0;t<=60000;t+=100)calm.draw(ctx,calmSnake,geometry,art,t);
  assert.equal(calm.diagnostics().events,0,'Calm AI does not produce automatic eye flashes');

  // More aggressive real attention changes only cadence, not the pulse peak.
  const low=factory(),high=factory(),lowSnake=Object.freeze({brainAggression:.2}),highSnake=Object.freeze({brainAggression:1});
  const lostTarget={isContextLost:()=>true}; // Schedule still advances without expensive painting.
  for(let t=0;t<=300000;t+=20){
    low.draw(lostTarget,lowSnake,geometry,art,t);high.draw(lostTarget,highSnake,geometry,art,t);
    assert.ok(low.diagnostics().lastLevel>=0&&low.diagnostics().lastLevel<=1);
    assert.ok(high.diagnostics().lastLevel>=0&&high.diagnostics().lastLevel<=1);
  }
  assert.ok(high.diagnostics().events>low.diagnostics().events*2,'Aggressive snake blinks significantly more frequently');
  assert.equal(aggressionCadence(1).min,2500);
  assert.equal(low.diagnostics().painter,null,'Lost output context does not trigger texture allocation');

  const identities=factory(),first={brainAggression:.7},second={brainAggression:.7};
  identities.draw(lostTarget,first,geometry,art,0);identities.draw(lostTarget,second,geometry,art,0);
  assert.equal(identities.diagnostics().created,2,'Identical sprites retain separate snake identities');
  const initialEvents=identities.diagnostics().events;
  for(let t=20;t<=12000;t+=20)identities.draw(lostTarget,second,geometry,art,t);
  assert.ok(identities.diagnostics().events-initialEvents<=4,'Removed snake has no background timer or further events');
  identities.draw(lostTarget,{brainAggression:.7},geometry,art,12020);
  assert.equal(identities.diagnostics().created,3,'Split replacement gets its own visual state');

  // AI changes queued while paused apply on resume, not through a camera paint.
  const pausedEyes=factory(),mutable={brainAggression:.2};
  pausedEyes.draw(lostTarget,mutable,geometry,art,100);pausedEyes.draw(lostTarget,mutable,geometry,art,300);
  const pulse=pausedEyes.diagnostics().lastLevel;mutable.brainAggression=.9;
  pausedEyes.draw(lostTarget,mutable,geometry,art,300);
  assert.equal(pausedEyes.diagnostics().lastAggression,.2);assert.equal(pausedEyes.diagnostics().lastLevel,pulse);
  pausedEyes.draw(lostTarget,mutable,geometry,art,320);assert.equal(pausedEyes.diagnostics().lastAggression,.9);
  pausedEyes.draw(lostTarget,mutable,geometry,art,10);
  assert.equal(pausedEyes.diagnostics().clockRestarts,1,'Rewound scene clock safely rebases this snake only');
  assert.equal(pausedEyes.diagnostics().lastLevel,0);
  eyes.reset();assert.equal(eyes.diagnostics().created,0);assert.equal(eyes.diagnostics().painter,null);
  eyes.draw(ctx,snake,geometry,art,30);eyes.draw(ctx,snake,geometry,art,350);
  assert.equal(eyes.diagnostics().created,1);assert.equal(eyes.diagnostics().painter.pixelReads,1,'Reset builds one clean eye cache');
}finally{Math.random=savedRandom;}

// Every palette uses one tiny source-registered mask; no tint changes its size.
let palettePixels=null;
for(const color of ['#35e55b','#ffe57a','#66c2ff','#d66bff','#ff8873']){
  const eyes=factory(),snake={color,brainAggression:.7};ctx.clearRect(0,0,160,140);
  eyes.draw(ctx,snake,geometry,art,0);eyes.draw(ctx,snake,geometry,art,350);
  const pixels=ctx.getImageData(0,0,160,140).data;
  if(palettePixels)assert.deepEqual(pixels,palettePixels,'All palette eyes share the exact original registration');
  palettePixels=pixels;eyes.reset();
}
assert.deepEqual(atlas.getContext('2d').getImageData(0,0,atlas.width,atlas.height).data,original,'Original source atlas remains byte-for-byte unchanged');

// Exercise both real cache surfaces with context loss/recovery. No full atlas
// cache or new surfaces are allocated by steady-state animation/recovery.
const surfaces=[],lost=new Map(),listeners=new Map();
function trackedCanvas(width,height){
  const canvas=createCanvas(width,height),context=canvas.getContext('2d');
  lost.set(canvas,false);listeners.set(canvas,{});
  context.isContextLost=()=>lost.get(canvas);
  canvas.addEventListener=(name,listener)=>{listeners.get(canvas)[name]=listener;};
  surfaces.push(canvas);return canvas;
}
const painter=createEyeGlintPainter(art,trackedCanvas);
assert.equal(painter.draw(ctx,head,.8),true);
assert.equal(surfaces.length,2);assert.equal(painter.stats().pixelReads,1);
for(const canvas of surfaces){
  lost.set(canvas,true);listeners.get(canvas).contextlost();
  assert.equal(painter.draw(ctx,head,.8),false,'Lost eye cache is never copied');
  lost.set(canvas,false);listeners.get(canvas).contextrestored();
  assert.equal(painter.draw(ctx,head,.8),true,'Both iris and fringe rebuild after restore');
}
assert.equal(surfaces.length,2,'Restoration reuses bounded cache surfaces');
assert.equal(painter.stats().builds,3);assert.equal(painter.stats().pixelReads,3);
assert.equal(painter.stats().cachedBytes,(20*13+40*33)*4);
painter.dispose();assert.equal(painter.stats().cachedBytes,0);
assert.ok(surfaces.every(c=>c.width===1&&c.height===1));assert.equal(painter.draw(ctx,head,1),false);
console.log('Production neon eyes: exact authored iris/fringe, all palette/97-frame registration, cached AI attention only, zero gameplay RNG/entity mutation, independent identity/cadence, frozen/rebased clocks, reset and context recovery passed.');
