import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {buildDuskMaze,disposeDuskMaze,setDuskLightingVariant} from '../environment.mjs';
import {WallMirrors} from '../wall-mirrors.mjs';

function maze(){
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');
  globalThis.document={createElement(){return {width:0,height:0,getContext(){return {
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
    putImageData(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}
  };}};}};
  try{return buildDuskMaze(['#######','#.....#','#.###.#','#.....#','#######']);}
  finally{if(original)Object.defineProperty(globalThis,'document',original);else delete globalThis.document;}
}
function compile(material){
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader,{});return shader;
}
const ground=group=>group.children.find(o=>o.isInstancedMesh&&o.material.userData.backgroundLightGain).material;

test('Default/current lighting preserves the exact baseline shader and floor gain',()=>{
  const group=maze(),mirror=new WallMirrors({});
  try{
    mirror.attach(group);
    const stone=group.getObjectByName('stone-wall-blocks').material,floor=ground(group);
    const before=compile(stone),hook=stone.onBeforeCompile,key=stone.customProgramCacheKey;
    const floorHook=floor.onBeforeCompile,floorKey=floor.customProgramCacheKey;
    assert.equal(setDuskLightingVariant(group),'current');
    assert.equal(floor.userData.backgroundLightGain.value,.88);
    assert.equal(stone.onBeforeCompile,hook);assert.equal(stone.customProgramCacheKey,key);
    assert.equal(floor.onBeforeCompile,floorHook);assert.equal(floor.customProgramCacheKey,floorKey);
    assert.deepEqual(compile(stone),before);
    assert.equal(setDuskLightingVariant(group,'unknown'),'current','Unrecognized query never activates the experiment');
  }finally{mirror.dispose();disposeDuskMaze(group);}
});

test('Contrast changes only broad environment contribution and composes mirror shading without new geometry or materials',()=>{
  const group=maze(),mirror=new WallMirrors({}),scene=new THREE.Scene();scene.add(group);
  const actor=new THREE.Mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshStandardMaterial({color:0x79b439}));scene.add(actor);
  const lamp=new THREE.SpotLight(0xffd276,150,11.4,.48,.70,1.5);scene.add(lamp);
  const actorHook=actor.material.onBeforeCompile,actorKey=actor.material.customProgramCacheKey;
  try{
    mirror.attach(group);
    const before=group.children.map(o=>({object:o,geometry:o.geometry,material:o.material,
      color:o.material?.color?.getHex(),roughness:o.material?.roughness,metalness:o.material?.metalness,
      map:o.material?.map,instanceMatrix:o.instanceMatrix?.array.slice(),instanceColor:o.instanceColor?.array.slice()}));
    const stone=group.getObjectByName('stone-wall-blocks').material;
    const neon=group.getObjectByName('stone-wall-inlays').material,neonHook=neon.onBeforeCompile;
    setDuskLightingVariant(group,'contrast');
    assert.equal(ground(group).userData.backgroundLightGain.value,.64);
    assert.equal(stone.userData.duskBackgroundLightGain.value,.78);
    const shader=compile(stone);
    assert.equal(shader.uniforms.duskBackgroundGain.value,.78);
    assert.ok(shader.fragmentShader.includes('directLight.color *= duskBackgroundGain;'));
    assert.ok(shader.fragmentShader.includes('irradiance *= duskBackgroundGain;'));
    // Point/spot light evaluation is unmodified; the floor and wall hooks
    // affect only directional + pre-IBL ambient/hemisphere contributions.
    const chunk=THREE.ShaderChunk.lights_fragment_begin;
    for(const name of ['getPointLightInfo','getSpotLightInfo']){
      const line=chunk.split('\n').find(s=>s.includes(name+'('));assert.ok(line&&shader.fragmentShader.includes(line));
      assert.ok(!shader.fragmentShader.includes(line+'\n directLight.color *= duskBackgroundGain;'));
    }
    assert.ok(shader.fragmentShader.includes('outgoingLight=mix(outgoingLight,coated,reflected.a*.86);'));
    assert.ok(shader.vertexShader.includes('vWallMirrorSide=mirrorSide;'));
    assert.equal(neon.onBeforeCompile,neonHook);assert.equal(neon.userData.duskBackgroundLightGain,undefined);
    assert.equal(actor.material.onBeforeCompile,actorHook);assert.equal(actor.material.customProgramCacheKey,actorKey);
    assert.deepEqual([lamp.color.getHex(),lamp.intensity,lamp.distance,lamp.angle,lamp.penumbra,lamp.decay],
      [0xffd276,150,11.4,.48,.70,1.5]);
    assert.equal(group.children.length,before.length);
    for(const old of before){
      const o=old.object;assert.equal(o.geometry,old.geometry);assert.equal(o.material,old.material);
      assert.equal(o.material?.color?.getHex(),old.color);assert.equal(o.material?.roughness,old.roughness);
      assert.equal(o.material?.metalness,old.metalness);assert.equal(o.material?.map,old.map);
      if(old.instanceMatrix)assert.deepEqual(o.instanceMatrix.array,old.instanceMatrix);
      if(old.instanceColor)assert.deepEqual(o.instanceColor.array,old.instanceColor);
    }
  }finally{mirror.dispose();disposeDuskMaze(group);actor.geometry.dispose();actor.material.dispose();}
});

test('Frozen-frame switching restores exact current shader; repeated attachment never stacks contrast hooks',()=>{
  const group=maze(),mirror=new WallMirrors({});
  try{
    mirror.attach(group);
    const stone=group.getObjectByName('stone-wall-blocks').material;
    const baseline=compile(stone),key=stone.customProgramCacheKey(),hook=stone.onBeforeCompile;
    for(let i=0;i<3;i++){
      setDuskLightingVariant(group,'contrast');
      const contrastHook=stone.onBeforeCompile;
      setDuskLightingVariant(group,'contrast');assert.equal(stone.onBeforeCompile,contrastHook);
      assert.equal(compile(stone).fragmentShader.split('uniform float duskBackgroundGain;').length,2);
      setDuskLightingVariant(group,'current');
      assert.equal(stone.onBeforeCompile,hook);assert.equal(stone.customProgramCacheKey(),key);
      assert.deepEqual(compile(stone),baseline);assert.equal(ground(group).userData.backgroundLightGain.value,.88);
    }
    setDuskLightingVariant(group,'contrast');mirror.attach(group);setDuskLightingVariant(group,'contrast');
    const shader=compile(stone);
    assert.equal(shader.fragmentShader.split('uniform float duskBackgroundGain;').length,2);
    assert.ok(shader.uniforms.wallMirrorReady&&shader.uniforms.duskBackgroundGain);
    setDuskLightingVariant(group,'current');assert.deepEqual(compile(stone),baseline);
  }finally{mirror.dispose();disposeDuskMaze(group);}
});
