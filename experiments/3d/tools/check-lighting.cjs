// Measure actual snake pixels, excluding floor stamps, under a directed light.
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const captureOnly=process.argv.includes('--before'),suffix=captureOnly?'before':'after';
const baselineIndex=process.argv.indexOf('--baseline-renderer');
const baselineRenderer=baselineIndex<0?null:process.argv[baselineIndex+1];
if(baselineIndex>=0&&!baselineRenderer)throw new Error('--baseline-renderer requires a saved renderer source path');

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    if(captureOnly&&baselineRenderer)await page.route('**/experiments/3d/renderer.mjs',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(baselineRenderer,'utf8')}));
    await page.route('**/__lighting-check__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;background:#060913}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto('http://127.0.0.1:8093/__lighting-check__');
    await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
      const scene=new DuskScene(document.getElementById('world'));
      const snakes=CONCEPT_SNAKES.map((s,i)=>({id:i+1,color:s.color,body:s.body.map(p=>({...p})),dir:{x:s.body[0].x-s.body[1].x,y:s.body[0].y-s.body[1].y},motion:null,reversing:false}));
      const player={id:1,...PLAYER_SPAWN,visual:{x:4,y:11},mouthOpen:true,dead:false,hidden:false,shield:false};
      const state={generation:1,started:true,maze:CONCEPT_MAZE,cols:19,rows:15,time:1100,player,snakes,paused:true,bites:[],predations:[]};
      scene.reset(state);scene.render(state,0);
      window.__lighting={THREE,scene,state};
    });
    await page.screenshot({path:`experiments/3d/preview-lighting-${suffix}-overview.png`});
    const result=await page.evaluate(captureOnly=>{
      const {THREE,scene}=window.__lighting,failures=[],headings=[];let checks=0;
      const assert=(condition,message)=>{checks++;if(!condition&&failures.length<25)failures.push(message);};
      const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14?'#':'.').join(''));
      const player={id:1,x:5,y:7,visual:{x:5,y:7},dir:{x:1,y:0},mouthOpen:true,dead:false,hidden:false,shield:false};
      const heads=[{id:101,x:7,y:6.7,name:'near'},{id:102,x:9.2,y:7.5,name:'far'},{id:103,x:7.5,y:10,name:'offAxis'},{id:104,x:9.2,y:5.6,name:'offset'}];
      const snakes=heads.map(({id,x,y})=>({id,color:'#079ed1',body:[{x,y}],dir:{x:-1,y:0},motion:null,reversing:false}));
      const state={generation:1,started:true,maze,cols:19,rows:15,time:1100,player,snakes,paused:true,bites:[],predations:[]};
      scene.reset(state);scene.render(state,0);
      function fixedCamera(){
        const focus=new THREE.Vector3(-2,.55,2);
        scene.camera.left=-9;scene.camera.right=9;scene.camera.top=6;scene.camera.bottom=-6;
        scene.camera.position.copy(focus).add(new THREE.Vector3(-12,15,20));scene.camera.lookAt(focus);scene.camera.updateProjectionMatrix();
      }
      function aim(dir){player.dir={...dir};scene.playerYaw=Math.atan2(dir.x,dir.y);scene.render(state,0);fixedCamera();scene.vapor.update(state.time,scene.player.position,scene.playerYaw,true,scene.camera);scene.renderer.render(scene.scene,scene.camera);}
      aim({x:1,y:0});
      const width=1000,height=666,target=new THREE.WebGLRenderTarget(width,height,{samples:4});target.texture.colorSpace=THREE.SRGBColorSpace;
      const pixels=()=>{const values=new Uint8Array(width*height*4);scene.renderer.setRenderTarget(target);scene.renderer.render(scene.scene,scene.camera);scene.renderer.readRenderTargetPixels(target,0,0,width,height,values);scene.renderer.setRenderTarget(null);return values;};
      const masks=new Map(),maskMaterial=new THREE.MeshBasicMaterial({color:0xffffff});
      const oldBackground=scene.scene.background,oldOverride=scene.scene.overrideMaterial,oldClear=scene.renderer.getClearColor(new THREE.Color()),oldClearAlpha=scene.renderer.getClearAlpha();
      const visibility=scene.scene.children.map(child=>[child,child.visible]);
      for(const head of heads){
        for(const [child] of visibility)child.visible=child===scene.snakes.get(head.id).group;
        scene.scene.background=null;scene.renderer.setClearColor(0x000000,1);scene.scene.overrideMaterial=maskMaterial;
        const image=pixels(),mask=[];for(let i=0;i<image.length;i+=4)if(image[i]>128&&image[i+1]>128&&image[i+2]>128)mask.push(i);
        masks.set(head.id,mask);assert(mask.length>200,`${head.name} snake has too few pixels for a brightness measurement`);
      }
      for(const [child,visible] of visibility)child.visible=visible;
      scene.scene.background=oldBackground;scene.scene.overrideMaterial=oldOverride;scene.renderer.setClearColor(oldClear,oldClearAlpha);maskMaterial.dispose();
      const linear=byte=>{const s=byte/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;};
      function measure(image){return Object.fromEntries(heads.map(head=>{
        const mask=masks.get(head.id);let total=0;
        for(const i of mask)total+=.2126*linear(image[i])+.7152*linear(image[i+1])+.0722*linear(image[i+2]);
        return [head.name,{pixels:mask.length,luminance:total/mask.length}];
      }));}
      function lightingPixels(){
        // A projected glow or a vapor sprite crossing a mesh is not evidence
        // that illumination reached the mesh material itself.
        const overlays=[scene.beam,scene.halo,scene.vapor.group,scene.bites.bloom.group,scene.predation.bloom.group].map(object=>[object,object.visible]);
        for(const [object] of overlays)object.visible=false;
        const image=pixels();for(const [object,visible] of overlays)object.visible=visible;
        return image;
      }
      const sceneLights=()=>{const found=[];scene.scene.traverse(object=>{if(object.isLight)found.push(object);});return found;};
      const lightPose=light=>JSON.stringify({position:light.position.toArray(),target:light.target?.position.toArray()});
      aim({x:1,y:0});const toward=measure(lightingPixels()),towardLightPoses=new Map(sceneLights().map(light=>[light,lightPose(light)]));
      aim({x:-1,y:0});const away=measure(lightingPixels());
      const ratios=Object.fromEntries(heads.map(head=>[head.name,toward[head.name].luminance/Math.max(.000001,away[head.name].luminance)]));
      const lights=sceneLights(),playerLights=lights.filter(light=>lightPose(light)!==towardLightPoses.get(light));
      const globals=lights.filter(light=>light.isDirectionalLight||light.isHemisphereLight).map(light=>({type:light.type,intensity:light.intensity}));
      const overheadPools=(scene.lighting.pools??[]).map(light=>({height:light.position.y,radius:Math.tan(light.angle)*light.position.y,position:light.position.toArray(),target:light.target.position.toArray()}));
      let wallBlocking=null;
      function barrier(enabled){
        for(const y of [7,8]){const row=[...maze[y]];row[8]=enabled?'#':'.';maze[y]=row.join('');}
        scene.reset(state);aim({x:1,y:0});
      }
      if(!captureOnly){
        assert(ratios.near>1.10,'Aiming the flashlight did not materially brighten the nearby snake’s actual pixels');
        assert(ratios.far>1.05,'The longer flashlight did not brighten snake geometry farther down the corridor');
        assert(ratios.offset>1.05,'The broader flashlight did not reach a head offset from its center line');
        assert(away.offAxis.luminance>.003,'An unlit snake is too dark to read');
        assert(playerLights.some(light=>light.isSpotLight),'The forward lamp has no real directed mesh illumination');
        assert(scene.glow.isPointLight&&scene.glow.intensity>0&&scene.glow.intensity<scene.flashlight.intensity*.02,
          'The near light should provide a soft local fill while the directed flashlight supplies the strong illumination');
        assert(overheadPools.length>=2,'The dark scene is missing its separated overhead light pools');
        for(const [i,pool] of overheadPools.entries()){
          assert(pool.height>0&&Math.hypot(pool.position[0]-pool.target[0],pool.position[2]-pool.target[2])<1e-6&&pool.target[1]<pool.height,'An overhead lamp is not aimed down at its local floor area');
          for(const previous of overheadPools.slice(0,i))assert(Math.hypot(pool.position[0]-previous.position[0],pool.position[2]-previous.position[2])>pool.radius+previous.radius,'Overhead cones overlap into one broad wash of light');
        }
        barrier(true);
        const blockedToward=measure(lightingPixels());
        const probe=scene.beam.worldToLocal(new THREE.Vector3(scene.layout.x(8.6),.026,scene.layout.z(7.15)));
        const baseImage=scene.beam.userData.baseImage,maskedImage=scene.beam.material.map.image;
        const x=Math.floor((probe.x/scene.beam.geometry.parameters.width+.5)*maskedImage.width),y=Math.floor((.5-probe.y/scene.beam.geometry.parameters.height)*maskedImage.height);
        const originalAlpha=baseImage.getContext('2d').getImageData(x,y,1,1).data[3],blockedAlpha=maskedImage.getContext('2d').getImageData(x,y,1,1).data[3];
        assert(originalAlpha>5&&blockedAlpha<originalAlpha*.2,'Ground light stamp leaked through a wall');
        aim({x:-1,y:0});const blockedAway=measure(lightingPixels());
        const clearContribution=toward.far.luminance-away.far.luminance,blockedContribution=blockedToward.far.luminance-blockedAway.far.luminance;
        assert(blockedContribution<clearContribution*.7,'A blocking wall did not reduce the real light on snake geometry behind it');
        wallBlocking={originalAlpha,blockedAlpha,clearContribution,blockedContribution,remainingFraction:blockedContribution/Math.max(1e-9,clearContribution)};
        barrier(false);
        for(const dir of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
          aim(dir);const attribute=scene.beam.geometry.attributes.position,origin=scene.player.position;
          let near=Infinity,far=-Infinity;
          for(let i=0;i<attribute.count;i++){
            const p=new THREE.Vector3().fromBufferAttribute(attribute,i);scene.beam.localToWorld(p);p.sub(origin);
            const along=p.x*dir.x+p.z*dir.y;near=Math.min(near,along);far=Math.max(far,along);
          }
          const offset=scene.beam.position.clone().sub(origin),lateral=offset.x*dir.y-offset.z*dir.x;
          assert(Math.abs(lateral)<1e-5&&near>=-.35&&near<=.35&&far>=9.8&&far<=10.5,'The tripled beam is reversed, offset sideways, or has the wrong reach');
          for(const light of playerLights.filter(light=>light.isSpotLight)){
            const target=light.target.position.clone().sub(origin),ahead=target.x*dir.x+target.z*dir.y,across=target.x*dir.y-target.z*dir.x;
            assert(ahead>3&&Math.abs(across)<1e-5,'The real flashlight target points sideways or behind the player');
            assert(light.intensity>0&&light.distance>=10.2,'The real directed light cannot reach the end of the extended beam');
          }
          headings.push({dir,near,far,lateral});
        }
        const lightState=()=>JSON.stringify(playerLights.map(light=>[light.visible,light.intensity,...light.position.toArray(),...(light.target?.position.toArray()??[])]));
        const frozenLights=lightState(),frozenBeam=scene.beam.matrixWorld.toArray();
        scene.targetTiltDegrees=25;scene.targetZoom=1.9;
        for(let i=0;i<8;i++)scene.render(state,1/60);
        assert(lightState()===frozenLights&&JSON.stringify(scene.beam.matrixWorld.toArray())===JSON.stringify(frozenBeam),'Camera controls moved a paused world-space flashlight');
        scene.targetTiltDegrees=scene.tiltDegrees=45;scene.targetZoom=scene.zoom=1.5;
        const enabledPowers=playerLights.map(light=>light.intensity);
        for(const reason of ['dead','hidden']){
          player[reason]=true;scene.render(state,0);
          assert(!scene.beam.visible&&!scene.halo.visible&&playerLights.every(light=>!light.visible||light.intensity===0),`${reason} player retained an active flashlight component`);
          player[reason]=false;scene.render(state,0);
          assert(scene.beam.visible&&scene.halo.visible&&playerLights.every((light,i)=>light.visible&&light.intensity===enabledPowers[i]),`Flashlight did not restore after ${reason}`);
        }
        const originalLights=new Set(sceneLights());
        for(let i=0;i<3;i++){scene.reset(state);scene.render(state,0);}
        assert(sceneLights().length===originalLights.size&&sceneLights().every(light=>originalLights.has(light)),'Restart duplicated the overhead pools or flashlight rig');
      }
      target.dispose();
      window.__lighting={THREE,scene,state,aim,barrier,headings,failures,assert};
      return {checks,failures,toward,away,ratios,headings,globals,overheadPools,wallBlocking,playerLightCount:playerLights.length,renderer:scene.diagnostics()};
    },captureOnly);
    await page.evaluate(()=>window.__lighting.aim({x:1,y:0}));
    await page.screenshot({path:`experiments/3d/preview-lighting-${suffix}-toward.png`});
    await page.evaluate(()=>window.__lighting.aim({x:-1,y:0}));
    await page.screenshot({path:`experiments/3d/preview-lighting-${suffix}-away.png`});
    if(!captureOnly){
      await page.evaluate(()=>window.__lighting.barrier(true));
      await page.screenshot({path:'experiments/3d/preview-lighting-after-blocked.png'});
    }
    const surfaces=await page.evaluate(captureOnly=>{
      const {THREE,scene}=window.__lighting,failures=[];let checks=0;
      const assert=(condition,message)=>{checks++;if(!condition)failures.push(message);};
      const maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14||y===8&&x>=8&&x<=10?'#':'.').join(''));
      const player={id:1,x:7,y:11,visual:{x:7,y:11},dir:{x:0,y:-1},mouthOpen:true,dead:false,hidden:false,shield:false};
      const snake={id:201,color:'#079ed1',body:[5,6,7,8,9,10].map(y=>({x:7,y})),dir:{x:0,y:-1},motion:null,reversing:false};
      const offset={id:202,color:'#079ed1',body:[{x:8.15,y:6}],dir:{x:0,y:1},motion:null,reversing:false};
      const state={generation:2,started:true,maze,cols:19,rows:15,time:1100,player,snakes:[snake,offset],paused:true,bites:[],predations:[]};
      scene.reset(state);scene.render(state,0);
      function aim(dir){
        player.dir={...dir};scene.playerYaw=Math.atan2(dir.x,dir.y);scene.render(state,0);
        // The normal game view: 45 degrees down, without a diagnostic side yaw.
        const focus=new THREE.Vector3(-3,.4,2);
        scene.camera.left=-7.5;scene.camera.right=7.5;scene.camera.top=5;scene.camera.bottom=-5;
        scene.camera.position.copy(focus).add(new THREE.Vector3(0,16,16));scene.camera.lookAt(focus);scene.camera.updateProjectionMatrix();
        scene.vapor.update(state.time,scene.player.position,scene.playerYaw,true,scene.camera);scene.renderer.render(scene.scene,scene.camera);
      }
      aim({x:0,y:-1});
      const width=1200,height=800,target=new THREE.WebGLRenderTarget(width,height,{samples:4});target.texture.colorSpace=THREE.SRGBColorSpace;
      function pixels(){const data=new Uint8Array(width*height*4);scene.renderer.setRenderTarget(target);scene.renderer.render(scene.scene,scene.camera);scene.renderer.readRenderTargetPixels(target,0,0,width,height,data);scene.renderer.setRenderTarget(null);return data;}
      function lightingPixels(){
        const overlays=[scene.beam,scene.halo,scene.vapor.group,scene.bites.bloom.group,scene.predation.bloom.group].map(o=>[o,o.visible]);
        for(const [o]of overlays)o.visible=false;const data=pixels();for(const [o,v]of overlays)o.visible=v;return data;
      }
      const normalMaterial=new THREE.ShaderMaterial({toneMapped:false,uniforms:{clipMin:{value:new THREE.Vector3()},clipMax:{value:new THREE.Vector3()}},vertexShader:`
        varying vec3 surfaceNormal; varying vec3 surfacePosition;
        void main(){
          vec3 p=position; vec3 n=normal;
          #ifdef USE_INSTANCING
            p=(instanceMatrix*vec4(p,1.0)).xyz; n=mat3(instanceMatrix)*n;
          #endif
          vec4 world=modelMatrix*vec4(p,1.0); surfacePosition=world.xyz;
          surfaceNormal=normalize(mat3(modelMatrix)*n);
          gl_Position=projectionMatrix*viewMatrix*world;
        }`,fragmentShader:`
        varying vec3 surfaceNormal; varying vec3 surfacePosition; uniform vec3 clipMin; uniform vec3 clipMax;
        void main(){
          if(any(lessThan(surfacePosition,clipMin))||any(greaterThan(surfacePosition,clipMax)))discard;
          vec3 n=normalize(surfaceNormal);
          // Forward-facing bevels remain visible between connected armor.
          // Include them with the side faces, separately from upward flats.
          gl_FragColor=vec4(n.y>.9?1.0:0.0,n.z>.5&&abs(n.y)<.85?1.0:0.0,0.0,1.0);
        }`});
      const black=new THREE.MeshBasicMaterial({color:0,toneMapped:false});
      const armor=scene.snakes.get(201).plates,accents=scene.snakes.get(201).accents;
      const maskSets=[
        {name:'nearArmor',objects:new Set([armor,accents]),min:[-5.5,.15,3.05],max:[-2.5,2,4.95]},
        {name:'farArmor',objects:new Set([armor,accents]),min:[-5.5,.15,-.95],max:[-2.5,2,.95]},
        {name:'wall',objects:new Set(),min:[-2.7,.25,1.2],max:[-1.3,1.5,2.85]},
      ];
      scene.staticGroup.traverse(o=>{if(o.isMesh&&!o.material?.isMeshBasicMaterial)maskSets[2].objects.add(o);});
      const originals=[],sprites=[];
      scene.scene.traverse(o=>{if(o.isMesh)originals.push([o,o.material]);if(o.isSprite){sprites.push([o,o.visible]);o.visible=false;}});
      const oldBackground=scene.scene.background,oldClear=scene.renderer.getClearColor(new THREE.Color()),oldClearAlpha=scene.renderer.getClearAlpha();
      scene.scene.background=null;scene.renderer.setClearColor(0,1);
      const masks={};
      for(const spec of maskSets){
        for(const [o]of originals)o.material=spec.objects.has(o)?normalMaterial:black;
        normalMaterial.uniforms.clipMin.value.fromArray(spec.min);normalMaterial.uniforms.clipMax.value.fromArray(spec.max);
        const data=pixels(),top=[],face=[];
        for(let i=0;i<data.length;i+=4){if(data[i]>240&&data[i+1]<10)top.push(i);if(data[i+1]>240&&data[i]<10)face.push(i);}
        masks[spec.name+'Top']=top;masks[spec.name+'Face']=face;
        assert(top.length>80,`${spec.name} upward surface mask is too small: ${top.length}`);
        assert(face.length>60,`${spec.name} front surface mask is too small: ${face.length}`);
      }
      for(const [o,m]of originals)o.material=m;for(const [o,v]of sprites)o.visible=v;
      scene.scene.background=oldBackground;scene.renderer.setClearColor(oldClear,oldClearAlpha);
      normalMaterial.dispose();black.dispose();
      const linear=byte=>{const s=byte/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;};
      function measure(data){return Object.fromEntries(Object.entries(masks).map(([name,mask])=>{
        let total=0;for(const i of mask)total+=.2126*linear(data[i])+.7152*linear(data[i+1])+.0722*linear(data[i+2]);
        return[name,{pixels:mask.length,luminance:total/mask.length}];
      }));}
      aim({x:0,y:-1});const toward=measure(lightingPixels());
      aim({x:0,y:1});const away=measure(lightingPixels());
      const ratios=Object.fromEntries(Object.keys(masks).map(name=>[name,toward[name].luminance/Math.max(1e-9,away[name].luminance)]));
      if(!captureOnly){
        assert(ratios.nearArmorTop>1.20,'The raised flashlight did not clearly brighten nearby armor tops');
        assert(ratios.farArmorTop>1.10,'The raised flashlight did not reach armor tops farther along a long snake');
        assert(ratios.nearArmorFace>1.20,'Nearby snake armor faces did not receive real flashlight illumination');
        assert(ratios.wallTop>1.05,'The flashlight did not illuminate the top of the nearby wall');
        assert(ratios.wallFace>1.10,'The flashlight did not illuminate the wall face');
        assert(Object.values(away).every(sample=>sample.luminance>.001),'An unlit modeled surface became unreadably dark');
      }
      target.dispose();window.__lighting.surfaces={aim};
      return{checks,failures,toward,away,ratios};
    },captureOnly);
    await page.evaluate(()=>window.__lighting.surfaces.aim({x:0,y:-1}));
    await page.screenshot({path:`experiments/3d/preview-lighting-${suffix}-body-toward.png`});
    await page.evaluate(()=>window.__lighting.surfaces.aim({x:0,y:1}));
    await page.screenshot({path:`experiments/3d/preview-lighting-${suffix}-body-away.png`});
    console.log(JSON.stringify({errors,...result,surfaces},null,2));
    if(errors.length||result.failures.length||surfaces.failures.length)process.exitCode=1;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
