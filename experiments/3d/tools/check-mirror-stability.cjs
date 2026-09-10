// Freeze all geometry, lights and camera while varying the old priority hints.
// Reflections must depend on the scene, never which actor wins a wall slot.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),record=process.argv.includes('--record');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1.5}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__mirror-stability__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas id="world"></canvas>'}));
    await page.goto('http://127.0.0.1:8093/__mirror-stability__');
    const report=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
      const scene=new DuskScene(document.getElementById('world'));scene.setNeonLook('balanced');
      const state={generation:1,maze:CONCEPT_MAZE,cols:19,rows:15,time:2400,paused:true,bites:[],predations:[],
        player:{id:1,...PLAYER_SPAWN,visual:{x:4,y:11},dir:{x:0,y:-1},dead:false,hidden:false,shield:false},
        snakes:CONCEPT_SNAKES.map((s,i)=>({id:i+1,color:s.color,body:s.body.map(p=>({...p})),dir:{x:0,y:1},motion:null,reversing:false}))};
      scene.reset(state);for(let i=0;i<30;i++)scene.render(state,0);
      const gl=scene.renderer.getContext(),rows=[];let first;
      const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
      const target=new THREE.WebGLRenderTarget(w,h),mask=new Uint8Array(w*h*4),originals=[];
      const black=new THREE.MeshBasicMaterial({color:0}),wall=scene.staticGroup.getObjectByName('stone-wall-blocks');
      const faces=new THREE.ShaderMaterial({vertexShader:'attribute float mirrorSide;varying float side;void main(){side=mirrorSide;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:'varying float side;void main(){gl_FragColor=side>.5?vec4(1.,0.,0.,1.):vec4(0.,0.,0.,1.);}',toneMapped:false});
      scene.scene.traverse(o=>{if(o.isMesh){originals.push([o,o.material,o.visible]);if(o.material.transparent&&!o.material.depthWrite)o.visible=false;o.material=o===wall?faces:black;}});
      const shadowEnabled=scene.renderer.shadowMap.enabled;
      try{scene.renderer.shadowMap.enabled=false;scene.renderer.setRenderTarget(target);scene.renderer.render(scene.scene,scene.camera);scene.renderer.readRenderTargetPixels(target,0,0,w,h,mask);}
      finally{scene.renderer.setRenderTarget(null);scene.renderer.shadowMap.enabled=shadowEnabled;for(const [o,m,v] of originals){o.material=m;o.visible=v;}target.dispose();black.dispose();faces.dispose();}
      // Erode two pixels to exclude antialiasing at silhouettes and stone seams.
      const interior=new Uint8Array(w*h);let wallPixels=0;
      for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
        const i=y*w+x;if([-2,0,2].every(dy=>[-2,0,2].every(dx=>mask[(i+dy*w+dx)*4]>240))){interior[i]=1;wallPixels++;}
      }
      // The diagnostic mask temporarily changed every material and the shadow
      // configuration. Restore/warm normal programs before measuring frames.
      for(let i=0;i<3;i++)scene.wallMirrors.render(scene.scene,scene.camera,[]);
      const hints=[[],[{x:-10,z:8}],[{x:8,z:-6}],[{x:-14,z:-9}],[],[{x:0,z:14}]];
      for(const hint of hints){
        scene.wallMirrors.render(scene.scene,scene.camera,hint.map(p=>({position:new THREE.Vector3(p.x,.4,p.z),player:true})));gl.finish();
        const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let changed=0,maximum=0,total=0;if(first)for(let i=0;i<pixels.length;i+=4){if(!interior[i/4])continue;const d=Math.max(...[0,1,2].map(c=>Math.abs(first[i+c]-pixels[i+c])));if(d>3)changed++;maximum=Math.max(maximum,d);total+=d;}
        else first=pixels;
        rows.push({hint,planes:scene.wallMirrors.planar.selected.map(p=>p.key),changed,maximum,mean:total/wallPixels});
      }
      return {rows,wallPixels,diagnostics:scene.diagnostics()};
    });
    await page.screenshot({path:path.join(root,`preview-mirror-stability-${record?'before':'after'}.png`)});
    fs.writeFileSync(path.join(root,`preview-mirror-stability-${record?'before':'after'}.log`),JSON.stringify({...report,errors},null,2));
    console.log(JSON.stringify({...report,errors}));assert.deepEqual(errors,[]);
    assert.ok(report.wallPixels>10000,'Comparison covers substantial visible wall surfaces');
    if(!record)for(const row of report.rows){assert.equal(row.changed,0,'A frozen scene cannot change wall pixels when actor priority hints change');assert.deepEqual(row.planes,report.rows[0].planes);}
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
