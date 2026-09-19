import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../engine/'+name,import.meta.url),'utf8');
const engine=read('maze-biters-experiment.js'),bridge=read('bridge.inc.js');
const section=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture(dragon=true){
 const c=vm.createContext({});
 vm.runInContext(`
 let now=1000,gameOverPending=false,player={id:1,x:5,y:5,dir:{x:1,y:0},lives:3,dead:false,spawnShieldUntil:2000},player2=null,player3=null,activePlayerCount=1;
 const playRandomSound=()=>{},BODY_EAT_SOUNDS=[],ControllerHaptics={bodyBite:()=>{}},experimentSnakeSnapshot=s=>({id:s.id||1});
 const walls=new Set(),snakes=[],hunters=[],eggs=[];let scorpion=null;
 const dirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}],PLAYER_STARTS=[{x:5,y:5,dir:{x:1,y:0}}];
 const gameTimeNow=()=>now,isWall=(x,y)=>walls.has(x+','+y),somePlayer=fn=>[player,player2,player3].some(p=>p&&fn(p));
 const spawnShieldIsBlocking=(p,t)=>p.spawnShieldUntil>t,isPowerMode=(p,t)=>p.powerModeUntil>t;
 const occupiedByOtherSnake=(x,y,s)=>snakes.some(o=>o!==s&&o.body.some(p=>p.x===x&&p.y===y));
 const occupiedBySelf=()=>false,occupiedByScorpion=()=>false,occupiedByHunter=()=>false,occupiedBySolidEgg=()=>false;
 const experimentPlayerRoutes=new WeakMap(),experimentMotion=new WeakMap();let experimentPlayerRouteEpoch=0;
 const playerVisualPosition=p=>p.visual||{x:p.x,y:p.y};
 ${section(bridge,'  function experimentResetPlayerRoute(','  function experimentSnakeSnapshot(')}
 ${read('player-body.inc.js')}
 ${section(engine,'  function playerAt(x,y){','  function humanPlayers(){')}
 ${section(engine,'  function playerRepelsInhabitant(','  function bumpPlayerBack(')}
 ${section(engine,'  function canEnter(','  function forwardOptions(')}
 experimentDragonBody=${dragon};experimentDragonSecondChance=${dragon};experimentResetPlayerRoute(player,now);
 globalThis.api={player,walls,snakes,hunters,eggs,starts:PLAYER_STARTS,motion:experimentMotion,
   at:playerAt,repels:playerRepelsInhabitant,enter:(x,y)=>canEnter(x,y,{body:[]}),
   cells:()=>experimentPlayerBodyCells(player),clear:()=>experimentPlayerStartIsClear(player),start:()=>experimentPlayerStart(1),
   time:t=>now=t,reset:()=>experimentResetPlayerRoute(player,now),
   shed:(x,y)=>experimentTryShedDragonRear({body:[{x,y}]},player,now),
   update:()=>experimentUpdateDragonForm(player),
   amount:()=>experimentDragonCompactness(player),length:()=>experimentDragonLength(player),visualLength:()=>experimentDragonVisualLength(player),events:()=>experimentDragonEvents,
   move(x,y,visual,duration=100){player.prevX=player.x;player.prevY=player.y;player.x=x;player.y=y;player.moveDuration=duration;player.visual=visual;experimentRecordPlayerStep(player,now);}
 };`,c);
 return c.api;
}
test('Both dragon cells repel snakes during shield and power; either becomes a valid bite target after expiry',()=>{
 const f=fixture();assert.equal(f.at(4,5),f.player);
 for(const x of [4,5])assert.equal(f.enter(x,5),false);
 f.time(1999);assert.equal(f.enter(4,5),false);
 f.time(2000);assert.equal(f.enter(4,5),true);assert.equal(f.enter(5,5),true);
 assert.equal(f.at(4,5),f.player,'The unshielded rear remains a victim, not empty space');
 f.player.powerModeUntil=3000;assert.equal(f.enter(4,5),false);assert.equal(f.enter(5,5),false);
 f.time(3000);assert.equal(f.enter(4,5),true);
 assert.equal(f.enter(3,5),true);assert.equal(f.enter(4,4),true);
 f.player.dead=true;assert.equal(f.at(4,5),null);assert.equal(f.enter(4,5),true);
});
test('Rear follows real trail through a corner and reversal, releasing cells after the visual body clears them',()=>{
 const f=fixture();f.move(6,5,{x:5,y:5});assert.equal(f.enter(4,5),false);
 f.time(1100);f.player.visual={x:6,y:5};assert.equal(f.enter(4,5),true);assert.equal(f.enter(5,5),false);
 f.move(6,6,{x:6,y:5});f.time(1200);f.player.visual={x:6,y:6};
 assert.equal(f.enter(6,5),false);assert.equal(f.enter(5,6),true);
 f.move(6,5,{x:6,y:6});f.time(1250);f.player.visual={x:6,y:5.5};assert.equal(f.enter(6,6),false);
 f.time(1300);f.player.visual={x:6,y:5};assert.equal(f.enter(6,6),false);
});
test('Diagonal trail covers both occupied cells without a third straight cell or sideways ghost',()=>{
 const f=fixture();f.move(6,6,{x:6,y:6});f.time(1100);
 assert.equal(f.enter(5,5),false);assert.equal(f.enter(4,4),true);assert.equal(f.enter(4,5),true);
 assert.equal(f.enter(5,7),true);
});
test('Respawn checks both cells against every inhabitant, walls, and still-moving snake segments',()=>{
 const f=fixture();f.player.dead=true;assert.equal(f.clear(),true);
 for(const x of [4,5]){
  const snake={body:[{x,y:5}]};f.snakes.push(snake);assert.equal(f.clear(),false);f.snakes.pop();
  for(const list of [f.hunters,f.eggs]){list.push({x,y:5});assert.equal(f.clear(),false);list.pop();}
 }
 const snake={body:[{x:3,y:5}]};f.snakes.push(snake);f.motion.set(snake,{from:[{x:4,y:5}],started:1000,duration:100});
 assert.equal(f.clear(),false);f.time(1100);assert.equal(f.clear(),true);
 f.walls.add('4,5');const start=f.start();assert.notEqual(start.dir.x,1,'Choose an orientation with room for the rear');
 for(const d of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}])f.walls.add((5-d.x)+','+(5-d.y));
 assert.equal(f.clear(),false);
});
test('One-cell characters retain original occupancy and respawn rules',()=>{
 const f=fixture(false);assert.equal(f.at(4,5),null);assert.equal(f.enter(4,5),true);
 f.snakes.push({body:[{x:4,y:5}]});assert.equal(f.clear(),true);
 f.snakes.push({body:[{x:5,y:5}]});assert.equal(f.clear(),false);
});

