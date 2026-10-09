import {attachedPose,drawAttachedHead,clipSoloHead} from './head-attached.js?v=1.02.03.00';

const MAX_CLOSE=22*Math.PI/180;
// Coordinates belong to the first, right-facing 444px authored cell.
// The jaw cut crosses the dark mouth, below the fixed upper fang. Its hinge
// sits inside the rear cheek. Separate upper-face/fang masks leave space for
// the closing jaw instead of painting the old black opening on top of it.
const HINGE=[240,238];
const CUT=[[235,234],[292,229],[308,221],[345,239],[367,249],[389,235],[438,235]];
const UPPER=[[220,128],[438,128],[438,189],[420,189],[398,190],[373,201],[349,207],[329,208],[313,214],[306,221],[294,230],[266,237],[249,252],[220,252]];
const FANG=[[397,189],[427,187],[429,204],[413,225],[392,240],[386,235],[393,216]];

export function mouthState(phase,enabled=true,timing='gather'){
  if(!Number.isFinite(phase))throw new Error('Invalid mouth phase');
  if(!['gather','thrust'].includes(timing))throw new Error('Invalid mouth timing');
  const p=((phase%1)+1)%1;
  // C2 at cell boundaries: quiet opening and closing, not a two-frame swap.
  // Keep the former gather rhythm available. The experiment inverts its
  // openness exactly: opening during gather, closing during head release.
  // No shifted movement clock, extra oscillation or change to the jaw range.
  const wave=Math.sin(Math.PI*p),gather=wave**4;
  const closure=enabled?(timing==='thrust'?1-gather:gather):0;
  return {phase:p,closure,jawAngle:-MAX_CLOSE*closure};
}

export function drawMouthHead(ctx,image,profile,distance,reverse=false,pose=null,closure=0,solo=false){
  if(!Number.isFinite(closure))throw new Error('Invalid mouth closure');
  const amount=Math.max(0,Math.min(1,closure));
  const attached=pose??attachedPose(distance,reverse,profile);
  if(amount===0)return drawAttachedHead(ctx,image,profile,distance,reverse,attached,solo);
  // Work in authored-cell coordinates, with one UNIFORM scale. There is no
  // skull warping, extra neck, handedness switch or change to the accepted pose.
  const scale=profile.width/218;
  const raw=()=>ctx.drawImage(image,profile.sourceX,profile.sourceY,profile.sourceWidth,profile.sourceHeight,220,128,218,167);
  const path=points=>{ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.closePath();ctx.clip();};
  ctx.save();ctx.translate(attached.rear.x,attached.rear.y);ctx.rotate(attached.angle);
  if(solo)clipSoloHead(ctx,profile);
  ctx.scale(scale,scale);ctx.translate(-220,-198);
  const rotatePoint=([x,y])=>{const a=-MAX_CLOSE*amount,dx=x-HINGE[0],dy=y-HINGE[1];return [HINGE[0]+dx*Math.cos(a)-dy*Math.sin(a),HINGE[1]+dx*Math.sin(a)+dy*Math.cos(a)];};
  ctx.save();ctx.fillStyle='#020706';ctx.beginPath();ctx.moveTo(302,218);ctx.lineTo(424,189);
  ctx.lineTo(...rotatePoint([397,248]));ctx.lineTo(...rotatePoint([377,271]));ctx.closePath();ctx.fill();ctx.restore();
  ctx.save();ctx.translate(...HINGE);ctx.rotate(-MAX_CLOSE*amount);ctx.translate(-HINGE[0],-HINGE[1]);
  path([...CUT,[438,295],[235,295]]);raw();ctx.restore();
  // Slight overlap at the cheek hides the hinge. Keep the upper fang in front
  // of the lower jaw; it must not orbit with the lower tooth during closure.
  ctx.save();path(UPPER);raw();ctx.restore();
  path(FANG);raw();ctx.restore();
  return attached;
}
