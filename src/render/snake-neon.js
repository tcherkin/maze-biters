import {createNeonMaterial} from './neon-material.js?v=1.02.06.00';
import {createPairedContext, pairedContextStatus} from './neon-context.js?v=1.02.06.00';
import {createSnakeNeonEyes} from './snake-neon-eyes.js?v=1.02.06.00';
import {createSnakeNeonReflection,PICKUP_REFLECTION_COLORS} from './snake-neon-reflection.js?v=1.02.17.00';
import {EYE_REGION} from './neon-eye-glints.js?v=1.02.06.00';
import {createCreatureNeon} from './creature-neon.js?v=1.02.17.00';
import {createCreatureNeonEyes} from './creature-neon-eyes.js?v=1.02.16.00';
import {createPickupNeonMaterial} from './pickup-neon-material.js?v=1.02.16.02';

// Preserve the accepted WORLD-space raster densities and camera projection.
// These sparse captures do not sharpen, dim or retime any lighting effect.
export const SNAKE_NEON=Object.freeze({inner:.7,halo:.38,body:.5,walls:.4,emission:.78});
const EYE_TILE=128,EYE_GUARD=4,EYE_FRINGE_PAD=10,CROP_BUCKET=64,FALLBACK_IDLE_FRAMES=120;
const CAPTURE_GUARD=8,CAPTURE_RECLAIM_FRAMES=120;
const CAPTURE_STYLE_KEYS=['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','miterLimit',
  'lineDashOffset','font','textAlign','textBaseline','direction','fontKerning','fontStretch',
  'fontVariantCaps','letterSpacing','textRendering','wordSpacing','imageSmoothingQuality'];
