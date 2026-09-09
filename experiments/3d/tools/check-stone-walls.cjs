// Fixed-scene wall/floor comparisons and serial GPU-aware render measurements.
// Before rendering routes a saved pre-change environment source, so both
// phases keep identical characters, lighting, camera and snapshots, and assert
// the untouched surface (floor or walls) remains exactly the same.
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const mode=option('--mode','after');
assert.ok(['before','after','both'].includes(mode),'--mode is before, after or both');
const subject=option('--subject','walls');
assert.ok(['walls','floor'].includes(subject),'--subject is walls or floor');
const prefix=option('--prefix',subject==='floor'?'preview-floor':'preview-stone');
assert.match(prefix,/^preview-[a-z0-9-]+$/,'Use a preview output prefix without a path');
const baseline=path.resolve(option('--baseline',path.join(root,'preview-stone-baseline.log')));
const baselineWalls=option('--baseline-walls',null);
const runs=Number(option('--runs','1'));
assert.ok(Number.isInteger(runs)&&runs>=1&&runs<=10,'Use between 1 and 10 serial paired runs');
const frames=Number(option('--frames','120')),warmFrames=30;
assert.ok(Number.isInteger(frames)&&frames>=30,'Measure at least 30 steady frames');
const origin=new URL(process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/').origin;
const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
const summarize=values=>{const a=values.slice().sort((a,b)=>a-b),q=p=>a[Math.min(a.length-1,Math.floor((a.length-1)*p))];
  return {samples:a.length,p50:q(.5),p95:q(.95),max:a.at(-1),mean:a.reduce((a,b)=>a+b,0)/a.length};};

(async()=>{
  // HTTP server logs keep appending while the baseline is served; only frozen
  // comparison artifacts belong in the preservation manifest.
  const protectedArtifacts=fs.readdirSync(root).filter(name=>/^preview-stone(?:2)?-/.test(name)&&
      !name.startsWith(prefix+'-')&&!name.includes('-server-'))
    .map(name=>({name,sha256:hash(fs.readFileSync(path.join(root,name)))}));
  if(mode!=='after')assert.ok(fs.existsSync(baseline),'Save the pre-change environment source before taking baseline measurements');
  const beforeSource=fs.existsSync(baseline)?fs.readFileSync(baseline,'utf8'):null;
  const beforeWallsSource=baselineWalls?fs.readFileSync(path.resolve(baselineWalls),'utf8'):null;
  if(mode!=='after'&&beforeSource?.includes("from './wall-stones.mjs'"))assert.ok(beforeWallsSource,
    'A stone-wall baseline requires --baseline-walls so its original dependency is preserved');
  const currentSource=fs.readFileSync(path.join(root,'environment.mjs'),'utf8');
  const stonesPath=path.join(root,'wall-stones.mjs');
  const currentStonesSource=fs.existsSync(stonesPath)?fs.readFileSync(stonesPath,'utf8'):null;
  const floorPath=path.join(root,'floor-stones.mjs');
  const currentFloorSource=fs.existsSync(floorPath)?fs.readFileSync(floorPath,'utf8'):null;
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  const reports=[];
  const schedule=[];
  for(const [width,height] of [[1920,1080],[3840,2160]])for(let run=1;run<=runs;run++){
    const phases=mode==='both'?(run%2?['before','after']:['after','before']):[mode];
    for(const phase of phases)schedule.push({width,height,run,phase});
  }
  try{
    for(const {phase,width,height,run} of schedule){
        const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
        await page.route(url=>url.pathname.endsWith('/experiments/3d/environment.mjs'),route=>route.fulfill({
          contentType:'text/javascript',body:phase==='before'?beforeSource:currentSource
        }));
        const wallsSource=phase==='before'?beforeWallsSource:currentStonesSource;
        if(wallsSource)await page.route(url=>url.pathname.endsWith('/experiments/3d/wall-stones.mjs'),route=>route.fulfill({
          contentType:'text/javascript',body:wallsSource
        }));
        if(currentFloorSource&&phase==='after')await page.route(url=>url.pathname.endsWith('/experiments/3d/floor-stones.mjs'),route=>route.fulfill({
          contentType:'text/javascript',body:currentFloorSource
        }));
        await page.route(url=>url.pathname==='/__stone-wall-check__',route=>route.fulfill({
          contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><style>html,body{margin:0;background:#060913;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'
        }));
        await page.goto(origin+'/__stone-wall-check__');
        const initial=await page.evaluate(async()=>{
          const began=performance.now();
          const {DuskScene}=await import('/experiments/3d/renderer.mjs');
          const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
          const imported=performance.now();
          const scene=new DuskScene(document.getElementById('world'));
          const constructed=performance.now();
          const snakes=CONCEPT_SNAKES.map((s,i)=>({id:i+1,color:s.color,body:s.body.map(p=>({...p})),
            dir:{x:s.body[0].x-s.body[1].x,y:s.body[0].y-s.body[1].y},motion:null,reversing:false}));
          const state={generation:1,started:true,maze:CONCEPT_MAZE,cols:19,rows:15,time:2400,
            player:{id:1,...PLAYER_SPAWN,visual:{x:4,y:11},mouthOpen:true,dead:false,hidden:false,shield:false},
            snakes,paused:true,bites:[],predations:[]};
          scene.zoom=scene.targetZoom=1.5;scene.tiltDegrees=scene.targetTiltDegrees=45;
          scene.reset(state);const built=performance.now();
          scene.render(state,0);const submitted=performance.now();
          const gl=scene.renderer.getContext();gl.finish();const finished=performance.now();
          const extension=gl.getExtension('WEBGL_debug_renderer_info');
          const gpu={vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),
            renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
            version:gl.getParameter(gl.VERSION),samples:gl.getParameter(gl.SAMPLES),
            timerQueries:!!gl.getExtension('EXT_disjoint_timer_query_webgl2')};
          const resources=()=>({...scene.diagnostics(),programs:scene.renderer.info.programs.length,
            meshes:scene.staticGroup.children.length,ownedGeometries:scene.staticGroup.userData.ownedGeometries?.length,
            ownedTextures:scene.staticGroup.userData.surfaceTextures?.length,
            wallBounds:scene.staticGroup.userData.wallBounds.length,pavingCount:scene.staticGroup.userData.pavingCount});
          window.__stone={scene,state,gl,resources,opening:JSON.parse(JSON.stringify(state))};
          return {importMs:imported-began,constructMs:constructed-imported,buildMs:built-constructed,
            firstSubmitMs:submitted-built,firstCompletedMs:finished-built,totalMs:finished-began,
            gpu,buffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},resources:resources()};
        });
        assert.deepEqual(initial.buffer,{width,height},'Each measurement uses the exact requested drawing-buffer resolution');
        const performanceResult=await page.evaluate(async({frames,warmFrames})=>{
          const {scene,state,gl,resources}=__stone;
          const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
          for(let i=0;i<warmFrames;i++){await nextFrame();scene.render(state,0);gl.finish();}
          const cpu=[],completed=[],intervals=[];let previousStart=null;
          for(let i=0;i<frames;i++){
            await nextFrame();const start=performance.now();
            if(previousStart!==null)intervals.push(start-previousStart);previousStart=start;
            scene.render(state,0);const submitted=performance.now();gl.finish();const finish=performance.now();
            cpu.push(submitted-start);completed.push(finish-start);
          }
          const stats=values=>{const a=values.slice().sort((a,b)=>a-b),q=p=>a[Math.min(a.length-1,Math.floor((a.length-1)*p))];
            return {samples:a.length,p50:q(.5),p95:q(.95),max:a.at(-1),mean:a.reduce((a,b)=>a+b,0)/a.length};};
          return {cpuSubmitMs:stats(cpu),gpuCompletedRenderMs:stats(completed),pacedFrameIntervalMs:stats(intervals),
            rawTiming:{cpuSubmitMs:cpu,gpuCompletedRenderMs:completed,pacedFrameIntervalMs:intervals},
            resources:resources(),camera:{tilt:scene.tiltDegrees,zoom:scene.zoom,position:scene.camera.position.toArray(),
              bounds:[scene.camera.left,scene.camera.right,scene.camera.top,scene.camera.bottom]},
            player:{...state.player.visual},lights:scene.scene.children.filter(o=>o.isLight).map(o=>({
              type:o.type,color:o.color.getHex(),intensity:o.intensity,position:o.position.toArray()}))};
        },{frames,warmFrames});
        const integrity=await page.evaluate(async subject=>{
          const {scene}=__stone,group=scene.staticGroup;
          const THREE=await import('/experiments/3d/vendor/three.module.min.js');
          const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
            new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
          const paving=group.children.find(object=>object.isInstancedMesh&&object.count===group.userData.pavingCount);
          if(subject==='walls'&&!paving)throw new Error('The actual paving mesh must remain identifiable');
          const material=paving?.material;
          const floor=paving?{count:paving.count,matrices:Array.from(paving.instanceMatrix.array),
            colors:Array.from(paving.instanceColor.array),positions:Array.from(paving.geometry.attributes.position.array),
            material:{color:material.color.getHex(),roughness:material.roughness,metalness:material.metalness,
              clearcoat:material.clearcoat,clearcoatRoughness:material.clearcoatRoughness,envMapIntensity:material.envMapIntensity,
              map:material.map?.image?.toDataURL()}}:null;
          const floorMeshes=new Set(group.userData.floorMeshes||[]);
          if(paving)floorMeshes.add(paving);
          group.traverse(object=>{if(object.name.startsWith('stone-floor-'))floorMeshes.add(object);});
          const textureData=texture=>texture?{image:texture.image?.toDataURL?.()||
              (texture.image?.data?Array.from(texture.image.data):null),colorSpace:texture.colorSpace,
            wrap:[texture.wrapS,texture.wrapT],repeat:texture.repeat.toArray(),offset:texture.offset.toArray(),
            rotation:texture.rotation,anisotropy:texture.anisotropy}:null;
          const materialData=material=>{
            const data={type:material.type};
            for(const key of ['color','emissive','roughness','metalness','clearcoat','clearcoatRoughness',
              'envMapIntensity','emissiveIntensity','opacity','transparent','depthWrite','depthTest','side',
              'blending','toneMapped','polygonOffset','polygonOffsetFactor','polygonOffsetUnits','flatShading']){
              if(material[key]!==undefined)data[key]=material[key]?.isColor?material[key].getHex():material[key];
            }
            for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','alphaMap','bumpMap'])data[key]=textureData(material[key]);
            return data;
          };
          const meshData=object=>({name:object.name,type:object.type,matrix:object.matrixWorld.toArray(),
            castShadow:object.castShadow,receiveShadow:object.receiveShadow,visible:object.visible,
            count:object.count,instances:object.instanceMatrix?Array.from(object.instanceMatrix.array):null,
            colors:object.instanceColor?Array.from(object.instanceColor.array):null,
            geometry:{index:object.geometry.index?Array.from(object.geometry.index.array):null,
              groups:object.geometry.groups,attributes:Object.fromEntries(Object.entries(object.geometry.attributes)
                .map(([name,attribute])=>[name,{itemSize:attribute.itemSize,normalized:attribute.normalized,array:Array.from(attribute.array)}]))},
            materials:(Array.isArray(object.material)?object.material:[object.material]).map(materialData)});
          group.updateMatrixWorld(true);
          const protectedMeshes=[];
          group.traverse(object=>{if(object.isMesh&&!floorMeshes.has(object))protectedMeshes.push(meshData(object));});
          const auditFloor=()=>{
            const group=scene.staticGroup,bounds=group.userData.floorBounds;
            if(!group.userData.floorStyle)return {style:null};
            const result={style:group.userData.floorStyle,slabs:group.userData.floorSlabs?.length||0,bounds,
              vertices:0,minY:Infinity,maxY:-Infinity,nonFinite:0,outsideBounds:[],meshes:[]};
            const point=new THREE.Vector3(),instance=new THREE.Matrix4(),matrix=new THREE.Matrix4();
            group.updateMatrixWorld(true);
            group.traverse(object=>{
              if(!object.isMesh||!(object.name.startsWith('stone-floor-')||(group.userData.floorMeshes||[]).includes(object)))return;
              result.meshes.push(object.name);
              for(let i=0;i<(object.isInstancedMesh?object.count:1);i++){
                if(object.isInstancedMesh){object.getMatrixAt(i,instance);matrix.multiplyMatrices(object.matrixWorld,instance);}
                else matrix.copy(object.matrixWorld);
                const attribute=object.geometry.attributes.position;
                for(let j=0;j<attribute.count;j++){
                  point.fromBufferAttribute(attribute,j).applyMatrix4(matrix);result.vertices++;
                  if(![point.x,point.y,point.z].every(Number.isFinite))result.nonFinite++;
                  result.minY=Math.min(result.minY,point.y);result.maxY=Math.max(result.maxY,point.y);
                  if(bounds&&(point.x<bounds.minX-1e-5||point.x>bounds.maxX+1e-5||point.z<bounds.minZ-1e-5||point.z>bounds.maxZ+1e-5)&&result.outsideBounds.length<8)
                    result.outsideBounds.push({x:point.x,y:point.y,z:point.z});
                }
              }
            });return result;
          };
          const auditGeometry=()=>{
            const group=scene.staticGroup,bounds=group.userData.wallBounds,blocks=group.userData.stoneBlocks||[];
            const result={style:group.userData.stoneStyle||null,meshes:[],vertices:0,minY:Infinity,maxY:-Infinity,
              outsideFootprint:[],nonFinite:0,uncoveredBounds:[]};
            const point=new THREE.Vector3(),instance=new THREE.Matrix4(),matrix=new THREE.Matrix4();
            group.updateMatrixWorld(true);
            group.traverse(object=>{
              if(!['stone-wall-core','stone-wall-blocks'].includes(object.name))return;
              result.meshes.push(object.name);
              const attribute=object.geometry.attributes.position;
              for(let i=0;i<(object.isInstancedMesh?object.count:1);i++){
                if(object.isInstancedMesh){object.getMatrixAt(i,instance);matrix.multiplyMatrices(object.matrixWorld,instance);}
                else matrix.copy(object.matrixWorld);
                for(let j=0;j<attribute.count;j++){
                  point.fromBufferAttribute(attribute,j).applyMatrix4(matrix);result.vertices++;
                  if(![point.x,point.y,point.z].every(Number.isFinite))result.nonFinite++;
                  result.minY=Math.min(result.minY,point.y);result.maxY=Math.max(result.maxY,point.y);
                  if(!bounds.some(b=>point.x>=b.minX-1e-5&&point.x<=b.maxX+1e-5&&point.z>=b.minZ-1e-5&&point.z<=b.maxZ+1e-5)&&result.outsideFootprint.length<8)
                    result.outsideFootprint.push({mesh:object.name,x:point.x,y:point.y,z:point.z});
                }
              }
            });
            if(blocks.length)for(const b of bounds){
              const x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2;
              const covered=blocks.some(block=>{const dx=x-block.x,dz=z-block.z,c=Math.cos(block.angle),s=Math.sin(block.angle);
                return Math.abs(c*dx-s*dz)<=block.length/2+.055&&Math.abs(s*dx+c*dz)<=block.width/2+.055;});
              if(!covered&&result.uncoveredBounds.length<8)result.uncoveredBounds.push({x,z});
            }
            return result;
          };
          __stone.auditGeometry=auditGeometry;
          __stone.auditFloor=auditFloor;
          return {floorSha256:floor?await digest(floor):null,protectedStaticSha256:await digest(protectedMeshes),
            protectedStaticMeshes:protectedMeshes.map(mesh=>mesh.name||mesh.type),floorGeometry:auditFloor(),
            collisionBoundsSha256:await digest(group.userData.wallBounds),
            stoneStyle:group.userData.stoneStyle||null,stoneBlocks:group.userData.stoneBlocks?.length||0,geometry:auditGeometry()};
        },subject);
        const screenshots=[];
        const openingPath=path.join(root,`${prefix}-${phase}-${width}-opening.png`);
        await page.screenshot({path:openingPath});screenshots.push(openingPath);
        const gallery=await page.evaluate(subject=>{
          const {scene,state,opening}=__stone;
          if(subject==='floor'){
            const samples={...opening,generation:2};
            scene.zoom=scene.targetZoom=2;scene.reset(samples);scene.render(samples,0);__stone.gl.finish();
            return {features:['warm flashlight pool and floor highlights at close range'],maze:samples.maze,
              tilt:scene.tiltDegrees,zoom:scene.zoom,player:samples.player.visual,
              geometry:__stone.auditGeometry(),floorGeometry:__stone.auditFloor()};
          }
          const cells=[[4,8],[5,8],[6,8],[8,5],[8,6],[8,7],[9,7],[10,7],
            [13,5],[13,6],[13,7],[12,6],[3,5],[4,5],[5,5],[4,4],[4,6]];
          const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>
            x===0||x===18||y===0||y===14||cells.some(p=>p[0]===x&&p[1]===y)?'#':'.').join(''));
          const samples={...state,generation:2,maze,snakes:[],player:{...state.player,x:9,y:8,
            visual:{x:9,y:8},dir:{x:-1,y:0}}};
          scene.reset(samples);scene.playerYaw=-Math.PI/2;scene.render(samples,0);__stone.gl.finish();
          return {maze,features:['lit straight with two exposed ends','L-shaped inside/outside corner','T-junction','cross junction'],
            tilt:scene.tiltDegrees,zoom:scene.zoom,player:samples.player.visual,geometry:__stone.auditGeometry()};
        },subject);
        const samplePath=path.join(root,`${prefix}-${phase}-${width}-${subject==='floor'?'flashlight-close':'wall-samples'}.png`);
        await page.screenshot({path:samplePath});screenshots.push(samplePath);
        const occlusion=await page.evaluate(async()=>{
          const THREE=await import('/experiments/3d/vendor/three.module.min.js');
          const {scene,opening}=__stone;
          scene.zoom=scene.targetZoom=1.5;
          const state={...opening,generation:3,player:{...opening.player,x:4,y:9,visual:{x:4,y:9},dir:{x:0,y:1}},
            snakes:[{id:201,color:'#079ed1',body:[{x:3,y:9},{x:3,y:8},{x:2,y:8}],
              dir:{x:0,y:1},motion:null,reversing:false}]};
          for(const p of [state.player,...state.snakes[0].body])if(state.maze[p.y]?.[p.x]!=='.')throw new Error('Occlusion poses must be on legal floor cells');
          scene.reset(state);scene.render(state,0);__stone.gl.finish();
          const renderer=scene.renderer,target=new THREE.WebGLRenderTarget(renderer.domElement.width,renderer.domElement.height);
          const pixels=new Uint8Array(target.width*target.height*4);
          const white=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),black=new THREE.MeshBasicMaterial({color:0x000000,toneMapped:false});
          const originals=[],overlays=[scene.halo,scene.beam,scene.vapor.group,scene.bites.group,scene.predation.bloom.group].map(o=>[o,o.visible]);
          scene.scene.traverse(object=>{if(object.isMesh)originals.push([object,object.material]);});
          const background=scene.scene.background,clear=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
          const shadows=renderer.shadowMap.enabled,wallVisibility=scene.staticGroup.visible;
          const groups={playerHead:scene.player,snakeHead:scene.snakes.get(201).head};
          const eyeSets={playerEyes:new Set(),snakeEyes:new Set()};
          scene.player.traverse(o=>{if(o.name==='Expressive eye whites')eyeSets.playerEyes.add(o);});
          groups.snakeHead.traverse(o=>{if(o.name==='Inset glossy eye')eyeSets.snakeEyes.add(o);});
          const sets={...eyeSets};for(const [name,group] of Object.entries(groups)){sets[name]=new Set();group.traverse(o=>{if(o.isMesh)sets[name].add(o);});}
          const count=()=>{renderer.render(scene.scene,scene.camera);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
            let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>128)count++;return count;};
          const visibility={};
          try{
            for(const [object] of overlays)object.visible=false;
            scene.scene.background=null;renderer.setClearColor(0x000000,1);renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);
            for(const [name,set] of Object.entries(sets)){
              if(!set.size)throw new Error('The eye/head visibility subject must exist: '+name);
              for(const [object] of originals)object.material=set.has(object)?white:black;
              scene.staticGroup.visible=true;const visible=count();
              scene.staticGroup.visible=false;const unobstructed=count();
              visibility[name]={visiblePixels:visible,unobstructedPixels:unobstructed,ratio:visible/Math.max(1,unobstructed)};
            }
          }finally{
            renderer.setRenderTarget(null);renderer.shadowMap.enabled=shadows;scene.staticGroup.visible=wallVisibility;
            for(const [object,material] of originals)object.material=material;
            for(const [object,visible] of overlays)object.visible=visible;
            scene.scene.background=background;renderer.setClearColor(clear,clearAlpha);target.dispose();white.dispose();black.dispose();
          }
          scene.render(state,0);__stone.gl.finish();
          return {player:state.player.visual,snake:state.snakes[0].body,camera:{tilt:scene.tiltDegrees,zoom:scene.zoom},visibility};
        });
        for(const [name,visible] of Object.entries(occlusion.visibility)){
          assert.ok(visible.visiblePixels>=16,`${name} remains visibly present behind the foreground wall`);
          assert.ok(visible.ratio>=.85,`${name} retains at least 85% of its unobstructed silhouette`);
        }
        const occlusionPath=path.join(root,`${prefix}-${phase}-${width}-${subject==='floor'?'dark-corner':'occlusion'}.png`);
        await page.screenshot({path:occlusionPath});screenshots.push(occlusionPath);
        const lifecycle=await page.evaluate(()=>{
          const {scene,opening,gl,resources}=__stone,cycles=[];
          for(let i=0;i<6;i++){
            const prior=scene.staticGroup,owned=[...(prior.userData.ownedGeometries||[]),...(prior.userData.surfaceTextures||[])];
            let disposed=0;for(const resource of owned)resource.addEventListener('dispose',()=>disposed++);
            scene.reset({...opening,generation:i+3});scene.render(opening,0);gl.finish();
            if(disposed!==owned.length)throw new Error('Every maze-owned texture and geometry must be disposed on rebuild');
            if(prior.parent)throw new Error('The replaced maze must leave the scene');
            cycles.push({...resources(),disposedOwnedResources:disposed});
          }
          return cycles;
        });
        for(const resources of lifecycle.slice(1)){
          for(const field of ['geometries','textures','programs','ownedGeometries','ownedTextures','pavingCount','wallBounds']){
            assert.equal(resources[field],lifecycle[0][field],`Repeated maze disposal/rebuild cannot accumulate ${field}`);
          }
        }
        for(const geometry of [integrity.geometry,gallery.geometry]){
          if(!geometry.style)continue;
          assert.ok(geometry.vertices>0&&geometry.meshes.includes('stone-wall-blocks'),'The stone presentation contains actual modeled wall geometry');
          assert.equal(geometry.nonFinite,0,'Every modeled stone vertex is finite');
          assert.ok(geometry.minY>=-1e-5&&geometry.maxY<=1.12001,'Solid stone geometry stays within the established wall height');
          assert.deepEqual(geometry.outsideFootprint,[],'Physical stone geometry remains inside the unchanged wall footprint');
          assert.deepEqual(geometry.uncoveredBounds,[],'Modeled stone blocks cover straight runs, corners, ends and junctions');
        }
        for(const floor of [integrity.floorGeometry,gallery.floorGeometry].filter(Boolean)){
          if(!floor.style)continue;
          assert.ok(floor.vertices>0&&floor.slabs>0,'The floor contains actual stone slabs');
          assert.ok(floor.bounds&&[floor.bounds.minX,floor.bounds.maxX,floor.bounds.minZ,floor.bounds.maxZ].every(Number.isFinite),'Floor bounds are explicit');
          assert.equal(floor.nonFinite,0,'Every floor vertex is finite');
          assert.deepEqual(floor.outsideBounds,[],'Floor slabs stay inside the declared footprint');
          assert.ok(floor.minY>=-.15&&floor.maxY<=.015,'Floor relief remains at ground level below characters');
          assert.ok(floor.minY>=floor.bounds.minY-1e-5&&floor.maxY<=floor.bounds.maxY+1e-5,
            'Every floor vertex remains within its declared shallow relief height');
        }
        assert.deepEqual(errors,[],'No browser errors during wall rendering, rebuilds or disposal');
        const report={subject,phase,run,resolution:{width,height},sourceSha256:hash(phase==='before'?beforeSource:currentSource),
          stonesSourceSha256:wallsSource?hash(wallsSource):null,
          floorSourceSha256:phase==='after'&&currentFloorSource?hash(currentFloorSource):null,
          frames,warmFrames,initial,steady:performanceResult,integrity,gallery,occlusion,lifecycle,screenshots,errors,
          timingNote:'CPU submission and synchronous GPU-completed render are separate; RAF intervals include scheduling. This is a local headless-browser comparison, not a player FPS guarantee.'};
        const reportPath=path.join(root,`${prefix}-${phase}-${width}${runs>1?'-run'+run:''}-report.log`);
        fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');reports.push(report);
        const {rawTiming,...steady}=performanceResult;
        console.log(JSON.stringify({phase,run,resolution:report.resolution,gpu:initial.gpu,initialMs:initial.totalMs,
          steady,reportPath,screenshots}));
        await context.close();
    }
    const grouped=[];
    for(const phase of mode==='both'?['before','after']:[mode])for(const width of [1920,3840]){
      const matched=reports.filter(r=>r.phase===phase&&r.resolution.width===width),last=matched.at(-1);
      const aggregate={...last,runs:matched.length,steady:{...last.steady},pairedRuns:matched.map(r=>({run:r.run,
        initial:r.initial,steady:{cpuSubmitMs:r.steady.cpuSubmitMs,gpuCompletedRenderMs:r.steady.gpuCompletedRenderMs,
          pacedFrameIntervalMs:r.steady.pacedFrameIntervalMs}}))};
      for(const field of ['cpuSubmitMs','gpuCompletedRenderMs','pacedFrameIntervalMs'])aggregate.steady[field]=summarize(
        matched.flatMap(r=>r.steady.rawTiming[field]));
      delete aggregate.steady.rawTiming;
      for(const r of matched){
        assert.equal(r.sourceSha256,last.sourceSha256,'All paired runs use the same captured environment source');
        assert.equal(r.stonesSourceSha256,last.stonesSourceSha256,'All paired runs use the same captured wall module');
        assert.equal(r.floorSourceSha256,last.floorSourceSha256,'All paired runs use the same captured floor module');
        assert.deepEqual(r.steady.resources,last.steady.resources,'Repeated benchmark runs retain identical resources');
      }
      fs.writeFileSync(path.join(root,`${prefix}-${phase}-${width}-report.log`),JSON.stringify(aggregate,null,2)+'\n');
      grouped.push(aggregate);
    }
    if(mode==='both'){
      const comparison=grouped.filter(r=>r.phase==='before').map(before=>{
        const after=grouped.find(r=>r.phase==='after'&&r.resolution.width===before.resolution.width);
        assert.deepEqual(after.steady.camera,before.steady.camera,'Before and after use the identical camera');
        assert.deepEqual(after.steady.player,before.steady.player,'Before and after keep the player fixed');
        assert.deepEqual(after.steady.lights,before.steady.lights,'Surface changes cannot modify global or player lights');
        if(subject==='floor'){
          assert.equal(after.stonesSourceSha256,before.stonesSourceSha256,'Floor changes preserve the wall module exactly');
          assert.equal(after.integrity.protectedStaticSha256,before.integrity.protectedStaticSha256,'Floor changes preserve actual walls, neon, loose chips and slab including geometry, materials, textures and transforms');
        }else assert.equal(after.integrity.floorSha256,before.integrity.floorSha256,'Wall changes preserve the actual floor geometry, colors, material and texture');
        assert.equal(after.integrity.collisionBoundsSha256,before.integrity.collisionBoundsSha256,'Wall changes preserve collision bounds exactly');
        for(const [name,visible] of Object.entries(after.occlusion.visibility))assert.ok(
          visible.ratio>=before.occlusion.visibility[name].ratio-.01,'Updated foreground walls do not obscure the '+name);
        return {resolution:before.resolution,runs,beforeCpuP50:before.steady.cpuSubmitMs.p50,afterCpuP50:after.steady.cpuSubmitMs.p50,
          beforeCompletedP50:before.steady.gpuCompletedRenderMs.p50,afterCompletedP50:after.steady.gpuCompletedRenderMs.p50,
          beforeResources:before.steady.resources,afterResources:after.steady.resources,
          beforeVisibility:before.occlusion.visibility,afterVisibility:after.occlusion.visibility,
          pairedRuns:before.pairedRuns.map(b=>({run:b.run,before:b.steady,after:after.pairedRuns.find(a=>a.run===b.run).steady})),
          subject,floorSha256:after.integrity.floorSha256,protectedStaticSha256:after.integrity.protectedStaticSha256,
          collisionBoundsSha256:after.integrity.collisionBoundsSha256};
      });
      fs.writeFileSync(path.join(root,`${prefix}-comparison.log`),JSON.stringify(comparison,null,2)+'\n');
      console.log(JSON.stringify({comparison}));
    }
    for(const artifact of protectedArtifacts)assert.equal(hash(fs.readFileSync(path.join(root,artifact.name))),artifact.sha256,
      'A new comparison prefix must preserve every original first-pass artifact: '+artifact.name);
    if(protectedArtifacts.length)fs.writeFileSync(path.join(root,`${prefix}-first-pass-manifest.log`),JSON.stringify(protectedArtifacts,null,2)+'\n');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
