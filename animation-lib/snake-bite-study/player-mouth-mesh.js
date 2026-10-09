// Paired landmarks in the ORIGINAL 160px open/closed atlas cells. These are
// anatomical correspondences, not a deformation of the open image alone.
// The image renderer must sample BOTH sources through this shared topology.
const SIZE=160;
const cage=[];
for(let x=0;x<=SIZE;x+=40)cage.push([x,0,x,0,'frame']);
for(let y=40;y<=SIZE;y+=40)cage.push([SIZE,y,SIZE,y,'frame']);
for(let x=120;x>=0;x-=40)cage.push([x,SIZE,x,SIZE,'frame']);
for(let y=120;y>0;y-=40)cage.push([0,y,0,y,'frame']);

// [openX, openY, closedX, closedY, anatomical label]. Upper landmarks move
// only with the small differences already present in the authored endpoints.
// The authored closed mouth retains a slit; no synthetic sealed mouth is used.
const right=[
  [75,11,75,11,'cap crown'],[29,22,29,22,'cap upper rear'],
  [12,49,12,49,'cap rear'],[14,88,15,88,'cap lower rear'],
  [105,15,107,15,'cap upper front'],[64,35,65,35,'cap highlight'],
  [111,26,113,27,'eye upper rear'],[123,26,125,27,'eye upper front'],
  [111,47,113,48,'eye lower rear'],[123,47,125,48,'eye lower front'],
  [118,61,120,61,'eye base'],
  [30,91,30,91,'upper lip rear'],[54,76,54,76,'upper lip rise'],
  [85,68,86,68,'upper lip crest'],[124,69,125,69,'upper lip front crest'],
  [145,73,146,73,'upper lip tip upper'],[150,81,151,81,'upper lip tip'],
  [146,90,147,90,'upper lip tip lower'],
  [78,94,78,94,'mouth upper hinge'],[94,92,94,94,'mouth roof rear'],
  [122,92,122,94,'mouth roof front'],[142,94,142,95,'mouth front roof'],
  // Measured white clusters plus a one-pixel border. The original closed
  // teeth really sit 1-2px lower; registering that shift avoids double edges.
  [95,92,95,94,'rear tooth upper left'],[111,92,110,94,'rear tooth upper right'],
  [95,103,95,105,'rear tooth lower left'],[111,103,110,105,'rear tooth lower right'],
  [128,93,128,94,'front tooth upper left'],[136,93,136,94,'front tooth upper right'],
  [128,103,128,105,'front tooth lower left'],[136,103,136,105,'front tooth lower right'],
  [75,105,74,103,'mouth rear hinge'],[76,114,75,107,'inner lower lip hinge'],
  [83,122,82,111,'inner lower lip rear'],[98,128,99,114,'inner lower lip middle'],
  [116,132,123,115,'inner lower lip front'],[126,134,137,115,'inner lower lip tip'],
  [101,116,102,109,'cavity rear'],[121,115,126,107,'cavity front'],
  [88,130,93,116,'lower lip rear highlight'],[112,136,124,120,'lower lip front highlight'],
  [132,138,144,120,'outer lower lip tip'],[126,146,137,130,'outer jaw front'],
  [102,147,110,142,'outer chin front'],[77,148,77,147,'outer chin center'],
  [47,145,47,144,'outer chin rear'],[26,138,26,138,'rear chin curve'],
  [17,122,17,122,'outer cheek rear'],[16,108,15,109,'outer cheek hinge'],
  [46,113,45,116,'cheek middle'],[56,132,56,134,'cheek lower'],
];

const down=[
  [80,10,80,10,'cap crown'],[37,15,37,16,'cap upper left'],
  [17,30,17,30,'cap left'],[11,58,11,58,'cap lower left'],
  [123,15,123,16,'cap upper right'],[143,30,143,30,'cap right'],
  [149,58,149,58,'cap lower right'],[80,37,80,37,'cap highlight'],
  [43,31,43,31,'left eye upper left'],[59,31,59,31,'left eye upper right'],
  [43,52,43,52,'left eye lower left'],[59,52,59,52,'left eye lower right'],
  [96,31,96,31,'right eye upper left'],[112,31,112,31,'right eye upper right'],
  [96,52,96,52,'right eye lower left'],[112,52,112,52,'right eye lower right'],
  [17,83,17,83,'upper lip outer left'],[40,72,40,72,'upper lip left rise'],
  [80,68,80,69,'upper lip crest'],[120,72,120,72,'upper lip right rise'],
  [143,83,143,83,'upper lip outer right'],
  [38,95,40,95,'inner upper lip left'],[78,91,78,93,'mouth roof'],
  [122,95,120,95,'inner upper lip right'],
  [53,91,53,93,'left tooth upper left'],[68,91,69,93,'left tooth upper right'],
  [53,103,53,104,'left tooth lower left'],[68,103,69,104,'left tooth lower right'],
  [90,91,90,93,'right tooth upper left'],[106,91,106,93,'right tooth upper right'],
  [90,103,90,104,'right tooth lower left'],[106,103,106,104,'right tooth lower right'],
  [33,109,33,108,'left mouth corner'],[127,109,127,108,'right mouth corner'],
  [35,121,35,110,'inner lower lip left rise'],[45,128,45,113,'inner lower lip left'],
  [80,130,80,114,'inner lower lip center'],[115,128,115,113,'inner lower lip right'],
  [125,121,125,110,'inner lower lip right rise'],
  [65,115,65,109,'cavity left'],[95,115,95,109,'cavity right'],
  [30,128,30,117,'lower lip left corner'],[50,136,50,122,'lower lip left highlight'],
  [80,139,80,125,'lower lip center highlight'],[110,136,110,122,'lower lip right highlight'],
  [130,128,130,117,'lower lip right corner'],
  [9,110,9,110,'outer left cheek'],[151,110,151,110,'outer right cheek'],
  [12,129,12,129,'outer lower left cheek'],[148,129,148,129,'outer lower right cheek'],
  [23,140,23,140,'outer left chin'],[45,147,45,147,'outer lower left chin'],
  [80,149,80,149,'outer center chin'],[115,147,115,147,'outer lower right chin'],
  [137,140,137,140,'outer right chin'],
];

