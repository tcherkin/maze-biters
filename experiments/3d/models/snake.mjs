import * as THREE from '../vendor/three.module.min.js';

// Explicit beveled planes match the concept's block armor and broad reptile
// skull. Geometry stays shared through bites, splits and tail-to-head changes.
// Native forms face +Z and remain inside a .414-radius route-sample disk.
function facetedLoft(profiles,{bevel=.035,crown=0}={}){
  const positions=[],indices=[],sides=crown?9:8;
  for(const [z,w,cy,h] of profiles){
    const b=Math.min(bevel,w*.40,h*.48);
    const upper=crown?[[w,h-b],[w-b,h],[0,h+crown],[-w+b,h]]:[[w,h-b],[w-b,h],[-w+b,h]];
    for(const [x,y] of [...upper,[-w,h-b],[-w,-h+b],[-w+b,-h],[w-b,-h],[w,-h+b]])positions.push(x,cy+y,z);
  }
  for(let ring=0;ring<profiles.length-1;ring++)for(let side=0;side<sides;side++){
    const a=ring*sides+side,b=ring*sides+(side+1)%sides,c=a+sides,d=b+sides;
    indices.push(a,b,c,b,d,c);
  }
  for(const [ring,flip] of [[0,true],[profiles.length-1,false]]){
    const center=positions.length/3,p=profiles[ring];positions.push(0,p[2],p[0]);
    for(let side=0;side<sides;side++){
      const a=ring*sides+side,b=ring*sides+(side+1)%sides;
      indices.push(center,flip?b:a,flip?a:b);
    }
  }
  const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));indexed.setIndex(indices);
  const geometry=indexed.toNonIndexed();indexed.dispose();
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

// Broad planar faces, four chamfered corners and chamfered end shoulders.
// A slightly narrower waist than the skull makes each new head readable.
export const snakeSegmentGeometry=facetedLoft([
  [-.370,.180,0,.150],[-.350,.210,0,.176],[-.320,.225,0,.185],
  [.320,.225,0,.185],[.350,.210,0,.176],[.370,.180,0,.150],
],{bevel:.044});

