// Exercise the production experiment's input, movement scheduler and snake
// navigation through test-only fixtures injected into its browser response.
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/experiments/3d/';
const fixture=`
  globalThis.__diagonalFixture={
    manual:true,
    arena({x=9,y=7,dir={x:0,y:1},walls=[],waiting=true}={}){
      experimentRelease();CentralGameClock.reset(1000);
      gameOver=false;gameOverPending=false;paused=false;experimentCompleted=false;
      maze=Array.from({length:ROWS},(_,cy)=>Array.from({length:COLS},(_,cx)=>
        cx===0||cx===COLS-1||cy===0||cy===ROWS-1?'#':'.'));
      for(const [wx,wy] of walls)maze[wy][wx]='#';
      mazeRevision++;eggObstacleRevision++;
      Object.assign(player,{
        x,y,prevX:x,prevY:y,moveFromX:x,moveFromY:y,moveToX:x,moveToY:y,
        moveStartedAt:1000,moveDuration:95,lastMove:1000,experimentStepDistance:1,
        dir:{...dir},nextDir:{...dir},dead:false,eliminated:false,
        hideDeathSprite:false,waitingForInput:waiting,pointerNavigation:null,
        pointerMomentum:false,reactionAssistRicochet:null,spawnShieldUntil:Infinity,
        powerModeUntil:0,deathStartedAt:null,respawnAt:null
      });
      snakes=[];snakes=[makeSnake(2,2,1,{x:1,y:0})];
      snakes[0].lastMove=Infinity;snakes[0].color='#079ed1';
      eggs=[];hunters=[];fruits=[];scorpion=null;scorpionSpawnAt=Infinity;
      experimentBites=[];experimentPredations=[];experimentGeneration++;
      GameplayAssistOptions.setReactionAssistEnabled(true);
      return this.state();
    },
    state(){return{
      x:player.x,y:player.y,dir:{...player.dir},nextDir:{...player.nextDir},
      duration:player.moveDuration,stepDistance:player.experimentStepDistance,
      held:Object.keys(player.keyboardHeldKeys||{}),lastMove:player.lastMove
    };},
    advance(dt=200){
      const t=gameTimeNow()+dt;CentralGameClock.reset(t);advancePlayer(player,t);
      return this.state();
    },
    scheduled(steps=5){
      const result=[];let before={x:player.x,y:player.y};
      const start=gameTimeNow();
      for(let dt=.5;dt<=2000&&result.length<steps;dt+=.5){
        const t=start+dt;CentralGameClock.reset(t);update(t,t);
        if(player.x!==before.x||player.y!==before.y){
          result.push({time:t,x:player.x,y:player.y,duration:player.moveDuration,
            distance:Math.hypot(player.x-before.x,player.y-before.y)});
          before={x:player.x,y:player.y};
        }
      }
      return result;
    },
    routeDistance(origin,target){
      const field=experimentBuildRouteField(target,(x,y)=>!isWall(x,y));
      return field[origin.y*COLS+origin.x];
    },
    snakeChoice(d,step=false){
      player.x=9+d.x*4;player.y=7+d.y*4;player.spawnShieldUntil=0;
      const s=makeSnake(9,7,1,{x:d.x,y:0});
      s.body=[{x:9,y:7},{x:9-d.x,y:7},{x:9-d.x*2,y:7}];
      s.dir={x:d.x,y:0};s.lastMove=1000;
      s.brainState={phase:0,period:4200,focus:.6,focusUntil:Infinity,
        target:{x:player.x,y:player.y},planType:'chase',planUntil:Infinity,
        surpriseAt:Infinity,lastChoice:null,brainId:1,coordinationRole:0,
        targetPlayerId:player.id,targetPlayerUntil:Infinity,routeHistory:[],
        planDistance:Infinity,planStalls:0,planTargetKey:''};
      snakes=[s];
      const random=Math.random;Math.random=()=>0;
      try{
        const options=forwardOptions(s),choice=chooseForwardDirection(s,options);
        if(step)snakeStep(s,gameTimeNow());
        return {choice,options,body:experimentCopy(s.body),dir:{...s.dir}};
      }finally{Math.random=random;}
    },
    snakeClearance({origin={x:9,y:7},direction={x:1,y:1},body,otherBody}={}){
      const s=makeSnake(origin.x,origin.y,1,{x:1,y:0});
      if(body)s.body=experimentCopy(body);
      snakes=[s];
      if(otherBody){const other=makeSnake(2,2,1,{x:1,y:0});other.body=experimentCopy(otherBody);snakes.push(other);}
      return experimentSnakeStepOpen(origin,direction,s,true);
    },
    chaseState(s,target){
      s.brainState={phase:0,period:4200,focus:.6,focusUntil:Infinity,
        target:{...target},planType:'chase',planUntil:Infinity,
        surpriseAt:Infinity,lastChoice:null,brainId:1,coordinationRole:0,
        targetPlayerId:player.id,targetPlayerUntil:Infinity,routeHistory:[],
        planDistance:Infinity,planStalls:0,planTargetKey:''};
    },
    snakeScheduled(diagonal){
      this.arena({x:diagonal?12:13,y:diagonal?12:4});
      player.spawnShieldUntil=0;GameplayAssistOptions.setReactionAssistEnabled(false);
      const s=makeSnake(4,4,1,{x:1,y:0});
      s.body=[{x:4,y:4},{x:3,y:4},{x:2,y:4}];
      s.lastMove=1000;s.experimentStepDistance=1;snakes=[s];
      this.chaseState(s,player);
      const random=Math.random;Math.random=()=>0;
      const events=[];let before={...s.body[0]};
      try{
        for(let dt=.5;dt<=2000&&events.length<5;dt+=.5){
          const t=1000+dt;CentralGameClock.reset(t);update(t,t);
          if(s.body[0].x!==before.x||s.body[0].y!==before.y){
            events.push({time:t,head:{...s.body[0]},distance:Math.hypot(s.body[0].x-before.x,s.body[0].y-before.y),
              motion:experimentSnakeSnapshot(s).motion});
            before={...s.body[0]};
          }
        }
        return events;
      }finally{Math.random=random;}
    },
    consume(kind){
      const split=kind==='split',attack=kind==='predation';
      const start=attack?{x:10,y:8,dir:{x:-1,y:-1}}:
        split?{x:8,y:6,dir:{x:1,y:1}}:{x:5,y:9,dir:{x:1,y:-1}};
      this.arena({...start,waiting:attack});
      GameplayAssistOptions.setReactionAssistEnabled(false);
      if(attack)player.spawnShieldUntil=0;
      const body=attack?[{x:9,y:7},{x:8,y:6},{x:7,y:5}]:
        split?[{x:12,y:5},{x:11,y:5},{x:10,y:6},{x:9,y:7},{x:8,y:8},{x:7,y:8},{x:6,y:9}]:
        [{x:11,y:5},{x:10,y:5},{x:9,y:6},{x:8,y:7},{x:7,y:7},{x:6,y:8}];
      const dir={x:body[0].x-body[1].x,y:body[0].y-body[1].y};
      const s=makeSnake(body[0].x,body[0].y,1,dir);
      s.body=experimentCopy(body);s.dir=dir;s.color='#079ed1';snakes=[s];
      s.lastMove=1000;s.experimentStepDistance=1;
      if(!split&&!attack)beginTailLedRetreat(s,gameTimeNow());
      const lives=player.lives,score=player.score;
      const random=Math.random;Math.random=()=>0;
      try{
        if(attack){this.chaseState(s,player);CentralGameClock.reset(1220);update(1220,1220);}
        else advancePlayer(player,gameTimeNow());
        return {before:body,livesBefore:lives,scoreBefore:score,snapshot:experimentSnapshot(),
          tailGuide:s.tailGuide?{...s.tailGuide,dir:{...s.tailGuide.dir}}:null};
      }finally{Math.random=random;}
    }
  };
`;

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[],checks=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route(url=>url.pathname.endsWith('/engine/maze-biters-experiment.js'),route=>{
      let source=fs.readFileSync(path.join(__dirname,'../engine/maze-biters-experiment.js'),'utf8');
      const anchor='globalThis.MazeBiters3DEngine=Object.freeze({';
      assert.ok(source.includes(anchor),'The engine fixture insertion point exists');
      assert.ok(source.includes('step(realTime){'),'The normal frame scheduler can be isolated');
      source=source.replace(anchor,fixture+anchor).replace('step(realTime){','step(realTime){if(globalThis.__diagonalFixture.manual)return;');
      return route.fulfill({contentType:'text/javascript',body:source});
    });
    await page.goto(base);
    await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:60000});
    await page.waitForFunction(()=>globalThis.__mazeBiters3D?.snapshot().started);
    const reset=options=>page.evaluate(options=>__diagonalFixture.arena(options),options||{});
    const advance=()=>page.evaluate(()=>__diagonalFixture.advance());
    const release=()=>page.evaluate(()=>MazeBiters3DEngine.release());
    const pairs=[
      {keys:['ArrowRight','ArrowDown'],dir:{x:1,y:1}},
      {keys:['ArrowRight','ArrowUp'],dir:{x:1,y:-1}},
      {keys:['ArrowLeft','ArrowDown'],dir:{x:-1,y:1}},
      {keys:['ArrowLeft','ArrowUp'],dir:{x:-1,y:-1}}
    ];
    for(const {keys,dir} of pairs){
      await reset();
      await page.keyboard.down(keys[0]);await page.keyboard.down(keys[1]);
      const diagonal=await advance();
      assert.deepEqual([diagonal.x,diagonal.y],[9+dir.x,7+dir.y],`${keys.join('+')} traverses one real diagonal`);
      assert.deepEqual(diagonal.dir,dir,'The player retains the intermediate heading');
      assert.ok(Math.abs(diagonal.stepDistance-Math.SQRT2)<1e-9,'A diagonal records its actual travel distance');
      await page.keyboard.up(keys[1]);
      const cardinal=await advance();
      assert.deepEqual([cardinal.x,cardinal.y],[9+dir.x*2,7+dir.y],'Releasing one key immediately leaves the still-held cardinal direction');
      assert.ok(Math.abs(diagonal.duration/cardinal.duration-Math.SQRT2)<1e-9,'The visual slide travels at equal speed in both headings');
      await page.keyboard.up(keys[0]);
    }
    checks.push('all four diagonal keyboard pairs, intermediate headings, one-key release and distance-normalized slides');

    for(const touch of [false,true])for(const {dir} of pairs){
      await reset();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const point=await page.evaluate(dir=>{
        const diagnostic=__mazeBiters3D.diagnostics(),center=diagnostic.presentation.playerScreen;
        return {x:center.x+dir.x*100,y:center.y+dir.y*100*Math.cos(diagnostic.renderer.tiltDegrees*Math.PI/180)};
      },dir);
      if(touch)await page.touchscreen.tap(point.x,point.y);
      else await page.mouse.click(point.x,point.y);
      const result=await advance();
      assert.deepEqual([result.x,result.y],[9+dir.x,7+dir.y],`${touch?'Touch':'Mouse'} chooses a diagonal in the projected maze plane`);
      assert.deepEqual(result.held,[],'A diagonal tap does not leave synthetic keys held');
    }
    checks.push('mouse and touch select all four diagonals with the tilted camera');

    await reset();await page.keyboard.down('ArrowLeft');await page.keyboard.down('ArrowRight');
    assert.deepEqual((({x,y})=>[x,y])(await advance()),[10,7],'The newest opposite key wins');
    await page.keyboard.up('ArrowLeft');await page.keyboard.up('ArrowRight');
    for(const test of [
      {walls:[[10,7]],expected:[9,8],name:'blocked horizontal flank'},
      {walls:[[9,8]],expected:[10,7],name:'blocked vertical flank'},
      {walls:[[10,8]],expected:[9,8],name:'blocked diagonal destination'},
      {walls:[[10,7],[9,8]],expected:[9,7],name:'closed corner with a free diagonal destination'}
    ]){
      await reset({walls:test.walls});
      await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowDown');
      const result=await advance();
      assert.deepEqual([result.x,result.y],test.expected,test.name+' uses only an available cardinal passage');
      await page.keyboard.up('ArrowRight');await page.keyboard.up('ArrowDown');
    }
    await reset({dir:{x:1,y:1},waiting:false,walls:[[10,7]]});
    assert.deepEqual((({x,y})=>[x,y])(await advance()),[9,8],'Unheld diagonal momentum follows the open component beside a wall');
    checks.push('opposite-key priority, both diagonal flank blockers, blocked target, sealed corner and momentum fallback');

    await reset({x:4,y:4,dir:{x:1,y:0},waiting:false});
    const cardinal=await page.evaluate(()=>__diagonalFixture.scheduled());
    await reset({x:4,y:4,dir:{x:1,y:1},waiting:false});
    const diagonal=await page.evaluate(()=>__diagonalFixture.scheduled());
    assert.equal(cardinal.length,5,'The real update scheduler produces five cardinal moves');
    assert.equal(diagonal.length,5,'The real update scheduler produces five diagonal moves');
    const speed=events=>events.slice(1).reduce((sum,event)=>sum+event.distance,0)/(events.at(-1).time-events[0].time);
    const speeds={cardinal:speed(cardinal),diagonal:speed(diagonal)};
    assert.ok(Math.abs(speeds.diagonal/speeds.cardinal-1)<.008,'Diagonal movement has the same world-space speed, within simulation tick precision');
    for(let i=1;i<diagonal.length;i++)assert.ok(diagonal[i].time-diagonal[i-1].time>=95*Math.SQRT2,'A diagonal cannot reuse a cardinal-length movement interval');
    checks.push('production update timing preserves equal world-space speed without a diagonal speed boost');

    await reset();
    const target={x:13,y:11},origin={x:9,y:7};
    const distance=await page.evaluate(({origin,target})=>__diagonalFixture.routeDistance(origin,target),{origin,target});
    assert.ok(Math.abs(distance-4*Math.SQRT2)<1e-9,'The snake route field uses the true four-diagonal shortest distance');
    await reset({walls:[[10,7]]});
    const detour=await page.evaluate(({origin,target})=>__diagonalFixture.routeDistance(origin,target),{origin,target});
    assert.ok(detour>distance+.5,'A wall corner forces a longer route instead of a diagonal cut');
    for(const {dir} of pairs){
      await reset();
      const result=await page.evaluate(dir=>__diagonalFixture.snakeChoice(dir,true),dir);
      assert.deepEqual(result.choice,dir,'A snake targeting a diagonal point chooses the shorter direction');
      assert.deepEqual(result.body[0],{x:9+dir.x,y:7+dir.y},'The actual snake step follows the chosen diagonal');
      assert.deepEqual(result.dir,dir,'The actual snake heading follows its diagonal travel');
    }
    await reset({walls:[[10,7]]});
    assert.equal(await page.evaluate(()=>__diagonalFixture.snakeClearance()),false,'A snake cannot cut past a wall corner');
    await reset({walls:[[10,8]]});
    assert.equal(await page.evaluate(()=>__diagonalFixture.snakeClearance()),false,'A snake cannot enter a wall diagonally');
    await reset();
    assert.equal(await page.evaluate(()=>__diagonalFixture.snakeClearance()),true,'A snake may move diagonally in clear space');
    assert.equal(await page.evaluate(()=>__diagonalFixture.snakeClearance({
      origin:{x:10,y:7},direction:{x:-1,y:1},otherBody:[{x:9,y:7},{x:10,y:8}]
    })),false,'A diagonal cannot cross another snake\'s diagonal body edge');
    checks.push('weighted snake shortcuts in all four quadrants, committed diagonal steps, wall clearance and body-edge crossing rejection');

    const snakeCardinal=await page.evaluate(()=>__diagonalFixture.snakeScheduled(false));
    const snakeDiagonal=await page.evaluate(()=>__diagonalFixture.snakeScheduled(true));
    assert.equal(snakeCardinal.length,5,'The actual snake update completes five cardinal steps');
    assert.equal(snakeDiagonal.length,5,'The actual snake update completes five diagonal steps');
    const snakeSpeeds={cardinal:speed(snakeCardinal),diagonal:speed(snakeDiagonal)};
    assert.ok(Math.abs(snakeSpeeds.diagonal/snakeSpeeds.cardinal-1)<.008,'The actual snake scheduler preserves world-space speed on a diagonal');
    for(const [events,distance] of [[snakeCardinal,1],[snakeDiagonal,Math.SQRT2]]){
      for(const event of events){
        assert.ok(Math.abs(event.distance-distance)<1e-9,'The timing fixture exercises the requested actual heading');
        assert.ok(event.motion.duration>=218*distance&&event.motion.duration<218*distance+1000/120,'The visual snake slide uses its actual distance with only render-tick rounding');
      }
    }
    checks.push('actual snake update and recorded visual motion preserve cardinal/diagonal travel speed');

    function assertBody(body,label){
      assert.equal(new Set(body.map(p=>`${p.x},${p.y}`)).size,body.length,label+' has no duplicated cells');
      for(let i=1;i<body.length;i++)assert.equal(Math.max(Math.abs(body[i].x-body[i-1].x),Math.abs(body[i].y-body[i-1].y)),1,label+' remains connected through cardinal or diagonal neighbours');
    }
    for(const kind of ['tail','split','predation']){
      const result=await page.evaluate(kind=>__diagonalFixture.consume(kind),kind),snapshot=result.snapshot;
      if(kind==='predation'){
        assert.equal(snapshot.player.dead,true,'A snake entering the player diagonally eats the player');
        assert.equal(snapshot.player.lives,result.livesBefore-1,'Diagonal predation costs exactly one life');
        assert.equal(snapshot.predations.length,1,'Diagonal predation emits one real consumption event');
        assert.deepEqual(snapshot.snakes[0].body[0],{x:10,y:8},'The attacking snake actually traverses the diagonal contact');
        assert.deepEqual(snapshot.predations[0].snake.dir,{x:1,y:1},'The predation event retains the diagonal mouth heading');
        assert.ok(snapshot.predations[0].snake.motion,'The attack event includes its committed visual route');
      }else{
        assert.equal(snapshot.player.dead,false,'A diagonal segment bite keeps the player alive');
        assert.equal(snapshot.bites.length,1,'A diagonal segment bite emits exactly one eating event');
        assert.equal(snapshot.bites[0].kind,kind==='split'?'body':'tail','The eating event retains its semantic kind');
        assert.deepEqual(snapshot.bites[0].snake.body,result.before,'The eating event retains the complete original mixed route');
        assert.equal(snapshot.snakes.reduce((sum,s)=>sum+s.body.length,0),result.before.length-1,'Eating removes exactly one segment');
        assert.ok(snapshot.player.score>result.scoreBefore,'The actual contact awards points');
        snapshot.snakes.forEach(s=>assertBody(s.body,'Surviving fragment'));
        if(kind==='tail'){
          assert.equal(snapshot.snakes.length,1,'A tail bite preserves the original snake');
          assert.deepEqual(snapshot.snakes[0].body,result.before.slice(0,-1),'A tail bite removes only the final diagonal-connected segment');
          const body=snapshot.snakes[0].body,tail=body.at(-1),neck=body.at(-2);
          assert.deepEqual(result.tailGuide,{x:tail.x,y:tail.y,dir:{x:tail.x-neck.x,y:tail.y-neck.y}},'A bite reanchors the reversing guide to the shortened tail');
        }else{
          assert.equal(snapshot.snakes.length,2,'A body bite makes two live fragments');
          assert.deepEqual(snapshot.snakes[0].body,result.before.slice(0,3),'The front fragment keeps its original order');
          assert.deepEqual(snapshot.snakes[1].body,result.before.slice(4).reverse(),'The rear fragment starts at the former tail');
          assert.deepEqual(snapshot.snakes[1].dir,{x:-1,y:1},'The former tail becomes a correctly oriented diagonal head');
          assert.deepEqual(snapshot.bites[0].fragments.map(f=>f.sourceIndices),[[0,1,2],[6,5,4]],'Fragment animation preserves source correspondence through diagonal reversal');
        }
      }
    }
    checks.push('actual diagonal tail bites, splits and snake predation preserve fragments, endpoint headings and consumption events');
    await release();
    assert.deepEqual(errors,[],'The real application has no browser errors during diagonal movement checks');
    console.log(JSON.stringify({errors,checks,speeds,snakeSpeeds,routeDistances:{open:distance,cornerDetour:detour}},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
