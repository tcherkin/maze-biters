import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require(process.env.CODEX_CANVAS_PACKAGE||
  join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas'));
const argument=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const neonModule=name=>argument('neon-candidate')?pathToFileURL(join(argument('neon-candidate'),name)).href:
  new URL(`../src/render/${name}`,import.meta.url).href;
const {createPairedContext}=await import(neonModule('neon-context.js'));
const {createNeonMaterial}=await import(neonModule('neon-material.js'));
const baseline=argument('baseline')||fileURLToPath(new URL('./baseline/snake-material-ribbon-v1.02.05.00.js',import.meta.url));
const before=await import(`data:text/javascript;base64,${Buffer.from(readFileSync(baseline,'utf8')).toString('base64')}`);
const current=await import(argument('candidate')?pathToFileURL(argument('candidate')).href:new URL('../src/render/snake-material-ribbon.js',import.meta.url).href);
const CELL=36,DIAMETER=57/160*CELL,TAIL=35*DIAMETER/16,HEAD=215.5*DIAMETER/76;
const canvas=(w=512,h=256)=>createCanvas(w,h);
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
const state=c=>({matrix:c.getTransform().toJSON(),alpha:c.globalAlpha,op:c.globalCompositeOperation});
const statistics={fixtures:0,destinations:0,outlineVertices:0,beforeSamples:0,afterSamples:0,beforeSpans:0,afterSpans:0,
  beforeMaskEdges:0,afterMaskEdges:0,occlusionFixtures:0};
function samePixels(a,b,label,alphaOnly=false){
  const x=pixels(a),y=pixels(b);let differences=0,maximum=0;
  for(let i=alphaOnly?3:0;i<x.length;i+=alphaOnly?4:1){const delta=Math.abs(x[i]-y[i]);if(delta)differences++;maximum=Math.max(maximum,delta);}
  assert.equal(differences,0,`${label}; changed channels=${differences}, max difference=${maximum}`);
}
function nativePng(url){
  const source=readFileSync(url),chunks=[source.subarray(0,8)];
  for(let at=8;at<source.length;){const size=source.readUInt32BE(at);
    if(source.toString('ascii',at+4,at+8)!=='caBX')chunks.push(source.subarray(at,at+size+12));at+=size+12;}
  return Buffer.concat(chunks);
}
function fixture({curved=false,shift=0,reverse=false,short=false,intake=false}={}){
  const counts={samples:0,spans:0,widths:0},corner=60,arc=18*Math.PI/2;
  const path={sample(s,out={}){
    counts.samples++;let x=s,y=0,angle=0;
    if(curved&&s>corner){
      if(s<corner+arc){angle=(s-corner)/18;x=corner+18*Math.sin(angle);y=18-18*Math.cos(angle);}
      else{angle=Math.PI/2;x=corner+18;y=18+s-corner-arc;}
    }
    out.x=x+shift;out.y=y+shift;out.angle=angle;out.tx=Math.cos(angle);out.ty=Math.sin(angle);return out;
  },ribbonSpan(s,maximum){
    counts.spans++;
    if(!curved)return maximum;
    if(s<corner-1e-7)return Math.min(maximum,corner-s);
    if(s<corner+arc-1e-7)return Math.min(maximum,1.6,corner+arc-s);
    return maximum;
  }};
  const length=short?.09:curved?125:280,tip=reverse?length:0,base=reverse?length-TAIL:TAIL,span=Math.abs(base-tip);
  const pose={path,length:length+HEAD,rearDistance:length,solo:0,compression:7.25,
    state:{frontMaterial:342.61,materialSign:reverse?-1:1}};
  const options={step:s=>Math.abs(s-tip)<span?Math.min(.35,span/32):Infinity,
    widthAt:s=>{counts.widths++;return current.tailWidth((s-tip)/(base-tip));}};
  if(intake)options.pointAt=(s,out={})=>{
    path.sample(s,out);const d=Math.abs(s-tip);
    if(d<span){const u=d/span,w=1-u*u*u*(10+u*(-15+6*u)),derivative=-30*u*u*(1-u)*(1-u)/span;
      out.y+=2.5*w;out.angle=Math.atan2(Math.sin(out.angle)+2.5*derivative*(reverse?-1:1),Math.cos(out.angle));}
    return out;
  };
  return {pose,start:0,end:length,options,counts};
}
function destination(shift,paired,occlusion=false){
  const surfaces=Array.from({length:paired?3:1},()=>canvas()),contexts=surfaces.map(s=>s.getContext('2d'));
  const matrices=[[1.25,0,0,1.25,30-shift*1.25,42-shift*1.25],
    [1,0,0,1,16-shift,30-shift],[1.13,.06,-.025,.85,36-shift*1.105,28-shift*.91]];
  contexts.forEach((c,i)=>{c.setTransform(...matrices[i]);c.globalAlpha=.71;
    c.beginPath();c.rect(shift-10,shift-30,370,230);c.clip();});
  const original=contexts.map(state),neon=createNeonMaterial({canvasFactory:canvas});
  const target=paired?createPairedContext(neon.wrapContext(createPairedContext(contexts[0],contexts[1],
    occlusion?{secondaryPreparedMode:{occlusion:true}}:{})),
    neon.wrapEmissionContext(contexts[2])):contexts[0];
  return {surfaces,contexts,original,target,neon};
}
for(const color of ['green','yellow','blue','pink','orange']){
  const image=await loadImage(nativePng(new URL(`../assets/atlases/4k/snake-${color}-160.png`,import.meta.url)));
  const materials=[before.createRibbonMaterial(image,canvas),current.createRibbonMaterial(image,canvas)];
  assert.deepEqual(pixels(materials[1].image),pixels(materials[0].image),'startup material unchanged');
  const maskEdges=[0,0];materials.forEach((material,i)=>{const g=material.surface.getContext('2d'),line=g.lineTo.bind(g);
    g.lineTo=(...args)=>{maskEdges[i]++;return line(...args);};});
  for(const curved of [false,true])for(const reverse of [false,true])for(const shift of [0,512])
    for(const paired of [false,true])for(const intake of [false,true]){
    const config={curved,reverse,shift,intake},fixtures=[fixture(config),fixture(config)];
    const destinations=[destination(shift,paired),destination(shift,paired,true)],results=[];
    const outlines=[before,current].map((module,i)=>module.ribbonOutline(fixtures[i].pose,0,fixtures[i].end,fixtures[i].options));
    assert.deepEqual(outlines[1],outlines[0],'every accepted outline point and ordering remain exact');
    statistics.outlineVertices+=outlines[0].length;
    fixtures.forEach(f=>{f.counts.samples=0;f.counts.spans=0;f.counts.widths=0;});
    for(const [i,module] of [before,current].entries()){
      const f=fixtures[i],d=destinations[i];d.neon.prewarm([materials[i].image]);
      results.push(module.drawMaterialRibbon(d.target,materials[i],f.pose,f.start,f.end,f.options));
      assert.deepEqual(d.contexts.map(state),d.original,'caller matrix, alpha and blend mode unchanged');
    }
    assert.equal(results[1],results[0]*(paired?2/3:1),'visible/emission strip count unchanged; actor mask skips texture paint');
    for(let i=0;i<destinations[0].surfaces.length;i++){
      samePixels(destinations[1].surfaces[i],destinations[0].surfaces[i],
        `${color} exact native pixels ${JSON.stringify(config)} pass ${i}`,paired&&i===1);statistics.destinations++;
    }
    assert.equal(fixtures[1].counts.spans*(paired?3:1),fixtures[0].counts.spans,'prepare strips once, replay all destinations');
    statistics.beforeSamples+=fixtures[0].counts.samples;statistics.afterSamples+=fixtures[1].counts.samples;
    statistics.beforeSpans+=fixtures[0].counts.spans;statistics.afterSpans+=fixtures[1].counts.spans;statistics.fixtures++;
  }
  statistics.beforeMaskEdges+=maskEdges[0];statistics.afterMaskEdges+=maskEdges[1];
  for(const curved of [false,true])for(const reverse of [false,true])for(const shift of [0,512]){
    const surfaces=[canvas(),canvas()],contexts=surfaces.map(c=>c.getContext('2d'));
    for(const g of contexts){g.translate(30-shift,40-shift);g.globalAlpha=.71;}
    const saved=contexts.map(state),fixtures=[fixture({curved,reverse,shift}),fixture({curved,reverse,shift})];
    const original=fixtures[0],optimized=fixtures[1];
    before.drawMaterialRibbon(contexts[0],materials[0],original.pose,0,original.end,original.options);
    const count=current.drawMaterialRibbon({paintPreparedSurface(render){
      render(contexts[1],()=>{throw Error('alpha-only actor pass must not resolve or build a texture');},{occlusion:true});
    }},materials[1],optimized.pose,0,optimized.end,optimized.options);
    assert.equal(count,0);assert.equal(optimized.counts.spans,0,'alpha-only pass never prepares texture strips');
    samePixels(surfaces[1],surfaces[0],'occlusion preserves exact actor alpha',true);
    assert.deepEqual(contexts.map(state),saved);statistics.occlusionFixtures++;
  }
  // The public immediate painter remains usable without a compositing surface.
  for(const reverse of [false,true])for(const short of [false,true]){
    const fixtures=[fixture({reverse,short}),fixture({reverse,short})],surfaces=[canvas(),canvas()];
    const draws=[before,current].map((module,i)=>{const f=fixtures[i],g=surfaces[i].getContext('2d');g.translate(30,60);
      return module.paintRibbonStrips(g,materials[i],f.pose,0,f.end,f.options);});
    assert.equal(draws[1],draws[0]);assert.deepEqual(pixels(surfaces[1]),pixels(surfaces[0]));
  }
}
// A prepared callback may synchronously nest another ribbon paint. Its pooled
// geometry must not overwrite the outer list before the second destination.
const image=canvas(480,74);image.getContext('2d').fillStyle='#93b427';image.getContext('2d').fillRect(0,0,480,74);
for(const module of [before,current]){
  const material={image,crop:module.MATERIAL_CROP,surface:canvas(1,1)},outer=fixture(),inner=fixture({curved:true,reverse:true});
  const a=canvas(),b=canvas(),nested=canvas();a.getContext('2d').translate(20,60);b.getContext('2d').translate(20,60);
  module.drawMaterialRibbon({paintPreparedSurface(render){
    render(a.getContext('2d'));
    module.drawMaterialRibbon(nested.getContext('2d'),material,inner.pose,0,inner.end,inner.options);
    render(b.getContext('2d'));
  }},material,outer.pose,0,outer.end,outer.options);
  assert.deepEqual(pixels(a),pixels(b),'reentrant strip buffers remain independent');
}
assert.ok(statistics.afterSamples<statistics.beforeSamples&&statistics.afterSpans<statistics.beforeSpans);
assert.ok(statistics.afterMaskEdges<statistics.beforeMaskEdges,'exact screen-axis compaction removes redundant lineTo calls');
console.log(`PASS exact ribbon preparation parity: ${JSON.stringify(statistics)}; five palettes, normal/actor/neon, negative translations, reverse, intake, public strip API and reentrant pool. Counts are deterministic work counters, not browser frame-time estimates.`);
