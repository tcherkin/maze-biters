import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {CONCEPT_MAZE,PLAYER_SPAWN,CONCEPT_SNAKES} from '../maze-layout.mjs';
import {applyPlayerDiagonalPatches} from './diagonal-player.mjs';
import {applySnakeDiagonalPatches} from './diagonal-snakes.mjs';
import {applyRetreatPatches} from './retreat.mjs';
import {applySolitaryRetreatPatches} from './retreat-solitary.mjs';
import {applySnakeTurnPatches} from './snake-turns.mjs';

const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.resolve(directory,'../../src/engine/game.js'),'utf8');
const hash=crypto.createHash('sha256').update(source).digest('hex');
let result=source;
function replaceCount(from,to,count){
  if(result.split(from).length!==count+1) throw new Error(`Upstream boundary changed: ${from.slice(0,100)}`);
  result=result.replaceAll(from,to);
}
const replaceOnce=(from,to)=>replaceCount(from,to,1);
function replaceInSection(start,end,from,to,count){
  if(result.split(start).length!==2||result.split(end).length!==2)
    throw new Error(`Upstream section changed: ${start}`);
  const first=result.indexOf(start),last=result.indexOf(end,first+start.length);
  if(last<0) throw new Error(`Upstream section end changed: ${end}`);
  const section=result.slice(first,last);
  if(section.split(from).length!==count+1) throw new Error(`Upstream contact count changed: ${start}`);
  result=result.slice(0,first)+section.replaceAll(from,to)+result.slice(last);
}
// Only the experimental copy receives the smaller, authored arena. Collision
// queries, pathfinding and respawn all see the same dimensions and wall cells.
replaceOnce('  const TILE = 16, COLS = 36, ROWS = 25;',
  `  const TILE = 16, COLS = ${CONCEPT_MAZE[0].length}, ROWS = ${CONCEPT_MAZE.length};`);
replaceOnce('    maze=selectRatedMazeForLevel(currentLevel);',
  `    maze=${JSON.stringify(CONCEPT_MAZE)};`);
replaceOnce('    {x:1,y:1,dir:{x:0,y:1}},',`    ${JSON.stringify(PLAYER_SPAWN)},`);
// Legacy tutorial diagrams are initialized even though this entry never shows
// them. Their authored offsets need their own buffer, independent of the arena.
replaceOnce("    const grid=Array.from({length:ROWS},()=>Array(COLS).fill('.'));",
  "    const grid=Array.from({length:Math.max(ROWS,TUTORIAL_WORLD_ROWS+TUTORIAL_RENDER_OFFSET_Y)},()=>Array(Math.max(COLS,TUTORIAL_WORLD_COLUMNS+TUTORIAL_RENDER_OFFSET_X)).fill('.'));");
// Scale the shared clock without changing score rules or timer relationships.
replaceOnce('      if(enabled) time+=elapsed*levelSpeedMultiplier();',
  '      if(enabled) time+=elapsed*levelSpeedMultiplier()*experimentSpeed;');
result=applyPlayerDiagonalPatches(result);
result=applySnakeDiagonalPatches(result);
// A diagonal covers sqrt(2) cells. The next decision waits for the distance
// actually travelled, and its visual interval uses the newly chosen edge.
replaceOnce('      const delay = s.reversing ? snakeDelay*2 : snakeDelay;',
  '      const delay = (s.reversing ? snakeDelay*2 : snakeDelay)*(s.experimentStepDistance||1);');
replaceOnce('            s,oldBody,t,delay,oldHeadTravelDirection,',
  '            s,oldBody,t,(wasReversing?snakeDelay*2:snakeDelay)*experimentSnakeTravelLength(oldBody,s.body,wasReversing),oldHeadTravelDirection,');
// Record cell transitions before the 2D sprite-specific snap/hold adjustments.
replaceOnce('    const newBody=s.body.map(p=>({x:p.x,y:p.y}));',
  '    experimentRecordMotion(s,oldBody,t,logicalDelay);\n    const newBody=s.body.map(p=>({x:p.x,y:p.y}));');
