// Explicit real-WebGL QA. Run from the production/test server origin:
// await (await import('/after/qa/creature-material-browser.js')).verifyCreatureMaterialGPU()
// This intentionally performs CPU reads in the TEST, never in the renderer.
// strictPixelEquality/passed never tolerate a different byte. correctnessPassed
// separately allows ONLY sub-one-byte premultiplied RGB conversion error while
// requiring exact alpha/opaque RGB and all orientation/source/lifecycle checks.
import {createCreatureNeonMaterial} from '../src/render/creature-neon-material.js?v=1.02.16.00';
import {enhancePixels,emissionPixels} from '../src/render/neon-material.js?v=1.02.06.00';

const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const read=(ctx,w,h)=>CanvasRenderingContext2D.prototype.getImageData.call(ctx,0,0,w,h).data;
const same=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
const freshMetric=()=>({images:0,pixels:0,differingPixels:0,differingBytes:0,alphaMismatches:0,
  opaqueRGBMismatches:0,maxError:0,maxChannelError:[0,0,0,0],maxOpaqueRGBError:0,
  maxPremultipliedRGBError:0,totalAbsoluteError:0,examples:[],worstPremultiplied:null});
function compare(actual,expected,metric,label,width){
  metric.images++;metric.pixels+=actual.length/4;
  const result={label,differingPixels:0,differingBytes:0,alphaMismatches:0,maxError:0,maxPremultipliedRGBError:0};
  for(let i=0;i<actual.length;i+=4){
    let different=false;
    for(let channel=0;channel<4;channel++){
      const error=Math.abs(actual[i+channel]-expected[i+channel]);
      metric.maxChannelError[channel]=Math.max(metric.maxChannelError[channel],error);
      metric.maxError=Math.max(metric.maxError,error);result.maxError=Math.max(result.maxError,error);
      metric.totalAbsoluteError+=error;
      if(error){different=true;metric.differingBytes++;result.differingBytes++;}
      if(channel===3&&error){metric.alphaMismatches++;result.alphaMismatches++;}
      if(channel<3){
        const visibleError=Math.abs(actual[i+channel]*actual[i+3]-expected[i+channel]*expected[i+3])/255;
        if(visibleError>metric.maxPremultipliedRGBError){
          metric.maxPremultipliedRGBError=visibleError;
          metric.worstPremultiplied={label,x:(i/4)%width,y:Math.floor(i/4/width),channel,
            actual:Array.from(actual.subarray(i,i+4)),expected:Array.from(expected.subarray(i,i+4))};
        }
        result.maxPremultipliedRGBError=Math.max(result.maxPremultipliedRGBError,visibleError);
        if(actual[i+3]===255&&expected[i+3]===255){
          metric.maxOpaqueRGBError=Math.max(metric.maxOpaqueRGBError,error);
          if(error)metric.opaqueRGBMismatches++;
        }
      }
    }
    if(different){
      metric.differingPixels++;result.differingPixels++;
      if(metric.examples.length<8)metric.examples.push({label,x:(i/4)%width,y:Math.floor(i/4/width),
        actual:Array.from(actual.subarray(i,i+4)),expected:Array.from(expected.subarray(i,i+4))});
    }
  }
  return result;
}
function fillSource(context,width,height,phase){
  const image=context.createImageData(width,height),p=image.data;
  const alphas=[0,1,2,7,16,32,64,96,127,128,192,254,255];
  const colors=[[0,0,0],[255,255,255],[90,90,90],[48,0,0],[49,0,0],[100,88,88],[100,87,87],
    [255,20,70],[50,220,80],[100,40,190],[80,170,220],[230,170,70],[30,60,90],[250,230,220]];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,chosen=colors[(x+3*y+phase*5)%colors.length];
    for(let channel=0;channel<3;channel++)p[i+channel]=phase===2?(x*17+y*31+channel*83+phase*29)%256:chosen[channel];
    p[i+3]=alphas[(Math.floor(x/colors.length)+y+phase)%alphas.length];
  }
  // Four deliberately distinct, opaque corners catch X/Y mirroring and
  // row/column/canvas-size mistakes independently of the repeating pattern.
  for(const [x,y,color]of [[0,0,[255,0,0,255]],[width-1,0,[0,255,0,255]],
    [0,height-1,[0,0,255,255]],[width-1,height-1,[255,240,0,255]]])p.set(color,(y*width+x)*4);
  context.putImageData(image,0,0);
}
function eventOnce(surface,name,timeout=5000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{surface.removeEventListener(name,handler);reject(Error(`${name} timed out`));},timeout);
    function handler(event){
      clearTimeout(timer);surface.removeEventListener(name,handler);
      // restoreContext is not permitted until the loss dispatch has completed.
      // A Promise microtask still runs inside that dispatch in some browsers.
      setTimeout(()=>resolve({defaultPrevented:event.defaultPrevented}),0);
    }
    surface.addEventListener(name,handler,{once:true});
  });
}

