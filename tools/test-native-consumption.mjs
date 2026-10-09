import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';
import {createLiveScorpion} from '../src/render/live-scorpion.js';

// Actual native cell handlers -> actual facade -> actual visual services.
// Only sound, maze surroundings, mouth-event delivery and scorpion ART are
// doubles. No contact is manufactured through the experimental physics API.
const source=readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
const runtimeSource=readFileSync(new URL('../src/render/animation-runtime.js',import.meta.url),'utf8');
function extract(text,name){
  const start=text.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  assert.ok(start>=0,`Missing actual engine function ${name}`);
  for(let end=text.indexOf('}',start);end>=0;end=text.indexOf('}',end+1)){
    const candidate=text.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw Error(`Unterminated ${name}`);
}
const copy=x=>JSON.parse(JSON.stringify(x));
const near=(a,b,label,epsilon=1e-7)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=epsilon,`${label}: ${a} vs ${b}`);
const directions=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const mouthEvents=[],mouthSamples=[],dispatches=[],captures=[];
const stats={nativeEvents:0,preMutationCaptures:0,headGhostFrames:0,heldTrims:0,
  splitMoves:0,scorpionFrames:0,nativeRejects:0,levelTransitions:0,
  snakeInitiatedEvents:0,ghostAngleFrames:0};
let activeContext=null,clock=1000;
const positions=vm.createContext({TILE:16,gameOverVisualsSettled:false,gameTimeNow:()=>clock});
vm.runInContext(extract(source,'playerVisualPosition')+'\n'+extract(source.replace(
  'mouthTarget(p,t,out={}){','function mouthTarget(p,t,out={}){'),'mouthTarget'),positions);
const playerPosition=(p,t,out)=>positions.playerVisualPosition(p,t,out);
const mouthTarget=(p,t,out={})=>{
  const point=positions.mouthTarget(p,t,out);mouthSamples.push({player:p,time:t,x:point.x,y:point.y});return point;
};
const fakeScorpionArt={stats:{runtimePixelReads:false},draw(ctx,pose){
  const m=ctx.getTransform(),q=pose.sample(0,{});
  ctx.scorpionDraws?.push({x:m.a*q.x+m.c*q.y+m.e,y:m.b*q.x+m.d*q.y+m.f,
    scale:Math.hypot(m.a,m.b)/(16/36),frame:pose.frame});
}};
const facadeContext=vm.createContext({console,createLiveSnakeRenderer,
  createLiveScorpion:options=>createLiveScorpion({...options,loadArt:async()=>fakeScorpionArt}),
  createLiveMouthService:()=>({ready:true,stats:{ready:true},prepare:async()=>true,
    bite:(player,at,duration,knownAt)=>mouthEvents.push({player,at,duration,knownAt}),
    reset:()=>{mouthEvents.length=0;}}),
  createContactRuntime:()=>({reset(){},diagnostics:()=>({})}),snakeContactShape:()=>null});
vm.runInContext(runtimeSource.replace(/^import .*?;\s*$/gm,''),facadeContext);
const live=facadeContext.MazeBitersLiveFactory.create({tile:16,playerPosition,mouthTarget});
const nativeCapture=live.snake.capture,nativeSnakeBite=live.snakeBite,nativeScorpionBite=live.scorpionBite;
const instrumented={...live,snake:new Proxy(live.snake,{get(target,key){
  if(key!=='capture')return target[key];
  return(s,t)=>{
    const token=nativeCapture(s,t);
    captures.push({entity:s,at:t,body:copy(s.body),token,registered:activeContext.snakes.includes(s)});
    return token;
  };
}}),snakeBite(kind,s,token,p,t,created=[],index=-1){
  dispatches.push({kind,entity:s,token,player:p,at:t,created,index,
    body:copy(s.body),registered:activeContext.snakes.includes(s)});
  return nativeSnakeBite(kind,s,token,p,t,created,index);
},scorpionBite(s,p,t,atTail){
  dispatches.push({kind:'scorpion',entity:s,player:p,at:t,atTail,
    registered:activeContext.scorpion===s});return nativeScorpionBite(s,p,t,atTail);
}};
const functions=['snakeBiteFragments','snakeHeadContactIsSafe','powerEatSnakeHead',
  'resolveSnakePartContact','checkSnakeContact','killScorpion','checkWorldContact',
  'beginNextLevelTransition','nextLevel','snakeBodyPointIsCorner','snakeMovementChangesAxis','recordSnakeVisualStep',
  'occupiedByOtherSnake','occupiedBySelf','canEnter','forwardOptions','snakeBrainProfile',
  'chooseForwardDirection','advanceSnakeForward','snakeStep'];
