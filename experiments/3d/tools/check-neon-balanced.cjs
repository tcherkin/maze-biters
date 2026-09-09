// Three independent looks: archived Original .29, archived Polish .30 with
// polish explicitly enabled, and Balanced. Old study artifacts stay untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const modules=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(modules,'playwright'));
const {PNG}=require(path.join(modules,'pngjs'));
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'../..'),out=path.join(root,'art-studies/neon-balanced'),old=path.join(root,'art-studies/neon-polish');
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const mode=option('--mode','quick'),runs=Number(option('--runs','3')),frames=Number(option('--frames','180'));
const video=process.argv.includes('--video'),sizes=option('--widths','1920,3840').split(',').map(Number),warmFrames=30;
assert.ok(['quick','final','original','polish','balanced','restore'].includes(mode));assert.ok(runs>=1&&runs<=5&&Number.isInteger(runs));assert.ok(frames>=30&&frames<=600);
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
const manifests={original:JSON.parse(fs.readFileSync(path.join(old,'baseline-v0.3.29.json'),'utf8')),polish:JSON.parse(fs.readFileSync(path.join(out,'baseline-v0.3.30.json'),'utf8'))};
const archives={original:unzip(fs.readFileSync(path.join(old,'baseline-v0.3.29.zip'))),polish:unzip(fs.readFileSync(path.join(out,'baseline-v0.3.30.zip')))};
for(const [look,manifest] of Object.entries(manifests))for(const [name,digest] of Object.entries(manifest.files))assert.equal(sha(archives[look].get('/'+name)),digest,'Archived '+look+' SHA matches '+name);
const preserved=[path.join(root,'tools/check-neon-polish.cjs'),...fs.readdirSync(old,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>path.join(old,e.name))].map(file=>({file,sha:sha(fs.readFileSync(file))}));
const current=new Map();
for(const folder of ['', 'models','vendor','engine'])for(const entry of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){
  if(entry.isFile()&&/\.(?:mjs|js)$/.test(entry.name)){const relative=path.posix.join('experiments/3d',folder,entry.name);current.set('/'+relative,fs.readFileSync(path.join(workspace,relative)));}
}
const currentHashes=Object.fromEntries([...current].map(([name,bytes])=>[name.slice(1),sha(bytes)]));
const scope=Object.entries(manifests.polish.files).map(([name,baseline])=>({name,baseline,current:fs.existsSync(path.join(workspace,name))?sha(fs.readFileSync(path.join(workspace,name))):null}));
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
  const sources=archives[phase]||current;
  await page.route(url=>url.pathname.startsWith('/experiments/3d/'),route=>{
    const pathname=new URL(route.request().url()).pathname,body=sources.get(pathname);imports.push(pathname);
    if(!body){errors.push('Unfrozen import: '+pathname);return route.abort();}
    return route.fulfill({contentType:'text/javascript',body});
  });
  await page.route(url=>url.pathname==='/__neon-balanced-check__',route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><style>html,body{margin:0;background:#060913;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style><canvas id="world"></canvas>'}));
  await page.goto(origin+'/__neon-balanced-check__');
  const initial=await page.evaluate(async phase=>{
    const began=performance.now(),THREE=await import('/experiments/3d/vendor/three.module.min.js');
    const {DuskScene}=await import('/experiments/3d/renderer.mjs');
    const {CONCEPT_MAZE,CONCEPT_SNAKES}=await import('/experiments/3d/maze-layout.mjs');const imported=performance.now();
    const clone=v=>JSON.parse(JSON.stringify(v)),check=(yes,message)=>{if(!yes)throw new Error(message);};
    const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const n of Object.values(v))freeze(n);}return v;};
    const scene=new DuskScene(document.getElementById('world')),constructed=performance.now();
    if(phase==='polish'){check(typeof scene.setNeonPolish==='function','Archived .30 exposes Polish');scene.setNeonPolish(true);}
    if(phase==='balanced'||phase==='restored-polish'){check(typeof scene.setNeonLook==='function','Candidate exposes the three looks');scene.setNeonLook(phase==='balanced'?'balanced':'polish');}
    // In the before phase no switch call is made: the constructor default is
    // what must restore the archived visual state; sparse GPU quantization is reported separately.
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
      snake(14,[[11,7],[11,6],[10,6],[9,6],[8,6]],'#c92099')]};
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
      if(m.phase==='polish')m.check(m.scene.neonPolish?.enabled===true,'Archived .30 remains explicitly Polish ON after reset');
      if(m.phase==='balanced'||m.phase==='restored-polish')m.check(m.scene.neonPolish?.look===(m.phase==='balanced'?'balanced':'polish'),'The selected look remains active after reset');
      return {integrity,mode:{look:m.scene.neonPolish?.look|| (m.scene.neonPolish?.enabled?'polish':'before'),enabled:m.scene.neonPolish?.enabled??false,roughness:finish.material.roughness,clearcoat:finish.material.clearcoat},
        crop:name==='player'?m.crop(m.scene.player):null,heads:name==='heads'?{red:m.crop(m.scene.snakes.get(21).head),cyan:m.crop(m.scene.snakes.get(22).head)}:name==='chains'?{gold:m.crop(m.scene.snakes.get(12).head),magenta:m.crop(m.scene.snakes.get(14).head)}:null};},pose);
    integrity[pose]=result.integrity;
    const name=`${phase}-${width}-${pose}.png`,bytes=await page.screenshot({path:path.join(out,name)});shots[pose]={file:name,sha256:sha(bytes),mode:result.mode};
    const crops=result.crop?{detail:result.crop}:result.heads||{};
    for(const [label,clip] of Object.entries(crops)){const key=pose==='player'?'player-detail':label+'-head',name=`${phase}-${width}-${key}.png`;
      const bytes=await page.screenshot({path:path.join(out,name),clip});shots[key]={file:name,sha256:sha(bytes),crop:clip};}
  }return {shots,integrity};
}

