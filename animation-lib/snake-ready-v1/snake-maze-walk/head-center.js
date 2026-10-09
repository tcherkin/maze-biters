import {route,travelPoint} from './route.js';
import {smoothPoint,drawPose} from './head-hybrid.js';

// This is a different pivot model, not a timing change to the nose-aimed
// model. The fixed anatomical axis midpoint follows the guide. Its angle
// is the direction of that same point's velocity, not an independent ease.
const NODES=[-.9602898564975363,-.7966664774136267,-.525532409916329,
  -.1834346424956498,.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363];
const WEIGHTS=[.1012285362903763,.2223810344533745,.3137066458778873,
  .362683783378362,.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];

// Q2 is a triangular spatial convolution: two box averages of the C1
// route, hence C3 in exact arithmetic. Integrate on each analytic line/arc
// separately with 8-point Gauss-Legendre quadrature. This is a numerical
// evaluation, not a claim of symbolic exactness; subtracting the local
// reference point avoids large-coordinate cancellation.
export function centerGuide(distance,reverse=false,halfWindow=8){
  if(!Number.isFinite(distance)||!Number.isFinite(halfWindow)||
     !(halfWindow>0)||halfWindow>=route.total/2)
    throw new Error('Invalid center-led guide window');
  const left=distance-halfWindow,right=distance+halfWindow;
  const cuts=[left,distance,right];
  for(const piece of route.pieces){
    const boundary=reverse?-piece.start:piece.start;
    const lap=Math.floor((left-boundary)/route.total);
    const next=boundary+(lap+1)*route.total;
    if(next>left&&next<right)cuts.push(next);
  }
  cuts.sort((a,b)=>a-b);
  const reference=travelPoint(distance,reverse);
  let x=0,y=0;
  for(let j=0;j<cuts.length-1;j++){
    const a=cuts[j],b=cuts[j+1],mid=(a+b)/2,half=(b-a)/2;
    if(half<=0)continue;
    for(let i=0;i<NODES.length;i++){
      const s=mid+half*NODES[i],p=travelPoint(s,reverse);
      const weight=WEIGHTS[i]*half*(halfWindow-Math.abs(s-distance))/(halfWindow*halfWindow);
      x+=(p.x-reference.x)*weight;y+=(p.y-reference.y)*weight;
    }
  }
  const h=halfWindow/2;
  const a=smoothPoint(distance-h,reverse,h),b=smoothPoint(distance+h,reverse,h);
  const dx=(b.x-a.x)/(2*h),dy=(b.y-a.y)/(2*h),speed=Math.hypot(dx,dy);
  if(speed<1e-8)throw new Error('Center-led head guide has no direction');
  const before=travelPoint(left,reverse),after=travelPoint(right,reverse);
  const w2=halfWindow*halfWindow;
  const ddx=(after.x-2*reference.x+before.x)/w2;
  const ddy=(after.y-2*reference.y+before.y)/w2;
  const jx=(Math.cos(after.angle)-2*Math.cos(reference.angle)+Math.cos(before.angle))/w2;
  const jy=(Math.sin(after.angle)-2*Math.sin(reference.angle)+Math.sin(before.angle))/w2;
  const speed2=speed*speed,cross=dx*ddy-dy*ddx;
  const headingRate=cross/speed2;
  const headingAcceleration=((dx*jy-dy*jx)*speed2-2*cross*(dx*ddx+dy*ddy))/(speed2*speed2);
  return{x:reference.x+x,y:reference.y+y,dx,dy,ddx,ddy,speed,
    angle:Math.atan2(dy,dx),headingRate,headingAcceleration};
}

export function centerPose(distance,reverse=false,profile){
  if(!Number.isFinite(distance)||!profile||!(profile.skullLength>0)||
     !(profile.span>profile.skullLength))throw new Error('Invalid center-led head pose');
  // The R18 fixture turns over 28.27+2*8 = 44.27 route pixels, about half
  // the previous 85.99-pixel heading schedule, with a softer entry/exit.
  const smoothingHalfWindow=profile.diameter*8/12.825;
  const extraNeckSpan=profile.diameter*24/12.825;
  const ownedSpan=profile.span+extraNeckSpan;
  const centerDistance=distance-profile.skullLength/2;
  const center=centerGuide(centerDistance,reverse,smoothingHalfWindow);
  const angle=center.angle,tx=Math.cos(angle),ty=Math.sin(angle);
  const rear={x:center.x-profile.skullLength/2*tx,y:center.y-profile.skullLength/2*ty};
  const nose={x:center.x+profile.skullLength/2*tx,y:center.y+profile.skullLength/2*ty};
  const attachmentDistance=distance-ownedSpan;
  const attachment=travelPoint(attachmentDistance,reverse);
  const turn=Math.atan2(Math.sin(angle-attachment.angle),Math.cos(angle-attachment.angle));
  const chord=Math.hypot(rear.x-attachment.x,rear.y-attachment.y);
  const handle=chord/(3*Math.cos(turn/4)**2);
  const neck={start:{x:attachment.x,y:attachment.y},end:{...rear},
    control1:{x:attachment.x+handle*.75*Math.cos(attachment.angle),
      y:attachment.y+handle*.75*Math.sin(attachment.angle)},
    control2:{x:rear.x-handle*1.25*tx,y:rear.y-handle*1.25*ty}};
  const guide=travelPoint(centerDistance,reverse),lead=travelPoint(distance,reverse);
  return{attachment,attachmentDistance,ownedSpan,centerDistance,center,nose,rear,lead,angle,neck,
    diagnostics:{smoothingHalfWindow,extraNeckSpan,centerSpeed:center.speed,
      headingRate:center.headingRate,headingAcceleration:center.headingAcceleration,
      centerDeviation:Math.hypot(center.x-guide.x,center.y-guide.y),
      noseDeviation:Math.hypot(nose.x-lead.x,nose.y-lead.y),
      neckChord:chord,neckTurn:turn,handle}};
}

export function drawCenterHead(ctx,image,profile,distance,reverse=false,pose=null){
  return drawPose(ctx,image,profile,pose??centerPose(distance,reverse,profile));
}
