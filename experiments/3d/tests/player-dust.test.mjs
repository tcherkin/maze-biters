import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerCrystalDust} from '../player-vapor.mjs';

function run(fps,speed,direction={x:1,z:0}){
  const dust=new PlayerCrystalDust();dust.update(0,{x:0,z:0},true,0);
  const counts=[];let maxReach=0;
  for(let frame=1;frame<=fps*2;frame++){
    const t=frame/fps,p={x:direction.x*t*speed,z:direction.z*t*speed};
    dust.update(t*500,p,true,1/fps);counts.push(dust.active);
    for(let i=0;i<dust.particles.length;i++)if(dust.alphas[i]>.008){
      const reach=Math.hypot(dust.positions[i*3]-p.x,dust.positions[i*3+2]-p.z)+dust.sizes[i]/2;
      maxReach=Math.max(maxReach,reach);
      assert.ok(reach<1.6,'The complete grain footprint fits below a hero diameter, even at maximum speed');
      assert.ok((dust.positions[i*3]-p.x)*direction.x+(dust.positions[i*3+2]-p.z)*direction.z<0,'Births follow actual travel');
    }
  }
  return {dust,counts,maxReach};
}
test('sparse distance-limited dust follows straight/diagonal motion at all frame rates and speeds',()=>{
  for(const speed of [5,10,42])for(const direction of [{x:1,z:0},{x:Math.SQRT1_2,z:-Math.SQRT1_2}]){
    const results=[15,30,60,120].map(fps=>run(fps,speed,direction));
    for(const result of results){
      assert.ok(Math.max(...result.counts)<=6,'At most six simultaneous visible grains');
      assert.ok(result.counts.some(n=>n>=3),'Several subtle grains remain visible in normal movement');
      assert.equal(result.dust.geometry.attributes.position.count,12);
      assert.equal(result.dust.material.depthTest,true);assert.equal(result.dust.material.depthWrite,false);
    }
    for(const result of results.slice(1)){
      assert.equal(result.dust.serial,results[0].dust.serial,'Emission count does not depend on frame rate');
      assert.ok(Math.abs(result.dust.clock-results[0].dust.clock)<1e-8);
    }
  }
});
test('stop ends emission, residual grains fade in real time, pause freezes and disabling performs no updates',()=>{
  const {dust}=run(60,10),serial=dust.serial,clock=dust.clock;
  dust.update(1000,{x:20,z:0},true,10);assert.equal(dust.clock,clock,'A paused game does not age particles');
  for(let i=1;i<=31;i++)dust.update(1000+i*500/60,{x:20,z:0},true,1/60);
  assert.equal(dust.serial,serial);assert.equal(dust.active,0);assert.equal(dust.group.visible,false);
  dust.setEnabled(false);dust.update(2000,{x:25,z:0},true,1);assert.equal(dust.clock,0);assert.equal(dust.serial,0);
  dust.setEnabled(true);dust.update(2100,{x:25,z:0},true,.1);dust.update(2150,{x:26,z:0},true,.1);
  assert.ok(dust.active>0);dust.update(2200,{x:26,z:0},false,.1);assert.equal(dust.active,0);
});
test('particles do not spawn or drift through wall faces at a tight turn',()=>{
  const dust=new PlayerCrystalDust();dust.setWalls([{minX:0,maxX:2,minZ:0,maxZ:2}]);
  for(let frame=0;frame<=120;frame++){
    const t=frame/60,p=t<1?{x:-.2,z:1.8-2*t}:{x:-.2+2*(t-1),z:-.2};
    dust.update(t*500,p,true,1/60);
    for(let i=0;i<12;i++)if(dust.alphas[i]>.008){
      const x=dust.positions[i*3],z=dust.positions[i*3+2];
      assert.ok(!(x>=-.045&&x<=2.045&&z>=-.045&&z<=2.045));
    }
  }
  assert.equal(dust.clearPath(-1,1,3,1),false,'Cross-wall birth segments are rejected');
});
