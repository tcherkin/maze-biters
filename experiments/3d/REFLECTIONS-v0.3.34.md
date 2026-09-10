# v0.3.34 — stable exposed wall mirrors

The v0.3.33 DPI correction fixed atlas coordinates, but the two-plane policy
still changed wall appearance abruptly as actors moved. A wall could switch
between an unlit planar capture, a lit screen-space hit and its purple base.
Internal stone-end joints also competed for those two slots.

The renderer now captures every visible exposed cardinal wall plane through
one planar path. A probe beyond each carved face excludes joints within the
structural wall union. The current maze has ten exposed +Z planes, usually
seven or eight visible at the gameplay camera. Selection depends only on
geometry and camera visibility; actor count, splitting and movement cannot
change wall ownership. Orthographic visibility follows the parallel view
direction even at shallow tilt.

The fixed 2048×384 atlas contains sixteen 512×96 strips arranged in four rows.
All selected strips update in the same frame, without round-robin stale views
or crossfades between techniques. Only the first capture updates shared shadow
maps; Three r180 excludes global mirror clipping from its shadow passes. The
screen-space depth/color capture is removed. The original main-view models,
floor, wall tops and flashlight remain intact.

## Verification

- Before: a frozen scene changed 27,730 or 77,569 screen pixels by more than
  three byte levels solely when the old actor-priority hints changed.
- `check-mirror-stability.cjs`: a real GPU wall mask covers 363,415 interior
  side pixels at DPR 1.5. All six actor-hint configurations retain identical
  plane keys and wall pixels (maximum channel difference zero). The mask
  fixture restores and warms normal materials before measuring.
- `planar-selection.test.mjs`: actual exposed geometry, short ends retained,
  54 actor configurations, full/zoomed view, offscreen pan and 0°/5°/45° tilt.
  These three tests failed against the old actor-ranked implementation.
- `planar-viewport.test.mjs`: sixteen cases at DPR 1/1.25/1.5/2, six strips
  across two rows, failure in strip five, exact physical rectangles and state
  restoration including shadow flags. All 28 3D test cases pass.
- `check-wall-mirrors.cjs --frames 30`: unchanged floor/top pixels, reflected
  marker movement, no atlas feedback, six rebuild/toggle cycles with stable
  resources. Atlas is released on disabling and reused across paused frames.
- `check-glass-reflections.cjs --after-only --dpr 1.5`: front/back marker colors,
  projected footprint at two positions with three camera poses (pan/zoom and
  35°/45°/55° tilt), interrupted capture restoration, no WebGL/browser errors.
- `browser-check.cjs`: actual startup, keyboard movement/turns, pause, camera,
  restart and mobile layout pass; no errors. The short live run had a maximum
  frame interval of33.4ms, separate from the warmed-render benchmark below.
- `check-cache.cjs`: all four root/subpath entries load v0.3.34 with all21 own
  modules versioned, including after priming a real stale module HTTP cache.

Local Edge/ANGLE/RTX 5090, moving-player fixture, 1920×1080 CSS pixels at DPR1.5:
180 warmed frames had completion p50/p95 5.4/6.3ms (v0.3.33:5.2/6.4ms in the
same fixture). Actual GL draws increase 401→453, texture count drops15→13 and
geometry count stays49. These are local measurements, not a device guarantee.

The atlas has room for sixteen simultaneously visible planes. Current fixed-yaw
maze/camera combinations stay below that limit; a future layout exceeding it
needs an explicit capacity change. Captures retain lightweight luminous actor
materials and do not recursively reflect other mirrors. Vertical corner bevels
retain their polished base finish rather than screen-space approximations.
