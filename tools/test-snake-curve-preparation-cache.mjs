import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js';

// Exact differential test against the frozen v1.02.07.00 curve implementation.
// Instrumentation is confined to these in-memory test modules; production has
// no profiling branches. The timing below is a curve-only microbenchmark, NOT
// a game-frame/FPS measurement or a promise for another computer.
const beforeUrl=new URL('./baseline/live-snake-curve-v1.02.07.00.js',import.meta.url);
const afterUrl=new URL('../src/render/live-snake-curve.js',import.meta.url);
const sourceBefore=readFileSync(beforeUrl,'utf8'),sourceAfter=readFileSync(afterUrl,'utf8');
function instrument(source,label){
  for(const needle of ['function configureTail(){','function integrate(a0,a1,d){',
    'for(let i=0;i<n;i++)angles[i]=mix(old[i],next[i],p);'])
    assert.equal(source.split(needle).length,2,`${label}: instrumentation anchor ${needle}`);
  return `export const work={tailConfigurations:0,knotPreparations:0,integrations:0};\n`+source
    .replace('function configureTail(){','function configureTail(){work.tailConfigurations++;')
    .replace('function integrate(a0,a1,d){','function integrate(a0,a1,d){work.integrations++;')
    .replace('for(let i=0;i<n;i++)angles[i]=mix(old[i],next[i],p);',
      'work.knotPreparations++;for(let i=0;i<n;i++)angles[i]=mix(old[i],next[i],p);');
}
const dataModule=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const before=await import(dataModule(instrument(sourceBefore,'before')));
const after=await import(dataModule(instrument(sourceAfter,'after')));
const liveUrl=new URL('../src/render/live-snake.js',import.meta.url);
const baselineLiveSource=readFileSync(liveUrl,'utf8').replace(/from\s+(['"])([^'"]+)\1/g,(match,quote,url)=>{
  const resolved=url.startsWith('./live-snake-curve.js')?beforeUrl.href:new URL(url,liveUrl).href;
  return `from ${quote}${resolved}${quote}`;
});
const {createLiveSnakeRenderer:baselineRenderer}=await import(dataModule(baselineLiveSource));
let samples=0,phaseChecks=0,nativeFrames=0,deepCaptures=0;
const keys=['x','y','tx','ty','angle','curve'];
function exactPoint(a,b,label){
  for(const key of keys)assert.equal(b[key],a[key],`${label} ${key}`);
  samples++;
}
function exactCurve(a,b,label){
  for(const key of ['total','prefixLength','materialProgress'])assert.equal(b[key],a[key],`${label} ${key}`);
  for(let i=-3;i<=35;i++){
    const distance=a.total*i/32;
    exactPoint(a.sample(distance,{}),b.sample(distance,{}),label);
    for(const direction of [-1,1])assert.equal(b.ribbonSpan(distance,9.37,direction),
      a.ribbonSpan(distance,9.37,direction),`${label} strip`);
  }
  phaseChecks++;
}
function fixture(module,{rotation=0,mirror=1,visibleTailSpan=28,fallback=false}={}){
  const c=Math.cos(rotation),s=Math.sin(rotation),arc=18*Math.PI/2,join=20+arc;
  function transform(out,x,y,tx,ty,curve){
    y*=mirror;ty*=mirror;
    out.x=100+c*x-s*y;out.y=200+s*x+c*y;
    out.tx=c*tx-s*ty;out.ty=s*tx+c*ty;out.angle=Math.atan2(out.ty,out.tx);out.curve=curve*mirror;return out;
  }
  const straight={sample(d,out={}){return transform(out,d-20,0,1,0,0);},ribbonSpan(d,m){return m;}};
  const turned={sample(d,out={}){
    if(d<=20)return transform(out,-18,d-38,0,1,0);
    if(d>=join)return transform(out,d-join,0,1,0,0);
    const angle=(d-20)/18;
    return transform(out,-18*Math.cos(angle),-18+18*Math.sin(angle),Math.sin(angle),Math.cos(angle),-1/18);
  },ribbonSpan(d,m){return d<20?Math.min(m,20-d):d<join?Math.min(m,1.25,join-d):m;}};
  let source=straight,oldJoin=20;
  if(fallback){
    source=module.createJoinedPrefixCurve(straight,0,20,130,turned,0,join,join+110,visibleTailSpan)
      .update(.437).setCompression(2.75);
    oldJoin=source.prefixLength;
  }
  return module.createJoinedPrefixCurve(source,0,oldJoin,oldJoin+110,turned,0,join,join+110,visibleTailSpan);
}
const phases=[0,0,Number.MIN_VALUE,1e-12,.01,.17,.43,.43,.72,1,1,.43,.43,0,0,-1,2,.9999999999999999];
for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5,.371])for(const mirror of [-1,1])
  for(const visibleTailSpan of [0,28])for(const fallback of [false,true]){
    const options={rotation,mirror,visibleTailSpan,fallback},a=fixture(before,options),b=fixture(after,options);
    exactCurve(a,b,'constructor phase zero');
    // Compression may be set before the first update; first update(0) must
    // still prepare every required value. Same-phase changes are not skipped.
    a.setCompression(1.25);b.setCompression(1.25);exactCurve(a,b,'compression before update');
    for(const phase of phases){
      a.update(phase);b.update(phase);exactCurve(a,b,'phase');
      for(const compression of [0,0,1.25,1.25,3.75,0]){
        a.setCompression(compression);b.setCompression(compression);exactCurve(a,b,'compression');
      }
      exactCurve(a.clone(),b.clone(),'clone');
      const savedA=a.snapshot(),savedB=b.snapshot();
      a.update(.921).setCompression(2);b.update(.921).setCompression(2);
      exactCurve(savedA,savedB,'detached snapshot');
      // Mirrors the captured-geometry activation order: new pose, old pose,
      // same old pose again, then new pose. Never cache by timestamp alone.
      for(const p of [phase,phase,.921,phase]){
        a.update(p).setCompression(0);b.update(p).setCompression(0);exactCurve(a,b,'reactivation');
      }
    }
  }

