// Probe the energy of a real thin violet strip while its reflected image
// crosses pixel rows. Blurring afterwards cannot restore missed coverage.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});const report=[],errors=[];try{
for(const samples of [0,4]){
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__wet-stability__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0}canvas{width:100vw;height:100vh}</style><canvas id="c"></canvas>'}));
 await page.route(url=>url.pathname.endsWith('/wet-floor.mjs'),r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'wet-floor.mjs'),'utf8').replace('samples:Math.min(4,r.capabilities.maxSamples)','samples:'+samples)}));
 await page.goto('http://127.0.0.1:8093/__wet-stability__');
 await page.evaluate(async(samples)=>{
  const T=await import('/experiments/3d/vendor/three.module.min.js'),{WetFloor}=await import('/experiments/3d/wet-floor.mjs'),{ProjectionCamera}=await import('/experiments/3d/projection-camera.mjs');
  const r=new T.WebGLRenderer({canvas:document.getElementById('c'),antialias:true});r.setSize(1920,1080,false);r.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene(),group=new T.Group();scene.add(group);
  const floor=new T.Mesh(new T.BoxGeometry(30,.1,30),new T.MeshStandardMaterial({color:0x15101f,roughness:.48}));floor.position.y=-.055;floor.name='maze-paving';group.add(floor);
  const strip=new T.Mesh(new T.BoxGeometry(6,.02,.015),new T.MeshBasicMaterial({color:new T.Color(.36,.065,1.3),toneMapped:false}));strip.position.set(0,.77,-1);group.add(strip);
  const wet=new WetFloor(r);wet.attach(group);const c=new ProjectionCamera();c.left=-15;c.right=15;c.top=8.4375;c.bottom=-8.4375;c.up.set(0,0,-1);
  const {buildDuskMaze}=await import('/experiments/3d/environment.mjs'),{dressCrystalRuins}=await import('/experiments/3d/ruins-materials.mjs');
  const production=buildDuskMaze(['#####','#...#','#####'],{worldStyle:'ruins'});dressCrystalRuins(production);
  const source=production.getObjectByName('Violet wall reflection ribbons');
  const ribbon=new T.Mesh(source.geometry.clone(),source.material.clone());ribbon.position.copy(strip.position);ribbon.position.z+=.01;ribbon.scale.x=6;ribbon.visible=false;
  strip.userData.wetReflectionHide=!!samples;ribbon.userData.wetReflectionOnly=!!samples;group.add(ribbon);
  const p=new T.Vector3();globalThis.test={T,r,scene,group,floor,strip,wet,c,p,ribbon,production};
 },samples);
 for(const width of [1920,3840])for(const projection of [0,.5,1]){
 const result=await page.evaluate(({width,projection})=>{
  const {T,r,scene,wet,c,floor,strip,ribbon}=test;r.setSize(width,width*9/16,false);c.setProjection(projection);
  const energies=[],angle=55*Math.PI/180,steps=40;
  for(let i=0;i<steps;i++){
   const shift=(i-(steps-1)/2)*.003;c.position.set(0,c.focusDistance*Math.cos(angle),c.focusDistance*Math.sin(angle)+shift);c.lookAt(0,0,shift);c.updateMatrixWorld();
   wet.render(scene,c);const target=wet.target,data=target.texture.type===T.HalfFloatType?new Uint16Array(target.width*target.height*4):new Uint8Array(target.width*target.height*4);
   if(!floor.visible||!strip.visible||ribbon.visible)throw Error('Reflection capture changed direct-view visibility');
   r.readRenderTargetPixels(target,0,0,target.width,target.height,data);
   let energy=0;for(let j=0;j<data.length;j+=4){const b=data instanceof Uint16Array?T.DataUtils.fromHalfFloat(data[j+2]):data[j+2]/255;const g=data instanceof Uint16Array?T.DataUtils.fromHalfFloat(data[j+1]):data[j+1]/255;energy+=Math.max(0,b-3*g);}
   energies.push(energy);
  }
  const mean=energies.reduce((a,b)=>a+b)/steps,variance=energies.reduce((a,b)=>a+(b-mean)**2,0)/steps;
  return {width,projection,capture:wet.diagnostics(),samples:wet.target.samples,mean,cv:Math.sqrt(variance)/mean,range:(Math.max(...energies)-Math.min(...energies))/mean,energies};
 },{width,projection});
 report.push(result);console.log(JSON.stringify({...result,energies:undefined}));
 }
 await page.close();
}
fs.writeFileSync(path.join(root,'preview-wet-stability.log'),JSON.stringify({report,errors},null,2));assert.deepEqual(errors,[]);
for(const fixed of report.filter(r=>r.samples===4)){
 const before=report.find(r=>r.samples===0&&r.width===fixed.width&&r.projection===fixed.projection);
 assert.ok(before.cv>.25,'Negative control must reproduce the reported subpixel flicker');
 assert.ok(fixed.cv<(fixed.width===3840?.01:.025),'Vertical camera motion must preserve reflected strip energy');
 assert.ok(fixed.range<.06,'No isolated brightness spikes between adjacent raster phases');
 assert.ok(fixed.mean/before.mean>.9&&fixed.mean/before.mean<1.1,'Stability must not come from dimming the reflection');
}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
