import {getPlayerMouthMesh} from '../../animation-lib/snake-bite-study/player-mouth-mesh.js?v=1.02.03.00';
import {traceAlphaContours,transformContactShape,quantizedContactBreakpoints} from './contact-shapes.js?v=1.02.03.00';

// Presentation only. No controller, movement, collision or actor fields are
// changed here. The engine supplies its existing game-clock milliseconds.
// The integrated scene has 72 palette/light/direction combinations. Retaining
// the isolated demo's 49 full-resolution frames for all of them cost >300MiB.
// Nineteen authored-morph poses at HD sprite resolution keep this visual-only
// feature bounded. Original endpoints still use the active native atlas.
export const LIVE_MOUTH_FRAMES=19;
export const LIVE_MOUTH_CACHE_SIZE=80;
const COLS=1, REFERENCE_SIZE=160, RELEASE_MS=90;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const LEADER_COLORS={p1:'#6dff72',p2:'#66baff',ai:'#ffd85d'};

function validateRaster(raster){
  if(!raster||!Number.isInteger(raster.width)||raster.width<1||
    raster.width!==raster.height||raster.data?.length!==raster.width*raster.height*4)
    throw Error('Mouth source must be a square RGBA raster');
  return raster;
}

export function resampleLiveMouthRaster(raster,size=LIVE_MOUTH_CACHE_SIZE){
  validateRaster(raster);
  if(raster.width===size)return raster;
  const data=new Uint8ClampedArray(size*size*4),sampled=new Float64Array(4),ratio=raster.width/size;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    sample(raster.data,raster.width,(x+.5)*ratio-.5,(y+.5)*ratio-.5,sampled);
    const i=(y*size+x)*4;data[i+3]=Math.round(sampled[3]);
    for(let c=0;c<3;c++)data[i+c]=sampled[3]>0?Math.round(sampled[c]/sampled[3]):0;
  }
  return {width:size,height:size,data};
}

// Coordinates are normalized from the approved 160px anatomical mesh, but
// the actual 80px/160px endpoint pixels are never resized or recolored.
function sample(source,size,x,y,out){
  x=Math.max(0,Math.min(size-1,x));y=Math.max(0,Math.min(size-1,y));
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(size-1,x0+1),y1=Math.min(size-1,y0+1);
  const fx=x-x0,fy=y-y0;out.fill(0);
  for(let iy=0;iy<2;iy++)for(let ix=0;ix<2;ix++){
    const w=(ix?fx:1-fx)*(iy?fy:1-fy),i=((iy?y1:y0)*size+(ix?x1:x0))*4;
    const a=source[i+3]*w;out[3]+=a;
    for(let c=0;c<3;c++)out[c]+=source[i+c]*a;
  }
}

export function makeBackCapBoundary(reference){
  const {width:size,data}=validateRaster(reference),scale=size/REFERENCE_SIZE;
  const boundary=new Int16Array(size);
  for(let x=0;x<size;x++){
    boundary[x]=Math.floor(112*scale);
    for(let y=Math.floor(55*scale);y<=Math.min(size-1,Math.floor(112*scale));y++){
      const i=(y*size+x)*4;
      if(data[i+3]>32&&data[i+1]>12&&data[i+1]>data[i]*1.35){boundary[x]=y-1;break;}
    }
  }
  return boundary;
}

