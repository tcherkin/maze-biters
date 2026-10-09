import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/engine/game.js'),'utf8');
const scenarioSource=fs.readFileSync(path.join(root,'experiments/snake-turns/scenarios.js'),'utf8');
const softTurnSource=fs.readFileSync(path.join(root,'experiments/snake-turns/soft-turns.js'),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const key=p=>`${p.x},${p.y}`;

// Use the shipped movement and endpoint positioning functions. The fixtures
// prescribe routes only; this test does not replace their motion behavior.
function declaration(name,kind='function'){
  const pattern=kind==='function'
    ? new RegExp(`\\bfunction\\s+${name}\\s*\\(`)
    : new RegExp(`\\bconst\\s+${name}\\s*=`);
  const start=source.search(pattern);
  assert.ok(start>=0,`Missing production ${kind}: ${name}`);
  const delimiter=kind==='function'?'}':';';
  for(let end=source.indexOf(delimiter,start);end>=0;end=source.indexOf(delimiter,end+1)){
    const candidate=source.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw new Error(`Unterminated production ${kind}: ${name}`);
}
const functions=[
  'snakeMoveDelay','snakeBodyPointIsCorner','snakeMovementChangesAxis',
  'recordSnakeVisualStep','predictiveSnakeTailPosition',
  'reverseHeadJunctionState','createReverseHeadPredictionTarget',
  'predictiveReverseHeadPosition','snakeSegmentVisualPosition'
];
const constants=[
  'SNAKE_SLIDE_RATIO','SNAKE_TAIL_LEAD_RATIO','PREDICTIVE_SLIDE_SPEED_MULTIPLIER'
];
let openCells=new Set();
const context=vm.createContext({
  gameTimeNow:()=>{throw new Error('The study must supply explicit game time');},
  canEnter:(x,y)=>openCells.has(`${x},${y}`),playerAt:()=>null,
  document:{createElement(){throw new Error('Soft turns must not create canvas elements');}},
  OffscreenCanvas:class{constructor(){throw new Error('Soft turns must not create offscreen canvases');}}
});
vm.runInContext(`'use strict';
  let gameOverVisualsSettled=false;
  const dirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  ${constants.map(name=>declaration(name,'const')).join('\n')}
  ${functions.map(name=>declaration(name)).join('\n')}
  globalThis.production={${functions.join(',')}};
  ${scenarioSource}
  ${softTurnSource}
`,context,{filename:'snake-turn-study-production-extract.js',timeout:10000});
const production=context.production;
const scenarios=context.MazeBitersTurnScenarios;
const softTurns=context.MazeBitersSoftTurns;
const slideRatio=vm.runInContext('SNAKE_SLIDE_RATIO',context);
let recordCalls=[];
const adapter={
  delay:production.snakeMoveDelay(),
  position:production.snakeSegmentVisualPosition,
  configureCorridor(cells){openCells=new Set(cells.map(key));},
  recordStep(s,oldBody,t,delay,oldTravel,wasReversing){
    recordCalls.push(copy({oldBody,t,delay,oldTravel,wasReversing}));
    production.recordSnakeVisualStep(s,oldBody,t,delay,oldTravel,wasReversing);
  }
};
let movementCases=0;
let sampleCount=0;
for(const name of scenarios.names) for(const length of [1,2,5]){
  for(const quarterTurns of [0,1,2,3]){
    recordCalls=[];
    const state=scenarios.create(name,adapter,{length,quarterTurns});
    const duplicate=scenarios.create(name,adapter,{length,quarterTurns});
    assert.deepEqual(copy(state),copy(duplicate),'initial scenario must be deterministic');
    assert.equal(state.width,12);
    assert.equal(state.height,9);
    assert.equal(state.stepCount,0);
    assert.equal(state.time,1000);
    assert.equal(state.delay,adapter.delay*(state.reversing?2:1));
    openCells=new Set(state.path.map(key));
    assert.equal(openCells.size,state.path.length,'route cells must be unique');
    for(let i=0;i<state.path.length;i++){
      const p=state.path[i];
      assert.equal(distance(p,state.path[(i+1)%state.path.length]),1,'route must close orthogonally');
      assert.ok(p.x>=1&&p.x<state.width-1&&p.y>=1&&p.y<state.height-1,'rotated route keeps a border');
    }
    const firstBody=copy(state.snake.body);
    const firstIndex=state.index;
    const turns={clockwise:0,counterclockwise:0};
    let reverseTailReveals=0;
    for(let i=0;i<state.path.length;i++){
      const oldBody=copy(state.snake.body);
      const oldDir=copy(state.snake.dir);
      const oldTime=state.time;
      const callCount=recordCalls.length;
      assert.equal(scenarios.step(state),state,'step preserves the state identity');
      const record=recordCalls.at(-1);
      assert.equal(recordCalls.length,callCount+1,'one recorded production step per update');
      scenarios.step(duplicate);
      assert.deepEqual(copy(state),copy(duplicate),'explicit step sequence must be deterministic');
      const s=state.snake;
      assert.equal(s.body.length,length);
      assert.equal(new Set(s.body.map(key)).size,length,'body may not overlap itself');
      assert.deepEqual(copy(state.previousBody),oldBody,'unmodified old cells remain available to renderers');
      assert.deepEqual(copy(state.previousDir),oldDir);
      assert.equal(state.time,oldTime+state.delay);
      assert.equal(state.stepCount,i+1);
      assert.equal(s.lastMove,state.time);
      assert.equal(s.visualMoveStartedAt,state.time);
      assert.equal(s.visualLogicalDelay,state.delay);
      assert.equal(s.visualMoveDuration,state.delay*slideRatio);
      assert.deepEqual(copy(s.visualBodyTo),copy(s.body),'renderer destination matches logical state');
      assert.deepEqual(record.oldBody,oldBody);
      assert.equal(record.t,state.time);
      assert.equal(record.delay,state.delay);
      assert.equal(record.wasReversing,state.reversing);
      const oldTravel=state.reversing?{x:-oldDir.x,y:-oldDir.y}:oldDir;
      assert.deepEqual(record.oldTravel,copy(oldTravel),'recording uses the production old facing convention');
      assert.deepEqual(copy(state.previousHeadTravelDirection),copy(oldTravel));
      for(let j=0;j<length;j++){
        assert.ok(openCells.has(key(s.body[j])),'every body cell lies on the route');
        assert.equal(distance(oldBody[j],s.body[j]),1,'every logical segment moves exactly one cell');
        if(j>0) assert.equal(distance(s.body[j-1],s.body[j]),1,'body must stay grid adjacent');
      }
      if(length>1){
        assert.deepEqual(copy(s.dir),copy({
          x:s.body[0].x-s.body[1].x,y:s.body[0].y-s.body[1].y
        }),'head remains oriented away from its neck, including retreat');
      }
      if(state.event.headTurn) turns[state.event.headTurn]++;
      if(s.reverseTailTurnReveal) reverseTailReveals++;
      const logicalSnapshot=copy({body:s.body,dir:s.dir,lastMove:s.lastMove});
      // Both columns receive this same snake and timestamp. The production
      // renderer may cache a reverse prediction, but must leave logical cells
      // and direction intact while sampling its endpoints.
      for(const phase of [0,.25,.5,.75,.999,1]){
        const t=state.time+state.delay*phase;
        for(const segment of new Set([0,length-1])){
          const point=production.snakeSegmentVisualPosition(s,segment,t);
          const repeated=production.snakeSegmentVisualPosition(s,segment,t);
          assert.deepEqual(copy(point),copy(repeated),'same state and timestamp have stable endpoint coordinates');
          assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
          assert.ok(distance(point,s.body[segment])<=1+1e-9,'endpoint stays within one logical cell');
          sampleCount++;
        }
      }
      assert.deepEqual(copy({body:s.body,dir:s.dir,lastMove:s.lastMove}),logicalSnapshot);
      // Rendering can cache prediction on either copy. Compare the logical
      // state after sampling; the next recorder clears the visual cache.
      assert.deepEqual(copy(s.body),copy(duplicate.snake.body));
    }
    assert.equal(state.index,firstIndex);
    assert.deepEqual(copy(state.snake.body),firstBody,'one lap restores all body cells');
    if(state.route==='serpentine'){
      assert.ok(turns.clockwise>0&&turns.counterclockwise>0,'serpentine covers both turn signs');
    }else{
      assert.equal(turns[state.reversing?'counterclockwise':'clockwise'],4);
      assert.equal(turns[state.reversing?'clockwise':'counterclockwise'],0);
    }
    if(state.reversing&&length>1) assert.ok(reverseTailReveals>0,'reverse paths exercise the tail corner reveal');
    movementCases++;
  }
}

const canonical=scenarios.create('elbow-forward',adapter,{quarterTurns:3});
assert.deepEqual(copy(canonical),copy(scenarios.create('elbow-forward',adapter,{quarterTurns:-1})),
  'negative rotation normalizes deterministically');
assert.throws(()=>scenarios.create('missing',adapter),/Unknown snake-turn scenario/);
assert.throws(()=>scenarios.create('__proto__',adapter),/Unknown snake-turn scenario/);
for(const length of [0,1.5,6,NaN]){
  assert.throws(()=>scenarios.create('elbow-forward',adapter,{length}),/length must be/);
}
assert.throws(()=>scenarios.create('elbow-forward',adapter,{quarterTurns:.5}),/quarterTurns must be/);
assert.throws(()=>scenarios.create('elbow-forward',{delay:0,recordStep(){}}),/adapter requires/);
assert.throws(()=>scenarios.create('elbow-forward',{delay:218}),/adapter requires/);

const tolerance=1e-8;
const near=(a,b)=>Math.abs(a-b)<=tolerance;
const angleDistance=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
function onRoute(point,route){
  return route.some((from,i)=>{
    const to=route[(i+1)%route.length];
    return near(from.x,to.x)
      ? near(point.x,from.x)&&point.y>=Math.min(from.y,to.y)-tolerance&&point.y<=Math.max(from.y,to.y)+tolerance
      : near(point.y,from.y)&&point.x>=Math.min(from.x,to.x)-tolerance&&point.x<=Math.max(from.x,to.x)+tolerance;
  });
}
function endpointIndices(state){
  return [...new Set([0,state.length-1])];
}
const boundaryFailures=[];
let poseSamples=0;
let softenedCornerSamples=0;
let trimSamples=0;
for(const name of scenarios.names) for(const length of [1,2,5]){
  for(const quarterTurns of [0,1,2,3]){
    const state=scenarios.create(name,adapter,{length,quarterTurns});
    for(let tick=0;tick<state.path.length;tick++){
      const label=`${name}, length ${length}, rotation ${quarterTurns}, tick ${tick}`;
      const previousSamples=new Map();
      for(const phase of [0,.001,.1,.25,.49,.5,.51,.55,.75,.9,.999,1]){
        const t=state.time+state.delay*phase;
        for(const index of endpointIndices(state)){
          // Prime production's own reverse prediction cache first. The study
          // pose must not introduce changes beyond that existing behavior.
          const baseline=production.snakeSegmentVisualPosition(state.snake,index,t);
          const before=JSON.stringify(state);
          const out={marker:'reused pose output'};
          assert.equal(softTurns.pose(state,index,t,adapter,out),out);
          assert.equal(out.marker,'reused pose output');
          assert.equal(JSON.stringify(state),before,`pose must not mutate recorded state: ${label}`);
          assert.ok([out.x,out.y,out.angle,out.progress].every(Number.isFinite),`finite pose: ${label}`);
          assert.ok(out.progress>=0&&out.progress<=1);
          assert.equal(Math.abs(out.fromDir.x)+Math.abs(out.fromDir.y),1);
          assert.equal(Math.abs(out.toDir.x)+Math.abs(out.toDir.y),1);
          assert.ok(onRoute(out,state.path),`endpoint center stays on corridor centerline: ${label}`);
          const cell=state.snake.body[index];
          const oldCell=state.previousBody[index];
          const neighbour=length>1?state.snake.body[index===0?1:length-2]:cell;
          assert.ok(onRoute(out,[oldCell,cell])||onRoute(out,[cell,neighbour]),
            `endpoint remains on its own recorded or next body edge: ${label}`);
          const previous=previousSamples.get(index);
          if(previous){
            const interval=phase-previous.phase;
            assert.ok(Math.hypot(out.x-previous.x,out.y-previous.y)<=2.001*interval+tolerance,
              `endpoint translation has no intra-step jump: ${label}, phase ${phase}`);
            assert.ok(angleDistance(out.angle,previous.angle)<=5.3*interval+tolerance,
              `endpoint rotation has no intra-step jump: ${label}, phase ${phase}`);
          }
          previousSamples.set(index,{phase,x:out.x,y:out.y,angle:out.angle});
          if(!out.active&&!out.trim){
            assert.ok(near(out.x,baseline.x)&&near(out.y,baseline.y),
              `settled or straight endpoint retains production position: ${label}`);
          }
          if(out.active) softenedCornerSamples++;
          if(out.trim){
            assert.ok(length>2,'body trimming is never applied to solitary or two-cell snakes');
            assert.ok(out.trim.index>0&&out.trim.index<length-1,'only an adjacent middle body cell is trimmed');
            assert.equal(out.trim.index,index===0?1:length-2);
            trimSamples++;
          }
          poseSamples++;
        }
      }
      const boundaryTime=state.time+state.delay;
      const beforeBoundary=endpointIndices(state).map(index=>
        copy(softTurns.pose(state,index,boundaryTime,adapter)));
      scenarios.step(state);
      for(const [slot,index] of endpointIndices(state).entries()){
        const previous=beforeBoundary[slot];
        const next=softTurns.pose(state,index,boundaryTime,adapter);
        const positionJump=Math.hypot(previous.x-next.x,previous.y-next.y);
        const rotationJump=angleDistance(previous.angle,next.angle);
        if(positionJump>tolerance||rotationJump>tolerance){
          boundaryFailures.push({
            scenario:name,length,rotation:quarterTurns,tick,
            end:index===0?'head':'tail',positionJump,rotationJump,
            before:{x:previous.x,y:previous.y,angle:previous.angle},
            after:{x:next.x,y:next.y,angle:next.angle}
          });
        }
      }
    }
  }
}
assert.ok(softenedCornerSamples>0,'stress cases actually exercise softened turns');
assert.ok(trimSamples>0,'stress cases actually exercise body trimming');

function mockCanvas(){
  const calls=[];
  const stack=[];
  const ctx={
    imageSmoothingEnabled:false,clipDepth:0,
    save(){
      stack.push({smoothing:this.imageSmoothingEnabled,clipDepth:this.clipDepth});
      calls.push('save');
    },
    restore(){
      assert.ok(stack.length>0,'renderer must not restore an unsaved context');
      const saved=stack.pop();
      this.imageSmoothingEnabled=saved.smoothing;
      this.clipDepth=saved.clipDepth;calls.push('restore');
    },
    clip(){this.clipDepth++;calls.push('clip');}
  };
  for(const name of ['translate','rotate','beginPath','moveTo','lineTo','closePath','rect']){
    ctx[name]=(...args)=>{
      assert.ok(args.every(Number.isFinite),`canvas ${name} receives finite coordinates`);
      calls.push(name);
    };
  }
  return {ctx,calls,stack};
}
let renderCases=0;
let clippedBodyCases=0;
let originalRenderCases=0;
let followerRenderCases=0;
for(const name of scenarios.names) for(const length of [1,2,5]){
  for(const quarterTurns of [0,1,2,3]){
    const state=scenarios.create(name,adapter,{length,quarterTurns});
    const spriteCalls=[];
    const occlusionCalls=[];
    const originalCalls=[];
    const followerCalls=[];
    const drawAdapter={
      ...adapter,tile:24,
      render:(ctx,s,t)=>originalCalls.push({ctx,s,t}),
      follower:(ctx,s,index,t)=>{
        // Exercise both bridge outcomes: production handled the reverse neck,
        // or the study must draw this ordinary middle body segment itself.
        const handled=s.reversing&&index===1;
        followerCalls.push({index,s,t,handled});
        if(handled) spriteCalls.push({semantic:'BODY_DIRECTIONAL',clipDepth:ctx.clipDepth});
        return handled;
      },
      directionNumber:d=>d.x===1?1:d.y===1?2:d.x===-1?3:4,
      turnNumber:(a,b)=>`${a.x},${a.y}:${b.x},${b.y}`,
      sprite:(ctx,s,semantic,number,x,y,size)=>{
        assert.ok([x,y,size].every(Number.isFinite));
        spriteCalls.push({semantic,number,clipDepth:ctx.clipDepth});
      },
      occlusion:(ctx,s,number,x,y,size)=>{
        assert.ok([x,y,size].every(Number.isFinite));
        occlusionCalls.push(number);
      }
    };
    const render=softTurns.createRenderer(drawAdapter);
    for(let tick=0;tick<state.path.length;tick++){
      for(const phase of [0,.5,.75,1]) for(const clipToCorridor of [false,true]){
        const t=state.time+state.delay*phase;
        const poses=endpointIndices(state).map(index=>softTurns.pose(state,index,t,adapter));
        const trims=poses.filter(point=>point.trim);
        const {ctx,calls,stack}=mockCanvas();
        spriteCalls.length=0;
        occlusionCalls.length=0;
        originalCalls.length=0;
        followerCalls.length=0;
        const before=JSON.stringify(state);
        render(ctx,state,t,{clipToCorridor});
        assert.equal(JSON.stringify(state),before,'renderer must not modify primed movement state');
        assert.equal(stack.length,0,'all context saves must be restored');
        assert.equal(calls.filter(call=>call==='save').length,calls.filter(call=>call==='restore').length);
        assert.equal(ctx.imageSmoothingEnabled,false,'renderer restores smoothing preference');
        const pendingTurn=poses.some(point=>point.active||point.trim);
        renderCases++;
        if(!pendingTurn){
          assert.equal(originalCalls.length,1,'all ordinary frames delegate once to the exact production renderer');
          assert.equal(originalCalls[0].ctx,ctx);
          assert.equal(originalCalls[0].s,state.snake,'production receives the identical logical snake');
          assert.equal(originalCalls[0].t,t,'production receives the identical game time');
          assert.equal(spriteCalls.length,0,'delegated frames must not draw additional study sprites');
          assert.equal(occlusionCalls.length,0);
          assert.equal(followerCalls.length,0);
          assert.equal(calls.length,0,'delegated frames must not alter transforms, clipping, or smoothing');
          originalRenderCases++;
          continue;
        }
        assert.equal(originalCalls.length,0,'an active study frame does not duplicate the complete original snake');
        assert.equal(spriteCalls.length,length,'draw exactly one sprite per segment');
        assert.equal(occlusionCalls.length,1,'draw one head occlusion view');
        assert.equal(spriteCalls.at(-1).semantic,length===1?'UNIQUE_HEAD':'HEAD');
        if(length>1) assert.equal(spriteCalls[0].semantic,'TAIL','tail is drawn before the trail and head');
        assert.equal(calls.filter(call=>call==='rect').length,clipToCorridor?state.path.length:0);
        assert.equal(calls.filter(call=>call==='clip').length,(clipToCorridor?1:0)+trims.length,
          'clip the corridor and exactly the middle body cells claimed by endpoint poses');
        for(let drawIndex=0;drawIndex<spriteCalls.length;drawIndex++){
          const bodyIndex=length-1-drawIndex;
          const expectedClips=(clipToCorridor?1:0)+trims.filter(point=>point.trim.index===bodyIndex).length;
          assert.equal(spriteCalls[drawIndex].clipDepth,expectedClips,
            'a body trim applies only to its specified stationary segment');
        }
        assert.equal(ctx.clipDepth,0,'all clipping is restored after rendering');
        const straightMiddle=[];
        for(let index=1;index<length-1;index++){
          const cell=state.snake.body[index];
          const a=state.snake.body[index-1],b=state.snake.body[index+1];
          if((a.x-cell.x)*(b.x-cell.x)+(a.y-cell.y)*(b.y-cell.y)!==0) straightMiddle.push(index);
        }
        assert.deepEqual(followerCalls.map(call=>call.index).sort((a,b)=>a-b),straightMiddle,
          'only straight middle cells consult the original follower crop');
        for(const call of followerCalls){
          assert.equal(call.s,state.snake);
          assert.equal(call.t,t);
          if(call.handled) followerRenderCases++;
        }
        if(trims.length) clippedBodyCases++;
      }
      scenarios.step(state);
    }
  }
}
assert.ok(clippedBodyCases>0,'mock rendering exercises trimmed body cells');
assert.ok(originalRenderCases>0,'mock rendering exercises exact production delegation');
assert.ok(followerRenderCases>0,'mock rendering exercises the production-handled reverse neck');
assert.equal(softTurns.pose({snake:{body:[]}},0,1000,adapter),null,'an absent endpoint is safe');
const emptyCanvas=mockCanvas();
softTurns.createRenderer(adapter)(emptyCanvas.ctx,{snake:{body:[]}},1000);
assert.equal(emptyCanvas.calls.length,0,'an empty snake performs no drawing');

// Run the actual UI controller with a small DOM/canvas harness. In particular,
// "next turn" must not skip short retreat-tail or two-cell inward rotations
// merely because they have finished by the second half of a movement tick.
const studySource=fs.readFileSync(path.join(root,'experiments/snake-turns/study.js'),'utf8');
function uiHarness(name,length,quarterTurns){
  const listeners=new Map();
  const frames=[];
  const initialValues={scenario:name,length:String(length),rotation:String(quarterTurns),speed:'1',zoom:'2',phase:'0'};
  let capturedState=null;
  let createdCanvases=0;
  function canvasContext(){
    const c={};
    for(const method of ['fillRect','scale','beginPath','lineTo','moveTo','closePath','stroke',
      'setTransform','drawImage','save','translate','restore']) c[method]=()=>{};
    return c;
  }
  function element(id){
    const events=new Map();
    return {value:initialValues[id]||'',textContent:'',
      getContext:()=>canvasContext(),
      addEventListener:(type,handler)=>events.set(type,handler),
      dispatch:type=>{
        assert.ok(events.has(type),`UI has a ${type} handler for ${id}`);
        events.get(type)();
      }
    };
  }
  const ids=['before','after','scenario','length','rotation','pause','next','phase','phaseLabel','status','speed','zoom'];
  const elements=Object.fromEntries(ids.map(id=>[id,element(id)]));
  const studyContext=vm.createContext({
    MazeBitersTurnScenarios:scenarios,
    MazeBitersSoftTurns:{
      pose:softTurns.pose,
      createRenderer:()=>((ctx,state)=>{capturedState=state;})
    },
    document:{
      hidden:false,
      getElementById:id=>elements[id],
      createElement:type=>{
        assert.equal(type,'canvas');createdCanvases++;
        return {getContext:()=>canvasContext()};
      },
      addEventListener:(type,handler)=>listeners.set(type,handler)
    },
    requestAnimationFrame:handler=>frames.push(handler)
  });
  vm.runInContext(studySource,studyContext,{filename:'snake-turn-study-ui.js',timeout:10000});
  return {
    elements,frames,
    mount:()=>studyContext.MazeBitersSnakeTurnStudy.mount({...adapter,tile:16,render(){}}),
    diagnostics:()=>studyContext.__mazeBitersTurnStudyDiagnostics(),
    state:()=>capturedState,
    canvases:()=>createdCanvases
  };
}
const visitedTurnTypes=new Set();
let nextTurnCases=0;
for(const name of scenarios.names) for(const length of [1,2,5]){
  for(const quarterTurns of [0,1,2,3]){
    const ui=uiHarness(name,length,quarterTurns);
    await ui.mount();
    const expected=scenarios.create(name,adapter,{length,quarterTurns});
    assert.equal(ui.frames.length,1,'mount schedules one animation loop');
    assert.equal(ui.canvases(),2,'the UI creates only its two reusable background canvases');
    for(let click=0;click<expected.path.length;click++){
      let expectedTurns=[];
      for(let searched=0;searched<expected.path.length;searched++){
        scenarios.step(expected);
        expectedTurns=endpointIndices(expected).map(index=>({
          index,pose:softTurns.pose(expected,index,expected.time+expected.delay*.001,adapter)
        })).filter(item=>item.pose.active);
        if(expectedTurns.length) break;
      }
      assert.ok(expectedTurns.length>0,'every closed fixture offers another endpoint turn');
      ui.elements.next.dispatch('click');
      const actual=ui.state();
      const diagnostics=ui.diagnostics();
      assert.equal(diagnostics.playing,false,'next turn pauses playback');
      assert.equal(actual.stepCount,expected.stepCount,'next turn selects the earliest following endpoint turn');
      assert.deepEqual(copy(actual.snake.body),copy(expected.snake.body));
      assert.ok(diagnostics.phase===0||diagnostics.phase===.5,'next turn stops at a transition start');
      assert.ok(endpointIndices(actual).some(index=>
        softTurns.pose(actual,index,actual.time+diagnostics.phase*actual.delay,adapter).active),
      'the selected UI frame exposes an active head or tail transition');
      for(const {index,pose} of expectedTurns){
        const sign=pose.fromDir.x*pose.toDir.y-pose.fromDir.y*pose.toDir.x;
        if(sign!==0){
          visitedTurnTypes.add(`${actual.reversing?'reverse':'forward'}/${length}/${index===0?'head':'tail'}/${Math.sign(sign)}`);
        }
      }
      nextTurnCases++;
    }
    ui.elements.phase.value='750';
    ui.elements.phase.dispatch('input');
    assert.equal(ui.diagnostics().phase,.75,'manual timeline selects the requested movement phase');
    assert.equal(ui.diagnostics().playing,false,'timeline scrubbing remains paused');
    ui.elements.pause.dispatch('click');
    assert.equal(ui.diagnostics().playing,true,'pause control can resume after scrubbing');
    ui.elements.speed.value='.25';
    ui.elements.speed.dispatch('change');
    assert.equal(ui.diagnostics().speed,.25);
    ui.elements.scenario.dispatch('change');
    assert.equal(ui.diagnostics().step,0,'scenario changes reset the prescribed path');
    assert.equal(ui.diagnostics().phase,0);
    assert.equal(ui.canvases(),2,'playback and reset reuse existing background canvases');
  }
}
for(const mode of ['forward','reverse']) for(const length of [1,2,5]){
  for(const end of length===1?['head']:['head','tail']) for(const sign of [-1,1]){
    assert.ok(visitedTurnTypes.has(`${mode}/${length}/${end}/${sign}`),
      `next-turn UI covers ${mode} ${length}-cell ${end}, turn sign ${sign}`);
  }
}

// Execute the real key event registrations in isolation. An event whose key
// accessor throws proves the study guard exits before inspecting input,
// changing gameplay keys, preventing browser controls, or starting audio.
function keyRegistration(type){
  const pattern=new RegExp(`\\baddEventListener\\(['"]${type}['"]\\s*,`);
  const start=source.search(pattern);
  assert.ok(start>=0,`Missing production ${type} registration`);
  for(let end=source.indexOf(');',start);end>=0;end=source.indexOf(');',end+2)){
    const candidate=source.slice(start,end+2);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw new Error(`Unterminated production ${type} registration`);
}
for(const type of ['keydown','keyup']){
  let handler=null;
  const keyboardContext=vm.createContext({
    MazeBitersSnakeTurnStudy:{mount(){}},
    addEventListener:(registered,callback)=>{assert.equal(registered,type);handler=callback;}
  });
  vm.runInContext(keyRegistration(type),keyboardContext);
  assert.equal(typeof handler,'function');
  handler({
    get key(){throw new Error('Study input must not reach gameplay key handling');},
    preventDefault(){throw new Error('Study input must keep ordinary browser controls');}
  });
}

if(boundaryFailures.length){
  const grouped={};
  for(const failure of boundaryFailures){
    const label=`${failure.scenario}, length ${failure.length}, ${failure.end}`;
    grouped[label]=(grouped[label]||0)+1;
  }
  console.error('Snake turn boundary discontinuities:',JSON.stringify({
    total:boundaryFailures.length,grouped,examples:boundaryFailures.slice(0,6)
  },null,2));
}
assert.equal(boundaryFailures.length,0,'soft endpoint position and orientation must remain continuous across logical steps');
console.log(`Snake turn study passed: ${movementCases} deterministic cases, ${sampleCount} production samples, ${poseSamples} soft poses, ${renderCases} renderer frames (${originalRenderCases} exact-original delegates, ${followerRenderCases} neck crops, ${clippedBodyCases} body trims), ${nextTurnCases} UI next-turn checks, and isolated keyboard guards.`);
