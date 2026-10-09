const RAMP_FRACTION=.12;

// A unit-distance stroke with constant middle velocity and raised-cosine
// acceleration/deceleration ramps. Position is C2 at both ends and where
// each ramp meets the plateau. There is no dwell or mutable playback state.
function stroke(t){
  if(t<=0)return {position:0,rate:0,acceleration:0};
  if(t>=1)return {position:1,rate:0,acceleration:0};
  const r=RAMP_FRACTION,normalizer=1-r;
  if(t>=r&&t<=1-r)
    return {position:(t-r/2)/normalizer,rate:1/normalizer,acceleration:0};
  const entering=t<r,u=entering?t:1-t,angle=Math.PI*u/r;
  const integral=.5*(u-r/Math.PI*Math.sin(angle))/normalizer;
  return {position:entering?integral:1-integral,
    rate:.5*(1-Math.cos(angle))/normalizer,
    acceleration:(entering?1:-1)*Math.PI*Math.sin(angle)/(2*r*normalizer)};
}

// elapsedSeconds is a time clock, while startClock/endClock are the existing
// increasing route-distance clock. Feed the returned distance to the existing
// cell motion and keep the renderer's route-facing setting unchanged.
// direction describes time playback ONLY: it must not flip the head sprite.
// Aligned cell endpoints are the caller's responsibility when zero compression
// and a head-first backward stroke are required at the wall.
export function retreatClock(elapsedSeconds,{startClock,endClock,baseSpeed=84}={}){
  if(!Number.isFinite(elapsedSeconds)||!Number.isFinite(startClock)||
     !Number.isFinite(endClock)||!(endClock>startClock)||
     !Number.isFinite(baseSpeed)||!(baseSpeed>0))
    throw new Error('Retreat study requires finite time, increasing endpoints, and positive speed');
  const span=endClock-startClock,approachDuration=span/baseSpeed;
  const backingDuration=2*approachDuration,cycleDuration=approachDuration+backingDuration;
  if(!Number.isFinite(cycleDuration)||!(approachDuration>0))
    throw new Error('Retreat study duration must be finite and positive');
  const remainder=elapsedSeconds%cycleDuration;
  const cycleTime=remainder<0?remainder+cycleDuration:Math.max(0,remainder);
  const backing=cycleTime>=approachDuration;
  const direction=backing?-1:1;
  const legDuration=backing?backingDuration:approachDuration;
  const legProgress=(backing?cycleTime-approachDuration:cycleTime)/legDuration;
  const shape=stroke(legProgress);
  const distance=backing?endClock-span*shape.position:startClock+span*shape.position;
  const speedFactor=shape.rate===0?0:direction*approachDuration/legDuration*shape.rate;
  const acceleration=shape.acceleration===0?0:direction*span/(legDuration*legDuration)*shape.acceleration;
  return {distance,direction,backing,speedFactor,velocity:baseSpeed*speedFactor,acceleration,
    phase:backing?'backing':'approach',legProgress,cyclePhase:cycleTime/cycleDuration,
    approachDuration,backingDuration,cycleDuration};
}
