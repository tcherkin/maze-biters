const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const fixture=`globalThis.__dustFixture={
  place(x,y,dir={x:1,y:0}){
    experimentRelease();const t=gameTimeNow();
    Object.assign(player,{x,y,prevX:x,prevY:y,moveFromX:x,moveFromY:y,moveToX:x,moveToY:y,
      moveStartedAt:t,moveDuration:95,lastMove:t,dir:{...dir},nextDir:{...dir},
      dead:false,eliminated:false,hideDeathSprite:false,waitingForInput:true,
      reactionAssistRicochet:null,spawnShieldUntil:Infinity,powerModeUntil:0});
    for(const s of snakes)s.lastMove=Infinity;
  },stop(){experimentRelease();player.waitingForInput=true;}
};`;
const stats=values=>{const a=values.slice().sort((a,b)=>a-b);return{samples:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};};
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  const errors=[],results=[];
  try{
    for(const width of [1920,3840]){
      const context=await browser.newContext({viewport:{width,height:width*9/16},deviceScaleFactor:1}),page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.route(url=>url.pathname.endsWith('/maze-biters-experiment.js'),route=>route.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(path.join(root,'engine/maze-biters-experiment.js'),'utf8').replace('globalThis.MazeBiters3DEngine=Object.freeze({',fixture+'globalThis.MazeBiters3DEngine=Object.freeze({')}));
      await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer','globalThis.__dustScene=this;this.renderer=new THREE.WebGLRenderer')}));
      await page.goto('http://127.0.0.1:8093/experiments/3d/?v=0.3.41&look=balanced&trail=off');
      await page.getByRole('button',{name:'Влез в играта',exact:true}).waitFor({timeout:60000});
      assert.equal(await page.evaluate(()=>__mazeBiters3D.diagnostics().renderer.crystalDust.enabled),false);
      await page.locator('#start').click();
      await page.evaluate(()=>{
        const scene=__dustScene,render=scene.render.bind(scene),gl=scene.renderer.getContext();
        globalThis.__dustFrames=[];globalThis.__collectDust=false;globalThis.__pairDust=false;globalThis.__dustPairs=[];
        scene.render=(snapshot,dt,elapsed)=>{
          const start=performance.now();render(snapshot,dt,elapsed);
          if(!__collectDust)return;
          gl.finish();
          const dust=scene.dust,p=scene.player.position;
          let reach=0;
          for(let i=0;i<dust.particles.length;i++)if(dust.alphas[i]>.008)
            reach=Math.max(reach,Math.hypot(dust.positions[i*3]-p.x,dust.positions[i*3+2]-p.z)+dust.sizes[i]/2);
          __dustFrames.push({completeMs:performance.now()-start,interval:elapsed*1000,count:dust.active,reach,
            x:snapshot.player.visual.x,y:snapshot.player.visual.y,draws:scene.wallMirrors.lastTotalCalls});
          if(__pairDust&&dust.group.visible){
            const pair={};
            for(const enabled of __dustPairs.length%2?[true,false]:[false,true]){
              dust.group.visible=enabled;const began=performance.now();
              scene.wallMirrors.render(scene.scene,scene.camera);gl.finish();pair[enabled?'on':'off']=performance.now()-began;
            }
            dust.group.visible=true;__dustPairs.push(pair);
          }
        };
      });
      const place=async(x,y,enabled=true,speed=.5)=>page.evaluate(({x,y,enabled,speed})=>{
        __dustFixture.place(x,y);__dustScene.dust.setEnabled(enabled);__dustScene.resetCamera=true;
        MazeBiters3DEngine.setSpeed(speed);__dustFrames=[];__collectDust=false;
      },{x,y,enabled,speed});
      const record=async(name,keys,duration=1000)=>{
        for(const key of keys)await page.keyboard.down(key);
        await page.waitForTimeout(180);await page.evaluate(()=>{__dustFrames=[];__collectDust=true;});
        await page.waitForTimeout(duration);
        const rows=await page.evaluate(()=>{__collectDust=false;return __dustFrames;});
        for(const key of keys)await page.keyboard.up(key);
        assert.ok(rows.length>5,name+' records moving frames');
        assert.ok(rows.every(row=>row.reach<1.6&&row.count<=6),name+' remains sparse and short');
        const report={width,name,completeMs:stats(rows.map(r=>r.completeMs)),frameIntervalMs:stats(rows.map(r=>r.interval)),
          maxCount:Math.max(...rows.map(r=>r.count)),meanCount:rows.reduce((n,r)=>n+r.count,0)/rows.length,
          maxReach:Math.max(...rows.map(r=>r.reach)),draws:stats(rows.map(r=>r.draws))};results.push(report);
        return rows;
      };
      // Identical bottom corridor, real movement, warmed before capture; GPU is
      // completed explicitly. These are local measurements, not an FPS promise.
      await place(3,13,true);await record('warmup',['d'],600);
      await place(3,13,false);await record('off',['d']);
      await place(3,13,true);const moving=await record('on',['d']);
      assert.ok(moving.some(r=>r.count>=3));
      await place(3,4,true);await record('clear-corridor',['d'],300);
      await page.evaluate(()=>MazeBiters3DEngine.pause());
      await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
      await page.screenshot({path:path.join(root,`preview-crystal-dust-${width}.png`)});
      const clip=await page.evaluate(()=>{
        const p=__dustScene.player.position.clone();p.y+=.5;p.project(__dustScene.camera);
        const size=innerWidth/1920;
        return{x:Math.max(0,Math.min(innerWidth-300*size,(p.x+1)*innerWidth/2-170*size)),
          y:Math.max(0,Math.min(innerHeight-220*size,(1-p.y)*innerHeight/2-100*size)),width:300*size,height:220*size};
      });
      await page.screenshot({path:path.join(root,`preview-crystal-dust-detail-${width}.png`),clip});
      await page.evaluate(()=>MazeBiters3DEngine.pause());
      await page.evaluate(()=>__dustFixture.stop());await page.waitForTimeout(800);
      assert.equal(await page.evaluate(()=>__dustScene.dust.active),0,'Stop fades out the existing trail');
      await record('restart',['d'],300);
      await place(1,1,true);await record('diagonal',['d','s'],350);
      await place(6,1,true);
      await page.keyboard.down('d');await page.waitForFunction(()=>__mazeBiters3D.snapshot().player.x===7);
      await page.keyboard.up('d');await page.keyboard.down('s');
      await page.waitForFunction(()=>__mazeBiters3D.snapshot().player.y===2);
      await page.keyboard.up('s');await record('tight-turn',['a'],350);
      await place(9,1,true);await page.evaluate(()=>__dustFixture.place(9,1,{x:0,y:-1}));
      await record('against-wall',['w'],300);
      assert.equal(await page.evaluate(()=>__dustScene.dust.active),0,'Blocked movement emits nothing');
      await place(3,13,true,1);await record('fast',['d'],600);
      for(const zoom of [1,2]){
        await place(3,13,true);await page.evaluate(zoom=>__dustScene.targetZoom=zoom,zoom);
        await record('zoom-'+zoom,['d'],600);
      }
      await place(3,13,true);await page.evaluate(()=>{__dustScene.targetZoom=1.5;__pairDust=true;});
      await record('paired-identical-poses',['d'],900);
      const pairs=await page.evaluate(()=>{__pairDust=false;return __dustPairs;});
      assert.ok(pairs.length>5);
      results.push({width,name:'paired-full-render',samples:pairs.length,off:stats(pairs.map(p=>p.off)),
        on:stats(pairs.map(p=>p.on)),difference:stats(pairs.map(p=>p.on-p.off))});
      await context.close();
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(root,'preview-crystal-dust-report.log'),JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify({results,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
