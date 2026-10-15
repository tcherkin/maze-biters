// Approved Dragon Kin turn anatomy and projection; native artwork is unchanged.
// Player geometry and timing remain owned by their existing modules.
import {createPairedMesh} from '../fantasy-turn/paired-mesh.js';
import {projectedTriangleBound} from '../fantasy-turn/back-projection.js';
import {backSurfaceGLSL,backCoverage} from '../fantasy-turn/back-surface.js';
import {FRONT_PAIRS,BACK_PAIRS,FAR_EYE,REAR_SEAM,SIDE_SEAM} from './anatomy.js';
import {dragonCylinderGLSL} from './cylinder.js';

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
export function dragonRearY(x,y,closure,mirror=false){
  const seam=REAR_SEAM[Math.max(0,Math.min(159,Math.floor(mirror?160-x:x)))];
  return y<=seam?y+6*(1-clamp(closure)):y;
}
export const DRAGON_PROJECTION=Object.freeze({featureControl:.25,rimControl:.125,farOriginWidth:1.6,
  targetKeys:[0,60,110,145,160],targetValues:[0,70,128,144,160]});
export const DRAGON_FRONT_SURFACE=Object.freeze({farNativeWidth:28.57142857142857,farStartsAtWidth:3,farFullAtWidth:10,
  nearCompleteAt:.12,mouthCompleteAt:.30});
const smooth=(lo,hi,x)=>{const t=clamp((x-lo)/(hi-lo));return t*t*(3-2*t);};
export const dragonBackCoverage=backCoverage;
export function dragonFrontWeights(phase){
  if(!Number.isFinite(phase))throw Error('Invalid front phase');
  const t=clamp(phase),farWidth=DRAGON_PROJECTION.farOriginWidth+(DRAGON_FRONT_SURFACE.farNativeWidth-DRAGON_PROJECTION.farOriginWidth)*t;
  return {base:t*t*(3-2*t),nearEye:smooth(0,DRAGON_FRONT_SURFACE.nearCompleteAt,t),
    farEye:smooth(DRAGON_FRONT_SURFACE.farStartsAtWidth,DRAGON_FRONT_SURFACE.farFullAtWidth,farWidth),
    mouth:smooth(0,DRAGON_FRONT_SURFACE.mouthCompleteAt,t),farWidth};
}
export function dragonRearTargetX(x){
  const keys=DRAGON_PROJECTION.targetKeys,values=DRAGON_PROJECTION.targetValues;
  for(let i=1;i<keys.length;i++)if(x<=keys[i])return values[i-1]+(values[i]-values[i-1])*(x-keys[i-1])/(keys[i]-keys[i-1]);
  return 160;
}

// The side view has no second eye. Its entire actual frontal contour starts
// in a narrow slanted strip at the profile's far rim, not an eight-pixel patch.
export const DRAGON_FAR_PAIRS=FAR_EYE.flatMap(([x,top,bottom])=>[top,bottom].map(y=>[
  131+DRAGON_PROJECTION.farOriginWidth*(x-102.62857142857143)/28.57142857142857+.12*(y-47),y,x,y,
]));
const oldFar=new Set(['121,54','128,65','129,78']);
// Register the pupil core as well as its white contour: otherwise two pupil
// shadows drift past one another even though the eyelid boundaries coincide.
const front=[...FRONT_PAIRS.filter(p=>!oldFar.has(p.slice(0,2).join(','))),[101.07191,68.90621,47.37404,66.74610],...DRAGON_FAR_PAIRS];
const back=BACK_PAIRS.map((p,i)=>i===0?[70,14,80,11]:p.slice());
const border=[];
for(let x=0;x<=160;x+=20)border.push([x,0,x,0]);
for(let y=20;y<=160;y+=20)border.push([160,y,160,y]);
for(let x=140;x>=0;x-=20)border.push([x,160,x,160]);
for(let y=140;y>0;y-=20)border.push([0,y,0,y]);
const fit=x=>x===0||x===160?x/160:(80+(x-80)*1.125)/160;
const cache=new Map();
export function dragonCage(kind,closure=0,mirror=false){
  if(!['front','back'].includes(kind)||!Number.isFinite(closure)||typeof mirror!=='boolean')throw Error('Invalid Dragon cage');
  const frame=Math.round(clamp(closure)*48),key=`${kind}:${frame}:${mirror}`;
  if(cache.has(key))return cache.get(key);
  const raw=[...border,...(kind==='front'?front:back)];
  const pairs=raw.map(([x,y,u,v])=>{
    const edge=x===0||x===160||y===0||y===160,target=kind==='back'&&!edge?dragonRearTargetX(u):u;
    return [fit(x),(edge?y:dragonJawY(x,y,'right',frame/48))/160,
      fit(target),(edge?v:kind==='front'?dragonJawY(target,v,'down',frame/48):dragonRearY(target,v,frame/48,mirror))/160];
  });
  const mesh=createPairedMesh(pairs);
  // Like the accepted player: face travels around the rim first; lip/seam
  // follows more gently. This is not a uniform whole-head displacement.
  const controlScale=raw.map((p,i)=>{
    const local=i-border.length;
    return kind==='back'?(local>=12&&local<25?.25:local>=25||(local>=0&&p[1]>=100)?.125:0):0;
  });
  const controlDelta=mesh.open.map((p,i)=>p.map((v,k)=>(mesh.closed[i][k]-v)*controlScale[i]));
  let minimum=Infinity;
  for(const triangle of mesh.triangles){
    const bound=projectedTriangleBound(mesh.open,mesh.closed,controlDelta,triangle);
    if(!bound.passed)throw Error(`Dragon curved cage folds: ${key}, ${triangle}`);
    minimum=Math.min(minimum,bound.lower);
  }
  const result={a:mesh.open,b:mesh.closed,triangles:mesh.triangles,controlDelta,controlScale,minimum,frame,mirror};
  cache.set(key,result);return result;
}

