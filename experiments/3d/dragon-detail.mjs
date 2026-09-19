import * as THREE from './vendor/three.module.min.js';
import {dragonLengthZ} from './dragon-form.mjs';

// Long dragons need more samples at corners, not larger crystal triangles.
// Refine only when crossing a length tier; keep authored facets, vertex colors,
// breathing shapes and every existing attachment bone in place.
function refine(source,capacity,boneCount,tailZ){
  const descriptors=Object.entries(source.attributes).filter(([name])=>!name.startsWith('skin'))
    .map(([name,attribute])=>({name,attribute}));
  for(const [name,targets]of Object.entries(source.morphAttributes))
    targets.forEach((attribute,target)=>descriptors.push({name,attribute,target}));
  let stride=0;for(const d of descriptors){d.offset=stride;stride+=d.attribute.itemSize;d.values=[];}
  const position=descriptors.find(d=>d.name==='position'&&d.target===undefined),zOffset=position.offset+2;
  const vertex=index=>descriptors.flatMap(d=>Array.from({length:d.attribute.itemSize},(_,i)=>d.attribute.array[index*d.attribute.itemSize+i]));
  const emit=v=>{for(const d of descriptors)for(let i=0;i<d.attribute.itemSize;i++)d.values.push(v[d.offset+i]);};
  const split=(a,b,c)=>{
    const vertices=[a,b,c],distances=[a,b,c].map(v=>dragonLengthZ(v[zOffset],capacity));
    const edges=[[0,1,2],[1,2,0],[2,0,1]],edge=edges.reduce((best,e)=>
      Math.abs(distances[e[0]]-distances[e[1]])>Math.abs(distances[best[0]]-distances[best[1]])?e:best);
    if(Math.abs(distances[edge[0]]-distances[edge[1]])*2.1<=.32){emit(a);emit(b);emit(c);return;}
    const [u,v,w]=edge.map(i=>vertices[i]),mid=u.map((n,i)=>(n+v[i])*.5);
    split(u,mid,w);split(mid,v,w);
  };
  const indices=source.index?.array,count=indices?.length??source.attributes.position.count;
  for(let i=0;i<count;i+=3)split(vertex(indices?.[i]??i),vertex(indices?.[i+1]??i+1),vertex(indices?.[i+2]??i+2));
  const geometry=new THREE.BufferGeometry();geometry.morphTargetsRelative=source.morphTargetsRelative;
  for(const d of descriptors){
    const attribute=new THREE.Float32BufferAttribute(d.values,d.attribute.itemSize);attribute.name=d.attribute.name;
    if(d.target===undefined)geometry.setAttribute(d.name,attribute);
    else(geometry.morphAttributes[d.name]??=[])[d.target]=attribute;
  }
  const indicesOut=[],weights=[],positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    const u=THREE.MathUtils.clamp(positions.getZ(i)/tailZ,0,1)*(boneCount-1);
    const a=Math.min(boneCount-2,Math.floor(u)),weight=u-a;
    indicesOut.push(a,a+1,0,0);weights.push(1-weight,weight,0,0);
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indicesOut,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  geometry.normalizeNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

export function ensureDragonDetail(root,rig,length){
  const tier=2**Math.max(0,Math.ceil(Math.log2(Math.max(1,(length-2)/4))));
  if(tier<=(rig.detailTier??1))return false;
  rig.detailBase??={bones:rig.bones,restZ:rig.restZ,stationRadii:rig.stationRadii};
  const oldCount=rig.bones.length,count=128*tier+1,ratio=(count-1)/(oldCount-1);
  const bones=[],rest=[],radii=[],inverses=[];
  for(let i=0;i<count;i++){
    const z=rig.tailZ*i/(count-1),u=i/ratio,a=Math.floor(u),b=Math.min(a+1,oldCount-1);
    const bone=Number.isInteger(u)?rig.bones[u]:new THREE.Bone();
    if(!bone.parent){bone.position.z=z;bone.name='Dragon growth route station '+i;root.add(bone);}
    bones.push(bone);rest.push(z);radii.push(THREE.MathUtils.lerp(rig.stationRadii[a],rig.stationRadii[b],u-a));
    inverses.push(new THREE.Matrix4().makeTranslation(0,0,-z));
  }
  rig.detailSources??=[rig.bodyShell.geometry,rig.bodyCore.geometry];
  const geometries=rig.detailSources.map(source=>refine(source,2+4*tier,count,rig.tailZ));
  const skeleton=new THREE.Skeleton(bones,inverses);
  for(const [i,mesh]of [rig.bodyShell,rig.bodyCore].entries()){
    mesh.geometry=geometries[i];mesh.skeleton=skeleton;
  }
  for(const geometry of rig.detailOwned??[])geometry.dispose();
  rig.skeleton.dispose();rig.skeleton=skeleton;rig.bones=bones;rig.restZ=rest;rig.stationRadii=radii;
  rig.detailOwned=geometries;rig.detailTier=tier;return true;
}

export function resetDragonDetail(rig){
  if((rig.detailTier??1)===1)return;
  const base=rig.detailBase,keep=new Set(base.bones);
  for(const bone of rig.bones)if(!keep.has(bone))bone.removeFromParent();
  rig.skeleton.dispose();
  Object.assign(rig,base);
  rig.skeleton=new THREE.Skeleton(rig.bones,rig.restZ.map(z=>new THREE.Matrix4().makeTranslation(0,0,-z)));
  for(const [i,mesh]of [rig.bodyShell,rig.bodyCore].entries()){
    mesh.geometry=rig.detailSources[i];mesh.skeleton=rig.skeleton;
  }
  for(const geometry of rig.detailOwned)geometry.dispose();
  rig.detailOwned=[];rig.detailTier=1;
}
