// Browser screencast JPEGs contain full-range BT.601 YCbCr of sRGB pixels.
// Convert the actual samples through RGB into limited-range BT.709 YCbCr;
// preserve the source sRGB transfer function and label it explicitly. This
// matches native Edge playback of the frozen-scene PNG, including dark floor
// detail. Merely setting tags on the original JPEG samples is insufficient.
function colorPipeline(transfer){
  return Object.freeze({
    encodeFilter:[
      'scale=in_range=pc:out_range=pc:in_color_matrix=bt601',
      'format=gbrpf32le',
      `zscale=matrixin=gbr:rangein=full:primariesin=709:transferin=iec61966-2-1:matrix=709:range=limited:primaries=709:transfer=${transfer}:dither=error_diffusion`,
      'format=yuv420p'
    ].join(','),
    decodeFilter:[
      `zscale=matrixin=709:rangein=limited:primariesin=709:transferin=${transfer}:matrix=gbr:range=full:primaries=709:transfer=iec61966-2-1:dither=error_diffusion`,
      'format=gbrpf32le','format=rgb24'
    ].join(','),
    tags:Object.freeze(['-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc',transfer==='709'?'bt709':transfer])
  });
}
const videoColor=colorPipeline('iec61966-2-1');
// Kept only for the diagnostic's rejected alternative: its FFmpeg round trip
// is close, but actual Edge compositing noticeably brightens these dark scenes.
const rec709Candidate=colorPipeline('709');
module.exports={videoColor,rec709Candidate};
