// Direction morph integration: visual notifications must not change the
// existing movement/contact controller. Baselines captured before this port.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire,registerHooks} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';

const root=process.env.MAZE_GAME_ROOT?pathToFileURL(process.env.MAZE_GAME_ROOT.replaceAll('\\','/')+'/'):new URL('../',import.meta.url);
const game=await readFile(new URL('src/engine/game.js',root),'utf8');
function functionSource(source,name){
  const start=source.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  assert.ok(start>=0,`Missing function ${name}`);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const candidate=source.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw Error(`Unterminated function ${name}`);
}
const hash=data=>createHash('sha256').update(data).digest('hex');
const preTurnMovementHashes={
  advancePlayer:'70777d8126b60451706a263ca7e52c40078454caf9f26ed8a20cd864cb88b51a',
  physicalContactRicochet:'05d0fb48f6c07d2132220461f547488eb6896ef917ce893b2785cdfc2f01dcc7',
};
const functions={};
for(const[name,expected]of Object.entries(preTurnMovementHashes)){
  const source=functionSource(game,name);
  // These are side-effect-free presentation notifications. Any other edit
  // to the controller fails the pre-port hash instead of being rebaselined.
  const hooks=source.split(/\r?\n/).filter(line=>line.includes('MazeBitersLive')&&line.includes('.mouth.turn'));
  assert.equal(hooks.length,1,`${name}: exactly one accepted-heading notification`);
  const baseline=source.replace(/^.*MazeBitersLive[^\r\n]*\.mouth\.turn[^\r\n]*\r?\n/gm,'');
  assert.equal(hash(baseline),expected,`${name}: only the visual notification may change`);
  functions[name]=source;
}
const dirs=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const plain=value=>JSON.parse(JSON.stringify(value));
let engineChecks=0;
function runAdvance(p,{blocked=false,paused=false,dead=false,notify=true}={}){
  p={...plain(p),dead};const calls=[],steps=[];
  const context={p,paused,gameOverStopsWorld:()=>false,reactionAssistRicochetStep:()=>null,
    keyboardNavigationStep:()=>null,isWall:(x,y)=>blocked&&x===p.x+p.nextDir.x&&y===p.y+p.nextDir.y,
    occupiedBySolidEgg:()=>false,playerContactBlocksMovement:()=>false,reactionAssistPlayerEligible:()=>false,
    commitPlayerVisualStep:(actor,x,y,time)=>{steps.push({x,y,time});actor.x=x;actor.y=y;},
    resolvePlayerContact(){},checkSnakeContact(){},checkWorldContact(){},
    MazeBitersLive:{mouth:{turn:(actor,from,to,time)=>{if(notify)calls.push({actor,from:plain(from),to:plain(to),time});}}},
  };
  vm.runInNewContext(`${functions.advancePlayer}\nadvancePlayer(p,1234);`,context);
  return {p:plain(p),calls,steps};
}
for(const from of dirs)for(const to of dirs){
  const actor={x:5,y:5,dir:from,nextDir:to,controllerTiltDegrees:17,waitingForInput:false};
  const actual=runAdvance(actor),control=runAdvance(actor,{notify:false});
  assert.deepEqual(actual.p,control.p,'visual notification never changes logical actor state');
  assert.deepEqual(actual.steps,control.steps,'visual notification never changes cell cadence');
  assert.deepEqual(actual.p.dir,to);assert.equal(actual.p.controllerTiltDegrees,17);
  assert.equal(actual.steps.length,1);assert.deepEqual(actual.steps[0],{x:5+to.x,y:5+to.y,time:1234});
  assert.equal(actual.calls.length,1);assert.deepEqual(actual.calls[0].from,from);assert.deepEqual(actual.calls[0].to,to);assert.equal(actual.calls[0].time,1234);
  engineChecks++;
  if(from.x!==to.x||from.y!==to.y){
    const blocked=runAdvance(actor,{blocked:true});
    assert.deepEqual(blocked.p.dir,from,'blocked request does not rotate the logical character');
    for(const call of blocked.calls)assert.deepEqual(call.from,call.to,'blocked request cannot announce an unaccepted direction');
    engineChecks++;
  }
  for(const reason of ['paused','dead']){
    const stopped=runAdvance(actor,{[reason]:true});
    assert.equal(stopped.calls.length,0);assert.equal(stopped.steps.length,0);engineChecks++;
  }
}
for(const from of dirs)for(const allowed of [false,true]){
  const p={x:5,y:5,dir:{...from},nextDir:{...from},controllerTiltDegrees:-12,physicalContactHold:{at:0}};
  const before=plain(p),position={x:5+from.x*.35,y:5+from.y*.35},calls=[];
  const context={p,from,position,result:null,playerVisualPosition:()=>position,reactionAssistTunnelCellIsOpen:()=>allowed,
    playerMoveDelay:()=>95,beginReactionAssistRicochet(){},
    MazeBitersLive:{mouth:{turn:(entity,a,b,time)=>calls.push({entity,from:plain(a),to:plain(b),time})}},
  };
  vm.runInNewContext(`${functions.physicalContactRicochet}\nresult=physicalContactRicochet(p,from,1234);`,context);
  assert.equal(context.result,allowed);
  if(!allowed){assert.deepEqual(plain(p),before);assert.equal(calls.length,0);}
  else{
    const reversed=plain({x:-from.x,y:-from.y});
    assert.equal(calls.length,1);assert.deepEqual(calls[0].from,from);assert.deepEqual(calls[0].to,reversed);assert.equal(calls[0].time,1234);
    assert.equal(p.moveStartedAt,1234);assert.equal(p.moveFromX,position.x);assert.equal(p.moveFromY,position.y);
    assert.equal(p.controllerTiltDegrees,-12);assert.deepEqual(plain(p.dir),reversed);
    assert.ok(Math.abs(p.moveDuration-95*.35)<1e-7,'fractional-contact retreat duration stays unchanged');
  }
  engineChecks++;
}
console.log(`PASS Fantasy turn engine hooks: ${engineChecks} heading/movement/block/ricochet checks; both controller functions retain their pre-port bodies except one presentation notification.`);

