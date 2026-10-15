import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cameraViewport,getSnakeBounds,intersectsViewport,getCharacterBounds,getScorpionBounds} from '../src/render/scene-visibility.js';
import {createLiveSnakeRenderer,makeLiveSnakePath} from '../src/render/live-snake.js';
import {createMaterialCurve,createRigidHeadCurve,attachRetiringTail} from '../src/render/live-snake-curve.js';
import {createLiveScorpion} from '../src/render/live-scorpion.js';

const inside=(b,x,y,label)=>assert.ok(x>=b.minX-1e-7&&x<=b.maxX+1e-7&&y>=b.minY-1e-7&&y<=b.maxY+1e-7,label);
const viewport=cameraViewport({x:288,y:200,zoom:1},576,400);
assert.deepEqual(viewport,{left:0,top:0,right:576,bottom:400});
assert.deepEqual(cameraViewport({cx:288,cy:200,zoom:2},576,400),{left:144,top:100,right:432,bottom:300});
assert.equal(cameraViewport({x:0,y:0,zoom:0},576,400),null);
assert.ok(intersectsViewport(null,viewport));assert.ok(intersectsViewport({minX:NaN},viewport));
assert.ok(intersectsViewport({minX:576,minY:1,maxX:580,maxY:2},viewport));
assert.ok(!intersectsViewport({minX:577,minY:1,maxX:580,maxY:2},viewport));
assert.ok(intersectsViewport({minX:590,minY:1,maxX:600,maxY:2},viewport,16*1.45+2));

let bodies=0,points=0,characters=0,scorpions=0;
function verifyPath(path,start,length,tile=36,angleOffset=0){
  const scale=tile/36,rear=path.sample(start+Math.max(0,length-36));
  const sprite={dx:-2*scale,dy:-13*scale,dw:43*scale,dh:30*scale};
  const g={length:length*scale,diameter:57/160*tile,
    head:{x:rear.x*scale,y:rear.y*scale,angle:rear.angle+angleOffset,sprite},
    sample(d,out={}){path.sample(start+d/scale,out);out.x*=scale;out.y*=scale;return out;}};
  const b=getSnakeBounds(g,tile);assert.ok(b);
  for(let i=0;i<=300;i++){
    const p=g.sample(g.length*i/300),r=g.diameter/2;
    for(const [dx,dy] of [[r,0],[-r,0],[0,r],[0,-r]])inside(b,p.x+dx,p.y+dy,'Complete body/tail stays within bound');
    points++;
  }
  const h=g.head,c=Math.cos(h.angle),s=Math.sin(h.angle);
  for(const x of [sprite.dx,sprite.dx+sprite.dw])for(const y of [sprite.dy,sprite.dy+sprite.dh])
    inside(b,h.x+c*x-s*y,h.y+s*x+c*y,'Head destination rectangle including its alpha fringe');
  bodies++;return {g,b};
}
for(const tile of [16,36])for(let rotation=0;rotation<4;rotation++)for(const mirror of [-1,1]){
  const map=p=>{let x=p.x,y=p.y*mirror;for(let n=0;n<rotation;n++)[x,y]=[-y,x];return {x:x+10,y:y+10};};
  const a=makeLiveSnakePath([{x:0,y:0},{x:0,y:3},{x:4,y:3},{x:4,y:2},{x:2,y:2}].map(map));
  const b=makeLiveSnakePath([{x:0,y:-1},{x:0,y:3},{x:4,y:3},{x:4,y:2},{x:1,y:2}].map(map));
  const curve=createMaterialCurve(a,72,a.total-72,b,72,b.total-72);
  for(const phase of [0,.1,.4,.65,.9,1]){
    curve.update(phase);verifyPath(curve,0,curve.total,tile);
    const rigid=createRigidHeadCurve(a.sample(a.total-108),b.sample(b.total-108),36).update(phase);
    verifyPath(rigid,0,36,tile,Math.PI/7);
    verifyPath(attachRetiringTail(rigid,a,a.total-108),-36,72,tile);
  }
}
const long=verifyPath(makeLiveSnakePath([{x:0,y:2},{x:55,y:2}]),72,55*36,16);
assert.ok(long.g.head.x>viewport.right&&intersectsViewport(long.b,viewport),'An offscreen head cannot hide a visible long tail');
for(const invalid of [null,{}, {...long.g,length:Infinity},{...long.g,length:-1},
  {...long.g,head:{...long.g.head,sprite:null}},{...long.g,sample(){return {x:NaN,y:1};}},
  {...long.g,sample(){throw Error('Recovering');}}])assert.equal(getSnakeBounds(invalid,16),null);

for(const tile of [16,36])for(const scale of [1,1.85])for(let angle=-180;angle<=180;angle+=7){
  const position=Object.freeze({x:3.2,y:-.1}),b=getCharacterBounds(position,tile,angle,scale);
  const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),half=tile*scale/2;
  for(const x of [-half,half])for(const y of [-half,half])
    inside(b,(position.x+.5)*tile+c*x-s*y,(position.y+.5)*tile+s*x+c*y,'Tilted sprite/leader corner');
  characters++;
}
for(const tile of [16,36])for(const direction of [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}]){
  const service=createLiveScorpion({tile}),oldHead={x:5,y:5},oldTail={x:4,y:5};
  const entity={x:5+direction.x,y:5+direction.y,tailX:5,tailY:5,dir:direction};
  service.recordStep(entity,{oldHead,oldTail,oldDir:{x:1,y:0},t:0,duration:120,nativeDelay:218});
  for(let t=0;t<=220;t+=11){
    const pose=service.sample(entity,t),b=getScorpionBounds(pose,tile);
    // Every source column is at most one cell along the native centerline;
    // complete source height is +/-half a cell (wider than leg alpha).
    for(let i=0;i<=80;i++){
      const p=pose.sample(tile*(i/40-1));
      for(const sign of [-1,1])inside(b,p.x-sign*p.ty*tile/2,p.y+sign*p.tx*tile/2,'Scorpion turn/leg envelope');
    }
    scorpions++;
  }
}

