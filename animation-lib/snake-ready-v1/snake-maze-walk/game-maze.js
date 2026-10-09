// Isolated fixture, using the real 2D game's unmodified wall bitmap and
// wall-neighbour bit convention. The topology is a small test maze, not a
// production level export and not live game AI/collision logic.
// Artwork source: assets/atlases/4k/concept-maze-pipes-gradient-160.png.
// Painter adapted from src/engine/game.js: mazeBorderMask,
// mergedMazeBoundaryMasks, fillMergedMazeTerritories, renderMazeFloorBackdrop.
export const CELL=36;
export const WORLD_WIDTH=21*CELL,WORLD_HEIGHT=15*CELL;
export const GAME_BODY_DIAMETER=57/160*CELL;
export const MAZE_ATLAS_URL='./assets/game-maze-pipes.png';
const COLUMNS=21,ROWS=15,HUE=248,PALETTE_ROW=2,SPRITE_SIZE=160;
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
const WALL_STEPS=[
  {dx:0,dy:-1,bit:1,opposite:4},{dx:1,dy:0,bit:2,opposite:8},
  {dx:0,dy:1,bit:4,opposite:1},{dx:-1,dy:0,bit:8,opposite:2}
];
const isWall=(x,y)=>LEVEL_GRID[y]?.[x]==='#';
const solidBlocks=Array.from({length:ROWS-1},(_,y)=>
  Array.from({length:COLUMNS-1},(_,x)=>
    isWall(x,y)&&isWall(x+1,y)&&isWall(x,y+1)&&isWall(x+1,y+1)));
const blockAt=(x,y)=>!!solidBlocks[y]?.[x];
const territory=Array.from({length:ROWS},(_,y)=>
  Array.from({length:COLUMNS},(_,x)=>isWall(x,y)&&(
    blockAt(x,y)||blockAt(x-1,y)||blockAt(x,y-1)||blockAt(x-1,y-1))));

function boundaryMasks(){
  const masks=Array.from({length:ROWS},()=>Array(COLUMNS).fill(null));
  const connect=(x,y,nx,ny)=>{
    const step=WALL_STEPS.find(s=>s.dx===nx-x&&s.dy===ny-y);
    if(!step)return;
    masks[y][x]=(masks[y][x]??0)|step.bit;
    masks[ny][nx]=(masks[ny][nx]??0)|step.opposite;
  };
  for(let y=0;y<ROWS-1;y++)for(let x=0;x<COLUMNS-1;x++){
    if(!blockAt(x,y))continue;
    if(!blockAt(x,y-1))connect(x,y,x+1,y);
    if(!blockAt(x+1,y))connect(x+1,y,x+1,y+1);
    if(!blockAt(x,y+1))connect(x+1,y+1,x,y+1);
    if(!blockAt(x-1,y))connect(x,y+1,x,y);
  }
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLUMNS;x++){
    if(!isWall(x,y)||territory[y][x])continue;
    masks[y][x]??=0;
    for(const s of WALL_STEPS){
      const nx=x+s.dx,ny=y+s.dy;
      if(!isWall(nx,ny))continue;
      if(s.dx===1||s.dy===1||territory[ny][nx])connect(x,y,nx,ny);
    }
  }
  return Object.freeze(masks.map(row=>Object.freeze(row)));
}
export const WALL_MASKS=boundaryMasks();

function floor(c){
  const w=WORLD_WIDTH,h=WORLD_HEIGHT;
  const depth=c.createRadialGradient(w*.5,h*.43,CELL*1.5,w*.5,h*.48,Math.max(w,h)*.72);
  depth.addColorStop(0,`hsl(${HUE},58%,4.8%)`);
  depth.addColorStop(.58,`hsl(${HUE},54%,3%)`);
  depth.addColorStop(1,`hsl(${HUE},48%,1.2%)`);
  c.fillStyle=depth;c.fillRect(0,0,w,h);
  const drift=c.createLinearGradient(0,h,w,0);
  drift.addColorStop(0,`hsla(${HUE},78%,28%,0)`);
  drift.addColorStop(.52,`hsla(${HUE},78%,28%,.035)`);
  drift.addColorStop(1,`hsla(${HUE},78%,28%,0)`);
  c.fillStyle=drift;c.fillRect(0,0,w,h);
  c.save();c.beginPath();
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLUMNS;x++){
    if(isWall(x,y))continue;
    const cx=(x+.5)*CELL,cy=(y+.5)*CELL;
    if(x+1<COLUMNS&&!isWall(x+1,y)){c.moveTo(cx,cy);c.lineTo(cx+CELL,cy);}
    if(y+1<ROWS&&!isWall(x,y+1)){c.moveTo(cx,cy);c.lineTo(cx,cy+CELL);}
  }
  c.lineCap='round';c.lineJoin='round';
  for(const [width,color] of [
    [15,`hsla(${HUE},88%,11.2%,.72)`],[11,`hsla(${HUE},84%,7.7%,.78)`],
    [7,`hsla(${HUE},72%,4.55%,.86)`],[3,`hsla(${HUE},56%,1.75%,.94)`],
    [.9,'rgba(0,0,0,.98)']
  ]){c.lineWidth=width*CELL/16;c.strokeStyle=color;c.stroke();}
  c.restore();
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLUMNS;x++){
    if(isWall(x,y))continue;
    const hash=(x*73+y*151+HUE*7)>>>0;
    if(hash%6!==0)continue;
    c.fillStyle=`hsla(${HUE},78%,70%,${.09+((hash>>>8)%4)*.018})`;
    c.fillRect((x+(3+hash%10)/16)*CELL,(y+(3+((hash>>>4)%10))/16)*CELL,CELL/16,CELL/16);
  }
}

