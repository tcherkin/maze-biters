// Archived v0.3.29 versus the optional polish: identical frozen game poses,
// byte-exact default restoration, protected scene data and serial GPU timings.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const modules=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(modules,'playwright'));
const {PNG}=require(path.join(modules,'pngjs'));
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'../..'),out=path.join(root,'art-studies/neon-polish');
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const mode=option('--mode','both'),runs=Number(option('--runs','3')),frames=Number(option('--frames','120'));
const video=process.argv.includes('--video'),sizes=option('--widths','1920,3840').split(',').map(Number),warmFrames=30;
assert.ok(['baseline','compare','both','verify-archive','after'].includes(mode));assert.ok(runs>=1&&runs<=5&&Number.isInteger(runs));assert.ok(frames>=30&&frames<=600);
assert.ok(sizes.every(width=>[1920,3840].includes(width)));
const origin=new URL(process.env.MAZE_TEST_URL||'http://127.0.0.1:8093/').origin;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const json=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
// Read regular ZIP entries in memory; no archive paths are extracted or
// allowed to fall through to the edited working tree when baseline imports.
function unzip(buffer){
  let end=buffer.length-22;while(end>=Math.max(0,buffer.length-65557)&&buffer.readUInt32LE(end)!==0x06054b50)end--;
  assert.ok(end>=0,'ZIP central directory exists');let cursor=buffer.readUInt32LE(end+16);const entries=new Map();
  for(let n=0;n<buffer.readUInt16LE(end+10);n++){
    assert.equal(buffer.readUInt32LE(cursor),0x02014b50);const method=buffer.readUInt16LE(cursor+10),size=buffer.readUInt32LE(cursor+20);
    const nameLength=buffer.readUInt16LE(cursor+28),extraLength=buffer.readUInt16LE(cursor+30),commentLength=buffer.readUInt16LE(cursor+32);
    const name=buffer.subarray(cursor+46,cursor+46+nameLength).toString('utf8').replaceAll('\\','/'),local=buffer.readUInt32LE(cursor+42);
    assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'),'Archive paths stay relative');
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28),compressed=buffer.subarray(start,start+size);
    assert.ok([0,8].includes(method),'Supported ZIP compression');entries.set('/'+name,method===8?zlib.inflateRawSync(compressed):compressed);
    cursor+=46+nameLength+extraLength+commentLength;
  }return entries;
}
const manifest=JSON.parse(fs.readFileSync(path.join(out,'baseline-v0.3.29.json'),'utf8'));
const archive=unzip(fs.readFileSync(path.join(out,'baseline-v0.3.29.zip')));
for(const [name,digest] of Object.entries(manifest.files))assert.equal(sha(archive.get('/'+name)),digest,'Archived SHA matches '+name);
const current=new Map();
for(const folder of ['', 'models','vendor','engine'])for(const entry of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){
  if(entry.isFile()&&/\.(?:mjs|js)$/.test(entry.name)){const relative=path.posix.join('experiments/3d',folder,entry.name);current.set('/'+relative,fs.readFileSync(path.join(workspace,relative)));}
}
const currentHashes=Object.fromEntries([...current].map(([name,bytes])=>[name.slice(1),sha(bytes)]));
const scope=Object.entries(manifest.files).map(([name,baseline])=>({name,baseline,current:fs.existsSync(path.join(workspace,name))?sha(fs.readFileSync(path.join(workspace,name))):null}));
const stat=values=>{const a=values.slice().sort((a,b)=>a-b),q=p=>a[Math.floor((a.length-1)*p)];return {samples:a.length,p50:q(.5),p95:q(.95),max:a.at(-1),mean:a.reduce((s,v)=>s+v,0)/a.length};};
const pixelDifference=(a,b)=>{
  a=PNG.sync.read(a);b=PNG.sync.read(b);assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  let changed=0,max=0,sum=0;for(let i=0;i<a.data.length;i+=4){let delta=0;for(let c=0;c<3;c++){const d=Math.abs(a.data[i+c]-b.data[i+c]);delta=Math.max(delta,d);sum+=d;}if(delta)changed++;max=Math.max(max,delta);}
  return {pixels:a.width*a.height,changed,max,meanChannel:sum/(a.width*a.height*3),equal:changed===0};
};

