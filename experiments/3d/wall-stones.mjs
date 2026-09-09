import * as THREE from './vendor/three.module.min.js';
import {CELL_SIZE,WALL_WIDTH,WALL_HEIGHT} from './world.mjs';

const hash=(x,y=0)=>{let n=Math.imul(x+173,374761393)^Math.imul(y+37,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;};
const directions=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const palette=[0x22133e,0x281541,0x25123f,0x2c1747,0x201438,0x26123e].map(hex=>new THREE.Color(hex));
const neon=[0x5465ff,0x24dfff,0xef35ff].map(hex=>new THREE.Color(hex).multiplyScalar(1.16));
const point=(x,y,z)=>({x,y,z});
const octagon=(inset,cut,y)=>[
  point(-.5+inset+cut,y,-.5+inset),point(.5-inset-cut,y,-.5+inset),
  point(.5-inset,y,-.5+inset+cut),point(.5-inset,y,.5-inset-cut),
  point(.5-inset-cut,y,.5-inset),point(-.5+inset+cut,y,.5-inset),
  point(-.5+inset,y,.5-inset-cut),point(-.5+inset,y,-.5+inset+cut)
];

// Three carved profiles are plain CPU data, shared between builds. Only the
// final merged buffers belong to a maze, so disposing a level cannot destroy
// another scene's templates. Broad facets carry the shape, not surface noise.
const profiles=Array.from({length:3},(_,variant)=>{
  const plane=(x,z)=>.987-(variant===1?-.006:.007)*x-.004*z;
  const rings=[octagon(.025,.035,.014),octagon(.006,.035,.095),
    octagon(.006,.035,.897),octagon(.038,.052,.983)];
  rings[2].forEach((p,i)=>{p.y+=((i+variant*3)%5-2)*.004;});
  rings[3].forEach((p,i)=>{
    // Slightly unequal bevels retain broad planar faces instead of a regular
    // raised panel. Only the rare third profile has a small chipped corner.
    p.x+=p.x>0?-.004:.002;p.z+=p.z>0?-.002:.004;
    p.y=plane(p.x,p.z);
    if(variant===2&&i===4){p.x-=.012;p.z-=.014;p.y-=.011;}
  });
  const faces=[];
  for(let r=0;r<3;r++)for(let i=0;i<8;i++){
    const j=(i+1)%8;
    faces.push({points:[rings[r][i],rings[r+1][i],rings[r+1][j],rings[r][j]],tone:.95+(hash(i,r+variant)%9)*.012});
  }
  const crown=point(.025*(variant-1),0,-.02*variant);crown.y=plane(crown.x,crown.z);
  for(let i=0;i<8;i++)faces.push({points:[rings[3][i],crown,rings[3][(i+1)%8]],tone:1});
  const surfaces=faces.slice(16).flatMap(({points})=>points.length===3?[points]:
    [[points[0],points[1],points[2]],[points[0],points[2],points[3]]]);
  return {faces,surfaces};
});
function onSurface(rectangle,face){
  const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
  const sign=Math.sign(cross(...face));
  let polygon=rectangle;
  for(let i=0;i<3&&polygon.length;i++){
    const a=face[i],b=face[(i+1)%3],next=[];
    let previous=polygon.at(-1),pd=sign*cross(a,b,previous);
    for(const current of polygon){
      const cd=sign*cross(a,b,current);
      if((pd>=0)!==(cd>=0)){
        const t=pd/(pd-cd);
        next.push(point(previous.x+t*(current.x-previous.x),0,previous.z+t*(current.z-previous.z)));
      }
      if(cd>=0)next.push(current);
      previous=current;pd=cd;
    }
    polygon=next;
  }
  const [a,b,c]=face,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
  if(Math.abs(den)<1e-10)return [];
  return polygon.map(p=>{
    const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den;
    const v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den;
    return point(p.x,u*a.y+v*b.y+(1-u-v)*c.y,p.z);
  });
}
function buffer(){return {position:[],normal:[],color:[],uv:[]};}
function triangle(data,a,b,c,color,uvs=null){
  const ab=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),ac=new THREE.Vector3(c.x-a.x,c.y-a.y,c.z-a.z);
  const n=ab.cross(ac).normalize();
  [a,b,c].forEach((p,i)=>{
    data.position.push(p.x,p.y,p.z);data.normal.push(n.x,n.y,n.z);data.color.push(color.r,color.g,color.b);
    data.uv.push(...(uvs?.[i]||[p.x*.7,p.z*.7+p.y*.3]));
  });
}
function geometry(data){
  const result=new THREE.BufferGeometry();
  result.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));
  result.setAttribute('normal',new THREE.Float32BufferAttribute(data.normal,3));
  result.setAttribute('color',new THREE.Float32BufferAttribute(data.color,3));
  result.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));
  result.computeBoundingBox();result.computeBoundingSphere();return result;
}
function stoneTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const v=128+6*Math.sin(x*.09)*Math.cos(y*.11)+3*Math.sin(x*.27+y*.13)+(hash(x,y)%7)-3,i=(y*128+x)*4;
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;return texture;
}

