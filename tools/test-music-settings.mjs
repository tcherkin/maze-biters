import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run the actual settings and streamed-audio controllers without decoding
// media or accessing the user's browser/storage. Fade time is deterministic.
const source=fs.readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function segment(first,last){
  const start=source.indexOf(first),end=source.indexOf(last,start+first.length);
  assert.ok(start>=0&&end>start,`Missing source markers: ${first} / ${last}`);
  return source.slice(start,end);
}
function constant(name){
  const start=source.indexOf(`const ${name}=`);
  assert.ok(start>=0,`Missing ${name}`);
  for(let end=source.indexOf(';',start);end>=0;end=source.indexOf(';',end+1)){
    const code=source.slice(start,end+1);
    try{new vm.Script(code);return code;}catch{}
  }
  throw new Error(`Unterminated ${name}`);
}
const storageKey='maze-biters:music-volume:v1';
function harness(saved=null,{blockedStorage=false,deferredPlay=false}={}){
  let now=0;
  const frames=[],plays=[],audios=[],storage=new Map();
  if(saved!==null) storage.set(storageKey,saved);
  class AudioStub{
    constructor(){
      this.volume=1;this.muted=false;this.paused=true;this.currentTime=0;
      this.listeners={};this.playCount=0;audios.push(this);
    }
    addEventListener(key,callback){this.listeners[key]=callback;}
    play(){
      this.paused=false;this.playCount++;
      return deferredPlay?new Promise(resolve=>plays.push(resolve)):Promise.resolve();
    }
    pause(){this.paused=true;}
    load(){}
  }
  const sfx={volume:.72,masterGain:{gain:{value:.72}}};
  const context=vm.createContext({
    Audio:AudioStub,performance:{now:()=>now},
    requestAnimationFrame:callback=>frames.push(callback),SoundManager:sfx,
    musicCandidates:file=>[`audio/${file}`,`fallback/${file}`],
    localStorage:{
      getItem:key=>{if(blockedStorage)throw new Error('storage blocked');return storage.get(key)??null;},
      setItem:(key,value)=>{if(blockedStorage)throw new Error('storage blocked');storage.set(key,value);}
    }
  });
  vm.runInContext(`
    let awaitingPlayerSelection=true,titleScreenMode='menu';
    ${segment('  const MENU_MUSIC_FILE=','  const MUSIC_TRACK_KEYS=')}
    ${segment('  const MUSIC_VOLUME_OPTIONS=','  globalThis.__mazeBitersAudioDiagnostics=')}
    globalThis.api={settings:MusicSettings,media:MediaMusic,menu:MenuMusic,game:GameplayMusic,
      options:MUSIC_VOLUME_OPTIONS,setMenu(value){awaitingPlayerSelection=value;},
      setScreen(value){titleScreenMode=value;}};
  `,context,{timeout:2000});
  return {...context.api,storage,sfx,audios,plays,
    tick(ms){now+=ms;const due=frames.splice(0);due.forEach(callback=>callback(now));},
    resolvePlay(){plays.shift()?.();}
  };
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
const near=(actual,expected,message='')=>assert.ok(Math.abs(actual-expected)<1e-10,
  `${message}: expected ${expected}, got ${actual}`);
function select(h,label){
  for(let n=0;n<4&&h.settings.option.label!==label;n++) h.settings.cycle();
  assert.equal(h.settings.option.label,label);
}

const h=harness();
assert.deepEqual(Array.from(h.options,o=>o.label),['OFF','LOW','MEDIUM','HIGH']);
assert.deepEqual(Array.from(h.options,o=>o.gain),[0,.25,.55,1]);
assert.equal(h.settings.option.label,'HIGH','first launch preserves the established mix');
h.menu.start();await flush();h.tick(240);
const audio=h.media.audio;
near(audio.volume,.72*.40,'HIGH menu volume is unchanged');
audio.currentTime=42;
const playCount=audio.playCount,src=audio.src;
for(const [label,gain] of [['OFF',0],['LOW',.25],['MEDIUM',.55],['HIGH',1]]){
  h.settings.cycle();
  assert.equal(h.settings.option.label,label);
  near(audio.volume,.72*.40*gain,`${label} menu volume`);
  assert.equal(audio.muted,gain===0);
  assert.equal(audio.currentTime,42,'volume changes must not restart the track');
  assert.equal(audio.src,src,'volume changes must not pick another track');
  assert.equal(audio.playCount,playCount,'settings do not start additional playback');
  assert.equal(h.storage.get(storageKey),label);
  assert.equal(h.sfx.volume,.72,'SFX master volume must not change');
  assert.equal(h.sfx.masterGain.gain.value,.72,'SFX gain node must not change');
}

// The selected gain multiplies the current envelope exactly once, even if
// changed partway through a fade. Stop completion remains intact.
let stopped=false;
h.media.fade(audio,0,1,()=>{stopped=true;});h.tick(500);
near(audio.volume,.72*.40*.5);
select(h,'OFF');h.tick(100);near(audio.volume,0);
select(h,'LOW');near(audio.volume,audio.__mazeBaseVolume*.25);
h.tick(400);near(audio.volume,0);assert.ok(stopped);
select(h,'HIGH');near(audio.volume,0,'unmuting must not resurrect a finished fade');

select(h,'MEDIUM');h.menu.stop(0);h.setMenu(false);
h.game.startLevel(1);await flush();h.tick(160);
near(audio.volume,.72*.34*.55,'gameplay inherits the same music preference');
assert.equal(h.media.owner,'gameplay');
assert.equal(h.audios.length,1,'menu and gameplay still share one media element');
const track=h.game.currentTrack.key;
h.game.beginGameClockFade(0,1000);h.game.updateGameClock(500);
near(audio.volume,.72*.34*.55*.5,'level-end clock fade retains the selected mix');
select(h,'OFF');h.game.updateGameClock(750);near(audio.volume,0);
assert.equal(h.game.currentTrack.key,track,'OFF must not consume a shuffle-bag entry');
select(h,'LOW');near(audio.volume,audio.__mazeBaseVolume*.25);
h.game.updateGameClock(1000);near(audio.volume,0);
select(h,'HIGH');near(audio.volume,0);
h.game.startLevel(2);await flush();h.tick(160);
near(audio.volume,.72*.34);
h.game.stop(.3);h.tick(100);select(h,'OFF');h.tick(200);
assert.equal(h.media.owner,null,'settings must not cancel the game-over stop callback');
assert.ok(audio.paused);near(audio.volume,0);

// Late play promises and codec fallback must honor OFF selected meanwhile.
const delayed=harness(null,{deferredPlay:true});
delayed.menu.start();select(delayed,'OFF');delayed.resolvePlay();await flush();delayed.tick(300);
near(delayed.media.audio.volume,0);assert.ok(delayed.media.audio.muted);
assert.ok(delayed.media.tryNextSource(delayed.media.audio));
delayed.resolvePlay();await flush();delayed.tick(200);
near(delayed.media.audio.volume,0);assert.ok(delayed.media.audio.muted);
select(delayed,'LOW');near(delayed.media.audio.volume,.72*.40*.25);
assert.equal(delayed.audios.length,1);

// The record song survives entry -> leaderboard without rewinding. Opening
// the board later from the menu does not start a new high-score session.
for(const label of ['OFF','LOW','MEDIUM','HIGH']){
  const entry=harness(label);
  entry.menu.start();await flush();entry.tick(240);
  entry.setScreen('entry');entry.menu.start();await flush();entry.tick(240);
  const music=entry.media.audio;
  assert.equal(music.__mazeMusicFile,'neon-orbit-high-score.mp3');
  assert.equal(music.loop,true);
  near(music.volume,.72*.40*entry.settings.option.gain);
  assert.equal(music.muted,label==='OFF');
  music.currentTime=17;
  for(let key=0;key<5;key++) entry.menu.start();
  await flush();entry.tick(240);
  assert.equal(music.currentTime,17,'typing/navigation does not rewind the name-entry song');
  assert.equal(music.__mazeMusicFile,'neon-orbit-high-score.mp3');
  assert.equal(entry.game.assignments.size,0,'entry music does not consume level tracks');
  entry.setScreen('leaderboard');entry.menu.start();await flush();entry.tick(240);
  assert.equal(music.__mazeMusicFile,'neon-orbit-high-score.mp3');
  assert.equal(music.currentTime,17,'saving and paging the board keep the existing playhead');
  assert.equal(entry.menu.highScoreSession,true);
  for(let page=0;page<3;page++) entry.menu.start();
  assert.equal(music.currentTime,17);
  for(const screen of ['menu','leaderboard','tutorial']){
    entry.setScreen(screen);entry.menu.start();await flush();entry.tick(240);
    assert.equal(music.__mazeMusicFile,'neon-orbit-menu.mp3',`${screen} uses normal music`);
    assert.equal(entry.menu.highScoreSession,false);
  }
  assert.equal(entry.audios.length,1,'entry, leaderboard and menu share one audio element');
}
const staleEntry=harness(null,{deferredPlay:true});
staleEntry.setScreen('entry');staleEntry.menu.start();
staleEntry.setScreen('menu');staleEntry.menu.start();
staleEntry.resolvePlay();await flush();staleEntry.tick(300);
near(staleEntry.media.audio.volume,0,'late entry play cannot fade the replacement menu source');
staleEntry.resolvePlay();await flush();staleEntry.tick(240);
near(staleEntry.media.audio.volume,.72*.40);
assert.equal(staleEntry.media.audio.__mazeMusicFile,'neon-orbit-menu.mp3');

for(const label of ['OFF','LOW','MEDIUM','HIGH']){
  const restored=harness(label);
  assert.equal(restored.settings.option.label,label);
  restored.media.ensureAudio();
  assert.equal(restored.media.audio.muted,label==='OFF');
}
assert.equal(harness('corrupt').settings.option.label,'HIGH');
const blocked=harness(null,{blockedStorage:true});
assert.equal(blocked.settings.option.label,'HIGH');
assert.doesNotThrow(()=>blocked.settings.cycle());
assert.equal(blocked.settings.option.label,'OFF');

// Keyboard/gamepad focus follows the same two-column geometry as pointer
// hit areas; the lower adjacent controls must not overlap.
const names=['TITLE_HIGH_SCORES_HIT_AREA','TITLE_HOW_TO_PLAY_HIT_AREA',
  'TITLE_QUALITY_HIT_AREA','TITLE_DIFFICULTY_HIT_AREA','TITLE_SPEED_HIT_AREA','TITLE_MUSIC_HIT_AREA'];
const ui={};
vm.runInNewContext(`${constant('TITLE_FOCUS_GRAPH')}
  ${names.map(constant).join('\n')}
  globalThis.graph=TITLE_FOCUS_GRAPH;
  globalThis.areas=[${names.join(',')}];`,ui);
const rows=[['highScores','difficulty'],['howToPlay','speed'],['quality','music']];
rows.forEach(([left,right],index)=>{
  assert.equal(ui.graph[left].right,right);
  assert.equal(ui.graph[right].left,left);
  if(index<2){
    assert.equal(ui.graph[left].down,rows[index+1][0]);
    assert.equal(ui.graph[right].down,rows[index+1][1]);
  }
  if(index>0){
    assert.equal(ui.graph[left].up,rows[index-1][0]);
    assert.equal(ui.graph[right].up,rows[index-1][1]);
  }
});
assert.equal(ui.areas[1].y,574);assert.equal(ui.areas[2].y,614);
assert.equal(ui.areas[5].y,614);assert.equal(ui.areas[5].x,480);
for(let a=0;a<ui.areas.length;a++) for(let b=a+1;b<ui.areas.length;b++){
  const x=ui.areas[a],y=ui.areas[b];
  const overlap=x.x<y.x+y.w&&y.x<x.x+x.w&&x.y<y.y+y.h&&y.y<x.y+x.h;
  assert.ok(!overlap,`${names[a]} overlaps ${names[b]}`);
}
console.log('Music settings checks passed: four levels, persistence, SFX isolation, fades, late playback, shared decoder and menu navigation.');
