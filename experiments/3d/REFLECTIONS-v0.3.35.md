# v0.3.35 — smoked purple mirror coating

Mirror side coloration now uses each stone's existing vertex pigment. The
neutral component of reflected radiance gets a darker purple coating; the
remaining chromatic component retains the previous reflection filter. This
keeps colored neon reflections legible while removing the pale silver/brown
floor and studio highlights. The transform, atlas, geometry and capture path
are unchanged. No extra renders, textures or geometry were introduced.

The suspected floor placement issue was checked independently instead of
changing a correct projection. `check-mirror-floor.cjs` retains the actual
instanced paving and temporarily encodes its world coordinates into the raw
linear atlas. Thirty-six samples at 25°/45°/55°, three wall heights and four X
positions agree with camera-ray reflection against the physical plane and
floor mesh intersections. Maximum error is 0.0303 world units, within atlas
sampling/half-float precision. The original floor material, map, tile colors
and geometry are preserved during real captures. No WebGL/browser errors.

`check-wall-mirrors.cjs --frames 30` passes protected floor/top pixels, visible
reflected marker movement, capture safety and stable resource lifecycles.
The screenshots were inspected for dark purple side panels and retained
colored reflections. Floor coordinates were not altered: the visual change
is the mirror coating, not the floor itself.

`check-mirror-stability.cjs` also passes with identical wall pixels across all
priority-hint configurations. `check-cache.cjs` confirms v0.3.35 and all 21
own modules at all four root/subpath entries, including a primed stale cache.
