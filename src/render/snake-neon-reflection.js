import {createMazeReflection} from './neon-maze-reflection.js?v=1.02.08.00';

// Native-art tints, not the AI's semantic colour labels (notably Pink).
export const SNAKE_REFLECTION_COLORS=Object.freeze({
  Green:'#b8ef52',Yellow:'#ffe080',Blue:'#65c9f2',Pink:'#ed83b6',Orange:'#ffa56b'
});
const COLORS=Object.values(SNAKE_REFLECTION_COLORS);

export function snakeReflectionColor(value){
  if(SNAKE_REFLECTION_COLORS[value])return SNAKE_REFLECTION_COLORS[value];
  const color=String(value||'').toLowerCase();
  if(COLORS.includes(color))return color;
  if(/66c2ff|blue/.test(color))return SNAKE_REFLECTION_COLORS.Blue;
  if(/ff8873|orange|red/.test(color))return SNAKE_REFLECTION_COLORS.Orange;
  if(/d66bff|ff5fa2|pink|magenta/.test(color))return SNAKE_REFLECTION_COLORS.Pink;
  if(/35e55b|green/.test(color))return SNAKE_REFLECTION_COLORS.Green;
  return SNAKE_REFLECTION_COLORS.Yellow;
}

export function createSnakeNeonReflection({width,height,tile,makeCanvas,options={floor:true,walls:true}}){
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||
     !Number.isFinite(tile)||tile<=0||typeof makeCanvas!=='function')
    throw new TypeError('Expected positive world dimensions, tile and canvas factory');
  const w=Math.ceil(width),h=Math.ceil(height);
  let canvasAllocations=0;
  const allocate=(cw,ch)=>{canvasAllocations++;return makeCanvas(cw,ch);};
  // Soft world lighting needs 16px/cell, not the native 80/160px sprite cache.
  const receiver=allocate(w,h),rc=receiver.getContext('2d');
  if(!rc)throw new Error('Snake wall receiver context unavailable');
  let raw=null,grid=null,lastKey,lastDraw=null,prepared=false,disposed=false;
  let receiverDirty=true,receiverLost=false,builds=0,receiverBuilds=0,pixelReads=0;
  let renders=0,recoveryCount=0;
  const output={floor:null,walls:null},sources=[];
  const onLost=()=>{receiverLost=true;receiverDirty=true;};
  const onRestored=()=>{receiverLost=false;receiverDirty=true;};
  receiver.addEventListener?.('contextlost',onLost);
  receiver.addEventListener?.('contextrestored',onRestored);
  function receiverAvailable(){
    if(disposed)return false;
    if(typeof rc.isContextLost==='function'){
      const lost=rc.isContextLost();
      if(lost!==receiverLost){receiverLost=lost;receiverDirty=true;}
    }
    if(receiverLost)return false;
    if(receiver.width!==w||receiver.height!==h){
      receiver.width=w;receiver.height=h;receiverDirty=true;
    }
    return true;
  }
  function buildReceiver(){
    if(!receiverAvailable()||!grid||!lastDraw)return false;
    rc.save();
    try{
      rc.setTransform(1,0,0,1,0,0);rc.globalAlpha=1;rc.globalCompositeOperation='source-over';
      rc.filter='none';rc.clearRect(0,0,w,h);
      rc.setTransform(w/width,0,0,h/height,0,0);
      rc.imageSmoothingEnabled=true;rc.imageSmoothingQuality='high';
      // The engine supplies exact merged boundary masks and the active native
      // atlas family. No floor, territory fill, fallback rectangle or filters.
      if(lastDraw(rc)===false)return false;
    }finally{rc.restore();}
    const pixels=rc.getImageData(0,0,w,h);pixelReads++;
    const p=pixels.data;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,cx=Math.floor((x+.5)*width/w/tile),cy=Math.floor((y+.5)*height/h/tile);
      if(grid[cy]?.[cx]!=='#'){p[i+3]=0;continue;}
      // Same accepted study response, applied to UNFILTERED native wall art.
      // Transparent/black cap cut-outs get zero alpha, never a minimum wash.
      const light=Math.max(0,Math.min(255,Math.max(p[i],p[i+1],p[i+2])*.78*1.2-25.5));
      const relief=Math.max(0,Math.min(1,(light-4)/166));
      p[i+3]=Math.round(p[i+3]*Math.pow(relief,.8));
      p[i]=p[i+1]=p[i+2]=255;
    }
    rc.putImageData(pixels,0,0);receiverDirty=false;receiverBuilds++;
    return true;
  }
  function prepare({grid:input,key,drawWallArtwork}){
    if(disposed)return false;
    if(!Array.isArray(input)||!input.length||typeof drawWallArtwork!=='function')
      throw new TypeError('Expected maze rows, cache key and native wall painter');
    const changed=!prepared||key!==lastKey;
    if(changed){
      const columns=input[0].length;
      if(!columns||input.some(row=>row.length!==columns))throw new TypeError('Expected a rectangular maze');
      raw?.dispose();
      grid=input.map(row=>Array.from(row,c=>c==='#'?'#':'.').join(''));
      raw=createMazeReflection({grid,cell:tile,width,height,canvasFactory:allocate,scale:1});
      raw.prepareColors(COLORS);
      lastKey=key;lastDraw=drawWallArtwork;receiverDirty=true;prepared=true;builds++;
    }
    if(!options.walls)return true;
    if(!receiverAvailable())return false;
    return !receiverDirty||buildReceiver();
  }
  function render(input,{viewport=null}={}){
    output.floor=output.walls=null;
    if(!prepared||disposed||(!options.floor&&!options.walls))return output;
    if(options.walls&&!receiverAvailable())return output;
    if(options.walls&&receiverDirty){if(!buildReceiver())return output;recoveryCount++;}
    sources.length=input?.length||0;
    for(let i=0;i<sources.length;i++){
      const source=input[i],entry=sources[i]||(sources[i]={geometry:null,color:'',bounds:null});
      entry.geometry=source?.geometry;entry.color=snakeReflectionColor(source?.palette??source?.color);
      entry.bounds=source?.bounds??null;
    }
    const floor=raw.render(sources,.7,{floor:options.floor,walls:options.walls,wallStrength:.4,viewport});
    if(!floor)return output;
    if(options.walls){
      const walls=raw.wallCanvas,c=walls.getContext('2d');
      c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.filter='none';
      c.globalCompositeOperation='destination-in';c.drawImage(receiver,0,0,walls.width,walls.height);c.restore();
      output.walls=walls;
    }
    output.floor=options.floor?floor:null;renders++;
    return output;
  }
  function reset(){
    if(disposed)return;raw?.reset();receiverDirty=true;
    output.floor=output.walls=null;
  }
  function dispose(){
    if(disposed)return;disposed=true;raw?.dispose();raw=null;
    receiver.removeEventListener?.('contextlost',onLost);
    receiver.removeEventListener?.('contextrestored',onRestored);
    receiver.width=receiver.height=1;sources.length=0;
    grid=null;lastDraw=null;output.floor=output.walls=null;
  }
  return {prepare,render,reset,dispose,stats:()=>({
    prepared:prepared&&!disposed,disposed,builds,receiverBuilds,receiverPixelReads:pixelReads,
    canvasAllocations,recoveryCount,renders,innerStrength:.7,wallStrength:.4,
    bodyCompositeStrength:.5,receiverBytes:disposed?0:w*h*4,
    light:raw?.stats()??null
  })};
}
