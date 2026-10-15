import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
// Diagnostic mode records every mismatch instead of stopping at the first
// contract failure. --strict-rounding additionally requires <=1/255 even in
// cropped HD/4K captures. The reviewed native-crop allowance is <=2/255 in
// <=0.01% of pixels: sparse composited Canvas AA rounding, not reduced effect
// quality, changed density/strength, or a whole-frame approximate comparison.
const auditRounding=process.argv.includes('--audit-rounding');
const strictRounding=process.argv.includes('--strict-rounding');
const MAX_NATIVE_CHANGED_PIXEL_FRACTION=.0001;
let native;
for(const path of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',
  join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{native=require(path);break;}catch{}
}
if(!native)throw Error('Native Canvas required; set CODEX_CANVAS_PACKAGE.');
const {createCanvas}=native;
const renderRoot=new URL('../src/render/',import.meta.url);
async function moduleFrom(url){
  let source=await readFile(url,'utf8');
  // Use identical material/reflection/eye dependencies to isolate only the
  // glow-capture region change. The old compositor itself is frozen on disk.
  source=source.replace(/from '([^']+)'/g,(_match,path)=>'from '+JSON.stringify(new URL(path,renderRoot).href));
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const before=await moduleFrom(new URL('./baseline/snake-neon-v1.02.08.00.js',import.meta.url));
const after=await moduleFrom(new URL('../src/render/snake-neon.js',import.meta.url));
// Preserve the frozen baseline; only the later, requested wall gain differs.
assert.equal(before.SNAKE_NEON.walls,.25);
assert.deepEqual(after.SNAKE_NEON,{...before.SNAKE_NEON,walls:.4},'Only the requested wall strength may change');
const width=480,height=270,tile=16;
const grid=Array.from({length:17},(_,y)=>Array.from({length:30},(_,x)=>
  x===0||x===29||y===0||y===16?'#':([3,7,12].includes(y)||[4,14,25].includes(x)?'.':'#')).join(''));
function artwork(){
  const image=createCanvas(160,57),c=image.getContext('2d'),g=c.createLinearGradient(0,0,0,57);
  g.addColorStop(0,'#132b08');g.addColorStop(.25,'#74a80c');g.addColorStop(.43,'#d7ff33');g.addColorStop(1,'#163b0c');
  c.fillStyle=g;c.beginPath();c.roundRect(1,2,158,53,9);c.fill();
  c.fillStyle='#eaffaa';c.fillRect(54,20,10,8);c.fillStyle='#1d4410';c.fillRect(78,3,2,51);
  return image;
}
const art=artwork(),known=[art],collisionArt={image:art};
const entities=Array.from({length:8},(_,i)=>({color:['Green','Yellow','Blue','Orange','Pink'][i%5],brainAggression:.2+i*.1}));
const snake={getNeonSources:()=>known,getWorldGeometry:()=>null,getCollisionArt:()=>collisionArt};
function geometry(x,y,angle=0,length=72){
  const tx=Math.cos(angle),ty=Math.sin(angle),bodyEnd=Math.max(0,length-20);
  return {length,bodyEndDistance:bodyEnd,diameter:16,renderTime:undefined,
    head:{x:x+bodyEnd*tx,y:y+bodyEnd*ty,angle,alpha:1,span:20,
      sprite:{dx:0,dy:-8,sw:160,sh:57,dw:20,dh:16}},
    sample(d,out={}){out.x=x+d*tx;out.y=y+d*ty;out.tx=tx;out.ty=ty;out.angle=angle;out.curve=0;return out;},
    bounds:{minX:Math.min(x,x+length*tx)-10,minY:Math.min(y,y+length*ty)-10,
      maxX:Math.max(x,x+length*tx)+10,maxY:Math.max(y,y+length*ty)+10},
    draw(c){c.save();c.translate(x,y);c.rotate(angle);c.drawImage(art,0,-6,length,12);c.restore();}};
}
const makeSources=()=>[geometry(21,56),geometry(306,200),geometry(232,23,Math.PI/2,120),
  geometry(458,111,Math.PI,52),geometry(54,252,-Math.PI/2,58),geometry(-8,118,0,33)];
