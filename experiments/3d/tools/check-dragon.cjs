const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),quick=process.argv.includes('--quick'),material=process.argv.includes('--material');
const widths=process.argv.includes('--4k')?[3840]:quick?[1920]:[1920,3840];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});const errors=[],results=[];
 try{for(const width of widths){
  console.error(`[dragon] ${width}`);const page=await browser.newPage({viewport:{width,height:width*9/16},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer','globalThis.__dragonScene=this;globalThis.__dragonTHREE=THREE;this.renderer=new THREE.WebGLRenderer')}));
  await page.goto('http://127.0.0.1:8093/experiments/3d/?v=0.3.54&look=balanced&player=dragon');
  await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:90000});
  await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
  await page.evaluate(async()=>{
   MazeBiters3DEngine.pause();const s=__dragonScene,T=__dragonTHREE;
   const {CONCEPT_MAZE,CONCEPT_SNAKES}=await import('/experiments/3d/maze-layout.mjs');
   globalThis.__dragonRender=s.render.bind(s);s.render=()=>{};
   globalThis.__dragonState={generation:991,started:true,paused:true,speed:.5,time:1000,maze:CONCEPT_MAZE,cols:19,rows:15,
    player:{id:1,x:4,y:9,visual:{x:4,y:9},dir:{x:1,y:0},dead:false,hidden:false,shield:false,powered:false},
    snakes:CONCEPT_SNAKES.map((o,i)=>({...o,id:i+1,dir:{x:o.body[0].x-o.body[1].x,y:o.body[0].y-o.body[1].y},motion:null,reversing:false})),bites:[],predations:[]};
   s.reset(__dragonState);s.resetView();s.playerYaw=Math.PI/2;s.snakeLight.reset();
   for(let i=0;i<3;i++)__dragonRender(__dragonState,1/60,1/60);
   globalThis.__dragonPose=(pose='quarter')=>{
    s.camera.up.set(0,0,-1);s.playerYaw=Math.PI/2;s.resetCamera=true;s.zoom=s.targetZoom=1.5;
    for(let i=0;i<2;i++)__dragonRender(__dragonState,1/60,1/60);
    s.player.userData.jaw.rotation.x=pose==='bite'?.30:.08;s.player.userData.applyPose();s.player.updateMatrixWorld(true);
    if(pose!=='game'){
     const centre=s.player.position.clone().add(new T.Vector3(-1.12,.90,0));
     const vectors={quarter:[1.05,.66,-.8],front:[1,.54,0],profile:[0,.75,-1],rear:[-1,.70,0],bite:[1.05,.55,-.8],top:[0,1,0]};
     const direction=new T.Vector3(...vectors[pose]).normalize(),camera=s.camera;
     camera.left=-3.6;camera.right=3.6;camera.top=2.025;camera.bottom=-2.025;camera.zoom=1;camera.setProjection(pose==='top'?0:.5);
     camera.up.set(0,pose==='top'?0:1,pose==='top'?1:0);
     camera.position.copy(centre).addScaledVector(direction,camera.focusDistance);camera.lookAt(centre);camera.updateMatrixWorld();
    }
    s.wallMirrors.render(s.scene,s.camera);s.renderer.getContext().finish();
   };
   const vertices=[];
   for(let x=0;x<=18;x++){vertices.push(s.layout.x(x-.5),.04,s.layout.z(6.5),s.layout.x(x-.5),.04,s.layout.z(11.5));}
   for(let z=7;z<=12;z++){vertices.push(s.layout.x(.5),.04,s.layout.z(z-.5),s.layout.x(17.5),.04,s.layout.z(z-.5));}
   const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
   globalThis.__dragonGrid=new T.LineSegments(geom,new T.LineBasicMaterial({color:0x8ae9cb,transparent:true,opacity:.55,depthWrite:false}));
   __dragonGrid.visible=false;s.scene.add(__dragonGrid);
  });
  const meta=await page.evaluate(()=>{
   const s=__dragonScene,T=__dragonTHREE;let meshes=0,triangles=0;const materials=new Set();
   s.player.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;materials.add(o.material);}});
   s.player.updateMatrixWorld(true);s.player.userData.dragonRig.skeleton.update();
   const inverse=s.player.matrixWorld.clone().invert(),box=new T.Box3(),v=new T.Vector3();
   s.player.traverse(mesh=>{if(!mesh.isMesh)return;const a=mesh.geometry.attributes.position;
    for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);box.expandByPoint(v);}
   });const size=box.getSize(new T.Vector3()).multiplyScalar(s.player.scale.x);
   return{app:__mazeBiters3D.diagnostics(),geometry:{meshes,triangles,materials:materials.size,length:size.z,width:size.x,height:size.y},rig:s.player.userData.dragonRig?.restZ};
  });assert.equal(meta.app.renderer.playerModel,'crystal-dragon-v5');assert.equal(meta.app.version,'0.3.54');
  assert.ok(Math.abs(meta.geometry.length-4)<1e-5);assert.ok(meta.geometry.width<2);
  for(const pose of ['quarter','top','front','profile','rear','bite','game']){
   await page.evaluate(p=>__dragonPose(p),pose);
   const prefix=`preview-dragon-v54-${width}-${pose}`;
   await page.screenshot({path:path.join(root,prefix+'.png')});
   await page.evaluate(()=>{__dragonScene.player.traverse(o=>{if(o.userData.insetCore)o.visible=false;});__dragonScene.wallMirrors.render(__dragonScene.scene,__dragonScene.camera);});
   await page.screenshot({path:path.join(root,prefix+'-cores-off.png')});
   await page.evaluate(()=>{__dragonScene.player.traverse(o=>{if(o.userData.insetCore)o.visible=true;});__dragonScene.wallMirrors.render(__dragonScene.scene,__dragonScene.camera);});
   if(pose==='top'){
    await page.evaluate(geometry=>{__dragonGrid.visible=true;__dragonScene.wallMirrors.render(__dragonScene.scene,__dragonScene.camera);
     const label=document.createElement('div');label.id='dragon-grid-measure';label.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);padding:14px 22px;background:#081b22e8;color:#c1ffdf;border:1px solid #77bfa7;border-radius:12px;font:20px system-ui;z-index:99999;white-space:pre;text-align:center';
     label.textContent=`Логическа клетка = 2 единици\nПрава дължина: ${geometry.length.toFixed(3)} = 2 клетки · ширина: ${geometry.width.toFixed(3)} < 1 клетка`;
     (document.fullscreenElement||document.body).append(label);
    },meta.geometry);
    await page.screenshot({path:path.join(root,`preview-dragon-v54-${width}-top-grid.png`)});
    await page.evaluate(()=>{__dragonGrid.visible=false;document.getElementById('dragon-grid-measure').remove();});
   }
  }
  let bench=null;
  if(!material)bench=await page.evaluate(()=>{
   const s=__dragonScene,state=__dragonState,p=state.player;state.paused=false;s.camera.up.set(0,0,-1);const gl=s.renderer.getContext(),rows=[];
   for(const zoom of [1,1.5,2]){
    s.zoom=s.targetZoom=zoom;s.resetCamera=true;const values=[];let before;
    for(let i=0;i<210;i++){
     state.time+=1000/120;p.visual.x=4+Math.sin(i/40)*1.5;p.visual.y=9;p.dir={x:Math.cos(i/40)>=0?1:-1,y:0};
     const start=performance.now();__dragonRender(state,1/120,1/120);gl.finish();
     if(i===89)before={...s.renderer.info.memory};if(i>=90)values.push(performance.now()-start);
    }
    values.sort((a,b)=>a-b);rows.push({zoom,samples:values.length,p50:values[60],p95:values[114],p99:values[118],max:values.at(-1),before,after:{...s.renderer.info.memory},drawCalls:s.diagnostics().drawCalls,triangles:s.diagnostics().triangles});
   }return rows;
  });
  if(bench)for(const r of bench)assert.deepEqual(r.before,r.after);results.push({width,meta,bench});await page.close();
 }assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
