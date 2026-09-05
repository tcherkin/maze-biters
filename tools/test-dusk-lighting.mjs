import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the production lighting module without starting the game, opening
// a browser, or touching storage. Canvas calls retain drawing state so these
// checks cover camera alignment and compositing, not a second implementation.
const source=fs.readFileSync(new URL('../src/render/dusk-lighting.js',import.meta.url),'utf8');
const engine=fs.readFileSync(new URL('../src/engine/game.js',import.meta.url),'utf8');
const near=(actual,expected,label,tolerance=1e-9)=>assert.ok(
  Math.abs(actual-expected)<=tolerance,`${label}: expected ${expected}, received ${actual}`
);

function harness(search='',moduleSource=source){
  const canvases=[],positions=[];
  const counters={gradients:0,imageData:0,pixelUploads:0};
  function context(){
    const calls=[],paintCalls=[],stack=[];
    const result={
      calls,paintCalls,stack,globalAlpha:1,globalCompositeOperation:'source-over',
      filter:'none',imageSmoothingEnabled:false,fillStyle:'#000',
      transform:[1,0,0,1,0,0],
      state(){return {
        globalAlpha:this.globalAlpha,globalCompositeOperation:this.globalCompositeOperation,
        filter:this.filter,imageSmoothingEnabled:this.imageSmoothingEnabled,
        fillStyle:this.fillStyle,transform:[...this.transform]
      };},
      save(){stack.push(this.state());},
      restore(){assert.ok(stack.length,'restore must match save');Object.assign(this,stack.pop());},
      setTransform(...values){this.finite(values);this.transform=values;},
      translate(x,y){
        this.finite([x,y]);const [a,b,c,d,e,f]=this.transform;
        this.transform=[a,b,c,d,e+a*x+c*y,f+b*x+d*y];
      },
      rotate(angle){
        this.finite([angle]);const [a,b,c,d,e,f]=this.transform;
        const cosine=Math.cos(angle),sine=Math.sin(angle);
        this.transform=[a*cosine+c*sine,b*cosine+d*sine,
          c*cosine-a*sine,d*cosine-b*sine,e,f];
        const call={method:'rotate',angle,state:this.state()};
        calls.push(call);paintCalls.push(call);
      },
      finite(values){
        assert.ok(values.every(Number.isFinite),'all drawing coordinates must remain finite');
        assert.ok(Number.isFinite(this.globalAlpha),'drawing opacity must remain finite');
      },
      drawImage(surface,...args){
        this.finite(args);const call={method:'drawImage',surface,args,state:this.state()};
        calls.push(call);paintCalls.push(call);
      },
      fillRect(...args){
        this.finite(args);
        // A copy fill replaces the mask's pixels. On cache hits these paint
        // operations remain its content even though no new calls are issued.
        if(this.globalCompositeOperation==='copy') paintCalls.length=0;
        const call={method:'fillRect',args,state:this.state()};
        calls.push(call);paintCalls.push(call);
      },
      createRadialGradient(...args){
        this.finite(args);counters.gradients++;
        return {addColorStop(offset){assert.ok(offset>=0&&offset<=1);}};
      },
      createImageData(width,height){
        counters.imageData++;return {width,height,data:new Uint8ClampedArray(width*height*4)};
      },
      putImageData(pixels,x,y){
        this.finite([x,y]);assert.equal(pixels.data.length,pixels.width*pixels.height*4);
        counters.pixelUploads++;
      }
    };
    return result;
  }
  const sandbox=vm.createContext({URLSearchParams,location:{search},document:{
    createElement(tag){
      assert.equal(tag,'canvas');const ctx=context();
      const surface={width:300,height:150,ctx,getContext(type){assert.equal(type,'2d');return ctx;}};
      canvases.push(surface);return surface;
    }
  }});
  vm.runInContext(moduleSource,sandbox,{filename:'dusk-lighting-production.js',timeout:10000});
  const targets=[];
  return {canvases,positions,counters,
    create(width=576,height=400,options={}){
      const renderer=sandbox.MazeBitersDuskLighting.create({width,height,tile:16,
        positionFor(player,time,out){
          positions.push({player,time,out});
          out.x=player.dead?player.deathX:player.visual.x;
          out.y=player.dead?player.deathY:player.visual.y;return out;
        },
        isPowered:(player,time)=>player.powerUntil>time,...options
      });
      const target=context();targets.push(target);
      return {renderer,target,
        mask:()=>canvases.find(surface=>surface.width===width&&surface.height===height),
        maskPasses:()=>target.calls.filter(call=>call.method==='drawImage')
      };
    },
    clear(){
      for(const target of targets) target.calls.length=0;
      for(const canvas of canvases) canvas.ctx.calls.length=0;
    }
  };
}

