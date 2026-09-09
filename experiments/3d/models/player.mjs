import * as THREE from '../vendor/three.module.min.js';

// A single compact skull, with a mouth cut into its front. Only the front of
// the chin articulates: the nape must never turn into a stack of moving rings.
// Native coordinates face +Z; the shared gameplay footprint is unchanged.
const satin=(color,roughness=.34,metalness=.03)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const helmet=new THREE.MeshPhysicalMaterial({color:0xad0712,roughness:.22,metalness:.58,clearcoat:1,clearcoatRoughness:.07,envMapIntensity:1.5});
const helmetRim=new THREE.MeshPhysicalMaterial({color:0x8b0714,roughness:.24,metalness:.62,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.4});
const cream=satin(0xfff8e5,.25);
const mouth=new THREE.MeshBasicMaterial({color:0x090509});
const pupil=new THREE.MeshPhysicalMaterial({color:0x050809,roughness:.16,clearcoat:1,clearcoatRoughness:.07});
const eyeRim=satin(0x365608,.37);
const tongue=satin(0x58202c,.43,0);
const glint=new THREE.MeshBasicMaterial({color:0xffffff});
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};

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

// Broad cheek and muzzle planes with narrow rounded shoulders. Subdividing
// the bevels (not triangulating a flat-shaded sphere) retains a deliberate face
// shape and soft highlights without pointed or noisy triangular cheeks.
const outlineAngles=[-180,-155,-125,-95,-70,-45,-25,25,45,70,95,125,155];
const outline=outlineAngles.map(a=>new THREE.Vector2(Math.sin(a*Math.PI/180)*.386,Math.cos(a*Math.PI/180)*.357));
const contour=[];
for(let i=0;i<outline.length;i++){
  const p=outline[i],before=outline[(i+outline.length-1)%outline.length],after=outline[(i+1)%outline.length];
  const start=p.clone().lerp(before,.13),end=p.clone().lerp(after,.13);
  for(let step=0;step<=4;step++){
    const t=step/4;
    contour.push(start.clone().multiplyScalar((1-t)**2).addScaledVector(p,2*t*(1-t)).addScaledVector(end,t*t));
  }
  contour.push(end.clone().lerp(after.clone().lerp(p,.13),.5));
}
function shellPoint(p,theta){
  const ring=Math.sin(theta);
  return new THREE.Vector3(p.x*ring,.382+.303*Math.cos(theta),p.y*ring-.008);
}
function surface(rows,columns,pointAt,wrap=true){
  const positions=[],indices=[];
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++)positions.push(...pointAt(row/rows,col%columns,col/columns).toArray());
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const a=row*(columns+1)+col,b=a+1,c=a+columns+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Match the two copies of the closed rear seam, including their normals.
  if(wrap){
    const n=geometry.attributes.normal,v=new THREE.Vector3();
    for(let row=0;row<=rows;row++){
      const a=row*(columns+1),b=a+columns;
      v.set(n.getX(a)+n.getX(b),n.getY(a)+n.getY(b),n.getZ(a)+n.getZ(b)).normalize();
      n.setXYZ(a,v.x,v.y,v.z);n.setXYZ(b,v.x,v.y,v.z);
    }
  }
  geometry.computeBoundingSphere();return geometry;
}
const faceGeometry=surface(28,contour.length,(v,col)=>{
  const p=contour[col],angle=Math.abs(Math.atan2(p.x,p.y));
  const mouthCorner=smooth((angle-.88)/.80);
  // The front stops at the upper lip; the sides blend continuously into the
  // complete, rounded rear bowl, down to its base. There is no rear jaw seam.
  const end=THREE.MathUtils.lerp(1.665,Math.PI,mouthCorner);
  return shellPoint(p,v*end);
});
const cavityGeometry=ellipsoid([0,.292,-.036],[.317,.129,.262],40,28);

