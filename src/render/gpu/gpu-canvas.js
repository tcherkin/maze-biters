// Canvas-shaped GPU command adapter for the production world renderer. Pixels stay in Pixi render
// textures; the original animation curves and ordered painters are unchanged.
import {WebGLRenderer,Container,Sprite,Graphics,Texture,CanvasSource,RenderTexture,
  Matrix,Rectangle,Filter,GlProgram,UniformGroup,Color,BlurFilter,Mesh,MeshGeometry} from './vendor/pixi.mjs';
// Validated CPU optimizations: no per-frame deep diagnostics; reuse render data.
const DIAGNOSTICS_OPT=true,REUSE=true;
import {createRibbonGeometry} from './ribbon-geometry.js?v=1.02.17.02';
const GPU_GEOMETRY=true;
const SIMPLE_BLEND={'source-over':'normal','screen':'screen','lighter':'add','destination-out':'erase','multiply':'multiply','destination-over':'study-destination-over','source-atop':'study-source-atop','xor':'study-xor'};
// DOMMatrix(DOMMatrix) performs string coercion in this browser. A numeric
// affine stack avoids reparsing thousands of matrix strings every frame.
class Affine{
 set(m){if(Array.isArray(m)||ArrayBuffer.isView(m)){this.a=m[0];this.b=m[1];this.c=m[2];this.d=m[3];this.e=m[4];this.f=m[5];}else{this.a=m?.a??1;this.b=m?.b??0;this.c=m?.c??0;this.d=m?.d??1;this.e=m?.e??0;this.f=m?.f??0;}return this;}
 constructor(m){if(Array.isArray(m)||ArrayBuffer.isView(m))[this.a,this.b,this.c,this.d,this.e,this.f]=m;else{this.a=m?.a??1;this.b=m?.b??0;this.c=m?.c??0;this.d=m?.d??1;this.e=m?.e??0;this.f=m?.f??0;}}
 get isIdentity(){return this.a===1&&this.b===0&&this.c===0&&this.d===1&&this.e===0&&this.f===0;}
 translateSelf(x,y){this.e+=this.a*x+this.c*y;this.f+=this.b*x+this.d*y;return this;}
 scaleSelf(x,y=x){this.a*=x;this.b*=x;this.c*=y;this.d*=y;return this;}
 rotateSelf(degrees){const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return this.multiplySelf({a:c,b:s,c:-s,d:c,e:0,f:0});}
 multiplySelf(m){const {a,b,c,d,e,f}=this;this.a=a*m.a+c*m.b;this.b=b*m.a+d*m.b;this.c=a*m.c+c*m.d;this.d=b*m.c+d*m.d;this.e=a*m.e+c*m.f+e;this.f=b*m.e+d*m.f+f;return this;}
}
const identity=()=>new Affine();
const filterVertex=`in vec2 aPosition;out vec2 vTextureCoord;
uniform vec4 uInputSize,uOutputFrame,uOutputTexture;
void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
p.x=p.x*2.0/uOutputTexture.x-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
gl_Position=vec4(p,0.,1.);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);}`;
const nativeCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
export async function createGpuCanvas({onContextLost=()=>{}}={}){
 const output=nativeCanvas(1,1),renderer=new WebGLRenderer();
 output.id='gpu-game';output.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none';
 try{await renderer.init({canvas:output,width:1,height:1,resolution:1,backgroundAlpha:0,antialias:false,powerPreference:'high-performance'});}
 catch(error){try{renderer.destroy(true);}catch{}throw error;}
 const surfaces=new Set(),uploads=new WeakMap(),uploadRecords=new Set(),spritePool=[],containerPool=[],graphicsPool=[],meshPool=[],errors=[];
 const retainedOwners=new Set();
 const ribbonSlots=[];let ribbonCursor=0;
 const container=()=>containerPool.pop()||new Container();
 const graphics=()=>graphicsPool.pop()||new Graphics();
 const texturePool=[],compositeFilters=new Map();let pooledBytes=0;
 const rtBytes=t=>t.source.pixelWidth*t.source.pixelHeight*4;
 function acquireRT(w,h,aa=false){const at=texturePool.findIndex(t=>t.width===w&&t.height===h&&t.source.antialias===aa);if(at>=0){const t=texturePool.splice(at,1)[0];pooledBytes-=rtBytes(t);return t;}return RenderTexture.create({width:w,height:h,resolution:1,antialias:aa,scaleMode:'linear'});}
 // Bound only idle attachments, never the resolution or number of live layers.
 // Two matching attachments cover ping-pong reuse without retaining every
 // historical canvas size after quality changes or transient effects.
 function recycleRT(t){if(!t)return;const bytes=rtBytes(t);if(bytes>32*1048576||texturePool.filter(p=>p.width===t.width&&p.height===t.height&&p.source.antialias===t.source.antialias).length>=2){t.destroy(true);return;}texturePool.push(t);pooledBytes+=bytes;while(texturePool.length>16||pooledBytes>32*1048576){const old=texturePool.shift();pooledBytes-=rtBytes(old);old.destroy(true);}}
 const gl=renderer.gl,timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[],gpuTimes=[];let activeQuery=null;
 let profilingEnabled=!DIAGNOSTICS_OPT;
 function setProfiling(enabled){if(activeQuery)throw Error('Cannot change profiling inside a frame');profilingEnabled=!!enabled;if(!enabled){for(const p of pending)gl.deleteQuery(p.query);pending.length=0;gpuTimes.length=0;}}
 // Pinned Pixi 8.22 WebGL backend: Porter-Duff factors use the existing
 // destination attachment, without a redundant back-texture/filter copy.
 Object.assign(renderer.state.blendModesMap,{
  'study-destination-in':[gl.ZERO,gl.SRC_ALPHA],
  'study-source-in':[gl.DST_ALPHA,gl.ZERO],
  'study-source-out':[gl.ONE_MINUS_DST_ALPHA,gl.ZERO],
  'study-copy':[gl.ONE,gl.ZERO],
  'study-destination-over':[gl.ONE_MINUS_DST_ALPHA,gl.ONE],
  'study-source-atop':[gl.DST_ALPHA,gl.ONE_MINUS_SRC_ALPHA],
  'study-xor':[gl.ONE_MINUS_DST_ALPHA,gl.ONE_MINUS_SRC_ALPHA]
 });
 const gpuName=gl.getExtension('WEBGL_debug_renderer_info')?gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
 function beginFrame(){if(!profilingEnabled)return;const disjoint=timer&&pending.length?gl.getParameter(timer.GPU_DISJOINT_EXT):false;for(let i=pending.length-1;i>=0;i--){const p=pending[i];if(!gl.getQueryParameter(p.query,gl.QUERY_RESULT_AVAILABLE))continue;if(!disjoint)gpuTimes.push({frame:p.frame,ms:gl.getQueryParameter(p.query,gl.QUERY_RESULT)/1e6});gl.deleteQuery(p.query);pending.splice(i,1);}if(gpuTimes.length>3600)gpuTimes.splice(0,gpuTimes.length-3600);if(timer&&pending.length<8){activeQuery=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,activeQuery);}}
 function endFrame(){if(activeQuery){gl.endQuery(timer.TIME_ELAPSED_EXT);pending.push({query:activeQuery,frame:frames});activeQuery=null;}}
 let lost=false,serial=0,frames=0,draws=0,passes=0,uploadBytes=0,uploadCount=0,readbacks=0;
 output.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;output.style.display='none';errors.push('GPU context lost');onContextLost();});
 const revisions=new WeakMap(),mutationHooks=[];
 // Track mutable native staging canvases (not immutable images). Never infer
 // immutability from canvas identity or dimensions.
 for(const key of ['drawImage','fillRect','clearRect','strokeRect','fill','stroke','fillText','strokeText','putImageData','reset']){
  const old=CanvasRenderingContext2D.prototype[key];if(!old)continue;
  const wrapped=function(...args){const r=old.apply(this,args);revisions.set(this.canvas,(revisions.get(this.canvas)||0)+1);return r;};
  CanvasRenderingContext2D.prototype[key]=wrapped;mutationHooks.push({key,old,wrapped});
 }
 function render(root,target,clear=false){renderer.render({container:root,target,clear});passes++;}
 function texture(source){
  if(source?._gpu){source._gpu.flush();return source._gpu.texture;}
  const w=source.naturalWidth||source.width,h=source.naturalHeight||source.height;
  let r=uploads.get(source),rev=revisions.get(source)||0;
  // A native WebGL output has no Canvas2D mutation notification.
  const mutable=source instanceof HTMLCanvasElement&&!revisions.has(source);
  if(!r||r.width!==w||r.height!==h){
   if(r){r.texture.destroy(true);uploadRecords.delete(r);}
   const s=new CanvasSource({resource:source,resolution:1,scaleMode:'linear',autoGenerateMipmaps:false,alphaMode:'premultiply-alpha-on-upload'});
   r={texture:new Texture({source:s}),width:w,height:h,rev,ref:new WeakRef(source)};uploads.set(source,r);uploadRecords.add(r);
   renderer.texture.initSource(s);uploadBytes+=w*h*4;uploadCount++;
  }else if(r.rev!==rev||mutable){r.texture.source.update();r.rev=rev;uploadBytes+=w*h*4;uploadCount++;}
  return r.texture;
 }
 function releaseUpload(source){const r=uploads.get(source);if(!r)return;for(const s of surfaces)s.flush();r.texture.destroy(true);uploads.delete(source);uploadRecords.delete(r);}
 function clearUploads(){
  // Quality/cache generations replace many native staging identities.
  // Flush pending readers before releasing their GPU copies; current sources
  // are uploaded lazily again, with their original resolution and pixels.
  for(const s of surfaces)s.flush();
  for(const r of uploadRecords){const source=r.ref.deref();if(source)uploads.delete(source);r.texture.destroy(true);}
  uploadRecords.clear();
 }
 const identityMatrix=new Matrix();
 function sprite(tex){const s=spritePool.pop()||new Sprite();s.texture=tex;s.alpha=1;s.tint=0xffffff;s.blendMode='normal';s.filters=null;s.mask=null;s.setFromMatrix(REUSE?identityMatrix:new Matrix());return s;}
 function cleanup(node){
  if(node._studyResident){node.removeFromParent();return;}
  if(node instanceof Sprite){node.removeFromParent();node.filters?.forEach(f=>{if(!f._studyShared)f.destroy();});node.filters=null;node.mask=null;node.texture=Texture.EMPTY;node._studyView?.destroy(false);node._studyView=null;node.filterArea=null;spritePool.push(node);return;}
  if(node instanceof Mesh){node.removeFromParent();node.blendMode='normal';meshPool.push(node);return;}
  node.removeFromParent();node.mask=null;if(REUSE){while(node.children.length)cleanup(node.children[0]);}else for(const c of [...node.children])cleanup(c);
  if(node instanceof Graphics){node.clear();node.alpha=1;node.blendMode='normal';node.setFromMatrix(REUSE?identityMatrix:new Matrix());graphicsPool.push(node);}else containerPool.push(node);
 }
 function effect(fragment,resources={}){return new Filter({glProgram:GlProgram.from({vertex:filterVertex,fragment:'precision highp float;in vec2 vTextureCoord;uniform sampler2D uTexture;out vec4 finalColor;\n'+fragment}),resources,padding:0,resolution:1,antialias:false});}
 function makeSurface(w=1,h=1,label='surface',aa=false){
  const canvas={_gpu:null,_width:Math.max(1,w|0),_height:Math.max(1,h|0),addEventListener(){},removeEventListener(){},getContext(type){if(type!=='2d')throw Error('GPU surface only supports 2d command adapter');return state.ctx;}};
  const state={canvas,label,texture:null,root:container(),clear:true,dependencies:new Set(),consumers:new Set(),ctx:null,flushing:false,groups:new Map(),meshes:[],sprites:[],meshCursor:0,spriteCursor:0,gpuRibbons:[],gpuRibbonCursor:0};
  canvas._gpu=state;surfaces.add(state);
  function changed(){for(const c of [...state.consumers])c.flush();}
  state.beforeWrite=changed;
  // Paired width/height writes must not allocate unused intermediate sizes.
  state.ensureTexture=()=>state.texture??=acquireRT(canvas.width,canvas.height,aa);
  function discard(){if(REUSE){while(state.root.children.length)cleanup(state.root.children[0]);}else for(const c of [...state.root.children])cleanup(c);state.groups.clear();for(const d of state.dependencies)d.consumers.delete(state);state.dependencies.clear();}
  function resize(){changed();discard();if(state.texture)recycleRT(state.texture);state.texture=null;state.clear=true;state.ctx?.reset();}
  for(const key of ['width','height'])Object.defineProperty(canvas,key,{get:()=>canvas['_'+key],set(value){canvas['_'+key]=Math.max(1,value|0);resize();}});
  state.flush=()=>{if(state.flushing)throw Error('GPU dependency cycle');if(!state.root.children.length&&!state.clear)return;
   state.flushing=true;try{for(const d of state.dependencies)d.flush();render(state.root,state.ensureTexture(),state.clear);state.clear=false;discard();}finally{state.flushing=false;}};
  function pathGraphic(path){const g=graphics();for(const [method,args]of path)g[method](...args);return g;}
  function group(){const clips=ctx._state.clips;if(!clips.length)return state.root;const key=clips.at(-1).id;let parent=state.groups.get(key);if(parent)return parent;
   parent=state.root;for(const clip of clips){let p=state.groups.get(clip.id);if(!p){p=container();const mask=pathGraphic(clip.path).fill(0xffffff);parent.addChild(p,mask);p.mask=mask;state.groups.set(clip.id,p);}parent=p;}return parent;}
  function enqueue(node){changed();group().addChild(node);draws++;}
  function residentMesh(vertexCount,indexCount){
   const slot=state.meshCursor++;let mesh=state.meshes[slot];
   if(!mesh){mesh=new Mesh({geometry:new MeshGeometry()});mesh._studyResident=true;state.meshes[slot]=mesh;}
   const capacity=2**Math.ceil(Math.log2(Math.max(4,vertexCount)));
   if(!mesh._positions||mesh._positions.length<vertexCount*2){mesh._positions=new Float32Array(capacity*2);mesh._uvs=new Float32Array(capacity*2);}
   if(!mesh._indices||mesh._indices.length<indexCount)mesh._indices=new Uint32Array(2**Math.ceil(Math.log2(Math.max(6,indexCount))));
   mesh.blendMode='normal';return mesh;
  }
  function ribbon(kind){const slot=state.gpuRibbonCursor++;let r=state.gpuRibbons[slot];if(r&&r.mesh._ribbonKind!==kind){r.dispose();r=null;}if(!r){r=createRibbonGeometry(kind);r.mesh._ribbonKind=kind;state.gpuRibbons[slot]=r;}return r;}
  function submitMesh(mesh,count,indexCount){
   if(REUSE){
    if(mesh._positionView?.buffer!==mesh._positions.buffer||mesh._positionView.length!==count*2){mesh._positionView=mesh._positions.subarray(0,count*2);mesh._uvView=mesh._uvs.subarray(0,count*2);}
    if(mesh._indexView?.buffer!==mesh._indices.buffer||mesh._indexView.length!==indexCount)mesh._indexView=mesh._indices.subarray(0,indexCount);
    // Assign even when the views are reused: the vertex contents changed.
    mesh.geometry.positions=mesh._positionView;mesh.geometry.uvs=mesh._uvView;mesh.geometry.indices=mesh._indexView;
   }else{mesh.geometry.positions=mesh._positions.subarray(0,count*2);mesh.geometry.uvs=mesh._uvs.subarray(0,count*2);mesh.geometry.indices=mesh._indices.subarray(0,indexCount);}add(mesh);
  }
  function add(node,op=ctx.globalCompositeOperation){
   const simple=REUSE?SIMPLE_BLEND:{'source-over':'normal','screen':'screen','lighter':'add','destination-out':'erase','multiply':'multiply','destination-over':'study-destination-over','source-atop':'study-source-atop','xor':'study-xor'};
   if(simple[op]){node.blendMode=simple[op];enqueue(node);return;}
   if(op==='copy'&&!ctx._state.clips.length){changed();discard();state.clear=true;enqueue(node);return;}
   // Full-target mask sprites have no uncovered transparent region. Their
   // Porter-Duff operation can join the ordered scene without staging a copy.
   if((op==='destination-in'||op==='source-in')&&node._studyFullCoverage&&!node.filters&&!ctx._state.clips.length){node.blendMode='study-'+op;enqueue(node);return;}
   // Canvas source-in/destination-in affect transparent pixels outside the
   // source bounds as well. Use a full-surface GPU pass, not a bounded sprite.
   changed();state.flush();
   const incoming=makeSurface(canvas.width,canvas.height,'composite-source',aa);
   incoming._gpu.root.addChild(node);incoming._gpu.flush();
   const source=sprite(incoming._gpu.texture);
   const mode='study-'+op;if(!renderer.state.blendModesMap[mode])throw Error('Unsupported GPU composite: '+op);
   source.blendMode=mode;group().addChild(source);state.flush();release(incoming);
  }
  const defaults=()=>({matrix:identity(),alpha:1,op:'source-over',fill:'#000',stroke:'#000',lineWidth:1,lineCap:'butt',lineJoin:'miter',miterLimit:10,filter:'none',shadowBlur:0,shadowColor:'transparent',shadowOffsetX:0,shadowOffsetY:0,smooth:true,clips:[]});
  const statePool=[],baseState=defaults(),drawAffine=new Affine(),transformAffine=new Affine(),drawMatrix=new Matrix();
  // Every saved frame owns its matrix. Clip arrays are immutable snapshots;
  // path arrays still follow Canvas semantics and are not recycled here.
  function copyState(target,source){const matrix=target.matrix;Object.assign(target,source);target.matrix=matrix.set(source.matrix);return target;}
  const pixiMatrix=m=>drawMatrix.set(m.a,m.b,m.c,m.d,m.e,m.f);
  const stack=[],ctx={canvas,_state:defaults(),_path:[],_point:[0,0],
   reset(){if(REUSE){while(stack.length)statePool.push(stack.pop());copyState(this._state,baseState);}else{this._state=defaults();stack.length=0;}this.beginPath();},isContextLost:()=>lost,
   save(){stack.push(REUSE?copyState(statePool.pop()||defaults(),this._state):{...this._state,matrix:new Affine(this._state.matrix)});},restore(){if(stack.length){if(REUSE)statePool.push(this._state);this._state=stack.pop();}},
   getTransform(){return new Affine(this._state.matrix);},setTransform(...a){if(REUSE)this._state.matrix.set(a.length===1?a[0]:a);else this._state.matrix=new Affine(a.length===1?a[0]:a);},resetTransform(){if(REUSE)this._state.matrix.set();else this._state.matrix=identity();},
   transform(...a){this._state.matrix.multiplySelf(REUSE?transformAffine.set(a):new Affine(a));},translate(x,y){this._state.matrix.translateSelf(x,y);},rotate(r){this._state.matrix.rotateSelf(r*180/Math.PI);},scale(x,y){this._state.matrix.scaleSelf(x,y);},
   beginPath(){this._path=[];},_p(x,y){const m=this._state.matrix;return[m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f];},
   moveTo(x,y){this._point=[x,y];this._path.push(['moveTo',this._p(x,y)]);},lineTo(x,y){this._point=[x,y];this._path.push(['lineTo',this._p(x,y)]);},closePath(){this._path.push(['closePath',[]]);},
   rect(x,y,w,h){this.moveTo(x,y);this.lineTo(x+w,y);this.lineTo(x+w,y+h);this.lineTo(x,y+h);this.closePath();},
   quadraticCurveTo(cx,cy,x,y){this._point=[x,y];this._path.push(['quadraticCurveTo',[...this._p(cx,cy),...this._p(x,y)]]);},
   bezierCurveTo(a,b,c,d,x,y){this._point=[x,y];this._path.push(['bezierCurveTo',[...this._p(a,b),...this._p(c,d),...this._p(x,y)]]);},
   arc(x,y,r,start,end,ccw=false){this.ellipse(x,y,r,r,0,start,end,ccw);},
   ellipse(x,y,rx,ry,rotation,start,end,ccw=false){let span=end-start;if(!ccw&&span<0)span=span%(Math.PI*2)+Math.PI*2;if(ccw&&span>0)span=span%(Math.PI*2)-Math.PI*2;span=Math.max(-Math.PI*2,Math.min(Math.PI*2,span));const n=Math.max(8,Math.ceil(Math.abs(span)*Math.max(rx,ry)*2));for(let i=0;i<=n;i++){const a=start+span*i/n,px=x+Math.cos(rotation)*rx*Math.cos(a)-Math.sin(rotation)*ry*Math.sin(a),py=y+Math.sin(rotation)*rx*Math.cos(a)+Math.cos(rotation)*ry*Math.sin(a);if(i||this._path.length)this.lineTo(px,py);else this.moveTo(px,py);}},
   clip(){this._state.clips=[...this._state.clips,{id:++serial,path:this._path.slice()}];},
   fill(){const g=pathGraphic(this._path);g.fill(this.fillStyle);g.alpha=this.globalAlpha;add(g);},
   fillRibbon(points,count,matrix){
    if(GPU_GEOMETRY){if(count<4)return;const mesh=ribbon('outline').update(points,count,matrix,Texture.WHITE);mesh.tint=this.fillStyle;mesh.alpha=this.globalAlpha;add(mesh);return;}
    // The native ribbon already gives paired upper/lower vertices. Preserve
    // every boundary sample, but connect the strip directly on GPU instead
    // of repeatedly ear-clipping a long, very thin polygon on the CPU.
    const half=count/2,mesh=residentMesh(count,(half-1)*6),positions=mesh._positions,indices=mesh._indices;
    for(let i=0;i<count;i++){const x=points[i*2],y=points[i*2+1];positions[i*2]=matrix.a*x+matrix.c*y+matrix.e;positions[i*2+1]=matrix.b*x+matrix.d*y+matrix.f;}
    for(let i=0;i<half-1;i++){if(REUSE){const j=i*6;indices[j]=i;indices[j+1]=i+1;indices[j+2]=count-1-i;indices[j+3]=i+1;indices[j+4]=count-2-i;indices[j+5]=count-1-i;}else indices.set([i,i+1,count-1-i,i+1,count-2-i,count-1-i],i*6);}
    mesh.texture=Texture.WHITE;mesh.tint=this.fillStyle;mesh.alpha=this.globalAlpha;submitMesh(mesh,count,(half-1)*6);
   },
   drawRibbonStrips(source,commands,count,sign){
    if(GPU_GEOMETRY){if(!count)return 0;const tex=texture(source),mesh=ribbon('strips').update(commands,count,this._state.matrix,tex,sign);mesh.tint=0xffffff;mesh.alpha=this.globalAlpha;if(source._gpu){source._gpu.consumers.add(state);state.dependencies.add(source._gpu);}add(mesh);return count;}
    const mesh=residentMesh(count*4,count*6),positions=mesh._positions,uvs=mesh._uvs,indices=mesh._indices,m=this._state.matrix;
    const tex=texture(source),width=source.width,height=source.height;
    for(let i=0;i<count;i++){
     const at=i*11,x=commands[at],y=commands[at+1],angle=commands[at+2],c=Math.cos(angle),s=Math.sin(angle),sx=sign<0?-1:1;
     const a=(m.a*c+m.c*s)*sx,b=(m.b*c+m.d*s)*sx,cc=-m.a*s+m.c*c,d=-m.b*s+m.d*c,e=m.a*x+m.c*y+m.e,f=m.b*x+m.d*y+m.f;
     const left=commands[at+7],top=commands[at+8],right=left+commands[at+9],bottom=top+commands[at+10];
     const u=commands[at+3]/width,v=commands[at+4]/height,u2=u+commands[at+5]/width,v2=v+commands[at+6]/height,j=i*8,k=i*6,n=i*4;
     positions[j]=a*left+cc*top+e;positions[j+1]=b*left+d*top+f;positions[j+2]=a*right+cc*top+e;positions[j+3]=b*right+d*top+f;
     positions[j+4]=a*right+cc*bottom+e;positions[j+5]=b*right+d*bottom+f;positions[j+6]=a*left+cc*bottom+e;positions[j+7]=b*left+d*bottom+f;
     uvs[j]=u;uvs[j+1]=v;uvs[j+2]=u2;uvs[j+3]=v;uvs[j+4]=u2;uvs[j+5]=v2;uvs[j+6]=u;uvs[j+7]=v2;
     indices[k]=n;indices[k+1]=n+1;indices[k+2]=n+2;indices[k+3]=n;indices[k+4]=n+2;indices[k+5]=n+3;
    }
    mesh.texture=tex;mesh.tint=0xffffff;mesh.alpha=this.globalAlpha;if(source._gpu){source._gpu.consumers.add(state);state.dependencies.add(source._gpu);}submitMesh(mesh,count*4,count*6);return count;
   },
   stroke(){const g=pathGraphic(this._path);g.stroke({color:this.strokeStyle,width:this.lineWidth*Math.hypot(this._state.matrix.a,this._state.matrix.b),cap:this.lineCap,join:this.lineJoin,miterLimit:this.miterLimit});g.alpha=this.globalAlpha;add(g);},
   fillRect(x,y,w,h){const prior=this._path;this.beginPath();this.rect(x,y,w,h);this.fill();this._path=prior;},
   strokeRect(x,y,w,h){const prior=this._path;this.beginPath();this.rect(x,y,w,h);this.stroke();this._path=prior;},
   clearRect(x,y,w,h){changed();const m=this._state.matrix;if(!this._state.clips.length&&m.isIdentity&&x<=0&&y<=0&&x+w>=canvas.width&&y+h>=canvas.height){discard();state.clear=true;return;}const g=graphics().rect(x,y,w,h).fill(0xffffff);g.setFromMatrix(REUSE?pixiMatrix(m):new Matrix(m.a,m.b,m.c,m.d,m.e,m.f));add(g,'destination-out');},
   drawImage(source,...args){
    if(!source||!source.width&&!source.naturalWidth)return;const sw0=source.naturalWidth||source.width,sh0=source.naturalHeight||source.height;
    let sx=0,sy=0,sw=sw0,sh=sh0,dx,dy,dw,dh;
    if(args.length===2){[dx,dy]=args;dw=sw;dh=sh;}else if(args.length===4)[dx,dy,dw,dh]=args;else if(args.length===8)[sx,sy,sw,sh,dx,dy,dw,dh]=args;else throw Error('GPU drawImage signature');
    if(!(sw>0&&sh>0)||!dw||!dh)return;
    // Match Canvas source clipping outside the bitmap.
    if(sx<0){dx-=sx/sw*dw;dw*=1+sx/sw;sw+=sx;sx=0;}if(sy<0){dy-=sy/sh*dh;dh*=1+sy/sh;sh+=sy;sy=0;}
    if(sx+sw>sw0){dw*=(sw0-sx)/sw;sw=sw0-sx;}if(sy+sh>sh0){dh*=(sh0-sy)/sh;sh=sh0-sy;}if(!(sw>0&&sh>0))return;
    const tex=texture(source),mode=this.imageSmoothingEnabled?'linear':'nearest';if(tex.source.scaleMode!==mode){tex.source.scaleMode=mode;tex.source.style.update();}
    const slot=state.spriteCursor++;let s=state.sprites[slot];
    if(!s){s=new Sprite();s._studyResident=true;s._studyView=new Texture({source:tex.source,frame:new Rectangle(sx,sy,sw,sh),dynamic:true});s.texture=s._studyView;state.sprites[slot]=s;}
    const view=s._studyView;view.source=tex.source;view.frame.x=sx;view.frame.y=sy;view.frame.width=sw;view.frame.height=sh;view.orig.width=sw;view.orig.height=sh;view.update();
    s.alpha=1;s.tint=0xffffff;s.blendMode='normal';s.filters?.forEach(f=>f.destroy());s.filters=null;s.mask=null;
    const m=REUSE?drawAffine.set(this._state.matrix):new Affine(this._state.matrix);m.translateSelf(dx,dy);m.scaleSelf(dw/sw,dh/sh);s.setFromMatrix(REUSE?pixiMatrix(m):new Matrix(m.a,m.b,m.c,m.d,m.e,m.f));s.alpha=this.globalAlpha;
    s._studyFullCoverage=m.b===0&&m.c===0&&m.e===0&&m.f===0&&Math.abs(m.a*sw-canvas.width)<1e-6&&Math.abs(m.d*sh-canvas.height)<1e-6;
    if(this.filter!=='none'){const blur=/^blur\(([\d.]+)px\)$/.exec(this.filter);if(!blur)throw Error('Unsupported GPU filter '+this.filter);s.filters=[new BlurFilter({strength:Number(blur[1]),quality:6,kernelSize:15,resolution:1})];}
    if(source._gpu){source._gpu.consumers.add(state);state.dependencies.add(source._gpu);}
    if(this.shadowBlur>0&&new Color(this.shadowColor).alpha>0){
     const shadow=sprite(view);shadow.setFromMatrix(new Matrix(m.a,m.b,m.c,m.d,m.e+this.shadowOffsetX,m.f+this.shadowOffsetY));shadow.alpha=s.alpha;
     const color=new Color(this.shadowColor).toArray();shadow.filters=[effect('uniform vec4 uColor;void main(){finalColor=uColor*texture(uTexture,vTextureCoord).a;}',{custom:new UniformGroup({uColor:{value:new Float32Array([color[0]*color[3],color[1]*color[3],color[2]*color[3],color[3]]),type:'vec4<f32>'}})}),new BlurFilter({strength:this.shadowBlur*.5,quality:6,kernelSize:15,resolution:1})];add(shadow);
    }add(s);
   },
   createImageData(w,h){return new ImageData(w,h);},
   getImageData(){throw Error('GPU surface readback prohibited in renderer: '+label);},
   setLineDash(){},getLineDash(){return[];}
  };
  const fields={globalAlpha:'alpha',globalCompositeOperation:'op',fillStyle:'fill',strokeStyle:'stroke',imageSmoothingEnabled:'smooth'};
  for(const key of ['lineWidth','lineCap','lineJoin','miterLimit','filter','shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY'])fields[key]=key;
  for(const [key,name]of Object.entries(fields))Object.defineProperty(ctx,key,{get(){return this._state[name];},set(v){this._state[name]=v;}});
  ctx.imageSmoothingQuality='high';state.ctx=ctx;resize();return canvas;
 }
 function release(canvas){const s=canvas._gpu;if(!s||!surfaces.has(s))return;for(const c of [...s.consumers])c.flush();for(const owner of retainedOwners)if(owner.surface===canvas)owner.dispose();cleanup(s.root);for(const d of s.dependencies)d.consumers.delete(s);for(const n of s.meshes){n.geometry.destroy(true);n.destroy();}for(const r of s.gpuRibbons)r.dispose();for(const n of s.sprites){n.filters?.forEach(f=>f.destroy());n._studyView.destroy(false);n.destroy();}recycleRT(s.texture);surfaces.delete(s);}
 function present(surface,native){surface._gpu.flush();if(output.width!==surface.width||output.height!==surface.height)renderer.resize(surface.width,surface.height);
  if(!output.parentNode){native.parentElement.prepend(output);native.style.cssText+=';position:relative;background:transparent';}output.style.display='block';
  const root=container(),s=sprite(surface._gpu.texture);root.addChild(s);render(root,undefined,true);cleanup(root);frames++;
 }
 function shaderPass(source,fragment,uniforms={},label='shader',existing=null){const tex=texture(source),out=existing||makeSurface(source.width,source.height,label);if(out.width!==source.width)out.width=source.width;if(out.height!==source.height)out.height=source.height;out.getContext('2d').clearRect(0,0,out.width,out.height);const s=sprite(tex);s.filters=[effect(fragment,{custom:new UniformGroup(uniforms)})];s.filterArea=new Rectangle(0,0,source.width,source.height);out._gpu.root.addChild(s);out._gpu.flush();return out;}
 function renderRetained(root,surface,clear=true){const s=surface._gpu;s.beforeWrite();
  // Full clear+draw supersedes only an empty pending clear, after readers
  // have flushed. Never discard drawing commands or partial writes.
  if(clear&&s.clear&&!s.root.children.length)s.clear=false;
  s.flush();render(root,s.ensureTexture(),clear);s.clear=false;draws+=root.children.length;}
 function ribbonSurface(w,h){const i=ribbonCursor++;if(i>=128)throw Error('Persistent ribbon capacity exceeded');let s=ribbonSlots[i];if(!s)s=ribbonSlots[i]=makeSurface(Math.ceil(w/32)*32,Math.ceil(h/32)*32,'resident-ribbon-'+i,true);return s;}
 return {makeSurface,release,releaseUpload,clearUploads,present,texture,renderer,output,shaderPass,effect,ribbonSurface,setProfiling,get profilingEnabled(){return profilingEnabled;},beginFrame(){ribbonCursor=0;for(const s of surfaces){s.meshCursor=0;s.spriteCursor=0;s.gpuRibbonCursor=0;}beginFrame();},endFrame,renderRetained,retainedOwners,
  geometryDiagnostics(){const rows=[...surfaces].flatMap(s=>s.gpuRibbons.map(r=>r.stats()));return {enabled:GPU_GEOMETRY,resident:rows.length,geometryBytes:rows.reduce((n,r)=>n+r.geometryBytes,0),uploadBytes:rows.reduce((n,r)=>n+r.uploadBytes,0),updates:rows.reduce((n,r)=>n+r.updates,0),rows};},
  frameCounters(out={}){out.uploadCount=uploadCount;out.uploadBytes=uploadBytes;out.draws=draws;out.passes=passes;return out;},
  counters(){return {uploadCount,uploadBytes,draws,passes,residentMeshes:[...surfaces].reduce((n,s)=>n+s.meshes.length+s.gpuRibbons.length,0),residentSprites:[...surfaces].reduce((n,s)=>n+s.sprites.length,0),geometryBytes:[...surfaces].reduce((n,s)=>n+s.meshes.reduce((m,o)=>m+o._positions.byteLength+o._uvs.byteLength+o._indices.byteLength,0)+s.gpuRibbons.reduce((m,r)=>m+r.geometryBytes,0),0)};},
  diagnostics(){const retained=[...retainedOwners].map(o=>o.stats());return {revision:'gpu-production-v3-cpu-geometry',lost,errors:[...errors],frames,draws,passes,uploadBytes,uploadCount,readbacks,retained,textureBytes:pooledBytes+[...surfaces].reduce((n,s)=>n+(s.texture?rtBytes(s.texture):0),0)+[...uploadRecords].reduce((n,r)=>n+r.width*r.height*4,0)+retained.reduce((n,o)=>n+(o.textureBytes||0),0),pooledBytes,poolCount:texturePool.length,surfaceCount:surfaces.size,uploadTextures:uploadRecords.size,gpuTimerAvailable:!!timer,gpuTimes:[...gpuTimes],memoryNote:'Texture-capacity ledger only; excludes Pixi filter pool, MSAA, stencil, driver resources, private turn contexts and presentation. NOT VRAM usage.',gpu:gpuName};},
  pixels(surface){surface._gpu.flush();readbacks++;return renderer.extract.pixels({target:surface._gpu.texture});},
  dispose(){for(const {key,old,wrapped} of mutationHooks)if(CanvasRenderingContext2D.prototype[key]===wrapped)CanvasRenderingContext2D.prototype[key]=old;for(const o of retainedOwners)o.dispose();retainedOwners.clear();for(const s of [...surfaces])release(s.canvas);for(const t of texturePool)t.destroy(true);texturePool.length=0;pooledBytes=0;for(const f of compositeFilters.values())f.destroy();for(const p of pending)gl.deleteQuery(p.query);for(const r of uploadRecords)r.texture.destroy(true);uploadRecords.clear();for(const n of meshPool){n.geometry.destroy(true);n.destroy();}for(const n of [...spritePool,...graphicsPool,...containerPool])n.destroy();renderer.destroy(true);}
 };
}
