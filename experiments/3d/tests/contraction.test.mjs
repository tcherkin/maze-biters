import assert from 'node:assert/strict';
import {snakeRoute,sampleSnake} from '../motion.mjs';

const started=1000,duration=400;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const at=(snake,p,index)=>sampleSnake(snakeRoute(snake,started+p*duration),index);
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-9,message);
function straight(count,reverse=false){
  const from=Array.from({length:count},(_,i)=>({x:count+3-i,y:3}));
  const to=reverse
    ?[...from.slice(1),{x:from.at(-1).x-1,y:3}]
    :[{x:from[0].x+1,y:3},...from.slice(0,-1)];
  return {body:to,motion:{from,to,started,duration}};
}

let samples=0;
for(const count of [2,3,18]) for(const reverse of [false,true]){
  const snake=straight(count,reverse),tail=count-1;
  const leader=reverse?tail:0,follower=reverse?0:tail,sign=reverse?-1:1;
  const travel=(index,a,b)=>sign*(at(snake,b,index).x-at(snake,a,index).x);
  assert.ok(travel(follower,0,.25)>travel(leader,0,.25),
    `${reverse?'Head':'Tail'} gathers before the leading end advances`);
  assert.ok(travel(leader,.5,.75)>travel(follower,.5,.75),
    `${reverse?'Tail':'Head'} then leads the extension`);
  const span=p=>at(snake,p,0).x-at(snake,p,tail).x;
  assert.ok(span(.5)<span(0),'The visible body contracts during a step');
  close(span(1),span(0),'The visible body recovers its original span at the tick boundary');
  for(const index of [0,tail]) close(travel(index,0,1),1,'Each endpoint travels one committed cell');

  for(let step=0;step<=160;step++){
    const phase=step/160;
    assert.ok(span(phase)>0,'Short snakes retain distinct ordered endpoints');
    assert.ok(span(phase)<=span(0)+1e-9,'The gait never stretches beyond its normal span');
    let previous=at(snake,phase,0);
    // Include fractional indices used by the continuous skin, not just plates.
    for(let index=.25;index<=tail;index+=.25){
      const current=at(snake,phase,index);
      assert.ok(current.x<previous.x,'Neither plates nor skin samples overtake each other');
      previous=current;samples++;
    }
  }
  for(const index of [0,tail]){
    let previous=at(snake,0,index);
    for(let ms=1;ms<=duration;ms++){
      const current=at(snake,ms/duration,index),advance=sign*(current.x-previous.x);
      assert.ok(advance>0,'Both endpoints keep moving throughout an unblocked step');
      assert.ok(advance<2/duration,'A contraction never causes a position jump');
      previous=current;samples++;
    }
  }
  const before=JSON.stringify(snake);
  const frozen=at(snake,.37,tail/2);
  for(let i=0;i<20;i++) assert.deepEqual(at(snake,.37,tail/2),frozen,'Repeated paused timestamps keep the same pose');
  assert.equal(JSON.stringify(snake),before,'Animation sampling leaves simulation snapshots unchanged');
}

const from=[{x:8,y:5},{x:7,y:5},{x:6,y:5},{x:6,y:6},{x:6,y:7}];
const forwardTo=[{x:8,y:4},...from.slice(0,-1)];
const reverseTo=[...from.slice(1),{x:6,y:8}];
for(const [label,to,next] of [
  ['forward to forward',forwardTo,[{x:9,y:4},...forwardTo.slice(0,-1)]],
  ['forward to reverse',forwardTo,from],
  ['reverse to forward',reverseTo,from],
  ['reverse to reverse',reverseTo,[...reverseTo.slice(1),{x:7,y:8}]]
]){
  const first={body:to,motion:{from,to,started,duration}};
  const following={body:next,motion:{from:to,to:next,started:started+duration,duration}};
  for(let index=0;index<=from.length-1;index+=.125){
    const end=at(first,1,index);
    const beginning=sampleSnake(snakeRoute(following,started+duration),index);
    assert.ok(distance(end,beginning)<1e-9,`No boundary pop: ${label}, sample ${index}`);
    const immediatelyBefore=at(first,1-1e-5,index);
    const immediatelyAfter=sampleSnake(snakeRoute(following,started+duration+duration*1e-5),index);
    assert.ok(distance(immediatelyBefore,immediatelyAfter)<1e-4,`Continuous motion around ${label}`);
    samples++;
  }
}

const lone=straight(1);
for(let step=0;step<=100;step++){
  const phase=step/100,point=at(lone,phase,0);
  close(point.x,lone.motion.from[0].x+phase,'A lone head keeps its existing uniform translation');
  close(point.y,3,'A lone head stays on the committed path');
  samples++;
}
const resting={body:from};
for(let index=0;index<from.length;index++){
  assert.deepEqual(sampleSnake(snakeRoute(resting,1000),index),sampleSnake(snakeRoute(resting,5000),index),
    'Snakes with no committed move do not contract');
}

console.log(`3D contraction: ${samples} samples passed; forward/reverse sequence, short bodies, boundary continuity, pause stability, and lone-head preservation.`);
