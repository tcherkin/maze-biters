import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise production cache/lifetime functions without launching gameplay or
// allocating GPU resources. The canvas fixture only records state and paints.
const source=fs.readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function productionFunction(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`Missing production function ${name}`);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const candidate=source.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw new Error(`Unterminated production function ${name}`);
}
const functions=[
  'watchRenderSurface','restoreRenderSurface','renderSurfaceReady','pollRenderSurfaces',
  'mazeAtlasReadinessState','drawEmergencyMaze','drawMazeWallTo','drawMazeMaskAtCell',
  'renderMazeLayer','prepareTutorialMazeCache','syncMenuSurfaceLifetime','drawBufferedTitleFrame'
].map(productionFunction).join('\n');
function surface(name,width=300,height=150,{events=true,polling=true}={}){
  const listeners=new Map(),calls=[],stack=[];
  let pixelWidth=width,pixelHeight=height;
  const canvas={name,lost:false,resizes:0,calls,
    get width(){return pixelWidth;},set width(value){pixelWidth=value;this.resizes++;reset();},
    get height(){return pixelHeight;},set height(value){pixelHeight=value;this.resizes++;reset();},
    getContext(){return context;},
    emit(type){for(const callback of listeners.get(type)||[]) callback({type,target:this});},
    setLost(lost,emit=true){
      this.lost=lost;reset();calls.length=0;
      if(emit) this.emit(lost?'contextlost':'contextrestored');
    }
  };
  const context={canvas,
    setTransform(...values){this.transform=values;},
    save(){stack.push(this.snapshot());},
    restore(){assert.ok(stack.length);Object.assign(this,stack.pop());},
    snapshot(){return {transform:[...this.transform],globalAlpha:this.globalAlpha,
      globalCompositeOperation:this.globalCompositeOperation,filter:this.filter,
      shadowBlur:this.shadowBlur,imageSmoothingEnabled:this.imageSmoothingEnabled,
      fillStyle:this.fillStyle};},
    fillRect(...args){record('fillRect',args);},
    clearRect(...args){record('clearRect',args);},
    drawImage(image,...args){
      assert.ok(!image.lost,'never copy a lost source');
      record('drawImage',args);calls.at(-1).image=image;
    }
  };
  function record(method,args){
    assert.ok(!canvas.lost,`${name}: no paints while context is lost`);
    assert.ok(args.every(Number.isFinite));
    calls.push({method,args,state:context.snapshot()});
  }
  function reset(){
    Object.assign(context,{transform:[1,0,0,1,0,0],globalAlpha:1,
      globalCompositeOperation:'source-over',filter:'none',shadowBlur:0,
      imageSmoothingEnabled:true,fillStyle:'#000'});
    stack.length=0;
  }
  if(events) canvas.addEventListener=(type,callback)=>{
    if(!listeners.has(type)) listeners.set(type,[]);
    listeners.get(type).push(callback);
  };
  if(polling) context.isContextLost=()=>canvas.lost;
  reset();canvas.context=context;
  return canvas;
}

