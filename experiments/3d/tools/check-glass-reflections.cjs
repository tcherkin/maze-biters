// GPU comparison against the published .31 renderer, with a moving player,
// all four glass colors, mirror-side pixels and bounded capture resources.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'../..');
const base='abb66a54bb73d9f45d24a2619901c8856de13f06';
const files=['wall-mirrors.mjs','player-glass.mjs','renderer.mjs','snake-light.mjs'];
const before=new Map(files.map(name=>['/experiments/3d/'+name,execFileSync('git',['show',base+':experiments/3d/'+name],{cwd:workspace})]));
const sizes=process.argv.includes('--4k')?[1920,3840]:[1920];
const modes=process.argv.includes('--before-only')?['before']:process.argv.includes('--after-only')?['after']:['before','after'];
const dprIndex=process.argv.indexOf('--dpr'),dpr=dprIndex<0?1:Number(process.argv[dprIndex+1]);
assert.ok(dpr>0&&dpr<=3);
const suffix=dpr===1?'':`-dpr-${dpr}`;
const output=[];
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{for(const width of sizes)for(const mode of modes){
    const page=await browser.newPage({viewport:{width,height:width*9/16},deviceScaleFactor:dpr}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    if(mode==='before')await page.route(url=>before.has(url.pathname),r=>r.fulfill({contentType:'text/javascript',body:before.get(new URL(r.request().url()).pathname)}));
    await page.route('**/__glass-reflections__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas id="world"></canvas>'}));
    await page.goto('http://127.0.0.1:8093/__glass-reflections__');
    const report=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
      const scene=new DuskScene(document.getElementById('world')),gl=scene.renderer.getContext();
      scene.setNeonLook('balanced');
      const state={generation:1,maze:CONCEPT_MAZE,cols:19,rows:15,time:2400,paused:false,bites:[],predations:[],
        player:{id:1,...PLAYER_SPAWN,visual:{x:4,y:11},dead:false,hidden:false,shield:false},
        snakes:CONCEPT_SNAKES.map((s,i)=>({id:i+1,color:s.color,body:s.body.map(p=>({...p})),dir:{x:0,y:1},motion:null,reversing:false}))};
      scene.reset(state);const next=()=>new Promise(requestAnimationFrame);
      const pose=i=>{state.time=2400+i*1000/60;state.player.visual.x=3+Math.sin(i/100)*1.25;state.player.visual.y=11.25;
        state.player.dir={x:Math.cos(i/100)>=0?1:-1,y:0};};
      const stats=values=>{const a=values.slice().sort((a,b)=>a-b);return {p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
      for(let i=0;i<90;i++){pose(i);scene.render(state,1/60);gl.finish();await next();}
      const times=[],intervals=[];let last=0;
      for(let i=0;i<180;i++){const now=await next();if(last)intervals.push(now-last);last=now;pose(i);const began=performance.now();scene.render(state,1/60);gl.finish();times.push(performance.now()-began);}
      const countDraws=()=>{let draws=0;const originals=['drawElements','drawElementsInstanced','drawArrays','drawArraysInstanced'].map(key=>[key,gl[key]]);
        for(const [key,fn] of originals)gl[key]=function(...args){draws++;return fn.apply(this,args);};
        try{scene.render(state,0);gl.finish();}finally{for(const [key,fn] of originals)gl[key]=fn;}return draws;};
      const ext=gl.getExtension('WEBGL_debug_renderer_info');
      const report={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,completedMs:stats(times),frameIntervalMs:stats(intervals),draws:countDraws(),diagnostics:scene.diagnostics()};
      window.review={scene,state,THREE,gl,countDraws};return report;
    });
    await page.screenshot({path:path.join(root,`preview-reflections-${mode}-${width}-moving${suffix}.png`)});
    report.mirrors=await page.evaluate(()=>{
      const {scene,state,THREE,gl}=review;
      state.maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14||(y===7&&x>=2&&x<=16)?'#':'.').join(''));
      state.player.visual={x:4,y:8};state.player.dir={x:0,y:1};state.player.x=4;state.player.y=8;
      state.snakes=['#cf3430','#e4a71a','#079ed1','#c92099'].map((color,i)=>({id:i+1,color,body:[{x:7+i*2.5,y:8},{x:7+i*2.5,y:9}],dir:{x:0,y:-1},motion:null,reversing:false}));
      state.generation++;scene.zoom=scene.targetZoom=1.5;scene.reset(state);
      for(let i=0;i<45;i++)scene.render(state,1/60);gl.finish();
      const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,colors=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,colors);
      const group=scene.staticGroup,wall=group.getObjectByName('stone-wall-blocks'),old=wall.material;
      const maskMaterial=new THREE.ShaderMaterial({vertexShader:'attribute float mirrorSide;varying float side;void main(){side=mirrorSide;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying float side;void main(){gl_FragColor=side>.5?vec4(1.,0.,0.,1.):vec4(0.,0.,0.,1.);}',toneMapped:false});
      const target=new THREE.WebGLRenderTarget(w,h),mask=new Uint8Array(w*h*4),black=new THREE.MeshBasicMaterial({color:0});
      const originals=[];scene.scene.traverse(o=>{if(o.isMesh){originals.push([o,o.material,o.visible]);o.material=o===wall?maskMaterial:black;if(o.material!==maskMaterial&&originals.at(-1)[1].transparent)o.visible=false;}});
      try{scene.renderer.setRenderTarget(target);scene.renderer.render(scene.scene,scene.camera);scene.renderer.readRenderTargetPixels(target,0,0,w,h,mask);}
      finally{scene.renderer.setRenderTarget(null);for(const [o,m,v] of originals){o.material=m;o.visible=v;}target.dispose();black.dispose();maskMaterial.dispose();}
      let count=0,sum=0,bright=0;for(let i=0;i<mask.length;i+=4)if(mask[i]>245&&mask[i+1]<10&&mask[i+2]<10){const l=.2126*colors[i]+.7152*colors[i+1]+.0722*colors[i+2];count++;sum+=l;if(l>55)bright++;}
      scene.render(state,0);gl.finish();return {sidePixels:count,meanLuminance:sum/count,brightPixels:bright};
    });
    await page.screenshot({path:path.join(root,`preview-reflections-${mode}-${width}-wall${suffix}.png`)});
    if(mode==='after')report.planar=await page.evaluate(()=>{
      const {scene,state,THREE,gl}=review,check=(yes,message)=>{if(!yes)throw new Error(message);};
      state.player=null;state.snakes=[];scene.reset(state);scene.render(state,0);
      const materials=[0x101010,0x101010,0x101010,0x101010,0x00ff00,0xff0000].map(color=>new THREE.MeshBasicMaterial({color,toneMapped:false}));
      const marker=new THREE.Mesh(new THREE.BoxGeometry(.9,.7,.45),materials);marker.position.set(-1,.42,1.05);scene.scene.add(marker);
      const pixels=()=>{scene.wallMirrors.render(scene.scene,scene.camera,[{position:marker.position,player:true}]);gl.finish();
        check(gl.getError()===gl.NO_ERROR,'Planar render is WebGL-safe');
        const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
      const rows=[],frustum={left:scene.camera.left,right:scene.camera.right,top:scene.camera.top,bottom:scene.camera.bottom};
      for(const [pan,zoom,tilt] of [[0,1,45],[1.8,1.2,35],[-1.5,.9,55]]){
        const angle=tilt*Math.PI/180;scene.camera.position.set(pan,50*Math.cos(angle),50*Math.sin(angle));scene.camera.lookAt(pan,0,0);
        for(const key of ['left','right','top','bottom'])scene.camera[key]=frustum[key]/zoom;
        scene.camera.updateProjectionMatrix();scene.camera.updateMatrixWorld();
        for(const x of [-1,1]){marker.position.x=x;const p=pixels();let red=0,green=0,sumX=0,greenSumX=0,redMin=Infinity,redMax=-Infinity;
        for(let i=0;i<p.length;i+=4){if(p[i]>110&&p[i]>p[i+1]*2&&p[i]>p[i+2]*2){const px=(i/4)%gl.drawingBufferWidth;red++;sumX+=px;redMin=Math.min(redMin,px);redMax=Math.max(redMax,px);}
          if(p[i+1]>110&&p[i+1]>p[i]*2&&p[i+1]>p[i+2]*2){green++;greenSumX+=(i/4)%gl.drawingBufferWidth;}}
        check(red>30&&green>30,'Mirror sees the red back while the screen sees the green front');
        const reflectionX=sumX/red,directX=greenSumX/green;
        // Stone seams/bevels mask unequal parts of the reflected rectangle:
        // its color centroid need not equal the unobstructed front centroid.
        // Check its absolute projected footprint, allowing two atlas texels
        // for sampling plus one screen pixel for rasterization.
        const ends=[-.45,.45].map(dx=>new THREE.Vector3(x+dx,.42,1.05));
        const expected=ends.map(v=>(v.clone().project(scene.camera).x*.5+.5)*gl.drawingBufferWidth).sort((a,b)=>a-b);
        const planar=scene.wallMirrors.planar;
        const slot=planar.selected.findIndex(entry=>Math.abs(entry.plane.distanceToPoint(marker.position))<1);
        check(slot>=0,'The physical marker wall has a planar capture');
        const matrix=planar.uniforms.wallPlanarMatrices.value[slot];
        const atlas=ends.map(v=>v.clone().applyMatrix4(matrix).x*.5*planar.tileWidth*planar.uniforms.wallPlanarScales.value[slot].x);
        const expectedWidth=expected[1]-expected[0],tolerance=2*expectedWidth/Math.abs(atlas[1]-atlas[0])+1;
        check(redMin>=expected[0]-tolerance&&redMax<=expected[1]+tolerance&&redMax-redMin>expectedWidth*.65,
          'Reflected geometry occupies its projected horizontal footprint at every display scale: '+JSON.stringify({redMin,redMax,expected,tolerance}));
        rows.push({pan,zoom,tilt,x,red,green,reflectionX,directX,redMin,redMax,expected,tolerance});}
        check(rows.at(-1).reflectionX>rows.at(-2).reflectionX+20,'Actual reflected geometry follows sideways movement');
      }
      const identity=[];scene.scene.traverse(o=>{if(o.material)identity.push([o,o.material,o.visible]);});
      const original=scene.renderer.render,clips=scene.renderer.clippingPlanes,auto=scene.renderer.shadowMap.autoUpdate;
      let threw=false;scene.renderer.render=function(s,c){if(c===scene.wallMirrors.planar.cameras[0])throw new Error('test capture interruption');return original.call(this,s,c);};
      try{pixels();}catch(e){threw=e.message==='test capture interruption';}finally{scene.renderer.render=original;}
      check(threw,'Interrupted planar capture was exercised');
      check(identity.every(([o,m,v])=>o.material===m&&o.visible===v),'Capture errors restore every original actor and wall material');
      check(scene.renderer.getRenderTarget()===null&&scene.renderer.clippingPlanes===clips&&scene.renderer.shadowMap.autoUpdate===auto,'Capture errors restore render target, clipping and shadows');
      pixels();marker.removeFromParent();marker.geometry.dispose();materials.forEach(m=>m.dispose());
      return {rows,restoration:true,maxViews:scene.wallMirrors.planar.cameras.length};
    });
    assert.deepEqual(errors,[]);output.push({mode,width,dpr,...report,errors});await page.close();
  }}finally{await browser.close();}
  fs.writeFileSync(path.join(root,`preview-reflections-report${suffix}.log`),JSON.stringify(output,null,2));console.log(JSON.stringify(output));
})().catch(e=>{console.error(e);process.exitCode=1;});
