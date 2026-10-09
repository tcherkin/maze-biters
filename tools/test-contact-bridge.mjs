import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the actual engine bridge, not a second implementation of its
// sub-cell response. The independent geometric sweep has its own suite.
const source=readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function extract(name){
  const start=source.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));assert.ok(start>=0,`missing ${name}`);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const text=source.slice(start,end+1);try{new vm.Script(text);return text;}catch{}
  }throw Error(`Unterminated ${name}`);
}
const clone=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected,label='',epsilon=1e-8)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<epsilon,`${label}: ${actual} != ${expected}`);
const samePoint=(a,b,label)=>{near(a.x,b.x,label+' x');near(a.y,b.y,label+' y');};
const directions=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
let checks=0,actorChecks=0;
function world(){
  const events=[],roster=[];
  const context={Math,Map,Set,console,events,roster,TILE:16,COLS:30,ROWS:30,DEATH_VISUAL_TOTAL_GAME_MS:700,
    HUNTER_SLIDE_RATIO:Number(source.match(/const HUNTER_SLIDE_RATIO=([\d.]+)/)[1]),
    EXPERIMENTAL_PHYSICAL_CONTACTS:true,physicalEventContext:null,gameOverVisualsSettled:false,levelCompletionTransition:null,gameOverPending:false,
    snakes:[],hunters:[],scorpion:null,CharacterSpriteGroups:{player:{},hunter:[]},HUNTER_PALETTE:[],
    CentralGameClock:{now:()=>1000},powerModeSpeedStrength:p=>p?.strength||0,
    dirs:directions,PLAYER_MOUTH_TOGGLE_GAME_MS:218,advanceBinaryRhythm:()=>{},reactionAssistThreatHoldIsActive:()=>false,
    isWall:(x,y)=>x<1||y<1||x>28||y>28,occupiedBySolidEgg:()=>false,
    livingPlayers:()=>roster.filter(p=>!p.dead),allPlayers:()=>roster,
    heldKeyboardDirections:()=>[],
    directionNumber:d=>d.x>0?2:d.y>0?3:d.x<0?4:1,
    originalCharacterSprite:(prefix,dir,open)=>({__hvSpriteName:prefix+(open?'Open':'Closed')}),
    MazeBitersLive:{
      contactReady:()=>true,
      mouth:{reset:p=>events.push({kind:'reset-mouth',p}),geometry:(p,t,options,out)=>Object.assign(out,{p,t,options}),
        breakpoints:(p,a,b)=>[a+(b-a)/2]},
      snake:{hold:(s,t)=>events.push({kind:'snake-hold',s,t}),contactBreakpoints:(s,a,b)=>[a+(b-a)/3]},
      snakeShape:(s,t,out)=>Object.assign(out,{s,t}),
      scorpion:{geometry:(s,t,options,out)=>Object.assign(out,{s,t}),breakpoints:(s,a,b)=>[b]}
    }
  };
  vm.createContext(context);
  for(const name of ['gameTimeNow','playerMoveDelay','hunterMoveDelay','playerVisualPosition','smoothEntityPosition',
    'reactionAssistTunnelCellIsOpen','reactionAssistRicochetPath','stopReactionAssistRicochet','beginReactionAssistRicochet',
    'physicalContactActive','physicalCharacterGeometry','physicalContactActors','physicalContactRicochet',
    'holdPhysicalPlayer','reversePhysicalHunter','releasePhysicalHolds','initializePlayerDeath','resolvePhysicalContact','moveHunters'])
    vm.runInContext(extract(name),context);
  return context;
}
function moving(dir,fraction=.4,strength=0){
  const delay=95/(1+strength),p={id:1,x:7+dir.x,y:7+dir.y,prevX:7,prevY:7,dir:{...dir},nextDir:{...dir},
    moveFromX:7,moveFromY:7,moveToX:7+dir.x,moveToY:7+dir.y,moveStartedAt:100,moveDuration:delay,
    lastMove:100,lives:3,dead:false,strength,pointerNavigation:{route:[]},pointerMomentum:true};
  return {p,t:100+fraction*delay,delay};
}

