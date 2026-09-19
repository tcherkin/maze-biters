import * as THREE from './vendor/three.module.min.js';

// Seamless, deterministic mineral layers. These maps belong to the rebuilt
// maze; the saved neon world never shares or mutates them.
const hash=(x,y)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
const fade=x=>x*x*(3-2*x),mix=THREE.MathUtils.lerp;
function noise(x,y,period){
  const ix=Math.floor(x),iy=Math.floor(y),u=fade(x-ix),v=fade(y-iy),h=(a,b)=>hash((a+period)%period,(b+period)%period);
  return mix(mix(h(ix,iy),h(ix+1,iy),u),mix(h(ix,iy+1),h(ix+1,iy+1),u),v);
}
function mineralMaps(){
  const size=512,height=new Float32Array(size*size),canvases=Array.from({length:3},()=>{
    const c=document.createElement('canvas');c.width=c.height=size;return c;
  });
  const images=canvases.map(c=>c.getContext('2d').createImageData(size,size));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const a=noise(x/128,y/128,4),b=noise(x/32,y/32,16),c=noise(x/8,y/8,64),d=hash(x,y);
    const pits=Math.max(0,.36-noise(x/3,y/3,171))*1.4;
    height[y*size+x]=a*.25+b*.32+c*.25+d*.10-pits;
    const tone=THREE.MathUtils.clamp(85+a*65+b*36+c*32+d*20-pits*120,0,255),i=(y*size+x)*4;
    images[0].data.set([tone*.91,tone*.94,tone,255],i);
    // Dry high spots and pooled water coexist on every slab.
    const rough=190+fade(THREE.MathUtils.clamp((a*.55+b*.45-.3)*2,0,1))*48;
    images[2].data.set([rough,rough,rough,255],i);
  }
  const at=(x,y)=>height[((y+size)%size)*size+(x+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=(at(x-1,y)-at(x+1,y))*1.9,ny=(at(x,y-1)-at(x,y+1))*1.9,l=Math.hypot(nx,ny,1),i=(y*size+x)*4;
    images[1].data.set([(nx/l*.5+.5)*255,(ny/l*.5+.5)*255,(1/l*.5+.5)*255,255],i);
  }
  const textures=canvases.map((c,i)=>{
    const ctx=c.getContext('2d');ctx.putImageData(images[i],0,0);
    if(i===0){
      // Sparse fine fractures interrupt the mineral grain without drawing a
      // second artificial grid over the real slab joints.
      for(let j=0;j<23;j++){
        let x=hash(j,77)*size,y=hash(j,91)*size;ctx.beginPath();ctx.moveTo(x,y);
        for(let k=0;k<5;k++){x+=4+hash(j+k,63)*13;y+=(hash(j,k+92)-.5)*18;ctx.lineTo(x,y);}
        ctx.strokeStyle='rgba(12,9,22,.32)';ctx.lineWidth=.9;ctx.stroke();
      }
    }
    const t=new THREE.CanvasTexture(c);
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;if(i===0)t.colorSpace=THREE.SRGBColorSpace;return t;
  });
  return {map:textures[0],normalMap:textures[1],roughnessMap:textures[2],textures};
}

