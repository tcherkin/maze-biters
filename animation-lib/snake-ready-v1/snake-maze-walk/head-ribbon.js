import {HEAD_SPAN,DIAMETER,travelPoint} from './route.js';

// A single straight head/neck drawing is parameterized by traveled distance,
// exactly like the tail. Nothing selects an angle-indexed frame or flips it.
export function createHeadProfile(entry) {
  const {cell,bounds,anchor}=entry;
  const guard=3,scale=DIAMETER/anchor.diameter;
  const x=anchor.x,y=Math.max(cell.y,bounds.y-guard);
  const right=Math.min(cell.x+cell.width,bounds.x+bounds.width+guard);
  const bottom=Math.min(cell.y+cell.height,bounds.y+bounds.height+guard);
  if(!(right>x&&bottom>y&&Number.isFinite(scale)&&scale>0))throw new Error('Invalid straight head profile');
  return Object.freeze({sourceX:x,sourceY:y,sourceWidth:right-x,sourceHeight:bottom-y,
    offsetY:(y-anchor.y)*scale,height:(bottom-y)*scale,span:HEAD_SPAN});
}

export function drawHeadRibbon(ctx,image,profile,distance,reverse=false) {
  const {sourceX,sourceY,sourceWidth,sourceHeight,offsetY,height,span}=profile;
  const count=Math.ceil(span/.8),overlap=.10,start=distance-span;
  const edge=s=>{
    const p=travelPoint(start+s,reverse),nx=-Math.sin(p.angle),ny=Math.cos(p.angle);
    return [{x:p.x+nx*offsetY,y:p.y+ny*offsetY},
      {x:p.x+nx*(offsetY+height),y:p.y+ny*(offsetY+height)}];
  };
  for(let i=0;i<count;i++){
    const a=Math.max(0,i*span/count-overlap),b=Math.min(span,(i+1)*span/count+overlap);
    const [A,D]=edge(a),[B,C]=edge(b);
    const sx=sourceX+a/span*sourceWidth,sw=(b-a)/span*sourceWidth;
    // True joined quads, rather than parallel rotated slivers: the outside
    // of a bend grows and the inside contracts without comb-like gaps.
    triangle(ctx,image,[A,B,C],[B.x-A.x,B.y-A.y,C.x-B.x,C.y-B.y,A.x,A.y],sx,sourceY,sw,sourceHeight);
    triangle(ctx,image,[A,C,D],[C.x-D.x,C.y-D.y,D.x-A.x,D.y-A.y,A.x,A.y],sx,sourceY,sw,sourceHeight);
  }
}

function triangle(ctx,image,vertices,affine,sx,sy,sw,sh){
  // Expand the clipping edges a fraction of a world pixel to avoid Canvas
  // antialias seams. Source/destination rectangles still bound the texture.
  const margin=.08;
  const points=vertices.map((v,i)=>{
    const prev=vertices[(i+2)%3],next=vertices[(i+1)%3];
    const dx=v.x-prev.x,dy=v.y-prev.y,ex=next.x-v.x,ey=next.y-v.y;
    const l=Math.hypot(dx,dy),m=Math.hypot(ex,ey);
    const nx=dy/l,ny=-dx/l,px=ey/m,py=-ex/m;
    const k=margin/Math.max(1e-8,1+nx*px+ny*py);
    return {x:v.x+(nx+px)*k,y:v.y+(ny+py)*k};
  });
  ctx.save();ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  ctx.lineTo(points[1].x,points[1].y);ctx.lineTo(points[2].x,points[2].y);ctx.closePath();ctx.clip();
  ctx.transform(...affine);
  ctx.drawImage(image,sx,sy,sw,sh,0,0,1,1);
  ctx.restore();
}
