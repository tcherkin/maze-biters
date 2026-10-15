// Fantasy Biter presentation-only ingestion. This file never moves an actor,
// changes a collision boundary or touches the legacy hunter intake helpers.
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*t*(10+t*(-15+6*t));};
export const FANTASY_INTAKE=Object.freeze({
  widthScale:1.125,sideReach:72,sideTargetX:111.5,sideTargetY:111,frontTargetX:80,frontTargetY:110,
  frontHalfOpen:33.75,frontHalfBite:29.25,referenceSize:160,
});
// Match the approved centered horizontal asset fit. Distances from the
// center widen by 1.125; every vertical coordinate and animation phase stays.
const fitX=x=>80+(x-80)*FANTASY_INTAKE.widthScale;
const unfitX=x=>80+(x-80)/FANTASY_INTAKE.widthScale;
// Exact approved revision-5 stronger-open rig. These preparation-only values
// follow the baked artwork; mouth/bite/blink clocks remain entirely separate.
export const FANTASY_INTAKE_JAW_RIG=Object.freeze({
  fixedThroughY:111,translationFromY:135,rightLift:16,downLift:20,
  rampShoulder:.10,flattenFromClosure:.50,flattenAtClosure:.80,
});
const integral=value=>value**4*(2.5+value*(-3+value));
function boundedJawRamp(value){
  const u=clamp(value),a=FANTASY_INTAKE_JAW_RIG.rampShoulder;
  if(u<a)return a*integral(u/a)/(1-a);
  if(u>1-a)return 1-a*integral((1-u)/a)/(1-a);
  return (u-a/2)/(1-a);
}
/** Forward-map a fitted open-aperture point through the baked lower-jaw rig. */
export function fantasyIntakeJawY(x,y,bank,closure){
  if(![0,1,2].includes(bank)||![x,y,closure].every(Number.isFinite))throw new TypeError('Invalid Fantasy intake jaw point');
  const rig=FANTASY_INTAKE_JAW_RIG,t=clamp(closure),canonicalX=unfitX(bank===2?160-x:x);
  const weight=bank===1?smooth((canonicalX-16)/28)*smooth((144-canonicalX)/28):smooth((canonicalX-24)/66);
  const u=(y-rig.fixedThroughY)/(rig.translationFromY-rig.fixedThroughY),original=smooth(u);
  const blend=smooth((t-rig.flattenFromClosure)/(rig.flattenAtClosure-rig.flattenFromClosure));
  const ramp=original+(boundedJawRamp(u)-original)*blend;
  return y-(bank===1?rig.downLift:rig.rightLift)*t*weight*ramp;
}

function actorPose(entity,time,{playerPosition=null,tile=36,position=null}={}){
  if(!entity||entity.dead||!Number.isFinite(tile)||tile<=0)return null;
  const dir=entity.dir;
  if(!dir||!Number.isFinite(dir.x)||!Number.isFinite(dir.y)||!Math.hypot(dir.x,dir.y))return null;
  const p=position||playerPosition?.(entity,time)||entity;
  if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return null;
  const heading=Math.atan2(dir.y,dir.x),quadrant=Math.round(heading/(Math.PI/2));
  const bank=((quadrant%4)+4)%4;
  const rotation=(Number.isFinite(entity.controllerTiltDegrees)?entity.controllerTiltDegrees:0)*Math.PI/180;
  return {bank,rotation,tile,heading,x:(p.x+.5)*tile,y:(p.y+.5)*tile};
}

export function fantasyMouthIntakePose(entity,time,options={}){
  const pose=actorPose(entity,time,options);if(!pose)return null;
  const {bank,rotation,tile,heading,x,y}=pose;
  // sideReach is a visual curl distance from the center: 64 * 1.125.
  return {tipCurl:true,bank,rotation,size:tile,reach:tile*FANTASY_INTAKE.sideReach/160,referenceScale:tile/36,
    pose:{x,y,angle:heading+rotation}};
}

// Shrinking non-collidable snake/scorpion ghosts aim inside the fixed cavity,
// above the raised 2x lower lip even at the strongest approved bite pose.
// Controller tilt and interpolation remain the caller's native game values.
export function fantasyMouthTarget(entity,time,{playerPosition=null,tile=16,position=null}={},out={}){
  const pose=actorPose(entity,time,{playerPosition,tile,position});if(!pose)return null;
  let x=80,y=52; // Rear view keeps the existing hidden-mouth destination.
  if(pose.bank===0){x=FANTASY_INTAKE.sideTargetX;y=FANTASY_INTAKE.sideTargetY;}
  else if(pose.bank===2){x=160-FANTASY_INTAKE.sideTargetX;y=FANTASY_INTAKE.sideTargetY;}
  else if(pose.bank===1){x=FANTASY_INTAKE.frontTargetX;y=FANTASY_INTAKE.frontTargetY;}
  const dx=(x-80)*tile/160,dy=(y-80)*tile/160,co=Math.cos(pose.rotation),si=Math.sin(pose.rotation);
  out.x=pose.x+dx*co-dy*si;out.y=pose.y+dx*si+dy*co;
  return out;
}

