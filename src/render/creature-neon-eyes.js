import {createAggressionEyeSchedule} from './neon-aggression-schedule.js?v=1.02.06.00';
import {FRONT_PAIRS,FAR_EYE} from './dragon-turn/anatomy.js?v=1.02.15.02';

const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const eyePairs=FRONT_PAIRS.slice(12,30);
const SIDE_EYE=eyePairs.filter((_,i)=>!(i%2)).map((p,i)=>[p[0],p[1],eyePairs[i*2+1][1]]);
const NEAR_EYE=eyePairs.filter((_,i)=>!(i%2)).map((p,i)=>[p[2],p[3],eyePairs[i*2+1][3]]);
function aperture(curve,x,y,blink){
  if(blink>=24||x<curve[0][0]||x>curve.at(-1)[0])return 0;
  let i=1;while(i<curve.length-1&&x>curve[i][0])i++;
  const a=curve[i-1],b=curve[i],u=(x-a[0])/(b[0]-a[0]);
  const top=a[1]+u*(b[1]-a[1]),bottom=a[2]+u*(b[2]-a[2]),shut=top+(bottom-top)*.76;
  const upper=top+(shut-top)*blink/24,lower=bottom-(bottom-shut)*blink/24;
  return smooth((y-upper)/.65)*smooth((lower-y)/.65);
}

// These are source-art iris cores, not logical-direction draw anchors. Their
// masks subsequently travel through the accepted Dragon cage and ownership.
// Coordinates precede the approved centered 1.125 horizontal artwork fit.
const IRIS_SIDE=[101.07191,68.90621,8.4,10.5];
const IRIS_NEAR=[47.37404,66.74610,7.5,10.5];
const IRIS_FAR=[160-47.37404,66.74610,7.5,10.5];
export function createHunterEyeMasks({arts,makeCanvas}){
  const entries=new Map(),resources=[],listeners=[];let valid=true,disposed=false,reads=0,bytes=0;
  const allocate=(w,h)=>{const c=makeCanvas(w,h);c.width=w;c.height=h;resources.push(c);
    const lost=()=>{valid=false;};c.addEventListener?.('contextlost',lost);listeners.push([c,lost]);return c;};
  try{
    for(const [key,art]of arts){
      if(art.direction==='up'){entries.set(key,null);continue;}
      const s=art.size,scale=s/160,mirror=art.direction==='left';
      const eyes=art.direction==='down'?[[IRIS_NEAR,NEAR_EYE],[IRIS_FAR,FAR_EYE]]:[[IRIS_SIDE,SIDE_EYE]];
      const temporary=makeCanvas(s,s);temporary.width=temporary.height=s;
      let pixels;
      try{const ctx=temporary.getContext('2d',{willReadFrequently:true});
        if(!ctx)throw Error('Hunter eye source unavailable');ctx.drawImage(art.base,0,0,s,s);
        pixels=ctx.getImageData(0,0,s,s).data;reads++;
      }finally{temporary.width=temporary.height=1;}
      const minX=Math.floor(Math.min(...eyes.map(([e])=>80+(e[0]-e[2]-80)*1.125))*scale)-1;
      const maxX=Math.ceil(Math.max(...eyes.map(([e])=>80+(e[0]+e[2]-80)*1.125))*scale)+1;
      const x0=mirror?s-maxX:minX,y0=Math.floor(54*scale),w=maxX-minX,h=Math.ceil(29*scale);
      const bank=allocate(w*5,h*5),ctx=bank.getContext('2d');if(!ctx)throw Error('Hunter eye bank unavailable');
      const image=ctx.createImageData(w*5,h*5);
      for(let frame=0;frame<24;frame++)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const px=x0+x,py=y0+y;if(px<0||py<0||px>=s||py>=s)continue;
        let rawX=(px+.5)/scale;if(mirror)rawX=160-rawX;rawX=80+(rawX-80)/1.125;
        const rawY=(py+.5)/scale;let mask=0;
        for(const [e,curve]of eyes){const distance=Math.hypot((rawX-e[0])/e[2],(rawY-e[1])/e[3]);
          mask=Math.max(mask,(1-smooth((distance-.65)/.35))*aperture(curve,rawX,rawY,frame));}
        const p=(py*s+px)*4;
        // Bright authored iris pigment survives; the dark pupil and socket do
        // not become a painted disk. Palette shifts never move the core.
        const pigment=smooth((Math.max(pixels[p],pixels[p+1],pixels[p+2])-75)/115);
        const alpha=Math.round(pixels[p+3]*mask*pigment);
        const d=(((Math.floor(frame/5)*h+y)*w*5)+(frame%5)*w+x)*4;
        image.data[d]=image.data[d+1]=image.data[d+2]=255;image.data[d+3]=alpha;
      }
      ctx.putImageData(image,0,0);bytes+=bank.width*bank.height*4;entries.set(key,{bank,x:x0,y:y0,w,h,size:s});
    }
  }catch(error){for(const [c,l]of listeners)c.removeEventListener?.('contextlost',l);for(const c of resources)c.width=c.height=1;throw error;}
  return {
    draw(ctx,variant,direction,blink,x,y,size){
      if(!valid||disposed||ctx?.isContextLost?.())return false;
      const entry=entries.get(`${variant}:${direction}`);if(!entry)return direction==='up';
      const frame=Math.max(0,Math.min(24,Math.round(blink*24))),{bank,w,h}=entry;
      ctx.drawImage(bank,(frame%5)*w,Math.floor(frame/5)*h,w,h,x+entry.x*size/entry.size,y+entry.y*size/entry.size,w*size/entry.size,h*size/entry.size);return true;
    },
    dispose(){if(disposed)return;disposed=true;valid=false;for(const [c,l]of listeners)c.removeEventListener?.('contextlost',l);for(const c of resources)c.width=c.height=1;entries.clear();},
    diagnostics:()=>({ready:valid&&!disposed,sourceReads:reads,runtimePixelReads:0,banks:resources.length,bytes:disposed?0:bytes}),
    get valid(){return valid&&!disposed;}
  };
}