test('Rear bite releases its cell immediately, preserves controls, and grants a single short escape window',()=>{
 const f=fixture();f.time(2000);f.player.nextDir={x:0,y:-1};f.player.lastMove=1980;
 assert.equal(f.shed(5,5),false,'Head has no second chance');
 assert.equal(f.shed(4,5),true);assert.equal(f.player.lives,3);assert.equal(f.player.dead,false);
 assert.equal(f.at(4,5),null);assert.equal(f.enter(4,5),true);assert.equal(f.enter(5,5),false);
 assert.deepEqual(f.player.nextDir,{x:0,y:-1});assert.equal(f.player.lastMove,1980);
 assert.equal(f.shed(4,5),false);assert.equal(f.events().length,1);
 assert.equal(f.amount(),0);f.time(2130);assert.equal(f.amount(),.5);f.time(2260);assert.equal(f.amount(),1);
 f.time(3200);assert.equal(f.enter(5,5),true,'Escape protection expires without permanent immunity');
});

test('A visually occupied head and preserved one-cell characters cannot shed a rear',()=>{
 const f=fixture();f.time(2000);f.player.visual={x:4.2,y:5};assert.equal(f.shed(4,5),false);
 const old=fixture(false);assert.equal(old.shed(4,5),false);
});

test('Standing or pushing a wall never regrows; three walked cells restore the body smoothly without food',()=>{
 const f=fixture();f.time(2000);assert.equal(f.shed(4,5),true);
 for(const t of [2260,3000,7000]){f.time(t);f.update();assert.equal(f.length(),1);assert.equal(f.visualLength(),1);}
 f.time(7100);f.move(6,5,{x:5,y:5});f.update();assert.equal(f.length(),1,'A committed but not yet traveled step is insufficient');
 f.time(7150);f.player.visual={x:5.5,y:5};f.update();assert.ok(Math.abs(f.visualLength()-1.074074074074074)<1e-10);
 f.time(7200);f.player.visual={x:6,y:5};f.update();assert.ok(f.visualLength()>1.25&&f.visualLength()<1.27);assert.equal(f.length(),2);
 f.time(7300);f.move(7,5,{x:6,y:5});f.time(7400);f.player.visual={x:7,y:5};f.update();assert.ok(f.visualLength()>1.73&&f.visualLength()<1.75);
 f.time(7500);f.move(8,5,{x:7,y:5});f.time(7600);f.player.visual={x:8,y:5};f.update();assert.equal(f.visualLength(),2);
 assert.equal(f.at(7,5),f.player);assert.equal(f.at(6,5),null);
 f.time(10000);f.update();assert.equal(f.visualLength(),2);assert.equal(f.events().length,2);
 assert.equal(f.enter(8,5),true,'Escape protection still expires');
});

