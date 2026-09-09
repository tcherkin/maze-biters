import * as THREE from './vendor/three.module.min.js';

// One bounded screen-space capture for every wall, rather than a new scene
// render per stone. Only the existing upright faces sample it. Hidden or
// off-screen objects are not invented: a miss keeps the purple surface light.
const declarations=`
uniform float wallMirrorReady;
uniform sampler2D wallMirrorColor;
uniform sampler2D wallMirrorDepth;
uniform mat4 wallMirrorProjection;
uniform mat4 wallMirrorInverseProjection;
varying float vWallMirrorSide;

vec2 mirrorProject(vec3 p) {
  vec4 clip = wallMirrorProjection * vec4(p, 1.0);
  return clip.xy / clip.w * 0.5 + 0.5;
}
float mirrorSceneZ(vec2 uv) {
  float depth = texture2D(wallMirrorDepth, uv).x;
  if (depth >= 0.99999) return -10000.0;
  vec4 p = wallMirrorInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return p.z / p.w;
}
vec4 wallReflection(vec3 surface, vec3 faceNormal) {
  // Camera rays are parallel in our orthographic view, even at the screen edge.
  vec3 incident = isOrthographic ? vec3(0.0, 0.0, -1.0) : normalize(surface);
  vec3 direction = normalize(reflect(incident, faceNormal));
  vec3 origin = surface + faceNormal * 0.035;
  float previousDelta = -10000.0;
  float previousDistance = 0.06;
  for (int i = 0; i < 80; i++) {
    float distance = 0.16 + float(i) * 0.115;
    vec3 p = origin + direction * distance;
    vec2 uv = mirrorProject(p);
    if (min(uv.x, uv.y) < 0.003 || max(uv.x, uv.y) > 0.997) break;
    float delta = mirrorSceneZ(uv) - p.z;
    if (i > 0 && delta >= 0.0 && previousDelta < 0.0 && delta < 0.34) {
      float low = previousDistance, high = distance;
      for (int j = 0; j < 5; j++) {
        float middle = (low + high) * 0.5;
        vec3 candidate = origin + direction * middle;
        if (mirrorSceneZ(mirrorProject(candidate)) - candidate.z >= 0.0) high = middle;
        else low = middle;
      }
      p = origin + direction * high;
      uv = mirrorProject(p);
      float gap = mirrorSceneZ(uv) - p.z;
      float edge = smoothstep(0.005, 0.045, min(min(uv.x, uv.y), min(1.0-uv.x, 1.0-uv.y)));
      float confidence = edge * (1.0 - smoothstep(6.0, 9.2, high)) * (1.0 - smoothstep(0.10, 0.27, gap));
      return vec4(texture2D(wallMirrorColor, uv).rgb, confidence);
    }
    previousDelta = delta;
    previousDistance = distance;
  }
  return vec4(0.0);
}
`;

