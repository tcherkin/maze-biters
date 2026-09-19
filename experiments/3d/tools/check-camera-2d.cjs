const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8093/?camera=68',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>globalThis.__mazeBitersReady);
    await page.evaluate(()=>{
      globalThis.cameraFrames=[];
      function sample(){
        if(document.getElementById('game').getAttribute('aria-label')==='Maze Biters gameplay maze')
          cameraFrames.push(__mazeBitersCameraDiagnostics());
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await page.keyboard.press('1');
    await page.waitForFunction(()=>cameraFrames.length>0,{},{timeout:30000});
    await page.waitForFunction(()=>cameraFrames.at(-1).zoom>1.499,{},{timeout:30000});
    const result=await page.evaluate(()=>({first:cameraFrames[0],last:cameraFrames.at(-1),
      maxStep:Math.max(...cameraFrames.slice(1).map((f,i)=>Math.abs(f.zoom-cameraFrames[i].zoom)))}));
    assert.ok(result.first.zoom<1.02);assert.ok(result.maxStep<.05);
    assert.ok(result.last.zoom<=1.5+1e-9);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result,errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
