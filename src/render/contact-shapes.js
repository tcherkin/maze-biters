// Preparation-only alpha contour extraction; frame-time work is just point
// transforms. Pixel centers are interpolated at the visible alpha threshold,
// so these are sprite boundaries, not inflated tile rectangles or convex hulls.
const CASES=[[],[[3,0]],[[0,1]],[[3,1]],[[1,2]],[[3,0],[1,2]],[[0,2]],[[3,2]],
  [[2,3]],[[2,0]],[[0,1],[2,3]],[[2,1]],[[1,3]],[[1,0]],[[0,3]],[]];
const area=points=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0)/2;
function inside(point,polygon){let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)result=!result;
}return result;}
function distanceSquared(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy;
  const u=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;return (p.x-a.x-u*dx)**2+(p.y-a.y-u*dy)**2;}
function simplifyOpen(points,tolerance){if(points.length<3)return points;
  const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;const stack=[0,points.length-1],limit=tolerance*tolerance;
  while(stack.length){const end=stack.pop(),start=stack.pop();let best=limit,index=-1;
    for(let i=start+1;i<end;i++){const d=distanceSquared(points[i],points[start],points[end]);if(d>best){best=d;index=i;}}
    if(index>=0){keep[index]=1;stack.push(start,index,index,end);}}
  return points.filter((p,i)=>keep[i]);}
export function simplifyContactContour(points,tolerance=.25){if(points.length<=3||!(tolerance>0))return points.slice();
  let split=1,best=0;for(let i=1;i<points.length;i++){const d=(points[i].x-points[0].x)**2+(points[i].y-points[0].y)**2;if(d>best){best=d;split=i;}}
  const a=simplifyOpen(points.slice(0,split+1),tolerance),b=simplifyOpen([...points.slice(split),points[0]],tolerance);
  const result=[...a.slice(0,-1),...b.slice(0,-1)];return result.length>=3?result:points.slice();}

// Optional frame-time contour reduction using PREALLOCATED scratch storage.
// Useful after deforming a source outline across many renderer triangles.
export function simplifyContactPolygon(part,tolerance,scratch){
  const points=part.points,n=points.length;if(n<=4)return part;
  const {keep,stack}=scratch;if(keep.length<n||stack.length<n*4)throw new RangeError('Contact simplification scratch too small');
  keep.fill(0,0,n);let split=1,best=0;
  for(let i=1;i<n;i++){const d=(points[i].x-points[0].x)**2+(points[i].y-points[0].y)**2;if(d>best){best=d;split=i;}}
  keep[0]=keep[split]=1;let count=4;stack[0]=0;stack[1]=split;stack[2]=split;stack[3]=n;
  const limit=tolerance*tolerance;
  while(count){const end=stack[--count],start=stack[--count];let max=limit,index=-1;
    for(let i=start+1;i<end;i++){const d=distanceSquared(points[i%n],points[start%n],points[end%n]);if(d>max){max=d;index=i;}}
    if(index>=0){keep[index%n]=1;stack[count++]=start;stack[count++]=index;stack[count++]=index;stack[count++]=end;}
  }
  let kept=0;for(let i=0;i<n;i++)kept+=keep[i];if(kept<3)return part;
  let write=0;for(let i=0;i<n;i++)if(keep[i])points[write++]=points[i];points.length=write;return part;
}

