import {route,travelPoint,HEAD_SPAN,DIAMETER,mod} from './route.js?v=1.02.03.00';

const SMOOTHING_HALF_WINDOW=6;
const NECK_SAMPLES=28;

// Fixed landmarks in the first, straight authored frame. The cut at X=220
// still has a 76-pixel cylindrical cross-section; the skull widens after it.
// Normalize to the supplied cell for smaller test fixtures, without changing
// the crop or scale as a function of direction, animation phase, or time.
export function createHybridProfile(entry){
  const cell=entry?.cell;
  if(!cell||![cell.x,cell.y,cell.width,cell.height].every(Number.isFinite)||
     cell.width<=0||cell.height<=0)throw new Error('Invalid hybrid head source cell');
  const rx=cell.width/444,ry=cell.height/444;
  const sourceX=cell.x+220*rx,sourceY=cell.y+128*ry;
  const sourceWidth=218*rx,sourceHeight=167*ry;
  const rearX=sourceX,rearY=cell.y+198*ry;
  const noseX=cell.x+435.5*rx,noseY=rearY;
  const scale=DIAMETER/(76*ry);
  return Object.freeze({sourceX,sourceY,sourceWidth,sourceHeight,rearX,rearY,
    noseX,noseY,scale,skullLength:(noseX-rearX)*scale,
    width:sourceWidth*scale,height:sourceHeight*scale,
    offsetX:0,offsetY:(sourceY-rearY)*scale,
    span:HEAD_SPAN,diameter:DIAMETER});
}

function pieceIntegral(piece,length){
  if(piece.type==='line')return{
    x:piece.a[0]*length+piece.dir[0]*length*length/2,
    y:piece.a[1]*length+piece.dir[1]*length*length/2
  };
  const angle=piece.angle+piece.sign*length/piece.r;
  const factor=piece.r*piece.r/piece.sign;
  return{
    x:piece.center[0]*length+factor*(Math.sin(angle)-Math.sin(piece.angle)),
    y:piece.center[1]*length-factor*(Math.cos(angle)-Math.cos(piece.angle))
  };
}

const integralPrefixes=[];
const lapIntegral={x:0,y:0};
for(const piece of route.pieces){
  integralPrefixes.push({...lapIntegral});
  const value=pieceIntegral(piece,piece.length);
  lapIntegral.x+=value.x;lapIntegral.y+=value.y;
}
function pathIntegral(distance){
  const laps=Math.floor(distance/route.total);
  const local=distance-laps*route.total;
  let index=route.pieces.findIndex(piece=>local<piece.start+piece.length);
  if(index<0)index=route.pieces.length-1;
  const piece=route.pieces[index],prefix=integralPrefixes[index];
  const partial=pieceIntegral(piece,local-piece.start);
  return{x:laps*lapIntegral.x+prefix.x+partial.x,
    y:laps*lapIntegral.y+prefix.y+partial.y};
}

// Q is the exact symmetric spatial average of the C1 route P. Q is C2;
// this uses known path geometry, not a history-dependent angle filter.
function smoothPoint(distance,reverse,halfWindow=SMOOTHING_HALF_WINDOW){
  const center=mod(reverse?-distance:distance,route.total);
  const a=pathIntegral(center-halfWindow);
  const b=pathIntegral(center+halfWindow);
  return{x:(b.x-a.x)/(2*halfWindow),
    y:(b.y-a.y)/(2*halfWindow)};
}
function smoothTangent(distance,reverse,halfWindow=SMOOTHING_HALF_WINDOW){
  const a=travelPoint(distance-halfWindow,reverse);
  const b=travelPoint(distance+halfWindow,reverse);
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(length<1e-8)throw new Error('Hybrid head smoothing window has no direction');
  return{x:dx/length,y:dy/length,angle:Math.atan2(dy,dx)};
}

