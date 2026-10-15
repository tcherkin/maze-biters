// One shared triangulation for two complete drawings. Every accepted triangle
// has strictly positive signed area for the entire linear endpoint trajectory;
// endpoint coordinates are never changed or silently dropped to make it pass.
export const signedArea=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const EPS=1e-7;
const interpolate=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export function triangleMinimum(open,closed,triangle){
  const at=t=>signedArea(...triangle.map(i=>interpolate(open[i],closed[i],t)));
  const a0=at(0),a1=at(1),am=at(.5),q2=2*(a0+a1-2*am),q1=a1-a0-q2;
  const vertex=q2>0?-q1/(2*q2):-1;
  let minimum=Math.min(a0,a1),atTime=a0<=a1?0:1;
  if(vertex>0&&vertex<1){const av=at(vertex);if(av<minimum){minimum=av;atTime=vertex;}}
  return {minimum,atTime,openArea:a0,closedArea:a1,quadratic:[a0,q1,q2]};
}
function insideCircle(p,a,b,c){
  const ax=a[0]-p[0],ay=a[1]-p[1],bx=b[0]-p[0],by=b[1]-p[1],cx=c[0]-p[0],cy=c[1]-p[1];
  return (ax*ax+ay*ay)*(bx*cy-by*cx)-(bx*bx+by*by)*(ax*cy-ay*cx)+(cx*cx+cy*cy)*(ax*by-ay*bx)>1e-8;
}
function triangulate(points){
  const n=points.length,minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  const span=Math.max(maxX-minX,maxY-minY,1),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  const p=[...points,[cx-span*20,cy-span*10],[cx+span*20,cy-span*10],[cx,cy+span*20]];
  let triangles=[[n,n+1,n+2]];
  for(let i=0;i<n;i++){
    const edges=new Map(),keep=[];
    for(const tri of triangles){
      const [a,b,c]=tri;if(!insideCircle(p[i],p[a],p[b],p[c])){keep.push(tri);continue;}
      for(const [u,v]of [[a,b],[b,c],[c,a]]){
        const key=u<v?`${u},${v}`:`${v},${u}`;
        if(edges.has(key))edges.delete(key);else edges.set(key,[u,v]);
      }
    }
    for(const [a,b]of edges.values()){
      const area=signedArea(p[a],p[b],p[i]);if(Math.abs(area)>EPS)keep.push(area>0?[a,b,i]:[b,a,i]);
    }
    triangles=keep;
  }
  return triangles.filter(t=>t.every(i=>i<n));
}
function orient(triangle,points){return signedArea(...triangle.map(i=>points[i]))>0?triangle:[triangle[1],triangle[0],triangle[2]];}
const edgeKey=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
function edgesOf(triangles){
  const edges=new Map();
  triangles.forEach((t,i)=>{for(let k=0;k<3;k++){
    const a=t[k],b=t[(k+1)%3],key=edgeKey(a,b);if(!edges.has(key))edges.set(key,[]);
    edges.get(key).push({triangle:i,a,b,other:t[(k+2)%3]});
  }});return edges;
}
const quality=areas=>({bad:areas.filter(v=>v<=EPS).length,minimum:Math.min(...areas),penalty:areas.reduce((s,v)=>s+Math.max(0,EPS-v),0)});
function better(a,b){
  if(a.bad!==b.bad)return a.bad<b.bad;
  if(Math.abs(a.penalty-b.penalty)>1e-8)return a.penalty<b.penalty;
  return a.minimum>b.minimum+1e-8;
}
function repair(initial,open,closed,atSeed){
  let triangles=initial.map(t=>t.slice()),values=triangles.map(t=>triangleMinimum(open,closed,t).minimum),flips=0;
  const seen=new Set();
  for(let pass=0;pass<Math.max(100,triangles.length*8);pass++){
    if(values.every(v=>v>EPS))return {triangles,values,flips};
    let chosen=null;
    const edges=edgesOf(triangles);
    for(const adjacent of edges.values()){
      if(adjacent.length!==2)continue;
      const [a,b]=adjacent,indices=[a.triangle,b.triangle];
      if(indices.every(i=>values[i]>EPS))continue;
      // A diagonal flip is legal only inside a convex current quadrilateral.
      // The opposite vertices must straddle both old and proposed diagonals.
      const p=a.other,q=b.other,u=a.a,v=a.b;
      if(p===q||edges.has(edgeKey(p,q)))continue;
      if(signedArea(atSeed[u],atSeed[v],atSeed[p])*signedArea(atSeed[u],atSeed[v],atSeed[q])>=-EPS)continue;
      if(signedArea(atSeed[p],atSeed[q],atSeed[u])*signedArea(atSeed[p],atSeed[q],atSeed[v])>=-EPS)continue;
      const newTriangles=[orient([p,q,u],atSeed),orient([q,p,v],atSeed)];
      const newValues=newTriangles.map(t=>triangleMinimum(open,closed,t).minimum);
      const oldQ=quality(indices.map(i=>values[i])),newQ=quality(newValues);
      if(!better(newQ,oldQ))continue;
      const global=values.slice();indices.forEach((i,k)=>{global[i]=newValues[k];});
      const score=quality(global);
      if(!chosen||better(score,chosen.score))chosen={indices,newTriangles,newValues,score};
    }
    if(!chosen)break;
    chosen.indices.forEach((i,k)=>{triangles[i]=chosen.newTriangles[k];values[i]=chosen.newValues[k];});flips++;
    const signature=triangles.map(t=>t.slice().sort((a,b)=>a-b).join(',')).sort().join(';');
    if(seen.has(signature))break;seen.add(signature);
  }
  return {triangles,values,flips};
}
export function createPairedMesh(input){
  if(!Array.isArray(input)||input.length<3)throw Error('Paired mesh requires at least three endpoint pairs.');
  const pairs=input.map((p,i)=>{
    if(!Array.isArray(p)||p.length<4||!p.slice(0,4).every(Number.isFinite))throw Error(`Invalid paired landmark ${i}.`);
    return p.slice(0,4);
  });
  const open=pairs.map(p=>p.slice(0,2)),closed=pairs.map(p=>p.slice(2,4));
  for(const [name,points]of [['open',open],['closed',closed]]){
    const unique=new Set();points.forEach((p,i)=>{const key=p.join(',');if(unique.has(key))throw Error(`Duplicate ${name} landmark ${i}: ${key}`);unique.add(key);});
  }
  const attempts=[];let best=null;
  for(const seed of [.5,0,1,.25,.75,.125,.875,.375,.625]){
    const atSeed=open.map((p,i)=>interpolate(p,closed[i],seed));
    const candidate=repair(triangulate(atSeed),open,closed,atSeed);
    const used=new Set(candidate.triangles.flat()),score=quality(candidate.values);
    const item={seed,triangles:candidate.triangles.length,usedVertices:used.size,flips:candidate.flips,...score};attempts.push(item);
    if(!best||better(score,best.score))best={candidate,score,seed};
    if(!score.bad&&used.size===pairs.length){
      // Final analytic certification includes the exact internal extremum of
      // each area's quadratic, not only discrete animation frame samples.
      const bounds=candidate.triangles.map(t=>triangleMinimum(open,closed,t));
      if(bounds.some(b=>!(b.minimum>EPS)))throw Error('Internal paired mesh certification failed.');
      return {open,closed,pairs,triangles:candidate.triangles,minimum:score.minimum,
        certification:{method:'Exact quadratic signed-area minimum over closed interval [0,1]',epsilon:EPS,seed,
          flips:candidate.flips,allVerticesIncluded:true,attempts,bounds}};
    }
  }
  const bad=best.candidate.triangles.map((triangle,i)=>({triangle,landmarks:triangle.map(j=>pairs[j]),...triangleMinimum(open,closed,triangle)})).filter(t=>t.minimum<=EPS);
  const error=new Error(`No nonfolding common paired triangulation found: ${JSON.stringify({attempts,bad})}`);
  error.code='PAIRED_MESH_FOLD';error.details={attempts,bad};throw error;
}
