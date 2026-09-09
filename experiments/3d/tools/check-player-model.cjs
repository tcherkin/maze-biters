// Actual DuskScene player under the game's existing materials and lights.
// Images are art-review evidence; assertions cover physical/animation safety.
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/experiments/3d/';
const label=process.argv.includes('--before')?'before':'after';

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[],captures=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/__player-model-check__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;background:#060913}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto(new URL('/__player-model-check__',base).href);
    const result=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {createPlayerModel}=await import('/experiments/3d/models/player.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
      const {CHOMP_MS}=await import('/experiments/3d/bite-effects.mjs');
      const scene=new DuskScene(document.getElementById('world'));
      const snakes=CONCEPT_SNAKES.map((s,i)=>({id:i+1,color:s.color,body:s.body.map(p=>({...p})),dir:{x:s.body[0].x-s.body[1].x,y:s.body[0].y-s.body[1].y},motion:null,reversing:false}));
      const player={id:1,...PLAYER_SPAWN,visual:{x:4,y:11},mouthOpen:true,dead:false,hidden:false,shield:false,powered:false};
      const state={generation:1,started:true,maze:CONCEPT_MAZE,cols:19,rows:15,time:1100,player,snakes,paused:true,bites:[],predations:[]};
      const failures=[],angles=[],bounds={radius:0,minY:Infinity,maxY:-Infinity};
      let checks=0,vertices=0,sharedDisposals=0;
      const check=(condition,message)=>{checks++;if(!condition&&failures.length<30)failures.push(message);};
      const meshes=root=>{const result=[];root.traverse(object=>{if(object.isMesh)result.push(object);});return result;};
      const initialMeshes=meshes(scene.player),geometries=new Set(initialMeshes.map(m=>m.geometry));
      for(const geometry of geometries)geometry.addEventListener('dispose',()=>sharedDisposals++);
      const inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
      function measure(angle){
        scene.player.userData.jaw.rotation.x=angle;
        scene.player.updateWorldMatrix(true,true);inverse.copy(scene.player.matrixWorld).invert();
        let radius=0,minY=Infinity,maxY=-Infinity;
        for(const object of meshes(scene.player)){
          const position=object.geometry.attributes.position,normal=object.geometry.attributes.normal;
          check([...object.matrixWorld.elements].every(Number.isFinite),'Player model transform is finite');
          check(position&&[...position.array].every(Number.isFinite),'Player vertices are finite');
          check(normal&&[...normal.array].every(Number.isFinite),'Player normals are finite');
          matrix.multiplyMatrices(inverse,object.matrixWorld);
          for(let i=0;i<position.count;i++){
            point.fromBufferAttribute(position,i).applyMatrix4(matrix);vertices++;
            radius=Math.max(radius,Math.hypot(point.x,point.z));
            minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);
          }
        }
        check(radius<=.414001,'Native articulated player exceeds the .414 collision envelope at jaw '+angle+' (radius '+radius+')');
        check(minY>=-1e-6,'Articulated player crosses the floor at jaw '+angle+' (height '+minY+')');
        check(maxY<=.980001,'Player exceeds the established native height envelope');
        bounds.radius=Math.max(bounds.radius,radius);bounds.minY=Math.min(bounds.minY,minY);bounds.maxY=Math.max(bounds.maxY,maxY);
        angles.push({angle,radius,minY,maxY});
      }
      scene.reset(state);scene.render(state,0);
      check(!!scene.player.userData.jaw,'The actual player exposes its animated jaw hinge');
      // The consuming animation closes to .04; idle motion uses .08-.22;
      // swallowing and the initial chomp reach .28 and .30 respectively.
      for(let step=0;step<=26;step++)measure(.04+step*.01);
      const savedVersion=scene.player.userData.modelVersion;
      for(let copy=0;copy<8;copy++){
        const model=createPlayerModel(scene.playerMaterial),clones=meshes(model);
        check(clones.length===initialMeshes.length,'Creating another player retains the complete model');
        check(clones.every((mesh,i)=>mesh.geometry===initialMeshes[i].geometry),'Player creation reuses its native shared geometry');
        check(model.userData.jaw!==scene.player.userData.jaw,'Each player owns its independent jaw transform');
      }
      const consumingAngles=[];
      for(let frame=0;frame<=42;frame++){
        state.time=2000+frame*CHOMP_MS/42;
        scene.bites.latest=null;
        scene.render(state,0);
        scene.bites.latest={time:2000};scene.bites.time=state.time;
        scene.bites.update(scene.player);
        consumingAngles.push(scene.player.userData.jaw.rotation.x);
        if(frame%7===0)measure(scene.player.userData.jaw.rotation.x);
      }
      check(Math.max(...consumingAngles)>.299,'Actual consuming animation opens the new jaw fully');
      check(Math.min(...consumingAngles)<.041,'Actual consuming animation can close the new jaw');
      for(let cycle=0;cycle<4;cycle++){
        state.generation++;state.time=1100;scene.reset(state);scene.render(state,0);
        check(scene.player.userData.modelVersion===savedVersion,'Scene restart retains the modeled player');
        check(meshes(scene.player).every((mesh,i)=>mesh.geometry===initialMeshes[i].geometry),'Scene restart retains the shared player geometry');
      }
      check(sharedDisposals===0,'Restart and duplicate creation cannot dispose live shared player geometry');
      const gl=scene.renderer.getContext();check(gl.getError()===gl.NO_ERROR,'Player renders without WebGL errors');
      window.__playerReview={scene,state,THREE,
        pose(yaw,angle=.15,close=true){
          state.time=1100;state.player.dir={x:Math.sin(yaw),y:Math.cos(yaw)};
          scene.playerYaw=yaw;scene.render(state,0);
          scene.player.userData.jaw.rotation.x=angle;
          if(close){
            const origin=scene.player.position,centerY=origin.y+.97;
            const halfHeight=1.9,halfWidth=halfHeight*1280/900;
            scene.camera.left=-halfWidth;scene.camera.right=halfWidth;
            scene.camera.top=halfHeight;scene.camera.bottom=-halfHeight;
            scene.camera.position.set(origin.x,centerY+8,origin.z+8);
            scene.camera.lookAt(origin.x,centerY,origin.z);scene.camera.updateProjectionMatrix();
          }
          scene.renderer.render(scene.scene,scene.camera);
        }
      };
      return {model:savedVersion,checks,vertices,bounds,angles,consumingRange:[Math.min(...consumingAngles),Math.max(...consumingAngles)],sharedGeometries:geometries.size,sharedDisposals,failures};
    });
    for(const [view,yaw,jaw,close] of [['front',0,.15,true],['three-quarter',Math.PI/4,.15,true],['rear',Math.PI,.15,true],['open',Math.PI/4,.30,true],['open-front',0,.30,true],['closed',0,.04,true],['game',0,.15,false]]){
      await page.evaluate(({yaw,jaw,close})=>__playerReview.pose(yaw,jaw,close),{yaw,jaw,close});
      const file=path.resolve(__dirname,`../preview-player-${label}-${view}.png`);
      await page.screenshot({path:file});captures.push(file);
      if(view==='three-quarter'&&label==='after'){
        const detail=path.resolve(__dirname,'../preview-player-detail.png');
        await page.screenshot({path:detail,clip:{x:400,y:230,width:490,height:510}});
        captures.push(detail);
      }
    }
    if(process.argv.includes('--light-check')){
      for(const [name,offset,intensity] of [['quarter',.65,1.1],['eighth',.65,.55],['forward-quarter',1.05,1.1]]){
        await page.evaluate(({offset,intensity})=>{
          __playerReview.pose(0,.15,true);
          const {scene}=__playerReview;
          scene.glow.position.z=scene.player.position.z+offset;scene.glow.intensity=intensity;
          scene.renderer.render(scene.scene,scene.camera);
        },{offset,intensity});
        const file=path.resolve(__dirname,`../preview-player-light-${name}.png`);
        await page.screenshot({path:file});captures.push(file);
      }
    }
    console.log(JSON.stringify({errors,...result,angleSamples:result.angles.length,angles:undefined,captures},null,2));
    assert.deepEqual(errors,[],'The page reports no browser or JavaScript errors');
    assert.deepEqual(result.failures,[],'Player geometry, articulation and shared-resource checks pass');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