const dusk=createCanvas(width,height),dc=dusk.getContext('2d');
function paintDusk(mode,time){
  dc.setTransform(1,0,0,1,0,0);dc.clearRect(0,0,width,height);dc.globalCompositeOperation='source-over';
  dc.fillStyle=mode==='light'?'rgba(0,0,0,.03)':'rgba(0,0,0,.87)';dc.fillRect(0,0,width,height);
  if(mode==='cone'){
    const x=238+Math.sin(time/1300)*60,y=130,g=dc.createRadialGradient(x,y,8,x,y,95);
    g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.6,'rgba(0,0,0,.8)');g.addColorStop(1,'rgba(0,0,0,0)');
    dc.globalCompositeOperation='destination-out';dc.fillStyle=g;dc.fillRect(0,0,width,height);dc.globalCompositeOperation='source-over';
  }
}
const wallPainter=c=>{
  c.fillStyle='#442ec5';for(let y=0;y<grid.length;y++)for(let x=0;x<grid[y].length;x++)
    if(grid[y][x]==='#')c.fillRect(x*tile+4,y*tile+4,8,8);return true;
};
function scene(factory){
  const canvases=[],work={clearPixels:0,drawPixels:0,clears:0,draws:0};
  const makeCanvas=(w,h)=>{
    const canvas=createCanvas(w,h),c=canvas.getContext('2d'),events=new Map();let lost=false;
    c.isContextLost=()=>lost;
    canvas.addEventListener=(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);};
    canvas.removeEventListener=(name,fn)=>events.get(name)?.delete(fn);
    canvas.testLost=value=>{lost=value;for(const fn of events.get(value?'contextlost':'contextrestored')||[])fn();};
    const clear=c.clearRect,draw=c.drawImage;
    c.clearRect=function(x,y,w,h){const m=this.getTransform();work.clearPixels+=Math.abs(w*h*(m.a*m.d-m.b*m.c));work.clears++;return clear.call(this,x,y,w,h);};
    c.drawImage=function(...args){
      const m=this.getTransform(),w=args.length===3?args[0].width:args.at(-2),h=args.length===3?args[0].height:args.at(-1);
      work.drawPixels+=Math.abs(w*h*(m.a*m.d-m.b*m.c));work.draws++;return draw.apply(this,args);
    };
    canvases.push(canvas);return canvas;
  };
  const canvas=createCanvas(width,height),context=canvas.getContext('2d');
  return {canvas,context,canvases,work,scale:1,service:factory({width,height,tile,makeCanvas,snake})};
}
const a=scene(before.createSnakeNeon),b=scene(after.createSnakeNeon);
function resetWork(s){for(const key of Object.keys(s.work))s.work[key]=0;}
function resize(s,scale){s.scale=scale;s.canvas.width=width*scale;s.canvas.height=height*scale;}
function release(s){s.service.reset();s.canvas.width=s.canvas.height=1;for(const canvas of s.canvases)canvas.width=canvas.height=1;}
function render(s,camera,time,{sources=makeSources(),mask='cone',viewport='camera',unknown=false,ghost=false,prepared=false,mazeKey='maze',readback=true}={}){
  const {canvas,context:c,service:n,scale}=s;
  c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';
  c.fillStyle='#060b15';c.fillRect(0,0,canvas.width,canvas.height);
  c.setTransform(scale,0,0,scale,0,0);c.translate(width/2,height/2);c.scale(camera.zoom,camera.zoom);c.translate(-camera.x,-camera.y);
  const view=viewport==='camera'?{left:camera.x-width/2/camera.zoom,top:camera.y-height/2/camera.zoom,
    right:camera.x+width/2/camera.zoom,bottom:camera.y+height/2/camera.zoom}:viewport==='absent'?undefined:viewport;
  assert.equal(n.beginFrame(c,{grid,key:mazeKey,drawWallArtwork:wallPainter,time,foregroundBounds:[],viewport:view}),true,'Begin capture');
  const initial=n.actorsContext();initial.fillStyle='#804515';initial.fillRect(58,52,6,8);n.flushOcclusion();
  for(let i=0;i<sources.length;i++){
    const g=sources[i];g.draw(n.snakeContext());n.noteSnake(entities[i%entities.length],{geometry:g,bounds:g.bounds});
  }
  n.setForegroundBounds(unknown?undefined:{left:42,top:42,right:86,bottom:72});
  const front=n.actorsContext();front.fillStyle='#df4c24';front.fillRect(42,42,20,30);
  front.fillStyle='rgba(35,110,190,.55)';front.fillRect(62,42,24,30);
  n.setForegroundBounds(unknown?undefined:{left:208,top:74,right:258,bottom:164});
  const second=n.actorsContext();second.fillStyle='#a4dd61';second.save();second.translate(232,119);second.rotate(.21);second.fillRect(-14,-32,28,64);second.restore();
  if(ghost){
    // No source metadata for swallowed fragments: an unknown foreground batch
    // and late snake paint must still capture the exact visible emission.
    n.setForegroundBounds(undefined);
    const g=n.snakeContext();g.save();g.translate(camera.x+6.35,camera.y+18.7);g.rotate(time*.00023);g.globalAlpha=.61;
    g.drawImage(art,-31,-8,62,16);g.restore();
    const mouth=n.actorsContext();mouth.fillStyle='#b91e35';mouth.fillRect(camera.x+25,camera.y+10,20,24);
  }
  if(prepared){
    n.snakeContext().paintPreparedSurface((target,resolve=source=>source)=>{
      target.save();target.translate(camera.x-63.4,camera.y-26.1);target.rotate(.71);
      target.drawImage(resolve(art),0,-6,77,12);target.restore();
    });
  }
  n.flushOcclusion();n.flushOcclusion();paintDusk(mask,time);
  c.setTransform(scale,0,0,scale,0,0);assert.equal(n.present(c,dusk,camera),true,'Present capture');
  assert.deepEqual(n.diagnostics().errors,[],'No suppressed renderer errors');
  return readback?c.getImageData(0,0,canvas.width,canvas.height).data:null;
}
const stats={comparisons:0,maxDifference:0,changedChannels:0,exactFrames:0,hdFrames:0,fourKFrames:0,
  croppedHDFrames:0,cropped4KFrames:0,croppedMovingFrames:0,changedFrames:[],differenceHistogram:{},
  changedPixels:0,maxChangedPixelFraction:0,contractFailures:[]};
