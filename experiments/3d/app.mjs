import {DuskScene} from './renderer.mjs';
import {PlayView} from './play-view.mjs';

const engine=globalThis.MazeBiters3DEngine;
const VERSION='0.3.25';
const $=id=>document.getElementById(id);
const stage=$('world'),curtain=$('curtain'),start=$('start'),arena=$('arena');
let scene,ready=false,playing=false,previous=performance.now(),simulationAt=previous;
let generation=-1,frame=0,lastSnapshot=null,terminalShown=false,pointer=null;
const step=1000/120,frameTimes=[],workTimes=[];
const hud=$('hud').getContext('2d');hud.scale(3,3);
const movement=new Set(['w','a','s','d','i','j','k','m','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
const playView=new PlayView(arena,()=>{setPaused(true);updatePauseUI();});
const movementHelp='Две съседни посоки дават диагонал. Докосни или кликни в желаната посока спрямо човечето.';

function updatePauseUI(){
  const snapshot=engine.snapshot(),ended=snapshot.complete||snapshot.gameOver;
  $('pause').textContent=snapshot.paused?'Продължи':'Пауза';
  $('pause').disabled=$('playPause').disabled=!playing||ended;
  const show=playing&&!ended&&snapshot.paused&&playView.active;
  const newlyShown=show&&$('pauseCurtain').hidden;
  $('pauseCurtain').hidden=!show;
  if(newlyShown)$('resume').focus({preventScroll:true});
}
function setPaused(value){
  const snapshot=engine.snapshot();
  if(!playing||snapshot.complete||snapshot.gameOver)return;
  pointer=null;
  if(snapshot.paused!==value)engine.pause();
  updatePauseUI();
  $('status').textContent=value?'Пауза · Натисни P, за да продължиш.':movementHelp;
}

function begin(){
  if(!ready) return;
  playView.enter();
  engine.audio();engine.start();playing=true;terminalShown=false;pointer=null;
  previous=simulationAt=performance.now();engine.reanchor(simulationAt);
  curtain.hidden=true;$('pause').disabled=$('restart').disabled=false;
  updatePauseUI();stage.focus({preventScroll:true});
  $('status').textContent=movementHelp;
}
function pause(){
  const snapshot=engine.snapshot();
  if(!playing||snapshot.complete||snapshot.gameOver)return;
  if(snapshot.paused){playView.enter();setPaused(false);stage.focus({preventScroll:true});}
  else setPaused(true);
}
start.addEventListener('click',begin);$('restart').addEventListener('click',begin);$('pause').addEventListener('click',pause);
$('playPause').addEventListener('click',pause);
$('resume').addEventListener('click',()=>{if(engine.snapshot().paused)pause();});
$('settings').addEventListener('click',()=>{playView.exit(true);$('pause').focus({preventScroll:true});});
$('speed').addEventListener('input',event=>{
  const relative=2**Number(event.target.value),label=relative.toFixed(2).replace('.',',');
  engine.setSpeed(.5*relative);
  $('speedValue').value=label+'×';
  event.target.setAttribute('aria-valuetext',label+' пъти началната скорост');
});
$('zoom').addEventListener('input',e=>{if(scene) scene.targetZoom=Number(e.target.value);$('zoomValue').value=Number(e.target.value).toFixed(1)+'×';});
$('tilt').addEventListener('input',e=>{
  const degrees=Number(e.target.value);
  if(scene) scene.targetTiltDegrees=degrees;
  $('tiltValue').value=degrees+'°';
  e.target.setAttribute('aria-valuetext',degrees+' градуса от вертикалата');
});
// Capture experimental controls before the legacy menu/level-shortcut listeners.
addEventListener('keydown',event=>{
  const key=event.key.length===1?event.key.toLowerCase():event.key;
  if(key==='Tab'&&!$('pauseCurtain').hidden){
    event.preventDefault();event.stopImmediatePropagation();
    const next=document.activeElement===$('resume')?$('settings'):$('resume');
    next.focus({preventScroll:true});return;
  }
  if(event.target instanceof HTMLInputElement&&key!=='Escape'){event.stopImmediatePropagation();return;}
  if(event.target instanceof HTMLButtonElement&&(key==='Enter'||key===' ')){event.stopImmediatePropagation();return;}
  if(movement.has(key)||['p','r','Escape','Enter',' '].includes(key)||/^\d$/.test(key)){
    event.preventDefault();event.stopImmediatePropagation();
    if(!ready) return;
    if(!playing||terminalShown){if(key==='Enter'||key===' '||key==='r') begin();return;}
    if(movement.has(key)){engine.audio();engine.direction(key,true);}
    else if(!event.repeat&&key==='r') begin();
    else if(!event.repeat&&key==='Escape'){
      if(playView.active)playView.exit(true);else setPaused(true);
    }else if(!event.repeat&&key==='p')pause();
  }
},true);
addEventListener('keyup',event=>{
  const key=event.key.length===1?event.key.toLowerCase():event.key;
  if(movement.has(key)){event.stopImmediatePropagation();engine.direction(key,false);}
},true);
function loseFocus(){
  pointer=null;engine.release();setPaused(true);
}
addEventListener('blur',loseFocus);
document.addEventListener('visibilitychange',()=>{if(document.hidden) loseFocus();previous=simulationAt=performance.now();engine.reanchor(simulationAt);});
for(const button of document.querySelectorAll('[data-key]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(!playing) begin();engine.direction(button.dataset.key,true);});
  for(const name of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(name,()=>engine.direction(button.dataset.key,false));
}
stage.addEventListener('pointerdown',event=>{
  const snapshot=engine.snapshot();
  if(!event.isPrimary||event.button!==0||pointer||!playing||snapshot.paused||snapshot.complete||snapshot.gameOver||!snapshot.player||snapshot.player.dead||snapshot.player.hidden)return;
  event.preventDefault();stage.focus({preventScroll:true});
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener('pointerup',event=>{
  if(!pointer||pointer.id!==event.pointerId)return;
  const press=pointer;pointer=null;event.preventDefault();
  if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
  const snapshot=engine.snapshot();
  if(Math.hypot(event.clientX-press.x,event.clientY-press.y)>24||!playing||snapshot.paused||snapshot.complete||snapshot.gameOver||!snapshot.player||snapshot.player.dead||snapshot.player.hidden)return;
  const center=scene.playerScreenPosition(),dx=event.clientX-center.x,dy=event.clientY-center.y;
  if(Math.hypot(dx,dy)<12)return;
  // Undo the camera's ground foreshortening before selecting one of eight
  // sectors, so a tap along a visible diagonal follows that world direction.
  const groundY=dy/Math.cos(scene.tiltDegrees*Math.PI/180);
  const angle=Math.round(Math.atan2(groundY,dx)/(Math.PI/4))*(Math.PI/4);
  engine.audio();engine.tapVector({x:Math.round(Math.cos(angle)),y:Math.round(Math.sin(angle))});
});
for(const name of ['pointercancel','lostpointercapture'])stage.addEventListener(name,event=>{if(pointer?.id===event.pointerId)pointer=null;});
stage.addEventListener('contextmenu',event=>event.preventDefault());
stage.addEventListener('webglcontextlost',event=>{event.preventDefault();loseFocus();$('status').textContent='3D изгледът е прекъснат. Презареди страницата, за да продължиш.';});
function loop(now){
  const began=performance.now(),elapsed=Math.max(0,now-previous);previous=now;
  try{
    if(playing){
      engine.poll();
      if(now-simulationAt>250){simulationAt=now;engine.reanchor(now);}
      while(simulationAt+step<=now){simulationAt+=step;engine.step(simulationAt);}
    }
    const snapshot=engine.snapshot();
    if(snapshot.paused!==lastSnapshot?.paused)updatePauseUI();
    lastSnapshot=snapshot;
    if(snapshot.generation!==generation){scene.reset(snapshot);generation=snapshot.generation;}
    scene.render(snapshot,Math.min(elapsed/1000,.05));
    if(++frame%4===0) engine.hud(hud);
    if(playing&&!terminalShown&&(snapshot.complete||snapshot.gameOver)){
      terminalShown=true;pointer=null;engine.release();playView.exit();updatePauseUI();
      curtain.hidden=false;$('heading').textContent=snapshot.complete?'Лабиринтът е чист.':'Още един опит?';
      $('message').textContent=snapshot.complete?'Първият 3D лабиринт е завършен.':'Змията спечели този рунд.';
      start.textContent='Играй отново';$('status').textContent='Натисни R или „Играй отново“.';
      start.focus({preventScroll:true});
    }
    if(playing&&!snapshot.paused){frameTimes.push(elapsed);workTimes.push(performance.now()-began);if(frameTimes.length>1200){frameTimes.shift();workTimes.shift();}}
    requestAnimationFrame(loop);
  }catch(error){console.error(error);$('status').textContent='Възникна грешка в прототипа: '+error.message;}
}
function percentiles(values){const sorted=[...values].sort((a,b)=>a-b);return {samples:sorted.length,p50:sorted[Math.floor(sorted.length*.5)]||0,p95:sorted[Math.floor(sorted.length*.95)]||0,p99:sorted[Math.floor(sorted.length*.99)]||0,max:sorted.at(-1)||0};}
globalThis.__mazeBiters3D=Object.freeze({
  snapshot:()=>engine.snapshot(),
  diagnostics:()=>({renderer:scene?.diagnostics(),presentation:{playView:playView.active,fullscreen:document.fullscreenElement===arena,playerScreen:scene?.playerScreenPosition()},frameIntervalMs:percentiles(frameTimes),cpuWorkMs:percentiles(workTimes),simulationHz:120,speed:engine.snapshot().speed,version:VERSION,sourceVersion:'1.01.93.00'})
});
try{
  scene=new DuskScene(stage);
  $('build').textContent='v'+VERSION;
  await globalThis.__mazeBitersReady;
  engine.start();engine.pause();
  const logo=$('logo').getContext('2d');logo.scale(4,4);engine.title(logo);
  engine.hud(hud);ready=true;start.disabled=false;start.textContent='Влез в играта';
  $('status').textContent='Същият Maze Biters. Първи играем 3D експеримент.';
  requestAnimationFrame(loop);
}catch(error){console.error(error);$('heading').textContent='3D изгледът не се зареди.';$('message').textContent=error.message;start.hidden=true;$('status').textContent='Необходим е браузър с WebGL 2. Опитай да презаредиш страницата.';}
