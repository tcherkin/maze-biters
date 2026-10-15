import {createNeonMaterial} from './neon-material.js?v=1.02.06.00';
import {createPairedContext, pairedContextStatus} from './neon-context.js?v=1.02.06.00';
import {createSnakeNeonEyes} from './snake-neon-eyes.js?v=1.02.06.00';
import {createSnakeNeonReflection} from './snake-neon-reflection.js?v=1.02.08.00';
import {EYE_REGION} from './neon-eye-glints.js?v=1.02.06.00';

// Preserve the accepted WORLD-space raster densities and camera projection.
// These sparse captures do not sharpen, dim or retime any lighting effect.
export const SNAKE_NEON=Object.freeze({inner:.7,halo:.38,body:.5,walls:.25,emission:.78});
const EYE_TILE=128,EYE_GUARD=4,EYE_FRINGE_PAD=10,CROP_BUCKET=64,FALLBACK_IDLE_FRAMES=120;
const eyeSink={isContextLost:()=>true}; // Native scheduling happens before this guard.
export function createSnakeNeon({width,height,tile,makeCanvas,snake}) {
  const material=createNeonMaterial({strength:SNAKE_NEON.inner,canvasFactory:makeCanvas});
  const eyes=createSnakeNeonEyes({makeCanvas});
  const reflection=createSnakeNeonReflection({width,height,tile,makeCanvas});
  const surfaces=[],pairs=[],sources=[],sourcePool=[],errors=[];
  const eyeTiles=[],eyeTileMap=new Map(),eyeBounds={},captureBounds={};
  const reflectionOptions={viewport:null};
  const worldPixelsWidth=Math.round(width*2),worldPixelsHeight=Math.round(height*2);
  const eyeColumns=Math.ceil(worldPixelsWidth/EYE_TILE);
  let active=false,dirtyCapture=false,sourceIdentity=null,raw=null,pairedRaw=null;
  let allContext=null,snakeContext=null,actorContext=null,foreground=null;
  let frameTime=0,lastTime=null,lastKey=null,frames=0,frameSerial=0;
  let emissionUsed=false,eyePainted=false,foregroundUsed=false;
  let fallbackForeground=null,lastFallbackFrame=0;
  let eyeTileCount=0,eyeTilePeak=0,eyeSchedules=0,eyeCulled=0,cropResizes=0;
  let reflectionMs=0,overlayMs=0,captureRecoveries=0;
  let capturePairBuilds=0,capturePairReuses=0,occlusionPasses=0,skippedOcclusionPasses=0,eyePresentFrames=0;
  const clock=()=>globalThis.performance?.now?.()??0;
  function surface(scale=1,w=Math.round(width*scale),h=Math.round(height*scale)) {
    const canvas=makeCanvas(w,h),context=canvas.getContext('2d');
    if(!context)throw new Error('Neon capture context unavailable');
    const layer={canvas,context,scale,x:0,y:0,useWidth:w,useHeight:h,lost:false,pair:null};
    canvas.addEventListener?.('contextlost',()=>{layer.lost=true;dirtyCapture=true;active=false;});
    canvas.addEventListener?.('contextrestored',()=>{layer.lost=false;dirtyCapture=true;});
    surfaces.push(layer);return layer;
  }
  // Emission and its projection stay at world 2x, actor/reflection masks at
  // world 1x, and the intentionally soft halo at .5x.
  const emission=surface(2),boundedForeground=surface(1,1,1),actors=surface();
  const viewport=surface(2),lightViewport=surface(),halo=surface(.5);
  function fail(name,error) {
    if(!errors.some(item=>item.name===name))errors.push({name,message:String(error?.message||error)});
    active=false;
  }
  function safe(name,fn,fallback) {try{return fn();}catch(error){fail(name,error);return fallback;}}
  function clear(layer,erase=true) {
    const c=layer.context;
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
    c.filter='none';c.shadowBlur=0;c.shadowColor='transparent';c.shadowOffsetX=c.shadowOffsetY=0;
    if(erase)c.clearRect(0,0,layer.canvas.width,layer.canvas.height);
    c.beginPath();c.setTransform(layer.scale,0,0,layer.scale,-layer.x,-layer.y);
    c.imageSmoothingEnabled=true;
  }
  function validCapture() {
    for(const p of pairs)if(pairedContextStatus(p)?.secondaryEnabled===false)return false;
    return true;
  }
  function available(layer) {
    const lost=typeof layer.context.isContextLost==='function'?layer.context.isContextLost():layer.lost;
    if(lost!==layer.lost){layer.lost=lost;dirtyCapture=true;}
    return !lost;
  }
  function warmup() {
    return safe('warmup',()=>{
      const art=snake?.getNeonSources?.();if(!art?.length)return false;
      if(sourceIdentity!==art[0]) {
        material.reset();eyes.reset();sourceIdentity=art[0];material.prewarm?.(art);
      }
      return true;
    },false);
  }
  function pair(primary,secondary,config) {
    const p=createPairedContext(primary,secondary,config);pairs.push(p);return p;
  }
  function readBounds(bounds,out) {
    if(Array.isArray(bounds)) {
      out.left=out.top=Infinity;out.right=out.bottom=-Infinity;
      if(!bounds.length){out.left=out.top=out.right=out.bottom=0;return true;}
      for(const b of bounds) {
        const l=b?.left??b?.minX,t=b?.top??b?.minY,r=b?.right??b?.maxX,bt=b?.bottom??b?.maxY;
        if(!Number.isFinite(l+t+r+bt)||r<l||bt<t)return false;
        out.left=Math.min(out.left,l);out.top=Math.min(out.top,t);
        out.right=Math.max(out.right,r);out.bottom=Math.max(out.bottom,bt);
      }
      return true;
    }
    const l=bounds?.left??bounds?.minX,t=bounds?.top??bounds?.minY;
    const r=bounds?.right??bounds?.maxX,b=bounds?.bottom??bounds?.maxY;
    if(!Number.isFinite(l+t+r+b)||r<l||b<t)return false;
    out.left=l;out.top=t;out.right=r;out.bottom=b;return true;
  }
  function configureForeground(bounds) {
    const known=readBounds(bounds,captureBounds);
    const empty=known&&(!(captureBounds.right>captureBounds.left)||!(captureBounds.bottom>captureBounds.top));
    if(!known) {
      if(!fallbackForeground)fallbackForeground=surface(1,1,1);
      foreground=fallbackForeground;lastFallbackFrame=frameSerial;
      captureBounds.left=captureBounds.top=0;captureBounds.right=width;captureBounds.bottom=height;
    }else foreground=boundedForeground;
    if(!available(foreground)){active=false;return;}
    // Integer world-pixel origins reproduce the original 1x mask. Transparent
    // padding prevents interpolation clamping at a non-transparent crop edge.
    foreground.x=empty?0:Math.max(0,Math.min(width,Math.floor(captureBounds.left)-2));
    foreground.y=empty?0:Math.max(0,Math.min(height,Math.floor(captureBounds.top)-2));
    foreground.useWidth=empty?0:Math.max(0,Math.min(width,Math.ceil(captureBounds.right)+2)-foreground.x);
    foreground.useHeight=empty?0:Math.max(0,Math.min(height,Math.ceil(captureBounds.bottom)+2)-foreground.y);
    const w=Math.max(1,Math.min(Math.round(width),Math.ceil(foreground.useWidth/CROP_BUCKET)*CROP_BUCKET));
    const h=Math.max(1,Math.min(Math.round(height),Math.ceil(foreground.useHeight/CROP_BUCKET)*CROP_BUCKET));
    if(w>foreground.canvas.width||h>foreground.canvas.height) {
      foreground.canvas.width=Math.max(w,foreground.canvas.width);
      foreground.canvas.height=Math.max(h,foreground.canvas.height);cropResizes++;
    }
    clear(foreground,false);
    if(foreground.useWidth&&foreground.useHeight) {
      if(!foreground.pair)foreground.pair=pair(allContext,foreground.context);
      actorContext=foreground.pair;
    }else actorContext=allContext;
  }
  function setForegroundBounds(bounds) {
    if(!active)return;
    flushOcclusion();
    if(active)safe('foreground-bounds',()=>configureForeground(bounds));
  }
  function beginFrame(context,{grid,key,drawWallArtwork,time,foregroundBounds,viewport:visibleViewport=null}) {
    active=false;raw=context;frameTime=time;frameSerial++;
    return safe('begin',()=>{
      if(!snake||!warmup())return false;
      for(const layer of surfaces)if(!available(layer))return false;
      const captureValid=validCapture(),rebuild=pairedRaw!==context||!pairs.length||!captureValid||dirtyCapture;
      if(!captureValid||dirtyCapture) {
        // Interrupted captures may retain a save stack/clip: clearRect alone
        // cannot recover them. Reset backings only after an actual fault.
        for(const layer of surfaces)layer.canvas.width=layer.canvas.width;
        captureRecoveries++;dirtyCapture=false;
      }
      if(rebuild) {
        pairs.length=0;boundedForeground.pair=null;if(fallbackForeground)fallbackForeground.pair=null;
        allContext=pair(context,actors.context,{secondaryPreparedMode:{occlusion:true}});
        snakeContext=pair(material.wrapContext(allContext,SNAKE_NEON.inner),
          material.wrapEmissionContext(emission.context,SNAKE_NEON.inner));
        pairedRaw=context;capturePairBuilds++;
      }else capturePairReuses++;
      if(lastTime!==null&&time<lastTime)eyes.reset();lastTime=time;
      if(!reflection.prepare({grid,key,drawWallArtwork}))return false;
      lastKey=key;reflectionOptions.viewport=visibleViewport;sources.length=0;
      emissionUsed=eyePainted=false;
      clear(emission);clear(actors);
      for(let i=0;i<eyeTileCount;i++)clear(eyeTiles[i]);
      eyeTileCount=0;eyeTileMap.clear();
      if(foregroundUsed&&foreground)clear(foreground);
      foregroundUsed=false;
      // Unknown ghost/effect bounds use a separate correctness-first capture.
      // Reclaim it after the event without inflating the normal crop.
      if(fallbackForeground&&frameSerial-lastFallbackFrame>FALLBACK_IDLE_FRAMES
        &&(fallbackForeground.canvas.width>1||fallbackForeground.canvas.height>1)) {
        fallbackForeground.canvas.width=fallbackForeground.canvas.height=1;cropResizes++;
      }
      active=true;configureForeground(foregroundBounds);return active;
    },false);
  }
  function eraseForeground(layer,used) {
    if(!used){skippedOcclusionPasses++;return;}
    if(!(foreground.useWidth&&foreground.useHeight))return;
    if(layer!==emission&&((foreground.x+foreground.useWidth)*2<=layer.x
      ||foreground.x*2>=layer.x+layer.canvas.width
      ||(foreground.y+foreground.useHeight)*2<=layer.y
      ||foreground.y*2>=layer.y+layer.canvas.height))return;
    occlusionPasses++;const c=layer.context;c.save();
    try {
      c.setTransform(layer.scale,0,0,layer.scale,-layer.x,-layer.y);
      c.globalAlpha=1;c.globalCompositeOperation='destination-out';c.filter='none';
      c.drawImage(foreground.canvas,0,0,foreground.useWidth,foreground.useHeight,
        foreground.x,foreground.y,foreground.useWidth,foreground.useHeight);
    }finally{c.restore();}
  }
  function flushOcclusion() {
    if(!active||!foregroundUsed)return;
    safe('occlusion',()=>{
      eraseForeground(emission,emissionUsed);
      if(eyePainted)for(let i=0;i<eyeTileCount;i++)eraseForeground(eyeTiles[i],true);
      else skippedOcclusionPasses++;
      clear(foreground);foregroundUsed=false;
    });
  }
  function eyeWorldBounds(head,out) {
    const s=head?.sprite,r=EYE_REGION;
    if(!s||![head.x,head.y,head.angle,s.dx,s.dy,s.sw,s.sh,s.dw,s.dh].every(Number.isFinite)
      ||!(s.sw>0&&s.sh>0))return false;
    const x=s.dx+(r.x-EYE_FRINGE_PAD)/s.sw*s.dw,y=s.dy+(r.y-EYE_FRINGE_PAD)/s.sh*s.dh;
    const w=(r.width+EYE_FRINGE_PAD*2)/s.sw*s.dw,h=(r.height+EYE_FRINGE_PAD*2)/s.sh*s.dh;
    const co=Math.cos(head.angle),si=Math.sin(head.angle);
    let l=Infinity,t=Infinity,right=-Infinity,bottom=-Infinity;
    for(let i=0;i<4;i++) {
      const lx=x+(i&1?w:0),ly=y+(i&2?h:0);
      const px=(head.x+co*lx-si*ly)*2,py=(head.y+si*lx+co*ly)*2;
      l=Math.min(l,px);t=Math.min(t,py);right=Math.max(right,px);bottom=Math.max(bottom,py);
    }
    out.left=Math.max(0,Math.floor(l)-2);out.top=Math.max(0,Math.floor(t)-2);
    out.right=Math.min(worldPixelsWidth,Math.ceil(right)+2);out.bottom=Math.min(worldPixelsHeight,Math.ceil(bottom)+2);
    return true;
  }
  function eyeTile(tx,ty) {
    const key=ty*eyeColumns+tx;let layer=eyeTileMap.get(key);if(layer)return layer;
    layer=eyeTiles[eyeTileCount];
    if(!layer){layer=surface(2,EYE_TILE+2*EYE_GUARD,EYE_TILE+2*EYE_GUARD);eyeTiles.push(layer);}
    if(!available(layer)){active=false;return null;}
    layer.x=tx*EYE_TILE-EYE_GUARD;layer.y=ty*EYE_TILE-EYE_GUARD;
    clear(layer,false);eyeTileCount++;eyeTilePeak=Math.max(eyeTilePeak,eyeTileCount);
    eyeTileMap.set(key,layer);return layer;
  }
  function paintEyes(entity,geometry) {
    const art=snake.getCollisionArt(),time=geometry.renderTime??frameTime;
    eyes.draw(eyeSink,entity,geometry,art,time);eyeSchedules++;
    if(!geometry.head||!art?.image||!(eyes.diagnostics().lastLevel>0))return;
    if(!eyeWorldBounds(geometry.head,eyeBounds)) {
      eyeBounds.left=eyeBounds.top=0;eyeBounds.right=worldPixelsWidth;eyeBounds.bottom=worldPixelsHeight;
    }
    const v=reflectionOptions.viewport;
    if(!(eyeBounds.right>eyeBounds.left&&eyeBounds.bottom>eyeBounds.top)
      ||v&&(eyeBounds.right<v.left*2-EYE_GUARD||eyeBounds.left>v.right*2+EYE_GUARD
        ||eyeBounds.bottom<v.top*2-EYE_GUARD||eyeBounds.top>v.bottom*2+EYE_GUARD)) {
      eyeCulled++;return;
    }
    const x0=Math.max(0,Math.floor((eyeBounds.left-EYE_GUARD)/EYE_TILE));
    const x1=Math.min(eyeColumns-1,Math.floor((eyeBounds.right+EYE_GUARD-1)/EYE_TILE));
    const y0=Math.max(0,Math.floor((eyeBounds.top-EYE_GUARD)/EYE_TILE));
    const y1=Math.min(Math.ceil(worldPixelsHeight/EYE_TILE)-1,Math.floor((eyeBounds.bottom+EYE_GUARD-1)/EYE_TILE));
    for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++) {
      const layer=eyeTile(tx,ty);if(!layer)return;
      const c=layer.context;c.save();
      try {
        // Guard pixels must obey the old finite full-world canvas too.
        c.beginPath();c.rect(0,0,width,height);c.clip();
        eyePainted=eyes.draw(c,entity,geometry,art,time)||eyePainted;
      }finally{c.restore();}
    }
  }
  function noteSnake(entity,{freeze=false,geometry:providedGeometry=null,bounds=null}={}) {
    if(!active)return;
    safe('snake-light',()=>{
      const geometry=providedGeometry||snake.getWorldGeometry(entity,frameTime,{freeze});if(!geometry)return;
      const i=sources.length,entry=sourcePool[i]||(sourcePool[i]={geometry:null,color:null,bounds:null});
      // Keep every eye clock alive. Bounds only let the reflection renderer
      // reject a whole off-camera light field before walking its body samples.
      entry.geometry=geometry;entry.color=entity.color;entry.bounds=bounds;
      sources.push(entry);paintEyes(entity,geometry);
    });
  }
  function project(layer,source,camera) {
    clear(layer);
    const zoom=camera.zoom,left=camera.x-width/(2*zoom),top=camera.y-height/(2*zoom);
    const sx=source.width/width,sy=source.height/height;
    layer.context.drawImage(source,left*sx,top*sy,width/zoom*sx,height/zoom*sy,0,0,width,height);
  }
  function projectEyes(camera) {
    clear(viewport);const c=viewport.context,zoom=camera.zoom;
    const left=(camera.x-width/(2*zoom))*2,top=(camera.y-height/(2*zoom))*2;
    c.setTransform(1,0,0,1,0,0);
    for(let i=0;i<eyeTileCount;i++) {
      const layer=eyeTiles[i],coreX=layer.x+EYE_GUARD,coreY=layer.y+EYE_GUARD;
      // Partition destination PIXEL CENTERS, not antialiased world rectangles:
      // adjacent guarded tiles must never double-blend a boundary pixel.
      const x0=Math.max(0,Math.ceil((coreX-left)*zoom-.5));
      const y0=Math.max(0,Math.ceil((coreY-top)*zoom-.5));
      const x1=Math.min(viewport.canvas.width,Math.ceil((Math.min(worldPixelsWidth,coreX+EYE_TILE)-left)*zoom-.5));
      const y1=Math.min(viewport.canvas.height,Math.ceil((Math.min(worldPixelsHeight,coreY+EYE_TILE)-top)*zoom-.5));
      if(x1<=x0||y1<=y0)continue;
      c.save();c.beginPath();c.rect(x0,y0,x1-x0,y1-y0);c.clip();
      c.setTransform(2,0,0,2,0,0);
      c.drawImage(layer.canvas,left-layer.x,top-layer.y,width/zoom*2,height/zoom*2,
        0,0,width,height);c.restore();
    }
  }
  function maskViewport(layer,dusk,subtractActors,camera) {
    const c=layer.context;c.globalCompositeOperation='destination-in';c.drawImage(dusk,0,0,width,height);
    if(subtractActors) {
      const zoom=camera.zoom,left=camera.x-width/(2*zoom),top=camera.y-height/(2*zoom);
      c.globalCompositeOperation='destination-out';
      c.drawImage(actors.canvas,left,top,width/zoom,height/zoom,0,0,width,height);
    }
    c.globalCompositeOperation='source-over';
  }
  function present(target,dusk,camera) {
    if(!active||!dusk)return false;
    return safe('present',()=>{
      const started=clock();flushOcclusion();if(!active||!validCapture())return false;
      const reflectionStart=clock(),maps=reflection.render(sources,reflectionOptions);
      reflectionMs=clock()-reflectionStart;target.save();
      try {
        target.globalCompositeOperation='screen';target.imageSmoothingEnabled=true;target.filter='none';
        if(maps)for(const [map,alpha] of [[maps.floor,SNAKE_NEON.body],[maps.walls,1]]) {
          if(!map)continue;
          project(lightViewport,map,camera);maskViewport(lightViewport,dusk,true,camera);
          target.globalAlpha=alpha;target.drawImage(lightViewport.canvas,0,0,width,height);
        }
        project(viewport,emission.canvas,camera);maskViewport(viewport,dusk,false,camera);
        clear(halo);halo.context.filter='blur('+(tile/36*4.4*halo.scale)+'px)';
        halo.context.drawImage(viewport.canvas,0,0,width,height);halo.context.filter='none';
        target.globalAlpha=SNAKE_NEON.halo;target.drawImage(halo.canvas,0,0,width,height);
        target.globalAlpha=SNAKE_NEON.emission;target.drawImage(viewport.canvas,0,0,width,height);
        if(eyePainted) {
          projectEyes(camera);target.globalAlpha=1;target.drawImage(viewport.canvas,0,0,width,height);eyePresentFrames++;
        }
      }finally{target.restore();}
      frames++;overlayMs=clock()-started;return true;
    },false);
  }
  function retainedBytes() {
    const m=material.stats(),r=reflection.stats(),e=eyes.diagnostics();
    return surfaces.reduce((n,l)=>n+l.canvas.width*l.canvas.height*4,0)
      +(m.totalCachedBytes??(m.cachedBytes||0)*2)+(r.receiverBytes||0)
      +(r.light?.accountedCanvasBytes??r.light?.cachedBytes??0)+(e.painter?.cachedBytes||0);
  }
  return {
    warmup,beginFrame,setForegroundBounds,flushOcclusion,noteSnake,present,
    actorsContext:()=>{if(active&&foreground?.useWidth&&foreground?.useHeight)foregroundUsed=true;return active?actorContext:raw;},
    snakeContext:()=>{if(active)emissionUsed=true;return active?snakeContext:raw;},
    reset(){active=false;eyes.reset();sources.length=0;lastTime=null;},
    invalidate(){active=false;sourceIdentity=null;material.reset();eyes.reset();reflection.reset();dirtyCapture=true;},
    diagnostics:()=>({enabled:active,settings:SNAKE_NEON,fog:false,overheadLights:false,
      captureRaster:'world-2x-sparse',frames,snakes:sources.length,mazeKey:lastKey,reflectionMs,overlayMs,captureRecoveries,
      errors:errors.slice(),capturePairBuilds,capturePairReuses,occlusionPasses,skippedOcclusionPasses,eyePresentFrames,
      cropResizes,foregroundCrop:foreground?{x:foreground.x,y:foreground.y,width:foreground.useWidth,height:foreground.useHeight,
        capacityWidth:foreground.canvas.width,capacityHeight:foreground.canvas.height,fallback:foreground===fallbackForeground}:null,
      fallbackBytes:fallbackForeground?fallbackForeground.canvas.width*fallbackForeground.canvas.height*4:0,
      eyeTileSize:EYE_TILE,eyeTileGuard:EYE_GUARD,eyeTileCount,eyeTilePeak,eyeSchedules,eyeCulled,
      surfaces:surfaces.length,surfaceBytes:surfaces.reduce((n,l)=>n+l.canvas.width*l.canvas.height*4,0),retainedBytes:retainedBytes(),
      material:material.stats(),reflection:reflection.stats(),eyes:eyes.diagnostics()})
  };
}
globalThis.MazeBitersSnakeNeonFactory=Object.freeze({create:createSnakeNeon});