function fixture(options={}){
  const mazeCanvas=surface('world',2880,2000,options);
  const tutorialCanvas=surface('tutorial',300,150,options);
  const readiness=new Map([['walls',true],['trim',true],['legacy',true]]);
  const paints=[],atlasChecks=[];
  const theme={name:'green',fallbackOuter:'#164832',fallbackInner:'#347c51'};
  const world=[['#','.','#'],['.','.','#']];
  const training=[['#','.','.','#'],['#','.','#','#']];
  let globals;
  globals={
    TILE:16,renderSurfaceStates:new WeakMap(),watchedRenderSurfaces:[],
    renderSurfaceRecoveryCount:0,
    mazeLayerCanvas:mazeCanvas,mazeLayerContext:mazeCanvas.context,
    mazeLayerRevision:-1,mazeLayerThemeName:'',mazeLayerAtlasState:-1,
    mazeAtlasImageKeys:null,mazeLayerPaintCount:0,mazeRevision:10,maze:world,
    mazeColorTheme:theme,MAZE_CACHE_RENDER_SCALE:5,
    RenderAtlasData:{conceptMaze:{a:['walls'],b:['walls'],c:['trim']},maze:{a:['legacy']}},
    atlasImageReady(name){atlasChecks.push(name);return readiness.get(name)===true;},
    paintMazeArtwork(target,settings){
      assert.ok(!target.canvas.lost,'artwork painter cannot target a lost context');
      if(globals.failPaint) throw new Error('injected artwork failure');
      paints.push({target:target.canvas,settings,state:target.snapshot(),
        maze:globals.maze,theme:globals.mazeColorTheme,revision:globals.mazeRevision});
    },
    tutorialMazeCanvas:tutorialCanvas,tutorialMazeContext:tutorialCanvas.context,
    tutorialMazeCacheKey:'',activeDisplayQuality:'HD',activeDisplayProfile:{sourceTilePixels:80},
    TUTORIAL_WORLD_COLUMNS:24,TUTORIAL_WORLD_ROWS:8,
    TUTORIAL_RENDER_OFFSET_X:6,TUTORIAL_RENDER_OFFSET_Y:8,
    TUTORIAL_SCENES:[{theme},{theme:{...theme,name:'violet'}}],
    TUTORIAL_RENDER_GRIDS:[training,training.map(row=>row.slice().reverse())],
    ConceptMazeRenderCache:new Map(),MazeRenderCache:new Map(),
    mazeBorderMask:()=>5,mazeWallFadeAxis:()=> 'horizontal',
    mazeRenderKey:(color,mask,axis)=>`${color.name}|${mask}|${axis}`,
    atlasDraws:[],atlasCanDraw:false,
    drawAtlasRegion(target,region,...args){
      globals.atlasDraws.push({target,region,args});return globals.atlasCanDraw;
    }
  };
  const runtime=vm.createContext(globals);
  vm.runInContext(functions,runtime,{filename:'render-recovery-production.js',timeout:2000});
  globals.watchRenderSurface(mazeCanvas,mazeCanvas.context,()=>{globals.mazeLayerRevision=-1;});
  globals.watchRenderSurface(tutorialCanvas,tutorialCanvas.context,()=>{globals.tutorialMazeCacheKey='';});
  return {api:globals,mazeCanvas,tutorialCanvas,readiness,paints,atlasChecks,world,theme};
}

// A stable fallback is as cacheable as the final artwork. Late image success
// changes readiness exactly once; failed images must not force 120 big bakes.
const warm=fixture();
for(let frame=0;frame<120;frame++) assert.equal(warm.api.renderMazeLayer(),true);
assert.equal(warm.paints.length,1);assert.equal(warm.api.mazeLayerPaintCount,1);
assert.equal(warm.mazeCanvas.resizes,0,'steady world rendering never resets its backing store');
assert.deepEqual(warm.paints[0].state.transform,[5,0,0,5,0,0]);
assert.equal(warm.mazeCanvas.calls[0].method,'clearRect');
assert.deepEqual(warm.mazeCanvas.calls[0].state.transform,[1,0,0,1,0,0]);
assert.equal(warm.atlasChecks.length,240,'check two unique images, not three atlas regions');
assert.equal(warm.api.mazeAtlasReadinessState(),3);
warm.readiness.set('walls',false);
assert.equal(warm.api.mazeAtlasReadinessState(),2);
warm.readiness.set('trim',false);
assert.equal(warm.api.mazeAtlasReadinessState(),0);
warm.api.RenderAtlasData.conceptMaze={};warm.api.mazeAtlasImageKeys=null;
assert.equal(warm.api.mazeAtlasReadinessState(),1,'legacy atlas readiness is used when concept regions are absent');
assert.deepEqual(Array.from(warm.api.mazeAtlasImageKeys),['legacy']);

