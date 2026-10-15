// Developer-only GPU checks. Invoked explicitly from a localhost QA tab;
// ordinary gameplay never imports this module or allocates these surfaces.
import {loadFantasyPlayerArt,composeFantasyPose,drawFantasyMouth} from '../src/render/fantasy-player-art.js?v=1.02.13.00';
import {createFantasyPlayerTurns} from '../src/render/fantasy-player-turn.js?v=1.02.14.00';
import {buildFantasyMouthIntakeMask} from '../src/render/fantasy-mouth-intake.js?v=1.02.13.00';
const dirs=['right','down','left','up'];
const makeCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
export async function verifyFantasyTurns(){
  const report={passed:false,checks:0,profiles:[]};
  const check=(ok,label)=>{report.checks++;if(!ok)throw Error(label);};
  for(const profile of ['hd','4k']){
    const art=await loadFantasyPlayerArt(profile,{makeCanvas}),s=art.size;
    const out=makeCanvas(s,s),expected=makeCanvas(s,s),source=makeCanvas(s,s),mask=makeCanvas(s,s);
    const ctx=out.getContext('2d'),native=expected.getContext('2d'),maskCtx=mask.getContext('2d');
    const masks=new Map(),turns=createFantasyPlayerTurns({makeCanvas,yieldTask:()=>new Promise(r=>setTimeout(r,0))});
    const drawMaskPose=(target,variant,dir,closure,x,y,size)=>{
      if(dir==='up')return;
      const index=Math.round(closure*48),key=dir+':'+index;
      if(!masks.has(key)){
        composeFantasyPose(source.getContext('2d'),art.sets[`p1:normal:${dir}`],index,0);
        const c=makeCanvas(s,s),g=c.getContext('2d'),data=g.createImageData(s,s);
        data.data.set(buildFantasyMouthIntakeMask({width:s,height:s,data:pixels(source)},dirs.indexOf(dir),closure));
        g.putImageData(data,0,0);masks.set(key,c);
      }
      target.drawImage(masks.get(key),x,y,size,size);
    };
    try{
      check(await turns.prepare({player:art.groups},drawMaskPose),profile+' renderer ready');
      let samples=0,endpointChecks=0;
      for(const palette of ['p1','p2','ai'])for(const light of ['normal','bright'])
        for(const from of dirs)for(const to of dirs){if(from===to)continue;
          for(const index of [0,16,48]){
            const entity={},set={fantasy:true,art:art.sets[`${palette}:${light}:${to}`],size:s,composite:source,context:source.getContext('2d'),compositeKey:null};
            turns.request(entity,from,to,1000);
            for(const dt of [0,22.5,45,67.5,90]){
              const base={__liveMouth:{set,index,blink:12}},d=turns.decorate(entity,1000+dt,base),live=d.__liveMouth;
              ctx.clearRect(0,0,s,s);
              if(!turns.draw(ctx,live,0,0,s,s))drawFantasyMouth(ctx,live,0,0,s,s);
              const actual=pixels(out);check(actual.some((v,i)=>i%4===3&&v>180),'nonempty morph');samples++;
              const pose=live.turnPose;
              if(!pose||pose.mix===0){
                const direction=pose?.from||to;
                composeFantasyPose(native,art.sets[`${palette}:${light}:${direction}`],index,12);
                const original=pixels(expected);
                check(actual.every((v,i)=>v===original[i]),'native cardinal pixels '+profile+palette+light+from+to+dt);endpointChecks++;
              }
              if(pose&&dt===22.5){
                maskCtx.clearRect(0,0,s,s);check(turns.drawMask(maskCtx,live,0,0,s,s),'mask drawn');
                const m=pixels(mask);check(m.filter((v,i)=>i%4===3&&v>0).length<s*s*.45,'aperture never fills skull');
                ctx.clearRect(0,0,s,s);check(turns.drawLeader(ctx,live,0,0,s,s),'leader follows morph');
              }
            }
            turns.reset(entity);
          }
          if(samples%180===0)await new Promise(r=>setTimeout(r,0));
        }
      const stats=turns.diagnostics();check(!stats.error&&!stats.lost,'no GPU failure');
      check(stats.silhouetteEntries<=192,'bounded native cache');
      report.profiles.push({profile,samples,endpointChecks,stats});
    }finally{
      turns.dispose();for(const c of [out,expected,source,mask,...masks.values()])c.width=c.height=1;
    }
  }
  report.passed=true;return report;
}