// Node stones close ends, corners and junctions. Runs between them get broad,
// unequal-length blocks; the boundaries exactly tile the original wall union.
function blocksFor(maze,layout){
  const nodes=new Map(),blocks=[],used=new Set(),wall=(x,y)=>maze[y]?.[x]==='#';
  const key=(x,y)=>`${x},${y}`;
  maze.forEach((row,y)=>[...row].forEach((cell,x)=>{
    if(cell!=='#')return;
    const exits=directions.filter(d=>wall(x+d.x,y+d.y));
    const straight=exits.length===2&&exits[0].x===-exits[1].x&&exits[0].y===-exits[1].y;
    if(!straight){nodes.set(key(x,y),{x,y,exits});blocks.push({x:layout.x(x),z:layout.z(y),length:WALL_WIDTH,width:WALL_WIDTH,angle:0,seed:hash(x,y),kind:'node'});}
  }));
  for(const node of nodes.values())for(const d of node.exits){
    let x=node.x+d.x,y=node.y+d.y;
    while(!nodes.has(key(x,y))){x+=d.x;y+=d.y;}
    const edge=[key(node.x,node.y),key(x,y)].sort().join('|');if(used.has(edge))continue;used.add(edge);
    const length=Math.hypot(x-node.x,y-node.y)*CELL_SIZE-WALL_WIDTH;
    const seed=hash(node.x+x,node.y+y),count=Math.max(1,Math.round(length/2.10));
    const weights=Array.from({length:count},(_,i)=>.84+(hash(i,seed)%33)/100),sum=weights.reduce((a,b)=>a+b,0);
    let along=WALL_WIDTH/2;
    weights.forEach((weight,i)=>{
      const part=length*weight/sum;
      blocks.push({x:layout.x(node.x)+d.x*(along+part/2),z:layout.z(node.y)+d.y*(along+part/2),
        length:part,width:WALL_WIDTH,angle:d.x?0:Math.PI/2,seed:hash(i,seed),kind:'run'});
      along+=part;
    });
  }
  maze.forEach((row,y)=>[...row].forEach((cell,x)=>{
    if(cell==='#'&&wall(x+1,y)&&wall(x,y+1)&&wall(x+1,y+1))
      blocks.push({x:layout.x(x)+CELL_SIZE/2,z:layout.z(y)+CELL_SIZE/2,
        length:CELL_SIZE-WALL_WIDTH,width:CELL_SIZE-WALL_WIDTH,angle:0,seed:hash(x+47,y),kind:'infill'});
  }));
  return blocks;
}

