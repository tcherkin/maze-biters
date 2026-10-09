import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createContactRuntime} from '../src/engine/contact-runtime.js?v=1.02.03.00';

// Exercise the real two-pass update/resolver/control bridge. Simple exact
// circles isolate event ordering from the independently tested sprite traces.
const source=readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function extract(name){
  const start=name==='update'?source.indexOf('function update(t,realTime=performance.now())'):source.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));assert.ok(start>=0,`missing ${name}`);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const code=source.slice(start,end+1);try{new vm.Script(code);return code;}catch{}
  }throw Error(`Unterminated ${name}`);
}
const noop=()=>{},right={x:1,y:0},left={x:-1,y:0};
function circle(x,y,out={}){
  out.parts??=[{id:'head',role:'head',index:0,kind:'circle',r:8}];
  Object.assign(out.parts[0],{x,y});return out;
}
function makeWorld({cooperative=false}={}){
  const p={id:1,x:7,y:7,prevX:7,prevY:7,dir:{...right},nextDir:{...right},lives:3,dead:false,
    moveFromX:7,moveFromY:7,moveToX:7,moveToY:7,moveStartedAt:1000,moveDuration:95,lastMove:1000,waitingForInput:true};
  const s={body:[{x:8,y:7}],dir:{...right},reversing:true,lastMove:1000,headTrail:[]};
  const second={...p,id:2,x:8,prevX:8,moveFromX:8,moveToX:8,dir:{...left},nextDir:{...left}};
  const events=[],held=new WeakMap(),world={Math,Map,Set,console,performance,TILE:16,COLS:30,ROWS:30,
    gameOver:false,gameOverPending:false,gameOverKeepsWorldAlive:false,gameOverVisualsSettled:false,
    gameOverStopsWorld:()=>false,levelCompletionTransition:null,paused:false,awaitingPlayerSelection:false,
    EXPERIMENTAL_PHYSICAL_CONTACTS:true,physicalContactClock:null,physicalContactFault:null,physicalEventContext:null,PLAYER_SLIDE_RATIO:1,HUNTER_SLIDE_RATIO:1,
    PLAYER_MOUTH_TOGGLE_GAME_MS:218,REACTION_ASSIST_HOLD:Symbol('hold'),DEATH_VISUAL_TOTAL_GAME_MS:700,
    player:p,roster:cooperative?[p,second]:[p],snakes:cooperative?[]:[s],hunters:[],scorpion:null,scorpionSpawnAt:Infinity,
    CharacterSpriteGroups:{player:{},hunter:[]},HUNTER_PALETTE:[],dirs:[right,{x:0,y:1},left,{x:0,y:-1}],
    clock:1000,command:null,events,
    CentralGameClock:{now:()=>world.clock,reset:t=>{world.clock=t;},reanchor:noop},
    allPlayers:()=>world.roster,livingPlayers:()=>world.roster.filter(p=>!p.dead),
    originalCharacterSprite:()=>({__hvSpriteName:'unused'}),directionNumber:d=>d.x>0?2:d.y>0?3:d.x<0?4:1,
    updatePlayerDeath:noop,updatePowerMode:noop,updateSpawnShield:noop,advanceBinaryRhythm:noop,
    MazeBrain:{update:noop},AllyBrain:{plan:noop},GameplayMusic:{updateGameClock:noop},
    snakeMoveDelay:()=>218,playerMoveDelay:()=>95,hunterMoveDelay:()=>95,
    updateSnakeMemory:noop,prepareReverseHeadJunctionDecision:noop,
    snakeStep:noop,recordSnakeVisualStep:noop,snakeSegmentVisualPosition:()=>({x:8,y:7}),
    spawnScorpion:noop,moveScorpion:noop,releasePendingScorpionDrops:noop,updateEggs:noop,moveHunters:noop,
    isWall:(x,y)=>x<1||y<1||x>28||y>28,occupiedBySolidEgg:()=>false,playerContactBlocksMovement:()=>false,
    reactionAssistThreatHoldIsActive:()=>false,reactionAssistPlayerEligible:()=>false,
    reactionAssistForwardHazard:()=>false,reactionAssistQueuedSafeTurn:()=>null,
    reactionAssistRicochetStep:p=>p.reactionAssistRicochet?.path[p.reactionAssistRicochet.index]?.dir||null,
    keyboardNavigationStep:p=>p===world.player?world.command:null,heldKeyboardDirections:p=>p===world.player&&world.command?[{dir:world.command}]:[],
    resolvePlayerContact:noop,checkSnakeContact:noop,checkWorldContact:noop,
    hasCombatPower:()=>false,canPlayerEatPlayer:()=>false,eatCompetingPlayer:()=>false,
    loseLife:p=>{p.dead=true;events.push({kind:'death',time:world.clock});},
    resolveSnakePartContact(s,index,p,t){world.snakes=world.snakes.filter(v=>v!==s);events.push({kind:'head',time:t});return{kind:'head',handled:true};},
    setPaused:value=>{world.paused=value;}
  };
  world.MazeBitersLive={contactReady:()=>true,contacts:createContactRuntime(),
    mouth:{geometry(p,t,options,out){return circle((options.position.x+.5)*16,(options.position.y+.5)*16,out);},breakpoints:()=>[]},
    snake:{hold(s,t){held.set(s,t);events.push({kind:'hold',time:t});},surfaceSpeedBound:()=>0,contactBreakpoints:()=>[]},
    snakeShape:(s,t,out)=>circle((s.body[0].x+.5)*16,(s.body[0].y+.5)*16,out)
  };
  vm.createContext(world);
  for(const name of ['gameTimeNow','playerVisualPosition','smoothEntityPosition','physicalContactActive',
    'physicalCharacterGeometry','physicalContactActors','snakeHeadContactIsSafe','checkPhysicalSnakeContact','checkPhysicalPlayerContact',
    'reactionAssistTunnelCellIsOpen','reactionAssistRicochetPath','stopReactionAssistRicochet','beginReactionAssistRicochet',
    'physicalContactRicochet','holdPhysicalPlayer','reversePhysicalHunter','releasePhysicalHolds','resolvePhysicalContact','physicalContactStep',
    'commitPlayerVisualStep','advancePlayer','update'])vm.runInContext(extract(name),world);
  world.tick=t=>{world.clock=t;world.update(t,t);};
  return world;
}

