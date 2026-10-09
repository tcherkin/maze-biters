import {TILE, WIDTH, HEIGHT, SPEED, MOVE_SECONDS, START_DISTANCE, SMOOTH_LOOP_SECONDS, NATIVE_LOOP_SECONDS, NATIVE_ROUTE_CELLS, smoothRoute, scorpionPose, nativePose} from './motion.js';
import {drawGameMaze, ROUTE_CELLS} from '../snake-ready-v1/snake-maze-walk/game-maze.js';
import {loadScorpionArt} from './art.js';
import {DEAD_END_VARIANTS, deadEndPose, deadEndInstantPose} from './dead-end-motion.js';
import {drawDeadEndMaze} from './dead-end-maze.js';
import {loadBentArt} from './bent-art.js';
import {BENT_STUDY, bentPose} from './bent-motion.js';

const $=id=>document.getElementById(id), mod=(v,n)=>((v%n)+n)%n;
const before=$('before'), after=$('after');
const contexts=[before.getContext('2d'),after.getContext('2d')];
const state={time:0,distance:START_DISTANCE,nativeOffset:0,reverse:false,playing:true,speed:.5,zoom:3,guides:false,compare:false,scenario:'bent',repeat:true};
let art,bentArt,background,lastStamp=null,lastUi=-1,frameCount=0;
const backgrounds={},deadPose={},instantPose={},bendPose={},cameraPoint={};
const guidePath=new Path2D();
for(let s=0;s<=smoothRoute.total;s+=2){const p=smoothRoute.point(s);if(!s)guidePath.moveTo(p.x,p.y);else guidePath.lineTo(p.x,p.y);}guidePath.closePath();

