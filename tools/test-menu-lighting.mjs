import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Evaluate the actual lighting module. The canvas harness records rendering
// operations and state; it does not implement any lighting or focus behavior.
const source=fs.readFileSync(new URL('../src/render/menu-lighting.js',import.meta.url),'utf8');
const canvases=[];
const counters={gradients:0,resizes:0,fontWrites:0};
const clone=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected,label,tolerance=1e-9)=>assert.ok(
  Math.abs(actual-expected)<=tolerance,`${label}: expected ${expected}, got ${actual}`);

function makeContext(canvas){
  let state={
    globalAlpha:1,globalCompositeOperation:'source-over',filter:'none',
    imageSmoothingEnabled:true,shadowBlur:0,shadowColor:'transparent',
    shadowOffsetX:0,shadowOffsetY:0,fillStyle:'#000',strokeStyle:'#000',
    lineWidth:1,font:'10px sans-serif',textAlign:'start',textBaseline:'alphabetic',
    transform:[1,0,0,1,0,0],clips:[]
  };
  const stack=[];
  let path=[];
  const calls=[];
  const target={
    canvas,calls,
    snapshot:()=>clone(state),
    stackDepth:()=>stack.length,
    save(){stack.push(clone(state));},
    restore(){assert.ok(stack.length,'unbalanced context restore');state=stack.pop();},
    beginPath(){path=[];},
    rect(x,y,w,h){path.push({x,y,w,h});},
    clip(){state.clips.push(clone(path));},
    fillRect(...args){calls.push({kind:'fillRect',args,state:clone(state)});},
    clearRect(...args){calls.push({kind:'clearRect',args,state:clone(state)});},
    strokeRect(...args){calls.push({kind:'strokeRect',args,state:clone(state)});},
    drawImage(image,...args){
      assert.ok(canvases.includes(image),'lighting must draw only its cached canvas stamps');
      assert.ok(args.every(Number.isFinite),'draw coordinates must remain finite');
      assert.ok(state.globalAlpha>=0&&state.globalAlpha<=1,'draw alpha must stay bounded');
      calls.push({kind:'drawImage',image,args,state:clone(state)});
    },
    createRadialGradient(...args){
      counters.gradients++;
      assert.ok(args.every(Number.isFinite));
      return {addColorStop(offset,color){
        assert.ok(offset>=0&&offset<=1);
        assert.equal(typeof color,'string');
      }};
    },
    createLinearGradient(){throw new Error('Unexpected per-frame or non-radial gradient');},
    fillText(){throw new Error('Lighting must not repaint font glyphs');},
    strokeText(){throw new Error('Lighting must not repaint font glyphs');},
    setTransform(...matrix){state.transform=matrix;},
    scale(x,y){
      const [a,b,c,d,e,f]=state.transform;
      state.transform=[a*x,b*x,c*y,d*y,e,f];
    },
    getTransform(){
      const [a,b,c,d,e,f]=state.transform;
      return {a,b,c,d,e,f};
    }
  };
  return new Proxy(target,{
    get(object,key){return key in object?object[key]:state[key];},
    set(object,key,value){
      if(key==='font'){counters.fontWrites++;throw new Error('Lighting must not replace caller font');}
      assert.ok(key in state,`Unexpected canvas property write: ${String(key)}`);
      state[key]=value;
      return true;
    }
  });
}
function makeCanvas(){
  let width=300,height=150;
  const canvas={
    get width(){return width;},set width(value){width=value;counters.resizes++;},
    get height(){return height;},set height(value){height=value;counters.resizes++;},
    getContext(kind){assert.equal(kind,'2d');return this.context;}
  };
  canvas.context=makeContext(canvas);
  canvases.push(canvas);
  return canvas;
}
const runtime=vm.createContext({
  document:{createElement(tag){assert.equal(tag,'canvas');return makeCanvas();}},
  performance:{now:()=>{throw new Error('Tests supply deterministic time');}}
});
vm.runInContext(source,runtime,{filename:'menu-lighting-production.js',timeout:2000});
const lighting=runtime.MazeBitersMenuLighting.create();
const ctx=makeContext({width:3840,height:2160});
ctx.globalAlpha=.43;
ctx.globalCompositeOperation='multiply';
ctx.filter='contrast(110%)';
ctx.imageSmoothingEnabled=false;
ctx.shadowBlur=9;
ctx.shadowColor='#abcdef';
ctx.shadowOffsetX=4;
ctx.shadowOffsetY=-3;
ctx.fillStyle='#123456';
ctx.strokeStyle='#fedcba';
ctx.lineWidth=7;
ctx.textAlign='right';
ctx.textBaseline='middle';
ctx.setTransform(2,0,0,2,17,31);
ctx.beginPath();ctx.rect(0,0,1024,768);ctx.clip();
const callerState=ctx.snapshot();

function preserved(label,draw){
  ctx.calls.length=0;
  const result=draw();
  assert.deepEqual(ctx.snapshot(),callerState,`${label}: caller state must be restored`);
  assert.equal(ctx.stackDepth(),0,`${label}: balanced save/restore`);
  for(const call of ctx.calls){
    assert.deepEqual(call.state.transform,callerState.transform,`${label}: keep the caller transform`);
    if(call.kind==='drawImage'){
      assert.equal(call.state.filter,'none',`${label}: no runtime blur/filter`);
      assert.equal(call.state.shadowBlur,0,`${label}: do not blur cached textures again`);
      assert.equal(call.state.shadowOffsetX,0,`${label}: ignore inherited shadow x offset`);
      assert.equal(call.state.shadowOffsetY,0,`${label}: ignore inherited shadow y offset`);
    }
  }
  return {result,calls:ctx.calls.slice()};
}
const images=result=>result.calls.filter(call=>call.kind==='drawImage');
const preparedCounters=()=>({canvases:canvases.length,...counters});

for(const scene of ['menu','leaderboard','entry']){
  const cold=preserved(`unprepared ${scene}`,()=>lighting.drawAmbient(ctx,scene,0));
  assert.equal(cold.result,false,'unprepared rendering must be inert');
  assert.equal(cold.calls.length,0);
}
assert.equal(canvases.length,0,'only prepare may allocate texture surfaces');
lighting.prepare();
assert.equal(canvases.length,3,'three shared colored stamps');
assert.equal(counters.gradients,3,'build one radial gradient per cached stamp');
for(const canvas of canvases){
  assert.equal(canvas.width,192);assert.equal(canvas.height,192);
}
const cache=preparedCounters();
lighting.prepare();
const second=runtime.MazeBitersMenuLighting.create();
second.prepare();
assert.deepEqual(preparedCounters(),cache,'prepare and additional instances reuse immutable textures');

