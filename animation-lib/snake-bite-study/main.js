import {registerSheet} from '../snake-ready-v1/authored-snake-turns/sprite-registration.js';
import {route,travelPoint,WIDTH,HEIGHT,TILE,TAIL_SPAN,DIAMETER} from '../snake-ready-v1/snake-maze-walk/route.js';
import {createHybridProfile} from '../snake-ready-v1/snake-maze-walk/head-hybrid.js';
import {attachedPose} from '../snake-ready-v1/snake-maze-walk/head-attached.js';
import {mouthState} from '../snake-ready-v1/snake-maze-walk/head-mouth.js';
import {createMouthAtlas,drawSmoothMouthHead} from '../snake-ready-v1/snake-maze-walk/head-mouth-smooth.js';
import {drawGameMaze} from '../snake-ready-v1/snake-maze-walk/game-maze.js';
import {sampleBiteStudy,configFor,GAME_TIMING,materialUV} from './bite-state.js';
import {createEncounter,samplePlayer,PLAYER_SIZE} from './encounter.js';
import {sampleHeadConsumption,playerBiteClosure} from './head-consumption.js';
import {samplePlayerMouth} from './player-mouth.js';
import {createPlayerMouthAtlases,drawPlayerMouth} from './player-mouth-art.js';

const $=id=>document.getElementById(id),canvas=$('scene');
let g=canvas.getContext('2d'),layerA,layerB;
const controls=['scenario','transition','speed','zoom','play','restart','bite','headBite','guides','time'];
controls.forEach(id=>$(id).disabled=true);
let loaded=false,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,time=0,last=null,raf=null;
let headImage,bodyImage,tailImage,playerImage,playerAtlases,tailEntry,profile,atlas,background,encounters;
const crop={x:320,y:211,w:160,h:57};
const makeCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
async function image(url){const im=new Image();im.src=url;await im.decode();return im;}
function entries(im,attachment){const c=makeCanvas(im.width,im.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const result=registerSheet(ctx.getImageData(0,0,im.width,im.height),{cols:4,rows:2,attachment});c.width=c.height=1;return result;}
function config(){const c={...encounters[$('scenario').value]};c.splitVisual=$('transition').value==='smooth'?'graded':'cut';c.headVisual=$('transition').value==='smooth'?'smooth':'instant';if($('transition').value==='instant')c.duration=.000001;return c;}
function layer(target,paint){
  const parent=g,transform=parent.getTransform();g=target.getContext('2d');
  g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,target.width,target.height);
  g.save();g.setTransform(transform);paint();g.restore();g=parent;
}
function composite(target,opacity=1){g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=opacity;g.drawImage(target,0,0);g.restore();}
function faded(opacity,paint){layer(layerA,paint);composite(layerA,opacity);}