// A hole is never filled by an outer silhouette. Only hole-bearing components
// are decomposed into disjoint vertical trapezoids, with collinear neighboring
// slabs merged. Ordinary heads/legs retain one inexpensive concave polygon.
function withoutHoles(rings){
  const xs=[...new Set(rings.flatMap(r=>r.map(p=>p.x)))].sort((a,b)=>a-b),result=[];
  const edges=rings.flatMap(r=>r.map((a,i)=>({a,b:r[(i+1)%r.length]}))).filter(e=>Math.abs(e.a.x-e.b.x)>1e-9);
  let previous=new Map();
  for(let n=0;n<xs.length-1;n++){
    const x0=xs[n],x1=xs[n+1];if(x1-x0<1e-8)continue;const middle=(x0+x1)/2;
    const crossing=edges.filter(e=>middle>Math.min(e.a.x,e.b.x)&&middle<Math.max(e.a.x,e.b.x)).map(e=>{
      const slope=(e.b.y-e.a.y)/(e.b.x-e.a.x),intercept=e.a.y-slope*e.a.x;return{slope,intercept,y:slope*middle+intercept};}).sort((a,b)=>a.y-b.y);
    const next=new Map();
    for(let i=0;i+1<crossing.length;i+=2){const top=crossing[i],bottom=crossing[i+1];
      const key=[top.slope,top.intercept,bottom.slope,bottom.intercept].map(v=>v.toFixed(7)).join(',');
      let polygon=previous.get(key);
      if(polygon){polygon[1].x=polygon[2].x=x1;polygon[1].y=top.slope*x1+top.intercept;polygon[2].y=bottom.slope*x1+bottom.intercept;}
      else{polygon=[{x:x0,y:top.slope*x0+top.intercept},{x:x1,y:top.slope*x1+top.intercept},
        {x:x1,y:bottom.slope*x1+bottom.intercept},{x:x0,y:bottom.slope*x0+bottom.intercept}];result.push(polygon);}
      next.set(key,polygon);
    }previous=next;
  }return result.filter(p=>Math.abs(area(p))>1e-8);
}

export function traceAlphaContours(raster,{threshold=32,tolerance=.25,minArea=.4,id='sprite'}={}){
  const {width,height,data}=raster||{};
  if(!(width>0&&height>0)||data?.length!==width*height*4)throw new TypeError('RGBA raster required for contact contours');
  const alpha=(x,y)=>x<0||y<0||x>=width||y>=height?0:data[(y*width+x)*4+3];
  const vertices=[],byEdge=new Map(),segments=[];
  function vertex(x,y,edge,values){
    const horizontal=edge===0||edge===2,xx=x+(edge===1?1:0),yy=y+(edge===2?1:0);
    const key=`${horizontal?'h':'v'}:${xx}:${yy}`;let index=byEdge.get(key);if(index!==undefined)return index;
    const ends=edge===0?[values[0],values[1]]:edge===1?[values[1],values[2]]:edge===2?[values[3],values[2]]:[values[0],values[3]];
    const t=(threshold-ends[0])/(ends[1]-ends[0]);index=vertices.length;
    vertices.push({x:Math.max(0,Math.min(width,xx+.5+(horizontal?t:0))),y:Math.max(0,Math.min(height,yy+.5+(horizontal?0:t))),edges:[]});byEdge.set(key,index);return index;
  }
  for(let y=-1;y<height;y++)for(let x=-1;x<width;x++){
    const values=[alpha(x,y),alpha(x+1,y),alpha(x+1,y+1),alpha(x,y+1)];
    const code=values.reduce((mask,a,i)=>mask|(a>=threshold?1<<i:0),0);
    for(const pair of CASES[code]){const a=vertex(x,y,pair[0],values),b=vertex(x,y,pair[1],values),index=segments.length;
      segments.push({a,b,seen:false});vertices[a].edges.push(index);vertices[b].edges.push(index);}
  }
  const rings=[];
  for(let start=0;start<segments.length;start++){
    if(segments[start].seen)continue;let edge=start,current=segments[start].a;const first=current,points=[];
    for(let guard=0;guard<=segments.length;guard++){
      const p=vertices[current];points.push({x:p.x,y:p.y});const segment=segments[edge];segment.seen=true;
      current=segment.a===current?segment.b:segment.a;if(current===first)break;
      edge=vertices[current].edges.find(index=>!segments[index].seen);if(edge===undefined)break;
    }
    if(points.length>=3&&Math.abs(area(points))>=minArea){const simplified=simplifyContactContour(points,tolerance);
      rings.push({points:simplified,area:Math.abs(area(simplified)),parent:-1,depth:0});}
  }
  rings.sort((a,b)=>b.area-a.area);
  for(let i=0;i<rings.length;i++)for(let j=i-1;j>=0;j--)if(inside(rings[i].points[0],rings[j].points)){
    rings[i].parent=j;rings[i].depth=rings[j].depth+1;break;
  }
  const polygons=[];let holes=0;
  for(let i=0;i<rings.length;i++){
    if(rings[i].depth&1){holes++;continue;}
    const children=rings.filter(r=>r.parent===i&&(r.depth&1));
    polygons.push(...(children.length?withoutHoles([rings[i].points,...children.map(r=>r.points)]):[rings[i].points]));
  }
  const parts=polygons.map((points,index)=>({id:`${id}:${index}`,kind:'polygon',points}));
  return {width,height,parts,stats:{threshold,tolerance,minArea,components:rings.filter(r=>!(r.depth&1)).length,holes,
    parts:parts.length,vertices:parts.reduce((sum,p)=>sum+p.points.length,0),maxVertices:Math.max(0,...parts.map(p=>p.points.length))}};
}

