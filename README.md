# Maze Biters

Maze Biters is a neon arcade maze game about hunting living snakes one segment
at a time while a growing ecosystem hunts back. It combines immediate arcade
controls with dynamic mazes, solo/local competitive modes, adaptive
creature behaviour, native HD/4K artwork, spatial sound and controller haptics.

[Прочети документацията на български](README.bg.md)

Current build: **v1.01.93.00**

Stable gameplay reference: **v1.01.61.99**

## Highlights

- Six single-player, local co-op, competitive multiplayer and AI game modes.
- Procedurally selected and rated 36×25 mazes with increasing structural
  complexity and changing neon colour themes.
- Snakes that can retreat tail-first, remember attacks, become angry, split
  into independent creatures and coordinate pressure as levels rise.
- Scorpions that roam the maze, leave fruit and lay eggs which hatch into
  aggressive hunters.
- Five speed settings and five difficulty settings with a combined score
  multiplier.
- Native HD and 4K atlas families with dynamic 1×–2× gameplay camera zoom,
  including movement-responsive framing in every mode.
- 104 isolated moving-snake sprite cells that prevent atlas-edge bleeding at
  fractional zoom levels.
- Keyboard, mouse/touch and standard gamepad support.
- Persistent Top 25 high scores with an in-game bitmap-font name terminal.
- Positional Web Audio effects, streamed music and progressive gamepad haptics.
- Fixed 120 Hz internal render target with cached maze, HUD, title and sprite
  layers.

## Play locally

The game must be served through HTTP because browsers restrict audio loading
from `file://` pages.

On Windows, open a terminal in the project directory and run:

```cmd
.\tools\serve.cmd
```

Then open <http://127.0.0.1:8080/>. Stop the server with `Ctrl+C`.

An alternative port may be supplied:

```cmd
.\tools\serve.cmd 8081
```

The launcher uses the Python runtime bundled with Codex when available and
falls back to a normal `python` or `py` installation.

## Game modes

| Key | Mode | Players |
| --- | --- | --- |
| `1` | SOLO | One human player |
| `2` | DUO CO-OP | Two human teammates; no friendly bites |
| `3` | DUO VS | Two competing human players |
| `4` | SOLO VS AI | One human against one AI competitor |
| `5` | DUO VS AI | Two human competitors and one AI competitor |
| `6` | AI ONLY | Autonomous demonstration/simulation mode |

The menu has two columns of three buttons, with human-only modes on the left.
In **DUO CO-OP**, teammates cannot eat each other, even with Power Mode, spawn
protection or a higher score. An occupied teammate cell still blocks movement.
The score-leader outfit and trailing sparks remain purely visual. Lives and
scores stay individual, with the same highest-human high-score rule as before.
Stored mode IDs remain stable, so existing DUO VS records keep their meaning;
CO-OP adds ID `5`, independently of its menu shortcut `2`.

Run `node tools/test-game-modes.mjs` to verify all six selections, controller
navigation, CO-OP contact safety, leader visuals and saved-score compatibility.

In competitive modes, contact is resolved through a live strength hierarchy.
Spawn protection temporarily outranks everything. Otherwise Power Mode outranks
normal players, and when both players have equal power state, the higher score
wins the collision. Equal-strength contact blocks movement.

## Controls

### Title screen

| Input | Action |
| --- | --- |
| `1`–`5` | Start the corresponding game mode |
| Arrow keys | Move menu focus |
| `Space` / `Enter` | Activate the focused option |
| Mouse/touch | Select modes and settings directly |
| Gamepad D-pad / left stick | Move menu focus |
| Gamepad A / Start | Activate the focused option |

The left settings column contains `HIGH SCORES`, `HOW TO PLAY`, then `QUALITY`;
the right contains `DIFFICULTY`, `SPEED`, then `MUSIC`.

`MUSIC` cycles through `OFF → LOW → MEDIUM → HIGH`. HIGH is the default and
preserves the original music mix; LOW and MEDIUM use 25% and 55% of that level.
The setting applies to both menu and gameplay music, leaves sound effects
unchanged and is remembered in this browser. Changing it does not restart
the current track or change the playlist order.

