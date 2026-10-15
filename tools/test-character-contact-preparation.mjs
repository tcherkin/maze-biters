// Contact preparation is optional; approved native art, masks, effects and
// clocks are not. This test uses real packed pixels, not a fake image renderer.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createLiveMouthService} from '../src/render/live-mouth.js';
import {loadFantasyPlayerArt,drawFantasySource} from '../src/render/fantasy-player-art.js';
import {loadDragonKinArt} from '../src/render/dragon-kin-art.js';

const require=createRequire(import.meta.url);let native;
for(const location of ['@napi-rs/canvas',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')]){
  try{native=require(location);break;}catch{}
}
assert.ok(native,'Native Canvas dependency required');
const {createCanvas,loadImage}=native;
const directions=['right','down','left','up'],numbers=[2,3,4,1];
const actor=()=>({x:4,y:3,dir:{x:1,y:0},moveFromX:3,moveFromY:3,moveToX:4,moveToY:3,moveStartedAt:1000,moveDuration:95});
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
const samePixels=(a,b,label)=>{
  assert.equal(a.width,b.width,label+' width');assert.equal(a.height,b.height,label+' height');
  assert.ok(Buffer.from(pixels(a)).equals(Buffer.from(pixels(b))),label);
};
function owner(prepareCharacterContacts){
  const owned=[],counts={reads:0},contextRequests=new WeakMap();
  const makeCanvas=(w=1,h=w)=>{
    const c=createCanvas(w,h),ctx=c.getContext('2d'),read=ctx.getImageData.bind(ctx),listeners=new Map();
    ctx.getImageData=(...args)=>{counts.reads++;return read(...args);};
    // Record service requests, not the native test adapter's instrumentation
    // context above. Browser whole-scene tests establish actual CPU/GPU parity;
    // this spy only locks the exact intended scope of the backing-store hint.
    const getContext=c.getContext.bind(c),requests=[];contextRequests.set(c,requests);
    c.getContext=(kind,options)=>{requests.push({kind,options});return getContext(kind,options);};
    c.addEventListener=(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);};
    c.fire=name=>{for(const fn of listeners.get(name)||[])fn();};owned.push(c);return c;
  };
  const drawSource=(ctx,source,x,y,w,h)=>{
    if(source.__fantasySource)return drawFantasySource(ctx,source,x,y,w,h);
    ctx.drawImage(source,0,0,source.width,source.height,x,y,w,h);return true;
  };
  const service=createLiveMouthService({makeCanvas,drawSource,prepareCharacterContacts,yieldTask:async()=>{},
    readSprite:source=>{const size=source.naturalWidth||source.width,c=makeCanvas(size,size),ctx=c.getContext('2d');
      try{drawSource(ctx,source,0,0,size,size);return ctx.getImageData(0,0,size,size);}finally{c.width=c.height=1;}}});
  return{service,counts,owned,contextRequests};
}
function cases(groups){
  const result=[];
  for(const kind of ['player','hunter'])for(const [palette,lights]of Object.entries(groups[kind]||{}))
    for(const [light,poses]of Object.entries(lights))for(let bank=0;bank<4;bank++){
      const prefix=kind==='hunter'?'EnemyHead':'Head',name=`${prefix}${numbers[bank]}`,open=poses[name];if(!open)continue;
      result.push({label:`${kind}:${palette}:${light}:${directions[bank]}`,kind,options:{open,closed:poses[name+(bank===3?'':'Close')]||open,bank,animateBlink:false}});
    }
  return result;
}
const report={nativeRasterPairs:0,leaderPairs:0,intakePairs:0,legacyRasterPairs:0,hunterCpuHints:0,profiles:[]};
for(const profile of ['hd','4k']){
  const loadOptions={makeCanvas:createCanvas,fetchJSON:async u=>JSON.parse(await readFile(u,'utf8')),loadImage:async u=>loadImage(fileURLToPath(u))};
  const [player,hunter]=await Promise.all([loadFantasyPlayerArt(profile,loadOptions),loadDragonKinArt(profile,loadOptions)]);
  const groups={player:player.groups,hunter:hunter.groups,fantasyPlayerArtBytes:player.decodedBytes,dragonKinArtBytes:hunter.decodedBytes};
  const full=owner(),off=owner(false),size=player.size;
  const started=performance.now();assert.equal(await full.service.prepare(groups),true);const fullMs=performance.now()-started;
  const disabledAt=performance.now();assert.equal(await off.service.prepare(groups),true);const offMs=performance.now()-disabledAt;
  const fullReads=full.counts.reads,offReads=off.counts.reads;
  const fullContours=full.service.stats.contactContours,fullVertices=full.service.stats.contactVertices;
  assert.equal(full.service.stats.contactPreparationEnabled,true,'default API still prepares contacts');
  assert.equal(off.service.stats.contactPreparationEnabled,false);
  assert.ok(full.service.stats.contactContours>0&&full.service.stats.contactVertices>0);
  assert.equal(off.service.stats.contactContours,0);assert.equal(off.service.stats.contactVertices,0);
  assert.equal(fullReads-offReads,12*49,'only the twelve hunter49-frame pixel-read loops are skipped');
  for(const field of ['sets','fantasyPlayerSets','dragonKinSets','intakeBanks','intakeBytes','canvases','bytes','playerFrames','hunterFrames','blinkFrames'])
    assert.equal(off.service.stats[field],full.service.stats[field],`visual cache contract ${field}`);
  const out=[createCanvas(size,size),createCanvas(size,size)];
  for(const item of cases(groups)){
    const entities=[actor(),actor()],services=[full.service,off.service];
    const descriptors=services.map((service,i)=>service.sprite(entities[i],1000,item.options));
    assert.ok(descriptors.every(Boolean));const sets=descriptors.map(d=>d.__liveMouth.set);
    assert.equal(sets[0].contacts.length,49);assert.equal(sets[1].contacts.length,0);
    for(const [index,own]of [full,off].entries()){
      const requests=own.contextRequests.get(sets[index].composite),expected=index===1&&item.kind==='hunter';
      assert.equal(requests[0].kind,'2d',item.label+' native composite context');
      assert.equal(requests[0].options?.willReadFrequently===true,expected,
        item.label+': only contact-disabled hunter composites request CPU backing');
      assert.equal(requests.filter(call=>call.options?.willReadFrequently===true).length,expected?1:0,
        item.label+': no extra or broadened CPU-backing requests');
      if(expected)report.hunterCpuHints++;
    }
    if(sets[0].leader){samePixels(sets[0].leader.image,sets[1].leader.image,item.label+' leader');report.leaderPairs++;}
    else assert.equal(sets[1].leader,null);
    if(sets[0].intakeMask){samePixels(sets[0].intakeMask,sets[1].intakeMask,item.label+' intake');report.intakePairs++;}
    else assert.equal(sets[1].intakeMask,null);
    const poses=[...Array.from({length:49},(_,index)=>[index,0]),...Array.from({length:24},(_,i)=>[18,i+1])];
    for(const [index,blink]of poses){
      for(let i=0;i<2;i++){
        const ctx=out[i].getContext('2d');ctx.clearRect(0,0,size,size);
        assert.equal(services[i].draw(ctx,{...descriptors[i],__liveMouth:{set:sets[i],index,blink}},0,0,size,size),true);
      }
      samePixels(...out,`${profile} ${item.label} frame${index} blink${blink}`);report.nativeRasterPairs++;
    }
    assert.ok(full.service.geometry(entities[0],1024,item.options,{}));
    assert.equal(off.service.geometry(entities[1],1024,item.options,{}),null);
    assert.ok(full.service.breakpoints(entities[0],1000,1095).length>0);
    const reusable=[123];assert.equal(off.service.breakpoints(entities[1],1000,1095,reusable),reusable);assert.deepEqual(reusable,[]);
    for(const service of services)service.reset();
    const blinkOptions={...item.options,animateBlink:true};
    for(const time of [1000,1900,1935,1970,2005,2040]){
      const a=full.service.sprite(entities[0],time,blinkOptions),b=off.service.sprite(entities[1],time,blinkOptions);
      assert.equal(a.__liveMouth.index,b.__liveMouth.index);assert.equal(a.__liveMouth.blink||0,b.__liveMouth.blink||0);
    }
    for(let i=0;i<2;i++)services[i].bite(entities[i],2200,140,2100);
    for(const time of [2100,2150,2200,2270,2340,2400])assert.equal(full.service.sprite(entities[0],time,item.options).__liveMouth.index,off.service.sprite(entities[1],time,item.options).__liveMouth.index);
  }
  // A lost opt-out compositor must still rebuild its visual cache, retain the
  // disabled preparation choice, and reject stale-generation descriptors.
  const firstCase=cases(groups)[0],entity=actor(),old=off.service.sprite(entity,1000,firstCase.options);
  old.__liveMouth.set.composite.fire('contextlost');assert.equal(off.service.ready,false);
  old.__liveMouth.set.composite.fire('contextrestored');assert.equal(await off.service.whenRestored(),true);
  assert.equal(off.service.stats.contactContours,0);assert.equal(off.service.stats.contactPreparationEnabled,false);
  assert.equal(off.service.draw(out[1].getContext('2d'),old,0,0,size,size),false);
  const hunterOnly=owner(false);assert.equal(await hunterOnly.service.prepare({hunter:hunter.groups}),true);
  assert.equal(hunterOnly.counts.reads,0,'contact-free hunter preparation performs no native pose readback');
  assert.equal(hunterOnly.service.stats.intakeBanks,0);assert.equal(hunterOnly.service.stats.contactContours,0);
  for(const own of [full,off,hunterOnly]){
    own.service.dispose();assert.equal(own.service.stats.bytes,0);assert.ok(own.owned.every(c=>c.width===1&&c.height===1),'all owned canvases released');
  }
  report.profiles.push({profile,fullReads,offReads,fullContours,fullVertices,disabledContours:0,disabledVertices:0,fullMs:Math.round(fullMs),offMs:Math.round(offMs)});
}

