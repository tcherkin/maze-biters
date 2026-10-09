import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run the production sampler and complete camera update with deterministic
// clocks. No browser, canvas, input handlers, or simulation loop is started.
const source=fs.readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
const first=source.indexOf('  const GAMEPLAY_CAMERA_MAX_ZOOM=');
const last=source.indexOf('  function applyGameplayCameraWorldTransform(',first);
assert.ok(first>=0&&last>first,'production camera boundaries must exist');
const cameraSource=source.slice(first,last);
function productionFunction(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`missing production function ${name}`);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const candidate=source.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw new Error(`Unterminated production function ${name}`);
}
const near=(actual,expected,label,tolerance=1e-8)=>assert.ok(
  Math.abs(actual-expected)<=tolerance,`${label}: expected ${expected}, received ${actual}`
);
const normalSpeed=16/95;
function player(id=1,x=17.5,y=12){
  return {id,x,y,dir:{x:1,y:0},nextDir:{x:1,y:0},dead:false,eliminated:false,
    hideDeathSprite:false,deathX:x,deathY:y,moveFromX:x,moveFromY:y,
    moveToX:x,moveToY:y,moveStartedAt:1000,moveDuration:95};
}
function point(actor,x,y,time){
  actor.x=actor.moveFromX=actor.moveToX=x;
  actor.y=actor.moveFromY=actor.moveToY=y;
  actor.moveStartedAt=time;
}
function harness(roster=[player()],mode=1){
  const fixture={roster};
  const context=vm.createContext({fixture,performance:{now:()=>1000},
    allPlayers:()=>fixture.roster,
    gameTimeNow(){throw new Error('Tests must provide an explicit game clock');}
  });
  vm.runInContext(`
    const TILE=16,GAME_LOGICAL_WIDTH=576,GAME_LOGICAL_HEIGHT=400;
    let gameMode=${mode},paused=false,gameOver=false,levelCompletionTransition=null;
    let gameOverVisualsSettled=false;
    ${productionFunction('playerVisualPosition')}
    ${cameraSource}
    const samplerMotion=createGameplayCameraMotionState();
    globalThis.api={camera:gameplayCamera,motion:samplerMotion,
      sample:(subject,x,y,realTime,gameTime)=>
        updateGameplayCameraMotion(samplerMotion,subject,x,y,realTime,gameTime),
      createMotion:createGameplayCameraMotionState,
      sampleState:updateGameplayCameraMotion,resetMotion:resetGameplayCameraMotionState,
      motionFor:subject=>gameplayCameraMotionStates.get(subject),
      update:updateGameplayCamera,reset:resetGameplayCamera,
      setMode(value){gameMode=value;},
      setFlags(flags={}){
        paused=!!flags.paused;gameOver=!!flags.gameOver;
        levelCompletionTransition=flags.levelCompletionTransition||null;
      }
    };
  `,context,{filename:'shared-camera-production.js',timeout:1000});
  context.api.reset(1000);
  return {api:context.api,fixture};
}
function checkCamera(camera,label){
  for(const key of ['zoom','targetZoom','x','y','targetX','targetY'])
    assert.ok(Number.isFinite(camera[key]),`${label}: finite ${key}`);
  assert.ok(camera.zoom>=1&&camera.zoom<=2,`${label}: rendered zoom stays bounded`);
  assert.ok(camera.targetZoom>=1&&camera.targetZoom<=2,`${label}: target zoom stays bounded`);
  for(const [zoom,x,y] of [[camera.zoom,camera.x,camera.y],
    [camera.targetZoom,camera.targetX,camera.targetY]]){
    assert.ok(x>=288/zoom-1e-8&&x<=576-288/zoom+1e-8,`${label}: horizontal crop stays inside maze`);
    assert.ok(y>=200/zoom-1e-8&&y<=400-200/zoom+1e-8,`${label}: vertical crop stays inside maze`);
  }
}
function straight({fps=60,duration=6000,direction={x:1,y:0},speed=normalSpeed}={}){
  const h=harness(),actor=player();
  const steps=Math.round(duration*fps/1000),dt=duration/steps;
  h.api.sample(actor,0,0,1000,1000);
  for(let frame=1;frame<=steps;frame++){
    const elapsed=frame*dt;
    h.api.sample(actor,direction.x*speed*elapsed,direction.y*speed*elapsed,
      1000+elapsed,1000+elapsed);
  }
  return {h,actor,time:1000+duration,x:direction.x*speed*duration,y:direction.y*speed*duration};
}

