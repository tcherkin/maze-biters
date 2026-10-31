# Maze Biters — iPad Web

An independent Unity WebGL2 edition based on the iPad version of Maze Biters.

Current behavior revision: `20261031-escape-topology`.
Camera revision: `20261031-exit-camera`.

LEVEL CLEARED and GAME OVER now zoom out across their complete presentation,
with a faster start and a gentle finish. The last overview frame is presented
just before switching. A delayed next-level cache retains a moving camera tail
and finishes on a blink boundary once ready. Gameplay and artwork are unchanged.

The BRUTAL ally now recognizes long blind branches before fleeing into them.
It prefers a safe open route, including a temporary approach toward a pursuer
when that is the way to a real bypass. Bridges between loops remain valid
escape routes; forced last-chance movement and safe feeding are preserved.
The runtime AI files match the validated native iPad correction. The build
runs 181 dedicated escape checks as well as the existing difficulty audits.

Enemy biters hold a coherent mischief, pursuit or roaming intention for 2–4
gameplay seconds. Base mischief/pursuit weights by difficulty are 5/2.5%,
16/10%, 34/26%, 47/37%, and 54/44%; individual temperament and group roles
slightly vary these weights. They are selection weights, not guaranteed action
rates. Mischief requires a reachable interior cut that creates two nonempty
snakes; without that opportunity, the hunter roams instead of rerolling pursuit.
Incidental straight crossings remain possible even on PICNIC.

Eating a scorpion triggers personal revenge only in already-hatched biters.
For the first three gameplay seconds, this sharply suppresses deliberate
mischief and prioritizes the actual eater. Revenge then smoothly fades to zero
at 35 seconds. A dead, protected or unreachable eater does not transfer the
increased aggression to another player. Eggs inherit no memory; a hatchling
can witness a later event. Pause freezes this clock and game speed scales it.
The existing level-time difficulty progression also scales the new intentions.

Enemy biters can cross
an interior snake segment, leaving the normal impact gap and two fragments.
They use the existing split animation and sound, without player points, feeding
or bonuses. Deliberate cutting increases with effective difficulty; an enemy
also keeps its current route across a body,
even during the cooldown for planning another deliberate cut. Moving snake
heads can eat enemy biters using `HeadEat`. A biter moving toward a snake head
ricochets instead; reversals are reserved for ricochets and dead ends.
Personal offender memory survives splits. Player AI forecasts account for
possible incidental body crossings without additional search states.

Every difficulty uses
predictive route safety from the start, with shorter horizons and fewer branches
on easy settings. Initial PICNIC/EASY/MEDIUM/HARD/BRUTAL horizons are
450/700/1100/1750/2400 gameplay milliseconds, evaluating 2/3/5/7/10 own moves.
The shared effective intensity smoothly increases these budgets after the first
gameplay minute, reaching the existing full BRUTAL planner at five minutes.
New terminal search layers fade into the risk assessment instead of switching
the whole predictive planner on at the maximum tier. BRUTAL remains unchanged.
Forecasts cover exit interception, protection expiry, rival priority, imminent
hatching and new heads after cutting. They model possible actions, not future
enemy decisions. Appetite and aggression remain governed by their existing
independent policies; casual safe eating on PICNIC/EASY remains available.
Scoring, visuals, animations, PC, iPhone and the original browser are unchanged.

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


### LEVEL CLEARED — 20261031-clear-celebration

Hunters and the scorpion keep moving with the original animation and lighting renderers during LEVEL CLEARED, including an extended preparation wait. This is a separate presentation snapshot: players, scores, drops, hatching and the future-level random stream remain unchanged. Nearby hunters choose an outward route or ricochet at a blocked passage. Fruit pulses continue; egg crack stages stay fixed. The existing exit-camera pacing and cache adoption are preserved.


### Shared notice backdrops — 20261031-message-panels
GAME OVER, LEVEL CLEARED and PAUSE share a procedural translucent rounded backdrop with soft edges. Menu preparation/errors, coming-soon and record statuses use the same component. Existing glyphs, reveal/blink timing and world state stay unchanged. The panel adapts to future longer captions without stretching. Native HD/4K visual and menu/record smoke tests passed; no new blur textures or asset packs. PC, iPhone and original JS browser versions remain separate.