const decimal=n=>Number(n).toFixed(8);
function curveGLSL(name,points){
  let source=`float ${name}(float x){if(x<=${decimal(points[0][0])})return ${decimal(points[0][1])};\n`;
  for(let i=1;i<points.length;i++){
    const [x0,y0]=points[i-1],[x1,y1]=points[i];
    source+=`if(x<=${decimal(x1)})return mix(${decimal(y0)},${decimal(y1)},(x-${decimal(x0)})/${decimal(x1-x0)});\n`;
  }
  return source+`return ${decimal(points.at(-1)[1])};}\n`;
}
const seamGLSL=`
${curveGLSL('sideCapSeamRaw',SIDE_SEAM)}
${curveGLSL('rearCapSeamRaw',REAR_SEAM.map((y,x)=>[x,y]).filter(([x])=>x>=13&&x<=146&&((x-13)%4===0||x===146)))}
vec4 alignedRearCapUV(vec2 a,vec2 b,float t,float closure,float mirror){
  float ax=80.0+(a.x*160.0-80.0)/1.125;
  float bx=80.0+(b.x*160.0-80.0)/1.125;
  float sa=sideCapSeamRaw(ax);
  float sb=rearCapSeamRaw(mix(bx,160.0-bx,mirror))+6.0*(1.0-closure);
  float da=a.y*160.0-sa,db=b.y*160.0-sb,common=mix(da,db,t);
  float local=1.0-smoothstep(6.0,12.0,max(abs(da),abs(db)));
  return vec4(a.x,mix(a.y,(sa+common)/160.0,local),b.x,mix(b.y,(sb+common)/160.0,local));
}`;

