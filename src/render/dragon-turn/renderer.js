// Dedicated Dragon Kin clean-cap renderer; the player renderer stays separate.
import {createCleanCapPixels} from './cap-cleaner.js';
import {cageVertices,canonicalPair} from '../fantasy-turn/geometry.js';
import {createSilhouetteBuilder} from '../fantasy-turn/silhouette.js';
import {backSurfaceGLSL} from '../fantasy-turn/back-surface.js';
import {frontSurfaceGLSL} from '../fantasy-turn/front-surface.js';
import {crestSurfaceGLSL} from '../fantasy-turn/crest-surface.js';
import {createProjectedBackCage} from '../fantasy-turn/back-projection.js';
import {capSeamGLSL} from '../fantasy-turn/seam-surface.js';

const vertex = `
attribute vec2 aSide;
attribute vec2 aEnd;
attribute vec2 aControl;
uniform float uTurn;
uniform float uMirror;
varying vec2 vSide;
varying vec2 vEnd;
varying float vX;
varying float vY;
varying float vPositionX;
void main(){
  vec2 p=mix(aSide,aEnd,uTurn)+4.0*uTurn*(1.0-uTurn)*aControl;
  vX=aSide.x;
  vY=p.y;
  vPositionX=p.x;
  vSide=vec2(mix(aSide.x,1.0-aSide.x,uMirror),aSide.y);
  vEnd=vec2(mix(aEnd.x,1.0-aEnd.x,uMirror),aEnd.y);
  p.x=mix(p.x,1.0-p.x,uMirror);
  gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);
}`;
const fragment = `
precision highp float;
uniform sampler2D uSide;
uniform sampler2D uEnd;
uniform sampler2D uSideShape;
uniform sampler2D uEndShape;
uniform float uTurn;
uniform float uBack;
uniform float uMirror;
uniform float uClosure;
uniform float uNativeSize;
varying vec2 vSide;
varying vec2 vEnd;
varying float vX;
varying float vY;
varying float vPositionX;
${backSurfaceGLSL}
${frontSurfaceGLSL}
${crestSurfaceGLSL}
${capSeamGLSL}
void main(){
  float da=(texture2D(uSideShape,vSide).r*255.0-128.0)/4.0;
  float db=(texture2D(uEndShape,vEnd).r*255.0-128.0)/4.0;
  vec2 canonicalA=vec2(mix(vSide.x,1.0-vSide.x,uMirror),vSide.y);
  vec2 canonicalB=vec2(mix(vEnd.x,1.0-vEnd.x,uMirror),vEnd.y);
  vec4 aligned=vec4(canonicalA,canonicalB);
  // The smooth rear shell must not inherit the tiny eye/tooth triangles.
  // Project its paint continuously in the common head plane instead.
  if(uBack>0.5){
    aligned=alignedRearCapUV(canonicalA,canonicalB,uTurn,uClosure,uMirror);
    float bx=80.0+(canonicalB.x*160.0-80.0)/1.125;
    float sx=80.0+(vPositionX*160.0-80.0)/1.125;
    float seamB=rearCapSeamRaw(mix(bx,160.0-bx,uMirror))+6.0*(1.0-uClosure);
    float seamS=rearCapSeamRaw(mix(sx,160.0-sx,uMirror))+6.0*(1.0-uClosure);
    float below=aligned.w*160.0-seamB;
    float shellY=mix((seamS+below)/160.0,max(vY,(seamS+below*0.5)/160.0),smoothstep(4.0,24.0,below));
    float cheek=smoothstep(0.0,5.0,below);
    aligned.zw=mix(aligned.zw,vec2(vPositionX,shellY),cheek);
  }
  vec4 a=texture2D(uSide,vec2(mix(aligned.x,1.0-aligned.x,uMirror),aligned.y));
  vec2 rearUV=vec2(mix(aligned.z,1.0-aligned.z,uMirror),aligned.w);
  vec4 b=texture2D(uEnd,rearUV);
  float rearPaintDistance=db;
  if(uBack>0.5){
    rearPaintDistance=(texture2D(uEndShape,rearUV).r*255.0-128.0)/4.0;
    // Extend only the owned shell's edge paint inward. Falling back to the
    // side view here would bring the already hidden lip or tooth back again.
    if(b.a<0.15){
      vec2 dx=vec2(1.0/uNativeSize,0.0),dy=dx.yx;
      vec2 gradient=vec2(texture2D(uEndShape,rearUV+dx).r-texture2D(uEndShape,rearUV-dx).r,
                         texture2D(uEndShape,rearUV+dy).r-texture2D(uEndShape,rearUV-dy).r);
      rearUV+=gradient/max(length(gradient),0.0001)*min(5.0,max(0.0,0.5-rearPaintDistance))/uNativeSize;
      b=texture2D(uEnd,rearUV);
      rearPaintDistance=(texture2D(uEndShape,rearUV).r*255.0-128.0)/4.0;
    }
  }
  vec4 paint;
  if(uBack>0.5)paint=backSurface(a,b,canonicalA,canonicalB,uTurn,da,rearPaintDistance);
  else paint=frontSurface(a,b,canonicalA,canonicalB,uTurn,da,db);
  // Exterior volume follows the turn, not the facial paint wipe. Otherwise
  // the old lip tips linger outside the rounded back after the mouth hides.
  float shapeTurn=uBack>0.5?uTurn*(2.0-uTurn):uTurn;
  float distance=mix(da,db,shapeTurn);
  crestSurface(paint,distance,vec2(vPositionX,vY),uTurn,uBack,uMirror,uClosure,uNativeSize);
  float alpha=smoothstep(-0.7,0.7,distance);
  // One interpolated opaque silhouette, rather than two half-transparent
  // skull/jaw contours. The paint remains premultiplied for clean dark edges.
  gl_FragColor=vec4(paint.rgb/max(paint.a,0.001)*alpha,alpha);
}`;


