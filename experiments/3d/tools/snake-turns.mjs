// Apply after the retreat adaptations; retain count-checked source boundaries
// and leave the shared 2D engine's direction rules untouched.
export function applySnakeTurnPatches(source){
  const eol=source.includes('\r\n')?'\r\n':'\n';
  const normal=text=>text.replaceAll('\r\n','\n').replaceAll('\n',eol);
  let result=source;
  function once(from,to){
    from=normal(from);to=normal(to);
    if(result.split(from).length!==2)throw new Error('Snake turn boundary changed: '+from.slice(0,100));
    result=result.replace(from,to);
  }
  once(`      return experimentSnakeStepOpen(h,d,s,true);`,
    `      return experimentSnakeTurnAllowed(experimentSnakeHeading(s),d)&&experimentSnakeStepOpen(h,d,s,true);`);
  once('  function chooseForwardDirection(s,options,origin=s.body[0]) {',
    `  function chooseForwardDirection(s,options,origin=s.body[0]) {
    options=experimentSnakeTurnOptions(experimentSnakeHeading(s),options);`);
  once('  function advanceSnakeForward(s,d,t=gameTimeNow()) {',
    `  function advanceSnakeForward(s,d,t=gameTimeNow()) {
    if(!experimentSnakeTurnAllowed(experimentSnakeHeading(s),d))return false;`);
  once(`      return experimentSnakeStepOpen(g,d,s,true);`,
    `      return experimentSnakeTurnAllowed(experimentSnakeHeading(s,true),d)&&
        !playerAt(g.x+d.x,g.y+d.y)&&experimentSnakeStepOpen(g,d,s,true);`);
  once(`    const planned=localDirection||experimentPlanRetreat(s);`,
    `    const planned=localDirection||experimentPlanRetreat(s);
    if(localDirection||!experimentRetreatAllowsRightAngle(s,planned))
      options=experimentSnakeTurnOptions(experimentSnakeHeading(s,true),options);`);
  once(`      return experimentSnakeStepOpen(tail,d,s,true);`,
    `      return experimentSnakeTurnAllowed(experimentSnakeHeading(s,true),d)&&
        !playerAt(tail.x+d.x,tail.y+d.y)&&experimentSnakeStepOpen(tail,d,s,true);`);
  once(`         !experimentSnakeStepOpen(head,{x:previous.x-head.x,y:previous.y-head.y},s,true)) return null;`,
    `         !experimentSnakeTurnAllowed(experimentSnakeHeading(s,true),{x:previous.x-head.x,y:previous.y-head.y}) ||
         !experimentSnakeStepOpen(head,{x:previous.x-head.x,y:previous.y-head.y},s,true)) return null;`);
  once(`      const open=experimentDirections.filter(d=>experimentSnakeStepOpen(head,d,s,true));`,
    `      const open=experimentSnakeTurnOptions(experimentSnakeHeading(s),
        experimentDirections.filter(d=>experimentSnakeStepOpen(head,d,s,true)));`);
  return result;
}
