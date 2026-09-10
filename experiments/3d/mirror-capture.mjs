import * as THREE from './vendor/three.module.min.js';

// Reflections need the luminous silhouette and its depth, not a second
// refraction of the same opaque-scene buffer. Keep the original geometry,
// instancing and jaw/tail morphs, with a cheap, depth-writing optical finish.
// The actual game view always uses the original transmitting materials.
export class MirrorCaptureMaterials {
  constructor({unlit=false}={}){this.cache=new Map();this.swapped=[];this.hidden=[];this.unlit=unlit;}
  material(source){
    let proxy=this.cache.get(source);
    if(!proxy){
      proxy=this.unlit?new THREE.MeshBasicMaterial({vertexColors:source.vertexColors,map:source.map}):new THREE.MeshStandardMaterial({roughness:.16,metalness:.08});
      proxy.name='Luminous mirror capture';
      if(!this.unlit)proxy.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
          #include <emissivemap_fragment>
          vec3 mirrorView=isOrthographic?vec3(0.,0.,1.):normalize(vViewPosition);
          float mirrorRim=pow(1.-abs(dot(normalize(normal),mirrorView)),2.);
          totalEmissiveRadiance *= .34 + mirrorRim * .85;
        `);
      };
      proxy.customProgramCacheKey=()=> 'neon-mirror-capture-v1';
      const release=()=>{proxy.dispose();this.cache.delete(source);source.removeEventListener('dispose',release);};
      source.addEventListener('dispose',release);proxy.userData.release=release;
      this.cache.set(source,proxy);
    }
    proxy.color.copy(source.color);
    if(this.unlit){
      // Keep the scene recognizable in the narrow planar image, without
      // resampling all twelve lights and their shadow maps per mirror pixel.
      const gain=Math.max(source.emissiveIntensity,source.transmission>0?.85:0);
      proxy.color.setRGB(proxy.color.r*.38+source.emissive.r*gain,proxy.color.g*.38+source.emissive.g*gain,proxy.color.b*.38+source.emissive.b*gain);
    }else{proxy.emissive.copy(source.emissive);proxy.emissiveIntensity=Math.max(.85,source.emissiveIntensity*2);}
    proxy.side=source.side;proxy.depthTest=source.depthTest;proxy.depthWrite=true;
    proxy.envMapIntensity=source.envMapIntensity??1;
    return proxy;
  }
  begin(scene){
    scene.traverse(object=>{
      const source=object.material;
      if(!object.visible||!source||Array.isArray(source))return;
      if(source.transparent&&!source.depthWrite){this.hidden.push(object);object.visible=false;}
      // Preserve the floor's actual colored light pools: their reflected
      // illumination is visible even when an actor stands beyond the low
      // mirror's physical view. Only the planar actor/stone finish is cheap.
      else if(source.transmission>0||(this.unlit&&source.isMeshStandardMaterial&&!(object.isInstancedMesh&&source.map))){this.swapped.push([object,source]);object.material=this.material(source);}
    });
  }
  end(){
    for(const [object,source] of this.swapped)object.material=source;
    for(const object of this.hidden)object.visible=true;
    this.swapped.length=this.hidden.length=0;
  }
  dispose(){this.end();for(const [source,proxy] of this.cache)proxy.userData.release();}
}