export async function verifyCreatureMaterialGPU({exerciseLoss=false}={}){
  const started=performance.now(),owned=[],glContexts=[];
  const report={passed:false,strictPixelEquality:false,correctnessPassed:false,realWebGL:false,checks:0,poses:0,
    sourceMutationBytes:0,orientationChecks:0,orientationFailures:0,processorCPUReads:0,processorGPUReads:0,
    material:freshMetric(),emission:freshMetric(),uploadInput:freshMetric(),testGPUReadbacks:0,
    cases:[],loss:{requested:exerciseLoss,exercised:false},errors:[]};
  const check=(condition,message)=>{report.checks++;if(!condition)throw Error(message);};
  const factory=(w,h)=>{
    const surface=canvas(w,h),get=surface.getContext.bind(surface);let wrapped=false;
    surface.getContext=(type,...args)=>{
      const context=get(type,...args);
      if(type==='webgl'&&context&&!glContexts.some(entry=>entry.gl===context)){
        const original=context.readPixels.bind(context);
        context.readPixels=(...values)=>{report.processorGPUReads++;return original(...values);};
        const upload=context.texImage2D.bind(context);
        context.texImage2D=(...values)=>{
          upload(...values);
          const input=values.at(-1);
          if(!input?.getContext)return;
          // TEST-ONLY read of the uploaded texture isolates Canvas→WebGL
          // unpremultiplication from shader/output-copy rounding.
          const target=context.getParameter(context.FRAMEBUFFER_BINDING);
          const framebuffer=context.createFramebuffer();
          try{
            context.bindFramebuffer(context.FRAMEBUFFER,framebuffer);
            context.framebufferTexture2D(context.FRAMEBUFFER,context.COLOR_ATTACHMENT0,context.TEXTURE_2D,
              context.getParameter(context.TEXTURE_BINDING_2D),0);
            if(context.checkFramebufferStatus(context.FRAMEBUFFER)!==context.FRAMEBUFFER_COMPLETE)
              throw Error('QA uploaded texture framebuffer incomplete');
            const bytes=new Uint8Array(input.width*input.height*4);
            original(0,0,input.width,input.height,context.RGBA,context.UNSIGNED_BYTE,bytes);report.testGPUReadbacks++;
            compare(bytes,read(input.getContext('2d'),input.width,input.height),report.uploadInput,
              `upload${report.testGPUReadbacks}`,input.width);
          }finally{context.bindFramebuffer(context.FRAMEBUFFER,target);context.deleteFramebuffer(framebuffer);}
        };
        glContexts.push({surface,gl:context});
      }
      if(type==='2d'&&context&&!wrapped){
        wrapped=true;const original=context.getImageData.bind(context);
        context.getImageData=(...values)=>{report.processorCPUReads++;return original(...values);};
      }
      return context;
    };
    owned.push(surface);return surface;
  };
  const processor=createCreatureNeonMaterial({makeCanvas:factory,maxSize:768});
  const reference=canvas(1,1),referenceContext=reference.getContext('2d',{willReadFrequently:true});
  const source=canvas(1,1),sourceContext=source.getContext('2d',{willReadFrequently:true});
  const run=(width,height,phase,strength,label)=>{
    if(source.width!==width||source.height!==height){source.width=width;source.height=height;}
    fillSource(sourceContext,width,height,phase);
    const before=new Uint8ClampedArray(read(sourceContext,width,height));
    const previous=processor.stats(),result=processor.process(source,{strength});
    check(!!result,`${label}: actual WebGL processing failed: ${processor.stats().lastError}`);
    check(result.material.width===width&&result.material.height===height&&result.emission.width===width&&result.emission.height===height,`${label}: native output dimensions`);
    const after=processor.stats();check(after.uploads===previous.uploads+1&&after.passes===previous.passes+2,`${label}: one upload/two GPU passes`);
    check(after.readbacks===0,`${label}: renderer reports no frame readbacks`);
    const unchanged=read(sourceContext,width,height);for(let i=0;i<before.length;i++)if(before[i]!==unchanged[i])report.sourceMutationBytes++;
    if(reference.width!==width||reference.height!==height){reference.width=width;reference.height=height;}
    const entry={label,width,height,phase,strength};
    for(const [kind,convert]of [['material',enhancePixels],['emission',emissionPixels]]){
      const image=referenceContext.createImageData(width,height);image.data.set(convert(before,strength));
      referenceContext.putImageData(image,0,0);
      const expected=read(referenceContext,width,height),actual=read(result[kind].getContext('2d'),width,height);
      entry[kind]=compare(actual,expected,report[kind],label,width);
      for(const [x,y]of [[0,0],[width-1,0],[0,height-1],[width-1,height-1]]){
        const offset=(y*width+x)*4;report.orientationChecks++;
        if(!same(actual.subarray(offset,offset+4),expected.subarray(offset,offset+4)))report.orientationFailures++;
      }
    }
    report.cases.push(entry);report.poses++;return result;
  };
  try{
    for(const [width,height]of [[17,11],[80,80],[160,160],[672,672]]){
      for(const strength of [0,.7,1,2])run(width,height,0,strength,`${width}x${height}/strength${strength}`);
      // Same object identity, different bytes: catches stale material/emission
      // caching and confirms no horizontal/vertical gradient is left behind.
      run(width,height,2,.7,`${width}x${height}/mutable`);
    }
    check(glContexts.length>0,'a real WebGL context was allocated');report.realWebGL=true;
    report.webGLVersion=glContexts.at(-1).gl.getParameter(glContexts.at(-1).gl.VERSION);
    if(exerciseLoss){
      const {surface,gl}=glContexts.at(-1),extension=gl.getExtension('WEBGL_lose_context');
      if(extension){
        const loss=eventOnce(surface,'webglcontextlost');extension.loseContext();
        report.loss.event=await loss;
        const before=processor.stats();check(processor.process(source)===null,'loss returns native-fallback signal');
        check(processor.stats().uploads===before.uploads,'loss cannot upload stale material');
        const restored=eventOnce(surface,'webglcontextrestored');extension.restoreContext();
        report.loss.restoredEvent=await restored;
        run(80,80,2,.7,'after-context-restoration');
        check(processor.stats().recoveries>=1,'restoration reconstructs GPU resources');report.loss.exercised=true;
      }else report.loss.reason='WEBGL_lose_context unavailable';
    }
    report.glErrors=glContexts.filter(({gl})=>!gl.isContextLost()).map(({gl})=>gl.getError());
    check(report.glErrors.every(error=>error===0),'driver reported no WebGL error');
    check(report.processorCPUReads===0&&report.processorGPUReads===0,'processor itself made no CPU/GPU pixel readbacks');
    check(report.sourceMutationBytes===0,'input artwork is read-only');
    report.strictPixelEquality=report.material.differingBytes===0&&report.emission.differingBytes===0;
    report.materialAlphaExact=report.material.alphaMismatches===0;
    report.emissionAlphaExact=report.emission.alphaMismatches===0;
    report.passed=report.strictPixelEquality&&report.orientationFailures===0&&report.sourceMutationBytes===0;
    report.criteria='Strict byte equality after both CPU and GPU Canvas round trips; no tolerance silently accepted. Error metrics include straight and premultiplied RGB so low-alpha rounding remains visible.';
  }catch(error){report.errors.push(String(error?.stack||error));}
  finally{
    // Preserve accuracy evidence even when optional recovery fails; a timeout
    // must not make already-measured alpha/rounding results disappear.
    report.strictPixelEquality=report.material.differingBytes===0&&report.emission.differingBytes===0;
    report.materialAlphaExact=report.material.alphaMismatches===0;
    report.emissionAlphaExact=report.emission.alphaMismatches===0;
    report.criteria='Strict byte equality after both CPU and GPU Canvas round trips; no tolerance silently accepted. Upload diagnostics and premultiplied RGB distinguish conversion rounding from shader errors.';
    report.beforeDispose=processor.stats();processor.dispose();report.afterDispose=processor.stats();
    const released=owned.every(surface=>surface.width===1&&surface.height===1)&&report.afterDispose.bytes===0;
    report.disposalReleased=released;if(!released){report.passed=false;report.errors.push('GPU/output surfaces not released');}
    report.correctnessCriteria={
      actualGPU:report.realWebGL,
      exactOpaqueRGB:report.material.opaqueRGBMismatches===0&&report.emission.opaqueRGBMismatches===0,
      exactAlpha:report.materialAlphaExact&&report.emissionAlphaExact,
      premultipliedRGBErrorBelowOneByte:report.material.maxPremultipliedRGBError<1&&report.emission.maxPremultipliedRGBError<1,
      exactOrientation:report.orientationChecks>0&&report.orientationFailures===0,
      unchangedSource:report.sourceMutationBytes===0,
      noProcessorReadbacks:report.processorCPUReads===0&&report.processorGPUReads===0,
      noErrors:report.errors.length===0&&report.glErrors?.every(error=>error===0)===true,
      lifecycle:released&&(!exerciseLoss||report.loss.exercised)
    };
    report.correctnessPassed=Object.values(report.correctnessCriteria).every(value=>value===true);
    report.precisionNote='Strict equality is reported independently and is not rounded into a pass. Canvas/WebGL conversion can differ at translucent edges by a fractional premultiplied byte; the correctness criterion is explicitly <1/255 per RGB channel, with alpha and opaque RGB exact. Straight RGB error can be large at very low alpha and is still reported in full.';
    reference.width=reference.height=source.width=source.height=1;report.elapsedMs=performance.now()-started;
  }
  return report;
}
