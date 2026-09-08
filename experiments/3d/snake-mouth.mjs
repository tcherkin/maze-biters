const ease=t=>t*t*(3-2*t);

// A deliberate opening, a short threat display, then a quicker bite. Stable
// per-snake timing prevents the whole roster from chomping in unison. Only
// simulation time drives this cycle, including after a split or while paused.
export function snakeMouthOpening(id,time){
  const period=980+(id%4)*90,phase=((time+id*211)%period+period)%period/period;
  if(phase<.18||phase>=.85)return 0;
  if(phase<.62)return ease((phase-.18)/.44);
  if(phase<.73)return 1;
  return 1-ease((phase-.73)/.12);
}
