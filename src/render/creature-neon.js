import {createCreatureNeonMaterial} from './creature-neon-material.js?v=1.02.16.00';

// Final-pose treatment: the mouth, eyelids, turn mesh and scorpion legs have
// already been composed when they reach this small native-resolution surface.
// Never memoize a mutable animation canvas by its object identity.
export function createCreatureNeon({makeCanvas,eyes}) {
  const pools=new Map();
  let draws=0,fallbacks=0,maskDraws=0,lastError=null;
  function poolFor(kind) {
    let pool=pools.get(kind);if(pool)return pool;
    const image=makeCanvas(1,1),mask=makeCanvas(1,1);
    pool={image,mask,context:image.getContext('2d'),maskContext:mask.getContext('2d'),
      material:createCreatureNeonMaterial({makeCanvas,strength:.7,maxSize:768}),
      scale:0,left:0,top:0,width:0,height:0,lost:new Set(),dirty:false};
    for(const surface of [image,mask]){
      surface.addEventListener?.('contextlost',()=>{pool.lost.add(surface);pool.dirty=true;});
      surface.addEventListener?.('contextrestored',()=>{pool.lost.delete(surface);pool.dirty=true;});
    }
    pools.set(kind,pool);return pool;
  }
  function clear(context,canvas,scale,left,top) {
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;
    context.globalCompositeOperation='source-over';context.filter='none';
    context.shadowBlur=0;context.shadowColor='transparent';
    context.clearRect(0,0,canvas.width,canvas.height);context.beginPath();
    context.imageSmoothingEnabled=false;
    context.setTransform(scale,0,0,scale,-left*scale,-top*scale);
  }
  function prepare({kind,bounds,scale,draw,level=0}) {
    const left=bounds?.minX??bounds?.left,top=bounds?.minY??bounds?.top;
    const right=bounds?.maxX??bounds?.right,bottom=bounds?.maxY??bounds?.bottom;
    if(!['hunter','scorpion'].includes(kind)||typeof draw!=='function'
      ||![left,top,right,bottom,scale].every(Number.isFinite)||scale<=0||right<=left||bottom<=top)return null;
    const x=Math.floor(left*scale)/scale,y=Math.floor(top*scale)/scale;
    const w=Math.ceil(((right-x)*scale+2)/32)*32,h=Math.ceil(((bottom-y)*scale+2)/32)*32;
    if(w>768||h>768)return null;
    const p=poolFor(kind),changed=p.scale!==scale;
    if(!p.context||!p.maskContext||p.lost.size||p.context.isContextLost?.()||p.maskContext.isContextLost?.())return null;
    if(changed||p.dirty||w>p.image.width||h>p.image.height) {
      p.image.width=p.mask.width=changed?w:Math.max(w,p.image.width);
      p.image.height=p.mask.height=changed?h:Math.max(h,p.image.height);
      p.scale=scale;p.dirty=false;
    }
    clear(p.context,p.image,scale,x,y);clear(p.maskContext,p.mask,scale,x,y);
    // An optional exact-eye painter is called from the same selected sprite,
    // not by resampling the mouth/blink clocks a second time.
    let painted=false,eyeFailed=false;
    try{draw(p.context,paint=>{
      if(eyeFailed||!(level>0)||typeof paint!=='function')return;
      try {painted=paint(p.maskContext)!==false||painted;}
      catch(error){lastError=String(error?.message||error);p.dirty=true;eyeFailed=true;painted=false;}
    });}catch(error){p.dirty=true;throw error;}
    const processed=p.material.process(p.image);
    if(!processed)fallbacks++;
    if(painted) {
      const c=p.maskContext;c.save();c.setTransform(1,0,0,1,0,0);
      c.globalCompositeOperation='source-in';c.fillStyle='#fff6cb';c.globalAlpha=Math.max(0,Math.min(1,level));
      c.fillRect(0,0,p.mask.width,p.mask.height);c.restore();maskDraws++;
    }
    draws++;p.left=x;p.top=y;p.width=p.image.width/scale;p.height=p.image.height/scale;
    p.artwork=processed?.material||p.image;p.emission=processed?.emission||null;
    p.eyeImage=painted?p.mask:null;return p;
  }
  function reset(){eyes?.reset();}
  function invalidate(){
    for(const p of pools.values()){
      p.material.invalidate();p.image.width=p.image.height=p.mask.width=p.mask.height=1;p.scale=0;
    }
    reset();
  }
  function stats(){
    let bytes=0;const materials={};
    for(const [kind,p] of pools){materials[kind]=p.material.stats();
      bytes+=(p.image.width*p.image.height+p.mask.width*p.mask.height)*4+(materials[kind].bytes||0);}
    const eyeStats=eyes?.diagnostics?.()||null;bytes+=eyeStats?.maskBytes||0;
    return {draws,fallbacks,maskDraws,lastError,pools:pools.size,bytes,materials,eyes:eyeStats,
      runtimePixelReads:0,maxNativeDimension:768};
  }
  return {prepare,reset,invalidate,stats};
}
