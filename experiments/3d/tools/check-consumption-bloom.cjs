// Staged bite light, colored vapor and suction: actual 3D assets, deterministic
// game time, and the same snapshots as physical swallowing and splitting.
const path=require('node:path');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/__bloom-check__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;background:#060913}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto('http://127.0.0.1:8093/__bloom-check__');
    const result=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {BLOOM_MS,FLASH_MS,CLOUD_START_MS,CLOUD_END_MS,SUCTION_START_MS,SUCTION_TRAVEL_MS}=await import('/experiments/3d/consumption-bloom.mjs');
      const {SWALLOW_MS,TAIL_SETTLE_MS,CHOMP_MS}=await import('/experiments/3d/bite-effects.mjs');
      const {snakeRoute,sampleSnake}=await import('/experiments/3d/motion.mjs');
      const scene=new DuskScene(document.getElementById('world'));
      const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14?'#':'.').join(''));
      for(const [y,from,to] of [[2,4,12],[12,3,8]]){const row=[...maze[y]];for(let x=from;x<=to;x++)row[x]='#';maze[y]=row.join('');}
      const failures=[],reviews=[];let checks=0,frames=0;
      const assert=(condition,message)=>{checks++;if(!condition&&failures.length<30)failures.push(message);};
      const clone=value=>JSON.parse(JSON.stringify(value));
      const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const nested of Object.values(value))freeze(nested);}return value;};
      const makeSnake=(id,body,color)=>({id,body,color,motion:null,reversing:false,dir:body.length>1?{x:body[0].x-body[1].x,y:body[0].y-body[1].y}:{x:1,y:0}});
      const makePlayer=(x,y,dir)=>({id:1,x,y,visual:{x,y},dir,mouthOpen:true,dead:false,hidden:false,shield:false,powered:false});
      const eventTime=1000;
      function scenario(kind='tail',color='#079ed1',dir={x:1,y:0}){
        let before,after,index,player,fragments;
        if(kind==='body'){
          before=makeSnake(20,[{x:12,y:5},{x:11,y:5},{x:10,y:5},{x:9,y:5},{x:8,y:5},{x:8,y:6},{x:8,y:7},{x:8,y:8},{x:8,y:9}],color);index=4;player=makePlayer(7.35,5,{x:1,y:0});
          const prefix=makeSnake(21,before.body.slice(0,index),color),suffix=makeSnake(22,before.body.slice(index+1).reverse(),color);
          after=[prefix,suffix];fragments=[{snake:clone(prefix),sourceIndices:[0,1,2,3]},{snake:clone(suffix),sourceIndices:[8,7,6,5]}];
        }else{
          const count=kind==='head'?1:6;
          before=makeSnake(10,Array.from({length:count},(_,i)=>({x:8+dir.x*(2-i),y:7+dir.y*(2-i)})),color);before.dir={...dir};
          before.motion={from:before.body.map(p=>({x:p.x-dir.x,y:p.y-dir.y})),to:clone(before.body),started:eventTime-60,duration:180};
          index=count-1;
          const p=sampleSnake(snakeRoute(before,eventTime),index),sign=kind==='head'?1:-1;
          player=makePlayer(p.x+dir.x*.85*sign,p.y+dir.y*.85*sign,{x:dir.x*-sign,y:dir.y*-sign});
          after=kind==='head'?[]:[{...clone(before),body:clone(before.body.slice(0,-1)),motion:{...clone(before.motion),from:clone(before.motion.from.slice(0,-1)),to:clone(before.motion.to.slice(0,-1))}}];
        }
        const event={id:1,time:eventTime,kind,index,snake:clone(before),playerId:1,player:{visual:{...player.visual},dir:{...player.dir}},...(fragments?{fragments}:{})};
        return {kind,before,after,index,player,event};
      }
      function stateFor(test,elapsed,patch={}){
        return {generation:1,started:true,time:eventTime+elapsed,cols:19,rows:15,maze,player:clone(test.player),paused:false,complete:false,gameOver:false,speed:.5,snakes:clone(elapsed<0?[test.before]:test.after),bites:elapsed<0?[]:[clone(test.event)],predations:[],...patch};
      }
      const bloom=scene.bites.bloom,pool=[...bloom.slots],predatorBloom=scene.predation.bloom,predatorSlot=predatorBloom.slots[0];
      function render(snapshot,dt=0){
        const input=JSON.stringify(snapshot);freeze(snapshot);scene.render(snapshot,dt);frames++;
        assert(JSON.stringify(snapshot)===input,'Consumption bloom changed an authoritative snapshot');
        for(const effect of [bloom,predatorBloom])effect.group.traverse(object=>{
          assert([...object.position.toArray(),...object.scale.toArray(),...object.quaternion.toArray()].every(Number.isFinite),'A bloom transform is not finite');
          if(object.material)assert(Number.isFinite(object.material.opacity)&&object.material.opacity>=0&&object.material.opacity<=1,'Bloom opacity escaped its finite range');
        });
      }
      function start(test){const initial=stateFor(test,-1);scene.reset(initial);scene.playerYaw=Math.atan2(test.player.dir.x,test.player.dir.y);render(initial);}
      const visible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return !object.material||object.material.opacity>.001;};
      const active=()=>pool.filter(slot=>slot.event&&visible(slot.group));
      const pose=(effect=bloom)=>{const values=[];effect.group.traverse(object=>values.push([object.visible,...object.position.toArray(),...object.scale.toArray(),...object.quaternion.toArray(),object.material?.opacity,object.material?.rotation]));return JSON.stringify(values);};
      const resources=[];for(const effect of [bloom,predatorBloom])effect.group.traverse(object=>{if(object.material)resources.push([object,object.geometry,object.material,object.material.map]);});
      const stable=()=>bloom.slots.length===pool.length&&bloom.slots.every((slot,i)=>slot===pool[i])&&predatorBloom.slots.length===1&&predatorBloom.slots[0]===predatorSlot&&resources.every(([object,geometry,material,map])=>object.geometry===geometry&&object.material===material&&object.material.map===map);
      assert(pool.length===12&&pool.every(slot=>slot.clouds.length===2&&slot.motes.length===4),'Bloom should use the bounded cloud/mote pool');
      assert(SWALLOW_MS<CHOMP_MS&&CHOMP_MS<BLOOM_MS,'Bloom must outlast the separate physical mouthful and chomp');
      for(const [i,color] of ['#cf3430','#e4a71a','#079ed1','#c92099'].entries()){
        const dir=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}][i],test=scenario('tail',color,dir);start(test);render(stateFor(test,30));
        const slot=active()[0],source=sampleSnake(snakeRoute(test.before,eventTime),test.index);
        assert(Boolean(slot),'A bite did not start the consumption bloom');if(!slot)continue;
        const sourceError=Math.hypot(slot.origin.x-scene.layout.x(source.x),slot.origin.z-scene.layout.z(source.y));
        assert(sourceError<1e-8,'Bloom originated at a grid cell rather than the swallowed segment’s smoothed pose');
        assert(Math.hypot(source.x-test.before.body[test.index].x,source.y-test.before.body[test.index].y)>.1,'Source check must exercise an interpolated moving endpoint');
        assert(visible(slot.flash),'Initial bite flash was missing');
        const origin=slot.origin.clone();render(stateFor(test,110));
        assert(!visible(slot.flash)&&slot.clouds.some(visible),'Flash did not give way to colored vapor');
        assert(slot.motes.some(mote=>visible(mote.group)),'Suction did not create small glowing 3D motes');
        assert(slot.origin.distanceTo(origin)<1e-9,'Bloom source drifted with the surviving snake');
        const colorExpected=new THREE.Color(color);
        assert(slot.clouds.every(cloud=>cloud.material.color.distanceTo?cloud.material.color.distanceTo(colorExpected)<1e-9:cloud.material.color.getHex()===colorExpected.getHex()),'Vapor changed the eaten snake’s color');
        const startingDistances=slot.motes.map(mote=>mote.group.getWorldPosition(new THREE.Vector3()).distanceTo(scene.bites.mouth));
        render(stateFor(test,240));
        assert(!scene.bites.slots.some(s=>s.group.visible)&&!scene.bites.latest,'Physical swallowing or jaw override continued into the late light phase');
        assert(active().length===1&&slot.motes.some(mote=>visible(mote.group)),'Late suction disappeared with the physical swallowed piece');
        const lateDistances=slot.motes.map(mote=>mote.group.getWorldPosition(new THREE.Vector3()).distanceTo(scene.bites.mouth));
        assert(lateDistances.every((distance,index)=>distance<startingDistances[index]),'Motes did not converge toward the player’s mouth');
        render(stateFor(test,BLOOM_MS+1));assert(!active().length,'Consumption bloom did not expire');
        for(let repeat=0;repeat<3;repeat++)render(stateFor(test,BLOOM_MS+1));
        assert(!active().length,'Repeated history replayed the finished bloom');
        reviews.push({color,dir,sourceError,startingDistances,lateDistances});
      }
      for(const kind of ['body','head']){
        const test=scenario(kind,kind==='body'?'#c92099':'#e4a71a');start(test);render(stateFor(test,30));
        const slot=active()[0],source=sampleSnake(snakeRoute(test.before,eventTime),test.index);
        assert(Boolean(slot)&&Math.hypot(slot.origin.x-scene.layout.x(source.x),slot.origin.z-scene.layout.z(source.y))<1e-8,`${kind}: wrong bloom source`);
        render(stateFor(test,240));assert(active().length===1&&!scene.bites.slots.some(s=>s.group.visible),`${kind}: bloom did not survive the physical piece`);
      }
      // Light trajectories use game time and the cached mouth target, even if
      // render-time camera or player-yaw easing is still active during pause.
      const turning=scenario();start(turning);render(stateFor(turning,0));
      const turned={...clone(turning.player),dir:{x:0,y:1}};
      render(stateFor(turning,110,{player:turned}),1/60);
      const frozen=pose(),frozenTime=scene.bites.time;scene.targetTiltDegrees=25;scene.targetZoom=1.9;
      for(let i=0;i<12;i++)render(stateFor(turning,110,{player:turned,paused:true}),1/60);
      assert(scene.bites.time===frozenTime&&pose()===frozen,'Paused bloom moved with changing player yaw or camera');
      scene.targetTiltDegrees=scene.tiltDegrees=45;scene.targetZoom=scene.zoom=1.5;
      for(const reason of ['dead','hidden','teleport']){
        const test=scenario('body','#c92099');start(test);render(stateFor(test,40));
        const changed=clone(test.player);if(reason==='teleport')changed.visual.x+=4;else changed[reason]=true;
        render(stateFor(test,45,{player:changed}));
        assert(!active().length,`${reason}: left a stale colored bloom`);
        if(reason!=='teleport')assert(scene.bites.transitions.size>0,`${reason}: erased living snakes’ endpoint transitions`);
        render(stateFor(test,50));assert(!active().length,`${reason}: resumed a cleared bloom from old history`);
        render(stateFor(test,TAIL_SETTLE_MS+1));assert(!scene.bites.transitions.size,'Surviving endpoint transitions did not finish');
      }
      const resetTest=scenario();start(resetTest);render(stateFor(resetTest,40));scene.reset(stateFor(resetTest,-1));
      assert(!active().length&&stable(),'Reset retained a bloom or recreated its pooled resources');
      // First seeing the last bite after the physical animation has ended must
      // still display its remaining light. Victory stops the simulation clock.
      const win=scenario('head','#e4a71a');start(win);render(stateFor(win,240,{complete:true}));
      assert(active().length===1&&!scene.bites.slots.some(s=>s.group.visible),'Late first frame lost the final bite’s remaining light');
      const terminalPose=pose(),terminalTime=scene.bites.time;
      for(let i=0;i<8;i++)render(stateFor(win,240,{complete:true,paused:true}),1/60);
      assert(pose()===terminalPose&&scene.bites.time===terminalTime,'Pausing late victory bloom changed its advanced pose');
      for(let i=0;i<100;i++)render(stateFor(win,240,{complete:true}),1/60);
      assert(!active().length,'Final victory bloom did not finish after the simulation stopped');
      const finished=pose();for(let i=0;i<10;i++)render(stateFor(win,240,{complete:true}),1/60);
      assert(pose()===finished,'Completed victory history replayed or moved the bloom');
      // The same sequence accompanies the player being eaten: its color comes
      // from the green victim and its motes converge on the actual snake mouth.
      function predationScenario(){
        const attacker=makeSnake(43,[{x:9,y:7},{x:8,y:7},{x:7,y:7},{x:6,y:7}],'#c92099');
        attacker.motion={from:attacker.body.map(p=>({x:p.x-1,y:p.y})),to:clone(attacker.body),started:eventTime-60,duration:180};
        const player={...makePlayer(9.5,7,{x:-1,y:0}),deathStartedAt:null,respawnAt:null};
        const event={id:1,time:eventTime,snake:clone(attacker),playerId:1,player:{id:1,visual:{...player.visual},dir:{...player.dir},mouthOpen:true}};
        return {attacker,player,event};
      }
      function predationState(test,elapsed,patch={}){
        return {...stateFor(scenario(),-1),time:eventTime+elapsed,player:{...clone(test.player),dead:elapsed>=0,deathStartedAt:elapsed>=0?eventTime:null,respawnAt:elapsed>=0?eventTime+3000:null},snakes:[clone(test.attacker)],bites:[],predations:elapsed>=0?[clone(test.event)]:[],...patch};
      }
      function startPredation(test){const initial=predationState(test,-1);scene.reset(initial);scene.playerYaw=Math.PI*-0.5;render(initial);}
      const predation=predationScenario(),predatorActive=()=>Boolean(predatorSlot.event&&visible(predatorSlot.group));
      assert(predatorBloom.slots.length===1&&predatorBloom.assets===bloom.assets&&predatorBloom.textures===bloom.textures&&predatorBloom.sparkGeometry===bloom.sparkGeometry&&predatorBloom.spillGeometry===bloom.spillGeometry,'Predation bloom duplicated shared textures or geometry');
      startPredation(predation);render(predationState(predation,30));
      assert(predatorActive()&&visible(predatorSlot.flash),'A lethal bite did not start the shared flash sequence');
      assert(Math.hypot(predatorSlot.origin.x-scene.layout.x(predation.event.player.visual.x),predatorSlot.origin.z-scene.layout.z(predation.event.player.visual.y))<1e-9,'Predation bloom was not emitted from the player’s captured position');
      render(predationState(predation,110));
      assert(predatorSlot.clouds.some(visible)&&predatorSlot.clouds.every(cloud=>cloud.material.color.getHex()===0x83d51f),'Predation vapor did not retain the green player color');
      const localMouth=scene.snakes.get(43).head.worldToLocal(scene.predation.mouth.clone());
      const initialMoteDistances=predatorSlot.motes.map(mote=>mote.group.getWorldPosition(new THREE.Vector3()).distanceTo(scene.predation.mouth));
      const predationFrozen=pose(predatorBloom);scene.targetZoom=1.9;scene.targetTiltDegrees=25;
      for(let i=0;i<10;i++)render(predationState(predation,110,{paused:true}),1/60);
      assert(pose(predatorBloom)===predationFrozen,'Paused predation particles moved with the camera');
      scene.targetTiltDegrees=scene.tiltDegrees=45;scene.targetZoom=scene.zoom=1.5;
      render(predationState(predation,240));
      assert(!scene.player.visible&&predatorActive(),'Predation light disappeared with the consumed player');
      assert(scene.snakes.get(43).head.worldToLocal(scene.predation.mouth.clone()).distanceTo(localMouth)<1e-8,'Predation particles targeted a stale or untransformed snake mouth');
      const finalMoteDistances=predatorSlot.motes.map(mote=>mote.group.getWorldPosition(new THREE.Vector3()).distanceTo(scene.predation.mouth));
      assert(finalMoteDistances.every((distance,i)=>distance<initialMoteDistances[i]),'Green motes did not travel into the predator’s mouth');
      render(predationState(predation,320));assert(!scene.predation.active&&predatorActive(),'Predation bloom stopped when the independent jaw override ended');
      render(predationState(predation,BLOOM_MS+1));assert(!predatorActive()&&!scene.player.visible,'Predation bloom did not finish while preserving the consumed life');
      for(const boundary of ['respawn','hidden','reset']){
        startPredation(predation);render(predationState(predation,110));
        if(boundary==='reset'){scene.reset(predationState(predation,-1));render(predationState(predation,-1));}
        else render(predationState(predation,120,{player:boundary==='respawn'?clone(predation.player):{...predationState(predation,120).player,hidden:true}}));
        assert(!predatorActive(),`${boundary} retained stale green consumption particles`);
      }
      startPredation(predation);render(predationState(predation,320,{gameOver:true}));
      assert(predatorActive(),'A late first final-life frame lost the remaining green bloom');
      const lastLifePose=pose(predatorBloom),lastLifeTime=scene.predation.time;
      for(let i=0;i<8;i++)render(predationState(predation,320,{gameOver:true,paused:true}),1/60);
      assert(pose(predatorBloom)===lastLifePose&&scene.predation.time===lastLifeTime,'Final-life bloom rewound or advanced during pause');
      for(let i=0;i<100;i++)render(predationState(predation,320,{gameOver:true}),1/60);
      assert(!predatorActive()&&!scene.player.visible,'Final-life bloom failed to finish after the stopped game clock');
      const lastLifeFinished=pose(predatorBloom);for(let i=0;i<5;i++)render(predationState(predation,320,{gameOver:true}),1/60);
      assert(pose(predatorBloom)===lastLifeFinished&&!predatorActive(),'Finished predation history replayed the green bloom');
      // Stress only effect activity after scene initialization: neither a bite
      // nor a repeated render may make a fresh canvas, texture or material.
      start(resetTest);const createElement=document.createElement;let canvasAllocations=0;
      document.createElement=function(name,...args){if(String(name).toLowerCase()==='canvas')canvasAllocations++;return createElement.call(this,name,...args);};
      let peakActive=0;
      try{
        for(let i=0;i<120;i++){
          const event={...clone(resetTest.event),id:i+1,time:eventTime+i*8};
          render(stateFor(resetTest,i*8,{bites:[event]}));peakActive=Math.max(peakActive,active().length);
          assert(stable(),'Rapid consumption recreated a pooled object, material or texture');
        }
        render(stateFor(resetTest,120*8+BLOOM_MS+1,{bites:[]}));
        for(let i=0;i<12;i++){
          const time=10000+i*1000,event={...clone(predation.event),id:10+i,time};
          render(predationState(predation,-1,{time:time-1,player:clone(predation.player)}));
          const player={...clone(predation.player),dead:true,deathStartedAt:time,respawnAt:time+3000};
          render(predationState(predation,0,{time,player,predations:[event]}));
          render(predationState(predation,0,{time:time+BLOOM_MS+1,player,predations:[event]}));
          assert(stable(),'Repeated predation recreated shared bloom resources');
        }
      }finally{document.createElement=createElement;}
      assert(peakActive<=pool.length&&peakActive>1&&!active().length,'Burst pool grew without bound or failed to expire');
      assert(canvasAllocations===0,'Consumption allocated canvases while playing');
      window.__bloomReview={scene,scenario,stateFor,start,render,predationScenario,predationState,startPredation};
      return {checks,frames,failures,reviews,peakActive,poolSize:pool.length,canvasAllocations,timings:{BLOOM_MS,FLASH_MS,CLOUD_START_MS,CLOUD_END_MS,SUCTION_START_MS,SUCTION_TRAVEL_MS},renderer:scene.diagnostics()};
    });
    for(const [kind,color] of [['tail','#079ed1'],['body','#c92099'],['head','#e4a71a']])for(const [phase,time] of [['flash',30],['cloud',110],['suction',240]]){
      await page.evaluate(({kind,color,time})=>{
        const {scene,scenario,stateFor,start,render}=window.__bloomReview,test=scenario(kind,color);start(test);render(stateFor(test,0));render(stateFor(test,time));
        const focus=scene.player.position.clone().lerp(scene.bites.bloom.slots.find(slot=>slot.event).origin,.5);focus.y=.65;
        scene.camera.left=-3.9;scene.camera.right=3.9;scene.camera.top=2.6;scene.camera.bottom=-2.6;
        scene.camera.position.set(focus.x+2,focus.y+9,focus.z+10);scene.camera.lookAt(focus);scene.camera.updateProjectionMatrix();
        scene.vapor.update(stateFor(test,time).time,scene.player.position,scene.playerYaw,true,scene.camera);scene.renderer.render(scene.scene,scene.camera);
      },{kind,color,time});
      await page.screenshot({path:`experiments/3d/preview-bloom-${kind}-${phase}.png`});
    }
    for(const [phase,time] of [['cloud',110],['suction',240]]){
      await page.evaluate(({time})=>{
        const {scene,predationScenario,predationState,startPredation,render}=window.__bloomReview,test=predationScenario();startPredation(test);render(predationState(test,0));render(predationState(test,time));
        const focus=scene.predation.from.clone().lerp(scene.predation.mouth,.5);focus.y=.7;
        scene.camera.left=-3.9;scene.camera.right=3.9;scene.camera.top=2.6;scene.camera.bottom=-2.6;
        scene.camera.position.set(focus.x+2,focus.y+9,focus.z+10);scene.camera.lookAt(focus);scene.camera.updateProjectionMatrix();scene.renderer.render(scene.scene,scene.camera);
      },{time});
      await page.screenshot({path:`experiments/3d/preview-bloom-predation-${phase}.png`});
    }
    console.log(JSON.stringify({errors,...result},null,2));
    if(errors.length||result.failures.length)process.exitCode=1;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