// Geometry callers remain pure by default. Only the gameplay render opt-in
// updates the paint clock when the actual drawing is safely culled.
const renderer=createLiveSnakeRenderer(),snake={body:[{x:4,y:4},{x:3,y:4}],dir:{x:1,y:0},color:'#35e55b'};
renderer.capture(snake,0);const before=JSON.stringify(snake);
renderer.getWorldGeometry(snake,10,{commitRenderTime:true});
renderer.getWorldGeometry(snake,20);
assert.equal(renderer.getWorldGeometry(snake,100,{freeze:true}).renderTime,10);
renderer.getWorldGeometry(snake,40,{commitRenderTime:true});
assert.equal(renderer.getWorldGeometry(snake,100,{freeze:true}).renderTime,40,'Culled-then-frozen head retains latest evaluated paint');
renderer.getWorldGeometry(snake,80,{freeze:5,commitRenderTime:true});
assert.equal(renderer.getWorldGeometry(snake,100,{freeze:true}).renderTime,40,'Explicit frozen sample cannot advance paint clock');
assert.equal(JSON.stringify(snake),before,'No entity/gameplay property changes');

// Execute the engine's actual batch-bound helpers with independent fixtures;
// no game loop, asset bootstrap, timer, DOM or benchmark is involved.
const source=readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
const start=source.indexOf('  const neonCreatureBounds=[]'),end=source.indexOf('  function draw(realNow=',start);
assert.ok(start>0&&end>start);
const context={SceneVisibility:{getCharacterBounds,getScorpionBounds},TILE:16,scorpion:null,hunters:[],
  SnakeBiteBloomPool:[],SNAKE_BITE_BLOOM_DURATION_GAME_MS:340,COMPETITIVE_LEADER_SPARK_OVERLAY_SCALE:1.85,
  MazeBitersLive:{consumptionEndAt:()=>0,scorpion:{sample:()=>null}},
  gameplaySpriteVisible:(x,y)=>x>=0&&y>=0&&x<36&&y<25,
  smoothEntityPosition:(e,t,p,out)=>Object.assign(out,{x:p?e.tailX:e.x,y:p?e.tailY:e.y}),
  playerVisualPosition:(e,t,out)=>Object.assign(out,{x:e.dead?e.deathX:e.x,y:e.dead?e.deathY:e.y})};
vm.createContext(context);vm.runInContext(source.slice(start,end)+
  '\nglobalThis.creatures=neonCreatureForegroundBounds;globalThis.players=neonPlayerForegroundBounds;',context);
assert.equal(context.creatures(0).length,0);
context.hunters=[{x:2,y:3,controllerTiltDegrees:41},{x:80,y:1}];
assert.equal(context.creatures(0).length,1,'Off-camera native hunter fallback does not expand crop');
context.scorpion={x:8,y:8,tailX:7,tailY:8,snapMovement:true};
assert.equal(context.creatures(0).length,3,'Both fallback scorpion cells included');
const roster=[{x:4,y:4,controllerTiltDegrees:-43},{dead:true,deathX:2,deathY:2},
  {dead:true,hideDeathSprite:true,deathX:20,deathY:20},{x:90,y:1}];
assert.equal(context.players(roster,0).length,2,'Visible live/dead players and their whole overlays included');
context.playerVisualPosition=(e,t,out)=>Object.assign(out,{x:e.dead?90:e.x,y:e.dead?90:e.y});
const deathBounds=context.players(roster,0)[1];
assert.ok(deathBounds,'Death bounds use the actual death position, not a moving-player helper');
inside(deathBounds,2*16,2*16,'Death sprite top-left');
inside(deathBounds,3*16,3*16,'Death sprite bottom-right');
assert.ok(deathBounds.maxX-deathBounds.minX<=18,'No live leader overlay/tilt expands the death sprite');
context.MazeBitersLive.consumptionEndAt=()=>100;
assert.equal(context.players(roster,50),undefined,'Pending ghost/intake gets full fallback');
context.MazeBitersLive.consumptionEndAt=()=>0;
context.SnakeBiteBloomPool=[{active:true,startedAt:0}];
assert.equal(context.players(roster,200),undefined,'Suction/cloud gets full fallback');
assert.equal(context.players(roster,340).length,2,'Expired bloom returns to bounded capture');
assert.match(source,/if\(drawn\|\|!visible\)SnakeNeon\?\.noteSnake\(entity,\{freeze,geometry,bounds\}\)/);
assert.match(source,/setForegroundBounds\?\.\(neonPlayerForegroundBounds\(roster,gameNow\)\);\s*ctx=SnakeNeon\?\.actorsContext/);
console.log(JSON.stringify({ok:true,bodies,densePoints:points,characters,scorpions,
  culledThenFreeze:true,engineBatchBounds:true,gameplayMutation:false},null,2));
