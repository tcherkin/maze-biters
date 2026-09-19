// Test-only response injection exercises production engine rules with old/dragon
// renderers. Run after the dragon factory is integrated, with a free GPU slot.
// Body-route wall clearance has separate tests; self-overlap on instant reversal
// is explicitly allowed. Fruit/scorpion probes below are dormant engine fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),base=process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/experiments/3d/';
const fixture=`
  globalThis.__dragonFixture={
    manual:true,
    arena({x=8,y=7,dir={x:1,y:0},walls=[]}={}){
      experimentRelease();CentralGameClock.reset(1000);experimentSpeed=.5;
      gameOver=false;gameOverPending=false;paused=false;experimentCompleted=false;
      activePlayerCount=1;player2=null;player3=null;level=1;
      maze=Array.from({length:ROWS},(_,cy)=>Array.from({length:COLS},(_,cx)=>
        cx===0||cx===COLS-1||cy===0||cy===ROWS-1?'#':'.'));
      for(const [wx,wy]of walls)maze[wy][wx]='#';mazeRevision++;eggObstacleRevision++;
      player=createPlayerState(1);
      Object.assign(player,{x,y,prevX:x,prevY:y,moveFromX:x,moveFromY:y,moveToX:x,moveToY:y,
        moveStartedAt:1000,moveDuration:95,lastMove:1000,experimentStepDistance:1,
        dir:{...dir},nextDir:{...dir},waitingForInput:true,spawnShieldUntil:0,powerModeUntil:0});
      snakes=[];eggs=[];hunters=[];fruits=[];scorpion=null;scorpionSpawnAt=Infinity;
      experimentBites=[];experimentPredations=[];experimentBiteSerial=0;experimentPredationSerial=0;
      experimentDragonEvents=[];experimentDragonEventSerial=0;
      experimentIds=new WeakMap();experimentSerial=0;experimentMotion=new WeakMap();experimentGeneration++;
      GameplayAssistOptions.setReactionAssistEnabled(false);
      this.snake([{x:2,y:2}],{x:1,y:0});
      return experimentSnapshot();
    },
    snake(body,dir={x:1,y:0}){
      const s=makeSnake(body[0].x,body[0].y,1,dir);s.body=experimentCopy(body);s.dir={...dir};
      s.lastMove=Infinity;s.color='#079ed1';snakes.push(s);return s;
    },
    time(t){CentralGameClock.reset(t);return experimentSnapshot();},
    step(d,t=gameTimeNow()+200){
      CentralGameClock.reset(t);if(d)MazeBiters3DEngine.tapVector(d);advancePlayer(player,t);
      return experimentSnapshot();
    },
    encounter(kind,compact=false){
      const split=kind==='split';this.arena(split?{x:9,y:6,dir:{x:0,y:1}}:{});
      player.experimentCompact=compact;
      let body,dir={x:1,y:0};
      if(kind==='tail')body=[{x:11,y:7},{x:10,y:7},{x:9,y:7}];
      else if(split)body=[{x:11,y:7},{x:10,y:7},{x:9,y:7},{x:8,y:7},{x:7,y:7}];
      else{body=[{x:9,y:7},{x:10,y:7},{x:11,y:7}];dir={x:-1,y:0};}
      if(kind==='safe-head'){body=[{x:9,y:7},{x:8,y:7},{x:7,y:7}];dir={x:1,y:0};}
      if(kind==='solitary-side'){body=[{x:9,y:7}];dir={x:0,y:1};}
      if(kind==='shield')activateSpawnShield(player,1000);
      if(kind==='power'){activatePowerMode(player,1000);player.powerModeUntil=10000;}
      const s=this.snake(body,dir),before=experimentSnapshot();
      commitPlayerVisualStep(player,9,7,1000);checkSnakeContact(player);
      return{before,after:experimentSnapshot(),removed:body.length-s.body.length,
        delay:playerMoveDelay(player,1000),poweredDelay:playerMoveDelay(player,4000),combat:hasCombatPower(player,1000)};
    },
    bodyOnly(){
      this.arena({x:9,y:7});this.snake([{x:8,y:7},{x:7,y:7},{x:6,y:7}],{x:1,y:0});
      checkSnakeContact(player);
      const behindHasPlayer=!!playerAt(8,7);activateSpawnShield(player,1000);
      return{snapshot:experimentSnapshot(),behindHasPlayer,behindRepels:playerRepelsInhabitant(8,7),headRepels:playerRepelsInhabitant(9,7)};
    },
    incoming(){
      this.arena({x:9,y:7});const s=this.snake([{x:10,y:7},{x:11,y:7},{x:12,y:7}],{x:-1,y:0});
      s.pendingForwardResumeDir={x:-1,y:0};s.reversing=false;
      const random=Math.random;Math.random=()=>0;
      try{snakeStep(s,1000);}finally{Math.random=random;}
      return experimentSnapshot();
    },
    rearBarrier(){
      this.arena({x:9,y:7});activateSpawnShield(player,1000);
      const s=this.snake([{x:7,y:7},{x:6,y:7},{x:5,y:7}]);
      s.pendingForwardResumeDir={x:1,y:0};snakeStep(s,1000);
      return {body:experimentCopy(s.body),dead:player.dead,repels:playerRepelsInhabitant(8,7)};
    },
    tailBite(solitary=false){
      this.arena({x:9,y:7});activateSpawnShield(player,1000);
      const s=this.snake(solitary?[{x:7,y:7}]:[{x:7,y:7},{x:6,y:7},{x:5,y:7}]);
      const expires=player.spawnShieldUntil;
      CentralGameClock.reset(expires-1);const blocked=!canEnter(8,7,s);
      CentralGameClock.reset(expires);s.pendingForwardResumeDir={x:1,y:0};
      const before=experimentSnapshot();snakeStep(s,expires);const after=experimentSnapshot();
      snakeStep(s,expires+100);const repeated=experimentSnapshot();
      CentralGameClock.reset(expires+300);const compact=experimentSnapshot();
      const moved=this.step({x:0,y:-1},expires+400);
      return{blocked,before,after,repeated,compact,moved};
    },
    recoverWithoutFood(){
      const bite=this.tailBite(),frames=[bite.before,bite.after,bite.compact,bite.moved];
      const t=bite.after.time;
      for(const dt of [420,440,460,480,500,600,620,640,660,680,700,800,820,840,860,880,900,1000,1020,1040,1060,1080,1100,1300]){
        CentralGameClock.reset(t+dt);if([600,800,1000].includes(dt))this.step({x:0,y:-1},t+dt);
        experimentUpdateDragonForm(player);frames.push(experimentSnapshot());
      }
      return frames;
    },
    escapeExpiry(){
      this.tailBite();const expiry=player.experimentEscapeUntil;
      const s=this.snake([{x:player.x,y:player.y},{x:player.x,y:player.y-1}],{x:0,y:1});
      CentralGameClock.reset(expiry-1);experimentSnakeAttack(s,player);const protectedState=experimentSnapshot();
      CentralGameClock.reset(expiry);experimentSnakeAttack(s,player);return{protectedState,dead:experimentSnapshot()};
    },
    headSequence(count=4){
      this.arena({x:6,y:7});const frames=[experimentSnapshot()];
      for(let i=0;i<count;i++){
        const t=1000+i*700;CentralGameClock.reset(t);
        const dir=i<4?{x:1,y:0}:{x:0,y:1};player.dir={...dir};player.nextDir={...dir};
        this.snake([{x:player.x+dir.x,y:player.y+dir.y}],{x:-dir.y,y:dir.x});
        commitPlayerVisualStep(player,player.x+dir.x,player.y+dir.y,t);checkSnakeContact(player);
        frames.push(experimentSnapshot());
        for(const dt of [120,260,500]){CentralGameClock.reset(t+dt);experimentUpdateDragonForm(player);frames.push(experimentSnapshot());}
      }
      return frames;
    },
    blockedSpawn(){
      this.arena();snakes=[];player.dead=true;player.lives=2;player.respawnAt=1000;
      const start=experimentPlayerStart(1),rear={x:start.x-start.dir.x,y:start.y-start.dir.y};
      this.snake([rear]);updatePlayerDeath(player,1000);const blocked=player.dead;
      snakes=[];updatePlayerDeath(player,1000);
      return{blocked,dead:player.dead,shield:isSpawnProtected(player,1000),cells:experimentPlayerBodyCells(player,1000)};
    },
    ricochet(){
      this.arena();this.snake([{x:9,y:7},{x:10,y:7},{x:11,y:7}],{x:-1,y:0});
      GameplayAssistOptions.setReactionAssistEnabled(true);
      const bounced=this.step({x:1,y:0},1200),turned=this.step({x:0,y:-1},1400);
      return{bounced,turned};
    },
    respawn(){
      const dead=this.encounter('death').after;snakes=[];
      CentralGameClock.reset(player.respawnAt+1);updatePlayerDeath(player,gameTimeNow());
      return{dead,respawned:experimentSnapshot()};
    },
    dormantWorld(){
      this.arena();fruits=[{x:player.x,y:player.y,kind:2,bornAt:1000}];
      checkWorldContact(player);const fruit={score:player.score,powered:isPowerMode(player),left:fruits.length};
      scorpion={x:player.x,y:player.y,tailX:player.x-1,tailY:player.y,dir:{x:1,y:0}};
      checkWorldContact(player);return{fruit,scorpionGone:scorpion===null,score:player.score,
        snapshotExposesFruit:Object.hasOwn(experimentSnapshot(),'fruits'),snapshotExposesScorpion:Object.hasOwn(experimentSnapshot(),'scorpion')};
    },
    finish(compact=false){
      this.arena();if(compact)experimentTryShedDragonRear({body:[{x:7,y:7}]},player,1000);
      snakes=[];this.snake([{x:9,y:7}],{x:0,y:1});
      const t=compact?1700:1000;CentralGameClock.reset(t);
      commitPlayerVisualStep(player,9,7,t);checkSnakeContact(player);return experimentSnapshot();
    },
    sparseRoute(){
      this.arena({x:5,y:5});const origin=experimentSnapshot();
      commitPlayerVisualStep(player,6,5,1000,47.5);
      commitPlayerVisualStep(player,6,6,1048,47.5);
      commitPlayerVisualStep(player,7,7,1096,47.5);
      CentralGameClock.reset(1120);const partial=experimentSnapshot();
      CentralGameClock.reset(1164);const arrived=experimentSnapshot();
      commitPlayerVisualStep(player,6,6,1164,47.5);
      CentralGameClock.reset(1232);const reversed=experimentSnapshot();
      resetPlayerVisualPosition(player);const reset=experimentSnapshot();
      return{origin,partial,arrived,reversed,reset};
    },
    scheduled(diagonal){
      this.arena({x:4,y:4,dir:diagonal?{x:1,y:1}:{x:1,y:0}});player.waitingForInput=false;
      const events=[];let x=player.x,y=player.y;
      for(let elapsed=.5;elapsed<2000&&events.length<5;elapsed+=.5){
        const t=1000+elapsed;CentralGameClock.reset(t);update(t,t);
        if(player.x!==x||player.y!==y){events.push({time:t,distance:Math.hypot(player.x-x,player.y-y),duration:player.moveDuration});x=player.x;y=player.y;}
      }return events;
    }
  };
`;
function summary(snapshot){return{complete:snapshot.complete,level:snapshot.level,
  player:{x:snapshot.player.x,y:snapshot.player.y,dir:snapshot.player.dir,dead:snapshot.player.dead,lives:snapshot.player.lives,score:snapshot.player.score,shield:snapshot.player.shield,powered:snapshot.player.powered,ricochet:snapshot.player.ricochet},
  snakes:snapshot.snakes.map(s=>s.body),bites:snapshot.bites.map(b=>({kind:b.kind,index:b.index,fragments:b.fragments?.map(f=>f.sourceIndices)})),predations:snapshot.predations.length};}

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});const results=[],errors=[];
  try{
    for(const model of process.argv.includes('--dragon-only')?['dragon']:['old','dragon']){
      const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
      page.on('pageerror',e=>errors.push(model+': '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push(model+': '+m.text());});
      await page.route(url=>url.pathname.endsWith('/engine/maze-biters-experiment.js'),route=>{
        let source=fs.readFileSync(path.join(root,'engine/maze-biters-experiment.js'),'utf8');
        // Disable observer hooks in the baseline to detect any gameplay effect
        // introduced by the feed, as well as any effect from the new model.
        if(model==='old')source=source.replace('    experimentRecordPlayerStep(p,t);','')
          .replace('    experimentResetPlayerRoute(p,now);','');
        const anchor='globalThis.MazeBiters3DEngine=Object.freeze({';assert.equal(source.split(anchor).length,2);
        source=source.replace(anchor,fixture+anchor).replace('step(realTime){','step(realTime){if(globalThis.__dragonFixture.manual)return;');
        return route.fulfill({contentType:'text/javascript',body:source});
      });
      await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>{
        let source=fs.readFileSync(path.join(root,'renderer.mjs'),'utf8');const anchor='this.renderer=new THREE.WebGLRenderer';
        assert.equal(source.split(anchor).length,2);source=source.replace(anchor,'globalThis.__dragonScene=this;'+anchor);
        return route.fulfill({contentType:'text/javascript',body:source});
      });
      await page.goto(base+'?v=0.3.77&look=balanced&player='+model+(process.argv.includes('--ruins')?'&world=ruins':''),{waitUntil:'domcontentloaded',timeout:120000});
      await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:180000});
      const identity=await page.evaluate(()=>{
        const s=__dragonScene;globalThis.__dragonRender=s.render.bind(s);s.render=()=>{};
        return s.player.userData.modelVersion;
      });
      if(model==='dragon')assert.equal(identity,'crystal-dragon-v5','Dragon query must load the actual new factory');
      const checks=[],outcomes={};
      for(const kind of ['tail','split','safe-head','solitary-side','shield','power','death']){
        const encounter=await page.evaluate(kind=>__dragonFixture.encounter(kind),kind);const state=encounter.after;
        outcomes[kind]=summary(state);
        if(kind==='death'){
          assert.ok(state.player.dead);assert.equal(state.player.lives,2);assert.equal(state.predations.length,1);assert.equal(state.bites.length,0);
        }else{
          assert.ok(!state.player.dead);assert.equal(state.player.lives,3);assert.equal(state.predations.length,0);
          assert.equal(state.bites.length,1);assert.ok(state.player.score>0);
          assert.equal(state.bites[0].kind,kind==='tail'?'tail':kind==='split'?'body':'head');
          if(kind==='split')assert.deepEqual(state.bites[0].fragments.map(f=>f.sourceIndices),[[0,1],[4,3]]);
          if(kind==='shield'){assert.equal(encounter.delay,95);assert.ok(state.player.shield&&!state.player.powered);}
          if(kind==='power'){assert.ok(state.player.powered&&encounter.combat);assert.equal(encounter.poweredDelay,47.5);}
          if(model==='dragon')assert.equal(state.player.length,2,'Eating any head preserves the two-cell length');
        }
        const visual=await page.evaluate(({before,after})=>{
          const s=__dragonScene,render=globalThis.__dragonRender;
          s.reset(before);s.playerYaw=Math.atan2(before.player.dir.x,before.player.dir.y);render(before,0,0);
          const snapshots=[after,{...after,time:after.time+80},{...after,time:after.time+400}];
          const input=JSON.stringify(snapshots),poses=[];
          for(const snapshot of snapshots){render(snapshot,1/60,1/60);s.player.updateWorldMatrix(true,true);
            if(!snapshot.player.dead&&Math.hypot(s.player.position.x-s.layout.x(snapshot.player.visual.x),s.player.position.z-s.layout.z(snapshot.player.visual.y))>1e-8)
              throw Error('Visual route changed the authoritative head/root position');
            const data=[];s.player.traverse(o=>data.push(...o.position.toArray(),...o.scale.toArray(),...o.quaternion.toArray()));
            if(!data.every(Number.isFinite))throw Error('Non-finite dragon/eating transform');
            poses.push({visible:s.player.visible,scale:s.player.scale.x,active:s.bites.slots.filter(slot=>slot.group.visible).length});
          }
          if(JSON.stringify(snapshots)!==input)throw Error('Rendering changed gameplay snapshots');
          return{poses,biteAnchor:s.bites.mouth.toArray(),predationActive:!!s.predation.active};
        },encounter);
        if(kind==='death'){assert.ok(visual.poses[0].visible);assert.ok(!visual.poses.at(-1).visible);}
        else{assert.equal(visual.poses[0].active,1);assert.equal(visual.poses.at(-1).active,0);}
      }
      checks.push('Production head/tail/split/safe-head/power/shield/death contracts and real-model effects');

      const body=await page.evaluate(()=>__dragonFixture.bodyOnly());
      assert.ok(!body.snapshot.player.dead&&body.headRepels);
      assert.equal(body.behindHasPlayer,model==='dragon');assert.equal(body.behindRepels,model==='dragon');
      assert.equal(body.snapshot.bites.length,0);assert.equal(body.snapshot.predations.length,0);outcomes.bodyOnly=summary(body.snapshot);
      const incoming=await page.evaluate(()=>__dragonFixture.incoming());assert.ok(incoming.player.dead);assert.equal(incoming.predations.length,1);outcomes.incoming=summary(incoming);
      const barrier=await page.evaluate(()=>__dragonFixture.rearBarrier());
      if(model==='dragon'){assert.ok(barrier.repels&&!barrier.dead);assert.ok(!barrier.body.some(c=>c.x===8&&c.y===7));}
      if(model==='dragon')for(const solitary of [false,true]){
        const bite=await page.evaluate(solitary=>__dragonFixture.tailBite(solitary),solitary);
        assert.ok(bite.blocked,'Shield protects the rear until its exact expiry');
        assert.ok(!bite.after.player.dead&&bite.after.player.compact,'Rear attack gives a compact second chance');
        assert.equal(bite.after.player.lives,3);assert.equal(bite.after.predations.length,0);
        assert.equal(bite.after.dragonEvents.length,1);assert.equal(bite.after.dragonEvents[0].kind,'shed');
        assert.equal(bite.repeated.player.lives,3);assert.equal(bite.repeated.dragonEvents.length,1);
        assert.equal(bite.compact.player.compactness,1);assert.ok(bite.compact.player.escapeShield);
        assert.equal(bite.moved.player.y,6,'Controls work immediately during escape');
        if(!solitary){
          for(const [name,state]of [['full',bite.before],['shrinking',{...bite.after,time:bite.after.time+130,player:{...bite.after.player,compactness:.5}}],['compact',bite.compact]]){
            await page.evaluate(({state,reset})=>{
              const s=__dragonScene;if(reset)s.reset(state);
              Object.assign(s.cameraPresentation,{zoom:1.5,velocity:0,intro:false,overview:false});s.resetCamera=true;
              __dragonRender(state,1/60,1/60);
            },{state,reset:name==='full'});
            await page.screenshot({path:path.join(root,'preview-dragon-second-chance-'+name+'.png')});
          }
        }
      }
      if(model==='dragon'){
        for(const kind of ['tail','split','power','safe-head','solitary-side']){
          const r=await page.evaluate(kind=>__dragonFixture.encounter(kind,true),kind);
          assert.equal(r.after.player.compact,true,kind+' does not trigger regrowth');
          assert.equal(r.after.dragonEvents.length,0);
        }
        const recovery=await page.evaluate(()=>__dragonFixture.recoverWithoutFood());
        assert.equal(recovery[1].player.length,1);
        assert.equal(recovery.at(-1).player.length,2);assert.equal(recovery.at(-1).player.visualLength,2);
        assert.equal(recovery.at(-1).player.score,recovery[0].player.score,'Recovery needs no meal');
        assert.equal(recovery.at(-1).player.lives,3);
        assert.deepEqual(recovery.at(-1).dragonEvents.map(e=>e.kind),['shed','restore']);
        await page.evaluate(frames=>{
          const s=__dragonScene;s.reset(frames[0]);
          for(const state of frames)__dragonRender(state,.016,.016);
          if(s.player.userData.dragonVisualLength!==2)throw Error('Recovery did not restore rendered length');
        },recovery);
        const expiry=await page.evaluate(()=>__dragonFixture.escapeExpiry());
        assert.ok(!expiry.protectedState.player.dead&&expiry.protectedState.player.escapeShield);
        assert.ok(expiry.dead.player.dead);assert.equal(expiry.dead.player.lives,2);assert.equal(expiry.dead.predations.length,1);
        const frames=await page.evaluate(()=>__dragonFixture.headSequence());
        assert.ok(frames.every(f=>f.player.length===2&&f.player.visualLength===2));
        const poses=await page.evaluate(frames=>{
          const s=__dragonScene;s.reset(frames[0]);
          Object.assign(s.cameraPresentation,{zoom:1.5,velocity:0,intro:false,overview:false});s.resetCamera=true;
          return frames.map(state=>{
            __dragonRender(state,1/60,1/60);const data=s.player.userData.dragonMotion.diagnostics();
            if(!data.ready||!Number.isFinite(data.chordLength))throw Error('Invalid grown route');
            return{length:s.player.userData.dragonVisualLength,head:s.player.userData.dragonRig.bones[0].position.toArray(),paws:s.player.userData.paddleRig.paws.length};
          });
        },frames);
        assert.equal(poses.at(-1).length,2);assert.ok(poses.every(p=>p.paws===4));
        assert.ok(poses.every(p=>p.head.every(v=>v===0)),'Growth preserves the authored head/contact position');
        await page.screenshot({path:path.join(root,'preview-dragon-two-cells.png')});
      }
      const blockedSpawn=await page.evaluate(()=>__dragonFixture.blockedSpawn());
      assert.equal(blockedSpawn.blocked,model==='dragon');assert.ok(!blockedSpawn.dead&&blockedSpawn.shield);
      checks.push('Rear bites remove one cell without life loss; escape releases controls; walking restores two cells without food; eaten heads never add length; later head bite kills; respawn waits for both cells');

      const bounce=await page.evaluate(()=>__dragonFixture.ricochet());
      assert.deepEqual([bounce.bounced.player.x,bounce.bounced.player.y],[7,7]);assert.ok(!bounce.bounced.player.ricochet&&!bounce.bounced.player.dead);
      assert.deepEqual([bounce.turned.player.x,bounce.turned.player.y],[7,6]);outcomes.ricochet=[summary(bounce.bounced),summary(bounce.turned)];
      await page.evaluate(()=>__dragonFixture.arena());
      const initial=await page.evaluate(()=>__dragonFixture.step({x:1,y:0},1200));
      const reversed=await page.evaluate(()=>__dragonFixture.step({x:-1,y:0},1400));
      assert.deepEqual([initial.player.x,reversed.player.x],[9,8]);assert.deepEqual(reversed.player.dir,{x:-1,y:0});
      checks.push('One-cell ricochet releases control; requested instant180 reverses next logical move (visual self-overlap allowed)');

      const timing={cardinal:await page.evaluate(()=>__dragonFixture.scheduled(false)),diagonal:await page.evaluate(()=>__dragonFixture.scheduled(true))};
      const speed=events=>events.slice(1).reduce((total,e)=>total+e.distance,0)/(events.at(-1).time-events[0].time);
      assert.equal(timing.cardinal.length,5);assert.equal(timing.diagonal.length,5);assert.ok(Math.abs(speed(timing.diagonal)/speed(timing.cardinal)-1)<.008);
      outcomes.timing=timing;checks.push('Actual scheduler retains equal cardinal/diagonal speed');
      if(model==='dragon'){
        const route=await page.evaluate(()=>__dragonFixture.sparseRoute());
        const points=s=>s.player.route.points.map(p=>[p.x,p.y]);
        assert.deepEqual(points(route.partial),[[5,5],[6,5],[6,6]]);
        assert.deepEqual(points(route.arrived),[[5,5],[6,5],[6,6],[7,7]]);
        assert.deepEqual(points(route.reversed),[[5,5],[6,5],[6,6],[7,7],[6,6]]);
        assert.ok(route.reset.player.route.epoch>route.reversed.player.route.epoch);
        assert.deepEqual(points(route.reset),[[6,6]]);
        checks.push('Sparse-frame route preserves all reached corners, excludes future endpoint, records reversal and resets epoch');
      }
      await page.evaluate(()=>__dragonFixture.arena());
      await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowDown');
      const diagonal=await page.evaluate(()=>__dragonFixture.step(null,1200));
      await page.keyboard.up('ArrowDown');await page.keyboard.up('ArrowRight');
      assert.deepEqual(diagonal.player.dir,{x:1,y:1});
      const pause=await page.evaluate(()=>{
        MazeBiters3DEngine.pause();const before=__mazeBiters3D.snapshot();
        const next=__dragonFixture.step({x:-1,y:0},before.time+200);MazeBiters3DEngine.pause();
        return{before:{x:before.player.x,y:before.player.y},after:{x:next.player.x,y:next.player.y},paused:next.paused};
      });assert.deepEqual(pause.before,pause.after);assert.ok(pause.paused);
      checks.push('Real keyboard diagonal controls and paused engine movement');

      const respawn=await page.evaluate(()=>__dragonFixture.respawn());assert.ok(!respawn.respawned.player.dead&&respawn.respawned.player.shield);assert.equal(respawn.respawned.player.lives,2);
      const restored=await page.evaluate(({dead,respawned})=>{
        const s=__dragonScene;s.reset(dead);__dragonRender(dead,0,0);__dragonRender({...dead,time:dead.time+400},0,0);__dragonRender(respawned,0,0);
        return{visible:s.player.visible,scale:s.player.scale.toArray(),predation:!!s.predation.consumed,yaw:s.playerYaw};
      },respawn);assert.ok(restored.visible&&!restored.predation);assert.deepEqual(restored.scale,[2.1,2.1,2.1]);
      if(model==='dragon')assert.equal(restored.yaw,Math.atan2(respawn.respawned.player.dir.x,respawn.respawned.player.dir.y));
      outcomes.respawn=summary(respawn.respawned);
      const dormant=await page.evaluate(()=>__dragonFixture.dormantWorld());assert.equal(dormant.fruit.left,0);assert.ok(dormant.fruit.powered&&dormant.scorpionGone);assert.ok(!dormant.snapshotExposesFruit&&!dormant.snapshotExposesScorpion);outcomes.dormant=dormant;
      const complete=await page.evaluate(()=>__dragonFixture.finish());assert.ok(complete.complete);assert.equal(complete.level,1);assert.equal(complete.snakes.length,0);outcomes.complete=summary(complete);
      if(model==='dragon'){
        const win=await page.evaluate(()=>{
          const before=__dragonFixture.finish(true);__dragonFixture.manual=false;
          // Use the real public step to finish movement recovery after gameplay stops.
          MazeBiters3DEngine.reanchor(1000);
          for(let t=1100;t<=3000;t+=100)MazeBiters3DEngine.step(t);
          __dragonFixture.manual=true;
          const after=MazeBiters3DEngine.snapshot(),s=__dragonScene;
          s.reset(before);__dragonRender(before,0,0);__dragonRender(after,.016,.016);
          return{before,after,amount:s.player.userData.dragonCompactness};
        });
        assert.ok(win.before.complete&&win.before.player.compact);
        assert.ok(win.after.player.compactness>0&&win.after.player.compactness<1,'The final one-cell step must not finish a three-cell recovery');assert.equal(win.amount,win.after.player.compactness);
        assert.deepEqual([win.after.player.x,win.after.player.y],[win.before.player.x,win.before.player.y]);
        await page.screenshot({path:path.join(root,'preview-dragon-second-chance-restored.png')});
      }
      const restarted=await page.evaluate(()=>{MazeBiters3DEngine.start();return MazeBiters3DEngine.snapshot();});assert.ok(!restarted.complete&&!restarted.player.dead);assert.equal(restarted.player.lives,3);assert.equal(restarted.bites.length,0);assert.equal(restarted.predations.length,0);
      checks.push('Respawn restores visual/lives/shield; terminal completion/restart; dormant fruit/scorpion engine hooks only');
      results.push({model,identity,checks,outcomes});await page.close();
    }
    if(results.length===2){
      const baseRules=result=>JSON.parse(JSON.stringify(result.outcomes,(key,value)=>key==='shield'?undefined:value));
      assert.deepEqual(baseRules(results[1]),baseRules(results[0]),'Automatic recovery preserves existing head combat, controls and scoring');
    }
    assert.deepEqual(errors,[]);
    const report={results,errors,scope:'Head combat parity, dragon rear occupancy and two-cell respawn. Fruit/scorpion are injected dormant fixtures; route self-overlap is allowed; wall-clearance uses separate route tests.'};
    fs.writeFileSync(path.join(root,'preview-dragon-integration.log'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:results.map(r=>({model:r.model,checks:r.checks})),errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
