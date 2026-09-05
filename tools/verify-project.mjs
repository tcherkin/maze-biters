import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const toolsDirectory=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(toolsDirectory,'..');

const requiredFiles=[
  'index.html',
  'styles/game.css',
  'src/config/render-atlas.js',
  'src/config/audio-assets.js',
  'src/services/high-score-service.js',
  'src/render/dusk-lighting.js',
  'src/render/menu-lighting.js',
  'src/engine/game.js'
];

const runtimeFiles=[...requiredFiles];
const failures=[];

function projectPath(relativePath){
  return path.join(projectRoot,...relativePath.split('/'));
}

function listFiles(directory,extension){
  if(!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const fullPath=path.join(directory,entry.name);
    if(entry.isDirectory()) return listFiles(fullPath,extension);
    return !extension||entry.name.endsWith(extension)?[fullPath]:[];
  });
}

for(const relativePath of requiredFiles){
  if(!fs.existsSync(projectPath(relativePath))){
    failures.push(`Missing required file: ${relativePath}`);
  }
}

const runtimeText=runtimeFiles
  .filter(relativePath=>fs.existsSync(projectPath(relativePath)))
  .map(relativePath=>fs.readFileSync(projectPath(relativePath),'utf8'))
  .join('\n');

const referencePattern=/(?:assets|src|styles)\/[A-Za-z0-9_.\-/]+/g;
const runtimeReferences=[...new Set(runtimeText.match(referencePattern)||[])];
for(const reference of runtimeReferences){
  if(!fs.existsSync(projectPath(reference))){
    failures.push(`Missing runtime reference: ${reference}`);
  }
}

if(/data:(?:image|audio)/i.test(runtimeText)){
  failures.push('Embedded image/audio data URI found in runtime source.');
}

for(const relativePath of [
  'src/config/render-atlas.js',
  'src/config/audio-assets.js',
  'src/services/high-score-service.js',
  'src/render/dusk-lighting.js',
  'src/render/menu-lighting.js',
  'src/engine/game.js'
]){
  const fullPath=projectPath(relativePath);
  if(!fs.existsSync(fullPath)) continue;
  try{
    new vm.Script(fs.readFileSync(fullPath,'utf8'),{filename:relativePath});
  }catch(error){
    failures.push(`JavaScript syntax error in ${relativePath}: ${error.message}`);
  }
}

