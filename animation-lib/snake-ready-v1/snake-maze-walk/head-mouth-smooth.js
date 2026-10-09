import {attachedPose,clipSoloHead} from './head-attached.js?v=1.02.03.00';

// The skull and the rear attachment never move in local space. Only the lower
// cheek distributes the jaw rotation. This replaces the old cut/overlap hinge.
const PIVOT=[307,220], ANGLE=22*Math.PI/180;
const X=220,Y=128,W=224,H=176,SCALE=2,FRAMES=97,COLS=9;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
const clamp=value=>{if(!Number.isFinite(value))throw new Error('Invalid mouth closure');return Math.max(0,Math.min(1,value));};
function jawPoint(x,y,amount){
  const a=-ANGLE*amount,dx=x-PIVOT[0],dy=y-PIVOT[1];
  return {x:PIVOT[0]+dx*Math.cos(a)-dy*Math.sin(a),y:PIVOT[1]+dx*Math.sin(a)+dy*Math.cos(a)};
}
export function cheekPoint(x,y,closure){
  const amount=clamp(closure),weight=smooth((x-235)/85)*smooth((y-212)/18);
  const p=jawPoint(x,y,amount);
  return {x:x+weight*(p.x-x),y:y+weight*(p.y-y)};
}
const LOWER=[[319.5,230],[332,233],[345,239],[367,249],[389,235],[438,235],[438,295],[319.5,295]];
const UPPER=[[319.5,128],[438,128],[438,189],[420,189],[398,190],[373,201],[349,207],[329,208],[319.5,212]];
function clip(g,points){g.beginPath();g.moveTo(...points[0]);for(const p of points.slice(1))g.lineTo(...p);g.closePath();g.clip();}
function clipUpperFang(g){
  // Follow the upper tooth's tapered tip, not the original dark bridge between
  // both teeth. The old polygon extended to y240, stamping that bridge as a
  // black diamond over the moving lower fang at intermediate bite poses.
  g.beginPath();g.moveTo(397,189);g.lineTo(427,187);
  g.bezierCurveTo(430,201,416,224,392,234);
  g.bezierCurveTo(390,235,390,233,392,231);
  g.bezierCurveTo(400,223,402,209,399,198);
  g.bezierCurveTo(398,194,397,191,397,189);
  g.closePath();g.clip();
}

// Rasterize shared-vertex triangles into ONE image, not independently clipped
// translucent Canvas draws. Every pixel gets one premultiplied-alpha sample:
// no dark stitching, overlapping alpha, doubled contour or triangle shimmer.
function triangle(output,source,src,dst){
  const [a,b,c]=dst,den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
  if(den<=0)throw new Error('Folded cheek mesh');
  const width=W*SCALE,height=H*SCALE;
  const x0=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),x1=Math.min(width-1,Math.ceil(Math.max(a.x,b.x,c.x)));
  const y0=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),y1=Math.min(height-1,Math.ceil(Math.max(a.y,b.y,c.y)));
  for(let py=y0;py<=y1;py++)for(let px=x0;px<=x1;px++){
    const x=px+.5,y=py+.5;
    const u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den;
    const v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den,w=1-u-v;
    if(Math.min(u,v,w)<-1e-8)continue;
    const sx=u*src[0].x+v*src[1].x+w*src[2].x-X-.5;
    const sy=u*src[0].y+v*src[1].y+w*src[2].y-Y-.5;
    const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
    let alpha=0,r=0,green=0,blue=0;
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
      const qx=ix+dx,qy=iy+dy;if(qx<0||qx>=W||qy<0||qy>=H)continue;
      const k=(qy*W+qx)*4,factor=(dx?fx:1-fx)*(dy?fy:1-fy)*source[k+3];
      alpha+=factor;r+=factor*source[k];green+=factor*source[k+1];blue+=factor*source[k+2];
    }
    const out=(py*width+px)*4;
    output[out]=alpha?r/alpha:0;output[out+1]=alpha?green/alpha:0;
    output[out+2]=alpha?blue/alpha:0;output[out+3]=alpha;
  }
}

