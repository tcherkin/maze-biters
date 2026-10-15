// Numeric certification of the Dragon Kin-specific anatomy. No raster
// substitution or GPU screenshots: source calibration is checked directly.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';

const root=process.env.MAZE_GAME_ROOT?pathToFileURL(process.env.MAZE_GAME_ROOT.replaceAll('\\','/')+'/'):new URL('../',import.meta.url);
const study=process.env.DRAGON_ART_STUDY?pathToFileURL(process.env.DRAGON_ART_STUDY.replaceAll('\\','/')+'/'):
  new URL('../../../2026-08-24/maze-biters-work-chat-crash-git/experiments/dragon-kin-sprites/',root);
const {dragonCage,dragonJawY,dragonRearY,dragonKinTurnRig,dragonBackCoverage,DRAGON_BACK_SURFACE}=await import(new URL('src/render/dragon-kin-turn.js',root));
const {triangleMinimum,signedArea}=await import(new URL('src/render/fantasy-turn/paired-mesh.js',root));
const {canonicalPair}=await import(new URL('src/render/fantasy-turn/geometry.js',root));
const {DIRECTIONS,planTurn,sampleTurn}=await import(new URL('src/render/fantasy-turn/turn.js',root));
const {createFantasyTurnClock,FANTASY_TURN_MS}=await import(new URL('src/render/fantasy-turn-clock.js',root));
const {createFantasyPlayerTurns}=await import(new URL('src/render/fantasy-player-turn.js',root));
const {createTurnRenderer}=await import(new URL('src/render/fantasy-turn/renderer.js',root));
const {forwardJawY,RIG,SIZE_FIT,EYES}=await import(new URL('rig.mjs',study));
const landmarks=JSON.parse(await readFile(new URL('landmarks.json',study),'utf8'));
const close=(actual,expected,label,tolerance=1e-10)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);
const interpolate=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const unfit=x=>x===0||x===1?x*160:80+(x*160-80)/1.125;
const fit=x=>(80+(x-80)*SIZE_FIT.scaleX)/160;
// Independent authored contours: every upper/lower boundary point must map
// to the SAME eye index, rather than a nearby but incorrect white/pupil region.
assert.equal(EYES.right[0].points.length,9);assert.equal(EYES.down[0].points.length,9);
const authoredEyePairs=EYES.right[0].points.flatMap(([x,top,bottom],i)=>[
  [x,top,EYES.down[0].points[i][0],EYES.down[0].points[i][1]],
  [x,bottom,EYES.down[0].points[i][0],EYES.down[0].points[i][2]],
]);
// Measured on the approved 700px masters, before width fit: two separate
// green connected components (alpha>127, G>35, G>1.25R, G>1.25B). Each has
// eight radial boundary samples (-135deg in 45deg steps) plus its centroid.
// Pin these measurements independently so a positive but stretched mesh
// cannot silently lose its small-scale anchors again.
const measuredScalePairs=[
  [27.256758357068684,71.43449838516315,14.529727550628364,73.031384623714],
  [34.98240501780406,72.1201450458985,20.93005407291122,71.88885400313967],
  [40.1058987237729,74.0366513399297,24.80903984399172,75.55272537491638],
  [44.902405017804135,79.16014504589853,27.535768358625532,79.43171114599687],
  [42.09387893145168,86.27161895954616,27.782928935153468,86.28458600823912],
  [34.98240501780406,86.04014504589857,20.93005407291122,87.18028257456835],
  [30.06902304110208,84.07352702260052,16.58235752115848,83.7794076977496],
  [25.953833589232563,79.16014504589853,14.75862550148262,79.43171114599687],
  [34.98240501780406,79.16014504589853,20.93005407291122,79.43171114599687],
  [25.743969955347318,85.84220532993123,13.377668850860697,87.29519780838964],
  [32.20894624048151,86.06718161506541,17.806177606177606,86.53513513513514],
  [36.62129255508559,87.89483530046137,20.957853545180505,88.57203062470367],
  [41.00894624048158,92.30718161506543,23.17760617760619,91.72370656370657],
  [37.380927268588856,97.47916264317278,21.135640393021696,95.05316935055066],
  [32.20894624048151,98.84432447220833,17.806177606177606,97.94084942084945],
  [27.73195016302609,96.78417769252086,14.75147631145172,94.77840785843246],
  [24.34608909762432,92.30718161506543,12.914749034749027,91.72370656370657],
  [32.20894624048151,92.30718161506543,17.806177606177606,91.72370656370657],
];
const scalePolygons=[measuredScalePairs.slice(0,8),measuredScalePairs.slice(9,17)].map(rows=>rows.map(([x,y])=>[fit(x),y/160]));
function insidePolygon(point,polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function assertAuthoredPair(cage,[x,y,u,v],closure,label){
  const a=[fit(x),forwardJawY(x,y,'right',closure)/160],b=[fit(u),forwardJawY(u,v,'down',closure)/160];
  const matches=cage.a.map((point,i)=>point.every((n,k)=>Math.abs(n-a[k])<1e-12)?i:-1).filter(i=>i>=0);
  assert.equal(matches.length,1,`${label}: keep exactly one authored source anchor`);
  for(let axis=0;axis<2;axis++)close(cage.b[matches[0]][axis],b[axis],`${label}: exact matching front anchor`);
}
assert.equal(SIZE_FIT.scaleX,1.125);assert.equal(SIZE_FIT.scaleY,1);
assert.equal(RIG.rightLift,16);assert.equal(RIG.downLift,20);assert.equal(RIG.rearDrop,6);
assert.equal(dragonKinTurnRig.cage,dragonCage);assert.ok(Object.isFrozen(dragonKinTurnRig));
let jawChecks=0,rearChecks=0,cageRequests=0,triangleBounds=0,areaSamples=0,vertexChecks=0,clockChecks=0;
let coverageChecks=0,distortionChecks=0,projectionChecks=0,endpointChecks=0,maximumVisibleStretch=0;
let authoredEyeChecks=0,measuredScaleChecks=0,scaleDistortionChecks=0,maximumScaleStretch=0;
// Local affine stretch catches long, narrow eye/lip hooks which can remain
// mathematically nonfolding. Singular values are independent of mirror/scale.
function localStretch(a,p){
  const ax=a[1][0]-a[0][0],ay=a[1][1]-a[0][1],bx=a[2][0]-a[0][0],by=a[2][1]-a[0][1],det=ax*by-ay*bx;
  const ux=p[1][0]-p[0][0],uy=p[1][1]-p[0][1],vx=p[2][0]-p[0][0],vy=p[2][1]-p[0][1];
  const j=[(ux*by-vx*ay)/det,(-ux*bx+vx*ax)/det,(uy*by-vy*ay)/det,(-uy*bx+vy*ax)/det];
  const trace=j.reduce((s,x)=>s+x*x,0),d=j[0]*j[3]-j[1]*j[2],disc=Math.sqrt(Math.max(0,trace*trace-4*d*d));
  return Math.sqrt((trace+disc)/2);
}
for(let frame=0;frame<49;frame++)for(const direction of ['right','down'])for(let x=0;x<=160;x+=2)for(let y=90;y<=160;y+=.5){
  const closure=frame/48;
  close(dragonJawY(x,y,direction,closure),forwardJawY(x,y,direction,closure),'turn cage jaw must match the authored mouth warp');
  if(y<=RIG.fixedThroughY)close(dragonJawY(x,y,direction,closure),y,'eyes/upper lip stay rigid during mouth closure');
  jawChecks++;
}
assert.equal(landmarks.rearCapSeam160.length,160,'independently measured rear boundary must be available');
for(const mirror of [false,true])for(let x=0;x<160;x++)for(let frame=0;frame<49;frame++)for(const offset of [-.0001,0,.0001])for(const fractionalX of [0,.25,.999]){
  const sourceX=Math.max(0,Math.min(159,Math.floor(mirror?160-x-fractionalX:x+fractionalX)));
  const seam=landmarks.rearCapSeam160[sourceX],y=seam+offset,closure=frame/48;
  close(dragonRearY(x+fractionalX,y,closure,mirror),y+(offset<=0?RIG.rearDrop*(1-closure):0),'rear cap ownership follows the actual unmirrored source column for each direction');
  rearChecks++;
}
// The two sides of the authored rear cap are NOT symmetric. This explicit
// witness prevents a future refactor from silently ignoring the mirror flag.
assert.notEqual(landmarks.rearCapSeam160[30],landmarks.rearCapSeam160[130]);
assert.notEqual(dragonRearY(30,86,0,false),dragonRearY(30,86,0,true));
assert.ok(Object.isFrozen(DRAGON_BACK_SURFACE));
assert.ok(DRAGON_BACK_SURFACE.shellCompleteAt>0&&DRAGON_BACK_SURFACE.shellCompleteAt<=.82);
assert.ok(dragonKinTurnRig.fragment.includes('t/'+DRAGON_BACK_SURFACE.shellCompleteAt.toFixed(2)),'CPU/GPU shell timing must agree');
for(let x=0;x<=160;x+=4)for(let y=0;y<=160;y+=4){
  let previous=0;
  for(let step=0;step<=200;step++){
    const t=step/200,coverage=dragonBackCoverage(x/160,y/160,t);
    assert.ok(Number.isFinite(coverage)&&coverage>=0&&coverage<=1);
    assert.ok(coverage+1e-12>=previous,'an occluded eye, lip or cheek cannot reappear later in the same turn');
    if(step===0)assert.equal(coverage,0);
    if(t>=DRAGON_BACK_SURFACE.shellCompleteAt)assert.equal(coverage,1,'the complete rear shell must own hidden features');
    previous=coverage;coverageChecks++;
  }
}
let globalMinimum=Infinity;
const unique=new Set();
for(const kind of ['front','back'])for(const mirror of [false,true])for(let frame=0;frame<49;frame++){
  const closure=frame/48,cage=dragonCage(kind,closure,mirror),base=dragonCage(kind,0,mirror),closed=dragonCage(kind,1,mirror);
  cageRequests++;unique.add(cage);
  assert.equal(dragonCage(kind,closure,mirror),cage,'same quantized anatomical pose reuses its bounded cache');
  assert.equal(cage.a.length,cage.b.length);assert.equal(cage.a.length,base.a.length);
  const used=new Set(cage.triangles.flat());assert.equal(used.size,cage.a.length,'certification must not discard difficult eye/lip landmarks');
  if(kind==='front'){
    for(const [i,pair]of authoredEyePairs.entries()){
      assertAuthoredPair(cage,pair,closure,`authored eye ${i}, frame ${frame}, mirror ${mirror}`);authoredEyeChecks++;
    }
    for(const [i,pair]of measuredScalePairs.entries()){
      assertAuthoredPair(cage,pair,closure,`measured scale ${i}, frame ${frame}, mirror ${mirror}`);measuredScaleChecks++;
    }
    assertAuthoredPair(cage,[70,14,80,11],closure,'measured crown peak');
  }
  for(let i=0;i<cage.a.length;i++){
    assert.equal(cage.a[i].length,2);assert.equal(cage.b[i].length,2);
    assert.ok([...cage.a[i],...cage.b[i]].every(Number.isFinite));
    close(cage.a[i][0],base.a[i][0],'mouth cannot change side registration');
    close(cage.b[i][0],base.b[i][0],'mouth cannot change front/back registration');
    const x=unfit(base.a[i][0]),y=base.a[i][1]*160,u=unfit(closed.b[i][0]),v=closed.b[i][1]*160;
    const edge=x===0||x===160||y===0||y===160;
    close(cage.a[i][1]*160,edge?y:forwardJawY(x,y,'right',closure),'every actual side cage vertex follows the art rig');
    if(kind==='front'){
      const frontY=base.b[i][1]*160;
      close(cage.b[i][1]*160,edge?frontY:forwardJawY(u,frontY,'down',closure),'every front cage vertex follows the art rig');
    }else close(cage.b[i][1]*160,edge?v:dragonRearY(u,v,closure,mirror),'every rear cage vertex follows the measured cap rig');
    if(kind==='back'){
      // One coherent horizontal map for every row. Apply it AFTER the width
      // fit: applying a raw30px projection first pushes x140 outside160px.
      close(cage.b[i][0],cage.a[i][0]+30/160*Math.sin(Math.PI*cage.a[i][0]),'rear projection shares one fitted head-plane map');
      assert.ok(cage.b[i][0]>=0&&cage.b[i][0]<=1,'projected features cannot cross the enclosing canvas boundary');
      projectionChecks++;
    }
    vertexChecks++;
  }
  for(const tri of cage.triangles){
    assert.equal(tri.length,3);assert.equal(new Set(tri).size,3);
    assert.ok(tri.every(i=>Number.isInteger(i)&&i>=0&&i<cage.a.length));
    const bound=triangleMinimum(cage.a,cage.b,tri);
    assert.ok(bound.minimum>1e-7,`${kind}/${mirror}/${frame}: folded triangle anywhere in the complete route`);
    globalMinimum=Math.min(globalMinimum,bound.minimum);triangleBounds++;
    // Analytic quadratic minima cover the entire interval. Independent dense
    // samples also validate the reflection actually used by the renderer.
    for(let step=0;step<=100;step++){
      const points=tri.map(i=>interpolate(cage.a[i],cage.b[i],step/100));
      const area=signedArea(...points);assert.ok(area>1e-7);
      if(mirror){const reflected=points.map(([x,y])=>[1-x,y]);close(signedArea(...reflected),-area,'horizontal reflection preserves the same nonfolding geometry');}
      areaSamples++;
      if(kind==='front'&&(step===15||step===30||step===50)){
        const source=tri.map(i=>cage.a[i]),center=[0,1].map(k=>source.reduce((sum,p)=>sum+p[k]/3,0));
        if(scalePolygons.some(polygon=>insidePolygon(center,polygon))){
          const stretch=localStretch(source,points),limit=step===15?1.04:step===30?1.07:1.11;
          assert.ok(Number.isFinite(stretch)&&stretch<=limit,`cheek scale stretched ${stretch}x at ${step}% turn, frame ${frame}`);
          maximumScaleStretch=Math.max(maximumScaleStretch,stretch);scaleDistortionChecks++;
        }
      }
      if(kind==='back'){
        const raw=tri.map(i=>[unfit(base.a[i][0]),base.a[i][1]*160]);
        const x=raw.reduce((s,p)=>s+p[0]/3,0),y=raw.reduce((s,p)=>s+p[1]/3,0);
        const inEye=x>=70&&x<=112&&y>=48&&y<=82,inMouth=x>=78&&x<=142&&y>=92&&y<=142;
        if(inEye||inMouth){
          const source=tri.map(i=>cage.a[i]),uv=source.reduce((s,p)=>s.map((v,k)=>v+p[k]/3),[0,0]);
          const visible=1-dragonBackCoverage(...uv,step/100);
          if(visible>=.2){
            const stretch=localStretch(source,points);
            assert.ok(Number.isFinite(stretch)&&stretch<=2,'visible eye/lip overstretched '+stretch+'x at '+JSON.stringify({mirror,frame,step}));
            maximumVisibleStretch=Math.max(maximumVisibleStretch,stretch);distortionChecks++;
          }
        }
      }
    }
  }
}
assert.equal(cageRequests,196);assert.equal(unique.size,147,'front49 plus two separately calibrated rear49 caches');
assert.equal(authoredEyeChecks,18*49*2);assert.equal(measuredScaleChecks,18*49*2);
assert.ok(scaleDistortionChecks>0,'small cheek-scale geometry must be covered by distortion checks');
for(let frame=0;frame<49;frame++)assert.notEqual(dragonCage('back',frame/48,false),dragonCage('back',frame/48,true),'asymmetric rear artwork requires independent mirrored cache entries');
assert.equal(FANTASY_TURN_MS,90);
for(const from of DIRECTIONS)for(const to of DIRECTIONS)if(from!==to){
  const actor=Object.freeze({dir:from,x:7,y:3}),clock=createFantasyTurnClock(),plan=planTurn(from,to);
  clock.request(actor,from,to,1000);
  for(let step=0;step<=180;step++){
    const elapsed=step/2,pose=clock.sample(actor,1000+elapsed),reference=sampleTurn(plan,elapsed/90);
    assert.deepEqual(pose,reference,'enemies use exactly the protagonist turn envelope and route');
    if(!pose.done){const pair=canonicalPair(pose.from,pose.to,pose.mix);assert.equal(pair.kind,pair.end==='down'?'front':'back');}
    assert.equal(pose.done,elapsed===90);clockChecks++;
  }
  if((from==='right'&&to==='left')||(from==='left'&&to==='right')){
    assert.deepEqual(plan.route,[from,'down',to],'both horizontal reversals must expose the front, not the rear');
    assert.equal(clock.sample(actor,1045).from,'down');
    const before=clock.sample(actor,1044.999),after=clock.sample(actor,1045.001);
    assert.ok(Math.abs(after.angle-before.angle)>.00008,'no midpoint easing pause between the two quarters');
  }
  assert.deepEqual(actor,{dir:from,x:7,y:3});
}
// Exercise the REAL renderer's cardinal bypass with a recording graphics API.
// This is a protocol test, not a fake pixel/GPU-rendering claim: no cardinal is
// allowed to enter the morph, change its mouth/blink phase or resample its art.
for(const size of [80,160]){
  let gpuDraws=0,uploads=0,calls=[],identifier=0;
  const gl=new Proxy({}, {get(_target,key){
    if(key==='isContextLost')return ()=>false;
    if(key==='getExtension')return ()=>null;
    if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
    if(key==='getUniformLocation')return (_program,name)=>name;
    if(key==='drawArrays')return ()=>{gpuDraws++;};
    if(key==='texImage2D')return ()=>{uploads++;};
    if(String(key).startsWith('create'))return ()=>({id:identifier++});
    if(/^[A-Z_0-9]+$/.test(String(key)))return 0;
    return ()=>{};
  }});
  const factory=()=>({width:0,height:0,addEventListener(){},removeEventListener(){},getContext:type=>type==='webgl'?gl:{}});
  const rig={...dragonKinTurnRig,cage(){throw Error('A cardinal sprite entered the morph cage');}};
  const renderer=createTurnRenderer({size,artRig:rig,canvasFactory:factory,drawPose(...args){calls.push(args);}});
  const context={};
  for(const palette of ['h1','h3','h4'])for(const from of DIRECTIONS)for(const to of DIRECTIONS)if(from!==to){
    const plan=planTurn(from,to),phases=plan.route.length===3?[0,.5,1]:[0,1];
    for(const phase of phases)for(let frame=0;frame<49;frame++)for(const eyeFrame of [0,12,24]){
      const pose=sampleTurn(plan,phase),direction=phase===0?from:phase===1?to:plan.route[1];
      renderer.draw(context,palette+':normal',pose,frame/48,eyeFrame/24,11,17,size);
      assert.deepEqual(calls.pop(),[context,palette+':normal',direction,frame/48,eyeFrame/24,11,17,size]);
      endpointChecks++;
    }
  }
  assert.equal(calls.length,0);assert.equal(gpuDraws,0);assert.equal(uploads,0);
  assert.equal(renderer.diagnostics().drawCount,0);renderer.dispose();
}
// An enemy uses its own turn renderer but can never request the player-only
// snake intake overlay. This does not require a GPU or any decoded sprites.
let allocated=0;
const turns=createFantasyPlayerTurns({makeCanvas(){allocated++;throw Error('Unexpected allocation');},yieldTask:async()=>{}});
assert.equal(turns.drawMask({}, {set:{art:{kind:'hunter'}},turnPose:{from:'right',to:'down',mix:.5}},0,0,80,80),false);
assert.equal(allocated,0);turns.dispose();
const adapter=await readFile(new URL('src/render/fantasy-player-turn.js',root),'utf8');
assert.match(adapter,/drawMaskPose:family==='player'\?drawMaskPose:undefined/,'hunter renderer must not receive the protagonist aperture compositor');
console.log('Dragon semantic checks: '+JSON.stringify({coverageChecks,distortionChecks,maximumVisibleStretch,projectionChecks,endpointChecks,authoredEyeChecks,measuredScaleChecks,scaleDistortionChecks,maximumScaleStretch}));
console.log(`PASS Dragon Kin turn anatomy: ${cageRequests} cage requests (${unique.size} unique), ${triangleBounds} exact full-interval positive-area bounds, ${areaSamples} independent/reflected area samples, ${vertexChecks} calibrated cage vertices, ${jawChecks} authored jaw comparisons, ${rearChecks} measured rear-boundary comparisons, ${clockChecks} exact shared-clock samples; minimum area ${globalMinimum}. Enemy intake overlay stays disabled.`);
