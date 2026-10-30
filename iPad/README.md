# Maze Biters — iPad Web

An independent Unity WebGL2 edition based on the iPad version of Maze Biters.

Current behavior revision: `20261030-casual-heads`. PICNIC and EASY AI accept
safe adjacent lone snake heads while strolling, just as they accept tails,
without needing a preceding meal. The same-snake completion priority remains.
Normal contact checks reject head-on eating unless power or spawn protection
permits it, and nearby threats still take precedence. This adds neither distant
head pursuit nor reversing solely for a casual snack. MEDIUM and higher behavior,
scoring, human aggression and the shared timed escalation remain unchanged.

[Play iPad Web](https://tcherkin.github.io/maze-biters/iPad/) ·
[Original browser game](https://tcherkin.github.io/maze-biters/)

Use landscape orientation. Touch and drag to steer the first player; menus accept
touch input. A keyboard or compatible controller can also be used. Arrow keys or
WASD move, Enter confirms a menu choice, P pauses, and Escape returns to the menu.
The second local player needs their own keyboard controls or a controller.

The HD option renders at 1376 × 1032. The high-resolution option uses the original
high-quality artwork at 2752 × 2064. Both are fitted to the available browser area
without stretching characters. This is a browser build, separate from the native
iPad app and the original PC/browser releases.

The first visit downloads the Unity runtime and artwork. The menu and gameplay
resources are separate; selecting a mode while preparation is running keeps its
confirmation blinking until the level is ready. Browsers require a first touch or
click to allow sound. Saved scores and settings belong to this browser/device.

Browser, GPU and available memory affect performance. Testing in a desktop browser
at iPad resolution does not certify performance on an actual iPad or Mobile Safari.

## Source and rebuilding

Download [the Unity source archive](Source/maze-biters-ipad-web-source.zip).
It contains the isolated project, scripts, shaders, original audio sources and
build tools. The runtime artwork is stored losslessly in the published
`StreamingAssets/WebPayload` packs instead of duplicated in the source ZIP.

Extract the archive, keep the `platforms/ipad-web` layout, then run its
`restore-source-assets.py` against this release's `StreamingAssets/WebPayload` directory.
The script verifies pack and individual-file SHA256 hashes before restoring
the source files. Build instructions are included in the archive.

The original browser game at the repository root is unchanged by this edition.

## Current difficulty policy — 30 October 2026

Behavior revision: `20261030-time-escalation`.

The selected difficulty sets the starting behavior. Every level has a shared
60-second grace period without extra pressure from elapsed time. From 60 to
300 seconds, the pressure rises smoothly: gently at first, then more quickly.
Starting from PICNIC, behavior is approximately MEDIUM at 180 seconds, HARD at
240 seconds, and reaches BRUTAL at 300 seconds. Higher starting settings also
move toward BRUTAL. These times describe a continuous curve, not sudden jumps.

All computer-controlled creatures share the same level clock, while keeping
their individual roles. Movement-speed escalation uses that clock as well.
A new level or new game resets it; a player's death or respawn does not.
These are simulation seconds, scaled by the selected game speed; loading and
pausing do not advance the clock.
Scoring rules and the multiplier for the selected difficulty are unchanged.
The native iPad project and this web edition use the same policy.

## Earlier foundation — 29 October 2026

The preceding update introduced the revised behavior used as the starting
point. PICNIC snakes favour intelligent evasion, with rare retaliation after
being bitten. The AI player mostly wanders, occasionally eats and only rarely
pursues a human. EASY, MEDIUM and HARD progressively improve awareness,
planning and aggression; BRUTAL removes deliberate movement errors and forced
roaming breaks. That update bounded the growth from elapsed time; the current
30 October policy above replaces that limit with gradual escalation to BRUTAL.

The update keeps the existing artwork, animations, effects, touch controls and
web loading system. The PC, iPhone and original browser editions are separate.
