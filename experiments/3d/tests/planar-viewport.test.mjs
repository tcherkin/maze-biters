import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three.module.min.js';
import {PlanarWallMirrors} from '../planar-wall-mirrors.mjs';

// These are the installed WebGLRenderer r180 semantics, not CSS rectangles:
// public viewport/scissor setters multiply by DPR even on a render target;
// setRenderTarget copies target.viewport/scissor directly in physical pixels.
// Reproducing both paths catches atlas bugs that disappear on DPR 1 screens.
class ViewportRenderer {
  constructor(pixelRatio, failAt=0){
    this.pixelRatio=pixelRatio;this.failAt=failAt;
    this.viewport=new THREE.Vector4(11,7,901,503);
    this.scissor=new THREE.Vector4(19,13,821,457);
    this.currentViewport=this.viewport.clone().multiplyScalar(pixelRatio).floor();
    this.currentScissor=this.scissor.clone().multiplyScalar(pixelRatio).floor();
    this.scissorTest=true;this.currentScissorTest=true;
    this.target=null;this.face=0;this.mip=0;
    this.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,1,0),-2)];
    this.autoClear=true;this.captures=[];this.clears=[];
    this.shadowMap={autoUpdate:true,needsUpdate:true};
    this.drawingBufferSize=new THREE.Vector2(1280,900);
    this.capabilities={maxTextureSize:16384};
    this.clearColor=new THREE.Color(.17,.23,.31);this.clearAlpha=.7;
    this.extensions={has:()=>false};this.info={render:{calls:3,triangles:12}};
  }
  getPixelRatio(){return this.pixelRatio;}
  getDrawingBufferSize(out){return out.copy(this.drawingBufferSize);}
  getClearColor(out){return out.copy(this.clearColor);}
  getClearAlpha(){return this.clearAlpha;}
  setClearColor(color,alpha=1){this.clearColor.set(color);this.clearAlpha=alpha;}
  getRenderTarget(){return this.target;}
  getActiveCubeFace(){return this.face;}
  getActiveMipmapLevel(){return this.mip;}
  getViewport(out){return out.copy(this.viewport);}
  getCurrentViewport(out){return out.copy(this.currentViewport);}
  getScissor(out){return out.copy(this.scissor);}
  getScissorTest(){return this.scissorTest;}
  setViewport(x,y,z,w){
    x?.isVector4?this.viewport.copy(x):this.viewport.set(x,y,z,w);
    this.currentViewport.copy(this.viewport).multiplyScalar(this.pixelRatio).round();
  }
  setScissor(x,y,z,w){
    x?.isVector4?this.scissor.copy(x):this.scissor.set(x,y,z,w);
    this.currentScissor.copy(this.scissor).multiplyScalar(this.pixelRatio).round();
  }
  setScissorTest(value){this.scissorTest=this.currentScissorTest=value;}
  setRenderTarget(target,face=0,mip=0){
    this.target=target;this.face=face;this.mip=mip;
    if(target){
      this.currentViewport.copy(target.viewport);
      this.currentScissor.copy(target.scissor);
      this.currentScissorTest=target.scissorTest;
    }else{
      this.currentViewport.copy(this.viewport).multiplyScalar(this.pixelRatio).floor();
      this.currentScissor.copy(this.scissor).multiplyScalar(this.pixelRatio).floor();
      this.currentScissorTest=this.scissorTest;
    }
  }
  clear(){this.clears.push(this.snapshot());}
  render(){
    this.captures.push(this.snapshot());
    if(this.captures.length===this.failAt)throw new Error('Injected mirror render failure');
    this.shadowMap.needsUpdate=false;
  }
  snapshot(){
    return {target:this.target,face:this.face,mip:this.mip,
      viewport:this.viewport.toArray(),scissor:this.scissor.toArray(),
      currentViewport:this.currentViewport.toArray(),currentScissor:this.currentScissor.toArray(),
      scissorTest:this.scissorTest,currentScissorTest:this.currentScissorTest,
      clippingPlanes:this.clippingPlanes,autoClear:this.autoClear,
      shadowAuto:this.shadowMap.autoUpdate,shadowNeeds:this.shadowMap.needsUpdate,
      clearColor:this.clearColor.toArray(),clearAlpha:this.clearAlpha};
  }
}

