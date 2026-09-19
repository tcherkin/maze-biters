// Frozen-pose A/B plus real engine movement; no comparison UI or extra passes
// are shipped to players. Only the paving background uniform changes in A/B.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const fixture=`globalThis.__placeBalancePlayer=(x,y,dir={x:1,y:0})=>{
  experimentRelease();const t=gameTimeNow();
  Object.assign(player,{x,y,prevX:x,prevY:y,moveFromX:x,moveFromY:y,moveToX:x,moveToY:y,
    moveStartedAt:t,moveDuration:95,lastMove:t,dir:{...dir},nextDir:{...dir},dead:false,
    eliminated:false,hideDeathSprite:false,waitingForInput:true,reactionAssistRicochet:null,
    spawnShieldUntil:Infinity,powerModeUntil:0});for(const s of snakes)s.lastMove=Infinity;
};`;
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  const results=[],errors=[];
  try{
    for(const width of [1920,3840]){
      const page=await browser.newPage({viewport:{width,height:width*9/16},deviceScaleFactor:1});
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.route(url=>url.pathname.endsWith('/renderer.mjs'),route=>route.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer','globalThis.__balanceScene=this;globalThis.__balanceThree=THREE;this.renderer=new THREE.WebGLRenderer')}));
      await page.route(url=>url.pathname.endsWith('/maze-biters-experiment.js'),route=>route.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(path.join(root,'engine/maze-biters-experiment.js'),'utf8').replace('globalThis.MazeBiters3DEngine=Object.freeze({',fixture+'globalThis.MazeBiters3DEngine=Object.freeze({')}));
      await page.goto('http://127.0.0.1:8093/experiments/3d/?v=0.3.42&look=balanced');
      await page.getByRole('button',{name:'Влез в играта',exact:true}).waitFor({timeout:60000});
      assert.equal(await page.evaluate(()=>__balanceScene.dust.enabled),false);
      await page.evaluate(()=>{__balanceScene.dust.update=()=>{throw Error('Disabled trail still updating');};});
      await page.locator('#start').click();
      const moves=[];
      for(const test of [{name:'straight',x:3,y:13,keys:['d']},{name:'diagonal',x:3,y:11,keys:['d','s']},
        {name:'wall',x:9,y:1,dir:{x:0,y:-1},keys:['w']},{name:'turn-near-wall',x:7,y:1,keys:['s']}]){
        await page.evaluate(t=>__placeBalancePlayer(t.x,t.y,t.dir),test);
        for(const key of test.keys)await page.keyboard.down(key);
        await page.waitForTimeout(450);
        for(const key of test.keys)await page.keyboard.up(key);
        if(test.name==='turn-near-wall'){
          await page.keyboard.down('a');await page.waitForTimeout(180);await page.keyboard.up('a');
        }
        moves.push(await page.evaluate(name=>({name,player:__mazeBiters3D.snapshot().player.visual,
          dust:__balanceScene.dust.diagnostics(),lamp:__balanceScene.flashlight.intensity}),test.name));
        const moved=moves.at(-1).player;
        if(test.name==='diagonal')assert.ok(moved.x>test.x&&moved.y>test.y,'Both axes actually advance');
        if(test.name==='straight')assert.ok(moved.x>test.x&&moved.y===test.y);
        if(test.name==='wall')assert.deepEqual(moved,{x:test.x,y:test.y});
        if(test.name==='turn-near-wall')assert.ok(moved.x<test.x&&moved.y>test.y,'Forward motion followed by a turn');
        if(test.name==='diagonal'||test.name==='turn-near-wall')await page.screenshot({path:path.join(root,`preview-floor-balance-${width}-${test.name}.png`)});
      }
      await page.evaluate(()=>{__placeBalancePlayer(4,11);MazeBiters3DEngine.pause();});
      await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
      await page.evaluate(()=>{
        const s=__balanceScene;
        // Pausing the engine still allows camera damping; freeze the actual
        // renderer too so A/B captures share every matrix and actor pose.
        globalThis.__balanceFrozenRender=s.render.bind(s);s.resetCamera=true;
        __balanceFrozenRender(__mazeBiters3D.snapshot(),0);s.render=()=>{};
        globalThis.__paving=s.staticGroup.children.find(o=>o.isInstancedMesh&&o.material.userData.backgroundLightGain);
        globalThis.__floorGain=__paving.material.userData.backgroundLightGain;
        globalThis.__balanceRender=()=>s.wallMirrors.render(s.scene,s.camera);
      });
      await page.evaluate(()=>{__floorGain.value=1;__balanceRender();});
      await page.screenshot({path:path.join(root,`preview-floor-balance-${width}-before.png`)});
      await page.evaluate(()=>{__floorGain.value=.88;__balanceRender();});
      await page.screenshot({path:path.join(root,`preview-floor-balance-${width}-after.png`)});
      const measurement=await page.evaluate(()=>{
        const s=__balanceScene,T=__balanceThree,r=s.renderer,w=r.domElement.width,h=r.domElement.height;
        const read=()=>{__balanceRender();const a=new Uint8Array(w*h*4);r.getContext().readPixels(0,0,w,h,r.getContext().RGBA,r.getContext().UNSIGNED_BYTE,a);return a;};
        const lights=[s.flashlight,s.glow,s.beam,s.halo],vis=lights.map(o=>o.visible);
        const take=(gain,lit)=>{__floorGain.value=gain;lights.forEach((o,i)=>o.visible=lit&&vis[i]);return read();};
        const before=take(1,true),after=take(.88,true),unlitBefore=take(1,false),unlitAfter=take(.88,false);
        lights.forEach((o,i)=>o.visible=vis[i]);
        const originals=[],white=new T.ShaderMaterial({toneMapped:false,
          vertexShader:`void main(){vec4 p=vec4(position,1.);
            #ifdef USE_INSTANCING
              p=instanceMatrix*p;
            #endif
            gl_Position=projectionMatrix*modelViewMatrix*p;}`,
          fragmentShader:'void main(){gl_FragColor=vec4(1.);}'}),black=new T.MeshBasicMaterial({color:0});
        s.scene.traverse(o=>{if(o.material){originals.push([o,o.material,o.visible]);o.material=o===__paving?white:black;
          if(originals.at(-1)[1].transparent)o.visible=false;}});
        r.render(s.scene,s.camera);const mask=new Uint8Array(w*h*4);r.getContext().readPixels(0,0,w,h,r.getContext().RGBA,r.getContext().UNSIGNED_BYTE,mask);
        for(const [o,m,v]of originals){o.material=m;o.visible=v;}
        const lin=Array.from({length:256},(_,i)=>{const v=i/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
        const lum=(a,i)=>.2126*lin[a[i]]+.7152*lin[a[i+1]]+.0722*lin[a[i+2]];
        let n=0,b=0,a=0,litN=0,litB=0,litA=0,deltaB=0,deltaA=0;
        for(let i=0;i<mask.length;i+=4)if(mask[i]>250&&mask[i+1]>250&&mask[i+2]>250){
          const base=lum(unlitBefore,i),light=lum(before,i)-base;
          if(light<.0001&&base>.0001){n++;b+=base;a+=lum(unlitAfter,i);}
          if(light>.015){litN++;litB+=lum(before,i);litA+=lum(after,i);deltaB+=light;deltaA+=lum(after,i)-lum(unlitAfter,i);}
        }
        // ACES is nonlinear at these dark tones. Verify the lamp's actual
        // additive contribution in linear HDR, before display tone mapping.
        const target=new T.WebGLRenderTarget(960,540,{type:T.FloatType});
        target.texture.colorSpace=T.LinearSRGBColorSpace;
        const tone=r.toneMapping;r.toneMapping=T.NoToneMapping;
        const hdrRead=()=>{r.setRenderTarget(target);r.render(s.scene,s.camera);
          const data=new Float32Array(960*540*4);r.readRenderTargetPixels(target,0,0,960,540,data);return data;};
        const hdrTake=(gain,lit)=>{__floorGain.value=gain;lights.forEach((o,i)=>o.visible=lit&&vis[i]);return hdrRead();};
        const hb=hdrTake(1,true),ha=hdrTake(.88,true),hbu=hdrTake(1,false),hau=hdrTake(.88,false);
        for(const [o,m]of originals){o.material=o===__paving?white:black;if(m.transparent)o.visible=false;}
        const hm=hdrRead();for(const [o,m,v]of originals){o.material=m;o.visible=v;}
        const hl=(data,i)=>.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
        let hdBefore=0,hdAfter=0,hdPixels=0;
        for(let i=0;i<hm.length;i+=4)if(hm[i]>.99&&hm[i+1]>.99&&hm[i+2]>.99){
          const d=hl(hb,i)-hl(hbu,i);if(d>.005){hdBefore+=d;hdAfter+=hl(ha,i)-hl(hau,i);hdPixels++;}
        }
        r.setRenderTarget(null);r.toneMapping=tone;target.dispose();white.dispose();black.dispose();
        lights.forEach((o,i)=>o.visible=vis[i]);
        __floorGain.value=.88;__balanceRender();
        return {background:{pixels:n,before:b/n,after:a/n,ratio:a/b},lit:{pixels:litN,before:litB/litN,after:litA/litN,ratio:litA/litB,lampContributionRatio:deltaA/deltaB},
          linearLamp:{pixels:hdPixels,contributionRatio:hdAfter/hdBefore},
          lamp:{intensity:s.flashlight.intensity,distance:s.flashlight.distance,penumbra:s.flashlight.penumbra,color:s.flashlight.color.getHexString()},
          camera:{projection:s.projection,tilt:s.tiltDegrees,zoom:s.zoom},dust:s.dust.diagnostics()};
      });
      console.log(JSON.stringify({width,measurement}));
      assert.ok(measurement.background.pixels>1000);assert.ok(measurement.background.ratio>.83&&measurement.background.ratio<.97);
      assert.ok(measurement.lit.pixels>100&&measurement.lit.ratio>.93,'Only the small background component is lost under the beam');
      assert.ok(measurement.linearLamp.pixels>100&&Math.abs(measurement.linearLamp.contributionRatio-1)<.001,'The physical flashlight contribution is preserved before tone mapping');
      assert.equal(measurement.dust.active,0);assert.equal(measurement.camera.projection,.5);
      for(const zoom of [1,2]){
        await page.evaluate(zoom=>{__balanceScene.targetZoom=zoom;__balanceScene.zoom=zoom;__balanceFrozenRender(__mazeBiters3D.snapshot(),0);},zoom);
        await page.screenshot({path:path.join(root,`preview-floor-balance-${width}-zoom-${zoom}.png`)});
      }
      results.push({width,moves,measurement});await page.close();
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
