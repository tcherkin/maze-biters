// Native-pose material conversion for mutable creature sprites. Never cache a
// source by identity: mouths, eyelids, turns and bent scorpions reuse canvases.
// One upload feeds two passes; no CPU pixel reads, actor references or clocks.
const clamp=value=>Math.max(0,Math.min(2,value));
const strengthValue=value=>{
  const numeric=Number(value);
  if(!Number.isFinite(numeric))throw new TypeError('Neon strength must be finite');
  return clamp(numeric);
};
const vertex=`
attribute vec2 aPosition;
varying vec2 vUV;
void main(){
  vUV=vec2(aPosition.x*.5+.5,.5-aPosition.y*.5);
  gl_Position=vec4(aPosition,0.0,1.0);
}`;
// Same straight-RGBA math as enhancePixels/emissionPixels in neon-material.js.
// Native nearest sampling and explicit byte rounding avoid interpolating the
// dark contours/neutral teeth into coloured skin before material selection.
export const CREATURE_NEON_FRAGMENT=`
precision highp float;
uniform sampler2D uSource;
uniform float uStrength;
uniform float uEmission;
varying vec2 vUV;
float byteRound(float x){return floor(clamp(x,0.0,255.0)+.5);}
float byteEven(float x){
  x=clamp(x,0.0,255.0);
  float whole=floor(x),fraction=x-whole;
  return whole+(fraction>.5?1.0:fraction<.5?0.0:mod(whole,2.0));
}
vec3 bytesEven(vec3 x){return vec3(byteEven(x.r),byteEven(x.g),byteEven(x.b))/255.0;}
// Canvas2D stores premultiplied pixels. Write that representation directly so
// drawImage does not perform another straight-to-premultiplied byte conversion.
// Quantize at byte centers explicitly, not at an implementation-dependent
// framebuffer boundary; the straight neon formulas above remain unchanged.
void writeStraight(vec4 value){
  vec3 premultiplied=floor(value.rgb*value.a*255.0+.5)/255.0;
  gl_FragColor=vec4(premultiplied,value.a);
}
void main(){
  vec4 source=floor(texture2D(uSource,vUV)*255.0+.5);
  float high=max(source.r,max(source.g,source.b));
  float low=min(source.r,min(source.g,source.b));
  bool coloured=source.a>0.0&&high>48.0&&high-low>12.0;
  if(uEmission>.5){
    if(!coloured||uStrength==0.0){gl_FragColor=vec4(0.0);return;}
    float value=high/255.0,saturation=(high-low)/high;
    float colour=smoothstep(.18,.52,saturation),interior=smoothstep(.22,.55,value);
    float band=smoothstep(.42,.94,value);
    float alpha=byteRound(source.a*clamp(uStrength*colour*interior*(.08+.76*band),0.0,1.0));
    if(alpha==0.0){gl_FragColor=vec4(0.0);return;}
    float lightValue=.80+.20*value;
    writeStraight(vec4(bytesEven(255.0*lightValue*source.rgb/high),alpha/255.0));
  }else{
    if(!coloured||uStrength==0.0){writeStraight(source/255.0);return;}
    float value=high/255.0,saturation=(high-low)/high;
    float skin=smoothstep(.13,.45,saturation)*smoothstep(.20,.48,value);
    float newValue=value+(1.0-value)*.28*uStrength*skin;
    float core=.16*uStrength*skin*smoothstep(.48,.93,value);
    vec3 hue=source.rgb/high;
    writeStraight(vec4(bytesEven(255.0*newValue*(hue+(1.0-hue)*core)),source.a/255.0));
  }
}`;
const contextOptions={alpha:true,antialias:false,depth:false,stencil:false,
  premultipliedAlpha:true,preserveDrawingBuffer:true};
const defaultCanvas=(width,height)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;};
const quad=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);

