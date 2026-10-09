import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import vm from 'node:vm';
import {createLiveMouthService,morphLiveMouthFrame,makeBackCapBoundary,liveMouthMotionPhase,resampleLiveMouthRaster,LIVE_MOUTH_FRAMES,LIVE_MOUTH_CACHE_SIZE} from '../src/render/live-mouth.js';
import {morphPlayerMouthFrame} from '../animation-lib/snake-bite-study/player-mouth-art.js';

const near=(a,b,label,tolerance=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
function decodePng(png){
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20),type=png[25];
  assert.equal(png[24],8);assert.ok(type===6||type===2);assert.equal(png[28],0);
  const channels=type===6?4:3,chunks=[];
  for(let at=8;at<png.length;){const len=png.readUInt32BE(at);if(png.toString('ascii',at+4,at+8)==='IDAT')chunks.push(png.subarray(at+8,at+8+len));at+=len+12;}
  const packed=inflateSync(Buffer.concat(chunks)),stride=width*channels,raw=new Uint8Array(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
    const at=y*stride+x,left=x>=channels?raw[at-channels]:0,up=y?raw[at-stride]:0,diag=y&&x>=channels?raw[at-stride-channels]:0;
    const predictor=[0,left,up,Math.floor((left+up)/2),paeth(left,up,diag)][packed[y*(stride+1)]];
    assert.ok(Number.isFinite(predictor));raw[at]=(packed[y*(stride+1)+1+x]+predictor)&255;
  }
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++){data[i*4]=raw[i*channels];data[i*4+1]=raw[i*channels+1];data[i*4+2]=raw[i*channels+2];data[i*4+3]=channels===4?raw[i*4+3]:255;}
  return {width,height,data};
}
const sandbox={};vm.runInNewContext(await readFile(new URL('../src/config/render-atlas.js',import.meta.url),'utf8'),sandbox);
const manifest=sandbox.MAZE_BITERS_RENDER_ATLAS;
const hd=decodePng(await readFile(new URL('../assets/atlases/hd/modern-characters-80.png',import.meta.url)));
const fourK=decodePng(await readFile(new URL('../assets/atlases/4k/modern-characters-160.png',import.meta.url)));
function buildGroups(size){
  const groups={};
  for(const [name,region] of Object.entries(manifest.characters)){
    const parts=name.split(':');if(!['player','hunter'].includes(parts[0]))continue;
    let at=groups;for(const p of parts.slice(0,-1))at=at[p]??={};
    at[parts.at(-1)]={name,__hvSpriteName:parts.at(-1),region:region.slice(),size};
  }
  return groups;
}
function readSprite(sprite){
  const image=sprite.size===80?hd:fourK,f=sprite.size/160,[,x,y,w,h]=sprite.region;
  const width=w*f,height=h*f,out={width,height,data:new Uint8ClampedArray(width*height*4)};
  for(let row=0;row<height;row++){const start=((y*f+row)*image.width+x*f)*4;out.data.set(image.data.subarray(start,start+width*4),row*width*4);}
  return out;
}

let reads=0,allocations=0;
class Canvas {
  constructor(width,height){this.width=width;this.height=height;this.listeners={};this.ctx=new Context(this);allocations++;}
  getContext(){return this.ctx;}
  addEventListener(name,handler){this.listeners[name]=handler;}
}
class Context {
  constructor(canvas=null){this.canvas=canvas;this.data=null;this.draws=[];this.stack=[];this.globalAlpha=.73;this.globalCompositeOperation='source-over';}
  ensure(){const n=this.canvas.width*this.canvas.height*4;if(this.data?.length!==n)this.data=new Uint8ClampedArray(n);}
  createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};}
  putImageData(image,x,y){this.ensure();for(let row=0;row<image.height;row++)this.data.set(image.data.subarray(row*image.width*4,(row+1)*image.width*4),((y+row)*this.canvas.width+x)*4);}
  getImageData(x,y,width,height){reads++;this.ensure();const out=this.createImageData(width,height);for(let row=0;row<height;row++){const start=((y+row)*this.canvas.width+x)*4;out.data.set(this.data.subarray(start,start+width*4),row*width*4);}return out;}
  save(){this.stack.push({alpha:this.globalAlpha,composite:this.globalCompositeOperation});}
  restore(){assert.ok(this.stack.length);const a=this.stack.pop();this.globalAlpha=a.alpha;this.globalCompositeOperation=a.composite;}
  fillRect(){}
  drawImage(image,...args){
    assert.ok(args.every(Number.isFinite),'all source and destination coordinates are finite');
    if(args.length===8){const [x,y,w,h]=args;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=image.width&&y+h<=image.height,'source crop stays inside its cache');}
    this.draws.push({image,args,alpha:this.globalAlpha,composite:this.globalCompositeOperation});
    // Native reconstruction proves the cached patch + outside regions cover
    // each pixel once, without painting an old mouth behind transparency.
    if(this.canvas&&args.length===8&&args[2]===args[6]&&args[3]===args[7]&&this.globalCompositeOperation==='source-over'){
      const [sx,sy,w,h,dx,dy]=args;this.ensure();image.ctx.ensure();
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const from=((sy+y)*image.width+sx+x)*4,to=((dy+y)*this.canvas.width+dx+x)*4;
        this.data.set(image.ctx.data.subarray(from,from+4),to);
      }
    }
  }
}
const canvases=[];
const makeCanvas=(w,h)=>{const c=new Canvas(w,h);canvases.push(c);return c;};
const nativeImages=new WeakMap();
const drawSource=(ctx,sprite,x,y,w,h)=>{
  let image=nativeImages.get(sprite);
  if(!image){const raster=readSprite(sprite);image={width:raster.width,height:raster.height,source:sprite,ctx:{data:raster.data,ensure(){}}};nativeImages.set(sprite,image);}
  ctx.drawImage(image,0,0,image.width,image.height,x,y,w,h);return true;
};
const service=createLiveMouthService({makeCanvas,readSprite,drawSource,yieldTask:async()=>{}});
const actors=[95,47.5,218].map(duration=>Object.freeze({moveFromX:3,moveFromY:4,moveToX:4,moveToY:4,moveStartedAt:1000,moveDuration:duration,
  x:4,y:4,dir:Object.freeze({x:1,y:0}),controllerTiltDegrees:19}));
