// Dragon Kin uses the same certified paired-mesh / opaque-surface algorithm
// as Fantasy Biter, with landmarks measured on its OWN registered artwork.
// Coordinates are unfitted 160px; never substitute the player's eye masks.
import {createPairedMesh} from './fantasy-turn/paired-mesh.js';
import {backSurfaceGLSL,backCoverage} from './fantasy-turn/back-surface.js';

const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const integral=x=>x*x*x*x*(2.5+x*(-3+x));
const bounded=x=>{x=clamp(x);return x<.1?.1*integral(x/.1)/.9:x>.9?1-.1*integral((1-x)/.1)/.9:(x-.05)/.9;};
export function dragonJawY(x,y,direction,closure){
  const c=clamp(closure),u=(y-112)/25,m=ease((c-.5)/.3);
  const ramp=ease(u)+(bounded(u)-ease(u))*m;
  const lateral=direction==='right'?ease((x-24)/66):ease((x-16)/28)*ease((144-x)/28);
  return y-(direction==='right'?16:20)*c*lateral*ramp;
}

// One visible side eye aligns with the front-left socket. The second socket
// enters from the far rim rather than appearing as a duplicate translucent eye.
const front=[
  [70,14,80,11],[34,28,37,24],[20,45,19,42],[14,70,13,69],
  [16,100,14,104],[27,135,27,135],[55,147,53,147],[104,147,105,147],
  [132,141,133,137],[145,87,143,88],[137,64,139,66],[125,37,126,35],
  [75.42857142857143,57.6,28.8,55.77142857142857],
  [75.42857142857143,67.42857142857143,28.8,66.51428571428572],
  [76.8,53.48571428571429,30.17142857142857,50.51428571428571],
  [76.8,72.68571428571428,30.17142857142857,72],
  [80.22857142857143,50.97142857142857,32.91428571428571,47.08571428571429],
  [80.22857142857143,79.54285714285714,32.91428571428571,75.88571428571429],
  [84.34285714285714,51.65714285714286,36.8,48.68571428571428],
  [84.34285714285714,80.91428571428571,36.8,78.85714285714286],
  [89.14285714285714,53.02857142857143,41.371428571428574,52.57142857142857],
  [89.14285714285714,80.45714285714286,41.371428571428574,80],
  [94.17142857142858,55.542857142857144,46.17142857142857,57.82857142857143],
  [94.17142857142858,80.22857142857143,46.17142857142857,79.77142857142857],
  [99.2,59.885714285714286,50.74285714285714,63.542857142857144],
  [99.2,79.77142857142857,50.74285714285714,78.62857142857143],
  [104,66.28571428571429,54.857142857142854,68.34285714285714],
  [104,78.4,54.857142857142854,76.8],
  [108.57142857142857,72.68571428571428,57.371428571428574,72],
  [108.57142857142857,75.65714285714286,57.371428571428574,74.28571428571429],
  [121,54,112,49],[128,65,128,65],[129,78,124,79],
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
  [53,89,36,88],[82,84,71,85],[113,81,108,84],
  [139,92,140,99],[79,104,37,104],[86,122,42,121],
  [104,130,78,132],[128,130,120,130],[142,114,130,115],
  [117,97,48,100],[127,97,57,100],[118,109,49,110],[125,109,56,110],
  [134,99,104,101],[138,99,113,101],[134,109,105,111],[138,109,112,111],
  [61,136,38,136],[88,143,79,143],[119,143,117,143],
];
const border=[];
for(let x=0;x<=160;x+=20)border.push([x,0,x,0]);
for(let y=20;y<=160;y+=20)border.push([160,y,160,y]);
for(let x=140;x>=0;x-=20)border.push([x,160,x,160]);
for(let y=140;y>0;y-=20)border.push([0,y,0,y]);
const fit=x=>x===0||x===160?x/160:(80+(x-80)*1.125)/160;
const cache=new Map();
// Measured on the same registered source/320px preparation as the packed art.
const rearSeam=[112,112,112,112,112,112,112,112,112,112,112,112,112,89,87,84,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,83.5,82.5,82.5,82.5,89.5,87,87.5,88,89,89.5,90.5,91,92,92.5,93,94,94.5,95,95.5,96,96.5,97,97.5,98,98.5,99,99.5,100,100.5,101,101,101.5,102,102,102.5,103,103,103.5,103.5,104,104,104.5,104.5,105,105,105.5,105.5,105.5,105.5,106,106,106,106,106,106,106,105.5,105.5,105.5,105.5,105,105,104.5,104.5,104,104,103.5,103.5,103,103,102.5,102,102,101.5,101,100.5,100.5,100,99.5,99,98.5,98,97.5,97,96.5,96,95.5,95,94.5,93.5,93,92.5,92,91,90.5,89.5,89,88,87.5,86.5,86,85,84.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,82.5,84.5,85,86,112,112,112,112,112,112,112,112,112,112,112,112,112];
export function dragonRearY(x,y,closure,mirror=false){
  const seam=rearSeam[Math.max(0,Math.min(159,Math.floor(mirror?160-x:x)))];
  return y<=seam?y+6*(1-clamp(closure)):y;
}
export function dragonCage(kind,closure=0,mirror=false){
  if(!['front','back'].includes(kind)||!Number.isFinite(closure)||typeof mirror!=='boolean')throw Error('Invalid Dragon Kin turn');
  const frame=Math.round(clamp(closure)*48),key=`${kind}:${frame}:${kind==='back'&&mirror?1:0}`;
  if(cache.has(key))return cache.get(key);
  // A coherent head-plane projection replaces isolated lip/eye triangles.
  // In fitted coordinates its derivative is >=1-30*pi/160 >0; muzzle
  // features compress toward the disappearing rim, never shear into hooks.
  let posed;
  if(kind==='back'){
    posed=[];
    for(let y=0;y<=160;y+=20)for(let x=0;x<=160;x+=20){
      const edge=x===0||x===160||y===0||y===160,ax=fit(x);
      const bx=ax+(30/160)*Math.sin(Math.PI*ax),rawB=80+(bx*160-80)/1.125;
      posed.push([ax,(edge?y:dragonJawY(x,y,'right',frame/48))/160,
        bx,(edge?y:dragonRearY(rawB,y,frame/48,mirror))/160]);
    }
  }else posed=[...border,...front].map(([x,y,u,v])=>{
    const edge=x===0||x===160||y===0||y===160;
    return [fit(x),(edge?y:dragonJawY(x,y,'right',frame/48))/160,
      fit(u),(edge?v:dragonJawY(u,v,'down',frame/48))/160];
  });
  const mesh=createPairedMesh(posed),result={a:mesh.open,b:mesh.closed,triangles:mesh.triangles,minimum:mesh.minimum};
  cache.set(key,result);return result;
}

