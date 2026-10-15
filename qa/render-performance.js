import {createLiveSnakeRenderer} from '../src/render/live-snake.js?v=1.02.06.00';
import {createSnakeNeon} from '../src/render/snake-neon.js?v=1.02.06.00';
import {createNeonMaterial} from '../src/render/neon-material.js?v=1.02.06.00';
import '../src/render/dusk-lighting.js?v=1.02.06.00';

// QA-only: no production state, simulation PRNG, or native collision code.
// The historical top-level renderer is an exact git blob. Only its module
// location is rebased so it can use the same assets and shared dependencies.
const BASELINE_COMMIT='6a026cae18e6e3b9577ee336a9ceca0b80cad19e';
const W=576,H=400,TILE=16,SCALE=1.6,OFFSET_X=(960-W*SCALE)/2,WARMUP=60,BATCHES=3,FRAMES=90,CHUNK=6;
const COLORS=['#35e55b','#ffe57a','#66c2ff','#d66bff','#ff8873'];
const ORIGINS=[[3,3],[20,3],[3,10],[20,10],[3,17]];
const SCENARIOS=['forward','corners','reverse'];
const LABELS={baseline:'GitHub v103 — без неон',plain:'Текуща — без неон',inner:'Текуща — кеширана обработка на спрайтовете (без самосветене)',neon:'Текуща — пълен неон'};
const TRACKED_SOURCES=['live-snake.js','live-snake-curve.js','snake-material-ribbon.js','snake-head-seam.js',
  'snake-mouth-intake.js','snake-neon.js','neon-material.js','neon-context.js',
  'snake-neon-reflection.js','neon-maze-reflection.js','dusk-lighting.js'];
const $=id=>document.getElementById(id);
const ui={run:$('run'),inner:$('inner'),preview:$('preview'),status:$('status'),results:$('results'),summary:$('summary')};
const canvas=$('scene'),ctx=canvas.getContext('2d');
const copy=cells=>cells.map(p=>({...p}));
const camera=Object.freeze({x:W/2,y:H/2,zoom:1});
const lamp=Object.freeze({x:27,y:20,dir:Object.freeze({x:0,y:-1})});
const grid=Array.from({length:H/TILE},(_,y)=>Array.from({length:W/TILE},(_,x)=>
  x===0||y===0||x===W/TILE-1||y===H/TILE-1||
  (y===9||y===16)&&x!==17||x===18&&![8,15,22].includes(y)?'#':'.').join(''));
let resources=null,preparing=null,running=false,results=null,activeVariant=null;

function makeCanvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
async function source(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error(`${response.status}: ${url}`);return response.text();}
async function sha256(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function loadBaseline(){
  const url=new URL('../tools/baseline/live-snake-v1.02.03.00.js',import.meta.url);
  const raw=await source(url),base=new URL('../src/render/live-snake.js',import.meta.url).href;
  const adjusted=raw.replace(/(from\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,
    (_all,before,path,after)=>before+new URL(path,base).href+after).replaceAll('import.meta.url',JSON.stringify(base));
  const blob=URL.createObjectURL(new Blob([adjusted],{type:'text/javascript'}));
  try{return{module:await import(blob),hash:await sha256(raw)};}finally{URL.revokeObjectURL(blob);}
}
async function loadImage(relative){const im=new Image();im.src=new URL(relative,import.meta.url);await im.decode();return im;}
function fixture(scenario,color,index){
  const [x,y]=ORIGINS[index],tail=[];
  if(scenario==='forward')for(let i=0;i<11;i++)tail.push({x:x+i,y});
  else{for(let i=0;i<8;i++)tail.push({x:x+i,y});for(let i=1;i<=3;i++)tail.push({x:x+7,y:y+i});}
  const oldBody=tail.reverse(),backwards=scenario==='reverse';
  const next=backwards?{x,y:y+1}:scenario==='forward'?{x:x+11,y}:{x:x+7,y:y+4};
  const body=backwards?[...oldBody.slice(1),next]:[next,...oldBody.slice(0,-1)];
  const snake={body,dir:{x:body[0].x-body[1].x,y:body[0].y-body[1].y},reversing:backwards,color,
    brainAggression:index/4,anger:index*.5,threatByPlayer:{1:index/2}};
  for(const p of body)if(grid[p.y]?.[p.x]!=='.')throw Error(`Fixture enters wall: ${scenario} ${index} ${p.x},${p.y}`);
  return{snake,oldBody,duration:backwards?436:218};
}
function fixtures(renderer){return SCENARIOS.map(scenario=>COLORS.map((color,index)=>{
  const item=fixture(scenario,color,index);
  renderer.recordStep(item.snake,{oldBody:item.oldBody,t:1000,duration:item.duration,wasReversing:item.snake.reversing});
  return item;
}));}
function createVariant(id,renderer,sets,extra={}){
  const dusk=globalThis.MazeBitersDuskLighting.create({width:W,height:H,tile:TILE,
    positionFor:(p,_t,out)=>Object.assign(out,{x:p.x,y:p.y}),isPowered:()=>false});
  dusk.prepare();return{id,renderer,sets,dusk,clock:0,...extra};
}
async function prepare(){
  if(resources)return resources;if(preparing)return preparing;
  preparing=(async()=>{
    ui.status.textContent='Подготвям оригиналните рисунки, baseline и светлинните кешове…';
    const [baseline,atlas,sourceHashes]=await Promise.all([loadBaseline(),loadImage('../assets/atlases/4k/concept-maze-pipes-gradient-160.png'),
      Promise.all(TRACKED_SOURCES.map(async name=>[name,await sha256(await source(new URL(`../src/render/${name}`,import.meta.url)))]))]);
    const current=createLiveSnakeRenderer({tile:TILE}),old=baseline.module.createLiveSnakeRenderer({tile:TILE});
    await Promise.all([current.prepare(),old.prepare()]);
    const walls=makeCanvas(W*2,H*2),wc=walls.getContext('2d');wc.scale(2,2);
    const drawWalls=c=>{for(let y=0;y<grid.length;y++)for(let x=0;x<grid[y].length;x++)if(grid[y][x]==='#')
      c.drawImage(atlas,10*160,2*160,160,160,x*TILE,y*TILE,TILE,TILE);};
    drawWalls(wc);
    const currentSets=fixtures(current),oldSets=fixtures(old);
    const material=createNeonMaterial({strength:.7,canvasFactory:makeCanvas});material.prewarm(current.getNeonSources());
    const neon=createSnakeNeon({width:W,height:H,tile:TILE,makeCanvas,snake:current});
    if(!neon.warmup())throw Error('Neon warmup failed');
    const variants=[createVariant('baseline',old,oldSets),createVariant('plain',current,currentSets),
      createVariant('inner',current,currentSets,{material,context:material.wrapContext(ctx,.7)}),
      createVariant('neon',current,currentSets,{neon})];
    resources={variants,walls,drawWalls,baselineHash:baseline.hash,sourceHashes:Object.fromEntries(sourceHashes)};
    ui.preview.replaceChildren(...variants.map(v=>{const option=document.createElement('option');option.value=v.id;option.textContent=LABELS[v.id];return option;}));
    ui.preview.disabled=false;return resources;
  })();
  try{return await preparing;}finally{preparing=null;}
}
function render(variant,index){
  const scenario=Math.floor(index/30)%3,phase=((index%30)+.5)/30,items=variant.sets[scenario];
  const time=1000+phase*items[0].duration,clock=100000+(variant.clock++)*1000/60;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';
  ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(SCALE,0,0,SCALE,OFFSET_X,0);
  ctx.fillStyle='#090c18';ctx.fillRect(0,0,W,H);ctx.drawImage(resources.walls,0,0,W,H);
  const neon=variant.neon;
  if(neon&&!neon.beginFrame(ctx,{grid,key:'render-bench-1',drawWallArtwork:resources.drawWalls,time:clock}))throw Error('Neon beginFrame failed');
  const target=neon?neon.snakeContext():variant.context||ctx;
  for(const{snake}of items){
    if(!variant.renderer.draw(target,snake,clock,{freeze:time}))throw Error(variant.renderer.stats().error||'Snake draw failed');
    neon?.noteSnake(snake,{freeze:time});
  }
  const actors=neon?neon.actorsContext():ctx;
  actors.fillStyle='#30a619';actors.fillRect(lamp.x*TILE,(lamp.y+.5)*TILE,14,8);
  actors.fillStyle='#ed300b';actors.fillRect(lamp.x*TILE,lamp.y*TILE,14,9);
  ctx.setTransform(SCALE,0,0,SCALE,OFFSET_X,0);
  if(!variant.dusk.render(ctx,[lamp],camera,clock,clock))throw Error('DUSK render failed');
  if(neon&&!neon.present(ctx,variant.dusk.getMask(),camera))throw Error('Neon present failed');
}
const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function visible(){if(document.visibilityState!=='visible')throw Error('Тестът е прекъснат: страницата трябва да остане на преден план.');}
function quantile(values,p){const a=[...values].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.ceil(a.length*p)-1))]??0;}
function distribution(values){return{medianMs:quantile(values,.5),p95Ms:quantile(values,.95),minMs:Math.min(...values),maxMs:Math.max(...values),samples:values.length};}
function readCounts(variant){return{material:variant.neon?.diagnostics().material.pixelReads??variant.material?.stats().pixelReads??0,
  receiver:variant.neon?.diagnostics().reflection.receiverPixelReads??0};}
