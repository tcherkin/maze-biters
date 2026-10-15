// Accepted authored-eye light. No sprite, AI or head-motion changes.
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};

export function glintEnvelope(elapsed,duration){
  if(!(duration>0)||elapsed<=0||elapsed>=duration)return 0;
  const t=elapsed/duration;
  return t<.38?smooth(t/.38):1-smooth((t-.38)/.62);
}

// Retained for isolated material previews. Production uses the aggression
// scheduler; even this optional preview never consumes gameplay randomness.
export function createEyeGlintSchedule(count=5,seed=0x51e7){
  let randomState=seed>>>0,lastPreview=-Infinity;
  const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  const gap=()=>4000+random()*8000;
  const entries=Array.from({length:count},()=>({next:gap(),start:-Infinity,duration:800,events:0}));
  function start(entry,now){entry.start=now;entry.duration=760+random()*140;entry.events++;entry.next=now+gap();}
  return {
    update(now){for(const entry of entries){if(entry.next>now)continue;if(now-entry.next>entry.duration){entry.next=now+gap();continue;}start(entry,now);}},
    level(index,now){const e=entries[index];return e?glintEnvelope(now-e.start,e.duration):0;},
    preview(index,now){if(!entries[index]||now-lastPreview<1500||now<entries[index].start+entries[index].duration)return false;lastPreview=now;start(entries[index],now);return true;},
    snapshot:now=>entries.map((e,index)=>({...e,index,level:glintEnvelope(now-e.start,e.duration)}))
  };
}

export const EYE_REGION=Object.freeze({x:49,y:17,width:20,height:13,cx:59.2,cy:23,rx:5.8,ry:4.8});
export function eyeMaskPixels(source){
  const r=EYE_REGION;
  if(source.length!==r.width*r.height*4)throw new TypeError('Expected the authored eye crop');
  const output=new Uint8ClampedArray(source.length);
  for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
    const i=(y*r.width+x)*4,d=Math.hypot((r.x+x+.5-r.cx)/r.rx,(r.y+y+.5-r.cy)/r.ry);
    const iris=smooth((Math.min(source[i],source[i+1])-85)/100),edge=1-smooth((d-.66)/.34);
    output[i]=255;output[i+1]=247;output[i+2]=214;
    output[i+3]=Math.round(source[i+3]*Math.min(1,iris*edge*1.25));
  }
  return output;
}
export function eyePlacement(head){
  const s=head.sprite,r=EYE_REGION;
  return {x:s.dx+r.x/s.sw*s.dw,y:s.dy+r.y/s.sh*s.dh,width:r.width/s.sw*s.dw,height:r.height/s.sh*s.dh};
}

export function createEyeGlintPainter(art,makeCanvas){
  const r=EYE_REGION,pad=10,mask=makeCanvas(r.width,r.height),fringe=makeCanvas(r.width+pad*2,r.height+pad*2);
  const mc=mask.getContext('2d',{willReadFrequently:true}),fc=fringe.getContext('2d');
  let ready=false,disposed=false,draws=0,pixelReads=0,builds=0,failures=0,lastError=null;
  const surfaces=[{canvas:mask,ctx:mc,lost:false},{canvas:fringe,ctx:fc,lost:false}];
  for(const surface of surfaces){
    surface.canvas.addEventListener?.('contextlost',()=>{surface.lost=true;ready=false;});
    surface.canvas.addEventListener?.('contextrestored',()=>{surface.lost=false;ready=false;});
  }
  function available(){
    if(disposed||!art?.image||art.image.width<r.x+r.width||art.image.height<r.y+r.height)return false;
    const sourceContext=art.image.getContext?.('2d');
    if(sourceContext?.isContextLost?.())return false;
    for(const surface of surfaces){
      if(!surface.ctx)return false;
      if(typeof surface.ctx.isContextLost==='function'){
        const lost=surface.ctx.isContextLost();
        if(lost!==surface.lost){surface.lost=lost;ready=false;}
      }
      if(surface.lost)return false;
    }
    return true;
  }
  function textureState(ctx){
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.filter='none';
    ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  }
  function prepare(){
    if(!available())return false;
    if(ready)return true;
    try{
      textureState(mc);mc.drawImage(art.image,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
      const pixels=mc.getImageData(0,0,r.width,r.height);pixelReads++;
      pixels.data.set(eyeMaskPixels(pixels.data));mc.putImageData(pixels,0,0);
      textureState(fc);fc.filter='blur(2.2px)';fc.drawImage(mask,pad,pad);fc.filter='none';
      // The fringe surrounds the iris; its hollow interior cannot fill the
      // original dark pupil/socket, including during the closed-mouth pose.
      fc.globalCompositeOperation='destination-out';fc.beginPath();
      fc.ellipse(pad+r.cx-r.x,pad+r.cy-r.y,r.rx,r.ry,0,0,Math.PI*2);fc.fill();
      fc.globalCompositeOperation='source-over';ready=true;builds++;lastError=null;return true;
    }catch(error){ready=false;failures++;lastError=String(error?.message||error);return false;}
  }
  return {
    draw(ctx,head,level){
      if(!head?.sprite||!(level>0)||!Number.isFinite(level)||head.alpha<=0||ctx?.isContextLost?.())return false;
      const p=eyePlacement(head);
      if(![head.x,head.y,head.angle,p.x,p.y,p.width,p.height].every(Number.isFinite)||p.width<=0||p.height<=0||!prepare())return false;
      ctx.save();
      try{
        ctx.translate(head.x,head.y);ctx.rotate(head.angle);
        const alpha=ctx.globalAlpha*clamp(level)*clamp(Number.isFinite(head.alpha)?head.alpha:1);
        ctx.globalCompositeOperation='screen';ctx.globalAlpha=alpha*.62;
        const sx=p.width/r.width,sy=p.height/r.height;
        ctx.drawImage(fringe,p.x-pad*sx,p.y-pad*sy,fringe.width*sx,fringe.height*sy);
        ctx.globalAlpha=alpha*.98;ctx.drawImage(mask,p.x,p.y,p.width,p.height);draws++;return true;
      }catch(error){ready=false;failures++;lastError=String(error?.message||error);return false;}
      finally{ctx.restore();}
    },
    dispose(){if(disposed)return;disposed=true;ready=false;for(const surface of surfaces)surface.canvas.width=surface.canvas.height=1;},
    stats:()=>({draws,pixelReads,builds,failures,lastError,ready,disposed,
      cachedBytes:disposed?0:(r.width*r.height+fringe.width*fringe.height)*4,sourceFrame:0,softFringe:true})
  };
}
