// A single textured fin, projected edge-on when the asymmetric curl changes
// handedness. This does not interpolate two protruding hook silhouettes or
// replace their middle frame with a flat-coloured Gaussian triangle.
// Coordinates are normalized, already horizontally fitted, canonical RIGHT.
// GLSL expects the existing uSide/uEnd/uSideShape/uEndShape samplers.
export const crestSurfaceGLSL = `
float crestEase(float lo,float hi,float x){
  float v=clamp((x-lo)/(hi-lo),0.0,1.0);
  return v*v*v*(v*(v*6.0-15.0)+10.0);
}
vec2 crestUV(vec2 canonical,float mirror){
  return vec2(mix(canonical.x,1.0-canonical.x,mirror),canonical.y);
}
float crestDecode(float encoded){return (encoded*255.0-128.0)/4.0;}
void crestSurface(inout vec4 paint,inout float shapeDistance,vec2 position,
                  float t,float back,float mirror,float closure,float nativeSize){
  float opposite=abs(mirror-back);
  float sn=sin(3.14159265359*t),cs=cos(3.14159265359*t);
  // This is a thick cartoon curl, not a paper fin. Retain enough projected
  // thickness and slightly lower the exposed curl when viewed edge-on; a
  // ten-percent-width projection leaves an implausibly tall one-pixel needle.
  float width=mix(1.0-0.08*sn*sn,sqrt(cs*cs+0.1764*sn*sn),opposite);
  float height=1.0-0.32*opposite*sn*sn;
  float sideAxis=0.58,endAxis=mix(0.58,0.42,opposite);
  float axis=mix(sideAxis,endAxis,t);
  float endShift=mix(-2.0,1.0+6.0*(1.0-closure),back)/160.0;
  float shift=endShift*t;
  // Register the upper crest ridge before changing surface ownership. Two
  // unregistered narrowed peaks otherwise intersect into a pointed splinter.
  float finY=0.18+(position.y-(0.18+shift))/height;
  vec2 aUV=crestUV(vec2(sideAxis+(position.x-axis)/width,finY),mirror);
  vec2 bUV=crestUV(vec2(endAxis+(position.x-axis)/width,finY+endShift),mirror);
  vec4 finA=texture2D(uSide,aUV),finB=texture2D(uEnd,bUV);
  float da=crestDecode(texture2D(uSideShape,aUV).r)*width;
  float db=crestDecode(texture2D(uEndShape,bUV).r)*width;
  // The paint changes ownership only while the fin is narrow, not across a
  // broad pair of independently visible tips. One distance field owns alpha.
  float owner=crestEase(0.43,0.57,t);
  float finDistance=mix(da,db,owner);
  float wa=(1.0-owner)*(0.015+crestEase(-0.5,2.0,da));
  float wb=owner*(0.015+crestEase(-0.5,2.0,db));
  vec4 finPaint=(finA*wa+finB*wb)/max(wa+wb,0.001);

  // The skull remains full width underneath the fin. Its pigment is sampled
  // from the approved cap itself, never synthesized or palette-recoloured.
  float dx=position.x-0.5;
  float crown=0.18+0.75*dx*dx+shift;
  float capDistance=(position.y-crown)*nativeSize/sqrt(1.0+2.25*dx*dx);
  float capRow=max(position.y-shift,0.235+0.20*dx*dx);
  vec2 capCanonical=vec2(clamp(position.x,0.24,0.78),capRow);
  vec4 capA=texture2D(uSide,crestUV(capCanonical,mirror));
  vec4 capB=texture2D(uEnd,crestUV(capCanonical+vec2(0.0,endShift),mirror));
  vec4 capPaint=mix(capA,capB,owner);
  // Carry the original outline pigment around the newly exposed crown;
  // sampling lower cap colour alone leaves a bright, cut-looking stump.
  vec4 ink=texture2D(uSide,crestUV(vec2(109.0/160.0,15.0/160.0),mirror));
  vec3 capRGB=capPaint.rgb/max(capPaint.a,0.001);
  vec3 inkRGB=ink.rgb/max(ink.a,0.001);
  capRGB=mix(inkRGB,capRGB,crestEase(0.1,1.8*nativeSize/160.0,capDistance));
  capPaint=vec4(capRGB,1.0);
  // A one-native-pixel smooth union rounds the fin root into the crown,
  // rather than leaving a hard max-distance crease at their intersection.
  float rootRadius=1.1*nativeSize/160.0;
  float capOwns=clamp(0.5+0.5*(capDistance-finDistance)/rootRadius,0.0,1.0);
  float finOwns=1.0-capOwns;
  vec4 projectedPaint=mix(capPaint,finPaint,finOwns);
  float projectedDistance=mix(finDistance,capDistance,capOwns)+rootRadius*capOwns*(1.0-capOwns);
  // A C2 taper joins the cap to the unchanged face: no horizontal clip row.
  float local=1.0-crestEase(0.205+shift,0.27+shift,position.y);
  // Keep the outer rounded skull and its shoulder highlight on their native
  // surface. Only the actual crest/root needs the projected-cap replacement.
  local*=crestEase(0.20,0.30,position.x)*(1.0-crestEase(0.72,0.82,position.x));
  float active=crestEase(0.0,0.16,t)*(1.0-crestEase(0.84,1.0,t));
  float amount=local*active;
  // Shape ownership must cover the WHOLE old upper outline. Reusing the
  // narrower pigment mask lets the two old shoulder contours survive as
  // extra tips beside the projected fin. Paint can stay local; alpha cannot.
  // The absolute 0.30 end keeps the face/eyebrows below it untouched.
  float shapeAmount=active*(1.0-crestEase(0.25+shift*0.25,0.30,position.y));
  shapeDistance=mix(shapeDistance,projectedDistance,shapeAmount);
  // Where the new rounded crown covers a formerly transparent sample, it
  // must also own pigment; normalizing an empty old sample would paint black.
  float paintAmount=max(amount,shapeAmount*(1.0-crestEase(0.02,0.25,paint.a)));
  paint=mix(paint,projectedPaint,paintAmount);
}
`;

