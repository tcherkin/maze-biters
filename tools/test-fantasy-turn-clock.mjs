import assert from 'node:assert/strict';
import {createFantasyTurnClock,FANTASY_TURN_MS,MAX_RETARGET_DRIFT_QUARTERS} from '../src/render/fantasy-turn-clock.js';
import {DIRECTIONS,planTurn,sampleTurn} from '../src/render/fantasy-turn/turn.js';

let checks=0;
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const ok=(value,label)=>{assert.ok(value,label);checks++;};
const close=(a,b,tolerance=1e-10)=>ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const clock=createFantasyTurnClock();
equal(FANTASY_TURN_MS,90);
let cases=0;
for(const from of DIRECTIONS)for(const to of DIRECTIONS){
  const actor=Object.freeze({dir:Object.freeze({x:1,y:0}),x:3,y:4});
  const before=JSON.stringify(actor),start=-100,plan=planTurn(from,to);
  equal(clock.sample(actor,0),null);
  clock.request(actor,from,to,start);
  for(let i=0;i<=1000;i++){
    const time=start+i/1000*90;
    equal(clock.sample(actor,time),sampleTurn(plan,(time-start)/90));
  }
  equal(clock.sample(actor,start-100),sampleTurn(plan,0));
  equal(clock.sample(actor,start+1000),sampleTurn(plan,1));
  equal(JSON.stringify(actor),before,'The clock never mutates actors');
  if(from!==to)cases++;
}
equal(cases,12);
for(const [from,middle,to] of [['right','down','left'],['down','left','up'],['left','down','right'],['up','right','down']]){
  const actor={};clock.request(actor,from,to,0);
  const half=clock.sample(actor,45);
  equal(half.from,middle);equal(half.to,to);equal(half.mix,0);
  equal(clock.sample(actor,90).done,true,'180 degrees finishes in 90ms too');
}

// Explicit policy, independent of planTurn: no rear pose in a left→right
// reversal, including one requested while up→left is still completing.
{
  equal(planTurn('left','right').route,['left','down','right']);
  const actor={};clock.request(actor,'left','right',0);
  for(let t=0;t<=90;t+=.1){
    const p=clock.sample(actor,t);
    ok(p.from!=='up'&&p.to!=='up','Horizontal reversal stays on the front side');
    ok(p.angle>=0&&p.angle<=2);
  }
  clock.reset(actor);clock.request(actor,'up','left',0);
  const before=clock.sample(actor,45);
  clock.request(actor,'left','right',45);
  close(clock.sample(actor,45).angle,before.angle);
  close(clock.sample(actor,135).angle,0);
  let previous=before.angle,sawDown=false;
  for(let t=45;t<=135;t+=.1){
    const p=clock.sample(actor,t);ok(p.angle<=previous+1e-9,'Interrupted reversal continues towards down');
    sawDown ||= p.from==='down'||p.to==='down';previous=p.angle;
  }
  ok(sawDown);equal(clock.sample(actor,135).done,true);
}

// Same-heading cells do not restart a turn, and pause is just repeated time.
{
  const actor={};clock.request(actor,'right','left',100);
  const paused=clock.sample(actor,134);
  for(let i=0;i<50;i++)equal(clock.sample(actor,134),paused);
  clock.request(actor,'left','left',147.5);
  equal(clock.sample(actor,170),sampleTurn(planTurn('right','left'),70/90));
  equal(clock.sample(actor,190).done,true);
  clock.sample(actor,100000);clock.sample(actor,-100000);
  equal(clock.sample(actor,134),paused,'Past/future probes cannot move the clock');
}

// Retargeting retains position AND velocity, then reaches only the latest goal.
for(const first of DIRECTIONS.filter(d=>d!=='right'))for(const target of DIRECTIONS.filter(d=>d!==first)){
  for(const at of [1,20,45,70,89]){
    const actor={},h=1e-4;clock.request(actor,'right',first,0);
    const before=clock.sample(actor,at),vBefore=(before.angle-clock.sample(actor,at-h).angle)/h;
    clock.request(actor,first,target,at);
    close(clock.sample(actor,at).angle,before.angle);
    const vAfter=(clock.sample(actor,at+h).angle-before.angle)/h;
    close(vBefore,vAfter,3e-5);
    const end=clock.sample(actor,at+90);
    equal(end.done,true);equal(end.from,target);equal(end.to,target);
    let previous=before.angle;
    const min=Math.min(before.angle,end.angle)-MAX_RETARGET_DRIFT_QUARTERS-1e-9;
    const max=Math.max(before.angle,end.angle)+MAX_RETARGET_DRIFT_QUARTERS+1e-9;
    for(let i=0;i<=900;i++){
      const pose=clock.sample(actor,at+i/10);
      ok(Number.isFinite(pose.angle));ok(pose.angle>=min&&pose.angle<=max,'Bounded interruption silhouette');
      ok(pose.mix>=0&&pose.mix<=1);ok(Math.abs(pose.angle-previous)<.02,'No positional jump');previous=pose.angle;
    }
  }
}

// A reproducible rapid input stream retains just the latest committed target.
{
  const actor={};let heading='right',time=0,seed=23;
  clock.request(actor,heading,heading,time);
  for(let i=0;i<2000;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    time+=1+(seed%47);const next=DIRECTIONS[(seed>>>10)%4];
    const before=clock.sample(actor,time);
    clock.request(actor,heading,next,time);
    close(clock.sample(actor,time).angle,before.angle,1e-9);
    heading=next;
    equal(clock.sample(actor,time),clock.sample(actor,time));
    ok(Number.isFinite(clock.sample(actor,time+4).angle));
  }
  equal(clock.sample(actor,time+90).from,heading);
}

// Timeline reset, isolated actor reset, respawn, full reset and bad inputs.
{
  const a={},b={};clock.request(a,'right','left',100);clock.request(b,'down','up',100);
  clock.request(a,'up','left',10);
  equal(clock.sample(a,10),sampleTurn(planTurn('up','left'),0));
  clock.reset(a);equal(clock.sample(a,50),null);ok(clock.sample(b,150));
  equal(clock.sample({},150),null,'New respawn object inherits no turn');
  clock.reset();equal(clock.sample(b,150),null);
  for(const time of [NaN,Infinity,-Infinity]){assert.throws(()=>clock.request(a,'right','down',time),TypeError);checks++;assert.throws(()=>clock.sample(a,time),TypeError);checks++;}
  for(const direction of ['',null,'north',3]){assert.throws(()=>clock.request(a,direction,'down',0),TypeError);checks++;}
  assert.throws(()=>clock.request(null,'right','down',0),TypeError);checks++;
}
console.log(JSON.stringify({ok:true,checks,directedCases:cases,turnMs:FANTASY_TURN_MS,scope:'Pure presentation clock; gameplay untouched'}));
