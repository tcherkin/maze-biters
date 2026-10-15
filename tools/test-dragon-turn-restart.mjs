// Production parity with the approved isolated Dragon Kin turn. Fake WebGL
// checks resource/API behavior only; qa/dragon-turn-browser.js checks pixels.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire,registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=new URL('../',import.meta.url),study=process.env.DRAGON_RESTART_STUDY?pathToFileURL(process.env.DRAGON_RESTART_STUDY.replaceAll('\\','/')+'/'):
  new URL('../../../2026-08-24/maze-biters-work-chat-crash-git/experiments/dragon-kin-review/',root);
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('/game/')?new URL(specifier.slice(6),root).href:specifier,context);}});
const [production,reference,pMaterial,rMaterial,pClean,rClean,pRenderer,rRenderer]=await Promise.all([
  import('../src/render/dragon-turn/rig.js'),import(new URL('restart-rig.js',study)),
  import('../src/render/dragon-turn/cylinder.js'),import(new URL('restart-cylinder.js',study)),
  import('../src/render/dragon-turn/cap-cleaner.js'),import(new URL('restart-cap-cleaner.js',study)),
  import('../src/render/dragon-turn/renderer.js'),import(new URL('restart-renderer.js',study))]);
const {loadDragonKinArt,DRAGON_KIN_PALETTES}=await import('../src/render/dragon-kin-art.js');
const {composeFantasyPose}=await import('../src/render/fantasy-player-art.js');
const {FANTASY_TURN_MS,createFantasyTurnClock}=await import('../src/render/fantasy-turn-clock.js');
const {planTurn,sampleTurn,DIRECTIONS}=await import('../src/render/fantasy-turn/turn.js');
const {projectedTriangleBound}=await import('../src/render/fantasy-turn/back-projection.js');
const require=createRequire(import.meta.url);let native;
for(const location of ['@napi-rs/canvas',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')]){try{native=require(location);break;}catch{}}
assert.ok(native,'Native Canvas dependency required');const {createCanvas,loadImage}=native;
const close=(a,b,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-8,label);
const equalPixels=(a,b,label)=>assert.ok(a.length===b.length&&Buffer.from(a).equals(Buffer.from(b)),label);
const report={cages:0,triangleBounds:0,materialPoses:0,leafMappings:0,stencilCases:0,stencilLimits:0,masks:0,cleanerCases:0,nativePoses:0,endpointChecks:0,lifecycleChecks:0};
assert.equal(production.dragonTurnRig.fragment,reference.restartDragonKinRig.fragment,'production uses the exact approved GPU shader');
assert.equal(pMaterial.dragonCylinderGLSL,rMaterial.restartCylinderGLSL,'approved cap and per-leaf shaders are unchanged');
function rendererBody(text,optimized=false){
  text=text.replaceAll('\r\n','\n');
  text=text.slice(text.indexOf('const vertex')).replaceAll('createCleanCapTurnRenderer','createDragonTurnRenderer');
  if(!optimized)return text;
  // Permit only the reviewed upload-orchestration and additive eye-pass changes. Reverse each exact
  // hunk once, then still compare the ENTIRE implementation with the approved
  // experiment. Shader text, geometry, composition and all other code remain
  // pinned; operation/lifecycle behavior has its own focused regression test.
  const reverse=(label,current,approved)=>{
    assert.equal(text.split(current).length-1,1,`${label}: exactly one reviewed orchestration hunk`);
    text=text.replace(current,approved);
  };
  // The optional eye pass has separate resources and never changes the main
  // art shader/geometry. Remove exactly these reviewed additions before the
  // older orchestration reversal and full approved-source comparison.
  reverse('optional eye argument',
    'export function createDragonTurnRenderer({size,drawPose,drawMaskPose,drawEyeMaskPose,canvasFactory,artRig=null}={}){',
    'export function createDragonTurnRenderer({size,drawPose,drawMaskPose,canvasFactory,artRig=null}={}){');
  reverse('optional eye validation',"  if(drawEyeMaskPose!==undefined&&typeof drawEyeMaskPose!=='function')throw new TypeError('Invalid turn eye compositor');\n",'');
  reverse('eye program counters','  let eyeProgram=null,eyeDrawCount=0,eyeUploadCount=0,eyeFailure=null;\n','');
  reverse('eye source list','  const shaders=new Set(),programs=new Set(),textures=new Set(),sources=[],maskSources=[],eyeSources=[];',
    '  const shaders=new Set(),programs=new Set(),textures=new Set(),sources=[],maskSources=[];');
  reverse('eye source disposal','    for(const entry of [...sources,...maskSources,...eyeSources]){','    for(const entry of [...sources,...maskSources]){');
  reverse('eye list disposal','    sources.length=maskSources.length=eyeSources.length=0;','    sources.length=maskSources.length=0;');
  reverse('eye surface parameter','  function surfaceEntry(unit,mask=false,eye=false){','  function surfaceEntry(unit,mask=false){');
  reverse('eye source registration','    (eye?eyeSources:mask?maskSources:sources).push(entry);','    (mask?maskSources:sources).push(entry);');
  const eyeStart=text.indexOf('  // A separate optional pass:'),eyeEnd=text.indexOf('  function diagnostics(){',eyeStart);
  assert.ok(eyeStart>=0&&eyeEnd>eyeStart,'unique optional eye pass before diagnostics');
  const eyePass=text.slice(eyeStart,eyeEnd);
  assert.equal(createHash('sha256').update(eyePass).digest('hex'),'36fb867d8671fbde3465b73fb14174d60a95b9f8d3e836d5cfa3fc305a01bda2','reviewed additive eye pass including isolated optional-allocation cleanup, not arbitrary renderer edits');
  reverse('additive eye pass',eyePass,'');
  reverse('eye diagnostics',
`      nativeSurfaceCount:disposed?0:1+sources.length*2+maskSources.length+eyeSources.length,maskReady:!!maskProgram&&!disposed,
      eyeMaskReady:!!eyeProgram&&!disposed,eyeDrawCount,eyeUploadCount,eyeFailure,lost,disposed};`,
    '      nativeSurfaceCount:disposed?0:1+sources.length*2+maskSources.length,maskReady:!!maskProgram&&!disposed,lost,disposed};');
  reverse('optional eye export','  return {draw,drawMask,drawEyeMask,warm,diagnostics,dispose};','  return {draw,drawMask,warm,diagnostics,dispose};');
  reverse('GPU-only cap cache comment','  // Cache native GPU textures, not an additional retained CPU pixel copy.\n','');
  reverse('cap sampler tracking',
    '      entry.capTexture=textureAt(unit+6);entry.capUnit=unit+6;entry.activeCapTexture=entry.capTexture;',
    '      entry.capTexture=textureAt(unit+6);entry.capKey=null;');
  reverse('front cap placeholder state','    entry.activeCapTexture=entry.capTexture;\n','');
  reverse('bounded GPU cap LRU',
`    // Always consult the LRU: a previously used key may have been evicted.
    let texture=cleanCaps.get(capKey);
    if(texture){cleanCaps.delete(capKey);cleanCaps.set(capKey,texture);}
    else{
      entry.capCtx.clearRect(0,0,s,s);
      drawPose(entry.capCtx,variant,direction,capFrame/48,0,0,0,s);
      const original=entry.capCtx.getImageData(0,0,s,s);
      const result=createCleanCapPixels({data:original.data,size:s,direction,closure:capFrame/48});
      capMaximumIterations=Math.max(capMaximumIterations,result.iterations);capBuildCount++;
      // Keep the original ImageData -> Canvas -> premultiplied upload path;
      // changing it to a raw typed-array upload would alter byte rounding.
      entry.capImage.data.set(result.data);entry.capCtx.putImageData(entry.capImage,0,0);
      texture=textureAt(unit+6);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,entry.capSurface);
      cleanCaps.set(capKey,texture);capUploadCount++;
    }
    gl.activeTexture(gl.TEXTURE0+unit+6);gl.bindTexture(gl.TEXTURE_2D,texture);entry.activeCapTexture=texture;
    if(cleanCaps.size>MAX_CLEAN_CAPS){
      const oldest=cleanCaps.keys().next().value,evicted=cleanCaps.get(oldest);
      // Eviction can invalidate the other source unit (including after warm).
      // Bind its complete placeholder before deleting the texture object.
      for(const source of sources)if(source.activeCapTexture===evicted){
        gl.activeTexture(gl.TEXTURE0+source.capUnit);gl.bindTexture(gl.TEXTURE_2D,source.capTexture);
        source.activeCapTexture=source.capTexture;
      }
      cleanCaps.delete(oldest);textures.delete(evicted);gl.deleteTexture(evicted);capEvictionCount++;
    }`,
`    if(entry.capKey!==capKey){
      let pixels=cleanCaps.get(capKey);
      if(pixels){cleanCaps.delete(capKey);cleanCaps.set(capKey,pixels);}
      else{
        entry.capCtx.clearRect(0,0,s,s);
        drawPose(entry.capCtx,variant,direction,capFrame/48,0,0,0,s);
        const original=entry.capCtx.getImageData(0,0,s,s);
        const result=createCleanCapPixels({data:original.data,size:s,direction,closure:capFrame/48});
        pixels=result.data;capMaximumIterations=Math.max(capMaximumIterations,result.iterations);capBuildCount++;
        cleanCaps.set(capKey,pixels);
        if(cleanCaps.size>MAX_CLEAN_CAPS){cleanCaps.delete(cleanCaps.keys().next().value);capEvictionCount++;}
      }
      entry.capImage.data.set(pixels);entry.capCtx.putImageData(entry.capImage,0,0);
      gl.activeTexture(gl.TEXTURE0+unit+6);gl.bindTexture(gl.TEXTURE_2D,entry.capTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,entry.capSurface);
      entry.capKey=capKey;capUploadCount++;
    }`);
  reverse('separate GPU and CPU cap ledger',
`      cleanCapEntries:cleanCaps.size,cleanCapBytes:0,maximumCleanCapEntries:MAX_CLEAN_CAPS,
      cleanCapStorage:'gpu',cleanCapTextureEntries:cleanCaps.size,cleanCapTextureBytes:cleanCaps.size*s*s*4,`,
    '      cleanCapEntries:cleanCaps.size,cleanCapBytes:cleanCaps.size*s*s*4,maximumCleanCapEntries:MAX_CLEAN_CAPS,');
  reverse('geometry state',
    '  let lost=false,disposed=false,program=null,maskProgram=null,buffer=null,lastGeometry=null;\n  let geometryUploadCount=0;',
    '  let lost=false,disposed=false,program=null,maskProgram=null,buffer=null;');
  reverse('geometry disposal','    buildSilhouette=null;lastGeometry=null;','    buildSilhouette=null;');
  reverse('complete front-only cap samplers',
`      // Front turns never sample the cap, but all active samplers must remain
      // complete even when a front pose is the renderer's very first draw.
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
`, '');
  reverse('explicit cap demand','  function upload(unit,variant,direction,closure,blink,includeCap=false){','  function upload(unit,variant,direction,closure,blink){');
  reverse('independent RGBA and cap readiness',
`    if(entry.key!==key){
      entry.ctx.clearRect(0,0,s,s);
      drawPose(entry.ctx,variant,direction,closure,blink,0,0,s);
      const shapeKey=JSON.stringify([variant,direction,frame]);
      if(entry.shapeKey!==shapeKey){
        const shape=shapeFor(shapeKey,entry.ctx);
        gl.activeTexture(gl.TEXTURE0+unit+2);gl.bindTexture(gl.TEXTURE_2D,entry.shapeTexture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,s,s,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,shape);
        entry.shapeKey=shapeKey;
      }
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,entry.surface);
      entry.key=key;uploadCount++;
    }
    // A prior front draw may already have the same RGBA key but no cap yet.
    // Keep hidden-material readiness independent of the native-color cache.
    if(!includeCap)return;`,
`    if(entry.key===key)return;
    entry.ctx.clearRect(0,0,s,s);
    drawPose(entry.ctx,variant,direction,closure,blink,0,0,s);
    const shapeKey=JSON.stringify([variant,direction,frame]);
    if(entry.shapeKey!==shapeKey){
      const shape=shapeFor(shapeKey,entry.ctx);
      gl.activeTexture(gl.TEXTURE0+unit+2);gl.bindTexture(gl.TEXTURE_2D,entry.shapeTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,s,s,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,shape);
      entry.shapeKey=shapeKey;
    }
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,entry.surface);`);
  reverse('RGBA counter location',
`      entry.capKey=capKey;capUploadCount++;
    }
  }
  function geometryFor`,
`      entry.capKey=capKey;capUploadCount++;
    }
    entry.key=key;uploadCount++;
  }
  function geometryFor`);
  reverse('same typed-array upload guard',
`    gl.useProgram(entry.program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    // Both art and aperture passes share this buffer. Cached geometry is
    // immutable, so a different program/phase alone never needs another copy.
    if(lastGeometry!==data){gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);lastGeometry=data;geometryUploadCount++;}`,
    '    gl.useProgram(entry.program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);');
  reverse('back-only art cap demand',
`    const includeCap=pair.kind==='back';
    upload(0,variant,pair.side,closure,blink,includeCap);upload(1,variant,pair.end,closure,blink,includeCap);`,
    '    upload(0,variant,pair.side,closure,blink);upload(1,variant,pair.end,closure,blink);');
  reverse('back-only aperture cap demand',
`    const includeCap=pair.kind==='back';
    upload(0,variant,pair.side,closure,0,includeCap);upload(1,variant,pair.end,closure,0,includeCap);`,
    '    upload(0,variant,pair.side,closure,0);upload(1,variant,pair.end,closure,0);');
  reverse('omit unused down cap warmup',
    "    for(const direction of DIRECTIONS)upload(0,variant,direction,closure,0,direction!=='down');",
    '    for(const direction of DIRECTIONS)upload(0,variant,direction,closure,0);');
  reverse('geometry upload diagnostics',
    '    return {nativeSize:s,drawCount,uploadCount,maskDrawCount,maskUploadCount,warmCount,evictionCount,geometryUploadCount,',
    '    return {nativeSize:s,drawCount,uploadCount,maskDrawCount,maskUploadCount,warmCount,evictionCount,');
  return text;
}
assert.equal(rendererBody(await readFile(new URL('src/render/dragon-turn/renderer.js',root),'utf8'),true),
  rendererBody(await readFile(new URL('restart-renderer.js',study),'utf8')),'apart from exact reviewed upload orchestration and additive eye-pass extension, the primary renderer remains the approved experiment');
const adapter=await readFile(new URL('src/render/fantasy-player-turn.js',root),'utf8');
assert.match(adapter,/family==='hunter'[\s\S]{0,160}dragon-turn\/renderer\.js[^\n]*createDragonTurnRenderer/,'hunters select the new renderer');
assert.match(adapter,/family==='hunter'[^\n]*dragon-turn\/rig\.js[^\n]*dragonTurnRig/,'hunters select the new anatomy');
assert.ok(!adapter.includes("import('./dragon-kin-turn.js"),'legacy anatomy is not the active enemy pipeline');
assert.ok(adapter.includes("import('./fantasy-turn/renderer.js"),'protagonists keep their own renderer');
assert.deepEqual(DRAGON_KIN_PALETTES,['h1','h3','h4']);assert.equal(FANTASY_TURN_MS,90);
for(const from of DIRECTIONS)for(const to of DIRECTIONS)if(from!==to){const plan=planTurn(from,to);assert.equal(sampleTurn(plan,1).done,true);}
assert.equal(typeof createFantasyTurnClock,'function');
for(const kind of ['front','back'])for(const mirror of [false,true])for(let frame=0;frame<49;frame++){
  const a=production.dragonCage(kind,frame/48,mirror),b=reference.restartCage(kind,frame/48,mirror);
  assert.deepEqual(a,b,'every approved native mouth/mirror cage is preserved');report.cages++;
  for(const triangle of a.triangles){assert.ok(projectedTriangleBound(a.a,a.b,a.controlDelta,triangle).passed);report.triangleBounds++;}
}
for(let frame=0;frame<49;frame++)for(const mirror of [false,true])for(let step=0;step<=100;step++){
  const t=step/100,c=frame/48,a=pMaterial.dragonScaleLanes(t,c,mirror),b=rMaterial.restartScaleLanes(t,c,mirror);
  assert.deepEqual(a,b,'scale positions, owner, radii and orientation match the approved turn');
  for(const group of ['near','far'])for(const leaf of a[group].leaves)for(const chart of ['source','target']){
    const point=[leaf.output.center[0]+2,leaf.output.center[1]-1];
    assert.deepEqual(pMaterial.dragonScaleLeafUV(point,leaf,chart),rMaterial.restartScaleLeafUV(point,leaf,chart));report.leafMappings++;
  }
  for(const x of [20,80,140])assert.deepEqual(pMaterial.dragonCylinderMaterial({x,y:65,t,closure:c,mirror}),rMaterial.restartCylinderMaterial({x,y:65,t,closure:c,mirror}));
  report.materialPoses++;
}
// Solid stencil: a low-contrast interior cannot become a hollow ring. The
// exterior PCA footprint/alpha are applied separately by the exact shader.
const stencil=pMaterial.dragonScaleStencil,cfg=pMaterial.DRAGON_SCALE_LANES;
for(let step=0;step<=100;step++)for(const chroma of [0,.02,cfg.featureStarts,.08,cfg.featureComplete,.4,1])for(const radius of [0,.4,cfg.solidCore,.8,cfg.solidEdge,1,1.3]){
  const t=step/100,a=stencil(chroma,radius,t);assert.ok(a>=0&&a<=1);close(a,rMaterial.restartScaleStencil(chroma,radius,t),'production stencil equals approved reference');
  if(radius<=cfg.solidCore)close(a,1,'solid leaf core remains opaque even at zero chroma contrast');
  if(t===0||t===1)close(a,1,'native stencil is fully restored at both endpoints');report.stencilCases++;
}
for(const [axis,boundaries]of [['radius',[cfg.solidCore,cfg.solidEdge]],['chroma',[cfg.featureStarts,cfg.featureComplete]],['time',[.06,cfg.nativeRestoreStarts,cfg.nativeRestoreComplete]]])for(const boundary of boundaries){
  let previous=Infinity;for(const epsilon of [1e-3,1e-5,1e-7]){
    const at=value=>stencil(axis==='chroma'?value:.06,axis==='radius'?value:.8,axis==='time'?value:.5);
    const delta=Math.abs(at(boundary+epsilon)-at(boundary-epsilon));assert.ok(delta<=previous+1e-10);if(epsilon===1e-7)assert.ok(delta<1e-6);previous=delta;report.stencilLimits++;
  }
}
assert.throws(()=>stencil(NaN,0,.5),/Invalid/);
for(const size of [80,160])for(const direction of DIRECTIONS)for(let frame=0;frame<49;frame++){
  assert.deepEqual(pClean.createCleanCapMask(size,direction,frame/48),rClean.createCleanCapMask(size,direction,frame/48));report.masks++;
}
const studyPack=new URL('../dragon-kin-sprites/pack/',study),packs=[];
const makeCanvas=(w=1,h=w)=>createCanvas(w,h);
for(const profile of ['hd','4k']){
  const [pack,approved]=await Promise.all([
    loadDragonKinArt(profile,{makeCanvas,fetchJSON:async url=>JSON.parse(await readFile(url,'utf8')),loadImage:async url=>loadImage(fileURLToPath(url))}),
    loadDragonKinArt(profile,{makeCanvas,fetchJSON:async()=>JSON.parse(await readFile(new URL('manifest.json',studyPack),'utf8')),
      loadImage:async url=>loadImage(fileURLToPath(new URL(url.pathname.split('/assets/dragon-kin/')[1],studyPack)))})]);
  packs.push(pack);assert.equal(Object.keys(pack.sets).length,12);assert.ok(Object.keys(pack.sets).every(key=>/^(h1|h3|h4):normal:(right|left|up|down)$/.test(key)));
  const a=makeCanvas(pack.size),b=makeCanvas(pack.size),ac=a.getContext('2d'),bc=b.getContext('2d');
  for(const key of Object.keys(pack.sets)){
    const scenarios=[...Array.from({length:49},(_,frame)=>[frame,0]),...Array.from({length:25},(_,blink)=>[18,blink]),[48,24]];
    for(const [frame,blink]of scenarios){
      composeFantasyPose(ac,pack.sets[key],frame,blink);composeFantasyPose(bc,approved.sets[key],frame,blink);
      equalPixels(ac.getImageData(0,0,pack.size,pack.size).data,bc.getImageData(0,0,pack.size,pack.size).data,'all palettes retain approved mouth and eyelid art');report.nativePoses++;
    }
    for(const frame of [0,18,48]){
      composeFantasyPose(ac,pack.sets[key],frame,0);const data=ac.getImageData(0,0,pack.size,pack.size).data;
      const options={data,size:pack.size,direction:pack.sets[key].direction,closure:frame/48};
      const clean=pClean.createCleanCapPixels(options),expected=rClean.createCleanCapPixels(options);
      assert.deepEqual(clean,expected,'native hidden pigment preparation matches approved experiment');
      for(let i=0;i<data.length/4;i++){assert.equal(clean.data[i*4+3],data[i*4+3]);if(!clean.mask[i])for(let c=0;c<3;c++)assert.equal(clean.data[i*4+c],data[i*4+c]);}report.cleanerCases++;
    }
  }
}
function fakeContext(){
  const resources=new Set(),calls={},enums=new Map();let next=1;
  const gl=new Proxy({resources,calls,isContextLost:()=>false,getExtension:()=>({loseContext(){calls.lose=(calls.lose||0)+1;}})}, {get(target,key){
    if(key in target)return target[key];if(/^[A-Z0-9_]+$/.test(key)){if(!enums.has(key))enums.set(key,next++);return enums.get(key);}
    if(/^create(Shader|Program|Buffer|Texture)$/.test(key))return()=>{const value={kind:key,id:next++};resources.add(value);return value;};
    if(/^delete(Shader|Program|Buffer|Texture)$/.test(key))return value=>resources.delete(value);
    if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
    if(key==='getUniformLocation')return()=>({});if(key==='getShaderInfoLog'||key==='getProgramInfoLog')return()=>'';
    return(..._args)=>{calls[key]=(calls[key]||0)+1;};
  }});return gl;
}
for(const pack of packs){
  const gl=fakeContext(),surfaces=[],listeners=new Map(),factory=()=>{const canvas=makeCanvas(pack.size),get=canvas.getContext.bind(canvas);
    canvas.getContext=(name,...args)=>name==='webgl'?gl:get(name,...args);canvas.addEventListener=(name,fn)=>listeners.set(name,fn);canvas.removeEventListener=(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);};surfaces.push(canvas);return canvas;};
  const scratch=makeCanvas(pack.size),s=scratch.getContext('2d'),target=makeCanvas(pack.size),ctx=target.getContext('2d');
  const drawPose=(out,key,d,c,b,x,y,size)=>{composeFantasyPose(s,pack.sets[`${key}:${d}`],Math.round(c*48),Math.round(b*24));out.drawImage(scratch,x,y,size,size);};
  const renderer=pRenderer.createDragonTurnRenderer({size:pack.size,drawPose,canvasFactory:factory,artRig:production.dragonTurnRig});
  for(const palette of DRAGON_KIN_PALETTES)for(const from of DIRECTIONS)for(const to of DIRECTIONS)if(from!==to){
    const plan=planTurn(from,to);for(const t of plan.quarters===2?[0,.5,1]:[0,1]){
      const pose=sampleTurn(plan,t);ctx.clearRect(0,0,pack.size,pack.size);renderer.draw(ctx,palette+':normal',pose,18/48,12/24,0,0,pack.size);
      const actual=ctx.getImageData(0,0,pack.size,pack.size).data;ctx.clearRect(0,0,pack.size,pack.size);drawPose(ctx,palette+':normal',pose.mix>1-1e-9?pose.to:pose.from,18/48,12/24,0,0,pack.size);
      equalPixels(actual,ctx.getImageData(0,0,pack.size,pack.size).data,'cardinals use exact approved mouth/blink pose');report.endpointChecks++;
    }
  }
  assert.equal(renderer.diagnostics().capBuildCount,0,'native bypass cannot allocate hidden cap frames');
  const draw=(palette,frame,blink=0)=>renderer.draw(ctx,palette+':normal',{from:'right',to:'up',mix:.5},frame/48,blink/24,0,0,pack.size);
  draw('h1',0);const first=renderer.diagnostics();assert.equal(first.capBuildCount,2);
  for(let blink=1;blink<25;blink++)draw('h1',0,blink);assert.equal(renderer.diagnostics().capBuildCount,2);assert.equal(renderer.diagnostics().capUploadCount,first.capUploadCount);
  for(const palette of DRAGON_KIN_PALETTES)for(let frame=0;frame<49;frame++)draw(palette,frame);
  const full=renderer.diagnostics();assert.equal(full.capBuildCount,150);assert.equal(full.cleanCapEntries,64);assert.equal(full.cleanCapBytes,0);assert.equal(full.cleanCapTextureEntries,64);assert.equal(full.cleanCapTextureBytes,64*pack.size*pack.size*4);assert.ok(full.capEvictionCount>0);
  assert.throws(()=>renderer.drawMask(ctx,'h1:normal',{from:'right',to:'up',mix:.5},0,0,0,pack.size),/No turn aperture/,'enemy renderer does not acquire player intake-mask semantics');
  listeners.get('webglcontextlost')({preventDefault(){}});assert.ok(renderer.diagnostics().lost);assert.throws(()=>draw('h1',0),/unavailable/);
  renderer.dispose();renderer.dispose();const disposed=renderer.diagnostics();assert.equal(disposed.cleanCapBytes,0);assert.equal(disposed.cleanCapTextureBytes,0);assert.equal(disposed.nativeSurfaceCount,0);assert.equal(gl.resources.size,0);assert.equal(listeners.size,0);
  assert.ok(surfaces.every(c=>c.width===1&&c.height===1));assert.throws(()=>draw('h1',0),/unavailable/);report.lifecycleChecks+=16;
}
console.log(JSON.stringify({passed:true,...report,profiles:['hd','4k'],palettes:DRAGON_KIN_PALETTES,turnDurationMs:FANTASY_TURN_MS,
  interpretation:'Exact approved geometry/shader parity and primary renderer parity after explicit upload-orchestration and additive eye-pass reversal; native mouth/blink endpoints and simulated-GL lifecycle. Real shader compilation, intermediate pixels and visual acceptance require qa/dragon-turn-browser.js; optional GPU fallback is not counted as passing.'},null,2));
