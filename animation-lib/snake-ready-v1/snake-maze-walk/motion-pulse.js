import {route,mod} from './route.js';

const TAU=Math.PI*2;
const HEAD_SPEED_AMPLITUDE=.20;
const MIN_TAIL_SPEED=.60;
const COMPRESSION_LIMIT=12;

function settings(options){
  const enabled=options.enabled??true;
  const cycleDistance=options.cycleDistance??route.total/12;
  if(!Number.isFinite(cycleDistance)||!(cycleDistance>0))
    throw new Error('Pulse cycle distance must be finite and positive');
  return{enabled,cycleDistance};
}

function headState(distance,enabled,cycleDistance){
  const cyclePhase=mod(distance,cycleDistance)/cycleDistance;
  if(!enabled)return{headDistance:distance,headSpeedFactor:1,cyclePhase};
  const angle=TAU*cyclePhase;
  return{headDistance:distance+HEAD_SPEED_AMPLITUDE*cycleDistance/TAU*Math.sin(angle),
    headSpeedFactor:1+HEAD_SPEED_AMPLITUDE*Math.cos(angle),cyclePhase};
}

// Distance-only motion: no spring state, frame history, direction switch,
// sprite transformation, or independent head/body rotation. Increasing this
// scalar advances either circulation through the unchanged route renderer.
// The default twelve cycles per lap are periodic when the lab wraps its
// distance clock. A custom non-commensurate period needs an unwrapped clock.
export function motionState(distance,nominalLength,options={}){
  const {enabled,cycleDistance}=settings(options);
  const headSpan=options.headSpan??0,tailSpan=options.tailSpan??0;
  const minBodyGap=options.minBodyGap??4;
  if(!Number.isFinite(distance)||!Number.isFinite(nominalLength)||nominalLength<0||
     !Number.isFinite(headSpan)||headSpan<0||!Number.isFinite(tailSpan)||tailSpan<0||
     !Number.isFinite(minBodyGap)||!(minBodyGap>0))
    throw new Error('Invalid pulsed-motion distances');
  const head=headState(distance,enabled,cycleDistance);

  // Compression is disabled when the original interval is already shorter
  // than its owned pieces (including head-only views); it never worsens an
  // existing short interval. A valid two-cell attached snake keeps >=4px.
  const availableCompression=Math.max(0,nominalLength-headSpan-tailSpan-minBodyGap);
  // T' = 1 + .20 cos(phi) + (pi*Cmax/period) sin(phi).
  // Bound the combined oscillation, not its two terms separately, so even
  // an unusually short caller-supplied period cannot stop/reverse the tail.
  const speedCompressionLimit=cycleDistance/Math.PI*
    Math.sqrt((1-MIN_TAIL_SPEED)**2-HEAD_SPEED_AMPLITUDE**2);
  const maxCompression=enabled?Math.min(COMPRESSION_LIMIT,availableCompression,speedCompressionLimit):0;
  const angle=TAU*head.cyclePhase;
  const compression=maxCompression*(1-Math.cos(angle))/2;
  const tailSpeedFactor=head.headSpeedFactor+maxCompression*Math.PI/cycleDistance*Math.sin(angle);
  return{...head,tailDistance:head.headDistance-nominalLength+compression,
    compression,maxCompression,tailSpeedFactor};
}

// Monotone inverse of H(d), for presets and toggles that must retain the
// currently displayed head position. Only enabled/cycleDistance affect H;
// snake length and head/tail ownership never change the head's waveform.
export function distanceForHead(headDistance,options={}){
  if(!Number.isFinite(headDistance))throw new Error('Invalid displayed head distance');
  const {enabled,cycleDistance}=settings(options);
  if(!enabled)return headDistance;
  const amplitude=HEAD_SPEED_AMPLITUDE*cycleDistance/TAU;
  let low=headDistance-amplitude,high=headDistance+amplitude,x=headDistance;
  const tolerance=Math.max(1e-10,Number.EPSILON*Math.abs(headDistance)*8);
  for(let i=0;i<32;i++){
    const state=headState(x,true,cycleDistance),error=state.headDistance-headDistance;
    if(Math.abs(error)<=tolerance)return x;
    if(error>0)high=x;else low=x;
    const next=x-error/state.headSpeedFactor;
    x=next>low&&next<high?next:(low+high)/2;
  }
  return x;
}
