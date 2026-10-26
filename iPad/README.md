# Maze Biters — iPad Web

An independent Unity WebGL2 edition based on the iPad version of Maze Biters.

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