Run `node tools/test-music-settings.mjs` to check volume levels, persistence,
sound-effect isolation, fades, the shared music player and menu navigation.

### How to Play

`HOW TO PLAY` opens the seven-scene **Neon Training** tutorial without
starting or changing a run. Each scene is a real cell-valid mini maze painted
by the production maze renderer and cached at the active HD/4K atlas quality.
Players, snakes, fruit, scorpions, eggs, hunters, leader visuals, bite blooms
and the death sprite use the same rendering paths as gameplay. Snake bodies
are always resolved head-to-tail by the shared production renderer, including
turns, unique heads and automatically oriented tails.

The seven pages contain thirteen automatically replaying demonstrations.
Their isolated training simulation uses the gameplay movement, snake impulse,
bite/split, power, shield, death and duel-priority helpers. Playback is slowed
uniformly to make each encounter readable; motion and effects stay on the same
clock. Phosphor wakes, mouth animation, leader sparks, consumption blooms,
power warning flashes and the matching sound cues are retained.

Each demonstration has a 900 ms reading lead-in and a 650 ms outcome hold.
A 220 ms eased fade at each end conceals chapter/replay resets inside the
mini-maze only; instructions and navigation stay visible. These presentation
pauses do not advance the game clock or shorten power, shields or effects.
Multi-part lessons name the current demonstration. Captions receive at least
1.5 seconds of fully readable time, and the two rapid powered bites share one
explanation. A body cut is phased just after its native snake impulse settles,
so surviving cells do not jump when the fragments are created. The fade uses
one flat rounded fill, with no extra canvas, texture, runtime blur or gradient.

Queued-turn cues use a small rounded teal keycap with a complete direction
arrow and a gentle press animation, making the requested keyboard/D-pad input
clear. Once introduced, the key stays for the whole demonstration, above
characters, effects and lighting; the player passes underneath without
consuming it. It softly blinks at 34–74% opacity using real time, including
reading/outcome holds. Its flat layers require no additional texture or canvas.

The movement lesson focuses on one preselected UP turn with an unchanged
caption throughout the replay; the player continues up and leaves the stage.
In the ricochet lesson the snake advances
continuously toward the player and keeps moving after the player rebounds
and takes the side exit. Its movement phase brings the visible head one cell
from the player at recoil. The player then continues up an open corridor and
out of the miniature stage. In Power Mode the reversed snake and player each
continue down their corridors and leave the stage, with native movement and
head/tail impulses. Only four explicitly declared, bounded exit lanes can
cross the crop border. Sprites, lights and trails leave naturally behind the
existing rounded clip; no teleport, death or extra render surface is used.

The scenes cover movement and preselected turns, a real tail bite and body
split, magnetic ricochet through a straight tunnel into a held safe turn,
Fruit and Power Mode, a snake catching a stationary player in a dead end,
competitive contact priority and the final snake being cleared. Every actor
route is validated against the mini-maze cells at startup, so no character can
cross a wall or take a diagonal shortcut. The dead-end player starts farther
left, reaches the last open cell and immediately turns back without pausing
at the wall. The warning appears when the side exit is missed, leaving time
to read it during the approach. The player faces the snake, ricochets back to the
wall and is caught there. The snake blocks the missed side turn throughout
the return, with one-cell visual separation at recoil. Duel examples show both players' identities,
scores and current protection, then demonstrate the actual winner or a blocked
contact: shield over power, power over score, higher score with equal power,
equal power and score, and two shields. A body split creates two moving snakes;
the old tail becomes the new head of the rear half. The level-clear example
finishes the complete eight-flash celebration, with one centered snake counter
and a separate LEVEL CLEARED caption.

Use Up/Down to change scenes, Left/Right to choose `PREV`, `NEXT` or `EXIT`,
and Space/Enter to activate the selected action. The same navigation works
with a D-pad and A. Every screen has a visible `EXIT`; `Esc` or gamepad B
returns to the main menu immediately. Mouse and touch can select all three
buttons directly. The final scene also offers `PLAY SOLO`.

