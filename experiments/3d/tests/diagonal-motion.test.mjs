import assert from 'node:assert/strict';
import {routeSample,snakeRoute,sampleSnake,footprintIsOpen} from '../motion.mjs';
import {CELL_SIZE,MAX_ACTOR_RADIUS,WALL_WIDTH} from '../world.mjs';

const directions=[{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:-1,y:1},{x:-1,y:0},{x:-1,y:-1},{x:0,y:-1},{x:1,y:-1}];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angleDifference=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const at=(snake,t,index)=>sampleSnake(snakeRoute(snake,t),index);
let samples=0,bends=0;

function traversedMaze(points){
  const maze=Array.from({length:15},()=>Array(15).fill('#'));
  for(const point of points)maze[point.y][point.x]='.';
  // The simulation permits diagonal links only when both flanking cells are
  // open. Build the narrowest legal environment for every tested route.
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(a.x!==b.x&&a.y!==b.y){maze[a.y][b.x]='.';maze[b.y][a.x]='.';}
  }
  return maze;
}

function physicalFootprintIsOpen(maze,point){
  const halfWall=WALL_WIDTH/CELL_SIZE/2,radius=MAX_ACTOR_RADIUS/CELL_SIZE;
  for(let y=0;y<maze.length;y++)for(let x=0;x<maze[y].length;x++){
    if(maze[y][x]==='.')continue;
    const dx=Math.max(Math.abs(point.x-x)-halfWall,0),dy=Math.max(Math.abs(point.y-y)-halfWall,0);
    if(dx*dx+dy*dy<radius*radius-1e-9)return false;
  }
  return true;
}

// Test every handedness and orientation of the 45°, 90°, and 135° bends,
// including a change between links whose physical lengths differ by sqrt(2).
for(const incoming of directions)for(const outgoing of directions){
  if(incoming.x*outgoing.y-incoming.y*outgoing.x===0)continue;
  const points=[-2,-1,0].map(t=>({x:7+t*incoming.x,y:7+t*incoming.y}));
  points.push(...[1,2].map(t=>({x:7+t*outgoing.x,y:7+t*outgoing.y})));
  const maze=traversedMaze(points);
  let previous=routeSample(points,0),previousAngle=null;
  for(let i=1;i<=1600;i++){
    const u=i/400,point=routeSample(points,u);
    const before=routeSample(points,u-.0001),after=routeSample(points,u+.0001);
    const tangent=distance(before,after),angle=Math.atan2(after.y-before.y,after.x-before.x);
    assert.ok(tangent>0,'A rounded diagonal turn retains a defined facing');
    assert.ok(distance(previous,point)<.004,'Mixed link lengths produce no position jump');
    if(previousAngle!==null)assert.ok(angleDifference(angle,previousAngle)<.04,'Facing passes smoothly through intermediate angles');
    assert.ok(footprintIsOpen(maze,point,.414),'The logical collision envelope stays inside the legal route');
    assert.ok(physicalFootprintIsOpen(maze,point),'The complete model clears the physical wall width');
    previous=point;previousAngle=angle;samples++;
  }
  bends++;
}

const started=1000,duration=400;
const from=[{x:9,y:5},{x:8,y:6},{x:7,y:6},{x:6,y:7},{x:6,y:8},{x:5,y:9}];
const forwardTo=[{x:10,y:5},...from.slice(0,-1)];
const reverseTo=[...from.slice(1),{x:4,y:9}];
for(const [label,to,next] of [
  ['diagonal to cardinal',forwardTo,[{x:11,y:6},...forwardTo.slice(0,-1)]],
  ['forward to reverse',forwardTo,from],
  ['reverse to forward',reverseTo,from],
  ['cardinal to diagonal retreat',reverseTo,[...reverseTo.slice(1),{x:3,y:10}]]
]){
  const first={body:to,motion:{from,to,started,duration}};
  const following={body:next,motion:{from:to,to:next,started:started+duration,duration:duration*Math.SQRT2}};
  for(let index=0;index<=from.length-1;index+=.05){
    assert.ok(distance(at(first,started+duration,index),at(following,started+duration,index))<1e-9,`No body pop at ${label}`);
    const before=at(first,started+duration-.001,index),after=at(following,started+duration+.001,index);
    assert.ok(distance(before,after)<.00002,`No discontinuity around ${label}`);
    samples++;
  }
  const original=JSON.stringify(first);
  for(let step=0;step<=400;step++){
    let previous=null;
    for(let index=0;index<=from.length-1;index+=.25){
      const point=at(first,started+step,index);
      assert.ok(Number.isFinite(point.x+point.y+point.dx+point.dy),'Contraction produces finite positions and tangents');
      assert.ok(Math.hypot(point.dx,point.dy)>0,'The skin and plates have a usable heading');
      if(previous)assert.ok(distance(previous,point)>0,'Contraction keeps neighboring skin samples distinct');
      previous=point;samples++;
    }
  }
  assert.equal(JSON.stringify(first),original,'Rendering leaves gameplay snapshots unchanged');
}

for(const direction of directions){
  const origin={x:5,y:5},destination={x:5+direction.x,y:5+direction.y};
  const snake={body:[destination],motion:{from:[origin],to:[destination],started,duration:duration*Math.hypot(direction.x,direction.y)}};
  const expectedAngle=Math.atan2(direction.y,direction.x);
  for(let p=.01;p<1;p+=.01){
    const point=at(snake,started+snake.motion.duration*p,0);
    assert.ok(distance(point,{x:5+direction.x*p,y:5+direction.y*p})<1e-9,'Lone heads retain constant-speed travel on their committed link');
    // sampleSnake points toward the front of the head-to-tail route.
    assert.ok(angleDifference(Math.atan2(point.dy,point.dx),expectedAngle)<1e-9,'Lone diagonal heads expose the correct facing to rotation smoothing');
    samples++;
  }
}

console.log(`3D diagonal motion: ${bends} bend orientations and ${samples} samples passed; wall clearance, smooth headings, mixed-length continuity, contraction, retreat, and lone heads.`);
