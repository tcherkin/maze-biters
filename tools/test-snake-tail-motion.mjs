import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

// Run the production movement functions with deterministic game time and no
// canvas or game loop. Expectations below describe the motion contract;
// the implementation under test is always extracted from game.js.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/engine/game.js'),'utf8');
function declaration(name,kind='function'){
  const pattern=kind==='function'
    ?new RegExp(`\\bfunction\\s+${name}\\s*\\(`)
    :new RegExp(`\\bconst\\s+${name}\\s*=`);
  const start=source.search(pattern);
  assert.ok(start>=0,`Missing production ${kind}: ${name}`);
  const delimiter=kind==='function'?'}':';';
  for(let end=source.indexOf(delimiter,start);end>=0;end=source.indexOf(delimiter,end+1)){
    const candidate=source.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw new Error(`Unterminated production ${kind}: ${name}`);
}
const helpers=[
  'snakeMoveDelay','snakeBodyPointIsCorner','snakeMovementChangesAxis',
  'recordSnakeVisualStep','predictiveSnakeTailPosition',
  'reverseHeadJunctionState','createReverseHeadPredictionTarget',
  'predictiveReverseHeadPosition','snakeSegmentVisualPosition',
  'beginTailLedRetreat','stageSnakeForwardResume'
];
const constants=[
  'SNAKE_SLIDE_RATIO','SNAKE_TAIL_LEAD_RATIO','PREDICTIVE_SLIDE_SPEED_MULTIPLIER'
];
const context=vm.createContext({
  gameTimeNow:()=>{throw new Error('Tests must supply explicit game time');},
  canEnter:()=>true,playerAt:()=>null
});
vm.runInContext(`'use strict';
  let gameOverVisualsSettled=false;
  const dirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  ${constants.map(name=>declaration(name,'const')).join('\n')}
  ${helpers.map(name=>declaration(name)).join('\n')}
  globalThis.api={${[...helpers,...constants].join(',')},
    freeze:value=>{gameOverVisualsSettled=value;}
  };
`,context,{filename:'snake-tail-production-extract.js',timeout:10000});
const api=context.api;
const copy=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected,label,tolerance=1e-9)=>
  assert.ok(Math.abs(actual-expected)<=tolerance,
    `${label}: expected ${expected}, received ${actual}`);
function pointNear(actual,expected,label){
  near(actual.x,expected.x,`${label} x`);
  near(actual.y,expected.y,`${label} y`);
}
const between=(from,to,p)=>({x:from.x+(to.x-from.x)*p,y:from.y+(to.y-from.y)*p});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const delay=api.snakeMoveDelay();
const start=1000;
const directions=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
let motionCases=0;

function straightSnake(length,direction,reversing=false){
  return {body:Array.from({length},(_,i)=>({
    x:20-i*direction.x,y:20-i*direction.y
  })),dir:{...direction},reversing,lastMove:start,reverseSteps:0};
}
function commit(s,direction,t,logicalDelay){
  const old=copy(s.body);
  const wasReversing=s.reversing;
  s.body=old.map(p=>({x:p.x+direction.x,y:p.y+direction.y}));
  api.recordSnakeVisualStep(s,old,t,logicalDelay,direction,wasReversing);
  s.lastMove=t;
  return old;
}
function tailPosition(s,t,out=null){
  return api.snakeSegmentVisualPosition(s,s.body.length-1,t,out);
}
function checkTail(s,t,expected,label){
  const before=JSON.stringify(s);
  const out={x:NaN,y:NaN,marker:'reused output'};
  assert.equal(tailPosition(s,t,out),out,`${label}: output object must be reused`);
  pointNear(out,expected,label);
  assert.equal(out.marker,'reused output');
  assert.equal(JSON.stringify(s),before,`${label}: rendering must not mutate snake state`);
}

// Preserve the original linear impulses and their hold/travel phases.
// Fractional samples below detect any acceleration curve or timing drift.
assert.equal(api.SNAKE_SLIDE_RATIO,.55,'retain the ordinary 55% travel phase');
assert.equal(api.SNAKE_TAIL_LEAD_RATIO,.5,'retain the forward half-tick hold');
assert.equal(api.PREDICTIVE_SLIDE_SPEED_MULTIPLIER,1,'retain the arrival tick for long snakes');

