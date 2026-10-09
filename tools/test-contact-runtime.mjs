import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createContactRuntime,ACTOR_CONTACT_TOLERANCE,CONTACT_REARM_DISTANCE} from '../src/engine/contact-runtime.js';

function circle(x,y=0,r=1,id='opaque',out={}){
  const part=out.part||(out.part={id,kind:'circle',x,y,r});
  Object.assign(part,{id,x,y,r});out.parts||(out.parts=[part]);return out;
}
function actor(entity,kind,position,surfaceSpeed=0){return {entity,kind,surfaceSpeed,
  revision:entity.revision||0,shape:(time,out)=>circle(position(time),0,1,'opaque',out)};}
const near=(a,b,epsilon=.002)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
let eventsChecked=0;

// Earliest visible touch wins, independent of actor enumeration order.
{
  const runtime=createContactRuntime(),p={},nearPrey={},farPrey={};
  let prey=[farPrey,nearPrey];const events=[];
  const actors=()=>[actor(p,'player',t=>t,1),...prey.map(e=>actor(e,'snake',()=>e===nearPrey?6:10))];
  runtime.step(0,20,actors,(a,b,hit)=>{events.push({entity:b.entity,time:hit.time});prey=prey.filter(e=>e!==b.entity);return{kind:'head'};});
  assert.equal(events.length,2);assert.equal(events[0].entity,nearPrey);assert.equal(events[1].entity,farPrey);
  near(events[0].time,4);near(events[1].time,8);eventsChecked+=events.length;
}

// Each newly exposed material tip keeps its actual position. Logical pops do
// not make every remaining segment inherit the just-bitten tip's collider.
{
  const runtime=createContactRuntime(),p={},s={revision:0,tips:[6,10,14]},events=[];
  const actors=()=>[actor(p,'player',t=>t,1),...(!s.tips.length?[]:[{entity:s,kind:'snake',revision:s.revision,
    surfaceSpeed:0,shape:(t,out)=>circle(s.tips[0],0,1,`tail-material-${s.tips.length}`,out)}])];
  runtime.step(0,20,actors,(a,b,hit)=>{events.push({time:hit.time,material:hit.partB.id,captured:s.tips.length});
    s.tips.shift();s.revision++;return{kind:'tail'};});
  assert.deepEqual(events.map(e=>e.captured),[3,2,1]);
  events.forEach((e,i)=>near(e.time,4+i*4));
  assert.equal(new Set(events.map(e=>e.material)).size,3);eventsChecked+=events.length;
}

// A latched pair must rearm if it separates and returns in the SAME update.
// This also catches re-entry after an earlier event within a large first pass.
for(const prelatched of [false,true]){
  const runtime=createContactRuntime(),p={},s={},events=[];
  const moving=t=>10*Math.sin(Math.PI*t/100);
  const actors=()=>[actor(p,'player',()=>0),actor(s,'snake',moving,Math.PI/10)];
  const resolve=(a,b,hit)=>{events.push(hit.time);return{kind:'blocked'};};
  if(prelatched)runtime.step(0,0,actors,resolve);
  runtime.step(0,100,actors,resolve);
  assert.equal(events.length,2,'same revision re-entry is a new contact, not a cooldown');
  near(events[0],0);
  const firstSkin=100-Math.asin((2+ACTOR_CONTACT_TOLERANCE)/10)*100/Math.PI;
  const actualTouch=100-Math.asin(.2)*100/Math.PI;
  assert.ok(events[1]>=firstSkin-1e-6&&events[1]<=actualTouch+1e-6,'re-entry is within the explicit contact skin');
  eventsChecked+=events.length;
}

// Stable overlapping actors do not emit repeatedly, including zero-duration
// post-mutation passes. A measured departure/re-entry later rearms normally.
{
  const runtime=createContactRuntime(),p={},s={},events=[];let x=1;
  const actors=()=>[actor(p,'player',()=>0),actor(s,'hunter',()=>x)];
  const resolve=(a,b,hit)=>{events.push(hit.time);return{kind:'blocked'};};
  runtime.step(0,10,actors,resolve);runtime.step(10,10,actors,resolve);runtime.step(10,20,actors,resolve);
  assert.equal(events.length,1);x=10;runtime.step(20,21,actors,resolve);
  x=1;runtime.step(21,21,actors,resolve);assert.equal(events.length,2);
  runtime.reset();runtime.step(0,0,actors,resolve);assert.equal(events.length,3);eventsChecked+=events.length;
}

