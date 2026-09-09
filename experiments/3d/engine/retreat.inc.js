  const experimentRetreatEdge=(p,d)=>`${p.x},${p.y}>${p.x+d.x},${p.y+d.y}`;
  const experimentRetreatBodyKey=body=>body.map(p=>p.y*COLS+p.x).join(',');
  function experimentRetreatMemory(s,t=gameTimeNow()){
    const memory=s.experimentRetreatMemory||=({failed:new Map(),tailVisits:new Map(),lastExit:null});
    if(memory.prunedAt!==t){
      for(const [key,failure] of memory.failed){
        if(t>=(failure.expires??failure.time+60000)) memory.failed.delete(key);
      }
      memory.prunedAt=t;
    }
    return memory;
  }
  function experimentFailedExit(s,origin,d,t=gameTimeNow()){
    return experimentRetreatMemory(s,t).failed.get(experimentRetreatEdge(origin,d))?.count||0;
  }
  function experimentMarkExit(s,head,d,t=gameTimeNow()){
    experimentRetreatMemory(s,t).lastExit={key:experimentRetreatEdge(head,d),time:t};
    s.experimentRetreatPlan=null;
    s.experimentRetreatWait=null;s.experimentRetreatPlanning=false;
  }
  function experimentRememberRetreat(s,t=gameTimeNow()){
    const memory=experimentRetreatMemory(s,t),exit=memory.lastExit;
    const head=s.body[0],neck=s.body[1];
    const temporary=experimentDirections.some(d=>
      (!neck||head.x+d.x!==neck.x||head.y+d.y!==neck.y)&&
      experimentSnakeTurnAllowed(experimentSnakeHeading(s),d)&&
      experimentStepOpen(head,d,(x,y)=>!isWall(x,y)&&!occupiedBySelf(x,y,s,true)));
    memory.failureLifetime=temporary?5000:60000;
    if(exit){
      const previous=memory.failed.get(exit.key);
      // A moving inhabitant can close an otherwise open passage. Remember
      // that failure briefly, so the route becomes usable again when it clears.
      memory.failed.delete(exit.key);
      memory.failed.set(exit.key,{count:Math.min(8,(previous?.count||0)+1),time:t,expires:t+memory.failureLifetime});
      if(memory.failed.size>64) memory.failed.delete(memory.failed.keys().next().value);
    }
    memory.lastExit=null;
    s.experimentRetreatPlan=null;
    s.experimentRetreatWait=null;
  }
  function experimentChooseExit(s,head,options,t=gameTimeNow()){
    if(!options.length) return null;
    const least=Math.min(...options.map(d=>experimentFailedExit(s,head,d,t)));
    return chooseForwardDirection(s,options.filter(d=>experimentFailedExit(s,head,d,t)===least),head);
  }
  function experimentReverseHeadState(s,t=gameTimeNow()){
    if(!s?.reversing||s.body.length<2) return null;
    const head=s.body[0],neck=s.body[1];
    const oldRouteDir=s.reverseHeadOldRouteDir||{...s.dir};
    const openFromHead=experimentDirections.filter(d=>
      experimentSnakeTurnAllowed(experimentSnakeHeading(s),d)&&
      (head.x+d.x!==neck.x||head.y+d.y!==neck.y)&&experimentSnakeStepOpen(head,d,s,true));
    const candidates=openFromHead.filter(d=>!sameDirection(d,oldRouteDir)&&!experimentFailedExit(s,head,d,t));
    const environment=candidates.length?experimentRetreatEnvironment(s):null;
    const avoid=experimentFailedArmCells(s,t);
    const newBranches=candidates.filter(d=>experimentRetreatExitUseful(s.body,d,environment,avoid));
    const junctionKey=`${head.x},${head.y}`;
    return {head,openFromHead,oldRouteDir,newBranches,atNewJunction:!!newBranches.length,
      junctionKey,skippedThisRetreat:false,returningFromFailedBranch:false,
      eligible:!!newBranches.length,
      decisionKey:experimentRetreatBodyKey(s.body)+'|'+newBranches.map(d=>`${d.x},${d.y}`).join(';')};
  }
  function experimentRetreatEnvironment(s){
    const blocked=new Set(),players=new Set(),edges=[];
    const index=(x,y)=>y*COLS+x;
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      if(isWall(x,y)||occupiedByScorpion(x,y)||occupiedByHunter(x,y)||
         occupiedBySolidEgg(x,y)||playerRepelsInhabitant(x,y)) blocked.add(index(x,y));
      if(playerAt(x,y)) players.add(index(x,y));
    }
    for(const other of snakes){
      if(other===s) continue;
      for(const p of other.body) blocked.add(index(p.x,p.y));
      for(let i=1;i<other.body.length;i++)edges.push([other.body[i-1],other.body[i]]);
    }
    return {blocked,players,edges,signature:[...blocked].sort((a,b)=>a-b).join(',')+'|'+[...players].join(',')};
  }
  function experimentRetreatNode(body,oldDir,environment){
    // Keep the same conservative own-body occupancy as actual cell movement.
    const occupied=new Set(body.slice(0,-1).map(p=>p.y*COLS+p.x));
    const openCell=(x,y)=>x>=0&&y>=0&&x<COLS&&y<ROWS&&
      !environment.blocked.has(y*COLS+x)&&!occupied.has(y*COLS+x);
    const open=(origin,d,tail=false)=>{
      const end=tail?body.at(-1):body[0],next=tail?body.at(-2):body[1];
      const heading=next?{x:end.x-next.x,y:end.y-next.y}:oldDir;
      if(!experimentSnakeTurnAllowed(heading,d))return false;
      if(!experimentStepOpen(origin,d,openCell)) return false;
      const to={x:origin.x+d.x,y:origin.y+d.y};
      if(tail&&environment.players.has(to.y*COLS+to.x)) return false;
      if(d.x&&d.y){
        if(environment.players.has(origin.y*COLS+to.x)||environment.players.has(to.y*COLS+origin.x))return false;
        for(let i=1;i<body.length;i++)if(experimentSnakeEdgesCross(origin,to,body[i-1],body[i]))return false;
        for(const [a,b] of environment.edges)if(experimentSnakeEdgesCross(origin,to,a,b))return false;
      }
      return true;
    };
    return {body,oldDir,open};
  }
  function experimentFailedArmCells(s,t=gameTimeNow()){
    const cells=new Set();
    for(const key of experimentRetreatMemory(s,t).failed.keys()){
      const [x,y]=key.split('>')[1].split(',').map(Number);cells.add(y*COLS+x);
    }
    return cells;
  }
  function experimentRetreatExitUseful(body,d,environment,avoid){
    const head=body[0],to={x:head.x+d.x,y:head.y+d.y},key=to.y*COLS+to.x;
    if(avoid.has(key))return false;
    if(environment.players.has(key))return true;
    // Diagonal corridors have open flank cells. A flank that only leads
    // back into the failed arm is a pocket, not a new escape passage.
    const next=experimentRetreatNode([to,...body.slice(0,-1)],d,environment);
    return experimentDirections.some(onward=>!sameDirection(onward,{x:-d.x,y:-d.y})&&
      !avoid.has((to.y+onward.y)*COLS+to.x+onward.x)&&next.open(to,onward));
  }
  function experimentRetreatAllowsRightAngle(s,d){
    const plan=s.experimentRetreatPlan;
    // An escape exception belongs only to a completed, still-current plan.
    // It cannot leak into normal steering or survive a bite/blocker change.
    return !!(d&&plan?.relaxedTurns&&plan.bodyKey===experimentRetreatBodyKey(s.body)&&
      plan.directions.length&&sameDirection(plan.directions[0],d)&&
      plan.environment===experimentRetreatEnvironment(s).signature);
  }
  function experimentPlanRetreat(s,t=gameTimeNow()){
    s.experimentRetreatPlanning=false;
    if(s.body.length<2) return null;
    const bodyKey=experimentRetreatBodyKey(s.body),cached=s.experimentRetreatPlan;
    const tail=s.body.at(-1);
    if(cached?.bodyKey===bodyKey&&cached.directions.length){
      const d=cached.directions[0];
      const available=experimentSnakeTurnOptions(experimentSnakeHeading(s,true),experimentDirections.filter(option=>
        experimentSnakeStepOpen(tail,option,s,true)&&!playerAt(tail.x+option.x,tail.y+option.y)));
      if(available.some(option=>sameDirection(option,d)))return d;
      if(experimentRetreatAllowsRightAngle(s,d)&&experimentSnakeTurnAllowed(experimentSnakeHeading(s,true),d)&&
        experimentSnakeStepOpen(tail,d,s,true)&&!playerAt(tail.x+d.x,tail.y+d.y))return d;
    }
    const environment=experimentRetreatEnvironment(s);
    if(cached?.bodyKey===bodyKey&&cached.advance&&cached.environment===environment.signature)return cached.advance(t);
    if(cached?.bodyKey===bodyKey&&!cached.directions.length&&cached.environment===environment.signature&&t<cached.retryAt)return null;
    const memory=experimentRetreatMemory(s,t),oldDir=s.reverseHeadOldRouteDir||{...s.dir};
    const failedCells=experimentFailedArmCells(s,t);
    const maximumDepth=Math.min(72,s.body.length+COLS+ROWS),maximumNodes=3000;
    const staticOpen=(x,y)=>x>=0&&y>=0&&x<COLS&&y<ROWS&&!environment.blocked.has(y*COLS+x);
    // The head must first follow the existing body. This lower bound points
    // the search toward the first possible exit, even with a very long tail.
    const estimate=node=>{
      for(let i=0;i<node.body.length;i++){
        const p=node.body[i],previous=node.body[i-1],neck=node.body[i+1];
        const old=previous?{x:previous.x-p.x,y:previous.y-p.y}:node.oldDir;
        const heading=neck?{x:p.x-neck.x,y:p.y-neck.y}:old;
        if(experimentDirections.some(d=>!sameDirection(d,old)&&
           experimentSnakeTurnAllowed(heading,d)&&
           (!neck||p.x+d.x!==neck.x||p.y+d.y!==neck.y)&&
           !experimentFailedExit(s,p,d,t)&&experimentStepOpen(p,d,staticOpen)))return i;
      }
      return node.body.length;
    };
    const heap=[];
    const earlier=(a,b)=>a.priority<b.priority||a.priority===b.priority&&(a.depth>b.depth||a.depth===b.depth&&a.order<b.order);
    const push=node=>{
      let i=heap.length;heap.push(node);
      while(i){const parent=(i-1)>>1;if(!earlier(node,heap[parent]))break;heap[i]=heap[parent];i=parent;}heap[i]=node;
    };
    const pop=()=>{
      const first=heap[0],last=heap.pop();
      if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&earlier(heap[child+1],heap[child]))child++;if(!earlier(heap[child],last))break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;
    };
    const first={body:s.body.map(p=>({...p})),oldDir,avoid:failedCells,depth:0,cost:0,parent:null,order:0};
    first.priority=estimate(first);push(first);
    const seen=new Map([[bodyKey+'|'+oldDir.x+','+oldDir.y,0]]);
    let expanded=0,serial=0,solution=null,relaxedTurns=false;
    const advance=(now,began=performance.now())=>{
      let sliceNodes=0;
      while(heap.length&&expanded<maximumNodes){
        // Resume a hard search next simulation pulse instead of freezing the
        // render thread. Ordinary corridor plans finish in this first slice.
        if(sliceNodes>=16&&performance.now()-began>=6)break;
        sliceNodes++;expanded++;
        const node=pop(),state=experimentRetreatNode(node.body,node.oldDir,environment);
        const head=node.body[0],neck=node.body[1];
        if(node.depth>0&&experimentDirections.some(d=>!sameDirection(d,node.oldDir)&&
           (head.x+d.x!==neck.x||head.y+d.y!==neck.y)&&!experimentFailedExit(s,head,d,t)&&state.open(head,d)&&
           experimentRetreatExitUseful(node.body,d,environment,node.avoid))){solution=node;break;}
        if(node.depth>=maximumDepth)continue;
        const from=node.body.at(-1),before=node.body.at(-2);
        const backwards={x:before.x-from.x,y:before.y-from.y};
        const heading={x:from.x-before.x,y:from.y-before.y};
        const legal=experimentDirections.filter(d=>!sameDirection(d,backwards)&&state.open(from,d,true));
        const options=relaxedTurns?legal:experimentSnakeTurnOptions(heading,legal);
        for(const d of options){
          const body=node.body.slice(1).concat({x:from.x+d.x,y:from.y+d.y});
          const oldDir={x:head.x-body[0].x,y:head.y-body[0].y};
          const key=experimentRetreatBodyKey(body)+'|'+oldDir.x+','+oldDir.y;
          const visits=memory.tailVisits.get(experimentRetreatEdge(from,d))||0;
          const cost=node.cost+experimentStepLength(d)+Math.min(8,visits)*.35;
          if(seen.has(key)&&seen.get(key)<=cost)continue;
          seen.set(key,cost);
          const avoid=new Set(node.avoid);avoid.add(head.y*COLS+head.x);
          const next={body,oldDir,avoid,depth:node.depth+1,cost,parent:node,d,order:++serial};
          next.priority=cost+estimate(next);push(next);
        }
      }
      if(!solution&&heap.length&&expanded<maximumNodes){
        s.experimentRetreatPlanning=true;
        s.experimentRetreatPlan={bodyKey,directions:[],environment:environment.signature,advance,expanded};
        return null;
      }
      if(!solution&&!relaxedTurns){
        // No complete escape was found using the gentler turns within this
        // bounded search. Try 90-degree corners too, retaining the hard limit.
        // Share the time slice; defer only when this pulse has used its budget.
        relaxedTurns=true;expanded=0;serial=0;heap.length=0;seen.clear();
        seen.set(bodyKey+'|'+oldDir.x+','+oldDir.y,0);push(first);
        if(performance.now()-began<6)return advance(now,began);
        s.experimentRetreatPlanning=true;
        s.experimentRetreatPlan={bodyKey,directions:[],environment:environment.signature,advance,expanded};
        return null;
      }
      const directions=[];
      for(let node=solution;node?.parent;node=node.parent)directions.push(node.d);
      directions.reverse();
      s.experimentRetreatPlanning=false;
      s.experimentRetreatPlan={bodyKey,directions,relaxedTurns,environment:environment.signature,retryAt:now+1500,expanded};
      return directions[0]||null;
    };
    return advance(t);
  }
  function experimentRecordRetreatStep(s,from,d,t=gameTimeNow()){
    s.experimentRetreatWait=null;s.experimentRetreatPlanning=false;
    const memory=experimentRetreatMemory(s,t),key=experimentRetreatEdge(from,d);
    const visits=memory.tailVisits.get(key)||0;
    memory.tailVisits.delete(key);memory.tailVisits.set(key,visits+1);
    if(memory.tailVisits.size>192)memory.tailVisits.delete(memory.tailVisits.keys().next().value);
    // The arm being vacated leads back to the failed approach, even if this
    // was the snake's original spawn route and had no recorded junction exit.
    const failedKey=experimentRetreatEdge(s.body[0],s.reverseHeadOldRouteDir);
    const previous=memory.failed.get(failedKey);
    memory.failed.delete(failedKey);
    memory.failed.set(failedKey,{count:Math.min(8,(previous?.count||0)+1),time:t,expires:t+(memory.failureLifetime||60000)});
    if(memory.failed.size>64)memory.failed.delete(memory.failed.keys().next().value);
    const plan=s.experimentRetreatPlan;
    if(plan?.directions.length&&sameDirection(plan.directions[0],d)){
      plan.directions.shift();plan.bodyKey=experimentRetreatBodyKey(s.body);
    }else s.experimentRetreatPlan=null;
  }
  function experimentRetreatStep(s,t=gameTimeNow()){
    s.experimentRetreatPlanning=false;
    const state=experimentReverseHeadState(s,t);
    if(state.eligible){
      const d=experimentChooseExit(s,state.head,state.newBranches,t);
      experimentMarkExit(s,state.head,d,t);
      s.experimentResumeOldRouteDir={...state.oldRouteDir};
      stageSnakeForwardResume(s,d);
      s.blockedDir=null;
      return;
    }
    if(!s.tailGuide){
      const tail=s.body.at(-1),before=s.body.at(-2);
      s.tailGuide={x:tail.x,y:tail.y,dir:{x:tail.x-before.x,y:tail.y-before.y}};
    }
    const moved=retreatOneStep(s);
    if(moved===true)return;

    // A difficult search may span a few simulation pulses. Its deadline is
    // tied to this body, not the changing environment cache: moving neighbours
    // must not restart the wait forever while a physical route is open.
    if(s.experimentRetreatPlanning){
      const key=experimentRetreatBodyKey(s.body);
      if(s.experimentRetreatWait?.key!==key)s.experimentRetreatWait={key,started:t};
      if(t-s.experimentRetreatWait.started<90)return;
    }
    s.experimentRetreatPlanning=false;
    if(state.openFromHead.length){
      // Failure memory ranks the choices, but never forbids the only legal
      // movement. This includes the old approach when the tail is blocked.
      const d=experimentChooseExit(s,state.head,state.openFromHead,t);
      experimentMarkExit(s,state.head,d,t);
      s.experimentResumeOldRouteDir={...state.oldRouteDir};
      stageSnakeForwardResume(s,d);
      s.blockedDir=null;
      return;
    }
    const tail=s.body.at(-1),before=s.body.at(-2);
    const back={x:before.x-tail.x,y:before.y-tail.y};
    const options=experimentSnakeTurnOptions(experimentSnakeHeading(s,true),
      experimentDirections.filter(d=>!sameDirection(d,back)&&
        experimentSnakeStepOpen(tail,d,s,true)&&!playerAt(tail.x+d.x,tail.y+d.y)));
    if(options.length){
      const memory=experimentRetreatMemory(s,t);
      const visits=d=>memory.tailVisits.get(experimentRetreatEdge(tail,d))||0;
      const least=Math.min(...options.map(visits));
      const choices=options.filter(d=>visits(d)===least);
      const d=choices.length===1?choices[0]:chooseTailRetreatDirection(s,s.tailGuide,choices);
      s.experimentRetreatPlan=null;
      retreatOneStep(s,d);
    }
    // Only physically blocked ends need to wait. Recheck them next pulse.
  }
  function experimentResumeRetreat(s,t=gameTimeNow()){
    const head=s.body[0],neck=s.body[1];
    let d=s.pendingForwardResumeDir;
    if(d&&experimentSnakeTurnAllowed(experimentSnakeHeading(s),d)&&
       (!neck||head.x+d.x!==neck.x||head.y+d.y!==neck.y)&&experimentSnakeStepOpen(head,d,s,true)){
      const failures=experimentFailedExit(s,head,d,t);
      const environment=experimentRetreatEnvironment(s),avoid=experimentFailedArmCells(s,t);
      const preferred=experimentSnakeTurnOptions(experimentSnakeHeading(s),
        forwardOptions(s).filter(option=>sameDirection(option,d)||
          experimentFailedExit(s,head,option,t)<=failures&&
          experimentRetreatExitUseful(s.body,option,environment,avoid)));
      if(!preferred.some(option=>sameDirection(option,d))){
        d=chooseForwardDirection(s,preferred);
        experimentMarkExit(s,head,d,t);
      }
      const moved=advanceSnakeForward(s,d,t);
      if(moved===REACTION_ASSIST_HOLD)return moved;
      s.pendingForwardResumeDir=null;s.forwardResumeRecovery=false;
      s.reverseHeadOldRouteDir=null;s.experimentResumeOldRouteDir=null;
      return moved;
    }
    // The chosen exit can close during the turn. Resume the same retreat;
    // ordinary forwardOptions would include the old failed approach again.
    experimentRetreatMemory(s,t).lastExit=null;
    s.pendingForwardResumeDir=null;s.forwardResumeRecovery=false;
    s.reversing=true;s.experimentRetreatPlan=null;
    s.reverseHeadOldRouteDir=s.experimentResumeOldRouteDir||s.reverseHeadOldRouteDir||{...s.dir};
    const tail=s.body.at(-1),before=s.body.at(-2);
    s.tailGuide={x:tail.x,y:tail.y,dir:{x:tail.x-before.x,y:tail.y-before.y}};
    return experimentRetreatStep(s,t);
  }
