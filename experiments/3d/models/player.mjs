import * as THREE from '../vendor/three.module.min.js';

// Concept proportions: a broad lime face, fitted red hard-shell helmet and a
// generous dark smile. Every form faces +Z and is owned by this module.
const satin=(color,roughness=.34,metalness=.03)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const helmet=new THREE.MeshPhysicalMaterial({color:0xc90717,roughness:.12,metalness:.10,clearcoat:1,clearcoatRoughness:.035,envMapIntensity:1.3});
const helmetRim=new THREE.MeshPhysicalMaterial({color:0x970b19,roughness:.16,metalness:.08,clearcoat:1,clearcoatRoughness:.045,envMapIntensity:1.2});
const cream=satin(0xfff6db,.22);
// The interior is deliberately unlit so its rounded back wall reads as
// negative space instead of a shiny black ball filling the smile.
const mouth=new THREE.MeshBasicMaterial({color:0x0d070e});
const pupil=new THREE.MeshPhysicalMaterial({color:0x070b0e,roughness:.17,clearcoat:1,clearcoatRoughness:.08});
const eyeRim=satin(0x31571a,.34,.01);
const tongue=satin(0x992b48,.37,0);
const glint=new THREE.MeshBasicMaterial({color:0xffffff});

function placed(geometry,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){
  geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale)));
  return geometry;
}
function ellipsoid(position,scale,segments=28,rings=18){return placed(new THREE.SphereGeometry(1,segments,rings),position,scale);}
function batch(parts){
  const expanded=parts.map(g=>g.index?g.toNonIndexed():g),positions=[],normals=[];
  for(const g of expanded){positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);}
  const merged=new THREE.BufferGeometry();
  merged.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  merged.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  merged.computeBoundingSphere();
  for(const g of new Set([...parts,...expanded]))g.dispose();
  return merged;
}
function tube(points,radius=.008,segments=32){
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,8,false);
}
function helmetEdge(offset,thickness){
  const points=Array.from({length:96},(_,i)=>{
    const theta=i*Math.PI*2/96,x=Math.sin(theta),z=Math.cos(theta);
    return new THREE.Vector3(x*(.32352+offset*.22),.623-.046*x*x-.023*Math.max(0,-z)+offset,-.014+z*(.318+offset*.22));
  });
  const path=new THREE.CatmullRomCurve3(points,true);
  return new THREE.TubeGeometry(path,80,thickness,10,true);
}

// Pressed channels shape two side panels in the shell itself. Their softly
// rolled shoulders catch the studio cards; there are no painted seam lines.
const helmetGeometry=new THREE.SphereGeometry(1,144,80,0,Math.PI*2,0,Math.PI/2);
const shellPosition=helmetGeometry.attributes.position;
for(let i=0;i<shellPosition.count;i++){
  const x=shellPosition.getX(i),y=shellPosition.getY(i),z=shellPosition.getZ(i);
  const panel=Math.abs(x)-.48;
  const channel=-.0027*Math.exp(-((panel/.075)**2));
  const shoulder=.0015*Math.exp(-(((Math.abs(panel)-.105)/.05)**2));
  const relief=(channel+shoulder)*Math.min(1,Math.max(0,y)*8);
  // The skirt hugs the temples and nape while the front stays above the eyes.
  // Its slight inward roll avoids a wide, flat hat brim around the whole head.
  const skirt=(1-y)**3,inward=1-.04*(1-y)**4;
  shellPosition.setXYZ(i,x*.337*inward+x*relief,.623+y*.284+y*relief-skirt*(.046*x*x+.023*Math.max(0,-z)),-.014+z*.318+z*relief);
}
helmetGeometry.computeVertexNormals();
helmetGeometry.computeBoundingSphere();
const rimGeometry=helmetEdge(0,.007);
const rimUpperGeometry=helmetEdge(.009,.004);

// A shallow crescent immediately above the brow: only its central edge extends
// about .03 beyond the shell. The rounded thin lip belongs to the hard helmet.
const visorShape=new THREE.Shape(),visorLimit=1.04;
for(let i=0;i<=48;i++){
  const theta=-visorLimit+i*visorLimit*2/48;
  const x=.330*Math.sin(theta),z=.318*Math.cos(theta)-.014+.031*Math.cos(theta/visorLimit*Math.PI/2)**2;
  if(i===0)visorShape.moveTo(x,z);else visorShape.lineTo(x,z);
}
for(let i=48;i>=0;i--){
  const theta=-visorLimit+i*visorLimit*2/48;
  visorShape.lineTo(.318*Math.sin(theta),.309*Math.cos(theta)-.014);
}
visorShape.closePath();
const visorGeometry=new THREE.ExtrudeGeometry(visorShape,{depth:.006,steps:1,bevelEnabled:true,bevelSegments:2,bevelSize:.0025,bevelThickness:.0025,curveSegments:1});
visorGeometry.rotateX(Math.PI/2);
const visorPosition=visorGeometry.attributes.position;
for(let i=0;i<visorPosition.count;i++){
  const x=visorPosition.getX(i);
  visorPosition.setY(i,visorPosition.getY(i)+.623-.046*(x/.32352)**2);
}
visorGeometry.computeVertexNormals();visorGeometry.computeBoundingSphere();

