// Track the LOCAL reflection profile through camera motion. Integrated source
// energy alone misses coarse-mipmap reconstruction shimmer on the final floor.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__wet-profile__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><canvas id="c"></canvas>'}));
 await page.route('**/wet-floor.mjs',r=>{
   let source=fs.readFileSync(path.join(root,'wet-floor.mjs'),'utf8');
   // Allocate the negative-control mip chain BEFORE the first GPU allocation.
   source=source.replace('this.filter??=reflectionFilter();','this.target.texture.generateMipmaps=true;this.target.texture.minFilter=THREE.LinearMipmapLinearFilter;this.filter??=reflectionFilter();');
   return r.fulfill({contentType:'text/javascript',body:source});
 });
 await page.goto('http://127.0.0.1:8093/__wet-profile__');
 const results=await page.evaluate(async()=>{
  const T=await import('/experiments/3d/vendor/three.module.min.js'),{WetFloor}=await import('/experiments/3d/wet-floor.mjs'),{ProjectionCamera}=await import('/experiments/3d/projection-camera.mjs');
  const {buildDuskMaze}=await import('/experiments/3d/environment.mjs'),{dressCrystalRuins}=await import('/experiments/3d/ruins-materials.mjs');
  const r=new T.WebGLRenderer({canvas:document.getElementById('c'),antialias:true});r.outputColorSpace=T.LinearSRGBColorSpace;
  const scene=new T.Scene(),group=new T.Group();scene.add(group);
  const floor=new T.Mesh(new T.BoxGeometry(30,.1,30),new T.MeshStandardMaterial({color:0x15101f,roughness:.48}));floor.position.y=-.055;floor.name='maze-paving';group.add(floor);
  const production=buildDuskMaze(['#####','#...#','#####'],{worldStyle:'ruins'});dressCrystalRuins(production);
  const source=production.getObjectByName('Violet wall reflection ribbons');
  const ribbon=new T.Mesh(source.geometry,source.material);ribbon.position.set(0,.77,-1);ribbon.scale.x=6;ribbon.visible=false;ribbon.userData.wetReflectionOnly=true;group.add(ribbon);
  const wet=new WetFloor(r);wet.attach(group);const c=new ProjectionCamera();c.left=-15;c.right=15;c.top=8.4375;c.bottom=-8.4375;
  const probeScene=new T.Scene(),probeCamera=new T.Camera(),samplePoint=new T.Vector3();
  const uniforms={map:{value:null},point:{value:new T.Vector2()},level:{value:3.3},texel:{value:new T.Vector2()}};
  const probeMaterial=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position,1.);}',fragmentShader:'uniform sampler2D map;uniform vec2 point,texel;uniform float level;void main(){vec2 uv=point+vec2(0.,gl_FragCoord.x-32.5)*texel;gl_FragColor=vec4(textureLod(map,uv,level).rgb,1.);}',depthTest:false,depthWrite:false});
  probeScene.add(new T.Mesh(new T.PlaneGeometry(2,2),probeMaterial));const probe=new T.WebGLRenderTarget(65,1,{type:T.HalfFloatType,depthBuffer:false});
  const report=[],angle=55*Math.PI/180;
  for(const width of [1920,3840])for(const projection of [0,.5,1])for(const mode of ['capture','legacy-mip','filtered']){
    r.setSize(width,width*9/16,false);c.setProjection(projection);uniforms.level.value=mode==='legacy-mip'?3.3:0;
    c.position.set(0,c.focusDistance*Math.cos(angle),c.focusDistance*Math.sin(angle));c.lookAt(0,0,0);c.updateMatrixWorld();wet.render(scene,c);
    const profiles=[];
    for(let i=0;i<80;i++){
      const shift=(i-39.5)*.01;c.position.set(0,c.focusDistance*Math.cos(angle),c.focusDistance*Math.sin(angle)+shift);c.lookAt(0,0,shift);c.updateMatrixWorld();wet.render(scene,c);
      samplePoint.copy(ribbon.position).project(wet.camera);uniforms.point.value.set(samplePoint.x*.5+.5,samplePoint.y*.5+.5);uniforms.texel.value.set(1/wet.target.width,1/wet.target.height);uniforms.map.value=mode==='filtered'?wet.uniforms.wetColor.value:wet.target.texture;
      r.setRenderTarget(probe);r.render(probeScene,probeCamera);const data=new Uint16Array(65*4);r.readRenderTargetPixels(probe,0,0,65,1,data);r.setRenderTarget(null);
      profiles.push(Array.from({length:65},(_,j)=>T.DataUtils.fromHalfFloat(data[j*4+2])));
    }
    const peaks=profiles.map(p=>Math.max(...p)),centers=profiles.map(p=>p[32]),stats=a=>{const mean=a.reduce((x,y)=>x+y)/a.length;return {mean,cv:Math.sqrt(a.reduce((x,y)=>x+(y-mean)**2,0)/a.length)/mean,range:(Math.max(...a)-Math.min(...a))/mean};};
    report.push({width,projection,mode,peak:stats(peaks),center:stats(centers),energy:stats(profiles.map(p=>p.reduce((a,b)=>a+b))),profiles});
  }
  return report;
 });
 fs.writeFileSync(path.join(root,'preview-wet-profile.log'),JSON.stringify({results,errors},null,2));
 for(const row of results)console.log(JSON.stringify({...row,profiles:undefined}));console.log({errors});
 assert.deepEqual(errors,[]);
 for(const fixed of results.filter(r=>r.mode==='filtered')){
   const before=results.find(r=>r.mode==='legacy-mip'&&r.width===fixed.width&&r.projection===fixed.projection);
   assert.ok(before.peak.cv>.15,'The negative control must expose local mip-grid brightness flicker');
   assert.ok(fixed.peak.cv<.025&&fixed.center.cv<.025,'The visible local reflection profile must stay stable');
   assert.ok(fixed.peak.range<.08&&fixed.center.range<.08,'No brightness spike as a line crosses filter texels');
   assert.ok(fixed.energy.mean/before.energy.mean>.9&&fixed.energy.mean/before.energy.mean<1.1,'Keep reflected luminosity');
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
