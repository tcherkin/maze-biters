const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const fixture=`globalThis.__cadenceFixture={
  arena(){experimentRelease();CentralGameClock.reset(1000);gameOver=false;gameOverPending=false;paused=false;experimentCompleted=false;
    maze=Array.from({length:ROWS},(_,y)=>Array.from({length:COLS},(_,x)=>x===0||x===COLS-1||y===0||y===ROWS-1?'#':'.'));
    mazeRevision++;eggObstacleRevision++;
    Object.assign(player,{x:2,y:7,prevX:2,prevY:7,moveFromX:2,moveFromY:7,moveToX:2,moveToY:7,moveStartedAt:1000,moveDuration:95,lastMove:1000,experimentStepDistance:1,
      dir:{x:1,y:0},nextDir:{x:1,y:0},dead:false,eliminated:false,hideDeathSprite:false,waitingForInput:false,pointerNavigation:null,pointerMomentum:false,
      reactionAssistRicochet:null,spawnShieldUntil:Infinity,powerModeUntil:0,deathStartedAt:null,respawnAt:null});
    snakes=[makeSnake(2,2,1,{x:1,y:0})];snakes[0].lastMove=Infinity;
    eggs=[];hunters=[];fruits=[];scorpion=null;scorpionSpawnAt=Infinity;experimentBites=[];experimentPredations=[];experimentGeneration++;
  }
};`;
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});
  try{const page=await browser.newPage();
    await page.route('**/app.mjs*',r=>r.fulfill({contentType:'text/javascript',body:''}));
    const engine=fs.readFileSync(path.join(root,'engine/maze-biters-experiment.js'),'utf8');
    await page.route('**/maze-biters-experiment.js*',r=>r.fulfill({contentType:'text/javascript',body:engine.replace('globalThis.MazeBiters3DEngine=Object.freeze({',fixture+'globalThis.MazeBiters3DEngine=Object.freeze({')}));
    await page.goto('http://127.0.0.1:8093/experiments/3d/');await page.evaluate(()=>__mazeBitersReady);
    const results=await page.evaluate(()=>{
      const e=MazeBiters3DEngine,rows=[],check=(v,m)=>{if(!v)throw new Error(m);};e.start();e.setSpeed(.5);
      for(const hz of [60,120,144,240]){
        __cadenceFixture.arena();let sim=1000,old=null,oldRender=null,duplicates=0,renderDuplicates=0,samples=0,maxStep=0;
        for(let frame=1;frame<=hz*2;frame++){
          const now=1000+frame*1000/hz;while(sim+1000/120<=now){sim+=1000/120;e.step(sim);}
          const logical=e.snapshot(),frozen=JSON.stringify(logical),render=e.snapshot(now);
          check(JSON.stringify(e.snapshot())===frozen,'Presentation sampling never advances or changes gameplay');
          check(render.time>=logical.time&&render.time-logical.time<=1000/120*.5+.001,'Presentation time remains within one scaled tick');
          check(render.player.visual.x<=logical.player.x+1e-7,'Presentation stays inside the committed move');
          if(frame>hz*.5&&old!==null){samples++;if(Math.abs(logical.player.visual.x-old)<1e-7)duplicates++;
            if(Math.abs(render.player.visual.x-oldRender)<1e-7)renderDuplicates++;maxStep=Math.max(maxStep,render.player.visual.x-oldRender);}
          old=logical.player.visual.x;oldRender=render.player.visual.x;
        }
        if(hz>120)check(renderDuplicates<duplicates*.15,'High-refresh presentation removes repeated stationary frames');
        e.pause();const stopped=JSON.stringify(e.snapshot());check(JSON.stringify(e.snapshot(sim+500))===stopped,'Paused presentation is frozen');
        rows.push({hz,samples,duplicates,renderDuplicates,maxStep});
      }return rows;
    });assert.equal(results.length,4);console.log(JSON.stringify(results));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
