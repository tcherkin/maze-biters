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
  let experimentPlayerRoutes=new WeakMap();
  let experimentPlayerRouteEpoch=0;
  const experimentSeed=0x3D019300;
  // Injected from maze-layout.mjs by the generator, alongside the maze itself.
  const experimentOpeningSnakes=__CONCEPT_SNAKES__;
  const experimentCopy=points=>points.map(({x,y})=>({x,y}));
  // A presentation-only feed of reached movement endpoints. Logical targets
  // are committed before their interpolation finishes, so future endpoints
  // stay private until the snapshot clock actually reaches them. Long models
  // can retain every corner across sparse render frames without steering play.
  function experimentResetPlayerRoute(p,t=gameTimeNow(),x=p.x,y=p.y){
    const form=p.experimentDragonForm;
    if(form?.travel){
      const u=Math.max(0,Math.min(1,(experimentPlayerWalkDistance(p,t)-form.travel.start)/form.travel.distance));
      form.from+=(form.to-form.from)*u*u*(3-2*u);
      form.travel={start:0,distance:Math.max(.001,form.travel.distance*(1-u))};
    }
    const route={epoch:++experimentPlayerRouteEpoch,sequence:0,logicalX:x,logicalY:y,bodyDirection:{...p.dir},
      lastTime:t,points:[{sequence:0,x,y,time:t,started:t,walkDistance:0}]};
    experimentPlayerRoutes.set(p,route);
    return route;
  }
  function experimentRecordPlayerStep(p,t){
    let route=experimentPlayerRoutes.get(p);
    if(!route||t<route.lastTime||route.logicalX!==p.prevX||route.logicalY!==p.prevY)
      route=experimentResetPlayerRoute(p,t,p.prevX,p.prevY);
    const previous=route.points[route.points.length-1];
    // An early commit starts at the old logical target in the existing engine.
    // Preserve that exact endpoint, even if its old interval was not complete.
    if(previous&&previous.time>t) previous.time=t;
    route.logicalX=p.x;route.logicalY=p.y;route.lastTime=t;
    route.points.push({sequence:++route.sequence,x:p.x,y:p.y,started:t,
      walkDistance:previous.walkDistance+(p.reactionAssistRicochet?0:Math.hypot(p.x-p.prevX,p.y-p.prevY)),
      time:t+Math.max(1,p.moveDuration||95)});
    if(route.points.length>128) route.points.shift();
  }
  function experimentPlayerWalkDistance(p,t){
    const points=experimentPlayerRoutes.get(p)?.points;
    if(!points?.length)return 0;
    let previous=points[0];
    for(let i=1;i<points.length;i++){
      const point=points[i];
      if(t<point.time){
        const u=Math.max(0,Math.min(1,(t-point.started)/Math.max(1,point.time-point.started)));
        return previous.walkDistance+(point.walkDistance-previous.walkDistance)*u;
      }
      previous=point;
    }
    return previous.walkDistance;
  }
  function experimentPlayerRouteSnapshot(p,t){
    // Presentation time may be a fraction ahead of the simulation and several
    // observers may request different sub-frame times. Only the simulation
    // clock may detect a reset; rendering must not reset or advance the feed.
    const now=gameTimeNow();let route=experimentPlayerRoutes.get(p);
    if(!route||now<route.lastTime||route.logicalX!==p.x||route.logicalY!==p.y)
      route=experimentResetPlayerRoute(p,now);
    route.lastTime=now;
    return {epoch:route.epoch,points:route.points.filter(point=>point.time<=t)
      .map(point=>({...point}))};
  }
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
    if(experimentPlayerEscaping(p,t)||experimentTryShedDragonRear(s,p,t))return false;
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
    s.experimentStepDistance=experimentSnakeTravelLength(from,s.body,s.reversing);
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
    experimentDragonEvents=[];experimentDragonEventSerial=0;
    experimentPlayerRoutes=new WeakMap();
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
  function experimentSnapshot(presentationRealTime){
    const animate=experimentStarted&&!paused&&!gameOver&&!experimentCompleted&&!document.hidden;
    const t=animate?CentralGameClock.presentationTime(presentationRealTime):gameTimeNow();
    return {
      generation:experimentGeneration,started:experimentStarted,time:t,speed:experimentSpeed,
      seed:experimentSeed,cols:COLS,rows:ROWS,maze:maze.map(row=>[...row].join('')),
      paused,complete:experimentCompleted,gameOver,level,
      dragonEvents:experimentDragonEvents.map(event=>({...event,dir:{...event.dir}})),
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
        route:experimentPlayerRouteSnapshot(player,t),
        dead:player.dead,hidden:player.hideDeathSprite,lives:player.lives,score:player.score,
        deathStartedAt:player.deathStartedAt??null,respawnAt:player.respawnAt??null,
        shield:player.spawnShieldUntil>t||experimentPlayerEscaping(player,t),powered:isPowerMode(player,t),
        length:experimentDragonLength(player),visualLength:experimentDragonVisualLength(player,t),
        compact:!!player.experimentCompact,compactness:experimentDragonCompactness(player,t),
        restoring:!!player.experimentRestorePending,escapeShield:experimentPlayerEscaping(player,t),
        ricochet:!!player.reactionAssistRicochet
      }:null,
      snakes:snakes.map(experimentSnakeSnapshot)
    };
  }
  globalThis.MazeBiters3DEngine=Object.freeze({
    setPlayerModel(model){experimentDragonBody=typeof model==='string'&&model.startsWith('dragon');experimentDragonSecondChance=model==='dragon';},
    start:experimentStart,
    setSpeed(value){
      if(Number.isFinite(value)) experimentSpeed=Math.max(.25,Math.min(1,value));
      return experimentSpeed;
    },
    step(realTime){
      if(!experimentStarted) return;
      const enabled=!paused&&!gameOver&&!experimentCompleted&&!document.hidden;
      // Finish only an already committed step or the bite animation at victory.
      // A stationary compact dragon must not regrow behind the panel.
      const form=player?.experimentDragonForm;
      const finishingForm=experimentCompleted&&!paused&&!document.hidden&&form&&
        gameTimeNow()<Math.max(form.time+(form.travel?0:form.duration),
          experimentPlayerRoutes.get(player)?.points.at(-1)?.time||0);
      const t=CentralGameClock.advance(realTime,enabled||finishingForm);
      if(enabled){ scorpionSpawnAt=Infinity; update(t,realTime); }
      if(enabled||finishingForm)experimentUpdateDragonForm(player,t);
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
    tapVector(d){
      if(!experimentStarted||experimentCompleted||gameOver||paused||player?.dead||
         !d||!Number.isInteger(d.x)||!Number.isInteger(d.y)||
         Math.max(Math.abs(d.x),Math.abs(d.y))!==1)return;
      player.pointerNavigation=null;player.pointerMomentum=false;
      player.nextDir={x:d.x,y:d.y};player.waitingForInput=false;
    },
    audio(){ SoundManager.unlockFromGesture(); MediaMusic.unlockFromGesture(); },
    hud(target){
      if(!player) return;
      target.clearRect(0,0,576,32);
      drawBitmapText(target,`P1 ${String(player.score).padStart(4,'0')}`,0,0,{smooth:true});
      drawBitmapText(target,`LIVES ${player.lives}`,0,16,{smooth:true});
      drawBitmapText(target,'LEVEL 1',288,0,{align:'center',smooth:true});
      drawBitmapText(target,`SNAKES ${snakes.length}`,288,16,{align:'center',smooth:true});
      drawBitmapText(target,'DUSK 3D',576,0,{align:'right',smooth:true});
      drawBitmapText(target,'EXPERIMENT',576,16,{align:'right',fontSprites:RedFontSprites,smooth:true});
    },
    title(target){ drawBitmapText(target,'MAZE BITERS',0,0,{smooth:true}); }
  });
  globalThis.__mazeBitersReady=(async()=>{
    await Promise.all(Object.values(RenderAtlases).map(waitForRenderImage));
    prepareFontRenderCache();
    mazeRunSeed=experimentSeed;
    applyMazeForLevel(1);
  })();
