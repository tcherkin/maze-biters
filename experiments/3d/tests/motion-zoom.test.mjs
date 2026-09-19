import test from 'node:test';
import assert from 'node:assert/strict';
import {MotionZoom} from '../motion-zoom.mjs';

const frame=(t,x,y,extra={})=>({generation:1,started:true,time:t*1000,paused:false,
  player:{id:1,lives:3,visual:{x,y}},...extra});
function run(path,{hz=60,seconds=10,controller=new MotionZoom(),start=0}={}){
  const rows=[];
  for(let i=0;i<=seconds*hz;i++){
    const t=start+i/hz,[x,y]=path(t);rows.push(controller.update(frame(t,x,y),i?1/hz:0));
  }
  return {controller,rows,factor:rows.at(-1)};
}

test('Start and blocked movement stay at the closest view; travel opens gently and returns after stopping',()=>{
  assert.equal(run(()=>[0,0]).factor,1);
  const travel=run(t=>[5.263*t,0],{seconds:5});
  assert.equal(travel.rows[0],1);assert.ok(travel.factor>.879&&travel.factor<.89);
  assert.ok(Math.max(...travel.rows.slice(1).map((v,i)=>Math.abs(v-travel.rows[i])))<.004);
  const rest=run(()=>[5.263*5,0],{start:5,controller:travel.controller,seconds:10});
  assert.equal(rest.factor,1);
  assert.ok(rest.rows.every(v=>v>=.879&&v<=1));
});

test('Speed matters, with equal treatment of diagonals and a bounded opening',()=>{
  const slow=run(t=>[2.63*t,0]),normal=run(t=>[5.263*t,0]),fast=run(t=>[10.526*t,0]);
  assert.ok(slow.factor>normal.factor&&normal.factor>fast.factor);
  assert.ok(fast.factor>=5/6&&fast.factor<.84);
  const diagonal=run(t=>[5.263*t/Math.SQRT2,5.263*t/Math.SQRT2]);
  assert.ok(Math.abs(diagonal.factor-normal.factor)<1e-8);
});

test('Fast backtracking and small loops stay close, even after a sustained run',()=>{
  for(const path of [t=>[Math.sin(t*8),0],t=>[Math.cos(t*5),Math.sin(t*5)]]){
    assert.equal(run(path).factor,1);
    const travel=run(t=>[5*t,0],{seconds:5});
    const local=run(t=>{const [x,y]=path(t-5);return [25+x,y];},{controller:travel.controller,start:5,seconds:12});
    assert.equal(local.factor,1);
  }
});

test('Pause, death, new life and level preserve framing; discontinuities are not sprints',()=>{
  const {controller:c,factor}=run(t=>[5*t,0],{seconds:5});
  for(let i=0;i<100;i++)assert.equal(c.update(frame(5,25,0,{paused:true}),.016),factor);
  assert.equal(c.update(frame(5.01,25,0),.016),factor);
  assert.equal(c.update(frame(8,40,0),3),factor);
  assert.equal(c.update(frame(8.01,80,80),.016),factor,'teleport must not create a zoom pulse');
  const dead=frame(9,80,80);dead.player.dead=true;dead.player.lives=2;
  assert.equal(c.update(dead,.016),factor);
  const reborn=frame(10,3,3);reborn.player.lives=2;assert.equal(c.update(reborn,.016),factor);
  run(t=>[5*t,0],{controller:c,seconds:5});
  const old=c.factor;assert.ok(Math.abs(c.update(frame(0,3,3,{generation:2}),.016)-old)<.002);
});

test('Frame rate and zero-time redraws do not change camera behavior or grow history',()=>{
  const results=[30,60,144,240].map(hz=>run(t=>[5.263*t,0],{hz,seconds:4}));
  assert.ok(Math.max(...results.map(r=>r.factor))-Math.min(...results.map(r=>r.factor))<.001);
  for(const {controller:c,factor} of results){
    for(let i=0;i<100;i++)assert.equal(c.update(frame(4,5.263*4,0),0),factor);
    assert.ok(c.history.length<=42);
  }
});