// Transform the original open aperture through the exact stronger 16px/20px
// jaw motion, including its bounded high-closure ramp. The actual native pose
// still decides skin/teeth occlusion. The bottom inlet remains open to y160.
function aperture(bank,t){
  const points=[];
  const point=(x,y)=>({x:fitX(bank===2?160-x:x),y});
  const put=(x,y)=>points.push(point(x,y));
  const curve=(cx,cy,x,y)=>{
    const a=points.at(-1),b=point(cx,cy),c=point(x,y);
    for(let i=1;i<=16;i++){const v=i/16,u=1-v;points.push({x:u*u*a.x+2*u*v*b.x+v*v*c.x,y:u*u*a.y+2*u*v*b.y+v*v*c.y});}
  };
  if(bank===1){
    // point() applies the fit once, including the front inlet's endpoints.
    const half=(FANTASY_INTAKE.frontHalfOpen+(FANTASY_INTAKE.frontHalfBite-FANTASY_INTAKE.frontHalfOpen)*t)/FANTASY_INTAKE.widthScale;
    const lower=134;
    put(35,102);curve(80,88,125,102);curve(132,115,121,lower);
    put(80+half,lower);put(80+half,160);put(80-half,160);put(80-half,lower);
    put(39,lower);curve(28,115,35,102);
  }else{
    put(76,111);curve(77,96,96,95);put(146,98);put(161,98);
    put(161,142);put(130,142);curve(96,134,80,119);curve(75,115,76,111);
  }
  return points.map(p=>({x:p.x,y:bank===1&&p.y===160?160:fantasyIntakeJawY(p.x,p.y,bank,t)}));
}
function inside(points,x,y){
  let hit=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)hit=!hit;
  }
  return hit;
}
function mirror(data,size){
  const out=new Uint8ClampedArray(data.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const from=(y*size+size-1-x)*4;out.set(data.subarray(from,from+4),(y*size+x)*4);
  }
  return out;
}

/** Prepare from NORMAL P1 mouth pixels; share this anatomy mask with recolors. */
export function buildFantasyMouthIntakeMask(raster,bank,closure){
  const size=raster?.width;
  if(!Number.isInteger(size)||size<1||raster.height!==size||raster.data?.length!==size*size*4||
    !Number.isInteger(bank)||bank<0||bank>3||!Number.isFinite(closure))throw new TypeError('Invalid Fantasy mouth intake raster');
  const out=new Uint8ClampedArray(raster.data.length);
  if(bank===3)return out;
  // Render the left aperture from exactly the same canonical right geometry;
  // this avoids asymmetric polygon-edge rounding at subpixel sample points.
  if(bank===2)return mirror(buildFantasyMouthIntakeMask({width:size,height:size,data:mirror(raster.data,size)},0,closure),size);
  const t=clamp(closure),shape=aperture(bank,t),scale=160/size,art=raster.data;
  const half=FANTASY_INTAKE.frontHalfOpen+(FANTASY_INTAKE.frontHalfBite-FANTASY_INTAKE.frontHalfOpen)*t;
  for(let y=Math.floor(92/scale);y<size;y++)for(let x=0;x<size;x++){
    let coverage=0;
    for(const oy of [.25,.75])for(const ox of [.25,.75])if(inside(shape,(x+ox)*scale,(y+oy)*scale))coverage+=.25;
    if(!coverage)continue;
    const index=(y*size+x)*4,alpha=art[index+3]/255;
    const maximum=Math.max(art[index],art[index+1],art[index+2]),minimum=Math.min(art[index],art[index+1],art[index+2]);
    const sx=(x+.5)*scale,sy=(y+.5)*scale;
    // The authored PNG keeps slightly sub-255 alpha even inside painted skin.
    // Do not interpret those 1–3 alpha values as a hole through the upper lip.
    const upperSkin=sy<110&&alpha>.75&&art[index+1]>140&&art[index+1]>art[index]*1.25&&art[index+1]>art[index+2]*1.25;
    if(upperSkin)continue;
    const cavity=1-alpha+alpha*clamp((120-maximum)/85);
    // Teeth remain rigid through y111 in the approved open-only animation.
    // Apply this protection AFTER the lower inlet, unlike the old mask which
    // let that inlet paint over the tips of the larger Fantasy upper teeth.
    const tooth=sy<=114&&alpha>.1?clamp((minimum-45)/90):0;
    let visible=cavity;
    if(bank===1&&sx>=80-half&&sx<80+half){
      const inletStart=fantasyIntakeJawY(sx,113,bank,t),inletEnd=fantasyIntakeJawY(sx,118,bank,t);
      visible=Math.max(visible,smooth((sy-inletStart)/(inletEnd-inletStart)));
    }
    out[index]=out[index+1]=out[index+2]=255;
    out[index+3]=Math.round(255*coverage*visible*(1-tooth));
  }
  return out;
}