// World sampling uses accepted arc-length movement. Texture sampling uses the
// original material ID. Cutting never renormalizes surviving ring positions.
function body(state,start,end,offset=0,widthAt=null,alpha=1){
  if(end-start<1e-6||alpha<=0)return;
  if(alpha<1)return faded(alpha,()=>body(state,start,end,offset,widthAt));
  g.save();g.globalAlpha=alpha;
  for(let s=start;s<end-1e-7;){
    const m=state.material(s-offset),u=materialUV(m)*crop.w;
    const rate=(state.material(s+.01-offset)-m)/.01;
    const boundary=(crop.w-u)/crop.w*TILE/Math.max(rate,1e-6);
    const ds=Math.min(1.1,end-s,Math.max(.00001,boundary));
    const p=travelPoint(s+ds/2),width=DIAMETER*(widthAt?widthAt(s+ds/2):1);
    if(width>.008){g.save();g.translate(p.x,p.y);g.rotate(p.angle);
      g.drawImage(bodyImage,crop.x+u,crop.y,Math.min(crop.w-u,ds*rate/TILE*crop.w),crop.h,-ds/2-.23,-width/2,ds+.46,width);g.restore();}
    s+=ds;
  }g.restore();
}
function tail(tip,base,alpha=1){
  const span=Math.abs(base-tip),sign=Math.sign(base-tip);
  if(span<.02||alpha<=0)return;
  if(alpha<1)return faded(alpha,()=>tail(tip,base));
  const e=tailEntry,sourceX=e.bounds.x,sourceW=e.anchor.x-sourceX,scale=DIAMETER/e.anchor.diameter;
  g.save();g.globalAlpha=alpha;
  for(let d=0;d<span;d+=1.1){const ds=Math.min(1.1,span-d),p=travelPoint(tip+sign*(d+ds/2));
    g.save();g.translate(p.x,p.y);g.rotate(p.angle+(sign<0?Math.PI:0));
    g.drawImage(tailImage,sourceX+d/span*sourceW,e.cell.y,ds/span*sourceW,e.cell.height,
      -ds/2-.23,(e.cell.y-e.anchor.y)*scale,ds+.46,e.cell.height*scale);g.restore();}
  g.restore();
}
// Same cap function and progress for BOTH cut faces. Start with the original
// cylindrical material; pinch its silhouette and reveal the accepted tail art.
function newCap(state,tip,base,progress,offset=0){
  const span=Math.abs(base-tip);if(span<.02)return;
  const low=Math.min(tip,base),high=Math.max(tip,base);
  if(progress<=0)return body(state,low,high,offset);
  if(progress>=1)return tail(tip,base);
  layer(layerA,()=>body(state,low,high,offset,s=>{
    const u=Math.max(0,Math.min(1,(s-tip)/(base-tip)));
    return 1-progress+progress*Math.pow(u,.65);
  }));
  layer(layerB,()=>tail(tip,base));
  // Blend complete ribbons once. Per-strip alpha creates visible vertical
  // stitches wherever their antialiasing overlaps. Add premultiplied weights
  // here instead of source-over double silhouettes or reduced interior alpha.
  const a=layerA.getContext('2d');a.save();a.setTransform(1,0,0,1,0,0);
  a.globalCompositeOperation='destination-in';a.globalAlpha=1-progress;a.fillRect(0,0,layerA.width,layerA.height);
  a.globalCompositeOperation='lighter';a.globalAlpha=progress;a.drawImage(layerB,0,0);a.restore();
  composite(layerA);
}
// Pointed from its first visible pixel. The cap's LENGTH grows continuously
// from zero, while the eaten material retreats toward its logical boundary.
// Retain moving body paint under the exact accepted tail-alpha silhouette;
// only then blend to the tail's highlights. No rectangular cut face, separate
// disappearing cell, smoke, or global rescaling of the snake.
function growingCap(state,tip,base,progress,offset=0){
  if(Math.abs(base-tip)<.02)return;
  if(progress>=1)return tail(tip,base);
  layer(layerA,()=>body(state,Math.min(tip,base),Math.max(tip,base),offset));
  layer(layerB,()=>tail(tip,base));
  const a=layerA.getContext('2d');a.save();a.setTransform(1,0,0,1,0,0);
  a.globalCompositeOperation='destination-in';a.drawImage(layerB,0,0);
  a.globalAlpha=1-progress;a.fillRect(0,0,layerA.width,layerA.height);
  a.globalCompositeOperation='lighter';a.globalAlpha=progress;a.drawImage(layerB,0,0);a.restore();
  composite(layerA);
}
function roundedNape(amount){
  if(amount<=0)return;
  const scale=profile.width/218,x=v=>profile.offsetX+(v-220)*scale,y=v=>profile.offsetY+(v-128)*scale;
  const a=amount;
  g.beginPath();g.moveTo(x(220+42*a),y(128));
  g.bezierCurveTo(x(220+18*a),y(143),x(220+2*a),y(164),x(220+2*a),y(198));
  g.bezierCurveTo(x(220+2*a),y(233),x(220+19*a),y(254),x(220+42*a),y(264));
  g.lineTo(x(262),y(304));g.lineTo(x(444),y(304));g.lineTo(x(444),y(128));g.closePath();g.clip();
}
function skull(state,pose,opacity=1,solo=0,closure=mouthState(state.phase,true,'thrust').closure){
  if(opacity<=0)return;
  g.save();g.globalAlpha=opacity;
  // Apply the evolving local nape mask without moving or rescaling the skull.
  g.translate(pose.rear.x,pose.rear.y);g.rotate(pose.angle);roundedNape(solo);
  drawSmoothMouthHead(g,atlas,headImage,profile,0,false,{rear:{x:0,y:0},angle:0},closure);
  g.restore();
}
function drawSnake(state){
  if(config().headOnly){skull(state,attachedPose(state.headDistance,false,profile),1,1);return;}
  if(state.scenario==='split'&&state.time>=config().firstBite){
    const p=state.progress,frontTip=state.world(state.visualFrontCut),frontBase=frontTip+state.visualCapSpan;
    const cap=config().splitVisual==='graded'?growingCap:newCap;
    body(state,frontBase,state.rear);cap(state,frontTip,frontBase,p);
    skull(state,attachedPose(state.headDistance,false,profile));
    const off=state.backOffset,backTip=state.world(state.visualBackCut)+off,backBase=backTip-state.visualCapSpan;
    const rear=state.world(TAIL_SPAN+(profile.skullLength-TAIL_SPAN)*p)+off;
    body(state,rear,backBase,off);cap(state,backTip,backBase,p,off);
    tail(state.world(0)+off,state.world(TAIL_SPAN)+off,1-p);
    const q=travelPoint(state.world(profile.skullLength)+off);
    skull(state,{rear:q,angle:q.angle+Math.PI},p);
    if($('guides').checked){marker(frontTip,'#b9f879');marker(backTip,'#b9f879');}
  }else{
    const tip=state.tail??state.world(0),solo=state.soloBlend??0;
    const base=Math.min(state.rear,tip+TAIL_SPAN*(1-solo));
    body(state,base,state.rear);tail(tip,base,1-solo);
    skull(state,attachedPose(state.headDistance,false,profile),1,solo);
    if($('guides').checked&&solo<1)marker(tip,'#b9f879');
  }
}
function swallowedHead(state,head){
  if(head.complete)return;
  g.save();g.translate(head.center.x,head.center.y);g.rotate(head.angle);g.scale(head.scale,head.scale);
  const closure=mouthState(state.phase,true,'thrust').closure*head.scale+head.progress;
  skull(state,{rear:{x:-profile.skullLength/2,y:0},angle:0},1,1,closure);
  g.restore();
}
function marker(s,color){const p=travelPoint(s);g.save();g.strokeStyle=color;g.lineWidth=.6;g.beginPath();g.arc(p.x,p.y,10,0,Math.PI*2);g.stroke();g.restore();}

