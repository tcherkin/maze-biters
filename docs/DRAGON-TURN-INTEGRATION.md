# Approved Dragon Kin turns — 1.02.15.02

Integrated 2026-10-16 at the user's request, from the final approved Dragon Kin restart experiment.

## Scope

- The hunter branch of `src/render/fantasy-player-turn.js` now uses the six production-owned modules in `src/render/dragon-turn/`.
- These preserve the approved renderer, face cage, cylindrical crown, clean-cap reconstruction, and individually registered cheek-scale/ear trajectories. Right-to-up carries the visible pair rightward across the head; the opposite pair is revealed late. Left-to-up mirrors this motion.
- No runtime dependency on the experiment, its server, or localhost URLs is introduced.
- The previous `src/render/dragon-kin-turn.js` is retained as a reference for its existing regression tests, but is not the active hunter rig.

## Preserved behavior

- Enemy palettes h1, h3 and h4 only, always normal artwork; no aggression recoloring.
- Existing native HD 80px / 4K 160px source assets, approved width, 49 mouth frames and 25 blink frames.
- Existing routing and 90ms total duration for both quarter and half turns.
- Protagonist renderer, mouth, blinking and turning are unchanged.
- No movement, collision, AI, scoring, shield, contact or spawn logic changes in this integration. The initial integration changed only the engine version/comment and diagnostics label; 1.02.15.03 additionally forwards the existing physical-contact feature flag to character-cache preparation.

## Source preparation and lifecycle

The hunter source is composed once on an ordinary native-size 2D canvas before staging it into the turn renderer's readback canvas. This mirrors the approved experiment and avoids CPU/GPU Canvas edge-rounding differences. It adds one 80px or 160px source surface to the hunter service only, released on replacement, cancellation, failure and disposal. The protagonist path is unchanged.

The hidden-cap cache is bounded to 64 entries. In the original 1.02.15.02 integration, preparation warmed native mouth frames 0, 12–19 and 48: 39 CPU cap entries. The 1.02.15.03 cache revision below replaces that storage. Unwarmed intermediate rear-facing bite frames can still require a synchronous cap build. Existing optional WebGL fallback/reprepare behavior is preserved.

## Pixel-preserving renderer optimization — 1.02.15.03

Both turn renderers reuse the already-uploaded mesh when its exact immutable geometry is unchanged. Dragon front turns no longer build hidden rear-cap material; complete transparent placeholders keep their unused samplers valid. Preparation now warms 36 useful caps: 30 rear poses and six fixed side poses, with no unused down-facing caps.

Dragon caps use a bounded 64-entry native GPU texture LRU instead of retaining 64 CPU RGBA arrays and repeatedly uploading them. A hit only binds the existing texture. A miss keeps the approved ImageData-to-Canvas upload path, including its byte rounding. Eviction safely detaches bound textures before deleting them; disposal releases the entire cache. Warm cached texture payload is 921,600 bytes in HD / 3,686,400 bytes in 4K; the 64-entry maximum is 1,638,400 / 6,553,600 bytes. `cleanCapBytes` now reports zero retained CPU cache bytes, while `cleanCapTextureBytes` reports the GPU payload separately. These figures exclude fixed scratch canvases, other textures, driver overhead and the rest of the game.

The approved art, shaders, geometry, 90ms clocks, palette choices and gameplay are unchanged. Independent real-browser comparisons passed with identical HD/4K player and hunter pixels, including player intake masks and leader effects. `tools/test-turn-renderer-uploads.mjs` covers upload reuse, cache eviction, complete samplers and lifecycle; the approved-renderer source pin permits only exact reviewed orchestration changes. Performance conclusions require the separate measured benchmark; this note makes no device-wide FPS guarantee.

In native-grid mode, character preparation no longer constructs unused alpha-contact contours. Player leader and intake masks remain exact; hunters also skip the otherwise unused 49-pose preparation loop. The service API defaults to full preparation, and enabling the existing experimental physical-contact flag retains it. Per profile this avoids 1,372 unique contour objects and 588 hunter readbacks. `tools/test-character-contact-preparation.mjs` verifies native pixels, default behavior, readiness and lifecycle. Benchmark and memory evidence for this release lives in `outputs/character-animation-perf-20261016/` in the working task; reported character-resource ledgers are not total process RAM.

## Verification

All checks below passed on the integrated code:

- `tools/test-dragon-turn-restart.mjs`: exact approved source/geometry/shader parity; 196 cages, 31,948 triangle bounds, 9,898 material poses, 79,184 leaf mappings, 4,949 stencil cases, 392 masks, 72 cleaner cases, 1,800 native poses, 168 endpoint checks and 32 simulated-GL lifecycle checks.
- `qa/dragon-turn-browser.js`, real WebGL: per profile 1,728 direct frames, 1,620 adapter frames, 252 native endpoint checks and 10,786 checks; no adapter byte differences, healthy contexts, bounded cache and disposal.
- Independent comparison of the actual production adapter with the approved experiment: 756 frames per profile covering all three palettes, 12 routes and mouth/blink combinations. HD and 4K both had zero differing bytes or frames.
- Existing engine integration, fantasy turn integration/clock, Dragon Kin runtime, legacy rig and fantasy player integration suites passed. Whole-engine baseline recovery confirms no gameplay algorithm changes.
- Real game, naturally spawned enemies: HD recorded 92 hunter turn draws, 4K recorded 33; both used 90ms turns with healthy contexts and no animation errors. This is a functional smoke check, not a performance benchmark.

Evidence is saved in the working task's `outputs/dragon-smooth-integration-20261016/`. A pre-edit source backup is in `outputs/before-dragon-smooth-integration-20261016/`.

## Remaining visual limits

The accepted experiment's details are retained, not redesigned: extreme slow motion/zoom can expose a narrow far-eye or receding nose/tooth sliver, and small native-alpha versus procedural-edge differences near cardinal poses. Native endpoints remain exact. No claim of universal device performance or further artistic refinement is made by these regression checks.
