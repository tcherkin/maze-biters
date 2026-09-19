// Controlled placements on the unchanged maze; the live scheduler, keyboard,
// contact rules and rendered animation remain production code. Run alone on GPU.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {videoColor}=require('./video-color.cjs');
const root=path.resolve(__dirname,'..'),base=process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/experiments/3d/';
const modes=process.argv.includes('--before')?['v50']:process.argv.includes('--after')?['v53']:['v53'];
const fixture=`
  globalThis.__dragonVideo={
    ricochets:0,
    place(x,y,dir={x:1,y:0}){
      if(isWall(x,y))throw Error('Video placement is inside a wall');
      experimentRelease();const t=gameTimeNow();
      Object.assign(player,{x,y,prevX:x,prevY:y,dir:{...dir},nextDir:{...dir},waitingForInput:true,
        lastMove:t,dead:false,hideDeathSprite:false,reactionAssistRicochet:null,spawnShieldUntil:0,
        powerModeUntil:0,deathStartedAt:null,respawnAt:null,pointerNavigation:null,pointerMomentum:false});
      resetPlayerVisualPosition(player);snakes=[];eggs=[];fruits=[];hunters=[];scorpion=null;
      experimentBites=[];experimentPredations=[];experimentGeneration++;
      GameplayAssistOptions.setReactionAssistEnabled(false);
      // Keep a distant stationary inhabitant so the normal completion rule
      // cannot finish a controlled movement chapter prematurely.
      this.snake([{x:17,y:1},{x:16,y:1},{x:15,y:1}],{x:1,y:0},'#e4a71a');
    },
    snake(body,dir,color='#079ed1'){
      if(body.some(p=>isWall(p.x,p.y)))throw Error('Video snake placement is inside a wall');
      const s=makeSnake(body[0].x,body[0].y,1,dir);s.body=experimentCopy(body);
      s.dir={...dir};s.color=color;s.lastMove=Infinity;snakes.push(s);return s;
    },
    stop(){experimentRelease();player.waitingForInput=true;},
    ricochet(){
      this.place(3,11);this.ricochets=0;GameplayAssistOptions.setReactionAssistEnabled(true);
      this.snake([{x:4,y:11},{x:5,y:11},{x:5,y:12}],{x:-1,y:0});
    },
    tail(){this.place(7,4);this.snake([{x:11,y:4},{x:10,y:4},{x:9,y:4}],{x:1,y:0},'#c92099');},
    split(){this.place(3,6);this.snake([8,7,6,5,4].map(y=>({x:5,y})),{x:0,y:1},'#079ed1');}
  };
`;
async function main(mode){
  const model=mode==='v50'?'dragon-v2':'dragon',expectedIdentity=mode==='v50'?'crystal-dragon-v2':'crystal-dragon-v5';
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  const errors=[],chapters=[],frames=[],writes=new Set();
  const directory=path.join(root,'node_modules',`.dragon-capture-${Date.now()}`);fs.mkdirSync(directory,{recursive:true});
  try{
    const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',
      body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer',
        'globalThis.__dragonVideoScene=this;this.renderer=new THREE.WebGLRenderer')}));
    await page.route(url=>url.pathname.endsWith('/maze-biters-experiment.js'),route=>route.fulfill({contentType:'text/javascript',
      body:fs.readFileSync(path.join(root,'engine/maze-biters-experiment.js'),'utf8')
        .replace('globalThis.MazeBiters3DEngine=Object.freeze({',fixture+'globalThis.MazeBiters3DEngine=Object.freeze({')
        .replace('function beginReactionAssistRicochet(p,forward){','function beginReactionAssistRicochet(p,forward){globalThis.__dragonVideo.ricochets++;')}));
    const url=new URL(base);url.search='?v=0.3.53&look=balanced&player='+model;
    await page.goto(url.href);await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:60000});
    await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
    await page.evaluate(mode=>{
      const s=__dragonVideoScene;s.zoom=s.targetZoom=1.5;s.projection=s.targetProjection=.5;s.tiltDegrees=s.targetTiltDegrees=55;
      globalThis.__dragonVideoVersion=mode==='v50'?'Преди · v0.3.50':'Сега · v0.3.53';
      const speed=document.getElementById('speed');speed.step='any';speed.value='-1';speed.dispatchEvent(new Event('input'));
      const label=document.createElement('div');label.id='dragon-video-label';
      label.style.cssText='position:fixed;right:24px;bottom:24px;max-width:min(890px,calc(100vw - 48px));box-sizing:border-box;padding:13px 18px;border:1px solid #447d65;border-radius:12px;background:#07130ff0;color:#ebfff2;font:18px/1.4 system-ui;z-index:99999;white-space:pre-line;pointer-events:none';
      document.getElementById('arena').append(label);
      globalThis.__dragonVideoMetrics=[];globalThis.__dragonVideoChapter=-1;
      globalThis.__dragonVideoSamples=[];
      // Sample actual joint geometry, not an animation amplitude parameter.
      // Baseline toes are rigid meshes; v0.3.53 exposes stable articulated tips.
      const tips=s.player.userData.paddleRig.paws.map(paw=>{
        let tip=paw.tip,local=paw.pivot.position.clone().set(0,0,0);
        if(!tip){tip=paw.pivot.children.find(child=>child.isMesh&&/toes/i.test(child.name));
          if(!tip)throw Error('Baseline toe geometry missing');
          tip.geometry.computeBoundingBox();tip.geometry.boundingBox.getCenter(local);}
        return{tip,local,pivot:paw.pivot,point:local.clone(),shoulder:local.clone()};
      });
      const render=s.render.bind(s);
      s.render=(state,dt,elapsed)=>{
        render(state,dt,elapsed);const index=globalThis.__dragonVideoChapter;
        if(index<0)return;
        const d=s.player.userData.dragonMotion?.diagnostics();if(!d)return;
        const paddle=s.player.userData.dragonPaddling?.diagnostics();
        const metrics=__dragonVideoMetrics[index]??={maxCadence:0,maxActivity:0,maxPaddleStep:0,previousPaw:null,frames:0,curvedFrames:0,selfOverlapFrames:0,maxJointAngle:0,issues:{},unexpectedSamples:[]};
        if(paddle){metrics.maxCadence=Math.max(metrics.maxCadence,paddle.cadence);metrics.maxActivity=Math.max(metrics.maxActivity,paddle.activity);
          const paw=s.player.userData.paws[0].rotation.x;if(metrics.previousPaw!==null)metrics.maxPaddleStep=Math.max(metrics.maxPaddleStep,Math.abs(paw-metrics.previousPaw));metrics.previousPaw=paw;}
        const offsets=tips.map(({tip,local,pivot,point,shoulder})=>{
          point.copy(local);tip.localToWorld(point);pivot.getWorldPosition(shoulder);
          point.project(s.camera);shoulder.project(s.camera);
          return[(point.x-shoulder.x)*innerWidth/2,(shoulder.y-point.y)*innerHeight/2];
        });
        __dragonVideoSamples.push({realTime:performance.now(),gameTime:state.time,chapter:index,
          phase:paddle?.phase,activity:paddle?.activity,cadence:paddle?.cadence,
          visual:[state.player.visual.x,state.player.visual.y],direction:[state.player.dir.x,state.player.dir.y],
          tipOffsetsPixels:offsets});
        metrics.frames++;if(d.maxJointAngle>.1)metrics.curvedFrames++;if(d.selfOverlap)metrics.selfOverlapFrames++;
        metrics.maxJointAngle=Math.max(metrics.maxJointAngle,d.maxJointAngle);
        for(const issue of d.issues)metrics.issues[issue]=(metrics.issues[issue]||0)+1;
        const unexpected=d.issues.filter(issue=>issue!=='self-overlap'&&issue!=='tight-bend');
        if(unexpected.length&&metrics.unexpectedSamples.length<8)metrics.unexpectedSamples.push({
          time:state.time,visual:{...state.player.visual},logical:{x:state.player.x,y:state.player.y},
          yaw:s.player.rotation.y,issues:unexpected,history:s.player.userData.dragonMotion.history.map(p=>({...p}))});
      };
    },mode);
    const label=async text=>page.evaluate(text=>{
      const s=__dragonVideoScene,e=document.getElementById('dragon-video-label');
      e.textContent=__dragonVideoVersion+' · движение на дракона\n'+
        `Проекция ${(s.projection*100).toFixed(0)}% · Наклон ${s.tiltDegrees.toFixed(0)}° · Изглед ${s.zoom.toFixed(1)}×\n${text}`;
      const r=e.getBoundingClientRect();if(r.right>innerWidth||r.bottom>innerHeight||r.left<0||r.top<0)throw Error('Video label exceeds viewport');
    },text);
    const state=()=>page.evaluate(()=>{const s=MazeBiters3DEngine.snapshot();return{
      time:s.time,generation:s.generation,player:s.player,bites:s.bites.map(b=>({kind:b.kind,index:b.index,fragments:b.fragments?.map(f=>f.sourceIndices)})),
      predations:s.predations.length,route:__dragonVideoScene.player.userData.dragonMotion?.diagnostics?.()??null};});
    const stop=async()=>{await page.evaluate(()=>__dragonVideo.stop());
      await page.waitForFunction(()=>{const p=MazeBiters3DEngine.snapshot().player;return Math.hypot(p.visual.x-p.x,p.visual.y-p.y)<.001;},{},{timeout:2500,polling:'raf'});};
    const place=async(x,y,dir={x:1,y:0})=>{await page.evaluate(({x,y,dir})=>__dragonVideo.place(x,y,dir),{x,y,dir});await page.waitForTimeout(180);};
    const leg=async(keys,x,y)=>{
      for(const key of keys)await page.keyboard.down(key);
      await page.waitForFunction(({x,y})=>{const p=MazeBiters3DEngine.snapshot().player;return p.x===x&&p.y===y;},{x,y},{timeout:7000,polling:'raf'});
      for(const key of keys)await page.keyboard.up(key);await stop();return state();
    };
    const setSpeed=async multiplier=>{
      const actual=await page.evaluate(value=>{const speed=document.getElementById('speed');
        speed.value=String(Math.log2(value));speed.dispatchEvent(new Event('input'));
        return MazeBiters3DEngine.snapshot().speed;},multiplier);
      assert.ok(Math.abs(actual-.5*multiplier)<1e-9,'The real input handler must set the requested gameplay speed');
    };
    const chapter=async(id,title,work,minimumMs=0)=>{
      await label(title);await page.evaluate(index=>globalThis.__dragonVideoChapter=index,chapters.length);
      const startFrame=frames.length,started=Date.now(),before=await state();await work();
      if(Date.now()-started<minimumMs)await page.waitForTimeout(minimumMs-(Date.now()-started));
      chapters.push({id,title,startFrame,endFrame:frames.length,elapsedMs:Date.now()-started,before,after:await state()});
    };
    await place(5,4);await label('Контролиран старт на истинския лабиринт\nЖиво управление с клавиши · скорост 0.5×');
    const identity=await page.evaluate(()=>__dragonVideoScene.player.userData.modelVersion);assert.equal(identity,expectedIdentity);
    const labelVisibility=await page.evaluate(()=>{const e=document.getElementById('dragon-video-label'),r=e.getBoundingClientRect();
      e.style.pointerEvents='auto';const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);e.style.pointerEvents='none';
      return{visible:getComputedStyle(e).visibility==='visible',insideFullscreen:!document.fullscreenElement||document.fullscreenElement.contains(e),onTop:e===top||e.contains(top)};});
    assert.ok(Object.values(labelVisibility).every(Boolean));
    await page.screencast.start({size:{width:1920,height:1080},quality:95,onFrame:async frame=>{
      const file=`frame-${String(frames.length).padStart(5,'0')}.jpg`;frames.push({file,time:frame.timestamp});
      const write=fs.promises.writeFile(path.join(directory,file),frame.data);writes.add(write);await write;writes.delete(write);
    }});
    for(const multiplier of [.5,1,1.5,2]){
      await chapter('speed-'+multiplier,`Надясно · ${multiplier}× · потегляне и спиране\nЕднакъв маршрут в двата записа · реални клавиши`,async()=>{
        await setSpeed(multiplier);await place(3,4);await page.waitForTimeout(220);
        const a=await state(),b=await leg(['d'],14,4);assert.equal(b.player.x-a.player.x,11);
        await page.waitForTimeout(600);
        const settled=await page.evaluate(()=>__dragonVideoScene.player.userData.dragonPaddling.diagnostics());
        assert.ok(settled.activity<.06,'Paws retract after stopping at every game speed');
      });
    }
    await setSpeed(1);
    await chapter('west','Наляво · 1×\nСъщият коридор в обратна посока',async()=>{
      await place(14,4,{x:-1,y:0});await leg(['a'],3,4);await page.waitForTimeout(500);
    },3000);
    await chapter('south','Надолу · 1×\nЛапите се виждат отпред',async()=>{
      await place(10,4,{x:0,y:1});await leg(['s'],10,10);await page.waitForTimeout(450);
    },1900);
    await chapter('north','Нагоре · 1×\nЛапите се виждат отзад',async()=>{
      await place(10,10,{x:0,y:-1});await leg(['w'],10,4);await page.waitForTimeout(450);
    },1900);
    await chapter('diagonal','Диагонал · 1× · D + S\nЕднаква скорост по правата и диагонала',async()=>{
      await place(3,11,{x:1,y:1});const a=await state(),b=await leg(['d','s'],5,13);
      assert.equal(b.player.x-a.player.x,2);assert.equal(b.player.y-a.player.y,2);
    },1300);
    await chapter('turns','Два завоя на 90° · 1×\nD → S → D · непрекъснато движение на лапите',async()=>{
      await place(7,4);await leg(['d'],10,4);await leg(['s'],10,8);await leg(['d'],12,8);
    },2400);
    await chapter('reverse','Незабавно обръщане D → A · 1×\nКраткото застъпване на тялото е разрешено',async()=>{
      await place(7,4);await leg(['d'],9,4);await leg(['a'],7,4);
    },1500);
    await chapter('speed-changes','Смяна на скоростта в движение\n0.5× → 2× → 1× · без ново подреждане',async()=>{
      await setSpeed(.5);await place(3,4);await page.keyboard.down('d');
      for(const [x,multiplier]of [[6,2],[12,1]]){
        await page.waitForFunction(x=>MazeBiters3DEngine.snapshot().player.x>=x,x,{timeout:7000,polling:'raf'});
        await setSpeed(multiplier);
      }
      await page.waitForFunction(()=>MazeBiters3DEngine.snapshot().player.x>=14,null,{timeout:7000,polling:'raf'});
      await page.keyboard.up('d');await stop();await page.waitForTimeout(550);
    },3000);
    await chapter('bite','Отхапване от опашка · 0.5×\nИстинска захапка с едновременно движение на лапите',async()=>{
      await setSpeed(.5);
      await page.evaluate(()=>__dragonVideo.tail());await page.waitForTimeout(150);await leg(['d'],9,4);
      const b=await state();assert.equal(b.bites[0]?.kind,'tail');assert.equal(b.player.score>=25,true);
    },1800);
    await page.screencast.stop();await Promise.all(writes);assert.ok(frames.length>200);assert.deepEqual(errors,[]);
    const motionMetrics=await page.evaluate(()=>__dragonVideoMetrics);
    const unexpectedMotion=motionMetrics.flatMap((metrics,chapter)=>metrics.unexpectedSamples.map(sample=>({chapter,...sample})));
    assert.ok(motionMetrics[chapters.findIndex(c=>c.id==='turns')].curvedFrames>0,'The two90-degree turns must visibly deform the dragon body');
    assert.ok(motionMetrics[chapters.findIndex(c=>c.id==='reverse')].selfOverlapFrames>0,'The recorded instant reversal must show the approved temporary fold');
    for(const metrics of motionMetrics.slice(0,4)){assert.ok(metrics.maxCadence<=8);assert.ok(metrics.maxActivity>.94);}
    const samples=await page.evaluate(()=>__dragonVideoSamples);
    const toeMotion=chapters.map((chapter,index)=>{
      const active=samples.filter(sample=>sample.chapter===index&&sample.activity>.8);
      return{id:chapter.id,activeSamples:active.length,paws:[0,1,2,3].map(paw=>{
        if(!active.length)return null;
        const xs=active.map(sample=>sample.tipOffsetsPixels[paw][0]),ys=active.map(sample=>sample.tipOffsetsPixels[paw][1]);
        const width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys);
        return{width,height,diagonal:Math.hypot(width,height)};
      })};
    });
    const duration=(frames.at(-1).time-frames[0].time)/1000;assert.ok(duration>=25&&duration<=45,`Expected25–45s live comparison, got${duration}`);
    for(const chapter of chapters){
      chapter.start=(frames[Math.min(chapter.startFrame,frames.length-1)].time-frames[0].time)/1000;
      chapter.end=(frames[Math.min(chapter.endFrame,frames.length-1)].time-frames[0].time)/1000;
    }
    const manifest=['ffconcat version 1.0'];for(let i=0;i<frames.length;i++)manifest.push(`file '${frames[i].file}'`,'option framerate 1000',
      `duration ${i<frames.length-1?Math.max(.001,(frames[i+1].time-frames[i].time)/1000):1/60}`);
    manifest.push(`file '${frames.at(-1).file}'`,'option framerate 1000');const input=path.join(directory,'frames.ffconcat');fs.writeFileSync(input,manifest.join('\n')+'\n');
    // Close the GPU browser before the CPU encoder. Never synthesize animation
    // frames; CFR60 repeats captured frames according to their real timestamps.
    await context.close();await browser.close();
    const output=path.join(root,`preview-dragon-motion-${mode}.mp4`),pendingOutput=path.join(directory,'verified-gameplay.mp4');
    const encoded=spawnSync(process.env.MAZE_FFMPEG||'C:/ffmpeg/bin/ffmpeg.exe',
      ['-y','-safe','0','-f','concat','-i',input,'-vf',videoColor.encodeFilter,'-an','-c:v','libx264','-crf','18','-preset','fast',
        '-pix_fmt','yuv420p','-r','60','-fps_mode','cfr','-movflags','+faststart',...videoColor.tags,pendingOutput],{encoding:'utf8'});
    assert.equal(encoded.status,0,encoded.stderr);
    const probe=spawnSync(process.env.MAZE_FFPROBE||'C:/ffmpeg/bin/ffprobe.exe',
      ['-v','error','-select_streams','v:0','-show_entries','stream=width,height,duration,r_frame_rate','-of','json',pendingOutput],{encoding:'utf8'});
    assert.equal(probe.status,0,probe.stderr);const metadata=JSON.parse(probe.stdout).streams[0];
    assert.equal(metadata.width,1920);assert.equal(metadata.height,1080);assert.equal(metadata.r_frame_rate,'60/1');
    assert.ok(Number(metadata.duration)>=20&&Number(metadata.duration)<=45);
    // Replace a prior successful recording only after capture, assertions,
    // encoding and the actual output metadata all passed.
    fs.renameSync(pendingOutput,output);
    const sourceFiles=mode==='v50'?['models/crystal-dragon-v2.mjs','dragon-motion-v2.mjs','dragon-paddling-v1.mjs']:['models/crystal-dragon.mjs','dragon-motion.mjs','dragon-paddling.mjs'];
    const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
    const report={url:url.href,identity,output,metadata,capturedFrames:frames.length,capturedSeconds:duration,chapters,motionMetrics,unexpectedMotion,sourceHashes,toeMotion,
      camera:{projection:.5,zoom:1.5,tiltDegrees:55,viewport:[1920,1080],dpr:1,look:'balanced'},
      frameClock:{first:frames[0].time,last:frames.at(-1).time,units:'milliseconds; original screencast timestamps'},
      samples,
      motionClearanceVerified:unexpectedMotion.length===0,labelVisibility,errors,
      source:'Live keyboard on unchanged maze; same labeled placements, routes and camera for both versions. Only slider step=any in the fixture permits exact1.5× through the original handler. Original JPEG95 timestamps, H.264 CRF18 CFR60. No time stretching, no audio. Projected toe-to-shoulder offsets are geometry measurements, not proof of visible unoccluded pixels.',
      color:'JPEG BT.601 full → RGB → BT.709 limited; original sRGB transfer preserved'};
    fs.writeFileSync(path.join(root,`preview-dragon-motion-${mode}.json`),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({...report,samples:`${samples.length} live render samples in JSON`,chapters:chapters.map(c=>({id:c.id,start:c.start,end:c.end}))},null,2));
  }finally{await browser.close();}
}
(async()=>{for(const mode of modes)await main(mode);})().catch(error=>{console.error(error);process.exitCode=1;});
