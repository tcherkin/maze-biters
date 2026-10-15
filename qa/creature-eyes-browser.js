// Explicit real-WebGL proof. No fallback is considered a successful check.
import {createHunterEyeMasks} from '../src/render/creature-neon-eyes.js?v=1.02.16.00';
import {createDragonTurnRenderer} from '../src/render/dragon-turn/renderer.js?v=1.02.16.00';
import {dragonTurnRig} from '../src/render/dragon-turn/rig.js?v=1.02.15.02';
import {loadDragonKinArt} from '../src/render/dragon-kin-art.js?v=1.02.15.02';
import {composeFantasyPose} from '../src/render/fantasy-player-art.js?v=1.02.15.03';
import {DIRECTIONS,planTurn,sampleTurn} from '../src/render/fantasy-turn/turn.js';
const makeCanvas=(w=1,h=w)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
export async function verifyCreatureEyes(profile='hd',{board=false}={}){
  const pack=await loadDragonKinArt(profile,{makeCanvas}),size=pack.size;
  const masks=createHunterEyeMasks({arts:new Map(Object.entries(pack.sets)),makeCanvas});
  const surfaces=Array.from({length:4},()=>makeCanvas(size));
  const [source,art,eye,after]=surfaces.map((c,i)=>c.getContext('2d',i?{willReadFrequently:true}:undefined));
  const drawPose=(ctx,key,direction,closure,blink,x,y,width)=>{
    composeFantasyPose(source,pack.sets[`${key}:${direction}`],Math.round(closure*48),Math.round(blink*24));ctx.drawImage(source.canvas,x,y,width,width);
  };
  const renderer=createDragonTurnRenderer({size,drawPose,drawEyeMaskPose:masks.draw,artRig:dragonTurnRig});
  const report={profile,passed:false,frames:0,nonemptyMasks:0,zeroMasks:0,primaryDifferentBytes:0,primaryMaximumDifference:0,maskOutsideArtPixels:0};
  const phases=[0,.05,.2,.33,.5,.67,.85,.999,1],scenarios=[[0,0],[18,12],[48,24]];
  const clear=ctx=>ctx.clearRect(0,0,size,size),read=ctx=>ctx.getImageData(0,0,size,size).data;
  try{
    for(const palette of ['h1','h3','h4'])for(const from of DIRECTIONS)for(const to of DIRECTIONS)if(from!==to){
      const plan=planTurn(from,to),variant=`${palette}:normal`;
      for(const [frame,blink]of scenarios)for(const phase of phases){
        const pose=sampleTurn(plan,phase);clear(art);renderer.draw(art,variant,pose,frame/48,blink/24,0,0,size);const original=read(art);
        clear(eye);renderer.drawEyeMask(eye,variant,pose,frame/48,blink/24,0,0,size);const mask=read(eye);let mass=0;
        for(let i=0;i<mask.length;i+=4){mass+=mask[i+3];if(mask[i+3]>0&&original[i+3]===0)report.maskOutsideArtPixels++;}
        const cardinal=pose.mix===0?pose.from:pose.mix===1?pose.to:null;
        if(blink===24||cardinal==='up'){
          if(mass!==0)throw Error(`Hidden eye emitted ${palette} ${from}>${to} ${frame}/${blink} @${phase}: ${mass}`);
          report.zeroMasks++;
        }else if(mass>0)report.nonemptyMasks++;
        clear(after);renderer.draw(after,variant,pose,frame/48,blink/24,0,0,size);const next=read(after);
        for(let i=0;i<next.length;i++){const delta=Math.abs(next[i]-original[i]);if(delta)report.primaryDifferentBytes++;report.primaryMaximumDifference=Math.max(report.primaryMaximumDifference,delta);}
        report.frames++;
      }
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(!report.nonemptyMasks||!renderer.diagnostics().eyeDrawCount)throw Error('Eye shader never produced a real intermediate mask');
    if(report.primaryDifferentBytes)throw Error(`Eye pass changed primary art: ${JSON.stringify(report)}`);
    if(report.maskOutsideArtPixels)throw Error(`Eye mask escaped approved art: ${JSON.stringify(report)}`);
    if(board){
      const view=makeCanvas(1260,560),ctx=view.getContext('2d'),cell=140;view.id='creature-eye-proof';ctx.fillStyle='#192033';ctx.fillRect(0,0,view.width,view.height);
      for(let row=0;row<4;row++)for(let i=0;i<phases.length;i++){
        const pose=sampleTurn(planTurn('right',row<2?'up':'down'),phases[i]),blink=row%2?12:0;
        clear(art);renderer.draw(art,'h4:normal',pose,18/48,blink/24,0,0,size);
        clear(eye);renderer.drawEyeMask(eye,'h4:normal',pose,18/48,blink/24,0,0,size);
        ctx.drawImage(art.canvas,i*cell,row*cell,cell,cell);
        ctx.save();ctx.globalCompositeOperation='screen';ctx.drawImage(eye.canvas,i*cell,row*cell,cell,cell);ctx.restore();
        ctx.fillStyle='white';ctx.font='12px sans-serif';ctx.fillText(`${Math.round(phases[i]*100)}% / blink ${blink}`,i*cell+3,row*cell+12);
      }document.getElementById(view.id)?.remove();document.body.append(view);
    }
    report.renderer=renderer.diagnostics();report.passed=true;return report;
  }finally{renderer.dispose();masks.dispose();for(const c of surfaces)c.width=c.height=1;}
}