// Normalized surface ownership, independent of palette, light and AI state.
// Dragon Kin has a longer muzzle: hide it before it reaches the narrow rear rim.
export const DRAGON_BACK_SURFACE=Object.freeze({shellCompleteAt:.72});
export const dragonBackCoverage=(x,y,t)=>backCoverage(x,y,clamp(t)*.82/DRAGON_BACK_SURFACE.shellCompleteAt);
const dragonBackGLSL=backSurfaceGLSL.replace('t/0.82','t/0.72');
const sideSeam=[[20,110.5],[24,108],[28,105],[32,102],[36,99],[40,96],[44,93],[48,91.5],[52,88],[56,85.5],[60,83],[64,80.5],[68,80.5],[72,80.5],[76,80.5],[80,81.5],[84,82.5],[88,83],[92,83.5],[96,83],[100,82.5],[104,81.5],[108,80],[112,78.5],[116,76.5],[120,74.5],[124,72.5],[128,71.5],[132,70.5],[136,71],[140,72.5],[144,76.5]];
const decimal=n=>Number(n).toFixed(5);
function curveGLSL(name,points){
  let s=`float ${name}(float x){if(x<=${decimal(points[0][0])})return ${decimal(points[0][1])};\n`;
  for(let i=1;i<points.length;i++){const [x0,y0]=points[i-1],[x1,y1]=points[i];s+=`if(x<=${decimal(x1)})return mix(${decimal(y0)},${decimal(y1)},(x-${decimal(x0)})/${decimal(x1-x0)});\n`;}
  return s+`return ${decimal(points.at(-1)[1])};}\n`;
}
const capSeamGLSL=`
${curveGLSL('sideCapSeamRaw',sideSeam)}
${curveGLSL('rearCapSeamRaw',rearSeam.map((y,x)=>[x,y]).filter(([x])=>x>=13&&x<=146&&((x-13)%4===0||x===146)))}
vec4 alignedRearCapUV(vec2 a,vec2 b,float t,float closure,float mirror){
  float ax=80.0+(a.x*160.0-80.0)/1.125;
  float bx=80.0+(b.x*160.0-80.0)/1.125;
  float sa=sideCapSeamRaw(ax);
  float sb=rearCapSeamRaw(mix(bx,160.0-bx,mirror))+6.0*(1.0-closure);
  float da=a.y*160.0-sa,db=b.y*160.0-sb;
  float common=mix(da,db,t);
  // The Dragon's rear cap reaches much farther down than its side brow.
  // Align the whole gap, not just pixels already close to BOTH boundaries.
  float gap=abs(da-db);
  float local=1.0-smoothstep(max(6.0,gap),max(12.0,gap+10.0),abs(common));
  return vec4(a.x,mix(a.y,(sa+common)/160.0,local),b.x,mix(b.y,(sb+common)/160.0,local));
}
`;