// Rest and held-but-blocked inputs retain the full 2x close view.
const idle=harness(),idleActor=player();
for(let frame=0;frame<400;frame++){
  idleActor.nextDir={x:frame%2,y:frame%2?0:-1};
  idleActor.waitingForInput=false;
  idleActor.keyboardHeldKeys={w:{dir:{x:0,y:-1}}};
  assert.equal(idle.api.sample(idleActor,160,160,1000+frame*16,1000+frame*16),2);
}

// All directions and render rates should converge to the same subtle opening.
const settled=[];
for(const direction of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
  for(const fps of [30,60,120]){
    const {h}=straight({direction,fps});
    near(h.api.motion.zoom,1.74,'normal straight run settles near 1.74x',.00001);
    settled.push(h.api.motion.zoom);
  }
}
for(const zoom of settled) near(zoom,settled[0],'sampler remains independent of frame rate');
const faster=straight({speed:normalSpeed*2});
near(faster.h.api.motion.zoom,1.68,'power-speed straight run opens slightly farther',.00001);
const fastest=straight({speed:normalSpeed*3.2});
near(fastest.h.api.motion.zoom,1.68,'maximum speed cannot exceed the modest opening limit');
const slower=straight({speed:normalSpeed*.6});
assert.ok(slower.h.api.motion.zoom>settled[0]&&slower.h.api.motion.zoom<2,'slower visible travel opens less');

// Nearby winding cancels signed progress while retaining the same travelled
// distance. One 2-cell square repeatedly changes direction within a small area.
const winding=harness(),wanderer=player();
function squarePosition(time){
  const travel=(time*normalSpeed)%128;
  if(travel<32) return {x:travel,y:0};
  if(travel<64) return {x:32,y:travel-32};
  if(travel<96) return {x:96-travel,y:32};
  return {x:0,y:128-travel};
}
for(let elapsed=0;elapsed<=6000;elapsed+=10){
  const location=squarePosition(elapsed);
  winding.api.sample(wanderer,location.x,location.y,1000+elapsed,1000+elapsed);
}
assert.ok(winding.api.motion.zoom>settled[0]+.08,'tight winding remains closer than a sustained straight run');
assert.ok(winding.api.motion.zoom<2,'actual winding movement still opens the camera a little');

// A reversal temporarily cancels progress, then opens once travel in the new
// direction is sustained. Stopping later decays back to the exact 2x target.
const reversing=straight();
let tightest=0;
for(let elapsed=16;elapsed<=6000;elapsed+=16){
  const zoom=reversing.h.api.sample(reversing.actor,reversing.x-normalSpeed*elapsed,
    reversing.y,reversing.time+elapsed,reversing.time+elapsed);
  if(elapsed<=1000) tightest=Math.max(tightest,zoom);
}
assert.ok(tightest>settled[0]+.12,'short backtracking must not resemble an uninterrupted straight run');
near(reversing.h.api.motion.zoom,1.74,'sustained reverse travel eventually opens again',.00001);
const stoppedX=reversing.h.api.motion.x,stoppedY=reversing.h.api.motion.y;
for(let elapsed=16;elapsed<=6000;elapsed+=16)
  reversing.h.api.sample(reversing.actor,stoppedX,stoppedY,13000+elapsed,13000+elapsed);
