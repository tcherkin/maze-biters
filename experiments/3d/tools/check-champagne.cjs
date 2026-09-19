const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.join(root,'art-studies/champagne-mystic-v1');
const harness=`import {DuskScene} from './renderer.mjs';import {Hud} from './hud.mjs';
 await __mazeBitersReady;const engine=MazeBiters3DEngine;engine.setPlayerModel('dragon');engine.start();engine.pause();
 document.body.classList.add('play-view');document.getElementById('curtain').hidden=true;document.getElementById('pauseCurtain').hidden=true;
 const s=new DuskScene(document.getElementById('world'),{playerModel:'dragon',worldStyle:'ruins'});s.setNeonLook('balanced');s.setHudOverlay(document.getElementById('hud'));
 const hud=new Hud(engine,document.getElementById('hud'),document.getElementById('logo'));
 const base=engine.snapshot();base.player.shield=false;base.time=8000;base.paused=false;
 globalThis.review={s,hud,base};s.reset(base);s.render(base,0);hud.render(base);globalThis.reviewReady=true;`;
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[],report=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(url=>url.pathname.endsWith('/app.mjs'),r=>r.fulfill({contentType:'text/javascript',body:harness}));
 await page.goto('http://127.0.0.1:8093/experiments/3d/?v=0.3.65&look=balanced&player=dragon&world=ruins',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>globalThis.reviewReady,{},{timeout:180000});
 const cases=[['corridor',3,13,1,0,1.5],['near-wall',5,11,1,0,1.5],['front-wall',6,4,0,1,1.5],['turn',5,9,0,-1,1.5],['diagonal',4,11,1,1,1.5],['back',10,8,0,-1,1.5],['dark',3,5,0,1,1.5],['floor',5,11,1,0,2.2]];
 for(const width of process.argv.includes('--quick')?[1920]:[1920,3840]){
  await page.setViewportSize({width,height:width*9/16});
  for(const [id,x,y,dx,dy,zoom] of cases){
   for(const mode of ['original','champagne']){
    const data=await page.evaluate(({x,y,dx,dy,zoom,mode})=>{
     const {s,hud,base}=review,state=structuredClone(base);Object.assign(state.player,{x,y,dir:{x:dx,y:dy},visual:{x,y},route:null});
     s.setAtmosphere(mode);hud.setClean(mode==='champagne');s.reset(state);s.zoom=s.targetZoom=zoom;
     for(let i=0;i<12;i++){state.time=8000+i*1000/60;s.render(state,1/60,1/60);}
     hud.render(state);s.renderer.getContext().finish();
     const lights=[];s.scene.traverse(o=>{if(o.isLight)lights.push({type:o.type,shadows:o.castShadow,map:o.shadow?.mapSize.toArray()});});
     const times=[];for(let i=0;i<22;i++){const start=performance.now();s.render(state,0,0);s.renderer.getContext().finish();times.push(performance.now()-start);}times.sort((a,b)=>a-b);
     return {mode,memory:{...s.renderer.info.memory},lights,p50:times[11],p95:times[20],exposure:s.renderer.toneMappingExposure,pose:s.player.matrixWorld.toArray(),camera:s.camera.matrixWorld.toArray(),shadow:s.flashlight.shadow.mapSize.toArray(),state,
      glow:{color:s.flashlight.color.getHex(),range:s.flashlight.distance,cone:s.beam.visible,halo:s.halo.visible,nearRange:s.glow.distance}};
    },{x,y,dx,dy,zoom,mode});
    if(mode==='champagne'){assert.equal(data.glow.range,4.8);assert.equal(data.glow.cone,false);assert.equal(data.glow.halo,false);assert.equal(data.glow.color,0xffc451);}
    else {assert.equal(data.glow.range,11.4);assert.equal(data.glow.cone,true);assert.equal(data.glow.halo,true);assert.equal(data.glow.color,0xffd276);}
    report.push({id,width,...data});await page.screenshot({path:process.argv.includes('--gold')?path.join(root,`preview-gold-${id}-${mode}-${width}.png`):path.join(out,`${id}-${mode}-${width}.png`)});
    console.log(id,mode,width,JSON.stringify({p50:data.p50,p95:data.p95,memory:data.memory}));
   }
   const [a,b]=report.slice(-2);assert.deepEqual(a.state,b.state);assert.deepEqual(a.camera,b.camera);assert.deepEqual(a.pose,b.pose);assert.deepEqual(a.lights,b.lights);assert.equal(a.exposure,b.exposure);
  }
 }
 const lifecycle=await page.evaluate(()=>{
  const {s,base}=review,snapshot=structuredClone(base);s.setAtmosphere('champagne');
  snapshot.player.dead=true;s.render(snapshot,0,0);
  const dead={beam:s.beam.visible,halo:s.halo.visible,spot:s.flashlight.intensity,glow:s.glow.intensity};
  snapshot.player.dead=false;s.render(snapshot,0,0);const lights=[];s.scene.traverse(o=>{if(o.isLight)lights.push(o.uuid);});
  for(let i=0;i<6;i++){s.setAtmosphere('original');s.render(snapshot,0,0);s.setAtmosphere('champagne');s.render(snapshot,0,0);}
  const after=[];s.scene.traverse(o=>{if(o.isLight)after.push(o.uuid);});return {dead,lights,after};
 });
 assert.deepEqual(lifecycle.dead,{beam:false,halo:false,spot:0,glow:0});assert.deepEqual(lifecycle.lights,lifecycle.after);
 assert.deepEqual(errors,[]);fs.writeFileSync(process.argv.includes('--gold')?path.join(root,'preview-gold-report.json'):path.join(out,'still-report.json'),JSON.stringify({report,lifecycle,errors},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