The canvas exposes the current scene title, instructions and controls through
an ARIA live description, so the tutorial does not rely only on animation or
colour.

Run `node tools/test-tutorial.mjs` for the dependency-free movement, collision,
geometry, timing, replay-isolation and tutorial outcome regression checks.

### High scores

After a qualifying game, `NEW HIGH SCORE` opens a ten-character arcade
name terminal. Names, its cursor, the on-screen keyboard and the leaderboard
are all rendered through the game's own bitmap font. Type directly, use the
D-pad/arrow keys and A/Space, or tap the on-screen keys. `DELETE` removes the
last character, `SAVE` records the result and `SKIP` discards it.
Names contain up to 10 supported characters, without spaces. Typing Space
does not insert a letter unless arrow-key navigation has been activated.
Existing shorter names remain unchanged; the menu record row fits long names
and large scores within its margins, including its matching light sweep.
The engine and score service use matching release-versioned script URLs so
a cached eight-character service cannot be reused with the ten-slot screen.

An empty or whitespace-only name can never be submitted and never consumes a
leaderboard position. AI-only runs are ineligible. In every other mode only
the highest-scoring human creates a record; tied human leaders share one
record. The table keeps the best 25 entries and shows rank, name, mode, level
and score across `PREV` / `BACK` / `NEXT` pages.

The static GitHub Pages build stores this leaderboard in the browser's
`localStorage`, so it persists on that device without an account. The client
is also ready for a shared website database: set the
`maze-biters-high-score-api` meta value in `index.html`. The endpoint accepts
`GET ?limit=25` and `POST` JSON, returning either an array of entries or
`{ "scores": [...] }`. Server-side score validation and rate limiting remain
the responsibility of the production API.

### Gameplay

| Player/input | Controls |
| --- | --- |
| Player 1 | `WASD` or classic `IJKM` |
| Player 2 | Arrow keys in two-human modes |
| Single human player | Arrow keys also control Player 1 |
| Gamepads | First connected pad controls P1; second controls P2 |
| Mouse/touch | Select a reachable maze cell; the nearest human follows a shortest route |
| `P` | Pause/resume |
| `Esc` | End the current run; press again during GAME OVER to skip its animation |
| Two digits `01`–`99` | Load that level for testing |
| `00` | Load level 100 for testing |

Two simultaneous direction keys, a diagonal D-pad input or an analogue-stick
diagonal use staircase alternation through valid corridors. Character tilt is
visual only and never changes collision or movement timing.

## Objective and progression

Clear a level by removing every snake. A snake can be attacked in three ways:

- Eat its tail to remove one segment.
- Bite a middle segment to split it into two independent snakes.
- Eat the head from a safe direction, or from any direction while protected.

Normal head contact is dangerous. A full snake head is safe only when caught
from behind. A solitary head is safe from the side or rear, but dangerous from
the front. Power Mode and the spawn shield grant combat priority.

When the final snake is removed, every active player receives a level-clear
bonus, the maze changes, the creature system is rebuilt and the next music
track begins. Maze complexity, creature awareness, aggression, pressure and
coordination continue increasing toward level 100 and beyond.

Every new run begins with a randomly selected maze colour. Level music then
alternates between the calmer **Neon Stillness** collection on odd-numbered
levels and the more dynamic **Neon Orbit** collection on even-numbered levels.
Each nine-track collection is shuffled independently and fully exhausted before
it is refilled, so all 18 gameplay tracks are heard across the first 18 levels
before any selection can repeat. The title-screen track remains fixed.

Players start with three lives. An extra life is awarded at every 5,000 points,
up to a maximum of nine lives. After losing a life, a player respawns only when
the starting cell is safe and receives a temporary spawn shield lasting 20
normal snake steps.

## Creatures and items

### Snakes

Snakes navigate the maze as segmented creatures. They avoid solid obstacles,
can reverse tail-first when trapped, remember which player attacked them and
become more aggressive after bites or splits. Their colour and sprite family
remain stable through splitting and retreating.

