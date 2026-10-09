import {GAME_TIMING,smooth} from './bite-state.js';
import {TILE} from '../snake-ready-v1/snake-maze-walk/route.js';

// Shared presentation clock: locomotion supplies the quiet cell beat; actual
// contacts take over as one continuous chewing phrase, never a second overlay.
export function createPlayerMouthPlan(cfg){
  const events=(cfg.biteTimes??[]).map(at=>({at,kind:'segment',duration:GAME_TIMING.playerStep}));
  if(Number.isFinite(cfg.headBiteAt))events.push({at:cfg.headBiteAt,kind:'head',duration:cfg.headDuration??.14});
  events.sort((a,b)=>a.at-b.at);
  for(let i=0;i<events.length;i++){
    const event=events[i],gap=i+1<events.length?events[i+1].at-event.at:Infinity;
    if(!Number.isFinite(event.at)||!(event.duration>0)||!(gap>0))throw Error('Invalid player mouth events');
    // Reserve enough of a short inter-contact interval to reopen naturally.
    // This also handles the tight last-body -> head interval around a bend.
    event.closeAt=event.at+Math.min(event.duration,gap*.55);
    Object.freeze(event);
  }
  return Object.freeze({events:Object.freeze(events),lead:.06,release:.09});
}

export function samplePlayerMouth(time,cfg){
  if(!Number.isFinite(time)||time<0)throw Error('Invalid player mouth time');
  const travelledCells=Math.min(time,cfg.playerStopTime??Infinity)*(cfg.playerSpeed??GAME_TIMING.playerSpeed)/TILE;
  const phase=((travelledCells%1)+1)%1;
  // Small jaw motion for each travelled cell, not ten full chomps per second.
  const ordinary=.66+.14*Math.cos(2*Math.PI*phase);
  const plan=cfg.playerMouthPlan??createPlayerMouthPlan(cfg),events=plan.events;
  let closure=ordinary,action='travel',eventIndex=-1;
  if(events.length){
    const first=events[0],last=events.at(-1);
    if(time<first.at){
      const p=smooth((time-first.at+plan.lead)/plan.lead);
      closure=ordinary*(1-p);if(p>0){action='opening';eventIndex=0;}
    }else if(time<=last.closeAt){
      eventIndex=events.findLastIndex(event=>time>=event.at);
      const event=events[eventIndex];
      if(time<=event.closeAt){
        closure=smooth((time-event.at)/(event.closeAt-event.at));action='biting';
      }else{
        const next=events[eventIndex+1];
        closure=1-smooth((time-event.closeAt)/(next.at-event.closeAt));action='opening';
      }
    }else{
      const p=smooth((time-last.closeAt)/plan.release);
      closure=1+(ordinary-1)*p;action=p<1?'release':'travel';
    }
  }
  return {closure,phase,travelledCells,action,eventIndex};
}

export function playerBiteClosure(time,cfg){return samplePlayerMouth(time,cfg).closure;}
