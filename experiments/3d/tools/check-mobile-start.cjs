const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;});
    await page.goto(process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/3d/',{waitUntil:'domcontentloaded',timeout:180000});
    await page.waitForFunction(()=>!document.getElementById('start').disabled,{},{timeout:180000});
    const diagnostics=await page.evaluate(()=>__mazeBiters3D.diagnostics());
    assert.match(diagnostics.renderer.playerModel,/dragon/i);
    assert.equal(diagnostics.renderer.worldStyle,'ruins');
    for(const viewport of [{width:844,height:390},{width:390,height:844}]){
      await page.setViewportSize(viewport);
      await page.locator('#start').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#start').evaluate(el=>{
        const r=el.getBoundingClientRect(),p=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return p===el||el.contains(p);
      }),true,'Start button must be reachable without being clipped');
    }
    await page.locator('#start').tap();
    await page.waitForFunction(()=>document.body.classList.contains('play-view')&&!__mazeBiters3D.snapshot().paused);
    assert.equal(await page.locator('#curtain').isVisible(),false);
    await page.locator('#playPause').tap();
    await page.waitForFunction(()=>__mazeBiters3D.snapshot().paused);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(JSON.stringify({version:diagnostics.version,model:diagnostics.renderer.playerModel,mobileStart:true,fullscreenFallback:true,pause:true,errors}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