const declarations=functions.map(name=>extract(source,name)).join('\n');
function scene(s=null){
  live.reset();dispatches.length=captures.length=mouthSamples.length=0;clock=1000;
  const effects=[],context=vm.createContext({snakes:s?[s]:[],scorpion:null,hunters:[],fruits:[],
    gameTimeNow:()=>clock,physicalContactActive:()=>false,MazeBitersLive:instrumented,
    hasCombatPower:p=>!!p.power,isPowerMode:p=>!!p.power,loseLife:p=>{p.dead=true;effects.push('death');},
    spawnSnakeBiteBloom:()=>effects.push('bloom'),spawnConsumedCreatureBloomAt:()=>effects.push('creatureBloom'),
    playSound:name=>effects.push(name),playRandomSound:()=>effects.push('bodySound'),
    ControllerHaptics:{headBite(){effects.push('headHaptic');},bodyBite(){effects.push('bodyHaptic');},
      majorCreatureBite(){effects.push('scorpionHaptic');}},
    AllyBrain:{noteTailBite(){},noteCompleted(){},noteSplit(){}},provokeCreature(){},
    awardPoints:(p,value)=>{p.score=(p.score||0)+value;},BODY_EAT_SOUNDS:[],FRUIT_EAT_SOUNDS:[],
    scaledScorpionSpawnDelay:()=>20000,activatePowerMode:p=>{p.power=true;},
    level:1,levelCompletionTransition:null,gameOver:false,gameOverPending:false,
    LEVEL_COMPLETE_TOTAL_GAME_MS:3488,GameplayMusic:{reserveLevel(){},beginGameClockFade(){}},
    SNAKE_SLIDE_RATIO:.55,snakeMoveDelay:()=>218,dirs:directions,REACTION_ASSIST_HOLD:Symbol('hold'),
    isWall:()=>false,occupiedByScorpion:()=>false,occupiedByHunter:()=>false,occupiedBySolidEgg:()=>false,
    playerRepelsInhabitant:()=>false,reactionAssistThreatEntryYields:()=>false,
    playerAt:(x,y)=>context.player&&!context.player.dead&&context.player.x===x&&context.player.y===y?context.player:null,
    MazeBrain:{choose:(entity,from,options)=>options.find(d=>d.x===entity.dir.x&&d.y===entity.dir.y)||options[0]}});
  vm.runInContext(declarations,context);activeContext=context;
  return{context,effects};
}
function snake(length,dir=directions[0],color='#35e55b'){
  return{body:Array.from({length},(_,i)=>({x:15-i*dir.x,y:15-i*dir.y})),dir:{...dir},
    color,reversing:false,lastMove:800,headTrail:[],anger:0,temperament:.5,tailGuide:null};
}
function eater(cell,dir=directions[0],extra={}){
  return{...cell,dir:{...dir},prevX:cell.x-dir.x,prevY:cell.y-dir.y,
    moveFromX:cell.x-dir.x,moveFromY:cell.y-dir.y,moveToX:cell.x,moveToY:cell.y,
    moveStartedAt:clock,moveDuration:95,score:0,lives:3,...extra};
}
function committedBite(context,s,index,p){
  const before=copy(s.body),count=dispatches.length,captureCount=captures.length;
  context.checkSnakeContact(p);
  assert.equal(dispatches.length,count+1,'one visual dispatch per real native bite');
  assert.equal(captures.length,captureCount+1,'one pre-removal capture per native bite');
  const capture=captures.at(-1),event=dispatches.at(-1);
  assert.equal(capture.entity,s);assert.ok(capture.registered);
  assert.deepEqual(capture.body,before);assert.equal(capture.token.count,before.length);
  assert.deepEqual(copy(capture.token.body),before);assert.equal(event.token,capture.token);
  assert.equal(event.at,clock);assert.equal(event.player,p);
  assert.equal(mouthEvents.length,count+1,'each removal has one synchronized bite event');
  const mouth=mouthEvents.at(-1);
  assert.equal(mouth.player,p);assert.equal(mouth.knownAt,clock);
  assert.ok(mouth.at>=clock&&mouth.duration>0&&Number.isFinite(mouth.duration));
  near(live.consumptionEndAt(),mouth.at+mouth.duration,'facade exposes actual latest consume end');
  assert.equal(p.score,index===0?125:index===before.length-1?25:10);
  stats.nativeEvents++;stats.preMutationCaptures++;return{event,mouth,before};
}

