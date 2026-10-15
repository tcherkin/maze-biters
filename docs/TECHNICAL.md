# Technical guide

[Game guide](../README.md) · [Ръководство на български](../README.bg.md)

This document describes the local **v1.02.13.00** implementation.
It separates current behaviour from future website plans. The
[animation stability notes](ANIMATION-STABILITY-v1.01.96.md)
describe the current presentation adapters, restored native cell-contact
authority and explicitly opt-in continuous-contact experiment.

## Wider player sprites (v1.02.13.00)

P1, P2 and allied AI now use the approved size-study artwork: 12.5% wider
around the same center, with unchanged height and native 80px HD / 160px
4K cells. All 49 doubled-travel mouth poses and 25 eyelid poses retain their
existing clocks and selection rules. The wider mouth and matching eye patches
are baked from the approved source artwork, not stretched during playback.
Enemy/hunter art, AI, movement, player rotation and gameplay contact rules
remain unchanged. Snake eye glints and other lighting effects are untouched.

The player-only intake aperture, lower inlet and cosmetic swallowed-object
target follow the same horizontal fit, so an eaten tail still enters the
mouth. Physical contours and leader outlines use the existing pixel-derived
preparation. There are no new per-frame deformation passes or pixel reads.

The compact normal/bright source pack decodes to 15,369,468 bytes for HD and
57,680,864 bytes for 4K (about 14.66 / 55.01 MiB), excluding runtime surfaces
and browser/GPU copies. Only one quality is active. The original bright-mode
color and glow transform is unchanged. Versioned URLs and fit checks prevent
mixing old-width mouth sprites with wider eyelids or intake geometry.

Rebuild using the approved size-study source with:
`node tools/build-fantasy-biters.mjs --source <fantasy-biter-size-study> --size-fit wide`

The previous pack and touched files are retained in the workspace backup
`outputs/before-fantasy-wider-integration-20261015`. The side-by-side experiment
remains available separately. This is a local update, not a GitHub publication.

## Stronger player mouths (v1.02.12.00)

The approved revision-5 study replaces only the P1/P2/allied-AI mouth art:
lower-lip travel is doubled (16px side / 20px front at 160px native size).
The rear cap follows the same approved experiment, 6px instead of 3px.
The normalized walking range remains 0.26–0.40; existing bite onset, duration
and release remain unchanged. This does not double the timing strength again.
All 49 mouth poses are packed losslessly at 80px HD and 160px 4K, including
the original power-mode brightness transform. Playback still only draws
cached native pixels, without new per-frame deformation or extra poses.

The 25-pose blinking animation, its independent clocks, and all 36 packed
blink sheets are unchanged. Original enemy/hunter atlases, animation, AI
and movement remain untouched. The upper face and upper teeth remain fixed.
The player-only intake aperture follows the stronger lower-lip geometry so
swallowed tail/head/scorpion visuals still disappear inside the mouth.

The new compact source pack decodes to 14,104,516 bytes in HD and 54,248,268
bytes in 4K (about 13.45 / 51.74 MiB), excluding runtime surfaces and browser
or GPU copies. Only the selected quality is loaded. Revisioned module and
asset URLs prevent cached revision-4 art from mixing with the new anatomy.
The builder supports `--output` for a validated staged pack before installation.
Previous revision-4 files are preserved in the workspace backup.

The integration regression additionally pins every normal pose to the
approved revision-5 source and checks unchanged blink sheets and enemy paths.
All 2352 normal/bright runtime poses, 606 timing samples and quality/context
recovery checks pass. Native and HD-2x intake masks remain exact; a fractional
stress transform permits at most 2/255 alpha rounding only on the outer actor
clip edge (one sampled pixel), and at most 1/255 elsewhere, with exact RGB.
This bounded Canvas sampling difference requires no production rendering change.
Browser checks loaded revision 5 at both native qualities and exercised six
native consumption scenarios plus 180 gameplay frames per quality, without
reported animation errors. These are functional checks, not an FPS benchmark.

## Fantasy Biter players (v1.02.11.00)

P1, P2 and the allied AI participant now use the approved Fantasy Biter
revision-4 open artwork, gentle mouth animation and eye-only blink. Enemy
hunters retain their original atlases, 19-pose mouth animation and anatomy.
Movement, controller-axis rotation, AI, native cell contacts, bite event times,
flashlights, power-mode brightness and competitive leader effects are unchanged.

`assets/fantasy-biters/manifest.json` selects native 80px HD or 160px 4K art.
Each of the three palettes has four directions and normal/bright variants.
49 mouth poses and 25 eyelid poses are stored as a base plus guarded changing
regions, not a mouth-by-eye Cartesian atlas. Native composition replaces the
regions in one pooled surface, then draws that complete surface once through
the original transform. This retains the study's fix for transverse seams.
Playback performs no canvas allocation or pixel readback. Asset pixels are
decoded only for the active quality; the pack accounts for 13.16 MiB in HD or
49.99 MiB in 4K, excluding runtime canvases, browser overhead and GPU copies.

Walking uses the approved 0.26–0.40 gentle closure range. Existing bite events
use the full approved gentle range and original event/release timings, never
the rejected fully-closed artwork. Each player has an independent 220ms blink
with a 3–7 second random interval and staggered first blink. Its private random
stream cannot change gameplay randomness. Pauses freeze the supplied game
clock; speculative contact sampling cannot advance visual blink state.

The new mouth aperture protects the new upper teeth and lip while preserving
the established tail/scorpion ingestion path. Cropped masks use a guarded
7x7 grid (574x252 HD; 1134x490 4K), avoiding oversized strip surfaces and
neighbour-frame sampling. Native and actual 2x scratch playback match the
standalone masks exactly; fractional stress transforms allow at most one
alpha level of bilinear-rounding difference. Source art is installed before
leader/mouth caches at the existing quality-preparation barrier. Stale quality
requests are ignored, and context recovery rebuilds the prepared surfaces,
including after a failed replacement cache build.
If the new asset pack cannot load, the legacy player source remains available.

