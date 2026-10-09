import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';

// Real native decisions, wall/actor checks, bite handler and visual bridge.
// Only surroundings (maze, sound, score and clock) are test doubles. Actual
// painted-alpha wall clearance is independently checked by the art review.
const source=readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function extract(name){
  const start=source.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  assert.ok(start>=0,`production function ${name}`);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const candidate=source.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw Error(`Unterminated ${name}`);
}
const functions=['playerAt','occupiedByOtherSnake','occupiedBySelf','canEnter',
  'snakeBrainProfile','chooseForwardDirection','choose','snakeStep',
  'snakeHeadContactIsSafe','resolveSnakePartContact','checkSnakeContact',
  'snakeBodyPointIsCorner','snakeMovementChangesAxis','recordSnakeVisualStep',
  'predictiveReverseHeadPosition'];
const dirs=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const copy=value=>JSON.parse(JSON.stringify(value));
const key=p=>`${p.x},${p.y}`;
const stats={fixtures:0,nativeTicks:0,heldPoseChecks:0,branchPoseChecks:0,
  tailBirths:0,contactChecks:0,predictionChecks:0,wallEscapes:0,
  escapePoseChecks:0,livenessTicks:0,obstructionChecks:0,occupantPairs:0,
  blockedRearEscapes:0,malformedRecoveries:0,tailBirthEscapes:0,
  retryCycles:0,retryTicks:0,repairedBacksteps:0,alternateBacksteps:0};
