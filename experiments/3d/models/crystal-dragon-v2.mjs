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
  {z:-.33,y:.405,rx:.125,ry:.132},{z:-.43,y:.391,rx:.131,ry:.148},
  {z:-.54,y:.369,rx:.204,ry:.203},{z:-.67,y:.357,rx:.256,ry:.226},
  {z:-.81,y:.351,rx:.263,ry:.220},{z:-.96,y:.341,rx:.206,ry:.174},{z:-1.08,y:.331,rx:.142,ry:.117},
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
    color.copy(emerald).lerp(mint,.12).lerp(warm,chest*.06).multiplyScalar((.31+chest*.16)*facet*pocket*tail);
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
// Narrow, saturated inclusions leave dark transparent space between them.
// A broad pastel core made every overlapping surface read as solid jade.
{
  const p=torsoCore.attributes.position,c=torsoCore.attributes.color;
  for(let i=0;i<p.count;i++){
    const section=profile(torsoProfile,p.getZ(i));
    p.setXYZ(i,p.getX(i)*.79,section.y+(p.getY(i)-section.y)*.81,p.getZ(i));
    c.setXYZ(i,c.getX(i)*.19,c.getY(i)*.53,c.getZ(i)*.35);
  }
  torsoCore.computeBoundingBox();torsoCore.computeBoundingSphere();
}

const skullStations=[
  {z:.247,y:.472,rx:.167,ry:.071},{z:.207,y:.487,rx:.202,ry:.084},
  {z:.112,y:.516,rx:.213,ry:.108},{z:-.005,y:.537,rx:.252,ry:.148},
  {z:-.140,y:.528,rx:.310,ry:.188},{z:-.266,y:.501,rx:.285,ry:.175},
  {z:-.357,y:.449,rx:.209,ry:.135},{z:-.435,y:.414,rx:.121,ry:.113}
];
function muzzlePoint(a,station){
  const exponent=lerp(.94,1.05,THREE.MathUtils.smoothstep(-station.z,-.225,.07));
  const sine=Math.sin(a),cosine=Math.cos(a);
  return [Math.sign(sine)*Math.abs(sine)**exponent*station.rx,
    station.y+Math.sign(cosine)*Math.abs(cosine)**exponent*station.ry,station.z];
}
function noseFacade(side){
  const outline=Array.from({length:20},(_,i)=>{
    const a=i*Math.PI*2/20;return new THREE.Vector2(side*.116+Math.cos(a)*.068,.493+Math.sin(a)*.053);
  });
  const holes=[Array.from({length:14},(_,i)=>{
    const a=i*Math.PI*2/14;return new THREE.Vector2(side*.121+Math.cos(a)*.029,.504+Math.sin(a)*.019);
  })];
  const triangles=THREE.ShapeUtils.triangulateShape(outline,holes),points=[...outline,...holes.flat()],positions=[],indices=triangles.flat();
  for(const p of points)positions.push(p.x,p.y,NOSE_Z);
  const g=geometry(positions,indices);
  if(g.attributes.normal.getZ(0)<0){for(let i=0;i<g.index.count;i+=3){const a=g.index.array[i+1];g.index.array[i+1]=g.index.array[i+2];g.index.array[i+2]=a;}g.computeVertexNormals();}
  return g;
}
const headParts=[loft(skullStations,{sides:18,openAngle:2.01,caps:false,shape:(p,a,s)=>muzzlePoint(a,s)}),
  loft([skullStations[0],{z:.246,y:.472,rx:.166,ry:.070}],{sides:18})];
