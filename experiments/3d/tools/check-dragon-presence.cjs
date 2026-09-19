const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
 const errors=[],captures=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer','globalThis.__presenceScene=this;globalThis.__presenceTHREE=THREE;this.renderer=new THREE.WebGLRenderer')}));
  await page.goto('http://127.0.0.1:8093/experiments/3d/?v=0.3.55&look=balanced&player=dragon');
  await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:90000});
  await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
  await page.evaluate(async()=>{
   MazeBiters3DEngine.pause();const s=__presenceScene,T=__presenceTHREE;
   const {CONCEPT_MAZE}=await import('/experiments/3d/maze-layout.mjs');
   globalThis.__presenceRender=s.render.bind(s);s.render=()=>{};
   globalThis.__presenceState={generation:995,started:true,paused:false,speed:1,time:1000,maze:CONCEPT_MAZE,cols:19,rows:15,
    player:{id:1,x:5,y:9,visual:{x:5,y:9},dir:{x:1,y:0},dead:false,hidden:false,shield:false,powered:false},snakes:[],bites:[],predations:[]};
   s.reset(__presenceState);s.playerYaw=Math.PI/2;
   globalThis.__presenceDraw=()=>{
    __presenceRender(__presenceState,1/60,1/60);
    const centre=s.player.position.clone().add(new T.Vector3(-.9,.82,0));
    const direction=new T.Vector3(1.1,.55,-.85).normalize(),camera=s.camera;
    camera.left=-2.65;camera.right=2.65;camera.top=1.65625;camera.bottom=-1.65625;camera.zoom=1;camera.setProjection(.5);camera.up.set(0,1,0);
    camera.position.copy(centre).addScaledVector(direction,camera.focusDistance);camera.lookAt(centre);camera.updateMatrixWorld();
    s.wallMirrors.render(s.scene,camera);s.renderer.getContext().finish();
   };
   __presenceDraw();
  });
  assert.equal((await page.evaluate(()=>__mazeBiters3D.diagnostics())).version,'0.3.55');
  // Advance the real presence clock, capture actual partial/full eyelid closure.
  for(const [name,match]of [['open','d.time>.8&&d.blink[0]===0'],['closing','d.blink[0]>.35&&d.blink[0]<.9'],['closed','d.blink[0]>.99'],['reopening','d.blink[0]>.15&&d.blink[0]<.85'],['open-again','d.blink[0]===0']]){
   const result=await page.evaluate(condition=>{
    const s=__presenceScene,check=new Function('d','return '+condition);let d;
    for(let i=0;i<600;i++){
     __presenceState.time+=1000/60;
     s.player.userData.dragonPresence.update(s.player,__presenceState.player,__presenceState,1/60,0);
     d=s.player.userData.dragonPresence.diagnostics();if(check(d))break;
    }
    // Render using zero elapsed so the sampled blink isn't advanced again.
    __presenceRender(__presenceState,0,0);
    const saved=s.player.userData.dragonPresence.update;s.player.userData.dragonPresence.update=()=>{};
    __presenceDraw();s.player.userData.dragonPresence.update=saved;
    return d;
   },match);
   const file=`preview-dragon-v55-${name}.png`;await page.screenshot({path:path.join(root,file)});captures.push({file,...result});
  }
  const live=await page.evaluate(()=>{
   const s=__presenceScene,p=__presenceState.player,rows=[];const objects=[];
   s.player.traverse(o=>{if(o.isMesh)objects.push(o);});const geometries=objects.map(o=>o.geometry),materials=objects.map(o=>o.material);
   for(const [label,speed]of [['idle',0],['walk',2],['stopped',0]]){
    const startX=p.visual.x;
    for(let i=0;i<90;i++){
     __presenceState.time+=1000/60;p.visual.x=startX+speed*i/120;p.x=Math.round(p.visual.x);
     __presenceRender(__presenceState,1/60,1/60);
    }
    rows.push({label,...s.player.userData.dragonPresence.diagnostics()});
   }
   return{rows,stable:objects.every((o,i)=>o.geometry===geometries[i]&&o.material===materials[i]),memory:{...s.renderer.info.memory},diag:s.diagnostics()};
  });
  assert.ok(live.stable);assert.ok(live.rows[1].movement>.9);assert.ok(live.rows[2].movement<.01);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({captures,live,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