// Reuse the complete accepted projection and paint ownership. The only
// substitutions are the paint payload (white eye alpha) and cap/ear pigment.
// The original renderer's art shader is never changed or replaced.
export function dragonEyeFragment(source){
  const replace=(from,to)=>{if(source.split(from).length!==2)throw Error('Dragon eye shader anatomy changed');source=source.replace(from,to);};
  replace('uniform sampler2D uEnd;','uniform sampler2D uEnd;\nuniform sampler2D uSideMask;\nuniform sampler2D uEndMask;');
  replace('  vec4 paint;',`  a.rgb=vec3(texture2D(uSideMask,vec2(mix(aligned.x,1.0-aligned.x,uMirror),aligned.y)).a)*a.a;
  b.rgb=vec3(texture2D(uEndMask,rearUV).a)*b.a;
  vec4 paint;`);
  replace('    a=cleanScaleSource(a,vec2(mix(aligned.x,1.0-aligned.x,uMirror),aligned.y));','');
  replace('    b=cleanScaleRear(b,rearUV);','');
  replace('  if(uBack>.5)cylindricalCrown(vec2(vPositionX,vY),uvA,paint,distance);','');
  replace('  gl_FragColor=vec4(paint.rgb/max(paint.a,.001)*alpha,alpha);','  float eyeAlpha=clamp(paint.r/max(paint.a,.001),0.0,1.0)*alpha;\n  gl_FragColor=vec4(eyeAlpha);');
  return source;
}

