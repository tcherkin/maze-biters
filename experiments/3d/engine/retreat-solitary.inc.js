  // A solitary head follows the same escape rule as a complete snake: the
  // remembered route is travelled backward until a different passage opens
  // or backward travel blocks and the head must retry a legal forward path.
  // Remember the actual vacated cell, since a corner changes its compass
  // direction and the original blocked direction no longer describes it.
  function experimentStepSolitaryRetreat(s,t=gameTimeNow()){
    if(!s.headTrail) s.headTrail=[];
    const head=s.body[0];
    const oldHead={x:head.x,y:head.y};
    const sameCell=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
    const rememberForwardCell=()=>{
      s.headTrail.push({x:head.x,y:head.y});
      if(s.headTrail.length>80) s.headTrail.shift();
    };
    const enterForward=(chosen,fromRetreat)=>{
      const nx=head.x+chosen.x,ny=head.y+chosen.y;
      const victim=playerAt(nx,ny);
      const alreadyFacing=s.dir.x===chosen.x&&s.dir.y===chosen.y;
      if(fromRetreat){
        experimentMarkExit(s,head,chosen,t);
        s.reversing=false;
        s.blockedDir=null;
        s.reverseSteps=0;
        s.experimentSolitaryOldRouteCell=null;
        s.experimentSolitaryExploringBack=false;
        s.dir={...chosen};
        // First face a nearby player visibly. A future-facing mouth cannot
        // bite during the very tick on which the head chooses that turn.
        if(victim&&!alreadyFacing) return;
      }
      if(victim&&reactionAssistThreatEntryYields(s,victim,head.x,head.y,t)){
        s.reactionAssistMoveDir={...chosen};
        return REACTION_ASSIST_HOLD;
      }
      rememberForwardCell();
      s.dir={...chosen};
      s.body[0]={x:nx,y:ny};
    };
    const enterBackward=(destination,remembered)=>{
      const d={x:destination.x-head.x,y:destination.y-head.y};
      const memory=experimentRetreatMemory(s,t);
      const failedEdge=experimentRetreatEdge(destination,{x:-d.x,y:-d.y});
      const experience=memory.failed.get(failedEdge);
      memory.failed.set(failedEdge,{count:Math.max(1,experience?.count||0),time:t,expires:t+(memory.failureLifetime||60000)});
      while(memory.failed.size>64)memory.failed.delete(memory.failed.keys().next().value);
      if(remembered)s.headTrail.pop();
      else s.headTrail.length=0;
      s.experimentSolitaryExploringBack=!remembered;
      s.experimentSolitaryOldRouteCell={x:head.x,y:head.y};
      s.dir={x:-d.x,y:-d.y};
      s.body[0]={...destination};
      s.reverseSteps=(s.reverseSteps||0)+1;
    };

    if(s.reversing){
      const previous=s.headTrail.length?s.headTrail[s.headTrail.length-1]:null;
      const retreatDirection=previous
        ? {x:previous.x-head.x,y:previous.y-head.y}:null;
      const historyOpen=!!previous&&!playerAt(previous.x,previous.y)&&
        experimentSnakeTurnAllowed(experimentSnakeHeading(s,true),retreatDirection)&&
        experimentSnakeStepOpen(head,retreatDirection,s,true);
      const backwardHeading=experimentSnakeHeading(s,true);
      const backwardOptions=experimentSnakeTurnOptions(backwardHeading,experimentDirections.filter(d=>
        experimentSnakeStepOpen(head,d,s,true)&&!playerAt(head.x+d.x,head.y+d.y)));
      const canRetreat=historyOpen||s.experimentSolitaryExploringBack&&backwardOptions.length>0;
      const oldRoute=s.experimentSolitaryOldRouteCell||
        {x:head.x+s.dir.x,y:head.y+s.dir.y};
      const environment=experimentRetreatEnvironment(s),avoid=experimentFailedArmCells(s,t);
      const newBranches=experimentDirections.filter(d=>{
        const destination={x:head.x+d.x,y:head.y+d.y};
        return !sameCell(destination,oldRoute)&&!sameCell(destination,previous)&&
          experimentSnakeTurnAllowed(s.dir,d)&&
          experimentSnakeStepOpen(head,d,s,true)&&experimentRetreatExitUseful(s.body,d,environment,avoid);
      });
      const freshBranches=newBranches.filter(d=>!experimentFailedExit(s,head,d,t));
      // On return from a failed passage, pass its exit and search farther
      // backward. If no retreat remains, a different physical exit can still
      // be retried after moving inhabitants have changed the situation.
      const legalForward=!canRetreat?experimentDirections.filter(d=>
        experimentSnakeTurnAllowed(s.dir,d)&&experimentSnakeStepOpen(head,d,s,true)):[];
      const exits=freshBranches.length?freshBranches:(!canRetreat?legalForward:[]);
      if(exits.length){
        const result=enterForward(experimentChooseExit(s,head,exits,t),true);
        if(result===REACTION_ASSIST_HOLD) return result;
      }else if(historyOpen){
        // The original blocked arm may predate any selected escape exit.
        // Backing out is evidence about every directed edge of that arm;
        // otherwise returning from a second failed arm would make the first
        // one look unexplored again at their shared junction.
        enterBackward(previous,true);
      }else{
        // A newly separated head may have no history. It can still genuinely
        // back out with its face pointing forward, rather than freeze or
        // turn 135/180 degrees to disguise a backward step as forward travel.
        const d=backwardOptions.find(d=>sameDirection(d,backwardHeading))||backwardOptions[0];
        if(d)enterBackward({x:head.x+d.x,y:head.y+d.y},false);
      }
      // With no backward step left, retry any legal forward direction.
      // Experience influences the choice without freezing the only exit.
    }else{
      const options=experimentDirections.filter(d=>
        experimentSnakeTurnAllowed(s.dir,d)&&
        experimentSnakeStepOpen(head,d,s,true));
      if(options.length){
        const result=enterForward(chooseForwardDirection(s,options),false);
        if(result===REACTION_ASSIST_HOLD) return result;
      }else{
        experimentRememberRetreat(s,t);
        s.reversing=true;
        s.blockedDir={...s.dir};
        s.reverseSteps=0;
        s.experimentSolitaryOldRouteCell={x:head.x+s.dir.x,y:head.y+s.dir.y};
      }
    }

    const victim=playerAt(s.body[0].x,s.body[0].y);
    if(victim){
      const actuallyMoved=!sameCell(s.body[0],oldHead);
      if(hasCombatPower(victim)){
        powerEatSnakeHead(s,victim);
      }else if(s.reversing&&actuallyMoved){
        s.reversing=false;
        s.reverseLeader=null;
        s.lastMove=0;
      }else{
        experimentSnakeAttack(s,victim,t);
      }
    }
  }
