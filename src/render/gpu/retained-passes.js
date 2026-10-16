import {Container,Mesh,MeshGeometry,Shader,GlProgram,UniformGroup,Texture} from './vendor/pixi.mjs';
const REUSE=true;
const vertex=`#version 300 es
in vec2 aPosition;in vec2 aUV;out vec2 vTextureCoord;
uniform mat3 uProjectionMatrix,uWorldTransformMatrix;
void main(){vTextureCoord=aUV;gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`;
export function createPass(gpu,width,height,fragment,uniforms={},label='persistent-pass',target=null){
 const surface=target||gpu.makeSurface(width,height,label),root=new Container();
 const geometry=new MeshGeometry({positions:new Float32Array([0,0,width,0,width,height,0,height]),uvs:new Float32Array([0,0,1,0,1,1,0,1]),indices:new Uint32Array([0,1,2,0,2,3])});
 const custom=new UniformGroup(uniforms),resources={custom};
 for(const match of fragment.matchAll(/uniform sampler2D\s+(\w+)\s*;/g))resources[match[1]]=Texture.EMPTY.source;
 const shader=new Shader({glProgram:GlProgram.from({vertex,fragment:'#version 300 es\nprecision highp float;in vec2 vTextureCoord;out vec4 finalColor;\n'+fragment}),resources});
 const mesh=new Mesh({geometry,shader});root.addChild(mesh);let frames=0,disposed=false;
 const api={surface,shader,custom,render(inputs={},values={}){
   if(disposed)throw Error('Disposed persistent pass');
   if(REUSE){for(const name in inputs)if(Object.hasOwn(inputs,name))shader.resources[name]=gpu.texture(inputs[name]).source;for(const name in values)if(Object.hasOwn(values,name))custom.uniforms[name]=values[name];}
   else{for(const [name,input]of Object.entries(inputs))shader.resources[name]=gpu.texture(input).source;for(const [name,value]of Object.entries(values))custom.uniforms[name]=value;}custom.update();
   const w=surface.width,h=surface.height,p=geometry.positions;
   if(p[2]!==w||p[5]!==h){p.set([0,0,w,0,w,h,0,h]);geometry.getBuffer('aPosition').update();}
   gpu.renderRetained(root,surface,true);frames++;return surface;
 },stats:()=>({kind:'persistent-shader-pass',label,frames,nodes:1,textureBytes:0}),dispose(){if(disposed)return;disposed=true;root.destroy({children:true});geometry.destroy(true);shader.destroy();gpu.retainedOwners.delete(api);}};
 gpu.retainedOwners.add(api);return api;
}
export function installPersistentMaterials(gpu){
 const passes=new WeakMap();gpu.shaderPass=(source,fragment,uniforms={},label='material',existing=null)=>{
  let pass=existing&&passes.get(existing);
  if(!pass){pass=createPass(gpu,source.width,source.height,'uniform sampler2D uTexture;\n'+fragment,uniforms,label,existing);passes.set(pass.surface,pass);}
  if(pass.surface.width!==source.width)pass.surface.width=source.width;
  if(pass.surface.height!==source.height)pass.surface.height=source.height;
  if(REUSE){pass._inputs??={uTexture:source};pass._values??={};pass._inputs.uTexture=source;for(const key in pass._values)if(!Object.hasOwn(uniforms,key))delete pass._values[key];for(const key in uniforms)if(Object.hasOwn(uniforms,key))pass._values[key]=uniforms[key].value;return pass.render(pass._inputs,pass._values);}
  return pass.render({uTexture:source},Object.fromEntries(Object.entries(uniforms).map(([key,v])=>[key,v.value])));
 };
}
const projection=`uniform sampler2D uMap;uniform sampler2D uDusk;uniform sampler2D uActors;
uniform vec4 uCamera,uSource,uActor;uniform float uSubtract;
vec4 quant(vec4 x){return floor(x*255.+.5)/255.;}
vec4 sampleBounded(sampler2D tex,vec2 uv){if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec4(0.);return texture(tex,uv);}
void main(){vec2 world=uCamera.xy+vTextureCoord*uCamera.zw;
 vec4 color=quant(sampleBounded(uMap,(world-uSource.xy)/uSource.zw));
 color=quant(color*texture(uDusk,vTextureCoord).a);
 if(uSubtract>.5)color=quant(color*(1.-sampleBounded(uActors,(world-uActor.xy)/uActor.zw).a));
 finalColor=color;}`;
