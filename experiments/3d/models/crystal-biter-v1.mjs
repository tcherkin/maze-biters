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
const body=merge([oval([0,.279,-.083],[.315,.246,.294]),
  ...[-1,1].flatMap(side=>[oval([side*.205,.058,-.185],[.065,.054,.085]),
    oval([side*.19,.052,.165],[.063,.050,.075]),
    // Short hidden ankles join the paws to the low body; no detached beads.
    oval([side*.19,.154,.128],[.052,.112,.062],[0,0,0],16,10),
    oval([side*.205,.118,-.185],[.050,.080,.060],[0,0,0],16,10)])]);
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

// Nine broad, swept-back, blunt crystal tufts. Chamfered octagonal sections
// taper into a small flat tip; varied lean avoids radial crown/mine shapes.
function tuft(){
  const points=[[-.66,-1],[.66,-1],[1,-.54],[1,.54],[.66,1],[-.66,1],[-1,.54],[-1,-.54]];
  const rings=[[0,.73,0],[.12,1,-.04],[.62,.68,-.27],[.94,.23,-.51],[1,.13,-.55]],p=[],index=[];
  for(const [y,size,z]of rings)for(const [x,d]of points)p.push(x*size,y,d*size*.72+z);
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<8;i++){
    const a=r*8+i,b=r*8+(i+1)%8,c=a+8,d=b+8;index.push(a,c,b,b,c,d);
  }
  for(let i=1;i<7;i++){index.push(0,i,i+1);index.push(32,32+i+1,32+i);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(index);
  const faceted=g.toNonIndexed();g.dispose();faceted.computeVertexNormals();return faceted;
}
const tuftSpec=[
  [0,.474,.037,.101,.193,.104,-.06],[-.017,.50,-.104,.107,.226,.103,.08],
  [.012,.435,-.235,.095,.192,.095,-.05],
  [-.172,.428,.011,.09,.162,.091,-.16],[.178,.429,-.007,.09,.171,.09,.17],
  [-.184,.393,-.16,.086,.154,.084,-.18],[.179,.410,-.168,.088,.166,.086,.16],
  [-.116,.324,-.279,.074,.128,.065,-.13],[.119,.330,-.276,.074,.138,.064,.12]
];
const shells=[],cores=[];
for(const [x,y,z,w,h,d,lean]of tuftSpec){
  shells.push(placed(tuft(),[x,y,z],[w,h,d],[0,lean,lean]));
  cores.push(placed(oval([0,.28,-.06],[.30,.27,.25]),[x,y+.011,z],[w,h,d],[0,lean,lean]));
}
const crystals=merge(shells),coreGeometry=merge(cores);
const forehead=placed(tuft(),[0,.495,.252],[.036,.073,.034],[.38,0,0]);
const satin=(color,roughness=.43)=>new THREE.MeshStandardMaterial({color,roughness,metalness:.06});
function mesh(parent,g,m,name){const o=new THREE.Mesh(g,m);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}

export function createCrystalBiter(){
  const model=new THREE.Group();model.name='Crystal Biter — compact jade explorer';
  const skin=satin(0x164e38),lime=satin(0xaacb4b),rim=satin(0x768c33);
  skin.emissive.setHex(0x103d2b);skin.emissiveIntensity=.08;
  lime.emissive.setHex(0x607724);lime.emissiveIntensity=.055;
  const glass=createSnakeFinish(0x197b4b,{role:'player'});
  glass.material.transmission=.88;glass.material.thickness=.13;glass.material.envMapIntensity=.85;
  glass.material.roughness=.10;glass.material.emissiveIntensity=.075;
  glass.coreMaterial.color.setHex(0xb4cf67).multiplyScalar(1.15);
  const dark=new THREE.MeshBasicMaterial({color:0x080d0b});
  const eye=new THREE.MeshPhysicalMaterial({color:0x060d0c,roughness:.16,clearcoat:.85,clearcoatRoughness:.08});
  const ivory=satin(0xf0e4b7,.3),highlight=new THREE.MeshBasicMaterial({color:0xf5f3cb});
  const lamp=new THREE.MeshStandardMaterial({color:0xbb9541,roughness:.19,metalness:.18,emissive:0xffc365,emissiveIntensity:.65});
  mesh(model,body,skin,'Pear body and four small paws');mesh(model,face,lime,'Uplifted lime face');
  mesh(model,cavity,dark,'Small smile cavity');mesh(model,nose,eye,'Short round nose');
  mesh(model,rimGeometry,rim,'Soft eye sockets');mesh(model,eyeGeometry,eye,'Curious dark eyes');
  mesh(model,glintGeometry,highlight,'Small eye catchlights');mesh(model,teeth,ivory,'Two little bite teeth');
  mesh(model,crystals,glass.material,'Nine swept emerald crystal tufts');
  const core=mesh(model,coreGeometry,glass.coreMaterial,'Warm green crystal roots');core.castShadow=false;
  mesh(model,forehead,lamp,'Small warm forehead crystal');
  const jawGroup=new THREE.Group();jawGroup.name='Biter front jaw hinge';jawGroup.position.copy(hinge);model.add(jawGroup);
  mesh(jawGroup,jaw,lime,'Round smile chin');mesh(jawGroup,jawInside,dark,'Inner hinged smile');
  // Keep the game's .04-.30 chomp driver and exact event timing. A wider
  // hinge response lets this small smile open clearly from the high camera.
  const jawDriver=new THREE.Object3D();
  model.userData.jaw=jawDriver;
  model.userData.applyPose=()=>{jawGroup.rotation.x=jawDriver.rotation.x*1.85;};
  model.userData.idleJaw=.012;model.userData.idleJawAmplitude=.010;
  model.userData.modelVersion='crystal-biter-v1';model.userData.finishVersion='satin-jade-emerald-v1';
  return {model,material:lime,
    update(state){
      const shield=Boolean(state?.shield);
      lime.emissiveIntensity=shield?.22:.055;skin.emissiveIntensity=shield?.18:.08;
      glass.material.emissiveIntensity=shield?.16:.075;
    },
    dispose(){for(const m of [skin,lime,rim,dark,eye,ivory,highlight,lamp])m.dispose();glass.dispose();}
  };
}