let timingChecks=0;
for(const actor of actors){
  const before=structuredClone(actor);
  for(let step=0;step<=300;step++){
    const t=1000+actor.moveDuration*step/300,phase=(step/300)%1;
    near(liveMouthMotionPhase(actor,t),phase,'native step duration controls mouth phase',1e-10);
    near(service.closure(actor,t),.66+.14*Math.cos(2*Math.PI*phase),'one smooth small chew per native step');timingChecks++;
  }
  near(service.closure(actor,2000),.8,'stopped actors keep their final mouth phase');
  assert.deepEqual(actor,before,'sampling never changes movement, direction, rotation or collision coordinates');
}
assert.equal(liveMouthMotionPhase({moveFromX:0,moveFromY:0,moveToX:8,moveToY:0,moveStartedAt:0,moveDuration:95},40),0,'teleports are not travelling chews');
const eventActor=Object.freeze({moveFromX:0,moveFromY:0,moveToX:0,moveToY:0,moveStartedAt:0,moveDuration:95});
service.closure(eventActor,200);service.bite(eventActor,220,95,200);
near(service.closure(eventActor,200),.8,'announcing a future real contact does not jump the mouth');
near(service.closure(eventActor,220),0,'mouth reaches open at committed visual contact');
near(service.closure(eventActor,315),1,'real bite closes exactly at its supplied end');
near(service.closure(eventActor,405),.8,'jaw returns smoothly to ordinary motion');
for(const join of [200,220,315,405]){
  const h=.001,a=service.closure(eventActor,join-h),b=service.closure(eventActor,join),c=service.closure(eventActor,join+h);
  near((c-a)/(2*h),0,'mouth event value/velocity join',1e-7);near((c-2*b+a)/(h*h),0,'mouth event acceleration join',1e-5);
}
const expected=[200,207,220,260,315,350,405].map(t=>service.closure(eventActor,t));
for(const fps of [15,30,60,144]){
  for(let t=200;t<450;t+=1000/fps)service.closure(eventActor,t);
  assert.deepEqual([200,207,220,260,315,350,405].map(t=>service.closure(eventActor,t)),expected,'event sampling is seek- and framerate-independent');
}
service.bite(eventActor,305,55,280);
for(let i=0;i<=300;i++){const v=service.closure(eventActor,280+i*.4);assert.ok(v>=0&&v<=1&&Number.isFinite(v));}
const late=Object.freeze({...eventActor});service.bite(late,200,95,200);
near(service.closure(late,200),.8,'an immediate unannounced event starts from its actual current closure, not a hard open reset');
near(service.closure(late,295),1,'immediate event still reaches a full bite');
assert.throws(()=>service.bite(late,300,0));assert.throws(()=>service.closure(late,NaN));
service.reset();near(service.closure(eventActor,305),.8,'reset without an actor clears all old-round bite phrases');