const fragment=`
precision highp float;
uniform sampler2D uSide; uniform sampler2D uEnd;
uniform sampler2D uSideShape; uniform sampler2D uEndShape;
uniform float uTurn; uniform float uBack; uniform float uMirror;
uniform float uClosure; uniform float uNativeSize;
varying vec2 vSide; varying vec2 vEnd;
varying float vX; varying float vY; varying float vPositionX;
${dragonBackGLSL}
${capSeamGLSL}
float socket(vec2 p,vec2 c,vec2 r){return 1.0-smoothstep(.85,1.1,length((p-c)/r));}
void main(){
  vec2 uvA=vec2(mix(vSide.x,1.0-vSide.x,uMirror),vSide.y);
  vec2 uvB=vec2(mix(vEnd.x,1.0-vEnd.x,uMirror),vEnd.y);
  float da=(texture2D(uSideShape,vSide).r*255.0-128.0)/4.0;
  float db=(texture2D(uEndShape,vEnd).r*255.0-128.0)/4.0;
  vec4 aligned=vec4(uvA,uvB);
  if(uBack>.5){
    // Rear crown, scales and cheek share ONE material plane. Splitting crown
    // and cheek projections creates a serrated seam where their UVs meet.
    aligned=alignedRearCapUV(uvA,vec2(vPositionX,vY),uTurn,uClosure,uMirror);
  }
  vec4 a=texture2D(uSide,vec2(mix(aligned.x,1.0-aligned.x,uMirror),aligned.y));
  vec2 rearUV=vec2(mix(aligned.z,1.0-aligned.z,uMirror),aligned.w);
  vec4 b=texture2D(uEnd,rearUV);
  float rearPaintDistance=db;
  {
    rearPaintDistance=(texture2D(uEndShape,rearUV).r*255.0-128.0)/4.0;
    if(b.a<.15){
      vec2 dx=vec2(1.0/uNativeSize,0.0),dy=dx.yx;
      vec2 grad=vec2(texture2D(uEndShape,rearUV+dx).r-texture2D(uEndShape,rearUV-dx).r,
                     texture2D(uEndShape,rearUV+dy).r-texture2D(uEndShape,rearUV-dy).r);
      rearUV+=grad/max(length(grad),.0001)*min(5.0,max(0.0,.5-rearPaintDistance))/uNativeSize;
      b=texture2D(uEnd,rearUV);
      rearPaintDistance=(texture2D(uEndShape,rearUV).r*255.0-128.0)/4.0;
    }
  }
  vec4 paint;
  if(uBack>.5){
    // Only the single painted rear shell owns hidden eyes, scales and mouth.
    paint=backSurface(a,b,uvA,uvB,uTurn,da,rearPaintDistance);
  }else{
    // Keep the three crown plates together: late whole-face crossfades show
    // two conflicting ridge/cheek outlines even when their silhouettes agree.
    float blend=smoothstep(0.0,.36,uTurn);
    float nearEye=socket(uvB,vec2(.24,.405),vec2(.155,.15));
    float farEye=socket(uvB,vec2(.76,.405),vec2(.155,.15));
    blend=mix(blend,smoothstep(0.0,.22,uTurn),nearEye);
    blend=mix(blend,smoothstep(0.0,.10,uTurn),farEye);
    blend=mix(blend,smoothstep(0.0,.30,uTurn),smoothstep(.54,.64,uvA.y));
    float wa=(1.0-blend)*smoothstep(.001,.15,a.a)*(.015+smoothstep(-.5,3.0,da));
    float wb=blend*smoothstep(.001,.15,b.a)*(.015+smoothstep(-.5,3.0,rearPaintDistance));
    paint=(a*wa+b*wb)/max(wa+wb,.001);
  }
  float t=uBack>.5?uTurn*(2.0-uTurn):uTurn;
  float alpha=smoothstep(-.7,.7,mix(da,db,t));
  if(uBack>.5){
    // The mouth's negative space belongs to the same receding surface as
    // its lips. A silhouette blend alone fills that cavity BEFORE the shell
    // arrives, forcing transparent RGB into opaque black wedges. Preserve
    // the visible surface's coverage until the rear shell actually owns it.
    float cover=backSurfaceCoverage(uvA,uTurn);
    alpha=min(alpha,smoothstep(.001,.15,mix(a.a,b.a,cover)));
  }
  gl_FragColor=vec4(paint.rgb/max(paint.a,.001)*alpha,alpha);
}`;
export const dragonKinTurnRig=Object.freeze({cage:dragonCage,fragment});
