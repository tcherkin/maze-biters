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
  let id=0;
  const highScoreContext={
    console,
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
  if(highScores.sanitizeName('  maze biter  ')!=='MAZEBITE'){
    failures.push('High-score names are not normalized to eight bitmap glyphs.');
  }
  let emptyNameRejected=false;
  try{ await highScores.submit({name:'   ',score:100}); }
  catch(error){ emptyNameRejected=error?.code==='EMPTY_NAME'; }
  if(!emptyNameRejected||highScores.list().length!==0){
    failures.push('An empty high-score name can create a leaderboard slot.');
  }
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
  'SAFE EXIT MISSED',
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