function comparePixels(first,second,label,canvasWidth=width,maximumDifference=1){
  assert.equal(second.length,first.length);let max=0,changed=0,changedPixels=0,lastPixel=-1,worst=[];
  const histogram={};
  for(let i=0;i<first.length;i++){
    const delta=Math.abs(first[i]-second[i]);if(!delta)continue;
    changed++;histogram[delta]=(histogram[delta]||0)+1;
    const pixel=i>>>2;if(pixel!==lastPixel){changedPixels++;lastPixel=pixel;}
    if(delta>max){max=delta;worst=[];}
    if(delta===max&&worst.length<8)worst.push({x:pixel%canvasWidth,y:Math.floor(pixel/canvasWidth),channel:i%4,before:first[i],after:second[i]});
  }
  const limit=strictRounding?Math.min(1,maximumDifference):maximumDifference;
  const fraction=changedPixels/(first.length/4),nativeOutput=canvasWidth===1920||canvasWidth===3840;
  const sparse=!nativeOutput||fraction<=MAX_NATIVE_CHANGED_PIXEL_FRACTION;
  if(max>limit||!sparse)stats.contractFailures.push({label,max,limit,changedPixels,pixelCount:first.length/4,fraction,sparse});
  if(!auditRounding){
    assert.ok(max<=limit,`${label}: channel difference ${max} > ${limit}, ${changed} changed channels, examples ${JSON.stringify(worst)}`);
    assert.ok(sparse,`${label}: ${changedPixels} changed pixels exceed 0.01% native-output sparsity allowance`);
  }
  stats.comparisons++;stats.maxDifference=Math.max(stats.maxDifference,max);stats.changedChannels+=changed;if(!changed)stats.exactFrames++;
  stats.changedPixels+=changedPixels;stats.maxChangedPixelFraction=Math.max(stats.maxChangedPixelFraction,changedPixels/(first.length/4));
  for(const [delta,count]of Object.entries(histogram))stats.differenceHistogram[delta]=(stats.differenceHistogram[delta]||0)+count;
  if(changed)stats.changedFrames.push({label,max,changed,changedPixels,pixelCount:first.length/4,histogram,worst});
}
function compareScenes(left,right,camera,time,options={},label='glow region parity'){
  // Whole-world HD/4K captures remain exact. Only actual camera crops allow
  // the measured two-level final-composition rounding; smaller fixtures keep
  // their existing one-level ceiling and native outputs also enforce sparsity.
  const limit=left.scale>=4?(camera.zoom>1?2:0):1;
  comparePixels(render(left,camera,time,options),render(right,camera,time,options),label,left.canvas.width,limit);
  assert.equal(right.service.diagnostics().eyes.events,left.service.diagnostics().eyes.events,'Native eye events unchanged');
  if(left.scale===4)stats.hdFrames++;if(left.scale===8)stats.fourKFrames++;
}
const compare=(camera,time,options={},label)=>compareScenes(a,b,camera,time,options,label);
const cameras=[{x:240,y:135,zoom:1},{x:240,y:135,zoom:.67},{x:240,y:135,zoom:1.8},
  {x:49.37,y:54.71,zoom:2.13},{x:431.7,y:219.4,zoom:2.27},{x:14.1,y:251.2,zoom:3.01},
  {x:465.3,y:14.6,zoom:2.75},{x:239.75,y:134.125,zoom:1.997}];
