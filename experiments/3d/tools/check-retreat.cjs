// Exercise retreat planning through the real generated engine and scheduler.
// Fixtures are injected into the browser response; no production test hooks.
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/experiments/3d/';
const fixture=`
  globalThis.__retreatFixture={
    manual:true,
    arena({body,open,dir={x:1,y:0},reverse=true,reverseSteps=0,oldRouteDir=null,headTrail=[]}){
      experimentRelease();CentralGameClock.reset(1000);
      gameOver=false;gameOverPending=false;paused=false;experimentCompleted=false;
      maze=Array.from({length:ROWS},()=>Array(COLS).fill('#'));
      for(const cell of [...open,...body])maze[cell.y][cell.x]='.';
      maze[13][16]='.';mazeRevision++;eggObstacleRevision++;
      Object.assign(player,{x:16,y:13,prevX:16,prevY:13,moveFromX:16,moveFromY:13,
        moveToX:16,moveToY:13,moveStartedAt:1000,moveDuration:95,lastMove:1000,
        experimentStepDistance:1,dir:{x:0,y:1},nextDir:{x:0,y:1},dead:false,
        eliminated:false,hideDeathSprite:false,waitingForInput:true,
        pointerNavigation:null,pointerMomentum:false,reactionAssistRicochet:null,
        spawnShieldUntil:Infinity,powerModeUntil:0,deathStartedAt:null,respawnAt:null});
      snakes=[];eggs=[];hunters=[];fruits=[];scorpion=null;scorpionSpawnAt=Infinity;
      experimentBites=[];experimentPredations=[];experimentGeneration++;
      GameplayAssistOptions.setReactionAssistEnabled(false);
      const s=makeSnake(body[0].x,body[0].y,1,dir);
      s.body=experimentCopy(body);s.dir={...dir};s.lastMove=1000;
      s.color='#079ed1';s.turnBias=.25;s.headTrail=experimentCopy(headTrail);
      snakes=[s];
      if(reverse&&body.length>1)beginTailLedRetreat(s,gameTimeNow());
      else {s.reversing=reverse;if(reverse)s.blockedDir={...dir};}
      s.reverseSteps=reverseSteps;s.reverseHeadOldRouteDir=oldRouteDir;
      this.subject=s;return this.state();
    },
    state(){
      const s=this.subject;
      return {body:experimentCopy(s.body),dir:{...s.dir},reversing:s.reversing,
        headTrail:experimentCopy(s.headTrail||[]),
        lastMove:s.lastMove,planning:!!s.experimentRetreatPlanning,
        search:s.experimentRetreatPlan?{bodyKey:s.experimentRetreatPlan.bodyKey,
          expanded:s.experimentRetreatPlan.expanded,pending:!!s.experimentRetreatPlan.advance,
          directions:s.experimentRetreatPlan.directions.length}:null,
        reverseSteps:s.reverseSteps,pending:s.pendingForwardResumeDir?{...s.pendingForwardResumeDir}:null,
        motion:experimentMotion.has(s)?JSON.parse(JSON.stringify(experimentMotion.get(s))):null,
        tailGuide:s.tailGuide?{...s.tailGuide,dir:{...s.tailGuide.dir}}:null,
        memory:s.experimentRetreatMemory?JSON.parse(JSON.stringify(s.experimentRetreatMemory,
          (key,value)=>value instanceof Map?[...value]:value)):null};
    },
    step(random=.99,forceSlice=false,elapsedMs=1000){
      const before=this.state(),s=this.subject,t=gameTimeNow()+elapsedMs;
      const original=Math.random;Math.random=()=>random;
      const start=performance.now();
      const ownNow=Object.getOwnPropertyDescriptor(performance,'now');let fakeTime=0;
      try{
        if(forceSlice)Object.defineProperty(performance,'now',{
          configurable:true,value:()=>fakeTime+=10});
        CentralGameClock.reset(t);update(t,t);
      }finally{
        Math.random=original;
        if(forceSlice){
          if(ownNow)Object.defineProperty(performance,'now',ownNow);
          else delete performance.now;
        }
      }
      const after=this.state();
      const newCells=after.body.filter(cell=>!before.body.some(old=>old.x===cell.x&&old.y===cell.y));
      const flankViolations=[];
      for(const cell of newCells){
        const addedAtHead=after.body[0].x===cell.x&&after.body[0].y===cell.y;
        const origin=addedAtHead?before.body[0]:before.body.at(-1);
        if(cell.x!==origin.x&&cell.y!==origin.y&&
           (isWall(origin.x,cell.y)||isWall(cell.x,origin.y)))flankViolations.push({origin,cell});
      }
      return {before,after,elapsed:performance.now()-start,flankViolations,
        otherViolations:after.body.filter(cell=>occupiedByOtherSnake(cell.x,cell.y,s)),
        wallViolations:after.body.filter(cell=>isWall(cell.x,cell.y))};
    },
    biteTail(){
      const s=this.subject,tail=s.body.at(-1),before=this.state();
      player.x=tail.x;player.y=tail.y;player.prevX=tail.x-1;player.prevY=tail.y;
      checkSnakeContact(player);player.x=16;player.y=13;
      return {before,after:this.state(),bites:experimentBites.length};
    },
    focus(target){
      player.x=target.x;player.y=target.y;player.spawnShieldUntil=0;
      this.subject.brainState={phase:0,period:4200,focus:.6,focusUntil:Infinity,
        target:{...target},planType:'chase',planUntil:Infinity,surpriseAt:Infinity,
        lastChoice:null,brainId:1,coordinationRole:0,targetPlayerId:player.id,
        targetPlayerUntil:Infinity,routeHistory:[],planDistance:Infinity,
        planStalls:0,planTargetKey:''};
    },
    block(cell){
      const blocker=makeSnake(cell.x,cell.y,1,{x:0,y:-1});
      blocker.body=[{...cell}];blocker.lastMove=Infinity;
      snakes.push(blocker);
    },
    unblock(){snakes=[this.subject];},
    failHeadExits(){
      const s=this.subject,head=s.body[0],memory=experimentRetreatMemory(s);
      for(const d of experimentDirections){
        if(experimentSnakeStepOpen(head,d,s,true))memory.failed.set(experimentRetreatEdge(head,d),
          {count:3,time:gameTimeNow(),expires:gameTimeNow()+60000});
      }
      return this.state();
    },
    watchPending(){
      const plan=this.subject.experimentRetreatPlan,advance=plan?.advance;
      if(!advance)throw new Error('The fixture requires a yielded search');
      this.resumeCalls=0;
      plan.advance=(...args)=>{this.resumeCalls++;return advance(...args);};
      return this.state();
    },
    searchStatus(){return {state:this.state(),resumeCalls:this.resumeCalls||0,
      bodyKey:experimentRetreatBodyKey(this.subject.body),
      ownsPerformanceNow:Object.hasOwn(performance,'now')};},
    reenter(body,dir={x:1,y:0}){
      const s=this.subject;
      s.body=experimentCopy(body);s.dir={...dir};s.reversing=false;
      s.pendingForwardResumeDir=null;s.lastMove=gameTimeNow();
      beginTailLedRetreat(s,gameTimeNow());s.reverseSteps=1;
      s.reverseHeadOldRouteDir={...dir};
      return this.state();
    }
  };
`;
const horizontal=(x1,x2,y)=>Array.from({length:x2-x1+1},(_,i)=>({x:x1+i,y}));
const vertical=(x,y1,y2)=>Array.from({length:y2-y1+1},(_,i)=>({x,y:y1+i}));
const key=p=>`${p.x},${p.y}`;
const sameBody=(a,b)=>a.length===b.length&&a.every((p,i)=>key(p)===key(b[i]));

