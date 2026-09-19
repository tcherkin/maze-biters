const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const harness=`import {DuskScene} from './renderer.mjs';import {Hud} from './hud.mjs';
 await __mazeBitersReady;const engine=MazeBiters3DEngine;engine.setPlayerModel('dragon');engine.start();engine.pause();
 document.body.classList.add('play-view');document.getElementById('curtain').hidden=true;document.getElementById('pauseCurtain').hidden=true;
 const s=new DuskScene(document.getElementById('world'),{playerModel:'dragon',worldStyle:'ruins'});
 s.setNeonLook('balanced');s.setAtmosphere('champagne');s.setHudOverlay(document.getElementById('hud'));
 const hud=new Hud(engine,document.getElementById('hud'),document.getElementById('logo'));hud.setClean(true);
 const state=engine.snapshot();state.player.shield=false;state.time=8000;state.paused=false;
 globalThis.review={s,hud,state,put(x,y,dx=1,dy=0){Object.assign(state.player,{x,y,visual:{x,y},dir:{x:dx,y:dy},route:null});}};
 review.put(2,13);await s.prepare(state);hud.render(state);globalThis.ready=true;`;
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route(url=>url.pathname.endsWith('/app.mjs'),r=>r.fulfill({contentType:'text/javascript',body:harness}));
 await page.goto('http://127.0.0.1:8093/experiments/3d/?v=0.3.69&look=balanced&player=dragon&world=ruins&atmosphere=champagne',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>globalThis.ready,{},{timeout:180000});
 const initial=await page.evaluate(()=>({zoom:review.s.cameraZoom,memory:{...review.s.renderer.info.memory}}));
 assert.equal(initial.zoom,1);
 const intro=await page.evaluate(()=>{
  const {s,state}=review,rows=[];for(let i=0;i<180;i++){state.time+=1000/30;s.render(state,1/30,1/30);rows.push(s.cameraZoom);}return rows;
 });
 assert.equal(intro.at(-1),1.5);assert.ok(intro.every((z,i)=>!i||z>=intro[i-1]));await page.screenshot({path:path.join(root,'preview-camera-idle-v69.png')});
 const moving=await page.evaluate(()=>{
  const {s,state,put}=review,rows=[];
  for(let i=1;i<=160;i++){
   const x=2+14*i/160;put(x,13);state.time+=1000/60;s.render(state,1/60,1/60);
   rows.push({zoom:s.cameraZoom,pan:s.center.toArray(),speed:s.motionZoom.speed});
  }
  s.renderer.getContext().finish();return rows;
 });
 assert.ok(moving.at(-1).zoom<1.46&&moving.at(-1).zoom>1.31);
 assert.ok(moving.every(r=>r.zoom<=1.5&&Number.isFinite(r.pan[0])&&Number.isFinite(r.pan[1])));
 assert.ok(moving.slice(1).every((r,i)=>Math.abs(r.zoom-moving[i].zoom)<.01));
 await page.screenshot({path:path.join(root,'preview-camera-travel-v69.png')});
 const pause=await page.evaluate(()=>{
  const {s,state}=review;state.paused=true;const before=s.cameraZoom;
  for(let i=0;i<20;i++)s.render(state,1/60,1/60);
  state.paused=false;s.render(state,1/60,1/60);return {before,after:s.cameraZoom};
 });assert.ok(Math.abs(pause.after-pause.before)<.05);
 const stopped=await page.evaluate(()=>{
  const {s,state}=review;for(let i=0;i<660;i++){state.time+=1000/60;s.render(state,1/60,1/60);}
  return {zoom:s.cameraZoom,memory:{...s.renderer.info.memory}};
 });assert.equal(stopped.zoom,1.5);assert.deepEqual(stopped.memory,initial.memory);
 const north=await page.evaluate(()=>{
  const {s,state,put}=review;put(1,13,0,-1);s.motionZoom.reset();s.resetCamera=true;s.render(state,0,0);
  const rows=[];
  for(let i=1;i<=180;i++){
   put(1,13-12*i/180,0,-1);state.time+=1000/60;s.render(state,1/60,1/60);
   const screen=s.playerScreenPosition(),hud=document.getElementById('hud').getBoundingClientRect();
   rows.push({zoom:s.cameraZoom,playerY:screen.y,hudBottom:hud.bottom,pan:s.center.y});
  }
  return rows;
 });assert.ok(north.every(r=>r.playerY>r.hudBottom+30),'The head stays below the HUD during the northward chase');
 await page.screenshot({path:path.join(root,'preview-camera-north-v69.png')});
 const fastNorth=await page.evaluate(()=>{
  const {s,state,put}=review;put(9,13,0,-1);s.motionZoom.reset();
  Object.assign(s.cameraPresentation,{zoom:1.5,velocity:0,intro:false,overview:false});
  s.resetCamera=true;s.render(state,0,0);const rows=[];
  for(let i=1;i<=38;i++){
   put(9,13-12*i/38,0,-1);state.time+=1000/30;s.render(state,1/30,1/30);
   rows.push({zoom:s.cameraZoom,y:s.playerScreenPosition().y,hud:document.getElementById('hud').getBoundingClientRect().bottom});
  }
  return rows;
 });
 assert.ok(fastNorth.every(r=>r.y>r.hud+30),'Fast northward motion remains clear of the HUD: '+JSON.stringify(fastNorth.at(-1)));

 const local=await page.evaluate(()=>{
  const {s,state,put}=review;put(3,12);s.motionZoom.reset();Object.assign(s.cameraPresentation,{zoom:1.5,velocity:0,intro:false,overview:false});s.resetCamera=true;s.render(state,0,0);const rows=[];
  for(let i=1;i<=180;i++){const t=i/30;put(3+.7*Math.sin(t*5),12+.7*Math.cos(t*5));state.time+=1000/30;s.render(state,1/30,1/30);rows.push(s.cameraZoom);}
  s.targetZoom=1;for(let i=0;i<180;i++)s.render(state,1/30,1/30);
  return {min:Math.min(...rows),max:Math.max(...rows),manual:s.cameraZoom,memory:{...s.renderer.info.memory}};
 });assert.equal(local.min,1.5);assert.equal(local.max,1.5);assert.ok(Math.abs(local.manual-1)<1e-8);
 assert.deepEqual(local.memory,initial.memory);
 const life=await page.evaluate(()=>{
  const {s,state,put}=review;s.targetZoom=1.5;
  for(let i=0;i<150;i++){state.time+=1000/30;s.render(state,1/30,1/30);}
  state.player.dead=true;state.player.lives--;
  for(let i=0;i<30;i++){state.time+=1000/30;s.render(state,1/30,1/30);}
  state.player.hidden=true;
  for(let i=0;i<15;i++){state.time+=1000/30;s.render(state,1/30,1/30);}
  const before={zoom:s.cameraZoom,center:s.center.toArray()};
  state.player.dead=state.player.hidden=false;put(18,2);state.time+=1000/60;s.render(state,1/60,1/60);
  const after={zoom:s.cameraZoom,center:s.center.toArray(),speed:s.motionZoom.speed};
  for(let i=0;i<180;i++){state.time+=1000/30;s.render(state,1/30,1/30);}
  return {before,after,settled:s.cameraZoom};
 });
 assert.ok(Math.abs(life.after.zoom-life.before.zoom)<.01);
 assert.ok(Math.hypot(...life.after.center.map((n,i)=>n-life.before.center[i]))<.5);
 assert.equal(life.after.speed,0);assert.equal(life.settled,1.5);
 await page.screenshot({path:path.join(root,'preview-camera-respawn-v69.png')});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({initial,introEnd:intro.at(-1),life,travel:moving.at(-1),pause,stopped,north:north.at(-1),fastNorth:fastNorth.at(-1),local,errors}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