const delayed=fixture();delayed.readiness.set('walls',false);delayed.readiness.set('trim',false);
for(let frame=0;frame<120;frame++) delayed.api.renderMazeLayer();
assert.equal(delayed.paints.length,1,'cache failed-image fallback once');
delayed.readiness.set('walls',true);delayed.readiness.set('trim',true);
for(let frame=0;frame<120;frame++) delayed.api.renderMazeLayer();
assert.equal(delayed.paints.length,2,'late atlas load triggers one replacement');
delayed.api.mazeRevision++;
for(let frame=0;frame<120;frame++) delayed.api.renderMazeLayer();
assert.equal(delayed.paints.length,3,'new geometry triggers one replacement');
delayed.api.mazeColorTheme={...delayed.theme,name:'violet'};
delayed.api.renderMazeLayer();assert.equal(delayed.paints.length,4,'new theme invalidates artwork');

// Region metadata alone does not imply drawable pixels. Both wall entry
// points must draw the primitive fallback when the atlas operation fails.
const walls=fixture(),wallTarget=surface('wall helper').context;
const region=['walls',0,0,80,80];
walls.api.ConceptMazeRenderCache.set('green|5',region);
for(const name of ['drawMazeWallTo','drawMazeMaskAtCell']){
  wallTarget.canvas.calls.length=0;walls.api.atlasDraws.length=0;
  walls.api[name](wallTarget,2,1,5);
  assert.equal(walls.api.atlasDraws.length,1);
  assert.deepEqual(wallTarget.canvas.calls.map(call=>call.args),[[32,16,16,16],[35,19,10,10]]);
  assert.deepEqual(wallTarget.canvas.calls.map(call=>call.state.fillStyle),
    [walls.theme.fallbackOuter,walls.theme.fallbackInner]);
  walls.api.atlasCanDraw=true;wallTarget.canvas.calls.length=0;
  walls.api[name](wallTarget,2,1,5);
  assert.equal(wallTarget.canvas.calls.length,0,'successful artwork needs no primitive wall overlay');
  walls.api.atlasCanDraw=false;
}
walls.api.ConceptMazeRenderCache.clear();walls.api.atlasDraws.length=0;
walls.api.drawMazeMaskAtCell(wallTarget,0,0,5);
assert.equal(walls.api.atlasDraws.length,0,'missing region uses primitive geometry directly');

// The emergency path has no bitmap dependency and never turns an open cell
// into a wall. Test non-square geometry and its exact floor footprint.
const emergency=surface('emergency').context;
walls.api.drawEmergencyMaze(emergency);
assert.deepEqual(emergency.canvas.calls[0].args,[0,0,48,32]);
assert.equal(emergency.canvas.calls[0].state.fillStyle,'#020604');
const wallCells=emergency.canvas.calls.slice(1).filter(call=>call.args[2]===16)
  .map(call=>[call.args[0]/16,call.args[1]/16]);
assert.deepEqual(wallCells,[[0,0],[2,0],[2,1]]);
assert.equal(emergency.canvas.calls.length,1+3*2,'only occupied wall cells receive the two wall fills');
const customGrid=[['.','#','.','.']],customTheme={fallbackOuter:'outer',fallbackInner:'inner'};
emergency.canvas.calls.length=0;
walls.api.drawEmergencyMaze(emergency,customGrid,customTheme);
assert.deepEqual(emergency.canvas.calls.map(call=>call.args),
  [[0,0,64,16],[16,0,16,16],[19,3,10,10]]);

