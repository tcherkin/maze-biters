// Trigger real snake-head contact and advance the production scheduler. The
// fixture is injected into the browser response; production exposes no hooks.
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/experiments/3d/';
const fixture=`
  globalThis.__ricochetFixture={
    manual:true,
    arena({dir={x:1,y:0},walls=[]}={}){
      experimentRelease();CentralGameClock.reset(1000);
      gameOver=false;gameOverPending=false;paused=false;experimentCompleted=false;
      maze=Array.from({length:ROWS},(_,y)=>Array.from({length:COLS},(_,x)=>
        x===0||x===COLS-1||y===0||y===ROWS-1?'#':'.'));
      for(const [x,y] of walls)maze[y][x]='#';
      mazeRevision++;eggObstacleRevision++;
      Object.assign(player,{x:9,y:7,prevX:9,prevY:7,moveFromX:9,moveFromY:7,
        moveToX:9,moveToY:7,moveStartedAt:1000,moveDuration:95,lastMove:1000,
        experimentStepDistance:1,dir:{...dir},nextDir:{...dir},dead:false,
        eliminated:false,hideDeathSprite:false,waitingForInput:false,
        pointerNavigation:null,pointerMomentum:false,reactionAssistRicochet:null,
        spawnShieldUntil:0,powerModeUntil:0,deathStartedAt:null,respawnAt:null});
      snakes=[];eggs=[];hunters=[];fruits=[];scorpion=null;scorpionSpawnAt=Infinity;
      experimentBites=[];experimentPredations=[];experimentGeneration++;
      GameplayAssistOptions.setReactionAssistEnabled(true);
      const s=makeSnake(9+dir.x,7+dir.y,1,{x:-dir.x,y:-dir.y});
      s.body=[1,2,3].map(i=>({x:9+dir.x*i,y:7+dir.y*i}));
      s.dir={x:-dir.x,y:-dir.y};s.lastMove=Infinity;s.color='#079ed1';
      snakes=[s];this.threat=s;
      return this.state();
    },
    state(){return{
      x:player.x,y:player.y,dir:{...player.dir},nextDir:{...player.nextDir},
      ricochet:player.reactionAssistRicochet?JSON.parse(JSON.stringify(player.reactionAssistRicochet)):null,
      waiting:player.waitingForInput,dead:player.dead,lives:player.lives,
      held:Object.keys(player.keyboardHeldKeys||{}),time:gameTimeNow(),
      lastMove:player.lastMove,started:player.moveStartedAt,duration:player.moveDuration,
      distance:player.experimentStepDistance,
      from:{x:player.moveFromX,y:player.moveFromY},to:{x:player.moveToX,y:player.moveToY},
      visual:playerVisualPosition(player,gameTimeNow()),
      shield:hasCombatPower(player,gameTimeNow()),predations:experimentPredations.length,
      hazard:reactionAssistForwardHazard(player,player.nextDir,gameTimeNow())
    };},
    tick(dt){
      const t=gameTimeNow()+dt;CentralGameClock.reset(t);update(t,t);
      return this.state();
    },
    next(){
      const before=this.state();
      const due=playerMoveDelay(player,gameTimeNow())*(player.experimentStepDistance||1);
      const remaining=Math.max(0,before.lastMove+due-gameTimeNow());
      const midpoint=this.tick(remaining/2);
      const atBoundary=this.tick(remaining/2);
      const after=this.tick(.01);
      return {before,midpoint,atBoundary,after,due};
    },
    wall(x,y){maze[y][x]='#';mazeRevision++;},
    gamepad(x,y){
      const pad={id:'Ricochet regression controller',index:0,connected:true,
        mapping:'standard',axes:[x,y,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),
        timestamp:gameTimeNow()};
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
      GamepadControl.poll();return this.state();
    },
    clearGamepad(){
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]});
      GamepadControl.poll();
    }
  };
`;

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[],checks=[];
  let steps=0;
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route(url=>url.pathname.endsWith('/engine/maze-biters-experiment.js'),route=>{
      let source=fs.readFileSync(path.join(__dirname,'../engine/maze-biters-experiment.js'),'utf8');
      const anchor='globalThis.MazeBiters3DEngine=Object.freeze({';
      assert.ok(source.includes(anchor),'The engine fixture insertion point exists');
      assert.ok(source.includes('step(realTime){'),'The frame scheduler can be isolated');
      source=source.replace(anchor,fixture+anchor).replace('step(realTime){','step(realTime){if(globalThis.__ricochetFixture.manual)return;');
      return route.fulfill({contentType:'text/javascript',body:source});
    });
    await page.goto(base);
    await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:60000});
    await page.waitForFunction(()=>globalThis.__mazeBiters3D?.snapshot().started);
    const reset=options=>page.evaluate(options=>__ricochetFixture.arena(options),options||{});
    const next=async()=>{steps++;return page.evaluate(()=>__ricochetFixture.next());};
    const tap=dir=>page.evaluate(dir=>MazeBiters3DEngine.tapVector(dir),dir);
    const point=s=>({x:s.x,y:s.y});
    const samePoint=(actual,expected,label)=>assert.deepEqual(point(actual),expected,label);
    const assertSchedule=event=>{
      const {before,midpoint,atBoundary,after,due}=event;
      samePoint(midpoint,point(before),'Input cannot create a premature logical movement tick');
      samePoint(atBoundary,point(before),'The established strict movement deadline is preserved');
      assert.ok(Math.abs(after.lastMove-before.lastMove-due-.01)<1e-6,'The next movement tick is accepted without an extra idle impulse');
      assert.ok(Math.abs(after.duration-95*after.distance)<1e-8,'The committed visual speed is still normalized to actual distance');
      const expectedMid={x:(before.from.x+before.to.x)/2,y:(before.from.y+before.to.y)/2};
      assert.ok(Math.hypot(midpoint.visual.x-expectedMid.x,midpoint.visual.y-expectedMid.y)<1e-7,'The previous slide still reaches its midpoint continuously');
      assert.deepEqual(after.visual,after.from,'The new slide starts at the completed previous destination');
    };
    const assertBounce=(event,dir)=>{
      samePoint(event.after,{x:9-dir.x,y:7-dir.y},'A lethal mouth produces exactly one reverse step');
      assert.equal(event.after.ricochet,null,'The first completed rebound releases the automatic direction lock');
      assert.equal(event.after.waiting,false,'Releasing the rebound does not insert an input wait');
      assert.equal(event.after.dead,false,'The initial ricochet retains the original safe-contact behavior');
      assert.equal(event.after.shield,false,'Free control does not grant invulnerability');
      assertSchedule(event);
    };

    await reset();
    await page.keyboard.down('ArrowRight');
    const first=await next();assertBounce(first,{x:1,y:0});
    assert.ok(first.after.held.includes('ArrowRight'),'A key held through contact remains held');
    const back=await next();
    samePoint(back.after,{x:9,y:7},'The still-held key can immediately move back toward the snake');
    assertSchedule(back);
    const repeated=await next();
    samePoint(repeated.after,{x:8,y:7},'A still-dangerous mouth causes a fresh rebound on a later contact');
    assert.equal(repeated.after.ricochet,null,'The fresh contact also releases its lock after one step');
    assert.equal(repeated.after.lives,first.after.lives,'Repeated real rebounds neither lose lives nor disable the safeguard');
    assert.equal(repeated.after.predations,0,'Rebound contact does not emit a death animation');
    await page.keyboard.up('ArrowRight');
    checks.push('held input immediately returns toward the snake; later lethal contact still rebounds normally');

    await reset();assertBounce(await next(),{x:1,y:0});
    const momentum=await next();
    samePoint(momentum.after,{x:7,y:7},'Without fresh input, normal rebound momentum continues without stopping');
    assert.equal(momentum.after.ricochet,null,'Ordinary momentum does not restore the automatic direction lock');
    assertSchedule(momentum);
    await reset();assertBounce(await next(),{x:1,y:0});
    await page.keyboard.press('ArrowRight');
    const quickKey=await next();
    samePoint(quickKey.after,{x:9,y:7},'A quick keyboard press released before the next tick still changes direction');
    assert.equal(quickKey.after.held.length,0,'The quick press is queued without a synthetic held key');
    assertSchedule(quickKey);
    checks.push('normal momentum continues without input; a brief queued key press also takes immediate control');

    const directions=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},
      {x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1}];
    for(const dir of directions){
      await reset();assertBounce(await next(),{x:1,y:0});
      await tap(dir);
      const turn=await next();
      samePoint(turn.after,{x:8+dir.x,y:7+dir.y},'A post-ricochet mouse/touch vector takes its requested legal direction');
      assert.deepEqual(turn.after.dir,dir,'Mouse/touch steering retains all eight headings');
      assertSchedule(turn);
      const continued=await next();
      assertSchedule(continued);
    }
    checks.push('all eight mouse/touch vectors regain control at the first normal tick with continuous distance-normalized animation');

    await reset();assertBounce(await next(),{x:1,y:0});
    await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowUp');
    const diagonal=await next();
    samePoint(diagonal.after,{x:9,y:6},'Two held keys give an immediate diagonal turn after rebound');
    assertSchedule(diagonal);
    await page.keyboard.up('ArrowRight');await page.keyboard.up('ArrowUp');
    await reset({dir:{x:1,y:1}});
    const diagonalBounce=await next();assertBounce(diagonalBounce,{x:1,y:1});
    await tap({x:1,y:1});
    const diagonalReturn=await next();
    samePoint(diagonalReturn.after,{x:9,y:7},'A diagonal rebound also allows the exact opposite heading immediately');
    assertSchedule(diagonalReturn);
    checks.push('diagonal rebound and keyboard escape retain the same world-space speed and allow immediate reversal');

    await reset();assertBounce(await next(),{x:1,y:0});
    await page.evaluate(()=>__ricochetFixture.wall(8,6));
    await tap({x:1,y:-1});
    const corner=await next();
    samePoint(corner.after,{x:9,y:7},'Regaining control preserves the standard wall-corner cardinal fallback');
    assertSchedule(corner);
    checks.push('free steering cannot cut diagonally through a wall corner');

    await reset();
    await page.evaluate(()=>__ricochetFixture.gamepad(1,0));
    assertBounce(await next(),{x:1,y:0});
    const padReturn=await next();
    samePoint(padReturn.after,{x:9,y:7},'A held gamepad direction immediately returns toward the snake');
    assertSchedule(padReturn);
    await page.evaluate(()=>__ricochetFixture.clearGamepad());
    await reset();assertBounce(await next(),{x:1,y:0});
    await page.evaluate(()=>__ricochetFixture.gamepad(1,1));
    const padDiagonal=await next();
    samePoint(padDiagonal.after,{x:9,y:8},'An analogue gamepad diagonal immediately branches after rebound');
    assertSchedule(padDiagonal);
    await page.evaluate(()=>__ricochetFixture.clearGamepad());
    checks.push('actual Gamepad API polling preserves held return and fresh diagonal requests');

    assert.deepEqual(errors,[],'The page reports no browser or JavaScript errors');
    console.log(JSON.stringify({ok:true,steps,checks},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