// Headless integration tests replace ONLY the optional WebGL renderer. The
// real production clock, mouth/eye composition, contact masks, cache ownership
// and service wrapper are exercised. GPU intermediate-pixel acceptance is a
// separate browser check; this recording adapter does not claim to test it.
const require=createRequire(import.meta.url);let native;
for(const location of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{native=require(location);break;}catch{}
}
if(!native)throw Error('Native Canvas required (or set CODEX_CANVAS_PACKAGE)');
const {createCanvas,loadImage}=native;
const owned=[],renderers=[],drawCalls=[],maskCalls=[];
let pauseNextWarm=false,holdWarm=false,warmReached=null,resumeWarm=null,failNextRenderer=false,loseNextDraw=false;
const fixture={create(options){
  if(failNextRenderer){failNextRenderer=false;throw Error('Injected optional GPU unavailability');}
  const r={options,disposed:false,warm(){
    if(pauseNextWarm){pauseNextWarm=false;holdWarm=true;warmReached?.();}
  },draw(ctx,variant,pose,closure,blink,x,y,size){
    if(loseNextDraw){loseNextDraw=false;throw Error('Injected optional GPU context loss');}
    assert.equal(r.disposed,false);drawCalls.push({variant,pose:plain(pose),closure,blink,size});
    options.drawPose(ctx,variant,pose.from,closure,blink,0,0,size);
  },drawMask(ctx,variant,pose,closure,x,y,size){
    assert.equal(r.disposed,false);maskCalls.push({variant,pose:plain(pose),closure,size});
    options.drawMaskPose(ctx,variant,pose.from,closure,x,y,size);
  },diagnostics(){return {testRenderer:true};},dispose(){r.disposed=true;}};
  renderers.push(r);return r;
}};
globalThis.__fantasyTurnRendererFixture=fixture;
const rendererModule='data:text/javascript,'+encodeURIComponent('export const createTurnRenderer=options=>globalThis.__fantasyTurnRendererFixture.create(options);');
const loader=registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.includes('/src/render/fantasy-player-turn.js')&&specifier.startsWith('./fantasy-turn/renderer.js'))
    return {url:rendererModule,shortCircuit:true};
  return next(specifier,context);
}});
function makeCanvas(width,height){
  const c=createCanvas(width,height),listeners=new Map();
  c.addEventListener=(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);};
  c.fire=name=>{for(const fn of listeners.get(name)||[])fn({type:name,target:c});};
  owned.push(c);return c;
}
const yieldTask=async()=>{if(holdWarm){holdWarm=false;await new Promise(resolve=>{resumeWarm=resolve;});}};
const {loadFantasyPlayerArt,drawFantasySource,composeFantasyPose}=await import(new URL('src/render/fantasy-player-art.js',root));
const {createLiveMouthService}=await import(new URL('src/render/live-mouth.js',root));
const packs={};
for(const profile of ['hd','4k'])packs[profile]=await loadFantasyPlayerArt(profile,{makeCanvas,
  fetchJSON:async url=>JSON.parse(await readFile(url,'utf8')),loadImage:async url=>loadImage(fileURLToPath(url))});
