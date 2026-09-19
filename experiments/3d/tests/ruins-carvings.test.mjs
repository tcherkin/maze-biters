import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {buildDuskMaze,disposeDuskMaze} from '../environment.mjs';
import {dressCrystalRuins} from '../ruins-materials.mjs';
import {CONCEPT_MAZE} from '../maze-layout.mjs';
import {WALL_HEIGHT,worldLayout} from '../world.mjs';
import {updateRuinsCarvings} from '../ruins-carvings.mjs';

// Actual triangles and ray hits verify the recesses independently of their
// triangulation recipe. Canvas is needed only to construct existing textures.
const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
globalThis.document={createElement(name){
  assert.equal(name,'canvas');
  let image=null;
  const context={
    createImageData(width,height){return {data:new Uint8ClampedArray(width*height*4)};},
    putImageData(value){image=value;},getImageData(){return image;},
    beginPath(){},moveTo(){},lineTo(){},stroke(){}
  };
  return {width:0,height:0,getContext(){return context;}};
}};

const fixtures={
  horizontal:['.......','.#####.','.......'],
  vertical:['...','.#.','.#.','.#.','...'],
  junction:['.....','.###.','..#..','..#..','.....'],
  filledSquare:['....','.##.','.##.','....'],
  concept:CONCEPT_MAZE
};
const ray=new THREE.Raycaster(),epsilon=4e-6;
let pocketChecks=0,faceChecks=0,triangleChecks=0,disposedResources=0,maxDepthError=0;

