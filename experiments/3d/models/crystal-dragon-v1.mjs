import * as THREE from '../vendor/three.module.min.js';

// The approved two-cell silhouette is authored in native player space.
// All surfaces are bespoke indexed lofts, swept polygonal sections and webs.
// No stock sphere/cone parts are used for the dragon's visible anatomy.
const NOSE_Z=.27,TAIL_Z=NOSE_Z-4/2.1,BONE_COUNT=33;
const restZ=Array.from({length:BONE_COUNT},(_,i)=>TAIL_Z*i/(BONE_COUNT-1));
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const vec=(x,y,z)=>new THREE.Vector3(x,y,z);
function geometry(positions,indices,colors){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  if(indices)g.setIndex(indices);if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function merge(parts){
  const positions=[],normals=[],colors=[];
  for(const part of parts){
    const g=part.index?part.toNonIndexed():part;
    positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);
    if(g.attributes.color)colors.push(...g.attributes.color.array);
    else for(let i=0;i<g.attributes.position.count;i++)colors.push(1,1,1);
    if(g!==part)g.dispose();part.dispose();
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function tint(g,color,gain=1,shade=null){
  const base=new THREE.Color(color).multiplyScalar(gain),colors=[],p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++){
    const k=shade?shade(p.getX(i),p.getY(i),p.getZ(i),n.getY(i),i):1;
    colors.push(base.r*k,base.g*k,base.b*k);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}
function profile(stations,z){
  for(let i=0;i<stations.length-1;i++)if(z<=stations[i].z&&z>=stations[i+1].z){
    const t=(stations[i].z-z)/(stations[i].z-stations[i+1].z),a=stations[i],b=stations[i+1];
    return {z,y:lerp(a.y,b.y,t),rx:lerp(a.rx,b.rx,t),ry:lerp(a.ry,b.ry,t),x:lerp(a.x??0,b.x??0,t)};
  }
  return {...(z>stations[0].z?stations[0]:stations.at(-1)),z};
}
// Sections lie in XY planes, so the extreme nose and tail Z values are exact.
function loft(stations,{sides=20,rows=null,openAngle=Math.PI,caps=true,shape=null}={}){
  const rings=rows?Array.from({length:rows+1},(_,i)=>profile(stations,lerp(stations[0].z,stations.at(-1).z,i/rows))):stations;
  const positions=[],indices=[],closed=openAngle===Math.PI,columns=closed?sides:sides+1;
  for(let r=0;r<rings.length;r++){
    const s=rings[r];
    for(let i=0;i<columns;i++){
      const a=closed?i*Math.PI*2/sides:-openAngle+i*openAngle*2/sides;
      const point=[(s.x??0)+Math.sin(a)*s.rx,s.y+Math.cos(a)*s.ry,s.z];
      positions.push(...(shape?shape(point,a,s,r):point));
    }
  }
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<sides;i++){
    const next=closed?(i+1)%columns:i+1,a=r*columns+i,b=r*columns+next,c=a+columns,d=b+columns;
    indices.push(a,b,c,b,d,c);
  }
  if(caps){
    for(const [r,front]of [[0,true],[rings.length-1,false]]){
      const s=rings[r],center=positions.length/3;positions.push(s.x??0,s.y,s.z);
      for(let i=0;i<sides;i++){
        const a=r*columns+i,b=r*columns+(closed?(i+1)%columns:i+1);
        indices.push(...(front?[center,b,a]:[center,a,b]));
      }
    }
  }
  return geometry(positions,indices);
}
// Smoothly swept centers with faceted polygon sections retain shaped ridges.
function sweep(points,radii,{sides=9,steps=18,ellipse=1}={}){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const positions=[],indices=[],up=vec(0,1,0),q=new THREE.Quaternion(),v=new THREE.Vector3();
  for(let r=0;r<=steps;r++){
    const t=r/steps,center=curve.getPoint(t),direction=curve.getTangent(t).normalize();q.setFromUnitVectors(up,direction);
    const u=t*(radii.length-1),i=Math.min(radii.length-2,Math.floor(u)),radius=lerp(radii[i],radii[i+1],u-i);
    for(let s=0;s<sides;s++){
      const a=(s+.5)*Math.PI*2/sides;v.set(Math.cos(a)*radius,0,Math.sin(a)*radius*ellipse).applyQuaternion(q).add(center);positions.push(v.x,v.y,v.z);
    }
  }
  for(let r=0;r<steps;r++)for(let i=0;i<sides;i++){
    const a=r*sides+i,b=r*sides+(i+1)%sides,c=a+sides,d=b+sides;indices.push(a,c,b,b,c,d);
  }
  for(const [r,front]of [[0,false],[steps,true]]){
    const center=positions.length/3,point=curve.getPoint(r/steps);positions.push(point.x,point.y,point.z);
    for(let i=0;i<sides;i++){const a=r*sides+i,b=r*sides+(i+1)%sides;indices.push(...(front?[center,b,a]:[center,a,b]));}
  }
  return geometry(positions,indices);
}
// A shaped almond, not a complete eyeball sphere. The raised lens projects
// from the cheek plane; its surrounding sweep supplies the expressive brow.
function lens(center,normal,width,height,depth,{sides=32,rings=7,inner=0}={}){
  const positions=[],indices=[],rotation=new THREE.Quaternion().setFromUnitVectors(vec(0,0,1),new THREE.Vector3(...normal).normalize());
  const v=new THREE.Vector3(),c=new THREE.Vector3(...center);
  for(let r=0;r<=rings;r++){
    const radius=lerp(inner,1,r/rings);
    for(let i=0;i<sides;i++){
      const a=i*Math.PI*2/sides,x=Math.cos(a)*width*radius,y=Math.sin(a)*height*radius*(.86+.14*Math.abs(Math.cos(a)));
      v.set(x,y,depth*Math.sqrt(Math.max(0,1-radius*radius))).applyQuaternion(rotation).add(c);positions.push(v.x,v.y,v.z);
    }
  }
  for(let r=0;r<rings;r++)for(let i=0;i<sides;i++){
    const a=r*sides+i,b=r*sides+(i+1)%sides,c=a+sides,d=b+sides;indices.push(a,c,b,b,c,d);
  }
  return geometry(positions,indices);
}
function skinned(g){
  const indices=[],weights=[],p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const u=clamp(p.getZ(i)/TAIL_Z,0,1)*(BONE_COUNT-1),a=Math.min(BONE_COUNT-2,Math.floor(u)),t=u-a;
    indices.push(a,a+1,0,0);weights.push(1-t,t,0,0);
  }
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));return g;
}
// Preserve broad authored crystal planes while giving skinning enough small
// triangles to follow the route. Subdivision does not add longitudinal ribs.
function subdivide(source,levels=2){
  let g=source.index?source.toNonIndexed():source;if(g!==source)source.dispose();
  for(let level=0;level<levels;level++){
    const p=g.attributes.position,positions=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    const ab=new THREE.Vector3(),bc=new THREE.Vector3(),ca=new THREE.Vector3();
    for(let i=0;i<p.count;i+=3){
      a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
      ab.addVectors(a,b).multiplyScalar(.5);bc.addVectors(b,c).multiplyScalar(.5);ca.addVectors(c,a).multiplyScalar(.5);
      for(const point of [a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca])positions.push(point.x,point.y,point.z);
    }
    g.dispose();g=geometry(positions);
  }
  return g;
}
// A small asymmetric crystal volume with independently shaded internal
// planes. Its bright faces occupy depth, rather than painting the outer skin.
function innerShard(center,scale,color,gain=1,rotation=[0,0,0],seed=0){
  const g=loft([
    {z:.90,y:.03,x:-.10,rx:.19,ry:.23},
    {z:.36,y:.11,x:.12,rx:.86,ry:.69},
    {z:-.25,y:-.07,x:-.06,rx:.93,ry:.92},
    {z:-.89,y:.09,x:.08,rx:.23,ry:.31}
  ],{sides:6});
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...center),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale)));
  const faceted=g.toNonIndexed();g.dispose();faceted.computeVertexNormals();
  const colors=[],base=new THREE.Color(color),emerald=new THREE.Color(0x1e7a4d),n=faceted.attributes.normal;
  const tintColor=new THREE.Color();
  for(let i=0;i<faceted.attributes.position.count;i+=3){
    const facing=clamp(.50+n.getY(i)*.31+n.getX(i)*.17-n.getZ(i)*.19,0,1);
    const fracture=.25+.75*Math.abs(Math.sin((i/3+seed)*1.71));
    tintColor.copy(emerald).lerp(base,.25+.75*facing).multiplyScalar(gain*(.20+.80*fracture));
    for(let corner=0;corner<3;corner++)colors.push(tintColor.r,tintColor.g,tintColor.b);
  }
  faceted.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return faceted;
}