// Two box averages give a C3 position, whose tangent is C2. Taking the
// difference of the first exact averages evaluates that derivative without
// finite differencing or introducing a time-dependent filter.
function smoothTangentC2(distance,reverse,halfWindow){
  const h=halfWindow/2;
  const a=smoothPoint(distance-h,reverse,h);
  const b=smoothPoint(distance+h,reverse,h);
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(length<1e-8)throw new Error('Hybrid head smoothing window has no direction');
  return{x:dx/length,y:dy/length,angle:Math.atan2(dy,dx)};
}

export function sampleHybridNeck(neck,t){
  t=Math.max(0,Math.min(1,t));
  const v=1-t,A=neck.start,B=neck.control1,C=neck.control2,D=neck.end;
  const x=v*v*v*A.x+3*v*v*t*B.x+3*v*t*t*C.x+t*t*t*D.x;
  const y=v*v*v*A.y+3*v*v*t*B.y+3*v*t*t*C.y+t*t*t*D.y;
  const dx=3*(v*v*(B.x-A.x)+2*v*t*(C.x-B.x)+t*t*(D.x-C.x));
  const dy=3*(v*v*(B.y-A.y)+2*v*t*(C.y-B.y)+t*t*(D.y-C.y));
  const ddx=6*(v*(C.x-2*B.x+A.x)+t*(D.x-2*C.x+B.x));
  const ddy=6*(v*(C.y-2*B.y+A.y)+t*(D.y-2*C.y+B.y));
  const speed=Math.hypot(dx,dy);
  return{x,y,dx,dy,ddx,ddy,speed,
    curvature:speed>1e-8?(dx*ddy-dy*ddx)/(speed*speed*speed):0};
}

// Retain the previous nose-aimed solve verbatim for the Before comparison.
// Its end orientation overshoots an isolated quarter-turn by about 3.3 degrees.
export function aimedPose(distance,reverse=false,profile){
  if(!Number.isFinite(distance)||!profile||!(profile.skullLength>0)||
     !(profile.span>profile.skullLength))throw new Error('Invalid hybrid head pose');
  const seamDistance=distance-profile.span;
  const attachment=travelPoint(seamDistance,reverse);
  const smoothSeam=smoothPoint(seamDistance,reverse);
  const tangent=smoothTangent(seamDistance,reverse);
  const nose=smoothPoint(distance,reverse),lead=travelPoint(distance,reverse);
  const dx=nose.x-smoothSeam.x,dy=nose.y-smoothSeam.y;
  const u=dx*tangent.x+dy*tangent.y;
  const v=-dx*tangent.y+dy*tangent.x;

  // Solve a circular neck followed by a rigid skull aimed at the virtual
  // front. This avoids the tight S-bend produced by pinning the nose while
  // pointing a long rigid skull along the last short route chord.
  const turn=2*Math.atan2(v,u+profile.skullLength);
  const angle=tangent.angle+turn,tx=Math.cos(angle),ty=Math.sin(angle);
  const rear={x:nose.x-profile.skullLength*tx,y:nose.y-profile.skullLength*ty};
  const circularChord=Math.hypot(rear.x-smoothSeam.x,rear.y-smoothSeam.y);
  const handle=circularChord/(3*Math.cos(turn/4)**2);
  const neck={
    start:{x:attachment.x,y:attachment.y},
    control1:{x:attachment.x+handle*Math.cos(attachment.angle),
      y:attachment.y+handle*Math.sin(attachment.angle)},
    control2:{x:rear.x-handle*tx,y:rear.y-handle*ty},
    end:{...rear}
  };
  return{attachment,nose,rear,lead,angle,neck,
    diagnostics:{smoothingHalfWindow:SMOOTHING_HALF_WINDOW,
      noseDeviation:Math.hypot(nose.x-lead.x,nose.y-lead.y),
      neckChord:Math.hypot(rear.x-attachment.x,rear.y-attachment.y),
      neckTurn:turn,handle}};
}