function area(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function insideCircle(p,a,b,c){
  const ax=a[0]-p[0],ay=a[1]-p[1],bx=b[0]-p[0],by=b[1]-p[1],cx=c[0]-p[0],cy=c[1]-p[1];
  return (ax*ax+ay*ay)*(bx*cy-by*cx)-(bx*bx+by*by)*(ax*cy-ay*cx)+
    (cx*cx+cy*cy)*(ax*by-ay*bx)>1e-7;
}

// Deterministic Bowyer-Watson triangulation at the paired landmarks' means.
// Source and destination keep this topology for every interpolated pose.
function triangulate(points){
  const n=points.length,p=[...points,[-640,-640],[800,-640],[80,800]];
  let triangles=[[n,n+1,n+2]];
  for(let index=0;index<n;index++){
    const edges=new Map(),kept=[];
    for(const triangle of triangles){
      const [a,b,c]=triangle;
      if(!insideCircle(p[index],p[a],p[b],p[c])){kept.push(triangle);continue;}
      for(const [u,v] of [[a,b],[b,c],[c,a]]){
        const key=u<v?`${u},${v}`:`${v},${u}`;
        if(edges.has(key))edges.delete(key);else edges.set(key,[u,v]);
      }
    }
    for(const [a,b] of edges.values()){
      const signed=area(p[a],p[b],p[index]);
      if(Math.abs(signed)>1e-9)kept.push(signed>0?[a,b,index]:[b,a,index]);
    }
    triangles=kept;
  }
  return triangles.filter(triangle=>triangle.every(index=>index<n));
}

function build(landmarks){
  const pairs=[...cage,...landmarks];
  const open=pairs.map(point=>point.slice(0,2)),closed=pairs.map(point=>point.slice(2,4));
  const triangles=triangulate(open.map((point,index)=>point.map((v,axis)=>(v+closed[index][axis])/2)));
  // Signed triangle area is a quadratic in blend. Check its analytic minimum
  // over the WHOLE interval, not merely the cached frame positions.
  for(const triangle of triangles){
    const at=t=>{const p=triangle.map(index=>open[index].map((v,axis)=>v+(closed[index][axis]-v)*t));return area(...p);};
    const a0=at(0),am=at(.5),a1=at(1),q2=2*(a1+a0-2*am),q1=a1-a0-q2;
    const t=q2>0?-q1/(2*q2):0;
    const minimum=Math.min(a0,a1,t>0&&t<1?at(t):Infinity);
    if(minimum<=1e-7)throw Error(`Folded player mouth mesh: ${triangle.map(i=>pairs[i][4]).join(' / ')}`);
  }
  return Object.freeze({open:Object.freeze(open.map(Object.freeze)),
    closed:Object.freeze(closed.map(Object.freeze)),triangles:Object.freeze(triangles.map(Object.freeze))});
}

// Correspondence geometry reflects the own authored left-facing cells, whose
// open silhouette is about one pixel offset from the closed silhouette. The
// renderer still samples x=1600 / x=1920, NEVER mirrored right-face pixels.
const left=right.map(([x,y,cx,cy,label])=>{
  let closedX=160-cx;
  // The own left-facing closed atlas is not a perfect reflected right cell:
  // measured rear cluster is50..64 and front cluster24..30 (one-pixel border).
  if(label.startsWith('front tooth')||label==='rear tooth upper right'||
    label==='rear tooth lower right')closedX--;
  return [159-x,y,closedX,cy,label];
});
const up=Object.freeze({open:Object.freeze([[0,0],[160,0],[160,160],[0,160]].map(Object.freeze)),
  closed:Object.freeze([[0,0],[160,0],[160,160],[0,160]].map(Object.freeze)),
  triangles:Object.freeze([[0,1,2],[0,2,3]].map(Object.freeze))});
const meshes=Object.freeze([build(right),build(down),build(left),up]);

export function getPlayerMouthMesh(bank){
  if(!Number.isInteger(bank)||bank<0||bank>3)throw Error('Invalid player mouth bank');
  return meshes[bank];
}
