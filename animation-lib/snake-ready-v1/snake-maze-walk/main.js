import {registerSheet} from '../authored-snake-turns/sprite-registration.js';
import {route,travelPoint,headPose,faceParity,TILE,WIDTH,HEIGHT,HEAD_SPAN,TAIL_SPAN,DIAMETER,mod,uTurnPathDistance} from './route.js';
import {createHeadProfile,drawHeadRibbon} from './head-ribbon.js';
import {createHybridProfile,drawHybridHead,drawAimedHead} from './head-hybrid.js';
import {centerPose,drawCenterHead} from './head-center.js';
import {attachedPose} from './head-attached.js';
import {mouthState,drawMouthHead} from './head-mouth.js';
import {createMouthAtlas,drawSmoothMouthHead} from './head-mouth-smooth.js';
import {drawGameMaze,drawRetreatWall,MAZE_ATLAS_URL} from './game-maze.js';
import {motionState,distanceForHead} from './motion-pulse.js';
import {cellMotionState,distanceForCellHead} from './motion-cell.js';
import {retreatClock} from './motion-retreat.js';

const $=id=>document.getElementById(id);
const canvas=$('maze'), c=canvas.getContext('2d');
canvas.width=WIDTH*2;canvas.height=HEIGHT*2;
const controls=['pause','restart','speed','length','direction','mode','guides','stepBack','stepForward','progress','moment','zoom','face','motion','scenario','mouth','mouthTiming'];
controls.forEach(id=>$(id).disabled=true);
const BASE_SPEED=84, START=205, STEP=BASE_SPEED/60;
const upperStraight=route.pieces.find(piece=>piece.type==='line');
const RETREAT={startClock:upperStraight.start+8*TILE,endClock:upperStraight.start+14*TILE,baseSpeed:BASE_SPEED};
let distance=START, playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let retreatTime=0,retreatBackdrop,loopSettings=null;
let loaded=false,lastTime=null,raf=null,frames,leftFrames,bodyImage,tailImage,tailEntry,backdrop,straightHead,headProfile,hybridProfile,centerProfile,centerOwnedSpan;
let lastLabel=-Infinity,rendered=0,mouthPreviewReady=false,mouthAtlas;
const HEAD_ANCHOR={x:56,y:150}, CACHE_DIAMETER=32;
const WORLD_SCALE=DIAMETER/CACHE_DIAMETER;
const bodyCrop={x:320,y:211,width:160,height:57};

function offscreen(w,h) { const q=document.createElement('canvas');q.width=w;q.height=h;return q; }
async function loadImage(url) { const im=new Image();im.src=url;await im.decode();return im; }
function readSheet(im,attachment) {
  const q=offscreen(im.width,im.height),g=q.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);
  const entries=registerSheet(g.getImageData(0,0,q.width,q.height),{cols:4,rows:2,attachment});
  q.width=q.height=1;return entries;
}
function cacheHead(im) {
  return readSheet(im,'left').map(e=>{
    const q=offscreen(320,320),g=q.getContext('2d'),r=e.sourceRect,k=CACHE_DIAMETER/e.anchor.diameter;
    g.drawImage(im,r.x,r.y,r.width,r.height,HEAD_ANCHOR.x+(r.x-e.anchor.x)*k,HEAD_ANCHOR.y+(r.y-e.anchor.y)*k,r.width*k,r.height*k);
    return q;
  });
}
function rounded(g,x,y,w,h,r,fill,stroke) {
  g.beginPath();g.roundRect(x,y,w,h,r);
  if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.stroke();}
}
function pathTrace(g,step=3) {
  g.beginPath();const p=route.point(0);g.moveTo(p.x,p.y);
  for(let s=step;s<route.total;s+=step){const v=route.point(s);g.lineTo(v.x,v.y);}g.closePath();
}
function background(atlas,wall=false) {
  const q=offscreen(WIDTH*2,HEIGHT*2),g=q.getContext('2d');g.scale(2,2);
  // Original game wall atlas, adjacency masks and floor; cached once.
  drawGameMaze(g,atlas);
  if(wall)drawRetreatWall(g,atlas);
  return q;
}
function wallStudy(){return $('scenario').value==='wall';}
function retreatState(){return retreatClock(retreatTime,RETREAT);}
function syncRetreat(){distance=retreatState().distance;}

