// The two authored cells share ONE cached image and ONE uniform transform.
// No warp, per-part scaling, alpha fade, clipping edge, or runtime pixel reads.
import {drawPlayerMouth} from '../snake-bite-study/player-mouth-art.js';

export function createScorpionBiteArt(atlas, makeCanvas, bentArt = null) {
  if ((atlas.naturalWidth || atlas.width) !== 2560 || (atlas.naturalHeight || atlas.height) !== 160)
    throw Error('Неочакван размер на оригиналния скорпион.');
  const frames = [0, 1].map(frame => {
    const sheet = makeCanvas(320, 160), c = sheet.getContext('2d');
    if (!c) throw Error('Графичният слой на скорпиона не е наличен.');
    const headX = (frame * 8 + 2) * 160;
    c.drawImage(atlas, headX + 160, 0, 160, 160, 0, 0, 160, 160);
    c.drawImage(atlas, headX, 0, 160, 160, 160, 0, 160, 160);
    return sheet;
  });
  return Object.freeze({
    draw(c, pose) {
      if (!pose.visible || pose.scale <= 0) return;
      if (pose.renderMode === 'bent') {
        if (!bentArt) throw Error('Bent scorpion artwork is not loaded');
        // Preserve the running accepted turn and its native leg clock. Only
        // the common outer transform consumes the curved specimen as a whole.
        c.save(); c.translate(pose.x, pose.y); c.scale(pose.scale, pose.scale);
        c.translate(-pose.transformAnchor.x, -pose.transformAnchor.y);
        bentArt.draw(c, pose.bentPose); c.restore();
        return;
      }
      c.save();
      c.translate(pose.x, pose.y); c.rotate(pose.angle);
      c.scale(pose.scale, pose.scale);
      c.drawImage(frames[pose.frame & 1], -36, -18, 72, 36);
      c.restore();
    },
    stats: Object.freeze({cachedFrames: 2, drawCalls: 1, uniformScale: true, runtimePixelReads: false,
      maximumBentDrawCalls: bentArt?.stats.maximumDrawCalls ?? 0})
  });
}

export function drawEncounter(c, state, art, mouths, instant = false) {
  // Player foreground is the natural occluder, as in the accepted head bite.
  if (!(instant && state.consumed)) art.draw(c, state.scorpion);
  const p = state.player;
  c.save(); c.translate(p.x, p.y);
  drawPlayerMouth(c, mouths, p.bank, p.closure, p.size);
  c.restore();
}
