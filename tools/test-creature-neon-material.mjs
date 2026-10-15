// Fake WebGL tests lifecycle/protocol, not driver pixel output. Real-browser
// comparison against neon-material.js is required before visual acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {createCreatureNeonMaterial,CREATURE_NEON_FRAGMENT} from '../src/render/creature-neon-material.js';
import {enhancePixels,emissionPixels} from '../src/render/neon-material.js';
const require=createRequire(import.meta.url);let native;
for(const location of ['@napi-rs/canvas',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')]){try{native=require(location);break;}catch{}}
assert.ok(native,'Native Canvas dependency required');const {createCanvas}=native;
const report={protocol:0,lifecycle:0,materialReference:0};
function fixture({unavailable=false,compile=true,link=true,failTexture=false}={}){
  const canvases=[],resources=new Set(),calls={},enums=new Map(),contexts=[],eventSets=[];let serial=1,liveLost=false;
  const shaders=[];
  const gl=new Proxy({isContextLost:()=>liveLost,getExtension:()=>({loseContext(){calls.lose=(calls.lose||0)+1;}})}, {get(target,key){
    if(key in target)return target[key];
    if(/^[A-Z0-9_]+$/.test(key)){if(!enums.has(key))enums.set(key,serial++);return enums.get(key);}
    if(/^create(Shader|Program|Buffer|Texture)$/.test(key))return()=>{if(failTexture&&key==='createTexture')return null;const resource={kind:key,id:serial++};resources.add(resource);return resource;};
    if(/^delete/.test(key))return resource=>resources.delete(resource);
    if(key==='getShaderParameter')return()=>compile;
    if(key==='getProgramParameter')return()=>link;
    if(key==='getUniformLocation')return()=>({});
    if(key==='getShaderInfoLog'||key==='getProgramInfoLog')return()=>'';
    if(key==='shaderSource')return(_shader,source)=>shaders.push(source);
    if(key==='readPixels')return()=>{throw Error('Forbidden frame readback');};
    return(...args)=>{calls[key]=(calls[key]||0)+1;(calls[key+'Args']??=[]).push(args);};
  }});
  const makeCanvas=(w,h)=>{
    const canvas=createCanvas(w,h),get=canvas.getContext.bind(canvas),events=new Map();let wrapped=false;
    canvas.getContext=(type,...args)=>{
      if(type==='webgl'){calls.webglOptions=args[0];return unavailable?null:gl;}
      const ctx=get(type,...args);
      if(!wrapped){wrapped=true;ctx.getImageData=()=>{throw Error('Forbidden CPU pixel read');};contexts.push(ctx);}
      return ctx;
    };
    canvas.addEventListener=(name,fn)=>events.set(name,fn);
    canvas.removeEventListener=(name,fn)=>{assert.equal(events.get(name),fn);events.delete(name);};
    canvases.push(canvas);eventSets.push(events);return canvas;
  };
  return {makeCanvas,gl,canvases,resources,calls,shaders,eventSets,contexts,setLost:value=>{liveLost=value;}};
}
const source=createCanvas(80,80);source.getContext('2d').fillRect(0,0,80,80);
const f=fixture(),service=createCreatureNeonMaterial({makeCanvas:f.makeCanvas});
assert.equal(service.stats().bytes,0);assert.equal(f.canvases.length,0,'construction is lazy');
const first=service.process(source);assert.ok(first);assert.equal(first.material.width,80);assert.equal(first.emission.height,80);
assert.equal(f.canvases.length,3);assert.equal(f.calls.texImage2D,1);assert.equal(f.calls.drawArrays,2);assert.equal(f.calls.bufferData,1);
assert.equal(service.stats().bytes,80*80*16+48);assert.equal(service.stats().readbacks,0);assert.equal(service.stats().cachedSources,0);
assert.equal(f.shaders[1],CREATURE_NEON_FRAGMENT,'the public shader string is the compiled shader');
assert.equal(f.calls.webglOptions.premultipliedAlpha,true,'output framebuffer already matches Canvas premultiplied storage');
assert.match(CREATURE_NEON_FRAGMENT,/vec3 premultiplied=floor\(value\.rgb\*value\.a\*255\.0\+\.5\)\/255\.0;/,'only final storage converts straight-RGBA math to rounded premultiplied bytes');
const material=first.material,emission=first.emission;
for(let i=0;i<20;i++){source.getContext('2d').fillStyle=i%2?'red':'blue';source.getContext('2d').fillRect(0,0,80,80);assert.equal(service.process(source),first);}
assert.equal(f.calls.texImage2D,21,'mutable source always reuploads, even at identical object identity');
assert.equal(f.calls.drawArrays,42);assert.equal(f.canvases.length,3);assert.equal(f.calls.bufferData,1);
assert.equal(first.material,material);assert.equal(first.emission,emission);
service.process(source,{strength:0});assert.equal(service.stats().strength,.7,'per-call strength does not mutate default');
assert.equal(service.setStrength(3),2);assert.equal(service.setStrength(-1),0);
assert.throws(()=>service.setStrength(NaN),/finite/);
for(const [w,h]of [[160,160],[320,160],[512,512],[80,80]]){
  assert.ok(service.process(createCanvas(w,h)));assert.equal(first.material.width,w);assert.equal(first.emission.height,h);
  assert.ok(service.stats().bytes<=service.stats().maximumBytes);
}
assert.equal(f.canvases.length,3,'quality and pose-size changes reuse the fixed surface set');
report.protocol+=27;
let prevented=false;f.eventSets[0].get('webglcontextlost')({preventDefault(){prevented=true;}});
const before=f.calls.texImage2D;assert.equal(service.process(source),null);assert.ok(prevented);assert.equal(f.calls.texImage2D,before);
f.eventSets[0].get('webglcontextrestored')();assert.ok(service.process(source));assert.equal(service.stats().recoveries,1);
assert.ok(f.canvases.slice(0,3).every(canvas=>canvas.width===1&&canvas.height===1));
f.setLost(true);assert.equal(service.process(source),null);f.setLost(false);assert.equal(service.process(source),null,'polling restoration schedules complete rebuild');
assert.ok(service.process(source));assert.equal(service.stats().recoveries,2);
service.reset();assert.equal(service.stats().bytes,0);assert.equal(f.resources.size,0);assert.ok(f.eventSets.every(events=>events.size===0));
assert.ok(service.process(source));service.invalidate('quality');assert.equal(service.stats().lastInvalidation,'quality');
assert.ok(service.process(source));service.dispose();service.dispose();assert.equal(service.process(source),null);assert.equal(service.stats().bytes,0);assert.equal(f.resources.size,0);
assert.ok(f.canvases.every(canvas=>canvas.width===1&&canvas.height===1));assert.ok(f.eventSets.every(events=>events.size===0));
report.lifecycle+=18;
for(const options of [{unavailable:true},{compile:false},{link:false},{failTexture:true}]){
  const broken=fixture(options),renderer=createCreatureNeonMaterial({makeCanvas:broken.makeCanvas});
  assert.equal(renderer.process(source),null);assert.equal(broken.resources.size,0);assert.equal(renderer.stats().bytes,0);
  const allocations=broken.canvases.length;
  for(let i=0;i<20;i++)assert.equal(renderer.process(source),null);
  assert.equal(broken.canvases.length,allocations,'failed GPU path cannot allocate again each frame');
  renderer.invalidate();assert.equal(renderer.process(source),null);assert.ok(broken.canvases.length>allocations);
  renderer.dispose();assert.ok(broken.eventSets.every(events=>events.size===0));report.lifecycle+=7;
}
const limits=fixture(),bounded=createCreatureNeonMaterial({makeCanvas:limits.makeCanvas});
assert.equal(bounded.process(createCanvas(513,1)),null);assert.equal(limits.canvases.length,0);bounded.reset();assert.ok(bounded.process(source));bounded.dispose();
assert.throws(()=>createCreatureNeonMaterial({maxSize:769}),/768/);assert.throws(()=>createCreatureNeonMaterial({strength:Infinity}),/finite/);
const large=fixture(),scorpion=createCreatureNeonMaterial({makeCanvas:large.makeCanvas,maxSize:768});
assert.equal(scorpion.stats().maxSize,768);assert.ok(scorpion.process(createCanvas(672,672)),'explicit large bound covers native4K scorpion capture');
assert.equal(scorpion.stats().bytes,672*672*16+48);assert.ok(scorpion.stats().bytes<=768*768*16+48);scorpion.dispose();
assert.equal(large.resources.size,0);report.protocol+=4;
// Pin reference semantics for the shader review. Fake GL does NOT validate
// shader arithmetic; the browser must compare complete canvas round trips.
for(const rgba of [[0,0,0,255],[255,255,255,255],[48,0,0,255],[90,85,78,255],[255,20,70,255],[50,220,80,128],[100,40,190,1],[0,0,0,0]])for(const strength of [0,.7,1,2]){
  const input=new Uint8ClampedArray(rgba),copy=new Uint8ClampedArray(input),material=enhancePixels(input,strength),emission=emissionPixels(input,strength);
  assert.deepEqual(input,copy);assert.equal(material[3],input[3]);assert.ok(emission[3]<=input[3]);
  if(strength===0){assert.deepEqual(material,input);assert.deepEqual(emission,new Uint8ClampedArray(4));}
  report.materialReference++;
}
assert.match(CREATURE_NEON_FRAGMENT,/high>48\.0&&high-low>12\.0/);
assert.match(CREATURE_NEON_FRAGMENT,/smoothstep\(\.13,\.45,saturation\)\*smoothstep\(\.20,\.48,value\)/);
assert.match(CREATURE_NEON_FRAGMENT,/smoothstep\(\.18,\.52,saturation\),interior=smoothstep\(\.22,\.55,value\)/);
assert.match(CREATURE_NEON_FRAGMENT,/source\.a\/255\.0/);
console.log(JSON.stringify({passed:true,...report,interpretation:'Protocol, allocation, failure and lifecycle checks; actual GPU material and alpha pixels still require browser comparison with canonical CPU formulas.'},null,2));
