const path=require('node:path');
const assert=require('node:assert/strict');
// Optional visual evidence only: no production camera, clock or game overrides.
const floorMotion=process.argv.includes('--floor-motion');
const floor4k=floorMotion&&process.argv.includes('--4k');
const reviewSize=floor4k?{width:3840,height:2160}:{width:1920,height:1080};
const reviewPrefix='preview-floor-motion'+(floor4k?'-4k':'');
const preview=name=>`experiments/3d/${floorMotion?reviewPrefix:'preview'}${name?'-'+name:''}.png`;
const videoPath=path.resolve(`experiments/3d/${reviewPrefix}.webm`);
const playwrightPath=process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// Reuse an installed Windows ffmpeg if Playwright's optional recorder is absent.
// This copies only that executable to a temporary, process-local video runtime;
// no download, system configuration or browser profile change is needed.
if(floorMotion&&process.platform==='win32'){
  const fs=require('node:fs'),os=require('node:os');
  const core=path.dirname(require.resolve('playwright-core',{paths:[playwrightPath]}));
  const revision=JSON.parse(fs.readFileSync(path.join(core,'browsers.json'),'utf8')).browsers.find(browser=>browser.name==='ffmpeg').revision;
  const cache=process.env.PLAYWRIGHT_BROWSERS_PATH==='0'?path.join(core,'.local-browsers'):
    (process.env.PLAYWRIGHT_BROWSERS_PATH||path.join(process.env.LOCALAPPDATA,'ms-playwright'));
  if(!fs.existsSync(path.join(cache,`ffmpeg-${revision}`,'ffmpeg-win64.exe'))){
    const found=require('node:child_process').spawnSync('where.exe',['ffmpeg'],{encoding:'utf8',windowsHide:true});
    const installed=found.status===0?found.stdout.trim().split(/\r?\n/).find(file=>fs.existsSync(file)):null;
    if(installed){
      const temporary=path.join(os.tmpdir(),'maze-biters-playwright-video');
      const destination=path.join(temporary,`ffmpeg-${revision}`,'ffmpeg-win64.exe');
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      if(!fs.existsSync(destination))fs.copyFileSync(installed,destination);
      process.env.PLAYWRIGHT_BROWSERS_PATH=temporary;
    }
  }
}
const {chromium}=require(playwrightPath);
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  let video,page;
  try{
    page=await browser.newPage({viewport:floorMotion?reviewSize:{width:1440,height:1000},
      ...(floorMotion?{recordVideo:{dir:path.join(require('node:os').tmpdir(),'maze-biters-floor-recordings'),size:reviewSize}}:{})});
    video=page.video();
    const motionReview=floorMotion?{video:videoPath,frames:[],zoomSamples:[]}:undefined;
    const capture=async name=>{const output=preview(name);await page.screenshot({path:output});if(motionReview)motionReview.frames.push(output);};
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    await page.goto('http://127.0.0.1:8093/experiments/3d/');
    const loaded=await Promise.race([
      page.getByRole('button',{name:'Влез в играта',exact:true}).waitFor({timeout:60000}).then(()=>true),
      page.waitForFunction(()=>document.getElementById('start')?.hidden,{},{timeout:60000}).then(()=>false)
    ]);
    if(!loaded) throw new Error('Game initialization failed: '+errors.join('; ')+'; '+await page.locator('#message').innerText());
    const initialView=await page.evaluate(()=>({
      zoom:__mazeBiters3D.diagnostics().renderer.zoom,
      tilt:__mazeBiters3D.diagnostics().renderer.tiltDegrees,
      zoomInput:document.getElementById('zoom').value,
      tiltInput:document.getElementById('tilt').value,
      zoomLabel:document.getElementById('zoomValue').value,
      tiltLabel:document.getElementById('tiltValue').value,
      tiltDescription:document.getElementById('tilt').getAttribute('aria-valuetext')
    }));
    assert.deepEqual(initialView,{zoom:1.5,tilt:55,zoomInput:'1.5',tiltInput:'55',zoomLabel:'1.5×',tiltLabel:'55°',tiltDescription:'55 градуса от вертикалата'},'The opening camera and all controls start at 55° and 1.5×');
    await page.getByRole('button',{name:'Влез в играта',exact:true}).click();
    const initial=await page.evaluate(()=>__mazeBiters3D.snapshot());
    assert.equal(initial.cols,19,'The concept maze has the requested reduced structure');
    assert.equal(initial.rows,15,'The concept maze has the requested reduced structure');
    assert.ok(initial.snakes.length>=3,'Several colored snakes populate the concept maze');
    assert.equal(new Set(initial.snakes.map(s=>s.color)).size,initial.snakes.length,'Opening snakes have distinct concept colors');
    await page.waitForTimeout(750);
    await capture('');
    const before=await page.evaluate(()=>__mazeBiters3D.snapshot());
    // Choose legal corridors from the actual map; no old-layout spawn coordinates.
    const nextKey=async(exclude=null)=>page.evaluate(exclude=>{
      const state=__mazeBiters3D.snapshot(),p=state.player;
      return [[1,0,'ArrowRight'],[0,1,'ArrowDown'],[-1,0,'ArrowLeft'],[0,-1,'ArrowUp']]
        .find(([x,y,key])=>key!==exclude&&state.maze[p.y+y]?.[p.x+x]==='.')?.[2];
    },exclude);
    const first=await nextKey();assert.ok(first,'P1 spawn has a walkable exit');
    await page.keyboard.down(first);
    if(floorMotion){
      // Turn at an observed live junction; a fixed hold can pass it before the
      // screenshot is finished, especially while video encoding is active.
      await page.waitForFunction(({first,from})=>{
        const state=__mazeBiters3D.snapshot(),p=state.player,wasHorizontal=['ArrowLeft','ArrowRight'].includes(first);
        return (p.x!==from[0]||p.y!==from[1])&&[[0,1],[0,-1],[1,0],[-1,0]]
          .some(([x,y])=>Boolean(y)===wasHorizontal&&state.maze[p.y+y]?.[p.x+x]==='.');
      },{first,from:[before.player.x,before.player.y]},{timeout:5000});
    }else await page.waitForTimeout(500);
    await page.keyboard.up(first);
    const moved=await page.evaluate(()=>__mazeBiters3D.snapshot());
    assert.notDeepEqual([before.player.x,before.player.y],[moved.player.x,moved.player.y],'Held keyboard directions move P1 through the new maze');
    const second=floorMotion?await page.evaluate(first=>{
      const state=__mazeBiters3D.snapshot(),p=state.player,wasHorizontal=['ArrowLeft','ArrowRight'].includes(first);
      return [[0,1,'ArrowDown'],[0,-1,'ArrowUp'],[1,0,'ArrowRight'],[-1,0,'ArrowLeft']]
        .find(([x,y])=>Boolean(y)===wasHorizontal&&state.maze[p.y+y]?.[p.x+x]==='.')?.[2];
    },first):await nextKey(first);
    if(floorMotion)assert.ok(second,'The live floor review includes a legal perpendicular turn');
    if(second){await page.keyboard.down(second);if(floorMotion)await capture('moving');await page.waitForTimeout(300);await page.keyboard.up(second);}
    await page.keyboard.press('p');
    const after=await page.evaluate(()=>__mazeBiters3D.snapshot());
    await capture('play');
    assert.equal(after.paused,true,'P pauses the simulation');
    if(floorMotion){
      const turnAxis=['ArrowLeft','ArrowRight'].includes(second)?'x':'y';
      assert.notEqual(after.player[turnAxis],moved.player[turnAxis],'A live perpendicular keyboard turn advances along its new axis');
      motionReview.movement={keys:[first,second],before:[before.player.x,before.player.y],afterMove:[moved.player.x,moved.player.y],afterTurn:[after.player.x,after.player.y]};
    }
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>__mazeBiters3D.snapshot().time),after.time,'Pause freezes game time');
    await page.locator('#settings').click();
    await page.waitForFunction(()=>!document.body.classList.contains('play-view')&&!document.fullscreenElement);
    await page.locator('#zoom').fill('1.75');await page.locator('#tilt').fill('45');await page.waitForTimeout(500);
    await capture('zoom');
    assert.deepEqual(await page.evaluate(()=>__mazeBiters3D.snapshot()),after,'Camera movement cannot modify game state');
    if(floorMotion){
      let frame=0;
      for(const target of [1.2,2,1.5]){
        const start=await page.evaluate(()=>__mazeBiters3D.diagnostics().renderer.zoom);
        let previous=start;
        await page.locator('#zoom').fill(String(target));
        for(const delay of [40,60,100,250]){
          await page.waitForTimeout(delay);
          const zoom=await page.evaluate(()=>__mazeBiters3D.diagnostics().renderer.zoom);
          assert.ok(Number.isFinite(zoom)&&zoom>=Math.min(start,target)-.001&&zoom<=Math.max(start,target)+.001,'The animated review camera stays inside its requested zoom interval');
          assert.ok(Math.abs(target-zoom)<=Math.abs(target-previous)+.001,'The animated review camera approaches its target without oscillation');
          motionReview.zoomSamples.push({target,zoom});previous=zoom;
          await capture(`frame-${String(++frame).padStart(2,'0')}`);
        }
        await page.waitForFunction(target=>Math.abs(__mazeBiters3D.diagnostics().renderer.zoom-target)<.015,target);
        assert.deepEqual(await page.evaluate(()=>__mazeBiters3D.snapshot()),after,'Each recorded camera sweep leaves the paused game unchanged');
      }
    }
    const diagnostics=await page.evaluate(()=>__mazeBiters3D.diagnostics());
    assert.ok(diagnostics.renderer.shadows,'Concept models and walls render with shadows');
    await page.getByRole('button',{name:'Отначало',exact:true}).click();
    const restarted=await page.evaluate(()=>__mazeBiters3D.snapshot());
    assert.equal(restarted.paused,false,'Restart resumes');
    assert.deepEqual(restarted.maze,initial.maze,'Restart retains the exact concept maze');
    assert.deepEqual(restarted.snakes.map(s=>[s.color,s.body.length]),initial.snakes.map(s=>[s.color,s.body.length]),'Restart restores each original snake color and body size');
    assert.equal(restarted.player.lives,3,'Fresh lives');
    assert.equal(restarted.maze[restarted.player.y][restarted.player.x],'.','Restart uses a free concept-maze spawn');
    await page.keyboard.press('p');
    await page.locator('#settings').click();
    await page.waitForFunction(()=>!document.body.classList.contains('play-view')&&!document.fullscreenElement);
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile controls fit the viewport');
    await capture('mobile');
    console.log(JSON.stringify({errors,checks:['opening camera and controls at 55° / 1.5×','19×15 concept maze and colored roster','keyboard and queued turns','pause freezes time','camera leaves simulation unchanged','restart preserves maze and resets roster/lives','mobile layout',...(floorMotion?['recorded real keyboard movement and perpendicular turn','paused smooth zoom sweeps 1.2× → 2× → 1.5×']:[])],diagnostics,motionReview},null,2));
    if(errors.length) process.exitCode=1;
  }finally{
    try{
      if(page)await page.context().close();
      if(video){await video.saveAs(videoPath);await video.delete();}
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