const extracted=functions.map(extract).join('\n');
function fixture(map,{body=[[0,0]],trail=[[-1,0]],open=[[-1,0],[0,0],[1,0]],
  player=[8,8],facing=[1,0],reversing=true,steps=1,powered=false}={}){
  const cell=([x,y])=>map({x,y}),origin=cell([0,0]);
  const vector=([x,y])=>{const q=cell([x,y]);return{x:q.x-origin.x,y:q.y-origin.y};};
  const s={body:body.map(cell),headTrail:trail.map(cell),dir:vector(facing),
    reversing,reverseSteps:steps,blockedDir:vector(facing),lastMove:500,color:'#35e55b'};
  const target=cell(player),p={...target,prevX:target.x,prevY:target.y,dead:false,lives:3};
  const cells=new Set(open.map(x=>key(cell(x)))),deaths=[],eats=[],effects=[],points=[];
  const actors={hunter:new Set(),scorpion:new Set(),egg:new Set()};
  const service=createLiveSnakeRenderer();service.capture(s,0);
  const brain={routeHistory:[],surpriseAt:Infinity};
  const fieldFor=()=>{
    const field=new Int16Array(32*32).fill(-1),queue=[{x:p.x,y:p.y}];field[p.y*32+p.x]=0;
    for(let i=0;i<queue.length;i++)for(const d of dirs){
      const q={x:queue[i].x+d.x,y:queue[i].y+d.y},j=q.y*32+q.x;
      if(cells.has(key(q))&&field[j]===-1){field[j]=field[queue[i].y*32+queue[i].x]+1;queue.push(q);}
    }
    return field;
  };
  const ctx=vm.createContext({s,snakes:[s],player:p,player2:null,player3:null,activePlayerCount:1,
    dirs,Math:Object.assign(Object.create(Math),{random:()=>0}),
    REVERSE_HEAD_NEW_BRANCH_CHANCE:.75,REACTION_ASSIST_HOLD:Symbol('hold'),
    SNAKE_SLIDE_RATIO:.55,SNAKE_TAIL_LEAD_RATIO:.5,PREDICTIVE_SLIDE_SPEED_MULTIPLIER:1.8,
    snakeMoveDelay:()=>218,gameTimeNow:()=>1000,isWall:(x,y)=>!cells.has(`${x},${y}`),
    occupiedByScorpion:(x,y)=>actors.scorpion.has(`${x},${y}`),
    occupiedByHunter:(x,y)=>actors.hunter.has(`${x},${y}`),
    occupiedBySolidEgg:(x,y)=>actors.egg.has(`${x},${y}`),
    playerRepelsInhabitant:()=>false,reactionAssistThreatEntryYields:()=>false,
    physicalContactActive:()=>false,hasCombatPower:()=>powered,
    loseLife(v){deaths.push({head:copy(s.body[0]),player:{x:v.x,y:v.y}});v.dead=true;},
    powerEatSnakeHead:()=>eats.push(true),spawnSnakeBiteBloom:()=>effects.push('bloom'),
    provokeCreature:()=>{},AllyBrain:{noteTailBite(){effects.push('tail');},noteCompleted(){},noteSplit(){}},
    playRandomSound:()=>effects.push('sound'),playSound:()=>{},BODY_EAT_SOUNDS:[],
    ControllerHaptics:{bodyBite(){effects.push('haptic');},headBite(){}},
    awardPoints:(_p,value)=>points.push(value),nextLevel:()=>effects.push('level'),
    stateFor:()=>brain,selectTargetPlayer:()=>p,aggression:()=>1,evolvingIntelligence:()=>1,
    clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),tacticalTarget:()=>p,fieldFor,index:(x,y)=>y*32+x,
    MazeBitersLive:{snake:service,snakeBite:()=>effects.push('animation')}});
  vm.runInContext(extracted,ctx);ctx.MazeBrain={choose:ctx.choose};
  const choose=ctx.choose;
  ctx.MazeBrain.choose=(entity,from,options,...rest)=>{
    assert.ok(options.every(d=>cells.has(`${from.x+d.x},${from.y+d.y}`)),'AI options passed real wall filtering');
    const d=choose(entity,from,options,...rest);
    assert.ok(options.some(o=>o.x===d.x&&o.y===d.y),'AI cannot invent an unfiltered direction');return d;
  };
  function step(t){
    const oldBody=copy(s.body),wasReversing=s.reversing,oldDir=copy(s.dir);ctx.snakeStep(s,t);
    const h=s.body[0],distance=Math.abs(h.x-oldBody[0].x)+Math.abs(h.y-oldBody[0].y);
    assert.ok(distance===0||distance===1,'native commit is stationary or exactly one cardinal cell');
    assert.ok(cells.has(key(h)),'head cannot enter wall');
    if(!distance)assert.deepEqual(copy(s.dir),oldDir,'no stationary facing-only turn');
    ctx.recordSnakeVisualStep(s,oldBody,t,wasReversing?436:218,oldDir,wasReversing);
    s.lastMove=t;stats.nativeTicks++;return{oldBody,wasReversing,distance};
  }
  function putPlayer(position){Object.assign(p,cell(position),{dead:false});p.prevX=p.x;p.prevY=p.y;}
  function putActor(position,present=true,kind='hunter'){
    const target=cell(position),k=key(target);
    if(kind==='snake'){
      ctx.snakes=ctx.snakes.filter(other=>other.testBlockerKey!==k);
      if(present)ctx.snakes.push({body:[target],testBlockerKey:k});
    }else if(present)actors[kind].add(k);else actors[kind].delete(k);
  }
  function predicted(t){stats.predictionChecks++;return ctx.predictiveReverseHeadPosition(s,t);}
  stats.fixtures++;return{s,p,ctx,cells,deaths,eats,effects,points,service,step,cell,vector,putPlayer,putActor,predicted};
}
function at(f,cell){assert.deepEqual(copy(f.s.body[0]),f.cell(cell));}
function heading(f,d){assert.deepEqual(copy(f.s.dir),f.vector(d));}
const occupantKinds=['player','hunter','scorpion','egg','snake'];
function putOccupant(f,kind,position,present=true,playerSlot=1){
  if(kind!=='player'){f.putActor(position,present,kind);return;}
  if(playerSlot===1)f.putPlayer(present?position:[8,8]);
  else{
    f.ctx.player2=present?{...f.cell(position),dead:false,lives:3}:null;
    f.ctx.activePlayerCount=present?2:1;
  }
}
function heldGeometry(f,t){
  const a=f.service.getWorldGeometry(f.s,t),angle=a.head.angle,x=a.head.x,y=a.head.y,span=a.head.span;
  const logical=JSON.stringify(f.s);
  for(let i=0;i<=32;i++){
    const b=f.service.getWorldGeometry(f.s,t+i*436/32);
    assert.ok(Math.hypot(b.head.x-x,b.head.y-y)<1e-8,'held head has no sideways orbit');
    assert.ok(Math.abs(b.head.angle-angle)<1e-8,'held head never spins toward the player');
    assert.equal(b.head.span,span);assert.equal(b.head.solo,1);assert.equal(b.tailSpan,0);
    assert.equal(JSON.stringify(f.s),logical,'rendering cannot mutate native history');stats.heldPoseChecks++;
  }
}
function verifyForwardEscape(f,t,destination){
  const prior=f.service.getWorldGeometry(f.s,t),angle=prior.head.angle,span=prior.head.span;
  const start={x:prior.head.x+Math.cos(angle)*span/2,y:prior.head.y+Math.sin(angle)*span/2};
  const oldDir=copy(f.s.dir),from=copy(f.s.body[0]),result=f.step(t),to=f.cell(destination);
  assert.equal(result.wasReversing,true);assert.equal(result.distance,1);
  assert.equal(f.s.reversing,false);assert.deepEqual(copy(f.s.dir),oldDir,'blocked-retreat escape does not rotate the head');
  at(f,destination);assert.equal(f.s.visualLogicalDelay,218,'forward escape completes before next native forward tick');
  assert.deepEqual(copy(f.s.headTrail.at(-1)),from,'escape stores only its actual vacated cell');
  let progress=-Infinity;
  const target={x:(to.x+.5)*16,y:(to.y+.5)*16};
  const dx=target.x-start.x,dy=target.y-start.y,length=Math.hypot(dx,dy);
  for(let i=0;i<=64;i++){
    const g=f.service.getWorldGeometry(f.s,t+218*i/64),cx=g.head.x+Math.cos(g.head.angle)*g.head.span/2,
      cy=g.head.y+Math.sin(g.head.angle)*g.head.span/2;
    assert.ok(Math.abs(Math.atan2(Math.sin(g.head.angle-angle),Math.cos(g.head.angle-angle)))<1e-8,'same-facing escape has no hidden spin');
    assert.equal(g.head.span,span);assert.equal(g.head.solo,1);assert.equal(g.tailSpan,0);
    assert.ok(Math.abs((cx-start.x)*dy-(cy-start.y)*dx)<1e-7,'escape follows corridor axis');
    const next=((cx-start.x)*dx+(cy-start.y)*dy)/Math.max(1e-9,length);
    assert.ok(next>=progress-1e-8,'head keeps advancing through escape pulse');progress=next;
    if(i===0)assert.ok(Math.hypot(cx-start.x,cy-start.y)<1e-8,'no endpoint jump at escape');
    if(i===64)assert.ok(Math.hypot(cx-target.x,cy-target.y)<1e-8,'escape reaches native cell before next tick');
    stats.escapePoseChecks++;
  }
  stats.wallEscapes++;
}
for(let rotation=0;rotation<4;rotation++)for(const mirror of [-1,1]){
  const map=({x,y})=>{y*=mirror;for(let i=0;i<rotation;i++)[x,y]=[-y,x];return{x:x+12,y:y+12};};
  // Both directions unavailable: a rear player and a FRONT WALL still hold.
  // v101 deliberately no longer holds this case when the front is empty.
  const blocked=fixture(map,{player:[-1,0],open:[[-1,0],[0,0]]}),history=copy(blocked.s.headTrail);
  assert.equal(blocked.predicted(936),null);
  for(let i=0;i<20;i++){
    blocked.step(1000+i*436);at(blocked,[0,0]);heading(blocked,[1,0]);
    assert.equal(blocked.s.reversing,true);assert.equal(blocked.s.reverseSteps,1);
    assert.deepEqual(copy(blocked.s.headTrail),history);assert.equal(blocked.deaths.length,0);
  }
  heldGeometry(blocked,1000+19*436);blocked.putPlayer([8,8]);
  const unblockedPrediction=blocked.predicted(blocked.s.lastMove+436);
  assert.deepEqual(copy(unblockedPrediction),blocked.cell([-1,0]));
  blocked.step(10000);at(blocked,[-1,0]);heading(blocked,[1,0]);assert.equal(blocked.s.reverseSteps,2);

  // Back INTO a real T, then MOVE into its empty lateral exit; no aim-only tick.
  for(const powered of [false,true]){
    const f=fixture(map,{body:[[1,0]],trail:[[-1,0],[0,0]],steps:0,
      open:[[2,0],[1,0],[0,0],[-1,0],[0,-1],[0,-2]],player:[0,-2],powered});
    f.step(1000);at(f,[0,0]);assert.equal(f.s.reversing,true);assert.equal(f.s.reverseSteps,1);
    assert.equal(f.predicted(1436),null,'uncertain junction has no committed prediction');
    f.step(1436);at(f,[0,-1]);heading(f,[0,-1]);assert.equal(f.s.reversing,false);
    assert.equal(f.s.reverseSteps,0);assert.equal(f.s.visualLogicalDelay,218,'side exit uses forward visual interval');
    const g=f.service.getWorldGeometry(f.s,1654);
    const cx=g.head.x+Math.cos(g.head.angle)*g.head.span/2,cy=g.head.y+Math.sin(g.head.angle)*g.head.span/2;
    assert.ok(Math.hypot(cx-(f.cell([0,-1]).x+.5)*16,cy-(f.cell([0,-1]).y+.5)*16)<.002);
    stats.branchPoseChecks++;f.step(1654);at(f,[0,-2]);
    assert.equal(f.deaths.length,powered?0:1);assert.equal(f.eats.length,powered?1:0);
    if(!powered)assert.deepEqual(f.deaths[0].head,f.deaths[0].player);
  }
  const tCells=[[-1,0],[0,0],[1,0],[0,-1],[0,-2]];
  const occupiedSide=fixture(map,{open:tCells,player:[0,-1]});
  occupiedSide.step(1000);at(occupiedSide,[-1,0]);heading(occupiedSide,[1,0]);
  assert.equal(occupiedSide.s.reversing,true);assert.equal(occupiedSide.deaths.length,0);
  const noBackstep=fixture(map,{open:tCells,player:[0,-2],steps:0});
  noBackstep.step(1000);at(noBackstep,[-1,0]);assert.equal(noBackstep.s.reversing,true);
  for(const trail of [[],[[0,-1]]]){
    const f=fixture(map,{trail,open:[[-1,0],[0,0],[1,0],[0,-1],[0,1]],player:[-2,0]});
    f.step(1000);assert.equal(f.s.reversing,false);
    assert.ok(f.s.dir.x*f.vector([1,0]).x+f.s.dir.y*f.vector([1,0]).y===0,'new branch is perpendicular, never180');
  }
  const elbow=fixture(map,{trail:[[0,-1]],open:[[0,0],[1,0],[0,-1]]});
  elbow.step(1000);at(elbow,[0,-1]);heading(elbow,[0,1]);assert.equal(elbow.s.reversing,true);
  for(const stale of [[-2,0],[-1,-1],[0,0],[1,0]]){
    const f=fixture(map,{trail:[stale],open:[[0,0],[1,0],stale]});
    assert.equal(f.predicted(936),null,'invalid history cannot preview a teleport or a backwards180');
    verifyForwardEscape(f,1000,[1,0]);heading(f,[1,0]);
    assert.deepEqual(copy(f.s.headTrail),[f.cell([0,0])],'malformed history is replaced with the real vacated cell');
    stats.malformedRecoveries++;
  }
  const fresh=fixture(map,{trail:[],reversing:false,steps:0,open:[[0,0],[-1,0]]});
  fresh.step(1000);at(fresh,[0,0]);assert.equal(fresh.s.reversing,true);
  assert.deepEqual(copy(fresh.predicted(1436)),fresh.cell([-1,0]));
  fresh.step(1436);at(fresh,[-1,0]);heading(fresh,[1,0]);assert.equal(fresh.s.reverseSteps,1);
  const empty=fixture(map,{trail:[],steps:0,open:[[0,0],[0,-1]],player:[0,-1]});
  assert.equal(empty.predicted(936),null);empty.step(1000);at(empty,[0,0]);heading(empty,[1,0]);
  empty.putPlayer([8,8]);assert.deepEqual(copy(empty.predicted(1436)),empty.cell([0,-1]));
  empty.step(1436);at(empty,[0,-1]);heading(empty,[0,1]);assert.equal(empty.s.reversing,true);
  assert.equal(empty.s.reverseSteps,1);assert.equal(empty.s.headTrail.length,0,'fallback is not invented history');

  // Real last-tail bite seeds a single genuine adjacent retreat cell. The
  // player still occupying it blocks retreat until leaving, then an empty
  // history may safely continue backward around a90-degree elbow.
  for(const reversing of [false,true]){
    const f=fixture(map,{body:[[1,0],[0,0]],trail:[],reversing,steps:3,
      open:[[1,0],[0,0],[-1,0],[-1,-1]],player:[0,0]});
    f.ctx.checkSnakeContact(f.p);assert.equal(f.s.body.length,1);at(f,[1,0]);
    assert.deepEqual(copy(f.s.headTrail),[f.cell([0,0])]);assert.equal(f.s.reversing,reversing);
    if(reversing)assert.equal(f.s.reverseSteps,3);assert.deepEqual(f.points,[25]);
    for(const effect of ['bloom','tail','sound','haptic','animation'])assert.ok(f.effects.includes(effect));
    f.step(1000);f.step(1436);at(f,[1,0]);assert.equal(f.s.reversing,true);assert.equal(f.deaths.length,0);
    f.putPlayer([8,8]);f.step(1872);at(f,[0,0]);assert.equal(f.s.headTrail.length,0);
    f.step(2308);at(f,[-1,0]);heading(f,[1,0]);f.step(2744);at(f,[-1,-1]);heading(f,[0,1]);
    assert.equal(f.s.reversing,true);stats.tailBirths++;
  }
  const retained=fixture(map,{body:[[0,0],[-1,0]],trail:[],reversing:true,steps:2,
    open:[[-1,0],[0,0],[1,0]],player:[-1,0]});
  retained.ctx.checkSnakeContact(retained.p);
  retained.ctx.player2={...retained.cell([1,0]),dead:false,lives:3};retained.ctx.activePlayerCount=2;
  for(let i=0;i<8;i++){retained.step(1000+436*i);at(retained,[0,0]);assert.equal(retained.s.reversing,true);}
  assert.equal(retained.deaths.length,0,'tail loss cannot restart a frontal tunnel attack');
  const contact=fixture(map,{player:[1,0],reversing:false});
  contact.ctx.checkSnakeContact(contact.p);assert.equal(contact.effects.length,0);
  contact.putPlayer([0,0]);contact.p.prevX=contact.p.x+contact.s.dir.x;contact.p.prevY=contact.p.y+contact.s.dir.y;
  contact.ctx.checkSnakeContact(contact.p);assert.equal(contact.deaths.length,1);stats.contactChecks+=2;
  const wall=fixture(map,{open:[[-1,0],[0,0],[1,0],[0,-2]],player:[0,-2]});
  assert.equal(wall.ctx.canEnter(wall.cell([0,-1]).x,wall.cell([0,-1]).y,wall.s,true),false);
  for(let i=0;i<12;i++)wall.step(1000+436*i);assert.equal(wall.deaths.length,0,'no remote kill through wall');

  // Regression: v99 reached these rear walls safely, then held forever even
  // though the empty exit was already in the head's unchanged facing. Run
  // BEYOND wall arrival (the former tests stopped one tick too early).
  for(const elbow of [false,true]){
    const route=elbow?[[2,0],[1,0],[0,0],[0,-1],[0,-2]]:[[2,0],[1,0],[0,0]];
    const f=fixture(map,{body:[[2,0]],trail:[[1,0]],open:route,steps:0});
    let t=1000;
    for(const position of route.slice(1)){
      f.step(t);at(f,position);assert.equal(f.s.reversing,true);t+=436;
    }
    const destination=elbow?[0,-1]:[1,0];
    verifyForwardEscape(f,t,destination);
    let priorTime=t,consecutiveHolds=0,completedCycles=0;
    for(let tick=0;tick<48;tick++){
      priorTime+=f.s.reversing?436:218;
      const priorMode=f.s.reversing,priorDir=copy(f.s.dir),result=f.step(priorTime);
      if(result.distance)consecutiveHolds=0;else consecutiveHolds++;
      assert.ok(consecutiveHolds<=1,'empty finite corridor cannot leave a permanent stationary head');
      assert.equal(f.deaths.length,0);
      if(priorMode&&!f.s.reversing){
        assert.deepEqual(copy(f.s.dir),priorDir,'every repeated wall escape preserves facing');
        assert.equal(result.distance,1,'no stationary mode-switch turn at repeated wall visits');
        completedCycles++;
      }
      stats.livenessTicks++;
    }
    assert.ok(completedCycles>=3,'liveness holds through repeated endpoint visits, not just first release');
  }

  // A front occupant causes waiting at the actual wall, not a contact attack.
  // Once that cell clears, the same-facing escape may proceed normally.
  for(const occupant of occupantKinds){
    const f=fixture(map,{trail:[],open:[[0,0],[1,0],[2,0]],steps:0});
    putOccupant(f,occupant,[1,0]);
    for(let i=0;i<8;i++){
      f.step(1000+i*436);at(f,[0,0]);heading(f,[1,0]);assert.equal(f.s.reversing,true);
      assert.equal(f.deaths.length,0);stats.obstructionChecks++;
    }
    putOccupant(f,occupant,[1,0],false);
    verifyForwardEscape(f,1000+8*436,[1,0]);
  }

  // v101 deliberately broadens the former three-static-walls rule. ANY
  // unavailable actual backstep may release an EMPTY already-facing front
  // cell. This moves away from the blocker without rotating or attacking it.
  for(const occupant of occupantKinds)for(const trail of [[],[[-1,0]]])for(const steps of [0,2]){
    const f=fixture(map,{trail,open:[[-1,0],[0,0],[1,0],[2,0]],steps});
    putOccupant(f,occupant,[-1,0]);assert.equal(f.predicted(936),null);
    verifyForwardEscape(f,1000,[1,0]);heading(f,[1,0]);assert.equal(f.deaths.length,0);
    f.step(1218);at(f,[2,0]);heading(f,[1,0]);assert.equal(f.s.reversing,false);
    let t=1218,holds=0;
    for(let i=0;i<12;i++){
      t+=f.s.reversing?436:218;const result=f.step(t);
      holds=result.distance?0:holds+1;
      assert.ok(holds<=1,'persistent rear blocker cannot recreate a permanent freeze');
      assert.equal(f.deaths.length,0);stats.livenessTicks++;
    }
    stats.blockedRearEscapes++;
  }

  // Every front/rear occupancy pair still waits when BOTH cells are blocked.
  // Clearing only the front enables one unchanged-facing move, never a kill.
  for(const rear of occupantKinds)for(const front of occupantKinds)for(const trail of [[],[[-1,0]]]){
    const f=fixture(map,{trail,open:[[-1,0],[0,0],[1,0],[2,0]],steps:0});
    putOccupant(f,rear,[-1,0],true,1);putOccupant(f,front,[1,0],true,2);
    assert.equal(f.predicted(936),null);
    for(let i=0;i<3;i++){
      f.step(1000+i*436);at(f,[0,0]);heading(f,[1,0]);assert.equal(f.s.reversing,true);
      assert.equal(f.deaths.length,0);stats.obstructionChecks++;
    }
    putOccupant(f,front,[1,0],false,2);verifyForwardEscape(f,1000+3*436,[1,0]);
    assert.equal(f.deaths.length,0);stats.occupantPairs++;
  }

  // Removing the rear blocker instead keeps the available backstep first in
  // the rule order; an empty front must not prematurely cancel valid retreat.
  for(const occupant of occupantKinds)for(const trail of [[],[[-1,0]]]){
    const f=fixture(map,{trail,open:[[-1,0],[0,0],[1,0]],steps:0});
    putOccupant(f,occupant,[-1,0]);putOccupant(f,'hunter',[1,0]);
    f.step(1000);at(f,[0,0]);putOccupant(f,occupant,[-1,0],false);
    f.step(1436);at(f,[-1,0]);heading(f,[1,0]);assert.equal(f.s.reversing,true);
  }
  const available=fixture(map,{trail:[[-1,0]],steps:0});
  available.step(1000);at(available,[-1,0]);assert.equal(available.s.reversing,true);

  // Prior movement is not required for a zero-rotation forward release. A
  // malformed route must never cause a backwards180 or a non-cardinal jump.
  for(const options of [{trail:[],steps:0},{trail:[[-2,0]],steps:2},{trail:[[0,0]],steps:2},{trail:[[1,0]],steps:0}]){
    const f=fixture(map,{...options,open:[[0,0],[1,0]]});
    assert.equal(f.predicted(936),null);verifyForwardEscape(f,1000,[1,0]);heading(f,[1,0]);
    const held=fixture(map,{...options,open:[[0,0],[1,0]],player:[1,0]});
    assert.equal(held.predicted(936),null);
    for(let i=0;i<4;i++){
      held.step(1000+i*436);at(held,[0,0]);heading(held,[1,0]);assert.equal(held.s.reversing,true);
      assert.equal(held.deaths.length,0);stats.obstructionChecks++;
    }
  }
  const historyWall=fixture(map,{trail:[[-1,0]],steps:0,open:[[0,0],[1,0],[0,-1]]});
  assert.equal(historyWall.predicted(936),null);verifyForwardEscape(historyWall,1000,[1,0]);

  // End-to-end birth from a REAL tail collision, rather than only synthetic
  // history: the player ate the rear cell and is still occupying it. Empty
  // front space must release the resulting lone head, even at reverseSteps0.
  for(const steps of [0,2]){
    const f=fixture(map,{body:[[0,0],[-1,0]],trail:[],reversing:true,steps,
      open:[[-1,0],[0,0],[1,0],[2,0]],player:[-1,0]});
    f.ctx.checkSnakeContact(f.p);assert.equal(f.s.body.length,1);at(f,[0,0]);
    assert.deepEqual(copy(f.s.headTrail),[f.cell([-1,0])]);assert.deepEqual(f.points,[25]);
    assert.equal(f.s.reversing,true);assert.equal(f.s.reverseSteps,steps);
    assert.equal(f.predicted(936),null);verifyForwardEscape(f,1000,[1,0]);
    assert.equal(f.deaths.length,0);f.step(1218);at(f,[2,0]);heading(f,[1,0]);
    assert.equal(f.s.reversing,false);stats.tailBirthEscapes++;
  }

  // A player directly in front remains protected even when history wrongly
  // points ahead. The old code could treat that entry as retreat and flip180.
  const ahead=fixture(map,{trail:[[1,0]],steps:2,player:[1,0],open:[[0,0],[1,0]]});
  assert.equal(ahead.predicted(936),null);
  for(let i=0;i<8;i++){
      ahead.step(1000+i*436);at(ahead,[0,0]);heading(ahead,[1,0]);assert.equal(ahead.s.reversing,true);
      assert.equal(ahead.deaths.length,0);stats.obstructionChecks++;
  }

  // Corrupt history must not permanently disable an otherwise real adjacent
  // backstep. Prediction repairs its choice WITHOUT mutating logical state;
  // the actual tick drops obsolete entries, never teleporting to that entry.
  for(const stale of [[-2,0],[-1,-1],[0,0],[1,0]])for(const front of ['wall','player','hunter']){
    const f=fixture(map,{trail:[stale],steps:0,
      open:front==='wall'?[[-2,0],[-1,0],[0,0]]:[[-2,0],[-1,0],[0,0],[1,0]]});
    if(front!=='wall')putOccupant(f,front,[1,0]);
    const before=JSON.stringify(f.s),prediction=f.predicted(936);
    assert.deepEqual(copy(prediction),f.cell([-1,0]),'bad history may only predict a legal adjacent replacement');
    assert.equal(JSON.stringify(f.s),before,'prediction cannot clear or rewrite native history');
    f.step(1000);at(f,[-1,0]);heading(f,[1,0]);assert.equal(f.s.reversing,true);
    assert.equal(f.s.headTrail.length,0);assert.equal(f.deaths.length,0);
    f.step(1436);at(f,[-2,0]);heading(f,[1,0]);assert.equal(f.s.reversing,true);
    stats.repairedBacksteps++;
  }
  for(const stale of [[-2,0],[-1,-1],[0,0],[1,0]])for(const front of ['wall','hunter','egg']){
    const f=fixture(map,{trail:[stale],reversing:false,steps:0,
      open:front==='wall'?[[-2,0],[-1,0],[0,0]]:[[-2,0],[-1,0],[0,0],[1,0]]});
    if(front!=='wall')putOccupant(f,front,[1,0]);
    f.step(1000);at(f,[0,0]);heading(f,[1,0]);assert.equal(f.s.reversing,true);
    f.step(1436);at(f,[-1,0]);heading(f,[1,0]);assert.equal(f.s.reversing,true);
    assert.equal(f.s.headTrail.length,0,'forward-to-reverse retry must also discard malformed history');
    assert.equal(f.deaths.length,0);stats.repairedBacksteps++;
  }

  // When the recorded rear AND already-facing exit are blocked, a different
  // safe rear/perpendicular step remains preferable to permanent deadlock.
  // It is a real backwards move, with at most a90-degree moving turn.
  for(const rear of occupantKinds)for(const front of ['wall',...occupantKinds])for(const steps of [0,2]){
    const f=fixture(map,{trail:[[-1,0]],steps,
      open:front==='wall'?[[-1,0],[0,0],[0,-1]]:[[-1,0],[0,0],[0,-1],[1,0]]});
    putOccupant(f,rear,[-1,0],true,1);if(front!=='wall')putOccupant(f,front,[1,0],true,2);
    // Avoid the independent existing junction-choice lottery: this fixture
    // specifically exercises retry AFTER declining a forward side branch.
    f.ctx.Math.random=()=>1;
    const prediction=f.predicted(936),h0=f.s.body[0];
    if(prediction)assert.deepEqual(copy(prediction),f.cell([0,-1]));
    else assert.ok(steps>=1&&dirs.filter(d=>f.ctx.canEnter(h0.x+d.x,h0.y+d.y,f.s,true)).length>=3,
      'only the pre-existing ambiguous junction choice suppresses an otherwise safe alternative preview');
    f.step(1000);at(f,[0,-1]);heading(f,[0,1]);assert.equal(f.s.reversing,true);
    assert.equal(f.s.headTrail.length,0,'the alternate move must discard the now-inapplicable old route');
    assert.equal(f.deaths.length,0);
    const g=f.service.getWorldGeometry(f.s,1436),h=f.cell([0,-1]);
    assert.ok(Math.hypot(g.head.x+Math.cos(g.head.angle)*g.head.span/2-(h.x+.5)*16,
      g.head.y+Math.sin(g.head.angle)*g.head.span/2-(h.y+.5)*16)<1e-8,'moving alternate retreat reaches its real cell');
    stats.alternateBacksteps++;
  }
  const alternateHeld=fixture(map,{trail:[[-1,0]],steps:0,
    open:[[-1,0],[0,0],[0,-1],[1,0]],player:[1,0]});
  putOccupant(alternateHeld,'hunter',[-1,0]);putOccupant(alternateHeld,'egg',[0,-1]);
  for(let i=0;i<4;i++){
    assert.equal(alternateHeld.predicted(936),null);
    alternateHeld.step(1000+i*436);at(alternateHeld,[0,0]);heading(alternateHeld,[1,0]);
  }
  putOccupant(alternateHeld,'egg',[0,-1],false);
  alternateHeld.step(1000+4*436);at(alternateHeld,[0,-1]);heading(alternateHeld,[0,1]);
  assert.equal(alternateHeld.s.reversing,true);assert.equal(alternateHeld.deaths.length,0);

  const straightFirst=fixture(map,{trail:[[-1,0]],steps:0,
    open:[[-1,0],[0,0],[0,-1],[1,0]]});
  putOccupant(straightFirst,'hunter',[-1,0]);verifyForwardEscape(straightFirst,1000,[1,0]);

  // Continuous retries from actual evolving states, including a FORWARD
  // head with no history. Both sides may wait indefinitely while occupied,
  // but every release must move within the native mode-change + move ticks.
  for(const reversing of [false,true])for(const trail of [[],[[-1,0]]]){
    const f=fixture(map,{trail,reversing,steps:0,
      open:Array.from({length:13},(_,i)=>[i-6,0])});
    const axis=f.vector([1,0]),origin=f.cell([0,0]);let t=1000;
    function tick(){t+=f.s.reversing?436:218;stats.retryTicks++;return f.step(t);}
    for(let cycle=0;cycle<8;cycle++){
      const head=copy(f.s.body[0]),x=(head.x-origin.x)*axis.x+(head.y-origin.y)*axis.y;
      const front=[x+1,0],rear=[x-1,0],candidateFrontKind=occupantKinds[cycle%occupantKinds.length],
        rearKind=occupantKinds[(cycle+2)%occupantKinds.length];
      // A player in front of an ordinary forward head is a legitimate
      // frontal attack, not a solid blockage. Preserve that combat rule.
      const frontKind=!f.s.reversing&&candidateFrontKind==='player'?'hunter':candidateFrontKind;
      putOccupant(f,frontKind,front,true,2);putOccupant(f,rearKind,rear,true,1);
      for(let i=0;i<4;i++){
        const result=tick();assert.equal(result.distance,0);at(f,[x,0]);heading(f,[1,0]);
        assert.equal(f.deaths.length,0,'retries never force entry into either occupied cell');
      }
      const releaseFront=cycle%2===0,destination=releaseFront?front:rear;
      putOccupant(f,releaseFront?frontKind:rearKind,destination,false,releaseFront?2:1);
      let moved=false;
      for(let attempt=0;attempt<2&&!moved;attempt++)moved=tick().distance===1;
      assert.ok(moved,'legal released direction must not leave a permanently held head');
      at(f,destination);heading(f,[1,0]);assert.equal(f.s.reversing,!releaseFront);
      assert.equal(f.deaths.length,0);
      putOccupant(f,frontKind,front,false,2);putOccupant(f,rearKind,rear,false,1);
      stats.retryCycles++;
    }
  }
}
console.log(JSON.stringify({...stats,result:'PASS: real solo AI, tail birth, walls, powers and visual bridge'},null,2));
