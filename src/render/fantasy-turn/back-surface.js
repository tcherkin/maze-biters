// Isolated turn study: the rear shell passes IN FRONT OF the side face.
// Features and their coloured lips share one curved visibility edge. A wider
// spatial feather on the featureless rear cheek joins its shading, without
// superimposing complete side/rear faces over the whole turn.
// UVs must be canonical right-facing coordinates, even for a mirrored actor.
// Input colors themselves still come from the actual left/right/up artwork.
export const BACK_SURFACE_CONFIG = Object.freeze({
  nativeReference: 160,
  shellCompleteAt: 0.82,
  seamHalfWidth: 0.8,
  cheekHalfWidth: 9,
  seamBow: 7,
});

const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => {const a=clamp(x); return a*a*(3-2*a);};

// CPU equivalent of the ownership field, exposed for deterministic tests.
// It describes visibility, not alpha: 1 means solid rear paint, 0 solid side.
export function backCoverage(x, y, turn) {
  if (![x,y,turn].every(Number.isFinite)) throw new TypeError('Invalid rear-surface coordinates');
  const t=clamp(turn);
  if (t===0) return 0;
  if (t>=BACK_SURFACE_CONFIG.shellCompleteAt) return 1;
  const progress=smooth(t/BACK_SURFACE_CONFIG.shellCompleteAt);
  const bell=Math.sin(Math.PI*progress);
  const vertical=clamp(1-4*(y-.53)*(y-.53));
  const edge=-2+164*progress+BACK_SURFACE_CONFIG.seamBow*vertical*bell;
  const feature=smooth((x-.48)/.13);
  const width=BACK_SURFACE_CONFIG.cheekHalfWidth+(BACK_SURFACE_CONFIG.seamHalfWidth-BACK_SURFACE_CONFIG.cheekHalfWidth)*feature;
  return smooth((edge-x*160+width)/(2*width));
}

export const backSurfaceGLSL = `
float backSurfaceCoverage(vec2 uvA,float t){
  float p=clamp(t/${BACK_SURFACE_CONFIG.shellCompleteAt.toFixed(2)},0.0,1.0);
  p=p*p*(3.0-2.0*p);
  float vertical=clamp(1.0-4.0*(uvA.y-0.53)*(uvA.y-0.53),0.0,1.0);
  float edge=-2.0+164.0*p+${BACK_SURFACE_CONFIG.seamBow.toFixed(1)}*vertical*sin(3.14159265*p);
  float featureZone=smoothstep(0.48,0.61,uvA.x);
  float width=mix(${BACK_SURFACE_CONFIG.cheekHalfWidth.toFixed(1)},${BACK_SURFACE_CONFIG.seamHalfWidth.toFixed(1)},featureZone);
  float cover=smoothstep(-width,width,edge-uvA.x*160.0);

  // The cheek, lip gloss, lip ink, cavity and teeth belong to ONE surface.
  // A color classifier split them into sliding translucent patches. Only
  // the spatial visibility boundary can mix the two source views.
  return cover;
}
vec4 backSurface(vec4 a,vec4 b,vec2 uvA,vec2 uvB,float t,float da,float db){
  // Exact endpoint paint: cardinal sprites never acquire a synthetic seam.
  if(t<=0.0)return a;
  if(t>=1.0)return b;
  float cover=backSurfaceCoverage(uvA,t);

  // An old exterior outline must not turn into a black crease inside the
  // newly visible shell. Borrow the other view only at an unavailable edge,
  // never across the eye, mouth or teeth that are still genuinely visible.
  float availableA=smoothstep(0.001,0.15,a.a);
  float availableB=smoothstep(0.001,0.15,b.a);

  // No transparent RGB participates in the paint. The caller supplies the
  // single final interpolated silhouette. Interior output is opaque, so the
  // receding eye and mouth are covered, rather than dissolving into green.
  // Edge preference must be multiplied by the current ownership. Overriding
  // ownership here resurrects the hidden mouth along the rear outline.
  float wa=(1.0-cover)*availableA*(0.015+smoothstep(-0.5,3.0,da));
  float wb=cover*availableB*(0.015+smoothstep(-0.5,3.0,db));
  // Never resurrect the hidden side face when a rear sample misses its edge.
  if(wa+wb<0.0001){wa=(1.0-cover)*availableA;wb=cover*availableB;}
  if(wa+wb<0.0001)return vec4(0.0);
  vec3 color=(a.rgb/max(a.a,0.001)*wa+b.rgb/max(b.a,0.001)*wb)/max(wa+wb,0.0001);
  return vec4(color,1.0);
}
`;

export const BACK_SURFACE_GLSL = backSurfaceGLSL;
