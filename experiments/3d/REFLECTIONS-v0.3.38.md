# v0.3.38 — sharper reflected paving and actors

The reflection projection was checked both as independent physical rays and
as final wall pixels, including perspective and lateral wall faces. The
floor is reflected in the correct place. The fixed 512×96 capture strips
were too coarse for diagonal grout and small reflected heads on a 4K display.

Capture slots now follow the drawing-buffer width: 512×96 through 1600 pixels,
1024×192 through 3000 pixels, and 2048×384 above that. GPU texture limits cap
the size. Each mirror draws only the rectangle needed for its projected size,
with 1.25 samples per screen pixel up to the slot limit. The shader samples
that exact rectangle. This keeps short mirrors inexpensive while giving long
mirrors up to four times the linear resolution. Moving the projection slider
does not recreate the atlas; changing the display-size tier disposes the old
allocation once.

The atlas now clears to transparent black and uses actual surface coverage.
Empty space beyond the finite paving no longer appears as a solid navy
reflection. Real floor/actor samples retain their tint and placement; the
transparent edge is unpremultiplied before compositing over the purple finish.

Verification includes exact physical viewports and sampling rectangles at
DPR 1/1.25/1.5/2, GPU limits, resize/reuse/disposal, and restoration of renderer
state after an interrupted capture. All 38 CPU tests pass. The final-wall
floor-coordinate GPU check passes at 0/50/100% projection and 45°/75° tilt,
including newly visible side walls, with no browser or shader errors.

`check-mirror-detail.cjs` compares one frozen 3840×2160 scene at the low and
high tiers. The top-wall crop visibly resolves grout lost by the 512-wide
capture. World/camera state and the 17 captured planes remain identical.
Only 3.94 million of the 18.87 million reserved atlas pixels are drawn in the
high-tier fixture. On the local RTX 5090 / Edge setup, 30 warmed complete
render frames measured p50/p95 6.2/7.1 ms at the high tier. The low-tier ordered
comparison measured 6.6/10.8 ms; this single run is not evidence of a speedup.
