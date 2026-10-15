// Read-only anatomical regression against the approved P1 native mouth frames.
// Set FANTASY_MOUTH_ASSET_ROOT to the approved size-study assets directory
// while testing before the final compact production pack is available.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {buildFantasyMouthIntakeMask,fantasyMouthIntakePose,fantasyMouthTarget,FANTASY_INTAKE,FANTASY_INTAKE_JAW_RIG,fantasyIntakeJawY} from '../src/render/fantasy-mouth-intake.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const assetRoot=process.env.FANTASY_MOUTH_ASSET_ROOT||path.join(root,'../assets/fantasy-biters');
const modules=process.env.MAZE_NODE_MODULES||'C:/Users/tcher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require=createRequire(import.meta.url),sharp=require(path.join(modules,'sharp'));
let checks=0,maskFrames=0,protectedToothPixels=0,jawMapChecks=0,targetCavityChecks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const near=(a,b,label,epsilon=1e-9)=>check(Math.abs(a-b)<=epsilon,`${label}: ${a} vs ${b}`);
// Independent approved native fit: horizontal coordinates about the cell center.
const fitX=x=>80+(x-80)*1.125;
function frame(data,width,size,index,columns){
  const out=Buffer.alloc(size*size*4),x=index%columns*size,y=Math.floor(index/columns)*size;
  for(let row=0;row<size;row++)data.copy(out,row*size*4,((y+row)*width+x)*4,((y+row)*width+x+size)*4);
  return out;
}
function mirror(data,size){
  const out=Buffer.alloc(data.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)out.set(data.subarray((y*size+size-1-x)*4,(y*size+size-x)*4),(y*size+x)*4);
  return out;
}
const manifest=JSON.parse(await fs.readFile(path.join(assetRoot,'manifest.json'),'utf8'));
const referenceMode=manifest.profiles?.hd?.sets?'production-compact':'full-reference';
async function referenceFrames(profile,direction,palette='p1'){
  const spec=manifest.profiles[profile],size=spec.size;
  if(spec.sheets){
    const {data,info}=await sharp(path.join(assetRoot,spec.sheets[`${palette}:${direction}`])).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    return Array.from({length:manifest.frames},(_,index)=>frame(data,info.width,size,index,manifest.columns));
  }
  const set=spec.sets?.[`${palette}:normal:${direction}`];
  assert.ok(set,`Native canonical P1 ${profile} ${direction} set is available`);
  const base=await sharp(path.join(assetRoot,set.base)).ensureAlpha().raw().toBuffer();
  const patch=set.mouth,{data,info}=await sharp(path.join(assetRoot,patch.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  check(base.length===size*size*4,'compact base has expected native dimensions');
  check(patch.frames===manifest.frames,'compact mouth sheet includes all approved frames');
  return Array.from({length:manifest.frames},(_,index)=>{
    const out=Buffer.from(base),sx=index%patch.columns*patch.cellWidth+patch.guard,sy=Math.floor(index/patch.columns)*patch.stride+patch.guard;
    for(let row=0;row<patch.height;row++){
      const start=((sy+row)*info.width+sx)*4;
      // Native RGBA replacement, not source-over: semi-transparent contours
      // must stay identical to the approved standalone sprite.
      data.copy(out,((patch.y+row)*size+patch.x)*4,start,start+patch.width*4);
    }
    return out;
  });
}
check(manifest.frames===49,'approved reference contains 49 stronger-mouth frames');
check(manifest.artRevision===5&&manifest.amplitudeScale===2,'reference is approved revision5/double-amplitude artwork');
check(manifest.sizeFit?.scaleX===1.125&&manifest.sizeFit?.scaleY===1,'reference uses approved width-only fit');
check(manifest.sizeFit?.pivot?.[0]===.5&&manifest.sizeFit?.pivot?.[1]===.5,'fit retains center pivot');
near(FANTASY_INTAKE.widthScale,manifest.sizeFit.scaleX,'intake fit matches native assets');
near(FANTASY_INTAKE.sideReach,64*1.125,'visual curl reach follows horizontal distance fit');
near(FANTASY_INTAKE.sideTargetX,fitX(108),'side cavity target follows centered fit');
near(FANTASY_INTAKE.frontHalfOpen,30*1.125,'open front inlet follows width fit');
near(FANTASY_INTAKE.frontHalfBite,26*1.125,'bite front inlet follows width fit');
for(const [key,value]of Object.entries(FANTASY_INTAKE_JAW_RIG))check(manifest.rig?.[key]===value,`intake shares approved stronger rig ${key}`);
// Independent analytic contract from the approved manifest. Low closure keeps
// the original quintic ramp; high closure bounds the slope without folding.
const unit=value=>Math.max(0,Math.min(1,value));
const quintic=value=>{const t=unit(value);return 6*t**5-15*t**4+10*t**3;};
function approvedJawY(x,y,bank,t){
  const r=manifest.rig,u=unit((y-r.fixedThroughY)/(r.translationFromY-r.fixedThroughY)),a=r.rampShoulder;
  const area=q=>2.5*q**4-3*q**5+q**6;
  const bounded=u<a?a*area(u/a)/(1-a):u>1-a?1-a*area((1-u)/a)/(1-a):(u-a/2)/(1-a);
  const blend=quintic((t-r.flattenFromClosure)/(r.flattenAtClosure-r.flattenFromClosure));
  const lateral=bank===1?quintic((x-16)/28)*quintic((144-x)/28):quintic((x-24)/66);
  return y-(bank===1?r.downLift:r.rightLift)*t*lateral*((1-blend)*quintic(u)+blend*bounded);
}
for(const bank of [0,1])for(let frame=0;frame<49;frame++)for(let x=0;x<=160;x+=4)for(let y=92;y<=160;y+=2){
  const closure=frame/48;
  near(fantasyIntakeJawY(fitX(x),y,bank,closure),approvedJawY(x,y,bank,closure),'same approved jaw Y at horizontally fitted X',1e-8);jawMapChecks++;
  if(bank===0)near(fantasyIntakeJawY(160-fitX(x),y,2,closure),fantasyIntakeJawY(fitX(x),y,0,closure),'left uses exactly mirrored fitted rig');
}
for(const [profile,size]of [['hd',80],['4k',160]]){
  const spec=manifest.profiles[profile];
  check(spec.size===size,'profile retains its approved native size');
  for(const [direction,bank]of [['right',0],['down',1]]){
    const frames=await referenceFrames(profile,direction);
    let previousInlet=Infinity;
    for(let f=0;f<49;f++){
      const closure=f/48,pixels=frames[f],before=Buffer.from(pixels);
      const mask=buildFantasyMouthIntakeMask({width:size,height:size,data:pixels},bank,closure),alpha=(x,y)=>mask[(y*size+x)*4+3];
      check(before.equals(pixels),'mask construction never mutates approved pixels');check(mask.length===pixels.length,'mask size matches native source');
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const i=(y*size+x)*4,sourceY=(y+.5)*160/size;
        if(sourceY<92)check(alpha(x,y)===0,'skull, eyes and upper face remain in foreground');
        if(sourceY<=114&&pixels[i+3]>128&&Math.min(pixels[i],pixels[i+1],pixels[i+2])>=155){
          check(alpha(x,y)===0,'every bright upper-tooth/highlight pixel remains foreground');protectedToothPixels++;
        }
        // Canonical green upper-lip paint cannot become an ingestion surface.
        if(sourceY<108&&pixels[i+3]>230&&pixels[i+1]>145&&pixels[i+1]>pixels[i]*1.35&&pixels[i+1]>pixels[i+2]*1.35)
          check(alpha(x,y)===0,'green upper lip stays in foreground');
      }
      if(bank===1){
        const x=Math.floor(size/2),start=Math.ceil(120*size/160);
        for(let y=start;y<size;y++)check(alpha(x,y)>220,'lower inlet remains connected from mouth to sprite edge');
        let width=0;for(let x=0;x<size;x++)if(alpha(x,size-2)>127)width++;
        check(width<=previousInlet,'stronger closing never widens the bottom inlet');
        check(width>=Math.floor(50*1.125*size/160)&&width<=Math.ceil(61*1.125*size/160),'down inlet follows approved horizontal open/closed fit');previousInlet=width;
      }else{
        check(alpha(size-1,Math.round(119*size/160))>200,'side cavity remains connected to exterior');
        const leftSource=mirror(pixels,size),left=buildFantasyMouthIntakeMask({width:size,height:size,data:leftSource},2,closure);
        check(Buffer.from(left).equals(mirror(Buffer.from(mask),size)),'left mask exactly mirrors right mask');
      }
      maskFrames++;
    }
  }
  for(const palette of ['p1','p2','ai'])for(const [direction,x,y]of [['right',111.5,111],['down',80,110]]){
    for(const pixels of await referenceFrames(profile,direction,palette)){
      const index=(Math.floor(y*size/160)*size+Math.floor(x*size/160))*4;
      check(pixels[index+3]>128,'ghost target stays inside painted mouth cavity');
      check(Math.max(pixels[index],pixels[index+1],pixels[index+2])<120,`${profile}/${palette}/${direction} ghost target stays on dark cavity, never bright lower lip or upper teeth`);targetCavityChecks++;
    }
  }
}
check(protectedToothPixels>0,'test actually examined bright upper-tooth pixels');
// These aperture-only witnesses were still exposed by the old8px/10px mask.
// At the stronger endpoint they must close, while the front inlet stays open.
const clear160={width:160,height:160,data:new Uint8ClampedArray(160*160*4)};
for(const [bank,x,y]of [[0,159,130],[1,40,118]]){
  const open=buildFantasyMouthIntakeMask(clear160,bank,0),closed=buildFantasyMouthIntakeMask(clear160,bank,1),index=(y*160+x)*4+3;
  check(open[index]===255&&closed[index]===0,'aperture really follows full stronger lower-lip travel, not former gentle envelope');
}
const frontClosed=buildFantasyMouthIntakeMask(clear160,1,1);
check(frontClosed[(159*160+80)*4+3]===255,'front inlet stays connected below raised lower lip');
const empty={width:80,height:80,data:new Uint8ClampedArray(80*80*4)};
check(buildFantasyMouthIntakeMask(empty,3,.5).every(v=>v===0),'back view has no mouth intake mask');
for(const bank of [-1,4,NaN])assert.throws(()=>buildFantasyMouthIntakeMask(empty,bank,.5),TypeError);
assert.throws(()=>buildFantasyMouthIntakeMask(empty,0,NaN),TypeError);
assert.throws(()=>fantasyIntakeJawY(80,120,3,.5),TypeError);
assert.throws(()=>fantasyIntakeJawY(NaN,120,0,.5),TypeError);

for(const [dir,bank]of [[{x:1,y:0},0],[{x:0,y:1},1],[{x:-1,y:0},2],[{x:0,y:-1},3]])for(const tile of [16,36,72])for(const tilt of [-19,0,19]){
  const entity=Object.freeze({x:99,y:98,dir:Object.freeze(dir),controllerTiltDegrees:tilt});
  const position=Object.freeze({x:3.25,y:4.5}),playerPosition=(actor,time)=>{assert.equal(actor,entity);assert.equal(time,500);return position;};
  const pose=fantasyMouthIntakePose(entity,500,{playerPosition,tile});
  check(pose.bank===bank,'native direction maps to matching bank');near(pose.pose.x,(position.x+.5)*tile,'native interpolated x');near(pose.pose.y,(position.y+.5)*tile,'native interpolated y');
  near(pose.rotation,tilt*Math.PI/180,'native controller tilt retained');near(pose.reach,tile*FANTASY_INTAKE.sideReach/160,'calibrated reach scales with caller coordinates');
  const out={},target=fantasyMouthTarget(entity,500,{playerPosition,tile},out);check(target===out,'target can reuse caller output');
  const dx=target.x-pose.pose.x,dy=target.y-pose.pose.y,co=Math.cos(pose.rotation),si=Math.sin(pose.rotation);
  const localX=(dx*co+dy*si)*160/tile+80,localY=(-dx*si+dy*co)*160/tile+80;
  near(localX,[111.5,80,48.5,80][bank],'target x is fitted Fantasy cavity');near(localY,[111,110,111,52][bank],'target y remains inside stronger Fantasy cavity');
  check(entity.x===99&&entity.y===98&&entity.controllerTiltDegrees===tilt,'visual helpers leave movement state untouched');
}
check(fantasyMouthIntakePose({dead:true},0)===null,'dead actor has no intake');
check(fantasyMouthTarget({dir:{x:0,y:0}},0)===null,'zero direction has no target');
console.log(JSON.stringify({ok:true,checks,maskFrames,protectedToothPixels,jawMapChecks,targetCavityChecks,referenceMode,referenceRoot:assetRoot,
  scope:'Approved 1.125 centered width fit for Fantasy-only visual intake masks and targets; unchanged jaw Y, timing, movement, collision and legacy hunters',
  limitations:['Numerical anatomy tests require visual review with real tail overlays and controller rotation.','Mask is built from canonical normal P1 and shared across player recolors.']},null,2));
