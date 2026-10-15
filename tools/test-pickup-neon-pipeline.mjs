import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSnakeNeon} from '../src/render/snake-neon.js';
import {enhancePixels} from '../src/render/neon-material.js';

const require=createRequire(import.meta.url);let native;
for(const location of ['@napi-rs/canvas',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')])try{native=require(location);break;}catch{}
assert.ok(native,'Native Canvas required');
const {createCanvas,loadImage}=native,root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const W=128,H=96,TILE=16,X=48,Y=32,BACKGROUND='#071016';
const camera={x:W/2,y:H/2,zoom:1},viewport={left:0,top:0,right:W,bottom:H};
const grid=Array.from({length:H/TILE},(_,y)=>Array.from({length:W/TILE},(_,x)=>!x||!y||x===7||y===5?'#':'.').join(''));
const wallPainter=c=>{c.fillStyle='#5468e7';c.fillRect(0,0,W,4);};
const dusk=createCanvas(W,H);dusk.getContext('2d').fillRect(0,0,W,H);
// This supported immutable ribbon size exercises actual snake material and
// emission dispatch, not a bypass caused by an arbitrary test texture size.
const ribbon=createCanvas(160,57);ribbon.getContext('2d').fillStyle='#a8ef36';ribbon.getContext('2d').fillRect(0,0,160,57);
const source=createCanvas(80,80);source.getContext('2d').fillStyle='#ed634f';source.getContext('2d').fillRect(0,0,80,80);
const synthetic={kind:'fruit',index:0,source,rect:[0,0,80,80],x:X,y:Y};
const report={nativeAtlasFrames:0,warmFrames:0,opacityCases:0,occlusionCases:0,lifecycleCases:0,preparedOcclusionPasses:0};
function pixels(canvas){return new Uint8ClampedArray(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);}
function exact(actual,expected,label){assert.equal(Buffer.compare(Buffer.from(actual),Buffer.from(expected)),0,label);}
function region(image,x,y,w,h){const result=[];for(let row=y;row<y+h;row++)result.push(...image.subarray((row*W+x)*4,(row*W+x+w)*4));return result;}
function energy(image){let total=0;for(let i=0;i<image.length;i+=4)total+=image[i]+image[i+1]+image[i+2];return total;}
function background(ctx){ctx.resetTransform();ctx.clearRect(0,0,W,H);ctx.fillStyle=BACKGROUND;ctx.fillRect(0,0,W,H);}
function fixture({pickupsEnabled=true}={}){
  const owned=[],optional=[];let phase='',failOptionalAt=Infinity,optionalAttempts=0,fallbackDraws=0;
  const makeCanvas=(w,h)=>{
    const canvas=createCanvas(w,h),context=canvas.getContext('2d'),listeners=new Map();
    const record={canvas,context,w,h,listeners,lost:false,failWhen:null,denied:false};owned.push(record);
    if(phase==='pickup'&&w===1&&h===1){optionalAttempts++;optional.push(record);record.denied=optionalAttempts>=failOptionalAt;}
    const draw=context.drawImage.bind(context);
    context.drawImage=(...args)=>{if(record.failWhen?.(context,args))throw Error('Injected optional pickup draw failure');return draw(...args);};
    context.isContextLost=()=>record.lost;
    canvas.getContext=()=>record.denied?null:context;
    canvas.addEventListener=(name,handler)=>listeners.set(name,handler);
    canvas.removeEventListener=(name,handler)=>{if(listeners.get(name)===handler)listeners.delete(name);};
    return canvas;
  };
  const neon=createSnakeNeon({width:W,height:H,tile:TILE,makeCanvas,pickupsEnabled,creaturesEnabled:false,
    snake:{getNeonSources:()=>[ribbon]}}),canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  const entity={};let lastHandled;
  function begin(){background(ctx);assert.equal(neon.beginFrame(ctx,{grid,key:'pickup-pipeline',drawWallArtwork:wallPainter,
    time:1000,foregroundBounds:[],viewport}),true,'main neon begins even after optional pickup failure');}
  function pickup(options=synthetic,{fallback=true}={}){
    phase='pickup';try{lastHandled=neon.drawPickup(entity,options);}finally{phase='';}
    if(!lastHandled&&fallback){
      // Native-art fallback in this isolated fixture, with an explicit actor
      // crop. Whole-engine fallback selection is covered by integration QA.
      neon.setForegroundBounds({left:options.x,top:options.y,right:options.x+TILE,bottom:options.y+TILE});
      const c=neon.actorsContext();c.save();try{c.globalAlpha=Math.max(0,Math.min(1,options.opacity??1));
        c.drawImage(options.source,...options.rect,options.x,options.y,TILE,TILE);fallbackDraws++;}finally{c.restore();}
    }
    return lastHandled;
  }
  function snake({prepared=false,cover=true}={}){
    const rect=cover?[X-8,Y-8,32,32]:[88,56,24,24],c=neon.snakeContext();
    if(prepared)c.paintPreparedSurface((destination,resolve,mode)=>{
      // The real prepared painter uses native alpha for occlusion, never the
      // opaque-black emission ribbon. Assert the extra pickup-cover route.
      if(destination.canvas===optional[1]?.canvas)assert.equal(mode.occlusion,true,'prepared pickup cover explicitly requests native alpha');
      if(mode.occlusion)report.preparedOcclusionPasses++;
      const texture=mode.occlusion?ribbon:resolve(ribbon);if(texture)destination.drawImage(texture,...rect);
    });else c.drawImage(ribbon,...rect);
  }
  function actor(){neon.setForegroundBounds({left:X-8,top:Y-8,right:X+24,bottom:Y+24});
    const c=neon.actorsContext();c.fillStyle='#a33b57';c.fillRect(X-8,Y-8,32,32);}
  function present(){assert.equal(neon.present(ctx,dusk,camera),true,'optional pickup failures cannot disable main presentation');
    assert.equal(neon.diagnostics().enabled,true);assert.deepEqual(neon.diagnostics().errors,[]);return pixels(canvas);}
  function frame({pickup:draw=true,options=synthetic,snake:drawSnake=false,actor:drawActor=false,prepared=false}={}){
    begin();if(draw)pickup(options);if(drawSnake)snake({prepared});if(drawActor)actor();return present();}
  return {neon,canvas,ctx,owned,optional,begin,pickup,snake,actor,present,frame,
    denyOptionalFrom:n=>{failOptionalAt=n;},allowOptional:()=>{failOptionalAt=Infinity;},
    get attempts(){return optionalAttempts;},get fallbackDraws(){return fallbackDraws;},get lastHandled(){return lastHandled;}};
}
function expectedMaterial(source,rect,opacity){
  const native=createCanvas(rect[2],rect[3]),n=native.getContext('2d');n.drawImage(source,...rect,0,0,rect[2],rect[3]);
  const image=n.getImageData(0,0,native.width,native.height);image.data.set(enhancePixels(image.data,.7));n.putImageData(image,0,0);
  const result=createCanvas(W,H),c=result.getContext('2d');background(c);c.globalAlpha=opacity;c.drawImage(native,X,Y,TILE,TILE);return pixels(result);
}

// Use every approved native atlas region through the REAL orchestrator; the
// independently calculated material raster includes native Canvas rounding.
for(const size of [80,160]){
  const quality=size===80?'hd':'4k',f=fixture(),cases=[];
  for(const kind of ['fruit','egg']){
    const atlas=await loadImage(path.join(root,`assets/atlases/${quality}/modern-${kind==='fruit'?'fruits':'eggs'}-${size}.png`));
    for(let index=0;index<4;index++){
      const options={kind,index,source:atlas,rect:[index*size,0,size,size],x:X,y:Y,opacity:.625};
      f.begin();assert.equal(f.pickup(options),true);exact(pixels(f.canvas),expectedMaterial(atlas,options.rect,.625),`${quality} ${kind}${index}: exact enhanced native material and pulse alpha`);
      const lit=f.present();cases.push({options,lit});report.nativeAtlasFrames++;
    }
  }
  const warm=f.neon.diagnostics(),allocations=f.owned.length;
  assert.equal(warm.pickups.entries,8);assert.equal(warm.pickups.cpuReads,8);assert.equal(warm.pickups.builds,8);
  assert.equal(f.optional.length,2,'one reusable optional emission/cover pair per profile');
  for(let repeat=0;repeat<3;repeat++)for(const {options,lit}of cases){exact(f.frame({options}),lit,'warm cached frame is byte-exact');report.warmFrames++;}
  assert.equal(f.owned.length,allocations,'warm orchestration allocates no canvas');
  assert.equal(f.neon.diagnostics().pickups.cpuReads,8,'no live pickup reads');
  assert.equal(f.neon.diagnostics().pickups.nativeBytes,8*2*size*size*4);
  const empty=f.frame({pickup:false}),pristine=fixture().frame({pickup:false});exact(empty,pristine,'removed pickups leave no material, emission or reflection');
  assert.equal(f.neon.diagnostics().pickups.sources,0);report.lifecycleCases++;
}

// Pulse is presentation-only: native material opacity and all emitted light
// decrease with it, while a zero pulse creates no light source or capture.
const pulse=fixture(),levels=[];
for(const opacity of [0,.25,.5,.75,1]){
  pulse.begin();const handled=pulse.pickup({...synthetic,opacity});assert.equal(handled,opacity>0);
  const before=pixels(pulse.canvas);exact(before,expectedMaterial(source,synthetic.rect,opacity),'exact pulse alpha before lighting');
  const after=pulse.present();levels.push(energy(after));
  if(opacity>0)assert.ok(energy(after)>energy(before),'the actual lighting pass contributes beyond the enhanced material');
  assert.equal(pulse.neon.diagnostics().pickups.sources,opacity>0?1:0);report.opacityCases++;
}
for(let i=1;i<levels.length;i++)assert.ok(levels[i]>levels[i-1],'material/emission/reflection fade monotonically, not just the source sprite');
const untouched=fixture();untouched.frame({pickup:false,snake:true});assert.equal(untouched.optional.length,0);
assert.equal(untouched.neon.diagnostics().pickups.entries,0,'snake-only path does not prepare pickup art');

for(const prepared of [false,true]){
  const f=fixture(),control=fixture();
  const covered=f.frame({snake:true,prepared}),snakeOnly=control.frame({pickup:false,snake:true,prepared});
  exact(region(covered,X+3,Y+3,10,10),region(snakeOnly,X+3,Y+3,10,10),'opaque snake alpha erases earlier pickup emission');
  const allocationCount=f.owned.length;
  exact(f.frame({snake:true,prepared}),covered,'reused snake pickup-cover proxy is stable');assert.equal(f.owned.length,allocationCount);
  f.begin();f.pickup();const paired=f.neon.snakeContext();assert.equal(f.neon.snakeContext(),paired,'reuse optional proxy within frame');f.snake({prepared});f.present();
  f.begin();f.pickup();assert.equal(f.neon.snakeContext(),paired,'reuse optional proxy across frames');f.snake({prepared});f.present();
  exact(f.frame({pickup:false,snake:true,prepared}),snakeOnly,'pickup removal restores the exact snake-only output');
  const hidden=f.frame({actor:true}),actorOnly=control.frame({pickup:false,actor:true});
  exact(region(hidden,X+3,Y+3,10,10),region(actorOnly,X+3,Y+3,10,10),'later opaque actors occlude pickup emission');
  report.occlusionCases+=3;
}
assert.ok(report.preparedOcclusionPasses>=5,'native prepared path visits both common alpha and optional pickup-cover masks');

// Deny either first or second optional capture. The latch spans frames and
// entities; invalidate/reset allow recovery without poisoning main neon.
for(const deniedAt of [1,2])for(const recovery of ['invalidate','reset']){
  const f=fixture();f.denyOptionalFrom(deniedAt);f.begin();assert.equal(f.pickup(),false);f.snake({cover:false});f.present();
  const failures=f.neon.diagnostics().pickups.captureFailures,allocations=f.owned.length;
  for(let frame=0;frame<12;frame++){f.begin();assert.equal(f.pickup(),false);f.snake({cover:false});f.present();}
  assert.equal(f.attempts,deniedAt,'persistent allocation failure retries only after explicit recovery');
  assert.equal(f.owned.length,allocations);assert.equal(f.neon.diagnostics().pickups.captureFailures,failures);
  assert.equal(f.fallbackDraws,13,'one native fallback per failed pickup draw');
  assert.ok(f.optional.filter(r=>r.denied).every(r=>r.canvas.width===1&&r.canvas.height===1),'failed allocation retains no large backing');
  f.allowOptional();f.neon[recovery]();f.begin();assert.equal(f.pickup(),true);f.snake({cover:false});f.present();
  assert.ok(f.neon.diagnostics().pickups.captureBytes>8);report.lifecycleCases++;
}

// Optional local draw failures are isolated: the visible art is not replayed,
// snake lighting stays live, and a cleared/rebuilt pickup pair recovers.
for(const boundary of ['cover','foreground-erase','merge']){
  const f=fixture();f.frame();assert.equal(f.optional.length,2);
  const [emission,cover]=f.optional;
  const victim=boundary==='cover'?cover:emission;
  victim.failWhen=(c,args)=>boundary==='cover'||c.globalCompositeOperation==='destination-out'&&
    (boundary==='merge'?args[0]===cover.canvas:args[0]!==cover.canvas);
  f.begin();assert.equal(f.pickup(),true);if(boundary==='foreground-erase')f.actor();f.snake({cover:false});
  const before=f.fallbackDraws,actual=f.present();assert.equal(f.fallbackDraws,before,'already painted pickup is never replayed');
  assert.ok(f.neon.diagnostics().pickups.captureFailures>0,`${boundary}: injected failure observed`);
  const control=fixture();control.begin();control.snake({cover:false});const snakeOnly=control.present();
  exact(region(actual,94,62,8,8),region(snakeOnly,94,62,8,8),`${boundary}: established snake emission is retained`);
  victim.failWhen=null;const recovered=f.frame();exact(recovered,fixture().frame(),`${boundary}: subsequent frame recovers exact pickup output`);
  report.lifecycleCases++;
}

for(const signal of ['poll','event'])for(const index of [0,1]){
  const f=fixture();f.frame();const lost=f.optional[index];
  if(signal==='poll')lost.lost=true;else{lost.lost=true;lost.listeners.get('contextlost')();}
  f.begin();assert.equal(f.pickup(),false);f.snake({cover:false});f.present();
  // A lost optional layer is irrelevant in a later snake-only frame.
  const snakeOnly=f.frame({pickup:false,snake:true});exact(snakeOnly,fixture().frame({pickup:false,snake:true}),'unused lost pickup captures cannot suppress snake neon');
  lost.lost=false;if(signal==='event')lost.listeners.get('contextrestored')();
  exact(f.frame(),fixture().frame(),'polled/event context restoration rebuilds clean optional capture');report.lifecycleCases++;
}

const disabled=fixture({pickupsEnabled:false});disabled.begin();assert.equal(disabled.pickup(),false);disabled.snake({cover:false});disabled.present();
assert.equal(disabled.optional.length,0);assert.equal(disabled.neon.diagnostics().pickups.entries,0);assert.equal(disabled.fallbackDraws,1);report.lifecycleCases++;
console.log(JSON.stringify({passed:true,...report,pulseEnergy:levels,
  scope:'Actual createSnakeNeon, native80/160 atlases, exact material/alpha/warm/removal pixels, snake and actor occlusion, optional allocation/draw/context-loss recovery. No browser/GPU appearance or performance claim.'},null,2));
