import assert from 'node:assert/strict';
import {createRigidHeadCurve} from '../src/render/live-snake-curve.js';
import {createLiveSnakeRenderer, liveSnakePulse} from '../src/render/live-snake.js';

const CELL=36,TILE=16,SCALE=TILE/CELL,HEAD=215.5*(57/160*CELL)/76;
const copy=x=>structuredClone(x);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const near=(a,b,label)=>assert.ok(dist(a,b)<1e-8,`${label}: ${dist(a,b)}`);
const rear=(center,angle)=>({x:center.x-Math.cos(angle)*HEAD/2,y:center.y-Math.sin(angle)*HEAD/2,angle});
const center=g=>({x:g.head.x+Math.cos(g.head.angle)*g.head.span/2,y:g.head.y+Math.sin(g.head.angle)*g.head.span/2});
let curveFrames=0,rendererFrames=0;
let postBiteFrames=0;

// Old nape interpolation sweeps the rigid center up to half a cell sideways.
// All supplied endpoints remain the same; rotation must be around the center.
for(let rotation=0;rotation<4;rotation++)for(const delta of [-Math.PI/2,Math.PI/2,Math.PI]){
  for(const movement of [{x:0,y:0},{x:0,y:-CELL},{x:CELL,y:0}]){
    const a={x:198,y:198},b={x:a.x+movement.x,y:a.y+movement.y},angle=rotation*Math.PI/2;
    const curve=createRigidHeadCurve(rear(a,angle),rear(b,angle+delta),HEAD);
    for(let i=0;i<=200;i++){
      const p=i/200;curve.update(p);
      near(curve.sample(HEAD/2),{x:a.x+(b.x-a.x)*p,y:a.y+(b.y-a.y)*p},'center follows committed line');
      assert.ok(Math.abs(dist(curve.sample(0),curve.sample(HEAD))-HEAD)<1e-9,'rigid head keeps exact full size');
      const frozen=curve.snapshot(),cloned=curve.clone(),expected=curve.sample(HEAD*.27);
      curve.update(1-p);near(frozen.sample(HEAD*.27),expected,'snapshot isolates pose');
      near(cloned.sample(HEAD*.27),expected,'clone isolates pose');
      curveFrames++;
    }
  }
}

for(let rotation=0;rotation<4;rotation++)for(const side of [-1,1])for(const reversing of [false,true]){
  const angle=rotation*Math.PI/2,nextAngle=angle+side*Math.PI/2;
  const dir={x:Math.round(Math.cos(angle)),y:Math.round(Math.sin(angle))};
  const nextDir={x:Math.round(Math.cos(nextAngle)),y:Math.round(Math.sin(nextAngle))};
  const sign=reversing?-1:1,old={x:10,y:10},next={x:old.x+sign*nextDir.x,y:old.y+sign*nextDir.y};
  const snake={body:[old],dir,reversing,color:'#ff5fa2'},service=createLiveSnakeRenderer();
  service.capture(snake,0);snake.body=[next];snake.dir=nextDir;
  const native=copy(snake),duration=reversing?436:218;
  service.recordStep(snake,{oldBody:[old],t:0,duration,wasReversing:reversing});
  for(let i=0;i<=200;i++){
    const p=liveSnakePulse(i/200,CELL,reversing).progress,g=service.getWorldGeometry(snake,duration*i/200);
    near(center(g),{x:(old.x+.5+(next.x-old.x)*p)*TILE,y:(old.y+.5+(next.y-old.y)*p)*TILE},'live center remains inside committed cell corridor');
    assert.ok(Math.abs(g.head.span-HEAD*SCALE)<1e-9,'no defensive artwork shrink');
    rendererFrames++;
  }
  assert.deepEqual(snake,native,'renderer never changes native direction, position or mode');
}

// Interruption at a real perpendicular branch must not draw a diagonal chord
// between cells on the two sides of the closed inside corner.
for(const reversing of [false,true]){
  const service=createLiveSnakeRenderer(),snake={body:[{x:5,y:5}],dir:{x:1,y:0},reversing};
  service.capture(snake,0);const duration=reversing?436:218,sign=reversing?-1:1;
  const first=copy(snake.body);snake.body=[{x:5+sign,y:5}];
  service.recordStep(snake,{oldBody:first,t:0,duration,wasReversing:reversing});
  const at=duration*.55,previous=service.getWorldGeometry(snake,at),old=copy(snake.body);
  const before=center(previous),via={x:(old[0].x+.5)*TILE,y:(old[0].y+.5)*TILE};
  snake.body=[{x:old[0].x,y:old[0].y+sign}];snake.dir={x:0,y:1};
  service.recordStep(snake,{oldBody:old,t:at,duration,wasReversing:reversing});
  near(center(service.getWorldGeometry(snake,at)),before,'interrupted commit preserves exact center');
  for(let i=0;i<=200;i++){
    const c=center(service.getWorldGeometry(snake,at+duration*i/200));
    assert.ok(Math.abs(c.y-via.y)<1e-8||Math.abs(c.x-via.x)<1e-8,'interrupted turn stays on the two native corridor axes');
    rendererFrames++;
  }
}

// Tail removal leaves a trimming pose and may inherit a collision hold. A
// subsequent real native move must still release it and move the lone head.
for(const duringTrim of [false,true])for(const reversing of [false,true]){
  const service=createLiveSnakeRenderer(),snake={body:[{x:6,y:5},{x:5,y:5}],dir:{x:1,y:0},reversing};
  service.capture(snake,0);service.hold(snake,0);
  const token=service.capture(snake,0);snake.body.pop();
  const timing=service.biteTail(snake,token,{t:0,player:{moveDuration:95}});
  const at=duringTrim?timing.visualStart+10:timing.endAt+10,oldBody=copy(snake.body);
  const start=center(service.getWorldGeometry(snake,at)),sign=reversing?-1:1;
  snake.dir={x:0,y:1};snake.body=[{x:6,y:5+sign}];
  const duration=reversing?436:218;
  service.recordStep(snake,{oldBody,t:at,duration,wasReversing:reversing});
  near(center(service.getWorldGeometry(snake,at)),start,'post-bite commit stays continuous');
  let travelled=0,prior=start;
  for(let i=1;i<=200;i++){
    const g=service.getWorldGeometry(snake,at+duration*i/200),p=center(g);
    assert.ok([p.x,p.y,g.head.angle,g.head.span].every(Number.isFinite));
    assert.ok(Math.abs(g.head.span-HEAD*SCALE)<1e-9,'post-bite head is never scaled');
    travelled+=dist(p,prior);prior=p;postBiteFrames++;
  }
  assert.ok(travelled>15,'a completed or in-flight trim cannot freeze the next actual solo move');
  near(prior,{x:6.5*TILE,y:(5.5+sign)*TILE},'post-bite move reaches native destination');
  assert.equal(service.getWorldGeometry(snake,at+duration).head.solo,1);
}
console.log(JSON.stringify({curveFrames,rendererFrames,postBiteFrames,centerBow:0,fullSize:true,nativeStateUntouched:true}));