function fixture(pixelRatio,failAt,nested){
  const renderer=new ViewportRenderer(pixelRatio,failAt);
  // Exercise callers that update shadows automatically and callers that only
  // explicitly request an update; capture must restore either configuration.
  renderer.shadowMap.autoUpdate=!nested;
  const previousTarget=nested?new THREE.WebGLRenderTarget(256,128):null;
  if(previousTarget){
    previousTarget.viewport.set(3,5,227,109);
    previousTarget.scissor.set(7,9,211,97);
    previousTarget.scissorTest=true;
    renderer.setRenderTarget(previousTarget,0,0);
  }
  const scene=new THREE.Scene();
  const originalMaterial=new THREE.MeshPhysicalMaterial({color:0x28a91f,transmission:.8});
  const actor=new THREE.Mesh(new THREE.BoxGeometry(),originalMaterial);
  const vapor=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}));
  scene.add(actor,vapor);
  const camera=new THREE.OrthographicCamera(-8,8,6,-6,.1,100);
  camera.position.set(0,7,7);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const mirrors=new PlanarWallMirrors(renderer);
  // Selection is an independent policy; six captures cross the atlas row edge.
  mirrors.choose=()=>{};
  mirrors.selected=[0,1,2,3,4,5].map((constant,i)=>({key:String(i),
    plane:new THREE.Plane(new THREE.Vector3(0,0,1),constant),
    segments:[{minX:-3,maxX:3,minZ:-constant,maxZ:-constant}]}));
  return {renderer,previousTarget,scene,camera,mirrors,actor,originalMaterial,vapor};
}
function disposeFixture(f){
  f.mirrors.dispose();f.previousTarget?.dispose();
  f.actor.geometry.dispose();f.originalMaterial.dispose();
  f.vapor.geometry.dispose();f.vapor.material.dispose();
}

for(const pixelRatio of [1,1.25,1.5,2]){
  for(const nested of [false,true]){
    for(const failAt of [0,5]){
      test(`planar atlas physical tiles and state: DPR ${pixelRatio}, ${nested?'nested target':'canvas'}, ${failAt?'error':'success'}`,()=>{
        assert.equal(THREE.REVISION,'180','Fake renderer is scoped to the installed Three.js release');
        const f=fixture(pixelRatio,failAt,nested);
        const before=f.renderer.snapshot();
        try{
          if(failAt)assert.throws(()=>f.mirrors.render(f.scene,f.camera,[]),/Injected mirror render failure/);
          else f.mirrors.render(f.scene,f.camera,[]);
          assert.equal(f.renderer.captures.length,failAt||6);
          const tileOrigins=[[0,0],[512,0],[1024,0],[1536,0],[0,96],[512,96]];
          for(const [i,capture] of f.renderer.captures.entries()){
            const scale=f.mirrors.uniforms.wallPlanarScales.value[i];
            const expected=[...tileOrigins[i],scale.x*512,scale.y*96];
            assert.deepEqual(capture.currentViewport,expected,`slot ${i} uses its exact physical atlas pixels`);
            assert.deepEqual(capture.currentScissor,expected,`slot ${i} cannot clear/draw into another slot`);
            assert.ok(expected[2]>=8&&expected[2]<=512&&expected[3]>=8&&expected[3]<=96,
              'each used rectangle fits its reserved tile and has enough texels');
            assert.equal(expected[2]%8,0);assert.equal(expected[3]%8,0);
            assert.equal(capture.currentScissorTest,true);
            assert.equal(capture.target,f.mirrors.target);
            assert.ok(expected[0]+expected[2]<=capture.target.width);
            assert.ok(expected[1]+expected[3]<=capture.target.height);
            assert.equal(capture.shadowAuto,i===0?before.shadowAuto:false,
              'the first capture follows caller shadow policy, subsequent captures reuse the shadow map');
            assert.equal(capture.shadowNeeds,i===0?before.shadowNeeds:false,
              'only the first capture consumes a requested shadow update');
          }
          const rectangles=f.renderer.captures.map(c=>c.currentViewport);
          for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){
            const [x,y,w,h]=rectangles[i],[otherX,otherY,otherW,otherH]=rectangles[j];
            assert.ok(x+w<=otherX||otherX+otherW<=x||y+h<=otherY||otherY+otherH<=y,
              `atlas slots ${i} and ${j} do not overlap, including across rows`);
          }
          assert.equal(rectangles[3][0],1536,'last first-row slot keeps its fixed atlas origin');
          assert.ok(rectangles[3][0]+rectangles[3][2]<=2048,'its used rectangle stays within the atlas edge');
          assert.equal(rectangles[4][0],0,'next row restarts at the atlas left edge');
          assert.equal(rectangles[4][1],96,'next row begins after a full reserved tile, including unused padding');
          assert.ok(rectangles.some(rect=>rect[2]<512||rect[3]<96),'small walls do not shade their entire reserved tile');
          assert.equal(f.renderer.clears.length,1);
          assert.deepEqual(f.renderer.clears[0].currentViewport,[0,0,2048,576]);
          assert.equal(f.renderer.clears[0].currentScissorTest,false,'clear includes the whole atlas, including an unused slot');
          assert.deepEqual(f.renderer.clears[0].clearColor,[0,0,0],'unrendered reflection pixels have no baked-in sky color');
          assert.equal(f.renderer.clears[0].clearAlpha,0,'unrendered reflection pixels are transparent');
          assert.deepEqual(f.mirrors.target.viewport.toArray(),[0,0,2048,576],'atlas viewport resets for its next capture');
          assert.deepEqual(f.mirrors.target.scissor.toArray(),[0,0,2048,576],'atlas scissor resets for its next capture');
          assert.equal(f.mirrors.target.scissorTest,false);
          assert.deepEqual(f.renderer.snapshot(),before,'mirror render restores canvas/target, viewport, scissor, clipping, autoClear, shadows and clear color/alpha');
          assert.equal(f.renderer.clippingPlanes,before.clippingPlanes,'caller clipping planes retain their identity');
          assert.equal(f.actor.material,f.originalMaterial,'temporary capture material is restored');
          assert.equal(f.vapor.visible,true,'hidden transparent effects are restored');
          assert.equal(f.mirrors.uniforms.wallPlanarCount.value,failAt?0:6,'failed atlas is never sampled');
        }finally{disposeFixture(f);}
      });
    }
  }
}

