import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';
import {createLiveMouthService} from '../src/render/live-mouth.js';
import {createNeonMaterial} from '../src/render/neon-material.js';
import {createPairedContext} from '../src/render/neon-context.js';

// Frozen production code, not an independently redrawn approximation. Only
// module/asset URL resolution changes when loading it from this test folder.
const baselineURL=new URL('./baseline/live-snake-v1.02.09.00.js',import.meta.url);
const originalURL=new URL('../src/render/live-snake.js',import.meta.url);
const baselineText=readFileSync(baselineURL,'utf8');
const baselineHash=createHash('sha256').update(baselineText).digest('hex');
assert.equal(baselineHash,'5df7b55e783b381c4c3a1e04757335d85d8fa5b981131e9bd243de3580c18521');
const baselineModule=baselineText.replace(/from\s+(['"])([^'"]+)\1/g,(_all,_quote,path)=>
  `from ${JSON.stringify(new URL(path,originalURL).href)}`).replaceAll('import.meta.url',JSON.stringify(originalURL.href));
const {createLiveSnakeRenderer:createBefore}=await import(`data:text/javascript;base64,${Buffer.from(baselineModule).toString('base64')}`);
const require=createRequire(import.meta.url);
let native;
for(const path of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',
  join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{native=require(path);break;}catch{}
}
if(!native)throw Error('Native Canvas required; set CODEX_CANVAS_PACKAGE.');
const {createCanvas,loadImage,Image}=native;
const beforeGlobals={document:globalThis.document,Image:globalThis.Image};
const counters={},owned={},events=new WeakMap(),lost=new WeakSet();
let owner='setup';
const blank=()=>({allocations:0,pixelReads:0,clears:0,clearPixels:0,drawImages:0});
const count=label=>counters[label]??=(blank());
function makeCanvas(w=1,h=1){
  const label=owner,stats=count(label),canvas=createCanvas(w,h),ctx=canvas.getContext('2d');
  stats.allocations++;(owned[label]??=[]).push(canvas);events.set(canvas,new Map());
  for(const [method,field] of [['getImageData','pixelReads'],['drawImage','drawImages'],['clearRect','clears']]){
    const original=ctx[method].bind(ctx);
    ctx[method]=(...args)=>{stats[field]++;if(method==='clearRect')stats.clearPixels+=Math.abs(args[2]*args[3]);return original(...args);};
  }
  canvas.addEventListener=(type,fn)=>{const list=events.get(canvas).get(type)??[];list.push(fn);events.get(canvas).set(type,list);};
  canvas.removeEventListener=(type,fn)=>events.get(canvas).set(type,(events.get(canvas).get(type)??[]).filter(item=>item!==fn));
  ctx.isContextLost=()=>lost.has(canvas);
  return canvas;
}
function emit(canvas,type){
  if(type==='contextlost')lost.add(canvas);else lost.delete(canvas);
  for(const callback of events.get(canvas)?.get(type)??[])callback({preventDefault(){}});
}
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return makeCanvas();}};
globalThis.Image=class extends Image{set src(value){
  // Strip only unsupported ancillary metadata; retain the original PNG pixels.
  const bytes=readFileSync(fileURLToPath(value)),chunks=[bytes.subarray(0,8)];
  for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),kind=bytes.toString('ascii',p+4,p+8);
    if(kind!=='caBX')chunks.push(bytes.subarray(p,p+n+12));p+=n+12;}
  super.src=Buffer.concat(chunks);
}};
const clone=x=>JSON.parse(JSON.stringify(x));
const delta=(after,before)=>Object.fromEntries(Object.keys(after).map(key=>[key,after[key]-(before[key]??0)]));
const snapshot=label=>({...count(label)});
const directions=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const palettes=['Green','Yellow','Blue','Pink','Orange'];
const report={ok:false,baselineHash,pixelComparisons:0,geometryComparisons:0,maxChannelDifference:0,
  changedPixels:0,channelDifferenceHistogram:{},coverage:{},operationStats:null,checks:[]};