const headAccents=[],horns=[],hornCores=[],eyeParts=[],irisParts=[],irisCrescents=[],glints=[];
for(const side of [-1,1]){
  headParts.push(loft([{z:NOSE_Z,x:side*.116,y:.493,rx:.068,ry:.053},
    {z:.231,x:side*.116,y:.500,rx:.078,ry:.067},{z:.176,x:side*.114,y:.507,rx:.071,ry:.060},
    {z:.119,x:side*.107,y:.518,rx:.041,ry:.026}],{sides:12,caps:false}),noseFacade(side));
  headAccents.push(sweep([[side*.119,.592,.077],[side*.214,.669,.008],[side*.293,.655,-.114],[side*.281,.543,-.237]],
    [.023,.047,.048,.023],{sides:9,steps:12,ellipse:.72}));
  headAccents.push(sweep([[side*.171,.415,.183],[side*.245,.401,.039],[side*.310,.425,-.092],[side*.293,.484,-.224]],
    [.016,.029,.048,.030],{sides:9,steps:12,ellipse:.68}));
  const hornPath=[[side*.201,.637,-.249],[side*.218,.710,-.302],[side*.252,.777,-.382],[side*.270,.811,-.474],[side*.246,.842,-.570]];
  horns.push(sweep(hornPath,[.064,.057,.039,.021,.001],{sides:7,steps:9,ellipse:.72}));
  hornCores.push(tint(sweep(hornPath,[.016,.018,.012,.008,.001],{sides:6,steps:9,ellipse:.7}),0x40eb97,1.1,(x,y,z,n)=>.18+.82*Math.max(0,n)));
  const center=[side*.246,.552,-.020],normal=[side*.61,.13,.78];
  eyeParts.push(lens(center,normal,.110,.124,.054));
  // A dark pupil remains large; only the outer iris is quietly luminous jade.
  irisParts.push(tint(lens([center[0]+side*.004,center[1],center[2]+.009],normal,.103,.117,.057,{inner:.57,rings:3}),0xffffff,1,(x,y)=>.50+.50*clamp((.61-y)/.13,0,1)));
  const eyeRotation=new THREE.Quaternion().setFromUnitVectors(vec(0,0,1),new THREE.Vector3(...normal).normalize());
  const eyePoint=(x,y,z)=>vec(x,y,z).applyQuaternion(eyeRotation).add(new THREE.Vector3(...center)).toArray();
  glints.push(tint(lens(eyePoint(-.027,.035,.064),normal,.010,.013,.003,{sides:16,rings:3}),0xf6efce,1));
  glints.push(tint(lens(eyePoint(.025,-.020,.064),normal,.004,.005,.002,{sides:12,rings:2}),0xcbe6da,.65));
  const crescentPositions=[],crescentIndices=[],crescentColors=[];
  for(let ring=0;ring<=2;ring++)for(let i=0;i<=12;i++){
    const t=i/12,a=-1.55+t*2.10,r=.71+ring*.105,x=Math.cos(a)*.095*r,y=Math.sin(a)*.113*r*(.86+.14*Math.abs(Math.cos(a)));
    crescentPositions.push(...eyePoint(x,y,.067*Math.sqrt(1-r*r)+.008));
    const edge=(ring===1?1:.28)*Math.sin(Math.PI*t)**.7,c=new THREE.Color(0x69e49a).multiplyScalar(edge*.75);
    crescentColors.push(c.r,c.g,c.b);
  }
  for(let ring=0;ring<2;ring++)for(let i=0;i<12;i++){const a=ring*13+i,b=a+1,c=a+13; crescentIndices.push(a,c,b,b,c,c+1);}
  irisCrescents.push(geometry(crescentPositions,crescentIndices,crescentColors));
  eyeParts.push(lens([side*.121,.504,.262],[0,0,1],.029,.019,.003,{sides:20,rings:3}));
}
headAccents.push(loft([{z:.176,y:.563,rx:.040,ry:.009},{z:.040,y:.643,rx:.069,ry:.012},{z:-.14,y:.711,rx:.072,ry:.015},{z:-.27,y:.667,rx:.048,ry:.012}],{sides:7}));
const headGeometry=merge(headParts),accentGeometry=merge([...headAccents,...horns]);
const eyeGeometry=merge(eyeParts),irisGeometry=merge(irisParts),irisCrescentGeometry=merge(irisCrescents),glintGeometry=merge(glints);
const headCoreGeometry=merge([
  innerShard([0,.573,-.159],[.115,.042,.129],0x1cb965,.50,[.04,.10,.06],2),
  innerShard([0,.635,-.232],[.071,.028,.059],0x39e884,.65,[.2,.2,.3],4),
  innerShard([-.095,.575,-.102],[.042,.026,.069],0x35df82,.62,[.1,.5,.4],6),
  innerShard([.093,.579,-.087],[.039,.028,.064],0x53f29c,.62,[-.2,-.4,-.3],10),
  innerShard([0,.503,.151],[.061,.021,.043],0x35d772,.40,[0,.04,0],14),
  ...[-1,1].map(side=>innerShard([side*.269,.438,-.112],[.021,.023,.041],0x36e184,.68,[.1,side*.15,side*.4],23+(side+1))),
  ...hornCores
]);

