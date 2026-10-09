import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cellMotionState} from '../animation-lib/snake-ready-v1/snake-maze-walk/motion-cell.js';
import {retreatClock} from '../animation-lib/snake-ready-v1/snake-maze-walk/motion-retreat.js';
import {route,TILE,DIAMETER,TAIL_SPAN} from '../animation-lib/snake-ready-v1/snake-maze-walk/route.js';
import {liveSnakePulse,createLiveSnakeRenderer} from '../src/render/live-snake.js';

// This oracle is the frozen accepted experiment, not a rewritten live formula.
// Wall retreat decreases a FORWARD route clock and forces cell-motion mode;
// its sinusoidal motion-pulse.js is a different optional demonstration.
const experiment=readFileSync(new URL('../animation-lib/snake-ready-v1/snake-maze-walk/main.js',import.meta.url),'utf8');
assert.match(experiment,/\$\('direction'\)\.value='forward';\$\('motion'\)\.value='cell'/);
const HEAD=215.5*DIAMETER/76,worldScale=16/TILE;
const start=route.pieces.find(p=>p.type==='line'&&p.length>=TILE*4).start+TILE*2,end=start+TILE;
const near=(a,b,message,tolerance=2e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${message}: ${a} != ${b}`);
let pulseSamples=0,worldSamples=0,maxPulseError=0,maxPositionError=0;
function oracle(u,count,backwards){
  const length=count===1?HEAD:count*TILE,options={headSpan:HEAD,tailSpan:count===1?0:TAIL_SPAN};
  const origin=cellMotionState(backwards?end:start,length,options);
  const state=cellMotionState(backwards?end-u*TILE:start+u*TILE,length,options);
  return {state,head:state.headDistance-origin.headDistance,tail:state.tailDistance-origin.tailDistance,
    progress:Math.abs(state.headDistance-origin.headDistance)/TILE};
}
for(const count of [1,2,3,7,12])for(const backwards of [false,true])for(let i=0;i<=1000;i++){
  const u=i/1000,expected=oracle(u,count,backwards),actual=liveSnakePulse(u,count===1?HEAD:count*TILE,backwards);
  const error=Math.max(Math.abs(actual.progress-expected.progress),Math.abs(actual.compression-expected.state.compression));
  maxPulseError=Math.max(maxPulseError,error);
  near(actual.progress,expected.progress,'live scalar head rhythm equals accepted cell clock');
  near(actual.compression,expected.state.compression,'positive backward compression equals time-reversed accepted stroke');
  assert.ok(actual.progress>=0&&actual.progress<=1);assert.ok(actual.compression>=-1e-8);pulseSamples++;
}
const directions=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
for(const color of ['Green','Yellow','Blue','Pink','Orange'])for(const direction of directions)
for(const count of [1,2,7])for(const backwards of [false,true]){
  const service=createLiveSnakeRenderer({tile:16});
  const s={body:Array.from({length:count},(_,i)=>({x:20-direction.x*i,y:20-direction.y*i})),dir:{...direction},reversing:backwards,color};
  service.capture(s,0);const oldBody=s.body.map(p=>({...p})),origin=service.getWorldGeometry(s,0);
  const head0={...origin.head},tail0={...origin.tail},duration=backwards?436:218;
  if(backwards){const last=oldBody.at(-1);s.body=[...oldBody.slice(1),{x:last.x-direction.x,y:last.y-direction.y}];}
  else s.body=[{x:oldBody[0].x+direction.x,y:oldBody[0].y+direction.y},...oldBody.slice(0,-1)];
  service.recordStep(s,{oldBody,t:1000,duration,wasReversing:backwards});
  for(let i=0;i<=64;i++){
    const u=i/64,expected=oracle(u,count,backwards),actual=service.getWorldGeometry(s,1000+u*duration);
    const head=(actual.head.x-head0.x)*direction.x+(actual.head.y-head0.y)*direction.y;
    const tail=(actual.tail.x-tail0.x)*direction.x+(actual.tail.y-tail0.y)*direction.y;
    maxPositionError=Math.max(maxPositionError,Math.abs(head-expected.head*worldScale),Math.abs(tail-expected.tail*worldScale));
    near(head,expected.head*worldScale,'live straight head follows accepted backward/forward displacement');
    near(tail,expected.tail*worldScale,'live straight tail follows same rail with accepted compression');
    near((actual.head.x-head0.x)*direction.y-(actual.head.y-head0.y)*direction.x,0,'no sideways head drift');
    near((actual.tail.x-tail0.x)*direction.y-(actual.tail.y-tail0.y)*direction.x,0,'no sideways tail drift');
    near(Math.atan2(Math.sin(actual.head.angle-head0.angle),Math.cos(actual.head.angle-head0.angle)),0,'backing never reverses facing');
    worldSamples++;
  }
}

const first=oracle(.25,7,true),middle=oracle(.5,7,true),last=oracle(1,7,true);
assert.ok(Math.abs(first.head)>Math.abs(first.tail),'backward stroke starts head-first, not tail-first');
assert.ok(Math.abs(last.tail-middle.tail)>Math.abs(last.head-middle.head),'tail catches up in the latter half of the backward stroke');
const table=[0,.25,.5,.75,1].map(u=>{const a=oracle(u,7,true);return{phase:u,headBackPx:-a.head*worldScale,tailBackPx:-a.tail*worldScale,compressionPx:a.state.compression*worldScale};});

// The accepted retreat envelope slows the whole six-cell leg smoothly near
// the wall. Native gameplay retains equal logical per-cell durations instead:
// it must double once to436ms, never double the supplied duration a second time.
const clockOptions={startClock:start,endClock:start+6*TILE,baseSpeed:84};
const clock=retreatClock(0,clockOptions);near(clock.backingDuration,2*clock.approachDuration,'accepted half-speed backing');
for(const u of [.05,.25,.5,.75,.95]){
  const forward=retreatClock(u*clock.approachDuration,clockOptions);
  const backward=retreatClock(clock.approachDuration+u*clock.backingDuration,clockOptions);
  near(backward.velocity,-forward.velocity/2,'same envelope phase has half backward velocity');
}
const engine=readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function extract(name){
  const at=engine.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));assert.ok(at>=0);
  for(let end=engine.indexOf('}',at);end>=0;end=engine.indexOf('}',end+1)){
    const code=engine.slice(at,end+1);try{new vm.Script(code);return code;}catch{}
  }throw Error(`Missing function ${name}`);
}
assert.match(engine,/const delay = s\.reversing \? snakeDelay\*2 : snakeDelay/);
const hookups=[],context=vm.createContext({Math,SNAKE_SLIDE_RATIO:.55,
  MazeBitersLive:{snake:{recordStep:(s,options)=>hookups.push(options)}}});
for(const fn of ['snakeMoveDelay','snakeBodyPointIsCorner','snakeMovementChangesAxis','recordSnakeVisualStep'])vm.runInContext(extract(fn),context);
for(const [backwards,recovery,expected]of [[false,false,218],[true,false,436],[false,true,218]]){
  const oldBody=[{x:3,y:3},{x:2,y:3},{x:1,y:3}],s={body:oldBody.map(p=>({x:p.x+(backwards?-1:1),y:p.y})),
    dir:{x:1,y:0},reversing:backwards,forwardResumeRecovery:recovery};
  context.recordSnakeVisualStep(s,oldBody,1000,recovery||backwards?436:218,{x:1,y:0},backwards,null);
  assert.equal(hookups.at(-1).duration,expected,'engine supplies one complete native cadence, not55% slide or double reverse');
}
console.log(JSON.stringify({pulseSamples,worldSamples,maxPulseError,maxPositionError,reverseQuarterTable:table,
  nativeForwardMs:218,nativeReverseMs:436,acceptedEnvelope:'12% C2 ramps over whole six-cell approach/retreat leg'},null,2));