async function installReplay(page){return page.evaluate(({frames,warmFrames})=>{
  const m=__neon,colors=['#cf3430','#e4a71a','#079ed1','#c92099'],maze=m.opening.maze;
  const waypoints=[[[1,1],[7,1],[7,4],[5,4],[5,6],[1,6]],[[11,1],[17,1],[17,6],[15,6],[15,5],[14,5],[14,3],[11,3]],[[1,8],[5,8],[5,13],[1,13]],[[12,8],[13,8],[13,11],[17,11],[17,13],[12,13]]];
  const free=p=>maze[p[1]]?.[p[0]]==='.',dot=(a,b,c)=>(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]);
  const routes=waypoints.map(way=>{
    let route=[];for(let i=0;i<way.length;i++){let [x,y]=way[i],next=way[(i+1)%way.length];while(x!==next[0]||y!==next[1]){route.push([x,y]);x+=Math.sign(next[0]-x);y+=Math.sign(next[1]-y);}}
    // Clip only open corners, retaining <=90 degree turns at both ends.
    for(let i=route.length-1;i>=0;i--){const n=route.length,a=route[(i+n-1)%n],b=route[i%n],c=route[(i+1)%n];
      if(Math.abs(c[0]-a[0])===1&&Math.abs(c[1]-a[1])===1&&free([a[0],c[1]])&&free([c[0],a[1]])&&dot(route[(i+n-2)%n],a,c)>=0&&dot(a,c,route[(i+2)%n])>=0)route.splice(i,1);}
    m.check(route.length>12&&new Set(route.map(p=>p.join(','))).size===route.length,'Replay loop is unique and longer than the snake');
    for(let i=0;i<route.length;i++){const a=route[i],b=route[(i+1)%route.length],c=route[(i+2)%route.length],dx=Math.abs(b[0]-a[0]),dy=Math.abs(b[1]-a[1]);
      m.check(free(a)&&dx<=1&&dy<=1&&dx+dy>0,'Every replay step stays on a free adjacent cell');
      m.check(!dx||!dy||(free([a[0],b[1]])&&free([b[0],a[1]])),'Replay diagonals never cut a wall corner');m.check(dot(a,b,c)>=0,'Replay turns stay within 90 degrees');}
    const cumulative=[0];for(let i=0;i<route.length;i++){const a=route[i],b=route[(i+1)%route.length];cumulative.push(cumulative.at(-1)+Math.hypot(a[0]-b[0],a[1]-b[1])*220);}
    return {path:route,cumulative,loop:cumulative.at(-1)};
  });
  const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))freeze(v);}return value;};
  const replay=[];
  for(let frame=0;frame<frames+warmFrames;frame++){
    const elapsed=frame*1000/60,time=1000+elapsed,snakes=colors.map((color,i)=>{
      const {path,cumulative,loop}=routes[i],phase=i*loop/4,progress=(elapsed+phase)%loop;let step=0;while(step<path.length-1&&cumulative[step+1]<=progress)step++;
      const point=index=>{const p=path[(index%path.length+path.length)%path.length];return {x:p[0],y:p[1]};};
      const from=Array.from({length:12},(_,n)=>point(step-n)),to=[point(step+1),...from.slice(0,-1)],duration=cumulative[step+1]-cumulative[step];
      return {...m.snake(81+i,to,color),motion:{from,to,started:time-(progress-cumulative[step]),duration}};
    });
    const player=m.player(9+.35*Math.sin(elapsed/950),9);player.dir={x:Math.cos(elapsed/950),y:1};
    const state={...m.opening,generation:10,maze,paused:false,time,player,snakes};
    replay.push(freeze({state,zoom:1.5+.35*Math.sin(Math.max(0,frame-warmFrames)/(frames-1)*Math.PI)}));
  }
  const serialized=JSON.stringify(replay);m.replay=replay;m.replaySerialized=serialized;
  m.beginReplay=()=>{m.scene.zoom=m.scene.targetZoom=1.5;m.scene.tiltDegrees=m.scene.targetTiltDegrees=45;m.scene.reset(replay[0].state);};
  // The timed path reads only prebuilt immutable snapshots. JSON checks,
  // fixture allocation, recording and GL instrumentation are outside samples.
  m.replayFrame=index=>{const entry=replay[index];m.scene.targetZoom=entry.zoom;m.scene.render(entry.state,1/60);};
  m.beginReplay();for(let i=0;i<replay.length;i++)m.replayFrame(i);m.gl.finish();
  m.check(JSON.stringify(replay)===serialized,'Replay warmup cannot mutate snapshots');
  return {frames:replay.length,maze:'CONCEPT_MAZE',routes:routes.map(r=>r.path),snakes:4,segments:48,baseTilt:45,zoom:[1.5,1.85],directionChanges:true,shaInput:serialized};
},{frames,warmFrames}).then(value=>({...value,shaInput:sha(value.shaInput)}));}

