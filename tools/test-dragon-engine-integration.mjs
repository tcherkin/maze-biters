// Dragon Kin presentation hooks. The baseline was copied before editing
// game.js; removing exactly the new hooks/palette choice must recover it.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {removeGpuPresentation} from './gpu-presentation-contract.mjs';

const root=process.env.MAZE_GAME_ROOT?pathToFileURL(process.env.MAZE_GAME_ROOT.replaceAll('\\','/')+'/'):new URL('../',import.meta.url);
const baselineURL=process.env.DRAGON_ENGINE_BASELINE?pathToFileURL(process.env.DRAGON_ENGINE_BASELINE):
  new URL('../../../2026-08-24/maze-biters-work-chat-crash-git/outputs/dragon-kin-before/game.js',root);
const [game,baseline]=await Promise.all([readFile(new URL('src/engine/game.js',root),'utf8'),readFile(baselineURL,'utf8')]);
const hash=text=>createHash('sha256').update(text).digest('hex');
assert.equal(hash(baseline),'21ea955858b77040acea78c0d0918edc2e7745a8929782f23fb7fa889efb7791','baseline must be the copy captured before the Dragon Kin integration');
let restored=game.includes('const nativeFrameContext=ctx;')?removeGpuPresentation(game):game;
// New creature-neon integration is strictly presentation-only. Recover only
// its reviewed two call sites, additive hunter eye callback and private helper;
// never recapture the independently pinned pre-Dragon gameplay baseline.
const neonNewline=restored.includes('\r\n')?'\r\n':'\n';
const neonExact=text=>text.replaceAll('\n',neonNewline);
function removeNeonExact(text){
  const exact=neonExact(text);assert.equal(restored.split(exact).length-1,1,'one approved creature-neon block');
  restored=restored.replace(exact,'');
}
// Pickups add only opt-in presentation. Their native alpha, sprite selection,
// clocks, collection and hatching remain protected by the original full-file
// pin after these six exact substitutions and the explicit helper/flag removal.
removeNeonExact(`    pickupsEnabled:!(['127.0.0.1','localhost','::1'].includes(location.hostname)&&
      new URLSearchParams(location.search).get('pickupNeon')==='off'),
`);
removeNeonExact(`  function drawNeonPickup(sprite,entity,kind,index=0){
    const region=sprite?.__atlasRegion;
    const source=region?RenderAtlases[region[0]]:sprite;
    if(!spriteReady(sprite))return false;
    const rect=region?[region[1],region[2],region[3]??16,region[4]??16]
      :[0,0,source.naturalWidth,source.naturalHeight];
    return SnakeNeon?.drawPickup(entity,{kind,index,source,rect,
      x:entity.x*TILE,y:entity.y*TILE,opacity:ctx.globalAlpha})||false;
  }

`);
for(const [currentText,originalText] of [
  ['function drawFruit(f,now=gameTimeNow(),{neon=false}={})','function drawFruit(f,now=gameTimeNow())'],
  ['function drawEgg(e,t,{neon=false}={})','function drawEgg(e,t)'],
  ["if(!(neon&&drawNeonPickup(sprite,f,'fruit',index-1))&&!drawOriginalSprite(sprite,f.x,f.y)){",'if(!drawOriginalSprite(sprite,f.x,f.y)){'],
  ["if(!(neon&&drawNeonPickup(sprite,e,'egg'))&&!drawOriginalSprite(sprite,e.x,e.y)){",'if(!drawOriginalSprite(sprite,e.x,e.y)){'],
  ['drawEgg(egg,gameNow,{neon:true});','drawEgg(egg,gameNow);'],
  ['drawFruit(fruit,gameNow,{neon:true});','drawFruit(fruit,gameNow);'],
]){
  assert.equal(restored.split(currentText).length-1,1,'only one exact approved pickup opt-in');
  restored=restored.replace(currentText,originalText);
}
removeNeonExact(`    // Local A/B instrumentation only; published gameplay always uses the
    // approved creature lights. No entity or simulation flag is changed.
    creaturesEnabled:!(['127.0.0.1','localhost','::1'].includes(location.hostname)&&
      new URLSearchParams(location.search).get('creatureNeon')==='off'),
`);
removeNeonExact('  const neonCreatureRecords=new WeakMap();\n');
const neonHelper=functionSource(restored,'drawNeonCreature');
const scorpionReadyGate='record.pose=live?.scorpion.stats.ready?live.scorpion.sample(entity,t):null;';
assert.equal(neonHelper.split(scorpionReadyGate).length-1,1,'gate scorpion light pose on its existing art readiness');
assert.equal(hash(neonHelper.replace(scorpionReadyGate,'record.pose=live?.scorpion.sample(entity,t)||null;').replaceAll('\r\n','\n')),'da4bd06708cf3cd76f84d4a28e13e360d8d0e9e5bc5147f2830b93abd1133c72','reviewed creature-only presentation helper with only the explicit native-ready gate');
removeNeonExact('  '+neonHelper.replaceAll('\r\n','\n')+'\n');
removeNeonExact(`    drawScorpionGhost(context,{entity,pose,target,drawNative}){
      const r=(TILE*2+1)*target.scale;
      return SnakeNeon?.drawCreature(entity,{kind:'scorpion',glints:false,
        bounds:{minX:target.x-r,minY:target.y-r,maxX:target.x+r,maxY:target.y+r},
        scale:activeDisplayQuality==='4K'?10:5,draw:drawNative
      })||false;
    },
`);
removeNeonExact(`    // A shrinking scorpion emits after earlier actors, then the consuming
    // player's complete silhouette must cover it (not only the ghost crop).
    SnakeNeon?.setForegroundBounds?.(neonPlayerForegroundBounds(roster,gameNow));
    ctx=SnakeNeon?.actorsContext()||worldContext;
`);
const eyeOptions='function drawHunter(h,now=gameTimeNow(),{forceVisible=false,onNeonEyes=null}={})';
assert.equal(restored.split(eyeOptions).length-1,1);
restored=restored.replace(eyeOptions,'function drawHunter(h,now=gameTimeNow(),{forceVisible=false}={})');
removeNeonExact(`    if(drawn&&liveMouth&&onNeonEyes)onNeonEyes(eyeContext=>{
      eyeContext.save();
      try{
        if(rotated){
          const x=(visual.x+.5)*TILE,y=(visual.y+.5)*TILE;
          eyeContext.translate(x,y);eyeContext.rotate(tiltDegrees*Math.PI/180);eyeContext.translate(-x,-y);
        }
        return globalThis.MazeBitersLive?.mouth.drawEyeMask?.(
          eyeContext,liveMouth,visual.x*TILE,visual.y*TILE,TILE,TILE
        )||false;
      }finally{eyeContext.restore();}
    });
`);
for(const [next,previous] of [
  ["    drawNeonCreature(scorpion,'scorpion',gameNow);",'    drawScorpion(gameNow);'],
  ["    for(let i=0;i<hunters.length;i++) drawNeonCreature(hunters[i],'hunter',gameNow);",'    for(let i=0;i<hunters.length;i++) drawHunter(hunters[i],gameNow);']
]){assert.equal(restored.split(next).length-1,1);restored=restored.replace(next,previous);}
// This single approved preparation option follows the pre-existing physics
// gate. It never changes the gate, native contacts, or any handler itself.
const contactPreparationOption='    prepareCharacterContacts:EXPERIMENTAL_PHYSICAL_CONTACTS,';
assert.equal(restored.split(contactPreparationOption).length-1,1,'exactly one existing-gate preparation option');
assert.equal(baseline.includes(contactPreparationOption),false,'the independently pinned baseline predates this option');
restored=restored.replace(contactPreparationOption+(restored.includes('\r\n')?'\r\n':'\n'),'');
const newHook=/^\s*globalThis\.MazeBitersLive\?\.mouth\.turn\?\.\(h,\{x:-(?:d|reverse)\.x,y:-(?:d|reverse)\.y\},h\.dir,t\);\r?\n/gm;
assert.equal([...restored.matchAll(newHook)].length,3,'one physical reversal and two logical-heading outcomes');
restored=restored.replace(newHook,'');
const tutorialHook='        globalThis.MazeBitersLive?.mouth.turn?.(p,p.dir,direction,t);';
assert.equal(restored.split(tutorialHook).length-1,1);
restored=restored.replace(tutorialHook,'        if(!hunter)globalThis.MazeBitersLive?.mouth.turn?.(p,p.dir,direction,t);');
const palette="color:'#ff9b55',paletteIndex:1,motherAlive:true,removed:true";
assert.equal(restored.split(palette).length-1,1);
restored=restored.replace(palette,"color:'#ff9b55',paletteIndex:0,motherAlive:true,removed:true");
const approvedPaletteBlock=`// Keep the original palette identities, but hatch only the three approved
// distinct Dragon Kin colors. Round-robin balance consumes no gameplay RNG.
const ENEMY_HUNTER_PALETTE_INDICES=Object.freeze([1,3,4]);
let hunterColorIndex=0;
function nextEnemyHunterPaletteIndex(){
  const index=ENEMY_HUNTER_PALETTE_INDICES[
    hunterColorIndex%ENEMY_HUNTER_PALETTE_INDICES.length];
  hunterColorIndex++;
  return index;
}`;
const originalPaletteBlock=`// Atlas row 0 mirrors player 1. Enemy births intentionally start on row 1
// and cycle only through the five dedicated hunter skins.
const FIRST_ENEMY_HUNTER_PALETTE_INDEX=1;
const ENEMY_HUNTER_PALETTE_COUNT=
  HUNTER_PALETTE.length-FIRST_ENEMY_HUNTER_PALETTE_INDEX;
let hunterColorIndex=0;
function nextEnemyHunterPaletteIndex(){
  const index=FIRST_ENEMY_HUNTER_PALETTE_INDEX+
    (hunterColorIndex%ENEMY_HUNTER_PALETTE_COUNT);
  hunterColorIndex++;
  return index;
}`;
const newline=restored.includes('\r\n')?'\r\n':'\n',approvedExact=approvedPaletteBlock.replaceAll('\n',newline);
assert.equal(restored.split(approvedExact).length-1,1,'birth selection may only use the exact approved1/3/4 round-robin lookup');
restored=restored.replace(approvedExact,originalPaletteBlock.replaceAll('\n',newline));
// Only the two hunter artwork selectors change with the normal-only request.
// Keep the original baseline pinned and recover these exact approved edits.
for(const [currentText,originalText] of [
  ["?.[actor.paletteIndex??Math.max(0,HUNTER_PALETTE.indexOf(actor.color))]?.normal",
    "?.[actor.paletteIndex??Math.max(0,HUNTER_PALETTE.indexOf(actor.color))]?.[actor.motherAlive?'normal':'rage']"],
  ["    const mood='normal';","    const mood=h.motherAlive?'normal':'rage';"],
  ['    // Enemies retain their approved normal palette regardless of AI state, so every',
    '    // Palette identity and rage brightness are precompiled, so every'],
]){
  assert.equal(restored.split(currentText).length-1,1,'only the explicitly approved hunter presentation selector changes');
  restored=restored.replace(currentText,originalText);
}
// A release may change these two exact cache-buster values, never executable
// logic or arbitrary numbers. The original baseline remains independently pinned.
const releaseNeutral=source=>source
  .replace(/(\?v=)1\.02\.(?:14\.01|15\.00|15\.01|15\.02|15\.03|16\.00|16\.01|16\.02|17\.00|17\.01|17\.02)(?=['"&])/g,'$1<approved-release>')
  .replace(/^\/\/ Maze Biters v1\.02\.(?:14\.01|15\.00|15\.01|15\.02|15\.03|16\.00|16\.01|16\.02|17\.00|17\.01|17\.02)(?=\r?\n)/,'// Maze Biters v<approved-release>')
  .replace(/(heading\.textContent='Render diagnostics · v)1\.02\.(?:14\.01|15\.00|15\.01|15\.02|15\.03|16\.00|16\.01|16\.02|17\.00|17\.01|17\.02)(?=';)/,'$1<approved-release>');
assert.equal(releaseNeutral(restored),releaseNeutral(baseline),'all movement, contact, scoring, protagonist, draw and AI code must remain byte-identical apart from approved cache-busters');
function functionSource(source,name){
  const start=source.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));assert.ok(start>=0,`Missing ${name}`);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const candidate=source.slice(start,end+1);try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw Error(`Unterminated ${name}`);
}
const current={},original={};
for(const name of ['moveHunters','reversePhysicalHunter','addTutorialWalk']){
  current[name]=functionSource(game,name);original[name]=functionSource(baseline,name);
}
const dirs=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const plain=value=>JSON.parse(JSON.stringify(value));
let normalChecks=0;
for(const paletteIndex of [1,3,4])for(const motherAlive of [true,false])for(const dir of dirs)for(const fallback of [false,true]){
  const numbers=[2,3,4,1],number=numbers[dirs.indexOf(dir)],normal={},rage={},original={};
  for(const close of [false,true]){
    const name=`EnemyHead${number}${close&&number!==1?'Close':''}`;
    normal[name]={__hvSpriteName:name,presentation:fallback?'legacy-normal':'dragon-normal'};
    rage[name]={__hvSpriteName:name,presentation:'forbidden-rage'};
    original[name]={__hvSpriteName:name,presentation:'original'};
  }
  const entity={x:4,y:3,dir:{...dir},paletteIndex,motherAlive,mouthOpen:false},drawn=[],spriteOptions=[],geometryOptions=[];
  const context={entity,CharacterSpriteGroups:{hunter:{[paletteIndex]:{normal,rage}}},HUNTER_PALETTE:[],TILE:16,
    smoothEntityPosition:actor=>({x:actor.x,y:actor.y}),gameplaySpriteVisible:()=>true,
    directionNumber:()=>number,originalCharacterSprite:(_prefix,_direction,open)=>original[`EnemyHead${number}${!open&&number!==1?'Close':''}`],
    drawOriginalSprite:source=>{drawn.push(source);return true;},
    MazeBitersLive:{mouth:{sprite:(_actor,_time,options)=>{spriteOptions.push(options);return null;},
      geometry:(_actor,_time,options)=>{geometryOptions.push(options);return options;}}},
  };
  vm.runInNewContext(`${functionSource(game,'drawHunter')}\n${functionSource(game,'physicalCharacterGeometry')}\ndrawHunter(entity,1000);physicalCharacterGeometry(entity,1000,true);`,context);
  assert.equal(drawn[0],normal[`EnemyHead${number}${number!==1?'Close':''}`]);
  for(const options of [...spriteOptions,...geometryOptions]){
    assert.equal(options.open,normal[`EnemyHead${number}`]);
    assert.equal(options.closed,normal[`EnemyHead${number}${number!==1?'Close':''}`]);
  }
  assert.equal(entity.motherAlive,motherAlive,'normal-only artwork cannot alter aggression/AI state');normalChecks++;
}
let moveChecks=0,reverseChecks=0,tutorialChecks=0;
const selectorSource=source=>source.slice(source.indexOf('const HUNTER_PALETTE='),source.indexOf('const SNAKE_STARTS='));
let paletteChecks=0;
for(const start of [0,1,2,3,4,5,99,1000,1000000]){
  const context={start,values:[],Math:{random(){throw Error('Palette selection consumed gameplay randomness');}}};
  vm.runInNewContext(`${selectorSource(game)}\nhunterColorIndex=start;for(let i=0;i<300;i++)values.push(nextEnemyHunterPaletteIndex());`,context);
  assert.equal(context.values.length,300);
  const counts={1:0,3:0,4:0};
  for(let i=0;i<context.values.length;i++){assert.equal(context.values[i],[1,3,4][(start+i)%3]);counts[context.values[i]]++;paletteChecks++;}
  assert.deepEqual(counts,{1:100,3:100,4:100},'the three distinct enemies have exactly uniform birth counts');
}
function runBirths(source){
  let randomCalls=0;const hunters=[],sounds=[];
  const context={hunters,eggs:Array.from({length:12},(_,i)=>({x:i+2,y:5,bornAt:0})),eggObstacleRevision:0,
    dirs:plain(dirs),HUNTER_SLIDE_RATIO:1,isEggCovered:()=>false,hunterMoveDelay:()=>190,
    playSound:(name,entity)=>sounds.push({name,x:entity.x,y:entity.y}),performance:{now:()=>4321},
    Math:{random:()=>{const value=(randomCalls%4+.25)/4;randomCalls++;return value;}}};
  vm.runInNewContext(`${selectorSource(source)}\n${functionSource(source,'updateEggs')}\nupdateEggs(13000);`,context);
  return {hunters:plain(hunters),sounds,randomCalls,eggCount:context.eggs.length,revision:context.eggObstacleRevision};
}
const births=runBirths(game),oldBirths=runBirths(baseline);
assert.equal(births.randomCalls,12);assert.equal(births.randomCalls,oldBirths.randomCalls,'births retain one and only one gameplay random draw each');
assert.equal(births.eggCount,0);assert.equal(births.revision,oldBirths.revision);assert.deepEqual(births.sounds,oldBirths.sounds);
for(let i=0;i<births.hunters.length;i++){
  const {color,paletteIndex,...actual}=births.hunters[i],{color:oldColor,paletteIndex:oldPalette,...expected}=oldBirths.hunters[i];
  assert.deepEqual(actual,expected,'palette reduction cannot change AI initialization, orientation, movement cadence or other hatch state');
  assert.equal(paletteIndex,[1,3,4][i%3]);assert.equal(color,({1:'#62d6ff',3:'#ffe066',4:'#9b7bff'})[paletteIndex]);paletteChecks++;
}
function runMovement(source,from,mask,held,mode,{due=true,threatHold=false,physicalHold=false}={}){
  const h={x:8,y:7,dir:{...from},lastMove:due?800:990,mouthOpen:true,lastMouthAt:0,
    reactionAssistMoveDir:held?{...held}:null,controllerTiltDegrees:12,paletteIndex:1};
  if(physicalHold)h.physicalContactHold={x:7.8,y:7,at:900};
  const calls=[],effects=[],decisions=[],victim={id:1,dead:false};
  const context={hunters:[h],dirs:plain(dirs),hunterMoveDelay:()=>95,HUNTER_SLIDE_RATIO:1,PLAYER_MOUTH_TOGGLE_GAME_MS:60,
    advanceBinaryRhythm:(actor,time,clock,state)=>{actor[clock]=time;actor[state]=!actor[state];},
    reactionAssistThreatHoldIsActive:()=>threatHold,
    isWall:(x,y)=>{const n=dirs.findIndex(d=>d.x===x-8&&d.y===y-7);return n>=0?!(mask&(1<<n)):false;},
    occupiedBySnake:()=>false,occupiedByScorpion:()=>false,occupiedByHunter:()=>false,
    occupiedBySolidEgg:()=>false,playerRepelsInhabitant:()=>false,
    hunterBrainProfile:()=>({preserved:true}),
    MazeBrain:{choose:(actor,origin,options,profile,time)=>{decisions.push({origin:plain(origin),options:plain(options),profile,time});return options.at(-1);}},
    playerAt:(x,y)=>mode!=='none'&&(x!==8||y!==7)?victim:null,
    reactionAssistThreatEntryYields:()=>mode==='yield',physicalContactActive:()=>mode==='physical',
    spawnShieldIsBlocking:()=>mode==='shield',isPowerMode:()=>mode==='power',
    loseLife:p=>{p.dead=true;effects.push('death');},
    MazeBitersLive:{mouth:{turn:(actor,a,b,time)=>calls.push({actor,from:plain(a),to:plain(b),time})},
      characterBite:(actor,time,duration)=>effects.push({time,duration})},
  };
  vm.runInNewContext(`${source}\nmoveHunters(1000);`,context);
  return {h:plain(h),victim:plain(victim),calls,effects,decisions};
}
for(const from of dirs)for(let mask=0;mask<16;mask++)for(const held of [null,...dirs])for(const mode of ['none','shield','power','kill','yield','physical']){
  const a=runMovement(current.moveHunters,from,mask,held,mode),b=runMovement(original.moveHunters,from,mask,held,mode);
  assert.deepEqual({h:a.h,victim:a.victim,effects:a.effects,decisions:a.decisions},{h:b.h,victim:b.victim,effects:b.effects,decisions:b.decisions},`movement decisions changed: ${JSON.stringify({from,mask,held,mode})}`);
  assert.equal(a.calls.length,1,'every processed heading is notified once, including held-entry heading commits');
  assert.deepEqual(a.calls[0].from,from);assert.deepEqual(a.calls[0].to,a.h.dir);assert.equal(a.calls[0].time,1000);
  moveChecks++;
}
for(const from of dirs)for(const mode of [{due:false},{threatHold:true},{physicalHold:true}]){
  const mask=mode.physicalHold?0:15;
  const a=runMovement(current.moveHunters,from,mask,null,'none',mode),b=runMovement(original.moveHunters,from,mask,null,'none',mode);
  assert.deepEqual(a.h,b.h);assert.deepEqual(a.effects,b.effects);assert.equal(a.calls.length,0,'not-due/held actors cannot manufacture a turn');moveChecks++;
}
function runReverse(source,from,fraction,blocked){
  const h={x:8,y:7,dir:{...from},controllerTiltDegrees:-14,physicalContactHold:{x:8,y:7}};
  const position={x:8+from.x*fraction,y:7+from.y*fraction},calls=[];
  const context={h,smoothEntityPosition:()=>position,hunterMoveDelay:()=>95,HUNTER_SLIDE_RATIO:1,isWall:()=>blocked,
    MazeBitersLive:{mouth:{turn:(actor,a,b,time)=>calls.push({from:plain(a),to:plain(b),time})}}};
  vm.runInNewContext(`${source}\nreversePhysicalHunter(h,1234);`,context);
  return {h:plain(h),calls};
}
for(const from of dirs)for(const fraction of [0,.01,.35,.99])for(const blocked of [false,true]){
  const a=runReverse(current.reversePhysicalHunter,from,fraction,blocked),b=runReverse(original.reversePhysicalHunter,from,fraction,blocked);
  assert.deepEqual(a.h,b.h,'physical-contact reversal must retain its exact sub-cell route and timing');
  assert.equal(a.calls.length,blocked?0:1);
  if(!blocked){assert.deepEqual(a.calls[0].from,from);assert.deepEqual(a.calls[0].to,a.h.dir);assert.equal(a.calls[0].time,1234);}
  reverseChecks++;
}
function runTutorial(source,hunter,stop){
  const path=[[0,0],[1,0],[1,1],[0,1],[0,0],[0,-1],[0,0],[-1,0],[0,0]].map(([x,y])=>({x,y}));
  const p={x:0,y:0,planX:0,planY:0,dir:{x:1,y:0},controllerTiltDegrees:9},world={scene:{},events:[]},calls=[],steps=[];
  const context={p,world,path,result:null,hunter,TUTORIAL_CLOCK_ORIGIN:1000,
    expandTutorialCorridor:points=>points,validateTutorialPath(){},renderDirection:(x,y)=>({x,y}),
    hunterMoveDelay:()=>190,playerMoveDelay:()=>95,initializePowerMode(){},
    addTutorialEvent:(world,at,action,kind)=>world.events.push({at,action,kind}),
    commitPlayerVisualStep:(actor,x,y,time,delay)=>{actor.x=x;actor.y=y;steps.push({x,y,time,delay});},
    MazeBitersLive:{mouth:{turn:(actor,a,b,time)=>calls.push({from:plain(a),to:plain(b),time})}},
  };
  vm.runInNewContext(`${source}\nresult=addTutorialWalk(world,p,path,100,{hunter});`,context);
  if(stop)p[stop]=true;
  for(const event of world.events)event.action(1000+event.at);
  return {p:plain(p),steps,calls,result:context.result,events:world.events.map(({at,kind})=>({at,kind}))};
}
for(const hunter of [false,true])for(const stop of [null,'dead','removed']){
  const a=runTutorial(current.addTutorialWalk,hunter,stop),b=runTutorial(original.addTutorialWalk,hunter,stop);
  assert.deepEqual({p:a.p,steps:a.steps,result:a.result,events:a.events},{p:b.p,steps:b.steps,result:b.result,events:b.events});
  assert.equal(a.calls.length,stop?0:8);if(!hunter)assert.deepEqual(a.calls,b.calls,'protagonist tutorial turns remain identical');
  for(let i=0;i<a.calls.length;i++){assert.equal(a.calls[i].time,a.steps[i].time);if(i)assert.deepEqual(a.calls[i].from,a.calls[i-1].to);}
  tutorialChecks++;
}
console.log(`PASS Dragon Kin engine integration: whole game baseline recovered after removing exactly3 hunter notifications, widening tutorial notification scope, the tutorial palette, approved1/3/4 birth lookup, two normal-only hunter artwork selectors, the existing-gate contact preparation option and precisely pinned creature-neon and pickup-neon presentation additions; ${normalChecks} normal-only draw/contact checks, ${paletteChecks} uniformly balanced palette/birth cases with unchanged RNG count, ${moveChecks} movement/route/hold/shield/power/contact cases, ${reverseChecks} sub-cell reversals, ${tutorialChecks} hunter/player tutorial scenarios. No actor movement, collision rules, AI decisions, timing, scoring or protagonist rendering changes.`);