async function loadImage(url){const image=new Image();image.src=url;await image.decode();return image;}
function nativeTime(){return mod(state.nativeOffset+state.time,NATIVE_LOOP_SECONDS);}
function distance(){return state.distance+(state.reverse?-1:1)*SPEED*state.time;}
function isDeadEnd(){return state.scenario!=='route';}
function fixture(){return state.scenario==='bent'?BENT_STUDY:DEAD_END_VARIANTS[state.scenario];}
function camera(ctx,center){
  ctx.setTransform(2,0,0,2,0,0);ctx.fillStyle='#070b10';ctx.fillRect(0,0,WIDTH,HEIGHT);
  const z=state.zoom;
  // Direct deterministic tracking. No spring lag or catch-up when scrubbing.
  ctx.translate(WIDTH/2,HEIGHT/2);ctx.scale(z,z);
  ctx.translate(z===1?-WIDTH/2:-center.x,z===1?-HEIGHT/2:-center.y);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  // The current bend is deliberately shown in the narrow tunnel. Render
  // all limbs over the walls so any intersection remains visible for review.
  const image=isDeadEnd()?backgrounds[state.scenario==='wide'?'wide':'narrow']:background;
  ctx.drawImage(image,0,0,WIDTH,HEIGHT);
  if(state.guides){
    ctx.save();ctx.lineWidth=.45;ctx.strokeStyle='#94ccb680';ctx.setLineDash([2.4,3]);
    if(isDeadEnd()){
      const f=fixture();ctx.beginPath();ctx.moveTo(TILE*1.5,f.y);ctx.lineTo(TILE*17.5,f.y);ctx.stroke();
      ctx.setLineDash([]);ctx.beginPath();ctx.arc(f.turnX,f.y,3,0,Math.PI*2);ctx.stroke();
    }else ctx.stroke(guidePath);
    ctx.restore();
  }
}
function dot(ctx,p,color){ctx.beginPath();ctx.arc(p.x,p.y,1.2,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function paint(){
  if(!art)return;
  let u,phase,status;
  if(isDeadEnd()){
    const f=fixture(),bent=state.scenario==='bent',pose=bent?bentPose(state.time,bendPose):deadEndPose(state.time,state.scenario,state.reverse,deadPose),c=contexts[1];
    cameraPoint.x=pose.x;cameraPoint.y=bent?f.y:pose.y;camera(c,cameraPoint);
    if(bent){
      // The seam stays on the original corridor centerline. The articulated
      // body bends around it at native size; no scale or route offset.
      bentArt.draw(c,pose);
    }else if(state.scenario==='compact'){
      // Uniform scale about the fixed seam, preserving all proportions.
      // Native walking frames continue throughout braking and the full turn.
      c.save();c.translate(pose.x,pose.y);c.scale(pose.scale,pose.scale);c.translate(-pose.x,-pose.y);
      art.drawRigid(c,pose);c.restore();
    }else art.drawRigid(c,pose);
    if(state.guides){
      dot(c,pose.seam,'#f8d787');
      if(bent){
        c.save();
        c.beginPath();for(let i=0;i<=64;i++){const p=pose.sample(-25.2+i*39.6/64);if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);}c.lineWidth=.7;c.strokeStyle='#9effd8';c.stroke();
        dot(c,pose.front,'#87e1ce');dot(c,pose.rear,'#e6a0f1');c.restore();
      }
    }
    if(state.compare){
      const c0=contexts[0];
      if(bent){
        const prior=DEAD_END_VARIANTS.compact,u=Math.max(0,Math.min(1,(pose.time-f.turnStart)/(f.turnEnd-f.turnStart)));
        const old=deadEndPose(prior.turnStart+u*(prior.turnEnd-prior.turnStart),'compact',false,instantPose);
        old.x=pose.x;old.y=f.y;old.frame=pose.frame;camera(c0,cameraPoint);
        c0.save();c0.translate(old.x,old.y);c0.scale(old.scale,old.scale);c0.translate(-old.x,-old.y);art.drawRigid(c0,old);c0.restore();
      }else{
        const old=deadEndInstantPose(state.time,state.scenario,state.reverse,instantPose);
        camera(c0,old.seam);art.drawRigid(c0,old);
      }
    }
    u=pose.time/f.duration;phase=pose.phaseLabel;
    status=`${state.playing?'Движение':'Пауза'} · ${state.speed}× · 2 клетки · ${pose.time.toFixed(2)} / ${f.duration.toFixed(2)} s · ${f.label}`;
  }else{
    const d=distance(),pose=scorpionPose(d,state.reverse);
    const frame=mod(state.time+state.nativeOffset,MOVE_SECONDS)<MOVE_SECONDS/2?0:1;
    const c=contexts[1];camera(c,pose.seam);art.drawSmooth(c,d,state.reverse,frame);
    if(state.guides){dot(c,pose.front,'#87e1ce');dot(c,pose.seam,'#f8d787');dot(c,pose.rear,'#e6a0f1');}
    if(state.compare){const old=nativePose(nativeTime(),state.reverse),c0=contexts[0];camera(c0,old.seam);art.drawNative(c0,old);}
    u=mod(d,smoothRoute.total)/smoothRoute.total;
    phase=pose.seam.type==='turn'?'Завой · непрекъснат ъгъл':'Направо';
    status=`${state.playing?'Движение':'Пауза'} · ${state.speed}× · 2 клетки · ${state.reverse?'обратна обиколка':'основна обиколка'} · 218 ms/клетка при 1×`;
  }
  frameCount++;
  if(Math.abs(state.time-lastUi)>.05||!state.playing){
    $('time').value=Math.round(u*10000);$('timeLabel').value=`${(u*100).toFixed(1)}%`;
    $('phase').textContent=phase;
    $('status').textContent=status;
    lastUi=state.time;
  }
}
function play(value){if(value&&isDeadEnd()&&state.time>=fixture().duration)state.time=0;state.playing=value;$('play').textContent=value?'Пауза':'Продължи';lastStamp=null;lastUi=-1;paint();}
function restart(){state.time=0;state.distance=START_DISTANCE;state.nativeOffset=0;play(true);}
function scenarioLabels(){
  const dead=isDeadEnd(),compact=state.scenario==='compact',bent=state.scenario==='bent';
  $('scenario').value=state.scenario;$('turnJump').hidden=!dead;
  $('directionControl').hidden=compact||bent;
  $('directionLabel').textContent=dead?'Посока на обръщане':'Обиколка';
  const options=$('direction').options;
  options[0].textContent=dead?'По часовника':'По маршрута';
  options[1].textContent=dead?'Обратно на часовника':'В обратната посока';
  $('beforeTitle').textContent=bent?'01 / ПРЕДИ · ТВЪРД ОБОРОТ':dead?'01 / МОМЕНТАЛНО ОБРЪЩАНЕ':'01 / ПРЕДИ';
  $('beforeCaption').textContent=bent?'Цялата фигура се завърта':'Смяна на посоката веднага';
  $('beforeNote').textContent=bent?'Предишният вариант: равномерно свиване и завъртане на целия скорпион като твърда фигура. Фазата е съпоставена с новия завой.':dead?'Същото приближаване и същият часовник, но смяна на посоката наведнъж. Контролно сравнение, не оригиналният игрови алгоритъм.':'Оригиналният ритъм: 218 ms на клетка, придвижване в първите 55% от стъпката, моментална смяна в завоя.';
  $('afterNote').textContent=bent?'Непрекъснато обръщане в тесния тунел: предната част повежда, задната започва преди тя да приключи. Крачетата не спират. Пълен размер и същият прав маршрут; застъпването със стените нарочно остава видимо.':compact?'Плавни 180° по часовника, с временно равномерно свиване. Крачетата продължават да се движат. Без скок и без отстъпване назад преди обръщането.':dead?'Цялото двуклетъчно тяло се обръща плавно в разширението. В тесния тупик първо отстъпва назад с половин скорост.':'Същите игрови спрайтове. Посоката следва траекторията; плавното движение няма изчакване между клетките.';
  $('comparisonNote').textContent=bent?'Вляво е предишният твърд оборот със смаляване, вдясно — свързано извиване в пълен размер. Фазите са съпоставени и двата варианта са в тесния тунел. Застъпването с лабиринта засега е част от теста, не ограничение на движението.':dead?'Двата варианта са синхронизирани по време и положение на земята. Вляво посоката се сменя моментално, вдясно обръщането е анимирано.':'Двата варианта имат еднаква средна скорост на правите. Плавният заоблен маршрут е малко по-къс и няма старите паузи, затова позициите постепенно се разминават.';
}
function selectScenario(id){
  if(!['route','bent','compact','narrow','wide'].includes(id))throw new Error('Unknown scenario');
  state.scenario=id;scenarioLabels();restart();
}
function seekTime(t,id=state.scenario){
  if(id!==state.scenario)selectScenario(id);
  play(false);state.time=isDeadEnd()?Math.max(0,Math.min(fixture().duration,t)):t;lastUi=-1;paint();
}
function jumpTurn(){
  if(!isDeadEnd())selectScenario('bent');
  state.time=Math.max(0,fixture().turnStart-.6);lastUi=-1;play(true);
}
function setDistance(d){
  state.time=0;state.distance=d;
  // Seek reference to the same neighborhood; each renderer then keeps its
  // own real cadence. Never slow one variant to disguise shorter arc length.
  const target=smoothRoute.point(d);let best=Infinity,index=0;
  for(let i=0;i<NATIVE_ROUTE_CELLS.length;i++){
    const cell=NATIVE_ROUTE_CELLS[i],error=Math.hypot((cell[0]+.5)*TILE-target.x,(cell[1]+.5)*TILE-target.y);
    if(error<best){best=error;index=i;}
  }
  state.nativeOffset=mod(state.reverse?-index:index-1,NATIVE_ROUTE_CELLS.length)*MOVE_SECONDS;
  lastUi=-1;lastStamp=null;paint();
}
function jump(kind){
  if(isDeadEnd()){state.scenario='route';scenarioLabels();}
  const wanted=kind==='double'?(state.reverse?6:5):null;
  const sign=(kind==='right'?1:-1)*(state.reverse?-1:1);
  const turns=smoothRoute.pieces.filter(p=>p.type==='turn');
  const p=turns.find(p=>wanted!==null?p.vertexIndex===wanted:p.vertexIndex!==0&&p.turnSign===sign);
  setDistance(state.reverse?p.end+TILE*.8:p.start-TILE*.8);play(true);
}
function step(delta){play(false);state.time=isDeadEnd()?Math.max(0,Math.min(fixture().duration,state.time+delta)):state.time+delta;lastUi=-1;paint();}
$('play').onclick=()=>play(!state.playing);
$('restart').onclick=restart;
$('scenario').onchange=e=>selectScenario(e.target.value);
$('turnJump').onclick=jumpTurn;
$('repeat').onchange=e=>{state.repeat=e.target.checked;};
$('speed').onchange=e=>{state.speed=Number(e.target.value);lastUi=-1;paint();};
$('zoom').onchange=e=>{state.zoom=Number(e.target.value);paint();};
$('direction').onchange=e=>{state.reverse=e.target.value==='reverse';restart();};
$('guides').onchange=e=>{state.guides=e.target.checked;paint();};
$('compare').onchange=e=>{state.compare=e.target.checked;$('beforePanel').hidden=!state.compare;$('comparisonNote').hidden=!state.compare;$('stages').classList.toggle('compare',state.compare);paint();};
$('time').oninput=e=>{const u=Number(e.target.value)/10000;if(isDeadEnd())seekTime(u*fixture().duration);else{play(false);setDistance(u*smoothRoute.total);}};
$('stepBack').onclick=()=>step(-1/60);$('stepNext').onclick=()=>step(1/60);
for(const b of document.querySelectorAll('[data-jump]'))b.onclick=()=>jump(b.dataset.jump);
document.addEventListener('visibilitychange',()=>{lastStamp=null;});
function tick(stamp){
  if(lastStamp!==null&&state.playing&&!document.hidden){
    state.time+=(stamp-lastStamp)/1000*state.speed;
    if(isDeadEnd()&&state.time>=fixture().duration){
      if(!state.repeat){state.time=fixture().duration;play(false);}
      else if(state.time>=fixture().duration+(state.scenario==='bent'?0:.9)){state.time=0;lastUi=-1;}
    }
  }
  lastStamp=stamp;if(state.playing)paint();requestAnimationFrame(tick);
}

try{
  const [renderer,bend,atlas]=await Promise.all([loadScorpionArt(),loadBentArt(),loadImage('../snake-ready-v1/snake-maze-walk/assets/game-maze-pipes.png')]);
  art=renderer;bentArt=bend;background=document.createElement('canvas');background.width=WIDTH*2;background.height=HEIGHT*2;
  const c=background.getContext('2d');c.scale(2,2);drawGameMaze(c,atlas);
  for(const variant of ['narrow','wide']){
    const image=document.createElement('canvas');image.width=WIDTH*2;image.height=HEIGHT*2;
    const context=image.getContext('2d');context.scale(2,2);drawDeadEndMaze(context,atlas,variant);backgrounds[variant]=image;
  }
  // Read-only/local review hook, plus explicit deterministic seek for QA.
  window.scorpionStudy={state,art,bentArt,bentPose,smoothRoute,scorpionPose,deadEndPose,deadEndInstantPose,variants:{...DEAD_END_VARIANTS,bent:BENT_STUDY},
    metrics:()=>({frameCount,art:art.stats,bentArt:bentArt.stats,distance:distance(),nativeTime:nativeTime(),scenario:state.scenario,ready:true}),
    seek:(d)=>{if(isDeadEnd()){state.scenario='route';scenarioLabels();}play(false);setDistance(d);},seekTime,selectScenario,jumpTurn,jump,play,paint};
  scenarioLabels();restart();requestAnimationFrame(tick);
}catch(error){$('error').hidden=false;$('error').textContent=`Не успях да заредя експеримента: ${error.message}`;$('status').textContent='Грешка при зареждането.';console.error(error);}