async function prepare(browser,phase,width){
  const context=await browser.newContext({viewport:{width,height:width*9/16},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[],imports=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const sources=phase.startsWith('archive')?archive:current;
  await page.route(url=>url.pathname.startsWith('/experiments/3d/'),route=>{
    const pathname=new URL(route.request().url()).pathname,body=sources.get(pathname);imports.push(pathname);
    if(!body){errors.push('Unfrozen import: '+pathname);return route.abort();}
    return route.fulfill({contentType:'text/javascript',body});
  });
  await page.route(url=>url.pathname==='/__neon-polish-check__',route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><style>html,body{margin:0;background:#060913;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
  await page.goto(origin+'/__neon-polish-check__');
  const initial=await page.evaluate(async phase=>{
    const began=performance.now(),THREE=await import('/experiments/3d/vendor/three.module.min.js');
    const {DuskScene}=await import('/experiments/3d/renderer.mjs');
    const {CONCEPT_MAZE,CONCEPT_SNAKES}=await import('/experiments/3d/maze-layout.mjs');const imported=performance.now();
    const clone=v=>JSON.parse(JSON.stringify(v)),check=(yes,message)=>{if(!yes)throw new Error(message);};
    const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const n of Object.values(v))freeze(n);}return v;};
    const scene=new DuskScene(document.getElementById('world')),constructed=performance.now();
    if(phase==='after'){check(typeof scene.setNeonPolish==='function','Candidate exposes optional polish');scene.setNeonPolish(true);}
    // In the before phase no switch call is made: the constructor default is
    // what must reproduce the complete archived rendering byte for byte.
    const snake=(id,points,color)=>{const body=points.map(p=>Array.isArray(p)?{x:p[0],y:p[1]}:{...p});return {id,body,color,motion:null,reversing:false,
      dir:{x:body[0].x-body[1].x,y:body[0].y-body[1].y}};};
    const player=(x,y)=>({id:1,x,y,visual:{x,y},dir:{x:0,y:1},mouthOpen:true,dead:false,hidden:false,shield:false,powered:false});
    const opening={generation:1,started:true,cols:19,rows:15,maze:CONCEPT_MAZE,time:2400,paused:true,
      player:player(4,11),snakes:CONCEPT_SNAKES.map((s,i)=>snake(i+1,s.body,s.color)),bites:[],predations:[]};
    const empty=Array.from({length:15},(_,y)=>Array.from({length:19},(_,x)=>x===0||x===18||y===0||y===14?'#':'.').join(''));
    const chains={...clone(opening),generation:2,maze:empty,player:player(9,12),snakes:[
      snake(11,[[4,10],[4,9],[4,8],[4,7],[4,6],[4,5]],'#cf3430'),
      snake(12,[[10,10],[9,9],[8,8],[7,7]],'#e4a71a'),
      snake(13,[[14,10],[14,9],[14,8],[13,8],[12,8],[12,7],[12,6]],'#079ed1'),
      snake(14,[[16,5],[16,4],[15,4],[14,4],[13,4]],'#c92099')]};
    const heads={...clone(opening),generation:3,player:null,snakes:[
      snake(21,[[5,9],[4,9],[3,9],[2,9]],'#cf3430'),snake(22,[[10,8],[10,7],[10,6],[10,5]],'#079ed1')]};
    const poses={opening,chains,heads,player:{...clone(opening),generation:4}};
    scene.zoom=scene.targetZoom=1.5;scene.tiltDegrees=scene.targetTiltDegrees=45;
    scene.reset(opening);const built=performance.now();scene.render(opening,0);const submitted=performance.now();
    const gl=scene.renderer.getContext();gl.finish();const finished=performance.now(),extension=gl.getExtension('WEBGL_debug_renderer_info');
    const render=(state,dt=0)=>{const before=JSON.stringify(state);freeze(state);scene.render(state,dt);
      check(JSON.stringify(state)===before,'Presentation does not mutate the frozen snapshot');};
    const resources=()=>({...scene.diagnostics(),programs:scene.renderer.info.programs.length,sceneChildren:scene.scene.children.length});
    const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const materialData=m=>{const data={type:m.type};for(const k of ['color','emissive','roughness','metalness','clearcoat','clearcoatRoughness','envMapIntensity','emissiveIntensity','opacity','transparent','depthWrite','side','blending','toneMapped','bumpScale'])
      if(m[k]!==undefined)data[k]=m[k]?.isColor?m[k].toArray():m[k];
      for(const k of ['map','normalMap','roughnessMap','emissiveMap','alphaMap','bumpMap']){const t=m[k];if(t)data[k]={image:t.image?.toDataURL?.()||(t.image?.data?Array.from(t.image.data):null),colorSpace:t.colorSpace,repeat:t.repeat.toArray(),offset:t.offset.toArray(),flipY:t.flipY};}return data;};
    const geometryData=o=>({name:o.name,type:o.type,matrix:o.matrixWorld.toArray(),visible:o.visible,count:o.count,
      instances:o.instanceMatrix?Array.from(o.instanceMatrix.array):null,colors:o.instanceColor?Array.from(o.instanceColor.array):null,
      morph:o.morphTargetInfluences,index:o.geometry.index?Array.from(o.geometry.index.array):null,
      // The optional shader's added coordinate attribute is not geometry:
      // every original vertex, normal, UV, index and morph stays protected.
      attributes:Object.fromEntries(Object.entries(o.geometry.attributes).filter(([k])=>k!=='neonVolume').map(([k,a])=>[k,{size:a.itemSize,array:Array.from(a.array)}])),
      targets:Object.fromEntries(Object.entries(o.geometry.morphAttributes).map(([k,a])=>[k,a.map(a=>Array.from(a.array))]))});
    const fingerprint=async()=>{
      scene.scene.updateMatrixWorld(true);const statics=[],actors=[],lights=[];
      scene.staticGroup.traverse(o=>{if(o.isMesh)statics.push({...geometryData(o),materials:(Array.isArray(o.material)?o.material:[o.material]).map(materialData)});});
      for(const root of [scene.player,...[...scene.snakes.values()].map(s=>s.group)])root.traverse(o=>{if(o.isMesh)actors.push(geometryData(o));});
      scene.scene.traverse(o=>{if(o.isLight)lights.push({type:o.type,color:o.color.toArray(),intensity:o.intensity,position:o.position.toArray(),distance:o.distance,decay:o.decay,angle:o.angle,penumbra:o.penumbra,
        castShadow:o.castShadow,target:o.target?.position.toArray()});});
      return {static:await digest(statics),actors:await digest(actors),lights:await digest(lights),camera:await digest({projection:scene.camera.projectionMatrix.toArray(),world:scene.camera.matrixWorld.toArray(),zoom:scene.zoom,tilt:scene.tiltDegrees})};
    };
    const select=name=>{const state=poses[name];scene.zoom=scene.targetZoom=1.5;scene.tiltDegrees=scene.targetTiltDegrees=45;scene.reset(state);
      for(let i=0;i<30;i++)render(state,1/60);gl.finish();return state;};
    const crop=o=>{scene.scene.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(o),corners=[];
      for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const p=new THREE.Vector3(x,y,z).project(scene.camera);corners.push({x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2});}
      const pad=innerWidth/1920*25,x=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.x))-pad)),y=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y))-pad));
      return {x,y,width:Math.min(innerWidth-x,Math.ceil(Math.max(...corners.map(p=>p.x))+pad)-x),height:Math.min(innerHeight-y,Math.ceil(Math.max(...corners.map(p=>p.y))+pad)-y)};};
    window.__neon={THREE,scene,gl,opening,poses,clone,check,render,resources,fingerprint,select,crop,phase,snake,player,empty};
    return {importMs:imported-began,constructMs:constructed-imported,buildMs:built-constructed,firstCpuMs:submitted-built,firstCompletedMs:finished-built,totalMs:finished-began,
      gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),resources:resources()};
  },phase);
  return {context,page,errors,imports,initial};
}