Validation: `tools/test-fantasy-player-integration.mjs` checks all 2352 native
player poses across HD/4K, 606 timing samples, 96 player engine selectors,
96 original hunter selectors, preserved hunter/source hashes, blink isolation,
allocation-free playback, quality swaps and context restoration.
`tools/test-fantasy-mouth-intake.mjs` checks 196 masks and protects 88,494
upper-tooth/highlight pixels. `tools/build-fantasy-biters.mjs` builds the pack
from the approved study; its manifest records reconstruction and guard checks.

## Consumption scratch reuse (v1.02.10.00)

Point 4 optimizes only the snake consumption presentation path. The native
intake bitmap already assembled for the visible actor is reused by its
actor-mask destination within the same synchronous prepared-surface call,
provided that the texture resolver and emission mode match. Emission still
has its own raster pass. Each destination retains its own transform, clipping,
alpha and draw order. Shared scratch/mask revisions invalidate reuse after
nested callbacks, resets, failures or cache recovery; nothing is cached across
animation frames. The accepted 160x160 intake raster, curve samples, mouth
mask, bite timing, sprite artwork and lighting strengths are unchanged.

Two unused 256x256 cap-transition canvases and their unreachable helper chain
are removed. The two intake surfaces start at 1x1 and grow to the same 160x160
size on first intake, then stay pooled. Owned consumption scratch therefore
saves 729,080 bytes before use and 524,288 bytes (512 KiB) after use. The
runtime exposes current bytes and work counters through the snake animation
diagnostics (`intakeScratchBytes`, `intake`). Full-world ghost/bloom foreground
fallbacks remain intact; their bounds are not assumed to be the player's mouth.

The frozen-v109 `tools/test-consumption-buffers.mjs` differential suite passes
798 pixel-exact comparisons and 241 identical geometry checks, covering all
five palettes, four directions, HD/4K, head/tail/held/split consumption,
native/occlusion/emission receivers, resolver changes, nested callbacks and
context restoration. Literal 1920x1080 and 3840x2160 outputs are included.
Over 120 warmed intake calls, instrumented scratch draw operations fall from
30,360 to 20,280 and cleared pixels from 12,801,360 to 9,558,240. Both versions
allocate no runtime canvases and perform no runtime pixel reads. These are
local operation counts, not a whole-game FPS claim.

The 2026-10-14 native-browser v109/v110 comparison used two order-reversed
rounds and per-frame A/B–B/A alternation, with every visual effect enabled.
Real gameplay covered two level-1 seeds and the level-16 stress case; targeted
native consumption fixtures covered eight kinds, with the first cycle warmed
and excluded from timings. Average CPU update/draw submission time was:

| Scene | HD v109 → v110 | 4K v109 → v110 |
| --- | ---: | ---: |
| Ordinary gameplay | 4.132 → 4.070 ms | 4.199 → 4.158 ms |
| Stress gameplay | 11.255 → 11.176 ms | 10.880 → 10.879 ms |
| Tail-eating render fixture | 5.130 → 4.830 ms | 5.205 → 4.723 ms |

Whole-game differences (0.01–1.51%) are small and change sign in some rounds,
so they do not establish a general speedup. The tail-eating fixture improved
in both rounds: 7.41%/4.56% in HD and 9.29%/9.26% in 4K (pooled 5.85%/9.28%).
Held-tail and unchanged control fixtures have smaller/noisier differences.
This measures CPU submission, not GPU completion, displayed FPS or a weak-PC
guarantee. Targeted fixtures hold logical simulation after the native bite;
their timing is rendering only. All 9,856 measured frames completed without
runtime errors and all 184 simulation/geometry/RNG/camera checkpoints matched.

Every native case retained exactly 524,288 fewer bytes of owned snake buffers
after first use in both HD and 4K; this is not total browser RAM or VRAM.
The original HD/4K game profiles use maze canvases of 1440x1000/2880x2000,
while the independent tests above additionally cover literal display sizes.
Separate browser visual QA found zero changed pixels in 158 frames, including
128 consumption poses. No new sprite, effect setting or gameplay rule is used.

## Camera-bounded glow captures (v1.02.09.00)

Emission and actor-occlusion capture canvases now cover the camera's world
source rectangle plus an eight-source-pixel reconstruction guard. Origins stay
on the original integer world-pixel lattice: emission remains 2x and the actor
mask 1x. Output projection, dusk masking, the 0.5x halo, blur, blend order,
strengths, palettes, artwork and all gameplay remain unchanged. Reflection
maps and eye tiles keep the existing implementation.

Capacity grows in 64-pixel buckets; a materially smaller requirement must
persist for 120 frames before reclaiming an old wide-camera reserve. The entire
reserve stays inside the original finite world, including at maze edges.
Unknown/invalid camera bounds use the previous full-world capture. Context
loss still uses the existing recovery path. No pixel readback, new quality
setting, per-frame canvas allocation, or dynamic resolution is introduced.

`__mazeBitersNeonDiagnostics().captureRegions` reports active/capacity pixels,
clear-work counters, reserve changes and fallback frames. These counters are
not whole-process RAM/VRAM or GPU timing measurements.

The portable `tools/test-neon-glow-regions.mjs` differential suite includes a
frozen v108 compositor. Native HD/4K fixtures use fresh buffers and assert that
the backing capacity really is cropped, rather than accidentally testing an
old full-world reserve. Moving cameras, reclamation, unknown bounds, world
edges, context recovery and eye timing are also covered. Cropped native-size
output permits at most 2/255 per channel on at most 0.01% of pixels, accounting
for composited subpixel rasterization rounding. Full-world native fixtures
remain pixel-exact; smaller fixtures retain the 1/255 ceiling. The optional
`--strict-rounding` flag enforces 1/255 everywhere and deliberately exposes
that the new cropped path is not byte-identical. This is not a quality or
resolution reduction.

Real-game v108/v109 comparison on 2026-10-14 used two order-reversed rounds,
two ordinary level-1 seeds and a level-16 stress case starting with 9 snakes
(63 segments). Each case alternated A/B and B/A within the same RAF. Across
12 runs and 5,760 measured frames, all 24 simulation/geometry/RNG/camera
checkpoints matched and no runtime errors were recorded. Audio was excluded
equally; every visual effect remained enabled. Average CPU update/draw
submission time (not GPU completion or displayed FPS) was:

| Scene | HD v108 → v109 | 4K v108 → v109 |
| --- | ---: | ---: |
| Ordinary | 3.595 → 3.465 ms | 3.593 → 3.445 ms |
| Stress | 9.877 → 9.840 ms | 9.342 → 9.287 ms |

The ordinary scene's approximately 3.6–4.1% reduction was consistent across
both rounds; the stress difference below 1% is not evidence of a meaningful
general speedup. No weak-PC FPS guarantee is inferred. At the settled close
camera, the two changed captures clear 458,752 instead of 1,152,000 pixels
per frame (60.18% less), saving 2,772,992 bytes / 2.64 MiB of retained RGBA
capacity in both modes. This is the affected capture capacity, not total
process memory; world-space source density intentionally does not change
with HD/4K output. Wide/full-world cameras save less or nothing, and a
previously wide reserve takes 120 smaller frames to reclaim.

Browser QA compared 190 frames in HD/4K, including 128 bite-animation frames
and 32 settled camera poses. 24 camera poses explicitly exercised reclaimed
cropped capacities. Maximum channel difference was 2/255; the most changed
pixels in one frame were 616/1,440,000 in HD and 2,252/5,760,000 in 4K, mostly
one-level differences. No visible difference was found in the reviewed
captures. These native game quality presets render 1440x1000 and 2880x2000;
the independent compositor suite additionally tests literal 1920x1080 and
3840x2160 output. Results and frozen v108 sources are retained locally under
`outputs/game-optimization-v109-2026-10-14` in the work chat workspace.
This version is local and has not been published to GitHub.

## Curve preparation and whole-source culling (v1.02.08.00)

Only two additional CPU optimizations are included; raster sizes, artwork,
effects, trajectories, compression clocks, gameplay and eye schedules remain
unchanged. No new visual quality setting or sharp native-screen glow is added.

- Joined-prefix reverse curves skip preparation only for an exactly unchanged
  phase/compression. First phase-zero initialization and later snapshot
  reactivation are preserved. The interrupted-turn integrator reuses private
  temporary storage instead of allocating an object for every integration.
- Engine whole-snake bounds are reused by the reflection renderer. Entire
  sources outside camera plus kernel reach and resampling guard are rejected
  before sampling their length. The rigid head's light centreline is included
  separately because it can extend beyond the visible artwork. Unknown bounds
  retain the original complete sampling path. Per-stamp culling remains active.
- All snakes still advance their original movement, AI and eye schedules;
  this does not freeze invisible creatures or omit light reaching the screen.

The dedicated `test-snake-curve-preparation-cache.mjs` compares against frozen
v107 curves, including short reverse tails, interrupted turns, snapshots and
changing compression. `test-neon-source-culling.mjs` checks exact reflection
pixels, all camera edges/corners, rigid-head extensions and fail-open inputs.
The curve-only microbenchmark is not a whole-game FPS claim. In the repeated
activation test, 2,000 identical activations previously rebuilt 2,000 knot
tables and performed 216,000 integrations; now they do no repeated preparation.
550,464 sampled points, 9,536 phase/snapshot checks and 2,880 native reverse
frames match exactly. The reflection differential suite checks 792 exact
floor/wall images, including 144 edge/corner, 16 rigid-head and 18 fail-open
cases.

Real-game verification compared a frozen local v107 snapshot with v108 (not
GitHub): 16 independent runs, 3,840 measured frames, two seeds and HD/4K. Those
sequential timings varied across runs, so a further paired confirmation loaded
both variants and alternated A/B and B/A order on each RAF (1,920 measured
frames, 600 warm-up +240 measured frames per seed, native 16ms simulation).
Audio output was excluded equally; all visual effects stayed enabled. Paired
CPU submission results, including update and draw, were:

| Mode | Median v107 → v108 | Mean v107 → v108 | p95 v107 → v108 |
| --- | ---: | ---: | ---: |
| HD | 4.80 → 4.80 ms | 4.796 → 4.749 ms | 9.00 → 8.90 ms |
| 4K | 4.90 → 4.90 ms | 4.918 → 4.907 ms | 9.10 → 8.90 ms |

These small differences do **not** establish a significant general FPS gain
or predict performance on a weaker computer. The demonstrated benefit is less
redundant work in targeted cases. The two reference HD scenarios reported
218,340 →158,169 reflection candidate stamps, while drawn stamps remained
109,083. Canvas capacity is unchanged: 143.79 MiB HD,183.15 MiB 4K (not total
RAM/VRAM). The changes introduce no extra raster caches.

Browser visual QA compared 158 captured frames, including tail consumption,
splits, lone-head consumption and scorpion consumption: all 79 HD frames were
pixel-identical; 4K differences were at most one pixel per frame, with a maximum
channel difference of 1/255. All visual and benchmark state checkpoints matched;
no runtime errors were recorded. The existing reverse-motion, short-tail,
solo-head, consumption and render-recovery regression suites also passed.

This version is local and has not been published to GitHub.

## Sparse captures and camera culling (v1.02.07.00)

Presentation-only integration of the accepted laboratory optimizations. The
original world-space 2x emission/eye raster, 1x masks/reflections and .5x soft
halo remain unchanged. The sharper native-screen laboratory compositor is
deliberately NOT included. No palettes, strengths, sprite artwork, geometry,
movement clocks, aggression schedules, gameplay rules or effects are removed.

- Eye glints use reusable guarded tiles, retaining per-snake scheduling even
  when off camera. Projection partitions destination pixel centers to avoid
  double blending at tile boundaries.
- Foreground occlusion captures only conservatively bounded creature/player
  regions and flushes in the original draw order. Unknown consumption ghosts,
  mouth-intake and bloom bounds use the original full-world fallback, reclaimed
  after 120 idle frames. Death sprites use their actual death coordinates.
- Whole-body bounds include the curved body, transformed head and retained
  tail, with a lighting margin. Only presentation is culled; AI, movement,
  collisions and eye clocks continue. Culled snakes retain the correct render
  time for a later game-over freeze. Tutorial rendering is not culled.
