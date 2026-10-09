import {TILE,DIAMETER,travelPoint,route} from '../snake-ready-v1/snake-maze-walk/route.js';
import {sampleBiteStudy,GAME_TIMING} from './bite-state.js';
import {HEAD_DURATION,NAPE_RATIO,headContactPoint} from './head-consumption.js';
import {createPlayerMouthPlan} from './player-mouth.js';

export const PLAYER_SIZE=TILE*.88;
// Original 160px atlas: visible forward edge at 154, up edge at 6.
// Match the actual sprite, not the empty margin of its square image.
export const PLAYER_REACH=PLAYER_SIZE*74/160;

function baseline(time,headSpan,cfg){
  return sampleBiteStudy(time,headSpan,{...cfg,scenario:'tail',biteTimes:[],firstBite:1e6});
}
function firstCrossing(fn,after,limit){
  let low=after,fl=fn(low);
  if(fl>=0)return low;
  // A deterministic swept contact test; never dependent on rendered FPS.
  // 0.5 ms bracketing catches the accepted velocity pulses, then bisection
  // resolves first contact to much less than a visible pixel.
  for(let high=low+.0005;high<=limit+.0005;high+=.0005){
    if(fn(high)>=0){for(let i=0;i<42;i++){const mid=(low+high)/2;if(fn(mid)>=0)high=mid;else low=mid;}return high;}
    low=high;
  }
  throw Error('Player did not reach the next snake segment');
}

export function createEncounter(input,headSpan){
  const cfg={...input,playerSpeed:GAME_TIMING.playerSpeed,playerMouthReach:PLAYER_REACH*.55,playerMouthDrop:PLAYER_SIZE*.18,
    headDuration:HEAD_DURATION,biteTimes:[]};
  if(cfg.scenario==='split'){
    // Keep the collision on the real T junction (378,90), not on a moving
    // target to which the player would have to slide sideways or teleport.
    const target=route.pieces[1].start+270;
    let lo=400,hi=450;
    const center=(cfg.cells-1-Math.floor(cfg.cells/2)+.5)*TILE;
    for(let i=0;i<48;i++){
      const mid=(lo+hi)/2,s=baseline(0,headSpan,{...cfg,startClock:mid});
      if(s.world(center)<target)lo=mid;else hi=mid;
    }
    cfg.startClock=(lo+hi)/2-cfg.firstBite*cfg.speed;
    cfg.contactDistance=target;
    cfg.contactPoint=travelPoint(target);
    cfg.playerContactY=cfg.contactPoint.y+DIAMETER/2+PLAYER_REACH;
    // The existing T corridor has a wall beyond the snake. Walk up at the
    // native player rate, touch its near edge, enter the released cell and
    // stop at that wall; no staged backing away or chase-target attachment.
    cfg.playerBranchY=cfg.contactPoint.y+2*TILE;
    cfg.playerApproachLength=cfg.firstBite*cfg.playerSpeed-(cfg.playerBranchY-cfg.playerContactY);
    cfg.playerStart=cfg.contactPoint.x+cfg.playerApproachLength;
    cfg.playerStopTime=cfg.firstBite+(DIAMETER/2+PLAYER_REACH)/cfg.playerSpeed;
    cfg.biteTimes=[cfg.firstBite];cfg.totalTime=cfg.firstBite+1.25;
    cfg.playerMouthPlan=createPlayerMouthPlan(cfg);
    return cfg;
  }
  const first=baseline(cfg.firstBite,headSpan,cfg);
  const firstTarget=cfg.headOnly?first.rear+headSpan*NAPE_RATIO:first.world(0);
  cfg.playerStart=firstTarget-PLAYER_REACH-cfg.playerSpeed*cfg.firstBite;
  let previous=0;
  for(let i=0;i<(cfg.headOnly?0:cfg.cells-1);i++){
    const contact=firstCrossing(t=>{
      const player=travelPoint(cfg.playerStart+cfg.playerSpeed*t);
      const tip=travelPoint(baseline(t,headSpan,cfg).world(i*TILE));
      // Rounded player's visible footprint, including corners: never compare
      // only arc-distance offsets, which miss the first touch around a bend.
      return PLAYER_REACH-Math.hypot(player.x-tip.x,player.y-tip.y);
    },previous,5);
    cfg.biteTimes.push(contact);previous=contact+1e-9;
  }
  // A distinct first-contact root at the rounded nape of the rigid skull.
  // Not an arbitrary pause after the last tail event; the player keeps moving.
  cfg.headBiteAt=firstCrossing(t=>{
    const player=samplePlayer(t,cfg),nape=headContactPoint(baseline(t,headSpan,cfg));
    return PLAYER_REACH-Math.hypot(player.x-nape.x,player.y-nape.y);
  },previous,5);
  cfg.firstBite=cfg.biteTimes[0]??cfg.headBiteAt;
  cfg.totalTime=cfg.headBiteAt+cfg.headDuration+.22;
  cfg.playerMouthPlan=createPlayerMouthPlan(cfg);
  return cfg;
}

export function samplePlayer(time,cfg){
  if(cfg.scenario==='split'){
    const travelled=cfg.playerSpeed*time;
    if(travelled<cfg.playerApproachLength)return {x:cfg.playerStart-travelled,y:cfg.playerBranchY,
      angle:Math.PI,frontY:cfg.playerBranchY,stopped:false};
    const y=Math.max(cfg.contactPoint.y,cfg.playerBranchY-(travelled-cfg.playerApproachLength));
    return {x:cfg.contactPoint.x,y,angle:-Math.PI/2,
      frontY:y-PLAYER_REACH,stopped:time>=cfg.playerStopTime};
  }
  const distance=cfg.playerStart+cfg.playerSpeed*time;
  return {...travelPoint(distance),distance,frontDistance:distance+PLAYER_REACH,stopped:false};
}