export class WallMirrors {
  constructor(renderer) {
    this.enabled=true;
    this.target=null;
    this.renderer=renderer;
    // Three caches its transmission buffer by camera identity. Capture and
    // screen viewports differ, so sharing a camera would resize/dispose that
    // buffer twice every frame. Keep a separate, stable orthographic camera.
    this.captureCamera=new THREE.OrthographicCamera();
    this.size=new THREE.Vector2();this.viewport=new THREE.Vector4();this.scissor=new THREE.Vector4();
    this.uniforms={
      wallMirrorReady:{value:0},wallMirrorColor:{value:null},wallMirrorDepth:{value:null},
      wallMirrorProjection:{value:new THREE.Matrix4()},wallMirrorInverseProjection:{value:new THREE.Matrix4()}
    };
    this.lastCaptureCalls=0;this.lastTotalCalls=0;this.lastTotalTriangles=0;
    this.hidden=[];
  }
  attach(group) {
    const material=group.getObjectByName('stone-wall-blocks')?.material;
    if(!material)return;
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader='attribute float mirrorSide;\nvarying float vWallMirrorSide;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvWallMirrorSide = mirrorSide;');
      shader.fragmentShader=declarations+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
        if (wallMirrorReady > 0.5 && vWallMirrorSide > 0.5) {
          roughnessFactor = 0.09;
          metalnessFactor = 0.18;
        }`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        if (wallMirrorReady > 0.5 && vWallMirrorSide > 0.5) {
          vec4 reflected = wallReflection(-vViewPosition, normalize(nonPerturbedNormal));
          vec3 purple = diffuseColor.rgb / max(max(diffuseColor.r, diffuseColor.g), max(diffuseColor.b, 0.001));
          vec3 silveredPurple = mix(vec3(0.70), purple, 0.25);
          outgoingLight = mix(outgoingLight, reflected.rgb * silveredPurple, reflected.a * 0.68);
        }
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=> 'purple-wall-mirrors-v1';
    material.needsUpdate=true;
  }
  setEnabled(enabled) {
    this.enabled=Boolean(enabled);
    if(!this.enabled){this.uniforms.wallMirrorReady.value=0;this.releaseTarget();}
  }
  releaseTarget() {
    this.uniforms.wallMirrorColor.value=null;this.uniforms.wallMirrorDepth.value=null;
    if(this.target){this.target.dispose();this.target=null;}
  }
  render(scene,camera) {
    const renderer=this.renderer,u=this.uniforms;
    if(!this.enabled){
      u.wallMirrorReady.value=0;renderer.render(scene,camera);
      this.lastCaptureCalls=0;this.lastTotalCalls=renderer.info.render.calls;this.lastTotalTriangles=renderer.info.render.triangles;return;
    }
    renderer.getDrawingBufferSize(this.size);
    const scale=Math.min(1,1600/this.size.x,1000/this.size.y);
    const width=Math.max(1,Math.round(this.size.x*scale)),height=Math.max(1,Math.round(this.size.y*scale));
    if(!this.target){
      this.target=new THREE.WebGLRenderTarget(width,height,{
        type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,
        minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false
      });
      this.target.texture.colorSpace=THREE.LinearSRGBColorSpace;
      this.target.texture.generateMipmaps=false;
      this.target.depthTexture=new THREE.DepthTexture(width,height,THREE.UnsignedIntType);
      this.target.depthTexture.minFilter=this.target.depthTexture.magFilter=THREE.NearestFilter;
    }else if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
    u.wallMirrorProjection.value.copy(camera.projectionMatrix);
    u.wallMirrorInverseProjection.value.copy(camera.projectionMatrixInverse);
    this.captureCamera.copy(camera,false);
    const previousTarget=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);
    const scissorTest=renderer.getScissorTest(),shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate;
    const autoClear=renderer.autoClear;
    this.hidden.length=0;
    try{
      // Transparent vapor and light stamps have no matching depth surface.
      // Keep them in the main view, but avoid phantom silhouettes in mirrors.
      scene.traverse(object=>{
        if(object.visible&&object.material&&!Array.isArray(object.material)&&object.material.transparent&&!object.material.depthWrite){
          this.hidden.push(object);object.visible=false;
        }
      });
      // Unbind the target textures too: WebGL forbids attachment feedback even
      // if a runtime shader branch happens not to sample its active sampler.
      u.wallMirrorReady.value=0;u.wallMirrorColor.value=null;u.wallMirrorDepth.value=null;
      renderer.setRenderTarget(this.target);renderer.setScissorTest(false);renderer.autoClear=true;
      renderer.render(scene,this.captureCamera);
      this.lastCaptureCalls=renderer.info.render.calls;
      const captureTriangles=renderer.info.render.triangles;
      for(const object of this.hidden)object.visible=true;
      this.hidden.length=0;
      renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);renderer.setRenderTarget(previousTarget,face,mip);
      renderer.autoClear=autoClear;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
      u.wallMirrorColor.value=this.target.texture;u.wallMirrorDepth.value=this.target.depthTexture;u.wallMirrorReady.value=1;
      renderer.render(scene,camera);
      this.lastTotalCalls=this.lastCaptureCalls+renderer.info.render.calls;
      this.lastTotalTriangles=captureTriangles+renderer.info.render.triangles;
    }finally{
      for(const object of this.hidden)object.visible=true;
      this.hidden.length=0;
      renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);renderer.setRenderTarget(previousTarget,face,mip);
      renderer.autoClear=autoClear;renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;
    }
  }
  diagnostics(){return {enabled:this.enabled,method:'screen-space',captureSize:this.target?[this.target.width,this.target.height]:null,captureDrawCalls:this.lastCaptureCalls,totalDrawCalls:this.lastTotalCalls,totalTriangles:this.lastTotalTriangles};}
  dispose(){this.releaseTarget();}
}