const player=(id,x=6.125,y=4.75,extra={})=>({
  id,x:99,y:99,visual:{x,y},dir:{x:1,y:0},controllerTiltDegrees:0,powerUntil:0,...extra
});
const camera={zoom:1,x:288,y:200};

// Dusk is the only appearance, including on old experimental URLs. A draw
// produces one darkness pass with no settings badge or mode-switch API.
for(const search of ['', '?night=0', '?night=1', '?night=deep', '?night=dusk', '?night=unexpected']){
  const fixture=harness(search),view=fixture.create();
  view.renderer.prepare();view.renderer.prepare();
  view.renderer.render(view.target,[player(1)],camera,100,100);
  assert.equal(view.renderer.diagnostics().mode,'DUSK');
  near(view.renderer.diagnostics().opacity,.8,'fixed dusk opacity');
  assert.equal(typeof view.renderer.cycle,'undefined','lighting has no mode selector');
  assert.equal(view.renderer.experimental,undefined);
  assert.equal(view.renderer.diagnostics().practiceOnly,undefined);
  assert.equal(view.maskPasses().length,1,'render only the lighting, without a badge');
  assert.equal(fixture.canvases.length,3,'a single renderer owns one mask and two shared textures');
}

const h=harness(),game=h.create(),tutorial=h.create(384,128);
game.renderer.prepare();tutorial.renderer.prepare();
game.renderer.prepare();tutorial.renderer.prepare();
assert.equal(h.canvases.length,4,'game and tutorial share the same two light textures');
assert.deepEqual(h.canvases.map(surface=>`${surface.width}x${surface.height}`).sort(),
  ['256x256','384x128','512x384','576x400']);
assert.deepEqual(h.counters,{gradients:1,imageData:1,pixelUploads:1});
for(const view of [game,tutorial]){
  const diagnostics=view.renderer.diagnostics();
  assert.equal(diagnostics.prepared,true);
  assert.equal(diagnostics.maskAllocations,1);
  assert.equal(diagnostics.sharedCanvasAllocations,2);
  assert.equal(diagnostics.sharedTextureBuilds,1);
  assert.equal(diagnostics.wallOcclusion,false);
}
const mask=game.mask(),halo=h.canvases.find(surface=>surface.width===256);
const beam=h.canvases.find(surface=>surface.width===512);
assert.notEqual(mask,tutorial.mask(),'game and tutorial must not share their mutable masks');
const p1=player(1),p2=player(2,15.25,8.125,{powerUntil:1000});
const ai=player(3,20,10,{isAI:true});
const dead=player(4,0,0,{dead:true,eliminated:true,deathX:11,deathY:5});
const hiddenDead=player(5,0,0,{dead:true,hideDeathSprite:true,deathX:0,deathY:0});
const eliminated=player(6,0,0,{eliminated:true});
const roster=[p1,p2,ai,dead,hiddenDead,eliminated,null];