// Legacy artwork remains a supported fallback; disabling its contact push
// cannot alter the cached19-frame mouth patches or protagonist effects.
const legacyOpen=createCanvas(80,80),legacyClosed=createCanvas(80,80);
for(const [canvas,height]of [[legacyOpen,44],[legacyClosed,36]]){
  const c=canvas.getContext('2d');c.fillStyle='#35e55b';c.fillRect(10,10,60,height);c.fillStyle='#153514';c.fillRect(25,40,45,20);
}
const legacyGroups={player:{p1:{normal:{Head2:legacyOpen,Head2Close:legacyClosed}}},hunter:{1:{normal:{EnemyHead2:legacyOpen,EnemyHead2Close:legacyClosed}}}};
// Distinct sprite identities avoid deliberately aliasing player and hunter sets.
legacyGroups.hunter[1].normal={EnemyHead2:createCanvas(80,80),EnemyHead2Close:createCanvas(80,80)};
legacyGroups.hunter[1].normal.EnemyHead2.getContext('2d').drawImage(legacyOpen,0,0);
legacyGroups.hunter[1].normal.EnemyHead2Close.getContext('2d').drawImage(legacyClosed,0,0);
const legacyFull=owner(),legacyOff=owner(false);
assert.equal(await legacyFull.service.prepare(legacyGroups),true);assert.equal(await legacyOff.service.prepare(legacyGroups),true);
for(const item of cases(legacyGroups)){
  const services=[legacyFull.service,legacyOff.service],descriptors=services.map(s=>s.sprite(actor(),1000,item.options)),out=[createCanvas(80,80),createCanvas(80,80)];
  assert.equal(descriptors[0].__liveMouth.set.contacts.length,19);assert.equal(descriptors[1].__liveMouth.set.contacts.length,0);
  for(let index=0;index<19;index++){
    for(let i=0;i<2;i++){const ctx=out[i].getContext('2d');ctx.clearRect(0,0,80,80);assert.equal(services[i].draw(ctx,{...descriptors[i],__liveMouth:{...descriptors[i].__liveMouth,index}},0,0,80,80),true);}
    samePixels(...out,`${item.label} legacy${index}`);report.legacyRasterPairs++;
  }
  for(const field of ['leader','intakeMask']){
    const a=descriptors[0].__liveMouth.set[field],b=descriptors[1].__liveMouth.set[field];
    if(a)samePixels(field==='leader'?a.image:a,field==='leader'?b.image:b,`legacy ${field}`);else assert.equal(b,a);
  }
}
legacyFull.service.dispose();legacyOff.service.dispose();

