// Compare reflection sampling on the same frozen 4K game image. The low tier
// is forced through the supported texture-size limit; production code stays
// identical, including the reflection geometry, scene, lighting and camera.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const origin=new URL(process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/').origin;

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:3840,height:2160},deviceScaleFactor:1}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/__mirror-detail__',route=>route.fulfill({contentType:'text/html',
      body:'<!doctype html><style>html,body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto(origin+'/__mirror-detail__');
    const fixture=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
      const scene=new DuskScene(document.getElementById('world'));scene.setNeonLook('balanced');
      const renderer=scene.renderer,gl=renderer.getContext(),maximum=renderer.capabilities.maxTextureSize;
      renderer.capabilities.maxTextureSize=2048;
      scene.projection=scene.targetProjection=1;scene.tiltDegrees=scene.targetTiltDegrees=45;
      scene.zoom=scene.targetZoom=1.5;
      const state={generation:1,maze:CONCEPT_MAZE,cols:19,rows:15,time:2400,paused:true,bites:[],predations:[],
        player:{id:1,...PLAYER_SPAWN,x:4,y:1,visual:{x:4,y:1},dir:{x:0,y:1},dead:false,hidden:false,shield:false},
        snakes:CONCEPT_SNAKES.map((snake,i)=>({id:i+1,color:snake.color,body:snake.body.map(p=>({...p})),dir:{x:0,y:1},motion:null,reversing:false}))};
      scene.reset(state);scene.render(state,0);gl.finish();
      const cameraState=()=>JSON.stringify({world:scene.camera.matrixWorld.elements,projection:scene.camera.projectionMatrix.elements,
        inverse:scene.camera.projectionMatrixInverse.elements,perspective:scene.camera.isPerspectiveCamera});
      const worldState=()=>{
        const objects=[];scene.scene.traverse(object=>objects.push({id:object.uuid,matrix:object.matrixWorld.elements.slice(),visible:object.visible,
          material:Array.isArray(object.material)?object.material.map(material=>material.uuid):object.material?.uuid,
          geometry:object.geometry?.uuid,count:object.count}));
        return JSON.stringify({state,objects});
      };
      const initialCamera=cameraState(),initialWorld=worldState();
      const topPlane=scene.wallMirrors.planar.planes.filter(entry=>entry.plane.normal.z>.99)
        .sort((a,b)=>a.plane.constant>b.plane.constant?-1:1)[0];
      if(!topPlane)throw new Error('The top wall is available for the detail crop');
      const z=-topPlane.plane.constant,x=scene.player.position.x,points=[];
      for(const px of [x-4,x+4])for(const py of [.07,1.06]){
        const p=new THREE.Vector3(px,py,z).project(scene.camera);
        points.push({x:(p.x+1)*1920,y:(1-p.y)*1080});
      }
      const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x)))-12),top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y)))-12);
      const right=Math.min(3840,Math.ceil(Math.max(...points.map(p=>p.x)))+12),bottom=Math.min(2160,Math.ceil(Math.max(...points.map(p=>p.y)))+12);
      const crop={x:left,y:top,width:right-left,height:bottom-top};
      const ext=gl.getExtension('WEBGL_debug_renderer_info');
      window.detailCheck={scene,renderer,gl,maximum,cameraState,worldState,initialCamera,initialWorld};
      return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),maximum,
        viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight],projection:1,tilt:45,zoom:1.5,playerCell:[4,1],crop};
    });
    assert.ok(fixture.maximum>=8192,'The comparison requires support for the full 4K atlas tier');
    assert.deepEqual(fixture.viewport,[3840,2160]);
    const rows=[];
    for(const mode of ['before','after']){
      const row=await page.evaluate(async mode=>{
        const {scene,renderer,gl,maximum,cameraState,worldState,initialCamera,initialWorld}=detailCheck;
        renderer.capabilities.maxTextureSize=mode==='before'?2048:maximum;
        const draw=()=>scene.wallMirrors.render(scene.scene,scene.camera),next=()=>new Promise(requestAnimationFrame);
        for(let i=0;i<25;i++){draw();gl.finish();await next();}
        const times=[];
        for(let i=0;i<30;i++){await next();const began=performance.now();draw();gl.finish();times.push(performance.now()-began);}
        const sorted=times.slice().sort((a,b)=>a-b),mirrors=scene.wallMirrors.planar;
        const rectangles=mirrors.selected.map((entry,i)=>{
          const scale=mirrors.uniforms.wallPlanarScales.value[i];
          const width=Math.round(mirrors.tileWidth*scale.x),height=Math.round(mirrors.tileHeight*scale.y);
          return {plane:entry.key,width,height,pixels:width*height};
        });
        return {mode,frames:times.length,warmupFrames:25,completedMs:{p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)},
          tile:[mirrors.tileWidth,mirrors.tileHeight],atlas:[mirrors.target.width,mirrors.target.height],allocatedPixels:mirrors.target.width*mirrors.target.height,
          drawnCapturePixels:rectangles.reduce((sum,r)=>sum+r.pixels,0),rectangles,planes:mirrors.selected.length,
          cameraUnchanged:cameraState()===initialCamera,worldUnchanged:worldState()===initialWorld,webglError:gl.getError(),
          renderCalls:scene.wallMirrors.lastTotalCalls};
      },mode);
      await page.screenshot({path:path.join(root,`preview-mirror-detail-${mode}-4k.png`)});
      await page.screenshot({path:path.join(root,`preview-mirror-detail-${mode}-top-mirror.png`),clip:fixture.crop});
      rows.push(row);console.log(JSON.stringify(row));
    }
    const report={fixture,rows,errors,notes:'CPU plus completed GPU frame time after warmup, frozen production scene; no FPS guarantee. Screenshots compare real floor grout and the top-wall player reflection.'};
    fs.writeFileSync(path.join(root,'preview-mirror-detail.log'),JSON.stringify(report,null,2));
    assert.deepEqual(errors,[]);
    assert.deepEqual(rows[0].tile,[512,96]);assert.deepEqual(rows[1].tile,[2048,384]);
    assert.equal(rows[1].tile[0],rows[0].tile[0]*4);
    assert.equal(rows[0].planes,rows[1].planes);
    for(const row of rows){assert.ok(row.cameraUnchanged&&row.worldUnchanged,`${row.mode}: the scene and camera stay frozen`);assert.equal(row.webglError,0);}
    await page.evaluate(()=>{detailCheck.renderer.capabilities.maxTextureSize=detailCheck.maximum;});
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
