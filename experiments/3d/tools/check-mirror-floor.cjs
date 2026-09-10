// GPU diagnostic: decode reflected floor world coordinates, and compare them
// with a camera ray reflected at the physical wall (independent reflection law).
// The actual instanced paving geometry is retained throughout the check.
const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin=new URL(process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/').origin;

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1.5}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/__mirror-floor-check__',route=>route.fulfill({contentType:'text/html',
      body:'<!doctype html><style>html,body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
    await page.goto(origin+'/__mirror-floor-check__');
    const report=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {ProjectionCamera}=await import('/experiments/3d/projection-camera.mjs');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const scene=new DuskScene(document.getElementById('world'));
      const state={generation:1,cols:19,rows:15,time:2400,paused:true,bites:[],predations:[],player:null,snakes:[],
        maze:Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>
          x===0||x===18||y===0||y===14||(y===7&&x>=3&&x<=15)?'#':'.').join(''))};
      const check=(condition,message)=>{if(!condition)throw new Error(message);};
      scene.reset(state);scene.zoom=scene.targetZoom=1.5;scene.render(state,0);
      const renderer=scene.renderer,gl=renderer.getContext(),planar=scene.wallMirrors.planar;
      const floor=scene.staticGroup.children.find(object=>object.isInstancedMesh&&object.count===scene.staticGroup.userData.pavingCount);
      check(!!floor&&floor.material.isMeshPhysicalMaterial,'Fixture uses the real physical paving material');
      const original={material:floor.material,map:floor.material.map,instanceColor:floor.instanceColor,
        colors:floor.instanceColor.array.slice(),geometry:floor.geometry,visibility:[],background:scene.scene.background};
      const preserveFloor=()=>{
        check(floor.material===original.material,'Reflection capture must retain the actual physical floor material');
        check(floor.material.map===original.map,'Reflection capture must retain the mineral floor map');
        check(floor.instanceColor===original.instanceColor&&floor.instanceColor.array.every((value,i)=>value===original.colors[i]),
          'Reflection capture must retain every paving tile tint');
        check(floor.geometry===original.geometry,'Reflection capture must retain real instanced paving geometry');
      };
      let normalFloorCaptures=0;
      const render=renderer.render;
      renderer.render=function(...args){
        if(this.getRenderTarget()===planar.target){preserveFloor();normalFloorCaptures++;}
        return render.apply(this,args);
      };
      try{scene.wallMirrors.render(scene.scene,scene.camera);preserveFloor();}
      finally{renderer.render=render;}
      check(normalFloorCaptures>0,'Physical floor preservation is checked during actual reflection draws');

      const coordinates=new THREE.ShaderMaterial({toneMapped:false,clipping:true,
        vertexShader:`varying vec3 coordinate;
          #include <clipping_planes_pars_vertex>
          void main(){
            vec4 p=vec4(position,1.);
            #ifdef USE_INSTANCING
              p=instanceMatrix*p;
            #endif
            coordinate=(modelMatrix*p).xyz;
            vec4 mvPosition=modelViewMatrix*p;
            gl_Position=projectionMatrix*mvPosition;
            #include <clipping_planes_vertex>
          }`,
        fragmentShader:`varying vec3 coordinate;
          #include <clipping_planes_pars_fragment>
          void main(){
            #include <clipping_planes_fragment>
            gl_FragColor=vec4((coordinate.x+32.)/64.,(coordinate.z+32.)/64.,1.,1.);
          }`});
      scene.scene.traverse(object=>{if(object.isMesh||object.isSprite){original.visibility.push([object,object.visible]);object.visible=object===floor;}});
      scene.scene.background=new THREE.Color(0);floor.material=coordinates;
      const priorShadow=renderer.shadowMap.enabled;renderer.shadowMap.enabled=false;
      const rows=[],skipped=[];
      const ext=gl.getExtension('WEBGL_debug_renderer_info');
      const gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
      try{
        const raycaster=new THREE.Raycaster(),incident=new THREE.Vector3();
        floor.updateMatrixWorld(true);floor.geometry.computeBoundingBox();
        const floorMatrix=new THREE.Matrix4();floor.getMatrixAt(0,floorMatrix);
        const flatHeight=floorMatrix.elements[13]+floor.geometry.boundingBox.max.y*floorMatrix.elements[5];
        for(const projection of [0,.5,1])for(const tilt of [25,45,75]){
          const camera=new ProjectionCamera();
          camera.left=-20;camera.right=20;camera.top=14;camera.bottom=-14;camera.setProjection(projection);
          const angle=THREE.MathUtils.degToRad(tilt);
          camera.up.set(0,0,-1);camera.position.set(0,camera.focusDistance*Math.cos(angle),camera.focusDistance*Math.sin(angle));
          camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.getWorldDirection(incident);
          planar.uniforms.wallPlanarColor.value=null;
          planar.render(scene.scene,camera,[]);gl.finish();
          for(const side of projection?['front','side']:['front']){
          const slot=planar.selected.findIndex(entry=>side==='front'
            ?entry.plane.normal.z>.999&&Math.abs(entry.plane.constant+.636272)<.01
            :entry.plane.normal.x>.999&&entry.plane.constant>15);
          check(slot>=0,'The physical center wall front must have a reflection capture');
          const plane=planar.selected[slot].plane,matrix=planar.uniforms.wallPlanarMatrices.value[slot];
          const captureWidth=planar.tileWidth*planar.uniforms.wallPlanarScales.value[slot].x;
          const captureHeight=planar.tileHeight*planar.uniforms.wallPlanarScales.value[slot].y;
          const data=planar.target.texture.type===THREE.HalfFloatType?new Uint16Array(4):new Uint8Array(4);
          const decode=value=>data instanceof Uint16Array?THREE.DataUtils.fromHalfFloat(value):value/255;
          for(const height of [.22,.52,.82])for(const x of [-4.25,-1.23,2.17,4.3]){
            let q=side==='front'?new THREE.Vector3(x,height,-plane.constant):new THREE.Vector3(-plane.constant,height,x);
            const uv=q.clone().applyMatrix4(matrix);
            const pixelX=(slot%4)*planar.tileWidth+Math.floor((uv.x*.5+.5)*captureWidth);
            const pixelY=Math.floor(slot/4)*planar.tileHeight+Math.floor((uv.y*.5+.5)*captureHeight);
            // Locate the sampled texel's center on the physical wall, then
            // apply reflection law using the MAIN camera. At steep tilt a
            // fraction of a wall texel spans a sizeable floor distance.
            const ndcX=((pixelX%planar.tileWidth+.5)/captureWidth)*2-1;
            const ndcY=((pixelY%planar.tileHeight+.5)/captureHeight)*2-1;
            const inverse=matrix.clone().invert();
            const a=new THREE.Vector3(ndcX,ndcY,-1).applyMatrix4(inverse);
            const b=new THREE.Vector3(ndcX,ndcY,1).applyMatrix4(inverse);
            q=new THREE.Ray(a,b.sub(a).normalize()).intersectPlane(plane,new THREE.Vector3());
            check(!!q,'The sampled texel intersects the physical mirror');
            const reflectedDirection=(projection?q.clone().sub(camera.position).normalize():incident.clone()).reflect(plane.normal);
            const expected=q.clone().addScaledVector(reflectedDirection,(flatHeight-q.y)/reflectedDirection.y);
            raycaster.set(q.clone().addScaledVector(reflectedDirection,.0001),reflectedDirection);
            const hit=raycaster.intersectObject(floor,false)[0];
            renderer.readRenderTargetPixels(planar.target,pixelX,pixelY,1,1,data);
            check(gl.getError()===gl.NO_ERROR,'Linear atlas pixel read must succeed');
            const sample=Array.from(data,decode);
            if(!hit||sample[2]<.9){skipped.push({projection,side,tilt,x,height,reason:!hit?'ray meets a paving joint':'atlas pixel meets a paving joint'});continue;}
            const actual={x:sample[0]*64-32,z:sample[1]*64-32};
            const error=Math.hypot(actual.x-hit.point.x,actual.z-hit.point.z);
            rows.push({projection,side,tilt,x,height,wallZ:q.z,floorHeight:flatHeight,pixel:[pixelX,pixelY],
              expected:[expected.x,expected.z],meshIntersection:[hit.point.x,hit.point.z],actual:[actual.x,actual.z],error});
            check(error<.12,'Reflected floor coordinates disagree with the independent reflected ray: '+JSON.stringify(rows.at(-1)));
          }
          }
        }
      }finally{
        floor.material=original.material;scene.scene.background=original.background;
        for(const [object,visible] of original.visibility)object.visible=visible;
        renderer.shadowMap.enabled=priorShadow;coordinates.dispose();preserveFloor();
        scene.wallMirrors.render(scene.scene,scene.camera);renderer.setRenderTarget(null);
      }
      check(rows.length>=100,'At least 100 independent physical floor coordinates must be checked');
      for(const projection of [0,.5,1])for(const tilt of [25,45,75])check(rows.filter(row=>row.tilt===tilt&&row.projection===projection).length>=9,'Every tilt and projection has meaningful floor coverage');
      check(gl.getError()===gl.NO_ERROR,'Restored real materials render without WebGL errors');
      return {gpu,normalFloorCaptures,samples:rows.length,skipped,maxError:Math.max(...rows.map(row=>row.error)),rows};
    });
    const {rows,...summary}=report;
    const byTilt=[25,45,75].map(tilt=>({tilt,samples:rows.filter(row=>row.tilt===tilt).length,
      maxError:Math.max(...rows.filter(row=>row.tilt===tilt).map(row=>row.error))}));
    console.log(JSON.stringify({...summary,byTilt,...(process.argv.includes('--details')?{rows}:{}),errors},null,2));
    assert.deepEqual(errors,[],'GPU diagnostic must have no browser or shader errors');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
