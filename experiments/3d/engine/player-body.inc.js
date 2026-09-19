  // Authoritative occupancy for the two-cell dragon. It follows committed
  // movement history, never mesh positions or the browser's render cadence.
  let experimentDragonBody=false;
  let experimentDragonSecondChance=false;
  let experimentDragonEvents=[],experimentDragonEventSerial=0;
  const experimentBodyCache=new WeakMap();
  function experimentPlayerStart(id){
    const start=PLAYER_STARTS[id-1];
    if(!experimentDragonBody)return start;
    // Keep the authored head cell; choose an orientation with room behind it.
    const direction=[start.dir,...dirs].find(d=>!isWall(start.x-d.x,start.y-d.y));
    return direction?{...start,dir:{...direction}}:start;
  }
  function experimentDragonLength(p){return p?.experimentCompact?1:2;}
  function experimentPlayerBodyCells(p,t=gameTimeNow(),length=experimentDragonLength(p)){
    if(!experimentDragonBody||length<=1)return [];
    let route=experimentPlayerRoutes.get(p);
    if(!route||route.logicalX!==p.x||route.logicalY!==p.y)
      route=experimentResetPlayerRoute(p,t);
    const cached=experimentBodyCache.get(p);
    if(cached?.time===t&&cached.route===route&&cached.sequence===route.sequence&&cached.length===length)return cached.cells;
    const visual=playerVisualPosition(p,t),path=[visual];
    for(let i=route.points.length-1;i>=0;i--){
      const point=route.points[i];if(point.time<=t)path.push(point);
    }
    const first=route.points[0],dir=route.bodyDirection||p.dir,n=Math.hypot(dir.x,dir.y)||1;
    path.push({x:first.x-dir.x/n*length,y:first.y-dir.y/n*length});
    const cells=[],keys=new Set();let remaining=length-.75;
    const add=(x,y)=>{x=Math.round(x);y=Math.round(y);const key=x+','+y;if(!keys.has(key)){keys.add(key);cells.push({x,y});}};
    add(visual.x,visual.y);
    for(let i=1;i<path.length&&remaining>0;i++){
      const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.y-a.y);
      if(length<1e-8)continue;
      const take=Math.min(remaining,length),steps=Math.ceil(take/.1);
      for(let j=1;j<=steps;j++){const f=take*j/steps/length;add(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f);}
      remaining-=take;
    }
    experimentBodyCache.set(p,{time:t,route,sequence:route.sequence,length,cells});return cells;
  }
  function experimentPlayerOccupies(p,x,y,t=gameTimeNow()){
    return p.x===x&&p.y===y||experimentDragonBody&&experimentPlayerBodyCells(p,t).some(c=>c.x===x&&c.y===y);
  }
  function experimentDragonVisualLength(p,t=gameTimeNow()){
    const form=p?.experimentDragonForm;
    if(!form)return experimentDragonLength(p);
    const progress=form.travel
      ?(experimentPlayerWalkDistance(p,t)-form.travel.start)/form.travel.distance
      :(t-form.time)/form.duration;
    const u=Math.max(0,Math.min(1,progress));
    return form.from+(form.to-form.from)*u*u*(3-2*u);
  }
  function experimentDragonCompactness(p,t=gameTimeNow()){
    return Math.max(0,Math.min(1,2-experimentDragonVisualLength(p,t)));
  }
  function experimentPlayerEscaping(p,t=gameTimeNow()){
    return !!p&&!p.dead&&(p.experimentEscapeUntil||0)>t;
  }
  function experimentChangeDragonForm(p,length,t,kind,contact,snakeId=null){
    const from=experimentDragonVisualLength(p,t);
    p.experimentDragonLength=length;p.experimentCompact=length===1;
    p.experimentDragonForm={from,to:length,time:t,duration:kind==='shed'?260:480};
    experimentBodyCache.delete(p);
    experimentDragonEvents.push({id:++experimentDragonEventSerial,playerId:p.id,time:t,kind,
      x:contact.x,y:contact.y,dir:{...p.dir},snakeId});
    if(experimentDragonEvents.length>16)experimentDragonEvents.shift();
  }
  function experimentTryShedDragonRear(s,p,t){
    if(!experimentDragonSecondChance||!p||p.dead||gameOverPending||experimentDragonLength(p)<=1)return false;
    const head=s.body[0],visual=playerVisualPosition(p,t);
    // Logical and visibly occupied head cells take priority during a step or
    // instant reversal: overlapping the rear cannot grant a free frontal hit.
    if(head.x===p.x&&head.y===p.y||head.x===Math.round(visual.x)&&head.y===Math.round(visual.y))return false;
    if(!experimentPlayerBodyCells(p,t).some(c=>c.x===head.x&&c.y===head.y))return false;
    experimentChangeDragonForm(p,1,t,'shed',head,experimentSnakeSnapshot(s).id);
    // Finish the bite first. Recovery then follows actual walking, not a timer.
    p.experimentRestorePending=true;p.experimentRecovery=null;
    p.experimentEscapeUntil=t+1200;
    // Keep held keys, movement timing and the committed route intact.
    playRandomSound(BODY_EAT_SOUNDS,p);ControllerHaptics.bodyBite(p);
    return true;
  }
  function experimentUpdateDragonForm(p,t=gameTimeNow()){
    if(!experimentDragonSecondChance||!p?.experimentRestorePending||p.dead)return;
    const form=p.experimentDragonForm;
    if(form&&t<form.time+form.duration)return;
    const route=experimentPlayerRoutes.get(p)||experimentResetPlayerRoute(p,t);
    if(!p.experimentRecovery||p.experimentRecovery.epoch!==route.epoch){
      p.experimentRecovery={epoch:route.epoch,
        start:experimentPlayerWalkDistance(p,Math.max(route.points[0].time,form.time+form.duration))};
    }
    const distance=experimentPlayerWalkDistance(p,t);
    if(distance-p.experimentRecovery.start<1e-6)return;
    const cells=experimentPlayerBodyCells(p,t,2);
    const clear=cells.every(({x,y})=>!isWall(x,y)&&!snakes.some(s=>{
      if(s.body.some(c=>c.x===x&&c.y===y))return true;
      const motion=experimentMotion.get(s);
      return motion&&t<motion.started+motion.duration&&motion.from.some(c=>c.x===x&&c.y===y);
    })&&!(scorpion&&((scorpion.x===x&&scorpion.y===y)||(scorpion.tailX===x&&scorpion.tailY===y)))&&
      !hunters.some(h=>h.x===x&&h.y===y)&&!eggs.some(e=>e.x===x&&e.y===y)&&
      !somePlayer(other=>other!==p&&!other.dead&&experimentPlayerOccupies(other,x,y,t)));
    // Do not regrow through the attacker or a wall; retry as the player escapes.
    if(!clear){p.experimentRecovery.start=distance;return;}
    p.experimentRestorePending=false;
    experimentChangeDragonForm(p,2,t,'restore',playerVisualPosition(p,t));
    p.experimentDragonForm.travel={start:p.experimentRecovery.start,distance:3};
    p.experimentEscapeUntil=Math.max(p.experimentEscapeUntil||0,t+600);
  }
  function experimentPlayerStartIsClear(p){
    const start=experimentPlayerStart(p.id),cells=[start];
    if(experimentDragonBody)cells.push({x:start.x-start.dir.x,y:start.y-start.dir.y});
    const t=gameTimeNow();
    return cells.every(({x,y})=>!isWall(x,y)&&
      !snakes.some(s=>{
        if(s.body.some(c=>c.x===x&&c.y===y))return true;
        const motion=experimentDragonBody&&experimentMotion.get(s);
        return motion&&t<motion.started+motion.duration&&motion.from.some(c=>c.x===x&&c.y===y);
      })&&!(scorpion&&((scorpion.x===x&&scorpion.y===y)||(scorpion.tailX===x&&scorpion.tailY===y)))&&
      !hunters.some(h=>h.x===x&&h.y===y)&&!eggs.some(e=>e.x===x&&e.y===y)&&
      !somePlayer(other=>other!==p&&!other.dead&&experimentPlayerOccupies(other,x,y,t)));
  }
