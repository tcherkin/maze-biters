import {PlanarWallMirrors,planarDeclarations} from './planar-wall-mirrors.mjs';

// Every visible exposed plane uses the same reflection path every frame.
// Geometry/camera visibility determines the atlas, never actor priority.
export class WallMirrors {
  constructor(renderer){
    this.enabled=true;this.renderer=renderer;
    this.uniforms={wallMirrorReady:{value:0}};
    this.planar=new PlanarWallMirrors(renderer);
    this.lastCaptureCalls=0;this.lastTotalCalls=0;this.lastTotalTriangles=0;
  }
  get target(){return this.planar.target;}
  attach(group){
    const material=group.getObjectByName('stone-wall-blocks')?.material;
    if(!material)return;
    this.planar.attach(group);
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.uniforms,this.planar.uniforms);
      shader.vertexShader='attribute float mirrorSide;\nvarying float vWallMirrorSide;\nvarying vec3 vMirrorWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWallMirrorSide=mirrorSide;');
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvMirrorWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader='uniform float wallMirrorReady;\nvarying float vWallMirrorSide;\n'+planarDeclarations+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
        if(wallMirrorReady>.5 && vWallMirrorSide>.5){roughnessFactor=.09;metalnessFactor=.18;}`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        if(wallMirrorReady>.5 && vWallMirrorSide>.5){
          vec4 reflected=planarReflection(inverseTransformDirection(normalize(nonPerturbedNormal),viewMatrix));
          vec3 purple=diffuseColor.rgb/max(max(diffuseColor.r,diffuseColor.g),max(diffuseColor.b,.001));
          // A smoked-purple silvering follows each block's actual pigment.
          // Tint the neutral floor/studio component strongly; preserve the
          // chromatic light of neon actors instead of extinguishing red/cyan.
          float neutral=min(reflected.r,min(reflected.g,reflected.b));
          vec3 chromatic=reflected.rgb-vec3(neutral);
          vec3 coated=neutral*purple*.48+chromatic*mix(vec3(.94),purple,.09);
          outgoingLight=mix(outgoingLight,coated,reflected.a*.86);
        }
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=> 'purple-wall-mirrors-v6';material.needsUpdate=true;
  }
  setEnabled(enabled){this.enabled=Boolean(enabled);if(!this.enabled){this.uniforms.wallMirrorReady.value=0;this.releaseTarget();}}
  releaseTarget(){this.planar.release();}
  async prepare(scene,camera){
    if(!this.enabled||!this.target||!this.planar.selected.length)return;
    const renderer=this.renderer,target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),clipping=renderer.clippingPlanes;
    try{
      this.uniforms.wallMirrorReady.value=0;
      this.planar.uniforms.wallPlanarCount.value=0;this.planar.uniforms.wallPlanarColor.value=null;
      this.planar.materials.begin(scene);renderer.setRenderTarget(this.target);
      renderer.clippingPlanes=[this.planar.selected[0].plane];
      await renderer.compileAsync(scene,this.planar.cameras[0]);
    }finally{
      this.planar.materials.end();renderer.clippingPlanes=clipping;renderer.setRenderTarget(target,face,mip);
    }
  }
  render(scene,camera){
    const renderer=this.renderer,u=this.uniforms;
    if(!this.enabled){
      u.wallMirrorReady.value=0;renderer.render(scene,camera);
      this.lastCaptureCalls=0;this.lastTotalCalls=renderer.info.render.calls;this.lastTotalTriangles=renderer.info.render.triangles;return;
    }
    const shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate;
    try{
      // Unbind atlas while it is an attachment, including the zero-plane case.
      u.wallMirrorReady.value=0;this.planar.uniforms.wallPlanarCount.value=0;this.planar.uniforms.wallPlanarColor.value=null;
      this.planar.render(scene,camera);
      this.lastCaptureCalls=this.planar.calls;
      if(this.planar.selected.length){renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;}
      u.wallMirrorReady.value=1;renderer.render(scene,camera);
      this.lastTotalCalls=this.planar.calls+renderer.info.render.calls;
      this.lastTotalTriangles=this.planar.triangles+renderer.info.render.triangles;
    }finally{renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;}
  }
  diagnostics(){return {enabled:this.enabled,method:'stable-exposed-planar',planarViews:this.enabled?this.planar.selected.length:0,
    captureSize:this.target?[this.target.width,this.target.height]:null,tileResolution:[this.planar.tileWidth,this.planar.tileHeight],captureDrawCalls:this.lastCaptureCalls,totalDrawCalls:this.lastTotalCalls,totalTriangles:this.lastTotalTriangles};}
  dispose(){this.planar.dispose();}
}
