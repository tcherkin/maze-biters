// Frozen v1.02.05.00 compositor baseline for differential regression tests.
// Source behavior is retained; only unchanged helper import paths are relocated.
import {createNeonMaterial} from './neon-material.js?v=1.02.05.00';
import {createPairedContext, pairedContextStatus} from './neon-context.js?v=1.02.05.00';
import {createSnakeNeonEyes} from '../../../src/render/snake-neon-eyes.js?v=1.02.05.00';
import {createSnakeNeonReflection} from '../../../src/render/snake-neon-reflection.js?v=1.02.05.00';

// Presentation only: the simulation, cell contacts and native artwork remain
// authoritative. All light buffers have a fixed logical-world size, even in 4K.
export const SNAKE_NEON = Object.freeze({inner:.7, halo:.38, body:.5, walls:.25, emission:.78});
export function createSnakeNeon({width,height,tile,makeCanvas,snake}) {
  const material=createNeonMaterial({strength:SNAKE_NEON.inner,canvasFactory:makeCanvas});
  const eyes=createSnakeNeonEyes({makeCanvas});
  const reflection=createSnakeNeonReflection({width,height,tile,makeCanvas});
  const surfaces=[];
  function surface(scale=1) {
    const canvas=makeCanvas(Math.round(width*scale),Math.round(height*scale));
    const context=canvas.getContext('2d');
    const value={canvas,context,scale,lost:false};surfaces.push(value);
    canvas.addEventListener?.('contextlost',()=>{value.lost=true;active=false;});
    canvas.addEventListener?.('contextrestored',()=>{value.lost=false;});
    return value;
  }
  // Immutable sprite draws are captured directly. Prepared ribbons replay
  // the same sampled geometry into visible, occlusion and emission targets,
  // without advancing animation/simulation or reading pixels during a frame.
  const emission=surface(2), eyeLayer=surface(2), actors=surface(), foreground=surface();
  const viewport=surface(2), lightViewport=surface(), halo=surface(.5);
  const errors=[];
  let active=false, sourceIdentity=null, raw=null, actorContext=null, snakeContext=null;
  let allContext=null, pairs=[], sources=[], frameTime=0, frames=0, lastTime=null;
  let reflectionMs=0, overlayMs=0, lastKey=null,captureRecoveries=0;
  const clock=()=>globalThis.performance?.now?.()??0;
  function fail(name,error) {
    if(!errors.some(item=>item.name===name)) errors.push({name,message:String(error?.message||error)});
    active=false;
  }
  function safe(name,fn,fallback) {try{return fn();}catch(error){fail(name,error);return fallback;}}
  function clear(layer) {
    const c=layer.context;
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
    c.filter='none';c.shadowBlur=0;c.shadowColor='transparent';c.shadowOffsetX=c.shadowOffsetY=0;
    c.clearRect(0,0,layer.canvas.width,layer.canvas.height);c.beginPath();
    c.setTransform(layer.scale,0,0,layer.scale,0,0);c.imageSmoothingEnabled=true;
  }
  function warmup() {
    return safe('warmup',()=>{
      const art=snake?.getNeonSources?.();
      if(!art?.length)return false;
      if(sourceIdentity!==art[0]) {
        material.reset();eyes.reset();sourceIdentity=art[0];
        material.prewarm?.(art);
      }
      return true;
    },false);
  }
  function beginFrame(context,{grid,key,drawWallArtwork,time}) {
    // A capture can fail between save() and restore(). clearRect alone cannot
    // remove that abandoned clip/stack; reset only these optional surfaces.
    if(pairs.length&&!validCapture()) {
      for(const layer of [emission,eyeLayer,actors,foreground])
        layer.canvas.width=Math.round(width*layer.scale);
      captureRecoveries++;
    }
    active=false;raw=context;frameTime=time;sources.length=0;pairs=[];
    return safe('begin',()=>{
      if(!snake||!warmup())return false;
      if(surfaces.some(layer=>layer.lost||layer.context.isContextLost?.()))return false;
      if(lastTime!==null&&time<lastTime)eyes.reset();lastTime=time;
      if(!reflection.prepare({grid,key,drawWallArtwork}))return false;
      lastKey=key;
      for(const layer of [emission,eyeLayer,actors,foreground])clear(layer);
      allContext=createPairedContext(context,actors.context);
      actorContext=createPairedContext(allContext,foreground.context);
      snakeContext=createPairedContext(material.wrapContext(allContext,SNAKE_NEON.inner),
        material.wrapEmissionContext(emission.context,SNAKE_NEON.inner));
      pairs=[allContext,actorContext,snakeContext];active=true;return true;
    },false);
  }
  function validCapture() {
    return pairs.every(pair=>pairedContextStatus(pair)?.secondaryEnabled!==false);
  }
  function flushOcclusion() {
    if(!active)return;
    safe('occlusion',()=>{
      // Flush at draw-order boundaries, so swallowed snake heads can still
      // glow over an earlier scorpion but never through the player's mouth.
      for(const layer of [emission,eyeLayer]) {
        const c=layer.context;c.save();c.setTransform(layer.scale,0,0,layer.scale,0,0);
        c.globalAlpha=1;c.globalCompositeOperation='destination-out';c.filter='none';
        c.drawImage(foreground.canvas,0,0,width,height);c.restore();
      }
      clear(foreground);
    });
  }
  function noteSnake(entity,{freeze=false}={}) {
    if(!active)return;
    safe('snake-light',()=>{
      const geometry=snake.getWorldGeometry(entity,frameTime,{freeze});
      if(!geometry)return;
      sources.push({geometry,color:entity.color});
      eyes.draw(eyeLayer.context,entity,geometry,snake.getCollisionArt(),geometry.renderTime??frameTime);
    });
  }
  function project(layer,source,camera) {
    clear(layer);
    const zoom=camera.zoom,left=camera.x-width/(2*zoom),top=camera.y-height/(2*zoom);
    const sx=source.width/width,sy=source.height/height;
    layer.context.drawImage(source,left*sx,top*sy,width/zoom*sx,height/zoom*sy,0,0,width,height);
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
      const started=clock();flushOcclusion();
      if(!active||!validCapture())return false;
      const reflectionStart=clock(),maps=reflection.render(sources);
      reflectionMs=clock()-reflectionStart;
      target.save();
      try {
        target.globalCompositeOperation='screen';target.imageSmoothingEnabled=true;target.filter='none';
        if(maps)for(const [map,alpha] of [[maps.floor,SNAKE_NEON.body],[maps.walls,1]]) {
          if(!map)continue;
          project(lightViewport,map,camera);maskViewport(lightViewport,dusk,true,camera);
          target.globalAlpha=alpha;target.drawImage(lightViewport.canvas,0,0,width,height);
        }
        project(viewport,emission.canvas,camera);maskViewport(viewport,dusk,false,camera);
        clear(halo);halo.context.filter=`blur(${tile/36*4.4*halo.scale}px)`;
        halo.context.drawImage(viewport.canvas,0,0,width,height);halo.context.filter='none';
        target.globalAlpha=SNAKE_NEON.halo;target.drawImage(halo.canvas,0,0,width,height);
        target.globalAlpha=SNAKE_NEON.emission;target.drawImage(viewport.canvas,0,0,width,height);
        // Eyes stay subtly visible in the beam too; their pulse follows the
        // committed per-snake AI attention, not distance or a test preset.
        project(viewport,eyeLayer.canvas,camera);
        target.globalAlpha=1;target.drawImage(viewport.canvas,0,0,width,height);
      } finally {target.restore();}
      frames++;overlayMs=clock()-started;return true;
    },false);
  }
  return {
    warmup,beginFrame,flushOcclusion,noteSnake,present,
    actorsContext:()=>active?actorContext:raw,
    snakeContext:()=>active?snakeContext:raw,
    reset(){active=false;eyes.reset();sources.length=0;lastTime=null;},
    invalidate(){active=false;sourceIdentity=null;material.reset();eyes.reset();reflection.reset();},
    diagnostics:()=>({enabled:active,settings:SNAKE_NEON,fog:false,overheadLights:false,
      frames,snakes:sources.length,mazeKey:lastKey,reflectionMs,overlayMs,captureRecoveries,errors:errors.slice(),
      surfaces:surfaces.length,surfaceBytes:surfaces.reduce((n,l)=>n+l.canvas.width*l.canvas.height*4,0),
      material:material.stats(),reflection:reflection.stats(),eyes:eyes.diagnostics()})
  };
}
globalThis.MazeBitersSnakeNeonFactory=Object.freeze({create:createSnakeNeon});
