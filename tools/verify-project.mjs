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

const inventory={
  atlases:listFiles(projectPath('assets/atlases'),'.png').length,
  titleArt:listFiles(projectPath('assets/art/title'),'.png').length,
  soundEffects:listFiles(projectPath('assets/audio/sfx'),'.wav').length,
  musicTracks:listFiles(projectPath('assets/audio/music'),'.mp3').length
};

const expectedInventory={atlases:31,titleArt:6,soundEffects:24,musicTracks:6};
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
