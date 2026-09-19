// Sequential warmed render measurements, without recording. Same route and
// camera for the preserved v0.3.51 and the articulated-paw dragon; this is not pure GPU time.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
// Target one case when an external workload invalidates a measurement; there
// is no reason to repeat every otherwise clean warmed case.
const selectedWidth=Number(process.argv.find(a=>a.startsWith('--width='))?.split('=')[1]);
const selectedModel=process.argv.find(a=>a.startsWith('--model='))?.split('=')[1];
if(selectedWidth&&!([1920,3840].includes(selectedWidth)))throw new Error('Supported widths: 1920, 3840');
if(selectedModel&&!(['dragon-v3','dragon'].includes(selectedModel)))throw new Error('Supported models: dragon-v3, dragon');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']}),rows=[],errors=[];
 try{
  for(const width of (selectedWidth?[selectedWidth]:[1920,3840]))for(const model of (selectedModel?[selectedModel]:['dragon-v3','dragon'])){
   console.error(`[performance] ${model} ${width}`);const caseStartedAt=new Date().toISOString();
   const page=await browser.newPage({viewport:{width,height:width*9/16},deviceScaleFactor:1});
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer','globalThis.__perfScene=this;this.renderer=new THREE.WebGLRenderer')}));
   await page.goto(`http://127.0.0.1:8093/experiments/3d/?v=0.3.52&look=balanced&player=${model}`);
   await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:90000});
   const measurement=await page.evaluate(async()=>{
    MazeBiters3DEngine.pause();const s=__perfScene,render=s.render.bind(s);s.render=()=>{};
    const {CONCEPT_MAZE,CONCEPT_SNAKES}=await import('/experiments/3d/maze-layout.mjs');
    const state={generation:901,started:true,paused:false,speed:.5,time:1000,maze:CONCEPT_MAZE,cols:19,rows:15,
     player:{id:1,x:4,y:9,visual:{x:4,y:9},dir:{x:1,y:0},dead:false,hidden:false,shield:false,powered:false},
     snakes:CONCEPT_SNAKES.map((o,i)=>({...o,id:i+1,dir:{x:o.body[0].x-o.body[1].x,y:o.body[0].y-o.body[1].y},motion:null,reversing:false})),bites:[],predations:[]};
    const result=[],gl=s.renderer.getContext();
    for(const zoom of [1.5]){
     state.generation++;s.reset(state);s.resetView();s.zoom=s.targetZoom=zoom;s.playerYaw=Math.PI/2;
     const samples=[];let before;
     for(let frame=0;frame<210;frame++){
      const phase=frame/40;state.time+=1000/120;state.player.visual.x=4+Math.sin(phase)*1.5;
      state.player.dir.x=Math.cos(phase)>=0?1:-1;
      const start=performance.now();render(state,1/120,1/120);gl.finish();
      if(frame===89)before={...s.renderer.info.memory};if(frame>=90)samples.push(performance.now()-start);
     }
     samples.sort((a,b)=>a-b);let lights=0;s.scene.traverse(o=>{if(o.isLight)lights++;});
     result.push({zoom,samples:samples.length,p50:samples[60],p95:samples[114],p99:samples[118],max:samples.at(-1),before,after:{...s.renderer.info.memory},lights,diagnostics:s.diagnostics()});
    }return {results:result,modelVersion:s.player.userData.modelVersion};
   });
   const {results,modelVersion}=measurement;
   assert.equal(modelVersion,model==='dragon-v3'?'crystal-dragon-v3':'crystal-dragon-v4','The benchmark must load the requested preserved/current model');
   results.forEach(r=>assert.deepEqual(r.before,r.after,'No growing texture/geometry resources after warmup'));
   rows.push({width,model,modelVersion,caseStartedAt,caseFinishedAt:new Date().toISOString(),results});await page.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({rows,errors,scope:'120 local warmed samples per case, CPU+WebGL completion, sequential browsers, no video. No universal FPS guarantee.'},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
