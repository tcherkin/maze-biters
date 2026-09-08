// Render actual models through deterministic eating and splitting snapshots.
// Visual leftovers must never delay or modify the engine's authoritative state.
const path=require('node:path');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/__bite-check__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;background:#060913}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto('http://127.0.0.1:8093/__bite-check__');
    const result=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {SWALLOW_MS,TAIL_SETTLE_MS,CHOMP_MS}=await import('/experiments/3d/bite-effects.mjs');
      const {snakeRoute,sampleSnake}=await import('/experiments/3d/motion.mjs');
      const {HEAD_SCALE}=await import('/experiments/3d/world.mjs');
      const scene=new DuskScene(document.getElementById('world'));
      const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14?'#':'.').join(''));
      for(const [y,from,to] of [[3,4,12],[11,3,8]]){const row=[...maze[y]];for(let x=from;x<=to;x++)row[x]='#';maze[y]=row.join('');}
      const failures=[],summaries=[];let checks=0,frames=0,sharedDisposals=0;
      const assert=(condition,message)=>{checks++;if(!condition&&failures.length<30)failures.push(message);};
      const clone=value=>JSON.parse(JSON.stringify(value));
      const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const nested of Object.values(value))freeze(nested);}return value;};
      const makeSnake=(id,body,color='#079ed1',motion=null)=>({id,body,color,motion,reversing:false,dir:body.length>1?{x:body[0].x-body[1].x,y:body[0].y-body[1].y}:{x:1,y:0}});
      const makePlayer=(x,y,dir={x:1,y:0})=>({id:1,x,y,visual:{x,y},dir,mouthOpen:true,dead:false,hidden:false,shield:false,powered:false});
      const eventTime=1000;
      function scenario(name){
        let before,after,player,index,kind,fragments;
        if(name==='split'){
          before=makeSnake(20,[{x:12,y:5},{x:11,y:5},{x:10,y:5},{x:9,y:5},{x:8,y:5},{x:8,y:6},{x:8,y:7},{x:8,y:8},{x:8,y:9}],'#c92099');
          index=4;kind='body';player=makePlayer(7.35,5);
          const prefix=makeSnake(21,before.body.slice(0,index),before.color),suffix=makeSnake(22,before.body.slice(index+1).reverse(),before.color);
          after=[prefix,suffix];fragments=[{snake:clone(prefix),sourceIndices:[0,1,2,3]},{snake:clone(suffix),sourceIndices:[8,7,6,5]}];
        }else{
          const length=name==='head-only'?2:6;
          before=makeSnake(10,Array.from({length},(_,i)=>({x:11-i,y:8})));
          index=length-1;kind='tail';player=makePlayer(before.body[index].x-.65,8);
          after=[{...clone(before),body:clone(before.body.slice(0,-1))}];
        }
        const event={id:1,time:eventTime,kind,index,snake:clone(before),playerId:1,player:{visual:{...player.visual},dir:{...player.dir}},...(fragments?{fragments}: {})};
        return {name,before,after,player,event};
      }
      function stateFor(test,elapsed,patch={}){
        return {generation:1,started:true,time:eventTime+elapsed,cols:19,rows:15,maze,player:clone(test.player),paused:false,complete:false,gameOver:false,speed:.5,snakes:clone(elapsed<0?[test.before]:test.after),bites:elapsed<0?[]:[clone(test.event)],...patch};
      }
      function render(snapshot,dt=0){
        const input=JSON.stringify(snapshot);freeze(snapshot);scene.render(snapshot,dt);frames++;
        assert(JSON.stringify(snapshot)===input,'Presentation must not mutate a gameplay snapshot');
        scene.scene.traverse(object=>{
          assert([...object.position.toArray(),...object.scale.toArray(),...object.quaternion.toArray(),...object.matrixWorld.elements].every(Number.isFinite),'A rendered transform is not finite');
          if(object.morphTargetInfluences)assert(object.morphTargetInfluences.every(value=>Number.isFinite(value)&&value>=0&&value<=1),'Endpoint morph escapes its finite range');
          if(object.isMesh&&object.geometry.morphAttributes.position){
            for(const attribute of object.geometry.morphAttributes.position)assert(attribute.count===object.geometry.attributes.position.count,'Endpoint morph and base have different vertex counts');
          }
        });
      }
      function start(test){const initial=stateFor(test,-1);scene.reset(initial);scene.playerYaw=Math.atan2(test.player.dir.x,test.player.dir.y);render(initial);}
      const pool=[...scene.bites.slots],materials=pool.map(slot=>[slot.material,slot.accentMaterial]);
      const shared=new Set();
      for(const slot of pool)slot.group.traverse(object=>{if(object.isMesh)shared.add(object.geometry);});
      for(const geometry of shared)geometry.addEventListener('dispose',()=>sharedDisposals++);
      const poolUnchanged=()=>scene.bites.slots.length===pool.length&&scene.bites.slots.every((slot,i)=>slot===pool[i]&&slot.material===materials[i][0]&&slot.accentMaterial===materials[i][1]);
      const active=()=>scene.bites.slots.filter(slot=>slot.group.visible);
      const effectPose=()=>JSON.stringify({slots:pool.map(slot=>[slot.event?.id,slot.group.visible,...slot.group.position.toArray(),...slot.group.scale.toArray()]),snakes:[...scene.snakes].map(([id,item])=>[id,...item.head.position.toArray(),...item.head.scale.toArray(),item.head.rotation.y,item.head.userData.jaw.rotation.x,item.tail.visible,...item.tail.position.toArray(),...item.tail.scale.toArray(),item.tail.morphTargetInfluences]),jaw:scene.player.userData.jaw.rotation.x});
      const quiet=()=>!active().length&&!scene.bites.transitions.size&&!scene.bites.latest;
      const expiry=Math.max(SWALLOW_MS,TAIL_SETTLE_MS,CHOMP_MS)+50;
      for(const name of ['tail','head-only','split']){
        const test=scenario(name);start(test);render(stateFor(test,0));
        assert(active().length===1,`${name}: the bitten piece must remain visible at contact`);
        const slot=active()[0],scales=[];
        assert(slot&&slot.group.scale.length()>1.5,`${name}: contact must retain a full-size bitten piece`);
        if(name==='split'){
          assert(!scene.snakes.has(test.before.id)&&test.after.every(snake=>scene.snakes.has(snake.id)),'A split must immediately adopt the engine fragment IDs');
          for(const fragment of test.event.fragments){
            const item=scene.snakes.get(fragment.snake.id),source=sampleSnake(snakeRoute(test.before,eventTime),fragment.sourceIndices[0]);
            const distance=Math.hypot(item.head.position.x-scene.layout.x(source.x),item.head.position.z-scene.layout.z(source.y));
            assert(distance<.05,'A forming fragment head must start on its original visible endpoint');
          }
        }
        for(const fraction of [.15,.5,.92,.98]){
          render(stateFor(test,SWALLOW_MS*fraction));
          assert(slot.group.visible,`${name}: swallowed geometry vanished before reaching the mouth`);
          scales.push(slot.group.scale.length());
        }
        assert(scales[3]<scales[0]*.025,`${name}: a bitten piece must become tiny before being removed`);
        assert(scales.every((value,i)=>!i||value<scales[i-1]),`${name}: the swallowed piece must continuously shrink`);
        const paused=stateFor(test,SWALLOW_MS*.98,{paused:true});render(paused);
        const frozen=effectPose();for(let frame=0;frame<10;frame++)render(paused);
        assert(effectPose()===frozen,`${name}: a paused bite or endpoint changed`);
        render(stateFor(test,expiry));
        assert(quiet(),`${name}: finished eating and endpoint transitions must be released`);
        for(let frame=0;frame<3;frame++)render(stateFor(test,expiry));
        assert(quiet(),`${name}: replaying one snapshot must not replay a bite`);
        for(const snake of test.after){
          const item=scene.snakes.get(snake.id);
          assert(Math.abs(item.head.scale.x-HEAD_SCALE)<1e-6,`${name}: a formed head did not reach its usual scale`);
          assert(snake.body.length>1?item.tail.visible&&!item.tail.morphTargetInfluences.some(value=>Math.abs(value-1)>1e-6):!item.tail.visible,`${name}: endpoint did not settle into the ordinary head/tail model`);
        }
        if(name==='head-only')assert(scene.snakes.get(10).plates.count===0&&scene.snakes.get(10).spine.geometry.drawRange.count===0,'Eating a two-cell tail must leave only the original head');
        summaries.push({name,shrinkSizes:scales,fragmentIds:test.after.map(snake=>snake.id),settled:true});
      }
      // A rear fragment can lose its new tail before its old tail has finished
      // becoming a head. A second bite must inherit that birth, not pop the
      // head to full size or restart the conversion from its first frame.
      const chained=scenario('split');
      chained.before.body=chained.before.body.slice(0,7);
      chained.after[1]=makeSnake(23,chained.before.body.slice(5).reverse(),chained.before.color);
      chained.event.snake=clone(chained.before);
      chained.event.fragments[1]={snake:clone(chained.after[1]),sourceIndices:[6,5]};
      start(chained);render(stateFor(chained,0));render(stateFor(chained,45));
      const birthSize=scene.snakes.get(23).head.scale.clone();
      assert(birthSize.x>0&&birthSize.x<HEAD_SCALE*.5,'Chained-bite check needs a partially formed head');
      const shortened={...clone(chained.after[1]),body:clone(chained.after[1].body.slice(0,-1))};
      const secondBite={id:2,time:eventTime+45,kind:'tail',index:1,snake:clone(chained.after[1]),playerId:1,player:clone(chained.event.player)};
      const remaining=[clone(chained.after[0]),shortened];
      render(stateFor(chained,45,{snakes:remaining,bites:[clone(chained.event),secondBite]}));
      const stillGrowing=scene.snakes.get(23);
      assert(stillGrowing.head.scale.distanceTo(birthSize)<1e-9,'A second tail bite popped or restarted the newborn head');
      assert(stillGrowing.formerTail.visible,'A second bite removed the still-converting former tail');
      render(stateFor(chained,75,{snakes:remaining,bites:[clone(chained.event),secondBite]}));
      const growingSize=stillGrowing.head.scale.clone(),growingJaw=stillGrowing.head.userData.jaw.rotation.x;
      const remnantScale=stillGrowing.formerTail.scale.clone(),remnantMorph=stillGrowing.formerTail.morphTargetInfluences[0];
      assert(growingSize.x>birthSize.x&&growingSize.x<HEAD_SCALE,'The inherited head birth stopped progressing');
      assert(growingJaw>0,'Growing-head capture must exercise an open mouth, not its closed rest pose');
      // The last cell is edible while its visual head is still emerging. The
      // mouthful must retain the captured partial head and remaining tail.
      const thirdBite={id:3,time:eventTime+75,kind:'head',index:0,snake:clone(shortened),playerId:1,player:clone(chained.event.player)};
      render(stateFor(chained,75,{snakes:[clone(chained.after[0])],bites:[clone(chained.event),secondBite,thirdBite]}));
      const swallowedHead=pool.find(slot=>slot.event?.id===3);
      assert(swallowedHead&&swallowedHead.head.visible,'Eating the growing head failed to preserve a mouthful');
      if(swallowedHead){
        assert(swallowedHead.head.scale.distanceTo(growingSize)<1e-9,'Eating a growing head replaced it with a full-size head');
        assert(Math.abs(swallowedHead.head.userData.jaw.rotation.x-growingJaw)<1e-9,'Eating a head reset its captured mouth pose');
        assert(swallowedHead.tail.visible&&swallowedHead.tail.scale.distanceTo(remnantScale)<1e-9&&Math.abs(swallowedHead.tail.morphTargetInfluences[0]-remnantMorph)<1e-9,'Eating a growing head discarded or changed its remaining tail shape');
      }
      render(stateFor(chained,75+expiry,{snakes:[clone(chained.after[0])],bites:[clone(chained.event),secondBite,thirdBite]}));
      assert(quiet(),'Chained fragment births and mouthfuls did not expire');
      summaries.push({name:'split-tail-head-chain',birthSize:birthSize.x,capturedHeadSize:growingSize.x,capturedJaw:growingJaw});
      // The player renderer can still ease a newly selected heading while a
      // snapshot is repeated. A paused mouthful must retain its captured target
      // instead of drifting around the changing rendered player yaw.
      const turning=scenario('tail');start(turning);render(stateFor(turning,0));
      const turnedPlayer={...clone(turning.player),dir:{x:0,y:-1}};
      render(stateFor(turning,60,{player:turnedPlayer}),1/60);
      assert(Math.abs(Math.sin(scene.playerYaw))>.1,'Paused-turn check needs an unfinished player turn');
      const turningPose=effectPose(),turnTime=scene.bites.time;
      for(let i=0;i<12;i++)render(stateFor(turning,60,{player:turnedPlayer,paused:true}),1/60);
      assert(scene.bites.time===turnTime&&effectPose()===turningPose,'A paused mouthful drifted as player yaw eased');
      // Abort an active bite via each player lifecycle boundary. Old queued
      // events must remain consumed when the player is visible again.
      for(const abort of ['hidden','dead','teleport']){
        const test=scenario('tail');start(test);render(stateFor(test,20));
        const changed=clone(test.player);
        if(abort==='teleport')changed.visual.x+=4;else changed[abort]=true;
        render(stateFor(test,30,{player:changed}));
        assert(!active().length&&!scene.bites.latest,`${abort}: stale mouthful survives a player lifecycle boundary`);
        if(abort!=='teleport')assert(scene.bites.transitions.size===1,`${abort}: a surviving snake lost its forming tail`);
        render(stateFor(test,40));assert(!active().length&&!scene.bites.latest,`${abort}: an old mouthful reappeared after recovery`);
        render(stateFor(test,expiry));assert(quiet(),`${abort}: the surviving tail did not finish forming`);
      }
      const resetTest=scenario('tail');start(resetTest);render(stateFor(resetTest,20));scene.reset(stateFor(resetTest,-1));
      assert(quiet(),'Reset did not clear all eating state');
      // Rapid repeated bites may overlap, but share one fixed pool and never
      // dispose geometry used by live snakes or by the next level.
      let peakActive=0;
      start(resetTest);
      for(let i=0;i<120;i++){
        const event=clone(resetTest.event);event.id=i+1;event.time=eventTime+i*8;
        render(stateFor(resetTest,i*8,{bites:[event]}));peakActive=Math.max(peakActive,active().length);
        assert(poolUnchanged(),'Rapid eating recreated pooled geometry or materials');
      }
      render(stateFor(resetTest,120*8+expiry,{bites:[]}));
      assert(quiet(),'Rapid eating left stale transitions behind');
      scene.reset(stateFor(resetTest,-1));
      assert(poolUnchanged()&&sharedDisposals===0,'Reset/removing fragments disposed shared snake geometry');
      // Winning freezes simulation time. The final mouthful is allowed to
      // finish in presentation time, except during a deliberate manual pause.
      const win=scenario('head-only');win.before=makeSnake(33,[{x:9,y:8}]);win.after=[];win.event={...win.event,kind:'head',index:0,snake:clone(win.before)};
      start(win);render(stateFor(win,0,{complete:true}));
      for(let i=0;i<5;i++)render(stateFor(win,0,{complete:true}),1/60);
      const advancedWinTime=scene.bites.time,advancedWinPose=effectPose();
      assert(advancedWinTime>=eventTime+40,'Winning-pause check must first advance the terminal presentation');
      const winningPause=stateFor(win,0,{complete:true,paused:true});render(winningPause);
      const winningPose=effectPose();for(let i=0;i<5;i++)render(winningPause,1/60);
      assert(scene.bites.time===advancedWinTime&&winningPose===advancedWinPose&&effectPose()===winningPose,'Manual pause must preserve the advanced winning-bite pose without rewinding');
      for(let i=0;i<100;i++)render(stateFor(win,0,{complete:true}),1/60);
      assert(quiet(),'The winning bite must finish after the simulation clock stops');
      window.__biteReview={scene,scenario,stateFor,start,render};
      return {checks,frames,failures,summaries,peakActive,poolSize:pool.length,sharedDisposals,renderer:scene.diagnostics()};
    });
    for(const name of ['tail','split'])for(const [label,time] of [['before',-1],['early',20],['mid',85],['end',260]]){
      await page.evaluate(({name,time})=>{
        const {scene,scenario,stateFor,start,render}=window.__biteReview,test=scenario(name);start(test);
        if(time>=0){render(stateFor(test,0));render(stateFor(test,time));}
        const focusX=name==='tail'?8.1:9.25,focusY=name==='tail'?8:6.8;
        const focus=scene.player.position.clone().set(scene.layout.x(focusX),.6,scene.layout.z(focusY));
        scene.camera.left=-8.1;scene.camera.right=8.1;scene.camera.top=5.4;scene.camera.bottom=-5.4;
        scene.camera.position.set(focus.x+3,focus.y+14,focus.z+15);scene.camera.lookAt(focus);scene.camera.updateProjectionMatrix();
        scene.vapor.update(stateFor(test,time).time,scene.player.position,scene.playerYaw,true,scene.camera);
        scene.renderer.render(scene.scene,scene.camera);
      },{name,time});
      await page.screenshot({path:`experiments/3d/preview-bite-${name}-${label}.png`});
    }
    console.log(JSON.stringify({errors,...result},null,2));
    if(errors.length||result.failures.length)process.exitCode=1;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
