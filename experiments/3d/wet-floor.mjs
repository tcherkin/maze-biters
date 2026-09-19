import * as THREE from './vendor/three.module.min.js';
import {ProjectionCamera} from './projection-camera.mjs';

// A continuous spatial filter at the capture resolution. Coarse box mipmaps
// preserve total light but redistribute it between rows as the camera moves;
// sampling those mips made even an energy-stable neon strip visibly pulse.
// Pair adjacent Gaussian taps using bilinear interpolation (25 taps / 13 reads).
function reflectionFilter(){
  const radius=12,sigma=4.5,weights=Array.from({length:radius+1},(_,i)=>Math.exp(-i*i/(2*sigma*sigma)));
  const total=weights[0]+2*weights.slice(1).reduce((a,b)=>a+b,0),tap=[];
  for(let i=1;i<=radius;i+=2){
    const weight=(weights[i]+weights[i+1])/total,offset=i+weights[i+1]/(weights[i]+weights[i+1]);
    tap.push(`color+=(textureLod(source,vUv+axis*${offset.toFixed(8)},0.).rgb+textureLod(source,vUv-axis*${offset.toFixed(8)},0.).rgb)*${weight.toFixed(8)};`);
  }
  const material=new THREE.ShaderMaterial({
    uniforms:{source:{value:null},axis:{value:new THREE.Vector2()}},depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position,1.);}',
    fragmentShader:`uniform sampler2D source;uniform vec2 axis;varying vec2 vUv;
      void main(){vec3 color=textureLod(source,vUv,0.).rgb*${(weights[0]/total).toFixed(8)};${tap.join('\n')}gl_FragColor=vec4(color,1.);}`
  });
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  const scene=new THREE.Scene(),mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
  return {scene,camera:new THREE.Camera(),geometry,material};
}

