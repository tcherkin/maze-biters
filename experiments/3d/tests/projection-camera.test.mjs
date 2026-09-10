import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three.module.min.js';
import {ProjectionCamera,pointerDirection,cameraNorthLimit} from '../projection-camera.mjs';

const focus=new THREE.Vector3(3,0,-2);
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,
  `${actual} differs from ${expected} by more than ${tolerance}`);

function pose(amount,tilt=45,{width=32,height=18,zoom=1,target=focus}={}){
  const camera=new ProjectionCamera();
  camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;
  camera.zoom=zoom;camera.setProjection(amount);
  const radians=THREE.MathUtils.degToRad(tilt),distance=camera.focusDistance;
  camera.position.set(target.x,target.y+distance*Math.cos(radians),target.z+distance*Math.sin(radians));
  camera.lookAt(target);camera.updateMatrixWorld();
  return camera;
}

function clientPoint(camera,rect,point){
  const projected=point.clone().project(camera);
  return {x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2};
}

function horizontalSpan(camera,center){
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
  const leftPoint=center.clone().addScaledVector(right,-.5).project(camera);
  const rightPoint=center.clone().addScaledVector(right,.5).project(camera);
  return Math.abs(rightPoint.x-leftPoint.x);
}

test('north camera limit puts the raised wall below the HUD in every projection',()=>{
  for(const amount of [0,.002,.5,1])for(const degrees of [0,45,55,75]){
    for(const screenHeight of [480,1080,2160])for(const zoom of [1,1.5,2]){
      const tilt=THREE.MathUtils.degToRad(degrees),top=92;
      const camera=pose(amount,degrees,{height:18,zoom});
      const z=cameraNorthLimit(camera,tilt,-14.65,1.16,top,screenHeight);
      const positioned=pose(amount,degrees,{height:18,zoom,target:new THREE.Vector3(0,0,z)});
      for(const x of [-18,0,18]){
        const point=clientPoint(positioned,{left:0,top:0,width:1920,height:screenHeight},new THREE.Vector3(x,1.16,-14.65));
        close(point.y,top,1e-7);
      }
    }
  }
});

test('portrait perspective above the horizon does not create an inverted pan bound',()=>{
  const camera=pose(1,75,{width:25,height:50});
  assert.equal(cameraNorthLimit(camera,THREE.MathUtils.degToRad(75),-14.65,1.16,46,844),Infinity);
});

test('zero projection matches a native orthographic camera, including zoom',()=>{
  for(const tilt of [0,45,75]){
    const camera=pose(0,tilt,{zoom:1.3});
    const native=new THREE.OrthographicCamera(camera.left,camera.right,camera.top,camera.bottom,camera.near,camera.far);
    native.zoom=camera.zoom;native.position.copy(camera.position);native.quaternion.copy(camera.quaternion);
    native.updateProjectionMatrix();native.updateMatrixWorld();
    assert.equal(camera.isOrthographicCamera,true);assert.equal(camera.isPerspectiveCamera,false);
    assert.deepEqual(camera.projectionMatrix.elements,native.projectionMatrix.elements);
    for(const point of [focus,new THREE.Vector3(-6,1.8,7),new THREE.Vector3(8,.9,-9)]){
      assert.ok(point.clone().project(camera).distanceTo(point.clone().project(native))<1e-12);
    }
  }
});

test('focus-plane scale stays fixed and the perspective endpoint matches a native lens',()=>{
  for(const tilt of [0,45,75]){
    const reference=horizontalSpan(pose(0,tilt,{zoom:1.2}),focus);
    for(const amount of [.002,.1,.5,1]){
      const camera=pose(amount,tilt,{zoom:1.2});
      close(horizontalSpan(camera,focus),reference,1e-9);
      const center=focus.clone().project(camera);close(center.x,0);close(center.y,0);
    }
    const camera=pose(1,tilt,{zoom:1.2});
    const fov=THREE.MathUtils.radToDeg(2*Math.atan((camera.top-camera.bottom)/(2*camera.focusDistance)));
    const native=new THREE.PerspectiveCamera(fov,(camera.right-camera.left)/(camera.top-camera.bottom),camera.near,camera.far);
    native.zoom=camera.zoom;native.position.copy(camera.position);native.quaternion.copy(camera.quaternion);
    native.updateProjectionMatrix();native.updateMatrixWorld();
    for(const point of [focus,new THREE.Vector3(-4,.9,6),new THREE.Vector3(7,2,-8)]){
      assert.ok(point.clone().project(camera).distanceTo(point.clone().project(native))<1e-10);
    }
  }
});