// Explicit source-pose discontinuity + jump bound defeats false broad-phase
// rejection; empty-to-visible geometry is also examined at its breakpoint.
for(const absent of [false,true]){
  const runtime=createContactRuntime(),p={},s={},events=[];
  const actors=()=>[actor(p,'player',()=>0),{entity:s,kind:'scorpion',surfaceSpeed:0,jumpPad:100,
    shape:(t,out)=>t<.375?(absent?{parts:[]}:circle(100,0,1,'far',out)):circle(1,0,1,'claw',out),
    breakpoints:()=>[.375]}];
  runtime.step(0,1,actors,(a,b,hit)=>{events.push(hit);return{kind:'scorpion',stop:true};});
  assert.equal(events.length,1);near(events[0].time,.375,1e-12);eventsChecked++;
}

// Several actors share a shape-producing implementation with reusable output.
// Sampling one must not corrupt the geometry of an earlier sampled actor.
{
  const runtime=createContactRuntime(),p={},s={},events=[];
  const actors=()=>[actor(p,'player',t=>t,1),actor(s,'snake',()=>6)];
  runtime.step(0,8,actors,(a,b,hit)=>{events.push(hit.time);return{kind:'head',stop:true};});
  near(events[0],4);eventsChecked++;
}

// Far actors are rejected before any millisecond/frame-change probe loops.
// Budget is algorithmic, not a hardware-dependent wall-time assertion.
{
  const runtime=createContactRuntime(),p={},others=Array.from({length:100},()=>({}));let samples=0;
  const actors=()=>[actor(p,'player',()=>0),...others.map((e,i)=>({entity:e,kind:'snake',surfaceSpeed:1,
    shape:(t,out)=>{samples++;return circle(1000+i*30,0,1,'far',out);}}))];
  const started=performance.now();runtime.step(0,8,actors,()=>{throw Error('No distant contact');});
  const elapsed=performance.now()-started,stats=runtime.diagnostics();
  assert.equal(stats.broadRejects,100);assert.equal(stats.sweeps,0);assert.equal(samples,100);
  console.log(`Far-pair probe budget: ${samples} geometry samples, ${elapsed.toFixed(3)}ms on this machine (not a performance guarantee).`);
}
{
  const runtime=createContactRuntime(),p={},others=Array.from({length:100},()=>({}));let boundsCalls=0;
  const descriptor=(entity,kind,x)=>({entity,kind,surfaceSpeed:1,
    bounds(t,out){boundsCalls++;return Object.assign(out,{left:x-5,top:-5,right:x+5,bottom:5});},
    shape(){throw Error('Distant coarse bounds must reject before building any outline');}});
  const actors=()=>[descriptor(p,'player',0),...others.map((e,i)=>descriptor(e,'snake',1000+i*30))];
  runtime.step(0,8,actors,()=>{throw Error('No distant contact');});
  assert.equal(boundsCalls,101);assert.equal(runtime.diagnostics().coarseRejects,100);
  assert.equal(runtime.diagnostics().sweeps,0);
}
// A real resolver holds/rebounds touching actors. Its explicit settled flag
// avoids thousands of generic separation probes for an unchanged response.
// Changing motion invalidates that fast path, so it is not a timed immunity.
{
  const runtime=createContactRuntime(),p={moveStartedAt:0},s={moveStartedAt:0};let calls=0;
  const ring=(cx,count,radius)=>Array.from({length:count},(_,i)=>({x:cx+Math.cos(i/count*Math.PI*2)*radius,y:Math.sin(i/count*Math.PI*2)*radius}));
  const playerShape={parts:[{id:'mouth',kind:'polygon',points:ring(0,73,7)}]};
  const scorpionShape={parts:Array.from({length:17},(_,i)=>({id:`body-${i}`,kind:'polygon',points:ring(1+i*.1,49,6)}))};
  const actors=()=>[{entity:p,kind:'player',surfaceSpeed:2,shape:()=>playerShape},
    {entity:s,kind:'scorpion',surfaceSpeed:6,shape:()=>scorpionShape}];
  const resolve=()=>{calls++;return{kind:'blocked',settled:true};};
  runtime.step(0,0,actors,resolve);const start=performance.now();
  for(let frame=0;frame<120;frame++)runtime.step(frame*8,(frame+1)*8,actors,resolve);
  const ms=performance.now()-start,stats=runtime.diagnostics();
  assert.equal(calls,1);assert.equal(stats.separationProbes,0);assert.equal(stats.settledSkips,121);
  console.log(`Settled 906-vertex contact: 120 frames in ${ms.toFixed(3)}ms, zero separation probes.`);
  // A new material revision can be resolved immediately at the same position.
  s.revision=1;const revised=()=>actors().map(a=>({...a,revision:a.entity.revision||0}));
  runtime.step(960,960,revised,resolve);assert.equal(calls,2);
}
// Prepared actors enumerate every discrete contour jump themselves. Only
// their explicit opt-in removes the legacy 1ms lattice; one generic actor
// still retains it. A zero-speed near pair remains checked at both endpoints.
{
  const probes=[];
  for(const flags of [[false,false],[true,false],[true,true]]){
    const runtime=createContactRuntime(),p={},s={};let samples=0;
    const actors=()=>[p,s].map((entity,index)=>({entity,kind:index?'snake':'player',surfaceSpeed:0,
      jumpPad:2,exactBreakpoints:flags[index],breakpoints:()=>[],
      shape(t,out){samples++;return circle(index*3.2,0,1,'body',out);}}));
    runtime.step(0,16,actors,()=>{throw Error('No separated static contact');});probes.push(samples);
    assert.equal(runtime.diagnostics().sweeps,1);
  }
  assert.equal(probes[0],probes[1],'both actors must opt in');
  assert.ok(probes[2]<probes[0]/4,`authoritative boundaries remove lattice work: ${probes}`);
  const runtime=createContactRuntime(),p={},s={};let event;
  const actors=()=>[{...actor(p,'player',()=>0),exactBreakpoints:true},
    {entity:s,kind:'snake',surfaceSpeed:0,jumpPad:100,exactBreakpoints:true,
      breakpoints:()=>[.375],shape:(t,out)=>circle(t<.375?100:1,0,1,'tip',out)}];
  runtime.step(0,16,actors,(a,b,hit)=>{event=hit;return{kind:'tail',stop:true};});
  near(event.time,.375,1e-12);
}