const ATLAS=new URL('../../animation-lib/scorpion-turn-study/assets/scorpion.png',import.meta.url);
const REAR=48,SPAN=176,TOP=40,HEIGHT=80,STRIPS=32,STEP=SPAN/STRIPS;
async function defaultLoad(url){const image=new Image();image.src=url.href;await image.decode();return image;}
// This is the same overlapping ribbon triangulation as bent-art.js. It maps
// the single authored cyan head mark, which belongs to the flexible shell.
function expand(out,i,x,y,px,py,nx,ny,scale){
  const dx=x-px,dy=y-py,ex=nx-x,ey=ny-y,inv=1/Math.hypot(dx,dy),invN=1/Math.hypot(ex,ey);
  const ax=dy*inv,ay=-dx*inv,bx=ey*invN,by=-ex*invN;
  let amount=.16*scale/Math.max(1e-8,1+ax*bx+ay*by),length=Math.hypot(ax+bx,ay+by)*amount;
  if(length>.6*scale)amount*=.6*scale/length;
  out[i]=x+(ax+bx)*amount;out[i+1]=y+(ay+by)*amount;
}
function triangle(ctx,image,scratch,scale,ax,ay,bx,by,cx,cy,a,b,c,d,e,f){
  expand(scratch,0,ax,ay,cx,cy,bx,by,scale);expand(scratch,2,bx,by,ax,ay,cx,cy,scale);expand(scratch,4,cx,cy,bx,by,ax,ay,scale);
  ctx.save();try{ctx.beginPath();ctx.moveTo(scratch[0],scratch[1]);ctx.lineTo(scratch[2],scratch[3]);ctx.lineTo(scratch[4],scratch[5]);ctx.closePath();ctx.clip();
    ctx.transform(a,b,c,d,e,f);ctx.drawImage(image,0,0);
  }finally{ctx.restore();}
}
export function createCreatureNeonEyes({makeCanvas,loadImage=defaultLoad}={}){
  if(typeof makeCanvas!=='function')throw new TypeError('Creature eyes need a canvas factory');
  let states={hunter:new WeakMap(),scorpion:new WeakMap()},serial={hunter:0,scorpion:0},masks=[],maskContexts=[],listeners=[],preparing=null,valid=false,failed=false,disposed=false,generation=0;
  let observations=0,events=0,created=0,missing=0,clockRestarts=0,draws=0,failures=0,sourceReads=0,lastError=null,resets=0;
  const edges=new Float64Array((STRIPS+1)*4),scratch=new Float64Array(6),point={};
  function release(){for(const [c,l]of listeners)c.removeEventListener?.('contextlost',l);listeners=[];for(const c of masks)c.width=c.height=1;masks=[];maskContexts=[];valid=false;}
  function pollContexts(){if(valid&&maskContexts.some(ctx=>ctx.isContextLost?.()))valid=false;}
  function prepare(){
    pollContexts();
    if(disposed||failed)return Promise.resolve(false);if(valid)return Promise.resolve(true);if(preparing)return preparing;
    const token=++generation;
    preparing=Promise.resolve().then(()=>loadImage(ATLAS)).then(atlas=>{
      if(token!==generation||disposed)return false;
      if((atlas.naturalWidth||atlas.width)!==2560||(atlas.naturalHeight||atlas.height)!==160)throw Error('Invalid scorpion eye source');
      const next=[];
      try{for(let frame=0;frame<2;frame++){
        const c=makeCanvas(SPAN,HEIGHT);c.width=SPAN;c.height=HEIGHT;next.push(c);
        const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Scorpion eye source unavailable');
        ctx.drawImage(atlas,(frame*8+2)*160,0,160,160,160-REAR,-TOP,160,160);
        const pixels=ctx.getImageData(0,0,SPAN,HEIGHT);sourceReads++;
        for(let y=0;y<HEIGHT;y++)for(let x=0;x<SPAN;x++){
          const i=(y*SPAN+x)*4,rawX=x+REAR-160+.5,rawY=y+TOP+.5;
          const ellipse=1-smooth((Math.hypot((rawX-53)/10,(rawY-79)/8)-.65)/.35);
          const cyan=smooth((pixels.data[i+1]-pixels.data[i]-25)/90)*smooth((pixels.data[i+2]-150)/80);
          pixels.data[i+3]=Math.round(pixels.data[i+3]*ellipse*cyan);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;
        }ctx.putImageData(pixels,0,0);
      }}catch(error){for(const c of next)c.width=c.height=1;throw error;}
      release();masks=next;maskContexts=masks.map(c=>c.getContext('2d'));valid=true;lastError=null;
      for(const c of masks){const lost=()=>{valid=false;};c.addEventListener?.('contextlost',lost);listeners.push([c,lost]);}return true;
    }).catch(error=>{
      if(token===generation&&!disposed){failed=true;failures++;lastError=String(error?.message||error);}
      return false;
    }).finally(()=>{if(token===generation)preparing=null;});
    return preparing;
  }
  function observe(entity,now,kind){
    if(disposed||!states[kind]||!entity||(typeof entity!=='object'&&typeof entity!=='function')||!Number.isFinite(now))return 0;
    if(!Number.isFinite(entity.brainAggression)){missing++;return 0;}
    let state=states[kind].get(entity),fresh=false;const attention=clamp(entity.brainAggression);
    if(!state||now<state.lastTime){
      const seed=state?.seed??((Math.imul(++serial[kind],0x9e3779b9)^(kind==='hunter'?0x4b1d7301:0x73c06921))>>>0);
      if(state)clockRestarts++;else created++;
      state={seed,origin:now,lastTime:now,aggression:0,level:0,events:0,schedule:createAggressionEyeSchedule([0],seed)};states[kind].set(entity,state);fresh=true;
    }
    if(fresh||now>state.lastTime){const local=now-state.origin;
      if(fresh||attention!==state.aggression)state.schedule.setAggression(0,attention,local);
      state.schedule.update(local);state.level=state.schedule.level(0,local);
      const count=state.schedule.eventCount(0);events+=Math.max(0,count-state.events);state.events=count;state.lastTime=now;state.aggression=attention;
    }observations++;return state.level;
  }
  function drawScorpionMask(ctx,pose,tile){
    pollContexts();
    if(!valid||disposed||!pose?.sample||!(tile>0)||ctx?.isContextLost?.()){if(!valid&&!disposed)prepare();return false;}
    try{
      const image=masks[pose.frame&1],scale=tile/160,half=HEIGHT*scale/2;let straight=true,firstX=0,firstY=0;
      for(let i=0;i<=STRIPS;i++){
        pose.sample((REAR+i*STEP-160)*scale,point);
        if(i===0){firstX=point.tx;firstY=point.ty;}else if(Math.abs(point.tx-firstX)>1e-8||Math.abs(point.ty-firstY)>1e-8)straight=false;
        const j=i*4;edges[j]=point.x+point.ty*half;edges[j+1]=point.y-point.tx*half;edges[j+2]=point.x-point.ty*half;edges[j+3]=point.y+point.tx*half;
      }
      if(straight){pose.sample((REAR-160)*scale,point);ctx.save();try{ctx.translate(point.x,point.y);ctx.rotate(point.angle);ctx.drawImage(image,0,-HEIGHT*scale/2,SPAN*scale,HEIGHT*scale);}finally{ctx.restore();}}
      else for(let i=28;i<STRIPS;i++){
        const j=i*4,n=j+4,sx=i*STEP,ax=edges[j],ay=edges[j+1],dx=edges[j+2],dy=edges[j+3],bx=edges[n],by=edges[n+1],cx=edges[n+2],cy=edges[n+3];
        const a=(bx-ax)/STEP,b=(by-ay)/STEP,c=(cx-dx)/STEP,d=(cy-dy)/STEP;
        triangle(ctx,image,scratch,tile/36,ax,ay,bx,by,cx,cy,a,b,(cx-bx)/HEIGHT,(cy-by)/HEIGHT,ax-a*sx,ay-b*sx);
        triangle(ctx,image,scratch,tile/36,ax,ay,cx,cy,dx,dy,c,d,(dx-ax)/HEIGHT,(dy-ay)/HEIGHT,ax-c*sx,ay-d*sx);
      }
      draws++;return true;
    }catch(error){failures++;lastError=String(error?.message||error);return false;}
  }
  function reset(){states={hunter:new WeakMap(),scorpion:new WeakMap()};serial={hunter:0,scorpion:0};observations=events=created=missing=clockRestarts=draws=0;
    // A failed immutable atlas is retried only at a deliberate level/context
    // reset, not by warmup's repeated per-frame prepare() observations.
    failed=false;lastError=null;resets++;}
  return {prepare,observe,drawScorpionMask,reset,dispose(){if(disposed)return;disposed=true;generation++;preparing=null;reset();release();},
    diagnostics:()=>({ready:valid&&!disposed,failed,disposed,observations,events,created,missing,clockRestarts,draws,failures,lastError,resets,sourceReads,runtimePixelReads:0,gameplayRandomCalls:0,maskBytes:valid?2*SPAN*HEIGHT*4:0})};
}
