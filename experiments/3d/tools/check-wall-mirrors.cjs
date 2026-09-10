// Real WebGL mirror pixels, render-pass safety and bounded resource checks.
// All screenshots are unsigned-byte PNGs; timings are local measurements,
// with CPU submissions separated from the final gl.finish completion wait.
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const frameOption=process.argv.indexOf('--frames');
const frames=frameOption<0?90:Number(process.argv[frameOption+1]);
assert.ok(Number.isInteger(frames)&&frames>=30,'Measure at least30 frames');
const sizes=process.argv.includes('--4k')?[[1920,1080],[3840,2160]]:[[1920,1080]];
const origin=new URL(process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/').origin;

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    for(const [width,height] of sizes){
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.route(url=>url.pathname==='/__wall-mirror-check__',route=>route.fulfill({contentType:'text/html',
        body:'<!doctype html><style>html,body{margin:0;background:#060913}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
      await page.goto(origin+'/__wall-mirror-check__');
      const initial=await page.evaluate(async()=>{
        const began=performance.now(),THREE=await import('/experiments/3d/vendor/three.module.min.js');
        const {DuskScene}=await import('/experiments/3d/renderer.mjs');
        const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
        const scene=new DuskScene(document.getElementById('world'));
        const state={generation:1,started:true,maze:CONCEPT_MAZE,cols:19,rows:15,time:2400,paused:true,bites:[],predations:[],
          player:{id:1,...PLAYER_SPAWN,visual:{x:4,y:11},mouthOpen:true,dead:false,hidden:false,shield:false},
          snakes:CONCEPT_SNAKES.map((s,i)=>({id:i+1,color:s.color,body:s.body.map(p=>({...p})),
            dir:{x:s.body[0].x-s.body[1].x,y:s.body[0].y-s.body[1].y},motion:null,reversing:false}))};
        scene.zoom=scene.targetZoom=1.5;scene.tiltDegrees=scene.targetTiltDegrees=45;
        scene.reset(state);const built=performance.now();scene.render(state,0);
        const gl=scene.renderer.getContext();gl.finish();
        const extension=gl.getExtension('WEBGL_debug_renderer_info');
        const gpu={renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
          version:gl.getParameter(gl.VERSION),samples:gl.getParameter(gl.SAMPLES)};
        const check=(condition,message)=>{if(!condition)throw new Error(message);};
        const pixels=()=>{const result=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
          gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,result);return result;};
        const render=enabled=>{scene.setMirrorWalls(enabled);scene.render(state,0);gl.finish();
          check(gl.getError()===gl.NO_ERROR,'A mirror render must not produce WebGL errors');return pixels();};
        const resources=()=>({...scene.diagnostics(),programs:scene.renderer.info.programs.length});
        const mask=()=>{
          const renderer=scene.renderer,w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const target=new THREE.WebGLRenderTarget(w,h,{type:THREE.UnsignedByteType,depthBuffer:true});
          const black=new THREE.MeshBasicMaterial({color:0x000000,toneMapped:false});
          const blue=new THREE.ShaderMaterial({vertexShader:'void main(){vec4 p=vec4(position,1.);\n#ifdef USE_INSTANCING\np=instanceMatrix*p;\n#endif\ngl_Position=projectionMatrix*modelViewMatrix*p;}',
            fragmentShader:'void main(){gl_FragColor=vec4(0.,0.,1.,1.);}',toneMapped:false});
          const faces=new THREE.ShaderMaterial({vertexShader:'attribute float mirrorSide;varying float side;void main(){side=mirrorSide;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader:'varying float side;void main(){gl_FragColor=side>.5?vec4(1.,0.,0.,1.):vec4(0.,1.,0.,1.);}',toneMapped:false});
          const originals=[],hidden=[];
          scene.scene.traverse(o=>{
            if(o.isMesh){originals.push([o,o.material]);const old=Array.isArray(o.material)?o.material[0]:o.material;
              if(o.visible&&old.transparent&&!old.depthWrite){hidden.push(o);o.visible=false;}
              o.material=o.name==='stone-wall-blocks'?faces:
                (o.isInstancedMesh&&o.count===scene.staticGroup.userData.pavingCount?blue:black);}
          });
          const prior=renderer.getRenderTarget(),shadows=renderer.shadowMap.enabled,background=scene.scene.background;
          const result=new Uint8Array(w*h*4);
          try{scene.scene.background=null;renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);
            renderer.render(scene.scene,scene.camera);renderer.readRenderTargetPixels(target,0,0,w,h,result);
          }finally{renderer.setRenderTarget(prior);renderer.shadowMap.enabled=shadows;scene.scene.background=background;
            for(const [o,m] of originals)o.material=m;for(const o of hidden)o.visible=true;
            target.dispose();black.dispose();blue.dispose();faces.dispose();}
          // Remove edge pixels where multisampling mixes two surfaces.
          const interior=new Uint8Array(w*h);
          const category=i=>result[i*4]>200?1:result[i*4+1]>200?2:result[i*4+2]>200?3:0;
          for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
            const i=y*w+x,c=category(i);if(c&&[-2,0,2].every(dy=>[-2,0,2].every(dx=>category(i+dy*w+dx)===c)))interior[i]=c;
          }return interior;
        };
        const compare=(a,b,mask)=>{
          const result={side:{pixels:0,changed:0,max:0,sum:0},top:{pixels:0,changed:0,max:0,sum:0},floor:{pixels:0,changed:0,max:0,sum:0}};
          for(let i=0;i<mask.length;i++){const name=['','side','top','floor'][mask[i]];if(!name)continue;
            const delta=Math.max(...[0,1,2].map(c=>Math.abs(a[i*4+c]-b[i*4+c]))),r=result[name];
            r.pixels++;r.max=Math.max(r.max,delta);r.sum+=delta;if(delta>3)r.changed++;}
          for(const r of Object.values(result))r.mean=r.sum/Math.max(1,r.pixels);return result;
        };
        const safety=()=>{
          const renderer=scene.renderer,mirrors=scene.wallMirrors,original=renderer.render,passes=[];
          renderer.render=function(...args){const target=this.getRenderTarget(),u=mirrors.uniforms;
            const capture=!!target&&target===mirrors.target;
            const colorBound=!!mirrors.planar.uniforms.wallPlanarColor.value;
            passes.push({capture,ready:u.wallMirrorReady.value,colorBound});
            if(capture)check(!u.wallMirrorReady.value&&!colorBound,'Capture cannot sample its attached atlas');
            return original.apply(this,args);};
          try{render(true);}finally{renderer.render=original;}
          check(passes.length===1+mirrors.planar.selected.length&&passes[0].capture&&!passes.at(-1).capture,'Every exposed visible plane uses one capture, then one main render');
          check(passes.at(-1).ready===1&&passes.at(-1).colorBound,'Main view samples the completed atlas');
          check(mirrors.target.depthBuffer&&!mirrors.target.depthTexture,'Planar captures depth-test without screen-space depth sampling');
          check(mirrors.target.width<=8192&&mirrors.target.height<=2304,'Reflection atlas remains bounded');
          check(renderer.getRenderTarget()===null,'Main render target is restored');return passes;
        };
        window.__mirror={THREE,scene,state,opening:JSON.parse(JSON.stringify(state)),gl,check,pixels,render,resources,mask,compare,safety};
        return {buildMs:built-began,firstRenderMs:performance.now()-built,totalMs:performance.now()-began,gpu,diagnostics:resources()};
      });
      const screenshots=[];
      for(const pose of ['opening','close']){
        const differences=await page.evaluate(pose=>{
          const m=__mirror,{scene}=m;scene.zoom=scene.targetZoom=pose==='close'?2:1.5;scene.resetCamera=true;
          const frozen=JSON.stringify(m.state),off=m.render(false),mask=m.mask(),on=m.render(true),difference=m.compare(off,on,mask);
          m.check(JSON.stringify(m.state)===frozen,'Rendering and toggling cannot alter the snapshot');
          for(const name of ['top','floor']){const r=difference[name];m.check(r.pixels>1000,name+' mask must contain real visible pixels');
            m.check(r.changed<=Math.max(4,r.pixels*.0001)&&r.mean<.02,name+' pixels must remain unchanged by mirrors: '+JSON.stringify(r));}
          m.check(difference.side.changed>30,'Mirror mode must visibly affect vertical sides');
          return {difference,safety:m.safety()};
        },pose);
        for(const mode of ['off','on']){
          await page.evaluate(mode=>__mirror.render(mode==='on'),mode);
          const file=path.join(root,`preview-mirrors-${mode}-${width}-${pose}.png`);await page.screenshot({path:file});screenshots.push(file);
        }
        initial[pose]=differences;
      }
      const reflection=await page.evaluate(()=>{
        const m=__mirror,{THREE,scene,state}=m;
        state.maze=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>
          x===0||x===18||y===0||y===14||(y===7&&x>=3&&x<=15)?'#':'.').join(''));
        state.snakes=[];state.player=null;state.generation++;scene.zoom=scene.targetZoom=2;scene.reset(state);
        const marker=new THREE.Mesh(new THREE.BoxGeometry(.8,.6,.5),new THREE.MeshBasicMaterial({color:0x00ff00,toneMapped:false}));
        marker.name='Reflection test marker';marker.position.set(-1.3,.30,1.05);scene.scene.add(marker);
        m.marker=marker;const measurements=[];
        for(const x of [-1.3,1.3]){
          marker.position.x=x;const off=m.render(false),mask=m.mask(),on=m.render(true);let count=0,sumX=0,direct=0;
          for(let i=0;i<mask.length;i++){
            const k=i*4;if(off[k+1]>120&&off[k+1]>off[k]+60&&off[k+1]>off[k+2]+60)direct++;
            if(mask[i]===1&&on[k+1]-off[k+1]>12&&on[k+1]>on[k]*1.35&&on[k+1]>on[k+2]*1.2){count++;sumX+=i%m.gl.drawingBufferWidth;}
          }
          measurements.push({x,reflectionPixels:count,centroidX:sumX/Math.max(1,count),directPixels:direct});
          m.check(direct>100,'The reflection marker must be visible in the actual capture');
          m.check(count>16,'A visible nearby marker must produce colored pixels on the real wall side: '+JSON.stringify(measurements.at(-1)));
        }
        m.check(measurements[1].centroidX>measurements[0].centroidX+20,'Moving the marker moves its wall reflection');
        return {measurements,marker:{size:[.8,.6,.5],y:.30,z:1.05},camera:{zoom:scene.zoom,tilt:scene.tiltDegrees}};
      });
      for(const [pose,x] of [['marker-left',-1.3],['marker-right',1.3]]){
        await page.evaluate(x=>{__mirror.marker.position.x=x;__mirror.render(true);},x);
        const file=path.join(root,`preview-mirrors-${width}-${pose}.png`);await page.screenshot({path:file});screenshots.push(file);
      }
      const lifecycle=await page.evaluate(()=>{
        const m=__mirror,{scene,marker}=m;marker.removeFromParent();marker.geometry.dispose();marker.material.dispose();
        Object.assign(m.state,JSON.parse(JSON.stringify(m.opening)));scene.zoom=scene.targetZoom=1.5;scene.reset(m.state);
        const frozen=JSON.stringify(m.state),cycles=[];
        for(let i=0;i<6;i++){
          m.render(true);const target=scene.wallMirrors.target;let disposed=0;target.addEventListener('dispose',()=>disposed++);
          m.render(false);m.check(disposed===1&&scene.wallMirrors.target===null,'Disabling releases the reflection target once');
          const off=m.resources(),staticBefore=scene.staticGroup,snakesBefore=[...scene.snakes];
          scene.reset(m.state);m.render(true);const on=m.resources();
          m.check(scene.staticGroup===staticBefore&&snakesBefore.every(([id,item])=>scene.snakes.get(id)===item),'Same-maze restart reuses prepared walls and snake models');
          const target2=scene.wallMirrors.target;m.render(true);m.check(scene.wallMirrors.target===target2,'Paused frames reuse the reflection target');
          scene.targetZoom=1.7;for(let j=0;j<4;j++)scene.render(m.state,1/60);scene.zoom=scene.targetZoom=1.5;scene.resetCamera=true;
          m.render(true);m.check(JSON.stringify(m.state)===frozen,'Pause, camera zoom and rebuild cannot mutate gameplay state');
          cycles.push({off,on,safety:m.safety()});
        }return cycles;
      });
      for(const cycle of lifecycle.slice(1))for(const mode of ['off','on'])for(const key of ['geometries','textures','programs'])
        assert.equal(cycle[mode][key],lifecycle[0][mode][key],`${mode} rebuild/toggle resources remain stable: ${key}`);
      const timings=[];
      for(const enabled of [false,true])timings.push(await page.evaluate(async({enabled,frames})=>{
        const m=__mirror,{scene,gl}=m,renderer=scene.renderer,next=()=>new Promise(resolve=>requestAnimationFrame(resolve));
        scene.setMirrorWalls(enabled);scene.zoom=scene.targetZoom=1.5;scene.resetCamera=true;
        for(let i=0;i<30;i++){await next();scene.render(m.state,0);gl.finish();}
        const capture=[],final=[],cpu=[],completed=[],intervals=[];let last=null,passCapture=0,passFinal=0;
        const original=renderer.render;
        renderer.render=function(...args){const isCapture=!!this.getRenderTarget()&&this.getRenderTarget()===scene.wallMirrors.target;
          const start=performance.now(),result=original.apply(this,args),elapsed=performance.now()-start;
          if(isCapture)passCapture+=elapsed;else passFinal+=elapsed;return result;};
        try{for(let i=0;i<frames;i++){
          await next();const start=performance.now();if(last!==null)intervals.push(start-last);last=start;passCapture=passFinal=0;
          scene.render(m.state,0);const submitted=performance.now();gl.finish();const finished=performance.now();
          capture.push(passCapture);final.push(passFinal);cpu.push(submitted-start);completed.push(finished-start);
        }}finally{renderer.render=original;}
        const stats=values=>{const a=values.slice().sort((a,b)=>a-b);return {samples:a.length,p50:a[Math.floor((a.length-1)*.5)],
          p95:a[Math.floor((a.length-1)*.95)],max:a.at(-1),mean:a.reduce((s,x)=>s+x,0)/a.length};};
        return {enabled,captureCpuMs:stats(capture),finalCpuMs:stats(final),totalCpuMs:stats(cpu),
          completedMs:stats(completed),frameIntervalMs:stats(intervals),resources:m.resources()};
      },{enabled,frames}));
      assert.deepEqual(errors,[],'Mirror rendering must not report browser/WebGL errors');
      const report={resolution:{width,height},initial,reflection,lifecycle,timings,screenshots,errors,
        note:'CPU pass submissions and total gl.finish completion are distinct. Local headless measurements do not guarantee player FPS.'};
      const reportPath=path.join(root,`preview-mirrors-${width}-report.log`);fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
      console.log(JSON.stringify({reportPath,reflection,timings,errors}));await context.close();
    }
  }catch(error){
    for(const context of browser.contexts())for(const page of context.pages())
      await page.screenshot({path:path.join(root,'preview-mirrors-failure.png')}).catch(()=>{});
    throw error;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
