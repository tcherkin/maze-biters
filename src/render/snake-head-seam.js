// Compact-atlas adaptation of the accepted BODY-SIDE-ONLY neck blend.
// The wavy line, head silhouette/alpha, face and every jaw pose are protected.
const LIMITS=[[34,0],[38,4],[40,6],[44,9],[48,11],[52,13],[56,14],[60,15],
  [64,17],[72,17],[76,17],[80,16],[84,14],[88,12],[90,9],[94,4],[98,2],[102,0]];
const smooth=t=>t*t*t*(10+t*(-15+6*t));
export function napeBodyBoundary(y){
  if(y<=34||y>=102)return 0;
  for(let i=1;i<LIMITS.length;i++)if(y<=LIMITS[i][0]){
    const [a,x]=LIMITS[i-1],[b,z]=LIMITS[i];return Math.floor(x+(z-x)*(y-a)/(b-a));}
  return 0;
}
export function compactNapeBoundary(y){
  return Math.max(0,Math.floor((Math.min(napeBodyBoundary(y*2),napeBodyBoundary(y*2+1))-2)/2));
}
export function conditionCompactHead(mouth,material,profile){
  const g=mouth.getContext('2d'),pixels=g.getImageData(0,0,mouth.width,mouth.height),data=pixels.data;
  const {crop,image}=material,body=image.getContext('2d').getImageData(crop.x,crop.y,crop.w,crop.h).data;
  const tail=35*(57/160*36)/16,u=(((-profile.skullLength-tail)%36+36)%36)/36;
  const sampleX=u*crop.w-.5,lo=Math.floor(sampleX),f=sampleX-lo;
  const row=(y,c)=>{const yy=Math.max(0,Math.min(crop.h-1,y));
    const at=x=>body[(yy*crop.w+(x+crop.w)%crop.w)*4+c];return at(lo)*(1-f)+at(lo+1)*f;};
  const strip=g.createImageData(8,1);
  for(let frame=0;frame<97;frame++)for(let y=0;y<88;y++){
    const limit=compactNapeBoundary(y);if(!limit)continue;
    const ox=frame%9*112,oy=Math.floor(frame/9)*88;
    const v=((2*y+1)-70)/76+.5,sy=v*crop.h-.5,low=Math.floor(sy),fy=sy-low;
    const start=((oy+y)*mouth.width+ox)*4;strip.data.set(data.subarray(start,start+32));
    for(let x=0;x<limit;x++){
      const weight=1-smooth(x/limit);
      for(let c=0;c<3;c++)strip.data[x*4+c]=data[start+x*4+c]*(1-weight)+(row(low,c)*(1-fy)+row(low+1,c)*fy)*weight;
    }
    // Never re-upload protected semitransparent pixels (premultiplication can
    // otherwise round their original RGB even without intentional editing).
    g.putImageData(strip,ox,oy+y,0,0,limit,1);
  }
  return mouth;
}
