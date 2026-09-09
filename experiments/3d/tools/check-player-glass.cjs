// Actual player glass in the transmission/mirror renderer. Art screenshots
// accompany checks of facial readability, articulation and life transitions.
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),origin=new URL(process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/').origin;
const file=name=>path.join(root,`preview-player-glass-${name}`);
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route(url=>url.pathname==='/__player-glass-check__',route=>route.fulfill({contentType:'text/html',body:
      '<!doctype html><style>html,body{margin:0;background:#060913}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto(origin+'/__player-glass-check__');
    const initial=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {createPlayerModel}=await import('/experiments/3d/models/player.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES}=await import('/experiments/3d/maze-layout.mjs');
      const {PLAYER_SCALE}=await import('/experiments/3d/world.mjs');
      const {PLAYER_SWALLOW_MS,PREDATOR_CHOMP_MS}=await import('/experiments/3d/player-eaten.mjs');
      const clone=v=>JSON.parse(JSON.stringify(v)),check=(yes,message)=>{if(!yes)throw new Error(message);};
      const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const n of Object.values(v))freeze(n);}return v;};
      const meshes=root=>{const all=[];root.traverse(o=>{if(o.isMesh)all.push(o);});return all;};
      const materialData=m=>({type:m.type,color:m.color?.toArray(),emissive:m.emissive?.toArray(),emissiveIntensity:m.emissiveIntensity,
        transmission:m.transmission,roughness:m.roughness,ior:m.ior,opacity:m.opacity,transparent:m.transparent});
      const scene=new DuskScene(document.getElementById('world')),gl=scene.renderer.getContext();
      const snake=(id,body,color='#079ed1')=>({id,body:clone(body),color,motion:null,reversing:false,
        dir:body.length>1?{x:body[0].x-body[1].x,y:body[0].y-body[1].y}:{x:1,y:0}});
      const player=(x,y,dir={x:0,y:1})=>({id:1,x,y,visual:{x,y},dir,mouthOpen:true,dead:false,hidden:false,shield:false,
        powered:false,lives:3,deathStartedAt:null,respawnAt:null});
      const opening={generation:1,started:true,cols:19,rows:15,maze:CONCEPT_MAZE,time:1100,paused:true,
        player:player(4,11),snakes:CONCEPT_SNAKES.map((s,i)=>snake(i+1,s.body,s.color)),bites:[],predations:[]};
      const render=(state,dt=0)=>{const before=JSON.stringify(state);freeze(state);scene.render(state,dt);gl.finish();
        check(before===JSON.stringify(state),'Glass presentation does not mutate the game snapshot');
        check(gl.getError()===gl.NO_ERROR,'Player glass, snake glass and mirrors render without WebGL errors');};
      const resources=()=>({...scene.diagnostics(),programs:scene.renderer.info.programs.length,sceneChildren:scene.scene.children.length});
      const effectiveVisible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
      scene.zoom=scene.targetZoom=1.5;scene.tiltDegrees=scene.targetTiltDegrees=45;
      scene.reset(opening);for(let i=0;i<30;i++)render(opening,1/60);
      check(scene.playerGlass&&typeof scene.playerGlass.update==='function','The actual scene owns the player glass presentation');
      check(scene.wallMirrors.enabled,'Player glass is exercised together with mirrored walls');
      const originalMaterial=new THREE.MeshBasicMaterial(),reference=createPlayerModel(originalMaterial);
      const authored=meshes(reference),nativeNames=new Set(authored.map(o=>o.name)),actual=meshes(scene.player);
      for(const mesh of authored){const current=scene.player.getObjectByName(mesh.name);
        check(current?.geometry===mesh.geometry,'Glass retains authored '+mesh.name+' geometry');}
      originalMaterial.dispose();
      const shells=['Faceted skull and continuous nape','Faceted round chin','Pressed red metal helmet','Thin swept front visor']
        .map(name=>scene.player.getObjectByName(name));
      for(const mesh of shells)check(mesh.material.isMeshPhysicalMaterial&&mesh.material.transmission>0,'Actual '+mesh.name+' uses transmitting glass');
      const opaque=['Black pupils','Expressive eye whites','Deep mouth cavity','Inner lower mouth','Upper ivory fangs','Lower ivory fangs']
        .map(name=>scene.player.getObjectByName(name));
      for(const mesh of opaque){const mat=mesh.material;check(mat&&!mat.transparent&&mat.opacity===1&&!(mat.transmission>0),mesh.name+' remains opaque and readable');}
      const additions=actual.filter(o=>!nativeNames.has(o.name));
      check(additions.length>0,'The player includes its inset light/glow meshes');
      const shaderMaterials=[...new Set(actual.map(o=>o.material))],baseMaterials=shaderMaterials.map(materialData);
      check(shells.some(o=>o.material.emissiveIntensity>0&&o.material.emissive.toArray().some(v=>v>0)),
        'Unshielded glass keeps its baseline neon emission');
      const identity=actual.map(o=>[o,o.geometry,o.material]);
      const extension=gl.getExtension('WEBGL_debug_renderer_info');
      window.__playerGlass={THREE,scene,gl,opening,snake,player,clone,check,render,resources,meshes,materialData,effectiveVisible,
        authored,nativeNames,shells,opaque,additions,shaderMaterials,baseMaterials,identity,PLAYER_SCALE,PLAYER_SWALLOW_MS,PREDATOR_CHOMP_MS};
      return {materials:shells.map(o=>({name:o.name,...materialData(o.material)})),opaque:opaque.map(o=>({name:o.name,...materialData(o.material)})),
        additions:additions.map(o=>({name:o.name,parent:o.parent.name})),resources:resources(),
        gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
    });
    const articulation=await page.evaluate(()=>{
      const m=__playerGlass,{scene,THREE,check}=m,root=scene.player,jaw=root.userData.jaw;
      const inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4();
      const relative=o=>{root.updateWorldMatrix(true,true);return matrix.multiplyMatrices(inverse.copy(root.matrixWorld).invert(),o.matrixWorld).toArray();};
      const descendant=(o,parent)=>{for(let p=o;p;p=p.parent)if(p===parent)return true;return false;};
      const fixed=m.meshes(root).filter(o=>!descendant(o,jaw)),moving=m.meshes(jaw);
      const fixedTransforms=fixed.map(relative),jawLocal=moving.map(o=>({mesh:o,matrix:o.matrix.toArray()})),angles=[];
      const bounds={minY:Infinity,maxY:-Infinity,radius:0};let vertices=0;
      for(const angle of [.04,.08,.15,.22,.28,.30]){
        jaw.rotation.x=angle;root.updateWorldMatrix(true,true);
        fixed.forEach((o,i)=>check(JSON.stringify(relative(o))===JSON.stringify(fixedTransforms[i]),'Opening the jaw cannot expand or stack the fixed nape/helmet: '+o.name));
        jawLocal.forEach(({mesh,matrix})=>check(JSON.stringify(mesh.matrix.toArray())===JSON.stringify(matrix),'Jaw contents articulate together: '+mesh.name));
        const point=new THREE.Vector3();
        for(const o of m.meshes(root).filter(o=>m.nativeNames.has(o.name))){
          matrix.multiplyMatrices(inverse.copy(root.matrixWorld).invert(),o.matrixWorld);const pos=o.geometry.attributes.position;
          for(let i=0;i<pos.count;i++){point.fromBufferAttribute(pos,i).applyMatrix4(matrix);vertices++;
            bounds.minY=Math.min(bounds.minY,point.y);bounds.maxY=Math.max(bounds.maxY,point.y);bounds.radius=Math.max(bounds.radius,Math.hypot(point.x,point.z));}
        }angles.push(angle);
      }
      check(bounds.radius<=.414001&&bounds.minY>=-1e-6,'Glass retains the articulated player collision/floor envelope');
      m.render(m.opening);return {angles,vertices,bounds,fixedParts:fixed.length,jawParts:moving.length};
    });
    const shield=await page.evaluate(()=>{
      const m=__playerGlass,{scene,check}=m,on=[];
      for(let i=0;i<3;i++){
        m.render({...m.clone(m.opening),player:{...m.clone(m.opening.player),shield:true}});
        on.push(m.shaderMaterials.map(m.materialData));
        m.render(m.opening);
        check(JSON.stringify(m.shaderMaterials.map(m.materialData))===JSON.stringify(m.baseMaterials),'Removing the shield restores the exact unshielded glass color and neon emission');
        check(m.identity.every(([o,g,mat])=>o.geometry===g&&o.material===mat),'Shield transitions retain player geometry and materials');
      }
      return {cycles:on.length,on:on[0],restored:m.shaderMaterials.map(m.materialData)};
    });
    const screenshots=[];
    for(const [name,yaw,angle,close,shield] of [['normal',0,.15,false,false],['front',0,.15,true,false],['rear',Math.PI,.30,true,false],
      ['open',Math.PI/4,.30,true,false],['shield',0,.15,true,true]]){
      await page.evaluate(({yaw,angle,close,shield})=>{
        const m=__playerGlass,{scene}=m,state={...m.clone(m.opening),player:{...m.clone(m.opening.player),shield,dir:{x:Math.sin(yaw),y:Math.cos(yaw)}}};
        scene.playerYaw=yaw;m.render(state);scene.player.userData.jaw.rotation.x=angle;
        if(close){const p=scene.player.position,cy=p.y+.97,halfHeight=1.9;scene.camera.left=-halfHeight*1920/1080;scene.camera.right=-scene.camera.left;
          scene.camera.top=halfHeight;scene.camera.bottom=-halfHeight;scene.camera.position.set(p.x,cy+8,p.z+8);scene.camera.lookAt(p.x,cy,p.z);scene.camera.updateProjectionMatrix();}
        scene.wallMirrors.render(scene.scene,scene.camera);m.gl.finish();
      },{yaw,angle,close,shield});
      const output=file(name+'.png');await page.screenshot({path:output});screenshots.push(output);
    }
    const predation=await page.evaluate(()=>{
      const m=__playerGlass,{scene,check,THREE}=m,attacker=m.snake(43,[{x:9,y:7},{x:8,y:7},{x:7,y:7},{x:6,y:7}],'#c92099');
      const player=m.player(9.75,7,{x:-1,y:0}),eventTime=3000,event={id:1,time:eventTime,snake:m.clone(attacker),playerId:1,
        player:{id:1,visual:{...player.visual},dir:{...player.dir},mouthOpen:true}};
      const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14?'#':'.').join(''));
      const stateFor=elapsed=>({...m.clone(m.opening),generation:2,maze,time:eventTime+elapsed,paused:false,player:{...m.clone(player),dead:elapsed>=0,
        deathStartedAt:elapsed>=0?eventTime:null,respawnAt:elapsed>=0?eventTime+3000:null},snakes:[m.clone(attacker)],predations:elapsed<0?[]:[m.clone(event)]});
      const start=()=>{const state=stateFor(-1);scene.reset(state);scene.playerYaw=Math.atan2(player.dir.x,player.dir.y);m.render(state);};start();
      const model=scene.player,local=m.additions.map(o=>({mesh:o,position:o.position.toArray(),scale:o.scale.toArray()})),sizes=[];
      for(const portion of [0,.2,.5,.8,.98]){
        m.render(stateFor(m.PLAYER_SWALLOW_MS*portion));check(model.visible,'The captured glass model remains visible until it is swallowed');
        sizes.push(model.scale.length());model.updateWorldMatrix(true,true);
        for(const {mesh,position,scale} of local){
          check(JSON.stringify(mesh.position.toArray())===JSON.stringify(position),'Inset/glow stays attached while swallowing: '+mesh.name);
          check(JSON.stringify(mesh.scale.toArray())===JSON.stringify(scale),'Inset/glow inherits the shrinking model rather than retaining world size: '+mesh.name);
          check(mesh.matrixWorld.elements.every(Number.isFinite),'Glass effect transform remains finite');
        }
      }
      check(sizes.every((v,i)=>!i||v<sizes[i-1])&&sizes.at(-1)<sizes[0]*.025,'The glass shell and attached effects shrink continuously');
      const mid=stateFor(m.PLAYER_SWALLOW_MS*.5);start();m.render(mid);
      const pose=()=>JSON.stringify([model.position.toArray(),model.scale.toArray(),model.quaternion.toArray(),...m.additions.map(o=>o.matrixWorld.toArray())]);
      const paused=pose();for(let i=0;i<3;i++)m.render({...m.clone(mid),paused:true});check(pose()===paused,'Pausing freezes the glass/effects during predation');
      m.render(stateFor(m.PREDATOR_CHOMP_MS+100));
      check(!model.visible&&m.additions.every(o=>!m.effectiveVisible(o)),'Consumed model leaves no orphaned glow or core');
      m.render({...stateFor(m.PREDATOR_CHOMP_MS+101),player:m.clone(player)});
      check(model.visible&&model.scale.toArray().every(v=>Math.abs(v-m.PLAYER_SCALE)<1e-9),'Respawn restores the full glass player');
      check(JSON.stringify(m.shaderMaterials.map(m.materialData))===JSON.stringify(m.baseMaterials),'Respawn restores the original unshielded finish');
      for(const patch of [{player:{...m.clone(player),hidden:true}},{player:null}]){
        m.render({...stateFor(-1),...patch});check(!model.visible&&m.additions.every(o=>!m.effectiveVisible(o)),'Hidden/missing player leaves no glass effect behind');
      }
      window.__playerGlass.predationStart=start;window.__playerGlass.predationState=stateFor;
      return {sizes,attachedEffects:local.length,hidden:true,respawn:true,pause:true};
    });
    await page.evaluate(()=>{const m=__playerGlass;m.predationStart();m.render(m.predationState(m.PLAYER_SWALLOW_MS*.5));});
    const midPath=file('predation.png');await page.screenshot({path:midPath});screenshots.push(midPath);
    const lifecycle=await page.evaluate(()=>{
      const m=__playerGlass,{scene,check}=m,glass=scene.playerGlass,model=scene.player,cycles=[];
      for(let i=0;i<6;i++){
        scene.reset(m.opening);m.render(m.opening);
        scene.setMirrorWalls(false);m.render(m.opening);scene.setMirrorWalls(true);m.render(m.opening);
        check(scene.player===model&&scene.playerGlass===glass,'Restart reuses the existing glass model/controller');
        check(m.identity.every(([o,g,mat])=>o.geometry===g&&o.material===mat),'Restart retains the owned player mesh/material objects');
        check(JSON.stringify(m.shaderMaterials.map(m.materialData))===JSON.stringify(m.baseMaterials),'Restart does not erase baseline neon emission');
        cycles.push(m.resources());
      }return cycles;
    });
    for(const row of lifecycle.slice(1))for(const key of ['geometries','textures','programs','sceneChildren'])assert.equal(row[key],lifecycle[0][key],`Stable restart ${key}`);
    assert.deepEqual(errors,[],'No browser or shader failures');
    const report={initial,articulation,shield,predation,lifecycle,screenshots,errors},reportPath=file('report.log');
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({reportPath,initial,articulation,predation,lifecycle:lifecycle.map(r=>({geometries:r.geometries,textures:r.textures,programs:r.programs,sceneChildren:r.sceneChildren})),errors}));
  }catch(error){for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:file('failure.png')}).catch(()=>{});throw error;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
