const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:1.25}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto('http://127.0.0.1:8093/experiments/3d/?look=balanced');
    await page.getByRole('button',{name:'Влез в играта',exact:true}).waitFor({timeout:60000});
    const read=()=>page.evaluate(()=>__mazeBiters3D.diagnostics().renderer);
    assert.equal((await read()).projection,.5);
    assert.equal((await read()).perspective,true);
    await page.locator('#start').click();
    await page.keyboard.press('p');await page.locator('#settings').click();
    await page.waitForFunction(()=>!document.fullscreenElement&&!document.body.classList.contains('play-view'));
    const state=await page.evaluate(()=>__mazeBiters3D.snapshot()),samples=[];
    await page.screenshot({path:'experiments/3d/preview-projection-default.png'});
    for(const tilt of [45,75]){
      await page.locator('#tilt').fill(String(tilt));
      for(const percent of [1,50,100,0]){
        await page.locator('#projection').fill(String(percent));
        await page.waitForFunction(({percent,tilt})=>{
          const r=__mazeBiters3D.diagnostics().renderer;
          return Math.abs(r.projection-percent/100)<.00002&&Math.abs(r.tiltDegrees-tilt)<.02;
        },{percent,tilt},{timeout:10000});
        const r=await read();samples.push({tilt,percent,perspective:r.perspective,mirrors:r.wallMirrors});
        assert.equal(r.perspective,percent>0);
        assert.ok(Number.isFinite(r.focusDistance));
        assert.equal(await page.locator('#projectionValue').textContent(),percent+'%');
        assert.deepEqual(await page.evaluate(()=>__mazeBiters3D.snapshot()),state,'Projection changes never change the paused game');
        if(tilt===45&&percent===100)await page.screenshot({path:'experiments/3d/preview-projection-perspective.png'});
        if(tilt===45&&percent===0)await page.screenshot({path:'experiments/3d/preview-projection-ortho.png'});
      }
    }
    await page.locator('#tilt').fill('45');await page.locator('#projection').fill('100');
    await page.waitForFunction(()=>__mazeBiters3D.diagnostics().renderer.projection===1);
    assert.equal(await page.locator('#projection').getAttribute('aria-valuetext'),'Перспективна');
    // Keyboard access changes this control without steering the player.
    await page.locator('#projection').focus();await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#projection').inputValue(),'99');
    assert.deepEqual(await page.evaluate(()=>__mazeBiters3D.snapshot()),state);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#projection').scrollIntoViewIfNeeded();
    await page.locator('#projection').fill('50');
    await page.waitForFunction(()=>Math.abs(__mazeBiters3D.diagnostics().renderer.projection-.5)<.001);
    const mobile=await page.locator('#projection').boundingBox();
    assert.ok(mobile.width>=180&&mobile.x>=0&&mobile.x+mobile.width<=390,'Projection control fits a phone screen');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal page overflow');
    await page.screenshot({path:'experiments/3d/preview-projection-mobile.png'});
    assert.deepEqual(errors,[],'All projections render without browser or shader errors');
    console.log(JSON.stringify({samples,mobile,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
