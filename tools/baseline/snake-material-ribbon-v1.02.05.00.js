// Approved bite-study surface, driven by LIVE arc-length poses. Simulation,
// occupied cells, route histories and compression are never changed here.
export const BODY_CROP=Object.freeze({x:320,y:211,w:160,h:58});
export const MATERIAL_CROP=Object.freeze({x:160,y:8,w:160,h:58});
const CELL=36,DIAMETER=57/160*CELL,TAIL=35*DIAMETER/16,HEAD=215.5*DIAMETER/76,OVERLAP=.23;
const mod=(a,b)=>((a%b)+b)%b;

export function createRibbonMaterial(image,makeCanvas){
  const source=makeCanvas(160,58),ctx=source.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,320,211,160,58,0,0,160,58);
  const pixels=ctx.getImageData(0,0,160,58).data;
  // Condition only the authored edge rows; retain every central material pixel.
  for(const [row,weight] of [[0,1],[1,1],[2,1],[3,1],[4,.2],[5,.05],
    [53,.1],[54,.5],[55,1],[56,1],[57,1]]){
    const median=[0,1,2].map(c=>Array.from({length:160},(_,x)=>pixels[(row*160+x)*4+c]).sort((a,b)=>a-b)[80]);
    for(let x=0;x<160;x++)for(let c=0;c<3;c++){
      const at=(row*160+x)*4+c;pixels[at]=Math.round(pixels[at]*(1-weight)+median[c]*weight);
    }
  }
  const texture=makeCanvas(480,74),paint=texture.getContext('2d'),data=paint.createImageData(480,74);
  for(let y=0;y<74;y++)for(let x=0;x<480;x++){
    const from=(Math.max(0,Math.min(57,y-8))*160+x%160)*4,to=(y*480+x)*4;
    for(let c=0;c<3;c++)data.data[to+c]=pixels[from+c];data.data[to+3]=255;
  }
  paint.putImageData(data,0,0);source.width=source.height=1;
  return {image:texture,crop:MATERIAL_CROP,surface:makeCanvas(1,1)};
}
export function tailWidth(fraction){
  const u=Math.max(0,Math.min(1,fraction));return u*(1+u*u*(4+u*(-7+3*u)));
}
export function liveMaterialCoordinate(pose,s){
  const nominal=Math.max(.01,pose.length-HEAD-TAIL*(1-pose.solo));
  const rate=nominal/Math.max(.01,nominal-pose.compression);
  return {value:pose.state.frontMaterial-pose.state.materialSign*(HEAD+(pose.rearDistance-s)*rate),
    rate,sign:pose.state.materialSign};
}
export function paintRibbonStrips(ctx,material,pose,start,end,{widthAt=null,pointAt=null,step=null}={}){
  let draws=0;const {image,crop}=material;
  const at=pointAt||((s)=>pose.path.sample(s));
  for(let s=start;s<end-1e-7;){
    const m=liveMaterialCoordinate(pose,s),u=mod(m.value-TAIL,CELL)/CELL;
    const boundary=(m.sign>0?1-u:u||1)*CELL/m.rate;
    let ds=pose.path.ribbonSpan(s,Math.min(end-s,Math.max(.00001,boundary)));
    if(step!=null)ds=Math.min(ds,typeof step==='function'?step(s):step);
    // Curve adapters may conservatively return a larger safe step.
    ds=Math.max(.000001,Math.min(ds,end-s));
    const p=at(s+ds/2),width=DIAMETER*(widthAt?widthAt(s+ds/2):1);
    if(width>.008){
      const sw=ds*m.rate/CELL*crop.w,pad=OVERLAP*m.rate/CELL*crop.w;
      const sx=crop.x+u*crop.w-(m.sign<0?sw:0)-pad;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
      try{
        if(m.sign<0)ctx.scale(-1,1);
        ctx.drawImage(image,sx,crop.y-8,sw+2*pad,crop.h+16,
          -ds/2-OVERLAP,-width/2-width*8/crop.h,ds+2*OVERLAP,width*(1+16/crop.h));
      }finally{ctx.restore();}draws++;
    }
    s+=ds;
  }
  return draws;
}
export function ribbonOutline(pose,start,end,{widthAt=null,pointAt=null}={}){
  const upper=[],lower=[],at=pointAt||((s)=>pose.path.sample(s));
  // Dense boundary samples only; straight texture paint stays batched.
  const count=Math.max(1,Math.ceil((end-start)/.4));
  for(let i=0;i<=count;i++){
    const s=start+(end-start)*i/count,p=at(s),half=DIAMETER*(widthAt?widthAt(s):1)/2;
    const extension=half>.004?(i===0?-OVERLAP:i===count?OVERLAP:0):0;
    const x=p.x+Math.cos(p.angle)*extension,y=p.y+Math.sin(p.angle)*extension;
    const nx=-Math.sin(p.angle)*half,ny=Math.cos(p.angle)*half;
    upper.push({x:x+nx,y:y+ny});lower.push({x:x-nx,y:y-ny});
  }
  return upper.concat(lower.reverse());
}
export function drawMaterialRibbon(destination,material,pose,start,end,options={}){
  if(!(end>start+1e-6))return 0;
  const outline=ribbonOutline(pose,start,end,options);let draws=0;
  const render=(target,resolveTexture=source=>source,{emission=false}={})=>{
    const matrix=target.getTransform();let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const p of outline){const x=matrix.a*p.x+matrix.c*p.y+matrix.e,y=matrix.b*p.x+matrix.d*p.y+matrix.f;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    const x=Math.max(0,Math.floor(minX)-2),y=Math.max(0,Math.floor(minY)-2);
    const width=Math.min(target.canvas.width,Math.ceil(maxX)+2)-x,height=Math.min(target.canvas.height,Math.ceil(maxY)+2)-y;
    if(width<=0||height<=0)return;
    const texture=resolveTexture(material.image);if(!texture)return;
    const surface=material.surface;
    if(surface.width<width)surface.width=width;if(surface.height<height)surface.height=height;
    const ctx=surface.getContext('2d');
    if(ctx.isContextLost?.())throw Error('Snake material surface unavailable');
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
    ctx.fillStyle=emission?'#000':'#101310';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.setTransform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e-x,matrix.f-y);
    try{
      draws+=paintRibbonStrips(ctx,{image:texture,crop:material.crop},pose,start,end,options);
      // Mask in local backing-store pixels. Besides avoiding repeated large
      // coordinates, this works around destination-in culling in 2D rasterizers
      // with negative world translations (cropped captures and reverse paths).
      ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();
      outline.forEach((p,i)=>{
        const px=matrix.a*p.x+matrix.c*p.y+matrix.e-x,py=matrix.b*p.x+matrix.d*p.y+matrix.f-y;
        if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
      });ctx.closePath();
      ctx.globalCompositeOperation='destination-in';ctx.fillStyle='#fff';ctx.fill();
    }finally{ctx.restore();}
    target.save();target.setTransform(1,0,0,1,0,0);
    try{target.drawImage(surface,0,0,width,height,x,y,width,height);}finally{target.restore();}
  };
  // Normal and post-DUSK emission each paint the CURRENT silhouette using
  // their own transform; never cache a moving compositing surface as art.
  if(typeof destination.paintPreparedSurface==='function')destination.paintPreparedSurface(render);
  else render(destination,options.resolveTexture, {emission:!!options.emission});
  return draws;
}