assert.equal(reversing.h.api.motion.zoom,2,'stopped movement returns to full close view');

// Seed/reset events are not movement. Even a legitimate 100 ms rendered gap
// uses its complete elapsed time for velocity, never the 50 ms easing cap.
for(const kind of ['new subject','teleport','tab gap','real clock rewind','game clock rewind','zero delta']){
  const run=straight(),{api}=run.h;
  let actor=run.actor,x=run.x,y=run.y,realTime=run.time+16,gameTime=run.time+16;
  if(kind==='new subject') actor=player(2);
  if(kind==='teleport') x+=256;
  if(kind==='tab gap'){realTime+=1000;gameTime+=1000;}
  if(kind==='real clock rewind') realTime=run.time-1;
  if(kind==='game clock rewind') gameTime=1000;
  if(kind==='zero delta'){realTime=run.time;gameTime=run.time;}
  const zoom=api.sample(actor,x,y,realTime,gameTime);
  if(kind==='zero delta') near(zoom,settled[0],'repeated identical timestamp is harmless');
  else{
    assert.equal(zoom,2,`${kind} resets the movement influence`);
    assert.equal(api.motion.speed,0);assert.equal(api.motion.vx,0);assert.equal(api.motion.vy,0);
  }
  assert.ok(Number.isFinite(zoom));
}
const gap=straight();
gap.h.api.sample(gap.actor,gap.x+normalSpeed*100,gap.y,gap.time+100,gap.time+100);
near(gap.h.api.motion.speed,normalSpeed,'uncapped real delta preserves speed across a slow frame',.000002);
gap.h.api.reset(gap.time+116);
assert.equal(gap.h.api.camera.zoom,1,'new game/level retains the opening full-board view');
assert.equal(gap.h.api.sample(gap.actor,gap.x+normalSpeed*116,gap.y,gap.time+116,gap.time+116),2,
  'global reset invalidates externally held sampler state on its next sample');
gap.h.api.resetMotion(gap.h.api.motion);
assert.equal(gap.h.api.motion.subject,null);assert.equal(gap.h.api.motion.zoom,2);

// Full integration must sample the visible glide, not the destination cell.
const movingPlayer=player(1,10,8),integration=harness([movingPlayer]);
movingPlayer.moveFromX=9;movingPlayer.moveToX=10;
integration.api.update(1000,1000);
near(integration.api.motionFor(movingPlayer).x,152,'light/player center at start of visible glide');
integration.api.update(1047.5,1047.5);
near(integration.api.motionFor(movingPlayer).x,160,'halfway visible glide, not logical destination');
assert.ok(integration.api.camera.soloMotionActive);
assert.ok(integration.api.camera.targetZoom<2);
checkCamera(integration.api.camera,'visible glide');

function visibleRun(roster,mode,{directions=roster.map(()=>({x:1,y:0})),duration=1600,fps=60}={}){
  const h=harness(roster,mode),origins=roster.map(actor=>({x:actor.x,y:actor.y}));
  const steps=Math.round(duration*fps/1000),dt=duration/steps;
  for(let frame=0;frame<=steps;frame++){
    const elapsed=frame*dt,t=1000+elapsed;
    roster.forEach((actor,index)=>{
      point(actor,origins[index].x+directions[index].x*normalSpeed*elapsed/16,
        origins[index].y+directions[index].y*normalSpeed*elapsed/16,t);
    });
    h.api.update(t,t);checkCamera(h.api.camera,`mode ${mode}, ${roster.length} living actors`);
  }
  return {...h,time:1000+duration};
}

// The same visible-motion behavior applies to humans and AI in every mode.
// A single living subject receives the original Solo sampler unchanged.
for(const mode of [0,1,2,3,4,5]){
  const actor=player(1,6,12),h=visibleRun([actor],mode);
  assert.equal(h.api.camera.subjectCount,1);assert.equal(h.api.camera.livingSubjectCount,1);
  assert.equal(h.api.camera.soloMotionActive,true);assert.equal(h.api.camera.motionActive,true);
  assert.ok(h.api.camera.targetZoom<1.77,'a sole living actor opens the view in every mode');
  near(h.api.camera.targetZoom,h.api.motionFor(actor).zoom,'single living target uses its own motion state');
}