const socketParts=[],whiteParts=[],pupilParts=[],glintParts=[],nostrilParts=[];
for(const side of [-1,1]){
  const x=side*.232,y=.447,z=.278,turn=side*.55;
  socketParts.push(placed(new THREE.SphereGeometry(1,28,18),[x,y,z],[.070,.080,.016],[0,turn,0]));
  whiteParts.push(placed(new THREE.SphereGeometry(1,32,20),[x+side*.003,y+.002,z+.006],[.064,.074,.017],[0,turn,0]));
  pupilParts.push(placed(new THREE.SphereGeometry(1,28,20),[x+side*.004,y+.001,z+.022],[.031,.046,.011],[0,turn,0]));
  glintParts.push(ellipsoid([x+side*.004-.009,y+.022,z+.031],[.009,.012,.004],16,10));
  // Small inset-looking polygonal nostrils sit in the broad central muzzle.
  nostrilParts.push(ellipsoid([side*.079,.392,.316],[.011,.008,.005],8,6));
}
const socketGeometry=batch(socketParts),eyeGeometry=batch(whiteParts),pupilGeometry=batch(pupilParts),glintGeometry=batch(glintParts),nostrilGeometry=batch(nostrilParts);
function tooth(position,scale,up=false){
  const profile=[[0,-.5],[.10,-.47],[.23,-.28],[.39,.12],[.43,.33],[.33,.47],[0,.5]].map(([x,y])=>new THREE.Vector2(x,y));
  return placed(new THREE.LatheGeometry(profile,16),position,scale,[up?Math.PI:0,0,0]);
}
const topTeeth=batch([
  tooth([-.226,.303,.239],[.086,.101,.080]),
  tooth([.226,.303,.239],[.086,.101,.080]),
]);

// The jaw is a front spherical sector, not a flattened sphere/disc. It tucks
// under the fixed cheeks at the hinge and rounds inward underneath the chin.
const hinge=new THREE.Vector3(0,.259,-.035);
const local=g=>g.translate(-hinge.x,-hinge.y,-hinge.z);
function chinContour(u){
  const angle=THREE.MathUtils.lerp(-1.84,1.84,u);
  // Intersect the authored cheek contour, keeping the chin's facets aligned.
  const ray=new THREE.Vector2(Math.sin(angle),Math.cos(angle));
  let reach=.36;
  for(let i=0;i<contour.length;i++){
    const a=contour[i],b=contour[(i+1)%contour.length],ex=b.x-a.x,ez=b.y-a.y;
    const cross=ray.x*ez-ray.y*ex;
    if(Math.abs(cross)<1e-8)continue;
    const r=(a.x*ez-a.y*ex)/cross,t=(a.x*ray.y-a.y*ray.x)/cross;
    if(r>0&&t>=0&&t<=1){reach=r;break;}
  }
  return ray.multiplyScalar(reach*.985);
}
const jawGeometry=local(batch([
  surface(16,64,(v,col,u)=>{
    const rim=shellPoint(chinContour(u),2.015),curve=v*Math.PI/2;
    // A rounded vertical chin below the lip gives it actual visible volume;
    // starting at the underside of a sphere only exposed a paper-thin edge.
    return new THREE.Vector3(rim.x*1.04*Math.cos(curve),rim.y-(rim.y-.079)*Math.sin(curve),(rim.z+.008)*1.12*Math.cos(curve)+.017);
  },false),
  // A solid, softly bevelled mouth edge has visible thickness from above.
  // It is confined to the front sector, never a ring around the nape.
  surface(6,64,(v,col,u)=>{
    v=1-v; // Inner-to-outer traversal makes this upper surface face upward.
    const point=shellPoint(chinContour(u),2.015);
    point.x*=1.04*(1-.13*v);point.z=(point.z+.008)*1.12*(1-.13*v)+.017;
    point.y+=.008*Math.sin(Math.PI*v);
    return point;
  },false),
]));
const insideGeometry=local(ellipsoid([0,.227,.028],[.289,.029,.256],36,20));
const tongueGeometry=local(ellipsoid([0,.260,.073],[.092,.014,.062],28,16));
const lowerTeeth=local(batch([
  tooth([-.167,.277,.277],[.094,.090,.085],true),
  tooth([.167,.277,.277],[.094,.090,.085],true),
]));

