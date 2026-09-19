import * as THREE from '../vendor/three.module.min.js';

// Authored, shared native geometry. +Z is the same forward direction and the
// existing bite anchor (0,.285,.18) stays inside the articulated mouth.
function placed(g,p=[0,0,0],s=[1,1,1],rotation=[0,0,0]){
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...s)));
  return g;
}
const oval=(p,s,rotation=[0,0,0],segments=32,rings=20)=>placed(new THREE.SphereGeometry(1,segments,rings),p,s,rotation);
function merge(parts){
  const positions=[],normals=[];
  for(const part of parts){
    const g=part.index?part.toNonIndexed():part;
    positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);
    if(g!==part)g.dispose();part.dispose();
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.computeBoundingSphere();return g;
}
function surface(rows,columns,point){
  const p=[],indices=[];
  for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++)p.push(...point(r/rows,c/columns));
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
    const a=r*(columns+1)+c,b=a+1,d=a+columns+1;indices.push(a,d,b,b,d,d+1);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
// The back shell replaces the upper skin, rather than adding another dome.
// Its lower edge overlaps the belly/hip skirt at the same contour.
const body=surface(18,48,(v,u)=>{
  const theta=2.03+v*(Math.PI-2.03),phi=(u-.5)*2*Math.PI;
  return [.315*Math.sin(theta)*Math.sin(phi),.279+.246*Math.cos(theta),-.083+.294*Math.sin(theta)*Math.cos(phi)];
});
const backShell=surface(18,48,(v,u)=>{
  const phi=(u-.5)*2*Math.PI,limit=THREE.MathUtils.lerp(.91,2.09,THREE.MathUtils.smoothstep(Math.abs(phi),.55,1.7));
  const theta=v*limit;
  return [.319*Math.sin(theta)*Math.sin(phi),.279+.249*Math.cos(theta),-.083+.298*Math.sin(theta)*Math.cos(phi)];
});
const frontPaw=merge([oval([0,.052,0],[.063,.050,.075]),oval([0,.154,-.037],[.052,.112,.062],[0,0,0],16,10)]);
const rearPaw=merge([oval([0,.058,0],[.065,.054,.085]),oval([0,.118,0],[.050,.080,.060],[0,0,0],16,10)]);
const face=surface(24,72,(v,u)=>{
  const phi=(u-.5)*2*Math.PI,angle=Math.abs(phi),rear=THREE.MathUtils.smoothstep(angle,.94,1.9);
  const theta=v*THREE.MathUtils.lerp(1.79,Math.PI,rear),ring=Math.sin(theta);
  return [Math.sin(phi)*.273*ring,.367+.184*Math.cos(theta),.15+Math.cos(phi)*.228*ring];
});
const cavity=oval([0,.268,.202],[.213,.098,.177]);
const hinge=new THREE.Vector3(0,.29,.055);
const jaw=merge([
  surface(14,48,(v,u)=>{
    const a=(u-.5)*3.8,curve=v*Math.PI/2;
    return [Math.sin(a)*.217*Math.cos(curve),.309-.096*Math.sin(curve),.115+Math.cos(a)*.263*Math.cos(curve)];
  }),
  surface(4,48,(v,u)=>{
    v=1-v;
    const a=(u-.5)*3.8,shrink=1-v*.18;
    return [Math.sin(a)*.217*shrink,.309+.007*Math.sin(v*Math.PI),.115+Math.cos(a)*.263*shrink];
  })
]).translate(-hinge.x,-hinge.y,-hinge.z);
const jawInside=oval([0,.306,.211],[.192,.014,.145]).translate(0,-hinge.y,-hinge.z);
const nose=oval([0,.371,.370],[.042,.027,.026]);
const eyes=[],rims=[],glints=[];
for(const side of [-1,1]){
  const p=[side*.153,.435,.300],rotation=[-.48,side*.38,side*-.08];
  rims.push(oval(p,[.081,.085,.036],rotation));
  eyes.push(oval([p[0],p[1]+.003,p[2]+.011],[.065,.072,.037],rotation));
  glints.push(oval([p[0]-.017,p[1]+.029,p[2]+.038],[.013,.016,.009]));
}
const eyeGeometry=merge(eyes),rimGeometry=merge(rims),glintGeometry=merge(glints);
const teeth=merge([-1,1].map(side=>placed(new THREE.ConeGeometry(.019,.045,12),
  [side*.095,.306,.347],[1,1,.85],[Math.PI,0,0])));

