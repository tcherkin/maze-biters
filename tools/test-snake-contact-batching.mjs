import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';
import {snakeContactShape} from '../src/engine/contact-runtime.js';
import {shapeDistance} from '../src/engine/continuous-contact.js';

// Independent copy of the original fine-strip producer. Keep its sampling
// lattice, midpoint semantic IDs and taper interpolation unchanged.
function brute(geometry,entity){
  const parts=[],radius=geometry.diameter/2;
  for(let d=geometry.collisionTailDistance||0;d<geometry.bodyEndDistance-1e-6;){
    const next=Math.min(geometry.bodyEndDistance,d+1.25),a=geometry.sample(d),b=geometry.sample(next);
    const ra=radius*Math.min(1,d/Math.max(.001,geometry.tailSpan));
    const rb=radius*Math.min(1,next/Math.max(.001,geometry.tailSpan));
    const index=geometry.indexAt((d+next)/2);
    parts.push({id:`segment-${index}`,kind:'polygon',index,role:index===entity.body.length-1?'tail':'body',
      from:d,to:next,points:[{x:a.x-a.ty*ra,y:a.y+a.tx*ra},{x:b.x-b.ty*rb,y:b.y+b.tx*rb},
        {x:b.x+b.ty*rb,y:b.y-b.tx*rb},{x:a.x+a.ty*ra,y:a.y-a.tx*ra}]});
    d=next;
  }
  return {parts};
}
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.y-a.y*b.x;},0))/2;
function edgeDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
  const u=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;
  return Math.hypot(p.x-a.x-dx*u,p.y-a.y-dy*u);}
const clone=value=>JSON.parse(JSON.stringify(value));
let poses=0,bruteParts=0,batchedParts=0,joinedStrips=0,distanceChecks=0;
function verify(service,entity,time,label){
  const geometry=service.getWorldGeometry(entity,time),old=brute(geometry,entity);
  const result=snakeContactShape({getWorldGeometry:()=>geometry},entity,time,{});
  let cursor=0;
  for(const part of result.parts){
    const first=old.parts[cursor];assert.ok(first,`${label}: unexpected extra polygon`);
    near(distance(part.points[0],first.points[0]),0);near(distance(part.points[3],first.points[3]),0);
    let last=cursor;
    while(last<old.parts.length&&(distance(part.points[1],old.parts[last].points[1])>1e-7||
      distance(part.points[2],old.parts[last].points[2])>1e-7))last++;
    assert.ok(last<old.parts.length,`${label}: batching introduces a new endpoint`);
    let sumArea=0;
    for(let i=cursor;i<=last;i++){
      const source=old.parts[i];assert.equal(part.index,source.index,`${label}: semantic cell crossed`);
      assert.equal(part.role,source.role);sumArea+=area(source.points);
      if(last>cursor){
        // Both outer chains must lie on the same straight edges. This also
        // catches joining across a taper kink or a tiny actual bend.
        near(edgeDistance(source.points[0],part.points[0],part.points[1]),0);
        near(edgeDistance(source.points[1],part.points[0],part.points[1]),0);
        near(edgeDistance(source.points[2],part.points[3],part.points[2]),0);
        near(edgeDistance(source.points[3],part.points[3],part.points[2]),0);
      }
    }
    near(area(part.points),sumArea,2e-7);joinedStrips+=last-cursor;cursor=last+1;
  }
  assert.equal(cursor,old.parts.length,`${label}: every original strip is represented`);
  assert.ok(result.parts.length<=old.parts.length);
  if(poses%13===0&&old.parts.length){
    for(const fraction of [.03,.24,.51,.79,.98]){
      const center=geometry.sample(geometry.bodyEndDistance*fraction);
      for(const side of [-1,1]){
        const offset=geometry.diameter/2+side*.37;
        const probe={parts:[{kind:'circle',x:center.x-center.ty*offset,y:center.y+center.tx*offset,r:.07}]};
        near(shapeDistance(old,probe).distance,shapeDistance(result,probe).distance,2e-8);distanceChecks++;
        const index=geometry.indexAt(geometry.bodyEndDistance*fraction);
        const a={parts:old.parts.filter(p=>p.index===index)},b={parts:result.parts.filter(p=>p.index===index)};
        if(a.parts.length){near(shapeDistance(a,probe).distance,shapeDistance(b,probe).distance,2e-8);distanceChecks++;}
      }
    }
  }
  // The caller may reuse output through long/short/empty cases without old
  // polygons leaking into the new snapshot.
  const saved=JSON.stringify(result.parts);
  assert.equal(snakeContactShape({getWorldGeometry:()=>geometry},entity,time,result),result);
  assert.equal(JSON.stringify(result.parts),saved);
  bruteParts+=old.parts.length;batchedParts+=result.parts.length;poses++;
}
function fixture(length,kind,rotation){
  const cells=[];let x=0,y=0;
  for(let i=0;i<length;i++){
    let a=x,b=y;for(let r=0;r<rotation;r++)[a,b]=[-b,a];cells.push({x:20+a,y:20+b});
    if(kind==='line'||kind==='corner'&&i<Math.floor(length/2)||kind==='stair'&&Math.floor(i/2)%2===0)x++;else y++;
  }
  const body=cells.reverse(),head=body[0],next=body[1];
  return {body,dir:{x:head.x-next.x,y:head.y-next.y},color:'Green',reversing:false};
}
for(let rotation=0;rotation<4;rotation++)for(const length of [2,3,6,11])for(const kind of ['line','corner','stair'])
  for(const reverse of [false,true]){
    const entity=fixture(length,kind,rotation),service=createLiveSnakeRenderer(),oldBody=clone(entity.body);
    service.capture(entity,0);entity.reversing=reverse;
    if(reverse){const tail=oldBody.at(-1),before=oldBody.at(-2);
      entity.body=[...oldBody.slice(1),{x:tail.x+tail.x-before.x,y:tail.y+tail.y-before.y}];}
    else{const head=oldBody[0];entity.body=[{x:head.x+entity.dir.x,y:head.y+entity.dir.y},...oldBody.slice(0,-1)];}
    const duration=reverse?436:218;service.recordStep(entity,{oldBody,t:0,duration,wasReversing:false});
    for(const phase of [0,.17,.5,.83,1])verify(service,entity,phase*duration,`${kind}/${length}/${rotation}/${reverse}/${phase}`);
  }