// Dynamic bounds are evaluated once per actor per immutable pass, including
// an actor shared by many pairs. Invalid bounds must fail closed.
{
  const runtime=createContactRuntime(),entities=[{},{},{},{}],calls=new Map();
  const actors=()=>entities.map((entity,index)=>({...actor(entity,index?'snake':'player',()=>index*1000),
    surfaceSpeed(from,to){assert.equal(from,7);assert.equal(to,23);calls.set(entity,(calls.get(entity)||0)+1);return 0;}}));
  runtime.step(7,23,actors,()=>{throw Error('No distant event');});
  assert.deepEqual([...calls.values()],[1,1,1,1]);
  for(const invalid of [-1,Infinity,NaN])assert.throws(()=>createContactRuntime().step(0,1,
    ()=>[{...actor({},'player',()=>0),surfaceSpeed:()=>invalid},actor({},'snake',()=>4)],()=>{}),/surface speed/);
}
// The explicit subpixel gameplay skin resolves the near-tangent adversarial
// case in one probe, rather than exhausting a loose surface-speed bound.
{
  assert.equal(ACTOR_CONTACT_TOLERANCE,.025);assert.equal(CONTACT_REARM_DISTANCE,.05);
  const runtime=createContactRuntime(),p={},s={};let hit;
  runtime.step(0,16,()=>[actor(p,'player',()=>0,.4),actor(s,'snake',()=>2.0011,3)],
    (a,b,event)=>{hit=event;return{kind:'blocked',settled:true};});
  assert.equal(hit.time,0);assert.equal(hit.iterations,1);near(hit.distance,.0011,1e-10);
  assert.equal(hit.initialOverlap,false);assert.equal(hit.atTolerance,true);
  let position=2.001,events=0;
  const second=createContactRuntime(),actors=()=>[actor(p,'player',()=>0),actor(s,'snake',()=>position)];
  const resolve=()=>{events++;return{kind:'blocked',settled:true};};
  second.step(0,1,actors,resolve);position=2.04;second.step(1,2,actors,resolve);
  position=2.001;second.step(2,3,actors,resolve);assert.equal(events,1,'gap below rearm skin is still the same contact');
  position=2.051;second.step(3,4,actors,resolve);position=2.001;second.step(4,5,actors,resolve);assert.equal(events,2);
  createContactRuntime().step(0,16,()=>[actor({},'player',()=>0),actor({},'snake',()=>2.026)],
    ()=>{throw Error('A gap beyond the contact tolerance must not become a false hit');});
}

