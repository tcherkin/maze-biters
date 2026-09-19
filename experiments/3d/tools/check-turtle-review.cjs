// Run after 40 regular images, 20 turtle-only cores-off images and video are ready.
// This launches Edge; coordinate with other GPU capture/verification tasks.
const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base='http://127.0.0.1:8093/experiments/3d/';
const sides=[['baseline','hedgehog'],['turtle','turtle']];

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const errors=[],images=new Set(),diagnosticImages=new Set(),dimensions=new Map(),urls=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(base+'preview-turtle-review.html');
    assert.equal(await page.locator('img').count(),2);
    assert.equal(await page.locator('video').count(),1);
    assert.ok((await page.locator('link[rel="icon"]').getAttribute('href')).startsWith('data:'));
    for(const [name,player]of [['Играй с костенурката','turtle'],['Играй с таралежа','hedgehog']]){
      const href=await page.getByRole('link',{name:new RegExp(name)}).getAttribute('href');
      const url=new URL(href,page.url());
      assert.equal(url.origin,new URL(base).origin);
      assert.equal(url.pathname,new URL(base).pathname);
      assert.equal(url.searchParams.get('v'),'0.3.48');
      assert.equal(url.searchParams.get('look'),'balanced');
      assert.equal(url.searchParams.get('player'),player);
      assert.ok(!url.searchParams.has('lighting')||url.searchParams.get('lighting')==='current');
      assert.equal(url.href,base+`?v=0.3.48&look=balanced&player=${player}`);
      urls.push(url.href);
    }

    async function decodePair(resolution,framing,pose,coresOff=false){
      const decoded=await page.evaluate(async()=>Promise.all([...document.querySelectorAll('img')].map(async img=>{
        await img.decode();
        return{id:img.id,src:img.getAttribute('src'),currentSrc:img.currentSrc,complete:img.complete,
          width:img.naturalWidth,height:img.naturalHeight,failed:img.classList.contains('failed')};
      })));
      for(const [side,model]of sides){
        const diagnostic=model==='turtle'&&coresOff;
        const stem=`preview-turtle-${model}-current-${resolution}-${pose}-${framing}`;
        const filename=stem+(diagnostic?'-cores-off':'')+'.png';
        const image=decoded.find(entry=>entry.id===side+'-image');
        assert.ok(image,`Missing ${side} image`);
        assert.equal(image.src,filename);
        assert.equal(image.currentSrc,new URL(filename,base).href);
        assert.ok(image.complete&&image.width>0&&image.height>0&&!image.failed,filename+' must load naturally');
        if(framing==='game'){
          assert.equal(image.width,Number(resolution));
          assert.equal(image.height,Number(resolution)*9/16);
        }
        if(diagnostic){
          assert.deepEqual([image.width,image.height],dimensions.get(stem),'Core diagnostic must preserve regular image dimensions');
          diagnosticImages.add(filename);
        }else dimensions.set(stem,[image.width,image.height]);
        assert.equal(await page.locator('#'+side+'-link').getAttribute('href'),filename);
        assert.equal(await page.locator('#'+side+'-status').textContent(),'');
        images.add(filename);
      }
      assert.equal(await page.locator(`[data-pose="${pose}"]`).getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-pose][aria-pressed="true"]').count(),1);
      assert.equal(await page.locator('#cores-toggle').getAttribute('aria-pressed'),String(coresOff));
      assert.equal(await page.locator('#turtle-mode').textContent(),coresOff?'Диагностика':'Нов дизайн');
    }

    for(const resolution of ['1920','3840'])for(const framing of ['game','detail'])for(const pose of ['front','rear','profile','diagonal','bite']){
      await page.selectOption('#resolution',resolution);
      await page.selectOption('#framing',framing);
      await page.locator(`[data-pose="${pose}"]`).click();
      await decodePair(resolution,framing,pose);
      const baseline=await page.locator('#baseline-image').getAttribute('src');
      const videoSource=await page.locator('#movement').getAttribute('src');
      const gameLinks=await page.locator('nav a').evaluateAll(links=>links.map(link=>link.href));
      await page.locator('#cores-toggle').click();
      await decodePair(resolution,framing,pose,true);
      assert.equal(await page.locator('#baseline-image').getAttribute('src'),baseline,'Diagnostic must leave hedgehog unchanged');
      assert.equal(await page.locator('#movement').getAttribute('src'),videoSource,'Diagnostic must leave video unchanged');
      assert.deepEqual(await page.locator('nav a').evaluateAll(links=>links.map(link=>link.href)),gameLinks,'Diagnostic is not a game setting');
      await page.locator('#cores-toggle').click();
      await decodePair(resolution,framing,pose);
    }
    assert.equal(images.size-diagnosticImages.size,40,'All regular model / pose / resolution / framing images are decoded');
    assert.equal(diagnosticImages.size,20,'Every turtle-only cores-off image is decoded');
    assert.equal(images.size,60);

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
    assert.equal(media.src,base+'preview-turtle-gait-current.mp4');
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
    assert.ok(await page.locator('#baseline-image').isVisible());
    assert.ok(await page.locator('#turtle-image').isVisible());
    assert.ok(await page.locator('#movement').isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desktop layout must not overflow horizontally');
    await page.screenshot({path:path.join(__dirname,'../preview-turtle-review-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await waitForReady();
    const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(mobile.scrollWidth<=mobile.width,'390px mobile layout must not overflow horizontally');
    assert.ok(await page.locator('#baseline-image').isVisible());
    assert.ok(await page.locator('#turtle-image').isVisible());
    assert.ok(await page.locator('#movement').isVisible());
    assert.ok(await page.locator('#cores-toggle').isVisible());
    await page.screenshot({path:path.join(__dirname,'../preview-turtle-review-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({images:images.size,regularImages:images.size-diagnosticImages.size,diagnosticImages:diagnosticImages.size,urls,media,mobile,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