const torsoProfile=[
  {z:-.33,y:.405,rx:.155,ry:.145},{z:-.43,y:.395,rx:.220,ry:.205},
  {z:-.59,y:.360,rx:.267,ry:.231},{z:-.77,y:.350,rx:.273,ry:.222},
  {z:-.94,y:.346,rx:.225,ry:.178},{z:-1.08,y:.331,rx:.158,ry:.127},
  {z:-1.19,y:.318,rx:.106,ry:.096},{z:-1.33,y:.316,rx:.072,ry:.068},
  {z:-1.47,y:.349,rx:.046,ry:.050},{z:-1.57,y:.390,rx:.030,ry:.037},
  {z:TAIL_Z,y:.429,rx:.001,ry:.001}
];
const torsoShell=skinned(tint(subdivide(loft(torsoProfile,{sides:14,rows:16,shape:(p,a,s,r)=>{
  const phase=(r%2?.105:-.045)*Math.sin(Math.PI*clamp((-s.z-.33)/(-TAIL_Z-.33),0,1));
  const scale=1+.018*Math.sin(a*3+r*1.17);
  return [Math.sin(a+phase)*s.rx*scale,s.y+Math.cos(a+phase)*s.ry,s.z];
}}),2),0xffffff));
const innerProfile=torsoProfile.map((s,i)=>({...s,x:.022*Math.sin(i*1.4),y:s.y-.030+Math.sin(i*.8)*.012,
  rx:s.rx*(.29+.12*Math.sin(i*1.7)**2),ry:s.ry*(.33+.09*Math.cos(i*1.2)**2)}));
