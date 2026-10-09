import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Dependency-free packaging check: no browser, native Canvas or npm install.
// Walk the actual module entry, not a hand-maintained list of study files.
const root = fileURLToPath(new URL('../', import.meta.url));
const entry = 'src/render/animation-loader.js';
const engine = 'src/engine/game.js';
const failures = [], visited = new Set(), assets = new Set(), edges = [];
const display = full => path.relative(root, full).split(path.sep).join('/');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('index.html');
const release = html.match(/<title>Maze Biters v([\d.]+)(?:[^<]*)<\/title>/)?.[1];
assert.ok(release, 'HTML title must identify the game release');
assert.ok(read(engine).startsWith(`// Maze Biters v${release}`),
  'Engine header and HTML title must identify the same release');

function check(condition, message) { if (!condition) failures.push(message); }
function localURL(specifier, importer) {
  let resolved;
  try { resolved = new URL(specifier, pathToFileURL(path.join(root, importer))); }
  catch { failures.push(`${importer}: invalid URL ${specifier}`); return null; }
  if (resolved.protocol !== 'file:') {
    failures.push(`${importer}: runtime dependency must be local: ${specifier}`);
    return null;
  }
  const file = fileURLToPath(resolved), relative = path.relative(root, file);
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    failures.push(`${importer}: dependency escapes project root: ${specifier}`);
    return null;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    failures.push(`${importer}: missing dependency ${specifier}`);
    return null;
  }
  return {url: resolved, file, relative: display(file)};
}
function versioned(reference, importer, specifier) {
  check(reference.url.searchParams.get('v') === release,
    `${importer}: ${specifier} must use ?v=${release}`);
}

const moduleScripts = [...html.matchAll(/<script\b([^>]*)>/gi)].flatMap(match => {
  const attributes = Object.fromEntries([...match[1].matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)]
    .map(attribute => [attribute[1].toLowerCase(), attribute[3]]));
  return attributes.type === 'module' && attributes.src ? [attributes.src] : [];
});
const loaderScripts = moduleScripts.filter(source => source.split(/[?#]/)[0] === entry);
check(loaderScripts.length === 1, `index.html must load exactly one module entry ${entry}`);
for (const source of loaderScripts) {
  const resolved = localURL(source, 'index.html');
  if (resolved) versioned(resolved, 'index.html', source);
}

function visit(relative) {
  if (visited.has(relative)) return;
  visited.add(relative);
  const source = read(relative);
  // Static from/side-effect imports and literal dynamic imports used by this
  // small ESM graph. No source is executed, and URLs are never fetched.
  const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)];
  for (const match of imports) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) {
      failures.push(`${relative}: runtime import must be relative: ${specifier}`);
      continue;
    }
    const resolved = localURL(specifier, relative);
    if (!resolved) continue;
    edges.push({from: relative, to: resolved.relative});
    check(resolved.file.endsWith('.js'), `${relative}: expected JavaScript dependency ${specifier}`);
    versioned(resolved, relative, specifier);
    if (resolved.file.endsWith('.js')) visit(resolved.relative);
  }
  // Literal import.meta asset URLs are statically verifiable. Dynamically
  // constructed palette URLs remain covered by artwork/renderer tests.
  for (const match of source.matchAll(/\bnew\s+URL\(\s*(["'])([^"']+)\1\s*,\s*import\.meta\.url\s*\)/g)) {
    const resolved = localURL(match[2], relative);
    if (resolved) assets.add(resolved.relative);
  }
}

if (fs.existsSync(path.join(root, entry))) visit(entry);
else failures.push(`Missing module entry ${entry}`);
check(visited.has(engine), 'Module loader must reach the original engine');
check(edges.some(edge => edge.from === entry && edge.to === engine),
  'Module entry must explicitly load the original engine');
for (const service of ['animation-runtime', 'live-snake', 'live-scorpion', 'live-mouth', 'snake-palette', 'live-snake-curve', 'contact-shapes']) {
  check(visited.has(`src/render/${service}.js`), `Runtime graph must include ${service}.js`);
}
for(const service of ['contact-runtime','continuous-contact'])
  check(visited.has(`src/engine/${service}.js`),`Runtime graph must include ${service}.js`);
check([...visited].some(file => file.startsWith('animation-lib/')),
  'Runtime graph must include its local animation library');
// These sprite URLs are assembled from palette/root variables by the loader,
// so the literal-new-URL scan alone cannot prove a deploy contains them.
for(const asset of [
  'animation-lib/snake-ready-v1/authored-snake-turns/assets/head-neck-sheet.png',
  'animation-lib/snake-ready-v1/authored-snake-turns/assets/tail-elbow-sheet-v4.png',
  ...['green','yellow','blue','pink','orange'].map(name=>`assets/atlases/4k/snake-${name}-160.png`)
]){
  check(fs.existsSync(path.join(root,asset)),`Missing constructed runtime artwork URL: ${asset}`);
  assets.add(asset);
}

if (failures.length) {
  console.error(`FAIL animation package v${release}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS animation package v${release}: ${visited.size} JavaScript modules, ` +
    `${edges.length} versioned import edges, ${assets.size} verified artwork URLs; no external runtime dependencies.`);
}
console.log(`Runtime modules:\n${[...visited].sort().join('\n')}`);
if (assets.size) console.log(`Runtime assets:\n${[...assets].sort().join('\n')}`);