const jawHinge=vec(0,.399,-.221);
const jawGeometry=loft([
  {z:.252,y:.285,rx:.079,ry:.021},{z:.213,y:.274,rx:.146,ry:.026},{z:.073,y:.282,rx:.198,ry:.033},
  {z:-.078,y:.309,rx:.220,ry:.036},{z:-.195,y:.366,rx:.160,ry:.033},{z:-.24,y:.388,rx:.082,ry:.025}
],{sides:18}).translate(0,-jawHinge.y,-jawHinge.z);
// Only the back of the cavity is opaque. The old complete black tube put
// an opaque roof in front of the tongue, hiding all the warm inner light.
const mouthGeometry=lens([0,.403,-.214],[0,0,1],.180,.108,.008,{sides:24,rings:5});
const throatGeometry=lens([0,.407,-.199],[0,.18,1],.105,.077,.014,{sides:18,rings:5});
{
  const p=throatGeometry.attributes.position,colors=[],gold=new THREE.Color(0xffc555),amber=new THREE.Color(0x825c13),color=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const r=clamp(Math.hypot(p.getX(i)/.105,(p.getY(i)-.407)/.077),0,1);
    color.copy(gold).lerp(amber,r*r).multiplyScalar(.37+1.75*(1-r)**1.4);colors.push(color.r,color.g,color.b);
  }
  throatGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
}
const tongueGeometry=loft([
  {z:.168,y:.307,rx:.044,ry:.009},{z:.067,y:.318,rx:.092,ry:.014},{z:-.064,y:.345,rx:.092,ry:.023},{z:-.175,y:.389,rx:.058,ry:.029}
],{sides:10});
{
  const p=tongueGeometry.attributes.position,n=tongueGeometry.attributes.normal,colors=[];
  const quiet=new THREE.Color(0x7e6b20),warm=new THREE.Color(0xffc961),color=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const recess=THREE.MathUtils.smoothstep(-p.getZ(i),-.12,.17),facet=.45+.55*Math.max(0,n.getY(i));
    color.copy(quiet).lerp(warm,recess).multiplyScalar((.44+recess*1.5)*facet);colors.push(color.r,color.g,color.b);
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
  const root=[side*.172,.455,-.595];
  const fingers=[
    [root,[side*.271,.585,-.706],[side*.349,.583,-.931]],
    [root,[side*.330,.479,-.782],[side*.389,.407,-.956]],
    [root,[side*.269,.397,-.879],[side*.305,.331,-1.076]]
  ];
  const curves=fingers.map(points=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal'));
  const webs=[],ribs=[];
  for(let f=0;f<2;f++){
    const positions=[],indices=[],rows=12,cols=7;
    for(let r=0;r<=rows;r++)for(let c=0;c<=cols;c++){
      const u=r/rows,v=c/cols,scallop=1-.26*Math.sin(Math.PI*v)*u*u;
      const a=curves[f].getPoint(u*scallop),b=curves[f+1].getPoint(u*scallop),p=a.lerp(b,v);
      p.x+=side*.011*Math.sin(Math.PI*v)*Math.sin(Math.PI*u);positions.push(p.x,p.y,p.z);
    }
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const a=r*(cols+1)+c,b=a+1,d=a+cols+1;indices.push(a,b,d,b,d+1,d);
    }
    const web=geometry(positions,indices);
    if(side<0){const array=web.index.array;for(let i=0;i<array.length;i+=3)[array[i+1],array[i+2]]=[array[i+2],array[i+1]];web.computeVertexNormals();}
    webs.push(web);
  }
  for(let f=0;f<fingers.length;f++)ribs.push(sweep(fingers[f],[.025,f===0?.020:.012,.001],{sides:7,steps:12,ellipse:.78}));
  const glow=tint(sweep(fingers[0],[.005,.004,.001],{sides:6,steps:12}),0x3ce992,.86);
  return {shell:merge(ribs),web:merge(webs),core:glow,z:-.81};
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
  for(const digit of [-1.5,-.5,.5,1.5])toes.push(sweep([[x+digit*.027,y-.007,z+.126],[x+digit*.026,y-.037,z+.165],[x+digit*.024,y-.058,z+.184-Math.abs(digit)*.008]], [.015,.012,.001],{sides:7,steps:7,ellipse:.78}));
  const core=tint(sweep([shoulder,elbow,wrist],[.014,.012,.010],{sides:7,steps:12,ellipse:.75}),0x31e080,.72);
  return {shell,toes:merge(toes),core,z,pivot:shoulder,side,front};
}
const wingParts=[wing(-1),wing(1)],limbParts=[limb(-1,true),limb(1,true),limb(-1,false),limb(1,false)];
// Attachment geometry is localized once to its rest bone, never cloned in an
// animation frame. Head/jaw stay rigid while the continuous body can bend.
function localize(parts){
  for(const part of parts){
    part.boneIndex=Math.round(part.z/TAIL_Z*(BONE_COUNT-1));part.restZ=restZ[part.boneIndex];
    const pivot=part.pivot??[0,0,part.restZ];
    for(const key of ['shell','web','toes','core'])part[key]?.translate(-pivot[0],-pivot[1],-pivot[2]);
  }
}
localize(wingParts);localize(limbParts);

