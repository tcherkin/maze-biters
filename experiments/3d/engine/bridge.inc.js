  // Transitional boundary: original mechanics and audio live inside this closure.
  // Presentation consumes copies; no mesh position is ever written into gameplay.
  let experimentCompleted=false;
  let experimentStarted=false;
  let experimentSpeed=.5;
  let experimentGeneration=0;
  let experimentMotion=new WeakMap();
  let experimentIds=new WeakMap();
  let experimentSerial=0;
  let experimentBiteSerial=0;
  let experimentBites=[];
  let experimentPredationSerial=0;
  let experimentPredations=[];
  const experimentSeed=0x3D019300;
  // Injected from maze-layout.mjs by the generator, alongside the maze itself.
  const experimentOpeningSnakes=__CONCEPT_SNAKES__;
  const experimentCopy=points=>points.map(({x,y})=>({x,y}));
  function experimentSnakeSnapshot(s){
    if(!experimentIds.has(s)) experimentIds.set(s,++experimentSerial);
    const motion=experimentMotion.get(s);
    return {
      id:experimentIds.get(s),body:experimentCopy(s.body),dir:{...s.dir},
      reversing:s.reversing,color:s.color,
      motion:motion&&motion.to.length===s.body.length?{
        from:experimentCopy(motion.from),to:experimentCopy(motion.to),
        started:motion.started,duration:motion.duration
      }:null
    };
  }
  function experimentRecordBite(s,p,index,kind,t=gameTimeNow()){
    experimentBites.push({
      id:++experimentBiteSerial,time:t,kind,index,
      snake:experimentSnakeSnapshot(s),playerId:p.id,
      player:{visual:{...playerVisualPosition(p,t)},dir:{...p.dir}}
    });
    if(experimentBites.length>16) experimentBites.shift();
  }
  function experimentSnakeAttack(s,p,t=gameTimeNow()){
    const attack=p&&!p.dead?{
      time:t,snake:experimentSnakeSnapshot(s),playerId:p.id,
      player:{id:p.id,visual:{...playerVisualPosition(p,t)},dir:{...p.dir},mouthOpen:p.mouthOpen}
    }:null;
    const result=loseLife(p);
    // Only a confirmed new death belongs to this presentation feed. Existing
    // dead players and game-over-pending rejections cannot create another bite.
    if(attack&&p.dead){
      experimentPredations.push({id:++experimentPredationSerial,...attack});
      if(experimentPredations.length>16) experimentPredations.shift();
    }
    return result;
  }
  function experimentRecordFragments(created){
    const bite=experimentBites[experimentBites.length-1];
    if(!bite) return;
    bite.fragments=created.map(s=>({
      snake:experimentSnakeSnapshot(s),
      // A rear fragment runs in reverse order from the former tail. Preserve
      // that correspondence explicitly for endpoint and body presentation.
      sourceIndices:s.body.map(cell=>bite.snake.body.findIndex(
        source=>source.x===cell.x&&source.y===cell.y
      ))
    }));
  }
  function experimentCopySnakeSnapshot(s){
    return {
      ...s,body:experimentCopy(s.body),dir:{...s.dir},
      motion:s.motion?{
        ...s.motion,from:experimentCopy(s.motion.from),to:experimentCopy(s.motion.to)
      }:null
    };
  }
  function experimentShortenMotion(s){
    const motion=experimentMotion.get(s),length=s.body.length;
    if(motion) experimentMotion.set(s,{
      ...motion,from:experimentCopy(motion.from.slice(0,length)),
      to:experimentCopy(motion.to.slice(0,length))
    });
  }
  function experimentRecordMotion(s,from,t,delay){
    experimentMotion.set(s,{
      from:experimentCopy(from),to:experimentCopy(s.body),started:t,
      // The prototype drives the unchanged update at 120 Hz, regardless of render Hz.
      duration:Math.ceil((delay+0.00001)/(1000/120))*(1000/120)
    });
    // Snake-initiated contact is resolved inside snakeStep, just before its
    // committed visual route is recorded. Give that same-time attack this
    // route too, instead of leaving it with the previous movement interval.
    const id=experimentIds.get(s);
    for(const attack of experimentPredations){
      if(attack.time===t&&attack.snake.id===id) attack.snake=experimentSnakeSnapshot(s);
    }
  }
  function experimentRelease(){
    Object.keys(keys).forEach(key=>{ keys[key]=false; });
    allPlayers().forEach(clearPlayerKeyboardControl);
  }
  function experimentStart(){
    experimentRelease();
    experimentCompleted=false;
    experimentGeneration++;
    experimentMotion=new WeakMap();
    experimentIds=new WeakMap();
    experimentSerial=0;
    experimentBiteSerial=0;
    experimentBites=[];
    experimentPredationSerial=0;
    experimentPredations=[];
    level=1;
    mazeRunSeed=experimentSeed;
    applyMazeForLevel(1);
    awaitingPlayerSelection=true;
    startNewGame(1);
    snakes=[];
    for(const specification of experimentOpeningSnakes){
      const [head,neck]=specification.body;
      const dir={x:head.x-neck.x,y:head.y-neck.y};
      const snake=makeSnake(head.x,head.y,1,dir);
      snake.body=experimentCopy(specification.body);
      snake.color=specification.color;
      snakes.push(snake);
    }
    levelStartingSnakeMass=snakes.reduce((total,snake)=>total+snake.body.length,0);
    scorpionSpawnAt=Infinity;
    player.waitingForInput=false;
    experimentStarted=true;
    updateHud();
  }
  function experimentSnapshot(){
    const t=gameTimeNow();
    return {
      generation:experimentGeneration,started:experimentStarted,time:t,speed:experimentSpeed,
      seed:experimentSeed,cols:COLS,rows:ROWS,maze:maze.map(row=>[...row].join('')),
      paused,complete:experimentCompleted,gameOver,level,
      // Bounded history is non-destructive: several renderers or diagnostics
      // may inspect it without consuming another observer's animation events.
      bites:experimentBites.map(bite=>({
        ...bite,snake:experimentCopySnakeSnapshot(bite.snake),
        player:{visual:{...bite.player.visual},dir:{...bite.player.dir}},
        ...(bite.fragments?{fragments:bite.fragments.map(fragment=>({
          snake:experimentCopySnakeSnapshot(fragment.snake),
          sourceIndices:[...fragment.sourceIndices]
        }))}:{})
      })),
      predations:experimentPredations.map(attack=>({
        ...attack,snake:experimentCopySnakeSnapshot(attack.snake),
        player:{...attack.player,visual:{...attack.player.visual},dir:{...attack.player.dir}}
      })),
      player:player?{
        id:player.id,x:player.x,y:player.y,dir:{...player.dir},
        visual:playerVisualPosition(player,t),mouthOpen:player.mouthOpen,
        dead:player.dead,hidden:player.hideDeathSprite,lives:player.lives,score:player.score,
        deathStartedAt:player.deathStartedAt??null,respawnAt:player.respawnAt??null,
        shield:player.spawnShieldUntil>t,powered:isPowerMode(player,t),
        ricochet:!!player.reactionAssistRicochet
      }:null,
      snakes:snakes.map(experimentSnakeSnapshot)
    };
  }
  globalThis.MazeBiters3DEngine=Object.freeze({
    start:experimentStart,
    setSpeed(value){
      if(Number.isFinite(value)) experimentSpeed=Math.max(.25,Math.min(1,value));
      return experimentSpeed;
    },
    step(realTime){
      if(!experimentStarted) return;
      const enabled=!paused&&!gameOver&&!experimentCompleted&&!document.hidden;
      const t=CentralGameClock.advance(realTime,enabled);
      if(enabled){ scorpionSpawnAt=Infinity; update(t,realTime); }
    },
    poll(){ if(experimentStarted&&!experimentCompleted) GamepadControl.poll(); },
    snapshot:experimentSnapshot,
    pause(){ experimentRelease(); setPaused(!paused); },
    reanchor(realTime){ CentralGameClock.reanchor(realTime); },
    release:experimentRelease,
    direction(key,down){
      if(!experimentStarted||experimentCompleted) return;
      keys[key]=down;
      if(down) pressKeyboardDirection(key); else releaseKeyboardDirection(key);
    },
    tapDirection(key){
      if(!experimentStarted||experimentCompleted||gameOver||paused||player?.dead||!KEYBOARD_DIRECTIONS[key])return;
      // Press commits nextDir immediately; releasing keeps that queued turn.
      // A quick tap survives between simulation steps without a synthetic held
      // key, and cannot release a physically held keyboard key.
      const p=keyboardPlayerForKey(key),wasHeld=!!p?.keyboardHeldKeys?.[key];
      pressKeyboardDirection(key);
      if(!wasHeld)releaseKeyboardDirection(key);
    },
    audio(){ SoundManager.unlockFromGesture(); MediaMusic.unlockFromGesture(); },
    hud(target){
      if(!player) return;
      target.clearRect(0,0,576,32);
      drawBitmapText(target,`P1 ${String(player.score).padStart(4,'0')}`,0,0);
      drawBitmapText(target,`LIVES ${player.lives}`,0,16);
      drawBitmapText(target,'LEVEL 1',288,0,{align:'center'});
      drawBitmapText(target,`SNAKES ${snakes.length}`,288,16,{align:'center'});
      drawBitmapText(target,'DUSK 3D',576,0,{align:'right'});
      drawBitmapText(target,'EXPERIMENT',576,16,{align:'right',fontSprites:RedFontSprites});
    },
    title(target){ drawBitmapText(target,'MAZE BITERS',0,0); }
  });
  globalThis.__mazeBitersReady=(async()=>{
    await Promise.all(Object.values(RenderAtlases).map(waitForRenderImage));
    prepareFontRenderCache();
    mazeRunSeed=experimentSeed;
    applyMazeForLevel(1);
  })();