let pixelChecks=0,drawChecks=0,endpointChecks=0;
for(const size of [80,160]){
  const groups=buildGroups(size),g=groups.player.p1.normal;
  for(let bank=0;bank<3;bank++){
    const dir=[2,3,4][bank],open=readSprite(g[`Head${dir}`]),closed=readSprite(g[`Head${dir}Close`]);
    assert.deepEqual(morphLiveMouthFrame(open,closed,bank,0),open.data);
    assert.deepEqual(morphLiveMouthFrame(open,closed,bank,1),closed.data);endpointChecks+=2;
    if(size===160)for(const closure of [.125,.5,.875]){
      assert.deepEqual(morphLiveMouthFrame(open,closed,bank,closure),morphPlayerMouthFrame(open.data,closed.data,bank,closure),
        '160px live morph is pixel-identical to the approved isolated authored-endpoint morph');pixelChecks+=size*size;
    }
  }
  // Both quality profiles exercise all players and all six normal/rage
  // hunter palettes. Intermediate caches remain at80; endpoints stay native.
  const selected=groups;
  await service.prepare(selected);
  assert.equal(service.stats.sets,72);assert.equal(service.stats.frames,19);
  assert.equal(service.stats.cacheSize,80);assert.equal(service.stats.nativeEndpoints,true);
  assert.ok(service.stats.bytes<=33*1048576,'all72 shared caches stay within approximately32MiB at both quality settings');
  assert.ok(service.stats.bytes<service.stats.fullFrameBytes,'cropped caches use less memory than complete frame atlases');
  const allocationCount=allocations,readCount=reads;
  for(const [kind,palettes] of Object.entries(selected))for(const [palette,lights] of Object.entries(palettes))for(const [light,poses] of Object.entries(lights)){
    for(let bank=0;bank<4;bank++){
      const dir=[2,3,4,1][bank],prefix=kind==='hunter'?'EnemyHead':'Head';
      const open=poses[`${prefix}${dir}`],closed=poses[`${prefix}${dir}${dir===1?'':'Close'}`]||open;
      const openRaster=readSprite(open),closedRaster=readSprite(closed),boundary=makeBackCapBoundary(resampleLiveMouthRaster(readSprite(g.Head1)));
      for(const frame of [0,4,9,14,18]){
        const actor=Object.freeze({...eventActor}),start=1000;
        service.bite(actor,start,100,900);
        // Invert the monotone event easing to select exact cached frame.
        let low=0,high=1;for(let iteration=0;iteration<50;iteration++){
          const p=(low+high)/2,v=p*p*p*(10+p*(-15+6*p));if(v<frame/(LIVE_MOUTH_FRAMES-1))low=p;else high=p;
        }
        const time=start+100*(low+high)/2;
        const descriptor=service.sprite(actor,time,{open,closed,bank});assert.ok(descriptor?.__liveMouth);
        assert.equal(descriptor,service.sprite(actor,time,{open,closed,bank}),'each closure frame has a stable descriptor');
        assert.equal(descriptor.__liveMouth.index,frame);
        const nativeEndpoint=frame===18||(frame===0&&bank!==3),outputSize=nativeEndpoint?size:LIVE_MOUTH_CACHE_SIZE;
        const target=new Canvas(outputSize,outputSize),context=target.getContext('2d');
        const beforeAlloc=allocations,beforeRead=reads;
        assert.equal(service.draw(context,descriptor,0,0,outputSize,outputSize),true);
        assert.equal(allocations,beforeAlloc);assert.equal(reads,beforeRead);
        assert.ok(context.draws.length<=5);assert.equal(context.stack.length,0);assert.equal(context.globalAlpha,.73);
        const expected=nativeEndpoint?(frame===0?openRaster.data:closedRaster.data):
          morphLiveMouthFrame(resampleLiveMouthRaster(openRaster),resampleLiveMouthRaster(closedRaster),bank,frame/(LIVE_MOUTH_FRAMES-1),boundary);context.ensure();
        assert.deepEqual(context.data,expected,`${kind}/${palette}/${light}/${dir}/${frame} reconstructs exact approved pixels`);
        pixelChecks+=outputSize*outputSize;drawChecks++;
        if(kind==='player'){
          const leader=new Context();assert.equal(service.drawLeader(leader,descriptor,3,4,16),true);
          assert.equal(leader.stack.length,0);assert.equal(leader.globalAlpha,.73);assert.equal(leader.globalCompositeOperation,'source-over');
          assert.equal(leader.draws[0].image,descriptor.__liveMouth.set.leader.image,'leader draws only a prepared union outline before current mouth');
          assert.ok(leader.draws.slice(1).every(call=>call.image===descriptor.__liveMouth.set.base||call.image===descriptor.__liveMouth.set.sheet||call.image.source===open||call.image.source===closed));
        }
      }
    }
  }
  // The additional canvases above are the test's independent output buffers.
  assert.equal(allocations,allocationCount+72*5);assert.equal(reads,readCount);
  console.log(`${size}px caches: ${service.stats.sets} sets, ${(service.stats.bytes/1048576).toFixed(2)} MiB versus ${(service.stats.fullFrameBytes/1048576).toFixed(2)} MiB whole-frame baseline`);
  assert.ok(canvases.every(c=>c.width<=2048&&c.height<=2048),'individual retained surfaces fit the conservative 2048px bound');
}
// Context loss safely restores the engine's unchanged original-sprite route.
const g=buildGroups(160).player.p1.normal;
await service.prepare({player:{p1:{normal:g}}});
const descriptor=service.sprite(actors[0],1020,{open:g.Head2,closed:g.Head2Close,bank:0});
descriptor.__liveMouth.set.sheet.listeners.contextlost();
assert.equal(service.sprite(actors[0],1020,{open:g.Head2,closed:g.Head2Close,bank:0}),null);
assert.equal(service.draw(new Context(),descriptor,0,0,16),false);
assert.equal(service.ready,false);assert.equal(service.stats.ready,false);assert.equal(service.stats.invalidSets,1);
// A second surface of the same direction is not a second lost set. Multiple
// restoration events coalesce into one whole-generation preparation.
descriptor.__liveMouth.set.base.listeners.contextlost();assert.equal(service.stats.invalidSets,1);
const restorationAllocationStart=allocations;
descriptor.__liveMouth.set.sheet.listeners.contextrestored();
descriptor.__liveMouth.set.base.listeners.contextrestored();
descriptor.__liveMouth.set.leader.image.listeners.contextrestored();
assert.equal(service.stats.restoring,true);
assert.equal(await service.whenRestored(),true);assert.equal(service.ready,true);assert.equal(service.stats.invalidSets,0);
assert.equal(allocations-restorationAllocationStart,20,'four direction sets are restored once, not once per canvas');
assert.ok(service.sprite(actors[0],1020,{open:g.Head2,closed:g.Head2Close,bank:0}));
assert.equal(service.draw(new Context(),descriptor,0,0,16),false,'stale descriptors cannot use released caches after restoration');
const afterRestoration=allocations;
descriptor.__liveMouth.set.sheet.listeners.contextlost();descriptor.__liveMouth.set.sheet.listeners.contextrestored();
await service.whenRestored();assert.equal(allocations,afterRestoration,'released generations cannot initiate new rebuilds');
service.dispose();assert.equal(service.ready,false);assert.equal(service.stats.bytes,0);
assert.equal(service.draw(new Context(),descriptor,0,0,16),false,'disposed descriptors cannot sample released surfaces');
assert.ok(canvases.every(c=>c.width===1&&c.height===1),'quality replacement/disposal releases all service-owned surfaces');