// Events, polling, and older event-only contexts all use the same recovery
// contract. Pixels and the default transform can be reset while JS survives.
for(const mode of ['events','polling','event-only']){
  const f=fixture({events:mode!=='polling',polling:mode!=='event-only'}),api=f.api;
  api.renderMazeLayer();const count=f.paints.length;
  const watched=api.watchedRenderSurfaces.length;
  api.watchRenderSurface(f.mazeCanvas,f.mazeCanvas.context,()=>{throw Error('duplicate watcher');});
  assert.equal(api.watchedRenderSurfaces.length,watched,'watching twice never doubles callbacks');
  f.mazeCanvas.setLost(true,mode!=='polling');
  for(let frame=0;frame<120;frame++){
    api.pollRenderSurfaces();
    assert.equal(api.renderMazeLayer(),false,`${mode}: unavailable cache reports fallback`);
  }
  assert.equal(f.paints.length,count);assert.equal(f.mazeCanvas.calls.length,0);
  assert.equal(api.renderSurfaceRecoveryCount,0,'loss must never masquerade as restoration');
  f.mazeCanvas.setLost(false,mode==='events');
  if(mode==='event-only'){
    api.pollRenderSurfaces();
    assert.equal(api.renderSurfaceReady(f.mazeCanvas.context),false,
      'an event-only context must wait for its restored event, not guess from an absent API');
    f.mazeCanvas.emit('contextrestored');
  }else api.pollRenderSurfaces();
  assert.equal(api.renderSurfaceRecoveryCount,1);
  assert.equal(f.paints.length,count,'restoration invalidates without eager maze painting');
  assert.deepEqual(f.mazeCanvas.context.transform,[1,0,0,1,0,0]);
  f.mazeCanvas.context.globalAlpha=.2;f.mazeCanvas.context.globalCompositeOperation='destination-out';
  f.mazeCanvas.context.filter='blur(4px)';
  for(let frame=0;frame<120;frame++) assert.equal(api.renderMazeLayer(),true);
  assert.equal(f.paints.length,count+1,`${mode}: exactly one replacement maze`);
  assert.deepEqual(f.paints.at(-1).state.transform,[5,0,0,5,0,0]);
  assert.equal(f.paints.at(-1).state.globalAlpha,1);
  assert.equal(f.paints.at(-1).state.globalCompositeOperation,'source-over');
  assert.equal(f.paints.at(-1).state.filter,'none');
  assert.equal(f.paints.at(-1).state.imageSmoothingEnabled,false);
}
const queued=fixture();queued.api.renderMazeLayer();
queued.mazeCanvas.setLost(true);queued.api.pollRenderSurfaces();
queued.mazeCanvas.setLost(false,false);queued.api.pollRenderSurfaces();queued.api.renderMazeLayer();
queued.mazeCanvas.emit('contextrestored');queued.api.renderMazeLayer();
assert.equal(queued.api.renderSurfaceRecoveryCount,1,'queued restored event must not recover twice after polling');
assert.equal(queued.paints.length,2,'queued restored event cannot trigger a second replacement maze');
const legacy=fixture({events:false,polling:false});
assert.equal(legacy.api.renderMazeLayer(),true,'old contexts without recovery APIs remain usable');
assert.equal(legacy.api.renderSurfaceReady(surface('untracked').context),true);

// Tutorial pixels have their own cache and temporarily borrow global maze
// geometry. Failures and every successful bake must restore the live run.
const tutorial=fixture(),t=tutorial.api;
const original={maze:t.maze,theme:t.mazeColorTheme,revision:t.mazeRevision};
tutorial.readiness.set('walls',false);tutorial.readiness.set('trim',false);
for(let frame=0;frame<120;frame++) assert.equal(t.prepareTutorialMazeCache(0),true);
assert.equal(tutorial.paints.length,1);
assert.deepEqual([tutorial.tutorialCanvas.width,tutorial.tutorialCanvas.height],[1920,640]);
assert.deepEqual(tutorial.paints[0].state.transform,[5,0,0,5,-480,-640]);
assert.equal(tutorial.paints[0].maze,t.TUTORIAL_RENDER_GRIDS[0]);
assert.equal(tutorial.paints[0].revision,0x7400);
assert.equal(tutorial.paints[0].settings.includeSealedPanelGradients,false);
assert.equal(t.maze,original.maze);assert.equal(t.mazeColorTheme,original.theme);assert.equal(t.mazeRevision,original.revision);
const tutorialResizes=tutorial.tutorialCanvas.resizes;
tutorial.readiness.set('walls',true);tutorial.readiness.set('trim',true);
for(let frame=0;frame<120;frame++) t.prepareTutorialMazeCache(0);
assert.equal(tutorial.paints.length,2,'tutorial late atlas is baked once');
assert.equal(tutorial.tutorialCanvas.resizes,tutorialResizes,'same-size tutorial needs no reallocation');
tutorial.tutorialCanvas.setLost(true);
for(let frame=0;frame<120;frame++) assert.equal(t.prepareTutorialMazeCache(0),false);
assert.equal(tutorial.paints.length,2);assert.equal(tutorial.tutorialCanvas.calls.length,0);
tutorial.tutorialCanvas.setLost(false);
for(let frame=0;frame<120;frame++) t.prepareTutorialMazeCache(0);
assert.equal(tutorial.paints.length,3);
t.activeDisplayQuality='4K';t.activeDisplayProfile={sourceTilePixels:160};
for(let frame=0;frame<120;frame++) t.prepareTutorialMazeCache(0);
assert.equal(tutorial.paints.length,4);
assert.deepEqual([tutorial.tutorialCanvas.width,tutorial.tutorialCanvas.height],[3840,1280]);
assert.deepEqual(tutorial.paints.at(-1).state.transform,[10,0,0,10,-960,-1280]);
t.failPaint=true;
assert.throws(()=>t.prepareTutorialMazeCache(1),/injected artwork failure/);
assert.equal(t.maze,original.maze);assert.equal(t.mazeColorTheme,original.theme);assert.equal(t.mazeRevision,original.revision);
t.failPaint=false;t.prepareTutorialMazeCache(1);
assert.equal(tutorial.paints.length,5,'failed tutorial bake does not mark the next page ready');