// One planar pass for the whole paving. The reflected camera keeps the exact
// blended projection; only its physical pose is reflected across the floor.
export class WetFloor {
  constructor(renderer){
    this.renderer=renderer;this.camera=new ProjectionCamera();this.target=null;this.floor=null;this.filter=null;this.horizontal=null;this.filtered=null;
    this.direction=new THREE.Vector3();this.point=new THREE.Vector3();this.size=new THREE.Vector2();this.clearColor=new THREE.Color();
    this.uniforms={wetColor:{value:null},wetMatrix:{value:new THREE.Matrix4()},wetTexel:{value:new THREE.Vector2()},wetReady:{value:0},wetMystic:{value:0}};
  }
  attach(group){
    this.release();this.floor=group?.getObjectByName('maze-paving')??null;
    if(!this.floor)return;
    const material=this.floor.material,before=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      before(shader,renderer);Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader='varying vec3 vWetWorld;varying vec2 vWetSlab;varying vec2 vWetSlabCenter;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vWetSlab=position.xy;vWetSlabCenter=vec2(0.);
        vec4 wetP=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          wetP=instanceMatrix*wetP;
          vWetSlabCenter=instanceMatrix[3].xz;
        #endif
        vWetWorld=(modelMatrix*wetP).xyz;`);
      shader.fragmentShader=`varying vec3 vWetWorld;varying vec2 vWetSlab;varying vec2 vWetSlabCenter;uniform float wetMystic;
        uniform sampler2D wetColor;uniform mat4 wetMatrix;uniform vec2 wetTexel;uniform float wetReady;
        float wetHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float wetNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(wetHash(i),wetHash(i+vec2(1,0)),f.x),mix(wetHash(i+vec2(0,1)),wetHash(i+vec2(1)),f.x),f.y);}
        `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec4 reflected=wetMatrix*vec4(vWetWorld.x,-.005,vWetWorld.z,1.);
        vec2 wetUv=reflected.xy/reflected.w*.5+.5;
        float pool=wetNoise(vWetWorld.xz*.63)*.7+wetNoise(vWetWorld.xz*1.7)*.3;
        vec2 ripple=vec2(wetNoise(vWetWorld.xz*8.1),wetNoise(vWetWorld.zx*9.7))-.5;
        wetUv+=ripple*.0012;
        // The texture is already Gaussian-filtered. All samples use level 0,
        // so roughness cannot reintroduce coarse mip-grid brightness pulses.
        vec2 spread=wetTexel*(1.+3.*clamp(roughnessFactor,0.,1.)+wetMystic*2.5);
        vec3 reflection=textureLod(wetColor,wetUv,0.).rgb*.4;
        reflection+=(textureLod(wetColor,wetUv+vec2(spread.x,0.),0.).rgb+
          textureLod(wetColor,wetUv-vec2(spread.x,0.),0.).rgb+
          textureLod(wetColor,wetUv+vec2(0.,spread.y),0.).rgb+
          textureLod(wetColor,wetUv-vec2(0.,spread.y),0.).rgb)*.15;
        float edge=smoothstep(0.,.025,min(min(wetUv.x,wetUv.y),min(1.-wetUv.x,1.-wetUv.y)));
        float grazing=pow(1.-abs(dot(normal,geometryViewDir)),3.);
        float film=(.10+.29*smoothstep(.25,.73,pool)+grazing*.12)*wetReady*edge;
        // Film is strongest on the slab tops; dark bevels keep grout legible.
        film*=smoothstep(-.035,-.009,vWetWorld.y);
        // Fixed in slab/world space, never regenerated with the frame. The
        // existing bevels already break the film at the true paving joints.
        float slabWet=mix(.76,1.,wetHash(vWetSlabCenter));
        float mineralWet=mix(.72,1.,wetNoise(vWetWorld.xz*1.15));
        film*=mix(1.,slabWet*mineralWet,wetMystic);
        float reflectionPeak=max(max(reflection.r,reflection.g),reflection.b);
        reflection/=1.+wetMystic*.10*reflectionPeak;
        outgoingLight=mix(outgoingLight,reflection,film);
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>key+'|ruins-wet-film-v2';material.needsUpdate=true;
    this.hidden=group.children.filter(o=>o.userData.belowFloor||o===this.floor);
  }
  render(scene,camera){
    if(!this.floor)return;
    const r=this.renderer;r.getDrawingBufferSize(this.size);
    const scale=Math.min(.75,1920/this.size.x),w=Math.max(1,Math.round(this.size.x*scale)),h=Math.max(1,Math.round(this.size.y*scale));
    if(!this.target||this.target.width!==w||this.target.height!==h){
      this.target?.dispose();this.horizontal?.dispose();this.filtered?.dispose();
      const type=r.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
      this.target=new THREE.WebGLRenderTarget(w,h,{type,depthBuffer:true,samples:Math.min(4,r.capabilities.maxSamples)});
      // Keep both axes at native capture resolution. Downsampling the filtered
      // image still made its local peak vary as it crossed the smaller grid.
      this.horizontal=new THREE.WebGLRenderTarget(w,h,{type,depthBuffer:false});
      this.filtered=new THREE.WebGLRenderTarget(w,h,{type,depthBuffer:false});
      for(const t of [this.target,this.horizontal,this.filtered]){
        t.texture.colorSpace=THREE.LinearSRGBColorSpace;t.texture.generateMipmaps=false;t.texture.minFilter=THREE.LinearFilter;
      }
      this.filter??=reflectionFilter();this.uniforms.wetColor.value=this.filtered.texture;this.uniforms.wetTexel.value.set(1/w,1/h);
    }
    const reflection=this.camera;reflection.copy(camera,false);reflection.position.copy(camera.position);reflection.position.y=-.01-camera.position.y;
    camera.getWorldDirection(this.direction);this.direction.y*=-1;reflection.up.copy(camera.up);reflection.up.y*=-1;
    reflection.lookAt(this.point.copy(reflection.position).add(this.direction));reflection.updateMatrixWorld();
    this.uniforms.wetMatrix.value.multiplyMatrices(reflection.projectionMatrix,reflection.matrixWorldInverse);
    const target=r.getRenderTarget(),face=r.getActiveCubeFace(),mip=r.getActiveMipmapLevel(),clipping=r.clippingPlanes;
    const alpha=r.getClearAlpha(),auto=r.autoClear; r.getClearColor(this.clearColor);
    const visibility=[],opacity=[],shadowAuto=r.shadowMap.autoUpdate,shadowNeeds=r.shadowMap.needsUpdate;
    try{
      // Floor stamps/auras would be an artificial second glow below the
      // paving. Physical lights and crystal surfaces remain in the capture.
      scene.traverse(o=>{
        // Subpixel emitters need filtering BEFORE rasterization. Otherwise a
        // whole horizontal line alternates between zero and one bright row;
        // the later roughness blur merely spreads that pulsing energy around.
        // Only static luminous strips use soft, energy-matched capture ribbons.
        // Crystal actors still use this frame's real geometry and materials.
        const source=o.userData.wetReflectionOnly||o.userData.wetReflectionOpacity;
        if(o.userData.wetReflectionOnly){visibility.push([o,o.visible]);o.visible=true;}
        else if(o.visible&&(o.userData.wetReflectionHide||this.hidden.includes(o)||(!source&&o.material?.transparent&&!o.material.depthWrite))){visibility.push([o,true]);o.visible=false;}
        if(o.visible&&o.userData.wetReflectionOpacity){opacity.push([o.material,o.material.opacity]);o.material.opacity=o.userData.wetReflectionOpacity;}
      });
      this.uniforms.wetReady.value=0;r.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,1,0),.004)];
      r.setClearColor(0x030309,1);r.autoClear=true;r.setRenderTarget(this.target);r.render(scene,reflection);
      r.clippingPlanes=[];r.shadowMap.autoUpdate=false;r.shadowMap.needsUpdate=false;
      const {scene:filterScene,camera:filterCamera,material}=this.filter;
      material.uniforms.source.value=this.target.texture;material.uniforms.axis.value.set(1/w,0);
      r.setRenderTarget(this.horizontal);r.render(filterScene,filterCamera);
      material.uniforms.source.value=this.horizontal.texture;material.uniforms.axis.value.set(0,1/h);
      r.setRenderTarget(this.filtered);r.render(filterScene,filterCamera);
    }finally{
      for(const [o,visible] of visibility)o.visible=visible;
      for(const [material,value] of opacity)material.opacity=value;
      r.clippingPlanes=clipping;r.autoClear=auto;r.setClearColor(this.clearColor,alpha);
      r.shadowMap.autoUpdate=shadowAuto;r.shadowMap.needsUpdate=shadowNeeds;r.setRenderTarget(target,face,mip);
    }
    this.uniforms.wetReady.value=1;
  }
  release(){
    this.target?.dispose();this.horizontal?.dispose();this.filtered?.dispose();this.filter?.geometry.dispose();this.filter?.material.dispose();
    this.target=this.horizontal=this.filtered=this.filter=null;this.floor=null;this.uniforms.wetReady.value=0;this.uniforms.wetColor.value=null;
  }
  diagnostics(){return {enabled:!!this.floor,width:this.target?.width??0,height:this.target?.height??0,samples:this.target?.samples??0,emitterFilter:'spatial-ribbons',surfaceFilter:'separable-gaussian',filteredWidth:this.filtered?.width??0,filteredHeight:this.filtered?.height??0};}
}