async function series(variant,count,measured){
  const samples=[],perScenario={forward:[],corners:[],reverse:[]};let completed=0;
  visible();await raf();visible();const start=performance.now();
  while(completed<count){
    const end=Math.min(count,completed+CHUNK);
    for(;completed<end;completed++){
      // Warm all three scenarios too (20 poses each for a 60-frame warmup).
      const index=measured?completed:Math.floor(Math.floor(completed/20)*30+(completed%20)*1.5);
      const before=performance.now();render(variant,index);const elapsed=performance.now()-before;
      if(measured){samples.push(elapsed);perScenario[SCENARIOS[Math.floor(index/30)%3]].push(elapsed);}
    }
    await raf();visible();
  }
  return{samples,perScenario,rafBatchWallMs:performance.now()-start,frames:completed,rafYields:Math.ceil(count/CHUNK)};
}
function summarize(entry){const values=entry.batches.flatMap(batch=>batch.samples);
  return{id:entry.id,label:LABELS[entry.id],jsSubmission:distribution(values),
    scenarios:Object.fromEntries(SCENARIOS.map(name=>[name,distribution(entry.batches.flatMap(b=>b.perScenario[name]))])),
    rafBatchWall:distribution(entry.batches.map(b=>b.rafBatchWallMs)),
    batches:entry.batches.map(batch=>({jsSubmission:distribution(batch.samples),rafBatchWallMs:batch.rafBatchWallMs,frames:batch.frames,rafYields:batch.rafYields})),
    runtimePixelReads:entry.after.material-entry.before.material+entry.after.receiver-entry.before.receiver,
    readsBefore:entry.before,readsAfter:entry.after};}