// Rebound begins at the true time-of-impact point, including a partial first
// tile, then continues the original95ms-per-cell cardinal route (47.5 powered).
for(const dir of directions)for(const fraction of [.05,.25,.5,.95])for(const strength of [0,1]){
  const w=world(),{p,t,delay}=moving(dir,fraction,strength),before=clone(w.playerVisualPosition(p,t));
  assert.equal(w.physicalContactRicochet(p,dir,t),true);
  samePoint(w.playerVisualPosition(p,t),before,'rebound has no position teleport');
  samePoint(p,{x:7,y:7},'first partial target is previous integer grid center');
  samePoint(p.dir,{x:-dir.x,y:-dir.y},'native reverse heading');
  near(p.moveDuration,delay*fraction,'remaining partial-cell duration');
  near(p.lastMove+delay,t+p.moveDuration,'native next-step deadline');
  const half=w.playerVisualPosition(p,t+p.moveDuration/2);
  samePoint(half,{x:(before.x+7)/2,y:(before.y+7)/2},'native uniform speed');
  samePoint(w.playerVisualPosition(p,t+p.moveDuration),{x:7,y:7},'partial completes exactly');
  assert.ok(p.reactionAssistRicochet?.path.length>0);assert.equal(p.pointerMomentum,false);
  assert.equal(p.pointerNavigation,null);assert.ok(Number.isInteger(p.x)&&Number.isInteger(p.y));checks++;
}
for(const dir of directions){
  const w=world(),{p,t}=moving(dir),before=JSON.stringify(p);w.isWall=()=>true;
  assert.equal(w.physicalContactRicochet(p,dir,t),false,'no exit cannot pass through a maze wall');
  assert.equal(JSON.stringify(p),before,'failed recoil cannot mutate the native state');checks++;
  w.isWall=(x,y)=>x!==7||y!==7;
  assert.equal(w.physicalContactRicochet(p,dir,t),true,'one partial-cell retreat is still a legal exit');
  assert.equal(p.waitingForInput,true);assert.equal(p.reactionAssistRicochet,null);
  samePoint(w.playerVisualPosition(p,t+p.moveDuration),{x:7,y:7},'one-partial-cell exit completes visually');checks++;
}

for(const dir of directions){
  const w=world(),{p:h,t}=moving(dir,.4),before=clone(w.smoothEntityPosition(h,t));
  w.reversePhysicalHunter(h,t);
  samePoint(w.smoothEntityPosition(h,t),before,'hunter reversal starts at contact');
  near(h.moveDuration,95*.4,'hunter native95ms speed');
  const again=t+h.moveDuration*.5,second=clone(w.smoothEntityPosition(h,again));
  w.reversePhysicalHunter(h,again);
  samePoint(w.smoothEntityPosition(h,again),second,'second hunter reversal cannot teleport');
  near(h.moveDuration,95*Math.hypot(h.x-second.x,h.y-second.y),'repeated partial reversal cannot accelerate');checks++;
  const blocked=moving(dir,.4),logical={x:blocked.p.x,y:blocked.p.y},actual=clone(w.smoothEntityPosition(blocked.p,blocked.t));
  w.isWall=()=>true;w.reversePhysicalHunter(blocked.p,blocked.t);
  samePoint(blocked.p,logical,'wall-blocked hunter keeps integer simulation coordinates');
  samePoint(w.smoothEntityPosition(blocked.p,blocked.t+250),actual,'wall-blocked hunter holds actual contact point');
  assert.ok(Number.isInteger(blocked.p.x)&&Number.isInteger(blocked.p.y));checks++;
}

// Cooperative contact holds are visual constraints, not overwritten grid cells.
for(const dir of directions){
  const w=world(),{p,t}=moving(dir),other={id:2,x:10,y:10,lives:3,dir:{x:0,y:1}};
  w.roster.push(p,other);const actual=clone(w.playerVisualPosition(p,t)),logical={x:p.x,y:p.y};
  w.holdPhysicalPlayer(p,other,t);w.releasePhysicalHolds(t+100);
  samePoint(w.playerVisualPosition(p,t+200),actual,'unrequested coop hold remains still');samePoint(p,logical,'hold leaves grid state intact');
  const requested={x:-dir.y,y:dir.x};w.heldKeyboardDirections=()=>[{dir:requested}];
  w.releasePhysicalHolds(t+200);
  assert.equal(p.physicalContactHold,undefined);samePoint(w.playerVisualPosition(p,t+200),actual,'safe requested release does not teleport');
  samePoint(p.nextDir,requested,'requested turn remains queued for original controller');checks++;
  const abandoned=moving(dir,.25);w.roster.length=0;w.roster.push(abandoned.p,other);
  const held=clone(w.playerVisualPosition(abandoned.p,abandoned.t));w.holdPhysicalPlayer(abandoned.p,other,abandoned.t);
  other.dead=true;w.heldKeyboardDirections=()=>[];w.releasePhysicalHolds(abandoned.t+50);
  assert.equal(abandoned.p.physicalContactHold,undefined);samePoint(w.playerVisualPosition(abandoned.p,abandoned.t+50),held,'dead partner releases from actual point');checks++;
}

