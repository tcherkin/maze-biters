import * as THREE from '../vendor/three.module.min.js';

// A separate animal silhouette, authored in native player space: +Z forward.
// Geometry is shared between instances; materials and animation rigs are not.
function placed(geometry,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){
  geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale)));
  return geometry;
}
const oval=(position,scale,rotation=[0,0,0],segments=24,rings=16)=>
  placed(new THREE.SphereGeometry(1,segments,rings),position,scale,rotation);
function merge(parts){
  const positions=[],normals=[],colors=[];
  const colored=parts.some(part=>part.attributes.color);
  for(const part of parts){
    const geometry=part.index?part.toNonIndexed():part;
    positions.push(...geometry.attributes.position.array);normals.push(...geometry.attributes.normal.array);
    if(colored){
      if(geometry.attributes.color)colors.push(...geometry.attributes.color.array);
      else for(let i=0;i<geometry.attributes.position.count;i++)colors.push(1,1,1);
    }
    if(geometry!==part)geometry.dispose();part.dispose();
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  if(colored)geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
function surface(rows,columns,point){
  const positions=[],indices=[];
  for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++)positions.push(...point(row/rows,column/columns));
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const a=row*(columns+1)+column,b=a+1,c=a+columns+1;indices.push(a,c,b,b,c,c+1);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function luminous(geometry,color,gain){
  const tint=new THREE.Color(color).multiplyScalar(gain),colors=new Float32Array(geometry.attributes.position.count*3);
  const normals=geometry.attributes.normal;
  for(let i=0;i<geometry.attributes.position.count;i++){
    const shade=.78+.22*THREE.MathUtils.clamp(.5+normals.getY(i)*.3-normals.getZ(i)*.2,0,1);
    colors[i*3]=tint.r*shade;colors[i*3+1]=tint.g*shade;colors[i*3+2]=tint.b*shade;
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;
}

const haunchCenter=new THREE.Vector3(0,.232,-.074),haunchRadius=new THREE.Vector3(.246,.174,.269);
const haunches=oval(haunchCenter.toArray(),haunchRadius.toArray(),[0,0,0],32,20);

// Six-sided slender quills narrow continuously to a tiny softened end facet.
// All lean toward the rump, including the radial fringe beside the shoulders.
function quillGeometry(){
  const positions=[],indices=[],levels=[[0,.76],[.14,1],[.67,.56],[.93,.13],[1,.035]],sides=6;
  for(const [height,radius]of levels)for(let side=0;side<sides;side++){
    const angle=(side+.5)*Math.PI*2/sides;positions.push(Math.cos(angle)*radius,height,Math.sin(angle)*radius);
  }
  for(let row=0;row<levels.length-1;row++)for(let side=0;side<sides;side++){
    const a=row*sides+side,b=row*sides+(side+1)%sides,c=a+sides,d=b+sides;
    indices.push(a,c,b,b,c,d);
  }
  for(let side=1;side<sides-1;side++){indices.push(0,side,side+1);indices.push(24,24+side+1,24+side);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);const faceted=geometry.toNonIndexed();geometry.dispose();faceted.computeVertexNormals();return faceted;
}
const quills=[],quillCores=[],quillCount=63;
const rows=[[.25,5],[.53,8],[.83,10],[1.1,12],[1.35,14],[1.52,14]];
let quillIndex=0;
for(const [row,[theta,count]]of rows.entries())for(let i=0;i<count;i++){
  const openFront=row<2?0:.74;
  const phi=openFront+(i+.5*(row%2))*(Math.PI*2-openFront*2)/count;
  const position=new THREE.Vector3(
    haunchRadius.x*Math.sin(theta)*Math.sin(phi),
    haunchRadius.y*Math.cos(theta),
    haunchRadius.z*Math.sin(theta)*Math.cos(phi)).multiplyScalar(.985).add(haunchCenter);
  const normal=new THREE.Vector3(
    (position.x-haunchCenter.x)/(haunchRadius.x*haunchRadius.x),
    (position.y-haunchCenter.y)/(haunchRadius.y*haunchRadius.y),
    (position.z-haunchCenter.z)/(haunchRadius.z*haunchRadius.z)).normalize();
  const direction=new THREE.Vector3(normal.x*.78,normal.y*.82+.20,normal.z*.62-.55).normalize();
  let length=.128+(quillIndex%4)*.009-(row===5?.024:0);
  while(Math.hypot(position.x+direction.x*length,position.z+direction.z*length)>.419||position.y+direction.y*length>.559)length-=.002;
  const width=.016+(quillIndex%3)*.0018;
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
  quills.push(quillGeometry().applyMatrix4(new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(width,length,width))));
  // Thin suspended filaments occupy the middle of each quill and stop well
  // before its sharp end. They never become a glowing solid coat or halo.
  const center=position.clone().addScaledVector(direction,length*.47);
  const core=oval([0,0,0],[width*.18,length*.23,width*.18],[0,0,0],8,6);
  core.applyMatrix4(new THREE.Matrix4().compose(center,rotation,new THREE.Vector3(1,1,1)));
  quillCores.push(luminous(core,quillIndex%3===0?0x39dfa1:0x30d9c1,2.8));quillIndex++;
}

// The head is appreciably smaller than the rump. Its open lower front lets
// the long tapered muzzle and hinged jaw make an animal-like little smile.
const head=surface(18,40,(v,u)=>{
  const phi=(u-.5)*Math.PI*2,rear=THREE.MathUtils.smoothstep(Math.abs(phi),.82,1.9);
  const theta=v*THREE.MathUtils.lerp(1.69,Math.PI,rear);
  return [.167*Math.sin(theta)*Math.sin(phi),.281+.122*Math.cos(theta),.151+.139*Math.sin(theta)*Math.cos(phi)];
});
const muzzle=surface(16,28,(v,u)=>{
  const a=(u-.5)*3.64,bend=Math.sin(v*Math.PI)*.012;
  const width=THREE.MathUtils.lerp(.106,.031,v),height=THREE.MathUtils.lerp(.057,.026,v);
  return [Math.sin(a)*width,.276-v*.020+Math.cos(a)*height+bend,.205+v*.182];
});
const ears=[],earInners=[];
for(const side of [-1,1]){
  const rotation=[-.13,side*.20,side*-.14];
  ears.push(oval([side*.137,.366,.116],[.053,.064,.032],rotation,20,14));
  earInners.push(oval([side*.139,.373,.143],[.030,.041,.009],rotation,16,12));
}
const coatGeometry=merge([haunches,...quills,...earInners]);
const headGeometry=merge([head,muzzle,...ears]);
const mouthCenter=[0,.263,.248],mouthRadii=[.110,.055,.114];
const mouthGeometry=oval(mouthCenter,mouthRadii,[0,0,0],24,16);
const noseAndEyes=[oval([0,.257,.389],[.041,.029,.024],[0,0,0],24,16)],catchlights=[];
for(const side of [-1,1]){
  const rotation=[-.27,side*.45,side*-.10];
  noseAndEyes.push(oval([side*.119,.316,.237],[.049,.057,.033],rotation,24,16));
  catchlights.push(oval([side*.119-.010,.338,.264],[.0085,.011,.006],[0,0,0],12,8));
  catchlights.push(oval([side*.119+.009,.321,.269],[.0038,.0045,.003],[0,0,0],8,6));
}
const eyeGeometry=merge(noseAndEyes),catchlightGeometry=merge(catchlights);

const bodyCores=[
  luminous(oval([0,.233,-.245],[.015,.070,.020],[0,0,0],12,8),0x23ccab,1.9),
  ...[-1,1].map(side=>luminous(oval([side*.118,.242,-.175],[.015,.056,.020],[0,0,side*.5],12,8),0x23ccab,1.9)),
  luminous(oval([0,.352,.179],[.024,.025,.019],[0,0,0],12,8),0x9deac1,1.65)
];
const coreGeometry=merge([...quillCores,...bodyCores]);
const jawHinge=new THREE.Vector3(0,.239,.170);
const jawGeometry=oval([0,.219,.276],[.098,.031,.098],[0,0,0],28,18).translate(0,-jawHinge.y,-jawHinge.z);
const innerJawGeometry=oval([0,.244,.278],[.088,.006,.084],[0,0,0],24,12).translate(0,-jawHinge.y,-jawHinge.z);
const jawCoreGeometry=luminous(oval([0,.217,.312],[.025,.007,.027],[0,0,0],12,8)
  .translate(0,-jawHinge.y,-jawHinge.z),0x9deac1,1.5);
const teethGeometry=merge([-1,1].map(side=>placed(new THREE.ConeGeometry(.010,.019,10),
  [side*.041,.251,.336],[1,1,.8],[0,0,0]))).translate(0,-jawHinge.y,-jawHinge.z);
const pawGeometry=merge([
  oval([0,.048,0],[.045,.040,.059],[0,0,0],20,12),
  oval([0,.122,-.024],[.038,.090,.044],[0,0,0],16,10),
  ...[-1,0,1].map(toe=>oval([toe*.023,.028,.043],[.014,.015,.026],[0,0,0],10,8))
]);

function glass(color,{thickness=.105,transmission=.94}={}){
  const tint=new THREE.Color(color),material=new THREE.MeshPhysicalMaterial({
    color:tint.clone().multiplyScalar(.78),emissive:tint,emissiveIntensity:.06,
    roughness:.075,metalness:0,transmission,thickness,ior:1.43,
    attenuationColor:tint,attenuationDistance:1.4,envMapIntensity:.65,
    clearcoat:.55,clearcoatRoughness:.06,specularIntensity:.65,specularColor:0xb8e8d7
  });
  // Material vocabulary follows the snakes, but emission is concentrated
  // inside the quills. No real lights, aura, particles or extra render pass.
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      vec3 hedgehogView=isOrthographic?vec3(0.0,0.0,1.0):normalize(vViewPosition);
      float hedgehogEdge=pow(1.0-abs(dot(normalize(normal),hedgehogView)),2.0);
      totalEmissiveRadiance *= .10 + hedgehogEdge * .30;
    `);
  };
  material.customProgramCacheKey=()=> 'neon-hedgehog-glass-v1';return material;
}
function mesh(parent,geometry,material,name){
  const object=new THREE.Mesh(geometry,material);object.name=name;object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
}

export function createNeonHedgehog(){
  const model=new THREE.Group();model.name='Neon glass hedgehog';
  const bodyRig=new THREE.Group();bodyRig.name='Hedgehog body rig';model.add(bodyRig);
  const emerald=glass(0x168f79),mint=glass(0x75d9b0,{thickness:.052,transmission:.90});
  emerald.name='Turquoise emerald hedgehog glass';mint.name='Light mint hedgehog glass';
  const smoke=new THREE.MeshPhysicalMaterial({color:0x081712,roughness:.12,metalness:0,
    transmission:0,ior:1.48,clearcoat:.85,clearcoatRoughness:.08,specularIntensity:.8});
  const quartz=new THREE.MeshPhysicalMaterial({color:0xc7e8d6,roughness:.13,metalness:0,
    transmission:.45,thickness:.012,ior:1.46,clearcoat:.5,envMapIntensity:.5,specularIntensity:.6});
  const dark=new THREE.MeshBasicMaterial({color:0x06130e});
  const coreMaterial=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true});
  mesh(bodyRig,coatGeometry,emerald,'Hedgehog glass haunches and swept quills');
  mesh(bodyRig,headGeometry,mint,'Hedgehog mint head muzzle and ears');
  const mouth=mesh(bodyRig,mouthGeometry,dark,'Hedgehog dark mouth cavity');
  mouth.userData.ellipsoidCenter=[...mouthCenter];mouth.userData.ellipsoidRadii=[...mouthRadii];
  mesh(bodyRig,eyeGeometry,smoke,'Hedgehog button nose and curious eyes');
  mesh(bodyRig,catchlightGeometry,quartz,'Hedgehog small catchlights');
  const addCore=(parent,geometry,name)=>{
    const core=mesh(parent,geometry,coreMaterial,name);core.castShadow=false;core.receiveShadow=false;core.userData.insetCore=true;return core;
  };
  addCore(bodyRig,coreGeometry,'Hedgehog inset luminous structures');

  const paws=[];
  for(const front of [true,false])for(const side of [-1,1]){
    const paw=new THREE.Group();paw.name=`Hedgehog ${front?'front':'rear'} ${side<0?'left':'right'} paw`;
    paw.userData.homeX=side*(front?.150:.185);paw.userData.homeZ=front?.170:-.160;
    paw.position.set(paw.userData.homeX,0,paw.userData.homeZ);model.add(paw);
    mesh(paw,pawGeometry,emerald,'Hedgehog attached paw');paws.push(paw);
  }
  const jawGroup=new THREE.Group();jawGroup.name='Hedgehog lower jaw hinge';jawGroup.position.copy(jawHinge);bodyRig.add(jawGroup);
  mesh(jawGroup,jawGeometry,mint,'Hedgehog hinged lower jaw');
  mesh(jawGroup,innerJawGeometry,dark,'Hedgehog inner lower lip');
  mesh(jawGroup,teethGeometry,quartz,'Hedgehog tiny quartz teeth');
  addCore(jawGroup,jawCoreGeometry,'Hedgehog hinged chin core');
  const jawDriver=new THREE.Object3D();
  model.userData.bodyRig=bodyRig;model.userData.paws=paws;model.userData.jaw=jawDriver;
  model.userData.applyPose=()=>{jawGroup.rotation.x=jawDriver.rotation.x*1.35;};
  model.userData.idleJaw=.010;model.userData.idleJawAmplitude=.008;
  model.userData.modelVersion='neon-hedgehog-v1';model.userData.finishVersion='turquoise-mint-inset-glass-v1';
  model.userData.quillCount=quillCount;model.userData.biteAnchor=[0,.285,.18];
  model.userData.consumptionCenterY=.27;
  return {model,material:mint,
    update(state){
      const shield=Boolean(state?.shield);
      emerald.emissiveIntensity=shield?.125:.06;mint.emissiveIntensity=shield?.125:.06;
      coreMaterial.color.setScalar(shield?1.12:1);
    },
    dispose(){for(const material of [emerald,mint,smoke,quartz,dark,coreMaterial])material.dispose();}
  };
}