// Draw the existing body texture as a narrow continuous ribbon along the route.
// Every point uses the same distance clock. No static elbow is left beneath an
// animated endpoint. Tiny overlapping slices avoid subpixel raster cracks.
function bodyRibbon(start,end,reverse,textureLength=end-start) {
  const stride=1.6,ratio=textureLength/(end-start);
  for(let s=start;s<end;) {
    // Keep the same material length/rings as the body compresses, rather than
    // creating and removing a ring at its connection to the rigid head.
    // Material coordinates travel with the snake in every rhythm. Anchoring
    // the pattern to the maze made stationary rings appear at the advancing head.
    let u=mod((s-start)*ratio,TILE)/TILE*bodyCrop.width;
    if(bodyCrop.width-u<1e-7)u=0;
    // End a slice at the texture boundary. Clipping just its source while
    // stretching the destination made the painted rings change thickness.
    const ds=Math.min(stride,end-s,(bodyCrop.width-u)*TILE/(ratio*bodyCrop.width));
    const p=travelPoint(s+ds/2,reverse),sourceWidth=ds*ratio/TILE*bodyCrop.width;
    c.save();c.translate(p.x,p.y);c.rotate(p.angle);
    c.drawImage(bodyImage,bodyCrop.x+u,bodyCrop.y,sourceWidth,bodyCrop.height,-ds/2-.35,-DIAMETER/2,ds+.7,DIAMETER);
    c.restore();
    s+=ds;
  }
}

