// Local snake light spill, ported from the accepted isolated study.
// All positions are world pixels. The caller applies receiver/actor/DUSK masks.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

export function createMazeReflection({grid,cell,width,height,canvasFactory,scale=1}){
  if(!Array.isArray(grid)||!grid.length||!Number.isFinite(cell)||cell<=0||
    !Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||
    typeof canvasFactory!=='function'||!Number.isFinite(scale)||scale<=0)
    throw new TypeError('Expected a maze grid, positive dimensions and canvas factory');
  const makeSurface=canvasFactory,surfaces=[];
  let disposed=false,dirty=false,recoveries=0,textureRepaints=0;
  canvasFactory=(w,h)=>{
    const canvas=makeSurface(w,h),context=canvas.getContext('2d');
    if(!context)throw new Error('Reflection canvas is unavailable');
    const state={canvas,context,width:w,height:h,lost:false};
    state.onLost=()=>{state.lost=true;dirty=true;};
    state.onRestored=()=>{state.lost=false;dirty=true;};
    canvas.addEventListener?.('contextlost',state.onLost);
    canvas.addEventListener?.('contextrestored',state.onRestored);
    surfaces.push(state);return canvas;
  };
  function available(){
    if(disposed)return false;
    for(const s of surfaces){
      if(typeof s.context.isContextLost==='function'){
        const lost=s.context.isContextLost();
        if(lost!==s.lost){s.lost=lost;dirty=true;}
      }
      if(s.lost)return false;
      if(s.canvas.width!==s.width||s.canvas.height!==s.height){
        s.canvas.width=s.width;s.canvas.height=s.height;dirty=true;
      }
    }
    if(dirty){
      paintWallMask();
      for(const color of kernels.keys())kernel(color,true);
      for(const color of wallKernels.keys())wallKernel(color,true);
      dirty=false;recoveries++;
    }
    return true;
  }
  function reset(){if(!disposed)dirty=true;}
  function dispose(){
    if(disposed)return;disposed=true;
    for(const s of surfaces){
      s.canvas.removeEventListener?.('contextlost',s.onLost);
      s.canvas.removeEventListener?.('contextrestored',s.onRestored);
      s.canvas.width=s.canvas.height=1;
    }
    kernels.clear();wallKernels.clear();
  }
  const radius=cell*.68,wallFace=cell*.1,spacing=cell*2/9;
  const canvas=canvasFactory(Math.ceil(width*scale),Math.ceil(height*scale));
  // The atlas pipe is centred in its wall tile, well beyond the old 3.6px
  // collision-face inset. A separate receiver map reaches that painted face;
  // it must be multiplied by the cached maze-art receiver mask by the caller.
  const wallCanvas=canvasFactory(canvas.width,canvas.height),wc=wallCanvas.getContext('2d');
  const wallRadius=cell*1.45,wallDepth=cell*.85,wallReach=wallRadius;
  const ctx=canvas.getContext('2d'),kernels=new Map(),wallKernels=new Map();
  const columns=grid[0].length,rows=grid.length;
  const floor=(x,y)=>grid[y]?.[x]==='.';
  // Adjacent wall cells remain joined. Only a floor-facing boundary is inset,
  // exposing a narrow lit wall face without introducing leaks along tile seams.
  const blockers=Array.from({length:rows},(_,y)=>Array.from({length:columns},(_,x)=>
    floor(x,y)?null:{
      left:x*cell+(floor(x-1,y)?wallFace:0),
      top:y*cell+(floor(x,y-1)?wallFace:0),
      right:(x+1)*cell-(floor(x+1,y)?wallFace:0),
      bottom:(y+1)*cell-(floor(x,y+1)?wallFace:0)
    }));
  const isWall=(x,y)=>x>=0&&y>=0&&x<columns&&y<rows&&!floor(x,y);
  const straight=Array.from({length:rows},(_,y)=>Array.from({length:columns},(_,x)=>{
    if(!floor(x,y))return 0;
    if(floor(x-1,y)&&floor(x+1,y)&&[-1,0,1].every(dx=>isWall(x+dx,y-1)&&isWall(x+dx,y+1)))return 1;
    if(floor(x,y-1)&&floor(x,y+1)&&[-1,0,1].every(dy=>isWall(x-1,y+dy)&&isWall(x+1,y+dy)))return 2;
    return 0;
  }));
  const wallMask=canvasFactory(canvas.width,canvas.height),wm=wallMask.getContext('2d');
  function paintWallMask(){
    wm.setTransform(1,0,0,1,0,0);wm.globalAlpha=1;wm.globalCompositeOperation='source-over';
    wm.filter='none';wm.clearRect(0,0,wallMask.width,wallMask.height);
    wm.setTransform(scale,0,0,scale,0,0);wm.fillStyle='#fff';
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)
      if(isWall(x,y))wm.fillRect(x*cell,y*cell,cell,cell);
  }
  paintWallMask();
  const wallCores=Array.from({length:rows},(_,y)=>Array.from({length:columns},(_,x)=>{
    if(!isWall(x,y))return null;
    // A diagonal open tile also exposes a bent pipe's curved face. Keeping
    // these corner receivers is essential: four axis-aligned half-tile strips
    // leave the real 90-degree atlas arc almost completely unlit.
    const tl=floor(x-1,y-1)&&isWall(x-1,y)&&isWall(x,y-1);
    const tr=floor(x+1,y-1)&&isWall(x+1,y)&&isWall(x,y-1);
    const bl=floor(x-1,y+1)&&isWall(x-1,y)&&isWall(x,y+1);
    const br=floor(x+1,y+1)&&isWall(x+1,y)&&isWall(x,y+1);
    return {left:x*cell,top:y*cell,right:(x+1)*cell,bottom:(y+1)*cell,
      l:floor(x-1,y)||tl||bl,r:floor(x+1,y)||tr||br,
      t:floor(x,y-1)||tl||tr,b:floor(x,y+1)||bl||br};
  }));
  const wallStraight=Array.from({length:rows},(_,y)=>Array.from({length:columns},(_,x)=>{
    if(!floor(x,y))return 0;
    if([-2,-1,0,1,2].every(dx=>floor(x+dx,y)&&isWall(x+dx,y-1)&&isWall(x+dx,y+1)))return 1;
    if([-2,-1,0,1,2].every(dy=>floor(x,y+dy)&&isWall(x-1,y+dy)&&isWall(x+1,y+dy)))return 2;
    return 0;
  }));
  const coreRect={left:0,top:0,right:0,bottom:0};
  // Reused hull workspaces: no canvas creation, image reads or shadow meshes
  // are needed during animation. Floor spill visits at most 3x3 local tiles;
  // the wider wall-only field visits at most 4x4, not the whole maze.
  const points=Array.from({length:8},()=>({x:0,y:0})),hull=Array(16),sample={};
  let renders=0,stamps=0,shadowClips=0,cacheBuilds=0,lastStamps=0,lastShadowClips=0,lastStraightClips=0;
  let wallCacheBuilds=0,wallStamps=0,lastWallStamps=0,lastWallShadowClips=0;
  function kernel(color,force=false){
    let image=kernels.get(color);if(image&&!force)return image;
    if(!image&&kernels.size>=5)throw new RangeError('Only five snake light palettes may be cached');
    if(!/^#[0-9a-f]{6}$/i.test(color))throw new TypeError('Reflection color must be #rrggbb');
    const size=Math.ceil(radius*2),k=image||canvasFactory(size,size),c=k.getContext('2d');
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';c.clearRect(0,0,size,size);
    const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).join(',');
    const g=c.createRadialGradient(size/2,size/2,0,size/2,size/2,radius);
    for(const [at,alpha] of [[0,.075],[.28,.068],[.55,.031],[.8,.008],[1,0]])
      g.addColorStop(at,`rgba(${rgb},${alpha})`);
    c.fillStyle=g;c.fillRect(0,0,size,size);kernels.set(color,k);if(!image)cacheBuilds++;else textureRepaints++;
    return k;
  }
  function wallKernel(color,force=false){
    let image=wallKernels.get(color);if(image&&!force)return image;
    // kernel(color) validates the colour before this sibling cache is reached.
    const w=Math.ceil(wallRadius*2),k=image||canvasFactory(w,w),c=k.getContext('2d');
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';c.clearRect(0,0,w,w);
    const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).join(',');
    const g=c.createRadialGradient(w/2,w/2,0,w/2,w/2,wallRadius);
    for(const [at,alpha] of [[0,.085],[.5,.085],[.7,.075],[.85,.036],[1,0]])
      g.addColorStop(at,`rgba(${rgb},${alpha})`);
    c.fillStyle=g;c.fillRect(0,0,w,w);
    wallKernels.set(color,k);if(!image)wallCacheBuilds++;else textureRepaints++;return k;
  }
  function stampWalls(image,x,y,tx,ty,weight,amount){
    if(!image||amount<=0)return;
    wc.save();
    const simple=wallStraight[ty][tx];
    if(simple){
      // Exact fast path for a verified five-tile straight run. Stop at the
      // far core, behind the visible pipe, rather than cutting at its centre.
      wc.beginPath();
      if(simple===1)wc.rect(x-wallRadius,ty*cell-wallDepth,wallRadius*2,cell+wallDepth*2);
      else wc.rect(tx*cell-wallDepth,y-wallRadius,cell+wallDepth*2,wallRadius*2);
      wc.clip();
    }else{
      const x0=clamp(Math.floor((x-wallRadius)/cell),0,columns-1),x1=clamp(Math.floor((x+wallRadius)/cell),0,columns-1);
      const y0=clamp(Math.floor((y-wallRadius)/cell),0,rows-1),y1=clamp(Math.floor((y+wallRadius)/cell),0,rows-1);
      for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){
        const r=wallCores[cy][cx];if(!r)continue;
        // Inset only the exposed, source-facing edges. Smooth grazing entry
        // makes the same world field continuous while sources pass a cap.
        coreRect.left=r.left+(r.l?wallDepth*smooth(0,cell*.22,r.left-x):0);
        coreRect.right=r.right-(r.r?wallDepth*smooth(0,cell*.22,x-r.right):0);
        coreRect.top=r.top+(r.t?wallDepth*smooth(0,cell*.22,r.top-y):0);
        coreRect.bottom=r.bottom-(r.b?wallDepth*smooth(0,cell*.22,y-r.bottom):0);
        shadow(coreRect,x,y,wc,wallRadius);
      }
    }
    wc.globalAlpha=weight*amount;wc.drawImage(image,x-wallRadius,y-wallRadius,wallRadius*2,wallRadius*2);
    wc.restore();lastWallStamps++;
  }
  function shadow(rect,x,y,target=ctx,reach=radius){
    if(rect.right<x-reach||rect.left>x+reach||rect.bottom<y-reach||rect.top>y+reach)return;
    // Convex hull of the blocker and its four projected far corners is the
    // exact local shadow silhouette of an axis-aligned rectangular blocker.
    for(let i=0;i<4;i++){
      const p=points[i],q=points[i+4];
      p.x=i&1?rect.right:rect.left;p.y=i&2?rect.bottom:rect.top;
      const dx=p.x-x,dy=p.y-y,f=1+reach*6/Math.max(.001,Math.hypot(dx,dy));
      q.x=x+dx*f;q.y=y+dy*f;
    }
    // Eight points only; insertion sort keeps the same allocated point objects.
    for(let i=1;i<8;i++){
      const p=points[i];let j=i-1;
      while(j>=0&&(points[j].x>p.x||(points[j].x===p.x&&points[j].y>p.y))){points[j+1]=points[j];j--;}
      points[j+1]=p;
    }
    let n=0;
    for(let i=0;i<8;i++){
      while(n>=2&&cross(hull[n-2],hull[n-1],points[i])<=0)n--;
      hull[n++]=points[i];
    }
    const lower=n;
    for(let i=6;i>=0;i--){
      while(n>lower&&cross(hull[n-2],hull[n-1],points[i])<=0)n--;
      hull[n++]=points[i];
    }
    // Each blocker gets its own clip. Combining overlapping holes into one
    // even-odd path would incorrectly relight overlapping shadow regions.
    target.beginPath();target.rect(x-reach-1,y-reach-1,reach*2+2,reach*2+2);
    target.moveTo(hull[0].x,hull[0].y);
    for(let i=1;i<n-1;i++)target.lineTo(hull[i].x,hull[i].y);
    target.closePath();target.clip('evenodd');
    if(target===ctx)lastShadowClips++;else lastWallShadowClips++;
  }
  function stamp(image,x,y,weight,wallImage,wallAmount){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    const tx=Math.floor(x/cell),ty=Math.floor(y/cell);
    if(!floor(tx,ty))return;
    ctx.save();
    const simple=straight[ty][tx];
    if(simple){
      // The radius is below one tile, so a verified 3x3 straight corridor has
      // exactly two infinite-in-this-stamp wall faces. One rectangle is exact.
      ctx.beginPath();
      if(simple===1)ctx.rect(x-radius,ty*cell-wallFace,radius*2,cell+wallFace*2);
      else ctx.rect(tx*cell-wallFace,y-radius,cell+wallFace*2,radius*2);
      ctx.clip();lastStraightClips++;
    }else{
      const x0=clamp(Math.floor((x-radius)/cell),0,columns-1),x1=clamp(Math.floor((x+radius)/cell),0,columns-1);
      const y0=clamp(Math.floor((y-radius)/cell),0,rows-1),y1=clamp(Math.floor((y+radius)/cell),0,rows-1);
      for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){
        const rect=blockers[cy][cx];if(rect)shadow(rect,x,y);
      }
    }
    ctx.globalAlpha*=weight;
    ctx.drawImage(image,x-radius,y-radius,radius*2,radius*2);
    ctx.restore();lastStamps++;
    stampWalls(wallImage,x,y,tx,ty,weight,wallAmount);
  }
  function prepareColors(colors){
    if(!available())return false;
    for(const color of colors){kernel(color);wallKernel(color);}return true;
  }
  function render(sources,strength=.7,{walls=true,wallStrength=1}={}){
    if(!available())return null;
    if(!Number.isFinite(strength))throw new TypeError('Reflection strength must be finite');
    if(!Number.isFinite(wallStrength))throw new TypeError('Wall reflection strength must be finite');
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.clearRect(0,0,canvas.width,canvas.height);lastStamps=lastShadowClips=lastStraightClips=0;renders++;
    wc.setTransform(1,0,0,1,0,0);wc.globalAlpha=1;wc.globalCompositeOperation='source-over';
    wc.clearRect(0,0,wallCanvas.width,wallCanvas.height);lastWallStamps=lastWallShadowClips=0;
    if(strength<=0||!sources?.length)return canvas;
    ctx.setTransform(scale,0,0,scale,0,0);ctx.globalAlpha=clamp(strength,0,1.5);
    wc.setTransform(scale,0,0,scale,0,0);
    const wallAmount=walls?clamp(strength,0,1.5)*clamp(wallStrength,0,2):0;
    for(const {geometry:g,color} of sources){
      if(!g||typeof g.sample!=='function'||!Number.isFinite(g.length)||g.length<0)continue;
      const image=kernel(color),wallImage=wallAmount>0?wallKernel(color):null,length=g.length;
      const head=g.head,bodyEnd=head?Math.max(0,Math.min(length,g.bodyEndDistance??length-head.span)):length;
      const at=distance=>{
        if(head&&distance>bodyEnd){
          sample.x=head.x+Math.cos(head.angle)*(distance-bodyEnd);
          sample.y=head.y+Math.sin(head.angle)*(distance-bodyEnd);
        }else g.sample(distance,sample);
      };
      // A fixed material-distance lattice does not rescale all stamps when
      // compression changes the visible length. End weights fill partial spans.
      if(length<spacing){at(length*.5);stamp(image,sample.x,sample.y,Math.max(.25,length/spacing),wallImage,wallAmount);continue;}
      const count=Math.floor(length/spacing);
      const remainder=length-count*spacing;
      for(let i=0;i<=count;i++){
        at(i*spacing);stamp(image,sample.x,sample.y,i===0?.5:i===count?.5+remainder/spacing*.5:1,wallImage,wallAmount);
      }
      if(remainder>0){at(length);stamp(image,sample.x,sample.y,remainder/spacing*.5,wallImage,wallAmount);}
    }
    if(wallAmount>0){
      wc.setTransform(1,0,0,1,0,0);wc.globalAlpha=1;wc.globalCompositeOperation='destination-in';wc.drawImage(wallMask,0,0);
    }
    stamps+=lastStamps;shadowClips+=lastShadowClips;wallStamps+=lastWallStamps;return canvas;
  }
  return {canvas,wallCanvas,render,prepareColors,reset,dispose,stats:()=>({renders,stamps,shadowClips,lastStamps,lastShadowClips,lastStraightClips,
    wallStamps,lastWallStamps,lastWallShadowClips,cacheBuilds,wallCacheBuilds,cachedColors:kernels.size,
    canvasAllocations:3+cacheBuilds+wallCacheBuilds,pixelReads:0,
    cachedBytes:disposed?0:canvas.width*canvas.height*12+[...kernels.values(),...wallKernels.values()].reduce((sum,k)=>sum+k.width*k.height*4,0),
    scale,radius,wallFace,spacing,wallRadius,wallDepth,wallReach,disposed,recoveries,textureRepaints,
    liveCanvasCount:disposed?0:surfaces.length})};
}
