# Animation stability correction — v1.01.96.00

Native cell-based actor collisions are again the default authority. The new
snake, mouth and scorpion animations remain enabled, including gradual tail
shortening, body splits and final-head consumption. Original effects, scoring,
lives, AI movement and control rotation remain in use.

## Reproduced defects and corrections

- A legal snake move into the cell vacated by its own tail repeats a coordinate
  in the route. Coordinate-only projection confused the new head with the old
  tail, collapsing the visible curve. Route anchors now identify occurrences.
- Forward material interpolation cut through the inside of tight corners and
  shortened the body unnaturally. A guarded arclength window now travels along
  one rounded route, retaining three historical cells behind the tail. Existing
  reverse/incompatible transitions retain their continuity-preserving fallback.
- Rounded initial bodies use their physical arc length, rather than allocating
  extra straight-cell length outside the tail. Early commits capture the actual
  compressed tail position so a change in cadence cannot reset it backwards.
- The experimental contact latch now rechecks a new approaching movement and
  changed touching segment. Separating movement and cooperative release have
  independent regressions. Numerical threshold comparisons tolerate only
  coordinate-scaled floating-point error.
- Experimental failure recovery never rewinds the clock before already committed
  collision events; a partial callback still requires restart.

The supplied video showed pass-through and a recovery screen, but its original
JavaScript stack was unavailable. These are independently reproduced defects,
not a claim that the exact recorded exception has been identified.

## Contact-mode boundary

Normal play uses native grid collisions even when all animated geometry is
ready. Local developers may explicitly select `?contacts=experimental` on
localhost. That mode remains unsuitable as the release default: strict
separation/rearm search can still exhaust its work budget around nearly tangent
contacts. No silent mid-frame switch between collision authorities is performed.

Cell collisions are not pixel collisions. Animated outlines can touch or overlap
before a cell event fires, and logical events can precede the corresponding
drawn endpoint. This established tradeoff is accepted for the stability fallback.

## Regression coverage

`test-live-snake-grid.mjs` covers repeated legal vacating-tail entry, short
corners, curved spawns and changing native cadence. `test-live-snake-retreat.mjs`
covers reverse corners and direction changes. Actual-art tests cover all five
native palettes and gradual bites/splits. `test-contact-rules.mjs` verifies
default native authority plus explicit local opt-in; `test-contact-update.mjs`
executes the real update/resolver sequence for blocked, approaching and separating
actors. Kernel/runtime/bridge tests preserve experimental failure diagnostics.

Automated tests are supplemented by local full-engine playthroughs; they do not
establish correctness for every possible level, device or crowded contact.
The v1.01.95 integration document is retained as historical context, not current
collision-mode documentation. This change does not publish the website.
