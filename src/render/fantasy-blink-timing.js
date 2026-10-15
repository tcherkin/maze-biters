// Independent presentation timing. Times are game-clock MILLISECONDS.
// This module never reads or advances game RNG, mouth timing, movement or AI.
export const BLINK=Object.freeze({close:70,hold:35,open:115,minInterval:3000,maxInterval:7000});
export const BLINK_DURATION=BLINK.close+BLINK.hold+BLINK.open;
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*t*(10+t*(-15+6*t));};

/** A pure smooth blink envelope: 0 is open and 1 is fully closed. */
export function blinkClosure(elapsedMs){
  if(!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>=BLINK_DURATION)return 0;
  if(elapsedMs<BLINK.close)return smooth(elapsedMs/BLINK.close);
  if(elapsedMs<BLINK.close+BLINK.hold)return 1;
  return 1-smooth((elapsedMs-BLINK.close-BLINK.hold)/BLINK.open);
}

/** A small seedable PRNG owned exclusively by one cosmetic blink clock. */
export function createBlinkRandom(seed=0xB17E2026){
  if(!Number.isSafeInteger(seed))throw new TypeError('Blink seed must be a safe integer');
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6D2B79F5)>>>0;
    let value=Math.imul(state^(state>>>15),1|state);
    value^=value+Math.imul(value^(value>>>7),61|value);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}

/**
 * One actor owns one clock. firstAt is an absolute game time supplied by the
 * caller (for example 900, 1800 and 2800 for three independent actors).
 * Automatic gaps are measured from the end of the accepted blink, not its
 * beginning. Manual repeats during a blink are ignored rather than restarting
 * the eyelids. Sampling after a long hidden gap starts at most one fresh blink
 * at the current time; missed events are never queued or rapidly replayed.
 * Turning automatic off prevents new automatic blinks but allows the current
 * blink to finish and still permits a manual trigger.
 */
export function createBlinkClock({firstAt=900,random}={}){
  if(!Number.isFinite(firstAt)||firstAt<0)throw new TypeError('First blink time must be finite and nonnegative');
  const source=random===undefined?createBlinkRandom(0xB17E2026^(Math.floor(firstAt)>>>0)):random;
  if(typeof source!=='function')throw new TypeError('Blink random source must be a function');
  let startedAt=-Infinity,next=firstAt,count=0,last=-Infinity;
  function validateTime(timeMs){
    if(!Number.isFinite(timeMs)||timeMs<0||timeMs<last)throw new TypeError('Blink clock must be finite, nonnegative and monotonic');
  }
  const active=timeMs=>timeMs>=startedAt&&timeMs<startedAt+BLINK_DURATION;
  function begin(timeMs){
    const value=source();
    if(!Number.isFinite(value)||value<0||value>1)throw new TypeError('Blink random result must be within 0 and 1');
    const interval=BLINK.minInterval+value*(BLINK.maxInterval-BLINK.minInterval);
    startedAt=timeMs;next=timeMs+BLINK_DURATION+interval;count++;
  }
  return Object.freeze({
    sample(timeMs,automatic=true){
      validateTime(timeMs);
      if(typeof automatic!=='boolean')throw new TypeError('Automatic blinking must be boolean');
      if(automatic&&!active(timeMs)&&timeMs>=next)begin(timeMs);
      last=timeMs;
      return blinkClosure(timeMs-startedAt);
    },
    trigger(timeMs){
      validateTime(timeMs);
      if(active(timeMs)){last=timeMs;return false;}
      begin(timeMs);last=timeMs;return true;
    },
    get count(){return count;},
    get next(){return next;},
  });
}
