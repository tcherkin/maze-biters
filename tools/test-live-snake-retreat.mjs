import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';
import {createMaterialCurve} from '../src/render/live-snake-curve.js?v=1.02.03.00';

// Exercise actual production retreat commits, then observe the presentation
// immediately before/after each commit. A collection of pretty in-step frames
// cannot catch a new path replacing an already occupied tail-side corner.
const engine=readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function fn(name){
  const start=engine.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));assert.ok(start>=0);
  for(let end=engine.indexOf('}',start);end>=0;end=engine.indexOf('}',end+1)){
    const text=engine.slice(start,end+1);try{new vm.Script(text);return text;}catch{}
  }
  throw Error(`Unterminated ${name}`);
}
const directions=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const clone=value=>JSON.parse(JSON.stringify(value));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const delta=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const failures=[];
// A held endpoint can be captured repeatedly. This must remain a bounded
// immutable path, not 20,000 nested delegation closures or a recursive sample.
{
  const line={sample(s,out={}){return Object.assign(out,{x:s,y:0,tx:1,ty:0,angle:0,curve:0});},
    ribbonSpan(s,maximum){return maximum;}};
  let path=line;
  for(let i=0;i<20000;i++)path=createMaterialCurve(path,0,2.5,line,0,2.5);
  const sample=path.sample(1.25);
  assert.equal(sample.x,1.25);assert.equal(sample.y,0);assert.equal(sample.angle,0);
}
let commits=0,samples=0,maxTailJump=0,maxRearJump=0,maxAngleJump=0,maxOverhang=0,maxFoldRatio=0,worldSamples=0;
function check(condition,message){if(!condition)failures.push(message);}
function compareCommit(before,after,label){
  const tailJump=delta(before.tail,after.tail),rearJump=delta(before.rear,after.rear);
  const angleJump=Math.abs(wrap(after.tail.angle-before.tail.angle));
  maxTailJump=Math.max(maxTailJump,tailJump);maxRearJump=Math.max(maxRearJump,rearJump);maxAngleJump=Math.max(maxAngleJump,angleJump);
  check(tailJump<1e-4,`${label}: tail teleports ${tailJump.toFixed(6)} reference pixels`);
  check(rearJump<1e-4,`${label}: head attachment teleports ${rearJump.toFixed(6)} reference pixels`);
  check(angleJump<1e-5,`${label}: tail tangent snaps ${(angleJump*180/Math.PI).toFixed(6)} degrees`);commits++;
}
function run(length,rotation,mirror,color,kind){
  const transform=({x,y})=>{
    let a=x,b=y*mirror;for(let i=0;i<rotation;i++)[a,b]=[-b,a];return {x:20+a,y:20+b};
  };
  const vector=({x,y})=>{const a=transform({x,y}),b=transform({x:0,y:0});return {x:a.x-b.x,y:a.y-b.y};};
  const s={body:Array.from({length},(_,i)=>transform({x:length-1-i,y:0})),dir:vector({x:1,y:0}),
    reversing:false,color,reverseSteps:0,tailGuideHistory:[]};
  const service=createLiveSnakeRenderer();service.capture(s,0);
  assert.equal(service.surfaceSpeedBound(s,0,100),0,'initial static pose needs no moving-surface allowance');
  const route=kind==='double'
    ?[{x:-1,y:0},{x:-1,y:1},{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:3,y:2},{x:3,y:3}]
    :Array.from({length:12},(_,i)=>({x:-1-Math.floor(i/2),y:Math.ceil(i/2)}));
  const native=vm.createContext({s,dirs:directions,canEnter:()=>false,playerAt:()=>null,
    chooseTailRetreatDirection(){throw Error('A legal one-way fixture has no AI choice');}});
  vm.runInContext(fn('retreatOneStep'),native);
  let t=0;
  for(let index=0;index<route.length;index++){
    const before=service.inspect(s,t),oldBody=clone(s.body),wasReversing=s.reversing,next=transform(route[index]);
    const oldTail=s.body.at(-1),beforeTail=s.body.at(-2);
    if(!s.tailGuide)s.tailGuide={...oldTail,dir:{x:oldTail.x-beforeTail.x,y:oldTail.y-beforeTail.y}};
    s.reversing=true;
    native.canEnter=(x,y)=>x===next.x&&y===next.y;
    check(!s.body.slice(1).some(p=>p.x===next.x&&p.y===next.y),'fixture does not enter an occupied body cell');
    assert.equal(vm.runInContext('retreatOneStep(s)',native),true);
    const logicalAfter=JSON.stringify(s);
    service.recordStep(s,{oldBody,t,duration:436,wasReversing});
    assert.equal(JSON.stringify(s),logicalAfter,'visual adapter cannot change production retreat, guide, direction or cells');
    compareCommit(before,service.inspect(s,t),`${kind}/${length}/${rotation}/${mirror}/${index}`);
    for(let frame=0;frame<=64;frame++){
      const pose=service.inspect(s,t+436*frame/64);
      check([pose.tail.x,pose.tail.y,pose.tail.angle,pose.rear.x,pose.rear.y,pose.rear.angle,pose.length,pose.compression].every(Number.isFinite),'finite reverse geometry');
      check(pose.length>0&&pose.length<=length*36+1e-6,'rounded-route visual capacity cannot grow beyond material length');
      const world=service.getWorldGeometry(s,t+436*frame/64),tip=world.sample(0),head=world.head;
      check(delta(tip,{x:pose.tail.x*16/36,y:pose.tail.y*16/36})<1e-8,'authoritative tip equals rendered tip');
      check(delta(head,{x:pose.rear.x*16/36,y:pose.rear.y*16/36})<1e-8,'authoritative head attachment equals painted head');
      for(let p=0;p<=32;p++){
        const point=world.sample(world.bodyEndDistance*p/32),fold=Math.abs(point.curve)*world.diameter/2;
        maxFoldRatio=Math.max(maxFoldRatio,fold);
        check(fold<1,`${kind}/${length}/${index}/${frame}: curve folds inner edge ${fold}`);
        check(Math.abs(Math.hypot(point.tx,point.ty)-1)<1e-6,'arclength tangent stays unit');
        worldSamples++;
      }
      samples++;
    }
    const end=service.inspect(s,t+436),tail=s.body.at(-1),overhang=Math.hypot(end.tail.x-(tail.x+.5)*36,end.tail.y-(tail.y+.5)*36);
    maxOverhang=Math.max(maxOverhang,overhang);
    check(overhang<=36,`${kind}/${length}/${index}: tail drifts ${overhang.toFixed(3)}px from its own cell after rounded corners`);
    // Retreat must use the supplied436ms native interval, not double it again.
    assert.deepEqual(service.inspect(s,t+436),service.inspect(s,t+600),'one completed half-speed native step stays completed');
    t+=436;
  }
  // A blocked tail selects a legal forward exit: presentation may neither
  // snap back nor replay the retreat at a different movement speed.
  const before=service.inspect(s,t),oldBody=clone(s.body),head=s.body[0],dir=s.dir;
  s.body=[{x:head.x+dir.x,y:head.y+dir.y},...s.body.slice(0,-1)];s.reversing=false;
  service.recordStep(s,{oldBody,t,duration:218,wasReversing:true});
  compareCommit(before,service.inspect(s,t),`resume/${length}/${rotation}/${mirror}`);
}
for(const length of [2,7])for(let rotation=0;rotation<4;rotation++)for(const mirror of [-1,1])
  for(const kind of ['double','stair'])run(length,rotation,mirror,'#35e55b',kind);

