const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});try{
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
page.on('pageerror',e=>(errors.push(e.message),console.error(e.message)));page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
await page.route(url=>url.pathname.endsWith('/renderer.mjs'),r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer','globalThis.reviewScene=this;globalThis.reviewTHREE=THREE;this.renderer=new THREE.WebGLRenderer')}));
await page.goto('http://127.0.0.1:8093/experiments/3d/?v=0.3.63&look=balanced&player=dragon&world=ruins',{waitUntil:'domcontentloaded',timeout:60000});
await page.getByRole('button',{name:'Влез в играта',exact:true}).waitFor({timeout:60000});
await page.locator('#start').click();await page.keyboard.press('p');
await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}'});
await page.evaluate(()=>{const s=reviewScene;globalThis.frozen=__mazeBiters3D.snapshot();globalThis.draw=s.render.bind(s);s.render=()=>{};s.resetCamera=true;draw(frozen,0);});
for(const world of ['ruins','current','ruins']){
await page.evaluate(world=>{reviewScene.setWorldStyle(world);draw(frozen,0);},world);
await page.screenshot({path:path.join(root,`preview-ruins-${world}-1920.png`)});
console.log(JSON.stringify(await page.evaluate(()=>({world:reviewScene.worldStyle,reflection:reviewScene.wetFloor.diagnostics(),memory:reviewScene.renderer.info.memory}))));
}
const memory=await page.evaluate(()=>{
 const s=reviewScene,rows=[];
 for(let i=0;i<4;i++){s.setWorldStyle('current');draw(frozen,0);s.setWorldStyle('ruins');draw(frozen,0);rows.push({...s.renderer.info.memory});}
 return rows;
});
assert.deepEqual(memory[3],memory[1],'Repeated world changes release their owned buffers/textures');
const projections=[];
for(const projection of [0,.5,1]){
 const result=await page.evaluate(projection=>{
  const s=reviewScene;s.projection=s.targetProjection=projection;draw(frozen,0);
  const c=s.wetFloor.camera;
  return {projection,inverseError:Math.max(...c.projectionMatrix.clone().multiply(c.projectionMatrixInverse).elements.map((n,i)=>Math.abs(n-(i%5===0?1:0)))),mirrorY:c.position.y,realY:s.camera.position.y,reflection:s.wetFloor.diagnostics()};
 },projection);
 assert.ok(result.inverseError<1e-10);assert.ok(Math.abs(result.mirrorY+result.realY+.01)<1e-9);projections.push(result);
 await page.screenshot({path:path.join(root,`preview-ruins-projection-${projection}.png`)});
}
await page.setViewportSize({width:3840,height:2160});
await page.evaluate(()=>{reviewScene.projection=reviewScene.targetProjection=.5;draw(frozen,0);});
await page.screenshot({path:path.join(root,'preview-ruins-3840.png')});
const high=await page.evaluate(()=>reviewScene.wetFloor.diagnostics());assert.equal(high.width,1920);
// Freeze actor animation and move the real camera up/down through the same
// positions. Captures must agree on the return journey, with no history/ghosts,
// and every capture-only emitter must stay absent from the direct scene.
const motion=await page.evaluate(()=>{
 const s=reviewScene,c=s.camera,r=s.renderer,T=reviewTHREE,origin=c.position.clone(),rows=[],outbound=[];
 const inspect=()=>{const problems=[];s.scene.traverse(o=>{
   if(o.userData.wetReflectionOnly&&o.visible)problems.push(o.name+' leaked into direct view');
   if(o.userData.wetReflectionHide&&!o.visible)problems.push(o.name+' stayed hidden');
   if(o.userData.wetReflectionOpacity&&o.material.opacity!==.82)problems.push(o.name+' changed direct brightness');
 });return problems;};
 for(const i of [...Array.from({length:25},(_,i)=>i),...Array.from({length:25},(_,i)=>24-i)]){
   c.position.copy(origin);c.position.z+=(i-12)*.03;c.updateMatrixWorld();s.wetFloor.render(s.scene,c);
   const t=s.wetFloor.target,data=t.texture.type===T.HalfFloatType?new Uint16Array(t.width*32*4):new Uint8Array(t.width*32*4);
   r.readRenderTargetPixels(t,0,Math.floor(t.height*.55),t.width,32,data);
   let hash=2166136261;for(const value of data)hash=Math.imul(hash^value,16777619)>>>0;
   if(rows.length<25)outbound[i]={hash,data};
   let error=0,energy=0,max=0;
   for(let p=0;p<data.length;p++){const a=T.DataUtils.fromHalfFloat(data[p]),b=T.DataUtils.fromHalfFloat(outbound[i].data[p]),d=Math.abs(a-b);error+=d;energy+=Math.abs(b);max=Math.max(max,d);}
   rows.push({step:i,hash,repeat:outbound[i].hash===hash,relativeError:error/energy,max,problems:inspect()});
 }
 c.position.copy(origin);c.updateMatrixWorld();s.wetFloor.render(s.scene,c);r.render(s.scene,c);
 return {frames:rows.length,repeatable:rows.every(r=>r.relativeError<.001),differences:rows.filter(r=>!r.repeat),problems:rows.flatMap(r=>r.problems),samples:s.wetFloor.target.samples};
});
console.log(JSON.stringify({motion}));
assert.ok(motion.repeatable,'Reflection must be identical at the same camera pose on the return journey');
assert.deepEqual(motion.problems,[]);assert.equal(motion.samples,4);
// A lower, closer view makes the stone grain and wet surface legible.
await page.setViewportSize({width:1920,height:1080});
await page.evaluate(()=>{reviewScene.zoom=reviewScene.targetZoom=2;reviewScene.tiltDegrees=reviewScene.targetTiltDegrees=70;draw(frozen,0);});
await page.screenshot({path:path.join(root,'preview-ruins-detail-1920.png')});
const timing=await page.evaluate(()=>{const t=[];for(let i=0;i<24;i++){const a=performance.now();draw(frozen,0);reviewScene.renderer.getContext().finish();t.push(performance.now()-a);}t.sort((a,b)=>a-b);return {p50:t[12],p95:t[22]};});
console.log(JSON.stringify({memory,projections,high,motion,timing,errors}));assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
