import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// The default oracle is the frozen v105 compositor, not a copy of the
// optimized implementation. Optional paths allow external release snapshots.
// It never changes production files or reads game state.
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const baseline=option('--baseline')||fileURLToPath(new URL('./fixtures/neon-v105/',import.meta.url));
const candidate=option('--candidate')||fileURLToPath(new URL('../src/render/',import.meta.url));
const load=(root,name)=>import(pathToFileURL(join(resolve(root),name)).href);
const [oldModule,newModule,newContexts,newMaterials]=await Promise.all([
  load(baseline,'snake-neon.js'),load(candidate,'snake-neon.js'),
  load(candidate,'neon-context.js'),load(candidate,'neon-material.js')]);
const require=createRequire(import.meta.url);
let native;
for(const p of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{native=require(p);break;}catch{}
}
if(!native)throw Error('Native Canvas required');
const {createCanvas}=native,W=128,H=96,TILE=16;
const rgba=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
const alpha=c=>{const p=rgba(c),a=new Uint8Array(p.length/4);for(let i=0;i<a.length;i++)a[i]=p[i*4+3];return a;};
const texture=createCanvas(480,74),tg=texture.getContext('2d'),tp=tg.createImageData(480,74);
for(let y=0;y<74;y++)for(let x=0;x<480;x++){
  const i=(y*480+x)*4;tp.data[i]=140+Math.round(70*y/74);tp.data[i+1]=220+Math.round(25*(x%160)/160);tp.data[i+2]=30;tp.data[i+3]=255;
}
tg.putImageData(tp,0,0);
const grid=Array.from({length:H/TILE},(_,y)=>Array.from({length:W/TILE},(_,x)=>x===0||y===0||x===7||y===5?'#':'.').join(''));
const walls=ctx=>{ctx.fillStyle='#6767ff';for(let y=0;y<grid.length;y++)for(let x=0;x<grid[y].length;x++)if(grid[y][x]==='#')ctx.fillRect(x*TILE,y*TILE,TILE,TILE);};
const dusk=createCanvas(W,H);dusk.getContext('2d').fillStyle='rgba(0,0,0,.72)';dusk.getContext('2d').fillRect(0,0,W,H);
const service={
  getNeonSources:()=>[texture],
  getCollisionArt:()=>({image:texture}),
  getWorldGeometry(entity,time){
    const x=entity.x,angle=entity.angle;
    return {renderTime:time,diameter:8,length:60,bodyEndDistance:50,tailSpan:10,
      head:{x:x+52,y:44,angle,alpha:entity.alpha,sprite:{image:texture,sw:112,sh:88,dx:-10,dy:-12,dw:24,dh:19}},
      sample(d,out={}){out.x=x+d;out.y=44+2*Math.sin(d/18);out.angle=0;out.tx=1;out.ty=0;return out;}};
  }
};
function fixture(create,dpr){
  const made=[];let failEmission=false;
  const makeCanvas=(w,h)=>{
    const c=createCanvas(w,h),g=c.getContext('2d'),index=made.length;
    const draw=g.drawImage.bind(g);let draws=0,lost=false;
    g.drawImage=(...args)=>{draws++;if(c.testCaptureRole==='emission'&&failEmission)throw Error('injected capture failure');return draw(...args);};
    g.isContextLost=()=>lost;
    const entry={c,g,index,draws:()=>draws,lose:()=>{lost=true;},restore:()=>{lost=false;}};made.push(entry);return c;
  };
  const neon=create({width:W,height:H,tile:TILE,makeCanvas,snake:service});
  const canvas=createCanvas(W*dpr,H*dpr),g=canvas.getContext('2d');
  let screenDraws=0;const draw=g.drawImage.bind(g);
  g.drawImage=(...args)=>{screenDraws++;return draw(...args);};
  return {made,neon,canvas,g,dpr,screenDraws:()=>screenDraws,fail(value){failEmission=value;},
    // v105 predates prepared occlusion roles; its frozen fixture retains the
    // documented actor slot. The candidate is always discovered semantically.
    capture:role=>made.find(entry=>entry.c.testCaptureRole===role)
      ||(create===oldModule.createSnakeNeon&&role==='actors'?made[3]:null)};
}
const entity={x:28,angle:0,alpha:1,color:'#35e55b',brainAggression:.8};
const observedModes=new Set();
function prepared(ctx,x,modeLog=false){
  ctx.paintPreparedSurface((target,resolveTexture,mode)=>{
    if(modeLog)observedModes.add(`${!!mode.emission}/${!!mode.occlusion}`);
    // Observe prepared roles, not allocation order: sparse eye/foreground
    // captures intentionally no longer occupy fixed full-world slots.
    if(modeLog&&target.canvas)target.canvas.testCaptureRole=mode.emission?'emission':mode.occlusion?'actors':'visible';
    const art=resolveTexture(texture);if(!art)return;
    target.save();target.translate(x,44);target.rotate(.025);
    target.drawImage(art,160,8,160,58,-4,-4,60,8);target.restore();
  });
}
function render(f,time,{zoom=1,ghost=false,cover=true,none=false}={}){
  const {g,canvas,neon,dpr}=f,camera={x:W/2+3,y:H/2-2,zoom};
  g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,canvas.width,canvas.height);
  g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle='#0b0b1b';g.fillRect(0,0,W,H);
  g.setTransform(dpr*zoom,0,0,dpr*zoom,dpr*(W/2-camera.x*zoom),dpr*(H/2-camera.y*zoom));
  walls(g);
  const begin=neon.beginFrame(g,{grid,key:'fixture',drawWallArtwork:walls,time});
  if(!begin)return {begin,presented:false};
  const pre=neon.actorsContext();pre.fillStyle='#9d6';pre.fillRect(24,38,5,13);
  neon.flushOcclusion(); // Deliberately before any luminous draw.
  if(!none){
    prepared(neon.snakeContext(),entity.x,true);
    neon.snakeContext().drawImage(texture,0,0,100,50,75,40,14,9);
    neon.noteSnake(entity);
  }
  if(cover){const actor=neon.actorsContext();actor.fillStyle='#b82b56';actor.fillRect(77,39,11,8);}
  neon.flushOcclusion();
  if(ghost){const s=neon.snakeContext();s.save();s.globalAlpha=.64;prepared(s,30);s.restore();}
  if(cover){const actor=neon.actorsContext();actor.fillStyle='#fc7456';actor.globalAlpha=.7;actor.fillRect(43,38,12,9);actor.globalAlpha=1;}
  g.setTransform(dpr,0,0,dpr,0,0);
  const presented=neon.present(g,dusk,camera);
  return {begin,presented};
}
let cases=0,operationCounts,maxFinalDifference=0,roundedChannels=0;
for(const dpr of [1,2.5,5])for(const zoom of [1,1.7,2]){
  const old=fixture(oldModule.createSnakeNeon,dpr),next=fixture(newModule.createSnakeNeon,dpr);
  for(const time of [0,80,240,500,1100,1500,2900,3200]){
    const options={zoom,ghost:time===240||time===1100,cover:time!==80,none:time===1500};
    assert.deepEqual(render(next,time,options),render(old,time,options));
    const actual=rgba(next.canvas),expected=rgba(old.canvas),eyeFrame=next.neon.diagnostics().eyeTileCount>0;
    for(let i=0;i<actual.length;i++){
      const delta=Math.abs(actual[i]-expected[i]);maxFinalDifference=Math.max(maxFinalDifference,delta);
      if(delta)roundedChannels++;
      // Guarded eye tiles retain world 2x raster density, but their separate
      // camera projection can round one channel by one unit. Without a glint,
      // final pixels remain strictly identical. Material/alpha stay exact.
      assert.ok(delta<=(eyeFrame?1:0),`Final RGBA DPR${dpr} zoom${zoom} time${time} channel${i}: ${delta}`);
    }
    assert.deepEqual(alpha(next.capture('actors').c),alpha(old.capture('actors').c),`Actor alpha DPR${dpr} zoom${zoom} time${time}`);
    assert.deepEqual(alpha(next.capture('emission').c),alpha(old.capture('emission').c),`Emission alpha DPR${dpr} zoom${zoom} time${time}`);
    cases++;
  }
  const stats=next.neon.diagnostics();
  assert.equal(stats.capturePairBuilds,1);assert.equal(stats.capturePairReuses,7);
  assert.ok(stats.eyePresentFrames>0&&stats.eyePresentFrames<8,'Actual eyes shown, empty eye frames omitted');
  assert.ok(stats.skippedOcclusionPasses>=16,'Initial empty light masks skipped each frame');
  assert.ok(next.capture('emission').draws()<old.capture('emission').draws(),'Fewer emission mask draws');
  assert.ok(stats.eyeTilePeak>0&&stats.eyeTileSize>0,'Native eye pulses use bounded pooled captures');
  assert.equal(stats.captureRaster,'world-2x-sparse','No change in accepted raster density');
  const counts={frames:8,
    emissionCaptureDrawImage:{before:old.capture('emission').draws(),after:next.capture('emission').draws()},
    eyeTilePool:{peak:stats.eyeTilePeak,tileSize:stats.eyeTileSize},
    eyeProjectionAndPresent:{before:8,after:stats.eyePresentFrames},
    visibleDrawImage:{before:old.screenDraws(),after:next.screenDraws()},
    pairedGroups:{before:8,after:stats.capturePairBuilds}};
  if(operationCounts)assert.deepEqual(counts,operationCounts,'Operation reductions are resolution-independent');
  else operationCounts=counts;
  next.fail(true);assert.equal(render(next,3400,{zoom}).presented,false);
  next.fail(false);assert.equal(render(next,3500,{zoom}).presented,true);
  assert.equal(next.neon.diagnostics().captureRecoveries,1);
  assert.equal(next.neon.diagnostics().capturePairBuilds,2,'Failed captures reconstructed rather than reused');
  next.capture('emission').lose();assert.equal(render(next,3600,{zoom}).begin,false);
  next.capture('emission').restore();assert.equal(render(next,3700,{zoom}).presented,true);
}
assert.deepEqual([...observedModes].sort(),['false/false','false/true','true/false']);

// Prepared role survives material wrapping and arbitrary nested pairings.
const a=createCanvas(12,12).getContext('2d'),b=createCanvas(12,12).getContext('2d'),c=createCanvas(12,12).getContext('2d');
const material=newMaterials.createNeonMaterial({canvasFactory:createCanvas});
const paired=newContexts.createPairedContext(material.wrapContext(newContexts.createPairedContext(a,b,{secondaryPreparedMode:{occlusion:true}})),material.wrapEmissionContext(c));
const modes=[];paired.paintPreparedSurface((target,_resolve,mode)=>modes.push([target===a?'visible':target===b?'mask':'light',mode.emission,!!mode.occlusion]));
assert.deepEqual(modes,[['visible',false,false],['mask',false,true],['light',true,false]]);
assert.throws(()=>newContexts.createPairedContext(a,b,{secondaryPreparedMode:true}),/mode/);
console.log(JSON.stringify({ok:true,cases,maxFinalDifference,roundedChannels,exactNonGlintRGBA:true,
  exactActorAlpha:true,exactEmissionAlpha:true,pairedReuse:true,optionalCaptureRecovery:true,eyeSkipping:true,operationCounts}));
