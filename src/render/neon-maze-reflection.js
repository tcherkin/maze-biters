// Accepted light-field optimization: unchanged kernels, material-distance
// samples, strengths and compositing order; off-camera kernels are skipped
// only when their complete support plus a resampling guard cannot be visible.
// A single point-source visibility polygon replaces repeated blocker clips;
// consecutive stamps in a verified straight corridor share one axis clip.
// Sampling density, kernels, opacity, resolution and receivers are unchanged.
// Only sparse two-channel-level raster edge differences remain in regression fixtures.

// Local snake light spill, ported from the accepted isolated study.
// All positions are world pixels. The caller applies receiver/actor/DUSK masks.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export const REFLECTION_CULLING_GUARD=4;

export function createMazeReflection({grid,cell,width,height,canvasFactory,scale=1,maxColors=5}){
  if(!Array.isArray(grid)||!grid.length||!Number.isFinite(cell)||cell<=0||
    !Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||
    typeof canvasFactory!=='function'||!Number.isFinite(scale)||scale<=0)
    throw new TypeError('Expected a maze grid, positive dimensions and canvas factory');
  if(!Number.isInteger(maxColors)||maxColors<1||maxColors>11)throw new RangeError('Expected one to eleven light palettes');
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
  // Fixed workspaces: no canvas creation or pixel reads during animation.
  const sample={};
  let floorEnabled=true,frameStrength=1,floorBatch=null,wallBatch=null;
  let frameViewport=null,viewportPadding=0;
  let lastCandidates=0,lastDrawn=0,lastRejected=0,lastFloorRejected=0,lastWallRejected=0;
  let totalCandidates=0,totalDrawn=0,totalRejected=0;
  let lastSourceCandidates=0,lastSourceRejected=0,lastSourceProcessed=0;
  let totalSourceCandidates=0,totalSourceRejected=0,totalSourceProcessed=0;
  function configureViewport(value){
    if(value==null){frameViewport=null;viewportPadding=0;return;}
    const {left,top,right,bottom}=value;
    if(![left,top,right,bottom].every(Number.isFinite)||right<=left||bottom<=top)
      throw new TypeError('Reflection viewport must have finite ordered world bounds');
    // Keep four raster/source-sampling pixels beyond the visible camera crop,
    // also covering higher-quality resampling and the zoom-out footprint.
    viewportPadding=REFLECTION_CULLING_GUARD*Math.max(1/scale,(right-left)/width,(bottom-top)/height);
    frameViewport={left:left-viewportPadding,top:top-viewportPadding,
      right:right+viewportPadding,bottom:bottom+viewportPadding};
  }
  function intersectsViewport(x,y,reach){
    return frameViewport===null||!(x+reach<frameViewport.left||x-reach>frameViewport.right||
      y+reach<frameViewport.top||y-reach>frameViewport.bottom);
  }
  function sourceIntersectsViewport(geometry,bounds,reach){
    if(frameViewport===null||!bounds)return true;
    let {minX,minY,maxX,maxY}=bounds;
    // Only the conservative whole-body bounds supplied by the scene renderer
    // are usable here. Missing/recovering geometry must never lose its light.
    if(!Number.isFinite(minX)||!Number.isFinite(minY)||!Number.isFinite(maxX)||!Number.isFinite(maxY)
      ||minX>maxX||minY>maxY)return true;
    // Most visible snakes need no extra head arithmetic at all. Enlarging an
    // already intersecting box cannot make its light eligible for rejection.
    if(!(maxX+reach<frameViewport.left||minX-reach>frameViewport.right
      ||maxY+reach<frameViewport.top||minY-reach>frameViewport.bottom))return true;
    const head=geometry.head;
    if(head){
      // Reflection uses a rigid centreline beyond bodyEnd, not the sprite's
      // artwork rectangle. It can extend past the bounds of the visible head.
      const bodyEnd=Math.max(0,Math.min(geometry.length,geometry.bodyEndDistance??geometry.length-head.span));
      if(!Number.isFinite(bodyEnd)||!Number.isFinite(head.x)||!Number.isFinite(head.y)
        ||!Number.isFinite(head.angle))return true;
      const span=geometry.length-bodyEnd;
      const endX=head.x+Math.cos(head.angle)*span,endY=head.y+Math.sin(head.angle)*span;
      if(!Number.isFinite(endX)||!Number.isFinite(endY))return true;
      minX=Math.min(minX,head.x,endX);maxX=Math.max(maxX,head.x,endX);
      minY=Math.min(minY,head.y,endY);maxY=Math.max(maxY,head.y,endY);
    }
    // Use the same padded viewport as per-stamp culling. Strict separation
    // keeps exact radius/guard boundary samples and all corner light support.
    return !(maxX+reach<frameViewport.left||minX-reach>frameViewport.right
      ||maxY+reach<frameViewport.top||minY-reach>frameViewport.bottom);
  }
  let floorBatchBuilds=0,wallBatchBuilds=0,lastFloorBatches=0,lastWallBatches=0;
  function closeFloorBatch(){if(floorBatch!==null){ctx.restore();floorBatch=null;}}
  function closeWallBatch(){if(wallBatch!==null){wc.restore();wallBatch=null;}}
  function openFloorBatch(simple,tx,ty){
    const key=simple===1?ty+1:-(tx+1);
    if(floorBatch===key)return;
    closeFloorBatch();ctx.save();ctx.beginPath();
    // A stamp's bitmap already bounds the longitudinal axis. Keeping that
    // redundant bound in each clip forces one raster clip per sample.
    if(simple===1)ctx.rect(-radius,ty*cell-wallFace,width+radius*2,cell+wallFace*2);
    else ctx.rect(tx*cell-wallFace,-radius,cell+wallFace*2,height+radius*2);
    ctx.clip();floorBatch=key;lastStraightClips++;lastFloorBatches++;floorBatchBuilds++;
  }
  function openWallBatch(simple,tx,ty){
    const key=simple===1?ty+1:-(tx+1);
    if(wallBatch===key)return;
    closeWallBatch();wc.save();wc.beginPath();
    if(simple===1)wc.rect(-wallRadius,ty*cell-wallDepth,width+wallRadius*2,cell+wallDepth*2);
    else wc.rect(tx*cell-wallDepth,-wallRadius,cell+wallDepth*2,height+wallRadius*2);
    wc.clip();wallBatch=key;lastWallBatches++;wallBatchBuilds++;
  }
  let renders=0,stamps=0,shadowClips=0,cacheBuilds=0,lastStamps=0,lastShadowClips=0,lastStraightClips=0;
  let wallCacheBuilds=0,wallStamps=0,lastWallStamps=0,lastWallShadowClips=0;
  function kernel(color,force=false){
    let image=kernels.get(color);if(image&&!force)return image;
    if(!image&&kernels.size>=maxColors)throw new RangeError('Light palette cache capacity exceeded');
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
  // The visible region from a point source is star-shaped. Cast rays through
  // every nearby rectangle corner (and on either side), then keep the nearest
  // hit. One polygon is the intersection of all former blocker clips.
  const clipRects=Array.from({length:36},()=>({left:0,top:0,right:0,bottom:0}));
  // Pooled rays preserve the corner +/- epsilon construction without atan2,
  // per-ray cos/sin or an allocated object for every stamp in every frame.
  const rayPool=Array.from({length:436},()=>({x:0,y:0,half:0,length2:0,epsilon:0}));
  const rays=[];
  const compareRays=(a,b)=>a.half-b.half||(a.y*b.x-a.x*b.y);
  function visibility(rectangles,count,x,y,target,reach){
    if(!count)return;
    const edge=reach+1;let used=0;rays.length=0;
    function add(dx,dy,length2,epsilon){
      const ray=rayPool[used++];ray.x=dx;ray.y=dy;
      ray.half=dy<0||(dy===0&&dx<0)?0:1;
      ray.length2=length2;ray.epsilon=epsilon;rays.push(ray);
    }
    const cornerEpsilon=1e-8,diagonalEpsilon=cornerEpsilon/Math.SQRT2;
    add(-1,-1,2,diagonalEpsilon);add(1,-1,2,diagonalEpsilon);
    add(1,1,2,diagonalEpsilon);add(-1,1,2,diagonalEpsilon);
    for(let i=0;i<count;i++){
      const r=rectangles[i];
      r.dx0=r.left-x;r.dx1=r.right-x;r.dy0=r.top-y;r.dy1=r.bottom-y;
      if(r.dx0<0&&r.dx1>0&&r.dy0<0&&r.dy1>0){
        target.beginPath();target.rect(0,0,0,0);target.clip();return;
      }
      for(let corner=0;corner<4;corner++){
        let dx=corner&1?r.dx1:r.dx0,dy=corner&2?r.dy1:r.dy0;
        // atan2(0,0) in the reference chooses the positive horizontal ray.
        if(dx===0&&dy===0)dx=1;
        const length2=dx*dx+dy*dy,epsilon=cornerEpsilon/Math.sqrt(length2);
        add(dx+dy*cornerEpsilon,dy-dx*cornerEpsilon,length2,epsilon);
        add(dx,dy,length2,epsilon);
        add(dx-dy*cornerEpsilon,dy+dx*cornerEpsilon,length2,epsilon);
      }
    }
    rays.sort(compareRays);
    target.beginPath();let points=0,previous=null;
    for(const ray of rays){
      const dx=ray.x,dy=ray.y;
      if(previous){
        const cross=previous.x*dy-previous.y*dx;
        if(previous.x*dx+previous.y*dy>0&&cross*cross<1e-20*previous.length2*ray.length2)continue;
      }
      previous=ray;
      const inverseX=1/dx,inverseY=1/dy;
      let distance=edge/Math.max(Math.abs(dx),Math.abs(dy));
      for(let i=0;i<count;i++){
        const r=rectangles[i];
        const tx1=r.dx0*inverseX,tx2=r.dx1*inverseX,ty1=r.dy0*inverseY,ty2=r.dy1*inverseY;
        const near=Math.max(Math.min(tx1,tx2),Math.min(ty1,ty2));
        const far=Math.min(Math.max(tx1,tx2),Math.max(ty1,ty2));
        if(near<=far+ray.epsilon&&far>ray.epsilon&&near>=-ray.epsilon&&near<distance)distance=Math.max(0,near);
      }
      const px=x+dx*distance,py=y+dy*distance;
      if(points++)target.lineTo(px,py);else target.moveTo(px,py);
    }
    target.closePath();target.clip();
    if(target===ctx)lastShadowClips++;else lastWallShadowClips++;
  }
  function stampWalls(image,x,y,tx,ty,weight,amount){
    if(!image||amount<=0)return;
    const simple=wallStraight[ty][tx];
    if(simple){
      openWallBatch(simple,tx,ty);
    }else{
      closeWallBatch();wc.save();
      const x0=clamp(Math.floor((x-wallRadius)/cell),0,columns-1),x1=clamp(Math.floor((x+wallRadius)/cell),0,columns-1);
      const y0=clamp(Math.floor((y-wallRadius)/cell),0,rows-1),y1=clamp(Math.floor((y+wallRadius)/cell),0,rows-1);
      let count=0;
      for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){
        const r=wallCores[cy][cx];if(!r)continue;
        // Inset only the exposed, source-facing edges. Smooth grazing entry
        // makes the same world field continuous while sources pass a cap.
        coreRect.left=r.left+(r.l?wallDepth*smooth(0,cell*.22,r.left-x):0);
        coreRect.right=r.right-(r.r?wallDepth*smooth(0,cell*.22,x-r.right):0);
        coreRect.top=r.top+(r.t?wallDepth*smooth(0,cell*.22,r.top-y):0);
        coreRect.bottom=r.bottom-(r.b?wallDepth*smooth(0,cell*.22,y-r.bottom):0);
        if(coreRect.right<x-wallRadius||coreRect.left>x+wallRadius||
          coreRect.bottom<y-wallRadius||coreRect.top>y+wallRadius)continue;
        Object.assign(clipRects[count++],coreRect);
      }
      visibility(clipRects,count,x,y,wc,wallRadius);
    }
    wc.globalAlpha=weight*amount;wc.drawImage(image,x-wallRadius,y-wallRadius,wallRadius*2,wallRadius*2);
    if(!simple)wc.restore();lastWallStamps++;
  }
  function stamp(image,x,y,weight,wallImage,wallAmount){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    const tx=Math.floor(x/cell),ty=Math.floor(y/cell);
    if(!floor(tx,ty))return;
    lastCandidates++;
    const floorVisible=floorEnabled&&intersectsViewport(x,y,radius);
    const wallEnabled=!!wallImage&&wallAmount>0;
    const wallVisible=wallEnabled&&intersectsViewport(x,y,wallRadius);
    if(floorEnabled&&!floorVisible)lastFloorRejected++;
    if(wallEnabled&&!wallVisible)lastWallRejected++;
    if(!floorVisible&&!wallVisible){lastRejected++;return;}
    lastDrawn++;
    if(floorVisible){
    const simple=straight[ty][tx];
    if(simple){
      openFloorBatch(simple,tx,ty);
    }else{
      closeFloorBatch();ctx.save();
      const x0=clamp(Math.floor((x-radius)/cell),0,columns-1),x1=clamp(Math.floor((x+radius)/cell),0,columns-1);
      const y0=clamp(Math.floor((y-radius)/cell),0,rows-1),y1=clamp(Math.floor((y+radius)/cell),0,rows-1);
      let count=0;
      for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){
        const rect=blockers[cy][cx];
        if(rect&&!(rect.right<x-radius||rect.left>x+radius||rect.bottom<y-radius||rect.top>y+radius))
          Object.assign(clipRects[count++],rect);
      }
      visibility(clipRects,count,x,y,ctx,radius);
    }
    ctx.globalAlpha=frameStrength*weight;
    ctx.drawImage(image,x-radius,y-radius,radius*2,radius*2);
    if(!simple)ctx.restore();lastStamps++;
    }
    if(wallVisible)stampWalls(wallImage,x,y,tx,ty,weight,wallAmount);
  }
  function prepareColors(colors){
    if(!available())return false;
    for(const color of colors){kernel(color);wallKernel(color);}return true;
  }
  function render(sources,strength=.7,{floor=true,walls=true,wallStrength=1,viewport=null}={}){
    configureViewport(viewport);lastCandidates=lastDrawn=lastRejected=lastFloorRejected=lastWallRejected=0;
    lastSourceCandidates=lastSourceRejected=lastSourceProcessed=0;
    floorEnabled=floor;closeFloorBatch();closeWallBatch();
    lastFloorBatches=lastWallBatches=0;frameStrength=clamp(strength,0,1.5);
    if(!available())return null;
    if(!Number.isFinite(strength))throw new TypeError('Reflection strength must be finite');
    if(!Number.isFinite(wallStrength))throw new TypeError('Wall reflection strength must be finite');
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    if(floor)ctx.clearRect(0,0,canvas.width,canvas.height);lastStamps=lastShadowClips=lastStraightClips=0;renders++;
    wc.setTransform(1,0,0,1,0,0);wc.globalAlpha=1;wc.globalCompositeOperation='source-over';
    if(walls)wc.clearRect(0,0,wallCanvas.width,wallCanvas.height);lastWallStamps=lastWallShadowClips=0;
    if(strength<=0||!sources?.length)return canvas;
    ctx.setTransform(scale,0,0,scale,0,0);ctx.globalAlpha=clamp(strength,0,1.5);
    wc.setTransform(scale,0,0,scale,0,0);
    const wallAmount=walls?clamp(strength,0,1.5)*clamp(wallStrength,0,2):0;
    const sourceReach=Math.max(floor?radius:0,wallAmount>0?wallRadius:0);
    try{for(const {geometry:g,color,bounds,opacity=1} of sources){
      if(!g||typeof g.sample!=='function'||!Number.isFinite(g.length)||g.length<0)continue;
      if(!Number.isFinite(opacity))throw new TypeError('Reflection source opacity must be finite');
      const sourceOpacity=clamp(opacity,0,1);
      if(sourceOpacity===0)continue;
      lastSourceCandidates++;totalSourceCandidates++;
      if(!sourceIntersectsViewport(g,bounds,sourceReach)){
        lastSourceRejected++;totalSourceRejected++;continue;
      }
      lastSourceProcessed++;totalSourceProcessed++;
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
      if(length<spacing){at(length*.5);stamp(image,sample.x,sample.y,Math.max(.25,length/spacing)*sourceOpacity,wallImage,wallAmount);continue;}
      const count=Math.floor(length/spacing);
      const remainder=length-count*spacing;
      for(let i=0;i<=count;i++){
        at(i*spacing);stamp(image,sample.x,sample.y,(i===0?.5:i===count?.5+remainder/spacing*.5:1)*sourceOpacity,wallImage,wallAmount);
      }
      if(remainder>0){at(length);stamp(image,sample.x,sample.y,remainder/spacing*.5*sourceOpacity,wallImage,wallAmount);}
    }
    }finally{closeFloorBatch();closeWallBatch();}
    if(wallAmount>0){
      wc.setTransform(1,0,0,1,0,0);wc.globalAlpha=1;wc.globalCompositeOperation='destination-in';wc.drawImage(wallMask,0,0);
    }
    stamps+=lastStamps;shadowClips+=lastShadowClips;wallStamps+=lastWallStamps;
    totalCandidates+=lastCandidates;totalDrawn+=lastDrawn;totalRejected+=lastRejected;
    return canvas;
  }
  return {canvas,wallCanvas,render,prepareColors,reset,dispose,stats:()=>({renders,stamps,shadowClips,lastStamps,lastShadowClips,lastStraightClips,
    wallStamps,lastWallStamps,lastWallShadowClips,cacheBuilds,wallCacheBuilds,cachedColors:kernels.size,
    optimization:"whole-source-and-stamp-viewport-culling-plus-corridor-batches",
    culling:{enabled:frameViewport!==null,viewport:frameViewport?{...frameViewport}:null,padding:viewportPadding,
      lastCandidateSources:lastSourceCandidates,lastRejectedSources:lastSourceRejected,lastProcessedSources:lastSourceProcessed,
      totalCandidateSources:totalSourceCandidates,totalRejectedSources:totalSourceRejected,totalProcessedSources:totalSourceProcessed,
      lastCandidateStamps:lastCandidates,lastDrawnStamps:lastDrawn,lastRejectedStamps:lastRejected,
      lastFloorRejectedStamps:lastFloorRejected,lastWallRejectedStamps:lastWallRejected,
      totalCandidateStamps:totalCandidates,totalDrawnStamps:totalDrawn,totalRejectedStamps:totalRejected},floorBatchBuilds,wallBatchBuilds,lastFloorBatches,lastWallBatches,
    canvasAllocations:3+cacheBuilds+wallCacheBuilds,pixelReads:0,
    cachedBytes:disposed?0:canvas.width*canvas.height*12+[...kernels.values(),...wallKernels.values()].reduce((sum,k)=>sum+k.width*k.height*4,0),
    accountedCanvasBytes:disposed?0:surfaces.reduce((sum,s)=>sum+s.canvas.width*s.canvas.height*4,0),
    canvasBytesScope:'floor-output,wall-output,wall-mask,kernels;excludes-wrapper-receiver',
    scale,radius,wallFace,spacing,wallRadius,wallDepth,wallReach,disposed,recoveries,textureRepaints,
    liveCanvasCount:disposed?0:surfaces.length})};
}


