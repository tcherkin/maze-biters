  // 3D-only movement. Keep the original cardinal list for authored 2D helpers.
  const experimentDirections=[...dirs,{x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1}];
  const experimentStepLength=d=>Math.hypot(d.x,d.y);
  function experimentStepOpen(origin,d,cellIsOpen){
    if(!d||!Number.isInteger(d.x)||!Number.isInteger(d.y)||
       Math.max(Math.abs(d.x),Math.abs(d.y))!==1) return false;
    return cellIsOpen(origin.x+d.x,origin.y+d.y)&&
      (!d.x||!d.y||(cellIsOpen(origin.x+d.x,origin.y)&&cellIsOpen(origin.x,origin.y+d.y)));
  }
  function experimentPlayerStepOpen(p,d,t=gameTimeNow()){
    if(!experimentStepOpen(p,d,(x,y)=>!isWall(x,y)&&!occupiedBySolidEgg(x,y,t)&&
       !playerContactBlocksMovement(p,x,y,t))) return false;
    // The destination can be a bite. The two side cells cannot: crossing a
    // body between cell centres would otherwise skip the contact entirely.
    if(d.x&&d.y){
      const sideIsClear=(x,y)=>!occupiedBySnake(x,y)&&!occupiedByScorpion(x,y)&&!occupiedByHunter(x,y);
      if(!sideIsClear(p.x+d.x,p.y)||!sideIsClear(p.x,p.y+d.y)) return false;
    }
    return true;
  }
  function experimentPlayerTravelDirection(p,requested,t=gameTimeNow()){
    if(experimentPlayerStepOpen(p,requested,t)) return {...requested};
    if(requested?.x&&requested?.y){
      const components=[{x:requested.x,y:0},{x:0,y:requested.y}];
      if(sameDirection(p.dir,components[1])) components.reverse();
      const open=components.find(d=>experimentPlayerStepOpen(p,d,t));
      if(open) return open;
    }
    return experimentPlayerStepOpen(p,p.dir,t)?{...p.dir}:null;
  }
  function experimentKeyboardNavigationStep(p,t=gameTimeNow()){
    const held=heldKeyboardDirections(p);
    if(!held.length) return null;
    const first=held[0].dir;
    if(held.length===1) return {...first};
    const second=held[1].dir;
    if((first.x&&second.x)||(first.y&&second.y)) return {...first};
    const diagonal={x:first.x+second.x,y:first.y+second.y};
    if(experimentPlayerStepOpen(p,diagonal,t)) return diagonal;
    // At an obstruction, slide along a held open direction. Keep the newest
    // request queued when neither component is available at this cell.
    if(experimentPlayerStepOpen(p,first,t)) return {...first};
    if(experimentPlayerStepOpen(p,second,t)) return {...second};
    return {...first};
  }
