import assert from 'node:assert/strict';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';

// Independent presentation oracle. Native hooks/score/ownership are covered
// separately by test-native-consumption; this test never edits an entity in
// the renderer and requires neither a browser nor a canvas implementation.
const CELL=36,HEAD=36.365625;
const smooth=u=>{u=Math.max(0,Math.min(1,u));return u*u*u*(10-15*u+6*u*u);};
const near=(a,b,label='numeric',tol=1e-7)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<tol,`${label}: ${a} != ${b}`);
const clone=x=>JSON.parse(JSON.stringify(x));
const colors=['Green','Yellow','Blue','Pink','Orange'];
const directions=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
let checks=0,commits=0,events=0;
function snake(count,color,dir){return{body:Array.from({length:count},(_,i)=>({x:12-i*dir.x,y:12-i*dir.y})),
  dir:{...dir},color,reversing:false};}
function samePose(a,b,label){
  for(const end of ['rear','tail']){
    near(a[end].x,b[end].x,`${label}/${end}/x`);near(a[end].y,b[end].y,`${label}/${end}/y`);
    near(Math.atan2(Math.sin(a[end].angle-b[end].angle),Math.cos(a[end].angle-b[end].angle)),0,`${label}/${end}/angle`);
  }
  near(a.length-a.compression,b.length-b.compression,`${label}/visible span`);commits++;
}
function step(service,s,t,{turn=false,duration=218}={}){
  const oldBody=clone(s.body),before=service.inspect(s,t),wasReversing=s.reversing;
  if(turn)s.dir={x:-s.dir.y,y:s.dir.x};
  if(s.reversing){const last=s.body.at(-1);s.body=[...s.body.slice(1),{x:last.x-s.dir.x,y:last.y-s.dir.y}];}
  else s.body=[{x:s.body[0].x+s.dir.x,y:s.body[0].y+s.dir.y},...s.body.slice(0,-1)];
  service.recordStep(s,{oldBody,t,duration,wasReversing});
  samePose(before,service.inspect(s,t),'movement during consumption');
}
for(const color of colors)for(const dir of directions){
  // Freeze locomotion, then eat the final tail. Only locomotion stays frozen.
  const r=createLiveSnakeRenderer(),s=snake(2,color,dir),p={moveDuration:95,dir};
  r.capture(s,0);r.hold(s,50);const start=r.inspect(s,100),token=r.capture(s,100);
  s.body.pop();const schedule=r.biteTail(s,token,{t:100,player:p});events++;
  assert.deepEqual(schedule,{visualStart:133.25,duration:95,endAt:228.25});
  for(let i=0;i<=128;i++){
    const t=100+180*i/128,pose=r.inspect(s,t),q=smooth((t-133.25)/95);
    near(pose.length,CELL*2-(CELL*2-HEAD)*q,'held tail oracle');near(pose.solo,q,'held solo oracle');
    near(pose.rear.x,start.rear.x,'held nape x');near(pose.rear.y,start.rear.y,'held nape y');checks++;
  }
  assert.ok(r.surfaceSpeedBound(s,150,151)>0,'held consumption still has moving surfaces');
  assert.ok(r.contactBreakpoints(s,100,300).includes(228.25),'held trim endpoint remains announced');
  near(r.inspect(s,500).length,HEAD);assert.equal(r.surfaceSpeedBound(s,500,501),0);
  step(r,s,500);near(r.inspect(s,718).length,HEAD,'post-bite solo full size');

  // Exact sum of independent accepted95ms removals, including powered-close
  // spacing and a second bite whose visual lead ends before the preceding one.
  for(const gap of [1,20,50,95]){
    const q=snake(5,color,dir),service=createLiveSnakeRenderer();service.capture(q,0);const bites=[];
    for(let n=0;n<4;n++){
      const t=100+n*gap,before=service.inspect(q,t),saved=service.capture(q,t);q.body.pop();
      const plan=service.biteTail(q,saved,{t,player:{...p,moveDuration:n%2?1:95}});events++;
      samePose(before,service.inspect(q,t),'repeated bite exact event');
      bites.push({at:plan.visualStart,amount:n===3?2*CELL-HEAD:CELL});
      const expected=5*CELL-bites.reduce((sum,b)=>sum+b.amount*smooth((t-b.at)/95),0);
      near(service.inspect(q,t).length,expected,'overlapping bite sum');checks++;
    }
    for(let i=0;i<=128;i++){
      const t=100+gap*3+180*i/128,pose=service.inspect(q,t);
      const expected=5*CELL-bites.reduce((sum,b)=>sum+b.amount*smooth((t-b.at)/95),0);
      near(pose.length,expected,'completed overlap oracle');checks++;
    }
    near(service.inspect(q,1000).length,HEAD,'all removed material stays removed');
  }

  // Same-update fragment movement must preserve the whole captured material
  // pose, including compression inherited from an in-progress native pulse.
  for(const at of [0,60,110,170])for(const index of [0,1,3,5]){
    const service=createLiveSnakeRenderer(),parent=snake(7,color,dir);
    service.capture(parent,0);step(service,parent,0);
    const token=service.capture(parent,at),created=[];
    if(index>0)created.push({...snake(index,color,dir),body:clone(parent.body.slice(0,index))});
    if(index<6)created.push({...snake(6-index,color,{x:-dir.x,y:-dir.y}),body:clone(parent.body.slice(index+1)).reverse()});
    service.split(parent,created,token,{t:at,index,player:p});events++;
    for(const child of created){
      step(service,child,at);
      for(const t of [at+16,at+60,at+128.25,at+218]){
        const pose=service.inspect(child,t);assert.ok(Number.isFinite(pose.length+pose.tail.x+pose.tail.y));
        assert.ok(pose.length>=HEAD-1e-7,'birth does not squash the authored skull');checks++;
      }
      near(service.inspect(child,at+218).length,child.body.length===1?HEAD:child.body.length*CELL,'birth completes during native move');
    }
  }

  // A movement impulse during a compressed, unfinished trim must preserve
  // both endpoints. A later hold still allows the consumption clock to finish.
  for(const at of [40,100,160]){
    const service=createLiveSnakeRenderer(),q=snake(6,color,dir);service.capture(q,0);step(service,q,0);
    let token=service.capture(q,at);q.body.pop();service.biteTail(q,token,{t:at,player:p});
    step(service,q,at+10);service.hold(q,at+20);
    const before=service.inspect(q,at+30);token=service.capture(q,at+30);q.body.pop();
    service.biteTail(q,token,{t:at+30,player:p});samePose(before,service.inspect(q,at+30),'held interrupted repeat');
    near(service.inspect(q,at+300).length,4*CELL,'held overlap finishes');checks++;
  }
}
console.log(`Live consumption passed: ${checks} independent95ms/held/birth checks, ${commits} exact event/step continuity checks, ${events} bite events; five palettes, four directions, immediate fragment steps and powered-close repeated bites.`);
