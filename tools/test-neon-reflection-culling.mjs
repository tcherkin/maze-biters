import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createMazeReflection as reference} from '../src/render/neon-maze-reflection.js';
import {createSnakeNeonReflection as referenceService} from '../src/render/snake-neon-reflection.js';
import {createMazeReflection as culled,REFLECTION_CULLING_GUARD} from '../src/render/neon-maze-reflection.js';
import {createSnakeNeonReflection as culledService} from '../src/render/snake-neon-reflection.js';
import {LEVEL_GRID,CELL} from './fixtures/neon-optimization-maze.js';
import {makeRoute} from './fixtures/neon-optimization-maze.js';

const runtime='C:/Users/tcher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js';
const {createCanvas}=await import(pathToFileURL(runtime));
const colors=['#b8ef52','#ffe080','#65c9f2','#ed83b6','#ffa56b'];
const canvasFactory=(w,h)=>createCanvas(w,h),route=makeRoute();
const routeSources=(phase,cell)=>colors.map((color,i)=>({color,geometry:{
  length:(2.1+i*1.2)*cell,head:null,sample(distance,out={}){
    const p=route.point((phase+i/5)*route.total+distance*CELL/cell);
    out.x=p.x*cell/CELL;out.y=p.y*cell/CELL;return out;
  }
}}));
const sourcePixels=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
function viewport(width,height,zoom,x,y){
  const w=width/zoom,h=height/zoom;return {left:x-w/2,top:y-h/2,right:x+w/2,bottom:y+h/2};
}
function crop(canvas,bounds){
  const out=createCanvas(320,240),c=out.getContext('2d');
  c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
  c.drawImage(canvas,bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top,0,0,320,240);
  return sourcePixels(out);
}
let cropChecks=0,rejected=0,candidates=0,maxRejectedFraction=0;
const cameraReports=[];
for(const cell of [16,36]){
  const width=LEVEL_GRID[0].length*cell,height=LEVEL_GRID.length*cell;
  const args={grid:LEVEL_GRID,cell,width,height,canvasFactory,scale:1};
  const a=reference(args),b=culled(args);a.prepareColors(colors);b.prepareColors(colors);
  const cameras=[viewport(width,height,1,width/2,height/2),
    viewport(width,height,1.8,width/2,height/2),
    viewport(width,height,2.5,cell*3,cell*3),
    viewport(width,height,2.5,width-cell*3,cell*3),
    viewport(width,height,2.5,cell*3,height-cell*3),
    viewport(width,height,2.5,width-cell*3,height-cell*3),
    viewport(width,height,4,cell*13.05,cell*6.05),
    viewport(width,height,.75,width/2,height/2),
    {left:cell*7+.03125,top:cell*1.99,right:cell*10.5+.0625,bottom:cell*7.25}];
  for(let frame=0;frame<8;frame++){
    const input=routeSources(frame/8,cell);
    a.render(input,.7,{floor:true,walls:true,wallStrength:.25});
    b.render(input,.7,{floor:true,walls:true,wallStrength:.25});
    assert.deepEqual(sourcePixels(a.canvas),sourcePixels(b.canvas),'Omitted viewport remains full-world identical');
    assert.deepEqual(sourcePixels(a.wallCanvas),sourcePixels(b.wallCanvas));
    for(const bounds of cameras){
      b.render(input,.7,{floor:true,walls:true,wallStrength:.25,viewport:bounds});
      assert.deepEqual(crop(a.canvas,bounds),crop(b.canvas,bounds),`Visible floor crop differs at cell${cell},frame${frame}`);
      assert.deepEqual(crop(a.wallCanvas,bounds),crop(b.wallCanvas,bounds),`Visible wall crop differs at cell${cell},frame${frame}`);
      cropChecks+=2;const stats=b.stats().culling;
      assert.equal(stats.lastCandidateStamps,stats.lastDrawnStamps+stats.lastRejectedStamps);
      rejected+=stats.lastRejectedStamps;candidates+=stats.lastCandidateStamps;
      maxRejectedFraction=Math.max(maxRejectedFraction,stats.lastRejectedStamps/Math.max(1,stats.lastCandidateStamps));
      if(frame===0)cameraReports.push({cell,bounds,candidates:stats.lastCandidateStamps,drawn:stats.lastDrawnStamps,rejected:stats.lastRejectedStamps});
    }
  }
  for(const floor of [false,true])for(const walls of [false,true]){
    const input=routeSources(.43,cell),bounds=cameras[2];
    a.render(input,.7,{floor,walls,wallStrength:.25});
    b.render(input,.7,{floor,walls,wallStrength:.25,viewport:bounds});
    if(floor){assert.deepEqual(crop(a.canvas,bounds),crop(b.canvas,bounds));cropChecks++;}
    if(walls){assert.deepEqual(crop(a.wallCanvas,bounds),crop(b.wallCanvas,bounds));cropChecks++;}
  }
  for(const bounds of [{left:0,top:0,right:0,bottom:5},{left:0,top:0,right:NaN,bottom:5}])
    assert.throws(()=>b.render(routeSources(0,cell),.7,{viewport:bounds}),/viewport/);
  // A source can be outside the camera while its kernel still lights the
  // visible wall. Test each exact reach plus its sampling guard independently.
  const point={x:cell*8.5,y:cell*2.5};
  const pointSource=[{color:colors[0],geometry:{length:0,head:null,sample(d,out){return Object.assign(out,point);}}}];
  for(const [kind,reach] of [['floor',cell*.68],['walls',cell*1.45]])for(const offset of [-.01,.01]){
    const left=point.x+reach+REFLECTION_CULLING_GUARD+offset;
    const bounds={left,top:point.y-cell,right:left+width/2,bottom:point.y+cell};
    const flags={floor:kind==='floor',walls:kind==='walls',wallStrength:.25};
    a.render(pointSource,.7,flags);b.render(pointSource,.7,{...flags,viewport:bounds});
    const stats=b.stats().culling;
    assert.equal(stats.lastCandidateStamps,1);
    assert.equal(stats.lastRejectedStamps,offset>0?1:0,`${kind} reach/guard boundary`);
    assert.deepEqual(crop(kind==='floor'?a.canvas:a.wallCanvas,bounds),crop(kind==='floor'?b.canvas:b.wallCanvas,bounds));
    cropChecks++;
  }
  assert.equal(a.stats().canvasAllocations,b.stats().canvasAllocations);
  assert.equal(b.stats().pixelReads,0);
  // Verify the public native wrapper forwards camera bounds to the raw field.
  const options={floor:true,walls:true};
  const sa=referenceService({width,height,tile:cell,makeCanvas:canvasFactory,options});
  const sb=culledService({width,height,tile:cell,makeCanvas:canvasFactory,options});
  const drawWallArtwork=c=>{c.fillStyle='#fff';c.fillRect(0,0,width,height);return true;};
  for(const service of [sa,sb])assert(service.prepare({grid:LEVEL_GRID,key:'test',drawWallArtwork}));
  const input=routeSources(.31,cell),bounds=cameras[4];
  const ma=sa.render(input),mb=sb.render(input,{viewport:bounds});
  assert.deepEqual(crop(ma.floor,bounds),crop(mb.floor,bounds));
  assert.deepEqual(crop(ma.walls,bounds),crop(mb.walls,bounds));cropChecks+=2;
  assert(sb.stats().light.culling.lastRejectedStamps>0);
  sa.dispose();sb.dispose();a.dispose();b.dispose();
}
assert(rejected>0,'The test must exercise actual culling');
console.log(JSON.stringify({passed:true,cropChecks,samplingGuard:REFLECTION_CULLING_GUARD,candidates,rejected,
  rejectedFraction:rejected/candidates,maxRejectedFraction,cameraReports},null,2));
