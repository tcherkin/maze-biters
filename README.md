# Maze Biters

**Bite. Dodge. Survive.**

A neon maze arcade game where the creatures you hunt can hunt you back.
Chase a snake's tail, cut its body into independent rivals, rebound from a
dangerous head and find your next escape route before the maze closes in.

[**Play in your browser**](https://tcherkin.github.io/maze-biters/) ·
[Български](README.bg.md) ·
[Technical guide](docs/TECHNICAL.md) ·
[Report an issue](https://github.com/tcherkin/maze-biters/issues)

**Current game: v1.01.93.00** · Browser game · Local multiplayer · Canvas 2D

![Maze Biters Dusk Arcade menu with six game modes and rounded neon controls](docs/images/menu.png)

## At a glance

- **Six ways to play:** Solo, Duo Co-op, Duo VS, Solo VS AI, Duo VS AI and AI Only.
- **Living snakes:** bite tails, split bodies, exploit head direction and react to retreats.
- **Magnetic ricochet:** an automatic rebound gives you a chance to escape a lethal encounter.
- **DUSK atmosphere:** soft flashlights reveal a dim neon labyrinth; Power Mode increases their reach.
- **Arcade feedback:** luminous wakes, charged leader sprites, trailing sparks and colourful bite effects.
- **Seven-page How to Play:** thirteen replaying demonstrations using real game movement and effects.
- **Top 25:** ten-character names entered with the game's own bitmap font.
- **HD and 4K:** native artwork, a smooth shared camera, keyboard, pointer and gamepad controls.
- **20 music tracks:** a menu theme, a high-score theme and eighteen alternating level tracks.

> **Leaderboard status:** the public build currently saves scores in your browser.
> It is not yet a global online ranking. The website API adapter is present;
> the shared backend and database are still to be deployed.

## Contents

[Start playing](#start-playing) · [Game modes](#game-modes) ·
[Controls](#controls) · [Combat and survival](#combat-and-survival) ·
[Creatures and power](#creatures-and-power) · [Scoring](#scoring) ·
[High scores](#high-scores) · [How to Play](#how-to-play) ·
[Light and camera](#light-and-camera) · [Music and sound](#music-and-sound) ·
[Run locally](#run-locally) · [Development](#development) · [Credits](#credits)

## Start playing

Open [Maze Biters](https://tcherkin.github.io/maze-biters/) and select a mode.
For a first game, leave **DIFFICULTY** and **SPEED** on **MEDIUM** and use **SOLO**.
Choose **HOW TO PLAY** first if you would like to see each mechanic in action.

Your objective is to **remove every snake**, including the new snakes created
by splitting one. Scorpions and hunters add pressure, but they are not the
level-clear counter.

Three useful habits:

1. Approach a tail before attempting a head attack.
2. Choose your next direction early: a held turn happens when the passage opens.
3. Keep an escape route. A ricochet buys reaction time, not permanent safety.

The HUD shows each player's score and lives, the current level and the number
of remaining snakes. A body split can increase that number.

## Game modes

| Key | Mode | Who plays | Player-to-player contact |
| --- | --- | --- | --- |
| `1` | **SOLO** | One human | No competing player |
| `2` | **DUO CO-OP** | Two human teammates | No friendly eating; occupied cells still block |
| `3` | **DUO VS** | Two human rivals | Competitive contact rules |
| `4` | **SOLO VS AI** | One human and one AI rival | Competitive contact rules |
| `5` | **DUO VS AI** | Two human rivals and one AI rival | All three compete |
| `6` | **AI ONLY** | Autonomous AI play | Watch the simulation; no high-score submission |

Multiplayer is **local, on one shared screen**, not online matchmaking.
P1 is green, P2 is magenta and the AI is blue. The menu portraits use those
actual appearances and face their partners or opponents appropriately.

Co-op players keep separate scores and lives. A leader's luminous outfit still
appears in Co-op, but is only a visual distinction: it never enables friendly fire.

## Controls

### In the maze

| Input | Action |
| --- | --- |
| P1: `W A S D` | Up, left, down, right |
| P1: `I J K M` | Classic layout: I up, J left, K right, M down |
| Arrow keys | P2 in two-human modes; P1 when there is only one human |
| Gamepad D-pad / left stick | Move; first connected pad controls P1, second controls P2 |
| Click / tap a corridor | Route a human player to that destination |
| `P` | Pause / resume |
| `Esc` | End the run; press again during GAME OVER to skip its presentation |

Movement continues until blocked. Hold a direction before a junction to queue
the turn. Two perpendicular held directions allow staircase movement where
the corridors permit it; the character never cuts diagonally through a wall.

Pointer control selects the living human with the **shortest reachable maze
route** to the destination, not simply the closest on screen. On arrival, the
character keeps its forward momentum; a click is not a stop command.

### Menus and training

Use **arrows** or a **D-pad/left stick** to move focus, and **Space/Enter** or
**gamepad A/Start** to confirm. Mouse and touch can select controls directly.
Gamepad B backs out of submenus; How to Play also has **Esc** and a visible **EXIT**.

The main menu offers direct shortcuts **1–6**, plus **HIGH SCORES**,
**HOW TO PLAY**, and a bottom row of **DIFFICULTY**, **SPEED**, **QUALITY** and **MUSIC**.

### Development shortcut

During gameplay, two digits select a level: `01`–`99`, or `00` for level 100.
This preserves score, lives and mode. **These runs are not currently excluded
from the local leaderboard**, so that table should not be treated as a verified competition.

## Combat and survival

### Read the snake, not just its colour

| Contact | Result |
| --- | --- |
| Tail | One segment is eaten |
| Middle of the body | The bitten segment disappears; the remainder becomes two snakes |
| Full snake head, approached from behind without power/shield | The whole snake is removed |
| Full snake head from the front or side, without protection | Dangerous |
| Solitary head from the side or rear | Safe to eat |
| Solitary head from the front, without protection | Dangerous |
| Head while powered or spawn-protected | The head is eaten; any remaining body reverses into a new snake |

After a split or protected head bite, the old tail can become a **new head**.
Do not assume that a previously safe end remains safe.

### Magnetic ricochet

A living human without Power Mode or a spawn shield automatically reacts to
an adjacent lethal snake head or hunter with a backward rebound. It works
with keyboard, gamepad and pointer control.

The first backward step is compulsory. After that, hold a safe perpendicular
direction to take the first open exit. Otherwise the rebound follows the
straight corridor until blocked; it does not automatically steer around bends.

**Ricochet is not invulnerability.** A wall behind you, an obstructed retreat,
a missed side passage or another approaching threat can still leave you trapped.
Standing still gives the creatures time to close in.

### Duels: who can eat whom?

Competitive player contact follows this order:

1. **Spawn protection:** a protected defender cannot be eaten. A protected
   attacker can beat an unprotected opponent; two protected players block each other.
2. **Power Mode:** without a shield deciding the encounter, a powered player
   beats an unpowered one.
3. **Score:** with equal power state, the higher displayed score wins.
4. **A tie blocks:** equal score and equal power state do not produce a winner.

The leader's outline, Charged Core and sparks identify the score leader,
**not an unconditional right to attack**. An opponent's power or shield can
override the score advantage. DUO CO-OP disables player eating altogether.

### Lives and respawning

Start with **three lives**. Every **5,000 accumulated points** earns an extra
life, up to **nine**. Thresholds reached while already at nine are not banked.

After the death animation, respawning waits until the starting cell is clear.
A temporary spawn shield is granted at the start of a run, on respawn and on
entering a new level. It lasts **20 normal snake steps**—4.36 game seconds—
and grants combat protection without a speed boost.

## Creatures and power

**Snakes** move through the maze in alternating head/tail impulses, can retreat
tail-first, remember attackers and react to bites and splits. Their colours
stay consistent when they fragment. Increasing level pressure makes the maze's
inhabitants more demanding; the original pulse-like movement remains intentional.

**Scorpions** occupy two cells, roam the corridors, leave fruit and lay eggs.
They are always safe to eat, but doing so makes their already-hatched hunters angrier.

**Eggs** are initially passable. After ten game seconds they begin a three-second
cracking phase and become obstacles, then hatch into hunters. Occupied eggs
postpone cracking rather than forming a solid obstacle underneath another entity.

**Hunters** actively pursue players. Power Mode or spawn protection allows a
player to eat them safely; otherwise they are a threat.

### Fruit and Power Mode

Each of the four fruit types awards points and activates or refreshes
**seven game seconds** of Power Mode:

| Phase | Duration | What you see and feel |
| --- | --- | --- |
| Acceleration | 1 second | Smooth speed increase; combat power is already active |
| Full strength | 3 seconds | Up to double movement speed and a brighter, longer flashlight |
| Warning / deceleration | 3 seconds | Warning flashes and a smooth return to normal speed |

Another fruit **refreshes** the timer to seven seconds rather than adding
seven more. Speed remains continuous during the refresh.

All durations above use the central game clock: changing SPEED changes their
real-time pace together with movement, spawning and animation.

## Scoring

| Event | Base points |
| --- | ---: |
| Bite a body segment / split a snake | 10 |
| Eat a tail segment | 25 |
| Fruit types 1–4 | 50 / 100 / 150 / 200 |
| Eat a snake head | 125 |
| Eat a scorpion | 150 |
| Eat a hunter | 200 |
| Clear a level | 500 per player in the current roster |
| Defeat a competing player | 1,000 |

**Points awarded = base points × difficulty multiplier × speed multiplier.**

| Difficulty | Factor | Speed | Factor |
| --- | ---: | --- | ---: |
| PICNIC | 0.50× | SNAIL | 0.60× |
| EASY | 0.75× | SLOW | 0.80× |
| MEDIUM | 1.00× | MEDIUM | 1.00× |
| HARD | 1.25× | FAST | 1.25× |
| BRUTAL | 1.50× | EXTREME | 1.60× |

Fractional points accumulate internally. The displayed score is rounded down
to a multiple of five; that displayed value is used for competitive priority
and high-score capture.

Each new run begins with a **random maze colour**. Clearing a level changes
the maze and soundtrack and rebuilds its creature population. The 36×25 maze
system varies layouts and structural complexity as play progresses.

## High scores

The **Top 25** is presented in the same rounded, illuminated style as the main
menu. Records show rank, name, mode, level and score. The champion and newly
saved entry receive distinct light accents; an empty board never invents records.

### Qualifying and entering a name

- The highest-scoring **human** in a run can submit a positive qualifying score.
- Tied human leaders create **one shared record**, not two duplicate entries.
- AI ONLY is ineligible; an AI's higher score does not prevent a human record.
- A full table requires a score **strictly above** its lowest entry.
- In two-human modes, name entry identifies **P1**, **P2** or the tied pair.
- **Esc-ending a run** can still produce a qualifying record.

Use up to **10 characters**, without spaces. Type directly, select the on-screen
keys with arrows/D-pad, or click/tap them. Names use the game's bitmap font,
not a standard browser text field.

**Enter** saves; **Backspace/Delete** removes the last character.
**Space** activates a selected key only after arrow navigation has been used,
so casual spaces during direct typing do not accidentally insert letters.
The visible **DELETE**, **SAVE** and **SKIP** buttons remain available.

Letters are normalized to uppercase. Supported characters are A–Z, 0–9,
apostrophe, comma, period, hyphen, @ and ?. The on-screen keyboard offers
letters, digits and `- . @ ?`; comma and apostrophe can be typed directly.

**An empty name is never saved.** SKIP or Esc leaves no empty leaderboard slot.

### Local now, shared later

Scores persist in this browser's local storage. They are not account-based
and do not automatically follow you to another device, browser or domain.
Clearing site data can erase them; private browsing may restrict persistence.

The optional website API adapter is documented in the
[technical guide](docs/TECHNICAL.md#shared-high-score-api).
A global, trustworthy leaderboard still requires a deployed server, database,
score validation and abuse protection. Those are not supplied by GitHub Pages.

## How to Play

**Neon Training** contains seven pages and thirteen automatically replaying
demonstrations. You navigate the lessons; the actors perform each example.

| Page | Lesson |
| --- | --- |
| 1 · Move and Turn | Preselect UP, turn at the opening and continue out of view |
| 2 · Bite the Snake | Chase a moving tail; cut the middle and watch two real fragments form |
| 3 · Magnetic Ricochet | Meet an approaching head, rebound and take the side exit |
| 4 · Fruit and Power | Eat the scorpion, see fruit/eggs/hunters, then use Power Mode |
| 5 · Danger and Escape | Miss the exit, reverse at the wall, ricochet from the snake and become trapped |
| 6 · Duel Priorities | Five encounters explain shields, power, score advantages and ties |
| 7 · Clear the Maze | Remove the final snake and see the complete level-clear celebration |

These are cell-valid mini mazes using the **same movement, snake geometry,
bite/split rules, character animation, lighting and effects as gameplay**.
Their simulation is isolated from your real run and scores.

The pace is slowed for readability, with a reading lead-in, outcome hold and
soft transitions between demonstrations. Direction prompts are translucent,
blinking keycaps above the action—not items the player can eat.

**Up/Down** changes pages; **Left/Right** selects PREV, NEXT or EXIT.
Confirm with Space/Enter or gamepad A. Esc/gamepad B exits immediately;
the final page also offers **PLAY SOLO**. Captions and navigation are exposed
through an ARIA live description, although the game remains primarily visual.

## Light and camera

![Solo versus AI in a dim neon maze with player flashlights and the score HUD](docs/images/gameplay.png)

### The DUSK atmosphere

The maze remains faintly visible in darkness. Each living player—including AI—
carries a soft local glow and a feathered directional flashlight. Lights combine
in multiplayer and follow the moving characters and camera.

Power Mode increases beam reach by **45%** and the surrounding halo by **30%**
at full strength. Its warning flashes do not make the flashlight strobe.
The lighting is atmospheric rather than physical: **walls do not block beams**.

DUSK also appears in How to Play and remains during pause, death and level
transitions. A visible death sprite briefly retains its own fading local light.

### Movement-responsive camera

The gameplay camera smoothly pans and zooms within **1×–2×**.

- A stationary solo player is framed closely.
- Sustained movement opens the view a little to reveal the route ahead.
- Winding paths and backtracking keep the view closer than sustained travel.
- Multiple players share a frame that also responds to their individual movement.
- Once only one player remains alive, the camera uses the Solo behaviour.

Pause, GAME OVER and level transitions open the view. Camera framing never
changes collision geometry or switches to another sprite family mid-zoom.

### Effects and interface

**Phosphor afterimages** leave soft, dissolving light mist behind players.
**Leader sprites** combine a fine silhouette outline with a Charged Core;
small sparks trail behind movement. **Bite effects** move from a white impulse
to a coloured cloud that is drawn toward the mouth. Similar consumption
feedback accompanies scorpion and enemy-character bites.

The **Dusk Arcade** interface carries the same atmosphere into the main menu,
high scores, name entry and tutorial: a dim real-maze backdrop, microstars,
rounded dark-teal relief, soft focus lighting and sweeps across bitmap headings.
Ten illuminated name slots give each entered character a small light response.

## Music and sound

The soundtrack alternates mood as levels progress:

- **Level 1 and odd levels:** a randomly selected **Neon Stillness** track.
- **Even levels:** a randomly selected **Neon Orbit** track.
- Each collection has **nine tracks**, shuffled without repetition until its
  own bag is exhausted. Normal sequential play uses all eighteen selections
  before one can repeat; a short level may finish before its track does.
- The menu keeps its own fixed theme.
- **Neon Orbit High Score** begins at name entry and continues into the
  resulting leaderboard. Returning to the main menu restores its theme.
  Opening HIGH SCORES directly from the menu keeps the menu music.

**MUSIC** cycles through OFF, LOW, MEDIUM and HIGH. HIGH is the default mix;
LOW and MEDIUM use 25% and 55% of it. This setting is remembered locally and
does not alter sound-effect volume or restart the playlist.

The game has **24 sound effects**, positional stereo audio and distinct
feedback for bites, fruit, eggs, Power Mode and death. Compatible gamepads
also provide haptics. Audio and vibration depend on browser/device support;
start the game with a user gesture if the browser has suspended sound.

## Run locally

There is no package installation or application build step. Serve the repository
over HTTP; opening `index.html` as a local file can prevent assets/audio loading.

On Windows:

```cmd
.\tools\serve.cmd
```

Open [localhost:8080](http://127.0.0.1:8080/). An alternative port is optional:

```cmd
.\tools\serve.cmd 8081
```

The launcher uses the bundled Codex Python runtime when available, then
`python` or `py`. It avoids the PowerShell execution-policy issue associated
with running `serve.ps1` directly.

With Python 3 on another system, run from the repository root:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Stop the server with **Ctrl+C**. If a published update looks unchanged, perform
a hard refresh. **HD** is the lighter default; **4K** loads higher-resolution art.

## Development

The renderer uses **Canvas 2D**, not WebGL. Graphics, audio, configuration,
lighting and high-score persistence live in separate directories; the main
game engine remains in `src/engine/game.js`.

| Quality | Main presentation, including HUD | Source sprite cells |
| --- | --- | --- |
| HD | 1440×1080 | 80×80 |
| 4K | 2880×2160 | 160×160 |

These are the game's 4:3 backing dimensions, not a claim that it fills a
3840×2160 display horizontally. Fractional zoom still involves image sampling.

The rendering path reuses maze/HUD/interface caches, prebuilt leader variants,
light stamps and bounded effect pools. It isolates 104 moving-snake cells to
prevent adjacent atlas artwork bleeding into fractional zoom. The internal
render target is 120 Hz, **not a guaranteed frame rate on every device**.

See the [technical guide](docs/TECHNICAL.md) for architecture, caching,
diagnostics, all eight validation commands, hosting and the high-score API.

### What is next?

The intended direction is a dedicated website and shared, validated high scores,
followed by broader device testing and preparation for YouTube Playables.
These are future plans, not released features or platform approval.
WebGL remains an option to evaluate with measurements, not a completed migration.

Current limitations include local-only multiplayer, browser-local records,
no saved in-progress run, and no leaderboard separation for level-jump testing.
Music volume persists; other menu settings and game progress do not currently
persist across browser sessions.

## Credits

Maze Biters is developed by **Georgii Cherkin**. Its roots run from the classic
**Hyper Viper for MSX** through his earlier **Palm OS interpretation**, created
around twenty years before this browser project.

The sound design and underlying music compositions are Georgii's. The present
soundtrack was developed with **Suno**, drawing on his earlier game music.
Development assistance: **OpenAI Codex**.

This repository is the newer Maze Biters game. The separately preserved
[earlier graphics version](https://tcherkin.github.io/hyper-viper-remastered/)
is **v0.99.49.64**, before the new snake artwork.

## Rights and licence

No open-source licence has been granted for this project. The public repository
does not grant a general licence to reuse or redistribute the code, artwork,
music or sounds. Existing rights and applicable third-party terms remain in
effect; contact the project owner before reuse.
