# Animation and contact integration — v1.01.95.00

[Game guide](../README.md) · [Ръководство на български](../README.bg.md) · [Technical guide](TECHNICAL.md)

The accepted snake, mouth and scorpion studies now follow live game events,
rather than the studies' demonstration routes. Movement decisions, native
rates and game rules remain in the engine; presentation adapters retain the
history needed to draw continuous motion.

## Visible behavior

- All five snake palettes share curved movement, a rigid attached head, gradual
  jaws, traveling markings, alternating impulses and reverse-tail motion.
  Retreat keeps its native 436ms step. Body art comes from the original palette
  atlas; the head and tail palettes use paired original colors.
- Tail bites and splits shorten the visible material progressively, including
  repeated bites and short fragments. Already consumed material stops being
  solid immediately; the remaining visual transition is not an extra target.
- Scorpions bend through live 90° corners and head-led U-turns at full size,
  with continuous leg frames. Eating captures the current whole pose and can
  continue an interrupted turn while the creature is absorbed into the mouth.
- Players, AI players and hunters use gradual mouths in every original palette
  and direction. Their normal movement, direction changes and controller tilt
  remain unchanged. Contact responses use the actual visible sub-cell position.
- Original sounds, particles, blooms, scores, damage, power behavior, lives,
  difficulty, item spawning, menus, lighting and camera effects remain active.

## Contact scope and accuracy

Actor contact is swept between frames against the animated player/hunter,
snake and scorpion shapes. A tail tip can be bitten while retreating; head
contact and ricochet are resolved at the visible contact rather than a shared
or neighboring occupied cell. Existing rule handlers still decide the result.

Fruit pickup, eggs, maze walls, route selection and occupied-cell AI decisions
retain their grid rules. The new pass is an actor-contact system, not a change
to the maze or every gameplay interaction.

Character contours are prepared from the alpha-32 silhouette; mouth and gait
frame changes are explicit sweep boundaries. At the native 16px tile size,
the mouth contour simplification budget is about 0.05 world pixels. Gameplay
resolves contact conservatively within 0.025 world pixels and rearms the same
pair after 0.05 pixels of separation. This explicit subpixel allowance avoids
tiny near-tangent gaps exhausting a conservative speed bound; it never skips
through a possible contact. The generic sweep kernel retains its separate
strict 0.001 world-pixel default. Curved body/tail strips
and simplified contours are geometric approximations, not exact equality to
every antialiased pixel or decorative glow. No runtime pixel readback is needed.

Exactly collinear contact strips are joined only within the same material
cell and taper region. Their union is unchanged, and curved strips keep the
original 1.25-pixel sample endpoints. Prepared actors declare every cached
frame boundary, so their sweeps do not need redundant 1ms fallback probes.

## Loading and recovery

`src/render/animation-loader.js` prepares the adapters before loading the
engine. Every reachable runtime JavaScript import uses the release query
`?v=1.01.95.00`, so cached releases do not mix. Files remain static browser
modules: no bundler or external runtime package is required for deployment.

The native renderer remains the guarded fallback when prepared art is
unavailable. Lost caches are rebuilt, and scene/level resets clear transient
animation and contact state. Simulated cache-loss tests are not a claim of
having reproduced a hardware driver failure.

If a contact sweep cannot safely finish, the engine pauses instead of
advancing through an unchecked interval. It retains the restart screen and
does not retry a continually growing interval every frame. Restart clears the
fault state. The bridge regression checks that one failed attempt remains one
attempt across 883 subsequent update ticks.

## Verification

The existing project, gameplay, tutorial, audio, lighting, camera and rendering
checks remain in CI. The new dependency-free Node checks are:

```text
node tools/test-animation-package.mjs
node tools/test-animation-integration.mjs
node tools/test-live-snake-retreat.mjs
node tools/test-live-mouth.mjs
node tools/test-live-scorpion.mjs
node tools/test-continuous-contact.mjs
node tools/test-contact-runtime.mjs
node tools/test-snake-contact-batching.mjs
node tools/test-contact-rules.mjs
node tools/test-contact-bridge.mjs
```

These check packaging and cache versions, retained controller/AI behavior,
native-fallback rule equivalence, continuous/reverse geometry, animation
lifecycle, swept contacts and their actual engine responses. Pixel-rendering
suites such as `test-live-snake.mjs`, `test-contact-shapes.mjs` and
`test-split-contact-gap.mjs` require the optional `@napi-rs/canvas` package
(or its directory in `CODEX_CANVAS_PACKAGE`) and are intentionally separate
from dependency-free CI. Browser playtesting remains necessary, especially
for crowded corners and slower devices.

The unmodified v1.01.94.00 engine used for differential tests is retained at
`tools/baseline/game-v1.01.94.00.js`, SHA-256
`D69A8DE2B51D712F2F404197B656D67E41A564070CD49005C8B758DB9BCB356B`.
It is test data, not a second runtime entry point.
