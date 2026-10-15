import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js?v=1.02.05.00';
import {createSnakeNeon,SNAKE_NEON} from '../src/render/snake-neon.js?v=1.02.05.00';
import '../src/render/dusk-lighting.js?v=1.02.05.00';

const require=createRequire(import.meta.url);
let native;
for(const location of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',
  join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{native=require(location);break;}catch{}
}
if(!native)throw Error('Native Canvas required; set CODEX_CANVAS_PACKAGE.');
const {createCanvas,Image,loadImage}=native;
const W=288,H=192,TILE=16,DPR=2;
const tracked=[];
function makeCanvas(width,height){
  const canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),listeners=new Map();let lost=false;
  canvas.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);};
  canvas.removeEventListener=(type,fn)=>listeners.get(type)?.delete(fn);
  canvas.fire=type=>{lost=type==='contextlost';for(const fn of listeners.get(type)||[])fn();};
  ctx.isContextLost=()=>lost;tracked.push(canvas);return canvas;
}
const savedDocument=globalThis.document,savedImage=globalThis.Image,savedRandom=Math.random;
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return makeCanvas(1,1);}};
// Only the test decoder removes ancillary C2PA metadata rejected by bundled
// Skia. The authored PNGs and all IHDR/IDAT pixel bytes remain unchanged.
function nativePng(url){
  const bytes=readFileSync(fileURLToPath(url)),chunks=[bytes.subarray(0,8)];
  for(let p=8;p<bytes.length;){const length=bytes.readUInt32BE(p);
    if(bytes.toString('ascii',p+4,p+8)!=='caBX')chunks.push(bytes.subarray(p,p+length+12));p+=length+12;}
  return Buffer.concat(chunks);
}
globalThis.Image=class extends Image{set src(value){super.src=nativePng(value);}};
const pixels=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
const pixel=(canvas,x,y)=>[...canvas.getContext('2d').getImageData(Math.floor(x),Math.floor(y),1,1).data];
const rgbSum=value=>value[0]+value[1]+value[2];
const camera1={x:W/2,y:H/2,zoom:1};
const camera2={x:152,y:104,zoom:2};
const cameraPan={x:130,y:98,zoom:2};
const screen=(camera,x,y)=>({x:(x-camera.x+W/(2*camera.zoom))*camera.zoom*DPR,
  y:(y-camera.y+H/(2*camera.zoom))*camera.zoom*DPR});
const setWorld=(ctx,camera)=>ctx.setTransform(DPR*camera.zoom,0,0,DPR*camera.zoom,
  DPR*(W/2-camera.x*camera.zoom),DPR*(H/2-camera.y*camera.zoom));
const snake=(color='#35e55b',length=6)=>({body:Array.from({length},(_,i)=>({x:11-i,y:6})),
  dir:{x:1,y:0},reversing:false,color,brainAggression:0,anger:2,threatByPlayer:{1:3}});
const grid=Array.from({length:H/TILE},(_,y)=>Array.from({length:W/TILE},(_,x)=>
  x===0||y===0||x===W/TILE-1||y===H/TILE-1||y===4&&x>=4&&x<=13?'#':'.').join(''));
const atlas=await loadImage(fileURLToPath(new URL('../assets/atlases/4k/concept-maze-pipes-gradient-160.png',import.meta.url)));
let wallDraws=0;
const drawWalls=ctx=>{wallDraws++;for(let y=0;y<grid.length;y++)for(let x=0;x<grid[y].length;x++)if(grid[y][x]==='#')
  ctx.drawImage(atlas,10*160,2*160,160,160,x*TILE,y*TILE,TILE,TILE);};
const service=createLiveSnakeRenderer({tile:TILE});
const createdAt=tracked.length;
const neon=createSnakeNeon({width:W,height:H,tile:TILE,makeCanvas,snake:service});
const receiver=tracked[createdAt],emission=tracked[createdAt+1];
const dusk=globalThis.MazeBitersDuskLighting.create({width:W,height:H,tile:TILE,
  positionFor:(p,_t,out)=>Object.assign(out,{x:p.x,y:p.y}),isPowered:()=>false});
