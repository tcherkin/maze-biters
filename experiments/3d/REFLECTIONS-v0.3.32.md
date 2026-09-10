# v0.3.32 — movement cadence and wall reflections

The player is sampled at the display frame's time between the fixed 120 Hz
simulation ticks. The presentation clock is bounded to one scaled tick, uses
only committed moves, and never advances gameplay. Pause and hidden-page
states stay frozen. Player geometry and its glass finish are unchanged.
Materials are prepared before enabling Start. Same-maze restarts reuse wall
buffers and matching roster models instead of discarding compiled programs.

Nearby occupied wall planes use two current-frame reflected cameras, grouped
across coplanar stones and cropped to their visible vertical band. Their atlas
is bounded to 1536 × 128. Other walls retain screen-space reflections. A weak
purple coating replaces the former strong dimming. Reflection captures avoid
a second glass transmission pass; planar actor/stone materials are simplified,
while the reflected floor retains its actual colored illumination. This is a
bounded hybrid reflection system, not ray tracing or a planar camera per wall.
At a 45° downward camera angle, low vertical mirrors naturally show mostly
floor unless an object stands close enough to intersect their reflected view.

## Verification

- `check-render-cadence.cjs`: actual engine at 60/120/144/240 Hz. Over straight
  travel at 144 Hz, repeated positions fell from 37/216 to 0; at 240 Hz from
  181/360 to 0. Confirmed immutable logical snapshots, committed-cell bounds,
  and pause freezing.
- `check-glass-reflections.cjs --4k`: real WebGL at 1920×1080 and 3840×2160,
  compared with commit `abb66a5`. A two-colored marker shows its green front
  directly and its red back in the mirror; its reflection follows sideways
  movement. Interrupted capture restores materials, visibility, clipping,
  shadows and render targets. No browser/shader errors.
- `check-wall-mirrors.cjs --frames 30`: floor and top pixels protected, wall
  reflections move, capture textures cannot feed back into their attachments,
  six rebuild/toggle cycles have stable resources.
- `check-player-glass.cjs`: articulation, shield, swallowing, respawn and six
  restart cycles passed with the original player geometry/materials restored.
- `check-cache.cjs`: all four root/subpath entries load v0.3.32 with all 21
  production modules versioned, even after the old player module was cached.
- Nine 3D test suites and the eight original project checks passed.
- `browser-check.cjs`: actual entry/start, held keys, turns, pause, camera,
  restart and mobile layout passed. Before startup preparation, this run
  exposed a roughly 2-second first-play compile stall; the rerun after
  preparation/reuse had a 41.7 ms maximum frame interval. This is a short
  functional run, not a claim that no future gameplay frame can stall.

Local Edge/ANGLE/RTX 5090 measurements, 180 warmed moving-player frames, four
snake colors, 45°/1.5×, CPU submission plus `gl.finish` completion:

| Resolution | Published .31 p50 / p95 | .32 p50 / p95 |
|---|---|---|
| 1920×1080 | 4.8 / 9.6 ms | 6.0 / 9.3 ms |
| 3840×2160 | 5.3 / 6.9 ms | 6.3 / 8.6 ms |

Actual GL draws: 383 → 401. Geometry/texture counts in this fixture: 49/15
for both. Planar reflections carry a modest extra cost; the cadence fix
removes repeated positions rather than promising a universal FPS increase.
These local measurements vary with system load and are not low-end-device
performance guarantees. Raw reports/screenshots use ignored `preview-*`
files; the check tools reproduce them without modifying game files.
