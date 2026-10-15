// Presentation only: never writes actor direction, position, movement or input.
import {DIRECTIONS,planTurn,sampleTurn,unwrapTarget} from './fantasy-turn/turn.js?v=1.02.14.01';

export const FANTASY_TURN_MS=90;
export const DEFAULT_TURN_MS=FANTASY_TURN_MS;
export const MAX_RETARGET_BRAKE_MS=12;
export const MAX_RETARGET_DRIFT_QUARTERS=.025;
const clamp01=x=>Math.max(0,Math.min(1,x));
const wrap=x=>((x%4)+4)%4;
const ease=u=>u*u*u*(10+u*(-15+6*u));
const easeSpeed=u=>30*u*u*(1-u)*(1-u);
const directionAt=angle=>DIRECTIONS[wrap(angle)];
function validateTime(time){if(!Number.isFinite(time))throw new TypeError('Turn time must be finite');}
function validateEntity(entity){if(!entity||(typeof entity!=='object'&&typeof entity!=='function'))throw new TypeError('A turn actor is required');}
function validateDirection(direction){if(!DIRECTIONS.includes(direction))throw new TypeError('Unknown turn direction');}

function projectedPose(angle,to,progress,velocity,delta,done){
  if(done)return {angle,from:to,to,mix:0,done:true,progress};
  const sign=Math.sign(velocity)||Math.sign(delta)||1;
  const start=sign>0?Math.floor(angle):Math.ceil(angle);
  return {angle,from:directionAt(start),to:directionAt(start+sign),
    mix:clamp01(Math.abs(angle-start)),done:false,progress};
}

function evaluate(state,time){
  const elapsed=Math.max(0,time-state.startedAt),u=clamp01(elapsed/FANTASY_TURN_MS);
  if(state.kind==='native'){
    const pose=sampleTurn(state.plan,u);
    pose.angle+=state.offset;
    return {pose,velocity:u>0&&u<1?state.plan.delta*easeSpeed(u)/FANTASY_TURN_MS:0};
  }
  if(u===1)return {pose:projectedPose(state.target,state.to,1,0,state.delta,true),velocity:0};
  let angle,velocity;
  if(state.kind==='brake'){
    const b=state.brakeMs;
    if(elapsed<b){
      angle=state.start+state.velocity*(elapsed-elapsed*elapsed/(2*b));
      velocity=state.velocity*(1-elapsed/b);
    }else{
      const remaining=FANTASY_TURN_MS-b,v=clamp01((elapsed-b)/remaining);
      angle=state.brakeEnd+(state.target-state.brakeEnd)*ease(v);
      velocity=(state.target-state.brakeEnd)*easeSpeed(v)/remaining;
    }
  }else{
    // Quintic Hermite: preserve current speed, arrive with zero speed and
    // acceleration. The native plan above remains bit-for-bit unchanged.
    const m=state.velocity*FANTASY_TURN_MS,d=state.delta;
    const a=10*d-6*m,b=-15*d+8*m,c=6*d-3*m;
    angle=state.start+m*u+a*u**3+b*u**4+c*u**5;
    velocity=(m+3*a*u*u+4*b*u**3+5*c*u**4)/FANTASY_TURN_MS;
  }
  return {pose:projectedPose(angle,state.to,u,velocity,state.delta,false),velocity};
}

/**
 * Call request only when gameplay commits a heading. All 90/180 degree
 * changes last 90 simulation ms; movement is entirely outside this service.
 * sample is a pure query, including past/future probes: it creates no actor,
 * changes no timer, and never marks a turn complete. A clock rollback on a
 * later request starts fresh from its authoritative `from` cardinal.
 */
export function createFantasyTurnClock(){
  let actors=new WeakMap();
  function request(entity,from,to,time){
    validateEntity(entity);validateDirection(from);validateDirection(to);validateTime(time);
    let prior=actors.get(entity);
    if(prior&&(time<prior.lastRequestAt||prior.to!==from&&prior.to!==to))prior=null;
    if(prior&&prior.to===to){
      prior.lastRequestAt=time;
      return evaluate(prior,time).pose;
    }
    const current=prior?evaluate(prior,time):null;
    const plan=planTurn(from,to);
    const start=current?.pose.angle??plan.startAngle;
    const target=unwrapTarget(start,to,from==='left'&&to==='right'?-1:0),delta=target-start;
    const common={from,to,startedAt:time,lastRequestAt:time,start,target,delta};
    let state;
    if(!current||current.pose.done){
      state={...common,kind:'native',plan,offset:start-plan.startAngle};
    }else{
      const velocity=current.velocity;
      // An unbounded Hermite at a short/opposite new target would overshoot
      // or form a loop. Arrest existing visual momentum locally, then finish
      // the latest request; do not queue old headings or delay gameplay.
      const aligned=velocity*delta>0;
      const safeHermite=Math.abs(velocity)<1e-12||aligned&&Math.abs(velocity)*FANTASY_TURN_MS<=2.5*Math.abs(delta);
      if(safeHermite)state={...common,kind:'hermite',velocity};
      else{
        let brakeMs=Math.min(MAX_RETARGET_BRAKE_MS,2*MAX_RETARGET_DRIFT_QUARTERS/Math.abs(velocity));
        if(aligned)brakeMs=Math.min(brakeMs,Math.abs(delta/velocity));
        state={...common,kind:'brake',velocity,brakeMs,
          brakeEnd:start+velocity*brakeMs/2};
      }
    }
    actors.set(entity,state);
    return evaluate(state,time).pose;
  }
  return {
    request,
    sample(entity,time){
      validateTime(time);
      const state=entity&&(typeof entity==='object'||typeof entity==='function')?actors.get(entity):null;
      return state?evaluate(state,time).pose:null;
    },
    reset(entity){if(entity)actors.delete(entity);else actors=new WeakMap();},
  };
}