export function createMouthAtlas(image,profile,makeCanvas){
  const atlas=makeCanvas(W*COLS,H*Math.ceil(FRAMES/COLS)),g=atlas.getContext('2d');
  const sourceCanvas=makeCanvas(W,H),sg=sourceCanvas.getContext('2d',{willReadFrequently:true});
  sg.drawImage(image,profile.sourceX,profile.sourceY,profile.sourceWidth,profile.sourceHeight,0,0,218,167);
  const source=sg.getImageData(0,0,W,H).data;
  const patch=makeCanvas(W*SCALE,H*SCALE),pg=patch.getContext('2d');
  const pixels=pg.createImageData(W*SCALE,H*SCALE);
  const raw=()=>g.drawImage(sourceCanvas,0,0,W,H,X,Y,W,H);
  for(let frame=0;frame<FRAMES;frame++){
    const amount=frame/(FRAMES-1),tx=frame%COLS*W,ty=Math.floor(frame/COLS)*H;
    g.save();g.translate(tx-X,ty-Y);
    pixels.data.fill(0);
    // 4px cells in source space. Shared boundary pins upper skin and the rear;
    // its lower-right vertices coincide exactly with the rigid jaw transform.
    for(let y=Y;y<295;y+=4)for(let x=X;x<320;x+=4){
      const right=Math.min(320,x+4),bottom=Math.min(295,y+4);
      const vertices=[{x,y},{x:right,y},{x:right,y:bottom},{x,y:bottom}];
      const mapped=vertices.map(p=>{const q=cheekPoint(p.x,p.y,amount);return {x:(q.x-X)*SCALE,y:(q.y-Y)*SCALE};});
      for(const ids of [[0,1,2],[0,2,3]])triangle(pixels.data,source,ids.map(i=>vertices[i]),ids.map(i=>mapped[i]));
    }
    pg.putImageData(pixels,0,0);
    // Interior backing is fully enclosed by the lips, never outside silhouette.
    const low=jawPoint(379,268,amount);
    g.fillStyle='#020706';g.beginPath();g.moveTo(309,218);g.lineTo(420,190);g.lineTo(low.x,low.y);g.closePath();g.fill();
    g.save();g.translate(...PIVOT);g.rotate(-ANGLE*amount);g.translate(-PIVOT[0],-PIVOT[1]);
    clip(g,LOWER);raw();g.restore();
    g.drawImage(patch,0,0,W*SCALE,H*SCALE,X,Y,W,H);
    g.save();clip(g,UPPER);raw();g.restore();
    g.save();clipUpperFang(g);raw();g.restore();
    g.restore();
  }
  // Drop working buffers after initialization; only this ~14.9MiB atlas lives
  // on. Both dimensions stay below 2048 for modest Canvas/GPU implementations.
  sourceCanvas.width=sourceCanvas.height=patch.width=patch.height=1;
  return {image:atlas,frames:FRAMES,width:W,height:H,cols:COLS};
}

export function drawSmoothMouthHead(ctx,atlas,image,profile,distance,reverse=false,pose=null,closure=0,solo=false){
  const amount=clamp(closure),attached=pose??attachedPose(distance,reverse,profile);
  const index=Math.round(amount*(atlas.frames-1));
  // Even the zero pose uses the same cleaned cavity and sampling as the other
  // poses. Falling back to raw art here flashes its green-fringed alpha hole
  // inside the mouth once per cycle. The separate 'open' control keeps raw art.
  const scale=profile.width/218;
  ctx.save();ctx.translate(attached.rear.x,attached.rear.y);ctx.rotate(attached.angle);
  if(solo)clipSoloHead(ctx,profile);
  ctx.drawImage(atlas.image,index%atlas.cols*atlas.width,Math.floor(index/atlas.cols)*atlas.height,
    atlas.width,atlas.height,profile.offsetX,profile.offsetY,atlas.width*scale,atlas.height*scale);
  ctx.restore();return attached;
}