// Pressed metal dome: a low fitted skirt, a lightly raised crown and two
// shallow rolled channels. The reflection is material/geometry, not decals.
const helmetGeometry=new THREE.SphereGeometry(1,128,64,0,Math.PI*2,0,Math.PI/2);
const shellPosition=helmetGeometry.attributes.position;
for(let i=0;i<shellPosition.count;i++){
  const x=shellPosition.getX(i),y=shellPosition.getY(i),z=shellPosition.getZ(i),panel=Math.abs(x)-.48;
  const channel=-.0032*Math.exp(-((panel/.060)**2));
  const shoulder=.0020*Math.exp(-(((Math.abs(panel)-.095)/.045)**2));
  const crown=.0030*Math.exp(-((x/.15)**2))*Math.max(0,y);
  const relief=(channel+shoulder)*Math.min(1,Math.max(0,y)*7)+crown;
  const skirt=(1-y)**3,inward=1-.022*(1-y)**4;
  shellPosition.setXYZ(i,x*.391*inward+x*relief,.525+y*.255+y*relief+.043*z-skirt*(.025*x*x+.023*Math.max(0,-z)),-.011+z*.367*inward+z*relief);
}
helmetGeometry.computeVertexNormals();helmetGeometry.computeBoundingSphere();
const rimPoints=Array.from({length:96},(_,i)=>{
  const theta=i*Math.PI*2/96,x=Math.sin(theta),z=Math.cos(theta);
  return new THREE.Vector3(x*.3824,.525+.043*z-.025*x*x-.023*Math.max(0,-z),-.011+z*.359);
});
const rimGeometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPoints,true),96,.006,8,true);
const visorShape=new THREE.Shape(),visorLimit=1.16;
for(let i=0;i<=56;i++){
  const angle=-visorLimit+i*visorLimit*2/56;
  const x=.385*Math.sin(angle),z=-.011+.359*Math.cos(angle)+.025*Math.cos(angle/visorLimit*Math.PI/2)**2;
  if(i===0)visorShape.moveTo(x,z);else visorShape.lineTo(x,z);
}
for(let i=56;i>=0;i--){
  const angle=-visorLimit+i*visorLimit*2/56;
  visorShape.lineTo(.375*Math.sin(angle),-.011+.351*Math.cos(angle));
}
visorShape.closePath();
const visorGeometry=new THREE.ExtrudeGeometry(visorShape,{depth:.008,steps:1,bevelEnabled:true,bevelSegments:3,bevelSize:.003,bevelThickness:.003,curveSegments:1});
visorGeometry.rotateX(Math.PI/2);
const visorPosition=visorGeometry.attributes.position;
for(let i=0;i<visorPosition.count;i++){
  const x=visorPosition.getX(i);
  visorPosition.setY(i,visorPosition.getY(i)+.525+.043*Math.sqrt(Math.max(0,1-(x/.3824)**2))-.025*(x/.3824)**2);
}
visorGeometry.computeVertexNormals();visorGeometry.computeBoundingSphere();

function mesh(parent,geometry,material,name){
  const m=new THREE.Mesh(geometry,material);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}

/** Shared native geometry; full articulation .04–.30 remains inside radius
 * .414 and above the floor. userData.jaw is also used by bite/predation FX.
 */
export function createPlayerModel(skinMaterial){
  const root=new THREE.Group();root.name='Compact concept helmet chomper';
  const group=new THREE.Group();group.name='Uplifted face and fitted helmet';
  // A slight upward gaze lets the broad face read from the game's overhead
  // camera. Articulation stays in skull space, independent of movement yaw.
  const pitch=-.20,pivotY=.382;
  group.rotation.x=pitch;
  group.position.set(0,pivotY*(1-Math.cos(pitch))-.028,-pivotY*Math.sin(pitch));root.add(group);
  mesh(group,faceGeometry,skinMaterial,'Faceted skull and continuous nape');
  mesh(group,cavityGeometry,mouth,'Deep mouth cavity');
  mesh(group,helmetGeometry,helmet,'Pressed red metal helmet');
  mesh(group,rimGeometry,helmetRim,'Rolled metal helmet edge');
  mesh(group,visorGeometry,helmet,'Thin swept front visor');
  mesh(group,socketGeometry,eyeRim,'Inset eye sockets');
  mesh(group,eyeGeometry,cream,'Expressive eye whites');
  mesh(group,pupilGeometry,pupil,'Black pupils');
  mesh(group,glintGeometry,glint,'Eye catchlights');
  mesh(group,nostrilGeometry,eyeRim,'Small nostrils');
  mesh(group,topTeeth,cream,'Upper ivory fangs');
  const jaw=new THREE.Group();jaw.name='Front jaw hinge';jaw.position.copy(hinge);group.add(jaw);
  mesh(jaw,jawGeometry,skinMaterial,'Faceted round chin');
  mesh(jaw,insideGeometry,mouth,'Inner lower mouth');
  mesh(jaw,tongueGeometry,tongue,'Recessed tongue');
  mesh(jaw,lowerTeeth,cream,'Lower ivory fangs');
  root.userData.jaw=jaw;
  root.userData.modelVersion='concept-player-v5';
  return root;
}
