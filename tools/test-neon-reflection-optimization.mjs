import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createMazeReflection as baseline} from './baseline/neon-maze-reflection-v1.02.06.00.js';
import {createMazeReflection as optimized} from '../src/render/neon-maze-reflection.js';
import {LEVEL_GRID,ROUTE_VERTICES,CELL} from './fixtures/neon-optimization-maze.js';
import {makeRoute} from './fixtures/neon-optimization-maze.js';

const runtime='C:/Users/tcher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js';
const {createCanvas}=await import(pathToFileURL(runtime));
const colors=['#b8ef52','#ffe080','#65c9f2','#ed83b6','#ffa56b'];
const canvasFactory=(w,h)=>createCanvas(w,h);
const route=makeRoute();
function sourcesAt(phase,cell=CELL){
  const factor=cell/CELL;
  return colors.map((color,i)=>{
    const start=(phase+i/5)*route.total,length=(2.1+i*1.2)*cell;
    return {color,geometry:{length,head:null,
      sample(distance,out={}){const p=route.point(start+distance/factor);out.x=p.x*factor;out.y=p.y*factor;return out;}}};
  });
}
const quantile=(values,q)=>{const a=[...values].sort((a,b)=>a-b);return a[Math.floor((a.length-1)*q)];};
function difference(a,b){
  const aa=a.getContext('2d').getImageData(0,0,a.width,a.height).data;
  const bb=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
  let maximum=0,sum=0,changed=0;
  // Compare premultiplied RGBA: unassociated RGB in near-transparent pixels
  // can differ greatly while contributing less than one display channel.
  for(let i=0;i<aa.length;i+=4){let pixelChanged=false;
    for(let c=0;c<4;c++){
      const x=c===3?aa[i+c]:aa[i+c]*aa[i+3]/255;
      const y=c===3?bb[i+c]:bb[i+c]*bb[i+3]/255;
      const d=Math.abs(x-y);maximum=Math.max(maximum,d);sum+=d;pixelChanged ||= d>.0001;
    }if(pixelChanged)changed++;
  }
  return {maximum,mean:sum/aa.length,changed};
}
const reports=[];
const correctnessOnly=!process.argv.includes('--benchmark');
let randomState=0x4e30619;
const random=()=>{randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;return (randomState>>>0)/4294967296;};
const openCells=[];
for(let y=0;y<LEVEL_GRID.length;y++)for(let x=0;x<LEVEL_GRID[0].length;x++)if(LEVEL_GRID[y][x]==='.')openCells.push({x,y});
for(const cell of [16,36]){
  const args={grid:LEVEL_GRID,cell,width:LEVEL_GRID[0].length*cell,height:LEVEL_GRID.length*cell,canvasFactory,scale:1};
  const a=baseline(args),b=optimized(args);a.prepareColors(colors);b.prepareColors(colors);
  const maxima={floor:0,walls:0},means={floor:0,walls:0};let changed=0;
  for(let frame=0;frame<32;frame++){
    const sources=sourcesAt(frame/32,cell);
    a.render(sources,.7,{floor:true,walls:true,wallStrength:.25});
    b.render(sources,.7,{floor:true,walls:true,wallStrength:.25});
    for(const [name,ca,cb] of [['floor',a.canvas,b.canvas],['walls',a.wallCanvas,b.wallCanvas]]){
      const d=difference(ca,cb);maxima[name]=Math.max(maxima[name],d.maximum);means[name]+=d.mean/32;changed+=d.changed;
    }
    assert.equal(a.stats().lastStamps,b.stats().lastStamps,'Sampling count unchanged');
    assert.equal(a.stats().lastWallStamps,b.stats().lastWallStamps,'Wall sampling count unchanged');
    assert(b.stats().lastShadowClips<=a.stats().lastShadowClips,'Fewer floor clip operations');
    assert(b.stats().lastWallShadowClips<=a.stats().lastWallShadowClips,'Fewer wall clip operations');
  }
  // The accepted fixtures allow sparse rasterizer edge differences up to two
  // premultiplied channel levels; brightness, kernels and sample positions stay fixed.
  assert(maxima.floor<=2.001 && maxima.walls<=2.001,JSON.stringify({cell,maxima,means}));
  let stressMaximum=0,stressMean=0;
  for(let frame=0;frame<40;frame++){
    const sources=Array.from({length:8},(_,i)=>{
      const position=openCells[Math.floor(random()*openCells.length)];
      const rx=frame<8?(frame%2?0:.5):.005+random()*.99;
      const ry=frame<8?(frame%4<2?0:.5):.005+random()*.99;
      const x=(position.x+rx)*cell,y=(position.y+ry)*cell;
      return {color:colors[i%5],geometry:{length:0,head:null,sample(d,out={}){out.x=x;out.y=y;return out;}}};
    });
    a.render(sources,.7,{floor:true,walls:true,wallStrength:.25});
    b.render(sources,.7,{floor:true,walls:true,wallStrength:.25});
    for(const [ca,cb] of [[a.canvas,b.canvas],[a.wallCanvas,b.wallCanvas]]){
      const d=difference(ca,cb);stressMaximum=Math.max(stressMaximum,d.maximum);stressMean+=d.mean/80;
    }
  }
  assert(stressMaximum<=2.001,JSON.stringify({cell,stressMaximum,stressMean}));
  for(const floor of [false,true])for(const walls of [false,true]){
    a.render(sourcesAt(.312,cell),.7,{floor,walls,wallStrength:.25});
    b.render(sourcesAt(.312,cell),.7,{floor,walls,wallStrength:.25});
    if(floor)assert(difference(a.canvas,b.canvas).maximum<=2.001);
    if(walls)assert(difference(a.wallCanvas,b.wallCanvas).maximum<=2.001);
  }
  const times={reference:[],optimized:[]};
  // Alternating order, same trajectories and paints. This is a CPU software
  // Canvas test, not browser FPS or GPU completion latency.
  for(let round=0;round<(correctnessOnly?0:80);round++){
    const sources=sourcesAt((round%32)/32,cell);
    for(const [name,renderer] of round%2?[['reference',a],['optimized',b]]:[['optimized',b],['reference',a]]){
      const start=performance.now();renderer.render(sources,.7,{floor:true,walls:true,wallStrength:.25});
      if(round>=16)times[name].push(performance.now()-start);
    }
  }
  // A geometry failure must not abandon a reusable corridor clip on a canvas.
  assert.throws(()=>b.render([{color:colors[0],geometry:{length:cell*3,sample(d,out){if(d>cell)throw Error('Injected geometry failure');out.x=cell*8+d;out.y=cell*2.5;return out;}}}],.7),/Injected geometry/);
  a.render(sourcesAt(.42,cell),.7);b.render(sourcesAt(.42,cell),.7);
  assert(difference(a.canvas,b.canvas).maximum<=2.001);
  assert(difference(a.wallCanvas,b.wallCanvas).maximum<=2.001);
  reports.push({cell,pixelError:{maximum:maxima,mean:means,changed,stressMaximum,stressMean},
    medianMs:{reference:quantile(times.reference,.5),optimized:quantile(times.optimized,.5)},
    p95Ms:{reference:quantile(times.reference,.95),optimized:quantile(times.optimized,.95)},
    reference:a.stats(),optimized:b.stats()});
  a.dispose();b.dispose();
}
console.log(JSON.stringify({passed:true,correctnessOnly,method:'same-density vector visibility polygon and shared corridor clips',reports},null,2));