// The aperture uses the same UV projection and ownership field as the art,
// but never the crest paint or forced opaque rear-surface alpha. Encode the
// mask as paint luminance, retaining the corresponding ART alpha for weights.
const maskFragment=fragment.slice(0,fragment.indexOf('\n  vec4 paint;'))
  .replace(crestSurfaceGLSL,'')
  .replace('uniform sampler2D uEnd;','uniform sampler2D uEnd;\nuniform sampler2D uSideMask;\nuniform sampler2D uEndMask;')+[
  '  a.rgb=vec3(texture2D(uSideMask,vec2(mix(aligned.x,1.0-aligned.x,uMirror),aligned.y)).a)*a.a;',
  '  b.rgb=vec3(texture2D(uEndMask,rearUV).a)*b.a;',
  '  vec4 paint;',
  '  if(uBack>0.5)paint=backSurface(a,b,canonicalA,canonicalB,uTurn,da,rearPaintDistance);',
  '  else paint=frontSurface(a,b,canonicalA,canonicalB,uTurn,da,db);',
  '  float shapeTurn=uBack>0.5?uTurn*(2.0-uTurn):uTurn;',
  '  float distance=mix(da,db,shapeTurn);',
  '  float alpha=clamp(paint.r/max(paint.a,0.001),0.0,1.0)*smoothstep(-0.7,0.7,distance);',
  '  gl_FragColor=vec4(alpha);',
  '}',
].join('\n');

const DIRECTIONS=Object.freeze(['right','down','left','up']);
const MAX_SILHOUETTES=192;
const clamp01=value=>Math.max(0,Math.min(1,value));
const uniformNames=['uTurn','uMirror','uBack','uClosure','uNativeSize','uSide','uEnd','uSideShape','uEndShape','uSideCap','uEndCap'];
const contextOptions={alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true};

/**
 * One shared native-resolution turn compositor for the active sprite profile.
 * Assets, mouth timing, blink timing, lighting and actor clocks remain owned
 * by the game. The callbacks draw already-approved native production poses.
 *
 * drawPose(ctx, variantKey, direction, closure, blink, x, y, size)
 * drawMaskPose?(ctx, variantKey, direction, closure, x, y, size)
 *
 * variantKey must include every art variant (palette AND normal/bright light).
 * warm() handles one closure at a time; the caller schedules batches between
 * frames. No timers, image loads, sprite duplication or actor references.
 */
