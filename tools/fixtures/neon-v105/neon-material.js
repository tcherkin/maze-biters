// Frozen v1.02.05.00 compositor baseline for differential regression tests.
// Source behavior is retained; only unchanged helper import paths are relocated.
// Accepted inner-light material, isolated from scene lighting and source art.
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = (low, high, value) => {
  const u = clamp((value - low) / (high - low));
  return u * u * (3 - 2 * u);
};
const strengthValue = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new TypeError('Neon strength must be finite');
  return clamp(numeric, 0, 2);
};

// Keep this pixel math identical to the accepted 70% material study.
// Alpha, transparent RGB, neutral teeth, dark seams and cavities are untouched.
export function enhancePixels(pixels, strength = 1) {
  if (!pixels || pixels.length % 4) throw new TypeError('Expected RGBA pixels');
  const output = new Uint8ClampedArray(pixels), amount = strengthValue(strength);
  if (amount === 0) return output;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    if (pixels[i + 3] === 0 || high <= 48 || high - low <= 12) continue;
    const v = high / 255, saturation = (high - low) / high;
    const skin = smooth(.13, .45, saturation) * smooth(.20, .48, v);
    const newValue = v + (1 - v) * .28 * amount * skin;
    const core = .16 * amount * skin * smooth(.48, .93, v);
    for (let c = 0; c < 3; c++) {
      const hueChannel = pixels[i + c] / high;
      output[i + c] = 255 * newValue * (hueChannel + (1 - hueChannel) * core);
    }
  }
  return output;
}

// Independent coloured inner emission, composited after DUSK. It deliberately
// contains no opaque backing, outlines, neutral teeth or mouth cavities.
export function emissionPixels(pixels, strength = 1) {
  if (!pixels || pixels.length % 4) throw new TypeError('Expected RGBA pixels');
  const output = new Uint8ClampedArray(pixels.length), amount = strengthValue(strength);
  if (amount === 0) return output;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    if (pixels[i + 3] === 0 || high <= 48 || high - low <= 12) continue;
    const value = high / 255, saturation = (high - low) / high;
    const colour = smooth(.18, .52, saturation), interior = smooth(.22, .55, value);
    const band = smooth(.42, .94, value);
    const alpha = Math.round(pixels[i + 3] * clamp(amount * colour * interior * (.08 + .76 * band)));
    if (alpha === 0) continue;
    const lightValue = .80 + .20 * value;
    for (let c = 0; c < 3; c++) output[i + c] = 255 * lightValue * pixels[i + c] / high;
    output[i + 3] = alpha;
  }
  return output;
}

function browserCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

// Only prepared immutable art. The renderer's mutable 256x256 blend layers
// must pass through unchanged and must never become stale cached textures.
function knownSprite(source) {
  if (!source || typeof source.getContext !== 'function') return false;
  const {width, height} = source;
  return (width === 160 && height === 57) || (width === 1008 && height === 968)
    || (width === 48 && height === 222) || ribbonSprite(source);
}
// The immutable, padded body material. Its mutable silhouette scratch canvas
// is NEVER a source for the texture cache, even when it is reused each frame.
const ribbonSprite = source => source?.width === 480 && source?.height === 74;

