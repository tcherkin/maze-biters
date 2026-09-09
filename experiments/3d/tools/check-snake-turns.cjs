// Exercise turn choices through the generated engine and its real scheduler.
// Test setup is injected into the response; production exposes no debug hooks.
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/experiments/3d/';
const fixture=`
  globalThis.__turnFixture={
    manual:true,
    arena({body,dir,reverse=false,open=null,walls=[],target={x:16,y:12},trail=[]}){
      experimentRelease();CentralGameClock.reset(1000);
      gameOver=false;gameOverPending=false;paused=false;experimentCompleted=false;
      maze=Array.from({length:ROWS},(_,y)=>Array.from({length:COLS},(_,x)=>
        open||x===0||y===0||x===COLS-1||y===ROWS-1?'#':'.'));
      if(open)for(const p of [...open,...body])maze[p.y][p.x]='.';
      for(const p of walls)maze[p.y][p.x]='#';
      mazeRevision++;eggObstacleRevision++;
      Object.assign(player,{x:target.x,y:target.y,prevX:target.x,prevY:target.y,
        moveFromX:target.x,moveFromY:target.y,moveToX:target.x,moveToY:target.y,
        moveStartedAt:1000,moveDuration:95,lastMove:1000,experimentStepDistance:1,
        dir:{x:0,y:1},nextDir:{x:0,y:1},dead:false,eliminated:false,
        hideDeathSprite:false,waitingForInput:true,pointerNavigation:null,
        pointerMomentum:false,reactionAssistRicochet:null,spawnShieldUntil:0,
        powerModeUntil:0,deathStartedAt:null,respawnAt:null});
      snakes=[];eggs=[];hunters=[];fruits=[];scorpion=null;scorpionSpawnAt=Infinity;
      experimentBites=[];experimentPredations=[];experimentGeneration++;
      GameplayAssistOptions.setReactionAssistEnabled(false);
      const s=makeSnake(body[0].x,body[0].y,1,dir);
      s.body=experimentCopy(body);s.dir={...dir};s.lastMove=1000;
      s.color='#079ed1';s.turnBias=.25;s.headTrail=experimentCopy(trail);snakes=[s];
      if(reverse&&body.length>1)beginTailLedRetreat(s,1000);
      else {s.reversing=reverse;if(reverse)s.blockedDir={...dir};}
      this.subject=s;this.focus(target);return this.state();
    },
    focus(target){
      player.x=target.x;player.y=target.y;
      this.subject.brainState={phase:0,period:4200,focus:.6,focusUntil:Infinity,
        target:{...target},planType:'chase',planUntil:Infinity,surpriseAt:Infinity,
        lastChoice:null,brainId:1,coordinationRole:0,targetPlayerId:player.id,
        targetPlayerUntil:Infinity,routeHistory:[],planDistance:Infinity,
        planStalls:0,planTargetKey:''};
    },
    state(){const s=this.subject;return {...experimentSnakeSnapshot(s),
      pending:s.pendingForwardResumeDir?{...s.pendingForwardResumeDir}:null,
      planning:!!s.experimentRetreatPlanning,planRelaxed:!!s.experimentRetreatPlan?.relaxedTurns,
      headTrail:experimentCopy(s.headTrail||[])};},
    failHeadExits(){
      const s=this.subject,memory=experimentRetreatMemory(s),head=s.body[0];
      for(const d of experimentDirections)memory.failed.set(experimentRetreatEdge(head,d),
        {count:3,time:gameTimeNow(),expires:gameTimeNow()+60000});
    },
    cacheTail(d){const s=this.subject;s.experimentRetreatPlan={
      bodyKey:experimentRetreatBodyKey(s.body),directions:[{...d}]};},
    visitedTail(d){const s=this.subject;experimentRetreatMemory(s).tailVisits.set(
      experimentRetreatEdge(s.body.at(-1),d),8);},
    pending(d){stageSnakeForwardResume(this.subject,d);},
    step(random=0){
      const before=this.state(),original=Math.random;Math.random=()=>random;
      try{const t=gameTimeNow()+1000;CentralGameClock.reset(t);update(t,t);}
      finally{Math.random=original;}
      return {before,after:this.state(),maze:maze.map(row=>row.join(''))};
    },
    live(seed){
      experimentStart();experimentRelease();player.waitingForInput=true;
      player.spawnShieldUntil=Infinity;
      const original=Math.random;let state=seed>>>0;
      Math.random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
      const transitions=[],layout=maze.map(row=>typeof row==='string'?row:row.join(''));
      try{
        for(let i=0;i<900;i++){
          const previous=new Map(snakes.map(s=>[s,experimentSnakeSnapshot(s)]));
          const t=gameTimeNow()+100;CentralGameClock.reset(t);update(t,t);
          for(const s of snakes){const before=previous.get(s),after=experimentSnakeSnapshot(s);
            if(before&&JSON.stringify(before.body)!==JSON.stringify(after.body))transitions.push({before,after});}
        }
      }finally{Math.random=original;}
      return {transitions,maze:layout};
    }
  };
`;
const delta=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const equal=(a,b)=>a.x===b.x&&a.y===b.y;
const sameBody=(a,b)=>a.length===b.length&&a.every((p,i)=>equal(p,b[i]));
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(a,b)/Math.hypot(a.x,a.y)/Math.hypot(b.x,b.y))))*180/Math.PI;
const chain=(head,dir,n=3)=>Array.from({length:n},(_,i)=>({x:head.x-dir.x*i,y:head.y-dir.y*i}));
const rect=(x1,x2,y1,y2)=>Array.from({length:y2-y1+1},(_,j)=>Array.from({length:x2-x1+1},(_,i)=>({x:x1+i,y:y1+j}))).flat();

