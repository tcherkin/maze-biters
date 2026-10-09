export const FRAME_COUNT = 8;
export const TIMING = Object.freeze({ lead: 650, turn: 320, hold: 850, reset: 220 });
export const CYCLE_MS = Object.values(TIMING).reduce((a, b) => a + b, 0);
export const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
export const frameAt = phase => Math.round(clamp(phase) * (FRAME_COUNT - 1));
export const snapAt = phase => phase < 0.5 ? 0 : FRAME_COUNT - 1;
export function playbackAt(elapsed, mode = 'head') {
  const safe = Math.max(0, elapsed);
  const cycle = Math.floor(safe / CYCLE_MS);
  const local = safe % CYCLE_MS;
  const kind = mode === 'sequence' ? (cycle % 2 ? 'tail' : 'head') : mode;
  return {
    kind, cycle,
    phase: clamp((local - TIMING.lead) / TIMING.turn),
    resetting: local >= TIMING.lead + TIMING.turn + TIMING.hold,
    section: local < TIMING.lead ? 'start' : local < TIMING.lead + TIMING.turn ? 'turn' : 'end',
  };
}
export function elapsedForPhase(elapsed, phase) {
  return Math.floor(Math.max(0, elapsed) / CYCLE_MS) * CYCLE_MS + TIMING.lead + clamp(phase) * TIMING.turn;
}
