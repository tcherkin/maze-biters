import {enhancePixels} from './neon-material.js?v=1.02.06.00';

const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,value));
const smooth=(low,high,value)=>{const t=clamp((value-low)/(high-low));return t*t*(3-2*t);};
const amount=value=>{const n=Number(value);if(!Number.isFinite(n))throw new TypeError('Finite pickup strength required');return clamp(n,0,2);};

// The egg's approved ivory shell is nearly neutral. Keep its source hue and
// the canonical value/band response, but allow neutral shell pixels to emit.
// The same value gates leave dark cracks and transparent cut-outs unlit.
export function eggEmissionPixels(pixels,strength=.7){
  if(!pixels||pixels.length%4)throw new TypeError('Expected RGBA pixels');
  const output=new Uint8ClampedArray(pixels.length),power=amount(strength);
  if(power===0)return output;
  for(let i=0;i<pixels.length;i+=4){
    const high=Math.max(pixels[i],pixels[i+1],pixels[i+2]);
    if(pixels[i+3]===0||high<=48)continue;
    const value=high/255,interior=smooth(.22,.55,value),band=smooth(.42,.94,value);
    const alpha=Math.round(pixels[i+3]*clamp(power*interior*(.08+.76*band)));
    if(alpha===0)continue;
    const lightValue=.80+.20*value;
    for(let c=0;c<3;c++)output[i+c]=255*lightValue*pixels[i+c]/high;
    output[i+3]=alpha;
  }
  return output;
}

// Fruit gloss belongs to its continuous skin, not to a creature's neutral
// teeth/cavities. The snake saturation gate left those authored highlights
// unlit after DUSK, creating apparent holes. Use the shell's value-only light
// response: retain hue, source alpha and dark details, including fruit seeds.
// This is prepared once at native80/160; no extra draw pass or warm readback.
export function fruitEmissionPixels(pixels,strength=.7){
  return eggEmissionPixels(pixels,strength);
}

