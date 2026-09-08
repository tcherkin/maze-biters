import assert from 'node:assert/strict';
import {routeSample,snakeRoute,sampleSnake,footprintIsOpen} from '../motion.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let samples=0;
// Every rotation/reflection of a one-cell L corridor: both the curve and the
// conservative bounding circle of the complete 3D head must clear the walls.
for(const flip of [-1,1]) for(let rotation=0;rotation<4;rotation++){
  function transform(p){let {x,y}=p;x*=flip;for(let i=0;i<rotation;i++) [x,y]=[-y,x];return {x:x+5,y:y+5};}
  const points=[{x:-2,y:0},{x:-1,y:0},{x:0,y:0},{x:0,y:1},{x:0,y:2}].map(transform);
  const maze=Array.from({length:11},()=>Array(11).fill('#'));
  for(const p of points) maze[p.y][p.x]='.';
  let previous=routeSample(points,0),previousAngle=null;
  for(let i=1;i<=800;i++){
    const u=i/200,p=routeSample(points,u),a=routeSample(points,u-.001),b=routeSample(points,Math.min(4,u+.001));
    assert.ok(footprintIsOpen(maze,p,.414),`3D volume must clear wall at ${JSON.stringify(p)}`);
    assert.ok(distance(previous,p)<.006,'No position jump at a corner');
    const angle=Math.atan2(b.y-a.y,b.x-a.x);
    if(previousAngle!==null) assert.ok(Math.abs(Math.atan2(Math.sin(angle-previousAngle),Math.cos(angle-previousAngle)))<.05,'No instantaneous head turn');
    previous=p;previousAngle=angle;samples++;
  }
}

const from=[{x:3,y:2},{x:2,y:2},{x:1,y:2},{x:1,y:3},{x:1,y:4}];
const to=[{x:3,y:1},...from.slice(0,-1)];
const next=[{x:4,y:1},...to.slice(0,-1)];
const snake={body:to,motion:{from,to,started:1000,duration:225}};
const following={body:next,motion:{from:to,to:next,started:1225,duration:225}};
// A newly chosen right-angle exit cannot change the already-visible head pose.
const end=sampleSnake(snakeRoute(snake,1225),0);
const beginning=sampleSnake(snakeRoute(following,1225),0);
assert.ok(distance(end,beginning)<1e-9,'Continuous head across committed steps');
let last=sampleSnake(snakeRoute(snake,1000),0);
for(let t=1001;t<=1225;t++){
  const point=sampleSnake(snakeRoute(snake,t),0);
  assert.ok(distance(last,point)>0,'No original 45% stationary hold during forward travel');
  assert.ok(distance(last,point)<2/snake.motion.duration,'Forward gather/extension stays below twice the mean speed');
  last=point;samples++;
}
for(const specimen of [snake,{body:from.slice(1).concat({x:1,y:5}),motion:{from,to:from.slice(1).concat({x:1,y:5}),started:1000,duration:450}}]){
  for(const endpoint of [0,specimen.body.length-1]){
    let before=sampleSnake(snakeRoute(specimen,1000),endpoint);
    for(let t=1001;t<=1000+specimen.motion.duration;t++){
      const after=sampleSnake(snakeRoute(specimen,t),endpoint);
      assert.ok(distance(before,after)>0,'Neither endpoint may hold during an unblocked travel tick');
      before=after;samples++;
    }
  }
}
const reverseTo=[...from.slice(1),{x:1,y:5}];
const reverse={body:reverseTo,motion:{from,to:reverseTo,started:1000,duration:441.6666667}};
last=sampleSnake(snakeRoute(reverse,1000),0);
for(let t=1001;t<=1441;t++){
  const point=sampleSnake(snakeRoute(reverse,t),0);
  assert.ok(distance(last,point)>0,'Head moves continuously during retreat');
  assert.ok(distance(last,point)<2/reverse.motion.duration,'Retreat gather/extension stays below twice the mean speed');
  last=point;samples++;
}
const copy=JSON.stringify(snake);
snakeRoute(snake,1130);assert.equal(JSON.stringify(snake),copy,'Rendering must not mutate gameplay');
console.log(`3D motion: ${samples} curve/volume samples passed; full-duration motion, continuous corner orientation, forward/retreat and render purity.`);
