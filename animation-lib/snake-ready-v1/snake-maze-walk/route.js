import {CELL,WORLD_WIDTH,WORLD_HEIGHT,ROUTE_VERTICES,GAME_BODY_DIAMETER,U_TURN_VERTEX_INDICES} from './game-maze.js?v=1.02.03.00';
export const TAU = Math.PI * 2;
export const TILE = CELL;
export const WIDTH = WORLD_WIDTH, HEIGHT = WORLD_HEIGHT;
export const VERTICES = ROUTE_VERTICES;
export const mod = (n,d) => ((n%d)+d)%d;
export const angleDelta = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
const unit = (a,b) => { const d=Math.hypot(b[0]-a[0],b[1]-a[1]); return [(b[0]-a[0])/d,(b[1]-a[1])/d]; };

// A closed C1 path: a single distance clock drives every point of the snake.
export function makeRoute(vertices=VERTICES, radius=TILE/2) {
  if(!Number.isFinite(radius)||radius<=0)throw new Error('Route radius must be positive.');
  const corners=vertices.map((v,i)=>{
    const prev=vertices[mod(i-1,vertices.length)], next=vertices[(i+1)%vertices.length];
    const incomingLength=Math.hypot(v[0]-prev[0],v[1]-prev[1]);
    const outgoingLength=Math.hypot(v[0]-next[0],v[1]-next[1]);
    if(!(incomingLength>1e-9)||!(outgoingLength>1e-9))throw new Error('Route vertices must be distinct.');
    const incoming=unit(prev,v), outgoing=unit(v,next);
    const sign=Math.sign(incoming[0]*outgoing[1]-incoming[1]*outgoing[0]);
    if(!sign || Math.abs(incoming[0]*outgoing[0]+incoming[1]*outgoing[1])>1e-6) throw new Error('Only right-angle corners supported.');
    // Each adjacent corner may occupy half of a short straight. A one-cell
    // U-turn therefore retains the normal radius and joins two tangent arcs.
    const r=Math.min(radius,incomingLength*.5,outgoingLength*.5);
    const entry=[v[0]-incoming[0]*r,v[1]-incoming[1]*r], exit=[v[0]+outgoing[0]*r,v[1]+outgoing[1]*r];
    const center=[entry[0]+outgoing[0]*r,entry[1]+outgoing[1]*r];
    return {entry,exit,center,sign,r,angle:Math.atan2(entry[1]-center[1],entry[0]-center[0])};
  });
  const pieces=[]; let total=0;
  for(let i=0;i<corners.length;i++) {
    const c=corners[i], next=corners[(i+1)%corners.length];
    const arc={type:'arc',...c,start:total,length:c.r*Math.PI/2}; total+=arc.length; pieces.push(arc);
    const length=Math.hypot(next.entry[0]-c.exit[0],next.entry[1]-c.exit[1]);
    // Touching arcs have no intervening line. Never normalize a zero vector
    // or leave a zero-duration piece for downstream pose/integral samplers.
    if(length>1e-9){
      const dir=unit(c.exit,next.entry);
      pieces.push({type:'line',a:c.exit,b:next.entry,dir,start:total,length}); total+=length;
    }
  }
  function point(distance) {
    const s=mod(distance,total);
    const p=pieces.find(p=>s<p.start+p.length) || pieces.at(-1);
    const t=s-p.start;
    if(p.type==='line') return {x:p.a[0]+p.dir[0]*t,y:p.a[1]+p.dir[1]*t,angle:Math.atan2(p.dir[1],p.dir[0]),curve:0};
    const a=p.angle+p.sign*t/p.r;
    return {x:p.center[0]+p.r*Math.cos(a),y:p.center[1]+p.r*Math.sin(a),angle:a+p.sign*Math.PI/2,curve:p.sign/p.r};
  }
  return {pieces,total,point};
}

export const route=makeRoute();
const routeArcs=route.pieces.filter(piece=>piece.type==='arc');
const uTurnFirst=routeArcs[U_TURN_VERTEX_INDICES[0]];
const uTurnSecond=routeArcs[U_TURN_VERTEX_INDICES[1]];
export const U_TURN=Object.freeze({
  start:uTurnFirst.start,
  midpoint:uTurnSecond.start,
  end:uTurnSecond.start+uTurnSecond.length,
  length:uTurnFirst.length+uTurnSecond.length,
  radius:uTurnFirst.r,
  center:Object.freeze([...uTurnFirst.center]),
  entry:Object.freeze([...uTurnFirst.entry]),
  join:Object.freeze([...uTurnFirst.exit]),
  exit:Object.freeze([...uTurnSecond.exit]),
  cornerIndices:U_TURN_VERTEX_INDICES
});

// Travel clock for a point following the U-turn. To place a rigid-head rear
// there, a caller adds that renderer's owned span to the returned distance.
// In reverse, phase zero approaches from the opposite end of the same bend.
export function uTurnPathDistance(reverse=false,fraction=0){
  if(!Number.isFinite(fraction))throw new Error('U-turn fraction must be finite.');
  const phase=Math.max(0,Math.min(1,fraction));
  return reverse
    ? mod(-(U_TURN.end-phase*U_TURN.length),route.total)
    : U_TURN.start+phase*U_TURN.length;
}
export function travelPoint(distance, reverse=false) {
  const p=route.point(reverse ? -distance : distance);
  return reverse ? {...p,angle:p.angle+Math.PI,curve:-p.curve} : p;
}
export const DIAMETER=GAME_BODY_DIAMETER;
export const HEAD_SPAN=72*DIAMETER/16;
export const TAIL_SPAN=35*DIAMETER/16;
// Match the original directional atlas: left-facing heads keep their eyes
// above the mouth; an upward head keeps the eye on screen-right. This is a
// view-dependent profile, not a freely rotating top-down drawing.
export function faceParity(angle) {
  const x=Math.cos(angle),y=Math.sin(angle);
  return x < -1e-7 || (Math.abs(x)<=1e-7 && y<0) ? -1 : 1;
}
export function headPose(distance,reverse=false,snap=false) {
  const seam=travelPoint(distance-HEAD_SPAN,reverse), lead=travelPoint(distance,reverse);
  const delta=angleDelta(seam.angle,lead.angle);
  const bend=Math.min(1,Math.abs(delta)/(Math.PI/2));
  return {seam,lead,delta,bend,index:snap ? 0 : Math.round(bend*7),sign:delta<0?-1:1,
    angle:snap ? Math.round(lead.angle/(Math.PI/2))*Math.PI/2 : seam.angle};
}
