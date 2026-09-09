import * as THREE from './vendor/three.module.min.js';
import {installNeonPolish,addNeonVolumeAttribute} from './neon-polish.mjs';

// Dark optical glass around a narrow neon filament. Transmission keeps
// the shell in Three's depth-writing refractive pass: ordinary alpha blending
// cannot sort the individual segments of an InstancedMesh reliably.
export function createSnakeFinish(color,{role='snake'}={}){
  const material=new THREE.MeshPhysicalMaterial({
    roughness:.065,metalness:0,clearcoat:1,clearcoatRoughness:.025,
    transmission:.95,thickness:.24,ior:1.43,attenuationDistance:1.4,
    emissiveIntensity:.12,envMapIntensity:1.1
  });
  material.name='Neon glass shell';
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      vec3 neonView=isOrthographic?vec3(0.0,0.0,1.0):normalize(vViewPosition);
      float neonRim=pow(1.0-abs(dot(normalize(normal),neonView)),2.0);
      totalEmissiveRadiance *= .08 + neonRim * 2.8;
    `);
  };
  material.customProgramCacheKey=()=> 'neon-snake-shell-v2';
  const skinMaterial=material.clone();
  skinMaterial.name='Luminous flexible joints';
  // The flexible tube occupies most of the shell's interior. It must also
  // transmit, or it reads as an opaque glowing plastic filling under glass.
  skinMaterial.transmission=.94;skinMaterial.roughness=.085;skinMaterial.emissiveIntensity=.13;
  skinMaterial.thickness=.18;
  const accentMaterial=new THREE.MeshStandardMaterial({roughness:.12,metalness:.12,emissiveIntensity:.60});
  accentMaterial.name='Etched glass scales';
  const coreMaterial=new THREE.MeshBasicMaterial();
  coreMaterial.name='Neon luminous core';
  const tint=new THREE.Color();
  const setColor=value=>{
    tint.set(value);
    material.color.copy(tint).multiplyScalar(.78);
    material.emissive.copy(tint);material.attenuationColor.copy(tint);
    skinMaterial.color.copy(tint).multiplyScalar(.62);
    skinMaterial.emissive.copy(tint);skinMaterial.attenuationColor.copy(tint);
    accentMaterial.color.copy(tint).multiplyScalar(.16);accentMaterial.emissive.copy(tint);
    // Concentrate the brightness into a saturated filament. Broad white
    // emission masks the refracted background and makes the glass milky.
    coreMaterial.color.copy(tint).multiplyScalar(2.4).addScalar(.012);
  };
  setColor(color);
  const finish={material,skinMaterial,accentMaterial,coreMaterial,tint,setColor,
    dispose(){for(const m of [material,skinMaterial,accentMaterial,coreMaterial])m.dispose();}};
  return role==='player'?finish:installNeonPolish(finish);
}

// Each shared model gets one shared inset geometry, including matching morph
// targets. Scale about each shape's own center, especially the elevated skull
// and the jaw whose origin is its hinge, not the center of its volume.
const coreGeometries=new WeakMap();
export function snakeCoreGeometry(source){
  if(coreGeometries.has(source))return coreGeometries.get(source);
  const geometry=source.clone(),box=new THREE.Box3(),center=new THREE.Vector3();
  const inset=attribute=>{
    box.setFromBufferAttribute(attribute);box.getCenter(center);
    for(let i=0;i<attribute.count;i++)attribute.setXYZ(i,
      center.x+(attribute.getX(i)-center.x)*.22,
      center.y+(attribute.getY(i)-center.y)*.28,
      // Stop the filament before the sloping glass tip. Centering a very
      // narrow filament can otherwise lift its end through that thin taper.
      center.z+(attribute.getZ(i)-center.z)*.80);
  };
  inset(geometry.attributes.position);
  for(const attribute of geometry.morphAttributes.position??[])inset(attribute);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  addNeonVolumeAttribute(geometry);
  coreGeometries.set(source,geometry);return geometry;
}

export function addSnakeHeadCores(head,finish){
  const shells=[];head.traverse(object=>{
    // The two swept ridges share one disconnected geometry. Shrinking that
    // pair around its common center would pull a core outside the thin ridges.
    // Their emissive glass is lit by the skull's enclosed volume instead.
    if(object.isMesh&&object.material===finish.material&&object.name!=='Swept triangular cranial folds')shells.push(object);
  });
  for(const shell of shells){
    const core=new THREE.Mesh(snakeCoreGeometry(shell.geometry),finish.coreMaterial);
    core.name=shell.name+' luminous core';shell.add(core);
  }
  finish.prepareHead?.(head);
}

export function copySnakeCore(core,shell){
  core.visible=shell.visible;core.position.copy(shell.position);
  core.quaternion.copy(shell.quaternion);core.scale.copy(shell.scale);
  if(core.morphTargetInfluences)core.morphTargetInfluences[0]=shell.morphTargetInfluences[0];
}

const glowGeometry=new THREE.PlaneGeometry(1,1);
function makeGlow(color){
  const material=new THREE.ShaderMaterial({
    uniforms:{neonColor:{value:color.clone()}},
    vertexShader:`varying vec2 glowUV;
      void main(){
        glowUV=uv;
        vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        center.xy+=position.xy*length(instanceMatrix[0].xyz);
        gl_Position=projectionMatrix*center;
      }`,
    fragmentShader:`uniform vec3 neonColor;varying vec2 glowUV;
      void main(){
        float r=length(glowUV*2.-1.);
        float a=exp(-5.5*r*r)*(1.-smoothstep(.65,1.,r))*.19;
        gl_FragColor=vec4(neonColor,a);
        #include <colorspace_fragment>
      }`,
    transparent:true,depthWrite:false,depthTest:true,
    blending:THREE.AdditiveBlending,toneMapped:false
  });
  const glow=new THREE.InstancedMesh(glowGeometry,material,64);
  glow.name='Soft neon snake aura';glow.frustumCulled=false;glow.count=0;
  glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);return glow;
}

const stamp=new THREE.Object3D(),projected=new THREE.Vector3();
export class SnakeLight{
  constructor(scene){
    this.lights=Array.from({length:8},()=>{
      const light=new THREE.PointLight(0xffffff,0,3.6,2);
      light.name='Snake colored light';scene.add(light);return light;
    });
    this.assignments=new Map();this.candidates=[];
  }
  attach(item){item.glow=makeGlow(item.finish.tint);item.group.add(item.glow);}
  remove(item){item.glow.dispose();item.glow.material.dispose();}
  beginFrame(){this.candidates.length=0;}
  sample(item,s,sample,layout){
    const n=s.body.length;item.glow.count=Math.min(64,n);
    for(let i=0;i<item.glow.count;i++){
      const p=sample(i),tail=i===n-1&&n>1;
      const x=layout.x(p.x),z=layout.z(p.y),y=i===0?.82:tail?.45:.55;
      stamp.position.set(x,y,z);stamp.scale.setScalar(i===0?3.0:tail?2.2:2.9);stamp.updateMatrix();
      item.glow.setMatrixAt(i,stamp.matrix);
      // Sampled sources cover the entire chain. The nearest visible sources
      // share a fixed pool; splitting cannot add an unlimited set of lights.
      if(i===0||i===n-1||i%3===0)this.candidates.push({
        key:s.id+':'+i,id:s.id,x,y,z,color:item.finish.tint,head:i===0
      });
    }
    item.glow.instanceMatrix.needsUpdate=true;
  }
  update(camera,dt){
    camera.updateMatrixWorld();
    for(const c of this.candidates){
      projected.set(c.x,c.y,c.z).project(camera);
      c.score=Math.hypot(projected.x,projected.y)+(Math.abs(projected.x)>1.15||Math.abs(projected.y)>1.15?10:0)
        -(this.assignments.has(c.key)?.18:0)-(c.head?.12:0);
    }
    this.candidates.sort((a,b)=>a.score-b.score);
    // Give each visible snake one source before spending the spare sources
    // along a long body. Keep existing assignments stable as the camera moves.
    const chosen=[],ids=new Set();
    for(const c of this.candidates)if(!ids.has(c.id)&&c.score<10&&chosen.length<8){chosen.push(c);ids.add(c.id);}
    for(const c of this.candidates)if(chosen.length<8&&!chosen.includes(c)&&c.score<10)chosen.push(c);
    const keys=new Set(chosen.map(c=>c.key));
    // A split changes snake IDs but can leave the visible source in exactly
    // the same place. Reuse that lamp without briefly extinguishing its glow.
    for(const c of chosen)if(!this.assignments.has(c.key)){
      for(const [key,light] of this.assignments){
        if(!keys.has(key)&&light.color.equals(c.color)&&Math.hypot(light.position.x-c.x,light.position.y-c.y,light.position.z-c.z)<.6){
          this.assignments.delete(key);this.assignments.set(c.key,light);break;
        }
      }
    }
    for(const [key,light] of this.assignments)if(!keys.has(key)){
      light.intensity=THREE.MathUtils.damp(light.intensity,0,25,Math.max(0,dt));
      if(light.intensity<.20){light.intensity=0;this.assignments.delete(key);}
    }
    for(const c of chosen){
      let light=this.assignments.get(c.key);
      if(!light){
        light=this.lights.find(l=>![...this.assignments.values()].includes(l));
        if(!light)continue;
        light.intensity=0;this.assignments.set(c.key,light);
      }
      light.position.set(c.x,c.y,c.z);light.color.copy(c.color);
      light.intensity=THREE.MathUtils.damp(light.intensity,4.8,12,Math.max(0,dt));
    }
  }
  reset(){this.assignments.clear();this.candidates.length=0;for(const light of this.lights)light.intensity=0;}
}