export function morphLiveMouthFrame(openRaster,closedRaster,bank,closure,backBoundary=null){
  const open=validateRaster(openRaster),closed=validateRaster(closedRaster);
  if(open.width!==closed.width||!Number.isInteger(bank)||bank<0||bank>3||!Number.isFinite(closure))
    throw Error('Invalid live mouth frame');
  const size=open.width,t=clamp(closure),scale=size/REFERENCE_SIZE;
  const out=new Uint8ClampedArray(open.data.length);
  if(bank===3){
    const original=closed.data,drop=3*scale*(1-t);
    out.set(original);if(drop===0)return out;
    const bounds=backBoundary||makeBackCapBoundary(closed);
    for(let x=0;x<size;x++){
      const bound=bounds[x];
      for(let y=0;y<=Math.min(size-1,Math.ceil(bound+3*scale));y++){
        const index=(y*size+x)*4,sy=y-drop,low=Math.floor(sy),mix=sy-low;
        const aIndex=low>=0&&low<=bound?(low*size+x)*4:-1;
        const bIndex=low+1>=0&&low+1<=bound?((low+1)*size+x)*4:-1;
        const a=aIndex<0?0:original[aIndex+3]*(1-mix),b=bIndex<0?0:original[bIndex+3]*mix;
        const capAlpha=a+b,baseAlpha=y>bound?original[index+3]:0;
        const remaining=baseAlpha*(1-capAlpha/255),alpha=capAlpha+remaining;
        out[index+3]=Math.round(alpha);
        for(let c=0;c<3;c++)out[index+c]=alpha>0?Math.round(
          ((aIndex<0?0:original[aIndex+c]*a)+(bIndex<0?0:original[bIndex+c]*b)+original[index+c]*remaining)/alpha):0;
      }
    }
    return out;
  }
  if(t===0){out.set(open.data);return out;}
  if(t===1){out.set(closed.data);return out;}
  const mesh=getPlayerMouthMesh(bank);
  const points=mesh.open.map((a,i)=>[(a[0]+(mesh.closed[i][0]-a[0])*t)*scale,
    (a[1]+(mesh.closed[i][1]-a[1])*t)*scale]);
  const aSample=new Float64Array(4),bSample=new Float64Array(4);
  for(const [ia,ib,ic] of mesh.triangles){
    const a=points[ia],b=points[ib],c=points[ic];
    const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(!(d>0))throw Error('Folded live mouth mesh');
    const minX=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0]))),maxX=Math.min(size-1,Math.floor(Math.max(a[0],b[0],c[0])));
    const minY=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1]))),maxY=Math.min(size-1,Math.floor(Math.max(a[1],b[1],c[1])));
    const oa=mesh.open[ia],ob=mesh.open[ib],oc=mesh.open[ic];
    const ca=mesh.closed[ia],cb=mesh.closed[ib],cc=mesh.closed[ic];
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d;
      const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d,w=1-u-v;
      if(u<-.0000001||v<-.0000001||w<-.0000001)continue;
      sample(open.data,size,scale*(u*oa[0]+v*ob[0]+w*oc[0]),scale*(u*oa[1]+v*ob[1]+w*oc[1]),aSample);
      sample(closed.data,size,scale*(u*ca[0]+v*cb[0]+w*cc[0]),scale*(u*ca[1]+v*cb[1]+w*cc[1]),bSample);
      const i=(y*size+x)*4,alpha=(1-t)*aSample[3]+t*bSample[3];out[i+3]=Math.round(alpha);
      if(alpha>0)for(let channel=0;channel<3;channel++)out[i+channel]=Math.round(((1-t)*aSample[channel]+t*bSample[channel])/alpha);
    }
  }
  return out;
}

export function liveMouthMotionPhase(entity,now){
  const duration=Number(entity.moveDuration),started=Number(entity.moveStartedAt);
  const dx=Number(entity.moveToX)-Number(entity.moveFromX),dy=Number(entity.moveToY)-Number(entity.moveFromY);
  if(!(duration>0)||!Number.isFinite(started)||!Number.isFinite(dx+dy))return 0;
  const distance=Math.hypot(dx,dy);
  // A reset/teleport is not a new chew. Ordinary actors move one native cell.
  if(distance>1.01)return 0;
  return (clamp((now-started)/duration)*distance)%1;
}

function baseClosure(entity,time){return .66+.14*Math.cos(2*Math.PI*liveMouthMotionPhase(entity,time));}
function sampleEvents(entity,time,events){
  const base=baseClosure(entity,time);let closure=base;
  for(const event of events){
    if(time<event.announcedAt)break;
    if(time<event.at){
      closure*=1-ease((time-event.announcedAt)/(event.at-event.announcedAt));
    }else if(time<=event.end){
      const from=event.at>event.announcedAt?0:event.initial;
      closure=from+(1-from)*ease((time-event.at)/(event.end-event.at));
    }else if(time<event.end+RELEASE_MS){
      closure=1+(base-1)*ease((time-event.end)/RELEASE_MS);
    }
  }
  return clamp(closure);
}

/**
 * readSprite(sprite) returns an ImageData-like native square raster, or a
 * native-sized temporary canvas (ownership transfers here and it is released
 * immediately after reading). It must read the currently active quality atlas.
 * All construction happens in prepare(); sprite()/draw() allocate no canvases
 * and never read pixels. Returned descriptors stay stable for a generation.
 */
