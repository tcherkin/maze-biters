import * as THREE from './vendor/three.module.min.js';
import {CELL_SIZE,WALL_WIDTH,WALL_HEIGHT,worldLayout} from './world.mjs';
import {addStoneWalls} from './wall-stones.mjs';

function chamferedBlock(bevel=.035){
  const shape=new THREE.Shape(),edge=.5-bevel;
  shape.moveTo(-edge,-edge);shape.lineTo(edge,-edge);shape.lineTo(edge,edge);shape.lineTo(-edge,edge);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:1-2*bevel,steps:1,bevelEnabled:true,bevelSegments:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:1});
  geometry.translate(0,0,-.5+bevel);return geometry;
}
const blockGeometry=chamferedBlock();
const transform=new THREE.Object3D(),tint=new THREE.Color();
const hash=(x,y=0)=>{let n=Math.imul(x+173,374761393)^Math.imul(y+37,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;};

// The paving gets fine mineral grain and occasional hairline fractures, rather
// than a large, padded square repeated once per game cell.
function mineralTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const n=hash(x,y),coarse=hash(x>>4,y>>4),v=180+(n%31)+(coarse%12),i=(y*256+x)*4;
    pixels.data[i]=v-3;pixels.data[i+1]=v-1;pixels.data[i+2]=v+3;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  for(let i=0;i<12;i++){
    const x=hash(i,1)%256,y=hash(i,2)%256;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+4,y+2);ctx.lineTo(x+8,y-1);ctx.lineTo(x+15,y+3);
    ctx.strokeStyle=i<3?'rgba(28,33,49,.30)':'rgba(220,227,236,.12)';ctx.lineWidth=.6;ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;return texture;
}
function edgeGlowTexture(){
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=32;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(64,32);
  for(let y=0;y<32;y++)for(let x=0;x<64;x++){
    const across=Math.abs((y-15.5)/16),along=Math.abs((x-31.5)/32),i=(y*64+x)*4;
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;
    pixels.data[i+3]=Math.round(95*Math.exp(-across*across*7)*Math.max(0,1-along**12));
  }
  ctx.putImageData(pixels,0,0);return new THREE.CanvasTexture(canvas);
}

export function lightDuskScene(renderer,scene){
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMappingExposure=1.05;
  const ambient=new THREE.HemisphereLight(0x817bbb,0x100b24,.22);
  const key=new THREE.DirectionalLight(0xffe3c3,2.7);key.position.set(-15,30,17);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:1,far:85});
  key.shadow.bias=-.00015;key.shadow.normalBias=.025;key.shadow.radius=3;
  const fill=new THREE.DirectionalLight(0x7861ff,.85);fill.position.set(15,13,-18);
  scene.add(ambient,key,key.target,fill);
  // Local overhead pools add soft glints to the original, brighter lighting.
  const pools=[];
  for(const [color,power,x,y,z] of [[0xb8d9ff,180,-11,7.2,-10],[0xb4a2ff,170,12,7.4,0],[0xc4bfff,180,-2,7.2,6]]){
    const pool=new THREE.SpotLight(color,power,12,.47,.72,2);
    pool.position.set(x,y,z);pool.target.position.set(x,0,z);
    scene.add(pool,pool.target);pools.push(pool);
  }
  // Reflection cards create curved enamel highlights without an external HDRI.
  const studio=new THREE.Scene();studio.background=new THREE.Color(0x070616);
  const cards=[
    {color:0xffe7cc,power:5.4,position:[-3,7,4],size:[3,6]},
    {color:0x8bdfff,power:4.0,position:[6,4,0],size:[1.5,6]},
    {color:0xa58bff,power:3.1,position:[-5,3,-6],size:[2,5]},
    // A narrow off-axis strip catches curved rims and bevels without bleaching
    // every horizontal plate in the orthographic camera at once.
    {color:0xe2ecff,power:3.0,position:[-2,7,-10],size:[5,.45]}
  ];
  for(const card of cards){
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(...card.size),new THREE.MeshBasicMaterial({color:new THREE.Color(card.color).multiplyScalar(card.power),side:THREE.DoubleSide}));
    panel.position.set(...card.position);panel.lookAt(0,0,0);studio.add(panel);
  }
  const generator=new THREE.PMREMGenerator(renderer),environment=generator.fromScene(studio,.025,.1,50);
  scene.environment=environment.texture;scene.environmentIntensity=.60;
  generator.dispose();studio.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  return {key,ambient,fill,pools,environment};
}