const headingBase=route.point(0).angle;
const headingTurns=route.pieces.filter(piece=>piece.type==='arc');

// A signed route turn is paid out exactly once, using a positive quintic
// angular rate. There is no target-angle pursuit, inverse aiming solve,
// frame history, angle interpolation branch, or corrective backswing.
// Position-based evaluation also makes pause, scrubbing and speed changes
// give the same pose. Adjacent opposite turns may overlap on a different,
// tighter route; monotonicity is per isolated turn, not a universal claim.
export function monotonicHeading(distance,reverse=false,profile){
  if(!Number.isFinite(distance)||!profile||!(profile.span>0)||
     !(profile.diameter>0))throw new Error('Invalid hybrid heading');
  const leadIn=profile.diameter*3/8;
  let angle=headingBase+(reverse?Math.PI:0),rate=0,acceleration=0;
  let minTurnDuration=Infinity;
  for(const piece of headingTurns){
    const start=reverse?-piece.start-piece.length:piece.start;
    const signedTurn=(reverse?-1:1)*piece.sign*piece.length/piece.r;
    const duration=piece.length+profile.span;
    minTurnDuration=Math.min(minTurnDuration,duration);
    const fromStart=distance-start+leadIn;
    const laps=Math.floor(fromStart/route.total);
    const phase=(fromStart-laps*route.total)/duration;
    let progress=1;
    if(phase<1){
      const t=phase,v=1-t;
      progress=t*t*t*(10+t*(-15+6*t));
      rate+=signedTurn*30*t*t*v*v/duration;
      acceleration+=signedTurn*60*t*v*(1-2*t)/(duration*duration);
    }
    angle+=signedTurn*(laps+progress);
  }
  return{angle,rate,acceleration,leadIn,minTurnDuration};
}

export function hybridPose(distance,reverse=false,profile){
  if(!Number.isFinite(distance)||!profile||!(profile.skullLength>0)||
     !(profile.span>profile.skullLength))throw new Error('Invalid hybrid head pose');
  const heading=monotonicHeading(distance,reverse,profile);
  const halfWindow=profile.diameter*3/8;
  const seamDistance=distance-profile.span;
  const attachment=travelPoint(seamDistance,reverse);
  const smoothSeam=smoothPoint(seamDistance,reverse,halfWindow);
  const tangent=smoothTangentC2(seamDistance,reverse,halfWindow);
  const targetNose=smoothPoint(distance,reverse,halfWindow);
  const lead=travelPoint(distance,reverse);
  const angle=heading.angle,tx=Math.cos(angle),ty=Math.sin(angle);
  const turn=Math.atan2(Math.sin(angle-tangent.angle),Math.cos(angle-tangent.angle));
  const midAngle=tangent.angle+turn/2;
  const ux=Math.cos(midAngle),uy=Math.sin(midAngle);

  // With angle fixed by the monotonic schedule, a circular neck has its
  // rear endpoint on this bisector ray. Use two thirds of its projection
  // and one third of the nose-pinned rear: a fixed spatial compromise that
  // limits both the neck's curvature and the nose's change in speed. The
  // skull is never deformed and its angle is never corrected to aim at a
  // target. This deliberately allows a small virtual-front route offset.
  const desiredRearX=targetNose.x-profile.skullLength*tx;
  const desiredRearY=targetNose.y-profile.skullLength*ty;
  const chord=(desiredRearX-smoothSeam.x)*ux+(desiredRearY-smoothSeam.y)*uy;
  if(!(chord>1e-8))throw new Error('Route is too tight for the rigid hybrid head');
  const rear={
    x:desiredRearX+(smoothSeam.x+chord*ux-desiredRearX)*2/3,
    y:desiredRearY+(smoothSeam.y+chord*uy-desiredRearY)*2/3
  };
  const nose={x:rear.x+profile.skullLength*tx,y:rear.y+profile.skullLength*ty};
  const handle=chord/(3*Math.cos(turn/4)**2);
  const neck={
    start:{x:attachment.x,y:attachment.y},
    control1:{x:attachment.x+handle*Math.cos(attachment.angle),
      y:attachment.y+handle*Math.sin(attachment.angle)},
    control2:{x:rear.x-handle*tx,y:rear.y-handle*ty},
    end:{...rear}
  };
  return{attachment,nose,rear,lead,angle,neck,
    diagnostics:{smoothingHalfWindow:halfWindow,
      noseDeviation:Math.hypot(nose.x-lead.x,nose.y-lead.y),targetNose,
      neckChord:Math.hypot(rear.x-attachment.x,rear.y-attachment.y),
      projectedNeckChord:chord,neckTurn:turn,handle,
      headingRate:heading.rate,headingAcceleration:heading.acceleration,
      headingLeadIn:heading.leadIn,minTurnDuration:heading.minTurnDuration}};
}