const failures=[];
for(const isAI of [false,true])for(const direction of [right,{x:0,y:1},left,{x:0,y:-1}]){
  const w=makeWorld(),s=w.snakes[0];w.player.isAI=isAI;w.player.dir={...direction};
  s.reversing=false;s.dir={x:-direction.x,y:-direction.y};s.body=[{x:7,y:7}];
  w.MazeBitersLive.snake.surfaceSpeedBound=()=>24/218;
  w.MazeBitersLive.snakeShape=(s,t,out)=>{
    const distance=24*(1-Math.max(0,Math.min(1,(t-1000)/218)));
    return circle(120+direction.x*distance,120+direction.y*distance,out);
  };
  for(let t=1000;t<=1120;t+=8)w.tick(t);
  assert.equal(w.player.dead,true,'a moving mouth/head must kill a stopped unprotected human or AI in every heading');
  assert.equal(w.MazeBitersLive.contacts.diagnostics().events,1);
}
for(const [label,away] of [['approaching-held-head',false],['leaving-held-head',true]]){
  const w=makeWorld();w.tick(1000);
  assert.equal(w.events[0]?.kind,'hold','a reverse solo head yields to a stopped human');
  w.command=away?left:right;w.player.waitingForInput=false;w.player.lastMove=0;
  for(const t of [1001,1009,1017,1025,1033,1041,1049,1057,1065,1073,1081])w.tick(t);
  const record={label,events:w.events,player:w.playerVisualPosition(w.player,1081),dead:w.player.dead,snakes:w.snakes.length,
    diagnostics:w.MazeBitersLive.contacts.diagnostics()};
  console.log(JSON.stringify(record));
  try{
    if(away){assert.equal(w.player.dead,false);assert.equal(w.snakes.length,1);assert.ok(record.player.x<7);}
    else{assert.equal(w.snakes.length,0,'new player approach must reclassify the held head and eat from behind, not pass through it');}
  }catch(error){failures.push(`${label}: ${error.message}`);}
}
{
  const w=makeWorld({cooperative:true});w.tick(1000);
  assert.ok(w.player.physicalContactHold&&w.roster[1].physicalContactHold);
  w.command=left;
  for(const t of [1001,1009,1017,1025,1033,1041])w.tick(t);
  const position=w.playerVisualPosition(w.player,1041);
  console.log(JSON.stringify({label:'cooperative-separating-release',position,held:!!w.player.physicalContactHold}));
  try{assert.equal(w.player.physicalContactHold,undefined,'moving away must not relatch at its initial touching endpoint');assert.ok(position.x<7);}
  catch(error){failures.push(`cooperative-separating-release: ${error.message}`);}
}
assert.deepEqual(failures,[],'full-update contact regressions');
console.log('PASS real two-pass update: stopped reverse head, fresh approaching motion, separating solo and cooperative release.');
