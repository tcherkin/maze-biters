const path=require('node:path');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8093/experiments/3d/');
    const loaded=await Promise.race([
      page.getByRole('button',{name:'Влез в играта',exact:true}).waitFor({timeout:60000}).then(()=>true),
      page.waitForFunction(()=>document.getElementById('start')?.hidden,{},{timeout:60000}).then(()=>false)
    ]);
    if(!loaded) throw new Error('Game initialization failed: '+errors.join('; ')+'; '+await page.locator('#message').innerText());
    const result=await page.evaluate(async()=>{
      const {snakeRoute,sampleSnake,footprintIsOpen}=await import('/experiments/3d/motion.mjs');
      const {MAX_ACTOR_RADIUS,CELL_SIZE,WALL_HEIGHT,worldLayout}=await import('/experiments/3d/world.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
      const {buildDuskMaze,disposeDuskMaze}=await import('/experiments/3d/environment.mjs');
      const {DuskScene}=await import('/experiments/3d/renderer.mjs');
      const THREE=await import('/experiments/3d/vendor/three.module.min.js');
      const engine=MazeBiters3DEngine;
      let samples=0,reverseFrames=0,maxHeadStep=0,maxTailStep=0,turns=0,continuityChecks=0,playerChecks=0,respawns=0,wallChecks=0,minWallClearance=Infinity,failures=[];
      let diagonalFrames=0,diagonalTransitions=0,geometryFrames=0,geometryVertices=0;
      let reviewSnapshot=null,reviewDiagonalLinks=0;
      const geometryScene=new DuskScene(document.createElement('canvas'));
      const vertex=new THREE.Vector3(),instance=new THREE.Matrix4(),worldMatrix=new THREE.Matrix4();
      const observedSnakes=new Set();
      for(let run=0;run<3;run++){
        engine.start();const initial=engine.snapshot(),start=initial.time,layout=worldLayout(initial.maze);
        if(initial.cols!==CONCEPT_MAZE[0].length||initial.rows!==CONCEPT_MAZE.length||JSON.stringify(initial.maze)!==JSON.stringify(CONCEPT_MAZE)) throw new Error('Experimental engine dimensions and maze must match the reduced concept board');
        if(JSON.stringify(initial.snakes.map(s=>[s.color,s.body]))!==JSON.stringify(CONCEPT_SNAKES.map(s=>[s.color,s.body]))) throw new Error('Experimental engine must use the complete concept snake bodies');
        const mazeGroup=buildDuskMaze(initial.maze),wallBounds=mazeGroup.userData.wallBounds;
        if(!wallBounds?.length) throw new Error('Rendered maze must supply its solid wall bounds');
        disposeDuskMaze(mazeGroup);
        const previous=new Map(),nearbyWalls=new Map();
        geometryScene.layout=layout;
        let previousPlayer=initial.player;
        function wallsNear(point){
          const cellX=Math.round(point.x),cellY=Math.round(point.y),key=cellX+','+cellY;
          if(!nearbyWalls.has(key)){
            const cx=layout.x(cellX),cz=layout.z(cellY),range=3;
            nearbyWalls.set(key,wallBounds.filter(b=>b.maxX>=cx-range&&b.minX<=cx+range&&b.maxZ>=cz-range&&b.minZ<=cz+range));
          }
          return nearbyWalls.get(key);
        }
        function testWalls(point){
          const x=layout.x(point.x),z=layout.z(point.y),radius=MAX_ACTOR_RADIUS;
          for(const bounds of wallsNear(point)){
            const dx=Math.max(bounds.minX-x,0,x-bounds.maxX),dz=Math.max(bounds.minZ-z,0,z-bounds.maxZ);
            const clearance=Math.hypot(dx,dz)-radius;wallChecks++;
            minWallClearance=Math.min(minWallClearance,clearance);
            if(clearance<-1e-8) return {point,bounds,clearance};
          }
          return null;
        }
        function checkActualGeometry(s,t,frame){
          let item=geometryScene.snakes.get(s.id);
          if(!item){item=geometryScene.makeSnake(s);geometryScene.snakes.set(s.id,item);}
          geometryScene.drawSnake(item,s,t);item.group.updateWorldMatrix(true,true);
          geometryFrames++;
          item.group.traverse(object=>{
            if(!object.isMesh)return;
            for(let parent=object;parent;parent=parent.parent)if(!parent.visible)return;
            const positions=object.geometry.attributes.position,index=object.geometry.index;
            const draw=object.geometry.drawRange;
            let vertexCount=positions.count;
            if(Number.isFinite(draw.count)&&index){
              vertexCount=0;
              for(let i=draw.start;i<Math.min(index.count,draw.start+draw.count);i++)vertexCount=Math.max(vertexCount,index.array[i]+1);
            }
            const count=object.isInstancedMesh?object.count:1;
            for(let i=0;i<count;i++){
              if(object.isInstancedMesh){object.getMatrixAt(i,instance);worldMatrix.multiplyMatrices(object.matrixWorld,instance);}
              else worldMatrix.copy(object.matrixWorld);
              for(let v=0;v<vertexCount;v++){
                object.getVertexPosition(v,vertex);vertex.applyMatrix4(worldMatrix);geometryVertices++;
                // Check real articulated/morphed vertices, including elongated
                // diagonal armor, against the same solid walls used by lighting.
                const logical={x:vertex.x/CELL_SIZE+(initial.cols-1)/2,y:vertex.z/CELL_SIZE+(initial.rows-1)/2};
                for(const bounds of wallsNear(logical)){
                  if(vertex.x>bounds.minX+1e-6&&vertex.x<bounds.maxX-1e-6&&vertex.z>bounds.minZ+1e-6&&vertex.z<bounds.maxZ-1e-6&&vertex.y>=0&&vertex.y<=WALL_HEIGHT){
                    if(failures.length<12)failures.push({kind:'actual geometry in wall',point:vertex.toArray(),bounds,id:s.id,frame});
                    break;
                  }
                }
              }
            }
          });
        }
        for(let frame=1;frame<=7200;frame++){
          engine.step(start+frame*1000/120);
          const snapshot=engine.snapshot(),player=snapshot.player;
          const diagonalLinks=snapshot.snakes.reduce((sum,s)=>sum+s.body.filter((p,i)=>i&&p.x!==s.body[i-1].x&&p.y!==s.body[i-1].y).length,0);
          if(diagonalLinks>reviewDiagonalLinks&&!player?.dead){reviewDiagonalLinks=diagonalLinks;reviewSnapshot=structuredClone(snapshot);}
          if(player){
            playerChecks++;
            if(snapshot.maze[player.y]?.[player.x]!=='.'&&failures.length<12) failures.push({kind:'invalid player cell',player,frame});
            if(previousPlayer?.dead&&!player.dead){
              respawns++;
              if((player.x!==PLAYER_SPAWN.x||player.y!==PLAYER_SPAWN.y)&&failures.length<12) failures.push({kind:'respawn outside concept start',player,frame});
            }
            previousPlayer=player;
          }
          for(const s of snapshot.snakes){
            const route=snakeRoute(s,snapshot.time);observedSnakes.add(s.id);
            const hasDiagonal=route.points.some((p,i)=>i&&p.x!==route.points[i-1].x&&p.y!==route.points[i-1].y);
            if(hasDiagonal){
              diagonalFrames++;
              if(frame%120===0)checkActualGeometry(s,snapshot.time,frame);
            }
            if(s.reversing) reverseFrames++;
            for(let i=0;i<s.body.length;i+=.5){
              const p=sampleSnake(route,Math.min(i,s.body.length-1));
              if(!footprintIsOpen(snapshot.maze,p,.414)&&failures.length<12) failures.push({kind:'wall',p,s,frame});
              const penetration=testWalls(p);
              if(penetration&&failures.length<12) failures.push({kind:'rendered wall',...penetration,id:s.id,frame});
              samples++;
            }
            const prior=previous.get(s.id);
            if(prior&&prior.length===s.body.length){
              continuityChecks++;
              const head=sampleSnake(route,0),tail=sampleSnake(route,s.body.length-1);
              const dh=Math.hypot(head.x-prior.head.x,head.y-prior.head.y),dt=Math.hypot(tail.x-prior.tail.x,tail.y-prior.tail.y);
              maxHeadStep=Math.max(maxHeadStep,dh);maxTailStep=Math.max(maxTailStep,dt);
              if((dh>.1||dt>.1)&&failures.length<12) failures.push({kind:'jump',dh,dt,frame,previous:prior,current:{s,time:snapshot.time}});
              if(s.dir.x!==prior.dir.x||s.dir.y!==prior.dir.y) turns++;
              if(s.motion?.started!==prior.started&&s.motion?.from.some((p,i)=>s.motion.to[i]&&p.x!==s.motion.to[i].x&&p.y!==s.motion.to[i].y))diagonalTransitions++;
            }
            previous.set(s.id,{length:s.body.length,head:sampleSnake(route,0),tail:sampleSnake(route,s.body.length-1),dir:s.dir,started:s.motion?.started});
          }
          if(snapshot.complete||snapshot.gameOver) break;
        }
      }
      if(!reverseFrames||!turns||!continuityChecks||!diagonalFrames||!diagonalTransitions||!geometryFrames) failures.push({kind:'coverage',reverseFrames,turns,continuityChecks,diagonalFrames,diagonalTransitions,geometryFrames});
      window.__diagonalReview={scene:geometryScene,snapshot:reviewSnapshot};
      return {samples,reverseFrames,turns,continuityChecks,diagonalFrames,diagonalTransitions,geometryFrames,geometryVertices,playerChecks,respawns,observedSnakes:observedSnakes.size,wallChecks,minWallClearance,maxHeadStep,maxTailStep,failures};
    });
    await page.evaluate(()=>{
      const {scene,snapshot}=window.__diagonalReview;
      if(!snapshot)return;
      const canvas=scene.renderer.domElement;canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:99999';document.body.appendChild(canvas);
      scene.reset(snapshot);scene.zoom=scene.targetZoom=1;scene.render(snapshot,1/60);
    });
    await page.screenshot({path:'experiments/3d/preview-diagonal-models.png'});
    console.log(JSON.stringify({errors,...result},null,2));
    if(errors.length||result.failures.length) process.exitCode=1;
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