- Reflection visibility reuses vectors/polygon storage and batches corridor
  clips. Off-camera stamps are rejected with the full wall/floor kernel reach
  and an interpolation guard. Kernel shape, strength and stamp spacing stay
  the same. The alpha-only ribbon receiver avoids redundant texture work.

`__mazeBitersNeonDiagnostics().retainedBytes` counts actual retained canvas
capacities plus material/eye/reflection caches, not total process RAM or VRAM.
`__mazeBitersSceneVisibilityDiagnostics()` reports presentation culling only.
All optional render paths retain recovery and unbounded fail-open behavior.

Regression coverage: `test-neon-world-sparse.mjs`,
`test-neon-reflection-optimization.mjs`, `test-neon-reflection-culling.mjs`,
`test-ribbon-alpha-fastpath.mjs`, `test-scene-visibility.mjs`, updated semantic
neon equivalence/integration tests, and the existing render-recovery tests.
The real-browser comparison also checks native gameplay and eight consumption
scenarios in HD/4K. It found at most 1/255 measured channel differences in 158
checked frames, with matching sampled logical states. This is not a claim of
universal bit-for-bit raster identity on every browser/GPU.

On the development browser, 16 actual-game runs (two seeds, reversed variant
order, HD/4K, 600 warm-up + 240 measured frames each) gave these medians:

| Mode | v106 update + draw | v107 update + draw | Tracked canvas RGBA capacity |
| --- | ---: | ---: | ---: |
| HD | 6.8 ms | 4.0 ms | 147.88 → 143.79 MiB |
| 4K | 6.7 ms | 4.1 ms | 187.25 → 183.15 MiB |

Measured total includes autonomous tilt, native update and draw submission.
All effects stayed on; audio output was excluded equally. Original game backing
sizes were 1440x1000/2880x2000 plus the separate HUD. These are native game
simulation/render workloads with fixed 16 ms ticks, not an isolated sprite lab,
but submission time is not GPU completion time or guaranteed weak-PC FPS.
Observed RAF p95 improved from 16.7 to 8.4 ms in both modes. All 24 paired sampled
state/camera/RNG checkpoints matched; 3840 frames were measured without errors.

The effect captures alone fell 13.40→9.31 MiB; including retained material,
reflection and eye caches, 55.55→51.46 MiB. Their original raster sizes remain
quality-independent, so the 4.10 MiB saving is equal in HD and 4K. Whole-game canvas
capacity excludes decoded images, driver copies and JS heap. Heap readings
without controlled garbage collection varied and do not establish a total RAM
reduction. This local version has not been published to GitHub.

## Rendering performance (v1.02.06.00)

This is a presentation-only optimization of v1.02.05.00. It retains the
approved contours, original head artwork, five palettes, movement and bite
clocks, neon strengths, eye aggression schedule and wall reflections. Fog and
overhead lamps remain disabled. Native simulation/contact handlers are unchanged.

- Ribbon outline/strip work uses reusable Float64 buffers; texture commands are
  prepared once and replayed for visible and emission destinations. Each target
  still uses its own camera transform. Nested synchronous paints borrow separate
  command buffers, released even on failure.
- Exactly horizontal/vertical redundant screen-space contour vertices are
  removed. Curved/diagonal sampling is not coarsened; no lower-detail artwork is
  substituted. General diagonal simplification was rejected because it changed
  antialiased pixels in comparison tests.
- The actor occlusion pass needs only the silhouette, not the body's texture.
  Its alpha remains identical while omitting redundant strip drawing.
- Healthy paired contexts are reused across frames. Empty eye layers and the
  initial empty emission-occlusion pass are skipped. Failed captures still reset
  and rebuild their contexts.
- All five palettes reuse one synchronous ribbon scratch surface. Diagnostics
  now include its actual grown byte size, rather than five initial 1x1 sizes.
  The immutable neon-source inventory is reused too.

The exact remote `main` reference checked for this comparison was
`6a026cae18e6e3b9577ee336a9ceca0b80cad19e` (v1.02.03.00).
Open `qa/render-performance.html` on the local server to repeat the isolated
comparison: five 11-cell snakes, straight/corner/reverse poses, 576x400 logical
world, 960x640 backing store, 60 warmup frames and three batches of 90 frames per
variant. Its historical renderer is an exact frozen Git blob. Direct shared
helpers matched that commit apart from cache-version queries at test creation;
this is not a complete historical executable of the game.

On the development machine's Chromium browser, median synchronous drawing cost
in that fixture was:

| Fixture | Before optimization | After optimization |
| --- | ---: | ---: |
| GitHub v103 renderer, no added neon | 0.7 ms | 0.7 ms |
| Current continuous contours, no neon | 5.6 ms | 3.3 ms |
| Current contours and all neon effects | 18.5 ms | 12.6 ms |

Full-neon p95 fell from 23.8 to 16.2 ms. In a separate native-game QA workload
(mode 1, seed 28, 90 update+draw steps at 16 ms, three restarts), median total
elapsed time fell from 2314.3 to 1714.8 ms, approximately 26%. All runs completed
without an animation/contact error. These are CPU/browser submission workloads,
not GPU completion measurements or a promise of displayed FPS on a slower PC.
Asset preparation and cache warmup are excluded from the isolated measurement.

The remaining expensive additions are the continuous ribbon renderer and the
extra neon captures/compositing. Cached sprite-color treatment alone added
little cost in this fixture; rare eye glints are not the primary bottleneck.
Optional lower-resolution lighting/reflection rendering is a possible next
quality/performance tradeoff, but this release removes no approved effect.

`test-snake-ribbon-performance.mjs` and
`test-neon-performance-equivalence.mjs` retain frozen v105 reference modules and
check exact native-Canvas pixel/alpha parity, camera transforms, prepared modes,
wrapper reuse and recovery. Run them alongside material, mouth-intake,
consumption, reverse-motion and render-cache regressions. The new versioned
module URLs prevent a browser from mixing the optimization with cached v105
helpers. This version is local until explicitly published.

## Continuous snake material and mouth intake (v1.02.05.00)