// Menu surfaces retain objects and event listeners while their large pixel
// stores are released for gameplay. Re-entry restores only eager title layers;
// tutorial and button atlases are left for their existing lazy cache builders.
const lifetime=fixture(),l=lifetime.api;
Object.assign(l,{awaitingPlayerSelection:true,menuSurfacesReleased:false,releasedMenuSurfaceBytes:0,
  TITLE_LOGICAL_WIDTH:1152,TITLE_LOGICAL_HEIGHT:864,TITLE_BACKING_WIDTH:1440,TITLE_BACKING_HEIGHT:1080,
  titleFrameCanvas:surface('title frame',1440,1080),titleLogoLayerCanvas:surface('title logo',1440,300),
  titleInterfaceLayerCanvas:surface('title interface',1440,1080),
  highScoreButtonCanvas:surface('buttons',880,560),
  titleLogoLayerReady:true,titleInterfaceLayerReady:true,highScoreButtonCacheScale:1.25
});
l.titleFrameContext=l.titleFrameCanvas.context;
l.titleLogoLayerContext=l.titleLogoLayerCanvas.context;
l.titleInterfaceLayerContext=l.titleInterfaceLayerCanvas.context;
const retained=[l.titleFrameCanvas,l.titleLogoLayerCanvas,l.titleInterfaceLayerCanvas,
  l.tutorialMazeCanvas,l.highScoreButtonCanvas];