// Stationary 2/3/4-player framing retains the old union of fixed 2x windows.
// This includes Solo-versus-AI, AI-only, and shared human modes.
for(const mode of [0,1,2,3,4,5]) for(const count of [2,3,4]){
  const positions=[[14.5,10],[20.5,14],[14.5,14],[20.5,10]];
  const roster=positions.slice(0,count).map(([x,y],index)=>player(index+1,x,y));
  const h=harness(roster,mode);h.api.update(1000,1000);
  near(h.api.camera.targetZoom,1.5,'stationary shared windows keep their established framing');
  near(h.api.camera.targetX,288,'shared window center x');near(h.api.camera.targetY,200,'shared window center y');
  assert.equal(h.api.camera.livingSubjectCount,count);assert.equal(h.api.camera.subjectCount,count);
  assert.equal(h.api.camera.soloMotionActive,false);assert.equal(h.api.camera.motionActive,true);
  assert.equal(h.api.camera.motionZoom,2);
  roster.forEach(actor=>assert.equal(h.api.motionFor(actor).zoom,2));
  checkCamera(h.api.camera,`stationary mode ${mode}, ${count} subjects`);
}

// Each actor has an independent filter. Shared movement expands the original
// union even when its old framing limit is already below the motion zoom.
for(const count of [2,3,4]){
  const roster=Array.from({length:count},(_,index)=>player(index+1,6+(index%2)*6,10+Math.floor(index/2)*4));
  const moving=visibleRun(roster,4);
  const states=roster.map(actor=>moving.api.motionFor(actor));
  assert.equal(new Set(states).size,count,'each living actor owns a separate motion state');
  states.forEach(state=>assert.ok(state.zoom<1.77&&state.zoom>1.74));
  near(moving.api.camera.motionZoom,Math.min(...states.map(state=>state.zoom)),'shared motion uses the widest individual view');
  const stationary=harness(roster.map(actor=>player(actor.id,actor.x,actor.y)),4);
  stationary.api.update(1000,1000);
  assert.ok(stationary.api.camera.targetZoom<moving.api.camera.motionZoom,'fixture reaches the old union framing limit');
  assert.ok(moving.api.camera.targetZoom<stationary.api.camera.targetZoom-.05,
    'movement must open beyond the old shared union limit');
  if(count===2){
    const oldUnionWidth=576/stationary.api.camera.targetZoom;
    const extraWidth=576/moving.api.camera.motionZoom-288;
    near(moving.api.camera.targetZoom,576/(oldUnionWidth+extraWidth),'shared opening expands the old horizontal union');
  }
}
const opposites=[player(1,8,12),player(2,27,12)];
const oppositeRun=visibleRun(opposites,0,{directions:[{x:1,y:0},{x:-1,y:0}]});
const rightMotion=oppositeRun.api.motionFor(opposites[0]),leftMotion=oppositeRun.api.motionFor(opposites[1]);
assert.ok(rightMotion.vx>0&&leftMotion.vx<0);
near(rightMotion.vx+leftMotion.vx,0,'opposite fixture has no combined signed progress');
near(rightMotion.zoom,leftMotion.zoom,'opposite directions independently produce equal opening');
assert.ok(oppositeRun.api.camera.motionZoom<1.77,'opposing players must not cancel each other’s movement');
const mixed=[player(1,6,10),player(2,12,14)];
const mixedRun=visibleRun(mixed,3,{directions:[{x:1,y:0},{x:0,y:0}]});
assert.equal(mixedRun.api.motionFor(mixed[1]).zoom,2,'stationary rival retains an idle motion state');
near(mixedRun.api.camera.motionZoom,mixedRun.api.motionFor(mixed[0]).zoom,'one moving participant still opens the shared view');

