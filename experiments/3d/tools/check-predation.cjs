// Real-model visual and lifecycle checks for snakes swallowing the player.
const path=require('node:path');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/__predation-check__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;background:#060913}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto('http://127.0.0.1:8093/__predation-check__');
    const result=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {PLAYER_SWALLOW_MS,PREDATOR_CHOMP_MS}=await import('/experiments/3d/player-eaten.mjs');
      const {createSnakeHead,animateSnakeMouth}=await import('/experiments/3d/models/snake.mjs');
      const {snakeMouthOpening}=await import('/experiments/3d/snake-mouth.mjs');
      const {PLAYER_SCALE,HEAD_SCALE}=await import('/experiments/3d/world.mjs');
      const {CHOMP_MS}=await import('/experiments/3d/bite-effects.mjs');
      const scene=new DuskScene(document.getElementById('world'));
      const referenceMaterial=new THREE.MeshBasicMaterial(),referenceHead=createSnakeHead(referenceMaterial);
      const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14?'#':'.').join(''));
      for(const [y,from,to] of [[3,4,12],[11,3,8]]){const row=[...maze[y]];for(let x=from;x<=to;x++)row[x]='#';maze[y]=row.join('');}
      const failures=[],directions=[];let checks=0,frames=0;
      const assert=(condition,message)=>{checks++;if(!condition&&failures.length<30)failures.push(message);};
      const clone=value=>JSON.parse(JSON.stringify(value));
      const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const nested of Object.values(value))freeze(nested);}return value;};
      const snake=(id,body,color='#c92099')=>({id,body,color,motion:null,reversing:false,dir:body.length>1?{x:body[0].x-body[1].x,y:body[0].y-body[1].y}:{x:1,y:0}});
      const eventTime=1000,expiry=PREDATOR_CHOMP_MS+100;
      function scenario(dir={x:1,y:0}){
        const attacker=snake(43,Array.from({length:4},(_,i)=>({x:9-dir.x*i,y:7-dir.y*i})));
        const passive=snake(44,[{x:13,y:9},{x:14,y:9},{x:15,y:9}],'#079ed1');
        const x=9+dir.x*.75,y=7+dir.y*.75;
        const player={id:1,x,y,visual:{x,y},dir:{x:-dir.x,y:-dir.y},mouthOpen:true,dead:false,hidden:false,shield:false,powered:false,lives:3,deathStartedAt:null,respawnAt:null};
        const event={id:1,time:eventTime,snake:clone(attacker),playerId:1,player:{id:1,visual:{x,y},dir:{...player.dir},mouthOpen:true}};
        return {dir,attacker,passive,player,event};
      }
      function stateFor(test,elapsed,patch={}){
        const player={...clone(test.player),dead:elapsed>=0,lives:elapsed>=0?2:3,deathStartedAt:elapsed>=0?eventTime:null,respawnAt:elapsed>=0?eventTime+3000:null};
        return {generation:1,started:true,time:eventTime+elapsed,cols:19,rows:15,maze,player,paused:false,complete:false,gameOver:false,speed:.5,snakes:[clone(test.attacker),clone(test.passive)],bites:[],predations:elapsed<0?[]:[clone(test.event)],...patch};
      }
      function render(snapshot,dt=0){
        const input=JSON.stringify(snapshot);freeze(snapshot);scene.render(snapshot,dt);frames++;
        assert(JSON.stringify(snapshot)===input,'Predation presentation mutated an authoritative snapshot');
        for(const object of [scene.player,...[...scene.snakes.values()].map(item=>item.head)]){
          assert([...object.position.toArray(),...object.scale.toArray(),...object.quaternion.toArray(),...object.matrixWorld.elements].every(Number.isFinite),'A player or snake predation transform is not finite');
          assert(object.scale.toArray().every(value=>value>=0),'Swallowing produced a negative model scale');
        }
        const passive=scene.snakes.get(44);
        if(passive){
          animateSnakeMouth(referenceHead,snakeMouthOpening(44,snapshot.time));
          assert(Math.abs(passive.head.userData.jaw.rotation.x-referenceHead.userData.jaw.rotation.x)<1e-9,'The unrelated snake was given the attack animation');
        }
      }
      function start(test){const initial=stateFor(test,-1);scene.reset(initial);scene.playerYaw=Math.atan2(test.player.dir.x,test.player.dir.y);render(initial);}
      const actorPose=()=>JSON.stringify({time:scene.predation.time,player:[scene.player.visible,...scene.player.position.toArray(),...scene.player.scale.toArray(),...scene.player.quaternion.toArray(),scene.player.userData.jaw.rotation.x],snakes:[...scene.snakes].map(([id,item])=>[id,...item.head.position.toArray(),...item.head.scale.toArray(),item.head.rotation.y,item.head.userData.jaw.rotation.x])});
      const fullSize=()=>scene.player.scale.toArray().every(value=>Math.abs(value-PLAYER_SCALE)<1e-9);
      for(const dir of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
        const test=scenario(dir);start(test);
        const alivePosition=scene.player.position.clone(),aliveRotation=scene.player.quaternion.clone(),aliveJaw=scene.player.userData.jaw.rotation.x;
        render(stateFor(test,0));
        assert(scene.player.visible&&fullSize(),'The caught player must remain full size at initial contact');
        assert(scene.player.position.distanceTo(alivePosition)<1e-9&&scene.player.quaternion.angleTo(aliveRotation)<1e-7&&Math.abs(scene.player.userData.jaw.rotation.x-aliveJaw)<1e-9,'Initial contact changed the captured live player pose');
        assert(Boolean(scene.predation.active),'A matching lethal event did not start swallowing');
        assert(!scene.beam.visible&&!scene.halo.visible&&!scene.vapor.group.visible,'A captured player retained live flashlight or smoke emission');
        const mouth=scene.predation.mouth.clone(),initialDistance=scene.player.position.distanceTo(mouth),sizes=[],jaws=[];
        for(const portion of [.2,.5,.8,.98]){
          render(stateFor(test,PLAYER_SWALLOW_MS*portion));
          assert(scene.player.visible,'The victim disappeared before the swallow became tiny');
          sizes.push(scene.player.scale.length());jaws.push(scene.snakes.get(test.attacker.id).head.userData.jaw.rotation.x);
          assert(scene.player.position.distanceTo(scene.predation.mouth)<initialDistance,`Victim did not move into the ${JSON.stringify(dir)} attacker mouth`);
        }
        assert(sizes.every((value,i)=>!i||value<sizes[i-1])&&sizes.at(-1)<sizes[0]*.025,'The swallowed player must shrink continuously to a tiny size');
        assert(Math.max(...jaws)>.24&&jaws.at(-1)<.05,'The attacker must open widely and then close around the player');
        render(stateFor(test,expiry));
        assert(!scene.player.visible&&!scene.predation.active&&Boolean(scene.predation.consumed),'An eaten player reappeared as a corpse while waiting to respawn');
        for(let i=0;i<4;i++)render(stateFor(test,expiry));
        assert(!scene.player.visible&&!scene.predation.active,'Repeated stale history replayed a completed predation');
        render(stateFor(test,expiry+10,{player:clone(test.player)}));
        assert(scene.player.visible&&fullSize()&&!scene.predation.active&&!scene.predation.consumed,'Respawn did not restore the full player and clear the eaten life');
        directions.push({dir,sizes,jaws,initialDistance});
      }
      // Splitting and a lethal attack can first arrive together. They can also
      // occur only a few frames apart, while the rear tail is becoming a head.
      // Death cancels the player's mouthful, not the surviving snakes' shapes.
      for(const deathOffset of [0,45]){
        const base=scenario(),original=snake(60,[{x:12,y:5},{x:11,y:5},{x:10,y:5},{x:9,y:5},{x:8,y:5},{x:8,y:6},{x:8,y:7}]);
        const front=snake(61,original.body.slice(0,4)),rear=snake(62,original.body.slice(5).reverse());
        const alive={...clone(base.player),x:8,y:7.55,visual:{x:8,y:7.55},dir:{x:0,y:-1}};
        const split={id:1,time:eventTime,kind:'body',index:4,snake:clone(original),playerId:1,player:{visual:{...alive.visual},dir:{...alive.dir}},fragments:[{snake:clone(front),sourceIndices:[0,1,2,3]},{snake:clone(rear),sourceIndices:[6,5]}]};
        const deathTime=eventTime+deathOffset;
        const attack={id:1,time:deathTime,snake:clone(rear),playerId:1,player:{id:1,visual:{...alive.visual},dir:{...alive.dir},mouthOpen:true}};
        const dead={...clone(alive),dead:true,lives:2,deathStartedAt:deathTime,respawnAt:deathTime+3000};
        const initial=stateFor(base,-1,{player:alive,snakes:[original]});scene.reset(initial);render(initial);
        let previousSize=0;
        if(deathOffset){
          render(stateFor(base,0,{player:clone(alive),snakes:[clone(front),clone(rear)],bites:[clone(split)],predations:[]}));
          render(stateFor(base,deathOffset,{player:clone(alive),snakes:[clone(front),clone(rear)],bites:[clone(split)],predations:[]}));
          previousSize=scene.snakes.get(rear.id).head.scale.x;
          assert(previousSize>0&&previousSize<HEAD_SCALE,'Mid-birth death must first show a partially formed rear head');
        }
        const combined=elapsed=>stateFor(base,elapsed,{player:clone(dead),snakes:[clone(front),clone(rear)],bites:[clone(split)],predations:[clone(attack)]});
        render(combined(deathOffset));
        const newborn=scene.snakes.get(rear.id);
        assert(Math.abs(newborn.head.scale.x-previousSize)<1e-9&&newborn.formerTail.visible,`Death at ${deathOffset}ms popped the newborn head or removed its former tail`);
        assert(scene.predation.active&&scene.player.visible&&fullSize(),'A newborn predator failed to capture a full-size player');
        assert(!scene.bites.slots.some(slot=>slot.group.visible),'Death retained the player’s old snake-piece mouthful');
        let priorSize=previousSize,localTarget=null;
        for(const elapsed of [60,100,140]){
          render(combined(elapsed));
          assert(newborn.head.scale.x>priorSize&&newborn.head.scale.x<HEAD_SCALE,'A surviving rear head stopped growing after player death');
          priorSize=newborn.head.scale.x;
          const target=newborn.head.worldToLocal(scene.predation.mouth.clone());
          assert(target.toArray().every(Number.isFinite)&&target.y>0&&target.z>0,'Predation target left the actual growing head’s mouth');
          if(localTarget)assert(target.distanceTo(localTarget)<1e-8,'Swallow target ignored the newborn head’s changing rendered scale');
          localTarget=target;
        }
        render(combined(expiry+deathOffset));
        assert(Math.abs(newborn.head.scale.x-HEAD_SCALE)<1e-9&&!newborn.formerTail.visible&&!scene.bites.transitions.size,'Dead-player frame prevented the surviving fragment from finishing its head birth');
        assert(!scene.player.visible&&!scene.predation.active,'Combined split and predation did not finish cleanly');
      }
      // Pausing freezes the world even when the camera is being adjusted and
      // the old live-player heading was still easing at the instant of contact.
      const test=scenario();start(test);scene.playerYaw=.4;render(stateFor(test,-.5),1/120);
      render(stateFor(test,0));render(stateFor(test,PLAYER_SWALLOW_MS*.55));
      const beforePause=actorPose();scene.targetTiltDegrees=25;scene.targetZoom=1.9;
      const changedPlayer={...stateFor(test,132).player,dir:{x:0,y:1}};
      for(let i=0;i<12;i++)render(stateFor(test,PLAYER_SWALLOW_MS*.55,{paused:true,player:changedPlayer}),1/60);
      assert(actorPose()===beforePause,'Pausing or changing the camera moved an active swallow or attacker jaw');
      scene.targetTiltDegrees=scene.tiltDegrees=45;scene.targetZoom=scene.zoom=1.5;
      // A missing attacker must not leave a suspended player miniature. Hidden
      // sprites remain hidden, including when the same event stays in history.
      for(const abort of ['attacker removal','hidden']){
        start(test);render(stateFor(test,80));
        const patch=abort==='hidden'?{player:{...stateFor(test,80).player,hidden:true}}:{snakes:[clone(test.passive)]};
        render(stateFor(test,90,patch));
        assert(!scene.player.visible&&!scene.predation.active,`${abort} left a floating swallowed player`);
        render(stateFor(test,110));
        assert(!scene.player.visible&&!scene.predation.active,`${abort} replayed the old attack on recovery`);
      }
      start(test);render(stateFor(test,80));scene.reset(stateFor(test,-1));render(stateFor(test,-1));
      assert(scene.player.visible&&fullSize()&&!scene.predation.active&&!scene.predation.consumed,'Reset retained a swallowed player or reduced model scale');
      // A first rendered frame can arrive after the entire effect elapsed.
      // Matching death identity still prevents the consumed life reappearing.
      start(test);render(stateFor(test,expiry));
      assert(!scene.player.visible&&!scene.predation.active&&Boolean(scene.predation.consumed),'A delayed first frame restored the full consumed corpse');
      render(stateFor(test,expiry+1,{player:clone(test.player)}));
      render(stateFor(test,expiry+2,{player:{...stateFor(test,expiry+2).player,deathStartedAt:eventTime+expiry+2}}));
      assert(!scene.predation.active&&!scene.predation.consumed,'An event belonging to an earlier death replayed on the next life');
      // Final-life deaths stop the simulation clock. Finish once using capped
      // presentation time, but do not advance or rewind during a manual pause.
      start(test);render(stateFor(test,0,{gameOver:true}));
      for(let i=0;i<5;i++)render(stateFor(test,0,{gameOver:true}),1/60);
      const terminalTime=scene.predation.time,terminalPose=actorPose();
      assert(terminalTime>=eventTime+40,'Final-life pause check did not first advance terminal presentation');
      for(let i=0;i<8;i++)render(stateFor(test,0,{gameOver:true,paused:true}),1/60);
      assert(actorPose()===terminalPose,'Final-life manual pause rewound or advanced the swallowed player');
      for(let i=0;i<100;i++)render(stateFor(test,0,{gameOver:true}),1/60);
      assert(!scene.player.visible&&!scene.predation.active,'Final-life predation did not finish after the game clock stopped');
      const completedPose=actorPose();for(let i=0;i<10;i++)render(stateFor(test,0,{gameOver:true}),1/60);
      assert(actorPose()===completedPose,'Completed terminal predation did not settle');
      // Swallowing uses the existing player model. Repeated lives must retain
      // the same meshes/materials/geometry and never allocate a corpse clone.
      const playerObject=scene.player,resources=[];scene.player.traverse(object=>{if(object.isMesh)resources.push([object,object.geometry,object.material]);});
      const sceneChildren=scene.scene.children.length;
      let resourceDisposals=0;for(const [,geometry] of resources)geometry.addEventListener('dispose',()=>resourceDisposals++);
      for(let i=0;i<12;i++){
        const time=5000+i*1000,attack={...clone(test.event),id:i+10,time};
        render(stateFor(test,0,{time:time-1,player:clone(test.player),predations:[]}));
        const dead={...stateFor(test,0).player,deathStartedAt:time,respawnAt:time+3000};
        render(stateFor(test,0,{time,player:dead,predations:[attack]}));
        render(stateFor(test,0,{time:time+expiry,player:dead,predations:[attack]}));
        assert(scene.player===playerObject&&scene.scene.children.length===sceneChildren&&resources.every(([object,geometry,material])=>object.geometry===geometry&&object.material===material),'Repeated predation allocated another player model or changed its shared resources');
      }
      assert(resourceDisposals===0,'Predation disposed player geometry between lives');
      // Eating snake pieces is a separate living-player action. Death history
      // must not capture, shrink, or hide a player performing an ordinary bite.
      const biteSnake=snake(50,[{x:12,y:9},{x:11,y:9},{x:10,y:9}]);
      const bitePlayer={...clone(test.player),visual:{x:9.35,y:9},dir:{x:1,y:0}};
      const bite={id:1,time:20000,kind:'tail',index:2,snake:clone(biteSnake),playerId:1,player:{visual:{...bitePlayer.visual},dir:{...bitePlayer.dir}}};
      const alive={...stateFor(test,-1),time:19999,player:bitePlayer,snakes:[clone(biteSnake)],predations:[]};
      scene.reset(alive);render(alive);
      const biteState={...clone(alive),time:20000,snakes:[{...clone(biteSnake),body:clone(biteSnake.body.slice(0,-1))}],bites:[bite],predations:[clone(test.event)]};
      render(biteState);assert(scene.bites.slots.some(slot=>slot.group.visible)&&scene.player.visible&&fullSize()&&!scene.predation.active,'Predation changed a normal living-player tail bite');
      render({...clone(biteState),time:20000+CHOMP_MS+20});
      assert(scene.player.visible&&fullSize()&&!scene.bites.slots.some(slot=>slot.group.visible),'Ordinary tail eating no longer settles with a full-size living player');
      referenceMaterial.dispose();
      window.__predationReview={scene,scenario,stateFor,start,render};
      return {checks,frames,failures,directions,resourceDisposals,renderer:scene.diagnostics()};
    });
    for(const [label,time] of [['before',-1],['early',45],['mid',120],['end',350]]){
      await page.evaluate(({time})=>{
        const {scene,scenario,stateFor,start,render}=window.__predationReview,test=scenario();start(test);
        if(time>=0){render(stateFor(test,0));render(stateFor(test,time));}
        const focus=scene.player.position.clone().set(scene.layout.x(8.4),.75,scene.layout.z(7));
        scene.camera.left=-4.5;scene.camera.right=4.5;scene.camera.top=3;scene.camera.bottom=-3;
        scene.camera.position.set(focus.x+2,focus.y+9,focus.z+10);scene.camera.lookAt(focus);scene.camera.updateProjectionMatrix();
        scene.vapor.update(stateFor(test,time).time,scene.player.position,scene.playerYaw,time<0,scene.camera);
        scene.renderer.render(scene.scene,scene.camera);
      },{time});
      await page.screenshot({path:`experiments/3d/preview-predation-${label}.png`});
    }
    console.log(JSON.stringify({errors,...result},null,2));
    if(errors.length||result.failures.length)process.exitCode=1;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
