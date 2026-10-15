// Approved cylindrical cap projection. Dense row centers/radii are measured at the
// alpha128 boundary of unchanged fitted 160px right-open and up-bite sprites.
import {CAP_ROW_SIDE,CAP_ROW_REAR} from './cap-rows.js';
export const CYLINDER_ROWS={right:CAP_ROW_SIDE,up:CAP_ROW_REAR};
export const DRAGON_CYLINDER_MATERIAL=Object.freeze({
  handoffHalfPixels:1.75,minHalfWeight:.015,maxHalfWeight:.18,
  horizonInsetPixels:1.25,insetMaxRadiusFraction:.10,
  featureRejectStart:.001,featureRejectComplete:.05,shadingRadiusPixels:3.5,
  scaleFillRadiusPixels:18,eyeFillRadiusPixels:30,
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(lo,hi,x)=>{const v=clamp((x-lo)/(hi-lo),0,1);return v*v*(3-2*v);};
// Fitted160px native measurements. The original visible side pair travels to
// the OPPOSITE image edge during right→back yaw (the user's physical identity).
// Rear positions are tracked through the actual native mouth deformation.
export const DRAGON_SCALE_LANES=Object.freeze({
  side:[[29.94008,79.30223],[26.48560,92.33902]],sideWidths:[14,12],
  sourceAxes:[[21.7366,12.25003,6.69827],[18.1643,9.96879,6.08684]],
  leftAxes:[[[35.2092,9.58499,5.30008],[51.1028,7.83294,5.11641]],[[42.0338,10.52181,5.49545],[53.6594,8.30340,5.07169]],[[51.7824,11.69881,6.34535],[53.6964,8.32363,5.06838]]],
  rightAxes:[[[-31.2971,9.85373,6.12495],[-41.8867,7.77732,5.27410]],[[-37.8717,10.83001,6.09879],[-49.5905,8.55365,5.28581]],[[-48.5518,12.07136,6.73098],[-50.9673,8.88127,5.23920]]],
  inkMargin:1.2,featureStarts:.045,featureComplete:.12,solidCore:.65,solidEdge:.95,nativeRestoreStarts:.90,nativeRestoreComplete:.995,
  frames:[0,18,48],
  left:[[[13.6943,85.1457],[12.3428,96.0018]],[[14.2996,84.0137],[12.2042,95.7315]],[[14.7657,82.2633],[12.1978,95.7215]]],
  right:[[[145.8042,83.6394],[146.9083,94.9939]],[[145.1667,82.2066],[147.2298,94.3573]],[[144.5470,80.3226],[147.3493,94.1600]]],
  leftWidths:[10,8],rightWidths:[10.5,8.5],paintStarts:.62,paintComplete:.92,farStarts:.68,farComplete:.98,
});
function scaleRearPair(side,closure){
  const cfg=DRAGON_SCALE_LANES,frame=clamp(closure,0,1)*48,at=frame<=18?0:1;
  const f=(frame-cfg.frames[at])/(cfg.frames[at+1]-cfg.frames[at]);
  return cfg[side][at].map((p,i)=>p.map((v,k)=>v+(cfg[side][at+1][i][k]-v)*f));
}
function scaleAxes(side,index,closure,mirror=false){
  const cfg=DRAGON_SCALE_LANES,frame=clamp(closure,0,1)*48,at=frame<=18?0:1,f=(frame-cfg.frames[at])/(cfg.frames[at+1]-cfg.frames[at]);
  const a=side==='source'?cfg.sourceAxes[index]:cfg[side+'Axes'][at][index];
  const b=side==='source'?a:cfg[side+'Axes'][at+1][index];
  return{angle:(a[0]+(b[0]-a[0])*f)*Math.PI/180*(mirror?-1:1),radii:a.slice(1).map((v,k)=>v+(b[k+1]-v)*f+cfg.inkMargin)};
}
export function dragonScaleLeafUV(point,leaf,which='source'){
  if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||!leaf?.output||!['source','target'].includes(which))throw Error('Invalid scale leaf mapping');
  const out=leaf.output,chart=leaf[which],dx=(point[0]-out.center[0])/(out.xScale||1),dy=point[1]-out.center[1];
  const ca=Math.cos(out.angle),sa=Math.sin(out.angle),q=[(ca*dx+sa*dy)/out.radii[0],(-sa*dx+ca*dy)/out.radii[1]];
  const cb=Math.cos(chart.angle),sb=Math.sin(chart.angle),x=q[0]*chart.radii[0],y=q[1]*chart.radii[1];
  return[chart.center[0]+cb*x-sb*y,chart.center[1]+sb*x+cb*y];
}
export function dragonScaleStencil(chromaDistance,localRadius,t){
  if(![chromaDistance,localRadius,t].every(Number.isFinite))throw Error('Invalid scale stencil');
  const cfg=DRAGON_SCALE_LANES;
  const core=1-smooth(cfg.solidCore,cfg.solidEdge,localRadius),contrast=smooth(cfg.featureStarts,cfg.featureComplete,chromaDistance);
  const restore=Math.max(1-smooth(0,.06,t),smooth(cfg.nativeRestoreStarts,cfg.nativeRestoreComplete,t));
  return Math.max(core,contrast)+(1-Math.max(core,contrast))*restore;
}
export function dragonScaleLanes(t,closure=0,mirror=false){
  if(![t,closure].every(Number.isFinite)||typeof mirror!=='boolean')throw Error('Invalid scale lane');
  t=clamp(t,0,1);closure=clamp(closure,0,1);
  const cfg=DRAGON_SCALE_LANES,nearSide=mirror?'left':'right',farSide=mirror?'right':'left';
  const canonical=pair=>pair.map(([x,y])=>[mirror?160-x:x,y]);
  const end=canonical(scaleRearPair(nearSide,closure)),far=canonical(scaleRearPair(farSide,closure));
  const progress=t,reveal=smooth(cfg.farStarts,cfg.farComplete,t);
  const nearCenters=cfg.side.map((p,i)=>{
    const a=row('right',p[1]),b=row('up',end[i][1]-6*(1-closure));if(mirror)b[0]=160-b[0];
    a[1]=Math.max(a[1],Math.abs(p[0]-a[0])+.001);b[1]=Math.max(b[1],Math.abs(end[i][0]-b[0])+.001);
    const angleA=Math.asin((p[0]-a[0])/a[1]),angleB=Math.asin((end[i][0]-b[0])/b[1]);
    const center=a[0]+(b[0]-a[0])*t,radius=a[1]+(b[1]-a[1])*t;
    return[center+radius*Math.sin(angleA+(angleB-angleA)*t),p[1]+(end[i][1]-p[1])*t-8*Math.sin(Math.PI*t)];
  });
  const leaves=nearCenters.map((center,i)=>{
    const source={center:cfg.side[i].slice(),...scaleAxes('source',i,closure)},target={center:end[i],...scaleAxes(nearSide,i,closure,mirror)};
    return{source,target,output:{center,angle:source.angle+(target.angle-source.angle)*t,radii:source.radii.map((v,k)=>v+(target.radii[k]-v)*t),xScale:1}};
  });
  const farLeaves=far.map((center,i)=>{const target={center,...scaleAxes(farSide,i,closure,mirror)};return{source:target,target,
    output:{...target,center:[center[0]-8*(1-reveal),center[1]],xScale:.025+.975*reveal}};});
  return{sourceCenters:cfg.side.map(p=>p.slice()),sourceWidths:cfg.sideWidths.slice(),
    near:{centers:nearCenters,widths:cfg.sideWidths.map((w,i)=>w+(cfg[nearSide+'Widths'][i]-w)*progress),
      targetCenters:end,targetWidths:cfg[nearSide+'Widths'].slice(),owner:smooth(cfg.paintStarts,cfg.paintComplete,t),visibility:1,leaves},
    far:{centers:far.map(([x,y])=>[x-8*(1-reveal),y]),widths:cfg[farSide+'Widths'].map(w=>.35+(w-.35)*reveal),
      targetCenters:far,targetWidths:cfg[farSide+'Widths'].slice(),owner:1,visibility:reveal,leaves:farLeaves},mirror};
}
export function dragonFeatureAvailability(feature){
  if(!Number.isFinite(feature))throw Error('Invalid feature availability');
  return 1-smooth(DRAGON_CYLINDER_MATERIAL.featureRejectStart,DRAGON_CYLINDER_MATERIAL.featureRejectComplete,feature);
}
export function dragonCylinderShade({aRGB,bRGB,lowA,lowB,ratio,owner,t}){
  if(![aRGB,bRGB,lowA,lowB].every(rgb=>Array.isArray(rgb)&&rgb.length===3&&rgb.every(Number.isFinite))||
    ![ratio,owner,t].every(Number.isFinite))throw Error('Invalid cylinder shade');
  if(t<=0)return aRGB.slice();if(t>=1)return bRGB.slice();
  ratio=clamp(ratio,0,1);owner=clamp(owner,0,1);
  return aRGB.map((value,i)=>clamp(lowA[i]+(lowB[i]-lowA[i])*ratio+
    (value-lowA[i])*(1-owner)+(bRGB[i]-lowB[i])*owner,0,1));
}
// Retained arithmetic reference for the rejected ring-fill experiment only;
// the active shader uses cached harmonic textures from cap-cleaner.js.
// RGBA inputs are premultiplied; neighborSumRGBA is the sum of eight valid
// same-view ring taps, already multiplied by their cap/feature masks.
export function dragonCleanCap({originalRGBA,neighborSumRGBA,feature,t}){
  if(![originalRGBA,neighborSumRGBA].every(rgba=>Array.isArray(rgba)&&rgba.length===4&&rgba.every(Number.isFinite))||
    ![feature,t].every(Number.isFinite))throw Error('Invalid clean-cap pigment');
  if(t<=0||t>=1)return originalRGBA.slice();
  const alpha=originalRGBA[3],neighborAlpha=neighborSumRGBA[3];
  if(neighborAlpha<=.001)return originalRGBA.slice();
  const featureAmount=1-dragonFeatureAvailability(feature);
  if(featureAmount<=0)return originalRGBA.slice();
  const amount=featureAmount*smooth(.001,.01,neighborAlpha);
  return [...originalRGBA.slice(0,3).map((value,i)=>
    (value/Math.max(alpha,.001)*(1-amount)+neighborSumRGBA[i]/Math.max(neighborAlpha,.001)*amount)*alpha),alpha];
}
function row(direction,y){const rows=CYLINDER_ROWS[direction];for(let i=1;i<rows.length;i++)if(y<=rows[i][0]){const a=rows[i-1],b=rows[i],t=clamp((y-a[0])/(b[0]-a[0]),0,1);return[a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}return rows.at(-1).slice(1);}
export function dragonCylinderProjection(x,y,t,closure=0,mirror=false){
  if(![x,y,t,closure].every(Number.isFinite))throw Error('Invalid cylinder projection');
  t=clamp(t,0,1);closure=clamp(closure,0,1);
  const lift=6*(1-closure),shift=lift-3,sideY=y-t*shift,rearY=y+(1-t)*shift;
  const a=row('right',sideY),b=row('up',rearY-lift);if(mirror)b[0]=160-b[0];
  const center=a[0]+(b[0]-a[0])*t,radius=a[1]+(b[1]-a[1])*t;
  const phi=Math.asin(clamp((x-center)/radius,-1,1)),yaw=t*Math.PI/2,sa=phi-yaw,ba=phi+Math.PI/2-yaw;
  return{side:[a[0]+a[1]*Math.sin(sa),sideY],rear:[b[0]+b[1]*Math.sin(ba),rearY],
    sideWeight:Math.cos(yaw)**2*Math.max(0,Math.cos(sa))**2,rearWeight:Math.sin(yaw)**2*Math.max(0,Math.cos(ba))**2,phi,center,radius};
}
// CPU equivalent of the cap material handoff. Projection remains unchanged:
// only near-horizon texture ink is inset, and one view owns the shading except
// inside a small native-pixel seam. Availability means real cap/alpha coverage,
// never eye/scale exclusion: those holes are filled within each source first.
export function dragonCylinderMaterial({x,y,t,closure=0,mirror=false,sideAvailable=1,rearAvailable=1}){
  if(![x,y,t,closure,sideAvailable,rearAvailable].every(Number.isFinite))throw Error('Invalid cylinder material');
  t=clamp(t,0,1);closure=clamp(closure,0,1);
  const projection=dragonCylinderProjection(x,y,t,closure,mirror),yaw=t*Math.PI/2;
  const sa=projection.phi-yaw,ba=projection.phi+Math.PI/2-yaw;
  const cfg=DRAGON_CYLINDER_MATERIAL;
  const bell=t===0||t===1?0:Math.sin(Math.PI*t);
  const sourceRow=row('right',projection.side[1]),targetRow=row('up',projection.rear[1]-6*(1-closure));
  const sideInset=Math.min(cfg.horizonInsetPixels*bell,sourceRow[1]*cfg.insetMaxRadiusFraction);
  const rearInset=Math.min(cfg.horizonInsetPixels*bell,targetRow[1]*cfg.insetMaxRadiusFraction);
  const sideSample=[projection.side[0]-sideInset*Math.sin(sa),projection.side[1]];
  const rearSample=[projection.rear[0]-rearInset*Math.sin(ba),projection.rear[1]];
  const sideWeight=projection.sideWeight*clamp(sideAvailable,0,1),rearWeight=projection.rearWeight*clamp(rearAvailable,0,1);
  const total=sideWeight+rearWeight,ratio=total>0?rearWeight/total:0;
  const half=clamp(cfg.handoffHalfPixels/projection.radius,cfg.minHalfWeight,cfg.maxHalfWeight);
  const owner=t===0?0:t===1?1:smooth(.5-half,.5+half,ratio);
  return{projection,sideSample,rearSample,sideInset,rearInset,sideWeight,rearWeight,ratio,owner,halfWeight:half};
}
const n=x=>x.toFixed(8);
const vec=p=>`vec2(${n(p[0])},${n(p[1])})`;
const scaleRearGLSL=side=>{
  const p=DRAGON_SCALE_LANES[side];
  return `void scale${side}Pair(out vec2 upper,out vec2 lower){float frame=clamp(uClosure,0.0,1.0)*48.0;
  if(frame<=18.0){upper=mix(${vec(p[0][0])},${vec(p[1][0])},frame/18.0);lower=mix(${vec(p[0][1])},${vec(p[1][1])},frame/18.0);}
  else{upper=mix(${vec(p[1][0])},${vec(p[2][0])},(frame-18.0)/30.0);lower=mix(${vec(p[1][1])},${vec(p[2][1])},(frame-18.0)/30.0);}}
  `;
};
const axisVec=axes=>`vec3(${n(axes[0]*Math.PI/180)},${n(axes[1]+DRAGON_SCALE_LANES.inkMargin)},${n(axes[2]+DRAGON_SCALE_LANES.inkMargin)})`;
const scaleAxisGLSL=(side,index)=>{
  const p=DRAGON_SCALE_LANES[side+'Axes'];
  return `vec3 ${side}ScaleAxes${index}(){float frame=clamp(uClosure,0.0,1.0)*48.0;
    if(frame<=18.0)return mix(${axisVec(p[0][index])},${axisVec(p[1][index])},frame/18.0);
    return mix(${axisVec(p[1][index])},${axisVec(p[2][index])},(frame-18.0)/30.0);}`;
};
function rowsGLSL(name,rows){
  const branch=(lo,hi)=>{
    if(lo===hi){const a=rows[lo-1],b=rows[lo];return `return mix(vec2(${n(a[1])},${n(a[2])}),vec2(${n(b[1])},${n(b[2])}),clamp((y-${n(a[0])})/${n(b[0]-a[0])},0.0,1.0));\n`;}
    const middle=Math.floor((lo+hi)/2);
    return `if(y<=${n(rows[middle][0])}){${branch(lo,middle)}}else{${branch(middle+1,hi)}}\n`;
  };
  return `vec2 ${name}(float y){${branch(1,rows.length-1)}}\n`;
}
export const dragonCylinderGLSL=`
uniform sampler2D uSideCap;
uniform sampler2D uEndCap;
${rowsGLSL('cylinderSideRow',CYLINDER_ROWS.right)}
${rowsGLSL('cylinderRearRow',CYLINDER_ROWS.up)}
float capUnfit(float x){return 80.0+(x*160.0-80.0)/1.125;}
float capContour(vec2 p){return 1.0-smoothstep(-6.0,0.0,p.y*160.0-sideCapSeamRaw(capUnfit(p.x)));}
float capOnly(vec2 p){
  float mask=capContour(p);
  mask*=1.0-socket(p,vec2(.585,.414),vec2(.163,.151));
  return mask;
}
float scaleHole(vec2 p,vec2 center,vec2 radius){return 1.0-smoothstep(1.0,1.1,length((p-center)/(radius*1.08+vec2(3.0/160.0))));}
float sourceScaleHole(vec2 p){return max(scaleHole(p,vec2(.183594,.494750),vec2(.086,.072)),scaleHole(p,vec2(.163970,.576875),vec2(.075,.064)));}
float nearRearScaleHole(vec2 actual,float lift){
  vec2 c1=mix(vec2(.066,.496),vec2(.918,.491),uMirror),c2=mix(vec2(.069,.600),vec2(.913,.593),uMirror);
  return max(max(scaleHole(actual,c1,vec2(.073,.083)),scaleHole(actual,c2,vec2(.068,.077))),
    max(scaleHole(actual-vec2(0.0,lift/160.0),c1,vec2(.073,.083)),scaleHole(actual-vec2(0.0,lift/160.0),c2,vec2(.068,.077))));
}
vec4 cleanScaleSource(vec4 original,vec2 actual){
  vec2 canonical=vec2(mix(actual.x,1.0-actual.x,uMirror),actual.y);
  return mix(original,texture2D(uSideCap,actual),sourceScaleHole(canonical));
}
vec4 cleanScaleRear(vec4 original,vec2 actual){
  float lift=6.0*(1.0-uClosure);
  vec2 moved=actual-vec2(0.0,lift/160.0);
  float mask=max(max(scaleHole(actual,vec2(.066,.496),vec2(.073,.083)),scaleHole(actual,vec2(.069,.600),vec2(.068,.077))),
    max(scaleHole(actual,vec2(.918,.491),vec2(.073,.083)),scaleHole(actual,vec2(.913,.593),vec2(.068,.077))));
  mask=max(mask,max(max(scaleHole(moved,vec2(.066,.496),vec2(.073,.083)),scaleHole(moved,vec2(.069,.600),vec2(.068,.077))),
    max(scaleHole(moved,vec2(.918,.491),vec2(.073,.083)),scaleHole(moved,vec2(.913,.593),vec2(.068,.077)))));
  return mix(original,texture2D(uEndCap,actual),mask);
}
${scaleRearGLSL('left')}
${scaleRearGLSL('right')}
${['left','right'].flatMap(side=>[0,1].map(i=>scaleAxisGLSL(side,i))).join('\n')}
vec2 scaleArcPoint(vec2 source,vec2 end){
  vec2 a=cylinderSideRow(source.y),b=cylinderRearRow(end.y-6.0*(1.0-uClosure));
  b.x=mix(b.x,160.0-b.x,uMirror);
  a.y=max(a.y,abs(source.x-a.x)+.001);b.y=max(b.y,abs(end.x-b.x)+.001);
  float angle=mix(asin((source.x-a.x)/a.y),asin((end.x-b.x)/b.y),uTurn);
  vec2 cr=mix(a,b,uTurn);
  return vec2(cr.x+cr.y*sin(angle),mix(source.y,end.y,uTurn)-8.0*sin(3.14159265359*uTurn));
}
vec4 scaleFeature(sampler2D original,sampler2D clean,vec2 uv,vec2 q){
  vec4 a=texture2D(original,uv),b=texture2D(clean,uv);
  vec3 color=a.rgb/max(a.a,.001),delta=color-b.rgb/max(b.a,.001);
  vec3 chroma=delta-vec3(dot(delta,vec3(1.0/3.0)));
  float contrast=smoothstep(${n(DRAGON_SCALE_LANES.featureStarts)},${n(DRAGON_SCALE_LANES.featureComplete)},length(chroma));
  float core=1.0-smoothstep(${n(DRAGON_SCALE_LANES.solidCore)},${n(DRAGON_SCALE_LANES.solidEdge)},length(q));
  float restore=max(1.0-smoothstep(0.0,.06,uTurn),smoothstep(${n(DRAGON_SCALE_LANES.nativeRestoreStarts)},${n(DRAGON_SCALE_LANES.nativeRestoreComplete)},uTurn));
  float mask=mix(max(core,contrast),1.0,restore)*smoothstep(.02,.20,a.a);
  return vec4(color*mask,mask);
}
vec2 scaleLeafUV(vec2 q,vec2 center,vec3 axes){
  vec2 local=q*axes.yz;
  vec2 p=center+vec2(cos(axes.x)*local.x-sin(axes.x)*local.y,sin(axes.x)*local.x+cos(axes.x)*local.y);
  return vec2(mix(p.x,160.0-p.x,uMirror),p.y)/160.0;
}
void registeredScaleLeaf(vec2 position,vec2 sourceCenter,vec2 endCenter,vec2 center,vec3 sourceAxes,vec3 endAxes,vec3 axes,float xScale,float owner,float visibility,inout vec4 paint){
  vec2 local=position*160.0-center;local.x/=xScale;
  vec2 q=vec2(cos(axes.x)*local.x+sin(axes.x)*local.y,-sin(axes.x)*local.x+cos(axes.x)*local.y)/axes.yz;
  float footprint=(1.0-smoothstep(.92,1.10,length(q)))*visibility;
  if(footprint<=0.0)return;
  vec4 a=scaleFeature(uSide,uSideCap,scaleLeafUV(q,sourceCenter,sourceAxes),q);
  vec4 b=scaleFeature(uEnd,uEndCap,scaleLeafUV(q,endCenter,endAxes),q);
  vec4 feature=mix(a,b,owner)*footprint;
  paint=vec4(clamp(paint.rgb/max(paint.a,.001)*(1.0-feature.a)+feature.rgb,0.0,1.0),1.0);
}
void registeredRearScales(vec2 position,inout vec4 paint){
  vec2 leftUpper,leftLower,rightUpper,rightLower;
  scaleleftPair(leftUpper,leftLower);scalerightPair(rightUpper,rightLower);
  vec2 endUpper=mix(rightUpper,leftUpper,uMirror),endLower=mix(rightLower,leftLower,uMirror);
  vec2 farUpper=mix(leftUpper,rightUpper,uMirror),farLower=mix(leftLower,rightLower,uMirror);
  endUpper.x=mix(endUpper.x,160.0-endUpper.x,uMirror);endLower.x=mix(endLower.x,160.0-endLower.x,uMirror);
  farUpper.x=mix(farUpper.x,160.0-farUpper.x,uMirror);farLower.x=mix(farLower.x,160.0-farLower.x,uMirror);
  vec2 sourceUpper=${vec(DRAGON_SCALE_LANES.side[0])},sourceLower=${vec(DRAGON_SCALE_LANES.side[1])};
  vec3 sourceAxes0=${axisVec(DRAGON_SCALE_LANES.sourceAxes[0])},sourceAxes1=${axisVec(DRAGON_SCALE_LANES.sourceAxes[1])};
  vec3 endAxes0=mix(rightScaleAxes0(),leftScaleAxes0(),uMirror),endAxes1=mix(rightScaleAxes1(),leftScaleAxes1(),uMirror);
  vec3 farAxes0=mix(leftScaleAxes0(),rightScaleAxes0(),uMirror),farAxes1=mix(leftScaleAxes1(),rightScaleAxes1(),uMirror);
  endAxes0.x*=1.0-2.0*uMirror;endAxes1.x*=1.0-2.0*uMirror;farAxes0.x*=1.0-2.0*uMirror;farAxes1.x*=1.0-2.0*uMirror;
  vec2 upper=scaleArcPoint(sourceUpper,endUpper),lower=scaleArcPoint(sourceLower,endLower);
  float owner=smoothstep(${n(DRAGON_SCALE_LANES.paintStarts)},${n(DRAGON_SCALE_LANES.paintComplete)},uTurn);
  registeredScaleLeaf(position,sourceUpper,endUpper,upper,sourceAxes0,endAxes0,mix(sourceAxes0,endAxes0,uTurn),1.0,owner,1.0,paint);
  registeredScaleLeaf(position,sourceLower,endLower,lower,sourceAxes1,endAxes1,mix(sourceAxes1,endAxes1,uTurn),1.0,owner,1.0,paint);
  float reveal=smoothstep(${n(DRAGON_SCALE_LANES.farStarts)},${n(DRAGON_SCALE_LANES.farComplete)},uTurn);
  vec2 farShift=vec2(-8.0*(1.0-reveal),0.0);
  registeredScaleLeaf(position,sourceUpper,farUpper,farUpper+farShift,sourceAxes0,farAxes0,farAxes0,.025+.975*reveal,1.0,reveal,paint);
  registeredScaleLeaf(position,sourceLower,farLower,farLower+farShift,sourceAxes1,farAxes1,farAxes1,.025+.975*reveal,1.0,reveal,paint);
}
float rearScaleMask(vec2 p,float lift){
  p.y-=lift/160.0;
  float left=max(socket(p,vec2(.066,.496),vec2(.073,.083)),socket(p,vec2(.069,.600),vec2(.068,.077)));
  float right=max(socket(p,vec2(.918,.491),vec2(.073,.083)),socket(p,vec2(.913,.593),vec2(.068,.077)));
  return max(left,right);
}
float rearCapAvailable(vec2 actual,float lift){
  float seam=rearCapSeamRaw(capUnfit(actual.x))+lift;
  return 1.0-smoothstep(-6.0,0.0,actual.y*160.0-seam);
}
vec4 sourceShadeTap(vec2 p){
  vec2 actual=vec2(mix(p.x,1.0-p.x,uMirror),p.y);
  vec4 color=texture2D(uSideCap,actual);
  return color*capContour(p);
}
vec4 rearShadeTap(vec2 actual,float lift){return texture2D(uEndCap,actual)*rearCapAvailable(actual,lift);}
vec3 sourceLowShade(vec2 p,vec3 fallback){
  vec2 dx=vec2(${n(DRAGON_CYLINDER_MATERIAL.shadingRadiusPixels)}/160.0,0.0),dy=dx.yx;
  vec4 sum=4.0*sourceShadeTap(p)+sourceShadeTap(p+dx)+sourceShadeTap(p-dx)+sourceShadeTap(p+dy)+sourceShadeTap(p-dy);
  return sum.a>.0001?sum.rgb/sum.a:fallback;
}
vec3 rearLowShade(vec2 actual,float lift,vec3 fallback){
  vec2 dx=vec2(${n(DRAGON_CYLINDER_MATERIAL.shadingRadiusPixels)}/160.0,0.0),dy=dx.yx;
  vec4 sum=4.0*rearShadeTap(actual,lift)+rearShadeTap(actual+dx,lift)+rearShadeTap(actual-dx,lift)+rearShadeTap(actual+dy,lift)+rearShadeTap(actual-dy,lift);
  return sum.a>.0001?sum.rgb/sum.a:fallback;
}
void cylindricalCrown(vec2 position,vec2 faceA,inout vec4 paint,inout float distance){
  // Native poses retain their original face and pigment, with no hidden fill.
  if(uTurn<=0.0||uTurn>=1.0)return;
  float lift=6.0*(1.0-uClosure),shift=lift-3.0;
  float sideY=position.y*160.0-uTurn*shift,rearY=sideY+shift;
  vec2 sr=cylinderSideRow(sideY),br=cylinderRearRow(rearY-lift);
  br.x=mix(br.x,160.0-br.x,uMirror);
  vec2 cr=mix(sr,br,uTurn);
  float phi=asin(clamp((position.x*160.0-cr.x)/cr.y,-1.0,1.0)),yaw=uTurn*1.57079632679;
  float sa=phi-yaw,ba=phi+1.57079632679-yaw;
  float sideFacing=max(0.0,cos(sa)),rearFacing=max(0.0,cos(ba));
  float inset=(uTurn<=0.0||uTurn>=1.0)?0.0:${n(DRAGON_CYLINDER_MATERIAL.horizonInsetPixels)}*sin(3.14159265359*uTurn);
  float sideInset=min(inset,sr.y*${n(DRAGON_CYLINDER_MATERIAL.insetMaxRadiusFraction)});
  float rearInset=min(inset,br.y*${n(DRAGON_CYLINDER_MATERIAL.insetMaxRadiusFraction)});
  vec2 canonicalA=vec2(sr.x+(sr.y-sideInset)*sin(sa),sideY)/160.0;
  vec2 canonicalB=vec2(br.x+(br.y-rearInset)*sin(ba),rearY)/160.0;
  vec2 aUV=vec2(mix(canonicalA.x,1.0-canonicalA.x,uMirror),canonicalA.y);
  vec2 bUV=vec2(mix(canonicalB.x,1.0-canonicalB.x,uMirror),canonicalB.y);
  // Cached same-view harmonic fill is confined to hidden feature footprints.
  // Original RGBA remains separately available to the visible face compositor.
  vec4 a=texture2D(uSideCap,aUV),b=texture2D(uEndCap,bUV);
  float rearSeam=rearCapSeamRaw(capUnfit(bUV.x))+lift;
  float rearCapMask=1.0-smoothstep(-6.0,0.0,rearY-rearSeam);
  float wa=pow(cos(yaw)*sideFacing,2.0)*smoothstep(.001,.15,a.a)*capContour(canonicalA);
  float wb=pow(sin(yaw)*rearFacing,2.0)*smoothstep(.001,.15,b.a)*rearCapMask;
  // Both views contain baked shadows and ink. Do not average them over a
  // broad overlap: one surface owns the pigment, with only a narrow handoff.
  float halfWeight=clamp(${n(DRAGON_CYLINDER_MATERIAL.handoffHalfPixels)}/cr.y,${n(DRAGON_CYLINDER_MATERIAL.minHalfWeight)},${n(DRAGON_CYLINDER_MATERIAL.maxHalfWeight)});
  float ratio=wa+wb>0.0?wb/(wa+wb):0.0;
  float owner=smoothstep(.5-halfWeight,.5+halfWeight,ratio);
  if(uTurn<=0.0)owner=0.0;if(uTurn>=1.0)owner=1.0;
  vec3 aRGB=a.rgb/max(a.a,.001),bRGB=b.rgb/max(b.a,.001);
  vec3 lowA=sourceLowShade(canonicalA,aRGB),lowB=rearLowShade(bUV,lift,bRGB);
  // Baked lighting changes broadly, but ink and ridge detail use one owner.
  // Masked, normalized taps cannot borrow color from the eyes, scales or jaw.
  vec3 crownRGB=clamp(mix(lowA,lowB,ratio)+mix(aRGB-lowA,bRGB-lowB,owner),0.0,1.0);
  if(uTurn<=0.0)crownRGB=aRGB;if(uTurn>=1.0)crownRGB=bRGB;
  vec4 crown=vec4(crownRGB,1.0);
  float covered=backSurfaceCoverage(faceA,uTurn);
  float region=mix(capOnly(faceA),capContour(faceA),covered);
  // Both old scale locations were removed from the base material. A single
  // registered pair below owns the original features throughout the rotation.
  // The cap's own smooth contour is deliberately independent of its paint
  // chart. Its texture turns around a volume; its outline never crumples.
  float upper=1.0-smoothstep(.25,.36,position.y);
  vec2 worldA=vec2(mix(position.x,1.0-position.x,uMirror),sideY/160.0);
  vec2 worldB=vec2(mix(position.x,1.0-position.x,uMirror),rearY/160.0);
  float da=(texture2D(uSideShape,worldA).r*255.0-128.0)/4.0;
  float db=(texture2D(uEndShape,worldB).r*255.0-128.0)/4.0;
  distance=mix(distance,mix(da,db,uTurn),upper);
  region=max(region,upper);
  paint=mix(paint,crown,region);
  registeredRearScales(position,paint);
}
`;
