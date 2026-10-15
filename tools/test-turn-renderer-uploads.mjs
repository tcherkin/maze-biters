// Operation/lifecycle regression coverage, not a substitute for real GPU pixels.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {createTurnRenderer} from '../src/render/fantasy-turn/renderer.js';
import {createDragonTurnRenderer} from '../src/render/dragon-turn/renderer.js';
import {dragonTurnRig} from '../src/render/dragon-turn/rig.js';

const require=createRequire(import.meta.url);let native;
for(const location of ['@napi-rs/canvas',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')]){
  try{native=require(location);break;}catch{}
}
assert.ok(native,'Native Canvas dependency required');
const {createCanvas}=native,report={geometryScenarios:0,capScenarios:0,lifecycleScenarios:0};
function fakeContext(requireCaps=false,failBuffer=false){
  const resources=new Set(),calls={},enums=new Map(),bound=new Map(),complete=new Set(),uploads=[],deletedBound=[];
  let next=100,activeUnit=0,currentBuffer=null,bufferData=null;
  const count=name=>{calls[name]=(calls[name]||0)+1;};
  const target={resources,calls,uploads,complete,bound,deletedBound,isContextLost:()=>false,
    getExtension:()=>({loseContext(){count('loseContext');}}),
    activeTexture(value){activeUnit=value-gl.TEXTURE0;},
    bindTexture(_type,value){bound.set(activeUnit,value);},
    texImage2D(...args){
      count('texImage2D');const texture=bound.get(activeUnit);assert.ok(texture,'upload has a bound texture');
      complete.add(texture);uploads.push({unit:activeUnit,texture,placeholder:args.length===9&&args[3]===1&&args[4]===1});
    },
    bindBuffer(_type,value){currentBuffer=value;},
    bufferData(_type,value){assert.ok(currentBuffer);count('bufferData');bufferData=value;},
    drawArrays(){
      assert.ok(currentBuffer&&bufferData?.length,'draw retains populated geometry');
      if(requireCaps)for(const unit of [6,7])assert.ok(complete.has(bound.get(unit))&&resources.has(bound.get(unit)),`cap sampler ${unit} is live and complete on every draw`);
      count('drawArrays');
    },
  };
  const gl=new Proxy(target,{get(object,key){
    if(key in object)return object[key];
    if(/^[A-Z0-9_]+$/.test(key)){if(!enums.has(key))enums.set(key,next++);return enums.get(key);}
    if(/^create(Shader|Program|Buffer|Texture)$/.test(key))return()=>{
      if(failBuffer&&key==='createBuffer')return null;
      const value={kind:key,id:next++};resources.add(value);return value;
    };
    if(/^delete(Shader|Program|Buffer|Texture)$/.test(key))return value=>{
      if(key==='deleteTexture'&&[6,7].some(unit=>bound.get(unit)===value))deletedBound.push(value);
      count(key);resources.delete(value);complete.delete(value);
    };
    if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
    if(key==='getUniformLocation')return()=>({});
    if(key==='getShaderInfoLog'||key==='getProgramInfoLog')return()=>'';
    return()=>count(key);
  }});return gl;
}
function fixture(kind,size,{failBuffer=false}={}){
  const gl=fakeContext(kind==='dragon',failBuffer),surfaces=[],listeners=new Map();let nativeDraws=0,capCopies=0;
  const factory=()=>{
    const canvas=createCanvas(size,size),get=canvas.getContext.bind(canvas);let wrapped=false;
    canvas.getContext=(name,...args)=>{
      if(name==='webgl')return gl;
      const ctx=get(name,...args);
      if(name==='2d'&&!wrapped){wrapped=true;const put=ctx.putImageData.bind(ctx);ctx.putImageData=(...values)=>{capCopies++;return put(...values);};}
      return ctx;
    };
    canvas.addEventListener=(name,fn)=>listeners.set(name,fn);
    canvas.removeEventListener=(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);};
    surfaces.push(canvas);return canvas;
  };
  const drawPose=(ctx,variant,direction,closure,blink,x,y,s)=>{
    nativeDraws++;ctx.fillStyle=variant==='h3'?'#804090':'#954060';
    ctx.beginPath();ctx.ellipse(x+s/2,y+s/2,s*.39,s*.40,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#306050';ctx.fillRect(x+s*.35,y+s*(.7+.01*closure),s*.2,s*.1);
  };
  const drawMaskPose=(ctx,_variant,_direction,_closure,x,y,s)=>{ctx.fillStyle='#fff';ctx.fillRect(x+s*.4,y+s*.6,s*.2,s*.1);};
  const create=kind==='dragon'?createDragonTurnRenderer:createTurnRenderer;
  const args={size,drawPose,drawMaskPose,canvasFactory:factory,...(kind==='dragon'?{artRig:dragonTurnRig}:{})};
  let renderer;
  if(failBuffer){assert.throws(()=>create(args),/allocate turn buffer/);return{gl,surfaces,listeners};}
  renderer=create(args);const ctx=createCanvas(size,size).getContext('2d');
  const draw=(pose={from:'right',to:'down',mix:.25},closure=18/48,variant='h1',blink=0)=>renderer.draw(ctx,variant,pose,closure,blink,0,0,size);
  return{gl,renderer,surfaces,listeners,draw,ctx,nativeDraws:()=>nativeDraws,capCopies:()=>capCopies};
}
const front={from:'right',to:'down',mix:.25},back={from:'right',to:'up',mix:.25};
for(const size of [80,160])for(const kind of ['player','dragon']){
  const f=fixture(kind,size),{renderer,gl}=f,initialSurfaces=f.surfaces.length;
  f.draw({from:'right',to:'right',mix:0});
  assert.equal(gl.calls.bufferData||0,0,'native endpoints bypass GPU geometry');
  f.draw(front);assert.equal(gl.calls.bufferData,1);
  for(const mix of [.3,.4,.5,.7])f.draw({...front,mix});
  f.draw(front,18/48,'h3',.5);
  assert.equal(gl.calls.bufferData,1,'phase, pigment and blink reuse the same immutable geometry');
  assert.equal(renderer.diagnostics().geometryUploadCount,1);
  f.draw(front,19/48);assert.equal(gl.calls.bufferData,2,'different mouth geometry replaces the single buffer');
  f.draw(front);assert.equal(gl.calls.bufferData,3,'returning to cached CPU geometry still replaces a different GPU buffer');
  f.draw(back);assert.equal(gl.calls.bufferData,4,'front/back topology switch uploads');
  f.draw({from:'left',to:'up',mix:.25});assert.equal(gl.calls.bufferData,5,'mirror-specific topology switch uploads');
  assert.equal(f.surfaces.length,initialSurfaces,'drawing does not allocate additional canvas surfaces');
  if(kind==='player'){
    f.draw(back);const before=gl.calls.bufferData;
    renderer.drawMask(f.ctx,'h1',back,18/48,0,0,size);
    assert.equal(gl.calls.bufferData,before,'aperture shader shares the populated art buffer');
    f.draw({...back,mix:.65});assert.equal(gl.calls.bufferData,before,'return from aperture shader retains geometry');
    assert.equal(renderer.diagnostics().maskDrawCount,1);
  }
  report.geometryScenarios+=9;
  const beforeLoss=gl.calls.drawArrays;let prevented=false;
  f.listeners.get('webglcontextlost')({preventDefault(){prevented=true;}});
  assert.ok(prevented);assert.equal(renderer.diagnostics().lost,true);
  assert.throws(()=>f.draw(front),/unavailable/);assert.throws(()=>renderer.warm('h1'),/unavailable/);
  assert.equal(gl.calls.drawArrays,beforeLoss,'a lost context cannot issue more draws');
  renderer.dispose();renderer.dispose();
  assert.equal(gl.resources.size,0);assert.equal(gl.calls.loseContext,1);assert.equal(f.listeners.size,0);
  assert.ok(f.surfaces.every(canvas=>canvas.width===1&&canvas.height===1));
  const d=renderer.diagnostics();assert.equal(d.geometryEntries,0);assert.equal(d.silhouetteEntries,0);assert.equal(d.nativeSurfaceCount,0);
  if(kind==='dragon'){assert.equal(d.cleanCapEntries,0);assert.equal(d.cleanCapTextureBytes,0);}
  assert.throws(()=>f.draw(front),/unavailable/);
  const rebuilt=fixture(kind,size);rebuilt.draw(front);assert.equal(rebuilt.gl.calls.bufferData,1,'fresh context cannot inherit stale buffer identity');rebuilt.renderer.dispose();
  const failed=fixture(kind,size,{failBuffer:true});assert.equal(failed.gl.resources.size,0);assert.equal(failed.listeners.size,0);
  assert.ok(failed.surfaces.every(canvas=>canvas.width===1&&canvas.height===1));report.lifecycleScenarios+=10;
}
for(const size of [80,160]){
  const f=fixture('dragon',size),{renderer,gl}=f;
  assert.equal(gl.uploads.length,2,'only two complete placeholder textures are initialized');
  assert.ok(gl.uploads.every(upload=>upload.placeholder&&[6,7].includes(upload.unit)));
  f.draw(front);f.draw({...front,mix:.6},19/48,'h3',.5);f.draw(front);
  let d=renderer.diagnostics();assert.equal(d.capBuildCount,0);assert.equal(d.capUploadCount,0);assert.equal(d.cleanCapBytes,0);assert.equal(f.capCopies(),0);
  const before=f.nativeDraws();f.draw(back);
  d=renderer.diagnostics();assert.equal(d.capBuildCount,2);assert.equal(d.capUploadCount,2);assert.equal(d.cleanCapEntries,2);
  assert.equal(f.nativeDraws()-before,3,'cached side RGBA still prepares its missing cap; rear prepares RGBA plus cap');
  f.draw(front);f.draw(back);
  assert.equal(renderer.diagnostics().capBuildCount,2);assert.equal(renderer.diagnostics().capUploadCount,2,'front turns do not overwrite the resident cap textures');
  f.draw(back,18/48,'h3');f.draw(back);
  d=renderer.diagnostics();assert.equal(d.capBuildCount,4);assert.equal(d.capUploadCount,4,'A/B/A binds retained textures without Canvas copies or GPU uploads');
  assert.equal(f.capCopies(),4);
  f.draw(back,19/48);d=renderer.diagnostics();assert.equal(d.capBuildCount,5);assert.equal(d.capUploadCount,5,'only rear hidden material depends on closure');
  f.draw(back,19/48,'h1',.5);assert.equal(renderer.diagnostics().capUploadCount,5,'blink cannot invalidate cap material');
  assert.equal(gl.uploads.filter(upload=>upload.placeholder).length,2,'placeholders do not recur per draw');
  assert.equal(gl.resources.size,13,'one program, one buffer, four source/shape textures, two placeholders and five cached caps');
  assert.equal(d.cleanCapStorage,'gpu');assert.equal(d.cleanCapBytes,0);assert.equal(d.cleanCapTextureEntries,5);assert.equal(d.cleanCapTextureBytes,5*size*size*4);
  // Warm on source0 while source1 still has an old texture bound. Eviction
  // must detach that sampler, and identical native RGBA cannot hide a cap miss.
  for(let variant=0;variant<22;variant++)renderer.warm('evict'+variant,19/48);
  d=renderer.diagnostics();assert.equal(d.cleanCapEntries,64);assert.equal(d.cleanCapTextureBytes,64*size*size*4);
  assert.ok(d.capEvictionCount>0);assert.equal(gl.deletedBound.length,0,'LRU eviction rebinds any live cap sampler before deletion');
  assert.equal(gl.resources.size,72,'GPU cap resource count is bounded at64 plus fixed renderer resources');
  assert.equal(gl.calls.deleteTexture,d.capEvictionCount,'every evicted cap texture is deleted exactly once');
  const evictedBuilds=d.capBuildCount,evictedUploads=d.capUploadCount;
  f.draw(back,19/48,'h1',.5);d=renderer.diagnostics();
  assert.equal(d.capBuildCount,evictedBuilds+2,'evicted cap is rebuilt even when source1 native RGBA key did not change');
  assert.equal(d.capUploadCount,evictedUploads+2);assert.equal(gl.deletedBound.length,0);
  const reused=d.capUploadCount;f.draw(front);f.draw(back,19/48,'h1',.5);
  assert.equal(renderer.diagnostics().capUploadCount,reused,'front placeholders do not lose cached GPU cap textures');
  renderer.dispose();
  assert.equal(gl.resources.size,0);assert.equal(renderer.diagnostics().cleanCapTextureBytes,0);
  const warm=fixture('dragon',size);
  for(const palette of ['h1','h3','h4'])for(const frame of [0,12,13,14,15,16,17,18,19,48])warm.renderer.warm(palette,frame/48);
  d=warm.renderer.diagnostics();assert.equal(d.cleanCapEntries,36);assert.equal(d.capBuildCount,36);assert.equal(d.cleanCapBytes,0);assert.equal(d.cleanCapTextureBytes,36*size*size*4);
  assert.equal(d.geometryUploadCount,0,'warming CPU cages does not overwrite the resident GPU buffer');
  assert.equal(d.maximumCleanCapEntries,64,'GPU cache replaces the old CPU cache at the same entry bound');
  const warmBuilds=d.capBuildCount;warm.draw(front);assert.equal(warm.renderer.diagnostics().capBuildCount,warmBuilds);
  warm.renderer.dispose();report.capScenarios+=23;
}
console.log(JSON.stringify({passed:true,...report,interpretation:'Simulated WebGL verifies skipped work, complete samplers and lifecycle only. Exact intermediate pixels and driver compilation require the independent browser comparison.'},null,2));
