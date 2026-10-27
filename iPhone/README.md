# Maze Biters — iPhone Web

[Play iPhone Web](https://tcherkin.github.io/maze-biters/iPhone/)

A separate landscape Unity WebGL edition for iPhone. The game and starfield fill
the viewport provided by Safari or Kiosker without stretching the characters.
The menu preserves its designed proportions. Open the link in Kiosker and use
landscape orientation; Kiosker controls whether its own interface is visible.

On iPhone 17 Pro Max the high-detail setting renders at the native **2868 × 1320**
resolution. The existing **4K** menu label selects this high-detail artwork; it
does not mean a forced 3840 × 2160 canvas on the phone. **HD** uses **1434 × 660**.
Camera framing follows the available viewport. All six game modes, animations,
lighting, glass palettes and audio are retained.

Tap **Начало** to allow audio and load the game. Menu resources load first;
remaining gameplay resources prepare while the menu operates. An early mode
selection keeps blinking until its prepared level is ready. Use the touch
movement controls; compatible keyboard/controller input is also retained. The
page provides Pause and Menu controls. Scores and settings are separate from
the PC and iPad editions.

The actual Kiosker/iPhone hardware result should be checked on the device. Browser
preview checks do not establish performance or controller compatibility on every
phone. This release does not replace the native iPad or PC projects.

## Rebuilding

Download [the source archive](Source/maze-biters-iphone-web-source.zip).
It includes the independent Unity project, shaders, scripts and reconstruction
tools. Existing immutable artwork packs are shared with the PC web edition to
keep the combined GitHub Pages site within its size limit. The iPhone release
manifest records their exact paths, byte counts and SHA256 fingerprints.

Original audio source files are restored from a fixed Git commit with their exact
SHA256 hashes, instead of duplicating them in this archive. Compiled game audio
is already in this edition's runtime; players do not fetch source audio from Git.
See `DEPLOYMENT.md` in the archive for the reconstruction and build commands.

The original browser game, `/PC/` and `/iPad/` remain unchanged.
