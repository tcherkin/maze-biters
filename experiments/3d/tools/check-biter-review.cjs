// Validate the local comparison's independent controls and actual media.
const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],videos=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:8093/experiments/3d/preview-biter-v4-review.html');
    let images=0;
    for(const model of ['v3','v4'])for(const lighting of ['current','contrast']){
      await page.selectOption('#model',model);await page.selectOption('#lighting',lighting);
      const url=new URL(await page.locator('#play-selected').getAttribute('href'),page.url());
      assert.equal(url.searchParams.get('player'),model==='v4'?'crystal':'crystal-v3');
      assert.equal(url.searchParams.get('lighting'),lighting);assert.equal(url.searchParams.get('look'),'balanced');
      for(const resolution of ['1920','3840'])for(const framing of ['game','detail'])for(const pose of ['front','rear','diagonal','bite']){
        await page.selectOption('#resolution',resolution);await page.selectOption('#framing',framing);
        await page.locator(`[data-pose="${pose}"]`).click();
        await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('img')].map(img=>img.decode()));});
        assert.ok((await page.locator('#selected-image').getAttribute('src')).includes(`${model}-${lighting}-${resolution}-${pose}-${framing}`));
        assert.ok((await page.locator('#baseline-image').getAttribute('src')).includes(`v3-current-${resolution}-${pose}-${framing}`));images+=2;
      }
      await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.readyState>=2&&v.videoWidth===1920&&v.duration>15));
      await page.locator('#play-both').click();
      await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>!v.paused&&v.currentTime>.25));
      await page.locator('#pause-both').click();
      const media=await page.evaluate(()=>[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc,duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused,time:v.currentTime,rate:v.playbackRate})));
      assert.ok(media.every(v=>v.paused&&v.rate===1));
      assert.ok(media[0].src.endsWith('preview-biter-v4-gait-v3-current.mp4'));
      assert.ok(media[1].src.endsWith(`preview-biter-v4-gait-${model}-${lighting}.mp4`));
      videos.push({model,lighting,media});
    }
    await page.selectOption('#model','v4');await page.selectOption('#lighting','current');
    await page.selectOption('#resolution','3840');await page.selectOption('#framing','detail');await page.locator('[data-pose="rear"]').click();
    await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('img')].map(img=>img.decode()));});
    await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.readyState>=2&&!v.seeking));
    await page.screenshot({path:path.join(__dirname,'../preview-biter-v4-review-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout must not overflow');
    await page.screenshot({path:path.join(__dirname,'../preview-biter-v4-review-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({images,videos,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