async function measure(page){return page.evaluate(async({frames,warmFrames})=>{
  const m=__neon,next=()=>new Promise(r=>requestAnimationFrame(r));m.beginReplay();
  for(let i=0;i<warmFrames;i++){await next();m.replayFrame(i);m.gl.finish();}
  const cpu=[],completed=[],intervals=[];let last=null;
  for(let i=0;i<frames;i++){await next();const t=performance.now();if(last!==null)intervals.push(t-last);last=t;m.replayFrame(i+warmFrames);const s=performance.now();m.gl.finish();const f=performance.now();cpu.push(s-t);completed.push(f-t);}
  const stats=a=>{const b=a.slice().sort((a,b)=>a-b),q=p=>b[Math.floor((b.length-1)*p)];return {samples:b.length,p50:q(.5),p95:q(.95),max:b.at(-1),mean:b.reduce((s,v)=>s+v,0)/b.length};};
  m.check(m.gl.getError()===m.gl.NO_ERROR,'No WebGL errors after warm movement and zoom');
  m.check(JSON.stringify(m.replay)===m.replaySerialized,'Timed movement cannot mutate prebuilt snapshots');
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
  try{m.replayFrame(m.replay.length-1);gl.finish();}finally{for(const restore of originals.reverse())restore();}
  const actualGpu={draws,publicRenders,shadowPasses,shadowDraws,targets:[...targets.values()],targetSequence:sequence};
  return {cpu:stats(cpu),completed:stats(completed),raf:stats(intervals),raw:{cpu,completed,raf:intervals},actualGpu,resources:m.resources()};
},{frames,warmFrames});}
async function switches(page){return page.evaluate(async()=>{
  const m=__neon,{scene,check}=m;if(typeof scene.setNeonLook!=='function')return null;
  const state=m.select('opening'),maze=scene.staticGroup,player=scene.player,heads=[...scene.snakes.values()].map(s=>s.head),before=await m.fingerprint(),selected=scene.neonPolish.look;
  const looks=['before','polish','balanced'];for(const value of looks){scene.setNeonLook(value);m.render(state);m.gl.finish();}
  const cycles=[];for(let i=0;i<9;i++){scene.setNeonLook(looks[i%3]);m.render(state);m.gl.finish();
    check(scene.staticGroup===maze&&scene.player===player&&[...scene.snakes.values()].every((s,j)=>s.head===heads[j]),'Changing look never resets or replaces the scene');
    check(JSON.stringify(await m.fingerprint())===JSON.stringify(before),'All three looks preserve static surfaces, lights, camera and actor geometry');cycles.push(m.resources());}
  scene.setNeonLook(selected);m.render(state);return cycles;
});}
async function movie(page,phase,width){
  const data=await page.evaluate(async({frames,warmFrames})=>{
    const m=__neon,{scene}=m;m.beginReplay();for(let i=0;i<warmFrames;i++)m.replayFrame(i);m.gl.finish();
    const stream=scene.renderer.domElement.captureStream(30),chunks=[],mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:innerWidth>1920?14000000:6000000}),done=new Promise(resolve=>recorder.onstop=resolve);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();const began=performance.now();
    for(let frame=0;frame<frames;frame++){
      do{await new Promise(resolve=>requestAnimationFrame(resolve));}while(performance.now()<began+frame*1000/60);
      m.replayFrame(frame+warmFrames);
    }
    recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());m.check(JSON.stringify(m.replay)===m.replaySerialized,'Video replay cannot mutate snapshots');
    return Array.from(new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer()));
  },{frames,warmFrames});const name='motion-'+phase+'-'+width+'.webm';fs.writeFileSync(path.join(out,name),Buffer.from(data));return name;
}

