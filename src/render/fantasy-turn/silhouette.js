// A tiny bounded signed-distance cache removes transparent double contours
// during a projection change. Generated once per native mouth silhouette;
// blinking never changes alpha, so it never adds silhouette cache entries.
export function createSilhouetteBuilder(size){
  const count=size*size,inside=new Float32Array(count),outside=new Float32Array(count),diagonal=Math.SQRT2;
  function sweep(d){
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=y*size+x;let v=d[i];
      if(x)v=Math.min(v,d[i-1]+1);
      if(y){v=Math.min(v,d[i-size]+1);if(x)v=Math.min(v,d[i-size-1]+diagonal);if(x+1<size)v=Math.min(v,d[i-size+1]+diagonal);}
      d[i]=v;
    }
    for(let y=size-1;y>=0;y--)for(let x=size-1;x>=0;x--){
      const i=y*size+x;let v=d[i];
      if(x+1<size)v=Math.min(v,d[i+1]+1);
      if(y+1<size){v=Math.min(v,d[i+size]+1);if(x)v=Math.min(v,d[i+size-1]+diagonal);if(x+1<size)v=Math.min(v,d[i+size+1]+diagonal);}
      d[i]=v;
    }
  }
  return rgba=>{
    if(rgba.length!==count*4)throw Error('Invalid silhouette size');
    for(let i=0;i<count;i++){const solid=rgba[i*4+3]>=128;inside[i]=solid?0:size*2;outside[i]=solid?size*2:0;}
    sweep(inside);sweep(outside);
    const result=new Uint8Array(count);
    for(let i=0;i<count;i++){
      const a=rgba[i*4+3]/255,d=a>=.5?outside[i]-.5:.5-inside[i];
      // Preserve the native antialiased contour at the transition boundary.
      result[i]=Math.round(Math.max(0,Math.min(255,128+4*(a>.02&&a<.98?a-.5:d))));
    }
    return result;
  };
}