// Presentation states preserve their original full-board framing and easing,
// and do not carry pre-pause travel into the first resumed movement sample.
for(const flags of [{paused:true},{gameOver:true},{levelCompletionTransition:{endsAt:9000}}]){
  const roster=[player(1,8,10),player(2,14,14)],h=visibleRun(roster,4);
  const t=h.time;
  h.api.camera.zoom=2;
  h.api.setFlags(flags);h.api.update(t+16,t);
  assert.equal(h.api.camera.targetZoom,1);assert.equal(h.api.camera.subjectCount,0);
  assert.equal(h.api.camera.livingSubjectCount,2);assert.equal(h.api.camera.motionActive,false);
  assert.equal(h.api.camera.presentationZoomOut,true);
  roster.forEach(actor=>assert.equal(h.api.motionFor(actor).subject,null,'presentation resets every actor filter'));
  near(h.api.camera.zoom,1+Math.exp(-16/580),'unchanged cinematic full-board easing');
  h.api.setFlags();h.api.update(t+32,t+16);
  assert.equal(h.api.camera.motionZoom,2);
  roster.forEach(actor=>assert.equal(h.api.motionFor(actor).speed,0,'resuming starts with a fresh motion sample'));
}
const rest=harness();rest.api.camera.zoom=1.5;rest.api.update(1016,1016);
near(rest.api.camera.zoom,2-.5*Math.exp(-16/1040),'unchanged close-view easing');

// Last-survivor motion continues uninterrupted, and distant death skulls
// cannot hold its view open. Returning players rejoin with a fresh sample.
const survivors=[player(1,6,12),player(2,12,12),player(3,9,16)];
const survival=visibleRun(survivors,4);
const [living,dying,firstDying]=survivors,stateBeforeDeath=survival.api.motionFor(living);
const speedBeforeDeath=stateBeforeDeath.speed;
firstDying.dead=true;firstDying.deathX=0;firstDying.deathY=24;
point(living,living.x+normalSpeed,living.y,survival.time+16);
survival.api.update(survival.time+16,survival.time+16);
assert.equal(survival.api.camera.livingSubjectCount,2);assert.equal(survival.api.camera.subjectCount,2);
assert.equal(survival.api.motionFor(living),stateBeforeDeath,'three-to-two transition preserves the survivor filter');
dying.dead=true;dying.deathX=35;dying.deathY=24;
point(living,living.x+normalSpeed,living.y,survival.time+32);
survival.api.update(survival.time+32,survival.time+32);
assert.equal(survival.api.camera.livingSubjectCount,1);assert.equal(survival.api.camera.subjectCount,1);
assert.equal(survival.api.camera.soloMotionActive,true);
assert.equal(survival.api.motionFor(living),stateBeforeDeath,'last survivor keeps its existing filter object');
assert.ok(stateBeforeDeath.speed>=speedBeforeDeath,'last-survivor transition does not reset measured movement');
assert.equal(survival.api.motionFor(dying).subject,null,'dead actor filter resets');
near(survival.api.camera.targetZoom,stateBeforeDeath.zoom,'dead skull contributes no framing while anyone lives');
dying.dead=false;point(dying,3,3,survival.time+48);
survival.api.update(survival.time+48,survival.time+48);
assert.equal(survival.api.camera.livingSubjectCount,2);assert.equal(survival.api.camera.soloMotionActive,false);
assert.equal(survival.api.motionFor(dying).speed,0,'respawn seeds the returning actor without teleport speed');
assert.equal(survival.api.motionFor(living),stateBeforeDeath,'respawn does not replace survivor state');

