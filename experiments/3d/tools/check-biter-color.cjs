// Same-state calibration, independent of concurrently edited v4 art. Never
// compare different moments or compensate a recorder problem with scene light.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(runtime,'playwright')),sharp=require(path.join(runtime,'sharp'));
const {videoColor,rec709Candidate}=require('./video-color.cjs');
const root=path.resolve(__dirname,'..'),prefix=path.join(root,'preview-v4-color');
const ffmpeg=process.env.MAZE_FFMPEG||'C:/ffmpeg/bin/ffmpeg.exe',ffprobe=path.join(path.dirname(ffmpeg),'ffprobe.exe');
function run(executable,args){const r=spawnSync(executable,args,{encoding:'utf8',maxBuffer:20e6});assert.equal(r.status,0,r.stderr);return r.stdout;}
const encode=args=>run(ffmpeg,['-hide_banner','-loglevel','error','-y',...args]);
const metadata=file=>JSON.parse(run(ffprobe,['-v','error','-select_streams','v:0','-show_entries','stream=width,height,pix_fmt,color_range,color_space,color_transfer,color_primaries','-of','json',file])).streams[0];
const rgb=file=>sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
async function errors(reference,other,roi){
  const a=await rgb(reference),b=await rgb(other);assert.deepEqual(a.info,b.info);
  const sets={all:{n:0,abs:0,signed:0},dark:{n:0,abs:0,signed:0},saturated:{n:0,abs:0,signed:0}};
  for(let y=roi.y;y<roi.y+roi.height;y++)for(let x=roi.x;x<roi.x+roi.width;x++){
    const i=(y*a.info.width+x)*3,r=a.data[i],g=a.data[i+1],blue=a.data[i+2],max=Math.max(r,g,blue),min=Math.min(r,g,blue);
    const lum=.2126*r+.7152*g+.0722*blue,absolute=(Math.abs(r-b.data[i])+Math.abs(g-b.data[i+1])+Math.abs(blue-b.data[i+2]))/3;
    const signed=.2126*(b.data[i]-r)+.7152*(b.data[i+1]-g)+.0722*(b.data[i+2]-blue);
    for(const key of ['all',...(lum>3&&lum<40?['dark']:[]),...(max>55&&max-min>40?['saturated']:[])]){
      sets[key].n++;sets[key].abs+=absolute;sets[key].signed+=signed;
    }
  }
  return Object.fromEntries(Object.entries(sets).map(([key,v])=>[key,{pixels:v.n,meanAbs8bit:v.abs/v.n,signedLuma8bit:v.signed/v.n}]));
}
(async()=>{
  const report={errors:[],captures:[],notes:['All image/video comparisons use one frozen archived-v3 scene per preset at1920×1080 DPR1.',
    'Old encoding is reproduced from the exact same screencastJPEG; existing v3 movies are not modified.',
    'Full range alone is not an error. Untagged transfer/primaries leave browser interpretation ambiguous.']};
  const archived=fs.readFileSync(path.join(root,'models/crystal-biter-v3.mjs'),'utf8'),gait=fs.readFileSync(path.join(root,'biter-gait-v3.mjs'),'utf8');
  const renderer=fs.readFileSync(path.join(root,'renderer.mjs'),'utf8').replace('this.renderer=new THREE.WebGLRenderer','globalThis.__colorScene=this;this.renderer=new THREE.WebGLRenderer');
  report.archivedModelSha256=crypto.createHash('sha256').update(archived).digest('hex');
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    await page.route(u=>u.pathname.endsWith('/renderer.mjs'),r=>r.fulfill({contentType:'text/javascript',body:renderer}));
    await page.route(u=>u.pathname.endsWith('/models/crystal-biter.mjs'),r=>r.fulfill({contentType:'text/javascript',body:archived}));
    await page.route(u=>u.pathname.endsWith('/biter-gait.mjs'),r=>r.fulfill({contentType:'text/javascript',body:gait}));
    await page.goto('http://127.0.0.1:8093/experiments/3d/?v=0.3.46&player=crystal&lighting=current');
    await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:60000});
    await page.addStyleTag({content:'#pauseCurtain{visibility:hidden!important}*,*::before,*::after{animation:none!important;transition:none!important}'});
    report.defaultPreset=await page.evaluate(()=>document.getElementById('neonPolish').value);assert.equal(report.defaultPreset,'before');
    await page.evaluate(async()=>{
      if(!MazeBiters3DEngine.snapshot().paused)MazeBiters3DEngine.pause();
      const s=__colorScene,{CONCEPT_MAZE,CONCEPT_SNAKES}=await import('/experiments/3d/maze-layout.mjs');
      globalThis.__colorRender=s.render.bind(s);s.render=()=>{};
      globalThis.__colorState={generation:991,started:true,paused:true,time:1000,maze:CONCEPT_MAZE,cols:19,rows:15,
        player:{id:1,x:4,y:11,visual:{x:4,y:11},dir:{x:.707106781,y:.707106781},dead:false,hidden:false,shield:false,powered:false},
        snakes:CONCEPT_SNAKES.map((o,i)=>({...o,id:i+1,dir:{x:o.body[0].x-o.body[1].x,y:o.body[0].y-o.body[1].y},motion:null,reversing:false})),bites:[],predations:[]};
      s.reset(__colorState);s.resetView();s.playerYaw=Math.PI/4;
      globalThis.__colorFreeze=()=>{for(let i=0;i<90;i++)__colorRender(__colorState,1/120,1/120);s.renderer.getContext().finish();};
      __colorFreeze();
    });
    const roi=await page.evaluate(()=>{const b=document.getElementById('world').getBoundingClientRect(),hud=document.getElementById('hud').getBoundingClientRect();
      const top=Math.max(b.y,hud.bottom);return{x:Math.ceil(b.x),y:Math.ceil(top),width:Math.floor(b.width),height:Math.floor(b.bottom-top)};});
    report.roi=roi;
    for(const preset of ['before','balanced']){
      await page.evaluate(preset=>{const select=document.getElementById('neonPolish');select.value=preset;select.dispatchEvent(new Event('change'));__colorFreeze();},preset);
      const state=await page.evaluate(()=>({snapshot:JSON.stringify(__colorState),camera:__colorScene.camera.matrixWorld.elements.slice(),projection:__colorScene.camera.projectionMatrix.elements.slice(),
        diagnostics:__colorScene.diagnostics(),preset:document.getElementById('neonPolish').value}));
      assert.equal(state.diagnostics.playerModel,'crystal-biter-v3');
      const stem=`${prefix}-${preset}`,png=stem+'-direct.png',jpeg=stem+'-capture.jpg';
      await page.screenshot({path:png});
      let resolveFrame;const gotFrame=new Promise(resolve=>resolveFrame=resolve);let frame;
      await page.screencast.start({size:{width:1920,height:1080},quality:95,onFrame:f=>{if(!frame){frame=f;resolveFrame();}}});
      await gotFrame;await page.screencast.stop();fs.writeFileSync(jpeg,frame.data);
      await page.screenshot({path:stem+'-direct-after.png'});
      const stability=await errors(png,stem+'-direct-after.png',roi);assert.ok(stability.all.meanAbs8bit<.01,'Scene must stay pixel-stable while capturing');
      const item={preset,state,stability,jpegMetadata:metadata(jpeg),pngToJpeg:await errors(png,jpeg,roi),variants:{}};
      for(const variant of ['old','rec709','srgb709']){
        const movie=stem+`-${variant}.mp4`,decoded=stem+`-${variant}-decoded.png`;
        const pipeline=variant==='srgb709'?videoColor:rec709Candidate;
        encode(['-loop','1','-i',jpeg,'-t','1',...(variant!=='old'?['-vf',pipeline.encodeFilter]:[]),
          '-an','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-r','60','-movflags','+faststart',
          ...(variant!=='old'?pipeline.tags:[]),movie]);
        encode(['-i',movie,...(variant!=='old'?['-vf',pipeline.decodeFilter]:[]),'-frames:v','1',decoded]);
        item.variants[variant]={movie,metadata:metadata(movie),pngToDecoded:await errors(png,decoded,roi),jpegToDecoded:await errors(jpeg,decoded,roi)};
      }
      report.captures.push(item);
    }
    report.presetOnlyDifference=await errors(prefix+'-before-direct.png',prefix+'-balanced-direct.png',roi);
    await page.close();
    // Compare actual Edge compositing, not merely FFmpeg's RGB extraction.
    const playback=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    await playback.route('**/__color-playback__*',route=>{
      const src=new URL(route.request().url()).searchParams.get('src');
      route.fulfill({contentType:'text/html',body:`<!doctype html><style>html,body{margin:0;background:#000}video{display:block;width:1920px;height:1080px}</style><video muted playsinline src="/experiments/3d/${src}"></video>`});
    });
    for(const item of report.captures)for(const [variant,data]of Object.entries(item.variants)){
      await playback.goto('http://127.0.0.1:8093/__color-playback__?src='+encodeURIComponent(path.basename(data.movie)));
      const played=await playback.evaluate(async()=>{const v=document.querySelector('video');await v.play();await new Promise(resolve=>setTimeout(resolve,300));v.pause();return{time:v.currentTime,ready:v.readyState,error:v.error?.message??null,width:v.videoWidth,height:v.videoHeight};});
      assert.ok(played.time>0&&!played.error&&played.width===1920,'H.264 must actually play in Edge');
      const screenshot=`${prefix}-${item.preset}-${variant}-browser.png`;await playback.screenshot({path:screenshot});
      data.browser={...played,pngToBrowser:await errors(`${prefix}-${item.preset}-direct.png`,screenshot,roi),jpegToBrowser:await errors(`${prefix}-${item.preset}-capture.jpg`,screenshot,roi)};
      if(variant==='srgb709'){
        assert.ok(Math.abs(data.browser.pngToBrowser.dark.signedLuma8bit)<1,'Selected pipeline must preserve dark scene brightness in actual Edge playback');
        assert.ok(data.browser.pngToBrowser.all.meanAbs8bit<2.5,'Selected pipeline must stay close to the native PNG');
        assert.equal(data.metadata.color_transfer,'iec61966-2-1');assert.equal(data.metadata.color_range,'tv');
      }
    }
    await playback.close();assert.deepEqual(report.errors,[]);
  }finally{await browser.close();}
  fs.writeFileSync(prefix+'-report.log',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
