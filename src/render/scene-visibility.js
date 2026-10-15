// Render-only conservative bounds. Never infer visibility from a head cell:
// a visible tail, retained bite remnant or curved body can be far behind it.
const finite=Number.isFinite;
const validBounds=b=>b&&[b.minX,b.minY,b.maxX,b.maxY].every(finite)
  &&b.minX<=b.maxX&&b.minY<=b.maxY;

export function cameraViewport(camera,width,height){
  const x=camera?.x??camera?.cx,y=camera?.y??camera?.cy,zoom=camera?.zoom??1;
  if(![x,y,zoom,width,height].every(finite)||zoom<=0||width<=0||height<=0)return null;
  const hw=width/(2*zoom),hh=height/(2*zoom);
  return {left:x-hw,top:y-hh,right:x+hw,bottom:y+hh};
}

export function intersectsViewport(bounds,viewport,padding=0){
  // Missing art, a recovering renderer or unknown camera must fail open.
  if(!validBounds(bounds)||!viewport||![viewport.left,viewport.top,viewport.right,viewport.bottom,padding].every(finite)
    ||viewport.left>viewport.right||viewport.top>viewport.bottom)return true;
  const p=Math.max(0,padding);
  return bounds.maxX>=viewport.left-p&&bounds.minX<=viewport.right+p
    &&bounds.maxY>=viewport.top-p&&bounds.minY<=viewport.bottom+p;
}

export function getSnakeBounds(geometry,tile){
  if(!geometry||!finite(tile)||tile<=0||typeof geometry.sample!=='function'
    ||!finite(geometry.length)||geometry.length<0
    ||!finite(geometry.diameter)||geometry.diameter<0)return null;
  const head=geometry.head,art=head?.sprite;
  // The whole destination sprite rectangle includes pixels intentionally
  // omitted by collision contours; never crop visual art to its collider.
  if(!head||!art||![head.x,head.y,head.angle,art.dx,art.dy,art.dw,art.dh].every(finite)
    ||art.dw<=0||art.dh<=0)return null;
  const segments=Math.max(1,Math.ceil(geometry.length/(tile*.5)));
  if(segments>2048)return null;
  const step=geometry.length/segments,radius=geometry.diameter*.5+step+tile/32;
  const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity},point={};
  // sample() uses native world arc length. A full sample interval, rather
  // than its half-distance bound, also guards numerical integration and the
  // small body/neck overlap. Tail taper and all body normals fit this radius.
  try{
    for(let i=0;i<=segments;i++){
      const p=geometry.sample(geometry.length*i/segments,point);
      if(!p||!finite(p.x)||!finite(p.y))return null;
      bounds.minX=Math.min(bounds.minX,p.x-radius);bounds.maxX=Math.max(bounds.maxX,p.x+radius);
      bounds.minY=Math.min(bounds.minY,p.y-radius);bounds.maxY=Math.max(bounds.maxY,p.y+radius);
    }
  }catch{return null;}
  const c=Math.cos(head.angle),s=Math.sin(head.angle),guard=tile/32;
  for(const x of [art.dx,art.dx+art.dw])for(const y of [art.dy,art.dy+art.dh]){
    const wx=head.x+c*x-s*y,wy=head.y+s*x+c*y;
    bounds.minX=Math.min(bounds.minX,wx-guard);bounds.maxX=Math.max(bounds.maxX,wx+guard);
    bounds.minY=Math.min(bounds.minY,wy-guard);bounds.maxY=Math.max(bounds.maxY,wy+guard);
  }
  return validBounds(bounds)?bounds:null;
}

export function getCharacterBounds(position,tile,tiltDegrees=0,overlayScale=1){
  if(!position||![position.x,position.y,tile,tiltDegrees,overlayScale].every(finite)
    ||tile<=0||overlayScale<1)return null;
  const angle=tiltDegrees*Math.PI/180;
  // A square contains both the sprite and any leader-spark overlay. Its
  // cardinal direction rotation preserves the square; controller tilt does not.
  const half=tile*overlayScale*.5*(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle)))+1;
  const x=(position.x+.5)*tile,y=(position.y+.5)*tile;
  return {minX:x-half,minY:y-half,maxX:x+half,maxY:y+half};
}

export function getScorpionBounds(pose,tile){
  if(!pose||![pose.x,pose.y,tile].every(finite)||tile<=0)return null;
  // Native 320x160 art spans two cells. Every rigid extremity/leg is attached
  // within one cell's arc length of the seam, with <=half-cell lateral extent.
  // Two cells around the live seam conservatively include deep 180-degree
  // bends, both leg frames, and the source-alpha fringe without collider reads.
  const radius=tile*2+1;
  return {minX:pose.x-radius,minY:pose.y-radius,maxX:pose.x+radius,maxY:pose.y+radius};
}