const axialCore=loft(innerProfile,{sides:9,rows:19,shape:(p,a,s,r)=>{
  const phase=r%2?.23:-.08;return [(s.x??0)+Math.sin(a+phase)*s.rx,s.y+Math.cos(a+phase)*s.ry,s.z];
}});
{
  const colors=[],p=axialCore.attributes.position,n=axialCore.attributes.normal,emerald=new THREE.Color(0x26bf82),mint=new THREE.Color(0x89f3c6),warm=new THREE.Color(0xdde77a),color=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const z=p.getZ(i),chest=1-THREE.MathUtils.smoothstep(-z,.50,.97);
    const facet=.16+.84*Math.max(0,n.getY(i)*.62+n.getX(i)*.28+n.getZ(i)*.16);
    const pocket=.35+.65*Math.sin(-z*17+n.getX(i)*2.4)**2;
    const tail=1-THREE.MathUtils.smoothstep(-z,1.02,1.57)*.72;
    color.copy(emerald).lerp(mint,.64).lerp(warm,chest*.27).multiplyScalar((.52+chest*.22)*facet*pocket*tail);
    colors.push(color.r,color.g,color.b);
  }
  axialCore.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
}
const torsoCore=skinned(merge([
  axialCore,
  innerShard([-.075,.383,-.466],[.085,.113,.079],0xc8f4b2,1.85,[.18,-.3,.28],1),
  innerShard([.080,.309,-.517],[.104,.080,.106],0xb0f6c5,2.15,[-.3,.37,-.35],4),
  innerShard([-.115,.323,-.628],[.098,.097,.108],0x7cf2bd,1.85,[.2,.3,.35],7),
  innerShard([.133,.409,-.638],[.077,.110,.108],0xb7fadd,1.65,[-.15,-.25,-.30],9),
  innerShard([-.042,.473,-.678],[.119,.046,.110],0x82e9af,1.35,[.3,.55,.2],11),
  innerShard([.018,.219,-.733],[.138,.042,.121],0xd0f9bb,1.65,[-.1,.2,-.1],15),
  innerShard([-.139,.349,-.794],[.074,.097,.101],0x84f0bd,1.70,[.15,.45,.25],18),
  innerShard([.128,.334,-.819],[.077,.101,.113],0xbaf6d5,1.80,[-.2,-.3,-.35],22),
  innerShard([-.028,.413,-.923],[.111,.057,.098],0x5dd896,1.50,[.3,.15,.2],24),
  innerShard([.032,.292,-1.025],[.087,.068,.090],0x92edb8,1.55,[-.2,-.25,.1],28),
  innerShard([-.008,.328,-1.206],[.048,.042,.090],0x5dcd96,1.10,[.1,.2,.3],31),
  innerShard([.008,.351,-1.421],[.027,.029,.088],0x7de5b0,.80,[.2,.2,-.2],35)
]));
for(let i=0;i<torsoCore.attributes.color.array.length;i++)torsoCore.attributes.color.array[i]*=.80;