The original linear head/tail impulses are retained in both directions; the
experimental tail easing has been reverted. Run `node tools/test-snake-tail-motion.mjs`
for the timing, movement-mode transition and geometry regression checks.

### Scorpion

The two-cell scorpion appears after a pressure-adjusted delay. It moves through
the maze, periodically leaves fruit and lays eggs. Eating it is always safe,
scores points and makes its already-hatched offspring substantially angrier.

### Eggs and hunters

Fresh eggs remain passable for ten gameplay seconds. Once cracking begins they
become solid obstacles. An egg does not crack while covered by another entity.
After hatching, it creates a fast hunter which pursues players and uses the
same maze-aware movement system as the other autonomous creatures.

### Fruit and Power Mode

Four fruit types award increasing points. Every fruit activates or refreshes a
seven-second Power Mode envelope:

- 1 second acceleration;
- 3 seconds at full strength;
- 3 seconds of warning flashes and deceleration.

During Power Mode the player moves faster and can safely eat hostile creatures.
Repeated fruit refreshes the duration without introducing a speed discontinuity.

## Scoring

The values below are base points before speed and difficulty multipliers:

| Event | Base points |
| --- | ---: |
| Bite a middle snake segment / split a snake | 10 |
| Eat a snake tail segment | 25 |
| Fruit types 1–4 | 50 / 100 / 150 / 200 |
| Eat a snake head | 125 |
| Eat the scorpion | 150 |
| Eat a hunter | 200 |
| Clear a level | 500 per active player |
| Defeat a competing player | 1,000 |

Exact fractional points accumulate internally. The HUD displays the score
rounded down to an arcade-style multiple of five.

### Difficulty multiplier

| Setting | Multiplier |
| --- | ---: |
| PICNIC | 0.50× |
| EASY | 0.75× |
| MEDIUM | 1.00× |
| HARD | 1.25× |
| BRUTAL | 1.50× |

### Speed multiplier

| Setting | Multiplier |
| --- | ---: |
| SNAIL | 0.60× |
| SLOW | 0.80× |
| MEDIUM | 1.00× |
| FAST | 1.25× |
| EXTREME | 1.60× |

Final score multiplier = speed multiplier × difficulty multiplier. Speed uses
one central game clock, keeping movement, animation, spawning, eggs, shields,
Power Mode and AI timing synchronized.

## Display quality and rendering

The logical maze is 576×400 pixels, built from a 36×25 grid of 16-pixel cells.
The HUD is a separate 32-pixel logical strip.

- **HD** uses native 80 px source atlases and a 1440×1080 total presentation
  profile. It is the default and most memory-efficient mode.
- **4K** uses native 160 px source atlases and a 2880×2160 total presentation
  profile.

The 4K package is lazy-loaded only when 4K is selected, saving approximately
10.4 MB of startup traffic in the normal HD mode. The maze layer, title layers,
HUD background, bitmap fonts and frequently used sprite regions are cached.
Dynamic camera zoom follows active players within a 1×–2× range without
switching sprite families during gameplay. Every mode measures each living
player's actual rendered movement independently over a smoothed half-second
window. For one living player, sustained straight movement at MEDIUM speed
targets about 1.74×, opening as far as 1.68× at double speed from Power Mode or
faster settings. Winding routes and backtracking keep the view closer;
blocked movement does not open it. Horizontal and vertical movement use the
same response, and stopping gradually returns toward 2×.

With multiple living players, the strongest movement request adds space around
the existing shared view of the group. Opposite directions do not cancel each
other's movement, and players already spread across the full 1× maze cannot
open the view farther. A lone survivor in any mode uses the exact Solo target
curve and keeps their movement history while the camera eases from its prior
view. Dead skulls do not hold that survivor in a distant shared frame; with
nobody alive, the existing death framing remains.