try{
  const highScoreSource=fs.readFileSync(
    projectPath('src/services/high-score-service.js'),'utf8'
  );
  const storage=new Map();
  const serviceWarnings=[];
  let id=0;
  const highScoreContext={
    console:{...console,warn:(...args)=>serviceWarnings.push(args)},
    document:{querySelector:()=>null},
    localStorage:{
      getItem:key=>storage.get(key)||null,
      setItem:(key,value)=>storage.set(key,value)
    },
    crypto:{randomUUID:()=>`test-score-${++id}`},
    fetch:()=>Promise.reject(new Error('Network must remain disabled in tests'))
  };
  highScoreContext.globalThis=highScoreContext;
  vm.runInNewContext(highScoreSource,highScoreContext,{
    filename:'high-score-service-test.js'
  });
  const highScores=highScoreContext.MazeBitersHighScores;
  // A clean browser passed while a returning browser could reuse the old
  // eight-character service. Keep both sides of this contract cache-versioned.
  const entryHtml=fs.readFileSync(projectPath('index.html'),'utf8');
  const engineText=fs.readFileSync(projectPath('src/engine/game.js'),'utf8');
  const release=entryHtml.match(/<title>Maze Biters v([\d.]+)<\/title>/)?.[1];
  assert.ok(release,'entry page identifies its release');
  assert.ok(engineText.startsWith(`// Maze Biters v${release}`),'engine matches entry release');
  for(const script of ['src/services/high-score-service.js','src/render/menu-lighting.js','src/engine/game.js']){
    assert.ok(entryHtml.includes(`<script src="${script}?v=${release}"></script>`),
      `${script} must use the release URL, not an older cached name-length contract`);
  }
  assert.ok(/maxlength="10"/.test(entryHtml),'native input must match ten visible name slots');
  assert.equal(highScores.MAX_NAME_LENGTH,10,'high-score service exposes the ten-glyph name limit');
  for(const [input,expected] of [
    ['  maze biters  ','MAZEBITERS'],
    ['abcdefghijklmno','ABCDEFGHIJ'],
    ['  àbc déf 1234?','ABCDEF1234'],
    ["'@,.-?09AZ","'@,.-?09AZ"],
    ['OLDNAME8','OLDNAME8'],[null,''],['   \t\n',''],['🙂[]!_','']
  ]){
    assert.equal(highScores.sanitizeName(input),expected,
      'names keep existing uppercase, accent and bitmap-character normalization within ten glyphs');
  }
  for(const name of ['   ','🙂[]!_',null]){
    await assert.rejects(highScores.submit({name,score:100}),
      error=>error?.code==='EMPTY_NAME','sanitized-empty names must never create a slot');
  }
  assert.equal(highScores.list().length,0,'rejected names do not modify the leaderboard');
  assert.equal(storage.size,0,'rejected names do not create localStorage data');
  for(let score=10;score<=270;score+=10){
    await highScores.submit({
      name:`P${score}`,
      score,
      level:1,
      mode:1,
      modeLabel:'SOLO'
    });
  }
  const testScores=highScores.list();
  if(testScores.length!==25||testScores[0].score!==270||
     testScores[24].score!==30){
    failures.push('High-score Top 25 sorting or truncation is incorrect.');
  }
  if(highScores.qualifies(30)||!highScores.qualifies(35)){
    failures.push('High-score qualification boundary is incorrect.');
  }
  const localRecord=await highScores.submit({name:'abcdefghijk',score:1000,mode:5});
  assert.equal(localRecord.name,'ABCDEFGHIJ','the tenth glyph survives local submission');
  assert.equal(localRecord.pendingRemote,false);
  const storageKey='maze-biters.high-scores.v1';
  const saved=JSON.parse(storage.get(storageKey));
  assert.equal(saved.find(entry=>entry.id===localRecord.id)?.name,'ABCDEFGHIJ',
    'ten-glyph names persist under the existing storage key');
  const legacy={id:'legacy-eight',name:'OLDNAME8',score:900,mode:2,
    modeLabel:'DUO VS',createdAt:'2026-01-01T00:00:00.000Z'};
  storage.set(storageKey,JSON.stringify([...saved,legacy]));
  vm.runInNewContext(highScoreSource,highScoreContext,{filename:'high-score-service-reload-test.js'});
  const reloaded=highScoreContext.MazeBitersHighScores;
  assert.equal(reloaded.list().find(entry=>entry.id===localRecord.id)?.name,'ABCDEFGHIJ',
    'reloading keeps all ten glyphs');
  assert.equal(reloaded.list().find(entry=>entry.id===legacy.id)?.name,'OLDNAME8',
    'existing eight-glyph records remain valid without migration');
  assert.equal(reloaded.list().find(entry=>entry.id===legacy.id)?.mode,2,
    'legacy mode identities are unaffected by the name limit');

  // Exercise the real API adapter with in-memory responses only. No endpoint
  // is contacted and no server credentials or user records are involved.
  const requests=[];
  highScoreContext.MAZE_BITERS_CONFIG={highScoreEndpoint:'/test-only/high-scores'};
  highScoreContext.fetch=async(url,options)=>{
    requests.push({url,options});
    if(options.method==='POST'){
      return {ok:true,json:async()=>({scores:[JSON.parse(options.body),legacy]})};
    }
    return {ok:true,json:async()=>({scores:[legacy,
      {id:'remote-ten',name:'0123456789EXTRA',score:2000,mode:1},
      {id:'remote-empty',name:'🙂 [] ',score:99999,mode:1}]})};
  };
  assert.equal(reloaded.isShared(),true);
  const remoteRecord=await reloaded.submit({name:'remote abcdef',score:1500});
  assert.equal(remoteRecord.name,'REMOTEABCD');
  assert.equal(remoteRecord.pendingRemote,false);
  const posted=JSON.parse(requests[0].options.body);
  assert.equal(posted.name,'REMOTEABCD','the API payload includes the full normalized ten-glyph name');
  assert.ok(!Object.hasOwn(posted,'pendingRemote'),'local queue metadata is not sent to the API');
  const remoteScores=await reloaded.refresh();
  assert.equal(remoteScores.find(entry=>entry.id==='remote-ten')?.name,'0123456789',
    'API responses use the same ten-glyph normalization');
  assert.equal(remoteScores.find(entry=>entry.id===legacy.id)?.name,'OLDNAME8',
    'shared legacy records retain their original names');
  assert.ok(!remoteScores.some(entry=>entry.id==='remote-empty'),'empty API records are rejected');
  assert.equal(requests.at(-1).url,'/test-only/high-scores?limit=25','Top 25 query contract is unchanged');
  const beforeBlank=storage.get(storageKey),requestCount=requests.length;
  await assert.rejects(reloaded.submit({name:' [] ',score:3000}),error=>error?.code==='EMPTY_NAME');
  assert.equal(requests.length,requestCount,'empty names are rejected before any API request');
  assert.equal(storage.get(storageKey),beforeBlank,'empty API submissions cannot alter saved scores');
  highScoreContext.fetch=async()=>{throw new Error('Simulated offline API');};
  const pending=await reloaded.submit({name:'queue name1234',score:2500});
  assert.equal(pending.name,'QUEUENAME1');
  assert.equal(pending.pendingRemote,true,'offline fallback still queues a valid ten-glyph name');
  assert.equal(JSON.parse(storage.get(storageKey)).find(entry=>entry.id===pending.id)?.name,'QUEUENAME1');
  assert.equal(serviceWarnings.length,1,'only the simulated network failure generates a warning');
}catch(error){
  failures.push(`High-score persistence test failed: ${error.message}`);
}