async function capture(page,phase,width){
  const shots={},integrity={};
  for(const pose of ['opening','chains','heads','player']){
    const result=await page.evaluate(async name=>{const m=__neon;m.select(name);const integrity=await m.fingerprint();
      const finish=m.scene.snakes.values().next().value.finish;
      if(m.phase==='after')m.check(m.scene.neonPolish?.enabled===true,'The polish manager remains ON after scene reset');
      return {integrity,mode:{enabled:m.scene.neonPolish?.enabled??false,roughness:finish.material.roughness,clearcoat:finish.material.clearcoat},
        crop:name==='player'?m.crop(m.scene.player):null,heads:name==='heads'?{red:m.crop(m.scene.snakes.get(21).head),cyan:m.crop(m.scene.snakes.get(22).head)}:null};},pose);
    integrity[pose]=result.integrity;
    const name=`${phase}-${width}-${pose}.png`,bytes=await page.screenshot({path:path.join(out,name)});shots[pose]={file:name,sha256:sha(bytes),mode:result.mode};
    const crops=result.crop?{detail:result.crop}:result.heads||{};
    for(const [label,clip] of Object.entries(crops)){const key=pose==='player'?'player-detail':label+'-head',name=`${phase}-${width}-${key}.png`;
      const bytes=await page.screenshot({path:path.join(out,name),clip});shots[key]={file:name,sha256:sha(bytes),crop:clip};}
  }return {shots,integrity};
}
async function measure(page){return page.evaluate(async({frames,warmFrames})=>{
  const m=__neon,state=m.select('opening'),next=()=>new Promise(r=>requestAnimationFrame(r));
  for(let i=0;i<warmFrames;i++){await next();m.render(state,0);m.gl.finish();}
  const cpu=[],completed=[],intervals=[];let last=null;
  for(let i=0;i<frames;i++){await next();const t=performance.now();if(last!==null)intervals.push(t-last);last=t;m.render(state,0);const s=performance.now();m.gl.finish();const f=performance.now();cpu.push(s-t);completed.push(f-t);}
  const stats=a=>{const b=a.slice().sort((a,b)=>a-b),q=p=>b[Math.floor((b.length-1)*p)];return {samples:b.length,p50:q(.5),p95:q(.95),max:b.at(-1),mean:b.reduce((s,v)=>s+v,0)/b.length};};
  m.check(m.gl.getError()===m.gl.NO_ERROR,'No WebGL errors after steady rendering');
  // renderer.info can reset during native transmission. Count the actual GL
  // submissions for one additional warm frame, outside the timing samples.
  const renderer=m.scene.renderer,gl=m.gl,originals=[],targets=new Map(),sequence=[];
  let draws=0,publicRenders=0,shadowPasses=0,shadowDraws=0,currentTarget=renderer.getRenderTarget();
  const targetInfo=target=>{if(!targets.has(target))targets.set(target,{id:target===null?'screen':target===m.scene.wallMirrors.target?'mirror-capture':'target-'+targets.size,
    width:target?.width||gl.drawingBufferWidth,height:target?.height||gl.drawingBufferHeight,type:target?.texture?.type||null,draws:0});return targets.get(target);};
  const replace=(object,key,fn)=>{const original=object[key];originals.push(()=>object[key]=original);object[key]=fn(original);};
  for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'])if(typeof gl[name]==='function')replace(gl,name,original=>function(...args){draws++;targetInfo(currentTarget).draws++;return original.apply(gl,args);});
  replace(renderer,'setRenderTarget',original=>function(target,...args){currentTarget=target;sequence.push(targetInfo(target).id);return original.call(renderer,target,...args);});
  replace(renderer,'render',original=>function(...args){publicRenders++;return original.apply(renderer,args);});
  replace(renderer.shadowMap,'render',original=>function(...args){const start=draws;shadowPasses++;const result=original.apply(renderer.shadowMap,args);shadowDraws+=draws-start;return result;});
  try{m.render(state);gl.finish();}finally{for(const restore of originals.reverse())restore();}
  const actualGpu={draws,publicRenders,shadowPasses,shadowDraws,targets:[...targets.values()],targetSequence:sequence};
  return {cpu:stats(cpu),completed:stats(completed),raf:stats(intervals),raw:{cpu,completed,raf:intervals},actualGpu,resources:m.resources()};
},{frames,warmFrames});}
async function switches(page){return page.evaluate(async()=>{
  const m=__neon,{scene,check}=m;if(typeof scene.setNeonPolish!=='function')return null;
  const state=m.select('opening'),maze=scene.staticGroup,player=scene.player,heads=[...scene.snakes.values()].map(s=>s.head),before=await m.fingerprint();
  for(const value of [true,false,true,false]){scene.setNeonPolish(value);m.render(state);m.gl.finish();}
  const cycles=[];for(let i=0;i<8;i++){scene.setNeonPolish(i%2===0);m.render(state);m.gl.finish();
    check(scene.staticGroup===maze&&scene.player===player&&[...scene.snakes.values()].every((s,j)=>s.head===heads[j]),'Switching polish never resets or replaces the scene');
    check(JSON.stringify(await m.fingerprint())===JSON.stringify(before),'Switching polish preserves static surfaces, lights, camera and actor geometry');cycles.push(m.resources());}
  scene.setNeonPolish(m.phase==='after');m.render(state);return cycles;
});}
async function movie(page,phase,width){
  const data=await page.evaluate(async()=>{
    const m=__neon,{scene}=m,canvas=scene.renderer.domElement,stream=canvas.captureStream(30),chunks=[];
    const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:innerWidth>1920?14000000:6000000}),done=new Promise(resolve=>recorder.onstop=resolve);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    let body=[{x:5,y:5},{x:4,y:5},{x:3,y:5},{x:2,y:5}],state={...m.clone(m.opening),generation:10,maze:m.empty,paused:false,player:m.player(9,11),snakes:[m.snake(81,body,'#cf3430')]};
    scene.reset(state);const path=[{x:6,y:5},{x:7,y:6},{x:8,y:7},{x:8,y:8},{x:8,y:9},{x:9,y:10},{x:10,y:10}];
    for(let i=0;i<30;i++)m.render(state,1/60);m.gl.finish();recorder.start();let priorStep=-1,from,to;const began=performance.now();
    for(let frame=0;frame<168;frame++){
      do{await new Promise(resolve=>requestAnimationFrame(resolve));}while(performance.now()<began+frame*1000/60);
      const step=Math.floor(frame/24);
      if(step!==priorStep){from=m.clone(body);to=[path[step],...body.slice(0,-1)];body=to;priorStep=step;}
      const time=1000+frame*1000/60,snake={...state.snakes[0],body:m.clone(to),dir:{x:to[0].x-from[0].x,y:to[0].y-from[0].y},motion:{from:m.clone(from),to:m.clone(to),started:1000+step*400,duration:400}};
      const player=m.player(9+Math.sin(frame/45)*1.1,11);player.dir={x:Math.cos(frame/45),y:1};
      scene.targetZoom=1.5+.35*Math.sin(frame/167*Math.PI);m.render({...m.clone(state),time,player,snakes:[snake]},1/60);
    }
    recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer()));
  });const name=`motion-${phase}-${width}.webm`;fs.writeFileSync(path.join(out,name),Buffer.from(data));return name;
}