// Independently specified landmarks distinguish visible sub-cell positions
// from simulation cells and verify the same world-sized lights through zoom.
for(const [view,expected] of [
  [camera,[[106,84],[252,138],[328,168],[184,88]]],
  [{zoom:2,x:240,y:160},[[20,48],[312,156],[464,216],[176,56]]]
]){
  h.clear();const original=JSON.stringify(roster);
  game.renderer.render(game.target,roster,view,100,123);
  assert.equal(game.renderer.diagnostics().activeLights,4,'the visible death sprite retains a local halo');
  assert.equal(game.renderer.diagnostics().activeBeams,3,'only living humans and AI own beams');
  assert.equal(game.maskPasses().length,1,'all holes share one darkness overlay');
  const halos=mask.ctx.paintCalls.filter(call=>call.surface===halo);
  const beamPasses=mask.ctx.paintCalls.filter(call=>call.surface===beam);
  const beams=beamPasses.filter(call=>call.state.globalAlpha===1);
  assert.equal(halos.length,4);assert.equal(beams.length,3);
  assert.equal(beamPasses.length,4,'a powered owner adds one intensity pass to the cached beam');
  near(beamPasses[2].state.globalAlpha,.85,'boolean power fallback uses full beam intensity');
  for(let index=0;index<4;index++){
    const stamp=halos[index];
    const [x,y,width,height]=stamp.args;
    near(x+width/2,expected[index][0],'halo center x');
    near(y+height/2,expected[index][1],'halo center y');
    near(width,2*2.8*16*view.zoom*(index===1?1.30:1),'world-sized halo scales with camera');
    assert.equal(stamp.state.globalCompositeOperation,'destination-out');
    assert.equal(stamp.state.globalAlpha,1);
    if(index<3){
      const spot=beams[index];
      near(spot.state.transform[4],expected[index][0],'beam origin x');
      near(spot.state.transform[5],expected[index][1],'beam origin y');
      near(spot.args[2],9*16*view.zoom*(index===1?1.45:1),'dusk beam reach');
      near(spot.args[3],3.5*16*view.zoom*2,'dusk beam spread');
      assert.equal(spot.state.globalCompositeOperation,'destination-out');
    }
  }
  near(mask.ctx.paintCalls.find(call=>call.method==='fillRect').state.globalAlpha,.8,
    'each frame starts with the accepted dusk darkness');
  assert.equal(JSON.stringify(roster),original,'rendering must not mutate gameplay state');
  assert.equal(mask.ctx.stack.length,0);
}
assert.ok(h.positions.every(call=>call.time===123),'visual positions use the supplied game clock');
const firstOutput=h.positions.find(call=>call.player===p1).out;
assert.ok(h.positions.filter(call=>call.player===p1).every(call=>call.out===firstOutput),
  'reuse each light\'s visual position object');

// The tutorial mask lives in its own logical scene. The caller supplies the
// stage translation and scale; lighting must preserve and use that transform.
const tutorialCamera={zoom:1,x:192,y:64},tutor=player(7,5.25,2.5);
tutorial.target.globalAlpha=.37;tutorial.target.filter='contrast(1.2)';
tutorial.target.globalCompositeOperation='multiply';tutorial.target.imageSmoothingEnabled=false;
tutorial.target.setTransform(4,0,0,4,112,192);
const before=tutorial.target.state(),gamePasses=game.renderer.diagnostics().renderPasses;
h.clear();tutorial.renderer.render(tutorial.target,[tutor],tutorialCamera,116,123);
const tutorialStamp=tutorial.mask().ctx.paintCalls.find(call=>call.surface===halo);
near(tutorialStamp.args[0]+tutorialStamp.args[2]/2,92,'tutorial local light center x');
near(tutorialStamp.args[1]+tutorialStamp.args[3]/2,48,'tutorial local light center y');
const tutorialPass=tutorial.maskPasses()[0];
assert.equal(tutorialPass.surface,tutorial.mask());
assert.deepEqual(tutorialPass.args,[0,0,384,128]);
assert.deepEqual(tutorialPass.state.transform,[4,0,0,4,112,192]);
assert.equal(tutorialPass.state.globalAlpha,1);
assert.equal(tutorialPass.state.globalCompositeOperation,'source-over');
assert.equal(tutorialPass.state.filter,'none');
assert.deepEqual(tutorial.target.state(),before,'restore every inherited target state field');
assert.equal(tutorial.target.stack.length,0);
assert.equal(game.renderer.diagnostics().renderPasses,gamePasses,'tutorial rendering does not advance game diagnostics');
assert.equal(mask.ctx.calls.length,0,'tutorial rendering does not modify the gameplay mask');

// A frozen clock, missing players, and final elimination must never reveal
// daylight. Every prepared renderer still composites one complete dusk mask.
for(const [label,remaining,lightCount] of [
  ['pause',roster,4],['visible death',[dead],1],['hidden death',[hiddenDead],0],
  ['empty roster',[],0],['eliminated living player',[eliminated],0],['no subjects',[null],0]
]){
  h.clear();game.renderer.render(game.target,remaining,camera,132,123);
  assert.equal(game.maskPasses().length,1,`${label} must retain dusk`);
  assert.equal(game.renderer.diagnostics().activeLights,lightCount);
  near(game.renderer.diagnostics().opacity,.8,`${label} opacity`);
}

