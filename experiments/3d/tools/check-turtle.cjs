// Frozen staging keeps every snake, reflection source and camera identical.
// Run only when no other GPU verification or recording is active.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),quick=process.argv.includes('--quick'),materialOnly=process.argv.includes('--material');
const selectWidth=process.argv.includes('--4k')?[3840]:quick?[1920]:[1920,3840];
const models=quick?['turtle']:['hedgehog','turtle'];
const variants=['current'];
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  const results=[],errors=[];
  try{
    for(const width of selectWidth)for(const model of models)for(const lighting of variants){
      const revision=model,prefix=`preview-turtle-${revision}-${lighting}-${width}`;
      console.error(`[turtle] ${revision} / ${lighting} / ${width}`);
      const page=await browser.newPage({viewport:{width,height:width*9/16},deviceScaleFactor:1});
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',body:
        fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer','globalThis.__turtleScene=this;globalThis.__turtleThree=THREE;this.renderer=new THREE.WebGLRenderer')}));
      await page.goto(`http://127.0.0.1:8093/experiments/3d/?v=0.3.48&look=balanced&player=${model}&lighting=${lighting}`);
      await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:60000});
      await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
      await page.evaluate(async()=>{
        MazeBiters3DEngine.pause();const s=__turtleScene;
        const {CONCEPT_SNAKES,CONCEPT_MAZE}=await import('/experiments/3d/maze-layout.mjs');
        globalThis.__turtleRender=s.render.bind(s);s.render=()=>{};
        globalThis.__turtleState={generation:123,started:true,paused:true,speed:.5,time:1000,maze:CONCEPT_MAZE,cols:19,rows:15,
          player:{id:1,x:4,y:11,visual:{x:4,y:11},dir:{x:0,y:1},dead:false,hidden:false,shield:false,powered:false},
          snakes:CONCEPT_SNAKES.map((o,i)=>({...o,id:i+1,dir:{x:o.body[0].x-o.body[1].x,y:o.body[0].y-o.body[1].y},motion:null,reversing:false})),bites:[],predations:[]};
        s.reset(__turtleState);s.resetView();s.snakeLight.reset();
        globalThis.__turtlePose=(yaw=0,jaw=null)=>{
          const p=__turtleState.player;p.visual.x=4;p.visual.y=11;p.dir={x:Math.sin(yaw),y:Math.cos(yaw)};
          s.playerYaw=yaw;s.zoom=s.targetZoom=1.5;s.resetCamera=true;
          for(let i=0;i<3;i++)__turtleRender(__turtleState,1/60,1/60);
          if(jaw!==null){s.player.userData.jaw.rotation.x=jaw;s.player.userData.applyPose();s.wallMirrors.render(s.scene,s.camera);}
          s.renderer.getContext().finish();
        };
        __turtlePose();
      });
      const metadata=await page.evaluate(()=>({app:__mazeBiters3D.diagnostics(),renderer:__turtleScene.diagnostics(),
        lights:(()=>{let n=0;__turtleScene.scene.traverse(o=>{if(o.isLight)n++;});return n;})(),
        model:(()=>{let meshes=0,triangles=0;const materials=new Set();__turtleScene.player.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;materials.add(o.material);}});return{meshes,triangles,materials:materials.size};})()}));
      assert.equal(metadata.renderer.playerModel,model==='turtle'?'crystal-turtle-v1':'neon-hedgehog-v1');assert.equal(metadata.app.presentation.look,'balanced');
      assert.equal(metadata.renderer.lightingVariant,lighting);assert.equal(metadata.renderer.zoom,1.5);
      assert.equal(metadata.renderer.tiltDegrees,55);assert.equal(metadata.renderer.projection,.5);assert.equal(metadata.renderer.crystalDust.enabled,false);
      for(const [pose,yaw,jaw]of [['front',0,null],['rear',Math.PI,null],['profile',Math.PI/2,null],['diagonal',Math.PI/4,null],['bite',0,.30]]){
        await page.evaluate(([yaw,jaw])=>__turtlePose(yaw,jaw),[yaw,jaw]);
        await page.screenshot({path:path.join(root,`${prefix}-${pose}-game.png`)});
        const clip=await page.evaluate(()=>{
          const s=__turtleScene,p=s.player.position.clone();p.y=.7;p.project(s.camera);const b=s.renderer.domElement.getBoundingClientRect(),k=innerWidth/1920;
          return{x:Math.max(0,b.x+(p.x+1)*b.width/2-180*k),y:Math.max(0,b.y+(1-p.y)*b.height/2-140*k),width:360*k,height:280*k};
        });
        await page.screenshot({path:path.join(root,`${prefix}-${pose}-detail.png`),clip});
        if(revision==='turtle'){
          await page.evaluate(()=>{__turtleScene.player.traverse(o=>{if(o.userData.insetCore)o.visible=false;});__turtleScene.wallMirrors.render(__turtleScene.scene,__turtleScene.camera);});
          await page.screenshot({path:path.join(root,`${prefix}-${pose}-game-cores-off.png`)});
          await page.screenshot({path:path.join(root,`${prefix}-${pose}-detail-cores-off.png`),clip});
          await page.evaluate(()=>{__turtleScene.player.traverse(o=>{if(o.userData.insetCore)o.visible=true;});__turtleScene.wallMirrors.render(__turtleScene.scene,__turtleScene.camera);});
        }
      }
      const checks=await page.evaluate(()=>{
        const s=__turtleScene,p=__turtleState.player,props=()=>{
          const values=[];s.player.traverse(o=>{if(o.isMesh)values.push({name:o.name,color:o.material.color?.getHex(),emissive:o.material.emissive?.getHex(),
            intensity:o.material.emissiveIntensity,transmission:o.material.transmission,opacity:o.material.opacity,roughness:o.material.roughness});});return values;
        };Object.assign(p,{shield:false,powered:false,dead:false,hidden:false});__turtlePose();const baseline=props();
        for(const state of [{shield:true},{shield:false,powered:true},{powered:false,dead:true},{dead:false,hidden:true},{hidden:false}]){
          Object.assign(p,state);__turtleRender(__turtleState,1/60,1/60);
        }
        return{baseline,restored:props(),visible:s.player.visible};
      });assert.deepEqual(checks.baseline,checks.restored,'All optical materials restore after shield/power/death/hidden');assert.ok(checks.visible);
      let bench=null;
      if(!materialOnly){
        bench=await page.evaluate(()=>{
          const s=__turtleScene,state=__turtleState,p=state.player,gl=s.renderer.getContext();state.paused=false;
          const cases=[];
          for(const zoom of [1.5,2]){
            s.zoom=s.targetZoom=zoom;s.resetCamera=true;s.player.userData.gait.reset();const times=[];let before;
            for(let i=0;i<180;i++){
              state.time=2000+i*1000/120;p.visual.x=4+Math.sin(i/30)*1.5;p.visual.y=13;p.dir={x:Math.cos(i/30)>=0?1:-1,y:0};
              const start=performance.now();__turtleRender(state,1/120,1/120);gl.finish();
              if(i===59)before={...s.renderer.info.memory};if(i>=60)times.push(performance.now()-start);
            }
            times.sort((a,b)=>a-b);cases.push({zoom,samples:times.length,p50:times[60],p95:times[114],p99:times[118],max:times.at(-1),
              before,after:{...s.renderer.info.memory},drawCalls:s.diagnostics().drawCalls,triangles:s.diagnostics().triangles});
          }
          return cases;
        });for(const sample of bench)assert.deepEqual(sample.before,sample.after,'Warmed movement reuses all geometry and textures');
      }
      results.push({width,model:revision,lighting,metadata,bench});await page.close();
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