// Solid short prisms: a long flat shoulder, soft bevel bands, broad blunt
// terminal facet and a small backward lean. No curved leaf-like taper.
function tuft(){
  const points=[[-.66,-1],[.66,-1],[1,-.54],[1,.54],[.66,1],[-.66,1],[-1,.54],[-1,-.54]];
  const rings=[[0,.85,0],[.09,1,-.015],[.72,.96,-.12],[.93,.66,-.18],[1,.50,-.19]],p=[],index=[];
  for(const [y,size,z]of rings)for(const [x,d]of points)p.push(x*size,y,d*size*.72+z);
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<8;i++){
    const a=r*8+i,b=r*8+(i+1)%8,c=a+8,d=b+8;index.push(a,c,b,b,c,d);
  }
  for(let i=1;i<7;i++){index.push(0,i,i+1);index.push(32,32+i+1,32+i);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(index);
  const faceted=g.toNonIndexed();g.dispose();faceted.computeVertexNormals();return faceted;
}
const tuftSpec=[
  [0,.472,.027,.104,.180,.112,-.04],[-.017,.493,-.104,.109,.212,.114,.07],
  [.012,.426,-.226,.102,.176,.105,-.05],
  [-.167,.425,.005,.097,.155,.097,-.12],[.174,.425,-.013,.097,.165,.096,.13],
  [-.177,.385,-.158,.094,.150,.091,-.13],[.173,.395,-.162,.096,.159,.091,.12],
  [-.11,.327,-.272,.080,.124,.072,-.10],[.115,.332,-.270,.080,.13,.073,.10]
];
const shells=[],cores=[];
// Each inset center clears both its prism wall and the intersecting back
// shell. Lower rear roots live below the shell; upper roots live above it.
const rootLevels=[.725,.70,.725,.725,.70,.275,.25,.40,.375];
for(const [index,[x,y,z,w,h,d,lean]]of tuftSpec.entries()){
  shells.push(placed(tuft(),[x,y,z],[w,h,d],[0,lean,lean]));
  const t=rootLevels[index],center=new THREE.Vector3(0,t*h,-.19*t*d)
    .applyEuler(new THREE.Euler(0,lean,lean)).add(new THREE.Vector3(x,y,z));
  cores.push(oval(center.toArray(),[w*.18,h*.16,d*.18],[0,lean,lean],12,8));
}
const crystals=merge([backShell,...shells]);
// Separated inset structures leave actual dark gaps through the shell. A
// handful of low-poly lozenges replaces v3's almost body-sized solid fill;
// the nine prism roots remain one shared draw with those small body ribs.
const bodyCores=[
  oval([0,.295,-.229],[.029,.108,.033],[0,0,0],12,8),
  ...[-1,1].map(side=>oval([side*.105,.275,-.205],[.025,.065,.030],[0,side*.15,side*.44],12,8))
];
function luminousGeometry(parts,color,gain){
  let start=0;
  const insetParts=parts.map(part=>{
    part.computeBoundingBox();const center=part.boundingBox.getCenter(new THREE.Vector3()).toArray();
    const count=part.index?.count??part.attributes.position.count,range={start,count,center};start+=count;return range;
  });
  const geometry=merge(parts),colors=new Float32Array(geometry.attributes.position.count*3);
  const tint=new THREE.Color(color).multiplyScalar(gain),normals=geometry.attributes.normal;
  for(let i=0;i<geometry.attributes.position.count;i++){
    const density=.72+.28*THREE.MathUtils.clamp(.5+normals.getY(i)*.35-normals.getZ(i)*.25,0,1);
    colors[i*3]=tint.r*density;colors[i*3+1]=tint.g*density;colors[i*3+2]=tint.b*density;
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.userData.insetParts=insetParts;return geometry;
}
const coreGeometry=luminousGeometry([...bodyCores,...cores],0x39dc8a,2.8);
// Centered between, behind and above the eye sockets, clear of the mouth.
// Its small footprint reads as a warm jewel suspended inside the forehead.
const faceCoreGeometry=luminousGeometry([
  oval([0,.445,.275],[.038,.030,.020],[.12,0,0],12,8)
],0xb7df7d,2.0);
const forehead=placed(tuft(),[0,.495,.252],[.036,.073,.034],[.38,0,0]);
function coloredGlass(color,{transmission=.91,thickness=.12}={}){
  const tint=new THREE.Color(color),material=new THREE.MeshPhysicalMaterial({
    color:tint.clone().multiplyScalar(.84),emissive:tint,emissiveIntensity:.055,
    attenuationColor:tint,attenuationDistance:1.4,transmission,thickness,ior:1.43,
    roughness:.07,metalness:0,envMapIntensity:.72,clearcoat:.55,clearcoatRoughness:.055,
    specularIntensity:.72,specularColor:0xbcebd4
  });
  // Quiet shell emission preserves the optical edge without drawing a halo.
  // This is local to the Biter; the shared snake shader remains untouched.
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      vec3 emeraldView=isOrthographic?vec3(0.0,0.0,1.0):normalize(vViewPosition);
      float emeraldEdge=pow(1.0-abs(dot(normalize(normal),emeraldView)),2.0);
      totalEmissiveRadiance *= .12 + emeraldEdge * .35;
    `);
  };
  material.customProgramCacheKey=()=> 'crystal-biter-colored-glass-v4';return material;
}
function mesh(parent,g,m,name){const o=new THREE.Mesh(g,m);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}

export function createCrystalBiter(){
  const model=new THREE.Group();model.name='Crystal Biter — compact glass explorer';
  const bodyRig=new THREE.Group();bodyRig.name='Rigid Biter body rig';model.add(bodyRig);
  // Two large transmitting materials serve all the colored outer surfaces.
  const emerald=coloredGlass(0x249a66),lime=coloredGlass(0xa5d67b,{transmission:.88,thickness:.075});
  emerald.name='Emerald Biter glass';lime.name='Peridot Biter glass';
  lime.specularColor.setHex(0xd9e6a9);
  const coreMaterial=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true});
  coreMaterial.name='Inset Biter luminous structures';
  const dark=new THREE.MeshBasicMaterial({color:0x080d0b});
  // Almost opaque smoked glass keeps pupils/nose readable without holes.
  const eye=new THREE.MeshPhysicalMaterial({color:0x091710,roughness:.12,ior:1.48,
    transmission:0,metalness:0,clearcoat:.85,clearcoatRoughness:.08,specularIntensity:.8});
  eye.name='Smoked glass eyes and nose';
  const ivory=new THREE.MeshPhysicalMaterial({color:0xd6e1b8,roughness:.12,metalness:0,
    transmission:.52,thickness:.015,ior:1.46,clearcoat:.6,clearcoatRoughness:.06,
    attenuationColor:0xe4eaca,attenuationDistance:.5,envMapIntensity:.65,specularIntensity:.7});
  ivory.name='Light quartz teeth and catchlights';
  // Keep established mesh names for diagnostics; only their finish changes.
  mesh(bodyRig,body,emerald,'Satin belly and hips');mesh(bodyRig,face,lime,'Uplifted lime face');
  mesh(bodyRig,cavity,dark,'Small smile cavity');mesh(bodyRig,nose,eye,'Short round nose');
  mesh(bodyRig,rimGeometry,lime,'Soft eye sockets');mesh(bodyRig,eyeGeometry,eye,'Curious dark eyes');
  mesh(bodyRig,glintGeometry,ivory,'Small eye catchlights');mesh(bodyRig,teeth,ivory,'Two little bite teeth');
  mesh(bodyRig,crystals,emerald,'Nine swept emerald crystal tufts');
  for(const [geometry,name]of [[coreGeometry,'Warm green crystal roots'],[faceCoreGeometry,'Inset peridot forehead core']]){
    const core=mesh(bodyRig,geometry,coreMaterial,name);core.castShadow=false;core.receiveShadow=false;core.userData.insetCore=true;
  }
  mesh(bodyRig,forehead,lime,'Small warm forehead crystal');
  const paws=[];
  for(const front of [true,false])for(const side of [-1,1]){
    const paw=new THREE.Group();paw.name=(front?'Front ':'Rear ')+(side<0?'left':'right')+' paw';
    paw.userData.homeX=side*(front?.19:.205);paw.userData.homeZ=front?.165:-.185;
    paw.position.set(paw.userData.homeX,0,paw.userData.homeZ);model.add(paw);
    mesh(paw,front?frontPaw:rearPaw,emerald,'Attached small foot and ankle');paws.push(paw);
  }
  model.userData.bodyRig=bodyRig;model.userData.paws=paws;
  const jawGroup=new THREE.Group();jawGroup.name='Biter front jaw hinge';jawGroup.position.copy(hinge);bodyRig.add(jawGroup);
  mesh(jawGroup,jaw,lime,'Round smile chin');mesh(jawGroup,jawInside,dark,'Inner hinged smile');
  // Keep the game's .04-.30 chomp driver and exact event timing. A wider
  // hinge response lets this small smile open clearly from the high camera.
  const jawDriver=new THREE.Object3D();
  model.userData.jaw=jawDriver;
  model.userData.applyPose=()=>{jawGroup.rotation.x=jawDriver.rotation.x*1.85;};
  model.userData.idleJaw=.012;model.userData.idleJawAmplitude=.010;
  model.userData.modelVersion='crystal-biter-v4';model.userData.finishVersion='inset-colored-glass-v4';
  return {model,material:lime,
    update(state){
      const shield=Boolean(state?.shield);
      lime.emissiveIntensity=shield?.12:.055;emerald.emissiveIntensity=shield?.12:.055;
      coreMaterial.color.setScalar(shield?1.14:1);
    },
    dispose(){for(const m of [emerald,lime,coreMaterial,dark,eye,ivory])m.dispose();}
  };
}
