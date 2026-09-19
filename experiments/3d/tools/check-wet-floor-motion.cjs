// Regression on the FINAL floor shader, including its ripple, film and roughness.
// Freeze the scene and move only the camera; follow the reflection in world space.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
// Recreate the old coarse mip reconstruction from the current source. Keep the
// same emitter capture and floor shader so this always isolates reconstruction.
function legacyReconstruction(){
 let source=fs.readFileSync(path.join(root,'wet-floor.mjs'),'utf8');
 const binding='this.filter??=reflectionFilter();this.uniforms.wetColor.value=this.filtered.texture;';
 assert(source.includes(binding),'reflection texture binding must be found');
 source=source.replace(binding,'this.target.texture.generateMipmaps=true;this.target.texture.minFilter=THREE.LinearMipmapLinearFilter;this.filter??=reflectionFilter();this.uniforms.wetColor.value=this.target.texture;');
 const start=source.indexOf('vec2 spread=wetTexel'),end=source.indexOf('float edge=',start);
 assert(start>=0&&end>start,'floor reconstruction shader must be found');
 return source.slice(0,start)+'float level=2.1+roughnessFactor*2.4;vec3 reflection=textureLod(wetColor,wetUv,level).rgb;\n        '+source.slice(end);
}
const baselineSource=legacyReconstruction();
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
 const reports=[],errors=[];
 try{for(const variant of ['baseline','corrected']){
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/__wet-floor-motion__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><canvas id="c"></canvas>'}));
  if(variant==='baseline')await page.route('**/wet-floor.mjs',r=>r.fulfill({contentType:'text/javascript',body:baselineSource}));
  await page.goto('http://127.0.0.1:8093/__wet-floor-motion__');
  const results=await page.evaluate(async()=>{
   const T=await import('/experiments/3d/vendor/three.module.min.js'),{WetFloor}=await import('/experiments/3d/wet-floor.mjs'),{ProjectionCamera}=await import('/experiments/3d/projection-camera.mjs');
   const {buildDuskMaze}=await import('/experiments/3d/environment.mjs'),{dressCrystalRuins}=await import('/experiments/3d/ruins-materials.mjs');
   const r=new T.WebGLRenderer({canvas:document.getElementById('c'),antialias:true});r.outputColorSpace=T.LinearSRGBColorSpace;r.setClearColor(0,1);
   const scene=new T.Scene(),group=new T.Group();scene.add(group);
   const floor=new T.Mesh(new T.BoxGeometry(30,.1,30),new T.MeshStandardMaterial({color:0x15101f,roughness:.48}));floor.position.y=-.055;floor.name='maze-paving';group.add(floor);
   const production=buildDuskMaze(['#####','#...#','#####'],{worldStyle:'ruins'});dressCrystalRuins(production);
   const source=production.getObjectByName('Violet wall reflection ribbons');
   const ribbon=new T.Mesh(source.geometry,source.material);ribbon.position.set(0,.77,-1);ribbon.scale.x=6;ribbon.visible=false;ribbon.userData.wetReflectionOnly=true;group.add(ribbon);
   const wet=new WetFloor(r);wet.attach(group);const camera=new ProjectionCamera();camera.left=-15;camera.right=15;camera.top=8.4375;camera.bottom=-8.4375;camera.setProjection(.5);
   const probeScene=new T.Scene(),probeCamera=new T.Camera();
   const uniforms={map:{value:null},point:{value:new T.Vector2()},texel:{value:new T.Vector2()}};
   const probeMaterial=new T.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'void main(){gl_Position=vec4(position,1.);}',
    fragmentShader:'uniform sampler2D map;uniform vec2 point,texel;void main(){vec3 c=vec3(0.);for(int x=-2;x<=2;x++)c+=textureLod(map,point+vec2(float(x),gl_FragCoord.x-64.5)*texel,0.).rgb*.2;gl_FragColor=vec4(c,1.);}'});
   probeScene.add(new T.Mesh(new T.PlaneGeometry(2,2),probeMaterial));
   const probe=new T.WebGLRenderTarget(129,1,{type:T.HalfFloatType,depthBuffer:false});
   const stats=a=>{const mean=a.reduce((x,y)=>x+y)/a.length;return {mean,cv:Math.sqrt(a.reduce((x,y)=>x+(y-mean)**2,0)/a.length)/mean,range:(Math.max(...a)-Math.min(...a))/mean,maxStep:Math.max(...a.slice(1).map((v,i)=>Math.abs(v-a[i])))/mean};};
   const angle=55*Math.PI/180,report=[],sample=new T.Vector3();
   for(const width of [1920,3840]){
    const height=width*9/16;r.setSize(width,height,false);
    const final=new T.WebGLRenderTarget(width,height,{type:T.HalfFloatType,depthBuffer:true,samples:4});
    final.texture.colorSpace=T.LinearSRGBColorSpace;uniforms.map.value=final.texture;uniforms.texel.value.set(1/width,1/height);
    const profiles=[];
    for(let i=0;i<96;i++){
     const step=i<48?i:95-i,shift=(step-23.5)*.015;
     camera.position.set(0,camera.focusDistance*Math.cos(angle),camera.focusDistance*Math.sin(angle)+shift);camera.lookAt(0,0,shift);camera.updateMatrixWorld();
     r.setRenderTarget(null);wet.render(scene,camera);r.setRenderTarget(final);r.render(scene,camera);
     sample.copy(ribbon.position);sample.y=-.01-sample.y;sample.project(camera);uniforms.point.value.set(sample.x*.5+.5,sample.y*.5+.5);
     r.setRenderTarget(probe);r.render(probeScene,probeCamera);const pixels=new Uint16Array(129*4);r.readRenderTargetPixels(probe,0,0,129,1,pixels);r.setRenderTarget(null);
     profiles.push(Array.from({length:129},(_,j)=>T.DataUtils.fromHalfFloat(pixels[j*4+2])));
    }
    const peaks=profiles.map(p=>Math.max(...p)),centers=profiles.map(p=>p[64]);
    const reverseError=Math.max(...profiles.slice(0,48).flatMap((p,i)=>p.map((v,j)=>Math.abs(v-profiles[95-i][j]))));
    report.push({width,projection:.5,tilt:55,peak:stats(peaks),center:stats(centers),reverseError,profiles,diagnostics:wet.diagnostics()});final.dispose();
   }
   wet.release();probe.dispose();r.dispose();return report;
  });
  reports.push({variant,results});await page.close();
 }
 fs.writeFileSync(path.join(root,'preview-wet-floor-motion.log'),JSON.stringify({reports,errors},null,2));
 assert.deepEqual(errors,[]);
 for(const {variant,results} of reports)for(const row of results)console.log(JSON.stringify({variant,...row,profiles:undefined}));
 // The old reconstruction must reproduce the issue; the correction must have
 // a stable local peak and repeat exactly when the camera retraces its path.
 for(let i=0;i<2;i++){
  const before=reports.find(r=>r.variant==='baseline').results[i],after=reports.find(r=>r.variant==='corrected').results[i];
  assert(before.peak.cv>.07,'baseline must expose local profile pulsing');
  const variationLimit=after.width===3840?.008:.025;
  assert(after.peak.cv<variationLimit,'final floor peak must remain stable during pan');
  assert(after.center.cv<variationLimit,'final floor center must remain stable during pan');
  assert(after.peak.cv<before.peak.cv*.3,'substantial improvement over baseline');
  assert(after.reverseError<.00001,'no temporal history or directional ghosting');
 }
 console.log('Final wet-floor motion regression passed at 1080p and 4K.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
