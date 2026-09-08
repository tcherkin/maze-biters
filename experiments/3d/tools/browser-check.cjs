const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
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
    assert.deepEqual(initialView,{zoom:1.5,tilt:45,zoomInput:'1.5',tiltInput:'45',zoomLabel:'1.5×',tiltLabel:'45°',tiltDescription:'45 градуса от вертикалата'},'The opening camera and all controls start at 45° and 1.5×');
    await page.getByRole('button',{name:'Влез в играта',exact:true}).click();
    const initial=await page.evaluate(()=>__mazeBiters3D.snapshot());
    assert.equal(initial.cols,19,'The concept maze has the requested reduced structure');
    assert.equal(initial.rows,15,'The concept maze has the requested reduced structure');
    assert.ok(initial.snakes.length>=3,'Several colored snakes populate the concept maze');
    assert.equal(new Set(initial.snakes.map(s=>s.color)).size,initial.snakes.length,'Opening snakes have distinct concept colors');
    await page.waitForTimeout(750);
    await page.screenshot({path:'experiments/3d/preview.png'});
    const before=await page.evaluate(()=>__mazeBiters3D.snapshot());
    // Choose legal corridors from the actual map; no old-layout spawn coordinates.
    const nextKey=async(exclude=null)=>page.evaluate(exclude=>{
      const state=__mazeBiters3D.snapshot(),p=state.player;
      return [[1,0,'ArrowRight'],[0,1,'ArrowDown'],[-1,0,'ArrowLeft'],[0,-1,'ArrowUp']]
        .find(([x,y,key])=>key!==exclude&&state.maze[p.y+y]?.[p.x+x]==='.')?.[2];
    },exclude);
    const first=await nextKey();assert.ok(first,'P1 spawn has a walkable exit');
    await page.keyboard.down(first);await page.waitForTimeout(500);await page.keyboard.up(first);
    const moved=await page.evaluate(()=>__mazeBiters3D.snapshot());
    assert.notDeepEqual([before.player.x,before.player.y],[moved.player.x,moved.player.y],'Held keyboard directions move P1 through the new maze');
    const second=await nextKey(first);
    if(second){await page.keyboard.down(second);await page.waitForTimeout(300);await page.keyboard.up(second);}
    await page.keyboard.press('p');
    const after=await page.evaluate(()=>__mazeBiters3D.snapshot());
    await page.screenshot({path:'experiments/3d/preview-play.png'});
    assert.equal(after.paused,true,'P pauses the simulation');
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>__mazeBiters3D.snapshot().time),after.time,'Pause freezes game time');
    await page.locator('#settings').click();
    await page.waitForFunction(()=>!document.body.classList.contains('play-view')&&!document.fullscreenElement);
    await page.locator('#zoom').fill('1.75');await page.locator('#tilt').fill('45');await page.waitForTimeout(500);
    await page.screenshot({path:'experiments/3d/preview-zoom.png'});
    assert.deepEqual(await page.evaluate(()=>__mazeBiters3D.snapshot()),after,'Camera movement cannot modify game state');
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
    await page.screenshot({path:'experiments/3d/preview-mobile.png'});
    console.log(JSON.stringify({errors,checks:['opening camera and controls at 45° / 1.5×','19×15 concept maze and colored roster','keyboard and queued turns','pause freezes time','camera leaves simulation unchanged','restart preserves maze and resets roster/lives','mobile layout'],diagnostics},null,2));
    if(errors.length) process.exitCode=1;
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
