#!/usr/bin/env node
/**
 * Lossless production pack of the APPROVED revision-5 (2x) Fantasy Biter study.
 * Does not generate artwork, rescale frames, touch legacy atlases or hunters.
 *
 * Usage: node tools/build-fantasy-biters.mjs --source ".../experiments/fantasy-biter-mouth-study"
 * --source is mandatory; its stronger-open/blink assets are read-only inputs.
 * --size-fit wide selects the approved fantasy-biter-size-study assets instead:
 * horizontal 1.125x fit, unchanged height/49 mouth poses/25 eyelid poses.
 * This switch only chooses already baked native pixels; it never resizes them.
 * Optional --output stages the complete pack for validation before deployment.
 * Optional --bright-source selects the original Python atlas builder, whose
 * colour helpers are imported read-only. Default: ../tools/build_mobile_v1016176_player_256_atlas.py.
 * Requires sharp and Python with Pillow/numpy. MAZE_NODE_MODULES / MAZE_PYTHON
 * can override the bundled dependency locations. Only the output pack is written.
 *
 * Reconstruct at native size: draw base, CLEAR mouth rectangle, then replace it
 * with its guarded sheet cell. Replace blink rectangles afterwards. Transform
 * the completed square once; never scale/rotate the separate patch edges.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
if (!option('--source')) throw Error('Required: --source <fantasy-biter-mouth-study directory>');
if (args.some((a, i) => i % 2 === 0 && !['--source', '--bright-source', '--output', '--size-fit'].includes(a))) throw Error('Unknown build option');
const source = path.resolve(option('--source'));
const sizeFitVariant=option('--size-fit');
if(sizeFitVariant!==null&&sizeFitVariant!=='wide')throw Error('Only the approved --size-fit wide variant is supported');
const wide=sizeFitVariant==='wide',mouthRoot=path.join(source,wide?'assets':'assets/stronger-open');
const output = path.resolve(option('--output') || path.join(root, 'assets/fantasy-biters'));
const brightSource = path.resolve(option('--bright-source') || path.join(root, '../tools/build_mobile_v1016176_player_256_atlas.py'));
const bundled = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies');
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); } catch { sharp = require(path.join(process.env.MAZE_NODE_MODULES || path.join(bundled, 'node/node_modules'), 'sharp')); }
const python = process.env.MAZE_PYTHON || path.join(bundled, 'python/python.exe');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const sourceHashes = new Map();
async function readSource(file) {
  const bytes = await fs.readFile(file);
  const key = path.relative(source, file).replaceAll('\\', '/');
  sourceHashes.set(file, {file: key, sha256: sha256(bytes), bytes: bytes.length});
  return bytes;
}
const mouthManifest = JSON.parse(await readSource(path.join(mouthRoot, 'manifest.json')));
const blinkManifest = JSON.parse(await readSource(path.join(source, 'assets/blink/manifest.json')));
assert.equal(mouthManifest.artRevision, 5, 'Do not pack an obsolete mouth experiment');
assert.equal(mouthManifest.amplitudeScale, 2, 'Use the approved doubled mouth travel');
assert.equal(mouthManifest.walkingStrength, .5, 'Do not double the normalized movement rhythm too');
assert.equal(mouthManifest.frames, 49);
assert.equal(blinkManifest.mouthRevision, wide?5:4);
assert.equal(blinkManifest.frames, 25);
if(wide){
  for(const [label,manifest] of [['mouth',mouthManifest],['blink',blinkManifest]]){
    assert.equal(manifest.sizeFit?.scaleX,1.125,`${label}: use the approved 12.5% wider fit`);
    assert.equal(manifest.sizeFit?.scaleY,1,`${label}: preserve the original height`);
    assert.deepEqual(manifest.sizeFit?.pivot,[.5,.5],`${label}: preserve the centered pivot`);
  }
  assert.deepEqual(mouthManifest.sizeFit,blinkManifest.sizeFit,'The mouth and eyes must use exactly the same size fit');
  assert.deepEqual(mouthManifest.palettes,['p1','p2','ai']);
  assert.deepEqual(mouthManifest.directions,['right','down','left','up']);
}
const brightSourceBytes = await fs.readFile(brightSource);
const brightText = brightSourceBytes.toString('utf8');
assert.match(brightText, /power_chain = \(\("brightness", 1\.85\), \("saturate", 1\.7\)\)/);
assert.match(brightText, /GaussianBlur\(radius=12\.0\)/);

// Reuse the original helper functions, including float32 and numpy's round-to-
// even semantics. The white glow uses the original 12/256 apparent radius at
// each native quality. There is deliberately no HD->4K or 4K->HD resize here.
const pythonBright = String.raw`
import sys, runpy
from PIL import Image, ImageFilter
size = int(sys.argv[1])
helpers = runpy.run_path(sys.argv[2], run_name='fantasy_asset_build_reference')
source = sys.stdin.buffer.read()
stride = size * size * 4
if len(source) % stride: raise ValueError('Incomplete native RGBA frame')
for offset in range(0, len(source), stride):
    image = Image.frombytes('RGBA', (size,size), source[offset:offset+stride])
    image = helpers['apply_filter_chain'](image, (('brightness',1.85),('saturate',1.7)))
    glow = Image.new('RGBA', image.size, (255,255,255,0))
    glow.putalpha(image.getchannel('A').filter(ImageFilter.GaussianBlur(radius=12.0*size/256.0)))
    sys.stdout.buffer.write(Image.alpha_composite(glow,image).tobytes())
`;
function brighten(frames, size) {
  const input = Buffer.concat(frames);
  const child = spawnSync(python, ['-c', pythonBright, String(size), brightSource], {
    input, maxBuffer: Math.max(input.length * 2, 1024 * 1024), windowsHide: true,
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'},
  });
  if (child.error || child.status !== 0) throw Error(`Original bright transform failed: ${child.error || child.stderr?.toString()}`);
  assert.equal(child.stdout.length, input.length, 'Bright batch dimensions');
  const stride = size * size * 4;
  return frames.map((_, i) => Buffer.from(child.stdout.subarray(i * stride, (i + 1) * stride)));
}
function crop(data, width, box) {
  const result = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const i = ((box.y + y) * width + box.x) * 4;
    data.copy(result, y * box.width * 4, i, i + box.width * 4);
  }
  return result;
}
function paste(target, size, data, box) {
  for (let y = 0; y < box.height; y++) data.copy(target, ((box.y + y) * size + box.x) * 4, y * box.width * 4, (y + 1) * box.width * 4);
}
function mirror(data, size) {
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, j = (y * size + size - x - 1) * 4;
    data.copy(out, i, j, j + 4);
  }
  return out;
}
function changedBox(frames, size) {
  let left = size, top = size, right = -1, bottom = -1;
  for (let f = 1; f < frames.length; f++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (frames[f][i] !== frames[0][i] || frames[f][i+1] !== frames[0][i+1] || frames[f][i+2] !== frames[0][i+2] || frames[f][i+3] !== frames[0][i+3]) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? {x:0,y:0,width:1,height:1} : {x:left,y:top,width:right-left+1,height:bottom-top+1};
}
function guardedSheet(frames, size, box, columns) {
  const cellWidth = box.width + 2, stride = box.height + 2;
  const rows = Math.ceil(frames.length / columns), width = cellWidth * columns, height = stride * rows;
  const pixels = Buffer.alloc(width * height * 4);
  for (let f = 0; f < frames.length; f++) for (let y = 0; y < stride; y++) for (let x = 0; x < cellWidth; x++) {
    const sx = box.x + Math.max(0, Math.min(box.width-1, x-1));
    const sy = box.y + Math.max(0, Math.min(box.height-1, y-1));
    const i = (sy * size + sx) * 4;
    const j = ((Math.floor(f/columns) * stride + y) * width + (f%columns) * cellWidth + x) * 4;
    frames[f].copy(pixels, j, i, i+4);
  }
  return {pixels, width, height, columns, rows, stride, cellWidth};
}
function extractSheetCell(sheet, descriptor, frame) {
  return crop(sheet.pixels, sheet.width, {
    x: (frame % descriptor.columns) * descriptor.cellWidth + 1,
    y: Math.floor(frame / descriptor.columns) * descriptor.stride + 1,
    width: descriptor.width, height: descriptor.height,
  });
}
const qa = {normalMouthFramesExact:0, brightMouthFramesExact:0, blinkFramesExact:0, mirroredLeftFramesExact:0, guardPixelsExact:0, pngRoundTripsExact:0, sourceFilesUnchanged:0};
async function writePng(spec, relative, pixels, width, height) {
  const file = path.join(output, relative);
  await fs.mkdir(path.dirname(file), {recursive:true});
  await sharp(pixels, {raw:{width,height,channels:4}}).png({compressionLevel:9}).toFile(file);
  const roundTrip = await sharp(file).ensureAlpha().raw().toBuffer();
  assert.deepEqual(roundTrip, pixels, `PNG changed RGBA: ${relative}`);
  qa.pngRoundTripsExact++;
  spec.decodedBytes += pixels.length;
  spec.encodedBytes += (await fs.stat(file)).size;
  spec.files.push({file:relative,width,height,decodedBytes:pixels.length,sha256:sha256(await fs.readFile(file))});
}
async function packPatches(spec, relative, frames, size, box, columns) {
  const sheet = guardedSheet(frames,size,box,columns);
  const descriptor = {...box,stride:sheet.stride,cellWidth:sheet.cellWidth,columns,frames:frames.length,guard:1,file:relative};
  // Validate every edge/corner guard, not only the inner source rectangles.
  for (let f=0; f<frames.length; f++) for (let y=0; y<sheet.stride; y++) for (let x=0; x<sheet.cellWidth; x++) {
    if (x!==0 && x!==sheet.cellWidth-1 && y!==0 && y!==sheet.stride-1) continue;
    const src=((box.y+Math.max(0,Math.min(box.height-1,y-1)))*size+box.x+Math.max(0,Math.min(box.width-1,x-1)))*4;
    const dst=((Math.floor(f/columns)*sheet.stride+y)*sheet.width+(f%columns)*sheet.cellWidth+x)*4;
    assert.deepEqual(sheet.pixels.subarray(dst,dst+4),frames[f].subarray(src,src+4)); qa.guardPixelsExact++;
  }
  await writePng(spec,relative,sheet.pixels,sheet.width,sheet.height);
  return {descriptor,sheet};
}
async function readMouthFrames(profile, palette, direction) {
  const p = mouthManifest.profiles[profile], file = path.join(mouthRoot,p.sheets[`${palette}:${direction}`]);
  const {data,info} = await sharp(await readSource(file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,p.size*7); assert.equal(info.height,p.size*7);
  return Array.from({length:49},(_,f)=>crop(data,info.width,{x:f%7*p.size,y:Math.floor(f/7)*p.size,width:p.size,height:p.size}));
}
async function readBlinkFrames(profile,palette,direction,base) {
  const spec = blinkManifest.profiles[profile], regions = spec.poses[`${palette}:${direction}`] || [];
  const frames = Array.from({length:25},()=>Buffer.from(base));
  for (const region of regions) {
    const {data,info} = await sharp(await readSource(path.join(source,'assets/blink',region.file))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,region.width+2); assert.equal(info.height,region.stride*24);
    for(let f=1;f<25;f++) paste(frames[f],spec.size,crop(data,info.width,{x:1,y:(f-1)*region.stride+1,width:region.width,height:region.height}),region);
  }
  return {frames,regions:regions.map(({x,y,width,height})=>({x,y,width,height}))};
}
const manifest = {
  schemaVersion:1,artRevision:5,amplitudeScale:2,blinkArtRevision:blinkManifest.mouthRevision,rig:mouthManifest.rig,frames:49,blinkFrames:25,palettes:['p1','p2','ai'],directions:['right','down','left','up'],
  closure:mouthManifest.closure,walkingStrength:mouthManifest.walkingStrength,
  scope:'Player P1/P2/AI only. Legacy characters, hunters, sprites, movement and lighting code are not modified by this builder.',
  source:wide?'Approved size-study horizontal 1.125x fit; revision-5 doubled mouth travel and matching 25-pose fitted eyelids. Lossless native packing; no runtime resizing or warping.':'Approved stronger-open revision 5 (2x lower-lip travel) and unchanged revision-4 blink eye patches. Lossless native packing; no runtime warping.',
  ...(wide?{sizeFit:mouthManifest.sizeFit,sourceArtVariant:'size-fit-wide'}:{}),
  packing:'Native base + cleared/replaced bounded RGBA patch. Every sheet includes index 0; 1px replicated guards; transform complete sprite once.',
  bright:{brightness:1.85,saturation:1.7,whiteGlowRadiusPer256:12,application:'Original numpy/Pillow RGB helpers, then original white alpha glow at scaled native radius; no palette recolouring.',reference:'../tools/build_mobile_v1016176_player_256_atlas.py',referenceSha256:sha256(brightSourceBytes)},
  directionToOriginalBank:{up:1,right:2,down:3,left:4},profiles:{},qa,
};
for (const profile of ['hd','4k']) {
  const size=mouthManifest.profiles[profile].size;
  assert.equal(size,profile==='hd'?80:160);
  const spec=manifest.profiles[profile]={size,decodedBytes:0,encodedBytes:0,fullMouthSheetsEquivalentBytes:size*size*4*49*24,sets:{},files:[]};
  for (const palette of manifest.palettes) {
    let rightNormals=null;
    for (const direction of manifest.directions) {
      const frames=await readMouthFrames(profile,palette,direction);
      if(direction==='right')rightNormals=frames;
      if(direction==='left')for(let f=0;f<49;f++) {assert.deepEqual(frames[f],mirror(rightNormals[f],size));qa.mirroredLeftFramesExact++;}
      const eyes=await readBlinkFrames(profile,palette,direction,frames[0]);
      const bright=brighten([...frames,...(eyes.regions.length?eyes.frames:[])],size);
      for(const light of ['normal','bright']) {
        const sourceFrames=light==='normal'?frames:bright.slice(0,49);
        const eyeFrames=light==='normal'?eyes.frames:bright.slice(49);
        const key=`${palette}:${light}:${direction}`,stem=`${profile}/${palette}-${light}-${direction}`;
        const base=`${stem}-open.png`,closed=`${stem}-bite.png`;
        await writePng(spec,base,sourceFrames[0],size,size);
        await writePng(spec,closed,sourceFrames[48],size,size);
        const box=changedBox(sourceFrames,size);
        const packed=await packPatches(spec,`${stem}-mouth.png`,sourceFrames,size,box,7);
        const set=spec.sets[key]={base,closed,mouth:packed.descriptor,blink:[]};
        for(let f=0;f<49;f++) {
          const restored=Buffer.from(sourceFrames[0]); paste(restored,size,extractSheetCell(packed.sheet,packed.descriptor,f),box);
          assert.deepEqual(restored,sourceFrames[f],`Mouth reconstruction ${profile} ${key} ${f}`);
          qa[light==='normal'?'normalMouthFramesExact':'brightMouthFramesExact']++;
        }
        if(eyes.regions.length) {
          // Blink never changes alpha. Its local colour replacement therefore
          // remains exact even after the original white power-glow operation.
          for(const region of eyes.regions) for(const pose of sourceFrames)
            assert.deepEqual(crop(pose,size,region),crop(sourceFrames[0],size,region),`Blink area must be rigid in all mouth poses: ${key}`);
          const packs=[];
          for(let n=0;n<eyes.regions.length;n++) {
            const eye=await packPatches(spec,`${stem}-blink-${n}.png`,eyeFrames,size,eyes.regions[n],1);
            set.blink.push(eye.descriptor); packs.push(eye);
          }
          for(let f=0;f<25;f++) {
            const restored=Buffer.from(sourceFrames[0]);
            for(const p of packs)paste(restored,size,extractSheetCell(p.sheet,p.descriptor,f),p.descriptor);
            assert.deepEqual(restored,eyeFrames[f],`Blink reconstruction ${profile} ${key} ${f}`);qa.blinkFramesExact++;
          }
        }
        if(direction==='left') {
          const rightKey=`${palette}:${light}:right`;
          set.blinkMirror=rightKey;
          set.blink=spec.sets[rightKey].blink.map(p=>({...p,x:size-p.x-p.width,mirrorX:true}));
        }
      }
      console.log(`Packed and verified ${profile} ${palette} ${direction}`);
    }
  }
  spec.savingsVersusFullMouthSheetsPercent=100*(1-spec.decodedBytes/spec.fullMouthSheetsEquivalentBytes);
  spec.runtimeScratchBytesPerActor=size*size*4;
}
for(const [file,entry] of sourceHashes) {
  assert.equal(sha256(await fs.readFile(file)),entry.sha256,`Source modified during pack: ${file}`);qa.sourceFilesUnchanged++;
}
assert.equal(sha256(await fs.readFile(brightSource)),manifest.bright.referenceSha256);
manifest.inputs=[...sourceHashes.values()];
manifest.qa.passed=true;
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({qa,profiles:Object.fromEntries(Object.entries(manifest.profiles).map(([p,s])=>[p,{decodedBytes:s.decodedBytes,encodedBytes:s.encodedBytes,savingsPercent:s.savingsVersusFullMouthSheetsPercent}]))},null,2));


