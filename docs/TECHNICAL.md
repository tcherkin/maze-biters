# Technical guide

[Game guide](../README.md) · [Ръководство на български](../README.bg.md)

This document describes the local **v1.02.03.00** implementation.
It separates current behaviour from future website plans. The
[animation stability notes](ANIMATION-STABILITY-v1.01.96.md)
describe the current presentation adapters, restored native cell-contact
authority and explicitly opt-in continuous-contact experiment.

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