test('equally sized farther objects shrink continuously as perspective increases',()=>{
  for(const tilt of [0,45,75]){
    let previousRatio=1;
    for(const amount of [0,.002,.25,.5,1]){
      const camera=pose(amount,tilt),forward=camera.getWorldDirection(new THREE.Vector3());
      const farther=focus.clone().addScaledVector(forward,12),nearer=focus.clone().addScaledVector(forward,-12);
      const centerSize=horizontalSpan(camera,focus),farSize=horizontalSpan(camera,farther),nearSize=horizontalSpan(camera,nearer);
      const ratio=farSize/centerSize;
      if(amount===0){close(farSize,centerSize);close(nearSize,centerSize);}
      else{
        assert.ok(farSize<centerSize&&centerSize<nearSize,'Depth changes size in the correct direction');
        assert.ok(ratio<previousRatio,'Increasing perspective increases the visible depth difference');
      }
      previousRatio=ratio;
    }
  }
});

test('projection and inverse remain finite and round-trip at the orthographic boundary',()=>{
  for(const amount of [0,.002,.5,1])for(const tilt of [0,45,75]){
    const camera=pose(amount,tilt);
    assert.ok([...camera.projectionMatrix.elements,...camera.projectionMatrixInverse.elements].every(Number.isFinite));
    for(const point of [focus,new THREE.Vector3(-7,0,8),new THREE.Vector3(9,3,-10)]){
      const projected=point.clone().project(camera),restored=projected.clone().unproject(camera);
      assert.ok(projected.toArray().every(Number.isFinite));
      assert.ok(restored.distanceTo(point)<1e-6,`Round-trip at amount ${amount}, tilt ${tilt}`);
    }
  }
});

test('reused reflection cameras copy lens flags and matrices in both directions',()=>{
  const copy=new ProjectionCamera();
  for(const amount of [1,0,.002,.5,0]){
    const source=pose(amount,75,{zoom:1.1});copy.copy(source,false);
    assert.equal(copy.isPerspectiveCamera,source.isPerspectiveCamera);
    assert.equal(copy.isOrthographicCamera,source.isOrthographicCamera);
    assert.equal(copy.projectionAmount,source.projectionAmount);assert.equal(copy.focusDistance,source.focusDistance);
    assert.deepEqual(copy.projectionMatrix.elements,source.projectionMatrix.elements);
    assert.deepEqual(copy.projectionMatrixInverse.elements,source.projectionMatrixInverse.elements);
    const rayA=new THREE.Raycaster(),rayB=new THREE.Raycaster(),ndc=new THREE.Vector2(.4,-.3);
    rayA.setFromCamera(ndc,source);rayB.setFromCamera(ndc,copy);
    assert.ok(rayA.ray.origin.distanceTo(rayB.ray.origin)<1e-9);
    assert.ok(rayA.ray.direction.distanceTo(rayB.ray.direction)<1e-9);
  }
});

test('taps recover all eight world directions from the visible body-height anchor',()=>{
  const rect={left:37,top:91,width:1280,height:720};
  const directions=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  for(const amount of [0,.5,1])for(const tilt of [0,45,75]){
    const camera=pose(amount,tilt);
    for(const anchor of [new THREE.Vector3(3,.9,-2),new THREE.Vector3(-3,.9,2)]){
      for(const [x,z] of directions){
        const target=anchor.clone().add(new THREE.Vector3(x*3,0,z*3));
        const client=clientPoint(camera,rect,target);
        const actual=pointerDirection(camera,rect,client.x,client.y,anchor);
        assert.ok(actual&&actual.x===x&&actual.y===z,
          `Tap direction (${x},${z}) at amount ${amount}, tilt ${tilt}: ${JSON.stringify(actual)}`);
      }
    }
  }
});

test('tap deadzone uses CSS pixels and invalid or upward rays do not move the player',()=>{
  const rect={left:37,top:91,width:1280,height:720},anchor=new THREE.Vector3(3,.9,-2);
  for(const amount of [0,.5,1])for(const tilt of [0,45,75]){
    const camera=pose(amount,tilt),center=clientPoint(camera,rect,anchor);
    assert.equal(pointerDirection(camera,rect,center.x,center.y,anchor),null);
    assert.equal(pointerDirection(camera,rect,center.x+11,center.y,anchor),null);
    assert.ok(pointerDirection(camera,rect,center.x+13,center.y,anchor));
    assert.equal(pointerDirection(camera,{...rect,width:0},center.x,center.y,anchor),null);
    assert.equal(pointerDirection(camera,{...rect,height:0},center.x,center.y,anchor),null);
  }
  const camera=pose(1,75,{width:80,height:50});
  const horizonWorld=camera.position.clone().add(new THREE.Vector3(0,0,-100));
  const horizon=clientPoint(camera,rect,horizonWorld);
  assert.equal(pointerDirection(camera,rect,horizon.x,horizon.y,anchor),null,'A horizontal ray has no finite ground hit');
  assert.equal(pointerDirection(camera,rect,horizon.x,horizon.y-20,anchor),null,'Above-horizon taps point away from the game plane');
});
