import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraFollow} from '../camera-follow.mjs';

test('Both axes accelerate then brake toward a stationary target without overshooting',()=>{
  const follow=new CameraFollow(),center={x:0,y:0},steps=[];
  for(let i=0;i<240;i++){
    const before=center.x;follow.update(center,10,-10,1/60);steps.push(center.x-before);
    assert.ok(center.x>=0&&center.x<=10);assert.ok(Math.abs(center.x+center.y)<1e-10);
  }
  assert.ok(steps[0]<steps[8]&&steps[8]>steps[80]);
  assert.ok(10-center.x<.0001);
});

test('A change of direction preserves velocity and brakes before reversing',()=>{
  const follow=new CameraFollow(),center={x:0,y:0};
  for(let i=0;i<20;i++)follow.update(center,10,0,1/60);
  const velocity=follow.vx,position=center.x;follow.update(center,-10,0,1/240);
  assert.ok(follow.vx>0&&follow.vx<velocity);assert.ok(center.x>position);
  for(let i=0;i<300;i++)follow.update(center,-10,0,1/60);
  assert.ok(Math.abs(center.x+10)<.0001);
});

test('Integration is frame-rate independent; resets and bounds clear residual velocity',()=>{
  const results=[30,60,144,240].map(hz=>{
    const f=new CameraFollow(),c={x:0,y:0};for(let i=0;i<hz;i++)f.update(c,10,4,1/hz);return c;
  });
  assert.ok(Math.max(...results.map(c=>c.x))-Math.min(...results.map(c=>c.x))<1e-10);
  const f=new CameraFollow(),c={x:4,y:-4};f.vx=3;f.vy=-3;f.clamp(c,-2,2,-2,2);
  assert.deepEqual(c,{x:2,y:-2});assert.equal(f.vx,0);assert.equal(f.vy,0);
  f.update(c,0,0,0);assert.deepEqual(c,{x:2,y:-2});f.reset();assert.equal(f.vx,0);
});