(async()=>{
  const {snakeRoute,sampleSnake}=await import(pathToFileURL(path.join(__dirname,'../motion.mjs')).href);
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[],checks=[],counts={forward:0,reverse:0,solitary:0,curveSamples:0,liveTransitions:0};
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route(url=>url.pathname.endsWith('/engine/maze-biters-experiment.js'),route=>{
      let source=fs.readFileSync(path.join(__dirname,'../engine/maze-biters-experiment.js'),'utf8');
      const anchor='globalThis.MazeBiters3DEngine=Object.freeze({';
      assert.ok(source.includes(anchor)&&source.includes('step(realTime){'),'Fixture insertion points exist');
      source=source.replace(anchor,fixture+anchor).replace('step(realTime){','step(realTime){if(globalThis.__turnFixture.manual)return;');
      return route.fulfill({contentType:'text/javascript',body:source});
    });
    await page.goto(base);
    await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:60000});
    await page.waitForFunction(()=>globalThis.__mazeBiters3D?.snapshot().started);
    const arena=config=>page.evaluate(config=>__turnFixture.arena(config),config);
    function audit({before,after,maze}){
      assert.equal(new Set(after.body.map(p=>`${p.x},${p.y}`)).size,after.body.length,'A turn cannot overlap body cells');
      for(let i=0;i<after.body.length;i++){
        const p=after.body[i];assert.equal(maze[p.y]?.[p.x],'.','Every body cell stays on the floor');
        if(i>0){const d=delta(after.body[i-1],p);assert.equal(Math.max(Math.abs(d.x),Math.abs(d.y)),1,'Body links remain adjacent');}
        if(i>0&&i<after.body.length-1){
          const a=delta(after.body[i-1],p),b=delta(p,after.body[i+1]);
          assert.ok(dot(a,b)>=0,`A physical body corner cannot exceed 90 degrees: ${JSON.stringify(after.body)}`);
        }
      }
      if(sameBody(before.body,after.body))return;
      if(after.body.length===1){
        counts.solitary++;assert.ok(dot(before.dir,after.dir)>=0,'A solitary head never steers through a 135-degree turn');
      }else{
        const forward=after.body.slice(1).every((p,i)=>equal(p,before.body[i]));
        const reverse=after.body.slice(0,-1).every((p,i)=>equal(p,before.body[i+1]));
        assert.ok(forward||reverse,'Movement must shift one endpoint through the existing connected body');
        const origin=forward?before.body[0]:before.body.at(-1);
        const facing=forward?delta(origin,before.body[1]):delta(origin,before.body.at(-2));
        const move=delta(forward?after.body[0]:after.body.at(-1),origin);
        assert.ok(dot(facing,move)>=0,`The ${forward?'head':'tail'} cannot turn 135 degrees: ${JSON.stringify({facing,move})}`);
        counts[forward?'forward':'reverse']++;
      }
      const m=after.motion;
      assert.ok(m&&sameBody(m.from,before.body)&&sameBody(m.to,after.body),'The new turn retains its real interpolated movement');
      for(let i=0;i<after.body.length;i++){
        let previous=null;
        for(let frame=0;frame<=16;frame++){
          const p=sampleSnake(snakeRoute(after,m.started+m.duration*frame/16),i);
          counts.curveSamples++;
          assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y),'Curves remain finite at every intermediate heading');
          if(previous)assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y)<.18,'Steering retains continuous movement');
          previous=p;
        }
      }
    }
    const step=async(random=0)=>{const event=await page.evaluate(random=>__turnFixture.step(random),random);audit(event);return event;};

    await arena({body:chain({x:7,y:8},{x:1,y:0}),dir:{x:1,y:0},target:{x:12,y:3}});
    let event=await step();
    assert.deepEqual(event.after.dir,{x:1,y:-1},'An open route changes from cardinal travel into a 45-degree diagonal');
    await page.evaluate(()=>__turnFixture.focus({x:14,y:7}));
    event=await step();
    assert.deepEqual(event.after.dir,{x:1,y:0},'After a diagonal the head can continue through another gentle 45-degree turn');
    checks.push('successive cardinal/diagonal/cardinal turns stay gentle');

    for(const dir of [{x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1}]){
      for(const sharp of [{x:-dir.x,y:0},{x:0,y:-dir.y}]){
        for(const length of [1,3]){
          const head={x:9,y:7};
          await arena({body:chain(head,dir,length),dir,target:{x:head.x+sharp.x*4,y:head.y+sharp.y*4}});
          event=await step();
          assert.ok(!equal(event.after.dir,sharp),'Neither side of a diagonal can select a 135-degree shortcut');
        }
      }
    }
    checks.push('full snakes and solitary heads reject 135-degree shortcuts on both sides of every diagonal heading');

    await arena({body:chain({x:9,y:7},{x:1,y:-1}),dir:{x:1,y:-1},target:{x:13,y:11}});
    event=await step();
    assert.equal(Math.round(angle({x:1,y:-1},event.after.dir)),45,'A gentle exit wins over a target-facing 90-degree exit');
    await arena({body:chain({x:9,y:7},{x:1,y:0}),dir:{x:1,y:0},walls:[{x:10,y:7}],target:{x:9,y:3}});
    event=await step();
    assert.deepEqual(event.after.dir,{x:0,y:-1},'A necessary 90-degree corner remains legal when both diagonal exits are blocked');
    checks.push('45-degree exits have priority; 90-degree corners remain available when needed');

    const diagonalBody=chain({x:9,y:7},{x:1,y:-1});
    await arena({body:diagonalBody,dir:{x:1,y:-1},open:[{x:8,y:7},{x:9,y:8},{x:7,y:8},{x:8,y:9},...rect(3,7,9,12)]});
    event=await step();
    assert.ok(event.after.reversing,'If only sharp front turns exist, the snake begins retreat instead of taking one');
    let moved=false;
    for(let i=0;i<5&&!moved;i++){event=await step();moved=!sameBody(event.before.body,event.after.body);}
    assert.ok(moved,'Rejecting a sharp corner still allows the snake to find legal reverse movement');
    checks.push('a 135-degree-only front initiates safe retreat without freezing');

    const tailBody=diagonalBody.slice().reverse(),tailDir={x:-1,y:1};
    for(const cached of [{x:-1,y:0},{x:0,y:1},{x:1,y:1}]){
      await arena({body:tailBody,dir:tailDir,reverse:true,walls:[{x:10,y:6}]});
      await page.evaluate(d=>{__turnFixture.failHeadExits();__turnFixture.cacheTail(d);},cached);
      event=await step();
      if(sameBody(event.before.body,event.after.body))event=await step();
      assert.ok(!sameBody(event.before.body,event.after.body),'An invalid cached retreat turn is replaced by a usable route');
      assert.ok(event.after.reversing,'A usable retreat continues tail-first');
      const move=delta(event.after.body.at(-1),event.before.body.at(-1));
      assert.equal(Math.round(angle({x:1,y:-1},move)),45,'Tail steering uses its outward tangent and prefers a gentle turn over cached sharp or 90-degree turns');
    }
    checks.push('tail-led plans and cached routes use outward heading and prefer 45-degree turns');

    await arena({body:[{x:7,y:7},{x:8,y:7},{x:9,y:7}],dir:{x:-1,y:0},reverse:true,walls:[{x:10,y:7}]});
    await page.evaluate(()=>__turnFixture.failHeadExits());
    event=await step();
    if(sameBody(event.before.body,event.after.body))event=await step();
    assert.ok(event.after.reversing&&!sameBody(event.before.body,event.after.body),'The tail can retreat through a necessary square corner');
    assert.equal(Math.round(angle({x:1,y:0},delta(event.after.body.at(-1),event.before.body.at(-1)))),90,
      'The outward tail direction permits 90 degrees when both 45-degree routes are blocked');
    checks.push('tail-led movement retains necessary 90-degree corners');

    await arena({body:[{x:7,y:7},{x:8,y:7},{x:9,y:7}],dir:{x:-1,y:0},reverse:true,
      target:{x:10,y:6},open:[{x:7,y:7},{x:8,y:7},{x:9,y:7},{x:10,y:7},
        {x:9,y:6},{x:10,y:6},{x:8,y:6},{x:8,y:5}]});
    await page.evaluate(()=>__turnFixture.visitedTail({x:1,y:0}));
    event=await step();
    assert.ok(event.after.reversing,'The player blocks a tail destination, without forcing an unsafe forward attack');
    assert.deepEqual(event.after.body.at(-1),{x:9,y:6},
      'An occupied 45-degree tail destination cannot suppress the planner-approved 90-degree escape');
    assert.ok(!event.after.body.some(p=>equal(p,{x:10,y:6})),'The tail never enters the player while escaping');
    checks.push('the retreat planner and executor both exclude player-occupied gentle turns before preferring an available 90-degree escape');

    await arena({body:chain({x:11,y:7},{x:1,y:0},8),dir:{x:1,y:0},reverse:true,
      open:[...rect(1,11,7,7),...rect(4,4,8,12),{x:3,y:6},{x:4,y:6},{x:7,y:6},{x:7,y:5}]});
    event=await step();
    if(sameBody(event.before.body,event.after.body))event=await step();
    assert.deepEqual(event.after.body.at(-1),{x:4,y:8},
      'A short straight arm and 45-degree pocket cannot suppress the 90-degree route with enough runway to free the head');
    assert.ok(event.after.planRelaxed,'The bounded planner finds this escape only after its gentle-turn pass fails');
    for(let i=0;i<8&&event.after.reversing;i++)event=await step();
    assert.equal(event.after.reversing,false,'The verified 90-degree retreat reaches a real new head exit');
    assert.deepEqual(event.after.body[0],{x:7,y:7},'The head reaches the intended junction without detouring back into the short arm');
    event=await step();
    assert.deepEqual(event.after.body[0],{x:7,y:6},'The head actually takes the new forward passage after the escape');
    checks.push('failed gentle retreat routes trigger a verified 90-degree escape while arbitrary cached 90-degree turns remain disallowed');

    for(const solitary of [false,true]){
      await arena({body:solitary?[{x:9,y:7}]:diagonalBody,dir:{x:1,y:-1},reverse:true,
        trail:solitary?[{x:8,y:8}]:[],target:{x:5,y:7}});
      if(!solitary)await page.evaluate(()=>__turnFixture.pending({x:-1,y:0}));
      event=await step();
      if(sameBody(event.before.body,event.after.body))event=await step();
      assert.ok(!sameBody(event.before.body,event.after.body),'A reversing head finds an allowed forward or reverse route');
      assert.ok(!equal(event.after.dir,{x:-1,y:0}),'Retreat resume cannot use a 135-degree heading');
    }
    checks.push('solitary retreat and queued forward resumes obey the same turn limit');

    await arena({body:[{x:9,y:7}],dir:{x:1,y:-1},reverse:true,
      trail:[{x:6,y:8},{x:7,y:8},{x:8,y:8}],
      open:[{x:9,y:7},{x:8,y:7},{x:9,y:8},{x:8,y:8},{x:7,y:8},{x:6,y:8}]});
    event=await step();
    assert.deepEqual(event.after.body[0],{x:8,y:8},'The solitary head can genuinely move backward along its old diagonal');
    assert.ok(event.after.reversing,'Retracing a diagonal retains backward travel');
    event=await step();
    assert.deepEqual(event.after.body[0],{x:7,y:8},'Backward history continues through its gentle corner');
    assert.ok(equal(event.after.dir,{x:1,y:0}),'The backwards-facing head rotates by 45 degrees along the remembered corner');
    checks.push('a solitary head retraces diagonal and cardinal history without confusing reverse travel with a sharp steering turn');

    await arena({body:[{x:9,y:7}],dir:{x:1,y:0},trail:[],
      open:[{x:9,y:7},{x:8,y:7},{x:7,y:7}]});
    event=await step();
    assert.ok(event.after.reversing,'A newly isolated head without history enters reverse mode when its front is blocked');
    event=await step();
    assert.deepEqual(event.after.body[0],{x:8,y:7},'An empty history does not prevent genuine backwards movement through available space');
    assert.ok(equal(event.after.dir,{x:1,y:0})&&event.after.reversing,'The solitary head backs out while preserving its forward-facing orientation');
    event=await step();
    assert.deepEqual(event.after.body[0],{x:7,y:7},'Exploratory reverse movement continues instead of immediately returning to the old dead end');
    assert.ok(event.after.reversing,'Backing out without history does not oscillate between adjacent cells');
    checks.push('newly separated solitary heads can back out without remembered history or illegal steering');

    for(const seed of [123,98765]){
      const result=await page.evaluate(seed=>__turnFixture.live(seed),seed);
      assert.ok(result.transitions.length>100,'The live maze audit observes sustained real movement');
      counts.liveTransitions+=result.transitions.length;
      for(const event of result.transitions)audit({...event,maze:result.maze});
    }
    assert.ok(counts.reverse>10&&counts.forward>100,'Live play covers both forward and tail-led movement');
    checks.push('sustained live-maze movement preserves angle limits, connected bodies and smooth curves');
    assert.deepEqual(errors,[],'No browser errors');
    console.log(JSON.stringify({ok:true,checks,counts},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