// Repeated interrupted captures must remain independent from earlier curves,
// including snapshots of a fallback heading field. Covers no ancestor-stack
// growth or stale reactivation after clone/snapshot.
const line={sample(s,out={}){return Object.assign(out,{x:s,y:0,tx:1,ty:0,angle:0,curve:0});},
  ribbonSpan(s,maximum){return maximum;}};
let chainA=fixture(before,{fallback:true}),chainB=fixture(after,{fallback:true});
for(let i=0;i<1200;i++){
  const oldA=chainA,oldB=chainB;
  chainA=before.createJoinedPrefixCurve(chainA,0,18,36,line,0,18,36).update(.4).setCompression(i%5);
  chainB=after.createJoinedPrefixCurve(chainB,0,18,36,line,0,18,36).update(.4).setCompression(i%5);
  if(i%25===0)exactCurve(chainA,chainB,'deep interrupted capture');
  oldA.update(.9);oldB.update(.9);
  if(i%25===0)exactCurve(chainA,chainB,'independent detached source');
  deepCaptures++;
}

// Production renderer integration, no Canvas needed: native two-cell and
// longer retreat rails, mirrored/rotated staircase, interrupted commits and
// alternating geometry snapshots sharing the same mutable underlying curve.
for(const count of [2,3,7])for(let rotation=0;rotation<4;rotation++)for(const mirror of [-1,1]){
  const map=({x,y})=>{y*=mirror;for(let i=0;i<rotation;i++)[x,y]=[-y,x];return {x:x+20,y:y+20};};
  const body=Array.from({length:count},(_,i)=>map({x:count-1-i,y:0}));
  const a={body:structuredClone(body),dir:{x:body[0].x-body[1].x,y:body[0].y-body[1].y}},b=structuredClone(a);
  const ra=baselineRenderer(),rb=createLiveSnakeRenderer();ra.capture(a,0);rb.capture(b,0);
  let t=0;
  for(let step=0;step<15;step++){
    const oldA=structuredClone(a.body),oldB=structuredClone(b.body),tail=map({x:-1-Math.floor(step/2),y:Math.ceil(step/2)});
    for(const entity of [a,b]){
      entity.body=[...entity.body.slice(1),{...tail}];entity.reversing=true;
      entity.dir={x:entity.body[0].x-entity.body[1].x,y:entity.body[0].y-entity.body[1].y};
    }
    ra.recordStep(a,{oldBody:oldA,t,duration:436,wasReversing:step>0});
    rb.recordStep(b,{oldBody:oldB,t,duration:436,wasReversing:step>0});
    const savedA=ra.getWorldGeometry(a,t+91),savedB=rb.getWorldGeometry(b,t+91);
    for(const offset of [0,1,91,172,319,435,436,91]){
      const ga=ra.getWorldGeometry(a,t+offset),gb=rb.getWorldGeometry(b,t+offset);
      for(const key of ['length','tailSpan','bodyEndDistance','compression','birth'])assert.equal(gb[key],ga[key],`native ${key}`);
      for(let n=0;n<=48;n++){
        exactPoint(ga.sample(ga.length*n/48),gb.sample(gb.length*n/48),'native curve');
        if(n%4===0)exactPoint(savedA.sample(savedA.length*n/48),savedB.sample(savedB.length*n/48),'old geometry activation');
      }
      nativeFrames++;
    }
    t+=step%3===1?227:436;
  }
}