let time=0;
for(const camera of cameras)for(const options of [{},{mask:'dark',prepared:true},{ghost:true,unknown:true},
  {sources:[]},{sources:[geometry(camera.x+width/2/camera.zoom-1,camera.y,Math.PI,72)]},
  {sources:[geometry(camera.x-width/2/camera.zoom-14,camera.y,0,20)],mask:'light'}]){
  compare(camera,time,options);time+=51;
}
// Alternate separated lights and empty frames so old crop content/halos cannot
// survive after a source disappears or moves to the opposite viewport corner.
// A fresh narrow reserve proves this sequence exercises actual crops, rather
// than silently inheriting the fullworld backing from the zoom-out cases.
const movingBefore=scene(before.createSnakeNeon),movingAfter=scene(after.createSnakeNeon);
for(let i=0;i<28;i++){
  const camera={x:65+i*12.7,y:59+i*4.71,zoom:1.51+i*.017};
  const sources=i%3===0?[]:[geometry(camera.x-77,camera.y-51,.2+i*.07),geometry(camera.x+69,camera.y+45,Math.PI-.13*i)];
  compareScenes(movingBefore,movingAfter,camera,time,{sources,ghost:i%7===0},'Cropped moving/edge camera');
  const region=movingAfter.service.diagnostics().captureRegions;
  assert.ok(region.clearPixels<region.fullWorldClearPixels,'Moving camera really uses cropped capture capacity');
  stats.croppedMovingFrames++;time+=33;
}
release(movingBefore);release(movingAfter);
// Full physical HD /4K destinations, same accepted world-raster captures.
// Include non-integer camera projections, all world edges and late prepared
// draws; do not compare a downscaled screenshot instead of the actual output.
for(const scale of [4,8]){
  for(const camera of cameras){
    const left=scene(before.createSnakeNeon),right=scene(after.createSnakeNeon);
    // Prime eye schedules at low output resolution WITHOUT enlarging the
    // camera source reserve or performing unnecessary pixel readbacks.
    for(const age of [0,35,70])for(const instance of [left,right])
      render(instance,camera,time+age,{ghost:true,unknown:true,prepared:true,readback:false});
    resize(left,scale);resize(right,scale);
    compareScenes(left,right,camera,time+120,{ghost:true,unknown:true,prepared:true},
      `native ${scale===4?'HD':'4K'} cropped zoom ${camera.zoom} at ${camera.x},${camera.y}`);
    if(camera.zoom>1){
      const region=right.service.diagnostics().captureRegions;
      assert.ok(region.clearPixels<region.fullWorldClearPixels,'HD/4K comparison must exercise cropped source capacities');
      if(scale===4)stats.croppedHDFrames++;else stats.cropped4KFrames++;
    }
    release(left);release(right);time+=200;
  }
}
assert.equal(stats.croppedHDFrames,6);assert.equal(stats.cropped4KFrames,6);
const ordinary={x:238.3,y:133.7,zoom:2.05};
for(const view of ['absent',null]){compare(ordinary,time,{viewport:view,ghost:true,unknown:true},'Missing viewport uses full capture');time+=37;}
for(const invalid of [{left:NaN,top:0,right:100,bottom:100},{left:100,top:0,right:10,bottom:100},{left:0,top:0,right:0,bottom:100}]){
  // New fail-open camera handling should match the old intentional fullworld
  // mode, not compare against its earlier invalid-input exception.
  comparePixels(render(a,ordinary,time,{viewport:null,ghost:true}),render(b,ordinary,time,{viewport:invalid,ghost:true}),'Invalid viewport full fallback');time+=37;
}
// Reset/restart the game clock in both compositors. Context restoration must
// restore capture transforms and not retain stale clipped crop/save stacks.
a.service.reset();b.service.reset();time=0;compare(ordinary,time,{ghost:true});time+=51;
for(const layer of b.canvases.slice(0,6)){
  layer.testLost(true);
  assert.equal(b.service.beginFrame(b.context,{grid,key:'maze',drawWallArtwork:wallPainter,time,foregroundBounds:[]}),false,'Lost capture fails closed');
  layer.testLost(false);compare(ordinary,time,{prepared:true},'Restored capture');time+=51;
}
// Warm both wide and narrow regions, then repeat camera paths. The pool may
// resize for a new high-water mark, but must not create canvases each frame.
for(const camera of cameras){compare(camera,time,{});time+=23;}
const allocated=b.canvases.length;
for(let i=0;i<160;i++){
  const camera=i<30?cameras[i%cameras.length]:ordinary;
  compare(camera,time,{sources:i%5?makeSources():[]});time+=16;
}
assert.equal(b.canvases.length,allocated,'Steady camera cycle does not allocate surfaces per frame');
// Work and retained-storage diagnostics are reported separately: a smaller
// processed rectangle is not automatically a smaller pooled backing store.
resetWork(a);resetWork(b);compare(ordinary,time,{prepared:true});
const workBefore={...a.work},workAfter={...b.work},diagnostics=b.service.diagnostics();
assert.ok(diagnostics.captureRegions,'Region diagnostics are available for auditing');
assert.ok(workAfter.clearPixels<workBefore.clearPixels,'Zoomed camera clears less capture area');
const region=diagnostics.captureRegions;
for(const name of ['emission','actors']){
  assert.ok(region[name],`${name} region is reported`);
  for(const key of ['x','y','useWidth','useHeight','capacityWidth','capacityHeight'])assert.ok(Number.isFinite(region[name][key]),`${name}.${key} is finite`);
}
const totalBackingBytes=b.canvases.reduce((sum,canvas)=>sum+canvas.width*canvas.height*4,0);
assert.ok(diagnostics.retainedBytes<=totalBackingBytes,'Retained bytes do not exceed all factory allocations');
assert.equal(diagnostics.errors.length,0);
console.log(JSON.stringify({ok:stats.contractFailures.length===0,auditRounding,strictRounding,strictPass:stats.maxDifference<=1,
  roundingAllowance:{nativeCroppedMaximum:2,nativeChangedPixelFraction:MAX_NATIVE_CHANGED_PIXEL_FRACTION,
    nativeFullworldMaximum:0,otherFixturesMaximum:1},...stats,workBefore,workAfter,
  retainedBefore:a.service.diagnostics().retainedBytes,retainedAfter:diagnostics.retainedBytes,
  captureRegions:region,poolStable:true,contextRecovery:true,unknownBounds:true,eyeEvents:diagnostics.eyes.events},null,2));
