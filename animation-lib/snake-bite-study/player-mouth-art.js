import {getPlayerMouthMesh} from './player-mouth-mesh.js';

// Both authored endpoints supply geometry AND paint. Each intermediate pose
// registers their corresponding features to one common mesh before mixing
// premultiplied color. This is not an unaligned two-silhouette crossfade.
export const CELL=160;
export const FRAME_COUNT=49;
export const ATLAS_COLUMNS=7;
export const PLAYER_MOUTH_CELL=CELL;
export const PLAYER_MOUTH_FRAMES=FRAME_COUNT;
export const PLAYER_MOUTH_COLUMNS=ATLAS_COLUMNS;
export const OPEN_SOURCE_X=Object.freeze([320,960,1600,0]);
export const CLOSED_SOURCE_X=Object.freeze([640,1280,1920,0]);
export const BACK_CAP_DROP=3;
const unit=value=>Math.max(0,Math.min(1,value));

// Back view has one authored CLOSED pose. Split it at its curved red/green
// seam, then translate only the red cap as a rigid layer. Green pixels remain
// in their original position (the descending cap merely occludes the seam).
export function backCapBoundary(source,x){
  for(let y=55;y<=112;y++){
    const i=(y*CELL+x)*4;
    if(source[i+3]>32&&source[i+1]>12&&source[i+1]>source[i]*1.35)return y-1;
  }
  return 112;
}
function backPose(original,closure,out){
  const drop=BACK_CAP_DROP*(1-closure);
  if(drop===0){out.set(original);return out;}
  out.set(original);
  for(let x=0;x<CELL;x++){
    const boundary=backCapBoundary(original,x);
    for(let y=0;y<=Math.min(CELL-1,boundary+BACK_CAP_DROP);y++){
      const index=(y*CELL+x)*4,sourceY=y-drop,low=Math.floor(sourceY),mix=sourceY-low;
      const first=low>=0&&low<=boundary?(low*CELL+x)*4:-1;
      const second=low+1>=0&&low+1<=boundary?((low+1)*CELL+x)*4:-1;
      const a=first<0?0:original[first+3]*(1-mix),b=second<0?0:original[second+3]*mix;
      const capAlpha=a+b,baseAlpha=y>boundary?original[index+3]:0;
      const backgroundAlpha=baseAlpha*(1-capAlpha/255),alpha=capAlpha+backgroundAlpha;
      out[index+3]=Math.round(alpha);
      for(let channel=0;channel<3;channel++)out[index+channel]=alpha>0?
        Math.round(((first<0?0:original[first+channel]*a)+(second<0?0:original[second+channel]*b)+original[index+channel]*backgroundAlpha)/alpha):0;
    }
  }
  return out;
}

// Bilinear sampling in premultiplied space; x/y are source pixel centers.
// Reused output slots avoid temporary allocations in the per-pixel loop.
function sample(source,x,y,out){
  x=Math.max(0,Math.min(CELL-1,x));y=Math.max(0,Math.min(CELL-1,y));
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(CELL-1,x0+1),y1=Math.min(CELL-1,y0+1);
  const fx=x-x0,fy=y-y0;
  out.fill(0);
  for(let iy=0;iy<2;iy++)for(let ix=0;ix<2;ix++){
    const weight=(ix?fx:1-fx)*(iy?fy:1-fy);
    const index=((iy?y1:y0)*CELL+(ix?x1:x0))*4,alpha=source[index+3]*weight;
    for(let channel=0;channel<3;channel++)out[channel]+=source[index+channel]*alpha;
    out[3]+=alpha;
  }
}

