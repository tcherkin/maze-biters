// Actual app/HUD layout with a paused player fixture at the northern corridor.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',
      body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('constructor(canvas){',
        'constructor(canvas){globalThis.__hudScene=this;globalThis.__hudThree=THREE;')}));
    await page.route(url=>url.pathname.endsWith('/maze-biters-experiment.js'),route=>route.fulfill({contentType:'text/javascript',
      body:fs.readFileSync(path.join(root,'engine/maze-biters-experiment.js'),'utf8').replace('globalThis.MazeBiters3DEngine=Object.freeze({',`
      globalThis.__placeHudPlayer=(x,y)=>{
        experimentRelease();const t=gameTimeNow();
        Object.assign(player,{x,y,prevX:x,prevY:y,moveFromX:x,moveFromY:y,moveToX:x,moveToY:y,
          moveStartedAt:t,moveDuration:95,lastMove:t,dir:{x:0,y:-1},nextDir:{x:0,y:-1},
          dead:false,eliminated:false,hideDeathSprite:false,waitingForInput:true,
          reactionAssistRicochet:null,spawnShieldUntil:Infinity});
      };
      globalThis.MazeBiters3DEngine=Object.freeze({`)}));
    await page.goto('http://127.0.0.1:8093/experiments/3d/?look=balanced');
    await page.getByRole('button',{name:'Влез в играта',exact:true}).waitFor({timeout:60000});
    await page.locator('#start').click();await page.keyboard.press('p');
    await page.waitForFunction(()=>__mazeBiters3D.snapshot().paused);
    await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
    const measure=options=>page.evaluate(options=>{
      const scene=__hudScene,THREE=__hudThree;
      const {tilt=55,projection=.5,zoom=1.5,y=1,overlay=true}=options;
      __placeHudPlayer(9,y);
      scene.tiltDegrees=scene.targetTiltDegrees=tilt;scene.projection=scene.targetProjection=projection;
      scene.zoom=scene.targetZoom=zoom;scene.setHudOverlay(overlay?document.getElementById('hud'):null);
      scene.resetCamera=true;scene.render(__mazeBiters3D.snapshot(),0);
      const hud=document.getElementById('hud').getBoundingClientRect(),rect=document.getElementById('world').getBoundingClientRect();
      let wallTop=Infinity,playerTop=Infinity;
      const point=new THREE.Vector3();
      const blocks=scene.staticGroup.getObjectByName('stone-wall-blocks');
      const vertices=blocks.geometry.attributes.position;
      for(let i=0;i<vertices.count;i++){
        point.fromBufferAttribute(vertices,i).applyMatrix4(blocks.matrixWorld);
        if(point.z>scene.layout.z(0)+.66)continue;
        point.project(scene.camera);wallTop=Math.min(wallTop,rect.top+(1-point.y)*rect.height/2);
      }
      scene.player.traverse(object=>{
        const vertices=object.geometry?.attributes.position;if(!vertices||!object.visible)return;
        for(let i=0;i<vertices.count;i++){
          point.fromBufferAttribute(vertices,i).applyMatrix4(object.matrixWorld).project(scene.camera);
          playerTop=Math.min(playerTop,rect.top+(1-point.y)*rect.height/2);
        }
      });
      return {tilt,projection,zoom,y,overlay,hudBottom:hud.bottom,wallTop,playerTop,centerZ:scene.center.y};
    },options);
    const before=await measure({overlay:false});
    await page.screenshot({path:path.join(root,'preview-hud-camera-before.png')});
    const after=await measure({});
    await page.screenshot({path:path.join(root,'preview-hud-camera-after.png')});
    assert.ok(before.wallTop<before.hudBottom,'Reproduce the obscured north wall');
    const cases=[];
    for(const tilt of [0,55,75])for(const projection of [0,.5,1])for(const zoom of [1.5,2]){
      const row=await measure({tilt,projection,zoom});cases.push(row);
      assert.ok(row.wallTop>=row.hudBottom,JSON.stringify(row));
      assert.ok(row.playerTop>=row.hudBottom,JSON.stringify(row));
    }
    for(const y of [7,11,13]){
      const original=await measure({y,overlay:false}),glass=await measure({y});
      assert.equal(glass.centerZ,original.centerZ,'Middle/south camera tracking stays unchanged');
    }
    await page.setViewportSize({width:390,height:844});
    const phone=await measure({});
    assert.ok(phone.wallTop>=phone.hudBottom&&phone.playerTop>=phone.hudBottom);
    await page.setViewportSize({width:1920,height:1080});
    await page.locator('#settings').evaluate(button=>button.click());
    await page.waitForFunction(()=>!document.fullscreenElement);
    const normal=await measure({});
    assert.ok(normal.wallTop>=normal.hudBottom&&normal.playerTop>=normal.hudBottom);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({before,after,cases,phone,normal,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