The approved bite-study artwork is integrated into the live renderer for all
five native snake palettes. A prepared, padded texture from each original body
sprite now spans the body and smoothly tapered tail with a single silhouette
mask. Only the contour rows are conditioned; the central body artwork retains
its native pixels and travelling material phase. Tail roots have continuous
width and slope. The nape adjustment is limited to the body side of the original
wavy boundary, with a protected margin: all head pixels beyond it and all head
alpha values remain unchanged across the 97 mouth poses. No source PNG is edited.

During horizontal ingestion, the whole tail segment makes the accepted late,
small bend toward the mouth; its root stays attached to the route. A prepared
19-pose aperture mask lets the tail continue inside right/down/left-facing mouths
without painting over lips or teeth. Player movement and controller tilt remain
native. Up-facing players retain the existing back-view mouth animation. Masks
are shared across character palettes, with no frame-time canvas allocation or
pixel readback.

This integrates onto the existing v1.02.04.00 neon work, retaining its aggression
schedule and lighting settings. Prepared surfaces are replayed consistently into
the visible image, actor mask and emission layer. Only immutable textures are
cached for emission; the moving ribbon surface is not. Native cell contacts,
scores, movement/reverse paths, bite clocks and effects are unchanged. The
continuous-contact experiment is still opt-in, not enabled by this integration.

Regression checks include `test-snake-material-integration.mjs` (with a checked-in
v1.02.04.00 renderer baseline), `test-snake-mouth-intake.mjs`,
`test-neon-prepared-surface.mjs`, and the existing live-snake, mouth, consumption,
reverse-tail, native-handler, neon and render-recovery suites. They cover protected
head pixels, all palettes, negative world translations, mask occlusion, route and
clock equivalence, and restoration of the caller's canvas transform after an
intentional drawing failure. These are correctness checks, not a low-end-PC
performance benchmark. This version is local until explicitly published.

## Route-preserving consumption (v1.02.03.00)

An active bite or fragment birth no longer bypasses the established route-window
continuity test at the next movement commit. The old unconditional fallback
morphed the surviving body sideways between material curves while it shortened.
The same position/tangent checks now select the valid rail during consumption,
retaining the local prefix join for a genuinely changed leading-tail corner.
The bounded route history includes still-visible consumed material until it
finishes shrinking, so rapid bites cannot discard an incoming tail bend early.
Split fragments inherit this history. During the final 2-to-1 transition, any
still-visible consumed tail retains its captured shape attached to the same
rigid head; a new native step no longer straightens that remnant instantly.
Independent 95 ms bite clocks, native movement, contacts, scores, effects, and
ordinary uneaten motion are unchanged. `tools/test-consumption-rail.mjs` exercises
native bites interleaved with forward/reverse steps and checks the established
world-space rail rather than only endpoint continuity.

## Native consumption continuity (v1.02.02.00)

All active native-grid consumption handlers capture and dispatch the accepted
visual transitions before removing logical ownership. Scoring, effects, contact
rules and movement clocks are unchanged. Regression coverage now exercises the
real handlers with the presentation facade, not only isolated visual calls.

Locomotion holds no longer freeze tail trimming or fragment birth. Repeated
tail bites retain their independent 95 ms material-removal curves from the
current pose, eliminating the old future-sampled contact-frame jump. Captured
compression remains consistent through newborn steps and tail shortening.
The final head shrinks uniformly into the moving mouth and turns toward it;
the accepted scorpion front/tail and mid-turn swallow remains in use.
The level-complete dark plate waits for the last consumption visual to finish;
level completion, score and the next-level deadline still commit immediately.

Run `tools/test-native-consumption.mjs` and `tools/test-live-consumption.mjs`
alongside existing movement, art and contact regressions. Browser fixtures are
available only on localhost with `?contactQA=1`; `consumptionSetup(kind, color)`
and `consumptionBite()` invoke actual native handlers for tail, held-tail, split,
head, last-head, scorpion-front, scorpion-tail and scorpion-turn review.

## Solitary-head blocked-route retry (v1.02.01.00)

The earlier three-static-wall escape was too narrow: a player, egg or other
inhabitant could block retreat forever even with an empty cell ahead. When
the chosen reverse move is unavailable, the head now advances one safe cell
along its unchanged facing. There is no three-wall or prior-backstep gate on
this zero-rotation mode change. Legal retreat remains preferred, and the
existing lateral-junction rule is retained.

Blocked heads keep checking at native movement intervals in either mode; if
neither direction is usable, they wait without entering occupied cells or
spinning on the spot. Invalid or mouth-facing trail entries cannot cause a
backward teleport or 180-degree inversion; they are discarded before retrying
legal adjacent cells. If the remembered retreat and front are both blocked,
another safe rear/perpendicular reverse step is still attempted.
The visual bridge retains native
forward/reverse timing, and longer snakes and collision authority are unchanged.

The solo-wall suite covers changing front/rear occupants, genuine last-tail
births, invalid trail data, both initial travel modes and repeated movement
after release. Counts and historical rules in the sections below describe
their respective earlier versions, not the current blocked-route policy.

## Solitary-head rear-wall recovery (v1.02.00.00)

The v99 junction-only recovery stranded a head after backing into a dead end,
even though its mouth already faced the free exit. The new narrow exception
requires a completed backstep and static walls in all three non-facing
directions. It advances one cell into the empty facing exit with exactly the
same direction, clears retreat mode and retains bounded movement history.
This is a change of travel sense, not an in-place 180-degree rotation.

Players, snakes, scorpions, hunters and eggs do not count as walls for this
rule. An occupied front exit, stale non-adjacent trail or zero backsteps keeps
the head waiting. Forward motion uses the existing 218ms presentation and
native cadence. Other turn rules, longer snakes, artwork and contact authority
are unchanged. The solo-wall regression now continues after rear-wall arrival
and checks recovery, occupied-exit release and repeated movement cycles.

## Solitary-head retreat (v1.01.99.00)

A reversing solitary head cannot turn around in place or resume forward inside
a tunnel. It must first take a backward step, then reach a genuine junction
with at least three open exits and choose an empty lateral passage. An allowed
forward resumption immediately moves into that passage; player proximity does
not permit a stationary attack turn. Blocked retreats preserve facing and mode.

