// Count-checked changes apply to the generated experiment, never the 2D source.
export function applyPlayerDiagonalPatches(source){
  const eol=source.includes('\r\n')?'\r\n':'\n';
  let result=source;
  function once(from,to){
    from=from.replaceAll('\n',eol);to=to.replaceAll('\n',eol);
    if(result.split(from).length!==2) throw new Error(`Player diagonal boundary changed: ${from.slice(0,100)}`);
    result=result.replace(from,to);
  }
  const keyboardStart='  function keyboardNavigationStep(p,t=gameTimeNow()){';
  const keyboardEnd='  function pointerNavigationStep(p,t=gameTimeNow()){';
  if(result.split(keyboardStart).length!==2||result.split(keyboardEnd).length!==2)
    throw new Error('Player keyboard section boundary changed');
  const begin=result.indexOf(keyboardStart),end=result.indexOf(keyboardEnd,begin);
  once(result.slice(begin,end).replaceAll('\r\n','\n'),
    '  function keyboardNavigationStep(p,t=gameTimeNow()){\n    return experimentKeyboardNavigationStep(p,t);\n  }\n\n');
  once('    p.moveDuration=delay*PLAYER_SLIDE_RATIO;',
    '    p.experimentStepDistance=Math.hypot(x-p.prevX,y-p.prevY)||1;\n    p.moveDuration=delay*p.experimentStepDistance*PLAYER_SLIDE_RATIO;');
  once('      const delay=playerMoveDelay(p,t);',
    '      const delay=playerMoveDelay(p,t)*(p.experimentStepDistance||1);');
  once(`    const tx=p.x+p.nextDir.x,ty=p.y+p.nextDir.y;
    const requestedDirectionIsOpen=
      !isWall(tx,ty)&&!occupiedBySolidEgg(tx,ty)&&
      !playerContactBlocksMovement(p,tx,ty,now);
    const reactionAssistActive=reactionAssistPlayerEligible(p,now);
    const incomingDirection={...p.dir};
    const travelDirection=requestedDirectionIsOpen
      ? {...p.nextDir}
      : {...p.dir};`,
    `    const travelDirection=experimentPlayerTravelDirection(p,p.nextDir,now);
    if(!travelDirection){
      if(p.reactionAssistRicochet) stopReactionAssistRicochet(p);
      return;
    }
    const reactionAssistActive=reactionAssistPlayerEligible(p,now);
    const incomingDirection={...p.dir};`);
  once(`    }else if(requestedDirectionIsOpen){
      p.dir={...p.nextDir};
    }`,
    `    }else{
      p.dir={...travelDirection};
    }`);
  once(`    const eggBlocked = occupiedBySolidEgg(nx,ny);
    if(!isWall(nx,ny) && !eggBlocked &&
       !playerContactBlocksMovement(p,nx,ny,now)) {`,
    `    if(experimentPlayerStepOpen(p,p.dir,now)) {`);
  once('    if(Math.abs(fromX-victim.x)+Math.abs(fromY-victim.y)!==1) return false;',
    '    if(Math.max(Math.abs(fromX-victim.x),Math.abs(fromY-victim.y))!==1) return false;');
  once('    while(path.length<maximumCells&&reactionAssistTunnelCellIsOpen(x,y)){',
    '    while(path.length<maximumCells&&experimentStepOpen({x:x-reverse.x,y:y-reverse.y},reverse,reactionAssistTunnelCellIsOpen)){');
  once(`    // Lock the universal rebound to the exact opposite cardinal direction.
    // Side exits, junctions and bends never influence this arcade trajectory.
    // The player crosses every open cell on this axis and stops only at the
    // last cell before the wall at the far end of the straight tunnel span.`,
    `    // One visible step clears the threat. After that step the ordinary
    // eight-way controls own movement again, including a return toward it.`);
  once('    const maximumCells=Math.max(1,COLS*ROWS);','    const maximumCells=1;');
  once('    return Math.abs(d.x)+Math.abs(d.y)===1?d:null;',
    '    return Math.max(Math.abs(d.x),Math.abs(d.y))===1?d:null;');
  once('      for(const item of heldKeyboardDirections(p)) candidates.push(item.dir);',
    '      const heldDirection=keyboardNavigationStep(p,t);\n      if(heldDirection) candidates.push(heldDirection);\n      for(const item of heldKeyboardDirections(p)) candidates.push(item.dir);');
  once(`      if(isWall(x,y)||occupiedBySolidEgg(x,y,t)||
         playerContactBlocksMovement(p,x,y,t)) continue;`,
    '      if(!experimentPlayerStepOpen(p,d,t)) continue;');
  // A completed bounce must not leave the original tunnel-length input lock
  // active. Keep momentum and live input; a later collision is a new bounce.
  once(`      if(p.reactionAssistRicochet){
        const state=p.reactionAssistRicochet;
        const reached=state.path[state.index];
        if(reached&&p.x===reached.x&&p.y===reached.y) state.index++;
        if(state.index>=state.path.length){
          // The locked rebound is finite: stop at the far wall of this
          // straight tunnel span, then return control to the active device.
          stopReactionAssistRicochet(p);
        }
      }else if(p.pointerNavigation &&`,
    `      if(p.reactionAssistRicochet){
        p.reactionAssistRicochet=null;
        p.waitingForInput=false;
      }else if(p.pointerNavigation &&`);
  once(`    // The first rebound cell is compulsory. After it, live input may branch
    // through the first safe perpendicular exit without ever turning back
    // toward the threat that caused the ricochet.`,
    `    // The first rebound cell is compulsory. Its commit releases the lock,
    // so the next normal movement tick accepts every legal input direction.`);
  return result;
}