try{
  for(const [name,maze] of Object.entries(fixtures)){
    const group=buildDuskMaze(maze,{worldStyle:'ruins'}),state=group.userData.ruinsCarvings;
    const stone=group.getObjectByName('stone-wall-blocks'),core=group.getObjectByName('stone-wall-core');
    const walls=[stone,core],bounds=group.userData.wallBounds;
    // Include the fully dressed concept scene in lifetime/placement checks.
    // Its procedural image rasterization is covered by the browser review.
    if(name==='concept')dressCrystalRuins(group);
    group.updateMatrixWorld(true);
    assert.ok(state&&state.faces>0&&state.features.length>0,name+': exposed faces contain physical carvings');
    const layout=worldLayout(maze),ends=[];
    maze.forEach((row,y)=>[...row].forEach((cell,x)=>{
      if(cell==='#'&&maze[y-1]?.[x]==='#'&&maze[y+1]?.[x]!=='#'&&row[x-1]!=='#'&&row[x+1]!=='#')ends.push({x:layout.x(x),z:layout.z(y)});
    }));
    const diamonds=state.features.filter(f=>f.kind==='glyph');
    assert.equal(diamonds.length,ends.length,name+': exactly one diamond per south-facing vertical free end');
    for(const diamond of diamonds){
      assert.equal(diamond.symbol,'crystal');assert.ok(diamond.normal.z>.999);
      assert.ok(ends.some(end=>Math.abs(end.x-diamond.center.x)<epsilon&&diamond.center.z-end.z>.5&&diamond.center.z-end.z<.7),name+': no symbols on long sides, corners or other ends');
    }
    const resources=new Set([...group.userData.ownedGeometries,...group.userData.surfaceTextures]);
    group.traverse(object=>{
      if(object.isInstancedMesh)resources.add(object);
      for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)resources.add(material);
    });
    const disposals=new Map([...resources].map(resource=>[resource,0]));
    for(const resource of resources)resource.addEventListener('dispose',()=>disposals.set(resource,disposals.get(resource)+1));
    try{
      const directions=new Set(),kinds=new Set(),symbols=new Set(),states=new Set(),bands=new Map();
      for(const feature of state.features){
        const {center,normal,depth,kind,symbol,lit}=feature;
        assert.ok(center.toArray().every(Number.isFinite)&&normal.toArray().every(Number.isFinite),name+': finite carving placement');
        assert.ok(Math.abs(normal.length()-1)<epsilon&&Math.abs(normal.y)<epsilon,name+': recess normal points horizontally outward');
        const cardinal=normal.x>.5?'east':normal.x<-.5?'west':normal.z>.5?'south':'north';
        directions.add(cardinal);kinds.add(kind);
        assert.ok(depth>.02&&depth<.09,name+': carving preserves the structural wall backing');
        ray.set(center.clone().addScaledVector(normal,.12),normal.clone().negate());
        const hit=ray.intersectObjects(walls,false)[0];
        assert.ok(hit,name+': pocket has a solid stone floor: '+kind);
        assert.equal(hit.object,stone,name+': original face/core does not cover the '+kind+' recess');
        const measured=center.clone().sub(hit.point).dot(normal),error=Math.abs(measured-depth);
        maxDepthError=Math.max(maxDepthError,error);
        assert.ok(error<epsilon,`${name}: ${kind} is genuinely recessed (hit depth ${measured}, expected ${depth})`);
        assert.ok(hit.face.normal.dot(normal)>.999,name+': pocket floor faces the opening');
        pocketChecks++;
        if(kind==='glyph'){symbols.add(symbol);states.add(lit);}
        if(kind==='channel'){
          const key=[center.x,center.z,normal.x,normal.z].map(v=>v.toFixed(5)).join(',');
          bands.set(key,(bands.get(key)||0)+1);
          // Above the upper channel the actual untouched stone must remain
          // on the original face plane, rather than being shifted wholesale.
          if(center.y>.8){
            const adjacent=center.clone();adjacent.y+=.09;
            ray.set(adjacent.clone().addScaledVector(normal,.12),normal.clone().negate());
            const face=ray.intersectObjects(walls,false)[0];
            assert.ok(face?.object===stone,name+': upper channel retains its neighbouring stone face');
            assert.ok(Math.abs(face.point.clone().sub(adjacent).dot(normal))<epsilon,name+': adjoining stone remains at its original depth');
            faceChecks++;
          }
        }
      }
      assert.equal(directions.size,4,name+': carvings work on every cardinal face');
      if(name==='concept'){
        assert.deepEqual([...kinds].sort(),['channel','glyph','scar']);
        assert.deepEqual([...symbols],['crystal']);
        assert.deepEqual([...states].sort(),[false,true],name+': dormant and luminous glyphs coexist');
        assert.deepEqual([...new Set(bands.values())].sort(),[1,2],name+': architecture contains single and double bands');
      }

      const positions=stone.geometry.attributes.position,normals=stone.geometry.attributes.normal;
      const inside=p=>bounds.some(b=>p.x>=b.minX-epsilon&&p.x<=b.maxX+epsilon&&p.z>=b.minZ-epsilon&&p.z<=b.maxZ+epsilon);
      for(let i=0;i<positions.count;i+=3){
        const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,i+j));
        const cross=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
        assert.ok(cross.length()>1e-10,name+': tessellation contains no degenerate triangles');
        cross.normalize();
        for(let j=0;j<3;j++){
          const p=vertices[j],n=new THREE.Vector3().fromBufferAttribute(normals,i+j);
          assert.ok(p.toArray().every(Number.isFinite)&&n.toArray().every(Number.isFinite),name+': every physical triangle is finite');
          assert.ok(inside(p)&&p.y>=-epsilon&&p.y<=WALL_HEIGHT+epsilon,name+': carvings remain inside physical wall bounds');
          assert.ok(Math.abs(n.length()-1)<epsilon&&n.dot(cross)>.999,name+': stored normal follows actual triangle winding');
        }
        triangleChecks++;
      }
      const strips=group.getObjectByName('Violet wall strips'),ribbons=group.getObjectByName('Violet wall reflection ribbons');
      assert.ok(strips?.userData.wetReflectionHide&&strips.visible,name+': direct luminous bands retain sharp geometry');
      assert.ok(ribbons?.userData.wetReflectionOnly&&!ribbons.visible,name+': wet reflections retain the filtered source');
      assert.equal(strips.count,ribbons.count,name+': every luminous band has a reflection source');
      const glyphs=group.getObjectByName('Recessed luminous sigils'),glyphRibbons=group.getObjectByName('Violet sigil reflection ribbons');
      if(glyphs){
        assert.ok(glyphs.userData.wetReflectionHide&&glyphs.visible,name+': thin luminous glyphs are filtered before capture');
        assert.ok(glyphRibbons?.userData.wetReflectionOnly&&!glyphRibbons.visible,name+': glyph reflection proxies stay hidden in direct view');
        assert.equal(glyphs.count,glyphRibbons.count,name+': every luminous glyph stroke has a reflection source');
      }else assert.equal(glyphRibbons,undefined);
      const sourceMatrix=new THREE.Matrix4(),captureMatrix=new THREE.Matrix4(),source=new THREE.Vector3(),capture=new THREE.Vector3(),normal=new THREE.Vector3();
      for(let i=0;i<(glyphs?.count||0);i++){
        glyphs.getMatrixAt(i,sourceMatrix);glyphRibbons.getMatrixAt(i,captureMatrix);
        source.setFromMatrixPosition(sourceMatrix);capture.setFromMatrixPosition(captureMatrix);
        normal.setFromMatrixColumn(sourceMatrix,2).normalize();
        const offset=capture.clone().sub(source);
        assert.ok(offset.dot(normal)>.06&&offset.dot(normal)<.08,name+': filtered glyph source clears the recessed lip');
        assert.ok(offset.clone().cross(normal).length()<epsilon,name+': reflected glyph retains its planar placement');
      }
      if(name==='concept'){
        const dormant=group.getObjectByName('Dormant carved sigils'),dormantColor=dormant.material.color.clone();
        const brightness=[];
        for(let t=0;t<=10000;t+=25){
          updateRuinsCarvings(group,t);
          assert.deepEqual(glyphs.instanceColor.array,glyphRibbons.instanceColor.array,'The reflection matches animated diamond brightness');
          brightness.push(glyphs.instanceColor.array[0]);
        }
        assert.ok(Math.max(...brightness)-Math.min(...brightness)>.005,'The diamonds gently flicker over time');
        for(let i=1;i<brightness.length;i++)assert.ok(Math.abs(brightness[i]-brightness[i-1])<.01,'No abrupt frame-to-frame brightness jumps');
        updateRuinsCarvings(group,1234);const frozen=Array.from(glyphs.instanceColor.array);
        updateRuinsCarvings(group,1234);assert.deepEqual(Array.from(glyphs.instanceColor.array),frozen,'Paused time has stable brightness');
        assert.ok(dormant.material.color.equals(dormantColor),'Dormant diamonds stay dark');
        const lamps=group.children.filter(object=>object.name==='Violet groove bounce');
        assert.ok(lamps.length>0&&lamps.length<=3,name+': local groove bounce has a bounded light budget');
        for(const lamp of lamps){
          assert.ok(!inside(lamp.position),name+': bounce source is outside the opaque wall');
          assert.ok(state.features.some(feature=>feature.kind==='glyph'&&feature.lit&&
            feature.center.clone().addScaledVector(feature.normal,.38).add(new THREE.Vector3(0,.12,0)).distanceTo(lamp.position)<epsilon),
          name+': every bounce light belongs to an actual illuminated glyph');
        }
        const textures=group.userData.surfaceTextures;
        const crowns=group.children.filter(object=>object.name==='Violet stone crown bounce'),expectedCrowns=[];
        for(const block of group.userData.stoneBlocks){
          if(expectedCrowns.length===8)break;
          if(!expectedCrowns.some(p=>Math.hypot(p.x-block.x,p.z-block.z)<8))expectedCrowns.push(new THREE.Vector3(block.x,1.4,block.z));
        }
        assert.deepEqual(crowns.map(l=>l.position.toArray()),expectedCrowns.map(p=>p.toArray()),'The sparse original crown light placement is restored');
        assert.ok(crowns.every(l=>l.intensity===7&&l.distance===4.5),'Crown lighting retains the original brightness and reach');
        assert.equal(new Set(textures).size,textures.length,name+': all dressed textures have one cleanup owner');
        group.traverse(object=>{
          for(const material of Array.isArray(object.material)?object.material:[object.material]){
            if(!material)continue;
            for(const value of Object.values(material))if(value?.isTexture)
              assert.ok(textures.includes(value),name+': dressed material texture is registered for cleanup');
          }
        });
      }
      assert.equal(new Set(group.userData.ownedGeometries).size,group.userData.ownedGeometries.length,name+': merged/shared ornament geometry has one owner');
    }finally{disposeDuskMaze(group);}
    for(const [resource,count] of disposals){
      assert.equal(count,1,name+': '+(resource.name||resource.type||'texture')+' is disposed exactly once');disposedResources++;
    }
  }
}finally{
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);
  else delete globalThis.document;
}
console.log(JSON.stringify({fixtures:Object.keys(fixtures).length,pocketChecks,faceChecks,triangleChecks,maxDepthError,disposedResources}));