const gameSource=fs.existsSync(projectPath('src/engine/game.js'))
  ?fs.readFileSync(projectPath('src/engine/game.js'),'utf8')
  :'';
for(const tutorialMarker of [
  "titleScreenMode==='tutorial'",
  "title:'MOVE AND TURN'",
  "title:'BITE AND SPLIT'",
  "title:'HEAD ON RICOCHET'",
  "title:'FRUIT AND POWER MODE'",
  "title:'DANGER AND ESCAPE'",
  "title:'DUEL PRIORITY'",
  "title:'CLEAR THE MAZE'",
  'function paintMazeArtwork(targetContext,{',
  'function drawSnakeEntity(s,t=gameTimeNow()',
  'const TUTORIAL_SCENES=Object.freeze([',
  'validateTutorialPath(scene,corridor',
  'THE NEW HALF GETS A HEAD  WATCH BOTH SIDES',
  'TURNING BACK MEANS FACING THE HEAD',
  "document.getElementById('howToPlay')"
]){
  if(!gameSource.includes(tutorialMarker)){
    failures.push(`Missing How to Play integration: ${tutorialMarker}`);
  }
}
for(const obsoleteTutorialRenderer of [
  'drawTutorialRoute',
  'drawTutorialSnakeHorizontal',
  'tutorialPathPosition'
]){
  if(gameSource.includes(obsoleteTutorialRenderer)){
    failures.push(
      `Obsolete free-form tutorial renderer remains: ${obsoleteTutorialRenderer}`
    );
  }
}
try{
  const constantsStart=gameSource.indexOf('const NEON_STILLNESS_TRACKS=');
  const constantsEnd=gameSource.indexOf('  const MUSIC_TRACK_KEYS',constantsStart);
  const controllerStart=gameSource.indexOf('const GameplayMusic={');
  const controllerEnd=gameSource.indexOf(
    '\n\n  globalThis.__mazeBitersAudioDiagnostics',controllerStart
  );
  if([constantsStart,constantsEnd,controllerStart,controllerEnd].some(index=>index<0)){
    throw new Error('music controller markers are missing');
  }

  const musicTestContext={};
  vm.runInNewContext(`
    const MediaMusic={owner:null,ensureAudio(){return null;},fade(){}};
    const SoundManager={volume:1};
    ${gameSource.slice(constantsStart,constantsEnd)}
    ${gameSource.slice(controllerStart,controllerEnd)}
    globalThis.rotation=GameplayMusic;
  `,musicTestContext,{filename:'music-rotation-test.js'});

  const rotation=musicTestContext.rotation;
  const firstCycle=Array.from({length:18},(_,index)=>
    rotation.reserveLevel(index+1)
  );
  if(firstCycle.some((selection,index)=>
    selection.style!==(index%2===0?'stillness':'orbit')
  )){
    failures.push('Gameplay music does not alternate Stillness and Orbit.');
  }
  if(new Set(firstCycle.map(selection=>selection.track?.key)).size!==18){
    failures.push('A gameplay music track repeats before level 19.');
  }

  const secondCycle=Array.from({length:18},(_,index)=>
    rotation.reserveLevel(index+19)
  );
  if(new Set(secondCycle.map(selection=>selection.track?.key)).size!==18){
    failures.push('A refilled gameplay music cycle contains a repeat.');
  }
  if(secondCycle[0].track?.key===firstCycle[16].track?.key||
     secondCycle[1].track?.key===firstCycle[17].track?.key){
    failures.push('A music shuffle bag repeats at its cycle boundary.');
  }
}catch(error){
  failures.push(`Gameplay music rotation test failed: ${error.message}`);
}