function glass(color,{thickness=.10,transmission=.96,roughness=.045}={}){
  const tint=new THREE.Color(color),material=new THREE.MeshPhysicalMaterial({
    color:tint.clone(),emissive:tint,emissiveIntensity:.13,
    transmission,thickness,ior:1.47,attenuationColor:new THREE.Color(0x16a75c),attenuationDistance:1.75,
    roughness,metalness:0,clearcoat:.65,clearcoatRoughness:.045,
    envMapIntensity:.62,specularIntensity:.72,specularColor:0xc5f7db,
    vertexColors:true,flatShading:true
  });
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      vec3 dragonView=isOrthographic?vec3(0.,0.,1.):normalize(vViewPosition);
      float dragonEdge=pow(1.-abs(dot(normalize(normal),dragonView)),2.);
      totalEmissiveRadiance *= .075 + dragonEdge * 1.25;
    `);
  };
  material.customProgramCacheKey=()=> 'crystal-dragon-emerald-v2';return material;
}
function mesh(parent,g,material,name){
  const object=new THREE.Mesh(g,material);object.name=name;object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
}

export function createCrystalDragon(){
  const model=new THREE.Group();model.name='Sculpted emerald baby dragon';
  const bodyRig=new THREE.Group();bodyRig.name='Dragon skinned body rig';model.add(bodyRig);
  const emerald=glass(0x39c982),jade=glass(0x54e79a,{thickness:.045,transmission:.97});
  emerald.name='Faceted deep emerald dragon glass';jade.name='Swept jade horns and facial ridges';
  const membrane=glass(0x22b970,{thickness:.018,transmission:.97,roughness:.055});membrane.side=THREE.DoubleSide;
  const smoke=new THREE.MeshPhysicalMaterial({color:0x03170c,roughness:.085,metalness:0,
    transmission:.02,thickness:.025,ior:1.47,clearcoat:.9,clearcoatRoughness:.045,specularIntensity:.8});
  const iris=new THREE.MeshPhysicalMaterial({color:0x48ca7b,emissive:0x27b86c,emissiveIntensity:.35,
    roughness:.11,metalness:0,transmission:.07,thickness:.019,ior:1.45,clearcoat:.7,clearcoatRoughness:.07,
    vertexColors:true,specularIntensity:.65});
  const quartz=new THREE.MeshPhysicalMaterial({color:0xd5eab3,roughness:.085,metalness:0,
    transmission:.76,thickness:.024,ior:1.46,clearcoat:.5,specularIntensity:.62,flatShading:true});
  for(const material of [emerald,jade,membrane,smoke,iris,quartz])material.userData.detailedMirror=true;
  const mouth=new THREE.MeshBasicMaterial({color:0x102519,side:THREE.DoubleSide});
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
  addCore(headRig,throatGeometry,'Dragon warm golden throat inside the mouth');
  mesh(headRig,upperTeethGeometry,quartz,'Dragon upper crystal canines');
  const jawGroup=new THREE.Group();jawGroup.name='Dragon smiling lower jaw hinge';jawGroup.position.copy(jawHinge);headRig.add(jawGroup);
  mesh(jawGroup,jawGeometry,jade,'Dragon swept faceted lower jaw');
  mesh(jawGroup,lowerTeethGeometry,quartz,'Dragon small lower crystal teeth');
  addCore(jawGroup,tongueGeometry,'Dragon warm golden green tongue and throat');

  const attachments=[],paws=[],paddlePaws=[];
  for(const [i,part]of wingParts.entries()){
    const group=new THREE.Group();group.name=`Dragon ${i===0?'left':'right'} folded bat wing`;bones[part.boneIndex].add(group);
    mesh(group,part.shell,jade,'Dragon curved wing fingers');mesh(group,part.web,membrane,'Dragon scalloped crystal wing membrane');
    addCore(group,part.core,'Dragon inset wing spar light');attachments.push({object:group,boneIndex:part.boneIndex,restZ:part.restZ});
  }
  for(const [i,part]of limbParts.entries()){
    const group=new THREE.Group();group.name=`Dragon ${i<2?'front':'rear'} ${i%2===0?'left':'right'} tucked paw`;bones[part.boneIndex].add(group);
    group.position.set(part.pivot[0],part.pivot[1],part.pivot[2]-part.restZ);
    mesh(group,part.shell,emerald,'Dragon folded limb and sculpted paw');mesh(group,part.toes,quartz,'Dragon delicate crystal toes');
    addCore(group,part.core,'Dragon inset paw light');paws.push(group);attachments.push({object:group,boneIndex:part.boneIndex,restZ:part.restZ});
    paddlePaws.push({pivot:group,side:part.side,front:part.front,restQuaternion:group.quaternion.clone(),restPosition:group.position.clone()});
  }
  const jawDriver=new THREE.Object3D();
  model.userData.jaw=jawDriver;model.userData.headRig=headRig;model.userData.bodyRig=bodyRig;model.userData.paws=paws;
  model.userData.paddleRig={paws:paddlePaws,maxAngleX:.20,maxAngleZ:.035};
  model.userData.applyPose=()=>{jawGroup.rotation.x=jawDriver.rotation.x*1.12;};
  model.userData.idleJaw=.052;model.userData.idleJawAmplitude=.007;
  model.userData.biteAnchor=[0,.36,.17];
  model.userData.getBiteAnchor=out=>{out.set(0,.36,.17);headRig.localToWorld(out);return model.worldToLocal(out);};
  const stationRadii=restZ.map(z=>{
    if(z>-.43)return z>-.30?.40:.33;
    let radius=profile(torsoProfile,z).rx;
    if(z>-.99&&z<-.48)radius=Math.max(radius,.43);
    if(z> -1.10&&z<-.81)radius=Math.max(radius,.43);
    return radius;
  });
  model.userData.dragonRig={bones,restZ:[...restZ],stationRadii,headRig,attachments,skeleton,bodyShell,bodyCore,
    poseConvention:'independent root-local absolute bone position and quaternion',noseZ:NOSE_Z,tailZ:TAIL_Z,
    headRadius:.560,headHalfWidth:.40};
  model.userData.modelVersion='crystal-dragon-v2';model.userData.finishVersion='sculpted-deep-emerald-gold-v2';
  model.userData.consumptionCenterY=.46;model.userData.nativeLength=4/2.1;
  model.updateMatrixWorld(true);skeleton.update();
  return {model,material:emerald,
    update(state){
      const shield=Boolean(state?.shield);
      emerald.emissiveIntensity=jade.emissiveIntensity=membrane.emissiveIntensity=shield?.20:.13;
      coreMaterial.color.setScalar(shield?1.10:1);
    },
    dispose(){for(const material of [emerald,jade,membrane,smoke,iris,quartz,mouth,coreMaterial])material.dispose();skeleton.dispose();}
  };
}