test('Regrowth tracks distance at different speeds and counts diagonal walking by actual distance',()=>{
 for(const duration of [100,400]){
  const f=fixture();f.time(2000);f.shed(4,5);f.time(3000);f.update();f.move(6,5,{x:5.5,y:5},duration);
  f.time(3000+duration/2);f.update();assert.ok(Math.abs(f.visualLength()-1.074074074074074)<1e-10);
  f.time(3000+duration);f.player.visual={x:6,y:5};f.update();assert.ok(f.visualLength()>1.25&&f.visualLength()<1.27);
  for(let i=1;i<3;i++){f.move(6+i,5,{x:6+i,y:5},duration);f.time(3000+(i+1)*duration);f.update();}
  assert.equal(f.visualLength(),2);
 }
 const f=fixture();f.time(2000);f.shed(4,5);f.time(3000);f.update();f.move(6,6,{x:5.5,y:5.5},100*Math.SQRT2);
 f.time(3050);f.update();assert.ok(Math.abs(f.visualLength()-1.074074074074074)<1e-10);
 f.time(3100);f.update();assert.ok(f.visualLength()>1.25&&f.visualLength()<1.27);
});

test('Blocked rear postpones growth; stopping partway freezes it until more walking',()=>{
 const f=fixture();f.time(2000);f.shed(4,5);f.time(2400);f.move(6,5,{x:5,y:5});
 const attacker={body:[{x:3,y:5}]};f.snakes.push(attacker);
 f.motion.set(attacker,{from:[{x:4,y:5}],started:2400,duration:100});
 f.time(2450);f.player.visual={x:5.5,y:5};f.update();assert.equal(f.length(),1);
 f.time(2500);f.player.visual={x:6,y:5};f.update();assert.ok(Math.abs(f.visualLength()-1.074074074074074)<1e-10);
 f.time(10000);f.update();assert.ok(Math.abs(f.visualLength()-1.074074074074074)<1e-10,'No time-driven completion while stopped');
 f.move(6,6,{x:6,y:5});f.time(10050);f.player.visual={x:6,y:5.5};f.update();assert.ok(f.visualLength()>1.25&&f.visualLength()<1.27);
 assert.equal(f.at(6,5),f.player);assert.equal(f.at(5,6),null);
});

test('Route reset rebases an unfinished recovery without jumping or getting stuck',()=>{
 const f=fixture();f.time(2000);f.shed(4,5);f.time(3000);f.move(6,5,{x:5.5,y:5});
 f.time(3050);f.update();const before=f.visualLength();assert.ok(before>1&&before<1.1);
 f.reset();assert.equal(f.visualLength(),before);
 for(let i=0;i<3;i++){f.time(4000+i*200);f.move(7+i,5,{x:7+i,y:5});f.time(4100+i*200);f.update();}
 assert.equal(f.visualLength(),2);
});

test('Recovery cannot occur while dead or in another character model',()=>{
 const dead=fixture();dead.time(2000);dead.shed(4,5);dead.player.dead=true;
 dead.time(3000);dead.update();assert.equal(dead.length(),1);
 const old=fixture(false);old.player.experimentCompact=true;old.player.experimentRestorePending=true;
 old.time(3000);old.update();assert.equal(old.length(),1);
});