const skullStations=[
  {z:NOSE_Z,y:.466,rx:.188,ry:.073},{z:.225,y:.474,rx:.211,ry:.083},
  {z:.115,y:.501,rx:.252,ry:.122},{z:-.025,y:.519,rx:.301,ry:.170},
  {z:-.160,y:.514,rx:.334,ry:.193},{z:-.290,y:.486,rx:.304,ry:.184},
  {z:-.400,y:.443,rx:.229,ry:.151},{z:-.485,y:.410,rx:.145,ry:.108}
];
function muzzlePoint(a,station){
  const exponent=lerp(.65,1,THREE.MathUtils.smoothstep(-station.z,-.225,.07));
  const sine=Math.sin(a),cosine=Math.cos(a);
  return [Math.sign(sine)*Math.abs(sine)**exponent*station.rx,
    station.y+Math.sign(cosine)*Math.abs(cosine)**exponent*station.ry,station.z];
}
function noseFacade(){
  const station=skullStations[0],outline=[];
  for(let i=0;i<=24;i++){const p=muzzlePoint(-2.01+i*4.02/24,station);outline.push(new THREE.Vector2(p[0],p[1]));}
  const holes=[-1,1].map(side=>Array.from({length:12},(_,i)=>{
    const a=i*Math.PI*2/12;return new THREE.Vector2(side*.105+Math.cos(a)*.038,.482+Math.sin(a)*.022);
  }));
  const triangles=THREE.ShapeUtils.triangulateShape(outline,holes),points=[...outline,...holes.flat()],positions=[],indices=triangles.flat();
  for(const p of points)positions.push(p.x,p.y,NOSE_Z);
  const g=geometry(positions,indices);
  if(g.attributes.normal.getZ(0)<0){for(let i=0;i<g.index.count;i+=3){const a=g.index.array[i+1];g.index.array[i+1]=g.index.array[i+2];g.index.array[i+2]=a;}g.computeVertexNormals();}
  return g;
}
const headParts=[loft(skullStations,{sides:14,openAngle:2.01,caps:false,shape:(p,a,s)=>muzzlePoint(a,s)}),noseFacade()];
const headAccents=[],horns=[],hornCores=[],eyeParts=[],irisParts=[],irisCrescents=[],glints=[];
for(const side of [-1,1]){
  headAccents.push(sweep([[side*.108,.596,.088],[side*.216,.667,.025],[side*.308,.647,-.09],[side*.304,.538,-.215]],
    [.031,.051,.054,.042],{sides:8,steps:14,ellipse:.84}));
  headAccents.push(sweep([[side*.20,.402,.12],[side*.298,.393,-.006],[side*.335,.455,-.13],[side*.283,.513,-.276]],
    [.024,.046,.061,.039],{sides:8,steps:14,ellipse:.68}));
  const hornPath=[[side*.204,.646,-.254],[side*.249,.729,-.284],[side*.291,.794,-.351],[side*.287,.840,-.417],[side*.235,.895,-.480]];
  horns.push(sweep(hornPath,[.098,.090,.069,.039,.0015],{sides:8,steps:10,ellipse:.72}));
  hornCores.push(tint(sweep(hornPath.slice(0,3),[.009,.018,.007],{sides:6,steps:5,ellipse:.7}),0x43c584,.62,(x,y,z,n)=>.3+.7*Math.max(0,n)));
  const center=[side*.248,.544,-.005],normal=[side*.55,.14,.82];
  eyeParts.push(lens(center,normal,.104,.124,.043));
  // A dark pupil remains large; only the outer iris is quietly luminous jade.
  irisParts.push(tint(lens([center[0]+side*.004,center[1],center[2]+.007],normal,.097,.115,.045,{inner:.60,rings:3}),0xffffff,1,(x,y)=>.44+.56*clamp((.61-y)/.13,0,1)));
  const eyeRotation=new THREE.Quaternion().setFromUnitVectors(vec(0,0,1),new THREE.Vector3(...normal).normalize());
  const eyePoint=(x,y,z)=>vec(x,y,z).applyQuaternion(eyeRotation).add(new THREE.Vector3(...center)).toArray();
  glints.push(tint(lens(eyePoint(-.027,.035,.051),normal,.011,.014,.003,{sides:16,rings:3}),0xf6efce,.95));
  glints.push(tint(lens(eyePoint(.025,-.020,.051),normal,.0045,.006,.002,{sides:12,rings:2}),0xcbe6da,.65));
  const crescentPositions=[],crescentIndices=[],crescentColors=[];
  for(let ring=0;ring<=2;ring++)for(let i=0;i<=12;i++){
    const t=i/12,a=-1.55+t*2.10,r=.71+ring*.105,x=Math.cos(a)*.095*r,y=Math.sin(a)*.113*r*(.86+.14*Math.abs(Math.cos(a)));
    crescentPositions.push(...eyePoint(x,y,.055*Math.sqrt(1-r*r)+.006));
    const edge=(ring===1?1:.28)*Math.sin(Math.PI*t)**.7,c=new THREE.Color(0x69e49a).multiplyScalar(edge*.75);
    crescentColors.push(c.r,c.g,c.b);
  }
  for(let ring=0;ring<2;ring++)for(let i=0;i<12;i++){const a=ring*13+i,b=a+1,c=a+13; crescentIndices.push(a,c,b,b,c,c+1);}
  irisCrescents.push(geometry(crescentPositions,crescentIndices,crescentColors));
  eyeParts.push(lens([side*.105,.482,.259],[0,0,1],.037,.021,.003,{sides:20,rings:3}));
}
headAccents.push(loft([{z:.220,y:.542,rx:.091,ry:.014},{z:.065,y:.620,rx:.109,ry:.025},{z:-.13,y:.673,rx:.099,ry:.026},{z:-.27,y:.655,rx:.078,ry:.024}],{sides:7}));
const headGeometry=merge(headParts),accentGeometry=merge([...headAccents,...horns]);
const eyeGeometry=merge(eyeParts),irisGeometry=merge(irisParts),irisCrescentGeometry=merge(irisCrescents),glintGeometry=merge(glints);
const headCoreGeometry=merge([
  innerShard([0,.557,-.140],[.213,.071,.218],0x6cbc8e,.67,[.04,.10,.06],2),
  innerShard([0,.588,-.232],[.102,.044,.090],0x9ce5b7,.87,[.2,.2,.3],4),
  innerShard([-.086,.553,-.102],[.087,.038,.115],0x7ddaac,.86,[.1,.5,.4],6),
  innerShard([.089,.560,-.087],[.081,.044,.113],0xb2e8c5,.86,[-.2,-.4,-.3],10),
  innerShard([0,.489,.151],[.141,.027,.071],0x6fc991,.67,[0,.04,0],14),
  ...[-1,1].map(side=>innerShard([side*.269,.438,-.112],[.034,.031,.056],0x8de3b5,.78,[.1,side*.15,side*.4],23+(side+1))),
  ...hornCores
]);