// Match death-light visibility to the actual fading death sprite. A partial
// fade changes its local halo alone, while an invisible corpse emits no light.
const deathHarness=harness(),deathTimes=[];
const deathView=deathHarness.create(576,400,{
  deathLightAlpha(actor,time){deathTimes.push(time);return actor.deathAlpha;}
});
deathView.renderer.prepare();
const deathHalo=deathHarness.canvases.find(surface=>surface.width===256);
const deathBeam=deathHarness.canvases.find(surface=>surface.width===512);
for(const [requested,expected] of [[0,0],[-2,0],[.5,.5],[1,1],[3,1]]){
  const corpse={...dead,deathAlpha:requested};
  deathHarness.clear();deathView.renderer.render(deathView.target,[corpse,p1],camera,100,1234);
  const stamps=deathView.mask().ctx.paintCalls.filter(call=>call.surface===deathHalo);
  const beams=deathView.mask().ctx.paintCalls.filter(call=>call.surface===deathBeam);
  assert.equal(stamps.length,expected?2:1,'invisible death sprites cannot leave a lamp behind');
  if(expected) near(stamps[0].state.globalAlpha,expected,'death fade affects the corpse halo');
  near(stamps.at(-1).state.globalAlpha,1,'death fade must not leak onto living halos');
  assert.equal(beams.length,1);near(beams[0].state.globalAlpha,1,'living beams keep full opacity');
  assert.equal(deathView.maskPasses().length,1,'death fade does not reveal daylight');
  near(deathView.renderer.diagnostics().opacity,.8,'death fade preserves the dusk mask');
}
assert.ok(deathTimes.every(time=>time===1234),'death fading uses the supplied game clock');

// Power changes distance and soft-light intensity continuously. The boost is
// a second draw of the same cached texture, and never widens the beam or leaks
// opacity into the next actor. Death halos do not query either power API.
const powerHarness=harness(),powerCalls=[];
const powerView=powerHarness.create(576,400,{
  powerStrength(actor,time){
    assert.equal(!!actor.dead,false,'dead actors must not request power strength');
    powerCalls.push({actor,time});return actor.strength??0;
  },
  isPowered(){throw new Error('The strength callback must override boolean power fallback');}
});
powerView.renderer.prepare();
const powerHalo=powerHarness.canvases.find(surface=>surface.width===256);
const powerBeam=powerHarness.canvases.find(surface=>surface.width===512);
const powerAllocations=powerHarness.canvases.length,powerTextureCounts={...powerHarness.counters};
for(const [requested,strength] of [[-.5,0],[0,0],[.5,.5],[1,1],[2,1]]){
  const poweredActor=player(9,10,5,{strength:requested});
  powerHarness.clear();
  powerView.renderer.render(powerView.target,[poweredActor,p1,dead],camera,200,321);
  const halos=powerView.mask().ctx.paintCalls.filter(call=>call.surface===powerHalo);
  const beams=powerView.mask().ctx.paintCalls.filter(call=>call.surface===powerBeam);
  near(halos[0].args[2],2*2.8*16*(1+.30*strength),'power halo size');
  near(beams[0].args[2],9*16*(1+.45*strength),'power distance at zero, half, and full strength');
  near(beams[0].args[3],3.5*16*2,'power preserves the accepted beam spread');
  assert.equal(beams.length,strength>0?3:2,'only positive power adds a second beam pass');
  near(beams[0].state.globalAlpha,1,'the primary beam always retains full alpha');
  if(strength>0){
    const boost=beams[1];
    assert.equal(boost.surface,beams[0].surface,'reuse the identical cached beam texture');
    assert.deepEqual(boost.args,beams[0].args,'the intensity pass matches the primary beam footprint');
    assert.deepEqual(boost.state.transform,beams[0].state.transform);
    assert.equal(boost.state.globalCompositeOperation,'destination-out');
    near(boost.state.globalAlpha,.85*strength,'beam intensity follows power strength');
  }
  near(beams.at(-1).state.globalAlpha,1,'power intensity does not leak to the following actor');
  near(halos[1].state.globalAlpha,1,'the following living halo retains its opacity');
  near(halos[2].state.globalAlpha,1,'the following death halo retains its opacity');
  assert.equal(powerView.renderer.diagnostics().activeBeams,2,'beam diagnostics count owners, not intensity passes');
  if('boostedLights' in powerView.renderer.diagnostics())
    assert.equal(powerView.renderer.diagnostics().boostedLights,strength>0?1:0);
  assert.equal(powerView.mask().ctx.stack.length,0);
}
assert.ok(powerCalls.every(call=>call.time===321),'power strength follows game time');
assert.equal(powerHarness.canvases.length,powerAllocations);
assert.deepEqual(powerHarness.counters,powerTextureCounts,'strength changes must not build new textures');
const fallbackDeath=powerHarness.create(384,128,{
  isPowered(){throw new Error('Dead actors must not query boolean power either');}
});
fallbackDeath.renderer.prepare();
fallbackDeath.renderer.render(fallbackDeath.target,[dead],{zoom:1,x:192,y:64},216,321);
assert.equal(fallbackDeath.renderer.diagnostics().activeLights,1);
assert.equal(fallbackDeath.renderer.diagnostics().activeBeams,0);

