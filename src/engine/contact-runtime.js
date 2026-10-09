import {shapeDistance, sweepContact} from './continuous-contact.js?v=1.02.03.00';
import {beginContactShape, appendContactPolygon, transformContactShape} from '../render/contact-shapes.js?v=1.02.03.00';

const copyContactPoint = (from, to) => { to.x = from.x; to.y = from.y; };
// Explicit gameplay skin, below the prepared contour simplification budget.
// This conservatively resolves tiny visible gaps, never advances through them.
// The generic sweep kernel retains its separate strict 0.001px default.
export const ACTOR_CONTACT_TOLERANCE = .025;
export const CONTACT_REARM_DISTANCE = .05;

// The render adapters supply world-space geometry. No occupied cell is used
// here as a contact test, and swallowed artwork is deliberately not solid.
export function snakeContactShape(renderer, entity, time, out = {}) {
  const geometry = renderer.getWorldGeometry(entity, time);
  beginContactShape(out);
  if (!geometry) return out;
  const head = geometry.head, sprite = head.sprite;
  if (head.alpha > .001 && head.contour && sprite) {
    const c = Math.cos(head.angle), s = Math.sin(head.angle);
    transformContactShape(head.contour, {
      a: c * sprite.dw / sprite.sw, b: s * sprite.dw / sprite.sw,
      c: -s * sprite.dh / sprite.sh, d: c * sprite.dh / sprite.sh,
      e: head.x + c * sprite.dx - s * sprite.dy,
      f: head.y + s * sprite.dx + c * sprite.dy
    }, out);
    for (const part of out.parts) { part.role = 'head'; part.index = 0; }
  }
  const start = geometry.collisionTailDistance || 0, end = geometry.bodyEndDistance;
  const radius = geometry.diameter / 2;
  const scratch = out._snakeScratch ??= {a:{},b:{},points:Array.from({length:4},()=>({x:0,y:0})),metadata:{role:''}};
  let a = scratch.a, b = scratch.b;
  if (start < end - 1e-6) geometry.sample(start, a);
  // Shared curve, not independent following points. Short quadrilateral
  // strips keep the original tapered tip sharp, without a round cap beyond it.
  // The optional span proof only joins exactly collinear old strips of the
  // same semantic cell/taper region. Curved endpoints keep their 1.25px grid.
  for (let d = start; d < end - 1e-6;) {
    const span = geometry.stripSpan?.(d, end - d) ?? 1.25;
    const next = Math.min(end, d + (Number.isFinite(span) && span > 0 ? span : 1.25));
    geometry.sample(next, b);
    const ra = radius * Math.min(1, d / Math.max(.001, geometry.tailSpan));
    const rb = radius * Math.min(1, next / Math.max(.001, geometry.tailSpan));
    const points = scratch.points;
    points[0].x=a.x-a.ty*ra;points[0].y=a.y+a.tx*ra;
    points[1].x=b.x-b.ty*rb;points[1].y=b.y+b.tx*rb;
    points[2].x=b.x+b.ty*rb;points[2].y=b.y-b.tx*rb;
    points[3].x=a.x+a.ty*ra;points[3].y=a.y-a.tx*ra;
    const index = geometry.indexAt((d + next) / 2);
    scratch.metadata.role=index===entity.body.length-1?'tail':'body';
    const part = appendContactPolygon(out, `segment-${index}`, points, copyContactPoint, scratch.metadata);
    part.index = index; d = next;
    const previous = a; a = b; b = previous;
  }
  return out;
}

function bounds(shape) {
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const p of shape.parts){
    if(p.kind==='polygon')for(const v of p.points){left=Math.min(left,v.x);top=Math.min(top,v.y);right=Math.max(right,v.x);bottom=Math.max(bottom,v.y);}
    else{const r=p.r||0,x=p.x??p.ax,y=p.y??p.ay,bx=p.bx??x,by=p.by??y;
      left=Math.min(left,x-r,bx-r);top=Math.min(top,y-r,by-r);right=Math.max(right,x+r,bx+r);bottom=Math.max(bottom,y+r,by+r);}
  }
  return {left,top,right,bottom};
}
function gap(a,b){return Math.hypot(Math.max(0,a.left-b.right,b.left-a.right),Math.max(0,a.top-b.bottom,b.top-a.bottom));}