// Actor producers include all analogous roles and forward the authoritative
// adapter pose, sprite direction and exact cached-frame breakpoints.
{
  const w=world(),p=moving(directions[0]).p,ai={...moving(directions[2]).p,isAI:true,id:3},dead={...p,dead:true};
  const snake={body:[{x:2,y:2},{x:1,y:2}],dir:directions[0]},hunter={...moving(directions[3]).p,motherAlive:true,paletteIndex:2};
  w.roster.push(p,ai,dead);w.snakes=[snake];w.hunters=[hunter];w.scorpion={x:5,y:5,dir:directions[0]};
  const actors=w.physicalContactActors();assert.deepEqual(Array.from(actors,a=>a.kind),['player','player','snake','hunter','scorpion']);
  for(const actor of actors){const out={};assert.equal(actor.shape(123,out),out);assert.ok(actor.breakpoints(120,130).every(Number.isFinite));actorChecks++;}
  const human=actors[0].shape(123,{}),robot=actors[1].shape(123,{}),enemy=actors[3].shape(123,{});
  assert.equal(human.options.bank,0);assert.equal(robot.options.bank,2);assert.equal(enemy.options.bank,3);
  samePoint(human.options.position,w.playerVisualPosition(p,123),'player authoritative visual point');
  samePoint(enemy.options.position,w.smoothEntityPosition(hunter,123),'hunter authoritative visual point');
  near(actors[0].surfaceSpeed(110,120),16/95,'native continuous translation bound');
  near(actors[0].surfaceSpeed(200,220),0,'completed move has no continuous translation');
  p.physicalContactHold={x:7,y:7};near(actors[0].surfaceSpeed(110,120),0,'held character is static');
  for(const actor of actors){assert.equal(actor.exactBreakpoints,true);assert.equal(actor.boundsCoversDiscontinuities,true);}
}

