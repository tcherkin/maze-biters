(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const failed=()=>{$('status').textContent='Прегледът не успя да стартира. Презареди страницата; основната игра не е променена.';};
  root.addEventListener?.('error',failed);
  root.addEventListener?.('unhandledrejection',failed);
  root.MazeBitersSnakeTurnStudy={async mount(adapter){
    const scenarios=root.MazeBitersTurnScenarios;
    const soft=root.MazeBitersSoftTurns.createRenderer(adapter);
    const before=$('before').getContext('2d'),after=$('after').getContext('2d');
    const backgrounds=[document.createElement('canvas'),document.createElement('canvas')];
    let state,elapsed=0,playing=true,last=0,speed=1;
    let renderedFrames=0,lastLabel=0;
    function buildBackground(canvas){
      canvas.width=960;canvas.height=720;
      const c=canvas.getContext('2d');
      c.fillStyle='#080e17';c.fillRect(0,0,960,720);
      c.scale(5,5);
      c.lineJoin='round';c.lineCap='round';
      const route=()=>{
        c.beginPath();state.path.forEach((p,i)=>i?c.lineTo((p.x+.5)*16,(p.y+.5)*16):c.moveTo((p.x+.5)*16,(p.y+.5)*16));c.closePath();
      };
      route();c.lineWidth=18;c.strokeStyle='#302453';c.stroke();
      route();c.lineWidth=16;c.strokeStyle='#10162a';c.stroke();
      route();c.lineWidth=.18;c.strokeStyle='#244f5055';c.stroke();
      c.fillStyle='#8ab9a3';c.globalAlpha=.18;
      for(let i=0;i<40;i++){const x=(i*71+13)%192,y=(i*43+11)%144;c.fillRect(x,y,.2,.2);}
      c.globalAlpha=1;
    }
    function reset(){
      state=scenarios.create($('scenario').value,adapter,{
        length:Number($('length').value),quarterTurns:Number($('rotation').value)
      });
      adapter.configureCorridor?.(state.path,state.width,state.height);
      elapsed=0;last=0;backgrounds.forEach(buildBackground);paint();
    }
    function label(){
      const head=root.MazeBitersSoftTurns.pose(state,0,state.time+elapsed,adapter,{});
      const tail=state.snake.body.length>1?root.MazeBitersSoftTurns.pose(state,state.snake.body.length-1,state.time+elapsed,adapter,{}):null;
      const active=[head.active?'глава':null,tail?.active?'опашка':null].filter(Boolean);
      $('status').textContent=`${state.snake.reversing?'Движение назад':'Движение напред'} · стъпка ${state.stepCount} · ${active.length?'преход: '+active.join(' + '):'прав участък / установена поза'} · ${playing?'в движение':'пауза'}`;
      $('phaseLabel').value=`${Math.round(elapsed/state.delay*100)}%`;
      $('phase').value=Math.round(elapsed/state.delay*1000);
    }
    function paint(){
      const t=state.time+elapsed;
      const zoom=Number($('zoom').value);
      const midpoint=body=>({
        x:(Math.min(...body.map(p=>p.x))+Math.max(...body.map(p=>p.x))+1)*8,
        y:(Math.min(...body.map(p=>p.y))+Math.max(...body.map(p=>p.y))+1)*8
      });
      const a=midpoint(state.previousBody),b=midpoint(state.snake.body);
      const phase=elapsed/state.delay,p=phase*phase*(3-2*phase);
      const w=192/zoom,h=144/zoom;
      const left=Math.max(0,Math.min(192-w,a.x+(b.x-a.x)*p-w/2));
      const top=Math.max(0,Math.min(144-h,a.y+(b.y-a.y)*p-h/2));
      for(const [i,c] of [before,after].entries()){
        c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
        c.drawImage(backgrounds[i],left*5,top*5,w*5,h*5,0,0,960,720);
        c.save();c.scale(5*zoom,5*zoom);c.translate(-left,-top);
        if(i===0) adapter.render(c,state.snake,t);else soft(c,state,t);
        c.restore();
      }
      renderedFrames++;
    }
    function setPlaying(value){playing=value;last=0;$('pause').textContent=playing?'Пауза':'Продължи';label();}
    function frame(now){
      if(!document.hidden&&playing&&state){
        const dt=last?Math.min(100,now-last):0;elapsed+=dt*speed;
        while(elapsed>=state.delay){elapsed-=state.delay;scenarios.step(state);}
        paint();if(now-lastLabel>90){label();lastLabel=now;}
      }
      last=now;requestAnimationFrame(frame);
    }
    $('pause').addEventListener('click',()=>setPlaying(!playing));
    $('next').addEventListener('click',()=>{
      setPlaying(false);elapsed=0;
      for(let i=0;i<state.path.length;i++){
        scenarios.step(state);
        const head=root.MazeBitersSoftTurns.pose(state,0,state.time+state.delay*.01,adapter,{});
        const tail=state.snake.body.length>1?root.MazeBitersSoftTurns.pose(state,state.snake.body.length-1,state.time+state.delay*.01,adapter,{}):null;
        if(head.active||tail?.active){
          elapsed=head.trim||(!head.active&&tail?.trim)?state.delay*.5:0;
          break;
        }
      }
      paint();label();
    });
    $('phase').addEventListener('input',()=>{const phase=Number($('phase').value)/1000;setPlaying(false);elapsed=phase*state.delay;paint();label();});
    for(const id of ['scenario','length','rotation']) $(id).addEventListener('change',()=>{reset();label();});
    $('speed').addEventListener('change',()=>{speed=Number($('speed').value);last=0;});
    $('zoom').addEventListener('change',paint);
    document.addEventListener('visibilitychange',()=>{last=0;});
    root.__mazeBitersTurnStudyDiagnostics=()=>({isolated:true,renderedFrames,playing,speed,scenario:state.name,step:state.stepCount,bodyLength:state.snake.body.length,phase:elapsed/state.delay});
    reset();label();requestAnimationFrame(frame);
  }};
})(globalThis);