// Coarse all-frame bounds may omit jump padding only with an explicit proof.
// Actual-current-shape bounds MUST retain it for a later source-frame jump.
{
  for(const fullFrameBound of [false,true]){
    const runtime=createContactRuntime(),p={},s={};let samples=0;
    const actors=()=>[p,s].map((entity,index)=>({entity,kind:index?'snake':'player',surfaceSpeed:0,jumpPad:100,
      boundsCoversDiscontinuities:fullFrameBound,
      bounds(t,out){return Object.assign(out,{left:index*100-1,right:index*100+1,top:-1,bottom:1});},
      shape(t,out){samples++;return circle(index*100,0,1,'body',out);}}));
    runtime.step(0,16,actors,()=>{throw Error('Separated all-frame bounds cannot hit');});
    assert.equal(samples===0,fullFrameBound);assert.equal(runtime.diagnostics().coarseRejects,fullFrameBound?1:0);
  }
  const runtime=createContactRuntime(),p={},s={};let hit;
  const actors=()=>[{...actor(p,'player',()=>0),exactBreakpoints:true,boundsCoversDiscontinuities:true,
      bounds:(t,out)=>Object.assign(out,{left:-1,right:1,top:-1,bottom:1})},
    {entity:s,kind:'snake',surfaceSpeed:0,jumpPad:100,exactBreakpoints:true,boundsCoversDiscontinuities:true,
      bounds:(t,out)=>Object.assign(out,{left:0,right:101,top:-1,bottom:1}),breakpoints:()=>[.375],
      shape:(t,out)=>circle(t<.375?100:1,0,1,'claw',out)}];
  runtime.step(0,16,actors,(a,b,event)=>{hit=event;return{kind:'tail',stop:true};});
  near(hit.time,.375,1e-12);
}
// Failure reporting must identify the actual pair/operation and never rewind
// behind an already applied bite. Capture is bounded and resettable.
{
  const runtime=createContactRuntime(),p={},first={},broken={};let committed=false,score=0;
  const actors=()=>[actor(p,'player',t=>t,1),committed
    ?{entity:broken,kind:'scorpion',surfaceSpeed:0,shape(){throw Error('actual producer failure');}}
    :actor(first,'snake',()=>6)];
  assert.throws(()=>runtime.step(0,16,actors,(a,b,hit)=>{committed=true;score+=25;return{kind:'tail'};}),error=>{
    assert.equal(error.message,'actual producer failure');near(error.committedTime,4,1e-12);
    assert.equal(error.safeTime,error.committedTime);assert.equal(error.appliedEvents,1);return true;
  });
  assert.equal(score,25);assert.equal(runtime.diagnostics().lastFailure.pair.kindB,'scorpion');
  assert.equal(runtime.diagnostics().lastFailure.appliedEvents,1);
  assert.equal(runtime.failureReplay().shapeA.parts.length,1);
  assert.equal(runtime.failureReplay().shapeB.invalid,true);
  runtime.reset();assert.equal(runtime.failureReplay(),null);assert.equal(runtime.diagnostics().lastFailure,null);
}