for(const scene of ['menu','leaderboard','entry']){
  const result=preserved(`ambient ${scene}`,()=>lighting.drawAmbient(ctx,scene,1200));
  assert.equal(images(result).length,scene==='menu'?3:2,`${scene}: bounded ambient stamp count`);
  assert.ok(images(result).every(call=>call.state.globalAlpha<=.4),`${scene}: ambient remains subtle`);
}
let firstRoomPool=null;
for(const t of [0,3500,7000,10500,14000,18000]){
  const stamps=images(preserved('steady logo wash',()=>lighting.drawAmbient(ctx,'menu',t)));
  assert.deepEqual(stamps[2].args,[140,96,744,124],'logo wash never drifts away from its wordmark');
  near(stamps[2].state.globalAlpha,.035,'logo wash does not pulse');
  if(t===0) firstRoomPool=stamps[0].args;
  if(t===3500) assert.notDeepEqual(stamps[0].args,firstRoomPool,'the surrounding room pools gently move');
}
const unknown=preserved('unknown scene',()=>lighting.drawAmbient(ctx,'gameplay',1200));
assert.equal(unknown.result,false,'ambient scope is limited to the three menu scenes');
assert.equal(unknown.calls.length,0);

// These are the actual high-score keyboard cell and action-panel dimensions.
const cellA={x:196,y:308,w:72,h:40};
const cellB={x:276,y:308,w:72,h:40};
const action={x:412,y:570,w:200,h:54};
const frameA=clone(cellA);
lighting.setFocus('keyboard','A',cellA,0);
cellA.x=-1000;cellA.y=-1000;cellA.w=1;cellA.h=1;
near(lighting.focusAlpha('keyboard','A',200),1,'initial focus settles after 200ms');
assert.ok(lighting.focusContains('keyboard','A'));

function checkClip(result,rect,label){
  for(const call of images(result)){
    const clips=call.state.clips.flat();
    assert.ok(clips.some(clip=>clip.x===rect.x&&clip.y===rect.y&&clip.w===rect.w&&clip.h===rect.h),
      `${label}: clip the glow to its own panel`);
  }
}
function checkCenter(result,rect,label){
  const stamps=images(result);
  assert.ok(stamps.length>0,`${label}: expected a visible cached stamp`);
  for(const call of stamps){
    const [x,y,w,h]=call.args;
    near(x+w/2,rect.x+rect.w/2,`${label}: copied focus center x`);
    near(y+h/2,rect.y+rect.h/2,`${label}: copied focus center y`);
  }
}
const original=preserved('copied focus rectangle',()=>lighting.drawFocusFor(ctx,'keyboard','A',200,frameA));
near(images(original)[0].state.globalAlpha,.27,'slightly stronger selected-button pool');
checkCenter(original,frameA,'copied input');
checkClip(original,frameA,'copied input');

lighting.setFocus('keyboard','B',cellB,300);
near(lighting.focusAlpha('keyboard','A',300),1,'outgoing focus starts fully lit');
near(lighting.focusAlpha('keyboard','B',300),0,'incoming focus begins at zero');
near(lighting.focusAlpha('keyboard','A',400),.5,'outgoing midpoint');
near(lighting.focusAlpha('keyboard','B',400),.5,'incoming midpoint');
const outgoing=preserved('outgoing panel only',()=>lighting.drawFocusFor(ctx,'keyboard','A',400,frameA));
checkCenter(outgoing,frameA,'outgoing panel');
checkClip(outgoing,frameA,'outgoing panel');
const incoming=preserved('incoming panel only',()=>lighting.drawFocusFor(ctx,'keyboard','B',400,cellB));
checkCenter(incoming,cellB,'incoming panel');
checkClip(incoming,cellB,'incoming panel');
const unrelated=preserved('unrelated panel',()=>lighting.drawFocusFor(ctx,'keyboard','C',400,action));
assert.equal(unrelated.calls.length,0,'drawing a third panel must not repaint either focused panel');
near(lighting.focusAlpha('keyboard','A',500),0,'outgoing focus clears at 200ms');
near(lighting.focusAlpha('keyboard','B',500),1,'incoming focus completes at 200ms');

// Repeated selection changes cannot retain a growing stack of old glows.
const keys=['A','B'];
for(let i=0;i<80;i++){
  const t=600+i*4,key=`rapid-${i}`;
  keys.push(key);
  lighting.setFocus('keyboard',key,i%2?frameA:cellB,t);
  let active=0,retained=0;
  for(const candidate of keys){
    const alpha=lighting.focusAlpha('keyboard',candidate,t);
    assert.ok(Number.isFinite(alpha)&&alpha>=0&&alpha<=1);
    if(alpha>0) active++;
    if(lighting.focusContains('keyboard',candidate)) retained++;
  }
  assert.ok(active<=2,'rapid changes retain at most two visible focus locations');
  assert.ok(retained<=2,'rapid changes must not retain invisible focus history');
  const result=preserved('rapid focus draw',()=>lighting.drawFocus(ctx,'keyboard',t));
  assert.ok(images(result).length<=4,'rapid focus drawing stays bounded');
}
const latest=keys.at(-1);
near(lighting.focusAlpha('keyboard',latest,1200),1,'latest focus settles after rapid changes');
for(const key of keys.slice(0,-1)) near(lighting.focusAlpha('keyboard',key,1200),0,'old rapid focus cleared');

lighting.setFocus('keyboard','rewind',frameA,1300);
near(lighting.focusAlpha('keyboard','rewind',50),1,'clock rewind settles current target');
near(lighting.focusAlpha('keyboard',latest,50),0,'clock rewind clears outgoing target');
lighting.setFocus('keyboard','after-gap',cellB,100);
near(lighting.focusAlpha('keyboard','after-gap',2100),1,'long gap settles current target');
near(lighting.focusAlpha('keyboard','rewind',2100),0,'long gap clears outgoing target');