The camera retains its smooth pan and zoom transitions. Respawning players
rejoin the shared group as the camera eases toward the new view; their movement
measurements start afresh without a false speed burst. Each level starts with
the full 1× maze view and smoothly closes in. New levels and returning from a
hidden tab reset movement measurements; pause, GAME OVER and level clearing
return to the full view while DUSK lighting remains active.
Run `node tools/test-solo-camera.mjs` for the Solo and shared-camera regression
checks.

### DUSK lighting

DUSK is the fixed lighting for every game mode and all seven How to Play
scenes. It is active at the normal URL, with no lighting query modes or `N`
switch. Runs follow the normal high-score eligibility rules. The main menu,
HUD, tutorial labels and captions retain their existing brightness.

Each living player, including AI players, has a soft local halo and a feathered
forward flashlight. The beam follows the player's interpolated position,
smoothly follows facing/tilt and scales with camera zoom. Lights combine in
multiplayer. The fixed 80% darkness leaves distant neon walls faintly visible;
the base halo radius is 2.8 cells and the forward reach is 9 cells.

Power Mode follows the existing `powerModeSpeedStrength` envelope for a smooth
ramp, refresh and decay. At full strength, the beam reaches 45% farther
(13.05 cells) and the local halo expands by 30%. An additional stamp of the
same cached beam makes the light brighter. Warning flashes do not flicker
the lamp, and powering up creates no new textures per frame.

DUSK remains active during pause, game over, level clearing, level selection
and scenes with no living players. A visible death sprite keeps only a local
halo, whose brightness follows the skull's pulse alpha; it has no directional
beam and leaves no light after the skull vanishes. The same behavior applies
to the tutorial, with cues and labels drawn above the lighting.

The shared renderer in `src/render/dusk-lighting.js` uses soft arcade lighting:
wall occlusion is disabled, so a beam can illuminate through a wall. Lighting
changes presentation only; AI, collisions, speeds and level progression retain
their existing rules.

Gameplay and How to Play share two cached light textures and keep one fixed
mask each: 576×400 for gameplay and 384×128 for the tutorial. The two textures
and two masks are reused across frames, tutorial replays, HD/4K changes and
zoom. Main canvas dimensions and atlas selection are unchanged.
The mask is now repainted only when its exact ordered light inputs change:
screen position, camera zoom, aim, brightness, power envelope or visible roster.
Unchanged frames reuse the completed mask but still composite it over the new
game frame. Angle smoothing and game clocks continue updating normally; there
is no quantization, reduced lighting cadence or new full-resolution cache.
Two small reusable numeric buffers track these inputs. Diagnostics expose
`maskRebuilds` and `maskReuses` alongside the unchanged allocation counters.
Run `node tools/test-dusk-lighting.mjs` for the lighting regression checks.

### Menu and high-score lighting

The **Dusk Arcade** main menu uses a subdued real maze backdrop, a fine rounded
outer frame and bevelled dark-teal controls. The original bitmap font and
native wordmark remain, with a smaller high-score row and a steady logo.
Six direct-start modes stay in two columns of three, with a short explanation
and original player sprites below the selection. HIGH SCORES and HOW TO PLAY
sit above one row of DIFFICULTY, SPEED, QUALITY and MUSIC settings. Number
shortcuts and the spatial keyboard/D-pad navigation remain available.
Mode portraits use the real player palettes: green P1, magenta P2 and blue AI.
CO-OP faces the viewer; DUO VS and SOLO VS AI face their opponent. DUO VS AI
places the forward-facing AI between inward-facing P1 and P2. AI ONLY shows
the AI, not the green player. All poses use existing native HD/4K atlas frames.

Subtle emerald/cyan and violet light pools drift behind the lower controls;
the logo's surrounding glow is fixed. A soft pool follows focus with a 200 ms
crossfade. Only the selected control gets a bright rim; idle controls and
instructions no longer have moving rails or repeated pulses. Start confirmation,
setting feedback and the score sweeps remain. Native bitmap glyphs stay crisp.
The backdrop reuses the real maze artwork and is composited only on cache
invalidation. It shares a full-size cache with the separately keyed leaderboard,
name-entry and tutorial backdrops. Gameplay, lighting and camera behavior are
unchanged.

