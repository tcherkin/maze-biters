import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {removeGpuReflection} from './gpu-presentation-contract.mjs';
import {createMazeReflection} from '../src/render/neon-maze-reflection.js';
import {createSnakeNeonReflection,SNAKE_REFLECTION_COLORS,CREATURE_REFLECTION_COLORS,PICKUP_REFLECTION_COLORS} from '../src/render/snake-neon-reflection.js';
const require=createRequire(import.meta.url);let native;
try{native=require('@napi-rs/canvas');}catch{native=require('C:/Users/tcher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');}
const {createCanvas}=native;
const surfaces=[],makeCanvas=(w,h)=>{const c=createCanvas(w,h);surfaces.push(c);return c;};
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
const copy=c=>Buffer.from(pixels(c));
const energy=c=>pixels(c).reduce((n,v,i)=>n+(i%4===3?v:0),0);
const grid=['#######','#.....#','#.###.#','#.....#','#######'],tile=16,width=112,height=80;
const point=(x=24,y=24)=>({length:0,sample(_d,out){out.x=x;out.y=y;return out;}});
const args={grid,cell:tile,width,height,canvasFactory:makeCanvas};
const report={canonicalComparisons:0,opacityChecks:0,boundedReuseFrames:0};

// Reconstruct only the five explicit additive source-opacity hunks and the
// reviewed palette ceiling. Pin the ENTIRE resulting pre-pickup renderer, so
// this is not a comparison against the same new opacity branch twice.
let baseline=(await readFile(new URL('../src/render/neon-maze-reflection.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');
baseline=removeGpuReflection(baseline);
const reverse=(current,previous)=>{assert.equal(baseline.split(current).length-1,1,'exact reviewed pickup hunk');baseline=baseline.replace(current,previous);};
reverse("maxColors>11)throw new RangeError('Expected one to eleven light palettes');","maxColors>9)throw new RangeError('Expected one to nine light palettes');");
reverse('    try{for(const {geometry:g,color,bounds,opacity=1} of sources){','    try{for(const {geometry:g,color,bounds} of sources){');
reverse("      if(!Number.isFinite(opacity))throw new TypeError('Reflection source opacity must be finite');\n      const sourceOpacity=clamp(opacity,0,1);\n      if(sourceOpacity===0)continue;\n",'');
reverse('Math.max(.25,length/spacing)*sourceOpacity,wallImage','Math.max(.25,length/spacing),wallImage');
reverse('(i===0?.5:i===count?.5+remainder/spacing*.5:1)*sourceOpacity,wallImage','i===0?.5:i===count?.5+remainder/spacing*.5:1,wallImage');
reverse('remainder/spacing*.5*sourceOpacity,wallImage','remainder/spacing*.5,wallImage');
assert.equal(createHash('sha256').update(baseline).digest('hex'),'28f1f6092e315908b1fc93d7aa03521b9c408c091364aea1b33b0d8b804a331b','all previous light kernels, geometry, radius and composition remain pinned');
const {createMazeReflection:before}=await import('data:text/javascript;base64,'+Buffer.from(baseline).toString('base64'));
const old=before({...args,maxColors:9}),current=createMazeReflection({...args,maxColors:11});
const oldColors=[...Object.values(SNAKE_REFLECTION_COLORS),...Object.values(CREATURE_REFLECTION_COLORS)];
for(const phase of [0,.2,.5,.83])for(const floor of [false,true])for(const walls of [false,true]){
  const sources=oldColors.map((color,i)=>({color,geometry:{length:(i+.3)*2.7,sample(d,out){out.x=24+d+phase;out.y=i%2?24:56;return out;}}}));
  const flags={floor,walls,wallStrength:.4};old.render(sources,.7,flags);current.render(sources,.7,flags);
  if(floor){assert.deepEqual(copy(current.canvas),copy(old.canvas),'omitted opacity preserves all previous floor bytes');report.canonicalComparisons++;}
  if(walls){assert.deepEqual(copy(current.wallCanvas),copy(old.wallCanvas),'omitted opacity preserves all previous wall bytes');report.canonicalComparisons++;}
  current.render(sources.map(s=>({...s,opacity:1})),.7,flags);
  if(floor){assert.deepEqual(copy(current.canvas),copy(old.canvas),'explicit opacity1 preserves floor bytes');report.canonicalComparisons++;}
  if(walls){assert.deepEqual(copy(current.wallCanvas),copy(old.wallCanvas),'explicit opacity1 preserves wall bytes');report.canonicalComparisons++;}
}
const fade=createMazeReflection({...args,maxColors:11}),source={geometry:{...point(),length:tile*2/9*.9},color:PICKUP_REFLECTION_COLORS.fruit0};
const floorContext=fade.canvas.getContext('2d'),wallContext=fade.wallCanvas.getContext('2d');
let floorGains=[],wallGains=[];
for(const [ctx,gains]of [[floorContext,()=>floorGains],[wallContext,()=>wallGains]]){
  const draw=ctx.drawImage.bind(ctx);ctx.drawImage=(...values)=>{if(ctx.globalCompositeOperation==='source-over')gains().push(ctx.globalAlpha);return draw(...values);};
}
fade.render([source],.7,{wallStrength:.4});const fullFloor=copy(fade.canvas),fullWalls=copy(fade.wallCanvas),fullFloorEnergy=energy(fade.canvas),fullWallEnergy=energy(fade.wallCanvas);
const fullFG=floorGains,fullWG=wallGains;floorGains=[];wallGains=[];
fade.render([{...source,opacity:.5}],.7,{wallStrength:.4});
assert.equal(floorGains.length,fullFG.length);assert.equal(wallGains.length,fullWG.length);
for(const [half,full]of [[floorGains,fullFG],[wallGains,fullWG]])for(let i=0;i<full.length;i++)assert.ok(Math.abs(half[i]-full[i]/2)<=1/255,'each source stamp receives half opacity');
for(const [half,full]of [[energy(fade.canvas),fullFloorEnergy],[energy(fade.wallCanvas),fullWallEnergy]])assert.ok(half/full>.40&&half/full<.59,`single-source field fades on both receivers: ${half}/${full}`);report.opacityChecks+=4;
let sampled=0;const noLight={geometry:{length:10,sample(){sampled++;throw Error('Zero-alpha source sampled');}},color:'#abcdef',opacity:0};
const colorsBefore=fade.stats().cachedColors;fade.render([noLight],.7,{wallStrength:.4});
assert.equal(sampled,0);assert.equal(energy(fade.canvas),0);assert.equal(energy(fade.wallCanvas),0);assert.equal(fade.stats().cachedColors,colorsBefore);assert.equal(fade.stats().lastStamps,0);report.opacityChecks+=5;
fade.render([source],.7,{wallStrength:.4});assert.deepEqual(copy(fade.canvas),fullFloor);assert.deepEqual(copy(fade.wallCanvas),fullWalls);report.opacityChecks+=2;
assert.throws(()=>fade.render([{...source,opacity:NaN}]),/opacity must be finite/);

assert.deepEqual(PICKUP_REFLECTION_COLORS,{fruit0:'#ff7668',fruit1:'#ffe080',fruit2:'#ff7668',fruit3:'#b8ef52',egg:'#eee4c5'});
const bridge=createSnakeNeonReflection({width,height,tile,makeCanvas});
bridge.prepare({grid,key:'pickup-test',drawWallArtwork:ctx=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);return true;}});
assert.equal(bridge.stats().light.cachedColors,5,'existing snake-only preparation retains its old cache count');
const allSources=[
  ...Object.keys(SNAKE_REFLECTION_COLORS).map(palette=>({palette,geometry:point()})),
  ...Object.values(CREATURE_REFLECTION_COLORS).map(lightColor=>({lightColor,geometry:point()})),
  ...Object.values(PICKUP_REFLECTION_COLORS).map(lightColor=>({lightColor,geometry:point()}))
];
bridge.render(allSources);assert.equal(bridge.stats().light.cachedColors,11,'five snakes plus four creatures plus only two new pickup colors');
const allocations=surfaces.length,cacheBytes=bridge.stats().light.accountedCanvasBytes,reads=bridge.stats().receiverPixelReads;
for(let i=0;i<60;i++){
  bridge.render(allSources.map((s,j)=>({...s,opacity:j<9?1:(i%3)/2})));
  assert.equal(bridge.stats().light.cachedColors,11);assert.equal(bridge.stats().light.accountedCanvasBytes,cacheBytes);report.boundedReuseFrames++;
}
assert.equal(surfaces.length,allocations);assert.equal(bridge.stats().receiverPixelReads,reads);assert.equal(bridge.stats().light.pixelReads,0);
const single={geometry:point(),lightColor:PICKUP_REFLECTION_COLORS.egg};
const stable=bridge.render([single]),stableFloor=copy(stable.floor),stableWalls=copy(stable.walls);
assert.ok(energy(stable.floor)>0&&energy(stable.walls)>0);
const hidden=bridge.render([{...single,opacity:0}]);assert.equal(energy(hidden.floor),0);assert.equal(energy(hidden.walls),0);
const restored=bridge.render([single]);assert.deepEqual(copy(restored.floor),stableFloor);assert.deepEqual(copy(restored.walls),stableWalls);
const half=bridge.render([{...single,opacity:.5}]);assert.ok(energy(half.floor)>0);assert.ok(energy(half.walls)>0);report.opacityChecks+=6;
bridge.render([{geometry:point(),lightColor:'#abcdef'}]);assert.equal(bridge.stats().light.cachedColors,11,'unknown caller colors do not expand explicit whitelist');
assert.throws(()=>createMazeReflection({...args,maxColors:12}),/eleven/);
const allUnique=[...new Set([...oldColors,...Object.values(PICKUP_REFLECTION_COLORS)])];
current.prepareColors(allUnique);assert.equal(current.stats().cachedColors,11);assert.throws(()=>current.prepareColors(['#abcdef']),/capacity exceeded/);
for(const service of [old,current,fade,bridge])service.dispose();assert.ok(surfaces.every(c=>c.width===1&&c.height===1),'all reflection resources disposed');
console.log(JSON.stringify({passed:true,...report,colors:11,newColors:2,existingKernelGeometryUnchanged:true},null,2));