export function beginContactShape(out={}){out.parts??=[];out._pool??=[];out.parts.length=0;return out;}
export function appendContactPolygon(out,id,source,map,metadata=null){
  const index=out.parts.length,part=out._pool[index]??={id,kind:'polygon',points:[],_points:[]};out._pool[index]=part;
  part.id=id;part.kind='polygon';part.points.length=source.length;
  for(let i=0;i<source.length;i++){const p=part._points[i]??={x:0,y:0};part._points[i]=p;map(source[i],p,i);part.points[i]=p;}
  if(metadata){part.role=metadata.role;part.material=metadata.material;}else{delete part.role;delete part.material;}
  out.parts.push(part);return part;
}
export function transformContactShape(cached,matrix,out={}){
  beginContactShape(out);const {a=1,b=0,c=0,d=1,e=0,f=0}=matrix||{};
  for(const part of cached.parts)appendContactPolygon(out,part.id,part.points,(p,q)=>{q.x=a*p.x+c*p.y+e;q.y=b*p.x+d*p.y+f;},part);
  out.source=cached.stats;return out;
}

// One atlas pixel read, performed by preparation code only. Rectangles may be
// sprite descriptors or {x,y,width,height}; results keep source-local pixels.
export function prepareSpriteContours(image,rectangles,makeCanvas,options={}){
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  const surface=makeCanvas(width,height);surface.width=width;surface.height=height;
  try{const ctx=surface.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,width,height).data;
    return rectangles.map((rect,index)=>{const x=rect.sx??rect.x??0,y=rect.sy??rect.y??0,w=rect.sw??rect.width,h=rect.sh??rect.height;
      const data=new Uint8ClampedArray(w*h*4);for(let row=0;row<h;row++)data.set(rgba.subarray(((y+row)*width+x)*4,((y+row)*width+x+w)*4),row*w*4);
      return traceAlphaContours({width:w,height:h,data},{...options,id:`${options.id||'sprite'}-${index}`});});
  }finally{surface.width=surface.height=1;}
}

// Isolate every quantized-pose switch using a proven scalar Lipschitz bound,
// not a fixed time grid (which can miss a short excursion near an extremum).
// Call separately across analytic event/movement boundaries. The resulting
// switch times are isolated to timeTolerance, with no finite-speed fiction
// across an instantaneous cached-frame change.
export function quantizedContactBreakpoints(value,from,to,{levels=18,speedBound,timeTolerance=1e-5}={},out=[]){
  if(!(to>from)||!(speedBound>0))return out;
  if(!Number.isFinite(speedBound))throw new RangeError('Finite scalar speed bound required');
  const stack=[from,to],switches=[];let iterations=0;
  while(stack.length){
    if(++iterations>131072)throw new RangeError('Quantized contact root isolation exceeded its safety budget');
    const b=stack.pop(),a=stack.pop(),middle=(a+b)/2,q=value(middle)*levels;
    const nearest=Math.abs(q-(Math.floor(q)+.5))/levels;
    if(nearest>speedBound*(b-a)/2+1e-12)continue;
    if(b-a<=timeTolerance){switches.push([a,b]);continue;}
    stack.push(middle,b,a,middle);
  }
  switches.sort((a,b)=>a[0]-b[0]);
  // A conservative Lipschitz band can be wider than the true root near a
  // shallow extremum. Check each tiny isolated bracket, then choose its upper
  // crossing bound so sampling the stop observes the new cached pose.
  const frame=t=>Math.round(value(t)*levels);
  for(const [a,b]of switches){const middle=(a+b)/2;
    for(const pair of [[a,middle],[middle,b]]){let low=pair[0],high=pair[1];const before=frame(low);
      if(before===frame(high))continue;
      while(high-low>timeTolerance/8){const m=(low+high)/2;if(frame(m)===before)low=m;else high=m;}
      if(!out.length||high-out.at(-1)>timeTolerance/2)out.push(high);
    }
  }
  return out;
}
