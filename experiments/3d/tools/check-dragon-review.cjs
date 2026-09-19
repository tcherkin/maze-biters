// Run only when the dragon captures/video are ready and no other GPU task runs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base='http://127.0.0.1:8093/experiments/3d/';
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const errors=[],images=new Set(),dimensions=new Map();
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base+'preview-dragon-review.html');
    assert.equal(await page.locator('img').count(),3);assert.equal(await page.locator('video').count(),1);
    assert.ok((await page.locator('link[rel="icon"]').getAttribute('href')).startsWith('data:'));
    const links=await page.locator('nav a').evaluateAll(nodes=>nodes.map(n=>n.href));
    assert.deepEqual(links,['dragon-v2','dragon-v1','old'].map(model=>base+'?v=0.3.50&look=balanced&player='+model));
    assert.equal(await page.locator('a[href="preview-dragon-gameplay-v1.mp4"]').count(),1);
    const reference=base+'references/emerald-dragon-approved.png';
    async function decode(view,resolution,mode='regular'){
      const rows=await page.evaluate(async()=>Promise.all([...document.querySelectorAll('img')].map(async img=>{
        await img.decode();return{id:img.id,src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,complete:img.complete,failed:img.classList.contains('failed')};
      })));
      const ref=rows.find(r=>r.id==='reference-image');
      assert.equal(ref.src,reference);assert.ok(ref.complete&&ref.width>0&&ref.height>0&&!ref.failed);images.add(ref.src);
      const suffix=mode==='grid'?'-grid':mode==='cores-off'?'-cores-off':'';
      for(const [id,prefix]of [['before','before'],['dragon','v50']]){
        const actual=rows.find(r=>r.id===id+'-image'),stem=`preview-dragon-${prefix}-${resolution}-${view}`;
        const filename=stem+suffix+'.png'+(id==='dragon'?'?v=0.3.50':'');assert.equal(actual.src,base+filename);
        assert.ok(actual.complete&&actual.width>0&&actual.height>0&&!actual.failed);
        assert.equal(await page.locator('#'+id+'-link').getAttribute('href'),filename);
        assert.equal(await page.locator('#'+id+'-status').textContent(),'');
        if(mode==='regular')dimensions.set(stem,[actual.width,actual.height]);
        else assert.deepEqual([actual.width,actual.height],dimensions.get(stem),'Diagnostic must preserve original framing');
        if(view==='game'){assert.equal(actual.width,Number(resolution));assert.equal(actual.height,Number(resolution)*9/16);}
        images.add(actual.src);
      }
      assert.deepEqual(dimensions.get(`preview-dragon-before-${resolution}-${view}`),dimensions.get(`preview-dragon-v50-${resolution}-${view}`),'Before and after must use identical capture dimensions');
      assert.equal(await page.locator('#reference-link').getAttribute('href'),'references/emerald-dragon-approved.png');
      assert.equal(await page.locator('#reference-status').textContent(),'');
      assert.equal(await page.locator(`[data-view="${view}"]`).getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-view][aria-pressed="true"]').count(),1);
      assert.equal(await page.locator('#cores-toggle').getAttribute('aria-pressed'),String(mode==='cores-off'));
      assert.equal(await page.locator('#grid-toggle').getAttribute('aria-pressed'),String(mode==='grid'));
      assert.equal(await page.locator('#grid-toggle').isVisible(),view==='top');
      assert.deepEqual(await page.locator('nav a').evaluateAll(nodes=>nodes.map(n=>n.href)),links);
      assert.equal(await page.locator('#movement').getAttribute('src'),'preview-dragon-gameplay-v50.mp4?v=0.3.50');
    }
    for(const resolution of ['1920','3840'])for(const view of ['quarter','top','front','profile','rear','bite','game']){
      await page.selectOption('#resolution',resolution);await page.locator(`[data-view="${view}"]`).click();
      await decode(view,resolution);await page.locator('#cores-toggle').click();await decode(view,resolution,'cores-off');
      if(view==='top'){
        await page.locator('#grid-toggle').click();await decode(view,resolution,'grid');
        await page.locator('#grid-toggle').click();
      }else await page.locator('#cores-toggle').click();
      await decode(view,resolution);
    }
    assert.equal(images.size,61,'Reference + before/after each14 normal +14 cores-off +2 top-grid images');
    await page.waitForFunction(()=>{const v=document.getElementById('movement');return v.readyState>=1&&v.videoWidth===1920&&v.videoHeight===1080&&v.duration>5;},null,{timeout:30000});
    const start=await page.evaluate(async()=>{const v=document.getElementById('movement'),t=v.currentTime;await v.play();return t;});
    await page.waitForFunction(t=>{const v=document.getElementById('movement');return !v.paused&&v.readyState>=2&&v.currentTime>t+.25;},start,{timeout:30000});
    const media=await page.evaluate(()=>{const v=document.getElementById('movement');v.pause();return{src:v.currentSrc,width:v.videoWidth,height:v.videoHeight,duration:v.duration,time:v.currentTime,rate:v.playbackRate,paused:v.paused,readyState:v.readyState};});
    assert.equal(media.src,base+'preview-dragon-gameplay-v50.mp4?v=0.3.50');assert.equal(media.rate,1);assert.ok(media.paused&&media.readyState>=2);
    const pausedTime=await page.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,200));return document.getElementById('movement').currentTime;});
    assert.ok(Math.abs(pausedTime-media.time)<.01);assert.equal(await page.locator('#video-status').textContent(),'');
    await page.selectOption('#resolution','3840');await page.locator('[data-view="quarter"]').click();await decode('quarter','3840');
    const ready=()=>page.waitForFunction(()=>{const v=document.getElementById('movement');return v.readyState>=2&&v.paused&&!v.seeking&&[...document.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0);});
    await ready();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(__dirname,'../preview-dragon-review-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});await ready();
    const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(mobile.scrollWidth<=mobile.width);
    for(const id of ['reference-image','before-image','dragon-image','movement','cores-toggle'])assert.ok(await page.locator('#'+id).isVisible());
    await page.screenshot({path:path.join(__dirname,'../preview-dragon-review-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);const report={images:images.size,links,media,mobile,errors};
    fs.writeFileSync(path.join(__dirname,'../preview-dragon-review.log'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