// The old 8-frame tail study shrinks a fixed-anchor *owned region*, not the
// physical tail. For continuous travel use its final one-tip artwork as a
// fixed-length curved ribbon. Its alpha follows the path; it never forks and
// never changes length when a corner begins. Other v4 poses remain in old lab.
function tailRibbon(tip,reverse) {
  const e=tailEntry, start=e.bounds.x, width=e.anchor.x-start;
  const h=e.cell.height, sy=e.cell.y, scale=DIAMETER/e.anchor.diameter;
  const y=(sy-e.anchor.y)*scale;
  for(let d=0;d<TAIL_SPAN;d+=1.2) {
    const ds=Math.min(1.2,TAIL_SPAN-d),p=travelPoint(tip+d+ds/2,reverse);
    c.save();c.translate(p.x,p.y);c.rotate(p.angle);
    c.drawImage(tailImage,start+d/TAIL_SPAN*width,sy,ds/TAIL_SPAN*width,h,-ds/2-.3,y,ds+.6,h*scale);
    c.restore();
  }
}
function head(pose,snap=false) {
  c.save();c.translate(pose.seam.x,pose.seam.y);c.rotate(pose.angle);
  // Distinct LEFT artwork preserves facial chirality. Mirroring the whole
  // right-turn strip would invert the face as soon as a left bend began.
  const parity=$('face').value==='upright'?faceParity(pose.lead.angle):1;
  c.scale(WORLD_SCALE,WORLD_SCALE*parity);
  const bank=!snap&&pose.sign*parity<0?leftFrames:frames;
  c.drawImage(bank[pose.index],-HEAD_ANCHOR.x,-HEAD_ANCHOR.y);
  c.restore();
}
function guides(pose,tailS,reverse,center=null,attached=false,solo=false) {
  c.save();c.setLineDash([3,5]);c.lineWidth=.7;c.strokeStyle='#80c0a56f';pathTrace(c);c.stroke();c.setLineDash([]);
  const markers=[[center?.attachment||pose.seam,'#e9c668'],[attached?center.nose:center?.center||pose.lead,'#92e8d2']];
  if(!solo)markers.push([travelPoint(tailS,reverse),'#d18eda']);
  for(const [p,color] of markers) {
    c.fillStyle=color;c.beginPath();c.arc(p.x,p.y,2.2,0,Math.PI*2);c.fill();
  }
  c.fillStyle='#a9c9b5';c.font='8px "Segoe UI",sans-serif';
  c.fillText(solo?'златно: основа на главата   ·   мента: муцуна':attached?'златно: основа на главата   ·   мента: муцуна   ·   лилаво: опашка':
    center?'златно: сглобка   ·   мента: център на главата   ·   лилаво: опашка':
    'златно: сглобка   ·   мента: водеща точка   ·   лилаво: връх на опашката',210,281);c.restore();
}
function motionOptions(mode=$('motion').value) {
  return {enabled:mode!=='uniform',cycleDistance:route.total/12,reverse:$('direction').value==='reverse'};
}
function movement(s,length,extra={},mode=$('motion').value) {
  const options={...motionOptions(mode),...extra};
  return mode==='cell'?cellMotionState(s,length,options):motionState(s,length,options);
}
function clockForHead(headDistance,mode=$('motion').value) {
  return mode==='cell'?distanceForCellHead(headDistance,motionOptions(mode)):distanceForHead(headDistance,motionOptions(mode));
}
function sceneState(s=distance) {
  const attached=$('mode').value==='attached',centered=$('mode').value==='center';
  const solo=$('length').value==='head';
  const span=attached?hybridProfile.skullLength:HEAD_SPAN;
  // centerPose owns its original extra neck; never infer it from the shorter skull.
  const ownedSpan=centered?centerOwnedSpan:span;
  const length=solo?ownedSpan:Number($('length').value)*TILE;
  const motion=movement(s,length,{headSpan:ownedSpan,tailSpan:solo?0:TAIL_SPAN});
  return {attached,centered,solo,span:ownedSpan,length,...motion};
}
function paint(force=false) {
  if(!loaded)return;
  const reverse=$('direction').value==='reverse', snap=$('mode').value==='snap';
  const state=sceneState(),{length,headDistance,tailDistance:tailS,centered,attached,solo,span}=state;
  const pose=headPose(headDistance,reverse,snap);
  const center=attached?attachedPose(headDistance,reverse,hybridProfile):centered?centerPose(headDistance,reverse,centerProfile):null;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);
  c.save();c.scale(2,2);
  const zoom=Number($('zoom').value);
  if(zoom>1){
    const moment=$('moment').value;
    const focus=!playing&&moment==='tail'?travelPoint(tailS+TAIL_SPAN/2,reverse):
      !playing&&moment==='body'?travelPoint((tailS+TAIL_SPAN+headDistance-span)/2,reverse):center?.center||pose.lead;
    const x=Math.max(WIDTH/zoom/2,Math.min(WIDTH-WIDTH/zoom/2,focus.x));
    const y=Math.max(HEIGHT/zoom/2,Math.min(HEIGHT-HEIGHT/zoom/2,focus.y));
    c.translate(WIDTH/2,HEIGHT/2);c.scale(zoom,zoom);c.translate(-x,-y);
  }
  c.drawImage(wallStudy()?retreatBackdrop:backdrop,0,0,WIDTH,HEIGHT);
  if(!solo){
  // A subtle single silhouette shadow helps judge joins without bloom hiding them.
  c.save();c.strokeStyle='#0007';c.lineWidth=DIAMETER+3;c.lineJoin='round';c.lineCap='round';c.beginPath();
  let p=travelPoint(tailS+TAIL_SPAN,reverse);c.moveTo(p.x+1,p.y+2);
  for(let s=tailS+TAIL_SPAN;s<=headDistance-span;s+=3){p=travelPoint(s,reverse);c.lineTo(p.x+1,p.y+2);}c.stroke();c.restore();
  tailRibbon(tailS,reverse);
  bodyRibbon(tailS+TAIL_SPAN,headDistance-span+.15,reverse,length-span-TAIL_SPAN+.15);
  }
  if(attached)drawExpression(c,headDistance,reverse,center,mouthState(state.cyclePhase,$('mouth').value!=='open',$('mouthTiming').value).closure);
  else if(centered)drawCenterHead(c,straightHead,centerProfile,headDistance,reverse,center);
  else if($('mode').value==='hybrid')drawHybridHead(c,straightHead,hybridProfile,headDistance,reverse);
  else if($('mode').value==='aim')drawAimedHead(c,straightHead,hybridProfile,headDistance,reverse);
  else if($('mode').value==='path')drawHeadRibbon(c,straightHead,headProfile,headDistance,reverse);
  else head(pose,snap);
  if($('guides').checked)guides(pose,tailS,reverse,center,attached,solo);
  c.restore();mouthPreview(state.cyclePhase,attached);rendered++;
  if(force||performance.now()-lastLabel>120){label(pose,center);lastLabel=performance.now();}
}
function label(pose,center=null) {
  const retreat=wallStudy()?retreatState():null;
  const progress=retreat?mod(retreatTime,retreat.cycleDuration)/retreat.cycleDuration:mod(distance,route.total)/route.total;
  $('progress').value=Math.round(progress*10000);
  $('progressLabel').textContent=`${(progress*100).toFixed(1)}%`;
  $('pause').textContent=playing?'Пауза':'Продължи';
  const curve=center?.diagnostics?.headingRate;
  const turn=center?(Math.abs(curve||0)<.0001?'Направо':curve>0?'Десен завой':'Ляв завой'):
    pose.bend<.02?'Направо':pose.sign>0?'Десен завой':'Ляв завой';
  $('turn-status').textContent=$('mode').value==='attached'?`${turn} · директна сглобка, без врат`:
    center?`${turn} · главата води по линията`:
    $('mode').value==='hybrid'?`${turn} · предишно водене за муцуната`:
    $('mode').value==='aim'?`${turn} · предишно насочване на главата`:
    $('mode').value==='path'?`${turn} · старо огъване на цялата рисунка`:`${turn} · поза ${pose.index+1}/8`;
  const size=$('length').value==='head'?'само глава':`${$('length').value} клетки`;
  const rhythm=$('motion').value==='cell'?'опашка → глава':$('motion').value==='pulse'?'бавни плавни тласъци':'равномерно';
  if(retreat){
    const speed=Number($('speed').value)*(retreat.backing?.5:1);
    $('turn-status').textContent=retreat.backing?'Отдръпване · главата остава напред':'Приближаване към стената';
    $('status').textContent=`${playing?'Движение':'Пауза'} · ${size} · ${retreat.backing?'назад · глава → опашка':'към стената · опашка → глава'} · ${speed}× · плавно спиране при стената`;
    return;
  }
  $('status').textContent=`${playing?'Движение':'Пауза'} · ${$('speed').value}× · ${size} · ${rhythm} · ${Math.round(route.total/BASE_SPEED)} s обиколка при 1×`;
}
function strip() {
  $('poses').height=460;
  const g=$('poses').getContext('2d');g.fillStyle='#080e13';g.fillRect(0,0,1200,460);
  for(let row=0;row<2;row++)for(let i=0;i<8;i++) {
    const x=i*150,y=row*230;rounded(g,x+5,y+8,140,216,12,'#12201a','#314836');
    g.fillStyle='#b7f576';g.font='12px "Segoe UI",sans-serif';g.fillText(`${row?'ЛЯВ':'ДЕСЕН'} · ${i+1} / 8`,x+16,y+29);
    g.drawImage((row?leftFrames:frames)[i],x+10,y+45,150,150);
  }
}
function drawExpression(g,s,reverse,pose,amount,style=$('mouth').value,solo=$('length').value==='head'){
  if(style==='cut'||style==='open')return drawMouthHead(g,straightHead,hybridProfile,s,reverse,pose,style==='open'?0:amount,solo);
  return drawSmoothMouthHead(g,mouthAtlas,straightHead,hybridProfile,s,reverse,pose,amount,solo);
}
function mouthPreview(phase,attached){
  const g=$('mouthPreview').getContext('2d');
  const width=mouthPreviewReady?250:1000;
  g.clearRect(0,0,width,220);g.fillStyle='#080e13';g.fillRect(0,0,width,220);
  const live=mouthState(phase,attached&&$('mouth').value!=='open',$('mouthTiming').value).closure;
  const cards=[[0,live,'СЕГА · в ритъма на движението']];
  // The three reference poses are painted once, not on every animation frame.
  if(!mouthPreviewReady)cards.push([1,0,'ПРЕДИ · отворена'],[2,.5,'Междинна поза'],[3,1,'Прибрана челюст']);
  for(const [index,amount,text] of cards){
    const x=index*250;
    rounded(g,x+6,8,238,204,12,'#12201a','#314836');
    g.fillStyle=index===0?'#b7f576':'#a9c9b5';g.font='12px "Segoe UI",sans-serif';g.fillText(text,x+18,32);
    g.save();g.translate(x+30,115);g.scale(5,5);
    const pose={rear:{x:0,y:0},angle:0};
    drawExpression(g,0,false,pose,amount,index===0?$('mouth').value:index===1?'open':'bite',index!==1&&$('length').value==='head');g.restore();
  }
  mouthPreviewReady=true;
}
function schedule(){if(loaded&&playing&&!document.hidden&&raf===null)raf=requestAnimationFrame(tick);}
function tick(time){raf=null;if(!playing||document.hidden){lastTime=null;return;}if(lastTime!==null){
  const dt=Math.min(80,Math.max(0,time-lastTime))/1000*Number($('speed').value);
  if(wallStudy()){retreatTime+=dt;syncRetreat();}else distance+=dt*BASE_SPEED;
}lastTime=time;paint();schedule();}
function setPlaying(value){playing=value;lastTime=null;if(raf!==null){cancelAnimationFrame(raf);raf=null;}paint(true);schedule();}
function seek(s){setPlaying(false);distance=s;paint(true);}
function seekRetreat(t){setPlaying(false);retreatTime=t;syncRetreat();paint(true);}
$('pause').addEventListener('click',()=>setPlaying(!playing));
$('restart').addEventListener('click',()=>{$('moment').value='';if(wallStudy()){retreatTime=0;syncRetreat();}else distance=START;setPlaying(true);});
$('progress').addEventListener('input',e=>{const fraction=Number(e.target.value)/10000;if(wallStudy())seekRetreat(fraction*retreatState().cycleDuration);else seek(fraction*route.total);});
$('stepBack').addEventListener('click',()=>wallStudy()?seekRetreat(retreatTime-1/60):seek(distance-STEP));
$('stepForward').addEventListener('click',()=>wallStudy()?seekRetreat(retreatTime+1/60):seek(distance+STEP));
$('speed').addEventListener('change',()=>{lastTime=null;paint(true);});
function modeState(){
  const short=['head','2'].includes($('length').value),solo=$('length').value==='head';
  const wall=wallStudy();
  if(short||wall)$('mode').value='attached';
  for(const option of $('mode').options||[])option.disabled=(short||wall)&&option.value!=='attached';
  for(const option of $('moment').options||[])option.disabled=solo&&['body','tail'].includes(option.value);
  if(solo&&['body','tail'].includes($('moment').value))$('moment').value='';
  $('face').disabled=!loaded||['attached','center','hybrid','aim','path'].includes($('mode').value);
  $('mouth').disabled=!loaded||$('mode').value!=='attached';
  $('mouthTiming').disabled=!loaded||$('mode').value!=='attached'||$('mouth').value==='open';
  for(const id of ['direction','motion','mode','moment'])$(id).disabled=!loaded||wall;
}
for(const id of ['length','mode','guides','zoom','face','mouth','mouthTiming'])$(id).addEventListener('change',()=>{if(id==='length')mouthPreviewReady=false;modeState();paint(true);});
let previousMotion=$('motion').value;
$('scenario').addEventListener('change',()=>{
  if(wallStudy()){
    loopSettings={direction:$('direction').value,motion:$('motion').value,mode:$('mode').value,distance};
    $('direction').value='forward';$('motion').value='cell';$('mode').value='attached';retreatTime=0;syncRetreat();
  }else if(loopSettings){
    for(const id of ['direction','motion','mode'])$(id).value=loopSettings[id];
    distance=loopSettings.distance;loopSettings=null;
  }
  $('moment').value='';previousMotion=$('motion').value;lastTime=null;modeState();paint(true);
});
$('motion').addEventListener('change',()=>{
  const headDistance=movement(distance,0,{},previousMotion).headDistance;
  distance=clockForHead(headDistance);previousMotion=$('motion').value;
  lastTime=null;paint(true);
});
$('direction').addEventListener('change',()=>{$('moment').value='';distance=START;lastTime=null;paint(true);});
$('moment').addEventListener('change',()=>{
  const value=$('moment').value,reverse=$('direction').value==='reverse';
  if(!value)return;
  if(value==='uturn'){
    const s=uTurnPathDistance(reverse,0)+sceneState().span-6;
    seek(clockForHead(s));return;
  }
  if($('length').value==='head'&&['body','tail'].includes(value))return;
  for(let s=0;s<route.total;s+=.5){
    const {headDistance,tailDistance,length,span,centered,attached}=sceneState(s);
    const p=headPose(headDistance,reverse),tail=travelPoint(tailDistance+TAIL_SPAN/2,reverse);
    const cp=attached?attachedPose(headDistance,reverse,hybridProfile):centered?centerPose(headDistance,reverse,centerProfile):null;
    const middle=travelPoint((tailDistance+TAIL_SPAN+headDistance-span)/2,reverse);
    if(centered||attached){
      const rate=cp.diagnostics.headingRate;
      const diagonal=Math.abs(Math.sin(2*cp.angle))>.995;
      const seam=cp.attachment;
      const hit=value==='right'?rate>0&&diagonal:
        value==='left'?rate<0&&diagonal:
        value==='exit'?(attached?travelPoint(cp.attachmentDistance-3,reverse).curve!==0&&seam.curve===0:seam.curve!==0&&Math.abs(rate)<.0001):
        value==='tail'?tail.curve!==0:middle.curve!==0;
      if(hit){seek(s);break;}
      continue;
    }
    const pathMode=['hybrid','aim','path'].includes($('mode').value),diagonal=Math.abs(Math.sin(2*p.lead.angle))>.995;
    const hit=value==='right'?(pathMode?p.lead.curve>0&&diagonal:p.sign>0&&p.index===4):
      value==='left'?(pathMode?p.lead.curve<0&&diagonal:p.sign<0&&p.index===4):
      value==='exit'?p.index===4&&p.seam.curve!==0&&p.lead.curve===0:
      value==='tail'?tail.curve!==0:middle.curve!==0;
    if(hit){seek(s);break;}
  }
});
document.addEventListener('visibilitychange',()=>{lastTime=null;if(document.hidden&&raf!==null){cancelAnimationFrame(raf);raf=null;}else schedule();});
function fail(error){setPlaying(false);$('error').hidden=false;$('error').textContent=`Прегледът не се зареди: ${error?.message||error}`;console.error(error);}
window.addEventListener('error',e=>fail(e.error||e.message));
window.addEventListener('unhandledrejection',e=>fail(e.reason));
async function start(){
  const [h,b,t,left,mazeAtlas]=await Promise.all([
    loadImage('../authored-snake-turns/assets/head-neck-sheet.png'),
    loadImage('../authored-snake-turns/assets/original-green-160.png'),
    loadImage('../authored-snake-turns/assets/tail-elbow-sheet-v4.png'),
    loadImage('./assets/head-neck-left.png'),
    loadImage(MAZE_ATLAS_URL),
  ]);
  frames=cacheHead(h);leftFrames=cacheHead(left);
  const straightEntry=readSheet(h,'left')[0];
  straightHead=h;headProfile=createHeadProfile(straightEntry);hybridProfile=createHybridProfile(straightEntry);
  mouthAtlas=createMouthAtlas(h,hybridProfile,offscreen);
  centerProfile=hybridProfile;
  centerOwnedSpan=centerPose(START,false,centerProfile).ownedSpan;
  // A shared exact straight endpoint removes any straight/turn bank swap.
  leftFrames[0]=frames[0];
  bodyImage=b;tailImage=t;tailEntry=readSheet(t,'right')[7];backdrop=background(mazeAtlas);retreatBackdrop=background(mazeAtlas,true);
  loaded=true;controls.forEach(id=>$(id).disabled=false);modeState();strip();paint(true);schedule();
  Object.defineProperty(window,'__snakeMazeWalk',{get:()=>{
    const state=sceneState();
    return {loaded,distance,playing,rendered,routeLength:route.total,productionIntegrated:false,
      headDistance:state.headDistance,tailDistance:state.solo?null:state.tailDistance,
      compression:state.compression,soloHead:state.solo,motion:$('motion').value,
      mouthClosure:mouthState(state.cyclePhase,state.attached&&$('mouth').value!=='open',$('mouthTiming').value).closure,mouthPhase:state.cyclePhase,
      mouthTiming:$('mouthTiming').value,
      mouthStyle:$('mouth').value,mouthFrames:mouthAtlas.frames,
      scenario:$('scenario').value,retreatTime,backing:wallStudy()&&retreatState().backing,
      retreatPhase:wallStudy()?retreatState().phase:null,cycleDuration:retreatState().cycleDuration,
      retreatStartClock:RETREAT.startClock,retreatEndClock:RETREAT.endClock};
  }});
}
start().catch(fail);