// Aim state belongs to each renderer, even if they receive the same actor.
// Wrap at +/- pi, freeze with game time, and reset for scene replay or a
// sufficiently long gap instead of inheriting a previous chapter's aim.
const aiming=player(8,10,5,{dir:{x:-1,y:0},controllerTiltDegrees:-1});
const rotation=view=>view.mask().ctx.paintCalls.filter(call=>call.method==='rotate').at(-1).angle;
h.clear();game.renderer.render(game.target,[aiming],camera,1000,1000);
const initial=rotation(game);near(initial,179*Math.PI/180,'initial rendered heading');
aiming.dir={x:-1,y:-0};aiming.controllerTiltDegrees=1;
h.clear();tutorial.renderer.render(tutorial.target,[aiming],tutorialCamera,1008,2000);
near(rotation(tutorial),-179*Math.PI/180,'tutorial aim initializes independently');
h.clear();game.renderer.render(game.target,[aiming],camera,1016,1016);
const wrapped=rotation(game);
assert.ok(wrapped>initial&&wrapped<initial+2*Math.PI/180,'angle damping uses the short wrap');
aiming.dir={x:0,y:1};aiming.controllerTiltDegrees=0;
for(let frame=1;frame<=20;frame++){
  h.clear();game.renderer.render(game.target,[aiming],camera,1016+frame*16,1016);
  near(rotation(game),wrapped,'paused game time freezes beam aiming');
}
h.clear();game.renderer.render(game.target,[aiming],camera,1352,900);
near(rotation(game),Math.PI/2,'backwards scene time resets the aim immediately');
aiming.dir={x:0,y:-1};
h.clear();game.renderer.render(game.target,[aiming],camera,2000,916);
near(rotation(game),-Math.PI/2,'a long real-time gap resets stale aiming');
h.clear();tutorial.renderer.render(tutorial.target,[aiming],tutorialCamera,1024,2000);
near(rotation(tutorial),-179*Math.PI/180,'the independent tutorial clock remains frozen');

// Neither renderer may rebuild textures or resize its mask while zooming or
// replaying, and all drawing coordinates and saved-state stacks remain valid.
const sizes=h.canvases.map(surface=>[surface.width,surface.height]);
const allocations=h.canvases.length,counts={...h.counters};
for(let frame=0;frame<240;frame++){
  const zoom=1+frame/239;
  p1.controllerTiltDegrees=Math.sin(frame)*30;
  game.renderer.render(game.target,roster,{zoom,x:288,y:200},3000+frame*16,2000+frame*16);
  tutorial.renderer.render(tutorial.target,[tutor],tutorialCamera,3000+frame*16,frame%60*16);
  assert.equal(game.target.stack.length,0);assert.equal(tutorial.target.stack.length,0);
  assert.equal(mask.ctx.stack.length,0);assert.equal(tutorial.mask().ctx.stack.length,0);
}
game.renderer.prepare();tutorial.renderer.prepare();
assert.equal(h.canvases.length,allocations);
assert.deepEqual(h.canvases.map(surface=>[surface.width,surface.height]),sizes);
assert.deepEqual(h.counters,counts);
assert.equal(game.renderer.diagnostics().sharedTextureBuilds,1);
assert.equal(game.renderer.diagnostics().maskSize,'576x400');
assert.equal(tutorial.renderer.diagnostics().maskSize,'384x128');

