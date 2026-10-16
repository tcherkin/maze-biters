// Approved Fantasy Biter revision 5 (2x mouth travel), fitted 12.5% wider. Hunters never enter
// this loader. Native HD/4K patches retain all 49 mouth and 25 eyelid poses.
import {buildFantasyMouthIntakeMask} from './fantasy-mouth-intake.js?v=1.02.13.00';
const DIRECTIONS=['right','down','left','up'];
const NUMBERS=[2,3,4,1];
const ROOT=new URL('../../assets/fantasy-biters/',import.meta.url);
export const FANTASY_MOUTH_FRAMES=49;
export const FANTASY_BLINK_FRAMES=25;

export async function loadFantasyPlayerArt(profile,{makeCanvas,fetchJSON=null,loadImage=null}={}){
  profile=String(profile).toLowerCase();
  if(!['hd','4k'].includes(profile))throw Error('Unknown Fantasy Biter quality');
  const manifestURL=new URL('manifest.json?v=1.02.13.00',ROOT);
  const manifest=await (fetchJSON?fetchJSON(manifestURL):fetch(manifestURL).then(r=>{
    if(!r.ok)throw Error('Fantasy Biter manifest unavailable');return r.json();
  }));
  if(manifest.artRevision!==5||manifest.amplitudeScale!==2||manifest.walkingStrength!==.5||manifest.blinkFrames!==FANTASY_BLINK_FRAMES)throw Error('Wrong approved Fantasy Biter revision');
  if(manifest.sizeFit?.scaleX!==1.125||manifest.sizeFit?.scaleY!==1||
    manifest.sizeFit?.pivot?.[0]!==.5||manifest.sizeFit?.pivot?.[1]!==.5||manifest.blinkArtRevision!==5)
    throw Error('Wrong approved Fantasy Biter size fit');
  const spec=manifest.profiles[profile];
  if(!spec||![80,160].includes(spec.size))throw Error('Invalid Fantasy Biter pack');
  const images=new Map();
  const image=file=>{
    if(!images.has(file))images.set(file,(async()=>{
      const url=new URL(file,ROOT);
      url.searchParams.set('v','1.02.13.00');
      if(loadImage)return loadImage(url);
      const result=new Image();result.decoding='async';result.src=url.href;await result.decode();return result;
    })());
    return images.get(file);
  };
  const sets={},groups={};
  await Promise.all(Object.entries(spec.sets).map(async([key,definition])=>{
    const [palette,light,direction]=key.split(':');
    const set={...definition,key,palette,light,direction,size:spec.size,makeCanvas,
      base:await image(definition.base),closed:await image(definition.closed),
      sheet:await image(definition.mouth.file),blink:await Promise.all((definition.blink||[]).map(async patch=>({...patch,image:await image(patch.file)})))};
    if(set.mouth.frames!==FANTASY_MOUTH_FRAMES)throw Error('Wrong approved mouth revision');
    sets[key]=set;
    const number=NUMBERS[DIRECTIONS.indexOf(direction)];
    if(!number)throw Error('Invalid Fantasy Biter direction');
    const poses=(groups[palette]??={})[light]??=((groups[palette])[light]={});
    const source=closed=>Object.freeze({__fantasySource:{set,closed},__hvSpriteName:`Head${number}${closed&&number!==1?'Close':''}`,
      complete:true,naturalWidth:spec.size,naturalHeight:spec.size});
    poses[`Head${number}`]=source(false);
    if(number!==1)poses[`Head${number}Close`]=source(true);
  }));
  return {profile,size:spec.size,groups,sets,decodedBytes:spec.decodedBytes,artRevision:manifest.artRevision};
}

export function drawFantasySource(ctx,sprite,x,y,width,height=width){
  const source=sprite?.__fantasySource;if(!source)return false;
  const image=source.closed?source.set.closed:source.set.base;
  ctx.drawImage(image,0,0,source.set.size,source.set.size,x,y,width,height);return true;
}

function replacePatch(ctx,image,patch,index){
  const {x,y,width,height,stride,columns=1,guard=1,cellWidth=width+2}=patch;
  ctx.clearRect(x,y,width,height);
  if(patch.mirrorX){
    ctx.save();ctx.translate(x+width,y);ctx.scale(-1,1);
    ctx.drawImage(image,(index%columns)*cellWidth+guard,Math.floor(index/columns)*stride+guard,width,height,0,0,width,height);ctx.restore();
  }else ctx.drawImage(image,(index%columns)*cellWidth+guard,Math.floor(index/columns)*stride+guard,width,height,x,y,width,height);
}
export function composeFantasyPose(ctx,art,index,blink=0){
  const size=art.size;
  ctx.clearRect(0,0,size,size);ctx.drawImage(art.base,0,0,size,size,0,0,size,size);
  replacePatch(ctx,art.sheet,art.mouth,index);
  if(blink>0)for(const patch of art.blink)replacePatch(ctx,patch.image,patch,blink);
}

