import * as THREE from '../vendor/three.module.min.js';
import {createSnakeFinish} from '../snake-light.mjs';

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
// Its lower edge overlaps a small satin belly/hip skirt at the same contour.
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
for(const [x,y,z,w,h,d,lean]of tuftSpec){
  shells.push(placed(tuft(),[x,y,z],[w,h,d],[0,lean,lean]));
  cores.push(placed(tuft(),[x,y+.014,z],[w*.33,h*.38,d*.34],[0,lean,lean]));
}
const crystals=merge([backShell,...shells]),coreGeometry=merge(cores);
const forehead=placed(tuft(),[0,.495,.252],[.036,.073,.034],[.38,0,0]);
const satin=(color,roughness=.43)=>new THREE.MeshStandardMaterial({color,roughness,metalness:.06});
function mesh(parent,g,m,name){const o=new THREE.Mesh(g,m);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}

export function createCrystalBiter(){
  const model=new THREE.Group();model.name='Crystal Biter — compact jade explorer';
  const bodyRig=new THREE.Group();bodyRig.name='Rigid Biter body rig';model.add(bodyRig);
  const skin=satin(0x164e38),lime=satin(0x7faa44,.50),rim=satin(0x587833);
  skin.emissive.setHex(0x103d2b);skin.emissiveIntensity=.08;
  lime.emissive.setHex(0x385821);lime.emissiveIntensity=.035;lime.metalness=.02;
  const glass=createSnakeFinish(0x147c58,{role:'player'});
  glass.material.transmission=.88;glass.material.thickness=.16;glass.material.envMapIntensity=.95;
  glass.material.roughness=.07;glass.material.emissiveIntensity=.075;
  glass.coreMaterial.color.setHex(0xb4cf67).multiplyScalar(1.15);
  const dark=new THREE.MeshBasicMaterial({color:0x080d0b});
  const eye=new THREE.MeshPhysicalMaterial({color:0x060d0c,roughness:.16,clearcoat:.85,clearcoatRoughness:.08});
  const ivory=satin(0xf0e4b7,.3),highlight=new THREE.MeshBasicMaterial({color:0xf5f3cb});
  const lamp=new THREE.MeshStandardMaterial({color:0x8e8340,roughness:.23,metalness:.15,emissive:0xffc365,emissiveIntensity:.25});
  mesh(bodyRig,body,skin,'Satin belly and hips');mesh(bodyRig,face,lime,'Uplifted lime face');
  mesh(bodyRig,cavity,dark,'Small smile cavity');mesh(bodyRig,nose,eye,'Short round nose');
  mesh(bodyRig,rimGeometry,rim,'Soft eye sockets');mesh(bodyRig,eyeGeometry,eye,'Curious dark eyes');
  mesh(bodyRig,glintGeometry,highlight,'Small eye catchlights');mesh(bodyRig,teeth,ivory,'Two little bite teeth');
  mesh(bodyRig,crystals,glass.material,'Nine swept emerald crystal tufts');
  const core=mesh(bodyRig,coreGeometry,glass.coreMaterial,'Warm green crystal roots');core.castShadow=false;
  mesh(bodyRig,forehead,lamp,'Small warm forehead crystal');
  const paws=[];
  for(const front of [true,false])for(const side of [-1,1]){
    const paw=new THREE.Group();paw.name=(front?'Front ':'Rear ')+(side<0?'left':'right')+' paw';
    paw.userData.homeX=side*(front?.19:.205);paw.userData.homeZ=front?.165:-.185;
    paw.position.set(paw.userData.homeX,0,paw.userData.homeZ);model.add(paw);
    mesh(paw,front?frontPaw:rearPaw,skin,'Attached small foot and ankle');paws.push(paw);
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
  model.userData.modelVersion='crystal-biter-v2';model.userData.finishVersion='faceted-emerald-back-v2';
  return {model,material:lime,
    update(state){
      const shield=Boolean(state?.shield);
      lime.emissiveIntensity=shield?.19:.035;skin.emissiveIntensity=shield?.18:.08;
      glass.material.emissiveIntensity=shield?.16:.075;
    },
    dispose(){for(const m of [skin,lime,rim,dark,eye,ivory,highlight,lamp])m.dispose();glass.dispose();}
  };
}