const jawHinge=vec(0,.399,-.221);
const jawGeometry=loft([
  {z:.258,y:.283,rx:.097,ry:.025},{z:.216,y:.271,rx:.162,ry:.034},{z:.073,y:.274,rx:.210,ry:.044},
  {z:-.078,y:.304,rx:.231,ry:.046},{z:-.195,y:.366,rx:.172,ry:.042},{z:-.24,y:.388,rx:.092,ry:.027}
],{sides:18}).translate(0,-jawHinge.y,-jawHinge.z);
// The oral cavity is an open recessed canal. Its forward end is un-capped;
// the golden tongue and throat remain visible between actual jaw surfaces.
const mouthGeometry=loft([
  {z:.223,y:.365,rx:.146,ry:.068},{z:.10,y:.373,rx:.193,ry:.099},
  {z:-.08,y:.386,rx:.182,ry:.112},{z:-.229,y:.401,rx:.082,ry:.079}
],{sides:24,caps:false});
const tongueGeometry=loft([
  {z:.142,y:.302,rx:.049,ry:.010},{z:.043,y:.306,rx:.102,ry:.015},{z:-.080,y:.325,rx:.098,ry:.024},{z:-.184,y:.376,rx:.050,ry:.026}
],{sides:10});
{
  const p=tongueGeometry.attributes.position,n=tongueGeometry.attributes.normal,colors=[];
  const quiet=new THREE.Color(0x3d4520),warm=new THREE.Color(0xbba74b),color=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const recess=THREE.MathUtils.smoothstep(-p.getZ(i),-.12,.17),facet=.45+.55*Math.max(0,n.getY(i));
    color.copy(quiet).lerp(warm,recess).multiplyScalar((.25+recess*.75)*facet);colors.push(color.r,color.g,color.b);
  }
  tongueGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));tongueGeometry.translate(0,-jawHinge.y,-jawHinge.z);
}
const upperTeeth=[],lowerTeeth=[];
for(const side of [-1,1]){
  upperTeeth.push(sweep([[side*.147,.424,.158],[side*.148,.383,.162],[side*.133,.346,.173]], [.027,.021,.0015],{sides:8,steps:8}));
  lowerTeeth.push(sweep([[side*.137,.293,.188],[side*.134,.325,.190],[side*.123,.350,.188]], [.022,.017,.0015],{sides:8,steps:8}));
  for(let i=0;i<3;i++){
    upperTeeth.push(sweep([[side*(.042+i*.046),.413,.216-i*.041],[side*(.042+i*.045),.395,.220-i*.041]], [.012,.001],{sides:6,steps:3}));
    lowerTeeth.push(sweep([[side*(.033+i*.043),.297,.231-i*.038],[side*(.033+i*.043),.314,.235-i*.038]], [.010,.001],{sides:6,steps:3}));
  }
}
const upperTeethGeometry=merge(upperTeeth),lowerTeethGeometry=merge(lowerTeeth).translate(0,-jawHinge.y,-jawHinge.z);

