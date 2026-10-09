import {createLiveSnakeRenderer} from '../src/render/live-snake.js?v=1.02.03.00';

// This page supplies deterministic LEGAL cell commits only. All paths,
// pulse timing, heads, tails, retreat interpolation and drawing come from
// the shared runtime adapter. No demonstration geometry lives here.
const TILE = 24, FORWARD = 218, RETREAT = 436, SCENE_W = 620, SCENE_H = 178;
const COLORS = [
  ['green', 'Зелена', '#35e55b'], ['yellow', 'Златиста', '#ffe57a'],
  ['blue', 'Синя', '#66c2ff'], ['pink', 'Розова', '#d66bff'], ['orange', 'Оранжева', '#ff8873']
];
const $ = id => document.getElementById(id), copy = cells => cells.map(p => ({...p}));
const elements = Object.fromEntries(['play','restart','speed','length','guides','time','clock','commit','before','exact','after','phase','status','rows'].map(id => [id,$(id)]));
const renderer = createLiveSnakeRenderer({tile: TILE});
const rows = [], dpr = Math.min(2, window.devicePixelRatio || 1);
let events = [], snakes = [], cursor = 0, time = 0, duration = 5224, playing = false, loaded = false, lastFrame = null;
let lastCommit = null, snapshots = [];

