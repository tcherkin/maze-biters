import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {removeGpuPresentation} from './gpu-presentation-contract.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const manifest=JSON.parse(read('src/render/gpu/vendor/manifest.json'));
for(const [file,pin]of Object.entries(manifest.files)){
 const data=fs.readFileSync(new URL('../src/render/gpu/vendor/'+file,import.meta.url));
 assert.equal(data.length,pin.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),pin.sha256);
}
const loader=read('src/render/animation-loader.js'),runtime=read('src/render/gpu/runtime.js');
assert.ok(loader.indexOf("import('./gpu/runtime.js")<loader.indexOf("import('./animation-runtime.js"));
assert.ok(loader.includes("get('renderer')!=='canvas'"));
assert.ok(loader.includes('globalThis.__gpu2d=null'));
assert.ok(runtime.includes("instanceof WebGL2RenderingContext"));
assert.ok(runtime.includes("gpu.clearUploads()"));
assert.ok(runtime.includes("url.searchParams.set('renderer','canvas')"));
removeGpuPresentation(read('src/engine/game.js'));
assert.ok(read('src/render/dusk-lighting.js').includes('gpu=null'));
assert.ok(read('src/render/fantasy-player-art.js').includes("resident=!!ctx.canvas?._gpu"));
assert.ok(read('src/render/fantasy-player-turn.js').includes("poseTargets={native:null,gpu:null}"));
console.log('PASS pinned local Pixi distribution, Canvas fallback, exact GPU boundaries and separate native tutorial painters.');
