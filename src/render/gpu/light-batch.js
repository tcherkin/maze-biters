// Persistent, ordered light-stamp meshes. Original kernels, support, strengths,
// blocker rectangles and sample lattice are inputs; visibility moves to GPU.
import {Container,Mesh,MeshGeometry,Shader,GlProgram,BufferImageSource,Texture} from './vendor/pixi.mjs';
const ROW=40,CAPACITY=1024,ATLAS_CELL=112,ATLAS_COLS=8;
const vertex=`#version 300 es
in vec2 aPosition;in vec2 aUV;uniform mat3 uProjectionMatrix,uWorldTransformMatrix;
out vec2 vPoint;flat out int vStamp;
void main(){vPoint=aPosition;vStamp=int(aUV.x+.5);gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
in vec2 vPoint;flat in int vStamp;out vec4 finalColor;
uniform sampler2D uData,uAtlas;
vec4 record(int n){return texelFetch(uData,ivec2(n,vStamp),0);}
float visible(vec2 point,vec4 head,vec4 clip,int count){
 if(point.x<clip.x||point.y<clip.y||point.x>clip.z||point.y>clip.w)return 0.;
 vec2 delta=point-head.xy;
 // A zero component is parallel to the corresponding slab, not 0 * infinity.
 vec2 inv=1./mix(delta,vec2(1e-20),lessThan(abs(delta),vec2(1e-20)));
 for(int i=0;i<36;i++){
  if(i>=count)break;vec4 r=record(4+i);
  if(head.x>r.x&&head.x<r.z&&head.y>r.y&&head.y<r.w)return 0.;
  vec2 a=(r.xy-head.xy)*inv,b=(r.zw-head.xy)*inv;
  float near=max(min(a.x,b.x),min(a.y,b.y)),far=min(max(a.x,b.x),max(a.y,b.y));
  if(near<=far&&far>0.&&near>=0.&&near<1.)return 0.;
 }return 1.;
}
void main(){
 vec4 h=record(0),atlas=record(1),clip=record(2);int count=int(record(3).x+.5);
 vec2 uv=(vPoint-h.xy)/(h.z*2.)+.5;
 vec4 color=texture(uAtlas,atlas.xy+uv*atlas.zw);
 // Four subpixel coverage samples retain soft clip edges at the original
 // light-map resolution. No lower-resolution lights or reduced stamp count.
 float a=(visible(vPoint+vec2(-.25,-.25),h,clip,count)+visible(vPoint+vec2(.25,-.25),h,clip,count)
  +visible(vPoint+vec2(-.25,.25),h,clip,count)+visible(vPoint+vec2(.25,.25),h,clip,count))*.25;
 finalColor=color*(h.w*a);
}`;
export function createLightBatch(gpu,surface,label){
 const data=new Float32Array(ROW*CAPACITY*4),positions=new Float32Array(CAPACITY*8),uvs=new Float32Array(CAPACITY*8),indices=new Uint32Array(CAPACITY*6);
 for(let i=0;i<CAPACITY;i++){for(let v=0;v<4;v++)uvs[i*8+v*2]=i;indices.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6);}
 const dataSource=new BufferImageSource({resource:data,width:ROW,height:CAPACITY,format:'rgba32float',scaleMode:'nearest',alphaMode:'no-premultiply-alpha',autoGenerateMipmaps:false});
 const atlas=document.createElement('canvas');atlas.width=ATLAS_COLS*ATLAS_CELL;atlas.height=ATLAS_CELL*3;
 const atlasContext=atlas.getContext('2d'),slots=new Map();
 const geometry=new MeshGeometry({positions,uvs,indices}),root=new Container();
 const shader=new Shader({glProgram:GlProgram.from({vertex,fragment}),resources:{uData:dataSource,uAtlas:Texture.EMPTY.source}});
 const mesh=new Mesh({geometry,shader});root.addChild(mesh);
 let count=0,peak=0,frames=0,disposed=false,dataUploadBytes=0,frameBatches=0;
 function kernel(image){let slot=slots.get(image);if(slot)return slot;
  if(slots.size>=24||image.width+4>ATLAS_CELL||image.height+4>ATLAS_CELL)throw Error('Light atlas capacity exceeded');
  const id=slots.size,x=id%ATLAS_COLS*ATLAS_CELL+2,y=Math.floor(id/ATLAS_COLS)*ATLAS_CELL+2;
  atlasContext.drawImage(image,x,y);slot=[x/atlas.width,y/atlas.height,image.width/atlas.width,image.height/atlas.height];slots.set(image,slot);return slot;
 }
 const api={begin(){count=0;frameBatches=0;},push(image,x,y,radius,alpha,rectangles=null,number=0,clip=null){
  if(number>36)throw Error('Light blocker capacity exceeded');
  // Dense late-game populations retain every light, in ordered chunks.
  // Only the first chunk clears the destination; later chunks accumulate.
  if(count>=CAPACITY){api.flush();count=0;}
  const i=count++,at=i*ROW*4,p=i*8;positions.set([x-radius,y-radius,x+radius,y-radius,x+radius,y+radius,x-radius,y+radius],p);
  data.set([x,y,radius,alpha],at);data.set(kernel(image),at+4);data.set(clip||[-1e6,-1e6,1e6,1e6],at+8);data[at+12]=number;
  for(let j=0;j<number;j++){const r=rectangles[j];data.set([r.left,r.top,r.right,r.bottom],at+16+j*4);}
 },flush(){
  if(disposed)throw Error('Disposed light batch');peak=Math.max(peak,count);frames++;
  if(!count)return;
  geometry.positions=positions.subarray(0,count*8);geometry.uvs=uvs.subarray(0,count*8);geometry.indices=indices.subarray(0,count*6);
  dataSource.update(0,count*ROW);dataUploadBytes+=count*ROW*16;
  shader.resources.uAtlas=gpu.texture(atlas).source;
  gpu.renderRetained(root,surface,frameBatches++===0);
 },stats:()=>({kind:'persistent-light-batch',label,count,peak,frames,nodes:1,textureBytes:data.byteLength,geometryBytes:positions.byteLength+uvs.byteLength+indices.byteLength,dataUploadBytes,visibility:'GPU ray/slab tests; four coverage samples',kernels:slots.size}),
 dispose(){if(disposed)return;disposed=true;gpu.releaseUpload(atlas);root.destroy({children:true});geometry.destroy(true);shader.destroy();dataSource.destroy();slots.clear();atlas.width=atlas.height=1;gpu.retainedOwners.delete(api);}};
 gpu.retainedOwners.add(api);return api;
}
