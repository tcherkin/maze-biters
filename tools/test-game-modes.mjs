import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function declaration(name,kind='function'){
  const start=source.search(new RegExp(`\\b${kind}\\s+${name}\\s*${kind==='function'?'\\(':'='}`));
  assert.ok(start>=0,`Missing ${name}`);
  const delimiter=kind==='function'?'}':';';
  for(let end=source.indexOf(delimiter,start);end>=0;end=source.indexOf(delimiter,end+1)){
    const text=source.slice(start,end+1);
    try{new vm.Script(text);return text;}catch{}
  }
  throw new Error(`Unterminated ${name}`);
}
const copy=value=>JSON.parse(JSON.stringify(value));
const noop=()=>{};
const context=vm.createContext({
  performance:{now:()=>1000},gameTimeNow:()=>1000,
  MenuMusic:{stop:noop},SoundManager:{prepareGameplay:noop},
  GameplayMusic:{startLevel:noop},restoreGameplayCanvasResolution:noop,
  canvas:{setAttribute:noop},screenReaderStatus:null,
  document:{getElementById:()=>null},combinedScoreMultiplier:()=>1,
  spawnConsumedCreatureBloomAt:noop,ControllerHaptics:{rivalBite:noop},
  awardPoints:(p,points)=>{p.score+=points;},
  loseLife:p=>{p.dead=true;p.lives--;},
  competitiveLeaderSprite:(sprite,color)=>({sprite,color}),playerEffectColor:p=>p.id
});
const helpers=['isCompetitiveMode','isCooperativeMode','canPlayerEatPlayer',
  'playerWinsContactPriority','playerContactBlocksMovement','playerCellIsSafeForRoute',
  'eatCompetingPlayer','resolvePlayerContact','teammateAt','createPlayerState',
  'createPlayerAtStart','startNewGame','captureRunHighScoreCandidate',
  'isPowerMode','isSpawnProtected','uniqueLeaderId','isUniqueLeader',
  'competitiveLeaderVisual','highScoreModeAbbreviation'];
const constants=['PLAYER_STARTS','COMPETITOR_EAT_POINTS','TITLE_MODE_HIT_AREAS',
  'TITLE_FOCUS_GRAPH','TITLE_DIFFICULTIES','TITLE_SPEEDS','PLAYER_SLIDE_RATIO'];
vm.runInContext(`
  const COLS=36,ROWS=25;let maze=[];
  let player=null,player2=null,player3=null;
  let gameMode=1,humanPlayerCount=1,alliedAiPlayerId=0,activePlayerCount=1;
  let awaitingPlayerSelection=true,level=1,titleScreenMode='menu';
  let completedRunHighScoreCandidate=null,pendingHighScoreCandidate=null;
  let titleDifficultyIndex=2,titleSpeedIndex=2;
  function allPlayers(){return [player,player2,player3].slice(0,activePlayerCount).filter(Boolean);}
  function reset(){
    player=createPlayerState(1);
    player2=activePlayerCount>1?createPlayerState(2):null;
    player3=activePlayerCount>2?createPlayerState(3):null;
  }
  ${constants.map(name=>declaration(name,'const')).join('\n')}
  ${helpers.map(name=>declaration(name)).join('\n')}
  globalThis.api={start:startNewGame,players:allPlayers,canEat:canPlayerEatPlayer,
    resolve:resolvePlayerContact,blocks:playerContactBlocksMovement,safe:playerCellIsSafeForRoute,
    leader:competitiveLeaderVisual,respawn:createPlayerAtStart,capture:captureRunHighScoreCandidate,
    abbreviation:highScoreModeAbbreviation,areas:TITLE_MODE_HIT_AREAS,graph:TITLE_FOCUS_GRAPH,
    state:()=>({gameMode,humanPlayerCount,alliedAiPlayerId,activePlayerCount,
      competitive:isCompetitiveMode(),cooperative:isCooperativeMode()})};
`,context,{timeout:2000});
const api=context.api;
const expected=[
  [1,1,'1 SOLO',1,0],[2,5,'2 DUO CO-OP',2,0],[3,2,'3 DUO VS',2,0],
  [4,3,'4 SOLO VS AI',1,2],[5,4,'5 DUO VS AI',2,3],[6,0,'6 AI ONLY',0,1]
];
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
expected.forEach(([key,mode,label,humans,aiId],index)=>{
  const entry=api.areas.find(area=>area.key===key);
  assert.equal(entry.mode,mode);assert.equal(entry.label,label);
  assert.equal(entry.x,index<3?48:552);assert.equal(entry.y,288+(index%3)*64);
  assert.ok(label.length*32+40<=entry.w,'label fits the native bitmap scale');
  assert.ok(html.includes(`>${label}</button>`),'accessible button matches canvas');
  api.start(mode);
  assert.equal(api.state().humanPlayerCount,humans);
  assert.equal(api.state().activePlayerCount,humans+(aiId?1:0));
  assert.deepEqual(copy(api.players().filter(p=>p.isAI).map(p=>p.id)),aiId?[aiId]:[]);
  assert.equal(api.state().cooperative,mode===5);
  assert.equal(api.state().competitive,[2,3,4].includes(mode));
});
for(const [left,right] of [[1,3],[5,4],[2,0]]){
  assert.equal(api.graph[`mode:${left}`].right,`mode:${right}`);
  assert.equal(api.graph[`mode:${right}`].left,`mode:${left}`);
}
for(const column of [[1,5,2],[3,4,0]]){
  for(let row=0;row<2;row++){
    assert.equal(api.graph[`mode:${column[row]}`].down,`mode:${column[row+1]}`);
    assert.equal(api.graph[`mode:${column[row+1]}`].up,`mode:${column[row]}`);
  }
}
assert.equal(api.graph['mode:2'].down,'highScores');
assert.equal(api.graph['mode:0'].down,'difficulty');
assert.ok(source.includes('/^[1-6]$/.test(k)'),'six keyboard shortcuts are active');