// Compare retained mask content with the exact production draw path forced
// to repaint every frame. This verifies cache keys without approximating any
// geometry, angle, blend order, power intensity, or death-fade operation.
assert.ok(source.includes('let changed=!maskReady;'),'the production cache must expose its repaint decision');
const alwaysRebuildSource=source.replace('let changed=!maskReady;','let changed=true;');
const cachedHarness=harness(),uncachedHarness=harness('',alwaysRebuildSource);
const cacheOptions={powerStrength:actor=>actor.strength??0,deathLightAlpha:actor=>actor.deathAlpha??1};
const cachedView=cachedHarness.create(576,400,cacheOptions);
const uncachedView=uncachedHarness.create(576,400,cacheOptions);
cachedView.renderer.prepare();uncachedView.renderer.prepare();
function maskContent(fixture,view){
  return view.mask().ctx.paintCalls.filter(call=>call.method!=='rotate').map(call=>({
    method:call.method,args:call.args,surface:call.surface?fixture.canvases.indexOf(call.surface):null,
    transform:call.state.transform,alpha:call.state.globalAlpha,
    composite:call.state.globalCompositeOperation,filter:call.state.filter,
    // Smoothing affects image samples, but not the opaque rectangular reset.
    smoothing:call.method==='drawImage'?call.state.imageSmoothingEnabled:null,
    fill:call.method==='fillRect'?call.state.fillStyle:null
  }));
}
const cacheA=player(21,6.125,4.75),cacheB=player(22,13.25,5.125,{strength:.5});
const cacheCorpse=player(23,0,0,{dead:true,deathX:11,deathY:5,deathAlpha:.4});
let cacheRoster=[cacheA,cacheB,cacheCorpse],cacheCamera={...camera};
let cacheRealTime=1000,cacheGameTime=1000,comparedFrames=0;
function compareFrame(label){
  cachedHarness.clear();uncachedHarness.clear();
  const state=cachedView.target.state();
  cachedView.renderer.render(cachedView.target,cacheRoster,cacheCamera,cacheRealTime,cacheGameTime);
  uncachedView.renderer.render(uncachedView.target,cacheRoster,cacheCamera,cacheRealTime,cacheGameTime);
  assert.deepEqual(maskContent(cachedHarness,cachedView),maskContent(uncachedHarness,uncachedView),
    `${label}: cached pixels must retain the identical ordered painting operations`);
  assert.equal(cachedView.maskPasses().length,1,`${label}: composite the mask onto every new world frame`);
  assert.deepEqual(cachedView.target.state(),state,`${label}: preserve target state even on a cache hit`);
  const diagnostics=cachedView.renderer.diagnostics();
  assert.equal(diagnostics.maskRebuilds+diagnostics.maskReuses,diagnostics.renderPasses);
  comparedFrames++;
}
cachedView.target.globalAlpha=.37;cachedView.target.globalCompositeOperation='multiply';
cachedView.target.filter='contrast(1.2)';cachedView.target.setTransform(2.5,0,0,2.5,0,0);
for(let frame=0;frame<120;frame++){
  cacheRealTime=1000+frame*16;cacheGameTime=1000+frame*16;
  if(frame===60) cachedView.target.setTransform(5,0,0,5,0,0);
  compareFrame('unchanged lights while game time advances');
  if(frame>0) assert.equal(cachedView.mask().ctx.calls.length,0,'an unchanged mask issues no clear/stamp calls');
}
assert.equal(cachedView.renderer.diagnostics().maskRebuilds,1);
assert.equal(cachedView.renderer.diagnostics().maskReuses,119);
assert.equal(cachedView.renderer.diagnostics().activeLights,3);
assert.equal(cachedView.renderer.diagnostics().activeBeams,2);
assert.equal(cachedView.renderer.diagnostics().boostedLights,1);
function expectRebuild(label,change,advanceGame=true){
  const builds=cachedView.renderer.diagnostics().maskRebuilds;
  change();cacheRealTime+=16;if(advanceGame) cacheGameTime+=16;
  compareFrame(label);
  assert.equal(cachedView.renderer.diagnostics().maskRebuilds,builds+1,`${label}: invalidate the mask`);
}
expectRebuild('camera drift during pause',()=>{cacheCamera.x+=1e-9;},false);
expectRebuild('subpixel zoom is never quantized',()=>{cacheCamera.zoom+=1e-12;},false);
expectRebuild('subpixel player glide is never rounded',()=>{cacheA.visual.x+=1e-12;});
expectRebuild('small beam angle is never snapped',()=>{cacheA.controllerTiltDegrees+=1e-10;});
expectRebuild('power strength changes in place',()=>{cacheB.strength+=1e-9;},false);
expectRebuild('visible death fade changes',()=>{cacheCorpse.deathAlpha=.5;},false);
expectRebuild('ordered overlapping lights change',()=>{cacheRoster=[cacheB,cacheA,cacheCorpse];},false);
expectRebuild('a light owner disappears',()=>{cacheRoster=[cacheA,cacheCorpse];},false);
expectRebuild('the death sprite becomes hidden',()=>{cacheCorpse.hideDeathSprite=true;},false);
expectRebuild('empty scenes retain uniform dusk',()=>{cacheRoster=[];},false);
const emptyBuilds=cachedView.renderer.diagnostics().maskRebuilds;
for(let frame=0;frame<20;frame++){
  cacheRealTime+=16;cacheGameTime+=16;cacheCamera.x+=1;
  compareFrame('empty mask remains valid even when the camera moves');
  assert.equal(cachedView.mask().ctx.calls.length,0);
}
assert.equal(cachedView.renderer.diagnostics().maskRebuilds,emptyBuilds);
expectRebuild('respawn restores a new light',()=>{
  cacheRoster=[player(24,10,6,{controllerTiltDegrees:10})];
});
expectRebuild('tutorial rewind resets the damped heading',()=>{
  cacheGameTime=500;cacheRoster[0].dir={x:0,y:1};
},false);
expectRebuild('tab reentry resets stale heading',()=>{
  cacheRealTime+=1000;cacheRoster[0].dir={x:0,y:-1};
});
assert.equal(cachedHarness.canvases.length,3);
assert.deepEqual(cachedHarness.counters,{gradients:1,imageData:1,pixelUploads:1});
assert.equal(uncachedView.renderer.diagnostics().maskRebuilds,comparedFrames);

