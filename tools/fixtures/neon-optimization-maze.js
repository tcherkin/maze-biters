// Fixed full-route, tight U-turn and corridor topology for renderer regression tests.
export const CELL=36;
export const WORLD_WIDTH=21*CELL,WORLD_HEIGHT=15*CELL;
export const GAME_BODY_DIAMETER=57/160*CELL;
export const MAZE_ATLAS_URL='./assets/game-maze-pipes.png';
const COLUMNS=21,ROWS=15,HUE=248,PALETTE_ROW=2,SPRITE_SIZE=160;
// A softened version of this fixture's violet-blue palette (hue ~248).
// The lighting study consumes it; other fixtures keep their existing painter.
export const MAZE_OVERHEAD_TINT=Object.freeze([173,160,255]);
export const ROUTE_CELLS=Object.freeze([
  [2,2],[18,2],[18,6],[13,6],[13,10],[18,10],
  [18,11],[2,11],[2,9],[7,9],[7,5],[2,5]
].map(Object.freeze));
// Two adjacent right turns: one cell downward immediately followed by left.
// With half-cell corner radii the two arcs touch without a straight between.
export const U_TURN_VERTEX_INDICES=Object.freeze([5,6]);
export const ROUTE_VERTICES=Object.freeze(ROUTE_CELLS.map(([x,y])=>
  Object.freeze([(x+.5)*CELL,(y+.5)*CELL])));

function makeGrid(){
  const grid=Array.from({length:ROWS},()=>Array(COLUMNS).fill('#'));
  const carve=(a,b)=>{
    const dx=Math.sign(b[0]-a[0]),dy=Math.sign(b[1]-a[1]);
    if(dx&&dy)throw new Error('Fixture corridors must be orthogonal');
    const n=Math.abs(b[0]-a[0])+Math.abs(b[1]-a[1]);
    for(let i=0;i<=n;i++)grid[a[1]+i*dy][a[0]+i*dx]='.';
  };
  for(let i=0;i<ROUTE_CELLS.length;i++)
    carve(ROUTE_CELLS[i],ROUTE_CELLS[(i+1)%ROUTE_CELLS.length]);
  // Realistic branches/intersections and dead ends: the snake is prescribed
  // a loop through this network, rather than painted on a wide oval track.
  for(const branch of [
    [[5,2],[5,3]],
    [[10,2],[10,4],[16,4],[16,6]],
    [[7,7],[4,7]],
    [[2,9],[2,7]],
    [[7,6],[10,6],[10,10],[13,10]],
    [[18,6],[18,8],[16,8]],
    [[10,12],[10,10]]
  ])for(let i=1;i<branch.length;i++)carve(branch[i-1],branch[i]);
  return Object.freeze(grid.map(row=>row.join('')));
}
export const LEVEL_GRID=makeGrid();

export const TAU = Math.PI * 2;
export const TILE = CELL;
export const WIDTH = WORLD_WIDTH, HEIGHT = WORLD_HEIGHT;
export const VERTICES = ROUTE_VERTICES;
export const mod = (n,d) => ((n%d)+d)%d;
export const angleDelta = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
const unit = (a,b) => { const d=Math.hypot(b[0]-a[0],b[1]-a[1]); return [(b[0]-a[0])/d,(b[1]-a[1])/d]; };

// A closed C1 path: a single distance clock drives every point of the snake.
export function makeRoute(vertices=VERTICES, radius=TILE/2) {
  if(!Number.isFinite(radius)||radius<=0)throw new Error('Route radius must be positive.');
  const corners=vertices.map((v,i)=>{
    const prev=vertices[mod(i-1,vertices.length)], next=vertices[(i+1)%vertices.length];
    const incomingLength=Math.hypot(v[0]-prev[0],v[1]-prev[1]);
    const outgoingLength=Math.hypot(v[0]-next[0],v[1]-next[1]);
    if(!(incomingLength>1e-9)||!(outgoingLength>1e-9))throw new Error('Route vertices must be distinct.');
    const incoming=unit(prev,v), outgoing=unit(v,next);
    const sign=Math.sign(incoming[0]*outgoing[1]-incoming[1]*outgoing[0]);
    if(!sign || Math.abs(incoming[0]*outgoing[0]+incoming[1]*outgoing[1])>1e-6) throw new Error('Only right-angle corners supported.');
    // Each adjacent corner may occupy half of a short straight. A one-cell
    // U-turn therefore retains the normal radius and joins two tangent arcs.
    const r=Math.min(radius,incomingLength*.5,outgoingLength*.5);
    const entry=[v[0]-incoming[0]*r,v[1]-incoming[1]*r], exit=[v[0]+outgoing[0]*r,v[1]+outgoing[1]*r];
    const center=[entry[0]+outgoing[0]*r,entry[1]+outgoing[1]*r];
    return {entry,exit,center,sign,r,angle:Math.atan2(entry[1]-center[1],entry[0]-center[0])};
  });
  const pieces=[]; let total=0;
  for(let i=0;i<corners.length;i++) {
    const c=corners[i], next=corners[(i+1)%corners.length];
    const arc={type:'arc',...c,start:total,length:c.r*Math.PI/2}; total+=arc.length; pieces.push(arc);
    const length=Math.hypot(next.entry[0]-c.exit[0],next.entry[1]-c.exit[1]);
    // Touching arcs have no intervening line. Never normalize a zero vector
    // or leave a zero-duration piece for downstream pose/integral samplers.
    if(length>1e-9){
      const dir=unit(c.exit,next.entry);
      pieces.push({type:'line',a:c.exit,b:next.entry,dir,start:total,length}); total+=length;
    }
  }
  function point(distance) {
    const s=mod(distance,total);
    const p=pieces.find(p=>s<p.start+p.length) || pieces.at(-1);
    const t=s-p.start;
    if(p.type==='line') return {x:p.a[0]+p.dir[0]*t,y:p.a[1]+p.dir[1]*t,angle:Math.atan2(p.dir[1],p.dir[0]),curve:0};
    const a=p.angle+p.sign*t/p.r;
    return {x:p.center[0]+p.r*Math.cos(a),y:p.center[1]+p.r*Math.sin(a),angle:a+p.sign*Math.PI/2,curve:p.sign/p.r};
  }
  return {pieces,total,point};
}
