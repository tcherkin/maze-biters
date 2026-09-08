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
      const {MAX_ACTOR_RADIUS,worldLayout}=await import('/experiments/3d/world.mjs');
      const {CONCEPT_MAZE,CONCEPT_SNAKES,PLAYER_SPAWN}=await import('/experiments/3d/maze-layout.mjs');
      const {buildDuskMaze,disposeDuskMaze}=await import('/experiments/3d/environment.mjs');
      const engine=MazeBiters3DEngine;
      let samples=0,reverseFrames=0,maxHeadStep=0,maxTailStep=0,turns=0,continuityChecks=0,playerChecks=0,respawns=0,wallChecks=0,minWallClearance=Infinity,failures=[];
      const observedSnakes=new Set();
      for(let run=0;run<3;run++){
        engine.start();const initial=engine.snapshot(),start=initial.time,layout=worldLayout(initial.maze);
        if(initial.cols!==CONCEPT_MAZE[0].length||initial.rows!==CONCEPT_MAZE.length||JSON.stringify(initial.maze)!==JSON.stringify(CONCEPT_MAZE)) throw new Error('Experimental engine dimensions and maze must match the reduced concept board');
        if(JSON.stringify(initial.snakes.map(s=>[s.color,s.body]))!==JSON.stringify(CONCEPT_SNAKES.map(s=>[s.color,s.body]))) throw new Error('Experimental engine must use the complete concept snake bodies');
        const mazeGroup=buildDuskMaze(initial.maze),wallBounds=mazeGroup.userData.wallBounds;
        if(!wallBounds?.length) throw new Error('Rendered maze must supply its solid wall bounds');
        disposeDuskMaze(mazeGroup);
        const previous=new Map(),nearbyWalls=new Map();
        let previousPlayer=initial.player;
        function testWalls(point){
          const x=layout.x(point.x),z=layout.z(point.y),radius=MAX_ACTOR_RADIUS;
          const cellX=Math.round(point.x),cellY=Math.round(point.y),key=cellX+','+cellY;
          if(!nearbyWalls.has(key)){
            const cx=layout.x(cellX),cz=layout.z(cellY),range=3;
            nearbyWalls.set(key,wallBounds.filter(b=>b.maxX>=cx-range&&b.minX<=cx+range&&b.maxZ>=cz-range&&b.minZ<=cz+range));
          }
          for(const bounds of nearbyWalls.get(key)){
            const dx=Math.max(bounds.minX-x,0,x-bounds.maxX),dz=Math.max(bounds.minZ-z,0,z-bounds.maxZ);
            const clearance=Math.hypot(dx,dz)-radius;wallChecks++;
            minWallClearance=Math.min(minWallClearance,clearance);
            if(clearance<-1e-8) return {point,bounds,clearance};
          }
          return null;
        }
        for(let frame=1;frame<=7200;frame++){
          engine.step(start+frame*1000/120);
          const snapshot=engine.snapshot(),player=snapshot.player;
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
            }
            previous.set(s.id,{length:s.body.length,head:sampleSnake(route,0),tail:sampleSnake(route,s.body.length-1),dir:s.dir});
          }
          if(snapshot.complete||snapshot.gameOver) break;
        }
      }
      if(!reverseFrames||!turns||!continuityChecks) failures.push({kind:'coverage',reverseFrames,turns,continuityChecks});
      return {samples,reverseFrames,turns,continuityChecks,playerChecks,respawns,observedSnakes:observedSnakes.size,wallChecks,minWallClearance,maxHeadStep,maxTailStep,failures};
    });
    console.log(JSON.stringify({errors,...result},null,2));
    if(errors.length||result.failures.length) process.exitCode=1;
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