for(const length of [2,7]) for(const d of directions){
  const label=`${length} cells, direction ${d.x},${d.y}`;
  const forward=straightSnake(length,d);
  commit(forward,d,start,delay);
  const tail=copy(forward.body.at(-1)),target=copy(forward.body.at(-2));
  for(const fraction of [-1,0,.1,.49,.5]){
    checkTail(forward,start+delay*fraction,tail,`forward hold ${label}`);
  }
  for(const fraction of [0,.01,.1,.15,.25,.5,.75,.85,.9,.99,1,1.5]){
    checkTail(forward,start+delay*.5+delay*.5*fraction,
      between(tail,target,Math.min(1,fraction)),`forward linear travel ${fraction}, ${label}`);
  }
  pointNear(tailPosition(forward,start+delay),target,`forward exact arrival ${label}`);
  const beforeTick=tailPosition(forward,start+delay);
  commit(forward,d,start+delay,delay);
  pointNear(tailPosition(forward,start+delay),beforeTick,`forward logical tick continuity ${label}`);
  assert.equal(forward.visualLogicalDelay,delay);
  near(forward.visualMoveDuration,delay*.55,'forward impulse duration unchanged');

  const retreat=straightSnake(length,d,true);
  const reverseDirection={x:-d.x,y:-d.y};
  const old=commit(retreat,reverseDirection,start,delay*2);
  const from=old.at(-1),to=copy(retreat.body.at(-1));
  const duration=delay*2*.55;
  assert.equal(retreat.reverseTailTurnReveal,false);
  for(const fraction of [-1,0,.01,.1,.15,.25,.5,.75,.85,.9,.99,1,1.5]){
    checkTail(retreat,start+duration*fraction,between(from,to,Math.max(0,Math.min(1,fraction))),
      `reverse linear travel ${fraction}, ${label}`);
  }
  for(const fraction of [.55,.7,.99,1]){
    checkTail(retreat,start+delay*2*fraction,to,`reverse settled hold ${label}`);
  }
  const reverseBeforeTick=tailPosition(retreat,start+delay*2);
  commit(retreat,reverseDirection,start+delay*2,delay*2);
  pointNear(tailPosition(retreat,start+delay*2),reverseBeforeTick,
    `reverse logical tick continuity ${label}`);
  assert.equal(retreat.visualLogicalDelay,delay*2);
  near(retreat.visualMoveDuration,duration,'reverse impulse duration unchanged');

  // Changing movement mode must retain its existing sub-cell recovery.
  const switching=straightSnake(length,d);
  commit(switching,d,start,delay);
  const switchAt=start+delay*.75;
  const captured=tailPosition(switching,switchAt);
  const unchangedBody=copy(switching.body);
  api.beginTailLedRetreat(switching,switchAt);
  api.recordSnakeVisualStep(switching,unchangedBody,switchAt,delay,d);
  switching.lastMove=switchAt;
  pointNear(tailPosition(switching,switchAt),captured,`forward to reverse continuity ${label}`);
  checkTail(switching,switchAt+delay*.55*.1,
    between(captured,unchangedBody.at(-1),.1),`forward to reverse recovery ${label}`);
  pointNear(tailPosition(switching,switchAt+delay*.55),unchangedBody.at(-1),
    `forward to reverse recovery arrival ${label}`);

  const resumeAt=start+delay*4;
  const resumeTail=tailPosition(retreat,resumeAt);
  const resumeHead=api.snakeSegmentVisualPosition(retreat,0,resumeAt);
  const resumeBody=copy(retreat.body);
  api.stageSnakeForwardResume(retreat,d);
  api.recordSnakeVisualStep(retreat,resumeBody,resumeAt,delay*2,reverseDirection,true,resumeHead);
  retreat.lastMove=resumeAt;
  pointNear(tailPosition(retreat,resumeAt),resumeTail,`reverse to forward continuity ${label}`);
  assert.deepEqual(copy(retreat.body),resumeBody,'mode recovery must not move logical body cells');
  assert.equal(retreat.visualLogicalDelay,delay,'resume keeps its one-cell recovery interval');
  checkTail(retreat,resumeAt+delay*.55,between(resumeBody.at(-1),resumeBody.at(-2),.1),
    `resumed forward linear tail motion ${label}`);
  motionCases++;
}

// A real zero timestamp is already supported by the recorded retreat tail.
// Forward prediction intentionally uses positive timestamps here: its existing
// lastMove || t fallback is preserved by this baseline.
const zero=straightSnake(2,directions[0],true);
const zeroOld=commit(zero,{x:-1,y:0},0,delay*2);
checkTail(zero,zero.visualMoveDuration*.1,between(zeroOld.at(-1),zero.body.at(-1),.1),
  'reverse impulse beginning at clock zero');