// Preparation only: pixels feed exact contact contours and the new anatomy's
// intake mask. Playback uses the packed images and one reusable native surface.
export function prepareFantasyMouthSet({source,bank,allocate,contact,palette,light,makeCanvas}){
  const art=source.__fantasySource.set,size=art.size;
  const kind=art.kind||'player',isPlayer=kind==='player';
  // The old 49 readbacks made hunter composition CPU-backed. Keep its
  // premultiplication rounding when those unused readbacks are skipped.
  const composite=allocate(size,size),context=!isPlayer&&contact===null
    ?composite.getContext('2d',{willReadFrequently:true}):composite.getContext('2d');
  if(!context)throw Error('Fantasy Biter surface unavailable');
  context.imageSmoothingEnabled=false;
  const set={fantasy:true,kind,art,bank,size,nativeSize:size,base:art.base,sheet:art.sheet,
    composite,context,compositeKey:null,frameCount:FANTASY_MOUTH_FRAMES,contacts:[],leader:null,intakeMask:null};
  // Native-grid gameplay does not consume character contours. A hunter has
  // no leader union or intake mask, so its native compositor is already ready.
  if(!isPlayer&&contact===null)return set;
  const union=isPlayer?new Uint8ClampedArray(size*size*4):null;
  const needsMask=isPlayer&&palette==='p1'&&light==='normal'&&bank<3;
  // The anatomy builder leaves every row above reference y92 empty.
  if(needsMask){
    const maskY=Math.floor(92*size/160),maskHeight=size-maskY,columns=7,guard=1;
    const strideX=size+guard*2,strideY=maskHeight+guard*2;
    // Replicated guards prevent adjacent-frame bleed at the HD2x scratch
    // scale and fractional camera transforms. Cropping the empty upper rows
    // pays for those guards: this uses less memory than a half-sprite strip.
    set.intakeMask=allocate(strideX*columns,strideY*Math.ceil(FANTASY_MOUTH_FRAMES/columns));
    set.intake={sheet:set.intakeMask,size,y:maskY,height:maskHeight,columns,guard,strideX,strideY,set};
  }
  for(let index=0;index<FANTASY_MOUTH_FRAMES;index++){
    composeFantasyPose(context,art,index);
    const raster=context.getImageData(0,0,size,size);
    if(contact!==null)set.contacts.push(contact(raster));
    if(union)for(let i=3;i<union.length;i+=4)union[i]=Math.max(union[i],raster.data[i]);
    if(needsMask){
      const data=buildFantasyMouthIntakeMask(raster,bank,index/(FANTASY_MOUTH_FRAMES-1));
      const maskContext=set.intakeMask.getContext('2d'),mask=set.intake;
      const pixels=maskContext.createImageData(mask.strideX,mask.strideY);
      for(let y=0;y<mask.strideY;y++)for(let x=0;x<mask.strideX;x++){
        const sx=Math.max(0,Math.min(size-1,x-mask.guard)),sy=Math.max(mask.y,Math.min(size-1,mask.y+y-mask.guard));
        pixels.data.set(data.subarray((sy*size+sx)*4,(sy*size+sx+1)*4),(y*mask.strideX+x)*4);
      }
      maskContext.putImageData(pixels,(index%mask.columns)*mask.strideX,Math.floor(index/mask.columns)*mask.strideY);
    }
  }
  // Hunters share mouth/blink composition, not protagonist-only effects.
  if(!isPlayer)return set;
  // Reuse the established leader outline recipe, at native quality.
  const color={p1:'#6dff72',p2:'#66baff',ai:'#ffd85d'}[palette]||'#6dff72';
  const padding=Math.max(4,Math.ceil(size*.05)),outer=size+padding*2;
  const mask=makeCanvas(outer,outer),ring=makeCanvas(outer,outer),outline=allocate(outer,outer);
  try{
    const m=mask.getContext('2d'),alpha=m.createImageData(size,size);alpha.data.set(union);m.putImageData(alpha,padding,padding);
    const glow=outline.getContext('2d');glow.save();glow.shadowColor=color;glow.shadowBlur=Math.max(2,size*.03);
    glow.globalAlpha=.54;glow.drawImage(mask,0,0);glow.restore();
    glow.globalCompositeOperation='source-in';glow.fillStyle=color;glow.fillRect(0,0,outer,outer);
    glow.globalCompositeOperation='destination-out';glow.drawImage(mask,0,0);glow.globalCompositeOperation='source-over';
    const r=ring.getContext('2d'),radius=Math.max(1,Math.round(size/80));
    for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++)if(x||y)r.drawImage(mask,x,y);
    r.globalCompositeOperation='source-in';r.fillStyle=color;r.fillRect(0,0,outer,outer);
    r.globalCompositeOperation='destination-out';r.drawImage(mask,0,0);glow.globalAlpha=.72;glow.drawImage(ring,0,0);glow.globalAlpha=1;
    set.leader={image:outline,padding,outer};
  }finally{mask.width=mask.height=ring.width=ring.height=1;}
  return set;
}
export function drawFantasyMouth(ctx,live,x,y,width,height=width){
  const set=live.set,key=live.index*FANTASY_BLINK_FRAMES+(live.blink||0);
  const resident=!!ctx.canvas?._gpu;
  const composite=resident?(set.gpuComposite??=globalThis.__gpu2d.makeSurface(set.size,set.size,'mouth-and-blink')):set.composite;
  if(resident)set.composite.__gpuMirror=composite;
  const keyName=resident?'gpuCompositeKey':'compositeKey';
  if(set[keyName]!==key){composeFantasyPose(resident?composite.getContext('2d'):set.context,set.art,live.index,live.blink||0);set[keyName]=key;}
  // One transformed image: no subpixel seams across the cap, face or lips.
  ctx.drawImage(composite,0,0,set.size,set.size,x,y,width,height);return true;
}
