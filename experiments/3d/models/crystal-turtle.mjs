import * as THREE from '../vendor/three.module.min.js';

// Native player space, +Z forward. All authored geometry is shared; every
// actor owns its materials, articulated jaw and four permanent paw groups.
function placed(geometry,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){
  geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale)));
  return geometry;
}
const oval=(position,scale,rotation=[0,0,0],segments=24,rings=16)=>
  placed(new THREE.SphereGeometry(1,segments,rings),position,scale,rotation);
function merge(parts){
  const positions=[],normals=[],colors=[],colored=parts.some(part=>part.attributes.color);
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
function colorVolume(geometry,center,radii,edgeColor,centerColor,gain){
  const colors=new Float32Array(geometry.attributes.position.count*3),positions=geometry.attributes.position;
  const edge=new THREE.Color(edgeColor).multiplyScalar(.20),bright=new THREE.Color(centerColor).multiplyScalar(gain),color=new THREE.Color();
  for(let i=0;i<positions.count;i++){
    const x=(positions.getX(i)-center[0])/radii[0],z=(positions.getZ(i)-center[2])/radii[2];
    const radial=Math.min(1,Math.hypot(x,z));
    const upper=THREE.MathUtils.smoothstep((positions.getY(i)-center[1])/radii[1],-.2,.85);
    const depth=Math.pow(1-radial,.70)*(.10+.90*upper);
    color.copy(edge).lerp(bright,depth);
    colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;
}

// One continuous low dome, not separately mounted stones. Seven broad scute
// regions are sculpted into the same surface through very shallow depressions.
// The quiet outer band has no emissive seam or contrasting grid material.
const scuteCenters=[[0,-.49],[0,0],[0,.48],[-.53,-.29],[-.53,.30],[.53,-.29],[.53,.30]];
function shellProfile(x,z,r){
  let first=Infinity,second=Infinity;
  for(const [cx,cz]of scuteCenters){
    // Tangent planes make broad, gently flattened scute faces. Taking their
    // lower envelope keeps adjoining regions continuous instead of stacking
    // individual caps on the dome; a little dome curvature softens each face.
    const root=Math.sqrt(1-cx*cx-cz*cz);
    const plane=.196*root-.196*(cx*(x-cx)+cz*(z-cz))/root;
    if(plane<first){second=first;first=plane;}else if(plane<second)second=plane;
  }
  const band=THREE.MathUtils.smoothstep(r,.80,.91);
  const curve=.196*Math.sqrt(Math.max(0,1-r*r));
  const face=THREE.MathUtils.lerp(curve,first,.72*(1-band));
  const groove=Math.exp(-(((second-first)/.0065)**2))*(1-band);
  const rim=Math.exp(-(((r-.845)/.019)**2));
  return {height:.164+face-groove*.014-rim*.005,groove:Math.max(groove,rim*.22)};
}
const dome=surface(36,72,(v,u)=>{
  const r=Math.sin(v*Math.PI/2),angle=(u-.5)*Math.PI*2,x=Math.sin(angle)*r,z=Math.cos(angle)*r;
  return [x*.290,shellProfile(x,z,r).height,-.085+z*.277];
});
// A restrained absorption tint follows only the carved depressions. It adds
// no separate seam mesh or emission and leaves every broad glass face clear.
const domeColors=new Float32Array(dome.attributes.position.count*3);
for(let i=0;i<dome.attributes.position.count;i++){
  const x=dome.attributes.position.getX(i)/.290,z=(dome.attributes.position.getZ(i)+.085)/.277;
  const {groove}=shellProfile(x,z,Math.min(1,Math.hypot(x,z)));
  domeColors[i*3]=1-groove*.55;domeColors[i*3+1]=1-groove*.40;domeColors[i*3+2]=1-groove*.48;
}
dome.setAttribute('color',new THREE.BufferAttribute(domeColors,3));
const rim=surface(5,72,(v,u)=>{
  const a=(u-.5)*Math.PI*2,r=1-.026*Math.sin(v*Math.PI/2);
  return [.290*Math.sin(a)*r,.164-v*.024,-.085+.277*Math.cos(a)*r];
});
const plastron=oval([0,.137,-.083],[.269,.060,.255],[0,0,0],32,16);
const tail=oval([0,.125,-.379],[.024,.025,.051],[.08,0,0],16,10);
const shellGeometry=merge([dome,rim,plastron,tail]);

// A large, rounded animal head projects beyond the shell on a short neck.
// Its lower front is open so the shallow curved mouth can actually articulate.
const head=surface(20,44,(v,u)=>{
  const phi=(u-.5)*Math.PI*2,rear=THREE.MathUtils.smoothstep(Math.abs(phi),.87,1.9);
  const theta=v*THREE.MathUtils.lerp(1.80,Math.PI,rear);
  return [.152*Math.sin(theta)*Math.sin(phi),.290+.120*Math.cos(theta),.205+.133*Math.sin(theta)*Math.cos(phi)];
});
const muzzle=surface(14,32,(v,u)=>{
  const angle=(u-.5)*3.78,width=THREE.MathUtils.lerp(.128,.090,v),height=THREE.MathUtils.lerp(.072,.048,v);
  return [Math.sin(angle)*width,.276-v*.004+Math.cos(angle)*height,.236+v*.126];
});
const neck=oval([0,.246,.112],[.082,.070,.113],[0,0,0],24,16);
const eyeRims=[],eyes=[],catchlights=[];
for(const side of [-1,1]){
  const rotation=[-.33,side*.43,side*-.07];
  eyeRims.push(oval([side*.101,.339,.286],[.052,.059,.030],rotation,20,14));
  eyes.push(oval([side*.103,.341,.297],[.043,.051,.032],rotation,24,16));
  eyes.push(oval([side*.032,.289,.362],[.006,.004,.004],[0,0,0],10,8));
  catchlights.push(oval([side*.103-.010,.363,.323],[.0075,.010,.0055],[0,0,0],12,8));
  catchlights.push(oval([side*.103+.008,.347,.328],[.0035,.0045,.0028],[0,0,0],8,6));
}
const headGeometry=merge([head,muzzle,neck,...eyeRims]);
const eyeGeometry=merge(eyes),catchlightGeometry=merge(catchlights);
const mouthCenter=[0,.259,.292],mouthRadii=[.124,.027,.085];
const mouthGeometry=oval(mouthCenter,mouthRadii,[0,0,0],28,16);
const jawHinge=new THREE.Vector3(0,.269,.189);
const jawGeometry=oval([0,.238,.283],[.119,.033,.094],[0,0,0],28,18).translate(0,-jawHinge.y,-jawHinge.z);
const jawInsideGeometry=oval([0,.264,.285],[.109,.005,.083],[0,0,0],24,12).translate(0,-jawHinge.y,-jawHinge.z);

// A single broad connected inner volume leaves a real gap under the dome.
// Its turquoise center fades continuously into dark emerald edges and lower
// surfaces; there are no separate glowing capsules, dots or scute lights.
const innerCenter=[0,.204,-.081],innerRadii=[.229,.109,.218];
const shellCoreGeometry=colorVolume(oval(innerCenter,innerRadii,[0,0,0],36,24),innerCenter,innerRadii,0x084436,0x5adbcb,1.65);
const headCoreCenter=[0,.343,.213],headCoreRadii=[.060,.027,.047];
const headCoreGeometry=colorVolume(oval(headCoreCenter,headCoreRadii,[0,0,0],20,14),headCoreCenter,headCoreRadii,0x297f61,0xa8eccc,1.25);
const pawGeometry=merge([
  oval([0,.049,.008],[.051,.036,.071],[0,0,0],20,14),
  oval([0,.111,-.011],[.044,.073,.049],[0,0,0],16,12)
]);
const pawCoreGeometry=merge([
  colorVolume(oval([0,.050,.010],[.032,.017,.047],[0,0,0],14,10),[0,.050,.010],[.032,.017,.047],0x1b644e,0x73dcb4,.85),
  colorVolume(oval([0,.106,-.010],[.023,.041,.027],[0,0,0],12,10),[0,.106,-.010],[.023,.041,.027],0x1b644e,0x73dcb4,.65)
]);

function glass(color,{transmission=.93,thickness=.105,roughness=.085}={}){
  const tint=new THREE.Color(color),material=new THREE.MeshPhysicalMaterial({
    color:tint.clone().multiplyScalar(.84),emissive:tint,emissiveIntensity:.065,
    attenuationColor:tint,attenuationDistance:1.5,ior:1.43,transmission,thickness,
    roughness,metalness:0,clearcoat:.5,clearcoatRoughness:.065,
    envMapIntensity:.58,specularIntensity:.64,specularColor:0xc2ecdc
  });
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      vec3 turtleView=isOrthographic?vec3(0.0,0.0,1.0):normalize(vViewPosition);
      float turtleEdge=pow(1.0-abs(dot(normalize(normal),turtleView)),2.0);
      totalEmissiveRadiance *= .14 + turtleEdge * .26;
    `);
  };
  material.customProgramCacheKey=()=> 'crystal-turtle-sculpted-glass-v1';return material;
}
function mesh(parent,geometry,material,name){
  const object=new THREE.Mesh(geometry,material);object.name=name;object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
}

export function createCrystalTurtle(){
  const model=new THREE.Group();model.name='Crystal turtle';
  const bodyRig=new THREE.Group();bodyRig.name='Turtle body rig';model.add(bodyRig);
  const headRig=new THREE.Group();headRig.name='Turtle head rig';bodyRig.add(headRig);
  const emerald=glass(0x189773),mint=glass(0x87dec0,{transmission:.89,thickness:.050,roughness:.10});
  emerald.name='Deep emerald turtle carapace';mint.name='Light mint turtle face and paws';
  emerald.vertexColors=true;
  const eyes=new THREE.MeshPhysicalMaterial({color:0x071b13,roughness:.12,metalness:0,
    transmission:0,ior:1.48,clearcoat:.80,clearcoatRoughness:.08,specularIntensity:.75});
  const quartz=new THREE.MeshPhysicalMaterial({color:0xd3ebde,roughness:.14,metalness:0,
    transmission:.40,thickness:.010,ior:1.46,clearcoat:.45,envMapIntensity:.5,specularIntensity:.6});
  const dark=new THREE.MeshBasicMaterial({color:0x06160f});
  const coreMaterial=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true});
  const core=(parent,geometry,name)=>{
    const object=mesh(parent,geometry,coreMaterial,name);object.castShadow=false;object.receiveShadow=false;object.userData.insetCore=true;return object;
  };
  mesh(bodyRig,shellGeometry,emerald,'Turtle sculpted glass carapace');
  core(bodyRig,shellCoreGeometry,'Turtle connected emerald inner volume');
  mesh(headRig,headGeometry,mint,'Turtle mint head and short neck');
  mesh(headRig,eyeGeometry,eyes,'Turtle gentle glass eyes and nostrils');
  mesh(headRig,catchlightGeometry,quartz,'Turtle small catchlights');
  const mouth=mesh(headRig,mouthGeometry,dark,'Turtle dark smiling mouth');
  mouth.userData.ellipsoidCenter=[...mouthCenter];mouth.userData.ellipsoidRadii=[...mouthRadii];
  core(headRig,headCoreGeometry,'Turtle soft mint head depth');
  const jawGroup=new THREE.Group();jawGroup.name='Turtle lower jaw hinge';jawGroup.position.copy(jawHinge);headRig.add(jawGroup);
  mesh(jawGroup,jawGeometry,mint,'Turtle delicate hinged jaw');
  mesh(jawGroup,jawInsideGeometry,dark,'Turtle inner lower lip');
  const paws=[];
  for(const front of [true,false])for(const side of [-1,1]){
    const paw=new THREE.Group();paw.name=`Turtle ${front?'front':'rear'} ${side<0?'left':'right'} paw`;
    paw.userData.homeX=side*(front?.208:.245);paw.userData.homeZ=front?.179:-.156;
    paw.position.set(paw.userData.homeX,0,paw.userData.homeZ);model.add(paw);
    mesh(paw,pawGeometry,mint,'Turtle attached glass paw');core(paw,pawCoreGeometry,'Turtle inset paw depth');paws.push(paw);
  }
  const jawDriver=new THREE.Object3D();
  model.userData.bodyRig=bodyRig;model.userData.headRig=headRig;model.userData.paws=paws;model.userData.jaw=jawDriver;
  model.userData.applyPose=()=>{jawGroup.rotation.x=jawDriver.rotation.x*1.15;};
  model.userData.idleJaw=.010;model.userData.idleJawAmplitude=.005;
  model.userData.biteAnchor=[0,.263,.332];
  model.userData.getBiteAnchor=out=>{
    out.set(0,.263,.332);headRig.localToWorld(out);return model.worldToLocal(out);
  };
  model.userData.modelVersion='crystal-turtle-v1';model.userData.finishVersion='sculpted-emerald-mint-glass-v1';
  model.userData.consumptionCenterY=.225;model.userData.scuteCount=scuteCenters.length;
  return {model,material:mint,
    update(state){
      const shield=Boolean(state?.shield);
      emerald.emissiveIntensity=shield?.13:.065;mint.emissiveIntensity=shield?.13:.065;
      coreMaterial.color.setScalar(shield?1.12:1);
    },
    dispose(){for(const material of [emerald,mint,eyes,quartz,dark,coreMaterial])material.dispose();}
  };
}