function resetWork(module){for(const key of Object.keys(module.work))module.work[key]=0;}
function activationWork(module){
  const curve=fixture(module,{fallback:true});curve.update(.437).setCompression(2.75);resetWork(module);
  for(let i=0;i<2000;i++)curve.update(.437).setCompression(2.75);
  return {...module.work};
}
const workBefore=activationWork(before),workAfter=activationWork(after);
assert.ok(workBefore.knotPreparations>=2000,'exercise expensive interrupted fallback, not only analytic/straight case');
assert.equal(workAfter.knotPreparations,0);assert.equal(workAfter.tailConfigurations,0);assert.equal(workAfter.integrations,0);
const untouchedBefore=await import(dataModule(sourceBefore)),untouchedAfter=await import(dataModule(sourceAfter));
function bench(module){
  const curve=fixture(module,{fallback:true}),point={};let checksum=0;
  const begin=performance.now();
  for(let frame=0;frame<160;frame++){
    const phase=(frame%97+1)/100,compression=(frame%13)*.25;
    for(let sample=0;sample<80;sample++){
      curve.update(phase).setCompression(compression);
      curve.sample(curve.total*sample/80,point);checksum+=point.x+point.y;
    }
  }
  return {milliseconds:performance.now()-begin,checksum};
}
for(let i=0;i<2;i++){bench(untouchedBefore);bench(untouchedAfter);}
const timings={before:[],after:[]};let checksum;
for(let i=0;i<6;i++)for(const [label,module] of i%2?[['after',untouchedAfter],['before',untouchedBefore]]:
  [['before',untouchedBefore],['after',untouchedAfter]]){
    const result=bench(module);timings[label].push(result.milliseconds);
    if(checksum===undefined)checksum=result.checksum;else assert.equal(result.checksum,checksum,'microbenchmark exact geometry checksum');
  }
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return (sorted[2]+sorted[3])/2;};
console.log(JSON.stringify({ok:true,exactEquality:true,samples,phaseChecks,nativeFrames,deepCaptures,
  unchangedActivationCalls:2000,workBefore,workAfter,
  microbenchmark:{scope:'curve-only repeated activation + sampling; not whole-game FPS',
    framePhases:160,samplesPerPhase:80,rounds:6,beforeMedianMs:median(timings.before),afterMedianMs:median(timings.after),timings}},null,2));
