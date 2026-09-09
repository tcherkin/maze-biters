// Exercise the luminous snake materials in the real WebGL/transmission/mirror
// pipeline, including consumed pieces, morphs and actual nearby illumination.
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const origin=new URL(process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/').origin;
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const prefix=option('--prefix','preview-snake-light'),baselinePath=option('--baseline-light',null);
assert.match(prefix,/^preview-[a-z0-9-]+$/,'Use a local preview filename prefix');
const baseline=baselinePath?JSON.parse(fs.readFileSync(path.resolve(baselinePath),'utf8')):null;
const artifact=name=>path.join(root,`${prefix}-${name}`);
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route(url=>url.pathname==='/__snake-light-check__',route=>route.fulfill({contentType:'text/html',
      body:'<!doctype html><style>html,body{margin:0;background:#060913}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto(origin+'/__snake-light-check__');
    const initial=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {createSnakeFinish}=await import('/experiments/3d/snake-light.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
      const {SWALLOW_MS}=await import('/experiments/3d/bite-effects.mjs');
      const check=(yes,message)=>{if(!yes)throw new Error(message);};
      const clone=v=>JSON.parse(JSON.stringify(v));
      const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
      const scene=new DuskScene(document.getElementById('world'));
      const snake=(id,body,color)=>({id,body:clone(body),color,dir:body.length>1?
        {x:body[0].x-body[1].x,y:body[0].y-body[1].y}:{x:1,y:0},motion:null,reversing:false});
      const player=(x,y)=>({id:1,x,y,visual:{x,y},dir:{x:1,y:0},mouthOpen:true,dead:false,hidden:false,shield:false});
      const opening={generation:1,started:true,cols:19,rows:15,time:2400,paused:true,bites:[],predations:[],
        maze:CONCEPT_MAZE,player:{...player(4,11),...PLAYER_SPAWN,visual:{x:4,y:11}},
        snakes:CONCEPT_SNAKES.map((s,i)=>snake(i+1,s.body,s.color))};
      const colors=CONCEPT_SNAKES.map(s=>s.color),gl=scene.renderer.getContext();
      const state=clone(opening);scene.zoom=scene.targetZoom=1.5;scene.tiltDegrees=scene.targetTiltDegrees=45;
      const render=(snapshot,dt=0)=>{const before=JSON.stringify(snapshot);freeze(snapshot);scene.render(snapshot,dt);gl.finish();
        check(before===JSON.stringify(snapshot),'Snake presentation cannot mutate the game snapshot');
        check(gl.getError()===gl.NO_ERROR,'Transmission and mirrors must render without WebGL errors');};
      const resources=()=>({...scene.diagnostics(),programs:scene.renderer.info.programs.length,lightCount:scene.snakeLight.lights.length});
      const finishData=finish=>({transmission:finish.material.transmission,color:finish.material.color.getHex(),
        emission:finish.material.emissive?.getHex(),emissiveIntensity:finish.material.emissiveIntensity,
        core:finish.coreMaterial.color?.getHex(),coreEmission:finish.coreMaterial.emissive?.getHex(),
        shellLinear:finish.material.color.toArray(),coreLinear:finish.coreMaterial.color.toArray(),
        skinTransmission:finish.skinMaterial.transmission,roughness:finish.material.roughness,ior:finish.material.ior});
      const finishCheck=finish=>{
        check(finish&&typeof finish.setColor==='function'&&typeof finish.dispose==='function','Each snake uses the shared finish factory');
        for(const key of ['material','skinMaterial','accentMaterial','coreMaterial'])check(finish[key]?.isMaterial,'Missing '+key);
        check(finish.material.isMeshPhysicalMaterial&&finish.material.transmission>0,'The outer armor transmits light');
        check(finish.skinMaterial.isMeshPhysicalMaterial&&finish.skinMaterial.transmission>0,'Flexible joints retain the refractive finish');
        const emission=(finish.material.emissiveIntensity||0)*(finish.material.emissive?.getHex()||0);
        const coreEmission=finish.coreMaterial.isMeshBasicMaterial||(finish.coreMaterial.emissiveIntensity>0&&finish.coreMaterial.emissive?.getHex()>0);
        check(emission>0||coreEmission,'The finish includes a genuinely luminous core');return finishData(finish);
      };
      const checkItem=item=>{
        const finish=finishCheck(item.finish);
        check(item.corePlates?.isInstancedMesh,'Body plates include instanced internal cores');
        check(item.coreTail?.isMesh&&item.coreFormerTail?.isMesh,'Both morphing tail roles include cores');
        check(item.corePlates.material===item.finish.coreMaterial,'Body cores use the live snake finish');
        const cores=[];item.head.traverse(o=>{if(o.isMesh&&/core/i.test(o.name))cores.push(o);});
        check(cores.length>0,'The modeled head includes named inset cores');
        check(cores.every(core=>!core.parent.name.includes('cranial folds')),'Disconnected cranial folds have no protruding inset core');
        for(const core of cores)check(core.material===item.finish.coreMaterial,'Head cores share the snake color and emission');
        const features=[];item.head.traverse(o=>{if(o.isMesh&&['Inset glossy eye','Open dark mouth','Dark lower mouth lining'].includes(o.name))features.push(o);});
        check(features.some(o=>o.name==='Inset glossy eye')&&features.some(o=>o.name==='Open dark mouth'),'The fixture includes the actual eyes and mouth cavity');
        for(const mesh of features){const material=mesh.material;
          check(!material.transparent&&material.opacity===1&&!(material.transmission>0),'Glass tuning keeps '+mesh.name+' opaque');
          check(material!==item.finish.material&&material!==item.finish.coreMaterial,'Facial details retain their dedicated materials');}
        return {...finish,headCores:cores.map(o=>o.name),opaqueFeatures:features.map(o=>({name:o.name,color:o.material.color.getHex()}))};
      };
      scene.reset(state);for(let i=0;i<30;i++)render(state,1/60);
      check(scene.wallMirrors.enabled,'The fixture must exercise mirrors and transmission together');
      check(scene.snakeLight?.lights.length>0,'Local snake lighting uses a real fixed light pool');
      const factory=[];
      for(const color of colors){
        const finish=createSnakeFinish(color),data=finishCheck(finish),materials=new Set(['material','skinMaterial','accentMaterial','coreMaterial'].map(k=>finish[k]));
        const identities=[...materials];finish.setColor(colors[(colors.indexOf(color)+1)%colors.length]);finishCheck(finish);
        finish.setColor(color);check(JSON.stringify(finishData(finish))===JSON.stringify(data),'setColor restores every color/emission property');
        check(['material','skinMaterial','accentMaterial','coreMaterial'].every((key,i)=>finish[key]===identities[i]),'Recoloring keeps material objects');
        let disposed=0;for(const m of materials)m.addEventListener('dispose',()=>disposed++);finish.dispose();
        check(disposed===materials.size,'The finish disposes each owned material once');factory.push({sourceColor:color,...data});
      }
      const items=[...scene.snakes].map(([id,item])=>({id,...checkItem(item)}));
      const extension=gl.getExtension('WEBGL_debug_renderer_info');
      window.__snakeLight={THREE,scene,gl,opening,colors,snake,player,clone,check,render,resources,finishData,finishCheck,checkItem,SWALLOW_MS};
      return {factory,items,resources:resources(),gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
    });
    const screenshots=[];
    for(const [name,zoom] of [['normal',1.5],['close',2],['four-colors',1.8]]){
      await page.evaluate(({name,zoom})=>{
        const m=__snakeLight,{scene}=m;scene.zoom=scene.targetZoom=zoom;scene.resetCamera=true;
        if(name==='normal'){m.render(m.opening);return;}
        const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14?'#':'.').join(''));
        const colors=name==='close'?[m.colors[2]]:m.colors;
        const snakes=colors.map((color,i)=>m.snake(200+i,Array.from({length:4},(_,n)=>({x:name==='close'?9:4+i*3,y:9-n})),color));
        const state={...m.clone(m.opening),maze,player:null,snakes,generation:2};scene.reset(state);
        for(let i=0;i<30;i++)m.render(state,1/60);
        scene.center.set(0,4);scene.resetCamera=false;m.render(state);
      },{name,zoom});
      const file=artifact(`${name}.png`);await page.screenshot({path:file});screenshots.push(file);
    }
    const bites=await page.evaluate(()=>{
      const m=__snakeLight,{scene,colors,clone,check}=m,results=[];
      const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14?'#':'.').join(''));
      scene.zoom=scene.targetZoom=1.5;
      for(const [i,color] of colors.entries()){
        const source=m.snake(10,Array.from({length:6},(_,n)=>({x:12-n,y:8})),color),player=m.player(6.35,8);
        const before={...clone(m.opening),generation:i+2,maze,time:999,player,snakes:[source],bites:[]};
        scene.reset(before);m.render(before);const expected=m.finishData(scene.snakes.get(10).finish);
        const shortened={...clone(source),body:source.body.slice(0,-1)};
        const event={id:1,time:1000,kind:'tail',index:5,snake:clone(source),playerId:1,player:{visual:{...player.visual},dir:{...player.dir}}};
        const after={...clone(before),time:1035,snakes:[shortened],bites:[event]};m.render(after);
        const slot=scene.bites.slots.find(s=>s.group.visible);check(slot,'The consumed tail remains visible while being eaten');
        m.finishCheck(slot.finish);check(JSON.stringify(m.finishData(slot.finish))===JSON.stringify(expected),'A swallowed piece retains its original finish and emission: '+color);
        const item=scene.snakes.get(10);m.checkItem(item);
        check(item.tail.morphTargetInfluences[0]>0&&item.tail.morphTargetInfluences[0]<1,'The tail shader is exercised during a real morph');
        check(Math.abs(item.coreTail.morphTargetInfluences[0]-item.tail.morphTargetInfluences[0])<1e-6,'Internal core follows the tail morph');
        const mid={...clone(after),time:1000+m.SWALLOW_MS*.5};m.render(mid);
        check(JSON.stringify(m.finishData(slot.finish))===JSON.stringify(expected),'Shrinking does not lose the bitten piece color');
        const frozen=JSON.stringify(scene.snakes.get(10).head.matrixWorld.toArray());for(let n=0;n<4;n++)m.render(mid);
        check(JSON.stringify(scene.snakes.get(10).head.matrixWorld.toArray())===frozen,'Paused luminous geometry stays fixed');
        results.push({color,finish:expected,morph:item.coreTail.morphTargetInfluences[0]});
      }
      const source=m.snake(20,[{x:12,y:5},{x:11,y:5},{x:10,y:5},{x:9,y:5},{x:8,y:5},{x:8,y:6},{x:8,y:7},{x:8,y:8}],colors[3]);
      const player=m.player(7.35,5),before={...clone(m.opening),generation:8,maze,time:999,player,snakes:[source],bites:[]};
      scene.reset(before);m.render(before);
      const front=m.snake(21,source.body.slice(0,4),source.color),rear=m.snake(22,source.body.slice(5).reverse(),source.color);
      const event={id:1,time:1000,kind:'body',index:4,snake:clone(source),playerId:1,player:{visual:{...player.visual},dir:{...player.dir}},
        fragments:[{snake:clone(front),sourceIndices:[0,1,2,3]},{snake:clone(rear),sourceIndices:[7,6,5]}]};
      m.render({...clone(before),time:1045,snakes:[front,rear],bites:[event]});
      for(const item of scene.snakes.values())m.checkItem(item);
      const newHead=scene.snakes.get(22);check(newHead.formerTail.visible&&newHead.coreFormerTail.visible,'A splitting fragment keeps its converting luminous former tail');
      check(Math.abs(newHead.formerTail.morphTargetInfluences[0]-newHead.coreFormerTail.morphTargetInfluences[0])<1e-6,'Converting tail core follows the shell morph');
      return {colors:results,split:true};
    });
    const lighting=await page.evaluate(()=>{
      const m=__snakeLight,{scene,THREE,gl,check}=m;
      const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14||(y===7&&x>=3&&x<=15)?'#':'.').join(''));
      const state={...m.clone(m.opening),generation:20,maze,player:null,snakes:[m.snake(101,[{x:10,y:8},{x:9,y:8},{x:8,y:8},{x:7,y:8}],m.colors[2])],bites:[],time:2400};
      scene.zoom=scene.targetZoom=2;scene.reset(state);for(let i=0;i<30;i++)m.render(state,1/60);
      const lights=scene.snakeLight.lights,intensities=lights.map(l=>l.intensity);
      check(lights.some(l=>l.isPointLight&&l.intensity>0),'A nearby snake activates actual colored point lights');
      const hidden=[];scene.scene.traverse(o=>{const mat=Array.isArray(o.material)?o.material[0]:o.material;
        if(o.visible&&mat?.transparent&&!mat.depthWrite){hidden.push(o);o.visible=false;}});
      const pixels=()=>{scene.wallMirrors.render(scene.scene,scene.camera);gl.finish();const a=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
        gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
      const on=pixels();lights.forEach(l=>l.intensity=0);const off=pixels();lights.forEach((l,i)=>l.intensity=intensities[i]);
      const originals=[],target=new THREE.WebGLRenderTarget(gl.drawingBufferWidth,gl.drawingBufferHeight,{type:THREE.UnsignedByteType});
      const flat=color=>new THREE.ShaderMaterial({uniforms:{idColor:{value:new THREE.Color(color)}},
        vertexShader:'void main(){vec4 p=vec4(position,1.);\n#ifdef USE_INSTANCING\np=instanceMatrix*p;\n#endif\ngl_Position=projectionMatrix*modelViewMatrix*p;}',
        fragmentShader:'uniform vec3 idColor;void main(){gl_FragColor=vec4(idColor,1.);}',toneMapped:false});
      const black=flat(0),blue=flat(0x0000ff),red=flat(0xff0000),mask=new Uint8Array(on.length);
      scene.scene.traverse(o=>{if(o.isMesh){originals.push([o,o.material]);o.material=o.name==='stone-wall-blocks'?red:
        (o.isInstancedMesh&&o.count===scene.staticGroup.userData.pavingCount?blue:black);}});
      const shadow=scene.renderer.shadowMap.enabled;
      try{scene.renderer.shadowMap.enabled=false;scene.renderer.setRenderTarget(target);scene.renderer.render(scene.scene,scene.camera);
        scene.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,mask);
      }finally{scene.renderer.setRenderTarget(null);scene.renderer.shadowMap.enabled=shadow;for(const [o,mat] of originals)o.material=mat;
        for(const o of hidden)o.visible=true;target.dispose();black.dispose();blue.dispose();red.dispose();}
      const results={floor:{pixels:0,changed:0,sum:[0,0,0],max:0},wall:{pixels:0,changed:0,sum:[0,0,0],max:0}};
      for(let i=0;i<mask.length;i+=4){const r=mask[i]>240?results.wall:mask[i+2]>240?results.floor:null;if(!r)continue;
        const difference=[0,1,2].map(c=>on[i+c]-off[i+c]);r.pixels++;for(let c=0;c<3;c++)r.sum[c]+=Math.max(0,difference[c]);
        const gain=Math.max(...difference);r.max=Math.max(r.max,gain);if(gain>3)r.changed++;}
      for(const [name,r] of Object.entries(results)){check(r.pixels>1000,'Real '+name+' surfaces must be visible');
        check(r.changed>20&&r.max>4,'Snake light must reach actual '+name+' geometry: '+JSON.stringify(r));
        check(r.sum[1]+r.sum[2]>r.sum[0]*1.1,'Cyan snake casts locally colored '+name+' light');}
      m.render(state);return {surfaces:results,lights:lights.map(l=>({color:l.color.getHex(),intensity:l.intensity,position:l.position.toArray()})),overlaysHidden:hidden.length};
    });
    const litPath=artifact('local-surfaces.png');await page.screenshot({path:litPath});screenshots.push(litPath);
    let lightingComparison=null;
    if(baseline){
      const active=lights=>lights.filter(light=>light.intensity>0),before=active(baseline.lighting.lights),after=active(lighting.lights);
      assert.equal(after.length,before.length,'Glass tuning retains the active local light sources');
      for(let i=0;i<after.length;i++){
        assert.equal(after[i].color,before[i].color,'Local illumination keeps the source snake color');
        assert.deepEqual(after[i].position,before[i].position,'Local illumination retains its source positions');
        assert.ok(Math.abs(after[i].intensity-before[i].intensity)<1e-9,'Glass tuning preserves the actual warmed point-light strength');
      }
      lightingComparison={baseline:path.resolve(baselinePath),activeSources:after.length,unchanged:true};
    }
    const lifecycle=await page.evaluate(()=>{
      const m=__snakeLight,{scene,check}=m,pool=[...scene.snakeLight.lights],cycles=[];
      scene.zoom=scene.targetZoom=1.5;
      for(let i=0;i<6;i++){
        const prior=[...scene.snakes.values()],owned=new Set(prior.flatMap(item=>['material','skinMaterial','accentMaterial','coreMaterial'].map(k=>item.finish[k])));
        let disposed=0;for(const material of owned)material.addEventListener('dispose',()=>disposed++);
        scene.reset(m.opening);m.render(m.opening);check(disposed===owned.size,'Restart disposes every removed snake finish');
        check(scene.snakeLight.lights.length===pool.length&&pool.every((l,i)=>l===scene.snakeLight.lights[i]),'Restart reuses the fixed local-light pool');
        check(pool.every(light=>light.parent),'Pooled lights stay attached to the scene');
        scene.setMirrorWalls(false);m.render(m.opening);scene.setMirrorWalls(true);m.render(m.opening);
        cycles.push(m.resources());
      }return cycles;
    });
    for(const row of lifecycle.slice(1))for(const key of ['geometries','textures','programs','lightCount'])
      assert.equal(row[key],lifecycle[0][key],`Restarts retain stable ${key}`);
    assert.deepEqual(errors,[],'No browser, transmission or mirror shader errors');
    const report={initial,bites,lighting,lightingComparison,lifecycle,screenshots,errors};
    const reportPath=artifact('report.log');fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({reportPath,initial,bites,lighting,lightingComparison,lifecycle:lifecycle.map(r=>({geometries:r.geometries,textures:r.textures,programs:r.programs,lights:r.lightCount})),errors}));
    await context.close();
  }catch(error){for(const context of browser.contexts())for(const page of context.pages())
    await page.screenshot({path:artifact('failure.png')}).catch(()=>{});throw error;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
