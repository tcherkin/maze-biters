# Maze Biters â€” iPad Web

An independent Unity WebGL2 edition based on the iPad version of Maze Biters.

Release: `20261108-speed-life-balance`.

Six independent movement/reward settings now use:
SNAIL .40 / x.50, SLOW .60 / x.75, MEDIUM .80 / x1.00,
FAST 1.00 / x1.25, TURBO 1.25 / x1.50, EXTREME 1.60 / x2.00.
Default MEDIUM uses the former SLOW movement; EXTREME movement is unchanged.
The first extra life is at 5000 x the speed reward multiplier; subsequent
lives arrive every 10000 x that multiplier. Difficulty still multiplies
points, not life thresholds. The nine-life cap and fractional scoring remain.
Competitive player knockouts, including AI and shield/power contacts, no longer
award points. Contact priority, death, respawn, sound and visual effects remain.
Combo and fruit movement boosts still stack independently; no timer was retuned.
Existing historical records retain their original metadata.


The native iPad population performance changes are now shared with WebGL:
exact unchanged snake geometry reuse, retained draw scratch arrays, and
allocation-free occupancy checks with the same decisions and traversal order.
Animation clocks, geometry samples, MSAA, shaders, textures, palettes, light
streams, glows, reflections, particles, combo rules and input are unchanged.
Native desktop measurements do not predict physical iPad/Safari performance.
No smaller artwork or reduced effect resolution is used.

Initial snakes continue increasing every two levels, limited by safe available
space, with no fixed 20-snake cap. Initial escape routes remain protected.
Temporary gameplay keyboard level selection: 01â€“99, 00 = 100; one digit and
Enter (or a 1.2 second pause) selects 1â€“9. Escape cancels pending digits.
Test level jumps use the prepared transition and exclude the session from records.

Independent two-finger swipe steering recognizes eight directions, without
on-screen cursors. In DUO CO-OP, DUO VS and DUO VS AI, touch-down on the left
half captures P1; the right half captures P2. Each finger retains its player
when crossing the midpoint. Lifting, cancellation or death affects only that
player. SOLO and SOLO VS AI keep whole-screen P1 control.
The same swipe gesture works while either or both fingers remain down.
It retains the original moving origin and dead zone, changes direction
while the finger stays down, and uses a small angular hysteresis at boundaries.
Diagonals hold two cardinal keys, using the same maze stepping and character
tilt as the keyboard/controller; they never move diagonally through corners.
Keyboard and controller input remain available. Orbit is retained in source
for a future touch option, but its input and renderer are not allocated.

Gameplay now uses the approved six-second ambient cycle (3 seconds each way),
sixteen travelling highlights inside the glass walls, and individually phased
pearly star glints both around the labyrinth and behind its transparent floor.
The visual clock freezes on pause, and future-scene GPU preparation restores
the current maze light graph. Existing artwork, aura, creature animations,
eye signals, reflections, intake effects, audio, controls and rules are retained.
No new artwork pack or full-screen render target is added.

Atmosphere rendering skips mathematically empty star cells and pixels outside
the existing star footprint. Wall light kernels run only within conservative
per-stream bounds; their original connected-cell logic and colors are retained.
Repeated unchanged clocks reuse route evaluations and global bindings; hidden
next-scene preparation invalidates bindings before restoring the active scene.
The original four travelling highlights retain their timing and routes. Four
additional accents run halfway between their phases on separate routes. The
eight-light version adds 480 bytes of numeric route data per cached maze over
the optimized four-light version, plus small array/object overhead. No extra
textures, targets or per-frame managed buffers are introduced.
Route geometry validation runs in build/editor audits rather than release loading.


Ten pickups now include cherries, green small-berry grapes, banana, pumpkin,
red pepper and eggplant alongside apple, pear, strawberry and watermelon.
Each awards 200 base points on MEDIUM at medium speed, using the existing
difficulty/speed coefficient. Snake combo multipliers never multiply fruit
points; fruit still grants independent Power and extends an active combo grace
period. Per-level shuffled bags use every type before repeating, favour absent
types and avoid identical neighbours when another choice is available. Blocked
drops do not consume a bag entry. The original appearance RNG budget is retained.
All ten use native 80/160 textures, original pulse/fade, emission and matching
floor/wall light. Egg frames and existing WebGL loading/lifecycle are unchanged.


