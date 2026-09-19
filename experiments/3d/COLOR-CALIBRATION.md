# Video color calibration — 0.3.46

The old recording pipeline darkened the game during Edge playback. The selected pipeline now closely matches a direct PNG of the **same frozen scene**. This is a recording change; no exposure, lamps, materials, or game brightness were adjusted to compensate.

## Controlled comparison

`tools/check-biter-color.cjs` serves the archived Crystal Biter v3 model and gait, freezes the original concept maze at time 1000, and fixes the player, snakes, camera, reflections, viewport (1920×1080), DPR (1), and `lighting=current`. It settles 90 render passes, then holds rendering stationary. The camera uses projection 50%, tilt 55°, and zoom 1.5×.

For each of the `before` and `balanced` presets, it captures a direct PNG, a native screencast JPEG at quality 95, and another PNG. **The two PNGs are pixel-identical for both presets.** Three one-second H.264 clips are encoded from that exact JPEG: the reproduced old pipeline, a BT.709-transfer candidate, and the selected sRGB-transfer pipeline. Existing v2/v3 recordings are untouched.

Each clip is decoded back to RGB with FFmpeg and separately played in headless Microsoft Edge. The actual browser screenshot is taken at native dimensions after playback advances, with video controls and overlays absent. Measurements exclude the HUD. Pause curtains are hidden; no image scaling or scene changes are involved.

## Measured results

Values below are 8-bit code-value errors against the direct PNG. MAE averages absolute R/G/B differences. “Dark bias” is the signed, weighted RGB difference for source pixels with luma between 3 and 40. Saturated pixels have maximum channel >55 and channel spread >40; these are overlapping subsets, not physical luminance measurements.

| `before` preset | All-pixel MAE | Dark MAE | Dark bias | Saturated MAE |
| --- | ---: | ---: | ---: | ---: |
| Source JPEG95 | 1.243 | 0.989 | +0.048 | 4.106 |
| Old pipeline, FFmpeg RGB decode | 1.534 | 1.308 | −0.818 | 4.487 |
| Old pipeline, **Edge playback** | 11.211 | 12.026 | **−10.832** | 8.681 |
| Selected pipeline, inverse RGB decode | 1.539 | 1.180 | +0.028 | 5.446 |
| Selected pipeline, **Edge playback** | **1.545** | **1.182** | **−0.047** | **5.486** |

For `balanced`, selected Edge playback gives all-pixel MAE **1.538**, dark MAE **1.186**, dark bias **−0.047**, and saturated MAE **5.344**. The source JPEG already contributes saturated MAE **4.009**. JPEG and 4:2:0 video remain lossy; the correction preserves brightness but does not make recordings pixel-identical to PNGs.

The alternative that actually converted sRGB transfer to BT.709 transfer inverse-decoded accurately (dark bias +0.013), yet Edge playback brightened dark pixels by **+11.666**. It was rejected based on playback evidence. An accurate FFmpeg round trip alone is insufficient.

Changing the frozen scene from `before` to `balanced` changes dark pixels by only +0.045 on average, but saturated pixels by −5.570. Preset choice therefore matters for art comparisons, although it does not explain the old recording's global darkening. The application and gait tool defaults remain **`before`**; the v4 comparison recordings explicitly select **`--look=balanced`**. Each comparison must use the same declared preset and lighting option.

## Actual conversion and metadata

`tools/video-color.cjs` decodes the JPEG's full-range BT.601 YCbCr into floating-point RGB, then converts the matrix and range to limited-range BT.709 YCbCr while retaining the source sRGB transfer function:

```text
scale=in_range=pc:out_range=pc:in_color_matrix=bt601,
format=gbrpf32le,
zscale=matrixin=gbr:rangein=full:primariesin=709:transferin=iec61966-2-1:matrix=709:range=limited:primaries=709:transfer=iec61966-2-1:dither=error_diffusion,
format=yuv420p
```

The encoded MP4 and WebM tags are `color_range=tv`, `color_space=bt709`, `color_primaries=bt709`, and `color_transfer=iec61966-2-1`. These describe converted samples; this is **not merely retagging**. The transfer is sRGB, not BT.709. H.264 CRF18 MP4 is the compatibility playback copy; both formats originate independently from the JPEG frames.

The reproduced old file reports `yuvj420p`, full range (`pc`), BT.470BG matrix, and unspecified transfer/primaries. **Full range alone is not a defect or a proven cause.** The evidence establishes an end-to-end mismatch in that old recording/playback path, not a universal rule about full-range video.

## Reproduce and limits

With the local server running and the existing runtime dependencies and FFmpeg available:

```powershell
node experiments/3d/tools/check-biter-color.cjs
node experiments/3d/tools/check-biter-gait.cjs --video --mp4-only --previous --look=balanced --lighting=current
node experiments/3d/tools/check-biter-gait.cjs --video --mp4-only --look=balanced --lighting=current
```

Use `--lighting=contrast` for the second pair; omit `--mp4-only` to also encode WebM. Run GPU captures sequentially. The calibration writes ignored `preview-v4-color-*` PNG/JPEG/MP4 files and `preview-v4-color-report.log`, containing the snapshot, camera matrices, archived model hash, metadata, and all errors. New gait artifacts use `preview-biter-v4-gait-v3/v4-current/contrast` prefixes; previous recordings are preserved.

The empirical guarantee covers the tested Edge/SDR capture path at native size. Other video players, display profiles, HDR settings, scaling, and browser versions can differ. Playback overlays and controls can also obscure or alter a screenshot comparison. Direct PNG captures remain the reference for material and lighting judgments.