Eating the last tail now seeds the solitary head's history with the actual
removed adjacent cell and preserves any existing retreat. Previously a former
multi-cell snake could have no usable solitary history and remain stuck. Once
the player clears the route, retreat can continue through legal rear or lateral
cells even after remembered history runs out. Stale, nonadjacent history cannot
jump the head over a wall. Predictive rendering follows these same constraints.

The rigid head rotates about its center, not an orbiting nape pivot. Interrupted
perpendicular moves pass through the old cell center rather than cutting the
corner. Forward branch exits use the native 218ms visual interval, not the old
436ms retreat interval. Head size, longer-snake motion and default native grid
contacts remain unchanged; continuous sprite contacts are still opt-in only.

`test-live-snake-solo-center.mjs` checks 7,236 curve frames, 3,618 live frames
and 800 post-bite frames. `test-live-snake-solo-wall.mjs` checks 144 native
fixtures / 552 movement ticks, blocked-route release, final-tail births,
side-exit timing and predictor consistency. Actual-art checks found no sampled
colored-pipe overlap on the reviewed routes. Tiny atlas-edge fringes can extend
beyond a logical cell; this is not a pixel-perfect collision guarantee.

## Two-cell reverse tail (v1.01.98.00)

For a two-cell snake, the v97 new-corner bend could lie outside its painted
tail, leaving a rigidly rotating dart. New reverse corners now add a bounded,
unit-speed circular flex only within that visible tail. Its base and tangent
stay attached; a smooth envelope reaches 25.2 degrees and returns to zero at
both native step endpoints. The head, physical arc length, movement impulses,
native timings and contact rules are unchanged. Longer snakes and forward
motion do not use this addition. Captures preserve the actual bent pose.

`tools/test-live-snake-visible-tail.mjs` covers 16 native turns / 6,416 frames,
monotonic heading, size, endpoint and interrupted continuity, frozen poses,
progressive bites and split captures. Actual-art comparison across five
palettes found all 105 forward control frames byte-identical to v97.
The existing future-start bite scheduling micro-gap (up to 0.194 world pixels
in this fixture) remains separate and is not claimed fixed by this change.

## Reverse movement (v1.01.97.00)

The v96 reverse animation still interpolated material positions between whole
body shapes. This could bow an established staircase by 7.50 reference pixels,
even while endpoint continuity and no-fold checks passed.

Reverse motion now uses the same fixed rounded rail as forward motion, with
three retained head-side historical cells. When the native simulator chooses
a new tail exit, only the leading prefix before the first unchanged outgoing
tangent adapts. Completed native turns grow an analytic radius-18 arc; an
interrupted local turn interpolates its heading field instead of dragging
the body across a corner. Two-cell snakes use the unchanged continuation
rather than the nape to identify that boundary. Head size remains rigid.

Captured poses have detached numeric prefix snapshots: an earlier seek cannot
alter a later bite or split, and repeated interrupted turns do not retain an
unbounded chain of old curves. The accepted head-first gather / later tail
push and traveling body markings are unchanged. Forward 218ms / reverse 436ms
native intervals, AI decisions and cell-based contacts are unchanged; no
one-cell visual lag or extra movement decision is introduced.

The new reverse-quality suite checks the occupied rail, tangent, radius,
local material span, head attachment and frozen captures. The reverse-rail
suite covers two/seven-cell repeated corners with zero whole-body fallback
and 8,000 interrupted captures with a bounded-memory regression. The rhythm
suite independently compares the bundled accepted study's pulse law against
all five live palettes. Existing gameplay and presentation suites still apply.

Interrupted mode changes can temporarily differ from the next target rail
while preserving their previous visible pose; forced target alignment would
teleport them. The stress fixture measures up to 5.341 reference pixels of
that difference and still requires continuity, rigid size and no folding.
This is not a guarantee that every interrupted pose is exactly on the newly
selected route. The study's long scripted wall-leg easing envelope is not
substituted for the native per-cell scheduler.

## Architecture

```text
maze-biters/
├── index.html                       # Entry document, script order, API configuration
├── styles/game.css                  # Viewport, canvas layout and accessible controls
├── src/
│   ├── config/
│   │   ├── render-atlas.js           # Sprite metadata, palettes and atlas references
│   │   └── audio-assets.js           # Sound-effect identifiers and asset paths
│   ├── engine/game.js               # Game state, movement, AI, collisions, UI and tutorial
│   ├── render/
│   │   ├── dusk-lighting.js          # Shared gameplay/tutorial flashlight renderer
│   │   └── menu-lighting.js          # Interface ambient light and focus effects
│   └── services/high-score-service.js
├── assets/
│   ├── art/title/{fallback,hd,4k}/
│   ├── atlases/{shared,hd,4k,metadata}/
│   └── audio/{sfx,music}/
├── docs/
│   ├── TECHNICAL.md
│   └── images/                      # Actual game screenshots; not runtime assets
├── tools/                           # Local launchers and dependency-free checks
└── .github/workflows/validate.yml
```

This is a static, plain-JavaScript Canvas 2D application. No bundler, package
installation or runtime framework is required. The HTML loads scripts in order;
it is not an all-in-one embedded-asset release. Much of the engine still lives
in one file: the directory split is not a claim of a fully modular engine.

The world has 36×25 cells at 16 logical pixels each: 576×400, plus a 32-pixel
logical HUD. Game speed advances a shared clock used by mechanics and effects;
presentation timing has its own real-time uses, such as menu transitions.

## Rendering and performance

| Property | HD | 4K |
| --- | --- | --- |
| Total backing, including HUD | 1440×1080 | 2880×2160 |
| Maze output | 1440×1000 | 2880×2000 |
| Static maze cache | 2880×2000 | 2880×2000 |
| Source tile cells | 80 px | 160 px |
| Presented cells at 1× / 2× | 40 / 80 px | 80 / 160 px |

The 4:3 presentation fits the viewport. The 4K label refers to the profile
intended for a 2160-pixel-high display, not a 3840-pixel-wide game canvas.

HD is the default. Higher-resolution atlases and title art load on demand.
HD maze artwork is first cached at its native 80-pixel cell scale, retaining
detail before the camera samples the visible view. Camera zoom never loads a
different sprite family halfway through a transition.

