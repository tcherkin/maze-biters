import {smooth} from './bite-state.js';
export {playerBiteClosure} from './player-mouth.js';
import {attachedPose} from '../snake-ready-v1/snake-maze-walk/head-attached.js';

export const HEAD_DURATION=.14;
// clipSoloHead's rearmost central point is source x=222 rather than x=220.
export const NAPE_RATIO=2/215.5;

export function headContactPoint(state){
  const pose=attachedPose(state.headDistance,false,{skullLength:state.headSpan});
  const inset=state.headSpan*NAPE_RATIO;
  return {x:pose.rear.x+Math.cos(pose.angle)*inset,y:pose.rear.y+Math.sin(pose.angle)*inset};
}

// Separate final-head event: segment ownership/material IDs remain untouched.
// The collision commits at first contact; the non-collidable painted head
// then folds into the moving player's mouth with a UNIFORM scale, not a warp.
export function sampleHeadConsumption(time,state,player,cfg,profile){
  const pose=attachedPose(state.headDistance,false,profile),at=cfg.headBiteAt;
  const consumed=Number.isFinite(at)&&time>=at;
  const duration=cfg.headDuration??HEAD_DURATION;
  if(!(duration>0)||!Number.isFinite(duration)||!Number.isFinite(time))throw Error('Invalid head consumption timing');
  const progress=!consumed?0:cfg.headVisual==='instant'?1:smooth((time-at)/duration);
  const mouthReach=cfg.playerMouthReach??8;
  // The side-view atlas's mouth is below the actor center. Fade that drop
  // continuously at vertical headings rather than jumping with sprite banks.
  const mouthDrop=(cfg.playerMouthDrop??0)*Math.cos(player.angle)**2;
  const mouth={x:player.x+Math.cos(player.angle)*mouthReach,y:player.y+Math.sin(player.angle)*mouthReach+mouthDrop};
  const center={x:pose.center.x+(mouth.x-pose.center.x)*progress,y:pose.center.y+(mouth.y-pose.center.y)*progress};
  const delta=Math.atan2(Math.sin(player.angle-pose.angle),Math.cos(player.angle-pose.angle));
  return {consumed,active:consumed&&progress<1,complete:progress===1,progress,
    scale:1-progress,center,angle:pose.angle+delta*progress,mouth,pose,
    remainingCells:consumed?0:cfg.headOnly?1:state.remainingCells};
}