The HIGH SCORES leaderboard extends Dusk Arcade with a subdued maze, the same
fine rounded outer frame, and a recessed dark-teal table with a soft bevel.
Visible records have faint rounded row bands; first place retains its warm
light and the newly saved record its emerald accent. Empty boards show a
player and invitation rather than empty record slots. Original bitmap text,
Top 25 persistence, paging, controls, heading sweeps and music are unchanged.
The table and rows are baked into the existing native HD/4K backdrop, keyed by
visible row count. Paging between two full pages or changing a score/highlight
reuses that artwork; the last short page rebuilds it once. No new full-screen
canvas, per-frame gradients or per-frame row-array copies are needed.

NEW HIGH SCORE now uses the same Dusk maze, fine rounded outer frame and a
recessed dark-teal writing desk. Ten luminous name slots sit above the original
on-screen keyboard, with a short character-limit hint and a visible Escape
shortcut. P1/P2 identification, the latest-letter light impression, focus
crossfades, heading sweep and score music remain. The new relief is baked into
the existing native HD/4K backdrop; typing and changing focus do not rebuild
it or allocate additional canvases. Keyboard and action-button positions stay
unchanged, while the centered name row grows to ten slots.

HOW TO PLAY completes the Dusk Arcade interface with the same fine rounded
outer frame, a recessed dark-teal folio, a rounded demonstration rim, soft
caption plates and rounded P1/P2 duel cards. Its original 864×288 demo viewport
and world transform are unchanged; an eight-pixel corner clip trims only solid
boundary walls. All seven pages keep their original actors, routes, timings,
effects and controls. Navigation uses the same steady bevel and soft focus
crossfade as the score screens; disabled PREV stays dim and receives no light.
The folio and rim reuse one native HD/4K backdrop across every training page.
Small live caption/card fills require no gradients, blur or temporary canvases.
Quiet header lighting is drawn before the demo, leaving its gameplay lighting intact.

HIGH SCORES, NEW HIGH SCORE and HOW TO PLAY also use the main menu's static
microstars, below their lighting and text. Each screen bakes one star field
into its backdrop; opaque panels keep the content clear. The tutorial excludes
its entire maze and rim from this field. No separate transparent star canvas
is allocated by these screens.

For DUO VS, DUO VS AI and DUO CO-OP records, name entry identifies the winning
human as **P1 HIGH SCORE** or **P2 HIGH SCORE**. Tied human records retain the
shared P1 + P2 message; single-human prompts are unchanged.

Score-screen and tutorial controls use slightly rounded, bevelled dark-teal
faces with a fine neon rim and upper reflection. Name-entry keys and slots
share this style; keyboard/action hit areas and controls are unchanged. The
maze panel and duel information cards retain their original geometry. Twelve
normal/selected control sprites (six shapes, including the main menu) share one
shelf-packed, padded, native HD/4K cache, warmed
at startup and quality changes; button gradients and glow are never rebuilt
per frame. The atlas is 619×827 in HD and 1238×1651 in 4K (about 8.2 MB of
RGBA pixels at 4K). The existing cloudy focus and disabled/pulsing alpha are retained.

The selected-control cloud is slightly stronger (0.27 opacity, previously 0.22),
with the same cached texture and 200 ms transition. **NEW HIGH SCORE** and
**HIGH SCORES** headings share the main menu's glyph-clipped left-to-right-and-back
spotlight. Their first pass starts after about 3.9 seconds and repeats every
7.8 seconds: twice the menu's frequency, with the same 4.9-second round trip.
Only the heading is swept, not table rows or tutorial text. The existing menu
mask, light strip and effect surface are reused; masks rebuild only when their
text or atlas quality changes.

High-score screens use a quieter ambient wash, a warm champion accent and an
emerald new-record accent while keeping row text legible. Name entry softly
lights the active key and next character slot, with the same controls and
policy that empty or whitespace-only names cannot be saved. The latest
entered letter lights its own slot for 420 ms; rapid typing or paste replaces
that single glow without accumulating effects.

