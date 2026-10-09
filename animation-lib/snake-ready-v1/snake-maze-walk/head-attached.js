import {travelPoint} from './route.js?v=1.02.03.00';

// Deliberately raw direct-attachment baseline: the painted skull's rear
// is the body endpoint. There is no separate neck, angle schedule, guide
// smoothing, source-frame selection, reflection or change of skull scale.
export function attachedPose(distance,reverse=false,profile){
  if(!Number.isFinite(distance)||!profile||
     !Number.isFinite(profile.skullLength)||!(profile.skullLength>0))
    throw new Error('Invalid directly attached head pose');
  const ownedSpan=profile.skullLength;
  const attachmentDistance=distance-ownedSpan;
  const rear=travelPoint(attachmentDistance,reverse);
  const angle=rear.angle,tx=Math.cos(angle),ty=Math.sin(angle);
  const nose={x:rear.x+ownedSpan*tx,y:rear.y+ownedSpan*ty};
  const center={x:rear.x+ownedSpan/2*tx,y:rear.y+ownedSpan/2*ty};
  const lead=travelPoint(distance,reverse);
  return{attachment:rear,attachmentDistance,ownedSpan,rear,nose,center,lead,angle,
    diagnostics:{headingRate:rear.curve,
      noseDeviation:Math.hypot(nose.x-lead.x,nose.y-lead.y)}};
}

// A finished nape for the solo sprite only. This trims the cylindrical cut
// inside the existing artwork; it does not add a neck or move its anchor.
// Called in the rigid head's local space, so the contour cannot lag in turns.
export function clipSoloHead(ctx,profile){
  const scale=profile.width/218;
  const x=value=>profile.offsetX+(value-220)*scale;
  const y=value=>profile.offsetY+(value-128)*scale;
  ctx.beginPath();ctx.moveTo(x(262),y(128));
  ctx.bezierCurveTo(x(238),y(143),x(222),y(164),x(222),y(198));
  ctx.bezierCurveTo(x(222),y(233),x(239),y(254),x(262),y(264));
  ctx.lineTo(x(262),y(304));ctx.lineTo(x(444),y(304));
  ctx.lineTo(x(444),y(128));ctx.closePath();ctx.clip();
}

export function drawAttachedHead(ctx,image,profile,distance,reverse=false,pose=null,solo=false){
  const attached=pose??attachedPose(distance,reverse,profile);
  ctx.save();
  ctx.translate(attached.rear.x,attached.rear.y);
  ctx.rotate(attached.angle);
  if(solo)clipSoloHead(ctx,profile);
  ctx.drawImage(image,profile.sourceX,profile.sourceY,profile.sourceWidth,profile.sourceHeight,
    profile.offsetX,profile.offsetY,profile.width,profile.height);
  ctx.restore();
  return attached;
}