// Capture only confirmed eating branches, before their topology changes. Grid
// movement also pops/shifts cells, and ID replacement alone can mean a split.
replaceOnce('    const removedHead=s.body[0];',
  '    experimentRecordBite(s,p,0,\'head\',t);\n    const removedHead=s.body[0];');
replaceOnce('          const removedTail=s.body[s.body.length-1];',
  '          experimentRecordBite(s,p,s.body.length-1,\'tail\');\n          const removedTail=s.body[s.body.length-1];');
replaceOnce('          spawnSnakeBiteBloom(removedTail,s.color,p);',
  '          experimentShortenMotion(s);\n          spawnSnakeBiteBloom(removedTail,s.color,p);');
replaceOnce('        const removedSegment=s.body[idx];',
  '        experimentRecordBite(s,p,idx,\'body\');\n        const removedSegment=s.body[idx];');
replaceCount('spawnSnakeBiteBloom(s.body[0],s.color,p);',
  'experimentRecordBite(s,p,0,\'head\');\n            spawnSnakeBiteBloom(s.body[0],s.color,p);',3);
replaceOnce('      snakes.splice(snakeIndex,1,replacement);',
  '      snakes.splice(snakeIndex,1,replacement);\n      experimentRecordFragments([replacement]);');
replaceOnce('        snakes.splice(si,1,...created);',
  '        snakes.splice(si,1,...created);\n        experimentRecordFragments(created);');
// Only lethal snake-contact branches emit predation. Hunter/rival deaths and
// safe head, power/shield, retreat and reaction-assist branches stay untouched.
replaceInSection('  function checkSnakeContact(p) {','  function scorpionSpawnTileIsClear(x,y){',
  'loseLife(p);','experimentSnakeAttack(s,p);',2);
replaceInSection('  function snakeStep(s,t=gameTimeNow()) {','  function updateSnakeMemory(s,t){',
  'loseLife(victim);','experimentSnakeAttack(s,victim,t);',2);
result=applyRetreatPatches(result);
result=applySolitaryRetreatPatches(result);
result=applySnakeTurnPatches(result);
// This milestone ends on the same board; it cannot populate an unseen next level.
replaceOnce('  function nextLevel() {\n    beginNextLevelTransition();\n  }'.replaceAll('\n',source.includes('\r\n')?'\r\n':'\n'),
  '  function nextLevel() { experimentCompleted=true; }');
replaceOnce('  globalThis.__mazeBitersReady=initializeMazeBiters();',
  fs.readFileSync(path.join(directory,'engine/diagonal.inc.js'),'utf8')+'\n'+
  fs.readFileSync(path.join(directory,'engine/diagonal-snakes.inc.js'),'utf8')+'\n'+
  fs.readFileSync(path.join(directory,'engine/retreat.inc.js'),'utf8')+'\n'+
  fs.readFileSync(path.join(directory,'engine/retreat-solitary.inc.js'),'utf8')+'\n'+
  fs.readFileSync(path.join(directory,'engine/bridge.inc.js'),'utf8')
    .replace('__CONCEPT_SNAKES__',JSON.stringify(CONCEPT_SNAKES)));
result=`// GENERATED by experiments/3d/tools/sync-engine.mjs; edit the generator and engine/*.inc.js inputs.\n// Maze Biters v1.01.93.00 / f2ec88b00589a2631050bf939a0947889810c087\n// Source SHA-256: ${hash}\n${result}`;
new vm.Script(result);
const target=path.join(directory,'engine/maze-biters-experiment.js');
if(process.argv.includes('--check')){
  if(fs.readFileSync(target,'utf8')!==result) throw new Error('Experimental engine snapshot is out of sync');
  console.log(`Experimental engine matches source and bridge (${hash.slice(0,12)}).`);
}else{
  fs.writeFileSync(target,result);
  console.log('Generated isolated engine snapshot. Original engine was not modified.');
}