function wing(side){
  const root=[side*.186,.468,-.587];
  const fingers=[
    [root,[side*.257,.633,-.657],[side*.343,.751,-.833]],
    [root,[side*.325,.578,-.787],[side*.373,.579,-.918]],
    [root,[side*.293,.437,-.861],[side*.339,.451,-1.027]]
  ];
  const curves=fingers.map(points=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal'));
  const webs=[],ribs=[];
  for(let f=0;f<2;f++){
    const positions=[],indices=[],rows=12,cols=7;
    for(let r=0;r<=rows;r++)for(let c=0;c<=cols;c++){
      const u=r/rows,v=c/cols,scallop=1-.22*Math.sin(Math.PI*v)*u*u;
      const a=curves[f].getPoint(u*scallop),b=curves[f+1].getPoint(u*scallop),p=a.lerp(b,v);
      p.x+=side*.018*Math.sin(Math.PI*v)*Math.sin(Math.PI*u);positions.push(p.x,p.y,p.z);
    }
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const a=r*(cols+1)+c,b=a+1,d=a+cols+1;indices.push(a,b,d,b,d+1,d);
    }
    const web=geometry(positions,indices);
    if(side<0){const array=web.index.array;for(let i=0;i<array.length;i+=3)[array[i+1],array[i+2]]=[array[i+2],array[i+1]];web.computeVertexNormals();}
    webs.push(web);
  }
  for(let f=0;f<fingers.length;f++)ribs.push(sweep(fingers[f],[.030,f===0?.025:.015,.002],{sides:7,steps:15,ellipse:.78}));
  const glow=tint(sweep(fingers[0],[.007,.006,.001],{sides:6,steps:12}),0x70eeb0,1.6);
  return {shell:merge(ribs),web:merge(webs),core:glow,z:-.74};
}
function limb(side,front){
  const z=front?-.53:-.974,x=side*(front?.277:.270),y=front?.183:.189;
  const shoulder=[side*(front?.211:.20),front?.407:.332,z-.025];
  const elbow=[side*(front?.301:.282),front?.266:.231,z-.045];
  const wrist=[x,y+.029,z+.059];
  const shell=merge([
    sweep([shoulder,elbow,wrist],[front?.075:.080,.068,.051],{sides:10,steps:16,ellipse:.82}),
    loft([{z:z+.148,x,y:y-.002,rx:.043,ry:.043},{z:z+.110,x,y,rx:.069,ry:.061},{z:z+.042,x,y:y+.013,rx:.065,ry:.059},{z:z-.002,x,y:y+.043,rx:.038,ry:.045}],{sides:12})
  ]);
  const toes=[];
  for(const digit of [-1,0,1])toes.push(sweep([[x+digit*.038,y-.007,z+.126],[x+digit*.036,y-.037,z+.166],[x+digit*.031,y-.059,z+.180]], [.018,.014,.001],{sides:7,steps:7,ellipse:.78}));
  const core=tint(sweep([shoulder,elbow,wrist],[.018,.018,.016],{sides:7,steps:12,ellipse:.75}),0x69dfa4,1.05);
  return {shell,toes:merge(toes),core,z};
}
const wingParts=[wing(-1),wing(1)],limbParts=[limb(-1,true),limb(1,true),limb(-1,false),limb(1,false)];
// Attachment geometry is localized once to its rest bone, never cloned in an
// animation frame. Head/jaw stay rigid while the continuous body can bend.
function localize(parts){
  for(const part of parts){
    part.boneIndex=Math.round(part.z/TAIL_Z*(BONE_COUNT-1));part.restZ=restZ[part.boneIndex];
    for(const key of ['shell','web','toes','core'])part[key]?.translate(0,0,-part.restZ);
  }
}
localize(wingParts);localize(limbParts);

