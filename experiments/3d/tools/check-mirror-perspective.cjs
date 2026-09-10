// Verify final wall pixels (after projective lookup and tint), not merely the
// atlas. Black/red/green floor calibrations remove the fixed wall finish; a
// coordinate floor then identifies the physical surface seen in each mirror.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),record=process.argv.includes('--record');
const origin=new URL(process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/').origin;

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/__mirror-perspective__',route=>route.fulfill({contentType:'text/html',
      body:'<!doctype html><style>html,body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto(origin+'/__mirror-perspective__');
    const gpu=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
      const scene=new DuskScene(document.getElementById('world'));scene.setNeonLook('balanced');
      const state={generation:1,maze:CONCEPT_MAZE,cols:19,rows:15,time:2400,paused:true,bites:[],predations:[],
        player:{id:1,...PLAYER_SPAWN,visual:{x:4,y:11},dir:{x:0,y:-1},dead:false,hidden:false,shield:false},
        snakes:CONCEPT_SNAKES.map((snake,i)=>({id:i+1,color:snake.color,body:snake.body.map(p=>({...p})),dir:{x:0,y:1},motion:null,reversing:false}))};
      scene.reset(state);scene.render(state,0);
      const renderer=scene.renderer,gl=renderer.getContext();
      const floor=scene.staticGroup.children.find(object=>object.isInstancedMesh&&object.count===scene.staticGroup.userData.pavingCount);
      const wall=scene.staticGroup.getObjectByName('stone-wall-blocks');
      const originalFloor=floor.material,originalWall=wall.material;
      const coordinates=new THREE.ShaderMaterial({toneMapped:false,clipping:true,uniforms:{mode:{value:0}},
        vertexShader:`varying vec3 coordinate;
          #include <clipping_planes_pars_vertex>
          void main(){vec4 p=vec4(position,1.);
            #ifdef USE_INSTANCING
              p=instanceMatrix*p;
            #endif
            coordinate=(modelMatrix*p).xyz;vec4 mvPosition=modelViewMatrix*p;
            gl_Position=projectionMatrix*mvPosition;
            #include <clipping_planes_vertex>
          }`,
        fragmentShader:`uniform int mode;varying vec3 coordinate;
          #include <clipping_planes_pars_fragment>
          void main(){
            #include <clipping_planes_fragment>
            vec3 color=mode==0?vec3(0.):mode==1?vec3(1.,0.,0.):mode==2?vec3(0.,1.,0.):vec3((coordinate.x+32.)/64.,(coordinate.z+32.)/64.,0.);
            gl_FragColor=vec4(color,1.);
          }`});
      const wallMask=new THREE.ShaderMaterial({toneMapped:false,
        vertexShader:`attribute float mirrorSide;varying float side;varying vec3 world;varying vec3 face;
          void main(){side=mirrorSide;world=(modelMatrix*vec4(position,1.)).xyz;face=mat3(modelMatrix)*normal;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`varying float side;varying vec3 world;varying vec3 face;
          void main(){float code=0.;if(side>.999){if(face.z>.999)code=1.;else if(face.z<-.999)code=2.;else if(face.x>.999)code=3.;else if(face.x<-.999)code=4.;}
            gl_FragColor=vec4(world,code);}`});
      const black=new THREE.MeshBasicMaterial({color:0,toneMapped:false});
      const target=new THREE.WebGLRenderTarget(gl.drawingBufferWidth,gl.drawingBufferHeight,{type:THREE.FloatType});
      target.texture.colorSpace=THREE.LinearSRGBColorSpace;
      floor.geometry.computeBoundingBox();const instance=new THREE.Matrix4();floor.getMatrixAt(0,instance);
      const floorHeight=instance.elements[13]+floor.geometry.boundingBox.max.y*instance.elements[5];
      const configure=({projection,tilt,panX=0,panZ=0})=>{
        const camera=scene.camera,angle=tilt*Math.PI/180,viewH=23,viewW=viewH*gl.drawingBufferWidth/gl.drawingBufferHeight;
        camera.left=-viewW/2;camera.right=viewW/2;camera.top=viewH/2;camera.bottom=-viewH/2;camera.setProjection(projection);
        camera.position.set(panX,camera.focusDistance*Math.cos(angle),panZ+camera.focusDistance*Math.sin(angle));
        camera.lookAt(panX,0,panZ);camera.updateMatrixWorld();
      };
      const appearance=config=>{configure(config);floor.material=originalFloor;renderer.setRenderTarget(null);
        scene.wallMirrors.render(scene.scene,scene.camera);gl.finish();};
      window.floorCheck={THREE,scene,renderer,gl,floor,wall,originalFloor,originalWall,coordinates,wallMask,black,target,floorHeight,configure,appearance};
      const extension=gl.getExtension('WEBGL_debug_renderer_info');
      return extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    });
    const rows=[],screenshots=[];
    for(const tilt of [45,75])for(const projection of [0,.5,1]){
      const config={projection,tilt,panX:tilt===75?3:0,panZ:tilt===75?1.5:0};
      await page.evaluate(config=>floorCheck.appearance(config),config);
      const file=path.join(root,`preview-mirror-perspective-${record?'before':'after'}-${projection*100}-${tilt}.png`);
      await page.screenshot({path:file});screenshots.push(file);
      rows.push(await page.evaluate(config=>{
        const {THREE,scene,renderer,gl,floor,wall,coordinates,wallMask,black,target,floorHeight,configure}=floorCheck;
        configure(config);
        const width=target.width,height=target.height;
        const prior={tone:renderer.toneMapping,space:renderer.outputColorSpace,material:floor.material,wall:wall.material,
          shadows:renderer.shadowMap.enabled,target:renderer.getRenderTarget()};
        const pixels=()=>{const result=new Float32Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,result);return result;};
        const renderMode=mode=>{coordinates.uniforms.mode.value=mode;renderer.setRenderTarget(target);
          scene.wallMirrors.render(scene.scene,scene.camera);gl.finish();return pixels();};
        let mask,calibrations,coded;
        try{
          renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
          const originals=[];scene.scene.traverse(object=>{if(object.isMesh||object.isSprite){originals.push([object,object.material,object.visible]);
            if(object.material?.transparent&&!object.material.depthWrite)object.visible=false;
            object.material=object===wall?wallMask:black;}});
          try{renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);renderer.render(scene.scene,scene.camera);mask=pixels();}
          finally{for(const [object,material,visible] of originals){object.material=material;object.visible=visible;}renderer.shadowMap.enabled=prior.shadows;}
          floor.material=coordinates;
          calibrations=[renderMode(0),renderMode(1),renderMode(2)];coded=renderMode(3);
        }finally{
          floor.material=prior.material;wall.material=prior.wall;renderer.toneMapping=prior.tone;renderer.outputColorSpace=prior.space;
          renderer.shadowMap.enabled=prior.shadows;renderer.setRenderTarget(prior.target);
        }
        const [baseline,red,green]=calibrations,planar=scene.wallMirrors.planar;
        const normals=[null,new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1),new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0)];
        const raycaster=new THREE.Raycaster(),q=new THREE.Vector3(),reflected=new THREE.Vector3(),hits=[];
        const gainR=index=>red[index]-baseline[index],gainG=index=>green[index+1]-baseline[index+1];
        let candidates=0;
        for(let y=3;y<height-3;y+=3)for(let x=3;x<width-3;x+=3){
          const index=(y*width+x)*4,code=Math.round(mask[index+3]);if(!normals[code])continue;
          const gr=gainR(index),gg=gainG(index);if(gr<.08||gg<.08)continue;
          if(![[2,0],[-2,0],[0,2],[0,-2]].every(([dx,dy])=>{
            const other=((y+dy)*width+x+dx)*4;
            return Math.round(mask[other+3])===code&&Math.abs(gainR(other)-gr)<gr*.15&&Math.abs(gainG(other)-gg)<gg*.15;
          }))continue;
          const normal=normals[code];q.set(mask[index],mask[index+1],mask[index+2]);
          const entry=planar.selected.find(entry=>entry.plane.normal.dot(normal)>.999&&Math.abs(entry.plane.distanceToPoint(q))<.015);
          if(!entry)continue;
          candidates++;
          raycaster.setFromCamera(new THREE.Vector2((x+.5)/width*2-1,(y+.5)/height*2-1),scene.camera);
          if(!raycaster.ray.intersectPlane(entry.plane,q))continue;
          reflected.copy(raycaster.ray.direction).reflect(normal);if(reflected.y>=-.001)continue;
          const expected=q.clone().addScaledVector(reflected,(floorHeight-q.y)/reflected.y);
          const decoded=new THREE.Vector3((coded[index]-baseline[index])/gr*64-32,floorHeight,
            (coded[index+1]-baseline[index+1])/gg*64-32);
          const error=Math.hypot(decoded.x-expected.x,decoded.z-expected.z);
          hits.push({pixel:[x,y],normal:normal.toArray(),wall:q.toArray(),expected:[expected.x,expected.z],actual:[decoded.x,decoded.z],error});
        }
        const ordered=hits.toSorted((a,b)=>a.error-b.error),maximum=ordered.at(-1)?.error??Infinity;
        const result={...config,candidates,samples:hits.length,planes:planar.selected.length,
          front:hits.filter(hit=>hit.normal[2]!==0).length,lateral:hits.filter(hit=>hit.normal[0]!==0).length,
          median:ordered[Math.floor(ordered.length*.5)]?.error??Infinity,p95:ordered[Math.floor(ordered.length*.95)]?.error??Infinity,
          maximum,worst:ordered.slice(-4),webglError:gl.getError()};
        floorCheck.appearance(config);return result;
      },config));
      console.log(JSON.stringify(rows.at(-1)));
    }
    const report={gpu,rows,screenshots,errors};
    fs.writeFileSync(path.join(root,`preview-mirror-perspective-${record?'before':'after'}.log`),JSON.stringify(report,null,2));
    assert.deepEqual(errors,[]);
    if(!record)for(const row of rows){assert.ok(row.samples>=50,'Final wall pixels contain enough independent floor samples');
      assert.ok(row.p95<.15,`Final reflected floor coordinates agree with reflected camera rays: ${JSON.stringify(row)}`);assert.equal(row.webglError,0);}
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