function scaleSeams(){
  const positions=[],indices=[];
  // Inset chevrons sit on the flat dorsal plate, without raised fins or studs.
  for(const base of [-.182,.157]){
    const start=positions.length/3,steps=16;
    for(let i=0;i<=steps;i++){
      const x=-.164+.328*i/steps,z=base+.047*(1-Math.abs(x)/.164);
      positions.push(x,.187,z-.004,x,.187,z+.004);
    }
    for(let i=0;i<steps;i++){
      const a=start+i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export const snakeSegmentAccentGeometry=scaleSeams();

// A long faceted taper ends in a tiny flat bevel, not a needle. The broad +Z
// shoulder joins the same continuous inner spine as the armored segments.
export const snakeTailGeometry=facetedLoft([
  [-.340,.009,-.049,.011],[-.272,.031,-.035,.036],[-.096,.091,-.013,.080],
  [.105,.155,0,.130],[.284,.186,0,.153],[.340,.150,0,.123],
],{bevel:.029});

// The long muzzle drops from an elevated orbital ridge into a narrow chamfered
// nose. Its two dorsal planes give the center bridge actual sculpted relief.
const skullGeometry=facetedLoft([
  [-.312,.110,.408,.103],[-.258,.190,.430,.142],[-.127,.250,.433,.155],
  [.008,.247,.427,.131],[.120,.225,.401,.088],[.270,.186,.385,.064],
  [.358,.155,.378,.049],[.385,.133,.374,.039],[.393,.104,.373,.027],
],{bevel:.030,crown:.016});

const jawGeometry=facetedLoft([
  [-.253,.092,.166,.047],[-.169,.186,.149,.052],[-.021,.218,.139,.049],
  [.170,.207,.136,.043],[.308,.166,.143,.034],[.375,.126,.155,.024],
  [.387,.103,.159,.016],
],{bevel:.020});
// Jaw's short hinge lever stays above the floor even at .30 radians.
const hinge=new THREE.Vector3(0,.194,-.022);
// A modest uplift makes room for opening at the end of a low long muzzle.
const jawUplift=.028;
jawGeometry.translate(0,jawUplift-hinge.y,-hinge.z);

const cavityGeometry=facetedLoft([
  [-.206,.090,.283,.103],[-.104,.199,.276,.094],[.112,.186,.268,.087],
  [.247,.155,.262,.080],[.348,.114,.263,.069],
],{bevel:.012});
const tongueGeometry=facetedLoft([
  [-.07,.035,.209,.007],[.10,.057,.213,.009],[.294,.037,.221,.005],
],{bevel:.007});
tongueGeometry.translate(0,jawUplift-hinge.y,-hinge.z);
const lowerMouthGeometry=facetedLoft([
  [-.200,.080,.185,.012],[-.120,.160,.177,.014],[.120,.181,.179,.010],
  [.290,.145,.184,.010],[.360,.090,.194,.006],
],{bevel:.006});
lowerMouthGeometry.translate(0,jawUplift-hinge.y,-hinge.z);

// Broad cranial folds sweep from the eye plane into the back of the skull.
// Their low triangular crests are part of the armored skull silhouette, with
// a buried root and a chamfered backward tip, rather than upright appendages.
// Both sides share one mesh and the same finish as the surrounding forehead.
function cranialFolds(){
  const positions=[];
  const outline=[
    [.102,.557,-.184],[.223,.609,-.338],[.246,.603,-.317],
    [.264,.586,-.083],[.216,.544,.106],[.125,.536,.119],
  ];
  const center=new THREE.Vector3(.190,.611,-.094);
  const add=(a,b,c,outward)=>{
    const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));
    const points=normal.dot(outward)<0?[a,c,b]:[a,b,c];
    for(const p of points)positions.push(p.x,p.y,p.z);
  };
  for(const side of [-1,1]){
    const mirror=p=>new THREE.Vector3(side*p.x,p.y,p.z);
    const outer=outline.map(p=>new THREE.Vector3(...p));
    const top=outer.map(p=>new THREE.Vector3(p.x+(center.x-p.x)*.085,p.y,p.z+(center.z-p.z)*.085));
    const lower=outer.map(p=>new THREE.Vector3(p.x,p.y-.075,p.z));
    const root=new THREE.Vector3(center.x,.510,center.z);
    for(let i=0;i<outer.length;i++){
      const next=(i+1)%outer.length;
      const a=mirror(top[i]),b=mirror(top[next]),c=mirror(lower[i]),d=mirror(lower[next]);
      add(mirror(center),a,b,new THREE.Vector3(0,1,0));
      add(mirror(root),d,c,new THREE.Vector3(0,-1,0));
      const outward=new THREE.Vector3((outer[i].x+outer[next].x)/2-center.x,0,(outer[i].z+outer[next].z)/2-center.z);outward.x*=side;
      add(a,c,b,outward);add(b,c,d,outward);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
const cranialFoldGeometry=cranialFolds();
const eyeGeometry=new THREE.SphereGeometry(1,24,16);
const fangProfile=[[0,-.125],[.007,-.119],[.018,-.074],[.030,-.020],[.029,0],[.019,.008],[0,.011]].map(([x,y])=>new THREE.Vector2(x,y));
const fangGeometry=new THREE.LatheGeometry(fangProfile,12);

const eyeMaterial=new THREE.MeshPhysicalMaterial({color:0x050a10,roughness:.15,metalness:.02,clearcoat:1,clearcoatRoughness:.06});
const mouthMaterial=new THREE.MeshBasicMaterial({color:0x030105,toneMapped:false});
const tongueMaterial=new THREE.MeshStandardMaterial({color:0x310f22,roughness:.72});
const toothMaterial=new THREE.MeshStandardMaterial({color:0xffefd4,roughness:.28});
const glintMaterial=new THREE.MeshBasicMaterial({color:0xe7f8ff});

function mesh(parent,geometry,material,position,scale,name){
  const result=new THREE.Mesh(geometry,material);if(position)result.position.set(...position);if(scale)result.scale.set(...scale);
  if(name)result.name=name;result.castShadow=true;result.receiveShadow=true;parent.add(result);return result;
}

export function createSnakeHead(material){
  const head=new THREE.Group();head.name='Concept faceted reptile head';
  mesh(head,skullGeometry,material,null,null,'Broad wedge skull');
  mesh(head,cranialFoldGeometry,material,null,null,'Swept triangular cranial folds');
  const cavity=mesh(head,cavityGeometry,mouthMaterial,null,null,'Open dark mouth');
  const jaw=new THREE.Group();jaw.name='Hinged lower jaw';jaw.position.copy(hinge);head.add(jaw);
  mesh(jaw,jawGeometry,material,null,null,'Angular lower jaw');
  mesh(jaw,lowerMouthGeometry,mouthMaterial,null,null,'Dark lower mouth lining');
  mesh(jaw,tongueGeometry,tongueMaterial,null,null,'Inner tongue');
  head.userData.jaw=jaw;head.userData.cavity=cavity;head.userData.fangs=[];
  head.userData.modelVersion='concept-snake-v5';
  for(const side of [-1,1]){
    // Eyes are embedded in the sloping upper-side planes. They have no white
    // eyeball, separate cheek mound, stalk or projecting spherical socket.
    const eye=mesh(head,eyeGeometry,eyeMaterial,[side*.205,.504,.100],[.047,.031,.043],'Inset glossy eye');
    eye.rotation.z=-side*.38;
    mesh(head,eyeGeometry,glintMaterial,[side*.200,.528,.118],[.009,.004,.009],'Small eye catchlight');
    const nostril=mesh(head,eyeGeometry,eyeMaterial,[side*.100,.444,.283],[.022,.007,.012],'Recessed nostril');
    nostril.rotation.x=-.09;
    const fang=mesh(head,fangGeometry,toothMaterial,[side*.136,.340,.309],null,'Prominent ivory fang');
    fang.rotation.x=-.10;
    head.userData.fangs.push({mesh:fang,openAngle:-.10});
    // A little rear gum tooth helps the smile read in a side view.
    const rearTooth=mesh(head,fangGeometry,toothMaterial,[side*.204,.335,.044],[.69,.60,.69],'Small rear tooth');
    rearTooth.rotation.x=-.08;
    head.userData.fangs.push({mesh:rearTooth,openAngle:-.08});
  }
  animateSnakeMouth(head,0);
  return head;
}

export function animateSnakeMouth(head,opening){
  const amount=THREE.MathUtils.clamp(opening,0,1),{jaw,cavity,fangs}=head.userData;
  jaw.rotation.x=THREE.MathUtils.lerp(-.29,.26,amount);
  // Contract the dark throat toward the roof as the jaw closes, so it cannot
  // hang below the chin. The lower lining stays attached to the moving jaw.
  cavity.scale.y=.34+.96*amount;cavity.position.y=.38*(1-cavity.scale.y);
  // Folding the fangs back into the mouth prevents them piercing the closing
  // lower lip. Fully open, they return to their prominent downward pose.
  for(const fang of fangs)fang.mesh.rotation.x=THREE.MathUtils.lerp(.95,fang.openAngle,amount);
  head.userData.mouthOpen=amount;
}