const skulls=[player(1,3,3),player(2,32,21)];
const death=harness(skulls,3);death.api.update(1000,1000);
skulls.forEach(actor=>{actor.dead=true;});
death.api.update(1016,1016);
assert.equal(death.api.camera.livingSubjectCount,0);assert.equal(death.api.camera.subjectCount,2);
assert.equal(death.api.camera.motionActive,false);assert.equal(death.api.camera.targetZoom,1);
skulls[1].hideDeathSprite=true;death.api.update(1032,1032);
assert.equal(death.api.camera.subjectCount,1);assert.equal(death.api.camera.targetZoom,2);
skulls[0].eliminated=true;death.api.update(1048,1048);
assert.equal(death.api.camera.subjectCount,0);assert.equal(death.api.camera.targetZoom,1);
const replacement=player();death.fixture.roster=[replacement];death.api.update(1064,1064);
assert.equal(death.api.motionFor(replacement).subject,replacement);assert.equal(death.api.motionFor(replacement).speed,0);
replacement.eliminated=true;death.api.update(1080,1080);
assert.equal(death.api.camera.subjectCount,0);assert.equal(death.api.motionFor(replacement).subject,null);

// Global resets clear current actors and also invalidate cached states for
// temporarily absent actors when they return to a later game or level.
const resetRoster=[player(1,6,10),player(2,12,14)],resetRun=visibleRun(resetRoster,2);
resetRun.api.reset(resetRun.time+16);
assert.equal(resetRun.api.camera.zoom,1);assert.equal(resetRun.api.camera.motionActive,false);
resetRoster.forEach(actor=>{
  assert.equal(resetRun.api.motionFor(actor).subject,null);assert.equal(resetRun.api.motionFor(actor).zoom,2);
});
resetRun.api.update(resetRun.time+32,resetRun.time+32);
resetRoster.forEach(actor=>point(actor,actor.x+.2,actor.y,resetRun.time+48));
resetRun.api.update(resetRun.time+48,resetRun.time+48);
resetRoster.forEach(actor=>assert.ok(resetRun.api.motionFor(actor).speed>0));
resetRun.fixture.roster=[];
resetRun.api.reset(resetRun.time+64);
resetRun.fixture.roster=resetRoster;
resetRoster.forEach(actor=>point(actor,actor.x+.2,actor.y,resetRun.time+80));
resetRun.api.update(resetRun.time+80,resetRun.time+80);
resetRoster.forEach(actor=>assert.equal(resetRun.api.motionFor(actor).speed,0,'global reset invalidates absent actor history'));

// Changing zoom at every edge/corner must never expose outside the maze. The
// camera remains centered/clamped without adding directional lookahead.
const edgeActor=player(),edges=harness([edgeActor]);
let edgeTime=1000;
for(const location of [[0,0],[35,0],[35,24],[0,24],[17.5,12]]){
  for(let frame=0;frame<240;frame++){
    point(edgeActor,location[0],location[1],edgeTime);
    edges.api.update(edgeTime,edgeTime);checkCamera(edges.api.camera,'edge/corner framing');
    edgeTime+=1000/60;
  }
}
near(edges.api.camera.targetX,288,'stationary middle has no pan lookahead');
near(edges.api.camera.targetY,200,'stationary middle y');
assert.equal(edges.api.camera.targetZoom,2);

const edgeRoster=[player(1),player(2),player(3),player(4)],sharedEdges=harness(edgeRoster,0);
for(let frame=0;frame<480;frame++){
  const corners=[[0,0],[35,0],[35,24],[0,24]];
  edgeRoster.forEach((actor,index)=>{
    const location=frame<240?corners[index]:corners[0];
    point(actor,location[0],location[1],1000+frame*16);
  });
  sharedEdges.api.update(1000+frame*16,1000+frame*16);
  checkCamera(sharedEdges.api.camera,'four-player corner framing');
}
console.log('Gameplay camera passed: original Solo sampler behavior, all modes, 2/3/4 independent movement states, additive shared framing, opposing motion, last-survivor continuity, respawn/death/presentation/global reset handling, and maze-edge safety.');