export function createCreatureNeonMaterial({makeCanvas=defaultCanvas,strength=.7,maxSize=512}={}){
  if(globalThis.__gpu2d)return globalThis.__gpu2d.createCreatureMaterial(CREATURE_NEON_FRAGMENT,{strength:strengthValue(strength),maxSize});
  if(typeof makeCanvas!=='function')throw new TypeError('Creature neon requires a canvas factory');
  if(!Number.isInteger(maxSize)||maxSize<1||maxSize>768)throw new RangeError('Creature neon maximum size must be1..768');
  let amount=strengthValue(strength),state=null,disposed=false,lost=false,recover=false,failed=false,polledLost=false;
  let calls=0,uploads=0,passes=0,failures=0,builds=0,resizes=0,invalidations=0,contextLosses=0,recoveries=0;
  let lastError=null,lastInvalidation=null;
  const output={material:null,emission:null};
  function release(){
    if(!state)return;
    const {gl,canvas,material,emission,program,buffer,texture,shaders,listeners}=state;
    for(const [surface,name,handler]of listeners)surface.removeEventListener?.(name,handler);
    try{
      if(texture)gl?.deleteTexture(texture);
      if(buffer)gl?.deleteBuffer(buffer);
      if(program)gl?.deleteProgram(program);
      for(const shader of shaders)gl?.deleteShader(shader);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    }catch{/* A genuinely lost driver must not prevent releasing CPU surfaces. */}
    for(const surface of [canvas,material,emission])if(surface)surface.width=surface.height=1;
    state=null;output.material=output.emission=null;
  }
  function fail(error){failures++;failed=true;lastError=String(error?.message||error);release();return null;}
  function observe(surface){
    if(typeof surface.addEventListener!=='function'||typeof surface.removeEventListener!=='function')return;
    const onLost=event=>{event?.preventDefault?.();if(!lost)contextLosses++;lost=true;};
    const onRestored=()=>{lost=false;recover=true;};
    for(const [name,handler]of [['contextlost',onLost],['contextrestored',onRestored],['webglcontextlost',onLost],['webglcontextrestored',onRestored]]){
      surface.addEventListener(name,handler);state.listeners.push([surface,name,handler]);
    }
  }
  function build(width,height){
    state={canvas:null,material:null,emission:null,gl:null,program:null,buffer:null,texture:null,shaders:[],listeners:[],width,height};
    const canvas=state.canvas=makeCanvas(width,height);canvas.width=width;canvas.height=height;
    const gl=state.gl=canvas.getContext('webgl',contextOptions);
    if(!gl)throw Error('Creature neon WebGL unavailable');
    observe(canvas);
    function compile(type,source){
      const shader=gl.createShader(type);if(!shader)throw Error('Creature neon shader allocation failed');
      state.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'Creature neon shader compilation failed');
      return shader;
    }
    const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,CREATURE_NEON_FRAGMENT);
    const program=state.program=gl.createProgram();if(!program)throw Error('Creature neon program allocation failed');
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.bindAttribLocation(program,0,'aPosition');gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Creature neon shader link failed');
    for(const shader of state.shaders)gl.deleteShader(shader);state.shaders.length=0;
    state.uniform=Object.fromEntries(['uSource','uStrength','uEmission'].map(name=>[name,gl.getUniformLocation(program,name)]));
    const buffer=state.buffer=gl.createBuffer();if(!buffer)throw Error('Creature neon buffer allocation failed');
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,quad,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    const texture=state.texture=gl.createTexture();if(!texture)throw Error('Creature neon texture allocation failed');
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    for(const name of ['TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER'])gl.texParameteri(gl.TEXTURE_2D,gl[name],gl.NEAREST);
    for(const name of ['TEXTURE_WRAP_S','TEXTURE_WRAP_T'])gl.texParameteri(gl.TEXTURE_2D,gl[name],gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    for(const name of ['BLEND','DEPTH_TEST','STENCIL_TEST','SCISSOR_TEST','CULL_FACE','DITHER'])gl.disable(gl[name]);
    gl.useProgram(program);gl.uniform1i(state.uniform.uSource,0);
    for(const key of ['material','emission']){
      const surface=state[key]=makeCanvas(width,height);surface.width=width;surface.height=height;
      const ctx=state[key+'Context']=surface.getContext('2d');if(!ctx)throw Error('Creature neon output Canvas2D unavailable');
      ctx.imageSmoothingEnabled=false;observe(surface);
    }
    output.material=state.material;output.emission=state.emission;builds++;
  }
  function resize(width,height){
    if(state.width===width&&state.height===height)return;
    for(const surface of [state.canvas,state.material,state.emission]){surface.width=width;surface.height=height;}
    state.materialContext.imageSmoothingEnabled=state.emissionContext.imageSmoothingEnabled=false;
    state.width=width;state.height=height;resizes++;
  }
  function available(){
    if(!state)return !lost;
    const nowLost=state.gl.isContextLost()||state.materialContext.isContextLost?.()||state.emissionContext.isContextLost?.();
    if(nowLost){if(!lost)contextLosses++;lost=polledLost=true;return false;}
    // A restored bitmap is empty. Rebuild on the next call rather than reuse
    // it; this also covers browsers which expose polling but omit events.
    if(polledLost){polledLost=false;lost=false;recover=true;return false;}
    return !lost;
  }
  function process(source,{strength=amount}={}){
    calls++;if(disposed||failed)return null;
    try{
      const value=strengthValue(strength);
      const width=source?.naturalWidth||source?.videoWidth||source?.width,height=source?.naturalHeight||source?.videoHeight||source?.height;
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>maxSize||height>maxSize)
        throw new RangeError(`Creature neon source must be1..${maxSize} pixels per dimension`);
      if(recover){release();recover=false;lost=polledLost=false;recoveries++;}
      if(!available())return null;
      if(!state)build(width,height);else resize(width,height);
      const {gl}=state;if(!available())return null;
      gl.useProgram(state.program);gl.bindBuffer(gl.ARRAY_BUFFER,state.buffer);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,state.texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);uploads++;
      gl.viewport(0,0,width,height);gl.uniform1f(state.uniform.uStrength,value);
      for(const [key,mode]of [['material',0],['emission',1]]){
        gl.uniform1f(state.uniform.uEmission,mode);gl.drawArrays(gl.TRIANGLES,0,6);passes++;
        const ctx=state[key+'Context'];ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';
        ctx.drawImage(state.canvas,0,0,width,height);ctx.globalCompositeOperation='source-over';
      }
      lastError=null;return output;
    }catch(error){return fail(error);}
  }
  // A failed allocation/compile/upload is latched until explicit invalidation;
  // unsupported devices must not retry allocations on every animation frame.
  function invalidate(reason='invalidated'){release();lost=recover=failed=polledLost=false;invalidations++;lastInvalidation=String(reason);}
  function setStrength(value){amount=strengthValue(value);return amount;}
  function stats(){
    const area=state?state.width*state.height:0,canvasBytes=area*4*3,textureBytes=area*4,bufferBytes=state?quad.byteLength:0;
    return {ready:!!state&&!lost&&!disposed,disposed,lost,failed,strength:amount,maxSize,calls,uploads,passes,readbacks:0,
      builds,resizes,failures,contextLosses,recoveries,invalidations,lastError,lastInvalidation,
      width:state?.width||0,height:state?.height||0,canvasBytes,textureBytes,bufferBytes,
      bytes:canvasBytes+textureBytes+bufferBytes,maximumBytes:maxSize*maxSize*16+quad.byteLength,
      surfaces:state?3:0,cachedSources:0,mutableSources:true,alphaPreserved:true};
  }
  return {process,setStrength,stats,invalidate,reset:()=>invalidate('reset'),dispose(){if(!disposed){release();disposed=true;lost=recover=polledLost=false;}}};
}
