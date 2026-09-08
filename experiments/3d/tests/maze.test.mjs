import assert from 'node:assert/strict';
import {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN} from '../maze-layout.mjs';
import {CELL_SIZE,MAX_ACTOR_RADIUS,WALL_WIDTH,worldLayout} from '../world.mjs';
import {snakeRoute,sampleSnake,footprintIsOpen} from '../motion.mjs';

const maze=CONCEPT_MAZE,rows=maze.length,cols=maze[0].length;
const key=p=>`${p.x},${p.y}`;
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const isOpen=p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&maze[p.y]?.[p.x]==='.';
assert.equal(cols,19);assert.equal(rows,15);
assert.ok(maze.every(row=>row.length===cols&&/^[.#]+$/.test(row)),'The composed maze is a rectangular logical board');
assert.ok(maze.every((row,y)=>y===0||y===rows-1?/^#+$/.test(row):row[0]==='#'&&row.at(-1)==='#'),'The maze has a closed outer boundary');
assert.ok(isOpen(PLAYER_SPAWN),'Player spawn lies on the walkable floor');
assert.equal(Math.abs(PLAYER_SPAWN.dir.x)+Math.abs(PLAYER_SPAWN.dir.y),1,'Player spawn has a cardinal facing');

const queue=[PLAYER_SPAWN],seen=new Set(queue.map(key));
for(let i=0;i<queue.length;i++){
  const p=queue[i];
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const next={x:p.x+dx,y:p.y+dy};
    if(isOpen(next)&&!seen.has(key(next))){seen.add(key(next));queue.push(next);}
  }
}
const open=maze.join('').split('').filter(cell=>cell==='.').length;
assert.equal(seen.size,open,'Every open pocket is reachable from the actual player spawn');
const occupied=new Set([key(PLAYER_SPAWN)]);
assert.equal(CONCEPT_SNAKES.length,4,'The opening composition contains the four reference snakes');
assert.equal(new Set(CONCEPT_SNAKES.map(s=>s.color)).size,4,'The four opening snakes have distinct colors');
let curveSamples=0;
for(const snake of CONCEPT_SNAKES){
  assert.ok(snake.body.length>=3&&snake.body.length<=64,'Opening body fits the segmented model capacity');
  for(let i=0;i<snake.body.length;i++){
    const p=snake.body[i];
    assert.ok(isOpen(p),`Snake ${snake.color} starts on an open cell at ${key(p)}`);
    assert.ok(!occupied.has(key(p)),`Opening bodies and player do not overlap at ${key(p)}`);
    if(i) assert.equal(distance(p,snake.body[i-1]),1,'Each snake is one continuous cardinal chain');
    occupied.add(key(p));
  }
  const route=snakeRoute(snake,0);
  for(let i=0;i<=snake.body.length-1;i+=.025){
    assert.ok(footprintIsOpen(maze,sampleSnake(route,i),.414),'Rounded opening poses fit their logical corridors');curveSamples++;
  }
}
for(const snake of CONCEPT_SNAKES){
  for(const [lead,neighbor] of [[snake.body[0],snake.body[1]],[snake.body.at(-1),snake.body.at(-2)]]){
    const next={x:2*lead.x-neighbor.x,y:2*lead.y-neighbor.y};
    assert.ok(isOpen(next)&&!occupied.has(key(next)),`Both ends of ${snake.color} have an unobstructed opening step`);
  }
}
const layout=worldLayout(maze);
assert.equal(layout.x((cols-1)/2),0);assert.equal(layout.z((rows-1)/2),0);
assert.equal(layout.x(1)-layout.x(0),2,'Consecutive logical steps have double physical spacing');
assert.equal(layout.z(1)-layout.z(0),2);
assert.equal(layout.width,cols*CELL_SIZE);assert.equal(layout.height,rows*CELL_SIZE);
const visiblePassage=2*CELL_SIZE-WALL_WIDTH,diameter=2*MAX_ACTOR_RADIUS;
assert.ok(WALL_WIDTH>.964,'The new solid walls are wider than the original3D walls');
assert.ok(visiblePassage>2,'A corridor between neighboring wall runs has more than double the old physical width');
assert.ok(visiblePassage>diameter,'The enlarged model has visible breathing room inside the wider corridor');
console.log(JSON.stringify({checks:'concept maze, connectivity, spawn, four complete bodies, forward/reverse exits, rounded poses and physical spacing',cols,rows,openCells:open,bodyLengths:CONCEPT_SNAKES.map(s=>s.body.length),curveSamples,visiblePassage,modelEnvelopeDiameter:diameter},null,2));
