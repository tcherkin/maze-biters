const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
 const errors=[],report=[];
 try{
  const width=process.argv.includes('--4k')?3840:1920;
  const page=await browser.newPage({viewport:{width,height:width*9/16},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/__dragon-mirrors__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas id="world"></canvas>'}));
  await page.goto('http://127.0.0.1:8093/__dragon-mirrors__');
  await page.evaluate(async()=>{
   const T=await import('/experiments/3d/vendor/three.module.min.js');
   const {DuskScene}=await import('/experiments/3d/renderer.mjs');
   const scene=new DuskScene(document.getElementById('world'),{playerModel:'dragon'});scene.setNeonLook('balanced');
   const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14||(y===7&&x>=2&&x<=16)?'#':'.').join(''));
   const state={generation:1100,maze,cols:19,rows:15,time:1000,paused:false,bites:[],predations:[],
    player:{id:1,x:8,y:8,visual:{x:8,y:8},dir:{x:1,y:0},dead:false,hidden:false,shield:false},
    snakes:[{id:1,color:'#079ed1',body:[{x:11,y:8},{x:12,y:8},{x:13,y:8},{x:14,y:8}],dir:{x:-1,y:0},motion:null,reversing:false}]};
   scene.reset(state);scene.playerYaw=Math.PI/2;scene.render(state,0,0);
   const draw=()=>{
    const s=scene,c=s.camera,angle=65*Math.PI/180;c.left=-7;c.right=7;c.top=3.9375;c.bottom=-3.9375;c.zoom=1;c.setProjection(.5);
    const target=new T.Vector3(0,.3,scene.layout.z(7.55));c.position.set(0,target.y+c.focusDistance*Math.cos(angle),target.z+c.focusDistance*Math.sin(angle));c.lookAt(target);c.updateMatrixWorld();
    s.wallMirrors.render(s.scene,c);s.renderer.getContext().finish();
   };
   const materials=new Set();scene.player.traverse(o=>{if(o.material&&o.material.userData.detailedMirror)materials.add(o.material);});
   const read=()=>{const p=scene.wallMirrors.planar,t=p.target,bits=new Uint16Array(t.width*t.height*4);scene.renderer.readRenderTargetPixels(t,0,0,t.width,t.height,bits);return bits;};
   globalThis.review={T,scene,state,draw,materials,read};draw();
  });
  for(const mode of ['before','after']){
   const data=await page.evaluate(mode=>{
    const {scene,draw,materials}=review;
    for(const m of materials)m.userData.physicalMirror=mode==='after';
    draw();const memory={...scene.renderer.info.memory},times=[];
    for(let i=0;i<20;i++){const start=performance.now();draw();times.push(performance.now()-start);}
    times.sort((a,b)=>a-b);
    return{memory,after:{...scene.renderer.info.memory},p50:times[10],p95:times[19],diagnostics:scene.diagnostics()};
   },mode);
   assert.deepEqual(data.memory,data.after);
   await page.screenshot({path:path.join(root,`preview-dragon-mirrors-${mode}-${width}.png`)});
   // Inspect the physical north-facing strip directly, without wall masking.
   const atlas=await page.evaluate(()=>{
    const {scene,T}=review,p=scene.wallMirrors.planar;
    const slot=p.selected.findIndex(e=>e.plane.normal.z>.9&&Math.abs(e.plane.constant)<1);
    if(slot<0)throw new Error('Fixture must expose its central mirror');
    const target=p.target,w=p.tileWidth,h=p.tileHeight,bits=new Uint16Array(w*h*4);
    scene.renderer.readRenderTargetPixels(target,(slot%4)*w,Math.floor(slot/4)*h,w,h,bits);
    const color=new T.Color(),pixels=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const a=(y*w+x)*4,b=((h-y-1)*w+x)*4;
     color.setRGB(T.DataUtils.fromHalfFloat(bits[a]),T.DataUtils.fromHalfFloat(bits[a+1]),T.DataUtils.fromHalfFloat(bits[a+2]));
     color.convertLinearToSRGB();pixels[b]=Math.min(255,color.r*255);pixels[b+1]=Math.min(255,color.g*255);pixels[b+2]=Math.min(255,color.b*255);pixels[b+3]=255;
    }
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').putImageData(new ImageData(pixels,w,h),0,0);
    return{url:canvas.toDataURL(),slot,width:w,height:h};
   });
   fs.writeFileSync(path.join(root,`preview-dragon-mirror-strip-${mode}-${width}.png`),Buffer.from(atlas.url.split(',')[1],'base64'));
   const patterns=await page.evaluate(()=>{
    const {scene,draw,read,T}=review,cores=[];scene.player.traverse(o=>{if(o.userData.insetCore&&o.visible)cores.push(o);});
    const normal=read();cores.forEach(o=>o.visible=false);draw();const noPatterns=read();cores.forEach(o=>o.visible=true);draw();
    let changed=0,total=0;
    for(let i=0;i<normal.length;i+=4){let delta=0;for(let j=0;j<3;j++)delta+=Math.abs(T.DataUtils.fromHalfFloat(normal[i+j])-T.DataUtils.fromHalfFloat(noPatterns[i+j]));if(delta>.015){changed++;total+=delta;}}
    return{changedPixels:changed,totalDifference:total,cores:cores.length};
   });
   if(mode==='after')assert.ok(patterns.changedPixels>30,'Actual inner patterns must be visible THROUGH the reflected glass');
   report.push({mode,width,...data,patterns,strip:{slot:atlas.slot,width:atlas.width,height:atlas.height}});
  }
  const movement=await page.evaluate(async()=>{
   const {scene:s,state,materials}=review;
   const {CONCEPT_MAZE,CONCEPT_SNAKES}=await import('/experiments/3d/maze-layout.mjs');
   state.maze=CONCEPT_MAZE;state.player.y=state.player.visual.y=9;
   state.snakes=CONCEPT_SNAKES.map((o,i)=>({...o,id:i+1,dir:{x:o.body[0].x-o.body[1].x,y:o.body[0].y-o.body[1].y},motion:null,reversing:false}));
   const rows=[],gl=s.renderer.getContext();
   for(const projection of [0,.5,1])for(const physical of [false,true]){
    state.generation++;s.reset(state);s.resetView();s.projection=s.targetProjection=projection;s.playerYaw=Math.PI/2;
    for(const m of materials)m.userData.physicalMirror=physical;
    let memory;const times=[];
    for(let frame=0;frame<140;frame++){
     state.time+=1000/60;state.player.x=state.player.visual.x=4+Math.sin(frame/35)*1.5;state.player.dir.x=Math.cos(frame/35)>=0?1:-1;
     const start=performance.now();s.render(state,1/60,1/60);gl.finish();if(frame===39)memory={...s.renderer.info.memory};if(frame>=40)times.push(performance.now()-start);
    }
    times.sort((a,b)=>a-b);rows.push({projection,physical,p50:times[50],p95:times[95],memory,after:{...s.renderer.info.memory},mirrors:s.diagnostics().wallMirrors});
   }
   return rows;
  });
  movement.forEach(r=>assert.deepEqual(r.memory,r.after,'Moving camera and animated reflection must not accumulate GPU resources'));
  report.push({movement});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,`preview-dragon-mirrors-${width}.json`),JSON.stringify({report,errors},null,2));console.log(JSON.stringify({report,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