try{
  const themesStart=gameSource.indexOf('const MAZE_COLOR_THEMES=');
  const themesEnd=gameSource.indexOf('  let mazeColorTheme=',themesStart);
  const seededStart=gameSource.indexOf('function seededMazeRandom');
  const seededEnd=gameSource.indexOf('\n\n  // Absurdity begins',seededStart);
  const colourStart=gameSource.indexOf('function circularHueDistance');
  const colourEnd=gameSource.indexOf(
    '\n\n  function mazeColorThemeForLevel',colourStart
  );
  if([
    themesStart,themesEnd,seededStart,seededEnd,colourStart,colourEnd
  ].some(index=>index<0)){
    throw new Error('maze colour controller markers are missing');
  }

  const colourTestContext={};
  vm.runInNewContext(`
    ${gameSource.slice(themesStart,themesEnd)}
    let mazeRunSeed=0;
    ${gameSource.slice(seededStart,seededEnd)}
    ${gameSource.slice(colourStart,colourEnd)}
    globalThis.openingColour=seed=>{
      mazeRunSeed=seed>>>0;
      return mazeColorThemeIndexForLevel(1);
    };
    globalThis.themeCount=MAZE_COLOR_THEMES.length;
  `,colourTestContext,{filename:'maze-colour-test.js'});

  const openingColours=Array.from({length:64},(_,seed)=>
    colourTestContext.openingColour(seed)
  );
  if(openingColours.some(index=>
    index<0||index>=colourTestContext.themeCount
  )){
    failures.push('The opening maze colour selection is out of range.');
  }
  if(new Set(openingColours).size<2){
    failures.push('The opening maze colour is not randomized between runs.');
  }
}catch(error){
  failures.push(`Opening maze colour test failed: ${error.message}`);
}

const inventory={
  atlases:listFiles(projectPath('assets/atlases'),'.png').length,
  titleArt:listFiles(projectPath('assets/art/title'),'.png').length,
  soundEffects:listFiles(projectPath('assets/audio/sfx'),'.wav').length,
  musicTracks:listFiles(projectPath('assets/audio/music'),'.mp3').length
};

const expectedMusicFiles=[
  'neon-orbit-menu.mp3',
  'neon-orbit-high-score.mp3',
  ...Array.from({length:9},(_,index)=>`neon-orbit-level-${index+1}.mp3`),
  ...Array.from({length:9},(_,index)=>`neon-stillness-level-${index+1}.mp3`)
];
const actualMusicFiles=listFiles(projectPath('assets/audio/music'),'.mp3')
  .map(file=>path.basename(file))
  .sort();
if(JSON.stringify(actualMusicFiles)!==JSON.stringify(expectedMusicFiles.sort())){
  failures.push('The 20-file menu/high-score/Stillness/Orbit music library is incomplete.');
}

const expectedInventory={atlases:31,titleArt:6,soundEffects:24,musicTracks:20};
for(const [kind,expected] of Object.entries(expectedInventory)){
  if(inventory[kind]!==expected){
    failures.push(
      `Unexpected ${kind} inventory: expected ${expected}, found ${inventory[kind]}`
    );
  }
}

const indexText=fs.existsSync(projectPath('index.html'))
  ?fs.readFileSync(projectPath('index.html'),'utf8')
  :'';
if(!/<title>Maze Biters\b/.test(indexText)){
  failures.push('The browser title is not branded as Maze Biters.');
}

if(failures.length){
  console.error('Maze Biters project verification failed:');
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exitCode=1;
}else{
  console.log('Maze Biters project verification passed.');
  console.log(JSON.stringify({runtimeReferences,...inventory},null,2));
}