const groupsFor=pack=>({player:pack.groups,fantasyPlayerArtBytes:pack.decodedBytes});
const service=createLiveMouthService({makeCanvas,yieldTask,tile:16,
  readSprite:source=>{const s=source.naturalWidth,c=createCanvas(s,s);drawFantasySource(c.getContext('2d'),source,0,0,s);return c.getContext('2d').getImageData(0,0,s,s);},
  drawSource:drawFantasySource});
const names=['right','down','left','up'],numbers=[2,3,4,1];
const optionsFor=(pack,palette,direction,light='normal')=>{
  const bank=names.indexOf(direction),n=numbers[bank],poses=pack.groups[palette][light];
  return {open:poses[`Head${n}`],closed:poses[`Head${n}${n===1?'':'Close'}`],bank};
};
const actor=dir=>Object.freeze({x:4,y:3,dir:Object.freeze({...dir}),controllerTiltDegrees:17,
  moveFromX:3,moveFromY:3,moveToX:4,moveToY:3,moveStartedAt:1900,moveDuration:95});
let integrationChecks=0;
for(const profile of ['hd','4k']){
  const pack=packs[profile],size=pack.size;
  assert.equal(await service.prepare(groupsFor(pack)),true);assert.equal(service.stats.turn.ready,true);
  assert.equal(service.stats.turn.durationMs,90);assert.equal(service.stats.turn.halfTurnMs,90);
  for(const palette of ['p1','p2','ai'])for(let from=0;from<4;from++)for(let to=0;to<4;to++)if(from!==to){
    service.reset();const a=actor(dirs[to]),before=plain(a),opts=optionsFor(pack,palette,names[to]);
    service.sprite(a,1000,opts);service.bite(a,1920,95,1880);service.sprite(a,1900,opts);
    service.turn(a,dirs[from],dirs[to],1920);
    const visual=service.sprite(a,1950,opts),bare=service.sprite(a,1950,{...opts,animateBlink:false});
    const live=visual.__liveMouth,pose=live.turnPose;
    assert.ok(pose&&!pose.done,'visual descriptor carries a live morph');
    assert.equal(live.set,bare.__liveMouth.set);assert.equal(live.index,bare.__liveMouth.index,'turn keeps the real bite frame');
    assert.ok(live.blink>0,'turn overlaps the existing independent eyelid clock');
    const g1=service.geometry(a,1950,{...opts,descriptor:visual},{}),g2=service.geometry(a,1950,{...opts,descriptor:bare},{});
    assert.deepEqual(g1,g2,'visual direction morph never changes native collision geometry');
    service.geometry(a,90000,opts,{});service.geometry(a,1,opts,{});
    const repeated=service.sprite(a,1950,opts);
    assert.deepEqual(repeated.__liveMouth.turnPose,pose,'speculative collision probes cannot consume or shift a visual turn');
    assert.equal(repeated.__liveMouth.blink,live.blink,'speculative probes cannot shift blinking');
    const canvas=createCanvas(size,size),ctx=canvas.getContext('2d');
    assert.equal(service.draw(ctx,repeated,0,0,size),true);
    const call=drawCalls.at(-1);assert.equal(call.variant,`${palette}:normal`);assert.equal(call.closure,live.index/48);assert.equal(call.blink,live.blink/24);assert.equal(call.size,size);
    const expected=createCanvas(size,size);composeFantasyPose(expected.getContext('2d'),pack.sets[`${palette}:normal:${pose.from}`],live.index,live.blink);
    assert.deepEqual(ctx.getImageData(0,0,size,size).data,expected.getContext('2d').getImageData(0,0,size,size).data,'turn source adapter uses the exact native complete mouth/eye pose');
    assert.equal(service.drawLeader(ctx,repeated,0,0,size),true,'leader effect follows the whole current turn surface');
    ctx.clearRect(0,0,size,size);
    assert.equal(service.drawIntakeMask(ctx,repeated,0,0,size),true);assert.equal(maskCalls.at(-1).size,size);
    const maskExpected=createCanvas(size,size),cardinalMask=service.sprite(a,1950,{...optionsFor(pack,palette,pose.from),animateBlink:false});
    service.drawIntakeMask(maskExpected.getContext('2d'),cardinalMask,0,0,size);
    assert.deepEqual(ctx.getImageData(0,0,size,size).data,maskExpected.getContext('2d').getImageData(0,0,size,size).data,'turn intake adapter uses the active native anatomical mask without a second visual-clock sample');
    const bright=service.sprite(a,1950,optionsFor(pack,palette,names[to],'bright'));
    assert.deepEqual(bright.__liveMouth.turnPose,pose,'normal/bright passes share the same clock');
    service.draw(ctx,bright,0,0,size);assert.equal(drawCalls.at(-1).variant,`${palette}:bright`);
    assert.equal(service.sprite(a,2010,opts).__liveMouth.turnPose,undefined,'all accepted turns, including 180 degrees, finish in 90 game ms');
    assert.deepEqual(plain(a),before,'turn drawing cannot mutate movement, direction, axis tilt or actor fields');
    service.resetTurn(a);assert.equal(service.sprite(a,1950,opts).__liveMouth.turnPose,undefined,'turn-only reset removes visual history');
    integrationChecks++;
  }
}

