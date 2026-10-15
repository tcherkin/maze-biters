// Replay local actor operations into a world-space capture without borrowing
// the camera transform already installed on the visible destination.
const states = new WeakMap();
const reads = name => typeof name !== 'string' || /^(?:get|create|isPoint)/.test(name)
  || name === 'measureText' || name === 'isContextLost'
  || name === 'constructor' || name === 'toString' || name === 'valueOf';

/**
 * Native-compatible Canvas 2D proxy. Draw callbacks, when supplied, receive
 * the original drawImage arguments and their respective context as `this`.
 * Read/creation methods run only on primary; setters and drawing/path/state
 * operations run primary first. A failed capture is disabled for this pair.
 * secondaryPreparedMode labels only prepared geometry (e.g. an alpha-only
 * actor mask); ordinary sprite draws retain their original mirroring.
 */
export function createPairedContext(primary, secondary, {
  drawImagePrimary, drawImageSecondary, onSecondaryError, secondaryPreparedMode
} = {}) {
  if (!primary || typeof primary.drawImage !== 'function') throw new TypeError('Primary Canvas 2D context required');
  for (const callback of [drawImagePrimary, drawImageSecondary, onSecondaryError]) {
    if (callback != null && typeof callback !== 'function') throw new TypeError('Context callbacks must be functions');
  }
  if (secondaryPreparedMode != null && (typeof secondaryPreparedMode !== 'object' || Array.isArray(secondaryPreparedMode)))
    throw new TypeError('Prepared secondary mode must be an object');
  const preparedSecondary = secondaryPreparedMode == null ? null : Object.freeze({...secondaryPreparedMode});
  const state = {secondaryEnabled: secondary != null, failures: 0, lastError: null};
  const methods = new Map();
  function disable(error) {
    state.secondaryEnabled = false;
    state.failures++;
    state.lastError = String(error?.message ?? error);
    try { onSecondaryError?.(error); } catch { /* Capture diagnostics cannot stop gameplay. */ }
  }
  if (state.secondaryEnabled) {
    try {
      if (typeof secondary.drawImage !== 'function') throw new TypeError('Secondary Canvas 2D context required');
    } catch (error) { disable(error); }
  }
  const paired = new Proxy(primary, {
    get(target, property) {
      if (property === 'paintPreparedSurface') {
        if (!methods.has(property)) methods.set(property, paint => {
          if (typeof paint !== 'function') throw new TypeError('Prepared surface painter required');
          const invoke = (context, mode = null) => {
            const callback = mode
              ? (destination, resolve, currentMode) => paint(destination, resolve, {...currentMode, ...mode})
              : paint;
            return typeof context.paintPreparedSurface === 'function'
              ? context.paintPreparedSurface(callback)
              : callback(context, source => source, {emission: false});
          };
          // Prepared geometry needs each destination's OWN transform. Replaying
          // its final screen-space drawImage would borrow the visible camera
          // for the logical-world emission capture and misregister the light.
          const result = invoke(target);
          if (state.secondaryEnabled) {
            try { invoke(secondary, preparedSecondary); } catch (error) { disable(error); }
          }
          return result;
        });
        return methods.get(property);
      }
      const member = Reflect.get(target, property, target);
      if (typeof member !== 'function' || property === 'constructor') return member;
      if (!methods.has(property)) {
        methods.set(property, (...args) => {
          const primaryMethod = property === 'drawImage' && drawImagePrimary ? drawImagePrimary : member;
          const result = Reflect.apply(primaryMethod, target, args);
          if (state.secondaryEnabled && !reads(property)) {
            try {
              const secondaryMethod = property === 'drawImage' && drawImageSecondary
                ? drawImageSecondary : Reflect.get(secondary, property, secondary);
              if (typeof secondaryMethod !== 'function') throw new TypeError(`Capture has no ${String(property)} method`);
              Reflect.apply(secondaryMethod, secondary, args);
            } catch (error) { disable(error); }
          }
          return result;
        });
      }
      return methods.get(property);
    },
    set(target, property, value) {
      const result = Reflect.set(target, property, value, target);
      if (result && state.secondaryEnabled) {
        try {
          if (!Reflect.set(secondary, property, value, secondary)) throw new TypeError(`Cannot set capture ${String(property)}`);
        } catch (error) { disable(error); }
      }
      return result;
    }
  });
  states.set(paired, state);
  return paired;
}

// A failed secondary can contain a partial actor. The compositor should skip
// that capture, then create a new pair after clearing/recovering its surface.
export function pairedContextStatus(context) {
  const state = states.get(context);
  return state ? {...state} : null;
}
