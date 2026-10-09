import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLiveSnakeRenderer,makeLiveSnakePath} from '../src/render/live-snake.js';

// Real native tail-removal handler and movement/visual bridges, interleaved
// on independent player/snake clocks. The oracle is the rounded WORLD rail,
// not endpoint continuity (a sideways material morph also has continuous ends).
const engine=readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function extract(name){
  const start=engine.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));assert.ok(start>=0,name);
  for(let end=engine.indexOf('}',start);end>=0;end=engine.indexOf('}',end+1)){
    const code=engine.slice(start,end+1);try{new vm.Script(code);return code;}catch{}
  }throw Error(`Unterminated ${name}`);
}
const names=['snakeBiteFragments','resolveSnakePartContact','checkSnakeContact','advanceSnakeForward','retreatOneStep',
  'snakeBodyPointIsCorner','snakeMovementChangesAxis','recordSnakeVisualStep'];
const declarations=names.map(extract).join('\n');
const copy=value=>JSON.parse(JSON.stringify(value));
const SCALE=16/36,HEAD=36.365625,POSITION_EPSILON=.02,RADIUS=18;
const dirs=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const cells=[...Array.from({length:16},(_,i)=>({x:4,y:i-20})),{x:4,y:-4},{x:4,y:-3},{x:4,y:-2},{x:4,y:-1},{x:4,y:0},
  {x:4,y:1},{x:5,y:1},{x:5,y:2},{x:6,y:2},{x:6,y:3},{x:7,y:3},
  {x:8,y:3},{x:9,y:3},{x:9,y:4},{x:10,y:4},{x:10,y:5},{x:11,y:5},
  {x:11,y:6},{x:12,y:6},{x:12,y:7},{x:13,y:7},{x:13,y:8},{x:14,y:8}];
const failures=[],stats={fixtures:0,frames:0,points:0,nativeBites:0,nativeMoves:0,
  maxRailError:0,maxCoreCurvature:0,maxFold:0,maxEventGap:0,controlFrames:0,
  maxControlError:0,baselineFrames:0,maxBaselineDifference:0,soloFrames:0,
  worstRail:null,worstFold:null,baselineRed:null,eventJumps:[],birthFrames:0};let failureCount=0;