export function morphPlayerMouthFrame(open,closed,bank,closure){
  if(!Number.isInteger(bank)||bank<0||bank>3||!Number.isFinite(closure)||
    open.length!==CELL*CELL*4||closed.length!==open.length)throw Error('Invalid player mouth sources');
  const t=unit(closure),out=new Uint8ClampedArray(open.length);
  // Endpoints are the untouched original artwork, including transparent RGB.
  if(bank===3)return backPose(closed,t,out);
  if(t===0){out.set(open);return out;}
  if(t===1){out.set(closed);return out;}
  const mesh=getPlayerMouthMesh(bank),points=mesh.open.map((a,index)=>{
    const b=mesh.closed[index];return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  });
  const fromOpen=new Float64Array(4),fromClosed=new Float64Array(4);
  for(const [ia,ib,ic] of mesh.triangles){
    const a=points[ia],b=points[ib],c=points[ic];
    const denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(denominator)<1e-8)throw Error('Degenerate player mouth mesh');
    const minX=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0]))),maxX=Math.min(CELL-1,Math.floor(Math.max(a[0],b[0],c[0])));
    const minY=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1]))),maxY=Math.min(CELL-1,Math.floor(Math.max(a[1],b[1],c[1])));
    const oa=mesh.open[ia],ob=mesh.open[ib],oc=mesh.open[ic];
    const ca=mesh.closed[ia],cb=mesh.closed[ib],cc=mesh.closed[ic];
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denominator;
      const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denominator,w=1-u-v;
      if(u<-.0000001||v<-.0000001||w<-.0000001)continue;
      sample(open,u*oa[0]+v*ob[0]+w*oc[0],u*oa[1]+v*ob[1]+w*oc[1],fromOpen);
      sample(closed,u*ca[0]+v*cb[0]+w*cc[0],u*ca[1]+v*cb[1]+w*cc[1],fromClosed);
      const index=(y*CELL+x)*4,alpha=(1-t)*fromOpen[3]+t*fromClosed[3];
      out[index+3]=Math.round(alpha);
      if(alpha>0)for(let channel=0;channel<3;channel++)
        out[index+channel]=Math.round(((1-t)*fromOpen[channel]+t*fromClosed[channel])/alpha);
    }
  }
  return out;
}

export function createPlayerMouthAtlases(image,makeCanvas){
  if(typeof makeCanvas!=='function')throw Error('A canvas factory is required');
  const sourceCanvas=makeCanvas(CELL,CELL),sourceContext=sourceCanvas.getContext('2d',{willReadFrequently:true});
  if(!sourceContext)throw Error('Player mouth canvas is unavailable');
  const read=x=>{sourceContext.clearRect(0,0,CELL,CELL);sourceContext.drawImage(image,x,0,CELL,CELL,0,0,CELL,CELL);return sourceContext.getImageData(0,0,CELL,CELL).data;};
  const atlases=OPEN_SOURCE_X.map((sourceX,bank)=>{
    const open=read(sourceX),closed=bank===3?open:read(CLOSED_SOURCE_X[bank]);
    const frames=FRAME_COUNT;
    const sheet=makeCanvas(ATLAS_COLUMNS*CELL,Math.ceil(frames/ATLAS_COLUMNS)*CELL);
    const context=sheet.getContext('2d');
    if(!context)throw Error('Player mouth atlas canvas is unavailable');
    const frame=context.createImageData(CELL,CELL);
    for(let index=0;index<frames;index++){
      frame.data.set(morphPlayerMouthFrame(open,closed,bank,index/(FRAME_COUNT-1)));
      context.putImageData(frame,index%ATLAS_COLUMNS*CELL,Math.floor(index/ATLAS_COLUMNS)*CELL);
    }
    return sheet;
  });
  sourceCanvas.width=sourceCanvas.height=1;
  return atlases;
}

export function drawPlayerMouth(ctx,atlases,bank,closure,size=CELL){
  if(!Number.isInteger(bank)||bank<0||bank>3||!Number.isFinite(closure)||
    !Number.isFinite(size)||size<=0||!atlases[bank])throw Error('Invalid player mouth draw');
  const frame=Math.round(unit(closure)*(FRAME_COUNT-1));
  ctx.drawImage(atlases[bank],frame%ATLAS_COLUMNS*CELL,
    Math.floor(frame/ATLAS_COLUMNS)*CELL,CELL,CELL,-size/2,-size/2,size,size);
}
