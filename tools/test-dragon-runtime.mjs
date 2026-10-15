import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {loadDragonKinArt,DRAGON_KIN_PALETTES} from '../src/render/dragon-kin-art.js';
import {createLiveMouthService} from '../src/render/live-mouth.js';
import {composeFantasyPose,drawFantasySource} from '../src/render/fantasy-player-art.js';

const require=createRequire(import.meta.url);
let native;
for(const location of ['@napi-rs/canvas',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')]){
  try{native=require(location);break;}catch{}
}
assert.ok(native,'Native Canvas dependency is required');
const {createCanvas,loadImage}=native,canvases=[];
let allocations=0,reads=0;
const makeCanvas=(w,h)=>{
  allocations++;const canvas=createCanvas(w,h),context=canvas.getContext('2d'),read=context.getImageData.bind(context),listeners=new Map();
  context.getImageData=(...args)=>{reads++;return read(...args);};
  canvas.addEventListener=(name,callback)=>{const list=listeners.get(name)||[];list.push(callback);listeners.set(name,list);};
  canvas.fire=name=>{for(const callback of listeners.get(name)||[])callback();};
  canvases.push(canvas);return canvas;
};
const directions=['right','down','left','up'],numbers=[2,3,4,1];
function syntheticPack(){
  const manifest={artRevision:5,amplitudeScale:2,walkingStrength:.5,frames:49,blinkFrames:25,blinkArtRevision:5,
    sizeFit:{scaleX:1.125,scaleY:1,pivot:[.5,.5]},palettes:[...DRAGON_KIN_PALETTES],profiles:{}},images=new Map();
  for(const [profile,size] of [['hd',80],['4k',160]]){
    const base=createCanvas(size,size),b=base.getContext('2d');b.fillStyle='#9d47c3';b.fillRect(8,8,size-16,size-16);
    const mouth={file:`${profile}/mouth.png`,frames:49,x:15,y:45,width:20,height:12,guard:1,columns:7,cellWidth:22,stride:14};
    const sheet=createCanvas(154,98),s=sheet.getContext('2d');
    for(let index=0;index<49;index++){s.fillStyle=`rgb(${index*5},${240-index*4},50)`;s.fillRect(index%7*22,Math.floor(index/7)*14,22,14);}
    const blink={file:`${profile}/blink.png`,x:20,y:20,width:8,height:8,guard:1,columns:5,cellWidth:10,stride:10};
    const eyes=createCanvas(50,50),e=eyes.getContext('2d');
    for(let index=0;index<25;index++){e.fillStyle=`rgb(20,${index*10},200)`;e.fillRect(index%5*10,Math.floor(index/5)*10,10,10);}
    images.set(`${profile}/base.png`,base);images.set(mouth.file,sheet);images.set(blink.file,eyes);
    const sets={};
    for(const palette of DRAGON_KIN_PALETTES)for(const light of ['normal'])for(const direction of directions)
      sets[`${palette}:${light}:${direction}`]={base:`${profile}/base.png`,closed:`${profile}/base.png`,mouth,blink:direction==='up'?[]:[blink]};
    manifest.profiles[profile]={size,decodedBytes:size*size*4+154*98*4+50*50*4,sets};
  }
  return {manifest,images};
}
const fixture=syntheticPack();
let imageLoads=0;
const fixtureImage=async url=>{imageLoads++;const image=fixture.images.get(url.pathname.split('/assets/dragon-kin/')[1]);assert.ok(image);return image;};
const fixtureJSON=async()=>fixture.manifest;
await assert.rejects(loadDragonKinArt('bad',{fetchJSON:fixtureJSON,loadImage:fixtureImage}),/quality/);
for(const change of [{artRevision:4},{amplitudeScale:1},{walkingStrength:1},{frames:19},{blinkFrames:24},{blinkArtRevision:4},
  {sizeFit:{scaleX:1,scaleY:1,pivot:[.5,.5]}},{palettes:['p1','p2','ai']},{palettes:['h1','h2','h3','h4','h5']}])
  await assert.rejects(loadDragonKinArt('hd',{fetchJSON:async()=>({...fixture.manifest,...change}),loadImage:fixtureImage}),/revision|size fit|palette/);
const missing=structuredClone(fixture.manifest);delete missing.profiles.hd.sets['h4:normal:up'];
await assert.rejects(loadDragonKinArt('hd',{fetchJSON:async()=>missing,loadImage:fixtureImage}),/Incomplete/);
const unwantedRage=structuredClone(fixture.manifest);
unwantedRage.profiles.hd.sets['h1:rage:right']=unwantedRage.profiles.hd.sets['h1:normal:right'];
await assert.rejects(loadDragonKinArt('hd',{fetchJSON:async()=>unwantedRage,loadImage:fixtureImage}),/Incomplete/);
await assert.rejects(loadDragonKinArt('hd',{fetchJSON:async()=>{throw Error('missing manifest');}}),/missing manifest/);
await assert.rejects(loadDragonKinArt('hd',{fetchJSON:fixtureJSON,loadImage:async()=>{throw Error('missing image');}}),/missing image/);

const packArg=process.argv.indexOf('--pack'),actualRoot=packArg<0?null:path.resolve(process.argv[packArg+1]);
const actualManifest=actualRoot?JSON.parse(await readFile(path.join(actualRoot,'manifest.json'),'utf8')):null;
const loadPack=profile=>loadDragonKinArt(profile,{makeCanvas,
  fetchJSON:actualRoot?async()=>actualManifest:fixtureJSON,
  loadImage:actualRoot?async url=>loadImage(path.join(actualRoot,url.pathname.split('/assets/dragon-kin/')[1])):fixtureImage});
const service=createLiveMouthService({makeCanvas,readSprite:()=>{throw Error('Native enemy art must bypass legacy raster morph');},
  drawSource:drawFantasySource,tile:16,yieldTask:async()=>{}});
let previous=null,previousOptions=null,pixelCases=0;
const actor=()=>({x:4,y:3,dir:{x:1,y:0},moveFromX:3,moveFromY:3,moveToX:4,moveToY:3,moveStartedAt:1000,moveDuration:95});
const optionsFor=(poses,bank)=>{const n=numbers[bank];return {open:poses[`EnemyHead${n}`],closed:poses[`EnemyHead${n}${n===1?'':'Close'}`]||poses[`EnemyHead${n}`],bank,animateBlink:false};};
for(const profile of ['hd','4k']){
  const before=imageLoads,pack=await loadPack(profile),size=pack.size;
  if(!actualRoot)assert.equal(imageLoads-before,3,'each shared image decodes once');
  assert.deepEqual(Object.keys(pack.groups),['1','3','4']);assert.equal(Object.keys(pack.sets).length,12);
  for(const poses of Object.values(pack.groups))assert.deepEqual(Object.keys(poses),['normal'],'enemy presentation has no aggression variant');
  const owned=canvases.filter(c=>c.width>1),groups={hunter:pack.groups,dragonKinArtBytes:pack.decodedBytes};
  assert.equal(await service.prepare(groups),true);
  assert.equal(service.stats.dragonKinSets,12);assert.equal(service.stats.fantasyPlayerSets,0);
  assert.equal(service.stats.hunterFrames,49);assert.equal(service.stats.blinkFrames,25);
  assert.equal(service.stats.hunterArtBytes,pack.decodedBytes);assert.equal(service.stats.playerArtBytes,0);
  assert.equal(service.stats.intakeBanks,0);assert.equal(service.stats.canvases,12,'one native compositor per enemy set; no leader/mask surfaces');
  assert.equal(service.fantasyTarget(actor(),1000),null,'enemy art alone never enables protagonist intake');
  if(previous){assert.equal(service.draw(createCanvas(size,size).getContext('2d'),previous,0,0,size),false);assert.equal(service.sprite(actor(),1010,previousOptions),null);assert.ok(owned.every(c=>c.width===1));}
  const output=createCanvas(size,size),out=output.getContext('2d'),expected=createCanvas(size,size),expectedContext=expected.getContext('2d');
  const atAlloc=allocations,atReads=reads;
  for(const p of [1,3,4])for(const mood of ['normal'])for(let bank=0;bank<4;bank++){
    const options=optionsFor(pack.groups[p][mood],bank),entity=actor(),unchanged=structuredClone(entity);
    for(const time of [1000,1024,1047.5,1071,1095]){
      const descriptor=service.sprite(entity,time,options),live=descriptor.__liveMouth;
      assert.equal(live.set.kind,'hunter');assert.equal(live.set.art.palette,`h${p}`);assert.equal(live.set.art.light,mood);
      assert.equal(live.set.contacts.length,49);assert.equal(live.set.leader,null);assert.equal(live.set.intakeMask,null);
      assert.ok(live.index>=12&&live.index<=19,'same .26–.40 walk closure as protagonists');
      out.clearRect(0,0,size,size);assert.equal(service.draw(out,descriptor,0,0,size),true);
      composeFantasyPose(expectedContext,live.set.art,live.index);
      assert.deepEqual(out.getImageData(0,0,size,size).data,expectedContext.getImageData(0,0,size,size).data);pixelCases++;
      assert.equal(service.drawLeader(out,descriptor,0,0,size),false);assert.equal(service.drawIntakeMask(out,descriptor,0,0,size),false);
      previous=descriptor;previousOptions=options;
    }
    service.bite(entity,1200,140,1100);assert.equal(service.sprite(entity,1200,options).__liveMouth.index,0);
    assert.equal(service.sprite(entity,1340,options).__liveMouth.index,48);assert.deepEqual(entity,unchanged);
  }
  assert.equal(allocations,atAlloc);assert.equal(reads,atReads,'ordinary enemy animation has no pixel readbacks');
  service.reset();
  const first=actor(),second=actor(),visual={...optionsFor(pack.groups[1].normal,0),animateBlink:true};
  service.sprite(first,1000,visual);service.sprite(second,1000,visual);
  service.sprite(first,1900,visual);
  const blinking=service.sprite(first,1970,visual);assert.equal(blinking.__liveMouth.blink,24);
  out.clearRect(0,0,size,size);service.draw(out,blinking,0,0,size);
  composeFantasyPose(expectedContext,blinking.__liveMouth.set.art,blinking.__liveMouth.index,24);
  assert.deepEqual(out.getImageData(0,0,size,size).data,expectedContext.getImageData(0,0,size,size).data,'eyelids compose with the same complete native mouth pose');
  assert.equal(service.sprite(second,1970,visual).__liveMouth.blink||0,0,'different enemies own independent blink phases');
  service.geometry(first,7000,{...visual,animateBlink:false});
  assert.equal(service.sprite(first,1970,visual).__liveMouth.blink,24,'future contact probes do not advance eyelids');
  const lost=blinking.__liveMouth.set.composite;lost.fire('contextlost');assert.equal(service.ready,false);
  lost.fire('contextrestored');assert.equal(await service.whenRestored(),true);assert.equal(service.stats.dragonKinSets,12);
  previous=service.sprite(first,2000,{...visual,animateBlink:false});previousOptions=visual;
}
service.dispose();assert.equal(service.ready,false);assert.equal(service.stats.bytes,0);

// Adding, drawing or resetting hunters cannot consume protagonist blink IDs.
// Use the same lightweight pixel fixtures for both semantic families so this
// assertion measures actor timing independently from their art differences.
const mixedPack=await loadDragonKinArt('hd',{makeCanvas,fetchJSON:fixtureJSON,loadImage:fixtureImage});
const enemyPoses=mixedPack.groups[1].normal,playerPoses=Object.fromEntries(Object.entries(enemyPoses).map(([name,source])=>[
  name.replace('EnemyHead','Head'),{...source,__hvSpriteName:name.replace('EnemyHead','Head'),
    __fantasySource:{...source.__fantasySource,set:{...source.__fantasySource.set,kind:'player',palette:'p2'}}},
]));
const mixedGroups={player:{p2:{normal:playerPoses}},hunter:{1:{normal:enemyPoses}}};
assert.equal(await service.prepare(mixedGroups),true);
const playerOptions={open:playerPoses.Head2,closed:playerPoses.Head2Close,bank:0,animateBlink:true};
const hunterOptions={...optionsFor(enemyPoses,0),animateBlink:true};
function samplePlayerBlinks(interleave){
  service.reset();const players=[actor(),actor(),actor()],hunters=[],samples=[];
  for(let time=1000,step=0;time<=30000;time+=35,step++){
    if(interleave&&step%17===0){const h=actor();hunters.push(h);service.sprite(h,time,hunterOptions);}
    if(interleave)for(const h of hunters)service.sprite(h,time,hunterOptions);
    for(const p of players)samples.push(service.sprite(p,time,playerOptions).__liveMouth.blink||0);
    if(interleave&&step%23===0&&hunters.length)service.reset(hunters[0]);
  }
  return samples;
}
assert.deepEqual(samplePlayerBlinks(true),samplePlayerBlinks(false),'enemy render order/creation/reset preserves every protagonist blink sample');
service.dispose();

// Real factory orchestration, with only the asset/services boundary stubbed:
// independent failure, repeated preparation and latest-quality ownership.
const pending=[],errors=[],runtimeSource=await readFile(new URL('../src/render/animation-runtime.js',import.meta.url),'utf8');
const stub={reset(){},prepare:async()=>true,stats:{ready:true},diagnostics:()=>({ready:true}),getCollisionArt:()=>({contours:[]})};
const sandbox={console:{error:(...args)=>errors.push(args)},
  createLiveMouthService:()=>stub,createLiveSnakeRenderer:()=>({...stub,stats:()=>({ready:true})}),createLiveScorpion:()=>stub,
  createContactRuntime:()=>stub,snakeContactShape(){},drawFantasySource,
  loadFantasyPlayerArt:async profile=>({profile,size:profile==='hd'?80:160,groups:{p1:{profile}},decodedBytes:7,artRevision:5}),
  loadDragonKinArt:profile=>new Promise((resolve,reject)=>pending.push({profile,resolve,reject}))};
vm.runInNewContext(runtimeSource.replace(/^import[^\r\n]+\r?\n/gm,''),sandbox);
const runtime=sandbox.MazeBitersLiveFactory.create({makeCanvas}),legacy={original:true},groups={hunter:legacy,player:{original:true}};
const first=runtime.preparePlayerArt(groups,'HD');pending.shift().reject(Error('injected enemy load failure'));
assert.equal(await first,false);assert.equal(groups.hunter,legacy);assert.equal(groups.player.p1.profile,'hd');assert.equal(groups.dragonKinArtBytes,0);
const old=runtime.prepareHunterArt(groups,'4K'),oldLoad=pending.shift();
const latest=runtime.prepareHunterArt(groups,'HD'),latestLoad=pending.shift();
const loaded={profile:'hd',size:80,groups:{1:{skin:true}},decodedBytes:123,artRevision:5};
latestLoad.resolve(loaded);assert.equal(await latest,true);oldLoad.resolve({profile:'4k',groups:{wrong:true},decodedBytes:999});
assert.equal(await old,false);assert.equal(groups.hunter,loaded.groups);assert.equal(groups.dragonKinArtBytes,123);
assert.equal(await runtime.prepareHunterArt(groups,'HD'),true);assert.equal(pending.length,0,'unchanged quality reuses decoded pack');
const failed=runtime.prepareHunterArt(groups,'4K');pending.shift().reject(Error('missing 4K image'));
assert.equal(await failed,false);assert.equal(groups.hunter,legacy);assert.equal(groups.dragonKinArtBytes,0);
assert.equal(runtime.diagnostics().hunterArt,null);assert.equal(errors.length,1,'repeated loader failures are reported once');
console.log(`PASS Dragon Kin runtime: ${pixelCases} native pose comparisons; three approved normal-only palettes/HD/4K; independent blinks; no enemy leader/intake; fallback, quality races and context recovery${actualRoot?' using staged production art':''}.`);
