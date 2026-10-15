// Hidden-material texture preparation. Approved sprites are never
// modified: only RGB inside fixed eye/scale footprints is harmonically filled.
import {SIDE_SEAM,REAR_SEAM} from './anatomy.js';

const clamp=x=>Math.max(0,Math.min(1,x));
function validate(size,direction,closure){
  if(![80,160].includes(size)||!['right','left','up','down'].includes(direction)||!Number.isFinite(closure))throw Error('Invalid clean-cap pose');
}
function sideSeam(x){for(let i=1;i<SIDE_SEAM.length;i++)if(x<=SIDE_SEAM[i][0]){const a=SIDE_SEAM[i-1],b=SIDE_SEAM[i],t=clamp((x-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*t;}return SIDE_SEAM.at(-1)[1];}
const inside=(x,y,cx,cy,rx,ry)=>((x-cx)/(rx*1.08+3/160))**2+((y-cy)/(ry*1.08+3/160))**2<=1;
export function createCleanCapMask(size,direction,closure=0){
  validate(size,direction,closure);closure=clamp(closure);
  const mask=new Uint8Array(size*size),domain=new Uint8Array(size*size),lift=6*(1-closure);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,actualX=(x+.5)/size,py=(y+.5)/size;
    if(direction==='down')continue;
    const px=direction==='left'?1-actualX:actualX,rawX=80+(px*160-80)/1.125;
    if(direction==='up'){
      const seam=REAR_SEAM[Math.max(0,Math.min(159,Math.floor(rawX)))]+lift;
      domain[i]=py*160<seam-1?1:2;
      const sy=py-lift/160;
      // The authored rear cap moves only the part above its measured seam.
      // Union the stationary and lifted footprints; solve each pigment region
      // separately so a hidden scale never borrows the jaw's different color.
      mask[i]=[py,sy].some(v=>inside(px,v,.066,.496,.073,.083)||inside(px,v,.069,.600,.068,.077)||
        inside(px,v,.918,.491,.073,.083)||inside(px,v,.913,.593,.068,.077))?1:0;
    }else{
      domain[i]=py*160<sideSeam(rawX)-1?1:2;
      mask[i]=(domain[i]===1&&inside(px,py,.585,.414,.163,.151))||inside(px,py,.183594,.494750,.086,.072)||
        inside(px,py,.163970,.576875,.075,.064)?1:0;
    }
  }
  return{mask,domain};
}

export function harmonicCapFill(data,size,inputMask,domain,{maxIterations=600,tolerance=.03}={}){
  if(!Number.isInteger(size)||size<2||size>160||!data||data.length!==size*size*4||
    !inputMask||inputMask.length!==size*size||!domain||domain.length!==size*size||
    !Number.isInteger(maxIterations)||maxIterations<1||maxIterations>2000||!Number.isFinite(tolerance)||tolerance<=0)throw Error('Invalid harmonic-cap input');
  const output=new Uint8ClampedArray(data),mask=new Uint8Array(inputMask),valid=new Uint8Array(mask.length),neighbors=new Array(mask.length);
  const indices=[],values=new Float32Array(mask.length*3);
  for(let i=0;i<mask.length;i++){
    if(!domain[i]||data[i*4+3]<32)mask[i]=0;
    valid[i]=domain[i]&&(mask[i]||data[i*4+3]>=128)?1:0;
    for(let c=0;c<3;c++)values[i*3+c]=data[i*4+c];
  }
  const adjacentTo=i=>{
    const x=i%size,y=Math.floor(i/size),adjacent=[];
    if(x>0&&valid[i-1]&&domain[i-1]===domain[i])adjacent.push(i-1);if(x+1<size&&valid[i+1]&&domain[i+1]===domain[i])adjacent.push(i+1);
    if(y>0&&valid[i-size]&&domain[i-size]===domain[i])adjacent.push(i-size);if(y+1<size&&valid[i+size]&&domain[i+size]===domain[i])adjacent.push(i+size);
    return adjacent;
  };
  // Each hole needs its own fixed local boundary. Disconnected alpha islands
  // with no donor are left untouched, never initialized from another component.
  const seen=new Uint8Array(mask.length);
  for(let seed=0;seed<mask.length;seed++)if(mask[seed]&&!seen[seed]){
    const component=[seed],boundary=new Set();seen[seed]=1;
    for(let at=0;at<component.length;at++){
      const i=component[at],adjacent=adjacentTo(i);neighbors[i]=adjacent;
      for(const j of adjacent){
        if(!mask[j])boundary.add(j);
        else if(!seen[j]){seen[j]=1;component.push(j);}
      }
    }
    if(!boundary.size){for(const i of component){mask[i]=0;valid[i]=0;}continue;}
    const mean=[0,0,0];
    for(const j of boundary)for(let c=0;c<3;c++)mean[c]+=data[j*4+c]/boundary.size;
    for(const i of component){indices.push(i);for(let c=0;c<3;c++)values[i*3+c]=mean[c];}
  }
  if(!indices.length)return{data:output,mask,holes:0,iterations:0,maxDelta:0,changedPixels:0,converged:true};
  let iterations=0,maxDelta=0;
  // Red/black SOR keeps the boundary fixed and converges to a smooth harmonic
  // extension of THIS drawing's cap lighting; no foreign palette or flat stamp.
  for(;iterations<maxIterations;iterations++){
    maxDelta=0;
    for(let parity=0;parity<2;parity++)for(const i of indices){
      if((i%size+Math.floor(i/size))%2!==parity)continue;
      const adjacent=neighbors[i];
      for(let c=0;c<3;c++){
        let sum=0;for(const j of adjacent)sum+=values[j*3+c];
        const at=i*3+c,old=values[at],next=old+1.65*(sum/adjacent.length-old);
        values[at]=next;maxDelta=Math.max(maxDelta,Math.abs(next-old));
      }
    }
    if(maxDelta<tolerance){iterations++;break;}
  }
  let changedPixels=0;
  for(const i of indices){let changed=false;for(let c=0;c<3;c++){output[i*4+c]=Math.round(Math.max(0,Math.min(255,values[i*3+c])));changed||=output[i*4+c]!==data[i*4+c];}if(changed)changedPixels++;}
  return{data:output,mask,holes:indices.length,iterations,maxDelta,changedPixels,converged:maxDelta<tolerance};
}
export function createCleanCapPixels({data,size,direction,closure=0}){
  validate(size,direction,closure);
  const {mask,domain}=createCleanCapMask(size,direction,closure);
  return harmonicCapFill(data,size,mask,domain);
}
