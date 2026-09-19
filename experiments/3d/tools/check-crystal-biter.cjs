const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),quick=process.argv.includes('--quick'),compare=process.argv.includes('--compare');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  const errors=[],results=[];
  try{
    for(const width of process.argv.includes('--4k')?[3840]:quick?[1920]:[1920,3840])for(const model of quick?['crystal']:compare?['crystal-v3','crystal']:['old','crystal']){
      const page=await browser.newPage({viewport:{width,height:width*9/16},deviceScaleFactor:1});
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer',
          'globalThis.__biterScene=this;globalThis.__biterThree=THREE;this.renderer=new THREE.WebGLRenderer')}));
      await page.route(url=>url.pathname.endsWith('/maze-biters-experiment.js'),route=>route.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(path.join(root,'engine/maze-biters-experiment.js'),'utf8').replace('globalThis.MazeBiters3DEngine=Object.freeze({',`
          globalThis.__placeBiter=(x,y)=>{experimentRelease();const t=gameTimeNow();
            Object.assign(player,{x,y,prevX:x,prevY:y,moveFromX:x,moveFromY:y,moveToX:x,moveToY:y,
              moveStartedAt:t,moveDuration:95,lastMove:t,dir:{x:1,y:0},nextDir:{x:1,y:0},waitingForInput:true,
              dead:false,hideDeathSprite:false,reactionAssistRicochet:null,spawnShieldUntil:Infinity,powerModeUntil:0});
            for(const snake of snakes)snake.lastMove=Infinity;};
          globalThis.MazeBiters3DEngine=Object.freeze({`)}));
      await page.goto(`http://127.0.0.1:8093/experiments/3d/?v=0.3.46&look=balanced&player=${model}`);
      await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:60000});
      await page.evaluate(async()=>{
        MazeBiters3DEngine.pause();
        const s=__biterScene,{CONCEPT_SNAKES,CONCEPT_MAZE}=await import('/experiments/3d/maze-layout.mjs');
        globalThis.__renderBiter=s.render.bind(s);s.render=()=>{};
        globalThis.__biterState={generation:99,started:true,paused:true,time:1000,maze:CONCEPT_MAZE,cols:19,rows:15,
          player:{id:1,x:4,y:11,visual:{x:4,y:11},dir:{x:0,y:1},dead:false,hidden:false,shield:false,powered:false},
          snakes:CONCEPT_SNAKES.map((o,i)=>({...o,id:i+1,dir:{x:o.body[0].x-o.body[1].x,y:o.body[0].y-o.body[1].y},motion:null,reversing:false})),bites:[],predations:[]};
        s.reset(__biterState);s.resetView();
        globalThis.__poseBiter=(yaw=0,jaw=null,zoom=1.5)=>{
          const p=__biterState.player;p.dir={x:Math.sin(yaw),y:Math.cos(yaw)};
          s.playerYaw=yaw;s.zoom=s.targetZoom=zoom;s.resetCamera=true;__renderBiter(__biterState,0);
          if(jaw!==null){s.player.userData.jaw.rotation.x=jaw;s.player.userData.applyPose?.();s.wallMirrors.render(s.scene,s.camera);}
        };
        __poseBiter();
      });
      await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
      for(const [name,yaw,jaw]of [['front',0,null],['profile',Math.PI/2,null],['rear',Math.PI,null],['diagonal',Math.PI/4,null],['bite',0,.30]]){
        await page.evaluate(([yaw,jaw])=>__poseBiter(yaw,jaw),[yaw,jaw]);
        if(name==='front')await page.screenshot({path:path.join(root,`preview-biter-v4-legacy-${model}-${width}-game.png`)});
        const clip=await page.evaluate(()=>{
          const s=__biterScene,p=s.player.position.clone();p.y=.7;p.project(s.camera);const box=s.renderer.domElement.getBoundingClientRect(),scale=innerWidth/1920;
          return{x:Math.max(0,box.x+(p.x+1)*box.width/2-180*scale),y:Math.max(0,box.y+(1-p.y)*box.height/2-140*scale),width:360*scale,height:280*scale};
        });
        await page.screenshot({path:path.join(root,`preview-biter-v4-legacy-${model}-${width}-${name}.png`),clip});
      }
      const checks=await page.evaluate(()=>{
        const s=__biterScene,names=[];let triangles=0;
        s.player.traverse(o=>{if(o.isMesh){names.push(o.name);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
        __poseBiter();const versions=[];
        for(const patch of [{shield:true},{shield:false,powered:true},{powered:false,dead:true},{dead:false,hidden:true},{hidden:false}]){
          Object.assign(__biterState.player,patch);__renderBiter(__biterState,1/60);versions.push(s.player.userData.modelVersion);
        }
        const memory={...s.renderer.info.memory},lightCount=(()=>{let n=0;s.scene.traverse(o=>{if(o.isLight)n++;});return n;})();
        const time=[],gl=s.renderer.getContext();
        for(let frame=0;frame<90;frame++){
          const t=frame/60,p=__biterState.player;
          p.visual.x=3+t*.7;p.visual.y=11+t*.7;p.dir={x:1,y:1};__biterState.time=1000+frame*8.333;
          const start=performance.now();__renderBiter(__biterState,1/60);gl.finish();if(frame>20)time.push(performance.now()-start);
        }
        time.sort((a,b)=>a-b);
        return{version:s.player.userData.modelVersion,names,triangles,versions,dust:s.dust.diagnostics(),lightCount,
          memoryBefore:memory,memoryAfter:{...s.renderer.info.memory},draws:s.diagnostics().drawCalls,
          renderMs:{p50:time[Math.floor(time.length*.5)],p95:time[Math.floor(time.length*.95)]}};
      });
      assert.equal(checks.version,model==='crystal'?'crystal-biter-v4':model==='crystal-v3'?'crystal-biter-v3':model==='crystal-v2'?'crystal-biter-v2':model==='crystal-v1'?'crystal-biter-v1':'concept-player-v5');
      assert.ok(checks.versions.every(v=>v===checks.version));assert.equal(checks.dust.enabled,false);
      if(model==='crystal')assert.ok(!checks.names.some(n=>/helmet|visor|ruby/i.test(n)));
      assert.deepEqual(checks.memoryAfter,checks.memoryBefore,'Moving poses reuse all geometry and textures');
      const live=[];
      for(const [zoom,keys]of [[1,['d']],[1.5,['d','s']],[2,['d']]]){
        await page.evaluate(({zoom,diagonal})=>{
          const s=__biterScene;__placeBiter(3,diagonal?11:13);s.zoom=s.targetZoom=zoom;s.resetCamera=true;
          globalThis.__liveBiter=[];s.render=(state,dt,elapsed)=>{__renderBiter(state,dt,elapsed);
            __liveBiter.push({x:state.player.visual.x,y:state.player.visual.y,interval:elapsed*1000,yaw:s.playerYaw});};
          if(__mazeBiters3D.snapshot().paused)MazeBiters3DEngine.pause();
        },{zoom,diagonal:keys.length===2});
        for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(750);
        for(const key of keys)await page.keyboard.up(key);
        const rows=await page.evaluate(()=>__liveBiter.slice(5));
        assert.ok(rows.length>10);assert.ok(rows.at(-1).x>rows[0].x);
        if(keys.length===2)assert.ok(rows.at(-1).y>rows[0].y,'Actual diagonal keyboard motion advances both axes');
        assert.ok(rows.every(r=>[r.x,r.y,r.yaw].every(Number.isFinite)));
        const intervals=rows.map(r=>r.interval).sort((a,b)=>a-b);
        live.push({zoom,samples:rows.length,p50:intervals[Math.floor(intervals.length*.5)],p95:intervals[Math.floor(intervals.length*.95)]});
      }
      results.push({width,model,...checks,liveFrameMs:live});await page.close();
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