// Colors sampled across the original flat nape. Broad opaque bands follow
// the neck normal continuously; no per-triangle clips or angle-bank changes.
const NECK_BANDS=Object.freeze([
  [-1.075,1.075,'#041100'],
  [-1,1,'#012200'],
  [-.94,.88,'#125a04'],
  [-.86,.70,'#256c00'],
  [-.77,.48,'#64a501'],
  [-.67,.23,'#b4dd02'],
  [-.58,-.02,'#dff808'],
  [-.43,-.12,'#fdfc47']
]);
function neckPoints(pose){
  const samples=[];
  const start=pose.neck.start,end=pose.neck.end;
  // Small hidden underlaps cover antialias edges at the body and nape.
  samples.push({x:start.x-.25*Math.cos(pose.attachment.angle),
    y:start.y-.25*Math.sin(pose.attachment.angle),
    nx:-Math.sin(pose.attachment.angle),ny:Math.cos(pose.attachment.angle)});
  for(let i=0;i<=NECK_SAMPLES;i++){
    const p=sampleHybridNeck(pose.neck,i/NECK_SAMPLES);
    samples.push({x:p.x,y:p.y,nx:-p.dy/p.speed,ny:p.dx/p.speed});
  }
  samples.push({x:end.x+2*Math.cos(pose.angle),y:end.y+2*Math.sin(pose.angle),
    nx:-Math.sin(pose.angle),ny:Math.cos(pose.angle)});
  return samples;
}
function fillNeckBand(ctx,points,lower,upper,color){
  ctx.beginPath();
  for(let i=0;i<points.length;i++){
    const p=points[i],x=p.x+p.nx*lower,y=p.y+p.ny*lower;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  for(let i=points.length-1;i>=0;i--){
    const p=points[i];ctx.lineTo(p.x+p.nx*upper,p.y+p.ny*upper);
  }
  ctx.closePath();ctx.fillStyle=color;ctx.fill();
}

function drawPose(ctx,image,profile,pose){
  const points=neckPoints(pose),radius=profile.diameter/2;
  ctx.save();
  for(const [lower,upper,color] of NECK_BANDS){
    fillNeckBand(ctx,points,lower*radius,upper*radius,color);
  }
  ctx.translate(pose.rear.x,pose.rear.y);ctx.rotate(pose.angle);
  ctx.drawImage(image,profile.sourceX,profile.sourceY,profile.sourceWidth,profile.sourceHeight,
    profile.offsetX,profile.offsetY,profile.width,profile.height);
  ctx.restore();
  return pose;
}

export function drawHybridHead(ctx,image,profile,distance,reverse=false){
  return drawPose(ctx,image,profile,hybridPose(distance,reverse,profile));
}

export function drawAimedHead(ctx,image,profile,distance,reverse=false){
  return drawPose(ctx,image,profile,aimedPose(distance,reverse,profile));
}

export {aimedPose as oldHybridPose,drawAimedHead as drawOldHybridHead};
// Shared with the additive center-led experiment; existing modes unchanged.
export {smoothPoint,drawPose};