Nine glass maze palettes now cycle in shuffled bags without repeats within a
bag, with at least four intervening levels before a colour returns. Amethyst,
rose quartz and moonstone join the original six. Eight snake palettes include
Cobalt, Ember and Pearl, with matching animation textures, neon, wall/floor
reflections and bite dust. Colour selection does not alter gameplay RNG.
Split fragments preserve the original curve during birth and subsequent bites.

Current behavior revision: `20261105-adaptive-ally`.
Camera revision: `20261031-exit-camera`.
Menu revision: `20261101-glass-records`.

SOLO VS AI and DUO VS AI now adapt the opponent's intelligence gradually.
The reference is the highest-scoring human with remaining lives, including
temporary death. A human lead above five displayed points moves AI toward
BRUTAL at one tier per 22/15/9 game seconds with 3+/2/1 AI lives. Catching up
removes the extra intelligence at the same rate toward ordinary level-age
difficulty. Learned intensity survives respawn and level changes; a new game
resets it. AI ONLY retains its existing time-based progression.

On chosen BRUTAL, a substantial AI lead allows a smooth relaxation of at most
1/0.65/0.35 tiers with 3+/2/1 lives. A small Maximum-policy hysteresis prevents
endpoint chatter. Pauses, loading, death and level-clear transitions do not
accumulate learning. Scoring, movement speed, powers and enemy profiles are
unchanged. Validation and real gameplay traces: native `Results/adaptive-ally/`.

Normal tails, transverse bodies, safe rear heads and scorpions remain edible
during spawn protection. The shield does not grant fruit attack power against
frontal heads or enemy humanoids; competitive player rules remain unchanged.
All imperfect AI tiers take safe nearby meals without becoming permanent
global hunters. They preserve local meal continuity and actual second-snake
combos; random decision errors cannot invent U-turns. BRUTAL also prioritizes
an established adjacent meal and evaluates safe crossings instead of rejecting
them merely because several heads are nearby. Immediate snake danger now
respects a conservative departure window, while the full future interception
and trap checks remain active. Distant player hunts no longer interrupt safe
ongoing meals or zero-detour forward bites; immediate rival contact and genuine
fleeing retain priority. Difficulty progression is unchanged.
Validation and simulated-session observations: native `Results/ally-opportunity/`.

Every generated maze now checks all three fixed starting cells for a genuine
local choice within six moves. Two independent routes must leave a ten-cell
Manhattan neighbourhood within the cyclic maze core; short blind spurs, pairs
of long blind branches and small single-gate loops do not qualify. New routes
join the same existing exterior component, forming a real bypass. A deterministic post-pass opens nearby walls only where needed,
preferring few changes and preserving symmetry and protected details. Distant
dead ends remain. Menu, restart and next-level caches use the same rule.
Safe snake placement, combat, AI, animations and rendering are unchanged.

Continuous snake eating activates COMBO X2 under the player's score/lives.
Each further distinct snake eaten without interruption doubles snake points
again (X4, X8, ...). Split descendants retain lineage. Combo speed stays at up
to X2 regardless of score tier. The rise is 500 gameplay ms. After feeding ends,
the label and boost remain for a 1000 ms grace period; then speed eases down
over 1500 ms. Eating fruit or a scorpion during grace renews the full second.
A new snake reached after a gap retains the tier; only an uninterrupted next
snake upgrades it. Fruit grants independent Power X2 speed, stacking up to X4,
without multiplying points. Combo grants no extra attack privileges or Power
lighting. Same-frame completion still shows a readable HUD cue. Death and new
levels reset the chain; pause freezes its simulation clock.

New mazes reserve a clear opening route for every living human and AI player.
Snakes keep the intended population and lengths, but start with a free first
step away from nearby players and forced passages leading to their starting
corridors. Hanging dead-end branches do not count as escape junctions.
Prepared menu modes and next-level previews use the same deterministic rules.
Spawn protection permits normal safe snake/scorpion meals but does not grant
frontal-head or enemy-humanoid attack power. Genuine fruit power permits those
attacks immediately. Competitive player
versus player priority and cooperative rules are unchanged.