export function addStoneWalls(group,maze,layout,bounds,glowTexture){
  const blocks=blocksFor(maze,layout),stone=buffer(),channels=buffer(),inlays=buffer(),spill=buffer();
  const inside=(x,z)=>bounds.some(b=>x>b.minX-1e-6&&x<b.maxX+1e-6&&z>b.minZ-1e-6&&z<b.maxZ+1e-6);
  for(const block of blocks){
    const variant=block.seed%13===0?2:block.seed%2,profile=profiles[variant],color=palette[block.seed%palette.length];block.variant=variant;
    const length=block.length-.012,width=block.width-.012,c=Math.cos(block.angle),s=Math.sin(block.angle);
    const world=p=>point(block.x+p.x*length*c+p.z*width*s,p.y*WALL_HEIGHT,block.z-p.x*length*s+p.z*width*c);
    for(const face of profile.faces){
      const vertices=face.points.map(world),shade=color.clone().multiplyScalar(face.tone);
      triangle(stone,...vertices.slice(0,3),shade);if(vertices.length===4)triangle(stone,vertices[0],vertices[2],vertices[3],shade);
    }
    for(const side of [-1,1])for(const axis of ['x','z']){
      const normal=axis==='x'?{x:side*c,z:-side*s}:{x:side*s,z:side*c};
      const half=axis==='x'?block.length/2:block.width/2;
      // Inlays belong only to exposed faces, never across an interior joint.
      if(inside(block.x+normal.x*(half+.004),block.z+normal.z*(half+.004)))continue;
      const span=axis==='x'?width:length,depth=axis==='x'?length:width;
      if(span<.36)continue;
      const edge=.5-.135/depth;
      const alongMargin=sign=>{
        const p=axis==='x'?world(point(side*edge,0,sign*(.5+.022/span))):world(point(sign*(.5+.022/span),0,side*edge));
        return inside(p.x,p.z)?.030:.135;
      };
      const from=-.5+alongMargin(-1)/span,to=.5-alongMargin(1)/span;
      const tint=neon[block.seed%17===0?2:block.seed%5===0?1:0];
      const patch=(target,thickness,offset,shade,glow=false)=>{
        // Clip to the actual top and bevel triangles. Matching only sampled
        // endpoints would bury the strip where it crosses a carved ridge.
        const rectangle=[[from,-thickness/2],[to,-thickness/2],[to,thickness/2],[from,thickness/2]].map(([along,across])=>{
          const x=axis==='x'?side*(edge+across/depth):along,z=axis==='x'?along:side*(edge+across/depth);
          return point(x,0,z);
        });
        for(const surface of profile.surfaces){
          const polygon=onSurface(rectangle,surface);
          for(let i=1;i<polygon.length-1;i++){
            const local=[polygon[0],polygon[i],polygon[i+1]], [a,b,c]=local;
            const area=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);
            if(Math.abs(area)<1e-10)continue;
            if(area<0)local.reverse();
            const uv=glow?local.map(p=>[((axis==='x'?p.z:p.x)-from)/(to-from),
              ((axis==='x'?p.x:p.z)*side-edge)*depth/thickness+.5]):null;
            const vertices=local.map(p=>world(point(p.x,p.y+offset/WALL_HEIGHT,p.z)));
            triangle(target,...vertices,shade,uv);
          }
        }
      };
      patch(channels,.075,.004,new THREE.Color(0x070719));
      patch(inlays,.038,.006,tint);
      patch(spill,.23,.008,tint,true);
    }
  }
  const texture=stoneTexture(),owned=[];
  const add=(name,data,material,cast=true)=>{
    const g=geometry(data),mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=cast;mesh.receiveShadow=cast;group.add(mesh);owned.push(g);return mesh;
  };
  add('stone-wall-blocks',stone,new THREE.MeshStandardMaterial({vertexColors:true,bumpMap:texture,bumpScale:.008,roughness:.87,metalness:.015,envMapIntensity:.26}));
  add('stone-wall-channels',channels,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0}),false);
  add('stone-wall-inlays',inlays,new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}),false);
  add('stone-wall-spill',spill,new THREE.MeshBasicMaterial({vertexColors:true,map:glowTexture,opacity:.58,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),false);
  group.userData.stoneStyle='carved-stone-v2';group.userData.stoneBlocks=blocks;
  return {geometries:owned,textures:[texture]};
}