const lamp={x:8,y:6,dir:{x:1,y:0}};
let assertions=0;
function render({entity=snake(),camera=camera1,enabled=true,time=0,roster=[],actor=null,
  ghost=null,freeze=false,note=true,key='maze',painter=drawWalls,beforeSnake=null,beforePresent=null}={}){
  const canvas=createCanvas(W*DPR,H*DPR),ctx=canvas.getContext('2d');
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#0b1018';ctx.fillRect(0,0,W,H);
  setWorld(ctx,camera);drawWalls(ctx);
  const begin=enabled&&neon.beginFrame(ctx,{grid,key,drawWallArtwork:painter,time});
  if(begin)beforeSnake?.(neon.snakeContext());
  if(entity){assert.equal(service.draw(begin?neon.snakeContext():ctx,entity,time,{freeze}),true);
    if(begin&&note)neon.noteSnake(entity,{freeze});}
  const paintActor=()=>{const c=begin?neon.actorsContext():ctx;c.fillStyle='#e63d42';c.fillRect(110,88,66,32);};
  if(actor==='before')paintActor();
  if(ghost){if(begin)neon.flushOcclusion();service.drawGhosts(begin?neon.snakeContext():ctx,time);}
  if(actor==='after')paintActor();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  assert.equal(dusk.render(ctx,roster,camera,time,time),true);
  beforePresent?.(ctx);
  const state={matrix:ctx.getTransform().toJSON(),alpha:ctx.globalAlpha,op:ctx.globalCompositeOperation,filter:ctx.filter};
  const presented=enabled&&neon.present(ctx,dusk.getMask(),camera);
  assert.deepEqual({matrix:ctx.getTransform().toJSON(),alpha:ctx.globalAlpha,op:ctx.globalCompositeOperation,filter:ctx.filter},state);
  assertions++;return {canvas,ctx,begin,presented};
}
try{
  assert.equal(neon.warmup(),false,'No partial palette can enable enhancement');
  assert.equal(await service.prepare(),service);assert.equal(service.stats().ready,true);dusk.prepare();
  assert.equal(neon.warmup(),true);
  assert.equal(service.getNeonSources().length,10,'Five native mouth/material pairs; no mutable scratch source');
  for(const source of service.getNeonSources())assert.ok(
    source.width===1008&&source.height===968||source.width===480&&source.height===74,
    'Only the static head atlas and prepared body texture are prewarmed');
  const warm=neon.diagnostics().material;
  assert.equal(warm.pixelReads,10);assert.equal(warm.cachedSprites,10);
  assert.deepEqual(SNAKE_NEON,{inner:.7,halo:.38,body:.5,walls:.4,emission:.78});
  // Visual rendering must never consume the simulation PRNG or mutate bodies,
  // AI aggression, threats, direction, cell positions or movement flags.
  Math.random=()=>{throw Error('Visual integration consumed gameplay RNG');};
  for(const color of ['#35e55b','#ffe57a','#66c2ff','#d66bff','#ff8873']){
    const entity=snake(color),before=JSON.stringify(entity);
    for(const camera of [camera1,camera2,cameraPan]){
      const plain=render({entity,camera,enabled:false}),lit=render({entity,camera});
      assert.equal(lit.presented,true,JSON.stringify(neon.diagnostics().errors));assert.equal(JSON.stringify(entity),before);
      const p=screen(camera,140,104),a=pixel(plain.canvas,p.x,p.y),b=pixel(lit.canvas,p.x,p.y);
      assert.ok(rgbSum(b)>rgbSum(a)+10,`${color} interior glow registered at zoom ${camera.zoom}: ${a} -> ${b}`);
      const outside=screen(camera,65,35);
      if(outside.x>=0&&outside.y>=0&&outside.x<W*DPR&&outside.y<H*DPR)
        assert.deepEqual(pixel(lit.canvas,outside.x,outside.y),pixel(plain.canvas,outside.x,outside.y),'No global fog/overhead wash');
    }
  }
  assert.equal(neon.diagnostics().material.pixelReads,warm.pixelReads,'Warm animation performs no source readback');
  assert.equal(neon.diagnostics().reflection.receiverPixelReads,1,'Maze receiver is cached across camera pans');
  assert.equal(neon.diagnostics().fog,false);assert.equal(neon.diagnostics().overheadLights,false);

  // Source geometry and native palette capture also stay coherent through a
  // committed corner and its reverse traversal, including the one/two-cell cases.
  for(const length of [1,2,6]){
    const entity=snake('#66c2ff',length);service.draw(createCanvas(W,H).getContext('2d'),entity,0);
    const initial=entity.body.map(p=>({...p}));
    entity.body=[{x:11,y:7},...entity.body.slice(0,-1)];entity.dir={x:0,y:1};
    service.recordStep(entity,{oldBody:initial,t:0,duration:218,wasReversing:false});
    for(const time of [0,40,110,170,218]){
      const state=JSON.stringify(entity),lit=render({entity,time,camera:camera2});
      assert.equal(lit.presented,true);assert.equal(JSON.stringify(entity),state);
      const g=service.getWorldGeometry(entity,time);
      assert.ok([g.head.x,g.head.y,g.head.angle,g.tail.x,g.tail.y].every(Number.isFinite));
    }
    const previous=entity.body.map(p=>({...p})),tail=entity.body.at(-1);
    entity.body=[...entity.body.slice(1),{x:tail.x-(length>1?1:0),y:tail.y-(length===1?1:0)}];entity.reversing=true;
    service.recordStep(entity,{oldBody:previous,t:218,duration:436,wasReversing:false});
    for(const time of [218,300,430,570,654])assert.equal(render({entity,time,camera:cameraPan}).presented,true);
    assert.equal(service.inspect(entity,430).backwards,true);
  }

  // DUSK is already viewport-projected; the new emission must use that exact
  // mask, not project it twice when zooming or moving the camera while paused.
  for(const camera of [camera1,camera2,cameraPan]){
    render({camera,roster:[lamp],time:0});
    const p=screen(camera,(lamp.x+.5)*TILE,(lamp.y+.5)*TILE),mask=dusk.getMask();
    assert.ok(pixel(mask,p.x/DPR,p.y/DPR)[3]<3,'Existing flashlight remains clear under camera projection');
    const darkPlain=render({camera,enabled:false}),darkLit=render({camera});
    const beamPlain=render({camera,enabled:false,roster:[lamp]}),beamLit=render({camera,roster:[lamp]});
    const q=screen(camera,140,104);
    const darkGain=rgbSum(pixel(darkLit.canvas,q.x,q.y))-rgbSum(pixel(darkPlain.canvas,q.x,q.y));
    const beamGain=rgbSum(pixel(beamLit.canvas,q.x,q.y))-rgbSum(pixel(beamPlain.canvas,q.x,q.y));
    assert.ok(darkGain>beamGain+15,`Emission contributes more in darkness (${darkGain}) than in beam (${beamGain})`);
  }

  // Later opaque actors cover both emissive body pixels and floor reflections.
  for(const camera of [camera1,camera2,cameraPan]){
    const plain=render({camera,enabled:false,actor:'after'}),lit=render({camera,actor:'after'});
    const p=screen(camera,140,104);
    assert.deepEqual(pixel(lit.canvas,p.x,p.y),pixel(plain.canvas,p.x,p.y),'Neon cannot show through an opaque player/scorpion');
  }

  // Real swallowed-head render (not an arbitrary proxy rectangle). A ghost
  // remains above an earlier actor, but below a later player mouth.
  service.reset();
  const ghost=snake('#35e55b',1);ghost.body[0]={x:8,y:6};
  const token=service.capture(ghost,0);
  service.consume(ghost,token,{t:0,player:{x:8,y:6,dir:{x:1,y:0},moveDuration:0},duration:400});
  const ghostPlain=render({entity:null,enabled:false,actor:'before',ghost:true,time:30});
  const ghostLit=render({entity:null,actor:'before',ghost:true,time:30});
  const before=pixels(ghostPlain.canvas),after=pixels(ghostLit.canvas);let ghostGain=0;
  for(let y=92*DPR;y<115*DPR;y++)for(let x=118*DPR;x<169*DPR;x++){
    const i=(y*ghostLit.canvas.width+x)*4;ghostGain+=Math.max(0,after[i]+after[i+1]+after[i+2]-before[i]-before[i+1]-before[i+2]);}
  assert.ok(ghostGain>100,'Accepted swallowed-head source emits above an earlier actor');
  const coveredPlain=render({entity:null,enabled:false,actor:'after',ghost:true,time:30});
  const coveredLit=render({entity:null,actor:'after',ghost:true,time:30});
  assert.deepEqual(pixel(coveredLit.canvas,140*DPR,104*DPR),pixel(coveredPlain.canvas,140*DPR,104*DPR),'Later player mouth occludes swallowed head emission');

  // Frozen death/clear frames use the last actually painted pose for both the
  // source sprite and all light/eye anchors, not the advancing game clock.
  service.reset();const moving=snake();moving.brainAggression=.7;
  const oldBody=moving.body.map(p=>({...p}));service.draw(createCanvas(W,H).getContext('2d'),moving,0);
  moving.body=moving.body.map(p=>({x:p.x+1,y:p.y}));
  service.recordStep(moving,{oldBody,t:100,duration:218,wasReversing:false});
  render({entity:moving,time:180});const exact=service.getWorldGeometry(moving,180);
  const stateBefore=JSON.stringify(moving);
  render({entity:moving,time:380,freeze:true});const frozen=service.getWorldGeometry(moving,380,{freeze:true});
  assert.equal(frozen.renderTime,180);assert.equal(frozen.head.x,exact.head.x);assert.equal(frozen.head.angle,exact.head.angle);
  assert.equal(neon.diagnostics().eyes.lastGameTime,180);assert.equal(JSON.stringify(moving),stateBefore);
  assert.equal(service.getWorldGeometry(moving,999,{freeze:155}).renderTime,155);

  // Losing only optional capture buffers must leave the production sprite
  // renderer usable, and restoration must clear/repopulate those buffers.
  emission.fire('contextlost');const fallback=render({entity:snake(),time:400});
  assert.equal(fallback.begin,false);assert.equal(fallback.presented,false);assert.equal(service.stats().ready,true);
  emission.fire('contextrestored');assert.equal(render({time:420}).presented,true);
  receiver.fire('contextlost');assert.equal(render({time:440}).begin,false);
  receiver.fire('contextrestored');assert.equal(render({time:460}).presented,true);

  // Failure in secondary capture must not bubble into drawSnakeEntity and
  // invalidate all source palettes. The incomplete light pass is omitted.
  const capture=emission.getContext('2d'),transform=capture.transform;
  let failCapture=true;
  capture.transform=(...args)=>{if(failCapture)throw Error('injected optional secondary failure');return transform.apply(capture,args);};
  const secondaryFailure=render({time:480,beforeSnake:ctx=>ctx.transform(1,0,0,1,0,0)});
  failCapture=false;
  assert.equal(service.stats().ready,true);assert.equal(secondaryFailure.presented,false);
  assert.equal(render({time:500}).presented,true,'A fresh capture proxy recovers the following frame');

  const targetFailure=render({time:510,beforePresent:ctx=>{ctx.drawImage=()=>{throw Error('injected optional presentation failure');};}});
  assert.equal(targetFailure.presented,false,'Optional screen overlay errors retain the already drawn base frame');
  assert.equal(service.stats().ready,true);assert.equal(render({time:515}).presented,true);

  // A stale/empty atlas cache is regenerated through the production warmup.
  const priorReads=neon.diagnostics().material.pixelReads;neon.invalidate();
  assert.equal(neon.warmup(),true);assert.equal(neon.diagnostics().material.pixelReads,priorReads+10);
  assert.equal(render({time:520}).presented,true);
  const diagnostics=neon.diagnostics();
  assert.equal(diagnostics.eyes.gameplayRandomCalls,0);
  assert.equal(diagnostics.captureRaster,'world-2x-sparse','Accepted world raster resolution is unchanged');
  assert.ok(diagnostics.surfaceBytes<W*H*4*(4+4+1+1+4+1+.25),
    'Bounded eye and foreground captures use less backing memory than full-world layers');
  assert.ok(diagnostics.retainedBytes>=diagnostics.surfaceBytes,'Accounting also includes native material/light caches');
  console.log(JSON.stringify({ok:true,renderCases:assertions,palettes:5,cameras:3,ghostGain,
    tests:['real authored sprites','camera/DUSK registration','actor and ghost draw order','freeze geometry',
      'no AI mutation or RNG','cached warmup','optional context loss/failure recovery'],
    surfaces:diagnostics.surfaces,surfaceBytes:diagnostics.surfaceBytes,materialReads:diagnostics.material.pixelReads}));
}finally{globalThis.document=savedDocument;globalThis.Image=savedImage;Math.random=savedRandom;}