function productionFunction(name){
  const start=engine.indexOf(`function ${name}(`);
  assert.ok(start>=0,`missing production function ${name}`);
  for(let end=engine.indexOf('}',start);end>=0;end=engine.indexOf('}',end+1)){
    const candidate=engine.slice(start,end+1);
    try{new vm.Script(candidate);return candidate;}catch{}
  }
  throw new Error(`Unterminated production function ${name}`);
}

// Drive both renderers with the actual power envelope and fruit initializer.
// These landmarks detect a boolean lamp, a discontinuous fruit refresh, or a
// boost that survives expiry without reproducing the envelope implementation.
const powerConstants=['POWER_MODE_ACCEL_MS','POWER_MODE_PLATEAU_MS','POWER_MODE_DECEL_MS','POWER_MODE_TOTAL_MS'];
const envelopeContext=vm.createContext({
  gameTimeNow(){throw new Error('Power-envelope tests must supply the game clock');}
});
vm.runInContext(`
  ${powerConstants.map(name=>{
    const declaration=engine.match(new RegExp(`\\bconst ${name}=[^;]+;`));
    assert.ok(declaration,`missing production constant ${name}`);return declaration[0];
  }).join('\n')}
  ${['isPowerMode','powerModeSpeedStrength','initializePowerMode'].map(productionFunction).join('\n')}
  globalThis.api={strength:powerModeSpeedStrength,initialize:initializePowerMode};
`,envelopeContext,{filename:'power-envelope-production.js',timeout:1000});
const envelope=envelopeContext.api,envelopeHarness=harness();
const envelopeGame=envelopeHarness.create(576,400,{powerStrength:envelope.strength});
const envelopeTutorial=envelopeHarness.create(384,128,{powerStrength:envelope.strength});
envelopeGame.renderer.prepare();envelopeTutorial.renderer.prepare();
const envelopeBeam=envelopeHarness.canvases.find(surface=>surface.width===512);
const envelopeAllocations=envelopeHarness.canvases.length,envelopeTextures={...envelopeHarness.counters};
function sampleLamp(view,actor,time){
  envelopeHarness.clear();
  const sceneCamera=view===envelopeGame?camera:{zoom:1,x:192,y:64};
  view.renderer.render(view.target,[actor],sceneCamera,time,time);
  const beams=view.mask().ctx.paintCalls.filter(call=>call.surface===envelopeBeam);
  return {reach:beams[0].args[2],intensity:beams[1]?.state.globalAlpha||0};
}
for(const view of [envelopeGame,envelopeTutorial]){
  const actor=player(10,10,5,{powerModeUntil:0}),start=1000;
  envelope.initialize(actor,start);
  for(const [elapsed,strength] of [[0,0],[500,.75],[1000,1],[4000,1],[5500,.75],[7000,0]]){
    const lamp=sampleLamp(view,actor,start+elapsed);
    near(lamp.reach,144*(1+.45*strength),'lamp range follows production ramp, plateau, decay, and expiry');
    near(lamp.intensity,.85*strength,'lamp intensity follows the same production power envelope');
  }
  for(const refreshOffset of [500,2000,5500]){
    const refreshed=player(11,10,5,{powerModeUntil:0});
    envelope.initialize(refreshed,start);
    const refreshAt=start+refreshOffset,beforeRefresh=sampleLamp(view,refreshed,refreshAt);
    envelope.initialize(refreshed,refreshAt);
    assert.deepEqual(sampleLamp(view,refreshed,refreshAt),beforeRefresh,
      'fruit refresh keeps the same lamp range and intensity on this frame');
    const afterRamp=sampleLamp(view,refreshed,refreshAt+1000);
    near(afterRamp.reach,208.8,'refreshed lamp reaches the full 13.05-cell distance');
    near(afterRamp.intensity,.85,'refreshed lamp reaches full intensity');
    const justBeforeExpiry=sampleLamp(view,refreshed,refreshed.powerModeUntil-1);
    const expired=sampleLamp(view,refreshed,refreshed.powerModeUntil);
    near(expired.reach,144,'expiry restores normal distance');
    near(expired.intensity,0,'expiry removes the additional intensity pass');
    assert.ok(Math.abs(justBeforeExpiry.reach-expired.reach)<.05,'range decays continuously into expiry');
    assert.ok(Math.abs(justBeforeExpiry.intensity-expired.intensity)<.001,'intensity decays continuously into expiry');
  }
}
assert.equal(envelopeHarness.canvases.length,envelopeAllocations);
assert.deepEqual(envelopeHarness.counters,envelopeTextures,'power envelopes and fruit refresh never allocate new lighting surfaces');
const scoreSource=productionFunction('captureRunHighScoreCandidate');
const standardScore=vm.createContext({
  gameMode:4,humanPlayerCount:2,level:7,
  allPlayers:()=>[{id:1,score:1200},{id:2,score:1200},{id:3,score:9999,isAI:true}],
  TITLE_DIFFICULTIES:['MEDIUM'],titleDifficultyIndex:0,
  TITLE_SPEEDS:['FAST'],titleSpeedIndex:0,combinedScoreMultiplier:()=>1.5
});
vm.runInContext(`${scoreSource};globalThis.result=captureRunHighScoreCandidate();`,standardScore);
assert.deepEqual(JSON.parse(JSON.stringify(standardScore.result)),{
  score:1200,level:7,mode:4,modeLabel:'DUO VS AI',difficulty:'MEDIUM',speed:'FAST',
  multiplier:1.5,playerIds:[1,2]
},'standard score fields, tied humans, and AI exclusion remain intact');
assert.ok(!engine.includes('NightLab'),'the removed experiment must not disable normal scores or install controls');
assert.ok(!engine.includes('snakeTailSlideProgress'),'the previous tail easing helper must remain removed');

console.log('Dusk lighting passed: fixed appearance, shared textures, independent masks/clocks, exact-input mask reuse, camera alignment, death halos, power envelope, state restoration, no daylight fallthrough, replay, stable allocations, and normal scores.');