function contact(state){
  if(state.scenario==='split')return config().contactDistance;
  if(config().headOnly)return state.rear;
  return state.tail;
}
function player(state){
  const pose=samplePlayer(state.time,config()),direction=pose.angle,size=PLAYER_SIZE;
  // Independent linear movement: 95 ms per cell, not a position attached to
  // the moving bite site. Mouth rhythm never gates contact or cell removal.
  const bite=playerBiteClosure(state.time,config());
  const quadrant=Math.round(direction/(Math.PI/2)),bank=((quadrant%4)+4)%4;
  g.save();g.translate(pose.x,pose.y);g.rotate(direction-quadrant*Math.PI/2);
  drawPlayerMouth(g,playerAtlases,bank,bite,size);
  g.restore();
}
function mouthReview(cfg){
  const c=$('playerPoses'),ctx=c.getContext('2d'),jaw=samplePlayerMouth(time,cfg);
  ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#0d1a14';ctx.fillRect(0,0,c.width,c.height);
  const labels=['НАДЯСНО','НАДОЛУ','НАЛЯВО','НАГОРЕ · С ГРЪБ'];
  for(let bank=0;bank<4;bank++){
    const x=bank*300;ctx.fillStyle='#14251d';ctx.fillRect(x+10,12,280,225);
    ctx.fillStyle='#b4ee79';ctx.font='16px Segoe UI';ctx.textAlign='center';ctx.fillText(labels[bank],x+150,43);
    ctx.save();ctx.translate(x+150,132);drawPlayerMouth(ctx,playerAtlases,bank,jaw.closure,144);ctx.restore();
    ctx.font='14px Segoe UI';ctx.fillStyle='#9eb9ab';ctx.fillText(bank===3?`Червена част · ${Math.round(jaw.closure*100)}% затваряне`:`${Math.round(jaw.closure*100)}% затваряне`,x+150,220);
  }
  ctx.textAlign='left';ctx.fillStyle='#9eb9ab';ctx.font='16px Segoe UI';
  const action={travel:'Лек ритъм на клетка',opening:'Подготовка за хапка',biting:'Затваряне при поглъщане',release:'Връщане към движение'}[jaw.action];
  ctx.fillText(`${action} · изминати ${jaw.travelledCells.toFixed(2)} клетки`,24,270);
  ctx.fillStyle='#243c2d';ctx.fillRect(24,290,1152,5);ctx.fillStyle='#b4ee79';ctx.fillRect(24,290,1152*jaw.phase,5);
}
function paint(){
  if(!loaded)return;
  const cfg=config(),state=sampleBiteStudy(time,profile.skullLength,cfg);
  const head=sampleHeadConsumption(time,state,samplePlayer(time,cfg),cfg,profile);
  g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,canvas.width,canvas.height);g.save();g.scale(2,2);
  const zoom=Number($('zoom').value);
  if(zoom>1){
    const focus=travelPoint(contact(state));
    const x=Math.max(WIDTH/zoom/2,Math.min(WIDTH-WIDTH/zoom/2,focus.x));
    const y=Math.max(HEIGHT/zoom/2,Math.min(HEIGHT-HEIGHT/zoom/2,focus.y));
    g.translate(WIDTH/2,HEIGHT/2);g.scale(zoom,zoom);g.translate(-x,-y);
  }
  g.drawImage(background,0,0,WIDTH,HEIGHT);
  if(head.consumed)swallowedHead(state,head);else drawSnake(state);
  // Mouth/player foreground naturally occludes the swallowed art; the head
  // does not become a transparent ghost or get clipped by a rectangular wipe.
  player(state);g.restore();
  $('time').max=Math.round(cfg.totalTime*1000);$('time').value=Math.round(time*1000);
  $('timeLabel').textContent=`${time.toFixed(2)} s`;$('play').textContent=playing?'Пауза':'Продължи';
  $('phase').textContent=head.complete?'Главата е погълната · змията е изядена':head.active?'ФИНАЛНА ХАПКА · главата се прибира в устата':state.eventActive?'ЗАХАПВАНЕ · постепенно поглъщане и оформяне':state.soloBlend===1||cfg.headOnly?'Самотна глава · човечето я настига':state.scenario==='split'&&state.progress===1?'Два фрагмента · две нови опашки':'Движение · запазен ритъм';
  const rates='Човече 95 ms/клетка · змия 218 ms/клетка · 2,29:1';
  $('status').textContent=(state.scenario==='split'?(state.logicalEaten?`7 → 3 + 3 · ${Math.round(state.progress*100)}% оформяне · разделяне при допир`:'Приближаване · разделянето предстои'):
    `${cfg.headOnly?1:cfg.cells} → ${head.remainingCells} клетки · ${head.consumed?`поглъщане на главата ${Math.round(head.progress*100)}%`:$('transition').value==='instant'?'моментална смяна':'оформяне 95 ms'}`)+` · ${rates}`;
  $('headBite').disabled=!Number.isFinite(cfg.headBiteAt);
  mouthReview(cfg);
}
function schedule(){if(loaded&&playing&&!document.hidden&&raf===null)raf=requestAnimationFrame(tick);}
function tick(now){raf=null;if(!playing||document.hidden){last=null;return;}if(last!==null)time=Math.min(config().totalTime,time+Math.min(.08,(now-last)/1000)*Number($('speed').value));last=now;
  if(time>=config().totalTime){playing=false;last=null;}paint();schedule();}