function showResults(){
  ui.results.textContent=JSON.stringify(results,null,2);ui.summary.replaceChildren();
  for(const row of results?.variants||[]){const tr=document.createElement('tr');
    for(const value of [row.label,`${row.jsSubmission.medianMs.toFixed(3)} ms`,`${row.jsSubmission.p95Ms.toFixed(3)} ms`,`${row.rafBatchWall.medianMs.toFixed(1)} ms / 90`,row.jsSubmission.samples]){
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }ui.summary.append(tr);
  }
}
async function run({includeInner=ui.inner.checked}={}){
  if(running)throw Error('A benchmark is already running');running=true;results=null;ui.run.disabled=true;ui.preview.disabled=true;ui.inner.disabled=true;ui.status.classList.remove('error');
  try{
    visible();const r=await prepare();ui.preview.disabled=true;
    const variants=r.variants.filter(v=>includeInner||v.id!=='inner');
    const entries=new Map(variants.map(v=>[v.id,{id:v.id,batches:[]}]));
    for(const variant of variants){ui.status.textContent=`Загряване: ${LABELS[variant.id]} · ${WARMUP} кадъра`;await series(variant,WARMUP,false);entries.get(variant.id).before=readCounts(variant);}
    for(let batch=0;batch<BATCHES;batch++){
      // Rotate order between rounds to reduce systematic first/last bias.
      const ordered=[...variants.slice(batch%variants.length),...variants.slice(0,batch%variants.length)];
      for(const variant of ordered){
        ui.status.textContent=`Серия ${batch+1}/${BATCHES}: ${LABELS[variant.id]} · ${FRAMES} кадъра`;
        entries.get(variant.id).batches.push(await series(variant,FRAMES,true));
      }
    }
    for(const variant of variants)entries.get(variant.id).after=readCounts(variant);
    results={schema:'maze-biters-render-bench-v1',createdAt:new Date().toISOString(),
      environment:{userAgent:navigator.userAgent,devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency??null,visibility:document.visibilityState},
      fixture:{snakes:5,cellsEach:11,scenarios:SCENARIOS,world:[W,H],backingStore:[canvas.width,canvas.height],css:[960,640],worldScale:SCALE,offsetX:OFFSET_X,tile:TILE,warmup:WARMUP,batches:BATCHES,framesPerBatch:FRAMES,framesPerRafChunk:CHUNK,sceneKey:'render-bench-1',darkness:.8,simulation:false,contacts:false,bites:false},
      source:{baselineCommit:BASELINE_COMMIT,baselineRendererSha256:r.baselineHash,currentRendererSha256:r.sourceHashes['live-snake.js'],currentSourceHashes:r.sourceHashes,
        baselineScope:'Exact historical top-level renderer; relative imports and import.meta.url rebased. Shared imported helpers/assets are current local files, not a complete historical build.'},
      metrics:{jsSubmission:'Synchronous performance.now() around a complete fixture draw. No per-frame readback, GPU completion or FPS claim.',
        rafBatchWall:'90 submitted frames in chunks of 6, including 15 RAF yields. Scheduling/back-pressure indicator, not displayed-frame throughput.',
        excluded:'Asset decode, atlas/mask preparation, fixture recordStep setup and final preview are outside measured samples.'},
      variants:variants.map(v=>({...summarize(entries.get(v.id)),renderer:v.renderer.stats(),lighting:v.dusk.diagnostics(),neon:v.neon?.diagnostics()??null,inner:v.material?.stats()??null}))};
    showResults();
    if(results.variants.some(v=>v.runtimePixelReads!==0))throw Error('Unexpected warm-runtime pixel readback; inspect JSON.');
    activeVariant=variants.at(-1);ui.preview.value=activeVariant.id;render(activeVariant,49);
    ui.status.textContent='Готово. JSON е под сцената; последният преглед не е част от измерването.';
    return results;
  }catch(error){ui.status.textContent=error.message;ui.status.classList.add('error');throw error;}
  finally{running=false;ui.run.disabled=false;ui.inner.disabled=false;ui.preview.disabled=!resources;}
}
ui.run.addEventListener('click',()=>run().catch(error=>console.error(error)));
ui.preview.addEventListener('change',()=>{activeVariant=resources?.variants.find(v=>v.id===ui.preview.value);if(activeVariant&&!running)render(activeVariant,49);});
globalThis.__mazeBitersRenderBench={run,get results(){return results;},get running(){return running;},
  preview(id,index=49){if(running)throw Error('Wait for the benchmark');const v=resources?.variants.find(v=>v.id===id);if(!v)throw Error('Run the benchmark first');render(v,index);ui.preview.value=id;return{id,index};}};
ctx.fillStyle='#080e13';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#abc1b7';ctx.font='24px system-ui';ctx.fillText('Пусни сравнението, за да заредиш сцената.',50,90);
