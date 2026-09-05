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
    lineWidth:1,lineCap:'butt',lineJoin:'miter',font:'10px sans-serif',textAlign:'start',textBaseline:'alphabetic',
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
    moveTo(x,y){path.push({kind:'move',x,y});},
    lineTo(x,y){path.push({kind:'line',x,y});},
    quadraticCurveTo(cx,cy,x,y){path.push({kind:'quadratic',cx,cy,x,y});},
    closePath(){path.push({kind:'close'});},
    fill(){calls.push({kind:'fill',path:clone(path),state:clone(state)});},
    stroke(){calls.push({kind:'stroke',path:clone(path),state:clone(state)});},
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
    createLinearGradient(...args){
      counters.gradients++;
      assert.ok(args.every(Number.isFinite));
      return {addColorStop(offset,color){
        assert.ok(offset>=0&&offset<=1);assert.equal(typeof color,'string');
      }};
    },
    fillText(){throw new Error('Lighting must not repaint font glyphs');},
    strokeText(){throw new Error('Lighting must not repaint font glyphs');},
    setTransform(...matrix){state.transform=matrix;},
    translate(x,y){
      const [a,b,c,d,e,f]=state.transform;
      state.transform=[a,b,c,d,e+a*x+c*y,f+b*x+d*y];
    },
    scale(x,y){
      const [a,b,c,d,e,f]=state.transform;
      state.transform=[a*x,b*x,c*y,d*y,e,f];
    },
    rotate(angle){
      assert.ok(Number.isFinite(angle),'canvas rotation must remain finite');
      const [a,b,c,d,e,f]=state.transform,cos=Math.cos(angle),sin=Math.sin(angle);
      state.transform=[a*cos+c*sin,b*cos+d*sin,c*cos-a*sin,d*cos-b*sin,e,f];
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

for(const scene of ['menu','leaderboard','entry','tutorial']){
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

for(const scene of ['menu','leaderboard','entry','tutorial']){
  const result=preserved(`ambient ${scene}`,()=>lighting.drawAmbient(ctx,scene,1200));
  assert.equal(images(result).length,scene==='menu'?3:2,`${scene}: bounded ambient stamp count`);
  assert.ok(images(result).every(call=>call.state.globalAlpha<=.4),`${scene}: ambient remains subtle`);
}
let firstRoomPool=null;
for(const t of [0,3500,7000,10500,14000,18000]){
  const stamps=images(preserved('steady logo wash',()=>lighting.drawAmbient(ctx,'menu',t)));
  assert.deepEqual(stamps[2].args,[170,68,684,112],'logo wash stays behind the smaller Dusk Arcade wordmark');
  near(stamps[2].state.globalAlpha,.035,'logo wash does not pulse');
  if(t===0) firstRoomPool=stamps[0].args;
  if(t===3500) assert.notDeepEqual(stamps[0].args,firstRoomPool,'the surrounding room pools gently move');
}
const unknown=preserved('unknown scene',()=>lighting.drawAmbient(ctx,'gameplay',1200));
assert.equal(unknown.result,false,'ambient scope is limited to the four Dusk menu scenes');
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
  preserved('warm ambient',()=>lighting.drawAmbient(ctx,['menu','leaderboard','entry','tutorial'][i%4],t));
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
const nameEvents=[],nameSounds=[],nameNativeInput={value:''};
const nativeFont=Object.freeze({marker:'original red bitmap glyphs'});
const nameContext=vm.createContext({
  ctx:{},RedFontSprites:nativeFont,HighScoreService:null,
  highScoreNameInput:nameNativeInput,playSound:sound=>nameSounds.push(sound),
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
  let highScoreNameDraft='',highScoreEntryStatus='';
  ${['HIGH_SCORE_NAME_MAX_LENGTH','HIGH_SCORE_NAME_AREAS','HIGH_SCORE_NAME_LIGHT_CLIP'].map(name=>engineDeclaration(name,'const')).join('\n')}
  ${['highScoreNameLightDraft','highScoreNameLightIndex','highScoreNameLightStartedAt'].map(name=>engineDeclaration(name,'let')).join('\n')}
  ${engineDeclaration('drawHighScoreNameSlots')}
  ${['syncHighScoreNameInput','setHighScoreNameDraft','appendHighScoreNameCharacter',
    'deleteHighScoreNameCharacter'].map(name=>engineDeclaration(name)).join('\n')}
  globalThis.nameApi={
    setDraft:value=>{highScoreNameDraft=value;},draw:drawHighScoreNameSlots,
    setValidated:setHighScoreNameDraft,append:appendHighScoreNameCharacter,remove:deleteHighScoreNameCharacter,
    draft:()=>highScoreNameDraft,status:()=>highScoreEntryStatus,
    setStatus:value=>{highScoreEntryStatus=value;},
    areas:HIGH_SCORE_NAME_AREAS,clip:HIGH_SCORE_NAME_LIGHT_CLIP,
    geometry:()=>HIGH_SCORE_NAME_AREAS,
    state:()=>({draft:highScoreNameLightDraft,index:highScoreNameLightIndex,startedAt:highScoreNameLightStartedAt})
  };
`,nameContext,{filename:'name-slot-production-extract.js',timeout:2000});
const nameApi=nameContext.nameApi;
const nameAreas=Array.from(nameApi.areas);
const nameGeometry=JSON.stringify(nameApi.areas);
assert.equal(nameAreas.length,10,'ten reusable name cells');
assert.deepEqual(clone(nameApi.clip),{x:226,y:208,w:572,h:68});
for(let index=0;index<nameAreas.length;index++){
  assert.deepEqual([nameAreas[index].x,nameAreas[index].y,nameAreas[index].w,nameAreas[index].h],
    [236+index*56,218,48,48],'ten native-size cells remain centered without shrinking glyphs');
}
let nameFrames=0;
function nameFrame(draft,t){
  nameEvents.length=0;
  nameApi.setDraft(draft);nameApi.draw(t);nameFrames++;
  assert.equal(nameApi.geometry(),nameApi.areas,'name geometry array is reused every frame');
  assert.equal(JSON.stringify(nameApi.areas),nameGeometry,'name geometry remains unchanged');
  const panels=nameEvents.filter(event=>event.kind==='panel');
  const glyphs=nameEvents.filter(event=>event.kind==='glyph');
  const accents=nameEvents.filter(event=>event.kind==='accent');
  assert.equal(panels.length,10,'paint all ten name panels');
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
assert.equal(frame.accents[0].rect,nameAreas[7],'eight-character name still marks its latest slot');
assert.equal(frame.events.find(event=>event.kind==='setFocus').rect,nameAreas[8],
  'the ninth cell is available after a formerly full eight-character name');
frame=nameFrame('ABCDEFGHI',620);
assert.equal(frame.accents[0].rect,nameAreas[8]);
assert.equal(frame.events.find(event=>event.kind==='setFocus').rect,nameAreas[9]);
frame=nameFrame('ABCDEFGHIJ',640);
assert.equal(frame.accents[0].rect,nameAreas[9],'ten-character paste marks only the final slot');
assert.equal(frame.events.filter(event=>event.kind==='setFocus').length,0,'full name has no empty-slot cursor');
assert.equal(frame.events.filter(event=>event.kind==='resetFocus').length,1);
frame=nameFrame('ABCDEFGHIJ',695);
near(frame.accents[0].strength,1,'final pasted letter has one bounded pulse');
frame=nameFrame('ABC',700);
assert.equal(frame.accents.length,0,'deletion creates no letter imprint');
assert.equal(frame.events.find(event=>event.kind==='setFocus').rect,nameAreas[3],'deletion returns focus to next empty slot');
frame=nameFrame('',710);
assert.equal(frame.accents.length,0);
assert.equal(frame.events.find(event=>event.kind==='setFocus').rect,nameAreas[0]);
for(let t=800;t<=1240;t+=20) nameFrame('Z',t);
assert.equal(nameApi.state().startedAt,800,'unchanged letters do not restart the imprint each frame');
nameApi.setStatus('PLEASE ENTER YOUR NAME');
nameApi.setValidated('abcdefghijkl');
assert.equal(nameApi.draft(),'ABCDEFGHIJ','fallback sanitizer accepts ten characters and truncates excess');
assert.equal(nameNativeInput.value,'ABCDEFGHIJ','native input mirrors the validated ten-character draft');
assert.equal(nameApi.status(),'','editing clears a previous validation message');
let priorSounds=nameSounds.length;
assert.equal(nameApi.append('Z'),false,'the eleventh character is rejected');
assert.equal(nameApi.draft(),'ABCDEFGHIJ');assert.equal(nameSounds.length,priorSounds);
assert.equal(nameApi.remove(),true);assert.equal(nameApi.draft(),'ABCDEFGHI');
assert.equal(nameNativeInput.value,'ABCDEFGHI');
assert.equal(nameApi.append('9'),true);assert.equal(nameApi.draft(),'ABCDEFGHI9');
assert.deepEqual(nameSounds.slice(priorSounds),['Tick','Tick'],'successful edits keep the original feedback');
nameApi.setValidated('a b c 😀 !');
assert.equal(nameApi.draft(),'ABC','spaces and unsupported glyphs are never name slots');
priorSounds=nameSounds.length;
assert.equal(nameApi.append(' '),false);assert.equal(nameApi.draft(),'ABC');
assert.equal(nameSounds.length,priorSounds,'ignored spaces do not play a selection tick');
nameApi.setValidated('');assert.equal(nameApi.remove(),false,'delete on an empty name is inert');
nameContext.HighScoreService={sanitizeName:()=> '1234567890OVERFLOW'};
nameApi.setValidated('anything');
assert.equal(nameApi.draft(),'1234567890','the engine also enforces its maximum on service output');
nameContext.HighScoreService={sanitizeName:()=> ''};
nameApi.setValidated('anything');
assert.equal(nameApi.draft(),'','an empty service result stays empty instead of falling back');
nameContext.HighScoreService=null;
// Score headings reuse the production menu sweep's mask and effect buffers.
// Check both directions, doubled cadence, cache invalidation and state safety.
const sweepTarget=makeContext({width:1152,height:864});
const sweepMask=makeCanvas(),sweepEffect=makeCanvas(),sweepStrip=makeCanvas();
const sweepFonts=[],sweepFontDraws=[];
let sweepScores=[];
const sweepContext=vm.createContext({
  ctx:sweepTarget,RedFontSprites:nativeFont,
  currentHighScores:()=>sweepScores,
  performance:{now:()=>{throw new Error('Sweep tests supply explicit time');}},
  titleHighScoreMaskCanvas:sweepMask,titleHighScoreMaskContext:sweepMask.context,
  titleHighScoreEffectCanvas:sweepEffect,titleHighScoreEffectContext:sweepEffect.context,
  titleHighScoreSpotlightCanvas:sweepStrip,
  drawBitmapText:(target,text,x,y,options)=>{
    sweepFonts.push(text);sweepFontDraws.push({text,x,y,options});
  },
  drawBitmapTextRuns:(target,runs,x,y,options)=>{
    const text=runs.map(run=>run.text).join('');
    sweepFonts.push(text);sweepFontDraws.push({text,x,y,options});
  }
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
    'titleHighScoreCacheKey','titleHighScoreRunsCache','titleHighScoreTextScale']
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
for(const score of [12345,999999999]){
  sweepScores=[{score,name:'ABCDEFGHIJ'}];
  sweepFrame(null,.25);
  const bounds=sweep.bounds(),glyphs=sweepFontDraws.at(-1);
  const expected=`HIGH SCORE - ${score} ABCDEFGHIJ`;
  assert.equal(glyphs.text,expected,'the menu and mask keep all ten letters');
  assert.equal(glyphs.x,512);assert.equal(glyphs.y,0);
  assert.equal(glyphs.options.align,'center');
  near(glyphs.options.scale,Math.min(2,1024/(expected.length*16)),
    'the mask uses the same fitted native-glyph scale as the menu row');
  near(bounds.right-bounds.left,expected.length*16*glyphs.options.scale,
    'sweep bounds match the fitted mask width');
  assert.ok(bounds.left>=0&&bounds.right<=1024,'long record fits the existing logical mask');
  assert.ok(256+bounds.left*.5>=256&&256+bounds.right*.5<=768,
    'the half-scale menu record stays within its centered display area');
  const builds=sweepFonts.length;sweepFrame(null,.75);
  assert.equal(sweepFonts.length,builds,'unchanged long record reuses the fitted mask');
}
sweep.invalidate();sweepFrame('NEW HIGH SCORE',.25);
assert.equal(sweepFontDraws.at(-1).options.scale,2,
  'a fitted long menu record does not shrink the New High Score heading');
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
const titleFixture={records:[],failText:false,mazeBuilds:0,quality:'HD',qualityStages:[],mazeRasterInputs:[],
  menuReturns:0,tutorialAnnouncements:0,soloStarts:[],focusedChoices:[]};
const titleMaze=makeCanvas();titleMaze.width=576;titleMaze.height=400;
const titleLighting=runtime.MazeBitersMenuLighting.create();titleLighting.prepare();
const titleLightingDriver={...titleLighting,
  drawAmbient(target,scene,t){
    titleTimeline.push({target:'lighting',kind:'ambient',scene,t});
    return titleLighting.drawAmbient(target,scene,t);
  },
  drawFocus(target,channel,t,clip){
    titleTimeline.push({target:'lighting',kind:'focus',channel,t,clip});
    return titleLighting.drawFocus(target,channel,t,clip);
  },
  drawAccent(target,rect,t,kind,strength){
    titleTimeline.push({target:'lighting',kind:'accent',accentKind:kind,rect,t,strength});
    return titleLighting.drawAccent(target,rect,t,kind,strength);
  }
};
const p1TitleSprite=Object.freeze({player:1}),p2TitleSprite=Object.freeze({player:2});
const p1RightSprite=Object.freeze({player:1,pose:'right'});
const p2LeftSprite=Object.freeze({player:2,pose:'left'});
const aiFrontSprite=Object.freeze({player:'ai',pose:'front'});
const aiLeftSprite=Object.freeze({player:'ai',pose:'left'});
const titleGreenFont=Object.freeze({marker:'original green bitmap glyphs'});
const drawTitleText=(context,text,x,y,options)=>{
  if(titleFixture.failText) throw new Error('injected title glyph failure');
  titleTimeline.push({target:'content',kind:'glyph',text,x,y,options,state:context.snapshot()});
};
const noTitleArt=()=>{};
const titleGlobals={
  document:{createElement(tag){assert.equal(tag,'canvas');return makeCanvas();}},
  canvas:titleDisplay,displayCtx:titleDisplay.context,
  titleFrameCanvas:titleBuffer,titleFrameContext:titleBuffer.context,
  titleInterfaceLayerCanvas:titleLayer,titleInterfaceLayerContext:titleLayer.context,
  performance:{now:()=>1000},RedFontSprites:nativeFont,FontSprites:titleGreenFont,
  MenuLighting:titleLightingDriver,
  playSound:()=>{},returnToMainTitleMenu:()=>{titleFixture.menuReturns++;},
  announceTutorialPage:()=>{titleFixture.tutorialAnnouncements++;},
  focusTitleChoice:choice=>titleFixture.focusedChoices.push(choice),
  selectTitleMode:mode=>titleFixture.soloStarts.push(mode),
  mazeLayerCanvas:titleMaze,mazeRevision:1,mazeColorTheme:{name:'test-maze'},
  renderMazeLayer:()=>{
    titleFixture.mazeBuilds++;
    titleFixture.mazeRasterInputs.push(titleApi.rasterState().mazeLayerRevision);
    titleApi.stampMazeRaster();
  },
  prepareTitleLogoLayer:()=>titleFixture.qualityStages.push({kind:'logo',...titleApi.rasterState()}),
  preheatFirstGameplayZoom:()=>titleFixture.qualityStages.push({kind:'preheat',...titleApi.rasterState()}),
  hudDirty:false,
  CharacterSpriteGroups:{player:{
    p1:{normal:{Head3:p1TitleSprite,Head2:p1RightSprite}},
    p2:{normal:{Head3:p2TitleSprite,Head4:p2LeftSprite}},
    ai:{normal:{Head3:aiFrontSprite,Head4:aiLeftSprite}}
  }},
  OriginalSprites:{Head3:p1TitleSprite},
  drawTitleSprite:(sprite,x,y,filter,size)=>titleTimeline.push({target:'content',kind:'actor',sprite,x,y,filter,size}),
  currentHighScores:()=>titleFixture.records,
  highScorePageCount:()=>Math.max(1,Math.ceil(titleFixture.records.length/10)),
  HighScoreService:null,combinedScoreTimesLabel:()=> '1.0',
  strongPulseAlpha:()=>1,titleChoicePulseAlpha:()=>1,titleChoiceFocusAlpha:()=>1,
  titleChoiceTextFilter:()=> 'none',titleQualityTextWidth:()=>240,titleQualityValue:()=>titleFixture.quality,
  drawBitmapText:drawTitleText,drawBitmapTextRuns:drawTitleText,
  MusicSettings:{option:{label:'HIGH'}},
  titleFocusedChoice:'mode:1',titleDifficultyIndex:0,titleSpeedIndex:0,
  TITLE_HIGH_SCORES_HIT_AREA:{},TITLE_QUALITY_HIT_AREA:{},TITLE_HOW_TO_PLAY_HIT_AREA:{},
  TITLE_DIFFICULTY_HIT_AREA:{},TITLE_SPEED_HIT_AREA:{},TITLE_MUSIC_HIT_AREA:{},
  pendingHighScoreCandidate:null,highScoreKeyboardRow:0,highScoreKeyboardColumn:0,
  highScoreKeyboardNavigationActive:false,highScoreSubmitting:false,
  highScoreEntryStatus:'',highScoreLeaderboardAction:1,highlightedHighScoreId:null
};
for(const name of ['drawStaticSpacePanel','drawMazeBitersLogo','drawTitleChoiceSpotlight',
  'drawTitleFocusIndicator','drawTitleSelectionLight','drawTitleQualityText'])
  titleGlobals[name]=noTitleArt;
titleGlobals.drawLiveTutorialDemo=t=>titleTimeline.push({target:'world',kind:'tutorialDemo',t});
for(const name of ['drawStaticSpaceFrame','drawGhostedTitleConcepts',
  'prepareTitleSnakeDecorations','prepareTitlePlayerEmblems'])
  titleGlobals[name]=()=>titleTimeline.push({target:'decoration',kind:name});
titleGlobals.drawTitleHighScoreSpotlight=(_t,heading=null)=>
  titleTimeline.push({target:'content',kind:'headingSweep',heading,state:titleApi.currentContext().snapshot()});
const titleRuntime=vm.createContext(titleGlobals);
const qualitySource=engineDeclaration('applyDisplayQualityProfile');
const qualityThenMarker='prepareAllRenderCaches().then(';
const qualityThenStart=qualitySource.indexOf(qualityThenMarker)+qualityThenMarker.length;
const qualityThenEnd=qualitySource.indexOf(').catch(',qualityThenStart);
assert.ok(qualityThenStart>=qualityThenMarker.length&&qualityThenEnd>qualityThenStart,
  'production post-preparation continuation exists');
const qualityContinuationSource=qualitySource.slice(qualityThenStart,qualityThenEnd);
new vm.Script(`(${qualityContinuationSource})`);
function qualityBlock(firstMarker,lastMarker){
  const start=qualitySource.indexOf(firstMarker),end=qualitySource.indexOf(lastMarker,start);
  assert.ok(start>=0&&end>start,'production title resize/invalidation boundaries exist');
  return qualitySource.slice(start,end);
}
vm.runInContext(`
  ${['TITLE_LOGICAL_WIDTH','TITLE_LOGICAL_HEIGHT','TITLE_LEGACY_LOGICAL_WIDTH','TITLE_LAYOUT_SCALE',
    'TITLE_HIGH_SCORE_Y','TITLE_HIGH_SCORE_SCALE','HIGH_SCORE_PAGE_SIZE','HIGH_SCORE_NAME_CHARACTERS',
    'HIGH_SCORE_NAME_MAX_LENGTH',
    'TITLE_MODE_HIT_AREAS','TITLE_MODE_PORTRAITS','TITLE_HIGH_SCORES_HIT_AREA','TITLE_HOW_TO_PLAY_HIT_AREA',
    'TITLE_QUALITY_HIT_AREA','TITLE_DIFFICULTY_HIT_AREA','TITLE_SPEED_HIT_AREA','TITLE_MUSIC_HIT_AREA',
    'TITLE_LIGHT_AREAS','TITLE_DIFFICULTIES','TITLE_SPEEDS',
    'HIGH_SCORE_KEYBOARD_COLUMNS','HIGH_SCORE_KEYBOARD_ROWS','HIGH_SCORE_ACTIONS',
    'HIGH_SCORE_NAME_AREAS','HIGH_SCORE_NAME_LIGHT_CLIP','HIGH_SCORE_KEY_AREAS',
    'HIGH_SCORE_ENTRY_ACTION_AREAS','HIGH_SCORE_KEY_LIGHT_CLIP','HIGH_SCORE_BOARD_ACTION_AREAS',
    'HIGH_SCORE_BOARD_LIGHT_CLIP','HIGH_SCORE_ROW_LIGHT_AREAS','TUTORIAL_PAGES','TUTORIAL_ACTION_AREAS',
    'TUTORIAL_WORLD_X','TUTORIAL_WORLD_Y','TUTORIAL_WORLD_WIDTH','TUTORIAL_WORLD_HEIGHT',
    'HIGH_SCORE_BUTTON_PADDING','HIGH_SCORE_BUTTON_SHAPES','highScoreButtonRegions']
    .map(name=>engineDeclaration(name,'const')).join('\n')}
  let ctx=displayCtx,titleScreenMode='menu',menuLightingLastScreen=null;
  let TITLE_BACKING_WIDTH=1440,TITLE_BACKING_HEIGHT=1080;
  let titleCanvasScaleX=1.25,titleCanvasScaleY=1.25;
  let titleInterfaceLayerReady=false,titlePlayerEmblemsReady=false,titleSnakeDecorationsReady=false,titleHighScoreMaskReady=false;
  let mazeLayerRevision=-1;
  ${['titleInterfaceLayerScreen','titleInterfaceMazeRevision','titleInterfaceMazeTheme',
    'titleInterfaceLeaderboardRows','titleDuskLastMode','titleHighScoreCacheKey',
    'titleHighScoreRunsCache','titleHighScoreTextScale']
    .map(name=>engineDeclaration(name,'let')).join('\n')}
  let highScoreNameDraft='',highScoreNameLightDraft='',highScoreNameLightIndex=-1,highScoreNameLightStartedAt=-Infinity;
  let highScoreScreenEnteredAt=0,highScoreLeaderboardPage=0,tutorialPage=0,tutorialAction=1,tutorialScreenEnteredAt=0;
  ${engineDeclaration('terminalMicrostarsCanvas','let')}
  ${engineDeclaration('terminalMicrostarsScreen','let')}
  ${engineDeclaration('highScoreButtonCanvas','let')}
  ${engineDeclaration('titleMenuLabelRuns')}
  TITLE_MODE_HIT_AREAS.forEach(entry=>{entry.labelRuns=titleMenuLabelRuns(entry.label);});
  ${['drawTitleMicrostars','drawTerminalMicrostars','prepareTitleDuskBackdrop','drawTitleDuskFrame',
    'prepareTitleInterfaceLayer','drawTitleInterfaceLayer','drawMazeBitersTitleScreen',
    'drawTitleDuskControls','drawTitleMenuEntry','drawTitleDuskModeContext','drawTitleDuskSetting',
    'highScoreButtonPath','prepareHighScoreButtonCache','drawHighScoreButton',
    'drawHighScorePanel','prepareHighScoreEntryBackdrop','titleHighScoreRuns',
    'prepareHighScoreLeaderboardBackdrop','prepareTutorialInterfaceBackdrop','drawHighScoreEmptyState',
    'beginHighScoreScreen','endHighScoreScreen','drawHighScoreNameSlots',
    'drawHighScoreEntryScreen','highScoreModeAbbreviation','drawHighScoreLeaderboardScreen',
    'moveHighScoreEntryFocus',
    'moveHighScoreLeaderboardFocus','changeHighScorePage','activateHighScoreLeaderboardFocus',
    'tutorialActionEnabled','changeTutorialPage','moveTutorialFocus','activateTutorialFocus',
    'drawTutorialScreen','drawBufferedTitleFrame'].map(name=>engineDeclaration(name)).join('\n')}
  globalThis.titleApi={
    draw:(mode,t,page=0)=>{titleScreenMode=mode;tutorialPage=page;drawBufferedTitleFrame(t);},
    cold:()=>{titleInterfaceLayerReady=false;},
    currentContext:()=>ctx,
    focus:choice=>{titleFocusedChoice=choice;},
    areas:TITLE_LIGHT_AREAS,modes:TITLE_MODE_HIT_AREAS,
    settings:{difficulty:TITLE_DIFFICULTIES,speed:TITLE_SPEEDS},
    settingIndices:(difficulty,speed)=>{titleDifficultyIndex=difficulty;titleSpeedIndex=speed;},
    backdropKey:()=>titleInterfaceLayerScreen,
    boardRows:()=>titleInterfaceLeaderboardRows,
    boardAreas:HIGH_SCORE_BOARD_ACTION_AREAS,rowAreas:HIGH_SCORE_ROW_LIGHT_AREAS,
    boardState:()=>({page:highScoreLeaderboardPage,action:highScoreLeaderboardAction,highlight:highlightedHighScoreId}),
    setEntry:(draft,row=0,column=0)=>{
      highScoreNameDraft=draft;highScoreKeyboardRow=row;highScoreKeyboardColumn=column;
    },
    entryAreas:{name:HIGH_SCORE_NAME_AREAS,keys:HIGH_SCORE_KEY_AREAS,actions:HIGH_SCORE_ENTRY_ACTION_AREAS},
    moveEntry:moveHighScoreEntryFocus,
    entryState:()=>({row:highScoreKeyboardRow,column:highScoreKeyboardColumn,active:highScoreKeyboardNavigationActive}),
    setBoard:(page,action=1,highlight=null)=>{
      highScoreLeaderboardPage=page;highScoreLeaderboardAction=action;highlightedHighScoreId=highlight;
    },
    moveBoard:moveHighScoreLeaderboardFocus,activateBoard:activateHighScoreLeaderboardFocus,
    changeBoardPage:changeHighScorePage,
    rasterState:()=>({mazeLayerRevision,ready:titleInterfaceLayerReady,screen:titleInterfaceLayerScreen}),
    stampMazeRaster:()=>{mazeLayerRevision=mazeRevision;},
    seedFallbackRaster(screen){
      mazeLayerRevision=mazeRevision;titleInterfaceLayerReady=true;
      titleInterfaceLayerScreen=screen;titleInterfaceMazeRevision=mazeRevision;
      titleInterfaceMazeTheme=mazeColorTheme.name;
      titleInterfaceLeaderboardRows=screen==='leaderboard'?Math.max(0,Math.min(HIGH_SCORE_PAGE_SIZE,
        currentHighScores().length-highScoreLeaderboardPage*HIGH_SCORE_PAGE_SIZE)):-1;
    },
    finishQuality(normalized,activeDisplayQuality,screen,awaitingPlayerSelection=true,t=40000){
      titleScreenMode=screen;
      (${qualityContinuationSource})();
    },
    stars:()=>terminalMicrostarsCanvas,
    button:drawHighScoreButton,
    buttonCache:()=>({canvas:highScoreButtonCanvas,scale:highScoreButtonCacheScale,regions:highScoreButtonRegions}),
    pages:TUTORIAL_PAGES.length,
    tutorialPages:TUTORIAL_PAGES,tutorialAreas:TUTORIAL_ACTION_AREAS,
    setTutorial:(page,action=1)=>{tutorialPage=page;tutorialAction=action;},
    tutorialState:()=>({page:tutorialPage,action:tutorialAction}),
    moveTutorial:moveTutorialFocus,activateTutorial:activateTutorialFocus,
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
  const tutorial=mode==='tutorial',leaderboard=mode==='leaderboard',entry=mode==='entry';
  assert.equal(titleApi.backdropKey(),tutorial?'tutorial':leaderboard?'leaderboard':entry?'entry':'menu',
    'screen branches select the correct static backdrop');
  assert.ok(!titleTimeline.some(call=>call.target==='decoration'),
    'all Dusk screens exclude the terminal frame, ghost portraits and corner decorations');
  if(leaderboard||entry||tutorial){
    assert.ok(!bufferCalls.some(call=>call.kind==='strokeRect'),`${mode} has no sharp terminal frames`);
    assert.ok(!bufferCalls.some(call=>call.kind==='fillRect'&&call.state.fillStyle==='rgba(1,7,6,.97)'),
      `${mode} does not cover its Dusk backdrop with the old opaque terminal`);
    assert.ok(!bufferCalls.some(call=>call.image===titleApi.stars()),
      `${mode} has only its baked Dusk stars, never a duplicate terminal star pass`);
  }
  if(!tutorial&&!leaderboard&&!entry){
    assert.ok(!titleTimeline.some(call=>call.text==='SELECT GAME'),'main menu has no obsolete pulsing headline');
    const sweep=titleTimeline.find(call=>call.kind==='headingSweep');
    near(sweep.state.transform[0],titleDisplay.width/1024/2,'main record sweep uses half-size native geometry');
    near(sweep.state.transform[4],256*titleDisplay.width/1024,'main record remains horizontally centered');
    near(sweep.state.transform[5],18*titleDisplay.height/768,'main record uses its new top offset');
  }
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

// Focus and idle animation reuse the complete Dusk backdrop: the actual maze,
// rounded normal controls, microstars and veil are rasterized only on invalidation.
titleApi.focus('mode:1');bufferedFrame('menu',20000);bufferedFrame('menu',20200);
const warmDusk=preparedCounters(),warmDuskOps=titleLayer.context.calls.length;
const warmMazeBuilds=titleFixture.mazeBuilds;
for(let frame=0;frame<120;frame++) bufferedFrame('menu',20216+frame*16);
assert.deepEqual(preparedCounters(),warmDusk,'idle Dusk frames allocate no surfaces, gradients or resizes');
assert.equal(titleLayer.context.calls.length,warmDuskOps,'idle Dusk frames do not repaint the static backdrop');
assert.equal(titleFixture.mazeBuilds,warmMazeBuilds,'idle Dusk frames do not invoke maze rasterization');

for(const [index,entry] of Array.from(titleApi.modes).entries()){
  titleApi.focus(`mode:${entry.mode}`);bufferedFrame('menu',30000+index*300);
  const labels=titleTimeline.filter(call=>call.kind==='glyph'&&Array.isArray(call.text)&&
    call.text.length&&call.y>=218&&call.y<428);
  assert.equal(labels.length,6,'every frame retains all six mode labels');
  for(const mode of titleApi.modes){
    const label=labels.find(call=>call.text.map(run=>run.text).join('')===mode.label);
    assert.ok(label,'render the unchanged numeric shortcut and mode label');
    assert.equal(label.x,mode.x+24);assert.equal(label.y,mode.y+19);
    assert.equal(label.options.scale,1.5);
    assert.ok(label.x+mode.label.length*16*label.options.scale<=mode.x+mode.w-24,
      'each native mode label fits within its rounded button');
    for(const run of label.text)
      assert.ok(run.fontSprites===nativeFont||run.fontSprites===titleGreenFont,'use only the original bitmap font atlases');
  }
  const actors=titleTimeline.filter(call=>call.kind==='actor');
  const expectedActors={
    1:[p1TitleSprite],5:[p1TitleSprite,p2TitleSprite],
    2:[p1RightSprite,p2LeftSprite],3:[p1RightSprite,aiLeftSprite],
    4:[p1RightSprite,aiFrontSprite,p2LeftSprite],0:[aiFrontSprite]
  }[entry.mode];
  assert.deepEqual(actors.map(actor=>actor.sprite),expectedActors,
    'mode portraits show actual participants, palettes, order and facing');
  for(let i=0;i<actors.length;i++){
    assert.equal(actors[i].size,32);assert.equal(actors[i].filter,'none');
    assert.equal(actors[i].y,459);
    if(i) assert.equal(actors[i].x-actors[i-1].x,40,'native portraits have an eight-pixel gap');
  }
  const hint=titleTimeline.find(call=>call.text===entry.hint);
  assert.ok(actors[0].x>=64&&hint.x+entry.hint.length*16*.82<=960,
    'even three actors plus the explanation fit within menu margins');
  assert.ok(actors.at(-1).x+32<hint.x,'portrait group cannot overlap its explanation');
  assert.ok(titleTimeline.some(call=>call.text===entry.hint),'show the selected mode explanation');
}
const lastHint=titleApi.modes.at(-1).hint;
titleApi.focus('highScores');bufferedFrame('menu',32000);
assert.ok(titleTimeline.some(call=>call.text===lastHint),'utility focus preserves the last selected mode context');

for(let index=0;index<5;index++){
  titleApi.settingIndices(index,index);titleFixture.quality=index%2?'4K':'HD';
  titleGlobals.MusicSettings.option.label=['OFF','LOW','MEDIUM','HIGH','HIGH'][index];
  bufferedFrame('menu',33000+index*300);
  for(const [choice,label,value] of [
    ['difficulty','DIFFICULTY',titleApi.settings.difficulty[index]],
    ['speed','SPEED',titleApi.settings.speed[index]],
    ['quality','QUALITY',titleFixture.quality],
    ['music','MUSIC',titleGlobals.MusicSettings.option.label]
  ]){
    const area=titleApi.areas[choice],center=area.x+area.w/2;
    const heading=titleTimeline.find(call=>call.text===label&&call.x===center);
    const setting=titleTimeline.find(call=>call.text===value&&call.x===center&&call.y===area.y+36);
    assert.ok(heading&&setting,'each setting displays its real heading and current value');
    assert.ok(value.length*16*setting.options.scale<=area.w-20,'long setting values fit without clipping');
    assert.equal(setting.options.fontSprites,choice==='quality'?titleGreenFont:nativeFont,
      'setting values preserve their native palette');
  }
}
assert.equal(titleFixture.mazeBuilds,warmMazeBuilds,'focus, hint and setting updates never regenerate the maze backdrop');
assert.equal(titleLayer.context.calls.length,warmDuskOps,'changing controls leaves cached normal buttons untouched');

titleApi.focus('mode:1');bufferedFrame('menu',35000);bufferedFrame('menu',35200);
for(let index=0;index<24;index++){
  const key=index%2?'music':'mode:5';titleApi.focus(key);
  bufferedFrame('menu',35210+index*10);
  const selected=titleBuffer.context.calls.filter(call=>call.image===titleApi.buttonCache().canvas);
  assert.ok(selected.length<=2,'rapid control handovers draw at most two selected button states');
  for(const stamp of selected){
    const [sx,sy,sw,sh]=stamp.args;
    const regionIndex=titleApi.buttonCache().regions.findIndex(region=>
      region.x===sx&&region.y===sy&&region.w===sw&&region.h===sh);
    assert.equal(regionIndex%2,1,'normal control states remain in the static backdrop');
  }
}

let mazeBuilds=titleFixture.mazeBuilds;
titleGlobals.mazeRevision++;bufferedFrame('menu',36000);
assert.equal(titleFixture.mazeBuilds,++mazeBuilds,'new maze revision rebuilds the menu backdrop once');
bufferedFrame('menu',36016);assert.equal(titleFixture.mazeBuilds,mazeBuilds);
titleGlobals.mazeColorTheme={name:'next-maze'};bufferedFrame('menu',36300);
assert.equal(titleFixture.mazeBuilds,++mazeBuilds,'maze theme change invalidates the backdrop');
bufferedFrame('menu',36600,{cold:true});
assert.equal(titleFixture.mazeBuilds,++mazeBuilds,'late art/cache invalidation repaints the current menu');
bufferedFrame('entry',37000);
assert.equal(titleFixture.mazeBuilds,++mazeBuilds,'entry prepares its own native Dusk backdrop');
const entryBackdropOps=titleLayer.context.calls.length;
bufferedFrame('entry',37016);
assert.equal(titleLayer.context.calls.length,entryBackdropOps,'entry retains its cached rounded relief');
assert.equal(titleFixture.mazeBuilds,mazeBuilds,'warm entry never rebuilds its maze');
bufferedFrame('tutorial',37300);
assert.equal(titleFixture.mazeBuilds,++mazeBuilds,'tutorial prepares its own native Dusk backdrop');
const tutorialBackdropOps=titleLayer.context.calls.length;
bufferedFrame('tutorial',37316);
assert.equal(titleLayer.context.calls.length,tutorialBackdropOps,'tutorial retains its cached Dusk backdrop');
assert.equal(titleFixture.mazeBuilds,mazeBuilds,'warm tutorial never rerasterizes its Dusk maze');
bufferedFrame('menu',37600);
assert.equal(titleFixture.mazeBuilds,++mazeBuilds,'returning from tutorial restores the menu backdrop');

// Writing, name-light pulses and keyboard navigation reuse the native entry
// desk. Ten slots need only ten copies of the existing 48x48 control stamp.
let entryChecks=0;
for(const [width,height] of [[1440,1080],[2880,2160],[1440,1080]]){
  titleApi.resize(width,height);opaqueLayer=false;titleApi.setEntry('');
  bufferedFrame('entry',47000);
  const fills=titleTimeline.filter(call=>call.target==='layer'&&call.kind==='fill');
  assertRoundedBounds(fills.find(call=>call.path?.[0]?.x===180&&call.path[0].y===146),
    160,146,704,490,20,'entry desk');
  assertRoundedBounds(fills.find(call=>call.path?.[0]?.x===236&&call.path[0].y===210),
    224,210,576,64,12,'ten-character recessed writing well');
  const warm=preparedCounters(),ops=titleLayer.context.calls.length,builds=titleFixture.mazeBuilds;
  const drafts=['','A','ABC','ABCDEFGH','ABCDEFGHI','ABCDEFGHIJ','ABCDEFGHI',''];
  for(let index=0;index<48;index++){
    const draft=drafts[index%drafts.length],row=index<40?Math.floor(index/8):5;
    titleApi.setEntry(draft,row,row===5?index%3:index%8);
    bufferedFrame('entry',47016+index*16);entryChecks++;
    const glyphs=titleTimeline.filter(call=>call.kind==='glyph'&&call.y===226);
    assert.equal(glyphs.length,draft.length,'all entered characters remain visible at their original size');
    glyphs.forEach((glyph,letter)=>{
      assert.equal(glyph.text,draft[letter]);assert.equal(glyph.options.scale,2);
      assert.equal(glyph.x,260+letter*56);assert.equal(glyph.options.fontSprites,nativeFont);
    });
    assert.ok(titleTimeline.some(call=>call.text==='UP TO 10 CHARACTERS - NO SPACES'));
    assert.ok(titleTimeline.some(call=>call.text==='EMPTY NAMES ARE NEVER SAVED'));
    assert.deepEqual(preparedCounters(),warm,'typing and focus reuse every canvas, gradient and size');
    assert.equal(titleLayer.context.calls.length,ops,'typing never repaints the cached entry desk');
    assert.equal(titleFixture.mazeBuilds,builds,'entry focus never rerasterizes the maze');
  }
  for(const change of [()=>titleGlobals.mazeRevision++,()=>{titleGlobals.mazeColorTheme={name:`entry-${width}`};}]){
    const prior=titleFixture.mazeBuilds;change();bufferedFrame('entry',48100);
    assert.equal(titleFixture.mazeBuilds,prior+1,'maze and theme invalidate entry just like the menu');
    const ready=preparedCounters(),layerOps=titleLayer.context.calls.length;
    bufferedFrame('entry',48116);
    assert.deepEqual(preparedCounters(),ready);assert.equal(titleLayer.context.calls.length,layerOps);
  }
}
titleApi.setEntry('',0,0);
assert.equal(titleApi.moveEntry('left'),true);assert.equal(titleApi.entryState().column,7,'keyboard wraps across eight columns');
assert.equal(titleApi.moveEntry('right'),true);assert.equal(titleApi.entryState().column,0);
assert.equal(titleApi.entryState().active,true,'arrow input activates virtual-keyboard selection');
titleApi.setEntry('',4,4);assert.equal(titleApi.moveEntry('down'),true);
assert.deepEqual(clone(titleApi.entryState()),{row:5,column:1,active:true},'down from keys selects SAVE');
assert.equal(titleApi.moveEntry('right'),true);assert.equal(titleApi.entryState().column,2);
assert.equal(titleApi.moveEntry('up'),true);
assert.deepEqual(clone(titleApi.entryState()),{row:4,column:6,active:true},'up returns from actions to the keyboard');
titleGlobals.highScoreSubmitting=true;
assert.equal(titleApi.moveEntry('left'),false,'submitting keeps the original navigation lock');
titleGlobals.highScoreSubmitting=false;titleApi.setEntry('');
assert.deepEqual(clone(titleApi.entryAreas.actions).map(({x,y,w,h})=>[x,y,w,h]),
  [[180,570,200,54],[412,570,200,54],[644,570,200,54]],'entry action hit areas remain unchanged');
assert.deepEqual(clone(titleApi.entryAreas.keys[0]),{key:'key:0',x:196,y:308,w:72,h:40});
titleFixture.records=[{id:'fit',name:'ABCDEFGHIJ',score:999999999,level:1,mode:1}];
bufferedFrame('menu',48300);
const fittedMenuText=titleTimeline.find(call=>call.kind==='glyph'&&Array.isArray(call.text)&&call.y===36);
const fittedLabel=fittedMenuText.text.map(run=>run.text).join('');
assert.equal(fittedLabel,'HIGH SCORE - 999999999 ABCDEFGHIJ');
near(fittedMenuText.options.scale,1024/(fittedLabel.length*16),'visible menu text uses the same long-record scale as its mask');
titleFixture.records=[];

// The leaderboard owns its own backdrop key: native rounded relief and only the
// visible row bands. Score values, focus, highlights and equally full pages
// remain dynamic; none of them may repaint or allocate the static surface.
const boardRecords=Array.from({length:25},(_,index)=>({
  id:`record-${index}`,name:index===0?'ABCDEFGHIJ':`R${String(index).padStart(2,'0')}`,level:index+1,
  score:25000-index*500,mode:index%5+1
}));
Object.defineProperty(boardRecords,'slice',{value:()=>{
  throw new Error('Leaderboard must not allocate a visible-record slice each frame');
}});
let leaderboardChecks=0;
const boardGlyphs=()=>titleTimeline.filter(call=>call.kind==='glyph'&&
  call.y>=206&&call.y<=557&&(call.y-206)%39===0);
const boardAccents=()=>titleTimeline.filter(call=>call.kind==='accent'&&
  ['champion','record'].includes(call.accentKind));
function assertRoundedBounds(call,x,y,w,h,r,label){
  assert.ok(call?.path,`${label}: cached path exists`);
  assert.deepEqual(call.path[0],{kind:'move',x:x+r,y},`${label}: round leading corner`);
  assert.equal(call.path.filter(point=>point.kind==='quadratic').length,4,`${label}: four soft corners`);
  const points=call.path.filter(point=>Number.isFinite(point.x));
  assert.deepEqual([Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),
    Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))],
  [x,y,x+w,y+h],`${label}: exact bounds`);
}
function assertBoardBackdropRows(count){
  assert.equal(titleTimeline.filter(call=>call.target==='layer'&&call.kind==='clearRect').length,1,
    'a changed row count or quality rebuilds the leaderboard backdrop exactly once');
  const cachedFills=titleTimeline.filter(call=>call.target==='layer'&&call.kind==='fill');
  const shell=cachedFills.find(call=>call.path?.[0]?.x===82&&call.path[0].y===146);
  assertRoundedBounds(shell,64,146,896,448,18,'table shell');
  const rows=cachedFills.filter(call=>call.path?.[0]?.x===84&&call.path[0].y>=199);
  assert.equal(rows.length,count,'bake exactly the visible records, never fake empty slots');
  rows.forEach((row,index)=>{
    assertRoundedBounds(row,76,199+39*index,872,34,8,`row ${index}`);
    assert.ok(199+39*index+34<=594,'row bands stay inside their table shell');
    near(row.state.transform[0],titleDisplay.width/1024,'row relief uses native display density');
  });
  assert.equal(titleApi.boardRows(),count,'cache key records the visible row count');
}
function assertBoardPage(page,count){
  const glyphs=boardGlyphs(),names=glyphs.filter(call=>call.x===184);
  assert.equal(names.length,count,'render only this page of records');
  assert.equal(glyphs.length,count*5,'each record retains all five text columns');
  for(let index=0;index<count;index++){
    const rank=page*10+index+1,y=206+39*index;
    assert.equal(names[index].text,boardRecords[rank-1].name);
    assert.ok(names[index].x+names[index].text.length*16*names[index].options.scale<408,
      'a complete ten-character name remains separate from the mode column');
    assert.ok(glyphs.some(call=>call.x===92&&call.y===y&&call.text===String(rank).padStart(2,'0')),
      'ranks remain global across pages and align with the rounded row');
  }
  for(const glyph of glyphs){
    assert.equal(glyph.state.globalAlpha,1,'native record text is fully legible');
    assert.equal(glyph.state.filter,'none');assert.equal(glyph.state.shadowBlur,0);
  }
  const headers=titleTimeline.filter(call=>call.kind==='glyph'&&call.y===160);
  assert.deepEqual(headers.map(call=>call.text),count?['RANK','NAME','MODE','LEVEL','SCORE']:[],
    'empty boards omit meaningless column headings');
  if(count) assert.deepEqual(headers.map(call=>[call.x,call.options.align||'left']),
    [[92,'left'],[184,'left'],[408,'left'],[690,'center'],[930,'right']],
    'all headings align with their unchanged record columns');
  assert.ok(titleTimeline.some(call=>call.text===`PAGE ${page+1} OF ${Math.max(1,Math.ceil(titleFixture.records.length/10))}`));
  leaderboardChecks++;
}
function assertWarmBoard(t){
  const warm=preparedCounters(),ops=titleLayer.context.calls.length,builds=titleFixture.mazeBuilds;
  bufferedFrame('leaderboard',t);
  assert.deepEqual(preparedCounters(),warm,'steady leaderboard allocates no canvas, gradient or resize');
  assert.equal(titleLayer.context.calls.length,ops,'steady leaderboard never repaints cached relief');
  assert.equal(titleFixture.mazeBuilds,builds,'steady leaderboard does not invoke maze rasterization');
}
for(const [width,height] of [[1440,1080],[2880,2160],[1440,1080]]){
  titleApi.resize(width,height);opaqueLayer=false;
  titleFixture.records=boardRecords;titleApi.setBoard(0,1,'record-2');
  bufferedFrame('leaderboard',38000);assertBoardBackdropRows(10);assertBoardPage(0,10);
  assert.deepEqual(boardAccents().map(call=>call.accentKind),['champion','record']);
  assert.deepEqual(boardAccents().map(call=>clone(call.rect)),[0,2].map(index=>clone(titleApi.rowAreas[index])),
    'champion and new-record accents retain their established row geometry');
  const firstRowGlyph=titleTimeline.indexOf(boardGlyphs()[0]);
  assert.ok(titleTimeline.every((call,index)=>call.kind!=='accent'||index<firstRowGlyph),
    'every record light is painted before any row text');
  titleApi.setBoard(0,2,'record-0');assertWarmBoard(38200);
  assert.deepEqual(boardAccents().map(call=>call.accentKind),['record'],
    'a new champion gets one emerald record accent, not overlapping gold and emerald');
  boardRecords[0].score++;assertWarmBoard(38216);boardRecords[0].score--;
  titleApi.setBoard(1,0,'record-12');assertWarmBoard(38400);assertBoardPage(1,10);
  assert.deepEqual(boardAccents().map(call=>call.accentKind),['record'],
    'page two does not invent another champion');
  for(let frame=0;frame<24;frame++) assertWarmBoard(38416+frame*16);
  titleApi.setBoard(2,2,null);bufferedFrame('leaderboard',38800);
  assertBoardBackdropRows(5);assertBoardPage(2,5);assert.equal(boardAccents().length,0);
  assertWarmBoard(38816);
  titleFixture.records=[];titleApi.setBoard(0);bufferedFrame('leaderboard',39000);
  assertBoardBackdropRows(0);assertBoardPage(0,0);assert.equal(boardAccents().length,0);
  const emptyActor=titleTimeline.filter(call=>call.kind==='actor');
  assert.equal(emptyActor.length,1);assert.equal(emptyActor[0].sprite,p1TitleSprite);
  assert.deepEqual([emptyActor[0].x,emptyActor[0].y,emptyActor[0].size],[492,268,40],
    'empty state keeps original character identity without a giant portrait');
  for(const text of ['NO SCORES YET','PLAY A GAME AND CLAIM THE FIRST PLACE'])
    assert.ok(titleTimeline.some(call=>call.kind==='glyph'&&call.text===text));
  assert.ok(titleTimeline.some(call=>call.text==='ARROWS - SPACE   D-PAD - A   ESC - BACK'),
    'idle board keeps keyboard and gamepad controls discoverable');
  assertWarmBoard(39016);
}
titleFixture.records=boardRecords;titleApi.setBoard(0,1,'record-0');
assert.equal(titleApi.moveBoard('up'),false,'vertical input does not change the action row');
assert.equal(titleApi.moveBoard('right'),true);assert.equal(titleApi.boardState().action,2);
for(const page of [1,2,0]){
  assert.equal(titleApi.activateBoard(),true,'NEXT activates from keyboard/gamepad focus');
  assert.equal(titleApi.boardState().page,page);assert.equal(titleApi.boardState().highlight,'');
}
assert.equal(titleApi.moveBoard('right'),true);assert.equal(titleApi.boardState().action,0);
assert.equal(titleApi.activateBoard(),true);assert.equal(titleApi.boardState().page,2,'PREV wraps to the last page');
assert.equal(titleApi.moveBoard('left'),true);assert.equal(titleApi.boardState().action,2,'left wraps across the action row');
assert.equal(titleApi.moveBoard('left'),true);assert.equal(titleApi.boardState().action,1);
const menuReturns=titleFixture.menuReturns;
assert.equal(titleApi.activateBoard(),true);assert.equal(titleFixture.menuReturns,menuReturns+1,'BACK retains its original destination');
titleApi.setBoard(99);bufferedFrame('leaderboard',39300);assertBoardPage(2,5);
titleFixture.records=[boardRecords[0]];bufferedFrame('leaderboard',39400);
assert.equal(titleApi.boardState().page,0,'a shrinking score list clamps an obsolete page');
assertBoardBackdropRows(1);assertBoardPage(0,1);
for(const action of [0,2]){
  titleApi.setBoard(0,action);assert.equal(titleApi.activateBoard(),false,'disabled single-page controls do not navigate');
  assert.equal(titleApi.boardState().page,0);assertWarmBoard(39500+action*16);
  const labels=titleTimeline.filter(call=>call.kind==='glyph'&&['PREV','BACK','NEXT'].includes(call.text));
  assert.deepEqual(labels.map(call=>call.state.globalAlpha),[.3,1,.3],'disabled paging remains visibly distinct from BACK');
}
assert.deepEqual(clone(titleApi.boardAreas).map(({x,y,w,h})=>[x,y,w,h]),
  [[176,650,200,54],[412,650,200,54],[648,650,200,54]],'paging pointer hit areas remain unchanged');
titleGlobals.HighScoreService={isShared:()=>true};assertWarmBoard(39600);
assert.ok(titleTimeline.some(call=>call.text==='TOP 25 - WORLD'));
titleGlobals.HighScoreService=null;titleGlobals.highScoreEntryStatus='SYNCING';assertWarmBoard(39616);
assert.ok(titleTimeline.some(call=>call.text==='TOP 25 - THIS DEVICE'));
assert.ok(titleTimeline.some(call=>call.text==='SYNCING'));
assert.ok(!titleTimeline.some(call=>call.text==='ARROWS - SPACE   D-PAD - A   ESC - BACK'),
  'status and fallback footer hint do not overlap');
titleGlobals.highScoreEntryStatus='';
for(const change of [()=>titleGlobals.mazeRevision++,()=>{titleGlobals.mazeColorTheme={name:'board-maze'};}]){
  const builds=titleFixture.mazeBuilds;change();bufferedFrame('leaderboard',39700);
  assert.equal(titleFixture.mazeBuilds,builds+1,'maze revision and theme also invalidate the leaderboard');
  assertBoardBackdropRows(1);assertWarmBoard(39716);
}
titleFixture.records=[];titleApi.setBoard(0);

// A repeated HD/4K switch can finish decoding after a frame has already marked
// fallback wall/title rasters current. Execute the actual async continuation
// against those apparently warm caches, including the real backdrop rebuilder.
let qualityCompletionChecks=0;
for(const [quality,width,height] of [['HD',1440,1080],['4K',2880,2160],['HD',1440,1080]]){
  titleApi.resize(width,height);opaqueLayer=false;
  for(const screen of ['menu','entry','leaderboard','tutorial']){
    bufferedFrame(screen,40000+qualityCompletionChecks*300);
    const backdropKey=screen;
    titleApi.seedFallbackRaster(backdropKey);
    const layerOps=titleLayer.context.calls.length,builds=titleFixture.mazeBuilds;
    titleFixture.qualityStages.length=0;titleDisplay.context.calls.length=0;
    titleApi.finishQuality(quality,quality,screen,true,40100+qualityCompletionChecks*300);
    const [logo,preheat]=titleFixture.qualityStages;
    assert.equal(logo.kind,'logo');assert.equal(preheat.kind,'preheat');
    assert.equal(logo.mazeLayerRevision,-1,'discard the fallback maze raster after cache preparation');
    assert.equal(logo.ready,false,'discard the fallback title raster before rebuilding its logo/backdrop');
    assert.ok(titleLayer.context.calls.length>layerOps,'a warm-looking fallback backdrop is actually rebuilt');
    assert.equal(preheat.ready,true,'preheating starts only after the new title backdrop is prepared');
    assert.equal(preheat.screen,backdropKey,'post-prepare rebuild respects the active screen');
    assert.equal(titleFixture.mazeBuilds,builds+1,
      'all four Dusk screens invoke their maze-backed cache rebuilder');
    assert.equal(titleFixture.mazeRasterInputs.at(-1),-1,
      'the maze renderer sees an invalid raster even when its atlas was already decoded');
    assert.equal(titleDisplay.context.calls.length,1,'present one completed frame after preparation');
    assert.equal(titleDisplay.context.calls[0].image,titleBuffer);
    const settledLayerOps=titleLayer.context.calls.length,settledBuilds=titleFixture.mazeBuilds;
    bufferedFrame(screen,40116+qualityCompletionChecks*300);
    assert.equal(titleLayer.context.calls.length,settledLayerOps,'the repaired backdrop stays cached on the next frame');
    assert.equal(titleFixture.mazeBuilds,settledBuilds,'the next frame does not rerasterize the repaired maze');
    qualityCompletionChecks++;
  }
}
bufferedFrame('menu',46000);titleApi.seedFallbackRaster('menu');
const guardedState=clone(titleApi.rasterState()),guardedOps=titleLayer.context.calls.length;
titleFixture.qualityStages.length=0;titleDisplay.context.calls.length=0;
titleApi.finishQuality('4K','HD','menu',true,46100);
assert.deepEqual(clone(titleApi.rasterState()),guardedState,'an obsolete quality callback cannot invalidate the current profile');
assert.equal(titleLayer.context.calls.length,guardedOps);
assert.equal(titleFixture.qualityStages.length,0);assert.equal(titleDisplay.context.calls.length,0);
titleGlobals.hudDirty=false;titleFixture.qualityStages.length=0;
titleApi.finishQuality('HD','HD','menu',false,46200);
assert.equal(titleApi.rasterState().mazeLayerRevision,-1,'gameplay must refresh its maze after the title-cache warmup');
assert.equal(titleGlobals.hudDirty,true,'gameplay HUD is marked dirty after its quality change');
assert.equal(titleDisplay.context.calls.length,0,'a quality callback during gameplay never presents a menu frame');

// All four screens bake their stars into the shared native backdrop. The
// tutorial's deterministic field alone excludes the complete maze panel.
const cachedStars=()=>titleTimeline.filter(call=>call.target==='layer'&&call.kind==='fillRect'&&
  call.args[2]===1&&call.args[3]===1).map(call=>({args:call.args,fillStyle:call.state.fillStyle}));
bufferedFrame('menu',1200,{cold:true});
const menuStars=cachedStars();
assert.ok(menuStars.length>100,'the Dusk room keeps a sparse native microstar field');
const expectedTutorialStars=menuStars.filter(({args:[x,y,w,h]})=>
  !(x+w>74*1.125&&x<950*1.125&&y+h>188*1.125&&y<488*1.125));
let tutorialChecks=0;
for(const [width,height] of [[1440,1080],[2880,2160],[1440,1080]]){
  titleApi.resize(width,height);opaqueLayer=false;titleApi.setTutorial(0);
  bufferedFrame('tutorial',1220);
  assert.equal(titleApi.stars(),null,'tutorial never allocates the obsolete transparent star canvas');
  assert.deepEqual(cachedStars(),expectedTutorialStars,
    'tutorial preserves Dusk star colors/positions only outside its complete maze panel');
  const fills=titleTimeline.filter(call=>call.target==='layer'&&call.kind==='fill');
  assertRoundedBounds(fills.find(call=>call.path?.[0]?.x===82&&call.path[0].y===140),
    64,140,896,456,18,'tutorial folio');
  assertRoundedBounds(fills.find(call=>call.path?.[0]?.x===88&&call.path[0].y===188),
    74,188,876,300,14,'tutorial demonstration surround');
  const warm=preparedCounters(),ops=titleLayer.context.calls.length,builds=titleFixture.mazeBuilds;
  for(let page=0;page<titleApi.pages;page++)for(let action=0;action<3;action++){
    titleApi.setTutorial(page,action);
    bufferedFrame('tutorial',1240+page*96+action*32,{page});tutorialChecks++;
    assert.deepEqual(preparedCounters(),warm,'page/focus changes allocate no title surface, gradient or resize');
    assert.equal(titleLayer.context.calls.length,ops,'all seven pages reuse one sculpted tutorial backdrop');
    assert.equal(titleFixture.mazeBuilds,builds,'tutorial page changes do not rerasterize the Dusk room');
    assert.equal(titleApi.stars(),null,'no second star pass appears on later tutorial pages');
    const ambience=titleTimeline.filter(call=>call.kind==='ambient');
    assert.equal(ambience.length,1);assert.equal(ambience[0].scene,'tutorial');
    const demo=titleTimeline.findIndex(call=>call.kind==='tutorialDemo');
    assert.ok(titleTimeline.indexOf(ambience[0])<demo,
      'room ambience paints below the live maze, never over its actors or flashlight');
    const buttonPasses=titleTimeline.flatMap((call,index)=>call.target==='buffer'&&
      call.kind==='drawImage'&&call.image===titleApi.buttonCache().canvas?[index]:[]);
    const focusPass=titleTimeline.findIndex(call=>call.kind==='focus'&&call.channel==='tutorial');
    assert.equal(buttonPasses.length,3,'tutorial actions reuse exactly three cached controls');
    assert.ok(buttonPasses.every(index=>index<focusPass),'all action surfaces precede the soft focus pass');
    if(page===0&&action===0)assert.equal(titleLighting.focusContains('tutorial',0),false,
      'disabled first-page PREV cannot carry an active selection glow');
    const expected=titleApi.tutorialPages[page];
    assert.ok(titleTimeline.some(call=>call.text===expected.title));
    for(const line of expected.lines)assert.ok(titleTimeline.some(call=>call.text===line),
      'the original instructional copy remains legible on every page');
    assert.ok(titleTimeline.some(call=>call.text===`PAGE ${page+1} OF 7`));
    const labels=titleTimeline.filter(call=>call.kind==='glyph'&&call.y===665);
    assert.ok(labels.every(label=>titleTimeline.indexOf(label)>focusPass),
      'native action labels remain above every focus-light stamp');
    assert.deepEqual(labels.map(call=>call.text),['PREV',page===6?'PLAY SOLO':'NEXT','EXIT']);
    assert.deepEqual(labels.map(call=>call.state.globalAlpha),page?[1,1,1]:[.28,1,1],
      'the first page keeps PREV disabled while EXIT is always available');
  }
  for(const change of [()=>titleGlobals.mazeRevision++,()=>{titleGlobals.mazeColorTheme={name:`tutorial-${width}`};}]){
    const prior=titleFixture.mazeBuilds;change();bufferedFrame('tutorial',2200);
    assert.equal(titleFixture.mazeBuilds,prior+1,'maze and theme invalidate tutorial just like every Dusk screen');
    const ready=preparedCounters(),layerOps=titleLayer.context.calls.length;
    bufferedFrame('tutorial',2216);
    assert.deepEqual(preparedCounters(),ready);assert.equal(titleLayer.context.calls.length,layerOps);
  }
}
assert.deepEqual(clone(titleApi.tutorialAreas).map(({x,y,w,h})=>[x,y,w,h]),
  [[176,650,200,54],[412,650,200,54],[648,650,200,54]],'tutorial pointer hit areas remain unchanged');
titleApi.setTutorial(0,1);
assert.equal(titleApi.moveTutorial('left'),true);assert.equal(titleApi.tutorialState().action,2,
  'first-page focus skips disabled PREV and reaches EXIT');
assert.equal(titleApi.moveTutorial('right'),true);assert.equal(titleApi.tutorialState().action,1);
for(let page=1;page<7;page++){
  assert.equal(titleApi.activateTutorial(),true);assert.equal(titleApi.tutorialState().page,page);
  assert.equal(titleApi.tutorialState().action,1,'NEXT keeps page navigation selected');
}
assert.equal(titleApi.moveTutorial('down'),false,'page seven cannot advance past the tutorial');
const priorSoloStarts=titleFixture.soloStarts.length,priorTutorialReturns=titleFixture.menuReturns;
assert.equal(titleApi.activateTutorial(),true);
assert.equal(titleFixture.menuReturns,priorTutorialReturns+1);
assert.equal(titleFixture.soloStarts.length,priorSoloStarts+1);assert.equal(titleFixture.soloStarts.at(-1),1);
assert.equal(titleFixture.focusedChoices.at(-1),'mode:1','PLAY SOLO reuses the normal solo start path');
titleApi.setTutorial(4,2);assert.equal(titleApi.activateTutorial(),true);
assert.equal(titleFixture.menuReturns,priorTutorialReturns+2,'EXIT always returns to the main menu');
assert.equal(titleFixture.soloStarts.length,priorSoloStarts+1,'EXIT never starts a game');
titleApi.setTutorial(4,1);assert.equal(titleApi.moveTutorial('up'),true);
assert.equal(titleApi.tutorialState().page,3,'up retains direct previous-page navigation');
assert.equal(titleApi.moveTutorial('down'),true);assert.equal(titleApi.tutorialState().page,4);
for(const mode of ['entry','leaderboard','menu']){
  bufferedFrame(mode,2400);
  assert.equal(titleApi.stars(),null,`${mode} does not revive the dormant terminal star canvas`);
}

// Exercise the actual live-demo presentation independently of its simulation
// (all real chapter timelines and collisions remain in test-tutorial.mjs).
// Only world/cache providers and gameplay drawing sinks are substituted.
const demoMaze=makeCanvas();demoMaze.width=768;demoMaze.height=256;
const demoTarget=makeContext({width:1440,height:1080});
const demoEvents=[],demoPaintOrder=[];
demoTarget.calls.push=function(call){
  demoPaintOrder.push(call);
  return Array.prototype.push.call(this,call);
};
const recordDemoEvent=event=>{demoEvents.push(event);demoPaintOrder.push(event);};
let demoFixture=null;
const demoGlobals={
  ctx:demoTarget,tutorialMazeCanvas:demoMaze,FontSprites:titleGreenFont,RedFontSprites:nativeFont,
  tutorialWorldAt:t=>{demoEvents.push({kind:'clock',t});return demoFixture;},
  prepareTutorialMazeCache:page=>demoEvents.push({kind:'mazeCache',page}),
  drawLiveTutorialWorld:(world,t)=>recordDemoEvent({kind:'world',world,t,state:demoTarget.snapshot()}),
  drawBitmapText:(target,text,x,y,options)=>recordDemoEvent({kind:'glyph',text,x,y,options,state:target.snapshot()}),
  isSpawnProtected:p=>!!p.shield,isPowerMode:p=>!!p.power,isUniqueLeader:p=>!!p.leader,
  TUTORIAL_CHAPTERS:Array.from({length:7},()=>[{},{}])
};
const demoContext=vm.createContext(demoGlobals);
vm.runInContext(`
  ${['TUTORIAL_WORLD_X','TUTORIAL_WORLD_Y','TUTORIAL_WORLD_WIDTH','TUTORIAL_WORLD_HEIGHT']
    .map(name=>engineDeclaration(name,'const')).join('\n')}
  let tutorialPage=0;
  ${['highScoreButtonPath','drawTutorialCaptionPlate','drawTutorialDuelCards','drawLiveTutorialDemo']
    .map(name=>engineDeclaration(name)).join('\n')}
  globalThis.demoApi={draw:drawLiveTutorialDemo,setPage:page=>{tutorialPage=page;}};
`,demoContext,{filename:'tutorial-chrome-production-extract.js',timeout:2000});
const demoWarm=preparedCounters();
let demoChecks=0;
for(const [index,state] of ['NORMAL','SCORE LEADER','POWER MODE','SPAWN SHIELD','EATEN'].entries()){
  demoFixture={now:1200,chapter:1,chapterName:'RICOCHET AND ESCAPE',transitionAlpha:0,
    status:'MAGNETIC RICOCHET',detail:'HOLD A SAFE TURN',
    duel:true,showCount:true,snakes:[{},{}],powerPlayer:{powerModeUntil:3400},
    players:[1,2].map(id=>({id,score:id*1250,leader:index>=1,power:index>=2,shield:index>=3,dead:index>=4}))};
  for(let page=0;page<7;page++){
    demoEvents.length=0;demoPaintOrder.length=0;demoTarget.calls.length=0;demoContext.demoApi.setPage(page);
    demoTarget.setTransform(1.25,0,0,1.25,0,0);
    const before=demoTarget.snapshot(),t=9000+page*100;
    demoContext.demoApi.draw(t);demoChecks++;
    assert.deepEqual(demoTarget.snapshot(),before,'live-demo chrome restores its caller context');
    assert.equal(demoTarget.stackDepth(),0);
    assert.deepEqual(demoEvents.filter(event=>event.kind==='clock'),[{kind:'clock',t}],
      'presentation requests the same live timeline exactly once');
    assert.deepEqual(demoEvents.filter(event=>event.kind==='mazeCache'),[{kind:'mazeCache',page}],
      'presentation retains the original per-page maze-cache selection');
    const maze=demoTarget.calls.filter(call=>call.kind==='drawImage');
    assert.equal(maze.length,1);assert.equal(maze[0].image,demoMaze);
    assert.deepEqual(maze[0].args,[0,0,768,256,80,194,864,288],
      'the native maze destination and scale do not change');
    assertRoundedBounds({path:maze[0].state.clips.at(-1)},80,194,864,288,8,'live maze clipping');
    assert.equal(maze[0].state.imageSmoothingEnabled,false,'the maze remains pixel-sharp');
    const world=demoEvents.filter(event=>event.kind==='world');
    assert.equal(world.length,1);assert.equal(world[0].world,demoFixture);assert.equal(world[0].t,t);
    assert.deepEqual(world[0].state.clips,maze[0].state.clips,
      'all original gameplay actors and effects share the exact same rounded maze clip');
    const fills=demoTarget.calls.filter(call=>call.kind==='fill');
    for(const x of [128,570])assertRoundedBounds(
      fills.find(call=>call.path?.[0]?.x===x+12&&call.path[0].y===241),x,241,326,65,12,'duel status card');
    assertRoundedBounds(fills.find(call=>call.path?.[0]?.x===168&&call.path[0].y===198),
      160,198,672,30,8,'live status caption');
    assertRoundedBounds(fills.find(call=>call.path?.[0]?.x===120&&call.path[0].y===452),
      112,452,800,25,8,'live detail caption');
    assertRoundedBounds(fills.find(call=>call.path?.[0]?.x===852&&call.path[0].y===199),
      844,199,94,25,8,'power timer');
    assert.ok(160+672<844,'status and power plates have a visible gap');
    assert.equal(demoEvents.filter(event=>event.kind==='glyph'&&event.text===state).length,2,
      'duel cards retain the original death/shield/power/leader priority labels');
    for(const text of ['P1 GREEN  01250','P2 PINK  02500','SNAKES 02','POWER 2.2','DEMO 2 OF 2'])
      assert.ok(demoEvents.some(event=>event.text===text));
    const chapterLabel=demoEvents.find(event=>event.kind==='glyph'&&event.text==='RICOCHET AND ESCAPE');
    assert.ok(chapterLabel,'multi-part demonstrations identify the current chapter');
    assert.deepEqual([chapterLabel.x,chapterLabel.y,chapterLabel.options.scale],[124,493,.5]);
    assert.equal(chapterLabel.options.align||'left','left');
    const chapterCount=demoEvents.find(event=>event.text==='DEMO 2 OF 2');
    assert.deepEqual([chapterCount.x,chapterCount.y,chapterCount.options.align],[900,493,'right']);
    assert.ok(chapterLabel.x+chapterLabel.text.length*16*chapterLabel.options.scale<
      chapterCount.x-chapterCount.text.length*16*chapterCount.options.scale,
      'chapter identity and progress have separate readable positions');
    assert.ok(!demoTarget.calls.some(call=>call.kind==='strokeRect'||call.kind==='fillRect'),
      'live overlays contain no old rectangular terminal plates');
    assert.deepEqual(preparedCounters(),demoWarm,
      'live caption and duel-card animation allocates no canvas, gradient or resize');
  }
}
demoFixture.duel=false;demoFixture.powerPlayer=null;demoFixture.showCount=false;
demoTarget.calls.length=0;demoEvents.length=0;demoPaintOrder.length=0;demoContext.demoApi.draw(10000);demoChecks++;
assert.equal(demoTarget.calls.filter(call=>call.kind==='fill').length,2,
  'ordinary pages retain only their two quiet live caption plates');
assert.ok(!demoEvents.some(event=>event.text?.startsWith('P1 GREEN')||event.text?.startsWith('POWER ')));
assert.deepEqual(preparedCounters(),demoWarm);

// The final lesson keeps its single centered counter separate from the
// outcome caption; clearing the last snake must not print SNAKES 00 twice.
demoContext.demoApi.setPage(6);demoFixture.showCount=true;
for(const [status,snakes] of [['ONLY THE HEAD REMAINS',[{}]],['LEVEL CLEARED',[]]]){
  demoFixture.status=status;demoFixture.snakes=snakes;
  demoTarget.calls.length=0;demoEvents.length=0;demoPaintOrder.length=0;
  demoContext.demoApi.draw(10200);demoChecks++;
  const counts=demoEvents.filter(event=>event.kind==='glyph'&&event.text.includes('SNAKES'));
  assert.equal(counts.length,1,'one snake counter is painted before and after clearing');
  assert.equal(counts[0].text,`SNAKES ${String(snakes.length).padStart(2,'0')}`);
  assert.deepEqual([counts[0].x,counts[0].y,counts[0].options.align],[512,242,'center'],
    'the remaining snake count keeps its original centered position');
  assert.equal(demoEvents.filter(event=>event.kind==='glyph'&&event.text===status).length,1,
    'the outcome uses its own caption without duplicating the numeric count');
  assert.deepEqual(preparedCounters(),demoWarm,'the clear counter and caption need no new render resources');
}

// The directional cue is a physical-looking key, not just a chevron. Its
// cap stays upright while only the complete arrow rotates with the command.
const cueTarget=makeContext({width:1440,height:1080});
const cueContext=vm.createContext({ctx:cueTarget});
vm.runInContext(`
  const TILE=16;
  ${engineDeclaration('highScoreButtonPath')}
  ${engineDeclaration('drawTutorialInputCue')}
  globalThis.cueApi=drawTutorialInputCue;
`,cueContext,{filename:'tutorial-input-key-production-extract.js',timeout:2000});
const cueWarm=preparedCounters(),cueCell=Object.freeze({x:5,y:3});
let cueChecks=0;
const cueCapPositions=[],cueFaceOpacities=[];
for(const scale of [1440/1024,2880/1024])for(const t of [0,Math.PI*150,Math.PI*300,Math.PI*450,Math.PI*600]){
  let uprightCap=null;
  for(const direction of [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]){
    cueTarget.calls.length=0;
    cueTarget.globalAlpha=.37;cueTarget.strokeStyle='#123456';cueTarget.lineWidth=3;
    cueTarget.lineCap='square';cueTarget.lineJoin='bevel';
    cueTarget.filter='contrast(120%)';cueTarget.shadowBlur=4;cueTarget.shadowColor='#ff00ff';
    cueTarget.shadowOffsetX=2;cueTarget.shadowOffsetY=-3;cueTarget.globalCompositeOperation='multiply';
    cueTarget.setTransform(scale,0,0,scale,17,23);
    const before=cueTarget.snapshot();
    cueContext.cueApi(cueCell,direction,t);cueChecks++;
    assert.deepEqual(cueTarget.snapshot(),before,'directional key restores its caller drawing state');
    assert.equal(cueTarget.stackDepth(),0);
    const fills=cueTarget.calls.filter(call=>call.kind==='fill');
    assert.equal(fills.length,3,'the key uses only its restrained halo, base and face');
    assert.equal(cueTarget.calls.filter(call=>call.kind==='stroke').length,3,
      'only the fine rim, arrow shaft and point are stroked');
    const cap=fills.find(call=>call.state.fillStyle==='#08201e'&&
      call.path.filter(point=>point.kind==='quadratic').length===4);
    assert.ok(cap,'the cue has a visible rounded keycap');
    const pulse=.5+.5*Math.sin(t/300),keyOpacity=.34+.4*pulse;
    near(cap.state.globalAlpha,before.globalAlpha*keyOpacity,
      'the whole key gently blinks with the real-time pulse while respecting caller transparency');
    cueFaceOpacities.push(cap.state.globalAlpha/before.globalAlpha);
    for(const call of cueTarget.calls.filter(call=>call.state.fillStyle!=='#91ffe6'||call.kind!=='fill'))
      near(call.state.globalAlpha,cap.state.globalAlpha,'base, face, rim and arrow blink together');
    const [a,b,c,d,e,f]=cap.state.transform;
    near(a,scale,'keycap keeps the caller scale');near(d,scale,'keycap keeps the caller scale');
    near(b,0,'keycap never rotates with the arrow');near(c,0,'keycap never rotates with the arrow');
    if(uprightCap===null)uprightCap={path:cap.path,transform:cap.state.transform};
    else assert.deepEqual({path:cap.path,transform:cap.state.transform},uprightCap,
      'all four directions share the same upright physical key');
    const capPoints=cap.path.filter(point=>Number.isFinite(point.x));
    const capY=(Math.min(...capPoints.map(point=>point.y))+Math.max(...capPoints.map(point=>point.y)))/2;
    cueCapPositions.push((f-23)/scale+capY);
    const arrowPaths=cueTarget.calls.filter(call=>call.kind==='stroke'&&
      !call.path.some(point=>point.kind==='quadratic'));
    assert.equal(arrowPaths.length,2,'the cue has both an arrow shaft and a separate two-sided point');
    const [arrow,point]=arrowPaths;
    assert.equal(arrow.path.filter(point=>point.kind==='line').length,1);
    assert.equal(point.path.filter(point=>point.kind==='line').length,2);
    const start=arrow.path.findIndex(point=>point.kind==='move');
    const tail=arrow.path[start],tip=arrow.path[start+1];
    assert.equal(tip.kind,'line','the first arrow segment is a continuous shaft');
    assert.deepEqual(point.state.transform,arrow.state.transform,'shaft and point rotate together');
    assert.deepEqual(point.path[1],tip,'the two-sided point meets the full arrow shaft');
    const matrix=arrow.state.transform;
    const sx=(matrix[0]*(tip.x-tail.x)+matrix[2]*(tip.y-tail.y))/scale;
    const sy=(matrix[1]*(tip.x-tail.x)+matrix[3]*(tip.y-tail.y))/scale;
    assert.ok(sx*direction.x+sy*direction.y>=16*.3,'the full shaft points toward the requested cardinal direction');
    near(sx*direction.y-sy*direction.x,0,'the arrow shaft has no diagonal skew');
    for(const call of cueTarget.calls){
      assert.ok(['fill','stroke'].includes(call.kind),'the cue uses only flat paths');
      assert.equal(call.state.filter,'none','the cue adds no blur or filter');
      assert.equal(call.state.shadowBlur,0,'the cue adds no shadow blur');
      assert.equal(call.state.shadowOffsetX,0);assert.equal(call.state.shadowOffsetY,0);
      assert.equal(call.state.globalCompositeOperation,'source-over','key painting ignores inherited blend effects');
      assert.ok(call.state.globalAlpha>=0&&call.state.globalAlpha<=1,'cue opacity stays bounded');
      assert.ok(call.state.transform.every(Number.isFinite),'cue transforms remain finite');
      const matrix=call.state.transform,margin=call.kind==='stroke'?call.state.lineWidth/2:0;
      for(const point of call.path){
        for(const [x,y] of [[point.x,point.y],[point.cx,point.cy]]){
          if(x===undefined&&y===undefined)continue;
          assert.ok(Number.isFinite(x)&&Number.isFinite(y),'cue path coordinates remain finite');
          const worldX=(matrix[0]*x+matrix[2]*y+matrix[4]-17)/scale;
          const worldY=(matrix[1]*x+matrix[3]*y+matrix[5]-23)/scale;
          assert.ok(worldX-margin>=cueCell.x*16-1e-9&&worldX+margin<=(cueCell.x+1)*16+1e-9&&
            worldY-margin>=cueCell.y*16-1e-9&&worldY+margin<=(cueCell.y+1)*16+1e-9,
            'the complete key, rim and arrow stay within one world cell');
        }
      }
    }
    assert.deepEqual(preparedCounters(),cueWarm,'animated directional keys allocate no surface, gradient or resize');
  }
}
assert.ok(Math.max(...cueCapPositions)-Math.min(...cueCapPositions)>0,
  'the key has a restrained physical pressing motion');
assert.ok(Math.max(...cueCapPositions)-Math.min(...cueCapPositions)<=1.5,
  'the key press stays subtle instead of bouncing through the corridor');
near(Math.min(...cueFaceOpacities),.34,'the dimmest key remains visible at 34 percent');
near(Math.max(...cueFaceOpacities),.74,'the brightest key remains translucent at 74 percent');
for(const alpha of [-1,0,.25,1,2]){
  cueTarget.calls.length=0;
  const before=cueTarget.snapshot();
  cueContext.cueApi(cueCell,{x:0,y:-1},Math.PI*150,alpha);cueChecks++;
  const cap=cueTarget.calls.find(call=>call.kind==='fill'&&call.state.fillStyle==='#08201e');
  near(cap.state.globalAlpha,before.globalAlpha*Math.max(0,Math.min(1,alpha))*.74,
    'explicit cue opacity is clamped and multiplied with the blink and caller opacity');
  assert.deepEqual(cueTarget.snapshot(),before);
  assert.deepEqual(preparedCounters(),cueWarm);
}

// Exercise actual gameplay-layer ordering with lightweight native draw sinks.
// A key stays above players, consumption effects, labels and the flashlight,
// and its pulse follows real time even during a held tutorial outcome.
const worldCueTarget=makeContext({width:1440,height:1080}),worldCueEvents=[];
const worldCueSink=kind=>(...args)=>worldCueEvents.push({kind,args,state:worldCueTarget.snapshot()});
const worldCueGlobals={
  ctx:worldCueTarget,
  drawPlayerPhosphorTrail:worldCueSink('trail'),drawEgg:worldCueSink('egg'),
  drawFruit:worldCueSink('fruit'),drawSnakeEntity:worldCueSink('snake'),
  drawScorpionEntity:worldCueSink('scorpion'),drawHunter:worldCueSink('hunter'),
  drawConsumedCreatureBloom:worldCueSink('bloom'),drawPlayer:worldCueSink('player'),
  drawDeathSpriteAt:worldCueSink('death'),drawBitmapText:worldCueSink('label'),
  drawTutorialInputCue:worldCueSink('cue'),
  deathSkeletonPulseAlpha:()=>.6,isUniqueLeader:p=>p.id===1,
  snakeSegmentVisualPosition:s=>({x:s.x,y:s.y}),
  TutorialLighting:{render:worldCueSink('lighting')}
};
const worldCueContext=vm.createContext(worldCueGlobals);
vm.runInContext(`
  const TILE=16;
  ${['TUTORIAL_WORLD_COLUMNS','TUTORIAL_WORLD_ROWS','TUTORIAL_WORLD_X','TUTORIAL_WORLD_Y',
    'TUTORIAL_WORLD_WIDTH','TUTORIAL_WORLD_HEIGHT','TUTORIAL_WORLD_SCALE','TUTORIAL_LIGHT_CAMERA']
    .map(name=>engineDeclaration(name,'const')).join('\n')}
  ${engineDeclaration('drawLiveTutorialWorld')}
  globalThis.worldCueApi=drawLiveTutorialWorld;
`,worldCueContext,{filename:'tutorial-cue-order-production-extract.js',timeout:2000});
const persistentCue={x:5,y:3,direction:{x:0,y:-1},from:100,until:200};
const worldCueFixture={now:0,duel:true,clearedAt:0,
  players:[{id:1,x:5,y:3},{id:2,dead:true,deathX:7,deathY:3}],
  eggs:[{}],fruits:[{}],snakes:[{}],scorpions:[{}],hunters:[{}],blooms:[{}],
  cues:[persistentCue],showSnakeHeads:true,lastFragments:[{x:3,y:2},{x:5,y:2}]};
const worldCueWarm=preparedCounters();
let worldCueChecks=0;
for(const [gameTime,realTime] of [[99,10000],[100,10016],[150,10200],[200,10400],
  [201,10600],[1000,11000],[1000,11400]]){
  worldCueFixture.now=gameTime;worldCueEvents.length=0;
  worldCueTarget.setTransform(1.4,0,0,1.4,17,23);
  worldCueTarget.globalAlpha=.8;
  const before=worldCueTarget.snapshot(),fixtureBefore=clone(worldCueFixture);
  worldCueContext.worldCueApi(worldCueFixture,realTime);worldCueChecks++;
  assert.deepEqual(worldCueTarget.snapshot(),before,'cue ordering preserves the caller context');
  assert.equal(worldCueTarget.stackDepth(),0);
  assert.deepEqual(worldCueFixture,fixtureBefore,'presentation does not mutate the live demonstration');
  const cues=worldCueEvents.filter(event=>event.kind==='cue');
  assert.equal(cues.length,gameTime>=100?1:0,'a reached cue remains visible after its former turn-end time');
  const lighting=worldCueEvents.find(event=>event.kind==='lighting');
  assert.equal(lighting.args[3],realTime);assert.equal(lighting.args[4],gameTime,
    'the original gameplay light keeps separate real and simulation clocks');
  for(const event of worldCueEvents.filter(event=>
    ['trail','egg','fruit','snake','scorpion','hunter','bloom','player'].includes(event.kind)))
    assert.equal(event.args[1],gameTime,'native actor/effect animation still uses the simulation clock');
  if(cues.length){
    const cue=cues[0];
    assert.equal(cue.args[0],persistentCue);assert.equal(cue.args[1],persistentCue.direction);
    assert.equal(cue.args[2],realTime,'the key blink continues on real time while world time is held');
    assert.equal(worldCueEvents.at(-1),cue,'the key is the final world overlay and cannot be covered by the player');
    for(const kind of ['trail','egg','fruit','snake','scorpion','hunter','bloom','player','death','lighting','label'])
      assert.ok(worldCueEvents.some((event,index)=>event.kind===kind&&index<worldCueEvents.indexOf(cue)),
        `the cue is above the ${kind} pass`);
    assert.deepEqual(cue.state.transform,lighting.state.transform,
      'the key uses the same maze-space transform as the player and flashlight');
  }
  assert.deepEqual(preparedCounters(),worldCueWarm,'persistent cues allocate no surfaces, gradients or resizes');
}
worldCueFixture.cues=[];worldCueEvents.length=0;
worldCueContext.worldCueApi(worldCueFixture,11800);worldCueChecks++;
assert.ok(!worldCueEvents.some(event=>event.kind==='cue'),'a new chapter without cues has no stale key overlay');
assert.deepEqual(preparedCounters(),worldCueWarm);

// Chapter transitions alter only a flat, rounded veil inside the live maze.
// The world, lighting and caption passes themselves retain steady opacity,
// while the chapter row and all surrounding menu controls remain outside it.
const isDemoTransitionVeil=call=>call.kind==='fill'&&
  call.path?.[0]?.x===88&&call.path[0].y===194;
const stableDemoCalls=()=>demoTarget.calls.filter(call=>!isDemoTransitionVeil(call))
  .map(({kind,args,path,state})=>({kind,args,path,state}));
let transitionChecks=0;
demoFixture={now:1200,chapter:1,chapterName:'FRUIT EGG AND POWER',transitionAlpha:0,
  status:'POWER MODE',detail:'CHASE THE HEAD',duel:true,showCount:true,
  snakes:[{},{}],powerPlayer:{powerModeUntil:3400},
  players:[{id:1,score:1250,power:true},{id:2,score:2500,leader:true}]};
demoContext.demoApi.setPage(3);
for(const scale of [1440/1024,2880/1024]){
  let steadyCalls=null,steadyGlyphs=null;
  for(const alpha of [0,.5,1,.5,0]){
    demoFixture.transitionAlpha=alpha;
    demoTarget.calls.length=0;demoEvents.length=0;demoPaintOrder.length=0;
    demoTarget.setTransform(scale,0,0,scale,0,0);
    const before=demoTarget.snapshot();
    demoContext.demoApi.draw(10500);transitionChecks++;
    assert.deepEqual(demoTarget.snapshot(),before,'transition restores all caller drawing state');
    assert.equal(demoTarget.stackDepth(),0);
    const veils=demoTarget.calls.filter(isDemoTransitionVeil);
    assert.equal(veils.length,alpha>0?1:0,'only active transitions draw a single veil');
    if(alpha>0){
      const veil=veils[0];
      assertRoundedBounds(veil,80,194,864,288,8,'chapter transition veil');
      near(veil.state.globalAlpha,alpha,'veil alone uses the requested transition opacity');
      assert.equal(veil.state.fillStyle,'#030d11','transition uses the quiet Dusk color');
      assert.deepEqual(veil.state.transform,[scale,0,0,scale,0,0],
        'transition stays aligned to the live maze at native HD and 4K scale');
      assert.equal(demoPaintOrder.at(-1),veil,
        'the transition overlays the completed world, effects, cards and captions');
      assert.ok(demoEvents.filter(event=>event.kind==='glyph'&&event.y===493)
        .every(event=>event.y>194+288),'chapter labels remain outside the transition region');
    }
    const world=demoEvents.find(event=>event.kind==='world');
    near(world.state.globalAlpha,1,'transitions do not modulate the gameplay renderer itself');
    const glyphs=demoEvents.filter(event=>event.kind==='glyph')
      .map(({text,x,y,options,state})=>({text,x,y,options,state}));
    if(steadyCalls===null){steadyCalls=stableDemoCalls();steadyGlyphs=glyphs;}
    else{
      assert.deepEqual(stableDemoCalls(),steadyCalls,
        'apart from the veil, world and plate opacity/layout are identical throughout a transition');
      assert.deepEqual(glyphs,steadyGlyphs,
        'chapter and instructional text never pulsates or moves with transition opacity');
    }
    for(const call of demoTarget.calls){
      assert.equal(call.state.filter,'none','transitions introduce no runtime blur or filters');
      assert.equal(call.state.shadowBlur,0,'transitions introduce no runtime shadow blur');
    }
    assert.deepEqual(preparedCounters(),demoWarm,
      'transition animation reuses every surface and creates no gradients or resizes');
  }
}
demoGlobals.TUTORIAL_CHAPTERS[3]=[{}];
demoFixture.transitionAlpha=0;demoFixture.chapter=0;
demoEvents.length=0;demoTarget.calls.length=0;demoPaintOrder.length=0;
demoContext.demoApi.draw(10800);transitionChecks++;
assert.ok(!demoEvents.some(event=>event.kind==='glyph'&&event.y===493),
  'single-chapter pages omit redundant chapter identity and progress');
assert.ok(!demoTarget.calls.some(isDemoTransitionVeil),'steady single-chapter playback has no veil');
assert.deepEqual(preparedCounters(),demoWarm);

for(const mode of [2,4,5]){
  for(const winner of [1,2]){
    titleGlobals.pendingHighScoreCandidate={score:12345,level:7,mode,playerIds:[winner]};
    bufferedFrame('entry',1600);
    assert.ok(titleTimeline.some(call=>call.text===`P${winner} HIGH SCORE - ENTER YOUR NAME`),
      'DUO VS, DUO VS AI and CO-OP name the actual record holder');
  }
  titleGlobals.pendingHighScoreCandidate={score:12345,level:7,mode,playerIds:[1,2]};
  bufferedFrame('entry',1610);
  assert.ok(titleTimeline.some(call=>call.text==='P1 + P2 SHARE THIS RECORD'),
    'equal human scores keep their shared-record message');
}
for(const mode of [1,3]){
  titleGlobals.pendingHighScoreCandidate={score:12345,level:7,mode,playerIds:[1]};
  bufferedFrame('entry',1620);
  assert.ok(titleTimeline.some(call=>call.text==='ENTER YOUR NAME'),'single-human prompt remains unchanged');
}
titleGlobals.pendingHighScoreCandidate=null;
// Rounded control artwork is cached at native HD/4K density. Menu controls,
// tutorial/score buttons, keys and name slots share one packed, padded atlas.
let buttonFrames=0;
const buttonAtlas=titleApi.buttonCache().canvas;
for(const [width,height] of [[1440,1080],[2880,2160],[1440,1080]]){
  titleApi.resize(width,height);opaqueLayer=false;
  bufferedFrame('entry',1700);
  const cache=titleApi.buttonCache(),built=preparedCounters();
  assert.equal(cache.canvas,buttonAtlas,'quality switches resize one existing atlas');
  near(cache.scale,width/1024,'cached bevels use native display density');
  assert.equal(cache.regions.length,12,'six sizes, normal and selected');
  assert.ok(cache.canvas.width*cache.canvas.height*4<9000000,'packed 4K control atlas stays below 9 MB');
  assert.equal(Math.max(...cache.regions.map(region=>region.y+region.h)),cache.canvas.height);
  for(let a=0;a<cache.regions.length;a++){
    const area=cache.regions[a];
    assert.ok(area.x>=0&&area.y>=0&&area.x+area.w<=cache.canvas.width&&
      area.y+area.h<=cache.canvas.height,'every complete padded cell fits in its atlas');
    for(let b=a+1;b<cache.regions.length;b++){
      const other=cache.regions[b];
      assert.ok(!(area.x<other.x+other.w&&other.x<area.x+area.w&&
        area.y<other.y+other.h&&other.y<area.y+area.h),'packed states never overlap');
    }
  }
  assert.ok(cache.canvas.context.calls.some(call=>call.path?.filter(p=>p.kind==='quadratic').length===4),
    'each rounded outline uses four soft corners');
  const beforeOps=cache.canvas.context.calls.length;
  for(const [w,h] of [[200,54],[72,40],[48,48],[424,62],[224,48],[212,68]]){
    for(const selected of [false,true])for(const alpha of [.28,.8,1]){
      titleDisplay.context.calls.length=0;
      titleDisplay.context.globalCompositeOperation='multiply';
      titleDisplay.context.filter='blur(2px)';titleDisplay.context.shadowBlur=8;
      const before=titleDisplay.context.snapshot();
      assert.equal(titleApi.button(196,308,w,h,selected,alpha),true);buttonFrames++;
      assert.deepEqual(titleDisplay.context.snapshot(),before,'button restores caller state');
      const [stamp]=titleDisplay.context.calls;
      assert.equal(titleDisplay.context.calls.length,1,'one cached sprite per control');
      assert.equal(stamp.image,buttonAtlas);assert.equal(stamp.state.shadowBlur,0);
      assert.equal(stamp.state.filter,'none');assert.equal(stamp.state.globalAlpha,alpha);
      assert.equal(stamp.args[4],188);assert.equal(stamp.args[5],300,'padding does not move the hit area');
      near(stamp.args[6]*cache.scale,stamp.args[2],'no low-res down/up scaling');
    }
  }
  assert.equal(cache.canvas.context.calls.length,beforeOps,'normal/selected/disabled frames never rebake');
  assert.deepEqual(preparedCounters(),built,'warm buttons allocate no gradients, canvases or resizes');
  const targetBefore=titleLayer.context.snapshot(),displayBefore=titleDisplay.context.snapshot();
  titleDisplay.context.calls.length=0;titleLayer.context.calls.length=0;
  assert.equal(titleApi.button(64,218,424,62,false,1,titleLayer.context),true,
    'the same cached button can be baked into the static menu layer');
  assert.equal(titleLayer.context.calls.length,1);assert.equal(titleLayer.context.calls[0].image,buttonAtlas);
  assert.equal(titleDisplay.context.calls.length,0,'explicit cache target never paints the screen');
  assert.deepEqual(titleLayer.context.snapshot(),targetBefore,'cache target state is restored');
  assert.deepEqual(titleDisplay.context.snapshot(),displayBefore,'explicit target leaves default context untouched');
  titleDisplay.context.calls.length=0;
  assert.equal(titleApi.button(80,194,864,288,false,1),false,'maze panel is not treated as a button');
  assert.equal(titleDisplay.context.calls.length,0);
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
console.log(`Menu lighting checks passed: shared caches, ten-character validated input, ${nameFrames} name-light frames, ${entryChecks} warm Dusk-entry typing/focus checks, ${tutorialChecks} seven-page Dusk tutorial/focus checks, ${demoChecks} rounded live-demo/card frames, ${cueChecks} four-direction blinking key frames, ${worldCueChecks} persistent top-layer cue frames, ${transitionChecks} bounded chapter-transition frames, ${buttonFrames} cached rounded-button frames, ${leaderboardChecks} populated/empty/paged leaderboard checks, fitted long-record heading sweeps, ${choiceFrames} choice/score salvo frames, ${qualityCompletionChecks} post-prepare fallback-raster repairs, and ${bufferedFrames} opaque buffered title frames across HD/4K rebuilds.`);
