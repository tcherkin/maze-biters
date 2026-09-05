// Maze Biters v1.01.93.00
// Engine extracted without gameplay changes from standalone v1.01.61.99.
(() => {
  const canvas = document.getElementById('game');
  const HighScoreService=globalThis.MazeBitersHighScores;
  const MenuLighting=globalThis.MazeBitersMenuLighting?.create();
  globalThis.__mazeBitersMenuLightingDiagnostics=()=>MenuLighting?.diagnostics();
  const highScoreNameInput=document.getElementById('highScoreNameInput');
  const screenReaderStatus=document.getElementById('screenReaderStatus');
  // Keep the visible canvas synchronized with the browser compositor. The
  // former desynchronized presentation could expose a partially rendered
  // high-resolution title frame as a sporadic whole-screen flash.
  const displayCtx = canvas.getContext('2d',{alpha:false});
  let ctx = displayCtx;
  const bitmapHud = document.getElementById('bitmapHud');
  const bctx = bitmapHud.getContext('2d',{alpha:false});
  const gameWrap = document.getElementById('gameWrap');
  let hudDirty=true;
const HUD_ANIMATION_INTERVAL_MS=1000/120;
  let lastHudAnimationAt=-Infinity;
  let hudAnimationWasActive=false;
  const TILE = 16, COLS = 36, ROWS = 25;
  // HD and 4K share the same exact 36x25 simulation. Only the physical
  // backing store and matching atlas resolution change.
  const GAME_LOGICAL_WIDTH=COLS*TILE;
  const GAME_LOGICAL_HEIGHT=ROWS*TILE;
  const DuskLighting=globalThis.MazeBitersDuskLighting?.create({
    width:GAME_LOGICAL_WIDTH,height:GAME_LOGICAL_HEIGHT,tile:TILE,
    positionFor:playerVisualPosition,isPowered:isPowerMode,powerStrength:powerModeSpeedStrength,
    deathLightAlpha:deathSkeletonPulseAlpha
  });
  globalThis.__mazeBitersLightingDiagnostics=()=>({
    gameplay:DuskLighting?.diagnostics(),tutorial:TutorialLighting?.diagnostics()
  });
  const GAME_CONTENT_OFFSET_X=(GAME_LOGICAL_WIDTH-512)/2;
  const GAME_CONTENT_OFFSET_Y=(GAME_LOGICAL_HEIGHT-384)/2;
  // The former title was already a native 4:3 composition. Re-render that
  // complete 1024x768 layout proportionally across the new 1152x864 field
  // instead of placing it inside a smaller offset window. This preserves the
  // proven spacing while every element once again participates in one grid.
  const TITLE_LOGICAL_WIDTH=1152;
  const TITLE_LEGACY_LOGICAL_WIDTH=1024;
  const TITLE_LEGACY_LOGICAL_HEIGHT=768;
  const TITLE_LOGICAL_HEIGHT=864;
  const TITLE_LAYOUT_SCALE=TITLE_LOGICAL_WIDTH/TITLE_LEGACY_LOGICAL_WIDTH;
  const TITLE_CONTENT_OFFSET_X=0;
  const TITLE_CONTENT_OFFSET_Y=0;
  // The wider 576x32 HUD centres the existing compact arrangement above the
  // maze. Together, 576x400 plus 576x32 gives an exact 4:3 screen.
  const HUD_LOGICAL_WIDTH=GAME_LOGICAL_WIDTH;
  const HUD_LOGICAL_HEIGHT=32;
  const HUD_CONTENT_OFFSET_X=(HUD_LOGICAL_WIDTH-512)/2;
  const DISPLAY_QUALITY_PROFILES=Object.freeze({
    HD:Object.freeze({
      name:'HD-native-80px-world-cache',
      quality:'HD',
      targetDisplay:Object.freeze([1920,1080]),
      totalBacking:Object.freeze([1440,1080]),
      mazeBacking:Object.freeze([1440,1000]),
      mazeCacheBacking:Object.freeze([2880,2000]),
      hudBacking:Object.freeze([1440,80]),
      logicalGrid:Object.freeze([COLS,ROWS+(HUD_LOGICAL_HEIGHT/TILE)]),
      renderScale:2.5,
      mazeCacheRenderScale:5,
      presentationTilePixels:40,
      sourceTilePixels:80,
      cameraZoomRange:Object.freeze([1,2]),
      atlasPolicy:'Native 80px sources render one-to-one into the 2880x2000 world cache; the 1440x1000 camera output presents 40px cells at 1x and native 80px cells at 2x.'
    }),
    '4K':Object.freeze({
      name:'4K-fixed-4x3-80px',
      quality:'4K',
      targetDisplay:Object.freeze([3840,2160]),
      totalBacking:Object.freeze([2880,2160]),
      mazeBacking:Object.freeze([2880,2000]),
      mazeCacheBacking:Object.freeze([2880,2000]),
      hudBacking:Object.freeze([2880,160]),
      logicalGrid:Object.freeze([COLS,ROWS+(HUD_LOGICAL_HEIGHT/TILE)]),
      renderScale:5,
      mazeCacheRenderScale:5,
      presentationTilePixels:80,
      sourceTilePixels:160,
      cameraZoomRange:Object.freeze([1,2]),
      atlasPolicy:'Native 160px sources: exact 80px cells at 1x and one-to-one at 2x.'
    })
  });
  let activeDisplayQuality='HD';
  let activeDisplayProfile=DISPLAY_QUALITY_PROFILES.HD;
  let GAME_RENDER_SCALE=activeDisplayProfile.renderScale;
  let GAME_BACKING_WIDTH=activeDisplayProfile.mazeBacking[0];
  let GAME_BACKING_HEIGHT=activeDisplayProfile.mazeBacking[1];
  let MAZE_CACHE_RENDER_SCALE=activeDisplayProfile.mazeCacheRenderScale;
  let MAZE_CACHE_BACKING_WIDTH=activeDisplayProfile.mazeCacheBacking[0];
  let MAZE_CACHE_BACKING_HEIGHT=activeDisplayProfile.mazeCacheBacking[1];
  let TITLE_BACKING_WIDTH=activeDisplayProfile.totalBacking[0];
  let TITLE_BACKING_HEIGHT=activeDisplayProfile.totalBacking[1];
  let HUD_RENDER_SCALE=activeDisplayProfile.renderScale;
  let HUD_BACKING_WIDTH=activeDisplayProfile.hudBacking[0];
  let HUD_BACKING_HEIGHT=activeDisplayProfile.hudBacking[1];
  // The animated menu is completed on this hidden, fixed-size surface. Only
  // the finished opaque frame is copied to the visible canvas, so filters,
  // text spotlights and portraits can never be presented half-drawn.
  const titleFrameCanvas=document.createElement('canvas');
  titleFrameCanvas.width=TITLE_BACKING_WIDTH;
  titleFrameCanvas.height=TITLE_BACKING_HEIGHT;
  const titleFrameContext=titleFrameCanvas.getContext('2d',{alpha:false});
  titleFrameContext.imageSmoothingEnabled=false;
  globalThis.MAZE_BITERS_DISPLAY_PROFILE=activeDisplayProfile;
  let titleCanvasScaleX=TITLE_BACKING_WIDTH/TITLE_LOGICAL_WIDTH;
  let titleCanvasScaleY=TITLE_BACKING_HEIGHT/TITLE_LOGICAL_HEIGHT;

  if(bitmapHud.width!==HUD_BACKING_WIDTH||bitmapHud.height!==HUD_BACKING_HEIGHT){
    bitmapHud.width=HUD_BACKING_WIDTH;
    bitmapHud.height=HUD_BACKING_HEIGHT;
  }
  bctx.setTransform(HUD_RENDER_SCALE,0,0,HUD_RENDER_SCALE,0,0);
  bctx.imageSmoothingEnabled=false;

  // The HUD star field is prepared once at native backing-store resolution.
  // Runtime HUD refreshes copy this immutable layer in one operation, so the
  // cosmic detail adds no per-star work to score or spotlight animations.
  const hudCosmicBackgroundCanvas=document.createElement('canvas');
  hudCosmicBackgroundCanvas.width=HUD_BACKING_WIDTH;
  hudCosmicBackgroundCanvas.height=HUD_BACKING_HEIGHT;
  const hudCosmicBackgroundContext=
    hudCosmicBackgroundCanvas.getContext('2d',{alpha:false});

  function prepareHudCosmicBackground(){
    const layer=hudCosmicBackgroundContext;
    layer.setTransform(1,0,0,1,0,0);
    layer.fillStyle='#000';
    layer.fillRect(0,0,HUD_BACKING_WIDTH,HUD_BACKING_HEIGHT);

    // Match the title-screen microstar palette while keeping the HUD glyphs
    // dominant. Coordinates and brightness are deterministic: no flicker.
    for(let gy=2;gy<HUD_LOGICAL_HEIGHT;gy+=10){
      for(let gx=3;gx<HUD_LOGICAL_WIDTH;gx+=14){
        const hash=(
          Math.imul(gx+23,73856093)^
          Math.imul(gy+41,19349663)^0x45d9f3b
        )>>>0;
        if(hash%4===0) continue;
        const x=Math.min(
          HUD_LOGICAL_WIDTH-1,gx+(hash%8)
        );
        const y=Math.min(
          HUD_LOGICAL_HEIGHT-1,gy+((hash>>>5)%7)
        );
        const alpha=.18+((hash>>>10)%5)*.035;
        layer.fillStyle=hash%11===0
          ?`rgba(226,112,255,${alpha*.88})`
          :hash%3===0
            ?`rgba(112,230,255,${alpha})`
            :`rgba(105,255,188,${alpha*.92})`;
        const size=hash%19===0?5:3;
        layer.fillRect(
          Math.round(x*HUD_RENDER_SCALE),
          Math.round(y*HUD_RENDER_SCALE),size,size
        );
      }
    }
  }
  prepareHudCosmicBackground();

  let fittedGameViewportWidth=0;
  let viewportFitRequest=0;
  function fitGameToViewport(){
    // The 36x25 maze plus its two-cell-high HUD is a native 36x27, or 4:3,
    // complete screen. Fit that complete footprint without adding side space.
    const viewport=globalThis.visualViewport;
    const availableWidth=Math.max(
      160,
      Math.floor(viewport?.width||globalThis.innerWidth||960)
    );
    const availableHeight=Math.max(
      160,
      Math.floor(viewport?.height||globalThis.innerHeight||780)
    );
    const widthAllowedByHeight=availableHeight*(4/3);
    const fittedWidth=Math.max(
      160,
      Math.floor(Math.min(2880,availableWidth,widthAllowedByHeight))
    );
    // Crossing between the Codex chat and its browser can emit a burst of
    // identical (or sub-pixel-only) viewport events. Avoid rewriting layout
    // when the integer 4:3 footprint has not actually changed.
    if(fittedWidth===fittedGameViewportWidth) return fittedWidth;
    fittedGameViewportWidth=fittedWidth;
    const fittedCssWidth=`${fittedWidth}px`;
    if(gameWrap.style.width!==fittedCssWidth) gameWrap.style.width=fittedCssWidth;
    return fittedWidth;
  }

  function scheduleGameViewportFit(){
    if(viewportFitRequest) return;
    viewportFitRequest=requestAnimationFrame(()=>{
      viewportFitRequest=0;
      fitGameToViewport();
    });
  }

  // Title rendering is deterministic and independent from browser DPR. The
  // complete intro always exists as a native 2880x2160 bitmap; the browser may
  // only scale that finished image to fit the visible viewport.
  function configureTitleCanvasResolution(){
    if(typeof HTMLCanvasElement==='undefined'||!(canvas instanceof HTMLCanvasElement)) return;
    if(canvas.width!==TITLE_BACKING_WIDTH||canvas.height!==TITLE_BACKING_HEIGHT){
      canvas.width=TITLE_BACKING_WIDTH;
      canvas.height=TITLE_BACKING_HEIGHT;
    }
    titleCanvasScaleX=TITLE_BACKING_WIDTH/TITLE_LOGICAL_WIDTH;
    titleCanvasScaleY=TITLE_BACKING_HEIGHT/TITLE_LOGICAL_HEIGHT;
    ctx.imageSmoothingEnabled=false;
  }

  function restoreGameplayCanvasResolution(){
    titleCanvasScaleX=1;
    titleCanvasScaleY=1;
    if(canvas.width!==GAME_BACKING_WIDTH||canvas.height!==GAME_BACKING_HEIGHT){
      canvas.width=GAME_BACKING_WIDTH;
      canvas.height=GAME_BACKING_HEIGHT;
    }
    if(typeof ctx.setTransform==='function'){
      ctx.setTransform(GAME_RENDER_SCALE,0,0,GAME_RENDER_SCALE,0,0);
    }
    ctx.imageSmoothingEnabled=false;
  }

  // Shared gameplay camera. Every game and every level begins with the
  // complete 1x board. The camera then eases toward a maximum 2x close view.
  // Each tracked player contributes the full world window they would receive
  // alone at 2x; the union of those windows therefore never favours one
  // participant at the expense of another. Movement adds common breathing
  // room around that union; a lone survivor uses the exact same Solo curve.
  const GAMEPLAY_CAMERA_MAX_ZOOM=2;
  const GAMEPLAY_CAMERA_SINGLE_VIEW_WIDTH=
    GAME_LOGICAL_WIDTH/GAMEPLAY_CAMERA_MAX_ZOOM;
  const GAMEPLAY_CAMERA_SINGLE_VIEW_HEIGHT=
    GAME_LOGICAL_HEIGHT/GAMEPLAY_CAMERA_MAX_ZOOM;
  // Measure rendered displacement, not held keys: a blocked turn or a wall
  // must not open the camera. Signed motion cancels during short backtracking;
  // the dominant axis also distinguishes straight runs from winding paths.
  const GAMEPLAY_CAMERA_NORMAL_SPEED=TILE/95;
  const gameplayCameraMotionStates=new WeakMap();
  let gameplayCameraMotionRevision=0;
  function createGameplayCameraMotionState(){
    return {subject:null,x:0,y:0,realTime:null,gameTime:null,
      vx:0,vy:0,speed:0,zoom:GAMEPLAY_CAMERA_MAX_ZOOM,revision:gameplayCameraMotionRevision};
  }

  function resetGameplayCameraMotionState(motion){
    motion.subject=null;motion.realTime=null;motion.gameTime=null;
    motion.vx=0;motion.vy=0;motion.speed=0;
    motion.zoom=GAMEPLAY_CAMERA_MAX_ZOOM;
    motion.revision=gameplayCameraMotionRevision;
  }

  function updateGameplayCameraMotion(motion,subject,x,y,realTime,gameTime){
    const elapsed=realTime-motion.realTime;
    const dx=x-motion.x,dy=y-motion.y;
    const distance=Math.hypot(dx,dy);
    // Respawns, new levels and a suspended tab are not sudden fast travel.
    const discontinuity=motion.revision!==gameplayCameraMotionRevision||
      motion.subject!==subject||motion.realTime===null||
      elapsed<0||elapsed>250||gameTime<motion.gameTime||
      distance>Math.max(TILE*1.25,elapsed*TILE*.045);
    if(discontinuity){
      resetGameplayCameraMotionState(motion);motion.subject=subject;
    }else if(elapsed>0){
      const blend=1-Math.exp(-elapsed/500);
      motion.vx+=(dx/elapsed-motion.vx)*blend;
      motion.vy+=(dy/elapsed-motion.vy)*blend;
      motion.speed+=(distance/elapsed-motion.speed)*blend;
      const speed=motion.speed/GAMEPLAY_CAMERA_NORMAL_SPEED;
      const progress=Math.max(Math.abs(motion.vx),Math.abs(motion.vy))/GAMEPLAY_CAMERA_NORMAL_SPEED;
      const opening=.06*Math.min(1,speed)+.20*Math.min(1,progress)+
        .06*Math.min(1,Math.max(0,progress-1));
      motion.zoom=GAMEPLAY_CAMERA_MAX_ZOOM-opening;
      if(opening<.0001) motion.zoom=GAMEPLAY_CAMERA_MAX_ZOOM;
    }
    motion.x=x;motion.y=y;motion.realTime=realTime;motion.gameTime=gameTime;
    return motion.zoom;
  }

  const gameplayCamera={
    zoom:1,targetZoom:1,
    x:GAME_LOGICAL_WIDTH/2,y:GAME_LOGICAL_HEIGHT/2,
    targetX:GAME_LOGICAL_WIDTH/2,targetY:GAME_LOGICAL_HEIGHT/2,
    lastRealTime:performance.now(),resetRealTime:performance.now(),
    subjectCount:0,livingSubjectCount:0,presentationZoomOut:false,
    soloMotionActive:false,motionActive:false,motionZoom:GAMEPLAY_CAMERA_MAX_ZOOM
  };
  // Updated once per rendered frame and reused by every moving entity. The
  // padding keeps rotated heads, leader contours and interpolated edge sprites visible
  // while avoiding thousands of off-camera atlas blits at close zoom.
  let gameplayVisibleMinX=-Infinity;
  let gameplayVisibleMinY=-Infinity;
  let gameplayVisibleMaxX=Infinity;
  let gameplayVisibleMaxY=Infinity;

  function gameplaySpriteVisible(x,y){
    return x>=gameplayVisibleMinX && x<=gameplayVisibleMaxX &&
      y>=gameplayVisibleMinY && y<=gameplayVisibleMaxY;
  }

  function clampGameplayCameraCenter(value,viewportSize,worldSize){
    const half=viewportSize/2;
    return Math.max(half,Math.min(worldSize-half,value));
  }

  function resetGameplayCamera(realTime=performance.now()){
    gameplayCamera.zoom=1;
    gameplayCamera.targetZoom=1;
    gameplayCamera.x=GAME_LOGICAL_WIDTH/2;
    gameplayCamera.y=GAME_LOGICAL_HEIGHT/2;
    gameplayCamera.targetX=gameplayCamera.x;
    gameplayCamera.targetY=gameplayCamera.y;
    gameplayCamera.lastRealTime=realTime;
    gameplayCamera.resetRealTime=realTime;
    gameplayCamera.subjectCount=0;
    gameplayCamera.livingSubjectCount=0;
    gameplayCamera.presentationZoomOut=false;
    gameplayCamera.soloMotionActive=false;
    gameplayCamera.motionActive=false;
    gameplayCamera.motionZoom=GAMEPLAY_CAMERA_MAX_ZOOM;
    // Reuse per-player state across frames. A revision also invalidates any
    // temporarily absent actor without replacing the WeakMap during play.
    gameplayCameraMotionRevision++;
    const roster=allPlayers();
    for(let i=0;i<roster.length;i++){
      const motion=gameplayCameraMotionStates.get(roster[i]);
      if(motion) resetGameplayCameraMotionState(motion);
    }
  }

  function updateGameplayCamera(realTime,gameNow){
    const halfSingleWidth=GAMEPLAY_CAMERA_SINGLE_VIEW_WIDTH/2;
    const halfSingleHeight=GAMEPLAY_CAMERA_SINGLE_VIEW_HEIGHT/2;
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    let subjectCount=0,livingCount=0;
    let motionZoom=GAMEPLAY_CAMERA_MAX_ZOOM;
    const roster=allPlayers();
    // PAUSE, GAME OVER and LEVEL CLEARED are deliberate full-board camera moments.
    // The simulation may remain alive underneath, but the presentation gently
    // returns to 1x before the next screen or level begins.
    const presentationZoomOut=!!(paused||gameOver||levelCompletionTransition);

    for(let i=0;i<roster.length;i++){
      const p=roster[i];
      if(!p) continue;
      if(!p.dead&&!p.eliminated) livingCount++;
      if(p.dead||p.eliminated||presentationZoomOut){
        const motion=gameplayCameraMotionStates.get(p);
        if(motion) resetGameplayCameraMotionState(motion);
      }
    }

    if(!presentationZoomOut){
      for(let i=0;i<roster.length;i++){
        const p=roster[i];
        if(!p||p.eliminated||(p.dead&&p.hideDeathSprite)) continue;
        // A skull must not keep the last survivor in a distant shared frame.
        // With nobody alive, retain the established visible-death framing.
        if(livingCount&&p.dead) continue;
        const cameraVisual=p.cameraVisualPosition||
          (p.cameraVisualPosition={x:0,y:0});
        const visual=playerVisualPosition(p,gameNow,cameraVisual);
        const px=(visual.x+.5)*TILE;
        const py=(visual.y+.5)*TILE;
        if(!p.dead){
          let motion=gameplayCameraMotionStates.get(p);
          if(!motion){
            motion=createGameplayCameraMotionState();
            gameplayCameraMotionStates.set(p,motion);
          }
          // Opponents running in opposite directions still need room. Their
          // signed velocities are filtered independently, never averaged.
          motionZoom=Math.min(motionZoom,
            updateGameplayCameraMotion(motion,p,px,py,realTime,gameNow));
        }
        const soloCenterX=clampGameplayCameraCenter(
          px,GAMEPLAY_CAMERA_SINGLE_VIEW_WIDTH,GAME_LOGICAL_WIDTH
        );
        const soloCenterY=clampGameplayCameraCenter(
          py,GAMEPLAY_CAMERA_SINGLE_VIEW_HEIGHT,GAME_LOGICAL_HEIGHT
        );
        left=Math.min(left,soloCenterX-halfSingleWidth);
        right=Math.max(right,soloCenterX+halfSingleWidth);
        top=Math.min(top,soloCenterY-halfSingleHeight);
        bottom=Math.max(bottom,soloCenterY+halfSingleHeight);
        subjectCount++;
      }
    }

    gameplayCamera.motionActive=!presentationZoomOut&&livingCount>0;
    gameplayCamera.soloMotionActive=gameplayCamera.motionActive&&livingCount===1;
    gameplayCamera.livingSubjectCount=livingCount;
    gameplayCamera.motionZoom=motionZoom;

    if(subjectCount){
      // Expand the complete shared window, not just a 2x zoom cap: otherwise
      // motion would stop helping as soon as two players moved farther apart.
      // One living player reduces this expression exactly to the Solo zoom.
      const extraWidth=GAME_LOGICAL_WIDTH/motionZoom-GAMEPLAY_CAMERA_SINGLE_VIEW_WIDTH;
      const extraHeight=GAME_LOGICAL_HEIGHT/motionZoom-GAMEPLAY_CAMERA_SINGLE_VIEW_HEIGHT;
      const unionWidth=Math.max(GAMEPLAY_CAMERA_SINGLE_VIEW_WIDTH,right-left)+extraWidth;
      const unionHeight=Math.max(GAMEPLAY_CAMERA_SINGLE_VIEW_HEIGHT,bottom-top)+extraHeight;
      gameplayCamera.targetZoom=Math.max(1,Math.min(
        GAMEPLAY_CAMERA_MAX_ZOOM,
        GAME_LOGICAL_WIDTH/unionWidth,
        GAME_LOGICAL_HEIGHT/unionHeight
      ));
      const targetViewWidth=GAME_LOGICAL_WIDTH/gameplayCamera.targetZoom;
      const targetViewHeight=GAME_LOGICAL_HEIGHT/gameplayCamera.targetZoom;
      gameplayCamera.targetX=clampGameplayCameraCenter(
        (left+right)/2,targetViewWidth,GAME_LOGICAL_WIDTH
      );
      gameplayCamera.targetY=clampGameplayCameraCenter(
        (top+bottom)/2,targetViewHeight,GAME_LOGICAL_HEIGHT
      );
    }else{
      gameplayCamera.targetZoom=1;
      gameplayCamera.targetX=GAME_LOGICAL_WIDTH/2;
      gameplayCamera.targetY=GAME_LOGICAL_HEIGHT/2;
    }
    gameplayCamera.subjectCount=subjectCount;
    gameplayCamera.presentationZoomOut=presentationZoomOut;

    const elapsed=Math.max(
      0,Math.min(50,realTime-gameplayCamera.lastRealTime)
    );
    gameplayCamera.lastRealTime=realTime;
    // Every camera transition uses twice the former time constants. This is
    // especially visible with two players, where both the shared zoom and the
    // shared centre now glide instead of reacting sharply.
    const zoomingOut=gameplayCamera.targetZoom<gameplayCamera.zoom;
    // PAUSE, GAME OVER and LEVEL CLEARED use a deliberately slower, cinematic
    // full-board reveal. Ordinary shared-camera zoom-out remains responsive.
    const zoomTau=zoomingOut?(presentationZoomOut?580:290):1040;
    const zoomBlend=1-Math.exp(-elapsed/zoomTau);
    const panBlend=1-Math.exp(-elapsed/470);
    gameplayCamera.zoom+=(gameplayCamera.targetZoom-gameplayCamera.zoom)*zoomBlend;
    gameplayCamera.x+=(gameplayCamera.targetX-gameplayCamera.x)*panBlend;
    gameplayCamera.y+=(gameplayCamera.targetY-gameplayCamera.y)*panBlend;

    if(Math.abs(gameplayCamera.targetZoom-gameplayCamera.zoom)<.00005)
      gameplayCamera.zoom=gameplayCamera.targetZoom;
    if(Math.abs(gameplayCamera.targetX-gameplayCamera.x)<.002)
      gameplayCamera.x=gameplayCamera.targetX;
    if(Math.abs(gameplayCamera.targetY-gameplayCamera.y)<.002)
      gameplayCamera.y=gameplayCamera.targetY;

    const currentViewWidth=GAME_LOGICAL_WIDTH/gameplayCamera.zoom;
    const currentViewHeight=GAME_LOGICAL_HEIGHT/gameplayCamera.zoom;
    gameplayCamera.x=clampGameplayCameraCenter(
      gameplayCamera.x,currentViewWidth,GAME_LOGICAL_WIDTH
    );
    gameplayCamera.y=clampGameplayCameraCenter(
      gameplayCamera.y,currentViewHeight,GAME_LOGICAL_HEIGHT
    );
  }

  function applyGameplayCameraWorldTransform(){
    const scale=GAME_RENDER_SCALE*gameplayCamera.zoom;
    const translateX=GAME_RENDER_SCALE*(
      GAME_LOGICAL_WIDTH/2-gameplayCamera.zoom*gameplayCamera.x
    );
    const translateY=GAME_RENDER_SCALE*(
      GAME_LOGICAL_HEIGHT/2-gameplayCamera.zoom*gameplayCamera.y
    );
    ctx.setTransform(scale,0,0,scale,translateX,translateY);
  }

  function restoreGameplayScreenTransform(){
    ctx.setTransform(GAME_RENDER_SCALE,0,0,GAME_RENDER_SCALE,0,0);
    ctx.imageSmoothingEnabled=false;
  }

  globalThis.__mazeBitersCameraDiagnostics=()=>({
    zoom:gameplayCamera.zoom,
    targetZoom:gameplayCamera.targetZoom,
    x:gameplayCamera.x,y:gameplayCamera.y,
    targetX:gameplayCamera.targetX,targetY:gameplayCamera.targetY,
    subjectCount:gameplayCamera.subjectCount,
    livingSubjectCount:gameplayCamera.livingSubjectCount,
    motionActive:gameplayCamera.motionActive,
    motionZoom:gameplayCamera.motionZoom,
    soloMotionActive:gameplayCamera.soloMotionActive,
    soloMotionZoom:gameplayCamera.motionZoom,
    presentationZoomOut:gameplayCamera.presentationZoomOut,
    openingZoomIn:performance.now()-gameplayCamera.resetRealTime<4200
  });
  // The maze is immutable during a level. Keep one native 80px-per-cell world
  // layer and rebuild it only when the generated maze or its colour theme
  // changes. HD presentation is a separate 1440x1000 camera surface: zoom 1x
  // downsamples this native world once, while zoom 2x crops it one-to-one.
  // This prevents the former 80 -> 40 cache -> 80 zoom round trip.
  const mazeLayerCanvas=document.createElement('canvas');
  mazeLayerCanvas.width=MAZE_CACHE_BACKING_WIDTH;
  mazeLayerCanvas.height=MAZE_CACHE_BACKING_HEIGHT;
  const mazeLayerContext=mazeLayerCanvas.getContext('2d',{alpha:false});
  mazeLayerContext.setTransform(
    MAZE_CACHE_RENDER_SCALE,0,0,MAZE_CACHE_RENDER_SCALE,0,0
  );
  mazeLayerContext.imageSmoothingEnabled=false;
  let mazeLayerRevision=-1;
  let mazeLayerThemeName='';

  const SOUND_DATA=globalThis.MAZE_BITERS_AUDIO_ASSETS;
  if(!SOUND_DATA) throw new Error('Maze Biters audio manifest is missing');

  const RenderAtlasData=globalThis.MAZE_BITERS_RENDER_ATLAS;
  if(!RenderAtlasData) throw new Error('Prebuilt render atlas manifest is missing');
  const RenderAtlases={};
  const HiResAtlasSources={};
  const SHARED_ATLAS_NAMES=new Set(['core','maze','fontRed']);
  for(const [name,filename] of Object.entries(RenderAtlasData.images)){
    const image=new Image();
    image.decoding='async';
    const source=RenderAtlasData.basePath+filename;
    if(SHARED_ATLAS_NAMES.has(name)) image.src=source;
    else HiResAtlasSources[name]=source;
    RenderAtlases[name]=image;
  }

  // HD is the default and is decoded first. The much larger 4K family is
  // requested only when QUALITY is switched to 4K, avoiding roughly 10 MB of
  // unnecessary startup traffic and image memory on standard displays.
  // Region arrays are updated in place so every sprite object that already
  // references one remains valid after a switch.
  const HiResRenderAtlases={...RenderAtlases};
  const HdRenderAtlases={...HiResRenderAtlases};
  const HD_ATLAS_BASE='assets/atlases/hd/';
  const HD_ATLAS_FILES=Object.freeze({
    modernSnake256Yellow:'snake-yellow-80.png',
    modernSnake256Blue:'snake-blue-80.png',
    modernSnake256Pink:'snake-pink-80.png',
    modernSnake256Orange:'snake-orange-80.png',
    modernSnake256Green:'snake-green-80.png',
    modernSnake256Occlusion:'snake-head-occlusion-80.png',
    modernCharacters256:'modern-characters-80.png',
    modernDeath256:'modern-death-skull-80.png',
    modernScorpions256:'modern-scorpion-animation-80.png',
    modernFruits256:'modern-fruits-80.png',
    modernEggs256:'modern-eggs-80.png',
    fontUniformCyan:'maze-biters-font-cyan-80.png',
    fontUniformMagenta:'maze-biters-font-magenta-80.png',
    conceptMazePipes128:'concept-maze-pipes-gradient-80.png'
  });
  for(const [name,filename] of Object.entries(HD_ATLAS_FILES)){
    const image=new Image();
    image.decoding='async';
    image.src=HD_ATLAS_BASE+filename;
    HdRenderAtlases[name]=image;
  }

  let hiResAtlasLoadStarted=false;
  function ensureHiResAtlasSources(){
    if(hiResAtlasLoadStarted) return;
    hiResAtlasLoadStarted=true;
    for(const [name,source] of Object.entries(HiResAtlasSources)){
      HiResRenderAtlases[name].src=source;
    }
  }

  const QUALITY_SCALED_ATLAS_SECTIONS=Object.freeze([
    'font','fontRed','characters','modernSnake','modernSnakeOcclusion',
    'modernEggs','modernFruits','modernScorpions','conceptMaze','modernDeath'
  ]);
  const RenderAtlasRegionMasters=Object.create(null);
  // Bilinear filtering at fractional camera zoom can sample outside an atlas
  // source rectangle. Adjacent snake cells contain unrelated coloured pixels,
  // which previously appeared as short horizontal or vertical streaks beside
  // a segment. Keep isolated copies of only the 104 moving-snake cells; this
  // prevents cross-cell sampling without changing the approved atlas artwork.
  let IsolatedSnakeSpriteCache=new WeakMap();
  let isolatedSnakeSpriteCount=0;
  for(const section of QUALITY_SCALED_ATLAS_SECTIONS){
    const sectionData=RenderAtlasData[section]||{};
    const masters=RenderAtlasRegionMasters[section]=Object.create(null);
    for(const [name,region] of Object.entries(sectionData)){
      masters[name]=region.slice();
    }
  }

  function setRenderAtlasQuality(quality){
    if(quality==='4K') ensureHiResAtlasSources();
    const sources=quality==='4K'?HiResRenderAtlases:HdRenderAtlases;
    for(const [name,image] of Object.entries(sources))RenderAtlases[name]=image;
    const factor=quality==='4K'?1:.5;
    for(const section of QUALITY_SCALED_ATLAS_SECTIONS){
      const sectionData=RenderAtlasData[section]||{};
      const masters=RenderAtlasRegionMasters[section];
      for(const [name,region] of Object.entries(sectionData)){
        const master=masters[name];
        region[0]=master[0];
        for(let i=1;i<=4;i++)region[i]=master[i]*factor;
      }
    }
    IsolatedSnakeSpriteCache=new WeakMap();
    isolatedSnakeSpriteCount=0;
  }
  setRenderAtlasQuality('HD');

  function atlasSprite(section,name){
    const region=RenderAtlasData[section]?.[name];
    if(!region) return null;
    const sourceWidth=region[3]||16;
    const sourceHeight=region[4]||16;
    return {
      __atlasRegion:region,
      __hvSpriteName:name,
      __hvFontCharacter:name,
      complete:true,
      naturalWidth:sourceWidth,
      naturalHeight:sourceHeight
    };
  }

  function atlasImageReady(name){
    const image=RenderAtlases[name];
    return !!(image&&image.complete&&image.naturalWidth);
  }

  function prepareIsolatedSnakeSpriteCache(){
    const nextCache=new WeakMap();
    let prepared=0;
    for(const section of ['modernSnake','modernSnakeOcclusion']){
      for(const region of Object.values(RenderAtlasData[section]||{})){
        if(nextCache.has(region)) continue;
        const [atlasName,sourceX,sourceY,sourceWidth=16,sourceHeight=16]=region;
        const atlas=RenderAtlases[atlasName];
        if(!atlas||!atlas.complete||!atlas.naturalWidth) continue;

        const isolated=document.createElement('canvas');
        isolated.width=sourceWidth;
        isolated.height=sourceHeight;
        const isolatedContext=isolated.getContext('2d',{alpha:true});
        isolatedContext.imageSmoothingEnabled=false;
        isolatedContext.globalCompositeOperation='copy';
        isolatedContext.drawImage(
          atlas,
          sourceX,sourceY,sourceWidth,sourceHeight,
          0,0,sourceWidth,sourceHeight
        );
        nextCache.set(region,isolated);
        prepared++;
      }
    }
    IsolatedSnakeSpriteCache=nextCache;
    isolatedSnakeSpriteCount=prepared;
  }

  function spriteReady(sprite){
    if(!sprite) return false;
    if(sprite.__atlasRegion) return atlasImageReady(sprite.__atlasRegion[0]);
    return !!(sprite.complete&&sprite.naturalWidth);
  }

  function drawAtlasRegion(targetContext,region,x,y,width=16,height=16){
    if(!region) return false;
    const isolated=IsolatedSnakeSpriteCache.get(region);
    if(isolated){
      targetContext.drawImage(
        isolated,0,0,isolated.width,isolated.height,x,y,width,height
      );
      return true;
    }
    const atlasName=region[0];
    const sourceX=region[1];
    const sourceY=region[2];
    const sourceWidth=region[3]===undefined?16:region[3];
    const sourceHeight=region[4]===undefined?16:region[4];
    const atlas=RenderAtlases[atlasName];
    if(!atlas||!atlas.complete||!atlas.naturalWidth) return false;
    targetContext.drawImage(
      atlas,sourceX,sourceY,sourceWidth,sourceHeight,x,y,width,height
    );
    return true;
  }

  function drawSpriteImage(targetContext,sprite,x,y,width=16,height=16){
    if(!sprite) return false;
    if(sprite.__atlasRegion){
      return drawAtlasRegion(targetContext,sprite.__atlasRegion,x,y,width,height);
    }
    if(!sprite.complete||!sprite.naturalWidth) return false;
    targetContext.drawImage(sprite,x,y,width,height);
    return true;
  }

  const OriginalSprites={};
  for(const name of Object.keys(RenderAtlasData.original)){
    OriginalSprites[name]=atlasSprite('original',name);
  }

  // Four native 64px modern palettes are precompiled into separate atlases.
  // Runtime rendering only selects a cached sprite; it never recolours one.
  const ModernSnakeSprites={};
  for(const name of Object.keys(RenderAtlasData.modernSnake||{})){
    ModernSnakeSprites[name]=atlasSprite('modernSnake',name);
  }
  // Four prebuilt black silhouettes close the transparent mouth only while a
  // head overlaps another snake segment. No runtime mask or filter is needed.
  const ModernSnakeHeadOcclusions={};
  for(const name of Object.keys(RenderAtlasData.modernSnakeOcclusion||{})){
    ModernSnakeHeadOcclusions[name]=atlasSprite('modernSnakeOcclusion',name);
  }
  const ModernSnakeHeadOcclusionByDirection=[
    null,
    ModernSnakeHeadOcclusions.modernHeadOcclusion1||null,
    ModernSnakeHeadOcclusions.modernHeadOcclusion2||null,
    ModernSnakeHeadOcclusions.modernHeadOcclusion3||null,
    ModernSnakeHeadOcclusions.modernHeadOcclusion4||null
  ];

  // The HD skull-and-crossbones is precompiled from concept art at native 256px. One shared
  // neutral sprite is used for every player; the existing death pulse remains.
  const ModernDeathSprites={};
  for(const name of Object.keys(RenderAtlasData.modernDeath||{})){
    ModernDeathSprites[name]=atlasSprite('modernDeath',name);
  }

  // Every 256px player, hunter and bright power-state palette is baked into
  // one modern atlas. Mobile rendering only selects an atlas region: it never
  // recolours, rescales or filters a character during gameplay.
  const CharacterSpriteGroups=Object.create(null);
  for(const name of Object.keys(RenderAtlasData.characters||{})){
    const sprite=atlasSprite('characters',name);

    // Resolve the palette hierarchy once while the atlas image is loaded.
    // The render loop can then use direct object lookups instead of building a
    // new compound string for every character on every frame.
    const parts=name.split(':');
    let group=CharacterSpriteGroups;
    for(let i=0;i<parts.length-1;i++){
      group=group[parts[i]]||(group[parts[i]]=Object.create(null));
    }
    group[parts[parts.length-1]]=sprite;
  }

  // The full egg cracking sequence is precompiled at native 64px.
  // Runtime work is limited to choosing one of four cached atlas regions.
  const ModernEggSprites={};
  for(const name of Object.keys(RenderAtlasData.modernEggs||{})){
    ModernEggSprites[name]=atlasSprite('modernEggs',name);
  }

  // The four HD fruit designs are precompiled into a native 64px atlas.
  // Runtime work is limited to selecting the fruit kind already chosen by gameplay.
  const ModernFruitSprites={};
  for(const name of Object.keys(RenderAtlasData.modernFruits||{})){
    ModernFruitSprites[name]=atlasSprite('modernFruits',name);
  }

  // All four two-cell scorpion orientations are precompiled at native
  // 64px. Runtime rendering performs direct atlas lookups only.
  const ModernScorpionSprites={};
  for(const name of Object.keys(RenderAtlasData.modernScorpions||{})){
    ModernScorpionSprites[name]=atlasSprite('modernScorpions',name);
  }

  const FontSprites={};
  for(const character of Object.keys(RenderAtlasData.font)){
    FontSprites[character]=atlasSprite('font',character);
  }

  // Native 128x128 concept glyphs now share one optical cap height;
  // wide letters share one width and digits use the classic ivory palette.

  const RedFontSprites={};
  for(const character of Object.keys(RenderAtlasData.fontRed)){
    RedFontSprites[character]=atlasSprite('fontRed',character);
  }
  // The magenta atlas shares the normalized geometry and ivory digits.

  const MUSIC_PAGE_DIRECTORY=new URL('./',document.baseURI);
  const MUSIC_ROOT_CANDIDATES=[
    new URL('assets/audio/music/',MUSIC_PAGE_DIRECTORY)
  ];
  const musicCandidates=fileName=>MUSIC_ROOT_CANDIDATES.map(
    root=>new URL(fileName,root).href
  );
  const MENU_MUSIC_TRACK='NeonOrbitMenu';
  const MENU_MUSIC_FILE='neon-orbit-menu.mp3';
  const HIGH_SCORE_MUSIC_FILE='neon-orbit-high-score.mp3';
  const NEON_STILLNESS_TRACKS=[
    {key:'NeonStillnessLevel1',label:'Neon Stillness 1',file:'neon-stillness-level-1.mp3',style:'stillness'},
    {key:'NeonStillnessLevel2',label:'Neon Stillness 2',file:'neon-stillness-level-2.mp3',style:'stillness'},
    {key:'NeonStillnessLevel3',label:'Neon Stillness 3',file:'neon-stillness-level-3.mp3',style:'stillness'},
    {key:'NeonStillnessLevel4',label:'Neon Stillness 4',file:'neon-stillness-level-4.mp3',style:'stillness'},
    {key:'NeonStillnessLevel5',label:'Neon Stillness 5',file:'neon-stillness-level-5.mp3',style:'stillness'},
    {key:'NeonStillnessLevel6',label:'Neon Stillness 6',file:'neon-stillness-level-6.mp3',style:'stillness'},
    {key:'NeonStillnessLevel7',label:'Neon Stillness 7',file:'neon-stillness-level-7.mp3',style:'stillness'},
    {key:'NeonStillnessLevel8',label:'Neon Stillness 8',file:'neon-stillness-level-8.mp3',style:'stillness'},
    {key:'NeonStillnessLevel9',label:'Neon Stillness 9',file:'neon-stillness-level-9.mp3',style:'stillness'}
  ];
  const NEON_ORBIT_TRACKS=[
    {key:'NeonOrbitLevel1',label:'Neon Orbit 1',file:'neon-orbit-level-1.mp3',style:'orbit'},
    {key:'NeonOrbitLevel2',label:'Neon Orbit 2',file:'neon-orbit-level-2.mp3',style:'orbit'},
    {key:'NeonOrbitLevel3',label:'Neon Orbit 3',file:'neon-orbit-level-3.mp3',style:'orbit'},
    {key:'NeonOrbitLevel4',label:'Neon Orbit 4',file:'neon-orbit-level-4.mp3',style:'orbit'},
    {key:'NeonOrbitLevel5',label:'Neon Orbit 5',file:'neon-orbit-level-5.mp3',style:'orbit'},
    {key:'NeonOrbitLevel6',label:'Neon Orbit 6',file:'neon-orbit-level-6.mp3',style:'orbit'},
    {key:'NeonOrbitLevel7',label:'Neon Orbit 7',file:'neon-orbit-level-7.mp3',style:'orbit'},
    {key:'NeonOrbitLevel8',label:'Neon Orbit 8',file:'neon-orbit-level-8.mp3',style:'orbit'},
    {key:'NeonOrbitLevel9',label:'Neon Orbit 9',file:'neon-orbit-level-9.mp3',style:'orbit'}
  ];
  const GAMEPLAY_MUSIC_TRACKS=[
    ...NEON_STILLNESS_TRACKS,...NEON_ORBIT_TRACKS
  ];
  const GAMEPLAY_MUSIC_TRACKS_BY_STYLE={
    stillness:NEON_STILLNESS_TRACKS,
    orbit:NEON_ORBIT_TRACKS
  };
  const MUSIC_TRACK_KEYS=new Set([
    MENU_MUSIC_TRACK,...GAMEPLAY_MUSIC_TRACKS.map(track=>track.key)
  ]);

  // During GAME OVER, keep the maze alive visually while suppressing its
  // ordinary gameplay effects. Presentation and ESC/menu cues remain audible.
  let gameplaySfxMuted=false;
  const GAME_OVER_AUDIBLE_SOUNDS=new Set([
    'Game_Over','SnakeSELECT&Appear@'
  ]);
  function gameplaySoundIsMuted(name){
    return gameplaySfxMuted&&!GAME_OVER_AUDIBLE_SOUNDS.has(name);
  }

  const SoundManager={
    enabled:true,
    volume:0.72,
    context:null,
    masterGain:null,
    masterCompressor:null,
    buffers:new Map(),
    decodePromises:new Map(),
    primePromise:null,
    unlockPromise:null,
    activeVoices:[],
    lastGroupStart:Object.create(null),
    maxVoices:32,
    spatialNodePool:[],
    fallbackPools:Object.create(null),
    fallbackCursors:Object.create(null),

    audioContextConstructor(){
      return globalThis.AudioContext||globalThis.webkitAudioContext||null;
    },

    ensureContext(){
      if(this.context) return true;
      const AudioContextClass=this.audioContextConstructor();
      if(!AudioContextClass) return false;
      try{
        try{
          this.context=new AudioContextClass({latencyHint:'interactive'});
        }catch(_optionsError){
          this.context=new AudioContextClass();
        }
        this.masterGain=this.context.createGain();
        this.masterGain.gain.value=this.volume;

        // A gentle final limiter keeps dense arcade bursts clear without
        // changing the identity or sample rate of the original PCM effects.
        // It is created once and performs no per-frame work.
        if(this.context.createDynamicsCompressor){
          this.masterCompressor=this.context.createDynamicsCompressor();
          this.masterCompressor.threshold.value=-10;
          this.masterCompressor.knee.value=12;
          this.masterCompressor.ratio.value=3;
          this.masterCompressor.attack.value=0.003;
          this.masterCompressor.release.value=0.16;
          this.masterGain.connect(this.masterCompressor);
          this.masterCompressor.connect(this.context.destination);
        }else{
          this.masterGain.connect(this.context.destination);
        }
        return true;
      }catch(_error){
        this.context=null;
        this.masterGain=null;
        this.masterCompressor=null;
        return false;
      }
    },

    unlock(){
      if(!this.ensureContext()) return Promise.resolve(false);
      if(this.context.state==='running') return Promise.resolve(true);
      // Coalesce simultaneous key/pointer/play requests into one resume. This
      // is important on iOS, where starting a source while resume() is still
      // pending can give the first cue a quieter browser-controlled ramp.
      if(this.unlockPromise) return this.unlockPromise;
      try{
        const resumed=this.context.resume?.();
        const settle=()=>new Promise(resolve=>setTimeout(
          ()=>resolve(this.context.state==='running'),48
        ));
        const result=resumed?.then
          ? resumed.then(()=>this.context.state==='running'?settle():false).catch(()=>false)
          : (this.context.state==='running'?settle():Promise.resolve(false));
        this.unlockPromise=result.finally(()=>{ this.unlockPromise=null; });
        return this.unlockPromise;
      }catch(_error){
        this.unlockPromise=null;
        return Promise.resolve(false);
      }
    },

    unlockFromGesture(){
      if(!this.ensureContext()) return false;
      try{
        // Both resume() and a real source start happen synchronously inside
        // the key/touch gesture. This is the most reliable iOS Web Audio
        // unlock and is deliberately independent from long-form music.
        this.context.resume?.();
        const silent=this.context.createBufferSource();
        silent.buffer=this.context.createBuffer(1,1,this.context.sampleRate);
        silent.connect(this.masterGain||this.context.destination);
        silent.start(0);
        silent.onended=()=>{
          try{ silent.disconnect(); }catch(_error){}
        };
        this.prime();
        return true;
      }catch(_error){
        return false;
      }
    },

    audioArrayBuffer(uri){
      if(uri.startsWith('data:')){
        const comma=uri.indexOf(',');
        const binary=atob(comma>=0?uri.slice(comma+1):uri);
        const bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
        return Promise.resolve(bytes.buffer);
      }
      return fetch(uri).then(response=>{
        if(!response.ok)
          throw new Error(`Could not load ${uri}: HTTP ${response.status}`);
        return response.arrayBuffer();
      });
    },

    decode(name){
      if(this.buffers.has(name))
        return Promise.resolve(this.buffers.get(name));
      if(this.decodePromises.has(name)) return this.decodePromises.get(name);
      if(!SOUND_DATA[name]||!this.ensureContext())
        return Promise.reject(new Error('Web Audio unavailable'));

      const promise=this.audioArrayBuffer(SOUND_DATA[name]).then(encoded=>new Promise((resolve,reject)=>{
        let settled=false;
        const complete=buffer=>{
          if(settled) return;
          settled=true;
          this.buffers.set(name,buffer);
          resolve(buffer);
        };
        const fail=error=>{
          if(settled) return;
          settled=true;
          reject(error||new Error(`Could not decode ${name}`));
        };
        try{
          // Supplying callbacks as well as accepting the returned Promise keeps
          // this compatible with both current browsers and older iOS Safari.
          const result=this.context.decodeAudioData(
            encoded.slice(0),complete,fail
          );
          result?.then?.(complete,fail);
        }catch(error){
          fail(error);
        }
      })).finally(()=>this.decodePromises.delete(name));

      this.decodePromises.set(name,promise);
      return promise;
    },

    priorityOrder(){
      const first=[
        'Tie1','Tie2','Tie3','Tie5','TieEat','HeadEat',
        'EatFruit1','EatFruit2','EatFruit3','HeadDie','Tick',
        'SnakeSELECT&Appear@','snakeSTART@',
        'BonusLife@','Game_Over','Congratulations','Oh_No'
      ];
      return [...first,...Object.keys(SOUND_DATA).filter(
        name=>!MUSIC_TRACK_KEYS.has(name)&&!first.includes(name)
      )];
    },

    prime(){
      if(this.primePromise) return this.primePromise;
      if(!this.ensureContext()){
        // Do not make a failed pre-gesture attempt permanent. Some iOS
        // versions will only allow the mixer to be created by a real input.
        return Promise.resolve(false);
      }

      // Decode once while the mode-selection screen is visible. Sequential
      // decoding prevents a burst of 24 simultaneous decoder jobs on iOS,
      // while the bite and head sounds are deliberately first in the queue.
      this.primePromise=(async()=>{
        let decoded=0;
        for(const name of this.priorityOrder()){
          try{
            await this.decode(name);
            decoded++;
          }catch(_error){
            // A failed individual sound can still use the legacy fallback.
          }
        }
        return decoded>0;
      })();
      return this.primePromise;
    },

    prepareGameplay(){
      // The mode-selection click/key is the iOS permission gesture. Decoding
      // has normally already finished in the background; this resumes the one
      // long-lived mixer rather than opening media channels during a bite.
      this.unlock();
      return this.prime();
    },

    policy(name){
      if(name==='Tie1'||name==='Tie2'||name==='Tie3'||
         name==='Tie5'||name==='TieEat'){
        return {group:'body',limit:16,minInterval:0,priority:1};
      }
      if(name==='EatFruit1'||name==='EatFruit2'||name==='EatFruit3')
        return {group:'fruit',limit:2,minInterval:32,priority:1};
      if(name==='Tick')
        return {group:'tick',limit:1,minInterval:60,priority:1};
      if(name==='EggKnock')
        return {group:'egg',limit:2,minInterval:38,priority:2};
      if(name==='HeadEat')
        return {group:'head',limit:16,minInterval:0,priority:3};
      return {group:'critical',limit:5,minInterval:0,priority:4};
    },

    panForEmitter(emitter){
      if(!emitter||!Number.isFinite(emitter.x)) return 0;
      const normalized=Math.max(-1,Math.min(
        1,(emitter.x/Math.max(1,COLS-1))*2-1
      ));
      // A restrained equal-power field keeps the source direction audible
      // without pinning edge events to a single speaker. At the maze edges
      // the opposite channel still carries roughly one third of the signal.
      const BALANCED_STEREO_WIDTH=0.58;
      return Math.sin(normalized*Math.PI*0.5)*BALANCED_STEREO_WIDTH;
    },

    acquireSpatialNode(pan){
      if(Math.abs(pan)<0.01||!this.context?.createStereoPanner) return null;
      let node=this.spatialNodePool.pop();
      if(!node){
        node=this.context.createStereoPanner();
        node.connect(this.masterGain);
      }
      const now=this.context.currentTime;
      node.pan.cancelScheduledValues?.(now);
      node.pan.setValueAtTime(pan,now);
      return node;
    },

    releaseSpatialNode(node){
      if(!node) return;
      const now=this.context?.currentTime||0;
      try{
        node.pan.cancelScheduledValues?.(now);
        node.pan.setValueAtTime(0,now);
      }catch(_error){}
      // At most one reusable panner per possible active voice. Keeping the
      // nodes connected but silent avoids allocation spikes during rapid bites.
      if(this.spatialNodePool.length<this.maxVoices)
        this.spatialNodePool.push(node);
    },

    finishVoice(voice){
      if(!voice?.active) return;
      voice.active=false;
      voice.source.onended=null;
      try{ voice.source.disconnect?.(); }catch(_error){}
      this.releaseSpatialNode(voice.spatialNode);
      voice.spatialNode=null;
      const index=this.activeVoices.indexOf(voice);
      if(index>=0) this.activeVoices.splice(index,1);
    },

    stopVoice(voice){
      if(!voice?.active) return;
      try{ voice.source.stop?.(); }catch(_error){}
      this.finishVoice(voice);
    },

    silenceEffects(){
      const voices=this.activeVoices.slice();
      for(let i=0;i<voices.length;i++) this.stopVoice(voices[i]);
      for(const pool of Object.values(this.fallbackPools)){
        if(!pool) continue;
        for(let i=0;i<pool.length;i++){
          try{
            pool[i].pause?.();
            pool[i].currentTime=0;
          }catch(_error){}
        }
      }
    },

    makeVoiceRoom(policy){
      // This path can run dozens of times per second during rapid bites. Scan
      // the bounded voice list directly so no temporary filter/shift arrays
      // are allocated for the garbage collector on mobile Safari.
      while(true){
        let groupCount=0;
        let oldestInGroup=null;
        for(const voice of this.activeVoices){
          if(!voice.active||voice.group!==policy.group) continue;
          groupCount++;
          if(!oldestInGroup) oldestInGroup=voice;
        }
        if(groupCount<policy.limit) break;
        if(!oldestInGroup) return false;
        this.stopVoice(oldestInGroup);
      }

      while(this.activeVoices.length>=this.maxVoices){
        let replaceable=null;
        for(const voice of this.activeVoices){
          if(voice.active&&voice.priority<=policy.priority){
            replaceable=voice;
            break;
          }
        }
        if(!replaceable) return false;
        this.stopVoice(replaceable);
      }
      return true;
    },

    playBuffer(name,buffer,requestedAt=performance.now(),pan=0){
      if(gameplaySoundIsMuted(name)) return false;
      if(!this.enabled||!buffer||!this.context||!this.masterGain) return false;
      const policy=this.policy(name);
      const now=performance.now();
      const last=this.lastGroupStart[policy.group]??-Infinity;

      // Bite sounds deliberately have no minimum interval: every eaten body,
      // tail or head segment gets its own arcade sound. The 16-voice group
      // voice limits still prevent expensive unbounded overlap on mobile.
      if(policy.minInterval&&now-last<policy.minInterval) return false;
      if(!this.makeVoiceRoom(policy)) return false;

      let source;
      let spatialNode=null;
      try{
        source=this.context.createBufferSource();
        source.buffer=buffer;
        spatialNode=this.acquireSpatialNode(pan);
        source.connect(spatialNode||this.masterGain);
      }catch(_error){
        this.releaseSpatialNode(spatialNode);
        return false;
      }

      const voice={
        source,group:policy.group,priority:policy.priority,
        requestedAt,startedAt:now,active:true,spatialNode
      };
      source.onended=()=>this.finishVoice(voice);
      this.activeVoices.push(voice);
      this.lastGroupStart[policy.group]=now;
      try{
        source.start(0);
        return true;
      }catch(_error){
        this.finishVoice(voice);
        return false;
      }
    },

    fallbackPoolSize(name){
      return name==='Tie1'||name==='Tie2'||name==='Tie3'||
        name==='Tie5'||name==='TieEat' ? 2 : 1;
    },

    ensureFallbackPool(name,warm=false){
      if(!SOUND_DATA[name]||typeof Audio==='undefined') return null;
      let pool=this.fallbackPools[name];
      if(!pool){
        pool=[];
        const count=this.fallbackPoolSize(name);
        for(let i=0;i<count;i++){
          const audio=new Audio(SOUND_DATA[name]);
          audio.preload='auto';
          pool.push(audio);
        }
        this.fallbackPools[name]=pool;
        this.fallbackCursors[name]=0;
      }
      if(warm) pool.forEach(audio=>{
        try{ audio.load?.(); }catch(_error){}
      });
      return pool;
    },

    fallbackPlay(name){
      if(gameplaySoundIsMuted(name)) return false;
      const pool=this.ensureFallbackPool(name);
      if(!pool?.length) return false;
      const cursor=this.fallbackCursors[name]||0;
      const audio=pool[cursor%pool.length];
      this.fallbackCursors[name]=(cursor+1)%pool.length;
      audio.volume=this.volume;
      try{
        audio.pause?.();
        audio.currentTime=0;
        const playback=audio.play();
        playback?.catch?.(()=>{});
        return true;
      }catch(_error){
        return false;
      }
    },

    play(name,emitter=null){
      if(gameplaySoundIsMuted(name)) return false;
      if(!this.enabled||!SOUND_DATA[name]) return false;
      if(!this.ensureContext()) return this.fallbackPlay(name);
      const pan=this.panForEmitter(emitter);
      const requestedAt=performance.now();

      // Never start the first source inside a still-suspended context. Waiting
      // for resume() makes the first SOLO confirmation use the exact same
      // mixer path and gain as confirmations played after a Tick. It also
      // prevents a browser-generated fade/ramp from changing that first cue.
      if(this.unlockPromise||this.context.state!=='running'){
        (this.unlockPromise||this.unlock()).then(unlocked=>{
          if(!unlocked){
            this.fallbackPlay(name);
            return;
          }
          const ready=this.buffers.get(name);
          if(ready){
            this.playBuffer(name,ready,requestedAt,pan);
            return;
          }
          this.decode(name).then(decoded=>
            this.playBuffer(name,decoded,requestedAt,pan)
          ).catch(()=>this.fallbackPlay(name));
        });
        return true;
      }

      const buffer=this.buffers.get(name);
      if(buffer) return this.playBuffer(name,buffer,requestedAt,pan);

      // Normally prime() has decoded every effect before play begins. If a
      // player starts exceptionally quickly, decode only this requested sound
      // and play it while the event is still perceptually current. Never fall
      // back to a media element merely because Web Audio is a few ms early.
      this.decode(name).then(decoded=>{
        if(performance.now()-requestedAt<=120)
          this.playBuffer(name,decoded,requestedAt,pan);
      }).catch(()=>this.fallbackPlay(name));
      return true;
    },

    diagnostics(){
      return {
        engine:this.context?'web-audio':'html-audio-fallback',
        state:this.context?.state||'unavailable',
        decoded:this.buffers.size,
        total:Object.keys(SOUND_DATA).length,
        activeVoices:this.activeVoices.length,
        maxVoices:this.maxVoices,
        positionalStereo:!!this.context?.createStereoPanner,
        pooledSpatialNodes:this.spatialNodePool.length
      };
    }
  };

  // Begin one-time decoding while the player is reading the opening menu.
  // Playback remains locked until a genuine click, tap or key selection.
  SoundManager.prime();

  const MUSIC_VOLUME_OPTIONS=Object.freeze([
    Object.freeze({label:'OFF',gain:0}),
    Object.freeze({label:'LOW',gain:.25}),
    Object.freeze({label:'MEDIUM',gain:.55}),
    Object.freeze({label:'HIGH',gain:1})
  ]);
  const MUSIC_VOLUME_STORAGE_KEY='maze-biters:music-volume:v1';
  const MusicSettings={
    index:3,
    get option(){ return MUSIC_VOLUME_OPTIONS[this.index]; },
    load(){
      this.index=3;
      try{
        const saved=globalThis.localStorage?.getItem(MUSIC_VOLUME_STORAGE_KEY);
        const index=MUSIC_VOLUME_OPTIONS.findIndex(option=>option.label===saved);
        if(index>=0) this.index=index;
      }catch(_error){} // Private/blocked storage must not prevent play.
    },
    cycle(){
      this.index=(this.index+1)%MUSIC_VOLUME_OPTIONS.length;
      try{
        globalThis.localStorage?.setItem(MUSIC_VOLUME_STORAGE_KEY,this.option.label);
      }catch(_error){}
      // Retain the current track and its fade envelope. Only music changes;
      // the SoundManager master gain and positional SFX stay untouched.
      MediaMusic.refreshVolume();
      return this.option;
    }
  };
  MusicSettings.load();

  const MediaMusic={
    audio:null,
    owner:null,

    setVolume(audio,baseVolume){
      if(!audio) return;
      audio.__mazeBaseVolume=Math.max(0,Math.min(1,baseVolume));
      audio.volume=audio.__mazeBaseVolume*MusicSettings.option.gain;
      audio.muted=MusicSettings.option.gain===0;
    },

    refreshVolume(){
      if(this.audio) this.setVolume(this.audio,this.audio.__mazeBaseVolume||0);
    },

    ensureAudio(){
      if(this.audio) return this.audio;
      if(typeof Audio==='undefined') return null;
      const audio=new Audio();
      audio.preload='metadata';
      audio.loop=true;
      audio.playsInline=true;
      this.setVolume(audio,0);
      audio.__mazeWanted=false;
      audio.__mazeTargetVolume=0;
      audio.addEventListener?.('error',()=>this.tryNextSource(audio));
      this.audio=audio;
      this.setSource(audio,MENU_MUSIC_FILE);
      return audio;
    },

    setSource(audio,fileName){
      if(!audio||!fileName) return false;
      if(audio.__mazeMusicFile===fileName&&audio.src) return true;
      audio.__mazeMusicFile=fileName;
      audio.__mazeSourceCandidates=musicCandidates(fileName);
      audio.__mazeSourceIndex=0;
      audio.src=audio.__mazeSourceCandidates[0];
      return true;
    },

    tryNextSource(audio){
      const candidates=audio?.__mazeSourceCandidates;
      const next=(audio?.__mazeSourceIndex||0)+1;
      if(!candidates||next>=candidates.length) return false;
      audio.__mazeSourceIndex=next;
      audio.src=candidates[next];
      try{ audio.load?.(); }catch(_error){}
      if(audio.__mazeWanted){
        this.setVolume(audio,0);
        const playback=audio.play();
        playback?.then?.(()=>{
          audio.__mazeArmed=true;
          this.fade(audio,audio.__mazeTargetVolume||0,0.18);
        }).catch?.(()=>{});
      }
      return true;
    },

    fade(audio,target,durationSeconds,onComplete=null){
      if(!audio) return;
      const token=(audio.__mazeFadeToken||0)+1;
      audio.__mazeFadeToken=token;
      // Interpolate the unscaled envelope so a setting change during any
      // pending play promise, fade or source retry cannot restore old volume.
      const startVolume=Number.isFinite(audio.__mazeBaseVolume)?audio.__mazeBaseVolume:0;
      const targetVolume=Math.max(0,Math.min(1,target));
      const startedAt=performance.now();
      const duration=Math.max(0,durationSeconds*1000);
      const frame=()=>{
        if(audio.__mazeFadeToken!==token) return;
        const phase=duration>0
          ?Math.min(1,(performance.now()-startedAt)/duration)
          :1;
        const smooth=phase*phase*(3-2*phase);
        this.setVolume(audio,startVolume+(targetVolume-startVolume)*smooth);
        if(phase<1) requestAnimationFrame(frame);
        else onComplete?.();
      };
      frame();
    },

    arm(audio){
      if(!audio||audio.__mazeArmed||audio.__mazeArmPending) return;
      audio.__mazeArmPending=true;
      this.setVolume(audio,0);
      try{
        const playback=audio.play();
        if(playback?.then){
          playback.then(()=>{
            audio.__mazeArmed=true;
            audio.__mazeArmPending=false;
            // The active menu/gameplay controller owns the fade and volume.
            // The arming promise must never jump it straight to full level.
            if(!audio.__mazeWanted){
              audio.pause();
              try{ audio.currentTime=0; }catch(_error){}
            }
          }).catch(()=>{ audio.__mazeArmPending=false; });
        }else{
          audio.__mazeArmed=true;
          audio.__mazeArmPending=false;
          if(!audio.__mazeWanted) audio.pause();
        }
      }catch(_error){
        audio.__mazeArmPending=false;
      }
    },

    unlockFromGesture(){
      // iOS grants playback to the actual element touched by the gesture.
      // One persistent element is deliberately shared by menu and gameplay:
      // there is never a second long-form decoder competing with the SFX.
      this.arm(this.ensureAudio());
    }
  };

  const MenuMusic={
    audio:null,
    wanted:false,
    highScoreSession:false,
    requestToken:0,
    mixLevel:0.40,

    ensureAudio(){
      const audio=MediaMusic.ensureAudio();
      if(!audio) return null;
      audio.__mazeTargetVolume=SoundManager.volume*this.mixLevel;
      this.audio=audio;
      return audio;
    },

    start(){
      if(!awaitingPlayerSelection) return false;
      const audio=this.ensureAudio();
      if(!audio) return false;
      this.wanted=true;
      const token=++this.requestToken;
      const target=SoundManager.volume*this.mixLevel;
      // The record song follows name entry into its resulting leaderboard.
      // A leaderboard opened from the main menu keeps the normal menu song.
      if(titleScreenMode==='entry') this.highScoreSession=true;
      else if(titleScreenMode!=='leaderboard') this.highScoreSession=false;
      const file=this.highScoreSession?HIGH_SCORE_MUSIC_FILE:MENU_MUSIC_FILE;
      if(audio.__mazeMusicFile!==file||MediaMusic.owner!=='menu'){
        audio.__mazeFadeToken=(audio.__mazeFadeToken||0)+1;
        audio.pause();
        MediaMusic.setVolume(audio,0);
        MediaMusic.setSource(audio,file);
        try{ audio.currentTime=0; }catch(_error){}
      }
      MediaMusic.owner='menu';
      audio.__mazeWanted=true;
      audio.__mazeTargetVolume=target;
      audio.loop=true;
      const playback=audio.play();
      playback?.then?.(()=>{
        audio.__mazeArmed=true;
        if(this.wanted&&token===this.requestToken&&awaitingPlayerSelection&&
           MediaMusic.owner==='menu'&&audio.__mazeMusicFile===file)
          MediaMusic.fade(audio,target,0.24);
      }).catch?.(()=>{});
      return true;
    },

    stop(fadeSeconds=1.5){
      this.wanted=false;
      ++this.requestToken;
      const audio=this.audio;
      if(!audio||MediaMusic.owner!=='menu') return;
      audio.__mazeWanted=false;
      MediaMusic.fade(audio,0,fadeSeconds,()=>{
        if(this.wanted||MediaMusic.owner!=='menu') return;
        audio.pause();
        try{ audio.currentTime=0; }catch(_error){}
        MediaMusic.owner=null;
      });
    },

    diagnostics(){
      return {
        wanted:this.wanted,
        playing:MediaMusic.owner==='menu'&&!!this.audio&&!this.audio.paused,
        mode:'streamed-media-element',
        currentTrack:this.audio?.__mazeMusicFile===HIGH_SCORE_MUSIC_FILE
          ?'Neon Orbit High Score':'Neon Orbit Menu',
        highScoreSession:this.highScoreSession,
        loop:true,
        fadeOutSeconds:1.5,
        mixLevel:this.mixLevel,
        readyState:this.audio?.readyState||0,
        error:this.audio?.error?.code||null
      };
    }
  };

  const GameplayMusic={
    audio:null,
    wanted:false,
    requestToken:0,
    mixLevel:0.34,
    currentTrack:null,
    history:[],
    trackBags:{stillness:[],orbit:[]},
    lastTrackKeys:{stillness:null,orbit:null},
    assignments:new Map(),
    prepared:null,
    clockFade:null,

    ensureAudio(){
      if(!GAMEPLAY_MUSIC_TRACKS.length) return null;
      const audio=MediaMusic.ensureAudio();
      if(!audio) return null;
      audio.__mazeTargetVolume=SoundManager.volume*this.mixLevel;
      this.audio=audio;
      return audio;
    },

    styleForLevel(levelNumber){
      return Math.max(1,levelNumber|0)%2===1?'stillness':'orbit';
    },

    refillTrackBag(style){
      const bag=(GAMEPLAY_MUSIC_TRACKS_BY_STYLE[style]||[]).slice();
      for(let index=bag.length-1;index>0;index--){
        const swapIndex=(Math.random()*(index+1))|0;
        [bag[index],bag[swapIndex]]=[bag[swapIndex],bag[index]];
      }

      // A new nine-track cycle cannot begin with the same song that ended the
      // previous cycle. Alternating styles still guarantees that levels 1-18
      // use all 18 gameplay tracks before any selection is repeated.
      const lastKey=this.lastTrackKeys[style];
      if(bag.length>1&&bag[bag.length-1]?.key===lastKey){
        const swapIndex=(Math.random()*(bag.length-1))|0;
        [bag[swapIndex],bag[bag.length-1]]=[bag[bag.length-1],bag[swapIndex]];
      }
      this.trackBags[style]=bag;
      return bag;
    },

    chooseTrack(levelNumber){
      const style=this.styleForLevel(levelNumber);
      const bag=this.trackBags[style].length
        ?this.trackBags[style]
        :this.refillTrackBag(style);
      const track=bag.pop()||null;
      if(track) this.lastTrackKeys[style]=track.key;
      return {style,track};
    },

    reserveLevel(levelNumber){
      const levelKey=Math.max(1,levelNumber|0);
      if(this.prepared?.level===levelKey) return this.prepared;
      let assignment=this.assignments.get(levelKey);
      if(!assignment){
        assignment=this.chooseTrack(levelKey);
        this.assignments.set(levelKey,assignment);
      }
      this.prepared={level:levelKey,...assignment};
      return this.prepared;
    },

    stopImmediate(){
      ++this.requestToken;
      this.wanted=false;
      this.clockFade=null;
      const audio=this.audio;
      if(!audio||MediaMusic.owner!=='gameplay') return;
      audio.__mazeWanted=false;
      audio.__mazeFadeToken=(audio.__mazeFadeToken||0)+1;
      MediaMusic.setVolume(audio,0);
      audio.pause();
      try{ audio.currentTime=0; }catch(_error){}
      MediaMusic.owner=null;
    },

    startLevel(levelNumber){
      const levelKey=Math.max(1,levelNumber|0);
      const reservation=this.reserveLevel(levelKey);
      if(!reservation?.track) return false;
      const audio=this.ensureAudio();
      if(!audio) return false;
      // The menu fade has finished by this point. Reuse its already-unlocked
      // element instead of constructing or decoding another long track.
      audio.__mazeFadeToken=(audio.__mazeFadeToken||0)+1;
      audio.pause();
      MediaMusic.setVolume(audio,0);
      this.wanted=true;
      const token=++this.requestToken;
      const {track}=reservation;
      this.prepared=null;
      this.currentTrack=track;
      this.history.push(track.key);
      if(this.history.length>18) this.history.splice(0,this.history.length-18);

      MediaMusic.setSource(audio,track.file);
      MediaMusic.owner='gameplay';
      audio.loop=true;
      MediaMusic.setVolume(audio,0);
      audio.__mazeWanted=true;
      audio.__mazeTargetVolume=SoundManager.volume*this.mixLevel;
      try{ audio.currentTime=0; }catch(_error){}
      const playback=audio.play();
      playback?.then?.(()=>{
        audio.__mazeArmed=true;
        if(this.wanted&&token===this.requestToken)
          MediaMusic.fade(audio,SoundManager.volume*this.mixLevel,0.16);
      }).catch?.(()=>{});
      return true;
    },

    setLevel(value){
      const audio=this.audio;
      if(!audio||MediaMusic.owner!=='gameplay') return;
      const level=Math.max(0,Math.min(1,value));
      audio.__mazeTargetVolume=SoundManager.volume*this.mixLevel*level;
      MediaMusic.setVolume(audio,audio.__mazeTargetVolume);
    },

    beginGameClockFade(startedAt,endsAt){
      this.clockFade={startedAt,endsAt:Math.max(startedAt+1,endsAt)};
    },

    updateGameClock(gameTime){
      const fade=this.clockFade;
      if(!fade) return;
      const phase=Math.max(0,Math.min(
        1,(gameTime-fade.startedAt)/(fade.endsAt-fade.startedAt)
      ));
      const smooth=phase*phase*(3-2*phase);
      this.setLevel(1-smooth);
      if(phase>=1) this.clockFade=null;
    },

    stop(fadeSeconds=0){
      this.wanted=false;
      ++this.requestToken;
      this.clockFade=null;
      const audio=this.audio;
      if(!audio||MediaMusic.owner!=='gameplay') return;
      audio.__mazeWanted=false;
      MediaMusic.fade(audio,0,Math.max(0,fadeSeconds),()=>{
        if(this.wanted||MediaMusic.owner!=='gameplay') return;
        audio.pause();
        try{ audio.currentTime=0; }catch(_error){}
        MediaMusic.owner=null;
      });
    },

    resetRun(fadeSeconds=0){
      if(fadeSeconds>0) this.stop(fadeSeconds);
      else this.stopImmediate();
      this.currentTrack=null;
      this.history.length=0;
      this.trackBags.stillness.length=0;
      this.trackBags.orbit.length=0;
      this.lastTrackKeys.stillness=null;
      this.lastTrackKeys.orbit=null;
      this.assignments.clear();
      this.prepared=null;
    },

    diagnostics(){
      return {
        wanted:this.wanted,
        playing:MediaMusic.owner==='gameplay'&&!!this.audio&&!this.audio.paused,
        mode:'streamed-media-element',
        currentTrack:this.currentTrack?.label||null,
        currentStyle:this.currentTrack?.style||null,
        recentTracks:this.history.slice(-4).map(
          key=>GAMEPLAY_MUSIC_TRACKS.find(track=>track.key===key)?.label||null
        ),
        reservedTrack:this.prepared?.track?.label||null,
        reservedStyle:this.prepared?.style||null,
        tracksRemainingInCycle:{
          stillness:this.trackBags.stillness.length,
          orbit:this.trackBags.orbit.length
        },
        mixLevel:this.mixLevel,
        clockFade:!!this.clockFade,
        readyState:this.audio?.readyState||0,
        error:this.audio?.error?.code||null
      };
    }
  };

  globalThis.__mazeBitersAudioDiagnostics=()=>({
    ...SoundManager.diagnostics(),
    musicVolume:{...MusicSettings.option,
      effectiveVolume:MediaMusic.audio?.volume||0,
      muted:MediaMusic.audio?.muted??(MusicSettings.option.gain===0)},
    menuMusic:MenuMusic.diagnostics(),
    gameplayMusic:GameplayMusic.diagnostics()
  });

  function playSound(name,emitter=null){ SoundManager.play(name,emitter); }

  function playRandomSound(names,emitter=null){
    if(!names || !names.length) return;
    playSound(names[(Math.random()*names.length)|0],emitter);
  }

  const BODY_EAT_SOUNDS=['Tie1','Tie2','Tie3','Tie5','TieEat'];
  const FRUIT_EAT_SOUNDS=['EatFruit1','EatFruit2','EatFruit3'];

  // Progressive controller haptics. The first connected pad belongs to P1
  // and the second to P2, matching the existing dual-gamepad control order.
  // Unsupported browser/controller combinations simply take the silent path.
  const ControllerHaptics=(()=>{
    const playerStates=new Map();

    function stateFor(p){
      const key=p?.id||0;
      let state=playerStates.get(key);
      if(!state){
        state={priority:0,lockedUntil:0,timers:[]};
        playerStates.set(key,state);
      }
      return state;
    }

    function connectedPadFor(p){
      if(!p||p.isAI||typeof navigator.getGamepads!=='function') return null;
      let pads;
      try{ pads=navigator.getGamepads(); }
      catch(_error){ return null; }
      const wantedSlot=p.id===2?1:0;
      let slot=0;
      for(let index=0;index<pads.length;index++){
        const pad=pads[index];
        if(!pad||pad.connected===false) continue;
        if(slot===wantedSlot) return pad;
        slot++;
      }
      return null;
    }

      function playPadRaw(pad,{duration,weakMagnitude,strongMagnitude}){
    if(!pad) return false;
    const actuator=pad.vibrationActuator;
    if(actuator&&typeof actuator.playEffect==='function'){
      try{
        const result=actuator.playEffect('dual-rumble',{
          startDelay:0,
          duration:Math.max(1,duration|0),
          weakMagnitude:Math.max(0,Math.min(1,weakMagnitude||0)),
          strongMagnitude:Math.max(0,Math.min(1,strongMagnitude||0))
        });
        result?.catch?.(()=>{});
        return true;
      }catch(_error){}
    }

    // Keep the existing fallback for older Chromium controller support.
    const legacy=pad.hapticActuators?.[0];
    if(legacy&&typeof legacy.pulse==='function'){
      try{
        const magnitude=Math.max(weakMagnitude||0,strongMagnitude||0);
        const result=legacy.pulse(
          Math.max(0,Math.min(1,magnitude)),
          Math.max(1,duration|0)
        );
        result?.catch?.(()=>{});
        return true;
      }catch(_error){}
    }
    return false;
  }
    function playRaw(p,options){
      return playPadRaw(connectedPadFor(p),options);
    }
  function clearTimers(state){
      state.timers.forEach(timer=>clearTimeout(timer));
      state.timers.length=0;
    }

    function stopPad(pad){
      if(!pad) return;
      const actuator=pad.vibrationActuator;
      if(actuator&&typeof actuator.reset==='function'){
        try{ actuator.reset()?.catch?.(()=>{}); }
        catch(_error){}
      }
      if(actuator&&typeof actuator.playEffect==='function'){
        try{
          actuator.playEffect('dual-rumble',{
            startDelay:0,duration:1,weakMagnitude:0,strongMagnitude:0
          })?.catch?.(()=>{});
        }catch(_error){}
      }
      const legacy=pad.hapticActuators?.[0];
      if(legacy&&typeof legacy.reset==='function'){
        try{ legacy.reset()?.catch?.(()=>{}); }
        catch(_error){}
      }else if(legacy&&typeof legacy.pulse==='function'){
        try{ legacy.pulse(0,1)?.catch?.(()=>{}); }
        catch(_error){}
      }
    }

    function stopAll(){
      for(const state of playerStates.values()){
        clearTimers(state);
        state.priority=0;
        state.lockedUntil=0;
      }
      let pads=null;
      try{ pads=navigator.getGamepads?.()||null; }
      catch(_error){}
      if(!pads) return;
      for(const pad of pads){
        if(pad&&pad.connected!==false) stopPad(pad);
      }
    }

    function pattern(p,steps,priority){
      if(!p||p.isAI||!steps.length) return;
      const now=performance.now();
      const state=stateFor(p);
      if(now<state.lockedUntil&&state.priority>priority) return;
      clearTimers(state);
      state.priority=priority;
      const totalDuration=steps.reduce(
        (latest,step)=>Math.max(latest,step.delay+step.duration),0
      );
      state.lockedUntil=now+totalDuration;
      for(const step of steps){
        const run=()=>playRaw(p,step);
        if(step.delay>0) state.timers.push(setTimeout(run,step.delay));
        else run();
      }
      state.timers.push(setTimeout(()=>{
        if(performance.now()+2>=state.lockedUntil){
          state.priority=0;
          state.lockedUntil=0;
          state.timers.length=0;
        }
      },totalDuration+2));
    }

    function bodyBite(p){
      const state=stateFor(p);
      if(performance.now()<state.lockedUntil&&state.priority>1) return;
      // Short enough to become a crisp rapid series at Extreme speed.
      pattern(p,[{
        delay:0,duration:30,weakMagnitude:0.22,strongMagnitude:0.035
      }],1);
    }

    function headBite(p){
      pattern(p,[{
        delay:0,duration:105,weakMagnitude:0.34,strongMagnitude:0.66
      }],2);
    }

    function menuMove(pad){
      playPadRaw(pad,{duration:28,weakMagnitude:0.16,strongMagnitude:0.02});
    }

    function menuSelect(pad){
      playPadRaw(pad,{duration:95,weakMagnitude:0.30,strongMagnitude:0.46});
    }

    function majorCreatureBite(p){
      pattern(p,[{
        delay:0,duration:165,weakMagnitude:0.42,strongMagnitude:0.82
      }],3);
    }

    function rivalBite(p){
      pattern(p,[{
        delay:0,duration:200,weakMagnitude:0.48,strongMagnitude:0.92
      }],3);
    }

    function powerMode(p){
      // Three rising strokes create a short weak-to-strong charge-up.
      pattern(p,[
        {delay:0,duration:48,weakMagnitude:0.14,strongMagnitude:0.025},
        {delay:64,duration:62,weakMagnitude:0.30,strongMagnitude:0.14},
        {delay:145,duration:105,weakMagnitude:0.52,strongMagnitude:0.62}
      ],3);
    }

    function lifeLost(p){
      // A heavy double impact, deliberately distinct from every bite.
      pattern(p,[
        {delay:0,duration:135,weakMagnitude:0.46,strongMagnitude:0.92},
        {delay:195,duration:220,weakMagnitude:0.36,strongMagnitude:1.0}
      ],4);
    }

    function diagnostics(p){
      const pad=connectedPadFor(p);
      return {
        playerId:p?.id||null,
        gamepad:pad?.id||null,
        supported:!!(
          pad?.vibrationActuator?.playEffect||pad?.hapticActuators?.[0]?.pulse
        )
      };
    }

    return {
      bodyBite,headBite,menuMove,menuSelect,majorCreatureBite,rivalBite,
      powerMode,lifeLost,stopAll,diagnostics
    };
  })();

  function setPaused(next,realTime=performance.now()){
    const requested=!!next;
    if(paused===requested) return false;
    paused=requested;
    pauseStartedAt=requested?realTime:0;
    if(requested) ControllerHaptics.stopAll();
    return true;
  }

  globalThis.__mazeBitersHaptics=playerId=>ControllerHaptics.diagnostics(
    allPlayers().find(candidate=>candidate.id===playerId)||null
  );

  let FontRenderCache=new WeakMap();

  function prepareFontRenderCache(){
    for(const sprite of [...Object.values(FontSprites),...Object.values(RedFontSprites)]){
      FontRenderCache.set(sprite,sprite.__atlasRegion);
    }
  }

  function drawShadedBitmapGlyph(targetContext,sprite,x,y,scale=1){
    const cached=FontRenderCache.get(sprite);
    // Native 128px concept-art font regions reach exactly 128 physical
    // pixels in the doubled gameplay and HUD backing stores.
    return drawAtlasRegion(targetContext,cached,x,y,16*scale,16*scale);
  }

  function drawBitmapText(targetContext,text,x,y,{
    scale=1,
    align='left',
    fontSprites=FontSprites
  }={}){
    const chars=[...String(text)];
    let drawX=x;
    const width=chars.length*16*scale;
    if(align==='center') drawX-=width/2;
    if(align==='right') drawX-=width;
    targetContext.save();
    targetContext.imageSmoothingEnabled=false;
    for(const character of chars){
      if(character!==' '){
        const sprite=fontSprites[character]
          || fontSprites[character.toUpperCase()]
          || fontSprites['?'];
        if(!drawShadedBitmapGlyph(targetContext,sprite,drawX,y,scale)){
          drawSpriteImage(targetContext,sprite,drawX,y,16*scale,16*scale);
        }
      }
      drawX+=16*scale;
    }
    targetContext.restore();
  }

  function drawBitmapTextRuns(targetContext,runs,x,y,{scale=1,align='left'}={}){
    const normalizedRuns=runs
      .map(run=>({
        text:String(run.text??''),
        fontSprites:run.fontSprites||FontSprites
      }))
      .filter(run=>run.text.length);
    const totalWidth=normalizedRuns.reduce(
      (width,run)=>width+[...run.text].length*16*scale,
      0
    );
    let drawX=x;
    if(align==='center') drawX-=totalWidth/2;
    if(align==='right') drawX-=totalWidth;
    for(const run of normalizedRuns){
      drawBitmapText(targetContext,run.text,drawX,y,{
        scale,
        fontSprites:run.fontSprites
      });
      drawX+=[...run.text].length*16*scale;
    }
  }

  function titleMenuLabelRuns(label){
    return String(label)
      .split(/(VS|AI)/g)
      .filter(Boolean)
      .map(text=>({
        text,
        fontSprites:text==='AI'||text==='VS'?RedFontSprites:FontSprites
      }));
  }

  function directionNumber(dir){
    if(dir.y===-1) return 1;
    if(dir.x===1) return 2;
    if(dir.y===1) return 3;
    return 4;
  }

  // Shared immutable direction objects keep the 120-Hz renderer from creating
  // short-lived {x,y} objects for every visible snake segment.
  const RENDER_DIRECTIONS={
    up:Object.freeze({x:0,y:-1}),
    right:Object.freeze({x:1,y:0}),
    down:Object.freeze({x:0,y:1}),
    left:Object.freeze({x:-1,y:0}),
    still:Object.freeze({x:0,y:0})
  };

  function renderDirection(dx,dy){
    if(dx>0) return RENDER_DIRECTIONS.right;
    if(dx<0) return RENDER_DIRECTIONS.left;
    if(dy>0) return RENDER_DIRECTIONS.down;
    if(dy<0) return RENDER_DIRECTIONS.up;
    return RENDER_DIRECTIONS.still;
  }

  function oppositeRenderDirection(direction){
    return renderDirection(-direction.x,-direction.y);
  }

  const OriginalCharacterSpriteCache=Object.create(null);

  function originalCharacterSprite(prefix,dir,mouthOpen){
    const number=directionNumber(dir);
    // Direction 1 shows the back, so it has no mouth animation frame.
    const closeSuffix=number!==1 && !mouthOpen ? 'Close' : '';
    const cacheKey=`${prefix}|${number}|${closeSuffix}`;
    if(Object.prototype.hasOwnProperty.call(OriginalCharacterSpriteCache,cacheKey)){
      return OriginalCharacterSpriteCache[cacheKey];
    }
    const sprite=OriginalSprites[`${prefix}${number}${closeSuffix}`]
      || OriginalSprites[`${prefix}${number}`]
      || null;
    OriginalCharacterSpriteCache[cacheKey]=sprite;
    return sprite;
  }

  function drawOriginalSprite(image,tileX,tileY){
    // The main context is permanently configured for nearest-neighbour sprite
    // rendering. Avoid a save/restore pair around every fruit, egg, hunter,
    // player and skeleton tile; outer alpha/filter states still apply exactly.
    return drawSpriteImage(ctx,image,tileX*TILE,tileY*TILE,TILE,TILE);
  }

  function snakeSpriteSet(s){
    if(s.__renderSpriteSet) return s.__renderSpriteSet;
    const c=(s.color||'').toLowerCase();
    const set=c.includes('66c2ff') || c.includes('blue')
      ? 'Blue'
      : c.includes('ff8873') || c.includes('orange')
        ? 'Orange'
        : c.includes('d66bff') || c.includes('ff5fa2') || c.includes('pink')
          ? 'Pink'
          : c.includes('35e55b') || c.includes('green')
            ? 'Green'
            : 'Yellow';
    s.__renderSpriteSet=set;
    return set;
  }

  function snakeSuffix(set){
    if(set==='Blue') return '_Blue';
    if(set==='Pink') return '_Pink';
    if(set==='Orange') return '_Orange';
    if(set==='Green') return '_Green';
    return '';
  }

  function usesModernSnake(s){
    if(s.__usesModernSnake!==undefined) return s.__usesModernSnake;
    const set=snakeSpriteSet(s);
    s.__usesModernSnake=
      set==='Yellow'||set==='Green'||set==='Blue'||set==='Pink'||set==='Orange';
    return s.__usesModernSnake;
  }

  function modernSnakeSprite(s,semantic,number=null){
    let name='';
    if(semantic==='HEAD') name=`modernHead${number}`;
    else if(semantic==='UNIQUE_HEAD') name=`modernHead${number}Unique`;
    else if(semantic==='BODY_DIRECTIONAL') name=`modernBody${number}`;
    else if(semantic==='TURN') name=`modernTurn${number}`;
    else if(semantic==='TAIL') name=`modernTail${number}`;
    return ModernSnakeSprites[`${name}${snakeSuffix(snakeSpriteSet(s))}`]||null;
  }

  function snakeRenderSprite(s,semantic,number=null){
    const cache=s.__renderSpriteCache ||
      (s.__renderSpriteCache=Object.create(null));
    let semanticSlot=0;
    if(semantic==='HEAD') semanticSlot=1;
    else if(semantic==='UNIQUE_HEAD') semanticSlot=2;
    else if(semantic==='BODY_DIRECTIONAL') semanticSlot=3;
    else if(semantic==='BODY_VERTICAL') semanticSlot=4;
    else if(semantic==='BODY_HORIZONTAL') semanticSlot=5;
    else if(semantic==='TURN') semanticSlot=6;
    else if(semantic==='TAIL') semanticSlot=7;
    // Numeric slots avoid creating a temporary string for every snake segment
    // on every rendered frame. The slower name lookup runs only once per slot.
    const cacheKey=semanticSlot*5+(number===null?0:number);
    if(cache[cacheKey]!==undefined) return cache[cacheKey];
    const sprite=modernSnakeSprite(s,semantic,number) ||
      originalSnakeSprite(s,semantic,number);
    cache[cacheKey]=sprite;
    return sprite;
  }

  function originalSnakeSprite(s, semantic, number=null){
    const cache=s.__renderSpriteCache ||
      (s.__renderSpriteCache=Object.create(null));
    const cacheKey=`${semantic}|${number??''}`;
    if(Object.prototype.hasOwnProperty.call(cache,cacheKey)){
      return cache[cacheKey];
    }
    const suffix=snakeSuffix(snakeSpriteSet(s));
    let name='';

    if(semantic==='HEAD'){
      name=`snakeHead${number}${suffix}`;
    }else if(semantic==='UNIQUE_HEAD'){
      name=`snakeHead${number}Unique${suffix}`;
    }else if(semantic==='BODY_VERTICAL'){
      name=`snakeBody1&3${suffix}`;
    }else if(semantic==='BODY_HORIZONTAL'){
      name=`snakeBody2&4${suffix}`;
    }else if(semantic==='TURN'){
      name=`snakeTurn${number}${suffix}`;
    }else if(semantic==='TAIL'){
      name=`snakeTie${number}${suffix}`;
    }

    const sprite=OriginalSprites[name] || null;
    cache[cacheKey]=sprite;
    return sprite;
  }

  // Two native atlas frames. Frame 0 keeps the more widely opened
  // pincers; frame 1 alternates the legs and slightly closes the pincers.
  const ScorpionSpritePairCache=[[],[]];

  function scorpionSpritePair(number,animationFrame=0){
    const frame=animationFrame&1;
    if(ScorpionSpritePairCache[frame][number]){
      return ScorpionSpritePairCache[frame][number];
    }
    const suffix=frame?'Walk':'';
    const pair={
      head:
        ModernScorpionSprites[`ScorpioHead${number}${suffix}`] ||
        ModernScorpionSprites[`ScorpioHead${number}`] ||
        OriginalSprites[`ScorpioHead${number}`] ||
        OriginalSprites[`ScorpionHead${number}`],
      tail:
        ModernScorpionSprites[`ScorpioTie${number}${suffix}`] ||
        ModernScorpionSprites[`ScorpioTie${number}`] ||
        OriginalSprites[`ScorpioTie${number}`] ||
        OriginalSprites[`ScorpioTail${number}`] ||
        OriginalSprites[`ScorpionTie${number}`]
    };
    ScorpionSpritePairCache[frame][number]=pair;
    return pair;
  }

  // Longer modern snakes keep a stationary first body segment while
  // retreating, so crop only the portion covered by the moving head. A
  // two-cell snake keeps its original independent tail-first animation and
  // uses the prebuilt head occlusion silhouette instead. The crop reads the
  // isolated native sprite cell, so fractional source rectangles cannot reach
  // a neighbouring atlas cell.
  function drawClippedModernHeadFollower(
    s,image,tileX,tileY,segmentIndex,totalLength,pathDirection,t
  ){
    if(!s.reversing || !usesModernSnake(s) ||
       segmentIndex!==1 || totalLength===2) return false;
    const head=s.body[0],follower=s.body[1];
    if(!head||!follower) return false;
    const dx=follower.x-head.x,dy=follower.y-head.y;
    if(Math.abs(dx)+Math.abs(dy)!==1) return false;

    const headVisual=snakeSegmentVisualPosition(
      s,0,t,s.renderHeadPosition||(s.renderHeadPosition={x:0,y:0})
    );
    let overlap=(headVisual.x-head.x)*dx+(headVisual.y-head.y)*dy;
    overlap=Math.max(0,Math.min(1,overlap));
    if(overlap<=0.0001) return false;

    const region=image?.__atlasRegion;
    if(!region) return false;
    if(overlap>=0.9999) return true;

    const [atlasName,sx,sy,sw=64,sh=64]=region;
    const isolated=IsolatedSnakeSpriteCache.get(region);
    const atlas=RenderAtlases[atlasName];
    if(!isolated&&!atlasImageReady(atlasName)) return false;

    const sourceImage=isolated||atlas;
    let sourceX=isolated?0:sx;
    let sourceY=isolated?0:sy;
    let sourceWidth=sw,sourceHeight=sh;
    let destX=tileX*TILE,destY=tileY*TILE;
    let destWidth=TILE,destHeight=TILE;
    if(dx>0){
      sourceX+=sw*overlap;
      sourceWidth*=1-overlap;
      destX+=TILE*overlap;
      destWidth*=1-overlap;
    }else if(dx<0){
      sourceWidth*=1-overlap;
      destWidth*=1-overlap;
    }else if(dy>0){
      sourceY+=sh*overlap;
      sourceHeight*=1-overlap;
      destY+=TILE*overlap;
      destHeight*=1-overlap;
    }else{
      sourceHeight*=1-overlap;
      destHeight*=1-overlap;
    }

    ctx.drawImage(
      sourceImage,
      sourceX,sourceY,sourceWidth,sourceHeight,
      destX,destY,destWidth,destHeight
    );
    return true;
  }

  // When a tail-led retreat turns onto a perpendicular cell, the new modern
  // tail sprite must emerge through that cell's shared edge. Drawing the full
  // sprite at its interpolated centre lets its sharp tip briefly protrude from
  // the outside of the old corner. Clip only this 90-degree transition to the
  // destination cell: the fixed corner remains intact and the tail is revealed
  // progressively from the boundary to its final position. Straight retreat
  // keeps the original unrestricted slide.
  function drawClippedReverseTailTurn(
    s,image,visual,segmentIndex,bodyToTail,color
  ){
    if(!s.reversing || !s.reverseTailTurnReveal ||
       !usesModernSnake(s) || segmentIndex<1) return false;
    const oldTail=s.body[segmentIndex-1];
    const newTail=s.body[segmentIndex];
    if(!oldTail || !newTail) return false;

    const newDx=newTail.x-oldTail.x;
    const newDy=newTail.y-oldTail.y;
    // recordSnakeVisualStep has already validated and latched the corner.
    // Keep these checks as a defensive guard for a shortened snake whose
    // segment arrays changed between the logical update and this frame.
    if(Math.abs(newDx)+Math.abs(newDy)!==1) return false;

    ctx.save();
    ctx.beginPath();
    ctx.rect(newTail.x*TILE,newTail.y*TILE,TILE,TILE);
    ctx.clip();
    if(!drawSpriteImage(
      ctx,image,visual.x*TILE,visual.y*TILE,TILE,TILE
    )){
      drawSnakeTail(
        visual.x*TILE,
        visual.y*TILE,
        bodyToTail,
        color
      );
    }
    ctx.restore();
    return true;
  }

  function snakeTurnNumber(a,b){
    const left  = a.x<0 || b.x<0;
    const right = a.x>0 || b.x>0;
    const up    = a.y<0 || b.y<0;
    const down  = a.y>0 || b.y>0;

    // Original Palm numbering:
    // 1 left-up, 2 up-right, 3 right-down, 4 down-left.
    if(left && up) return 1;
    if(up && right) return 2;
    if(right && down) return 3;
    return 4;
  }


  // Emergency fallback only. It is dimension-derived so a failed procedural
  // attempt can never restore a stale 32x24 board inside the 36x25 world.
  const CLASSIC_MAZE=Array.from({length:ROWS},(_,y)=>
    Array.from({length:COLS},(_,x)=>
      x===0||y===0||x===COLS-1||y===ROWS-1?'#':'.'
    ).join('')
  );
  let maze=[...CLASSIC_MAZE];
  let mazeRevision=0;
  let mazeRunSeed=0x48565052;
  const MAZE_COLOR_THEMES=[
    {
      name:'green',
      hue:132,
      filter:'none',
      fallbackOuter:'#35a854',
      fallbackInner:'#0d5428'
    },
    {
      name:'orange',
      hue:24,
      filter:'hue-rotate(270deg) saturate(1.18) brightness(1.06)',
      fallbackOuter:'#d86b24',
      fallbackInner:'#71300b'
    },
    {
      name:'blue-violet',
      hue:248,
      filter:'hue-rotate(135deg) saturate(1.22) brightness(1.08)',
      fallbackOuter:'#6857e8',
      fallbackInner:'#25166f'
    },
    {
      name:'ruby-red',
      hue:348,
      filter:'hue-rotate(230deg) saturate(1.24) brightness(1.06)',
      fallbackOuter:'#d94b61',
      fallbackInner:'#6d1427'
    },
    {
      name:'turquoise',
      hue:177,
      filter:'hue-rotate(65deg) saturate(1.16) brightness(1.08)',
      fallbackOuter:'#24b7b0',
      fallbackInner:'#075b59'
    },
    {
      name:'gold',
      hue:44,
      filter:'hue-rotate(290deg) saturate(1.12) brightness(1.08)',
      fallbackOuter:'#d7ad2f',
      fallbackInner:'#6c4d08'
    }
  ];
  let mazeColorTheme=MAZE_COLOR_THEMES[0];
  const MazeRenderCache=new Map();
  const ConceptMazeRenderCache=new Map();

  const PLAYER_STARTS=[
    {x:1,y:1,dir:{x:0,y:1}},
    {x:COLS-2,y:ROWS-2,dir:{x:0,y:-1}},
    {x:1,y:ROWS-2,dir:{x:0,y:-1}}
  ];

  function seededMazeRandom(seed){
    let state=seed>>>0;
    return ()=>{
      state=(state+0x6D2B79F5)>>>0;
      let value=state;
      value=Math.imul(value^(value>>>15),value|1);
      value^=value+Math.imul(value^(value>>>7),value|61);
      return ((value^(value>>>14))>>>0)/4294967296;
    };
  }

  function levelMazeSeed(currentLevel,attempt=0){
    return (
      mazeRunSeed^
      Math.imul(currentLevel+1,0x9E3779B1)^
      Math.imul(attempt+1,0x85EBCA6B)
    )>>>0;
  }

  // Absurdity begins almost invisibly and reaches 98% at level 30. It then
  // climbs much more aggressively all the way to 260% at level 100, so the
  // final generator test is intentionally brutal rather than plateauing.
  function mazeAbsurdityForLevel(currentLevel){
    const stage=Math.max(1,currentLevel);
    const progress=Math.max(0,Math.min(1,(stage-1)/29));
    const eased=progress*progress*(3-2*progress);
    const base=eased*0.98;
    if(stage<=30) return base;
    const toHundred=Math.pow(Math.min(1,(stage-30)/70),0.82)*1.62;
    const beyondHundred=stage>100
      ? Math.log1p((stage-100)/20)*0.30
      : 0;
    return Math.min(3.25,0.98+toHundred+beyondHundred);
  }

  function mazeUltraAbsurdityForLevel(currentLevel){
    const progress=Math.max(0,Math.min(1,(Math.max(1,currentLevel)-30)/70));
    return progress*progress*(3-2*progress);
  }

  // Side absurdity starts after level 20. It spreads the strange structures
  // away from the traditional centre and continues growing after level 30.
  function mazeEdgeAbsurdityForLevel(currentLevel){
    const stage=Math.max(1,currentLevel);
    if(stage<=20) return 0;
    const spread=1-Math.exp(-(stage-20)/22);
    const overflow=Math.max(0,mazeAbsurdityForLevel(stage)-0.98);
    return Math.min(2.2,spread+overflow*0.60);
  }

  function circularHueDistance(a,b){
    const difference=Math.abs(a-b)%360;
    return Math.min(difference,360-difference);
  }

  function mazeColorThemeIndexForLevel(currentLevel){
    const stage=Math.max(1,currentLevel|0);
    const openingRandom=seededMazeRandom(levelMazeSeed(1,733));
    const history=[Math.floor(openingRandom()*MAZE_COLOR_THEMES.length)];
    const minimumContrast=55;

    for(let current=2;current<=stage;current++){
      const recent=history.slice(-2);
      const unused=MAZE_COLOR_THEMES.map((_,index)=>index)
        .filter(index=>!recent.includes(index));
      const contrasting=unused.filter(index=>recent.every(previous=>
        circularHueDistance(
          MAZE_COLOR_THEMES[index].hue,
          MAZE_COLOR_THEMES[previous].hue
        )>=minimumContrast
      ));
      const candidates=contrasting.length
        ? contrasting
        : unused.slice().sort((a,b)=>{
          const distance=index=>Math.min(...recent.map(previous=>
            circularHueDistance(
              MAZE_COLOR_THEMES[index].hue,
              MAZE_COLOR_THEMES[previous].hue
            )
          ));
          return distance(b)-distance(a);
        }).slice(0,Math.max(1,Math.ceil(unused.length/2)));
      const random=seededMazeRandom(levelMazeSeed(current,733));
      history.push(candidates[Math.floor(random()*candidates.length)]);
    }
    return history[history.length-1];
  }

  function mazeColorThemeForLevel(currentLevel){
    return MAZE_COLOR_THEMES[mazeColorThemeIndexForLevel(currentLevel)];
  }

  function mazeFloorIsConnected(grid){
    const start=PLAYER_STARTS[0];
    if(grid[start.y][start.x]!=='.') return false;
    const seen=new Uint8Array(COLS*ROWS);
    const queue=[{x:start.x,y:start.y}];
    seen[start.y*COLS+start.x]=1;
    let read=0,visited=0,total=0;
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++) if(grid[y][x]==='.') total++;
    }
    while(read<queue.length){
      const cell=queue[read++];
      visited++;
      for(const direction of [
        {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}
      ]){
        const x=cell.x+direction.x,y=cell.y+direction.y;
        if(x<0||y<0||x>=COLS||y>=ROWS||grid[y][x]!=='.') continue;
        const index=y*COLS+x;
        if(seen[index]) continue;
        seen[index]=1;
        queue.push({x,y});
      }
    }
    // Dense tunnel-first maps intentionally use much less open floor than the
    // older obstacle-in-an-open-room generator.
    return visited===total&&total>=COLS*ROWS*0.32;
  }

  let lastMazePatternStats={
    level:1,diagonalCorridors:0,wideDiagonalCorridors:0,
    cornerDiagonalStructures:0,cornerCoverageMask:0,
    diagonalPointRuns:0,orthogonalPointRuns:0,lateralPointRuns:0,
    diagonalIsolatedWalls:0,preservedPointCells:0,
    fullyOrbitablePointCells:0
  };
  function mazePatternStats(){ return {...lastMazePatternStats}; }


  function generateMazeForLevel(currentLevel,candidateAttempt=91){
    // Native dimension-derived large-screen generator; no compact-map routing remains.
    const stage=Math.max(1,currentLevel);
    const difficultyStage=difficultyAdjustedLevel(stage);
    const absurdity=mazeAbsurdityForLevel(difficultyStage);
    const edgeAbsurdity=mazeEdgeAbsurdityForLevel(difficultyStage);
    const ultraAbsurdity=mazeUltraAbsurdityForLevel(difficultyStage);
    lastMazePatternStats={
      level:stage,diagonalCorridors:0,wideDiagonalCorridors:0,
      cornerDiagonalStructures:0,cornerCoverageMask:0,
      diagonalPointRuns:0,orthogonalPointRuns:0,lateralPointRuns:0,
      diagonalIsolatedWalls:0,preservedPointCells:0,
      fullyOrbitablePointCells:0
    };
    const random=seededMazeRandom(levelMazeSeed(stage,candidateAttempt));
    const symmetryStyles=['rotational','left-right','top-bottom','four-way','asymmetric'];
    // Every level independently selects its large-scale structure. The level
    // seed keeps the selection stable during play. Rising absurdity gradually
    // erodes exact symmetry; by level 30 almost every map is structurally
    // asymmetric even though recognisable mirrored fragments can remain.
    const styleOffset=Math.floor(random()*symmetryStyles.length);
    const baseSymmetryStyle=symmetryStyles[styleOffset];
    const asymmetryOverride=absurdity>0&&
      random()<Math.min(0.97,absurdity*0.88);
    const symmetryStyle=asymmetryOverride?'asymmetric':baseSymmetryStyle;
    const integer=(minimum,maximum)=>
      minimum+Math.floor(random()*(maximum-minimum+1));
    // Wide-space features use half of their former budget. Odd counts retain
    // one extra feature on half of the seeded layouts, producing an exact 50%
    // reduction over many levels without removing a feature family entirely.
    const halfFeatureCount=count=>
      Math.floor(count/2)+((count&1)&&random()<0.5?1:0);
    const grid=Array.from({length:ROWS},()=>Array(COLS).fill('#'));
    const inside=(x,y)=>x>0&&y>0&&x<COLS-1&&y<ROWS-1;
    const mirrorOf=(x,y)=>({x:COLS-1-x,y:ROWS-1-y});
    // Once a continuous diagonal border is accepted, later decorative passes
    // may add neighbours but must never punch a point-like gap into that line.
    const protectedDiagonalCorridorWalls=new Set();
    const protectedAbsurdPointWalls=new Set();
    const protectedOrthogonalPointWalls=new Set();
    const openRaw=(x,y)=>{
      const key=`${x},${y}`;
      if(inside(x,y)&&!protectedDiagonalCorridorWalls.has(key)&&
         !protectedAbsurdPointWalls.has(key))
        grid[y][x]='.';
    };
    const wallRaw=(x,y)=>{ if(inside(x,y)) grid[y][x]='#'; };
    const openPair=(x,y)=>{
      openRaw(x,y);
      const mirror=mirrorOf(x,y);
      openRaw(mirror.x,mirror.y);
    };
    const wallPair=(x,y)=>{
      wallRaw(x,y);
      const mirror=mirrorOf(x,y);
      wallRaw(mirror.x,mirror.y);
    };
    const featureCopies=(x,y)=>{
      const copies=[{x,y}];
      if(symmetryStyle==='rotational') copies.push(mirrorOf(x,y));
      else if(symmetryStyle==='left-right') copies.push({x:COLS-1-x,y});
      else if(symmetryStyle==='top-bottom') copies.push({x,y:ROWS-1-y});
      else if(symmetryStyle==='four-way'){
        copies.push(
          {x:COLS-1-x,y},
          {x,y:ROWS-1-y},
          mirrorOf(x,y)
        );
      }
      const unique=new Map();
      copies.forEach(cell=>{
        if(inside(cell.x,cell.y)) unique.set(`${cell.x},${cell.y}`,cell);
      });
      return [...unique.values()];
    };
    const openFeature=(x,y)=>featureCopies(x,y).forEach(cell=>openRaw(cell.x,cell.y));
    const wallFeature=(x,y)=>featureCopies(x,y).forEach(cell=>wallRaw(cell.x,cell.y));
    const reservedFeatureCells=new Set();
    const claimFeatureZone=(x,y,width,height,margin=1)=>{
      const expanded=[];
      for(let dy=-margin;dy<height+margin;dy++){
        for(let dx=-margin;dx<width+margin;dx++){
          featureCopies(x+dx,y+dy).forEach(cell=>
            expanded.push(`${cell.x},${cell.y}`)
          );
        }
      }
      if(expanded.some(key=>reservedFeatureCells.has(key))) return false;
      expanded.forEach(key=>reservedFeatureCells.add(key));
      return true;
    };
    const claimRawFeatureZone=(x,y,width,height,margin=1)=>{
      const expanded=[];
      for(let dy=-margin;dy<height+margin;dy++){
        for(let dx=-margin;dx<width+margin;dx++){
          const cellX=x+dx,cellY=y+dy;
          if(inside(cellX,cellY)) expanded.push(`${cellX},${cellY}`);
        }
      }
      if(expanded.some(key=>reservedFeatureCells.has(key))) return false;
      expanded.forEach(key=>reservedFeatureCells.add(key));
      return true;
    };
    const featureZoneY=height=>{
      if(symmetryStyle==='top-bottom'||symmetryStyle==='four-way'){
        return integer(4,Math.max(4,Math.floor(ROWS/2)-height-1));
      }
      return integer(4,Math.max(4,ROWS-5-height));
    };

    // Build a perfect one-cell-wide maze in the left half. Mirroring the
    // carved half produces an equally difficult territory for Player 2.
    // Scale the carved half with the board. On 36x25 this becomes an 8x12
    // logical maze, mirrored around two centre columns and one centre row.
    const logicalColumns=Math.floor((COLS-4)/4);
    const logicalRows=Math.floor((ROWS-1)/2);
    const leftMazeMaxX=1+(logicalColumns-1)*2;
    const rightMazeMinX=COLS-1-leftMazeMaxX;
    const visited=new Uint8Array(logicalColumns*logicalRows);
    const stack=[{x:0,y:0}];
    visited[0]=1;
    openRaw(1,1);
    while(stack.length){
      const current=stack[stack.length-1];
      const choices=[];
      for(const direction of [
        {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}
      ]){
        const x=current.x+direction.x,y=current.y+direction.y;
        if(x<0||y<0||x>=logicalColumns||y>=logicalRows) continue;
        if(!visited[y*logicalColumns+x]) choices.push({x,y});
      }
      if(!choices.length){
        stack.pop();
        continue;
      }
      const next=choices[(random()*choices.length)|0];
      const currentGrid={x:1+current.x*2,y:1+current.y*2};
      const nextGrid={x:1+next.x*2,y:1+next.y*2};
      openRaw((currentGrid.x+nextGrid.x)/2,(currentGrid.y+nextGrid.y)/2);
      openRaw(nextGrid.x,nextGrid.y);
      visited[next.y*logicalColumns+next.x]=1;
      stack.push(next);
    }

    // Copy every left-side tunnel through the centre of the board. The two
    // halves use opposite pixel parity, preserving exact 180-degree symmetry
    // without turning the whole board into a double-width corridor field.
    const leftSnapshot=grid.map(row=>row.slice());
    for(let y=1;y<ROWS-1;y++){
      for(let x=1;x<=leftMazeMaxX;x++){
        if(leftSnapshot[y][x]==='.'){
          const mirror=mirrorOf(x,y);
          openRaw(mirror.x,mirror.y);
        }
      }
    }

    // Two distant, mirrored zig-zag bridges connect the halves. They provide
    // global access without the dangerous central 2x2 room of the old map.
    const bridgeY=5+integer(0,2)*2;
    for(let x=leftMazeMaxX;x<=rightMazeMinX;x++) openPair(x,bridgeY);
    openPair(rightMazeMinX,bridgeY+1);

    const extraBridgeCount=symmetryStyle==='rotational'
      ? 0
      : symmetryStyle==='four-way'
        ? 2
        : 1;
    const extraBridgeRows=[3,Math.floor((ROWS-1)/2),ROWS-6];
    for(let bridge=0;bridge<extraBridgeCount;bridge++){
      const y=extraBridgeRows[(bridge+styleOffset)%extraBridgeRows.length];
      if(symmetryStyle==='asymmetric'){
        for(let x=leftMazeMaxX;x<=rightMazeMinX;x++) openRaw(x,y);
        openRaw(rightMazeMinX,y+1);
      }else{
        for(let x=leftMazeMaxX;x<=rightMazeMinX;x++) openPair(x,y);
        openPair(rightMazeMinX,y+1);
      }
    }

    // Change the large-scale structural symmetry, not merely the decorative
    // rooms. The asymmetric mode deliberately keeps the rotational base and
    // lets its later one-sided features break the resemblance.
    const structuralSnapshot=grid.map(row=>row.slice());
    if(symmetryStyle==='left-right'){
      for(let y=1;y<ROWS-1;y++){
        for(let x=1;x<COLS/2;x++)
          grid[y][COLS-1-x]=structuralSnapshot[y][x];
      }
    }else if(symmetryStyle==='top-bottom'){
      for(let y=1;y<ROWS/2;y++){
        for(let x=1;x<COLS-1;x++)
          grid[ROWS-1-y][x]=structuralSnapshot[y][x];
      }
    }else if(symmetryStyle==='four-way'){
      for(let y=1;y<ROWS/2;y++){
        for(let x=1;x<COLS/2;x++){
          const value=structuralSnapshot[y][x];
          grid[y][x]=value;
          grid[y][COLS-1-x]=value;
          grid[ROWS-1-y][x]=value;
          grid[ROWS-1-y][COLS-1-x]=value;
        }
      }
    }

    // Each spawn is a narrow L-shaped junction with two independent exits.
    // It provides an immediate escape choice without creating a 2x2 room.
    const p1Safe=[
      {x:1,y:1},{x:2,y:1},{x:3,y:1},
      {x:1,y:2},{x:1,y:3}
    ];
    const p2Safe=[
      {x:COLS-2,y:ROWS-2},{x:COLS-3,y:ROWS-2},{x:COLS-4,y:ROWS-2},
      {x:COLS-2,y:ROWS-3},{x:COLS-2,y:ROWS-4}
    ];
    const p3Safe=[
      {x:1,y:ROWS-2},{x:2,y:ROWS-2},{x:3,y:ROWS-2},
      {x:1,y:ROWS-3},{x:1,y:ROWS-4}
    ];
    [...p1Safe,...p2Safe,...p3Safe].forEach(cell=>openRaw(cell.x,cell.y));
    // Protect the five deliberately opened cells at each start. Neighbouring
    // random tunnels may still be narrowed by the final room-size guard, so
    // they cannot merge with the spawn pocket into an accidental 2x4 hall.
    const protectedStartCells=new Set(
      [...p1Safe,...p2Safe,...p3Safe].map(cell=>`${cell.x},${cell.y}`)
    );

    // Some four-way and horizontal reflections can cut a pre-existing route.
    // Reconnect any orphaned tunnel with a narrow style-aware corridor.
    for(let repair=0;repair<20&&!mazeFloorIsConnected(grid);repair++){
      const seen=new Uint8Array(COLS*ROWS);
      const queue=[{...PLAYER_STARTS[0]}];
      seen[PLAYER_STARTS[0].y*COLS+PLAYER_STARTS[0].x]=1;
      let read=0;
      while(read<queue.length){
        const cell=queue[read++];
        for(const direction of [
          {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}
        ]){
          const x=cell.x+direction.x,y=cell.y+direction.y;
          if(!inside(x,y)||grid[y][x]!=='.') continue;
          const index=y*COLS+x;
          if(seen[index]) continue;
          seen[index]=1;
          queue.push({x,y});
        }
      }
      let orphan=null;
      for(let y=1;y<ROWS-1&&!orphan;y++){
        for(let x=1;x<COLS-1;x++){
          if(grid[y][x]==='.'&&!seen[y*COLS+x]){
            orphan={x,y};
            break;
          }
        }
      }
      if(!orphan) break;
      let nearest=null,nearestDistance=Infinity;
      for(let y=1;y<ROWS-1;y++){
        for(let x=1;x<COLS-1;x++){
          if(!seen[y*COLS+x]) continue;
          const distance=Math.abs(x-orphan.x)+Math.abs(y-orphan.y);
          if(distance<nearestDistance){
            nearest={x,y};
            nearestDistance=distance;
          }
        }
      }
      if(!nearest) break;
      let x=orphan.x,y=orphan.y;
      const carveHorizontal=()=>{
        while(x!==nearest.x){
          openFeature(x,y);
          x+=Math.sign(nearest.x-x);
        }
        openFeature(x,y);
      };
      const carveVertical=()=>{
        while(y!==nearest.y){
          openFeature(x,y);
          y+=Math.sign(nearest.y-y);
        }
        openFeature(x,y);
      };
      if(random()<0.5){ carveHorizontal(); carveVertical(); }
      else{ carveVertical(); carveHorizontal(); }
    }

    const plannedPairCells=(x,y)=>{
      const mirror=mirrorOf(x,y);
      const map=new Map();
      if(inside(x,y)) map.set(`${x},${y}`,{x,y});
      if(inside(mirror.x,mirror.y))
        map.set(`${mirror.x},${mirror.y}`,mirror);
      return [...map.values()];
    };
    const plannedFeatureCells=(x,y)=>featureCopies(x,y);
    const featureCreatesTwoByTwo=(x,y)=>{
      const planned=plannedFeatureCells(x,y);
      const plannedKeys=new Set(planned.map(cell=>`${cell.x},${cell.y}`));
      const willBeFloor=(floorX,floorY)=>
        inside(floorX,floorY)&&
        (grid[floorY][floorX]==='.'||plannedKeys.has(`${floorX},${floorY}`));
      return planned.some(cell=>{
        for(const offsetY of [-1,0]){
          for(const offsetX of [-1,0]){
            let allFloor=true;
            for(let dy=0;dy<2;dy++){
              for(let dx=0;dx<2;dx++){
                if(!willBeFloor(cell.x+offsetX+dx,cell.y+offsetY+dy))
                  allFloor=false;
              }
            }
            if(allFloor) return true;
          }
        }
        return false;
      });
    };

    // Levels two and three gain only narrow shortcuts. They introduce route
    // choice while still forbidding two-cell-wide open patches.
    const shortcutPairs=Math.min(14,Math.max(0,stage-1)*2);
    const candidates=[];
    for(let y=1;y<ROWS-1;y++){
      for(let x=1;x<COLS-1;x++){
        if(grid[y][x]!== '#') continue;
        const horizontal=grid[y][x-1]==='.'&&grid[y][x+1]==='.';
        const vertical=grid[y-1][x]==='.'&&grid[y+1][x]==='.';
        if(horizontal||vertical) candidates.push({x,y});
      }
    }
    for(let i=candidates.length-1;i>0;i--){
      const swap=(random()*(i+1))|0;
      [candidates[i],candidates[swap]]=[candidates[swap],candidates[i]];
    }
    let shortcuts=0;
    for(const candidate of candidates){
      if(shortcuts>=shortcutPairs) break;
      if(stage<4&&featureCreatesTwoByTwo(candidate.x,candidate.y)) continue;
      openFeature(candidate.x,candidate.y);
      shortcuts++;
    }

    // From level four onward, a small number of deliberate double passages
    // appear. They become longer and more numerous only on later levels.
    const doublePassagePairs=stage<4
      ? 0
      : halfFeatureCount(Math.min(3,1+Math.floor((stage-4)/3)));
    for(let passage=0;passage<doublePassagePairs;passage++){
      for(let placement=0;placement<40;placement++){
        const horizontal=random()<0.5;
        const width=horizontal?3:2;
        const height=horizontal?2:3;
        const startX=integer(4,11);
        const startY=featureZoneY(height);
        if(!claimFeatureZone(startX,startY,width,height,1)) continue;
        for(let dy=0;dy<height;dy++){
          for(let dx=0;dx<width;dx++)
            openFeature(startX+dx,startY+dy);
        }
        break;
      }
    }

    // Before points become an intentional feature, remove any accidental
    // isolated wall created by a bridge or shortcut. Prefer attaching it to a
    // neighbouring wall; accept the change only while all tunnels stay open.
    if(stage<5){
      for(let pass=0;pass<24;pass++){
        let isolated=null;
        for(let y=1;y<ROWS-1&&!isolated;y++){
          for(let x=1;x<COLS-1;x++){
            if(grid[y][x]!=='#') continue;
            const hasWallNeighbour=[
              {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}
            ].some(direction=>grid[y+direction.y][x+direction.x]==='#');
            if(!hasWallNeighbour){ isolated={x,y}; break; }
          }
        }
        if(!isolated) break;

        const directions=[
          {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}
        ];
        for(let i=directions.length-1;i>0;i--){
          const swap=(random()*(i+1))|0;
          [directions[i],directions[swap]]=[directions[swap],directions[i]];
        }
        let attached=false;
        for(const direction of directions){
          const x=isolated.x+direction.x,y=isolated.y+direction.y;
          if(protectedStartCells.has(`${x},${y}`)) continue;
          if(grid[y][x]!=='.') continue;
          const changed=plannedPairCells(x,y).map(cell=>({
            ...cell,
            previous:grid[cell.y][cell.x]
          }));
          wallPair(x,y);
          if(mazeFloorIsConnected(grid)){
            attached=true;
            break;
          }
          changed.forEach(cell=>{ grid[cell.y][cell.x]=cell.previous; });
        }
        // This is a rare safety fallback. Removing the point cannot disconnect
        // anything and is still preferable to an early orbit obstacle.
        if(!attached) openPair(isolated.x,isolated.y);
      }
    }

    // Points are introduced later by opening a safe ring and retaining its
    // centre wall. They can be orbited, but never block access to a tunnel.
    const pointPairs=stage<5?0:Math.min(3,1+Math.floor((stage-5)/2));
    for(let point=0;point<pointPairs;point++){
      for(let placement=0;placement<60;placement++){
        const centreX=integer(5,11),startY=featureZoneY(3);
        const centreY=startY+1;
        if(!claimFeatureZone(centreX-1,startY,3,3,1)) continue;
        for(let dy=-1;dy<=1;dy++){
          for(let dx=-1;dx<=1;dx++) openFeature(centreX+dx,centreY+dy);
        }
        wallFeature(centreX,centreY);
        break;
      }
    }

    // Open rooms remain a difficulty feature, but every deliberately cleared
    // room is capped at 3x3 so that a snake can still be approached and eaten.
    if(stage>=6){
      const arenaPairs=halfFeatureCount(
        Math.min(2,1+Math.floor((stage-6)/4))
      );
      for(let arena=0;arena<arenaPairs;arena++){
        for(let placement=0;placement<60;placement++){
          const startX=integer(4,10),startY=featureZoneY(3);
          if(!claimFeatureZone(startX,startY,3,3,1)) continue;
          for(let dy=0;dy<3;dy++){
            for(let dx=0;dx<3;dx++) openFeature(startX+dx,startY+dy);
          }
          break;
        }
      }
    }

    // Late levels keep the popular orbit points, but use separate 3x3 pockets
    // instead of one almost unplayable open gallery.
    if(stage>=9){
      for(let pocket=0;pocket<2;pocket++){
        for(let placement=0;placement<80;placement++){
          const centreX=integer(5,11),startY=featureZoneY(3);
          const centreY=startY+1;
          if(!claimFeatureZone(centreX-1,startY,3,3,1)) continue;
          for(let dy=-1;dy<=1;dy++){
            for(let dx=-1;dx<=1;dx++) openFeature(centreX+dx,centreY+dy);
          }
          wallFeature(centreX,centreY);
          break;
        }
      }
    }

    // Experimental late-game "absurdity" pass. All wall-producing mutations
    // are transactional: a shape is retained only when every floor cell is
    // still connected to every other floor cell. Floor-only mutations cannot
    // disconnect the graph and are later constrained by the opening limiter.
    const gridSnapshot=()=>grid.map(row=>row.slice());
    const restoreGrid=snapshot=>{
      for(let y=0;y<ROWS;y++) grid[y]=snapshot[y].slice();
    };
    const tryConnectedMutation=mutator=>{
      const snapshot=gridSnapshot();
      mutator();
      if(mazeFloorIsConnected(grid)) return true;
      restoreGrid(snapshot);
      return false;
    };
    const nearPlayerStart=(x,y,margin=4)=>PLAYER_STARTS.some(start=>
      Math.abs(start.x-x)<=margin&&Math.abs(start.y-y)<=margin
    );
    const pointOrbitCells=cell=>{
      const cells=[];
      for(let dy=-1;dy<=1;dy++){
        for(let dx=-1;dx<=1;dx++)
          cells.push({x:cell.x+dx,y:cell.y+dy});
      }
      return cells;
    };
    const pointRunClearOfProtectedFeatures=points=>points.every(cell=>
      pointOrbitCells(cell).every(testCell=>{
        if(!inside(testCell.x,testCell.y)) return false;
        const key=`${testCell.x},${testCell.y}`;
        return !protectedDiagonalCorridorWalls.has(key)&&
          !protectedAbsurdPointWalls.has(key);
      })
    );
    const carveOrbitPointRun=points=>{
      // Open the complete 3x3 ring around every centre. With centres spaced
      // two cells apart, neighbouring rings share a passage but the points
      // never touch, so each one can be circled independently on all sides.
      points.forEach(cell=>pointOrbitCells(cell).forEach(testCell=>{
        if(testCell.x!==cell.x||testCell.y!==cell.y)
          openRaw(testCell.x,testCell.y);
      }));
      points.forEach(cell=>wallRaw(cell.x,cell.y));
    };

    // Reserve corner diagonals before the dense central absurdity layers are
    // built. This makes their real acceptance rate rise with the requested
    // probability instead of letting later central structures crowd them out.
    const earlyCornerChance=Math.min(
      0.98,
      absurdity*0.25+edgeAbsurdity*0.25+ultraAbsurdity*0.30
    );
    const earlyGuaranteedCorners=Math.min(
      3,
      Math.floor(
        ultraAbsurdity*3+Math.max(0,edgeAbsurdity-1.1)*0.9
      )
    );
    const earlyCornerRuns=Math.min(
      4,
      earlyGuaranteedCorners+(random()<earlyCornerChance?1:0)
    );
    const earlyCornerOrder=[
      {left:true,top:true,bit:1},
      {left:false,top:true,bit:2},
      {left:true,top:false,bit:4},
      {left:false,top:false,bit:8}
    ];
    for(let i=earlyCornerOrder.length-1;i>0;i--){
      const swap=(random()*(i+1))|0;
      [earlyCornerOrder[i],earlyCornerOrder[swap]]=
        [earlyCornerOrder[swap],earlyCornerOrder[i]];
    }
    for(let run=0;run<earlyCornerRuns;run++){
      const corner=earlyCornerOrder[run];
      for(let placement=0;placement<40;placement++){
        const inwardX=corner.left?1:-1;
        const inwardY=corner.top?1:-1;
        const startsFromVerticalSide=random()<0.5;
        const sideOffset=7+integer(0,2);
        let x=startsFromVerticalSide
          ? (corner.left?3:COLS-4)
          : (corner.left?sideOffset:COLS-1-sideOffset);
        let y=startsFromVerticalSide
          ? (corner.top?sideOffset:ROWS-1-sideOffset)
          : (corner.top?3:ROWS-4);
        const steps=Math.min(
          6,
          3+Math.round(absurdity*0.65)+Math.round(ultraAbsurdity)
        );
        const ridge=[{x,y}];
        for(let step=0;step<steps;step++){
          x+=inwardX;
          ridge.push({x,y});
          y+=inwardY;
          ridge.push({x,y});
        }
        if(ridge.some(cell=>!inside(cell.x,cell.y)||
          nearPlayerStart(cell.x,cell.y,5))) continue;
        const ridgeKeys=new Set(ridge.map(cell=>`${cell.x},${cell.y}`));
        const halo=[];
        ridge.forEach(cell=>{
          for(let dy=-1;dy<=1;dy++){
            for(let dx=-1;dx<=1;dx++){
              const haloCell={x:cell.x+dx,y:cell.y+dy};
              if(inside(haloCell.x,haloCell.y)&&
                 !ridgeKeys.has(`${haloCell.x},${haloCell.y}`))
                halo.push(haloCell);
            }
          }
        });
        const accepted=tryConnectedMutation(()=>{
          halo.forEach(cell=>{
            if(!nearPlayerStart(cell.x,cell.y,3))
              openRaw(cell.x,cell.y);
          });
          ridge.forEach(cell=>wallRaw(cell.x,cell.y));
        });
        if(!accepted) continue;
        ridge.forEach(cell=>
          protectedDiagonalCorridorWalls.add(`${cell.x},${cell.y}`)
        );
        lastMazePatternStats.cornerDiagonalStructures++;
        lastMazePatternStats.cornerCoverageMask|=corner.bit;
        break;
      }
    }

    // True diagonal corridors, not decorative ridges: each accepted feature
    // draws two continuous staircase polylines around a passable centre path.
    // Every border is an orthogonally connected chain, so the renderer uses
    // straight and corner sprites instead of isolated snakeBorderO dots.
    // Their number and length grow strongly up to level 30 and continue more
    // slowly afterwards. Every island is accepted only if all existing floor
    // cells and the new tunnel remain in one connected graph.
    const corridorLinear=Math.max(0,Math.min(1,(stage-4)/26));
    const corridorProgress=corridorLinear*corridorLinear*(3-2*corridorLinear);
    const diagonalCorridorRuns=stage<5
      ? 0
      : 1+Math.floor(corridorProgress*4+ultraAbsurdity*4);
    for(let run=0;run<diagonalCorridorRuns;run++){
      for(let placement=0;placement<140;placement++){
        const length=Math.min(
          18,
          7+Math.round(corridorProgress*9)+
            Math.round(ultraAbsurdity*2)+integer(0,1)
        );
        const stairSpan=2+integer(0,1);
        const rise=random()<0.5?-1:1;
        const verticalTravel=Math.floor((length-1)/stairSpan);
        const minimumStartY=rise<0?3+verticalTravel:3;
        const maximumStartY=rise<0?ROWS-4:ROWS-4-verticalTravel;
        if(maximumStartY<minimumStartY) continue;

        const minimumStartX=4;
        const maximumStartX=COLS-length-4;
        if(maximumStartX<minimumStartX) continue;
        const centredX=Math.max(
          minimumStartX,
          Math.min(maximumStartX,Math.floor((COLS-length)/2)+integer(-2,2))
        );
        const startX=run===0||random()<0.7
          ? centredX
          : integer(minimumStartX,maximumStartX);
        const idealStartY=rise<0
          ? Math.round(ROWS/2+verticalTravel/2)+integer(-2,2)
          : Math.round(ROWS/2-verticalTravel/2)+integer(-2,2);
        const startY=run===0||random()<0.7
          ? Math.max(minimumStartY,Math.min(maximumStartY,idealStartY))
          : integer(minimumStartY,maximumStartY);

        // Wide corridors remain exotic at first and become common only near
        // level 100. Even there a narrow line still has a 15% chance, keeping
        // neighbouring diagonal passages deliberately varied.
        const lateWidthProgress=Math.max(0,Math.min(1,(stage-20)/80));
        const wideCorridorChance=0.425*lateWidthProgress*lateWidthProgress;
        const corridorWidth=random()<wideCorridorChance?2:1;
        const columns=[];
        let y=startY;
        for(let step=0;step<length;step++){
          const x=startX+step;
          let nextY=y;
          if(step>0&&step%stairSpan===0) nextY+=rise;
          columns.push({
            x,
            top:Math.min(y,nextY),
            bottom:Math.max(y+corridorWidth-1,nextY+corridorWidth-1)
          });
          y=nextY;
        }
        const floorCells=[];
        columns.forEach(column=>{
          for(let floorY=column.top;floorY<=column.bottom;floorY++)
            floorCells.push({x:column.x,y:floorY});
        });
        const connectBorder=points=>{
          const connected=[];
          const add=cell=>{
            const previous=connected[connected.length-1];
            if(!previous||previous.x!==cell.x||previous.y!==cell.y)
              connected.push(cell);
          };
          add(points[0]);
          for(let index=1;index<points.length;index++){
            const previous=points[index-1];
            const next=points[index];
            if(previous.y!==next.y){
              // Join diagonal neighbours with one orthogonal elbow. Choosing
              // the outside corner leaves the one- or two-cell floor band
              // completely passable through every turn.
              const movesDown=next.y>previous.y;
              const isUpper=points===upperPoints;
              const elbow=movesDown
                ? (isUpper?{x:next.x,y:previous.y}:{x:previous.x,y:next.y})
                : (isUpper?{x:previous.x,y:next.y}:{x:next.x,y:previous.y});
              add(elbow);
            }
            add(next);
          }
          return connected;
        };
        const upperPoints=columns.map(column=>({x:column.x,y:column.top-1}));
        const lowerPoints=columns.map(column=>({x:column.x,y:column.bottom+1}));
        const upperBorder=connectBorder(upperPoints);
        const lowerBorder=connectBorder(lowerPoints);
        const endColumn=columns[columns.length-1];
        const end={x:endColumn.x,y:y};
        const minPathY=Math.min(...columns.map(column=>column.top));
        const maxPathY=Math.max(...columns.map(column=>column.bottom));
        const block={
          left:startX-1,right:end.x+1,
          top:minPathY-2,bottom:maxPathY+2
        };
        if(block.left<=1||block.right>=COLS-2||
           block.top<=1||block.bottom>=ROWS-2) continue;
        if(floorCells.some(cell=>nearPlayerStart(cell.x,cell.y,5))||
           upperBorder.some(cell=>nearPlayerStart(cell.x,cell.y,4))||
           lowerBorder.some(cell=>nearPlayerStart(cell.x,cell.y,4))) continue;

        // Both ends must meet existing floor outside the future wall island.
        // This gives the diagonal passage two genuine entrances rather than a
        // disconnected decorative cavity.
        const leftAnchor={x:block.left-1,y:startY};
        const rightAnchor={x:block.right+1,y:end.y};
        if(grid[leftAnchor.y]?.[leftAnchor.x]!=='.'||
           grid[rightAnchor.y]?.[rightAnchor.x]!=='.') continue;

        const accepted=tryConnectedMutation(()=>{
          // Clear only a narrow ribbon. This removes unrelated wall fragments
          // from the new passage without creating a large open rectangular
          // field around it.
          floorCells.forEach(cell=>openRaw(cell.x,cell.y));
          for(let x=leftAnchor.x;x<=startX;x++) openRaw(x,startY);
          for(let x=end.x;x<=rightAnchor.x;x++) openRaw(x,end.y);
          upperBorder.forEach(cell=>wallRaw(cell.x,cell.y));
          lowerBorder.forEach(cell=>wallRaw(cell.x,cell.y));
        });
        if(accepted){
          upperBorder.forEach(cell=>
            protectedDiagonalCorridorWalls.add(`${cell.x},${cell.y}`)
          );
          lowerBorder.forEach(cell=>
            protectedDiagonalCorridorWalls.add(`${cell.x},${cell.y}`)
          );
          lastMazePatternStats.diagonalCorridors++;
          if(corridorWidth===2) lastMazePatternStats.wideDiagonalCorridors++;
          break;
        }
      }
    }

    // Break a growing number of mirrored relationships by opening individual
    // one-sided shortcuts. At low levels the count is zero or one; near level
    // 30 the map contains several deliberate departures from its base motif.
    const asymmetricFractures=Math.round(absurdity*9+edgeAbsurdity*4);
    if(asymmetricFractures){
      const fractureCandidates=[];
      for(let y=2;y<ROWS-2;y++){
        for(let x=2;x<COLS-2;x++){
          if(grid[y][x]!=='#'||nearPlayerStart(x,y)) continue;
          const horizontal=grid[y][x-1]==='.'&&grid[y][x+1]==='.';
          const vertical=grid[y-1][x]==='.'&&grid[y+1][x]==='.';
          if(horizontal||vertical) fractureCandidates.push({x,y});
        }
      }
      for(let i=fractureCandidates.length-1;i>0;i--){
        const swap=(random()*(i+1))|0;
        [fractureCandidates[i],fractureCandidates[swap]]=
          [fractureCandidates[swap],fractureCandidates[i]];
      }
      fractureCandidates.slice(0,asymmetricFractures).forEach(cell=>
        openRaw(cell.x,cell.y)
      );
    }

    // After level 20, additional one-sided fractures are selected explicitly
    // from the outer quarters. They make the edges progressively less like
    // mirrored copies instead of concentrating all irregularity in the centre.
    const edgeFractures=Math.round(edgeAbsurdity*8);
    if(edgeFractures){
      const candidates=[];
      for(let y=3;y<ROWS-3;y++){
        for(let x=2;x<COLS-2;x++){
          const inOuterQuarter=x<=Math.floor(COLS*0.27)||
            x>=Math.ceil(COLS*0.73);
          if(!inOuterQuarter||grid[y][x]!=='#'||nearPlayerStart(x,y,5)) continue;
          const horizontal=grid[y][x-1]==='.'&&grid[y][x+1]==='.';
          const vertical=grid[y-1][x]==='.'&&grid[y+1][x]==='.';
          if(horizontal||vertical) candidates.push({x,y});
        }
      }
      for(let i=candidates.length-1;i>0;i--){
        const swap=(random()*(i+1))|0;
        [candidates[i],candidates[swap]]=[candidates[swap],candidates[i]];
      }
      candidates.slice(0,edgeFractures).forEach(cell=>openRaw(cell.x,cell.y));
    }

    // Continuous diagonal waves are the dominant late-game language. Their
    // rise reverses every few teeth, producing long serpentine lines instead
    // of isolated diagonal dots. A floor halo keeps both sides accessible and
    // connectivity validation rejects any wave that would seal a region.
    const serratedRuns=absurdity<0.16
      ? 0
      : Math.max(1,Math.round(absurdity*5+ultraAbsurdity*5));
    for(let run=0;run<serratedRuns;run++){
      for(let placement=0;placement<80;placement++){
        const teeth=Math.min(12,3+Math.round(absurdity*3)+integer(0,2));
        let rise=random()<0.5?-1:1;
        const waveSpan=2+integer(0,Math.min(2,Math.round(ultraAbsurdity*2)));
        const startX=integer(4,Math.max(4,COLS-teeth-6));
        const minimumY=4+waveSpan;
        const maximumY=ROWS-5-waveSpan;
        if(maximumY<minimumY) continue;
        let x=startX,y=integer(minimumY,maximumY);
        const ridge=[{x,y}];
        for(let tooth=0;tooth<teeth;tooth++){
          x++;
          ridge.push({x,y});
          y+=rise;
          ridge.push({x,y});
          if((tooth+1)%waveSpan===0) rise*=-1;
        }
        if(ridge.some(cell=>!inside(cell.x,cell.y)||
          nearPlayerStart(cell.x,cell.y,5))) continue;
        const ridgeKeys=new Set(ridge.map(cell=>`${cell.x},${cell.y}`));
        const accepted=tryConnectedMutation(()=>{
          ridge.forEach(cell=>dirs.forEach(direction=>{
            const haloX=cell.x+direction.x,haloY=cell.y+direction.y;
            if(inside(haloX,haloY)&&
              !ridgeKeys.has(`${haloX},${haloY}`)&&
              !nearPlayerStart(haloX,haloY,3))
              openRaw(haloX,haloY);
          }));
          ridge.forEach(cell=>wallRaw(cell.x,cell.y));
        });
        if(accepted) break;
      }
    }

    // Point constellations are restrained through level 30, then multiply
    // rapidly. Most are now horizontal or vertical orbit chains: every point
    // is two cells from the next and has a fully open 3x3 ring. Diagonal
    // constellations remain an occasional oddity rather than the main form.
    const absurdPointRuns=difficultyStage<=30
      ? Math.round(absurdity*1.35)
      : Math.round(absurdity*1.5+ultraAbsurdity*13);
    for(let run=0;run<absurdPointRuns;run++){
      for(let placement=0;placement<120;placement++){
        const count=Math.min(
          7,
          3+Math.round(absurdity*2)+Math.round(ultraAbsurdity*2)
        );
        const orthogonal=random()<0.50;
        const horizontal=random()<0.5;
        const sign=random()<0.5?-1:1;
        const stepX=orthogonal?(horizontal?sign*2:0):sign;
        const stepY=orthogonal?(horizontal?0:sign*2):(random()<0.5?-1:1);
        const startX=integer(3,COLS-4);
        const startY=integer(3,ROWS-4);
        const points=Array.from({length:count},(_,point)=>(
          {x:startX+stepX*point,y:startY+stepY*point}
        ));
        if(points.some(cell=>!inside(cell.x,cell.y)||
          nearPlayerStart(cell.x,cell.y,5))) continue;
        if(!pointRunClearOfProtectedFeatures(points)) continue;
        const accepted=tryConnectedMutation(()=>carveOrbitPointRun(points));
        if(accepted){
          points.forEach(cell=>
            protectedAbsurdPointWalls.add(`${cell.x},${cell.y}`)
          );
          if(orthogonal){
            points.forEach(cell=>
              protectedOrthogonalPointWalls.add(`${cell.x},${cell.y}`)
            );
            lastMazePatternStats.orthogonalPointRuns++;
          }else lastMazePatternStats.diagonalPointRuns++;
          break;
        }
      }
    }

    // Lateral waves bring the same serpentine language all the way to the
    // borders. At level 100 they become dense enough to dismantle nearly all
    // remaining square regularity while still preserving one connected graph.
    const lateralRidgeRuns=Math.floor(edgeAbsurdity*5+ultraAbsurdity*4);
    for(let run=0;run<lateralRidgeRuns;run++){
      for(let placement=0;placement<80;placement++){
        const fromLeft=random()<0.5;
        const teeth=Math.min(11,3+Math.round(absurdity*2.5)+integer(0,2));
        const stepX=fromLeft?1:-1;
        let rise=random()<0.5?-1:1;
        const waveSpan=2+integer(0,Math.min(2,Math.round(ultraAbsurdity*2)));
        let x=fromLeft?integer(3,5):integer(COLS-6,COLS-4);
        const minimumY=4+waveSpan;
        const maximumY=ROWS-5-waveSpan;
        if(maximumY<minimumY) continue;
        let y=integer(minimumY,maximumY);
        const ridge=[{x,y}];
        for(let tooth=0;tooth<teeth;tooth++){
          x+=stepX;
          ridge.push({x,y});
          y+=rise;
          ridge.push({x,y});
          if((tooth+1)%waveSpan===0) rise*=-1;
        }
        if(ridge.some(cell=>!inside(cell.x,cell.y)||
          nearPlayerStart(cell.x,cell.y,5))) continue;
        if(ridge.some(cell=>[cell,...dirs.map(direction=>({
          x:cell.x+direction.x,y:cell.y+direction.y
        }))].some(testCell=>
          protectedAbsurdPointWalls.has(`${testCell.x},${testCell.y}`)
        ))) continue;
        const ridgeKeys=new Set(ridge.map(cell=>`${cell.x},${cell.y}`));
        const accepted=tryConnectedMutation(()=>{
          ridge.forEach(cell=>dirs.forEach(direction=>{
            const haloX=cell.x+direction.x,haloY=cell.y+direction.y;
            if(inside(haloX,haloY)&&
              !ridgeKeys.has(`${haloX},${haloY}`)&&
              !nearPlayerStart(haloX,haloY,3))
              openRaw(haloX,haloY);
          }));
          ridge.forEach(cell=>wallRaw(cell.x,cell.y));
        });
        if(accepted) break;
      }
    }

    // After level 30, additional orbit chains spread toward both outer sides.
    // Horizontal runs usually grow inward from the edge; vertical runs form
    // difficult ladder-like pockets. A small diagonal minority remains.
    const lateralPointRuns=stage<=30
      ? Math.floor(edgeAbsurdity*0.8)
      : Math.round(edgeAbsurdity*1.2+ultraAbsurdity*8);
    for(let run=0;run<lateralPointRuns;run++){
      for(let placement=0;placement<120;placement++){
        const fromLeft=random()<0.5;
        const count=Math.min(
          6,
          3+Math.round(absurdity*1.7)+Math.round(ultraAbsurdity)
        );
        const orthogonal=random()<0.50;
        const horizontal=random()<0.68;
        const verticalSign=random()<0.5?-1:1;
        const stepX=orthogonal?(horizontal?(fromLeft?2:-2):0):(fromLeft?1:-1);
        const stepY=orthogonal?(horizontal?0:verticalSign*2):verticalSign;
        const startX=fromLeft?integer(3,5):integer(COLS-6,COLS-4);
        const startY=integer(3,ROWS-4);
        const points=Array.from({length:count},(_,point)=>(
          {x:startX+stepX*point,y:startY+stepY*point}
        ));
        if(points.some(cell=>!inside(cell.x,cell.y)||
          nearPlayerStart(cell.x,cell.y,5))) continue;
        if(!pointRunClearOfProtectedFeatures(points)) continue;
        const accepted=tryConnectedMutation(()=>carveOrbitPointRun(points));
        if(accepted){
          points.forEach(cell=>
            protectedAbsurdPointWalls.add(`${cell.x},${cell.y}`)
          );
          if(orthogonal){
            points.forEach(cell=>
              protectedOrthogonalPointWalls.add(`${cell.x},${cell.y}`)
            );
            lastMazePatternStats.orthogonalPointRuns++;
          }else lastMazePatternStats.diagonalPointRuns++;
          lastMazePatternStats.lateralPointRuns++;
          break;
        }
      }
    }

    // Wider fields remain scarce and bounded. Their maximum footprint grows
    // from 3x3 toward 5x4, making very late levels more exposed without ever
    // producing the huge empty halls that made earlier experiments unfair.
    const absurdArenaCount=absurdity<0.22
      ? 0
      : halfFeatureCount(Math.round(absurdity*1.5+ultraAbsurdity*2));
    for(let arena=0;arena<absurdArenaCount;arena++){
      for(let placement=0;placement<60;placement++){
        const longSide=3+Math.round(absurdity*2);
        const shortSide=3+Math.round(absurdity);
        const horizontal=random()<0.5;
        const width=horizontal?longSide:shortSide;
        const height=horizontal?shortSide:longSide;
        const startX=integer(3,Math.max(3,12-width));
        const startY=featureZoneY(height);
        if(!claimFeatureZone(startX,startY,width,height,1)) continue;
        for(let dy=0;dy<height;dy++){
          for(let dx=0;dx<width;dx++) openFeature(startX+dx,startY+dy);
        }
        break;
      }
    }

    // A small number of one-sided outer arenas completes the lateral spread.
    // They remain bounded and are later checked by the same wide-run limiter.
    const lateralArenaCount=halfFeatureCount(
      Math.round(edgeAbsurdity*1.5+ultraAbsurdity*2)
    );
    for(let arena=0;arena<lateralArenaCount;arena++){
      for(let placement=0;placement<60;placement++){
        const fromLeft=random()<0.5;
        const longSide=3+Math.round(absurdity*2);
        const shortSide=3+Math.round(absurdity);
        const vertical=random()<0.5;
        const width=vertical?shortSide:longSide;
        const height=vertical?longSide:shortSide;
        const minimumX=fromLeft?2:Math.max(2,COLS-2-width-5);
        const maximumX=fromLeft?Math.min(6,COLS-2-width):COLS-2-width;
        if(maximumX<minimumX) continue;
        const startX=integer(minimumX,maximumX);
        const startY=integer(4,Math.max(4,ROWS-5-height));
        if(!claimRawFeatureZone(startX,startY,width,height,1)) continue;
        let touchesStart=false;
        for(let dy=0;dy<height;dy++){
          for(let dx=0;dx<width;dx++){
            if(nearPlayerStart(startX+dx,startY+dy,4)) touchesStart=true;
          }
        }
        if(touchesStart) continue;
        for(let dy=0;dy<height;dy++){
          for(let dx=0;dx<width;dx++) openRaw(startX+dx,startY+dy);
        }
        break;
      }
    }

    // Keep the inside corner beside each spawn closed even if a later
    // shortcut candidate selected it. The two narrow exits remain available,
    // but the starting junction can never expand into an open 2x2 pocket.
    wallRaw(2,2);
    wallRaw(COLS-3,ROWS-3);
    wallRaw(2,ROWS-3);

    // Final gameplay guard: early maps retain the old three-cell limit. Rising
    // absurdity gradually permits double-width openings up to six cells long,
    // enough for the late 5x4 arenas but still far below a screen-sized field.
    // Long one-cell-wide tunnels remain untouched. Small limiter walls are
    // accepted only when they preserve access to every floor tile.
    const maximumWideRun=Math.min(6,3+Math.floor(absurdity*1.55));
    const findOversizedOpening=()=>{
      for(const shape of [
        {width:maximumWideRun+1,height:2},
        {width:2,height:maximumWideRun+1}
      ]){
        for(let y=1;y<=ROWS-1-shape.height;y++){
          for(let x=1;x<=COLS-1-shape.width;x++){
            let open=true;
            for(let dy=0;dy<shape.height&&open;dy++){
              for(let dx=0;dx<shape.width;dx++){
                if(grid[y+dy][x+dx]!=='.'){
                  open=false;
                  break;
                }
              }
            }
            if(open) return {x,y,...shape};
          }
        }
      }
      return null;
    };
    for(let limiter=0;limiter<320;limiter++){
      const opening=findOversizedOpening();
      if(!opening) break;
      const candidates=[];
      for(let dy=0;dy<opening.height;dy++){
        for(let dx=0;dx<opening.width;dx++){
          candidates.push({x:opening.x+dx,y:opening.y+dy});
        }
      }
      candidates.sort((a,b)=>{
        const centreX=opening.x+(opening.width-1)/2;
        const centreY=opening.y+(opening.height-1)/2;
        return (Math.abs(a.x-centreX)+Math.abs(a.y-centreY))-
          (Math.abs(b.x-centreX)+Math.abs(b.y-centreY));
      });
      let limited=false;
      for(const candidate of candidates){
        const copies=featureCopies(candidate.x,candidate.y);
        if(copies.some(cell=>protectedStartCells.has(`${cell.x},${cell.y}`))) continue;
        if(copies.some(cell=>[cell,...dirs.map(direction=>({
          x:cell.x+direction.x,y:cell.y+direction.y
        }))].some(testCell=>
          protectedAbsurdPointWalls.has(`${testCell.x},${testCell.y}`)
        ))) continue;
        const changed=copies.map(cell=>({
          ...cell,
          previous:grid[cell.y][cell.x]
        }));
        wallFeature(candidate.x,candidate.y);
        if(mazeFloorIsConnected(grid)){
          limited=true;
          break;
        }
        changed.forEach(cell=>{ grid[cell.y][cell.x]=cell.previous; });
      }
      if(limited) continue;

      // Gameplay safety takes precedence over exact decoration symmetry.
      for(const candidate of candidates){
        if(protectedStartCells.has(`${candidate.x},${candidate.y}`)) continue;
        if([candidate,...dirs.map(direction=>({
          x:candidate.x+direction.x,y:candidate.y+direction.y
        }))].some(testCell=>
          protectedAbsurdPointWalls.has(`${testCell.x},${testCell.y}`)
        )) continue;
        wallRaw(candidate.x,candidate.y);
        if(mazeFloorIsConnected(grid)){
          limited=true;
          break;
        }
        openRaw(candidate.x,candidate.y);
      }
      if(!limited) break;
    }

    // Final late-game point pass. It runs after all line and room mutations,
    // so the orbit chains cannot be erased or joined to a later wall. The
    // target accelerates toward level 100 while connectivity is still
    // validated transactionally after every accepted sequence.
    if(stage>30){
      const finalPointTarget=Math.round(
        5+Math.pow(ultraAbsurdity,0.70)*55
      );
      for(let attempt=0;
          attempt<1400&&protectedAbsurdPointWalls.size<finalPointTarget;
          attempt++){
        const remaining=finalPointTarget-protectedAbsurdPointWalls.size;
        const count=Math.min(remaining,3+integer(0,2));
        if(count<2) break;
        const orthogonal=random()<0.50;
        const horizontal=random()<0.5;
        const sign=random()<0.5?-1:1;
        const stepX=orthogonal?(horizontal?sign*2:0):sign;
        const stepY=orthogonal?(horizontal?0:sign*2):(random()<0.5?-1:1);
        const startX=integer(3,COLS-4);
        const startY=integer(3,ROWS-4);
        const points=Array.from({length:count},(_,index)=>({
          x:startX+stepX*index,
          y:startY+stepY*index
        }));
        const clearOfProtectedFeatures=points.every(cell=>
          inside(cell.x,cell.y)&&!nearPlayerStart(cell.x,cell.y,5)
        )&&pointRunClearOfProtectedFeatures(points);
        if(!clearOfProtectedFeatures) continue;
        const accepted=tryConnectedMutation(()=>carveOrbitPointRun(points));
        if(!accepted) continue;
        points.forEach(cell=>
          protectedAbsurdPointWalls.add(`${cell.x},${cell.y}`)
        );
        if(orthogonal){
          points.forEach(cell=>
            protectedOrthogonalPointWalls.add(`${cell.x},${cell.y}`)
          );
          lastMazePatternStats.orthogonalPointRuns++;
        }else lastMazePatternStats.diagonalPointRuns++;
      }
    }

    // A later wall mutation may have touched a corner of an earlier orbit.
    // Restore the full ring once all absurdity layers are complete. Protected
    // continuous diagonal borders remain untouched by openRaw().
    for(const key of protectedOrthogonalPointWalls){
      const [x,y]=key.split(',').map(Number);
      pointOrbitCells({x,y}).forEach(cell=>{
        if(cell.x!==x||cell.y!==y) openRaw(cell.x,cell.y);
      });
    }

    for(const key of protectedDiagonalCorridorWalls){
      const [x,y]=key.split(',').map(Number);
      const connected=dirs.some(direction=>
        grid[y+direction.y]?.[x+direction.x]==='#'
      );
      if(!connected) lastMazePatternStats.diagonalIsolatedWalls++;
    }
    for(const key of protectedAbsurdPointWalls){
      const [x,y]=key.split(',').map(Number);
      if(grid[y]?.[x]!=='#') continue;
      const isolated=dirs.every(direction=>
        grid[y+direction.y]?.[x+direction.x]!== '#'
      );
      if(isolated){
        lastMazePatternStats.preservedPointCells++;
        const fullyOrbitable=pointOrbitCells({x,y}).every(cell=>
          (cell.x===x&&cell.y===y)||grid[cell.y]?.[cell.x]!=='#'
        );
        if(fullyOrbitable) lastMazePatternStats.fullyOrbitablePointCells++;
      }
    }

    return mazeFloorIsConnected(grid)
      ? grid.map(row=>row.join(''))
      : [...CLASSIC_MAZE];
  }

  function mazeDifficultyRating(candidate,patternStats={}){
    let floorCells=0,junctions=0,deadEnds=0,openTwoByTwo=0;
    const tileIsOpen=(x,y)=>
      y>=0&&x>=0&&y<candidate.length&&x<candidate[0].length&&
      candidate[y][x]!== '#';

    for(let y=1;y<ROWS-1;y++){
      for(let x=1;x<COLS-1;x++){
        if(!tileIsOpen(x,y)) continue;
        floorCells++;
        const exits=dirs.reduce((count,direction)=>
          count+Number(tileIsOpen(x+direction.x,y+direction.y)),0
        );
        if(exits===1) deadEnds++;
        if(exits>=3) junctions++;
        if(tileIsOpen(x+1,y)&&tileIsOpen(x,y+1)&&
           tileIsOpen(x+1,y+1)) openTwoByTwo++;
      }
    }

    const patternDifficulty=
      (patternStats.fullyOrbitablePointCells||0)*4.5+
      (patternStats.wideDiagonalCorridors||0)*9+
      (patternStats.diagonalCorridors||0)*2.5+
      (patternStats.cornerDiagonalStructures||0)*4+
      (patternStats.orthogonalPointRuns||0)*3+
      (patternStats.diagonalPointRuns||0)*2;
    const rating=
      floorCells*0.10+junctions*0.45+openTwoByTwo*1.30-
      deadEnds*0.20+patternDifficulty;

    return {
      rating,floorCells,junctions,deadEnds,openTwoByTwo,
      patternDifficulty
    };
  }

  function targetMazeDifficultyForLevel(currentLevel){
    const stage=difficultyAdjustedLevel(currentLevel);
    const early=Math.min(1,(stage-1)/9);
    const middle=Math.max(0,Math.min(1,(stage-10)/20));
    const late=Math.max(0,Math.min(1,(stage-30)/70));
    return 45+early*75+middle*50+late*120;
  }

  let lastMazeDifficultySelection=null;
  function selectRatedMazeForLevel(currentLevel){
    const target=targetMazeDifficultyForLevel(currentLevel);
    // Build exactly one maze. Rating the already-created result is retained
    // for diagnostics, but no alternative mazes are generated or compared.
    // This removes the level-transition hitch caused by eight full builds.
    const generated=generateMazeForLevel(currentLevel);
    const patternStats={...lastMazePatternStats};
    const metrics=mazeDifficultyRating(generated,patternStats);
    lastMazeDifficultySelection={
      level:currentLevel,target,
      selectedRating:metrics.rating,
      candidateIndex:0,
      candidateCount:1,
      metrics:{...metrics}
    };
    return generated;
  }

  function mazeDifficultySelection(){
    return lastMazeDifficultySelection
      ? JSON.parse(JSON.stringify(lastMazeDifficultySelection))
      : null;
  }

  function applyMazeForLevel(currentLevel){
    maze=selectRatedMazeForLevel(currentLevel);
    mazeColorTheme=mazeColorThemeForLevel(currentLevel);
    mazeRevision++;
  }
  const PLAYER_SLIDE_RATIO=1;
  // Experimental HD motion: each visual glide lasts twice as long while the
  // underlying cell cadence, collision timing and AI decisions stay intact.
  const SCORPION_SLIDE_RATIO=0.55;
  const HUNTER_SLIDE_RATIO=1;
  // Every snake length now shares one arcade impulse: 55% glide and
  // 45% rest per logical cell. The two-cell head and tail retain their
  // established alternating order, but no longer glide continuously.
  const SNAKE_SLIDE_RATIO=0.55;
  const SNAKE_TAIL_LEAD_RATIO=0.5;
  // Halving this multiplier doubles the predictive tail/head travel window.
  const PREDICTIVE_SLIDE_SPEED_MULTIPLIER=1;
  // Once reverse travel exposes a genuinely new route beside the head, the
  // snake normally takes it. The remaining quarter keeps the retreat organic
  // and lets it occasionally search for a later junction.
  const REVERSE_HEAD_NEW_BRANCH_CHANCE=0.75;

  // Speed is the rate of the whole simulation, not merely entity movement.
  // MEDIUM remains exactly 1.0; the central clock below applies the selected
  // rate once to every gameplay timer.
  function levelSpeedMultiplier(){
    return TITLE_SPEED_MULTIPLIERS[titleSpeedIndex]||1;
  }

  // Difficulty never changes physical speed or the number of snakes. It is a
  // central intensity factor used by intelligence, aggression, encounter
  // pressure and maze absurdity. MEDIUM is therefore bit-for-bit the existing
  // 1.0 behaviour, while EASY/HARD remain mathematically comparable.
  function difficultyMultiplier(){
    return TITLE_DIFFICULTY_MULTIPLIERS[titleDifficultyIndex]||1;
  }

  function difficultyAdjustedLevel(currentLevel){
    return 1+(Math.max(1,currentLevel)-1)*difficultyMultiplier();
  }

  // Ranking points combine speed and difficulty without a minimum floor.
  // PICNIC therefore preserves the full 50% difficulty factor at every speed,
  // including the deliberately gentle 0.30x PICNIC + SNAIL combination.
  // Exact fractions accumulate invisibly; only the HUD is rounded down to a
  // clean arcade multiple of five.
  function combinedScoreMultiplier(){
    return levelSpeedMultiplier()*difficultyMultiplier();
  }

  function combinedScoreTimesLabel(){
    return combinedScoreMultiplier().toFixed(2);
  }

  const CentralGameClock=(()=>{
    let time=0;
    let lastRealTime=performance.now();

    function reset(realTime=performance.now()){
      // Keep the same time origin as the former performance.now()-based
      // simulation. This preserves the established immediate first movement
      // of newly spawned entities whose lastMove value starts at zero.
      time=realTime;
      lastRealTime=realTime;
      return time;
    }

    function reanchor(realTime=performance.now()){
      lastRealTime=realTime;
    }

    function advance(realTime,enabled=true){
      const elapsed=Math.max(0,Math.min(250,realTime-lastRealTime));
      lastRealTime=realTime;
      if(enabled) time+=elapsed*levelSpeedMultiplier();
      return time;
    }

    return {reset,reanchor,advance,now:()=>time};
  })();

  function gameTimeNow(){
    return CentralGameClock.now();
  }

  function snakeMoveDelay(){
    return 218;
  }
  // The normal forward step of a snake is the shared gameplay-rhythm unit.
  // CentralGameClock scales this unit with the selected speed, so all counts
  // below stay identical even though their real-time duration changes.
  const SNAKE_FORWARD_STEP_GAME_MS=snakeMoveDelay();
  const PLAYER_MOUTH_TOGGLE_FORWARD_STEPS=1;
  const PLAYER_MOUTH_TOGGLE_GAME_MS=
    SNAKE_FORWARD_STEP_GAME_MS*PLAYER_MOUTH_TOGGLE_FORWARD_STEPS;
  const SPAWN_FLASH_TOGGLE_FORWARD_STEPS=1;
  const SPAWN_FLASH_TOGGLE_GAME_MS=
    SNAKE_FORWARD_STEP_GAME_MS*SPAWN_FLASH_TOGGLE_FORWARD_STEPS;
  const SPAWN_SHIELD_FORWARD_STEPS=20;
  const SPAWN_SHIELD_DURATION_GAME_MS=
    SNAKE_FORWARD_STEP_GAME_MS*SPAWN_SHIELD_FORWARD_STEPS;

  function advanceBinaryRhythm(entity,t,lastAtKey,stateKey,interval){
    const elapsed=t-entity[lastAtKey];
    if(elapsed<interval) return;
    const transitions=Math.floor(elapsed/interval);
    if(transitions&1) entity[stateKey]=!entity[stateKey];
    // Preserve the unused fraction of the current step instead of anchoring
    // to a render frame, preventing slow drift at both 60 and 120 Hz.
    entity[lastAtKey]+=transitions*interval;
  }
  function hunterMoveDelay(){
    return 95;
  }
  const POWER_MODE_ACCEL_MS=1000;
  const POWER_MODE_PLATEAU_MS=3000;
  const POWER_MODE_DECEL_MS=3000;
  const POWER_MODE_TOTAL_MS=POWER_MODE_ACCEL_MS+POWER_MODE_PLATEAU_MS+POWER_MODE_DECEL_MS;
  const ENTITY_SPAWN_FADE_MS=250;

  function powerModeSpeedStrength(p,t=gameTimeNow()){
    if(!p||!isPowerMode(p,t)) return 0;
    const rampStartedAt=p.powerSpeedRampStartedAt??p.powerModeStartedAt??t;
    const rampDuration=Math.max(1,p.powerSpeedRampDuration||POWER_MODE_ACCEL_MS);
    const rampElapsed=Math.max(0,t-rampStartedAt);
    if(rampElapsed<rampDuration){
      const u=rampElapsed/rampDuration;
      const eased=1-(1-u)*(1-u);
      const from=Math.max(0,Math.min(1,p.powerSpeedRampFrom||0));
      return from+(1-from)*eased;
    }
    const remaining=Math.max(0,p.powerModeUntil-t);
    if(remaining<POWER_MODE_DECEL_MS){
      const u=remaining/POWER_MODE_DECEL_MS;
      // Mirrored quadratic slowdown. A fruit eaten here starts a fresh curve
      // from this exact strength, so no frame ever jumps back to normal speed.
      return 1-(1-u)*(1-u);
    }
    return 1;
  }

  function playerMoveDelay(p,t=gameTimeNow()){
    const normal=95;
    return normal/(1+powerModeSpeedStrength(p,t));
  }

  function entitySpawnFadeAlpha(bornAt,t=gameTimeNow()){
    if(!Number.isFinite(bornAt)) return 1;
    const u=Math.max(0,Math.min(1,(t-bornAt)/ENTITY_SPAWN_FADE_MS));
    return 1-(1-u)*(1-u);
  }

  // One complete fruit pulse lasts exactly eight normal snake steps, which
  // is also four reverse steps because reverse travel uses double delay.
  // Game-clock time makes the visual rhythm follow every selected speed.
  const FRUIT_PULSE_FORWARD_STEPS=8;
  function fruitPulseAlpha(entity,t=gameTimeNow()){
    const bornAt=Number.isFinite(entity?.bornAt)?entity.bornAt:t;
    const cycle=Math.max(1,snakeMoveDelay()*FRUIT_PULSE_FORWARD_STEPS);
    const phase=((t-bornAt)%cycle+cycle)%cycle/cycle;
    return 0.85+0.15*Math.cos(phase*Math.PI*2);
  }

  let player, player2, player3, snakes, gameOver, paused, level, tickCount;
  let pauseStartedAt=0;
  let gameOverPending=false;
  let gameOverPendingUntil=0;
  let gameOverPendingPlayerId=0;
  let gameOverVisualsSettled=false;
  let gameOverStartedAt=0;
  // Every GAME OVER presentation keeps the complete maze simulation alive
  // behind the overlay. ESC additionally silences ordinary gameplay effects.
  let gameOverKeepsWorldAlive=false;
  function gameOverStopsWorld(){
    return gameOver&&!gameOverKeepsWorldAlive;
  }
  let levelCompletionTransition=null;
  // Death skulls use the movement-synchronised rhythm: visibly faster on FAST
  // and EXTREME, slower on SLOW and SNAIL, but always exactly three pulses.
  const DEATH_VISUAL_PULSE_COUNT=3;
  const DEATH_VISUAL_PULSE_CYCLE_GAME_MS=SNAKE_FORWARD_STEP_GAME_MS*4;
  const DEATH_VISUAL_PULSE_DURATION_GAME_MS=
    DEATH_VISUAL_PULSE_CYCLE_GAME_MS*DEATH_VISUAL_PULSE_COUNT;
  // Keep the fully vanished final state on screen for one movement step.
  const DEATH_VISUAL_VANISH_HOLD_GAME_MS=SNAKE_FORWARD_STEP_GAME_MS;
  const DEATH_VISUAL_TOTAL_GAME_MS=
    DEATH_VISUAL_PULSE_DURATION_GAME_MS+DEATH_VISUAL_VANISH_HOLD_GAME_MS;
  // GAME OVER intentionally follows the fixed SELECT GAME interface rhythm,
  // independently of selected gameplay speed. It receives three complete
  // 0 -> 1 -> 0 pulses and one locked 120 Hz frame at zero opacity so the
  // third disappearance is visible before returning to the title screen.
  const INTERFACE_PULSE_DIVISOR_MS=310;
  const INTERFACE_PULSE_CYCLE_MS=Math.PI*2*INTERFACE_PULSE_DIVISOR_MS;
  const GAME_OVER_PULSE_COUNT=3;
  const GAME_OVER_PULSE_DURATION_MS=
    INTERFACE_PULSE_CYCLE_MS*GAME_OVER_PULSE_COUNT;
  const GAME_OVER_VANISH_HOLD_MS=1000/120;
  const GAME_OVER_TOTAL_MS=
    GAME_OVER_PULSE_DURATION_MS+GAME_OVER_VANISH_HOLD_MS;
  // Eight complete bright/dark player pulses equal sixteen normal forward
  // snake steps. Central game time keeps this exact at every speed setting.
  const LEVEL_COMPLETE_PULSE_COUNT=8;
  const LEVEL_COMPLETE_PULSE_HALF_GAME_MS=SPAWN_FLASH_TOGGLE_GAME_MS;
  const LEVEL_COMPLETE_TOTAL_GAME_MS=
    LEVEL_COMPLETE_PULSE_COUNT*LEVEL_COMPLETE_PULSE_HALF_GAME_MS*2;
  // The status message completes four clean pulses across the same interval.
  // At MEDIUM this is approximately twice the GAME OVER pulse rate, while
  // still ending in exact synchrony with the eighth player flash.
  const LEVEL_COMPLETE_MESSAGE_PULSE_COUNT=4;
  let activePlayerCount=1;
  let humanPlayerCount=1;
  let alliedAiPlayerId=0;
  let gameMode=1;
  // Future high-score contract: AI-only games never submit a record. In all
  // other modes only the highest-scoring human submits; a human tie opens one
  // shared, ten-character entry field and credits both tied players to that
  // single record. Ally scores are never eligible.
  let awaitingPlayerSelection=true;
  let completedRunHighScoreCandidate=null;
  let levelStartingSnakeMass=1;
  let scorpion, fruits, eggs, hunters, pendingScorpionDrops;
  let eggObstacleRevision=0;
  let scorpionKilled=false;
  let levelStartedAt=0, scorpionSpawnAt=0;
  const keys = {};
  let levelEntryBuffer='';
  let levelEntryTimer=0;
  const LEVEL_ENTRY_TIMEOUT=2200;

  function collectPlayers(predicate=null){
    const result=[];
    if(player&&(!predicate||predicate(player))) result.push(player);
    if(activePlayerCount>1&&player2&&(!predicate||predicate(player2)))
      result.push(player2);
    if(activePlayerCount>2&&player3&&(!predicate||predicate(player3)))
      result.push(player3);
    return result;
  }

  // The active roster changes only when a game mode is selected. Keep one
  // stable array instead of allocating the same 1–3 entries in every update
  // and every render frame.
  let allPlayersCache=[];
  let allPlayersCacheCount=-1;
  let allPlayersCacheP1=null;
  let allPlayersCacheP2=null;
  let allPlayersCacheP3=null;
  function allPlayers(){
    if(allPlayersCacheCount!==activePlayerCount||
       allPlayersCacheP1!==player||
       allPlayersCacheP2!==player2||
       allPlayersCacheP3!==player3){
      allPlayersCache=[];
      if(player) allPlayersCache.push(player);
      if(activePlayerCount>1&&player2) allPlayersCache.push(player2);
      if(activePlayerCount>2&&player3) allPlayersCache.push(player3);
      allPlayersCacheCount=activePlayerCount;
      allPlayersCacheP1=player;
      allPlayersCacheP2=player2;
      allPlayersCacheP3=player3;
    }
    return allPlayersCache;
  }

  function somePlayer(predicate){
    if(player&&predicate(player)) return true;
    if(activePlayerCount>1&&player2&&predicate(player2)) return true;
    return !!(activePlayerCount>2&&player3&&predicate(player3));
  }

  function everyPlayer(predicate){
    if(player&&!predicate(player)) return false;
    if(activePlayerCount>1&&player2&&!predicate(player2)) return false;
    if(activePlayerCount>2&&player3&&!predicate(player3)) return false;
    return true;
  }

  function livingPlayers(){
    return collectPlayers(p=>!p.dead&&p.lives>0);
  }

  function playerAt(x,y){
    if(player&&!player.dead&&player.lives>0&&player.x===x&&player.y===y)
      return player;
    if(activePlayerCount>1&&player2&&!player2.dead&&player2.lives>0&&
       player2.x===x&&player2.y===y) return player2;
    if(activePlayerCount>2&&player3&&!player3.dead&&player3.lives>0&&
       player3.x===x&&player3.y===y) return player3;
    return null;
  }

  function humanPlayers(){
    return collectPlayers(p=>!p.isAI);
  }

  function livingHumanPlayers(){
    return collectPlayers(p=>!p.isAI&&!p.dead&&p.lives>0);
  }

  function teammatesOf(p){
    return collectPlayers(other=>other!==p);
  }

  function teammateAt(p,x,y){
    const occupied=other=>other&&other!==p&&!other.dead&&other.lives>0&&
      other.x===x&&other.y===y;
    if(occupied(player)) return player;
    if(activePlayerCount>1&&occupied(player2)) return player2;
    if(activePlayerCount>2&&occupied(player3)) return player3;
    return null;
  }

  function isCompetitiveMode(){
    return gameMode===2||gameMode===3||gameMode===4;
  }

  function isCooperativeMode(){
    // Stored mode IDs are stable: 2 remains the historical DUO VS record.
    // CO-OP uses the new ID 5 even though its visible menu shortcut is 2.
    return gameMode===5;
  }

  // One live rule governs every VS contact, so a score change made on the
  // previous bite reverses hunter and prey before the very next movement.
  function canPlayerEatPlayer(attacker,defender,t=gameTimeNow()){
    if(!isCompetitiveMode()) return false;
    return playerWinsContactPriority(attacker,defender,t);
  }

  function playerWinsContactPriority(attacker,defender,t=gameTimeNow()){
    if(!attacker||!defender||attacker===defender||
       attacker.dead||defender.dead||attacker.lives<=0||defender.lives<=0) return false;
    // Spawn immunity always protects its owner. If both players are protected,
    // neither can eat the other and the occupied cell remains blocking.
    if(isSpawnProtected(defender,t)) return false;
    // A newly spawned player temporarily outranks score, leader glow and fruit power.
    // This prevents the leader from repeatedly camping a respawn point.
    if(isSpawnProtected(attacker,t)) return true;
    const attackerPowered=isPowerMode(attacker,t);
    const defenderPowered=isPowerMode(defender,t);
    if(attackerPowered!==defenderPowered) return attackerPowered;
    return attacker.score>defender.score;
  }

  function playerContactBlocksMovement(mover,x,y,t=gameTimeNow()){
    const other=teammateAt(mover,x,y);
    if(!other) return false;
    return !canPlayerEatPlayer(mover,other,t)&&
      !canPlayerEatPlayer(other,mover,t);
  }

  // Route planners never deliberately enter a stronger opponent. Direct
  // keyboard movement still permits that dangerous choice and resolves it as
  // a loss, preserving the immediate arcade contact rule.
  function playerCellIsSafeForRoute(mover,x,y,t=gameTimeNow()){
    const other=teammateAt(mover,x,y);
    return !other||canPlayerEatPlayer(mover,other,t);
  }

  const COMPETITOR_EAT_POINTS=1000;

  function eatCompetingPlayer(winner,victim,t=gameTimeNow()){
    if(!canPlayerEatPlayer(winner,victim,t)) return false;
    winner.aiVsDirective=null;
    victim.aiVsDirective=null;
    spawnConsumedCreatureBloomAt(
      victim.x,victim.y,playerEffectColor(victim),winner,t
    );
    // A knockout is a major arcade event. Keep 1000 as its base value so the
    // same speed/difficulty multiplier used by every other score also keeps
    // competitive high scores comparable.
    awardPoints(winner,COMPETITOR_EAT_POINTS,0);
    ControllerHaptics.rivalBite(winner);
    // A player knockout keeps the victim's own death cue, but deliberately
    // does not reuse the snake-head bite sound.
    loseLife(victim);
    return true;
  }

  function resolvePlayerContact(mover,t=gameTimeNow()){
    const other=teammateAt(mover,mover.x,mover.y);
    if(!other) return false;
    if(eatCompetingPlayer(mover,other,t)) return true;
    return eatCompetingPlayer(other,mover,t);
  }

  function setPlayerReference(p){
    if(p.id===1) player=p;
    else if(p.id===2) player2=p;
    else player3=p;
  }

  function isWall(x,y) {
    return x<0 || y<0 || x>=COLS || y>=ROWS || maze[y][x] === '#';
  }
  const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];

  function creatureIntelligenceForLevelAtTime(currentLevel,levelAge){
    const difficulty=difficultyMultiplier();
    const adjustedLevel=difficultyAdjustedLevel(currentLevel);
    const levelProgress=Math.max(
      0,Math.min(1,(adjustedLevel-1)/99)
    );
    // Even level 1 has a faint shared awareness. Every later level raises
    // the baseline coordination, shortens the calm period and accelerates
    // learning until level 100 starts with a fully coordinated population.
    const baseline=Math.max(
      0.02,
      Math.min(1,(0.04+levelProgress*0.76)*difficulty)
    );
    if(levelProgress>=1) return 1;
    const calmPeriod=30000*(1-levelProgress)/difficulty;
    const learningDuration=150000*(1-levelProgress)/difficulty;
    if(levelAge<=calmPeriod) return baseline;
    if(learningDuration<=0) return 1;
    const progress=Math.max(0,Math.min(
      1,(levelAge-calmPeriod)/learningDuration
    ));
    const learned=progress*progress*(3-2*progress);
    return baseline+(1-baseline)*learned;
  }

  function coordinationChanceForIntelligence(intelligence){
    const developed=Math.max(0,Math.min(1,intelligence));
    if(developed>=0.999999) return 1;
    return developed*(0.80+developed*0.20);
  }

  // Shared navigation intelligence. It builds a real shortest-path distance
  // field through the maze, then lets every inhabitant consult it according
  // to its own changing aggression, temperament and tactical mood.
  const MazeBrain=(()=>{
    const index=(x,y)=>y*COLS+x;
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    let epochKey='';
    let fields=new Map();
    let nextBrainId=1;
    let lastUpdateTime=NaN;
    let lastEggObstacleRevision=-1;
    let lastMazeRevision=-1;
    let lastActivePlayerCount=-1;
    const lastPlayerX=[NaN,NaN,NaN];
    const lastPlayerY=[NaN,NaN,NaN];
    const lastPlayerAlive=[false,false,false];

    function activePlayerForSlot(slot){
      return slot===0?player:slot===1?player2:player3;
    }

    function fastStateMatches(t){
      if(mazeRevision!==lastMazeRevision||
         eggObstacleRevision!==lastEggObstacleRevision||
         activePlayerCount!==lastActivePlayerCount) return false;
      // Once an egg reaches its solid threshold, another moving entity can
      // cover or uncover it between two AI decisions in the same frame. Keep
      // the original immediate obstacle semantics in that short phase.
      for(const e of eggs||[]){
        if(t-e.bornAt>=10000) return false;
      }
      for(let slot=0;slot<activePlayerCount;slot++){
        const p=activePlayerForSlot(slot);
        const alive=!!(p&&!p.dead&&p.lives>0);
        if(alive!==lastPlayerAlive[slot]) return false;
        if(alive&&(p.x!==lastPlayerX[slot]||p.y!==lastPlayerY[slot])) return false;
      }
      return true;
    }

    function rememberFastState(t){
      lastUpdateTime=t;
      lastEggObstacleRevision=eggObstacleRevision;
      lastMazeRevision=mazeRevision;
      lastActivePlayerCount=activePlayerCount;
      for(let slot=0;slot<3;slot++){
        const p=slot<activePlayerCount?activePlayerForSlot(slot):null;
        const alive=!!(p&&!p.dead&&p.lives>0);
        lastPlayerAlive[slot]=alive;
        lastPlayerX[slot]=alive?p.x:NaN;
        lastPlayerY[slot]=alive?p.y:NaN;
      }
    }

    function obstacleSignature(t){
      let signature='';
      for(const e of eggs||[]){
        if(isEggSolid(e,t)) signature+=`${e.x},${e.y}|`;
      }
      return signature;
    }

    function playerSignature(){
      let signature='';
      for(let slot=0;slot<activePlayerCount;slot++){
        const p=activePlayerForSlot(slot);
        if(p&&!p.dead&&p.lives>0) signature+=`${p.id}:${p.x},${p.y}|`;
      }
      return signature;
    }

    function update(t=gameTimeNow()){
      // fieldFor() is consulted many times by snakes, hunters and the ally in
      // one simulation frame. If players and solid eggs are unchanged, reuse
      // the already validated epoch without rescanning the world each time.
      if(fastStateMatches(t)) return;
      const nextEpoch=`${mazeRevision}:${playerSignature()}:${obstacleSignature(t)}`;
      rememberFastState(t);
      if(nextEpoch!==epochKey){
        epochKey=nextEpoch;
        fields=new Map();
      }
    }

    function isRouteTile(x,y,target,t){
      if(isWall(x,y)) return false;
      if(x===target.x&&y===target.y) return true;
      return !occupiedBySolidEgg(x,y,t);
    }

    function nearestRouteTile(target,t){
      const rounded={
        x:clamp(Math.round(target.x),0,COLS-1),
        y:clamp(Math.round(target.y),0,ROWS-1)
      };
      const roundedIsPlayer=somePlayer(p=>!p.dead&&p.lives>0&&
        rounded.x===p.x&&rounded.y===p.y
      );
      if(!isWall(rounded.x,rounded.y)&&
         (roundedIsPlayer||!occupiedBySolidEgg(rounded.x,rounded.y,t))){
        return rounded;
      }
      for(let radius=1;radius<Math.max(COLS,ROWS);radius++){
        for(let dy=-radius;dy<=radius;dy++){
          for(let dx=-radius;dx<=radius;dx++){
            if(Math.abs(dx)+Math.abs(dy)!==radius) continue;
            const x=rounded.x+dx,y=rounded.y+dy;
            if(!isWall(x,y)&&!occupiedBySolidEgg(x,y,t)) return {x,y};
          }
        }
      }
      const fallback=livingPlayers()[0]||PLAYER_STARTS[0];
      return {x:fallback.x,y:fallback.y};
    }

    function buildField(target,t){
      const field=new Int16Array(COLS*ROWS);
      field.fill(-1);
      const queueX=new Int16Array(COLS*ROWS);
      const queueY=new Int16Array(COLS*ROWS);
      let read=0,write=0;
      field[index(target.x,target.y)]=0;
      queueX[write]=target.x;
      queueY[write++]=target.y;
      while(read<write){
        const x=queueX[read],y=queueY[read++];
        const nextDistance=field[index(x,y)]+1;
        for(const d of dirs){
          const nx=x+d.x,ny=y+d.y;
          if(nx<0||ny<0||nx>=COLS||ny>=ROWS) continue;
          const nextIndex=index(nx,ny);
          if(field[nextIndex]>=0||!isRouteTile(nx,ny,target,t)) continue;
          field[nextIndex]=nextDistance;
          queueX[write]=nx;
          queueY[write++]=ny;
        }
      }
      return field;
    }

    function fieldFor(target,t){
      update(t);
      const safeTarget=nearestRouteTile(target,t);
      const key=`${safeTarget.x},${safeTarget.y}`;
      if(!fields.has(key)) fields.set(key,buildField(safeTarget,t));
      return fields.get(key);
    }

    function stateFor(entity,t){
      if(!entity.brainState){
        entity.brainState={
          phase:Math.random()*Math.PI*2,
          period:4200+Math.random()*6200,
          focus:0,
          focusUntil:0,
          planUntil:0,
          target:null,
          surpriseAt:t+9000+Math.random()*15000,
          lastChoice:null,
          brainId:nextBrainId++,
          coordinationRole:null,
          targetPlayerId:null,
          targetPlayerUntil:0,
          routeHistory:[],
          planDistance:Infinity,
          planStalls:0,
          planTargetKey:''
        };
      }
      return entity.brainState;
    }

    function selectTargetPlayer(entity,state,t){
      const candidates=livingPlayers();
      if(!candidates.length) return allPlayers()[0]||null;
      if(candidates.length===1) return candidates[0];

      const current=candidates.find(p=>p.id===state.targetPlayerId);
      if(current&&t<state.targetPlayerUntil) return current;

      const weights=candidates.map(p=>{
        const personal=(entity.threatByPlayer&&entity.threatByPlayer[p.id-1])||0;
        const shared=Math.max(0,p.aggressionContribution||0);
        const distance=Math.abs((entity.x??entity.body?.[0]?.x??0)-p.x)+
          Math.abs((entity.y??entity.body?.[0]?.y??0)-p.y);
        return 1+personal*1.8+shared*0.055+3/(2+distance);
      });
      const total=weights.reduce((sum,value)=>sum+value,0);
      let roll=Math.random()*total;
      let chosen=candidates[candidates.length-1];
      for(let i=0;i<candidates.length;i++){
        roll-=weights[i];
        if(roll<=0){ chosen=candidates[i]; break; }
      }
      state.targetPlayerId=chosen.id;
      state.targetPlayerUntil=t+1000+Math.random()*2400;
      state.target=null;
      state.planUntil=0;
      return chosen;
    }

    function aggression(entity,profile,t,targetPlayer){
      const state=stateFor(entity,t);
      const slowWave=0.5+0.5*Math.sin(t/state.period+state.phase);
      const quickNuance=0.5+0.5*Math.sin(t/(state.period*0.43)+state.phase*1.71);
      const personalThreat=targetPlayer&&entity.threatByPlayer
        ? entity.threatByPlayer[targetPlayer.id-1]||0
        : 0;
      const potential=clamp(
        ((profile.base||0)+(profile.injury||0)+(profile.stateBoost||0)+
          Math.min(0.24,personalThreat*0.055))*difficultyMultiplier(),
        0.04,
        0.90
      );

      // Attention is held for a short thought, then reconsidered. The waves
      // ensure that even furious creatures have moments of distraction, while
      // peaceful creatures occasionally become curious about the player.
      if(t>=state.focusUntil){
        const modulation=0.58+slowWave*0.34+quickNuance*0.16;
        state.focus=clamp(potential*modulation+(Math.random()-0.5)*0.16,0.04,0.91);
        state.focusUntil=t+700+Math.random()*1700;
      }
      entity.brainAggression=state.focus;
      return state.focus;
    }

    function evolvingIntelligence(profile,t){
      if(profile.kind!=='snake'&&profile.kind!=='hunter'&&
         profile.kind!=='scorpion') return 0;
      const levelAge=Math.max(0,t-levelStartedAt);
      // Shared coordination begins faintly on level 1 and becomes stronger,
      // faster and more reliable on every level. At level 100 the hostile
      // population starts fully developed and acts as a coordinated group.
      return creatureIntelligenceForLevelAtTime(level,levelAge);
    }

    function attackerPopulation(){
      return (snakes||[]).length+(hunters||[]).length;
    }

    function coordinationRole(state){
      if(state.coordinationRole===null){
        state.coordinationRole=(state.brainId-1)%3;
      }
      return state.coordinationRole;
    }

    function tacticalTarget(entity,origin,profile,attention,targetPlayer,t){
      const state=stateFor(entity,t);
      const intelligence=evolvingIntelligence(profile,t);
      const population=attackerPopulation();

      // Direct chasers always follow the player's current tile. A stale copy
      // of the player's former position can otherwise look like indifference
      // in fast late-level play.
      if(state.planType==='coordinate-center'||
         state.planType==='coordinate-strike'||state.planType==='chase'){
        state.target={x:targetPlayer.x,y:targetPlayer.y};
      }

      if(!state.target||t>=state.planUntil){
        const role=coordinationRole(state);
        const canCoordinate=population>=3&&intelligence>0&&
          Math.random()<coordinationChanceForIntelligence(intelligence);

        if(canCoordinate){
          const playerDir=(targetPlayer.dir.x||targetPlayer.dir.y)
            ? targetPlayer.dir
            : {x:1,y:0};
          const side={x:-playerDir.y,y:playerDir.x};
          if(role===0){
            state.target={x:targetPlayer.x,y:targetPlayer.y};
            state.planType='coordinate-center';
          }else{
            const flankSign=role===1?-1:1;
            const sideDistance=2+Math.round(intelligence*3);
            const leadDistance=Math.round(intelligence*3);
            state.target=nearestRouteTile({
              x:targetPlayer.x+playerDir.x*leadDistance+
                side.x*sideDistance*flankSign,
              y:targetPlayer.y+playerDir.y*leadDistance+
                side.y*sideDistance*flankSign
            },t);
            state.planType=role===1?'coordinate-left':'coordinate-right';
          }
          // A clever group refreshes the moving player's position more often,
          // while the role itself remains stable. This keeps flankers decisive
          // without sending them toward a six-second-old destination.
          state.planUntil=t+1000+(1-intelligence)*1800+Math.random()*700;
        }else{
          // A lone evolved hunter strongly favours the true shortest route.
          // The old exotic ambush remains possible, mostly in the early game.
          const preciseSolo=population<3&&
            Math.random()<intelligence*0.94;
          const canAmbush=!preciseSolo&&attention>0.62&&
            Math.random()<(0.02+attention*0.08)*(1-intelligence*0.75);
          if(canAmbush){
            const playerDir=(targetPlayer.dir.x||targetPlayer.dir.y)
              ? targetPlayer.dir
              : {x:1,y:0};
            const side={x:-playerDir.y,y:playerDir.x};
            const lead=2+((Math.random()*4)|0);
            const sideAmount=(Math.random()<0.5?-1:1)*
              (1+((Math.random()*3)|0));
            state.target=nearestRouteTile({
              x:targetPlayer.x+playerDir.x*lead+side.x*sideAmount,
              y:targetPlayer.y+playerDir.y*lead+side.y*sideAmount
            },t);
            state.planType='ambush';
            state.planUntil=t+1600+Math.random()*2800;
          }else{
            state.target={x:targetPlayer.x,y:targetPlayer.y};
            state.planType='chase';
            state.planUntil=t+900+Math.random()*1900;
          }
        }
      }

      // If an ambush point cannot be reached from this part of the maze,
      // immediately fall back to the player's real position.
      let plannedField=fieldFor(state.target,t);
      let plannedDistance=plannedField[index(origin.x,origin.y)];
      if(plannedDistance<0){
        state.target={x:targetPlayer.x,y:targetPlayer.y};
        state.planType='chase';
        state.planUntil=t+900;
        plannedField=fieldFor(state.target,t);
        plannedDistance=plannedField[index(origin.x,origin.y)];
      }

      const targetKey=`${state.target.x},${state.target.y}`;
      if(state.planTargetKey===targetKey){
        if(plannedDistance>=state.planDistance) state.planStalls++;
        else state.planStalls=0;
      }else{
        state.planTargetKey=targetKey;
        state.planStalls=0;
      }
      state.planDistance=plannedDistance;

      const coordinatedFlank=state.planType==='coordinate-left'||
        state.planType==='coordinate-right';
      const playerDistance=fieldFor(
        {x:targetPlayer.x,y:targetPlayer.y},t
      )[index(origin.x,origin.y)];
      const strikeRange=4+Math.round(intelligence*4);

      // A flank point is only an approach waypoint, never a place to orbit.
      // Reaching it, getting close to the player, or failing to make progress
      // converts the plan immediately into a direct strike.
      if(coordinatedFlank&&(
        plannedDistance<=1||
        (playerDistance>=0&&playerDistance<=strikeRange)||
        state.planStalls>=3
      )){
        state.target={x:targetPlayer.x,y:targetPlayer.y};
        state.planType='coordinate-strike';
        state.planUntil=t+700+(1-intelligence)*700;
        state.planTargetKey=`${state.target.x},${state.target.y}`;
        state.planDistance=playerDistance;
        state.planStalls=0;
      }
      return state.target;
    }

    function choose(entity,origin,options,profile={},t=gameTimeNow()){
      // Keep the renderer informed about the route the brain is actually
      // considering. This metadata is visual only and never changes a choice.
      if(!options||!options.length){
        entity.brainVisualTarget=null;
        return null;
      }
      if(options.length===1){
        entity.brainVisualTarget=null;
        return options[0];
      }

      const state=stateFor(entity,t);
      const targetPlayer=selectTargetPlayer(entity,state,t);
      if(!targetPlayer){
        entity.brainVisualTarget=null;
        return options[(Math.random()*options.length)|0];
      }
      const attention=aggression(entity,profile,t,targetPlayer);
      const intelligence=evolvingIntelligence(profile,t);
      entity.brainIntelligence=intelligence;
      const straight=options.find(d=>
        entity.dir&&d.x===entity.dir.x&&d.y===entity.dir.y
      );

      // The brain is advice, not remote control. Ignoring it preserves each
      // creature's independent, occasionally foolish personality.
      // High aggression now means a clearer, more purposeful chase. It still
      // never reaches certainty, so temperament and occasional mistakes stay.
      const maximumListenChance=intelligence>=0.999999?1:0.98;
      const listenChance=clamp(
        0.08+attention*0.94+(profile.listenBoost||0)+
          intelligence*0.58,
        0.10,
        maximumListenChance
      );
      if(Math.random()>listenChance){
        entity.brainVisualTarget=null;
        if(straight&&Math.random()<(0.48+(1-attention)*0.28)) return straight;
        return options[(Math.random()*options.length)|0];
      }

      const fleeing=profile.behavior==='flee';
      // A fleeing creature uses the same shortest-path map in reverse: each
      // intelligent choice seeks the route tile farthest from the player.
      const target=fleeing
        ? {x:targetPlayer.x,y:targetPlayer.y}
        : tacticalTarget(entity,origin,profile,attention,targetPlayer,t);
      entity.brainVisualTarget={x:target.x,y:target.y};
      const field=fieldFor(target,t);
      const originKey=`${origin.x},${origin.y}`;
      state.routeHistory.push(originKey);
      if(state.routeHistory.length>16) state.routeHistory.shift();
      const ranked=options.map(d=>{
        const nx=origin.x+d.x,ny=origin.y+d.y;
        const distance=field[index(nx,ny)];
        const straightBonus=straight===d ? 0.16 : 0;
        const repeatPenalty=state.lastChoice&&
          state.lastChoice.x===-d.x&&state.lastChoice.y===-d.y ? 0.22 : 0;
        const nextKey=`${nx},${ny}`;
        const recentVisits=state.routeHistory.reduce(
          (count,key)=>count+(key===nextKey?1:0),0
        );
        const loopPenalty=recentVisits*(0.8+intelligence*3.2);
        return {
          d,
          score:(distance<0?10000:(fleeing?-distance:distance))-
            straightBonus+repeatPenalty+loopPenalty
        };
      }).sort((a,b)=>a.score-b.score);

      let choice=ranked[0];
      const coordinatedPlan=typeof state.planType==='string'&&
        state.planType.startsWith('coordinate-');

      // Route diversity comes from the distinct center/left/right targets.
      // Once a role has a target, every step toward it uses the best route.
      // Deliberately choosing the second-best step here caused short snakes
      // to orbit forever inside 2x2 and 3x3 open cells.

      // A highly alert inhabitant occasionally commits to the second viable
      // route. This is intentional flanking, not an error: it can disappear
      // behind a wall and approach from another passage.
      if(!fleeing&&!coordinatedPlan&&
         attention>0.68&&t>=state.surpriseAt&&ranked.length>1){
        state.surpriseAt=t+10000+Math.random()*16000;
        if(Math.random()<0.24){
          const alternatives=ranked.slice(1).filter(item=>
            item.score<10000&&item.score<=ranked[0].score+6
          );
          if(alternatives.length){
            choice=alternatives[(Math.random()*alternatives.length)|0];
            state.target=nearestRouteTile({
              x:targetPlayer.x+(Math.random()<0.5?1:-1)*(2+((Math.random()*4)|0)),
              y:targetPlayer.y+(Math.random()<0.5?1:-1)*(2+((Math.random()*4)|0))
            },t);
            state.planType='flank';
            state.planUntil=t+1800+Math.random()*2600;
          }
        }
      }

      state.lastChoice={...choice.d};
      return choice.d;
    }

    // Human pointer navigation uses the same exact maze-distance fields as
    // the inhabitants. The resolved target may be beside a clicked wall, and
    // each step remains a true shortest-path step around walls and solid eggs.
    function resolveRouteTarget(target,t=gameTimeNow()){
      return nearestRouteTile(target,t);
    }

    function routeDistance(from,target,t=gameTimeNow()){
      if(!from||from.x<0||from.y<0||from.x>=COLS||from.y>=ROWS)
        return Infinity;
      const safeTarget=nearestRouteTile(target,t);
      const distance=fieldFor(safeTarget,t)[index(from.x,from.y)];
      return distance<0?Infinity:distance;
    }

    // Purely visual look-ahead: find the first planned 90-degree turn within
    // the next three complete cells. It reuses cached route fields and never
    // consumes randomness, mutates the entity, or changes collision logic.
    function previewTurn(entity,target,maxStraightCells=3,t=gameTimeNow()){
      if(!entity?.dir) return null;
      const lookahead=Math.max(0,Math.min(3,maxStraightCells|0));
      const validTarget=target&&Number.isFinite(target.x)&&Number.isFinite(target.y);
      const safeTarget=validTarget?nearestRouteTile(target,t):null;
      if(safeTarget&&entity.x===safeTarget.x&&entity.y===safeTarget.y)
        return null;
      const field=safeTarget?fieldFor(safeTarget,t):null;
      let x=entity.x,y=entity.y;
      let facing={x:entity.dir.x,y:entity.dir.y};
      const ignoredSideOpenings=[];

      for(let straightCells=0;straightCells<=lookahead;straightCells++){
        const reverse={x:-facing.x,y:-facing.y};
        const passable=dirs.filter(d=>{
          const nx=x+d.x,ny=y+d.y;
          if(isWall(nx,ny)||occupiedBySolidEgg(nx,ny,t)) return false;
          return !entity.isAI||playerCellIsSafeForRoute(entity,nx,ny,t);
        });
        if(!passable.length) return null;

        let choice=null;
        if(field){
          const ranked=passable.map(d=>({
            d,
            distance:field[index(x+d.x,y+d.y)],
            straight:sameDirection(d,facing)
          })).filter(item=>item.distance>=0).sort((a,b)=>
            a.distance-b.distance||Number(b.straight)-Number(a.straight)
          );
          choice=ranked[0]?.d||null;
        }else{
          // Without a tactical target, anticipate only a forced corridor bend;
          // never invent a branch decision the creature has not made yet.
          const forward=passable.find(d=>sameDirection(d,facing));
          const nonReverse=passable.filter(d=>!sameDirection(d,reverse));
          if(forward) choice=forward;
          else if(nonReverse.length===1) choice=nonReverse[0];
          else if(passable.length===1) choice=passable[0];
          else return null;
        }
        if(!choice) return null;
        if(!sameDirection(choice,facing)){
          // A held turn direction would have entered an earlier matching
          // opening. Keep the creature visually straight until that unused
          // branch is behind it, then the next cell recomputes the preview.
          if(ignoredSideOpenings.some(opening=>
            sameDirection(opening,choice)
          )) return null;
          return {
            direction:{x:choice.x,y:choice.y},
            cellsBeforeTurn:straightCells
          };
        }
        for(const direction of passable){
          if(sameDirection(direction,choice)||
             sameDirection(direction,reverse)) continue;
          ignoredSideOpenings.push({x:direction.x,y:direction.y});
        }
        x+=choice.x;
        y+=choice.y;
        facing={x:choice.x,y:choice.y};
      }
      return null;
    }

    function routeStep(entity,target,t=gameTimeNow()){
      const safeTarget=nearestRouteTile(target,t);
      if(entity.x===safeTarget.x&&entity.y===safeTarget.y) return null;
      const field=fieldFor(safeTarget,t);
      const candidates=dirs.map(d=>{
        const x=entity.x+d.x,y=entity.y+d.y;
        if(isWall(x,y)||occupiedBySolidEgg(x,y,t)||
           !playerCellIsSafeForRoute(entity,x,y,t))
          return null;
        const distance=field[index(x,y)];
        if(distance<0) return null;
        const straight=entity.dir&&d.x===entity.dir.x&&d.y===entity.dir.y;
        return {d,distance,straight};
      }).filter(Boolean).sort((a,b)=>
        a.distance-b.distance || Number(b.straight)-Number(a.straight)
      );
      return candidates.length?{...candidates[0].d}:null;
    }

    return {
      update,choose,aggression,
      resolveRouteTarget,routeDistance,routeStep,previewTurn
    };
  })();

  // Dedicated snake-hunter intelligence for the optional AI player. It keeps
  // one persistent prey assignment, maintains cached shortest-route fields
  // and evaluates every legal step without adopting human support objectives.
  const AllyBrain=(()=>{
    const index=(x,y)=>y*COLS+x;
    let atlasRevision=-1;
    let routeAtlas=[];

    function buildField(target,isPassable){
      const field=new Int16Array(COLS*ROWS);
      field.fill(-1);
      const queueX=new Int16Array(COLS*ROWS);
      const queueY=new Int16Array(COLS*ROWS);
      let read=0,write=0;
      field[index(target.x,target.y)]=0;
      queueX[write]=target.x;queueY[write++]=target.y;
      while(read<write){
        const x=queueX[read],y=queueY[read++];
        const nextDistance=field[index(x,y)]+1;
        for(const d of dirs){
          const nx=x+d.x,ny=y+d.y;
          if(!isPassable(nx,ny,target)) continue;
          const nextIndex=index(nx,ny);
          if(field[nextIndex]>=0) continue;
          field[nextIndex]=nextDistance;
          queueX[write]=nx;queueY[write++]=ny;
        }
      }
      return field;
    }

    // At level start every floor cell receives a full distance field. These
    // fields describe only the permanent maze geometry, so a passing creature,
    // player or egg can never make the AI forget that its prey is reachable.
    function scanMaze(force=false){
      if(!force&&atlasRevision===mazeRevision&&routeAtlas.length) return;
      const total=COLS*ROWS;
      routeAtlas=new Array(total).fill(null);

      // Precompute the immutable floor graph once, then run each breadth-first
      // scan entirely on integer cell indexes. This produces the exact same
      // shortest-path atlas without repeatedly calling isWall(), allocating
      // coordinate objects or traversing the four direction objects.
      const neighbours=new Int16Array(total*4);
      neighbours.fill(-1);
      const floorCells=[];
      for(let y=0;y<ROWS;y++){
        for(let x=0;x<COLS;x++){
          if(maze[y][x]==='#') continue;
          const cell=index(x,y);
          floorCells.push(cell);
          let count=0;
          if(x+1<COLS&&maze[y][x+1]!=='#') neighbours[cell*4+count++]=cell+1;
          if(x>0&&maze[y][x-1]!=='#') neighbours[cell*4+count++]=cell-1;
          if(y+1<ROWS&&maze[y+1][x]!=='#') neighbours[cell*4+count++]=cell+COLS;
          if(y>0&&maze[y-1][x]!=='#') neighbours[cell*4+count++]=cell-COLS;
        }
      }

      const queue=new Int16Array(total);
      for(const targetCell of floorCells){
        const field=new Int16Array(total);
        field.fill(-1);
        let read=0,write=0;
        field[targetCell]=0;
        queue[write++]=targetCell;
        while(read<write){
          const cell=queue[read++];
          const nextDistance=field[cell]+1;
          const neighbourOffset=cell*4;
          for(let slot=0;slot<4;slot++){
            const nextCell=neighbours[neighbourOffset+slot];
            if(nextCell<0) break;
            if(field[nextCell]>=0) continue;
            field[nextCell]=nextDistance;
            queue[write++]=nextCell;
          }
        }
        routeAtlas[targetCell]=field;
      }
      atlasRevision=mazeRevision;
    }

    function nearestRouteTarget(target){
      const rounded={
        x:Math.max(0,Math.min(COLS-1,Math.round(target.x))),
        y:Math.max(0,Math.min(ROWS-1,Math.round(target.y)))
      };
      if(!isWall(rounded.x,rounded.y)) return rounded;
      for(let radius=1;radius<Math.max(COLS,ROWS);radius++){
        for(let dy=-radius;dy<=radius;dy++){
          for(let dx=-radius;dx<=radius;dx++){
            if(Math.abs(dx)+Math.abs(dy)!==radius) continue;
            const x=rounded.x+dx,y=rounded.y+dy;
            if(x>=0&&y>=0&&x<COLS&&y<ROWS&&!isWall(x,y)) return {x,y};
          }
        }
      }
      return {x:1,y:1};
    }

    function fieldFor(target,t,traveler=null){
      scanMaze();
      const safe=nearestRouteTarget(target);
      return routeAtlas[index(safe.x,safe.y)];
    }

    function distance(from,target,t,traveler=null){
      if(!from||from.x<0||from.y<0||from.x>=COLS||from.y>=ROWS)
        return Infinity;
      const value=fieldFor(target,t,traveler)[index(from.x,from.y)];
      return value<0?Infinity:value;
    }

    // Route to a bite target without pretending that the rest of that same
    // snake is empty floor. This is especially important in one-cell tunnels:
    // a middle segment behind the tail is not a reachable split opportunity.
    function objectiveFieldFor(objective,t,traveler){
      const safe=nearestRouteTarget(objective.target);
      const targetSnake=objective?.details?.snake||null;
      const occupiedByTargetSnake=new Set(
        (targetSnake?.body||[]).map(cell=>`${cell.x},${cell.y}`)
      );
      const passable=(x,y,goal)=>{
        if(x<0||y<0||x>=COLS||y>=ROWS||isWall(x,y)) return false;
        if(x===goal.x&&y===goal.y) return true;
        return !occupiedByTargetSnake.has(`${x},${y}`);
      };
      return buildField(safe,passable);
    }

    function detourFieldFor(target,t,traveler){
      const safe=nearestRouteTarget(target);
      const passable=(x,y,goal)=>{
        if(x<0||y<0||x>=COLS||y>=ROWS||isWall(x,y)) return false;
        if(x===goal.x&&y===goal.y) return true;
        if(x===traveler.x&&y===traveler.y) return true;
        if(occupiedBySolidEgg(x,y,t)||
           !playerCellIsSafeForRoute(traveler,x,y,t)) return false;
        if(snakes.some(s=>s.body.some(cell=>cell.x===x&&cell.y===y))) return false;
        if(!hasCombatPower(traveler,t)){
          if(hunters.some(h=>h.x===x&&h.y===y)) return false;
          if(hunters.some(h=>h.x+h.dir.x===x&&h.y+h.dir.y===y)) return false;
          if(snakes.some(s=>
            s.body[0]&&s.body[0].x+s.dir.x===x&&s.body[0].y+s.dir.y===y
          )) return false;
        }
        return true;
      };
      return buildField(safe,passable);
    }

    function legalDirections(p,t){
      return dirs.filter(d=>{
        const x=p.x+d.x,y=p.y+d.y;
        return !isWall(x,y)&&!occupiedBySolidEgg(x,y,t)&&
          playerCellIsSafeForRoute(p,x,y,t);
      });
    }

    function sameCell(a,b){
      return !!a&&!!b&&a.x===b.x&&a.y===b.y;
    }

    function combatPressure(p,t){
      if(hasCombatPower(p,t)) return 0;
      let pressure=0;
      snakes.forEach(s=>{
        const head=s.body[0];
        if(!head) return;
        const range=Math.abs(head.x-p.x)+Math.abs(head.y-p.y);
        if(range<=2) pressure+=2;
        else if(range<=5) pressure+=1;
      });
      hunters.forEach(h=>{
        const range=Math.abs(h.x-p.x)+Math.abs(h.y-p.y);
        if(range<=2) pressure+=2;
        else if(range<=4) pressure+=1;
      });
      return pressure;
    }

    // A branch is a real cul-de-sac when, after entering it, the permanent
    // maze offers no route back through a different neighbour of the current
    // cell. Entering remains fully valid when the chosen objective is inside
    // that branch or when every available route is itself a cul-de-sac.
    function entersUnneededCulDeSac(p,x,y,objective){
      const startKey=`${p.x},${p.y}`;
      const otherExits=new Set(dirs.map(d=>({x:p.x+d.x,y:p.y+d.y}))
        .filter(cell=>!isWall(cell.x,cell.y)&&
          !(cell.x===x&&cell.y===y))
        .map(cell=>`${cell.x},${cell.y}`));
      if(!otherExits.size) return false;

      const target=objective?.target||null;
      const visited=new Set([startKey,`${x},${y}`]);
      const queue=[{x,y}];
      for(let read=0;read<queue.length;read++){
        const cell=queue[read];
        if(target&&cell.x===target.x&&cell.y===target.y) return false;
        if(otherExits.has(`${cell.x},${cell.y}`)) return false;
        for(const d of dirs){
          const nx=cell.x+d.x,ny=cell.y+d.y;
          const key=`${nx},${ny}`;
          if(visited.has(key)||isWall(nx,ny)) continue;
          visited.add(key);
          queue.push({x:nx,y:ny});
        }
      }
      return true;
    }

    function cleanTargetCooldowns(p,t){
      if(!p.aiTargetCooldowns) p.aiTargetCooldowns=new Map();
      for(const [snake,until] of p.aiTargetCooldowns){
        if(until<=t||!snakes.includes(snake))
          p.aiTargetCooldowns.delete(snake);
      }
    }

    function snakeCoolingDown(p,s,t){
      return (p.aiTargetCooldowns?.get(s)||0)>t;
    }

    function hasReachableAlternativeSnake(p,t,excluded){
      cleanTargetCooldowns(p,t);
      return snakes.some(s=>{
        if(s===excluded||snakeCoolingDown(p,s,t)||!s.body.length) return false;
        const target=s.body.length>1?s.body[s.body.length-1]:s.body[0];
        const objective={
          type:'alternative-tail',target:{...target},
          details:{snake:s,kind:s.body.length>1?'tail':'head'}
        };
        const permanent=objectiveFieldFor(objective,t,p);
        if(permanent[index(p.x,p.y)]<0) return false;
        const dynamic=detourFieldFor(target,t,p);
        return dynamic[index(p.x,p.y)]>=0;
      });
    }

    function retreatCellIsSafe(p,x,y,t,state=null){
      if(x<0||y<0||x>=COLS||y>=ROWS||isWall(x,y)) return false;
      if(occupiedBySolidEgg(x,y,t)||
         !playerCellIsSafeForRoute(p,x,y,t)) return false;
      const key=`${x},${y}`;
      if(state?.avoidCells?.get(key)>t) return false;
      if(snakes.some(s=>s.body.some(cell=>cell.x===x&&cell.y===y)))
        return false;
      if(hunters.some(h=>h.x===x&&h.y===y)) return false;

      // A retreat route is allowed to cross a tile only while no mouth is
      // already committed to that tile. This keeps self-preservation active
      // even when the locked prey is somewhere beyond the danger.
      if(!hasCombatPower(p,t)){
        if(snakes.some(s=>{
          const head=s.body[0];
          return head&&head.x+s.dir.x===x&&head.y+s.dir.y===y;
        })) return false;
        if(hunters.some(h=>h.x+h.dir.x===x&&h.y+h.dir.y===y))
          return false;
      }
      return true;
    }

    function selectRetreatWaypoint(p,state,t){
      for(const [key,until] of state.avoidCells){
        if(until<=t) state.avoidCells.delete(key);
      }
      const startKey=`${p.x},${p.y}`;
      const visited=new Set([startKey]);
      const queue=[{x:p.x,y:p.y,lastDir:null,turns:0,steps:0}];
      let best=null;

      const better=(candidate,current)=>{
        if(!current) return true;
        const minSteps=Math.max(4,state.turnGoal+1);
        const candidateMeets=candidate.turns>=state.turnGoal&&
          candidate.steps>=minSteps;
        const currentMeets=current.turns>=state.turnGoal&&
          current.steps>=minSteps;
        if(candidateMeets!==currentMeets) return candidateMeets;
        if(candidateMeets){
          if(candidate.steps!==current.steps)
            return candidate.steps<current.steps;
          return candidate.distanceFromBlock>current.distanceFromBlock;
        }
        if(candidate.turns!==current.turns)
          return candidate.turns>current.turns;
        if(candidate.deadEnd!==current.deadEnd)
          return candidate.deadEnd;
        if(candidate.steps!==current.steps)
          return candidate.steps>current.steps;
        return candidate.distanceFromBlock>current.distanceFromBlock;
      };

      for(let q=0;q<queue.length;q++){
        const node=queue[q];
        if(node.steps>0){
          const degree=dirs.filter(d=>retreatCellIsSafe(
            p,node.x+d.x,node.y+d.y,t,state
          )).length;
          const candidate={
            ...node,
            deadEnd:degree<=1,
            distanceFromBlock:state.blockedCell
              ?Math.abs(node.x-state.blockedCell.x)+
                Math.abs(node.y-state.blockedCell.y)
              :node.steps
          };
          if(better(candidate,best)) best=candidate;
        }

        for(const d of dirs){
          const nx=node.x+d.x,ny=node.y+d.y;
          if(!retreatCellIsSafe(p,nx,ny,t,state)) continue;
          const key=`${nx},${ny}`;
          if(visited.has(key)) continue;
          visited.add(key);
          const turned=!!node.lastDir&&
            (node.lastDir.x!==d.x||node.lastDir.y!==d.y);
          queue.push({
            x:nx,y:ny,lastDir:{...d},
            turns:node.turns+(turned?1:0),steps:node.steps+1
          });
        }
      }
      return best?{x:best.x,y:best.y}:null;
    }

    function clearBlockedRetreat(p){
      p.aiBlockedRetreat=null;
      p.aiRecentCells=[];
      p.aiLastBlockedStep=null;
    }

    function beginBlockedRetreat(p,objective,blockedCell,t,reason){
      const avoidCells=new Map();
      if(blockedCell) avoidCells.set(`${blockedCell.x},${blockedCell.y}`,t+9000);
      const state={
        snake:objective?.details?.snake||p.aiLockedSnake||null,
        kind:objective?.details?.kind||objective?.type||'route',
        originalTarget:objective?.target?{...objective.target}:null,
        blockedCell:blockedCell?{x:blockedCell.x,y:blockedCell.y}:null,
        reason,
        turnGoal:3+((Math.random()*3)|0),
        startedAt:t,
        steps:0,
        turnsTaken:0,
        lastObservedCell:`${p.x},${p.y}`,
        lastMoveDir:null,
        visited:new Set([`${p.x},${p.y}`]),
        avoidCells,
        waypoint:null
      };
      state.waypoint=selectRetreatWaypoint(p,state,t);
      if(!state.waypoint) return false;
      p.aiBlockedRetreat=state;
      p.aiRecentCells=[];
      p.aiDetourUntil=0;
      return true;
    }

    function rememberAiCell(p,t){
      if(!p.aiRecentCells) p.aiRecentCells=[];
      const key=`${p.x},${p.y}`;
      if(p.aiObservedX==null||p.aiObservedY==null){
        p.aiObservedX=p.x;
        p.aiObservedY=p.y;
      }else if(p.aiObservedX!==p.x||p.aiObservedY!==p.y){
        const move={x:p.x-p.aiObservedX,y:p.y-p.aiObservedY};
        if(p.aiRunDirection&&move.x===p.aiRunDirection.x&&
           move.y===p.aiRunDirection.y){
          p.aiRunLength=(p.aiRunLength||0)+1;
        }else{
          p.aiRunDirection={...move};
          p.aiRunLength=1;
        }
        p.aiObservedX=p.x;
        p.aiObservedY=p.y;
      }
      const last=p.aiRecentCells[p.aiRecentCells.length-1];
      if(!last||last.key!==key) p.aiRecentCells.push({key,t});
      while(p.aiRecentCells.length>8) p.aiRecentCells.shift();
      const h=p.aiRecentCells,n=h.length;
      return n>=4&&h[n-1].key===h[n-3].key&&
        h[n-2].key===h[n-4].key;
    }

    function followBlockedRetreat(p,t,options){
      const state=p.aiBlockedRetreat;
      if(!state) return false;
      if(state.snake&&!snakes.includes(state.snake)){
        clearBlockedRetreat(p);
        return false;
      }

      const currentKey=`${p.x},${p.y}`;
      if(currentKey!==state.lastObservedCell){
        state.steps++;
        if(state.lastMoveDir&&
           (state.lastMoveDir.x!==p.dir.x||state.lastMoveDir.y!==p.dir.y))
          state.turnsTaken++;
        state.lastMoveDir={...p.dir};
        state.lastObservedCell=currentKey;
        state.visited.add(currentKey);
      }

      // The prey may be tried again only after the independently selected
      // retreat point has actually been reached. In a straight cul-de-sac this
      // naturally becomes its far end; in a richer maze it is normally three
      // to five real turns away.
      if(state.steps>0&&sameCell(p,state.waypoint)){
        clearBlockedRetreat(p);
        return false;
      }
      if(t-state.startedAt>22000){
        clearBlockedRetreat(p);
        return false;
      }

      const rebuildWaypoint=blockedTile=>{
        if(blockedTile)
          state.avoidCells.set(`${blockedTile.x},${blockedTile.y}`,t+6500);
        state.waypoint=selectRetreatWaypoint(p,state,t);
        return !!state.waypoint;
      };
      if(!state.waypoint||!retreatCellIsSafe(
        p,state.waypoint.x,state.waypoint.y,t,state
      )){
        if(!rebuildWaypoint(state.waypoint)){
          clearBlockedRetreat(p);
          return false;
        }
      }

      const makeField=()=>buildField(state.waypoint,(x,y,goal)=>{
        if(x===goal.x&&y===goal.y) return true;
        if(x===p.x&&y===p.y) return true;
        return retreatCellIsSafe(p,x,y,t,state);
      });
      let field=makeField();
      let routeExists=field[index(p.x,p.y)]>=0;
      if(!routeExists){
        const oldWaypoint={...state.waypoint};
        if(rebuildWaypoint(oldWaypoint)){
          field=makeField();
          routeExists=field[index(p.x,p.y)]>=0;
        }
      }

      const measured=options.map(d=>{
        const x=p.x+d.x,y=p.y+d.y;
        return {
          d,x,y,
          collision:collisionValue(p,d,x,y,t,null),
          danger:surroundingDanger(p,d,x,y,t),
          routeDistance:routeExists?field[index(x,y)]:-1,
          cellSafe:retreatCellIsSafe(p,x,y,t,state)
        };
      });
      const safe=measured.filter(step=>
        step.cellSafe&&step.collision<100000&&step.danger<105
      );
      let candidates=safe.filter(step=>step.routeDistance>=0);

      if(safe.length&&candidates.length===0){
        const oldWaypoint=state.waypoint?{...state.waypoint}:null;
        if(rebuildWaypoint(oldWaypoint)){
          field=makeField();
          candidates=safe.map(step=>({
            ...step,routeDistance:field[index(step.x,step.y)]
          })).filter(step=>step.routeDistance>=0);
        }
      }

      if(!candidates.length) candidates=safe.length?safe:measured;
      candidates.sort((a,b)=>{
        const score=step=>{
          const unreachable=step.routeDistance<0?400000:0;
          const lethal=step.collision>=100000?100000000:0;
          const visited=state.visited.has(`${step.x},${step.y}`)?3500:0;
          const reversal=state.lastMoveDir&&
            step.d.x===-state.lastMoveDir.x&&
            step.d.y===-state.lastMoveDir.y?2200:0;
          const route=step.routeDistance<0?0:step.routeDistance*10000;
          return lethal+unreachable+route+step.danger*60+
            step.collision+visited+reversal;
        };
        return score(a)-score(b);
      });
      const choice=candidates[0];
      if(!choice) return false;
      p.nextDir={...choice.d};
      p.aiThought={
        type:'blocked-retreat',target:{...state.waypoint},
        danger:Math.round(choice.danger),score:choice.routeDistance,
        reason:state.reason,turnGoal:state.turnGoal
      };
      p.aiLastDirection={...choice.d};
      p.aiDecisionAt=t;
      return true;
    }

    function collisionValue(p,d,x,y,t,objective=null){
      const powered=hasCombatPower(p,t);
      const opponent=teammateAt(p,x,y);
      if(opponent)
        return canPlayerEatPlayer(p,opponent,t)?-260:100000;
      // A non-snake objective (most importantly a fruit) never grants
      // permission to cross the body of the currently locked prey.
      const targetSnake=objective?.details?.snake||(!objective?p.aiLockedSnake:null);
      const target=objective?.target||null;
      const hunter=hunters.find(h=>h.x===x&&h.y===y);
      if(hunter) return powered?-180:100000;

      for(const s of snakes){
        const bodyIndex=s.body.findIndex(cell=>cell.x===x&&cell.y===y);
        if(bodyIndex<0) continue;
        const isExactTarget=s===targetSnake&&target&&target.x===x&&target.y===y;
        // Only the deliberately selected tail, head or middle segment may be
        // entered. All unrelated segments remain tactical obstacles.
        if(!isExactTarget) return 100000;
        if(bodyIndex===0){
          if(powered) return -170;
          const safeHeadBite=s.body.length===1
            ? !(d.x===-s.dir.x&&d.y===-s.dir.y)
            : d.x===s.dir.x&&d.y===s.dir.y;
          return safeHeadBite?-125:100000;
        }
        if(bodyIndex===s.body.length-1) return -150;
        return objective?.details?.kind==='split'?-185:100000;
      }
      return 0;
    }

    function forecastMouthCanEnter(s,x,y){
      if(isWall(x,y)||occupiedBySelf(x,y,s,true)||
         occupiedByScorpion(x,y)||occupiedByHunter(x,y)||
         occupiedBySolidEgg(x,y)) return false;
      const head=s.body[0];
      if(!head||Math.abs(head.x-x)+Math.abs(head.y-y)!==1) return false;
      const step={x:x-head.x,y:y-head.y};

      if(!s.reversing){
        // A forward-moving head may continue or select either side branch,
        // but it cannot instantly reverse into its neck.
        return !(step.x===-s.dir.x&&step.y===-s.dir.y);
      }

      if(s.body.length===1){
        const previous=s.headTrail?.length
          ?s.headTrail[s.headTrail.length-1]
          :null;
        // Backward contact by a reversing solitary head is its harmless rear.
        if(previous&&previous.x===x&&previous.y===y) return false;
        return true;
      }

      const neck=s.body[1];
      return !neck||neck.x!==x||neck.y!==y;
    }

    function mouthThreat(p,x,y,t){
      if(hasCombatPower(p,t)) return 0;
      let threat=0;
      for(const s of snakes){
        const head=s.body[0];
        if(!head) continue;
        const dx=x-head.x,dy=y-head.y;
        if(Math.abs(dx)+Math.abs(dy)!==1) continue;
        const alreadyFacing=dx===s.dir.x&&dy===s.dir.y;
        if(alreadyFacing) threat=Math.max(threat,260);
        else if(forecastMouthCanEnter(s,x,y))
          threat=Math.max(threat,165);
      }
      return threat;
    }

    function surroundingDanger(p,d,x,y,t){
      let danger=0;
      if(isCompetitiveMode()){
        teammatesOf(p).forEach(opponent=>{
          if(opponent.dead||opponent.lives<=0||
             !canPlayerEatPlayer(opponent,p,t)) return;
          const manhattan=Math.abs(opponent.x-x)+Math.abs(opponent.y-y);
          const frontX=opponent.x+opponent.dir.x;
          const frontY=opponent.y+opponent.dir.y;
          if(x===frontX&&y===frontY) danger+=260;
          else if(manhattan===1) danger+=190;
          else if(manhattan===2) danger+=70;
          else if(manhattan===3) danger+=22;
        });
      }
      if(hasCombatPower(p,t)) return danger;
      danger+=mouthThreat(p,x,y,t);
      for(const s of snakes){
        const head=s.body[0];
        const manhattan=Math.abs(head.x-x)+Math.abs(head.y-y);
        const frontX=head.x+s.dir.x,frontY=head.y+s.dir.y;
        if(x===frontX&&y===frontY) danger+=90;
        else if(manhattan===1) danger+=54;
        else if(manhattan===2) danger+=13;
      }
      for(const h of hunters){
        const manhattan=Math.abs(h.x-x)+Math.abs(h.y-y);
        const frontX=h.x+h.dir.x,frontY=h.y+h.dir.y;
        if(x===frontX&&y===frontY) danger+=175;
        else if(manhattan===1) danger+=115;
        else if(manhattan===2) danger+=30;
      }
      return danger;
    }

    function splitBodyIndexes(s){
      if(!s||s.body.length<3) return [];
      const center=(s.body.length-1)/2;
      return Array.from({length:s.body.length-2},(_,i)=>i+1)
        .sort((a,b)=>Math.abs(a-center)-Math.abs(b-center));
    }

    // A bite already available in the next cell must happen now. Strategic
    // replanning is not allowed to make the ally step away from an exposed
    // middle or tail. In Power Mode heads and hunters become explicit prey.
    function immediateAttackObjective(p,t,options){
      const powered=hasCombatPower(p,t);
      const pressured=!powered&&combatPressure(p,t)>=3;
      const cleanupSnake=powered&&p.aiHasBittenLockedSnake&&
        snakes.includes(p.aiLockedSnake)?p.aiLockedSnake:null;
      const attacks=[];
      const safeEscapeExists=options.some(d=>{
        const x=p.x+d.x,y=p.y+d.y;
        return collisionValue(p,d,x,y,t,null)<100000&&
          surroundingDanger(p,d,x,y,t)<105;
      });
      options.forEach(d=>{
        const x=p.x+d.x,y=p.y+d.y;
        if(powered){
          const hunter=hunters.find(h=>h.x===x&&h.y===y);
          if(hunter&&!cleanupSnake){
            attacks.push({
              type:'power-eat-hunter',target:{x,y},score:-360,
              details:{hunter,kind:'hunter',immediate:true},d
            });
          }
        }
        snakes.forEach(s=>{
          if(cleanupSnake&&s!==cleanupSnake) return;
          const bodyIndex=s.body.findIndex(cell=>cell.x===x&&cell.y===y);
          if(bodyIndex<0) return;
          const isHead=bodyIndex===0;
          const isTail=bodyIndex===s.body.length-1&&bodyIndex>0;
          const kind=isHead?'head':isTail?'tail':'split';
          // Power Mode is a cleanup sprint. Entering a middle segment would
          // manufacture additional fragments and heads, so only the two real
          // ends remain valid powered attack contacts.
          if(powered&&!isHead&&!isTail) return;
          if(isHead&&!powered){
            const probe={target:{x,y},details:{snake:s,kind}};
            if(collisionValue(p,d,x,y,t,probe)>=100000) return;
          }
          // An exposed tail or middle is not worth stepping into the mouth of
          // a different inhabitant. Only a genuinely trapped ally may choose
          // the least bad contact instead of a safe escape cell.
          if(!powered&&safeEscapeExists&&
             surroundingDanger(p,d,x,y,t)>=105) return;
          if(pressured&&kind==='split'&&safeEscapeExists) return;
          const priority=powered&&isHead?-520:powered&&isTail?-500:
            kind==='split'?-240:
            kind==='tail'?-220:-180;
          const locked=s===p.aiLockedSnake?-12:0;
          const straight=d.x===p.dir.x&&d.y===p.dir.y?-6:0;
          attacks.push({
            type:powered&&isHead?'power-eat-snake-head':
              kind==='split'?'immediate-split':
              kind==='tail'?'immediate-tail-bite':'immediate-head-bite',
            target:{x,y},score:priority+locked+straight,
            details:{snake:s,kind,bodyIndex,immediate:true},d
          });
        });
      });
      attacks.sort((a,b)=>a.score-b.score);
      return attacks[0]||null;
    }

    function chooseObjective(p,t,selectionSkill=null){
      const objectives=[];
      cleanTargetCooldowns(p,t);
      if(selectionSkill&&typeof p.aiGradedAllowSplit!=='boolean')
        p.aiGradedAllowSplit=Math.random()<selectionSkill.snakeSplitChance;
      const pressured=combatPressure(p,t)>=3;
      if(pressured&&p.aiSplitCommit&&!p.aiHasBittenLockedSnake)
        p.aiSplitCommit=null;
      const firstStepRisk=(objective,field)=>{
        const steps=legalDirections(p,t).map(d=>{
          const x=p.x+d.x,y=p.y+d.y;
          const routeDistance=field[index(x,y)];
          const collision=collisionValue(p,d,x,y,t,objective);
          const danger=surroundingDanger(p,d,x,y,t);
          return {routeDistance,collision,danger};
        }).filter(step=>step.routeDistance>=0);
        if(!steps.length) return 80;
        const bestDistance=Math.min(...steps.map(step=>step.routeDistance));
        const bestSteps=steps.filter(step=>step.routeDistance===bestDistance);
        const safest=Math.min(...bestSteps.map(step=>
          (step.collision>=100000?55:0)+
          (step.danger>=105?18:step.danger/35)
        ));
        return safest;
      };

      const consider=(type,target,base,details={})=>{
        if(details.snake&&!details.committed&&!isPowerMode(p,t)&&
           snakeCoolingDown(p,details.snake,t)) return false;
        const objective={
          type,
          target:{x:target.x,y:target.y},
          score:0,
          details:{...details}
        };
        const field=objectiveFieldFor(objective,t,p);
        const routeDistance=field[index(p.x,p.y)];
        if(routeDistance<0) return false;
        const loyalty=details.snake===p.aiLockedSnake&&
          details.kind===p.aiTargetKind?-0.35:0;
        objective.score=base+routeDistance+
          firstStepRisk(objective,field)+loyalty;
        objectives.push(objective);
        return true;
      };

      function tacticalFruitObjective(){
        // Never interrupt the literal act of finishing a bitten tail or a
        // committed split. Outside those sequences, a nearby fruit is worth a
        // short detour when the resulting speed and Power Mode save more time
        // than the detour costs.
        if(p.aiFruitTarget&&!fruits.includes(p.aiFruitTarget))
          p.aiFruitTarget=null;
        if(!fruits.length||p.aiHasBittenLockedSnake)
          return null;

        const powered=isPowerMode(p,t);
        const remainingPower=Math.max(0,(p.powerModeUntil||0)-t);
        let preyTarget=null;
        if(p.aiLockedSnake&&snakes.includes(p.aiLockedSnake)){
          const s=p.aiLockedSnake;
          preyTarget=s.body.length>1?s.body[s.body.length-1]:s.body[0];
        }else{
          const nearest=snakes.map(s=>{
            const target=s.body.length>1?s.body[s.body.length-1]:s.body[0];
            return {target,route:distance(p,target,t,p)};
          }).sort((a,b)=>a.route-b.route)[0];
          preyTarget=nearest?.target||null;
        }

        const directPreyDistance=preyTarget
          ?distance(p,preyTarget,t,p)
          :0;
        const maxFruitDistance=powered
          ?(remainingPower<=4500?8:5)
          :15;
        const candidates=[];

        fruits.forEach(fruit=>{
          const committed=fruit===p.aiFruitTarget;
          const objective={
            type:'tactical-fruit',
            target:{x:fruit.x,y:fruit.y},
            score:0,
            details:{
              fruit,fruitKind:fruit.kind,poweredExtension:powered,
              committedFruit:committed,priorityFruit:false
            }
          };
          const field=objectiveFieldFor(objective,t,p);
          const routeDistance=field[index(p.x,p.y)];
          if(routeDistance<0||
             routeDistance>maxFruitDistance+(committed?4:0)) return;

          const maxDetour=powered
            ?(remainingPower<=4500?6:3)
            :(routeDistance<=10?10:6);

          let detour=0;
          if(preyTarget&&Number.isFinite(directPreyDistance)){
            const afterFruit=distance(fruit,preyTarget,t,p);
            if(!Number.isFinite(afterFruit)) return;
            detour=Math.max(0,routeDistance+afterFruit-directPreyDistance);
          }
          if(detour>maxDetour+(committed?6:0)) return;

          const priorityFruit=committed||
            (routeDistance<=7&&detour<=5);
          objective.details.priorityFruit=priorityFruit;
          const risk=firstStepRisk(objective,field);
          if(risk>=18) return;
          const powerBenefit=powered
            ?(remainingPower<=3000?-13:-6)
            :-18;
          objective.score=routeDistance+detour*1.35+risk+powerBenefit-
            Math.max(0,Math.min(3,fruit.kind||0))*0.4-
            (committed?12:0)-(priorityFruit?100:0);
          candidates.push(objective);
        });

        candidates.sort((a,b)=>a.score-b.score);
        return candidates[0]||null;
      }

      // Re-evaluate every snake on every move. A small loyalty tie-breaker keeps
      // an equally good plan stable, but a shorter tail, a profitable middle
      // bite or a newly dangerous first step changes the target immediately.
      p.aiHuntQueue=(p.aiHuntQueue||[]).filter(s=>snakes.includes(s));
      if(p.aiLockedSnake&&!snakes.includes(p.aiLockedSnake)){
        p.aiLockedSnake=null;
        p.aiHasBittenLockedSnake=false;
        p.aiCommitMode=null;
      }
      if(p.aiGradedSnake&&!snakes.includes(p.aiGradedSnake)){
        p.aiGradedSnake=null;
        p.aiGradedKind=null;
        p.aiSnakeChoiceUntil=0;
      }

      const tacticalFruit=tacticalFruitObjective();
      if(tacticalFruit) return tacticalFruit;

      // Power Mode is a cleanup sprint, not a score-farming phase. Once an
      // end of a snake has been bitten, consume that same snake completely.
      // Otherwise choose the nearest head or tail and never create a middle
      // split. Hostile people are considered only when no snake endpoint has
      // a route (adjacent hunters are still eaten by the immediate layer).
      if(isPowerMode(p,t)){
        p.aiSplitCommit=null;
        if(p.aiHasBittenLockedSnake&&p.aiLockedSnake&&
           snakes.includes(p.aiLockedSnake)&&p.aiLockedSnake.body.length){
          const s=p.aiLockedSnake;
          const target=s.body.length>1?s.body[s.body.length-1]:s.body[0];
          consider('power-finish-snake',target,-2000,{
            snake:s,kind:s.body.length>1?'tail':'head',
            committed:true,powered:true
          });
          if(objectives.length) return objectives[0];
        }

        snakes.forEach(s=>{
          if(!s.body.length) return;
          const lockedBonus=s===p.aiLockedSnake?-2:0;
          consider('power-cleanup-head',s.body[0],-90+lockedBonus,{
            snake:s,kind:'head',bodyIndex:0,powered:true
          });
          if(s.body.length>1){
            consider('power-cleanup-tail',s.body[s.body.length-1],
              -92+lockedBonus,{
                snake:s,kind:'tail',bodyIndex:s.body.length-1,powered:true
              });
          }
        });
        objectives.sort((a,b)=>a.score-b.score);
        if(objectives.length) return objectives[0];

        hunters.forEach(h=>consider(
          'power-hunt-enemy',h,-20,{hunter:h,kind:'hunter',powered:true}
        ));
        objectives.sort((a,b)=>a.score-b.score);
        if(objectives.length) return objectives[0];
      }

      // A chosen middle bite is a real tactical commitment, not a suggestion
      // that is scored again on every cell. Follow the same moving snake and
      // the same relative part of its body until the split succeeds. Dynamic
      // dangers may force a detour, but cannot make the ally oscillate between
      // the tail and the middle of the same snake.
      if(p.aiSplitCommit&&(
        !snakes.includes(p.aiSplitCommit.snake)||
        p.aiSplitCommit.snake.body.length<3
      )) p.aiSplitCommit=null;
      if(p.aiSplitCommit){
        const committed=p.aiSplitCommit;
        const s=committed.snake;
        const bodyIndex=Math.max(1,Math.min(
          s.body.length-2,
          Math.round(committed.fraction*Math.max(1,s.body.length-1))
        ));
        const target=s.body[bodyIndex];
        const splitStillReachable=consider('committed-split',target,-1000,{
          snake:s,kind:'split',bodyIndex,committed:true
        });
        if(splitStillReachable) return objectives[0];

        // If the exact moving segment became hidden by a turn, keep the split
        // intention and retarget another reachable internal segment of the
        // same snake before considering any retreat or different prey.
        splitBodyIndexes(s).filter(i=>i!==bodyIndex).forEach(i=>{
          const centerPenalty=Math.abs(i-(s.body.length-1)/2)*0.15;
          consider('committed-split-retarget',s.body[i],-900+centerPenalty,{
            snake:s,kind:'split',bodyIndex:i,committed:true
          });
        });
        objectives.sort((a,b)=>a.score-b.score);
        if(objectives.length){
          const replacement=objectives[0];
          p.aiSplitCommit.fraction=replacement.details.bodyIndex/
            Math.max(1,s.body.length-1);
          return replacement;
        }

        // Only when no internal segment can be reached at all may the attack
        // fall back to the physical tail.
        p.aiSplitCommit=null;
      }

      // Once the ally has reached and bitten a tail, keep following the new
      // physical end after every removed segment. Without this explicit state,
      // the next scoring pass could prefer a middle cell and make the ally stop
      // directly beside the snake instead of completing the bite sequence.
      if(p.aiHasBittenLockedSnake&&p.aiLockedSnake&&
        snakes.includes(p.aiLockedSnake)&&p.aiLockedSnake.body.length){
        const s=p.aiLockedSnake;
        const target=s.body.length>1?s.body[s.body.length-1]:s.body[0];
        const kind=s.body.length>1?'tail':'head';
        consider('committed-tail-finish',target,-1000,{
          snake:s,kind,committed:true
        });
        if(objectives.length) return objectives[0];
        return {
          type:'committed-tail-wait',
          target:{x:target.x,y:target.y},
          score:10000,
          details:{snake:s,kind,committed:true}
        };
      }

      // Honour a fixed snake. If its tail is cut off by its own body geometry,
      // actively search every internal segment of that same snake for a split
      // route instead of approaching the head and reversing at the last cell.
      if(p.aiLockedSnake&&snakes.includes(p.aiLockedSnake)&&
        !p.aiHasBittenLockedSnake){
        const s=p.aiLockedSnake;
        const tail=s.body.length>1?s.body[s.body.length-1]:s.body[0];
        const tailReachable=consider(
          'locked-snake-tail',tail,-1,{snake:s,kind:s.body.length>1?'tail':'head'}
        );
        if(!tailReachable&&s.body.length>=3&&!pressured&&(
          !selectionSkill||p.aiGradedAllowSplit
        )){
          splitBodyIndexes(s).forEach(i=>{
            const centerPenalty=Math.abs(i-(s.body.length-1)/2)*0.2;
            consider('locked-snake-split',s.body[i],-12+centerPenalty,{
              snake:s,kind:'split',bodyIndex:i
            });
          });
          objectives.sort((a,b)=>a.score-b.score);
          if(objectives.length) return objectives[0];
        }
        objectives.length=0;
      }

      snakes.forEach(s=>{
        const tail=s.body.length>1?s.body[s.body.length-1]:s.body[0];
        const tailKind=s.body.length>1?'tail':'head';
        consider(s.body.length>1?'eat-tail':'eat-solitary-head',tail,0,{
          snake:s,kind:tailKind
        });

        if(s.body.length>=3&&!pressured){
          const indexes=splitBodyIndexes(s);
          const splitBonus=Math.min(6.5,4.2+s.body.length*0.2);
          indexes.forEach(bodyIndex=>consider(
            'split-snake',s.body[bodyIndex],-splitBonus+
              Math.abs(bodyIndex-(s.body.length-1)/2)*0.2,
            {snake:s,kind:'split',bodyIndex}
          ));
        }
      });

      objectives.sort((a,b)=>a.score-b.score);
      if(objectives.length){
        // In competitive modes every difficulty hunts deliberately. What
        // changes is the quality and stability of the selected snake: easier
        // settings may commit to a merely good nearby target, while HARD and
        // BRUTAL continuously converge on the strongest route.
        if(selectionSkill)
          return gradedSnakeObjective(p,t,objectives,selectionSkill);
        const best=objectives[0];
        const currentCandidates=p.aiLockedSnake
          ?objectives.filter(candidate=>
            candidate.details?.snake===p.aiLockedSnake
          )
          :[];
        currentCandidates.sort((a,b)=>a.score-b.score);
        const current=currentCandidates[0]||null;
        // Keep minor one- or two-cell fluctuations stable, but seize a clearly
        // better tail or split much sooner than before. Once a new opportunity
        // is chosen, briefly cool down the old unbitten snake so moving targets
        // cannot cause an immediate A-B-A reversal on the following decision.
        const switchMargin=pressured?1.25:3.25;
        if(current&&current.score<=best.score+switchMargin) return current;
        if(current&&best.details?.snake&&
           best.details.snake!==current.details?.snake){
          p.aiTargetCooldowns.set(current.details.snake,t+1600);
          best.details.opportunisticSwitch=true;
          best.details.opportunityGain=current.score-best.score;
        }
        return best;
      }

      // When no legal attack route currently exists, preserve momentum. The
      // next move will scan again as the reversing snake changes shape. This
      // avoids the old head-side forward/backward loop.
      return null;
    }

    // Competitive intelligence is deliberately graded independently from the
    // exact contact rule. Every setting follows a real route toward a snake;
    // the difference is how often it finds the objectively best victim, how
    // many alternatives it considers and whether it recognises a profitable
    // split. Safety and the no-wobble movement rules remain universal.
    const competitiveSkillProfiles=[
      {notice:5, danger:3, panicDistance:1,huntChance:.32, prediction:0, error:.38, rethink:1450,snakeOptimalChance:.35,snakeCandidatePool:4,snakeSplitChance:.08,escapeHorizon:9, escapeBiteChance:.30,escapeBiteRange:4, escapeDetour:0,escapeSplitChance:.06,escapeSafetySlack:0},
      {notice:8, danger:5, panicDistance:2,huntChance:.52, prediction:.12,error:.27,rethink:1000,snakeOptimalChance:.55,snakeCandidatePool:3,snakeSplitChance:.24,escapeHorizon:13,escapeBiteChance:.52,escapeBiteRange:7, escapeDetour:1,escapeSplitChance:.24,escapeSafetySlack:0},
      {notice:12,danger:7, panicDistance:2,huntChance:.68, prediction:.30,error:.16,rethink:650,snakeOptimalChance:.80,snakeCandidatePool:2,snakeSplitChance:.55,escapeHorizon:18,escapeBiteChance:.80,escapeBiteRange:10,escapeDetour:3,escapeSplitChance:.55,escapeSafetySlack:1},
      {notice:21,danger:13,panicDistance:3,huntChance:.92, prediction:.68,error:.05,rethink:260,snakeOptimalChance:.95,snakeCandidatePool:2,snakeSplitChance:.88,escapeHorizon:28,escapeBiteChance:1,escapeBiteRange:16,escapeDetour:5,escapeSplitChance:.88,escapeSafetySlack:2},
      {notice:Infinity,danger:Infinity,panicDistance:4,huntChance:1,prediction:1,error:0,rethink:0,snakeOptimalChance:1,snakeCandidatePool:1,snakeSplitChance:1,escapeHorizon:Infinity,escapeBiteChance:1,escapeBiteRange:Infinity,escapeDetour:8,escapeSplitChance:1,escapeSafetySlack:3}
    ];

    function competitiveSkill(){
      return competitiveSkillProfiles[Math.max(
        0,Math.min(competitiveSkillProfiles.length-1,titleDifficultyIndex|0)
      )];
    }

    function gradedSnakeObjective(p,t,sortedObjectives,skill){
      const refreshChoice=!Number.isFinite(p.aiSnakeChoiceUntil)||
        t>=p.aiSnakeChoiceUntil||
        !p.aiGradedSnake||!snakes.includes(p.aiGradedSnake);

      // The split temperament is rolled only when a new strategic assessment
      // is due. This avoids changing its mind beside the same body segment.
      if(refreshChoice||typeof p.aiGradedAllowSplit!=='boolean')
        p.aiGradedAllowSplit=Math.random()<skill.snakeSplitChance;

      const bestBySnake=[];
      const seen=new Set();
      for(const objective of sortedObjectives){
        const snake=objective.details?.snake;
        if(!snake||seen.has(snake)) continue;
        if(objective.details?.kind==='split'&&!p.aiGradedAllowSplit)
          continue;
        seen.add(snake);
        bestBySnake.push(objective);
      }
      // A tail candidate exists for every reachable snake, but retain this
      // fallback for malformed or transient split-only snapshots.
      if(!bestBySnake.length) return sortedObjectives[0]||null;

      if(!refreshChoice){
        const held=bestBySnake.find(candidate=>
          candidate.details?.snake===p.aiGradedSnake
        );
        if(held) return held;
      }

      const poolSize=Math.max(1,Math.min(
        skill.snakeCandidatePool|0,bestBySnake.length
      ));
      let rank=0;
      if(poolSize>1&&Math.random()>=skill.snakeOptimalChance)
        rank=1+((Math.random()*(poolSize-1))|0);
      const chosen=bestBySnake[rank]||bestBySnake[0];
      p.aiGradedSnake=chosen.details.snake;
      p.aiGradedKind=chosen.details.kind;
      p.aiSnakeChoiceUntil=t+Math.max(0,skill.rethink);
      p.aiThought={
        type:'graded-snake-choice',difficulty:titleDifficultyIndex,
        candidateRank:rank,candidatePool:poolSize,
        optimal:rank===0,split:chosen.details.kind==='split'
      };
      return chosen;
    }

    function opponentRouteDistance(from,opponent,t,prediction=0){
      if(!opponent) return Infinity;
      const target={
        x:opponent.x+(opponent.dir?.x||0)*prediction,
        y:opponent.y+(opponent.dir?.y||0)*prediction
      };
      return distance(from,target,t,from);
    }

    function newCompetitiveFleeDirective(p,t,measuredThreats,skill,extra={}){
      // Keep temperament stable for several moves. Re-rolling the willingness
      // to bite on every frame would make an easy AI visibly hesitate beside
      // the same tail instead of behaving like one consistent personality.
      const refreshTemperament=!Number.isFinite(p.aiEscapeTemperamentUntil)||
        t>=p.aiEscapeTemperamentUntil;
      if(refreshTemperament){
        p.aiEscapeBiteActive=Math.random()<skill.escapeBiteChance;
        p.aiEscapeSplitActive=Math.random()<skill.escapeSplitChance;
        p.aiEscapeTemperamentUntil=t+Math.max(450,skill.rethink*1.5);
      }
      const directive={
        type:'flee',target:measuredThreats[0].target,
        threats:measuredThreats.map(item=>item.target),skill,
        urgent:measuredThreats[0].distance<=skill.danger,
        allowEscapeBite:!!p.aiEscapeBiteActive,
        allowEscapeSplit:!!p.aiEscapeSplitActive,
        ...extra
      };
      p.aiVsDirective=directive;
      // BRUTAL still reclassifies score/power reversals immediately, but its
      // far-route target is held briefly so it cannot shimmer between exits.
      p.aiVsNextAssessmentAt=t+Math.max(180,skill.rethink);
      return directive;
    }

    function newCompetitiveRecoveryDirective(p,t,measuredThreats,skill){
      // Being behind on score is a reason to hunt snakes, not a permanent
      // emergency. Normal danger scoring still bends the chosen route around
      // the leader just as it does around hostile hunters and snake mouths.
      const directive={
        type:'recover-score',target:measuredThreats[0].target,
        threats:measuredThreats.map(item=>item.target),skill
      };
      p.aiVsDirective=directive;
      p.aiVsNextAssessmentAt=t+Math.max(220,skill.rethink);
      p.aiEscapeTarget=null;
      p.aiEscapeTargetUntil=0;
      return directive;
    }

    function competitiveDirective(p,t){
      if(!isCompetitiveMode()||!p?.isAI||p.dead||p.lives<=0){
        if(p) p.aiVsDirective=null;
        return null;
      }
      const skill=competitiveSkill();
      const opponents=teammatesOf(p).filter(other=>
        !other.dead&&other.lives>0
      );
      if(!opponents.length){
        p.aiVsDirective=null;
        return null;
      }

      const threats=opponents.filter(other=>canPlayerEatPlayer(other,p,t));
      const prey=opponents.filter(other=>canPlayerEatPlayer(p,other,t));
      const previous=p.aiVsDirective;
      const previousTarget=previous?.target;
      // A score or Power Mode reversal is a hard interrupt. The AI reclassifies
      // its former prey before this very movement, regardless of difficulty.
      const relationshipFlipped=previous?.type==='hunt'&&
        previousTarget&&threats.includes(previousTarget);

      const measuredThreats=threats.map(target=>({
        target,
        distance:opponentRouteDistance(p,target,t,skill.prediction)
      })).sort((a,b)=>a.distance-b.distance);
      const urgentThreats=measuredThreats.filter(item=>
        item.distance<=skill.panicDistance||
        relationshipFlipped&&item.target===previousTarget&&
          item.distance<=skill.panicDistance+1
      );
      if(urgentThreats.length){
        return newCompetitiveFleeDirective(p,t,measuredThreats,skill,{
          scoreFlip:relationshipFlipped,urgent:true
        });
      }

      const previousThreatDistance=measuredThreats.find(item=>
        item.target===previousTarget
      )?.distance??Infinity;
      const previousStillValid=previous&&previous.target&&
        opponents.includes(previous.target)&&(
          previous.type==='hunt'
            ?prey.includes(previous.target)
            :previous.type==='flee'
              ?threats.includes(previous.target)&&
                previousThreatDistance<=skill.panicDistance+1
              :previous.type==='recover-score'&&
                threats.includes(previous.target)
        );
      if(previousStillValid&&t<p.aiVsNextAssessmentAt) return previous;

      // Outside the immediate danger radius, keep accumulating points. The
      // ordinary safety layer avoids the leader locally without abandoning the
      // current snake or wobbling toward a remote escape corner.
      if(measuredThreats.length)
        return newCompetitiveRecoveryDirective(p,t,measuredThreats,skill);

      const measuredPrey=prey.map(target=>({
        target,
        distance:opponentRouteDistance(p,target,t,skill.prediction)
      })).filter(item=>Number.isFinite(item.distance))
        .sort((a,b)=>
          a.target.score-b.target.score||a.distance-b.distance
        );
      if(measuredPrey.length&&measuredPrey[0].distance<=skill.notice&&
         Math.random()<skill.huntChance){
        let chosen=measuredPrey[0];
        if(skill.error>0&&measuredPrey.length>1&&Math.random()<skill.error)
          chosen=measuredPrey[Math.min(measuredPrey.length-1,1)];
        const directive={
          type:'hunt',target:chosen.target,threats:[],skill
        };
        p.aiVsDirective=directive;
        p.aiVsNextAssessmentAt=t+skill.rethink;
        return directive;
      }

      p.aiVsDirective=null;
      p.aiVsNextAssessmentAt=t+skill.rethink;
      return null;
    }

    function routeDegree(x,y){
      let degree=0;
      for(const d of dirs) if(!isWall(x+d.x,y+d.y)) degree++;
      return degree;
    }

    function competitiveEscapeTarget(p,t,directive){
      const skill=directive?.skill||competitiveSkill();
      const threats=(directive?.threats||[]).filter(other=>
        !other.dead&&other.lives>0&&canPlayerEatPlayer(other,p,t)
      );
      if(!threats.length) return null;
      if(p.aiEscapeTarget&&t<(p.aiEscapeTargetUntil||0)&&
         !isWall(p.aiEscapeTarget.x,p.aiEscapeTarget.y))
        return p.aiEscapeTarget;

      scanMaze();
      const fromField=fieldFor(p,t,p);
      const threatFields=threats.map(opponent=>fieldFor({
        x:opponent.x+(opponent.dir?.x||0)*skill.prediction,
        y:opponent.y+(opponent.dir?.y||0)*skill.prediction
      },t,p));
      const candidates=[];
      for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
        if(isWall(x,y)) continue;
        const cell=index(x,y);
        const travel=fromField[cell];
        if(travel<0||travel>skill.escapeHorizon) continue;
        const threatDistance=Math.min(...threatFields.map(field=>{
          const value=field[cell];
          return value<0?999:value;
        }));
        const degree=routeDegree(x,y);
        const deadEndPenalty=degree<=1&&travel>0?2600:0;
        const score=threatDistance*1000-travel*7+degree*35-deadEndPenalty;
        candidates.push({x,y,travel,threatDistance,degree,score});
      }
      if(!candidates.length) return nearestRouteTarget(p);
      candidates.sort((a,b)=>b.score-a.score||a.travel-b.travel);
      let chosen=candidates[0];
      // Lower settings may select a merely good distant region, never a random
      // adjacent cell. The route to it therefore remains coherent and useful.
      if(skill.error>0&&candidates.length>1&&Math.random()<skill.error){
        const top=candidates.filter(item=>
          item.score>=candidates[0].score-1800&&item.degree>1
        ).slice(0,4);
        chosen=top[(Math.random()*top.length)|0]||chosen;
      }
      p.aiEscapeTarget={x:chosen.x,y:chosen.y};
      p.aiEscapeTargetUntil=t+Math.max(420,skill.rethink*1.15);
      return p.aiEscapeTarget;
    }

    function escapeThreatDistance(cell,directive,t,p){
      const skill=directive?.skill||competitiveSkill();
      const values=(directive?.threats||[]).filter(other=>
        !other.dead&&other.lives>0&&canPlayerEatPlayer(other,p,t)
      ).map(other=>opponentRouteDistance(cell,other,t,skill.prediction));
      return values.length?Math.min(...values):Infinity;
    }

    function competitiveEscapeSnakeObjective(p,t,directive){
      const skill=directive?.skill||competitiveSkill();
      if(!directive?.allowEscapeBite||!snakes.length) return null;
      const escapeTarget=competitiveEscapeTarget(p,t,directive);
      if(!escapeTarget) return null;
      const directEscape=distance(p,escapeTarget,t,p);
      const currentThreat=escapeThreatDistance(p,directive,t,p);
      const candidates=[];

      const consider=(snake,bodyIndex,kind)=>{
        if(!snake?.body?.length) return;
        if(kind==='split'&&!directive.allowEscapeSplit) return;
        if(kind==='split'&&directive.urgent&&titleDifficultyIndex<3) return;
        const target=snake.body[bodyIndex];
        if(!target) return;
        // The immutable atlas is an O(1) coarse filter. Build the more costly
        // snake-aware route only for opportunities that can genuinely lie on
        // (or close to) the escape route.
        const coarseRoute=distance(p,target,t,p);
        const coarseOnward=distance(target,escapeTarget,t,p);
        if(!Number.isFinite(coarseRoute)||!Number.isFinite(coarseOnward)||
           coarseRoute>skill.escapeBiteRange||
           Math.max(0,coarseRoute+coarseOnward-directEscape)>
             skill.escapeDetour+2) return;
        const objective={
          type:kind==='split'?'escape-route-split':'escape-route-tail',
          target:{x:target.x,y:target.y},score:0,
          details:{snake,kind,bodyIndex,escapeTarget:{...escapeTarget}}
        };
        const attackField=objectiveFieldFor(objective,t,p);
        const route=attackField[index(p.x,p.y)];
        if(route<0||route>skill.escapeBiteRange) return;
        const onward=distance(target,escapeTarget,t,p);
        if(!Number.isFinite(onward)||!Number.isFinite(directEscape)) return;
        const detour=Math.max(0,route+onward-directEscape);
        const committed=snake===p.aiLockedSnake&&p.aiHasBittenLockedSnake;
        if(detour>skill.escapeDetour+(committed?2:0)) return;
        const targetThreat=escapeThreatDistance(target,directive,t,p);
        if(Number.isFinite(currentThreat)&&
           targetThreat+skill.escapeSafetySlack<currentThreat) return;

        // At least one first route step must remain non-lethal. This preserves
        // self-protection even when the profitable body cell itself is safe.
        const safeFirstStep=legalDirections(p,t).some(d=>{
          const x=p.x+d.x,y=p.y+d.y;
          const routeDistance=attackField[index(x,y)];
          return routeDistance>=0&&routeDistance<route&&
            collisionValue(p,d,x,y,t,objective)<100000&&
            surroundingDanger(p,d,x,y,t)<105;
        });
        if(route>0&&!safeFirstStep) return;
        objective.score=detour*24+route-targetThreat*.35+
          (kind==='split'?(titleDifficultyIndex>=3?-2:3):0)-
          (committed?40:0);
        candidates.push(objective);
      };

      snakes.forEach(s=>{
        if(s.body.length>1) consider(s,s.body.length-1,'tail');
        if(s.body.length>=3){
          const splitIndexes=splitBodyIndexes(s);
          // One or two central opportunities are sufficient; evaluating every
          // body cell would add cost without changing the tactical result.
          splitIndexes.slice(0,titleDifficultyIndex>=3?2:1)
            .forEach(bodyIndex=>consider(s,bodyIndex,'split'));
        }
      });
      candidates.sort((a,b)=>a.score-b.score);
      return candidates[0]||null;
    }

    function followCompetitiveEscape(p,t,options,directive){
      const skill=directive?.skill||competitiveSkill();
      const threats=(directive?.threats||teammatesOf(p)).filter(other=>
        !other.dead&&other.lives>0&&canPlayerEatPlayer(other,p,t)
      );
      if(!threats.length) return false;
      const escapeTarget=competitiveEscapeTarget(p,t,directive);
      const escapeField=escapeTarget?fieldFor(escapeTarget,t,p):null;
      const measured=options.map(d=>{
        const x=p.x+d.x,y=p.y+d.y;
        const collision=collisionValue(p,d,x,y,t,null);
        const danger=surroundingDanger(p,d,x,y,t);
        const nearestThreat=Math.min(...threats.map(opponent=>
          opponentRouteDistance({x,y},opponent,t,skill.prediction)
        ));
        const culDeSac=entersUnneededCulDeSac(p,x,y,null);
        const reversal=d.x===-p.dir.x&&d.y===-p.dir.y;
        const routeDistance=escapeField?escapeField[index(x,y)]:Infinity;
        const unreachable=!Number.isFinite(routeDistance)||routeDistance<0;
        return {
          d,x,y,collision,danger,nearestThreat,culDeSac,reversal,routeDistance,
          score:(collision>=100000?1000000000:0)+
            (danger>=105?800000000:0)+
            (unreachable?400000000:0)+(culDeSac?180000:0)+
            danger*180+collision+routeDistance*420+
            (reversal?900:0)-Math.min(200,nearestThreat)*70
        };
      }).sort((a,b)=>a.score-b.score);
      if(!measured.length) return false;

      let choice=measured[0];
      // Lower settings make believable tactical errors, but only among moves
      // that are not an immediate mouth/contact loss.
      const alternatives=measured.filter(step=>
        step.collision<100000&&step.danger<105
      );
      if(skill.error>0&&alternatives.length>1&&Math.random()<skill.error){
        const upper=Math.min(alternatives.length-1,skill.error>.3?2:1);
        choice=alternatives[1+((Math.random()*upper)|0)]||choice;
      }
      p.nextDir={...choice.d};
      p.aiThought={
        type:'central-escape-opponent',target:{...directive.target},
        escapeTarget:escapeTarget?{...escapeTarget}:null,
        danger:Math.round(choice.danger),score:choice.score,
        scoreFlip:!!directive.scoreFlip
      };
      p.aiLastDirection={...choice.d};
      p.aiDecisionAt=t;
      return true;
    }

    function followCoherentCompetitiveRoam(p,t,options){
      if(!isCompetitiveMode()||!options.length) return false;

      // Low-skill behaviour is an intentional tour, not a fresh random choice
      // on every cell. Remember where this tour has already been so junctions
      // naturally lead into less-used passages and eventually around the map.
      if(!(p.aiRoamVisits instanceof Map)) p.aiRoamVisits=new Map();
      const currentKey=`${p.x},${p.y}`;
      if(p.aiRoamObservedCell!==currentKey){
        const previous=p.aiRoamVisits.get(currentKey);
        p.aiRoamVisits.set(currentKey,{
          count:(previous?.count||0)+1,last:t
        });
        p.aiRoamObservedCell=currentKey;
      }
      for(const [key,visit] of p.aiRoamVisits){
        if(t-visit.last>45000) p.aiRoamVisits.delete(key);
      }

      const measured=options.map(d=>{
        const x=p.x+d.x,y=p.y+d.y;
        const collision=collisionValue(p,d,x,y,t,null);
        const danger=surroundingDanger(p,d,x,y,t);
        const reversal=d.x===-p.dir.x&&d.y===-p.dir.y;
        const forward=d.x===p.dir.x&&d.y===p.dir.y;
        const exits=dirs.reduce((total,next)=>{
          const nx=x+next.x,ny=y+next.y;
          if(nx===p.x&&ny===p.y) return total+1;
          return total+Number(
            !isWall(nx,ny)&&!occupiedBySolidEgg(nx,ny,t)&&
            playerCellIsSafeForRoute(p,nx,ny,t)
          );
        },0);
        const visit=p.aiRoamVisits.get(`${x},${y}`);
        // A stable cell-based tie breaker adds variety between routes without
        // allowing the choice to flicker between two directions every tick.
        const tie=((x*17+y*31+p.id*13+(d.x+1)*7+(d.y+1)*11)%19)/19;
        return {
          d,x,y,collision,danger,reversal,forward,exits,
          visits:visit?.count||0,tie
        };
      });

      const safe=measured.filter(step=>
        step.collision<100000&&step.danger<105
      );
      // A reverse step is considered only at a genuine dead end/trap. If a
      // forward or turning passage is safe, the AI must take it. This is the
      // central no-wobble rule and remains active on every difficulty.
      const nonReverse=safe.filter(step=>!step.reversal);
      const candidates=nonReverse.length?nonReverse:(safe.length?safe:measured);
      const choice=candidates.slice().sort((a,b)=>{
        const score=step=>
          (step.collision>=100000?1000000000:0)+
          (step.danger>=105?900000000:0)+
          (step.exits<=1?180000:0)+
          step.danger*300+step.collision+
          step.visits*900-
          (step.forward?18:0)+step.tie;
        return score(a)-score(b);
      })[0];

      p.nextDir={...choice.d};
      p.aiRoamDirection={...choice.d};
      p.aiThought={
        type:'coherent-vs-roam',target:{x:choice.x,y:choice.y},
        danger:Math.round(choice.danger),difficulty:titleDifficultyIndex,
        forcedReverse:choice.reversal
      };
      p.aiLastDirection={...choice.d};
      p.aiDecisionAt=t;
      return true;
    }

    function difficultyScaledScoringObjective(p,t,skill){
      // SOLO AI retains the established expert hunter. In VS modes there is
      // no binary "brain off" state anymore: all levels choose a snake and
      // follow a coherent route, while the profile grades decision quality.
      return chooseObjective(p,t,isCompetitiveMode()?skill:null);
    }

    function plan(p,t){
      if(!p?.isAI||p.dead) return;
      cleanTargetCooldowns(p,t);
      p.pointerNavigation=null;
      p.pointerMomentum=false;
      p.reactionAssistRicochet=null;
      p.waitingForInput=false;
      const options=legalDirections(p,t);
      if(!options.length) return;
      const oscillating=rememberAiCell(p,t);
      const vsDirective=competitiveDirective(p,t);
      let escapeObjective=null;
      if(vsDirective?.type==='flee'){
        clearBlockedRetreat(p);
        escapeObjective=competitiveEscapeSnakeObjective(p,t,vsDirective);
        if(!escapeObjective&&followCompetitiveEscape(p,t,options,vsDirective))
          return;
      }
      if(!vsDirective&&followBlockedRetreat(p,t,options)) return;
      const competitiveSkillLevel=competitiveSkill();
      const strategicObjective=vsDirective?.type==='flee'
        ?escapeObjective
        :vsDirective?.type==='hunt'
        ? {
            type:'hunt-opponent',
            target:{x:vsDirective.target.x,y:vsDirective.target.y},
            score:-1000,
            details:{player:vsDirective.target,kind:'player'}
          }
        :vsDirective?.type==='recover-score'
          ?difficultyScaledScoringObjective(p,t,competitiveSkillLevel)
          :difficultyScaledScoringObjective(p,t,competitiveSkillLevel);
      const priorityFruit=strategicObjective?.type==='tactical-fruit'&&
        strategicObjective.details?.priorityFruit;
      // A nearby, easily reachable fruit is not merely an attractive detour:
      // it is a short, hard objective because the resulting Power Mode changes
      // the optimal attack plan. Do not let an incidental, not-yet-started
      // bite steal that decision on the following tick.
      let immediateObjective=priorityFruit||
        vsDirective?.type==='hunt'||vsDirective?.type==='flee'
        ?null:immediateAttackObjective(p,t,options);
      if(isCompetitiveMode()&&!isPowerMode(p,t)&&
         immediateObjective?.details?.kind==='split'&&
         !p.aiGradedAllowSplit)
        immediateObjective=null;
      // Once a valid weaker opponent has been selected, chasing it is the
      // primary VS objective. Nearby snake bites must not repeatedly distract
      // the AI from the promised competitive behaviour.
      const objective=vsDirective?.type==='flee'
        ?strategicObjective
        :vsDirective?.type==='hunt'
        ?strategicObjective
        :priorityFruit
          ?strategicObjective
          :(immediateObjective||strategicObjective);
      if((!vsDirective||vsDirective.type==='recover-score')&&!objective&&
         followCoherentCompetitiveRoam(p,t,options)) return;
      if(objective?.type==='tactical-fruit'){
        const fruit=objective.details.fruit;
        const newFruitIntent=p.aiFruitTarget!==fruit;
        p.aiFruitTarget=fruit;
        if(objective.details.priorityFruit&&!p.aiHasBittenLockedSnake){
          p.aiLockedSnake=null;
          p.aiSplitCommit=null;
          p.aiCommitMode=null;
          p.aiTargetKind=null;
          p.aiHuntQueue=[];
          if(newFruitIntent) clearBlockedRetreat(p);
        }
      }
      else if(p.aiFruitTarget&&!fruits.includes(p.aiFruitTarget))
        p.aiFruitTarget=null;
      const objectiveSnake=objective?.details?.snake||null;
      if(objective?.details?.kind==='split'&&
        objectiveSnake?.body?.length>=3){
        if(!p.aiSplitCommit||p.aiSplitCommit.snake!==objectiveSnake||
          objective.details.immediate){
          p.aiSplitCommit={
            snake:objectiveSnake,
            fraction:objective.details.bodyIndex/
              Math.max(1,objectiveSnake.body.length-1),
            startedAt:t
          };
        }
      }
      if(objectiveSnake&&objectiveSnake!==p.aiLockedSnake){
        const mode=objective.type.includes('split')?'split-target':'hunt';
        commitTo(p,objectiveSnake,mode,t);
      }
      if(objective?.details?.kind) p.aiTargetKind=objective.details.kind;
      let field=objective?objectiveFieldFor(objective,t,p):null;
      if(!p.aiVisited) p.aiVisited=new Map();
      p.aiVisited.set(`${p.x},${p.y}`,t);
      for(const [key,visitedAt] of p.aiVisited){
        if(t-visitedAt>5500) p.aiVisited.delete(key);
      }

      // The atlas chooses the strategic route. Only when its best next cell is
      // currently occupied or immediately lethal do we calculate a temporary
      // detour; the locked prey itself never changes.
      let ideal=null;
      let needsDetour=false;
      let detourRouteFound=false;
      if(field&&objective){
        const atlasSteps=dirs.map(d=>({
          d,x:p.x+d.x,y:p.y+d.y,
          distance:(p.x+d.x<0||p.y+d.y<0||p.x+d.x>=COLS||p.y+d.y>=ROWS)
            ?-1:field[index(p.x+d.x,p.y+d.y)]
        })).filter(step=>step.distance>=0)
          .sort((a,b)=>a.distance-b.distance);
        ideal=atlasSteps[0];
        const idealLegal=ideal&&options.some(d=>d.x===ideal.d.x&&d.y===ideal.d.y);
        const idealCollision=ideal
          ?collisionValue(p,ideal.d,ideal.x,ideal.y,t,objective):0;
        const idealDanger=ideal
          ?surroundingDanger(p,ideal.d,ideal.x,ideal.y,t):0;
        needsDetour=!!ideal&&(
          !idealLegal||idealCollision>=100000||idealDanger>=105
        );
        if(needsDetour){
          p.aiDetourUntil=t+1100;
          p.aiLastBlockedStep={x:ideal.x,y:ideal.y,t};
        }
        if(needsDetour||p.aiDetourUntil>t){
          const detour=detourFieldFor(objective.target,t,p);
          if(detour[index(p.x,p.y)]>=0){
            field=detour;
            detourRouteFound=true;
          }
        }
      }

      const routeMissing=!!field&&field[index(p.x,p.y)]<0;
      let retreatObjective=objective;
      if(!retreatObjective&&p.aiLockedSnake&&snakes.includes(p.aiLockedSnake)){
        const s=p.aiLockedSnake;
        const target=s.body.length>1?s.body[s.body.length-1]:s.body[0];
        retreatObjective={
          type:'blocked-hunt',target:{...target},
          details:{snake:s,kind:s.body.length>1?'tail':'head'}
        };
      }
      const blockedWithoutBypass=needsDetour&&!detourRouteFound;
      const mustBreakLoop=oscillating&&retreatObjective&&
        !retreatObjective.details?.immediate;
      if(retreatObjective&&(routeMissing||blockedWithoutBypass||mustBreakLoop)){
        // If the fixed prey is dynamically unreachable and another snake has
        // a clear route, change prey instead of repeatedly testing the same
        // blocked two cells. A short cooldown prevents an immediate relapse.
        const canSwitchPrey=!isPowerMode(p,t)&&objectiveSnake&&
          !p.aiHasBittenLockedSnake&&!p.aiReplanGuard&&
          hasReachableAlternativeSnake(p,t,objectiveSnake);
        if(canSwitchPrey){
          p.aiTargetCooldowns.set(objectiveSnake,t+5500);
          if(p.aiLockedSnake===objectiveSnake){
            p.aiLockedSnake=null;
            p.aiHasBittenLockedSnake=false;
            p.aiCommitMode=null;
          }
          if(p.aiSplitCommit?.snake===objectiveSnake)
            p.aiSplitCommit=null;
          p.aiTargetKind=null;
          clearBlockedRetreat(p);
          p.aiReplanGuard=true;
          plan(p,t+0.01);
          p.aiReplanGuard=false;
          return;
        }
        const recentBlock=p.aiLastBlockedStep&&
          t-p.aiLastBlockedStep.t<5000?p.aiLastBlockedStep:null;
        const blockedCell=recentBlock||ideal||retreatObjective.target;
        const reason=mustBreakLoop?'two-cell-loop':
          routeMissing?'unreachable-route':'temporary-congestion';
        if(beginBlockedRetreat(p,retreatObjective,blockedCell,t,reason)&&
           followBlockedRetreat(p,t,options)) return;
      }

      const measured=options.map(d=>{
        const x=p.x+d.x,y=p.y+d.y;
        const collision=collisionValue(p,d,x,y,t,objective);
        const danger=surroundingDanger(p,d,x,y,t);
        const routeDistance=field?field[index(x,y)]:0;
        const unreachable=field&&routeDistance<0;
        const lethal=collision>=100000;
        const recent=p.aiVisited.get(`${x},${y}`);
        const revisitTieBreaker=recent?Math.max(0,1-(t-recent)/5500):0;
        const straightTieBreaker=d.x===p.dir.x&&d.y===p.dir.y?-0.2:0;
        const reversingHead=p.aiLockedSnake?.reversing&&
          p.aiLockedSnake.body[0];
        const currentHeadDistance=reversingHead
          ?Math.abs(reversingHead.x-p.x)+Math.abs(reversingHead.y-p.y):0;
        const nextHeadDistance=reversingHead
          ?Math.abs(reversingHead.x-x)+Math.abs(reversingHead.y-y):0;
        // If neither the tail nor any middle segment of a reversing snake is
        // reachable, do not follow its receding head through the corridor.
        // Move sideways/away until its changing body exposes a legal attack.
        const reverseHeadPenalty=!objective&&reversingHead&&
          nextHeadDistance<currentHeadDistance?250000:0;
        const culDeSac=entersUnneededCulDeSac(p,x,y,objective);
        return {
          d,x,y,
          collision,danger,routeDistance,unreachable,lethal,
          reverseHeadPenalty,culDeSac,revisitTieBreaker,straightTieBreaker
        };
      });
      const safeMoveExists=measured.some(step=>
        !step.lethal&&step.danger<105
      );
      const openAlternativeExists=measured.some(step=>
        !step.lethal&&step.danger<105&&!step.culDeSac
      );
      const runDirection=p.aiRunDirection||p.dir;
      const forwardStep=measured.find(step=>
        step.d.x===runDirection.x&&step.d.y===runDirection.y
      );
      const forwardCanContinue=!!forwardStep&&
        !forwardStep.lethal&&forwardStep.danger<105&&
        !forwardStep.unreachable&&
        !(openAlternativeExists&&forwardStep.culDeSac);
      const purposefulReversal=!!objective?.details?.immediate||
        objective?.type==='tactical-fruit'||objective?.type==='hunt-opponent';
      const ranked=measured.map(step=>({
        ...step,
        // A mouth committed to the next tile is lexicographically unsafe
        // whenever any non-lethal exit exists. Distance to prey may never
        // overrule this layer of self-preservation.
        score:(step.lethal?1000000000:0)+
          (safeMoveExists&&step.danger>=105?900000000:0)+
          (step.unreachable?500000000:0)+
          (openAlternativeExists&&step.culDeSac?300000000:0)+
          (forwardCanContinue&&!purposefulReversal&&
           step.d.x===-runDirection.x&&step.d.y===-runDirection.y
            ?((p.aiRunLength||0)<5?650000000:24000)
            :0)+
          (step.routeDistance<0?0:step.routeDistance*10000)+
          step.danger*25+step.collision+step.reverseHeadPenalty+
          step.revisitTieBreaker+step.straightTieBreaker
      })).sort((a,b)=>a.score-b.score);

      const choice=ranked[0];
      p.nextDir={...choice.d};
      p.aiThought={
        type:objective?.type||'explore',
        target:objective?.target||{x:choice.x,y:choice.y},
        danger:Math.round(surroundingDanger(p,choice.d,choice.x,choice.y,t)),
        score:choice.score
      };
      p.aiLastDirection={...choice.d};
      p.aiDecisionAt=t;
    }

    function commitTo(p,s,mode='finish',t=gameTimeNow()){
      if(!p?.isAI||!s||!snakes.includes(s)||!s.body.length) return;
      if(p.aiSplitCommit&&p.aiSplitCommit.snake!==s) p.aiSplitCommit=null;
      p.aiLockedSnake=s;
      p.aiCommitMode=mode;
      p.aiHasBittenLockedSnake=mode==='finish'||mode==='finish-split';
      p.aiCommitUntil=t+(mode==='finish-split'?24000:18000);
    }

    function noteTailBite(p,s){
      if(p?.isAI&&p.aiLockedSnake&&p.aiLockedSnake!==s) return;
      if(p?.isAI) clearBlockedRetreat(p);
      if(p?.aiSplitCommit?.snake===s) p.aiSplitCommit=null;
      commitTo(p,s,'finish');
    }

    function lockNextAvailable(p,t=gameTimeNow()){
      if(!p?.isAI||p.aiLockedSnake) return;
      p.aiHuntQueue=(p.aiHuntQueue||[]).filter(part=>snakes.includes(part));
      if(p.aiHuntQueue.length){
        commitTo(p,p.aiHuntQueue.shift(),'finish-split',t);
        return;
      }
      const next=snakes.slice().sort((a,b)=>{
        const at=a.body.length>1?a.body[a.body.length-1]:a.body[0];
        const bt=b.body.length>1?b.body[b.body.length-1]:b.body[0];
        return distance(p,at,t,p)-distance(p,bt,t,p);
      })[0];
      if(next) commitTo(p,next,'hunt',t);
    }

    function noteCompleted(p,s,replacement=null){
      if(!p?.isAI) return;
      if(p.aiLockedSnake&&p.aiLockedSnake!==s) return;
      clearBlockedRetreat(p);
      if(p.aiSplitCommit?.snake===s) p.aiSplitCommit=null;
      if(replacement&&snakes.includes(replacement)){
        commitTo(p,replacement,'finish');
        return;
      }
      if(p.aiLockedSnake===s){
        p.aiLockedSnake=null;
        p.aiHasBittenLockedSnake=false;
        p.aiCommitMode=null;
      }
      p.aiHuntQueue=(p.aiHuntQueue||[]).filter(part=>snakes.includes(part));
      if(!p.aiLockedSnake&&p.aiHuntQueue.length)
        commitTo(p,p.aiHuntQueue.shift(),'finish-split');
      lockNextAvailable(p);
    }

    function noteSplit(p,original,created){
      if(!p?.isAI) return;
      if(p.aiLockedSnake&&p.aiLockedSnake!==original) return;
      clearBlockedRetreat(p);
      if(p.aiSplitCommit?.snake===original) p.aiSplitCommit=null;
      const viable=created.filter(part=>snakes.includes(part)&&part.body.length);
      viable.sort((a,b)=>{
        const aTarget=a.body.length>1?a.body[a.body.length-1]:a.body[0];
        const bTarget=b.body.length>1?b.body[b.body.length-1]:b.body[0];
        return distance(p,aTarget,gameTimeNow(),p)-
          distance(p,bTarget,gameTimeNow(),p);
      });
      const previousQueue=(p.aiHuntQueue||[]).filter(part=>
        snakes.includes(part)&&!viable.includes(part)
      );
      p.aiLockedSnake=viable.shift()||null;
      p.aiHuntQueue=[...viable,...previousQueue];
      p.aiCommitMode='finish-split';
      p.aiTargetKind='tail';
      p.aiHasBittenLockedSnake=true;
      p.aiCommitUntil=gameTimeNow()+24000;
      if(!p.aiLockedSnake) lockNextAvailable(p);
    }

    function beginLevel(t=gameTimeNow()){
      const aiPlayers=allPlayers().filter(p=>p.isAI);
      // Human-only modes never consult the ally atlas, so avoid building the
      // complete all-pairs route table until an AI teammate actually exists.
      if(!aiPlayers.length){
        routeAtlas=[];
        atlasRevision=-1;
        return;
      }
      scanMaze(true);
      aiPlayers.forEach(p=>{
        p.aiLockedSnake=null;
        p.aiHuntQueue=[];
        p.aiSplitCommit=null;
        p.aiCommitMode=null;
        p.aiTargetKind=null;
        p.aiHasBittenLockedSnake=false;
        p.aiDetourUntil=0;
        p.aiVisited=new Map();
        p.aiBlockedRetreat=null;
        p.aiRecentCells=[];
        p.aiLastBlockedStep=null;
        p.aiTargetCooldowns=new Map();
        p.aiReplanGuard=false;
        p.aiFruitTarget=null;
        p.aiObservedX=null;
        p.aiObservedY=null;
        p.aiRunDirection=null;
        p.aiRunLength=0;
        lockNextAvailable(p,t);
      });
    }

    return {
      plan,distance,fieldFor,scanMaze,beginLevel,commitTo,
      noteTailBite,noteCompleted,noteSplit
    };
  })();

  function rand(a,b){ return a + Math.random()*(b-a); }

  function scorpionActivityRate(){
    const progress=Math.min(9,Math.max(0,level-1))/9;
    return 1+progress;
  }

  function scaledScorpionDelay(minimum,maximum){
    return rand(minimum,maximum)/scorpionActivityRate();
  }

  function levelTimePressure(t=gameTimeNow()){
    // Through level 10 the familiar 30-second calm period remains. Later
    // levels shorten it progressively to five seconds, compress the rise to
    // 2x, and increase the uncapped long-term growth from 0.4x to 1x/minute.
    // This follows the intelligence curve without introducing a sudden
    // one-frame pressure cliff.
    const difficulty=difficultyMultiplier();
    const levelAge=Math.max(0,t-levelStartedAt)*difficulty;
    const adjustedLevel=difficultyAdjustedLevel(level);
    const levelProgress=Math.max(0,Math.min(1,(adjustedLevel-10)/90));
    const calmPeriod=30000-25000*levelProgress;
    const riseDuration=15000-12000*levelProgress;
    if(levelAge<=calmPeriod) return 1;
    const riseProgress=Math.max(0,Math.min(1,
      (levelAge-calmPeriod)/Math.max(1,riseDuration)
    ));
    if(riseProgress<1) return 1+riseProgress;
    const growthStart=calmPeriod+riseDuration;
    const growthDivisor=150000-90000*levelProgress;
    return 2+(levelAge-growthStart)/growthDivisor;
  }

  function snakeDepletionPressure(){
    // Count remaining body cells rather than separate snake objects. Cutting a
    // snake into fragments therefore cannot reset or exploit this pressure.
    const startingMass=Math.max(1,levelStartingSnakeMass||1);
    const remainingMass=(snakes||[]).reduce(
      (total,snake)=>total+snake.body.length,
      0
    );
    const depleted=Math.max(0,Math.min(
      1,
      1-remainingMass/startingMass
    ));
    // Full snakes = 1x. Almost everything eaten approaches 2.25x.
    return 1+depleted*1.25;
  }

  function encounterPressure(t=gameTimeNow()){
    return levelTimePressure(t)*snakeDepletionPressure();
  }

  function scaledEggDelay(minimum,maximum,t=gameTimeNow()){
    return scaledScorpionDelay(minimum,maximum)/
      (encounterPressure(t)*difficultyMultiplier());
  }

  function scaledRepeatEggDelay(minimum,maximum,t=gameTimeNow()){
    // The first possible egg from each scorpion keeps its original timing.
    // After an egg has been laid, subsequent chances occur half as often.
    return scaledEggDelay(minimum,maximum,t)*2;
  }

  function scaledScorpionSpawnDelay(minimum,maximum,t=gameTimeNow()){
    return scaledScorpionDelay(minimum,maximum)/
      (encounterPressure(t)*difficultyMultiplier());
  }

  function occupiedBySnake(x,y,exceptSnake=null){
    return snakes && snakes.some(s =>
      s!==exceptSnake && s.body.some(p=>p.x===x && p.y===y)
    );
  }

  function occupiedByScorpion(x,y){
    return !!(scorpion &&
      ((scorpion.x===x && scorpion.y===y) ||
       (scorpion.tailX===x && scorpion.tailY===y)));
  }

  function occupiedByHunter(x,y,exceptHunter=null){
    return hunters && hunters.some(h =>
      h!==exceptHunter && h.x===x && h.y===y
    );
  }

  // Intact eggs are passable for their first 10 seconds. As soon as the
  // first crack appears, they become physical obstacles for every entity.
  function isEggSolid(e,t=gameTimeNow()) {
    // A covered egg stays intact and passable. This is evaluated directly
    // during collision checks, so a snake can still enter the player's tile
    // and eat them even if the cracking deadline passed before updateEggs().
    return t-e.bornAt>=10000 && !isEggCovered(e);
  }

  function occupiedBySolidEgg(x,y,t=gameTimeNow()) {
    return eggs && eggs.some(e=>
      e.x===x && e.y===y && isEggSolid(e,t)
    );
  }

  function isEggCovered(e) {
    // Check the three fixed player slots directly. This function is called by
    // both collision tests and MazeBrain obstacle validation, so avoiding a
    // temporary roster array matters when several eggs are present.
    let playerCoversEgg=false;
    for(let slot=0;slot<activePlayerCount;slot++){
      const p=slot===0?player:slot===1?player2:player3;
      if(!p||(p.dead&&p.hideDeathSprite)) continue;
      const px=p.dead?p.deathX:p.x;
      const py=p.dead?p.deathY:p.y;
      if(px===e.x&&py===e.y){ playerCoversEgg=true; break; }
    }
    const snakeCoversEgg=snakes.some(s=>
      s.body.some(p=>p.x===e.x && p.y===e.y)
    );
    const scorpionCoversEgg=scorpion && (
      (scorpion.x===e.x && scorpion.y===e.y) ||
      (scorpion.tailX===e.x && scorpion.tailY===e.y)
    );
    const hunterCoversEgg=hunters.some(h=>h.x===e.x && h.y===e.y);
    const fruitCoversEgg=fruits.some(f=>f.x===e.x && f.y===e.y);

    return playerCoversEgg || snakeCoversEgg || scorpionCoversEgg ||
      hunterCoversEgg || fruitCoversEgg;
  }

  function createPlayerState(id,previous=null){
    const start=PLAYER_STARTS[id-1];
    const now=gameTimeNow();
    const exactScore=previous?.scoreExact ?? previous?.score ?? 0;
    return {
      id,
      isAI:id===alliedAiPlayerId,
      x:start.x,y:start.y,prevX:start.x,prevY:start.y,
      dir:{...start.dir},nextDir:{...start.dir},
      mouthOpen:false,waitingForInput:id!==alliedAiPlayerId,
      dead:false,eliminated:false,hideDeathSprite:false,
      deathX:start.x,deathY:start.y,respawnAt:0,
      scoreExact:exactScore,
      score:Math.floor((exactScore+1e-9)/5)*5,
      lives:previous?.lives??3,
      nextExtraLifeScore:previous?.nextExtraLifeScore||5000,
      extraLivesEarned:previous?.extraLivesEarned||0,
      lifePulseStartedAt:previous?.lifePulseStartedAt??null,
      lifeSpotlightStartedAt:previous?.lifeSpotlightStartedAt??-Infinity,
      scoreSpotlightStartedAt:previous?.scoreSpotlightStartedAt??-Infinity,
      aggressionContribution:previous?.aggressionContribution||0,
      aiThought:null,aiDecisionAt:0,
      aiLockedSnake:null,aiHuntQueue:[],aiSplitCommit:null,aiCommitMode:null,
      aiCommitUntil:0,aiHasBittenLockedSnake:false,aiDetourUntil:0,
      aiTargetKind:null,aiLastDirection:null,
      aiBlockedRetreat:null,aiRecentCells:[],aiLastBlockedStep:null,
      aiTargetCooldowns:new Map(),aiReplanGuard:false,
      aiFruitTarget:null,aiObservedX:null,aiObservedY:null,
      aiRunDirection:null,aiRunLength:0,
      aiGradedSnake:null,aiGradedKind:null,aiGradedAllowSplit:null,
      aiSnakeChoiceUntil:0,
      aiRoamVisits:new Map(),aiRoamObservedCell:null,aiRoamDirection:null,
      aiVsDirective:null,aiVsNextAssessmentAt:0,
      pointerNavigation:null,
      pointerMomentum:false,
      reactionAssistRicochet:null,
      keyboardHeldKeys:Object.create(null),
      keyboardAlternateLast:null,
      controllerTiltDegrees:0,controllerTiltTargetDegrees:0,
      controllerTiltUpdatedAt:performance.now(),
      powerModeStartedAt:0,powerSpeedRampStartedAt:0,powerSpeedRampDuration:0,powerSpeedRampFrom:0,powerModeUntil:0,powerFlashBright:false,lastPowerFlashAt:0,powerWarningStartedAt:0,
      spawnShieldUntil:0,spawnFlashBright:false,lastSpawnFlashAt:0,
      lastMove:0,lastMouthAt:now,
      moveFromX:start.x,moveFromY:start.y,
      moveToX:start.x,moveToY:start.y,
      moveStartedAt:now,moveDuration:95*PLAYER_SLIDE_RATIO
    };
  }

  function reset(full=true,preserveCurrentMaze=false) {
    const resetRealTime=performance.now();
    CentralGameClock.reset(resetRealTime);
    resetGameplayCamera(resetRealTime);
    if(full){
      level=1;
      if(!preserveCurrentMaze){
        mazeRunSeed=(Date.now()^Math.floor(Math.random()*0xFFFFFFFF))>>>0;
      }
    }
    if(preserveCurrentMaze){
      // Starting from the mode-selection overlay must use the exact level the
      // player has already seen. Keep its seed, geometry and colour; only
      // invalidate cached routes before repopulating the same labyrinth.
      const preservedMazeLayerIsCurrent=
        mazeLayerRevision===mazeRevision&&
        mazeLayerThemeName===mazeColorTheme.name;
      mazeRevision++;
      // The revision also invalidates AI/pathfinding data, but the immutable
      // maze pixels did not change. Carry the already-preheated native layer
      // forward so the first zoom does not rebuild a 2880x2000 surface.
      if(preservedMazeLayerIsCurrent) mazeLayerRevision=mazeRevision;
    }else{
      applyMazeForLevel(level);
    }
    gameOver=false;
    gameplaySfxMuted=false;
    gameOverPending=false;
    gameOverPendingUntil=0;
    gameOverPendingPlayerId=0;
    gameOverVisualsSettled=false;
    gameOverStartedAt=0;
    gameOverKeepsWorldAlive=false;
    levelCompletionTransition=null;
    paused=false; pauseStartedAt=0; tickCount=0;
    player=createPlayerState(1,full?null:player);
    player2=activePlayerCount>=2
      ? createPlayerState(2,full?null:player2)
      : null;
    player3=activePlayerCount>=3
      ? createPlayerState(3,full?null:player3)
      : null;
    allPlayers().forEach(p=>activateSpawnShield(p));
    spawnSnakesForLevel();
    fruits=[];
    eggs=[];
    eggObstacleRevision++;
    pendingScorpionDrops=[];
    hunters=[];
    scorpion=null;
    scorpionKilled=false;
    levelStartedAt=gameTimeNow();
    levelSpotlightStartedAt=performance.now();
    AllyBrain.beginLevel(levelStartedAt);
    scorpionSpawnAt=levelStartedAt+
      scaledScorpionSpawnDelay(15000,30000,levelStartedAt);
    updateHud();
  }

  function prepareTitleState(){
    CentralGameClock.reset(performance.now());
    level=1;
    mazeRunSeed=(Date.now()^Math.floor(Math.random()*0xFFFFFFFF))>>>0;
    applyMazeForLevel(level);
    gameOver=false;
    gameplaySfxMuted=false;
    gameOverPending=false;
    gameOverPendingUntil=0;
    gameOverPendingPlayerId=0;
    gameOverVisualsSettled=false;
    gameOverStartedAt=0;
    gameOverKeepsWorldAlive=false;
    levelCompletionTransition=null;
    paused=false; pauseStartedAt=0;
    tickCount=0;
    player=null;
    player2=null;
    player3=null;
    snakes=[];
    fruits=[];
    eggs=[];
    hunters=[];
    pendingScorpionDrops=[];
    scorpion=null;
    scorpionKilled=false;
    eggObstacleRevision++;
    levelStartingSnakeMass=1;
    levelSpotlightStartedAt=-Infinity;
    hudDirty=true;
  }

  function returnToTitleScreen(gameplayFadeSeconds=0,options={}){
    clearTimeout(levelEntryTimer);
    levelEntryTimer=0;
    levelEntryBuffer='';
    Object.keys(keys).forEach(key=>{ keys[key]=false; });
    awaitingPlayerSelection=true;
    titleScreenMode=options.screen==='entry'?'entry':'menu';
    if(titleScreenMode==='entry'){
      pendingHighScoreCandidate=options.candidate||completedRunHighScoreCandidate;
      highScoreNameDraft='';
      highScoreKeyboardRow=0;
      highScoreKeyboardColumn=0;
      highScoreKeyboardNavigationActive=false;
      highScoreEntryStatus='';
      syncHighScoreNameInput();
      canvas.setAttribute('aria-label','Maze Biters new high score name entry');
      setTimeout(()=>highScoreNameInput?.focus?.({preventScroll:true}),0);
    }else{
      pendingHighScoreCandidate=null;
      highScoreNameInput?.blur?.();
      canvas.setAttribute('aria-label','Maze Biters game and title menu');
    }
    // Keep the last keyboard/gamepad menu position after GAME OVER. The first
    // application launch still begins on mode 1 through the initial value.
    document.getElementById('gameWrap')?.classList?.add('title-active');
    // Prepare only the level-one maze. Players, snakes and AI are created
    // once, after a mode is selected, instead of twice around the title screen.
    prepareTitleState();
    titleMenuEnteredAt=performance.now();
    highScoreScreenEnteredAt=titleMenuEnteredAt;
    configureTitleCanvasResolution();
    // The context is already unlocked after a completed game, so the
    // title loop can resume immediately on return from GAME OVER.
    GameplayMusic.resetRun(gameplayFadeSeconds);
    MenuMusic.start();
  }

  function captureRunHighScoreCandidate(){
    if(gameMode===0||humanPlayerCount<1) return null;
    const humans=allPlayers().filter(candidate=>!candidate.isAI);
    if(!humans.length) return null;
    const score=Math.max(...humans.map(candidate=>Math.max(0,candidate.score|0)));
    if(score<=0) return null;
    const tied=humans.filter(candidate=>(candidate.score|0)===score);
    const modeLabels={
      1:'SOLO',2:'DUO VS',3:'SOLO VS AI',4:'DUO VS AI',5:'DUO CO-OP'
    };
    return {
      score,
      level:Math.max(1,level|0),
      mode:gameMode,
      modeLabel:modeLabels[gameMode]||'SOLO',
      difficulty:TITLE_DIFFICULTIES[titleDifficultyIndex]||'MEDIUM',
      speed:TITLE_SPEEDS[titleSpeedIndex]||'MEDIUM',
      multiplier:combinedScoreMultiplier(),
      playerIds:tied.map(candidate=>candidate.id)
    };
  }

  function completeGameOverPresentation(gameplayFadeSeconds=0){
    const candidate=completedRunHighScoreCandidate;
    const opensEntry=!!candidate&&!!HighScoreService?.qualifies?.(candidate.score);
    returnToTitleScreen(gameplayFadeSeconds,{
      screen:opensEntry?'entry':'menu',
      candidate:opensEntry?candidate:null
    });
  }

  function startNewGame(mode){
    // The three title pulses have already completed the menu fade.
    // Stop any residual fallback element before the gameplay mix begins.
    MenuMusic.stop(0);
    const useOpeningPreview=
      awaitingPlayerSelection&&level===1&&Array.isArray(maze)&&maze.length===ROWS;
    completedRunHighScoreCandidate=null;
    pendingHighScoreCandidate=null;
    titleScreenMode='menu';
    gameMode=Math.max(0,Math.min(5,mode|0));
    if(gameMode===0){
      humanPlayerCount=0;
      alliedAiPlayerId=1;
      activePlayerCount=1;
    }else{
      humanPlayerCount=(gameMode===2||gameMode===4||isCooperativeMode())?2:1;
      alliedAiPlayerId=gameMode===3?2:gameMode===4?3:0;
      activePlayerCount=humanPlayerCount+(alliedAiPlayerId?1:0);
    }
    SoundManager.prepareGameplay();
    restoreGameplayCanvasResolution();
    awaitingPlayerSelection=false;
    canvas.setAttribute('aria-label','Maze Biters gameplay maze');
    if(screenReaderStatus) screenReaderStatus.textContent='Maze Biters gameplay';
    document.getElementById('gameWrap')?.classList?.remove('title-active');
    reset(true,useOpeningPreview);
    // Level one always draws from the calm Stillness bag and starts cleanly
    // without an additional one-shot intro cue.
    GameplayMusic.startLevel(level);
  }

  function loadExperimentalLevel(targetLevel){
    const selected=Math.max(1,Math.min(100,targetLevel|0));
    clearTimeout(levelEntryTimer);
    levelEntryTimer=0;
    levelEntryBuffer='';

    // Keep the selected player mode, scores and lives. Only the level and its
    // inhabitants are rebuilt, so the generator can be tested during any run.
    GameplayMusic.reserveLevel(selected);
    level=selected;
    reset(false);
    GameplayMusic.startLevel(level);
  }

  function enterExperimentalLevelDigit(digit){
    if(!/^[0-9]$/.test(digit)) return false;
    clearTimeout(levelEntryTimer);
    levelEntryBuffer=(levelEntryBuffer+digit).slice(-2);

    if(levelEntryBuffer.length===2){
      const parsed=Number(levelEntryBuffer);
      const selected=parsed===0?100:parsed;
      levelEntryBuffer='';
      if(selected>=1&&selected<=100) loadExperimentalLevel(selected);
      return true;
    }

    levelEntryTimer=setTimeout(()=>{
      levelEntryBuffer='';
      levelEntryTimer=0;
    },LEVEL_ENTRY_TIMEOUT);
    return true;
  }
  const SNAKE_YELLOW='#f4e66a';
  const SNAKE_BLUE='#66c2ff';
  const SNAKE_PINK='#d66bff';
  const SNAKE_ORANGE='#ff8873';
  const SNAKE_GREEN='#35e55b';
  const OPENING_SNAKE_PALETTE=[
    SNAKE_YELLOW,SNAKE_BLUE,SNAKE_PINK,SNAKE_ORANGE
  ];
  const SNAKE_PALETTE=[...OPENING_SNAKE_PALETTE,SNAKE_GREEN];

  function shuffledSnakePalette(palette){
    const shuffled=palette.slice();
    for(let i=shuffled.length-1;i>0;i--){
      const j=(Math.random()*(i+1))|0;
      [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
    }
    return shuffled;
  }

  function balancedSnakeColors(count,currentLevel=level){
    const total=Math.max(0,count|0);
    if(!total) return [];

    // Level 1 keeps the established four-color opening. The restored green
    // family enters from level 2 onward. When there are exactly four snakes,
    // all four are always different; level 2 is also guaranteed to introduce
    // green alongside three randomly selected established colors.
    if(currentLevel<=1)
      return shuffledSnakePalette(OPENING_SNAKE_PALETTE).slice(0,total);

    if(total<=4){
      const established=shuffledSnakePalette(OPENING_SNAKE_PALETTE)
        .slice(0,Math.max(0,total-1));
      return shuffledSnakePalette([SNAKE_GREEN,...established]);
    }

    const colors=[];
    while(colors.length<total){
      const cycle=shuffledSnakePalette(SNAKE_PALETTE);

      // Every complete cycle contains each of the five colors once, keeping
      // population counts within one. Avoid a duplicate at cycle boundaries.
      if(colors.length&&cycle.length>1&&cycle[0]===colors[colors.length-1]){
        const swapIndex=cycle.findIndex(color=>color!==colors[colors.length-1]);
        [cycle[0],cycle[swapIndex]]=[cycle[swapIndex],cycle[0]];
      }
      colors.push(...cycle);
    }
    return colors.slice(0,total);
  }
const HUNTER_PALETTE=['#ff9b55','#62d6ff','#ff66c4','#ffe066','#9b7bff','#74e88b'];
// Atlas row 0 mirrors player 1. Enemy births intentionally start on row 1
// and cycle only through the five dedicated hunter skins.
const FIRST_ENEMY_HUNTER_PALETTE_INDEX=1;
const ENEMY_HUNTER_PALETTE_COUNT=
  HUNTER_PALETTE.length-FIRST_ENEMY_HUNTER_PALETTE_INDEX;
let hunterColorIndex=0;
function nextEnemyHunterPaletteIndex(){
  const index=FIRST_ENEMY_HUNTER_PALETTE_INDEX+
    (hunterColorIndex%ENEMY_HUNTER_PALETTE_COUNT);
  hunterColorIndex++;
  return index;
}

const SNAKE_STARTS=[
  [26,3],[4,20],[26,20],[5,4],[4,11],
  [27,12],[28,12],[14,11],[17,12]
];

function balancedSnakeLengths(currentLevel,count){
  // Length now follows population rather than dropping on an intervening
  // level with no new snake. The original balanced milestones remain:
  // 3 snakes average 13 cells, down to 9 snakes averaging 7 cells.
  const targetAverage=Math.max(7,16-count);
  const spread=Math.min(4,Math.max(1,Math.floor((currentLevel+1)/2)));
  const deltas=[];

  if(count%2===1) deltas.push(0);
  let pair=0;
  while(deltas.length<count){
    const magnitude=1+(pair%spread);
    deltas.push(-magnitude,magnitude);
    pair++;
  }

  // Shuffle only the assignments. Paired deviations keep the exact total
  // length, so every short late-level snake is balanced by a longer one.
  for(let i=deltas.length-1;i>0;i--){
    const j=(Math.random()*(i+1))|0;
    [deltas[i],deltas[j]]=[deltas[j],deltas[i]];
  }
  return deltas.map(delta=>targetAverage+delta);
}

const NEW_LEVEL_HEAD_SAFETY_DISTANCE=14;

function snakeSpawnDistanceField(start){
  const distance=new Int16Array(COLS*ROWS);
  distance.fill(-1);
  if(isWall(start.x,start.y)) return distance;
  const queue=[{x:start.x,y:start.y}];
  distance[start.y*COLS+start.x]=0;
  let read=0;
  while(read<queue.length){
    const cell=queue[read++];
    const nextDistance=distance[cell.y*COLS+cell.x]+1;
    for(const direction of dirs){
      const x=cell.x+direction.x,y=cell.y+direction.y;
      if(isWall(x,y)) continue;
      const index=y*COLS+x;
      if(distance[index]>=0) continue;
      distance[index]=nextDistance;
      queue.push({x,y});
    }
  }
  return distance;
}

function snakeSpawnPlayerRoutes(){
  return allPlayers()
    .filter(p=>p.lives>0)
    .map(p=>{
      const start=PLAYER_STARTS[p.id-1];
      const routeStarts=[start,...dirs
        .map(direction=>({x:start.x+direction.x,y:start.y+direction.y}))
        .filter(cell=>!isWall(cell.x,cell.y))
      ];
      return {
        playerId:p.id,
        fields:routeStarts.map(routeStart=>
          snakeSpawnDistanceField(routeStart)
        )
      };
    });
}

function snakeSpawnFieldDistance(field,x,y){
  if(x<0||y<0||x>=COLS||y>=ROWS) return -1;
  return field[y*COLS+x];
}

function snakeSpawnDirectionPointsAtPlayer(
  x,y,direction,playerRoutes,limit=NEW_LEVEL_HEAD_SAFETY_DISTANCE
){
  return playerRoutes.some(route=>route.fields.some(field=>{
    const here=snakeSpawnFieldDistance(field,x,y);
    const next=snakeSpawnFieldDistance(
      field,x+direction.x,y+direction.y
    );
    return here>=0&&here<=limit&&next>=0&&next<here;
  }));
}

function snakeSpawnHeadCellIsFree(x,y,snake,reservedHeadExits=new Set()){
  if(isWall(x,y)||reservedHeadExits.has(`${x},${y}`)) return false;
  if(snakes.some(other=>
    other!==snake&&other.body.some(cell=>cell.x===x&&cell.y===y)
  )) return false;
  const ownEnd=Math.max(0,snake.body.length-1);
  for(let i=0;i<ownEnd;i++){
    if(snake.body[i].x===x&&snake.body[i].y===y) return false;
  }
  return !somePlayer(p=>!p.dead&&p.x===x&&p.y===y);
}

function orientNewLevelSnakeHeadAway(
  snake,playerRoutes,reservedHeadExits=new Set()
){
  if(!snake||!snake.body.length) return false;
  const originalHead=snake.body[0];
  const pointsAtPlayer=snakeSpawnDirectionPointsAtPlayer(
    originalHead.x,originalHead.y,snake.dir,playerRoutes
  );
  if(!pointsAtPlayer) return true;

  // This is an actual spawn-time endpoint swap. It does not enable the
  // snake's reversing mode: the old mouth becomes the tail near the player,
  // while the old tail becomes a new head at the opposite end of the body.
  if(snake.body.length===1){
    snake.dir={x:-snake.dir.x,y:-snake.dir.y};
  }else{
    snake.body.reverse();
    snake.dir={
      x:snake.body[0].x-snake.body[1].x,
      y:snake.body[0].y-snake.body[1].y
    };
  }
  snake.reversing=false;
  snake.reverseSteps=0;
  snake.tailGuide=null;
  snake.blockedDir=null;
  snake.headTrail=[];

  const head=snake.body[0];
  const options=dirs
    .filter(direction=>
      snakeSpawnHeadCellIsFree(
        head.x+direction.x,head.y+direction.y,
        snake,reservedHeadExits
      )&&
      !snakeSpawnDirectionPointsAtPlayer(
        head.x,head.y,direction,playerRoutes
      )
    )
    .map(direction=>({
      direction,
      followsBodyLine:direction.x===snake.dir.x&&direction.y===snake.dir.y
    }))
    .sort((a,b)=>Number(b.followsBodyLine)-Number(a.followsBodyLine));

  if(!options.length) return false;
  snake.dir={...options[0].direction};
  return true;
}

function makeSnakeWithHeadAwayFromPlayers(
  x,y,len,preferredDirection,playerRoutes,reservedHeadExits
){
  let fallback=null;
  const directionOptions=dirs.filter(direction=>
    !isWall(x+direction.x,y+direction.y)
  );

  for(let attempt=0;attempt<48;attempt++){
    const direction=attempt===0
      ? preferredDirection
      : directionOptions[attempt%directionOptions.length]||preferredDirection;
    const candidate=makeSnake(x,y,len,direction);
    if(candidate.body.some(cell=>
      reservedHeadExits.has(`${cell.x},${cell.y}`)
    )){
      continue;
    }

    const originallyPointedAtPlayer=snakeSpawnDirectionPointsAtPlayer(
      candidate.body[0].x,candidate.body[0].y,
      candidate.dir,playerRoutes
    );
    const oriented=orientNewLevelSnakeHeadAway(
      candidate,playerRoutes,reservedHeadExits
    );
    if(oriented){
      if(originallyPointedAtPlayer){
        const head=candidate.body[0];
        reservedHeadExits.add(
          `${head.x+candidate.dir.x},${head.y+candidate.dir.y}`
        );
      }
      return candidate;
    }
    fallback=candidate;
  }

  // Defensive fallback for an unusually constrained hand-authored maze.
  // It remains endpoint-swapped and never starts in reversing mode.
  if(fallback){
    fallback.color=SNAKE_PALETTE[0];
    fallback.reversing=false;
    fallback.tailGuide=null;
    fallback.blockedDir=null;
    return fallback;
  }
  return makeSnake(x,y,len,preferredDirection);
}

function spawnSnakesForLevel(){
  // Every mode starts with four snakes so SOLO, DUO VS and the VS AI modes
  // all receive a balanced opening population. Keep level 2 at four as well,
  // then preserve the established gradual progression through nine snakes.
  const count=Math.min(
    9,
    Math.max(
      4,
      3+Math.min(2,Math.max(0,level-1))+
        Math.floor(Math.max(0,level-3)/2)
    )
  );
  const lengths=balancedSnakeLengths(level,count);
  const colors=balancedSnakeColors(count,level);
  snakes=[];
  const playerRoutes=snakeSpawnPlayerRoutes();
  const reservedHeadExits=new Set();

  for(let i=0;i<count;i++){
    const [x,y]=SNAKE_STARTS[i];
    const options=dirs.filter(d=>!isWall(x+d.x,y+d.y));
    const d=options[(Math.random()*options.length)|0]||{x:1,y:0};
    const snake=makeSnakeWithHeadAwayFromPlayers(
      x,y,lengths[i],d,playerRoutes,reservedHeadExits
    );
    snake.color=colors[i];
    snakes.push(snake);
  }
  levelStartingSnakeMass=Math.max(
    1,
    snakes.reduce((total,snake)=>total+snake.body.length,0)
  );
}

function makeSnake(x,y,len,dir) {
    const occupied=new Set();
    (snakes||[]).forEach(existing=>
      existing.body.forEach(p=>occupied.add(`${p.x},${p.y}`))
    );

    const cellIsFree=(cellX,cellY,ownBody=new Set())=>
      !isWall(cellX,cellY) &&
      !occupied.has(`${cellX},${cellY}`) &&
      !ownBody.has(`${cellX},${cellY}`) &&
      !somePlayer(p=>!p.dead&&p.x===cellX&&p.y===cellY);

    // If a designed head position is unavailable, find the nearest free tile.
    let head={x,y};
    if(!cellIsFree(head.x,head.y)){
      let found=null;
      for(let radius=1;radius<Math.max(COLS,ROWS) && !found;radius++){
        for(let dy=-radius;dy<=radius && !found;dy++){
          for(let dx=-radius;dx<=radius;dx++){
            if(Math.abs(dx)+Math.abs(dy)!==radius) continue;
            if(cellIsFree(x+dx,y+dy)){
              found={x:x+dx,y:y+dy};
              break;
            }
          }
        }
      }
      if(found) head=found;
    }

    const body=[head];
    const bodyCells=new Set([`${head.x},${head.y}`]);
    let bestBody=body.slice();
    let explored=0;

    // Grow backward through the maze. Backtracking allows the body to turn
    // around walls while remaining one continuous, non-overlapping organism.
    const grow=(lastGrowthDir)=>{
      if(body.length>bestBody.length) bestBody=body.map(p=>({...p}));
      if(body.length>=len) return true;
      if(++explored>12000) return false;

      const tail=body[body.length-1];
      const options=dirs
        .filter(step=>cellIsFree(tail.x+step.x,tail.y+step.y,bodyCells))
        .map(step=>({
          step,
          priority:(step.x===lastGrowthDir.x&&step.y===lastGrowthDir.y?0:1)+Math.random()*0.2
        }))
        .sort((a,b)=>a.priority-b.priority);

      for(const option of options){
        const next={x:tail.x+option.step.x,y:tail.y+option.step.y};
        const key=`${next.x},${next.y}`;
        body.push(next);
        bodyCells.add(key);
        if(grow(option.step)) return true;
        body.pop();
        bodyCells.delete(key);
      }
      return false;
    };

    grow({x:-dir.x,y:-dir.y});
    if(body.length<len) body.splice(0,body.length,...bestBody);

    const actualDir=body.length>1
      ? {x:body[0].x-body[1].x,y:body[0].y-body[1].y}
      : {...dir};

    return {
      body,
      color:SNAKE_PALETTE[0],
      dir:actualDir,
      reversing:false,
      reverseSteps:0,
      tailGuide:null,
      blockedDir:null,
      headTrail:[],
      anger:0,
      angerPeak:0,
      angerFloor:0,
      lastAngerTime:0,
      lastMemoryTick:0,
      temperament:0.2 + Math.random()*0.6,
      threatByPlayer:[0,0,0],
      lastMove:0,
      turnBias:Math.random()
    };
  }

  // Gameplay HUD spotlights reuse two full-HUD buffers and one cached beam.
  // Outside an active cue they perform no drawing and create no frame objects.
  // Score changes keep the original quick sweep. LIVES uses one slower
  // pass. LEVEL keeps the same per-pass pace across three continuous passes:
  // right, left, then right again, with no dwell at either edge.
  const HUD_SPOTLIGHT_SCORE_MS=620;
  const HUD_SPOTLIGHT_LIFE_MS=HUD_SPOTLIGHT_SCORE_MS*2;
  const HUD_SPOTLIGHT_LEVEL_MS=HUD_SPOTLIGHT_SCORE_MS*6;
  const HUD_SPOTLIGHT_BEAM_WIDTH=72;
  const HUD_SPOTLIGHT_RIGHT_EDGE_OVERLAP=0.18;
  let levelSpotlightStartedAt=-Infinity;
  const hudSpotlightMaskCanvas=document.createElement('canvas');
  const hudSpotlightMaskContext=hudSpotlightMaskCanvas.getContext('2d');
  const hudSpotlightEffectCanvas=document.createElement('canvas');
  const hudSpotlightEffectContext=hudSpotlightEffectCanvas.getContext('2d');
  const hudSpotlightBeamCanvas=document.createElement('canvas');
  const hudSpotlightBeamContext=hudSpotlightBeamCanvas.getContext('2d');
  let hudSpotlightBeamGradient=null;

  function configureHudSpotlightBuffers(){
    hudSpotlightMaskCanvas.width=HUD_BACKING_WIDTH;
    hudSpotlightMaskCanvas.height=HUD_BACKING_HEIGHT;
    hudSpotlightEffectCanvas.width=HUD_BACKING_WIDTH;
    hudSpotlightEffectCanvas.height=HUD_BACKING_HEIGHT;
    hudSpotlightBeamCanvas.width=Math.ceil(
      HUD_SPOTLIGHT_BEAM_WIDTH*HUD_RENDER_SCALE
    );
    hudSpotlightBeamCanvas.height=HUD_BACKING_HEIGHT;
    hudSpotlightBeamGradient=hudSpotlightBeamContext.createLinearGradient(
      0,0,hudSpotlightBeamCanvas.width,0
    );
    hudSpotlightBeamGradient.addColorStop(0,'rgba(30,220,255,0)');
    hudSpotlightBeamGradient.addColorStop(0.18,'rgba(30,220,255,0.76)');
    hudSpotlightBeamGradient.addColorStop(0.48,'rgba(255,255,218,1)');
    hudSpotlightBeamGradient.addColorStop(0.72,'rgba(255,68,230,0.86)');
    hudSpotlightBeamGradient.addColorStop(1,'rgba(255,68,230,0)');
    hudSpotlightBeamContext.fillStyle=hudSpotlightBeamGradient;
    hudSpotlightBeamContext.fillRect(
      0,0,hudSpotlightBeamCanvas.width,hudSpotlightBeamCanvas.height
    );
  }
  configureHudSpotlightBuffers();

  function hudSpotlightActive(startedAt,duration,t=performance.now()){
    const elapsed=t-startedAt;
    return Number.isFinite(startedAt)&&elapsed>=0&&elapsed<duration;
  }

  function drawHudSpotlight(
    startedAt,duration,directionPasses,minX,maxX,drawMask,t=performance.now()
  ){
    const elapsed=t-startedAt;
    if(!Number.isFinite(startedAt)||elapsed<0||elapsed>=duration) return;
    const passCount=directionPasses===true?2:
      directionPasses===false?1:Math.max(1,directionPasses|0);
    const passPosition=(elapsed/duration)*passCount;
    const passIndex=Math.min(passCount-1,Math.floor(passPosition));
    const passProgress=passPosition-passIndex;
    // Even passes travel right and odd passes travel left. The next pass
    // starts on the exact edge where the previous one ended, so there is no
    // empty hold frame or visual gap between reversals.
    const travel=passIndex%2===0?passProgress:1-passProgress;

    const mask=hudSpotlightMaskContext;
    mask.setTransform(1,0,0,1,0,0);
    mask.clearRect(0,0,HUD_BACKING_WIDTH,HUD_BACKING_HEIGHT);
    mask.setTransform(HUD_RENDER_SCALE,0,0,HUD_RENDER_SCALE,0,0);
    mask.imageSmoothingEnabled=false;
    drawMask(mask);

    const effect=hudSpotlightEffectContext;
    effect.setTransform(1,0,0,1,0,0);
    effect.clearRect(0,0,HUD_BACKING_WIDTH,HUD_BACKING_HEIGHT);
    effect.globalCompositeOperation='source-over';
    // Keep the leading 18% of the beam on the final glyph at the
    // right-hand turn. Previously the beam travelled a complete extra width
    // beyond maxX, creating a visible empty pause before it returned.
    const leftEdge=minX-HUD_SPOTLIGHT_BEAM_WIDTH;
    const rightEdge=maxX-
      HUD_SPOTLIGHT_BEAM_WIDTH*HUD_SPOTLIGHT_RIGHT_EDGE_OVERLAP;
    const logicalBeamX=leftEdge+travel*(rightEdge-leftEdge);
    effect.drawImage(
      hudSpotlightBeamCanvas,
      Math.round(logicalBeamX*HUD_RENDER_SCALE),0
    );
    effect.globalCompositeOperation='destination-in';
    effect.drawImage(hudSpotlightMaskCanvas,0,0);
    effect.globalCompositeOperation='source-over';

    bctx.save();
    bctx.setTransform(1,0,0,1,0,0);
    bctx.globalAlpha=1;
    bctx.globalCompositeOperation='source-over';
    bctx.drawImage(hudSpotlightEffectCanvas,0,0);
    bctx.restore();
  }

  function hasActiveHudSpotlight(roster=allPlayers(),t=performance.now()){
    if(hudSpotlightActive(
      levelSpotlightStartedAt,HUD_SPOTLIGHT_LEVEL_MS,t
    )) return true;
    return roster.some(p=>
      hudSpotlightActive(
        p.lifeSpotlightStartedAt,HUD_SPOTLIGHT_LIFE_MS,t
      )||hudSpotlightActive(
        p.scoreSpotlightStartedAt,HUD_SPOTLIGHT_SCORE_MS,t
      )
    );
  }


  function updateHud(specificPlayer=null){
    let gainedLives=0;
    let gainedLifeEmitter=null;
    const gainedAt=performance.now();
    const candidates=specificPlayer?[specificPlayer]:allPlayers();
    candidates.forEach(p=>{
      while((p.scoreExact??p.score)>=p.nextExtraLifeScore){
        // The predictable 5000-point rhythm remains, but no player may bank
        // more than nine lives. A threshold reached at the cap is consumed,
        // so losing a life later does not release a hidden backlog at once.
        if(p.lives<9){
          p.lives++;
          gainedLives++;
          gainedLifeEmitter=gainedLifeEmitter||p;
          p.extraLivesEarned++;
          // A fresh bonus always restarts the player's three-pulse signal.
          p.lifeSpotlightStartedAt=gainedAt;
          p.lifePulseStartedAt=gainedAt+HUD_SPOTLIGHT_LIFE_MS;
        }
        p.nextExtraLifeScore+=5000;
      }
    });
    if(gainedLives) playSound('BonusLife@',gainedLifeEmitter);
    // Score/life rules are applied immediately above, but bitmap glyph work is
    // coalesced into the next animation frame. Rapid bites therefore cause one
    // HUD render per frame instead of one (previously sometimes two) per bite.
    hudDirty=true;
  }

  function awardPoints(
    p,amount,provocation=0,suppressLeaderSpotlight=false
  ){
    if(!p) return;
    const leaderBefore=uniqueLeaderId(allPlayers());
    p.scoreExact=(p.scoreExact??p.score??0)+amount*combinedScoreMultiplier();
    p.score=Math.floor((p.scoreExact+1e-9)/5)*5;
    const leaderAfter=uniqueLeaderId(allPlayers());
    if(!suppressLeaderSpotlight&&
       leaderAfter===p.id&&leaderAfter!==leaderBefore){
      p.scoreSpotlightStartedAt=performance.now();
    }
    p.aggressionContribution=Math.max(
      0,
      (p.aggressionContribution||0)+provocation
    );
    updateHud(p);
  }

  function provokeCreature(entity,p,amount,recordPlayer=true){
    if(!entity||!p||amount<=0) return;
    if(!entity.threatByPlayer) entity.threatByPlayer=[0,0,0];
    entity.threatByPlayer[p.id-1]=
      (entity.threatByPlayer[p.id-1]||0)+amount;
    if(recordPlayer){
      p.aggressionContribution=(p.aggressionContribution||0)+amount;
    }
  }

  function renderHud(roster=allPlayers(),t=performance.now()){
    // Restore the complete black-and-stars background with one native-size
    // copy. Text and spotlights are then drawn above it exactly as before.
    bctx.save();
    bctx.setTransform(1,0,0,1,0,0);
    bctx.globalAlpha=1;
    bctx.globalCompositeOperation='copy';
    bctx.drawImage(hudCosmicBackgroundCanvas,0,0);
    bctx.restore();
    const label=p=>p.isAI?'AI':'P'+p.id;
    const textBounds=(text,x,options={})=>{
      const width=[...String(text)].length*16*(options.scale||1);
      let left=x;
      if(options.align==='center') left-=width/2;
      if(options.align==='right') left-=width;
      return {left,right:left+width};
    };
    const drawScore=(p,text,x,options={})=>{
      const finalOptions=p.isAI
        ?{...options,fontSprites:RedFontSprites}
        :options;
      bctx.save();
      bctx.globalAlpha=scorePulseAlpha(p,roster,t);
      drawBitmapText(bctx,text,x,0,finalOptions);
      bctx.restore();
      const bounds=textBounds(text,x,finalOptions);
      drawHudSpotlight(
        p.scoreSpotlightStartedAt,HUD_SPOTLIGHT_SCORE_MS,false,
        bounds.left,bounds.right,
        mask=>drawBitmapText(mask,text,x,0,finalOptions),t
      );
    };
    const drawLives=(p,text,x,options={})=>{
      bctx.save();
      bctx.globalAlpha=lifePulseAlpha(p,t);
      drawBitmapText(bctx,text,x,16,options);
      bctx.restore();
      const bounds=textBounds(text,x,options);
      drawHudSpotlight(
        p.lifeSpotlightStartedAt,HUD_SPOTLIGHT_LIFE_MS,false,
        bounds.left,bounds.right,
        mask=>drawBitmapText(mask,text,x,16,options),t
      );
    };
    // The native 4:3 HUD is 576 logical pixels wide. Use its true edges
    // instead of retaining the former 512-pixel centred layout and its
    // 32-pixel dead margins on both sides.
    const hudLeft=0;
    const hudCentre=HUD_LOGICAL_WIDTH/2;
    const hudRight=HUD_LOGICAL_WIDTH;
    const drawLevel=(x,options={})=>{
      const levelText='LEVEL '+level;
      drawBitmapText(bctx,levelText,x,0,options);
      const bounds=textBounds(levelText,x,options);
      drawHudSpotlight(
        levelSpotlightStartedAt,HUD_SPOTLIGHT_LEVEL_MS,3,
        bounds.left,bounds.right,
        mask=>drawBitmapText(mask,levelText,x,0,options),t
      );
    };
    if(roster.length<3){
      drawScore(player,label(player)+' '+String(player.score).padStart(4,'0'),hudLeft);
      drawLives(player,'LIVES '+player.lives,hudLeft);
      drawLevel(hudCentre,{align:'center'});
      drawBitmapText(bctx,'SNAKES '+snakes.length,hudCentre,16,{align:'center'});
      if(roster.length===2){
        drawScore(
          player2,label(player2)+' '+String(player2.score).padStart(4,'0'),
          hudRight,{align:'right'}
        );
        drawLives(player2,'LIVES '+player2.lives,hudRight,{align:'right'});
      }
    }else{
      // Four full-size zones fit across the wider HUD. This keeps the player
      // scores at the outer edges while restoring the complete LIVES, LEVEL
      // and SNAKES labels that the old compact layout abbreviated.
      const player2X=144;
      const statusX=288;
      drawScore(player,label(player)+' '+String(player.score).padStart(4,'0'),hudLeft);
      drawScore(
        player2,label(player2)+' '+String(player2.score).padStart(4,'0'),player2X
      );
      drawScore(
        player3,label(player3)+' '+String(player3.score).padStart(4,'0'),
        hudRight,{align:'right'}
      );
      drawLives(player,'LIVES '+player.lives,hudLeft);
      drawLives(player2,'LIVES '+player2.lives,player2X);
      drawLevel(statusX);
      drawBitmapText(bctx,'SNAKES '+snakes.length,statusX,16);
      drawLives(player3,'LIVES '+player3.lives,hudRight,{align:'right'});
    }
  }

  function isPowerMode(p,t=gameTimeNow()){
    return !!p&&p.powerModeUntil>t;
  }

  function createPlayerAtStart(p){
    return createPlayerState(p.id,p);
  }

  function playerStartIsClear(p){
    const start=PLAYER_STARTS[p.id-1];
    const x=start.x,y=start.y;
    return !isWall(x,y) &&
      !snakes.some(s=>s.body.some(p=>p.x===x&&p.y===y)) &&
      !(scorpion&&(
        (scorpion.x===x&&scorpion.y===y)||
        (scorpion.tailX===x&&scorpion.tailY===y)
      )) &&
      !hunters.some(h=>h.x===x&&h.y===y) &&
      !eggs.some(e=>e.x===x&&e.y===y) &&
      !somePlayer(other=>other!==p&&!other.dead&&other.x===x&&other.y===y);
  }

  function playerVisualPosition(p,t=gameTimeNow(),out=null){
    const visual=out||{x:0,y:0};
    if(p.dead){
      visual.x=p.deathX;
      visual.y=p.deathY;
      return visual;
    }
    if(gameOverVisualsSettled&&!p.ignoreGameOverFreeze){
      visual.x=p.x;
      visual.y=p.y;
      return visual;
    }
    const duration=Math.max(1,p.moveDuration||95);
    const progress=Math.max(0,Math.min(1,(t-(p.moveStartedAt||t))/duration));
    visual.x=(p.moveFromX??p.x)+
      ((p.moveToX??p.x)-(p.moveFromX??p.x))*progress;
    visual.y=(p.moveFromY??p.y)+
      ((p.moveToY??p.y)-(p.moveFromY??p.y))*progress;
    return visual;
  }

  function smoothEntityPosition(entity,t=gameTimeNow(),prefix='',out=null){
    const visual=out||{x:0,y:0};
    const logicalX=prefix ? (entity[`${prefix}X`] ?? entity.x) : entity.x;
    const logicalY=prefix ? (entity[`${prefix}Y`] ?? entity.y) : entity.y;
    if(gameOverVisualsSettled&&!entity.ignoreGameOverFreeze){
      visual.x=logicalX;
      visual.y=logicalY;
      return visual;
    }
    const fromX=prefix
      ? (entity[`${prefix}MoveFromX`] ?? logicalX)
      : (entity.moveFromX ?? logicalX);
    const fromY=prefix
      ? (entity[`${prefix}MoveFromY`] ?? logicalY)
      : (entity.moveFromY ?? logicalY);
    const toX=prefix
      ? (entity[`${prefix}MoveToX`] ?? logicalX)
      : (entity.moveToX ?? logicalX);
    const toY=prefix
      ? (entity[`${prefix}MoveToY`] ?? logicalY)
      : (entity.moveToY ?? logicalY);
    const startedAt=entity.moveStartedAt??t;
    const duration=Math.max(1,entity.moveDuration||95);
    const progress=Math.max(0,Math.min(1,(t-startedAt)/duration));
    visual.x=fromX+(toX-fromX)*progress;
    visual.y=fromY+(toY-fromY)*progress;
    return visual;
  }

  function snakeBodyPointIsCorner(body,index){
    if(index<=0 || index>=body.length-1) return false;
    const p=body[index],previous=body[index-1],next=body[index+1];
    const ax=previous.x-p.x;
    const ay=previous.y-p.y;
    const bx=next.x-p.x;
    const by=next.y-p.y;
    return (ax!==0&&by!==0)||(ay!==0&&bx!==0);
  }

  function snakeMovementChangesAxis(previous,current){
    if(!previous||!current) return false;
    // A 180-degree reversal along the same straight corridor keeps the same
    // sprite geometry and should slide. Only a horizontal/vertical axis change
    // is a real corner that must snap on the logical movement tick.
    return (previous.x!==0)!==(current.x!==0);
  }

  function recordSnakeVisualStep(
    s,oldBody,t,logicalDelay,oldHeadTravelDirection,
    wasReversing=false,oldHeadVisualPosition=null
  ){
    const newBody=s.body.map(p=>({x:p.x,y:p.y}));
    s.reverseHeadPredictionPlan=null;
    s.reverseHeadVisualRecovery=false;
    const previousDirections=s.segmentMoveDirections||[];
    const tailIndex=newBody.length-1;
    s.reverseTailTurnReveal=false;
    // During tail-led retreat the visible head is about to occupy body[1].
    // If that segment is a corner, the head form must change on this exact
    // logical tick before any later straight interpolation is allowed.
    const headMovesIntoCorner=snakeBodyPointIsCorner(oldBody,1);
    const tailMovesIntoCorner=snakeBodyPointIsCorner(
      oldBody,
      oldBody.length-2
    );
    const currentDirections=newBody.map((p,i)=>{
      const from=oldBody[i]||p;
      const dx=p.x-from.x,dy=p.y-from.y;
      return Math.abs(dx)+Math.abs(dy)===1 ? {x:dx,y:dy} : null;
    });
    const oldBeforeTail=oldBody[tailIndex-1];
    const oldTail=oldBody[tailIndex];
    const newTail=newBody[tailIndex];
    if(s.reversing && tailIndex>0 && oldBeforeTail && oldTail && newTail){
      const oldDx=oldTail.x-oldBeforeTail.x;
      const oldDy=oldTail.y-oldBeforeTail.y;
      const newDx=newTail.x-oldTail.x;
      const newDy=newTail.y-oldTail.y;
      s.reverseTailTurnReveal=
        Math.abs(oldDx)+Math.abs(oldDy)===1 &&
        Math.abs(newDx)+Math.abs(newDy)===1 &&
        (oldDx!==0)!==(newDx!==0);
    }

    s.visualBodyFrom=newBody.map((p,i)=>{
      const from=oldBody[i];
      return from ? {x:from.x,y:from.y} : {x:p.x,y:p.y};
    });
    s.visualBodyTo=newBody;
    s.visualSegmentSnap=currentDirections.map((move,i)=>{
      if(!move) return true;
      const isSolitaryHead=i===0&&newBody.length===1;
      // A solitary head has no body or tail geometry to keep anchored. A
      // complete snake, however, must first install its new head form exactly
      // when reverse travel reaches a body corner. Only the following move,
      // after the corner is behind the head, may interpolate on a straight.
      if(i===0 && !isSolitaryHead){
        if(s.reversing && headMovesIntoCorner) return true;
        return snakeMovementChangesAxis(oldHeadTravelDirection,move);
      }
      // In forward motion the corner remains fixed until the final tail
      // segment reaches it. During tail-led retreat that same corner is behind
      // the moving tail, so reusing this test would incorrectly snap the first
      // straight step after every reverse turn.
      if(i===tailIndex && !s.reversing && tailMovesIntoCorner) return true;
      // A retreating tail that creates a new 90-degree corner gets its own
      // short midpoint reveal below. It must never inherit the normal
      // direction-change snap used by stationary middle segments.
      if(i===tailIndex && s.reverseTailTurnReveal) return false;
      const previous=previousDirections[i];
      // A genuine 90-degree corner snaps on the exact logical tick. A
      // 180-degree forward/reverse transition remains on the same axis and
      // keeps the quick arcade slide from its very first movement step.
      // The head has already made its phase-aware decision above;
      // this historical segment-direction test is only for the tail/body end.
      return i!==0 && !isSolitaryHead &&
        snakeMovementChangesAxis(previous,move);
    });

    // When forward motion becomes blocked, the predictive half-tick tail has
    // often already travelled toward the body. Preserve that exact sub-cell
    // position and slide it back to the logical tail cell instead of snapping
    // there when reversing mode is enabled.
    const retreatStart=s.retreatStartTailVisual;
    if(retreatStart && tailIndex>0){
      s.visualBodyFrom[tailIndex]={x:retreatStart.x,y:retreatStart.y};
      s.visualSegmentSnap[tailIndex]=false;
      s.retreatStartTailVisual=null;
    }

    if(s.reverseTailTurnReveal && oldTail && newTail){
      // Do not animate the sharp tail from the centre of the old corner. Begin
      // halfway across the shared route, where the destination-cell mask can
      // reveal it cleanly, and cover only the remaining half of the movement.
      s.visualBodyFrom[tailIndex]={
        x:(oldTail.x+newTail.x)*0.5,
        y:(oldTail.y+newTail.y)*0.5
      };
      s.visualSegmentSnap[tailIndex]=false;
    }

    // A dynamically blocked tail can reverse the logical decision after the
    // head has already begun its latched predictive retreat. Continue from the
    // exact rendered sub-cell, pass through the old logical head tile, and
    // only then reach the new forward tile. This removes both the rollback
    // snap and the apparent two-cell teleport around a corner.
    const oldHead=oldBody[0];
    const headWasVisuallyRetreating=
      wasReversing && tailIndex>0 &&
      oldHead && oldHeadVisualPosition &&
      (Math.abs(oldHeadVisualPosition.x-oldHead.x)>0.0001 ||
       Math.abs(oldHeadVisualPosition.y-oldHead.y)>0.0001);
    const newHead=newBody[0];
    const logicalHeadMoved=!!oldHead&&!!newHead&&
      (oldHead.x!==newHead.x || oldHead.y!==newHead.y);

    if(headWasVisuallyRetreating && !s.reversing){
      // The blocked tail caused an immediate forward decision. Preserve the
      // old logical head cell as a waypoint so a corner is not cut diagonally.
      s.visualBodyFrom[0]={
        x:oldHeadVisualPosition.x,
        y:oldHeadVisualPosition.y
      };
      s.visualSegmentSnap[0]=false;
    }else if(headWasVisuallyRetreating && s.reversing && !logicalHeadMoved){
      // Both ends are blocked. Smoothly recover from the already rendered
      // prediction to the unchanged logical head instead of dropping the
      // prediction and snapping back one full cell.
      s.visualBodyFrom[0]={
        x:oldHeadVisualPosition.x,
        y:oldHeadVisualPosition.y
      };
      s.visualSegmentSnap[0]=false;
      s.reverseHeadVisualRecovery=true;
    }

    s.segmentMoveDirections=currentDirections.map((move,i)=>
      move || previousDirections[i] || null
    );
    s.visualMoveStartedAt=t;
    // Solitary, two-cell and long snakes all use the same 55/45 impulse.
    const slideRatio=SNAKE_SLIDE_RATIO;
    // A forward-resume recovery covers only the predicted reverse cell back
    // to the unchanged logical head. Give it one ordinary cell's animation
    // duration, not the doubled reverse interval that triggered this tick.
    const visualLogicalDelay=s.forwardResumeRecovery
      ? snakeMoveDelay()
      : logicalDelay;
    s.visualLogicalDelay=visualLogicalDelay;
    s.visualMoveDuration=visualLogicalDelay*slideRatio;
    s.forwardResumeRecovery=false;
  }

  function predictiveSnakeTailPosition(s,t,out=null){
    const tailIndex=s.body.length-1;
    if(tailIndex<1 || s.reversing || s.visualTailPredictionDisabled) return null;

    const tail=s.body[tailIndex];
    // In normal motion the next tail cell is always the current segment
    // immediately in front of it. A corner means a new tail form, so that
    // change remains snapped on the logical movement tick.
    if(snakeBodyPointIsCorner(s.body,tailIndex-1)) return null;
    const target=s.body[tailIndex-1];
    const baseDelay=s.visualLogicalDelay||snakeMoveDelay();
    const logicalDelay=baseDelay;
    const elapsed=Math.max(0,t-(s.lastMove||t));
    const startAt=logicalDelay*SNAKE_TAIL_LEAD_RATIO;
    const predictiveSpeed=s.body.length<=2
      ? 1
      : PREDICTIVE_SLIDE_SPEED_MULTIPLIER;
    const travelTime=Math.max(
      1,
      (logicalDelay-startAt)/predictiveSpeed
    );
    const progress=Math.max(0,Math.min(1,(elapsed-startAt)/travelTime));
    const result=out||{x:0,y:0};
    result.x=tail.x+(target.x-tail.x)*progress;
    result.y=tail.y+(target.y-tail.y)*progress;
    return result;
  }

  function reverseHeadJunctionState(s){
    if(!s || !s.reversing || s.body.length<2) return null;
    const head=s.body[0];
    const neck=s.body[1];
    const neckDir={x:neck.x-head.x,y:neck.y-head.y};
    const openFromHead=dirs.filter(d=>{
      if(d.x===neckDir.x&&d.y===neckDir.y) return false;
      return canEnter(head.x+d.x,head.y+d.y,s,true);
    });
    const oldRouteDir=s.reverseHeadOldRouteDir||{x:s.dir.x,y:s.dir.y};
    const newBranches=openFromHead.filter(d=>
      d.x!==oldRouteDir.x || d.y!==oldRouteDir.y
    );
    const atNewJunction=newBranches.length>0;
    const junctionKey=`${head.x},${head.y}`;
    const skippedThisRetreat=(s.reverseSkippedJunctions||[])
      .includes(junctionKey);
    const returningFromFailedBranch=
      s.reverseReturnAvoidJunction===junctionKey;
    const eligible=(s.reverseSteps||0)>=1 && atNewJunction &&
      !skippedThisRetreat && !returningFromFailedBranch;
    const tail=s.body[s.body.length-1];
    const branchSignature=newBranches
      .map(d=>`${d.x},${d.y}`)
      .join(";");
    const decisionKey=
      `${junctionKey}|${neck.x},${neck.y}|${tail.x},${tail.y}|`+
      `${s.reverseSteps||0}|${branchSignature}`;
    return {
      head,openFromHead,oldRouteDir,newBranches,atNewJunction,
      junctionKey,skippedThisRetreat,returningFromFailedBranch,
      eligible,decisionKey
    };
  }

  function prepareReverseHeadJunctionDecision(s){
    const state=reverseHeadJunctionState(s);
    if(!state || !state.eligible){
      s.reverseHeadJunctionDecision=null;
      return state;
    }
    const prepared=s.reverseHeadJunctionDecision;
    if(!prepared || prepared.key!==state.decisionKey){
      s.reverseHeadJunctionDecision={
        key:state.decisionKey,
        takeNewBranch:
          Math.random()<REVERSE_HEAD_NEW_BRANCH_CHANCE
      };
    }
    return state;
  }

  function createReverseHeadPredictionTarget(s){
    const head=s.body[0];
    if(!head || s.body.length<2) return null;

    // The junction decision was latched immediately after the previous
    // logical move. Declining a branch therefore keeps the ordinary reverse
    // motor running; only an accepted branch holds the head for its turn.
    const junctionState=reverseHeadJunctionState(s);
    if(junctionState && junctionState.eligible){
      const prepared=s.reverseHeadJunctionDecision;
      if(!prepared || prepared.key!==junctionState.decisionKey ||
         prepared.takeNewBranch) return null;
    }

    const tail=s.body[s.body.length-1];
    const beforeTail=s.body[s.body.length-2];
    const guideDir=(s.tailGuide&&
      s.tailGuide.x===tail.x&&s.tailGuide.y===tail.y)
      ? s.tailGuide.dir
      : {x:tail.x-beforeTail.x,y:tail.y-beforeTail.y};
    const reverse={x:-guideDir.x,y:-guideDir.y};
    const tailOptions=dirs.filter(d=>{
      if(d.x===reverse.x&&d.y===reverse.y) return false;
      return canEnter(tail.x+d.x,tail.y+d.y,s,true);
    });
    if(!tailOptions.length) return null;
    const straight=tailOptions.find(d=>d.x===guideDir.x&&d.y===guideDir.y);
    const chosen=straight||tailOptions[0];
    if(playerAt(tail.x+chosen.x,tail.y+chosen.y)) return null;

    // Entering a corner changes the visible head form and remains snapped.
    if(snakeBodyPointIsCorner(s.body,1)) return null;
    return {x:s.body[1].x,y:s.body[1].y};
  }

  function predictiveReverseHeadPosition(s,t,out=null){
    if(!s.reversing || !s.body.length) return null;
    const head=s.body[0];
    let target=null;

    if(s.body.length===1){
      const previous=s.headTrail?.length
        ? s.headTrail[s.headTrail.length-1]
        : null;
      if(!previous ||
         !!playerAt(previous.x,previous.y) ||
         !canEnter(previous.x,previous.y,s,true)) return null;

      const retreatDir={x:previous.x-head.x,y:previous.y-head.y};
      const open=dirs.filter(d=>canEnter(head.x+d.x,head.y+d.y,s,true));
      const newBranches=open.filter(d=>{
        if(s.blockedDir&&d.x===s.blockedDir.x&&d.y===s.blockedDir.y) return false;
        if(d.x===retreatDir.x&&d.y===retreatDir.y) return false;
        if(d.x===s.dir.x&&d.y===s.dir.y) return false;
        return true;
      });
      if((s.reverseSteps||0)>=1 && open.length>=2&&newBranches.length) return null;
      target=previous;
    }else{
      // The plan is evaluated once per logical snake interval. Other snakes
      // may move afterward, but rendering must not cancel an interpolation
      // halfway through and teleport the head back to its logical cell.
      const neck=s.body[1];
      const planKey=
        `${s.lastMove||0}|${s.body.length}|`+
        `${head.x},${head.y}|${neck.x},${neck.y}`;
      let plan=s.reverseHeadPredictionPlan;
      if(!plan || plan.key!==planKey){
        const plannedTarget=createReverseHeadPredictionTarget(s);
        plan={
          key:planKey,
          target:plannedTarget
            ? {x:plannedTarget.x,y:plannedTarget.y}
            : null
        };
        s.reverseHeadPredictionPlan=plan;
      }
      if(!plan.target) return null;
      target=plan.target;
    }

    const logicalDelay=snakeMoveDelay()*2;
    const elapsed=Math.max(0,t-(s.lastMove||t));
    const startAt=logicalDelay*SNAKE_TAIL_LEAD_RATIO;
    const predictiveSpeed=s.body.length<=2
      ? 1
      : PREDICTIVE_SLIDE_SPEED_MULTIPLIER;
    const travelTime=Math.max(
      1,
      (logicalDelay-startAt)/predictiveSpeed
    );
    const progress=Math.max(0,Math.min(1,(elapsed-startAt)/travelTime));
    const result=out||{x:0,y:0};
    result.x=head.x+(target.x-head.x)*progress;
    result.y=head.y+(target.y-head.y)*progress;
    return result;
  }

  function snakeSegmentVisualPosition(
    s,index,t=gameTimeNow(),out=null,ignoreGameOverFreeze=false
  ){
    const logical=s.body[index];
    const result=out||{x:0,y:0};
    if(!logical){
      result.x=0;
      result.y=0;
      return result;
    }
    // GAME OVER freezes only complete logical cells. In particular, this
    // prevents a predictive tail tip from being captured halfway between two
    // cells on the first frozen frame.
    if(gameOverVisualsSettled&&!ignoreGameOverFreeze){
      result.x=logical.x;
      result.y=logical.y;
      return result;
    }
    const isTail=index===s.body.length-1 && s.body.length>1;
    if(isTail && !s.reversing){
      const predicted=predictiveSnakeTailPosition(s,t,result);
      // A null prediction means that the next step changes the tail's form;
      // keep it fixed and let the logical tick replace the sprite instantly.
      if(predicted) return predicted;
      result.x=logical.x;
      result.y=logical.y;
      return result;
    }
    // The predictive half-tick lead is needed only while a complete snake is
    // being pulled from its tail. A solitary head always uses its recorded
    // old and new cells below, guaranteeing a smooth transition in every
    // forward, backward, blocked and post-turn movement case.
    if(index===0 && s.reversing && s.body.length>1 &&
       !s.reverseHeadVisualRecovery){
      const predicted=predictiveReverseHeadPosition(s,t,result);
      if(predicted) return predicted;
      result.x=logical.x;
      result.y=logical.y;
      return result;
    }
    const from=s.visualBodyFrom?.[index];
    const to=s.visualBodyTo?.[index];
    if(!from || !to || s.visualSegmentSnap?.[index]){
      result.x=logical.x;
      result.y=logical.y;
      return result;
    }
    const midpointTailReveal=
      index===s.body.length-1 && s.reverseTailTurnReveal;
    const duration=Math.max(
      1,
      (s.visualMoveDuration||95)*(midpointTailReveal?0.5:1)
    );
    const progress=Math.max(0,Math.min(
      1,
      (t-(s.visualMoveStartedAt??t))/duration
    ));

    result.x=from.x+(to.x-from.x)*progress;
    result.y=from.y+(to.y-from.y)*progress;
    return result;
  }

  function resetPlayerVisualPosition(p){
    const now=gameTimeNow();
    p.moveFromX=p.x;
    p.moveFromY=p.y;
    p.moveToX=p.x;
    p.moveToY=p.y;
    p.moveStartedAt=now;
    p.moveDuration=playerMoveDelay(p,now)*PLAYER_SLIDE_RATIO;
  }

  function initializePowerMode(p,t=gameTimeNow()){
    const alreadyPowered=isPowerMode(p,t);
    const previousRemaining=alreadyPowered?p.powerModeUntil-t:0;
    const currentStrength=alreadyPowered?powerModeSpeedStrength(p,t):0;
    const currentlyRamping=alreadyPowered&&
      t<(p.powerSpeedRampStartedAt||0)+(p.powerSpeedRampDuration||0);

    if(!alreadyPowered){
      p.powerModeStartedAt=t;
      p.powerSpeedRampStartedAt=t;
      p.powerSpeedRampDuration=POWER_MODE_ACCEL_MS;
      p.powerSpeedRampFrom=0;
    }else if(previousRemaining<POWER_MODE_DECEL_MS){
      // Reverse a slowdown without changing speed on this frame. The new
      // parabola climbs from the exact current strength back to full power.
      p.powerSpeedRampStartedAt=t;
      p.powerSpeedRampDuration=POWER_MODE_ACCEL_MS;
      p.powerSpeedRampFrom=currentStrength;
    }else if(!currentlyRamping){
      // Already at full strength: extend the plateau; do not replay a ramp.
      p.powerSpeedRampStartedAt=t;
      p.powerSpeedRampDuration=0;
      p.powerSpeedRampFrom=1;
    }

    // Refresh, rather than accumulate, the seven-second reserve. The speed
    // envelope above remains continuous even when fruit is eaten repeatedly.
    p.powerModeUntil=t+POWER_MODE_TOTAL_MS;
    p.powerWarningStartedAt=0;
    p.powerFlashBright=true;
    p.lastPowerFlashAt=t;
  }

  function activatePowerMode(p,t=gameTimeNow()){
    initializePowerMode(p,t);
    playSound('snakeSTART@',p);
    ControllerHaptics.powerMode(p);
  }

  function updatePowerMode(p,t){
    if(!isPowerMode(p,t)){
      p.powerModeStartedAt=0;
      p.powerSpeedRampStartedAt=0;
      p.powerSpeedRampDuration=0;
      p.powerSpeedRampFrom=0;
      p.powerModeUntil=0;
      p.powerWarningStartedAt=0;
      p.powerFlashBright=false;
      return;
    }

    const remaining=p.powerModeUntil-t;
    if(remaining>POWER_MODE_DECEL_MS){
      p.powerWarningStartedAt=0;
      p.powerFlashBright=true;
      p.lastPowerFlashAt=t;
      return;
    }

    // The first warning tick and the first deceleration frame now share the
    // same boundary. Later ticks retain the established arcade cadence.
    if(!p.powerWarningStartedAt){
      p.powerWarningStartedAt=t;
      p.powerFlashBright=false;
      p.lastPowerFlashAt=t;
      playSound('Tick',p);
      return;
    }

    if(t-p.lastPowerFlashAt>=320){
      p.powerFlashBright=!p.powerFlashBright;
      p.lastPowerFlashAt=t;
      playSound('Tick',p);
    }
  }

  function isSpawnProtected(p,t=gameTimeNow()){
    return !!p&&p.spawnShieldUntil>t;
  }

  // Spawn protection grants only Power Mode's contact rights. It deliberately
  // does not grant its speed ramp, fruit timer, palette or strategic cleanup.
  function hasCombatPower(p,t=gameTimeNow()){
    return isPowerMode(p,t)||isSpawnProtected(p,t);
  }

  function activateSpawnShield(p,t=gameTimeNow()){
    p.spawnShieldUntil=t+SPAWN_SHIELD_DURATION_GAME_MS;
    // Every spawn begins on the shared bright/open phase. Both animations use
    // the same game-clock anchor and one-snake-step interval from this point.
    p.spawnFlashBright=true;
    p.lastSpawnFlashAt=t;
    p.mouthOpen=true;
    p.lastMouthAt=t;
  }

  function updateSpawnShield(p,t){
    if(!isSpawnProtected(p,t)){
      p.spawnShieldUntil=0;
      p.spawnFlashBright=false;
      return;
    }

    advanceBinaryRhythm(
      p,t,'lastSpawnFlashAt','spawnFlashBright',SPAWN_FLASH_TOGGLE_GAME_MS
    );
  }

  function spawnShieldIsBlocking(p,t=gameTimeNow()){
    return isSpawnProtected(p,t) && !isPowerMode(p,t);
  }

  // Collision direction matters in power mode. The player may eat an
  // inhabitant by actively entering its tile, but an inhabitant moving toward
  // a stationary powered player sees that tile as a dangerous obstacle.
  function playerRepelsInhabitant(x,y,t=gameTimeNow()){
    return somePlayer(p=>!p.dead&&p.lives>0&&
      p.x===x&&p.y===y&&
      (spawnShieldIsBlocking(p,t)||isPowerMode(p,t))
    );
  }

  function bumpPlayerBack(p){
    p.x=p.prevX;
    p.y=p.prevY;
    resetPlayerVisualPosition(p);
  }

  function eatHunter(h,p){
    const index=hunters.indexOf(h);
    if(index<0) return;
    spawnConsumedCreatureBloomAt(h.x,h.y,h.color||'#9b7bff',p);
    hunters.splice(index,1);
    playSound('HeadEat',p);
    ControllerHaptics.majorCreatureBite(p);
    awardPoints(p,200,0.5);
  }

  let keyboardPressSerial=0;
  const KEYBOARD_DIRECTIONS={
    a:{x:-1,y:0},d:{x:1,y:0},w:{x:0,y:-1},s:{x:0,y:1},
    // Classic pre-arrow-key layout for Player 1:
    // I = up, J = left, K = right, M = down.
    i:{x:0,y:-1},j:{x:-1,y:0},k:{x:1,y:0},m:{x:0,y:1},
    ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},
    ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}
  };

  function sameDirection(a,b){
    return !!a&&!!b&&a.x===b.x&&a.y===b.y;
  }

  function keyboardPlayerForKey(key){
    if(gameMode===0) return null;
    if(['a','d','w','s','i','j','k','m'].includes(key)) return player;
    if(key.startsWith('Arrow'))
      return humanPlayerCount===2?player2:player;
    return null;
  }

  const EMPTY_HELD_DIRECTIONS=Object.freeze([]);

  function collectHeldKeyboardDirections(p,physicalOnly=false){
    if(!p?.keyboardHeldKeys) return EMPTY_HELD_DIRECTIONS;
    let ordered=null;
    for(const key in p.keyboardHeldKeys){
      if(physicalOnly&&key.startsWith('GamepadSlot')) continue;
      const value=p.keyboardHeldKeys[key];
      if(!value?.dir) continue;
      if(!ordered) ordered=[];
      ordered.push({key,dir:value.dir,order:value.order});
    }
    if(!ordered) return EMPTY_HELD_DIRECTIONS;
    ordered.sort((a,b)=>b.order-a.order);
    const unique=[];
    for(const item of ordered){
      if((unique[0]&&sameDirection(unique[0].dir,item.dir))||
         (unique[1]&&sameDirection(unique[1].dir,item.dir))) continue;
      unique.push(item);
      if(unique.length===2) break;
    }
    return unique;
  }

  function heldKeyboardDirections(p){
    return collectHeldKeyboardDirections(p,false);
  }

  function pressKeyboardDirection(key){
    const p=keyboardPlayerForKey(key);
    const dir=KEYBOARD_DIRECTIONS[key];
    if(!p||!dir||gameOver||paused||p.dead) return;
    p.pointerNavigation=null;
    p.pointerMomentum=false;
    if(!p.keyboardHeldKeys[key]){
      const previouslyHeld=heldKeyboardDirections(p);
      p.keyboardHeldKeys[key]={dir:{...dir},order:++keyboardPressSerial};
      const previousDifferent=previouslyHeld.find(item=>
        !sameDirection(item.dir,dir)
      );
      // Make the newly pressed second direction the first requested turn.
      p.keyboardAlternateLast=previousDifferent
        ? {...previousDifferent.dir}
        : {...dir};
    }
    p.nextDir={...dir};
    p.waitingForInput=false;
  }

  function releaseKeyboardDirection(key){
    for(const p of allPlayers()){
      if(!p?.keyboardHeldKeys?.[key]) continue;
      delete p.keyboardHeldKeys[key];
      const remaining=heldKeyboardDirections(p);
      if(remaining.length<2)
        p.keyboardAlternateLast=remaining.length
          ? {...remaining[0].dir}
          : null;
    }
  }

  function clearPlayerKeyboardControl(p){
    p.keyboardHeldKeys=Object.create(null);
    p.keyboardAlternateLast=null;
  }

  // Only real keyboard keys participate here. Gamepad directions deliberately
  // share keyboardHeldKeys for movement, but their visual vector is read from
  // the physical D-pad or analogue stick below so the two sources never fight.
  function heldPhysicalKeyboardDirections(p){
    return collectHeldKeyboardDirections(p,true);
  }

  const DIGITAL_TILT_VECTORS=[
    [{x:-1,y:-1},{x:0,y:-1},{x:1,y:-1}],
    [{x:-1,y:0},null,{x:1,y:0}],
    [{x:-1,y:1},{x:0,y:1},{x:1,y:1}]
  ];

  function digitalTiltVector(directions){
    if(!directions?.length) return null;
    const first=directions[0].dir||directions[0];
    const second=directions[1]?.dir||directions[1]||null;
    // Opposite digital buttons on one axis follow the normal movement rule:
    // the newest/first one wins instead of cancelling the visual request.
    if(second&&(
      (first.x!==0&&second.x!==0)||
      (first.y!==0&&second.y!==0)
    )) return DIGITAL_TILT_VECTORS[first.y+1][first.x+1];
    const x=Math.sign(first.x+(second?.x||0));
    const y=Math.sign(first.y+(second?.y||0));
    return x||y?DIGITAL_TILT_VECTORS[y+1][x+1]:null;
  }

  function keyboardTiltVector(p){
    return digitalTiltVector(heldPhysicalKeyboardDirections(p));
  }

  // Xbox / standard Gamepad API support. Gamepad directions deliberately use
  // the keyboard-held-direction state, so D-pad and analogue diagonals inherit
  // the same staircase alternation, collision rules and movement rhythm.
  //
  // Analogue stick, digital D-pad and keyboard now drive the same purely
  // visual character lean for every active human player. It never changes
  // collision, route selection or cell cadence. The full quarter-turn
  // excursion away from the current cardinal direction maps progressively to
  // the 30-degree cap; a 45-degree diagonal therefore produces only half of
  // the maximum lean. A perpendicular digital request reaches the full cap,
  // even while a wall keeps the current sprite facing unchanged. The angle is
  // retained when the sprite direction changes, so a turn inherits the
  // previous pose instead of snapping upright.
  const CONTROLLER_TILT_MAX_DEGREES=30;
  const CONTROLLER_TILT_AXIS_DEAD_ZONE=0.08;
  const CONTROLLER_TILT_STICK_DEAD_ZONE=0.16;
  // At MEDIUM, a complete upright-to-30-degree movement takes 0.50 s.
  // The other settings preserve that timing in gameplay-clock units, so the
  // real-time angular speed follows the same multiplier as the whole level.
  const CONTROLLER_TILT_MEDIUM_SPEED_DEGREES_PER_SECOND=60;

  function controllerTiltSpeedDegreesPerSecond(){
    return CONTROLLER_TILT_MEDIUM_SPEED_DEGREES_PER_SECOND*
      levelSpeedMultiplier();
  }

  function controllerTiltTargetDegrees(direction,axisX,axisY){
    if(!direction) return 0;
    const x=Number.isFinite(axisX)?axisX:0;
    const y=Number.isFinite(axisY)?axisY:0;
    if(Math.hypot(x,y)<CONTROLLER_TILT_STICK_DEAD_ZONE) return 0;

    const horizontal=direction.x!==0;
    const forward=horizontal?x*direction.x:y*direction.y;
    const secondary=horizontal?y:x;
    if(Math.abs(secondary)<CONTROLLER_TILT_AXIS_DEAD_ZONE) return 0;

    // Perpendicular input remains valid even if controller calibration leaves
    // a small component just behind the current facing direction. This is
    // essential at a blocked turn: UP/DOWN + full LEFT/RIGHT, and LEFT/RIGHT +
    // full UP/DOWN, must still reach the signed 30-degree target. The angle is
    // capped below, while a truly opposite cardinal input has no secondary
    // component and therefore naturally returns upright.
    // Use the complete 0..90 degree physical arc of the analogue stick.
    // At 45 degrees the sprite is tilted by 15 degrees; the full 30 degrees
    // is reached only near the end of the quarter-turn excursion. atan2 keeps
    // the response uniform in angle and independent of the stick radius.
    const excursion=Math.atan2(
      Math.abs(secondary),
      Math.max(0,forward)
    );
    const ratio=Math.min(1,excursion/(Math.PI/2));
    const magnitude=CONTROLLER_TILT_MAX_DEGREES*ratio;

    // Canvas positive rotation is clockwise. Horizontal sprites mirror their
    // vertical nuance when facing left. For both vertical sprites, rightward
    // nuance is clockwise and leftward nuance is counter-clockwise, matching
    // the requested controller feel.
    const sign=horizontal
      ? Math.sign(secondary)*Math.sign(direction.x)
      : Math.sign(secondary);
    return sign*magnitude;
  }

  function updateCharacterTilt(p,inputVector,t=performance.now()){
    if(!p) return;
    const axisX=inputVector?(Number(inputVector.x)||0):0;
    const axisY=inputVector?(Number(inputVector.y)||0):0;
    const target=inputVector
      ? controllerTiltTargetDegrees(p.dir,axisX,axisY)
      : 0;
    const previous=Number.isFinite(p.controllerTiltDegrees)
      ? p.controllerTiltDegrees
      : 0;
    const last=Number.isFinite(p.controllerTiltUpdatedAt)
      ? p.controllerTiltUpdatedAt
      : t;
    // Clamp a resumed/background frame: returning to the page must continue
    // the visual motion rather than teleporting directly to the target angle.
    const elapsed=Math.max(0,Math.min(34,t-last));
    // Every target change uses the same bounded angular velocity. Rapid stick
    // changes can move the target as often as they like, but never teleport
    // the rendered pose. The retained current angle also carries unchanged
    // into a newly selected directional sprite after a turn.
    const maximumStep=
      controllerTiltSpeedDegreesPerSecond()*elapsed/1000;
    const delta=target-previous;
    const step=Math.sign(delta)*Math.min(Math.abs(delta),maximumStep);
    const next=previous+step;
    p.controllerTiltDegrees=Math.abs(target-next)<0.0001?target:next;
    p.controllerTiltTargetDegrees=target;
    p.controllerTiltUpdatedAt=t;
  }

  function autonomousCharacterTurnVector(entity,t=gameTimeNow()){
    if(!entity?.dir) return null;
    const sourceTarget=entity.isAI
      ? entity.aiThought?.target
      : entity.pointerNavigation||entity.brainVisualTarget;
    const target=sourceTarget&&Number.isFinite(sourceTarget.x)&&
      Number.isFinite(sourceTarget.y)
      ? sourceTarget
      : null;
    const next=entity.isAI&&entity.nextDir&&
      !sameDirection(entity.nextDir,entity.dir)
      ? entity.nextDir
      : null;
    const targetX=target?.x??null,targetY=target?.y??null;
    const nextX=next?.x??null,nextY=next?.y??null;

    // Route preview is cached for the whole cell. At 120 Hz only the angle is
    // integrated; a path is revisited solely when cell, facing, target, queued
    // turn, maze topology or solid-egg topology changes.
    const cache=entity.autonomousTiltPlanCache;
    if(cache&&cache.x===entity.x&&cache.y===entity.y&&
       cache.dirX===entity.dir.x&&cache.dirY===entity.dir.y&&
       cache.targetX===targetX&&cache.targetY===targetY&&
       cache.nextX===nextX&&cache.nextY===nextY&&
       cache.mazeRevision===mazeRevision&&
       cache.eggObstacleRevision===eggObstacleRevision){
      return cache.vector;
    }

    const plan=next
      ? {direction:next,cellsBeforeTurn:0}
      : MazeBrain.previewTurn(entity,target,3,t);
    const vector=plan
      ? {x:plan.direction.x,y:plan.direction.y}
      : null;
    entity.autonomousTiltPlanCache={
      x:entity.x,y:entity.y,
      dirX:entity.dir.x,dirY:entity.dir.y,
      targetX,targetY,nextX,nextY,
      mazeRevision,eggObstacleRevision,
      vector,
      cellsBeforeTurn:plan?.cellsBeforeTurn??null
    };
    return vector;
  }

  function humanNavigationTiltVector(p,t=gameTimeNow()){
    const directInput=keyboardTiltVector(p);
    if(directInput) return directInput;
    // Mouse/touch navigation already owns an exact shortest-path target.
    // Reuse the cached three-cell preview, including the false-turn gate.
    return p?.pointerNavigation
      ? autonomousCharacterTurnVector(p,t)
      : null;
  }

  function updateAutonomousCharacterTilts(
    realTime=performance.now(),t=gameTimeNow()
  ){
    if(awaitingPlayerSelection||paused) return;
    for(const p of allPlayers()){
      if(!p.isAI||p.dead) continue;
      updateCharacterTilt(p,autonomousCharacterTurnVector(p,t),realTime);
    }
    for(const h of hunters){
      updateCharacterTilt(h,autonomousCharacterTurnVector(h,t),realTime);
    }
  }

  const GamepadControl=(()=>{
    const DEAD_ZONE=0.42;
    const SLOT_COUNT=2;
    const PREFIX='GamepadSlot';
    const DIRECTIONS={
      left:{x:-1,y:0},right:{x:1,y:0},up:{x:0,y:-1},down:{x:0,y:1}
    };
    const MENU_REPEAT_DELAY_MS=360;
    const MENU_REPEAT_INTERVAL_MS=135;
    let menuPadIdentity=null;
    let menuHeld={left:false,right:false,up:false,down:false};
    let menuRepeatDirection=null;
    let menuRepeatAt=0;
    let menuConfirmHeld=false;
    let menuBackHeld=false;

    const buttonPressed=(pad,index)=>{
      const button=pad?.buttons?.[index];
      if(button==null) return false;
      return typeof button==='number'
        ? button>0.5
        : !!button.pressed||Number(button.value)>0.5;
    };

    function playerForSlot(slot){
      if(awaitingPlayerSelection||gameMode===0||humanPlayerCount<1) return null;
      if(slot===0) return player&&!player.isAI?player:null;
      if(slot===1&&humanPlayerCount===2)
        return player2&&!player2.isAI?player2:null;
      return null;
    }

    function readDirections(pad){
      const result=[];
      const used=new Set();
      const add=name=>{
        if(used.has(name)) return;
        used.add(name);
        result.push({name,dir:DIRECTIONS[name]});
      };

      // Standard Gamepad mapping used by Xbox controllers in modern browsers.
      const dpadLeft=buttonPressed(pad,14);
      const dpadRight=buttonPressed(pad,15);
      const dpadUp=buttonPressed(pad,12);
      const dpadDown=buttonPressed(pad,13);
      if(dpadLeft) add('left');
      if(dpadRight) add('right');
      if(dpadUp) add('up');
      if(dpadDown) add('down');

      // The D-pad wins on its axis. Otherwise the left analogue stick can hold
      // one or two directions, enabling the same diagonal climbing as two keys.
      const axisX=Number(pad?.axes?.[0])||0;
      const axisY=Number(pad?.axes?.[1])||0;
      if(!dpadLeft&&!dpadRight&&Math.abs(axisX)>=DEAD_ZONE)
        add(axisX<0?'left':'right');
      if(!dpadUp&&!dpadDown&&Math.abs(axisY)>=DEAD_ZONE)
        add(axisY<0?'up':'down');
      return result;
    }

    function dpadTiltVector(pad){
      const x=(buttonPressed(pad,15)?1:0)-(buttonPressed(pad,14)?1:0);
      const y=(buttonPressed(pad,13)?1:0)-(buttonPressed(pad,12)?1:0);
      return x||y?{x,y}:null;
    }

    function gamepadTiltVector(pad,p){
      // A pressed digital D-pad owns the complete visual vector. Its four
      // cardinals and four diagonals therefore form eight stable positions.
      const digital=dpadTiltVector(pad);
      if(digital) return digital;
      const x=Number(pad?.axes?.[0])||0;
      const y=Number(pad?.axes?.[1])||0;
      if(Math.hypot(x,y)>=CONTROLLER_TILT_STICK_DEAD_ZONE) return {x,y};
      // An idle controller must not suppress keyboard nuance or an active
      // mouse/touch route preview for this player.
      return humanNavigationTiltVector(p);
    }

    function removeSlotDirections(p,slot,desiredNames=null){
      if(!p?.keyboardHeldKeys) return;
      const prefix=`${PREFIX}${slot}:`;
      let removed=false;
      for(const key of Object.keys(p.keyboardHeldKeys)){
        if(!key.startsWith(prefix)) continue;
        const name=key.slice(prefix.length);
        if(desiredNames?.has(name)) continue;
        delete p.keyboardHeldKeys[key];
        removed=true;
      }
      if(removed){
        const remaining=heldKeyboardDirections(p);
        if(remaining.length<2)
          p.keyboardAlternateLast=remaining.length
            ? {...remaining[0].dir}
            : null;
      }
    }

    function syncSlot(slot,p,directions){
      const desiredNames=new Set(directions.map(item=>item.name));
      for(const other of allPlayers()){
        if(other!==p) removeSlotDirections(other,slot);
      }
      if(!p) return;

      removeSlotDirections(p,slot,desiredNames);
      const prefix=`${PREFIX}${slot}:`;
      for(const item of directions){
        const key=prefix+item.name;
        if(p.keyboardHeldKeys[key]) continue;
        const previouslyHeld=heldKeyboardDirections(p);
        p.keyboardHeldKeys[key]={
          dir:{...item.dir},
          order:++keyboardPressSerial
        };
        const previousDifferent=previouslyHeld.find(previous=>
          !sameDirection(previous.dir,item.dir)
        );
        p.keyboardAlternateLast=previousDifferent
          ? {...previousDifferent.dir}
          : {...item.dir};
      }

      if(!directions.length||gameOver||paused||p.dead) return;
      p.pointerNavigation=null;
      p.pointerMomentum=false;
      const held=heldKeyboardDirections(p);
      const requested=held[0]?.dir||directions[directions.length-1].dir;
      p.nextDir={...requested};
      p.waitingForInput=false;
    }

    function resetMenuButtons(){
      menuHeld={left:false,right:false,up:false,down:false};
      menuRepeatDirection=null;
      menuRepeatAt=0;
      menuConfirmHeld=false;
      menuBackHeld=false;
    }

    function handleTitlePad(pad,t=performance.now()){
      if(!pad){
        menuPadIdentity=null;
        resetMenuButtons();
        return;
      }

      const identity=`${pad.index}:${pad.id||''}`;
      if(identity!==menuPadIdentity){
        resetMenuButtons();
        menuPadIdentity=identity;
      }

      const names=new Set(readDirections(pad).map(item=>item.name));
      const current={
        left:names.has('left'),right:names.has('right'),
        up:names.has('up'),down:names.has('down')
      };
      const directionOrder=['up','down','left','right'];
      let moved=false;
      for(const direction of directionOrder){
        if(!current[direction]||menuHeld[direction]) continue;
        SoundManager.unlock();
        MenuMusic.start();
        if(moveTitleFocus(direction,t)) ControllerHaptics.menuMove(pad);
        menuRepeatDirection=direction;
        menuRepeatAt=t+MENU_REPEAT_DELAY_MS;
        moved=true;
        break;
      }
      if(!moved&&menuRepeatDirection&&current[menuRepeatDirection]&&
         t>=menuRepeatAt){
        SoundManager.unlock();
        MenuMusic.start();
        if(moveTitleFocus(menuRepeatDirection,t)) ControllerHaptics.menuMove(pad);
        menuRepeatAt=t+MENU_REPEAT_INTERVAL_MS;
      }
      if(menuRepeatDirection&&!current[menuRepeatDirection]){
        menuRepeatDirection=directionOrder.find(direction=>current[direction])||null;
        menuRepeatAt=menuRepeatDirection?t+MENU_REPEAT_DELAY_MS:0;
      }

      const confirm=buttonPressed(pad,0)||buttonPressed(pad,9);
      if(confirm&&!menuConfirmHeld){
        SoundManager.unlock();
        MenuMusic.start();
        if(activateTitleFocus(t)) ControllerHaptics.menuSelect(pad);
      }
      menuConfirmHeld=confirm;
      const back=buttonPressed(pad,1);
      if(back&&!menuBackHeld){
        SoundManager.unlock();
        MenuMusic.start();
        if(handleTitleBack()) ControllerHaptics.menuSelect(pad);
      }
      menuBackHeld=back;
      menuHeld=current;
    }

    function poll(){
      if(typeof navigator.getGamepads!=='function') return;
      let pads;
      try{ pads=navigator.getGamepads(); }
      catch(_error){ return; }
      const pollTime=performance.now();

      if(awaitingPlayerSelection){
        let titlePad=null;
        for(let index=0;index<pads.length;index++){
          if(!pads[index]||pads[index].connected===false) continue;
          titlePad=pads[index];
          break;
        }
        for(let slot=0;slot<SLOT_COUNT;slot++) syncSlot(slot,null,[]);
        handleTitlePad(titlePad,pollTime);
        return;
      }
      if(menuPadIdentity!==null){
        menuPadIdentity=null;
        resetMenuButtons();
      }

      // Connected controller order is deterministic: first pad is P1, second
      // pad is P2. If a pad disconnects the remaining one safely becomes P1.
      let slot=0;
      const tiltUpdatedPlayers=new Set();
      for(let index=0;index<pads.length&&slot<SLOT_COUNT;index++){
        const pad=pads[index];
        if(!pad||pad.connected===false) continue;
        const target=playerForSlot(slot);
        const active=target&&!gameOver&&!paused&&!target.dead;
        syncSlot(slot,target,active?readDirections(pad):[]);
        // The pause presentation may animate, but the character itself must
        // remain on the exact frozen tilt captured at the pause instant.
        if(target&&!paused){
          updateCharacterTilt(
            target,
            active?gamepadTiltVector(pad,target):null,
            pollTime
          );
          tiltUpdatedPlayers.add(target);
        }
        slot++;
      }
      while(slot<SLOT_COUNT){
        syncSlot(slot,null,[]);
        slot++;
      }
      // Every remaining active human player uses physical keyboard input.
      // Pointer-only, paused, dead and unavailable players return upright;
      // autonomous characters are updated by their route-preview pass.
      for(const candidate of allPlayers()){
        if(candidate.isAI||tiltUpdatedPlayers.has(candidate)) continue;
        if(paused) continue;
        const active=!gameOver&&!paused&&!candidate.dead;
        updateCharacterTilt(
          candidate,
          active?humanNavigationTiltVector(candidate):null,
          pollTime
        );
      }
    }

    return {poll,readDirections};
  })();

  function keyboardNavigationStep(p,t=gameTimeNow()){
    const held=heldKeyboardDirections(p);
    if(!held.length) return null;
    if(held.length===1) return {...held[0].dir};

    const first=held[0].dir,second=held[1].dir;
    // Opposite keys on one axis are not a staircase pair. The newest key wins.
    if((first.x!==0&&second.x!==0)||(first.y!==0&&second.y!==0))
      return {...first};

    const directionIsOpen=d=>{
      const x=p.x+d.x,y=p.y+d.y;
      return !isWall(x,y)&&!occupiedBySolidEgg(x,y,t)&&
        !playerContactBlocksMovement(p,x,y,t);
    };
    const preferred=sameDirection(p.keyboardAlternateLast,first)
      ? second
      : first;
    const alternate=sameDirection(preferred,first)?second:first;

    if(directionIsOpen(preferred)){
      p.keyboardAlternateLast={...preferred};
      return {...preferred};
    }
    if(directionIsOpen(alternate)){
      p.keyboardAlternateLast={...alternate};
      return {...alternate};
    }
    // Keep the next alternating turn queued while momentum carries the player
    // to the first cell at which that direction becomes possible.
    return {...preferred};
  }

  function pointerNavigationStep(p,t=gameTimeNow()){
    if(!p.pointerNavigation) return null;
    const target=p.pointerNavigation;
    if(p.x===target.x&&p.y===target.y) return null;
    return MazeBrain.routeStep(p,target,t);
  }

  function reactionAssistSnakeHeadIsLethal(p,s,d,t=gameTimeNow()){
    if(!s?.body?.length||hasCombatPower(p,t)) return false;
    const head=s.body[0];
    if(head.x!==p.x+d.x||head.y!==p.y+d.y) return false;
    if(s.body.length===1){
      // Match the actual solitary-head contact rules exactly: the mouth/front
      // is dangerous, while either side and the rear are valid head bites.
      return d.x===-s.dir.x&&d.y===-s.dir.y;
    }
    // Longer snakes keep the classic rule: only entering from behind the
    // moving head is a deliberate safe bite without combat power.
    return !(d.x===s.dir.x&&d.y===s.dir.y);
  }

  function reactionAssistForwardHazard(p,d,t=gameTimeNow()){
    if(!d||hasCombatPower(p,t)) return false;
    const x=p.x+d.x,y=p.y+d.y;
    if(hunters.some(h=>h.x===x&&h.y===y)) return true;
    return snakes.some(s=>reactionAssistSnakeHeadIsLethal(p,s,d,t));
  }

  // One central switch deliberately owns the whole safeguard. A future menu
  // option can call setReactionAssistEnabled(false) without changing any
  // keyboard, pointer or controller path.
  const GameplayAssistOptions={
    reactionAssist:true,
    isReactionAssistEnabled(){
      return this.reactionAssist!==false;
    },
    setReactionAssistEnabled(enabled){
      this.reactionAssist=enabled!==false;
      if(!this.reactionAssist){
        for(const p of allPlayers()){
          if(!p?.reactionAssistRicochet) continue;
          p.reactionAssistRicochet=null;
          p.nextDir={...p.dir};
          p.waitingForInput=false;
        }
        for(const threat of [...snakes,...hunters]){
          threat.reactionAssistHold=null;
          threat.reactionAssistReleasedCell=null;
          threat.reactionAssistMoveDir=null;
        }
      }
      return this.reactionAssist;
    }
  };
  window.MazeBitersGameplayOptions=GameplayAssistOptions;

  // A threat due later in the same update cannot steal the cell a human
  // player has just reached, irrespective of keyboard, pointer or gamepad.
  // Hold only that contested cell until the player's next logical impulse;
  // the central clock and every unrelated inhabitant continue unchanged.
  const REACTION_ASSIST_HOLD='reaction-assist-hold';

  function reactionAssistPlayerEligible(p,t=gameTimeNow()){
    return !!(
      GameplayAssistOptions.isReactionAssistEnabled()&&
      p&&!p.isAI&&!p.dead&&p.lives>0&&!hasCombatPower(p,t)
    );
  }

  function reactionAssistThreatHoldIsActive(threat,t=gameTimeNow()){
    const hold=threat?.reactionAssistHold;
    if(!hold) return false;
    const p=hold.player;
    if(reactionAssistPlayerEligible(p,t)&&
       p.x===hold.x&&p.y===hold.y&&
       p.lastMove===hold.playerMoveStamp){
      return true;
    }
    threat.reactionAssistHold=null;
    // Do not grant a second window in the same player impulse if the player
    // was unable to vacate the cell. A later impulse may earn a new window.
    threat.reactionAssistReleasedCell={
      player:p,x:hold.x,y:hold.y,playerMoveStamp:p?.lastMove
    };
    return false;
  }

  function reactionAssistThreatEntryYields(
    threat,victim,fromX,fromY,t=gameTimeNow()
  ){
    if(!reactionAssistPlayerEligible(victim,t)) return false;
    if(Math.abs(fromX-victim.x)+Math.abs(fromY-victim.y)!==1) return false;

    const released=threat.reactionAssistReleasedCell;
    if(released&&released.player===victim&&
       released.x===victim.x&&released.y===victim.y&&
       released.playerMoveStamp===victim.lastMove){
      threat.reactionAssistReleasedCell=null;
      return false;
    }

    threat.reactionAssistReleasedCell=null;
    threat.reactionAssistHold={
      player:victim,
      x:victim.x,
      y:victim.y,
      playerMoveStamp:victim.lastMove
    };
    return true;
  }

  function reactionAssistTunnelCellIsOpen(x,y){
    return !isWall(x,y)&&!occupiedBySolidEgg(x,y);
  }

  function reactionAssistRicochetPath(p,forward){
    // Lock the universal rebound to the exact opposite cardinal direction.
    // Side exits, junctions and bends never influence this arcade trajectory.
    // The player crosses every open cell on this axis and stops only at the
    // last cell before the wall at the far end of the straight tunnel span.
    const path=[];
    const reverse={x:-forward.x,y:-forward.y};
    let x=p.x+reverse.x,y=p.y+reverse.y;
    const maximumCells=Math.max(1,COLS*ROWS);
    while(path.length<maximumCells&&reactionAssistTunnelCellIsOpen(x,y)){
      path.push({x,y});
      x+=reverse.x;
      y+=reverse.y;
    }
    return path;
  }

  function stopReactionAssistRicochet(p){
    p.pointerNavigation=null;
    p.pointerMomentum=false;
    p.reactionAssistRicochet=null;
    p.waitingForInput=true;
  }

  function beginReactionAssistRicochet(p,forward){
    const path=reactionAssistRicochetPath(p,forward);
    p.pointerNavigation=null;
    p.pointerMomentum=false;
    if(!path.length){
      stopReactionAssistRicochet(p);
      return null;
    }
    p.reactionAssistRicochet={path,index:0};
    p.waitingForInput=false;
    return path[0];
  }

  function reactionAssistRicochetStep(p){
    const state=p.reactionAssistRicochet;
    if(!state) return null;
    const target=state.path[state.index];
    if(!target) return null;
    const d={x:target.x-p.x,y:target.y-p.y};
    return Math.abs(d.x)+Math.abs(d.y)===1?d:null;
  }

  function reactionAssistQueuedSafeTurn(p,retreatDirection,t=gameTimeNow()){
    const state=p.reactionAssistRicochet;
    // The rebound must visibly leave the contested cell once. Starting with
    // its next impulse, a held safe direction may take the first valid exit.
    if(!state||state.index<1||!retreatDirection) return null;
    const dangerDirection={x:-retreatDirection.x,y:-retreatDirection.y};
    const candidates=[];

    // Keyboard directions and both digital/analogue gamepad directions share
    // this ordered held-input list. The newest safe request wins.
    if(!p.isAI){
      for(const item of heldKeyboardDirections(p)) candidates.push(item.dir);
    }
    // A fresh mouse/touch destination selected during the rebound receives
    // the same first-safe-junction treatment.
    if(p.pointerNavigation){
      const routeDirection=pointerNavigationStep(p,t);
      if(routeDirection) candidates.push(routeDirection);
    }

    for(const d of candidates){
      if(!d||sameDirection(d,dangerDirection)||
         sameDirection(d,retreatDirection)) continue;
      const x=p.x+d.x,y=p.y+d.y;
      if(isWall(x,y)||occupiedBySolidEgg(x,y,t)||
         playerContactBlocksMovement(p,x,y,t)) continue;
      if(reactionAssistForwardHazard(p,d,t)) continue;
      return {...d};
    }
    return null;
  }

  function commitPlayerVisualStep(
    p,x,y,t=gameTimeNow(),delay=playerMoveDelay(p,t)
  ){
    p.prevX=p.x;
    p.prevY=p.y;
    p.moveFromX=p.x;
    p.moveFromY=p.y;
    p.x=x;
    p.y=y;
    p.moveToX=x;
    p.moveToY=y;
    p.moveStartedAt=t;
    p.moveDuration=delay*PLAYER_SLIDE_RATIO;
  }

  function advancePlayer(p,now=gameTimeNow()) {
    if(gameOverStopsWorld()||paused||p.dead) return;
    // The first rebound cell is compulsory. After it, live input may branch
    // through the first safe perpendicular exit without ever turning back
    // toward the threat that caused the ricochet.
    const retreatDirection=reactionAssistRicochetStep(p);
    const ricochetTurnDirection=p.reactionAssistRicochet
      ? reactionAssistQueuedSafeTurn(p,retreatDirection,now)
      : null;
    const keyboardDirection=
      !p.reactionAssistRicochet&&!p.isAI
        ? keyboardNavigationStep(p,now)
        : null;
    if(p.reactionAssistRicochet){
      if(!retreatDirection){
        stopReactionAssistRicochet(p);
        return;
      }
      if(ricochetTurnDirection){
        // Release only the automatic straight-line lock. Preserve the live
        // input/route and execute this safe turn in the current impulse.
        p.reactionAssistRicochet=null;
        p.nextDir={...ricochetTurnDirection};
      }else{
        p.nextDir={...retreatDirection};
      }
      p.waitingForInput=false;
    }else if(keyboardDirection){
      p.pointerNavigation=null;
      p.pointerMomentum=false;
      p.nextDir={...keyboardDirection};
      p.waitingForInput=false;
    }else if(p.pointerNavigation){
      if(p.x===p.pointerNavigation.x&&p.y===p.pointerNavigation.y){
        // A tap chooses the route, not the brakes. On arrival the current
        // direction keeps its established impulse rhythm and momentum.
        p.pointerNavigation=null;
        p.pointerMomentum=true;
        p.nextDir={...p.dir};
        p.waitingForInput=false;
      }else{
        const routeDirection=pointerNavigationStep(p,now);
        if(routeDirection){
          p.nextDir={...routeDirection};
        }else{
          // If topology changed while travelling, retain the current impulse
          // instead of inheriting a stale route or stopping abruptly.
          p.pointerNavigation=null;
          p.pointerMomentum=true;
          p.nextDir={...p.dir};
        }
        p.waitingForInput=false;
      }
    }else if(p.pointerMomentum){
      p.nextDir={...p.dir};
      p.waitingForInput=false;
    }
    if(p.waitingForInput) return;

    // Resolve immediate danger before committing a turn for every human
    // control method. The rebound uses the incoming straight direction, so
    // it always returns through the section the player actually travelled.
    const tx=p.x+p.nextDir.x,ty=p.y+p.nextDir.y;
    const requestedDirectionIsOpen=
      !isWall(tx,ty)&&!occupiedBySolidEgg(tx,ty)&&
      !playerContactBlocksMovement(p,tx,ty,now);
    const reactionAssistActive=reactionAssistPlayerEligible(p,now);
    const incomingDirection={...p.dir};
    const travelDirection=requestedDirectionIsOpen
      ? {...p.nextDir}
      : {...p.dir};

    if(reactionAssistActive&&!p.reactionAssistRicochet&&
       reactionAssistForwardHazard(p,travelDirection,now)){
      const retreatCell=beginReactionAssistRicochet(p,incomingDirection);
      if(!retreatCell) return;
      const retreatDirection={
        x:retreatCell.x-p.x,
        y:retreatCell.y-p.y
      };
      if(reactionAssistForwardHazard(p,retreatDirection,now)){
        // When both sides are occupied on the same pulse, keep the last safe
        // cell instead of starting a rebound directly into another threat.
        stopReactionAssistRicochet(p);
        return;
      }
      // The reversal is immediate and always clears the contested cell.
      // Thereafter a held safe turn may exit at the first valid junction.
      p.nextDir={...retreatDirection};
      p.dir={...retreatDirection};
    }else if(requestedDirectionIsOpen){
      p.dir={...p.nextDir};
    }

    const nx=p.x+p.dir.x, ny=p.y+p.dir.y;
    const eggBlocked = occupiedBySolidEgg(nx,ny);
    if(!isWall(nx,ny) && !eggBlocked &&
       !playerContactBlocksMovement(p,nx,ny,now)) {
      commitPlayerVisualStep(p,nx,ny,now);
      resolvePlayerContact(p,now);
      if(p.dead) return;
      checkSnakeContact(p);
      checkWorldContact(p);

      if(p.reactionAssistRicochet){
        const state=p.reactionAssistRicochet;
        const reached=state.path[state.index];
        if(reached&&p.x===reached.x&&p.y===reached.y) state.index++;
        if(state.index>=state.path.length){
          // The locked rebound is finite: stop at the far wall of this
          // straight tunnel span, then return control to the active device.
          stopReactionAssistRicochet(p);
        }
      }else if(p.pointerNavigation &&
         p.x===p.pointerNavigation.x &&
         p.y===p.pointerNavigation.y){
        p.pointerNavigation=null;
        p.pointerMomentum=true;
        p.waitingForInput=false;
      }
    }else if(p.reactionAssistRicochet){
      // A newly solid egg or another player may block the cached retreat.
      stopReactionAssistRicochet(p);
    }
  }

  // Fragment geometry is shared by live contact and the isolated training
  // simulation. A rear fragment starts at the former tail tip, even when its
  // surviving route bends; the cut cell never becomes the new head.
  function snakeBiteFragments(s,idx){
    if(!s?.body?.length || idx<0 || idx>=s.body.length) return [];
    const fragments=[];
    if(idx>0){
      fragments.push({body:s.body.slice(0,idx),dir:{...s.dir}});
    }
    const back=s.body.slice(idx+1);
    if(back.length){
      const body=back.length===1
        ? [{x:back[0].x,y:back[0].y}]
        : back.reverse();
      const neck=body[1]||s.body[idx];
      fragments.push({
        body,
        dir:{x:body[0].x-neck.x,y:body[0].y-neck.y}
      });
    }
    return fragments;
  }

  function powerEatSnakeHead(s,p,t=gameTimeNow()){
    const snakeIndex=snakes.indexOf(s);
    if(snakeIndex<0 || !s.body.length) return false;

    const removedHead=s.body[0];
    const remainingFragment=snakeBiteFragments(s,0)[0];
    const remaining=remainingFragment?.body||[];
    spawnSnakeBiteBloom(removedHead,s.color,p,t);

    if(!remaining.length){
      snakes.splice(snakeIndex,1);
      AllyBrain.noteCompleted(p,s);
    }else{
      const inheritedAnger=(s.anger||0)+2;
      const replacement={
        body:remainingFragment.body,
        color:s.color,
        dir:remainingFragment.dir,
        reversing:false,
        reverseSteps:0,
        tailGuide:null,
        blockedDir:null,
        headTrail:[],
        anger:inheritedAnger,
        angerPeak:Math.max(s.angerPeak||0,inheritedAnger),
        angerFloor:Math.max(s.angerFloor||0,inheritedAnger*0.5),
        lastAngerTime:gameTimeNow(),
        lastMemoryTick:s.lastMemoryTick||0,
        temperament:s.temperament,
        threatByPlayer:[...(s.threatByPlayer||[0,0,0])],
        lastMove:0,
        turnBias:Math.random()
      };
      provokeCreature(replacement,p,2,false);
      snakes.splice(snakeIndex,1,replacement);
      AllyBrain.noteCompleted(p,s,replacement);
    }

    playSound('HeadEat',p);
    ControllerHaptics.headBite(p);
    awardPoints(p,125,remaining.length?2:1);
    if(snakes.length===0) nextLevel();
    return true;
  }

  function snakeHeadContactIsSafe(s,move){
    if(!s?.body?.length||!move) return false;
    if(s.body.length===1){
      return move.x!==-s.dir.x||move.y!==-s.dir.y;
    }
    return move.x===s.dir.x&&move.y===s.dir.y;
  }

  function checkSnakeContact(p) {
    for(let si=snakes.length-1;si>=0;si--) {
      const s=snakes[si];
      // This is the hottest human bite path. Avoid allocating a callback for
      // every snake on every player step, especially during continuous eating.
      let idx=-1;
      for(let bi=0;bi<s.body.length;bi++){
        const cell=s.body[bi];
        if(cell.x===p.x&&cell.y===p.y){ idx=bi; break; }
      }
      if(idx<0) continue;

      if(idx===0) { // head
        const playerMove={
          x:p.x-p.prevX,
          y:p.y-p.prevY
        };

        if(hasCombatPower(p)){
          powerEatSnakeHead(s,p);
          return;
        }

        if(s.body.length===1) {
          // A solitary head is dangerous only from the mouth/front.
          // Entering against its facing direction means a frontal collision.
          if(!snakeHeadContactIsSafe(s,playerMove)) {
            loseLife(p);
          } else {
            // Side or rear contact: the player eats the solitary head.
            spawnSnakeBiteBloom(s.body[0],s.color,p);
            snakes.splice(si,1);
            AllyBrain.noteCompleted(p,s);
            playSound('HeadEat',p);
            ControllerHaptics.headBite(p);
            awardPoints(p,125,0.75);
            if(snakes.length===0) nextLevel();
          }
        } else {
          // For a full snake, catching the head from behind is safe;
          // every other head collision remains dangerous.
          if(snakeHeadContactIsSafe(s,playerMove)) {
            spawnSnakeBiteBloom(s.body[0],s.color,p);
            snakes.splice(si,1);
            AllyBrain.noteCompleted(p,s);
            playSound('HeadEat',p);
            ControllerHaptics.headBite(p);
            awardPoints(p,125,0.75);
            if(snakes.length===0) nextLevel();
          } else {
            loseLife(p);
          }
        }
        return;
      }

      if(idx===s.body.length-1) { // tail: eat one segment
        // Allow the snake to survive as a head-only snake.
        if(s.body.length>1) {
          const removedTail=s.body[s.body.length-1];
          s.body.pop();
          spawnSnakeBiteBloom(removedTail,s.color,p);

          // Eating the tail while it is leading a retreat changes the real
          // end of the snake immediately. Re-anchor the invisible guide so it
          // can never continue from the removed tile or jump behind the player.
          if(s.reversing){
            if(s.body.length>1){
              const tail=s.body[s.body.length-1];
              const beforeTail=s.body[s.body.length-2];
              s.tailGuide={
                x:tail.x,
                y:tail.y,
                dir:{x:tail.x-beforeTail.x,y:tail.y-beforeTail.y}
              };
            }else{
              s.reversing=false;
              s.tailGuide=null;
              s.blockedDir=null;
              s.reverseSteps=0;
            }
          }

          s.anger=(s.anger||0)+1;
          s.angerPeak=Math.max(s.angerPeak||0,s.anger);
          s.angerFloor=Math.max(s.angerFloor||0,s.angerPeak*0.5);
          s.lastAngerTime=gameTimeNow();
          provokeCreature(s,p,1);
          AllyBrain.noteTailBite(p,s);
          playRandomSound(BODY_EAT_SOUNDS,p);
          ControllerHaptics.bodyBite(p);
          awardPoints(p,25);
        } else {
          // Player is entering the single remaining head from behind:
          // the player eats it.
          spawnSnakeBiteBloom(s.body[0],s.color,p);
          snakes.splice(si,1);
          AllyBrain.noteCompleted(p,s);
          playSound('HeadEat',p);
          ControllerHaptics.headBite(p);
          awardPoints(p,125,0.75);
        }
      } else { // middle: split into two snakes
        const removedSegment=s.body[idx];
        // Both fragments survive, including either one-cell solitary head.
        const created=snakeBiteFragments(s,idx).map(fragment=>({
          body:fragment.body,
          color:s.color,
          dir:fragment.dir,
          reversing:false,
          reverseSteps:0,
          tailGuide:null,
          blockedDir:null,
          headTrail:[],
          anger:s.anger,
          angerPeak:s.angerPeak ?? s.anger ?? 0,
          angerFloor:s.angerFloor ?? 0,
          lastAngerTime:s.lastAngerTime ?? 0,
          lastMemoryTick:s.lastMemoryTick ?? 0,
          temperament:s.temperament,
          threatByPlayer:[...(s.threatByPlayer||[0,0,0])],
          lastMove:0,
          turnBias:Math.random()
        }));

        created.forEach(part=>{
          part.anger=(s.anger||0)+2;
          part.angerPeak=Math.max(s.angerPeak||0,part.anger);
          part.angerFloor=Math.max(s.angerFloor||0,part.angerPeak*0.5);
          part.lastAngerTime=gameTimeNow();
          part.temperament=s.temperament;
          provokeCreature(part,p,2,false);
        });
        p.aggressionContribution=(p.aggressionContribution||0)+2;
        snakes.splice(si,1,...created);
        spawnSnakeBiteBloom(removedSegment,s.color,p);
        AllyBrain.noteSplit(p,s,created);
        playRandomSound(BODY_EAT_SOUNDS,p);
        ControllerHaptics.bodyBite(p);
        awardPoints(p,10);
      }
      if(snakes.length===0) nextLevel();
      return;
    }
  }

  function scorpionSpawnTileIsClear(x,y){
    return !isWall(x,y) &&
      !somePlayer(p=>!p.dead&&p.x===x&&p.y===y) &&
      !occupiedBySnake(x,y) &&
      !occupiedByHunter(x,y) &&
      !eggs.some(e=>e.x===x&&e.y===y) &&
      !fruits.some(f=>f.x===x&&f.y===y);
  }

  function findScorpionSpawnPair(){
    for(let tries=0;tries<500;tries++){
      const x=1+((Math.random()*(COLS-2))|0);
      const y=1+((Math.random()*(ROWS-2))|0);
      if(!scorpionSpawnTileIsClear(x,y)) continue;

      const validDirections=dirs.filter(d=>
        scorpionSpawnTileIsClear(x-d.x,y-d.y)
      );
      if(!validDirections.length) continue;

      return {
        p:{x,y},
        d:validDirections[(Math.random()*validDirections.length)|0]
      };
    }
    return null;
  }


  function spawnScorpion(t){
    const placement=findScorpionSpawnPair();
    if(!placement){
      // The map is temporarily crowded. Try again shortly rather than placing
      // either half of the two-cell creature inside a wall or another entity.
      scorpionSpawnAt=t+1000;
      return;
    }
    const {p,d}=placement;
    scorpionKilled=false;
    scorpion={
      x:p.x,y:p.y,
      tailX:p.x-d.x, tailY:p.y-d.y,
      dir:d,lastMove:t,
      moveFromX:p.x,moveFromY:p.y,
      moveToX:p.x,moveToY:p.y,
      tailMoveFromX:p.x-d.x,tailMoveFromY:p.y-d.y,
      tailMoveToX:p.x-d.x,tailMoveToY:p.y-d.y,
      moveStartedAt:t,
      moveDuration:snakeMoveDelay()*SCORPION_SLIDE_RATIO,
      snapMovement:true,bornAt:t,animationFrame:0,
      nextFruitAt:t+scaledScorpionDelay(18000,30000),
      // A respawn inherits the pressure accumulated during this level.
      nextEggAt:t+scaledEggDelay(30000,60000,t)
    };
  }

  function killScorpion(t,p){
    if(!scorpion) return;
    const biteAtTail=!!p&&p.x===scorpion.tailX&&p.y===scorpion.tailY;
    spawnConsumedCreatureBloomAt(
      biteAtTail?scorpion.tailX:scorpion.x,
      biteAtTail?scorpion.tailY:scorpion.y,
      '#9b7bff',p,t
    );
    playSound('ScorpioEat',p);
    ControllerHaptics.majorCreatureBite(p);
    scorpion=null;
    scorpionKilled=true;
    scorpionSpawnAt=t+scaledScorpionSpawnDelay(15000,30000,t);

    // Existing offspring become much more aggressive.
    hunters.forEach(h=>{
      h.motherAlive=false;
      h.anger=Math.max(h.anger||0,0.95);
      provokeCreature(h,p,3,false);
    });
    awardPoints(p,150,3);
  }

  function moveScorpion(t){
    if(!scorpion) return;
    const snakeDelay=snakeMoveDelay();
    if(t-scorpion.lastMove<snakeDelay) return;

    const oldX=scorpion.x, oldY=scorpion.y;
    const oldTailX=scorpion.tailX, oldTailY=scorpion.tailY;
    const oldDir={...scorpion.dir};

    const reverse={x:-scorpion.dir.x,y:-scorpion.dir.y};
    const scorpionCanEnter=(x,y)=>
      !isWall(x,y) &&
      !occupiedBySnake(x,y) &&
      !occupiedByHunter(x,y) &&
      !somePlayer(p=>!p.dead&&p.x===x&&p.y===y) &&
      !occupiedBySolidEgg(x,y,t);

    let options=dirs.filter(d=>{
      if(d.x===reverse.x&&d.y===reverse.y) return false;
      return scorpionCanEnter(scorpion.x+d.x,scorpion.y+d.y);
    });
    if(!options.length){
      options=dirs.filter(d=>
        scorpionCanEnter(scorpion.x+d.x,scorpion.y+d.y)
      );
    }
    if(options.length){
      scorpion.dir=MazeBrain.choose(
        scorpion,
        {x:scorpion.x,y:scorpion.y},
        options,
        scorpionBrainProfile(),
        t
      );
      scorpion.x+=scorpion.dir.x;
      scorpion.y+=scorpion.dir.y;
      // Tail always occupies the previous head cell.
      scorpion.tailX=oldX;
      scorpion.tailY=oldY;
    }
    scorpion.snapMovement=
      !options.length ||
      scorpion.dir.x!==oldDir.x || scorpion.dir.y!==oldDir.y;
    scorpion.moveFromX=oldX;
    scorpion.moveFromY=oldY;
    scorpion.moveToX=scorpion.x;
    scorpion.moveToY=scorpion.y;
    scorpion.tailMoveFromX=oldTailX;
    scorpion.tailMoveFromY=oldTailY;
    scorpion.tailMoveToX=scorpion.tailX;
    scorpion.tailMoveToY=scorpion.tailY;
    scorpion.moveStartedAt=t;
    // Preserve the original logical cadence, but complete each straight
    // visual step quickly. Turns still snap as one rigid two-tile creature.
    scorpion.moveDuration=snakeDelay*SCORPION_SLIDE_RATIO;
    scorpion.lastMove=t;

    if(t>=scorpion.nextFruitAt){
      // Queue the fruit in the cell that the tail is leaving. It becomes
      // visible only after the tail has completed 100% of its visual move.
      pendingScorpionDrops.push({
        type:'fruit',x:oldTailX,y:oldTailY,
        kind:(Math.random()*4)|0,
        readyAt:t+(scorpion.snapMovement?0:scorpion.moveDuration)
      });
      scorpion.nextFruitAt=t+scaledScorpionDelay(18000,30000);
    }

    if(t>=scorpion.nextEggAt){
      pendingScorpionDrops.push({
        type:'egg',x:oldTailX,y:oldTailY,
        readyAt:t+(scorpion.snapMovement?0:scorpion.moveDuration)
      });
      scorpion.nextEggAt=t+scaledRepeatEggDelay(30000,50000,t);
    }
  }

  function releasePendingScorpionDrops(t){
    for(let i=pendingScorpionDrops.length-1;i>=0;i--){
      const drop=pendingScorpionDrops[i];
      if(t<drop.readyAt) continue;

      const eggThere=eggs.some(e=>e.x===drop.x&&e.y===drop.y);
      const fruitThere=fruits.some(f=>f.x===drop.x&&f.y===drop.y);

      if(drop.type==='fruit'){
        if(!eggThere && !fruitThere){
          fruits.push({
            x:drop.x,y:drop.y,kind:drop.kind,bornAt:t
          });
        }
      }else if(!eggThere && !fruitThere){
        eggs.push({x:drop.x,y:drop.y,bornAt:t});
        eggObstacleRevision++;
        playSound('EggBorn',drop);
      }
      pendingScorpionDrops.splice(i,1);
    }
  }

  function updateEggs(t){
    for(let i=eggs.length-1;i>=0;i--){
      const e=eggs[i];
      let age=t-e.bornAt;

      // An intact egg may not start cracking underneath another object. Keep
      // its incubation clock frozen until its tile is completely clear.
      if(age>=10000 && isEggCovered(e)){
        e.bornAt=t-9999;
        eggObstacleRevision++;
        age=9999;
      }

      // 10 s intact + 3 cracking layers, one per second.
      const crackStage=
        age>=12000 ? 3 :
        age>=11000 ? 2 :
        age>=10000 ? 1 : 0;
      const previousCrackStage=e.crackSoundStage||0;
      if(crackStage>previousCrackStage){
        // Normally one stage advances per second. If a frame was delayed,
        // preserve every audible crack instead of silently skipping one.
        for(let stage=previousCrackStage;stage<crackStage;stage++){
          playSound('EggKnock',e);
        }
        e.crackSoundStage=crackStage;
      }

      if(age>=13000){
        playSound('ManBorn',e);
        const paletteIndex=nextEnemyHunterPaletteIndex();
        hunters.push({
          x:e.x,y:e.y,
          dir:dirs[(Math.random()*dirs.length)|0],
          color:HUNTER_PALETTE[paletteIndex],
          paletteIndex,
          mouthOpen:false,
          lastMouthAt:t,
          lastMove:t,
          controllerTiltDegrees:0,
          controllerTiltTargetDegrees:0,
          controllerTiltUpdatedAt:performance.now(),
          brainVisualTarget:null,
          autonomousTiltPlanCache:null,
          moveFromX:e.x,moveFromY:e.y,
          moveToX:e.x,moveToY:e.y,
          moveStartedAt:t,
          moveDuration:hunterMoveDelay()*HUNTER_SLIDE_RATIO,
          motherAlive:true,
          anger:0.45,
          threatByPlayer:[0,0,0]
        });
        eggs.splice(i,1);
        eggObstacleRevision++;
      }
    }
  }

  function moveHunters(t){
    const delay=hunterMoveDelay(); // follows the player's level-speed curve
    hunters.forEach(h=>{
      advanceBinaryRhythm(
        h,t,'lastMouthAt','mouthOpen',PLAYER_MOUTH_TOGGLE_GAME_MS
      );
      if(t-h.lastMove<delay) return;
      // A held hunter remains due. As soon as the player receives the next
      // movement impulse, it enters the vacated cell in this same update.
      if(reactionAssistThreatHoldIsActive(h,t)) return;
      const oldX=h.x,oldY=h.y;
      const reverse={x:-h.dir.x,y:-h.dir.y};
      const hunterCanEnter=(x,y)=>
        !isWall(x,y) &&
        !occupiedBySnake(x,y) &&
        !occupiedByScorpion(x,y) &&
        !occupiedByHunter(x,y,h) &&
        !occupiedBySolidEgg(x,y,t) &&
        !playerRepelsInhabitant(x,y,t);

      let options=dirs.filter(d=>{
        if(d.x===reverse.x&&d.y===reverse.y) return false;
        return hunterCanEnter(h.x+d.x,h.y+d.y);
      });

      // If the route ahead is blocked by a snake or the scorpion,
      // immediately turn, including backtracking if that is the only exit.
      if(!options.length){
        options=dirs.filter(d=>
          hunterCanEnter(h.x+d.x,h.y+d.y)
        );
      }
      if(options.length){
        const heldDirection=h.reactionAssistMoveDir;
        h.reactionAssistMoveDir=null;
        const heldDirectionIsOpen=heldDirection&&hunterCanEnter(
          h.x+heldDirection.x,h.y+heldDirection.y
        );
        h.dir=heldDirectionIsOpen
          ? heldDirection
          : MazeBrain.choose(
              h,
              {x:h.x,y:h.y},
              options,
              hunterBrainProfile(h),
              t
            );
        const nx=h.x+h.dir.x,ny=h.y+h.dir.y;
        const enteringPlayer=playerAt(nx,ny);
        if(enteringPlayer&&
           reactionAssistThreatEntryYields(h,enteringPlayer,h.x,h.y,t)){
          h.reactionAssistMoveDir={...h.dir};
          return;
        }
        h.x=nx;
        h.y=ny;
      }
      h.lastMove=t;
      const victim=playerAt(h.x,h.y);
      if(victim){
        if(spawnShieldIsBlocking(victim,t)){
          h.x-=h.dir.x;
          h.y-=h.dir.y;
        }else if(isPowerMode(victim,t)){
          // Safety fallback for simultaneous movement: the hunter initiated
          // the contact, so it returns to its previous tile instead of being
          // awarded to the stationary player.
          h.x=oldX;
          h.y=oldY;
          h.dir={x:-h.dir.x,y:-h.dir.y};
        }
        else loseLife(victim);
      }
      h.moveFromX=oldX;
      h.moveFromY=oldY;
      h.moveToX=h.x;
      h.moveToY=h.y;
      h.moveStartedAt=t;
      // Use the full logical interval so every hunter glides continuously
      // from one cell to the next without changing actual movement speed.
      h.moveDuration=delay*HUNTER_SLIDE_RATIO;
    });
  }

  function checkWorldContact(p){
    for(let i=fruits.length-1;i>=0;i--){
      if(fruits[i].x===p.x&&fruits[i].y===p.y){
        playRandomSound(FRUIT_EAT_SOUNDS,p);
        awardPoints(p,[50,100,150,200][fruits[i].kind] || 50,0.35);
        fruits.splice(i,1);
        activatePowerMode(p);
      }
    }

    if(scorpion&&((scorpion.x===p.x&&scorpion.y===p.y)||(scorpion.tailX===p.x&&scorpion.tailY===p.y))){
      killScorpion(gameTimeNow(),p);
    }

    const touchingHunter=hunters.find(h=>h.x===p.x&&h.y===p.y);
    if(touchingHunter){
      if(hasCombatPower(p)) eatHunter(touchingHunter,p);
      else loseLife(p);
    }
  }

  function initializePlayerDeath(p,t=gameTimeNow()){
    p.pointerNavigation=null;
    p.pointerMomentum=false;
    p.reactionAssistRicochet=null;
    p.powerModeUntil=0;
    p.powerFlashBright=false;
    p.spawnShieldUntil=0;
    p.spawnFlashBright=false;
    p.lives--;
    p.dead=true;
    p.hideDeathSprite=false;
    p.deathX=p.x;
    p.deathY=p.y;
    p.deathStartedAt=t;
    p.respawnAt=t+DEATH_VISUAL_TOTAL_GAME_MS;
  }

  function loseLife(p) {
    // A live GAME OVER overlay is only a presentation layer: collisions and
    // real deaths continue to resolve behind it, including after ESC.
    if(gameOverPending || !p || p.dead) return;
    p.pointerNavigation=null;
    p.pointerMomentum=false;
    p.reactionAssistRicochet=null;
    playSound('HeadDie',p);
    ControllerHaptics.lifeLost(p);
    if(Math.random()<0.32) playSound('Oh_No',p);

    // Losing a life calms the creatures specifically toward that player.
    // Anger caused by the teammate remains intact.
    snakes.forEach(s=>{
      if(!s.threatByPlayer) s.threatByPlayer=[0,0,0];
      const oldPersonal=s.threatByPlayer[p.id-1]||0;
      s.threatByPlayer[p.id-1]=oldPersonal*0.18;
      s.anger=Math.max(0,(s.anger||0)-oldPersonal*0.55);
      s.angerPeak=Math.max(s.anger||0,(s.angerPeak||0)*0.55);
      s.angerFloor=Math.min(s.angerFloor||0,(s.anger||0)*0.6);
      s.lastAngerTime=gameTimeNow();
    });
    hunters.forEach(h=>{
      if(!h.threatByPlayer) h.threatByPlayer=[0,0,0];
      h.threatByPlayer[p.id-1]=(h.threatByPlayer[p.id-1]||0)*0.18;
      h.anger=Math.max(0.15,(h.anger||0)*0.65);
    });

    initializePlayerDeath(p);
    updateHud(p);

    // The final victim's skull remains visible for the complete established
    // death animation. The maze itself deliberately remains alive until that
    // pulse ends; only the later GAME OVER transition freezes the world.
    if(!gameOver&&everyPlayer(candidate=>candidate.lives<=0)){
      gameOverPending=true;
      gameOverPendingUntil=p.respawnAt;
      gameOverPendingPlayerId=p.id;
    }
  }

  function updatePlayerDeath(p,t){
    if(!p.dead || t<p.respawnAt) return;

    if(p.lives<=0){
      p.eliminated=true;
      p.hideDeathSprite=true;
      return;
    }

    if(!playerStartIsClear(p)){
      p.hideDeathSprite=true;
      return;
    }

    const replacement=createPlayerAtStart(p);
    setPlayerReference(replacement);
    activateSpawnShield(replacement,t);
  }

  function levelCompletionFlashBright(t=gameTimeNow()){
    const transition=levelCompletionTransition;
    if(!transition) return false;
    const elapsed=t-transition.startedAt;
    if(elapsed<0||elapsed>=LEVEL_COMPLETE_TOTAL_GAME_MS) return false;
    return Math.floor(elapsed/LEVEL_COMPLETE_PULSE_HALF_GAME_MS)%2===0;
  }

  function levelCompletionPulseAlpha(t=gameTimeNow()){
    const transition=levelCompletionTransition;
    if(!transition) return 1;
    const elapsed=t-transition.startedAt;
    if(elapsed<0||elapsed>=LEVEL_COMPLETE_TOTAL_GAME_MS) return 0;
    const fullPulse=LEVEL_COMPLETE_TOTAL_GAME_MS/
      LEVEL_COMPLETE_MESSAGE_PULSE_COUNT;
    const phase=(elapsed%fullPulse)/fullPulse;
    return Math.sin(Math.PI*phase)**2;
  }

  function beginNextLevelTransition(){
    if(levelCompletionTransition||gameOver||gameOverPending) return;
    const startedAt=gameTimeNow();
    const nextLevelNumber=level+1;
    const endsAt=startedAt+LEVEL_COMPLETE_TOTAL_GAME_MS;
    levelCompletionTransition={startedAt,endsAt,nextLevel:nextLevelNumber};
    GameplayMusic.reserveLevel(nextLevelNumber);
    GameplayMusic.beginGameClockFade(startedAt,endsAt);
    // Congratulations is an independent effect and therefore starts
    // immediately while the current track begins its clock-synchronised fade.
    playSound('Congratulations');
  }

  function advanceToNextLevel(nextLevelNumber) {
    resetGameplayCamera(performance.now());
    level=nextLevelNumber;
    applyMazeForLevel(level);
    allPlayers().forEach(p=>awardPoints(p,500,0,true));
    // Keep a trace of each player's notoriety, but give every teammate room to
    // change the inhabitants' attention on the new level.
    allPlayers().forEach(p=>{
      p.aggressionContribution=(p.aggressionContribution||0)*0.35;
      const replacement=p.lives>0
        ? createPlayerAtStart(p)
        : {...p,dead:true,eliminated:true,hideDeathSprite:true};
      setPlayerReference(replacement);
    });
    spawnSnakesForLevel();
    allPlayers().filter(p=>!p.dead).forEach(p=>activateSpawnShield(p));
    fruits=[];
    eggs=[];
    eggObstacleRevision++;
    pendingScorpionDrops=[];
    hunters=[];
    scorpion=null;
    scorpionKilled=false;
    levelStartedAt=gameTimeNow();
    levelSpotlightStartedAt=performance.now();
    scorpionSpawnAt=levelStartedAt+
      scaledScorpionSpawnDelay(15000,30000,levelStartedAt);
    updateHud();
    GameplayMusic.startLevel(level);
  }

  function nextLevel() {
    beginNextLevelTransition();
  }

  function occupiedByOtherSnake(x,y,self) {
    return snakes.some(other =>
      other !== self && other.body.some(p => p.x===x && p.y===y)
    );
  }

  function occupiedBySelf(x,y,s,ignoreTail=false) {
    const end = ignoreTail ? s.body.length-1 : s.body.length;
    for(let i=0;i<end;i++) {
      if(s.body[i].x===x && s.body[i].y===y) return true;
    }
    return false;
  }

  function canEnter(x,y,s,ignoreTail=true) {
    return !isWall(x,y)
      && !occupiedByOtherSnake(x,y,s)
      && !occupiedBySelf(x,y,s,ignoreTail)
      && !occupiedByScorpion(x,y)
      && !occupiedByHunter(x,y)
      && !occupiedBySolidEgg(x,y)
      && !playerRepelsInhabitant(x,y);
  }

  function forwardOptions(s) {
    const h=s.body[0];
    const reverse={x:-s.dir.x,y:-s.dir.y};
    return dirs.filter(d => {
      if(d.x===reverse.x && d.y===reverse.y) return false;
      return canEnter(h.x+d.x,h.y+d.y,s,true);
    });
  }

  function snakeBrainProfile(s){
    const length=s.body.length;
    const temperament=s.temperament??0.5;
    const anger=s.anger||0;
    const headOnly=length===1;
    const shortBoost=length<=4&&length>1 ? 0.24 : 0;
    return {
      kind:'snake',
      // An untouched snake is mostly peaceful, but never completely blind.
      base:0.08+temperament*0.15,
      injury:Math.min(0.34,anger*0.065),
      // A solitary head lives at a higher general level, while the brain's
      // internal waves still keep it below permanent maximum aggression.
      stateBoost:shortBoost+(headOnly?0.48:0)
    };
  }

  function hunterBrainProfile(h){
    return {
      kind:'hunter',
      base:h.motherAlive ? 0.22 : 0.57,
      injury:Math.min(0.18,(h.anger||0)*0.16),
      stateBoost:0
    };
  }

  function scorpionBrainProfile(){
    // It is naturally evasive. Its understanding of the maze improves on
    // every level, but approaches its limit gradually and never becomes a
    // perfectly predictable machine.
    const learnedIntelligence=
      0.46+0.40*(1-Math.exp(-Math.max(0,level-1)/7));
    return {
      kind:'scorpion',
      behavior:'flee',
      base:learnedIntelligence,
      listenBoost:0.15,
      injury:0,
      stateBoost:0
    };
  }

  function chooseForwardDirection(s,options,origin=s.body[0]) {
    const held=s.reactionAssistMoveDir;
    if(held){
      s.reactionAssistMoveDir=null;
      const stillAvailable=options.find(d=>d.x===held.x&&d.y===held.y);
      if(stillAvailable) return stillAvailable;
    }
    return MazeBrain.choose(s,origin,options,snakeBrainProfile(s));
  }

  function advanceSnakeForward(s,d,t=gameTimeNow()) {
    const h=s.body[0];
    const nx=h.x+d.x,ny=h.y+d.y;
    const enteringPlayer=playerAt(nx,ny);
    if(enteringPlayer&&
       reactionAssistThreatEntryYields(s,enteringPlayer,h.x,h.y,t)){
      s.reactionAssistMoveDir={...d};
      return REACTION_ASSIST_HOLD;
    }
    s.dir=d;
    s.body.unshift({x:nx,y:ny});
    s.body.pop();
    return true;
  }

  function stageSnakeForwardResume(s,d){
    s.reverseHeadJunctionDecision=null;
    // Reverse prediction has already drawn the head one cell behind its
    // logical position. Recover to that real head tile on this tick, then use
    // the stored direction on the following forward tick. This prevents a
    // visually continuous two-cell launch when retreat ends.
    s.reversing=false;
    s.tailGuide=null;
    s.pendingForwardResumeDir={x:d.x,y:d.y};
    s.forwardResumeRecovery=true;
  }

  function beginTailLedRetreat(s,t=gameTimeNow()) {
    s.pendingForwardResumeDir=null;
    s.forwardResumeRecovery=false;
    s.reverseHeadJunctionDecision=null;
    if(s.body.length < 2) {
      s.reversing=false;
      s.tailGuide=null;
      return;
    }
    // Capture before changing the mode: predictive tail rendering is
    // intentionally disabled as soon as reversing becomes true.
    s.retreatStartTailVisual=predictiveSnakeTailPosition(s,t);
    s.reversing=true;
    s.reverseSteps=0;
    s.reverseHeadOldRouteDir=null;
    // Decisions skipped during one retreat stay skipped until the snake has
    // travelled farther backward. The return memory below intentionally
    // survives this reset for one later retreat.
    s.reverseSkippedJunctions=[];
    s.blockedDir={...s.dir};

    const tail=s.body[s.body.length-1];
    const beforeTail=s.body[s.body.length-2];

    // Invisible temporary leader starts at the tail and points outward.
    s.tailGuide={
      x:tail.x,
      y:tail.y,
      dir:{x:tail.x-beforeTail.x,y:tail.y-beforeTail.y}
    };
    // The invisible leader remembers where it has already searched. This is
    // separate from the visible body because old cells gradually become free
    // and would otherwise tempt the tail into the same loop again.
    s.tailGuideHistory=[{x:tail.x,y:tail.y}];
    s.tailGuideFailures=0;
  }

  function tailSearchCellOpen(x,y,s,blockedBody) {
    const key=`${x},${y}`;
    return !isWall(x,y)
      && !blockedBody.has(key)
      && !occupiedByOtherSnake(x,y,s)
      && !occupiedByScorpion(x,y)
      && !occupiedByHunter(x,y)
      && !occupiedBySolidEgg(x,y)
      && !playerRepelsInhabitant(x,y);
  }

  function tailRetreatOptionScore(s,g,option) {
    const nx=g.x+option.x,ny=g.y+option.y;
    const blockedBody=new Set(s.body.map(cell=>`${cell.x},${cell.y}`));
    // Keep the current tail closed during the search. Otherwise two branches
    // appear connected through the cell from which the guide is choosing.
    blockedBody.add(`${g.x},${g.y}`);
    blockedBody.delete(`${nx},${ny}`);

    const recentCounts=new Map();
    for(const cell of s.tailGuideHistory||[]){
      const key=`${cell.x},${cell.y}`;
      recentCounts.set(key,(recentCounts.get(key)||0)+1);
    }

    const startKey=`${nx},${ny}`;
    const visited=new Map([[startKey,0]]);
    const queue=[{x:nx,y:ny,depth:0}];
    let maxDepth=0;
    let junctions=0;
    let recentTouches=recentCounts.get(startKey)||0;
    const SEARCH_LIMIT=192;

    for(let read=0;read<queue.length&&read<SEARCH_LIMIT;read++){
      const cell=queue[read];
      maxDepth=Math.max(maxDepth,cell.depth);
      let exits=0;
      for(const d of dirs){
        const x=cell.x+d.x,y=cell.y+d.y;
        if(!tailSearchCellOpen(x,y,s,blockedBody)) continue;
        exits++;
        const key=`${x},${y}`;
        if(visited.has(key)) continue;
        visited.set(key,cell.depth+1);
        recentTouches+=recentCounts.get(key)||0;
        queue.push({x,y,depth:cell.depth+1});
      }
      if(exits>=3) junctions++;
    }

    const neededRunway=Math.min(28,Math.max(6,s.body.length+2));
    const straight=option.x===g.dir.x&&option.y===g.dir.y;
    const turnExperience=Math.min(16,(s.reverseSteps||0)*0.8);
    const failureExperience=Math.min(18,(s.tailGuideFailures||0)*6);

    return Math.min(visited.size,neededRunway*4)*1.6
      + Math.min(maxDepth,neededRunway)*3
      + (maxDepth>=neededRunway?36:0)
      + Math.min(junctions,5)*5
      - recentTouches*22
      + (straight?3:turnExperience+failureExperience+(s.turnBias||0.5)*2);
  }

  function chooseTailRetreatDirection(s,g,options) {
    let chosen=options[0];
    let best=-Infinity;
    for(const option of options){
      const score=tailRetreatOptionScore(s,g,option);
      if(score>best+1e-9){
        best=score;
        chosen=option;
      }else if(Math.abs(score-best)<=1e-9){
        // Stable per-snake tie breaking avoids frame-to-frame indecision.
        const optionRank=dirs.indexOf(option);
        const chosenRank=dirs.indexOf(chosen);
        const preferHigh=(s.turnBias||0.5)>=0.5;
        if((preferHigh&&optionRank>chosenRank)||
           (!preferHigh&&optionRank<chosenRank)) chosen=option;
      }
    }
    return chosen;
  }

  function retreatOneStep(s) {
    if(!s.tailGuide || s.body.length < 2) return false;

    // The tail may have been shortened by the player since the previous snake
    // tick. The guide must always start on the current physical tail.
    const tail=s.body[s.body.length-1];
    const beforeTail=s.body[s.body.length-2];
    if(s.tailGuide.x!==tail.x || s.tailGuide.y!==tail.y){
      s.tailGuide={
        x:tail.x,
        y:tail.y,
        dir:{x:tail.x-beforeTail.x,y:tail.y-beforeTail.y}
      };
      s.tailGuideHistory=[{x:tail.x,y:tail.y}];
    }

    const g=s.tailGuide;
    const reverse={x:-g.dir.x,y:-g.dir.y};

    let options=dirs.filter(d=>{
      if(d.x===reverse.x && d.y===reverse.y) return false;
      return canEnter(g.x+d.x,g.y+d.y,s,true);
    });

    if(!options.length){
      s.tailGuideFailures=(s.tailGuideFailures||0)+1;
      return false;
    }

    // Look a short distance down every available branch. A straight corridor
    // remains natural, but a short dead end now loses to a side route with
    // enough room to pull the complete snake out. Recent cells are penalized
    // so the invisible guide does not keep rebuilding the same loop.
    // A normal one-way corridor needs no search at all. The look-ahead runs
    // only where the tail has an actual decision to make.
    const chosen=options.length===1
      ? options[0]
      : chooseTailRetreatDirection(s,g,options);

    const nx=g.x+chosen.x, ny=g.y+chosen.y;

    // The invisible tail guide must not pass through the player.
    if(playerAt(nx,ny)){
      // Signal that the player blocked the tail-led retreat.
      return "player-blocked";
    }

    // Remember the exact cell that the visible head is about to vacate.
    // Around a corner this direction differs from the new head sprite, so it
    // cannot be reconstructed reliably from s.dir after the body shifts.
    const previousHead={x:s.body[0].x,y:s.body[0].y};

    // Add a new segment at the tail-led side and remove one at the main head.
    // The visible head sprite remains attached to body[0].
    s.body.push({x:nx,y:ny});
    s.body.shift();

    const movedHead=s.body[0];
    s.reverseHeadOldRouteDir={
      x:previousHead.x-movedHead.x,
      y:previousHead.y-movedHead.y
    };

    // During retreat, orient the visible head from the segment directly
    // behind it. As soon as that nearest segment turns, the head turns too.
    if(s.body.length>1){
      const newHead=s.body[0];
      const nextSegment=s.body[1];
      const bodyDir={
        x:nextSegment.x-newHead.x,
        y:nextSegment.y-newHead.y
      };
      s.dir={x:-bodyDir.x,y:-bodyDir.y};
    }

    s.tailGuide={x:nx,y:ny,dir:{...chosen}};
    if(!s.tailGuideHistory) s.tailGuideHistory=[];
    s.tailGuideHistory.push({x:nx,y:ny});
    if(s.tailGuideHistory.length>64) s.tailGuideHistory.shift();
    s.tailGuideFailures=0;
    s.reverseSteps=(s.reverseSteps||0)+1;
    return true;
  }

  function snakeStep(s,t=gameTimeNow()) {
    if(!s.body.length) return;

    // Head-only snake: it still remembers its old route. At a dead end
    // it crawls backward along that route at half speed until it reaches
    // a junction, preserving the slightly silly original behavior.
    if(s.body.length===1) {
      if(!s.headTrail) s.headTrail=[];

      const h=s.body[0];
      const oldHeadPosition={x:h.x,y:h.y};

      if(s.reversing) {
        const previous=s.headTrail.length
          ? s.headTrail[s.headTrail.length-1]
          : null;

        const retreatDir=previous
          ? {x:previous.x-h.x,y:previous.y-h.y}
          : null;

        const open=dirs.filter(d =>
          canEnter(h.x+d.x,h.y+d.y,s,true)
        );

        const newBranches=open.filter(d=>{
          if(s.blockedDir &&
             d.x===s.blockedDir.x && d.y===s.blockedDir.y) return false;
          if(retreatDir &&
             d.x===retreatDir.x && d.y===retreatDir.y) return false;
          // Do not mistake the tile just vacated by the reversing head for a
          // new escape route. A simple corridor corner must remain reverse
          // travel; only a genuine third passage can trigger a forward choice.
          if(d.x===s.dir.x && d.y===s.dir.y) return false;
          return true;
        });

        const atJunction=open.length>=2 && newBranches.length>0;

        if((s.reverseSteps||0)>=1 && atJunction &&
           Math.random()<REVERSE_HEAD_NEW_BRANCH_CHANCE){
          const chosen=chooseForwardDirection(s,newBranches,h);
          const wasAlreadyFacingChosen=
            s.dir.x===chosen.x && s.dir.y===chosen.y;
          const chosenLeadsIntoPlayer=!!playerAt(
            h.x+chosen.x,h.y+chosen.y
          );
          s.reversing=false;
          s.blockedDir=null;
          s.reverseSteps=0;
          s.dir=chosen;

          if(chosenLeadsIntoPlayer && !wasAlreadyFacingChosen){
            // First turn visibly toward the player and hold this tile. Only a
            // later movement tick may bite, after the mouth was already aimed
            // at the player before that movement began.
          }else{
            const enteringPlayer=playerAt(h.x+chosen.x,h.y+chosen.y);
            if(enteringPlayer&&
               reactionAssistThreatEntryYields(s,enteringPlayer,h.x,h.y,t)){
              s.reactionAssistMoveDir={...chosen};
              return REACTION_ASSIST_HOLD;
            }
            s.headTrail.push({x:h.x,y:h.y});
            if(s.headTrail.length>80) s.headTrail.shift();
            s.body[0]={x:h.x+chosen.x,y:h.y+chosen.y};
          }
        } else if(previous &&
                  !playerAt(previous.x,previous.y) &&
                  canEnter(previous.x,previous.y,s,true)) {
          s.headTrail.pop();

          // The solitary head retreats physically toward the previous tile,
          // but visually keeps looking "forward"—opposite to its backward motion.
          const retreatMove={x:previous.x-h.x,y:previous.y-h.y};
          s.dir={x:-retreatMove.x,y:-retreatMove.y};

          s.body[0]={x:previous.x,y:previous.y};
          s.reverseSteps=(s.reverseSteps||0)+1;
        } else {
          // Backward route is blocked: try forward again. Stop only when
          // neither backward nor forward movement is possible.
          const forward=open.filter(d =>
            !retreatDir || d.x!==retreatDir.x || d.y!==retreatDir.y
          );
          if(forward.length){
            const chosen=chooseForwardDirection(s,forward);
            const wasAlreadyFacingChosen=
              s.dir.x===chosen.x && s.dir.y===chosen.y;
            const chosenLeadsIntoPlayer=!!playerAt(
              h.x+chosen.x,h.y+chosen.y
            );
            s.reversing=false;
            s.blockedDir=null;
            s.reverseSteps=0;
            s.dir=chosen;
            if(chosenLeadsIntoPlayer && !wasAlreadyFacingChosen){
              // The blocked retreat may rotate the head immediately, but it
              // cannot use that future orientation to bite in the same tick.
            }else{
              const enteringPlayer=playerAt(h.x+chosen.x,h.y+chosen.y);
              if(enteringPlayer&&
                 reactionAssistThreatEntryYields(s,enteringPlayer,h.x,h.y,t)){
                s.reactionAssistMoveDir={...chosen};
                return REACTION_ASSIST_HOLD;
              }
              s.headTrail.push({x:h.x,y:h.y});
              if(s.headTrail.length>80) s.headTrail.shift();
              s.body[0]={x:h.x+chosen.x,y:h.y+chosen.y};
            }
          }
        }

      } else {
        const reverse={x:-s.dir.x,y:-s.dir.y};
        const options=dirs.filter(d=>{
          if(d.x===reverse.x && d.y===reverse.y) return false;
          return canEnter(h.x+d.x,h.y+d.y,s,true);
        });

        if(options.length){
          const chosen=chooseForwardDirection(s,options);
          const enteringPlayer=playerAt(h.x+chosen.x,h.y+chosen.y);
          if(enteringPlayer&&
             reactionAssistThreatEntryYields(s,enteringPlayer,h.x,h.y,t)){
            s.reactionAssistMoveDir={...chosen};
            return REACTION_ASSIST_HOLD;
          }
          s.headTrail.push({x:h.x,y:h.y});
          if(s.headTrail.length>80) s.headTrail.shift();
          s.dir=chosen;
          s.body[0]={x:h.x+chosen.x,y:h.y+chosen.y};
        } else if(s.headTrail.length){
          s.reversing=true;
          s.blockedDir={...s.dir};
          s.reverseSteps=0;
        }
      }

      const victim=playerAt(s.body[0].x,s.body[0].y);
      if(victim) {
        const actuallyMoved =
          s.body[0].x!==oldHeadPosition.x ||
          s.body[0].y!==oldHeadPosition.y;

        if(hasCombatPower(victim)){
          powerEatSnakeHead(s,victim);
        } else if(s.reversing && actuallyMoved) {
          // Rear of the head touched the player:
          // stop reversing and immediately resume forward behaviour.
          s.reversing=false;
          s.reverseLeader=null;
          s.lastMove=0;
          // Keep the player alive and in place.
        } else {
          loseLife(victim);
        }
      }
      return;
    }

    if(!s.reversing && s.pendingForwardResumeDir){
      // The previous tick finished the visual recovery to the real head tile.
      // Now start one ordinary one-cell forward slide along the chosen route.
      const pending=s.pendingForwardResumeDir;
      s.pendingForwardResumeDir=null;
      const h=s.body[0];
      const neck=s.body[1];
      const pendingIsOpen=
        (!neck || h.x+pending.x!==neck.x || h.y+pending.y!==neck.y) &&
        canEnter(h.x+pending.x,h.y+pending.y,s,true);
      if(pendingIsOpen){
        const moved=advanceSnakeForward(s,pending,t);
        if(moved===REACTION_ASSIST_HOLD) return moved;
      }else{
        // A moving inhabitant may have occupied the stored exit during the
        // recovery frame. Re-evaluate safely instead of forcing an overlap.
        const options=forwardOptions(s);
        if(options.length){
          const moved=advanceSnakeForward(
            s,chooseForwardDirection(s,options),t
          );
          if(moved===REACTION_ASSIST_HOLD) return moved;
        }else
          beginTailLedRetreat(s,t);
      }
    } else if(s.reversing) {
      // The route choice belongs to simulation state, not to rendering.
      // It was prepared for this exact body position one interval earlier,
      // so passing a branch cannot pause or re-phase the normal motor cycle.
      const junctionState=reverseHeadJunctionState(s);
      const h=junctionState.head;
      const openFromHead=junctionState.openFromHead;
      const oldRouteDir=junctionState.oldRouteDir;
      const newBranches=junctionState.newBranches;
      const atNewJunction=junctionState.atNewJunction;
      const junctionKey=junctionState.junctionKey;
      const returningFromFailedBranch=
        junctionState.returningFromFailedBranch;
      let takeNewBranch=false;

      if(junctionState.eligible){
        const prepared=s.reverseHeadJunctionDecision;
        takeNewBranch=prepared &&
          prepared.key===junctionState.decisionKey
          ? prepared.takeNewBranch
          : Math.random()<REVERSE_HEAD_NEW_BRANCH_CHANCE;
      }
      // Consume the decision exactly once. The next state is prepared only
      // after this logical move has completed.
      s.reverseHeadJunctionDecision=null;

      if((s.reverseSteps||0)>=1 && atNewJunction && !takeNewBranch){
        if(!s.reverseSkippedJunctions) s.reverseSkippedJunctions=[];
        if(!s.reverseSkippedJunctions.includes(junctionKey)){
          s.reverseSkippedJunctions.push(junctionKey);
          if(s.reverseSkippedJunctions.length>16)
            s.reverseSkippedJunctions.shift();
        }
        // A branch that was selected on the previous forward attempt but led
        // to another dead end is ignored once on return. The head therefore
        // continues farther backward instead of rebuilding the oldest route.
        if(returningFromFailedBranch) s.reverseReturnAvoidJunction=null;
      }

      if(takeNewBranch){
        const newDir=chooseForwardDirection(s,newBranches,h);
        stageSnakeForwardResume(s,newDir);
        // If this chosen passage soon dead-ends, one return to this exact
        // junction must pass through and search farther backward.
        s.reverseReturnAvoidJunction=junctionKey;
        s.reverseHeadOldRouteDir=null;
        s.blockedDir=null;
      } else {
        const moved=retreatOneStep(s);

        if(moved==="player-blocked" || !moved){
          // The tail side is blocked by a player, wall, another snake, or
          // another solid inhabitant. Prefer a genuinely new head passage,
          // but keep a small amount of characterful uncertainty. Repeated
          // failure at this exact junction makes the decision progressively
          // more decisive: 75%, 90%, then 100% in favor of the new branch.
          if(s.blockedRetreatJunctionKey===junctionKey){
            s.blockedRetreatJunctionAttempts=
              (s.blockedRetreatJunctionAttempts||0)+1;
          }else{
            s.blockedRetreatJunctionKey=junctionKey;
            s.blockedRetreatJunctionAttempts=1;
          }

          const oldRouteBranches=openFromHead.filter(d=>
            d.x===oldRouteDir.x && d.y===oldRouteDir.y
          );
          const blockedAttempts=s.blockedRetreatJunctionAttempts;
          const newBranchChance=blockedAttempts>=3
            ? 1
            : (blockedAttempts===2
              ? 0.90
              : REVERSE_HEAD_NEW_BRANCH_CHANCE);
          const chooseNewBranch=newBranches.length>0 &&
            (!oldRouteBranches.length || Math.random()<newBranchChance);
          const branchPool=chooseNewBranch
            ? newBranches
            : (oldRouteBranches.length ? oldRouteBranches : openFromHead);

          if(branchPool.length){
            const chosen=chooseForwardDirection(s,branchPool,h);
            stageSnakeForwardResume(s,chosen);

            // Remember a newly selected junction. If it immediately leads to
            // another dead end, the next retreat passes this junction once
            // instead of rebuilding the same short loop.
            if(chooseNewBranch)
              s.reverseReturnAvoidJunction=junctionKey;

            s.reverseHeadOldRouteDir=null;
            s.blockedDir=null;
          }
          // Only if the tail-led retreat and every head exit are blocked does
          // the snake remain in place for this logical tick.
        }
      }

    } else {
      const options=forwardOptions(s);

      if(options.length) {
        const moved=advanceSnakeForward(
          s,chooseForwardDirection(s,options),t
        );
        if(moved===REACTION_ASSIST_HOLD) return moved;
      } else {
        beginTailLedRetreat(s,t);
      }
    }

    const victim=playerAt(s.body[0].x,s.body[0].y);
    if(victim) {
      if(hasCombatPower(victim)){
        powerEatSnakeHead(s,victim);
      }else{
        // Snake moved into the player: the snake eats the player.
        loseLife(victim);
      }
    }
  }

  function updateSnakeMemory(s,t){
    if(!s.lastAngerTime) return;

    // Start calming down after a random-feeling 20-30 second grace period.
    const calmDelay = 20000 + ((s.temperament||0.5) * 10000);
    if(t - s.lastAngerTime < calmDelay) return;

    const elapsed=t-(s.lastMemoryTick||t);
    const floor = Math.max(0, s.angerFloor || 0);
    if(s.anger > floor){
      // Slow continuous decay; about 1 anger point per 18 seconds.
      s.anger = Math.max(floor, s.anger - 0.000055 * elapsed);
    }
    if(s.threatByPlayer){
      // Personal grudges also fade, independently for every player. Mutating
      // the tiny fixed array avoids replacing it for every snake every frame.
      for(let i=0;i<s.threatByPlayer.length;i++){
        s.threatByPlayer[i]=Math.max(
          0,(s.threatByPlayer[i]||0)-0.000035*elapsed
        );
      }
    }
    s.lastMemoryTick=t;
  }

  function beginImmediateGameOver(
    realTime=performance.now(),muteGameplayEffects=false
  ){
    if(awaitingPlayerSelection||gameOver) return false;

    // GAME OVER is a presentation layer over the still-live simulation. ESC
    // bypasses the death-skull wait and mutes only the ordinary gameplay SFX.
    const roster=allPlayers();
    for(let i=0;i<roster.length;i++){
      const p=roster[i];
      if(p.lives<=0){
        p.eliminated=true;
        p.hideDeathSprite=true;
      }
    }
    gameOverPending=false;
    gameOverPendingUntil=0;
    gameOverPendingPlayerId=0;
    levelCompletionTransition=null;
    paused=false; pauseStartedAt=0;
    gameOverKeepsWorldAlive=true;
    gameOverVisualsSettled=false;
    gameOver=true;
    gameOverStartedAt=realTime;
    completedRunHighScoreCandidate=captureRunHighScoreCandidate();
    gameplaySfxMuted=!!muteGameplayEffects;
    if(gameplaySfxMuted) SoundManager.silenceEffects();
    playSound('Game_Over');
    GameplayMusic.stop(GAME_OVER_PULSE_DURATION_MS/1000);
    return true;
  }

  function update(t,realTime=performance.now()) {
    if(gameOver){
      if(gameOverStartedAt&&
         gameOverVisualElapsed(realTime)>=GAME_OVER_TOTAL_MS){
        completeGameOverPresentation();
      }
      if(!gameOverKeepsWorldAlive) return;
    }
    if(gameOverPending && t>=gameOverPendingUntil){
      // The skull has completed its own animation; GAME OVER now appears over
      // the same continuously running simulation.
      beginImmediateGameOver(realTime,false);
      return;
    }
    if(levelCompletionTransition){
      GameplayMusic.updateGameClock(t);
      if(t>=levelCompletionTransition.endsAt){
        const nextLevelNumber=levelCompletionTransition.nextLevel;
        levelCompletionTransition=null;
        advanceToNextLevel(nextLevelNumber);
      }
      return;
    }
    if(paused||awaitingPlayerSelection) return;

    const roster=allPlayers();
    for(let i=0;i<roster.length;i++) updatePlayerDeath(roster[i],t);
    for(let i=0;i<roster.length;i++){
      const p=roster[i];
      updatePowerMode(p,t);
      updateSpawnShield(p,t);

      if(!p.dead){
        advanceBinaryRhythm(
          p,t,'lastMouthAt','mouthOpen',PLAYER_MOUTH_TOGGLE_GAME_MS
        );
      }

      const delay=playerMoveDelay(p,t);
      if(!p.dead && t-p.lastMove>delay){
        if(p.isAI) AllyBrain.plan(p,t);
        advancePlayer(p,t);
        p.lastMove=t;
      }
    }
    MazeBrain.update(t);
    const snakeDelay=snakeMoveDelay();
    const snakeUpdateCount=snakes.length;
    for(let snakeIndex=0;snakeIndex<snakeUpdateCount;snakeIndex++){
      const s=snakes[snakeIndex];
      if(!s) continue;
      const delay = s.reversing ? snakeDelay*2 : snakeDelay;
      if(t-s.lastMove>delay) {
        // Preserve the exact snake phase while its contested cell is reserved.
        // It stays due and resumes on the first update after the player pulse.
        if(reactionAssistThreatHoldIsActive(s,t)) continue;
        // Threat memory only influences logical snake decisions. Integrating
        // it once at the next decision produces the same elapsed-time result
        // without scanning the memory list on every 120 Hz render callback.
        updateSnakeMemory(s,t);
        const wasReversing=s.reversing;
        // Capture before any snake changes the logical mode or body. For a
        // latched reverse plan this is the exact sub-cell visible to the user.
        const oldHeadVisualPosition=wasReversing&&s.body.length>1
          ? snakeSegmentVisualPosition(s,0,t)
          : null;
        const oldBody=s.body.map(p=>({x:p.x,y:p.y}));
        const oldHeadTravelDirection=s.reversing
          ? {x:-s.dir.x,y:-s.dir.y}
          : {x:s.dir.x,y:s.dir.y};
        const snakeStepResult=snakeStep(s,t);
        if(snakeStepResult===REACTION_ASSIST_HOLD) continue;
        if(snakes.includes(s)){
          recordSnakeVisualStep(
            s,oldBody,t,delay,oldHeadTravelDirection,
            wasReversing,oldHeadVisualPosition
          );
        }
        s.lastMove=t;
        if(snakes.includes(s)) prepareReverseHeadJunctionDecision(s);
      }
    }

    if(!scorpion && t>=scorpionSpawnAt) spawnScorpion(t);
    moveScorpion(t);
    releasePendingScorpionDrops(t);
    updateEggs(t);
    moveHunters(t);
  }

  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
  function drawSnakeCorner(px,py,prev,next,color){
    // The two perpendicular sides touch the incoming and outgoing body tiles.
    // The diagonal always faces the outside of the bend.
    ctx.fillStyle=color;
    ctx.strokeStyle='#06521f';
    ctx.lineWidth=1;
    ctx.beginPath();

    const left  = prev.x<0 || next.x<0;
    const right = prev.x>0 || next.x>0;
    const up    = prev.y<0 || next.y<0;
    const down  = prev.y>0 || next.y>0;

    if(left && up){
      // Inner corner: top-left. Diagonal faces bottom-right.
      ctx.moveTo(px+2,py+2);
      ctx.lineTo(px+18,py+2);
      ctx.lineTo(px+2,py+18);
    }else if(right && up){
      // Inner corner: top-right. Diagonal faces bottom-left.
      ctx.moveTo(px+18,py+2);
      ctx.lineTo(px+18,py+18);
      ctx.lineTo(px+2,py+2);
    }else if(left && down){
      // Inner corner: bottom-left. Diagonal faces top-right.
      ctx.moveTo(px+2,py+18);
      ctx.lineTo(px+2,py+2);
      ctx.lineTo(px+18,py+18);
    }else if(right && down){
      // Inner corner: bottom-right. Diagonal faces top-left.
      ctx.moveTo(px+18,py+18);
      ctx.lineTo(px+2,py+18);
      ctx.lineTo(px+18,py+2);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

function drawSnakeTail(px,py,dir,color){
    // pure triangular tail (no square body)
    ctx.fillStyle=color;
    ctx.strokeStyle='#06521f';
    ctx.lineWidth=1;

    ctx.beginPath();
    if(dir.x===1){ // tail points right
      ctx.moveTo(px+2,py+2);
      ctx.lineTo(px+20,py+10);
      ctx.lineTo(px+2,py+18);
    }else if(dir.x===-1){
      ctx.moveTo(px+18,py+2);
      ctx.lineTo(px+0,py+10);
      ctx.lineTo(px+18,py+18);
    }else if(dir.y===1){
      ctx.moveTo(px+2,py+2);
      ctx.lineTo(px+10,py+20);
      ctx.lineTo(px+18,py+2);
    }else{
      ctx.moveTo(px+2,py+18);
      ctx.lineTo(px+10,py+0);
      ctx.lineTo(px+18,py+18);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

function drawSnakeHead(px,py,dir) {
    // Main head block
    rect(px+1,py+1,18,18,'#f44');

    ctx.fillStyle='#fff';
    ctx.strokeStyle='#000';
    ctx.lineWidth=1;

    if(dir.x===1) { // right
      rect(px+7,py+5,3,3,'#fff');
      rect(px+7,py+12,3,3,'#fff');
      rect(px+9,py+6,1,1,'#000');
      rect(px+9,py+13,1,1,'#000');

      ctx.beginPath();
      ctx.moveTo(px+18,py+6);
      ctx.lineTo(px+18,py+14);
      ctx.lineTo(px+12,py+10);
      ctx.closePath();
      ctx.fill();

    } else if(dir.x===-1) { // left
      rect(px+10,py+5,3,3,'#fff');
      rect(px+10,py+12,3,3,'#fff');
      rect(px+10,py+6,1,1,'#000');
      rect(px+10,py+13,1,1,'#000');

      ctx.beginPath();
      ctx.moveTo(px+2,py+6);
      ctx.lineTo(px+2,py+14);
      ctx.lineTo(px+8,py+10);
      ctx.closePath();
      ctx.fill();

    } else if(dir.y===-1) { // up
      rect(px+5,py+10,3,3,'#fff');
      rect(px+12,py+10,3,3,'#fff');
      rect(px+6,py+10,1,1,'#000');
      rect(px+13,py+10,1,1,'#000');

      ctx.beginPath();
      ctx.moveTo(px+6,py+2);
      ctx.lineTo(px+14,py+2);
      ctx.lineTo(px+10,py+8);
      ctx.closePath();
      ctx.fill();

    } else { // down
      rect(px+5,py+7,3,3,'#fff');
      rect(px+12,py+7,3,3,'#fff');
      rect(px+6,py+9,1,1,'#000');
      rect(px+13,py+9,1,1,'#000');

      ctx.beginPath();
      ctx.moveTo(px+6,py+18);
      ctx.lineTo(px+14,py+18);
      ctx.lineTo(px+10,py+12);
      ctx.closePath();
      ctx.fill();
    }
  }



  function drawScorpion(now=gameTimeNow()){
    if(!scorpion) return;
    drawScorpionEntity(scorpion,now);
  }

  function drawScorpionEntity(scorpion,now,{forceVisible=false}={}){
    // Straight movement is interpolated. A turn is deliberately snapped so
    // head, tail, position and orientation all change on the same exact tick.
    const headPosition=scorpion.renderHeadPosition||
      (scorpion.renderHeadPosition={x:0,y:0});
    const tailPosition=scorpion.renderTailPosition||
      (scorpion.renderTailPosition={x:0,y:0});
    if(scorpion.snapMovement){
      headPosition.x=scorpion.x;
      headPosition.y=scorpion.y;
      tailPosition.x=scorpion.tailX;
      tailPosition.y=scorpion.tailY;
    }else{
      smoothEntityPosition(scorpion,now,'',headPosition);
      smoothEntityPosition(scorpion,now,'tail',tailPosition);
    }
    if(!forceVisible&&!gameplaySpriteVisible(headPosition.x,headPosition.y)&&
       !gameplaySpriteVisible(tailPosition.x,tailPosition.y)) return;

    const previousAlpha=ctx.globalAlpha;
    ctx.globalAlpha=previousAlpha*entitySpawnFadeAlpha(scorpion.bornAt,now);

    const number=directionNumber(scorpion.dir);
    // Show both poses inside every logical cell: the original pose in the
    // first half and the minimal-pincer step in the second half. Movement,
    // pathfinding and the central game clock remain unchanged.
    const cellDuration=Math.max(1,snakeMoveDelay());
    const cellElapsed=Math.max(0,now-(scorpion.lastMove??now));
    const cellPhase=(cellElapsed%cellDuration)/cellDuration;
    const animationFrame=cellPhase<0.5?0:1;
    const {head,tail}=scorpionSpritePair(number,animationFrame);
    // Both scorpion cells are native atlas sprites, drawn through the same
    // allocation-free region blitter used by the other moving entities.
    const tailDrawn=drawSpriteImage(
      ctx,tail,tailPosition.x*TILE,tailPosition.y*TILE,TILE,TILE
    );
    const headDrawn=drawSpriteImage(
      ctx,head,headPosition.x*TILE,headPosition.y*TILE,TILE,TILE
    );

    if(!tailDrawn){
      rect(tailPosition.x*TILE+5,tailPosition.y*TILE+5,10,10,'#8f36c9');
    }
    if(!headDrawn){
      rect(headPosition.x*TILE+4,headPosition.y*TILE+4,12,12,'#c46cff');
    }
    ctx.globalAlpha=previousAlpha;
  }

  function drawFruit(f,now=gameTimeNow()){
    const previousAlpha=ctx.globalAlpha;
    ctx.globalAlpha=previousAlpha*
      entitySpawnFadeAlpha(f.bornAt,now)*fruitPulseAlpha(f,now);
    const index=(f.kind ?? 0)+1;
    const sprite=ModernFruitSprites[`Fruit${index}`]
      || OriginalSprites[`Fruit${index}`]
      || OriginalSprites.Fruit1;
    if(!drawOriginalSprite(sprite,f.x,f.y)){
      rect(f.x*TILE+6,f.y*TILE+7,9,9,'#ffd43b');
    }
    ctx.globalAlpha=previousAlpha;
  }

  function drawEgg(e,t){
    const previousAlpha=ctx.globalAlpha;
    ctx.globalAlpha=previousAlpha*entitySpawnFadeAlpha(e.bornAt,t);
    const age=t-e.bornAt;
    let frame=1;
    if(age>=10000) frame=2;
    if(age>=11000) frame=3;
    if(age>=12000) frame=4;

    const sprite=ModernEggSprites[`Egg${frame}`]
      || OriginalSprites[`Egg${frame}`]
      || OriginalSprites.Egg1;
    if(!drawOriginalSprite(sprite,e.x,e.y)){
      rect(e.x*TILE+6,e.y*TILE+4,8,13,'#efe6c8');
    }
    ctx.globalAlpha=previousAlpha;
  }

  function drawHunter(h,now=gameTimeNow(),{forceVisible=false}={}){
    const renderVisual=h.renderVisualPosition||
      (h.renderVisualPosition={x:0,y:0});
    const visual=smoothEntityPosition(h,now,'',renderVisual);
    if(!forceVisible&&!gameplaySpriteVisible(visual.x,visual.y)) return;
    const sprite=originalCharacterSprite('EnemyHead',h.dir,h.mouthOpen);

    // Palette identity and rage brightness are precompiled, so every
    // mobile browser receives exactly the same pixels without Canvas filters.
    const paletteIndex=h.paletteIndex??Math.max(0,HUNTER_PALETTE.indexOf(h.color));
    const mood=h.motherAlive?'normal':'rage';
    const cached=CharacterSpriteGroups.hunter?.[paletteIndex]?.[mood]?.[
      sprite.__hvSpriteName
    ]||sprite;
    const tiltDegrees=Number.isFinite(h.controllerTiltDegrees)
      ? h.controllerTiltDegrees
      : 0;
    const rotated=Math.abs(tiltDegrees)>0.001;
    if(rotated){
      const centerX=(visual.x+0.5)*TILE;
      const centerY=(visual.y+0.5)*TILE;
      ctx.save();
      ctx.translate(centerX,centerY);
      ctx.rotate(tiltDegrees*Math.PI/180);
      ctx.translate(-centerX,-centerY);
    }
    const drawn=drawOriginalSprite(cached,visual.x,visual.y);
    if(!drawn){
      // Safe fallback while an atlas image is still loading.
      rect(visual.x*TILE+5,visual.y*TILE+5,10,10,h.color||'#ff9b55');
    }
    if(rotated) ctx.restore();
  }



  function mazeBorderMask(x,y){
    const hasWall=(wallX,wallY)=>
      wallX>=0 && wallY>=0 && wallX<COLS && wallY<ROWS &&
      maze[wallY][wallX]==='#';
    const up=hasWall(x,y-1);
    const right=hasWall(x+1,y);
    const down=hasWall(x,y+1);
    const left=hasWall(x-1,y);
    return (up?1:0)|(right?2:0)|(down?4:0)|(left?8:0);
  }

  function mazeWallRunLength(x,y,dx,dy){
    let length=1;
    for(const sign of [-1,1]){
      let px=x+dx*sign;
      let py=y+dy*sign;
      while(px>=0&&py>=0&&px<COLS&&py<ROWS&&maze[py][px]==='#'){
        length++;
        px+=dx*sign;
        py+=dy*sign;
      }
    }
    return length;
  }

  function mazeWallFadeAxis(x,y,mask=mazeBorderMask(x,y)){
    // Straight lines and end caps inherit their unambiguous orientation.
    if(mask===10||mask===2||mask===8) return 'horizontal';
    if(mask===5||mask===1||mask===4) return 'vertical';
    if(mask===0) return 'radial';

    // Corners, junctions and compact blocks follow the longer local structure.
    // Equal/square structures intentionally shade left-to-right, as in the
    // original design request.
    const horizontal=mazeWallRunLength(x,y,1,0);
    const vertical=mazeWallRunLength(x,y,0,1);
    return vertical>horizontal?'vertical':'horizontal';
  }

  function mazeRenderKey(theme,mask,axis){
    return `${theme.name}|${mask}|${axis}`;
  }

  function prepareMazeRenderCache(){
    for(const [key,region] of Object.entries(RenderAtlasData.maze)){
      MazeRenderCache.set(key,region);
    }
    for(const [key,region] of Object.entries(RenderAtlasData.conceptMaze||{})){
      ConceptMazeRenderCache.set(key,region);
    }
  }

  function drawMazeWallTo(targetContext,x,y){
    const mask=mazeBorderMask(x,y);
    const axis=mazeWallFadeAxis(x,y,mask);
    const cached=ConceptMazeRenderCache.get(`${mazeColorTheme.name}|${mask}`) ||
      MazeRenderCache.get(mazeRenderKey(mazeColorTheme,mask,axis));
    if(cached){
      drawAtlasRegion(targetContext,cached,x*TILE,y*TILE,TILE,TILE);
    }else{
      targetContext.fillStyle=mazeColorTheme.fallbackOuter;
      targetContext.fillRect(x*TILE,y*TILE,TILE,TILE);
      targetContext.fillStyle=mazeColorTheme.fallbackInner;
      targetContext.fillRect(x*TILE+3,y*TILE+3,TILE-6,TILE-6);
    }
    // Corners already had a 180° calibration; add 90° clockwise. End pieces
    // receive a direct 180° calibration.

    // Safe fallback while the atlas bitmap is still loading.
  }

  const MAZE_MASK_STEPS=[
    {dx:0,dy:-1,bit:1,opposite:4},
    {dx:1,dy:0,bit:2,opposite:8},
    {dx:0,dy:1,bit:4,opposite:1},
    {dx:-1,dy:0,bit:8,opposite:2}
  ];

  function addMazeRenderConnection(maskMap,from,to){
    const dx=to.x-from.x,dy=to.y-from.y;
    const step=MAZE_MASK_STEPS.find(s=>s.dx===dx&&s.dy===dy);
    if(!step) return;
    if(maskMap[from.y][from.x]===null) maskMap[from.y][from.x]=0;
    if(maskMap[to.y][to.x]===null) maskMap[to.y][to.x]=0;
    maskMap[from.y][from.x]|=step.bit;
    maskMap[to.y][to.x]|=step.opposite;
  }

  function mergedMazeSolidBlockMap(){
    return Array.from({length:Math.max(0,ROWS-1)},(_,y)=>
      Array.from({length:Math.max(0,COLS-1)},(_,x)=>
        maze[y][x]==='#'&&maze[y][x+1]==='#'&&
        maze[y+1][x]==='#'&&maze[y+1][x+1]==='#'
      )
    );
  }

  function mergedSolidBlockAt(blocks,x,y){
    return x>=0&&y>=0&&y<blocks.length&&x<blocks[y].length&&blocks[y][x];
  }

  function mergedMazeTerritoryMap(blocks){
    return Array.from({length:ROWS},(_,y)=>
      Array.from({length:COLS},(_,x)=>
        maze[y][x]==='#'&&(
          mergedSolidBlockAt(blocks,x,y)||
          mergedSolidBlockAt(blocks,x-1,y)||
          mergedSolidBlockAt(blocks,x,y-1)||
          mergedSolidBlockAt(blocks,x-1,y-1)
        )
      )
    );
  }

  function mergedMazeBoundaryMasks(blocks,territory){
    const masks=Array.from({length:ROWS},()=>Array(COLS).fill(null));
    const connect=(x1,y1,x2,y2)=>
      addMazeRenderConnection(masks,{x:x1,y:y1},{x:x2,y:y2});

    // A solid 2x2 block fills the square between the centres of its four wall
    // cells. Add only edges that are not shared with another solid block.
    // These edges form closed mathematical loops, so gaps cannot occur.
    for(let y=0;y<blocks.length;y++){
      for(let x=0;x<blocks[y].length;x++){
        if(!blocks[y][x]) continue;
        if(!mergedSolidBlockAt(blocks,x,y-1)) connect(x,y,x+1,y);
        if(!mergedSolidBlockAt(blocks,x+1,y)) connect(x+1,y,x+1,y+1);
        if(!mergedSolidBlockAt(blocks,x,y+1)) connect(x+1,y+1,x,y+1);
        if(!mergedSolidBlockAt(blocks,x-1,y)) connect(x,y+1,x,y);
      }
    }

    // Preserve every ordinary one-cell pipe and join it reciprocally to the
    // exact territory boundary. Process right/down pairs once only.
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        if(maze[y][x]!=='#'||territory[y][x]) continue;
        if(masks[y][x]===null) masks[y][x]=0;
        for(const step of [MAZE_MASK_STEPS[1],MAZE_MASK_STEPS[2]]){
          const nx=x+step.dx,ny=y+step.dy;
          if(nx>=COLS||ny>=ROWS||maze[ny][nx]!=='#') continue;
          addMazeRenderConnection(masks,{x,y},{x:nx,y:ny});
        }
        // Left/up neighbours may already have been processed. These calls are
        // necessary only when that neighbour is a merged boundary vertex.
        for(const step of [MAZE_MASK_STEPS[0],MAZE_MASK_STEPS[3]]){
          const nx=x+step.dx,ny=y+step.dy;
          if(nx<0||ny<0||maze[ny][nx]!=='#'||!territory[ny][nx]) continue;
          addMazeRenderConnection(masks,{x,y},{x:nx,y:ny});
        }
      }
    }
    return masks;
  }

  function mergedMazeTerritoryFillColor(){
    return `hsl(${mazeColorTheme.hue},68%,15%)`;
  }

  function mergedMazeTerritoryFillOverlap(){
    return Math.max(3,Math.round(TILE*0.08));
  }

  function mergedMazeSolidBlockComponents(blocks){
    const visited=blocks.map(row=>row.map(()=>false));
    const components=[];
    for(let startY=0;startY<blocks.length;startY++){
      for(let startX=0;startX<blocks[startY].length;startX++){
        if(!blocks[startY][startX]||visited[startY][startX]) continue;
        const cells=[];
        const queue=[{x:startX,y:startY}];
        visited[startY][startX]=true;
        let minX=startX,maxX=startX,minY=startY,maxY=startY;
        for(let read=0;read<queue.length;read++){
          const cell=queue[read];
          cells.push(cell);
          minX=Math.min(minX,cell.x); maxX=Math.max(maxX,cell.x);
          minY=Math.min(minY,cell.y); maxY=Math.max(maxY,cell.y);
          for(const step of MAZE_MASK_STEPS){
            const nx=cell.x+step.dx,ny=cell.y+step.dy;
            if(!mergedSolidBlockAt(blocks,nx,ny)||visited[ny][nx]) continue;
            visited[ny][nx]=true;
            queue.push({x:nx,y:ny});
          }
        }
        components.push({cells,minX,maxX,minY,maxY});
      }
    }
    return components;
  }

  function mergedMazeComponentDepth(component){
    const occupied=new Set(component.cells.map(cell=>`${cell.x},${cell.y}`));
    const depths=new Map();
    const queue=[];
    for(const cell of component.cells){
      const boundary=MAZE_MASK_STEPS.some(step=>
        !occupied.has(`${cell.x+step.dx},${cell.y+step.dy}`)
      );
      if(!boundary) continue;
      const key=`${cell.x},${cell.y}`;
      depths.set(key,1);
      queue.push(cell);
    }
    let maximum=1;
    for(let read=0;read<queue.length;read++){
      const cell=queue[read];
      const depth=depths.get(`${cell.x},${cell.y}`);
      maximum=Math.max(maximum,depth);
      for(const step of MAZE_MASK_STEPS){
        const nx=cell.x+step.dx,ny=cell.y+step.dy;
        const key=`${nx},${ny}`;
        if(!occupied.has(key)||depths.has(key)) continue;
        depths.set(key,depth+1);
        queue.push({x:nx,y:ny});
      }
    }
    return maximum;
  }

  function mergedMazeComponentBoundaryPath(component,blocks,overlap){
    const path=new Path2D();
    for(const cell of component.cells){
      const left=(cell.x+0.5)*TILE-overlap;
      const top=(cell.y+0.5)*TILE-overlap;
      const right=(cell.x+1.5)*TILE+overlap;
      const bottom=(cell.y+1.5)*TILE+overlap;
      if(!mergedSolidBlockAt(blocks,cell.x,cell.y-1)){
        path.moveTo(left,top); path.lineTo(right,top);
      }
      if(!mergedSolidBlockAt(blocks,cell.x+1,cell.y)){
        path.moveTo(right,top); path.lineTo(right,bottom);
      }
      if(!mergedSolidBlockAt(blocks,cell.x,cell.y+1)){
        path.moveTo(right,bottom); path.lineTo(left,bottom);
      }
      if(!mergedSolidBlockAt(blocks,cell.x-1,cell.y)){
        path.moveTo(left,bottom); path.lineTo(left,top);
      }
    }
    return path;
  }

  function fillMergedMazeTerritories(targetContext,blocks){
    const overlap=mergedMazeTerritoryFillOverlap();
    const hue=mazeColorTheme.hue;
    for(const component of mergedMazeSolidBlockComponents(blocks)){
      const fillPath=new Path2D();
      for(const cell of component.cells){
        fillPath.rect(
          (cell.x+0.5)*TILE-overlap,
          (cell.y+0.5)*TILE-overlap,
          TILE+overlap*2,
          TILE+overlap*2
        );
      }

      // Start with the nearly black medial material. Boundary bands are then
      // painted from widest/darkest to narrowest/brightest. Their reach comes
      // from the component's real wall-cell depth, so opposing gradients meet
      // precisely on the component's geometric middle rather than on a fixed
      // horizontal or vertical axis.
      targetContext.fillStyle=`hsl(${hue},48%,1.1%)`;
      targetContext.fill(fillPath);
      targetContext.save();
      targetContext.clip(fillPath);
      const boundaryPath=mergedMazeComponentBoundaryPath(component,blocks,overlap);
      const depth=mergedMazeComponentDepth(component);
      const radius=Math.max(
        TILE*0.5,
        (depth-0.5)*TILE+overlap
      );
      // Twenty-four restrained tonal bands soften the territory fill while
      // preserving the graphic character of the previous version.
      const territoryGradientSteps=64;
      targetContext.lineCap='square';
      targetContext.lineJoin='miter';
      for(let step=0;step<territoryGradientSteps;step++){
        const t=step/(territoryGradientSteps-1);
        const eased=t;
        const inwardScale=0.995+(0.02-0.995)*t;
        const saturation=58+(68-58)*eased;
        const lightness=2.2+(15-2.2)*eased;
        targetContext.lineWidth=radius*2*inwardScale;
        targetContext.strokeStyle=`hsl(${hue},${saturation}%,${lightness}%)`;
        targetContext.stroke(boundaryPath);
      }
      targetContext.restore();
    }
  }

  // A post-sprite panel overlay is safe only when its component is a
  // completely filled axis-aligned rectangle. Concave, stepped and holed
  // components must remain sprite-only: treating their bounding footprint as
  // panel material can paint over valid neighbouring wall sprites.
  function mazePanelComponentIsRectangle(component){
    const width=component.maxX-component.minX+1;
    const height=component.maxY-component.minY+1;
    return component.cells.length===width*height;
  }

  // Paint a rectangular panel with sub-pixel concentric layers whose
  // depth is derived from the panel's real dimensions. This lets every panel,
  // including the compact 2-row rectangles, fade continuously to its exact
  // geometric centre instead of exhausting a fixed half-tile radius early.
  function paintFullDepthRectPanel(targetContext,left,top,right,bottom,hue,edgeSaturation,edgeLightness,centerSaturation,centerLightness){
    const width=right-left;
    const height=bottom-top;
    if(width<=0||height<=0) return;
    const centreX=(left+right)*0.5;
    const centreY=(top+bottom)*0.5;
    const maxDepth=Math.max(0.5,Math.min(width,height)*0.5);
    const steps=Math.max(2,Math.ceil(maxDepth*2));

    targetContext.save();
    targetContext.beginPath();
    targetContext.rect(left,top,width,height);
    targetContext.clip();
    for(let step=0;step<=steps;step++){
      const t=step/steps;
      const eased=0.5-0.5*Math.cos(Math.PI*t);
      const depth=maxDepth*t;
      const innerWidth=Math.max(0.5,width-depth*2);
      const innerHeight=Math.max(0.5,height-depth*2);
      const saturation=edgeSaturation+(centerSaturation-edgeSaturation)*eased;
      const lightness=edgeLightness+(centerLightness-edgeLightness)*eased;
      targetContext.fillStyle=`hsl(${hue},${saturation}%,${lightness}%)`;
      targetContext.fillRect(
        centreX-innerWidth*0.5,
        centreY-innerHeight*0.5,
        innerWidth,
        innerHeight
      );
    }
    targetContext.restore();
  }

  // Thin territories can contain several adjacent solid blocks while
  // still having no internal wall cell. Their opaque perimeter sprites cover
  // the earlier fill, so reconstruct one inset union without internal seams.
  function overlayShallowMergedMazePanelGradients(targetContext,blocks){
    const hue=mazeColorTheme.hue;
    const overlap=mergedMazeTerritoryFillOverlap();
    const inset=Math.max(8,Math.round(TILE*0.18));
    for(const component of mergedMazeSolidBlockComponents(blocks)){
      if(mergedMazeComponentDepth(component)!==1) continue;
      if(!mazePanelComponentIsRectangle(component)) continue;
      const left=(component.minX+0.5)*TILE-overlap+inset;
      const top=(component.minY+0.5)*TILE-overlap+inset;
      const right=(component.maxX+1.5)*TILE+overlap-inset;
      const bottom=(component.maxY+1.5)*TILE+overlap-inset;
      paintFullDepthRectPanel(targetContext,left,top,right,bottom,hue,64,12.5,56,4.8);
    }
  }

  // Some small decorative rectangles are enclosed empty cells rather than
  // merged solid wall blocks. Find every open component, preserve the largest
  // (the playable corridor network), and shade only the sealed components.
  function sealedMazeOpenComponents(){
    const visited=Array.from({length:ROWS},()=>Array(COLS).fill(false));
    const components=[];
    for(let startY=0;startY<ROWS;startY++){
      for(let startX=0;startX<COLS;startX++){
        if(maze[startY][startX]==='#'||visited[startY][startX]) continue;
        const cells=[];
        const queue=[{x:startX,y:startY}];
        visited[startY][startX]=true;
        let minX=startX,maxX=startX,minY=startY,maxY=startY;
        for(let read=0;read<queue.length;read++){
          const cell=queue[read];
          cells.push(cell);
          minX=Math.min(minX,cell.x); maxX=Math.max(maxX,cell.x);
          minY=Math.min(minY,cell.y); maxY=Math.max(maxY,cell.y);
          for(const step of MAZE_MASK_STEPS){
            const nx=cell.x+step.dx,ny=cell.y+step.dy;
            if(nx<0||ny<0||nx>=COLS||ny>=ROWS||visited[ny][nx]||maze[ny][nx]==='#') continue;
            visited[ny][nx]=true;
            queue.push({x:nx,y:ny});
          }
        }
        components.push({cells,minX,maxX,minY,maxY});
      }
    }
    if(!components.length) return [];
    let playable=components[0];
    for(const component of components){
      if(component.cells.length>playable.cells.length) playable=component;
    }
    return components.filter(component=>component!==playable);
  }

  function overlaySealedMazePanelGradients(targetContext){
    const hue=mazeColorTheme.hue;
    const inset=Math.max(7,Math.round(TILE*0.16));
    for(const component of sealedMazeOpenComponents()){
      if(!mazePanelComponentIsRectangle(component)) continue;
      const left=component.minX*TILE+inset;
      const top=component.minY*TILE+inset;
      const right=(component.maxX+1)*TILE-inset;
      const bottom=(component.maxY+1)*TILE-inset;
      paintFullDepthRectPanel(targetContext,left,top,right,bottom,hue,62,11.5,56,4.8);
    }
  }

  function drawMazeMaskAtCell(targetContext,x,y,mask){
    const axis=mazeWallFadeAxis(x,y,mask);
    const cached=ConceptMazeRenderCache.get(`${mazeColorTheme.name}|${mask}`) ||
      MazeRenderCache.get(mazeRenderKey(mazeColorTheme,mask,axis));
    if(cached){
      drawAtlasRegion(targetContext,cached,x*TILE,y*TILE,TILE,TILE);
      return;
    }
    targetContext.fillStyle=mazeColorTheme.fallbackOuter;
    targetContext.fillRect(x*TILE,y*TILE,TILE,TILE);
    targetContext.fillStyle=mazeColorTheme.fallbackInner;
    targetContext.fillRect(x*TILE+3,y*TILE+3,TILE-6,TILE-6);
  }

  function renderMazeFloorBackdrop(targetContext){
    const hue=mazeColorTheme.hue;
    const width=COLS*TILE,height=ROWS*TILE;

    // The floor remains visually black, but inherits a restrained trace of
    // the level palette. This complete backdrop is baked once per level.
    const depth=targetContext.createRadialGradient(
      width*0.5,height*0.43,TILE*1.5,
      width*0.5,height*0.48,Math.max(width,height)*0.72
    );
    depth.addColorStop(0,`hsl(${hue},58%,4.8%)`);
    depth.addColorStop(0.58,`hsl(${hue},54%,3.0%)`);
    depth.addColorStop(1,`hsl(${hue},48%,1.2%)`);
    targetContext.fillStyle=depth;
    targetContext.fillRect(0,0,width,height);

    // A very faint diagonal colour drift prevents large corridors from
    // looking flat, while keeping moving entities considerably brighter.
    const drift=targetContext.createLinearGradient(0,height,width,0);
    drift.addColorStop(0,`hsla(${hue},78%,28%,0)`);
    drift.addColorStop(0.52,`hsla(${hue},78%,28%,0.035)`);
    drift.addColorStop(1,`hsla(${hue},78%,28%,0)`);
    targetContext.fillStyle=drift;
    targetContext.fillRect(0,0,width,height);

    // Build one continuous centre network through every walkable cell.
    // Repainting the same cached path from wide/dark to narrow/bright creates
    // a perpendicular falloff from the spine toward every surrounding wall.
    targetContext.save();
    targetContext.beginPath();
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        if(maze[y][x]==='#') continue;
        const cx=x*TILE+TILE*0.5;
        const cy=y*TILE+TILE*0.5;
        if(x+1<COLS&&maze[y][x+1]!=='#'){
          targetContext.moveTo(cx,cy);
          targetContext.lineTo(cx+TILE,cy);
        }
        if(y+1<ROWS&&maze[y+1][x]!=='#'){
          targetContext.moveTo(cx,cy);
          targetContext.lineTo(cx,cy+TILE);
        }
      }
    }
    targetContext.lineCap='round';
    targetContext.lineJoin='round';
    const corridorGradientBands=[
      // The widest band reaches the walls and carries the strongest colour.
      // Every narrower repaint removes light until the centre becomes black.
      [15,`hsla(${hue},88%,11.2%,0.72)`],
      [11,`hsla(${hue},84%,7.7%,0.78)`],
      [7,`hsla(${hue},72%,4.55%,0.86)`],
      [3,`hsla(${hue},56%,1.75%,0.94)`],
      [0.9,'rgba(0,0,0,0.98)']
    ];
    for(const [lineWidth,strokeStyle] of corridorGradientBands){
      targetContext.lineWidth=lineWidth;
      targetContext.strokeStyle=strokeStyle;
      targetContext.stroke();
    }
    targetContext.restore();

    // The deterministic micro-stars remain above the corridor gradient.
    // Their positions depend only on the cell and theme, so they never flicker.
    targetContext.save();
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        if(maze[y][x]==='#') continue;
        const hash=(x*73+y*151+mazeRevision*19+hue*7)>>>0;
        if(hash%6!==0) continue;
        const px=x*TILE+3+(hash%10);
        const py=y*TILE+3+((hash>>>4)%10);
        const alpha=0.09+((hash>>>8)%4)*0.018;
        targetContext.fillStyle=`hsla(${hue},78%,70%,${alpha})`;
        targetContext.fillRect(px,py,1,1);
      }
    }
    targetContext.restore();
  }

  // The exact same artwork painter is shared by the live world cache and the
  // isolated tutorial cache. Cache ownership and revision bookkeeping stay
  // outside this function, so painting a training arena cannot alter a run.
  function paintMazeArtwork(targetContext,{
    includeSealedPanelGradients=true
  }={}){
    renderMazeFloorBackdrop(targetContext);
    const mergedSolidBlocks=mergedMazeSolidBlockMap();
    const mergedTerritory=mergedMazeTerritoryMap(mergedSolidBlocks);
    const mergedRenderMasks=mergedMazeBoundaryMasks(
      mergedSolidBlocks,mergedTerritory
    );

    // Fill first; the cached component sprites are then drawn over the
    // exact boundary, hiding every join between neighbouring blocks.
    fillMergedMazeTerritories(targetContext,mergedSolidBlocks);

    targetContext.save();
    targetContext.filter='brightness(78%) contrast(120%)';
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        if(maze[y][x]==='#'){
          const mask=mergedRenderMasks[y][x];
          // A null wall mask is an internal cell of a unified territory. It is
          // intentionally left black; perimeter sprites use normal cell slots.
          if(mask!==null) drawMazeMaskAtCell(targetContext,x,y,mask);
        }
      }
    }
    targetContext.restore();

    // Restore the gradient inside the smallest closed territories after their
    // opaque boundary sprites have been composited.
    overlayShallowMergedMazePanelGradients(targetContext,mergedSolidBlocks);
    if(includeSealedPanelGradients) overlaySealedMazePanelGradients(targetContext);
  }

  function renderMazeLayer(){
    const themeName=mazeColorTheme.name;
    if(mazeLayerRevision===mazeRevision&&mazeLayerThemeName===themeName) return;

    mazeLayerContext.clearRect(0,0,mazeLayerCanvas.width,mazeLayerCanvas.height);
    paintMazeArtwork(mazeLayerContext);

    const activeMazeRegions=Object.keys(RenderAtlasData.conceptMaze||{}).length
      ? Object.values(RenderAtlasData.conceptMaze)
      : Object.values(RenderAtlasData.maze);
    const allMazeAtlasImagesReady=activeMazeRegions
      .every(region=>atlasImageReady(region[0]));
    // If initialization reached its safety timeout, keep trying until the
    // atlas image becomes available instead of freezing fallback tiles.
    mazeLayerRevision=allMazeAtlasImagesReady?mazeRevision:-1;
    mazeLayerThemeName=themeName;
  }

  // A short phosphor memory follows every active player. Sampling is based on
  // travelled world distance rather than render cadence, so 60 Hz and 120 Hz
  // displays produce the same trail density. A fixed ring buffer and cached
  // glow stamps keep the effect allocation-free during gameplay.
  const PLAYER_PHOSPHOR_TRAIL_LIFETIME_GAME_MS=620;
  const PLAYER_PHOSPHOR_TRAIL_SAMPLE_DISTANCE_CELLS=.38;
  const PLAYER_PHOSPHOR_TRAIL_DISCONTINUITY_CELLS=1.35;
  const PLAYER_PHOSPHOR_TRAIL_MAX_SAMPLES=18;
  const PlayerPhosphorGlowCache=new Map();

  function playerEffectColor(p){
    return p?.isAI?'#ffd85d':p?.id===2?'#66baff':'#6dff72';
  }

  function cachedPlayerPhosphorGlow(color){
    if(PlayerPhosphorGlowCache.has(color))
      return PlayerPhosphorGlowCache.get(color);
    const glowCanvas=document.createElement('canvas');
    glowCanvas.width=glowCanvas.height=128;
    const glowContext=glowCanvas.getContext('2d');
    const paintMistLobe=(x,y,inner,outer,alpha)=>{
      const mist=glowContext.createRadialGradient(x,y,inner,x,y,outer);
      mist.addColorStop(0,color+alpha);
      mist.addColorStop(.36,color+'38');
      mist.addColorStop(.72,color+'16');
      mist.addColorStop(1,color+'00');
      glowContext.fillStyle=mist;
      glowContext.fillRect(0,0,128,128);
    };
    // Several overlapping soft lobes form an irregular cloud instead of a
    // bright dot. The whole cloud remains one cached draw call per sample.
    paintMistLobe(63,69,5,59,'86');
    paintMistLobe(42,48,2,37,'68');
    paintMistLobe(88,50,3,40,'5a');
    PlayerPhosphorGlowCache.set(color,glowCanvas);
    return glowCanvas;
  }

  // Build the three tiny stamps while the title screen is active. The first
  // movement frame therefore performs no canvas or gradient allocation.
  ['#6dff72','#66baff','#ffd85d'].forEach(cachedPlayerPhosphorGlow);

  function ensurePlayerPhosphorTrail(p){
    if(p.phosphorTrailState) return p.phosphorTrailState;
    const state={
      samples:Array.from(
        {length:PLAYER_PHOSPHOR_TRAIL_MAX_SAMPLES},
        ()=>({x:0,y:0,at:-Infinity,energy:1,phase:0})
      ),
      start:0,
      count:0,
      serial:0,
      lastX:NaN,
      lastY:NaN
    };
    p.phosphorTrailState=state;
    return state;
  }

  function clearPlayerPhosphorTrail(state){
    state.start=0;
    state.count=0;
    state.lastX=NaN;
    state.lastY=NaN;
  }

  function prunePlayerPhosphorTrail(state,t){
    while(state.count>0){
      const oldest=state.samples[state.start];
      if(t-oldest.at<PLAYER_PHOSPHOR_TRAIL_LIFETIME_GAME_MS) break;
      state.start=(state.start+1)%PLAYER_PHOSPHOR_TRAIL_MAX_SAMPLES;
      state.count--;
    }
  }

  function addPlayerPhosphorTrailSample(state,x,y,t,energy){
    let index;
    if(state.count<PLAYER_PHOSPHOR_TRAIL_MAX_SAMPLES){
      index=(state.start+state.count)%PLAYER_PHOSPHOR_TRAIL_MAX_SAMPLES;
      state.count++;
    }else{
      index=state.start;
      state.start=(state.start+1)%PLAYER_PHOSPHOR_TRAIL_MAX_SAMPLES;
    }
    const sample=state.samples[index];
    sample.x=x;
    sample.y=y;
    sample.at=t;
    sample.energy=energy;
    // The golden-angle step prevents neighbouring clouds from drifting in the
    // same direction and revealing the exact centreline of the corridor.
    sample.phase=(state.serial++*2.399963229728653+x*.31+y*.17)%(
      Math.PI*2
    );
    state.lastX=x;
    state.lastY=y;
  }

  function updatePlayerPhosphorTrail(p,t){
    const state=ensurePlayerPhosphorTrail(p);
    prunePlayerPhosphorTrail(state,t);
    if(p.dead||p.eliminated) return state;

    const renderVisual=p.renderVisualPosition||
      (p.renderVisualPosition={x:0,y:0});
    const visual=playerVisualPosition(p,t,renderVisual);
    if(!Number.isFinite(visual.x)||!Number.isFinite(visual.y)) return state;

    if(!Number.isFinite(state.lastX)||!Number.isFinite(state.lastY)){
      addPlayerPhosphorTrailSample(state,visual.x,visual.y,t,1);
      return state;
    }

    const distance=Math.hypot(
      visual.x-state.lastX,visual.y-state.lastY
    );
    if(distance>PLAYER_PHOSPHOR_TRAIL_DISCONTINUITY_CELLS){
      clearPlayerPhosphorTrail(state);
      addPlayerPhosphorTrailSample(state,visual.x,visual.y,t,1);
      return state;
    }
    if(distance<PLAYER_PHOSPHOR_TRAIL_SAMPLE_DISTANCE_CELLS) return state;

    const energy=isPowerMode(p,t)?1.45:isSpawnProtected(p,t)?1.16:1;
    addPlayerPhosphorTrailSample(state,visual.x,visual.y,t,energy);
    return state;
  }

  function drawPlayerPhosphorTrail(p,t,{forceVisible=false}={}){
    const state=updatePlayerPhosphorTrail(p,t);
    if(state.count===0) return;
    const color=playerEffectColor(p);
    const glow=cachedPlayerPhosphorGlow(color);

    ctx.save();
    ctx.globalCompositeOperation='screen';
    for(let order=0;order<state.count;order++){
      const sample=state.samples[
        (state.start+order)%PLAYER_PHOSPHOR_TRAIL_MAX_SAMPLES
      ];
      if(!forceVisible&&!gameplaySpriteVisible(sample.x,sample.y)) continue;
      const age=Math.max(0,t-sample.at);
      const remaining=Math.max(
        0,1-age/PLAYER_PHOSPHOR_TRAIL_LIFETIME_GAME_MS
      );
      if(remaining<=0) continue;
      const strength=remaining*remaining*Math.min(1.45,sample.energy);
      const elapsed=1-remaining;
      const phase=sample.phase+elapsed*.7;
      // Each cloud slowly spreads sideways and rises a little while fading.
      // This keeps the movement readable without painting the maze groove.
      const spread=TILE*(.08+.22*elapsed);
      const centerX=(sample.x+.5)*TILE+Math.sin(phase)*spread;
      const centerY=(sample.y+.5)*TILE+
        Math.cos(phase*.83)*spread*.55-TILE*.14*elapsed;
      const breathe=.94+.06*Math.sin(phase+age*.008);
      const size=TILE*(1.48+.58*elapsed+.12*sample.energy)*breathe;
      ctx.globalAlpha=.29*strength;
      ctx.drawImage(glow,centerX-size/2,centerY-size/2,size,size);
    }
    ctx.restore();
  }

  globalThis.__mazeBitersPhosphorTrailDiagnostics=()=>({
    lifetimeGameMs:PLAYER_PHOSPHOR_TRAIL_LIFETIME_GAME_MS,
    sampleDistanceCells:PLAYER_PHOSPHOR_TRAIL_SAMPLE_DISTANCE_CELLS,
    maxSamplesPerPlayer:PLAYER_PHOSPHOR_TRAIL_MAX_SAMPLES,
    cachedGlowStamps:PlayerPhosphorGlowCache.size,
    players:allPlayers().map(p=>({
      player:p.id,
      ai:!!p.isAI,
      samples:p.phosphorTrailState?.count||0,
      color:playerEffectColor(p)
    }))
  });

  // Every successfully eaten creature becomes a short three-stage transfer:
  // white impact, coloured vapour, then four motes pulled into the mouth.
  // All gradients and all event objects are prepared before gameplay so rapid
  // tail eating cannot create canvas surfaces or garbage-collection spikes.
  const SNAKE_BITE_BLOOM_DURATION_GAME_MS=340;
  const SNAKE_BITE_FLASH_GAME_MS=82;
  const SNAKE_BITE_CLOUD_START_GAME_MS=18;
  const SNAKE_BITE_CLOUD_END_GAME_MS=260;
  const SNAKE_BITE_SUCTION_START_GAME_MS=54;
  const SNAKE_BITE_SUCTION_TRAVEL_GAME_MS=248;
  const SNAKE_BITE_PARTICLE_COUNT=4;
  const SNAKE_BITE_BLOOM_POOL_SIZE=24;
  const SnakeBiteParticleOffsets=Object.freeze([-.22,.18,-.10,.26]);
  const SnakeBiteBloomTextureCache=new Map();
  const ConsumptionBloomPalettes=Object.freeze([...new Set([
    ...SNAKE_PALETTE,
    ...HUNTER_PALETTE,
    '#6dff72','#66baff','#ffd85d'
  ])]);

  function buildSnakeBiteFlashTexture(){
    const texture=document.createElement('canvas');
    texture.width=texture.height=96;
    const textureContext=texture.getContext('2d',{alpha:true});
    const center=48;
    const glow=textureContext.createRadialGradient(
      center,center,1,center,center,46
    );
    glow.addColorStop(0,'rgba(255,255,255,1)');
    glow.addColorStop(.16,'rgba(255,255,248,.96)');
    glow.addColorStop(.48,'rgba(230,250,255,.34)');
    glow.addColorStop(1,'rgba(210,245,255,0)');
    textureContext.fillStyle=glow;
    textureContext.fillRect(0,0,96,96);
    textureContext.fillStyle='rgba(255,255,255,.98)';
    textureContext.beginPath();
    textureContext.moveTo(center,8);
    textureContext.lineTo(54,42);
    textureContext.lineTo(88,center);
    textureContext.lineTo(54,54);
    textureContext.lineTo(center,88);
    textureContext.lineTo(42,54);
    textureContext.lineTo(8,center);
    textureContext.lineTo(42,42);
    textureContext.closePath();
    textureContext.fill();
    return texture;
  }

  function buildSnakeBiteBloomTextures(color){
    const cloud=document.createElement('canvas');
    cloud.width=cloud.height=128;
    const cloudContext=cloud.getContext('2d',{alpha:true});
    const paintCloudLobe=(x,y,inner,outer,coreAlpha)=>{
      const gradient=cloudContext.createRadialGradient(
        x,y,inner,x,y,outer
      );
      gradient.addColorStop(0,'rgba(255,255,255,'+coreAlpha+')');
      gradient.addColorStop(.16,color+'d8');
      gradient.addColorStop(.52,color+'5c');
      gradient.addColorStop(1,color+'00');
      cloudContext.fillStyle=gradient;
      cloudContext.fillRect(0,0,128,128);
    };
    paintCloudLobe(64,67,3,58,.78);
    paintCloudLobe(42,48,1,35,.46);
    paintCloudLobe(88,51,2,39,.42);

    const particle=document.createElement('canvas');
    particle.width=particle.height=48;
    const particleContext=particle.getContext('2d',{alpha:true});
    const center=24;
    const glow=particleContext.createRadialGradient(
      center,center,1,center,center,23
    );
    glow.addColorStop(0,'rgba(255,255,255,1)');
    glow.addColorStop(.18,color+'f0');
    glow.addColorStop(.58,color+'68');
    glow.addColorStop(1,color+'00');
    particleContext.fillStyle=glow;
    particleContext.fillRect(0,0,48,48);
    particleContext.fillStyle='rgba(255,255,248,.96)';
    particleContext.beginPath();
    particleContext.moveTo(center,12);
    particleContext.lineTo(28,center);
    particleContext.lineTo(center,36);
    particleContext.lineTo(20,center);
    particleContext.closePath();
    particleContext.fill();
    return Object.freeze({cloud,particle});
  }

  function cachedSnakeBiteBloomTextures(color){
    return SnakeBiteBloomTextureCache.get(color)||
      SnakeBiteBloomTextureCache.get(SNAKE_GREEN);
  }

  const SnakeBiteFlashTexture=buildSnakeBiteFlashTexture();
  for(const color of ConsumptionBloomPalettes){
    SnakeBiteBloomTextureCache.set(
      color,buildSnakeBiteBloomTextures(color)
    );
  }

  const SnakeBiteBloomPool=Array.from(
    {length:SNAKE_BITE_BLOOM_POOL_SIZE},
    ()=>({
      active:false,x:0,y:0,startedAt:-Infinity,
      player:null,dirX:1,dirY:0,serial:0,textures:null
    })
  );
  let snakeBiteBloomCursor=0;
  let snakeBiteBloomSerial=0;

  function spawnConsumedCreatureBloomAt(
    x,y,color,p,t=gameTimeNow()
  ){
    if(!Number.isFinite(x)||!Number.isFinite(y)||!p) return false;
    let selected=-1;
    let oldestIndex=snakeBiteBloomCursor;
    let oldestTime=Infinity;
    for(let offset=0;offset<SNAKE_BITE_BLOOM_POOL_SIZE;offset++){
      const index=(snakeBiteBloomCursor+offset)%
        SNAKE_BITE_BLOOM_POOL_SIZE;
      const effect=SnakeBiteBloomPool[index];
      if(!effect.active||t-effect.startedAt>=
         SNAKE_BITE_BLOOM_DURATION_GAME_MS){
        selected=index;
        break;
      }
      if(effect.startedAt<oldestTime){
        oldestTime=effect.startedAt;
        oldestIndex=index;
      }
    }
    if(selected<0) selected=oldestIndex;
    snakeBiteBloomCursor=(selected+1)%SNAKE_BITE_BLOOM_POOL_SIZE;

    const effect=SnakeBiteBloomPool[selected];
    const moveX=p.x-p.prevX;
    const moveY=p.y-p.prevY;
    const directionX=moveX||(!moveY?(p.dir?.x||1):0);
    const directionY=moveY||(!moveX?(p.dir?.y||0):0);
    effect.active=true;
    effect.x=x;
    effect.y=y;
    effect.startedAt=t;
    effect.player=p;
    effect.dirX=directionX;
    effect.dirY=directionY;
    effect.serial=snakeBiteBloomSerial++;
    effect.textures=cachedSnakeBiteBloomTextures(color||SNAKE_GREEN);
    return true;
  }

  function spawnSnakeBiteBloom(cell,color,p,t=gameTimeNow()){
    if(!cell) return false;
    return spawnConsumedCreatureBloomAt(cell.x,cell.y,color,p,t);
  }

  function drawConsumedCreatureBloom(effect,t,{forceVisible=false}={}){
    if(!effect?.active||!effect.textures) return false;
    const age=t-effect.startedAt;
    if(age<0||age>=SNAKE_BITE_BLOOM_DURATION_GAME_MS) return false;
    if(!forceVisible&&!gameplaySpriteVisible(effect.x,effect.y)) return true;

    const previousAlpha=ctx.globalAlpha;
    const sourceX=(effect.x+.5)*TILE;
    const sourceY=(effect.y+.5)*TILE;

    if(age>=SNAKE_BITE_CLOUD_START_GAME_MS&&
       age<SNAKE_BITE_CLOUD_END_GAME_MS){
      const progress=(age-SNAKE_BITE_CLOUD_START_GAME_MS)/(
        SNAKE_BITE_CLOUD_END_GAME_MS-SNAKE_BITE_CLOUD_START_GAME_MS
      );
      const strength=4*progress*(1-progress);
      const size=TILE*(.72+.92*progress);
      ctx.globalAlpha=previousAlpha*.62*strength;
      ctx.drawImage(
        effect.textures.cloud,
        sourceX-size/2,sourceY-size/2,size,size
      );
    }

    if(age<SNAKE_BITE_FLASH_GAME_MS){
      const progress=age/SNAKE_BITE_FLASH_GAME_MS;
      const size=TILE*(.58+.90*progress);
      const remaining=1-progress;
      ctx.globalAlpha=previousAlpha*.96*remaining*remaining;
      ctx.drawImage(
        SnakeBiteFlashTexture,
        sourceX-size/2,sourceY-size/2,size,size
      );
    }

    if(age>=SNAKE_BITE_SUCTION_START_GAME_MS&&effect.player){
      const p=effect.player;
      const renderVisual=p.renderVisualPosition||
        (p.renderVisualPosition={x:p.x,y:p.y});
      const visual=playerVisualPosition(p,t,renderVisual);
      const mouthDirectionX=p.dir?.x??effect.dirX;
      const mouthDirectionY=p.dir?.y??effect.dirY;
      const mouthX=(visual.x+.5+mouthDirectionX*.31)*TILE;
      const mouthY=(visual.y+.5+mouthDirectionY*.31)*TILE;
      const perpendicularX=-effect.dirY;
      const perpendicularY=effect.dirX;

      for(let particleIndex=0;
        particleIndex<SNAKE_BITE_PARTICLE_COUNT;
        particleIndex++
      ){
        const particleStart=SNAKE_BITE_SUCTION_START_GAME_MS+
          particleIndex*15;
        const progress=(age-particleStart)/
          SNAKE_BITE_SUCTION_TRAVEL_GAME_MS;
        if(progress<0||progress>=1) continue;
        const pull=progress*progress;
        const arch=4*progress*(1-progress);
        const offsetIndex=(particleIndex+effect.serial)&3;
        const side=SnakeBiteParticleOffsets[offsetIndex]*arch*TILE;
        const particleX=sourceX+(mouthX-sourceX)*pull+
          perpendicularX*side;
        const particleY=sourceY+(mouthY-sourceY)*pull+
          perpendicularY*side;
        const appear=Math.min(1,progress*6);
        const size=TILE*(.22-.09*progress);
        ctx.globalAlpha=previousAlpha*.86*appear*(1-progress);
        ctx.drawImage(
          effect.textures.particle,
          particleX-size/2,particleY-size/2,size,size
        );
      }
    }
    ctx.globalAlpha=previousAlpha;
    return true;
  }

  function drawSnakeBiteBlooms(t){
    for(let effectIndex=0;
      effectIndex<SNAKE_BITE_BLOOM_POOL_SIZE;
      effectIndex++
    ){
      const effect=SnakeBiteBloomPool[effectIndex];
      if(!effect.active) continue;
      if(t-effect.startedAt>=SNAKE_BITE_BLOOM_DURATION_GAME_MS){
        effect.active=false;
        effect.player=null;
        continue;
      }
      drawConsumedCreatureBloom(effect,t);
    }
  }

  globalThis.__mazeBitersSnakeBiteBloomDiagnostics=()=>{
    let active=0;
    for(const effect of SnakeBiteBloomPool) if(effect.active) active++;
    return {
      style:'White Consumption Flash + Creature-colour Bloom + Mouth Suction',
      durationGameMs:SNAKE_BITE_BLOOM_DURATION_GAME_MS,
      poolSize:SNAKE_BITE_BLOOM_POOL_SIZE,
      active,
      cachedColorPalettes:SnakeBiteBloomTextureCache.size,
      targets:'snake segments, scorpion, hunters and VS opponents',
      runtimeCanvasAllocations:0,
      runtimeGradientAllocations:0,
      particlesPerBite:SNAKE_BITE_PARTICLE_COUNT,
      maximumDrawsPerActiveBite:SNAKE_BITE_PARTICLE_COUNT+2
    };
  };

  // One renderer owns snake semantics everywhere: gameplay, attract scenes
  // and the interactive training board. A snake body is always HEAD -> TAIL;
  // every sprite orientation is derived from those neighbouring cells.
  function drawSnakeEntity(s,t=gameTimeNow(),{
    forceVisible=false,
    animate=true,
    ignoreGameOverFreeze=false
  }={}){
    if(!s?.body?.length) return;
    for(let i=s.body.length-1;i>=0;i--){
      const p=s.body[i];
      // The entire middle body is a stationary trail. Only the head creates
      // new path with a quick slide and only the tail retracts the old path.
      const isMiddleBody=i>0 && i<s.body.length-1;
      const visual=!animate||isMiddleBody
        ? p
        : snakeSegmentVisualPosition(
            s,i,t,
             i===0
               ? (s.renderHeadPosition||(s.renderHeadPosition={x:0,y:0}))
              : (s.renderTailPosition||(s.renderTailPosition={x:0,y:0})),
            ignoreGameOverFreeze
           );
      if(!forceVisible&&!gameplaySpriteVisible(visual.x,visual.y)) continue;

      if(i===0){
        const visualHeadDir=s.dir;
        const dirNumber=directionNumber(visualHeadDir);
        const semantic=s.body.length===1 ? 'UNIQUE_HEAD' : 'HEAD';
        const headSprite=snakeRenderSprite(s,semantic,dirNumber);
        const headOcclusion=usesModernSnake(s)
          ? ModernSnakeHeadOcclusionByDirection[dirNumber]
          : null;
        if(headOcclusion){
          drawSpriteImage(
            ctx,headOcclusion,visual.x*TILE,visual.y*TILE,TILE,TILE
          );
        }
        if(!drawSpriteImage(
          ctx,headSprite,visual.x*TILE,visual.y*TILE,TILE,TILE
        )){
          drawSnakeHead(visual.x*TILE,visual.y*TILE,visualHeadDir);
        }
        continue;
      }

      if(i===s.body.length-1){
        const previous=s.body[i-1] || s.body[i];
        const towardBody=renderDirection(previous.x-p.x,previous.y-p.y);
        const tailNumber=directionNumber(towardBody);
        const bodyToTail=oppositeRenderDirection(towardBody);
        const tailSprite=snakeRenderSprite(s,'TAIL',tailNumber);
        const clippedReverseTurn=animate&&drawClippedReverseTailTurn(
          s,tailSprite,visual,i,bodyToTail,s.color||'#35e55b'
        );
        if(!clippedReverseTurn && !drawSpriteImage(
          ctx,tailSprite,visual.x*TILE,visual.y*TILE,TILE,TILE
        )){
          drawSnakeTail(
            visual.x*TILE,visual.y*TILE,bodyToTail,s.color||'#35e55b'
          );
        }
        continue;
      }

      const previous=s.body[i-1];
      const next=s.body[i+1];
      const a=renderDirection(previous.x-p.x,previous.y-p.y);
      const b=renderDirection(next.x-p.x,next.y-p.y);
      const isCorner=(a.x!==0 && b.y!==0)||(a.y!==0 && b.x!==0);

      if(isCorner){
        const turnSprite=snakeRenderSprite(s,'TURN',snakeTurnNumber(a,b));
        if(!drawSpriteImage(
          ctx,turnSprite,visual.x*TILE,visual.y*TILE,TILE,TILE
        )){
          drawSnakeCorner(
            visual.x*TILE,visual.y*TILE,a,b,s.color||'#35e55b'
          );
        }
      }else{
        const vertical=(a.y!==0 || b.y!==0);
        const modern=usesModernSnake(s);
        const semantic=modern
          ?'BODY_DIRECTIONAL'
          :(vertical?'BODY_VERTICAL':'BODY_HORIZONTAL');
        const bodySprite=snakeRenderSprite(
          s,semantic,modern?directionNumber(a):null
        );
        const clippedReverseNeck=animate&&drawClippedModernHeadFollower(
          s,bodySprite,visual.x,visual.y,i,s.body.length,b,t
        );
        if(!clippedReverseNeck && !drawSpriteImage(
          ctx,bodySprite,visual.x*TILE,visual.y*TILE,TILE,TILE
        )){
          rect(
            visual.x*TILE+2,visual.y*TILE+2,16,16,
            s.color||'#35e55b'
          );
        }
      }
    }
  }

  function draw(realNow=performance.now(),gameNow=gameTimeNow()) {
    // The title is independent from the live simulation. Return before roster
    // allocation, HUD animation checks and the redundant gameplay clear.
    if(awaitingPlayerSelection){
      drawBufferedTitleFrame(realNow);
      return;
    }

    const roster=allPlayers();
    // Atlases are fully decoded before the game starts. A static/tied HUD is
    // already current after updateHud(); only a unique multiplayer leader
    // needs a fresh frame for its score pulse.
    const hudAnimationActive=
      hasAnimatedLeaderScore(roster)||hasActiveLifePulse(roster,realNow)||
      hasActiveHudSpotlight(roster,realNow);
    const hudAnimationDue=
      hudAnimationActive&&realNow-lastHudAnimationAt>=HUD_ANIMATION_INTERVAL_MS;
  // Score/life pulses share the same locked 120 Hz clock used by the
  // title screen and gameplay, while dozens of
    // bitmap glyph blits are skipped on the intervening frames. Render once
    // more when an animation ends so no dimmed glyph can remain frozen.
    if(hudDirty||hudAnimationDue||
       (hudAnimationWasActive&&!hudAnimationActive)){
      renderHud(roster,realNow);
      hudDirty=false;
      lastHudAnimationAt=realNow;
    }
    hudAnimationWasActive=hudAnimationActive;
    renderMazeLayer();
    updateGameplayCamera(realNow,gameNow);
    const cameraViewWidth=GAME_LOGICAL_WIDTH/gameplayCamera.zoom;
    const cameraViewHeight=GAME_LOGICAL_HEIGHT/gameplayCamera.zoom;
    const cameraLeft=gameplayCamera.x-cameraViewWidth/2;
    const cameraTop=gameplayCamera.y-cameraViewHeight/2;
    const visibilityPaddingCells=2;
    gameplayVisibleMinX=cameraLeft/TILE-visibilityPaddingCells;
    gameplayVisibleMinY=cameraTop/TILE-visibilityPaddingCells;
    gameplayVisibleMaxX=(cameraLeft+cameraViewWidth)/TILE+
      visibilityPaddingCells;
    gameplayVisibleMaxY=(cameraTop+cameraViewHeight)/TILE+
      visibilityPaddingCells;

    // Crop the native world cache directly into the presentation canvas. At
    // HD zoom 1x the 2880x2000 world is reduced once to 1440x1000; at zoom 2x
    // its 1440x1000 crop is copied one-to-one. No reduced maze cache is ever
    // enlarged again by the moving camera.
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalAlpha=1;
    ctx.filter='none';
    ctx.globalCompositeOperation='copy';
    ctx.imageSmoothingEnabled=gameplayCamera.zoom>1.00001;
    if('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality='high';
    ctx.drawImage(
      mazeLayerCanvas,
      cameraLeft*MAZE_CACHE_RENDER_SCALE,
      cameraTop*MAZE_CACHE_RENDER_SCALE,
      cameraViewWidth*MAZE_CACHE_RENDER_SCALE,
      cameraViewHeight*MAZE_CACHE_RENDER_SCALE,
      0,0,GAME_BACKING_WIDTH,GAME_BACKING_HEIGHT
    );
    ctx.globalCompositeOperation='source-over';
    applyGameplayCameraWorldTransform();

    // The phosphor memory belongs to the floor lighting. Draw it over the
    // cached maze but under every item, creature, leader effect and player sprite.
    for(let i=0;i<roster.length;i++)
      drawPlayerPhosphorTrail(roster[i],gameNow);

    // Snakes — untouched native HD sprites, drawn directly from their atlases.
    // Eggs are rendered below all moving entities. While intact they can be
    // crossed visibly; after cracking starts they remain here but become solid.
    for(let i=0;i<eggs.length;i++){
      const egg=eggs[i];
      if(gameplaySpriteVisible(egg.x,egg.y)) drawEgg(egg,gameNow);
    }
    for(let i=0;i<fruits.length;i++){
      const fruit=fruits[i];
      if(gameplaySpriteVisible(fruit.x,fruit.y)) drawFruit(fruit,gameNow);
    }

    for(let si=0;si<snakes.length;si++)
      drawSnakeEntity(snakes[si],gameNow);

    drawScorpion(gameNow);
    for(let i=0;i<hunters.length;i++) drawHunter(hunters[i],gameNow);

    // Bite energy sits over the creatures it was cut from, but below the
    // player sprite so the final motes disappear naturally into the mouth.
    drawSnakeBiteBlooms(gameNow);

    for(let i=0;i<roster.length;i++){
      const p=roster[i];
      if(p.dead){
        if(!p.hideDeathSprite){
          if(!gameplaySpriteVisible(p.deathX,p.deathY)) continue;
          const deadPalette=p.isAI?'ai':p.id===2?'p2':'p1';
          drawDeathSpriteAt(p.deathX,p.deathY,{
            palette:deadPalette,
            alpha:deathSkeletonPulseAlpha(p,gameNow)
          });
        }
      }else{
        drawPlayer(p,gameNow,roster);
      }
    }

    // Overlays are screen-space UI. They remain fixed while only the world
    // below them pans and zooms.
    restoreGameplayScreenTransform();
    DuskLighting?.render(ctx,roster,gameplayCamera,realNow,gameNow);
    if(paused) overlay(
      'PAUSE','','',Math.max(0,realNow-pauseStartedAt),'pause'
    );
    if(gameOver){
      const pulseTime=gameOverStartedAt?gameOverVisualElapsed(realNow):0;
      overlay('GAME OVER','','',pulseTime);
    }
    if(levelCompletionTransition){
      overlay(`LEVEL ${level} CLEARED`,'','',gameNow,'levelComplete');
    }
    if(levelEntryBuffer&&!awaitingPlayerSelection&&!gameOver)
      overlay('LEVEL SELECT',levelEntryBuffer,'TYPE SECOND DIGIT',realNow);
  }


  let CompetitiveLeaderSpriteCache=new WeakMap();
  let competitiveLeaderAtlas=null;
  let competitiveLeaderSparkLayout=null;
  let competitiveLeaderSpriteCount=0;
  const COMPETITIVE_LEADER_SPARK_FRAMES=16;
  const COMPETITIVE_LEADER_SPARK_COLUMNS=8;
  const COMPETITIVE_LEADER_SPARK_FRAME_MS=72;
  const COMPETITIVE_LEADER_SPARK_OVERLAY_SCALE=1.85;
  const CompetitiveLeaderSparkPalettes=Object.freeze([
    '#6dff72','#66baff','#ffd85d'
  ]);

  function buildCompetitiveLeaderSprite(sprite,palette){
    if(!spriteReady(sprite)) return null;
    const region=sprite.__atlasRegion;
    const sourceWidth=region?.[3]||sprite.naturalWidth||80;
    const sourceHeight=region?.[4]||sprite.naturalHeight||80;
    // Keep a narrow native-resolution border around the artwork. HD therefore
    // uses a 4px contour margin and 4K uses 8px, with no reduced intermediate
    // surface at either quality setting.
    const padding=Math.max(
      4,Math.ceil(Math.max(sourceWidth,sourceHeight)*.05)
    );
    const width=sourceWidth+padding*2;
    const height=sourceHeight+padding*2;

    const mask=document.createElement('canvas');
    mask.width=width;
    mask.height=height;
    const maskContext=mask.getContext('2d',{alpha:true});
    maskContext.imageSmoothingEnabled=false;
    if(!drawSpriteImage(
      maskContext,sprite,padding,padding,sourceWidth,sourceHeight
    )) return null;

    const contourLayer=document.createElement('canvas');
    contourLayer.width=width;
    contourLayer.height=height;
    const contourContext=contourLayer.getContext('2d',{alpha:true});
    contourContext.imageSmoothingEnabled=false;

    // Build the soft exterior bloom once. Removing the original alpha mask
    // leaves light only outside the artwork, never a geometric ring around it.
    contourContext.save();
    contourContext.globalAlpha=.54;
    contourContext.shadowColor=palette;
    contourContext.shadowBlur=Math.max(2,sourceWidth*.03);
    contourContext.drawImage(mask,0,0);
    contourContext.restore();
    contourContext.globalCompositeOperation='destination-out';
    contourContext.drawImage(mask,0,0);

    // A one-pixel HD / two-pixel 4K dilation gives the glow a precise edge
    // that follows every helmet, face and mouth silhouette in the atlas.
    const ring=document.createElement('canvas');
    ring.width=width;
    ring.height=height;
    const ringContext=ring.getContext('2d',{alpha:true});
    ringContext.imageSmoothingEnabled=false;
    const radius=Math.max(1,Math.round(sourceWidth/80));
    for(let offsetY=-radius;offsetY<=radius;offsetY++){
      for(let offsetX=-radius;offsetX<=radius;offsetX++){
        if(offsetX===0&&offsetY===0) continue;
        ringContext.drawImage(mask,offsetX,offsetY);
      }
    }
    ringContext.globalCompositeOperation='source-in';
    ringContext.fillStyle=palette;
    ringContext.fillRect(0,0,width,height);
    ringContext.globalCompositeOperation='destination-out';
    ringContext.drawImage(mask,0,0);

    contourContext.globalCompositeOperation='source-over';
    contourContext.globalAlpha=.72;
    contourContext.drawImage(ring,0,0);

    // Bake both the fine exterior silhouette and the subtle Charged Core lift
    // into one replacement sprite. A leader consequently costs exactly one
    // ordinary drawImage call, just like a player without the effect.
    const bakedSprite=document.createElement('canvas');
    bakedSprite.width=width;
    bakedSprite.height=height;
    const bakedContext=bakedSprite.getContext('2d',{alpha:true});
    bakedContext.imageSmoothingEnabled=false;
    bakedContext.globalAlpha=.74;
    bakedContext.drawImage(contourLayer,0,0);
    bakedContext.globalAlpha=1;
    if(!drawSpriteImage(
      bakedContext,sprite,padding,padding,sourceWidth,sourceHeight
    )) return null;
    bakedContext.globalCompositeOperation='screen';
    // A pronounced baked lift makes score ownership legible at zoom-out while
    // remaining free at runtime: this screen pass runs only during atlas build.
    bakedContext.globalAlpha=.42;
    drawSpriteImage(
      bakedContext,sprite,padding,padding,sourceWidth,sourceHeight
    );

    // Release all three construction surfaces immediately. Runtime retains
    // only the single finished replacement sprite.
    mask.width=mask.height=1;
    ring.width=ring.height=1;
    contourLayer.width=contourLayer.height=1;
    return Object.freeze({
      bakedSprite,
      sourceWidth:width,
      sourceHeight:height,
      nativeWidth:sourceWidth,
      nativeHeight:sourceHeight,
      paddingX:TILE*padding/sourceWidth,
      paddingY:TILE*padding/sourceHeight
    });
  }

  function buildCompetitiveLeaderSparkStamp(palette,nativeSize){
    const size=Math.max(16,Math.round(nativeSize*.24));
    const center=size/2;
    const stamp=document.createElement('canvas');
    stamp.width=stamp.height=size;
    const stampContext=stamp.getContext('2d',{alpha:true});
    const glow=stampContext.createRadialGradient(
      center,center,1,center,center,center
    );
    glow.addColorStop(0,'rgba(255,255,255,.98)');
    glow.addColorStop(.18,palette+'e8');
    glow.addColorStop(.56,palette+'68');
    glow.addColorStop(1,palette+'00');
    stampContext.fillStyle=glow;
    stampContext.fillRect(0,0,size,size);
    stampContext.fillStyle='rgba(255,255,242,.96)';
    stampContext.beginPath();
    stampContext.moveTo(center,size*.22);
    stampContext.lineTo(size*.58,center);
    stampContext.lineTo(center,size*.78);
    stampContext.lineTo(size*.42,center);
    stampContext.closePath();
    stampContext.fill();
    return stamp;
  }

  function paintCompetitiveLeaderSparkFrames(
    atlasContext,atlasOffsetY,cellSize
  ){
    const rowsPerPalette=Math.ceil(
      COMPETITIVE_LEADER_SPARK_FRAMES/COMPETITIVE_LEADER_SPARK_COLUMNS
    );
    for(let paletteIndex=0;
      paletteIndex<CompetitiveLeaderSparkPalettes.length;
      paletteIndex++
    ){
      const stamp=buildCompetitiveLeaderSparkStamp(
        CompetitiveLeaderSparkPalettes[paletteIndex],cellSize
      );
      for(let frame=0;frame<COMPETITIVE_LEADER_SPARK_FRAMES;frame++){
        const frameColumn=frame%COMPETITIVE_LEADER_SPARK_COLUMNS;
        const frameRow=Math.floor(frame/COMPETITIVE_LEADER_SPARK_COLUMNS);
        const cellX=frameColumn*cellSize;
        const cellY=atlasOffsetY+
          (paletteIndex*rowsPerPalette+frameRow)*cellSize;
        const progress=frame/COMPETITIVE_LEADER_SPARK_FRAMES;

        // Two finished wisps trail a canonical right-facing player. Gameplay
        // only turns this single cached overlay to one of four directions.
        for(let sparkIndex=0;sparkIndex<2;sparkIndex++){
          const life=(progress+sparkIndex*.53)%1;
          const strength=Math.sin(Math.PI*life);
          const centerX=cellX+cellSize*(.295-life*.29);
          const side=sparkIndex===0?-1:1;
          const centerY=cellY+cellSize*(
            .5+side*(.16+.04*Math.sin(
              progress*Math.PI*2+sparkIndex*2.4
            ))
          );
          const size=cellSize*(.10+(1-life)*.052);
          atlasContext.globalAlpha=.58*strength*strength;
          atlasContext.drawImage(
            stamp,centerX-size/2,centerY-size/2,size,size
          );
        }
      }
      stamp.width=stamp.height=1;
    }
    atlasContext.globalAlpha=1;
    return rowsPerPalette;
  }

  function prepareCompetitiveLeaderSpriteCache(){
    const nextCache=new WeakMap();
    const seen=new WeakSet();
    const prepared=[];
    for(const [paletteName,paletteGroup] of Object.entries(
      CharacterSpriteGroups.player||{}
    )){
      const palette=paletteName==='ai'
        ?'#ffd85d'
        :paletteName==='p2'?'#66baff':'#6dff72';
      for(const lightGroup of Object.values(paletteGroup||{})){
        for(const sprite of Object.values(lightGroup||{})){
          if(!sprite||seen.has(sprite)) continue;
          seen.add(sprite);
          const leaderSprite=buildCompetitiveLeaderSprite(sprite,palette);
          if(!leaderSprite) continue;
          prepared.push({sprite,leaderSprite});
        }
      }
    }

    // Pack all seven poses, both light states and all three palettes into one
    // generated atlas. Direction or mouth changes therefore keep using the
    // same source texture instead of touching a new canvas for every pose.
    const columns=7;
    const cellWidth=prepared.reduce(
      (largest,item)=>Math.max(largest,item.leaderSprite.sourceWidth),1
    );
    const cellHeight=prepared.reduce(
      (largest,item)=>Math.max(largest,item.leaderSprite.sourceHeight),1
    );
    const rows=Math.max(1,Math.ceil(prepared.length/columns));
    const leaderAtlasWidth=columns*cellWidth;
    const leaderAtlasHeight=rows*cellHeight;
    const sparkCellSize=prepared.reduce(
      (largest,item)=>Math.max(largest,item.leaderSprite.nativeWidth),
      activeDisplayQuality==='4K'?160:80
    );
    const sparkRowsPerPalette=Math.ceil(
      COMPETITIVE_LEADER_SPARK_FRAMES/COMPETITIVE_LEADER_SPARK_COLUMNS
    );
    const sparkAtlasWidth=COMPETITIVE_LEADER_SPARK_COLUMNS*sparkCellSize;
    const sparkAtlasHeight=sparkRowsPerPalette*
      CompetitiveLeaderSparkPalettes.length*sparkCellSize;
    const nextAtlas=document.createElement('canvas');
    nextAtlas.width=Math.max(leaderAtlasWidth,sparkAtlasWidth);
    nextAtlas.height=leaderAtlasHeight+sparkAtlasHeight;
    const atlasContext=nextAtlas.getContext('2d',{alpha:true});
    atlasContext.imageSmoothingEnabled=false;

    prepared.forEach((item,index)=>{
      const column=index%columns;
      const row=Math.floor(index/columns);
      const sourceX=column*cellWidth;
      const sourceY=row*cellHeight;
      const {leaderSprite,sprite}=item;
      atlasContext.drawImage(leaderSprite.bakedSprite,sourceX,sourceY);
      nextCache.set(sprite,Object.freeze({
        atlas:nextAtlas,
        sourceX,sourceY,
        sourceWidth:leaderSprite.sourceWidth,
        sourceHeight:leaderSprite.sourceHeight,
        paddingX:leaderSprite.paddingX,
        paddingY:leaderSprite.paddingY
      }));
      leaderSprite.bakedSprite.width=leaderSprite.bakedSprite.height=1;
    });

    paintCompetitiveLeaderSparkFrames(
      atlasContext,leaderAtlasHeight,sparkCellSize
    );

    if(competitiveLeaderAtlas){
      competitiveLeaderAtlas.width=competitiveLeaderAtlas.height=1;
    }
    competitiveLeaderAtlas=nextAtlas;
    competitiveLeaderSparkLayout=Object.freeze({
      atlasOffsetY:leaderAtlasHeight,
      cellSize:sparkCellSize,
      rowsPerPalette:sparkRowsPerPalette
    });
    CompetitiveLeaderSpriteCache=nextCache;
    competitiveLeaderSpriteCount=prepared.length;
  }

  function competitiveLeaderSprite(sprite,palette){
    let leaderSprite=CompetitiveLeaderSpriteCache.get(sprite);
    if(leaderSprite) return leaderSprite;
    leaderSprite=buildCompetitiveLeaderSprite(sprite,palette);
    if(leaderSprite){
      leaderSprite=Object.freeze({
        atlas:leaderSprite.bakedSprite,
        sourceX:0,sourceY:0,
        sourceWidth:leaderSprite.sourceWidth,
        sourceHeight:leaderSprite.sourceHeight,
        paddingX:leaderSprite.paddingX,
        paddingY:leaderSprite.paddingY
      });
      CompetitiveLeaderSpriteCache.set(sprite,leaderSprite);
      competitiveLeaderSpriteCount++;
    }
    return leaderSprite;
  }

  function competitiveLeaderVisual(p,roster,sprite){
    // Score ownership survives a knockout. A dead leader is not drawn, so the
    // contour vanishes during death and returns on the same player's respawn
    // if nobody has overtaken the score meanwhile.
    // The same cached outfit marks the score leader in CO-OP, but grants
    // no contact advantage. Combat permissions remain exclusively VS rules.
    if((!isCompetitiveMode()&&!isCooperativeMode())||!isUniqueLeader(p,roster)) return null;

    const color=playerEffectColor(p);
    return competitiveLeaderSprite(sprite,color);
  }

  function drawCompetitiveLeaderSparks(p,visual,now){
    const layout=competitiveLeaderSparkLayout;
    if(!competitiveLeaderAtlas||!layout) return false;
    const frame=(
      Math.floor(now/COMPETITIVE_LEADER_SPARK_FRAME_MS)+p.id*5
    )%COMPETITIVE_LEADER_SPARK_FRAMES;
    const paletteIndex=p.isAI?2:p.id===2?1:0;
    const sourceX=(frame%COMPETITIVE_LEADER_SPARK_COLUMNS)*layout.cellSize;
    const sourceY=layout.atlasOffsetY+(
      paletteIndex*layout.rowsPerPalette+
      Math.floor(frame/COMPETITIVE_LEADER_SPARK_COLUMNS)
    )*layout.cellSize;
    const overlaySize=TILE*COMPETITIVE_LEADER_SPARK_OVERLAY_SCALE;
    const overlayOffset=(overlaySize-TILE)/2;
    const destinationX=visual.x*TILE-overlayOffset;
    const destinationY=visual.y*TILE-overlayOffset;
    const directionX=p.dir?.x??1;
    const directionY=p.dir?.y??0;
    const directionAngle=directionX<0
      ?Math.PI
      :directionY>0
        ?Math.PI/2
        :directionY<0
          ?-Math.PI/2
          :0;
    if(directionAngle){
      const centerX=(visual.x+.5)*TILE;
      const centerY=(visual.y+.5)*TILE;
      ctx.save();
      ctx.translate(centerX,centerY);
      ctx.rotate(directionAngle);
      ctx.translate(-centerX,-centerY);
    }
    ctx.drawImage(
      competitiveLeaderAtlas,
      sourceX,sourceY,layout.cellSize,layout.cellSize,
      destinationX,destinationY,
      overlaySize,overlaySize
    );
    if(directionAngle) ctx.restore();
    return true;
  }

  function drawPlayer(p,now=gameTimeNow(),roster=allPlayers(),{
    forceVisible=false,
    leader=null,
    levelFlash=null
  }={}){
    const renderVisual=p.renderVisualPosition||
      (p.renderVisualPosition={x:0,y:0});
    const visual=playerVisualPosition(p,now,renderVisual);
    if(!forceVisible&&!gameplaySpriteVisible(visual.x,visual.y)) return;
    const sprite=originalCharacterSprite('Head',p.dir,p.mouthOpen);

    const bright=
      (levelFlash??(!!levelCompletionTransition&&!p.dead&&!p.eliminated&&p.lives>0&&
        levelCompletionFlashBright(now))) ||
      (isPowerMode(p,now) && p.powerFlashBright) ||
      (isSpawnProtected(p,now) && p.spawnFlashBright);
    const palette=p.isAI?'ai':p.id===2?'p2':'p1';
    const light=bright?'bright':'normal';
    const cached=CharacterSpriteGroups.player?.[palette]?.[light]?.[
      sprite.__hvSpriteName
    ]||sprite;
    const tiltDegrees=Number.isFinite(p.controllerTiltDegrees)
      ? p.controllerTiltDegrees
      : 0;
    const rotated=Math.abs(tiltDegrees)>0.001;
    if(rotated){
      const centerX=(visual.x+0.5)*TILE;
      const centerY=(visual.y+0.5)*TILE;
      ctx.save();
      ctx.translate(centerX,centerY);
      ctx.rotate(tiltDegrees*Math.PI/180);
      ctx.translate(-centerX,-centerY);
    }
    const leaderVisual=leader
      ? competitiveLeaderSprite(cached,playerEffectColor(p))
      : leader===false?null:competitiveLeaderVisual(p,roster,cached);
    const drawn=leaderVisual
      ? (
        drawCompetitiveLeaderSparks(p,visual,now),
        ctx.drawImage(
          leaderVisual.atlas,
          leaderVisual.sourceX,leaderVisual.sourceY,
          leaderVisual.sourceWidth,leaderVisual.sourceHeight,
          visual.x*TILE-leaderVisual.paddingX,
          visual.y*TILE-leaderVisual.paddingY,
          TILE+leaderVisual.paddingX*2,
          TILE+leaderVisual.paddingY*2
        ),true
      )
      : drawOriginalSprite(cached,visual.x,visual.y);
    if(!drawn){
      // Safe fallback while an atlas image is still loading.
      const base=p.isAI?'#ffd85d':p.id===2?'#66baff':'#fff';
      rect(visual.x*TILE+5,visual.y*TILE+5,10,10,bright?'#ffff7a':base);
    }
    if(rotated) ctx.restore();
  }

  globalThis.__mazeBitersCompetitiveEffectDiagnostics=()=>({
    style:'Baked Leader Sprite + Directional Cached Spark Wisps',
    cachedLeaderSprites:competitiveLeaderSpriteCount,
    runtimeBlendMode:'source-over',
    runtimeScreenPasses:0,
    runtimeDrawsPerLeader:2,
    extraRuntimeDraws:1,
    animated:true,
    sparkFrames:COMPETITIVE_LEADER_SPARK_FRAMES,
    sparkRuntimeTransforms:1,
    sparkMotion:'two trailing wisps behind movement direction',
    sparkOverlayScale:COMPETITIVE_LEADER_SPARK_OVERLAY_SCALE,
    sharedSparkTexture:true,
    chargedCoreStrength:.42,
    generatedAtlas:competitiveLeaderAtlas
      ?`${competitiveLeaderAtlas.width}x${competitiveLeaderAtlas.height}`
      :'not-ready',
    leaderId:uniqueLeaderId(allPlayers()),
    competitive:isCompetitiveMode(),
    cooperative:isCooperativeMode()
  });

  globalThis.__mazeBitersAnalogTiltDiagnostics=()=>allPlayers()
    .filter(candidate=>!candidate.isAI)
    .map(candidate=>({
      player:candidate.id,
      degrees:+(candidate.controllerTiltDegrees||0).toFixed(3),
      target:+(candidate.controllerTiltTargetDegrees||0).toFixed(3)
    }));

  globalThis.__mazeBitersAutonomousTiltDiagnostics=()=>({
    ai:allPlayers().filter(candidate=>candidate.isAI).map(candidate=>({
      player:candidate.id,
      degrees:+(candidate.controllerTiltDegrees||0).toFixed(3),
      target:+(candidate.controllerTiltTargetDegrees||0).toFixed(3),
      cellsBeforeTurn:candidate.autonomousTiltPlanCache?.cellsBeforeTurn??null
    })),
    hunters:hunters.map((hunter,index)=>({
      hunter:index+1,
      degrees:+(hunter.controllerTiltDegrees||0).toFixed(3),
      target:+(hunter.controllerTiltTargetDegrees||0).toFixed(3),
      cellsBeforeTurn:hunter.autonomousTiltPlanCache?.cellsBeforeTurn??null
    }))
  });

  function strongPulseAlpha(t=performance.now()){
    return 0.55+0.45*Math.sin(t/INTERFACE_PULSE_DIVISOR_MS);
  }

  function pausePulseAlpha(elapsed=0){
    // Use the exact GAME OVER impulse, including its speed and full
    // 0 -> 100% -> 0 range. PAUSE has no automatic end, so the same
    // three-impulse presentation repeats until play is resumed.
    const sequenceDuration=Math.max(1,GAME_OVER_PULSE_DURATION_MS);
    return gameOverPulseAlpha(Math.max(0,elapsed)%sequenceDuration);
  }

  function gameOverPulseAlpha(elapsed=0){
    const safeElapsed=Math.max(0,elapsed);
    if(safeElapsed>=GAME_OVER_PULSE_DURATION_MS) return 0;
    const phase=(safeElapsed%INTERFACE_PULSE_CYCLE_MS)/
      INTERFACE_PULSE_CYCLE_MS;
    // Same cycle duration as SELECT GAME, but with full significance: every
    // impulse begins invisible, reaches 100%, and completely disappears.
    const wave=Math.sin(Math.PI*phase);
    return wave*wave;
  }

  function uniqueLeaderId(roster=allPlayers()){
    if(roster.length<2) return 0;
    let highest=-Infinity;
    let leaderId=0;
    let tied=false;
    for(const candidate of roster){
      if(candidate.score>highest){
        highest=candidate.score;
        leaderId=candidate.id;
        tied=false;
      }else if(candidate.score===highest){
        tied=true;
      }
    }
    return tied?0:leaderId;
  }

  function isUniqueLeader(p,roster=allPlayers()){
    return !!p&&uniqueLeaderId(roster)===p.id;
  }

  function hasAnimatedLeaderScore(roster=allPlayers()){
    if(roster.length<2) return false;
    const firstScore=roster[0].score;
    let highest=firstScore;
    let highestCount=0;
    for(const candidate of roster){
      if(candidate.score>highest){
        highest=candidate.score;
        highestCount=1;
      }else if(candidate.score===highest){
        highestCount++;
      }
    }
    return highestCount===1;
  }

  function scorePulseAlpha(p,roster=allPlayers(),t=performance.now()){
    if(hudSpotlightActive(
      p?.scoreSpotlightStartedAt,HUD_SPOTLIGHT_SCORE_MS,t
    )) return 1;
    if(!isUniqueLeader(p,roster)) return 1;
    // Keep the PAUSE/SELECT GAME rhythm, with an explicit 20%..100% range.
    return 0.6+0.4*Math.sin(t/310);
  }

  const LIFE_PULSE_CYCLE_MS=Math.PI*2*310;
  const LIFE_PULSE_DURATION_MS=LIFE_PULSE_CYCLE_MS*3;

  function lifePulseAlpha(p,t=performance.now()){
    if(!p||!Number.isFinite(p.lifePulseStartedAt)) return 1;
    const elapsed=t-p.lifePulseStartedAt;
    if(elapsed<0||elapsed>=LIFE_PULSE_DURATION_MS) return 1;
    // Exactly three complete 20%..100% pulses, using the leader-score rhythm.
    return 0.6+0.4*Math.cos(elapsed/310);
  }

  function hasActiveLifePulse(roster=allPlayers(),t=performance.now()){
    return roster.some(p=>Number.isFinite(p.lifePulseStartedAt)&&
      t>=p.lifePulseStartedAt&&
      t-p.lifePulseStartedAt<LIFE_PULSE_DURATION_MS
    );
  }

  function deathSkeletonPulseAlpha(p,t=gameTimeNow()){
    const elapsed=Math.max(0,t-(p.deathStartedAt||t));
    return threeVisiblePulseAlpha(elapsed);
  }

  function drawDeathSpriteAt(x,y,{
    palette='p1',
    alpha=1
  }={}){
    const deadSprite=ModernDeathSprites.DeadHeadHD ||
      CharacterSpriteGroups.dead?.[palette]?.DeadHead ||
      OriginalSprites.DeadHead;
    const previousAlpha=ctx.globalAlpha;
    ctx.globalAlpha=previousAlpha*alpha;
    const drawn=drawOriginalSprite(deadSprite,x,y);
    if(!drawn){
      const deadColor=palette==='ai'?'#ffd85d':
        palette==='p2'?'#78bfff':'#ddd';
      rect(x*TILE+4,y*TILE+4,12,12,deadColor);
    }
    ctx.globalAlpha=previousAlpha;
    return drawn;
  }

  function threeVisiblePulseAlpha(elapsed=0){
    const safeElapsed=Math.max(0,elapsed);
    if(safeElapsed>=DEATH_VISUAL_PULSE_DURATION_GAME_MS) return 0;
    const phase=(safeElapsed%DEATH_VISUAL_PULSE_CYCLE_GAME_MS)/
      DEATH_VISUAL_PULSE_CYCLE_GAME_MS;
    // A complete 0 -> 1 -> 0 impulse. Three cycles therefore mean exactly
    // three visible peaks, followed by a guaranteed fully invisible ending.
    const wave=Math.sin(Math.PI*phase);
    return wave*wave;
  }

  function gameOverVisualElapsed(realTime=performance.now()){
    if(!gameOverStartedAt) return 0;
    // GAME OVER is a fixed UI animation like SELECT GAME, not gameplay time.
    return Math.max(0,realTime-gameOverStartedAt);
  }

  const TITLE_GLYPHS={
    M:['10001','11011','10101','10101','10001','10001','10001'],
    A:['01110','10001','10001','11111','10001','10001','10001'],
    Z:['11111','00001','00010','00100','01000','10000','11111'],
    E:['11111','10000','10000','11110','10000','10000','11111'],
    I:['11111','00100','00100','00100','00100','00100','11111'],
    T:['11111','00100','00100','00100','00100','00100','00100'],
    R:['11110','10001','10001','11110','10100','10010','10001'],
    S:['01111','10000','10000','01110','00001','00001','11110']
  };

  // Dusk Arcade: geometry is shared by painting, pointer input and lighting.
  // Shortcut numbers are presentation only; persisted game-mode IDs stay put.
  const TITLE_MODE_HIT_AREAS=[
    {key:1,mode:1,x:64,y:218,w:424,h:62,label:'1 SOLO',hint:'ONE PLAYER - HUNT EVERY SNAKE',humans:1},
    {key:2,mode:5,x:64,y:292,w:424,h:62,label:'2 DUO CO-OP',hint:'TWO PLAYERS - NO FRIENDLY BITES',humans:2},
    {key:3,mode:2,x:64,y:366,w:424,h:62,label:'3 DUO VS',hint:'TWO PLAYERS - HUNT EACH OTHER',humans:2},
    {key:4,mode:3,x:536,y:218,w:424,h:62,label:'4 SOLO VS AI',hint:'ONE PLAYER AND AI - OUTSCORE YOUR RIVAL',humans:1},
    {key:5,mode:4,x:536,y:292,w:424,h:62,label:'5 DUO VS AI',hint:'TWO PLAYERS AND AI - THREE WAY DUEL',humans:2},
    {key:6,mode:0,x:536,y:366,w:424,h:62,label:'6 AI ONLY',hint:'WATCH THE AI - LEARN THE HUNT',humans:0}
  ];
  TITLE_MODE_HIT_AREAS.forEach(entry=>{
    entry.labelRuns=titleMenuLabelRuns(entry.label);
  });
  // Use the same identities and directional atlas frames as gameplay.
  // Head3 faces the viewer; Head2/Head4 face right/left. Never mirror artwork.
  const TITLE_MODE_PORTRAITS=Object.freeze(Object.fromEntries([
    [1,[['p1','Head3']]],
    [5,[['p1','Head3'],['p2','Head3']]],
    [2,[['p1','Head2'],['p2','Head4']]],
    [3,[['p1','Head2'],['ai','Head4']]],
    [4,[['p1','Head2'],['ai','Head3'],['p2','Head4']]],
    [0,[['ai','Head3']]]
  ].map(([mode,portraits])=>[mode,Object.freeze(portraits.map(
    ([palette,pose])=>Object.freeze({palette,pose})
  ))])));

  // These title choices feed the central runtime balance and score formulas.
  const TITLE_DIFFICULTIES=['PICNIC','EASY','MEDIUM','HARD','BRUTAL'];
  const TITLE_DIFFICULTY_MULTIPLIERS=[0.50,0.75,1.00,1.25,1.50];
  const TITLE_SPEEDS=['SNAIL','SLOW','MEDIUM','FAST','EXTREME'];
  // MEDIUM is exactly the established game speed. The selected factor now
  // drives one central simulation clock, so movement, Power Mode, shields,
  // eggs, spawning, pressure and AI development all preserve their relation
  // to the number of cells travelled.
  const TITLE_SPEED_MULTIPLIERS=[0.60,0.80,1.00,1.25,1.60];
  const TITLE_HIGH_SCORES_HIT_AREA={x:276,y:516,w:224,h:48};
  const TITLE_QUALITY_HIT_AREA={x:520,y:618,w:212,h:68};
  const TITLE_HOW_TO_PLAY_HIT_AREA={x:524,y:516,w:224,h:48};
  const TITLE_DIFFICULTY_HIT_AREA={x:64,y:618,w:212,h:68};
  const TITLE_SPEED_HIT_AREA={x:292,y:618,w:212,h:68};
  const TITLE_MUSIC_HIT_AREA={x:748,y:618,w:212,h:68};
  const TITLE_LIGHT_AREAS=Object.freeze({
    ...Object.fromEntries(TITLE_MODE_HIT_AREAS.map(area=>[`mode:${area.mode}`,area])),
    highScores:TITLE_HIGH_SCORES_HIT_AREA,quality:TITLE_QUALITY_HIT_AREA,
    howToPlay:TITLE_HOW_TO_PLAY_HIT_AREA,difficulty:TITLE_DIFFICULTY_HIT_AREA,
    speed:TITLE_SPEED_HIT_AREA,music:TITLE_MUSIC_HIT_AREA
  });
  const TITLE_CHOICE_SPOTLIGHT_MS=620;
  const TITLE_CHOICE_PULSE_MS=420;
  const TITLE_CHOICE_PULSE_MIN_ALPHA=0.45;
  const TITLE_MODE_CONFIRM_PULSE_MS=300;
  const TITLE_MODE_CONFIRM_PULSE_COUNT=3;
  const TITLE_MODE_CONFIRM_MS=
    TITLE_MODE_CONFIRM_PULSE_MS*TITLE_MODE_CONFIRM_PULSE_COUNT;
  const TITLE_SCORE_SPOTLIGHT_MAX_SHOTS=32;
  let titleDifficultyIndex=2;
  let titleSpeedIndex=2;
  // The title quality selector swaps the complete native atlas and canvas
  // profile; false is the memory-efficient HD default and true selects 4K.
  let titleQualityHiRes=false;
  const titleChoiceSpotlightStartedAt=Object.create(null);
  const titleScoreSpotlightShots=[];
  let activeTitleConfirmationChoice=null;
  let pendingTitleMode=null;
  let titleFocusedChoice='mode:1';
  const HIGH_SCORE_PAGE_SIZE=10;
  const HIGH_SCORE_NAME_MAX_LENGTH=HighScoreService?.MAX_NAME_LENGTH||10;
  const HIGH_SCORE_NAME_CHARACTERS="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.@?";
  const HIGH_SCORE_KEYBOARD_COLUMNS=8;
  const HIGH_SCORE_KEYBOARD_ROWS=5;
  const HIGH_SCORE_ACTIONS=['DELETE','SAVE','SKIP'];
  // Fixed geometry shared by the light pass and the native text pass. No
  // per-frame layout arrays are needed while a name or record is selected.
  const HIGH_SCORE_NAME_AREAS=Object.freeze(Array.from({length:HIGH_SCORE_NAME_MAX_LENGTH},(_,index)=>
    Object.freeze({key:`slot:${index}`,x:236+index*56,y:218,w:48,h:48})));
  const HIGH_SCORE_KEY_AREAS=Object.freeze(Array.from(
    {length:HIGH_SCORE_NAME_CHARACTERS.length},(_,index)=>Object.freeze({
      key:`key:${index}`,x:196+(index%8)*80,y:308+Math.floor(index/8)*48,w:72,h:40
    })));
  const HIGH_SCORE_ENTRY_ACTION_AREAS=Object.freeze([180,412,644].map((x,index)=>
    Object.freeze({key:`action:${index}`,x,y:570,w:200,h:54})));
  const HIGH_SCORE_BOARD_ACTION_AREAS=Object.freeze([176,412,648].map((x,index)=>
    Object.freeze({key:`board:${index}`,label:['PREV','BACK','NEXT'][index],x,y:650,w:200,h:54})));
  const HIGH_SCORE_ROW_LIGHT_AREAS=Object.freeze(Array.from({length:HIGH_SCORE_PAGE_SIZE},(_,index)=>
    Object.freeze({x:68,y:199+index*39,w:888,h:34})));
  const HIGH_SCORE_NAME_LIGHT_CLIP=Object.freeze({x:226,y:208,w:572,h:68});
  const HIGH_SCORE_KEY_LIGHT_CLIP=Object.freeze({x:168,y:294,w:688,h:342});
  const HIGH_SCORE_BOARD_LIGHT_CLIP=Object.freeze({x:164,y:638,w:696,h:78});
  const TUTORIAL_PAGES=Object.freeze([
    Object.freeze({
      title:'MOVE AND TURN',
      lines:Object.freeze([
        'MOVE WITH WASD  ARROWS  D PAD OR TOUCH',
        'PRESS OR HOLD THE NEXT TURN BEFORE THE JUNCTION',
        'YOU TURN AS SOON AS THAT CORRIDOR OPENS'
      ])
    }),
    Object.freeze({
      title:'BITE AND SPLIT',
      lines:Object.freeze([
        'TAIL BITE REMOVES ONE SEGMENT',
        'BODY BITE SPLITS ONE SNAKE INTO TWO',
        'THE NEW HALF GETS A HEAD  WATCH BOTH SIDES'
      ])
    }),
    Object.freeze({
      title:'HEAD ON RICOCHET',
      lines:Object.freeze([
        'A FRONTAL HEAD OR HUNTER STARTS A RICOCHET',
        'YOU REBOUND ALONG THE SAME STRAIGHT TUNNEL',
        'HOLD A SAFE TURN TO TAKE THE FIRST OPEN EXIT'
      ])
    }),
    Object.freeze({
      title:'FRUIT AND POWER MODE',
      lines:Object.freeze([
        'FRUIT STARTS SEVEN SECONDS OF SPEED AND POWER',
        'DANGEROUS HEADS AND HUNTERS BECOME EDIBLE',
        'SCORPIONS ARE SAFE  EGGS HATCH FAST HUNTERS'
      ])
    }),
    Object.freeze({
      title:'DANGER AND ESCAPE',
      lines:Object.freeze([
        'IF YOU WAIT  SNAKES HAVE TIME TO CLOSE IN',
        'A DEAD END LEAVES NO SIDE TURN WHEN A SNAKE FOLLOWS',
        'KEEP MOVING  CHECK THE EXIT BEFORE YOU ENTER'
      ])
    }),
    Object.freeze({
      title:'DUEL PRIORITY',
      lines:Object.freeze([
        'SPAWN SHIELD BEATS POWER  POWER BEATS SCORE',
        'WITH EQUAL POWER THE HIGHER SCORE CAN EAT THE RIVAL',
        'EQUAL POWER AND SCORE OR TWO SHIELDS BLOCK CONTACT'
      ])
    }),
    Object.freeze({
      title:'CLEAR THE MAZE',
      lines:Object.freeze([
        'REMOVE EVERY SNAKE TO CLEAR THE LEVEL',
        'A SINGLE HEAD IS SAFE TO BITE FROM THE SIDE OR BEHIND',
        'KEEP YOUR LIVES  BUILD YOUR SCORE  REACH THE TOP 25'
      ])
    })
  ]);
  const TUTORIAL_ACTION_AREAS=Object.freeze([
    Object.freeze({x:176,y:650,w:200,h:54}),
    Object.freeze({x:412,y:650,w:200,h:54}),
    Object.freeze({x:648,y:650,w:200,h:54})
  ]);
  let titleScreenMode='menu';
  let pendingHighScoreCandidate=null;
  let highScoreNameDraft='';
  let highScoreKeyboardRow=0;
  let highScoreKeyboardColumn=0;
  let highScoreKeyboardNavigationActive=false;
  let highScoreLeaderboardPage=0;
  let highScoreLeaderboardAction=1;
  let highScoreEntryStatus='';
  let highlightedHighScoreId='';
  let highScoreSubmitting=false;
  let highScoreScreenEnteredAt=performance.now();
  let highScoreSnapshot=HighScoreService?.list?.()||[];
  let tutorialPage=0;
  let tutorialAction=1;
  let tutorialScreenEnteredAt=performance.now();

  function currentHighScores(){
    // Persistence owns defensive copies; rendering reuses one immutable
    // snapshot so a 120 Hz title screen never clones the Top 25 per frame.
    return highScoreSnapshot;
  }

  function highScorePageCount(){
    return Math.max(1,Math.ceil(currentHighScores().length/HIGH_SCORE_PAGE_SIZE));
  }

  function syncHighScoreNameInput(){
    if(highScoreNameInput&&highScoreNameInput.value!==highScoreNameDraft)
      highScoreNameInput.value=highScoreNameDraft;
  }

  function setHighScoreNameDraft(value){
    const sanitized=HighScoreService?.sanitizeName?.(value)??
      String(value??'').toUpperCase().replace(/[^A-Z0-9'@,.?\-]/g,'').slice(0,HIGH_SCORE_NAME_MAX_LENGTH);
    highScoreNameDraft=sanitized.slice(0,HIGH_SCORE_NAME_MAX_LENGTH);
    highScoreEntryStatus='';
    syncHighScoreNameInput();
  }

  function appendHighScoreNameCharacter(character){
    if(highScoreNameDraft.length>=HIGH_SCORE_NAME_MAX_LENGTH) return false;
    const before=highScoreNameDraft;
    setHighScoreNameDraft(before+character);
    if(highScoreNameDraft===before) return false;
    playSound('Tick');
    return true;
  }

  function deleteHighScoreNameCharacter(){
    if(!highScoreNameDraft.length) return false;
    setHighScoreNameDraft(highScoreNameDraft.slice(0,-1));
    playSound('Tick');
    return true;
  }

  function enterHighScoreLeaderboard({highlightId='',status=''}={}){
    const leavingNameEntry=titleScreenMode==='entry';
    titleScreenMode='leaderboard';
    if(leavingNameEntry) MenuMusic.start();
    pendingHighScoreCandidate=null;
    completedRunHighScoreCandidate=null;
    highlightedHighScoreId=highlightId;
    highScoreEntryStatus=status;
    highScoreLeaderboardAction=1;
    const highlightedIndex=currentHighScores().findIndex(entry=>entry.id===highlightId);
    highScoreLeaderboardPage=highlightedIndex>=0
      ?Math.floor(highlightedIndex/HIGH_SCORE_PAGE_SIZE)
      :0;
    highScoreScreenEnteredAt=performance.now();
    highScoreNameInput?.blur?.();
  }

  function openHighScoreLeaderboard(){
    cancelTitleConfirmationEffect();
    enterHighScoreLeaderboard();
  }

  function returnToMainTitleMenu(){
    const leavingHighScores=titleScreenMode==='entry'||titleScreenMode==='leaderboard';
    titleScreenMode='menu';
    if(leavingHighScores) MenuMusic.start();
    pendingHighScoreCandidate=null;
    completedRunHighScoreCandidate=null;
    highlightedHighScoreId='';
    highScoreEntryStatus='';
    highScoreScreenEnteredAt=performance.now();
    highScoreNameInput?.blur?.();
    canvas.setAttribute('aria-label','Maze Biters game and title menu');
    if(screenReaderStatus) screenReaderStatus.textContent='Maze Biters title menu';
  }

  function announceTutorialPage(){
    const page=TUTORIAL_PAGES[tutorialPage];
    const announcement=[
      `How to Play. Page ${tutorialPage+1} of ${TUTORIAL_PAGES.length}.`,
      page.title+'.',...page.lines,
      'Use arrow keys and Space, or D pad and A. Escape or gamepad B exits.'
    ].join(' ');
    canvas.setAttribute('aria-label',announcement);
    if(screenReaderStatus) screenReaderStatus.textContent=announcement;
  }

  function openHowToPlay(){
    cancelTitleConfirmationEffect();
    titleScreenMode='tutorial';
    tutorialPage=0;
    tutorialAction=1;
    tutorialScreenEnteredAt=performance.now();
    highScoreScreenEnteredAt=tutorialScreenEnteredAt;
    highScoreNameInput?.blur?.();
    announceTutorialPage();
  }

  function tutorialActionEnabled(index){
    return index!==0||tutorialPage>0;
  }

  function changeTutorialPage(delta){
    const next=Math.max(
      0,Math.min(TUTORIAL_PAGES.length-1,tutorialPage+delta)
    );
    if(next===tutorialPage) return false;
    tutorialPage=next;
    tutorialAction=1;
    tutorialScreenEnteredAt=performance.now();
    announceTutorialPage();
    playSound('Tick');
    return true;
  }

  function moveTutorialFocus(direction){
    if(direction==='up') return changeTutorialPage(-1);
    if(direction==='down') return changeTutorialPage(1);
    if(direction!=='left'&&direction!=='right') return false;
    const step=direction==='left'?-1:1;
    let next=tutorialAction;
    do next=(next+step+TUTORIAL_ACTION_AREAS.length)%
      TUTORIAL_ACTION_AREAS.length;
    while(!tutorialActionEnabled(next)&&next!==tutorialAction);
    if(next===tutorialAction) return false;
    tutorialAction=next;
    playSound('Tick');
    return true;
  }

  function activateTutorialFocus(t=performance.now()){
    if(tutorialAction===0) return changeTutorialPage(-1);
    if(tutorialAction===2){
      returnToMainTitleMenu();
      playSound('SnakeSELECT&Appear@');
      return true;
    }
    if(tutorialPage<TUTORIAL_PAGES.length-1)
      return changeTutorialPage(1);

    // READY offers a direct path into the simplest mode while EXIT remains
    // permanently visible. Reuse the normal title confirmation and music fade.
    returnToMainTitleMenu();
    focusTitleChoice('mode:1',{t});
    selectTitleMode(1,t);
    return true;
  }

  function skipHighScoreEntry(){
    if(highScoreSubmitting) return false;
    // No placeholder is ever created. Skipping an empty name is identical to
    // the run never entering the leaderboard.
    returnToMainTitleMenu();
    playSound('SnakeSELECT&Appear@');
    return true;
  }

  async function saveHighScoreEntry(){
    if(highScoreSubmitting||!pendingHighScoreCandidate) return false;
    const name=HighScoreService?.sanitizeName?.(highScoreNameDraft)||'';
    if(!name){
      highScoreEntryStatus='ENTER A NAME OR CHOOSE SKIP';
      playSound('Tick');
      return false;
    }
    highScoreSubmitting=true;
    highScoreEntryStatus='SAVING';
    playSound('SnakeSELECT&Appear@');
    try{
      const saved=await HighScoreService.submit({
        ...pendingHighScoreCandidate,name
      });
      const status=saved.pendingRemote
        ?'SAVED LOCALLY'
        :HighScoreService.isShared()
          ?'SAVED ONLINE'
          :'SAVED ON THIS DEVICE';
      enterHighScoreLeaderboard({highlightId:saved.id,status});
    }catch(error){
      highScoreEntryStatus=error?.code==='EMPTY_NAME'
        ?'ENTER A NAME OR CHOOSE SKIP'
        :error?.code==='NOT_QUALIFIED'
          ?'TOP 25 CHANGED - CHOOSE SKIP'
          :'COULD NOT SAVE - TRY AGAIN';
      console.error('High-score save failed:',error);
    }finally{
      highScoreSubmitting=false;
    }
    return true;
  }

  function moveHighScoreEntryFocus(direction){
    if(highScoreSubmitting) return false;
    highScoreKeyboardNavigationActive=true;
    if(highScoreKeyboardRow<HIGH_SCORE_KEYBOARD_ROWS){
      if(direction==='left') highScoreKeyboardColumn=(highScoreKeyboardColumn+7)%8;
      else if(direction==='right') highScoreKeyboardColumn=(highScoreKeyboardColumn+1)%8;
      else if(direction==='up') highScoreKeyboardRow=(highScoreKeyboardRow+4)%5;
      else if(direction==='down'){
        if(highScoreKeyboardRow<4) highScoreKeyboardRow++;
        else{
          highScoreKeyboardRow=5;
          highScoreKeyboardColumn=highScoreKeyboardColumn<3?0:
            highScoreKeyboardColumn<6?1:2;
        }
      }else return false;
    }else{
      if(direction==='left') highScoreKeyboardColumn=(highScoreKeyboardColumn+2)%3;
      else if(direction==='right') highScoreKeyboardColumn=(highScoreKeyboardColumn+1)%3;
      else if(direction==='up'){
        highScoreKeyboardRow=4;
        highScoreKeyboardColumn=[1,4,6][highScoreKeyboardColumn]||1;
      }else return false;
    }
    playSound('Tick');
    return true;
  }

  function activateHighScoreEntryFocus(){
    if(highScoreKeyboardRow<HIGH_SCORE_KEYBOARD_ROWS){
      const index=highScoreKeyboardRow*HIGH_SCORE_KEYBOARD_COLUMNS+
        highScoreKeyboardColumn;
      return appendHighScoreNameCharacter(HIGH_SCORE_NAME_CHARACTERS[index]);
    }
    const action=HIGH_SCORE_ACTIONS[highScoreKeyboardColumn];
    if(action==='DELETE') return deleteHighScoreNameCharacter();
    if(action==='SAVE') return saveHighScoreEntry();
    if(action==='SKIP') return skipHighScoreEntry();
    return false;
  }

  function moveHighScoreLeaderboardFocus(direction){
    if(direction!=='left'&&direction!=='right') return false;
    highScoreLeaderboardAction=(highScoreLeaderboardAction+
      (direction==='left'?2:1))%3;
    playSound('Tick');
    return true;
  }

  function changeHighScorePage(delta){
    const pages=highScorePageCount();
    if(pages<=1) return false;
    highScoreLeaderboardPage=(highScoreLeaderboardPage+delta+pages)%pages;
    highlightedHighScoreId='';
    playSound('Tick');
    return true;
  }

  function activateHighScoreLeaderboardFocus(){
    if(highScoreLeaderboardAction===0) return changeHighScorePage(-1);
    if(highScoreLeaderboardAction===2) return changeHighScorePage(1);
    returnToMainTitleMenu();
    playSound('SnakeSELECT&Appear@');
    return true;
  }

  function handleTitleBack(){
    if(titleScreenMode==='entry') return skipHighScoreEntry();
    if(titleScreenMode==='leaderboard'){
      returnToMainTitleMenu();
      playSound('SnakeSELECT&Appear@');
      return true;
    }
    if(titleScreenMode==='tutorial'){
      returnToMainTitleMenu();
      playSound('SnakeSELECT&Appear@');
      return true;
    }
    return false;
  }

  // A predictable spatial map is easier to use with a D-pad than a flat list.
  // It follows the two visual columns and then continues into the lower menu.
  const TITLE_FOCUS_GRAPH={
    'mode:1':{right:'mode:3',down:'mode:5'},
    'mode:5':{up:'mode:1',right:'mode:4',down:'mode:2'},
    'mode:2':{up:'mode:5',right:'mode:0',down:'highScores'},
    'mode:3':{left:'mode:1',down:'mode:4'},
    'mode:4':{up:'mode:3',left:'mode:5',down:'mode:0'},
    'mode:0':{up:'mode:4',left:'mode:2',down:'howToPlay'},
    highScores:{up:'mode:2',right:'howToPlay',down:'difficulty'},
    howToPlay:{up:'mode:0',left:'highScores',down:'quality'},
    difficulty:{up:'highScores',right:'speed'},
    speed:{up:'highScores',left:'difficulty',right:'quality'},
    quality:{up:'howToPlay',left:'speed',right:'music'},
    music:{up:'howToPlay',left:'quality'}
  };

  function focusTitleChoice(choice,{sound=false,t=performance.now()}={}){
    if(!choice||choice===titleFocusedChoice) return false;
    titleFocusedChoice=choice;
    if(sound) playSound('Tick');
    return true;
  }

  function moveTitleFocus(direction){
    if(!awaitingPlayerSelection||pendingTitleMode!==null) return false;
    if(titleScreenMode==='entry') return moveHighScoreEntryFocus(direction);
    if(titleScreenMode==='leaderboard')
      return moveHighScoreLeaderboardFocus(direction);
    if(titleScreenMode==='tutorial') return moveTutorialFocus(direction);
    const next=TITLE_FOCUS_GRAPH[titleFocusedChoice]?.[direction];
    if(!next) return false;
    titleFocusedChoice=next;
    playSound('Tick');
    return true;
  }

  function activateTitleFocus(t=performance.now()){
    if(!awaitingPlayerSelection||pendingTitleMode!==null) return false;
    if(titleScreenMode==='entry') return activateHighScoreEntryFocus();
    if(titleScreenMode==='leaderboard')
      return activateHighScoreLeaderboardFocus();
    if(titleScreenMode==='tutorial') return activateTutorialFocus(t);
    if(titleFocusedChoice.startsWith('mode:')){
      selectTitleMode(Number(titleFocusedChoice.slice(5)),t);
      return true;
    }
    if(titleFocusedChoice==='speed'){
      cycleTitleSpeed(t);
      return true;
    }
    if(titleFocusedChoice==='music'){
      cycleTitleMusic(t);
      return true;
    }
    if(titleFocusedChoice==='difficulty'){
      cycleTitleDifficulty(t);
      return true;
    }
    if(titleFocusedChoice==='quality'){
      toggleTitleQuality(t);
      return true;
    }
    if(titleFocusedChoice==='highScores'){
      confirmTitleChoice(titleFocusedChoice,t);
      openHighScoreLeaderboard();
      return true;
    }
    if(titleFocusedChoice==='howToPlay'){
      confirmTitleChoice(titleFocusedChoice,t);
      openHowToPlay();
      return true;
    }
    return false;
  }

  function isSimplePulseTitleChoice(choice){
    // Only the changing setting value blinks. The score multiplier remains
    // fully visible while its own one-way spotlight explains the new value.
    return choice==='speed'||choice==='difficulty'||choice==='music';
  }

  function isExclusiveTitleConfirmationChoice(choice){
    return choice==='highScores'||choice==='quality'||choice==='howToPlay'||
      String(choice).startsWith('mode:');
  }

  function cancelTitleConfirmationEffect(){
    if(activeTitleConfirmationChoice!==null){
      delete titleChoiceSpotlightStartedAt[activeTitleConfirmationChoice];
      activeTitleConfirmationChoice=null;
    }
    // Also discard stale entries left by an older build or by a very fast
    // pointer sequence. At most one navigation/START animation may own the
    // shared spotlight buffers at any time.
    for(const choice of Object.keys(titleChoiceSpotlightStartedAt)){
      if(isExclusiveTitleConfirmationChoice(choice))
        delete titleChoiceSpotlightStartedAt[choice];
    }
  }

  function cancelTitleSettingEffects(except=null){
    if(except!=='speed') delete titleChoiceSpotlightStartedAt.speed;
    if(except!=='difficulty') delete titleChoiceSpotlightStartedAt.difficulty;
    if(except!=='music') delete titleChoiceSpotlightStartedAt.music;
  }

  function pruneTitleScoreSpotlightShots(t=performance.now()){
    let expired=0;
    while(expired<titleScoreSpotlightShots.length&&
      t-titleScoreSpotlightShots[expired]>=TITLE_CHOICE_SPOTLIGHT_MS) expired++;
    if(expired>0) titleScoreSpotlightShots.splice(0,expired);
  }

  function addTitleScoreSpotlightShot(t=performance.now()){
    pruneTitleScoreSpotlightShots(t);
    titleScoreSpotlightShots.push(t);
    if(titleScoreSpotlightShots.length>TITLE_SCORE_SPOTLIGHT_MAX_SHOTS){
      titleScoreSpotlightShots.splice(
        0,titleScoreSpotlightShots.length-TITLE_SCORE_SPOTLIGHT_MAX_SHOTS
      );
    }
  }

  function titleChoiceSpotlightProgress(choice,t=performance.now()){
    // SPEED, DIFFICULTY and MUSIC use the original single blink. Other title
    // choices, including the score multiplier, retain their spotlight.
    if(isSimplePulseTitleChoice(choice)) return -1;
    // SCORE owns a queue of independent shots and is rendered in one batch.
    if(choice==='scoreMultiplier') return -1;
    if(isExclusiveTitleConfirmationChoice(choice)&&
       choice!==activeTitleConfirmationChoice) return -1;
    const elapsed=t-(titleChoiceSpotlightStartedAt[choice]??-Infinity);
    if(elapsed<0||elapsed>=TITLE_CHOICE_SPOTLIGHT_MS) return -1;
    return elapsed/TITLE_CHOICE_SPOTLIGHT_MS;
  }

  function titleChoicePulseAlpha(choice,t=performance.now()){
    const elapsed=t-(titleChoiceSpotlightStartedAt[choice]??-Infinity);
    if(isSimplePulseTitleChoice(choice)){
      if(elapsed<0||elapsed>=TITLE_CHOICE_PULSE_MS) return 1;
      const phase=elapsed/TITLE_CHOICE_PULSE_MS;
      // A full cosine wave has zero velocity at full brightness and at the
      // midpoint, creating a gentle fade-out/fade-in without a sharp cusp.
      const fade=0.5+0.5*Math.cos(Math.PI*2*phase);
      return TITLE_CHOICE_PULSE_MIN_ALPHA+
        (1-TITLE_CHOICE_PULSE_MIN_ALPHA)*fade;
    }
    // Other ordinary title choices remain steady and receive a spotlight.
    // Only a mode that is actually starting the game keeps three pulses.
    if(!choice.startsWith('mode:')||pendingTitleMode===null||
       choice!==`mode:${pendingTitleMode}`||
       choice!==activeTitleConfirmationChoice) return 1;
    if(elapsed<0||elapsed>=TITLE_MODE_CONFIRM_MS) return 1;
    const phase=(elapsed%TITLE_MODE_CONFIRM_PULSE_MS)/TITLE_MODE_CONFIRM_PULSE_MS;
    // Preserve the exact established pulse length and count, but replace the
    // hard-looking visible/hidden switch with a gentle cosine fade at both
    // edges of every pulse.
    const softPulse=0.5+0.5*Math.cos(Math.PI*2*phase);
    return 0.15+0.85*softPulse;
  }

  function spotlightTitleChoice(choice,t=performance.now(),soundName='Tick'){
    titleChoiceSpotlightStartedAt[choice]=t;
    if(soundName) playSound(soundName);
  }

  function confirmTitleChoice(choice,t=performance.now()){
    // HIGH SCORES, QUALITY and START are navigation-class actions. A new one
    // atomically replaces the previous visual state instead of allowing two
    // spotlights/focus pulses to overlap during rapid QA clicking.
    cancelTitleConfirmationEffect();
    cancelTitleSettingEffects();
    activeTitleConfirmationChoice=choice;
    spotlightTitleChoice(choice,t,'SnakeSELECT&Appear@');
  }

  function titleQualityValue(){
    return titleQualityHiRes?'4K':'HD';
  }


  function applyDisplayQualityProfile(quality,t=performance.now()){
    const normalized=quality==='4K'?'4K':'HD';
    if(normalized===activeDisplayQuality) return false;

    if(normalized==='4K') ensureTitleHiResConceptSources();

    activeDisplayQuality=normalized;
    activeDisplayProfile=DISPLAY_QUALITY_PROFILES[normalized];
    GAME_RENDER_SCALE=activeDisplayProfile.renderScale;
    GAME_BACKING_WIDTH=activeDisplayProfile.mazeBacking[0];
    GAME_BACKING_HEIGHT=activeDisplayProfile.mazeBacking[1];
    MAZE_CACHE_RENDER_SCALE=activeDisplayProfile.mazeCacheRenderScale;
    MAZE_CACHE_BACKING_WIDTH=activeDisplayProfile.mazeCacheBacking[0];
    MAZE_CACHE_BACKING_HEIGHT=activeDisplayProfile.mazeCacheBacking[1];
    TITLE_BACKING_WIDTH=activeDisplayProfile.totalBacking[0];
    TITLE_BACKING_HEIGHT=activeDisplayProfile.totalBacking[1];
    HUD_RENDER_SCALE=activeDisplayProfile.renderScale;
    HUD_BACKING_WIDTH=activeDisplayProfile.hudBacking[0];
    HUD_BACKING_HEIGHT=activeDisplayProfile.hudBacking[1];
    titleCanvasScaleX=TITLE_BACKING_WIDTH/TITLE_LOGICAL_WIDTH;
    titleCanvasScaleY=TITLE_BACKING_HEIGHT/TITLE_LOGICAL_HEIGHT;
    globalThis.MAZE_BITERS_DISPLAY_PROFILE=activeDisplayProfile;

    // Swap the complete, native-resolution atlas family as one operation.
    // Region arrays keep their identity so all existing sprite references stay
    // valid, while their source rectangles change to the selected cell size.
    setRenderAtlasQuality(normalized);
    FontRenderCache=new WeakMap();
    MazeRenderCache.clear();
    ConceptMazeRenderCache.clear();

    // Resize every backing surface that depends on the selected profile. A
    // canvas resize also clears its old GPU allocation and drawing state.
    titleFrameCanvas.width=TITLE_BACKING_WIDTH;
    titleFrameCanvas.height=TITLE_BACKING_HEIGHT;
    titleFrameContext.setTransform(1,0,0,1,0,0);
    titleFrameContext.imageSmoothingEnabled=false;

    bitmapHud.width=HUD_BACKING_WIDTH;
    bitmapHud.height=HUD_BACKING_HEIGHT;
    bctx.setTransform(HUD_RENDER_SCALE,0,0,HUD_RENDER_SCALE,0,0);
    bctx.imageSmoothingEnabled=false;

    hudCosmicBackgroundCanvas.width=HUD_BACKING_WIDTH;
    hudCosmicBackgroundCanvas.height=HUD_BACKING_HEIGHT;
    prepareHudCosmicBackground();
    configureHudSpotlightBuffers();

    mazeLayerCanvas.width=MAZE_CACHE_BACKING_WIDTH;
    mazeLayerCanvas.height=MAZE_CACHE_BACKING_HEIGHT;
    mazeLayerContext.setTransform(
      MAZE_CACHE_RENDER_SCALE,0,0,MAZE_CACHE_RENDER_SCALE,0,0
    );
    mazeLayerContext.imageSmoothingEnabled=false;
    mazeLayerRevision=-1;
    mazeLayerThemeName='';

    titleLogoLayerCanvas.width=TITLE_BACKING_WIDTH;
    titleLogoLayerCanvas.height=Math.ceil(240*titleCanvasScaleY);
    titleLogoLayerContext.setTransform(
      titleCanvasScaleX,0,0,titleCanvasScaleY,0,0
    );
    titleLogoLayerContext.imageSmoothingEnabled=false;
    titleLogoLayerReady=false;

    titleInterfaceLayerCanvas.width=TITLE_BACKING_WIDTH;
    titleInterfaceLayerCanvas.height=TITLE_BACKING_HEIGHT;
    titleInterfaceLayerContext.setTransform(
      titleCanvasScaleX,0,0,titleCanvasScaleY,0,0
    );
    titleInterfaceLayerContext.imageSmoothingEnabled=false;
    titleInterfaceLayerReady=false;
    titlePlayerEmblemsReady=false;
    titleSnakeDecorationsReady=false;
    titleHighScoreMaskReady=false;

    firstZoomPreheated=false;
    fittedGameViewportWidth=0;
    hudDirty=true;

    if(awaitingPlayerSelection) configureTitleCanvasResolution();
    else restoreGameplayCanvasResolution();
    scheduleGameViewportFit();

    // Decode the new atlas family before rebuilding the caches. The current
    // completed menu frame remains visible until the next complete frame is
    // ready, avoiding a black or half-rendered quality-transition frame.
    prepareAllRenderCaches().then(()=>{
      if(activeDisplayQuality!==normalized) return;
      // A title frame may have painted fallback walls while these caches
      // were rebuilding, even when a previously decoded atlas was ready.
      // Invalidate both raster layers after preparation, not only at resize.
      mazeLayerRevision=-1;
      titleInterfaceLayerReady=false;
      prepareTitleLogoLayer();
      prepareTitleInterfaceLayer(titleScreenMode==='menu'?'menu':
        titleScreenMode==='leaderboard'?'leaderboard':
        titleScreenMode==='entry'?'entry':'tutorial');
      prepareHighScoreButtonCache();
      preheatFirstGameplayZoom();
      if(awaitingPlayerSelection) drawBufferedTitleFrame(t);
      else{
        mazeLayerRevision=-1;
        hudDirty=true;
      }
    }).catch(error=>{
      console.error('Display-quality cache preparation failed.',error);
    });
    return true;
  }

  function toggleTitleQuality(t=performance.now()){
    titleQualityHiRes=!titleQualityHiRes;
    applyDisplayQualityProfile(titleQualityHiRes?'4K':'HD',t);
    confirmTitleChoice('quality',t);
  }

  function cycleTitleSpeed(t=performance.now()){
    cancelTitleConfirmationEffect();
    cancelTitleSettingEffects('speed');
    // Commit in the same input event: the freshly selected value is visible
    // immediately, while its soft pulse and every SCORE salvo shot start now.
    titleSpeedIndex=(titleSpeedIndex+1)%TITLE_SPEEDS.length;
    titleChoiceSpotlightStartedAt.speed=t;
    playSound('Tick');
    addTitleScoreSpotlightShot(t);
  }

  function cycleTitleMusic(t=performance.now()){
    cancelTitleConfirmationEffect();
    cancelTitleSettingEffects('music');
    const option=MusicSettings.cycle();
    titleChoiceSpotlightStartedAt.music=t;
    playSound('Tick');
    if(screenReaderStatus) screenReaderStatus.textContent=`Music ${option.label}. Sound effects unchanged.`;
  }

  function cycleTitleDifficulty(t=performance.now()){
    cancelTitleConfirmationEffect();
    cancelTitleSettingEffects('difficulty');
    titleDifficultyIndex=(titleDifficultyIndex+1)%TITLE_DIFFICULTIES.length;
    titleChoiceSpotlightStartedAt.difficulty=t;
    playSound('Tick');
    addTitleScoreSpotlightShot(t);
  }

  function selectTitleMode(mode,t=performance.now()){
    if(pendingTitleMode!==null) return;
    MenuMusic.start();
    pendingTitleMode=mode;
    GameplayMusic.resetRun();
    GameplayMusic.reserveLevel(1);
    confirmTitleChoice(`mode:${mode}`,t);
    // The menu track reaches silence exactly as the third confirmation pulse
    // restores the button, then level one starts without an empty audio gap.
    MenuMusic.stop(TITLE_MODE_CONFIRM_MS/1000);
    setTimeout(()=>{
      if(pendingTitleMode!==mode||!awaitingPlayerSelection) return;
      pendingTitleMode=null;
      startNewGame(mode);
    },TITLE_MODE_CONFIRM_MS);
  }

  // The title wordmark is a full-resolution, prebuilt cosmic layer. It
  // keeps the exact 744x84 logical footprint of the former tube logo while
  // adding a darker metal shell, neon core, cyan specular edge and subtle
  // technology seams. Nothing in this logo is rebuilt during animation.
  TITLE_GLYPHS.B=[
    '11110','10001','10001','11110','10001','10001','11110'
  ];

  const COSMIC_WORDMARK_PALETTES={
    green:{
      glow:'#2aff9a',
      shell:'#03150f',
      edge:'#0c5036',
      stops:[
        [0,'#0b6d43'],[.18,'#52ffad'],[.42,'#16d978'],
        [.68,'#0e8e55'],[1,'#07472f']
      ],
      core:'#39f596',
      highlight:'rgba(204,255,239,.88)',
      seam:'rgba(0,10,12,.82)'
    },
    accent:{
      glow:'#ff5fc9',
      shell:'#180817',
      edge:'#63234d',
      stops:[
        [0,'#f5ee72'],[.24,'#ffd64e'],[.49,'#ff8a68'],
        [.74,'#ff4f9c'],[1,'#8e2f91']
      ],
      core:'#ffcf66',
      highlight:'rgba(255,246,219,.9)',
      seam:'rgba(20,3,22,.82)'
    }
  };

  function collectCosmicGlyphGeometry(character,x,y,cell){
    const pattern=TITLE_GLYPHS[character];
    if(!pattern) return null;
    const rows=pattern.length;
    const cols=pattern[0].length;
    const center=(cx,cy)=>({x:x+(cx+.5)*cell,y:y+(cy+.5)*cell});
    const active=(cx,cy)=>
      cy>=0&&cy<rows&&cx>=0&&cx<cols&&pattern[cy][cx]==='1';
    const segments=[];
    const degree=new Map();
    const key=(cx,cy)=>`${cx},${cy}`;
    const connect=(ax,ay,bx,by)=>{
      const from=center(ax,ay);
      const to=center(bx,by);
      segments.push({from,to});
      degree.set(key(ax,ay),(degree.get(key(ax,ay))||0)+1);
      degree.set(key(bx,by),(degree.get(key(bx,by))||0)+1);
    };
    for(let cy=0;cy<rows;cy++){
      for(let cx=0;cx<cols;cx++){
        if(!active(cx,cy)) continue;
        if(active(cx+1,cy)) connect(cx,cy,cx+1,cy);
        if(active(cx,cy+1)) connect(cx,cy,cx,cy+1);
        if(active(cx+1,cy+1)&&!active(cx+1,cy)&&!active(cx,cy+1))
          connect(cx,cy,cx+1,cy+1);
        if(active(cx-1,cy+1)&&!active(cx-1,cy)&&!active(cx,cy+1))
          connect(cx,cy,cx-1,cy+1);
      }
    }
    const terminals=[];
    for(let cy=0;cy<rows;cy++){
      for(let cx=0;cx<cols;cx++){
        if(active(cx,cy)&&(degree.get(key(cx,cy))||0)<=1)
          terminals.push(center(cx,cy));
      }
    }
    return {segments,terminals,x,y,w:cols*cell,h:rows*cell};
  }

  function appendCosmicSegments(targetContext,segments){
    targetContext.beginPath();
    for(const segment of segments){
      targetContext.moveTo(segment.from.x,segment.from.y);
      targetContext.lineTo(segment.to.x,segment.to.y);
    }
  }

  function drawCosmicGlyph(character,x,y,cell,palette,targetContext){
    const geometry=collectCosmicGlyphGeometry(character,x,y,cell);
    if(!geometry) return;
    const {segments,terminals,h}=geometry;
    const metal=targetContext.createLinearGradient(0,y,0,y+h);
    palette.stops.forEach(([stop,color])=>metal.addColorStop(stop,color));

    targetContext.save();
    targetContext.lineCap='square';
    targetContext.lineJoin='bevel';

    targetContext.shadowColor=palette.glow;
    targetContext.shadowBlur=cell*.62;
    targetContext.strokeStyle=palette.shell;
    targetContext.lineWidth=cell*.88;
    appendCosmicSegments(targetContext,segments);
    targetContext.stroke();

    targetContext.shadowBlur=0;
    targetContext.strokeStyle=palette.edge;
    targetContext.lineWidth=cell*.72;
    appendCosmicSegments(targetContext,segments);
    targetContext.stroke();

    targetContext.strokeStyle=metal;
    targetContext.lineWidth=cell*.58;
    appendCosmicSegments(targetContext,segments);
    targetContext.stroke();

    targetContext.strokeStyle=palette.core;
    targetContext.lineWidth=cell*.27;
    appendCosmicSegments(targetContext,segments);
    targetContext.stroke();

    targetContext.strokeStyle=palette.highlight;
    targetContext.lineWidth=Math.max(.75,cell*.075);
    appendCosmicSegments(targetContext,segments);
    targetContext.stroke();

    // Angular endpoint plates make the lettering read like a purpose-built
    // space interface instead of a rounded neon tube.
    for(const point of terminals){
      targetContext.save();
      targetContext.translate(point.x,point.y);
      targetContext.rotate(Math.PI/4);
      targetContext.fillStyle=palette.shell;
      targetContext.fillRect(-cell*.31,-cell*.31,cell*.62,cell*.62);
      targetContext.fillStyle=metal;
      targetContext.fillRect(-cell*.22,-cell*.22,cell*.44,cell*.44);
      targetContext.fillStyle=palette.highlight;
      targetContext.fillRect(-cell*.06,-cell*.16,cell*.12,cell*.32);
      targetContext.restore();
    }

    // Sparse cross-seams preserve the technological stencil character without
    // fragmenting the letters. Their positions are deterministic and cached.
    const seed=character.charCodeAt(0);
    segments.forEach((segment,index)=>{
      if((index+seed)%5!==1) return;
      const mx=(segment.from.x+segment.to.x)/2;
      const my=(segment.from.y+segment.to.y)/2;
      const dx=segment.to.x-segment.from.x;
      const dy=segment.to.y-segment.from.y;
      const length=Math.hypot(dx,dy)||1;
      const px=-dy/length;
      const py=dx/length;
      targetContext.strokeStyle=palette.seam;
      targetContext.lineWidth=Math.max(1,cell*.11);
      targetContext.beginPath();
      targetContext.moveTo(mx-px*cell*.32,my-py*cell*.32);
      targetContext.lineTo(mx+px*cell*.32,my+py*cell*.32);
      targetContext.stroke();
      targetContext.strokeStyle='rgba(154,255,229,.42)';
      targetContext.lineWidth=Math.max(.55,cell*.045);
      targetContext.beginPath();
      targetContext.moveTo(mx-px*cell*.24+1,my-py*cell*.24+1);
      targetContext.lineTo(mx+px*cell*.24+1,my+py*cell*.24+1);
      targetContext.stroke();
    });
    targetContext.restore();
  }

  const titleLogoLayerCanvas=document.createElement('canvas');
  titleLogoLayerCanvas.width=TITLE_BACKING_WIDTH;
  // The wordmark is a native vector-style layer for the exact 2880-wide
  // backing canvas. It is not an enlarged bitmap from the previous canvas.
  titleLogoLayerCanvas.height=Math.ceil(240*titleCanvasScaleY);
  const titleLogoLayerContext=titleLogoLayerCanvas.getContext('2d');
  titleLogoLayerContext.setTransform(
    titleCanvasScaleX,0,0,titleCanvasScaleY,0,0
  );
  titleLogoLayerContext.imageSmoothingEnabled=false;
  let titleLogoLayerReady=false;

  function prepareTitleLogoLayer(){
    if(titleLogoLayerReady) return;
    // Build the wordmark directly at the new resolution. Scaling its vector
    // geometry, rather than a finished bitmap, keeps the metal edges, seams
    // and neon core sharp and avoids a stretched title image.
    const cell=10.5*TITLE_LAYOUT_SCALE;
    const advance=cell*6;
    const wordGap=cell*2;
    const totalWidth=advance*(4+1+5)+wordGap;
    let x=(TITLE_LOGICAL_WIDTH-totalWidth)/2;
    const y=72*TITLE_LAYOUT_SCALE;
    titleLogoLayerContext.clearRect(0,0,TITLE_LOGICAL_WIDTH,240);

    for(const character of 'MAZE'){
      drawCosmicGlyph(
        character,x,y,cell,COSMIC_WORDMARK_PALETTES.green,
        titleLogoLayerContext
      );
      x+=advance;
    }
    x+=wordGap;
    drawCosmicGlyph(
      'B',x,y,cell,COSMIC_WORDMARK_PALETTES.accent,
      titleLogoLayerContext
    );
    x+=advance;
    for(const character of 'ITERS'){
      drawCosmicGlyph(
        character,x,y,cell,COSMIC_WORDMARK_PALETTES.green,
        titleLogoLayerContext
      );
      x+=advance;
    }
    titleLogoLayerReady=true;
  }

  function drawMazeBitersLogo(t){
    prepareTitleLogoLayer();
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    // Keep the large hi-res wordmark optically stable. The surrounding menu
    // already has deliberate pulses and spotlights; breathing the complete
    // logo made the high-contrast edges look like display flicker.
    ctx.globalAlpha=1;
    ctx.drawImage(titleLogoLayerCanvas,0,0);
    ctx.restore();
  }

  function drawTitleSprite(sprite,x,y,filter='none',size=32){
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    ctx.filter=filter;
    const drawn=drawSpriteImage(ctx,sprite,x,y,size,size);
    ctx.restore();
    return drawn;
  }




  // The menu emblems never move. Cache them in the existing title backdrop
  // instead of sampling the 4096x2304 character atlas for every animation
  // frame. This keeps the animated bitmap text stable on slower browsers.
  let titlePlayerEmblemsReady=false;

  function prepareTitlePlayerEmblems(targetContext){
    if(titlePlayerEmblemsReady) return true;
    const playerOne=CharacterSpriteGroups.player?.p1?.normal?.Head3
      || OriginalSprites.Head3;
    const playerTwo=CharacterSpriteGroups.player?.p2?.normal?.Head3
      || OriginalSprites.Head3;
    if(![playerOne,playerTwo].every(spriteReady)) return false;
    drawSpriteImage(targetContext,playerOne,48,146,32,32);
    drawSpriteImage(targetContext,playerTwo,944,146,32,32);
    titlePlayerEmblemsReady=true;
    return true;
  }

  // Add the two decorative snakes directly to the existing static title
  // interface layer. This preserves one 2048x1536 composite per menu frame;
  // no second full-screen canvas is copied while the bitmap text pulses.
  let titleSnakeDecorationsReady=false;

  function drawTitleSnakeAtlasSprite(targetContext,sprite,x,y){
    return drawSpriteImage(targetContext,sprite,x,y,32,32);
  }

  function prepareTitleSnakeDecorations(targetContext){
    if(titleSnakeDecorationsReady) return true;
    const blue={
      head:ModernSnakeSprites.modernHead2_Blue,
      horizontal:ModernSnakeSprites.modernBody2_Blue,
      turn:ModernSnakeSprites.modernTurn2_Blue,
      tail:ModernSnakeSprites.modernTail3_Blue
    };
    const purple={
      head:ModernSnakeSprites.modernHead4_Pink,
      horizontal:ModernSnakeSprites.modernBody4_Pink,
      turn:ModernSnakeSprites.modernTurn1_Pink,
      tail:ModernSnakeSprites.modernTail3_Pink
    };
    const required=[...Object.values(blue),...Object.values(purple)];
    if(!required.every(spriteReady)) return false;

    // Keep the original short two-part bend and lower it as one unit. The
    // tail now starts clear of the unchanged P1 icon; no extra body tile is used.
    drawTitleSnakeAtlasSprite(targetContext,blue.tail,48,192);
    drawTitleSnakeAtlasSprite(targetContext,blue.turn,48,224);
    for(let x=80;x<=240;x+=32){
      drawTitleSnakeAtlasSprite(targetContext,blue.horizontal,x,224);
    }
    drawTitleSnakeAtlasSprite(targetContext,blue.head,272,224);

    // Mirror the same short lowered bend under the unchanged P2 icon.
    drawTitleSnakeAtlasSprite(targetContext,purple.tail,944,192);
    drawTitleSnakeAtlasSprite(targetContext,purple.turn,944,224);
    for(let x=912;x>=752;x-=32){
      drawTitleSnakeAtlasSprite(targetContext,purple.horizontal,x,224);
    }
    drawTitleSnakeAtlasSprite(targetContext,purple.head,720,224);

    titleSnakeDecorationsReady=true;
    return true;
  }

  // Static title chrome is prepared once at the exact 2880x2160 backing
  // resolution. The locked 120 Hz title loop only composites this cached layer
  // and draws the small animated accents and text above it.
  const titleInterfaceLayerCanvas=document.createElement('canvas');
  titleInterfaceLayerCanvas.width=TITLE_BACKING_WIDTH;
  titleInterfaceLayerCanvas.height=TITLE_BACKING_HEIGHT;
  const titleInterfaceLayerContext=titleInterfaceLayerCanvas.getContext('2d');
  titleInterfaceLayerContext.setTransform(
    TITLE_BACKING_WIDTH/TITLE_LOGICAL_WIDTH,0,0,
    TITLE_BACKING_HEIGHT/TITLE_LOGICAL_HEIGHT,0,0
  );
  titleInterfaceLayerContext.imageSmoothingEnabled=false;
  let titleInterfaceLayerReady=false;
  let titleInterfaceLayerScreen='';
  let titleInterfaceMazeRevision=-1;
  let titleInterfaceMazeTheme='';
  let titleInterfaceLeaderboardRows=-1;



  // A cached, glyph-clipped spotlight first crosses the complete HIGH SCORE
  // row on SELECT GAME pulse five, then repeats every eight pulse cycles.
  // Each appearance travels left-to-right and returns right-to-left. The strip is baked
  // once; active frames only reposition and mask it, avoiding per-frame
  // gradients, font reconstruction and temporary canvas allocation.
  let titleHighScoreCacheKey='';
  let titleHighScoreRunsCache=[];
  let titleHighScoreTextScale=2;
  function titleHighScoreRuns(){
    const leader=currentHighScores()[0]||null;
    const score=String(leader?.score||0).padStart(5,'0');
    const name=leader?.name||'NOBODY';
    const key=`${score}:${name}`;
    if(key!==titleHighScoreCacheKey){
      titleHighScoreCacheKey=key;
      titleHighScoreRunsCache=[
        {text:`HIGH SCORE - ${score} `},
        {text:name,fontSprites:RedFontSprites}
      ];
      // The menu draws this row at half size. Only shrink extreme totals
      // that would clip its original 1024-wide sweep mask, not ordinary names.
      const characters=titleHighScoreRunsCache.reduce((sum,run)=>sum+run.text.length,0);
      titleHighScoreTextScale=Math.min(TITLE_HIGH_SCORE_SCALE,TITLE_LEGACY_LOGICAL_WIDTH/(characters*16));
      titleHighScoreMaskReady=false;
    }
    return titleHighScoreRunsCache;
  }
  const TITLE_HIGH_SCORE_Y=36;
  const TITLE_HIGH_SCORE_SCALE=2;
  function titleHighScoreBounds(heading=null){
    const width=heading!==null?heading.length*16*TITLE_HIGH_SCORE_SCALE:titleHighScoreRuns().reduce(
      (total,run)=>total+run.text.length*16*titleHighScoreTextScale,0
    );
    const left=(TITLE_LEGACY_LOGICAL_WIDTH-width)/2;
    return {left,right:left+width};
  }
  const TITLE_SCORE_SWEEP_FIRST_PULSE=4;
  const TITLE_SCORE_SWEEP_EVERY_PULSES=8;
  const TITLE_SCORE_SWEEP_FIRST_START_MS=
    INTERFACE_PULSE_CYCLE_MS*TITLE_SCORE_SWEEP_FIRST_PULSE;
  const TITLE_SCORE_SWEEP_INTERVAL_MS=
    INTERFACE_PULSE_CYCLE_MS*TITLE_SCORE_SWEEP_EVERY_PULSES;
  const TITLE_SCORE_SWEEP_ONE_WAY_MS=INTERFACE_PULSE_CYCLE_MS*1.25;
  const TITLE_SCORE_SWEEP_DURATION_MS=TITLE_SCORE_SWEEP_ONE_WAY_MS*2;
  const TITLE_SCORE_SPOTLIGHT_WIDTH=176;
  const TITLE_SCORE_RIGHT_EDGE_OVERLAP=0.22;
  let titleMenuEnteredAt=performance.now();

  const titleHighScoreMaskCanvas=document.createElement('canvas');
  titleHighScoreMaskCanvas.width=TITLE_LOGICAL_WIDTH;
  titleHighScoreMaskCanvas.height=32;
  const titleHighScoreMaskContext=titleHighScoreMaskCanvas.getContext('2d');
  titleHighScoreMaskContext.imageSmoothingEnabled=false;
  let titleHighScoreMaskReady=false;
  let titleHighScoreMaskHeading=null;

  const titleHighScoreEffectCanvas=document.createElement('canvas');
  titleHighScoreEffectCanvas.width=TITLE_LOGICAL_WIDTH;
  titleHighScoreEffectCanvas.height=32;
  const titleHighScoreEffectContext=titleHighScoreEffectCanvas.getContext('2d');

  const titleHighScoreSpotlightCanvas=document.createElement('canvas');
  titleHighScoreSpotlightCanvas.width=TITLE_SCORE_SPOTLIGHT_WIDTH;
  titleHighScoreSpotlightCanvas.height=32;
  const titleHighScoreSpotlightContext=titleHighScoreSpotlightCanvas.getContext('2d');
  const titleHighScoreSpotlightGradient=
    titleHighScoreSpotlightContext.createLinearGradient(
      0,0,TITLE_SCORE_SPOTLIGHT_WIDTH,0
    );
  titleHighScoreSpotlightGradient.addColorStop(0,'rgba(75,185,255,0)');
  titleHighScoreSpotlightGradient.addColorStop(.22,'rgba(75,185,255,.18)');
  titleHighScoreSpotlightGradient.addColorStop(.44,'rgba(205,245,255,.72)');
  titleHighScoreSpotlightGradient.addColorStop(.5,'rgba(255,255,222,1)');
  titleHighScoreSpotlightGradient.addColorStop(.56,'rgba(255,224,255,.82)');
  titleHighScoreSpotlightGradient.addColorStop(.78,'rgba(215,94,255,.2)');
  titleHighScoreSpotlightGradient.addColorStop(1,'rgba(215,94,255,0)');
  titleHighScoreSpotlightContext.fillStyle=titleHighScoreSpotlightGradient;
  titleHighScoreSpotlightContext.fillRect(0,0,TITLE_SCORE_SPOTLIGHT_WIDTH,32);

  function titleHighScoreSweepProgress(t=performance.now(),scoreHeading=false){
    // Score-screen headings repeat twice as often, not twice as fast. Keep
    // the original relaxed outward/return travel and leave a quiet interval.
    const frequency=scoreHeading?2:1;
    const enteredAt=scoreHeading?highScoreScreenEnteredAt:titleMenuEnteredAt;
    const elapsed=Math.max(0,t-enteredAt);
    const firstStart=TITLE_SCORE_SWEEP_FIRST_START_MS/frequency;
    if(elapsed<firstStart) return -1;
    const intervalPhase=
      (elapsed-firstStart)%(TITLE_SCORE_SWEEP_INTERVAL_MS/frequency);
    if(intervalPhase>=TITLE_SCORE_SWEEP_DURATION_MS) return -1;
    return intervalPhase/TITLE_SCORE_SWEEP_DURATION_MS;
  }

  function prepareTitleHighScoreMask(heading=null){
    const runs=heading===null?titleHighScoreRuns():null;
    if(titleHighScoreMaskReady&&titleHighScoreMaskHeading===heading) return;
    const mask=titleHighScoreMaskContext;
    mask.clearRect(0,0,TITLE_LOGICAL_WIDTH,32);
    if(heading!==null) drawBitmapText(
      mask,heading,TITLE_LEGACY_LOGICAL_WIDTH/2,0,
      {scale:TITLE_HIGH_SCORE_SCALE,align:'center'}
    );
    else drawBitmapTextRuns(
      mask,runs,TITLE_LEGACY_LOGICAL_WIDTH/2,0,
      {scale:titleHighScoreTextScale,align:'center'}
    );
    mask.save();
    mask.globalCompositeOperation='source-in';
    mask.fillStyle='#fff';
    mask.fillRect(0,0,TITLE_LOGICAL_WIDTH,32);
    mask.restore();
    titleHighScoreMaskHeading=heading;
    titleHighScoreMaskReady=true;
  }

  function drawTitleHighScoreSpotlight(t=performance.now(),heading=null){
    const progress=titleHighScoreSweepProgress(t,heading!==null);
    if(progress<0) return;
    // Only one of these screens is visible. Reuse the menu's existing mask,
    // strip and effect surface; no new canvases or per-frame glyph baking.
    prepareTitleHighScoreMask(heading);

    // Both endpoints are outside the glyph bounds. The first half crosses
    // HIGH through NOBODY; the second half returns immediately along the same
    // path. Linear travel removes the old slow-down that looked like a gap at
    // the right edge while preserving the fourth/every-eighth pulse schedule.
    const bounds=titleHighScoreBounds(heading);
    const halfWidth=TITLE_SCORE_SPOTLIGHT_WIDTH/2;
    const start=bounds.left-halfWidth;
    // Turn while a small leading portion still touches NOBODY. This removes
    // the perceived blank beat caused by the transparent edge of the beam.
    const end=bounds.right+halfWidth-
      TITLE_SCORE_SPOTLIGHT_WIDTH*TITLE_SCORE_RIGHT_EDGE_OVERLAP;
    const oneWayProgress=progress<=.5?progress*2:(1-progress)*2;
    const center=start+(end-start)*oneWayProgress;
    const effect=titleHighScoreEffectContext;
    effect.clearRect(0,0,TITLE_LOGICAL_WIDTH,32);
    effect.globalCompositeOperation='source-over';
    effect.drawImage(titleHighScoreSpotlightCanvas,center-halfWidth,0);
    effect.globalCompositeOperation='destination-in';
    effect.drawImage(titleHighScoreMaskCanvas,0,0);
    effect.globalCompositeOperation='source-over';

    ctx.save();
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=.92;
    ctx.shadowColor='rgba(115,218,255,.55)';
    ctx.shadowBlur=5;
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(titleHighScoreEffectCanvas,0,heading!==null?58:TITLE_HIGH_SCORE_Y);
    ctx.restore();
  }

  // Small cropped concept-art portraits are immediate external fallbacks.
  // They are composited into the static interface layer once while the
  // selected native-quality title artwork is loading.
  const titlePlayerConceptImage=new Image();
  const titleSnakeConceptImage=new Image();
  titlePlayerConceptImage.decoding='async';
  titleSnakeConceptImage.decoding='async';

  function invalidateTitleInterfaceLayer(){
    titleInterfaceLayerReady=false;
    // Rebuilding the interface canvas clears the static sprite decorations too.
    titleSnakeDecorationsReady=false;
    titlePlayerEmblemsReady=false;
  }

  titlePlayerConceptImage.addEventListener('load',invalidateTitleInterfaceLayer,{once:true});
  titleSnakeConceptImage.addEventListener('load',invalidateTitleInterfaceLayer,{once:true});
  titlePlayerConceptImage.src='assets/art/title/fallback/player.png';
  titleSnakeConceptImage.src='assets/art/title/fallback/snake.png';


  // One reusable pair of 48px buffers masks the cached spotlight to whichever
  // menu glyphs were selected. No gradient or canvas is allocated per frame.
  const TITLE_CHOICE_SPOTLIGHT_HEIGHT=48;
  const titleChoiceSpotlightMaskCanvas=document.createElement('canvas');
  titleChoiceSpotlightMaskCanvas.width=TITLE_LOGICAL_WIDTH;
  titleChoiceSpotlightMaskCanvas.height=TITLE_CHOICE_SPOTLIGHT_HEIGHT;
  const titleChoiceSpotlightMaskContext=
    titleChoiceSpotlightMaskCanvas.getContext('2d');
  titleChoiceSpotlightMaskContext.imageSmoothingEnabled=false;

  const titleChoiceSpotlightEffectCanvas=document.createElement('canvas');
  titleChoiceSpotlightEffectCanvas.width=TITLE_LOGICAL_WIDTH;
  titleChoiceSpotlightEffectCanvas.height=TITLE_CHOICE_SPOTLIGHT_HEIGHT;
  const titleChoiceSpotlightEffectContext=
    titleChoiceSpotlightEffectCanvas.getContext('2d');

  function drawTitleChoiceSpotlight(choice,x,y,width,drawMask,t=performance.now()){
    // Most choices have no active sweep. Avoid allocating/filtering temporary
    // progress arrays for every menu label on every frame; read queued score
    // shots directly when they are actually visible.
    const scoreShots=choice==='scoreMultiplier';
    if(scoreShots) pruneTitleScoreSpotlightShots(t);
    const singleProgress=scoreShots?-1:titleChoiceSpotlightProgress(choice,t);
    const shotCount=scoreShots?titleScoreSpotlightShots.length:(singleProgress>=0?1:0);
    if(shotCount===0) return;
    const drawWidth=Math.max(1,Math.ceil(width));
    const mask=titleChoiceSpotlightMaskContext;
    mask.setTransform(1,0,0,1,0,0);
    mask.globalAlpha=1;
    mask.globalCompositeOperation='source-over';
    mask.filter='none';
    mask.clearRect(0,0,TITLE_LOGICAL_WIDTH,TITLE_CHOICE_SPOTLIGHT_HEIGHT);
    drawMask(mask);
    mask.save();
    mask.globalCompositeOperation='source-in';
    mask.fillStyle='#fff';
    mask.fillRect(0,0,drawWidth,TITLE_CHOICE_SPOTLIGHT_HEIGHT);
    mask.restore();

    const halfWidth=TITLE_SCORE_SPOTLIGHT_WIDTH/2;
    const effect=titleChoiceSpotlightEffectContext;
    effect.setTransform(1,0,0,1,0,0);
    effect.globalAlpha=1;
    effect.filter='none';
    effect.clearRect(0,0,TITLE_LOGICAL_WIDTH,TITLE_CHOICE_SPOTLIGHT_HEIGHT);
    effect.globalCompositeOperation='source-over';
    // Every quick SPEED/DIFFICULTY press adds another independent projectile.
    // They share the same mask/effect buffers and are composited in one pass,
    // so a rapid arcade salvo does not allocate extra canvases or gradients.
    for(let shot=0;shot<shotCount;shot++){
      const progress=scoreShots
        ?Math.max(0,Math.min(1,(t-titleScoreSpotlightShots[shot])/TITLE_CHOICE_SPOTLIGHT_MS))
        :singleProgress;
      const eased=progress*progress*(3-2*progress);
      const center=-halfWidth+(drawWidth+2*halfWidth)*eased;
      effect.drawImage(
        titleHighScoreSpotlightCanvas,center-halfWidth,0,
        TITLE_SCORE_SPOTLIGHT_WIDTH,TITLE_CHOICE_SPOTLIGHT_HEIGHT
      );
    }
    effect.globalCompositeOperation='destination-in';
    effect.drawImage(titleChoiceSpotlightMaskCanvas,0,0);
    effect.globalCompositeOperation='source-over';

    ctx.save();
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=.96;
    ctx.shadowColor='rgba(115,218,255,.5)';
    ctx.shadowBlur=4;
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(
      titleChoiceSpotlightEffectCanvas,0,0,drawWidth,
      TITLE_CHOICE_SPOTLIGHT_HEIGHT,x,y,drawWidth,
      TITLE_CHOICE_SPOTLIGHT_HEIGHT
    );
    ctx.restore();
  }


  function drawTitleMicrostars(targetContext,screen='menu'){
    // Bake a deterministic star field into the deepest cached title layer.
    // The reserved rectangles keep stars out of the two translucent concept
    // portraits and the two small player emblems.
    const reservedArt=[
      {x:16*TITLE_LAYOUT_SCALE,y:412*TITLE_LAYOUT_SCALE,
        w:358*TITLE_LAYOUT_SCALE,h:344*TITLE_LAYOUT_SCALE},
      {x:650*TITLE_LAYOUT_SCALE,y:412*TITLE_LAYOUT_SCALE,
        w:358*TITLE_LAYOUT_SCALE,h:344*TITLE_LAYOUT_SCALE},
      {x:40*TITLE_LAYOUT_SCALE,y:138*TITLE_LAYOUT_SCALE,
        w:48*TITLE_LAYOUT_SCALE,h:48*TITLE_LAYOUT_SCALE},
      {x:936*TITLE_LAYOUT_SCALE,y:138*TITLE_LAYOUT_SCALE,
        w:48*TITLE_LAYOUT_SCALE,h:48*TITLE_LAYOUT_SCALE}
    ];
    const insideReservedArt=(x,y)=>reservedArt.some(area=>
      x>=area.x&&x<area.x+area.w&&y>=area.y&&y<area.y+area.h
    );

    targetContext.save();
    targetContext.globalCompositeOperation='source-over';
    for(let gy=0;gy<TITLE_LOGICAL_HEIGHT;gy+=24){
      for(let gx=0;gx<TITLE_LOGICAL_WIDTH;gx+=24){
        const hash=(
          Math.imul(gx+17,73856093)^
          Math.imul(gy+29,19349663)^0x5f3759df
        )>>>0;
        if(hash%5!==0) continue;
        const x=gx+4+(hash%16);
        const y=gy+4+((hash>>>5)%16);
        if(screen==='menu'){
          if(insideReservedArt(x,y)) continue;
        }else if(screen!=='dusk'&&screen!=='tutorial-dusk'){
          // Only the terminal interior needs a new star layer; the outer
          // space frame already contains the original menu stars.
          if(x<42*TITLE_LAYOUT_SCALE||x+1>982*TITLE_LAYOUT_SCALE||
             y<24*TITLE_LAYOUT_SCALE||y+1>744*TITLE_LAYOUT_SCALE) continue;
        }
        // Stars belong to the room, never the training maze or its rim.
        if((screen==='tutorial'||screen==='tutorial-dusk')&&
           x+1>(TUTORIAL_WORLD_X-6)*TITLE_LAYOUT_SCALE&&
           x<(TUTORIAL_WORLD_X+TUTORIAL_WORLD_WIDTH+6)*TITLE_LAYOUT_SCALE&&
           y+1>(TUTORIAL_WORLD_Y-6)*TITLE_LAYOUT_SCALE&&
           y<(TUTORIAL_WORLD_Y+TUTORIAL_WORLD_HEIGHT+6)*TITLE_LAYOUT_SCALE) continue;
        const alpha=(.10+((hash>>>10)%5)*.018)*3;
        targetContext.fillStyle=hash%11===0
          ?`rgba(226,112,255,${alpha*.82})`
          :hash%3===0
            ?`rgba(112,230,255,${alpha})`
            :`rgba(105,255,188,${alpha})`;
        targetContext.fillRect(x,y,1,1);
      }
    }
    targetContext.restore();
  }

  // One logical-resolution transparent cache serves both high-score screens
  // and the tutorial. Re-bake only when entering/leaving the tutorial cutout;
  // HD/4K switches and tutorial page changes reuse the same small surface.
  let terminalMicrostarsCanvas=null,terminalMicrostarsContext=null;
  let terminalMicrostarsScreen=null;
  function drawTerminalMicrostars(){
    const screen=titleScreenMode==='tutorial'?'tutorial':'scores';
    if(!terminalMicrostarsCanvas){
      terminalMicrostarsCanvas=document.createElement('canvas');
      terminalMicrostarsCanvas.width=TITLE_LOGICAL_WIDTH;
      terminalMicrostarsCanvas.height=TITLE_LOGICAL_HEIGHT;
      terminalMicrostarsContext=terminalMicrostarsCanvas.getContext('2d');
      terminalMicrostarsContext.imageSmoothingEnabled=false;
    }
    if(terminalMicrostarsScreen!==screen){
      terminalMicrostarsContext.clearRect(0,0,TITLE_LOGICAL_WIDTH,TITLE_LOGICAL_HEIGHT);
      drawTitleMicrostars(terminalMicrostarsContext,screen);
      terminalMicrostarsScreen=screen;
    }
    // The terminal caller uses legacy layout units; the star field uses the
    // same logical pixel grid as the main menu. Keep native square points.
    ctx.save();
    ctx.scale(1/TITLE_LAYOUT_SCALE,1/TITLE_LAYOUT_SCALE);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(terminalMicrostarsCanvas,0,0);
    ctx.restore();
  }

  // Draw-ready 4x restorations of the exact menu concept art remain external
  // to the engine and can be decoded and cached independently. The compact
  // portraits above remain an immediate fallback while they are loading.
  const titlePlayerHiResConceptImage=new Image();
  const titleSnakeHiResConceptImage=new Image();
  titlePlayerHiResConceptImage.decoding='async';
  titleSnakeHiResConceptImage.decoding='async';
  let titleHiResConceptsLoaded=0;
  let titleHiResConceptsReady=false;
  function markTitleHiResConceptLoaded(){
    titleHiResConceptsLoaded++;
    if(titleHiResConceptsLoaded!==2)return;
    // Swap both portraits in the same cached menu frame.  This avoids the
    // transient mixed-resolution frame (and its visible flash) that two
    // independent image-load redraws could otherwise produce.
    titleHiResConceptsReady=true;
    invalidateTitleInterfaceLayer();
  }
  titlePlayerHiResConceptImage.addEventListener('load',markTitleHiResConceptLoaded,{once:true});
  titleSnakeHiResConceptImage.addEventListener('load',markTitleHiResConceptLoaded,{once:true});
  let titleHiResConceptLoadStarted=false;
  function ensureTitleHiResConceptSources(){
    if(titleHiResConceptLoadStarted) return;
    titleHiResConceptLoadStarted=true;
    titlePlayerHiResConceptImage.src='assets/art/title/4k/player.png';
    titleSnakeHiResConceptImage.src='assets/art/title/4k/snake.png';
  }

  const titlePlayerHdConceptImage=new Image();
  const titleSnakeHdConceptImage=new Image();
  titlePlayerHdConceptImage.decoding='async';
  titleSnakeHdConceptImage.decoding='async';
  let titleHdConceptsLoaded=0;
  let titleHdConceptsReady=false;
  function markTitleHdConceptLoaded(){
    titleHdConceptsLoaded++;
    if(titleHdConceptsLoaded!==2)return;
    titleHdConceptsReady=true;
    invalidateTitleInterfaceLayer();
  }
  titlePlayerHdConceptImage.addEventListener('load',markTitleHdConceptLoaded,{once:true});
  titleSnakeHdConceptImage.addEventListener('load',markTitleHdConceptLoaded,{once:true});
  titlePlayerHdConceptImage.src='assets/art/title/hd/player.png';
  titleSnakeHdConceptImage.src='assets/art/title/hd/snake.png';

  function selectedTitleConcepts(){
    if(activeDisplayQuality==='4K'&&titleHiResConceptsReady){
      return {player:titlePlayerHiResConceptImage,snake:titleSnakeHiResConceptImage};
    }
    if(activeDisplayQuality==='HD'&&titleHdConceptsReady){
      return {player:titlePlayerHdConceptImage,snake:titleSnakeHdConceptImage};
    }
    return {player:titlePlayerConceptImage,snake:titleSnakeConceptImage};
  }

  function drawGhostedTitleConcepts(targetContext){
    const titleConcepts=selectedTitleConcepts();
    const selectedPlayerConceptImage=titleConcepts.player;
    const selectedSnakeConceptImage=titleConcepts.snake;
    targetContext.save();
    targetContext.globalCompositeOperation='source-over';
    targetContext.globalAlpha=.125;
    targetContext.imageSmoothingEnabled=true;

    // The second concept pose looks inward from the left side of the screen.
    if(selectedPlayerConceptImage.complete&&selectedPlayerConceptImage.naturalWidth){
      targetContext.drawImage(
        selectedPlayerConceptImage,
        24,420,342,328
      );
    }

    // Enlarge the expressive HD head and mirror it so it faces the player.
    if(selectedSnakeConceptImage.complete&&selectedSnakeConceptImage.naturalWidth){
      targetContext.save();
      // Return the snake to the right side and align it vertically with the
      // lowered player portrait.
      targetContext.translate(1000,0);
      targetContext.scale(-1,1);
      targetContext.drawImage(
        selectedSnakeConceptImage,
        0,420,342,328
      );
      targetContext.restore();
    }

    targetContext.restore();
  }

  function titleSpacePath(targetContext,x,y,w,h,cut=9){
    targetContext.beginPath();
    targetContext.moveTo(x+cut,y);
    targetContext.lineTo(x+w-cut,y);
    targetContext.lineTo(x+w,y+cut);
    targetContext.lineTo(x+w,y+h-cut);
    targetContext.lineTo(x+w-cut,y+h);
    targetContext.lineTo(x+cut,y+h);
    targetContext.lineTo(x,y+h-cut);
    targetContext.lineTo(x,y+cut);
    targetContext.closePath();
  }


  function drawStaticSpaceFrame(targetContext){
    const x=10,y=10,w=TITLE_LOGICAL_WIDTH-20,h=TITLE_LOGICAL_HEIGHT-20,cut=22;
    targetContext.save();
    titleSpacePath(targetContext,x,y,w,h,cut);
    targetContext.shadowColor='#22e77b';
    targetContext.shadowBlur=13;
    targetContext.strokeStyle='rgba(23,128,68,.72)';
    targetContext.lineWidth=8;
    targetContext.stroke();
    targetContext.shadowBlur=0;
    titleSpacePath(targetContext,x+4,y+4,w-8,h-8,cut-4);
    targetContext.strokeStyle='#39f59a';
    targetContext.lineWidth=2;
    targetContext.stroke();
    titleSpacePath(targetContext,x+10,y+10,w-20,h-20,cut-8);
    targetContext.strokeStyle='rgba(38,173,126,.45)';
    targetContext.lineWidth=1;
    targetContext.stroke();

    const cornerSegments=[
      [x+cut+10,y+6,x+cut+86,y+6],
      [x+w-cut-86,y+6,x+w-cut-10,y+6],
      [x+cut+10,y+h-6,x+cut+86,y+h-6],
      [x+w-cut-86,y+h-6,x+w-cut-10,y+h-6]
    ];
    targetContext.strokeStyle='rgba(124,255,222,.74)';
    targetContext.lineWidth=2;
    for(const segment of cornerSegments){
      targetContext.beginPath();
      targetContext.moveTo(segment[0],segment[1]);
      targetContext.lineTo(segment[2],segment[3]);
      targetContext.stroke();
    }
    targetContext.restore();
  }

  function prepareTitleDuskBackdrop(target){
    // Reuse the exact world artwork already needed by first-zoom preheating.
    // Composite it only when the menu cache changes, never in the frame loop.
    renderMazeLayer();
    target.save();
    target.scale(TITLE_LAYOUT_SCALE,TITLE_LAYOUT_SCALE);
    highScoreButtonPath(target,10,10,1004,748,22);
    target.clip();
    const height=768,width=height*mazeLayerCanvas.width/mazeLayerCanvas.height;
    target.globalAlpha=.24;
    target.imageSmoothingEnabled=true;
    target.drawImage(mazeLayerCanvas,(1024-width)/2,0,width,height);
    target.globalAlpha=1;
    const veil=target.createLinearGradient(0,0,0,768);
    veil.addColorStop(0,'rgba(3,9,13,.78)');
    veil.addColorStop(.28,'rgba(3,9,13,.22)');
    veil.addColorStop(.62,'rgba(3,9,13,.40)');
    veil.addColorStop(1,'rgba(3,9,13,.94)');
    target.fillStyle=veil;target.fillRect(0,0,1024,768);
    target.restore();
  }

  function drawTitleDuskFrame(target){
    target.save();
    highScoreButtonPath(target,10,10,TITLE_LOGICAL_WIDTH-20,TITLE_LOGICAL_HEIGHT-20,26);
    target.strokeStyle='rgba(73,136,121,.55)';target.lineWidth=1.5;target.stroke();
    highScoreButtonPath(target,16,16,TITLE_LOGICAL_WIDTH-32,TITLE_LOGICAL_HEIGHT-32,21);
    target.strokeStyle='rgba(68,140,118,.13)';target.lineWidth=1;target.stroke();
    target.restore();
  }

  function prepareTitleInterfaceLayer(screen='menu'){
    const menu=screen==='menu';
    const leaderboard=screen==='leaderboard';
    const entry=screen==='entry';
    const tutorial=screen==='tutorial';
    const dusk=menu||leaderboard||entry||tutorial;
    const leaderboardRows=leaderboard?Math.max(0,Math.min(HIGH_SCORE_PAGE_SIZE,
      currentHighScores().length-highScoreLeaderboardPage*HIGH_SCORE_PAGE_SIZE)):-1;
    if(titleInterfaceLayerReady&&titleInterfaceLayerScreen===screen&&
       (!dusk||(titleInterfaceMazeRevision===mazeRevision&&
       titleInterfaceMazeTheme===mazeColorTheme.name))&&
       (!leaderboard||titleInterfaceLeaderboardRows===leaderboardRows)) return;
    const layer=titleInterfaceLayerContext;
    layer.clearRect(0,0,TITLE_LOGICAL_WIDTH,TITLE_LOGICAL_HEIGHT);
    layer.fillStyle='#020604';
    layer.fillRect(0,0,TITLE_LOGICAL_WIDTH,TITLE_LOGICAL_HEIGHT);
    if(dusk){
      prepareTitleDuskBackdrop(layer);
      drawTitleMicrostars(layer,tutorial?'tutorial-dusk':'dusk');
      drawTitleDuskFrame(layer);
    }else{
      drawTitleMicrostars(layer);
      drawStaticSpaceFrame(layer);
    }
    layer.save();
    layer.scale(TITLE_LAYOUT_SCALE,TITLE_LAYOUT_SCALE);
    if(menu){
      for(const area of Object.values(TITLE_LIGHT_AREAS))
        drawHighScoreButton(area.x,area.y,area.w,area.h,false,1,layer);
      layer.fillStyle='rgba(70,145,122,.25)';
      layer.fillRect(64,586,896,1);
    }else if(leaderboard){
      prepareHighScoreLeaderboardBackdrop(layer,leaderboardRows);
    }else if(entry){
      prepareHighScoreEntryBackdrop(layer);
    }else if(tutorial){
      prepareTutorialInterfaceBackdrop(layer);
    }else{
      drawGhostedTitleConcepts(layer);
      // Terminal artwork stays independent of the main-menu composition.
      titleSnakeDecorationsReady=false;titlePlayerEmblemsReady=false;
    }
    layer.restore();
    titleInterfaceLayerScreen=screen;
    titleInterfaceMazeRevision=mazeRevision;
    titleInterfaceMazeTheme=mazeColorTheme.name;
    titleInterfaceLeaderboardRows=leaderboardRows;
    titleInterfaceLayerReady=true;
  }

  function drawTitleInterfaceLayer(screen='menu'){
    prepareTitleInterfaceLayer(screen);
    if(screen==='terminal'){
      titleInterfaceLayerContext.save();
      titleInterfaceLayerContext.scale(TITLE_LAYOUT_SCALE,TITLE_LAYOUT_SCALE);
      prepareTitleSnakeDecorations(titleInterfaceLayerContext);
      prepareTitlePlayerEmblems(titleInterfaceLayerContext);
      titleInterfaceLayerContext.restore();
    }
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation='copy';
    ctx.drawImage(titleInterfaceLayerCanvas,0,0);
    ctx.restore();
  }

  function drawTitleDuskControls(t){
    // The focus renderer retains at most two pools during a handover. Both
    // panel states are native-resolution, padded atlas stamps baked up front.
    for(const choice in TITLE_LIGHT_AREAS){
      if(!MenuLighting?.focusContains('menu',choice)) continue;
      const alpha=MenuLighting.focusAlpha('menu',choice,t);
      if(alpha<=.001) continue;
      const area=TITLE_LIGHT_AREAS[choice];
      drawHighScoreButton(area.x,area.y,area.w,area.h,true,alpha);
    }
  }

  function drawTitleMenuEntry(entry,t){
    const choice=`mode:${entry.mode}`;
    ctx.save();
    ctx.globalAlpha=titleChoicePulseAlpha(choice,t);
    drawBitmapTextRuns(ctx,entry.labelRuns,entry.x+24,entry.y+19,{scale:1.5});
    ctx.restore();
    drawTitleChoiceSpotlight(choice,entry.x+24,entry.y+13,entry.w-48,mask=>{
      drawBitmapTextRuns(mask,entry.labelRuns,0,6,{scale:1.5});
    },t);
  }

  let titleDuskLastMode=1;
  function drawTitleDuskModeContext(t){
    if(titleFocusedChoice.startsWith('mode:'))
      titleDuskLastMode=Number(titleFocusedChoice.slice(5));
    const entry=TITLE_MODE_HIT_AREAS.find(item=>item.mode===titleDuskLastMode);
    if(!entry) return;
    const textWidth=entry.hint.length*16*.82;
    const portraits=TITLE_MODE_PORTRAITS[entry.mode];
    const artWidth=portraits.length*40+12;
    const x=(1024-textWidth-artWidth)/2;
    for(let index=0;index<portraits.length;index++){
      const {palette,pose}=portraits[index];
      // Resolve the active HD/4K atlas each frame; do not retain old-profile
      // sprites or substitute the green player for an unavailable AI frame.
      drawTitleSprite(CharacterSpriteGroups.player?.[palette]?.normal?.[pose],
        x+index*40,459,'none',32);
    }
    drawBitmapText(ctx,entry.hint,x+artWidth,469,{scale:.82});
  }

  function drawTitleDuskSetting(choice,label,value,area,t){
    const center=area.x+area.w/2;
    drawBitmapText(ctx,label,center,area.y+12,{scale:.85,align:'center'});
    ctx.save();
    ctx.globalAlpha=titleChoicePulseAlpha(choice,t);
    drawBitmapText(ctx,value,center,area.y+36,{
      scale:1.15,align:'center',fontSprites:choice==='quality'?FontSprites:RedFontSprites
    });
    ctx.restore();
  }

  function drawMazeBitersTitleScreen(t=performance.now()){
    ctx.save();
    ctx.setTransform(titleCanvasScaleX,0,0,titleCanvasScaleY,0,0);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.filter='none';ctx.imageSmoothingEnabled=false;
    drawTitleInterfaceLayer();
    ctx.scale(TITLE_LAYOUT_SCALE,TITLE_LAYOUT_SCALE);
    MenuLighting?.drawAmbient(ctx,'menu',t);
    const focusArea=TITLE_LIGHT_AREAS[titleFocusedChoice];
    MenuLighting?.setFocus('menu',titleFocusedChoice,focusArea,t);
    drawTitleDuskControls(t);
    MenuLighting?.drawFocus(ctx,'menu',t);

    // Reuse the proven score sweep at half size, including its exact mask.
    // Score-terminal headings still use their original full-size geometry.
    ctx.save();ctx.translate(256,18);ctx.scale(.5,.5);
    drawBitmapTextRuns(ctx,titleHighScoreRuns(),512,TITLE_HIGH_SCORE_Y,
      {scale:titleHighScoreTextScale,align:'center'});
    drawTitleHighScoreSpotlight(t);
    ctx.restore();
    drawMazeBitersLogo(t);

    drawBitmapText(ctx,'LOCAL PLAY',80,191,{scale:.85});
    drawBitmapText(ctx,'WITH AI',552,191,{scale:.85});
    TITLE_MODE_HIT_AREAS.forEach(entry=>drawTitleMenuEntry(entry,t));
    drawTitleDuskModeContext(t);
    drawBitmapText(ctx,'HIGH SCORES',388,532,{scale:1.05,align:'center'});
    drawBitmapText(ctx,'HOW TO PLAY',636,532,{scale:1.05,align:'center'});
    drawBitmapText(ctx,'OPTIONS',72,597,{scale:.8});
    const scoreLabel=`SCORE ${combinedScoreTimesLabel()} X`;
    drawBitmapText(ctx,scoreLabel,952,597,
      {scale:.8,align:'right'});
    const scoreWidth=scoreLabel.length*16*.8;
    drawTitleChoiceSpotlight('scoreMultiplier',952-scoreWidth,597,scoreWidth,
      mask=>drawBitmapText(mask,scoreLabel,0,0,{scale:.8}),t);
    drawTitleDuskSetting('difficulty','DIFFICULTY',TITLE_DIFFICULTIES[titleDifficultyIndex],
      TITLE_DIFFICULTY_HIT_AREA,t);
    drawTitleDuskSetting('speed','SPEED',TITLE_SPEEDS[titleSpeedIndex],TITLE_SPEED_HIT_AREA,t);
    drawTitleDuskSetting('quality','QUALITY',titleQualityValue(),TITLE_QUALITY_HIT_AREA,t);
    drawTitleDuskSetting('music','MUSIC',MusicSettings.option.label,TITLE_MUSIC_HIT_AREA,t);
    drawBitmapText(ctx,'1-6 QUICK START   ARROWS - SPACE   D-PAD - A',512,724,
      {scale:.8,align:'center'});
    ctx.restore();
  }

  const HIGH_SCORE_BUTTON_PADDING=8;
  const HIGH_SCORE_BUTTON_SHAPES=Object.freeze([
    Object.freeze({w:200,h:54,r:10}),
    Object.freeze({w:72,h:40,r:7}),
    Object.freeze({w:48,h:48,r:8}),
    Object.freeze({w:424,h:62,r:14}),
    Object.freeze({w:224,h:48,r:11}),
    Object.freeze({w:212,h:68,r:11})
  ]);
  let highScoreButtonCanvas=null,highScoreButtonCacheScale=0;
  const highScoreButtonRegions=[];

  function highScoreButtonPath(target,x,y,width,height,radius){
    target.beginPath();
    target.moveTo(x+radius,y);target.lineTo(x+width-radius,y);
    target.quadraticCurveTo(x+width,y,x+width,y+radius);
    target.lineTo(x+width,y+height-radius);
    target.quadraticCurveTo(x+width,y+height,x+width-radius,y+height);
    target.lineTo(x+radius,y+height);
    target.quadraticCurveTo(x,y+height,x,y+height-radius);
    target.lineTo(x,y+radius);target.quadraticCurveTo(x,y,x+radius,y);
    target.closePath();
  }

  function prepareHighScoreButtonCache(){
    const scale=titleCanvasScaleX*TITLE_LAYOUT_SCALE;
    if(highScoreButtonCacheScale===scale) return;
    if(!highScoreButtonCanvas) highScoreButtonCanvas=document.createElement('canvas');
    const padding=HIGH_SCORE_BUTTON_PADDING;
    const atlasWidth=Math.ceil((424+padding*2)*scale);
    let atlasX=0,atlasY=0,rowHeight=0;
    for(let shape=0;shape<HIGH_SCORE_BUTTON_SHAPES.length;shape++){
      const {w,h}=HIGH_SCORE_BUTTON_SHAPES[shape];
      for(let state=0;state<2;state++){
        const width=Math.ceil((w+padding*2)*scale);
        const height=Math.ceil((h+padding*2)*scale);
        if(atlasX+width>atlasWidth){atlasX=0;atlasY+=rowHeight;rowHeight=0;}
        highScoreButtonRegions[shape*2+state]={x:atlasX,y:atlasY,w:width,h:height};
        atlasX+=width;rowHeight=Math.max(rowHeight,height);
      }
    }
    highScoreButtonCanvas.width=atlasWidth;
    highScoreButtonCanvas.height=atlasY+rowHeight;
    const target=highScoreButtonCanvas.getContext('2d');
    for(let shape=0;shape<HIGH_SCORE_BUTTON_SHAPES.length;shape++){
      const {w,h,r}=HIGH_SCORE_BUTTON_SHAPES[shape];
      for(let state=0;state<2;state++){
        const selected=state===1,region=highScoreButtonRegions[shape*2+state];
        target.save();
        // Each stamp owns a padded atlas cell, including its baked soft rim.
        // Clip in physical pixels so filtering can never reach another state.
        target.setTransform(1,0,0,1,0,0);
        target.beginPath();target.rect(region.x,region.y,region.w,region.h);target.clip();
        target.setTransform(scale,0,0,scale,region.x+padding*scale,region.y+padding*scale);
        highScoreButtonPath(target,1,3,w-2,h-4,r);
        target.fillStyle='rgba(0,0,0,.72)';target.fill();

        const surface=target.createLinearGradient(0,1,0,h-1);
        surface.addColorStop(0,selected?'rgba(20,64,57,.97)':'rgba(11,36,30,.96)');
        surface.addColorStop(.38,selected?'rgba(5,28,26,.97)':'rgba(2,17,15,.94)');
        surface.addColorStop(.72,'rgba(1,10,12,.94)');
        surface.addColorStop(1,selected?'rgba(6,30,29,.98)':'rgba(3,20,18,.97)');
        highScoreButtonPath(target,1,1,w-2,h-4,r);
        target.fillStyle=surface;target.fill();

        const rim=target.createLinearGradient(0,0,0,h);
        rim.addColorStop(0,selected?'#b6ffea':'#43977d');
        rim.addColorStop(.42,selected?'#44dec6':'#1d6654');
        rim.addColorStop(1,selected?'#187d77':'#092e29');
        target.strokeStyle=rim;target.lineWidth=selected?1.8:1.2;
        if(selected){target.shadowColor='rgba(59,255,207,.55)';target.shadowBlur=4*scale;}
        target.stroke();target.shadowBlur=0;

        highScoreButtonPath(target,4,4,w-8,h-10,Math.max(3,r-3));
        target.strokeStyle=selected?'rgba(98,218,213,.45)':'rgba(31,107,88,.34)';
        target.lineWidth=.8;target.stroke();
        // A short upper reflection and recessed bottom seam give the face
        // relief while leaving the original glyph area completely clear.
        const reflection=target.createLinearGradient(r+4,0,w-r-4,0);
        reflection.addColorStop(0,'rgba(172,255,222,0)');
        reflection.addColorStop(.5,selected?'rgba(202,255,238,.64)':'rgba(135,221,181,.28)');
        reflection.addColorStop(1,'rgba(172,255,222,0)');
        target.beginPath();target.moveTo(r+4,4);target.lineTo(w-r-4,4);
        target.strokeStyle=reflection;target.lineWidth=1;target.stroke();
        target.beginPath();target.moveTo(r+3,h-3);target.lineTo(w-r-3,h-3);
        target.strokeStyle='rgba(0,0,0,.78)';target.stroke();
        if(selected){
          target.fillStyle='rgba(156,255,229,.86)';
          const rail=Math.min(30,w*.28);
          target.fillRect((w-rail)/2,h-6,rail,1);
        }
        target.restore();
      }
    }
    highScoreButtonCacheScale=scale;
  }

  function drawHighScoreButton(x,y,width,height,selected,alpha,target=ctx){
    const shape=width===200&&height===54?0:width===72&&height===40?1:
      width===48&&height===48?2:width===424&&height===62?3:
      width===224&&height===48?4:width===212&&height===68?5:-1;
    if(shape<0) return false;
    prepareHighScoreButtonCache();
    const region=highScoreButtonRegions[shape*2+(selected?1:0)];
    const scale=highScoreButtonCacheScale,padding=HIGH_SCORE_BUTTON_PADDING;
    target.save();target.globalAlpha=alpha;target.imageSmoothingEnabled=true;
    target.globalCompositeOperation='source-over';target.filter='none';
    target.shadowBlur=0;target.shadowColor='transparent';
    target.drawImage(highScoreButtonCanvas,region.x,region.y,region.w,region.h,
      x-padding,y-padding,region.w/scale,region.h/scale);
    target.restore();
    return true;
  }

  function drawHighScorePanel(x,y,width,height,{selected=false,alpha=1,softFocus=false,button=false}={}){
    if(button&&drawHighScoreButton(x,y,width,height,selected,alpha)) return;
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.fillStyle='rgba(0,12,10,.88)';
    ctx.fillRect(x,y,width,height);
    ctx.strokeStyle=selected?'#8effdf':'#16895d';
    ctx.lineWidth=selected?3:2;
    if(selected&&!softFocus){
      ctx.shadowColor='#39ffc2';
      ctx.shadowBlur=10;
    }
    ctx.strokeRect(x+1,y+1,width-2,height-2);
    ctx.strokeStyle=selected?'#50dfff':'#0b4f38';
    ctx.lineWidth=1;
    ctx.strokeRect(x+6,y+6,width-12,height-12);
    ctx.restore();
  }

  function prepareHighScoreLeaderboardBackdrop(target,rowCount){
    // This relief belongs to the existing native HD/4K backdrop, not to a
    // new full-screen texture. Only visible records get recessed row bands.
    target.save();
    highScoreButtonPath(target,18,18,988,732,18);
    target.fillStyle='rgba(3,9,13,.48)';target.fill();
    const surface=target.createLinearGradient(0,146,0,594);
    surface.addColorStop(0,'rgba(9,28,26,.97)');
    surface.addColorStop(.18,'rgba(3,16,17,.97)');
    surface.addColorStop(.78,'rgba(2,11,15,.98)');
    surface.addColorStop(1,'rgba(5,22,22,.98)');
    highScoreButtonPath(target,64,146,896,448,18);
    target.fillStyle=surface;target.fill();
    const rim=target.createLinearGradient(0,146,0,594);
    rim.addColorStop(0,'rgba(106,192,165,.44)');
    rim.addColorStop(.4,'rgba(42,99,89,.20)');
    rim.addColorStop(1,'rgba(52,128,109,.30)');
    target.strokeStyle=rim;target.lineWidth=1.2;target.stroke();
    highScoreButtonPath(target,68,150,888,440,15);
    target.strokeStyle='rgba(109,215,191,.055)';target.lineWidth=1;target.stroke();
    const reflection=target.createLinearGradient(90,0,934,0);
    reflection.addColorStop(0,'rgba(128,227,199,0)');
    reflection.addColorStop(.5,'rgba(155,248,221,.25)');
    reflection.addColorStop(1,'rgba(128,227,199,0)');
    target.fillStyle=reflection;target.fillRect(90,149,844,1);
    if(rowCount>0){
      target.fillStyle='rgba(67,142,123,.22)';target.fillRect(88,188,848,1);
      for(let index=0;index<rowCount;index++){
        highScoreButtonPath(target,76,199+index*39,872,34,8);
        target.fillStyle=index%2?'rgba(8,26,27,.42)':'rgba(13,39,35,.42)';
        target.fill();
      }
    }
    target.restore();
  }

  function prepareHighScoreEntryBackdrop(target){
    // A recessed writing desk in the same Dusk room as the leaderboard.
    // Its surface is baked once into the existing native-resolution layer.
    target.save();
    highScoreButtonPath(target,18,18,988,732,18);
    target.fillStyle='rgba(3,9,13,.48)';target.fill();
    const surface=target.createLinearGradient(0,146,0,636);
    surface.addColorStop(0,'rgba(9,28,26,.97)');
    surface.addColorStop(.22,'rgba(3,16,17,.97)');
    surface.addColorStop(.78,'rgba(2,11,15,.98)');
    surface.addColorStop(1,'rgba(5,22,22,.98)');
    highScoreButtonPath(target,160,146,704,490,20);
    target.fillStyle=surface;target.fill();
    const rim=target.createLinearGradient(0,146,0,636);
    rim.addColorStop(0,'rgba(106,192,165,.44)');
    rim.addColorStop(.4,'rgba(42,99,89,.20)');
    rim.addColorStop(1,'rgba(52,128,109,.30)');
    target.strokeStyle=rim;target.lineWidth=1.2;target.stroke();
    highScoreButtonPath(target,164,150,696,482,17);
    target.strokeStyle='rgba(109,215,191,.055)';target.lineWidth=1;target.stroke();
    highScoreButtonPath(target,224,210,576,64,12);
    target.fillStyle='rgba(0,5,9,.48)';target.fill();
    const reflection=target.createLinearGradient(184,0,840,0);
    reflection.addColorStop(0,'rgba(128,227,199,0)');
    reflection.addColorStop(.5,'rgba(155,248,221,.25)');
    reflection.addColorStop(1,'rgba(128,227,199,0)');
    target.fillStyle=reflection;target.fillRect(184,149,656,1);
    target.globalAlpha=.32;target.fillRect(184,299,656,1);
    target.restore();
  }

  function prepareTutorialInterfaceBackdrop(target){
    // One calm folio around the original live maze. All relief is baked in
    // the shared native title cache; changing training pages reuses it.
    target.save();
    highScoreButtonPath(target,18,18,988,732,18);
    target.fillStyle='rgba(3,9,13,.48)';target.fill();
    const surface=target.createLinearGradient(0,140,0,596);
    surface.addColorStop(0,'rgba(9,28,26,.97)');
    surface.addColorStop(.18,'rgba(3,16,17,.97)');
    surface.addColorStop(.78,'rgba(2,11,15,.98)');
    surface.addColorStop(1,'rgba(5,22,22,.98)');
    highScoreButtonPath(target,64,140,896,456,18);
    target.fillStyle=surface;target.fill();
    const rim=target.createLinearGradient(0,140,0,596);
    rim.addColorStop(0,'rgba(106,192,165,.44)');
    rim.addColorStop(.4,'rgba(42,99,89,.20)');
    rim.addColorStop(1,'rgba(52,128,109,.30)');
    target.strokeStyle=rim;target.lineWidth=1.2;target.stroke();
    highScoreButtonPath(target,68,144,888,448,15);
    target.strokeStyle='rgba(109,215,191,.055)';target.lineWidth=1;target.stroke();
    highScoreButtonPath(target,TUTORIAL_WORLD_X-6,TUTORIAL_WORLD_Y-6,
      TUTORIAL_WORLD_WIDTH+12,TUTORIAL_WORLD_HEIGHT+12,14);
    target.fillStyle='#020a0d';target.fill();
    target.strokeStyle='rgba(68,133,121,.36)';target.lineWidth=1.2;target.stroke();
    const reflection=target.createLinearGradient(90,0,934,0);
    reflection.addColorStop(0,'rgba(128,227,199,0)');
    reflection.addColorStop(.5,'rgba(155,248,221,.25)');
    reflection.addColorStop(1,'rgba(128,227,199,0)');
    target.fillStyle=reflection;target.fillRect(90,143,844,1);
    target.restore();
  }

  function beginHighScoreScreen(title,subtitle,t=performance.now()){
    ctx.save();
    if(typeof ctx.setTransform==='function'){
      ctx.setTransform(titleCanvasScaleX,0,0,titleCanvasScaleY,0,0);
    }
    ctx.globalAlpha=1;
    ctx.globalCompositeOperation='source-over';
    ctx.filter='none';
    ctx.imageSmoothingEnabled=false;
    const leaderboard=titleScreenMode==='leaderboard';
    const entry=titleScreenMode==='entry';
    const tutorial=titleScreenMode==='tutorial';
    const dusk=leaderboard||entry||tutorial;
    drawTitleInterfaceLayer(leaderboard?'leaderboard':entry?'entry':tutorial?'tutorial':'terminal');
    ctx.scale(TITLE_LAYOUT_SCALE,TITLE_LAYOUT_SCALE);

    // Score and training screens carry their sculpted surfaces and single
    // star field in the Dusk backdrop. Keep legacy chrome only as a fallback.
    if(!dusk){
      ctx.fillStyle='rgba(1,7,6,.97)';
      ctx.fillRect(42,24,940,720);
      drawTerminalMicrostars();
      ctx.strokeStyle='#1ad18d';
      ctx.lineWidth=2;ctx.strokeRect(48,30,928,708);
      ctx.strokeStyle='#0a5940';
      ctx.lineWidth=1;ctx.strokeRect(56,38,912,692);
    }
    // The terminal covers the menu backdrop. Its own light must be painted
    // here, before headings and rows; tutorial boards keep their DUSK pass.
    if(dusk)
      MenuLighting?.drawAmbient(ctx,titleScreenMode,t);

    ctx.save();
    const reveal=Math.min(1,Math.max(0,(t-highScoreScreenEnteredAt)/360));
    ctx.globalAlpha=.35+.65*reveal;
    drawBitmapText(ctx,title,512,58,{scale:2,align:'center'});
    ctx.restore();
    if(title==='NEW HIGH SCORE'||title==='HIGH SCORES')
      drawTitleHighScoreSpotlight(t,title);
    if(subtitle){
      drawBitmapText(ctx,subtitle,512,104,{
        scale:1,align:'center',fontSprites:RedFontSprites
      });
    }
    if(!dusk){
      ctx.fillStyle='#146848';ctx.fillRect(72,138,880,2);
    }
  }

  function endHighScoreScreen(){
    ctx.restore();
  }

  let highScoreNameLightDraft='';
  let highScoreNameLightIndex=-1;
  let highScoreNameLightStartedAt=-Infinity;
  function drawHighScoreNameSlots(t=performance.now()){
    if(highScoreNameDraft!==highScoreNameLightDraft){
      // Only the latest committed glyph leaves a short light impression;
      // typing/pasting quickly cannot accumulate a particle or effect queue.
      highScoreNameLightIndex=highScoreNameDraft.length>highScoreNameLightDraft.length
        ?highScoreNameDraft.length-1:-1;
      highScoreNameLightStartedAt=t;
      highScoreNameLightDraft=highScoreNameDraft;
    }
    const cursorIndex=Math.min(HIGH_SCORE_NAME_MAX_LENGTH-1,highScoreNameDraft.length);
    if(highScoreNameDraft.length<HIGH_SCORE_NAME_MAX_LENGTH){
      const area=HIGH_SCORE_NAME_AREAS[cursorIndex];
      MenuLighting?.setFocus('name',area.key,area,t);
    }else MenuLighting?.resetFocus('name');
    for(let index=0;index<HIGH_SCORE_NAME_AREAS.length;index++){
      const area=HIGH_SCORE_NAME_AREAS[index];
      const cursor=index===cursorIndex&&highScoreNameDraft.length<HIGH_SCORE_NAME_MAX_LENGTH;
      drawHighScorePanel(area.x,area.y,area.w,area.h,{selected:cursor,softFocus:true,button:true});
    }
    MenuLighting?.drawFocus(ctx,'name',t,HIGH_SCORE_NAME_LIGHT_CLIP);
    const imprintAge=t-highScoreNameLightStartedAt;
    if(highScoreNameLightIndex>=0&&imprintAge>=0&&imprintAge<420){
      const rise=Math.min(1,imprintAge/55);
      const decay=Math.max(0,1-Math.max(0,imprintAge-55)/365);
      MenuLighting?.drawAccent(ctx,HIGH_SCORE_NAME_AREAS[highScoreNameLightIndex],t,
        'cursor',rise*decay*decay);
    }
    for(let index=0;index<HIGH_SCORE_NAME_AREAS.length;index++){
      const area=HIGH_SCORE_NAME_AREAS[index];
      const character=highScoreNameDraft[index];
      if(character){
        drawBitmapText(ctx,character,area.x+area.w/2,226,{
          scale:2,align:'center',fontSprites:RedFontSprites
        });
      }
    }
  }

  function drawHighScoreEntryScreen(t=performance.now()){
    const candidate=pendingHighScoreCandidate||{};
    beginHighScoreScreen('NEW HIGH SCORE','WELCOME TO THE TOP 25',t);
    drawBitmapTextRuns(ctx,[
      {text:`SCORE ${String(candidate.score||0).padStart(5,'0')}`},
      {text:'   '},
      {text:`LEVEL ${candidate.level||1}`,fontSprites:RedFontSprites}
    ],512,158,{scale:1.25,align:'center'});
    if((candidate.playerIds?.length||0)>1){
      drawBitmapText(ctx,'P1 + P2 SHARE THIS RECORD',512,188,{
        scale:.8,align:'center',fontSprites:RedFontSprites
      });
    }else{
      const duoRun=candidate.mode===2||candidate.mode===4||candidate.mode===5;
      const winner=candidate.playerIds?.[0];
      const prompt=duoRun&&(winner===1||winner===2)
        ?`P${winner} HIGH SCORE - ENTER YOUR NAME`:'ENTER YOUR NAME';
      drawBitmapText(ctx,prompt,512,188,{scale:.8,align:'center'});
    }
    drawHighScoreNameSlots(t);
    drawBitmapText(ctx,'UP TO 10 CHARACTERS - NO SPACES',512,283,{
      scale:.65,align:'center'
    });

    const keyIndex=highScoreKeyboardRow*HIGH_SCORE_KEYBOARD_COLUMNS+highScoreKeyboardColumn;
    const focusArea=highScoreKeyboardRow===HIGH_SCORE_KEYBOARD_ROWS
      ?HIGH_SCORE_ENTRY_ACTION_AREAS[highScoreKeyboardColumn]:HIGH_SCORE_KEY_AREAS[keyIndex];
    MenuLighting?.setFocus('entry',focusArea.key,focusArea,t);
    for(const area of HIGH_SCORE_KEY_AREAS){
      drawHighScorePanel(area.x,area.y,area.w,area.h,{
        selected:area===focusArea,alpha:.94,softFocus:true,button:true
      });
    }
    for(const area of HIGH_SCORE_ENTRY_ACTION_AREAS){
      drawHighScorePanel(area.x,area.y,area.w,area.h,{selected:area===focusArea,softFocus:true,button:true});
    }
    // All panel fills precede light, and all native glyphs follow it. Even a
    // rapid focus change therefore cannot wash over a neighbouring letter.
    MenuLighting?.drawFocus(ctx,'entry',t,HIGH_SCORE_KEY_LIGHT_CLIP);
    HIGH_SCORE_KEY_AREAS.forEach((area,index)=>{
      drawBitmapText(ctx,HIGH_SCORE_NAME_CHARACTERS[index],area.x+area.w/2,area.y+8,{
        scale:1.25,align:'center',fontSprites:area===focusArea?RedFontSprites:FontSprites
      });
    });
    HIGH_SCORE_ENTRY_ACTION_AREAS.forEach((area,index)=>{
      drawBitmapText(ctx,HIGH_SCORE_ACTIONS[index],area.x+area.w/2,area.y+15,{
        scale:1.25,align:'center',
        fontSprites:index===1?RedFontSprites:FontSprites
      });
    });

    drawBitmapText(ctx,'TYPE OR ARROWS THEN SPACE - D-PAD AND A',512,650,{
      scale:.8,align:'center'
    });
    drawBitmapText(ctx,'EMPTY NAMES ARE NEVER SAVED',512,678,{
      scale:.75,align:'center',fontSprites:RedFontSprites
    });
    if(highScoreEntryStatus){
      drawBitmapText(ctx,highScoreEntryStatus,512,706,{
        scale:.75,align:'center',fontSprites:RedFontSprites
      });
    }else{
      drawBitmapText(ctx,'ESC - SKIP WITHOUT SAVING',512,724,{
        scale:.65,align:'center'
      });
    }
    endHighScoreScreen();
  }

  function highScoreModeAbbreviation(entry){
    return ({1:'SOLO',2:'DUO VS',3:'SOLO AI',4:'DUO AI',5:'CO-OP'})[entry.mode]||'SOLO';
  }

  function drawHighScoreEmptyState(){
    drawTitleSprite(CharacterSpriteGroups.player?.p1?.normal?.Head3||OriginalSprites.Head3,
      492,268,'none',40);
    drawBitmapText(ctx,'NO SCORES YET',512,346,{
      scale:1.35,align:'center',fontSprites:RedFontSprites
    });
    drawBitmapText(ctx,'PLAY A GAME AND CLAIM THE FIRST PLACE',512,398,{
      scale:.75,align:'center'
    });
  }

  function drawHighScoreLeaderboardScreen(t=performance.now()){
    const scores=currentHighScores();
    const pages=highScorePageCount();
    highScoreLeaderboardPage=Math.max(0,Math.min(pages-1,highScoreLeaderboardPage));
    const start=highScoreLeaderboardPage*HIGH_SCORE_PAGE_SIZE;
    const visibleCount=Math.min(HIGH_SCORE_PAGE_SIZE,scores.length-start);
    const subtitle=HighScoreService?.isShared?.()?'TOP 25 - WORLD':'TOP 25 - THIS DEVICE';
    beginHighScoreScreen('HIGH SCORES',subtitle,t);

    if(visibleCount){
      drawBitmapText(ctx,'RANK',92,160,{scale:.85});
      drawBitmapText(ctx,'NAME',184,160,{scale:.85});
      drawBitmapText(ctx,'MODE',408,160,{scale:.85});
      drawBitmapText(ctx,'LEVEL',690,160,{scale:.85,align:'center'});
      drawBitmapText(ctx,'SCORE',930,160,{scale:.85,align:'right'});
    }else drawHighScoreEmptyState();

    // Warm first-place light and the newly saved row's emerald haze replace
    // the old pulsing rectangle. Draw every accent before any table text.
    for(let index=0;index<visibleCount;index++){
      const entry=scores[start+index];
      const highlighted=entry.id===highlightedHighScoreId;
      if(highlighted||start+index===0)
        MenuLighting?.drawAccent(ctx,HIGH_SCORE_ROW_LIGHT_AREAS[index],t,
          highlighted?'record':'champion');
    }
    for(let index=0;index<visibleCount;index++){
      const entry=scores[start+index];
      const rank=start+index+1;
      const y=206+index*39;
      const highlighted=entry.id===highlightedHighScoreId;
      const accent=rank<=3||highlighted?RedFontSprites:FontSprites;
      drawBitmapText(ctx,String(rank).padStart(2,'0'),92,y,{
        scale:1,fontSprites:accent
      });
      drawBitmapText(ctx,entry.name,184,y,{scale:1,fontSprites:accent});
      drawBitmapText(ctx,highScoreModeAbbreviation(entry),408,y,{scale:.85});
      drawBitmapText(ctx,String(entry.level).padStart(3,'0'),690,y,{
        scale:1,align:'center'
      });
      drawBitmapText(ctx,String(entry.score).padStart(6,'0'),930,y,{
        scale:1,align:'right',fontSprites:accent
      });
    }

    drawBitmapText(ctx,`PAGE ${highScoreLeaderboardPage+1} OF ${pages}`,512,614,{
      scale:.8,align:'center'
    });
    const actions=HIGH_SCORE_BOARD_ACTION_AREAS;
    const focusArea=actions[highScoreLeaderboardAction];
    if(highScoreLeaderboardAction===1||pages>1)
      MenuLighting?.setFocus('board',focusArea.key,focusArea,t);
    else MenuLighting?.resetFocus('board');
    actions.forEach((action,index)=>{
      const selected=highScoreLeaderboardAction===index;
      drawHighScorePanel(action.x,action.y,action.w,action.h,{
        selected,softFocus:true,button:true,alpha:index===1||pages>1?1:.3
      });
    });
    MenuLighting?.drawFocus(ctx,'board',t,HIGH_SCORE_BOARD_LIGHT_CLIP);
    actions.forEach((action,index)=>{
      ctx.save();
      ctx.globalAlpha=index===1||pages>1?1:.3;
      drawBitmapText(ctx,action.label,action.x+action.w/2,action.y+15,{
        scale:1.25,align:'center',
        fontSprites:index===1?RedFontSprites:FontSprites
      });
      ctx.restore();
    });
    if(highScoreEntryStatus){
      drawBitmapText(ctx,highScoreEntryStatus,512,714,{
        scale:.65,align:'center',fontSprites:RedFontSprites
      });
    }else{
      drawBitmapText(ctx,'ARROWS - SPACE   D-PAD - A   ESC - BACK',512,724,{
        scale:.7,align:'center'
      });
    }
    endHighScoreScreen();
  }

  const TUTORIAL_WORLD_COLUMNS=24;
  const TUTORIAL_WORLD_ROWS=8;
  const TUTORIAL_WORLD_X=80;
  const TUTORIAL_WORLD_Y=194;
  const TUTORIAL_WORLD_WIDTH=864;
  const TUTORIAL_WORLD_HEIGHT=288;
  const TUTORIAL_WORLD_SCALE=
    TUTORIAL_WORLD_WIDTH/(TUTORIAL_WORLD_COLUMNS*TILE);

  function expandTutorialCorridor(controlPoints){
    const cells=[];
    const pushCell=(x,y)=>{
      const previous=cells[cells.length-1];
      if(!previous||previous.x!==x||previous.y!==y) cells.push({x,y});
    };
    for(let index=0;index<controlPoints.length;index++){
      const [x,y]=controlPoints[index];
      if(index===0){
        pushCell(x,y);
        continue;
      }
      const [fromX,fromY]=controlPoints[index-1];
      if(fromX!==x&&fromY!==y)
        throw new Error('Tutorial corridors must be orthogonal');
      const dx=Math.sign(x-fromX),dy=Math.sign(y-fromY);
      let cellX=fromX,cellY=fromY;
      while(cellX!==x||cellY!==y){
        cellX+=dx;
        cellY+=dy;
        pushCell(cellX,cellY);
      }
    }
    return cells;
  }

  function tutorialExitCell(exits,x,y){
    return exits.some(exit=>x===exit.x&&y>=exit.minY&&y<=exit.maxY);
  }

  function createTutorialScene(themeIndex,corridorControls,exitControls=[]){
    // Only explicit, bounded vertical lanes may cross the cropped stage edge.
    // The rest of the border remains solid; actors still use native cell steps.
    const exits=Object.freeze(exitControls.map(({x,edge,depth})=>{
      if(!Number.isInteger(x)||x<1||x>=TUTORIAL_WORLD_COLUMNS-1||
         !['top','bottom'].includes(edge)||!Number.isInteger(depth)||depth<1||depth>6)
        throw new Error('Invalid tutorial stage exit');
      return Object.freeze({x,minY:edge==='top'?-depth:TUTORIAL_WORLD_ROWS-1,
        maxY:edge==='top'?0:TUTORIAL_WORLD_ROWS-1+depth});
    }));
    const mutable=Array.from(
      {length:TUTORIAL_WORLD_ROWS},
      ()=>Array(TUTORIAL_WORLD_COLUMNS).fill('#')
    );
    const corridors=corridorControls.map(expandTutorialCorridor);
    for(const corridor of corridors){
      for(const cell of corridor){
        if(cell.x<=0||cell.y<=0||
           cell.x>=TUTORIAL_WORLD_COLUMNS-1||
           cell.y>=TUTORIAL_WORLD_ROWS-1){
          if(!tutorialExitCell(exits,cell.x,cell.y))
            throw new Error('Tutorial corridor left the protected maze border');
        }
        if(cell.y>=0&&cell.y<TUTORIAL_WORLD_ROWS) mutable[cell.y][cell.x]='.';
      }
    }
    for(const exit of exits){
      const edgeY=exit.minY<0?0:TUTORIAL_WORLD_ROWS-1;
      const insideY=exit.minY<0?1:TUTORIAL_WORLD_ROWS-2;
      if(mutable[edgeY][exit.x]!=='.'||mutable[insideY][exit.x]!=='.')
        throw new Error('Tutorial stage exit is disconnected');
    }
    return Object.freeze({
      theme:MAZE_COLOR_THEMES[themeIndex],
      grid:Object.freeze(mutable.map(row=>row.join(''))),
      corridors:Object.freeze(corridors.map(Object.freeze)),exits
    });
  }

  const TUTORIAL_SCENES=Object.freeze([
    createTutorialScene(4,[
      [[1,5],[15,5],[15,-4]],[[15,5],[22,5]]
    ],[{x:15,edge:'top',depth:4}]),
    createTutorialScene(2,[
      [[1,2],[22,2]],[[1,4],[22,4]],
      [[13,1],[13,6]],[[6,2],[6,4]]
    ]),
    createTutorialScene(3,[
      [[1,4],[22,4]],[[9,-4],[9,4]],[[15,4],[15,6]]
    ],[{x:9,edge:'top',depth:4}]),
    createTutorialScene(5,[
      [[1,2],[22,2],[22,12]],[[18,2],[18,12]]
    ],[{x:18,edge:'bottom',depth:5},{x:22,edge:'bottom',depth:5}]),
    createTutorialScene(1,[
      [[1,4],[22,4]],[[15,1],[15,4]]
    ]),
    createTutorialScene(2,[
      [[1,4],[22,4]],[[3,4],[3,6]],[[20,4],[20,6]]
    ]),
    createTutorialScene(0,[
      [[1,3],[22,3]],[[4,1],[4,3]],[[19,3],[19,6]]
    ])
  ]);
  const TUTORIAL_RENDER_OFFSET_X=6;
  const TUTORIAL_RENDER_OFFSET_Y=8;
  const TUTORIAL_RENDER_GRIDS=Object.freeze(TUTORIAL_SCENES.map(scene=>{
    // Keep the off-crop wrapper walkable so the visible wall material retains
    // the same depth and dark falloff as the live maze. Tutorial corridors are
    // connected and their decorative sealed-panel pass is disabled below.
    const grid=Array.from({length:ROWS},()=>Array(COLS).fill('.'));
    for(let y=0;y<TUTORIAL_WORLD_ROWS;y++){
      for(let x=0;x<TUTORIAL_WORLD_COLUMNS;x++){
        grid[y+TUTORIAL_RENDER_OFFSET_Y][x+TUTORIAL_RENDER_OFFSET_X]=
          scene.grid[y][x];
      }
    }
    return Object.freeze(grid.map(row=>row.join('')));
  }));

  function tutorialCellIsOpen(scene,x,y){
    if(!Number.isInteger(x)||!Number.isInteger(y)) return false;
    if(x>=0&&y>=0&&x<TUTORIAL_WORLD_COLUMNS&&y<TUTORIAL_WORLD_ROWS)
      return scene.grid[y][x]!=='#';
    return tutorialExitCell(scene.exits,x,y);
  }

  function validateTutorialPath(scene,path,label){
    for(let index=0;index<path.length;index++){
      const cell=path[index];
      if(!tutorialCellIsOpen(scene,cell.x,cell.y))
        throw new Error(`${label} occupies a tutorial wall`);
      if(index>0){
        const previous=path[index-1];
        if(Math.abs(cell.x-previous.x)+Math.abs(cell.y-previous.y)!==1)
          throw new Error(`${label} contains a non-cardinal step`);
      }
    }
  }

  function validateTutorialSceneConnectivity(scene){
    let first=null,openCount=0;
    for(let y=0;y<TUTORIAL_WORLD_ROWS;y++){
      for(let x=0;x<TUTORIAL_WORLD_COLUMNS;x++){
        if(!tutorialCellIsOpen(scene,x,y)) continue;
        openCount++;
        if(!first) first={x,y};
      }
    }
    if(!first) throw new Error('Tutorial scene has no open corridor');
    const visited=new Set([`${first.x},${first.y}`]);
    const queue=[first];
    for(let read=0;read<queue.length;read++){
      const cell=queue[read];
      for(const direction of dirs){
        const x=cell.x+direction.x,y=cell.y+direction.y;
        const key=`${x},${y}`;
        if(x<0||y<0||x>=TUTORIAL_WORLD_COLUMNS||y>=TUTORIAL_WORLD_ROWS||
           visited.has(key)||!tutorialCellIsOpen(scene,x,y)) continue;
        visited.add(key);
        queue.push({x,y});
      }
    }
    if(visited.size!==openCount)
      throw new Error('Tutorial corridors must form one playable maze network');
  }

  function horizontalTutorialBody(headX,tailX,y){
    const cells=[];
    const step=headX<tailX?1:-1;
    for(let x=headX;;x+=step){
      cells.push(Object.freeze({x,y}));
      if(x===tailX) break;
    }
    return Object.freeze(cells);
  }

  for(const scene of TUTORIAL_SCENES){
    validateTutorialSceneConnectivity(scene);
    for(const corridor of scene.corridors)
      validateTutorialPath(scene,corridor,'Tutorial corridor');
  }
  [
    [1,10,2,'tail bite'],[1,13,4,'split'],
    [2,15,4,'ricochet'],[2,9,3,'queued ricochet turn'],
    [3,8,2,'fruit'],[3,10,2,'scorpion'],
    [3,18,6,'egg'],[3,18,2,'hunter'],
    [4,15,3,'missed exit'],[4,22,4,'dead end'],
    [5,12,4,'duel approach'],[5,13,4,'duel contact'],
    [6,18,3,'last head']
  ].forEach(([sceneIndex,x,y,label])=>{
    if(!tutorialCellIsOpen(TUTORIAL_SCENES[sceneIndex],x,y))
      throw new Error(`${label} is not on an open tutorial cell`);
  });

  const tutorialMazeCanvas=document.createElement('canvas');
  const TutorialLighting=globalThis.MazeBitersDuskLighting?.create({
    width:TUTORIAL_WORLD_COLUMNS*TILE,height:TUTORIAL_WORLD_ROWS*TILE,tile:TILE,
    positionFor:playerVisualPosition,isPowered:isPowerMode,powerStrength:powerModeSpeedStrength,
    deathLightAlpha:deathSkeletonPulseAlpha
  });
  const TUTORIAL_LIGHT_CAMERA=Object.freeze({
    x:TUTORIAL_WORLD_COLUMNS*TILE/2,y:TUTORIAL_WORLD_ROWS*TILE/2,zoom:1
  });
  const tutorialMazeContext=tutorialMazeCanvas.getContext('2d',{alpha:false});
  let tutorialMazeCacheKey='';

  function prepareTutorialMazeCache(pageIndex){
    const scene=TUTORIAL_SCENES[pageIndex];
    const sourceScale=Math.max(
      1,activeDisplayProfile.sourceTilePixels/TILE
    );
    const key=`${activeDisplayQuality}|${pageIndex}|${scene.theme.name}`;
    if(tutorialMazeCacheKey===key) return;
    const width=TUTORIAL_WORLD_COLUMNS*TILE*sourceScale;
    const height=TUTORIAL_WORLD_ROWS*TILE*sourceScale;
    if(tutorialMazeCanvas.width!==width||tutorialMazeCanvas.height!==height){
      tutorialMazeCanvas.width=width;
      tutorialMazeCanvas.height=height;
    }
    tutorialMazeContext.setTransform(1,0,0,1,0,0);
    tutorialMazeContext.fillStyle='#000';
    tutorialMazeContext.fillRect(0,0,width,height);
    tutorialMazeContext.setTransform(
      sourceScale,0,0,sourceScale,
      -TUTORIAL_RENDER_OFFSET_X*TILE*sourceScale,
      -TUTORIAL_RENDER_OFFSET_Y*TILE*sourceScale
    );
    tutorialMazeContext.imageSmoothingEnabled=false;
    const previousMaze=maze;
    const previousTheme=mazeColorTheme;
    const previousRevision=mazeRevision;
    try{
      maze=TUTORIAL_RENDER_GRIDS[pageIndex];
      mazeColorTheme=scene.theme;
      mazeRevision=0x7400+pageIndex;
      paintMazeArtwork(tutorialMazeContext,{
        includeSealedPanelGradients:false
      });
    }finally{
      maze=previousMaze;
      mazeColorTheme=previousTheme;
      mazeRevision=previousRevision;
    }
    const regions=Object.keys(RenderAtlasData.conceptMaze||{}).length
      ?Object.values(RenderAtlasData.conceptMaze)
      :Object.values(RenderAtlasData.maze);
    tutorialMazeCacheKey=regions.every(region=>atlasImageReady(region[0]))
      ?key:'';
  }

  // Training is an isolated event-driven world. Events commit whole maze
  // cells; the same gameplay interpolators draw the interval between them.
  // A slightly slower clock gives a new player time to read the encounter.
  const TUTORIAL_PLAYBACK_RATE=.72;
  // Presentation uses real milliseconds, separate from the native game clock.
  // Read the setup first, play every impulse/effect, then let the result settle
  // before concealing the reset. No snapshots or extra render surfaces needed.
  const TUTORIAL_INTRO_MS=900;
  const TUTORIAL_OUTCOME_HOLD_MS=650;
  const TUTORIAL_FADE_MS=220;
  const TUTORIAL_CLOCK_ORIGIN=1000;
  let tutorialRuntime=null;

  function tutorialActor(id,x,y,direction=RENDER_DIRECTIONS.right){
    return {
      id,isAI:false,x,y,prevX:x,prevY:y,dir:direction,nextDir:direction,
      planX:x,planY:y,dead:false,eliminated:false,lives:3,score:0,
      mouthOpen:true,lastMouthAt:TUTORIAL_CLOCK_ORIGIN,
      powerModeUntil:0,powerFlashBright:false,spawnShieldUntil:0,
      spawnFlashBright:false,lastSpawnFlashAt:TUTORIAL_CLOCK_ORIGIN,
      moveFromX:x,moveFromY:y,moveToX:x,moveToY:y,
      moveStartedAt:TUTORIAL_CLOCK_ORIGIN,moveDuration:95,
      controllerTiltDegrees:0,ignoreGameOverFreeze:true,
      renderVisualPosition:{x,y}
    };
  }

  function tutorialSnake(body,color,direction=null){
    const cells=body.map(cell=>({x:cell.x,y:cell.y}));
    return {
      body:cells,color,
      dir:direction||(cells.length>1
        ?renderDirection(cells[0].x-cells[1].x,cells[0].y-cells[1].y)
        :RENDER_DIRECTIONS.right),
      reversing:false,lastMove:TUTORIAL_CLOCK_ORIGIN,
      visualTailPredictionDisabled:true,
      renderHeadPosition:{x:0,y:0},renderTailPosition:{x:0,y:0}
    };
  }

  function addTutorialEvent(world,at,run,label=''){
    world.events.push({at:TUTORIAL_CLOCK_ORIGIN+at,run,label});
  }

  function tutorialCaption(world,at,status,detail=''){
    addTutorialEvent(world,at,()=>{
      world.status=status;
      world.detail=detail;
    });
  }

  function tutorialSound(world,key,p=null){
    if(!world.silent&&!world.soundSuppressed) playSound(key,p);
  }

  function addTutorialBloom(world,cell,color,p,t){
    const effect=world.blooms[world.bloomCursor++%world.blooms.length];
    Object.assign(effect,{
      active:true,x:cell.x,y:cell.y,startedAt:t,player:p,
      dirX:p.dir.x,dirY:p.dir.y,serial:world.bloomCursor,
      textures:cachedSnakeBiteBloomTextures(color)
    });
    world.bites++;
  }

  function tutorialBite(world,p,s,t,{powered=false}={}){
    if(powered&&!hasCombatPower(p,t)) throw new Error('Tutorial bite requires active power');
    const snakeIndex=world.snakes.indexOf(s);
    if(snakeIndex<0) return false;
    const index=s.body.findIndex(cell=>cell.x===p.x&&cell.y===p.y);
    if(index<0) return false;
    const cell=s.body[index];
    if(index===0&&!powered&&!snakeHeadContactIsSafe(s,{
      x:p.x-p.prevX,y:p.y-p.prevY
    })) throw new Error('Unsafe tutorial head bite');
    addTutorialBloom(world,cell,s.color,p,t);
    if(index===s.body.length-1&&index>0){
      s.body.pop();
      // No new motion is fabricated at a bite: the existing head impulse
      // continues, and the shortened tail takes its orientation from its neck.
      p.score+=25;
      tutorialSound(world,'TieEat',p);
      return true;
    }
    if(index===0&&!powered){
      world.snakes.splice(snakeIndex,1);
      p.score+=125;
      tutorialSound(world,'HeadEat',p);
      return true;
    }
    const fragments=snakeBiteFragments(s,index).map(part=>
      tutorialSnake(part.body,s.color,part.dir));
    world.snakes.splice(snakeIndex,1,...fragments);
    world.lastFragments=fragments;
    p.score+=index===0?125:10;
    tutorialSound(world,index===0?'HeadEat':'TieEat',p);
    return true;
  }

  function tutorialKillPlayer(world,p,t){
    if(p.dead) return;
    initializePlayerDeath(p,t);
    tutorialSound(world,'HeadDie',p);
  }

  function addTutorialWalk(world,p,controlPoints,start,{
    powerAt=null,onStep=null,hunter=false
  }={}){
    const path=expandTutorialCorridor(controlPoints);
    validateTutorialPath(world.scene,path,'Training actor route');
    if(path[0].x!==p.planX||path[0].y!==p.planY)
      throw new Error('Training route starts away from its actor');
    const shadow={powerModeUntil:0};
    if(powerAt!==null) initializePowerMode(shadow,TUTORIAL_CLOCK_ORIGIN+powerAt);
    let at=start;
    for(let index=1;index<path.length;index++){
      const from=path[index-1],to=path[index];
      const direction=renderDirection(to.x-from.x,to.y-from.y);
      const delay=hunter?hunterMoveDelay():
        playerMoveDelay(shadow,TUTORIAL_CLOCK_ORIGIN+at);
      addTutorialEvent(world,at,t=>{
        if(p.dead||p.removed) return;
        if(Math.abs(p.x-to.x)+Math.abs(p.y-to.y)!==1)
          throw new Error('Training actor skipped a maze cell');
        p.dir=direction;p.nextDir=direction;
        commitPlayerVisualStep(p,to.x,to.y,t,delay);
        p.lastMove=t;
        if(onStep) onStep(p,to,t,index);
      },'move');
      at+=delay;
    }
    p.planX=path[path.length-1].x;
    p.planY=path[path.length-1].y;
    return at;
  }

  function stepTutorialSnake(world,s,to,t,delay=snakeMoveDelay(),continues=false){
    if(!s||!world.snakes.includes(s)) return;
    if(!tutorialCellIsOpen(world.scene,to.x,to.y))
      throw new Error('Training snake entered a wall');
    const head=s.body[0];
    if(Math.abs(head.x-to.x)+Math.abs(head.y-to.y)!==1)
      throw new Error('Training snake skipped a maze cell');
    const old=s.body.map(cell=>({x:cell.x,y:cell.y}));
    const oldDirection=s.dir;
    s.dir=renderDirection(to.x-head.x,to.y-head.y);
    s.body.unshift({x:to.x,y:to.y});
    s.body.pop();
    // A staged stop has no next tail step to predict. Decide on this tick,
    // before the renderer can retract the tail toward a nonexistent step.
    s.visualTailPredictionDisabled=!continues;
    recordSnakeVisualStep(s,old,t,delay,oldDirection);
    s.lastMove=t;
    for(const p of world.players){
      if(!p.dead&&p.x===to.x&&p.y===to.y){
        if(hasCombatPower(p,t)) throw new Error('Training snake entered a protected player');
        tutorialKillPlayer(world,p,t);
        world.status='THE SNAKE CAUGHT P1';
        world.detail='NO SIDE EXIT  KEEP AN ESCAPE ROUTE';
      }
    }
  }

  function addTutorialSnakeWalk(world,s,controlPoints,start){
    const path=expandTutorialCorridor(controlPoints);
    validateTutorialPath(world.scene,path,'Training snake route');
    for(let index=1;index<path.length;index++){
      addTutorialEvent(world,start+(index-1)*snakeMoveDelay(),t=>
        stepTutorialSnake(world,s,path[index],t,snakeMoveDelay(),index<path.length-1),'snake step');
    }
    return start+(path.length-1)*snakeMoveDelay();
  }

  function tutorialCue(world,x,y,direction,from=0){
    if(!tutorialCellIsOpen(world.scene,x,y))
      throw new Error('Training cue is on a wall');
    // An instructional overlay, not a pickup: once introduced, keep it for
    // this whole demonstration, including the player's passage underneath.
    world.cues.push({x,y,direction,from:TUTORIAL_CLOCK_ORIGIN+from});
  }

  function buildTutorialMove(world){
    const path=world.scene.corridors[0];
    const p=tutorialActor(1,path[0].x,path[0].y);
    world.players.push(p);
    const start=1800;
    addTutorialWalk(world,p,path.map(cell=>[cell.x,cell.y]),start);
    // Teach one decision, not a rapid series of caption changes. The same
    // explanation stays readable before, during and after the native turn.
    tutorialCaption(world,0,'CHOOSE YOUR NEXT TURN EARLY',
      'HOLD UP  THE PLAYER TURNS AT THE OPENING');
    const turnIndex=path.findIndex((cell,index)=>index>0&&cell.y<path[index-1].y);
    const firstUp=path[turnIndex];
    tutorialCue(world,firstUp.x,firstUp.y,RENDER_DIRECTIONS.up);
  }

  function buildTutorialTail(world){
    const p=tutorialActor(1,7,2);
    const s=tutorialSnake(horizontalTutorialBody(14,8,2),SNAKE_BLUE);
    world.players.push(p);world.snakes.push(s);
    tutorialCaption(world,0,'CATCH THE MOVING TAIL','SNAKES 01');
    addTutorialSnakeWalk(world,s,[[14,2],[20,2]],600);
    addTutorialWalk(world,p,[[7,2],[10,2]],780,{onStep:(actor,cell,t)=>{
      if(tutorialBite(world,actor,s,t)){
        world.status='ONE TAIL SEGMENT EATEN';
        world.detail='THE SHORTER SNAKE KEEPS MOVING';
      }
    }});
  }

  function buildTutorialSplit(world){
    const p=tutorialActor(1,13,6,RENDER_DIRECTIONS.up);
    const s=tutorialSnake(horizontalTutorialBody(17,7,4),SNAKE_PINK);
    world.players.push(p);world.snakes.push(s);
    tutorialCaption(world,0,'CUT ACROSS THE BODY','SNAKES 01');
    addTutorialSnakeWalk(world,s,[[17,4],[20,4]],600);
    // Cut just after the third native snake impulse settles. Fresh fragments
    // then inherit the same visible cell positions, without a tiny snap.
    const cutAt=Math.ceil(600+(2+SNAKE_SLIDE_RATIO)*snakeMoveDelay());
    const approachAt=cutAt-playerMoveDelay(p,TUTORIAL_CLOCK_ORIGIN);
    addTutorialWalk(world,p,[[13,6],[13,3]],approachAt,{onStep:(actor,cell,t)=>{
      if(tutorialBite(world,actor,s,t)){
        world.status='ONE SNAKE BECOMES TWO';
        world.detail='SNAKES 02  THE OLD TAIL BECOMES A NEW HEAD';
      }
    }});
    for(let step=0;step<4;step++){
      addTutorialEvent(world,1500+step*snakeMoveDelay(),t=>{
        const parts=world.lastFragments;
        if(!parts) throw new Error('The body bite did not produce fragments');
        for(const part of parts){
          const h=part.body[0];
          const x=h.x+part.dir.x,y=h.y+part.dir.y;
          if(tutorialCellIsOpen(world.scene,x,y)){
            const continues=step<3&&tutorialCellIsOpen(world.scene,x+part.dir.x,y+part.dir.y);
            stepTutorialSnake(world,part,{x,y},t,snakeMoveDelay(),continues);
          }
        }
      });
    }
    world.showSnakeHeads=true;
  }

  function buildTutorialRicochet(world){
    const p=tutorialActor(1,8,4);
    const s=tutorialSnake(horizontalTutorialBody(20,22,4),SNAKE_PINK);
    world.players.push(p);world.snakes.push(s);
    tutorialCaption(world,0,'A DANGEROUS HEAD AHEAD','KEEP UP HELD FOR THE SAFE EXIT');
    // Both actors advance at their native cadence. At the next player pulse
    // the incoming head really occupies the attempted cell: no stationary
    // prop or manufactured contact is needed to explain the ricochet.
    // Phase the native 218 ms snake rhythm against the player's 95 ms steps:
    // head 16 settles at 1073.9, the player reaches 15 at 1165, and the next
    // snake impulse follows at 1172. The visible gap is exactly one cell at
    // recoil, without moving the sprite beyond its real collision geometry.
    addTutorialSnakeWalk(world,s,[[20,4],[1,4]],300);
    addTutorialWalk(world,p,[[8,4],[15,4]],500);
    const reboundAt=1165;
    addTutorialEvent(world,reboundAt,t=>{
      const head=s.body[0];
      if(head.x!==p.x+p.dir.x||head.y!==p.y+p.dir.y||
         snakeHeadContactIsSafe(s,p.dir))
        throw new Error('Training ricochet requires a real frontal head threat');
      world.ricochetAt=t;
      world.status='MAGNETIC RICOCHET';
      world.detail='HOLD UP  ESCAPE WHILE THE SNAKE KEEPS MOVING';
    },'ricochet');
    addTutorialWalk(world,p,[[15,4],[9,4],[9,-4]],reboundAt);
    tutorialCue(world,9,3,RENDER_DIRECTIONS.up,900);
  }

  function buildTutorialScorpion(world){
    const p=tutorialActor(1,4,2);
    const s={...tutorialActor(0,10,2),tailX:9,tailY:2,
      tailMoveFromX:9,tailMoveFromY:2,tailMoveToX:9,tailMoveToY:2,
      snapMovement:false,bornAt:TUTORIAL_CLOCK_ORIGIN-1000,
      lastMove:TUTORIAL_CLOCK_ORIGIN,renderHeadPosition:{x:10,y:2},
      renderTailPosition:{x:9,y:2}};
    world.players.push(p);world.scorpions.push(s);
    tutorialCaption(world,0,'SCORPIONS ARE SAFE TO EAT','NO FRUIT OR SHIELD IS NEEDED');
    addTutorialEvent(world,450,t=>{
      commitPlayerVisualStep(s,11,2,t,snakeMoveDelay());
      s.tailX=10;s.tailY=2;s.tailMoveFromX=9;s.tailMoveFromY=2;
      s.tailMoveToX=10;s.tailMoveToY=2;s.lastMove=t;
    });
    addTutorialWalk(world,p,[[4,2],[11,2]],650,{onStep:(actor,cell,t)=>{
      if(!s.removed&&((cell.x===s.x&&cell.y===s.y)||
        (cell.x===s.tailX&&cell.y===s.tailY))){
        s.removed=true;
        addTutorialBloom(world,cell,'#9b7bff',actor,t);
        tutorialSound(world,'ScorpioEat',actor);
        world.status='SCORPION EATEN';
        world.detail='THE WHOLE CREATURE IS REMOVED';
      }
    }});
  }

  function buildTutorialPower(world){
    const p=tutorialActor(1,5,2);
    world.players.push(p);
    const fruit={x:8,y:2,kind:1,bornAt:TUTORIAL_CLOCK_ORIGIN-600};
    const egg={x:18,y:6,bornAt:TUTORIAL_CLOCK_ORIGIN-9700};
    const h={...tutorialActor(0,18,6,RENDER_DIRECTIONS.up),
      color:'#ff9b55',paletteIndex:0,motherAlive:true,removed:true};
    const s=tutorialSnake(horizontalTutorialBody(20,22,2),SNAKE_ORANGE);
    world.fruits.push(fruit);world.eggs.push(egg);
    world.hunters.push(h);world.snakes.push(s);
    const fruitAt=690;
    tutorialCaption(world,0,'FRUIT GIVES SPEED AND POWER','WATCH THE EGG CRACK AND HATCH');
    addTutorialWalk(world,p,[[5,2],[8,2]],500,{onStep:(actor,cell,t)=>{
      if(cell.x!==fruit.x) return;
      fruit.removed=true;initializePowerMode(actor,t);
      tutorialSound(world,FRUIT_EAT_SOUNDS[world.cycle%FRUIT_EAT_SOUNDS.length],actor);
      tutorialSound(world,'snakeSTART@',actor);
      world.powerPlayer=actor;
      world.status='POWER MODE  SEVEN SECONDS';
      world.detail='BRIGHT PLAYER  FASTER MOVEMENT';
    }});
    addTutorialWalk(world,p,[[8,2],[16,2]],fruitAt+95,{powerAt:fruitAt});
    for(const at of [300,1300,2300])
      addTutorialEvent(world,at,()=>tutorialSound(world,'EggKnock',egg));
    addTutorialEvent(world,3300,()=>{
      egg.removed=true;h.removed=false;
      tutorialSound(world,'ManBorn',h);
      world.status='THE EGG HATCHES A HUNTER';
      world.detail='DANGEROUS WITHOUT POWER  EDIBLE WHILE POWERED';
    });
    addTutorialWalk(world,h,[[18,6],[18,2]],3400,{hunter:true});
    // These two contacts are only 95 game ms apart. One truthful rule caption
    // covers both actions instead of flashing an unreadable hunter headline.
    tutorialCaption(world,4500,'POWER EATS HUNTERS AND HEADS',
      'A BITTEN HEAD LEAVES A REVERSED SNAKE');
    addTutorialWalk(world,p,[[16,2],[20,2]],4500,{powerAt:fruitAt,onStep:(actor,cell,t)=>{
      if(!h.removed&&cell.x===h.x&&cell.y===h.y){
        h.removed=true;
        addTutorialBloom(world,cell,h.color,actor,t);
        tutorialSound(world,'HeadEat',actor);
      }
      tutorialBite(world,actor,s,t,{powered:true});
    }});
    // Continue through the lower stage exit until the whole snake is outside
    // the crop. Every step keeps the same native head/tail impulses.
    for(let step=0;step<10;step++){
      addTutorialEvent(world,5150+step*snakeMoveDelay(),t=>{
        const part=world.lastFragments?.[0];
        if(!part) throw new Error('The powered head bite did not leave a snake');
        stepTutorialSnake(world,part,{x:22,y:3+step},t,snakeMoveDelay(),step<9);
      },'snake descent');
    }
    // Turn into an open side branch, then show the real warning flashes and
    // the gradual return to normal movement before the seven-second expiry.
    addTutorialWalk(world,p,[[20,2],[18,2],[18,12]],6500,{powerAt:fruitAt});
    tutorialCaption(world,6250,'POWER IS RUNNING OUT','THE FLASHES WARN YOU TO AVOID HEADS AGAIN');
    tutorialCaption(world,fruitAt+POWER_MODE_TOTAL_MS,'BACK TO NORMAL','POWER ENDS AFTER SEVEN GAME SECONDS');
  }

  function buildTutorialDanger(world){
    const p=tutorialActor(1,6,4);
    const s=tutorialSnake(horizontalTutorialBody(5,1,4),SNAKE_YELLOW);
    world.players.push(p);world.snakes.push(s);
    tutorialCaption(world,0,'CHECK THE EXIT BEFORE YOU ENTER','THE UP TURN IS YOUR ESCAPE');
    const endpoint=world.scene.corridors[0].at(-1);
    if(tutorialCellIsOpen(world.scene,endpoint.x+1,endpoint.y))
      throw new Error('Danger lesson does not end against a wall');
    const wallAt=addTutorialWalk(world,p,[[6,4],[endpoint.x,endpoint.y]],650);
    tutorialCue(world,15,3,RENDER_DIRECTIONS.up);
    // Warn as the player misses the junction, not during the brief wall turn.
    tutorialCaption(world,650+9*95,'MISSED TURN  DEAD END AHEAD',
      'TURNING BACK MEANS FACING THE HEAD');
    // Reverse immediately when the rightward slide reaches the wall. Starting
    // farther left creates the pursuit timing without a stationary wall wait.
    // At 2740, P1 at x16 and the pursuer at x15 are fully settled one cell
    // apart. The snake blocks the missed junction; its next step is at 2830.
    const reboundAt=addTutorialWalk(world,p,[[22,4],[16,4]],wallAt);
    addTutorialEvent(world,reboundAt,t=>{
      const head=s.body[0];
      if(head.x!==p.x+p.dir.x||head.y!==p.y+p.dir.y||
         snakeHeadContactIsSafe(s,p.dir))
        throw new Error('Dead-end rebound requires a real frontal head threat');
      world.ricochetAt=t;
      world.status='RICOCHET  BUT NO WAY OUT';
      world.detail='THE SNAKE BLOCKS THE TURN  THE WALL IS BEHIND';
    },'ricochet');
    addTutorialWalk(world,p,[[16,4],[22,4]],reboundAt);
    addTutorialSnakeWalk(world,s,[[5,4],[endpoint.x,endpoint.y]],650);
  }

  const TUTORIAL_DUELS=Object.freeze([
    {name:'SHIELD BEATS POWER',p1:2000,p2:500,power:1,shield:2,winner:2},
    {name:'POWER BEATS SCORE',p1:500,p2:2000,power:1,shield:0,winner:1},
    {name:'HIGHER SCORE WINS',p1:2000,p2:1000,power:0,shield:0,winner:1},
    {name:'EQUAL SCORE AND POWER',p1:1000,p2:1000,power:0,shield:0,winner:0},
    {name:'TWO SPAWN SHIELDS',p1:2000,p2:500,power:0,shield:3,winner:0}
  ]);

  function buildTutorialDuel(world,example){
    const rule=TUTORIAL_DUELS[example];
    const p1=tutorialActor(1,5,4),p2=tutorialActor(2,19,4,RENDER_DIRECTIONS.left);
    p1.score=rule.p1;p2.score=rule.p2;
    world.players.push(p1,p2);world.duel=rule;
    for(const p of world.players){
      if(rule.power===p.id) initializePowerMode(p,TUTORIAL_CLOCK_ORIGIN);
      if(rule.shield===p.id||rule.shield===3) activateSpawnShield(p,TUTORIAL_CLOCK_ORIGIN);
    }
    tutorialCaption(world,0,rule.name,rule.winner
      ?`P${rule.winner} CAN EAT P${3-rule.winner}`:'NEITHER PLAYER CAN EAT THE OTHER');
    addTutorialWalk(world,p1,[[5,4],[12,4]],500,{powerAt:rule.power===1?0:null});
    addTutorialWalk(world,p2,[[19,4],[13,4]],500,{powerAt:rule.power===2?0:null});
    addTutorialEvent(world,1300,t=>{
      const winner=playerWinsContactPriority(p1,p2,t)?p1:
        playerWinsContactPriority(p2,p1,t)?p2:null;
      if((winner?.id||0)!==rule.winner) throw new Error('Tutorial duel disagrees with gameplay');
      if(!winner){
        world.status='CONTACT BLOCKED';
        world.detail='BOTH PLAYERS STAY ALIVE';
        return;
      }
      const victim=winner===p1?p2:p1;
      winner.dir=renderDirection(victim.x-winner.x,victim.y-winner.y);
      commitPlayerVisualStep(winner,victim.x,victim.y,t,playerMoveDelay(winner,t));
      addTutorialBloom(world,victim,playerEffectColor(victim),winner,t);
      tutorialKillPlayer(world,victim,t);
      winner.score+=COMPETITOR_EAT_POINTS;
      world.status=`P${winner.id} EATS P${victim.id}`;
      world.detail=rule.name;
    });
    if(rule.winner){
      const winner=rule.winner===1?p1:p2;
      const contactX=rule.winner===1?13:12;
      const exitX=rule.winner===1?16:9;
      winner.planX=contactX;
      // Continue past the encounter so the native skull pulses and the
      // winner's phosphor wake remain visible instead of covering each other.
      addTutorialWalk(world,winner,[[contactX,4],[exitX,4]],1600,{
        powerAt:rule.power===winner.id?0:null
      });
    }
  }

  function buildTutorialClear(world){
    const p=tutorialActor(1,7,3);
    const s=tutorialSnake(horizontalTutorialBody(16,10,3),SNAKE_GREEN);
    world.players.push(p);world.snakes.push(s);world.showCount=true;
    tutorialCaption(world,0,'BITE THE EXPOSED TAIL','REMOVE EVERY SNAKE TO FINISH THE LEVEL');
    addTutorialSnakeWalk(world,s,[[16,3],[18,3]],500);
    addTutorialWalk(world,p,[[7,3],[17,3]],900,{onStep:(actor,cell,t)=>{
      tutorialBite(world,actor,s,t);
      if(s.body.length===1){
        world.status='ONLY THE HEAD REMAINS';
        world.detail='THE MOUTH IS DANGEROUS  APPROACH FROM BEHIND';
      }
    }});
    addTutorialWalk(world,p,[[17,3],[18,3]],2850,{onStep:(actor,cell,t)=>{
      if(tutorialBite(world,actor,s,t)){
        world.status='LEVEL CLEARED';
        world.detail='KEEP YOUR LIVES  BUILD YOUR HIGH SCORE';
        world.clearedAt=t;
        tutorialSound(world,'Congratulations');
      }
    }});
  }

  const TUTORIAL_CHAPTERS=Object.freeze([
    [{name:'QUEUED TURNS',duration:6000,build:buildTutorialMove}],
    [{name:'TAIL BITE',duration:3500,build:buildTutorialTail},
      {name:'BODY SPLIT',duration:4400,build:buildTutorialSplit}],
    [{name:'RICOCHET AND ESCAPE',duration:4400,build:buildTutorialRicochet}],
    [{name:'SCORPION',duration:3100,build:buildTutorialScorpion},
      {name:'FRUIT EGG AND POWER',duration:8500,build:buildTutorialPower}],
    [{name:'DEAD END',duration:7200,build:buildTutorialDanger}],
    TUTORIAL_DUELS.map((rule,index)=>({name:rule.name,duration:4200,
      build:world=>buildTutorialDuel(world,index)})),
    [{name:'FINISH THE LEVEL',duration:2850+LEVEL_COMPLETE_TOTAL_GAME_MS+400,build:buildTutorialClear}]
  ]);

  function createTutorialRuntime(page,chapter,cycle=0,silent=false){
    const definition=TUTORIAL_CHAPTERS[page][chapter];
    const world={page,chapter,cycle,scene:TUTORIAL_SCENES[page],silent,
      players:[],snakes:[],fruits:[],eggs:[],hunters:[],scorpions:[],
      events:[],eventIndex:0,cues:[],status:'',detail:'',bites:0,
      blooms:Array.from({length:12},()=>({active:false})),bloomCursor:0,
      simulatedAt:TUTORIAL_CLOCK_ORIGIN,now:TUTORIAL_CLOCK_ORIGIN,
      chapterName:definition.name,duration:definition.duration};
    definition.build(world);
    for(const p of world.players) ensurePlayerPhosphorTrail(p);
    for(const s of world.snakes) validateTutorialPath(world.scene,s.body,'Training snake body');
    world.events.sort((a,b)=>a.at-b.at);
    return world;
  }

  function updateTutorialActors(world,t){
    for(const p of world.players){
      if(!p.dead){
        advanceBinaryRhythm(p,t,'lastMouthAt','mouthOpen',PLAYER_MOUTH_TOGGLE_GAME_MS);
        updateSpawnShield(p,t);
        // The real updater's only side effect is its warning tick. Suppress
        // sound only during deterministic QA/rebuild; normal playback uses it.
        if(world.silent||world.soundSuppressed){
          const remaining=p.powerModeUntil-t;
          p.powerFlashBright=remaining>POWER_MODE_DECEL_MS||
            (remaining>0&&Math.floor((POWER_MODE_DECEL_MS-remaining)/320)%2===1);
        }else updatePowerMode(p,t);
      }
      updatePlayerPhosphorTrail(p,t);
    }
    for(const h of world.hunters){
      if(!h.removed) advanceBinaryRhythm(h,t,'lastMouthAt','mouthOpen',PLAYER_MOUTH_TOGGLE_GAME_MS);
    }
  }

  function advanceTutorialRuntime(world,localTime){
    const target=TUTORIAL_CLOCK_ORIGIN+Math.max(0,Math.min(world.duration,localTime));
    // Small fixed visual samples make trails deterministic even after a tab
    // was hidden. Event ordering never depends on the display refresh rate.
    while(world.simulatedAt<target||world.events[world.eventIndex]?.at<=target){
      const nextEvent=world.events[world.eventIndex]?.at??Infinity;
      const next=Math.min(target,world.simulatedAt+1000/120,nextEvent);
      // Do not replay a burst of stale sounds after a hidden tab catches up.
      world.soundSuppressed=next<target-120;
      while(world.events[world.eventIndex]?.at<=next){
        const event=world.events[world.eventIndex++];
        event.run(event.at);
      }
      updateTutorialActors(world,next);
      world.simulatedAt=next;
      if(next===target) break;
    }
    world.now=target;
    world.soundSuppressed=false;
    return world;
  }

  function tutorialPresentationDuration(chapter){
    return TUTORIAL_INTRO_MS+chapter.duration/TUTORIAL_PLAYBACK_RATE+
      TUTORIAL_OUTCOME_HOLD_MS+TUTORIAL_FADE_MS;
  }

  function tutorialWorldAt(t){
    const chapters=TUTORIAL_CHAPTERS[tutorialPage];
    const duration=chapters.reduce((sum,chapter)=>sum+tutorialPresentationDuration(chapter),0);
    const total=Math.max(0,t-tutorialScreenEnteredAt);
    const cycle=Math.floor(total/duration);
    let local=total%duration,chapter=0;
    while(chapter<chapters.length-1&&local>=tutorialPresentationDuration(chapters[chapter])){
      local-=tutorialPresentationDuration(chapters[chapter++]);
    }
    const definition=chapters[chapter];
    const gameLocal=Math.max(0,Math.min(definition.duration,
      (local-TUTORIAL_INTRO_MS)*TUTORIAL_PLAYBACK_RATE));
    if(!tutorialRuntime||tutorialRuntime.page!==tutorialPage||
       tutorialRuntime.chapter!==chapter||tutorialRuntime.cycle!==cycle||
       tutorialRuntime.now>TUTORIAL_CLOCK_ORIGIN+gameLocal){
      tutorialRuntime=createTutorialRuntime(tutorialPage,chapter,cycle);
    }
    const world=advanceTutorialRuntime(tutorialRuntime,gameLocal);
    const fadeOutAt=tutorialPresentationDuration(definition)-TUTORIAL_FADE_MS;
    const fade=local<TUTORIAL_FADE_MS?1-local/TUTORIAL_FADE_MS:
      local>fadeOutAt?(local-fadeOutAt)/TUTORIAL_FADE_MS:0;
    world.transitionAlpha=fade*fade*(3-2*fade);
    world.presentationPhase=local<TUTORIAL_INTRO_MS?'intro':
      gameLocal<definition.duration?'play':'outcome';
    return world;
  }

  function drawTutorialInputCue(cell,direction,t,alpha=1){
    const cx=(cell.x+.5)*TILE,cy=(cell.y+.5)*TILE;
    const pulse=.5+.5*Math.sin(t/300);
    const press=pulse**6;
    // Blink gently without going fully dark; the sprite below stays visible.
    ctx.save();ctx.globalAlpha*=Math.max(0,Math.min(1,alpha))*(.34+.4*pulse);
    ctx.globalCompositeOperation='source-over';ctx.filter='none';
    ctx.shadowBlur=0;ctx.shadowColor='transparent';
    ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
    ctx.translate(cx,cy);
    // A tiny tactile key, not a route chevron. Flat rounded layers share the
    // menu's teal finish without a texture, gradient, shadow blur or cache.
    ctx.save();ctx.globalAlpha*=.08+.07*pulse;
    highScoreButtonPath(ctx,-TILE*.42,-TILE*.42,TILE*.84,TILE*.84,TILE*.18);
    ctx.fillStyle='#91ffe6';ctx.fill();ctx.restore();
    highScoreButtonPath(ctx,-TILE*.34,-TILE*.30,TILE*.68,TILE*.68,TILE*.13);
    ctx.fillStyle='#244e47';ctx.fill();
    ctx.translate(0,TILE*.035*press);
    highScoreButtonPath(ctx,-TILE*.34,-TILE*.35,TILE*.68,TILE*.64,TILE*.13);
    ctx.fillStyle='#08201e';ctx.fill();
    ctx.strokeStyle='#75cbbb';ctx.lineWidth=TILE*.024;ctx.stroke();
    // The face gently depresses; only its full arrow rotates. The key itself
    // stays upright, so UP reads as a keyboard / D-pad input at a glance.
    ctx.rotate(direction.x<0?-Math.PI/2:direction.x>0?Math.PI/2:direction.y>0?Math.PI:0);
    ctx.strokeStyle='#d3fff5';ctx.lineWidth=TILE*.048;
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(0,TILE*.16);ctx.lineTo(0,-TILE*.18);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-TILE*.14,-TILE*.035);
    ctx.lineTo(0,-TILE*.18);ctx.lineTo(TILE*.14,-TILE*.035);ctx.stroke();
    ctx.restore();
  }

  function drawLiveTutorialWorld(world,realTime=performance.now()){
    const t=world.now;
    ctx.save();
    ctx.translate(TUTORIAL_WORLD_X,TUTORIAL_WORLD_Y);
    ctx.scale(TUTORIAL_WORLD_SCALE,TUTORIAL_WORLD_SCALE);
    for(const p of world.players) drawPlayerPhosphorTrail(p,t,{forceVisible:true});
    for(const e of world.eggs) if(!e.removed) drawEgg(e,t);
    for(const f of world.fruits) if(!f.removed) drawFruit(f,t);
    for(const s of world.snakes) drawSnakeEntity(s,t,{
      forceVisible:true,animate:true,ignoreGameOverFreeze:true
    });
    for(const s of world.scorpions) if(!s.removed) drawScorpionEntity(s,t,{forceVisible:true});
    for(const h of world.hunters) if(!h.removed) drawHunter(h,t,{forceVisible:true});
    for(const effect of world.blooms) drawConsumedCreatureBloom(effect,t,{forceVisible:true});
    for(const p of world.players){
      if(p.dead){
        drawDeathSpriteAt(p.deathX,p.deathY,{
          palette:p.id===2?'p2':'p1',alpha:deathSkeletonPulseAlpha(p,t)
        });
      }else{
        drawPlayer(p,t,world.players,{
          forceVisible:true,leader:!!world.duel&&isUniqueLeader(p,world.players),
          levelFlash:!!world.clearedAt&&
            t-world.clearedAt<LEVEL_COMPLETE_TOTAL_GAME_MS&&
            Math.floor((t-world.clearedAt)/LEVEL_COMPLETE_PULSE_HALF_GAME_MS)%2===0
        });
      }
    }
    // Same world-space light and power/death glow as gameplay. This context
    // already carries the mini-maze transform; instructional graphics stay
    // above the lighting, and the caller clips it to the demonstration board.
    TutorialLighting?.render(ctx,world.players,TUTORIAL_LIGHT_CAMERA,realTime,t);
    if(world.showSnakeHeads&&world.lastFragments){
      world.lastFragments.forEach((s,index)=>{
        const h=snakeSegmentVisualPosition(s,0,t,s.renderHeadPosition,true);
        drawBitmapText(ctx,index?'NEW HEAD':'OLD HEAD',(h.x+.5)*TILE,(h.y-.25)*TILE,
          {scale:.22,align:'center'});
      });
    }
    // Last world-space pass: the key floats above actors, effects and Dusk.
    // Real time keeps it blinking during the presentation's reading holds.
    for(const cue of world.cues){
      if(t>=cue.from) drawTutorialInputCue(cue,cue.direction,realTime);
    }
    ctx.restore();
  }

  function drawTutorialCaptionPlate(x,y,width,height,alpha=.9,radius=8){
    // Tiny live overlays need only a flat rounded fill: no textures, blur,
    // gradients or temporary canvases while the demonstration is running.
    ctx.save();
    highScoreButtonPath(ctx,x,y,width,height,radius);
    ctx.globalAlpha=alpha;ctx.fillStyle='#030d11';ctx.fill();
    ctx.restore();
  }

  function drawTutorialDuelCards(world){
    if(!world.duel) return;
    for(const p of world.players){
      const x=p.id===1?128:570;
      drawTutorialCaptionPlate(x,241,326,65,.96,12);
      ctx.save();
      highScoreButtonPath(ctx,x,241,326,65,12);
      ctx.strokeStyle='rgba(77,150,130,.42)';ctx.lineWidth=1;ctx.stroke();
      ctx.restore();
      const identity=p.id===1?'P1 GREEN':'P2 PINK';
      drawBitmapText(ctx,`${identity}  ${String(p.score).padStart(5,'0')}`,x+163,250,
        {scale:.72,align:'center',fontSprites:p.id===1?FontSprites:RedFontSprites});
      const state=p.dead?'EATEN':isSpawnProtected(p,world.now)?'SPAWN SHIELD':
        isPowerMode(p,world.now)?'POWER MODE':isUniqueLeader(p,world.players)?'SCORE LEADER':'NORMAL';
      drawBitmapText(ctx,state,x+163,278,{scale:.64,align:'center'});
    }
  }

  function drawLiveTutorialDemo(t){
    const world=tutorialWorldAt(t);
    prepareTutorialMazeCache(tutorialPage);
    ctx.save();
    // Eight layout pixels trim only the solid corner walls, not corridors.
    highScoreButtonPath(ctx,TUTORIAL_WORLD_X,TUTORIAL_WORLD_Y,
      TUTORIAL_WORLD_WIDTH,TUTORIAL_WORLD_HEIGHT,8);
    ctx.clip();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(tutorialMazeCanvas,0,0,tutorialMazeCanvas.width,tutorialMazeCanvas.height,
      TUTORIAL_WORLD_X,TUTORIAL_WORLD_Y,TUTORIAL_WORLD_WIDTH,TUTORIAL_WORLD_HEIGHT);
    drawLiveTutorialWorld(world,t);ctx.restore();
    drawTutorialDuelCards(world);
    // Captions sit over boundary wall rows, never over a moving actor.
    ctx.save();
    drawTutorialCaptionPlate(160,198,672,30);
    drawBitmapText(ctx,world.status,512,206,{scale:.7,align:'center',fontSprites:RedFontSprites});
    drawTutorialCaptionPlate(112,452,800,25,.86);
    drawBitmapText(ctx,world.detail,512,459,{scale:.58,align:'center'});
    if(world.powerPlayer){
      const reserve=Math.max(0,world.powerPlayer.powerModeUntil-world.now);
      drawTutorialCaptionPlate(844,199,94,25);
      drawBitmapText(ctx,`POWER ${(reserve/1000).toFixed(1)}`,930,207,{scale:.5,align:'right'});
    }
    if(world.showCount) drawBitmapText(ctx,`SNAKES ${String(world.snakes.length).padStart(2,'0')}`,
      512,242,{scale:.58,align:'center'});
    const chapters=TUTORIAL_CHAPTERS[tutorialPage];
    if(chapters.length>1){
      drawBitmapText(ctx,world.chapterName,124,493,{scale:.5,align:'left'});
      drawBitmapText(ctx,`DEMO ${world.chapter+1} OF ${chapters.length}`,
        900,493,{scale:.5,align:'right'});
    }
    // Fade only the miniature stage, never the instructions or navigation.
    // The old world reaches complete darkness before the next one is built.
    if(world.transitionAlpha>0){
      drawTutorialCaptionPlate(TUTORIAL_WORLD_X,TUTORIAL_WORLD_Y,
        TUTORIAL_WORLD_WIDTH,TUTORIAL_WORLD_HEIGHT,world.transitionAlpha,8);
    }
    ctx.restore();
  }

  function tutorialDiagnosticsFor(world=tutorialRuntime){
    return {
      renderer:'Shared gameplay movement, snake geometry, effects and duel rules',
      pages:TUTORIAL_SCENES.length,grid:`${TUTORIAL_WORLD_COLUMNS}x${TUTORIAL_WORLD_ROWS}`,
      mazeCacheKey:tutorialMazeCacheKey,
      mazeCachePixels:`${tutorialMazeCanvas.width}x${tutorialMazeCanvas.height}`,
      routesValidated:true,bodyOrder:'HEAD_TO_TAIL',playbackRate:TUTORIAL_PLAYBACK_RATE,
      page:world?world.page+1:null,chapter:world?world.chapter+1:null,
      status:world?.status,detail:world?.detail,bites:world?.bites,
      localMs:world?world.now-TUTORIAL_CLOCK_ORIGIN:0,
      presentationPhase:world?.presentationPhase,transitionAlpha:world?.transitionAlpha,
      players:world?.players.map(p=>({id:p.id,x:p.x,y:p.y,dead:p.dead,score:p.score,
        visual:playerVisualPosition(p,world.now),powered:isPowerMode(p,world.now),
        shield:isSpawnProtected(p,world.now)})),
      snakes:world?.snakes.map(s=>({length:s.body.length,head:s.body[0],
        tail:s.body.at(-1),dir:s.dir,body:s.body,
        visualHead:snakeSegmentVisualPosition(s,0,world.now,null,true),
        visualTail:snakeSegmentVisualPosition(s,s.body.length-1,world.now,null,true)})),
      effects:world?.blooms.filter(e=>e.active&&world.now-e.startedAt<SNAKE_BITE_BLOOM_DURATION_GAME_MS)
        .map(e=>({x:e.x,y:e.y,age:world.now-e.startedAt,player:e.player.id}))
    };
  }
  globalThis.__mazeBitersTutorialDiagnostics=()=>tutorialDiagnosticsFor();

  function drawTutorialScreen(t=performance.now()){
    const page=TUTORIAL_PAGES[tutorialPage];
    beginHighScoreScreen(
      'HOW TO PLAY',
      `NEON TRAINING ${tutorialPage+1} OF ${TUTORIAL_PAGES.length}`,t
    );
    drawBitmapText(ctx,page.title,512,152,{
      scale:1.25,align:'center',fontSprites:RedFontSprites
    });
    drawLiveTutorialDemo(t);
    page.lines.forEach((line,index)=>{
      drawBitmapText(ctx,line,512,510+index*30,{
        scale:.72,align:'center',
        fontSprites:index===0?RedFontSprites:FontSprites
      });
    });
    drawBitmapText(ctx,`PAGE ${tutorialPage+1} OF ${TUTORIAL_PAGES.length}`,512,614,{
      scale:.72,align:'center'
    });

    const labels=[
      'PREV',
      tutorialPage===TUTORIAL_PAGES.length-1?'PLAY SOLO':'NEXT',
      'EXIT'
    ];
    if(tutorialActionEnabled(tutorialAction))
      MenuLighting?.setFocus('tutorial',tutorialAction,TUTORIAL_ACTION_AREAS[tutorialAction],t);
    else MenuLighting?.resetFocus('tutorial');
    TUTORIAL_ACTION_AREAS.forEach((area,index)=>{
      const selected=tutorialAction===index;
      const enabled=tutorialActionEnabled(index);
      drawHighScorePanel(area.x,area.y,area.w,area.h,{
        selected,button:true,softFocus:true,alpha:enabled?1:.28
      });
    });
    MenuLighting?.drawFocus(ctx,'tutorial',t,HIGH_SCORE_BOARD_LIGHT_CLIP);
    TUTORIAL_ACTION_AREAS.forEach((area,index)=>{
      const enabled=tutorialActionEnabled(index);
      ctx.save();
      ctx.globalAlpha=enabled?1:.28;
      drawBitmapText(ctx,labels[index],area.x+area.w/2,area.y+15,{
        scale:labels[index]==='PLAY SOLO'?1:1.25,
        align:'center',
        fontSprites:index===1?RedFontSprites:FontSprites
      });
      ctx.restore();
    });
    drawBitmapText(
      ctx,'ARROWS AND SPACE  D PAD AND A  ESC OR B EXITS',512,718,
      {scale:.65,align:'center'}
    );
    endHighScoreScreen();
  }

  let menuLightingLastScreen=null;
  function drawBufferedTitleFrame(t=performance.now()){
    if(menuLightingLastScreen!==titleScreenMode){
      MenuLighting?.resetFocus();
      highScoreNameLightDraft='';highScoreNameLightIndex=-1;
      highScoreNameLightStartedAt=-Infinity;
      menuLightingLastScreen=titleScreenMode;
    }
    // The complete animated menu is built away from the screen. This keeps
    // large 160 px atlas/filter work from ever exposing a half-finished frame
    // on Chrome, Safari/iPadOS, or a 120 Hz fullscreen display.
    // Every branch starts with drawTitleInterfaceLayer's full, opaque copy
    // at the same backing size. A black prefill here only writes the entire
    // HD/4K surface twice. Keep the offscreen frame and final atomic present.
    const previousCtx=ctx;
    ctx=titleFrameContext;
    try{
      if(titleScreenMode==='entry') drawHighScoreEntryScreen(t);
      else if(titleScreenMode==='leaderboard') drawHighScoreLeaderboardScreen(t);
      else if(titleScreenMode==='tutorial') drawTutorialScreen(t);
      else drawMazeBitersTitleScreen(t);
    }finally{
      ctx=previousCtx;
    }

    // Present one opaque, finished frame in a single compositing operation.
    displayCtx.save();
    displayCtx.setTransform(1,0,0,1,0,0);
    displayCtx.globalAlpha=1;
    displayCtx.globalCompositeOperation='copy';
    displayCtx.filter='none';
    displayCtx.imageSmoothingEnabled=false;
    displayCtx.drawImage(titleFrameCanvas,0,0,canvas.width,canvas.height);
    displayCtx.restore();
  }

  function overlay(a,b='',c='',t=performance.now(),pulseKind='') {
    ctx.save();
    ctx.translate(GAME_CONTENT_OFFSET_X,GAME_CONTENT_OFFSET_Y);
    ctx.fillStyle='rgba(0,0,0,.82)';
    const compactStatusFrame=(a==='GAME OVER'||a==='PAUSE'||
      pulseKind==='levelComplete')&&
      !b&&!c;
    // GAME OVER, PAUSE and LEVEL CLEARED share the compact 56-pixel frame. With the
    // 24-pixel lettering centred at y=160, the upper and lower margins are
    // mathematically identical (16 logical pixels each).
    ctx.fillRect(48,c?124:(compactStatusFrame?144:136),
      416,c?136:(compactStatusFrame?56:104));

    const shouldPulse=a==='GAME OVER'||a==='PAUSE'||a==='SELECT GAME'||
      pulseKind==='levelComplete';
    const pulse=pulseKind==='pause'
      ?pausePulseAlpha(t)
      :pulseKind==='levelComplete'
        ?levelCompletionPulseAlpha(t)
        :a==='GAME OVER'
          ?gameOverPulseAlpha(t)
          :shouldPulse
            ?strongPulseAlpha(t)
            :1;
    ctx.save();
    ctx.globalAlpha=pulse;
    drawBitmapText(ctx,a,256,c?144:160,{scale:c?1.25:1.5,align:'center'});
    if(b) drawBitmapText(ctx,b,256,c?190:208,{scale:1,align:'center'});
    if(c) drawBitmapText(ctx,c,256,222,{scale:1,align:'center'});
    ctx.restore();
    ctx.restore();
  }

  let frameErrorLogged=false;
  // One cadence for menu, gameplay and overlays. The game never deliberately
  // falls back to 60/30 Hz; requestAnimationFrame still naturally follows the
  // physical refresh rate when a display/browser cannot present 120 frames.
  const FIXED_RENDER_FPS=120;
  let renderFrameTokens=1;
  let lastAnimationCallbackAt=NaN;
  let renderCostEma=0;
  let renderedFramesInWindow=0;
  let renderFpsWindowStartedAt=performance.now();
  let measuredRenderFps=0;

  function shouldRenderAnimationCallback(t){
    if(!Number.isFinite(lastAnimationCallbackAt)){
      lastAnimationCallbackAt=t;
      return true;
    }
    const callbackDelta=Math.max(0,Math.min(100,t-lastAnimationCallbackAt));
    lastAnimationCallbackAt=t;
    renderFrameTokens=Math.min(
      2,
      renderFrameTokens+callbackDelta*FIXED_RENDER_FPS/1000
    );
    if(renderFrameTokens<1) return false;
    renderFrameTokens-=1;
    return true;
  }

  function recordRenderedFrame(t,renderCost){
    renderCostEma=renderCostEma
      ? renderCostEma*0.94+renderCost*0.06
      : renderCost;

    renderedFramesInWindow++;
    const fpsWindowAge=t-renderFpsWindowStartedAt;
    if(fpsWindowAge>=1000){
      measuredRenderFps=renderedFramesInWindow*1000/fpsWindowAge;
      renderedFramesInWindow=0;
      renderFpsWindowStartedAt=t;
    }

  }

  globalThis.__mazeBitersRenderDiagnostics=()=>({
    targetFps:FIXED_RENDER_FPS,
    measuredFps:+measuredRenderFps.toFixed(1),
    averageFrameCostMs:+renderCostEma.toFixed(2),
    adaptive:false,
    locked120Hz:true,
    mobileHd:true,
    grid:`${COLS}x${ROWS}`,
    logicalTile:TILE,
    displayQuality:activeDisplayQuality,
    physicalTile:TILE*GAME_RENDER_SCALE,
    backingStore:`${GAME_BACKING_WIDTH}x${GAME_BACKING_HEIGHT}`,
    mazeCachePhysicalTile:TILE*MAZE_CACHE_RENDER_SCALE,
    mazeCacheBackingStore:
      `${MAZE_CACHE_BACKING_WIDTH}x${MAZE_CACHE_BACKING_HEIGHT}`,
    isolatedSnakeSpriteCells:isolatedSnakeSpriteCount,
    hiResAtlasLoadStarted,
    titleHiResConceptLoadStarted,
    nativeSnakeSprites:true,
    staticMazeLayer:true,
    firstZoomPreheated,
    titleFps:FIXED_RENDER_FPS,
    titleUsesUnifiedCadence:true,
    staticOverlayFps:FIXED_RENDER_FPS,
    hudAnimationFps:1000/HUD_ANIMATION_INTERVAL_MS
  });

  function drawFrameError(error){
    // A visible diagnostic is preferable to a silent black canvas if a future
    // experimental visual effect fails in a particular browser.
    ctx.save();
    if(typeof ctx.setTransform==='function') ctx.setTransform(1,0,0,1,0,0);
    ctx.globalAlpha=1;
    ctx.filter='none';
    ctx.fillStyle='#000';
    ctx.fillRect(0,0,GAME_LOGICAL_WIDTH,GAME_LOGICAL_HEIGHT);
    ctx.fillStyle='#ffcc66';
    ctx.font='bold 14px monospace';
    ctx.textAlign='center';
    ctx.fillText('RENDER RECOVERY',GAME_LOGICAL_WIDTH/2,GAME_LOGICAL_HEIGHT/2-10);
    ctx.fillStyle='#fff';
    ctx.font='11px monospace';
    ctx.fillText('PRESS R TO START AGAIN',GAME_LOGICAL_WIDTH/2,GAME_LOGICAL_HEIGHT/2+14);
    ctx.restore();
  }

  function loop(t) {
    // Poll independently of presentation so every available controller sample
    // reaches the fixed 120 Hz game renderer.
    GamepadControl.poll();
    // Render at a fixed internal maximum of 120 Hz. A token accumulator caps
    // future 144/165 Hz displays without introducing any 60/30 Hz fallback.
    if(!shouldRenderAnimationCallback(t)){
      requestAnimationFrame(loop);
      return;
    }
    // Autonomous tilt is visible only on presented frames. Keep controller
    // polling above uncapped, but avoid AI/hunter angle work on callbacks that
    // the fixed 120 Hz renderer deliberately discards.
    updateAutonomousCharacterTilts(t,gameTimeNow());
    // Menu, gameplay, PAUSE and GAME OVER share this one 120 Hz scheduler.
    // This prevents cadence changes from presenting as a full-screen flicker.

    const renderStartedAt=performance.now();
    try{
      if(awaitingPlayerSelection){
        // The menu has no live inhabitants. Draw only its visual layer;
        // do not advance clocks, update AI or allocate gameplay collections.
        draw(t,CentralGameClock.now());
      }else{
        const gameTime=CentralGameClock.advance(
          t,
          !paused&&!gameOverStopsWorld()&&!document.hidden
        );
        update(gameTime,t);
        draw(t,gameTime);
      }
      frameErrorLogged=false;
    }catch(error){
      if(!frameErrorLogged){
        console.error('Maze Biters frame error:',error);
        frameErrorLogged=true;
      }
      drawFrameError(error);
    }
    recordRenderedFrame(t,performance.now()-renderStartedAt);
    requestAnimationFrame(loop);
  }

  function reanchorRenderCadence(realNow=performance.now()){
    CentralGameClock.reanchor(realNow);
    lastAnimationCallbackAt=realNow;
    renderFrameTokens=1;
    renderedFramesInWindow=0;
    renderFpsWindowStartedAt=realNow;
  }

  document.addEventListener?.('visibilitychange',()=>{
    reanchorRenderCadence(performance.now());
    if(!document.hidden) SoundManager.unlock();
  });
  // Browser focus changes must not leave a large accumulated frame delta that
  // appears as a full-screen flash when the game becomes active again.
  addEventListener('focus',()=>reanchorRenderCadence(performance.now()),{passive:true});
  addEventListener('blur',()=>reanchorRenderCadence(performance.now()),{passive:true});

  addEventListener('keydown',e=>{
    SoundManager.unlockFromGesture();
    MediaMusic.unlockFromGesture();
    if(awaitingPlayerSelection) MenuMusic.start();
    const k=e.key.length===1?e.key.toLowerCase():e.key;
    keys[k]=true;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();

    if(e.key==='Escape'){
      e.preventDefault();
      if(!e.repeat){
        if(awaitingPlayerSelection&&titleScreenMode!=='menu'){
          handleTitleBack();
          return;
        }
        // ESC is a deliberate screen/action selection, so it shares the same
        // confirmed-choice cue used for starting a mode or opening a screen.
        playSound('SnakeSELECT&Appear@');
        // A second ESC skips the remaining presentation. The tracked level
        // voice continues from its current gain and reaches zero in 0.25 s.
        if(gameOver) completeGameOverPresentation(0.25);
        else beginImmediateGameOver(performance.now(),true);
      }
      return;
    }

    if(awaitingPlayerSelection&&titleScreenMode==='entry'){
      e.preventDefault();
      if(e.repeat) return;
      const entryDirection={
        ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'
      }[e.key];
      if(entryDirection){
        moveHighScoreEntryFocus(entryDirection);
        return;
      }
      if(e.key===' '){
        if(highScoreKeyboardNavigationActive) activateHighScoreEntryFocus();
        return;
      }
      if(e.key==='Backspace'||e.key==='Delete'){
        deleteHighScoreNameCharacter();
        return;
      }
      if(e.key==='Enter'){
        saveHighScoreEntry();
        return;
      }
      if(e.key.length===1){
        const character=HighScoreService?.sanitizeName?.(e.key)||'';
        if(character.length===1){
          highScoreKeyboardNavigationActive=false;
          appendHighScoreNameCharacter(character);
        }
      }
      return;
    }

    if(awaitingPlayerSelection&&titleScreenMode==='menu'&&/^[1-6]$/.test(k)){
      e.preventDefault();
      const selectedEntry=TITLE_MODE_HIT_AREAS.find(entry=>entry.key===Number(k));
      if(!e.repeat&&selectedEntry){
        const titleActionAt=performance.now();
        focusTitleChoice(`mode:${selectedEntry.mode}`,{t:titleActionAt});
        selectTitleMode(selectedEntry.mode,titleActionAt);
      }
      return;
    }
    if(awaitingPlayerSelection){
      const menuDirection={
        ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'
      }[e.key];
      if(menuDirection){
        if(!e.repeat) moveTitleFocus(menuDirection);
        return;
      }
      if(e.key===' '||e.key==='Enter'){
        if(!e.repeat) activateTitleFocus();
        return;
      }
      return;
    }
    if(gameOver) return;

    if(/^[0-9]$/.test(k)){
      e.preventDefault();
      if(!e.repeat) enterExperimentalLevelDigit(k);
      return;
    }

    if(KEYBOARD_DIRECTIONS[k]) pressKeyboardDirection(k);
    else if(k==='p'&&!e.repeat){
      e.preventDefault();
      setPaused(!paused,performance.now());
    }
  });
  addEventListener('keyup',e=>{
    const k=e.key.length===1?e.key.toLowerCase():e.key;
    keys[k]=false;
    if(KEYBOARD_DIRECTIONS[k]) releaseKeyboardDirection(k);
  });

  highScoreNameInput?.addEventListener('input',event=>{
    if(titleScreenMode!=='entry') return;
    highScoreKeyboardNavigationActive=false;
    setHighScoreNameDraft(event.target.value);
  });

  function titleModeFromPointer(e){
    const {x,y}=titlePointerPosition(e);
    const entry=TITLE_MODE_HIT_AREAS.find(area=>
      x>=area.x&&x<area.x+area.w&&y>=area.y&&y<area.y+area.h
    );
    return entry ? entry.mode : null;
  }

  function titleAreaFromPointer(e,area){
    const {x,y}=titlePointerPosition(e);
    return x>=area.x&&x<area.x+area.w&&y>=area.y&&y<area.y+area.h;
  }

  function titlePointerPosition(e){
    const bounds=canvas.getBoundingClientRect();
    const contentX=e.clientX-bounds.left-canvas.clientLeft;
    const contentY=e.clientY-bounds.top-canvas.clientTop;
    const x=contentX*(TITLE_LOGICAL_WIDTH/canvas.clientWidth)/TITLE_LAYOUT_SCALE;
    const y=contentY*(TITLE_LOGICAL_HEIGHT/canvas.clientHeight)/TITLE_LAYOUT_SCALE;
    return {x,y};
  }

  function handleHighScorePointer(e){
    const {x,y}=titlePointerPosition(e);
    if(titleScreenMode==='tutorial'){
      const actionIndex=TUTORIAL_ACTION_AREAS.findIndex(area=>
        x>=area.x&&x<area.x+area.w&&y>=area.y&&y<area.y+area.h
      );
      if(actionIndex>=0&&tutorialActionEnabled(actionIndex)){
        tutorialAction=actionIndex;
        activateTutorialFocus();
      }
      return true;
    }
    if(titleScreenMode==='entry'){
      highScoreNameInput?.focus?.({preventScroll:true});
      const keyboardLeft=192;
      const keyboardTop=304;
      const cellWidth=80;
      const cellHeight=48;
      if(x>=keyboardLeft&&x<keyboardLeft+cellWidth*8&&
         y>=keyboardTop&&y<keyboardTop+cellHeight*5){
        highScoreKeyboardColumn=Math.floor((x-keyboardLeft)/cellWidth);
        highScoreKeyboardRow=Math.floor((y-keyboardTop)/cellHeight);
        activateHighScoreEntryFocus();
        return true;
      }
      const actions=[
        {x:180,y:570,w:200,h:54},
        {x:412,y:570,w:200,h:54},
        {x:644,y:570,w:200,h:54}
      ];
      const actionIndex=actions.findIndex(area=>
        x>=area.x&&x<area.x+area.w&&y>=area.y&&y<area.y+area.h
      );
      if(actionIndex>=0){
        highScoreKeyboardRow=5;
        highScoreKeyboardColumn=actionIndex;
        activateHighScoreEntryFocus();
      }
      return true;
    }
    if(titleScreenMode==='leaderboard'){
      const actions=[
        {x:176,y:650,w:200,h:54},
        {x:412,y:650,w:200,h:54},
        {x:648,y:650,w:200,h:54}
      ];
      const actionIndex=actions.findIndex(area=>
        x>=area.x&&x<area.x+area.w&&y>=area.y&&y<area.y+area.h
      );
      if(actionIndex>=0){
        highScoreLeaderboardAction=actionIndex;
        activateHighScoreLeaderboardFocus();
      }
      return true;
    }
    return false;
  }

  function titleSpeedFromPointer(e){
    return titleAreaFromPointer(e,TITLE_SPEED_HIT_AREA);
  }

  function pointerDistanceToMazeSegment(px,py,x1,y1,x2,y2){
    const dx=x2-x1,dy=y2-y1;
    const lengthSquared=dx*dx+dy*dy;
    const progress=lengthSquared
      ? Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/lengthSquared))
      : 0;
    const nearestX=x1+dx*progress;
    const nearestY=y1+dy*progress;
    return Math.hypot(px-nearestX,py-nearestY);
  }

  function pointerMazeBoundaryMasks(){
    if(pointerMazeBoundaryMasks.revision!==mazeRevision){
      const blocks=mergedMazeSolidBlockMap();
      const territory=mergedMazeTerritoryMap(blocks);
      pointerMazeBoundaryMasks.masks=mergedMazeBoundaryMasks(blocks,territory);
      pointerMazeBoundaryMasks.revision=mazeRevision;
    }
    return pointerMazeBoundaryMasks.masks;
  }
  pointerMazeBoundaryMasks.revision=-1;
  pointerMazeBoundaryMasks.masks=null;

  function pointerHitsVisibleMazeNeon(pointerX,pointerY,cellX,cellY){
    if(!isWall(cellX,cellY)) return false;
    const masks=pointerMazeBoundaryMasks();
    const mask=masks?.[cellY]?.[cellX];
    // Null masks are the invisible interior of a merged wall territory.
    if(mask===null||mask===undefined) return false;

    const localX=pointerX-cellX*TILE;
    const localY=pointerY-cellY*TILE;
    const centre=TILE*0.5;
    const hitRadius=TILE*0.29;
    let distance=Math.hypot(localX-centre,localY-centre);
    const checkArm=(bit,x2,y2)=>{
      if(mask&bit){
        distance=Math.min(distance,pointerDistanceToMazeSegment(
          localX,localY,centre,centre,x2,y2
        ));
      }
    };
    checkArm(1,centre,0);
    checkArm(2,TILE,centre);
    checkArm(4,centre,TILE);
    checkArm(8,0,centre);
    return distance<=hitRadius;
  }

  function pointerNavigationTarget(pointerX,pointerY,rawTarget){
    if(!isWall(rawTarget.x,rawTarget.y)){
      return {x:rawTarget.x,y:rawTarget.y};
    }
    if(!pointerHitsVisibleMazeNeon(
      pointerX,pointerY,rawTarget.x,rawTarget.y
    )) return null;

    // Only a pointer press is being handled here, so a full 36x25 scan is
    // inexpensive and gives an exact nearest corridor centre at every scale.
    let nearest=null;
    let nearestDistance=Infinity;
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        if(isWall(x,y)) continue;
        const dx=pointerX-(x+0.5)*TILE;
        const dy=pointerY-(y+0.5)*TILE;
        const distance=dx*dx+dy*dy;
        if(distance<nearestDistance){
          nearestDistance=distance;
          nearest={x,y};
        }
      }
    }
    return nearest;
  }

  function setDirectionFromPointer(e){
    if(gameOver||paused||awaitingPlayerSelection) return;
    const bounds=canvas.getBoundingClientRect();
    const screenX=(e.clientX-bounds.left)*(GAME_LOGICAL_WIDTH/bounds.width);
    const screenY=(e.clientY-bounds.top)*(GAME_LOGICAL_HEIGHT/bounds.height);
    // Convert the visible, zoomed screen position back into maze coordinates.
    const pointerX=gameplayCamera.x+
      (screenX-GAME_LOGICAL_WIDTH/2)/gameplayCamera.zoom;
    const pointerY=gameplayCamera.y+
      (screenY-GAME_LOGICAL_HEIGHT/2)/gameplayCamera.zoom;
    const candidates=livingHumanPlayers();
    if(!candidates.length) return;
    const rawTarget={
      x:Math.max(0,Math.min(COLS-1,Math.floor(pointerX/TILE))),
      y:Math.max(0,Math.min(ROWS-1,Math.floor(pointerY/TILE)))
    };
    // Tunnel presses remain exact. The visible neon pipe receives a modest
    // assist area and resolves to the physically nearest walkable cell; the
    // rest of a wall cell and invisible solid interiors remain inert.
    const target=pointerNavigationTarget(pointerX,pointerY,rawTarget);
    if(!target) return;
    const now=gameTimeNow();
    const p=candidates.map(candidate=>{
      const routeDistance=MazeBrain.routeDistance(candidate,target,now);
      const visual=playerVisualPosition(candidate);
      const visualDistance=(pointerX-(visual.x+0.5)*TILE)**2+
        (pointerY-(visual.y+0.5)*TILE)**2;
      return {candidate,routeDistance,visualDistance};
    }).sort((a,b)=>{
      if(a.routeDistance!==b.routeDistance)
        return a.routeDistance-b.routeDistance;
      return a.visualDistance-b.visualDistance;
    })[0].candidate;
    /* The nearest player is selected by actual maze distance. Visual distance
       resolves only an exact route-distance tie. */

    clearPlayerKeyboardControl(p);
    p.pointerMomentum=true;

    if(p.x===target.x&&p.y===target.y){
      // Tapping the current cell explicitly hands control to pointer momentum.
      p.pointerNavigation=null;
      p.nextDir={...p.dir};
      p.waitingForInput=false;
      return;
    }

    p.pointerNavigation={x:target.x,y:target.y};
    const firstStep=pointerNavigationStep(p,now);
    p.nextDir=firstStep?{...firstStep}:{...p.dir};
    if(!firstStep) p.pointerNavigation=null;
    p.waitingForInput=false;
  }

  canvas.addEventListener('pointerdown',e=>{
    e.preventDefault();
    SoundManager.unlockFromGesture();
    MediaMusic.unlockFromGesture();
    if(awaitingPlayerSelection){
      MenuMusic.start();
      if(pendingTitleMode!==null) return;
      if(titleScreenMode!=='menu'){
        handleHighScorePointer(e);
        return;
      }
      const titleActionAt=performance.now();
      if(titleAreaFromPointer(e,TITLE_MUSIC_HIT_AREA)){
        focusTitleChoice('music',{t:titleActionAt});
        cycleTitleMusic(titleActionAt);
        return;
      }
      if(titleSpeedFromPointer(e)){
        focusTitleChoice('speed',{t:titleActionAt});
        cycleTitleSpeed(titleActionAt);
        return;
      }
      if(titleAreaFromPointer(e,TITLE_DIFFICULTY_HIT_AREA)){
        focusTitleChoice('difficulty',{t:titleActionAt});
        cycleTitleDifficulty(titleActionAt);
        return;
      }
      if(titleAreaFromPointer(e,TITLE_HIGH_SCORES_HIT_AREA)){
        focusTitleChoice('highScores',{t:titleActionAt});
        confirmTitleChoice('highScores',titleActionAt);
        openHighScoreLeaderboard();
        return;
      }
      if(titleAreaFromPointer(e,TITLE_QUALITY_HIT_AREA)){
        focusTitleChoice('quality',{t:titleActionAt});
        toggleTitleQuality(titleActionAt);
        return;
      }
      if(titleAreaFromPointer(e,TITLE_HOW_TO_PLAY_HIT_AREA)){
        focusTitleChoice('howToPlay',{t:titleActionAt});
        confirmTitleChoice('howToPlay',titleActionAt);
        openHowToPlay();
        return;
      }
      const mode=titleModeFromPointer(e);
      if(mode!==null){
        focusTitleChoice(`mode:${mode}`,{t:titleActionAt});
        selectTitleMode(mode,titleActionAt);
      }
      return;
    }
    setDirectionFromPointer(e);
  });

  document.getElementById('aiOnly').onclick=()=>selectTitleMode(0);
  document.getElementById('onePlayer').onclick=()=>selectTitleMode(1);
  document.getElementById('twoPlayers').onclick=()=>selectTitleMode(2);
  document.getElementById('twoPlayersCoop').onclick=()=>selectTitleMode(5);
  document.getElementById('onePlayerAi').onclick=()=>selectTitleMode(3);
  document.getElementById('twoPlayersAi').onclick=()=>selectTitleMode(4);
  document.getElementById('howToPlay').onclick=()=>{
    if(!awaitingPlayerSelection||pendingTitleMode!==null) return;
    const t=performance.now();
    focusTitleChoice('howToPlay',{t});
    confirmTitleChoice('howToPlay',t);
    openHowToPlay();
  };

  function waitForRenderImage(image,timeoutMs=3000){
    if(image.complete) return Promise.resolve();
    return new Promise(resolve=>{
      let settled=false;
      const finish=()=>{
        if(settled) return;
        settled=true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout=setTimeout(finish,timeoutMs);
      image.addEventListener('load',finish,{once:true});
      image.addEventListener('error',finish,{once:true});
    });
  }

  async function prepareAllRenderCaches(){
    const atlasImages=Object.values(RenderAtlases);
    await Promise.all(atlasImages.map(waitForRenderImage));
    await Promise.all(atlasImages.map(image=>
      typeof image.decode==='function'
        ?image.decode().catch(()=>{})
        :Promise.resolve()
    ));
    prepareFontRenderCache();
    prepareMazeRenderCache();
    prepareIsolatedSnakeSpriteCache();
    prepareCompetitiveLeaderSpriteCache();
  }

  let firstZoomPreheated=false;
  function preheatFirstGameplayZoom(){
    if(firstZoomPreheated) return;
    renderMazeLayer();

    // Exercise the exact native-world crop-and-presentation path that the
    // first cinematic zoom uses. Keep all warm-up draws on the hidden title
    // surface: mutating the visible canvas here used to expose a black/reset
    // frame on the first run.
    const warmupCtx=titleFrameContext;
    warmupCtx.save();
    if(typeof warmupCtx.setTransform==='function'){
      warmupCtx.setTransform(1,0,0,1,0,0);
    }
    warmupCtx.globalCompositeOperation='copy';
    warmupCtx.globalAlpha=1;
    warmupCtx.filter='none';
    warmupCtx.imageSmoothingEnabled=true;
    warmupCtx.imageSmoothingQuality='high';
    for(const zoom of [1,1.25,1.5,1.75,2]){
      const viewWidth=GAME_LOGICAL_WIDTH/zoom;
      const viewHeight=GAME_LOGICAL_HEIGHT/zoom;
      const viewLeft=(GAME_LOGICAL_WIDTH-viewWidth)/2;
      const viewTop=(GAME_LOGICAL_HEIGHT-viewHeight)/2;
      warmupCtx.drawImage(
        mazeLayerCanvas,
        viewLeft*MAZE_CACHE_RENDER_SCALE,viewTop*MAZE_CACHE_RENDER_SCALE,
        viewWidth*MAZE_CACHE_RENDER_SCALE,
        viewHeight*MAZE_CACHE_RENDER_SCALE,
        0,0,GAME_BACKING_WIDTH,GAME_BACKING_HEIGHT
      );
    }

    // Touch every decoded atlas once. Drawing one source region is sufficient
    // for browsers to upload the complete image resource to the GPU.
    warmupCtx.globalCompositeOperation='source-over';
    warmupCtx.globalAlpha=0.001;
    let warmX=0;
    let warmY=0;
    for(const image of Object.values(RenderAtlases)){
      if(!image?.complete||!image.naturalWidth||!image.naturalHeight) continue;
      warmupCtx.drawImage(
        image,0,0,Math.min(256,image.naturalWidth),Math.min(256,image.naturalHeight),
        warmX,warmY,64,64
      );
      warmX+=64;
      if(warmX>=GAME_BACKING_WIDTH){ warmX=0; warmY+=64; }
    }
    warmupCtx.clearRect(0,0,titleFrameCanvas.width,titleFrameCanvas.height);
    warmupCtx.restore();
    firstZoomPreheated=true;
  }

  async function initializeMazeBiters(){
    try{
      await prepareAllRenderCaches();
    }catch(error){
      console.error('Atlas preparation failed; starting with safe fallbacks.',error);
    }
    fitGameToViewport();
    DuskLighting?.prepare();
    TutorialLighting?.prepare();
    MenuLighting?.prepare();
    prepareHighScoreButtonCache();
    prepareTitleLogoLayer();
    prepareTitleState();
    preheatFirstGameplayZoom();
    configureTitleCanvasResolution();
    HighScoreService?.subscribe?.(entries=>{
      highScoreSnapshot=entries;
      titleHighScoreMaskReady=false;
    });
    HighScoreService?.refresh?.();
    requestAnimationFrame(loop);
  }

  addEventListener('resize',scheduleGameViewportFit,{passive:true});
  if(globalThis.visualViewport){
    globalThis.visualViewport.addEventListener(
      'resize',scheduleGameViewportFit,{passive:true}
    );
  }

  globalThis.__mazeBitersHighScoreDiagnostics=()=>({
    screen:titleScreenMode,
    entries:currentHighScores().length,
    topScore:currentHighScores()[0]?.score||0,
    shared:!!HighScoreService?.isShared?.(),
    pendingCandidate:pendingHighScoreCandidate
      ?{...pendingHighScoreCandidate}
      :null,
    nameLength:highScoreNameDraft.length,
    emptyNameCanSave:!!HighScoreService?.sanitizeName?.('   ')
  });
  globalThis.__mazeBitersReady=initializeMazeBiters();
})();
