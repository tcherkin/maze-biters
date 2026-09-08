const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    // Drive the real engine with exact 120 Hz timestamps, independent of rAF
    // scheduling, so clock-rate and pause assertions need no timing tolerance.
    await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await page.goto('http://127.0.0.1:8093/experiments/3d/');
    await page.getByRole('button',{name:'Влез в играта',exact:true}).waitFor();
    const initial=await page.locator('#speed').evaluate(input=>({min:+input.min,max:+input.max,value:+input.value,speed:MazeBiters3DEngine.snapshot().speed}));
    assert.equal(initial.value,(initial.min+initial.max)/2,'Initial tempo is the physical midpoint');
    assert.equal(initial.speed,.5,'Initial simulation is half the previous speed');
    await page.evaluate(()=>{MazeBiters3DEngine.start();window.testRealTime=10000;});
    const advance=()=>page.evaluate(()=>{
      const engine=MazeBiters3DEngine,before=engine.snapshot();engine.reanchor(window.testRealTime);
      for(let i=0;i<24;i++){window.testRealTime+=1000/120;engine.step(window.testRealTime);}
      const after=engine.snapshot();return {elapsed:after.time-before.time,speed:after.speed,paused:after.paused};
    });
    const measured=[];
    for(const [value,factor,label] of [['0',.5,'1,00×'],['-1',.25,'0,50×'],['1',1,'2,00×'],['0',.5,'1,00×']]){
      const before=await page.evaluate(()=>MazeBiters3DEngine.snapshot());
      await page.locator('#speed').fill(value);
      const after=await page.evaluate(()=>MazeBiters3DEngine.snapshot());
      assert.deepEqual({...after,speed:before.speed},before,'Changing speed cannot jump time or move actors');
      assert.equal(await page.locator('#speedValue').textContent(),label);
      const result=await advance();
      assert.ok(Math.abs(result.elapsed-200*factor)<1e-6,'All simulation time uses the selected rate');
      measured.push(result);
    }
    await page.evaluate(()=>MazeBiters3DEngine.pause());
    await page.locator('#speed').fill('1');
    assert.equal((await advance()).elapsed,0,'Speed changes do not unpause the game');
    await page.locator('#speed').fill('0');
    await page.locator('#speed').press('ArrowRight');
    assert.equal(await page.locator('#speed').inputValue(),'0.05','Arrow keys adjust the range without legacy game interception');
    await page.locator('#speed').fill('1');
    await page.evaluate(()=>MazeBiters3DEngine.start());
    assert.equal((await advance()).speed,1,'Restart preserves the chosen tempo');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({errors,checks:['half-speed start at slider midpoint','quarter/half/full clock rates','continuous mid-game change','pause','keyboard slider','restart retains tempo'],measured},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
