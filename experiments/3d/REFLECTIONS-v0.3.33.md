# v0.3.33 — physical atlas coordinates

The previous planar capture passed physical atlas texels to Three.js r180's
public viewport/scissor setters. Those setters multiply by renderer pixel
ratio even on render targets. At DPR 1.5 the intended 768×128 tiles became
1152×192 writes into a 1536×128 atlas. The shader still sampled the original
tile rectangles, producing displaced, stretched and mixed wall reflections.

Each tile now sets the render target's own viewport/scissor in physical pixels
and rebinds the target. The caller's logical viewport/scissor remain untouched;
the previous target, cube face, mip, clipping and temporary materials are
restored even if a capture throws. The atlas resets to its full rectangle.
Planar/SSR edge blending now combines coverage separately from straight RGB,
avoiding repeated attenuation at partial-coverage edges.

## Verification

- Reproduced the old bug on actual WebGL at DPR 1.5: marker reflections landed
  near X=567/847 instead of their projected positions near X=1341/1539.
  The same scene after the fix places them near X=1341/1544. Small centroid
  differences are caused by the stone seams masking parts of the reflected
  rectangle, so the regression checks its projected footprint, not equality
  with an unobstructed color centroid.
- `node --test experiments/3d/tests/planar-viewport.test.mjs`: 16 cases at
  DPR 1/1.25/1.5/2, canvas and nested targets, success and injected failure.
  Exact 768×128 tile rectangles, no overlap and full state restoration.
  These checks failed on the former public-setter implementation.
- `check-glass-reflections.cjs --after-only --dpr N`: actual GPU reflection
  location and front/back color, sideways motion, pan, zoom, 35°/45°/55° tilt,
  capture interruption and browser errors. Tested display ratios include
  1, 1.25, 1.5 and requested 2 (production renderer caps the latter at 1.5).
- `check-wall-mirrors.cjs --frames 30`: protected floor/top pixels, mirror
  motion, no framebuffer feedback and stable resources across rebuilds.
- `check-cache.cjs`: v0.3.33 and all 21 own modules at all four root/subpath
  entries, including a genuinely primed stale HTTP module cache.
- All 25 3D test cases and the eight original project checks passed.

The two-view planar budget and remaining screen-space fallback are unchanged.
This corrects atlas mapping; it does not turn the hybrid into recursive mirrors.
Diagnostic screenshots/reports remain in ignored `preview-*` files.
