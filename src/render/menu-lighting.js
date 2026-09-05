// Small, immutable light textures for the menu and score screens. The caller
// paints them after opaque surfaces and before text, inside its buffered frame.
(() => {
  const TEXTURE_SIZE=192;
  const FOCUS_FADE_MS=200;
  const FOCUS_POOL_ALPHA=.27;
  const FOCUS_REENTRY_GAP_MS=1000;
  const MIN_ALPHA=.00001;
  let emerald=null,violet=null,gold=null;
  let canvasAllocations=0,textureBuilds=0;

  function buildTexture(core,edge){
    const canvas=document.createElement('canvas');
    canvas.width=TEXTURE_SIZE;canvas.height=TEXTURE_SIZE;
    canvasAllocations++;
    const context=canvas.getContext('2d');
    const half=TEXTURE_SIZE/2;
    const gradient=context.createRadialGradient(half,half,0,half,half,half);
    gradient.addColorStop(0,`rgba(${core},1)`);
    gradient.addColorStop(.24,`rgba(${core},.72)`);
    gradient.addColorStop(.58,`rgba(${edge},.24)`);
    gradient.addColorStop(1,`rgba(${edge},0)`);
    context.fillStyle=gradient;
    context.fillRect(0,0,TEXTURE_SIZE,TEXTURE_SIZE);
    return canvas;
  }

  function prepareTextures(){
    if(emerald) return;
    emerald=buildTexture('132,255,239','22,163,128');
    violet=buildTexture('178,142,255','88,48,145');
    gold=buildTexture('255,225,163','224,154,62');
    textureBuilds++;
  }

  function timeValue(t){return Number.isFinite(t)?t:0;}
  function rectWidth(rect){return rect?.w??rect?.width;}
  function rectHeight(rect){return rect?.h??rect?.height;}
  function validRect(rect){
    return !!rect&&Number.isFinite(rect.x)&&Number.isFinite(rect.y)&&
      Number.isFinite(rectWidth(rect))&&rectWidth(rect)>0&&
      Number.isFinite(rectHeight(rect))&&rectHeight(rect)>0;
  }
  function copyRect(target,rect){
    target.x=rect.x;target.y=rect.y;
    target.w=rectWidth(rect);target.h=rectHeight(rect);
  }
  function clearState(state){
    state.currentKey=null;state.oldKey=null;
    state.currentStart=0;state.oldStart=0;
    state.currentAlpha=0;state.oldAlpha=0;
    state.changedAt=0;state.observedAt=null;
  }
  function advanceFocus(state,t){
    if(!state.currentKey) return;
    const reentered=state.observedAt!==null&&
      (t<state.observedAt||t-state.observedAt>FOCUS_REENTRY_GAP_MS);
    if(reentered){
      state.currentStart=1;state.currentAlpha=1;
      state.oldStart=0;state.oldAlpha=0;state.oldKey=null;
      state.changedAt=t;
    }else{
      const progress=Math.max(0,Math.min(1,(t-state.changedAt)/FOCUS_FADE_MS));
      const blend=progress*progress*(3-2*progress);
      state.currentAlpha=state.currentStart+(1-state.currentStart)*blend;
      state.oldAlpha=state.oldStart*(1-blend);
      if(progress===1){state.oldKey=null;state.oldStart=0;state.oldAlpha=0;}
    }
    state.observedAt=t;
  }

  function create(){
    let prepared=false,ambientPasses=0,focusPasses=0,accentPasses=0;
    const channels=new Map();

    function prepare(){
      if(prepared) return;
      prepareTextures();prepared=true;
    }

    function channelState(channel,allocate=false){
      const name=String(channel??'default');
      let state=channels.get(name);
      if(!state&&allocate){
        state={currentRect:{x:0,y:0,w:0,h:0},oldRect:{x:0,y:0,w:0,h:0}};
        clearState(state);channels.set(name,state);
      }
      return state;
    }

    function setFocus(channel,key,rect,t){
      if(key===null||key===undefined||key===''){
        resetFocus(channel);return false;
      }
      if(!validRect(rect)) return false;
      const state=channelState(channel,true),time=timeValue(t),nextKey=String(key);
      advanceFocus(state,time);
      if(state.currentKey===nextKey){
        copyRect(state.currentRect,rect);return false;
      }
      if(state.oldKey===nextKey){
        // Reversing a recent choice reverses the same two light pools without
        // snapping either to full brightness or introducing a third location.
        const rectangle=state.currentRect;
        state.currentRect=state.oldRect;state.oldRect=rectangle;
        state.oldKey=state.currentKey;
        state.currentStart=state.oldAlpha;state.oldStart=state.currentAlpha;
      }else{
        // During rapid navigation retain the strongest visible outgoing pool.
        // There is no queued trail and never more than two locations/channel.
        if(state.currentAlpha>=state.oldAlpha){
          state.oldKey=state.currentKey;
          copyRect(state.oldRect,state.currentRect);
          state.oldStart=state.currentAlpha;
        }else state.oldStart=state.oldAlpha;
        state.currentStart=0;
      }
      state.currentKey=nextKey;copyRect(state.currentRect,rect);
      state.currentAlpha=state.currentStart;state.oldAlpha=state.oldStart;
      if(state.oldAlpha<=MIN_ALPHA){state.oldKey=null;state.oldAlpha=0;state.oldStart=0;}
      state.changedAt=time;state.observedAt=time;
      return true;
    }

    function focusAlpha(channel,key,t){
      const state=channelState(channel);
      if(!state||key===null||key===undefined) return 0;
      advanceFocus(state,timeValue(t));
      const name=String(key);
      return state.currentKey===name?state.currentAlpha:
        state.oldKey===name?state.oldAlpha:0;
    }

    function focusContains(channel,key){
      const state=channelState(channel);
      if(!state||key===null||key===undefined) return false;
      const name=String(key);
      return state.currentKey===name||state.oldKey===name;
    }

    function beginLight(target,clipRect=null){
      target.save();
      target.globalAlpha=1;target.globalCompositeOperation='screen';
      target.filter='none';target.imageSmoothingEnabled=true;
      target.shadowBlur=0;target.shadowColor='rgba(0,0,0,0)';
      target.shadowOffsetX=0;target.shadowOffsetY=0;
      if(clipRect){
        target.beginPath();
        target.rect(clipRect.x,clipRect.y,rectWidth(clipRect),rectHeight(clipRect));
        target.clip();
      }
    }

    function stamp(target,texture,x,y,width,height,alpha,kind){
      if(alpha<=MIN_ALPHA) return false;
      target.globalAlpha=alpha;
      target.drawImage(texture,x,y,width,height);
      if(kind==='ambient') ambientPasses++;
      else if(kind==='focus') focusPasses++;
      else accentPasses++;
      return true;
    }

    function drawAmbient(target,scene,t){
      if(!prepared||(scene!=='menu'&&scene!=='leaderboard'&&scene!=='entry')) return false;
      const time=timeValue(t),turn=Math.PI*2;
      const driftX=Math.sin(time*turn/14000)*22;
      const driftY=Math.sin(time*turn/18000)*10;
      const emeraldBreath=1+.12*Math.sin(time*turn/16000+Math.PI/6);
      const violetBreath=1+.10*Math.sin(time*turn/18000+Math.PI*1.3);
      beginLight(target);
      if(scene==='menu'){
        stamp(target,emerald,-94+driftX,409+driftY,570,330,.095*emeraldBreath,'ambient');
        stamp(target,violet,609-driftX,423-driftY,510,310,.060*violetBreath,'ambient');
        // The room gently moves, but the wordmark's surrounding light stays
        // fixed so its sharp, high-contrast contours remain optically stable.
        stamp(target,emerald,140,96,744,124,.035,'ambient');
      }else{
        // The score terminal has its own nearly opaque surface, so these
        // quieter pools are drawn above that surface and below its headings.
        stamp(target,emerald,16+driftX,driftY,620,210,.046*emeraldBreath,'ambient');
        stamp(target,violet,560-driftX,13-driftY,420,225,.027*violetBreath,'ambient');
      }
      target.restore();return true;
    }

    function drawFocusPool(target,rect,weight){
      return stamp(target,emerald,rect.x-18,rect.y-14,rect.w+36,rect.h+28,
        FOCUS_POOL_ALPHA*weight,'focus');
    }

    function drawFocus(target,channel,t,clipRect=null){
      if(!prepared||(clipRect&&!validRect(clipRect))) return false;
      const state=channelState(channel);
      if(!state||!state.currentKey) return false;
      advanceFocus(state,timeValue(t));
      if(state.currentAlpha<=MIN_ALPHA&&state.oldAlpha<=MIN_ALPHA) return false;
      beginLight(target,clipRect);
      let drawn=false;
      if(state.oldKey) drawn=drawFocusPool(target,state.oldRect,state.oldAlpha)||drawn;
      drawn=drawFocusPool(target,state.currentRect,state.currentAlpha)||drawn;
      target.restore();return drawn;
    }

    function drawFocusFor(target,channel,key,t,clipRect=null){
      if(!prepared||(clipRect&&!validRect(clipRect))) return false;
      const state=channelState(channel);
      if(!state||key===null||key===undefined) return false;
      advanceFocus(state,timeValue(t));
      const name=String(key);
      const current=state.currentKey===name;
      const old=state.oldKey===name;
      if(!current&&!old) return false;
      const weight=current?state.currentAlpha:state.oldAlpha;
      if(weight<=MIN_ALPHA) return false;
      beginLight(target,clipRect);
      const drawn=drawFocusPool(target,current?state.currentRect:state.oldRect,weight);
      target.restore();return drawn;
    }

    function drawAccent(target,rect,t,kind='record',strength=1){
      if(!prepared||!validRect(rect)||!Number.isFinite(strength)) return false;
      const opacity=Math.max(0,Math.min(1,strength));
      if(opacity===0) return false;
      const time=timeValue(t),width=rectWidth(rect),height=rectHeight(rect);
      const champion=kind==='champion',cursor=kind==='cursor';
      const texture=champion?gold:emerald;
      const alpha=(champion?.105:cursor?.24:.085*(.94+.06*Math.sin(time/1850)))*opacity;
      const paddingX=cursor?5:14,paddingY=cursor?5:12;
      beginLight(target);
      const drawn=stamp(target,texture,rect.x-paddingX,rect.y-paddingY,
        width+paddingX*2,height+paddingY*2,alpha,'accent');
      target.restore();return drawn;
    }

    function resetFocus(channel){
      if(channel===undefined){for(const state of channels.values()) clearState(state);}
      else{
        const state=channelState(channel);
        if(state) clearState(state);
      }
    }

    function diagnostics(){
      let activeFocusChannels=0;
      for(const state of channels.values()) if(state.currentKey) activeFocusChannels++;
      return {prepared,textureBuilds,canvasAllocations,
        textureSizes:prepared?['192x192','192x192','192x192']:[],
        ambientPasses,focusPasses,accentPasses,passes:ambientPasses+focusPasses+accentPasses,
        focusChannels:channels.size,activeFocusChannels,focusFadeMs:FOCUS_FADE_MS};
    }

    return {prepare,drawAmbient,setFocus,drawFocus,drawFocusFor,focusAlpha,focusContains,
      drawAccent,resetFocus,diagnostics};
  }

  globalThis.MazeBitersMenuLighting=Object.freeze({create});
})();
