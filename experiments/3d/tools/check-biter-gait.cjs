// The fixture changes test placement only; movement, time, controls and render
// use the real application. Run sequentially, with no other GPU test running.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {videoColor}=require('./video-color.cjs');
const root=path.resolve(__dirname,'..'),quick=process.argv.includes('--quick'),video=process.argv.includes('--video'),previous=process.argv.includes('--previous');
const mp4Only=process.argv.includes('--mp4-only'),hedgehog=process.argv.includes('--hedgehog'),turtle=process.argv.includes('--turtle');
const playwrightPath=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chromium}=require(playwrightPath);
const base=process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/experiments/3d/';
const baseOptions=new URL(base).searchParams;
const look=process.argv.find(arg=>arg.startsWith('--look='))?.slice(7)||baseOptions.get('look')||'before';
const lighting=process.argv.find(arg=>arg.startsWith('--lighting='))?.slice(11)||baseOptions.get('lighting')||'current';
assert.ok(['before','balanced','polish'].includes(look));assert.ok(['current','contrast'].includes(lighting));
const stats=values=>{const a=values.slice().sort((a,b)=>a-b);return{samples:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};};
function motionMetrics(rows){
  const first=rows[0],last=rows.at(-1),peaks=[],bob=rows.map(r=>r.gait?.bodyY??0);
  let worldDistance=0,slip=0,stanceTravel=0,stanceSamples=0;
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i],travel=Math.hypot(b.x-a.x,b.y-a.y)*2;worldDistance+=travel;
    if(i<rows.length-1&&bob[i]>bob[i-1]&&bob[i]>=bob[i+1])peaks.push(b.realTime);
    for(let foot=0;foot<4;foot++){
      const pa=a.gait?.paws[foot],pb=b.gait?.paws[foot];
      // Sample only continuing stance, never the landing reset or idle pose.
      if(!pa?.stance||!pb?.stance||pb.phase<pa.phase||travel<1e-6)continue;
      const ax=a.rootX+a.rootScale*(pa.x*Math.cos(a.yaw)+pa.z*Math.sin(a.yaw));
      const az=a.rootZ+a.rootScale*(-pa.x*Math.sin(a.yaw)+pa.z*Math.cos(a.yaw));
      const bx=b.rootX+b.rootScale*(pb.x*Math.cos(b.yaw)+pb.z*Math.sin(b.yaw));
      const bz=b.rootZ+b.rootScale*(-pb.x*Math.sin(b.yaw)+pb.z*Math.cos(b.yaw));
      slip+=Math.hypot(bx-ax,bz-az);stanceTravel+=travel;stanceSamples++;
    }
  }
  const seconds=(last.realTime-first.realTime)/1000,gameSeconds=(last.time-first.time)/1000;
  return{cellSize:2,worldDistance,realSeconds:seconds,gameSeconds,worldPerRealSecond:worldDistance/seconds,
    worldPerGameSecond:worldDistance/gameSeconds,
    bob:{nativePeakToPeak:Math.max(...bob)-Math.min(...bob),worldPeakToPeak:(Math.max(...bob)-Math.min(...bob))*first.rootScale,
      peaks:peaks.length,peakRateHz:peaks.length>1?(peaks.length-1)*1000/(peaks.at(-1)-peaks[0]):null},
    sampledStance:{samples:stanceSamples,worldSlip:slip,worldBodyTravel:stanceTravel,slipRatio:stanceTravel?slip/stanceTravel:null,
      scope:'Consecutive continuing-stance samples; complete-stride analysis belongs to the CPU gait tests'}};
}
const fixture=`
  globalThis.__gaitFixture={
    ricochets:0,
    place(x,y,dir={x:1,y:0}){
      experimentRelease();const t=gameTimeNow();
      Object.assign(player,{x,y,prevX:x,prevY:y,moveFromX:x,moveFromY:y,moveToX:x,moveToY:y,
        moveStartedAt:t,moveDuration:95,lastMove:t,dir:{...dir},nextDir:{...dir},waitingForInput:true,
        dead:false,hideDeathSprite:false,reactionAssistRicochet:null,spawnShieldUntil:Infinity,powerModeUntil:0,
        deathStartedAt:null,respawnAt:null,pointerNavigation:null,pointerMomentum:false});
      for(const snake of snakes)snake.lastMove=Infinity;
    },
    stop(){experimentRelease();player.waitingForInput=true;},
    clearShield(){player.spawnShieldUntil=0;player.powerModeUntil=0;},
    onRicochet(){this.ricochets++;},
    ricochetScenario(){
      // Valid existing floor cells, facing a real head; only placement is a
      // fixture. The production collision code and live scheduler rebound.
      this.place(2,11);this.clearShield();this.ricochets=0;
      GameplayAssistOptions.setReactionAssistEnabled(true);
      const snake=makeSnake(3,11,1,{x:-1,y:0});
      snake.body=[3,4,5].map(x=>({x,y:11}));snake.dir={x:-1,y:0};
      snake.lastMove=Infinity;snake.color='#079ed1';snakes=[snake];
      experimentBites=[];experimentPredations=[];
    },
    dead(){this.stop();player.dead=true;player.deathStartedAt=gameTimeNow();player.respawnAt=Infinity;},
    special(powered){player.spawnShieldUntil=powered?0:Infinity;player.powerModeUntil=powered?Infinity:0;}
  };
`;
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  const results=[],errors=[];
  try{
    for(const width of quick||video?[1920]:[1920,3840])for(const model of turtle?['turtle']:hedgehog?['hedgehog']:quick||video?[previous?'crystal-v3':'crystal']:['crystal-v3','crystal']){
      const revision=turtle?'turtle':hedgehog?'hedgehog':model==='crystal'?'v4':'v3',modelLabel=turtle?'Crystal Turtle v1':hedgehog?'Neon Hedgehog v1':`Crystal Biter ${revision}`,artifact=turtle?`preview-turtle-gait-${lighting}`:hedgehog?`preview-hedgehog-gait-${lighting}`:`preview-biter-v4-gait-${revision}-${lighting}`;
      console.error(`[gait] Starting ${model} at ${width}p${video?' with video':''}`);
      const context=await browser.newContext({viewport:{width,height:width*9/16},deviceScaleFactor:1});
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer',
          'globalThis.__gaitScene=this;this.renderer=new THREE.WebGLRenderer')}));
      await page.route(url=>url.pathname.endsWith('/maze-biters-experiment.js'),route=>route.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(path.join(root,'engine/maze-biters-experiment.js'),'utf8')
          .replace('globalThis.MazeBiters3DEngine=Object.freeze({',fixture+'globalThis.MazeBiters3DEngine=Object.freeze({')
          .replace('function beginReactionAssistRicochet(p,forward){','function beginReactionAssistRicochet(p,forward){globalThis.__gaitFixture?.onRicochet();')}));
      const url=new URL(base);url.searchParams.set('v','0.3.48');url.searchParams.set('look',look);url.searchParams.set('lighting',lighting);url.searchParams.set('player',model);
      await page.goto(url.href);await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:60000});
      await page.evaluate(()=>{
        const s=__gaitScene,render=s.render.bind(s);globalThis.__gaitRows=[];globalThis.__gaitCollect=false;
        s.render=(state,dt,elapsed)=>{
          const t=performance.now();render(state,dt,elapsed);
          if(__gaitCollect){
            s.renderer.getContext().finish();
            __gaitRows.push({x:state.player.visual.x,y:state.player.visual.y,time:state.time,realTime:performance.now(),
              rootX:s.player.position.x,rootZ:s.player.position.z,yaw:s.player.rotation.y,
              rootY:s.player.position.y,rootScale:s.player.scale.x,dead:state.player.dead,
              renderMs:performance.now()-t,frameMs:elapsed*1000,gait:s.player.userData.gait?.diagnostics()??null});
          }
        };
      });
      const gait=()=>page.evaluate(()=>__gaitScene.player.userData.gait?.diagnostics()??null);
      const place=async(x,y,dir={x:1,y:0})=>{
        await page.evaluate(({x,y,dir})=>{__gaitFixture.place(x,y,dir);__gaitScene.resetCamera=true;},{x,y,dir});
        await page.waitForTimeout(100);
      };
      const speed=async value=>page.evaluate(value=>{const input=document.getElementById('speed');input.value=String(value);input.dispatchEvent(new Event('input'));},value);
      const keys=async(list,down)=>{for(const key of list)await page.keyboard[down?'down':'up'](key);};
      const record=async(list,duration=600)=>{
        await page.evaluate(()=>{__gaitRows=[];__gaitCollect=true;});await keys(list,true);await page.waitForTimeout(duration);await keys(list,false);
        return page.evaluate(()=>{__gaitCollect=false;return __gaitRows;});
      };
      const expected=turtle?'crystal-turtle-v1':hedgehog?'neon-hedgehog-v1':model==='crystal'?'crystal-biter-v4':'crystal-biter-v3';
      assert.equal(await page.evaluate(()=>__gaitScene.player.userData.modelVersion),expected);
      assert.equal(await page.evaluate(()=>__gaitScene.dust.enabled),false,'The official trail remains OFF');
      const live=[];
      for(const [label,setting,list,x,y]of video?[]:[['slow',-1,['d'],3,13],['normal',0,['d'],3,13],['fast',1,['d'],3,13],['diagonal',0,['d','s'],3,11]]){
        await speed(setting);await place(x,y);const rows=await record(list,label==='diagonal'?350:650);
        assert.ok(rows.length>8&&rows.at(-1).x>rows[0].x,'Actual keyboard motion advances the player');
        if(label==='diagonal')assert.ok(rows.at(-1).y>rows[0].y,'Diagonal motion advances both axes');
        assert.ok(rows.every(r=>r.rootY===0),'The visual gait cannot move the root or collision height');
        if(model==='crystal'||hedgehog||turtle){
          assert.ok(rows.some(r=>r.gait.activity>.1),'Actual displacement activates the gait');
          assert.ok(rows.at(-1).gait.distance>rows[0].gait.distance,'Travel, not keys alone, advances the stride');
          assert.ok(rows.some(r=>r.gait.paws.some((p,i)=>Math.abs(p.y-rows[0].gait.paws[i].y)>.002)),'Paws visibly articulate');
          assert.ok(rows.every(r=>Math.abs(r.gait.paws[0].phase-r.gait.paws[3].phase)<1e-9&&
            Math.abs(r.gait.paws[1].phase-r.gait.paws[2].phase)<1e-9),'Opposite diagonal paw pairs share their stride phase');
          assert.ok(rows.every(r=>r.gait.bodyY>=0&&r.gait.bodyY<=.02),'Body spring remains below three percent of model height');
          assert.ok(rows.every(r=>Object.values(r.gait).filter(v=>typeof v==='number').every(Number.isFinite)));
        }
        live.push({label,uiSpeed:`${2**setting}×`,engineSpeed:.5*2**setting,nominalWorldPerRealSecond:2/.095*.5*2**setting,
          from:[rows[0].x,rows[0].y],to:[rows.at(-1).x,rows.at(-1).y],motion:motionMetrics(rows),
          renderMs:stats(rows.slice(8).map(r=>r.renderMs)),frameMs:stats(rows.slice(8).map(r=>r.frameMs)),
          first:rows[0].gait,last:rows.at(-1).gait});
      }
      if(!video){
        // A queued turn goes from the bottom corridor into the opening at x=12.
        await speed(0);await place(12,13);await record(['w'],300);const turn=await record(['d'],300);
        assert.ok(turn.every(r=>Number.isFinite(r.x+r.y)));
      }
      if((model==='crystal'||hedgehog||turtle)&&!video){
        await place(9,1,{x:0,y:-1});await record(['w'],350);const blocked=await gait();
        await record(['w'],250);assert.equal((await gait()).phase,blocked.phase,'A blocked key cannot walk in place');
        assert.ok((await gait()).activity<.04,'Blocked movement settles');
        await place(3,13);await record(['d'],400);await page.evaluate(()=>__gaitFixture.stop());
        await page.waitForTimeout(600);const stopped=await gait();await page.waitForTimeout(220);
        assert.equal((await gait()).phase,stopped.phase,'Stationary settling does not add travel');
        assert.ok((await gait()).activity<.04,'Stopping settles softly to support');
        const restart=await record(['d'],300);assert.ok(restart.at(-1).gait.distance>stopped.distance);
        await page.keyboard.press('p');await page.waitForTimeout(80);const paused=await gait();
        await page.waitForTimeout(300);assert.deepEqual(await gait(),paused,'Pause freezes the entire rig');
        await page.keyboard.press('p');await record(['d'],200);
        await page.evaluate(()=>__gaitFixture.dead());await page.waitForTimeout(100);const dead=await gait();
        await page.waitForTimeout(200);assert.deepEqual(await gait(),dead,'No detached walking paws while dead');
        await place(3,13);const respawn=await gait();assert.ok(respawn.activity<.04,'Respawn begins at rest');
        await record(['d'],300);await place(17,13);assert.ok((await gait()).activity<.04,'A teleport reanchors without a stride leap');
        for(const powered of [true,false]){
          await page.evaluate(powered=>__gaitFixture.special(powered),powered);await page.waitForTimeout(70);
          assert.equal(await page.evaluate(()=>__gaitScene.player.userData.modelVersion),expected);
        }
        await page.evaluate(()=>{MazeBiters3DEngine.start();__gaitFixture.stop();});await page.waitForTimeout(150);
        assert.ok((await gait()).activity<.04,'New game resets the rig');
      }
      // Identical warmed render path, positions and zoom across both models.
      // gl.finish includes submitted GPU work; recorder mode is not a benchmark.
      console.error(`[gait] ${model} at ${width}p: ${video?'recording only; behavior and timings tested separately':'movement and lifecycle checks complete'}`);
      const bench=video?null:await page.evaluate(async()=>{
        if(!MazeBiters3DEngine.snapshot().paused)MazeBiters3DEngine.pause();
        const s=__gaitScene,{CONCEPT_MAZE,CONCEPT_SNAKES}=await import('/experiments/3d/maze-layout.mjs');
        // Both models start from precisely the same untouched arena and enemy
        // poses; their preceding lifecycle tests cannot affect this benchmark.
        const state={generation:999,started:true,paused:false,complete:false,gameOver:false,speed:.5,time:10000,
          cols:19,rows:15,maze:CONCEPT_MAZE,bites:[],predations:[],
          player:{id:1,x:3,y:13,visual:{x:3,y:13},dir:{x:1,y:0},dead:false,hidden:false,shield:false,powered:false},
          snakes:CONCEPT_SNAKES.map((o,i)=>({...o,id:i+1,dir:{x:o.body[0].x-o.body[1].x,y:o.body[0].y-o.body[1].y},motion:null,reversing:false}))};
        s.reset(state);s.resetView();
        const original=s.render;s.render=()=>{};const gl=s.renderer.getContext(),cases=[];
        for(const zoom of [1,1.5,2]){
          s.zoom=s.targetZoom=zoom;s.resetCamera=true;s.player.userData.gait?.reset();
          const samples=[];let before;
          for(let i=0;i<150;i++){
            state.time+=1000/120;state.player.visual.x=4+Math.sin(i/30)*1.5;state.player.visual.y=13;
            state.player.dir={x:Math.cos(i/30)>=0?1:-1,y:0};
            const t=performance.now();original(state,1/120,1/120);gl.finish();
            if(i===59)before={...s.renderer.info.memory};if(i>=60)samples.push(performance.now()-t);
          }
          samples.sort((a,b)=>a-b);cases.push({zoom,p50:samples[45],p95:samples[85],samples:samples.length,
            before,after:{...s.renderer.info.memory},drawCalls:s.diagnostics().drawCalls,triangles:s.diagnostics().triangles});
        }
        s.render=original;return cases;
      });
      if(bench)for(const sample of bench)assert.deepEqual(sample.after,sample.before,'Warmed motion and zoom allocate no geometry or textures');
      console.error(`[gait] ${model} at ${width}p: ${bench?'warm comparison complete':'recording demonstration'}`);
      results.push({width,model,look,lighting,live,bench,recording:video});
      if(video){
        // Native timestamped JPEG frames avoid the recorder's hardcoded 1Mbps
        // VP8 compression. This test-only stream is never used for benchmarks.
        const directory=path.join(root,'node_modules',`.biter-capture-${Date.now()}`),frames=[],writes=new Set();
        fs.mkdirSync(directory,{recursive:true});
        await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
        await page.evaluate(()=>{
          if(MazeBiters3DEngine.snapshot().paused)MazeBiters3DEngine.pause();__gaitScene.zoom=__gaitScene.targetZoom=1.5;
          const label=document.createElement('div');label.id='gait-demo-label';
          label.style.cssText='position:fixed;right:24px;bottom:24px;max-width:min(960px,calc(100vw - 48px));box-sizing:border-box;padding:12px 18px;border:1px solid #608b7c;border-radius:9px;background:#07130fe8;color:#e5ffef;font:18px/1.4 system-ui;z-index:99999;white-space:pre-line;pointer-events:none';
          document.getElementById('arena').append(label);
        });
        const label=async text=>page.evaluate(({text,modelLabel})=>{
          const s=__gaitScene,preset=document.getElementById('neonPolish').value,element=document.getElementById('gait-demo-label');
          const environment=s.lightingVariant==='contrast'?'Контрастно':'Текущо';
          element.textContent=`${modelLabel} · ${environment} осветление · look=${preset}\n`+
            `Проекция ${(s.projection*100).toFixed(0)}% · Наклон ${s.tiltDegrees.toFixed(0)}° · Изглед ${s.zoom.toFixed(1)}×\n${text}`;
          const box=element.getBoundingClientRect();
          if(box.left<0||box.top<0||box.right>innerWidth||box.bottom>innerHeight)throw new Error('Demo label exceeds the viewport');
        },{text,modelLabel});
        await speed(-1);await place(3,4);await page.evaluate(()=>__gaitFixture.clearShield());
        await label('истинско управление с клавиши\n0.5× скорост · изглед 1.5×');
        const labelVisibility=await page.evaluate(()=>{
          const label=document.getElementById('gait-demo-label'),box=label.getBoundingClientRect(),style=getComputedStyle(label);
          const x=Math.min(innerWidth-1,Math.max(0,box.x+box.width/2)),y=Math.min(innerHeight-1,Math.max(0,box.y+box.height/2));
          // Temporarily enable hit testing to prove the rendered overlay is
          // inside the fullscreen element and not covered by another panel.
          label.style.pointerEvents='auto';const hit=document.elementFromPoint(x,y);label.style.pointerEvents='none';
          return{text:label.textContent,width:box.width,height:box.height,inViewport:box.left>=0&&box.top>=0&&box.right<=innerWidth&&box.bottom<=innerHeight,
            visible:style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0,
            insideFullscreen:!document.fullscreenElement||document.fullscreenElement.contains(label),onTop:hit===label||label.contains(hit)};
        });
        assert.ok(labelVisibility.visible&&labelVisibility.inViewport&&labelVisibility.insideFullscreen&&labelVisibility.onTop&&labelVisibility.width>0&&labelVisibility.height>0&&labelVisibility.text.includes(modelLabel),
          `The speed/model overlay must be visibly rendered before recording: ${JSON.stringify(labelVisibility)}`);
        await page.screencast.start({size:{width:1920,height:1080},quality:95,onFrame:async frame=>{
          const file=`frame-${String(frames.length).padStart(5,'0')}.jpg`;frames.push({file,time:frame.timestamp});
          const write=fs.promises.writeFile(path.join(directory,file),frame.data);writes.add(write);
          await write;writes.delete(write);
        }});
        let next='d';
        const sweep=async(duration,left,right)=>{
          const end=Date.now()+duration;
          while(Date.now()<end){
            await page.keyboard.down(next);
            const deadline=await page.evaluate(remaining=>performance.now()+remaining,Math.max(1,end-Date.now()));
            await page.waitForFunction(({key,left,right,deadline})=>{
              const x=MazeBiters3DEngine.snapshot(performance.now()).player.visual.x;
              return performance.now()>=deadline||(key==='d'?x>=right:x<=left);
            },{key:next,left,right,deadline},{timeout:duration+2000,polling:'raf'});
            await page.keyboard.up(next);next=next==='d'?'a':'d';
          }
        };
        // The actual maze's long y=4 corridor offers steady body views at all
        // three speeds. Some foreground walls occlude paws; the final section
        // is separately labeled and placed in the unobstructed spawn pocket.
        for(const setting of [-1,0,1]){
          await speed(setting);await label(`истинско управление с клавиши\n${2**setting}× скорост · изглед 1.5× · дълъг коридор`);
          await sweep(3400,3.4,13.6);
        }
        await page.evaluate(()=>__gaitFixture.stop());await label('Отделен изглед на лапите · преместване в свободния участък');
        await page.waitForTimeout(250);await speed(0);await place(3,11);await page.evaluate(()=>{
          __gaitFixture.clearShield();__gaitScene.zoom=__gaitScene.targetZoom=2;__gaitScene.resetCamera=true;
        });next='d';
        await label('истинско управление с клавиши\n1× скорост · изглед 2× · лапи и контакт с пода');
        await sweep(2500,3.4,4.6);await page.evaluate(()=>__gaitFixture.stop());
        await label('Спиране · лапите се установяват, без ходене на място');await page.waitForTimeout(650);
        await page.keyboard.press('p');await label('Пауза · позата е замразена');await page.waitForTimeout(600);
        await page.keyboard.press('p');await label('Продължаване · 1× скорост · изглед 2×');await sweep(1000,3.4,4.6);
        await page.evaluate(()=>__gaitFixture.stop());
        await label('Отделен тестов старт · диагонално движение с D + S / A + W');
        await place(3,11,{x:1,y:1});await page.evaluate(()=>__gaitFixture.clearShield());
        const diagonalStart=await page.evaluate(()=>MazeBiters3DEngine.snapshot(performance.now()).player.visual);
        await keys(['d','s'],true);await page.waitForTimeout(350);await keys(['d','s'],false);
        const diagonalEnd=await page.evaluate(()=>MazeBiters3DEngine.snapshot(performance.now()).player.visual);
        assert.ok(diagonalEnd.x>diagonalStart.x+.2&&diagonalEnd.y>diagonalStart.y+.2,'Recorded real diagonal advances both axes');
        await keys(['a','w'],true);await page.waitForTimeout(350);await keys(['a','w'],false);await page.evaluate(()=>__gaitFixture.stop());
        await label('Отделен тестов старт · задържан D пред стена · лапите остават спрени');
        await place(5,11);await page.evaluate(()=>__gaitFixture.clearShield());
        const wallStart=await page.evaluate(()=>MazeBiters3DEngine.snapshot(performance.now()).player.visual);
        await page.keyboard.down('d');await page.waitForTimeout(650);await page.keyboard.up('d');
        const wallEnd=await page.evaluate(()=>MazeBiters3DEngine.snapshot(performance.now()).player.visual);
        assert.deepEqual(wallEnd,wallStart,'Recorded blocked input cannot move through the real maze wall');
        assert.ok((await gait()).activity<.04,'Recorded blocked input cannot walk in place');
        await label('Контролиран старт срещу истинска глава · реален рикошет от игровия код');
        await page.evaluate(()=>{__gaitFixture.ricochetScenario();__gaitScene.resetCamera=true;});await page.waitForTimeout(100);
        await page.keyboard.down('d');
        await page.waitForFunction(()=>__gaitFixture.ricochets>0&&MazeBiters3DEngine.snapshot().player.x<2,{},{timeout:2000,polling:'raf'});
        await page.keyboard.up('d');await page.waitForTimeout(200);
        const rebound=await page.evaluate(()=>{const s=MazeBiters3DEngine.snapshot();return{
          count:__gaitFixture.ricochets,x:s.player.x,dead:s.player.dead,predations:s.predations.length,model:__gaitScene.player.userData.modelVersion};});
        assert.ok(rebound.count>0&&!rebound.dead&&!rebound.predations,'The recorded rebound comes from real safe head contact');
        assert.equal(rebound.model,expected,'The rebound retains the selected model');
        await label('След рикошета · реално управление надолу със S');
        await page.keyboard.down('s');await page.waitForTimeout(350);await page.keyboard.up('s');await page.evaluate(()=>__gaitFixture.stop());
        await page.waitForTimeout(250);await page.screencast.stop();await Promise.all(writes);
        results.at(-1).videoScenarios={diagonal:{from:diagonalStart,to:diagonalEnd},blocked:{from:wallStart,to:wallEnd},rebound};
        assert.ok(frames.length>100,'The live recording contains enough real frames');
        const manifest=['ffconcat version 1.0'];
        for(let i=0;i<frames.length;i++){
          manifest.push(`file '${frames[i].file}'`,'option framerate 1000',
            `duration ${i<frames.length-1?Math.max(.001,(frames[i+1].time-frames[i].time)/1000):1/60}`);
        }
        manifest.push(`file '${frames.at(-1).file}'`,'option framerate 1000');
        const input=path.join(directory,'frames.ffconcat'),output=mp4Only?null:path.join(root,`${artifact}.webm`),
          mp4=path.join(root,`${artifact}.mp4`);
        fs.writeFileSync(input,manifest.join('\n')+'\n');
        if(output){
          const convert=spawnSync(process.env.MAZE_FFMPEG||'C:/ffmpeg/bin/ffmpeg.exe',
            ['-y','-safe','0','-f','concat','-i',input,'-vf',videoColor.encodeFilter,'-an','-c:v','libvpx-vp9','-crf','18','-b:v','0','-row-mt','1',
              '-deadline','good','-cpu-used','6','-pix_fmt','yuv420p','-r','60','-fps_mode','cfr',...videoColor.tags,output],{encoding:'utf8'});
          assert.equal(convert.status,0,convert.stderr);
        }
        // Encode the compatibility copy directly from the source frames,
        // rather than compounding WebM compression. Fast-start H.264 supports
        // reliable in-app/Edge playback when a VP9 decoder rejects a stream.
        const compatible=spawnSync(process.env.MAZE_FFMPEG||'C:/ffmpeg/bin/ffmpeg.exe',
          ['-y','-safe','0','-f','concat','-i',input,'-vf',videoColor.encodeFilter,'-an','-c:v','libx264','-crf','18','-preset','fast',
            '-pix_fmt','yuv420p','-r','60','-fps_mode','cfr','-movflags','+faststart',...videoColor.tags,mp4],{encoding:'utf8'});
        assert.equal(compatible.status,0,compatible.stderr);
        results.at(-1).video={path:mp4,webm:output,mp4,capturedFrames:frames.length,
          color:{range:'limited',matrix:'BT.709',primaries:'BT.709',transfer:'sRGB / IEC 61966-2-1',conversion:'JPEG BT.601 full → RGB → BT.709 limited, preserving sRGB transfer'},
          capturedSeconds:(frames.at(-1).time-frames[0].time)/1000,
          source:`Live JPEG95 frames with original elapsed timestamps; high-quality ${mp4Only?'H.264':'VP9 and H.264'} CRF18 encoding${mp4Only?'':'s'} from the same source`,labelVisibility};
      }
      await context.close();
      console.error(`[gait] Finished ${model} at ${width}p`);
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors,notes:'Short local warmed measurements; no universal FPS guarantee. Video mode is excluded from benchmark.'},null,2));
  }catch(error){
    const page=browser.contexts()[0]?.pages()[0];
    console.error(JSON.stringify({browserErrors:errors,url:page?.url(),body:page?await page.locator('body').innerText({timeout:3000}).catch(()=>null):null},null,2));
    throw error;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