export function createNeonMaterial({canvasFactory = browserCanvas, strength = .7,
  maxCacheBytes = 64 * 1024 * 1024} = {}) {
  if (typeof canvasFactory !== 'function') throw new TypeError('Canvas factory required');
  if (!Number.isFinite(maxCacheBytes) || maxCacheBytes < 0) throw new TypeError('Finite non-negative cache budget required');
  let amount = strengthValue(strength), cache = new WeakMap();
  const owned = new Set(), records = new Set();
  let cachedBytes = 0, cacheGeneration = 0, pixelReads = 0, cacheBuilds = 0;
  let cacheHits = 0, draws = 0, bypasses = 0, failures = 0, lastError = null;
  let emissionCacheHits = 0, emissionDraws = 0, emissionBypasses = 0, lastInvalidation = null;
  let preparedDraws = 0, preparedEmissionDraws = 0;
  let contextLosses = 0, contextRecoveries = 0, contextLossFallbacks = 0;
  let cachedContextListeners = 0;
  const wrappers = new WeakMap(), emissionWrappers = new WeakMap(), rawContexts = new WeakMap();

  function release(surface) {
    if (!surface) return;
    try { surface.width = surface.height = 1; } catch { /* Context loss can also affect disposal. */ }
    owned.delete(surface);
  }
  function releaseRecord(record) {
    for (const entry of record.contexts || []) {
      if (entry.lostListener) {
        try { entry.surface.removeEventListener('contextlost', entry.onLost); } catch { /* Best-effort cleanup. */ }
        cachedContextListeners--; entry.lostListener = false;
      }
      if (entry.restoredListener) {
        try { entry.surface.removeEventListener('contextrestored', entry.onRestored); } catch { /* Best-effort cleanup. */ }
        cachedContextListeners--; entry.restoredListener = false;
      }
    }
    release(record.material); release(record.emission);
    cachedBytes -= record.bytes || 0;
    records.delete(record);
  }
  function markLost(record, entry) {
    if (!record.invalid) contextLosses++;
    record.invalid = true; entry.lost = true;
    lastError = 'Neon cached Canvas 2D context lost';
  }
  function observe(record, surface, context) {
    const entry = {surface, context, lost: false, polledLost: false};
    entry.onLost = () => markLost(record, entry);
    entry.onRestored = () => {
      // Canvas restoration creates an EMPTY bitmap. Never reuse the restored
      // surface: both material and emission must be repopulated together.
      record.invalid = true; entry.lost = false; entry.polledLost = false;
    };
    record.contexts.push(entry);
    try {
      if (typeof surface.addEventListener === 'function' && typeof surface.removeEventListener === 'function') {
        surface.addEventListener('contextlost', entry.onLost); entry.lostListener = true; cachedContextListeners++;
        surface.addEventListener('contextrestored', entry.onRestored); entry.restoredListener = true; cachedContextListeners++;
      }
    } catch { /* isContextLost polling remains available where events are not. */ }
  }
  function healthy(record) {
    for (const entry of record.contexts) {
      try {
        if (typeof entry.context.isContextLost !== 'function') continue;
        if (entry.context.isContextLost()) {
          markLost(record, entry); entry.polledLost = true;
        } else if (entry.polledLost) {
          entry.lost = false; entry.polledLost = false; record.invalid = true;
        }
      } catch { markLost(record, entry); entry.polledLost = true; }
    }
    return !record.invalid;
  }
  function reset(reason = 'reset') {
    cache = new WeakMap();
    for (const record of records) releaseRecord(record);
    for (const surface of owned) release(surface);
    owned.clear(); cachedBytes = 0; cacheGeneration++;
    lastInvalidation = String(reason);
  }
  function invalidate(reason = 'invalidated') { reset(reason); }
  function setStrength(value) {
    const next = strengthValue(value);
    if (next !== amount) { amount = next; reset('strength'); }
    return amount;
  }
  function rememberFailure(source, error) {
    const previous = cache.get(source);
    if (previous?.bytes) releaseRecord(previous);
    cache.set(source, {material: source, emission: null, bytes: 0});
    failures++; lastError = String(error?.message ?? error);
  }
  function material(source, emission = false) {
    if (amount === 0 || !knownSprite(source)) {
      if (emission) emissionBypasses++; else bypasses++;
      return emission ? null : source;
    }
    const saved = cache.get(source);
    let recovering = false;
    if (saved) {
      if (!saved.bytes || healthy(saved)) {
        if (emission) emissionCacheHits++; else cacheHits++;
        return emission ? saved.emission : saved.material;
      }
      if (saved.contexts.some(entry => entry.lost)) {
        // No allocations or pixel reads while a cache is lost. In particular,
        // loss of only emission must never blank the normal visible sprite.
        contextLossFallbacks++;
        return emission ? null : source;
      }
      recovering = true;
      releaseRecord(saved); cache.delete(source);
    }
    let surface, emissionSurface;
    try {
      const bytes = source.width * source.height * 4;
      if (2 * (cachedBytes + bytes) > maxCacheBytes) throw new Error('Neon texture cache budget reached');
      surface = canvasFactory(source.width, source.height);
      const paint = surface.getContext('2d', {willReadFrequently: true});
      if (!paint) throw new Error('Neon cache Canvas 2D is unavailable');
      paint.drawImage(source, 0, 0);
      pixelReads++;
      const pixels = paint.getImageData(0, 0, source.width, source.height);
      const luminous = emissionPixels(pixels.data, amount);
      if (ribbonSprite(source)) {
        // Ribbon strips overlap before receiving one silhouette mask. Matte
        // emission onto opaque black once so that overlapping strips cannot
        // accumulate their alpha into bright seams. The scene composites this
        // light with screen: black contributes nothing, and RGB*A preserves
        // the original emission intensity without a second pixel read/pass.
        for (let i = 0; i < luminous.length; i += 4) {
          const alpha = luminous[i + 3] / 255;
          for (let channel = 0; channel < 3; channel++) luminous[i + channel] *= alpha;
          luminous[i + 3] = 255;
        }
      }
      pixels.data.set(enhancePixels(pixels.data, amount));
      paint.putImageData(pixels, 0, 0);
      emissionSurface = canvasFactory(source.width, source.height);
      const emissionPaint = emissionSurface.getContext('2d');
      if (!emissionPaint) throw new Error('Neon emission Canvas 2D is unavailable');
      pixels.data.set(luminous); emissionPaint.putImageData(pixels, 0, 0);
      const record = {material: surface, emission: emissionSurface, bytes, contexts: [], invalid: false};
      observe(record, surface, paint); observe(record, emissionSurface, emissionPaint);
      cache.set(source, record); records.add(record);
      owned.add(surface); owned.add(emissionSurface);
      cachedBytes += bytes; cacheBuilds++;
      if (recovering) contextRecoveries++;
      if (!healthy(record)) {
        contextLossFallbacks++;
        return emission ? null : source;
      }
      return emission ? emissionSurface : surface;
    } catch (error) {
      release(surface); release(emissionSurface);
      // Failed/tainted/budget-limited sources retry only after invalidation.
      rememberFailure(source, error);
      return emission ? null : source;
    }
  }
  function wrapContext(context, value = amount) { return wrap(context, false, value); }
  function wrapEmissionContext(context, value = amount) { return wrap(context, true, value); }
  function wrap(context, emission, value) {
    if (!context || typeof context.drawImage !== 'function') throw new TypeError('Canvas 2D context required');
    setStrength(value);
    context = rawContexts.get(context) || context;
    const contexts = emission ? emissionWrappers : wrappers;
    if (contexts.has(context)) return contexts.get(context);
    const methods = new Map();
    const preparedMode = Object.freeze({emission});
    const resolvePreparedTexture = source => material(source, emission);
    const wrapped = new Proxy(context, {
      get(target, property) {
        if (property === 'paintPreparedSurface') {
          if (!methods.has(property)) methods.set(property, paint => {
            if (typeof paint !== 'function') throw new TypeError('Prepared surface painter required');
            if (emission) preparedEmissionDraws++; else preparedDraws++;
            // The painter composites directly to this unwrapped destination.
            // Only its immutable texture is enhanced/cached; the newly drawn
            // silhouette is not mistaken for a static sprite on later frames.
            // The normal target can itself pair visible pixels with an actor
            // occlusion capture. Let each of those targets paint in its own
            // coordinates too, while retaining this wrapper's material mode.
            return typeof target.paintPreparedSurface === 'function'
              ? target.paintPreparedSurface(destination => paint(destination, resolvePreparedTexture, preparedMode))
              : paint(target, resolvePreparedTexture, preparedMode);
          });
          return methods.get(property);
        }
        if (property === 'drawImage') {
          if (!methods.has(property)) methods.set(property, (source, ...rects) => {
            if (emission) emissionDraws++; else draws++;
            const texture = material(source, emission);
            if (!texture) return;
            try { return target.drawImage(texture, ...rects); }
            catch (error) {
              if (texture === source) throw error;
              rememberFailure(source, error);
              if (!emission) return target.drawImage(source, ...rects);
            }
          });
          return methods.get(property);
        }
        const member = Reflect.get(target, property, target);
        if (typeof member !== 'function') return member;
        if (!methods.has(property)) methods.set(property, member.bind(target));
        return methods.get(property);
      },
      set(target, property, value) { return Reflect.set(target, property, value, target); }
    });
    contexts.set(context, wrapped); rawContexts.set(wrapped, context);
    return wrapped;
  }
  function stats() {
    return {strength: amount, cachedBytes, cacheGeneration, cacheBuilds,
      cachedSprites: owned.size / 2, pixelReads, cacheHits, draws, bypasses, failures, lastError,
      emissionCachedBytes: cachedBytes, emissionCachedSprites: owned.size / 2,
      emissionCacheHits, emissionDraws, emissionBypasses, totalCachedBytes: cachedBytes * 2,
      preparedDraws, preparedEmissionDraws,
      maxCacheBytes, lastInvalidation, contextLosses, contextRecoveries, contextLossFallbacks,
      cachedContextListeners,
      alphaPreserved: true, darkContoursPreserved: true,
      cachedTextureTreatment: true, dynamicScratchLayersEnhanced: false};
  }
  function prewarm(sources) {
    if (!sources || typeof sources[Symbol.iterator] !== 'function') throw new TypeError('Iterable sprite sources required');
    for (const source of sources) material(source);
    return stats();
  }
  return {wrapContext, wrapEmissionContext, setStrength, reset, invalidate, prewarm, stats};
}