// Trim/split births change the material origin and expose a taper within an
// old cell. In particular rear births temporarily use a different head span.
for(let rotation=0;rotation<4;rotation++){
  const entity=fixture(8,'corner',rotation),service=createLiveSnakeRenderer(),token=service.capture(entity,0);
  const front={...entity,body:clone(entity.body.slice(0,3))},rear={...entity,body:clone(entity.body.slice(4)).reverse()};
  service.split(entity,[front,rear],token,{t:0,index:3});
  for(const child of [front,rear])for(const t of [0,20,33.25,34,49,70,94,95,120])verify(service,child,t,`birth/${rotation}/${t}`);
  const trimmed=fixture(6,'stair',rotation),trimService=createLiveSnakeRenderer(),captured=trimService.capture(trimmed,0);
  trimmed.body.pop();trimService.biteTail(trimmed,captured,{t:0});
  for(const t of [0,20,33.25,34,49,70,94,95,120])verify(trimService,trimmed,t,`trim/${rotation}/${t}`);
}

// No optional span helper preserves the exact original producer. Exercise
// the prepared head path independently without DOM or native Canvas.
{
  const entity=fixture(5,'line',0),service=createLiveSnakeRenderer();service.capture(entity,0);
  const geometry=service.getWorldGeometry(entity,0),fallback={...geometry,stripSpan:undefined};
  const a=snakeContactShape({getWorldGeometry:()=>fallback},entity,0,{}),b=brute(geometry,entity);
  assert.deepEqual(a.parts.map(p=>p.points),b.parts.map(p=>p.points));
  geometry.head={alpha:1,x:10,y:20,angle:.2,contour:{parts:[{id:'head',points:[{x:0,y:0},{x:4,y:0},{x:2,y:3}]}]},
    sprite:{dw:4,sw:4,dh:3,sh:3,dx:0,dy:0}};
  const result=snakeContactShape({getWorldGeometry:()=>geometry},entity,0,{});
  assert.equal(result.parts[0].role,'head');assert.equal(result.parts[0].index,0);
  const pool=result._snakeScratch;
  assert.equal(snakeContactShape({getWorldGeometry:()=>null},entity,0,result),result);assert.equal(result.parts.length,0);
  snakeContactShape({getWorldGeometry:()=>geometry},entity,0,result);assert.equal(result._snakeScratch,pool);
}

assert.ok(joinedStrips>1000,'fixtures must exercise substantial exact batching');
{
  const entity=fixture(11,'line',0),service=createLiveSnakeRenderer();service.capture(entity,0);
  const geometry=service.getWorldGeometry(entity,0),renderer={getWorldGeometry:()=>geometry},out={};
  const rounds=1000;for(let i=0;i<100;i++)snakeContactShape(renderer,entity,0,out);
  let start=performance.now();for(let i=0;i<rounds;i++)brute(geometry,entity);const oldMs=performance.now()-start;
  start=performance.now();for(let i=0;i<rounds;i++)snakeContactShape(renderer,entity,0,out);const newMs=performance.now()-start;
  console.log(`Straight geometry: ${brute(geometry,entity).parts.length}→${out.parts.length} parts; ${rounds} shapes ${oldMs.toFixed(2)}→${newMs.toFixed(2)}ms (local microbenchmark only).`);
}
console.log(`PASS exact snake contact batching: ${poses} poses, ${bruteParts}→${batchedParts} parts, ${joinedStrips} joined strips, ${distanceChecks} union/per-material distance comparisons; curved endpoints, taper, birth, retreat and pooled reuse preserved.`);
