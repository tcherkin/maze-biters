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

// A borrowed buffer is held across all synchronous prepared destinations.
// Reentrant paints borrow another buffer, so nested captures cannot overwrite
// a command list that an outer normal/emission pair has not finished replaying.
const freeBuffers=[];
const STRIDE=11;
function borrowBuffer(){return freeBuffers.pop()||{outline:new Float64Array(0),transformed:new Float64Array(0),commands:new Float64Array(0),point:{},count:0,vertices:0,sign:1};}
function capacity(buffer,key,size){
  if(buffer[key].length>=size)return;
  const next=new Float64Array(Math.max(size,256,buffer[key].length*2));
  next.set(buffer[key]);buffer[key]=next;
}
function sampleAt(pose,pointAt,s,out){return pointAt?pointAt(s,out):pose.path.sample(s,out);}
function prepareOutline(buffer,pose,start,end,{widthAt=null,pointAt=null}={}){
  const count=Math.max(1,Math.ceil((end-start)/.4)),vertices=2*(count+1);
  capacity(buffer,'outline',vertices*2);buffer.vertices=vertices;
  const outline=buffer.outline;
  for(let i=0;i<=count;i++){
    const s=start+(end-start)*i/count,p=sampleAt(pose,pointAt,s,buffer.point),half=DIAMETER*(widthAt?widthAt(s):1)/2;
    const extension=half>.004?(i===0?-OVERLAP:i===count?OVERLAP:0):0;
    const x=p.x+Math.cos(p.angle)*extension,y=p.y+Math.sin(p.angle)*extension;
    const nx=-Math.sin(p.angle)*half,ny=Math.cos(p.angle)*half;
    const upper=i*2,lower=(vertices-1-i)*2;
    outline[upper]=x+nx;outline[upper+1]=y+ny;
    outline[lower]=x-nx;outline[lower+1]=y-ny;
  }
}
function prepareStrips(buffer,material,pose,start,end,{widthAt=null,pointAt=null,step=null}={}){
  const {crop}=material,nominal=Math.max(.01,pose.length-HEAD-TAIL*(1-pose.solo));
  const rate=nominal/Math.max(.01,nominal-pose.compression),sign=pose.state.materialSign;
  buffer.count=0;buffer.sign=sign;
  for(let s=start;s<end-1e-7;){
    const value=pose.state.frontMaterial-sign*(HEAD+(pose.rearDistance-s)*rate),u=mod(value-TAIL,CELL)/CELL;
    const boundary=(sign>0?1-u:u||1)*CELL/rate;
    let ds=pose.path.ribbonSpan(s,Math.min(end-s,Math.max(.00001,boundary)));
    if(step!=null)ds=Math.min(ds,typeof step==='function'?step(s):step);
    ds=Math.max(.000001,Math.min(ds,end-s));
    const p=sampleAt(pose,pointAt,s+ds/2,buffer.point),width=DIAMETER*(widthAt?widthAt(s+ds/2):1);
    if(width>.008){
      const sw=ds*rate/CELL*crop.w,pad=OVERLAP*rate/CELL*crop.w;
      const sx=crop.x+u*crop.w-(sign<0?sw:0)-pad;
      const at=buffer.count*STRIDE;capacity(buffer,'commands',at+STRIDE);
      const commands=buffer.commands;
      commands[at]=p.x;commands[at+1]=p.y;commands[at+2]=p.angle;
      commands[at+3]=sx;commands[at+4]=crop.y-8;commands[at+5]=sw+2*pad;commands[at+6]=crop.h+16;
      commands[at+7]=-ds/2-OVERLAP;commands[at+8]=-width/2-width*8/crop.h;
      commands[at+9]=ds+2*OVERLAP;commands[at+10]=width*(1+16/crop.h);
      buffer.count++;
    }
    s+=ds;
  }
}
function replayStrips(ctx,image,buffer){
  if(ctx.drawRibbonStrips)return ctx.drawRibbonStrips(image,buffer.commands,buffer.count,buffer.sign);
  const commands=buffer.commands;
  for(let i=0;i<buffer.count;i++){
    const at=i*STRIDE;
    ctx.save();ctx.translate(commands[at],commands[at+1]);ctx.rotate(commands[at+2]);
    try{
      if(buffer.sign<0)ctx.scale(-1,1);
      ctx.drawImage(image,commands[at+3],commands[at+4],commands[at+5],commands[at+6],
        commands[at+7],commands[at+8],commands[at+9],commands[at+10]);
    }finally{ctx.restore();}
  }
  return buffer.count;
}
export function paintRibbonStrips(ctx,material,pose,start,end,options={}){
  const buffer=borrowBuffer();
  try{prepareStrips(buffer,material,pose,start,end,options);return replayStrips(ctx,material.image,buffer);}
  finally{freeBuffers.push(buffer);}
}
export function ribbonOutline(pose,start,end,options={}){
  const buffer=borrowBuffer();
  try{
    prepareOutline(buffer,pose,start,end,options);
    return Array.from({length:buffer.vertices},(_,i)=>({x:buffer.outline[i*2],y:buffer.outline[i*2+1]}));
  }finally{freeBuffers.push(buffer);}
}
export function drawMaterialRibbon(destination,material,pose,start,end,options={}){
  if(!(end>start+1e-6))return 0;
  const buffer=borrowBuffer();let draws=0,prepared=false;
  try{
    prepareOutline(buffer,pose,start,end,options);
    const outline=buffer.outline,vertices=buffer.vertices;
    const render=(target,resolveTexture=source=>source,{emission=false,occlusion=false}={})=>{
      const matrix=target.getTransform();let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      capacity(buffer,'transformed',vertices*2);const transformed=buffer.transformed;
      let retained=0;
      for(let i=0;i<vertices;i++){
        const px=outline[i*2],py=outline[i*2+1];
        const x=matrix.a*px+matrix.c*py+matrix.e,y=matrix.b*px+matrix.d*py+matrix.f;
        minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
        // Keep the accepted samples, removing only exact screen-axis redundant
        // points. General diagonal collinearity is not pixel-exact in Canvas
        // rasterizers, where replacing short edges can change AA coverage.
        while(retained>=2){
          const a=(retained-2)*2,b=(retained-1)*2;
          const dx=transformed[b]-transformed[a],dy=transformed[b+1]-transformed[a+1];
          const nextX=x-transformed[b],nextY=y-transformed[b+1];
          if(!((dx===0&&nextX===0)||(dy===0&&nextY===0))||dx*nextX+dy*nextY<0)break;
          retained--;
        }
        transformed[retained*2]=x;transformed[retained*2+1]=y;retained++;
      }
      const x=Math.max(0,Math.floor(minX)-2),y=Math.max(0,Math.floor(minY)-2);
      const width=Math.min(target.canvas.width,Math.ceil(maxX)+2)-x,height=Math.min(target.canvas.height,Math.ceil(maxY)+2)-y;
      if(width<=0||height<=0)return;
      // Alpha-only captures have no texture to assemble. Paint the same
      // transformed polygon directly, with one antialiased silhouette, instead
      // of clearing, rasterizing and blitting a temporary bounding rectangle.
      // The destination's alpha, composite operation and clip remain intact.
      // This alpha-only receiver path removes an intermediate 8-bit mask.
      // Native AA can consequently differ by a few alpha levels at clipped
      // edges; the visible and emitted material below are unchanged.
      if(occlusion&&target.fillRibbon){target.save();target.fillStyle='#fff';target.fillRibbon(outline,vertices,matrix);target.restore();return;}
      if(occlusion){
        target.save();target.setTransform(1,0,0,1,0,0);
        try{
          target.beginPath();
          for(let i=0;i<retained;i++){
            const px=transformed[i*2],py=transformed[i*2+1];
            if(i)target.lineTo(px,py);else target.moveTo(px,py);
          }
          target.closePath();target.fillStyle='#fff';target.fill();
        }finally{target.restore();}
        return;
      }
      const texture=occlusion?null:resolveTexture(material.image);if(!occlusion&&!texture)return;
      if(!occlusion&&!prepared){prepareStrips(buffer,material,pose,start,end,options);prepared=true;}
      const surface=target.canvas?._gpu?globalThis.__gpu2d.ribbonSurface(width,height):material.surface;
      if(surface.width<width)surface.width=width;if(surface.height<height)surface.height=height;
      const ctx=surface.getContext('2d');
      if(ctx.isContextLost?.())throw Error('Snake material surface unavailable');
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
      if(!occlusion){ctx.fillStyle=emission?'#000':'#101310';ctx.fillRect(0,0,width,height);}
      ctx.save();ctx.setTransform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e-x,matrix.f-y);
      try{
        if(!occlusion)draws+=replayStrips(ctx,texture,buffer);
        if(ctx.fillRibbon){ctx.globalCompositeOperation='destination-in';ctx.fillStyle='#fff';ctx.fillRibbon(outline,vertices,{...matrix,e:matrix.e-x,f:matrix.f-y});}
        else {ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();
        for(let i=0;i<retained;i++){
          const px=transformed[i*2]-x,py=transformed[i*2+1]-y;
          if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
        }
        ctx.closePath();ctx.globalCompositeOperation=occlusion?'source-over':'destination-in';ctx.fillStyle='#fff';ctx.fill();}
      }finally{ctx.restore();}
      target.save();target.setTransform(1,0,0,1,0,0);
      try{target.drawImage(surface,0,0,width,height,x,y,width,height);}finally{target.restore();}
    };
    if(typeof destination.paintPreparedSurface==='function')destination.paintPreparedSurface(render);
    else render(destination,options.resolveTexture,{emission:!!options.emission});
    return draws;
  }finally{freeBuffers.push(buffer);}
}
