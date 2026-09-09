// Applied after diagonal and predation adaptations so their count-checked
// upstream anchors continue to validate the original solitary-head branch.
export function applySolitaryRetreatPatches(source){
  const start='    // Head-only snake: it still remembers its old route.';
  const end='    if(!s.reversing && s.pendingForwardResumeDir){';
  if(source.split(start).length!==2||source.split(end).length!==2)
    throw new Error('Solitary retreat boundaries changed');
  const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
  if(last<0) throw new Error('Solitary retreat section end changed');
  const eol=source.includes('\r\n')?'\r\n':'\n';
  const replacement=[
    '    if(s.body.length===1) return experimentStepSolitaryRetreat(s,t);',
    '',
    ''
  ].join(eol);
  return source.slice(0,first)+replacement+source.slice(last);
}
