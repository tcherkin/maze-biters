# Maze Biters

Maze Biters is a neon arcade maze game about hunting living snakes one segment
at a time while a growing ecosystem hunts back. It combines immediate arcade
controls with dynamic mazes, solo/local competitive modes, adaptive
creature behaviour, native HD/4K artwork, spatial sound and controller haptics.

[Прочети документацията на български](README.bg.md)

Current build: **v1.01.62.00**

Stable gameplay reference: **v1.01.61.99**

## Highlights

- Five single-player, local multiplayer and AI game modes.
- Procedurally selected and rated 36×25 mazes with increasing structural
  complexity and changing neon colour themes.
- Snakes that can retreat tail-first, remember attacks, become angry, split
  into independent creatures and coordinate pressure as levels rise.
- Scorpions that roam the maze, leave fruit and lay eggs which hatch into
  aggressive hunters.
- Five speed settings and five difficulty settings with a combined score
  multiplier.
- Native HD and 4K atlas families with dynamic 1×–2× gameplay camera zoom.
- 104 isolated moving-snake sprite cells that prevent atlas-edge bleeding at
  fractional zoom levels.
- Keyboard, mouse/touch and standard gamepad support.
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
| `2` | DUO VS | Two competing human players |
| `3` | SOLO VS AI | One human against one AI competitor |
| `4` | DUO VS AI | Two human competitors and one AI competitor |
| `5` | AI ONLY | Autonomous demonstration/simulation mode |

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
| `Space` | Activate the focused option |
| Mouse/touch | Select modes and settings directly |
| Gamepad D-pad / left stick | Move menu focus |
| Gamepad A / Start | Activate the focused option |

### Gameplay

| Player/input | Controls |
| --- | --- |
| Player 1 | `WASD` or classic `IJKM` |
| Player 2 | Arrow keys in two-human modes |
| Single human player | Arrow keys also control Player 1 |
| Gamepads | First connected pad controls P1; second controls P2 |
| Mouse/touch | Select a reachable maze cell; the nearest human follows a shortest route |
| `P` | Pause/resume |
| `Esc` | End the current run; press again during GAME OVER to return immediately |
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
Dynamic camera zoom follows active players from a full-maze view to 2× without
switching sprite families during gameplay.

## Audio and haptics

- 24 short WAV effects are decoded once through Web Audio and reused through a
  bounded 32-voice mixer.
- Player- and creature-originated effects use stereo position based on their
  horizontal maze location.
- Menu and level music are streamed as MP3 media elements instead of being
  decoded into large in-memory buffers.
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
│   └── engine/
│       └── game.js
├── assets/
│   ├── art/title/{fallback,hd,4k}/
│   ├── atlases/{shared,hd,4k,metadata}/
│   └── audio/{sfx,music}/
├── tools/
│   ├── serve.cmd
│   ├── serve.ps1
│   └── verify-project.mjs
└── .github/workflows/validate.yml
```

## Validation

Run the dependency-free project verifier with Node.js:

```bash
node tools/verify-project.mjs
```

It verifies JavaScript syntax, required files, every local runtime reference,
the absence of embedded image/audio data URIs and the expected asset inventory.
The same checks run automatically through GitHub Actions.

## Deploying on GitHub Pages

The repository is a static site with no build step. In the GitHub repository:

1. Open **Settings → Pages**.
2. Choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder.
4. Save and wait for the Pages URL to appear.

## Current limitations

- The HIGH SCORES title option currently provides its finished focus and
  confirmation animation, but persistent score storage and name entry are not
  implemented yet.
- Runs and settings are not stored between browser sessions.
- The renderer is Canvas 2D; WebGL is not currently used.

## License

No open-source licence is currently granted. All rights are reserved by the
Maze Biters project owner unless a licence is added later.