const faceGeometry=batch([
  placed(new THREE.SphereGeometry(1,48,32,0,Math.PI*2,0,1.85),[0,.437,-.006],[.345,.236,.311]),
  // The closed back hemisphere connects the crown and jaw around the smile.
  placed(new THREE.SphereGeometry(1,40,28,Math.PI,Math.PI),[0,.297,-.006],[.331,.228,.299]),
]);
const cavityGeometry=ellipsoid([0,.290,-.006],[.322,.142,.300],40,26);
const socketParts=[],whiteParts=[],pupilParts=[],glintParts=[],nostrilParts=[];
for(const side of [-1,1]){
  const x=side*.191;
  // Shallow lenses sit against the face instead of forming binocular-like
  // balls. The white rim stays narrow around a large expressive dark pupil.
  socketParts.push(placed(new THREE.SphereGeometry(1,28,18),[x,.511,.246],[.070,.079,.021],[0,side*.34,0]));
  whiteParts.push(placed(new THREE.SphereGeometry(1,32,20),[x,.514,.255],[.064,.071,.022],[0,side*.34,0]));
  pupilParts.push(ellipsoid([x-side*.004,.513,.276],[.030,.041,.012],28,20));
  glintParts.push(ellipsoid([x-side*.004-.009,.531,.286],[.009,.012,.004],16,10));
  nostrilParts.push(ellipsoid([side*.049,.416,.300],[.010,.008,.004],12,8));
}
const socketGeometry=batch(socketParts),eyeGeometry=batch(whiteParts),pupilGeometry=batch(pupilParts),glintGeometry=batch(glintParts),nostrilGeometry=batch(nostrilParts);
const upperLipGeometry=tube([[-.269,.381,.139],[-.223,.378,.211],[-.124,.372,.283],[0,.370,.301],[.124,.372,.283],[.223,.378,.211],[.269,.381,.139]],.012,40);
function tooth(position,scale,up=false){
  // Round shoulders and a small softened tip, rather than a needle cone.
  const profile=[[0,-.5],[.10,-.47],[.23,-.28],[.39,.12],[.43,.33],[.33,.47],[0,.5]].map(([x,y])=>new THREE.Vector2(x,y));
  return placed(new THREE.LatheGeometry(profile,16),position,scale,[up?Math.PI:0,0,0]);
}
const topTeeth=batch([
  tooth([-.226,.329,.210],[.090,.110,.086]),
  tooth([.226,.329,.210],[.090,.110,.086]),
]);

// Jaw forms are baked into hinge space. Their spherical outer silhouette
// continues the skull while the entire lower smile opens as one piece.
const hinge=new THREE.Vector3(0,.278,-.129);
const local=g=>g.translate(-hinge.x,-hinge.y,-hinge.z);
const jawGeometry=local(ellipsoid([0,.178,-.006],[.321,.116,.292],40,24));
const insideGeometry=local(ellipsoid([0,.245,.013],[.292,.029,.255],32,18));
const tongueGeometry=local(ellipsoid([0,.267,.092],[.070,.014,.055],28,16));
const lowerTeeth=local(batch([
  tooth([-.174,.274,.220],[.085,.081,.077],true),
  tooth([.174,.274,.220],[.085,.081,.077],true),
]));
const lipGeometry=local(tube([[-.292,.204,.065],[-.270,.227,.123],[-.215,.241,.211],[-.120,.250,.276],[0,.253,.292],[.120,.250,.276],[.215,.241,.211],[.270,.227,.123],[.292,.204,.065]],.014,48));

function mesh(parent,geometry,material,name){
  const m=new THREE.Mesh(geometry,material);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}

/** Shared native geometry, front +Z, radius < .414 and height < .98.
 * Animate userData.jaw.rotation.x within .08–.22; .30 is also floor-safe.
 */
export function createPlayerModel(skinMaterial){
  const group=new THREE.Group();group.name='Concept helmet chomper';
  mesh(group,faceGeometry,skinMaterial,'Round uninterrupted face');
  mesh(group,cavityGeometry,mouth,'Wide dark smile');
  mesh(group,helmetGeometry,helmet,'Glossy hard-shell helmet');
  mesh(group,rimGeometry,helmetRim,'Short rolled helmet rim');
  mesh(group,rimUpperGeometry,helmet,'Helmet rim highlight');
  mesh(group,visorGeometry,helmet,'Minimal curved front visor');
  mesh(group,socketGeometry,eyeRim,'Inset eye sockets');
  mesh(group,eyeGeometry,cream,'Expressive eye whites');
  mesh(group,pupilGeometry,pupil,'Black pupils');
  mesh(group,glintGeometry,glint,'Eye catchlights');
  mesh(group,nostrilGeometry,eyeRim,'Small nostrils');
  mesh(group,upperLipGeometry,skinMaterial,'Rounded upper smile');
  mesh(group,topTeeth,cream,'Upper ivory fangs');
  const jaw=new THREE.Group();jaw.name='Lower jaw hinge';jaw.position.copy(hinge);group.add(jaw);
  mesh(jaw,jawGeometry,skinMaterial,'Round lower jaw');
  mesh(jaw,insideGeometry,mouth,'Inner lower mouth');
  mesh(jaw,tongueGeometry,tongue,'Small tongue');
  mesh(jaw,lowerTeeth,cream,'Lower ivory fangs');
  mesh(jaw,lipGeometry,skinMaterial,'Rounded lower smile');
  group.userData.jaw=jaw;
  group.userData.modelVersion='concept-player-v4';
  return group;
}
