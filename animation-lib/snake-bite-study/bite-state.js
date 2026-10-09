import {TILE,TAIL_SPAN,route} from '../snake-ready-v1/snake-maze-walk/route.js';
import {cellMotionState} from '../snake-ready-v1/snake-maze-walk/motion-cell.js';

// Canonical game.js: snakeMoveDelay()=218 ms; playerMoveDelay()=95 ms
// without power. Both are scaled once by the shared playback/game clock.
export const GAME_TIMING=Object.freeze({snakeStep:.218,playerStep:.095,
  snakeSpeed:TILE/.218,playerSpeed:TILE/.095,ratio:.218/.095});
export const DURATION=.095, FIRST_BITE=.65, BITE_INTERVAL=TILE/(GAME_TIMING.playerSpeed-GAME_TIMING.snakeSpeed);
export const smooth=t=>{t=Math.max(0,Math.min(1,t));return Math.max(0,Math.min(1,t*t*t*(10+t*(-15+6*t))));};
// Integral of the quintic easing. Used for a velocity-continuous reversal,
// not as a spring, and independent of frame count or seek direction.
export function smoothIntegral(t,duration=DURATION){
  if(t<=0)return 0;
  if(t>=duration)return t-duration/2;
  const u=t/duration;return duration*(u**6-3*u**5+2.5*u**4);
}
export function biteProgress(time,at,duration=DURATION){
  if(![time,at,duration].every(Number.isFinite)||duration<=0)throw Error('Invalid bite timing');
  return smooth((time-at)/duration);
}
export function configFor(scenario='tail'){
  if(!['tail','split','solo','corner','head','left'].includes(scenario))throw Error('Unknown bite scenario');
  // Head-only uses the same length-independent H(s); no one-cell body ribbon
  // is allocated, and its rendering skips the hidden two-cell sampling basis.
  return {scenario,headOnly:scenario==='head',cells:['solo','head'].includes(scenario)?2:7,startClock:scenario==='left'?1460:scenario==='corner'?795:scenario==='split'?279.8:340,
    speed:GAME_TIMING.snakeSpeed,duration:DURATION,firstBite:FIRST_BITE,interval:BITE_INTERVAL,
    totalTime:scenario==='split'?2.1:scenario==='solo'?.8:2.2};
}

// Material m runs from the ORIGINAL tail (0) to the original head (L).
// It never reindexes after a bite: the surviving painted rings keep their UV.
export function sampleBiteStudy(time,headSpan,config=configFor()){
  const {scenario,cells,startClock,speed,duration,firstBite,interval}=config;
  if(!Number.isFinite(time)||time<0||!Number.isFinite(headSpan)||headSpan<=0||
     !Number.isInteger(cells)||cells<2||!Number.isFinite(speed)||speed<=0||
     !Number.isFinite(startClock)||!(duration>0)||!(interval>=duration))throw Error('Invalid bite study state');
  const length=cells*TILE,clock=startClock+time*speed;
  const motion=cellMotionState(clock,length,{headSpan,tailSpan:TAIL_SPAN});
  const rear=motion.headDistance-headSpan,bodyMaterial=length-headSpan-TAIL_SPAN;
  if(bodyMaterial<=0)throw Error('Insufficient snake material');
  const materialScale=(bodyMaterial-motion.compression)/bodyMaterial;
  const world=m=>m<=TAIL_SPAN?motion.tailDistance+m:
    m>=length-headSpan?rear+(m-(length-headSpan)):
    motion.tailDistance+TAIL_SPAN+(m-TAIL_SPAN)*materialScale;
  const material=s=>s<=motion.tailDistance+TAIL_SPAN?s-motion.tailDistance:
    s>=rear?length-headSpan+s-rear:
    TAIL_SPAN+(s-motion.tailDistance-TAIL_SPAN)/materialScale;
  const base={time,clock,length,headSpan,rear,motion,world,material,materialScale,scenario,
    phase:motion.cyclePhase,headDistance:motion.headDistance,totalTime:config.totalTime};
  if(scenario==='split'){
    if(cells<4)throw Error('Split fixture requires at least four cells');
    // A whole cell is removed from collision ownership immediately. Visible
    // material is a separate, short-lived consumption transition.
    const frontCells=Math.floor(cells/2),backCells=cells-1-frontCells;
    const center=(backCells+.5)*TILE,p= biteProgress(time,firstBite,duration);
    // Never delay collision/scoring until the visual consumption finishes.
    const hit=time>=firstBite?1:0;
    const frontCut=center+TILE/2*hit,backCut=center-TILE/2*hit;
    const visualProgress=config.splitVisual==='cut'?hit:p;
    const visualFrontCut=center+TILE/2*visualProgress;
    const visualBackCut=center-TILE/2*visualProgress;
    // A new pointed cap grows from zero length, instead of exposing a full
    // diameter sawn-off face and waiting for that face to become pointed.
    const visualCapSpan=TAIL_SPAN*visualProgress;
    const backOffset=-2*speed*smoothIntegral(time-firstBite,duration);
    return {...base,progress:p,eventAt:firstBite,eaten:hit,logicalEaten:hit,
      frontCut,backCut,visualFrontCut,visualBackCut,visualCapSpan,backOffset,cutCenter:center,soloBlend:0,
      frontCells,backCells,
      visualIntervals:[[0,visualBackCut],[visualFrontCut,length]],
      intervals:[[0,backCut],[frontCut,length]],eventActive:time>=firstBite&&time<firstBite+duration};
  }
  let eaten=0,logicalEaten=0,eventAt=firstBite,progress=0;
  const biteTimes=config.biteTimes??Array.from({length:cells-1},(_,i)=>firstBite+i*interval);
  for(const at of biteTimes){
    const p=biteProgress(time,at,duration);
    eaten+=p;if(time>=at){logicalEaten++;eventAt=at;progress=p;}
  }
  // Two cells -> solo is a terminal visual transition, not a negative body
  // length. The authored skull is slightly longer than one grid cell.
  const soloBlend=biteProgress(time,biteTimes[cells-2]??Number.MAX_VALUE,duration);
  const removed=Math.min(length-headSpan,eaten*TILE);
  return {...base,eaten,logicalEaten,removed,tail:world(removed),soloBlend,eventAt,progress,
    // Logical cells conserve exactly TILE; the visual skull keeps its extra
    // 0.365625px at the terminal frame rather than being squeezed into a tile.
    intervals:[[Math.min(length,eaten*TILE),length]],visualIntervals:[[removed,length]],remainingCells:cells-logicalEaten,
    eventActive:time>=eventAt&&time<eventAt+duration};
}

export function materialUV(material){return ((material-TAIL_SPAN)%TILE+TILE)%TILE/TILE;}

// Production adapter contract: feed an immutable collision result into a
// visual transition. Never defer collision removal until animation completion.
export function splitCellIds(ids,index){
  if(!Array.isArray(ids)||!Number.isInteger(index)||index<0||index>=ids.length)throw Error('Invalid cut index');
  const parts=[];
  if(index>0)parts.push(ids.slice(0,index));
  if(index+1<ids.length)parts.push(ids.slice(index+1).reverse());
  return parts;
}