// Solitary heads retrace the route they really traversed; never invent a tail.
for(let rotation=0;rotation<4;rotation++){
  const rotate=p=>{let x=p.x,y=p.y;for(let i=0;i<rotation;i++)[x,y]=[-y,x];return {x:20+x,y:20+y};};
  const route=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:2,y:1},{x:3,y:1}].map(rotate);
  const s={body:[route[0]],dir:{x:route[1].x-route[0].x,y:route[1].y-route[0].y},reversing:false,color:'#66c2ff'};
  const service=createLiveSnakeRenderer();service.capture(s,0);let t=0;
  for(let i=1;i<route.length;i++){
    const oldBody=clone(s.body);s.dir={x:route[i].x-s.body[0].x,y:route[i].y-s.body[0].y};s.body=[route[i]];
    service.recordStep(s,{oldBody,t,duration:218});t+=218;
  }
  for(let i=route.length-2;i>=0;i--){
    const before=service.inspect(s,t),oldBody=clone(s.body),wasReversing=s.reversing;
    s.dir={x:s.body[0].x-route[i].x,y:s.body[0].y-route[i].y};s.body=[route[i]];s.reversing=true;
    service.recordStep(s,{oldBody,t,duration:436,wasReversing});
    compareCommit(before,service.inspect(s,t),`solo/${rotation}/${i}`);
    assert.equal(service.inspect(s,t).solo,1);t+=436;
  }
}
// A visual contact consumes logical material immediately, while the previous
// tip remains visible and shrinks progressively. It must not be hit twice.
for(const count of [2,7]){
  const s={body:Array.from({length:count},(_,i)=>({x:20-i,y:3})),dir:{x:1,y:0},color:'#35e55b'};
  const service=createLiveSnakeRenderer();service.capture(s,0);
  const token=service.capture(s,0);s.body.pop();
  const timing=service.biteTail(s,token,{t:0,player:{moveDuration:95}});
  assert.equal(timing.duration,95,'shortening retains its full duration after the visual contact lead');
  assert.ok(service.surfaceSpeedBound(s,0,timing.endAt)>0,'visible consumption remains moving even without a grid step');
  assert.equal(service.surfaceSpeedBound(s,timing.endAt,timing.endAt+4),0,'completed shortening is static');
  let prior=Infinity;
  for(let frame=0;frame<=100;frame++){
    const t=timing.endAt*frame/100;
    const g=service.getWorldGeometry(s,t);check(g.length<=prior+1e-7,'consumed length shortens monotonically');prior=g.length;
    check(g.collisionTailDistance>=-1e-8&&g.collisionTailDistance<=g.length,'collision starts at still-alive material');
    if(frame===0)check(g.collisionTailDistance>0,'already eaten material is non-colliding before its visual disappearance');
    if(frame===100)check(g.collisionTailDistance<1e-8,'no ghost exclusion remains after visible shortening ends');
  }
}
// Collision geometry obtained for an earlier clock remains deterministic even
// if painting/sampling a later frame has advanced the renderer's shared cache.
for(const count of [1,2,7]){
  const s={body:Array.from({length:count},(_,i)=>({x:20-i,y:4})),dir:{x:1,y:0}};
  const service=createLiveSnakeRenderer();service.capture(s,0);const oldBody=clone(s.body);
  s.body=[{x:20,y:5},...s.body.slice(0,-1)];s.dir={x:0,y:1};service.recordStep(s,{oldBody,t:0,duration:218});
  const early=service.getWorldGeometry(s,63),reference=early.sample(early.length*.3);
  service.getWorldGeometry(s,190).sample(0);assert.deepEqual(early.sample(early.length*.3),reference);
  assert.equal(early.indexAt(early.length),0);assert.equal(early.indexAt(0),count-1);
  const token=service.capture(s,63),saved=token.state.motion.sample(0);
  service.getWorldGeometry(s,195);assert.deepEqual(token.state.motion.sample(0),saved,'ghost motion owns its detached curve');
}
for(const backwards of [false,true]){
  const s={body:[{x:3,y:3}],dir:{x:1,y:0},reversing:backwards};
  const service=createLiveSnakeRenderer();service.capture(s,0);const oldBody=clone(s.body);
  s.body=[{x:backwards?2:4,y:3}];service.recordStep(s,{oldBody,t:17,duration:backwards?436:218,wasReversing:backwards});
  const end=17+(backwards?436:218),breaks=service.contactBreakpoints(s,17,end);
  assert.ok(service.surfaceSpeedBound(s,17,end)>0,'active movement retains conservative speed');
  assert.equal(service.surfaceSpeedBound(s,end,end+100),0,'completed movement and mouth cycle are static');
  assert.equal(breaks.length,192,'every cached mouth-pose threshold is isolated analytically');
  for(let i=0;i<breaks.length;i++){
    const t=breaks[i];assert.ok(t>17&&t<end&&(i===0||t>breaks[i-1]));
    const a=service.getWorldGeometry(s,t-1e-6).head.frame,b=service.getWorldGeometry(s,t+1e-6).head.frame;
    assert.equal(Math.abs(a-b),1,'threshold straddles precisely one real rendered cached-frame change');
  }
  assert.deepEqual(service.contactBreakpoints(s,end+1,end+100),[]);
  const before=service.inspect(s,75);service.hold(s,75);service.hold(s,175);
  assert.equal(service.surfaceSpeedBound(s,75,300),0,'held path and mouth are exactly stationary');
  assert.deepEqual(service.inspect(s,300),before,'blocked head stays at first exact held geometry/phase');
  assert.ok(service.contactBreakpoints(s,17,300).every(t=>t<=75));
  const beforeResume=service.inspect(s,400),body=clone(s.body);s.body=[{x:s.body[0].x+(backwards?-1:1),y:3}];
  service.recordStep(s,{oldBody:body,t:400,duration:218,wasReversing:backwards});
  compareCommit(beforeResume,service.inspect(s,400),'held lone-head resume');
  assert.notEqual(service.inspect(s,500).rear.x,beforeResume.rear.x,'the next committed step releases hold');
}
// Appearance breakpoints must cover stationary newborns as well as moving
// mouths: alpha admission is a discrete collider change, not a grid step.
for(const length of [3,7])for(const t of [0,1e6]){
  const service=createLiveSnakeRenderer(),body=Array.from({length},(_,i)=>({x:20-i,y:4}));
  const parent={body,dir:{x:1,y:0}},index=1,token=service.capture(parent,t);
  const children=[{body:clone(body.slice(0,index)),dir:{x:1,y:0}},
    {body:clone(body.slice(index+1)).reverse(),dir:{x:-1,y:0}}];
  const timing=service.split(parent,children,token,{t,index,player:{moveDuration:95}}),rear=children[1];
  const breaks=service.contactBreakpoints(rear,t,timing.endAt);
  const appearance=breaks.find(at=>service.getWorldGeometry(rear,at).head.alpha>.001
    &&service.getWorldGeometry(rear,at-1e-7).head.alpha<=.001);
  assert.ok(Number.isFinite(appearance),'exact first admitted head alpha is announced for a stationary fragment');
  assert.ok(breaks.includes(timing.visualStart)&&breaks.includes(timing.endAt),'birth endpoints include source-contour switches');
  assert.deepEqual(service.contactBreakpoints(rear,timing.endAt+1,timing.endAt+100),[],'completed static birth has no fake repeated changes');
}
console.log(JSON.stringify({commits,samples,worldSamples,maxTailJump,maxRearJump,maxAngleDegrees:maxAngleJump*180/Math.PI,maxOverhang,maxFoldRatio,failures:failures.slice(0,15),failureCount:failures.length},null,2));
assert.equal(failures.length,0,'Reverse commits must preserve the whole material curve instead of replacing occupied geometry');