// Eight immutable native atlas regions: four fruits and four egg poses. Keys
// copy region numbers because the engine mutates atlas descriptors on quality
// switches. Never cache a mutable creature/capture canvas through this service.
export function createPickupNeonMaterial({makeCanvas,strength=.7}={}){
  if(typeof makeCanvas!=='function')throw new TypeError('Pickup canvas factory required');
  const power=amount(strength),records=[];
  let profile=0,disposed=false,calls=0,hits=0,builds=0,cpuReads=0,lastReadbacks=0;
  let failures=0,contextLosses=0,recoveries=0,invalidations=0,profileChanges=0,capacityFallbacks=0;
  let lastError=null,lastInvalidation=null;
  function release(record){
    for(const item of record.surfaces){
      for(const [name,handler]of item.listeners)item.canvas.removeEventListener?.(name,handler);
      item.canvas.width=item.canvas.height=1;
    }
    record.surfaces.length=0;record.output=null;
  }
  function clear(reason){
    for(const record of records)release(record);
    records.length=0;profile=0;invalidations++;lastInvalidation=String(reason);lastError=null;
  }
  function surface(record){
    const canvas=makeCanvas(record.width,record.height);
    if(!canvas)throw Error('Pickup canvas allocation failed');
    const item={canvas,context:null,listeners:[],eventLost:false,polledLost:false};record.surfaces.push(item);
    canvas.width=record.width;canvas.height=record.height;
    const context=item.context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw Error('Pickup Canvas2D unavailable');
    context.imageSmoothingEnabled=false;
    const lost=()=>{if(!item.eventLost&&!item.polledLost)contextLosses++;item.eventLost=true;record.dirty=true;};
    const restored=()=>{item.eventLost=false;record.dirty=true;};
    if(typeof canvas.addEventListener==='function'&&typeof canvas.removeEventListener==='function'){
      for(const [name,handler]of [['contextlost',lost],['contextrestored',restored]]){
        canvas.addEventListener(name,handler);item.listeners.push([name,handler]);
      }
    }
    return item;
  }
  function available(record){
    let lost=false;
    for(const item of record.surfaces){
      const polled=!!item.context.isContextLost?.();
      if(polled&&!item.polledLost){if(!item.eventLost)contextLosses++;record.dirty=true;}
      if(!polled&&item.polledLost)record.dirty=true;
      item.polledLost=polled;lost=lost||item.eventLost||polled;
    }
    return !lost;
  }
  function build(record){
    try{
      const material=surface(record),emission=surface(record),{width,height}=record;
      material.context.drawImage(record.source,...record.rect,0,0,width,height);
      cpuReads++;lastReadbacks++;
      const pixels=material.context.getImageData(0,0,width,height);
      const original=pixels.data;
      const lit=enhancePixels(original,power);
      const glow=record.kind==='egg'?eggEmissionPixels(original,power):fruitEmissionPixels(original,power);
      pixels.data.set(lit);material.context.putImageData(pixels,0,0);
      pixels.data.set(glow);emission.context.putImageData(pixels,0,0);
      record.output={material:material.canvas,emission:emission.canvas,width,height};
      record.dirty=false;builds++;lastError=null;return record.output;
    }catch(error){
      failures++;lastError=String(error?.message||error);record.failed=true;release(record);return null;
    }
  }
  function get({source,rect,kind}={}){
    calls++;lastReadbacks=0;if(disposed)return null;
    // Invalid/unready inputs do not allocate. In particular, never latch an
    // image which has not loaded yet: normal atlas readiness can still recover.
    const dimensions=rect&&Array.from(rect),sourceWidth=source?.naturalWidth||source?.width,
      sourceHeight=source?.naturalHeight||source?.height;
    if(!source||source.complete===false||(kind!=='fruit'&&kind!=='egg')||dimensions?.length!==4||
      dimensions.some(n=>!Number.isInteger(n))||dimensions[0]<0||dimensions[1]<0||
      ![80,160].includes(dimensions[2])||dimensions[3]!==dimensions[2]||
      !Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||
      dimensions[0]+dimensions[2]>sourceWidth||dimensions[1]+dimensions[3]>sourceHeight){
      lastError='Expected a loaded native80/160 pickup atlas region';return null;
    }
    const size=dimensions[2];
    if(profile&&profile!==size){clear('profile-change');profileChanges++;}
    profile=size;
    let record=records.find(item=>item.source===source&&item.kind===kind&&item.rect.every((n,i)=>n===dimensions[i]));
    if(record){
      try{if(record.failed||!available(record))return null;}
      catch(error){failures++;lastError=String(error?.message||error);record.failed=true;release(record);return null;}
      if(!record.dirty){hits++;return record.output;}
      release(record);recoveries++;return build(record);
    }
    if(records.length===8){capacityFallbacks++;return null;}
    record={source,rect:dimensions,kind,width:size,height:size,surfaces:[],output:null,dirty:false,failed:false};
    records.push(record);return build(record);
  }
  function stats(){
    const nativeBytes=records.reduce((n,r)=>n+r.surfaces.reduce((sum,s)=>sum+s.canvas.width*s.canvas.height*4,0),0);
    return {disposed,profile:profile||null,entries:records.length,readyEntries:records.filter(r=>r.output&&!r.failed&&!r.dirty).length,
      maxEntries:8,nativeBytes,bytes:nativeBytes,maximumBytes:8*2*160*160*4,
      calls,hits,builds,cpuReads,lastReadbacks,failures,contextLosses,recoveries,invalidations,profileChanges,capacityFallbacks,
      lastError,lastInvalidation,strength:power,sourceBytesExcluded:true,immutableSources:true};
  }
  return {get,stats,invalidate(reason='invalidated'){if(!disposed)clear(reason);},reset(){if(!disposed)clear('reset');},
    dispose(){if(!disposed){clear('dispose');disposed=true;}}};
}
