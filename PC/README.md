# Maze Biters — PC Web

An independent Unity WebGL2 edition of the widescreen PC version of Maze Biters.

[Play PC Web](https://tcherkin.github.io/maze-biters/PC/) ·
[iPad Web edition](https://tcherkin.github.io/maze-biters/iPad/) ·
[Original browser game](https://tcherkin.github.io/maze-biters/)

The game uses a 16:9 viewport. HD renders at 1920 × 1080 and 4K at 3840 × 2160,
using the existing artwork. The view fits the browser area without stretching
characters. The original menu keeps its own proportions within that view.

In SOLO, use the arrow keys or WASD to move. With two local players, player 1
uses WASD and player 2 uses the arrow keys. Compatible controllers are also
supported. Enter confirms a menu choice, P pauses, and Escape returns from a
game to the menu. The page also provides Pause, Menu and Full Screen controls.
Browsers may reserve Escape for leaving full screen first.

The first visit downloads the Unity runtime and artwork. Menu resources load
first; gameplay preparation continues while the menu operates. Selecting a mode
before its level is ready keeps the confirmation blinking until it can start.
Browsers require a click or key gesture to allow sound.

Scores and settings use storage dedicated to this PC Web edition. They do not
read or overwrite the iPad edition or original browser game's saved data.
Storage belongs to the current browser profile; clearing site data removes it.
Browser, GPU, memory and selected resolution affect performance. A web build
does not guarantee the same performance as the native Windows application.

## Source and rebuilding

Download [the Unity source archive](Source/maze-biters-pc-web-source.zip).
It contains the isolated project, scripts, shaders, original audio sources and
build tools. Runtime artwork is stored losslessly in the published
`StreamingAssets/WebPayload` packs instead of duplicated in the source ZIP.

Extract the archive, keep the `platforms/pc-web` layout, then run its
`restore-source-assets.py` against this release's `StreamingAssets/WebPayload`
directory. The script verifies pack and individual-file SHA256 hashes before
restoring the source files. Build instructions are included in the archive.

The native PC game, native iPad project, iPad Web edition and original browser
game remain independent of this edition.
