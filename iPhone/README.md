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

## Mobile memory safeguards

The rendering surface is bounded to 2868 × 1320 in landscape, preserving the
viewport aspect ratio. A browser reporting physical pixels as CSS pixels cannot
multiply that size again by its Retina scale. Fractional viewport jitter does
not repeatedly recreate the drawing buffer. The default remains native detail;
these safeguards do not switch quality automatically.

Record-board artwork is loaded only when the board or name-entry screen is
requested, then released on leaving it. The next maze is still prepared in
advance, using lossless packed working chunks instead of two simultaneous full
optical fields. The artwork, light formulas and final texture pixels are kept.

The record-screen change avoids **80.85 MB** of unused decoded artwork in native
detail (**20.62 MB** in HD), while retaining the menu's original leader caption.
The six-palette 4K preparation checks reduced explicitly owned optical working
buffers from **210.15 MB to 170.93 MB**, with identical output pixels. These are
specific resource counts, not a measured reduction in Safari's complete RAM.
Native 2868 × 1320 rendering, the high-detail artwork and all effects remain.

`?diagnostic=1` displays local size, lifecycle and resource-accounting diagnostics.
A small bounded session marker remains in this edition's browser storage so
that an interrupted session can be distinguished from an ordinary exit. It is
not uploaded. Resource byte counts are not Safari's complete process memory.
