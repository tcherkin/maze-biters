const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const version=(process.argv.find(a=>a.startsWith('--version='))||'--version=0.3.51').split('=')[1];
const baselineOnly=process.argv.includes('--baseline-only'),currentOnly=process.argv.includes('--current-only'),width=process.argv.includes('--4k')?3840:1920;
assert.ok(!(baselineOnly&&currentOnly),'Choose one isolated variant at a time');
const variants=baselineOnly?['dragon-v2']:currentOnly?['dragon']:['dragon-v2','dragon'];

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
 const errors=[],results=[];
 try{for(const variant of variants){
  console.error(`[paw visibility] ${variant} ${width}`);
  const page=await browser.newPage({viewport:{width,height:width*9/16},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8')
   .replace('this.renderer=new THREE.WebGLRenderer','globalThis.__pawScene=this;globalThis.__pawTHREE=THREE;this.renderer=new THREE.WebGLRenderer')}));
  await page.goto(`http://127.0.0.1:8093/experiments/3d/?v=${version}&look=balanced&player=${variant}`);
  await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:90000});
  await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
  const runtime=await page.evaluate(async()=>{
   MazeBiters3DEngine.pause();const s=__pawScene,T=__pawTHREE;
   const {CONCEPT_MAZE}=await import('/experiments/3d/maze-layout.mjs');
   const render=s.render.bind(s);s.render=()=>{};
   const state={generation:781,started:true,paused:false,speed:.5,time:1000,maze:CONCEPT_MAZE,cols:19,rows:15,
    player:{id:1,x:1.5,y:13,visual:{x:1.5,y:13},dir:{x:1,y:0},dead:false,hidden:false,shield:false,powered:false},snakes:[],bites:[],predations:[]};
   const rig=s.player.userData.paddleRig,gait=s.player.userData.dragonPaddling;
   const joints=rig.paws.map(p=>p.joints?.map(j=>j.object)||[p.pivot]);
   const markers=rig.paws.map(p=>{
    if(p.tip)return {object:p.tip,point:new T.Vector3(),kind:'authored toe tip'};
    let mesh;p.pivot.traverse(o=>{if(o.isMesh&&/toes/i.test(o.name))mesh=o;});
    if(!mesh)throw new Error('Paw has no authored tip or actual toe mesh');
    mesh.geometry.computeBoundingBox();return {object:mesh,point:mesh.geometry.boundingBox.getCenter(new T.Vector3()),kind:'toe mesh centre'};
   });
   const runs=[];
   for(const speedLabel of [.5,1,1.5,2]){
    const speed=2000/95*.5*speedLabel;state.generation++;state.time=1000;state.player.x=1.5;state.player.visual.x=1.5;
    s.reset(state);s.resetView();s.playerYaw=Math.PI/2;
    const frames=[];
    for(let i=0;i<84;i++){
     state.time+=1000/60;state.player.visual.x=1.5+speed*i/120;state.player.x=Math.round(state.player.visual.x);
     render(state,1/60,1/60);
     frames.push({frame:i,diagnostics:gait.diagnostics(),joints:joints.map(list=>list.map(j=>j.quaternion.toArray()))});
    }
    runs.push({speedLabel,worldSpeed:speed,frames});
   }
   // Every pose comes from the production update chain above, not an invented
   // display-only gait. Only camera/root placement is fixed for the visibility
   // measurement, removing travel and camera following from toe displacement.
   globalThis.__pawAudit={s,T,state,render,rig,gait,joints,markers,runs};
   return {app:__mazeBiters3D.diagnostics(),runs,markerKinds:markers.map(m=>m.kind),jointCounts:joints.map(j=>j.length),
    linkedJoints:rig.paws.map(p=>Boolean(p.elbow?.parent===p.pivot&&p.wrist?.parent===p.elbow&&p.tip?.parent===p.wrist))};
  });
  assert.equal(runtime.app.version,version);assert.equal(runtime.app.renderer.playerModel,variant==='dragon-v2'?'crystal-dragon-v2':'crystal-dragon-v3');
  if(variant==='dragon'){
   assert.deepEqual(runtime.jointCounts,[3,3,3,3],'Each actual rendered paw must retain its three joint chain');
   assert.ok(runtime.linkedJoints.every(Boolean),'The shoulder, elbow, wrist and toe target must remain linked in the displayed model');
  }
  for(const run of runtime.runs){
   assert.ok(run.frames.at(-1).diagnostics.activity>.95,'Production render did not engage the paws');
   assert.ok(run.frames.at(-1).diagnostics.cycles>.9,'Production render did not advance the paw cycle');
   assert.notDeepEqual(run.frames[25].joints,run.frames[55].joints,'Live paw transforms remain static');
   if(variant==='dragon')for(let paw=0;paw<4;paw++)for(let joint=0;joint<3;joint++){
    assert.notDeepEqual(run.frames[25].joints[paw][joint],run.frames[55].joints[paw][joint],
     `Production ${run.speedLabel}× renderer left paw ${paw}, joint ${joint} static`);
   }
  }
  const visibility=await page.evaluate(()=>{
   const {s,T,state,render,rig,joints,markers,runs}=__pawAudit,player=s.player;
   state.paused=true;state.player.x=4;state.player.y=9;state.player.visual={x:4,y:9};state.player.dir={x:1,y:0};state.generation++;
   s.reset(state);s.resetView();s.playerYaw=Math.PI/2;for(let i=0;i<3;i++)render(state,1/60,1/60);
   const originalCamera={position:s.camera.position.clone(),quaternion:s.camera.quaternion.clone(),up:s.camera.up.clone(),projection:s.projection};
   const bufferSize=s.renderer.getDrawingBufferSize(new T.Vector2()),w=bufferSize.x,h=bufferSize.y;
   const target=new T.WebGLRenderTarget(w,h,{depthBuffer:true,stencilBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter});
   const bytes=new Uint8Array(w*h*4),black=new T.MeshBasicMaterial({color:0x000000,side:T.DoubleSide,toneMapped:false});
   const colors=[0xff0000,0x00ff00,0x0000ff,0xffff00],ids=colors.map(color=>new T.MeshBasicMaterial({color,side:T.DoubleSide,toneMapped:false}));
   const objects=[],owners=new Map();rig.paws.forEach((paw,index)=>paw.pivot.traverse(o=>{if(o.isMesh&&!o.userData.insetCore)owners.set(o,index);}));
   player.traverse(o=>{if(o.isMesh)objects.push({object:o,material:o.material,visible:o.visible});});
   const diagnosticScene=new T.Scene(),originalParent=player.parent,oldClear=s.renderer.getClearColor(new T.Color()),oldAlpha=s.renderer.getClearAlpha();
   const point=new T.Vector3(),shoulder=new T.Vector3();
   function pixelSummary(){
    const result=ids.map(()=>({pixels:0,minX:w,maxX:-1,minY:h,maxY:-1}));
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const i=(y*w+x)*4,r=bytes[i]>200,g=bytes[i+1]>200,b=bytes[i+2]>200;
     const id=r&&g&&!b?3:r&&!g&&!b?0:!r&&g&&!b?1:!r&&!g&&b?2:-1;if(id<0)continue;
     const p=result[id];p.pixels++;p.minX=Math.min(p.minX,x);p.maxX=Math.max(p.maxX,x);p.minY=Math.min(p.minY,y);p.maxY=Math.max(p.maxY,y);
    }return result;
   }
   function mask(isolated){
    for(const entry of objects){const owner=owners.get(entry.object);entry.object.material=owner===undefined?black:ids[owner];
     entry.object.visible=entry.visible&&!entry.object.userData.insetCore&&(!isolated||owner!==undefined);}
    originalParent.remove(player);diagnosticScene.add(player);s.renderer.setRenderTarget(target);s.renderer.setClearColor(0,1);
    s.renderer.clear();s.renderer.render(diagnosticScene,s.camera);s.renderer.readRenderTargetPixels(target,0,0,w,h,bytes);
    diagnosticScene.remove(player);originalParent.add(player);s.renderer.setRenderTarget(null);s.renderer.setClearColor(oldClear,oldAlpha);
    for(const entry of objects){entry.object.material=entry.material;entry.object.visible=entry.visible;}
    return pixelSummary();
   }
   const rows=[];
   try{
    for(const direction of ['south','north','east','west','top'])for(const speedLabel of [.5,2]){
     const yaw={south:0,north:Math.PI,east:Math.PI/2,west:-Math.PI/2,top:Math.PI/2}[direction];player.rotation.y=yaw;
     // Native straight posture removes the unrelated path-bending variable.
     player.userData.dragonRig.bones.forEach((bone,index)=>{bone.position.set(0,0,player.userData.dragonRig.restZ[index]);bone.quaternion.identity();});
     s.camera.position.copy(originalCamera.position);s.camera.quaternion.copy(originalCamera.quaternion);s.camera.up.copy(originalCamera.up);s.camera.setProjection(.5);
     if(direction==='top'){
      const centre=player.position.clone().add(new T.Vector3(-1,.8,0));s.camera.up.set(0,0,-1);
      s.camera.position.copy(centre).add(new T.Vector3(0,s.camera.focusDistance,0));s.camera.lookAt(centre);s.camera.setProjection(0);
     }
     s.camera.updateMatrixWorld(true);const run=runs.find(r=>r.speedLabel===speedLabel),samples=[];
     for(let frame=18;frame<84;frame+=6){
      const saved=run.frames[frame];joints.forEach((list,p)=>list.forEach((joint,j)=>joint.quaternion.fromArray(saved.joints[p][j])));
      player.updateMatrixWorld(true);player.userData.dragonRig.skeleton.update();
      const tips=markers.map((marker,index)=>{
       point.copy(marker.point);marker.object.localToWorld(point);point.project(s.camera);rig.paws[index].pivot.getWorldPosition(shoulder).project(s.camera);
       return {x:(point.x-shoulder.x)*w/2,y:-(point.y-shoulder.y)*h/2};
      });
      const visible=mask(false),withoutBody=mask(true);
      samples.push({frame,phase:saved.diagnostics.phase,tips,paws:visible.map((v,i)=>({...v,withoutBodyPixels:withoutBody[i].pixels,
       selfVisibleFraction:withoutBody[i].pixels?v.pixels/withoutBody[i].pixels:0}))});
     }
     const paws=rig.paws.map((paw,index)=>{
      const points=samples.map(v=>v.tips[index]),x=points.map(p=>p.x),y=points.map(p=>p.y),v=samples.map(s=>s.paws[index]);
      let extent=0;for(const a of points)for(const b of points)extent=Math.max(extent,Math.hypot(a.x-b.x,a.y-b.y));
      return {side:paw.side,front:paw.front,toeExtentPixels:extent,toeXRange:Math.max(...x)-Math.min(...x),toeYRange:Math.max(...y)-Math.min(...y),
       minVisiblePixels:Math.min(...v.map(p=>p.pixels)),maxVisiblePixels:Math.max(...v.map(p=>p.pixels)),
       meanVisiblePixels:v.reduce((n,p)=>n+p.pixels,0)/v.length,meanSelfVisibleFraction:v.reduce((n,p)=>n+p.selfVisibleFraction,0)/v.length};
     });rows.push({direction,speedLabel,paws,samples});
    }
   }finally{
    for(const entry of objects){entry.object.material=entry.material;entry.object.visible=entry.visible;}
    if(player.parent!==originalParent){player.parent.remove(player);originalParent.add(player);}
    s.renderer.setRenderTarget(null);s.renderer.setClearColor(oldClear,oldAlpha);target.dispose();black.dispose();ids.forEach(m=>m.dispose());
   }
   globalThis.__pawShow=(direction,frame,speedLabel=.5)=>{
    const yaw={south:0,north:Math.PI,east:Math.PI/2,west:-Math.PI/2}[direction];
    const x=direction==='west'?14:4,y=direction==='north'?11:13;
    state.player.x=x;state.player.y=y;state.player.visual={x,y};state.player.dir={x:Math.round(Math.sin(yaw)),y:Math.round(Math.cos(yaw))};
    state.generation++;state.paused=true;s.reset(state);s.resetView();s.playerYaw=yaw;
    for(let i=0;i<3;i++)render(state,1/60,1/60);
    const saved=runs.find(r=>r.speedLabel===speedLabel).frames[frame];
    joints.forEach((list,p)=>list.forEach((joint,j)=>joint.quaternion.fromArray(saved.joints[p][j])));
    player.userData.jaw.rotation.x=.08;player.userData.applyPose();player.updateMatrixWorld(true);player.userData.dragonRig.skeleton.update();
    s.wallMirrors.render(s.scene,s.camera);s.renderer.getContext().finish();
    const rect=s.renderer.domElement.getBoundingClientRect();let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    player.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;
     for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,point);point.applyMatrix4(mesh.matrixWorld).project(s.camera);
      const px=rect.x+(point.x+1)*rect.width/2,py=rect.y+(1-point.y)*rect.height/2;
      minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
     }});
    return {phase:saved.diagnostics.phase,box:{minX,maxX,minY,maxY}};
   };
   return {width:w,height:h,camera:{tilt:55,zoom:1.5,projection:.5},rows,
    interpretation:'Toe excursion is relative to its shoulder, from poses recorded through the production renderer. Pixel masks count direct geometric self-visibility using opaque depth and actual rendered meshes; they exclude glass transmission, lighting, glow, environment occlusion and mirrors, so they measure silhouette visibility rather than perceived brightness.'};
  });
  const result={variant,width,runtime,visibility};results.push(result);
  fs.writeFileSync(path.join(root,`preview-dragon-paw-visibility-${variant}-${width}.json`),JSON.stringify(result,null,2));
  for(const direction of ['south','north','east','west']){
   const row=visibility.rows.find(r=>r.direction===direction&&r.speedLabel===.5);let best=null;
   for(const a of row.samples)for(const b of row.samples){
    const extent=Math.hypot(a.tips[0].x-b.tips[0].x,a.tips[0].y-b.tips[0].y);
    if(!best||extent>best.extent)best={extent,a:a.frame,b:b.frame};
   }
   const a=await page.evaluate(({direction,frame})=>__pawShow(direction,frame),{direction,frame:best.a});
   const b=await page.evaluate(({direction,frame})=>__pawShow(direction,frame),{direction,frame:best.b});
   const x=Math.max(0,Math.floor(Math.min(a.box.minX,b.box.minX)-20)),y=Math.max(0,Math.floor(Math.min(a.box.minY,b.box.minY)-20));
   const clip={x,y,width:Math.min(width-x,Math.ceil(Math.max(a.box.maxX,b.box.maxX)+20)-x),
    height:Math.min(width*9/16-y,Math.ceil(Math.max(a.box.maxY,b.box.maxY)+20)-y)};
   for(const [phase,frame]of [['a',best.a],['b',best.b]]){
    await page.evaluate(({direction,frame})=>__pawShow(direction,frame),{direction,frame});
    const prefix=`preview-dragon-paw-${variant}-${width}-${direction}-${phase}`;
    await page.screenshot({path:path.join(root,prefix+'.png')});
    await page.screenshot({path:path.join(root,prefix+'-detail.png'),clip});
   }
  }
  await page.close();
 }
 const reviewVariants=currentOnly&&fs.existsSync(path.join(root,`preview-dragon-paw-dragon-v2-${width}-south-a-detail.png`))?['dragon-v2','dragon']:variants;
 const cards=reviewVariants.flatMap(variant=>['south','north','east','west'].map(direction=>`<section><h2>${variant} · ${direction}</h2><div>${['a','b'].map(phase=>`<figure><img src="preview-dragon-paw-${variant}-${width}-${direction}-${phase}-detail.png"><figcaption>Фаза ${phase.toUpperCase()}</figcaption></figure>`).join('')}</div></section>`)).join('');
 const html=`<!doctype html><html lang="bg"><meta charset="utf-8"><title>Dragon paw cycle audit</title><style>body{margin:0;padding:20px;background:#081019;color:#cee9e1;font:16px system-ui}h1{font-size:22px}main{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}section{background:#101d28;padding:12px;border:1px solid #304e54;border-radius:10px}h2{font-size:16px;margin:0 0 10px}section div{display:flex;justify-content:space-around;align-items:center;gap:10px}figure{margin:0;flex:1;min-width:0}img{display:block;max-width:100%;height:auto}figcaption{padding-top:8px;font-size:13px}</style><h1>Две реални фази на лапичките</h1><p>Игрова камера 55° · 1.5× · 50% перспектива · скорост 0.5×. Изрязани кадри без допълнително приближаване на камерата. Формата следва същия реален маршрут; позите са записани след целия игрови рендер.</p><main>${cards}</main></html>`;
 const montage=`preview-dragon-paw-cycle-${width}.html`;fs.writeFileSync(path.join(root,montage),html);
 const review=await browser.newPage({viewport:{width:1440,height:1100}});await review.goto(`http://127.0.0.1:8093/experiments/3d/${montage}`);
 await review.screenshot({path:path.join(root,`preview-dragon-paw-cycle-${width}.png`),fullPage:true});await review.close();
 assert.deepEqual(errors,[]);
 const compact=results.map(r=>({variant:r.variant,width:r.width,jointCounts:r.runtime.jointCounts,rows:r.visibility.rows.map(row=>({direction:row.direction,speedLabel:row.speedLabel,paws:row.paws}))}));
 console.log(JSON.stringify({results:compact,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