export function createContactRuntime() {
  let sequence=0, identities=new WeakMap(), active=new Map(),failureReplay=null;
  const stats={passes:0,sweeps:0,events:0,broadRejects:0,coarseRejects:0,maxIterations:0,separationProbes:0,settledSkips:0,lastEvent:null,failures:0,lastFailure:null};
  function id(actor){let value=identities.get(actor);if(!value){value=++sequence;identities.set(actor,value);}return value;}
  function pairKey(a,b){const x=id(a.entity),y=id(b.entity);return x<y?`${x}:${y}`:`${y}:${x}`;}
  function revision(a){return String(a.revision??0);}
  function motionRevision(actor){
    if(actor.motionRevision!==undefined)return String(typeof actor.motionRevision==='function'?actor.motionRevision():actor.motionRevision);
    const e=actor.entity;
    return `${e.moveStartedAt??e.lastMove??0}:${e.dir?.x??0}:${e.dir?.y??0}:${e.physicalContactHold?.at??''}`;
  }
  function motionPair(a,b){return `${motionRevision(a)}|${motionRevision(b)}`;}
  function material(part,actor){return actor.kind==='snake'?`${part?.role??part?.id??''}:${part?.index??''}`:'';}
  function separates(a,b,latched,time,speedA,speedB){
    const velocity=(actor,speed)=>{
      // At a zero-duration movement commit the interval speed can be zero
      // while the right-sided new motion is already directed away.
      if(typeof actor.contactVelocity!=='function')return speed===0?{x:0,y:0}:null;
      const out={},value=actor.contactVelocity(time,out)||out;
      return Number.isFinite(value.x)&&Number.isFinite(value.y)?value:null;
    };
    const va=velocity(a,speedA),vb=velocity(b,speedB),normal=latched.normal;
    if(!va||!vb||!normal||Math.hypot(normal.x,normal.y)<1e-10)return false;
    return (vb.x-va.x)*normal.x+(vb.y-va.y)*normal.y>1e-10;
  }
  function separationTime(sampleA,sampleB,start,end,speed,breakpoints,sampled=false){
    // Strict mode rearms by measured separation, never an actor cooldown.
    // Its Lipschitz bound cannot skip a brief separation/re-entry. The
    // explicitly opted-in sampled policy is described at its step below.
    const margin=CONTACT_REARM_DISTANCE,epsilon=1e-6,sa={},sb={},distance={};
    const stops=[...new Set([...breakpoints.filter(t=>t>start&&t<=end),end])].sort((a,b)=>a-b);
    let time=start,stopIndex=0;
    for(let iteration=0;iteration<8192;iteration++){
      stats.separationProbes++;
      const d=shapeDistance(sampleA(time,sa),sampleB(time,sb),distance).distance;
      if(d>=margin-epsilon)return time;
      if(time>=end)return null;
      while(stops[stopIndex]<=time)stopIndex++;
      // Live game actors may explicitly treat an unobserved sub-millisecond
      // departure as the same already-resolved encounter. Their exact cached
      // pose switches are still sampled. Generic callers retain strict
      // Lipschitz re-entry search and its failure-on-budget contract.
      const interval=speed>0?Math.max(sampled?1:0,(margin-d)/speed):Infinity;
      const next=Math.min(stops[stopIndex]??end,time+interval);
      if(!(next>time))throw Object.assign(Error('Contact separation lost time precision'),{safeTime:time});
      time=next;
    }
    throw Object.assign(Error('Contact separation budget exceeded; world must not advance'),{safeTime:time});
  }
  function step(start,end,getActors,resolve){
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw Error('Invalid physical contact interval');
    stats.passes++;
    let cursor=start,events=0;
    const trace={operation:'actors',pair:null,shapeA:null,shapeB:null,timeA:null,timeB:null};
    try{
    while(events<64){
      trace.operation='actors';trace.pair=null;trace.speedA=trace.speedB=null;
      const actors=getActors(),live=new Set(actors.map(a=>a.entity));
      // A player's current silhouette is shared by every nearby pair in this
      // immutable pass. Drop snapshots after a resolved mutation/rebuild.
      const initialShapes=new Map(),coarseBounds=new Map(),surfaceSpeeds=new Map();
      function speed(actor){
        if(surfaceSpeeds.has(actor.entity))return surfaceSpeeds.get(actor.entity);
        const declared=typeof actor.surfaceSpeed==='function'?actor.surfaceSpeed(cursor,end):actor.surfaceSpeed;
        const value=declared??(actor.kind==='player'?2:3);
        if(!Number.isFinite(value)||value<0)throw Error('Actor surface speed must be a finite nonnegative bound');
        surfaceSpeeds.set(actor.entity,value);return value;
      }
      function initial(actor){
        let cached=initialShapes.get(actor.entity);
        if(!cached){const shape=actor.shape(cursor,{});cached={shape,bounds:shape?.parts?.length?bounds(shape):null};initialShapes.set(actor.entity,cached);}
        if(actor.entity===trace.entityA){trace.shapeA=cached.shape;trace.timeA=cursor;}
        if(actor.entity===trace.entityB){trace.shapeB=cached.shape;trace.timeB=cursor;}
        return cached;
      }
      function coarse(actor){
        if(coarseBounds.has(actor.entity))return coarseBounds.get(actor.entity);
        let value;
        if(typeof actor.bounds==='function'){
          const out={};value=actor.bounds(cursor,out)||out;
          if(![value.left,value.top,value.right,value.bottom].every(Number.isFinite)||value.left>value.right||value.top>value.bottom)
            throw Error('Actor contact bounds must be a finite conservative world rectangle');
        }else value=initial(actor).bounds;
        coarseBounds.set(actor.entity,value);return value;
      }
      for(const [key,pair] of active)if(!live.has(pair.a)||!live.has(pair.b))active.delete(key);
      let first=null;
      for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
        let a=actors[i],b=actors[j];
        if(a.kind!=='player'&&b.kind!=='player')continue;
        if(a.kind!=='player')[a,b]=[b,a];
        const key=pairKey(a,b),stamp=`${revision(a)}|${revision(b)}`;
        trace.entityA=a.entity;trace.entityB=b.entity;
        trace.pair={key,kindA:a.kind,kindB:b.kind,revisionA:revision(a),revisionB:revision(b)};
        trace.shapeA=trace.shapeB=null;trace.timeA=trace.timeB=null;trace.latched=trace.settled=false;trace.operation='speed-bound';
        const speedA=speed(a),speedB=speed(b),bound=speedA+speedB;
        trace.speedA=speedA;trace.speedB=speedB;trace.operation='coarse-bounds';
        const jumpPad=Math.max(0,a.jumpPad||0)+Math.max(0,b.jumpPad||0);
        // A supplied bound may explicitly cover every discrete source frame.
        // Only that coarse bound can omit the corresponding expansion pad;
        // the current detailed silhouette below still needs the full pad.
        const coarsePad=(typeof a.bounds==='function'&&a.boundsCoversDiscontinuities===true?0:Math.max(0,a.jumpPad||0))+
          (typeof b.bounds==='function'&&b.boundsCoversDiscontinuities===true?0:Math.max(0,b.jumpPad||0));
        const broadA=coarse(a),broadB=coarse(b);
        if(broadA&&broadB&&gap(broadA,broadB)>bound*(end-cursor)+coarsePad+CONTACT_REARM_DISTANCE){
          active.delete(key);stats.broadRejects++;
          if(typeof a.bounds==='function'||typeof b.bounds==='function')stats.coarseRejects++;
          continue;
        }
        const sampleA=(t,out)=>{trace.timeA=t;return trace.shapeA=a.shape(t,out);};
        const sampleB=(t,out)=>{trace.timeB=t;return trace.shapeB=b.shape(t,out);};
        trace.operation='initial-shapes';
        const initialA=initial(a),sa=initialA.shape;trace.shapeA=sa;trace.timeA=cursor;
        const initialB=initial(b),sb=initialB.shape;trace.shapeB=sb;trace.timeB=cursor;
        if(sa?.parts?.length&&sb?.parts?.length&&
           gap(initialA.bounds,initialB.bounds)>bound*(end-cursor)+jumpPad+CONTACT_REARM_DISTANCE){
          active.delete(key);stats.broadRejects++;continue;
        }
        trace.operation='breakpoints';
        const breaks=[...(a.breakpoints?.(cursor,end)||[]),...(b.breakpoints?.(cursor,end)||[])];
        // Exact source-frame boundaries supplied by actors are authoritative.
        // The lattice is an extra fallback probe, not a proof that an
        // unannounced discrete pose change can be swept as continuous motion.
        if(a.exactBreakpoints!==true||b.exactBreakpoints!==true)
          for(let t=Math.floor(cursor)+1;t<end;t++)breaks.push(t);
        let searchStart=cursor;
        const latched=active.get(key);
        trace.latched=!!latched;trace.settled=latched?.settled??false;
        if(latched&&latched.stamp===stamp){
          const touching=shapeDistance(sa,sb),changedA=latched.motionA!==motionRevision(a),changedB=latched.motionB!==motionRevision(b);
          const changedMotion=changedA||changedB;
          const motionTime=actor=>{
            const time=actor.contactMotionStart??actor.entity.moveStartedAt??actor.entity.lastMove;
            return Number.isFinite(time)?Math.max(cursor,time):cursor;
          };
          const changeTime=Math.min(changedA?motionTime(a):Infinity,changedB?motionTime(b):Infinity);
          const changedMaterial=touching.distance<=ACTOR_CONTACT_TOLERANCE&&
            (latched.materialA!==material(touching.partA,a)||latched.materialB!==material(touching.partB,b));
          if(touching.distance>=CONTACT_REARM_DISTANCE)active.delete(key);
          else if(changedMaterial||(changedMotion&&changeTime<=end&&!separates(a,b,latched,changeTime,speedA,speedB))){
            // A previous yield/rebound does not authorize a new move through
            // the same actor, nor contact with a different snake segment.
            active.delete(key);
            if(!changedMaterial)searchStart=changeTime;
          }
          else if(changedMotion&&changeTime>end)continue;
          else if(latched.settled&&!changedMotion){
            // The resolver explicitly installed a hold/rebound that already
            // resolves this continuing contact. It promises to revise motion
            // when that response changes; this is not a time cooldown.
            stats.settledSkips++;continue;
          }
          else{
            trace.operation='separation';
            searchStart=separationTime(sampleA,sampleB,changedMotion?changeTime:cursor,end,bound,breaks,
              a.sampledRearm===true&&b.sampledRearm===true);
            if(searchStart===null)continue;
          }
        }
        stats.sweeps++;
        trace.operation='entry-sweep';
        const hit=sweepContact({sampleA,sampleB,start:searchStart,end,speedA,
          speedB,tolerance:ACTOR_CONTACT_TOLERANCE,breakpoints:breaks,maxIterations:8192});
        if(hit){stats.maxIterations=Math.max(stats.maxIterations,hit.iterations);
          if(!first||hit.time<first.hit.time)first={a,b,key,stamp,hit};}
      }
      if(!first)return events;
      const {a,b,key,stamp,hit}=first;
      trace.operation='resolve';trace.pair={key,kindA:a.kind,kindB:b.kind,revisionA:revision(a),revisionB:revision(b)};
      cursor=hit.time;
      const result=resolve(a,b,hit)||{kind:'ignored'};
      events++;stats.events++;
      stats.lastEvent={time:hit.time,kind:result.kind,part:hit.partB?.role||hit.partB?.id};
      trace.operation='post-resolve';
      const refreshed=result.settled?getActors():null;
      const afterA=refreshed?.find(actor=>actor.entity===a.entity)||a;
      const afterB=refreshed?.find(actor=>actor.entity===b.entity)||b;
      active.set(key,{a:a.entity,b:b.entity,stamp,settled:result.settled===true,motion:motionPair(afterA,afterB),
        motionA:motionRevision(afterA),motionB:motionRevision(afterB),
        normal:{x:hit.normal.x,y:hit.normal.y},materialA:material(hit.partA,a),materialB:material(hit.partB,b)});
      cursor=hit.time;
      if(result.stop)return events;
      // Rebuild all pairs after mutation: a split creates new actors and a
      // tail bite exposes different material, including within this frame.
    }
    trace.operation='event-budget';throw Error('Physical contact event budget exceeded; world must not advance');
    }catch(error){
      if(!error||typeof error!=='object'||!Object.isExtensible(error))error=new Error(String(error?.message||error));
      // A prior callback may already have changed score, bodies or lives.
      // Only the last committed event time is a global safe restart point;
      // one pair's later conservative safeTime is not safe for every pair.
      const pairSafeTime=Number.isFinite(error.safeTime)?error.safeTime:null;
      error.pairSafeTime=pairSafeTime;error.safeTime=cursor;
      error.committedTime=cursor;error.appliedEvents=events;
      const failure={message:String(error.message||error),operation:trace.operation,start,end,committedTime:cursor,
        appliedEvents:events,pairSafeTime,pair:trace.pair,timeA:trace.timeA,timeB:trace.timeB,
        speedA:trace.speedA??null,speedB:trace.speedB??null,latched:trace.latched??false,settled:trace.settled??false,
        resolutionStarted:trace.operation==='resolve'};
      stats.failures++;stats.lastFailure=failure;
      const snapshot=shape=>{
        if(!Array.isArray(shape?.parts))return {invalid:true,valueType:typeof shape};
        let vertices=2048;
        return {parts:shape.parts.slice(0,256).map(part=>{
          if(!part||typeof part!=='object')return {invalid:true,valueType:typeof part};
          const result={id:part.id,kind:part.kind,index:part.index,role:part.role};
          if(part.kind==='polygon'){
            result.points=(Array.isArray(part.points)?part.points:[]).slice(0,vertices)
              .map(point=>({x:point?.x,y:point?.y}));vertices-=result.points.length;
          }else for(const field of ['x','y','ax','ay','bx','by','r'])if(field in part)result[field]=part[field];
          return result;
        }),truncated:shape.parts.length>256||vertices===0};
      };
      failureReplay={...failure,shapeA:snapshot(trace.shapeA),shapeB:snapshot(trace.shapeB)};
      throw error;
    }
  }
  return {step,reset(){active.clear();identities=new WeakMap();sequence=0;failureReplay=null;stats.lastFailure=null;},
    failureReplay(){return failureReplay;},
    diagnostics(){return {...stats,activePairs:active.size,contactTolerance:ACTOR_CONTACT_TOLERANCE,rearmDistance:CONTACT_REARM_DISTANCE};}};
}