(async()=>{
  const {snakeRoute,sampleSnake}=await import(pathToFileURL(path.join(__dirname,'../motion.mjs')).href);
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[],checks=[],transitions=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route(url=>url.pathname.endsWith('/engine/maze-biters-experiment.js'),route=>{
      let source=fs.readFileSync(path.join(__dirname,'../engine/maze-biters-experiment.js'),'utf8');
      const anchor='globalThis.MazeBiters3DEngine=Object.freeze({';
      assert.ok(source.includes(anchor)&&source.includes('step(realTime){'),'Fixture insertion points exist');
      source=source.replace(anchor,fixture+anchor).replace('step(realTime){','step(realTime){if(globalThis.__retreatFixture.manual)return;');
      return route.fulfill({contentType:'text/javascript',body:source});
    });
    await page.goto(base);
    await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:60000});
    await page.waitForFunction(()=>globalThis.__mazeBiters3D?.snapshot().started);
    const arena=config=>page.evaluate(config=>__retreatFixture.arena(config),config);
    const step=async(random=.99,forceSlice=false,elapsedMs=1000)=>{
      const result=await page.evaluate(({random,forceSlice,elapsedMs})=>__retreatFixture.step(random,forceSlice,elapsedMs),{random,forceSlice,elapsedMs});
      transitions.push(result);
      assert.deepEqual(result.wallViolations,[],'Every simulated body cell stays on the floor');
      assert.deepEqual(result.otherViolations,[],'Recovery never enters another snake body');
      assert.deepEqual(result.flankViolations,[],'Retreat never cuts through a diagonal wall corner');
      assert.equal(new Set(result.after.body.map(key)).size,result.after.body.length,'Body cells never overlap');
      for(let i=1;i<result.after.body.length;i++){
        const a=result.after.body[i-1],b=result.after.body[i];
        assert.equal(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y)),1,'Body topology remains connected');
      }
      if(!sameBody(result.before.body,result.after.body)){
        const {before,after}=result,m=after.motion;
        assert.ok(m&&m.duration>0,'A recovered step retains its interpolated movement');
        assert.ok(sameBody(m.from,before.body)&&sameBody(m.to,after.body),
          'The animation starts at the real prior body and ends at the committed body');
        for(let i=0;i<after.body.length;i++){
          const start=sampleSnake(snakeRoute(after,m.started),i);
          const prior=sampleSnake(snakeRoute({...before,motion:null},m.started),i);
          const end=sampleSnake(snakeRoute(after,m.started+m.duration),i);
          const rest=sampleSnake(snakeRoute({...after,motion:null},m.started+m.duration),i);
          assert.ok(Math.hypot(start.x-prior.x,start.y-prior.y)<1e-8,'Recovery starts without a position jump');
          assert.ok(Math.hypot(end.x-rest.x,end.y-rest.y)<1e-8,'Recovery ends without a position jump');
          let previous=start;
          for(let frame=1;frame<=32;frame++){
            const sample=sampleSnake(snakeRoute(after,m.started+m.duration*frame/32),i);
            assert.ok(Number.isFinite(sample.x)&&Number.isFinite(sample.y),'Every intermediate sample stays finite');
            assert.ok(Math.hypot(sample.x-previous.x,sample.y-previous.y)<.09,'The body moves smoothly through recovery');
            previous=sample;
          }
        }
      }
      return result;
    };

    const forkBody=horizontal(4,11,6).reverse();
    const forkOpen=[...horizontal(1,11,6),...vertical(4,7,12),{x:7,y:5},{x:7,y:4}];
    await arena({body:forkBody,open:forkOpen});
    let result=await step();
    assert.deepEqual(result.after.body.at(-1),{x:4,y:7},'Tail chooses enough runway instead of the short dead-end branch');
    let sawJunction=false;
    for(let i=0;i<10;i++){
      if(!result.after.reversing){
        assert.deepEqual(result.after.body[0],{x:7,y:6},'Forward recovery starts only once the real head reaches a new passage');
        assert.deepEqual(result.after.pending,{x:0,y:-1},'The head resumes into the new upward passage');
        sawJunction=true;break;
      }
      assert.ok(result.after.body[0].x>=7,'The head does not pass its usable junction');
      result=await step();
    }
    assert.ok(sawJunction,'The long retreat route eventually releases the head into a new passage');
    result=await step();
    assert.deepEqual(result.after.body[0],{x:7,y:5},'The staged resume performs a normal forward step');
    checks.push('tail runway planning, uninterrupted retreat until the head reaches a real branch, and forward resume');

    // A route that failed earlier is preferable to permanent immobility when
    // the physical tail is blocked and that route is now the only legal move.
    await arena({body:horizontal(5,9,6).reverse(),open:horizontal(5,10,6),reverseSteps:2,oldRouteDir:{x:1,y:0}});
    result=await step();
    if(sameBody(result.before.body,result.after.body))result=await step();
    assert.deepEqual(result.after.body[0],{x:10,y:6},'A blocked tail resumes the free old head route within two movement opportunities');
    assert.equal(result.after.reversing,false,'The recovered snake travels forward');
    checks.push('a blocked tail retries the physically open old head route promptly');

    await arena({body:horizontal(5,9,6).reverse(),open:horizontal(5,9,6),reverseSteps:2,oldRouteDir:{x:1,y:0}});
    for(let i=0;i<8;i++){
      result=await step(i%2?0:.99);
      assert.ok(sameBody(result.before.body,result.after.body),'A snake with both physical ends sealed waits without entering a wall');
      assert.equal(result.after.pending,null,'A fully sealed snake cannot queue an impossible step');
    }
    checks.push('only snakes with both physical ends sealed wait safely');

    await arena({body:horizontal(5,9,6).reverse(),open:[...horizontal(5,10,6),...vertical(9,3,5)],reverseSteps:2,oldRouteDir:{x:1,y:0}});
    const failed=await page.evaluate(()=>__retreatFixture.failHeadExits());
    assert.ok(failed.memory.failed.length>=2,'The scenario marks every available head exit as previously failed');
    result=await step();
    if(sameBody(result.before.body,result.after.body))result=await step();
    assert.ok(!sameBody(failed.body,result.after.body),'Remembered failures cannot freeze a head with legal exits');
    for(const [edge] of failed.memory.failed){
      assert.ok(result.after.memory.failed.some(([remembered])=>remembered===edge),'Fallback preserves route failure history');
    }
    checks.push('previous failures remain remembered while an available head exit is retried');

    await arena({body:horizontal(5,9,6).reverse(),open:horizontal(3,9,6),reverseSteps:2,oldRouteDir:{x:1,y:0}});
    result=await step();
    assert.deepEqual(result.after.body.at(-1),{x:4,y:6},'The only legal tail step is taken even without a guaranteed full escape route');
    assert.ok(result.after.reversing,'A safe tail fallback retains reverse travel');
    checks.push('legal tail movement continues when no complete new-head-exit plan exists');

    // Random uncertainty must not make a valid head branch disappear.
    for(const random of [0,.99]){
      await arena({body:horizontal(5,9,6).reverse(),open:[...horizontal(5,10,6),...vertical(9,3,5)],reverseSteps:2,oldRouteDir:{x:1,y:0}});
      result=await step(random);
      assert.equal(result.after.reversing,false,'An available new head exit is selected deterministically');
      assert.deepEqual(result.after.pending,{x:0,y:-1},'Tail blockage never selects the old rightward route over the new exit');
      result=await step(random);
      assert.deepEqual(result.after.body[0],{x:9,y:5},'The new branch is actually traversed');
    }
    checks.push('new head exits are taken even when the tail is blocked and regardless of the random sample');

    await arena({body:horizontal(5,9,6).reverse(),open:[...horizontal(5,10,6),...vertical(9,3,5)],reverseSteps:2,oldRouteDir:{x:1,y:0}});
    result=await step();
    assert.deepEqual(result.after.pending,{x:0,y:-1},'The head initially queues the new upward exit');
    await page.evaluate(()=>__retreatFixture.block({x:9,y:5}));
    result=await step();
    if(sameBody(result.before.body,result.after.body))result=await step();
    assert.deepEqual(result.after.body[0],{x:10,y:6},'An occupied staged exit promptly falls back to the free old head route');
    assert.equal(result.after.reversing,false,'The occupied preferred route does not leave the snake waiting in reverse mode');
    checks.push('a staged exit blocked by another snake falls back to legal forward movement without overlap');

    const junctionBody=horizontal(5,8,6).reverse();
    await arena({body:junctionBody,open:[...horizontal(3,9,6),...vertical(8,3,10)],reverseSteps:1,oldRouteDir:{x:1,y:0}});
    result=await step(0);
    const firstExit=result.after.pending;
    assert.ok(firstExit&&firstExit.x===0&&Math.abs(firstExit.y)===1,'The first return selects a side branch');
    for(let i=0;i<8;i++){
      result=await step(0);
      if(result.after.reversing)break;
    }
    assert.ok(result.after.reversing,'The first chosen branch reaches its actual dead end and enters retreat');
    await page.evaluate(body=>__retreatFixture.reenter(body),junctionBody);
    result=await step(0);
    assert.ok(result.after.pending,'The next attempt selects an available alternative');
    assert.notDeepEqual(result.after.pending,firstExit,'The same junction does not retry its failed forward exit');
    assert.deepEqual(result.after.pending,{x:0,y:-firstExit.y},'The untried side exit wins over both failed routes');
    checks.push('a failed forward branch is remembered across retreat attempts and a different side exit is selected');

    const diagonalBody=[{x:11,y:4},{x:10,y:5},{x:9,y:6},{x:8,y:7}];
    const diagonalOpen=[...diagonalBody,{x:10,y:4},{x:11,y:5},{x:9,y:5},
      {x:10,y:6},{x:8,y:6},{x:9,y:7},
      ...[2,3,4].flatMap(y=>horizontal(9,11,y)),
      ...[7,8,9,10].flatMap(y=>horizontal(5,8,y))];
    await arena({body:diagonalBody,open:diagonalOpen,dir:{x:1,y:-1}});
    await page.evaluate(()=>__retreatFixture.focus({x:9,y:2}));
    result=await step(0);
    assert.equal(result.after.reversing,false,'A diagonal body uses the available fresh exit at its head');
    assert.deepEqual(result.after.pending,{x:0,y:-1},'The head queues the gentler 45-degree northward exit before turning northwest');
    result=await step(0);
    assert.deepEqual(result.after.body[0],{x:11,y:3},'The staged 45-degree exit is actually traversed');
    assert.deepEqual(result.after.dir,{x:0,y:-1},'The resumed heading follows the first gentle turn');
    result=await step(0);
    assert.deepEqual(result.after.body[0],{x:10,y:2},'A second 45-degree turn takes the shorter diagonal toward the target');
    assert.deepEqual(result.after.dir,{x:-1,y:-1},'The diagonal heading is reached through two gentle turns');
    assert.equal(Math.hypot(result.after.body[0].x-result.before.body[0].x,
      result.after.body[0].y-result.before.body[0].y),Math.SQRT2,'A real diagonal forward-resume transition is exercised');
    checks.push('mixed diagonal body topology resumes through two 45-degree turns toward the target without wall corner cutting');

    const pocketBody=[{x:10,y:5},{x:9,y:6},{x:8,y:7},{x:7,y:8},{x:6,y:9}];
    const pocketOpen=[...pocketBody,{x:9,y:5},{x:10,y:6},{x:8,y:6},{x:9,y:7},
      {x:7,y:7},{x:8,y:8},{x:6,y:8},{x:7,y:9},{x:5,y:8},{x:4,y:8},
      // At (7,8), the northward flank now continues west into a real branch.
      // Earlier flanks still reconnect only to the failed diagonal arm. The
      // former westward exit from a northeast heading required an illegal 135.
      ...horizontal(4,6,7),
      ...[9,10,11,12].flatMap(y=>horizontal(3,6,y))];
    await arena({body:pocketBody,open:pocketOpen,dir:{x:1,y:-1}});
    const reversedHeads=[];
    for(let i=0;i<14;i++){
      result=await step();
      if(key(result.before.body[0])!==key(result.after.body[0]))reversedHeads.push(result.after.body[0]);
      if(!result.after.reversing)break;
    }
    assert.deepEqual(reversedHeads,[{x:9,y:6},{x:8,y:7},{x:7,y:8}],
      'Diagonal flank pockets cannot masquerade as exits when they only reconnect to the failed arm');
    assert.equal(result.after.reversing,false,'The diagonal retreat reaches the first branch with onward room');
    assert.deepEqual(result.after.pending,{x:0,y:-1},'The head chooses the 45-degree entrance to the true branch beyond the flank pockets');
    result=await step();
    assert.deepEqual(result.after.body[0],{x:7,y:7},'The valid branch entrance is traversed instead of remaining in reverse mode');
    checks.push('diagonal flank pockets are skipped until the head finds a passage that continues beyond the remembered failed arm');

    // A bite invalidates any cached route because it moves the physical tail.
    await arena({body:forkBody,open:forkOpen});
    await step();
    const bite=await page.evaluate(()=>__retreatFixture.biteTail());
    assert.equal(bite.after.body.length,bite.before.body.length-1,'The real tail bite shortens the snake');
    assert.ok(bite.bites>0,'The topology change came from the production eating path');
    assert.deepEqual({x:bite.after.tailGuide.x,y:bite.after.tailGuide.y},bite.after.body.at(-1),'The guide follows the physical shortened tail');
    for(let i=0;i<8;i++){
      result=await step();
      if(!result.after.reversing)break;
    }
    assert.equal(result.after.reversing,false,'Retreat re-plans after a tail bite and still reaches the head exit');
    checks.push('actual tail consumption invalidates the old topology and re-plans from the new physical tail');

    const loneTrail=horizontal(2,5,4);
    await arena({body:[{x:6,y:4}],open:[...horizontal(2,6,4),{x:4,y:3},{x:4,y:2},{x:3,y:5},{x:3,y:6}],
      reverse:false,headTrail:loneTrail});
    const loneExpected=[
      [6,4,true],[5,4,true],[4,4,true],[4,3,false],
      [4,2,false],[4,2,true],[4,3,true],[4,4,true],[3,4,true],[3,5,false]
    ];
    for(const [x,y,reversing] of loneExpected){
      result=await step(.99);
      assert.deepEqual(result.after.body[0],{x,y},'A solitary head explores the next branch after its first branch fails');
      assert.equal(result.after.reversing,reversing,'The solitary head preserves reverse mode along the failed arm');
    }
    checks.push('a solitary head learns both its original failed arm and a failed side branch before trying the next junction');

    await arena({body:[{x:6,y:4}],open:horizontal(2,6,4),reverse:false,headTrail:loneTrail});
    let exhausted=false,resumedAfterExhaustion=false;
    for(let i=0;i<10;i++){
      result=await step(.99);
      if(exhausted&&key(result.after.body[0])!=='2,4'){
        assert.deepEqual(result.after.body[0],{x:3,y:4},'An exhausted solitary retreat retries its open forward route');
        assert.equal(result.after.reversing,false,'The solitary head switches to forward motion after exhausting its retreat');
        resumedAfterExhaustion=true;break;
      }
      if(key(result.after.body[0])==='2,4'&&result.after.headTrail.length===0)exhausted=true;
    }
    assert.ok(exhausted&&resumedAfterExhaustion,'A solitary head with available space keeps moving after its remembered route ends');
    checks.push('a solitary head resumes available forward movement after exhausting its retreat history');

    await arena({body:[{x:6,y:4}],open:[{x:6,y:4}],reverse:true});
    for(let i=0;i<5;i++){
      result=await step();
      assert.ok(sameBody(result.before.body,result.after.body),'A completely enclosed solitary head cannot move through walls');
    }
    checks.push('a genuinely enclosed solitary head waits safely until a physical opening exists');

    await arena({body:[{x:6,y:6}],open:[{x:4,y:4},{x:4,y:5},{x:5,y:5},{x:6,y:5},{x:6,y:6},{x:7,y:5},{x:8,y:5}],
      reverse:true,dir:{x:1,y:0},headTrail:[{x:4,y:4},{x:4,y:5},{x:5,y:5},{x:6,y:5}]});
    result=await step();
    assert.deepEqual(result.after.body[0],{x:6,y:5},'A solitary head follows the corner in its remembered route');
    result=await step();
    assert.deepEqual(result.after.body[0],{x:7,y:5},'A new exit can share the compass direction that was blocked at a different cell');
    assert.equal(result.after.reversing,false,'An angular retreat resumes from the valid new exit');
    checks.push('solitary corner retreats compare actual route cells instead of excluding one global compass direction');

    const longBody=horizontal(1,17,4).reverse();
    const longOpen=[...longBody,{x:1,y:3},{x:1,y:2},...vertical(1,5,12),...horizontal(2,17,12)];
    await arena({body:longBody,open:longOpen});
    const originalPerformanceOwn=await page.evaluate(()=>Object.hasOwn(performance,'now'));
    result=await step(.99,true);
    assert.ok(result.after.planning&&result.after.search?.pending,'A deliberately tight time budget yields a long retreat search');
    assert.ok(result.after.search.expanded>=16,'The search has performed its minimum useful expansion batch');
    assert.ok(sameBody(result.before.body,result.after.body),'A yielded search does not move the snake prematurely');
    assert.equal(result.after.lastMove,result.before.lastMove,'The snake remains due while its search is pending');
    const firstExpanded=result.after.search.expanded;
    await page.evaluate(()=>__retreatFixture.watchPending());
    result=await step(.99,true);
    let searchStatus=await page.evaluate(()=>__retreatFixture.searchStatus());
    assert.equal(searchStatus.resumeCalls,1,'The next scheduler pulse invokes the same saved search frontier');
    assert.ok(result.after.search.expanded>firstExpanded,'The resumed search retains its previous expansions');
    assert.equal(searchStatus.ownsPerformanceNow,originalPerformanceOwn,'The temporary timing override is restored after each slice');

    await arena({body:longBody,open:longOpen});
    result=await step(.99,true);
    assert.ok(result.after.planning,'The topology-change scenario begins with a pending search');
    await page.evaluate(()=>__retreatFixture.watchPending());
    const shortened=await page.evaluate(()=>__retreatFixture.biteTail());
    assert.equal(shortened.after.body.length,longBody.length-1,'The real bite changes body topology while planning');
    result=await step(.99,true);
    searchStatus=await page.evaluate(()=>__retreatFixture.searchStatus());
    assert.equal(searchStatus.resumeCalls,0,'A changed physical tail does not resume the stale search frontier');
    assert.equal(searchStatus.state.search.bodyKey,searchStatus.bodyKey,'The replacement plan describes the shortened body');
    assert.equal(searchStatus.ownsPerformanceNow,originalPerformanceOwn,'Topology replanning also restores the temporary clock method');
    for(let i=0;i<6&&result.after.planning;i++)result=await step(.99,true);
    assert.equal(result.after.planning,false,'The shortened snake finishes its replacement search');
    assert.equal(result.after.body.length,longBody.length-1,'Finishing the replacement search cannot restore a removed segment');
    checks.push('hard searches yield and resume their saved frontier while staying due, and real tail bites invalidate pending topology');

    await arena({body:longBody,open:[...longOpen,{x:18,y:4},{x:15,y:10},{x:16,y:10}]});
    result=await step(.99,true);
    assert.ok(result.after.planning,'The moving-neighbour scenario begins with a time-sliced retreat search');
    for(let i=0;i<4&&result.after.planning;i++){
      await page.evaluate(cell=>{
        __retreatFixture.unblock();__retreatFixture.block(cell);
      },{x:15+i%2,y:10});
      result=await step(.99,true,30);
    }
    assert.equal(result.after.planning,false,'Repeated environment changes cannot restart the bounded planning wait forever');
    assert.deepEqual(result.after.pending,{x:1,y:0},'The head chooses its legal old route after the bounded search wait');
    result=await step();
    assert.deepEqual(result.after.body[0],{x:18,y:4},'The head actually advances after other snakes repeatedly invalidate its retreat search');
    checks.push('moving neighbours cannot restart a pending retreat search indefinitely while the head has room');

    assert.deepEqual(errors,[],'No browser errors');
    console.log(JSON.stringify({checks,transitions:transitions.length,maxStepMs:Math.max(...transitions.map(t=>t.elapsed)),errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
