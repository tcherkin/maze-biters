// Expand the existing ribbon samples on the GPU; the route stays unchanged.
// No path resampling, strip dropping, texture/AA or painter-order changes.
import {Geometry,MeshGeometry,Mesh,Buffer,BufferUsage,Shader,GlProgram,UniformGroup,Texture} from './vendor/pixi.mjs';
const globals=`uniform mat3 uProjectionMatrix,uWorldTransformMatrix,uTransformMatrix;
uniform vec4 uLinear,uOffset;out vec2 vTextureCoord;`;
const stripVertex=`#version 300 es
precision highp float;
in vec2 aPosition;in vec3 aPose;in vec4 aSource;in vec4 aDest;
uniform vec2 uTextureSize;${globals}
void main(){
 float c=cos(aPose.z),s=sin(aPose.z),signX=uOffset.z;
 float a=(uLinear.x*c+uLinear.z*s)*signX,b=(uLinear.y*c+uLinear.w*s)*signX;
 float cc=-uLinear.x*s+uLinear.z*c,d=-uLinear.y*s+uLinear.w*c;
 float e=uLinear.x*aPose.x+uLinear.z*aPose.y+uOffset.x;
 float f=uLinear.y*aPose.x+uLinear.w*aPose.y+uOffset.y;
 vec2 local=aDest.xy+aPosition*aDest.zw;
 vec2 p=vec2(a*local.x+cc*local.y+e,b*local.x+d*local.y+f);
 vTextureCoord=aSource.xy/uTextureSize+aPosition*(aSource.zw/uTextureSize);
 gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(p,1.)).xy,0.,1.);
}`;
const outlineVertex=`#version 300 es
precision highp float;
in vec2 aPosition;${globals}
void main(){vec2 p=vec2(uLinear.x*aPosition.x+uLinear.z*aPosition.y+uOffset.x,
 uLinear.y*aPosition.x+uLinear.w*aPosition.y+uOffset.y);vTextureCoord=vec2(.5);
 gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(p,1.)).xy,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
in vec2 vTextureCoord;uniform sampler2D uTexture;uniform vec4 uColor;out vec4 finalColor;
void main(){finalColor=texture(uTexture,vTextureCoord)*uColor;}`;
export function createRibbonGeometry(kind){
 let data=new Float32Array(0),view=null,lastCount=0,uploadBytes=0,updates=0,disposed=false;
 const linear=new Float32Array(4),offset=new Float32Array(4),size=new Float32Array(2);
 const custom=new UniformGroup({uLinear:{type:'vec4<f32>',value:linear},uOffset:{type:'vec4<f32>',value:offset},uTextureSize:{type:'vec2<f32>',value:size}});
 let geometry,commands;
 if(kind==='strips'){
  commands=new Buffer({data:new Float32Array(11),usage:BufferUsage.VERTEX|BufferUsage.COPY_DST,shrinkToFit:false});
  geometry=new Geometry({attributes:{
   aPosition:{buffer:new Float32Array([0,0,1,0,1,1,0,1]),format:'float32x2'},
   aPose:{buffer:commands,format:'float32x3',stride:44,offset:0,instance:true},
   aSource:{buffer:commands,format:'float32x4',stride:44,offset:12,instance:true},
   aDest:{buffer:commands,format:'float32x4',stride:44,offset:28,instance:true}
  },indexBuffer:new Uint32Array([0,1,2,0,2,3]),instanceCount:1});
 }else geometry=new MeshGeometry();
 const shader=new Shader({glProgram:GlProgram.from({vertex:kind==='strips'?stripVertex:outlineVertex,fragment}),resources:{custom,uTexture:Texture.WHITE.source}});
 const mesh=new Mesh({geometry,shader});mesh._studyResident=true;
 // Pixi's local uColor retains the existing tint and alpha quantization.
 function update(input,count,matrix,texture,sign=1){
  if(disposed)throw Error('Disposed ribbon geometry');
  const length=count*(kind==='strips'?11:2);
  if(data.length<length){data=new Float32Array(2**Math.ceil(Math.log2(Math.max(16,length))));view=null;}
  if(!view||view.length!==length)view=data.subarray(0,length);
  // TypedArray.set converts Float64 source samples in native code, once.
  view.set(input.subarray(0,length));
  if(kind==='strips'){commands.data=view;geometry.instanceCount=count;}
  else{
   geometry.positions=view;
   if(count!==lastCount){const indices=new Uint32Array((count/2-1)*6);for(let i=0;i<count/2-1;i++){const j=i*6;indices[j]=i;indices[j+1]=i+1;indices[j+2]=count-1-i;indices[j+3]=i+1;indices[j+4]=count-2-i;indices[j+5]=count-1-i;}geometry.indices=indices;}
  }
  linear[0]=matrix.a;linear[1]=matrix.b;linear[2]=matrix.c;linear[3]=matrix.d;
  offset[0]=matrix.e;offset[1]=matrix.f;offset[2]=sign<0?-1:1;
  size[0]=texture.source.width;size[1]=texture.source.height;custom.update();
  shader.resources.uTexture=texture.source;mesh.texture=texture;mesh.blendMode='normal';
  lastCount=count;updates++;uploadBytes+=view.byteLength;return mesh;
 }
 return {mesh,update,get geometryBytes(){return data.byteLength+(kind==='strips'?56:geometry.indices.byteLength);},stats(){return {kind,updates,uploadBytes,geometryBytes:this.geometryBytes,instances:lastCount};},dispose(){if(disposed)return;disposed=true;geometry.destroy(true);shader.destroy();mesh.destroy();}};
}