function glass(color,{thickness=.14,transmission=.92,roughness=.070}={}){
  const tint=new THREE.Color(color),material=new THREE.MeshPhysicalMaterial({
    color:tint.clone().multiplyScalar(.95),emissive:tint,emissiveIntensity:.08,
    transmission,thickness,ior:1.43,attenuationColor:tint.clone().lerp(new THREE.Color(0xc4efd4),.45),attenuationDistance:2.4,
    roughness,metalness:0,clearcoat:.28,clearcoatRoughness:.09,
    envMapIntensity:.40,specularIntensity:.53,specularColor:0xa9ddbb,
    vertexColors:true,flatShading:true
  });
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      vec3 dragonView=isOrthographic?vec3(0.,0.,1.):normalize(vViewPosition);
      float dragonEdge=pow(1.-abs(dot(normalize(normal),dragonView)),2.);
      totalEmissiveRadiance *= .12 + dragonEdge * .42;
    `);
  };
  material.customProgramCacheKey=()=> 'crystal-dragon-emerald-v1';return material;
}
function mesh(parent,g,material,name){
  const object=new THREE.Mesh(g,material);object.name=name;object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
}

export function createCrystalDragon(){
  const model=new THREE.Group();model.name='Sculpted emerald baby dragon';
  const bodyRig=new THREE.Group();bodyRig.name='Dragon skinned body rig';model.add(bodyRig);
  const emerald=glass(0x76cea0),jade=glass(0x98dbaf,{thickness:.065,transmission:.93});
  emerald.name='Faceted deep emerald dragon glass';jade.name='Swept jade horns and facial ridges';
  const membrane=glass(0x80cfaa,{thickness:.023,transmission:.93,roughness:.085});membrane.side=THREE.DoubleSide;
  const smoke=new THREE.MeshPhysicalMaterial({color:0x03170c,roughness:.085,metalness:0,
    transmission:.02,thickness:.025,ior:1.47,clearcoat:.9,clearcoatRoughness:.045,specularIntensity:.8});
  const iris=new THREE.MeshPhysicalMaterial({color:0x449862,emissive:0x215e39,emissiveIntensity:.18,
    roughness:.11,metalness:0,transmission:.07,thickness:.019,ior:1.45,clearcoat:.7,clearcoatRoughness:.07,
    vertexColors:true,specularIntensity:.65});
  const quartz=new THREE.MeshPhysicalMaterial({color:0xbfd9a1,roughness:.10,metalness:0,
    transmission:.76,thickness:.024,ior:1.46,clearcoat:.5,specularIntensity:.62,flatShading:true});
  for(const material of [emerald,jade,membrane,smoke,iris,quartz])material.userData.detailedMirror=true;
  const mouth=new THREE.MeshBasicMaterial({color:0x082217,side:THREE.DoubleSide});
  const coreMaterial=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true});
  const bones=restZ.map((z,i)=>{const bone=new THREE.Bone();bone.name=`Dragon route station ${i}`;bone.position.z=z;model.add(bone);return bone;});
  model.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();
  const bindSkinned=(g,material,name,isCore=false)=>{
    const object=new THREE.SkinnedMesh(g,material);object.name=name;object.frustumCulled=false;
    object.castShadow=!isCore;object.receiveShadow=!isCore;object.userData.insetCore=isCore;
    bodyRig.add(object);object.bind(skeleton,new THREE.Matrix4());return object;
  };
  const bodyShell=bindSkinned(torsoShell,emerald,'Dragon continuous faceted torso and tail');
  const bodyCore=bindSkinned(torsoCore,coreMaterial,'Dragon structured mint chest and belly core',true);
  const addCore=(parent,g,name)=>{const object=mesh(parent,g,coreMaterial,name);object.castShadow=false;object.receiveShadow=false;object.userData.insetCore=true;return object;};
  const headRig=new THREE.Group();headRig.name='Dragon rigid expressive head';bones[0].add(headRig);
  mesh(headRig,headGeometry,emerald,'Dragon broad sculpted brow and muzzle');
  mesh(headRig,accentGeometry,jade,'Dragon swept horns and cheek crystal ridges');
  mesh(headRig,eyeGeometry,smoke,'Dragon dark emerald almond eyes and nostrils');
  mesh(headRig,irisGeometry,iris,'Dragon quiet emerald iris rims');
  addCore(headRig,irisCrescentGeometry,'Dragon soft emerald iris crescents');
  mesh(headRig,glintGeometry,coreMaterial,'Dragon tiny eye catchlights');
  addCore(headRig,headCoreGeometry,'Dragon inset forehead muzzle and horn light');
  mesh(headRig,mouthGeometry,mouth,'Dragon recessed smiling oral cavity');
  mesh(headRig,upperTeethGeometry,quartz,'Dragon upper crystal canines');
  const jawGroup=new THREE.Group();jawGroup.name='Dragon smiling lower jaw hinge';jawGroup.position.copy(jawHinge);headRig.add(jawGroup);
  mesh(jawGroup,jawGeometry,jade,'Dragon swept faceted lower jaw');
  mesh(jawGroup,lowerTeethGeometry,quartz,'Dragon small lower crystal teeth');
  addCore(jawGroup,tongueGeometry,'Dragon warm golden green tongue and throat');

  const attachments=[],paws=[];
  for(const [i,part]of wingParts.entries()){
    const group=new THREE.Group();group.name=`Dragon ${i===0?'left':'right'} folded bat wing`;bones[part.boneIndex].add(group);
    mesh(group,part.shell,jade,'Dragon curved wing fingers');mesh(group,part.web,membrane,'Dragon scalloped crystal wing membrane');
    addCore(group,part.core,'Dragon inset wing spar light');attachments.push({object:group,boneIndex:part.boneIndex,restZ:part.restZ});
  }
  for(const [i,part]of limbParts.entries()){
    const group=new THREE.Group();group.name=`Dragon ${i<2?'front':'rear'} ${i%2===0?'left':'right'} tucked paw`;bones[part.boneIndex].add(group);
    mesh(group,part.shell,emerald,'Dragon folded limb and sculpted paw');mesh(group,part.toes,quartz,'Dragon delicate crystal toes');
    addCore(group,part.core,'Dragon inset paw light');paws.push(group);attachments.push({object:group,boneIndex:part.boneIndex,restZ:part.restZ});
  }
  const jawDriver=new THREE.Object3D();
  model.userData.jaw=jawDriver;model.userData.headRig=headRig;model.userData.bodyRig=bodyRig;model.userData.paws=paws;
  model.userData.applyPose=()=>{jawGroup.rotation.x=jawDriver.rotation.x*1.12;};
  model.userData.idleJaw=.052;model.userData.idleJawAmplitude=.007;
  model.userData.biteAnchor=[0,.36,.17];
  model.userData.getBiteAnchor=out=>{out.set(0,.36,.17);headRig.localToWorld(out);return model.worldToLocal(out);};
  const stationRadii=restZ.map(z=>{
    if(z>-.43)return z>-.30?.40:.33;
    let radius=profile(torsoProfile,z).rx;
    if(z>-.99&&z<-.48)radius=Math.max(radius,.39);
    if(z> -1.10&&z<-.81)radius=Math.max(radius,.36);
    return radius;
  });
  model.userData.dragonRig={bones,restZ:[...restZ],stationRadii,headRig,attachments,skeleton,bodyShell,bodyCore,
    poseConvention:'independent root-local absolute bone position and quaternion',noseZ:NOSE_Z,tailZ:TAIL_Z,
    headRadius:.560,headHalfWidth:.40};
  model.userData.modelVersion='crystal-dragon-v1';model.userData.finishVersion='sculpted-emerald-mint-gold-v1';
  model.userData.consumptionCenterY=.46;model.userData.nativeLength=4/2.1;
  model.updateMatrixWorld(true);skeleton.update();
  return {model,material:emerald,
    update(state){
      const shield=Boolean(state?.shield);
      emerald.emissiveIntensity=jade.emissiveIntensity=membrane.emissiveIntensity=shield?.15:.08;
      coreMaterial.color.setScalar(shield?1.10:1);
    },
    dispose(){for(const material of [emerald,jade,membrane,smoke,iris,quartz,mouth,coreMaterial])material.dispose();skeleton.dispose();}
  };
}