The main menu now uses the approved symmetric ice-blue glass maze, champagne
lettering and button frames, moving stars, travelling light inside the walls,
a gentle zoom, and a rose/amethyst B with flowing shades and a subtle pulse.
SPEED smoothly adjusts the stars and travelling wall light. The original font,
button positions, input, six modes, score screen, audio and prepared-start
confirmation remain connected to the existing game. Shared wall atlases load
with the menu before the remaining gameplay resources.

High Scores and name entry now share the same animated ice-blue maze and stars,
with champagne headings, keyboard keys and navigation frames. The selected
SPEED and animation phase continue between screens; score storage, input and
typography geometry remain unchanged. Legacy record background and button
textures are no longer uploaded.


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

Enemy biters hold a coherent mischief, pursuit or roaming intention for 2â€“4
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

[Play iPad Web](https://tcherkin.github.io/maze-biters/iPad/) Â·
[Original browser game](https://tcherkin.github.io/maze-biters/)

Use landscape orientation. Touch and drag to steer the first player; menus accept
touch input. A keyboard or compatible controller can also be used. Arrow keys or
WASD move, Enter confirms a menu choice, P pauses, and Escape returns to the menu.
The second local player needs their own keyboard controls or a controller.

The HD option renders at 1376 Ã— 1032. The high-resolution option uses the original
high-quality artwork at 2752 Ã— 2064. Both are fitted to the available browser area
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

## Combo scoring and independent speed effects â€” 6 November 2026

Revision: `20261106-combo-cooldown`. Consecutive normal meals from distinct
snakes show COMBO X2, X4, X8 and so on below the participant's score and lives.
Only snake awards receive this multiplier. Split fragments retain their
original snake identity. Frontal powered head bites end the chain. Fruit and
scorpions renew its grace period without upgrading its multiplier or changing
their ordinary score awards.

Combo speed rises smoothly to 2x in 500 simulation milliseconds and stays
there while feeding continues; additional snakes do not raise or restart
that speed. The first non-feeding move starts 1000 milliseconds of grace;
after expiry the multiplier ends and speed eases down over 1500 milliseconds. Fruit power is an
independent speed factor up to 2x, so simultaneous mature effects request
4x the normal movement rate. Every fruit refreshes power to seven simulation
seconds, keeping its existing acceleration and final three-second easing.
These are the movement envelopes; actual step cadence also depends on frame
rate. Combo grants neither protection nor permission to eat frontal heads.

Each participant has an independent continuously sweeping combo caption.
Upgrades pulse it and play the existing activation sound. The caption shares
the score/lives group's smooth contact fading. No new texture pack is needed.

## Current difficulty policy â€” 30 October 2026

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

## Earlier foundation â€” 29 October 2026

The preceding update introduced the revised behavior used as the starting
point. PICNIC snakes favour intelligent evasion, with rare retaliation after
being bitten. The AI player mostly wanders, occasionally eats and only rarely
pursues a human. EASY, MEDIUM and HARD progressively improve awareness,
planning and aggression; BRUTAL removes deliberate movement errors and forced
roaming breaks. That update bounded the growth from elapsed time; the current
30 October policy above replaces that limit with gradual escalation to BRUTAL.

The update keeps the existing artwork, animations, effects, touch controls and
web loading system. The PC, iPhone and original browser editions are separate.


### LEVEL CLEARED â€” 20261031-clear-celebration

Hunters and the scorpion keep moving with the original animation and lighting renderers during LEVEL CLEARED, including an extended preparation wait. This is a separate presentation snapshot: players, scores, drops, hatching and the future-level random stream remain unchanged. Nearby hunters choose an outward route or ricochet at a blocked passage. Fruit pulses continue; egg crack stages stay fixed. The existing exit-camera pacing and cache adoption are preserved.


### Shared notice backdrops â€” 20261031-message-panels
GAME OVER, LEVEL CLEARED and PAUSE share a procedural translucent rounded backdrop with soft edges. Menu preparation/errors, coming-soon and record statuses use the same component. Existing glyphs, reveal/blink timing and world state stay unchanged. The panel adapts to future longer captions without stretching. Native HD/4K visual and menu/record smoke tests passed; no new blur textures or asset packs. PC, iPhone and original JS browser versions remain separate.

