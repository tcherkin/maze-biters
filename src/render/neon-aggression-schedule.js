// Presentation-only cadence. Values come from cached authoritative AI attention.
// Explicit private seeds isolate all visual randomness from gameplay.
// Each eye owns its own random stream, pulse and waiting phase.
import {glintEnvelope} from './neon-eye-glints.js?v=1.02.06.00';

const clamp=value=>Math.max(0,Math.min(1,value));
const ACTIVATE=.12,DEACTIVATE=.08,MIN_AUTOMATIC_GAP=2500,MAX_DURATION=1150;
const ANCHORS=[
  {value:.2,min:6000,max:12000},
  {value:.45,min:5000,max:8000},
  {value:.7,min:4000,max:6000},
  {value:1,min:2500,max:4000}
];
function aggressionValue(value){
  if(!Number.isFinite(value))throw new TypeError('Aggression must be finite');
  return clamp(value);
}
function validTime(now){
  if(!Number.isFinite(now))throw new TypeError('Eye clock must be finite');
  return now;
}
export function aggressionCadence(value){
  const a=aggressionValue(value);
  if(a===0)return {min:Infinity,max:Infinity,label:'Спокойна'};
  const label=a<.325?'Ниска':a<.575?'Средна':a<.85?'Висока':'Максимална';
  if(a<=ANCHORS[0].value)return {min:ANCHORS[0].min,max:ANCHORS[0].max,label};
  for(let i=1;i<ANCHORS.length;i++){
    const lower=ANCHORS[i-1],upper=ANCHORS[i];
    if(a<=upper.value){
      const u=(a-lower.value)/(upper.value-lower.value);
      return {min:lower.min+(upper.min-lower.min)*u,max:lower.max+(upper.max-lower.max)*u,label};
    }
  }
  return {min:2500,max:4000,label};
}

export function createAggressionEyeSchedule(levels=[0,.2,.45,.7,1],seed=0x51e7){
  if(!Array.isArray(levels))throw new TypeError('Expected per-snake aggression levels');
  const entries=levels.map((value,index)=>{
    // Separate PRNG state means provoking one snake cannot alter its peers.
    let randomState=((seed>>>0)^Math.imul(index+1,0x9e3779b9))>>>0;
    const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
    const aggression=aggressionValue(value),active=aggression>=ACTIVATE;
    const initial=500+random()*1500;
    return {aggression,active,index,random,start:-Infinity,duration:1000,events:0,
      next:active?initial:Infinity,waitFrom:0,waitSpan:initial,jitter:random(),initialPending:active,lastPreview:-Infinity};
  });
  const gap=(entry,jitter=entry.jitter)=>{
    const cadence=aggressionCadence(entry.aggression);
    return cadence.min+(cadence.max-cadence.min)*jitter;
  };
  const isPulsing=(entry,now)=>now>=entry.start&&now<entry.start+entry.duration;
  function scheduleFrom(entry,now){
    entry.initialPending=false;
    if(!entry.active){entry.next=Infinity;return;}
    entry.jitter=entry.random();entry.waitFrom=now;entry.waitSpan=gap(entry);
    entry.next=now+entry.waitSpan;
  }
  function start(entry,now){
    entry.start=now;entry.duration=1000+entry.random()*150;entry.events++;
    scheduleFrom(entry,now);
  }
  function retime(entry,now){
    if(entry.initialPending)return;
    const remaining=Number.isFinite(entry.next)?clamp((entry.next-now)/entry.waitSpan):1;
    const span=gap(entry);
    entry.waitSpan=span;entry.waitFrom=now-(1-remaining)*span;
    entry.next=Math.max(now+remaining*span,entry.start+MIN_AUTOMATIC_GAP);
  }
  function setAggression(index,value,now){
    validTime(now);
    const entry=entries[index];if(!entry)return false;
    const next=aggressionValue(value),wasActive=entry.active;
    if(next===entry.aggression)return true;
    entry.aggression=next;
    entry.active=wasActive?next>DEACTIVATE:next>=ACTIVATE;
    if(!entry.active){entry.next=Infinity;entry.initialPending=false;return true;}
    if(!wasActive){
      // First provocation is visible immediately, but an existing preview or
      // fading pulse is never restarted or cut. It finishes its same envelope.
      if(isPulsing(entry,now))scheduleFrom(entry,entry.start);
      else start(entry,now);
    }else retime(entry,now);
    return true;
  }
  return {
    update(now){
      validTime(now);
      for(const entry of entries){
        if(!entry.active||entry.next>now)continue;
        if(now-entry.next>MAX_DURATION){scheduleFrom(entry,now);continue;}
        if(isPulsing(entry,now))continue;
        start(entry,now);
      }
    },
    level(index,now){const entry=entries[index];return entry?glintEnvelope(now-entry.start,entry.duration):0;},
    eventCount(index){return entries[index]?.events||0;},
    preview(index,now){
      validTime(now);
      const entry=entries[index];
      if(!entry||isPulsing(entry,now)||now-entry.lastPreview<1500)return false;
      entry.lastPreview=now;start(entry,now);return true;
    },
    setAggression,
    provoke(index,now){
      validTime(now);
      const entry=entries[index];if(!entry)return false;
      const oldEvents=entry.events;
      setAggression(index,entry.aggression+.2,now);
      if(entry.events!==oldEvents||isPulsing(entry,now))return true;
      if(now-entry.start>=MIN_AUTOMATIC_GAP)start(entry,now);
      else entry.next=Math.min(entry.next,entry.start+MIN_AUTOMATIC_GAP);
      return true;
    },
    snapshot:now=>entries.map(entry=>({index:entry.index,aggression:entry.aggression,active:entry.active,
      events:entry.events,start:entry.start,duration:entry.duration,next:entry.next,
      level:glintEnvelope(now-entry.start,entry.duration)}))
  };
}
