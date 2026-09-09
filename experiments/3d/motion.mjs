// Grid-space curves. The bend is entirely inside the traversed corner cell.
// The renderer never predicts an uncommitted exit or feeds positions into collisions.
export const BEND=0.28;
export const FOLLOW=0.30;
const CONTRACTION_TRAVEL=0.22;
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const adjacent=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&Math.max(Math.abs(x),Math.abs(y))===1;

export function routeSample(points,u){
  if(points.length===1) return {...points[0]};
  u=clamp(u,0,points.length-1);
  const corner=Math.round(u);
  if(corner>0&&corner<points.length-1&&Math.abs(u-corner)<BEND){
    const a=points[corner-1],b=points[corner],c=points[corner+1];
    const ax=b.x-a.x,ay=b.y-a.y,bx=c.x-b.x,by=c.y-b.y;
    // Each committed link may now be cardinal or diagonal. Keep the same
    // parameter on both sides of a joint: the quadratic's endpoint tangents
    // then match their adjoining links even when those links differ in length.
    // A collinear reversal has no usable tangent at its centre; it is handled
    // by the existing retreat animation, rather than rounding back on itself.
    if(adjacent(ax,ay)&&adjacent(bx,by)&&ax*by-ay*bx!==0){
      const start=mix(b,a,BEND),end=mix(b,c,BEND);
      const t=(u-corner+BEND)/(2*BEND);
      return mix(mix(start,b,t),mix(b,end,t),t);
    }
  }
  const i=Math.min(points.length-2,Math.floor(u));
  return mix(points[i],points[i+1],u-i);
}

export function snakeRoute(s,time){
  const m=s.motion,n=s.body.length;
  if(m&&m.from.length===n&&m.to.length===n){
    const p=clamp((time-m.started)/m.duration,0,1);
    // Gather toward the centre, then extend along the same committed route.
    // Zero displacement AND zero added velocity at each tick boundary keep
    // turns and changes of travel direction seamless. Short bodies need less
    // compression so their ends never cross; solitary heads glide as before.
    const restSpan=Math.max(0,n-1-2*FOLLOW);
    const amplitude=Math.min(CONTRACTION_TRAVEL,restSpan*.15);
    const contraction=amplitude*Math.sin(Math.PI*p)**2;
    const forward=n===1||m.to.slice(1).every((v,i)=>same(v,m.from[i]));
    const reverse=n>1&&m.to.slice(0,-1).every((v,i)=>same(v,m.from[i+1]));
    if(forward&&!same(m.from[0],m.to[0])){
      return {points:[m.to[0],...m.from],start:1-p,count:n,contraction};
    }
    if(reverse){
      return {points:[...m.from,m.to[n-1]],start:p,count:n,contraction};
    }
  }
  return {points:s.body,start:0,count:n,contraction:0};
}

export function sampleSnake(route,index){
  // Both ends sit slightly inside the occupied chain. This gives the leading
  // end enough committed route to round a turn, and keeps the trailing end
  // moving for the whole tick in either direction. There is no predicted cell.
  // The same inward offset has opposite timing relative to travel: the tail
  // gathers first going forward; the head gathers first going backward.
  const inset=route.count>1?(FOLLOW+(route.contraction||0))*(1-2*index/(route.count-1)):0;
  const u=route.start+index+inset;
  const position=routeSample(route.points,u);
  const front=routeSample(route.points,u-0.025),back=routeSample(route.points,u+0.025);
  return {...position,dx:front.x-back.x,dy:front.y-back.y};
}

export function footprintIsOpen(maze,point,radius=0.39){
  // Exact circle versus every nearby unit wall square; also includes map edges.
  for(let y=Math.floor(point.y-radius-.5);y<=Math.ceil(point.y+radius+.5);y++){
    for(let x=Math.floor(point.x-radius-.5);x<=Math.ceil(point.x+radius+.5);x++){
      if(maze[y]?.[x]==='.') continue;
      const dx=Math.max(Math.abs(point.x-x)-.5,0);
      const dy=Math.max(Math.abs(point.y-y)-.5,0);
      if(dx*dx+dy*dy<radius*radius-1e-9) return false;
    }
  }
  return true;
}