export function createLiveMouthService({makeCanvas,readSprite,drawSource=null,tile=16,playerPosition=null,yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}){
  if(typeof makeCanvas!=='function'||typeof readSprite!=='function')throw Error('Live mouth adapters are required');
  let generation=0,activeGeneration=0,entries=new WeakMap(),resources=[],ready=false,actors=new WeakMap();
  let lastGroups=null,recoveryPromise=null;
  const geometryPosition={},geometryMatrix={};
  let stats={ready:false,invalidSets:0,restoring:false,recoveryError:null,frames:LIVE_MOUTH_FRAMES,cacheSize:LIVE_MOUTH_CACHE_SIZE,nativeEndpoints:!!drawSource,families:0,sets:0,bytes:0,fullFrameBytes:0,canvases:0};
  const release=list=>{for(const canvas of list)canvas.width=canvas.height=1;};
  function scheduleRestoration(set){
    if(!ready||set.generation!==activeGeneration||generation!==activeGeneration||!lastGroups||recoveryPromise)return;
    const expectedGeneration=activeGeneration,groups=lastGroups;
    stats={...stats,restoring:true,recoveryError:null};
    // Loss/restoration can arrive for several cached surfaces together. One
    // coalesced rebuild handles all of them; a newer quality request or dispose
    // invalidates it before work begins or at the next preparation yield.
    recoveryPromise=Promise.resolve().then(()=>{
      if(!ready||generation!==expectedGeneration||activeGeneration!==expectedGeneration)return false;
      return prepare(groups);
    }).catch(error=>{
      if(activeGeneration===expectedGeneration)stats={...stats,ready:false,recoveryError:String(error?.message||error)};
      return false;
    }).finally(()=>{recoveryPromise=null;stats={...stats,restoring:false};});
  }
  const record=entity=>{let r=actors.get(entity);if(!r){r={events:[],lastNow:null};actors.set(entity,r);}return r;};
  function sampleActor(entity,now){
    if(!Number.isFinite(now))throw Error('Mouth clock must be finite');
    const r=record(entity);r.lastNow=now;
    return sampleEvents(entity,now,r.events);
  }
  function bite(entity,at,duration=95,announcedAt=null){
    if(!Number.isFinite(at)||!Number.isFinite(duration)||duration<=0)throw Error('Invalid real mouth bite');
    const r=record(entity);
    const announced=Number.isFinite(announcedAt)?Math.min(at,announcedAt):Math.min(at,r.lastNow??at);
    const initial=sampleEvents(entity,at,r.events);
    // Keep only overlapping phrases, not an ever-growing history per actor.
    r.events=r.events.filter(e=>e.end+RELEASE_MS>=announced);
    r.events.push({at,end:at+duration,announcedAt:announced,initial});
    r.events.sort((a,b)=>a.announcedAt-b.announcedAt||a.at-b.at);
    if(r.events.length>16)r.events.splice(0,r.events.length-16);
  }
  const raster=source=>{
    const result=readSprite(source);
    if(result?.data)return validateRaster(result);
    if(!result?.getContext)throw Error('Mouth raster adapter returned no image');
    try{return validateRaster(result.getContext('2d',{willReadFrequently:true}).getImageData(0,0,result.width,result.height));}
    finally{result.width=result.height=1;}
  };
  async function prepare(groups){
    const token=++generation,nextEntries=new WeakMap(),nextResources=[];
    const contactCache=new Map();let contactVertices=0;
    function contact(raster){
      let hash=2166136261;for(let i=3;i<raster.data.length;i+=4)hash=Math.imul(hash^raster.data[i],16777619);
      const key=`${raster.width}:${raster.height}:${hash>>>0}`;
      let cached=contactCache.get(key);if(cached)return cached;
      cached=traceAlphaContours(raster,{threshold:32,tolerance:raster.width/320,id:'character'});
      contactCache.set(key,cached);contactVertices+=cached.stats.vertices;return cached;
    }
    const nextStats={ready:false,invalidSets:0,restoring:false,recoveryError:null,frames:LIVE_MOUTH_FRAMES,cacheSize:LIVE_MOUTH_CACHE_SIZE,nativeEndpoints:!!drawSource,families:0,sets:0,bytes:0,fullFrameBytes:0,canvases:0};
    const allocate=(w,h)=>{
      const canvas=makeCanvas(w,h);canvas.width=w;canvas.height=h;nextResources.push(canvas);
      nextStats.bytes+=w*h*4;nextStats.canvases++;return canvas;
    };
    const paint=(canvas,data,w,h)=>{const ctx=canvas.getContext('2d');if(!ctx)throw Error('Mouth canvas unavailable');
      const pixels=ctx.createImageData(w,h);pixels.data.set(data);ctx.putImageData(pixels,0,0);return ctx;};
    const families=[];
    for(const kind of ['player','hunter'])for(const [palette,lights] of Object.entries(groups?.[kind]||{}))
      for(const [light,poses] of Object.entries(lights))families.push({kind,palette,light,poses});
    let backReference=null;
    try{
      // The shared anatomy mask is measured once from green P1, never from
      // blue/gold/rage recolors whose channel values are intentionally different.
      const reference=groups?.player?.p1?.normal?.Head1;
      if(reference)backReference=makeBackCapBoundary(resampleLiveMouthRaster(raster(reference)));
      for(const family of families){
        nextStats.families++;
        const prefix=family.kind==='hunter'?'EnemyHead':'Head';
        for(let bank=0;bank<4;bank++){
          if(token!==generation){release(nextResources);return false;}
          const direction=[2,3,4,1][bank],openSource=family.poses[`${prefix}${direction}`];
          const closedSource=family.poses[`${prefix}${direction}${direction===1?'':'Close'}`]||openSource;
          if(!openSource||!closedSource)continue;
          const nativeOpen=raster(openSource),nativeClosed=raster(closedSource),nativeSize=nativeOpen.width;
          if(nativeClosed.width!==nativeSize)throw Error('Mismatched mouth endpoint resolution');
          const open=resampleLiveMouthRaster(nativeOpen),closed=resampleLiveMouthRaster(nativeClosed),size=open.width;
          const bounds=backReference?.length===size?backReference:null;
          const base=bank===3?closed.data:open.data;
          const frames=[],union=new Uint8ClampedArray(size*size*4);
          let minX=size,minY=size,maxX=-1,maxY=-1;
          for(let index=0;index<LIVE_MOUTH_FRAMES;index++){
            const pixels=morphLiveMouthFrame(open,closed,bank,index/(LIVE_MOUTH_FRAMES-1),bounds);frames.push(pixels);
            for(let i=0;i<pixels.length;i+=4){
              union[i+3]=Math.max(union[i+3],pixels[i+3]);
              if(pixels[i]!==base[i]||pixels[i+1]!==base[i+1]||pixels[i+2]!==base[i+2]||pixels[i+3]!==base[i+3]){
                const pixel=i/4,x=pixel%size,y=Math.floor(pixel/size);
                minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
              }
            }
          }
          if(maxX<0){minX=minY=0;maxX=maxY=0;}
          const width=maxX-minX+1,height=maxY-minY+1;
          const baseCanvas=allocate(size,size);paint(baseCanvas,base,size,size);
          // One source-pixel guard on every patch prevents adjacent-frame bleed.
          const strideX=width+2,strideY=height+2;
          const firstStored=drawSource&&bank!==3?1:0,storedFrames=LIVE_MOUTH_FRAMES-firstStored-(drawSource?1:0);
          const sheet=allocate(COLS*strideX,Math.ceil(storedFrames/COLS)*strideY);
          const ctx=sheet.getContext('2d'),patch=ctx.createImageData(strideX,strideY);
          const descriptors=[];
          const set={base:baseCanvas,sheet,size,nativeSize,openSource,closedSource,bank,firstStored,x:minX,y:minY,width,height,strideX,strideY,leader:null,valid:true,generation:token,contacts:[]};
          for(let index=0;index<LIVE_MOUTH_FRAMES;index++){
            const pixels=frames[index];patch.data.fill(0);
            // Endpoint drawing uses native HD/4K pixels; intermediate drawing
            // uses the actual cached80px morph. Match that exact selection.
            const endpoint=drawSource&&(index===LIVE_MOUTH_FRAMES-1||(index===0&&bank!==3));
            set.contacts.push(contact(endpoint?(index===0?nativeOpen:nativeClosed):{width:size,height:size,data:pixels}));
            for(let y=0;y<strideY;y++)for(let x=0;x<strideX;x++){
              const sx=Math.max(0,Math.min(size-1,minX+x-1)),sy=Math.max(0,Math.min(size-1,minY+y-1));
              const source=(sy*size+sx)*4,target=(y*strideX+x)*4;
              patch.data.set(pixels.subarray(source,source+4),target);
            }
            if(index>=firstStored&&index<firstStored+storedFrames){
              const cachedIndex=index-firstStored;
              ctx.putImageData(patch,cachedIndex%COLS*strideX,Math.floor(cachedIndex/COLS)*strideY);
            }
            descriptors.push(Object.freeze({__liveMouth:{set,index},complete:true,naturalWidth:nativeSize,naturalHeight:nativeSize,
              __hvSpriteName:openSource.__hvSpriteName||`${prefix}${direction}`}));
          }
          if(family.kind==='player'){
            const padding=Math.max(4,Math.ceil(size*.05)),outer=size+padding*2;
            const mask=makeCanvas(outer,outer),outline=allocate(outer,outer);
            mask.width=mask.height=outer;
            const m=mask.getContext('2d'),alpha=m.createImageData(size,size);alpha.data.set(union);m.putImageData(alpha,padding,padding);
            const glow=outline.getContext('2d'),color=LEADER_COLORS[family.palette]||LEADER_COLORS.p1;
            glow.save();glow.shadowColor=color;glow.shadowBlur=Math.max(2,size*.03);glow.globalAlpha=.54;glow.drawImage(mask,0,0);glow.restore();
            glow.globalCompositeOperation='source-in';glow.fillStyle=color;glow.fillRect(0,0,outer,outer);
            glow.globalCompositeOperation='destination-out';glow.drawImage(mask,0,0);
            glow.globalCompositeOperation='source-over';
            const radius=Math.max(1,Math.round(size/80));
            const ring=makeCanvas(outer,outer);ring.width=ring.height=outer;const r=ring.getContext('2d');
            for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++)if(x||y)r.drawImage(mask,x,y);
            r.globalCompositeOperation='source-in';r.fillStyle=color;r.fillRect(0,0,outer,outer);
            r.globalCompositeOperation='destination-out';r.drawImage(mask,0,0);
            glow.globalAlpha=.72;glow.drawImage(ring,0,0);glow.globalAlpha=1;
            mask.width=mask.height=ring.width=ring.height=1;
            set.leader={image:outline,padding,outer};
          }
          const invalidate=()=>{
            if(!set.valid)return;
            set.valid=false;nextStats.invalidSets++;
            if(set.generation===activeGeneration)stats={...stats,ready:false,invalidSets:stats.invalidSets+1};
          };
          for(const canvas of [sheet,baseCanvas,set.leader?.image])if(canvas){
            canvas.addEventListener?.('contextlost',invalidate);
            canvas.addEventListener?.('contextrestored',()=>scheduleRestoration(set));
          }
          let byOpen=nextEntries.get(closedSource);if(!byOpen){byOpen=new WeakMap();nextEntries.set(closedSource,byOpen);}
          byOpen.set(openSource,descriptors);
          nextStats.sets++;nextStats.fullFrameBytes+=nativeSize*nativeSize*4*49;
          await yieldTask();
        }
      }
      if(token!==generation){release(nextResources);return false;}
      if(nextStats.invalidSets)throw Error('Mouth cache context was lost during preparation');
      const previous=resources;
      resources=nextResources;entries=nextEntries;activeGeneration=token;lastGroups=groups;ready=true;stats={...nextStats,ready:true,
        contactContours:contactCache.size,contactVertices,contactAlpha:32,contactToleranceAtTile16:.05};
      release(previous);return true;
    }catch(error){release(nextResources);throw error;}
  }
  function sprite(entity,time,{open,closed=open,bank}={}){
    if(!ready||!open||!closed||!Number.isInteger(bank)||bank<0||bank>3)return null;
    const list=entries.get(closed)?.get(open);if(!list||!list[0].__liveMouth.set.valid)return null;
    const closure=sampleActor(entity,time);return list[Math.round(closure*(LIVE_MOUTH_FRAMES-1))];
  }
  function draw(ctx,descriptor,x,y,width,height=width){
    const live=descriptor?.__liveMouth;if(!ready||!live?.set.valid||live.set.generation!==activeGeneration)return false;
    const set=live.set,size=set.size,sx=width/size,sy=height/size;
    if(drawSource&&(live.index===LIVE_MOUTH_FRAMES-1||(live.index===0&&set.bank!==3)))
      return drawSource(ctx,live.index===0?set.openSource:set.closedSource,x,y,width,height)!==false;
    const part=(px,py,pw,ph)=>{if(pw>0&&ph>0)ctx.drawImage(set.base,px,py,pw,ph,x+px*sx,y+py*sy,pw*sx,ph*sy);};
    // Draw disjoint regions, never a transparent patch over an old mouth.
    part(0,0,size,set.y);part(0,set.y+set.height,size,size-set.y-set.height);
    part(0,set.y,set.x,set.height);part(set.x+set.width,set.y,size-set.x-set.width,set.height);
    const cachedIndex=live.index-set.firstStored;
    ctx.drawImage(set.sheet,cachedIndex%COLS*set.strideX+1,Math.floor(cachedIndex/COLS)*set.strideY+1,
      set.width,set.height,x+set.x*sx,y+set.y*sy,set.width*sx,set.height*sy);return true;
  }
  function drawLeader(ctx,descriptor,x,y,width,height=width){
    const set=descriptor?.__liveMouth?.set;if(!ready||!set?.valid||!set.leader||set.generation!==activeGeneration)return false;
    const {image,padding,outer}=set.leader;
    ctx.drawImage(image,x-padding*width/set.size,y-padding*height/set.size,outer*width/set.size,outer*height/set.size);
    draw(ctx,descriptor,x,y,width,height);
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha*=.42;draw(ctx,descriptor,x,y,width,height);ctx.restore();return true;
  }
  function geometry(entity,time,options={},out={}){
    const descriptor=options.descriptor||sprite(entity,time,options),live=descriptor?.__liveMouth;
    if(!ready||!live?.set.valid||live.set.generation!==activeGeneration)return null;
    const local=live.set.contacts[live.index];if(!local)return null;
    const cell=options.tile??tile,position=options.position||(options.playerPosition||playerPosition)?.(entity,time,geometryPosition)||entity;
    const x=options.x??position.x*cell,y=options.y??position.y*cell,width=options.width??cell,height=options.height??width;
    const degrees=Number.isFinite(options.tiltDegrees)?options.tiltDegrees:Number.isFinite(entity.controllerTiltDegrees)?entity.controllerTiltDegrees:0;
    const angle=Number.isFinite(options.angle)?options.angle:degrees*Math.PI/180;
    const cos=Math.cos(angle),sin=Math.sin(angle),sx=width/local.width,sy=height/local.height;
    Object.assign(geometryMatrix,{a:cos*sx,b:sin*sx,c:-sin*sy,d:cos*sy,
      e:x+width/2-cos*width/2+sin*height/2,f:y+height/2-sin*width/2-cos*height/2});
    transformContactShape(local,geometryMatrix,out);
    for(const part of out.parts)part.role='head';
    out.frame=live.index;out.bank=live.set.bank;out.time=time;out.radius=Math.hypot(width,height)/2;
    out.tolerance=local.stats.tolerance*Math.max(sx,sy);out.discreteFrames=true;return out;
  }
  function breakpoints(entity,from,to,out=[]){
    out.length=0;if(!(to>from))return out;const r=record(entity),cuts=[from,to];
    const started=Number(entity.moveStartedAt),duration=Number(entity.moveDuration);
    const distance=Math.hypot(Number(entity.moveToX)-Number(entity.moveFromX),Number(entity.moveToY)-Number(entity.moveFromY));
    for(const value of [started,started+duration,...r.events.flatMap(e=>[e.announcedAt,e.at,e.end,e.end+RELEASE_MS])])if(value>from&&value<to)cuts.push(value);
    cuts.sort((a,b)=>a-b);
    for(let i=0;i+1<cuts.length;i++){
      const a=cuts[i],b=cuts[i+1],m=(a+b)/2;
      const base=duration>0&&distance<=1.01&&m>started&&m<started+duration ? .14*2*Math.PI*distance/duration : 0;
      let bound=base;
      for(const event of r.events){
        if(m<event.announcedAt)break;
        if(m<event.at)bound+=1.875/(event.at-event.announcedAt);
        else if(m<=event.end)bound=(1-(event.at>event.announcedAt?0:event.initial))*1.875/(event.end-event.at);
        else if(m<event.end+RELEASE_MS)bound=base+.48*1.875/RELEASE_MS;
      }
      quantizedContactBreakpoints(t=>sampleEvents(entity,t,r.events),a,b,{levels:LIVE_MOUTH_FRAMES-1,speedBound:bound},out);
    }
    return out;
  }
  return {prepare,sprite,draw,drawLeader,bite,closure:sampleActor,geometry,breakpoints,
    reset(entity){if(entity)actors.delete(entity);else actors=new WeakMap();},
    whenRestored(){return recoveryPromise||Promise.resolve(ready&&stats.invalidSets===0);},
    dispose(){generation++;ready=false;lastGroups=null;release(resources);resources=[];entries=new WeakMap();actors=new WeakMap();stats={...stats,ready:false,invalidSets:0,restoring:false,bytes:0,canvases:0};},
    get ready(){return ready&&stats.invalidSets===0;},get stats(){return {...stats};}};
}
