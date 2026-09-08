const HALF_PI=Math.PI/2,EPSILON=1e-10,CORNER_EPSILON=1e-5,WALL_GAP=.015;
const BASE_RAYS=97;

// First forward intersection with a 2D wall rectangle. Parallel rays and a
// source on/inside a wall are handled explicitly, without infinities in UVs.
export function rayBoxDistance(x,z,dx,dz,box,limit=Infinity){
  let near=0,far=limit;
  if(Math.abs(dx)<EPSILON){
    if(x<box.minX||x>box.maxX)return Infinity;
  }else{
    let a=(box.minX-x)/dx,b=(box.maxX-x)/dx;
    if(a>b){const swap=a;a=b;b=swap;}
    near=Math.max(near,a);far=Math.min(far,b);
    if(near>far)return Infinity;
  }
  if(Math.abs(dz)<EPSILON){
    if(z<box.minZ||z>box.maxZ)return Infinity;
  }else{
    let a=(box.minZ-z)/dz,b=(box.maxZ-z)/dz;
    if(a>b){const swap=a;a=b;b=swap;}
    near=Math.max(near,a);far=Math.min(far,b);
    if(near>far)return Infinity;
  }
  return near;
}

// Return beam-local boundary points in angular order. Across is world-right;
// along follows the player's facing direction. The source closes the polygon.
export function groundBeamVisibility(x,z,yaw,{length,width,offset},bounds=[]){
  const sin=Math.sin(yaw),cos=Math.cos(yaw),halfWidth=width/2,reach=length/2+offset;
  const nearby=[];
  for(const box of bounds){
    const cx=(box.minX+box.maxX)/2-x,cz=(box.minZ+box.maxZ)/2-z;
    const hx=(box.maxX-box.minX)/2,hz=(box.maxZ-box.minZ)/2;
    const across=cx*cos-cz*sin,along=cx*sin+cz*cos;
    const acrossRadius=hx*Math.abs(cos)+hz*Math.abs(sin),alongRadius=hx*Math.abs(sin)+hz*Math.abs(cos);
    if(across+acrossRadius<-halfWidth||across-acrossRadius>halfWidth||along+alongRadius<0||along-alongRadius>reach)continue;
    nearby.push(box);
  }
  const angles=Array.from({length:BASE_RAYS},(_,i)=>-HALF_PI+Math.PI*i/(BASE_RAYS-1));
  const beamCorner=Math.atan2(halfWidth,reach);angles.push(-beamCorner,beamCorner);
  // Corner rays prevent thin strips of light leaking between regular samples
  // at the far side of a wall. Adjacent rays see both sides of each silhouette.
  for(const box of nearby)for(const bx of [box.minX,box.maxX])for(const bz of [box.minZ,box.maxZ]){
    const px=bx-x,pz=bz-z,angle=Math.atan2(px*cos-pz*sin,px*sin+pz*cos);
    for(const delta of [-CORNER_EPSILON,0,CORNER_EPSILON]){
      const candidate=angle+delta;
      if(candidate>-HALF_PI&&candidate<HALF_PI)angles.push(candidate);
    }
  }
  angles.sort((a,b)=>a-b);
  const points=[];let previous=-Infinity;
  for(const angle of angles){
    if(angle-previous<EPSILON)continue;
    previous=angle;
    const across=Math.sin(angle),along=Math.cos(angle);
    let distance=Math.min(Math.abs(across)>EPSILON?halfWidth/Math.abs(across):Infinity,along>EPSILON?reach/along:Infinity);
    const dx=sin*along+cos*across,dz=cos*along-sin*across;
    for(const box of nearby){
      const hit=rayBoxDistance(x,z,dx,dz,box,distance);
      if(hit!==Infinity)distance=Math.max(0,hit-WALL_GAP);
    }
    points.push({across:across*distance,along:along*distance});
  }
  return points;
}

export class GroundBeamMask{
  constructor(mesh,{length,width,offset}){
    const texture=mesh.material.map,base=mesh.userData.baseImage??texture.image;
    this.mesh=mesh;this.dimensions={length,width,offset};this.bounds=[];this.lastPose=null;this.updateCount=0;
    // Preserve the authored gradient for visual checks and reuse the existing
    // CanvasTexture. Only this one working canvas is uploaded as the beam moves.
    mesh.userData.baseImage=base;this.baseImage=base;
    this.canvas=document.createElement('canvas');this.canvas.width=base.width;this.canvas.height=base.height;
    this.context=this.canvas.getContext('2d');this.texture=texture;
    texture.image=this.canvas;texture.needsUpdate=true;
  }
  setWalls(bounds){this.bounds=bounds??[];this.lastPose=null;}
  update(x,z,yaw){
    yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    const last=this.lastPose;
    if(last&&last.x===x&&last.z===z&&last.yaw===yaw)return false;
    this.lastPose={x,z,yaw};
    const points=groundBeamVisibility(x,z,yaw,this.dimensions,this.bounds);
    const {length,width,offset}=this.dimensions,canvas=this.canvas,ctx=this.context;
    const pixelX=across=>(.5-across/width)*canvas.width;
    const pixelY=along=>(.5-(along-offset)/length)*canvas.height;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(this.baseImage,0,0,canvas.width,canvas.height);
    ctx.save();ctx.globalCompositeOperation='destination-in';ctx.fillStyle='#fff';
    ctx.beginPath();ctx.moveTo(pixelX(0),pixelY(0));
    for(const point of points)ctx.lineTo(pixelX(point.across),pixelY(point.along));
    ctx.closePath();ctx.fill();ctx.restore();
    this.texture.needsUpdate=true;this.updateCount++;
    return true;
  }
}
