# Technical guide

[Game guide](../README.md) · [Ръководство на български](../README.bg.md)

This document describes the checked-in **v1.01.93.00** implementation.
It separates current behaviour from future website plans. No game code or
game version is changed by this documentation update.

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

The repository's Validate workflow runs these eight commands on pushes and
pull requests. They are regression checks, not a substitute for testing actual
browsers, mobile hardware, controllers and display refresh rates.

Runtime diagnostics are available in the browser console through
`__mazeBitersRenderDiagnostics()`, `__mazeBitersCameraDiagnostics()`,
`__mazeBitersLightingDiagnostics()`, `__mazeBitersMenuLightingDiagnostics()`,
`__mazeBitersTutorialDiagnostics()`, `__mazeBitersAudioDiagnostics()` and
`__mazeBitersHighScoreDiagnostics()`.

## Hosting and releases

Serve the entire repository over HTTP/HTTPS with relative asset paths intact.
GitHub Pages currently publishes **main → / (root)** at
[the public game URL](https://tcherkin.github.io/maze-biters/).
No application build step or server-side database is included.

For a game release, keep the version in the HTML title and engine header
consistent with the release-query URLs of the engine, menu-lighting and score
service scripts. The project verifier checks this contract. Documentation-only
updates do not require increasing the game version.

For a future dedicated domain, configure and verify its DNS/HTTPS separately;
deploy the leaderboard API before enabling its client setting. The newer game
belongs to `tcherkin/maze-biters`. The separate
`tcherkin/hyper-viper-remastered` repository preserves v0.99.49.64 and should not
receive this game's runtime releases.
