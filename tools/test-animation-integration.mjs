import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const original=readFileSync(new URL('./baseline/game-v1.01.94.00.js',import.meta.url),'utf8');
const updated=readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function fn(source,name){
  const start=source.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  assert.ok(start>=0,`Missing ${name}`);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const text=source.slice(start,end+1);try{new vm.Script(text);return text;}catch{}
  }
  throw Error(`Unterminated ${name}`);
}
// These are byte-identical, not a rewritten approximation of the controller.
const preserved=['advancePlayer','commitPlayerVisualStep',
  'playerMoveDelay','snakeMoveDelay','snakeHeadContactIsSafe',
  'snakeBiteFragments','advanceSnakeForward','updateCharacterTilt',
  'controllerTiltTargetDegrees','loseLife','occupiedBySnake','occupiedByScorpion',
  'releasePendingScorpionDrops','scorpionSpawnTileIsClear'];
for(const name of preserved)assert.equal(fn(updated,name),fn(original,name),`${name} must not change`);
const copy=value=>JSON.parse(JSON.stringify(value));
// Physical contacts may hold a character at the exact sub-cell touching
// position. Ordinary translation still has precisely the original values.
for(const name of ['playerVisualPosition','smoothEntityPosition'])
for(const time of [0,100,125,150,195,220])for(const dead of [false,true]){
  const p={x:9,y:8,moveFromX:8,moveFromY:8,moveToX:9,moveToY:8,
    moveStartedAt:100,moveDuration:95,deathX:8.25,deathY:8,dead};
  const positions=[original,updated].map(source=>vm.runInNewContext(
    fn(source,name)+`;${name}(p,time);`,
    {p:copy(p),time,gameOverVisualsSettled:false}));
  assert.deepEqual(copy(positions[1]),copy(positions[0]),'Unheld character translation preserves native timing');
}
for(const name of ['playerVisualPosition','smoothEntityPosition']){
  const held=vm.runInNewContext(fn(updated,name)+`;${name}(p,150);`,
    {p:{physicalContactHold:{x:8.4375,y:8}},gameOverVisualsSettled:false});
  assert.deepEqual(copy(held),{x:8.4375,y:8},'Physical stop uses actual touching position');
}
const directions=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
function run(source,snake,player,power=false){
  const events=[];
  const context=vm.createContext({
    snakes:[copy(snake)],p:copy(player),gameTimeNow:()=>1000,
    physicalContactActive:()=>false,
    Math:Object.assign(Object.create(Math),{random:()=>.25}),
    hasCombatPower:()=>power,
    spawnSnakeBiteBloom:()=>events.push('bloom'),playSound:name=>events.push(name),
    playRandomSound:()=>events.push('bodySound'),BODY_EAT_SOUNDS:[],
    ControllerHaptics:{headBite(){},bodyBite(){}},
    AllyBrain:{noteCompleted(){},noteTailBite(){},noteSplit(){}},
    provokeCreature(){},awardPoints:(p,n)=>{p.score=(p.score||0)+n;},
    nextLevel:()=>events.push('nextLevel'),loseLife:p=>{p.dead=true;},
    MazeBitersLive:{snake:{capture:()=>({})},snakeBite(){}}
  });
  vm.runInContext(['snakeBiteFragments','snakeHeadContactIsSafe','powerEatSnakeHead',
    ...(source===updated?['resolveSnakePartContact']:[]),'checkSnakeContact']
    .map(name=>fn(source,name)).join('\n')+'\ncheckSnakeContact(p);',context);
  return copy({snakes:context.snakes,player:context.p,events});
}
let contacts=0;
for(const length of [1,2,3,7])for(let index=0;index<length;index++)
  for(const move of directions)for(const power of [false,true])for(const reversing of [false,true]){
    const snake={body:Array.from({length},(_,i)=>({x:10-i,y:8})),dir:{x:1,y:0},
      color:'#35e55b',reversing,anger:0,temperament:.5,headTrail:[],tailGuide:null};
    const hit=snake.body[index],player={...hit,prevX:hit.x-move.x,prevY:hit.y-move.y,dir:move,score:0};
    const expected=run(original,snake,player,power);
    // v99 deliberately changes only the final-tail retreat transition: retain
    // the genuine removed cell as solo history and preserve an existing retreat
    // until a real lateral junction. All score, effects, player state and every
    // unrelated collision field remain strict comparisons with the baseline.
    if(length===2&&index===1){
      const survivor=expected.snakes[0];
      survivor.headTrail=[copy(snake.body[1])];
      if(reversing){
        survivor.reversing=true;
        for(const field of ['blockedDir','reverseSteps']){
          if(Object.hasOwn(snake,field))survivor[field]=copy(snake[field]);
          else delete survivor[field];
        }
      }
    }
    assert.deepEqual(run(updated,snake,player,power),expected,
      `Collision changed: ${length}/${index}/${JSON.stringify(move)}/${power}/${reversing}`);contacts++;
  }
// A renderer observing a move must not change either the chosen AI direction,
// two occupied cells, original pending-drop schedule or next-move timestamp.
function scorpionMove(source,direction){
  const s={x:10,y:10,tailX:9,tailY:10,dir:{x:1,y:0},lastMove:0,nextFruitAt:0,nextEggAt:0};
  const context=vm.createContext({scorpion:s,snakeMoveDelay:()=>218,SCORPION_SLIDE_RATIO:.55,
    dirs:directions,isWall:(x,y)=>x!==10+direction.x||y!==10+direction.y,
    occupiedBySnake:()=>false,occupiedByHunter:()=>false,somePlayer:()=>false,occupiedBySolidEgg:()=>false,
    MazeBrain:{choose:()=>direction},scorpionBrainProfile:()=>({}),pendingScorpionDrops:[],
    Math:Object.assign(Object.create(Math),{random:()=>.25}),scaledScorpionDelay:()=>20000,
    scaledRepeatEggDelay:()=>30000,MazeBitersLive:{scorpion:{step(){}}}});
  vm.runInContext(fn(source,'moveScorpion')+'\nmoveScorpion(1000);',context);
  return copy({scorpion:s,drops:context.pendingScorpionDrops});
}
for(const direction of directions)assert.deepEqual(scorpionMove(updated,direction),scorpionMove(original,direction));
console.log(`PASS: ${preserved.length} exact controller/AI/timing/occupancy functions; ${contacts} differential native-fallback snake contacts; 4 differential scorpion decisions/drop schedules. Physical contact timing is tested separately.`);