// Dispatch establishes the exact time/positions used by native sounds, deaths
// and scoring; finally always clears that override, including exceptions.
for(const kind of ['snake','hunter','scorpion','player']){
  const w=world(),{p,t}=moving(directions[0],.37),target={id:2,x:8,y:8,lives:3,dir:directions[2]};w.roster.push(p,target);
  let seen;
  const die=(...args)=>{seen={args,time:w.gameTimeNow(),position:clone(w.physicalEventContext.positions.get(p))};
    w.initializePlayerDeath(p);return {kind:'death',handled:true};};
  w.checkPhysicalSnakeContact=die;w.checkPhysicalHunterContact=die;w.checkPhysicalScorpionContact=die;w.checkPhysicalPlayerContact=die;
  const actual=clone(w.playerVisualPosition(p,t)),result=w.resolvePhysicalContact({entity:p,kind:'player'},{entity:target,kind},{time:t,partB:{index:1,role:'tail'}});
  assert.equal(result.kind,'death');near(seen.time,t,'native event clock uses TOI');samePoint(seen.position,actual,'event snapshots actual point');
  samePoint({x:p.deathX,y:p.deathY},actual,'death anchors actual pixels rather than committed future tile');near(p.deathStartedAt,t);
  near(p.respawnAt,t+700);assert.equal(p.lives,2);assert.equal(w.physicalEventContext,null);checks++;
}
// The straight scorpion is one exact native silhouette, so its semantic end
// must come from the contact point on its actual oriented spine, not its role.
for(const direction of directions)for(const rear of [false,true]){
  const w=world(),{p,t}=moving(directions[0]),target={x:9,y:9},center={x:144,y:144};
  let observed;
  w.roster.push(p);
  w.MazeBitersLive.scorpion.sample=(entity,time)=>{
    assert.equal(entity,target);near(time,t,'scorpion classification samples exact TOI');
    return {sample:offset=>({x:center.x+direction.x*offset,y:center.y+direction.y*offset})};
  };
  w.checkPhysicalScorpionContact=(entity,player,time,options)=>{observed=options;return {kind:'scorpion',handled:true};};
  const offset=(rear?-1:1)*w.TILE*.8;
  w.resolvePhysicalContact({entity:p,kind:'player'},{entity:target,kind:'scorpion'},
    {time:t,partB:{role:'scorpion'},pointB:{x:center.x+direction.x*offset,y:center.y+direction.y*offset}});
  assert.equal(observed.atTail,rear,'whole native silhouette preserves front/rear bite in every heading');checks++;
}
{
  const w=world(),{p,t}=moving(directions[0]),other=moving(directions[2]).p;w.roster.push(p,other);
  w.checkPhysicalPlayerContact=()=>({kind:'blocked',handled:true});
  const a=clone(w.playerVisualPosition(p,t)),b=clone(w.playerVisualPosition(other,t));
  const result=w.resolvePhysicalContact({entity:p,kind:'player'},{entity:other,kind:'player'},{time:t,partB:{role:'head'}});
  assert.equal(result.settled,true);samePoint(w.playerVisualPosition(p,t+500),a,'latched cooperative player stays put');
  samePoint(w.playerVisualPosition(other,t+500),b,'both cooperative participants hold at contact');checks++;
  w.checkPhysicalPlayerContact=()=>{throw Error('test dispatch failure');};
  assert.throws(()=>w.resolvePhysicalContact({entity:p,kind:'player'},{entity:other,kind:'player'},{time:t,partB:{}}),/test dispatch failure/);
  assert.equal(w.physicalEventContext,null,'exception never leaks a stale world clock');
}
for(const kind of ['hunter','snake']){
  const w=world(),{p,t}=moving(directions[0]),target=kind==='hunter'?moving(directions[2],.4).p:{body:[{x:8,y:7}],dir:directions[2]};
  w.roster.push(p);w.isWall=()=>true;
  w.checkPhysicalHunterContact=w.checkPhysicalSnakeContact=()=>({kind:'blocked',handled:true});
  const logical={x:target.x,y:target.y},actual=kind==='hunter'?clone(w.smoothEntityPosition(target,t)):null;
  const result=w.resolvePhysicalContact({entity:p,kind:'player'},{entity:target,kind},{time:t,partB:{index:0,role:'head'}});
  assert.equal(result.settled,true,'no-exit threat contact is explicitly latched rather than retried infinitely');
  if(kind==='hunter'){
    samePoint(target,logical,'blocked threat retains logical cells');samePoint(w.smoothEntityPosition(target,t+1000),actual,'latched threat stays held');
    w.hunters=[target];
    for(let tick=1;tick<=20;tick++){
      w.moveHunters(t+tick*95);
      assert.ok(target.physicalContactHold,'subsequent no-exit native ticks retain the hold');
      samePoint(target,logical,'no-exit tick retains logical grid coordinates');
      samePoint(w.smoothEntityPosition(target,t+tick*95+40),actual,'no-exit tick cannot resume gliding into the player');
    }
  }else assert.ok(w.events.some(event=>event.kind==='snake-hold'&&event.s===target&&event.t===t));
  checks++;
}
// A failed sweep stops once, rather than retrying an ever-growing time range.
// Its last committed mutation is authoritative, but never outside this frame.
for(const [committedTime,expectedClock] of [[undefined,100],[104,104],[90,100],[120,116]]){
  let attempts=0,callbacks=0,paused=false,pauses=0,resets=0,resetAt=null,reanchors=0,releases=0;
  const fault=Object.assign(new RangeError('test sweep budget'),{safeTime:102});
  if(committedTime!==undefined)fault.committedTime=committedTime;
  const w={physicalContactClock:100,physicalContactFault:null,
    physicalContactActive:()=>true,releasePhysicalHolds:()=>{releases++;},physicalContactActors:()=>[],resolvePhysicalContact:()=>{callbacks++;},
    setPaused:value=>{paused=value;pauses++;},CentralGameClock:{reset:t=>{resetAt=t;resets++;},reanchor:()=>{reanchors++;}},
    MazeBitersLive:{contacts:{step(from,to,actors,resolve){attempts++;if(committedTime!==undefined)resolve();throw fault;}}}};
  vm.createContext(w);vm.runInContext(extract('physicalContactStep'),w);
  assert.throws(()=>w.physicalContactStep(116),/test sweep budget/);
  assert.equal(w.physicalContactClock,expectedClock,'physics clock never rewinds behind an in-frame committed event');
  for(let t=117;t<1000;t++)w.physicalContactStep(t);
  assert.equal(attempts,1);assert.equal(paused,true);assert.equal(resetAt,expectedClock);assert.equal(w.physicalContactClock,expectedClock);
  assert.equal(callbacks,committedTime===undefined?0:1,'a committed resolver callback cannot replay after the fault');
  assert.equal(reanchors,1);assert.equal(resets,1);assert.equal(pauses,1);assert.equal(releases,1);
  assert.equal(w.physicalContactFault,fault);checks++;
}
console.log(`PASS physical bridge: ${checks} sub-cell response/death/hold cases, ${actorChecks} native actor producers; four headings, normal/powered speed, repeated hunter rebounds, maze no-exit, exact TOI and cooperative release.`);