test('mirror resolution follows display size, respects GPU limits and disposes replaced targets once',()=>{
  const f=fixture(1.5,0,false);
  const cases=[
    {buffer:[1280,900],maximum:16384,tile:[512,96]},
    {buffer:[1500,950],maximum:16384,tile:[512,96]},
    {buffer:[1920,1080],maximum:16384,tile:[1024,192]},
    {buffer:[3840,2160],maximum:16384,tile:[2048,384]},
    {buffer:[5000,2160],maximum:4096,tile:[1024,192]},
    {buffer:[3840,2160],maximum:2048,tile:[512,96]},
    {buffer:[1280,900],maximum:16384,tile:[512,96]}
  ];
  let originalMatrices;
  try{
    for(const {buffer,maximum,tile} of cases){
      f.renderer.drawingBufferSize.set(...buffer);f.renderer.capabilities.maxTextureSize=maximum;
      f.renderer.captures.length=f.renderer.clears.length=0;
      const previous=f.mirrors.target,oldSize=previous&&[previous.width,previous.height],before=f.renderer.snapshot();
      let disposed=0;const onDispose=()=>disposed++;previous?.addEventListener('dispose',onDispose);
      try{f.mirrors.render(f.scene,f.camera,[]);}
      finally{previous?.removeEventListener('dispose',onDispose);}
      const target=f.mirrors.target;
      assert.deepEqual([f.mirrors.tileWidth,f.mirrors.tileHeight],tile,'display tier sets available detail per wall');
      assert.deepEqual([target.width,target.height],[tile[0]*4,tile[1]*6]);
      assert.ok(target.width<=maximum&&target.height<=maximum,'both atlas dimensions fit the GPU texture limit');
      if(previous){
        const resized=oldSize[0]!==target.width||oldSize[1]!==target.height;
        assert.equal(disposed,resized?1:0,'a size transition releases the old GPU allocation exactly once');
        if(!resized)assert.equal(target,previous,'same-tier resizes reuse the existing atlas');
      }
      assert.deepEqual(f.renderer.snapshot(),before,'resolution changes preserve renderer state');
      assert.equal(f.renderer.clears.length,1);
      assert.deepEqual(f.renderer.clears[0].currentViewport,[0,0,target.width,target.height]);
      assert.equal(f.renderer.clears[0].clearAlpha,0);
      for(const [i,capture] of f.renderer.captures.entries()){
        const scale=f.mirrors.uniforms.wallPlanarScales.value[i],rect=capture.currentViewport;
        assert.deepEqual(rect,[(i%4)*tile[0],Math.floor(i/4)*tile[1],scale.x*tile[0],scale.y*tile[1]],
          'shader sampling scales address exactly the physically rendered rectangle');
        assert.ok(rect[2]>=8&&rect[2]<=tile[0]&&rect[3]>=8&&rect[3]<=tile[1]);
        assert.equal(rect[2]%8,0);assert.equal(rect[3]%8,0);
      }
      const matrices=f.mirrors.uniforms.wallPlanarMatrices.value.slice(0,6).map(matrix=>matrix.toArray());
      if(originalMatrices)assert.deepEqual(matrices,originalMatrices,'quality changes do not change reflection geometry');
      else originalMatrices=matrices;
    }
  }finally{disposeFixture(f);}
});
