import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPickupNeonMaterial,eggEmissionPixels,fruitEmissionPixels} from '../src/render/pickup-neon-material.js';
import {enhancePixels} from '../src/render/neon-material.js';
const require=createRequire(import.meta.url);let native;
for(const location of ['@napi-rs/canvas',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')]){try{native=require(location);break;}catch{}}
assert.ok(native,'Native Canvas dependency required');const {createCanvas,loadImage}=native;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const report={nativeFrames:0,nativePixels:0,cacheChecks:0,lifecycleChecks:0,emissionChecks:0};
function fixture({noContext=false,readFailure=false}={}){
  const owned=[],events=new Map(),rawReads=new Map();let reads=0,lost=false;
  const makeCanvas=(width,height)=>{
    const canvas=createCanvas(width,height),context=canvas.getContext('2d'),listeners=new Map();
    owned.push(canvas);events.set(canvas,listeners);rawReads.set(canvas,context.getImageData.bind(context));
    context.getImageData=(...args)=>{reads++;if(readFailure)throw Error('fixture read failure');return rawReads.get(canvas)(...args);};
    context.isContextLost=()=>lost;
    canvas.getContext=()=>noContext?null:context;
    canvas.addEventListener=(name,handler)=>listeners.set(name,handler);
    canvas.removeEventListener=(name,handler)=>{assert.equal(listeners.get(name),handler);listeners.delete(name);};
    return canvas;
  };
  return {makeCanvas,owned,events,reads:()=>reads,setLost:value=>{lost=value;},
    pixels:canvas=>rawReads.get(canvas)(0,0,canvas.width,canvas.height).data};
}
function crop(source,rect){const result=createCanvas(rect[2],rect[3]);result.getContext('2d').drawImage(source,...rect,0,0,rect[2],rect[3]);return result;}
function pixels(source){return source.getContext('2d').getImageData(0,0,source.width,source.height).data;}
function roundtrip(p,width,height){const c=createCanvas(width,height),ctx=c.getContext('2d'),image=ctx.createImageData(width,height);image.data.set(p);ctx.putImageData(image,0,0);return pixels(c);}

const f=fixture(),cache=createPickupNeonMaterial({makeCanvas:f.makeCanvas});
assert.equal(cache.stats().bytes,0);assert.equal(f.owned.length,0);report.cacheChecks+=2;
for(const size of [80,160]){
  const quality=size===80?'hd':'4k',fruit=await loadImage(path.join(root,`assets/atlases/${quality}/modern-fruits-${size}.png`)),
    egg=await loadImage(path.join(root,`assets/atlases/${quality}/modern-eggs-${size}.png`));
  const previous=[...f.owned],readsBefore=cache.stats().cpuReads,items=[];
  for(const [kind,source]of [['fruit',fruit],['egg',egg]])for(let frame=0;frame<4;frame++){
    const rect=[frame*size,0,size,size],original=crop(source,rect),before=new Uint8ClampedArray(pixels(original));
    const result=cache.get({source,rect,kind});assert.ok(result);
    assert.equal(result.width,size);assert.equal(result.height,size);
    assert.deepEqual(f.pixels(result.material),roundtrip(enhancePixels(before,.7),size,size));
    assert.deepEqual(f.pixels(result.emission),roundtrip(kind==='fruit'?fruitEmissionPixels(before,.7):eggEmissionPixels(before,.7),size,size));
    assert.deepEqual(pixels(original),before,'immutable source crop is untouched');
    const material=f.pixels(result.material),emission=f.pixels(result.emission);
    for(let i=0;i<before.length;i+=4){
      assert.equal(material[i+3],before[i+3]);assert.ok(emission[i+3]<=before[i+3]);
      if(before[i+3]===0||Math.max(before[i],before[i+1],before[i+2])<=48)assert.equal(emission[i+3],0);
    }
    items.push({source,rect,kind,result});report.nativeFrames++;report.nativePixels+=size*size;
  }
  assert.equal(cache.stats().entries,8);assert.equal(cache.stats().readyEntries,8);
  assert.equal(cache.stats().nativeBytes,8*2*size*size*4);assert.equal(cache.stats().cpuReads,readsBefore+8);
  for(let repeat=0;repeat<30;repeat++)for(const item of items){assert.equal(cache.get(item),item.result);assert.equal(cache.stats().lastReadbacks,0);}
  assert.equal(cache.stats().cpuReads,readsBefore+8,'warm draws perform zero additional reads');
  assert.equal(f.owned.length,(size===80?16:32),'exactly two output surfaces per frame, no retained crop');
  if(size===160)assert.ok(previous.every(c=>c.width===1&&c.height===1),'quality switch releases the entire previous profile');
  const extra=createCanvas(size,size),count=f.owned.length;
  for(let i=0;i<20;i++)assert.equal(cache.get({source:extra,rect:[0,0,size,size],kind:'fruit'}),null);
  assert.equal(f.owned.length,count,'capacity fallback never allocates or evicts hot native frames');
  report.cacheChecks+=14;
}
assert.equal(cache.stats().profileChanges,1);assert.equal(cache.stats().builds,16);cache.dispose();
assert.equal(cache.stats().bytes,0);assert.ok(f.owned.every(c=>c.width===1&&c.height===1));
assert.ok([...f.events.values()].every(e=>e.size===0));assert.equal(cache.get({}),null);report.lifecycleChecks+=5;

// Array identity is not the cache key: the engine changes coordinates in place.
const atlas=createCanvas(320,80),a=atlas.getContext('2d');a.fillStyle='#f32';a.fillRect(0,0,80,80);a.fillStyle='#3d4';a.fillRect(80,0,80,80);
const atlasBefore=new Uint8ClampedArray(pixels(atlas));
const g=fixture(),service=createPickupNeonMaterial({makeCanvas:g.makeCanvas}),rect=[0,0,80,80];
const first=service.get({source:atlas,rect,kind:'fruit'});rect[0]=80;
const second=service.get({source:atlas,rect,kind:'fruit'});assert.notEqual(first,second);
rect[0]=0;assert.equal(service.get({source:atlas,rect,kind:'fruit'}),first);assert.equal(service.stats().cpuReads,2);
const otherKind=service.get({source:atlas,rect,kind:'egg'});assert.notEqual(first,otherKind);report.cacheChecks+=4;
g.events.get(first.material).get('contextlost')();const beforeLoss=service.stats().cpuReads;
assert.equal(service.get({source:atlas,rect,kind:'fruit'}),null);assert.equal(service.stats().cpuReads,beforeLoss);
g.events.get(first.material).get('contextrestored')();const restored=service.get({source:atlas,rect,kind:'fruit'});
assert.ok(restored);assert.notEqual(restored,first);assert.equal(first.material.width,1);assert.equal(service.stats().recoveries,1);
assert.equal(service.stats().cpuReads,beforeLoss+1);report.lifecycleChecks+=7;
g.setLost(true);assert.equal(service.get({source:atlas,rect,kind:'fruit'}),null);g.setLost(false);
assert.ok(service.get({source:atlas,rect,kind:'fruit'}));assert.equal(service.stats().recoveries,2);report.lifecycleChecks+=3;
service.invalidate('quality');assert.equal(service.stats().bytes,0);assert.equal(service.stats().lastInvalidation,'quality');
assert.ok(service.get({source:atlas,rect,kind:'fruit'}));service.reset();assert.equal(service.stats().entries,0);service.dispose();report.lifecycleChecks+=4;
assert.deepEqual(pixels(atlas),atlasBefore,'cache builds, restores and disposal never mutate the source atlas');report.cacheChecks++;
for(const options of [{noContext:true},{readFailure:true}]){
  const broken=fixture(options),service=createPickupNeonMaterial({makeCanvas:broken.makeCanvas});
  assert.equal(service.get({source:atlas,rect,kind:'fruit'}),null);const count=broken.owned.length,reads=broken.reads();
  for(let i=0;i<50;i++)assert.equal(service.get({source:atlas,rect,kind:'fruit'}),null);
  assert.equal(broken.owned.length,count);assert.equal(broken.reads(),reads);assert.equal(service.stats().bytes,0);
  service.invalidate();assert.equal(service.get({source:atlas,rect,kind:'fruit'}),null);assert.ok(broken.owned.length>count);
  service.dispose();assert.ok([...broken.events.values()].every(e=>e.size===0));report.lifecycleChecks+=7;
}
const invalid=fixture(),guard=createPickupNeonMaterial({makeCanvas:invalid.makeCanvas});
for(const input of [{source:atlas,rect:[0,0,64,64],kind:'fruit'},{source:atlas,rect:[300,0,80,80],kind:'egg'},
  {source:atlas,rect:[0,0,80,80],kind:'hunter'},{source:{width:320,height:80,complete:false},rect:[0,0,80,80],kind:'egg'}])assert.equal(guard.get(input),null);
assert.equal(invalid.owned.length,0);guard.dispose();report.cacheChecks+=5;
for(const color of [[0,0,0],[40,35,30],[255,255,255],[245,238,210],[120,120,120],[90,180,190]])for(const alpha of [0,1,128,255]){
  const source=new Uint8ClampedArray([...color,alpha]),copy=new Uint8ClampedArray(source),out=eggEmissionPixels(source);
  assert.deepEqual(source,copy);assert.ok(out[3]<=alpha);
  if(alpha===0||Math.max(...color)<=48)assert.equal(out[3],0);
  if(alpha===255&&Math.max(...color)>200)assert.ok(out[3]>0,'bright neutral ivory emits');
  assert.deepEqual(eggEmissionPixels(source,0),new Uint8ClampedArray(4));report.emissionChecks++;
}
assert.throws(()=>eggEmissionPixels([1,2]),/RGBA/);assert.throws(()=>eggEmissionPixels([1,2,3,4],NaN),/Finite/);
assert.throws(()=>createPickupNeonMaterial(),/factory/);report.emissionChecks+=3;
console.log(JSON.stringify({passed:true,...report,interpretation:'Native80/160 material/emission pixels, immutable eight-frame cache, no warm-readbacks, quality disposal and loss recovery. Scene lighting/occlusion requires browser integration QA.'},null,2));