export function createLightingGraph(gpu,width,height){
 const floor=createPass(gpu,width,height,projection,{uCamera:{type:'vec4<f32>',value:new Float32Array(4)},uSource:{type:'vec4<f32>',value:new Float32Array(4)},uActor:{type:'vec4<f32>',value:new Float32Array(4)},uSubtract:{type:'f32',value:1}},'project-floor-mask');
 const walls=createPass(gpu,width,height,projection,{uCamera:{type:'vec4<f32>',value:new Float32Array(4)},uSource:{type:'vec4<f32>',value:new Float32Array(4)},uActor:{type:'vec4<f32>',value:new Float32Array(4)},uSubtract:{type:'f32',value:1}},'project-wall-mask');
 const emission=createPass(gpu,width*2,height*2,projection,{uCamera:{type:'vec4<f32>',value:new Float32Array(4)},uSource:{type:'vec4<f32>',value:new Float32Array(4)},uActor:{type:'vec4<f32>',value:new Float32Array(4)},uSubtract:{type:'f32',value:0}},'project-emission-mask');
 const vector=(x,y,w,h)=>new Float32Array([x,y,w,h]);
 const cameraReuse=new Float32Array(4),actorReuse=new Float32Array(4),sourceReuse=new Float32Array(4),fullSource=vector(0,0,width,height);
 const inputsReuse={uDusk:null,uActors:null,uMap:null},valuesReuse={uCamera:cameraReuse,uActor:actorReuse,uSource:fullSource};
 const outputReuse={floor:null,walls:null,emission:emission.surface};
 function setVector(out,x,y,w,h){out[0]=x;out[1]=y;out[2]=w;out[3]=h;}
 return {project(maps,dusk,camera,capture,actors){
  if(REUSE){
   setVector(cameraReuse,camera.x-width/(camera.zoom*2),camera.y-height/(camera.zoom*2),width/camera.zoom,height/camera.zoom);
   setVector(actorReuse,actors.x,actors.y,actors.canvas.width,actors.canvas.height);
   inputsReuse.uDusk=dusk;inputsReuse.uActors=actors.canvas;valuesReuse.uSource=fullSource;
   if(maps.floor){inputsReuse.uMap=maps.floor;floor.render(inputsReuse,valuesReuse);}
   if(maps.walls){inputsReuse.uMap=maps.walls;walls.render(inputsReuse,valuesReuse);}
   setVector(sourceReuse,capture.x/2,capture.y/2,capture.canvas.width/2,capture.canvas.height/2);
   inputsReuse.uMap=capture.canvas;valuesReuse.uSource=sourceReuse;emission.render(inputsReuse,valuesReuse);
   outputReuse.floor=maps.floor?floor.surface:null;outputReuse.walls=maps.walls?walls.surface:null;return outputReuse;
  }
  const cameraV=vector(camera.x-width/(camera.zoom*2),camera.y-height/(camera.zoom*2),width/camera.zoom,height/camera.zoom);
  const actorV=vector(actors.x,actors.y,actors.canvas.width,actors.canvas.height);
  const common={uCamera:cameraV,uActor:actorV};
  const inputs={uDusk:dusk,uActors:actors.canvas};
  if(maps.floor)floor.render({...inputs,uMap:maps.floor},{...common,uSource:vector(0,0,width,height)});
  if(maps.walls)walls.render({...inputs,uMap:maps.walls},{...common,uSource:vector(0,0,width,height)});
  emission.render({...inputs,uMap:capture.canvas},{...common,uSource:vector(capture.x/2,capture.y/2,capture.canvas.width/2,capture.canvas.height/2)});
  return {floor:maps.floor?floor.surface:null,walls:maps.walls?walls.surface:null,emission:emission.surface};
 }};
}
