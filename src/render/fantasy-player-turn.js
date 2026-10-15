// Optional presentation only. Logical headings, collision shapes, movement,
// mouth phrases and per-actor eyelid clocks remain owned by the game.
import {composeFantasyPose} from './fantasy-player-art.js?v=1.02.15.03';
import {createFantasyTurnClock} from './fantasy-turn-clock.js?v=1.02.14.01';
import {createHunterEyeMasks} from './creature-neon-eyes.js?v=1.02.16.00';

const DIRECTIONS=['right','down','left','up'];
const COLORS={p1:'#6dff72',p2:'#66baff',ai:'#ffd85d'};
const direction=d=>typeof d==='string'?d:d?.x>0?'right':d?.x<0?'left':d?.y>0?'down':d?.y<0?'up':null;

function createTurnFamily({makeCanvas,yieldTask,family='player'}){
  const clock=createFantasyTurnClock();
  let generation=0,renderer=null,surface=null,context=null,outline=null,ring=null,poseSource=null;
  let frameKey=null,outlineKey=null,lastError=null,nativeSize=0;
  let eyeMasks=null,eyeError=null;
  function release(){
    renderer?.dispose();renderer=null;
    eyeMasks?.dispose();eyeMasks=null;
    for(const canvas of [surface,outline,ring,poseSource])if(canvas)canvas.width=canvas.height=1;
    surface=context=outline=ring=poseSource=null;frameKey=outlineKey=null;nativeSize=0;
  }
  async function prepare(groups,drawMaskPose){
    const token=++generation,arts=new Map();
    for(const [palette,lights] of Object.entries(groups?.[family]||{}))
      for(const [light,poses] of Object.entries(lights))for(const pose of Object.values(poses)){
        const art=pose?.__fantasySource?.set;
        if(art)arts.set(`${art.palette||palette}:${light}:${art.direction}`,art);
      }
    if(!arts.size){release();return false;}
    let next=null,nextSource=null,nextEyes=null,nextEyeError=null;
    try{
      // Enemy turns use the approved clean-cap renderer AND their own rig.
      // The protagonist keeps its existing renderer, masks and artwork.
      const createTurnRenderer=family==='hunter'
        ?(await import('./dragon-turn/renderer.js?v=1.02.16.00')).createDragonTurnRenderer
        :(await import('./fantasy-turn/renderer.js?v=1.02.15.03')).createTurnRenderer;
      const artRig=family==='hunter'?(await import('./dragon-turn/rig.js?v=1.02.15.02')).dragonTurnRig:null;
      if(token!==generation)return false;
      const size=arts.values().next().value.size;
      // Match the approved enemy study's native pose staging. Composing its
      // patches directly into a CPU-readback surface changes edge rounding.
      // One reused canvas preserves those pixels without per-frame allocation.
      let poseContext=null;
      if(family==='hunter'){
        nextSource=makeCanvas(size,size);nextSource.width=nextSource.height=size;
        poseContext=nextSource.getContext('2d');
        if(!poseContext)throw Error('Enemy native pose composition unavailable');
      }
      // The port always asks for native, complete poses. No independent
      // sampling of actor clocks and no additional image pack are needed.
      const drawPose=(ctx,variant,dir,closure,blink,x,y,width)=>{
        const art=arts.get(`${variant}:${dir}`);
        if(!art||x!==0||y!==0||width!==size)throw Error('Invalid native turn source');
        composeFantasyPose(poseContext||ctx,art,Math.round(closure*48),Math.round(blink*24));
        if(poseContext)ctx.drawImage(nextSource,x,y,width,width);
      };
      next=createTurnRenderer({size,drawPose,drawMaskPose:family==='player'?drawMaskPose:undefined,
        drawEyeMaskPose:family==='hunter'?((...args)=>nextEyes?.draw(...args)):undefined,artRig});
      if(family==='hunter'){
        try{nextEyes=createHunterEyeMasks({arts,makeCanvas});}
        catch(error){nextEyeError=String(error?.message||error);}
      }
      // Common walking frames are prepared away from the first visible turn.
      // The cache is bounded; uncommon bright/bite poses use the same renderer.
      const palettes=family==='player'?['p1','p2','ai']:[...new Set([...arts.values()].map(art=>art.palette))];
      // Enemy extreme bite poses also warm their clean rear cap before play;
      // keep the player's existing eight-frame preparation unchanged.
      const warmFrames=family==='hunter'?[0,12,13,14,15,16,17,18,19,48]:[12,13,14,15,16,17,18,19];
      for(const frame of warmFrames)for(const palette of palettes){
        if(token!==generation){next.dispose();return false;}
        if(arts.has(`${palette}:normal:right`))next.warm(`${palette}:normal`,frame/48);
        await yieldTask();
      }
      if(token!==generation){next.dispose();return false;}
      release();renderer=next;poseSource=nextSource;eyeMasks=nextEyes;eyeError=nextEyeError;nativeSize=size;lastError=null;
      surface=makeCanvas(size,size);surface.width=surface.height=size;context=surface.getContext('2d');
      if(!context)throw Error('Turn composition unavailable');
      return true;
    }catch(error){
      next?.dispose();
      if(token===generation){release();lastError=String(error?.message||error);}
      return false;
    }finally{
      if(nextSource&&poseSource!==nextSource)nextSource.width=nextSource.height=1;
      if(nextEyes&&eyeMasks!==nextEyes)nextEyes.dispose();
    }
  }
  function frame(live){
    if(!renderer||!live?.set.fantasy||!live.turnPose)return null;
    const {set,index,blink=0,turnPose:pose}=live;
    const variant=`${set.art.palette}:${set.art.light}`;
    const key=`${variant}:${index}:${blink}:${pose.from}:${pose.to}:${pose.mix}`;
    if(frameKey!==key){
      context.clearRect(0,0,nativeSize,nativeSize);
      renderer.draw(context,variant,pose,index/48,blink/24,0,0,nativeSize);
      frameKey=key;outlineKey=null;
    }
    return surface;
  }
  function safe(action){
    try{return action();}catch(error){
      // A lost/unsupported optional GPU surface never reaches the engine's
      // fallback rectangle or invalidates mouth/contact readiness.
      lastError=String(error?.message||error);release();return false;
    }
  }
  function draw(ctx,live,x,y,width,height){
    return safe(()=>{const image=frame(live);if(!image)return false;
      ctx.drawImage(image,0,0,nativeSize,nativeSize,x,y,width,height);return true;});
  }
  function drawLeader(ctx,live,x,y,width,height){
    return safe(()=>{
      const image=frame(live);if(!image)return false;
      const s=nativeSize,padding=Math.max(4,Math.ceil(s*.05)),outer=s+2*padding;
      if(!outline){outline=makeCanvas(outer,outer);ring=makeCanvas(outer,outer);outline.width=outline.height=ring.width=ring.height=outer;}
      if(outlineKey!==frameKey){
        const glow=outline.getContext('2d'),r=ring.getContext('2d');
        const color=COLORS[live.set.art.palette]||COLORS.p1;
        glow.clearRect(0,0,outer,outer);r.clearRect(0,0,outer,outer);
        glow.save();glow.shadowColor=color;glow.shadowBlur=Math.max(2,s*.03);glow.globalAlpha=.54;
        glow.drawImage(image,padding,padding);glow.restore();
        glow.globalCompositeOperation='source-in';glow.fillStyle=color;glow.fillRect(0,0,outer,outer);
        glow.globalCompositeOperation='destination-out';glow.drawImage(image,padding,padding);glow.globalCompositeOperation='source-over';
        const radius=Math.max(1,Math.round(s/80));
        for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(dx||dy)r.drawImage(image,padding+dx,padding+dy);
        r.globalCompositeOperation='source-in';r.fillStyle=color;r.fillRect(0,0,outer,outer);
        r.globalCompositeOperation='destination-out';r.drawImage(image,padding,padding);r.globalCompositeOperation='source-over';
        glow.globalAlpha=.72;glow.drawImage(ring,0,0);glow.globalAlpha=1;outlineKey=frameKey;
      }
      ctx.drawImage(outline,x-padding*width/s,y-padding*height/s,outer*width/s,outer*height/s);
      ctx.drawImage(image,x,y,width,height);
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha*=.42;ctx.drawImage(image,x,y,width,height);ctx.restore();return true;
    });
  }
  return {
    prepare,draw,drawLeader,
    request(entity,from,to,time){const a=direction(from),b=direction(to);if(a&&b&&a!==b)clock.request(entity,a,b,time);},
    decorate(entity,time,descriptor){
      if(!renderer||!descriptor?.__liveMouth.set.fantasy)return descriptor;
      const pose=clock.sample(entity,time);
      return pose&&!pose.done?{...descriptor,__liveMouth:{...descriptor.__liveMouth,turnPose:pose}}:descriptor;
    },
    drawMask(ctx,live,x,y,width,height){
      if(!renderer||!live?.turnPose||!renderer.drawMask)return false;
      return safe(()=>{
        ctx.save();
        try{ctx.translate(x,y);ctx.scale(width/nativeSize,height/nativeSize);
          renderer.drawMask(ctx,`${live.set.art.palette}:${live.set.art.light}`,live.turnPose,live.index/48,0,0,nativeSize);
        }finally{ctx.restore();}
        return true;
      });
    },
    drawEyeMask(ctx,live,x,y,width,height){
      if(family!=='hunter'||!renderer||!eyeMasks?.valid||!live?.set?.fantasy||ctx?.isContextLost?.())return false;
      // Effect failure must not dispose or invalidate the approved art path.
      try{
        const art=live.set.art,pose=live.turnPose||{from:art.direction,to:art.direction,mix:0};
        ctx.save();try{ctx.translate(x,y);ctx.scale(width/nativeSize,height/nativeSize);
          renderer.drawEyeMask(ctx,`${art.palette}:${art.light}`,pose,live.index/48,(live.blink||0)/24,0,0,nativeSize);
        }finally{ctx.restore();}return true;
      }catch(error){eyeError=String(error?.message||error);return false;}
    },
    reset(entity){clock.reset(entity);},
    dispose(){generation++;release();clock.reset();},
    diagnostics(){return {ready:!!renderer,durationMs:90,halfTurnMs:90,error:lastError,...renderer?.diagnostics(),eyes:eyeMasks?.diagnostics()||null,eyeError};},
  };
}