Important reusable resources include:

- 104 isolated moving-snake cells, prepared to prevent neighbouring atlas
  pixels from entering fractional-zoom samples.
- Static maze, HUD, bitmap-font and interface caches.
- Cached leader variants for the seven frames of each player skin, combining
  silhouette contour and Charged Core.
- A prebuilt trailing-spark animation, bounded consumption-effect pools and
  per-player phosphor sample buffers.
- Rounded normal/selected button artwork prepared at the active quality.
- A shared full-size interface backdrop cache, keyed for menu, scores, name
  entry and tutorial, rather than four permanently duplicated full-size backgrounds.

DUSK shares two light textures between gameplay and tutorial. Each keeps a
fixed mask: 576×400 for gameplay and 384×128 for training. Mask input comparisons
reuse unchanged results; moving lights or a changing camera still update the
mask. The base darkness is 80%, the halo radius 2.8 cells and forward reach
9 cells. Full Power Mode expands the halo by 30% and beam reach by 45%.
This is soft, non-occluding arcade lighting: walls do not cast shadows.

The camera measures rendered movement, not just held input. Solo/last-survivor
movement opens the view; multiple participants retain shared framing and
independent motion sampling. Opposing players do not cancel each other's
movement requests. Death, respawn and hidden-tab transitions reset or preserve
the appropriate motion state without modifying game collision coordinates.

The renderer targets 120 Hz but remains limited by browser scheduling, display
refresh and device performance. Cached work and automated timing checks are
not a guarantee of smooth 120 fps on every GPU. Fractional sampling can still
soften fine art; this is distinct from atlas-edge bleeding.

## Training simulation

The seven tutorial pages contain thirteen isolated, scripted simulations.
They share production movement, collision, splitting and rendering helpers,
but never mutate the active run or its leaderboard.

Playback runs at 0.72×, with a 900 ms reading lead-in, 650 ms outcome hold and
220 ms eased boundary fades. The game clock is held during presentation pauses.
The instructional keycaps remain visible above actors and DUSK, blinking on
real time. Four explicitly declared, bounded vertical exits allow demonstration
actors to leave the cropped stage; every other boundary remains protected.

Regression checks validate routes, interpolated geometry, head/tail direction,
fragment continuity, close ricochets, caption dwell, complete effects and
30/60/120 Hz outcomes. These examples demonstrate gameplay rules; they are not
an interactive practice arena where the learner controls the demo actor.

## Audio

The asset set contains 24 WAV sound effects and 20 MP3 music tracks.
Short effects are decoded once and reused by a bounded 32-voice Web Audio mixer.
Stereo positioning follows horizontal world location.

One shared streaming music player handles the menu, high-score session and
two nine-track gameplay shuffle bags. Level parity chooses Stillness or Orbit.
The high-score session flag preserves its track across name entry and the
following leaderboard, ending only on return to the main menu.

Browsers may require a user gesture to unlock audio. Gamepad haptics are
capability-dependent; there is no promise of identical effects on every controller.

## Shared high-score API

**Not enabled by default:** the API meta value in `index.html` is empty.
The current public build uses `localStorage` under
`maze-biters.high-scores.v1`; music volume uses
`maze-biters:music-volume:v1`.

A deployed website can set:

```html
<meta name="maze-biters-high-score-api" content="/api/high-scores">
```

Alternatively set `globalThis.MAZE_BITERS_CONFIG.highScoreEndpoint` before the
service script loads. Prefer a same-origin endpoint. The current client uses
`credentials: 'same-origin'`; a cross-origin API needs appropriate CORS and
must not assume that cross-origin cookies will be sent.

| Request | Contract |
| --- | --- |
| GET | Appends `limit=25`; expects a JSON array or `{ "scores": [...] }` |
| POST | Sends one score record as JSON; accepts the same leaderboard response shapes |

Example payload, for illustration only:

```json
{
  "id": "example-run-record-id",
  "name": "NEONBITE",
  "score": 12500,
  "level": 5,
  "mode": 1,
  "modeLabel": "SOLO",
  "difficulty": "MEDIUM",
  "speed": "MEDIUM",
  "multiplier": 1,
  "playerIds": [1],
  "createdAt": "2026-09-06T12:00:00.000Z"
}
```

Persisted mode IDs are **not** menu shortcuts: 1 Solo, 2 Duo VS, 3 Solo VS AI,
4 Duo VS AI, 5 Duo Co-op. AI Only has no eligible record. Preserve this mapping
when building the backend or migrating older records.

The service normalizes names to at most ten supported characters, rejects
empty/nonpositive records, deduplicates by ID and keeps the best 25. Equal
scores sort by earlier creation timestamp, then ID. A new score must strictly
beat the cutoff if the table is full.

On a failed POST, the client keeps a local record with `pendingRemote`.
**There is no automatic POST retry worker**; do not promise eventual upload.
That local-only field is omitted from outgoing JSON. GET refresh retains local
pending records alongside fetched scores.

This adapter is not a backend or anti-cheat system. Before operating a shared
competitive leaderboard, implement server-side validation, appropriate
submission/session controls, rate limits, duplicate protection, moderation and
storage/backup policy. Never trust a client-supplied score merely because the
client accepted it. Level-jump testing currently remains score-eligible.

A new domain has a separate local-storage origin: moving the game does not
automatically transfer users' existing browser records.

## Validation

Use Node.js; the checks do not require npm dependencies.

```sh
node tools/verify-project.mjs
node tools/test-game-modes.mjs
node tools/test-music-settings.mjs
node tools/test-menu-lighting.mjs
node tools/test-dusk-lighting.mjs
node tools/test-solo-camera.mjs
node tools/test-snake-tail-motion.mjs
node tools/test-tutorial.mjs
node tools/test-render-cache-lifecycle.mjs
node tools/test-render-recovery.mjs
```

