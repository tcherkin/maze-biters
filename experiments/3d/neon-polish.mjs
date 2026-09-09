import * as THREE from './vendor/three.module.min.js';

// Polish keeps the original 0.3.30 numbers. Balanced only adjusts ruby and
// magenta: the cyan/gold response and every surface-reflection setting stay
// as selected in Polish. These values are uploaded when a look/color changes.
const POLISH={head:[.055,.28,.20],core:[1.06,.30,.72]};
const BALANCED_RED={head:[.025,.235,.20],core:[1.02,.38,.76]};
const BALANCED_MAGENTA={head:[.035,.25,.20],core:[1.03,.36,.76]};
const normalizeLook=look=>['polish','balanced'].includes(look)?look:'before';

// This study defaults to the exact v0.3.29 finish. All alternatives share the
// same compiled shaders; switching only uploads uniforms/material properties.
// No change to light sources, transmission passes, geometry or actor poses.
export function installNeonPolish(finish){
  const mode={value:0},tint={value:finish.tint};
  const headFill={value:new THREE.Vector3(...POLISH.head)},coreProfile={value:new THREE.Vector3(...POLISH.core)};
  const hue={h:0,s:0,l:0};let look='before';
  const headMaterial=finish.material.clone(),jawMaterial=finish.material.clone();
  headMaterial.name='Neon glass head';jawMaterial.name='Neon glass jaw';
  finish.headMaterial=headMaterial;finish.jawMaterial=jawMaterial;
  const decorate=(material,role,originalCompile=null)=>{
    material.onBeforeCompile=shader=>{
      originalCompile?.(shader);
      shader.uniforms.neonPolish=mode;
      shader.uniforms.neonHeadRole={value:role};
      shader.uniforms.neonSourceTint=tint;
      shader.uniforms.neonHeadFill=headFill;
      shader.vertexShader='varying vec3 vNeonLocal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
        'vNeonLocal=transformed;\n#include <project_vertex>');
      shader.fragmentShader='uniform float neonPolish;uniform float neonHeadRole;uniform vec3 neonSourceTint;uniform vec3 neonHeadFill;varying vec3 vNeonLocal;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
        if(neonPolish>.5 && neonHeadRole>.5){
          vec3 p=vNeonLocal;
          if(neonHeadRole>1.5)p+=vec3(0.,.194,-.022);
          float side=smoothstep(.10,.215,abs(p.x));
          float brow=exp(-pow((p.y-.49)/.085,2.))*(1.-smoothstep(.16,.32,abs(p.z-.075)));
          float lip=exp(-pow((p.y-.17)/.055,2.))*smoothstep(-.12,.10,p.z);
          // Broad colored planes beside the eyes and lower mouth, not thin
          // white outlines. The geometry's own normals still carry the form.
          totalEmissiveRadiance+=neonSourceTint*(neonHeadFill.x+neonHeadFill.y*brow*side+neonHeadFill.z*lip);
        }
        #include <lights_physical_fragment>
      `);
    };
    material.customProgramCacheKey=()=> 'neon-polish-shell-v2'+(originalCompile?'-rim':'');
  };
  const rim=finish.material.onBeforeCompile;
  decorate(finish.material,0,rim);decorate(headMaterial,1,rim);decorate(jawMaterial,2,rim);
  // The baseline joint intentionally has no faceted rim shader.
  decorate(finish.skinMaterial,0);
  finish.coreMaterial.onBeforeCompile=shader=>{
    shader.uniforms.neonPolish=mode;
    shader.uniforms.neonCoreProfile=coreProfile;
    shader.vertexShader='attribute vec3 neonVolume;varying vec3 vNeonVolume;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvNeonVolume=neonVolume;');
    shader.fragmentShader='uniform float neonPolish;uniform vec3 neonCoreProfile;varying vec3 vNeonVolume;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      if(neonPolish>.5){
        float widthAA=max(fwidth(vNeonVolume.x),.02);
        float edge=smoothstep(.05,.92+widthAA,abs(vNeonVolume.x));
        float end=smoothstep(.58,1.,abs(vNeonVolume.z));
        float depth=mix(neonCoreProfile.x,neonCoreProfile.y,edge)*mix(1.,neonCoreProfile.z,end);
        // A stable object-space volume profile: the bright center rolls into
        // colored edges. There is no screen-space stripe, clock or noise.
        diffuseColor.rgb*=depth;
      }
    `);
  };
  finish.coreMaterial.customProgramCacheKey=()=> 'neon-polish-core-v2';
  const baseline=[finish.material,headMaterial,jawMaterial,finish.skinMaterial].map(material=>({material,
    roughness:material.roughness,clearcoat:material.clearcoat,clearcoatRoughness:material.clearcoatRoughness,
    specularIntensity:material.specularIntensity,envMapIntensity:material.envMapIntensity,transmission:material.transmission,
    specularColor:material.specularColor.clone()}));
  const setLook=value=>{
    look=normalizeLook(value);const enabled=look!=='before';
    mode.value=enabled?1:0;
    let profile=POLISH;
    if(look==='balanced'){
      finish.tint.getHSL(hue);
      if(hue.h<.045||hue.h>.96)profile=BALANCED_RED;
      else if(hue.h>.72)profile=BALANCED_MAGENTA;
    }
    headFill.value.fromArray(profile.head);coreProfile.value.fromArray(profile.core);
    for(const b of baseline){
      const m=b.material;
      m.roughness=enabled?.085:b.roughness;
      m.clearcoat=enabled?.38:b.clearcoat;
      m.clearcoatRoughness=enabled?.065:b.clearcoatRoughness;
      m.specularIntensity=enabled?.62:b.specularIntensity;
      m.envMapIntensity=enabled?.78:b.envMapIntensity;
      m.transmission=enabled&&m===jawMaterial?.89:b.transmission;
      m.specularColor.copy(b.specularColor);
      if(enabled)m.specularColor.lerp(finish.tint,.14);
    }
  };
  finish.setLook=setLook;
  finish.setPolish=enabled=>setLook(enabled?'polish':'before');
  finish.prepareHead=head=>head.traverse(object=>{
    if(!object.isMesh||object.material!==finish.material)return;
    object.material=object.name==='Angular lower jaw'?jawMaterial:headMaterial;
  });
  const originalSetColor=finish.setColor,originalDispose=finish.dispose;
  finish.setColor=value=>{
    originalSetColor(value);
    for(const material of [headMaterial,jawMaterial]){
      material.color.copy(finish.material.color);material.emissive.copy(finish.material.emissive);
      material.attenuationColor.copy(finish.material.attenuationColor);
    }
    setLook(look);
  };
  finish.dispose=()=>{headMaterial.dispose();jawMaterial.dispose();originalDispose();};
  setLook('before');return finish;
}

