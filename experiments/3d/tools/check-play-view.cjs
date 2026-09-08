// Exercise the real application, with isolated map/terminal fixtures injected
// only into routed test responses. No production debug controls are required.
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base='http://127.0.0.1:8093/experiments/3d/';
const fixture=`
  globalThis.__playFixture={
    arena({x=9,y=7,corridor=false,dir={x:0,y:1}}={}){
      experimentRelease();
      maze=Array.from({length:ROWS},(_,cy)=>Array.from({length:COLS},(_,cx)=>
        corridor?(cy===7&&cx>=3&&cx<=14||cx===10&&cy>=3&&cy<=7?'.':'#'):
        (cx===0||cx===COLS-1||cy===0||cy===ROWS-1?'#':'.')));
      const t=gameTimeNow();
      Object.assign(player,{
        x,y,prevX:x,prevY:y,moveFromX:x,moveFromY:y,moveToX:x,moveToY:y,
        moveStartedAt:t,moveDuration:95,lastMove:t,dir:{...dir},nextDir:{...dir},
        dead:false,eliminated:false,hideDeathSprite:false,waitingForInput:true,
        pointerNavigation:null,pointerMomentum:false,reactionAssistRicochet:null,
        spawnShieldUntil:Infinity,powerModeUntil:0
      });
      snakes=[makeSnake(corridor?13:2,corridor?7:2,1,{x:-1,y:0})];
      snakes[0].lastMove=Infinity;snakes[0].color='#079ed1';
      eggs=[];hunters=[];fruits=[];scorpion=null;scorpionSpawnAt=Infinity;
      experimentBites=[];experimentPredations=[];experimentGeneration++;
    },
    finish(kind){experimentRelease();experimentCompleted=kind==='complete';gameOver=kind==='gameOver';},
    held(){return{keys:Object.keys(keys).filter(key=>keys[key]),player:Object.keys(player.keyboardHeldKeys||{})};}
  };
`;

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[],checks=[],modes=[];
  try{
    async function open({touch=false,fallback=false}={}){
      const context=await browser.newContext({viewport:touch?{width:820,height:1100}:{width:1440,height:1000},hasTouch:touch,isMobile:touch});
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      if(fallback)await page.addInitScript(()=>{Element.prototype.requestFullscreen=function(){return Promise.reject(new DOMException('Fullscreen unavailable in this embedded browser','NotAllowedError'));};});
      await page.route('**/experiments/3d/engine/maze-biters-experiment.js',route=>{
        const source=fs.readFileSync(path.join(__dirname,'../engine/maze-biters-experiment.js'),'utf8');
        assert.ok(source.includes('globalThis.MazeBiters3DEngine=Object.freeze({'),'The fixture insertion anchor exists');
        return route.fulfill({contentType:'text/javascript',body:source.replace('globalThis.MazeBiters3DEngine=Object.freeze({',fixture+'globalThis.MazeBiters3DEngine=Object.freeze({')});
      });
      await page.route('**/experiments/3d/renderer.mjs',route=>{
        const source=fs.readFileSync(path.join(__dirname,'../renderer.mjs'),'utf8');
        assert.ok(source.includes('constructor(canvas){'),'The renderer fixture insertion anchor exists');
        return route.fulfill({contentType:'text/javascript',body:source.replace('constructor(canvas){','constructor(canvas){globalThis.__playScene=this;globalThis.__playThree=THREE;')});
      });
      await page.goto(base);
      await page.getByRole('button',{name:'Влез в играта',exact:true}).waitFor({timeout:60000});
      return{page,context,touch,fallback};
    }
    async function enter(test){
      const {page}=test;
      await page.locator('#start').click();
      await page.waitForFunction(()=>document.body.classList.contains('play-view'));
      await page.waitForTimeout(120);
      const view=await page.evaluate(()=>({fullscreen:document.fullscreenElement?.id,enabled:document.fullscreenEnabled,
        arena:document.getElementById('arena').getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,
        zoom:__mazeBiters3D.diagnostics().renderer.zoom,tilt:__mazeBiters3D.diagnostics().renderer.tiltDegrees,
        visible:['.masthead','.controls','.mobile-pad','.status','.scene-tag'].filter(selector=>getComputedStyle(document.querySelector(selector)).display!=='none')
      }));
      assert.deepEqual(view.visible,[],'Play view contains no page header, controls, instructions or scene tag');
      assert.ok(Math.abs(view.arena.x)<2&&Math.abs(view.arena.y)<2&&Math.abs(view.arena.width-view.width)<2&&Math.abs(view.arena.height-view.height)<2,'The arena fills the viewport');
      assert.equal(await page.locator('#hud').isVisible(),true,'HUD stays visible');
      assert.equal(await page.locator('#world').isVisible(),true,'The 3D scene stays visible');
      if(test.fallback)assert.equal(view.fullscreen,undefined,'The forced unsupported browser uses the viewport fallback');
      else if(view.enabled)assert.equal(view.fullscreen,'arena','A supported browser enters native fullscreen on the arena only');
      modes.push({touch:test.touch,fallback:test.fallback,native:view.fullscreen==='arena'});
    }
    async function resetArena(page,options={}){
      await page.evaluate(options=>__playFixture.arena(options),options);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    }
    async function target(page,dir){return page.evaluate(dir=>{
      const scene=__playScene,THREE=__playThree,rect=document.getElementById('world').getBoundingClientRect();
      const p=scene.player.localToWorld(new THREE.Vector3(0,.5,0)).project(scene.camera);
      const center={x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};
      const radius=Math.min(120,rect.width*.16,rect.height*.16);
      return{x:center.x+dir.x*radius,y:center.y+dir.y*radius};
    },dir);}
    async function tap(test,dir,quick=false){
      const point=await target(test.page,dir);
      if(quick)await test.page.evaluate(point=>{
        const stage=document.getElementById('world');
        const init={bubbles:true,cancelable:true,pointerId:71,pointerType:'mouse',isPrimary:true,button:0,clientX:point.x,clientY:point.y};
        // Synthetic events have no browser-owned active pointer. Real mouse
        // and touch cases above exercise capture; this pair isolates the
        // same-task input lifetime before any simulation polling can run.
        const capture=stage.setPointerCapture;stage.setPointerCapture=()=>{};
        try{
          stage.dispatchEvent(new PointerEvent('pointerdown',{...init,buttons:1}));
          stage.dispatchEvent(new PointerEvent('pointerup',{...init,buttons:0}));
        }finally{stage.setPointerCapture=capture;}
      },point);
      else if(test.touch)await test.page.touchscreen.tap(point.x,point.y);
      else await test.page.mouse.click(point.x,point.y);
    }
    async function directionChecks(test){
      for(const dir of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
        await resetArena(test.page);
        await tap(test,dir);
        await test.page.waitForFunction(dir=>{
          const p=__mazeBiters3D.snapshot().player;
          return dir.x?(p.x-9)*dir.x>=1&&p.y===7:(p.y-7)*dir.y>=1&&p.x===9;
        },dir,{timeout:2500});
      }
      checks.push(`${test.touch?'touch':'mouse'} four directions relative to the projected player at45 degrees`);
      await resetArena(test.page,{x:7,y:7,corridor:true,dir:{x:1,y:0}});
      await tap(test,{x:1,y:0},true);
      await test.page.waitForFunction(()=>__mazeBiters3D.snapshot().player.x>=8,{},{timeout:2500});
      await tap(test,{x:0,y:-1},true);
      await test.page.waitForFunction(()=>{const p=__mazeBiters3D.snapshot().player;return p.x===10&&p.y<7;},{},{timeout:3500});
      checks.push(`${test.touch?'touch layout':'desktop'} fast press/release and a turn queued before the junction`);
    }
    async function fullPage(page){
      await page.waitForFunction(()=>!document.body.classList.contains('play-view')&&!document.fullscreenElement);
      assert.equal(await page.locator('.masthead').isVisible(),true,'Full-page heading is restored');
      assert.equal(await page.locator('.controls').isVisible(),true,'Full-page settings are restored');
    }

    const desktop=await open();await enter(desktop);
    assert.equal(await desktop.page.evaluate(()=>__mazeBiters3D.diagnostics().renderer.tiltDegrees),45);
    await directionChecks(desktop);
    await resetArena(desktop.page);
    const ignoredPoint=await target(desktop.page,{x:1,y:0});
    await desktop.page.mouse.click(ignoredPoint.x,ignoredPoint.y,{button:'right'});
    await desktop.page.locator('#hud').click({position:{x:40,y:20}});
    await desktop.page.waitForTimeout(240);
    assert.deepEqual(await desktop.page.evaluate(()=>{const p=__mazeBiters3D.snapshot().player;return[p.x,p.y];}),[9,7],'Secondary mouse clicks and the HUD do not issue movement');
    await desktop.page.locator('#playPause').click();
    await desktop.page.waitForFunction(()=>__mazeBiters3D.snapshot().paused);
    const frozen=await desktop.page.evaluate(()=>__mazeBiters3D.snapshot().time);
    await desktop.page.locator('#pauseCurtain').click({position:{x:20,y:20}});
    await desktop.page.waitForTimeout(100);
    assert.equal(await desktop.page.evaluate(()=>__mazeBiters3D.snapshot().time),frozen,'Pause overlay taps cannot resume or move the game');
    await desktop.page.locator('#resume').click();
    await desktop.page.waitForFunction(()=>!__mazeBiters3D.snapshot().paused);
    await desktop.page.keyboard.press('Escape');
    await fullPage(desktop.page);
    assert.equal(await desktop.page.evaluate(()=>__mazeBiters3D.snapshot().paused),true,'Manual Escape exit pauses gameplay');
    checks.push('native fullscreen, pause/resume overlay, ignored non-game taps, Escape restores the page and pauses');
    await desktop.page.locator('#pause').click();
    await desktop.page.waitForFunction(()=>document.body.classList.contains('play-view'));
    await resetArena(desktop.page);
    await desktop.page.keyboard.down('ArrowRight');
    await desktop.page.evaluate(()=>dispatchEvent(new Event('blur')));
    await desktop.page.keyboard.up('ArrowRight');
    assert.equal(await desktop.page.evaluate(()=>__mazeBiters3D.snapshot().paused),true,'Losing focus pauses');
    assert.deepEqual(await desktop.page.evaluate(()=>__playFixture.held()),{keys:[],player:[]},'Losing focus releases all held movement');
    await desktop.page.locator('#settings').click();await fullPage(desktop.page);
    await desktop.page.locator('#zoom').fill('1.9');
    await desktop.page.locator('#pause').click();
    await desktop.page.waitForFunction(()=>document.body.classList.contains('play-view'));
    await resetArena(desktop.page);
    const cancelPoint=await target(desktop.page,{x:1,y:0});
    await desktop.page.mouse.move(cancelPoint.x,cancelPoint.y);await desktop.page.mouse.down();
    await desktop.page.locator('#world').dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',isPrimary:true,button:0});
    await desktop.page.mouse.up();
    assert.deepEqual(await desktop.page.evaluate(()=>__playFixture.held()),{keys:[],player:[]},'A canceled pointer cannot retain held movement');
    await desktop.page.waitForTimeout(240);
    assert.deepEqual(await desktop.page.evaluate(()=>{const p=__mazeBiters3D.snapshot().player;return[p.x,p.y];}),[9,7],'A canceled pointer must not commit a tap command');
    for(const kind of ['gameOver','complete']){
      await desktop.page.evaluate(kind=>__playFixture.finish(kind),kind);
      await fullPage(desktop.page);
      await desktop.page.getByRole('button',{name:'Играй отново',exact:true}).waitFor();
      const generation=await desktop.page.evaluate(()=>__mazeBiters3D.snapshot().generation);
      await enter(desktop);
      assert.ok(await desktop.page.evaluate(generation=>__mazeBiters3D.snapshot().generation>generation,generation),'Play again creates a fresh round');
    }
    checks.push('focus and pointer cancellation release input; defeat and completion restore the page; play again enters a fresh round');
    await desktop.page.screenshot({path:'experiments/3d/preview-play-view-desktop.png'});
    await desktop.context.close();

    const mobile=await open({touch:true,fallback:true});
    await mobile.page.locator('#zoom').fill('1.9');
    await enter(mobile);await directionChecks(mobile);
    await mobile.page.setViewportSize({width:390,height:844});
    await mobile.page.waitForTimeout(100);
    assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Portrait play view has no horizontal overflow');
    assert.equal(await mobile.page.locator('#playPause').isVisible(),true,'Touch play retains an accessible pause control');
    await mobile.page.screenshot({path:'experiments/3d/preview-play-view-touch.png'});
    await mobile.page.locator('#playPause').click();await mobile.page.locator('#settings').click();await fullPage(mobile.page);
    assert.equal(await mobile.page.evaluate(()=>__mazeBiters3D.snapshot().paused),true,'Returning to settings from touch play keeps the round paused');
    checks.push('unsupported fullscreen fallback, touch directions with1.9 zoom, portrait bounds, and touch settings return');
    await mobile.context.close();
    assert.deepEqual(errors,[],'Application loads and operates without browser errors');
    console.log(JSON.stringify({errors,checks,modes},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