const check=(ok,label)=>{if(!ok){failureCount++;if(failures.length<16)failures.push(label);}};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function fixture({create=createLiveSnakeRenderer,count=7,reverse=false,rotation=0,mirror=1,step=218,playerStep=95,
  routeCells=cells,initialHead=cells.findIndex(p=>p.x===7&&p.y===3)}={}){
  const map=({x,y})=>{y*=mirror;for(let n=0;n<rotation;n++)[x,y]=[-y,x];return{x:x+20,y:y+20};};
  const route=routeCells.map(map),rail=makeLiveSnakePath(route),headIndex=initialHead;
  const vector=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
  const s={body:route.slice(headIndex-count+1,headIndex+1).reverse(),
    dir:vector(route[headIndex],route[headIndex-1]),reversing:reverse,color:'#d66bff',
    lastMove:1000-step,headTrail:[],anger:0,temperament:.5};
  if(reverse){const tail=s.body.at(-1),neighbor=s.body.at(-2);s.tailGuide={...tail,dir:vector(tail,neighbor)};s.tailGuideHistory=[copy(tail)];}
  const service=create(),state={time:1000,next:null};service.capture(s,1000);
  const p={x:0,y:0,dir:{x:1,y:0},moveDuration:playerStep,score:0};
  const context=vm.createContext({s,snakes:[s],dirs,gameTimeNow:()=>state.time,physicalContactActive:()=>false,
    hasCombatPower:()=>false,playerAt:()=>null,reactionAssistThreatEntryYields:()=>false,
    canEnter:(x,y)=>!!state.next&&x===state.next.x&&y===state.next.y,
    chooseTailRetreatDirection(){throw Error('Fixture has one real permitted reverse exit.');},
    spawnSnakeBiteBloom(){},AllyBrain:{noteTailBite(){},noteSplit(){}},provokeCreature(){},
    playRandomSound(){},BODY_EAT_SOUNDS:[],ControllerHaptics:{bodyBite(){}},
    awardPoints:(player,value)=>{player.score+=value;},SNAKE_SLIDE_RATIO:.55,snakeMoveDelay:()=>step,
    MazeBitersLive:{snake:service,snakeBite(kind,entity,token,player,t,created,index){
      if(kind==='split'){
        service.split(entity,created,token,{t,index,player});return;
      }
      assert.equal(kind,'tail');assert.equal(token.count,entity.body.length+1);
      service.biteTail(entity,token,{t,player});stats.nativeBites++;
    }}});
  vm.runInContext(declarations,context);
  function eventGap(before,after,label){
    const gap=Math.max(distance(before.tail,after.tail),distance(before.rear,after.rear));
    if(gap>.002&&stats.eventJumps.length<8)stats.eventJumps.push({label,time:state.time,reverse,count:s.body.length,
      before:{tail:before.tail,rear:before.rear,length:before.length,compression:before.compression},
      after:{tail:after.tail,rear:after.rear,length:after.length,compression:after.compression},
      body:copy(s.body),motion:service.capture(s,state.time).state.motion?.kind});
    stats.maxEventGap=Math.max(stats.maxEventGap,gap);check(gap<.002,`${label} commits ${gap} reference-pixel jump`);
  }
  function bite(t){
    if(s.body.length===1)return;state.time=t;const before=service.inspect(s,t),tail=s.body.at(-1);
    Object.assign(p,tail,{moveStartedAt:t});p.prevX=p.x-p.dir.x;p.prevY=p.y-p.dir.y;
    const count=s.body.length;context.checkSnakeContact(p);assert.equal(s.body.length,count-1);
    eventGap(before,service.inspect(s,t),'native tail bite');
  }
  function move(t){
    state.time=t;const oldBody=copy(s.body),oldDir=copy(s.dir),wasReversing=s.reversing,before=service.inspect(s,t);
    const at=route.findIndex(q=>q.x===s.body[0].x&&q.y===s.body[0].y);
    assert.ok(at>=0,'logical head is on actual fixture corridor');
    if(reverse&&s.body.length>1){
      const oldTail=oldBody.at(-1),neighbor=oldBody.at(-2);
      state.protectedJoin={x:(oldTail.x+.5)*36+(neighbor.x-oldTail.x)*18,
        y:(oldTail.y+.5)*36+(neighbor.y-oldTail.y)*18};
      state.next=route[at-s.body.length];assert.ok(state.next);
      assert.equal(context.retreatOneStep(s),true,'actual native one-cell retreat');
    }else{
      const next=route[at+(reverse?-1:1)];assert.ok(next);
      if(reverse){s.body[0]=copy(next);s.dir=vector(oldBody[0],next);}
      else context.advanceSnakeForward(s,vector(next,s.body[0]),t);
    }
    context.recordSnakeVisualStep(s,oldBody,t,reverse?step*2:step,oldDir,wasReversing);s.lastMove=t;
    eventGap(before,service.inspect(s,t),'native movement during consumption');stats.nativeMoves++;
  }
  function split(t,index){
    state.time=t;Object.assign(p,s.body[index]);p.prevX=p.x-p.dir.x;p.prevY=p.y-p.dir.y;
    context.checkSnakeContact(p);return context.snakes;
  }
  return{s,p,service,route,rail,bite,move,split,context,protectedJoin:()=>state.protectedJoin};
}
function inspect(f,time,label,{strict=true,control=false}={}){
  const g=f.service.getWorldGeometry(f.s,time),coreEnd=g.bodyEndDistance;
  near(g.head.span/SCALE,HEAD,'authored skull stays rigid/full-sized');
  const isSolo=g.head.solo>=1-1e-9;
  if(isSolo){near(g.tailSpan,0,'consumed final tail disappears');stats.soloFrames++;}
  const motion=f.service.capture(f.s,time).state.motion,join=f.protectedJoin();
  let protectedStart=0;
  if(motion?.kind==='joined-prefix'&&join){
    const boundary=(motion.prefixLength-motion.total)*SCALE+g.length;
    const pendingConsumed=Math.max(0,g.length/SCALE-f.s.body.length*36);
    check(motion.prefixLength<=72+pendingConsumed+.02,
      `${label}: leading prefix expands beyond corner plus still-visible consumed material`);
    if(boundary>=0){
      const at=g.sample(boundary);
      check(distance(at,{x:join.x*SCALE,y:join.y*SCALE})<POSITION_EPSILON*SCALE,
        `${label}: local tail exception must end at independently known old-tail world tangent`);
    }
    protectedStart=Math.min(coreEnd,Math.max(0,boundary));
  }
  // Once the native object is solo, its exact full-sized rigid skull uses the
  // accepted cell-center pivot. Its fading old tail is still checked for folds;
  // a rigid skull nape is not falsely required to lie on a rounded grid centerline.
  const enforceRail=strict&&f.s.body.length>1;
  const headAt=f.rail.project(g.head.x/SCALE,g.head.y/SCALE);
  for(let n=0;n<=64;n++){
    const d=coreEnd*n/64,q=g.sample(d),fold=Math.abs(q.curve)*g.diameter/2;
    if(fold>stats.maxFold){stats.maxFold=fold;stats.worstFold={label,time,n,fold};}
    check(Number.isFinite(q.x+q.y+q.curve)&&fold<1,`${label}: body ribbon folds (${fold})`);
    near(Math.hypot(q.tx,q.ty),1,'unit body tangent',1e-6);
    if(enforceRail&&d>=protectedStart-1e-8){
      const at=f.rail.project(q.x/SCALE,q.y/SCALE,headAt-(coreEnd-d)/SCALE),expected=f.rail.sample(at);
      const error=distance({x:q.x/SCALE,y:q.y/SCALE},expected),curve=Math.abs(q.curve)*SCALE;
      if(control){stats.maxControlError=Math.max(stats.maxControlError,error);}
      else if(error>stats.maxRailError){stats.maxRailError=error;stats.worstRail={label,time,n,error,count:f.s.body.length};}
      stats.maxCoreCurvature=Math.max(stats.maxCoreCurvature,curve);
      check(error<=POSITION_EPSILON,`${label}: consumption bows established body ${error} reference px off its rail`);
      check(curve<=1/RADIUS+.0001,`${label}: consumption tightens accepted body curvature (${curve})`);
    }
    stats.points++;
  }
  stats.frames++;if(control)stats.controlFrames++;
  return g;
}
function near(a,b,label,tolerance=1e-7){check(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${label}: ${a} versus ${b}`);}

// Minimal reported bug: this second legal straight commit used a whole-body
// morph ONLY because its first tail consumption was still active. Untouched
// staircase stays exactly on rail; bitten staircase bowed6.03 reference px.
function canonical(create=createLiveSnakeRenderer,eat=true,zigzag=false){
  const routeCells=Array.from({length:40},(_,i)=>({x:4+Math.ceil(i/2),y:4+Math.floor(i/2)}));
  const f=fixture({create,...zigzag?{count:12,routeCells,initialHead:11}:{}});
  f.move(1000);if(eat){f.bite(zigzag?1109:1110);if(zigzag)f.bite(1204);}f.move(1218);
  let maxError=0,maxCurve=0;const poses=[];
  for(let frame=0;frame<=109;frame++){
    const t=1218+frame*2,g=f.service.getWorldGeometry(f.s,t),points=[];
    for(let i=0;i<=100;i++){
      const p=g.sample(g.bodyEndDistance*i/100),at=f.rail.project(p.x/SCALE,p.y/SCALE),q=f.rail.sample(at);
      maxError=Math.max(maxError,distance({x:p.x/SCALE,y:p.y/SCALE},q));
      maxCurve=Math.max(maxCurve,Math.abs(p.curve)*SCALE);points.push([p.x,p.y,p.angle,p.curve]);
    }
    poses.push({head:g.head,points});
  }
  return{maxError,maxCurve,poses};
}
const canonicalCurrent=canonical(),canonicalControl=canonical(createLiveSnakeRenderer,false);
const zigzagCurrent=canonical(createLiveSnakeRenderer,true,true),zigzagControl=canonical(createLiveSnakeRenderer,false,true);
check(canonicalCurrent.maxError<POSITION_EPSILON,`canonical native bite→step leaves rail by ${canonicalCurrent.maxError}ref`);
check(canonicalCurrent.maxCurve<=1/RADIUS+.0001,`canonical native bite→step tightens curvature to ${canonicalCurrent.maxCurve}`);
check(canonicalControl.maxError<1e-7,'uneaten actual motion is the exact passing control');
check(zigzagCurrent.maxError<POSITION_EPSILON,`rapid bites must retain still-rendered old corners (${zigzagCurrent.maxError}ref)`);
check(zigzagCurrent.maxCurve<=1/RADIUS+.0001,'rapid bites cannot introduce tighter body bends');
stats.canonical={bittenError:canonicalCurrent.maxError,untouchedError:canonicalControl.maxError};
stats.zigzag={bittenError:zigzagCurrent.maxError,untouchedError:zigzagControl.maxError};

// Optional local release comparison: use the ACTUAL saved v102 module, never
// reconstruct a pretend baseline by modifying the current implementation.
// Core regression coverage above/below has no dependency on private outputs.
const baselineURL=process.env.CONSUMPTION_RAIL_BASELINE
  ?new URL(process.env.CONSUMPTION_RAIL_BASELINE)
  :new URL('../../../outputs/original-before-animation-v1.02.03.00/src/render/live-snake.js',import.meta.url);
if(existsSync(baselineURL)){
  const{createLiveSnakeRenderer:before}=await import(baselineURL.href);
  const red=canonical(before),unchanged=canonical(before,false),redZigzag=canonical(before,true,true);
  stats.baselineRed={maxRailError:red.maxError,maxCurvature:red.maxCurve,rapidBiteRailError:redZigzag.maxError};
  check(red.maxError>1,'saved v102 must reproduce the eaten-only off-rail regression');
  for(let n=0;n<unchanged.poses.length;n++){
    const old=unchanged.poses[n],now=canonicalControl.poses[n];
    for(let i=0;i<old.points.length;i++)for(let j=0;j<4;j++){
      const delta=Math.abs(old.points[i][j]-now.points[i][j]);stats.maxBaselineDifference=Math.max(stats.maxBaselineDifference,delta);
      check(delta===0,'ordinary no-bite geometry must remain byte-numerically identical to saved v102');
    }stats.baselineFrames++;
  }
}

// Real middle bite on an already bent, mid-pulse body. The two newborns are
// due immediately in native play; their first commit must keep the inherited
// curve while the simultaneous cut ends are still forming.
for(const rotation of [0,1,2,3])for(const birthTime of [110,190]){
  const f=fixture({rotation});f.move(1000);const created=f.split(1000+birthTime,3);
  assert.equal(created.length,2);
  for(let index=0;index<created.length;index++){
    const child=created[index],t=1000+birthTime,before=f.service.inspect(child,t),oldBody=copy(child.body);
    const routeIndex=f.route.findIndex(p=>p.x===child.body[0].x&&p.y===child.body[0].y);
    const next=f.route[routeIndex+(index===0?1:-1)],direction={x:next.x-child.body[0].x,y:next.y-child.body[0].y};
    f.context.advanceSnakeForward(child,direction,t);f.context.recordSnakeVisualStep(child,oldBody,t,218,direction,false);
    const after=f.service.inspect(child,t);
    near(distance(before.tail,after.tail),0,'curved newborn first commit preserves captured cut');
    near(distance(before.rear,after.rear),0,'curved newborn first commit preserves nape');
    const childFixture={...f,s:child,protectedJoin:()=>null};
    for(let n=0;n<=55;n++){
      inspect(childFixture,t+n*4,`birth/${rotation}/${birthTime}/${index}`);stats.birthFrames++;
    }
  }
}

for(const rotation of [0,1,2,3])for(const reverse of [false,true])for(const cadence of [
  {step:218,playerStep:95,factor:1},{step:218,playerStep:95,factor:.8},
  {step:70,playerStep:30.5,factor:1}
]){
  const f=fixture({count:11,reverse,rotation,...cadence}),control=fixture({count:11,reverse,rotation,...cadence});
  const interval=cadence.step*(reverse?2:1)*cadence.factor;
  const firstBite=cadence.playerStep*1.16,lastBite=firstBite+cadence.playerStep*9;
  const end=lastBite+Math.max(150,interval),events=[];
  for(let t=0;t<=end;t+=interval)events.push({time:t,type:'move'});
  for(let n=0;n<10;n++)events.push({time:firstBite+cadence.playerStep*n,type:'bite'});
  events.sort((a,b)=>a.time-b.time||(a.type==='bite'?-1:1));
  const sampleTimes=new Set(events.map(e=>e.time));for(let t=0;t<=end;t+=4)sampleTimes.add(t);
  const label=`${reverse?'reverse':'forward'}/${rotation}/${cadence.step}/${cadence.factor}`;
  let event=0;
  for(const relative of [...sampleTimes].sort((a,b)=>a-b)){
    while(event<events.length&&events[event].time<=relative+1e-8){
      const next=events[event++];if(next.type==='bite')f.bite(1000+next.time);
      else{f.move(1000+next.time);control.move(1000+next.time);}
    }
    const t=1000+relative;inspect(f,t,label);inspect(control,t,label+'/control',{control:true});
  }
  assert.equal(f.s.body.length,1);assert.equal(f.p.score,250,'ten native removals, no duplicate gameplay event');
  const final=f.service.getWorldGeometry(f.s,1000+end);near(final.head.solo,1,'terminal head fully formed');
  stats.fixtures++;
}
console.log(JSON.stringify({...stats,failures,failureCount},null,2));
assert.equal(failureCount,0,'consumption must trim the accepted route rather than deform its surviving body');
