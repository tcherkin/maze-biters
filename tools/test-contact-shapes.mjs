import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {traceAlphaContours,transformContactShape,quantizedContactBreakpoints} from '../src/render/contact-shapes.js';
import {createLiveMouthService} from '../src/render/live-mouth.js';
import {createLiveScorpion} from '../src/render/live-scorpion.js';

const require=createRequire(import.meta.url);let native;
for(const path of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{native=require(path);break;}catch{}
}
if(!native)throw Error('Native Canvas required (or set CODEX_CANVAS_PACKAGE)');
const {createCanvas,Image,loadImage}=native,near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
function contains(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
}return inside;}
const inside=(shape,p)=>shape.parts.some(part=>contains(p,part.points));
function boundaryDistance(shape,p){let best=Infinity;for(const part of shape.parts)for(let i=0;i<part.points.length;i++){
  const a=part.points[i],b=part.points[(i+1)%part.points.length],dx=b.x-a.x,dy=b.y-a.y;
  const u=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  best=Math.min(best,Math.hypot(p.x-a.x-u*dx,p.y-a.y-u*dy));
}return best;}
const raster={width:24,height:24,data:new Uint8ClampedArray(24*24*4)};
for(let y=2;y<22;y++)for(let x=2;x<22;x++)if(!(x>=7&&x<17&&y>=7&&y<17))raster.data[(y*24+x)*4+3]=255;
const donut=traceAlphaContours(raster,{tolerance:.1});assert.equal(donut.stats.holes,1);
assert.equal(inside(donut,{x:12,y:12}),false,'transparent holes are not filled by a hull');
assert.equal(inside(donut,{x:4,y:12}),true);assert.equal(inside(donut,{x:1,y:12}),false);
const transformed=transformContactShape(donut,{a:0,b:2,c:-2,d:0,e:100,f:20}),part=transformed.parts[0],point=part.points[0];
assert.equal(transformContactShape(donut,{a:0,b:2,c:-2,d:0,e:101,f:21},transformed),transformed);
assert.equal(transformed.parts[0],part);assert.equal(part.points[0],point,'transformed output reuses points');
const excursion=quantizedContactBreakpoints(t=>(.5+1e-6-(t-.501234)**2)/18,0,1,{levels:18,speedBound:.06,timeTolerance:1e-7});
assert.ok(excursion.some(t=>Math.abs(t-.500234)<.00001)&&excursion.some(t=>Math.abs(t-.502234)<.00001),'Lipschitz isolation catches a2µs pose excursion that fixed grids miss');

