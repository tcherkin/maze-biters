// Shared production lighting for gameplay and the How to Play mini mazes.
(() => {
  const DUSK=Object.freeze({darkness:.80,halo:2.8,reach:9,spread:3.5});
  const RIGHT=Object.freeze({x:1,y:0});
  let halo=null,beam=null,sharedCanvasAllocations=0,sharedTextureBuilds=0;

  function textureSurface(w,h){
    const result=document.createElement('canvas');
    result.width=w;result.height=h;sharedCanvasAllocations++;
    return result;
  }

  function prepareTextures(){
    if(halo) return;
    halo=textureSurface(256,256);
    const hc=halo.getContext('2d');
    const gradient=hc.createRadialGradient(128,128,0,128,128,128);
    gradient.addColorStop(0,'rgba(255,255,255,1)');
    gradient.addColorStop(.28,'rgba(255,255,255,1)');
    gradient.addColorStop(.60,'rgba(255,255,255,.65)');
    gradient.addColorStop(1,'rgba(255,255,255,0)');
    hc.fillStyle=gradient;hc.fillRect(0,0,256,256);

    // The accepted DUSK beam is unchanged. Build it once for both renderers,
    // never per frame, player, tutorial chapter, quality change or zoom.
    beam=textureSurface(512,384);
    const bc=beam.getContext('2d');
    const pixels=bc.createImageData(beam.width,beam.height);
    for(let x=0;x<beam.width;x++){
      const u=(x+.5)/beam.width;
      const halfWidth=.06+.94*u;
      const falloff=(1-u*u*u)**2;
      for(let y=0;y<beam.height;y++){
        const across=Math.abs((y+.5-beam.height/2)/(beam.height/2))/halfWidth;
        const edge=Math.max(0,1-across*across);
        const offset=(y*beam.width+x)*4;
        pixels.data[offset]=pixels.data[offset+1]=pixels.data[offset+2]=255;
        pixels.data[offset+3]=Math.round(255*edge*edge*falloff);
      }
    }
    bc.putImageData(pixels,0,0);sharedTextureBuilds++;
  }

  function create({width,height,tile,positionFor,isPowered,
    powerStrength=(player,t)=>isPowered(player,t)?1:0,deathLightAlpha=()=>1}){
    let mask=null,maskCtx=null,maskAllocations=0;
    let lastTime=null,lastGameTime=null,activeLights=0,activeBeams=0,boostedLights=0,renderPasses=0;
    let maskReady=false,maskRebuilds=0,maskReuses=0,cachedLightCount=0;
    // Two compact reusable buffers retain the exact ordered draw operations.
    // Their capacity grows only during warm-up or when more lights appear.
    // Each light stores x, y, radius, alpha, angle, reach, spread, strength, beam.
    let cachedSpecs=[],frameSpecs=[];
    const SPEC_STRIDE=9;
    const lightStates=new WeakMap();

    function prepare(){
      if(mask) return;
      prepareTextures();
      // Only the soft mask uses a low-resolution fixed viewport. The main
      // canvas, native sprites and high-resolution maze cache are untouched.
      mask=document.createElement('canvas');
      mask.width=width;mask.height=height;maskAllocations++;
      maskCtx=mask.getContext('2d');
    }

    function render(target,roster,camera,realTime,gameTime){
      if(!mask) return false;
      const frozen=gameTime===lastGameTime;
      const restarted=lastGameTime!==null&&gameTime<lastGameTime;
      const reentered=lastTime!==null&&realTime-lastTime>150;
      const elapsed=frozen?0:lastTime===null?16:Math.max(0,Math.min(50,realTime-lastTime));
      lastTime=realTime;lastGameTime=gameTime;
      activeLights=0;activeBeams=0;boostedLights=0;
      let changed=!maskReady;
      const zoom=camera.zoom;
      const left=camera.x-width/(2*zoom),top=camera.y-height/(2*zoom);
      const aimBlend=1-Math.exp(-elapsed/65);
      for(let index=0;index<roster.length;index++){
        const player=roster[index];
        if(!player||(player.dead?player.hideDeathSprite:player.eliminated)) continue;
        const alpha=player.dead?Math.max(0,Math.min(1,deathLightAlpha(player,gameTime))):1;
        if(alpha<=0) continue;
        let state=lightStates.get(player);
        const tilt=(player.controllerTiltDegrees||0)*Math.PI/180;
        const direction=player.dir||RIGHT;
        const desired=Math.atan2(direction.y,direction.x)+tilt;
        if(!state){
          state={visual:{x:0,y:0},angle:desired};
          lightStates.set(player,state);
        }
        if(restarted||(reentered&&!frozen)) state.angle=desired;
        else{
          const delta=Math.atan2(Math.sin(desired-state.angle),Math.cos(desired-state.angle));
          state.angle+=delta*aimBlend;
        }
        let position=state.visual;
        if(player.dead){
          position.x=player.deathX;position.y=player.deathY;
        }else position=positionFor(player,gameTime,position);
        const x=((position.x+.5)*tile-left)*zoom;
        const y=((position.y+.5)*tile-top)*zoom;
        // Use the existing Power Mode envelope, including its continuous
        // refresh curve. The lamp never flickers with the warning sprite.
        const strength=player.dead?0:Math.max(0,Math.min(1,powerStrength(player,gameTime)));
        const radius=DUSK.halo*tile*zoom*(1+.30*strength);
        // Death sprites retain a local glow only while actually visible;
        // an eliminated player never leaves an invisible flashlight behind.
        const hasBeam=player.dead?0:1;
        const offset=activeLights*SPEC_STRIDE;
        frameSpecs[offset]=x;frameSpecs[offset+1]=y;
        frameSpecs[offset+2]=radius;frameSpecs[offset+3]=alpha;
        frameSpecs[offset+4]=hasBeam?state.angle:0;
        frameSpecs[offset+5]=hasBeam?DUSK.reach*tile*zoom*(1+.45*strength):0;
        frameSpecs[offset+6]=hasBeam?DUSK.spread*tile*zoom:0;
        frameSpecs[offset+7]=strength;frameSpecs[offset+8]=hasBeam;
        for(let field=0;field<SPEC_STRIDE;field++){
          if(frameSpecs[offset+field]!==cachedSpecs[offset+field]) changed=true;
        }
        activeLights++;
        if(hasBeam){activeBeams++;if(strength>0) boostedLights++;}
      }
      if(activeLights!==cachedLightCount) changed=true;
      if(changed){
        // Compare rendered inputs, not merely the game clock: the camera still
        // eases while paused, and power/death envelopes can change in place.
        // No rounding or angle snapping is used, so every changed pixel input
        // follows the original clear/halo/beam draw sequence exactly.
        maskReady=false;
        maskCtx.setTransform(1,0,0,1,0,0);
        maskCtx.globalCompositeOperation='copy';
        maskCtx.globalAlpha=DUSK.darkness;
        maskCtx.fillStyle='#00030c';
        maskCtx.fillRect(0,0,width,height);
        maskCtx.globalAlpha=1;
        maskCtx.globalCompositeOperation='destination-out';
        maskCtx.imageSmoothingEnabled=true;
        for(let index=0;index<activeLights;index++){
          const offset=index*SPEC_STRIDE;
          const x=frameSpecs[offset],y=frameSpecs[offset+1],radius=frameSpecs[offset+2];
          maskCtx.globalAlpha=frameSpecs[offset+3];
          maskCtx.drawImage(halo,x-radius,y-radius,radius*2,radius*2);
          maskCtx.globalAlpha=1;
          if(!frameSpecs[offset+8]) continue;
          const reach=frameSpecs[offset+5],spread=frameSpecs[offset+6];
          const strength=frameSpecs[offset+7];
          maskCtx.save();maskCtx.translate(x,y);maskCtx.rotate(frameSpecs[offset+4]);
          maskCtx.drawImage(beam,0,-spread,reach,spread*2);
          if(strength>0){
            // Power reuses the same feathered beam for its intensity pass.
            maskCtx.globalAlpha=.85*strength;
            maskCtx.drawImage(beam,0,-spread,reach,spread*2);
            maskCtx.globalAlpha=1;
          }
          maskCtx.restore();
        }
        maskCtx.globalCompositeOperation='source-over';
        maskReady=true;maskRebuilds++;
      }else maskReuses++;
      const spare=cachedSpecs;cachedSpecs=frameSpecs;frameSpecs=spare;
      cachedLightCount=activeLights;
      // DUSK is permanent, including pause, clear/death sequences and an
      // empty scene. UI/captions are painted afterward and stay fully legible.
      target.save();target.globalAlpha=1;target.filter='none';
      target.globalCompositeOperation='source-over';
      target.imageSmoothingEnabled=true;
      target.drawImage(mask,0,0,width,height);
      target.restore();renderPasses++;
      return true;
    }

    return {
      prepare,render,
      diagnostics:()=>({mode:'DUSK',prepared:!!mask,activeLights,activeBeams,boostedLights,
        maskSize:mask?`${mask.width}x${mask.height}`:null,opacity:DUSK.darkness,
        maskAllocations,sharedTextureBuilds,sharedCanvasAllocations,renderPasses,maskRebuilds,maskReuses,
        wallOcclusion:false})
    };
  }
  globalThis.MazeBitersDuskLighting=Object.freeze({create});
})();