// Opt-in environment contrast, independent of actor selection. The broad
// lighting changes on these materials only: local spots/points, reflected
// light, shadows, neon inlays and the global light rig keep their exact terms.
// Apply after WallMirrors.attach(), which installs its own wall shader hook.
const contrastMaterials=new WeakMap();
export function setDuskLightingVariant(group,variant='current'){
  const contrast=variant==='contrast',floorGain=contrast?.64:.88,stoneGain=contrast?.78:1;
  const visited=new Set();
  group.traverse(object=>{
    const material=object.material;
    if(!material||Array.isArray(material)||!material.isMeshStandardMaterial||visited.has(material))return;
    visited.add(material);
    if(material.userData.backgroundLightGain){
      // Preserve the existing floor shader/cache key, including exact .88
      // baseline. No additional shader or material is needed for the floor.
      material.userData.backgroundLightGain.value=floorGain;return;
    }
    let state=contrastMaterials.get(material);
    if(!contrast){
      if(state){
        if(material.onBeforeCompile===state.wrapper){
          material.onBeforeCompile=state.before;material.customProgramCacheKey=state.key;material.needsUpdate=true;
        }
        delete material.userData.duskBackgroundLightGain;contrastMaterials.delete(material);
      }
      return;
    }
    if(!state||material.onBeforeCompile!==state.wrapper){
      const before=material.onBeforeCompile,key=material.customProgramCacheKey,baseKey=key.call(material);
      const gain={value:stoneGain};
      const wrapper=(shader,renderer)=>{
        before.call(material,shader,renderer);
        shader.uniforms.duskBackgroundGain=gain;
        shader.fragmentShader='uniform float duskBackgroundGain;\n'+shader.fragmentShader;
        const lights=THREE.ShaderChunk.lights_fragment_begin.replace(
          'getDirectionalLightInfo( directionalLight, directLight );',
          'getDirectionalLightInfo( directionalLight, directLight );\n directLight.color *= duskBackgroundGain;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lights+`
          #if defined( RE_IndirectDiffuse )
            irradiance *= duskBackgroundGain;
          #endif
        `);
      };
      state={before,key,wrapper,gain};contrastMaterials.set(material,state);
      material.onBeforeCompile=wrapper;
      material.customProgramCacheKey=()=>baseKey+'|dusk-environment-contrast-v1';
      material.userData.duskBackgroundLightGain=gain;material.needsUpdate=true;
    }
    state.gain.value=stoneGain;
  });
  group.userData.lightingVariant=contrast?'contrast':'current';
  group.userData.floorBackgroundGain=floorGain;group.userData.stoneBackgroundGain=stoneGain;
  return group.userData.lightingVariant;
}
function instances(parent,material,entries,pose,{cast=false,receive=true,geometry=blockGeometry}={}){
  const mesh=new THREE.InstancedMesh(geometry,material,entries.length);
  entries.forEach((p,i)=>{
    transform.position.set(0,0,0);transform.rotation.set(0,0,0);transform.scale.set(1,1,1);
    const hex=pose(p,i,transform);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
    if(hex!==undefined){tint.setHex(hex);mesh.setColorAt(i,tint);}
  });
  mesh.castShadow=cast;mesh.receiveShadow=receive;parent.add(mesh);return mesh;
}
const polygonArea=points=>points.reduce((area,p,i)=>{const q=points[(i+1)%points.length];return area+p.x*q.z-q.x*p.z;},0)/2;
function contains(points,p){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}

// Trace a union of wall cells AND their axial bridges. A single beveled solid
// follows every connected run, so widening the grid never creates pillar gaps.
function wallFootprints(maze,layout,width){
  const xs=[],zs=[],isWall=(x,y)=>maze[y]?.[x]==='#';
  for(let x=0;x<layout.cols;x++)xs.push(layout.x(x)-width/2,layout.x(x)+width/2);
  for(let y=0;y<layout.rows;y++)zs.push(layout.z(y)-width/2,layout.z(y)+width/2);
  const occupied=Array.from({length:zs.length-1},(_,j)=>Array.from({length:xs.length-1},(_,i)=>{
    const x=i>>1,y=j>>1;
    if(!(i%2)&&!(j%2))return isWall(x,y);
    if(i%2&&!(j%2))return isWall(x,y)&&isWall(x+1,y);
    if(!(i%2)&&j%2)return isWall(x,y)&&isWall(x,y+1);
    return isWall(x,y)&&isWall(x+1,y)&&isWall(x,y+1)&&isWall(x+1,y+1);
  }));
  const edges=new Map(),key=(i,j)=>`${i},${j}`,bounds=[];
  const add=(i,j,a,b)=>edges.set(key(i,j),{from:[i,j],to:[a,b]});
  occupied.forEach((row,j)=>row.forEach((filled,i)=>{
    if(!filled)return;
    bounds.push({minX:xs[i],maxX:xs[i+1],minZ:zs[j],maxZ:zs[j+1]});
    if(!occupied[j-1]?.[i])add(i,j,i+1,j);
    if(!occupied[j]?.[i+1])add(i+1,j,i+1,j+1);
    if(!occupied[j+1]?.[i])add(i+1,j+1,i,j+1);
    if(!occupied[j]?.[i-1])add(i,j+1,i,j);
  }));
  const loops=[];
  while(edges.size){
    const first=edges.values().next().value,points=[];let edge=first;
    do{
      points.push({x:xs[edge.from[0]],z:zs[edge.from[1]]});edges.delete(key(...edge.from));
      edge=edges.get(key(...edge.to));
    }while(edge);
    const simplified=points.filter((p,i)=>{
      const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
      return Math.abs((p.x-a.x)*(b.z-p.z)-(p.z-a.z)*(b.x-p.x))>1e-8;
    });
    loops.push(simplified);
  }
  return {loops,bounds};
}
function shapePath(points,ShapeClass=THREE.Shape){
  const shape=new ShapeClass();shape.moveTo(points[0].x,-points[0].z);
  for(const point of points.slice(1))shape.lineTo(point.x,-point.z);
  shape.closePath();return shape;
}

export function buildDuskMaze(maze,{worldStyle='current'}={}){
  const ruins=worldStyle==='ruins';
  const group=new THREE.Group(),layout=worldLayout(maze),texture=mineralTexture(),glowTexture=edgeGlowTexture();
  // Leave room behind the .073-deep ruin niches. The core bevel grows outward
  // from its footprint, so the usual backing would otherwise fill the holes.
  const bevel=.065,footprint=wallFootprints(maze,layout,WALL_WIDTH-(ruins?.38:.19));
  const outer=footprint.loops.filter(loop=>polygonArea(loop)>0),holes=footprint.loops.filter(loop=>polygonArea(loop)<0);
  const shapes=outer.map(loop=>{
    const shape=shapePath(loop);for(const hole of holes)if(contains(loop,hole[0]))shape.holes.push(shapePath(hole,THREE.Path));return shape;
  });
  // A recessed continuous backing closes joints for real flashlight shadows.
  // The carved stones above it carry the visible silhouette and surface.
  const wallGeometry=new THREE.ExtrudeGeometry(shapes,{depth:WALL_HEIGHT-.10-2*bevel,steps:1,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:1});
  wallGeometry.rotateX(-Math.PI/2);wallGeometry.translate(0,bevel,0);
  const coreMaterial=new THREE.MeshStandardMaterial({color:0x1a1726,roughness:.94,metalness:.01});
  const wallMesh=new THREE.Mesh(wallGeometry,coreMaterial);wallMesh.name='stone-wall-core';wallMesh.castShadow=true;wallMesh.receiveShadow=true;group.add(wallMesh);

  const floors=[];let row=0,z=-layout.height/2-.15;
  while(z<layout.height/2+.15){
    const h=ruins?1.03+(hash(row,11)%27)/100:.61+(hash(row,11)%17)/100,depth=Math.min(h,layout.height/2+.15-z);
    let x=-layout.width/2-.15,column=0;
    while(x<layout.width/2+.15){
      const wanted=ruins?(column===0&&row%2?.53:1.15+(hash(column,row)%57)/100):(column===0&&row%2?.43:.80+(hash(column,row)%53)/100),w=Math.min(wanted,layout.width/2+.15-x);
      floors.push({x:x+w/2,z:z+depth/2,w:w-(ruins?.029:.013),d:depth-(ruins?.029:.013),seed:hash(column,row)});x+=w;column++;
    }
    z+=h;row++;
  }
  const ground=new THREE.MeshPhysicalMaterial({color:0xffffff,map:texture,roughness:.67,metalness:.16,clearcoat:.10,clearcoatRoughness:.38,envMapIntensity:.32});
  // Quiet only the paving's broad key/fill/hemisphere contribution. Local
  // spots, neon point lights, shadows and environment reflections keep their
  // original response. A shared uniform also permits exact frozen-frame A/B.
  const backgroundGain={value:.88};
  ground.userData.backgroundLightGain=backgroundGain;
  ground.onBeforeCompile=shader=>{
    shader.uniforms.floorBackgroundGain=backgroundGain;
    shader.fragmentShader='uniform float floorBackgroundGain;\n'+shader.fragmentShader;
    const lights=THREE.ShaderChunk.lights_fragment_begin.replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight );\n directLight.color *= floorBackgroundGain;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lights+`
      #if defined( RE_IndirectDiffuse )
        irradiance *= floorBackgroundGain;
      #endif
    `);
  };
  ground.customProgramCacheKey=()=> 'paving-background-v1';
  const paving=instances(group,ground,floors,(p,i,t)=>{
    t.position.set(p.x,-.045,p.z);t.scale.set(p.w,.08,p.d);t.rotation.y=p.seed%2?Math.PI:0;
    if(ruins)return [0x484156,0x3a3546,0x343344,0x4c4558,0x373948,0x40364b][p.seed%6];
    return [0x262038,0x211b30,0x20192d,0x28213a,0x221a31,0x1c182b][p.seed%6];
  });

  if(ruins)paving.name='maze-paving';

  const stoneResources=addStoneWalls(group,maze,layout,wallFootprints(maze,layout,WALL_WIDTH).bounds,glowTexture,{ruins});

  const chips=[];
  maze.forEach((row,y)=>[...row].forEach((cell,x)=>{
    if(cell==='#'||hash(x,y)%3!==0)return;
    for(const d of [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}]){
      if(maze[y+d.y]?.[x+d.x]==='#'){
        const seed=hash(x,y);for(let i=0;i<2;i++)chips.push({x:layout.x(x)+d.x*(CELL_SIZE-WALL_WIDTH/2-.15)+(d.y?((seed+i*91)%100/100-.5):0),z:layout.z(y)+d.y*(CELL_SIZE-WALL_WIDTH/2-.15)+(d.x?((seed+i*43)%100/100-.5):0),seed:seed+i});break;
      }
    }
  }));
  instances(group,new THREE.MeshStandardMaterial({color:0x262c40,roughness:.79,metalness:.13}),chips,(p,i,t)=>{
    t.position.set(p.x,.015,p.z);t.rotation.y=p.seed%30;const size=.045+(p.seed%7)*.014;t.scale.set(size,.035,size*.77);
  });
  const slab=new THREE.Mesh(blockGeometry,new THREE.MeshStandardMaterial({color:0x080d17,metalness:.30,roughness:.64}));
  slab.userData.belowFloor=true;
  slab.position.y=-.24;slab.scale.set(layout.width+.5,.38,layout.height+.5);slab.receiveShadow=true;group.add(slab);
  group.userData.surfaceTextures=[texture,glowTexture,...stoneResources.textures];group.userData.ownedGeometries=[wallGeometry,...stoneResources.geometries];
  group.userData.wallBounds=wallFootprints(maze,layout,WALL_WIDTH).bounds;
  group.userData.wallWidth=WALL_WIDTH;group.userData.wallHeight=WALL_HEIGHT;
  group.userData.pavingCount=floors.length;
  return group;
}
export function disposeDuskMaze(group){
  const materials=new Set();
  group.traverse(object=>{
    if(object.isInstancedMesh)object.dispose();
    for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)materials.add(material);
  });
  materials.forEach(material=>material.dispose());
  group.userData.surfaceTextures?.forEach(texture=>texture.dispose());
  group.userData.ownedGeometries?.forEach(geometry=>geometry.dispose());group.removeFromParent();
}
