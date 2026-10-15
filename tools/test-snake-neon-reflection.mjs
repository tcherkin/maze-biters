import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createMazeReflection} from '../src/render/neon-maze-reflection.js';
import {createSnakeNeonReflection,snakeReflectionColor,SNAKE_REFLECTION_COLORS} from '../src/render/snake-neon-reflection.js';
const require=createRequire(import.meta.url);
let native;
try{native=require('@napi-rs/canvas');}catch{
  native=require('C:/Users/tcher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
}
const {createCanvas,loadImage}=native;
const surfaces=[];
function makeCanvas(w,h){
  const c=createCanvas(w,h),events=new Map(),ctx=c.getContext('2d');let lost=false;
  c.addEventListener=(type,f)=>{if(!events.has(type))events.set(type,new Set());events.get(type).add(f);};
  c.removeEventListener=(type,f)=>events.get(type)?.delete(f);
  c.fire=type=>{lost=type==='contextlost';for(const f of events.get(type)||[])f();};
  c.listenerCount=()=>[...events.values()].reduce((n,set)=>n+set.size,0);
  ctx.isContextLost=()=>lost;surfaces.push(c);return c;
}
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
const alpha=(c,x,y)=>c.getContext('2d').getImageData(x,y,1,1).data[3];
const energy=c=>{const p=pixels(c);let total=0;for(let i=3;i<p.length;i+=4)total+=p[i];return total;};
const point=(x,y)=>({length:0,sample(_d,out){out.x=x;out.y=y;return out;}});
const line=(x,y,length)=>({length,sample(d,out){out.x=x+d;out.y=y;return out;}});
const source=g=>({geometry:g,color:'#35e55b'});
const atlas=await loadImage(fileURLToPath(new URL('../assets/atlases/4k/concept-maze-pipes-gradient-160.png',import.meta.url)));
const hdAtlas=await loadImage(fileURLToPath(new URL('../assets/atlases/hd/concept-maze-pipes-gradient-80.png',import.meta.url)));
function artwork(masks,tile,image=atlas,size=160,row=2){return ctx=>{
  for(let y=0;y<masks.length;y++)for(let x=0;x<masks[y].length;x++){
    const mask=masks[y][x];if(mask===null)continue;
    ctx.drawImage(image,mask*size,row*size,size,size,x*tile,y*tile,tile,tile);
  }
};}
const tile=16,size=80;
let grid=Array.from({length:5},()=>Array(5).fill(' '));
let masks=Array.from({length:5},()=>Array(5).fill(null));
grid[2][2]=grid[1][2]=grid[2][3]='#';masks[2][2]=3;masks[1][2]=4;masks[2][3]=8;
const service=createSnakeNeonReflection({width:size,height:size,tile,makeCanvas});
let painter=artwork(masks,tile),calls=0;
const draw=ctx=>{calls++;painter(ctx);};
service.prepare({grid,key:'first',drawWallArtwork:draw});
const still=source(line(16,56,45));
let output=service.render([still]);
assert.ok(energy(output.floor)>0,'Non-dot production corridors receive light');
assert.ok(energy(output.walls)>0,'Native wall artwork receives light');
assert.equal(service.stats().wallStrength,.4);
assert.equal(service.stats().bodyCompositeStrength,.5);
assert.equal(service.stats().innerStrength,.7);
assert.equal(service.stats().light.cachedColors,5,'All five palettes are prewarmed');
assert.equal(snakeReflectionColor('#d66bff'),SNAKE_REFLECTION_COLORS.Pink,'Semantic purple uses native pink light');
assert.equal(snakeReflectionColor('#ff8873'),SNAKE_REFLECTION_COLORS.Orange);
const initialAllocations=surfaces.length,initialReads=service.stats().receiverPixelReads;
for(let i=0;i<50;i++){
  service.prepare({grid,key:'first',drawWallArtwork:draw});
  still.geometry=line(16+i*.05,56,45);output=service.render([still]);
}
assert.equal(calls,1,'Unchanged key never redraws native maze art');
assert.equal(surfaces.length,initialAllocations,'Animation creates no canvas after prepare');
assert.equal(service.stats().receiverPixelReads,initialReads,'Animation reads no receiver pixels');
assert.equal(service.stats().light.pixelReads,0);
service.render(Object.keys(SNAKE_REFLECTION_COLORS).map(palette=>({palette,geometry:point(24,56)})));
assert.equal(surfaces.length,initialAllocations,'Every native palette is already cached before its first gameplay frame');
assert.equal(energy(service.render([]).walls),0,'An empty scene clears previous wall light');

// A transparent atlas cap and all four native 90-degree arcs, at production TILE.
// Measure the curved quadrants rather than only the joining straight arms.
const rotate=(x,y,n)=>{for(let i=0;i<n;i++){const next=size-y;y=x;x=next;}return {x,y};};
for(let rotation=0;rotation<4;rotation++){
  painter=artwork(masks,tile);
  service.prepare({grid,key:`turn-${rotation}`,drawWallArtwork:draw});
  const geometry={length:24,sample(d,out){Object.assign(out,rotate(24,40+d,rotation));return out;}};
  output=service.render([source(geometry)]);
  let arcEnergy=0,arcPixels=0;
  for(let dy=1;dy<=5;dy++)for(let dx=-5;dx<=-1;dx++){
    const p=rotate(40+dx+.5,40+dy+.5,rotation),a=alpha(output.walls,Math.floor(p.x),Math.floor(p.y));
    arcEnergy+=a;if(a>0)arcPixels++;
  }
  assert.ok(arcPixels>=3,`Native curved quadrant ${masks[2][2]} receives light (${arcPixels})`);
  assert.ok(arcEnergy>=8,`Native curved quadrant ${masks[2][2]} is not a dark dead zone (${arcEnergy})`);
  // The receiver is native alpha plus brightness, so no off-art corner square survives.
  const nativeArt=createCanvas(size,size);painter(nativeArt.getContext('2d'));const art=pixels(nativeArt),wall=pixels(output.walls);
  for(let i=0;i<art.length;i+=4){
    if(art[i+3]===0||Math.max(art[i],art[i+1],art[i+2])<30)assert.equal(wall[i+3],0,'Transparent or black native cut-outs stay unlit');
  }
  const nextGrid=Array.from({length:5},()=>Array(5).fill('.')),nextMasks=Array.from({length:5},()=>Array(5).fill(null));
  for(let y=0;y<5;y++)for(let x=0;x<5;x++){
    nextGrid[x][4-y]=grid[y][x];const m=masks[y][x];nextMasks[x][4-y]=m===null?null:((m<<1)&15)|(m>>3);
  }
  grid=nextGrid;masks=nextMasks;
}
const capGrid=['.....','.....','.##..','.....','.....'];
const capMasks=Array.from({length:5},()=>Array(5).fill(null));capMasks[2][1]=2;capMasks[2][2]=8;
painter=artwork(capMasks,tile);service.prepare({grid:capGrid,key:'cap-4k',drawWallArtwork:draw});
const capSource=source({length:24,sample(_d,out){out.x=56;out.y=40;return out;}});
output=service.render([capSource]);
assert.ok(alpha(output.walls,43,40)>0,'The curved nose of a native rounded cap stays lit');
assert.equal(alpha(output.walls,47,33),0,'Rounded cap corner stays transparent, not a square');
for(const [y0,y1] of [[31.95,32.05],[47.95,48.05]]){
  capSource.geometry={length:24,sample(_d,out){out.x=56;out.y=y0;return out;}};
  const a=pixels(service.render([capSource]).walls).slice();
  capSource.geometry={length:24,sample(_d,out){out.x=56;out.y=y1;return out;}};
  const b=pixels(service.render([capSource]).walls);let difference=0,total=0,largest=0;
  for(let i=3;i<a.length;i+=4){difference+=Math.abs(a[i]-b[i]);total+=a[i];largest=Math.max(largest,Math.abs(a[i]-b[i]));}
  assert.ok(difference/total<.14,`Cap cell transition has no abrupt patch (${difference/total})`);
  // Production's 16px world tiles have coarser clip-edge AA than the 36px
  // study. A local <3.2% alpha quantum is acceptable, a tile-sized flash is not.
  assert.ok(largest<=8,`Only a small clip-edge AA change near the cap (${largest}/255)`);
}
const builds=service.stats().receiverBuilds;
painter=artwork(capMasks,tile,hdAtlas,80);service.prepare({grid:capGrid,key:'cap-HD',drawWallArtwork:draw});
assert.equal(service.stats().receiverBuilds,builds+1,'Atlas family change rebuilds receiver even with the same maze');
assert.ok(energy(service.render([source(point(56,40))]).walls)>0,'HD native atlas works without hardcoded 160px crops');

// Independent wall gain and robust first-wall shadowing, using unmasked raw maps.
const raw=createMazeReflection({grid:['#######','#.....#','#######','#.....#','#######'],cell:tile,width:112,height:80,canvasFactory:makeCanvas});
const wallCtx=raw.wallCanvas.getContext('2d'),drawWall=wallCtx.drawImage.bind(wallCtx);let gains=[];
wallCtx.drawImage=(...args)=>{if(wallCtx.globalCompositeOperation==='source-over')gains.push(wallCtx.globalAlpha);return drawWall(...args);};
raw.render([source(line(24,24,60))],.7,{wallStrength:.5});const floorHalf=pixels(raw.canvas).slice(),wallHalf=energy(raw.wallCanvas);
const halfGains=gains;gains=[];
raw.render([source(line(24,24,60))],.7,{wallStrength:.25});const wallQuarter=energy(raw.wallCanvas);
assert.deepEqual(pixels(raw.canvas),floorHalf,'Reducing wall gain never changes floor brightness');
assert.equal(gains.length,halfGains.length);
for(let i=0;i<gains.length;i++)assert.ok(Math.abs(gains[i]-halfGains[i]/2)<=1/255,'Every wall stamp receives half its former gain, within the native context 8-bit alpha precision');
// Final 8-bit alpha is quantized and overlapping source-over stamps are nonlinear.
assert.ok(wallQuarter/wallHalf>.4&&wallQuarter/wallHalf<.65,`Wall energy decreases independently (${wallQuarter/wallHalf})`);
assert.equal(alpha(raw.wallCanvas,48,47),0,'Light cannot reach the opposite face through a solid wall');
assert.equal(alpha(raw.wallCanvas,48,56),0,'No light appears in the corridor behind a solid wall');
assert.equal(alpha(raw.wallCanvas,48,24),0,'Wall-only map contains no floor wash');
const rawBefore=pixels(raw.wallCanvas).slice();raw.reset();raw.render([source(line(24,24,60))],.7,{wallStrength:.25});
assert.deepEqual(pixels(raw.wallCanvas),rawBefore,'Explicit reset restores identical cached kernel pixels');

// Restore each owned surface: receiver, output maps, wall mask and ten colour kernels.
const stableSource=source(point(56,40));const expected=service.render([stableSource]);
const expectedFloor=pixels(expected.floor).slice(),expectedWalls=pixels(expected.walls).slice();
const living=surfaces.filter(c=>c.width>1&&c.height>1&&c!==raw.canvas&&c!==raw.wallCanvas);
const allocatedBeforeRecovery=surfaces.length;
for(const c of living){
  c.fire('contextlost');const missing=service.render([stableSource]);
  // Raw fixtures unrelated to this service need not suppress its output.
  if(c===surfaces[0])assert.equal(missing.walls,null,'Lost receiver suppresses optional effect, not gameplay');
  c.width=c.width;c.fire('contextrestored');
  const restored=service.render([stableSource]);
  assert.deepEqual(pixels(restored.floor),expectedFloor,'A context restore keeps floor reflection exact');
  assert.deepEqual(pixels(restored.walls),expectedWalls,'A context restore rebuilds native receiver and cached light');
}
assert.equal(surfaces.length,allocatedBeforeRecovery,'Context restoration reuses existing canvases');
const active=surfaces.filter(c=>c.width>1&&c.height>1);
for(const c of active){c.width=1;service.render([stableSource]);}
const resized=service.render([stableSource]);
assert.deepEqual(pixels(resized.floor),expectedFloor,'Unexpected backing-size loss is repaired without changing geometry');
assert.deepEqual(pixels(resized.walls),expectedWalls,'Receiver resize rebuilds exact native artwork');
assert.equal(surfaces.length,allocatedBeforeRecovery,'Resize recovery allocates no new canvas');
const beforeReset=service.stats().receiverPixelReads;service.reset();service.render([stableSource]);
assert.equal(service.stats().receiverPixelReads,beforeReset+1,'Explicit adapter reset repaints receiver once');
assert.deepEqual(pixels(service.render([stableSource]).walls),expectedWalls);

service.dispose();raw.dispose();
assert.equal(service.render([stableSource]).walls,null,'Disposed renderer cannot revive itself');
assert.equal(service.stats().receiverBytes,0);
assert.equal(raw.stats().cachedBytes,0);
assert.ok(surfaces.every(c=>c.width===1&&c.height===1),'All old level/colour surfaces are released');
assert.ok(surfaces.every(c=>c.listenerCount()===0),'Disposed caches retain no context listeners');
console.log('Snake neon reflection: native 90° arcs/caps, transparent cut-outs, HD/4K artwork, non-dot floors, quarter wall gain, occlusion, no runtime allocations/reads, context/resize recovery and disposal passed.');
