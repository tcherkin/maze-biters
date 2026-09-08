// Deterministic art review plus the directional lamp regression (no live game input).
const path=require('node:path');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const captureOnly=process.argv.includes('--before');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__look-check__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;background:#060913}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto('http://127.0.0.1:8093/__look-check__');
    const result=await page.evaluate(async captureOnly=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
      const scene=new DuskScene(document.getElementById('world'));
      const snakes=CONCEPT_SNAKES.map((s,i)=>({id:i+1,color:s.color,body:s.body.map(p=>({...p})),dir:{x:s.body[0].x-s.body[1].x,y:s.body[0].y-s.body[1].y},motion:null,reversing:false}));
      const player={id:1,...PLAYER_SPAWN,visual:{x:4,y:11},mouthOpen:true,dead:false,hidden:false,shield:false};
      const state={generation:1,started:true,maze:CONCEPT_MAZE,cols:19,rows:15,time:1100,player,snakes,paused:true};
      scene.reset(state);scene.render(state,0);
      const failures=[],checks=[];
      if(!captureOnly){
        const beamImage=scene.beam.userData.baseImage??scene.beam.material.map.image;
        const pixels=beamImage.data??beamImage.getContext('2d').getImageData(0,0,128,256).data;
        let maxAlpha=-1,rgb=[];
        for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>maxAlpha){maxAlpha=pixels[i+3];rgb=[pixels[i],pixels[i+1],pixels[i+2]];}
        if(!(rgb[0]>rgb[1]&&rgb[1]>rgb[2]*1.8))failures.push('Lamp texture must have a warm yellow core');
        if(scene.beam.material.map.colorSpace!==THREE.SRGBColorSpace)failures.push('Painted lamp color needs sRGB interpretation');
        const row=130,alphas=Array.from({length:128},(_,x)=>pixels[(row*128+x)*4+3]),peak=Math.max(...alphas);
        const litWidth=alphas.filter(alpha=>alpha>peak*.25).length/128*scene.beam.geometry.parameters.width;
        if(litWidth<1.1)failures.push('The middle of the golden pool is still too narrow');
        for(const dir of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
          player.dir=dir;scene.playerYaw=Math.atan2(dir.x,dir.y);scene.render(state,0);
          const attribute=scene.beam.geometry.attributes.position,origin=scene.player.position;
          let near=Infinity,far=-Infinity;
          for(let i=0;i<attribute.count;i++){
            const p=new THREE.Vector3().fromBufferAttribute(attribute,i);scene.beam.localToWorld(p);p.sub(origin);
            const along=p.x*dir.x+p.z*dir.y;near=Math.min(near,along);far=Math.max(far,along);
          }
          const offset=scene.beam.position.clone().sub(origin);
          const lateral=offset.x*dir.y-offset.z*dir.x;
          if(Math.abs(lateral)>.0001||far<9.8||far>10.5||near<-.35||near>.35)failures.push('Lamp points or reaches incorrectly: '+JSON.stringify({dir,near,far,lateral}));
          checks.push({dir,near,far});
        }
        const pose=scene.beam.matrixWorld.toArray();scene.render(state,0);
        if(JSON.stringify(pose)!==JSON.stringify(scene.beam.matrixWorld.toArray()))failures.push('Paused lamp position changed');
        // Smoke must rise behind all headings, freeze with the simulation and
        // leave no stale trail after a restart, hidden player or teleport.
        const vapor=scene.vapor,origin=new THREE.Vector3(),initialPool=[...vapor.puffs];
        const initialMaterials=initialPool.map(p=>p.material),initialTexture=vapor.texture;
        const sameResources=()=>vapor.puffs.length===initialPool.length&&vapor.texture===initialTexture&&vapor.puffs.every((p,i)=>p===initialPool[i]&&p.material===initialMaterials[i]&&p.material.map===initialTexture);
        const vaporPose=()=>JSON.stringify(vapor.puffs.map(p=>[p.visible,...p.position.toArray(),...p.scale.toArray(),p.material.opacity,p.material.rotation]));
        for(const dir of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
          vapor.reset();vapor.update(1200,origin,Math.atan2(dir.x,dir.y),true);
          const visible=vapor.puffs.filter(p=>p.visible);
          if(visible.length<4||visible.some(p=>p.position.x*dir.x+p.position.z*dir.y>=0||p.position.y<1))failures.push('Vapor must rise behind the helmet in every heading');
        }
        const frozen=vaporPose();for(let i=0;i<12;i++)vapor.update(1200,origin,0,true);
        if(vaporPose()!==frozen)failures.push('Paused vapor changed');
        vapor.update(1300,origin,0,true);if(vaporPose()===frozen)failures.push('Advancing game time must animate vapor');
        // Follow a continuous right-angle walk for 10 seconds, checking bounded
        // history and particle reuse rather than creating new sprites each frame.
        for(let i=0;i<600;i++){
          const seconds=i/60,afterTurn=seconds>5;
          const position=new THREE.Vector3(afterTurn?(seconds-5)*2:0,0,Math.min(seconds,5)*2);
          vapor.update(1400+i*1000/60,position,afterTurn?Math.PI/2:0,true);
        }
        if(vapor.history.length>80||!sameResources())failures.push('Vapor allocation grows while playing');
        // Old wisps belong to their emission position. A distance fade around
        // the current helmet erased the trail at actual player speeds, even
        // though the slow walk above and a stationary screenshot both passed.
        const movingTrails=[];
        for(const [run,speed] of [8,16,21,42].entries()){
          vapor.reset();
          const startTime=20000+run*20000;
          let minOldPuffs=Infinity,maxHistory=0,oldAfterTurn=0,pauseChecked=false;
          for(let frame=0;frame<=600;frame++){
            const seconds=frame/60,afterTurn=seconds>5,time=startTime+seconds*1000;
            const position=new THREE.Vector3(afterTurn?(seconds-5)*speed:0,0,Math.min(seconds,5)*speed);
            const yaw=afterTurn?Math.PI/2:0;
            vapor.update(time,position,yaw,true);
            const old=vapor.puffs.filter(p=>p.visible&&p.material.opacity>=.10&&Math.hypot(p.position.x-position.x,p.position.z-position.z)>2.8);
            if(seconds>=1.2)minOldPuffs=Math.min(minOldPuffs,old.length);
            maxHistory=Math.max(maxHistory,vapor.history.length);
            if(frame===315){
              // A quarter second after turning east, older northbound wisps
              // must remain on the original leg, not rotate with the helmet.
              oldAfterTurn=old.filter(p=>p.position.x<.8&&p.position.z<5*speed-.2).length;
              const movingPose=vaporPose(),history=JSON.stringify(vapor.history);
              for(let pausedFrame=0;pausedFrame<12;pausedFrame++)vapor.update(time,position,yaw,true);
              pauseChecked=vaporPose()===movingPose&&JSON.stringify(vapor.history)===history;
            }
          }
          if(minOldPuffs<4)failures.push(`Moving vapor vanishes behind the player at ${speed} units/s: ${minOldPuffs} substantial old wisps`);
          if(oldAfterTurn<2)failures.push(`Vapor loses the old route after a turn at ${speed} units/s`);
          if(!pauseChecked)failures.push(`Pausing during ${speed} units/s movement changed the vapor trail`);
          if(maxHistory>80||!sameResources())failures.push(`Vapor history or GPU resources grow at ${speed} units/s`);
          movingTrails.push({speed,minOldPuffs,oldAfterTurn,maxHistory,pauseChecked});
        }
        const far=new THREE.Vector3(40,0,40);vapor.update(100000,far,Math.PI/2,true);
        if(vapor.puffs.filter(p=>p.visible).some(p=>Math.hypot(p.position.x-far.x,p.position.z-far.z)>2.8))failures.push('Respawn retained the old vapor trail');
        vapor.update(100100,far,0,false);
        if(vapor.group.visible||vapor.history.length||vapor.puffs.some(p=>p.visible))failures.push('Hidden or dead player retained vapor');
        vapor.update(0,origin,0,true);vapor.reset();
        if(vapor.history.length||vapor.group.visible)failures.push('Restart did not clear vapor');
        if(!sameResources())failures.push('Vapor reset recreated shared GPU resources');
        checks.push({litWidth,movingTrails,vapor:'four headings, moving pause, visible old trail, turn, bounded pool/history/materials/texture, respawn and reset'});
      }
      player.dir={x:0,y:1};scene.playerYaw=0;scene.render(state,0);
      window.__lookReview={scene,state};return {failures,checks,renderer:scene.diagnostics()};
    },captureOnly);
    const suffix=captureOnly?'before':'after';
    await page.screenshot({path:`experiments/3d/preview-look-${suffix}.png`});
    await page.evaluate(()=>{
      const {scene,state}=window.__lookReview;
      // A legal open route placed beside P1 makes the skull folds, eyes and
      // short beam readable at a repeatable viewing angle.
      state.snakes=[{id:20,color:'#079ed1',body:[{x:8,y:10},{x:8,y:9},{x:8,y:8},{x:8,y:7},{x:8,y:6}],dir:{x:0,y:1},motion:null,reversing:false}];
      scene.render(state,0);
      scene.camera.left=-7.2;scene.camera.right=7.2;scene.camera.top=4.8;scene.camera.bottom=-4.8;
      scene.camera.position.set(-3,12,24);scene.camera.lookAt(-6,.4,7);scene.camera.updateProjectionMatrix();
      scene.vapor.update(state.time,scene.player.position,scene.playerYaw,true,scene.camera);
      scene.renderer.render(scene.scene,scene.camera);
    });
    await page.screenshot({path:`experiments/3d/preview-look-${suffix}-close.png`});
    await page.evaluate(()=>{
      const {scene,state}=window.__lookReview,head=scene.snakes.get(20).head;
      scene.camera.left=-2.25;scene.camera.right=2.25;scene.camera.top=1.5;scene.camera.bottom=-1.5;
      const focus=head.position.clone();focus.y+=.65;
      scene.camera.position.copy(focus).add({x:4,y:6,z:7});
      scene.camera.lookAt(focus);scene.camera.updateProjectionMatrix();
      scene.vapor.update(state.time,scene.player.position,scene.playerYaw,true,scene.camera);
      scene.renderer.render(scene.scene,scene.camera);
    });
    await page.screenshot({path:`experiments/3d/preview-look-${suffix}-head.png`});
    if(!captureOnly)for(const [label,opening] of [['closed',0],['open',1]]){
      await page.evaluate(async opening=>{
        const {animateSnakeMouth}=await import('/experiments/3d/models/snake.mjs');
        const {scene}=window.__lookReview;
        animateSnakeMouth(scene.snakes.get(20).head,opening);
        scene.renderer.render(scene.scene,scene.camera);
      },opening);
      await page.screenshot({path:`experiments/3d/preview-mouth-${label}.png`});
    }
    if(!captureOnly){
      await page.evaluate(()=>{
        const {scene,state}=window.__lookReview;
        // Move at the normal game's ~21 physical units/s along an open route:
        // the bottom corridor to (12,13), then north through the clear column.
        // Capture the trail left before and after the turn, not seeded smoke
        // around a stationary player.
        state.time=20000;state.paused=false;state.player.dead=state.player.hidden=false;
        state.player.visual={x:4,y:13};state.player.dir={x:1,y:0};
        scene.reset(state);scene.playerYaw=Math.PI/2;
        for(let frame=0;frame<=72;frame++){
          const distance=frame/60*21,afterTurn=distance>16;
          state.player.visual={x:afterTurn?12:4+distance/2,y:afterTurn?13-(distance-16)/2:13};
          state.player.dir=afterTurn?{x:0,y:-1}:{x:1,y:0};
          state.time=20000+frame*1000/60;scene.render(state,1/60);
        }
        scene.camera.left=-14.4;scene.camera.right=14.4;scene.camera.top=9.6;scene.camera.bottom=-9.6;
        scene.camera.position.set(0,24,31);scene.camera.lookAt(0,.5,7);scene.camera.updateProjectionMatrix();
        scene.vapor.update(state.time,scene.player.position,scene.playerYaw,true,scene.camera);
        scene.renderer.render(scene.scene,scene.camera);
      });
      await page.screenshot({path:'experiments/3d/preview-look-moving.png'});
    }
    console.log(JSON.stringify({errors,...result},null,2));
    if(errors.length||result.failures.length)process.exitCode=1;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
