import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let native;
for(const p of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',
  join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{native=require(p);break;}catch{}
}
if(!native)throw Error('Native Canvas required');
const {createCanvas}=native;
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
// Frozen pre-optimization compositor travels with this test; no external
// workspace snapshot or command-line argument is needed for the default run.
const baseline=option('--baseline')||fileURLToPath(new URL('./baseline/snake-neon-v1.02.06.00.js',import.meta.url));
const current=new URL('../src/render/snake-neon.js',import.meta.url);
const renderRoot=new URL('../src/render/',import.meta.url);
async function factory(file,sameDependencies=false){
  const url=typeof file==='string'?pathToFileURL(resolve(file)):file;
  let code=await readFile(url,'utf8');
  code=code.replace(/from '(\.\/[^']+)'/g,(_all,p)=>'from '+JSON.stringify(new URL(p,sameDependencies?renderRoot:url).href));
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
// Compositor oracle uses identical material/reflection services, so strict
// pixel bounds measure only sparse capture/projection. Reflection has its own
// independent old/new equivalence suite.
const base=await factory(baseline,true),sparse=await factory(current);
// Wall strength was explicitly raised after this frozen compositor baseline.
assert.equal(base.SNAKE_NEON.walls,.25);
assert.deepEqual(sparse.SNAKE_NEON,{...base.SNAKE_NEON,walls:.4});
const width=256,height=160,tile=16;
const grid=Array.from({length:10},(_,y)=>y===2||y===6?'#..............#':'################');
const art=createCanvas(160,57),ac=art.getContext('2d');
const gradient=ac.createLinearGradient(0,0,0,57);
gradient.addColorStop(0,'#15320b');gradient.addColorStop(.36,'#cbff28');gradient.addColorStop(1,'#20550f');
ac.fillStyle=gradient;ac.fillRect(0,0,160,57);
const known=[art],collisionArt={image:art};
const geometry=(x,y=40,angle=0)=>({length:40,head:{x,y,angle,alpha:1,span:0,
  sprite:{dx:0,dy:-8,sw:160,sh:57,dw:45,dh:16}},
  sample(d,out={}){out.x=this.head.x+d;out.y=this.head.y;return out;}});
const geometries=[geometry(30),geometry(32),geometry(48.05),geometry(112,63.9,.2),geometry(235),geometry(-400)];
const entities=geometries.map((_,i)=>({color:'Green',brainAggression:.85-i*.08}));
let currentGeometry;
const snake={getNeonSources:()=>known,getWorldGeometry:()=>currentGeometry,getCollisionArt:()=>collisionArt};
const dusk=createCanvas(width,height),dc=dusk.getContext('2d');
dc.fillStyle='rgba(0,0,0,.8)';dc.fillRect(0,0,width,height);
const wallPainter=c=>{c.fillStyle='#5430de';for(let y=0;y<10;y++)for(let x=0;x<16;x++)
  if(grid[y][x]==='#')c.fillRect(x*tile+4,y*tile+4,8,8);return true;};
