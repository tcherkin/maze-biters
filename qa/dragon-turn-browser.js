// Run on the production origin. This is an explicit real-WebGL integration
// check, not a substitute for visual judgment of the approved animation.
import {createFantasyPlayerTurns} from '../src/render/fantasy-player-turn.js?v=1.02.15.03';
import {createDragonTurnRenderer} from '../src/render/dragon-turn/renderer.js?v=1.02.15.03';
import {dragonTurnRig} from '../src/render/dragon-turn/rig.js?v=1.02.15.02';
import {loadDragonKinArt,DRAGON_KIN_PALETTES} from '../src/render/dragon-kin-art.js?v=1.02.15.02';
import {composeFantasyPose} from '../src/render/fantasy-player-art.js?v=1.02.15.03';
import {FANTASY_TURN_MS} from '../src/render/fantasy-turn-clock.js?v=1.02.15.02';
import {DIRECTIONS,planTurn,sampleTurn} from '../src/render/fantasy-turn/turn.js?v=1.02.15.02';

const makeCanvas=(width=1,height=width)=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
const phases=[0,.001,.1,.2,.3,.33,.4,.5,.6,.67,.7,.8,.83,.9,.999,1];
const scenarios=[[0,0],[18,12],[48,24]];

export async function verifyDragonTurnBrowser(profile='4k',{referenceBase=null,exerciseCache=true}={}){
  const started=performance.now();
  const report={profile,passed:false,checks:0,frames:0,endpointChecks:0,adapterFrames:0,referenceFrames:0,
    maxAdapterByteDifference:0,maxReferenceByteDifference:0,turnDurationMs:FANTASY_TURN_MS,palettes:[...DRAGON_KIN_PALETTES]};
  const check=(value,message)=>{report.checks++;if(!value)throw Error(`${profile}: ${message}`);};
  const equal=(a,b,label)=>{
    let differences=0,max=0;check(a.length===b.length,`${label}: buffer size`);
    for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);if(delta)differences++;max=Math.max(max,delta);}
    check(differences===0,`${label}: ${differences} differing bytes, maximum ${max}`);return max;
  };
  const pack=await loadDragonKinArt(profile,{makeCanvas}),size=pack.size;
  check(size===(profile==='hd'?80:160),'native HD/4K resolution');
  check(FANTASY_TURN_MS===90,'all whole turns retain the 90 ms clock');
  check(Object.keys(pack.sets).length===12&&Object.keys(pack.sets).every(key=>/^(h1|h3|h4):normal:(right|down|left|up)$/.test(key)),
    'only the three approved normal-state enemy palettes are loaded');
  const surfaces=Array.from({length:4},()=>makeCanvas(size)),contexts=surfaces.map(c=>c.getContext('2d',{willReadFrequently:true}));
  const [directContext,adapterContext,nativeContext,referenceContext]=contexts;
  // Match both approved source staging and the adapter's final ordinary-2D
  // frame surface. Canvas CPU/GPU conversion is not an anatomy difference.
  const stages=Array.from({length:4},()=>makeCanvas(size));surfaces.push(...stages);
  const [sourceStage,directStage,nativeStage,referenceStage]=stages.map(c=>c.getContext('2d'));
  const pixels=context=>context.getImageData(0,0,size,size).data;
  const clear=context=>context.clearRect(0,0,size,size);
  const copy=(stage,target)=>{clear(target);target.drawImage(stage.canvas,0,0);};
  const drawPose=(context,variant,direction,closure,blink,x,y,width)=>{
    if(x!==0||y!==0||width!==size)throw Error('QA requires native poses');
    composeFantasyPose(sourceStage,pack.sets[`${variant}:${direction}`],Math.round(closure*48),Math.round(blink*24));
    context.drawImage(sourceStage.canvas,0,0);
  };
  let direct=null,reference=null,adapter=null;
  try{
    // Construction must compile the actual shader. Unsupported WebGL is a
    // failure here, never a successful native-fallback rendering result.
    direct=createDragonTurnRenderer({size,drawPose,artRig:dragonTurnRig});
    if(referenceBase){
      const base=new URL(referenceBase,location.href);
      const [r,rig]=await Promise.all([import(new URL('restart-renderer.js',base)),import(new URL('restart-rig.js',base))]);
      reference=r.createCleanCapTurnRenderer({size,drawPose,artRig:rig.restartDragonKinRig});
    }
    adapter=createFantasyPlayerTurns({makeCanvas,yieldTask});
    check(await adapter.prepare({hunter:pack.groups}),'active adapter preparation succeeds');
    const prepared=adapter.diagnostics();
    check(prepared.hunter.ready&&!prepared.hunter.error,'active enemy renderer is ready without optional fallback');
    check(!prepared.ready,'an enemy-only pack cannot initialize/change the protagonist renderer');
    check(prepared.hunter.nativeSize===size,'active adapter uses native resolution');
    check(prepared.hunter.durationMs===90&&prepared.hunter.halfTurnMs===90,'90 and 180 degree turns have the same approved whole-turn duration');
    // Thirty posed rear caps plus six invariant side caps; the three down
    // caps are never sampled by front turns and are no longer generated.
    check(prepared.hunter.cleanCapEntries===36,'common walking and extreme bite caps are warmed without unused front material');
    report.prepared=prepared.hunter;
    for(const palette of DRAGON_KIN_PALETTES)for(const from of DIRECTIONS)for(const to of DIRECTIONS)if(from!==to){
      const plan=planTurn(from,to),variant=`${palette}:normal`;
      for(const [frame,blink]of scenarios){
        const entity={direction:from,x:7,y:11},snapshot=JSON.stringify(entity);
        adapter.request(entity,from,to,1000);
        const descriptor={__liveMouth:{set:{fantasy:true,art:pack.sets[`${variant}:${to}`]},index:frame,blink}};
        for(const phase of phases){
          const time=1000+phase*90,pose=sampleTurn(plan,(time-1000)/90);
          clear(directStage);direct.draw(directStage,variant,pose,frame/48,blink/24,0,0,size);copy(directStage,directContext);
          const expected=pixels(directContext);check(expected.some((v,i)=>i%4===3&&v>0),'rendered turn has visible pixels');report.frames++;
          const visual=adapter.decorate(entity,time,descriptor);
          if(phase<1){
            check(!!visual.__liveMouth.turnPose,'active turn is present before 90 ms');
            clear(adapterContext);check(adapter.draw(adapterContext,visual.__liveMouth,0,0,size,size)===true,'adapter draws the new enemy turn, not native fallback');
            report.maxAdapterByteDifference=Math.max(report.maxAdapterByteDifference,equal(pixels(adapterContext),expected,`${palette} ${from}>${to} ${frame}/${blink} @${phase} adapter`));
            report.adapterFrames++;
          }else check(visual===descriptor&&!visual.__liveMouth.turnPose,'turn releases the native descriptor exactly at 90 ms');
          if(pose.from===pose.to||pose.mix<1e-9||pose.mix>1-1e-9){
            clear(nativeStage);drawPose(nativeStage,variant,pose.mix>1-1e-9?pose.to:pose.from,frame/48,blink/24,0,0,size);copy(nativeStage,nativeContext);
            equal(expected,pixels(nativeContext),`${palette} ${from}>${to} native cardinal`);report.endpointChecks++;
          }
          if(reference){
            clear(referenceStage);reference.draw(referenceStage,variant,pose,frame/48,blink/24,0,0,size);copy(referenceStage,referenceContext);
            report.maxReferenceByteDifference=Math.max(report.maxReferenceByteDifference,equal(expected,pixels(referenceContext),'approved isolated reference'));report.referenceFrames++;
          }
          check(adapter.drawMask(adapterContext,visual.__liveMouth,0,0,size,size)===false,'enemy never acquires protagonist intake-mask semantics');
        }
        check(JSON.stringify(entity)===snapshot,'turn rendering cannot alter AI position or direction');
        check(!descriptor.__liveMouth.turnPose,'visual decoration cannot mutate the logical descriptor');adapter.reset(entity);
      }
      await yieldTask();
    }
    // All closure frames exercise real-GPU uploads and the bounded native
    // clean-material cache; eyelids must not multiply material preparation.
    const pose={from:'right',to:'up',mix:.5};
    direct.draw(directContext,'h1:normal',pose,0,0,0,0,size);
    const beforeBlink=direct.diagnostics();
    for(let blink=1;blink<25;blink++)direct.draw(directContext,'h1:normal',pose,0,blink/24,0,0,size);
    const afterBlink=direct.diagnostics();
    check(afterBlink.capBuildCount===beforeBlink.capBuildCount&&afterBlink.capUploadCount===beforeBlink.capUploadCount,'eyelids do not multiply clean-cap cache entries or uploads');
    if(exerciseCache)for(const palette of DRAGON_KIN_PALETTES){
      for(let frame=0;frame<49;frame++)direct.draw(directContext,`${palette}:normal`,pose,frame/48,0,0,0,size);
      await yieldTask();
    }
    report.renderer=direct.diagnostics();report.adapter=adapter.diagnostics().hunter;
    for(const diagnostic of [report.renderer,report.adapter]){
      check(!diagnostic.lost&&!diagnostic.disposed&&!diagnostic.error,'GPU renderer remains healthy');
      check(diagnostic.capBuildCount>0&&diagnostic.drawCount>0,'the clean-cap morph pipeline actually executed');
      check(diagnostic.cleanCapEntries<=64&&diagnostic.cleanCapBytes===0&&diagnostic.cleanCapTextureEntries===diagnostic.cleanCapEntries&&diagnostic.cleanCapTextureBytes===diagnostic.cleanCapEntries*size*size*4,'native GPU cap cache stays bounded without retained CPU pixel copies');
      check(diagnostic.maskDrawCount===0&&!diagnostic.maskReady,'enemy has no hidden intake-mask render passes');
    }
    if(exerciseCache)check(report.renderer.cleanCapEntries===64&&report.renderer.capEvictionCount>0,'full-mouth coverage exercises finite LRU eviction');
    direct.dispose();direct.dispose();adapter.dispose();adapter.dispose();reference?.dispose();
    report.disposed=direct.diagnostics();
    check(report.disposed.disposed&&report.disposed.cleanCapBytes===0&&report.disposed.cleanCapTextureBytes===0&&report.disposed.nativeSurfaceCount===0&&report.disposed.geometryBytes===0&&report.disposed.silhouetteBytes===0,'renderer disposal releases all retained native surfaces and caches');
    check(!adapter.diagnostics().hunter.ready,'adapter disposal releases its renderer');
    let refused=false;try{direct.draw(directContext,'h1:normal',pose,0,0,0,0,size);}catch{refused=true;}check(refused,'disposed renderer cannot silently draw');
    report.passed=true;report.elapsedMs=Math.round(performance.now()-started);
    report.interpretation=reference?'Real GPU: active adapter and approved isolated reference are byte-identical; native endpoints, mouths, eyelids, timing and bounded resources pass. Visual naturalness remains a separate review.':
      'Real GPU: active adapter and direct approved production port are byte-identical. Exact experiment/source parity is independently pinned by tools/test-dragon-turn-restart.mjs; no cross-origin reference was requested. Visual naturalness remains a separate review.';
    return report;
  }finally{adapter?.dispose();direct?.dispose();reference?.dispose();for(const surface of surfaces)surface.width=surface.height=1;}
}

export async function verifyDragonTurnBoth(options={}){
  const results=[];for(const profile of ['hd','4k']){results.push(await verifyDragonTurnBrowser(profile,options));await yieldTask();}
  const result={passed:results.every(r=>r.passed),results};globalThis.dragonTurnIntegrationQA=result;return result;
}