// Every combination of score, power and spawn immunity remains non-lethal
// in CO-OP; the same production resolver retains its prior VS outcomes.
let contacts=0;
for(const mode of [5,2,3,4]) for(const scores of [[100,0],[0,100],[100,100]]){
  for(let mask=0;mask<16;mask++){
    api.start(mode);const [a,b]=api.players();
    [a.score,b.score]=scores;
    a.powerModeUntil=mask&1?2000:0;b.powerModeUntil=mask&2?2000:0;
    a.spawnShieldUntil=mask&4?2000:0;b.spawnShieldUntil=mask&8?2000:0;
    a.x=b.x=10;a.y=b.y=10;
    const priority=(attacker,defender)=>!defender.spawnShieldUntil&&
      (!!attacker.spawnShieldUntil||
        (!!attacker.powerModeUntil!==!!defender.powerModeUntil
          ?!!attacker.powerModeUntil:attacker.score>defender.score));
    const aWins=mode!==5&&priority(a,b),bWins=mode!==5&&priority(b,a);
    assert.equal(api.canEat(a,b,1000),aWins);assert.equal(api.canEat(b,a,1000),bWins);
    assert.equal(api.blocks(a,10,10,1000),!aWins&&!bWins);
    assert.equal(api.safe(a,10,10,1000),aWins);
    const outfit=api.leader(a,api.players(),'native');
    assert.equal(!!outfit,a.score>b.score,'CO-OP and VS retain the same visual score leader');
    assert.equal(api.resolve(a,1000),aWins||bWins);
    assert.equal(a.dead,bWins);assert.equal(b.dead,aWins);
    if(mode===5){
      assert.equal(a.lives,3);assert.equal(b.lives,3);
      assert.deepEqual([a.score,b.score],scores,'no friendly knockout points');
    }
    contacts++;
  }
}
api.start(5);const [p1,p2]=api.players();
p1.score=p1.scoreExact=1200;p2.score=p2.scoreExact=750;
const candidate=api.capture();
assert.equal(candidate.mode,5);assert.equal(candidate.modeLabel,'DUO CO-OP');
assert.equal(candidate.score,1200);assert.deepEqual(copy(candidate.playerIds),[1]);
p2.score=1200;assert.deepEqual(copy(api.capture().playerIds),[1,2]);
const reborn=api.respawn(p1);
assert.equal(reborn.isAI,false);assert.equal(reborn.score,1200);
assert.equal(api.canEat(reborn,p2,1000),false);
api.start(0);api.players()[0].score=9000;assert.equal(api.capture(),null);
assert.equal(api.abbreviation({mode:2}),'DUO VS');
assert.equal(api.abbreviation({mode:5}),'CO-OP');

// Use only in-memory storage; no user records or website API are touched.
const storage=new Map([['maze-biters.high-scores.v1',JSON.stringify([
  {id:'old-vs',name:'OLD',score:1000,mode:2,modeLabel:'DUO VS'}
])]]);
const serviceContext={document:{querySelector:()=>null},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  crypto:{randomUUID:()=> 'new-coop'},console};
const serviceSource=fs.readFileSync(new URL('../src/services/high-score-service.js',import.meta.url),'utf8');
vm.runInNewContext(serviceSource,serviceContext);
await serviceContext.MazeBitersHighScores.submit({...candidate,name:'TEAM'});
vm.runInNewContext(serviceSource,serviceContext);
const records=serviceContext.MazeBitersHighScores.list();
assert.equal(records.find(e=>e.id==='old-vs').mode,2);
assert.equal(records.find(e=>e.id==='new-coop').mode,5);
assert.equal(records.find(e=>e.id==='new-coop').modeLabel,'DUO CO-OP');
console.log(`Game modes passed: six layouts/rosters, D-pad map, ${contacts} contact combinations, visual-only CO-OP leader, respawn and old/new score persistence.`);