| Check | Main coverage |
| --- | --- |
| Project verifier | Syntax, local assets, script/version agreement, high-score service |
| Game modes | Six rosters, Co-op safety, competitive contact, stored-mode compatibility |
| Music | Volume, persistence, transitions, shared player and sound-effect isolation |
| Menu lighting | Rounded UI, ten-slot input, layout, light caches and title presentation |
| DUSK | Power/death lighting, mask reuse, state restoration and allocation behaviour |
| Camera | Solo/shared motion, lone survivors, respawns and transition safety |
| Snake motion | Forward/reverse tail timing, corners and render purity |
| Tutorial | Geometry, native rules, timing, replay isolation and complete outcomes |
| Cache lifecycle | Image-wait deadlines, stale HD/4K jobs, isolated-sprite release, sprite recovery and lazy artwork |
| Render recovery | Lost canvas surfaces, fallback walls, late textures, restored transforms and menu-buffer lifecycle |

The repository's Validate workflow runs these ten commands on pushes and
pull requests. They are regression checks, not a substitute for testing actual
browsers, mobile hardware, controllers and display refresh rates.

Runtime diagnostics are available in the browser console through
`__mazeBitersRenderDiagnostics()`, `__mazeBitersCameraDiagnostics()`,
`__mazeBitersLightingDiagnostics()`, `__mazeBitersMenuLightingDiagnostics()`,
`__mazeBitersTutorialDiagnostics()`, `__mazeBitersAudioDiagnostics()` and
`__mazeBitersHighScoreDiagnostics()`.

### v1.01.94.00 — low-memory rendering and recovery

This release keeps Canvas 2D, the existing HD/4K artwork, DUSK lighting, camera,
120 Hz presentation ceiling and gameplay timing. It does not replace the renderer
or change game rules to hide performance problems.

- Failed or delayed maze images now draw real fallback walls. The fallback is
  cached once; each change in the readiness of the few unique maze images causes
  one rebuild, not a full 2880×2000 maze repaint on every frame. Tutorial and menu
  backdrops follow the same late-image recovery contract.
- Canvas context loss invalidates retained pixel caches. Restored surfaces reset
  their drawing state and rebuild once. During loss of the offscreen world cache,
  primitive walls preserve navigable corridors; loss of the visible canvas
  freezes the simulation clock until it can be presented again. DUSK masks,
  light textures, title surfaces, snake isolation and leader artwork recover too.
  No per-frame `getImageData`/GPU readback was added.
- Hidden menu, wordmark, button and tutorial surfaces release their pixel storage
  when gameplay begins and rebuild on return. Objects are reused. The diagnostics
  report the released RGBA byte estimate, not measured driver/GPU memory. Opening
  the tutorial before play increases the amount released.
- Native title portraits used only by the legacy terminal branch load on demand.
  Normal DUSK screens do not decode them. Identical HD/4K world-cache dimensions
  are not repeatedly reallocated.
- Cache preparation uses generation tokens: obsolete jobs cannot build or publish
  after HD→4K→HD changes. Retired isolated sprite canvases explicitly drop their
  storage. Image waits now use the intended 3000 ms deadline (rather than the
  array index accidentally passed as a timeout), remove listeners on settlement,
  and skip decoding missing/failed images.

Append `?diagnostics=1` to the game URL for a collapsible, read-only status panel.
`averageFrameCostMs` measures JavaScript update/draw submission time, not total GPU
time; `measuredFps` counts rendered callbacks, not verified monitor presentation.
`mazeLayerPaintCount` should remain steady within a level after assets load.
`menuSurfacesReleased` should be true during play and false in menu screens.
Lighting allocations should remain stable after warm-up.

On localhost only, the panel also offers **Simulate cleared maze cache**. This
clears its pixels and emits loss/restoration events to test the recovery path.
It is a fault-injection check, not a real driver-reset or GPU-memory stress test.

Weak-PC acceptance test: use HD, play multiple levels and modes, visit all tutorial
pages, switch HD/4K/HD, return to menus repeatedly and run for at least 15 minutes.
Record the panel when a problem appears, plus browser version and GPU. CPU
throttling in development is useful but does not emulate a weak GPU, limited
graphics memory or a specific driver. The earlier black-maze report is consistent
with lost cache pixels or incomplete assets; its exact hardware cause remains
unconfirmed without diagnostics from the affected PC.

## Isolated snake-turn presentation study

Open `/experiments/snake-turns/` on the local game server. The default game does
not import the experiment or change its movement/rendering rules. A guarded
engine adapter exposes the production sprite renderer and movement-history
functions, then returns before menu/game-loop startup. Study keyboard input is
isolated from the hidden game controls; there is no score service in this page.

The two panels share one prescribed grid path and game clock. Four forward/reverse
routes, 1/2/5-cell bodies, four rotations, playback speed, pause, phase scrubbing
and a next-turn control allow deterministic comparison. The experimental renderer
rotates moving ends locally and trims the adjacent corner without alpha blending.
All non-turn frames delegate to the original renderer, and its reverse-neck crop
is retained during nearby transitions. Shared framing is presentation-only.

This is an art/motion experiment, not a new release or live-game feature. Some
directional head drawings are mirrored views rather than exact rotations: the
nearest-view switch can still change their artwork at the midpoint. Position and
angle continuity tests do not establish pixel continuity at that switch. Dedicated
intermediate art would be needed to remove it completely. Bite, shortening,
collision alignment and game-over integration remain future acceptance work
before any production rollout. No weak-PC performance improvement is claimed.

Run `node tools/test-snake-turn-study.mjs` for deterministic pose/renderer, boundary,
straight-render delegation, UI next-turn and keyboard-isolation checks. These
complement, rather than replace, visual review of the actual sprite silhouettes.

## Hosting and releases

Serve the entire repository over HTTP/HTTPS with relative asset paths intact.
GitHub Pages currently publishes **main → / (root)** at
[the public game URL](https://tcherkin.github.io/maze-biters/).
No application build step or server-side database is included.

For a game release, keep the version in the HTML title and engine header
consistent with the release-query URLs of the engine, both lighting modules and score
service scripts. The project verifier checks this contract. Documentation-only
updates do not require increasing the game version.

For a future dedicated domain, configure and verify its DNS/HTTPS separately;
deploy the leaderboard API before enabling its client setting. The newer game
belongs to `tcherkin/maze-biters`. The separate
`tcherkin/hyper-viper-remastered` repository preserves v0.99.49.64 and should not
receive this game's runtime releases.