export function createDragonTurnRenderer({size,drawPose,drawMaskPose,canvasFactory,artRig=null}={}){
  if(![80,160].includes(size)||typeof drawPose!=='function')throw new TypeError('Turn renderer requires native size 80/160 and drawPose');
  if(drawMaskPose!==undefined&&typeof drawMaskPose!=='function')throw new TypeError('Invalid turn aperture compositor');
  if(artRig&&(typeof artRig.fragment!=='string'||typeof artRig.cage!=='function'))throw new TypeError('Invalid character turn anatomy');
  const makeCanvas=canvasFactory||(()=>document.createElement('canvas'));
  if(typeof makeCanvas!=='function')throw new TypeError('Invalid canvas factory');
  const s=size,canvas=makeCanvas();canvas.width=canvas.height=s;
  const gl=canvas.getContext('webgl',contextOptions);
  if(!gl){canvas.width=canvas.height=1;throw Error('Smooth turns require an available WebGL context');}
  let lost=false,disposed=false,program=null,maskProgram=null,buffer=null,lastGeometry=null;
  let geometryUploadCount=0;
  let uploadCount=0,drawCount=0,maskUploadCount=0,maskDrawCount=0,warmCount=0,evictionCount=0;
  let capUploadCount=0,capBuildCount=0,capEvictionCount=0,capMaximumIterations=0;
  let buildSilhouette=createSilhouetteBuilder(s);
  const shaders=new Set(),programs=new Set(),textures=new Set(),sources=[],maskSources=[];
  const geometry=new Map(),silhouettes=new Map();
  // Cache native GPU textures, not an additional retained CPU pixel copy.
  const cleanCaps=new Map(),MAX_CLEAN_CAPS=64;
  const onLost=e=>{e.preventDefault();lost=true;};
  canvas.addEventListener('webglcontextlost',onLost);

  function dispose(){
    if(disposed)return;
    disposed=true;
    canvas.removeEventListener('webglcontextlost',onLost);
    for(const texture of textures)gl.deleteTexture(texture);
    for(const shader of shaders)gl.deleteShader(shader);
    for(const value of programs)gl.deleteProgram(value.program);
    if(buffer)gl.deleteBuffer(buffer);
    textures.clear();shaders.clear();programs.clear();geometry.clear();silhouettes.clear();cleanCaps.clear();
    buildSilhouette=null;lastGeometry=null;
    for(const entry of [...sources,...maskSources]){
      entry.surface.width=entry.surface.height=1;
      if(entry.capSurface)entry.capSurface.width=entry.capSurface.height=1;
    }
    sources.length=maskSources.length=0;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.width=canvas.height=1;
  }
  function compile(type,source){
    const sh=gl.createShader(type);if(!sh)throw Error('Cannot allocate turn shader');
    shaders.add(sh);gl.shaderSource(sh,source);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh)||'Cannot compile turn shader');
    return sh;
  }
  function createProgram(source,isMask=false){
    const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,source);
    const value=gl.createProgram();if(!value)throw Error('Cannot allocate turn program');
    const entry={program:value,uniform:null};programs.add(entry);
    gl.attachShader(value,vs);gl.attachShader(value,fs);
    ['aSide','aEnd','aControl'].forEach((name,index)=>gl.bindAttribLocation(value,index,name));
    gl.linkProgram(value);
    if(!gl.getProgramParameter(value,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(value)||'Cannot link turn program');
    for(const sh of [vs,fs]){gl.deleteShader(sh);shaders.delete(sh);}
    const names=isMask?[...uniformNames,'uSideMask','uEndMask']:uniformNames;
    entry.uniform=Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(value,name)]));
    gl.useProgram(value);
    gl.uniform1f(entry.uniform.uNativeSize,s);
    for(const [name,unit]of [['uSide',0],['uEnd',1],['uSideShape',2],['uEndShape',3],['uSideCap',6],['uEndCap',7],...(isMask?[['uSideMask',4],['uEndMask',5]]:[])])gl.uniform1i(entry.uniform[name],unit);
    return entry;
  }
  function textureAt(unit){
    const texture=gl.createTexture();if(!texture)throw Error('Cannot allocate turn texture');
    textures.add(texture);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return texture;
  }
  function surfaceEntry(unit,mask=false){
    const surface=makeCanvas();surface.width=surface.height=s;
    const ctx=surface.getContext('2d',{willReadFrequently:!mask});
    if(!ctx){surface.width=surface.height=1;throw Error('Cannot allocate turn source surface');}
    ctx.imageSmoothingEnabled=false;
    // Register before texture allocation so even a partial allocation is freed.
    const entry={surface,ctx,texture:null,shapeTexture:null,key:null,shapeKey:null};
    (mask?maskSources:sources).push(entry);
    entry.texture=textureAt(unit);
    if(!mask){
      entry.shapeTexture=textureAt(unit+2);
      entry.capSurface=makeCanvas();entry.capSurface.width=entry.capSurface.height=s;
      entry.capCtx=entry.capSurface.getContext('2d',{willReadFrequently:true});
      if(!entry.capCtx)throw Error('Cannot allocate clean-cap surface');
      entry.capCtx.imageSmoothingEnabled=false;entry.capImage=entry.capCtx.createImageData(s,s);
      entry.capTexture=textureAt(unit+6);entry.capUnit=unit+6;entry.activeCapTexture=entry.capTexture;
      // Front turns never sample the cap, but all active samplers must remain
      // complete even when a front pose is the renderer's very first draw.
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
    }
    return entry;
  }
  try{
    program=createProgram(artRig?.fragment||fragment);
    buffer=gl.createBuffer();if(!buffer)throw Error('Cannot allocate turn buffer');
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    surfaceEntry(0);surfaceEntry(1);
  }catch(error){dispose();throw error;}

  function checkAlive(){
    if(disposed||lost||gl.isContextLost())throw Error('Turn graphics context unavailable');
  }
  function checkVariant(variant){
    if(typeof variant!=='string'||!variant.length||variant.length>120)throw new TypeError('Invalid turn art variant');
  }
  function validateDraw(variant,pose,closure,blink,x,y,drawSize){
    checkAlive();checkVariant(variant);
    if(!pose||!DIRECTIONS.includes(pose.from)||!DIRECTIONS.includes(pose.to)||!Number.isFinite(pose.mix)||pose.mix<0||pose.mix>1)throw new TypeError('Invalid turn pose');
    if(![closure,blink,x,y,drawSize].every(Number.isFinite)||drawSize<=0)throw new TypeError('Invalid turn drawing');
    if(pose.from!==pose.to&&pose.mix>1e-9&&pose.mix<1-1e-9)canonicalPair(pose.from,pose.to,pose.mix);
  }
  function shapeFor(key,ctx){
    let shape=silhouettes.get(key);
    if(shape){silhouettes.delete(key);silhouettes.set(key,shape);return shape;}
    shape=buildSilhouette(ctx.getImageData(0,0,s,s).data);
    silhouettes.set(key,shape);
    if(silhouettes.size>MAX_SILHOUETTES){silhouettes.delete(silhouettes.keys().next().value);evictionCount++;}
    return shape;
  }
  function upload(unit,variant,direction,closure,blink,includeCap=false){
    const entry=sources[unit],frame=Math.round(closure*48);
    const key=JSON.stringify([variant,direction,frame,direction==='up'?0:Math.round(blink*24)]);
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
    gl.activeTexture(gl.TEXTURE0+unit+2);gl.bindTexture(gl.TEXTURE_2D,entry.shapeTexture);
    gl.activeTexture(gl.TEXTURE0+unit+6);gl.bindTexture(gl.TEXTURE_2D,entry.capTexture);
    entry.activeCapTexture=entry.capTexture;
    if(entry.key!==key){
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
    if(!includeCap)return;
    // Side cap pixels lie above the mouth's fixed112 row and do not depend on
    // closure. Rear cap lift does; blink never enters hidden cap material.
    const capFrame=direction==='up'?frame:0,capKey=JSON.stringify([variant,direction,capFrame]);
    // Always consult the LRU: a previously used key may have been evicted.
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
    }
  }
  function geometryFor(kind,mirror,closure){
    const frame=Math.round(closure*48),key=kind+':'+(mirror?1:0)+':'+frame;
    let data=geometry.get(key);
    if(!data){
      const cage=artRig?artRig.cage(kind,frame/48,mirror):kind==='back'?createProjectedBackCage(frame/48,mirror):cageVertices(kind,frame/48,mirror);
      data=new Float32Array(cage.triangles.flatMap(tri=>tri.flatMap(i=>[...cage.a[i],...cage.b[i],...(cage.controlDelta?.[i]||[0,0])])));
      geometry.set(key,data);
    }
    return data;
  }
  function setupPass(entry,pair,data,closure){
    gl.useProgram(entry.program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    // Both art and aperture passes share this buffer. Cached geometry is
    // immutable, so a different program/phase alone never needs another copy.
    if(lastGeometry!==data){gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);lastGeometry=data;geometryUploadCount++;}
    for(let index=0;index<3;index++){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,2,gl.FLOAT,false,24,index*8);}
    gl.uniform1f(entry.uniform.uTurn,pair.t);gl.uniform1f(entry.uniform.uMirror,pair.mirror?1:0);
    gl.uniform1f(entry.uniform.uBack,pair.kind==='back'?1:0);gl.uniform1f(entry.uniform.uClosure,closure);
    gl.viewport(0,0,s,s);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function draw(ctx,variant,pose,closure,blink,x,y,drawSize){
    validateDraw(variant,pose,closure,blink,x,y,drawSize);
    closure=clamp01(closure);blink=clamp01(blink);
    // Approved native art is exact at ALL cardinals, including a 180 midpoint.
    if(pose.from===pose.to||pose.mix<1e-9||pose.mix>1-1e-9){
      drawPose(ctx,variant,pose.mix>1-1e-9?pose.to:pose.from,closure,blink,x,y,drawSize);return;
    }
    const pair=canonicalPair(pose.from,pose.to,pose.mix),data=geometryFor(pair.kind,pair.mirror,closure);
    const includeCap=pair.kind==='back';
    upload(0,variant,pair.side,closure,blink,includeCap);upload(1,variant,pair.end,closure,blink,includeCap);
    setupPass(program,pair,data,closure);
    gl.drawArrays(gl.TRIANGLES,0,data.length/6);
    ctx.drawImage(canvas,x,y,drawSize,drawSize);drawCount++;
  }
  function prepareMask(){
    if(maskProgram)return;
    if(artRig)throw Error('This character anatomy has no player intake mask');
    if(typeof drawMaskPose!=='function')throw Error('No turn aperture compositor supplied');
    // Lazy: most turns never coincide with a bite. Release the complete
    // optional renderer if creation fails; its owner falls back to native art.
    try{maskProgram=createProgram(maskFragment,true);surfaceEntry(4,true);surfaceEntry(5,true);}
    catch(error){dispose();throw error;}
  }
  function uploadMask(unit,variant,direction,closure){
    const entry=maskSources[unit],key=JSON.stringify([variant,direction,Math.round(closure*48)]);
    gl.activeTexture(gl.TEXTURE0+4+unit);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
    if(entry.key===key)return;
    entry.ctx.clearRect(0,0,s,s);
    // A rear-facing head has no visible mouth aperture, by definition.
    if(direction!=='up')drawMaskPose(entry.ctx,variant,direction,closure,0,0,s);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,entry.surface);
    entry.key=key;maskUploadCount++;
  }
  function drawMask(ctx,variant,pose,closure,x,y,drawSize){
    validateDraw(variant,pose,closure,0,x,y,drawSize);closure=clamp01(closure);
    if(typeof drawMaskPose!=='function')throw Error('No turn aperture compositor supplied');
    if(pose.from===pose.to||pose.mix<1e-9||pose.mix>1-1e-9){
      const direction=pose.mix>1-1e-9?pose.to:pose.from;
      if(direction!=='up')drawMaskPose(ctx,variant,direction,closure,x,y,drawSize);
      return;
    }
    prepareMask();
    const pair=canonicalPair(pose.from,pose.to,pose.mix),data=geometryFor(pair.kind,pair.mirror,closure);
    // Eyelids never change aperture or exterior alpha; do not create mask
    // texture/cache combinations for the 25 blink poses.
    const includeCap=pair.kind==='back';
    upload(0,variant,pair.side,closure,0,includeCap);upload(1,variant,pair.end,closure,0,includeCap);
    uploadMask(0,variant,pair.side,closure);uploadMask(1,variant,pair.end,closure);
    setupPass(maskProgram,pair,data,closure);
    gl.drawArrays(gl.TRIANGLES,0,data.length/6);
    ctx.drawImage(canvas,x,y,drawSize,drawSize);maskDrawCount++;
  }
  function warm(variant,closure=0){
    checkAlive();checkVariant(variant);
    if(!Number.isFinite(closure))throw new TypeError('Invalid warm closure');
    closure=clamp01(closure);
    for(const kind of ['front','back'])for(const mirror of [false,true])geometryFor(kind,mirror,closure);
    for(const direction of DIRECTIONS)upload(0,variant,direction,closure,0,direction!=='down');
    warmCount++;
    return diagnostics();
  }
  function diagnostics(){
    let geometryBytes=0;for(const data of geometry.values())geometryBytes+=data.byteLength;
    return {nativeSize:s,drawCount,uploadCount,maskDrawCount,maskUploadCount,warmCount,evictionCount,geometryUploadCount,
      geometryEntries:geometry.size,geometryBytes,maximumGeometryEntries:196,
      silhouetteEntries:silhouettes.size,silhouetteBytes:silhouettes.size*s*s,maximumSilhouetteEntries:MAX_SILHOUETTES,
      cleanCapEntries:cleanCaps.size,cleanCapBytes:0,maximumCleanCapEntries:MAX_CLEAN_CAPS,
      cleanCapStorage:'gpu',cleanCapTextureEntries:cleanCaps.size,cleanCapTextureBytes:cleanCaps.size*s*s*4,
      capUploadCount,capBuildCount,capEvictionCount,capMaximumIterations,
      nativeSurfaceCount:disposed?0:1+sources.length*2+maskSources.length,maskReady:!!maskProgram&&!disposed,lost,disposed};
  }
  return {draw,drawMask,warm,diagnostics,dispose};
}