let creations=0,reads=0;
function makeCanvas(w,h){creations++;const c=createCanvas(w,h),g=c.getContext('2d'),read=g.getImageData.bind(g);g.getImageData=(...args)=>{reads++;return read(...args);};return c;}
const oldDocument=globalThis.document,oldImage=globalThis.Image;
globalThis.document={createElement:()=>makeCanvas(1,1)};
globalThis.Image=class extends Image{set src(value){super.src=readFileSync(fileURLToPath(value));}};
try{
  const manifestContext={};vm.runInNewContext(readFileSync(new URL('../src/config/render-atlas.js',import.meta.url),'utf8'),manifestContext);
  const manifest=manifestContext.MAZE_BITERS_RENDER_ATLAS;
  const atlas=await loadImage(fileURLToPath(new URL('../assets/atlases/4k/modern-characters-160.png',import.meta.url)));
  const atlasCanvas=createCanvas(atlas.width,atlas.height),ag=atlasCanvas.getContext('2d');ag.drawImage(atlas,0,0);
  const groups={player:{p1:{normal:{}}}};
  for(const [key,region]of Object.entries(manifest.characters))if(key.startsWith('player:p1:normal:')){
    const name=key.split(':').at(-1);groups.player.p1.normal[name]={__hvSpriteName:name,region};
  }
  const mouth=createLiveMouthService({tile:16,makeCanvas,yieldTask:async()=>{},
    playerPosition:(p,t,out)=>Object.assign(out,{x:5+t*.002,y:5}),
    readSprite(source){const[,x,y,width,height]=source.region;return ag.getImageData(x,y,width,height);},
    drawSource(ctx,source,x,y,w,h){const[,sx,sy,sw,sh]=source.region;ctx.drawImage(atlas,sx,sy,sw,sh,x,y,w,h);return true;}});
  await mouth.prepare(groups);
  const scorpion=createLiveScorpion({tile:16});assert.equal(await scorpion.prepare(),true);
  const preparedCreations=creations,preparedReads=reads;
  const actor={x:5,y:5,dir:{x:1,y:0},controllerTiltDegrees:23,moveStartedAt:0,moveDuration:95,moveFromX:5,moveFromY:5,moveToX:6,moveToY:5};
  mouth.bite(actor,50,140,0);
  const normal=groups.player.p1.normal,output={};let mouthSamples=0,maxMouthVertices=0;
  for(let bank=0;bank<4;bank++){
    const direction=[2,3,4,1][bank],options={bank,open:normal[`Head${direction}`],closed:normal[`Head${direction}${direction===1?'':'Close'}`]};
    for(let t=0;t<=280;t+=4){const shape=mouth.geometry(actor,t,options,output);assert.equal(shape,output);assert.ok(shape.parts.length);
      maxMouthVertices=Math.max(maxMouthVertices,shape.parts.reduce((n,p)=>n+p.points.length,0));
      for(const part of shape.parts)for(const point of part.points)assert.ok(Number.isFinite(point.x+point.y));
      assert.ok(shape.tolerance<=.05000001);mouthSamples++;
    }
  }
  const mouthOptions={bank:0,open:normal.Head2,closed:normal.Head2Close};
  const breaks=mouth.breakpoints(actor,0,280);let previous=Math.round(mouth.closure(actor,0)*18),switches=0;
  for(let t=.01;t<=280;t+=.01){const frame=Math.round(mouth.closure(actor,t)*18);
    if(frame!==previous){assert.ok(breaks.some(value=>Math.abs(value-t)<.0101),`jaw switch ${t} is bracketed`);switches++;}previous=frame;
  }
  // Explicit world rectangle/rotation must match the existing draw transform.
  const descriptor=mouth.sprite(actor,70,mouthOptions),local=descriptor.__liveMouth.set.contacts[descriptor.__liveMouth.index];
  const precise=mouth.geometry(actor,70,{descriptor,x:100,y:120,width:16,height:16,angle:Math.PI/2},{});
  const source=local.parts[0].points[0],destination=precise.parts[0].points[0];
  near(destination.x,116-source.y*16/local.height);near(destination.y,120+source.x*16/local.width);
  const mouthCanvas=createCanvas(384,384),mg=mouthCanvas.getContext('2d');let mouthCoverage=0,maxMouthMismatch=0;
  for(let bank=0;bank<4;bank++)for(const t of [0,25,50,82,120,180,190,250]){
    const direction=[2,3,4,1][bank],options={bank,open:normal[`Head${direction}`],closed:normal[`Head${direction}${direction===1?'':'Close'}`]};
    const desc=mouth.sprite(actor,t,options),shape=mouth.geometry(actor,t,options,output),x=(5+t*.002)*16,y=80;
    mg.setTransform(1,0,0,1,0,0);mg.clearRect(0,0,384,384);mg.setTransform(12,0,0,12,-72*12,-72*12);
    mg.save();mg.translate(x+8,y+8);mg.rotate(23*Math.PI/180);mg.translate(-x-8,-y-8);mouth.draw(mg,desc,x,y,16,16);mg.restore();
    const data=mg.getImageData(0,0,384,384).data;
    for(let py=3;py<384;py+=6)for(let px=3;px<384;px+=6){const alpha=data[(py*384+px)*4+3];if(alpha>8&&alpha<192)continue;
      const p={x:72+(px+.5)/12,y:72+(py+.5)/12};
      if(inside(shape,p)!==(alpha>=192)){const error=boundaryDistance(shape,p);maxMouthMismatch=Math.max(maxMouthMismatch,error);assert.ok(error<.12,`actual tilted jaw mismatch ${error}`);}
      mouthCoverage++;
    }
  }

  const subject={x:6,y:6,tailX:5,tailY:6,dir:{x:1,y:0},lastMove:0};
  const scene=createCanvas(768,768),ctx=scene.getContext('2d'),scale=12,origin=64;
  let geometrySamples=0,coverageSamples=0,maxScorpionParts=0,maxScorpionVertices=0,maxMismatch=0,maxContourError=0;const verticesByRole={};
  function check(t){
    const shape=scorpion.geometry(subject,t,{},output);assert.ok(shape?.parts.length);
    maxScorpionParts=Math.max(maxScorpionParts,shape.parts.length);maxScorpionVertices=Math.max(maxScorpionVertices,shape.parts.reduce((n,p)=>n+p.points.length,0));
    for(const part of shape.parts)verticesByRole[part.role]=Math.max(verticesByRole[part.role]||0,part.points.length);
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,768,768);ctx.setTransform(scale,0,0,scale,-origin*scale,-origin*scale);scorpion.draw(ctx,subject,t);
    const pixels=ctx.getImageData(0,0,768,768).data;
    if(t===299||t===545){
      const rendered=traceAlphaContours({width:768,height:768,data:pixels},{threshold:32,tolerance:.3,minArea:.5});
      for(const part of rendered.parts)for(const q of part.points){const p={x:origin+q.x/scale,y:origin+q.y/scale};
        const error=boundaryDistance(shape,p);maxContourError=Math.max(maxContourError,error);
        assert.ok(error<.16,`rendered contour stays near supplied contact geometry: ${error}`);
      }
    }
    for(let y=9;y<768;y+=12)for(let x=9;x<768;x+=12){const alpha=pixels[(y*768+x)*4+3];if(alpha>8&&alpha<192)continue;
      const p={x:origin+(x+.5)/scale,y:origin+(y+.5)/scale},hit=inside(shape,p);
      if(hit!==(alpha>=192)){const distance=boundaryDistance(shape,p);maxMismatch=Math.max(maxMismatch,distance);assert.ok(distance<.16,`actual scorpion alpha mismatch t${t} at ${p.x},${p.y}: ${distance}`);}
      coverageSamples++;
    }
    const saved=JSON.stringify(subject);for(const part of shape.parts)for(const p of part.points)assert.ok(Number.isFinite(p.x+p.y));
    assert.equal(JSON.stringify(subject),saved);geometrySamples++;
  }
  for(const t of [0,54,109,163])check(t);
  let oldHead={x:6,y:6},oldTail={x:5,y:6},oldDir={x:1,y:0};
  Object.assign(subject,{x:6,y:7,tailX:6,tailY:6,dir:{x:0,y:1},lastMove:218,moveStartedAt:218});
  scorpion.recordStep(subject,{oldHead,oldTail,oldDir,t:218,duration:119.9,nativeDelay:218});
  for(const t of [218,245,272,299,327,354,381,408,436])check(t);
  oldHead={x:6,y:7};oldTail={x:6,y:6};oldDir={x:0,y:1};
  Object.assign(subject,{x:6,y:6,tailX:6,tailY:7,dir:{x:0,y:-1},lastMove:436,moveStartedAt:436});
  scorpion.recordStep(subject,{oldHead,oldTail,oldDir,t:436,duration:119.9,nativeDelay:218});
  for(const t of [436,463,490,517,545,572,599,626,654])check(t);
  assert.ok(scorpion.breakpoints(subject,436,654).includes(545));assert.ok(scorpion.speedBound(subject,436,654)>0);
  let branchTransitions=0;
  const headings=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
  for(const incoming of headings)for(const turn of [-1,1,2]){
    const facing=turn===2?{x:-incoming.x,y:-incoming.y}:{x:-turn*incoming.y,y:turn*incoming.x};
    const oldHead={x:10,y:10},oldTail={x:10-incoming.x,y:10-incoming.y};
    const entity={x:10+facing.x,y:10+facing.y,tailX:10,tailY:10,dir:facing,lastMove:1000,moveStartedAt:1000};
    scorpion.recordStep(entity,{oldHead,oldTail,oldDir:incoming,t:1000,duration:119.9,nativeDelay:218});
    const exact=scorpion.breakpoints(entity,1000,1218),branches=exact.filter(t=>t!==1109);
    assert.equal(branches.length,4,'both representable sides of both native/bent switches are announced');
    assert.deepEqual(scorpion.breakpoints(entity,1000,1218),exact,'branch roots are cached deterministically');
    for(let i=0;i<branches.length;i+=2){
      const lo=branches[i],hi=branches[i+1];
      assert.ok(hi>lo&&hi-lo<1e-9,'source replacement is bracketed down to floating-point resolution');
      const before=scorpion.geometry(entity,lo,{},{}).straight,after=scorpion.geometry(entity,hi,{},{}).straight;
      assert.equal(before,i===0);assert.equal(after,i!==0);
      const interval=scorpion.breakpoints(entity,lo,hi+1e-9);
      assert.ok(interval.includes(hi),'a sweep starting on the old-source side cannot omit the new-source side');
      branchTransitions++;
    }
  }
  assert.equal(creations,preparedCreations,'world geometry creates no per-frame canvases');
  assert.equal(reads,preparedReads,'world geometry reads no pixels per frame');
  console.log(JSON.stringify({mouthSamples,mouthCoverage,maxMouthMismatch,jawSwitches:switches,isolatedBreakpoints:breaks.length,maxMouthVertices,
    geometrySamples,coverageSamples,branchTransitions,maxScorpionParts,maxScorpionVertices,verticesByRole,maxMismatchWorldPx:maxMismatch,maxRasterContourErrorWorldPx:maxContourError,
    mouthStats:mouth.stats,geometryPixelReads:reads-preparedReads,runtimeCanvasCreations:creations-preparedCreations},null,2));
}finally{
  if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  if(oldImage===undefined)delete globalThis.Image;else globalThis.Image=oldImage;
}
