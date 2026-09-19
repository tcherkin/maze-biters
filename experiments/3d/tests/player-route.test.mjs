import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bridge=fs.readFileSync(new URL('../engine/bridge.inc.js',import.meta.url),'utf8');
const begin=bridge.indexOf('  function experimentResetPlayerRoute(');
const end=bridge.indexOf('  function experimentSnakeSnapshot(',begin);
function fixture(){
  const context=vm.createContext({});
  vm.runInContext(`let experimentPlayerRoutes=new WeakMap(),experimentPlayerRouteEpoch=0;
    let now=1000;const gameTimeNow=()=>now;
    ${bridge.slice(begin,end)}
    globalThis.api={reset:experimentResetPlayerRoute,record:experimentRecordPlayerStep,
      snapshot:(p,t)=>{now=t;return experimentPlayerRouteSnapshot(p,t);},
      presentation:(p,t)=>experimentPlayerRouteSnapshot(p,t)};`,context);
  const p={x:5,y:5};
  const api=context.api;
  const snapshot=t=>JSON.parse(JSON.stringify(api.snapshot(p,t)));
  const step=(x,y,t,duration=95)=>{
    p.prevX=p.x;p.prevY=p.y;p.x=x;p.y=y;p.moveDuration=duration;
    const before={...p};api.record(p,t);assert.deepEqual(p,before,'recording cannot mutate authoritative player');
  };
  return {p,api,snapshot,step};
}

test('presentation endpoints become visible only when the actual visual interval ends',()=>{
  const f=fixture(),origin=f.snapshot(1000);f.step(6,5,1000);
  assert.deepEqual(f.snapshot(1094).points,origin.points);
  assert.deepEqual(f.snapshot(1095).points.map(p=>[p.sequence,p.x,p.y,p.time]),[[0,5,5,1000],[1,6,5,1095]]);
});
test('sparse render frames retain every completed diagonal, turn, reversal and ricochet endpoint',()=>{
  const f=fixture();f.snapshot(1000);
  f.step(6,5,1000,47.5);f.step(6,6,1048,47.5);f.step(7,7,1096,47.5*Math.SQRT2);
  f.step(6,6,1164,47.5*Math.SQRT2);f.step(5,6,1232,47.5);
  assert.deepEqual(f.snapshot(1280).points.map(p=>[p.x,p.y]),[[5,5],[6,5],[6,6],[7,7],[6,6],[5,6]]);
});
test('early commits report the existing logical endpoint snap without inventing unreached new targets',()=>{
  const f=fixture();f.step(6,5,1000);f.step(6,6,1030);
  assert.deepEqual(f.snapshot(1030).points.map(p=>[p.x,p.y,p.time]),[[5,5,1000],[6,5,1030]]);
});
test('reset, replacement, teleport and backwards clock start a fresh epoch; snapshots are independent copies',()=>{
  const f=fixture();f.step(6,5,1000);const first=f.snapshot(1100);
  first.points[0].x=999;assert.equal(f.snapshot(1100).points[0].x,5);
  f.api.reset(f.p,1100);const reset=f.snapshot(1100);assert.ok(reset.epoch>first.epoch);assert.equal(reset.points.length,1);
  f.p.x=15;const teleport=f.snapshot(1100);assert.ok(teleport.epoch>reset.epoch);assert.equal(teleport.points[0].x,15);
  const backward=f.snapshot(20);assert.ok(backward.epoch>teleport.epoch);
  const replacement=f.api.snapshot({x:5,y:5},20);assert.ok(replacement.epoch>backward.epoch);
});
test('bounded non-consuming history is stable when paused/blocked and supports multiple readers',()=>{
  const f=fixture();for(let i=0;i<200;i++)f.step(i%2?5:6,5,1000+i*100);
  const first=f.snapshot(21000),second=f.snapshot(21000);
  assert.equal(first.points.length,128);assert.deepEqual(first,second);
  assert.equal(first.points[0].sequence,73);assert.equal(first.points.at(-1).sequence,200);
});
test('sub-frame presentation lookahead and multiple readers cannot reset the route before the next simulation commit',()=>{
  const f=fixture();f.step(6,5,1000);const first=f.snapshot(1092);
  const ahead=f.api.presentation(f.p,1096);assert.equal(ahead.epoch,first.epoch);assert.equal(ahead.points.length,2);
  assert.equal(f.api.presentation(f.p,1092).points.length,1);
  f.step(6,6,1095.5);const next=f.snapshot(1100);
  assert.equal(next.epoch,first.epoch);assert.deepEqual(next.points.map(p=>[p.x,p.y]),[[5,5],[6,5]]);
});