const fragment=`
precision highp float;
uniform sampler2D uSide;uniform sampler2D uEnd;
uniform sampler2D uSideShape;uniform sampler2D uEndShape;
uniform float uTurn;uniform float uBack;uniform float uMirror;
uniform float uClosure;uniform float uNativeSize;
varying vec2 vSide;varying vec2 vEnd;
varying float vX;varying float vY;varying float vPositionX;
${backSurfaceGLSL}
${seamGLSL}
float socket(vec2 p,vec2 c,vec2 r){return 1.0-smoothstep(.86,1.08,length((p-c)/r));}
${dragonCylinderGLSL}
void main(){
  vec2 uvA=vec2(mix(vSide.x,1.0-vSide.x,uMirror),vSide.y);
  vec2 uvB=vec2(mix(vEnd.x,1.0-vEnd.x,uMirror),vEnd.y);
  float da=(texture2D(uSideShape,vSide).r*255.0-128.0)/4.0;
  float db=(texture2D(uEndShape,vEnd).r*255.0-128.0)/4.0;
  vec4 aligned=vec4(uvA,uvB);
  if(uBack>.5){
    aligned=alignedRearCapUV(uvA,uvB,uTurn,uClosure,uMirror);
    // Accepted player principle: keep the crown/face tied to its rotating
    // mesh. Only featureless lower rear skin escapes the tiny face triangles.
    float bx=80.0+(uvB.x*160.0-80.0)/1.125;
    float sx=80.0+(vPositionX*160.0-80.0)/1.125;
    float seamB=rearCapSeamRaw(mix(bx,160.0-bx,uMirror))+6.0*(1.0-uClosure);
    float seamS=rearCapSeamRaw(mix(sx,160.0-sx,uMirror))+6.0*(1.0-uClosure);
    float below=aligned.w*160.0-seamB;
    // Ease from the registered color seam to a single rear cheek plane.
    // A max() between two mappings produced a travelling shading crease.
    float shellY=mix((seamS+below)/160.0,vY,smoothstep(4.0,24.0,below));
    aligned.zw=mix(aligned.zw,vec2(vPositionX,shellY),smoothstep(0.0,5.0,below));
  }
  vec4 a=texture2D(uSide,vec2(mix(aligned.x,1.0-aligned.x,uMirror),aligned.y));
  vec2 rearUV=vec2(mix(aligned.z,1.0-aligned.z,uMirror),aligned.w);
  vec4 b=texture2D(uEnd,rearUV);
  float rearPaintDistance=db;
  if(uBack>.5){
    rearPaintDistance=(texture2D(uEndShape,rearUV).r*255.0-128.0)/4.0;
    if(b.a<.15){
      vec2 dx=vec2(1.0/uNativeSize,0.0),dy=dx.yx;
      vec2 gradient=vec2(texture2D(uEndShape,rearUV+dx).r-texture2D(uEndShape,rearUV-dx).r,
        texture2D(uEndShape,rearUV+dy).r-texture2D(uEndShape,rearUV-dy).r);
      rearUV+=gradient/max(length(gradient),.0001)*min(5.0,max(0.0,.5-rearPaintDistance))/uNativeSize;
      b=texture2D(uEnd,rearUV);
      rearPaintDistance=(texture2D(uEndShape,rearUV).r*255.0-128.0)/4.0;
    }
  }
  vec4 paint;
  if(uBack>.5){
    a=cleanScaleSource(a,vec2(mix(aligned.x,1.0-aligned.x,uMirror),aligned.y));
    b=cleanScaleRear(b,rearUV);
    paint=backSurface(a,b,uvA,uvB,uTurn,da,rearPaintDistance);
  }
  else{
    // Restore the full-turn base transfer. Only registered sockets and the
    // mouth own earlier surface changes; far-eye visibility comes from its
    // narrow perspective mesh, not a full-width portrait dissolved over skin.
    float blend=uTurn*uTurn*(3.0-2.0*uTurn);
    float nearEye=socket(uvB,vec2(.24,.405),vec2(.155,.15));
    float farEye=socket(uvB,vec2(.76,.405),vec2(.155,.15));
    float farWidth=mix(${DRAGON_PROJECTION.farOriginWidth.toFixed(8)},${DRAGON_FRONT_SURFACE.farNativeWidth.toFixed(8)},uTurn);
    float farOwner=smoothstep(${DRAGON_FRONT_SURFACE.farStartsAtWidth.toFixed(8)},${DRAGON_FRONT_SURFACE.farFullAtWidth.toFixed(8)},farWidth);
    blend=mix(blend,smoothstep(0.0,${DRAGON_FRONT_SURFACE.nearCompleteAt.toFixed(8)},uTurn),nearEye);
    blend=mix(blend,farOwner,farEye);
    blend=mix(blend,smoothstep(0.0,${DRAGON_FRONT_SURFACE.mouthCompleteAt.toFixed(8)},uTurn),smoothstep(.54,.64,uvA.y));
    float wa=(1.0-blend)*smoothstep(.001,.15,a.a)*(.015+smoothstep(-.5,3.0,da));
    float wb=blend*smoothstep(.001,.15,b.a)*(.015+smoothstep(-.5,3.0,db));
    paint=(a*wa+b*wb)/max(wa+wb,.001);
  }
  float shapeTurn=uBack>.5?uTurn*(2.0-uTurn):uTurn;
  float distance=mix(da,db,shapeTurn);
  if(uBack>.5)cylindricalCrown(vec2(vPositionX,vY),uvA,paint,distance);
  float alpha=smoothstep(-.7,.7,distance);
  gl_FragColor=vec4(paint.rgb/max(paint.a,.001)*alpha,alpha);
}`;
export const dragonTurnRig=Object.freeze({cage:dragonCage,fragment});