async function verifyComparison(browser){
  const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(origin+'/experiments/3d/art-studies/neon-polish/');
    await page.waitForFunction(()=>document.querySelectorAll('#metrics tr').length>=16);
    const images=[];
    for(const width of ['1920','3840']){
      await page.locator('#resolution').selectOption(width);
      for(const pose of ['opening','chains','heads','red-head','cyan-head','player-detail']){
        await page.locator('#shot').selectOption(pose);
        await page.waitForFunction(()=>['before','after'].every(id=>{const i=document.getElementById(id);return i.complete&&i.naturalWidth>0;}));
        images.push({width,pose,...await page.evaluate(()=>({dimensions:['before','after'].map(id=>{const i=document.getElementById(id);return [i.naturalWidth,i.naturalHeight];})}))});
      }
    }
    const clips=[];await page.locator('#motion').evaluate(node=>node.open=true);
    for(const width of ['1920','3840']){
      await page.locator('#resolution').selectOption(width);
      const metadata=await page.evaluate(async()=>{
        const videos=[...document.querySelectorAll('video')];await Promise.all(videos.map(v=>new Promise((resolve,reject)=>{
          v.onloadedmetadata=resolve;v.onerror=()=>reject(new Error(v.error?.message||'Video metadata failed'));v.load();})));
        await Promise.all(videos.map(v=>v.play()));await new Promise(resolve=>setTimeout(resolve,250));videos.forEach(v=>v.pause());
        return videos.map(v=>({src:new URL(v.src).pathname,width:v.videoWidth,height:v.videoHeight,played:v.currentTime}));
      });
      for(const m of metadata){assert.equal(m.width,Number(width));assert.equal(m.height,Number(width)*9/16);assert.ok(m.played>0,'The recorded clip plays');}clips.push(...metadata);
    }
    const links=await page.locator('a[href]').evaluateAll(anchors=>anchors.map(a=>a.href));
    for(const link of links){const response=await page.request.head(link);assert.equal(response.status(),200,'Comparison link is available: '+link);}
    await page.locator('#resolution').selectOption('1920');await page.locator('#shot').selectOption('opening');
    await page.locator('#motion').evaluate(node=>node.open=false);await page.locator('[data-split="50"]').click();
    await page.waitForFunction(()=>['before','after'].every(id=>{const i=document.getElementById(id);return i.complete&&i.naturalWidth>0;}));
    await page.screenshot({path:path.join(out,'comparison-page.png'),fullPage:true});
    assert.deepEqual(errors,[],'Comparison images, controls, reports and videos have no browser errors');
    const result={images,clips,links,errors};json('comparison-page-check.json',result);console.log(JSON.stringify(result));
  }finally{await context.close();}
}

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']}),reports=[];
  try{
    if(process.argv.includes('--verify-page')){await verifyComparison(browser);return;}
    const schedule=[];if(['baseline','verify-archive'].includes(mode))for(const width of sizes)schedule.push({phase:mode==='verify-archive'?'archive-repeat':'archive',width,run:1});
    if(mode==='after')for(const width of sizes)schedule.push({phase:'after',width,run:1});
    if(mode==='both')for(const width of sizes)for(let run=1;run<=runs;run++){
      for(const phase of run%2?['archive','after']:['after','archive'])schedule.push({phase,width,run});
      if(run===1)schedule.push({phase:'before',width,run});
    }
    if(mode==='compare')for(const width of sizes)for(let run=1;run<=runs;run++)for(const phase of run%2?['before','after']:['after','before'])schedule.push({phase,width,run});
    for(const {phase,width,run} of schedule){
      const {context,page,errors,imports,initial}=await prepare(browser,phase,width);
      try{
        const captured=run===1?await capture(page,phase==='archive'?'before':phase==='before'?'restored':phase==='archive-repeat'?'archive-repeat':'after',width):null;
        const checks={};if(['before','archive-repeat'].includes(phase)&&captured){
          const baseline=JSON.parse(fs.readFileSync(path.join(out,`archive-${width}-run1.json`),'utf8'));
          assert.deepEqual(captured.integrity,baseline.captured.integrity,'Default scene retains archived geometry, static materials, camera and lights');
          for(const [pose,shot] of Object.entries(captured.shots)){
            const before=fs.readFileSync(path.join(out,baseline.captured.shots[pose].file)),after=fs.readFileSync(path.join(out,shot.file));
            checks[pose]=pixelDifference(before,after);
            if(phase==='before'){
              // The identical archived renderer has independently reproduced
              // sparse 1–2/255 MSAA differences on this GPU. Keep raw equality
              // in the report, and allow only similarly sparse quantization.
              assert.ok(checks[pose].max<=2&&checks[pose].changed/checks[pose].pixels<=.001,'Default BEFORE differs beyond observed sparse archive-to-archive quantization for '+pose);
              checks[pose].withinArchiveQuantization=true;
            }
          }
        }
        if(phase==='after'&&captured){const baseline=JSON.parse(fs.readFileSync(path.join(out,`archive-${width}-run1.json`),'utf8'));
          assert.deepEqual(captured.integrity,baseline.captured.integrity,'Polish cannot alter geometry, static surfaces, camera or lights');
          for(const [pose,shot] of Object.entries(captured.shots))checks[pose]=pixelDifference(fs.readFileSync(path.join(out,baseline.captured.shots[pose].file)),fs.readFileSync(path.join(out,shot.file)));
          assert.ok(checks.opening.changed>0,'The optional polish must make a visible change');}
        const steady=await measure(page),toggleCycles=!phase.startsWith('archive')&&run===1?await switches(page):null;
        if(toggleCycles)for(const row of toggleCycles.slice(1))for(const key of ['geometries','textures','programs','sceneChildren'])assert.equal(row[key],toggleCycles[0][key],'Stable toggle '+key);
        if(phase==='after'){
          const baseline=JSON.parse(fs.readFileSync(path.join(out,`archive-${width}-run1.json`),'utf8'));
          if(baseline.steady.actualGpu)assert.deepEqual(steady.actualGpu,baseline.steady.actualGpu,'Polish adds no GL submissions, shadow or refraction passes');
          for(const key of ['geometries','textures','sceneChildren'])assert.equal(steady.resources[key],baseline.steady.resources[key],'Polish preserves archived '+key);
        }
        const movieFile=video&&run===1&&['archive','after'].includes(phase)?await movie(page,phase==='archive'?'before':'after',width):null;
        assert.deepEqual(errors,[],'No browser/shader or unfrozen dependency errors');
        const report={phase,width,height:width*9/16,run,frames,warmFrames,initial,steady,captured,checks,toggleCycles,movie:movieFile,
          imports:[...new Set(imports)],sourceHashes:phase.startsWith('archive')?manifest.files:currentHashes,errors};
        json(`${phase}-${width}-run${run}.json`,report);reports.push(report);
        console.log(JSON.stringify({phase,width,run,initial,steady:{...steady,raw:undefined},checks,movie:movieFile,errors}));
      }finally{await context.close();}
    }
    if(mode==='verify-archive')return;
    const all=[];for(const name of fs.readdirSync(out).filter(n=>/^(archive|before|after)-(1920|3840)-run\d+\.json$/.test(n)))all.push(JSON.parse(fs.readFileSync(path.join(out,name),'utf8')));
    const groups=[];for(const width of sizes)for(const phase of ['before','after']){
      const sourcePhase=phase==='before'?'archive':'after',rows=all.filter(r=>r.width===width&&r.phase===sourcePhase&&r.run<=runs);if(!rows.length)continue;
      groups.push({width,phase,sourcePhase,runs:rows.length,frames,warmFrames,initial:rows.map(r=>r.initial),
        cpu:stat(rows.flatMap(r=>r.steady.raw.cpu)),completed:stat(rows.flatMap(r=>r.steady.raw.completed)),raf:stat(rows.flatMap(r=>r.steady.raw.raf)),
        perRun:rows.map(r=>({run:r.run,cpu:r.steady.cpu,completed:r.steady.completed,raf:r.steady.raf})),actualGpu:rows[0].steady.actualGpu,resources:rows[0].steady.resources});
    }
    json('results.json',{createdUtc:new Date().toISOString(),baselineVersion:manifest.version,groups,sourceScope:scope,
      archivedDefaultExact:all.some(r=>r.phase==='before')&&all.filter(r=>r.phase==='before').every(r=>Object.values(r.checks).every(d=>d.equal)),
      archivedDefaultVerified:all.some(r=>r.phase==='before')&&all.filter(r=>r.phase==='before').every(r=>Object.values(r.checks).every(d=>d.withinArchiveQuantization)),
      archiveRepeat:fs.existsSync(path.join(out,'archive-repeat-1920-run1.json'))?JSON.parse(fs.readFileSync(path.join(out,'archive-repeat-1920-run1.json'),'utf8')).checks:null,
      reports:all.map(r=>({file:`${r.phase}-${r.width}-run${r.run}.json`,phase:r.phase,width:r.width,run:r.run,checks:r.checks})),
      note:'CPU submission; CPU plus synchronous GPU completion; RAF scheduling intervals. Initial compilation measured separately. Serial local headless Edge comparison, not a gameplay FPS guarantee.'});
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