// A settled yield cannot hide a new approach, but an explicit right-sided
// separating velocity must allow escape. A newly committed move begins at
// its own time, not retroactively at the previous frame's cursor.
for(const away of [false,true]){
  const runtime=createContactRuntime(),p={moveStartedAt:0},s={},events=[];let started=false;
  const velocity=away?-.1:.1;
  const actors=()=>[{...actor(p,'player',t=>started?Math.max(0,t-5)*velocity:0,.1),
    contactVelocity(t,out={}){return Object.assign(out,{x:started&&t>=5?velocity:0,y:0});}},actor(s,'snake',()=>2)];
  const resolve=(a,b,hit)=>{events.push(hit.time);return{kind:'blocked',settled:true};};
  runtime.step(0,0,actors,resolve);started=true;p.moveStartedAt=5;
  runtime.step(0,5,actors,resolve);runtime.step(5,10,actors,resolve);
  assert.deepEqual(events,away?[0]:[0,5]);
}

// Semantic material changes matter even without a body-length mutation;
// changing only a cached head sprite frame is still the same material.
{
  const runtime=createContactRuntime(),p={},s={},events=[];let index=0,frame=0;
  const actors=()=>[actor(p,'player',()=>0),{entity:s,kind:'snake',revision:3,surfaceSpeed:0,
    shape(t,out){circle(1,0,1,`frame-${frame}`,out);Object.assign(out.part,{index,role:index?'body':'head'});return out;}}];
  const resolve=(a,b,hit)=>{events.push(hit.partB.index);return{kind:'blocked',settled:true};};
  runtime.step(0,0,actors,resolve);frame=1;runtime.step(0,1,actors,resolve);
  assert.deepEqual(events,[0]);index=1;runtime.step(1,2,actors,resolve);assert.deepEqual(events,[0,1]);
}

// Bounded rearming is an explicit live-actor policy, never an implicit
// weakening of the generic strict same-frame re-entry contract above.
{
  const runtime=createContactRuntime(),p={},s={};let x=1;
  const actors=()=>[actor(p,'player',()=>0,3),actor(s,'snake',()=>x,3)].map(a=>({...a,sampledRearm:true}));
  runtime.step(0,0,actors,()=>({kind:'ignored'}));x=2.04999;
  const previousProbes=runtime.diagnostics().separationProbes;
  assert.equal(runtime.step(0,16,actors,()=>{throw Error('Still one resolved encounter');}),0);
  assert.ok(runtime.diagnostics().separationProbes-previousProbes<=17);
  const exact=createContactRuntime(),events=[];
  const jumping=()=>[{...actor(p,'player',()=>0),sampledRearm:true,exactBreakpoints:true},
    {...actor(s,'snake',t=>t>=.123&&t<.124?3:1),sampledRearm:true,exactBreakpoints:true,
      jumpPad:3,breakpoints:()=>[.123,.124]}];
  const resolve=(a,b,hit)=>{events.push(hit.time);return{kind:'ignored',stop:true};};
  exact.step(0,0,jumping,resolve);exact.step(0,1,jumping,resolve);
  assert.deepEqual(events,[0,.124],'even a sub-ms explicit source-pose departure rearms');
}

// A tiny unresolved gap below the old rearm threshold is a reproducible
// separation-budget failure, not an unspecified rendering error.
{
  const runtime=createContactRuntime(),p={},s={};let x=1;
  const actors=()=>[actor(p,'player',()=>0,3),actor(s,'snake',()=>x,3)];
  runtime.step(0,0,actors,()=>({kind:'ignored'}));x=2.04999;
  assert.throws(()=>runtime.step(0,16,actors,()=>({kind:'ignored'})),/separation budget/);
  const failure=runtime.diagnostics().lastFailure;
  assert.equal(failure.operation,'separation');assert.equal(failure.latched,true);
  assert.equal(failure.committedTime,0);assert.ok(failure.pairSafeTime<.02);
  assert.equal(runtime.failureReplay().shapeB.parts[0].x,x);
}
console.log(`PASS contact runtime: ${eventsChecked} ordered/material/re-entry events; stable latches, no same-frame tail cascade, `+
  'discrete source changes, reusable geometry, reset and bounded far-pair work.');
