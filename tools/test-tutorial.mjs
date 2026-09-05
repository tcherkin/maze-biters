import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

// Exercise production rules and every training event without a DOM, canvas,
// package installation, wall clock, or game-loop side effects.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/engine/game.js'),'utf8');

function segment(first,last){
  const start=source.indexOf(first);
  const end=source.indexOf(last,start+first.length);
  assert.ok(start>=0&&end>start,`Missing source boundaries: ${first} / ${last}`);
  return source.slice(start,end);
}

// Let Node's JavaScript parser match braces, strings, comments, template
// literals and destructured arguments. The first complete declaration is
// unambiguous; no hand-written brace scanner can truncate a nested function.
function declaration(name,kind='function'){
  const pattern=kind==='function'
    ?new RegExp(`\\bfunction\\s+${name}\\s*\\(`)
    :new RegExp(`\\bconst\\s+${name}\\s*=`);
  const start=source.search(pattern);
  assert.ok(start>=0,`Missing ${kind}: ${name}`);
  const delimiter=kind==='function'?'}':';';
  for(let end=source.indexOf(delimiter,start);end>=0;end=source.indexOf(delimiter,end+1)){
    const candidate=source.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw new Error(`Unterminated ${kind}: ${name}`);
}

const constants=[
  'RENDER_DIRECTIONS','MAZE_COLOR_THEMES','PLAYER_SLIDE_RATIO',
  'SNAKE_SLIDE_RATIO','SNAKE_TAIL_LEAD_RATIO','PREDICTIVE_SLIDE_SPEED_MULTIPLIER',
  'SNAKE_FORWARD_STEP_GAME_MS','PLAYER_MOUTH_TOGGLE_FORWARD_STEPS',
  'PLAYER_MOUTH_TOGGLE_GAME_MS','SPAWN_FLASH_TOGGLE_FORWARD_STEPS',
  'SPAWN_FLASH_TOGGLE_GAME_MS','SPAWN_SHIELD_FORWARD_STEPS',
  'SPAWN_SHIELD_DURATION_GAME_MS','POWER_MODE_ACCEL_MS','POWER_MODE_PLATEAU_MS',
  'POWER_MODE_DECEL_MS','POWER_MODE_TOTAL_MS','DEATH_VISUAL_PULSE_COUNT',
  'DEATH_VISUAL_PULSE_CYCLE_GAME_MS','DEATH_VISUAL_PULSE_DURATION_GAME_MS',
  'DEATH_VISUAL_VANISH_HOLD_GAME_MS','DEATH_VISUAL_TOTAL_GAME_MS',
  'LEVEL_COMPLETE_PULSE_COUNT','LEVEL_COMPLETE_PULSE_HALF_GAME_MS',
  'LEVEL_COMPLETE_TOTAL_GAME_MS','FRUIT_EAT_SOUNDS',
  'PLAYER_PHOSPHOR_TRAIL_LIFETIME_GAME_MS','PLAYER_PHOSPHOR_TRAIL_SAMPLE_DISTANCE_CELLS',
  'PLAYER_PHOSPHOR_TRAIL_DISCONTINUITY_CELLS','PLAYER_PHOSPHOR_TRAIL_MAX_SAMPLES',
  'SNAKE_YELLOW','SNAKE_BLUE','SNAKE_PINK','SNAKE_ORANGE','SNAKE_GREEN',
  'COMPETITOR_EAT_POINTS','TUTORIAL_PAGES'
];
const helpers=[
  'snakeMoveDelay','hunterMoveDelay','renderDirection','sameDirection','advanceBinaryRhythm',
  'powerModeSpeedStrength','playerMoveDelay','isPowerMode','initializePowerMode',
  'updatePowerMode','isSpawnProtected','hasCombatPower','activateSpawnShield',
  'updateSpawnShield','playerWinsContactPriority','snakeBiteFragments',
  'snakeHeadContactIsSafe','initializePlayerDeath','commitPlayerVisualStep',
  'playerVisualPosition','snakeBodyPointIsCorner','snakeMovementChangesAxis',
  'recordSnakeVisualStep','predictiveSnakeTailPosition','snakeSegmentVisualPosition',
  'ensurePlayerPhosphorTrail','clearPlayerPhosphorTrail','prunePlayerPhosphorTrail',
  'addPlayerPhosphorTrailSample','updatePlayerPhosphorTrail','playerEffectColor',
  'openHowToPlay','changeTutorialPage','announceTutorialPage'
];
const liveSentinel=Object.freeze({marker:'live game must not change',score:731});
const liveSnakes=Object.freeze([liveSentinel]);
let clock=0;
let sounds=0;
const soundKeys=[];
const context=vm.createContext({
  performance:{now:()=>clock},
  playSound:key=>{sounds++;soundKeys.push(key);},
  cachedSnakeBiteBloomTextures:()=>Object.freeze([]),
  cancelTitleConfirmationEffect:()=>{},
  canvas:{setAttribute:()=>{}},screenReaderStatus:null,highScoreNameInput:null,
  player:liveSentinel,player2:liveSentinel,snakes:liveSnakes,
  hunters:liveSnakes,fruits:liveSnakes,eggs:liveSnakes,
  gameTimeNow:()=>{throw new Error('Training accessed the live game clock');}
});
vm.runInContext(`'use strict';
  const TILE=16,COLS=36,ROWS=25;
  const dirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  let gameOverVisualsSettled=false;
  let tutorialPage=0,tutorialScreenEnteredAt=0,tutorialAction=1;
  let titleScreenMode='menu',highScoreScreenEnteredAt=0;
  ${helpers.map(name=>declaration(name)).join('\n')}
  ${constants.map(name=>declaration(name,'const')).join('\n')}
  ${segment('  const TUTORIAL_WORLD_COLUMNS=','  const tutorialMazeCanvas=')}
  ${segment('  const TUTORIAL_PLAYBACK_RATE=','  function drawTutorialInputCue(')}
  globalThis.testApi={
    createTutorialRuntime,advanceTutorialRuntime,tutorialWorldAt,tutorialPresentationDuration,
    createTutorialScene,
    openHowToPlay,changeTutorialPage,snakeBiteFragments,
    playerWinsContactPriority,snakeHeadContactIsSafe,tutorialCellIsOpen,
    playerVisualPosition,snakeSegmentVisualPosition,isPowerMode,isSpawnProtected,
    playerMoveDelay,snakeMoveDelay,initializePowerMode,
    chapters:TUTORIAL_CHAPTERS,scenes:TUTORIAL_SCENES,
    origin:TUTORIAL_CLOCK_ORIGIN,rate:TUTORIAL_PLAYBACK_RATE,
    intro:TUTORIAL_INTRO_MS,outcomeHold:TUTORIAL_OUTCOME_HOLD_MS,fade:TUTORIAL_FADE_MS,
    clearPulseCount:LEVEL_COMPLETE_PULSE_COUNT,clearPulseDuration:LEVEL_COMPLETE_TOTAL_GAME_MS,
    getEnteredAt:()=>tutorialScreenEnteredAt
  };
`,context,{filename:'tutorial-production-extract.js',timeout:10000});
const api=context.testApi;
const copy=value=>JSON.parse(JSON.stringify(value));
const manhattan=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const sceneBefore=JSON.stringify(api.scenes);
let samples=0,eventCount=0;

function checkCell(world,cell,label){
  assert.ok(api.tutorialCellIsOpen(world.scene,cell.x,cell.y),
    `${world.chapterName}: ${label} entered wall/non-cell ${JSON.stringify(cell)}`);
}

function checkVisual(world,position,label){
  assert.ok(Number.isFinite(position.x)&&Number.isFinite(position.y),`${label}: invalid visual position`);
  // Every sub-cell interpolation must remain inside a cardinal open corridor.
  for(const x of new Set([Math.floor(position.x),Math.ceil(position.x)])){
    for(const y of new Set([Math.floor(position.y),Math.ceil(position.y)])){
      checkCell(world,{x,y},`${label} visual`);
    }
  }
}

function validateWorld(world,t=world.now){
  samples++;
  for(const p of [...world.players,...world.hunters,...world.scorpions]){
    checkCell(world,p,'actor');
    assert.ok(manhattan({x:p.moveFromX,y:p.moveFromY},{x:p.moveToX,y:p.moveToY})<=1,
      `${world.chapterName}: actor interpolation skipped a cell`);
    if(!p.removed) checkVisual(world,api.playerVisualPosition(p,t),'actor');
    if(p.tailX!==undefined){
      checkCell(world,{x:p.tailX,y:p.tailY},'scorpion tail');
      assert.equal(manhattan(p,{x:p.tailX,y:p.tailY}),1,'scorpion head/tail disconnected');
    }
  }
  for(const s of world.snakes){
    assert.ok(s.body.length>0,`${world.chapterName}: empty snake remains`);
    assert.equal(Math.abs(s.dir.x)+Math.abs(s.dir.y),1,'snake direction must be cardinal');
    s.body.forEach((cell,index)=>{
      checkCell(world,cell,'snake segment');
      if(index) assert.equal(manhattan(cell,s.body[index-1]),1,'snake body disconnected');
      checkVisual(world,api.snakeSegmentVisualPosition(s,index,t,null,true),'snake');
    });
    if(world.page===2||world.page===4){
      const head=api.snakeSegmentVisualPosition(s,0,t,null,true);
      for(const p of world.players){
        const visual=api.playerVisualPosition(p,t);
        if(world.page===2) assert.ok(!p.dead,'the safe ricochet demonstration must never kill its player');
        if(p.dead) continue;
        assert.ok(Math.hypot(head.x-visual.x,head.y-visual.y)>=1-1e-9,
          'ricochet sprites overlapped before a safe escape');
        assert.ok(manhattan(s.body[0],p)>0,'ricochet entered a head collision cell');
      }
    }
  }
  for(const item of [...world.fruits,...world.eggs,...world.cues]) checkCell(world,item,'item/cue');
}

function observeEvents(world){
  const records=[];
  const finalSnakeMoves=new Map();
  for(const event of world.events){
    const run=event.run;
    event.run=t=>{
      const actors=new Map([...world.players,...world.hunters,...world.scorpions]
        .map(actor=>[actor,{x:actor.x,y:actor.y}]));
      const priorSnakes=world.snakes.map(s=>({entity:s,body:copy(s.body),
        visual:s.body.map((_,index)=>copy(api.snakeSegmentVisualPosition(s,index,t,null,true)))}));
      const fragments=world.lastFragments;
      const bites=world.bites;
      const caption=JSON.stringify([world.status,world.detail]);
      const ricochetAt=world.ricochetAt;
      assert.doesNotThrow(()=>run(t),`${world.chapterName}: ${event.label||'event'} at ${t-api.origin} ms`);
      eventCount++;
      for(const [actor,previous] of actors){
        assert.ok(manhattan(actor,previous)<=1,`${world.chapterName}: actor teleported`);
        if(world.players.includes(actor)&&manhattan(actor,previous)>0){
          records.push({type:'player step',id:actor.id,time:t,from:previous,
            to:{x:actor.x,y:actor.y},direction:copy(actor.dir)});
        }
      }
      validateWorld(world,t);
      for(const s of world.snakes){
        const prior=priorSnakes.find(previous=>previous.entity===s);
        if(prior&&manhattan(prior.body[0],s.body[0])>0){
          const snapshot=copy(s);
          finalSnakeMoves.set(s,{snake:snapshot,at:t});
          records.push({type:'snake step',time:t,from:prior.body[0],to:copy(s.body[0]),snake:snapshot});
        }
      }
      if(JSON.stringify([world.status,world.detail])!==caption){
        records.push({type:'caption',time:t,status:world.status,detail:world.detail});
      }
      if(world.ricochetAt&&world.ricochetAt!==ricochetAt){
        records.push({type:'ricochet',time:t,player:copy(world.players[0]),snake:copy(world.snakes[0])});
      }
      if(world.lastFragments&&world.lastFragments!==fragments){
        const removed=priorSnakes.find(s=>!world.snakes.includes(s.entity));
        assert.ok(removed,'fragmentation must replace an existing snake');
        const remaining=world.lastFragments.flatMap(s=>copy(s.body));
        assert.equal(remaining.length,removed.body.length-1,'a bite must remove exactly one cell');
        const newHead=world.lastFragments.at(-1).body[0];
        assert.deepEqual(copy(newHead),removed.body.at(-1),'the former tail tip must become the rear head');
        for(const part of world.lastFragments){
          part.body.forEach((cell,index)=>{
            const originalIndex=removed.body.findIndex(before=>before.x===cell.x&&before.y===cell.y);
            const visual=api.snakeSegmentVisualPosition(part,index,t,null,true);
            assert.deepEqual(copy(visual),removed.visual[originalIndex],
              `${world.chapterName}: a surviving cell snapped at fragmentation`);
          });
        }
        records.push({type:'fragment',before:removed.body,after:copy(world.lastFragments.map(s=>s.body))});
      }
      if(world.bites>bites) records.push({type:'bite',snakes:world.snakes.length,
        segments:world.snakes.reduce((sum,s)=>sum+s.body.length,0),
        player:copy(world.players[0]),time:t});
    };
  }
  return {records,finalSnakeMoves};
}

function runChapter(page,chapter,silent=false){
  const world=api.createTutorialRuntime(page,chapter,0,silent);
  const {records,finalSnakeMoves}=observeEvents(world);
  const soundStart=soundKeys.length;
  const captions=new Set();
  validateWorld(world);
  // Ten milliseconds is shorter than every movement impulse. Event wrappers
  // additionally inspect every mutation, including simultaneous events.
  for(let t=0;t<world.duration;t+=10){
    api.advanceTutorialRuntime(world,t);
    captions.add(JSON.stringify([world.status,world.detail]));
    validateWorld(world);
  }
  api.advanceTutorialRuntime(world,world.duration);
  captions.add(JSON.stringify([world.status,world.detail]));
  validateWorld(world);
  assert.equal(world.eventIndex,world.events.length,`${world.chapterName}: event outlives chapter`);
  // After each snake's final committed step, its tail must stay at that cell
  // for the entire remaining impulse. Checking a saved final-step snapshot
  // catches an advance-and-snap-back even if later frames hide the defect.
  for(const {snake,at} of finalSnakeMoves.values()){
    if(snake.body.length<2) continue;
    const index=snake.body.length-1;
    for(const fraction of [0,.5,.75,.99,1,2]){
      const visual=api.snakeSegmentVisualPosition(snake,index,
        at+snake.visualLogicalDelay*fraction,null,true);
      assert.deepEqual(copy(visual),snake.body[index],
        `${world.chapterName}: stopped tail drifted after the final snake step`);
    }
  }
  return {world,records,captions,sounds:soundKeys.slice(soundStart)};
}

const completed=Array.from(api.chapters,(chapters,page)=>Array.from(chapters,(_,chapter)=>runChapter(page,chapter)));
assert.equal(completed.length,7,'all seven tutorial pages must run');
for(const {world,records} of completed.flat()){
  const captions=records.filter(record=>record.type==='caption');
  for(let i=0;i<captions.length;i++){
    const current=captions[i],next=captions[i+1];
    const gameHold=(next?.time??api.origin+world.duration)-current.time;
    const readableMs=gameHold/api.rate+
      (i===0?api.intro-api.fade:0)+(next?0:api.outcomeHold);
    assert.ok(readableMs>=1500,
      `${world.chapterName}: unreadable ${readableMs} ms caption: ${current.status}`);
  }
}
const movement=completed[0][0];
assert.equal(movement.world.duration,6000,'the first explanation needs a full six-second loop');
assert.equal(movement.captions.size,1,'the first explanation must stay readable through the whole loop');
assert.equal(movement.records.filter(r=>r.type==='caption').length,1,
  'the movement lesson must not replace its explanation at turn events');
const movementSteps=movement.records.filter(r=>r.type==='player step');
assert.equal(movementSteps[0].time-api.origin,1800,'hold the player still while the instruction is introduced');
for(let index=1;index<movementSteps.length;index++){
  assert.equal(movementSteps[index].time-movementSteps[index-1].time,
    api.playerMoveDelay(movement.world.players[0],movementSteps[index].time),
    'movement lesson must retain the native player cadence');
}
const movementDirections=movementSteps.filter((step,index)=>!index||
  JSON.stringify(step.direction)!==JSON.stringify(movementSteps[index-1].direction));
assert.deepEqual(movementDirections.map(step=>step.direction),[{x:1,y:0},{x:0,y:-1}],
  'the first lesson must demonstrate exactly one right-to-up decision');
const firstUp=movementDirections[1];
assert.deepEqual(firstUp.from,{x:15,y:5});
assert.equal(firstUp.time-api.origin,3130);
assert.ok(api.tutorialCellIsOpen(movement.world.scene,16,5),
  'the up choice must be a junction with an open straight continuation');
assert.deepEqual({x:movement.world.players[0].x,y:movement.world.players[0].y},{x:15,y:-4});
const upwardSteps=movementSteps.filter(step=>step.direction.y===-1);
assert.deepEqual(upwardSteps.map(step=>step.to.y),[4,3,2,1,0,-1,-2,-3,-4],
  'the queued turn must continue through the open top edge without stopping');
for(let i=1;i<upwardSteps.length;i++)
  assert.equal(upwardSteps[i].time-upwardSteps[i-1].time,95);
assert.equal(movement.world.cues.length,1,'show one unambiguous input cue');
const earlyUp=movement.world.cues[0];
assert.deepEqual(copy(earlyUp.direction),{x:0,y:-1});
assert.equal(earlyUp.from,api.origin,'the up cue must already be visible before movement begins');
assert.ok(!('until' in earlyUp),'the input overlay must not expire when the player turns');
assert.deepEqual({x:earlyUp.x,y:earlyUp.y},firstUp.to);
for(const page of [0,2,4]){
  const overlayWorld=api.createTutorialRuntime(page,0,0,true);
  const cuesBefore=copy(overlayWorld.cues);
  assert.equal(cuesBefore.length,1);
  assert.ok(!('until' in cuesBefore[0]),'a tutorial key is persistent, not consumable');
  for(const local of [0,900,1050,1735,3130,overlayWorld.duration]){
    api.advanceTutorialRuntime(overlayWorld,local);
    assert.deepEqual(copy(overlayWorld.cues),cuesBefore,
      'passing, turning, or dying must never remove the instructional overlay');
  }
}

const ricochet=completed[2][0];
const ricochetEvent=ricochet.records.filter(r=>r.type==='ricochet');
assert.equal(ricochetEvent.length,1,'there must be one verified frontal-head encounter');
const encounter=ricochetEvent[0];
assert.equal(encounter.time-api.origin,1165);
assert.deepEqual({x:encounter.player.x,y:encounter.player.y},{x:15,y:4});
assert.deepEqual(encounter.snake.body[0],{x:16,y:4});
assert.equal(api.snakeHeadContactIsSafe(encounter.snake,encounter.player.dir),false,
  'ricochet must meet an actual dangerous head');
const visiblePlayer=api.playerVisualPosition(encounter.player,encounter.time);
const visibleHead=api.snakeSegmentVisualPosition(encounter.snake,0,encounter.time,null,true);
assert.equal(Math.hypot(visibleHead.x-visiblePlayer.x,visibleHead.y-visiblePlayer.y),1,
  'the native interpolated sprites must be exactly adjacent when recoil begins');
const escapingSteps=ricochet.records.filter(r=>r.type==='player step');
const firstRetreat=escapingSteps.find(step=>step.direction.x===-1);
assert.equal(firstRetreat.time,encounter.time,'the rebound must start on the checked encounter tick');
assert.deepEqual(firstRetreat.from,{x:15,y:4});
assert.deepEqual(firstRetreat.to,{x:14,y:4});
const escapeTurn=escapingSteps.find(step=>step.direction.y===-1);
assert.deepEqual(escapeTurn.from,{x:9,y:4});
assert.equal(escapeTurn.time-api.origin,1735);
assert.ok(!ricochet.world.players[0].dead,'the queued exit must keep the player alive');
assert.deepEqual({x:ricochet.world.players[0].x,y:ricochet.world.players[0].y},{x:9,y:-4},
  'the safe branch must continue offstage, not end in a stationary player');
const upwardExitSteps=escapingSteps.filter(step=>step.direction.y===-1);
assert.deepEqual(upwardExitSteps.map(step=>step.to.y),[3,2,1,0,-1,-2,-3,-4]);
for(let index=1;index<upwardExitSteps.length;index++)
  assert.equal(upwardExitSteps[index].time-upwardExitSteps[index-1].time,95,
    'the offstage exit must retain native movement without a pause at the crop');
const pursuingSteps=ricochet.records.filter(r=>r.type==='snake step');
assert.equal(pursuingSteps.length,19,'the pursuing head must finish its complete corridor');
assert.deepEqual(pursuingSteps[0].from,{x:20,y:4});
assert.deepEqual(pursuingSteps.at(-1).to,{x:1,y:4});
assert.equal(ricochet.world.duration,4400);
assert.equal(pursuingSteps[0].time-api.origin,300);
assert.equal(pursuingSteps.at(-1).time-api.origin,4224);
for(let index=1;index<pursuingSteps.length;index++){
  assert.equal(pursuingSteps[index].time-pursuingSteps[index-1].time,api.snakeMoveDelay(),
    'the pursuing snake must keep its native cadence without pauses or acceleration');
}
assert.ok(pursuingSteps.some(step=>step.time<encounter.time));
assert.ok(pursuingSteps.some(step=>step.time>encounter.time&&step.time<escapeTurn.time),
  'the snake must continue advancing during the retreat');
assert.ok(pursuingSteps.some(step=>step.time>escapeTurn.time),
  'the snake must keep moving after the player reaches the safe branch');
const tail=completed[1][0].world;
assert.equal(tail.bites,1,'tail lesson should remove exactly one segment');
assert.equal(tail.snakes.length,1);
assert.equal(tail.snakes[0].body.length,6);
const split=completed[1][1];
assert.equal(split.world.bites,1);
assert.equal(split.world.snakes.length,2);
assert.equal(split.records.filter(r=>r.type==='fragment').length,1);
assert.equal(split.records.find(r=>r.type==='fragment').after.length,2);

const scorpion=completed[3][0].world;
assert.equal(scorpion.bites,1);
assert.ok(scorpion.scorpions.every(s=>s.removed),'eating a scorpion removes it entirely');
const power=completed[3][1];
assert.ok(power.world.fruits.every(f=>f.removed),'fruit was not consumed');
assert.ok(power.world.eggs.every(e=>e.removed),'egg did not hatch');
assert.ok(power.world.hunters.every(h=>h.removed),'powered player did not eat hunter');
assert.equal(power.world.snakes.length,1);
assert.equal(power.world.snakes[0].body.length,2,'power bite should preserve two former body cells');
assert.equal(power.world.snakes[0],power.world.lastFragments[0],
  'the replacement snake must survive its complete descent');
assert.deepEqual(copy(power.world.snakes[0].body),[{x:22,y:12},{x:22,y:11}]);
assert.deepEqual(copy(power.world.snakes[0].dir),{x:0,y:1});
const descendingSteps=power.records.filter(r=>r.type==='snake step');
assert.equal(descendingSteps.length,10,'the remnant must continue down until its tail is offstage');
assert.deepEqual(descendingSteps.map(step=>step.time-api.origin),
  Array.from({length:10},(_,i)=>5150+i*api.snakeMoveDelay()));
assert.deepEqual(descendingSteps.map(step=>step.to),
  Array.from({length:10},(_,i)=>({x:22,y:3+i})));
for(let index=0;index<descendingSteps.length;index++){
  const step=descendingSteps[index];
  assert.equal(step.snake.body.length,2,'descent must retain both surviving snake cells');
  if(index) assert.equal(step.time-descendingSteps[index-1].time,api.snakeMoveDelay());
  const tailIndex=step.snake.body.length-1;
  const tailVisual=api.snakeSegmentVisualPosition(step.snake,tailIndex,
    step.time+api.snakeMoveDelay()*.75,null,true);
  checkVisual(power.world,tailVisual,'descending remnant tail');
  if(index<descendingSteps.length-1){
    assert.ok(!step.snake.visualTailPredictionDisabled,
      'the remnant tail must keep its predictive impulse until the last descent step');
    assert.ok(manhattan(tailVisual,step.snake.body[tailIndex])>0,
      'the continuing descent must visibly advance its tail');
  }else{
    assert.deepEqual(copy(tailVisual),step.snake.body[tailIndex],
      'the remnant tail must settle at its final committed cell');
  }
}
assert.deepEqual({x:power.world.players[0].x,y:power.world.players[0].y},{x:18,y:12});
const downwardExitSteps=power.records.filter(step=>step.type==='player step'&&step.direction.y===1);
assert.deepEqual(downwardExitSteps.map(step=>step.to.y),[3,4,5,6,7,8,9,10,11,12]);
const exitPower={powerModeUntil:0};
api.initializePowerMode(exitPower,api.origin+690);
for(let i=1;i<downwardExitSteps.length;i++){
  assert.ok(Math.abs(downwardExitSteps[i].time-downwardExitSteps[i-1].time-
    api.playerMoveDelay(exitPower,downwardExitSteps[i-1].time))<1e-8,
    'the exit must retain the real gradually slowing power movement');
}
assert.ok(!power.world.players[0].dead,'the powered escape branch must remain safe');
const replacement=power.records.find(r=>r.type==='fragment');
assert.ok(replacement,'powered head bite must create a replacement snake');
assert.deepEqual(replacement.after,[replacement.before.slice(1).reverse()]);
assert.ok(power.records.filter(r=>r.type==='bite').every(r=>api.isPowerMode(r.player,r.time)),
  'hunter and dangerous head must be eaten while power is active');
assert.ok(!api.isPowerMode(power.world.players[0],power.world.now),'power must expire');
for(const key of ['EatFruit1','snakeSTART@','EggKnock','ManBorn']){
  assert.ok(power.sounds.includes(key),`power lesson did not dispatch native ${key} audio`);
}

const danger=completed[4][0].world;
assert.equal(danger.players[0].x,22,'danger lesson must reach the actual terminal cell');
assert.equal(danger.players[0].y,4);
assert.ok(!api.tutorialCellIsOpen(danger.scene,23,4),'terminal cell must face a wall');
assert.ok(danger.players[0].dead,'snake must catch the trapped player');
assert.equal(danger.players[0].lives,2,'one contact must cost exactly one life');
const trappedRecords=completed[4][0].records;
const trappedRicochet=trappedRecords.filter(record=>record.type==='ricochet');
assert.equal(trappedRicochet.length,1,'the dead end needs one actual frontal rebound');
const trappedEncounter=trappedRicochet[0];
assert.equal(trappedEncounter.time-api.origin,2740);
assert.deepEqual({x:trappedEncounter.player.x,y:trappedEncounter.player.y},{x:16,y:4});
assert.deepEqual(trappedEncounter.snake.body[0],{x:15,y:4});
assert.equal(api.snakeHeadContactIsSafe(trappedEncounter.snake,trappedEncounter.player.dir),false);
assert.deepEqual(copy(api.playerVisualPosition(trappedEncounter.player,trappedEncounter.time)),{x:16,y:4});
assert.deepEqual(copy(api.snakeSegmentVisualPosition(trappedEncounter.snake,0,
  trappedEncounter.time,null,true)),{x:15,y:4});
const dangerSteps=trappedRecords.filter(record=>record.type==='player step');
assert.deepEqual(dangerSteps[0].from,{x:6,y:4},'start farther left, ahead of the pursuing head');
assert.equal(dangerSteps[0].time-api.origin,650);
for(let i=1;i<dangerSteps.length;i++)
  assert.equal(dangerSteps[i].time-dangerSteps[i-1].time,95,
    'wall reversal and snake recoil must continue at native speed without a pause');
const wallArrival=dangerSteps.find(step=>step.to.x===22);
const returningSteps=dangerSteps.filter(step=>step.time>=api.origin+2170);
assert.equal(returningSteps[0].time,wallArrival.time+95,
  'reverse exactly when the native rightward slide reaches the wall');
assert.deepEqual(returningSteps[0].from,{x:22,y:4});
assert.deepEqual(returningSteps.map(step=>step.to.x),[21,20,19,18,17,16,17,18,19,20,21,22]);
assert.ok(returningSteps.every(step=>step.to.x>15&&step.to.y===4),
  'the snake must cut off the UP exit before the player can reach it again');
for(let i=1;i<returningSteps.length;i++)
  assert.equal(returningSteps[i].time-returningSteps[i-1].time,95);
assert.equal(danger.players[0].deathStartedAt,api.origin+4138);
const trappingSteps=trappedRecords.filter(record=>record.type==='snake step');
assert.deepEqual(trappingSteps.map(step=>step.time-api.origin),
  Array.from({length:17},(_,i)=>650+i*api.snakeMoveDelay()),
  'the pursuer must never stop or jump ahead to manufacture the trap');
const missedExit=dangerSteps.find(step=>step.from.x===15&&step.direction.x===1);
const trapWarning=trappedRecords.find(record=>record.type==='caption'&&record.status==='MISSED TURN  DEAD END AHEAD');
assert.equal(trapWarning.time,missedExit.time,'explain the trap when its exit is missed, before the fast wall turn');
const fineTrap=api.createTutorialRuntime(4,0,0,true);
for(let local=0;local<=4138;local++){
  api.advanceTutorialRuntime(fineTrap,local);
  validateWorld(fineTrap);
  assert.equal(fineTrap.players[0].dead,local===4138,
    'continuous pursuit must not kill or overlap the player before the final wall contact');
}

// Only the four declared stage exits may cross a border. All other edge
// cells remain sealed, and the staging corridors have finite endpoints.
for(const [page,x,edgeY,outsideY,endY] of [[0,15,0,-1,-4],[2,9,0,-1,-4],[3,18,7,8,12],[3,22,7,8,12]]){
  const scene=api.scenes[page];
  for(const y of [edgeY,outsideY,endY]) assert.ok(api.tutorialCellIsOpen(scene,x,y));
  assert.ok(!api.tutorialCellIsOpen(scene,x-1,outsideY));
  assert.ok(!api.tutorialCellIsOpen(scene,x+1,outsideY));
  assert.ok(!api.tutorialCellIsOpen(scene,x,endY+Math.sign(outsideY-edgeY)));
}
assert.throws(()=>api.createTutorialScene(0,[[[9,1],[9,-4]]]),/protected maze border/);
assert.throws(()=>api.createTutorialScene(0,[[[1,1],[2,1]]],
  [{x:9,edge:'top',depth:4}]),/disconnected/);
for(const {world} of [movement,ricochet,power]){
  const actor=world.players[0];
  assert.equal(actor.phosphorTrailState.count,0,'exit trails must finish before the outcome hold');
  assert.ok(!actor.dead&&!actor.eliminated,'leaving the stage is not a death');
}
const duelOutcomes=completed[5].map(({world})=>{
  const dead=world.players.filter(p=>p.dead);
  return dead.length?world.players.find(p=>!p.dead).id:0;
});
assert.deepEqual(duelOutcomes,[2,1,1,0,0]);
for(const {world} of completed[5]){
  assert.ok(world.players.filter(p=>p.dead).length<=1);
  for(const p of world.players){
    if(world.duel.shield===p.id||world.duel.shield===3){
      assert.ok(api.isSpawnProtected(p,world.now),
        `${world.chapterName}: spawn shield expired while its example remained visible`);
    }
    assert.equal(p.score,world.duel[`p${p.id}`]+(p.id===world.duel.winner?1000:0),
      'duel knockout must award exactly 1000 points to its winner');
  }
  if(world.duel.winner){
    const winner=world.players.find(p=>!p.dead),victim=world.players.find(p=>p.dead);
    assert.ok(manhattan(winner,victim)>=2,'winner must move clear of the victim death effect');
  }
}
const clear=completed[6][0];
assert.equal(clear.world.bites,7,'final lesson must consume all seven original cells');
assert.equal(clear.world.snakes.length,0);
assert.ok(clear.world.clearedAt,'level completion must follow the final head bite');
assert.equal(clear.world.status,'LEVEL CLEARED','the status must not duplicate the SNAKES counter');
assert.ok(clear.records.some(r=>r.type==='bite'&&r.segments===1),'final snake must become a solitary head first');
assert.ok(!clear.world.players[0].dead);
assert.equal(api.clearPulseCount,8,'completion should retain all eight native flashes');
assert.ok(clear.world.now-clear.world.clearedAt>=api.clearPulseDuration,
  'completion chapter restarted before all native flashes could finish');

// Contact priority: shield outranks power, power outranks score, equal
// protection and score block both ways. Reverse the caller order in every case.
function competitor(id,score,{power=false,shield=false}={}){
  return {id,score,dead:false,lives:3,powerModeUntil:power?200:0,spawnShieldUntil:shield?200:0};
}
const priorityCases=[
  [competitor(1,10),competitor(2,0),1],
  [competitor(1,10),competitor(2,10),0],
  [competitor(1,10),competitor(2,0,{power:true}),2],
  [competitor(1,10,{power:true}),competitor(2,0,{power:true}),1],
  [competitor(1,10,{power:true}),competitor(2,10,{power:true}),0],
  [competitor(1,10,{power:true}),competitor(2,0,{shield:true}),2],
  [competitor(1,10,{shield:true}),competitor(2,0,{shield:true}),0],
  [competitor(1,10,{shield:true,power:true}),competitor(2,0,{shield:true}),0]
];
for(const [a,b,winner] of priorityCases){
  assert.equal(api.playerWinsContactPriority(a,b,100),winner===a.id);
  assert.equal(api.playerWinsContactPriority(b,a,100),winner===b.id);
}
for(const invalid of [{dead:true},{lives:0}]){
  const a={...competitor(1,100,{shield:true}),...invalid},b=competitor(2,0);
  assert.equal(api.playerWinsContactPriority(a,b,100),false);
  assert.equal(api.playerWinsContactPriority(b,a,100),false);
}
const expired=competitor(1,0,{shield:true,power:true}),leader=competitor(2,100);
assert.equal(api.playerWinsContactPriority(expired,leader,200),false);
assert.equal(api.playerWinsContactPriority(leader,expired,200),true);
assert.equal(api.playerWinsContactPriority(leader,leader,100),false);

// A bent rear fragment must reverse its actual body order, not invent a
// straight route or promote the cut-adjacent cell to a head.
const bent={body:[{x:5,y:1},{x:4,y:1},{x:3,y:1},{x:3,y:2},{x:3,y:3},{x:2,y:3},{x:1,y:3}],dir:{x:1,y:0}};
const bentBefore=copy(bent);
for(const index of [0,2,5,6]){
  const fragments=copy(api.snakeBiteFragments(bent,index));
  assert.equal(fragments.flatMap(s=>s.body).length,bent.body.length-1);
  for(const part of fragments){
    part.body.forEach((cell,i)=>{if(i) assert.equal(manhattan(cell,part.body[i-1]),1);});
    assert.equal(Math.abs(part.dir.x)+Math.abs(part.dir.y),1);
  }
  if(index<bent.body.length-1){
    const rear=fragments.at(-1);
    assert.deepEqual(rear.body,bent.body.slice(index+1).reverse());
    const neck=rear.body[1]||bent.body[index];
    assert.deepEqual(rear.dir,{x:rear.body[0].x-neck.x,y:rear.body[0].y-neck.y});
  }
  assert.deepEqual(bent,bentBefore,'fragment helper mutated the original body');
}
assert.equal(api.snakeBiteFragments({body:[{x:1,y:1}],dir:{x:1,y:0}},0).length,0);
for(const size of [1,2]){
  const s={body:[{x:2,y:1},{x:1,y:1}].slice(0,size),dir:{x:1,y:0}};
  assert.equal(api.snakeHeadContactIsSafe(s,{x:-1,y:0}),false);
  assert.equal(api.snakeHeadContactIsSafe(s,{x:1,y:0}),true);
  assert.equal(api.snakeHeadContactIsSafe(s,{x:0,y:1}),size===1);
}

function logicalState(world){
  return copy({page:world.page,chapter:world.chapter,cycle:world.cycle,
    bites:world.bites,status:world.status,eventIndex:world.eventIndex,
    players:world.players.map(p=>({x:p.x,y:p.y,dead:p.dead,lives:p.lives,score:p.score})),
    snakes:world.snakes.map(s=>({body:s.body,dir:s.dir})),
    fruits:world.fruits.map(f=>({x:f.x,y:f.y,removed:!!f.removed})),
    eggs:world.eggs.map(e=>({x:e.x,y:e.y,removed:!!e.removed}))});
}
for(let page=0;page<api.chapters.length;page++){
  for(let chapter=0;chapter<api.chapters[page].length;chapter++){
    const coarse=api.createTutorialRuntime(page,chapter,0,true);
    api.advanceTutorialRuntime(coarse,coarse.duration);
    assert.deepEqual(logicalState(coarse),logicalState(completed[page][chapter].world),
      'a hidden-tab catch-up or silent rebuild changed the lesson outcome');
    const fresh=api.createTutorialRuntime(page,chapter,0,true);
    assert.equal(fresh.bites,0);
    assert.notEqual(fresh.players,coarse.players);
    assert.notEqual(fresh.players[0],coarse.players[0]);
    assert.notEqual(fresh.players[0].phosphorTrailState,coarse.players[0].phosphorTrailState);
    for(const fps of [30,60,120]){
      const stepped=api.createTutorialRuntime(page,chapter,0,true);
      const frameGameMs=1000/fps*api.rate;
      for(let local=0;local<stepped.duration;local+=frameGameMs){
        api.advanceTutorialRuntime(stepped,local);
      }
      api.advanceTutorialRuntime(stepped,stepped.duration);
      assert.deepEqual(logicalState(stepped),logicalState(coarse),
        `${stepped.chapterName}: ${fps} Hz playback changed the native outcome`);
    }
  }
}
const soundCountBeforeCatchUp=sounds;
const caughtUp=api.createTutorialRuntime(3,1);
api.advanceTutorialRuntime(caughtUp,caughtUp.duration);
assert.equal(sounds,soundCountBeforeCatchUp,'hidden-tab catch-up replayed stale encounter sounds');
assert.deepEqual(logicalState(caughtUp),logicalState(power.world));

clock=10000;
api.openHowToPlay();
const start=api.tutorialWorldAt(clock);
const progressed=api.tutorialWorldAt(clock+api.intro+3000/api.rate);
assert.equal(start,progressed,'forward playback should reuse the runtime');
const rewound=api.tutorialWorldAt(clock+api.intro+100/api.rate);
assert.notEqual(rewound,progressed,'backward seeking must rebuild the runtime');
const expected=api.createTutorialRuntime(0,0);
api.advanceTutorialRuntime(expected,100);
assert.deepEqual(logicalState(rewound),logicalState(expected));
assert.ok(api.changeTutorialPage(1));
const changed=api.tutorialWorldAt(clock);
assert.equal(changed.page,1);
assert.equal(changed.chapter,0);
assert.equal(changed.bites,0);
const chapterBoundary=api.tutorialWorldAt(clock+api.tutorialPresentationDuration(api.chapters[1][0])+.01);
assert.equal(chapterBoundary.chapter,1,'chapter boundary must build the next demonstration');
const fullPageDuration=api.chapters[1].reduce((sum,c)=>sum+api.tutorialPresentationDuration(c),0);
const looped=api.tutorialWorldAt(clock+fullPageDuration+.01);
assert.equal(looped.cycle,1);
assert.equal(looped.chapter,0);
assert.equal(looped.bites,0,'loop must not retain consumed segments');

// Presentation pads must not slow down individual impulses, age shields,
// truncate the last effect, replay sounds or expose an instantaneous reset.
// Probe all 13 boundaries, including the final-to-first replay on every page.
for(let page=0;page<api.chapters.length;page++){
  clock+=100000;
  api.openHowToPlay();
  if(page) api.changeTutorialPage(page);
  let chapterStart=clock;
  for(let chapter=0;chapter<api.chapters[page].length;chapter++){
    const definition=api.chapters[page][chapter];
    const span=api.tutorialPresentationDuration(definition);
    const initial=api.tutorialWorldAt(chapterStart);
    assert.equal(initial.chapter,chapter);
    assert.equal(initial.presentationPhase,'intro');
    assert.equal(initial.transitionAlpha,1,'the new scene must be concealed at reset');
    const initialState=logicalState(initial);
    const soundBeforeIntro=sounds;
    for(const offset of [api.fade/2,api.fade,api.intro-1]){
      const intro=api.tutorialWorldAt(chapterStart+offset);
      assert.equal(intro,initial,'intro should reuse its runtime');
      assert.deepEqual(logicalState(intro),initialState,'reading hold advanced the game clock');
      assert.ok(Math.abs(intro.transitionAlpha-(offset<api.fade?.5:0))<1e-8);
    }
    assert.equal(sounds,soundBeforeIntro,'intro replayed sounds');
    const playing=api.tutorialWorldAt(chapterStart+api.intro+definition.duration*.5/api.rate);
    assert.equal(playing.presentationPhase,'play');
    assert.equal(playing.transitionAlpha,0,'active native effects must never be faded');
    assert.ok(Math.abs(playing.now-api.origin-definition.duration*.5)<1e-7);
    const finish=chapterStart+api.intro+definition.duration/api.rate;
    const outcome=api.tutorialWorldAt(finish+.001);
    assert.equal(outcome.presentationPhase,'outcome');
    assert.deepEqual(logicalState(outcome),logicalState(completed[page][chapter].world));
    const soundBeforeHold=sounds;
    const settled=api.tutorialWorldAt(finish+api.outcomeHold-.001);
    assert.equal(settled.transitionAlpha,0,'allow the full outcome to settle before fading');
    const fading=api.tutorialWorldAt(chapterStart+span-api.fade/2);
    assert.ok(Math.abs(fading.transitionAlpha-.5)<1e-8);
    assert.deepEqual(logicalState(fading),logicalState(outcome),'fade aged a shield or effect');
    assert.equal(sounds,soundBeforeHold,'outcome hold replayed sounds');
    const beforeReset=api.tutorialWorldAt(chapterStart+span-.001);
    assert.ok(beforeReset.transitionAlpha>.99999,'hide the old scene before reset');
    chapterStart+=span;
  }
  const nextCycle=api.tutorialWorldAt(chapterStart+.001);
  assert.equal(nextCycle.cycle,1);
  assert.equal(nextCycle.chapter,0);
  assert.ok(nextCycle.transitionAlpha>.99999);
}
clock+=20000;
api.openHowToPlay();
const reopened=api.tutorialWorldAt(clock);
assert.equal(reopened.page,0);
assert.equal(reopened.eventIndex,1,'reopening should replay only the initial caption');
assert.equal(reopened.players[0].x,1);
assert.equal(JSON.stringify(api.scenes),sceneBefore,'playback mutated shared scene definitions');
assert.equal(context.player,liveSentinel);
assert.equal(context.snakes,liveSnakes);
assert.equal(context.player.score,731,'tutorial modified live score');
assert.ok(sounds>0,'normal playback must exercise its audio dispatch');
console.log(`Tutorial regression checks passed: ${completed.flat().length} chapters, ${eventCount} events, ${samples} geometry samples, readable captions, seamless fragments, presentation boundaries, 30/60/120 Hz and replay isolation.`);
