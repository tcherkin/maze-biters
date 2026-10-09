import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the production resource lifecycle with controllable image loads,
// decoding and context-loss events. No real GPU, DOM or game loop is started.
const source=fs.readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function declaration(name){
  const start=source.search(new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(start>=0,`Missing production function ${name}`);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const candidate=source.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw new Error(`Unterminated function ${name}`);
}
function block(startMarker,endMarker){
  const first=source.indexOf(startMarker),last=source.indexOf(endMarker,first);
  assert.ok(first>=0&&last>first,`Missing block ${startMarker}`);
  return source.slice(first,last);
}
function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
function events(target={}){
  const listeners=new Map();
  target.addEventListener=(type,listener)=>{
    if(!listeners.has(type)) listeners.set(type,new Set());
    listeners.get(type).add(listener);
  };
  target.removeEventListener=(type,listener)=>listeners.get(type)?.delete(listener);
  target.fire=type=>{
    for(const listener of listeners.get(type)||[]) listener({
      preventDefault(){assert.fail('Canvas 2D restoration must not be canceled');}
    });
  };
  target.listenerCount=()=>[...listeners.values()].reduce((sum,set)=>sum+set.size,0);
  return target;
}
function loaderHarness(waitForRenderImage){
  const builds=[],context=vm.createContext({
    RenderAtlases:{},waitForRenderImage,
    prepareFontRenderCache:()=>builds.push('font'),
    prepareMazeRenderCache:()=>builds.push('maze'),
    prepareIsolatedSnakeSpriteCache:()=>builds.push('snake'),
    prepareCompetitiveLeaderSpriteCache:()=>builds.push('leader')
  });
  vm.runInContext(`let renderCachePreparationGeneration=0;
    ${declaration('prepareAllRenderCaches')}
    globalThis.start=prepareAllRenderCaches;`,context);
  return {context,builds};
}

// All incomplete images get the documented timeout, not their array index.
// Success, error and timeout must each remove both listeners; failed images
// must not enter an unbounded decode promise after their wait already ended.
{
  const timers=[],images=Array.from({length:3},()=>events({complete:false,naturalWidth:0}));
  let decoded=0;
  for(const image of images) image.decode=()=>{
    assert.ok(image.complete&&image.naturalWidth,'only loaded images may decode');
    decoded++;return Promise.resolve();
  };
  const h=loaderHarness();
  Object.assign(h.context,{
    setTimeout(callback,ms){const timer={callback,ms};timers.push(timer);return timer;},
    clearTimeout(timer){timer.cleared=true;}
  });
  vm.runInContext(declaration('waitForRenderImage'),h.context);
  h.context.RenderAtlases={first:images[0],second:images[1],third:images[2]};
  const request=h.context.start();
  assert.deepEqual(timers.map(timer=>timer.ms),[3000,3000,3000]);
  images[0].complete=true;images[0].naturalWidth=80;images[0].fire('load');
  images[1].complete=true;images[1].fire('error');
  timers[2].callback();
  assert.equal(await request,1);assert.equal(decoded,1);
  assert.ok(images.every(image=>image.listenerCount()===0));
  assert.ok(timers.every(timer=>timer.cleared));
  assert.deepEqual(h.builds,['font','maze','snake','leader']);
}

// The most recent request wins, including an HD -> 4K -> HD round trip.
{
  const h=loaderHarness(image=>image.wait.promise);
  const requests=[],images=[];
  for(const quality of ['HD','4K','HD']){
    const image={quality,wait:deferred(),complete:true,naturalWidth:80};
    images.push(image);h.context.RenderAtlases={main:image};
    requests.push(h.context.start());
  }
  images[2].wait.resolve();assert.equal(await requests[2],3);
  images[1].wait.resolve();assert.equal(await requests[1],null);
  images[0].wait.resolve();assert.equal(await requests[0],null);
  assert.deepEqual(h.builds,['font','maze','snake','leader'],
    'stale jobs cannot build a second family of canvases');
}
// Supersession during decode must also stop before the expensive builders.
{
  const h=loaderHarness(()=>Promise.resolve()),oldDecode=deferred(),entered=deferred();
  h.context.RenderAtlases={old:{complete:true,naturalWidth:80,decode(){
    entered.resolve();return oldDecode.promise;
  }}};
  const stale=h.context.start();await entered.promise;
  h.context.RenderAtlases={current:{complete:true,naturalWidth:80}};
  assert.equal(await h.context.start(),2);
  oldDecode.resolve();assert.equal(await stale,null);
  assert.equal(h.builds.length,4);
}

function canvasHarness(){
  const surfaces=[];
  const document={createElement(tag){
    assert.equal(tag,'canvas');
    const canvas=events({width:300,height:150});
    const context={draws:[],imageSmoothingEnabled:true,
      setTransform(){},drawImage(...args){this.draws.push(args);}};
    canvas.getContext=()=>context;canvas.context=context;
    surfaces.push(canvas);return canvas;
  }};
  return {document,surfaces};
}
// Lost isolated cells draw their original atlas until restoration. Retired
// surfaces are explicitly released and cannot repopulate a newer cache.
{
  const h=canvasHarness(),region=['snake',0,0,80,80];
  const atlas={complete:true,naturalWidth:80};
  const context=vm.createContext({document:h.document,
    RenderAtlasData:{modernSnake:{head:region},modernSnakeOcclusion:{}},
    RenderAtlases:{snake:atlas}});
  vm.runInContext(`let IsolatedSnakeSpriteCache=new WeakMap();
    let isolatedSnakeSpriteSurfaces=[],isolatedSnakeSpriteCount=0;
    ${['releaseIsolatedSnakeSpriteCache','prepareIsolatedSnakeSpriteCache','drawAtlasRegion']
      .map(declaration).join('\n')}
    globalThis.api={prepare:prepareIsolatedSnakeSpriteCache,
      count:()=>isolatedSnakeSpriteCount,draw:drawAtlasRegion};`,context);
  const {api}=context,target={draws:[],drawImage(...args){this.draws.push(args);}};
  api.prepare();const first=h.surfaces[0];
  api.draw(target,region,0,0);assert.equal(target.draws.at(-1)[0],first);
  first.fire('contextlost');assert.equal(api.count(),0);
  for(let frame=0;frame<300;frame++) api.draw(target,region,0,0);
  assert.equal(target.draws.at(-1)[0],atlas);assert.equal(h.surfaces.length,1);
  first.fire('contextrestored');assert.equal(api.count(),1);
  api.draw(target,region,0,0);assert.equal(target.draws.at(-1)[0],first);
  assert.equal(first.context.draws.length,2,'restore repaints the same cell once');
  api.prepare();assert.equal(first.width,1);assert.equal(first.height,1);
  const retiredDraws=first.context.draws.length;
  first.fire('contextrestored');
  assert.equal(first.context.draws.length,retiredDraws);
  api.draw(target,region,0,0);assert.equal(target.draws.at(-1)[0],h.surfaces[1]);
  assert.equal(api.count(),1);assert.equal(h.surfaces.length,2);
}

// A lost packed leader atlas falls back without creating per-frame sprites;
// one restoration rebuilds it, and obsolete restoration events are ignored.
{
  const h=canvasHarness(),sprite={},context=vm.createContext({
    document:h.document,CharacterSpriteGroups:{player:{p1:{normal:{head:sprite}}}},
    activeDisplayQuality:'HD',COMPETITIVE_LEADER_SPARK_FRAMES:16,
    COMPETITIVE_LEADER_SPARK_COLUMNS:8,CompetitiveLeaderSparkPalettes:['green'],
    paintCompetitiveLeaderSparkFrames(){},
    buildCompetitiveLeaderSprite(){
      return {bakedSprite:h.document.createElement('canvas'),sourceWidth:88,sourceHeight:88,
        nativeWidth:80,nativeHeight:80,paddingX:.8,paddingY:.8};
    }
  });
  vm.runInContext(`let CompetitiveLeaderSpriteCache=new WeakMap();
    let competitiveLeaderAtlas=null,competitiveLeaderAtlasUnavailable=false,
      competitiveLeaderSparkLayout=null,competitiveLeaderSpriteCount=0;
    ${['prepareCompetitiveLeaderSpriteCache','competitiveLeaderSprite','drawCompetitiveLeaderSparks']
      .map(declaration).join('\n')}
    globalThis.api={prepare:prepareCompetitiveLeaderSpriteCache,
      sprite:competitiveLeaderSprite,sparks:drawCompetitiveLeaderSparks,
      atlas:()=>competitiveLeaderAtlas};`,context);
  const {api}=context;api.prepare();const first=api.atlas();
  assert.equal(api.sprite(sprite,'green').atlas,first);
  first.fire('contextlost');const surfaces=h.surfaces.length;
  for(let frame=0;frame<300;frame++){
    assert.equal(api.sprite(sprite,'green'),null);
    assert.equal(api.sparks({},null,frame),false);
  }
  assert.equal(h.surfaces.length,surfaces);
  first.fire('contextrestored');assert.notEqual(api.atlas(),first);
  assert.equal(first.width,1);assert.equal(first.height,1);
  assert.equal(api.sprite(sprite,'green').atlas,api.atlas());
  const restoredSurfaces=h.surfaces.length;first.fire('contextrestored');
  assert.equal(h.surfaces.length,restoredSurfaces);
}

// The shared 2880x2000 world cache retains its backing store on a quality
// switch. Both unchanged dimension assignments would clear that allocation.
{
  const quality=declaration('applyDisplayQualityProfile');
  const first=quality.indexOf('if(mazeLayerCanvas.width!==MAZE_CACHE_BACKING_WIDTH)');
  const last=quality.indexOf('mazeLayerContext.setTransform(',first);
  assert.ok(first>=0&&last>first);
  let resets=0,width=2880,height=2000;
  const surface={get width(){return width;},set width(value){resets++;width=value;},
    get height(){return height;},set height(value){resets++;height=value;}};
  vm.runInNewContext(quality.slice(first,last),{mazeLayerCanvas:surface,
    MAZE_CACHE_BACKING_WIDTH:2880,MAZE_CACHE_BACKING_HEIGHT:2000});
  assert.equal(resets,0);
}

// Native legacy concept portraits stay unloaded on ordinary DUSK screens;
// if a caller needs the legacy artwork, its selected family loads once.
{
  const images=[],fallback={};
  const context=vm.createContext({Image:class{
    constructor(){events(this);images.push(this);}
  },invalidateTitleInterfaceLayer(){},activeDisplayQuality:'HD',
    titlePlayerConceptImage:fallback,titleSnakeConceptImage:fallback});
  vm.runInContext(block('  const titlePlayerHiResConceptImage=new Image();',
    '  function drawGhostedTitleConcepts('),context);
  assert.equal(images.filter(image=>image.src).length,0);
  assert.equal(context.selectedTitleConcepts().player,fallback);
  assert.equal(images.filter(image=>image.src).length,2);
  context.selectedTitleConcepts();assert.equal(images.filter(image=>image.src).length,2);
  context.activeDisplayQuality='4K';context.selectedTitleConcepts();
  assert.equal(images.filter(image=>image.src).length,4);
  images[0].fire('load');images[1].fire('load');
  assert.equal(context.selectedTitleConcepts().player,images[0]);
  assert.ok(!declaration('applyDisplayQualityProfile').includes('ensureTitleHiResConceptSources'),
    'switching DUSK quality alone does not load unused concept portraits');
}

console.log('Render cache lifecycle checks passed: bounded loading, stale generations, surface recovery, reuse and lazy portraits.');
