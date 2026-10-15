import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createSideTipBend,sideTipPoint,mouthIntakePose,buildMouthIntakeMask} from '../src/render/snake-mouth-intake.js';
import {morphLiveMouthFrame,createLiveMouthService,LIVE_MOUTH_FRAMES} from '../src/render/live-mouth.js';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';

const near=(a,b,message,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${message}: ${a} versus ${b}`);
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
let bends=0,anatomy=0;
for(const bank of [0,2])for(const rotation of [-.2,0,.2])for(const sign of [-1,1])for(const scale of [.5,1,2]){
  const heading=rotation+(bank===2?Math.PI:0),co=Math.cos(rotation),si=Math.sin(rotation),size=36*scale,reach=size*74/160;
  const intake=Object.freeze({tipCurl:true,bank,rotation,size,reach,referenceScale:scale,pose:Object.freeze({x:0,y:0,angle:heading})});
  const tipAt=(forward,y=0)=>Object.freeze({x:co*(bank===2?-forward:forward)-si*y,y:si*(bank===2?-forward:forward)+co*y,
    angle:heading+(sign<0?Math.PI:0)});
  assert.equal(createSideTipBend(tipAt(reach+1.5001*scale),36*scale,intake,sign),null,'no early attraction before the visible mouth front');
  assert.equal(createSideTipBend(tipAt(-size),36*scale,intake,sign),null,'no attraction behind the player');
  assert.equal(createSideTipBend(tipAt(reach,size),36*scale,intake,sign),null,'other lanes remain untouched');
  for(const span of [.05,.5,1,4,12,36,72].map(x=>x*scale)){
    const tip=tipAt(reach-4.5*scale),bend=createSideTipBend(tip,span,intake,sign);
    assert.ok(bend);near(bend.length,span,'whole-tail support');
    const amplitude=Math.hypot(bend.dx,bend.dy);
    assert.ok(amplitude<=Math.min(3.2*scale,span*.17)+1e-12,'accepted shallow bend stays scale independent');
    for(const otherBank of [1,3])assert.equal(createSideTipBend(tip,span,{...intake,bank:otherBank},sign),null,'vertical ingestion unchanged');
    assert.equal(createSideTipBend(tip,span,{...intake,tipCurl:false},sign),null,'disabled mode is exact prior art');
    const base=Object.freeze({x:20,y:30,angle:heading+(sign<0?Math.PI:0)});
    assert.equal(sideTipPoint(base,span,sign,bend),base,'root position and tangent retain exact original object');
    assert.equal(sideTipPoint(base,span+1,sign,bend),base,'body and skull are outside the bend support');
    for(const fraction of [.1,.5,.75,.9]){
      const p=sideTipPoint(base,span*fraction,sign,bend),drop=Math.hypot(p.x-base.x,p.y-base.y);
      assert.ok(drop>0,'deflection extends over the full tail, past the former18px/65% boundary');
      near(drop,amplitude*(1-smooth(fraction)),'one quintic profile');
      assert.ok(Math.cos(p.angle-base.angle)>.95,'small tails never fold or hook backwards');bends++;
    }
    const delta=d=>{const p=sideTipPoint(base,d,sign,bend);return [p.x-base.x,p.y-base.y];};
    const h=span*1e-4;
    for(const edge of [0,span]){
      const [a,b,c]=edge===0?[delta(0),delta(h),delta(2*h)]:[delta(edge-h),delta(edge),delta(edge+h)];
      for(let axis=0;axis<2;axis++){
        near((b[axis]-a[axis])/h*span,0,'flat endpoint tangent',.0003*scale);
        near((c[axis]-2*b[axis]+a[axis])/(h*h)*span*span,0,'C2 root curvature',.05*scale);bends++;
      }
    }
  }
}
for(const [dir,bank] of [[{x:1,y:0},0],[{x:0,y:1},1],[{x:-1,y:0},2],[{x:0,y:-1},3]]){
  const actor=Object.freeze({x:99,y:98,dir:Object.freeze(dir),controllerTiltDegrees:12});
  const pose=mouthIntakePose(actor,400,{playerPosition:(entity,time)=>{assert.equal(entity,actor);assert.equal(time,400);return {x:3,y:4};}});
  assert.equal(pose.bank,bank);near(pose.pose.x,126,'uses actual native interpolation, not destination cell');near(pose.pose.y,162,'native interpolation y');
  near(pose.rotation,Math.PI/15,'native controller tilt preserved');near(pose.reach,16.65,'actual sprite front offset');
}
assert.equal(mouthIntakePose({dead:true},0),null);assert.equal(mouthIntakePose({dir:{x:0,y:0}},0),null);

const require=createRequire(import.meta.url);
const {createCanvas,loadImage,Image}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas'));
const manifest={};vm.runInNewContext(readFileSync(new URL('../src/config/render-atlas.js',import.meta.url),'utf8'),manifest);
const image=await loadImage(fileURLToPath(new URL('../assets/atlases/hd/modern-characters-80.png',import.meta.url)));
const crop=name=>{
  const [,x,y,w,h]=manifest.MAZE_BITERS_RENDER_ATLAS.characters[`player:p1:normal:${name}`];
  const c=createCanvas(w/2,h/2),ctx=c.getContext('2d');ctx.drawImage(image,x/2,y/2,w/2,h/2,0,0,w/2,h/2);
  return ctx.getImageData(0,0,c.width,c.height);
};
let lastInlet=Infinity;
for(const bank of [0,1,2]){
  const direction=[2,3,4][bank],open=crop(`Head${direction}`),closed=crop(`Head${direction}Close`);
  for(let frame=0;frame<LIVE_MOUTH_FRAMES;frame++){
    const closure=frame/(LIVE_MOUTH_FRAMES-1),data=morphLiveMouthFrame(open,closed,bank,closure),before=data.slice();
    const mask=buildMouthIntakeMask({width:80,height:80,data},bank,closure),alpha=(x,y)=>mask[(y*80+x)*4+3];
    assert.deepEqual(data,before,'source pixels are never edited');
    for(let y=0;y<45;y++)for(let x=0;x<80;x++){assert.equal(alpha(x,y),0,'cap, eyes and upper lip cannot be overwritten');anatomy++;}
    for(let y=45;y<53;y++)for(let x=10;x<73;x++){
      const i=(y*80+x)*4;
      if(data[i+3]>245&&Math.min(data[i],data[i+1],data[i+2])>155){assert.equal(alpha(x,y),0,'bright actual upper teeth remain foreground');anatomy++;}
    }
    if(bank===1){
      for(let y=55;y<80;y++)assert.ok(alpha(40,y)>180,'lower inlet stays continuously connected to the mouth');
      let width=0;for(let x=0;x<80;x++)if(alpha(x,77)>127)width++;
      assert.ok(width<=lastInlet,'closing mouth narrows the inlet monotonically');lastInlet=width;
      assert.ok(width>=20&&width<=34);assert.equal(alpha(40,40),0,'upper lip occludes tail');
    }else{
      const edge=bank===0?79:0;
      assert.ok(alpha(edge,Math.round((116-closure*9)/2))>180,'horizontal mouth opens to the exterior');
    }
  }
}
assert.equal(lastInlet,20);
assert.ok(buildMouthIntakeMask({width:80,height:80,data:new Uint8ClampedArray(80*80*4)},3,.5).every(value=>value===0));

// Real production renderer + live mouth cache: not a stand-in tail or a
// separately reconstructed compositor. Only the test PNG loader drops caBX.
const previousDocument=globalThis.document,previousImage=globalThis.Image;
let allocations=0,pixelReads=0;
const makeCanvas=(w,h)=>{
  allocations++;const c=createCanvas(w,h),ctx=c.getContext('2d'),read=ctx.getImageData.bind(ctx);
  ctx.getImageData=(...args)=>{pixelReads++;return read(...args);};return c;
};
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return makeCanvas(1,1);}};
globalThis.Image=class extends Image{set src(value){
  const bytes=readFileSync(fileURLToPath(value)),chunks=[bytes.subarray(0,8)];
  for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),kind=bytes.toString('ascii',p+4,p+8);
    if(kind!=='caBX')chunks.push(bytes.subarray(p,p+n+12));p+=n+12;}
  super.src=Buffer.concat(chunks);
}};
let overlayPixels=0,foregroundPixels=0;
try{
  const sources={};for(const direction of [1,2,3,4]){
    sources[`Head${direction}`]=crop(`Head${direction}`);
    if(direction!==1)sources[`Head${direction}Close`]=crop(`Head${direction}Close`);
  }
  const mouth=createLiveMouthService({makeCanvas,readSprite:source=>source,playerPosition:p=>p,yieldTask:async()=>{}});
  await mouth.prepare({player:{p1:{normal:sources}}});
  const snake=createLiveSnakeRenderer({tile:16,playerPosition:p=>p});await snake.prepare();
  const baseline={allocations,pixelReads};
  const surface=createCanvas(512,512),ctx=surface.getContext('2d'),maskSurface=createCanvas(512,512),maskCtx=maskSurface.getContext('2d');
  const matrix=c=>{const m=c.getTransform();return [m.a,m.b,m.c,m.d,m.e,m.f];};
  const consumers=[];
  for(const bank of [0,1,2])for(const tilt of [0,12]){
    const direction=[{x:1,y:0},{x:0,y:1},{x:-1,y:0}][bank];
    const body=Array.from({length:5},(_,i)=>({x:8+(4-i)*direction.x,y:8+(4-i)*direction.y}));
    const entity={body,dir:{...direction},color:'#35e55b',reversing:false};
    const token=snake.capture(entity,100),tip=snake.inspect(entity,100).tail;
    const player={x:(tip.x-direction.x*12)/36-.5,y:(tip.y-direction.y*12)/36-.5,dir:{...direction},moveDuration:95,
      controllerTiltDegrees:tilt};
    entity.body.pop();const plan=snake.biteTail(entity,token,{t:100,player});assert.ok(plan);
    mouth.bite(player,100,100,0);
    const dir=[2,3,4][bank],descriptor=mouth.sprite(player,100,{open:sources[`Head${dir}`],closed:sources[`Head${dir}Close`],bank});
    const cx=(player.x+.5)*16,cy=(player.y+.5)*16,rotation=tilt*Math.PI/180;
    const transform=c=>{c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,512,512);c.setTransform(10,0,0,10,256-cx*10,256-cy*10);};
    transform(ctx);snake.draw(ctx,entity,100);
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,512,512);ctx.setTransform(10,0,0,10,256-cx*10,256-cy*10);
    const before=matrix(ctx);ctx.globalAlpha=.83;const beforeAlpha=ctx.globalAlpha;
    assert.equal(snake.drawMouthIntake(ctx,player,100,{mouth,descriptor,visual:player}),true);
    assert.deepEqual(matrix(ctx),before,'overlay restores caller camera/world transform');near(ctx.globalAlpha,beforeAlpha,'overlay restores caller alpha',1e-6);
    const overlay=ctx.getImageData(0,0,512,512).data;const visibleCount=overlay.filter((value,index)=>index%4===3&&value>0).length;overlayPixels+=visibleCount;
    if(tilt===0)assert.ok(visibleCount>0,`native bank${bank} has actual intake pixels`);
    transform(maskCtx);maskCtx.translate(cx,cy);maskCtx.rotate(rotation);
    mouth.drawIntakeMask(maskCtx,descriptor,-8,-8,16,16);
    const mask=maskCtx.getImageData(0,0,512,512).data;
    // Rendering both layers at the same160px physical mouth resolution makes
    // the alpha mask comparison exact even while the controller is tilted.
    for(let i=3;i<mask.length;i+=4)if(mask[i]===0){assert.equal(overlay[i],0,'snake pixels never cover the upper lip/teeth or leave the aperture');foregroundPixels++;}
    const movement=JSON.stringify(player);snake.drawMouthIntake(ctx,player,100,{mouth,descriptor,visual:player});
    assert.equal(JSON.stringify(player),movement,'intake does not alter native player pose');
    consumers.push({player,descriptor,entity});
  }
  assert.ok(overlayPixels>0,'actual production tail pixels appear in the mouth, not only a blank successful pass');
  assert.equal(allocations,baseline.allocations,'overlay creates no runtime canvases');
  assert.equal(pixelReads,baseline.pixelReads,'overlay reads no runtime pixels');
  for(const {player,descriptor} of consumers)assert.equal(snake.drawMouthIntake(ctx,player,100,{mouth,descriptor,visual:player}),true,'different consumers retain independent overlays');
  const first=consumers[0],replacement={...first.player,dir:{...first.player.dir}},nextToken=snake.capture(first.entity,101);
  first.entity.body.pop();snake.biteTail(first.entity,nextToken,{t:101,player:replacement});
  assert.equal(snake.drawMouthIntake(ctx,first.player,101,{mouth,descriptor:first.descriptor,visual:first.player}),false,
    'a snake transferred to another eater is not replayed under its former consumer');
  assert.equal(snake.drawMouthIntake(ctx,replacement,101,{mouth,descriptor:first.descriptor,visual:replacement}),true);
  assert.equal(snake.drawMouthIntake(ctx,consumers[1].player,99,{mouth,descriptor:consumers[1].descriptor,visual:consumers[1].player}),false,
    'an intake cannot appear before its contact event');
  assert.equal(snake.drawMouthIntake(ctx,consumers[1].player,100,{mouth,descriptor:consumers[1].descriptor,visual:consumers[1].player}),true,
    'scrubbing before contact retains the future intake for deterministic99-to100 replay');
  consumers.push({player:replacement,descriptor:first.descriptor});
  snake.reset();
  for(const {player,descriptor} of consumers)assert.equal(snake.drawMouthIntake(ctx,player,100,{mouth,descriptor,visual:player}),false,'reset clears every consumer association');
  mouth.dispose();
}finally{
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  if(previousImage===undefined)delete globalThis.Image;else globalThis.Image=previousImage;
}
console.log(`Snake mouth intake passed: ${bends} late whole-tail, scale, C2 root and direction checks; ${anatomy} actual-art anatomy checks; ${overlayPixels} real ingestion pixels and ${foregroundPixels} protected outside-aperture pixels across native mouth directions/tilts. No native movement, source pixels, runtime allocation or pixel reads changed.`);