function setPlaying(value){playing=value;last=null;if(raf!==null){cancelAnimationFrame(raf);raf=null;}paint();schedule();}
$('play').addEventListener('click',()=>{if(time>=config().totalTime)time=0;setPlaying(!playing);});
$('restart').addEventListener('click',()=>{time=0;setPlaying(true);});
$('bite').addEventListener('click',()=>{const cfg=config(),events=[...cfg.biteTimes,...(Number.isFinite(cfg.headBiteAt)?[cfg.headBiteAt]:[])];const next=events.find(at=>at>time+.001)??events.at(-1);time=Math.max(0,next-.15);setPlaying(true);});
$('headBite').addEventListener('click',()=>{const at=config().headBiteAt;if(Number.isFinite(at)){time=Math.max(0,at-.18);setPlaying(true);}});
$('scenario').addEventListener('change',()=>{time=0;setPlaying(true);});
for(const id of ['transition','zoom','guides'])$(id).addEventListener('change',paint);
$('speed').addEventListener('change',()=>{last=null;paint();});
$('time').addEventListener('input',()=>{time=Number($('time').value)/1000;setPlaying(false);});
document.addEventListener('visibilitychange',()=>{last=null;if(document.hidden&&raf!==null){cancelAnimationFrame(raf);raf=null;}else schedule();});
function fail(error){playing=false;loaded=false;if(raf!==null)cancelAnimationFrame(raf);raf=null;controls.forEach(id=>$(id).disabled=true);$('error').hidden=false;$('error').textContent=`Неуспешно зареждане: ${error.message||error}`;console.error(error);}
window.addEventListener('error',e=>fail(e.error||e.message));window.addEventListener('unhandledrejection',e=>fail(e.reason));
async function start(){
  const root='../snake-ready-v1/';
  const pictures=await Promise.all([
    image(root+'authored-snake-turns/assets/head-neck-sheet.png'),image(root+'authored-snake-turns/assets/original-green-160.png'),
    image(root+'authored-snake-turns/assets/tail-elbow-sheet-v4.png'),image('assets/player-characters.png'),image(root+'snake-maze-walk/assets/game-maze-pipes.png')]);
  [headImage,bodyImage,tailImage,playerImage]=pictures;
  layerA=makeCanvas(canvas.width,canvas.height);layerB=makeCanvas(canvas.width,canvas.height);
  playerAtlases=createPlayerMouthAtlases(playerImage,makeCanvas);
  profile=createHybridProfile(entries(headImage,'left')[0]);tailEntry=entries(tailImage,'right')[7];atlas=createMouthAtlas(headImage,profile,makeCanvas);
  encounters=Object.fromEntries(['tail','split','solo','corner','head','left'].map(name=>[name,createEncounter(configFor(name),profile.skullLength)]));
  background=makeCanvas(WIDTH*2,HEIGHT*2);const bg=background.getContext('2d');bg.scale(2,2);drawGameMaze(bg,pictures[4]);
  loaded=true;controls.forEach(id=>$(id).disabled=false);paint();schedule();
}
start().catch(fail);
