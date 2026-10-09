import assert from 'node:assert/strict';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';
import {createJoinedPrefixCurve} from '../src/render/live-snake-curve.js?v=1.02.03.00';

// Snapshotting a turn that never completes must not retain an ancestor chain.
// Run with --expose-gc to also verify retained heap, not just finite sampling.
{
  const line={sample(s,out={}){return Object.assign(out,{x:s,y:0,tx:1,ty:0,angle:0,curve:0});},
    ribbonSpan(s,maximum){return maximum;}};
  let source=line;global.gc?.();const before=process.memoryUsage().heapUsed;
  for(let i=0;i<8000;i++)source=createJoinedPrefixCurve(source,0,18,36,line,0,18,36).update(.4);
  const at=source.sample(1);assert.ok(Math.abs(at.x-1)<1e-8&&Math.abs(at.y)<1e-8);
  if(global.gc){global.gc();const growth=process.memoryUsage().heapUsed-before;
    assert.ok(growth<4*1024*1024,`interrupted-prefix snapshots retain bounded state, not8,000 ancestors: ${growth} bytes`);
    console.log(`Interrupted prefix history:8,000 captures, retained heap growth ${growth} bytes.`);}
}

// A two-cell nape is 0.183 reference pixels before the next outgoing tangent.
// Aligning the new route by that nape instead of its unchanged continuation
// silently selected the old whole-body material morph on every second turn.
let commits=0,maxFold=0,maxJump=0;
for(const count of [2,7])for(let rotation=0;rotation<4;rotation++)for(const mirror of [-1,1]){
  const map=({x,y})=>{y*=mirror;for(let i=0;i<rotation;i++)[x,y]=[-y,x];return {x:x+20,y:y+20};};
  const body=Array.from({length:count},(_,i)=>map({x:count-1-i,y:0}));
  const s={body,dir:{x:body[0].x-body[1].x,y:body[0].y-body[1].y}},r=createLiveSnakeRenderer();
  r.capture(s,0);
  for(let step=0;step<12;step++){
    const time=step*436,oldBody=structuredClone(s.body),before=r.inspect(s,time);
    const tail=map({x:-1-Math.floor(step/2),y:Math.ceil(step/2)});
    s.body=[...s.body.slice(1),tail];s.dir={x:s.body[0].x-s.body[1].x,y:s.body[0].y-s.body[1].y};s.reversing=true;
    r.recordStep(s,{oldBody,t:time,duration:436,wasReversing:step>0});
    const after=r.inspect(s,time),jump=Math.max(Math.hypot(after.tail.x-before.tail.x,after.tail.y-before.tail.y),
      Math.hypot(after.rear.x-before.rear.x,after.rear.y-before.rear.y));
    maxJump=Math.max(maxJump,jump);assert.ok(jump<1e-8);
    for(let frame=0;frame<=24;frame++){
      const t=time+436*frame/24,g=r.getWorldGeometry(s,t);
      for(let sample=0;sample<=48;sample++){
        const p=g.sample(g.bodyEndDistance*sample/48),fold=Math.abs(p.curve)*g.diameter/2;
        maxFold=Math.max(maxFold,fold);assert.ok(fold<=.356251,'standard tail turn retains the accepted 18px radius');
      }
    }
    const saved=r.capture(s,time+436).state;
    assert.ok(saved.routeCells.length<=count+4,'head-side history remains bounded');
    assert.ok(!saved.motion.prefixLength||saved.motion.prefixLength<64.1,
      'completed tail corners must not accumulate into a growing whole-body prefix');
    commits++;
  }
  const counters=r.stats().motionKinds;
  assert.equal(counters.reverseRail,1);assert.equal(counters.reverseTailJoin,11);
  assert.equal(counters.materialFallback,0,'normal completed reverse cadence never deforms the whole body');
}
console.log(`PASS reverse rail: ${commits} native staircase commits, max join ${maxJump}, max fold ${maxFold}; zero whole-body fallbacks, bounded tail prefixes/history.`);