// Author a coordinate system once for each shared inset geometry. X/Y follow
// each loft cross-section, including the tapered end; Z follows its length.
// The same vertex correspondence travels through the existing tail morph.
export function addNeonVolumeAttribute(geometry){
  const p=geometry.attributes.position,rows=new Map();
  geometry.computeBoundingBox();const box=geometry.boundingBox;
  const rowKey=z=>Math.round(z*1e6);
  for(let i=0;i<p.count;i++){
    const key=rowKey(p.getZ(i));let r=rows.get(key);
    if(!r){r={x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity};rows.set(key,r);}
    r.x0=Math.min(r.x0,p.getX(i));r.x1=Math.max(r.x1,p.getX(i));
    r.y0=Math.min(r.y0,p.getY(i));r.y1=Math.max(r.y1,p.getY(i));
  }
  const coord=new Float32Array(p.count*3),normalize=(v,a,b)=>(b-a)<1e-6?0:(v-a)/(b-a)*2-1;
  for(let i=0;i<p.count;i++){
    const r=rows.get(rowKey(p.getZ(i)));
    coord[i*3]=normalize(p.getX(i),r.x0,r.x1);coord[i*3+1]=normalize(p.getY(i),r.y0,r.y1);
    coord[i*3+2]=normalize(p.getZ(i),box.min.z,box.max.z);
  }
  geometry.setAttribute('neonVolume',new THREE.BufferAttribute(coord,3));
}

export class NeonPolish{
  constructor(){this.look='before';this.enabled=false;this.finishes=new Set();}
  register(finish){this.finishes.add(finish);finish.setLook?.(this.look);}
  unregister(finish){this.finishes.delete(finish);}
  setLook(look){this.look=normalizeLook(look);this.enabled=this.look!=='before';for(const finish of this.finishes)finish.setLook?.(this.look);}
  setEnabled(enabled){this.setLook(enabled?'polish':'before');}
}