// A test-only native PNG loader drops unsupported ancillary metadata, never
// changes pixels, and leaves every production asset/loader untouched.
const require=createRequire(import.meta.url);let canvasRuntime;
for(const location of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',
  join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{canvasRuntime=require(location);break;}catch{}
}
assert.ok(canvasRuntime,'Native Canvas is required (CODEX_CANVAS_PACKAGE may select it)');
const {createCanvas,Image}=canvasRuntime,oldDocument=globalThis.document,oldImage=globalThis.Image;
let canvasAllocations=0;
globalThis.document={createElement(tag){assert.equal(tag,'canvas');canvasAllocations++;return createCanvas(1,1);}};
globalThis.Image=class extends Image{set src(value){
  const data=readFileSync(fileURLToPath(value)),chunks=[data.subarray(0,8)];
  for(let at=8;at<data.length;){const n=data.readUInt32BE(at),type=data.toString('ascii',at+4,at+8);
    if(type!=='caBX')chunks.push(data.subarray(at,at+n+12));at+=n+12;}
  super.src=Buffer.concat(chunks);
}};
function drawContext(){
  const ctx=createCanvas(600,600).getContext('2d'),draw=ctx.drawImage.bind(ctx);
  // Track the actual renderer's transform calls in doubles. Skia rounds its
  // reported matrix and can discard tiny early rotations, which should not
  // make a mathematical branch-continuity assertion platform-dependent.
  let matrix=[1,0,0,1,0,0];const stack=[];
  for(const name of ['save','restore','translate','scale','rotate']){
    const call=ctx[name].bind(ctx);ctx[name]=(...args)=>{
      const [a,b,c,d,e,f]=matrix;
      if(name==='save')stack.push(matrix.slice());
      else if(name==='restore'){assert.ok(stack.length);matrix=stack.pop();}
      else if(name==='translate'){const[x,y]=args;matrix=[a,b,c,d,e+a*x+c*y,f+b*x+d*y];}
      else if(name==='scale'){const[x,y]=args;matrix=[a*x,b*x,c*y,d*y,e,f];}
      else{const cosine=Math.cos(args[0]),sine=Math.sin(args[0]);
        matrix=[a*cosine+c*sine,b*cosine+d*sine,c*cosine-a*sine,d*cosine-b*sine,e,f];}
      return call(...args);
    };
  }
  ctx.getTransform=()=>Object.fromEntries(['a','b','c','d','e','f'].map((key,i)=>[key,matrix[i]]));
  ctx.mouthDraws=[];ctx.scorpionDraws=[];
  ctx.drawImage=(image,...args)=>{
    if(image.width===1008&&image.height===968){const m=ctx.getTransform();ctx.mouthDraws.push([m.a,m.b,m.c,m.d,m.e,m.f]);}
    draw(image,...args);
  };return ctx;
}
try{
  assert.equal(await live.prepare([]),true);const preparedCanvases=canvasAllocations;
  const errors=()=>assert.deepEqual(copy(live.diagnostics().errors),[],'no guarded animation failure hidden by native fallback');

  for(const dir of directions)for(const color of ['#35e55b','#d66bff'])for(const count of [2,7]){
    const s=snake(count,dir,color),{context,effects}=scene(s),p=eater(s.body.at(-1),dir);
    live.snake.getWorldGeometry(s,clock);live.snake.hold(s,clock-20);
    const before=live.snake.inspect(s,clock),{mouth}=committedBite(context,s,count-1,p);
    assert.equal(s.body.length,count-1);assert.equal(context.snakes[0],s);
    assert.ok(effects.includes('bloom')&&effects.includes('bodySound')&&effects.includes('bodyHaptic'));
    const sameCellDispatches=dispatches.length;context.checkSnakeContact(p);
    assert.equal(dispatches.length,sameCellDispatches,'removed tail cell cannot trigger a second consume');
    const middle=live.snake.inspect(s,mouth.at+mouth.duration/2),end=live.snake.inspect(s,mouth.at+mouth.duration);
    assert.ok(middle.length<before.length-1e-4,'held native snake still progressively consumes its removed tail');
    assert.ok(end.length<middle.length-1e-4,'held motion clock cannot freeze the independent bite clock');
    if(count===2){near(end.solo,1,'last tail completes a solitary rounded head');near(end.length,36.365625,'solo material length');}
    stats.heldTrims++;errors();
  }

  for(const dir of directions)for(const power of [false,true]){
    const s=snake(7,dir),{context,effects}=scene(s),index=power?0:3;
    const p=eater(s.body[index],power?{x:-dir.x,y:-dir.y}:{x:-dir.y,y:dir.x},{power});
    live.snake.getWorldGeometry(s,clock);
    const{event,mouth}=committedBite(context,s,index,p);
    assert.equal(event.kind,'split');assert.equal(event.registered,false,'split dispatch follows logical replacement');
    assert.equal(event.created.length,power?1:2);assert.ok(!context.snakes.includes(s));
    assert.deepEqual(context.snakes.map(child=>child.body.length),power?[6]:[3,3]);
    assert.equal(live.snake.stats().ghosts,power?1:0,'only powered head removal leaves a swallowed-head ghost');
    assert.ok(effects.includes('bloom'));
    for(const child of context.snakes){
      assert.equal(child.lastMove,0,'visual integration preserves the native newborn cadence');
      const prior=live.snake.getWorldGeometry(child,clock),oldBody=copy(child.body),oldDir=copy(child.dir);
      child.body.unshift({x:child.body[0].x+child.dir.x,y:child.body[0].y+child.dir.y});child.body.pop();
      // This is the same visual wrapper invoked immediately by the native
      // update loop for its due lastMove=0 newborn, not an experiment route.
      context.recordSnakeVisualStep(child,oldBody,clock,218,oldDir,false);child.lastMove=clock;
      const moved=live.snake.getWorldGeometry(child,clock);
      near(moved.head.x,prior.head.x,'newborn immediate commit preserves captured head x');
      near(moved.head.y,prior.head.y,'newborn immediate commit preserves captured head y');
      near(moved.tail.x,prior.tail.x,'newborn immediate commit preserves captured cut x');
      near(moved.tail.y,prior.tail.y,'newborn immediate commit preserves captured cut y');
      assert.ok(live.snake.getWorldGeometry(child,mouth.at+mouth.duration/2).birth<1,
        'first native move cannot cancel the simultaneous cut-end formation');
      near(live.snake.getWorldGeometry(child,mouth.at+mouth.duration).birth,1,'both child ends finish formation');
      stats.splitMoves++;
    }errors();
  }

  for(const dir of directions)for(const{count,power}of[{count:1,power:false},{count:7,power:false},{count:1,power:true}]){
    const s=snake(count,dir),{context,effects}=scene(s),p=eater(s.body[0],dir,{power,isAI:true,controllerTiltDegrees:17});
    live.snake.getWorldGeometry(s,clock);
    const{event,mouth}=committedBite(context,s,0,p);
    assert.equal(event.kind,'head');assert.equal(event.registered,true,'head capture/dispatch precede logical removal');
    assert.equal(context.snakes.length,0);assert.equal(live.snake.stats().ghosts,1);
    assert.ok(effects.includes('HeadEat')&&effects.includes('Congratulations'));
    const transition=context.levelCompletionTransition;
    assert.equal(transition.startedAt,clock);assert.equal(transition.endsAt,clock+3488,'native next-level deadline unchanged');
    near(transition.revealAt,live.consumptionEndAt(),'level-cleared overlay waits only for final swallow');
    stats.levelTransitions++;
    for(const fraction of [0,.25,.5,.75,.98]){
      const t=mouth.at+mouth.duration*fraction,raw=drawContext(),swallowed=drawContext();
      // The source creature is stationary; the surviving read-only reference
      // renders its exact pre-removal pose while the player keeps gliding.
      live.snake.draw(raw,s,t);live.drawGhosts(swallowed,t);
      const a=raw.mouthDraws.at(-1),b=swallowed.mouthDraws.at(-1);assert.ok(a&&b);
      const u=fraction**3*(10+fraction*(-15+6*fraction)),target=positions.mouthTarget(p,t);
      const g=live.snake.getWorldGeometry(s,t),center={x:g.head.x+Math.cos(g.head.angle)*g.head.span/2,
        y:g.head.y+Math.sin(g.head.angle)*g.head.span/2};
      const facing=Math.atan2(p.dir.y,p.dir.x)+p.controllerTiltDegrees*Math.PI/180;
      const rotation=count===1?Math.atan2(Math.sin(facing-g.head.angle),Math.cos(facing-g.head.angle))*u:0;
      const c=Math.cos(rotation),z=Math.sin(rotation),scale=1-u;
      const expected=[scale*(c*a[0]-z*a[1]),scale*(z*a[0]+c*a[1]),
        scale*(c*a[2]-z*a[3]),scale*(z*a[2]+c*a[3]),
        center.x*scale+target.x*u+scale*(c*(a[4]-center.x)-z*(a[5]-center.y)),
        center.y*scale+target.y*u+scale*(z*(a[4]-center.x)+c*(a[5]-center.y))];
      for(let n=0;n<6;n++)near(b[n],expected[n],
        'captured artwork closes/aligns into current tilted visual mouth, not logical cell center',3e-5);
      stats.headGhostFrames++;
    }
    const finished=drawContext();live.drawGhosts(finished,mouth.at+mouth.duration);
    assert.equal(live.snake.stats().ghosts,0);assert.equal(finished.mouthDraws.length,0);
    assert.ok(mouthSamples.some(sample=>sample.player===p));errors();
  }

  for(const dir of directions)for(const atTail of [false,true]){
    const{context,effects}=scene();const s={x:15,y:15,tailX:15-dir.x,tailY:15-dir.y,dir:{...dir},
      moveFromX:15,moveFromY:15,moveToX:15,moveToY:15,moveStartedAt:800,moveDuration:119.9,
      tailMoveFromX:15-dir.x,tailMoveFromY:15-dir.y,tailMoveToX:15-dir.x,tailMoveToY:15-dir.y,
      bornAt:800,lastMove:800,snapMovement:true};context.scorpion=s;
    const p=eater(atTail?{x:s.tailX,y:s.tailY}:s,atTail?dir:{x:-dir.x,y:-dir.y});
    live.scorpion.sample(s,clock);const before=copy(s);context.checkWorldContact(p);
    assert.equal(dispatches.length,1);assert.equal(dispatches[0].kind,'scorpion');
    assert.equal(dispatches[0].registered,true,'scorpion is captured while still present');
    assert.equal(dispatches[0].atTail,atTail);assert.deepEqual(s,before,'capture leaves native scorpion fields unchanged');
    assert.equal(context.scorpion,null);assert.equal(context.scorpionKilled,true);assert.equal(p.score,150);
    assert.equal(context.scorpionSpawnAt,clock+20000);assert.equal(mouthEvents.length,1);
    assert.ok(effects.includes('creatureBloom')&&effects.includes('ScorpioEat')&&effects.includes('scorpionHaptic'));
    context.checkWorldContact(p);assert.equal(dispatches.length,1,'removed scorpion cannot be consumed twice');
    const mouth=mouthEvents[0];near(live.consumptionEndAt(),mouth.at+mouth.duration,'scorpion facade deadline');
    const raw=live.scorpion.sample(s,mouth.at,{});let previousDistance=Infinity;
    for(const fraction of [0,.25,.5,.75,.98]){
      const t=mouth.at+mouth.duration*fraction,ctx=drawContext();live.drawGhosts(ctx,t);
      assert.equal(ctx.scorpionDraws.length,1);const q=ctx.scorpionDraws[0],u=fraction**3*(10+fraction*(-15+6*fraction));
      const current=positions.mouthTarget(p,t);
      const distance=Math.hypot(q.x-current.x,q.y-current.y);
      assert.ok(distance<=previousDistance+3e-5,'captured scorpion closes monotonically toward current mouth');
      previousDistance=distance;
      if(fraction===0){near(q.x,raw.x,'scorpion starts at actual captured seam x',3e-5);
        near(q.y,raw.y,'scorpion starts at actual captured seam y',3e-5);}
      if(fraction===.98)assert.ok(distance<.01,'final scorpion reaches mouth opening, not player center');
      if(fraction===.5){
        // Same captured ghost and same time; only translate the live player's
        // visual trajectory. Its target must follow by EXACTLY that amount.
        const saved=copy(p);for(const key of ['x','prevX','moveFromX','moveToX'])p[key]+=3;
        for(const key of ['y','prevY','moveFromY','moveToY'])p[key]+=1;
        const translated=drawContext();live.drawGhosts(translated,t);Object.assign(p,saved);
        near(translated.scorpionDraws[0].x-q.x,48,'scorpion uses live mouth callback x',4e-5);
        near(translated.scorpionDraws[0].y-q.y,16,'scorpion uses live mouth callback y',4e-5);
      }
      near(q.scale,1-u,'scorpion shrinks continuously, without an opacity-only fade');stats.scorpionFrames++;
    }
    live.drawGhosts(drawContext(),mouth.at+mouth.duration);assert.equal(live.scorpion.stats.ghosts,0);
    stats.nativeEvents++;errors();
  }

  // The second genuine native entry point is an inhabitant moving into a
  // powered player. Execute snakeStep itself (both solo and full-body paths),
  // not just the shared resolveSnakePartContact function.
  for(const dir of directions)for(const count of [1,2,7])for(const power of [false,true]){
    const s=snake(count,dir),{context}=scene(s),oldBody=copy(s.body);
    const p=eater({x:s.body[0].x+dir.x,y:s.body[0].y+dir.y},{x:-dir.x,y:-dir.y},{power});
    context.player=p;live.snake.getWorldGeometry(s,clock);context.snakeStep(s,clock);
    const actualMovedBody=[{x:oldBody[0].x+dir.x,y:oldBody[0].y+dir.y},...oldBody.slice(0,-1)];
    assert.deepEqual(copy(s.body),actualMovedBody,'native powered contact follows one actual cardinal commit');
    if(power){
      assert.equal(dispatches.length,1);assert.equal(captures.length,1);assert.equal(mouthEvents.length,1);
      assert.deepEqual(captures[0].body,actualMovedBody,'inhabitant-initiated capture precedes removal, not its real grid commit');
      assert.equal(p.score,125);assert.ok(!p.dead);assert.ok(!context.snakes.includes(s));
      assert.equal(dispatches[0].kind,count===1?'head':'split');
      assert.equal(context.snakes.length,count===1?0:1);assert.equal(live.snake.stats().ghosts,1);
      stats.snakeInitiatedEvents++;stats.preMutationCaptures++;
    }else{
      assert.equal(p.dead,true);assert.equal(p.score,0);assert.equal(dispatches.length,0);
      assert.equal(captures.length,0);assert.equal(context.snakes[0],s);stats.nativeRejects++;
    }errors();
  }

  // A valid moving 90-degree solo turn crosses the swallowing target's
  // antipode during the 140ms capture. Recomputing shortestAngle each frame
  // would reverse the selected branch and visibly spin the skull at midpoint.
  {
    const s=snake(1,{x:0,y:1}),{context}=scene(s),reference=createLiveSnakeRenderer();
    const referenceEntity=copy(s);reference.getWorldGeometry(referenceEntity,clock);
    live.snake.getWorldGeometry(s,clock);const oldBody=copy(s.body),oldDir=copy(s.dir);
    s.body[0]={x:s.body[0].x-1,y:s.body[0].y};s.dir={x:-1,y:0};
    referenceEntity.body=copy(s.body);referenceEntity.dir=copy(s.dir);
    reference.recordStep(referenceEntity,{oldBody,t:clock,duration:218});
    context.recordSnakeVisualStep(s,oldBody,clock,218,oldDir,false);
    const p=eater(s.body[0],{x:0,y:-1},{controllerTiltDegrees:17});
    const{mouth}=committedBite(context,s,0,p),sourceAt=reference.getWorldGeometry(referenceEntity,mouth.at).head.angle;
    const target=-Math.PI/2+17*Math.PI/180;
    const fixedTarget=sourceAt+Math.atan2(Math.sin(target-sourceAt),Math.cos(target-sourceAt));
    let priorAngle=null,crossedAntipode=false;
    for(let i=0;i<180;i++){
      const fraction=i/180,t=mouth.at+mouth.duration*fraction,ctx=drawContext();
      if(i===125)p.dir={x:1,y:0}; // Position follows the live mouth; event-facing remains latched.
      live.drawGhosts(ctx,t);const matrix=ctx.mouthDraws.at(-1);assert.ok(matrix);
      const rawAngle=reference.getWorldGeometry(referenceEntity,t).head.angle;
      const unwrapped=sourceAt+Math.atan2(Math.sin(rawAngle-sourceAt),Math.cos(rawAngle-sourceAt));
      const u=fraction**3*(10+fraction*(-15+6*fraction)),expected=unwrapped+(fixedTarget-unwrapped)*u;
      const actual=Math.atan2(matrix[1],matrix[0]);
      near(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected)),0,
        `ghost retains one event-selected angular branch at frame ${i} (${actual} versus ${expected})`,2e-6);
      if(priorAngle!==null)assert.ok(Math.abs(Math.atan2(Math.sin(actual-priorAngle),Math.cos(actual-priorAngle)))<.09,
        'actual cached skull transform never flips at the angular antipode or player direction change');
      if(rawAngle-target>Math.PI)crossedAntipode=true;
      priorAngle=actual;stats.ghostAngleFrames++;
    }
    assert.ok(crossedAntipode,'the fixture really traversed the original shortest-angle branch discontinuity');errors();
  }

  // Hostile frontal contact still kills; power changes only the native rule,
  // and no visual facade is permitted to award a second logical event.
  for(const count of [1,7]){
    const s=snake(count),{context}=scene(s),p=eater(s.body[0],{x:-1,y:0});
    context.checkSnakeContact(p);assert.equal(p.dead,true);assert.equal(p.score,0);
    assert.equal(context.snakes[0],s);assert.equal(dispatches.length,0);assert.equal(captures.length,0);
    assert.equal(mouthEvents.length,0);stats.nativeRejects++;
  }
  scene();assert.equal(live.consumptionEndAt(),0,'new game clears stale consumption-overlay delay');
  assert.equal(canvasAllocations,preparedCanvases,'native consumption never builds a canvas per frame/event');
  errors();console.log(JSON.stringify({test:'native-consumption',...stats,preparedCanvases},null,2));
}finally{globalThis.document=oldDocument;globalThis.Image=oldImage;}
