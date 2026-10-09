import assert from 'node:assert/strict';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js?v=1.02.03.00';

// Native canEnter(..., ignoreTail=true) explicitly allows the cell that the
// tail vacates during this same commit. Coordinate-only route projection is
// ambiguous there: the old tail and the new head are distinct occurrences.
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clone=value=>JSON.parse(JSON.stringify(value));
let commits=0,frames=0,worstFold=0,minLength=Infinity;
const HEAD=36.365625,TAIL=35*(57/160*36)/16;
let maxCapExtension=0;
for(const count of [2,4,7,11]){
  const body=Array.from({length:count},(_,i)=>({x:20-Math.ceil(i/2),y:8+Math.floor(i/2)}));
  const snake={body,dir:{x:1,y:0}},service=createLiveSnakeRenderer();service.capture(snake,0);
  const pose=service.inspect(snake,0),tail=body.at(-1);
  assert.ok(Math.hypot(pose.tail.x-(tail.x+.5)*36,pose.tail.y-(tail.y+.5)*36)<18,
    'rounded spawn corners must not push excess logical arc length outside the physical tail cell');
}
// A rigid authored head and a rigid-width tapered tail need real arc space.
// A legal two-cell corner must never squash the tail to make a short blended
// centerline fit. This fixture failed at56.19px vs64.42px of unchanged artwork.
for(let rotation=0;rotation<4;rotation++)for(const mirror of [-1,1]){
  const map=({x,y})=>{y*=mirror;for(let i=0;i<rotation;i++)[x,y]=[-y,x];return {x:10+x,y:10+y};};
  const s={body:[map({x:1,y:0}),map({x:0,y:0})],dir:{x:1,y:0}},service=createLiveSnakeRenderer();
  service.capture(s,0);const oldBody=clone(s.body),next=map({x:1,y:1}),oldHead=s.body[0];
  s.body=[next,oldHead];s.dir={x:next.x-oldHead.x,y:next.y-oldHead.y};
  service.recordStep(s,{oldBody,t:0,duration:218});
  for(let f=0;f<=218;f++){
    const pose=service.inspect(s,f),geometry=service.getWorldGeometry(s,f);
    assert.ok(pose.length>=HEAD+TAIL-1e-8,'a live unconsumed corner preserves cap lengths');
    assert.ok(Math.abs(geometry.tailSpan-TAIL*16/36)<1e-7,'authored tail has its full accepted physical length');
    const extension=Math.max(0,pose.length-pose.headDistance);maxCapExtension=Math.max(maxCapExtension,extension);
    assert.ok(extension<=9,'cap allowance cannot grow into a new cell');
  }
  for(const boundary of [0,218]){
    const a=service.inspect(s,boundary),b=service.inspect(s,boundary+(boundary?-.000001:.000001));
    assert.ok(Math.hypot(a.tail.x-b.tail.x,a.tail.y-b.tail.y)<1e-5,'cap allowance causes no endpoint jump');
  }
}
for(let rotation=0;rotation<4;rotation++)for(const mirror of [-1,1]){
  const map=({x,y})=>{y*=mirror;for(let i=0;i<rotation;i++)[x,y]=[-y,x];return {x:10+x,y:10+y};};
  const cycle=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}].map(map);
  const s={body:[...cycle].reverse(),dir:{x:cycle[3].x-cycle[2].x,y:cycle[3].y-cycle[2].y}};
  const service=createLiveSnakeRenderer();service.capture(s,0);
  for(let step=0;step<12;step++){
    const time=step*218,oldBody=clone(s.body),before=service.inspect(s,time),next=cycle[step%4];
    assert.deepEqual(next,s.body.at(-1),'fixture enters exactly the legal vacating tail cell');
    assert.ok(!s.body.slice(0,-1).some(cell=>cell.x===next.x&&cell.y===next.y));
    s.dir={x:next.x-s.body[0].x,y:next.y-s.body[0].y};s.body=[next,...s.body.slice(0,-1)];
    service.recordStep(s,{oldBody,t:time,duration:218});
    assert.equal(service.capture(s,time).state.motion.kind,'route-window',
      'every legal forward loop step travels the rounded route instead of morphing through its interior');
    const joined=service.inspect(s,time);
    assert.ok(Math.hypot(joined.tail.x-before.tail.x,joined.tail.y-before.tail.y)<1e-6,'commit retains the already visible tail');
    for(let frame=0;frame<=64;frame++){
      const t=time+218*frame/64,pose=service.inspect(s,t),geometry=service.getWorldGeometry(s,t);
      minLength=Math.min(minLength,pose.length);
      assert.ok(pose.length>=124.68,`four-cell material cannot collapse across the corner interior: step${step} frame${frame} length${pose.length}`);
      for(let j=0;j<=32;j++){
        const point=geometry.sample(geometry.bodyEndDistance*j/32),fold=Math.abs(point.curve)*geometry.diameter/2;
        worstFold=Math.max(worstFold,fold);assert.ok(Number.isFinite(fold)&&fold<1,'live body ribbon must not fold');
      }
      frames++;
    }
    const end=service.inspect(s,time+218);
    assert.ok(Math.abs(wrap(end.rear.angle-Math.atan2(s.dir.y,s.dir.x)))<.03,'new head uses the final route occurrence and correct heading');
    commits++;
  }
}
// Production can alter snake cadence between commits. Exercise legal random
// grid choices, including vacating-tail entry, with both completed and still
// partially presented preceding steps; the visual adapter owns no AI choices.
let seed=91726,randomCommits=0,routeCommits=0,maxCommitJump=0;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const directions=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
for(const count of [2,3,4,7,11]){
  const s={body:Array.from({length:count},(_,i)=>({x:20-i,y:15})),dir:directions[0]},service=createLiveSnakeRenderer();
  service.capture(s,0);let time=0;
  for(let step=0;step<160;step++){
    const head=s.body[0],options=directions.filter(d=>d.x!==-s.dir.x||d.y!==-s.dir.y)
      .filter(d=>!s.body.slice(0,-1).some(c=>c.x===head.x+d.x&&c.y===head.y+d.y));
    if(!options.length)break;
    const direction=options[Math.floor(random()*options.length)],oldBody=clone(s.body),before=service.inspect(s,time);
    s.body=[{x:head.x+direction.x,y:head.y+direction.y},...s.body.slice(0,-1)];s.dir=direction;
    const duration=[95,140,218][step%3];service.recordStep(s,{oldBody,t:time,duration});
    if(service.capture(s,time).state.motion.kind==='route-window')routeCommits++;
    const after=service.inspect(s,time);
    const jump=Math.max(Math.hypot(after.tail.x-before.tail.x,after.tail.y-before.tail.y),
      Math.hypot(after.rear.x-before.rear.x,after.rear.y-before.rear.y));
    maxCommitJump=Math.max(maxCommitJump,jump);assert.ok(jump<.002,`cadence change preserves visible geometry: count${count}, step${step}, gap${jump}, prior compression${before.compression}`);
    for(let f=0;f<=16;f++){
      const g=service.getWorldGeometry(s,time+duration*f/16);
      assert.ok(g.length>0&&[g.head.x,g.head.y,g.head.angle,g.tail.x,g.tail.y,g.tail.angle].every(Number.isFinite));
    }
    time+=duration*(step%5===0?.8:1);randomCommits++;
  }
}
assert.ok(routeCommits>randomCommits*.9,'normal legal forward decisions predominantly use unchanged route geometry');
console.log(`PASS legal grid loops: ${commits} occupied-tail commits, ${frames} frames, min length ${minLength}, max fold ${worstFold}, max cap allowance ${maxCapExtension}; ${randomCommits} random native-cadence commits (${routeCommits} rail), max join gap ${maxCommitJump}.`);
