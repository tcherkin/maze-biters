import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as optimized from '../src/render/snake-material-ribbon.js';
import {createNeonMaterial} from '../src/render/neon-material.js';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require('C:/Users/tcher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const original=await import(new URL('./baseline/snake-material-ribbon-v1.02.06.00.js',import.meta.url));
const W=360,H=250,start=0,end=220;
const pose={length:270,solo:0,compression:5,rearDistance:220,
  state:{frontMaterial:284,materialSign:1},path:{
    sample(s,out={}){const q=s/44;return Object.assign(out,{x:30+s,y:85+27*Math.sin(q),angle:Math.atan2(27/44*Math.cos(q),1)});},
    ribbonSpan(s,max){return Math.min(max,2);}
  }};
const texture=createCanvas(480,74),tc=texture.getContext('2d');
const gradient=tc.createLinearGradient(0,0,0,74);gradient.addColorStop(0,'#063706');gradient.addColorStop(.5,'#ccff0d');gradient.addColorStop(1,'#063706');
tc.fillStyle=gradient;tc.fillRect(0,0,480,74);
const cases=[];
for(const angle of [0,.071,.37,Math.PI/2])for(const alpha of [1,.37,.83])for(const clip of ['none','rect','circle'])
  cases.push({angle,alpha,clip,sx:1.17,sy:.93,tx:16.375,ty:8.125});
cases.push({angle:0,alpha:1,clip:'none',sx:1,sy:1,tx:-80.75,ty:-40.375});
cases.push({angle:-.21,alpha:1,clip:'circle',sx:3.6,sy:3.6,tx:-300.25,ty:-190.5});
const pairedCases=cases.flatMap(cfg=>[{...cfg,background:'transparent'},{...cfg,background:'overlap'}]);
function draw(module,cfg,occlusion,emission=false){
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  if(cfg.background==='overlap'){
    ctx.fillStyle='#14394d';ctx.globalAlpha=.33;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;
  }
  if(cfg.clip!=='none'){
    ctx.beginPath();if(cfg.clip==='rect')ctx.rect(40.25,38.75,210.5,130.75);else ctx.arc(170.3,110.7,101.25,0,Math.PI*2);
    ctx.clip();
  }
  ctx.translate(cfg.tx,cfg.ty);ctx.rotate(cfg.angle);ctx.scale(cfg.sx,cfg.sy);ctx.globalAlpha=cfg.alpha;
  const before=ctx.getTransform(),beforeAlpha=ctx.globalAlpha,material={image:texture,crop:module.MATERIAL_CROP,surface:createCanvas(1,1)};
  const target={paintPreparedSurface(paint){return paint(ctx,source=>source,{occlusion,emission});}};
  module.drawMaterialRibbon(target,material,pose,start,end,{widthAt:s=>s<36?module.tailWidth(s/36):1});
  const after=ctx.getTransform();
  for(const key of ['a','b','c','d','e','f'])assert.equal(after[key],before[key],`Transform ${key} must be preserved`);
  assert.equal(ctx.globalAlpha,beforeAlpha);
  return {pixels:ctx.getImageData(0,0,W,H).data,scratch:[material.surface.width,material.surface.height]};
}
const summary={cases:pairedCases.length,normalExact:true,emissionExact:true,occlusionExact:true,differingBytes:0,maxDelta:0,
  maxAlphaDelta:0,totalAlphaDelta:0,alphaMeanAbsoluteDelta:0,optimizedScratchUntouched:true,differences:[]};
for(const cfg of pairedCases)for(const mode of ['visible','emission','mask']){
  const occlusion=mode==='mask',emission=mode==='emission';
  const a=draw(original,cfg,occlusion,emission),b=draw(optimized,cfg,occlusion,emission);let count=0,max=0,alphaBytes=0,alphaMax=0;
  for(let i=0;i<a.pixels.length;i++){const delta=Math.abs(a.pixels[i]-b.pixels[i]);if(delta){count++;max=Math.max(max,delta);if(i%4===3){alphaBytes++;alphaMax=Math.max(alphaMax,delta);if(occlusion)summary.totalAlphaDelta+=delta;}}}
  if(occlusion){
    summary.occlusionExact&&=count===0;summary.differingBytes+=count;summary.maxDelta=Math.max(summary.maxDelta,max);
    summary.maxAlphaDelta=Math.max(summary.maxAlphaDelta,alphaMax);
    summary.optimizedScratchUntouched&&=b.scratch[0]===1&&b.scratch[1]===1;
    if(count)summary.differences.push({...cfg,bytes:count,max,alphaBytes,alphaMax});
  }else{
    if(emission)summary.emissionExact&&=count===0;else summary.normalExact&&=count===0;
    assert.equal(count,0,'Visible and emitted material are byte-for-byte unchanged');
  }
}
summary.alphaMeanAbsoluteDelta=summary.totalAlphaDelta/(pairedCases.length*W*H);
// Native palette material and its actual accepted 70% emission conversion
// must remain byte identical, not just the synthetic texture above.
function nativePng(url){
  const source=readFileSync(url),chunks=[source.subarray(0,8)];
  for(let at=8;at<source.length;){const size=source.readUInt32BE(at);
    if(source.toString('ascii',at+4,at+8)!=='caBX')chunks.push(source.subarray(at,at+size+12));at+=size+12;}
  return Buffer.concat(chunks);
}
summary.nativePaletteChecks=0;
for(const color of ['green','yellow','blue','pink','orange']){
  const source=await loadImage(nativePng(new URL(`../assets/atlases/4k/snake-${color}-160.png`,import.meta.url)));
  const modules=[original,optimized],materials=modules.map(module=>module.createRibbonMaterial(source,createCanvas));
  const neon=modules.map(()=>createNeonMaterial({canvasFactory:createCanvas,strength:.7}));
  for(const cfg of [cases[0],cases[13],cases.at(-1)])for(const emission of [false,true]){
    const results=modules.map((module,index)=>{
      const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
      ctx.translate(cfg.tx,cfg.ty);ctx.rotate(cfg.angle);ctx.scale(cfg.sx,cfg.sy);ctx.globalAlpha=cfg.alpha;
      const target=emission?neon[index].wrapEmissionContext(ctx):neon[index].wrapContext(ctx);
      module.drawMaterialRibbon(target,materials[index],pose,start,end,{widthAt:s=>s<36?module.tailWidth(s/36):1});
      return ctx.getImageData(0,0,W,H).data;
    });
    assert.deepEqual(results[1],results[0],`${color} native ${emission?'emission':'visible'} pixels unchanged`);
    summary.nativePaletteChecks++;
  }
  neon.forEach(material=>material.reset());
}
summary.note='Visible pixels are exact. The alpha-only receiver differs slightly at antialiased edges; RGB is not consumed from this mask. Bounds apply to these fixtures, not all possible Canvas clips.';
console.log(JSON.stringify(process.argv.includes('--details')?summary:{...summary,differences:summary.differences.length},null,2));
assert.ok(summary.normalExact);
assert.ok(summary.emissionExact);
assert.ok(summary.optimizedScratchUntouched);
assert.ok(summary.maxAlphaDelta<=10,'Bounded alpha-only edge difference (of255 levels)');
assert.ok(summary.alphaMeanAbsoluteDelta<.05,'Mean mask difference remains below .05of255 levels');