const eyeSink={isContextLost:()=>true}; // Native scheduling happens before this guard.
export function createSnakeNeon({width,height,tile,makeCanvas,snake,creaturesEnabled=true,pickupsEnabled=true}) {
  const material=createNeonMaterial({strength:SNAKE_NEON.inner,canvasFactory:makeCanvas});
  const eyes=createSnakeNeonEyes({makeCanvas});
  const creatureEyes=createCreatureNeonEyes({makeCanvas});
  const creatures=createCreatureNeon({makeCanvas,eyes:creatureEyes});
  const pickups=createPickupNeonMaterial({makeCanvas,strength:SNAKE_NEON.inner});
  const reflection=createSnakeNeonReflection({width,height,tile,makeCanvas});
  const surfaces=[],pairs=[],sources=[],sourcePool=[],errors=[];
  const eyeTiles=[],eyeTileMap=new Map(),eyeBounds={},captureBounds={},cameraBounds={};
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
  let creatureDraws=0,creatureCulled=0,snakeSources=0,creatureSources=0;
  let pickupEmission=null,pickupCover=null,pickupPair=null,pickupPrimary=null;
  let pickupUsed=false,pickupPrepared=false,pickupFault=false,pickupDirty=false,pickupSources=0;
  let pickupDraws=0,pickupCulled=0,pickupFailures=0,pickupLastError=null,pickupAllocationFailed=false;
  const pickupRecords=new WeakMap();
  let capturePairBuilds=0,capturePairReuses=0,occlusionPasses=0,skippedOcclusionPasses=0,eyePresentFrames=0;
  let captureResizes=0,captureReclaims=0,captureFallbackFrames=0,captureFallback=true;
  let captureClearPixels=0,captureTotalClearPixels=0,captureActivePixels=0;
  const clock=()=>globalThis.performance?.now?.()??0;
  function surface(scale=1,w=Math.round(width*scale),h=Math.round(height*scale)) {
    const canvas=globalThis.__gpu2d?globalThis.__gpu2d.makeSurface(w,h,'neon-layer',true):makeCanvas(w,h),context=canvas.getContext('2d');
    if(!context)throw new Error('Neon capture context unavailable');
    const layer={canvas,context,scale,x:0,y:0,useWidth:w,useHeight:h,lost:false,pair:null,
      requestedX:0,requestedY:0,shrinkFrames:0};
    canvas.addEventListener?.('contextlost',()=>{layer.lost=true;dirtyCapture=true;active=false;});
    canvas.addEventListener?.('contextrestored',()=>{layer.lost=false;dirtyCapture=true;});
    surfaces.push(layer);return layer;
  }
  function pickupSurface(scale) {
    const canvas=globalThis.__gpu2d?globalThis.__gpu2d.makeSurface(1,1,'pickup-layer'):makeCanvas(1,1),context=canvas.getContext('2d');
    if(!context){canvas.width=canvas.height=1;throw Error('Pickup light capture unavailable');}
    const layer={canvas,context,scale,x:0,y:0,useWidth:1,useHeight:1,lost:false,
      requestedX:0,requestedY:0,shrinkFrames:0};
    canvas.addEventListener?.('contextlost',()=>{layer.lost=true;pickupFault=pickupDirty=true;});
    canvas.addEventListener?.('contextrestored',()=>{layer.lost=false;pickupDirty=true;});
    return layer;
  }
  function pickupAvailable() {
    for(const layer of [pickupEmission,pickupCover])if(layer){
      const lost=layer.context.isContextLost?.()??layer.lost;
      if(lost!==layer.lost){layer.lost=lost;pickupDirty=true;}
      if(lost)return false;
    }
    return true;
  }
  function preparePickupCapture() {
    if(pickupAllocationFailed||pickupFault)return false;
    if(pickupPrepared)return !pickupFault;
    try {
      try{pickupEmission??=pickupSurface(2);pickupCover??=pickupSurface(1);}
      catch(error){pickupAllocationFailed=true;throw error;}
      if(!pickupAvailable())return false;
      if(pickupDirty){
        for(const layer of [pickupEmission,pickupCover])layer.canvas.width=layer.canvas.width;
        pickupPair=pickupPrimary=null;pickupDirty=false;
      }
      configureCameraCapture(pickupEmission,!captureFallback);
      configureCameraCapture(pickupCover,!captureFallback);
      pickupPrepared=true;return true;
    }catch(error){pickupFailures++;pickupLastError=String(error?.message||error);pickupFault=pickupDirty=true;return false;}
  }
  // Emission and its projection stay at world 2x, actor/reflection masks at
  // world 1x, and the intentionally soft halo at .5x.
  const emission=surface(2,1,1),boundedForeground=surface(1,1,1),actors=surface(1,1,1);
  let viewport=globalThis.__gpu2d?null:surface(2);
  const lightViewport=globalThis.__gpu2d?null:surface(),halo=surface(.5);
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
      if(creaturesEnabled)creatureEyes.prepare?.();
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
  function resizeCapture(layer,w,h){
    const c=layer.context,styles=[];
    // Width/height assignments reset Canvas state. Ordinary frame clearing
    // intentionally preserves styles, so preserve those same fields across
    // rare reserve changes too; drawing through a paired context stays valid.
    for(const key of CAPTURE_STYLE_KEYS)if(key in c)styles.push([key,c[key]]);
    const dash=typeof c.getLineDash==='function'?c.getLineDash():null;
    if(layer.canvas.width!==w)layer.canvas.width=w;
    if(layer.canvas.height!==h)layer.canvas.height=h;
    for(const [key,value] of styles)c[key]=value;
    if(dash)c.setLineDash(dash);
    captureResizes++;
  }
  function configureCameraCapture(layer,known){
    const scale=layer.scale,worldWidth=Math.round(width*scale),worldHeight=Math.round(height*scale);
    // Integer origins keep the original world raster's pixel centres. Keep a
    // conservative reconstruction fringe even when the camera zooms out.
    const guard=known?Math.ceil(CAPTURE_GUARD*Math.max(1,
      (cameraBounds.right-cameraBounds.left)/width,(cameraBounds.bottom-cameraBounds.top)/height)):0;
    const left=known?Math.max(0,Math.min(worldWidth,Math.floor(cameraBounds.left*scale)-guard)):0;
    const top=known?Math.max(0,Math.min(worldHeight,Math.floor(cameraBounds.top*scale)-guard)):0;
    const right=known?Math.max(left,Math.min(worldWidth,Math.ceil(cameraBounds.right*scale)+guard)):worldWidth;
    const bottom=known?Math.max(top,Math.min(worldHeight,Math.ceil(cameraBounds.bottom*scale)+guard)):worldHeight;
    const requestedWidth=right-left,requestedHeight=bottom-top;
    const wantedWidth=Math.max(1,Math.min(worldWidth,Math.ceil(requestedWidth/CROP_BUCKET)*CROP_BUCKET));
    const wantedHeight=Math.max(1,Math.min(worldHeight,Math.ceil(requestedHeight/CROP_BUCKET)*CROP_BUCKET));
    let w=layer.canvas.width,h=layer.canvas.height;
    if(wantedWidth>w||wantedHeight>h){
      w=Math.max(w,wantedWidth);h=Math.max(h,wantedHeight);layer.shrinkFrames=0;
      resizeCapture(layer,w,h);
    }else if(wantedWidth*wantedHeight<=w*h*.65){
      // Sustained smaller demand reclaims an old wide-camera/full fallback
      // reserve. A moving camera cannot resize it on every pixel or frame.
      if(++layer.shrinkFrames>=CAPTURE_RECLAIM_FRAMES){
        w=wantedWidth;h=wantedHeight;resizeCapture(layer,w,h);captureReclaims++;layer.shrinkFrames=0;
      }
    }else layer.shrinkFrames=0;
    // Keep the WHOLE reserve inside the original finite world. At an outer
    // edge shift the reserve left/up instead of adding a persistent clip or
    // permitting guard pixels outside the old canvas to receive artwork.
    layer.x=Math.min(left,worldWidth-w);layer.y=Math.min(top,worldHeight-h);
    layer.requestedX=left;layer.requestedY=top;
    layer.useWidth=requestedWidth;layer.useHeight=requestedHeight;
    clear(layer);
    captureClearPixels+=w*h;captureActivePixels+=requestedWidth*requestedHeight;
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
      if(lastTime!==null&&time<lastTime){eyes.reset();creatures.reset();}lastTime=time;
      if(!reflection.prepare({grid,key,drawWallArtwork}))return false;
      const knownViewport=visibleViewport!==null&&!Array.isArray(visibleViewport)
        &&readBounds(visibleViewport,cameraBounds)&&cameraBounds.right>cameraBounds.left
        &&cameraBounds.bottom>cameraBounds.top;
      captureFallback=!knownViewport;if(captureFallback)captureFallbackFrames++;
      lastKey=key;reflectionOptions.viewport=knownViewport?cameraBounds:null;sources.length=0;
      snakeSources=creatureSources=pickupSources=0;
      pickupUsed=pickupPrepared=pickupFault=false;
      emissionUsed=eyePainted=false;
      captureClearPixels=captureActivePixels=0;
      configureCameraCapture(emission,knownViewport);configureCameraCapture(actors,knownViewport);
      captureTotalClearPixels+=captureClearPixels;
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
      if(pickupUsed&&!pickupFault){
        // A lost optional pickup capture must not take down the established
        // snake/creature lights or leave the shared foreground uncleared.
        try{eraseForeground(pickupEmission,true);}
        catch(error){pickupFault=pickupDirty=true;pickupFailures++;pickupLastError=String(error?.message||error);}
      }
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
      entry.geometry=geometry;entry.color=entity.color;entry.bounds=bounds;entry.lightColor=null;entry.opacity=1;snakeSources++;
      sources.push(entry);paintEyes(entity,geometry);
    });
  }
  function paintCreatureEyes(pose) {
    if(!pose.eyeImage)return;
    const x0=Math.max(0,Math.floor((pose.left*2-EYE_GUARD)/EYE_TILE));
    const y0=Math.max(0,Math.floor((pose.top*2-EYE_GUARD)/EYE_TILE));
    const x1=Math.min(eyeColumns-1,Math.floor(((pose.left+pose.width)*2+EYE_GUARD)/EYE_TILE));
    const y1=Math.min(Math.ceil(worldPixelsHeight/EYE_TILE)-1,Math.floor(((pose.top+pose.height)*2+EYE_GUARD)/EYE_TILE));
    for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++) {
      const layer=eyeTile(tx,ty);if(!layer)return;
      const c=layer.context;c.save();
      try {
        c.beginPath();c.rect(0,0,width,height);c.clip();
        c.globalCompositeOperation='screen';c.imageSmoothingEnabled=true;
        c.shadowColor='#dceaff';c.shadowBlur=tile*.09*layer.scale;
        c.drawImage(pose.eyeImage,pose.left,pose.top,pose.width,pose.height);eyePainted=true;
      }finally{c.restore();}
    }
  }
  function drawCreature(entity,{kind,bounds,geometry,lightColor,scale,draw,glints=true}={}) {
    if(!active||!creaturesEnabled)return false;
    let committed=false;
    try{
    // Schedules continue while off camera, but no pose texture is produced.
    const level=glints?creatureEyes.observe(entity,frameTime,kind):0;
    if(geometry) {
      const i=sources.length,entry=sourcePool[i]||(sourcePool[i]={});
      entry.geometry=geometry;entry.bounds=bounds;entry.color=null;entry.lightColor=lightColor;entry.opacity=1;
      sources.push(entry);creatureSources++;
    }
    if(!readBounds(bounds,captureBounds))return false;
    const b={...captureBounds},v=reflectionOptions.viewport,reach=tile*1.45+2;
    if(v&&(b.right<v.left-reach||b.left>v.right+reach||b.bottom<v.top-reach||b.top>v.bottom+reach)) {
      creatureCulled++;return true;
    }
    const pose=creatures.prepare({kind,bounds:b,scale,level,draw});
    if(!pose){
      // A failed per-kind capture must not inherit the preceding creature's
      // narrow foreground crop. Paint native art once through a fresh mask.
      setForegroundBounds(b);
      if(active&&foreground?.useWidth&&foreground?.useHeight)foregroundUsed=true;
      committed=true; // A partially throwing native painter must not replay.
      draw(active?actorContext:raw,()=>{});
      return true;
    }
    // Each actor occludes earlier light BEFORE adding its own. A batch flush
    // after adding all emissions would erase the very glow being introduced.
    setForegroundBounds(b);
    if(!active){raw.drawImage(pose.image,pose.left,pose.top,pose.width,pose.height);return true;}
    if(foreground?.useWidth&&foreground?.useHeight)foregroundUsed=true;
    actorContext.drawImage(pose.artwork,pose.left,pose.top,pose.width,pose.height);committed=true;
    flushOcclusion();
    if(active&&pose.emission){
      const c=emission.context;c.save();
      try {c.globalAlpha=1;c.drawImage(pose.emission,pose.left,pose.top,pose.width,pose.height);emissionUsed=true;}
      finally{c.restore();}
    }
    if(active)paintCreatureEyes(pose);
    creatureDraws++;return true;
    }catch(error){fail('creature-light',error);return committed;}
  }
  function drawPickup(entity,{kind,index=0,source,rect,x,y,opacity=1}={}) {
    if(!active||!pickupsEnabled||!entity||!['fruit','egg'].includes(kind)
      ||![x,y,opacity].every(Number.isFinite))return false;
    const alpha=Math.max(0,Math.min(1,opacity));
    if(alpha<=0)return false;
    const bounds={left:x,top:y,right:x+tile,bottom:y+tile},v=reflectionOptions.viewport,reach=tile*1.45+2;
    if(v&&(bounds.right<v.left-reach||bounds.left>v.right+reach||bounds.bottom<v.top-reach||bounds.top>v.bottom+reach)){
      pickupCulled++;return true;
    }
    let committed=false;
    try {
      const art=pickups.get({source,rect,kind});if(!art)return false;
      if(!preparePickupCapture())return false;
      let record=pickupRecords.get(entity);
      if(!record){
        record={x:0,y:0,geometry:{length:tile*.5}};
        record.geometry.sample=(_distance,out={})=>{out.x=record.x;out.y=record.y;return out;};
        pickupRecords.set(entity,record);
      }
      record.x=x+tile*.5;record.y=y+tile*.5;
      const i=sources.length,entry=sourcePool[i]||(sourcePool[i]={});
      entry.geometry=record.geometry;entry.color=null;entry.bounds=bounds;entry.opacity=alpha;
      entry.lightColor=PICKUP_REFLECTION_COLORS[kind==='egg'?'egg':`fruit${index}`]||PICKUP_REFLECTION_COLORS.fruit0;
      sources.push(entry);pickupSources++;
      setForegroundBounds(bounds);
      const target=active?actorContext:raw;
      if(active&&foreground?.useWidth&&foreground?.useHeight)foregroundUsed=true;
      target.save();
      try{target.globalAlpha=alpha;committed=true;target.drawImage(art.material,x,y,tile,tile);}
      finally{target.restore();}
      flushOcclusion();
      if(active){
        const c=pickupEmission.context;c.save();
        try{c.globalAlpha=alpha;c.drawImage(art.emission,x,y,tile,tile);pickupUsed=true;}
        finally{c.restore();}
      }
      pickupDraws++;return true;
    }catch(error){pickupFailures++;pickupLastError=String(error?.message||error);pickupFault=pickupDirty=true;return committed;}
  }
  function pickupSnakeContext() {
    if(!pickupUsed||pickupFault)return snakeContext;
    if(!pickupAvailable()){pickupFault=true;return snakeContext;}
    if(pickupPrimary!==snakeContext||!pickupPair){
      pickupPrimary=snakeContext;
      // This optional pair is intentionally not in the established pipeline's
      // health list. Its failure suppresses pickup light, never snake light.
      pickupPair=createPairedContext(snakeContext,pickupCover.context,{
        secondaryPreparedMode:{occlusion:true},
        onSecondaryError(error){pickupFault=pickupDirty=true;pickupFailures++;pickupLastError=String(error?.message||error);}
      });
    }
    return pickupPair;
  }
  function mergePickupLight() {
    if(!pickupUsed||pickupFault||!pickupAvailable())return;
    try {
      const c=pickupEmission.context;c.save();
      try{
        c.globalAlpha=1;c.globalCompositeOperation='destination-out';
        c.drawImage(pickupCover.canvas,pickupCover.x,pickupCover.y,
          pickupCover.canvas.width/pickupCover.scale,pickupCover.canvas.height/pickupCover.scale);
      }finally{c.restore();}
      const e=emission.context;e.save();
      try{
        e.globalAlpha=1;e.globalCompositeOperation='destination-over';
        e.drawImage(pickupEmission.canvas,pickupEmission.x/2,pickupEmission.y/2,
          pickupEmission.canvas.width/2,pickupEmission.canvas.height/2);
        emissionUsed=true;
      }finally{e.restore();}
    }catch(error){pickupFailures++;pickupLastError=String(error?.message||error);pickupDirty=true;}
  }
  function project(layer,source,camera,capture=null) {
    clear(layer);
    const zoom=camera.zoom,left=camera.x-width/(2*zoom),top=camera.y-height/(2*zoom);
    const sx=capture?capture.scale:source.width/width,sy=capture?capture.scale:source.height/height;
    layer.context.drawImage(source,left*sx-(capture?.x||0),top*sy-(capture?.y||0),
      width/zoom*sx,height/zoom*sy,0,0,width,height);
  }
  function projectEyes(camera) {
    viewport??=surface(2);
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
      c.drawImage(actors.canvas,left-actors.x,top-actors.y,width/zoom,height/zoom,0,0,width,height);
    }
    c.globalCompositeOperation='source-over';
  }
  let gpuLighting=null;
  function present(target,dusk,camera) {
    if(!active||!dusk)return false;
    return safe('present',()=>{
      const started=clock();flushOcclusion();if(!active||!validCapture())return false;
      mergePickupLight();
      const reflectionStart=clock(),maps=reflection.render(sources,reflectionOptions);
      reflectionMs=clock()-reflectionStart;target.save();
      try {
        target.globalCompositeOperation='screen';target.imageSmoothingEnabled=true;target.filter='none';
        let emissionSource;
        if(target.canvas?._gpu){
          gpuLighting??=globalThis.__gpu2d.createLightingGraph(width,height);
          const projected=gpuLighting.project(maps||{},dusk,camera,emission,actors);
          for(const [map,alpha] of [[projected.floor,SNAKE_NEON.body],[projected.walls,1]]){
            if(map){target.globalAlpha=alpha;target.drawImage(map,0,0,width,height);}
          }
          emissionSource=projected.emission;
        }else{
        if(maps)for(const [map,alpha] of [[maps.floor,SNAKE_NEON.body],[maps.walls,1]]) {
          if(!map)continue;
          project(lightViewport,map,camera);maskViewport(lightViewport,dusk,true,camera);
          target.globalAlpha=alpha;target.drawImage(lightViewport.canvas,0,0,width,height);
        }
        project(viewport,emission.canvas,camera,emission);maskViewport(viewport,dusk,false,camera);
          emissionSource=viewport.canvas;
        }
        clear(halo);halo.context.filter='blur('+(tile/36*4.4*halo.scale)+'px)';
        halo.context.drawImage(emissionSource,0,0,width,height);halo.context.filter='none';
        target.globalAlpha=SNAKE_NEON.halo;target.drawImage(halo.canvas,0,0,width,height);
        target.globalAlpha=SNAKE_NEON.emission;target.drawImage(emissionSource,0,0,width,height);
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
      +(r.light?.accountedCanvasBytes??r.light?.cachedBytes??0)+(e.painter?.cachedBytes||0)+creatures.stats().bytes
      +(pickups.stats().bytes||0)+[pickupEmission,pickupCover].reduce((sum,l)=>sum+(l?l.canvas.width*l.canvas.height*4:0),0);
  }
  function captureRegion(layer){return {scale:layer.scale,x:layer.x,y:layer.y,
    requestedX:layer.requestedX,requestedY:layer.requestedY,useWidth:layer.useWidth,useHeight:layer.useHeight,
    capacityWidth:layer.canvas.width,capacityHeight:layer.canvas.height,
    activePixels:layer.useWidth*layer.useHeight,capacityPixels:layer.canvas.width*layer.canvas.height};}
  return {
    warmup,beginFrame,setForegroundBounds,flushOcclusion,noteSnake,present,drawCreature,drawPickup,
    drawScorpionEyeMask:(context,pose)=>creatureEyes.drawScorpionMask(context,pose,tile),
    actorsContext:()=>{if(active&&foreground?.useWidth&&foreground?.useHeight)foregroundUsed=true;return active?actorContext:raw;},
    snakeContext:()=>{if(active)emissionUsed=true;return active?pickupSnakeContext():raw;},
    reset(){active=false;eyes.reset();creatures.reset();sources.length=0;lastTime=null;pickupAllocationFailed=false;},
    invalidate(){active=false;sourceIdentity=null;material.reset();eyes.reset();creatures.invalidate();pickups.invalidate();reflection.reset();dirtyCapture=true;pickupDirty=true;pickupAllocationFailed=false;},
    diagnostics:()=>({enabled:active,settings:SNAKE_NEON,fog:false,overheadLights:false,
      captureRaster:'world-2x-sparse',frames,snakes:snakeSources,mazeKey:lastKey,reflectionMs,overlayMs,captureRecoveries,
      creatures:{enabled:creaturesEnabled,draws:creatureDraws,culled:creatureCulled,sources:creatureSources,...creatures.stats()},
      pickups:{enabled:pickupsEnabled,draws:pickupDraws,culled:pickupCulled,sources:pickupSources,
        captureFailures:pickupFailures,captureLastError:pickupLastError,...pickups.stats(),
        captureBytes:[pickupEmission,pickupCover].reduce((sum,l)=>sum+(l?l.canvas.width*l.canvas.height*4:0),0)},
      errors:errors.slice(),capturePairBuilds,capturePairReuses,occlusionPasses,skippedOcclusionPasses,eyePresentFrames,
      captureRegions:{mode:'integer-world-camera-crops',guard:CAPTURE_GUARD,fallback:captureFallback,
        emission:captureRegion(emission),actors:captureRegion(actors),resizes:captureResizes,reclaims:captureReclaims,
        fallbackFrames:captureFallbackFrames,reclaimAfterFrames:CAPTURE_RECLAIM_FRAMES,
        activePixels:captureActivePixels,clearPixels:captureClearPixels,totalClearPixels:captureTotalClearPixels,
        fullWorldClearPixels:Math.round(width*2)*Math.round(height*2)+Math.round(width)*Math.round(height),
        capacityBytes:(emission.canvas.width*emission.canvas.height+actors.canvas.width*actors.canvas.height)*4},
      cropResizes,foregroundCrop:foreground?{x:foreground.x,y:foreground.y,width:foreground.useWidth,height:foreground.useHeight,
        capacityWidth:foreground.canvas.width,capacityHeight:foreground.canvas.height,fallback:foreground===fallbackForeground}:null,
      fallbackBytes:fallbackForeground?fallbackForeground.canvas.width*fallbackForeground.canvas.height*4:0,
      eyeTileSize:EYE_TILE,eyeTileGuard:EYE_GUARD,eyeTileCount,eyeTilePeak,eyeSchedules,eyeCulled,
      surfaces:surfaces.length,surfaceBytes:surfaces.reduce((n,l)=>n+l.canvas.width*l.canvas.height*4,0),retainedBytes:retainedBytes(),
      material:material.stats(),reflection:reflection.stats(),eyes:eyes.diagnostics()})
  };
}
globalThis.MazeBitersSnakeNeonFactory=Object.freeze({create:createSnakeNeon});