lighting.setFocus('reselect','A',frameA,0);
lighting.focusAlpha('reselect','A',200);
lighting.setFocus('reselect','B',cellB,300);
const priorA=lighting.focusAlpha('reselect','A',350);
const priorB=lighting.focusAlpha('reselect','B',350);
lighting.setFocus('reselect','A',frameA,350);
near(lighting.focusAlpha('reselect','A',350),priorA,'reselect outgoing focus without a brightness jump');
near(lighting.focusAlpha('reselect','B',350),priorB,'reselection preserves the other visible pool');
lighting.focusAlpha('reselect','A',550);
lighting.setFocus('reselect','B',cellB,600);
lighting.setFocus('reselect','C',action,620);
assert.ok(lighting.focusAlpha('reselect','A',620)>0,'rapid third choice retains the strongest outgoing pool');
near(lighting.focusAlpha('reselect','B',620),0,'rapid third choice discards the weaker outgoing pool');
assert.ok(lighting.focusContains('reselect','C'),'rapid third choice keeps the latest target');

const actionCopy=clone(action);
lighting.setFocus('actions','save',action,2200);
lighting.focusAlpha('actions','save',2400);
const actionDraw=preserved('action panel focus',()=>lighting.drawFocusFor(ctx,'actions','save',2400,action));
checkCenter(actionDraw,action,'action panel');
checkClip(actionDraw,action,'action panel');
const accent=preserved('record accent',()=>lighting.drawAccent(ctx,action,2400,'record'));
assert.ok(images(accent).length>0,'record accent uses cached lighting');
for(const kind of ['record','champion','cursor']){
  const full=images(preserved(`${kind} full strength`,()=>lighting.drawAccent(ctx,action,2400,kind,1)));
  const half=images(preserved(`${kind} half strength`,()=>lighting.drawAccent(ctx,action,2400,kind,.5)));
  const defaultStrength=images(preserved(`${kind} default strength`,()=>lighting.drawAccent(ctx,action,2400,kind)));
  const clamped=images(preserved(`${kind} maximum strength`,()=>lighting.drawAccent(ctx,action,2400,kind,2)));
  assert.equal(full.length,1);assert.equal(half.length,1);
  near(half[0].state.globalAlpha,full[0].state.globalAlpha*.5,'strength scales existing accent opacity');
  near(defaultStrength[0].state.globalAlpha,full[0].state.globalAlpha,'omitted strength preserves default');
  near(clamped[0].state.globalAlpha,full[0].state.globalAlpha,'strength clamps at one');
  assert.deepEqual(half[0].args,full[0].args,'strength cannot resize or move the accent');
  for(const strength of [0,-1,NaN,Infinity,-Infinity]){
    const disabled=preserved(`${kind} disabled strength`,()=>lighting.drawAccent(ctx,action,2400,kind,strength));
    assert.equal(disabled.result,false);assert.equal(disabled.calls.length,0,'zero/invalid strength is inert');
  }
}
assert.deepEqual(action,actionCopy,'drawing and focus selection must not mutate input rectangles');
lighting.resetFocus('keyboard');
assert.equal(lighting.focusContains('keyboard','after-gap'),false);
assert.ok(lighting.focusContains('actions','save'),'channel reset must preserve other focus');
lighting.resetFocus();
assert.equal(lighting.focusContains('actions','save'),false);

// Warmed rendering may issue drawing calls, but cannot create or resize
// canvases, regenerate gradients, or touch bitmap/native font settings.
for(let i=0;i<300;i++){
  const t=3000+i*16;
  lighting.setFocus('warm','item',frameA,t);
  preserved('warm ambient',()=>lighting.drawAmbient(ctx,['menu','leaderboard','entry'][i%3],t));
  preserved('warm focus',()=>lighting.drawFocus(ctx,'warm',t,frameA));
  preserved('warm accent',()=>lighting.drawAccent(ctx,action,t,'record'));
  if(i>=13) near(lighting.focusAlpha('warm','item',t),1,'same-key updates must not restart the fade');
}
assert.deepEqual(preparedCounters(),cache,'warmed frames must reuse all texture surfaces and gradients');
assert.equal(counters.fontWrites,0,'lighting does not change glyph or font rendering');
const diagnostics=lighting.diagnostics();
assert.equal(diagnostics.prepared,true);
assert.equal(diagnostics.canvasAllocations,3);
assert.equal(diagnostics.textureBuilds,1,'the three-texture collection is built once');
assert.deepEqual(Array.from(diagnostics.textureSizes),['192x192','192x192','192x192']);
assert.ok(diagnostics.ambientPasses>=300&&diagnostics.focusPasses>0&&diagnostics.accentPasses>=300);

