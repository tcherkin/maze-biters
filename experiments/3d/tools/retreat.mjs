export function applyRetreatPatches(source){
  const eol=source.includes('\r\n')?'\r\n':'\n';
  const normal=text=>text.replaceAll('\r\n','\n').replaceAll('\n',eol);
  let result=source;
  function once(from,to){
    from=normal(from);to=normal(to);
    if(result.split(from).length!==2)throw new Error('Retreat boundary changed: '+from.slice(0,100));
    result=result.replace(from,to);
  }
  function section(start,end,replacement){
    start=normal(start);end=normal(end);
    if(result.split(start).length!==2||result.split(end).length!==2)throw new Error('Retreat section changed: '+start);
    const begin=result.indexOf(start),finish=result.indexOf(end,begin+start.length);
    if(finish<0)throw new Error('Retreat section end changed');
    result=result.slice(0,begin)+normal(replacement)+result.slice(finish);
  }
  section('  function reverseHeadJunctionState(s){','  function prepareReverseHeadJunctionDecision(s){',
    '  function reverseHeadJunctionState(s){\n    return experimentReverseHeadState(s);\n  }\n\n');
  once('        takeNewBranch:\n          Math.random()<REVERSE_HEAD_NEW_BRANCH_CHANCE','        takeNewBranch:true');
  once('  function beginTailLedRetreat(s,t=gameTimeNow()) {',
    '  function beginTailLedRetreat(s,t=gameTimeNow()) {\n    experimentRememberRetreat(s,t);');
  once('  function snakeStep(s,t=gameTimeNow()) {',
    '  function snakeStep(s,t=gameTimeNow()) {\n    s.experimentRetreatPlanning=false;');
  once('  function retreatOneStep(s) {','  function retreatOneStep(s,localDirection=null) {');
  once(`    const chosen=options.length===1
      ? options[0]
      : chooseTailRetreatDirection(s,g,options);`,
    `    const planned=localDirection||experimentPlanRetreat(s);
    const chosen=planned&&options.find(d=>sameDirection(d,planned));
    if(!chosen)return false;`);
  once('    s.tailGuide={x:nx,y:ny,dir:{...chosen}};',
    '    experimentRecordRetreatStep(s,g,chosen);\n    s.tailGuide={x:nx,y:ny,dir:{...chosen}};');
  once('        if(snakeStepResult===REACTION_ASSIST_HOLD) continue;',
    '        if(snakeStepResult===REACTION_ASSIST_HOLD||s.experimentRetreatPlanning) continue;');
  section(`    } else if(s.reversing) {
      // The route choice belongs to simulation state, not to rendering.`,
    `    } else {
      const options=forwardOptions(s);`,
    '    } else if(s.reversing) {\n      experimentRetreatStep(s,t);\n\n');
  section('    if(!s.reversing && s.pendingForwardResumeDir){',
    '    } else if(s.reversing) {\n      experimentRetreatStep(s,t);',
    '    if(!s.reversing && s.pendingForwardResumeDir){\n      const resumed=experimentResumeRetreat(s,t);\n      if(resumed===REACTION_ASSIST_HOLD)return resumed;\n');
  return result;
}
