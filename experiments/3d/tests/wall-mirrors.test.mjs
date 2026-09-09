import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildDuskMaze,disposeDuskMaze} from '../environment.mjs';
import {WALL_HEIGHT} from '../world.mjs';
import {CONCEPT_MAZE} from '../maze-layout.mjs';

// CPU-only capture includes mineral pixels AND subsequent hairline strokes.
// The fixed signatures below were calculated once from release 0.3.25,
// commit 30402bd. Running this regression needs neither Git nor a browser.
const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
globalThis.document={createElement(name){
  assert.equal(name,'canvas');
  const canvas={width:0,height:0,pixels:null,commands:[]};
  const context={
    createImageData(width,height){return {data:new Uint8ClampedArray(width*height*4)};},
    putImageData(image){canvas.pixels=new Uint8ClampedArray(image.data);},
    beginPath(){canvas.commands.push(['beginPath']);},
    moveTo(...values){canvas.commands.push(['moveTo',...values]);},
    lineTo(...values){canvas.commands.push(['lineTo',...values]);},
    stroke(){canvas.commands.push(['stroke',this.strokeStyle,this.lineWidth]);}
  };
  canvas.getContext=()=>context;return canvas;
}};

const fixtures={
  horizontal:['.......','.#####.','.......'],
  vertical:['...','.#.','.#.','.#.','...'],
  junction:['.....','.###.','..#..','..#..','.....'],
  filledSquare:['....','.##.','.##.','....'],
  concept:CONCEPT_MAZE
};
const sharedSurfaces={
  materials:'17827d12a1afc2b87c99eb4cdce45d4b40cf404c63cd78225a9f83bd6939bde3',
  textures:'d5deede8d5d9cbe5048d34640d50e5ca3d8dc19cfcdb6672ed040c11cbe76de5'
};
const expected={
  horizontal:{...sharedSurfaces,
    walls:'aabdac466a5caf88a8a1cd02d5c29946fb3557f08ed528cf27a18b14c974c1ca',
    floor:'9612d060f06b14f04594555f56712d138fc7e7cffb2efad0a2285d9f2ecd301a',
    layout:'392992fe557e4d47f52335054e83539449978a384a626e82600121590fdf3b31'},
  vertical:{...sharedSurfaces,
    walls:'eac40096e31764838b0d9f2920c45a0a98d60e790982434b1f4aa92f43e4e851',
    floor:'c15cdb3a8bb9a5a3675bda58773e8c3acf2fbbf5ecc76f7f6126d09d1db65b8f',
    layout:'9f124c913befe2aa40baf923d12e6e3424a1ce095b66a0bc766dc8f4624d69b6'},
  junction:{...sharedSurfaces,
    walls:'e8f10d919ddf8bd2b806f5a3ab6b35673e0d944084156a2e214366a66289c5fe',
    floor:'0fd3142c7abe0f8ff0e617626fe563cf21e8d08911fe80c12bcd9e75d50633eb',
    layout:'a65a4f4cfdacd213eb6552739a758c64e439f777851fd5596c52957e31c430f1'},
  filledSquare:{...sharedSurfaces,
    walls:'7dd46667499fef9063d51e5c15338f27ac8d7083b5e564b3be31cbc0bb23ef29',
    floor:'f541a0372f5e8816b8a45886068ec77c77cc13b8737da3ea97fcad7e8420b792',
    layout:'dd63c0390483aee20d85dd2b1fc78559eacfc2c98c93b20f4712b3c7adea81d5'},
  concept:{...sharedSurfaces,
    walls:'3bf16abb4b3e5098260454cbf886cd91eff040af3b05fe4d667092e8b0c23dd3',
    floor:'043e07ea953ed0272d0530ec8bc16f1eef54abd4027386e026a571e2040e8200',
    layout:'a793f1fce29277b9218002a516673afcb0f740181a487ee5da70bd432408e8be'}
};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const arrayState=array=>array?{type:array.constructor.name,length:array.length,
  sha256:createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex')}:null;
const attributeState=attribute=>attribute?{itemSize:attribute.itemSize,normalized:attribute.normalized,
  array:arrayState(attribute.array)}:null;
function textureState(texture){
  if(!texture)return null;
  const image=texture.image;
  return {width:image.width,height:image.height,pixels:arrayState(image.pixels),commands:image.commands,
    colorSpace:texture.colorSpace,wrapS:texture.wrapS,wrapT:texture.wrapT,anisotropy:texture.anisotropy,
    minFilter:texture.minFilter,magFilter:texture.magFilter,generateMipmaps:texture.generateMipmaps,
    flipY:texture.flipY,channel:texture.channel,offset:texture.offset.toArray(),repeat:texture.repeat.toArray(),
    center:texture.center.toArray(),rotation:texture.rotation};
}
function materialState(material){
  const state={};
  for(const key of Object.keys(material).sort()){
    if(['id','uuid','version'].includes(key))continue;
    const value=material[key];
    if(value===null||['number','string','boolean'].includes(typeof value))state[key]=value;
    else if(value?.isTexture)state[key]=textureState(value);
    else if(value?.isColor||value?.isVector2||value?.isVector3)state[key]=value.toArray();
  }
  return state;
}
function signatures(group){
  group.updateMatrixWorld(true);
  const walls=[],floor=[],materials=[];
  group.traverse(object=>{
    if(!object.isMesh)return;
    const geometry=object.geometry;
    const state={name:object.name,matrix:object.matrixWorld.toArray(),castShadow:object.castShadow,
      receiveShadow:object.receiveShadow,visible:object.visible,
      attributes:Object.fromEntries(Object.keys(geometry.attributes).sort().filter(key=>key!=='mirrorSide')
        .map(key=>[key,attributeState(geometry.attributes[key])])),
      index:attributeState(geometry.index),groups:geometry.groups,drawRange:geometry.drawRange,
      count:object.isInstancedMesh?object.count:null,
      instanceMatrix:attributeState(object.instanceMatrix),instanceColor:attributeState(object.instanceColor)};
    (object.name.startsWith('stone-wall-')?walls:floor).push(state);
    materials.push({name:object.name,materials:(Array.isArray(object.material)?object.material:[object.material]).map(materialState)});
  });
  const {wallBounds,wallWidth,wallHeight,pavingCount,stoneStyle,stoneBlocks}=group.userData;
  return {walls:hash(walls),floor:hash(floor),materials:hash(materials),
    textures:hash(group.userData.surfaceTextures.map(textureState)),
    layout:hash({wallBounds,wallWidth,wallHeight,pavingCount,stoneStyle,stoneBlocks})};
}

let mirrorTriangles=0,protectedTriangles=0,maskVertices=0;
try{
  for(const [name,maze]of Object.entries(fixtures)){
    const group=buildDuskMaze(maze);
    try{
      assert.deepEqual(signatures(group),expected[name],
        `${name}: reflection setup preserves release 0.3.25 geometry, floor, palette, textures and layout`);
      const stone=group.getObjectByName('stone-wall-blocks'),geometry=stone.geometry;
      const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
      const mask=geometry.getAttribute('mirrorSide'),indices=geometry.index;
      assert.ok(mask?.array instanceof Float32Array,`${name}: wall sides have a Float32 reflection mask`);
      assert.equal(mask.itemSize,1,`${name}: the mask has one value per vertex`);
      assert.equal(mask.count,positions.count,`${name}: the mask covers every wall vertex`);
      group.traverse(object=>{
        if(!object.isMesh||object===stone)return;
        const otherMask=object.geometry.getAttribute('mirrorSide');
        if(['stone-wall-channels','stone-wall-inlays','stone-wall-spill'].includes(object.name)&&otherMask){
          assert.equal(otherMask.count,object.geometry.getAttribute('position').count);
          assert.ok(otherMask.array.every(value=>value===0),`${name}: crown details never become reflective`);
        }else assert.ok(!otherMask,`${name}: floor and wall core receive no mirror mask`);
      });
      const count=indices?indices.count:positions.count;
      assert.equal(count%3,0,`${name}: complete wall triangles`);
      let selected=0,protectedFaces=0;
      for(let first=0;first<count;first+=3){
        const vertices=[0,1,2].map(offset=>indices?indices.getX(first+offset):first+offset);
        const values=vertices.map(vertex=>mask.getX(vertex));maskVertices+=3;
        assert.ok(values.every(value=>value===0||value===1),`${name}: reflection coverage is binary`);
        assert.ok(values.every(value=>value===values[0]),`${name}: a triangle never mixes reflective and matte vertices`);
        // Classify the actual rendered planes, independent of profile indices.
        // The narrow lower bevel and the sloping crown remain ordinary stone.
        const verticalSide=vertices.every(vertex=>Math.abs(normals.getY(vertex))<.05&&
          positions.getY(vertex)>=.095*WALL_HEIGHT-1e-6&&positions.getY(vertex)<=.92*WALL_HEIGHT+1e-6);
        assert.equal(values[0],verticalSide?1:0,
          `${name}: triangle ${first/3} selects only the upright band, preserving crown and lower bevel`);
        if(values[0])selected++;else protectedFaces++;
      }
      assert.ok(selected>0&&protectedFaces>0,`${name}: both reflective sides and protected stone faces are present`);
      mirrorTriangles+=selected;protectedTriangles+=protectedFaces;
    }finally{disposeDuskMaze(group);}
  }
}finally{
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);
  else delete globalThis.document;
}
console.log(JSON.stringify({baseline:'0.3.25 / 30402bd',fixtures:Object.keys(fixtures).length,
  mirrorTriangles,protectedTriangles,maskVertices}));