// Exercise the actual engine name-slot renderer and its pulse envelope.
// Only drawing sinks are stubbed; timing, geometry selection and paint order
// come from production declarations parsed by Node, as in the other suites.
const engineSource=fs.readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
function engineDeclaration(name,kind='function'){
  const pattern=kind==='function'
    ?new RegExp(`\\bfunction\\s+${name}\\s*\\(`)
    :new RegExp(`\\b${kind}\\s+${name}\\s*=`);
  const start=engineSource.search(pattern);
  assert.ok(start>=0,`Missing production ${kind}: ${name}`);
  const delimiter=kind==='function'?'}':';';
  for(let end=engineSource.indexOf(delimiter,start);end>=0;end=engineSource.indexOf(delimiter,end+1)){
    const candidate=engineSource.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw new Error(`Unterminated production ${kind}: ${name}`);
}
const nameEvents=[];
const nativeFont=Object.freeze({marker:'original red bitmap glyphs'});
const nameContext=vm.createContext({
  ctx:{},RedFontSprites:nativeFont,
  performance:{now:()=>{throw new Error('Name-slot tests supply explicit time');}},
  drawHighScorePanel:(x,y,w,h,options)=>nameEvents.push({kind:'panel',x,y,w,h,options}),
  drawBitmapText:(target,character,x,y,options)=>nameEvents.push({kind:'glyph',character,x,y,options}),
  MenuLighting:{
    setFocus:(channel,key,rect,t)=>nameEvents.push({kind:'setFocus',channel,key,rect,t}),
    resetFocus:channel=>nameEvents.push({kind:'resetFocus',channel}),
    drawFocus:(target,channel,t,clip)=>nameEvents.push({kind:'focus',channel,t,clip}),
    drawAccent:(target,rect,t,kind,strength)=>nameEvents.push({kind:'accent',rect,t,accentKind:kind,strength})
  }
});
vm.runInContext(`'use strict';
  let highScoreNameDraft='';
  ${['HIGH_SCORE_NAME_AREAS','HIGH_SCORE_NAME_LIGHT_CLIP'].map(name=>engineDeclaration(name,'const')).join('\n')}
  ${['highScoreNameLightDraft','highScoreNameLightIndex','highScoreNameLightStartedAt'].map(name=>engineDeclaration(name,'let')).join('\n')}
  ${engineDeclaration('drawHighScoreNameSlots')}
  globalThis.nameApi={
    setDraft:value=>{highScoreNameDraft=value;},draw:drawHighScoreNameSlots,
    areas:HIGH_SCORE_NAME_AREAS,clip:HIGH_SCORE_NAME_LIGHT_CLIP,
    geometry:()=>HIGH_SCORE_NAME_AREAS,
    state:()=>({draft:highScoreNameLightDraft,index:highScoreNameLightIndex,startedAt:highScoreNameLightStartedAt})
  };
`,nameContext,{filename:'name-slot-production-extract.js',timeout:2000});
const nameApi=nameContext.nameApi;
const nameAreas=Array.from(nameApi.areas);
const nameGeometry=JSON.stringify(nameApi.areas);
let nameFrames=0;
function nameFrame(draft,t){
  nameEvents.length=0;
  nameApi.setDraft(draft);nameApi.draw(t);nameFrames++;
  assert.equal(nameApi.geometry(),nameApi.areas,'name geometry array is reused every frame');
  assert.equal(JSON.stringify(nameApi.areas),nameGeometry,'name geometry remains unchanged');
  const panels=nameEvents.filter(event=>event.kind==='panel');
  const glyphs=nameEvents.filter(event=>event.kind==='glyph');
  const accents=nameEvents.filter(event=>event.kind==='accent');
  assert.equal(panels.length,8,'paint all eight name panels');
  assert.equal(glyphs.length,draft.length,'render each existing native glyph exactly once');
  assert.ok(accents.length<=1,'only the latest letter may have an imprint');
  for(let i=0;i<nameAreas.length;i++){
    const area=nameAreas[i];
    assert.equal(nameApi.areas[i],area,'individual name rectangles are reused');
    assert.deepEqual([panels[i].x,panels[i].y,panels[i].w,panels[i].h],[area.x,area.y,area.w,area.h]);
  }
  const lightIndices=nameEvents.flatMap((event,index)=>['focus','accent'].includes(event.kind)?[index]:[]);
  const panelIndices=nameEvents.flatMap((event,index)=>event.kind==='panel'?[index]:[]);
  const glyphIndices=nameEvents.flatMap((event,index)=>event.kind==='glyph'?[index]:[]);
  assert.ok(Math.max(...panelIndices)<Math.min(...lightIndices),'all panel fills precede every light pass');
  if(glyphIndices.length) assert.ok(Math.max(...lightIndices)<Math.min(...glyphIndices),'all glyphs follow every light pass');
  for(const glyph of glyphs) assert.equal(glyph.options.fontSprites,nativeFont,'keep the native glyph sprite atlas');
  for(const event of nameEvents){
    if(event.kind==='setFocus'||event.kind==='accent') assert.ok(nameAreas.includes(event.rect),'lighting receives a cached slot rectangle');
    if(event.kind==='focus') assert.equal(event.clip,nameApi.clip,'reuse the fixed name-slot clip');
  }
  return {events:nameEvents.slice(),accents,glyphs};
}
let frame=nameFrame('',0);
assert.equal(frame.accents.length,0,'empty name has no letter imprint');
assert.equal(frame.events.find(event=>event.kind==='setFocus').rect,nameAreas[0]);
frame=nameFrame('A',10);
assert.equal(frame.accents.length,1);assert.equal(frame.accents[0].rect,nameAreas[0]);
near(frame.accents[0].strength,0,'new letter starts with zero light');
frame=nameFrame('A',65);
near(frame.accents[0].strength,1,'letter imprint peaks after 55ms');
assert.equal(frame.accents[0].accentKind,'cursor');
frame=nameFrame('A',247.5);
near(frame.accents[0].strength,.25,'letter imprint decays after its peak');
frame=nameFrame('A',430);
assert.equal(frame.accents.length,0,'letter imprint expires after 420ms');
frame=nameFrame('ABCDE',500);
assert.equal(frame.accents.length,1);assert.equal(frame.accents[0].rect,nameAreas[4],'fast growth marks only the latest slot');
frame=nameFrame('ABCDE',555);
near(frame.accents[0].strength,1,'latest fast-growth letter reaches its own peak');
frame=nameFrame('ABCDEFGH',600);
assert.equal(frame.accents[0].rect,nameAreas[7],'eight-character paste marks only the final slot');
assert.equal(frame.events.filter(event=>event.kind==='setFocus').length,0,'full name has no empty-slot cursor');
assert.equal(frame.events.filter(event=>event.kind==='resetFocus').length,1);
frame=nameFrame('ABCDEFGH',655);
near(frame.accents[0].strength,1,'final pasted letter has one bounded pulse');
frame=nameFrame('ABC',700);
assert.equal(frame.accents.length,0,'deletion creates no letter imprint');
assert.equal(frame.events.find(event=>event.kind==='setFocus').rect,nameAreas[3],'deletion returns focus to next empty slot');
frame=nameFrame('',710);
assert.equal(frame.accents.length,0);
assert.equal(frame.events.find(event=>event.kind==='setFocus').rect,nameAreas[0]);
for(let t=800;t<=1240;t+=20) nameFrame('Z',t);
assert.equal(nameApi.state().startedAt,800,'unchanged letters do not restart the imprint each frame');
// Score headings reuse the production menu sweep's mask and effect buffers.
// Check both directions, doubled cadence, cache invalidation and state safety.
const sweepTarget=makeContext({width:1152,height:864});
const sweepMask=makeCanvas(),sweepEffect=makeCanvas(),sweepStrip=makeCanvas();
const sweepFonts=[];
let sweepScores=[];
const sweepContext=vm.createContext({
  ctx:sweepTarget,RedFontSprites:nativeFont,
  currentHighScores:()=>sweepScores,
  performance:{now:()=>{throw new Error('Sweep tests supply explicit time');}},
  titleHighScoreMaskCanvas:sweepMask,titleHighScoreMaskContext:sweepMask.context,
  titleHighScoreEffectCanvas:sweepEffect,titleHighScoreEffectContext:sweepEffect.context,
  titleHighScoreSpotlightCanvas:sweepStrip,
  drawBitmapText:(target,text)=>sweepFonts.push(text),
  drawBitmapTextRuns:(target,runs)=>sweepFonts.push(runs.map(run=>run.text).join(''))
});
vm.runInContext(`
  ${['TITLE_LOGICAL_WIDTH','TITLE_LEGACY_LOGICAL_WIDTH','INTERFACE_PULSE_DIVISOR_MS',
    'INTERFACE_PULSE_CYCLE_MS','TITLE_HIGH_SCORE_Y','TITLE_HIGH_SCORE_SCALE',
    'TITLE_SCORE_SWEEP_FIRST_PULSE','TITLE_SCORE_SWEEP_EVERY_PULSES',
    'TITLE_SCORE_SWEEP_FIRST_START_MS','TITLE_SCORE_SWEEP_INTERVAL_MS',
    'TITLE_SCORE_SWEEP_ONE_WAY_MS','TITLE_SCORE_SWEEP_DURATION_MS',
    'TITLE_SCORE_SPOTLIGHT_WIDTH','TITLE_SCORE_RIGHT_EDGE_OVERLAP']
    .map(name=>engineDeclaration(name,'const')).join('\n')}
  ${['titleHighScoreMaskReady','titleHighScoreMaskHeading',
    'titleHighScoreCacheKey','titleHighScoreRunsCache']
    .map(name=>engineDeclaration(name,'let')).join('\n')}
  let titleMenuEnteredAt=0,highScoreScreenEnteredAt=0;
  ${['titleHighScoreRuns','titleHighScoreBounds','titleHighScoreSweepProgress',
    'prepareTitleHighScoreMask','drawTitleHighScoreSpotlight'].map(name=>engineDeclaration(name)).join('\n')}
  globalThis.sweepApi={progress:titleHighScoreSweepProgress,draw:drawTitleHighScoreSpotlight,
    bounds:titleHighScoreBounds,first:TITLE_SCORE_SWEEP_FIRST_START_MS,
    interval:TITLE_SCORE_SWEEP_INTERVAL_MS,duration:TITLE_SCORE_SWEEP_DURATION_MS,
    invalidate:()=>{titleHighScoreMaskReady=false;},
    enter:t=>{highScoreScreenEnteredAt=t;}};
`,sweepContext,{timeout:2000});
const sweep=sweepContext.sweepApi;
for(const heading of [false,true]){
  const first=sweep.first/(heading?2:1),interval=sweep.interval/(heading?2:1);
  assert.equal(sweep.progress(first-1,heading),-1,'wait before first sweep');
  near(sweep.progress(first,heading),0,'first sweep starts at its own screen time');
  near(sweep.progress(first+sweep.duration*.25,heading),.25,'outward timing unchanged');
  near(sweep.progress(first+sweep.duration*.75,heading),.75,'return timing unchanged');
  assert.equal(sweep.progress(first+sweep.duration+1,heading),-1,'quiet gap after return');
  near(sweep.progress(first+interval+sweep.duration*.25,heading),.25,'correct repeat cadence');
}
const sweepCache=preparedCounters();
function sweepFrame(label,phase){
  const t=sweep.first/(label===null?1:2)+sweep.duration*phase;
  sweepTarget.calls.length=0;sweepEffect.context.calls.length=0;
  sweepTarget.globalAlpha=.4;sweepTarget.globalCompositeOperation='multiply';
  const before=sweepTarget.snapshot();
  sweep.draw(t,label);
  assert.deepEqual(sweepTarget.snapshot(),before,'sweep preserves title context');
  assert.equal(sweepTarget.stackDepth(),0);
  assert.equal(sweepMask.context.stackDepth(),0);
  const effectCalls=sweepEffect.context.calls.filter(call=>call.kind==='drawImage');
  assert.equal(effectCalls.length,2,'one cached strip plus one glyph mask');
  assert.equal(effectCalls[0].image,sweepStrip);
  assert.equal(effectCalls[1].image,sweepMask);
  assert.equal(effectCalls[1].state.globalCompositeOperation,'destination-in','clip to glyph silhouettes');
  const output=sweepTarget.calls.filter(call=>call.kind==='drawImage');
  assert.equal(output.length,1,'one final composite');
  assert.equal(output[0].args[1],label===null?36:58,'align the mask with the correct text row');
  return effectCalls[0].args[0];
}
for(const label of [null,'NEW HIGH SCORE','HIGH SCORES',null]){
  const builds=sweepFonts.length;
  const left=sweepFrame(label,.1),middle=sweepFrame(label,.25),right=sweepFrame(label,.49);
  assert.ok(left<middle&&middle<right,'outward pass travels left to right');
  near(sweepFrame(label,.75),middle,'return pass retraces the same route');
  assert.equal(sweepFonts.length,builds+1,'build the glyph mask only once per heading change');
  for(let i=0;i<100;i++) sweepFrame(label,.1+i*.008);
  assert.equal(sweepFonts.length,builds+1,'active frames never rebuild glyphs');
  const bounds=sweep.bounds(label);
  near((bounds.left+bounds.right)/2,512,'all headings stay centered');
}
sweepScores=[{score:2345,name:'NEWNAME'}];
const beforeRecord=sweepFonts.length;sweepFrame(null,.25);
assert.equal(sweepFonts.length,beforeRecord+1,'a new record invalidates the menu mask');
sweep.invalidate();sweepFrame('NEW HIGH SCORE',.25);
const beforeQuality=sweepFonts.length;
sweep.invalidate();sweepFrame('NEW HIGH SCORE',.25);
assert.equal(sweepFonts.length,beforeQuality+1,'quality changes refresh the heading mask');
sweep.enter(50000);
assert.equal(sweep.progress(50001,true),-1,'re-entered screen does not inherit an old sweep');
near(sweep.progress(50000+sweep.first/2+sweep.duration*.25,true),.25,'entry time resets only heading cadence');
assert.deepEqual(preparedCounters(),sweepCache,'all sweep frames reuse surfaces without gradients or resizes');

// Run every actual title-screen branch through the real buffered presenter.
// Decorative/text helpers are recording sinks; the opaque cache construction,
// backdrop copy, screen control flow and final display copy are production code.
const titleTimeline=[];
const titleDisplay=makeCanvas(),titleBuffer=makeCanvas(),titleLayer=makeCanvas();
for(const [label,surface] of [['display',titleDisplay],['buffer',titleBuffer],['layer',titleLayer]]){
  const calls=surface.context.calls;
  calls.push=function(call){
    titleTimeline.push({target:label,...call});
    return Array.prototype.push.call(this,call);
  };
}
const titleFixture={records:[],failText:false};
const drawTitleText=()=>{
  if(titleFixture.failText) throw new Error('injected title glyph failure');
  titleTimeline.push({target:'content',kind:'glyph'});
};
const noTitleArt=()=>{};
const titleGlobals={
  canvas:titleDisplay,displayCtx:titleDisplay.context,
  titleFrameCanvas:titleBuffer,titleFrameContext:titleBuffer.context,
  titleInterfaceLayerCanvas:titleLayer,titleInterfaceLayerContext:titleLayer.context,
  performance:{now:()=>1000},RedFontSprites:nativeFont,FontSprites:nativeFont,
  MenuLighting:{drawAmbient:noTitleArt,setFocus:noTitleArt,drawFocus:noTitleArt,
    drawAccent:noTitleArt,resetFocus:noTitleArt},
  currentHighScores:()=>titleFixture.records,
  highScorePageCount:()=>Math.max(1,Math.ceil(titleFixture.records.length/10)),
  HighScoreService:null,titleHighScoreRuns:()=>[],combinedScoreTimesLabel:()=> '1.0',
  strongPulseAlpha:()=>1,titleChoicePulseAlpha:()=>1,titleChoiceFocusAlpha:()=>1,
  titleChoiceTextFilter:()=> 'none',titleQualityTextWidth:()=>240,
  drawBitmapText:drawTitleText,drawBitmapTextRuns:drawTitleText,
  tutorialActionEnabled:()=>true,MusicSettings:{option:{label:'HIGH'}},
  TITLE_MODE_HIT_AREAS:[],TITLE_LIGHT_AREAS:{},TITLE_DIFFICULTIES:['NORMAL'],TITLE_SPEEDS:['NORMAL'],
  titleFocusedChoice:'mode:1',titleDifficultyIndex:0,titleSpeedIndex:0,
  TITLE_HIGH_SCORES_HIT_AREA:{},TITLE_QUALITY_HIT_AREA:{},TITLE_HOW_TO_PLAY_HIT_AREA:{},
  TITLE_DIFFICULTY_HIT_AREA:{},TITLE_SPEED_HIT_AREA:{},TITLE_MUSIC_HIT_AREA:{},
  pendingHighScoreCandidate:null,highScoreKeyboardRow:0,highScoreKeyboardColumn:0,
  highScoreEntryStatus:'',highScoreLeaderboardAction:1,highlightedHighScoreId:null
};
for(const name of ['drawTitleMicrostars','drawStaticSpaceFrame','drawGhostedTitleConcepts',
  'drawStaticSpacePanel','prepareTitleSnakeDecorations','prepareTitlePlayerEmblems',
  'drawTitleHighScoreSpotlight','drawMazeBitersLogo','drawTitleMenuEntry','drawTitleChoiceSpotlight',
  'drawTitleFocusIndicator','drawTitleSelectionLight','drawTitleQualityText','drawLiveTutorialDemo'])
  titleGlobals[name]=noTitleArt;
const titleRuntime=vm.createContext(titleGlobals);
const qualitySource=engineDeclaration('applyDisplayQualityProfile');
function qualityBlock(firstMarker,lastMarker){
  const start=qualitySource.indexOf(firstMarker),end=qualitySource.indexOf(lastMarker,start);
  assert.ok(start>=0&&end>start,'production title resize/invalidation boundaries exist');
  return qualitySource.slice(start,end);
}
vm.runInContext(`
  ${['TITLE_LOGICAL_WIDTH','TITLE_LOGICAL_HEIGHT','TITLE_LEGACY_LOGICAL_WIDTH','TITLE_LAYOUT_SCALE',
    'TITLE_HIGH_SCORE_Y','TITLE_HIGH_SCORE_SCALE','HIGH_SCORE_PAGE_SIZE','HIGH_SCORE_NAME_CHARACTERS',
    'HIGH_SCORE_KEYBOARD_COLUMNS','HIGH_SCORE_KEYBOARD_ROWS','HIGH_SCORE_ACTIONS',
    'HIGH_SCORE_NAME_AREAS','HIGH_SCORE_NAME_LIGHT_CLIP','HIGH_SCORE_KEY_AREAS',
    'HIGH_SCORE_ENTRY_ACTION_AREAS','HIGH_SCORE_KEY_LIGHT_CLIP','HIGH_SCORE_BOARD_ACTION_AREAS',
    'HIGH_SCORE_BOARD_LIGHT_CLIP','HIGH_SCORE_ROW_LIGHT_AREAS','TUTORIAL_PAGES','TUTORIAL_ACTION_AREAS']
    .map(name=>engineDeclaration(name,'const')).join('\n')}
  let ctx=displayCtx,titleScreenMode='menu',menuLightingLastScreen=null;
  let TITLE_BACKING_WIDTH=1440,TITLE_BACKING_HEIGHT=1080;
  let titleCanvasScaleX=1.25,titleCanvasScaleY=1.25;
  let titleInterfaceLayerReady=false,titlePlayerEmblemsReady=false,titleSnakeDecorationsReady=false,titleHighScoreMaskReady=false;
  let highScoreNameDraft='',highScoreNameLightDraft='',highScoreNameLightIndex=-1,highScoreNameLightStartedAt=-Infinity;
  let highScoreScreenEnteredAt=0,highScoreLeaderboardPage=0,tutorialPage=0,tutorialAction=1;
  ${['prepareTitleInterfaceLayer','drawTitleInterfaceLayer','drawMazeBitersTitleScreen',
    'drawHighScorePanel','beginHighScoreScreen','endHighScoreScreen','drawHighScoreNameSlots',
    'drawHighScoreEntryScreen','highScoreModeAbbreviation','drawHighScoreLeaderboardScreen',
    'drawTutorialScreen','drawBufferedTitleFrame'].map(name=>engineDeclaration(name)).join('\n')}
  globalThis.titleApi={
    draw:(mode,t,page=0)=>{titleScreenMode=mode;tutorialPage=page;drawBufferedTitleFrame(t);},
    cold:()=>{titleInterfaceLayerReady=false;},
    currentContext:()=>ctx,
    pages:TUTORIAL_PAGES.length,
    resize(width,height){
      TITLE_BACKING_WIDTH=width;TITLE_BACKING_HEIGHT=height;
      titleCanvasScaleX=width/TITLE_LOGICAL_WIDTH;titleCanvasScaleY=height/TITLE_LOGICAL_HEIGHT;
      canvas.width=width;canvas.height=height;
      ${qualityBlock('titleFrameCanvas.width=TITLE_BACKING_WIDTH;','bitmapHud.width=HUD_BACKING_WIDTH;')}
      ${qualityBlock('titleInterfaceLayerCanvas.width=TITLE_BACKING_WIDTH;','firstZoomPreheated=false;')}
    }
  };
`,titleRuntime,{filename:'buffered-title-production-extract.js',timeout:2000});
const titleApi=titleRuntime.titleApi;
let bufferedFrames=0,opaqueLayer=false;
function bufferedFrame(mode,t,{cold=false,page=0}={}){
  if(cold){titleApi.cold();opaqueLayer=false;}
  titleTimeline.length=0;
  titleBuffer.context.calls.length=0;titleDisplay.context.calls.length=0;
  // A renderer must overwrite the complete buffer even if the previous frame
  // or preheating left a different transform, filter or transparency behind.
  titleBuffer.context.globalAlpha=.17;titleBuffer.context.filter='blur(2px)';
  titleBuffer.context.setTransform(3,0,0,3,7,11);
  titleApi.draw(mode,t,page);bufferedFrames++;
  for(const call of titleTimeline){
    if(call.target==='layer'&&call.kind==='fillRect'&&call.state.fillStyle==='#020604'){
      assert.deepEqual(call.args,[0,0,1152,864]);
      near(call.args[2]*call.state.transform[0],titleLayer.width,'opaque layer covers full backing width');
      near(call.args[3]*call.state.transform[3],titleLayer.height,'opaque layer covers full backing height');
      assert.equal(call.state.globalAlpha,1);opaqueLayer=true;
    }
    if(call.target==='buffer'&&call.kind==='drawImage'&&call.image===titleLayer)
      assert.ok(opaqueLayer,'cache must become fully opaque before its first buffered copy');
  }
  const bufferCalls=titleBuffer.context.calls;
  const backdrop=bufferCalls[0];
  assert.equal(backdrop.kind,'drawImage',`${mode}: first buffer paint is the cached backdrop, with no prefill`);
  assert.equal(backdrop.image,titleLayer);assert.deepEqual(backdrop.args,[0,0]);
  assert.deepEqual(backdrop.state.transform,[1,0,0,1,0,0]);
  assert.equal(backdrop.state.globalCompositeOperation,'copy');assert.equal(backdrop.state.globalAlpha,1);
  assert.equal(backdrop.state.filter,'none');assert.equal(backdrop.state.imageSmoothingEnabled,false);
  assert.equal(titleLayer.width,titleBuffer.width);assert.equal(titleLayer.height,titleBuffer.height);
  assert.equal(bufferCalls.filter(call=>call.kind==='drawImage'&&call.image===titleLayer).length,1);
  assert.equal(bufferCalls.filter(call=>call.kind==='clearRect').length,0,'no later buffer clear discards the opaque backdrop');
  const backgroundIndex=titleTimeline.findIndex(call=>call.target==='buffer');
  assert.ok(titleTimeline.findIndex(call=>call.target==='content')>backgroundIndex,'screen content follows the opaque backdrop');
  const displayCalls=titleDisplay.context.calls;
  assert.equal(displayCalls.length,1,'present exactly one completed title frame');
  assert.equal(displayCalls[0].image,titleBuffer);
  assert.deepEqual(displayCalls[0].args,[0,0,titleDisplay.width,titleDisplay.height]);
  assert.equal(displayCalls[0].state.globalCompositeOperation,'copy');assert.equal(displayCalls[0].state.globalAlpha,1);
  assert.equal(titleTimeline.at(-1).target,'display','visible presentation happens after all frame work');
  assert.equal(titleApi.currentContext(),titleDisplay.context,'restore the shared renderer context');
  for(const surface of [titleBuffer,titleLayer,titleDisplay]) assert.equal(surface.context.stackDepth(),0);
}
for(const [width,height] of [[1440,1080],[2880,2160],[1440,1080]]){
  titleApi.resize(width,height);opaqueLayer=false;
  for(const mode of ['menu','entry','leaderboard','tutorial','unknown-menu-fallback']){
    bufferedFrame(mode,1000,{cold:true});
    bufferedFrame(mode,1016);
  }
  titleFixture.records=[{id:'record',name:'PLAYER',level:7,score:12345,mode:1}];
  bufferedFrame('leaderboard',1032);titleFixture.records=[];
  bufferedFrame('tutorial',1048,{page:titleApi.pages-1});
  // First-zoom preheating clears the hidden buffer while the opaque cache
  // survives; the next warm frame must still overwrite before presentation.
  titleBuffer.context.clearRect(0,0,width,height);
  bufferedFrame('menu',1064);
}
titleFixture.failText=true;titleDisplay.context.calls.length=0;
assert.throws(()=>titleApi.draw('entry',2000),/injected title glyph failure/);
assert.equal(titleDisplay.context.calls.length,0,'a failed renderer never presents an unfinished frame');
assert.equal(titleApi.currentContext(),titleDisplay.context,'failed renderer still restores shared context');
// The optimized choice spotlight reads its existing score-shot queue directly.
// Exercise the actual pruning/progress/draw functions with no progress-array
// transforms available, and compare draw positions with the prior cubic math.
const choiceMask=makeCanvas(),choiceEffect=makeCanvas();
const choiceTarget=makeContext({width:1440,height:1080});
const choiceRuntime=vm.createContext({
  ctx:choiceTarget,performance:{now:()=>1000},
  titleChoiceSpotlightMaskCanvas:choiceMask,titleChoiceSpotlightMaskContext:choiceMask.context,
  titleChoiceSpotlightEffectCanvas:choiceEffect,titleChoiceSpotlightEffectContext:choiceEffect.context,
  titleHighScoreSpotlightCanvas:sweepStrip
});
vm.runInContext(`
  ${['TITLE_LOGICAL_WIDTH','TITLE_CHOICE_SPOTLIGHT_MS','TITLE_SCORE_SPOTLIGHT_MAX_SHOTS',
    'TITLE_CHOICE_SPOTLIGHT_HEIGHT','TITLE_SCORE_SPOTLIGHT_WIDTH',
    'titleChoiceSpotlightStartedAt','titleScoreSpotlightShots'].map(name=>engineDeclaration(name,'const')).join('\n')}
  ${engineDeclaration('activeTitleConfirmationChoice','let')}
  ${['isSimplePulseTitleChoice','isExclusiveTitleConfirmationChoice','pruneTitleScoreSpotlightShots',
    'addTitleScoreSpotlightShot','titleChoiceSpotlightProgress','drawTitleChoiceSpotlight']
    .map(name=>engineDeclaration(name)).join('\n')}
  globalThis.choiceApi={draw:drawTitleChoiceSpotlight,progress:titleChoiceSpotlightProgress,
    add:addTitleScoreSpotlightShot,queue:titleScoreSpotlightShots,duration:TITLE_CHOICE_SPOTLIGHT_MS,
    start(choice,t){titleChoiceSpotlightStartedAt[choice]=t;activeTitleConfirmationChoice=choice;},
    clear(){titleScoreSpotlightShots.length=0;activeTitleConfirmationChoice=null;}
  };
  Array.prototype.map=Array.prototype.filter=()=>{throw new Error('Per-frame spotlight progress array');};
`,choiceRuntime,{filename:'choice-spotlight-production-extract.js',timeout:2000});
const choice=choiceRuntime.choiceApi,choiceCache=preparedCounters(),shotQueue=choice.queue;
let choiceFrames=0,choiceMasks=0;
function choiceFrame(key,t,expectedProgress){
  choiceTarget.calls.length=0;choiceEffect.context.calls.length=0;choiceMask.context.calls.length=0;
  choiceTarget.globalAlpha=.37;choiceTarget.globalCompositeOperation='multiply';
  const before=choiceTarget.snapshot(),maskCount=choiceMasks,width=335.2;
  choice.draw(key,72,486,width,()=>{choiceMasks++;},t);choiceFrames++;
  assert.deepEqual(choiceTarget.snapshot(),before,'choice spotlight preserves caller state');
  assert.equal(choiceTarget.stackDepth(),0);assert.equal(choiceMask.context.stackDepth(),0);
  assert.equal(choice.queue,shotQueue,'score queue identity is reused');
  const shots=choiceEffect.context.calls.filter(call=>call.kind==='drawImage'&&call.image===sweepStrip);
  assert.equal(shots.length,expectedProgress.length,'one cached strip draw per active shot');
  if(!expectedProgress.length){
    assert.equal(choiceMasks,maskCount,'inactive choice returns before building a glyph mask');
    assert.equal(choiceTarget.calls.length,0);assert.equal(choiceEffect.context.calls.length,0);
    assert.equal(choiceMask.context.calls.length,0);return;
  }
  assert.equal(choiceMasks,maskCount+1,'one shared mask for the complete salvo');
  shots.forEach((shot,index)=>{
    const p=expectedProgress[index];
    const oldPosition=(Math.ceil(width)+176)*(3*p*p-2*p*p*p)-176;
    near(shot.args[0],oldPosition,'cached strip position retains the old smoothstep trajectory');
    assert.deepEqual(shot.args.slice(1),[0,176,48]);
  });
  const masks=choiceEffect.context.calls.filter(call=>call.kind==='drawImage'&&call.image===choiceMask);
  assert.equal(masks.length,1);assert.equal(masks[0].state.globalCompositeOperation,'destination-in');
  assert.equal(choiceTarget.calls.length,1,'a salvo uses one final composite');
  assert.deepEqual(choiceTarget.calls[0].args,[0,0,336,48,72,486,336,48]);
}
choiceFrame('quality',1000,[]);choiceFrame('scoreMultiplier',1000,[]);
choice.start('quality',1000);
choiceFrame('quality',999,[]);
choiceFrame('speed',1010,[]);
choiceFrame('highScores',1010,[]);
for(const p of [0,.125,.25,.5,.9,619/620])
  choiceFrame('quality',1000+choice.duration*p,[p]);
choiceFrame('quality',1620,[]);
choice.clear();choice.start('quality',1000);
for(const t of [1000,1030,1050]) choice.add(t);
choiceFrame('quality',1060,[60/620]);
choiceFrame('scoreMultiplier',1060,[60/620,30/620,10/620]);
assert.equal(choice.queue.length,3,'confirmation and score salvos remain independent');
choiceFrame('scoreMultiplier',1620,[590/620,570/620]);
assert.deepEqual(Array.from(choice.queue),[1030,1050],'prune the earliest shot exactly at expiry');
choiceFrame('scoreMultiplier',1670,[]);
choice.clear();choice.add(2000);choice.add(2010);
choiceFrame('scoreMultiplier',1990,[0,0]);
choice.clear();
for(let i=0;i<40;i++) choice.add(3000+i);
assert.equal(choice.queue.length,32,'rapid salvos keep the existing queue bound');
choiceFrame('scoreMultiplier',3040,Array.from(choice.queue,t=>(3040-t)/620));
assert.deepEqual(preparedCounters(),choiceCache,'choice sweeps allocate no canvases, gradients, or resizes');
console.log(`Menu lighting checks passed: shared caches, ${nameFrames} name-entry frames, heading sweeps, ${choiceFrames} choice/score salvo frames, and ${bufferedFrames} opaque buffered title frames across HD/4K rebuilds.`);
