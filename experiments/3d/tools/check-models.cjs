// Exercise presentation topology independently of the game loop and its AI.
const path=require('node:path');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
    await page.route('**/__model-check__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>html,body{margin:0;background:#050913}canvas{width:100vw;height:100vh;display:block}</style></head><body><canvas id="world"></canvas></body></html>'}));
    await page.goto('http://127.0.0.1:8093/__model-check__');
    const result=await page.evaluate(async()=>{
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const {createSnakeHead,animateSnakeMouth}=await import('/experiments/3d/models/snake.mjs');
      const {snakeRoute,sampleSnake}=await import('/experiments/3d/motion.mjs');
      const {CELL_SIZE,MAX_ACTOR_RADIUS,worldLayout}=await import('/experiments/3d/world.mjs');
      const scene=new DuskScene(document.getElementById('world'));
      const failures=[],limits={player:0,head:0,tail:0,plates:0,accents:0};
      const jawRanges={player:[Infinity,-Infinity],snake:[Infinity,-Infinity]};
      const mouthBounds=[],independentMouths={maxDifference:0,differentFrames:0,ranges:[[Infinity,-Infinity],[Infinity,-Infinity]]};
      let checks=0,frames=0,vertices=0,sharedDisposals=0,connectionChecks=0;
      const straightPlateGap=[Infinity,-Infinity];
      const sharedGeometries=new Set(),temporary=new THREE.Matrix4(),inverse=new THREE.Matrix4(),point=new THREE.Vector3();
      const maze=Array.from({length:25},(_,y)=>Array.from({length:36},(_,x)=>x===0||x===35||y===0||y===24?'#':'.').join(''));
      // Raised walls around the arena make light/shadow failures visible too.
      for(const y of [5,17]){
        const row=[...maze[y]];for(let x=7;x<=28;x++) if(x<16||x>19) row[x]='#';maze[y]=row.join('');
      }
      const layout=worldLayout(maze);
      const player={id:1,x:21,y:13,visual:{x:21,y:13},dir:{x:0,y:1},mouthOpen:true,dead:false,hidden:false,shield:false,powered:false};
      const original=[...Array.from({length:12},(_,i)=>({x:25-i,y:8})),...Array.from({length:6},(_,i)=>({x:14,y:9+i}))];
      let time=1000;
      const snapshot=(snakes)=>({generation:1,started:true,time,cols:36,rows:25,maze,player,paused:false,complete:false,gameOver:false,level:1,snakes});
      const direction=body=>body.length>1?{x:body[0].x-body[1].x,y:body[0].y-body[1].y}:{x:1,y:0};
      const snake=(id,body,color='#f17855',motion=null,reversing=false)=>({id,body,dir:direction(body),color,motion,reversing});
      const assert=(condition,message)=>{checks++;if(!condition&&failures.length<25) failures.push(message);};
      const finite=(values,label)=>assert([...values].every(Number.isFinite),label+' contains only finite numbers');
      const visible=object=>{for(let current=object;current;current=current.parent) if(!current.visible) return false;return true;};
      function verticesWithin(object,origin,label){
        if(!object||!visible(object)) return;
        object.updateWorldMatrix(true,true);origin.updateWorldMatrix(true,false);
        inverse.copy(origin.matrixWorld).invert();
        object.traverse(child=>{
          if(!child.isMesh||!visible(child)) return;
          const attribute=child.geometry.attributes.position;
          if(!attribute) return;
          temporary.multiplyMatrices(inverse,child.matrixWorld);
          for(let i=0;i<attribute.count;i++){
            point.fromBufferAttribute(attribute,i).applyMatrix4(temporary);
            limits[label]=Math.max(limits[label],Math.hypot(point.x,point.z));vertices++;
          }
        });
        assert(limits[label]<=.414001,`${label} actual geometry stays within .414-cell radial footprint (max ${limits[label].toFixed(6)})`);
      }
      function instancesWithin(mesh,label){
        if(!mesh||!visible(mesh)) return;
        assert(mesh.count<=mesh.instanceMatrix.count,`${label} count stays within allocated capacity`);
        const attribute=mesh.geometry.attributes.position;
        for(let i=0;i<mesh.count;i++){
          mesh.getMatrixAt(i,temporary);finite(temporary.elements,label+' instance matrix');
          temporary.setPosition(0,0,0);
          for(let v=0;v<attribute.count;v++){
            point.fromBufferAttribute(attribute,v).applyMatrix4(temporary);
            limits[label]=Math.max(limits[label],Math.hypot(point.x,point.z));vertices++;
          }
        }
        assert(limits[label]<=MAX_ACTOR_RADIUS+1e-6,`${label} scaled geometry stays within the modeled radial footprint (max ${limits[label].toFixed(6)})`);
      }
      function checkConnections(mesh,route){
        const first=new THREE.Matrix4(),second=new THREE.Matrix4(),a=new THREE.Vector3(),b=new THREE.Vector3(),axis=new THREE.Vector3();
        const facingA=new THREE.Vector3(),facingB=new THREE.Vector3();
        const attribute=mesh.geometry.attributes.position;
        for(let i=0;i<mesh.count-1;i++){
          mesh.getMatrixAt(i,first);mesh.getMatrixAt(i+1,second);
          a.setFromMatrixPosition(first);b.setFromMatrixPosition(second);axis.subVectors(b,a).normalize();
          facingA.setFromMatrixColumn(first,2).normalize();facingB.setFromMatrixColumn(second,2).normalize();
          // Check face-to-face joints on straight spans. Corner poses have a
          // deliberately shorter block and their exposed flexible neck is valid.
          if(Math.abs(axis.dot(facingA))<.9999||Math.abs(axis.dot(facingB))<.9999) continue;
          const straight=Array.from({length:9},(_,j)=>sampleSnake(route,i+.5+j*.25)).every(p=>
            Math.abs((layout.x(p.x)-a.x)*axis.z-(layout.z(p.y)-a.z)*axis.x)<.001);
          if(!straight) continue;
          let firstEnd=-Infinity,secondStart=Infinity;
          for(let v=0;v<attribute.count;v++){
            point.fromBufferAttribute(attribute,v).applyMatrix4(first);firstEnd=Math.max(firstEnd,point.dot(axis));
            point.fromBufferAttribute(attribute,v).applyMatrix4(second);secondStart=Math.min(secondStart,point.dot(axis));
          }
          const gap=secondStart-firstEnd;connectionChecks++;
          straightPlateGap[0]=Math.min(straightPlateGap[0],gap);straightPlateGap[1]=Math.max(straightPlateGap[1],gap);
          assert(gap>=-.06&&gap<.18,'Straight body plates retain a short joint without deep overlap (gap '+gap.toFixed(5)+')');
        }
      }
      function rememberShared(item){
        for(const root of [item.head,item.tail,item.plates,item.accents].filter(Boolean)) root.traverse(object=>{
          if(object.geometry&&!sharedGeometries.has(object.geometry)){
            sharedGeometries.add(object.geometry);object.geometry.addEventListener('dispose',()=>sharedDisposals++);
          }
        });
      }
      function draw(snakes,deep=false,dt=1/120){
        const state=snapshot(snakes),before=JSON.stringify(state);
        scene.render(state,dt);frames++;
        assert(JSON.stringify(state)===before,'Rendering does not mutate the gameplay snapshot');
        assert(scene.snakes.size===snakes.length,'The mesh roster follows current fragment IDs');
        scene.scene.traverse(object=>{
          finite(object.matrixWorld.elements,'World matrix');
          if(object.isInstancedMesh) assert(object.count<=object.instanceMatrix.count,'Instance buffer capacity');
          if(deep&&object.geometry?.attributes.position) finite(object.geometry.attributes.position.array,'Vertex buffer');
        });
        for(const s of snakes){
          const item=scene.snakes.get(s.id),route=snakeRoute(s,time),head=sampleSnake(route,0),tail=sampleSnake(route,s.body.length-1);
          assert(Math.hypot(item.head.position.x-layout.x(head.x),item.head.position.z-layout.z(head.y))<1e-8,'The modeled head uses the approved motion sample');
          assert(!!item.head.userData.jaw,'Every current head has an articulated jaw');
          if(item.head.userData.jaw){
            const angle=item.head.userData.jaw.rotation.x;
            jawRanges.snake[0]=Math.min(jawRanges.snake[0],angle);jawRanges.snake[1]=Math.max(jawRanges.snake[1],angle);
          }
          assert(!!item.tail,'Every fragment has its reusable tail mesh');
          if(item.tail){
            assert(item.tail.visible===(s.body.length>1),'The tail disappears for a solitary head');
            if(s.body.length>1){
              assert(Math.hypot(item.tail.position.x-layout.x(tail.x),item.tail.position.z-layout.z(tail.y))<1e-8,'The tail follows the last approved motion sample');
              const length=Math.hypot(tail.dx,tail.dy);
              if(length>.001){
                // The model points along -Z locally, away from its neck.
                point.set(0,0,-1).applyQuaternion(item.tail.quaternion);
                assert((point.x*-tail.dx+point.z*-tail.dy)/length>.999,'The tail tip faces away from the preceding body');
              }
            }
          }
          if(s.body.length===1){
            assert(item.plates.count===0,'Solitary heads have no remaining body plates');
            if(item.accents) assert(item.accents.count===0,'Solitary heads have no orphan body accents');
            assert(item.skin.geometry.drawRange.count===0||!item.skin.visible,'Solitary heads have no leftover spine');
          }
          if(deep){verticesWithin(item.head,item.head,'head');verticesWithin(item.tail,item.tail,'tail');instancesWithin(item.plates,'plates');instancesWithin(item.accents,'accents');checkConnections(item.plates,route);}
          rememberShared(item);
        }
        assert(!!scene.player.userData.jaw,'The player has an articulated jaw');
        if(scene.player.userData.jaw){
          const angle=scene.player.userData.jaw.rotation.x;
          jawRanges.player[0]=Math.min(jawRanges.player[0],angle);jawRanges.player[1]=Math.max(jawRanges.player[1],angle);
        }
        if(deep) verticesWithin(scene.player,scene.player,'player');
        const gl=scene.renderer.getContext();assert(gl.getError()===gl.NO_ERROR,'The frame has no WebGL error');
      }
      function pose(){
        const values=[];
        for(const root of [scene.player,...[...scene.snakes.values()].map(item=>item.group)]) root.traverse(object=>{
          values.push(...object.position.toArray(),...object.quaternion.toArray(),...object.scale.toArray());
          if(object.isInstancedMesh) values.push(...object.instanceMatrix.array.slice(0,object.count*16));
          if(object.geometry?.attributes.position?.usage===THREE.DynamicDrawUsage) values.push(...object.geometry.attributes.position.array);
        });
        return JSON.stringify(values);
      }
      function advance(s,reverse=false){
        const from=s.body.map(p=>({...p})),lead=reverse?from.at(-1):from[0],neighbor=reverse?from.at(-2):from[1];
        const next={x:lead.x+(lead.x-neighbor.x),y:lead.y+(lead.y-neighbor.y)};
        const to=reverse?[...from.slice(1),next]:[next,...from.slice(0,-1)];
        const moving=snake(s.id,to,s.color,{from,to,started:time,duration:400},reverse),started=time;
        const firstHead=scene.snakes.get(s.id)?.head.position.clone();
        let previous=firstHead;
        for(let frame=0;frame<=48;frame++){
          time=started+frame*400/48;draw([moving],frame%12===0);
          const head=scene.snakes.get(s.id).head.position.clone();
          if(previous) assert(head.distanceTo(previous)<.04*CELL_SIZE,'Connected animated steps remain continuous');
          previous=head;
        }
        return snake(s.id,to,s.color);
      }
      // Exercise the public articulation helper at both extremes and through
      // its sweep. Teeth and the mouth cavity participate in these actual
      // visible-vertex bounds, not just the nominal lower-jaw bounding box.
      const mouthProbe=createSnakeHead(scene.playerMaterial);
      for(const openness of [0,.25,.5,.75,1]){
        animateSnakeMouth(mouthProbe,openness);mouthProbe.updateWorldMatrix(true,true);
        const bounds={openness,angle:mouthProbe.userData.jaw.rotation.x,radius:0,minY:Infinity,maxY:-Infinity};
        mouthProbe.traverse(object=>{
          if(!object.isMesh||!visible(object))return;
          const attribute=object.geometry.attributes.position;
          for(let i=0;i<attribute.count;i++){
            point.fromBufferAttribute(attribute,i).applyMatrix4(object.matrixWorld);vertices++;
            bounds.radius=Math.max(bounds.radius,Math.hypot(point.x,point.z));
            bounds.minY=Math.min(bounds.minY,point.y);bounds.maxY=Math.max(bounds.maxY,point.y);
          }
        });
        assert(Number.isFinite(bounds.radius)&&Number.isFinite(bounds.minY)&&Number.isFinite(bounds.maxY),'Articulated mouth vertices remain finite');
        assert(bounds.radius<=.414001,`Mouth openness ${openness} stays inside the native .414 radial footprint`);
        assert(bounds.minY>=-1e-6,`Mouth openness ${openness} keeps jaw, tongue and teeth above the floor`);
        mouthBounds.push(bounds);
      }
      assert(mouthBounds[0].angle<-.15&&mouthBounds.at(-1).angle>.15&&mouthBounds.at(-1).angle-mouthBounds[0].angle>.40,'The mouth helper covers a clear nearly-closed to wide-open sweep');
      let main=snake(1,original);
      scene.reset(snapshot([main]));draw([main],true);
      main=advance(main);main=advance(main,true);
      const originalColor=scene.snakes.get(1).material.color.getHex();
      const retired=scene.snakes.get(1);
      // Match the engine: middle bite removes its cell; the rear survivor's old
      // tail becomes the head, with a new ID and the same inherited color.
      const cut=8,front=snake(2,main.body.slice(0,cut)),back=snake(3,main.body.slice(cut+1).reverse());
      time+=1;draw([front,back],true);
      assert(retired.group.parent===null,'The consumed parent mesh leaves the scene after splitting');
      for(const id of [2,3]) assert(scene.snakes.get(id).material.color.getHex()===originalColor,'Both new fragments inherit their parent body color');
      // Both fragments must visibly chomp at their own phase, rather than all
      // snakes sharing the same tiny synchronized jaw oscillation.
      for(let frame=0;frame<120;frame++){
        time+=1000/30;draw([front,back],frame===0||frame===119,1/30);
        const angles=[scene.snakes.get(2).head.userData.jaw.rotation.x,scene.snakes.get(3).head.userData.jaw.rotation.x];
        const difference=Math.abs(angles[0]-angles[1]);
        independentMouths.maxDifference=Math.max(independentMouths.maxDifference,difference);
        if(difference>.08)independentMouths.differentFrames++;
        for(let i=0;i<angles.length;i++){
          independentMouths.ranges[i][0]=Math.min(independentMouths.ranges[i][0],angles[i]);
          independentMouths.ranges[i][1]=Math.max(independentMouths.ranges[i][1],angles[i]);
        }
      }
      assert(independentMouths.maxDifference>.15&&independentMouths.differentFrames>=12,'Separate snakes open their mouths at visibly different phases');
      for(const range of independentMouths.ranges)assert(range[1]-range[0]>.40,'Each newly split snake has a pronounced opening and closing cycle');
      const remaining=snake(4,back.body.slice(1).reverse());
      time+=1;draw([remaining],true);advance(remaining,true);
      // Eating successive tail cells retains the object ID through n=1.
      for(let count=remaining.body.length;count>=1;count--){time+=1;draw([snake(4,remaining.body.slice(0,count))],true);}
      const lone=snake(4,remaining.body.slice(0,1));lone.dir={x:0,y:-1};
      let lastYaw=scene.snakes.get(4).head.rotation.y;
      for(let frame=0;frame<90;frame++){
        time+=1000/120;draw([lone],frame%15===0);
        const yaw=scene.snakes.get(4).head.rotation.y;
        const turn=Math.atan2(Math.sin(yaw-lastYaw),Math.cos(yaw-lastYaw));
        assert(Math.abs(turn)<.5,'The surviving solitary head turns smoothly');lastYaw=yaw;
      }
      assert(Math.cos(scene.snakes.get(4).head.rotation.y-Math.PI)>.999,'The solitary head settles into its new direction');
      const frozen=pose();
      for(let frame=0;frame<20;frame++) draw([lone]);
      assert(pose()===frozen,'Frozen gameplay time freezes jaws and snake geometry');
      const old=scene.snakes.get(4);draw([],true);
      assert(old.group.parent===null,'The last eaten head leaves the scene');
      const emptyGeometry=scene.renderer.info.memory.geometries,emptyTextures=scene.renderer.info.memory.textures;
      const memory=[];
      for(let run=0;run<12;run++){
        time+=100;
        scene.reset(snapshot([]));draw([snake(10+run,original)],run===0);
        draw([snake(100+run,original.slice(0,8)),snake(200+run,original.slice(9).reverse())]);
        draw([]);memory.push({...scene.renderer.info.memory});
        assert(scene.renderer.info.memory.geometries<=emptyGeometry,'Repeated fragmentation/restart does not accumulate GPU geometries');
        assert(scene.renderer.info.memory.textures<=emptyTextures,'Repeated restart does not accumulate textures');
      }
      assert(sharedDisposals===0,'Removing snakes never disposes shared model geometries');
      assert(connectionChecks>0,'The body joint check covers straight segments');
      assert(jawRanges.player[1]-jawRanges.player[0]>.005,'The player jaw visibly articulates as game time advances');
      assert(jawRanges.snake[1]-jawRanges.snake[0]>.40,'Snake jaws visibly open wide and close as game time advances');
      // Restore a useful visual review layout, then keep this exact scene for screenshots.
      time=4200;
      const blue=snake(301,[{x:21,y:15},{x:20,y:15},{x:19,y:15},{x:18,y:15},{x:18,y:14},{x:18,y:13},{x:18,y:12}],'#29c9ef');
      const pink=snake(302,[{x:27,y:14},{x:27,y:13},{x:27,y:12},{x:27,y:11},{x:26,y:11},{x:25,y:11}],'#df37b1');
      scene.reset(snapshot([]));scene.zoom=scene.targetZoom=1.8;draw([snake(300,original),blue,pink],true);
      window.__modelReview=scene;
      return {checks,frames,vertices,connectionChecks,straightPlateGap,footprintRadius:limits,jawRanges,mouthBounds,independentMouths,sharedDisposals,memoryAfterRemoval:{geometries:emptyGeometry,textures:emptyTextures},finalMemory:memory.at(-1),failures};
    });
    await page.screenshot({path:'experiments/3d/preview-models-topology.png'});
    await page.evaluate(()=>{
      const scene=window.__modelReview;
      const player=scene.player.position;
      scene.camera.left=-3;scene.camera.right=3;scene.camera.top=2.1;scene.camera.bottom=-2.1;
      scene.camera.position.set(player.x,7,player.z+9);scene.camera.lookAt(player.x,.55,player.z);scene.camera.updateProjectionMatrix();
      scene.renderer.render(scene.scene,scene.camera);
    });
    await page.screenshot({path:'experiments/3d/preview-models-player.png'});
    console.log(JSON.stringify({errors,...result},null,2));
    if(errors.length||result.failures.length) process.exitCode=1;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
