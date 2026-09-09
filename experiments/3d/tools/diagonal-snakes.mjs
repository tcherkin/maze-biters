// Count-checked adaptations of the isolated 3D engine. The original 2D engine
// and its four-direction maze generators remain unchanged.
export function applySnakeDiagonalPatches(source){
  const eol=source.includes('\r\n')?'\r\n':'\n';
  const normal=value=>value.replaceAll('\r\n','\n').replaceAll('\n',eol);
  let result=source;
  function replace(from,to,count=1){
    from=normal(from);to=normal(to);
    if(result.split(from).length!==count+1)
      throw new Error(`Snake diagonal boundary changed: ${from.slice(0,100)}`);
    result=result.replaceAll(from,to);
  }
  function section(start,end,edit){
    if(result.split(start).length!==2||result.split(end).length!==2)
      throw new Error(`Snake diagonal section changed: ${start}`);
    const begin=result.indexOf(start),finish=result.indexOf(end,begin+start.length);
    if(finish<0) throw new Error(`Snake diagonal section end changed: ${end}`);
    const original=result;
    result=result.slice(begin,finish);
    edit();
    result=original.slice(0,begin)+result+original.slice(finish);
  }
  function replaceBody(start,end,newBody){
    section(start,end,()=>{
      result=normal(newBody)+'\n'.replaceAll('\n',eol);
    });
  }

  replaceBody('    function buildField(target,t){','    function fieldFor(target,t){',
`    function buildField(target,t){
      return experimentBuildRouteField(target,
        (x,y)=>isRouteTile(x,y,target,t));
    }
`);
  section('    function choose(entity,origin,options,profile={},t=gameTimeNow()){',
    '    function resolveRouteTarget(target,t=gameTimeNow()){',()=>{
      replace('score:(distance<0?10000:(fleeing?-distance:distance))-',
        'score:(distance<0?10000:(fleeing?-distance:distance+experimentStepLength(d)))-');
    });
  section('    function routeStep(entity,target,t=gameTimeNow()){',
    '  // Dedicated snake-hunter intelligence',()=>{
      replace('const candidates=dirs.map(d=>{','const candidates=experimentDirections.map(d=>{');
      replace(`        if(isWall(x,y)||occupiedBySolidEgg(x,y,t)||
           !playerCellIsSafeForRoute(entity,x,y,t))`,
`        if(!experimentPlayerStepOpen(entity,d,t)||!experimentStepOpen(entity,d,(cx,cy)=>
          !isWall(cx,cy)&&!occupiedBySolidEgg(cx,cy,t)&&
          playerCellIsSafeForRoute(entity,cx,cy,t)))`);
      replace('return {d,distance,straight};',
        'return {d,distance:distance+experimentStepLength(d),straight};');
    });

  section('  function reverseHeadJunctionState(s){',
    '  function snakeSegmentVisualPosition(',()=>{
      replace('dirs.filter','experimentDirections.filter',3);
      replace('canEnter(head.x+d.x,head.y+d.y,s,true)',
        'experimentSnakeStepOpen(head,d,s,true)',2);
      replace('canEnter(tail.x+d.x,tail.y+d.y,s,true)',
        'experimentSnakeStepOpen(tail,d,s,true)');
      replace('canEnter(previous.x,previous.y,s,true)',
        'experimentSnakeStepOpen(head,{x:previous.x-head.x,y:previous.y-head.y},s,true)');
    });
  section('  function forwardOptions(s) {','  function snakeBrainProfile(s){',()=>{
    replace('dirs.filter','experimentDirections.filter');
    replace('canEnter(h.x+d.x,h.y+d.y,s,true)',
      'experimentSnakeStepOpen(h,d,s,true)');
  });
  section('  function tailRetreatOptionScore(s,g,option) {',
    '  function retreatOneStep(s) {',()=>{
      replace('for(const d of dirs){','for(const d of experimentDirections){');
      replace('if(!tailSearchCellOpen(x,y,s,blockedBody)) continue;',
        'if(!experimentStepOpen(cell,d,(cx,cy)=>tailSearchCellOpen(cx,cy,s,blockedBody))) continue;');
      replace('cell.depth+1','cell.depth+experimentStepLength(d)',2);
      replace('dirs.indexOf','experimentDirections.indexOf',2);
    });
  section('  function retreatOneStep(s) {','  function snakeStep(s,t=gameTimeNow()) {',()=>{
    replace('dirs.filter','experimentDirections.filter');
    replace('canEnter(g.x+d.x,g.y+d.y,s,true)',
      'experimentSnakeStepOpen(g,d,s,true)');
  });
  section('  function snakeStep(s,t=gameTimeNow()) {','  function updateSnakeMemory(s,t){',()=>{
    replace('dirs.filter','experimentDirections.filter',2);
    replace('canEnter(h.x+d.x,h.y+d.y,s,true)',
      'experimentSnakeStepOpen(h,d,s,true)',2);
    replace('canEnter(previous.x,previous.y,s,true)',
      'experimentSnakeStepOpen(h,{x:previous.x-h.x,y:previous.y-h.y},s,true)');
    replace('canEnter(h.x+pending.x,h.y+pending.y,s,true)',
      'experimentSnakeStepOpen(h,pending,s,true)');
  });

  // Legacy pose metadata is still consulted by reverse planning and contact
  // effects, even though the 3D renderer owns the smooth visible route.
  section('  function snakeBodyPointIsCorner(body,index){',
    '  function predictiveSnakeTailPosition(s,t,out=null){',()=>{
      replace('return (ax!==0&&by!==0)||(ay!==0&&bx!==0);',
        'return ax*by-ay*bx!==0;');
      replace('return (previous.x!==0)!==(current.x!==0);',
        'return previous.x*current.y-previous.y*current.x!==0;');
      replace('Math.abs(dx)+Math.abs(dy)===1',
        'Math.max(Math.abs(dx),Math.abs(dy))===1');
      replace('Math.abs(oldDx)+Math.abs(oldDy)===1',
        'Math.max(Math.abs(oldDx),Math.abs(oldDy))===1');
      replace('Math.abs(newDx)+Math.abs(newDy)===1',
        'Math.max(Math.abs(newDx),Math.abs(newDy))===1');
      replace('(oldDx!==0)!==(newDx!==0)',
        'oldDx*newDy-oldDy*newDx!==0');
    });
  return result;
}