// The engine adapter returns a temporary native canvas rather than raw pixels.
// Explicitly release those too; only compact shared caches survive startup.
const temporarySources=[];
const canvasAdapter=createLiveMouthService({makeCanvas,drawSource,yieldTask:async()=>{},readSprite(sprite){
  const image=readSprite(sprite),canvas=new Canvas(image.width,image.height);
  canvas.ctx.putImageData(image,0,0);temporarySources.push(canvas);return canvas;
}});
await canvasAdapter.prepare({player:{p1:{normal:g}}});
assert.ok(temporarySources.length>=8&&temporarySources.every(c=>c.width===1&&c.height===1),'native source scratch surfaces are released immediately after read');
canvasAdapter.dispose();

// Two overlapping quality requests cannot publish stale intermediate caches.
let pauseFirst,releaseFirst;const gate=new Promise(resolve=>{releaseFirst=resolve;});
let yielded=0;
const concurrent=createLiveMouthService({makeCanvas,drawSource,readSprite,yieldTask:async()=>{
  if(yielded++===0){pauseFirst?.();await gate;}
}});
const entered=new Promise(resolve=>{pauseFirst=resolve;});
const first=concurrent.prepare({player:{p1:{normal:g}}});await entered;
const replacement=buildGroups(80).player.p1.normal;
const second=concurrent.prepare({player:{p1:{normal:replacement}}});
releaseFirst();assert.equal(await first,false);assert.equal(await second,true);
assert.equal(concurrent.sprite(actors[0],1020,{open:g.Head2,closed:g.Head2Close,bank:0}),null,'stale generation is not published');
assert.ok(concurrent.sprite(actors[0],1020,{open:replacement.Head2,closed:replacement.Head2Close,bank:0}));
concurrent.dispose();
console.log(`Live mouth: ${timingChecks} native timing samples, ${endpointChecks} exact endpoint checks, ${pixelChecks} pixel reconstructions, ${drawChecks} cached draws; actor movement untouched.`);