let sentinelEvents=0;l.titleFrameCanvas.addEventListener('sentinel',()=>{sentinelEvents++;});
for(const [width,height] of [[1440,1080],[2880,2160],[1440,1080],[2880,2160]]){
  l.awaitingPlayerSelection=false;
  const bytes=retained.reduce((sum,canvas)=>sum+Math.max(0,canvas.width*canvas.height-1)*4,0);
  l.syncMenuSurfaceLifetime();
  assert.equal(l.menuSurfacesReleased,true);assert.equal(l.releasedMenuSurfaceBytes,bytes);
  for(const canvas of retained) assert.deepEqual([canvas.width,canvas.height],[1,1]);
  assert.equal(l.titleLogoLayerReady,false);assert.equal(l.titleInterfaceLayerReady,false);
  assert.equal(l.tutorialMazeCacheKey,'');assert.equal(l.highScoreButtonCacheScale,0);
  const releasedResizes=retained.map(canvas=>canvas.resizes);
  for(let frame=0;frame<120;frame++) l.syncMenuSurfaceLifetime();
  assert.deepEqual(retained.map(canvas=>canvas.resizes),releasedResizes,'steady gameplay never resizes released layers');
  l.TITLE_BACKING_WIDTH=width;l.TITLE_BACKING_HEIGHT=height;l.awaitingPlayerSelection=true;
  l.syncMenuSurfaceLifetime();
  assert.equal(l.menuSurfacesReleased,false);
  for(const canvas of [l.titleFrameCanvas,l.titleInterfaceLayerCanvas])
    assert.deepEqual([canvas.width,canvas.height],[width,height]);
  assert.deepEqual([l.titleLogoLayerCanvas.width,l.titleLogoLayerCanvas.height],
    [width,Math.ceil(240*height/864)]);
  for(const target of [l.titleLogoLayerContext,l.titleInterfaceLayerContext]){
    assert.deepEqual(target.transform,[width/1152,0,0,height/864,0,0]);
    assert.equal(target.imageSmoothingEnabled,false);
  }
  assert.equal(l.titleFrameContext.imageSmoothingEnabled,false);
  assert.deepEqual([l.tutorialMazeCanvas.width,l.tutorialMazeCanvas.height],[1,1]);
  assert.deepEqual([l.highScoreButtonCanvas.width,l.highScoreButtonCanvas.height],[1,1]);
  assert.deepEqual([l.titleFrameCanvas,l.titleLogoLayerCanvas,l.titleInterfaceLayerCanvas,
    l.tutorialMazeCanvas,l.highScoreButtonCanvas],retained,'all surface identities survive HD/4K re-entry');
  const enteredResizes=retained.map(canvas=>canvas.resizes);
  for(let frame=0;frame<120;frame++) l.syncMenuSurfaceLifetime();
  assert.deepEqual(retained.map(canvas=>canvas.resizes),enteredResizes,'steady menu never reallocates');
  l.titleFrameCanvas.emit('sentinel');
  l.titleLogoLayerReady=true;l.titleInterfaceLayerReady=true;
  l.tutorialMazeCacheKey='rebuilt';l.highScoreButtonCacheScale=width/1024;
}
assert.equal(sentinelEvents,4,'release preserves the original event listeners');
l.highScoreButtonCanvas=null;l.awaitingPlayerSelection=false;
assert.doesNotThrow(()=>l.syncMenuSurfaceLifetime(),'an uninitialized optional button atlas is safe');

// update() can finish GAME OVER and enter the title between the loop's initial
// lifetime sync and draw(). The first returning menu frame must restore its
// backing surfaces before painting, or a 1x1 interface could be marked ready.
const visible=surface('visible',l.TITLE_BACKING_WIDTH,l.TITLE_BACKING_HEIGHT);
Object.assign(l,{canvas:visible,displayCtx:visible.context,ctx:visible.context,
  menuLightingLastScreen:'menu',titleScreenMode:'menu',
  drawMazeBitersTitleScreen(){
    assert.deepEqual([l.ctx.canvas.width,l.ctx.canvas.height],
      [l.TITLE_BACKING_WIDTH,l.TITLE_BACKING_HEIGHT],
      'first returning title frame must not paint into released 1x1 backing');
    assert.deepEqual([l.titleInterfaceLayerCanvas.width,l.titleInterfaceLayerCanvas.height],
      [l.TITLE_BACKING_WIDTH,l.TITLE_BACKING_HEIGHT]);
    assert.equal(l.titleInterfaceLayerReady,false,'released title artwork must be rebuilt');
    l.titleInterfaceLayerReady=true;
  }
});
l.awaitingPlayerSelection=true;
l.drawBufferedTitleFrame(1000);
assert.equal(l.menuSurfacesReleased,false,'buffered rendering synchronizes an in-frame menu transition');
assert.equal(visible.calls.length,1,'the first return presents one full buffered frame');
assert.equal(visible.calls[0].image,l.titleFrameCanvas);
assert.equal(l.ctx,visible.context,'buffered rendering restores the shared drawing context');

console.log('Render recovery passed: stable 120-frame maze/tutorial caches, failed and late atlases, visible wall fallbacks, event/polling/event-only recovery, queued-event deduplication, restored transforms, isolated tutorial state, and repeatable HD/4K menu memory release.');