async function verifyComparison(browser){
  const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(origin+'/experiments/3d/art-studies/neon-balanced/');
    await page.waitForFunction(()=>document.querySelectorAll('#metrics tr').length>=16);
    const images=[],clips=[];
    for(const pair of [['original','polish'],['polish','balanced'],['original','balanced']]){
      await page.locator('#leftLook').selectOption(pair[0]);await page.locator('#rightLook').selectOption(pair[1]);
      for(const width of ['1920','3840']){
        await page.locator('#resolution').selectOption(width);
        for(const pose of ['opening','chains','heads','red-head','magenta-head','cyan-head','gold-head','player-detail']){
          await page.locator('#shot').selectOption(pose);
          await page.waitForFunction(()=>['before','after'].every(id=>{const i=document.getElementById(id);return i.complete&&i.naturalWidth>0;}));
          const dimensions=await page.evaluate(()=>['before','after'].map(id=>{const i=document.getElementById(id);return [i.naturalWidth,i.naturalHeight];}));
          assert.deepEqual(dimensions[0],dimensions[1],'Paired crop and image bounds match');images.push({pair,width,pose,dimensions});
        }
        await page.locator('#motion').evaluate(node=>node.open=true);
        const metadata=await page.evaluate(async()=>{
          const videos=[...document.querySelectorAll('video')];await Promise.all(videos.map(v=>new Promise((resolve,reject)=>{
            v.onloadedmetadata=resolve;v.onerror=()=>reject(new Error(v.error?.message||'Video metadata failed'));v.load();})));
          await Promise.all(videos.map(v=>v.play()));await new Promise(resolve=>setTimeout(resolve,250));videos.forEach(v=>v.pause());
          return videos.map(v=>({src:new URL(v.src).pathname,width:v.videoWidth,height:v.videoHeight,played:v.currentTime,duration:v.duration}));
        });
        for(const row of metadata){assert.equal(row.width,Number(width));assert.equal(row.height,Number(width)*9/16);assert.ok(row.played>0&&row.duration>2,'Recorded movement plays');}clips.push(...metadata);
      }
    }
    assert.equal(new Set(clips.map(c=>c.src)).size,6,'All six three-look videos are available');
    for(const split of ['100','0','50']){await page.locator('[data-split="'+split+'"]').click();assert.equal(await page.locator('#split').inputValue(),split,'Comparison switches to the requested side');}
    const links=await page.locator('a[href]').evaluateAll(anchors=>anchors.map(a=>a.href));
    for(const link of links){const response=await page.request.head(link);assert.equal(response.status(),200,'Comparison link available: '+link);}
    await page.locator('#leftLook').selectOption('polish');await page.locator('#rightLook').selectOption('balanced');
    await page.locator('#resolution').selectOption('1920');await page.locator('#shot').selectOption('opening');
    await page.locator('#motion').evaluate(node=>node.open=false);await page.locator('[data-split="50"]').click();
    await page.waitForFunction(()=>['before','after'].every(id=>{const i=document.getElementById(id);return i.complete&&i.naturalWidth>0;}));
    await page.screenshot({path:path.join(out,'comparison-page.png'),fullPage:true});
    assert.deepEqual(errors,[],'Comparison images, controls, reports and videos have no browser errors');
    const result={images,clips,links,errors};json('comparison-page-check.json',result);console.log(JSON.stringify({images:images.length,clips:6,links:links.length,errors}));
  }finally{await context.close();}
}

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']}),reports=[];
  try{
    if(process.argv.includes('--verify-page')){await verifyComparison(browser);return;}
    const schedule=[];
    for(const width of sizes){
      if(mode==='quick')for(const phase of ['polish','balanced'])schedule.push({phase,width,run:1});
      else if(mode==='final'){
        schedule.push({phase:'original',width,run:1});
        for(let run=1;run<=runs;run++)for(const phase of run%2?['polish','balanced']:['balanced','polish'])schedule.push({phase,width,run});
        for(const phase of ['restored-original','restored-polish'])schedule.push({phase,width,run:1});
      }else if(mode==='restore')for(const phase of ['restored-original','restored-polish'])schedule.push({phase,width,run:1});
      else schedule.push({phase:mode,width,run:1});
    }
    for(const {phase,width,run} of schedule){
      const {context,page,errors,imports,initial}=await prepare(browser,phase,width);
      try{
        const captured=run===1?await capture(page,mode==='quick'?'quick-'+phase:phase,width):null,checks={};
        const baselineFor=look=>reports.find(r=>r.phase===look&&r.width===width&&r.run===1)||JSON.parse(fs.readFileSync(path.join(out,look+'-'+width+'-run1.json'),'utf8'));
        if(captured&&['balanced','restored-original','restored-polish'].includes(phase)){
          const baseline=baselineFor(phase==='restored-original'?'original':'polish');
          assert.deepEqual(captured.integrity,baseline.captured.integrity,'All looks preserve archived static materials, geometry, camera and lights');
          for(const [pose,shot] of Object.entries(captured.shots)){
            checks[pose]=pixelDifference(fs.readFileSync(path.join(out,baseline.captured.shots[pose].file)),fs.readFileSync(path.join(out,shot.file)));
            if(phase.startsWith('restored-')){
              assert.ok(checks[pose].max<=2&&checks[pose].changed/checks[pose].pixels<=.001,'Restored look exceeds independently observed sparse archive GPU quantization: '+pose);
              checks[pose].withinArchiveQuantization=true;
            }
          }
          if(phase==='balanced')assert.ok(checks.opening.changed>0,'Balanced visibly refines Polish');
        }
        let replay=null,steady=null,toggleCycles=null,movieFile=null;
        if(mode!=='quick'&&!phase.startsWith('restored-')){
          // Warm the same visible/morph material variants in every run, including
          // runs without screenshots, before the complete movement replay.
          await page.evaluate(()=>{for(const pose of ['opening','chains','heads','player'])__neon.select(pose);});
          replay=await installReplay(page);steady=await measure(page);
          if(phase==='balanced'){
            const baseline=baselineFor('polish');
            assert.deepEqual(replay,baseline.replay,'Identical prebuilt movement and zoom snapshots');
            assert.deepEqual(steady.actualGpu,baseline.steady.actualGpu,'The same warmed frame submits the same GL draws and render targets');
            for(const key of ['geometries','textures','sceneChildren'])assert.equal(steady.resources[key],baseline.steady.resources[key],'Balanced preserves archived '+key);
          }
          if(video&&run===1)movieFile=await movie(page,phase,width);
        }
        if(mode!=='quick'&&phase==='balanced'&&run===1){
          toggleCycles=await switches(page);
          for(const row of toggleCycles.slice(1))for(const key of ['geometries','textures','programs','sceneChildren'])assert.equal(row[key],toggleCycles[0][key],'Stable look toggle '+key);
        }
        assert.deepEqual(errors,[],'No browser/shader or unfrozen dependency errors');
        const report={phase,width,height:width*9/16,run,frames,warmFrames,initial,replay,steady,captured,checks,toggleCycles,movie:movieFile,
          imports:[...new Set(imports)],sourceHashes:archives[phase]?manifests[phase].files:currentHashes,errors};
        json((mode==='quick'?'quick-':'')+phase+'-'+width+(mode==='quick'?'':'-run'+run)+'.json',report);reports.push(report);
        console.log(JSON.stringify({phase,width,run,initial,steady:steady?{...steady,raw:undefined}:null,checks,movie:movieFile,errors}));
      }finally{await context.close();}
    }
    if(mode==='quick'){json('quick-results.json',{createdUtc:new Date().toISOString(),sourceScope:scope,reports});return;}
    const all=fs.readdirSync(out).filter(n=>/^(original|polish|balanced|restored-original|restored-polish)-(1920|3840)-run\d+\.json$/.test(n)).map(n=>JSON.parse(fs.readFileSync(path.join(out,n),'utf8')));
    const groups=[];
    for(const width of sizes)for(const phase of ['original','polish','balanced']){
      const rows=all.filter(r=>r.width===width&&r.phase===phase&&r.run<=runs&&r.steady);if(!rows.length)continue;
      groups.push({width,phase,runs:rows.length,frames,warmFrames,initial:rows.map(r=>r.initial),
        cpu:stat(rows.flatMap(r=>r.steady.raw.cpu)),completed:stat(rows.flatMap(r=>r.steady.raw.completed)),raf:stat(rows.flatMap(r=>r.steady.raw.raf)),
        perRun:rows.map(r=>({run:r.run,cpu:r.steady.cpu,completed:r.steady.completed,raf:r.steady.raf})),actualGpu:rows[0].steady.actualGpu,resources:rows[0].steady.resources,replay:rows[0].replay});
    }
    const restoration={};for(const phase of ['restored-original','restored-polish']){
      const rows=all.filter(r=>r.phase===phase);restoration[phase]={verified:rows.length===sizes.length&&rows.every(r=>Object.values(r.checks).every(d=>d.withinArchiveQuantization)),
        exact:rows.length===sizes.length&&rows.every(r=>Object.values(r.checks).every(d=>d.equal)),checks:rows.map(r=>({width:r.width,checks:r.checks}))};
    }
    for(const [name,digest] of Object.entries(currentHashes))assert.equal(sha(fs.readFileSync(path.join(workspace,name))),digest,'Captured candidate source remains frozen: '+name);
    const movies=all.filter(r=>r.movie).map(r=>({phase:r.phase,width:r.width,file:r.movie,bytes:fs.statSync(path.join(out,r.movie)).size}));
    json('results.json',{createdUtc:new Date().toISOString(),baselineVersions:{original:manifests.original.version,polish:manifests.polish.version},groups,sourceScope:scope,restoration,movies,
      reports:all.map(r=>({file:r.phase+'-'+r.width+'-run'+r.run+'.json',phase:r.phase,width:r.width,run:r.run,checks:r.checks})),
      note:'Immutable snapshots for four moving snakes / 48 segments with straight, diagonal and turning travel plus camera zoom. Allocations, snapshot verification, media recording and GL instrumentation occur outside timing samples. CPU submission; CPU plus synchronous GPU completion; RAF scheduling intervals; initial compilation separate. Three alternating actual archived Polish .30 versus Balanced pairs, with Original .29 a single reference run. Same draw submissions do not imply zero cost.'});
  }finally{await browser.close();for(const entry of preserved)assert.equal(sha(fs.readFileSync(entry.file)),entry.sha,'Old study remains untouched: '+entry.file);}
})().catch(error=>{console.error(error);process.exitCode=1;});
