import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createTurnRenderer} from './renderer.js';
import {forwardJawY} from './jaw-rig.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const accepted=path.resolve(process.argv[2]||'C:/Users/tcher/Documents/Codex/2026-08-24/maze-biters-work-chat-crash-git/experiments/fantasy-biter-turn-study');
const read=file=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n').trimEnd();
let checks=0;
function equal(a,b,label){assert.deepEqual(a,b,label);checks++;}
function ok(v,label){assert.ok(v,label);checks++;}
for(const file of ['geometry.js','front-geometry.js','back-geometry.js','back-projection.js','silhouette.js','front-surface.js','back-surface.js','crest-surface.js','seam-surface.js']){
  let expected=read(path.join(accepted,file));
  if(file==='geometry.js')expected=expected.replace("../fantasy-biter-mouth-study/paired-mesh.js","./paired-mesh.js").replace("../fantasy-biter-mouth-study/stronger-open.js","./jaw-rig.js");
  if(file==='back-projection.js')expected=expected.replace("../fantasy-biter-mouth-study/paired-mesh.js","./paired-mesh.js");
  equal(read(path.join(here,file)),expected,'Accepted source unchanged: '+file);
}
// The only intentional routing difference from the accepted study is the
// user-requested left→down→right half turn. Art/geometry remain exact above.
const routing=await import('./turn.js'),approvedRouting=await import(pathToFileURL(path.join(accepted,'turn.js')));
for(const from of routing.DIRECTIONS)for(const to of routing.DIRECTIONS){
  const plan=routing.planTurn(from,to);
  if(from==='left'&&to==='right'){
    equal(plan.route,['left','down','right'],'Approved production routing exception');
    equal(routing.sampleTurn(plan,.5).from,'down','Front-facing midpoint');
  }else for(let step=0;step<=100;step++)equal(routing.sampleTurn(plan,step/100),approvedRouting.sampleTurn(approvedRouting.planTurn(from,to),step/100),'All other routes unchanged');
}
equal(read(path.join(here,'paired-mesh.js')),read(path.join(accepted,'../fantasy-biter-mouth-study/paired-mesh.js')),'Shared mesh unchanged');
const approvedRenderer=read(path.join(accepted,'renderer.js'));
const currentRenderer=read(path.join(here,'renderer.js'));
equal(currentRenderer.slice(currentRenderer.indexOf('const vertex ='),currentRenderer.indexOf('// The aperture')).trimEnd(),
  approvedRenderer.slice(approvedRenderer.indexOf('const vertex ='),approvedRenderer.indexOf('export function createTurnRenderer')).trimEnd(),'Accepted art shaders byte-equivalent');
const originalJaw=await import(pathToFileURL(path.join(accepted,'../fantasy-biter-mouth-study/stronger-open.js')));
for(const direction of ['right','down'])for(let frame=0;frame<=48;frame++)for(let x=0;x<=160;x+=10)for(let y=0;y<=160;y+=10){
  equal(forwardJawY(x,y,direction,frame/48),originalJaw.forwardJawY(x,y,direction,frame/48),'Pure jaw extraction');
}