function scene(factory,scale){
  const canvases=[];
  const makeCanvas=(w,h)=>{
    const c=createCanvas(w,h),events=new Map();let lost=false;
    c.getContext('2d').isContextLost=()=>lost;
    c.addEventListener=(type,fn)=>{if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);};
    c.removeEventListener=(type,fn)=>events.get(type)?.delete(fn);
    c.testLost=value=>{lost=value;for(const fn of events.get(value?'contextlost':'contextrestored')||[])fn();};
    canvases.push(c);return c;
  };
  const canvas=createCanvas(width*scale,height*scale),context=canvas.getContext('2d');
  return {canvas,context,canvases,scale,service:factory({width,height,tile,makeCanvas,snake})};
}
const first={left:29.1,top:35.9,right:55.2,bottom:48.1};
const second={left:108.2,top:55,right:131.3,bottom:70.8};
function bounds(n,b){if(n.setForegroundBounds)n.setForegroundBounds(b);else n.flushOcclusion();}
function draw(s,camera,time,{maskBounds=first,late=true,initialBounds=[]}={}){
  const {context:c,canvas,service:n,scale}=s;
  c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';
  c.fillStyle='#071018';c.fillRect(0,0,canvas.width,canvas.height);
  c.setTransform(scale,0,0,scale,0,0);c.translate(width/2,height/2);c.scale(camera.zoom,camera.zoom);c.translate(-camera.x,-camera.y);
  const view={left:camera.x-width/2/camera.zoom,top:camera.y-height/2/camera.zoom,
    right:camera.x+width/2/camera.zoom,bottom:camera.y+height/2/camera.zoom};
  assert.equal(n.beginFrame(c,{grid,key:'maze',drawWallArtwork:wallPainter,time,foregroundBounds:initialBounds,viewport:view}),true);
  // The initial [] batch contributes to actors but predates all emissions.
  const pre=n.actorsContext();pre.fillStyle='#946226';pre.fillRect(45.2,40,3,4);
  n.flushOcclusion();
  for(let i=0;i<entities.length;i++){
    const g=geometries[i];n.snakeContext().drawImage(art,g.head.x,g.head.y-5,40,10);
    currentGeometry=g;n.noteSnake(entities[i],{geometry:g});
  }
  bounds(n,maskBounds==='fallback'?undefined:maskBounds);
  const a=n.actorsContext();a.fillStyle='#db461f';a.fillRect(first.left,first.top,first.right-first.left,first.bottom-first.top);
  bounds(n,second);
  if(late)n.snakeContext().drawImage(art,142,0,18,57,35.5,40,5,3);
  const b=n.actorsContext();b.fillStyle='rgba(70,130,210,.7)';
  b.fillRect(second.left,second.top,second.right-second.left,second.bottom-second.top);
  n.flushOcclusion();n.flushOcclusion(); // Duplicate flush must do no raster work.
  c.setTransform(scale,0,0,scale,0,0);assert.equal(n.present(c,dusk,camera),true);
  assert.equal(n.diagnostics().errors.length,0);
  return c.getImageData(0,0,canvas.width,canvas.height).data;
}
let comparisons=0,maxDifference=0,nonzeroFrames=0,totalChanged=0;
function compare(a,b,label){
  let largest=0,changed=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);largest=Math.max(largest,d);if(d)changed++;}
  maxDifference=Math.max(maxDifference,largest);totalChanged+=changed;
  assert.ok(largest<=1,label+': channel difference '+largest);comparisons++;
}
for(const scale of [1,1.5,2,3])for(const camera of [
  {x:128,y:80,zoom:.75},{x:128,y:80,zoom:1},{x:71.7,y:48.3,zoom:1.8},
  {x:120.3,y:70.1,zoom:2.15},{x:105,y:50,zoom:2}
]){
  const a=scene(base.createSnakeNeon,scale),b=scene(sparse.createSnakeNeon,scale);
  for(const t of [0,35,70,120,240,450,700,1000]){
    compare(draw(a,camera,t),draw(b,camera,t),'World-raster sparse eye/foreground parity');
    if(b.service.diagnostics().eyeTileCount)nonzeroFrames++;
  }
  assert.equal(b.service.diagnostics().eyes.events,a.service.diagnostics().eyes.events,'Native schedules preserved');
  assert.ok(b.service.diagnostics().foregroundCrop.capacityWidth<width,'Bounded batches stay small');
  const actual=b.canvases.reduce((n,c)=>n+c.width*c.height*4,0);
  assert.equal(b.service.diagnostics().retainedBytes,actual,'All retained backing stores counted');
}
assert.ok(nonzeroFrames>0,'Real native pulses tested');
const camera={x:128,y:80,zoom:1.8},a=scene(base.createSnakeNeon,3),b=scene(sparse.createSnakeNeon,3);
for(const bound of ['fallback',{},[first],{minX:first.left,minY:first.top,maxX:first.right,maxY:first.bottom}]){
  compare(draw(a,camera,1300,{maskBounds:bound}),draw(b,camera,1300,{maskBounds:bound}),'Fallback/union bounds');
}
assert.ok(b.service.diagnostics().fallbackBytes>4,'Fallback actually allocated');
geometries[5].head.x=55;
for(let t=1400;t<2400;t+=100)compare(draw(a,camera,t),draw(b,camera,t),'Culled-to-visible eye scheduling');
const allocated=b.canvases.length;
for(let i=0;i<125;i++){
  const time=2400+i*16;
  compare(draw(a,camera,time),draw(b,camera,time),'Reuse after quiet frames/fallback');
}
assert.equal(b.canvases.length,allocated,'Warm pool does not allocate per frame');
assert.equal(b.service.diagnostics().fallbackBytes,4,'Idle full fallback reclaimed');
for(const layer of [b.canvases[1],b.canvases[2]]){
  layer.testLost(true);
  assert.equal(b.service.beginFrame(b.context,{grid,key:'maze',drawWallArtwork:wallPainter,time:4500,foregroundBounds:[]}),false);
  layer.testLost(false);
  compare(draw(a,camera,4550),draw(b,camera,4550),'Restored sparse context');
}
a.scale=b.scale=2;a.canvas.width=b.canvas.width=width*2;a.canvas.height=b.canvas.height=height*2;
for(let i=0;i<20;i++){
  geometries[2].head.angle=i*.18;geometries[2].head.x=48+i*.31;
  const moving={x:100+i*.17,y:50+i*.04,zoom:1.8+i*.002};
  compare(draw(a,moving,4700+i*30),draw(b,moving,4700+i*30),'Resized/camera-shifted rotating tile seam');
}
assert.equal(b.service.diagnostics().retainedBytes,b.canvases.reduce((n,c)=>n+c.width*c.height*4,0));
console.log(JSON.stringify({ok:true,comparisons,maxDifference,totalChanged,nonzeroFrames,
  nativeSchedule:true,drawOrder:true,fallbackReclaimed:true,retainedBytesCounted:true,poolStable:true,recovery:true}));
