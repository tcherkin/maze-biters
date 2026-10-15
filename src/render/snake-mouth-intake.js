// Visual-only intake. The native contact event and movement remain the sole
// authority; these helpers never move an actor or a collidable snake point.
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const mix=(a,b,t)=>a+(b-a)*t;

/** All coordinates use the caller's space (36-unit snake space by default). */
export function createSideTipBend(tip,span,intake,sign=1){
  if(!intake?.tipCurl||!(span>.02)||(intake.bank!==0&&intake.bank!==2))return null;
  const {pose,rotation,size,reach,bank}=intake,scale=intake.referenceScale??1;
  if(!(scale>0)||![tip.x,tip.y,tip.angle,pose?.x,pose?.y,rotation,size,reach].every(Number.isFinite))return null;
  const co=Math.cos(rotation),si=Math.sin(rotation);
  const x=(tip.x-pose.x)*co+(tip.y-pose.y)*si,y=-(tip.x-pose.x)*si+(tip.y-pose.y)*co;
  const heading=rotation+(bank===2?Math.PI:0),alignment=sign*Math.cos(tip.angle-heading);
  const forward=bank===2?-x:x;
  const amount=smooth((reach+1.5*scale-forward)/(6*scale))*smooth((forward+size*.15)/(size*.25))*
    smooth((alignment-.92)/.08)*(1-smooth(Math.abs(y)/(size*.3)));
  if(amount<=0)return null;
  const drop=Math.max(0,Math.min(size*.16-y,3.2*scale,span*.17))*amount;
  if(drop<=0)return null;
  return {dx:-si*drop,dy:co*drop,length:span};
}

/** The root retains its original position, tangent and curvature. */
export function sideTipPoint(p,d,sign,bend){
  if(!bend||d>=bend.length||d<0)return p;
  const u=d/bend.length,w=1-smooth(u),derivative=-30*u*u*(1-u)*(1-u)/bend.length;
  return {x:p.x+bend.dx*w,y:p.y+bend.dy*w,
    angle:Math.atan2(Math.sin(p.angle)+sign*bend.dy*derivative,
      Math.cos(p.angle)+sign*bend.dx*derivative)};
}

export function mouthIntakePose(entity,time,{playerPosition=null,tile=36,position=null}={}){
  if(!entity||entity.dead)return null;
  const dir=entity.dir;if(!dir||!Number.isFinite(dir.x+dir.y)||!Math.hypot(dir.x,dir.y))return null;
  const p=position||playerPosition?.(entity,time)||entity;
  if(!Number.isFinite(p?.x+p?.y)||!(tile>0))return null;
  const heading=Math.atan2(dir.y,dir.x),quadrant=Math.round(heading/(Math.PI/2));
  const bank=((quadrant%4)+4)%4;
  const rotation=(Number.isFinite(entity.controllerTiltDegrees)?entity.controllerTiltDegrees:0)*Math.PI/180;
  return {tipCurl:true,bank,rotation,size:tile,reach:tile*74/160,referenceScale:tile/36,
    pose:{x:(p.x+.5)*tile,y:(p.y+.5)*tile,angle:heading+rotation}};
}

// This is the approved experiment's aperture, flattened once at preparation.
// A shared80px mask per mouth pose serves every native player/hunter palette.
function aperture(bank,t){
  const points=[];
  const put=(x,y)=>points.push({x:bank===2?159-x+t:x,y});
  const curve=(cx,cy,x,y)=>{
    const a=points.at(-1),b={x:bank===2?159-cx+t:cx,y:cy},c={x:bank===2?159-x+t:x,y};
    for(let i=1;i<=16;i++){const v=i/16,u=1-v;points.push({x:u*u*a.x+2*u*v*b.x+v*v*c.x,y:u*u*a.y+2*u*v*b.y+v*v*c.y});}
  };
  if(bank===1){
    const half=mix(34,20,t),left=80-half,right=80+half;
    put(38,95);curve(80,mix(87,91,t),122,95);curve(131,105,125,mix(121,110,t));
    put(right,mix(128,113,t));put(right,160);put(left,160);put(left,mix(128,113,t));
    put(35,mix(121,110,t));curve(29,105,38,95);
  }else{
    for(const [x,y] of [[75,mix(105,103,t)],[78,94],[94,mix(92,94,t)],[122,mix(92,94,t)],
      [142,mix(94,95,t)],[161,mix(94,95,t)],[161,mix(134,115,t)],
      [mix(126,137,t),mix(134,115,t)],[mix(116,123,t),mix(132,115,t)],
      [mix(98,99,t),mix(128,114,t)],[mix(83,82,t),mix(122,111,t)],[mix(76,75,t),mix(114,107,t)]])put(x,y);
  }
  return points;
}
function inside(points,x,y){
  let hit=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)hit=!hit;
  }
  return hit;
}

export function buildMouthIntakeMask(raster,bank,closure){
  const size=raster?.width;
  if(!Number.isInteger(size)||size<1||raster.height!==size||raster.data?.length!==size*size*4||
    !Number.isInteger(bank)||bank<0||bank>3||!Number.isFinite(closure))throw Error('Invalid mouth intake raster');
  const out=new Uint8ClampedArray(raster.data.length);
  if(bank===3)return out;
  const t=clamp(closure),shape=aperture(bank,t),scale=160/size;
  for(let y=Math.floor(90/scale);y<size;y++)for(let x=0;x<size;x++){
    let coverage=0;
    for(const oy of [.25,.75])for(const ox of [.25,.75])if(inside(shape,(x+ox)*scale,(y+oy)*scale))coverage+=.25;
    if(!coverage)continue;
    const index=(y*size+x)*4,art=raster.data,alpha=art[index+3]/255;
    const maximum=Math.max(art[index],art[index+1],art[index+2]),minimum=Math.min(art[index],art[index+1],art[index+2]);
    const sourceX=(x+.5)*scale,sourceY=(y+.5)*scale;
    const cavity=1-alpha+alpha*clamp((110-maximum)/80);
    const tooth=sourceY<=106&&alpha>.1?clamp((minimum-35)/100):0;
    let visibility=cavity;
    const inletHalf=mix(34,20,t);
    if(bank===1&&sourceX>=80-inletHalf&&sourceX<80+inletHalf)visibility=Math.max(cavity,clamp((sourceY-103)/7));
    out[index]=out[index+1]=out[index+2]=255;out[index+3]=Math.round(255*coverage*visibility*(1-tooth));
  }
  return out;
}