function fillTerritories(c){
  // Same connected-block boundaries as the production maze. Empty inner
  // cells are filled once, rather than covered in spurious crossing pipes.
  const overlap=3*CELL/16;
  c.save();c.beginPath();
  for(let y=0;y<ROWS-1;y++)for(let x=0;x<COLUMNS-1;x++){
    if(blockAt(x,y))c.rect((x+.5)*CELL-overlap,(y+.5)*CELL-overlap,
      CELL+overlap*2,CELL+overlap*2);
  }
  c.fillStyle=`hsl(${HUE},48%,1.1%)`;c.fill();c.clip();
  c.beginPath();
  for(let y=0;y<ROWS-1;y++)for(let x=0;x<COLUMNS-1;x++){
    if(!blockAt(x,y))continue;
    const l=(x+.5)*CELL-overlap,t=(y+.5)*CELL-overlap;
    const r=(x+1.5)*CELL+overlap,b=(y+1.5)*CELL+overlap;
    if(!blockAt(x,y-1)){c.moveTo(l,t);c.lineTo(r,t);}
    if(!blockAt(x+1,y)){c.moveTo(r,t);c.lineTo(r,b);}
    if(!blockAt(x,y+1)){c.moveTo(r,b);c.lineTo(l,b);}
    if(!blockAt(x-1,y)){c.moveTo(l,b);c.lineTo(l,t);}
  }
  c.lineCap='square';c.lineJoin='miter';
  for(let i=0;i<32;i++){
    const t=i/31;
    c.lineWidth=CELL*(1.1*(1-t)+.025*t);
    c.strokeStyle=`hsl(${HUE},${58+10*t}%,${2.2+12.8*t}%)`;c.stroke();
  }
  c.restore();
}

export function drawGameMaze(c,atlas){
  if(!atlas||!(atlas.naturalWidth||atlas.width))throw new Error('Game maze atlas has not loaded');
  c.save();
  c.globalAlpha=1;c.globalCompositeOperation='source-over';
  floor(c);fillTerritories(c);
  c.filter='brightness(78%) contrast(120%)';
  c.imageSmoothingEnabled=true;
  if('imageSmoothingQuality' in c)c.imageSmoothingQuality='high';
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLUMNS;x++){
    const mask=WALL_MASKS[y][x];
    if(mask===null)continue;
    c.drawImage(atlas,mask*SPRITE_SIZE,PALETTE_ROW*SPRITE_SIZE,SPRITE_SIZE,SPRITE_SIZE,
      x*CELL,y*CELL,CELL,CELL);
  }
  c.restore();
}

// A study-only blocker across the upper corridor. The route itself remains
// unchanged; a bounded shuttle clock stops before this obstacle. Cache once.
export function drawRetreatWall(c,atlas){
  c.save();c.globalAlpha=1;c.globalCompositeOperation='source-over';
  c.filter='brightness(78%) contrast(120%)';
  c.imageSmoothingEnabled=true;
  if('imageSmoothingQuality' in c)c.imageSmoothingQuality='high';
  for(const [y,mask] of [[1,WALL_MASKS[1][17]|4],[2,5],[3,WALL_MASKS[3][17]|1]]){
    // Replace the old tile, not alpha-stack two junctions. Supply the dark
    // background underneath the transparent luminous pipe artwork.
    c.clearRect(17*CELL,y*CELL,CELL,CELL);
    c.fillStyle=`hsl(${HUE},48%,1.1%)`;c.fillRect(17*CELL,y*CELL,CELL,CELL);
    c.drawImage(atlas,mask*SPRITE_SIZE,PALETTE_ROW*SPRITE_SIZE,SPRITE_SIZE,SPRITE_SIZE,
      17*CELL,y*CELL,CELL,CELL);
  }
  c.restore();
}