// The factory must not advertise physical-contact readiness after an explicit
// opt-out, even if every independent animation service is ready.
const runtimeSource=await readFile(new URL('../src/render/animation-runtime.js',import.meta.url),'utf8'),seen=[];
const stub=()=>({ready:true,prepare:async()=>true,reset(){},stats:{ready:true},diagnostics:()=>({ready:true}),getCollisionArt:()=>({contours:[]})});
const sandbox={console,createLiveMouthService:options=>{seen.push(options);return stub();},createLiveSnakeRenderer:()=>({...stub(),stats:()=>({ready:true})}),
  createLiveScorpion:stub,createContactRuntime:stub,snakeContactShape(){},drawFantasySource,loadFantasyPlayerArt(){},loadDragonKinArt(){}};
vm.runInNewContext(runtimeSource.replace(/^import[^\r\n]+\r?\n/gm,''),sandbox);
for(const value of [undefined,true,false]){
  const options=value===undefined?{}:{prepareCharacterContacts:value},runtime=sandbox.MazeBitersLiveFactory.create(options);
  assert.equal(seen.at(-1),options);assert.equal(runtime.contactReady(),false);assert.equal(await runtime.prepare({}),true);
  assert.equal(runtime.contactReady(),value!==false,'only explicitfalse disables physical readiness');
}
const engine=await readFile(new URL('../src/engine/game.js',import.meta.url),'utf8');
assert.match(engine,/MazeBitersLiveFactory\?\.create\(\{\s*tile:TILE,\s*prepareCharacterContacts:EXPERIMENTAL_PHYSICAL_CONTACTS,/);
assert.match(engine,/function physicalContactStep\(t\)\{\s*if\(!physicalContactActive\(\)\)\{physicalContactClock=null;return;\}/);
console.log('PASS character contact preparation opt-out: '+JSON.stringify(report));
