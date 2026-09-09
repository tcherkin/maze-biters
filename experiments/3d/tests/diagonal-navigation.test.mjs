import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const movement=fs.readFileSync(new URL('../engine/diagonal.inc.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../engine/diagonal-snakes.inc.js',import.meta.url),'utf8');
const size=17,walls=new Set(),occupied=new Set();
const context=vm.createContext({
  COLS:size,ROWS:size,
  dirs:[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}],
  snakes:[],
  playerAt:()=>null,
  canEnter:(x,y)=>x>0&&y>0&&x<size-1&&y<size-1&&
    !walls.has(`${x},${y}`)&&!occupied.has(`${x},${y}`)
});
vm.runInContext(movement+'\n'+navigation+'\n'+
  'globalThis.api={experimentBuildRouteField,experimentSnakeStepOpen,experimentSnakeEdgesCross,experimentSnakeTravelLength};',context);
const api=context.api;
const open=(x,y)=>x>0&&y>0&&x<size-1&&y<size-1&&!walls.has(`${x},${y}`);
const distance=(field,x,y)=>field[y*size+x];
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

// Every unobstructed cell has the exact octile distance. Counting each
// diagonal as one would shorten these fields incorrectly by up to 41%.
let samples=0;
for(const target of [{x:1,y:1},{x:8,y:8},{x:15,y:4}]){
  const field=api.experimentBuildRouteField(target,open);
  for(let y=1;y<size-1;y++) for(let x=1;x<size-1;x++){
    const dx=Math.abs(x-target.x),dy=Math.abs(y-target.y);
    near(distance(field,x,y),Math.min(dx,dy)*Math.SQRT2+Math.abs(dx-dy));
    samples++;
  }
}

// One obstructed flank forces the full two-leg detour, even when the
// diagonal destination itself is open.
walls.add('3,2');
let field=api.experimentBuildRouteField({x:3,y:3},open);
near(distance(field,2,2),2);
assert.equal(api.experimentSnakeStepOpen({x:2,y:2},{x:1,y:1},{body:[]}),false);
walls.clear();
occupied.add('2,3');
assert.equal(api.experimentSnakeStepOpen({x:2,y:2},{x:1,y:1},{body:[]}),false);
occupied.clear();
assert.equal(api.experimentSnakeStepOpen({x:2,y:2},{x:1,y:1},{body:[]}),true);
context.playerAt=(x,y)=>x===3&&y===2?{x,y}:null;
assert.equal(api.experimentSnakeStepOpen({x:2,y:2},{x:1,y:1},{body:[]}),false);
context.playerAt=()=>null;

// A diagonally touching pair of open islands remains disconnected.
const islandOpen=(x,y)=>(x===2&&y===2)||(x===3&&y===3);
field=api.experimentBuildRouteField({x:3,y:3},islandOpen);
assert.equal(distance(field,2,2),-1);

// Opposite diagonals intersect in the middle although no endpoints coincide.
assert.equal(api.experimentSnakeEdgesCross({x:2,y:2},{x:3,y:3},{x:3,y:2},{x:2,y:3}),true);
assert.equal(api.experimentSnakeEdgesCross({x:2,y:2},{x:3,y:3},{x:3,y:3},{x:4,y:2}),false);
assert.equal(api.experimentSnakeEdgesCross({x:2,y:2},{x:3,y:3},{x:2,y:3},{x:3,y:4}),false);
context.snakes.push({body:[{x:3,y:2},{x:2,y:3}]});
assert.equal(api.experimentSnakeStepOpen({x:2,y:2},{x:1,y:1},{body:[]}),false);
context.snakes.length=0;

const body=[{x:3,y:3},{x:2,y:3},{x:1,y:3}];
near(api.experimentSnakeTravelLength(body,[{x:4,y:4},...body.slice(0,-1)],false),Math.SQRT2);
near(api.experimentSnakeTravelLength(body,[{x:4,y:4},...body.slice(0,-1)],true),Math.SQRT2);
near(api.experimentSnakeTravelLength(body,[...body.slice(1),{x:0,y:4}],true),Math.SQRT2);
near(api.experimentSnakeTravelLength(body,[...body.slice(1),{x:0,y:4}],false),Math.SQRT2);
near(api.experimentSnakeTravelLength([{x:2,y:2}],[{x:3,y:3}],true),Math.SQRT2);
near(api.experimentSnakeTravelLength(body,body,true),1);
console.log(`Diagonal navigation: ${samples} exact weighted distances, corner clearance, body crossings and forward/reverse timing passed.`);
