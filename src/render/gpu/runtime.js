import {createGpuCanvas} from './gpu-canvas.js?v=1.02.17.02';
import {installPersistentMaterials,createLightingGraph} from './retained-passes.js?v=1.02.17.02';
import {createLightBatch} from './light-batch.js';
// Validated CPU optimizations: no per-frame deep diagnostics; reuse render data.
const DIAGNOSTICS_OPT=true,REUSE=true;

// Shared world renderer only. HUD, menus, tutorial and overlays remain native.
// Failure never silently changes the simulation or discards the current run.
export async function install(){
 let error=null,scene=null,native=null,frame=0,before=null,frameStats={},inFrame=false;
 const beforeCounters={},afterCounters={};
 const controller={mode:'webgl',get failed(){return !!error;},get error(){return error;},
  fail(reason){
   if(error)return;error=String(reason?.message||reason||'WebGL context unavailable');
   gpu.output.style.display='none';
   if(inFrame){try{gpu.endFrame();}catch{}inFrame=false;}
   const panel=document.createElement('div');panel.id='gpu-recovery';panel.setAttribute('role','alert');
   panel.style.cssText='position:fixed;z-index:10000;inset:25% 12% auto;padding:24px;background:#071018;color:#e8f4dc;border:2px solid #a7de7c;border-radius:16px;font:18px/1.6 system-ui;text-align:center';
   const text=document.createElement('p');text.textContent='Graphics unavailable. The game is frozen safely. Restart in Canvas mode to continue playing.';
   const link=document.createElement('a'),url=new URL(location.href);url.searchParams.set('renderer','canvas');
   link.href=url.href;link.textContent='Restart with Canvas';link.style.color='#b3ef8a';panel.append(text,link);document.body.append(panel);
  },hide(){gpu.output.style.display='none';},
  begin(context){
   if(error||gpu.renderer.gl.isContextLost())throw Error(error||'WebGL context lost');
   native=context.canvas;scene??=gpu.makeSurface(native.width,native.height,'game',true);
   if(scene.width!==native.width)scene.width=native.width;if(scene.height!==native.height)scene.height=native.height;
   before=DIAGNOSTICS_OPT?gpu.frameCounters(beforeCounters):gpu.counters();gpu.beginFrame();inFrame=true;scene.getContext('2d').reset();return scene.getContext('2d');
  },finish(){
   gpu.present(scene,native);gpu.endFrame();inFrame=false;
   const d=DIAGNOSTICS_OPT?gpu.frameCounters(afterCounters):gpu.counters();if(!REUSE)frameStats={};frameStats.frame=frame++;frameStats.uploads=d.uploadCount-before.uploadCount;frameStats.uploadBytes=d.uploadBytes-before.uploadBytes;frameStats.draws=d.draws-before.draws;frameStats.passes=d.passes-before.passes;
   const c=native.getContext('2d');c.save();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,native.width,native.height);c.restore();
  },get frameStats(){return frameStats;},
  diagnostics(){const d=gpu.diagnostics();return {...d,mode:'webgl',error,failed:!!error,resident:gpu.counters(),frame:frameStats,backing:scene?{width:scene.width,height:scene.height}:null};},
  invalidateUploads(){gpu.clearUploads();},
  pixels(){return gpu.pixels(scene);},dispose(){gpu.dispose();gpu.output.remove();}
 };
 const gpu=await createGpuCanvas({onContextLost:()=>controller.fail('WebGL context lost')});
 if(!(gpu.renderer.gl instanceof WebGL2RenderingContext)||gpu.renderer.gl.getParameter(gpu.renderer.gl.MAX_TEXTURE_SIZE)<4096){gpu.dispose();throw Error('WebGL2 with 4096px textures required');}
 installPersistentMaterials(gpu);
 gpu.createLightBatch=(...args)=>createLightBatch(gpu,...args);
 gpu.createLightingGraph=(...args)=>createLightingGraph(gpu,...args);
 gpu.createCreatureMaterial=(fragment,{strength=.7,maxSize=768}={})=>{
  let material=null,emission=null,calls=0,disposed=false;
  const code=fragment.replace('precision highp float;','').replace('uniform sampler2D uSource;','').replace('varying vec2 vUV;','').replaceAll('gl_FragColor','finalColor').replace('vec4 source=floor(texture2D(uSource,vUV)*255.0+.5);','vec4 p=texture(uTexture,vTextureCoord);vec4 source=floor(vec4(p.a>0.?p.rgb/p.a:vec3(0.),p.a)*255.+.5);');
  function invalidate(){if(material)gpu.release(material);if(emission)gpu.release(emission);material=emission=null;}
  return {process(source){if(disposed)return null;if(source.width>maxSize||source.height>maxSize)throw Error('Creature GPU surface too large');calls++;
   material=gpu.shaderPass(source,code,{uStrength:{value:strength,type:'f32'},uEmission:{value:0,type:'f32'}},'creature-material',material);
   emission=gpu.shaderPass(source,code,{uStrength:{value:strength,type:'f32'},uEmission:{value:1,type:'f32'}},'creature-emission',emission);return {material,emission};},
   invalidate,reset:invalidate,dispose(){invalidate();disposed=true;},setStrength(v){strength=Math.max(0,Math.min(1,v));},
   stats:()=>({ready:!disposed,calls,uploads:0,readbacks:0,bytes:material?material.width*material.height*8:0,lastError:null,gpuResident:true})};
 };
 globalThis.__gpu2d=gpu;globalThis.MazeBitersRenderer=controller;
 return controller;
}