// Head, middle body, solitary head, and the short corner reveal retain their
// established linear motion and independent timings.
const ordinary=straightSnake(7,directions[0]);
const ordinaryOld=commit(ordinary,directions[0],start,delay);
for(const index of [0,1,3]) for(const p of [.1,.5,.9]){
  pointNear(api.snakeSegmentVisualPosition(ordinary,index,start+ordinary.visualMoveDuration*p),
    between(ordinaryOld[index],ordinary.body[index],p),`unchanged forward head/body ${index}`);
}
const reverseHead=straightSnake(7,directions[0],true);
commit(reverseHead,{x:-1,y:0},start,delay*2);
for(const p of [.1,.5,.9]){
  pointNear(api.snakeSegmentVisualPosition(reverseHead,0,start+delay+delay*p),
    between(reverseHead.body[0],reverseHead.body[1],p),'unchanged predictive reverse head');
  pointNear(api.snakeSegmentVisualPosition(reverseHead,2,start+reverseHead.visualMoveDuration*p),
    between(reverseHead.visualBodyFrom[2],reverseHead.body[2],p),'unchanged reverse middle body');
}
for(const reversing of [false,true]){
  const solitary=straightSnake(1,directions[0],reversing);
  const old=commit(solitary,{x:reversing?-1:1,y:0},start,delay*(reversing?2:1));
  for(const p of [.1,.5,.9]){
    pointNear(api.snakeSegmentVisualPosition(solitary,0,start+solitary.visualMoveDuration*p),
      between(old[0],solitary.body[0],p),'unchanged solitary head');
  }
  assert.equal(api.predictiveSnakeTailPosition(solitary,start+delay),null);
}

const corner={body:[{x:3,y:1},{x:2,y:1},{x:2,y:2}],reversing:false,lastMove:start};
for(const p of [0,.5,.75,1]){
  assert.equal(api.predictiveSnakeTailPosition(corner,start+delay*p),null);
  checkTail(corner,start+delay*p,corner.body.at(-1),'forward corner remains anchored');
}
const turned={body:[{x:2,y:1},{x:1,y:1},{x:1,y:2}],dir:{x:1,y:0},reversing:true};
const beforeTurn=[{x:3,y:1},{x:2,y:1},{x:1,y:1}];
api.recordSnakeVisualStep(turned,beforeTurn,start,delay*2,{x:-1,y:0},true);
assert.equal(turned.reverseTailTurnReveal,true);
pointNear(turned.visualBodyFrom.at(-1),{x:1,y:1.5},'corner reveal starts at midpoint');
for(const p of [0,.1,.5,.9,1,2]){
  checkTail(turned,start+turned.visualMoveDuration*.5*p,
    between({x:1,y:1.5},{x:1,y:2},Math.min(1,p)),'unchanged linear midpoint corner reveal');
}
const afterTurn=copy(turned.body);
turned.body=[{x:1,y:1},{x:1,y:2},{x:1,y:3}];
api.recordSnakeVisualStep(turned,afterTurn,start+delay*2,delay*2,{x:-1,y:0},true);
assert.equal(turned.reverseTailTurnReveal,false);
assert.equal(turned.visualSegmentSnap.at(-1),false,'first straight retreat after corner must slide');
checkTail(turned,start+delay*2+turned.visualMoveDuration*.1,
  between({x:1,y:2},{x:1,y:3},.1),'straight linear motion resumes after corner');

const diagonal={body:[{x:3,y:3},{x:2,y:2}],reversing:true,
  visualBodyFrom:[{x:3,y:3},{x:1,y:1}],visualBodyTo:[{x:3,y:3},{x:2,y:2}],
  visualSegmentSnap:[true,false],visualMoveStartedAt:start,visualMoveDuration:100};
checkTail(diagonal,start+10,{x:1.1,y:1.1},'out-of-scope diagonal interpolation stays linear');
const stopped=straightSnake(2,directions[0]);
stopped.visualTailPredictionDisabled=true;
checkTail(stopped,start+delay,stopped.body.at(-1),'disabled prediction stays stopped');
api.freeze(true);
checkTail(ordinary,start+delay*.75,ordinary.body.at(-1),'game-over freeze uses logical tail');
api.freeze(false);

// Dense samples through movement and hold phases must not introduce a visible
// one-frame jump, including the join to the following stationary phase.
for(const reversing of [false,true]){
  const s=straightSnake(7,directions[0],reversing);
  commit(s,{x:reversing?-1:1,y:0},start,delay*(reversing?2:1));
  const interval=delay*(reversing?2:1);
  let previousPoint=tailPosition(s,start);
  for(let i=1;i<=4000;i++){
    const point=tailPosition(s,start+interval*i/4000);
    assert.ok(distance(previousPoint,point)<.001,'dense tail samples must remain continuous');
    previousPoint=point;
  }
}
console.log(`Snake tail motion passed: ${motionCases} direction/length cases, original linear timing, mode transitions, corners, head/body motion, and render purity.`);