// Separate art anatomies share exactly the same clock and pose protocol.
// A failed optional enemy GPU surface cannot invalidate player rendering.
export function createFantasyPlayerTurns(options){
  const player=createTurnFamily(options),hunter=createTurnFamily({...options,family:'hunter'});
  const owner=live=>live?.set?.art?.kind==='hunter'?hunter:player;
  return {
    async prepare(groups,drawMaskPose){
      const results=await Promise.all([player.prepare(groups,drawMaskPose),hunter.prepare(groups)]);
      return results.some(Boolean);
    },
    request(...args){player.request(...args);hunter.request(...args);},
    decorate(entity,time,descriptor){return owner(descriptor?.__liveMouth).decorate(entity,time,descriptor);},
    draw(ctx,live,...args){return owner(live).draw(ctx,live,...args);},
    drawLeader(ctx,live,...args){return owner(live).drawLeader(ctx,live,...args);},
    drawMask(ctx,live,...args){return live?.set?.art?.kind==='hunter'?false:player.drawMask(ctx,live,...args);},
    drawEyeMask(ctx,live,...args){return live?.set?.art?.kind==='hunter'?hunter.drawEyeMask(ctx,live,...args):false;},
    reset(entity){player.reset(entity);hunter.reset(entity);},
    dispose(){player.dispose();hunter.dispose();},
    diagnostics(){return {...player.diagnostics(),hunter:hunter.diagnostics()};},
  };
}
