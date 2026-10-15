import {createEyeGlintPainter} from './neon-eye-glints.js?v=1.02.06.00';
import {createAggressionEyeSchedule} from './neon-aggression-schedule.js?v=1.02.06.00';

const clamp=value=>Math.max(0,Math.min(1,value));

// Reads the attention already committed by the original AI. No AI call,
// gameplay random draw, entity mutation, target selection or inferred mood.
export function createSnakeNeonEyes({makeCanvas}){
  if(typeof makeCanvas!=='function')throw new TypeError('Eye renderer needs a canvas factory');
  let states=new WeakMap(),nextIdentity=0,painter=null,sourceImage=null;
  let observations=0,draws=0,events=0,created=0,missing=0,clockRestarts=0,resets=0,failures=0;
  let lastLevel=0,lastAggression=null,lastGameTime=null,lastError=null;
  function newState(now,seed){
    const state={seed,origin:now,lastTime:now,aggression:0,level:0,events:0,schedule:createAggressionEyeSchedule([0],seed)};
    return state;
  }
  function observe(snake,attention,now){
    let state=states.get(snake),fresh=false;
    if(!state){
      state=newState(now,(Math.imul(++nextIdentity,0x9e3779b9)^0x31e731e7)>>>0);
      states.set(snake,state);created++;fresh=true;
    }else if(now<state.lastTime){
      state=newState(now,state.seed);states.set(snake,state);clockRestarts++;fresh=true;
    }
    // Repeated paints/camera moves while paused cannot advance an eye or
    // schedule another event. A queued attention change applies on resume.
    if(fresh||now>state.lastTime){
      const local=now-state.origin;
      if(fresh||attention!==state.aggression)state.schedule.setAggression(0,attention,local);
      state.schedule.update(local);state.level=state.schedule.level(0,local);
      const count=state.schedule.eventCount(0);
      events+=Math.max(0,count-state.events);state.events=count;
      state.lastTime=now;state.aggression=attention;
    }
    return state;
  }
  return {
    draw(ctx,snake,geometry,collisionArt,gameNow){
      if(!snake||(typeof snake!=='object'&&typeof snake!=='function')||!Number.isFinite(gameNow)||!geometry?.head||!collisionArt?.image)return false;
      const attention=snake.brainAggression;
      if(!Number.isFinite(attention)){missing++;return false;}
      const state=observe(snake,clamp(attention),gameNow);observations++;
      lastLevel=state.level;lastAggression=state.aggression;lastGameTime=gameNow;
      if(!(state.level>0)||ctx?.isContextLost?.())return false;
      try{
        if(sourceImage!==collisionArt.image||!painter){
          painter?.dispose();sourceImage=collisionArt.image;
          painter=createEyeGlintPainter(collisionArt,makeCanvas);
        }
        const painted=painter.draw(ctx,geometry.head,state.level);
        if(painted)draws++;
        return painted;
      }catch(error){failures++;lastError=String(error?.message||error);return false;}
    },
    reset(){
      states=new WeakMap();nextIdentity=0;painter?.dispose();painter=null;sourceImage=null;
      observations=draws=events=created=missing=clockRestarts=failures=0;
      lastLevel=0;lastAggression=lastGameTime=lastError=null;resets++;
    },
    diagnostics:()=>({mode:'authoritative-cached-brain-aggression',identity:'weak-per-snake',
      observations,draws,events,created,missing,clockRestarts,resets,failures,lastError,
      lastLevel,lastAggression,lastGameTime,aggressionChangesCadenceOnly:true,gameplayRandomCalls:0,
      painter:painter?.stats()||null})
  };
}