function rig(size,{failCompile=false,failSurface=false,noGL=false}={}){
  const live={shader:new Set(),program:new Set(),texture:new Set(),buffer:new Set()};
  const compiled=[],calls=[],canvases=[],nativeCalls=[],maskCalls=[];let id=0,loseCount=0;
  const target={
    createShader:()=>{const v={id:++id};live.shader.add(v);return v;},
    createProgram:()=>{const v={id:++id};live.program.add(v);return v;},
    createTexture:()=>{const v={id:++id};live.texture.add(v);return v;},
    createBuffer:()=>{const v={id:++id};live.buffer.add(v);return v;},
    shaderSource:(sh,source)=>{compiled.push(source);},
    getShaderParameter:()=>!failCompile,getProgramParameter:()=>true,
    getShaderInfoLog:()=>'expected test compilation failure',
    getUniformLocation:(program,name)=>({program,name}),
    deleteShader:v=>live.shader.delete(v),deleteProgram:v=>live.program.delete(v),
    deleteTexture:v=>live.texture.delete(v),deleteBuffer:v=>live.buffer.delete(v),
    getExtension:()=>({loseContext:()=>loseCount++}),isContextLost:()=>false,
  };
  const constants=new Map();let nextConstant=100;
  const gl=new Proxy(target,{get(obj,key){
    if(key in obj)return obj[key];
    if(typeof key==='string'&&key===key.toUpperCase()){if(!constants.has(key))constants.set(key,nextConstant++);return constants.get(key);}
    return (...args)=>calls.push([key,...args]);
  }});
  const canvasFactory=()=>{
    const canvas={width:0,height:0,listeners:new Map(),addEventListener(name,fn){this.listeners.set(name,fn);},removeEventListener(name){this.listeners.delete(name);}};
    const ctx={canvas,imageSmoothingEnabled:true,clearRect(){},drawImage(...args){calls.push(['copy',...args]);},getImageData(){
      const data=new Uint8ClampedArray(size*size*4);for(let i=3;i<data.length;i+=4)data[i]=255;return{data};
    }};
    canvas.getContext=kind=>kind==='webgl'?(noGL?null:gl):(failSurface?null:ctx);
    canvases.push(canvas);return canvas;
  };
  const options={size,canvasFactory,drawPose:(...args)=>nativeCalls.push(args),drawMaskPose:(...args)=>maskCalls.push(args)};
  return {options,live,compiled,calls,canvases,nativeCalls,maskCalls,get loseCount(){return loseCount;}};
}
const cardinal={from:'right',to:'right',mix:0},front={from:'right',to:'down',mix:.5},back={from:'left',to:'up',mix:.5};
const output={drawImage(){}};
for(const size of [80,160]){
  const r=rig(size),renderer=createTurnRenderer(r.options);
  equal(renderer.diagnostics().nativeSurfaceCount,3,'Only art canvases initially');
  equal(renderer.diagnostics().maskReady,false,'No eager mask GL resources');
  renderer.draw(output,'p1:normal',cardinal,.5,.25,4,8,size);
  equal(r.nativeCalls.at(-1).slice(1),['p1:normal','right',.5,.25,4,8,size],'Exact native cardinal callback');
  equal(renderer.diagnostics().drawCount,0,'Cardinals skip GL');
  renderer.draw(output,'p1:normal',front,.5,.25,0,0,size);
  equal(renderer.diagnostics().drawCount,1,'Front morph draw');
  const firstUploads=renderer.diagnostics().uploadCount;
  renderer.draw(output,'p1:normal',front,.5,.25,0,0,size);
  equal(renderer.diagnostics().uploadCount,firstUploads,'Reused source texture');
  renderer.draw(output,'p1:bright',front,.5,.25,0,0,size);
  equal(renderer.diagnostics().uploadCount,firstUploads+2,'Lighting is part of cache key');
  renderer.drawMask(output,'p1:normal',front,.5,0,0,size);
  equal(renderer.diagnostics().maskReady,true,'Mask initialized on demand');
  equal(renderer.diagnostics().nativeSurfaceCount,5,'Only two extra mask surfaces');
  equal(r.maskCalls.length,2,'Front mask samples two apertures');
  renderer.drawMask(output,'p1:normal',back,.5,0,0,size);
  equal(r.maskCalls.at(-1)[2],'left','Rear mask samples only side aperture');
  equal(r.maskCalls.length,3,'Up mask is blank without native callback');
  const beforeUp=r.maskCalls.length;
  renderer.drawMask(output,'p1:normal',{from:'up',to:'up',mix:0},.5,0,0,size);
  equal(r.maskCalls.length,beforeUp,'Exact rear cardinal has no aperture');
  // Overflow the shared cache without forcing all 49 costly triangulations.
  for(let variant=0;variant<50;variant++)renderer.warm('test-'+variant+':normal',0);
  equal(renderer.diagnostics().silhouetteEntries,192,'Bounded LRU');
  equal(renderer.diagnostics().silhouetteBytes,192*size*size,'Exact silhouette byte cap');
  ok(renderer.diagnostics().evictionCount>0,'LRU eviction occurs');
  ok(renderer.diagnostics().geometryEntries<=196,'Geometry bound');
  equal(renderer.diagnostics().warmCount,50,'Warm batches counted');
  assert.throws(()=>renderer.draw(output,'p1:normal',{from:'right',to:'left',mix:.5},0,0,0,0,size));checks++;
  assert.throws(()=>renderer.warm('p1:normal',NaN));checks++;
  ok(r.compiled[3].includes('uSideMask'),'Separate mask shader');
  ok(!r.compiled[3].includes('void crestSurface'),'Mask shader has no crest paint');
  ok(r.compiled[3].includes('gl_FragColor=vec4(alpha)'),'Mask emits aperture alpha only');
  renderer.dispose();renderer.dispose();
  for(const values of Object.values(r.live))equal(values.size,0,'Every GL allocation released');
  equal(r.loseCount,1,'One context disposal');
  equal(renderer.diagnostics().silhouetteBytes,0,'Cache disposed');
  equal(renderer.diagnostics().nativeSurfaceCount,0,'Canvases disposed');
  assert.throws(()=>renderer.draw(output,'p1:normal',front,0,0,0,0,size));checks++;
}
for(const options of [{failCompile:true},{failSurface:true},{noGL:true}]){
  const r=rig(80,options);
  assert.throws(()=>createTurnRenderer(r.options));checks++;
  for(const values of Object.values(r.live))equal(values.size,0,'Initialization failure releases resources');
  ok(r.canvases.every(canvas=>canvas.width===1&&canvas.height===1),'Failed surfaces released');
}
console.log(JSON.stringify({passed:true,checks,nativeSizes:[80,160],silhouetteLimit:192,artShaders:'accepted v4 exact',assetsDuplicated:0},null,2));