const clamp=x=>Math.max(0,Math.min(1,x));
export function crestEase(lo,hi,x){const v=clamp((x-lo)/(hi-lo));return v*v*v*(v*(v*6-15)+10);}
// CPU mirror of the projection/taper, used to regress continuity in HD/4K.
export function crestProjection({t,back=false,mirror=false,closure=0,x=.5,y=.12,size=160}){
  if(![t,closure,x,y,size].every(Number.isFinite)||size<=0)throw new TypeError('Invalid crest projection');
  t=clamp(t);closure=clamp(closure);
  const sn=Math.sin(Math.PI*t),cs=Math.cos(Math.PI*t),opposite=Number(!!mirror!==!!back);
  const width=(1-opposite)*(1-.08*sn*sn)+opposite*Math.sqrt(cs*cs+.1764*sn*sn);
  const height=1-.32*opposite*sn*sn,sideAxis=.58,endAxis=opposite?.42:.58,axis=sideAxis+(endAxis-sideAxis)*t;
  const endShift=(back?1+6*(1-closure):-2)/160,shift=endShift*t;
  const sourceX=sideAxis+(x-axis)/width,targetX=endAxis+(x-axis)/width;
  const sourceY=.18+(y-(.18+shift))/height,targetY=sourceY+endShift;
  const crown=.18+.75*(x-.5)**2+shift;
  const active=crestEase(0,.16,t)*(1-crestEase(.84,1,t));
  const local=(1-crestEase(.205+shift,.27+shift,y))*crestEase(.20,.30,x)*(1-crestEase(.72,.82,x));
  const shapeAmount=active*(1-crestEase(.25+shift*.25,.30,y));
  return {width,height,axis,endShift,shift,sourceX,targetX,sourceY,targetY,crown,owner:crestEase(.43,.57,t),amount:active*local,shapeAmount};
}
