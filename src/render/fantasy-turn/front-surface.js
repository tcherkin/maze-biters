// Each eye occupies one mapped socket. The front eye paint owns that socket
// early in the turn; it must not remain superposed with a second pupil/brow.
// UV arguments are canonical (right-facing), after the approved width fit.
export const frontSurfaceGLSL = `
float socket(vec2 uv,vec2 center,vec2 radius){
  return 1.0-smoothstep(0.86,1.08,length((uv-center)/radius));
}
vec4 frontSurface(vec4 a,vec4 b,vec2 uvA,vec2 uvB,float t,float da,float db){
  float blend=t*t*(3.0-2.0*t);
  float nearEye=socket(uvB,vec2(0.285,0.413),vec2(0.175,0.132));
  float farEye=socket(uvB,vec2(0.751,0.413),vec2(0.172,0.132));
  blend=mix(blend,smoothstep(0.0,0.34,t),nearEye);
  // The far eye is a perspective-compressed visible feature, not a faint
  // portrait floating on the near-side forehead.
  blend=mix(blend,smoothstep(0.0,0.12,t),farEye);
  float mouth=smoothstep(0.53,0.63,uvA.y);
  blend=mix(blend,smoothstep(0.0,0.42,t),mouth);
  float wa=(1.0-blend)*(0.015+smoothstep(-0.5,3.0,da));
  float wb=blend*(0.015+smoothstep(-0.5,3.0,db));
  return (a*wa+b*wb)/max(wa+wb,0.001);
}
`;
