const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__carving-review__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;background:#05040c}canvas{width:100vw;height:100vh;display:block}</style><canvas id="c"></canvas>'}));
 await page.goto('http://127.0.0.1:8093/__carving-review__');
 const report=await page.evaluate(async()=>{
  const T=await import('/experiments/3d/vendor/three.module.min.js'),{buildDuskMaze,lightDuskScene}=await import('/experiments/3d/environment.mjs'),{dressCrystalRuins,setRuinsLighting}=await import('/experiments/3d/ruins-materials.mjs'),{ProjectionCamera}=await import('/experiments/3d/projection-camera.mjs'),{WetFloor}=await import('/experiments/3d/wet-floor.mjs');
  const r=new T.WebGLRenderer({canvas:document.getElementById('c'),antialias:true});r.setSize(1920,1080,false);r.setClearColor(0x05040c);r.toneMapping=T.ACESFilmicToneMapping;
  const scene=new T.Scene(),rig=lightDuskScene(r,scene);setRuinsLighting(rig,scene,true);
  const group=buildDuskMaze(['...........','.#########.','.#...#...#.','.#...#...#.','.#...#...#.','...........'],{worldStyle:'ruins'});dressCrystalRuins(group);scene.add(group);
  const camera=new ProjectionCamera();camera.left=-11;camera.right=11;camera.top=6.1875;camera.bottom=-6.1875;camera.setProjection(.7);camera.position.set(0,camera.focusDistance*.57,camera.focusDistance*.82);camera.lookAt(0,.4,0);camera.updateMatrixWorld();
  const wet=new WetFloor(r);wet.attach(group);const render=()=>{wet.render(scene,camera);r.render(scene,camera);};render();
  globalThis.review={T,r,scene,rig,group,camera,wet,render};
  const rows=group.userData.ruinsCarvings.features;return {features:rows.length,symbols:rows.filter(f=>f.kind==='glyph').map(f=>({symbol:f.symbol,lit:f.lit,center:f.center,normal:f.normal})),memory:r.info.memory};
 });
 await page.screenshot({path:path.join(root,'preview-carved-walls-wide.png')});
 await page.evaluate(()=>{const s=review,f=s.group.userData.ruinsCarvings.features.find(f=>f.kind==='glyph'&&f.lit&&f.normal.z>.9);const c=s.camera;c.left=-2.3;c.right=2.3;c.top=1.29375;c.bottom=-1.29375;c.setProjection(.7);c.position.copy(f.center).addScaledVector(f.normal,c.focusDistance*.84);c.position.y+=c.focusDistance*.54;c.lookAt(f.center);c.updateMatrixWorld();s.render();});
 await page.screenshot({path:path.join(root,'preview-carved-walls-close.png')});
 console.log(JSON.stringify({report,errors}));assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