const pixels=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
function samePixels(a,b,label){
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  const left=pixels(a),right=pixels(b);let maximum=0,changed=0;
  for(let i=0;i<left.length;i+=4){let different=false;
    for(let c=0;c<4;c++){const d=Math.abs(left[i+c]-right[i+c]);
      if(d){different=true;maximum=Math.max(maximum,d);report.channelDifferenceHistogram[d]=(report.channelDifferenceHistogram[d]??0)+1;}}
    if(different)changed++;
  }
  report.pixelComparisons++;report.changedPixels+=changed;report.maxChannelDifference=Math.max(report.maxChannelDifference,maximum);
  assert.equal(maximum,0,`${label}: exact cached-buffer replay differs (${changed} pixels, maximum ${maximum}/255)`);
}
function geometry(renderer,entity,t){
  const pose=renderer.inspect(entity,t),g=renderer.getWorldGeometry(entity,t);
  const {sprite,...head}=g.head;
  return {pose,head,tail:g.tail,length:g.length,logicalLength:g.logicalLength,compression:g.compression,
    tailSpan:g.tailSpan,collisionTailDistance:g.collisionTailDistance,bodyEndDistance:g.bodyEndDistance,
    diameter:g.diameter,backwards:g.backwards,birth:g.birth,
    samples:Array.from({length:17},(_,i)=>g.sample(g.length*i/16))};
}
function sameGeometry(scenes,t,label){
  assert.equal(scenes[0].entities.length,scenes[1].entities.length);
  for(let i=0;i<scenes[0].entities.length;i++){
    assert.deepEqual(geometry(scenes[1].renderer,scenes[1].entities[i],t),
      geometry(scenes[0].renderer,scenes[0].entities[i],t),`${label}: exact geometry`);report.geometryComparisons++;
  }
}
function matrix(ctx){const m=ctx.getTransform();return [m.a,m.b,m.c,m.d,m.e,m.f];}
function state(ctx){return {matrix:matrix(ctx),alpha:ctx.globalAlpha,operation:ctx.globalCompositeOperation};}
function outputSet(width=320,height=240){return Array.from({length:3},()=>createCanvas(width,height));}
function setupContexts(surfaces,player,scale,{independent=true}={}){
  const cx=(player.x+.5)*16,cy=(player.y+.5)*16;
  return surfaces.map((surface,i)=>{
    const ctx=surface.getContext('2d'),k=scale*(independent?[1,.71,1.37][i]:1);
    ctx.resetTransform();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,surface.width,surface.height);
    // Fractional transforms and different capture origins expose a bitmap
    // accidentally built in a destination's camera coordinates.
    ctx.setTransform(k,0,0,k,surface.width*.34-cx*k+.125*i,surface.height*.52-cy*k-.1875*i);
    ctx.globalAlpha=.83;return ctx;
  });
}
function nestedPair(contexts,material){
  const actors=createPairedContext(contexts[0],contexts[1],{secondaryPreparedMode:{occlusion:true}});
  return createPairedContext(material.wrapContext(actors),material.wrapEmissionContext(contexts[2]));
}
let mouth;
try{
  const manifest={};vm.runInNewContext(readFileSync(new URL('../src/config/render-atlas.js',import.meta.url),'utf8'),manifest);
  const atlas=await loadImage(fileURLToPath(new URL('../assets/atlases/hd/modern-characters-80.png',import.meta.url)));
  const sprite=name=>{
    const [,x,y,w,h]=manifest.MAZE_BITERS_RENDER_ATLAS.characters[`player:p1:normal:${name}`];
    const c=createCanvas(w/2,h/2),ctx=c.getContext('2d');ctx.drawImage(atlas,x/2,y/2,w/2,h/2,0,0,w/2,h/2);
    return ctx.getImageData(0,0,c.width,c.height);
  };
  const sprites={};for(let n=1;n<=4;n++){sprites[`Head${n}`]=sprite(`Head${n}`);if(n!==1)sprites[`Head${n}Close`]=sprite(`Head${n}Close`);}
  owner='mouth';mouth=createLiveMouthService({makeCanvas,readSprite:s=>s,playerPosition:p=>p,yieldTask:async()=>{}});
  await mouth.prepare({player:{p1:{normal:sprites}}});
  const renderers=[],materials=[];
  for(const [label,create] of [['before',createBefore],['after',createLiveSnakeRenderer]]){
    owner=label;const renderer=create({tile:16,playerPosition:p=>p});await renderer.prepare();
    assert.equal(renderer.stats().ready,true,renderer.stats().error);renderers.push(renderer);
    owner=`${label}Material`;const material=createNeonMaterial({canvasFactory:makeCanvas,strength:.7});
    material.prewarm(renderer.getNeonSources());materials.push(material);
  }
  report.initialStats={before:renderers[0].stats(),after:renderers[1].stats()};
  assert.ok(report.initialStats.after.cachedBytes<report.initialStats.before.cachedBytes,
    'unused cap buffers and unneeded intake storage are not retained after prepare');
  function entity(count,color,dir,{corner=false}={}){
    const body=Array.from({length:count},(_,i)=>({x:12-i*dir.x,y:12-i*dir.y}));
    if(corner&&count>3){const turn={x:-dir.y,y:dir.x};for(let i=3;i<count;i++){
      body[i]={x:body[2].x-(i-2)*turn.x,y:body[2].y-(i-2)*turn.y};}}
    return {body,dir:{...dir},color,reversing:false};
  }
  function scenario(renderer,{kind='tail',color='Green',bank=0,tilt=0,corner=false}={}){
    renderer.reset();const dir=directions[bank],s=entity(kind==='head'?1:kind==='held'?2:7,color,dir,{corner});
    renderer.capture(s,0);if(kind==='held')renderer.hold(s,30);
    const token=renderer.capture(s,100),tip=renderer.inspect(s,100).tail;
    const player={x:(tip.x-dir.x*12)/36-.5,y:(tip.y-dir.y*12)/36-.5,
      dir:{...dir},controllerTiltDegrees:tilt,moveDuration:95};
    let entities=[s];
    if(kind==='head'){renderer.consume(s,token,{t:100,player});entities=[];}
    else if(kind==='split'){
      const index=3,front={...entity(index,color,dir),body:clone(s.body.slice(0,index))};
      const rear={...entity(s.body.length-index-1,color,{x:-dir.x,y:-dir.y}),body:clone(s.body.slice(index+1)).reverse()};
      renderer.split(s,[front,rear],token,{t:100,index,player});entities=[front,rear];
    }else{s.body.pop();renderer.biteTail(s,token,{t:100,player});}
    mouth.bite(player,100,100,0);return {renderer,entities,player,bank,kind};
  }
  const descriptor=(scene,t)=>{
    const n=[2,3,4,1][scene.bank];return mouth.sprite(scene.player,t,
      {open:sprites[`Head${n}`],closed:sprites[`Head${n}Close`]??sprites[`Head${n}`],bank:scene.bank});
  };
  function drawScene(scene,material,surfaces,t,scale,{overlayOnly=false,independent=true}={}){
    const contexts=setupContexts(surfaces,scene.player,scale,{independent}),saved=contexts.map(state);
    const pair=nestedPair(contexts,material);
    if(!overlayOnly){for(const s of scene.entities)assert.equal(scene.renderer.draw(pair,s,t),true);
      scene.renderer.drawGhosts(pair,t);}
    const result=scene.renderer.drawMouthIntake(pair,scene.player,t,{mouth,descriptor:descriptor(scene,t),visual:scene.player});
    contexts.forEach((ctx,i)=>assert.deepEqual(state(ctx),saved[i],'all prepared destinations restore caller state'));
    return result;
  }
  const outputs=[outputSet(),outputSet()];
  for(const color of palettes)for(let bank=0;bank<4;bank++)for(const kind of ['tail','held','head','split']){
    const spec={kind,color,bank,tilt:bank%2?-13:11,corner:kind==='split'};
    const scenes=renderers.map(r=>scenario(r,spec));
    for(const t of [100,166,224]){
      sameGeometry(scenes,t,`${color}/${bank}/${kind}/${t}`);
      const returns=scenes.map((s,i)=>drawScene(s,materials[i],outputs[i],t,3));assert.equal(returns[0],returns[1]);
      for(let role=0;role<3;role++)samePixels(outputs[0][role],outputs[1][role],`${color}/${bank}/${kind}/${t}/role${role}`);
    }
  }
  report.coverage.corpus={palettes:5,directions:4,kinds:['tail','held','head','split'],times:[100,166,224],roles:['native','occlusion','emission']};
  // Full physical output sizes, not a small output called HD/4K. Each role
  // deliberately retains a distinct camera transform at both resolutions.
  for(const [name,width,height,scale] of [['HD',1920,1080,8],['4K',3840,2160,16]]){
    const large=[outputSet(width,height),outputSet(width,height)];
    for(let bank=0;bank<4;bank++){
      const scenes=renderers.map(r=>scenario(r,{color:palettes[bank],bank,tilt:bank%2?17:-9}));
      for(const t of [100,184]){
        scenes.forEach((s,i)=>drawScene(s,materials[i],large[i],t,scale));
        for(let role=0;role<3;role++)samePixels(large[0][role],large[1][role],`${name}/bank${bank}/${t}/role${role}`);
      }
    }
    report.coverage[name]={width,height,directions:4,frames:8,roles:3};
  }
  // Measure production scratch operations around only the triply prepared
  // intake. This is a deterministic work count, not a whole-game FPS claim.
  const workScenes=renderers.map(r=>scenario(r,{color:'Pink',bank:0}));
  workScenes.forEach((s,i)=>drawScene(s,materials[i],outputs[i],150,3));
  const countStart=['before','after'].map(snapshot),statStart=renderers.map(r=>r.stats());
  const materialStart=materials.map(m=>m.stats());
  for(let n=0;n<120;n++)for(let i=0;i<2;i++)drawScene(workScenes[i],materials[i],outputs[i],150,3,{overlayOnly:true});
  const work=['before','after'].map((label,i)=>delta(snapshot(label),countStart[i]));
  report.operationStats={label:'120 warmed intake callbacks; native + alpha occlusion + emission, deterministic operation counts',
    before:work[0],after:work[1],rendererBefore:statStart,rendererAfter:renderers.map(r=>r.stats())};
  assert.equal(work[0].allocations,0);assert.equal(work[1].allocations,0,'repeated warmed ingestion creates no canvas');
  assert.equal(work[0].pixelReads,0);assert.equal(work[1].pixelReads,0,'ingestion reads no pixels');
  assert.ok(work[1].drawImages<work[0].drawImages,'prepared bitmap reuse removes duplicate raster work');
  assert.ok(work[1].clearPixels<work[0].clearPixels,'prepared bitmap reuse clears less scratch area');
  materials.forEach((m,i)=>assert.equal(m.stats().pixelReads,materialStart[i].pixelReads,'no additional neon texture reads'));
  for(let role=0;role<3;role++)samePixels(outputs[0][role],outputs[1][role],`warmed-repeat/role${role}`);
  report.checks.push('warmed prepared reuse: no canvas allocations or pixel reads, fewer scratch clears and raster draws');

  // Explicit custom prepared consumers use both shared and distinct resolver
  // functions. Different transformed textures must not share the old bitmap.
  const identity=source=>source;
  const customScenes=renderers.map(r=>scenario(r,{color:'Blue',bank:1,tilt:12}));
  const custom=[[createCanvas(256,256),createCanvas(256,256),createCanvas(256,256)],
    [createCanvas(256,256),createCanvas(256,256),createCanvas(256,256)]];
  for(let i=0;i<2;i++){
    const scene=customScenes[i],contexts=setupContexts(custom[i],scene.player,7),cache=new WeakMap();
    const differentlyResolved=source=>{
      if(!cache.has(source)){const c=createCanvas(source.width,source.height),g=c.getContext('2d');g.drawImage(source,0,0);
        g.globalCompositeOperation='source-atop';g.fillStyle='rgba(255,0,0,.18)';g.fillRect(0,0,c.width,c.height);cache.set(source,c);}
      return cache.get(source);
    };
    const proxy={isContextLost:()=>false,paintPreparedSurface(paint){
      paint(contexts[0],identity,{emission:false});paint(contexts[1],differentlyResolved,{emission:false});
      paint(contexts[2],identity,{emission:true});
    }};
    scene.renderer.drawMouthIntake(proxy,scene.player,145,{mouth,descriptor:descriptor(scene,145),visual:scene.player});
  }
  for(let role=0;role<3;role++)samePixels(custom[0][role],custom[1][role],`distinct-resolver/role${role}`);
  report.checks.push('distinct texture resolvers and emission modes cannot reuse a wrong bitmap');

  const resolverCounts=[];
  for(let i=0;i<2;i++){
    const scene=customScenes[i],contexts=setupContexts(custom[i],scene.player,7);let calls=0;
    const shared=source=>{calls++;return source;};
    const proxy={isContextLost:()=>false,paintPreparedSurface(paint){
      paint(contexts[0],shared,{emission:false});paint(contexts[1],shared,{emission:false,occlusion:true});
      paint(contexts[2],shared,{emission:true});
    }};
    scene.renderer.drawMouthIntake(proxy,scene.player,145,{mouth,descriptor:descriptor(scene,145),visual:scene.player});
    resolverCounts.push(calls);
  }
  assert.deepEqual(resolverCounts,[3,2],'same ordinary resolver is skipped only for the identical cached bitmap, not emission');
  for(let role=0;role<3;role++)samePixels(custom[0][role],custom[1][role],`shared-resolver/role${role}`);
  report.resolverCounts={before:resolverCounts[0],after:resolverCounts[1]};

  // A nested callback can overwrite shared buffers between destinations.
  // The next outer destination must rebuild rather than reuse that bitmap.
  const isolated=outputSet(256,256);
  {
    const outer=customScenes[1],contexts=setupContexts(isolated,outer.player,7);
    const proxy={isContextLost:()=>false,paintPreparedSurface(paint){
      paint(contexts[0],identity,{emission:false});paint(contexts[1],identity,{emission:false});paint(contexts[2],identity,{emission:true});
    }};
    outer.renderer.drawMouthIntake(proxy,outer.player,145,{mouth,descriptor:descriptor(outer,145),visual:outer.player});
  }
  for(let i=0;i<2;i++){
    const outer=customScenes[i],renderer=outer.renderer,dir=directions[2];
    const s=entity(5,'Orange',dir),token=renderer.capture(s,100),tip=renderer.inspect(s,100).tail;
    const player={x:(tip.x-dir.x*12)/36-.5,y:(tip.y-dir.y*12)/36-.5,dir:{...dir},moveDuration:95,controllerTiltDegrees:-7};
    s.body.pop();renderer.biteTail(s,token,{t:100,player});mouth.bite(player,100,100,0);
    const inner={renderer,entities:[s],player,bank:2};
    const contexts=setupContexts(custom[i],outer.player,7);
    const innerCtx=createCanvas(128,128).getContext('2d');
    const proxy={isContextLost:()=>false,paintPreparedSurface(paint){
      paint(contexts[0],identity,{emission:false});
      renderer.drawMouthIntake(innerCtx,player,146,{mouth,descriptor:descriptor(inner,146),visual:player});
      paint(contexts[1],identity,{emission:false});paint(contexts[2],identity,{emission:true});
    }};
    renderer.drawMouthIntake(proxy,outer.player,145,{mouth,descriptor:descriptor(outer,145),visual:outer.player});
  }
  // The old implementation itself can apply the nested player's mask to a
  // later outer receiver. The authoritative reference here is the isolated
  // outer draw, not that previously incorrect nested result.
  for(let role=0;role<3;role++)samePixels(isolated[role],custom[1][role],`reentrant-isolated/role${role}`);
  report.checks.push('reentrant draw equals isolated outer output; an overwritten mask or surface is rebuilt');

  // Future contact, expiration, a transferred eater and reset retain exactly
  // the production scheduling/ownership semantics of the old implementation.
  const scheduleScenes=renderers.map(r=>scenario(r));
  for(const t of [99,100,150,300,400]){
    const results=scheduleScenes.map((s,i)=>drawScene(s,materials[i],outputs[i],t,3,{overlayOnly:true}));
    assert.equal(results[0],results[1]);if(t===99||t===400)assert.equal(results[1],false);
    for(let role=0;role<3;role++)samePixels(outputs[0][role],outputs[1][role],`schedule/${t}/role${role}`);
  }
  for(let i=0;i<2;i++){
    const scene=scenario(renderers[i]),replacement={...scene.player,dir:{...scene.player.dir}},s=scene.entities[0];
    const token=scene.renderer.capture(s,101);s.body.pop();scene.renderer.biteTail(s,token,{t:101,player:replacement});
    const ctx=createCanvas(64,64).getContext('2d');
    assert.equal(scene.renderer.drawMouthIntake(ctx,scene.player,101,{mouth,descriptor:descriptor(scene,101),visual:scene.player}),false);
    assert.equal(scene.renderer.drawMouthIntake(ctx,replacement,101,{mouth,descriptor:descriptor(scene,101),visual:replacement}),true);
    scene.renderer.reset();
    assert.equal(scene.renderer.drawMouthIntake(ctx,replacement,101,{mouth,descriptor:descriptor(scene,101),visual:replacement}),false);
  }
  report.checks.push('future contact, expiry, eater transfer and reset keep previous scheduling and ownership');

  const recovery=[];
  for(let i=0;i<2;i++){
    const label=i?'after':'before',renderer=renderers[i],surface=owned[label].find(c=>events.get(c)?.get('contextlost')?.length);
    assert.ok(surface,'production work/art surfaces subscribe to context loss');
    const generation=renderer.stats().cacheGeneration;emit(surface,'contextlost');assert.equal(renderer.stats().ready,false);
    const scene=scenario(renderer);assert.equal(renderer.draw(createCanvas(64,64).getContext('2d'),scene.entities[0],100),false);
    owner=label;emit(surface,'contextrestored');await renderer.prepare();assert.equal(renderer.stats().ready,true,renderer.stats().error);
    assert.ok(renderer.stats().cacheGeneration>generation);owner=`${label}Material`;
    materials[i].prewarm(renderer.getNeonSources());recovery.push(renderer.stats());
  }
  const recovered=renderers.map(r=>scenario(r,{kind:'tail',color:'Yellow',bank:2,tilt:15}));
  recovered.forEach((s,i)=>drawScene(s,materials[i],outputs[i],175,4));
  for(let role=0;role<3;role++)samePixels(outputs[0][role],outputs[1][role],`recovered/role${role}`);
  sameGeometry(recovered,175,'recovered');report.recovery=recovery;
  report.checks.push('actual context-loss/restoration invalidates and rebuilds owned buffers without changing output');
  report.finalStats={before:renderers[0].stats(),after:renderers[1].stats()};report.ok=true;
}finally{
  mouth?.dispose();
  for(const [key,value] of Object.entries(beforeGlobals))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
}
const jsonIndex=process.argv.indexOf('--json');if(jsonIndex>=0){assert.ok(process.argv[jsonIndex+1]);writeFileSync(process.argv[jsonIndex+1],JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
