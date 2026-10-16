// Per-module cache versions are intentional: unchanged artwork/rigs retain
// their URLs. Pin both their URL versions and normalized source content so a
// release check cannot silently accept a stale cache key after a source edit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=new URL('./fixtures/runtime-cache-contract.json',import.meta.url);
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const digest=file=>createHash('sha256').update(read(file).replaceAll('\r\n','\n')).digest('hex');
const release=()=>read('index.html').match(/<title>Maze Biters v([\d.]+)<\/title>/)?.[1];
function resolve(specifier,importer){
  const url=new URL(specifier,pathToFileURL(path.join(root,importer)));
  assert.equal(url.protocol,'file:','Runtime imports must remain local');
  const file=path.relative(root,fileURLToPath(url)).split(path.sep).join('/');
  assert.ok(!file.startsWith('../')&&!path.isAbsolute(file),'Runtime reference must stay in the repository');
  return {file,version:url.searchParams.get('v')};
}
let contract;
export function assertRuntimeCacheReference(specifier,importer){
  contract??=JSON.parse(fs.readFileSync(fixture,'utf8'));
  assert.equal(contract.release,release(),'Cache contract must identify this release');
  const {file,version}=resolve(specifier,importer),expected=contract.modules[file];
  assert.ok(expected,`Missing cache contract for ${file}`);
  assert.ok(expected.versions.includes(version),`${importer}: unapproved cache URL ${specifier}`);
  assert.equal(digest(file),expected.sha256,`${file}: source changed; review its cache URL and regenerate the contract`);
}
// Explicit maintenance command, never executed by validation/importing.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)&&process.argv.includes('--write')){
  const modules={},visited=new Set();
  function visit(specifier,importer){
    const {file,version}=resolve(specifier,importer);
    // Newly introduced immutable helpers also use plain URLs. Their exact
    // content is pinned just like versioned modules; null is explicit.
    if(version!==null)assert.match(version,/^\d+\.\d+\.\d+\.\d+(?:-[a-z0-9-]+)?$/,`${importer}: invalid cache version ${specifier}`);
    const record=modules[file]??={sha256:digest(file),versions:[]};
    if(!record.versions.includes(version))record.versions.push(version);
    if(visited.has(file))return;
    visited.add(file);
    // The pinned Pixi bundle is self-contained. Its documentation contains
    // illustrative bare imports, not runtime dependencies.
    if(file==='src/render/gpu/vendor/pixi.mjs')return;
    for(const match of read(file).matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g))
      visit(match[1],file);
  }
  for(const match of read('index.html').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g))visit(match[1],'index.html');
  const sorted=Object.fromEntries(Object.entries(modules).sort(([a],[b])=>a.localeCompare(b)));
  fs.writeFileSync(fixture,JSON.stringify({release:release(),modules:sorted},null,2)+'\n');
  console.log(`Pinned ${visited.size} runtime modules for ${release()}`);
}