function surface(width, height, className) {
  const canvas = document.createElement('canvas'); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  canvas.className = className; canvas.setAttribute('aria-hidden','true');
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return {canvas, ctx};
}
function initial(color) {
  const length = Number(elements.length.value);
  return {body:Array.from({length},(_,i)=>({x:9-i,y:2})),dir:{x:1,y:0},reversing:false,color};
}
function script() {
  const s = initial(COLORS[0][2]), result = [];
  function commit(at, backwards, next, name) {
    if (s.body.slice(backwards ? 1 : 0, backwards ? undefined : -1).some(p=>p.x===next.x&&p.y===next.y))
      throw Error('The QA route must not enter an occupied cell');
    const endpoint = backwards ? s.body.at(-1) : s.body[0];
    if (Math.abs(next.x-endpoint.x)+Math.abs(next.y-endpoint.y)!==1) throw Error('QA commits must be adjacent cells');
    s.body = backwards ? [...s.body.slice(1), {...next}] : [{...next}, ...s.body.slice(0,-1)];
    if (s.body.length>1) s.dir={x:s.body[0].x-s.body[1].x,y:s.body[0].y-s.body[1].y};
    s.reversing=backwards;
    result.push({t:at,duration:backwards?RETREAT:FORWARD,body:copy(s.body),dir:{...s.dir},reversing:backwards,name});
  }
  let t=350;
  for(let i=0;i<3;i++){commit(t,false,{x:s.body[0].x+1,y:s.body[0].y},`Напред ${i+1}`);t+=FORWARD;}
  t+=350;
  const base={...s.body.at(-1)}, targets=[[-1,0],[-1,1],[-2,1],[-2,2],[-3,2],[-3,3]];
  targets.forEach(([x,y],i)=>{commit(t,true,{x:base.x+x,y:base.y+y},i===0?'Начало назад':`Назад · завой ${i}`);t+=RETREAT;});
  t+=200;
  for(let i=0;i<3;i++){commit(t,false,{x:s.body[0].x+s.dir.x,y:s.body[0].y+s.dir.y},`Отново напред ${i+1}`);t+=FORWARD;}
  duration=t+400; return result;
}
function reset() {
  renderer.reset(); snakes=COLORS.map(([, ,color])=>initial(color)); cursor=0; lastCommit=null; snapshots=[];
  snakes.forEach(s=>renderer.capture(s,0));
}
function configure() {
  events=script(); reset(); elements.time.max=String(duration);
  elements.commit.replaceChildren(...events.map((event,index)=>{
    const option=document.createElement('option');option.value=String(index);option.textContent=`${event.name} · ${(event.t/1000).toFixed(3)} s`;return option;
  }));
  elements.commit.value='4'; time=0; seek(events[4].t-.01); pause();
}
function applyUntil(target) {
  if(target<time)reset();
  while(cursor<events.length&&events[cursor].t<=target){
    const event=events[cursor], values=[];
    snakes.forEach((s,index)=>{
      const before=renderer.inspect(s,event.t), oldBody=copy(s.body), wasReversing=s.reversing;
      s.body=copy(event.body);s.dir={...event.dir};s.reversing=event.reversing;
      renderer.recordStep(s,{oldBody,t:event.t,duration:event.duration,wasReversing});
      const after=renderer.inspect(s,event.t);
      values.push({palette:COLORS[index][0],tailJump:Math.hypot(after.tail.x-before.tail.x,after.tail.y-before.tail.y)*TILE/36,
        headJump:Math.hypot(after.rear.x-before.rear.x,after.rear.y-before.rear.y)*TILE/36,
        angleJump:Math.abs(Math.atan2(Math.sin(after.tail.angle-before.tail.angle),Math.cos(after.tail.angle-before.tail.angle)))*180/Math.PI});
    });
    lastCommit={index:cursor,t:event.t,name:event.name,values};snapshots.push(lastCommit);cursor++;
  }
}
function seek(value) { if(!loaded)return; const target=Math.max(0,Math.min(duration,Number(value)));applyUntil(target);time=target;paint(); }
function play(){if(!loaded)return;playing=true;lastFrame=null;elements.play.textContent='Пауза';}
function pause(){playing=false;lastFrame=null;elements.play.textContent='Пусни';}
function paint() {
  elements.time.value=String(time);elements.clock.textContent=`${(time/1000).toFixed(3)} s`;
  const active=events[Math.max(0,cursor-1)];
  elements.phase.textContent=time<events[0].t?'Изходно положение':time>active.t+active.duration?'Край на стъпката':active.name;
  rows.forEach((row,index)=>{
    const g=row.motion.ctx,s=snakes[index];g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,SCENE_W,SCENE_H);g.save();g.translate(44,8);
    if(elements.guides.checked){
      g.strokeStyle='#344359';g.lineWidth=.5;g.beginPath();
      for(let x=0;x<=18;x++){g.moveTo(x*TILE,0);g.lineTo(x*TILE,7*TILE);}
      for(let y=0;y<=7;y++){g.moveTo(0,y*TILE);g.lineTo(18*TILE,y*TILE);}g.stroke();
      g.fillStyle='#62728a';for(const p of s.body){g.beginPath();g.arc((p.x+.5)*TILE,(p.y+.5)*TILE,1.8,0,Math.PI*2);g.fill();}
    }
    const okay=renderer.draw(g,s,time),pose=renderer.inspect(s,time);
    if(elements.guides.checked&&pose)for(const[p,color]of[[pose.tail,'#f8ba75'],[pose.rear,'#83d3ff']]){
      g.strokeStyle=color;g.lineWidth=1;g.beginPath();g.arc(p.x*TILE/36,p.y*TILE/36,3,0,Math.PI*2);g.stroke();
    }
    g.restore();
    const change=lastCommit?.values[index],warning=change&&(change.tailJump>.01||change.headJump>.01||change.angleJump>.01);
    row.details.innerHTML=change?`Последна стъпка: <span class="${warning?'warning':'okay'}">опашка ${change.tailJump.toFixed(3)} px · глава ${change.headJump.toFixed(3)} px · ъгъл ${change.angleJump.toFixed(3)}°</span>`:'Оригинална палитра · готова за движение';
    if(!okay){elements.status.textContent=renderer.stats().error||'Рисунките се възстановяват…';elements.status.classList.add('error');}
  });
}
function loop(timestamp){
  if(playing&&loaded){
    if(lastFrame!==null){let next=time+(timestamp-lastFrame)*Number(elements.speed.value);if(next>duration){reset();time=0;next%=duration;}seek(next);}
    lastFrame=timestamp;
  }
  requestAnimationFrame(loop);
}
async function loadNative(name){const im=new Image();im.src=new URL(`../assets/atlases/4k/snake-${name}-160.png`,import.meta.url).href;await im.decode();return im;}
async function setup(){
  const [native]=await Promise.all([Promise.all(COLORS.map(([name])=>loadNative(name))),renderer.prepare()]);
  COLORS.forEach(([name,label,color],index)=>{
    const article=document.createElement('article');article.className='palette';article.dataset.palette=name;article.style.setProperty('--color',color);
    const originalBlock=document.createElement('div'),liveBlock=document.createElement('div'),heading=document.createElement('h2');
    heading.innerHTML=`<span class="dot"></span>${label}`;originalBlock.append(heading);
    const original=surface(248,128,'original'),motion=surface(SCENE_W,SCENE_H,'motion'),details=document.createElement('p');details.className='details';
    originalBlock.append(original.canvas);liveBlock.append(motion.canvas,details);article.append(originalBlock,liveBlock);elements.rows.append(article);
    const g=original.ctx;g.drawImage(native[index],0,160,160,160,5,28,72,72);g.drawImage(native[index],320,211,160,57,81,50,72,25.65);g.drawImage(native[index],640,160,160,160,162,28,72,72);
    rows.push({original,motion,details});
  });
  loaded=true;for(const id of ['play','restart','time','commit','before','exact','after'])elements[id].disabled=false;
  configure();const stats=renderer.stats();elements.status.textContent=`Готово · 5 оригинални палитри · ${(stats.cachedBytes/1024**2).toFixed(2)} MiB кеш · без нови изображения по време на движение`;
}
elements.play.addEventListener('click',()=>playing?pause():play());
elements.restart.addEventListener('click',()=>{pause();seek(0);});
elements.time.addEventListener('input',event=>{pause();seek(event.target.value);});
elements.length.addEventListener('change',()=>{if(loaded)configure();});
elements.guides.addEventListener('change',()=>{if(loaded)paint();});
for(const[id,offset]of[['before',-.01],['exact',0],['after',.01]])elements[id].addEventListener('click',()=>{pause();seek(events[Number(elements.commit.value)].t+offset);});
// QA-only inspection hook. It does not expose or mutate production entities.
window.snakePaletteQA={seek(value){pause();seek(value);},play,pause,
  state(){return{time,duration,playing,length:Number(elements.length.value),cursor,events:events.map(e=>({t:e.t,duration:e.duration,name:e.name})),lastCommit,
    poses:snakes.map(s=>renderer.inspect(s,time)),stats:renderer.stats()};},commits(){return snapshots.map(s=>({...s,values:s.values.map(v=>({...v}))}));}};
setup().catch(error=>{pause();elements.status.textContent=`Неуспешна подготовка: ${error.message}`;elements.status.classList.add('error');console.error(error);});
requestAnimationFrame(loop);