// Replacement while native turn warming is yielded: the older pending
// renderer must never publish itself or draw masks from the wrong profile.
service.reset();
const reached=new Promise(resolve=>{warmReached=resolve;});pauseNextWarm=true;
const superseded=service.prepare(groupsFor(packs.hd));await reached;
const obsoleteRenderer=renderers.at(-1);
assert.equal(await service.prepare(groupsFor(packs['4k'])),true);
resumeWarm();assert.equal(await superseded,false);assert.equal(obsoleteRenderer.disposed,true);
assert.equal(service.ready,true);assert.equal(service.stats.turn.ready,true);
const a=actor(dirs[1]),opts=optionsFor(packs['4k'],'p1','down');service.turn(a,dirs[0],dirs[1],0);
const current=service.sprite(a,45,opts);assert.equal(current.naturalWidth,160);
const ctx=createCanvas(160,160).getContext('2d');assert.equal(service.drawIntakeMask(ctx,current,0,0,160),true);
assert.equal(maskCalls.at(-1).size,160,'replacement turn masks use only the active native profile');
const replacementMask=createCanvas(160,160),replacementNative=service.sprite(a,45,{...optionsFor(packs['4k'],'p1',current.__liveMouth.turnPose.from),animateBlink:false});
service.drawIntakeMask(replacementMask.getContext('2d'),replacementNative,0,0,160);
assert.deepEqual(ctx.getImageData(0,0,160,160).data,replacementMask.getContext('2d').getImageData(0,0,160,160).data,'superseded preparation cannot attach the old HD mask to the active 4K renderer');

// Optional GPU failure is local to turning, never a render-recovery screen,
// missing mouth/eyes, failed contact service or broken cache generation.
ctx.clearRect(0,0,160,160);loseNextDraw=true;assert.equal(service.draw(ctx,current,0,0,160),true,'lost GPU falls back to the existing native mouth draw');
assert.equal(service.ready,true);assert.equal(service.stats.turn.ready,false);assert.match(service.stats.turn.error,/context loss/);
const expected=createCanvas(160,160);composeFantasyPose(expected.getContext('2d'),current.__liveMouth.set.art,current.__liveMouth.index,current.__liveMouth.blink||0);
assert.deepEqual(ctx.getImageData(0,0,160,160).data,expected.getContext('2d').getImageData(0,0,160,160).data);
failNextRenderer=true;assert.equal(await service.prepare(groupsFor(packs.hd)),true,'unsupported optional WebGL does not reject the mouth generation');
assert.equal(service.ready,true);assert.equal(service.stats.turn.ready,false);assert.match(service.stats.turn.error,/GPU unavailability/);
service.dispose();assert.equal(service.ready,false);assert.equal(service.stats.turn.ready,false);
assert.ok(renderers.every(r=>r.disposed),'replacement, failure and final disposal release every optional renderer');
assert.ok(owned.every(c=>c.width===1&&c.height===1),'all service-owned native and optional composition/outline surfaces are released');
loader.deregister();delete globalThis.__fantasyTurnRendererFixture;
console.log(`PASS Fantasy turn service integration: ${integrationChecks} HD/4K all-palette/all-direction overlaps with bite, blink, leader and intake; native source pixels, collision-clock isolation, 90ms reversals, overlapping quality preparation and optional GPU failure fallback.`);