`src/render/menu-lighting.js` reuses small, immutable light stamps across HD
and 4K, with no per-frame blur or gradient creation. Gameplay DUSK and camera
behavior are unchanged. Run `node tools/test-menu-lighting.mjs` for its
regression checks.

#### Rendering optimization checkpoint — v1.01.80.00

- Removed the redundant full HD/4K black prefill before every title frame.
  All title screens already begin with an opaque, full-size cached backdrop
  copy. Offscreen assembly and the single finished-frame presentation remain.
- Inactive confirmation sweeps no longer allocate temporary progress arrays;
  simultaneous score salvos keep the same timing and draw order.
- Removed the unused legacy mode overlay, old focus-light timer/helpers and
  no-op geometric focus calls. No art, sound or music assets were removed.
- A controlled 210-frame stationary scene required one lighting-mask rebuild
  instead of 210. Moving/zooming light inputs still rebuild every changed frame.
- Browser comparisons matched full-canvas pixel hashes before/after in HD and
  4K for the menu, name entry, leaderboard, all seven tutorial pages and sampled
  stationary/zooming gameplay. Regression tests also cover cache invalidation,
  power/death changes and title-buffer transitions across HD→4K→HD.

Short headless Chrome timing runs and live AI smoke tests are diagnostic only:
they do not measure physical-display presentation or guarantee frame rates on
slower/mobile GPUs. No renderer, resolution, effect strength or game rule was
changed to obtain these savings.

## Audio and haptics

- 24 short WAV effects are decoded once through Web Audio and reused through a
  bounded 32-voice mixer.
- Player- and creature-originated effects use stereo position based on their
  horizontal maze location.
- One fixed menu track, a dedicated name-entry track and 18 shuffled level
  tracks stream through one shared MP3 player, without large decoded buffers.
- **Neon Orbit High Score** starts at name entry and continues without restarting
  into the resulting leaderboard, including page navigation. Only returning to
  the main menu restores its normal music. A leaderboard opened directly from
  the menu keeps menu music. Typing does not restart the track; all four volume
  settings apply and the 18-track gameplay rotation is unchanged.
- Compatible controllers receive separate menu, bite, Power Mode, damage and
  life-loss vibration patterns.

## Project structure

```text
maze-biters/
├── index.html
├── styles/
│   └── game.css
├── src/
│   ├── config/
│   │   ├── audio-assets.js
│   │   └── render-atlas.js
│   ├── services/
│   │   └── high-score-service.js
│   ├── render/
│   │   ├── dusk-lighting.js
│   │   └── menu-lighting.js
│   └── engine/
│       └── game.js
├── assets/
│   ├── art/title/{fallback,hd,4k}/
│   ├── atlases/{shared,hd,4k,metadata}/
│   └── audio/{sfx,music}/
├── tools/
│   ├── serve.cmd
│   ├── serve.ps1
│   ├── test-dusk-lighting.mjs
│   ├── test-menu-lighting.mjs
│   └── verify-project.mjs
└── .github/workflows/validate.yml
```

## Validation

Run the dependency-free project verifier with Node.js:

```bash
node tools/verify-project.mjs
```

It verifies JavaScript syntax, required files, every local runtime reference,
the absence of embedded image/audio data URIs, the expected asset inventory,
and the high-score name, sorting, qualification and Top 25 rules. The same
checks run automatically through GitHub Actions.

## Deploying on GitHub Pages

The repository is a static site with no build step. In the GitHub repository:

1. Open **Settings → Pages**.
2. Choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder.
4. Save and wait for the Pages URL to appear.

## Current limitations

- GitHub Pages uses a persistent per-browser leaderboard. A global leaderboard
  requires the future website API/database endpoint to be deployed and enabled.
- Music volume is saved locally; game progress and other menu settings are not
  stored between browser sessions.
- The renderer is Canvas 2D; WebGL is not currently used.

## License

No open-source licence is currently granted. All rights are reserved by the
Maze Biters project owner unless a licence is added later.
