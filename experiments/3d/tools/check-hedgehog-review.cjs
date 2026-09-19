// Run after the 40 comparison images and the final movement video are ready.
// This launches Edge; coordinate with other GPU capture/verification tasks.
const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base='http://127.0.0.1:8093/experiments/3d/';
const sides=[['baseline','v4'],['hedgehog','hedgehog']];

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const errors=[],images=new Set(),urls=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(base+'preview-hedgehog-review.html');
    assert.equal(await page.locator('img').count(),2);
    assert.equal(await page.locator('video').count(),1);
    assert.ok((await page.locator('link[rel="icon"]').getAttribute('href')).startsWith('data:'));
    for(const [name,player]of [['Играй с таралежа','hedgehog'],['Играй с Crystal Biter v4','crystal']]){
      const href=await page.getByRole('link',{name:new RegExp(name)}).getAttribute('href');
      const url=new URL(href,page.url());
      assert.equal(url.origin,new URL(base).origin);
      assert.equal(url.pathname,new URL(base).pathname);
      assert.equal(url.searchParams.get('v'),'0.3.47');
      assert.equal(url.searchParams.get('look'),'balanced');
      assert.equal(url.searchParams.get('player'),player);
      assert.ok(!url.searchParams.has('lighting')||url.searchParams.get('lighting')==='current');
      urls.push(url.href);
    }

    async function decodePair(resolution,framing,pose){
      const decoded=await page.evaluate(async()=>Promise.all([...document.querySelectorAll('img')].map(async img=>{
        await img.decode();
        return{id:img.id,src:img.getAttribute('src'),currentSrc:img.currentSrc,complete:img.complete,
          width:img.naturalWidth,height:img.naturalHeight,failed:img.classList.contains('failed')};
      })));
      for(const [side,model]of sides){
        const filename=`preview-hedgehog-${model}-current-${resolution}-${pose}-${framing}.png`;
        const image=decoded.find(entry=>entry.id===side+'-image');
        assert.ok(image,`Missing ${side} image`);
        assert.equal(image.src,filename);
        assert.equal(image.currentSrc,new URL(filename,base).href);
        assert.ok(image.complete&&image.width>0&&image.height>0&&!image.failed,filename+' must load naturally');
        if(framing==='game'){
          assert.equal(image.width,Number(resolution));
          assert.equal(image.height,Number(resolution)*9/16);
        }
        assert.equal(await page.locator('#'+side+'-link').getAttribute('href'),filename);
        assert.equal(await page.locator('#'+side+'-status').textContent(),'');
        images.add(filename);
      }
      assert.equal(await page.locator(`[data-pose="${pose}"]`).getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-pose][aria-pressed="true"]').count(),1);
    }

    for(const resolution of ['1920','3840'])for(const framing of ['game','detail'])for(const pose of ['front','rear','profile','diagonal','bite']){
      await page.selectOption('#resolution',resolution);
      await page.selectOption('#framing',framing);
      await page.locator(`[data-pose="${pose}"]`).click();
      await decodePair(resolution,framing,pose);
    }
    assert.equal(images.size,40,'Every model / pose / resolution / framing image is decoded');

    // Metadata is enough to initiate playback; readyState >= 2 is required below
    // before recording success or capturing a page, including after resizing.
    await page.waitForFunction(()=>{
      const video=document.getElementById('movement');
      return video.readyState>=1&&video.videoWidth===1920&&video.videoHeight===1080&&video.duration>15;
    },null,{timeout:30000});
    const start=await page.evaluate(async()=>{
      const video=document.getElementById('movement');
      const time=video.currentTime;await video.play();return time;
    });
    await page.waitForFunction(initial=>{
      const video=document.getElementById('movement');
      return video.readyState>=2&&!video.paused&&video.currentTime>initial+.25;
    },start,{timeout:30000});
    const media=await page.evaluate(()=>{
      const video=document.getElementById('movement');video.pause();
      return{src:video.currentSrc,duration:video.duration,width:video.videoWidth,height:video.videoHeight,
        paused:video.paused,time:video.currentTime,rate:video.playbackRate,readyState:video.readyState};
    });
    assert.equal(media.src,base+'preview-hedgehog-gait-current.mp4');
    assert.equal(media.rate,1);assert.ok(media.paused&&media.time>start+.25&&media.readyState>=2);
    const pausedTime=await page.evaluate(async()=>{
      const video=document.getElementById('movement');
      await new Promise(resolve=>setTimeout(resolve,200));return video.currentTime;
    });
    assert.ok(Math.abs(pausedTime-media.time)<.01,'Video time must stop after pausing');
    assert.equal(await page.locator('#video-status').textContent(),'');

    await page.selectOption('#resolution','3840');await page.selectOption('#framing','detail');
    await page.locator('[data-pose="diagonal"]').click();await decodePair('3840','detail','diagonal');
    const waitForReady=()=>page.waitForFunction(()=>{
      const video=document.getElementById('movement');
      return video.readyState>=2&&!video.seeking&&video.paused&&video.playbackRate===1&&
        [...document.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth>0);
    },null,{timeout:30000});
    await waitForReady();
    await page.screenshot({path:path.join(__dirname,'../preview-hedgehog-review-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await waitForReady();
    const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(mobile.scrollWidth<=mobile.width,'390px mobile layout must not overflow horizontally');
    await page.screenshot({path:path.join(__dirname,'../preview-hedgehog-review-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({images:images.size,urls,media,mobile,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
