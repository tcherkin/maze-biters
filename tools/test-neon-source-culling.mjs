import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createMazeReflection,REFLECTION_CULLING_GUARD} from '../src/render/neon-maze-reflection.js';
import {createSnakeNeonReflection} from '../src/render/snake-neon-reflection.js';
import {getSnakeBounds} from '../src/render/scene-visibility.js';
import {LEVEL_GRID,CELL,makeRoute} from './fixtures/neon-optimization-maze.js';

// Optional immutable pre-change module. Without it, the unbounded branch is
// the reference: it preserves the existing per-stamp viewport culling path.
const reference=process.argv[2]
  ? (await import(pathToFileURL(process.argv[2]))).createMazeReflection:createMazeReflection;
const runtime='C:/Users/tcher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js';
const {createCanvas}=await import(pathToFileURL(runtime));
const canvasFactory=(w,h)=>createCanvas(w,h),route=makeRoute();
const colors=['#b8ef52','#ffe080','#65c9f2','#ed83b6','#ffa56b'];
const pixels=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
let comparisons=0,culled=0,samplesSaved=0,edgeCases=0,headCases=0,failOpenCases=0;
function equalMaps(a,b,label){
  assert.deepEqual(pixels(a.canvas),pixels(b.canvas),`${label}: floor pixels`);
  assert.deepEqual(pixels(a.wallCanvas),pixels(b.wallCanvas),`${label}: wall pixels`);comparisons+=2;
}
function trackedSource(geometry,color,bounds){
  let calls=0;const sample=geometry.sample;
  return {source:{color,bounds,geometry:{...geometry,sample(...args){calls++;return sample.apply(geometry,args);}}},
    calls:()=>calls};
}
function compare(rendererA,rendererB,entries,options,label){
  const aa=entries.map(e=>trackedSource(e.geometry,e.color,undefined));
  const bb=entries.map(e=>trackedSource(e.geometry,e.color,e.bounds));
  rendererA.render(aa.map(e=>e.source),.7,options);rendererB.render(bb.map(e=>e.source),.7,options);
  equalMaps(rendererA,rendererB,label);
  const stats=rendererB.stats().culling;
  assert.equal(stats.lastCandidateSources,stats.lastRejectedSources+stats.lastProcessedSources);
  const aCalls=aa.reduce((n,e)=>n+e.calls(),0),bCalls=bb.reduce((n,e)=>n+e.calls(),0);
  assert(bCalls<=aCalls,'Whole-source culling cannot add sample calls');
  samplesSaved+=aCalls-bCalls;culled+=stats.lastRejectedSources;
  return {stats,aCalls,bCalls};
}
for(const cell of [16,36]){
  const width=LEVEL_GRID[0].length*cell,height=LEVEL_GRID.length*cell;
  const args={grid:LEVEL_GRID,cell,width,height,canvasFactory,scale:1};
  const a=reference(args),b=createMazeReflection(args);
  a.prepareColors(colors);b.prepareColors(colors);
  const camera=(zoom,x=width/2,y=height/2)=>({left:x-width/zoom/2,top:y-height/zoom/2,
    right:x+width/zoom/2,bottom:y+height/zoom/2});
  const cameras=[null,camera(1),camera(.75),camera(1.8),camera(3,cell*3,cell*3),
    camera(3,width-cell*3,cell*3),camera(3,cell*3,height-cell*3),camera(3,width-cell*3,height-cell*3),
    {left:7.03125*cell,top:1.99*cell,right:10.5*cell,bottom:7.25*cell}];
  for(let frame=0;frame<12;frame++){
    const entries=colors.map((color,index)=>{
      const scale=cell/CELL,start=(frame/12+index/5)*route.total,length=cell*(1.2+index*1.3);
      const neck=route.point(start+(length-cell*.7)/scale);
      const geometry={length,diameter:cell*57/160,bodyEndDistance:Math.max(0,length-cell*.7),
        head:{x:neck.x*scale,y:neck.y*scale,angle:neck.angle,span:cell*.7,
          sprite:{dx:-cell*.05,dy:-cell*.3,dw:cell*1.1,dh:cell*.6}},
        sample(distance,out={}){const p=route.point(start+distance/scale);out.x=p.x*scale;out.y=p.y*scale;return out;}};
      return {color,geometry,bounds:getSnakeBounds(geometry,cell)};
    });
    for(const viewport of cameras)compare(a,b,entries,{floor:true,walls:true,wallStrength:.25,viewport},
      `route cell${cell} frame${frame}`);
  }
  // Every axis and diagonal: keep exactly the same radius and resampling
  // guard, including its exact edge. Compare against per-stamp rejection.
  const point={x:cell*8.5,y:cell*2.5};
  const geometry={length:0,head:null,sample(d,out){return Object.assign(out,point);}};
  const bounds={minX:point.x,minY:point.y,maxX:point.x,maxY:point.y};
  for(const [floor,walls,reach] of [[true,false,cell*.68],[false,true,cell*1.45],[true,true,cell*1.45]]){
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      for(const offset of [-.01,0,.01]){
        const delta=reach+REFLECTION_CULLING_GUARD+offset;
        const viewport={left:dx>0?point.x+delta:point.x-cell*4,
          right:dx<0?point.x-delta:point.x+cell*4,
          top:dy>0?point.y+delta:point.y-cell*4,
          bottom:dy<0?point.y-delta:point.y+cell*4};
        const r=compare(a,b,[{color:colors[0],geometry,bounds}],{floor,walls,wallStrength:.25,viewport},'reach');
        assert.equal(r.stats.lastRejectedSources,a.stats().culling.lastRejectedStamps,
          'Whole-source reach agrees with exact per-stamp support');
        if(r.stats.lastRejectedSources)assert.equal(r.bCalls,0,'Rejected source must not sample');edgeCases++;
      }
    }
  }
  const distant={left:width-cell*3,top:height-cell*3,right:width,bottom:height};
  for(const badBounds of [undefined,null,{}, {...bounds,minX:NaN},{...bounds,maxY:Infinity},
    {...bounds,minX:bounds.maxX+1},{...bounds,minY:bounds.maxY+1}]){
    const r=compare(a,b,[{color:colors[0],geometry,bounds:badBounds}],
      {floor:true,walls:true,wallStrength:.25,viewport:distant},'unknown bounds');
    assert.equal(r.stats.lastRejectedSources,0);assert.equal(r.bCalls,1);failOpenCases++;
  }
  // The rigid head's light line can extend beyond sprite/body bounds. Extend
  // the supplied box using the exact production head sampling formula.
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const explicitEnd of [false,true]){
    const head={x:point.x,y:point.y,angle,span:cell*5};
    const headGeometry={...geometry,length:cell*5,head,
      ...(explicitEnd?{bodyEndDistance:0}:{}),sample(d,out){return Object.assign(out,point);}};
    const ex=point.x+Math.cos(angle)*cell*5,ey=point.y+Math.sin(angle)*cell*5;
    const viewport={left:ex-cell*.2,top:ey-cell*.2,right:ex+cell*.2,bottom:ey+cell*.2};
    const r=compare(a,b,[{color:colors[0],geometry:headGeometry,bounds}],
      {floor:true,walls:true,wallStrength:.25,viewport},'rigid head beyond art');
    assert.equal(r.stats.lastRejectedSources,0);headCases++;
  }
  for(const invalidHead of [{x:point.x,y:point.y,angle:0},{x:NaN,y:point.y,angle:0,span:1}]){
    const r=compare(a,b,[{color:colors[0],geometry:{...geometry,head:invalidHead},bounds}],
      {floor:true,walls:true,wallStrength:.25,viewport:distant},'unknown head span');
    assert.equal(r.stats.lastRejectedSources,0);failOpenCases++;
  }
  // Explicit whole-source rejection means no body sample(), even for a long
  // entity. Its renderer/eye update is independent and remains outside here.
  const farGeometry={...geometry,length:cell*40};
  const r=compare(a,b,[{color:colors[0],geometry:farGeometry,bounds}],
    {floor:true,walls:true,wallStrength:.25,viewport:distant},'distant long source');
  assert.equal(r.stats.lastRejectedSources,1);assert.equal(r.bCalls,0);assert(r.aCalls>100);
  // Reusing the public wrapper's entry after a bounded frame must not retain
  // stale bounds when the next frame comes from an unbounded caller.
  const service=createSnakeNeonReflection({width,height,tile:cell,makeCanvas:canvasFactory});
  assert(service.prepare({grid:LEVEL_GRID,key:'test',drawWallArtwork(c){c.fillStyle='#fff';c.fillRect(0,0,width,height);}}));
  let tracked=trackedSource(farGeometry,'Green',bounds);
  service.render([tracked.source],{viewport:distant});assert.equal(tracked.calls(),0);
  assert.equal(service.stats().light.culling.lastRejectedSources,1);
  tracked=trackedSource(farGeometry,'Green',undefined);
  service.render([tracked.source],{viewport:distant});assert(tracked.calls()>100);
  assert.equal(service.stats().light.culling.lastRejectedSources,0);
  assert.equal(service.stats().light.culling.totalCandidateSources,2);
  assert.equal(service.stats().light.culling.totalRejectedSources,1);
  assert.equal(service.stats().light.culling.totalProcessedSources,1);
  service.dispose();a.dispose();b.dispose();
}
assert(culled>0);assert(samplesSaved>0);
console.log(JSON.stringify({passed:true,comparisons,edgeCases,headCases,failOpenCases,culled,samplesSaved,
  visualPixels:'exact',distantSampleCalls:0,sourceCounters:'candidate = rejected + processed',
  reference:process.argv[2]||'unbounded unchanged per-stamp renderer'}));