// Wall stone is deliberately independent of the wet paving. Broad chipped
// layers supply the relief, with sparse fine fractures instead of white noise.
function wallMineralMaps(){
  const size=512,base=new Float32Array(size*size),tone=new Float32Array(size*size);
  const canvases=Array.from({length:4},()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;return canvas;
  });
  const contexts=canvases.map(canvas=>canvas.getContext('2d'));
  const images=contexts.map(ctx=>ctx.createImageData(size,size));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const broad=noise(x/128,y/128,4),plate=noise(x/32,y/32,16),grain=noise(x/8,y/8,64);
    const micro=noise(x/4,y/4,128),pore=noise(x/16,y/16,32);
    const warp=noise(x/64,y/64,8);
    const layer=Math.sin((y/64+(broad-.5)*.9+(warp-.5)*.24)*Math.PI*2);
    const chipped=fade(THREE.MathUtils.clamp((plate-.48)*5+.5,0,1));
    const pitted=fade(THREE.MathUtils.clamp((.45-pore)*4,0,1));
    const height=.50+(broad-.5)*.19+(chipped-.5)*.20+layer*.018+(grain-.5)*.12+(micro-.5)*.035-pitted*.11;
    const index=y*size+x,i=index*4; base[index]=height;
    tone[index]=166+(broad-.5)*44+(plate-.5)*48+(grain-.5)*34+layer*3-pitted*35;
    const value=height*255;
    images[3].data.set([value,value,value,255],i);
  }
  const heightContext=contexts[3];heightContext.putImageData(images[3],0,0);
  heightContext.lineCap='round';heightContext.lineJoin='round';
  // Cut the height field itself: grazing light sees real indents in the same
  // places as the dark fractures. Repeated strokes keep the texture seamless.
  for(let j=0;j<20;j++){
    let x=hash(j,721)*size,y=hash(j,439)*size;
    const points=[[x,y]],angle=hash(j,643)*Math.PI*2,length=20+hash(j,982)*65;
    for(let k=0;k<5;k++){
      x+=Math.cos(angle+(hash(j+k,733)-.5)*.65)*length/5;
      y+=Math.sin(angle+(hash(j+k,811)-.5)*.65)*length/5;points.push([x,y]);
    }
    for(const ox of [-size,0,size])for(const oy of [-size,0,size]){
      heightContext.beginPath();heightContext.moveTo(points[0][0]+ox,points[0][1]+oy);
      for(const p of points.slice(1))heightContext.lineTo(p[0]+ox,p[1]+oy);
      heightContext.strokeStyle='rgba(71,71,71,.38)';heightContext.lineWidth=3.4;heightContext.stroke();
      heightContext.strokeStyle='rgba(48,48,48,.52)';heightContext.lineWidth=1.0;heightContext.stroke();
    }
  }
  const carved=heightContext.getImageData(0,0,size,size).data;
  const at=(x,y)=>carved[(((y+size)%size)*size+(x+size)%size)*4]/255;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const index=y*size+x,i=index*4,height=carved[i]/255;
    const cut=Math.max(0,base[index]-height),value=THREE.MathUtils.clamp(tone[index]-cut*135,0,255);
    images[0].data.set([value*.92,value*.90,value,255],i);
    const nx=(at(x-1,y)-at(x+1,y))*2.2,ny=(at(x,y-1)-at(x,y+1))*2.2,n=Math.hypot(nx,ny,1);
    images[1].data.set([(nx/n*.5+.5)*255,(ny/n*.5+.5)*255,(1/n*.5+.5)*255,255],i);
    const rough=THREE.MathUtils.clamp(212+(base[index]-.48)*112+cut*92,180,245);
    images[2].data.set([rough,rough,rough,255],i);
  }
  const textures=canvases.map((canvas,i)=>{
    if(i!==3)contexts[i].putImageData(images[i],0,0);
    const texture=new THREE.CanvasTexture(canvas);texture.name=['Ruins wall basalt','Ruins wall normals','Ruins wall roughness','Ruins wall carved height'][i];
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;
    if(i===0)texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  });
  return {map:textures[0],normalMap:textures[1],roughnessMap:textures[2],bumpMap:textures[3],textures};
}

export function dressCrystalRuins(group){
  const maps=mineralMaps(),wall=group.getObjectByName('stone-wall-blocks'),floor=group.getObjectByName('maze-paving');
  const wallMaps=wallMineralMaps();group.userData.ruinsWallMaps=wallMaps;
  group.userData.surfaceTextures.push(...maps.textures,...wallMaps.textures);
  wall.material.map=wallMaps.map;wall.material.roughnessMap=wallMaps.roughnessMap;
  // Three.js selects normalMap ahead of bumpMap; use the carved height for
  // these surfaces so the shallow chips and fracture grooves really shade.
  wall.material.normalMap=null;wall.material.bumpMap=wallMaps.bumpMap;wall.material.bumpScale=.075;
  wall.material.roughness=.93;wall.material.metalness=.015;wall.material.envMapIntensity=.40;
  // Triangles use a real planar UV on each face, including vertical sides.
  const {position,normal,uv,color}=wall.geometry.attributes;
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    if(Math.abs(normal.getY(i))>.5)uv.setXY(i,x*.58,z*.58);
    else if(Math.abs(normal.getX(i))>.5)uv.setXY(i,z*.58,y*.58);
    else uv.setXY(i,x*.58,y*.58);
    // Neutral violet basalt; the grooves supply the saturated purple.
    color.setXYZ(i,color.getX(i)*3.4,color.getY(i)*4.1,color.getZ(i)*2.05);
  }
  uv.needsUpdate=color.needsUpdate=true;
  floor.material.map=maps.map;floor.material.normalMap=maps.normalMap;floor.material.normalScale.set(.26,.26);
  floor.material.roughnessMap=maps.roughnessMap;floor.material.roughness=.58;floor.material.metalness=.08;
  floor.material.clearcoat=.8;floor.material.clearcoatRoughness=.22;floor.material.clearcoatNormalMap=maps.normalMap;
  floor.material.clearcoatNormalScale.set(.055,.055);floor.material.envMapIntensity=.32;
  const inlays=group.getObjectByName('stone-wall-inlays'),spill=group.getObjectByName('stone-wall-spill');
  for(const mesh of [inlays,spill]){
    const colors=mesh.geometry.attributes.color;
    for(let i=0;i<colors.count;i++){
      const cyan=colors.getY(i)>colors.getX(i)*2&&colors.getY(i)>.3;
      colors.setXYZ(i,cyan?.14:.53,cyan?.48:.09,1.8);
    }
    colors.needsUpdate=true;
  }
  spill.material.opacity=.82;
  // The narrow visible inlay remains sharp. Its existing soft surface patch
  // is a better emitter for the wet-floor capture, where it may be subpixel.
  inlays.userData.wetReflectionHide=true;
  spill.userData.wetReflectionOpacity=1.40;
  const lamps=[];
  for(const feature of group.userData.ruinsCarvings.features){
    if(lamps.length===3)break;
    if(feature.kind!=='glyph'||!feature.lit)continue;
    const position=feature.center.clone().addScaledVector(feature.normal,.38);position.y+=.12;
    if(lamps.some(p=>Math.hypot(p.x-position.x,p.z-position.z)<8))continue;
    // A glowing incision lights the stone in front of it. A lamp over the
    // block centre only lit its cap and left these vertical reveals flat.
    const light=new THREE.PointLight(0x8041ff,2.4,3.2,2);
    light.name='Violet groove bounce';light.position.copy(position);group.add(light);lamps.push(position);
    group.userData.ruinsCarvings.lamps.push({light,seed:feature.seed,base:light.intensity});
  }
  // Restore the original sparse overhead violet pools, independently of
  // carved symbols: the same block order, spacing and eight-light budget.
  const crownLamps=[];
  for(const block of group.userData.stoneBlocks){
    if(crownLamps.length===8)break;
    if(crownLamps.some(p=>Math.hypot(p.x-block.x,p.z-block.z)<8))continue;
    const light=new THREE.PointLight(0x8041ff,7,4.5,2);
    light.name='Violet stone crown bounce';light.position.set(block.x,1.4,block.z);
    group.add(light);crownLamps.push(light.position);
  }
  group.userData.worldStyle='ruins';
}

export function setRuinsLighting(rig,scene,enabled){
  rig.key.intensity=enabled?1.9:2.7;rig.ambient.intensity=enabled?.25:.22;rig.fill.intensity=enabled?1.15:.85;
  scene.environmentIntensity=enabled?.72:.60;
  rig.pools.forEach((p,i)=>{p.intensity=enabled?[220,205,230][i]:[180,170,180][i];});
}
