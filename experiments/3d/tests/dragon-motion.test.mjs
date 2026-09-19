import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {DragonMotion,dragonWallBounds,dragonSegmentClear} from '../dragon-motion.mjs';
import {DragonPaddling} from '../dragon-paddling.mjs';
import {DragonForm} from '../dragon-form.mjs';
import {createCrystalDragon} from '../models/crystal-dragon.mjs';
import {worldLayout,PLAYER_SCALE,WALL_HEIGHT} from '../world.mjs';
import {CONCEPT_MAZE,PLAYER_SPAWN} from '../maze-layout.mjs';

const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const openMaze=Array.from({length:25},(_,y)=>y===0||y===24?'#'.repeat(25):'#'+'.'.repeat(23)+'#');
function fixture(maze=openMaze,start={x:10,y:10},heading=0){
  const look=createCrystalDragon(),root=look.model,layout=worldLayout(maze),walls=dragonWallBounds(maze,layout);
  root.scale.setScalar(PLAYER_SCALE);root.position.set(layout.x(start.x),0,layout.z(start.y));root.rotation.y=heading;
  const player={x:start.x,y:start.y,dir:{x:Math.sin(heading),y:Math.cos(heading)},visual:{...start},dead:false,hidden:false};
  const snapshot={time:0,maze,player,paused:false,level:1},motion=new DragonMotion({rig:root.userData.dragonRig,scale:PLAYER_SCALE});
  const paddling=new DragonPaddling({rig:root.userData.paddleRig,walls});
  motion.update(root,player,snapshot,layout,1/120,walls);return {look,root,layout,walls,player,snapshot,motion,paddling};
}
function update(f,x,y,heading,dt=1/120){
  f.root.position.set(f.layout.x(x),0,f.layout.z(y));f.root.rotation.y=heading;
  f.player.visual={x,y};f.snapshot.time+=dt*1000;f.motion.update(f.root,f.player,f.snapshot,f.layout,dt,f.walls);
  f.root.updateMatrixWorld(true);f.root.userData.dragonRig.skeleton.update();
}
function advance(f,target,speed=5,check=()=>{}){
  const start={...f.player.visual},dx=target.x-start.x,dy=target.y-start.y,dist=Math.hypot(dx,dy)*2,heading=Math.atan2(dx,dy);
  f.player.x=target.x;f.player.y=target.y;f.player.dir={x:Math.sign(dx),y:Math.sign(dy)};
  const steps=Math.max(1,Math.ceil(dist/(speed/120)));
  for(let i=1;i<=steps;i++){update(f,start.x+dx*i/steps,start.y+dy*i/steps,heading,dist/speed/steps);check(f,i);}
}
function nativeMeshVertices(root,callback){
  root.updateMatrixWorld(true);root.userData.dragonRig.skeleton.update();const v=new THREE.Vector3();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;const attribute=mesh.geometry.attributes.position;
    for(let i=0;i<attribute.count;i++){
      v.fromBufferAttribute(attribute,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld);
      assert.ok(Number.isFinite(v.x+v.y+v.z),`${mesh.name} has invalid posed geometry`);callback(v,mesh);
    }
  });
}
function assertWallGeometry(f){
  const paws=f.root.userData.paddleRig?.paws??[];
  const joints=paws.flatMap(p=>p.joints),original=joints.map(j=>j.object.quaternion.clone());
  // Actual coupled strokes at both speed profiles include reach, power stroke,
  // full curl and return. Dense 256-phase size/chain coverage lives in the
  // paddling tests; this audit adds all production-wall corners and routes.
  const poses=process.env.DRAGON_PAWS_EXTREME==='1'?
    [0,1].flatMap(glide=>Array.from({length:6},(_,i)=>[i/6,glide])):[[null,null]];
  try{for(const [phase,glide]of poses){
    if(phase!==null)f.paddling.pose(phase,1,glide);
    try{assertWallGeometryPose(f);}catch(error){throw new Error(`${error.message} (paddle phase ${phase}, glide ${glide}, root ${f.player.visual.x},${f.player.visual.y}, yaw ${f.root.rotation.y})`,{cause:error});}
  }}finally{joints.forEach((j,i)=>j.object.quaternion.copy(original[i]));}
}
function assertWallGeometryPose(f){
  let violations=0,first='';
  const reach=Math.max(4.5,(f.root.userData.dragonVisualLength??2)*2+.5);
  const walls=f.walls.filter(b=>b.maxX>f.root.position.x-reach&&b.minX<f.root.position.x+reach&&
    b.maxZ>f.root.position.z-reach&&b.minZ<f.root.position.z+reach);
  nativeMeshVertices(f.root,(p,mesh)=>{
    if(p.y>WALL_HEIGHT+.02)return;
    if(walls.some(b=>p.x>b.minX+1e-5&&p.x<b.maxX-1e-5&&p.z>b.minZ+1e-5&&p.z<b.maxZ-1e-5)){
      violations++;if(!first)first=`${mesh.name} (${mesh.parent?.parent?.parent?.name??mesh.parent?.name??''}) at ${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    }
  });
  assert.equal(violations,0,`${violations} wall vertices: ${first}`);
}
function assertPose(f){
  const d=f.motion.diagnostics();assert.equal(d.ready,true);assert.equal(d.stationClear,true,d.issues.join(','));
  assert.ok(d.arcLength>=d.bodyLength);assert.ok(d.chordDeficit<(d.selfOverlap?.13:.08),`Centerline chord loss ${d.chordDeficit}`);
  near(f.root.userData.dragonRig.bones[0].position.length(),0);near(f.root.userData.dragonRig.bones[0].quaternion.w,1);
  f.root.userData.dragonRig.bones.forEach(b=>{near(b.scale.x,1);near(b.scale.y,1);near(b.scale.z,1);});
}

test('Second-chance form fits one cell with four grounded paws, then regrows without changing the head or route',()=>{
 const f=fixture(),wings=[];f.root.traverse(o=>{if(o.name.includes('folded bat wing'))wings.push(o);});
 const head=f.root.userData.dragonRig.bones[0].children[0],originalScale=head.scale.clone();
 const form={model:f.root,wings};
 try{
  for(const compactness of [0,.25,.5,.75,1]){
   DragonForm.prototype.pose.call(form,{compactness});update(f,10,10,0);
   f.paddling.update(f.root,f.player,f.snapshot,1/120,[]);
   assert.equal(f.root.position.z,f.layout.z(10));assert.ok(head.scale.equals(originalScale));
   for(const p of f.root.userData.paddleRig.paws){
    const sole=p.wrist.getWorldPosition(new THREE.Vector3()).y-p.soleOffset*PLAYER_SCALE;
    assert.ok(Math.abs(sole-.002)<.002,'Four feet remain planted through shrinking');
   }
  }
  let min=Infinity,max=-Infinity,minName='';
  for(let i=0;i<64;i++){
   f.paddling.pose(i/64);nativeMeshVertices(f.root,(p,m)=>{if(p.z-f.root.position.z<min)minName=m.name;min=Math.min(min,p.z-f.root.position.z);max=Math.max(max,p.z-f.root.position.z);});
   for(const side of [-1,1]){
    const paws=f.root.userData.paddleRig.paws;
    const fore=new THREE.Box3().setFromObject(paws.find(p=>p.front&&p.side===side).wrist,true);
    const hind=new THREE.Box3().setFromObject(paws.find(p=>!p.front&&p.side===side).wrist,true);
    assert.ok(fore.min.z-hind.max.z>.025,'Compact front and rear paws must not overlap: '+(fore.min.z-hind.max.z));
   }
  }
  assert.ok(max-min<2.12,`Compact model must fit one cell; bounds ${min},${max} (${minName})`);
  assert.ok(min>=-1.06&&max<=1.06,`Compact form is centered on its contact cell: ${min},${max}`);
  assert.equal(f.root.userData.paddleRig.paws.length,4);
  for(const compactness of [.75,.5,.25,0]){
   DragonForm.prototype.pose.call(form,{compactness});update(f,10,10,0);f.paddling.update(f.root,f.player,f.snapshot,1/120,[]);
  }
  assertPose(f);assert.ok(wings.every(w=>w.scale.z===1));
 }finally{f.look.dispose();}
});

test('Grounded world-space feet remain clear on live corners, diagonal steps and reversals',()=>{
  const f=fixture(CONCEPT_MAZE,{x:7,y:4},Math.PI/2);
  try{
    f.paddling.update(f.root,f.player,f.snapshot,1/120,f.walls);
    for(const [x,y]of [[10,4],[10,8],[12,8],[10,8],[10,4],[7,4]]){
      advance(f,{x,y},10,(g,i)=>{
        g.paddling.update(g.root,g.player,g.snapshot,1/120,g.walls);
        if(i%4===0)assertWallGeometryPose(g);
        for(const foot of g.paddling.feet){
          const ankle=foot.wrist.getWorldPosition(new THREE.Vector3());
          assert.ok(ankle.y-foot.soleOffset*PLAYER_SCALE>=-.005,'A turn cannot push a sole through the paving');
        }
      });
    }
  }finally{f.look.dispose();}
});

test('Every earned cell adds two world units without enlarging the head or the four legs',()=>{
 const maze=Array.from({length:160},(_,y)=>y===0||y===159?'#'.repeat(160):'#'+'.'.repeat(158)+'#');
 const f=fixture(maze,{x:80,y:100});const head=f.root.userData.headRig,headScale=head.scale.clone();
 try{
  for(const cells of [2,3,4,6,10,20,53]){
   f.root.userData.dragonVisualLength=cells;f.motion.reset();update(f,80,100,0);
   f.paddling.update(f.root,f.player,f.snapshot,1/120,[]);
   const box=new THREE.Box3();nativeMeshVertices(f.root,p=>box.expandByPoint(p));
   assert.ok(Math.abs(box.max.z-box.min.z-cells*2)<.02,`Length ${cells}: ${box.max.z-box.min.z}`);
   assert.ok(box.max.x-box.min.x<2);assert.ok(head.scale.equals(headScale));
   assert.equal(f.root.userData.paddleRig.paws.length,4);assert.ok(f.motion.ready);
  }
 }finally{f.look.dispose();}
});

test('A growing six-cell dragon follows corners without cutting across stone or resetting its head',()=>{
 const f=fixture(CONCEPT_MAZE,{x:7,y:4},Math.PI/2);let distance=0;
 try{
  for(const [x,y]of [[10,4],[10,8],[12,8],[12,11],[17,11],[17,13],[3,13],[3,11],[5,11],[5,9],[10,9]]){
   advance(f,{x,y},5,(g,i)=>{
    distance+=5/120;
    g.root.userData.dragonVisualLength=Math.min(6,2+distance/12);
    if(i%12===0)assertWallGeometryPose(g);
   });
  }
  assert.ok(f.motion.lastVisualLength>5);assert.ok(f.motion.ready);
 }finally{f.look.dispose();}
});

test('Long-body detail preserves crystal colors, breathing and rigid attachments; restart releases added geometry',()=>{
 const f=fixture(),rig=f.root.userData.dragonRig,headParent=f.root.userData.headRig.parent;
 const originalGeometry=rig.bodyShell.geometry,originalMaterial=rig.bodyShell.material;
 try{
  f.root.userData.dragonVisualLength=10;f.motion.reset();update(f,10,10,0);
  assert.ok(rig.bones.length>129);assert.equal(f.root.userData.headRig.parent,headParent);
  const geometry=rig.bodyShell.geometry;
  assert.equal(geometry.morphAttributes.position.length,1);assert.ok(geometry.attributes.color);
  const index=geometry.attributes.skinIndex,weight=geometry.attributes.skinWeight;
  for(let i=0;i<index.count;i++){
   assert.ok(index.getY(i)<rig.bones.length);assert.ok(Math.abs(weight.getX(i)+weight.getY(i)-1)<1e-6);
  }
  update(f,10,10,0);assert.equal(rig.bodyShell.geometry,geometry,'No geometry churn at a fixed length');
  let disposed=false;geometry.addEventListener('dispose',()=>{disposed=true;});
  f.root.userData.dragonVisualLength=2;f.motion.reset();update(f,10,10,0);
  assert.ok(disposed);assert.equal(rig.bodyShell.geometry,originalGeometry);assert.equal(rig.bodyShell.material,originalMaterial);
  assert.equal(rig.bones.length,129);assertPose(f);
 }finally{f.look.dispose();}
});

test('Dragon exact wall clearance catches side, corner and spanning collisions',()=>{
  const walls=[{minX:0,maxX:2,minZ:0,maxZ:2}];
  assert.equal(dragonSegmentClear({x:-2,z:-1},{x:3,z:-1},.9,walls),true);
  assert.equal(dragonSegmentClear({x:-2,z:-1},{x:3,z:-1},1.1,walls),false);
  assert.equal(dragonSegmentClear({x:-1,z:-1},{x:-.5,z:-.5},.71,walls),false);
  assert.equal(dragonSegmentClear({x:-1,z:1},{x:3,z:1},0,walls),false);
});

test('Actual spawn seeds a curved, fixed-length body away from the north wall',()=>{
  const f=fixture(CONCEPT_MAZE,PLAYER_SPAWN,0);
  try{assertPose(f);assertWallGeometry(f);const d=f.motion.diagnostics();
    assert.ok(d.seedDirection.z<0,'The initial neck goes behind the forward-facing head');
    assert.ok(d.stations.at(-1).x<f.root.position.x-.5,'The remaining body bends into the free west pocket');
    near(d.bodyLength+f.root.userData.dragonRig.noseZ*PLAYER_SCALE,4,1e-6);
  }finally{f.look.dispose();}
});

test('Straight, clockwise/counterclockwise, S and diagonal routes preserve head contact, distance and finite skinning',()=>{
  const routes=[[[10,11],[10,12],[11,12],[12,12],[12,13]],[[10,11],[10,12],[9,12],[8,12],[8,13]],
    [[10,11],[11,11],[11,12],[12,12],[12,13]],[[11,11],[12,12],[13,12],[14,11],[14,10]]];
  for(const route of routes){const f=fixture();try{
    let expected=0,previous={x:10,y:10};
    for(const [x,y]of route){expected+=Math.hypot(x-previous.x,y-previous.y)*2;advance(f,{x,y},8,g=>assertPose(g));
      assertWallGeometry(f);near(f.root.position.x,f.layout.x(x));near(f.root.position.z,f.layout.z(y));previous={x,y};}
    near(f.motion.travel,expected,1e-6);
  }finally{f.look.dispose();}}
});

test('Real maze cardinal turns, legal diagonals and sparse render frames do not cut walls',()=>{
  const f=fixture(CONCEPT_MAZE,{x:4,y:11},0);
  try{
    for(const [x,y]of [[3,11],[2,11],[1,11],[1,12],[1,13],[2,13],[3,13],[4,13],[5,13]]){
      advance(f,{x,y},10,(g,i)=>{assertPose(g);if(i%3===0)assertWallGeometry(g);});assertWallGeometry(f);
    }
    // A frame crosses a known committed corner. Its render-to-render chord is
    // not the actual route; append must retain the logical endpoint.
    const before=f.motion.travel;f.player.x=5;f.player.y=12;update(f,5,12.9,Math.PI);
    f.player.x=4;f.player.y=12;update(f,4.9,12,Math.PI*1.5,.1);
    assert.ok(f.motion.travel>before);assertPose(f);assertWallGeometry(f);
  }finally{f.look.dispose();}
});

test('Immediate reverse and ricochet retrace without resetting or relocating the tail',()=>{
  for(const ricochet of [false,true]){
    const f=fixture(openMaze,{x:10,y:10},Math.PI/2);
    try{
      advance(f,{x:11,y:10});advance(f,{x:12,y:10});
      const travel=f.motion.travel;let previous=f.motion.diagnostics().stations.at(-1),sawOverlap=false,maxTailStep=0,maxJoint=0;
      f.player.ricochet=ricochet;
      advance(f,{x:11,y:10},8,g=>{
        const d=g.motion.diagnostics(),tail=d.stations.at(-1);maxTailStep=Math.max(maxTailStep,Math.hypot(tail.x-previous.x,tail.z-previous.z));
        previous=tail;sawOverlap||=d.selfOverlap;maxJoint=Math.max(maxJoint,d.maxJointAngle);assert.equal(d.ready,true);assert.equal(d.stationClear,true);assert.ok(d.arcLength>=d.bodyLength);
      });
      assert.ok(sawOverlap,'The approved folded/retracing state is reported');assert.ok(maxTailStep<.12,`Tail jumped ${maxTailStep}`);
      assert.ok(maxJoint<=.550001,`Opposing frames collapse linear skinning: ${maxJoint}`);
      near(f.motion.travel,travel+2);assertWallGeometry(f);
    }finally{f.look.dispose();}
  }
});

test('Exact committed endpoint history survives multiple turns in one render frame and epochs',()=>{
  const f=fixture(openMaze,{x:10,y:10},Math.PI/2);
  try{
    f.player.route={epoch:1,points:[{sequence:0,x:10,y:10,time:0}]};
    f.player.x=11;f.player.y=10;update(f,10.8,10,Math.PI/2);
    const before=f.motion.travel;
    f.player.route.points.push({sequence:1,x:11,y:10,time:10},{sequence:2,x:11,y:11,time:40});
    f.player.x=12;f.player.y=11;update(f,11.8,11,Math.PI/2,.1);
    near(f.motion.travel-before,4,1e-7);assertPose(f);
    assert.ok(f.motion.history.some(p=>p.x===f.layout.x(11)&&p.z===f.layout.z(10)));
    assert.ok(f.motion.history.some(p=>p.x===f.layout.x(11)&&p.z===f.layout.z(11)));
    // Future committed targets must not pull the body ahead of the visual head.
    f.player.route.points.push({sequence:3,x:12,y:11,time:10000});
    const travel=f.motion.travel;update(f,11.8,11,Math.PI/2);near(f.motion.travel,travel);
    f.player.route={epoch:2,points:[{sequence:0,x:15,y:15,time:f.snapshot.time}]};
    f.player.x=15;f.player.y=15;update(f,15,15,0);near(f.motion.travel,0);assertPose(f);
  }finally{f.look.dispose();}
});

test('Diagonals next to actual concave wall corners retain the entire posed envelope',()=>{
  const routes=[[[7,3],[6,4],[5,4],[4,4],[3,4]],[[6,2],[6,1],[7,1],[7,2],[7,3],[6,4]]];
  for(const path of routes){const f=fixture(CONCEPT_MAZE,{x:7,y:2},Math.PI/2);try{
    for(const [x,y]of path)advance(f,{x,y},9,(g,i)=>{assertPose(g);if(i%3===0)assertWallGeometry(g);});
  }finally{f.look.dispose();}}
});

test('Blocked and paused pose stays still; respawn/new level rebuilds history without changing the engine root',()=>{
  const f=fixture(CONCEPT_MAZE,PLAYER_SPAWN);
  try{
    const capture=()=>f.root.userData.dragonRig.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]);
    const before=capture(),travel=f.motion.travel;
    for(let i=0;i<30;i++)update(f,4,11,0);assert.deepEqual(capture(),before);near(f.motion.travel,travel);
    f.snapshot.paused=true;for(let i=0;i<30;i++)update(f,4,11,0);assert.deepEqual(capture(),before);
    f.snapshot.paused=false;f.player.dead=true;update(f,4,11,0);assert.deepEqual(capture(),before);
    f.player.dead=false;f.player.x=5;f.player.y=9;update(f,5,9,Math.PI/2);assertPose(f);assertWallGeometry(f);near(f.motion.travel,0);
    f.snapshot.level=2;f.player.x=4;f.player.y=11;update(f,4,11,0);assertPose(f);assertWallGeometry(f);near(f.motion.travel,0);
  }finally{f.look.dispose();}
});

test('Impossible initialization is reported, never disguised by a shortened body',()=>{
  const maze=['#####','#####','##.##','#####','#####'],f=fixture(maze,{x:2,y:2});
  try{assert.equal(f.motion.ready,false);assert.ok(f.motion.diagnostics().issues.includes('insufficient-spawn-clearance'));
    near(f.root.scale.x,PLAYER_SCALE);f.root.userData.dragonRig.bones.forEach(b=>near(b.scale.z,1));
  }finally{f.look.dispose();}
});

test('Every production floor cell and all eight headings can initialize without shortening',()=>{
  const f=fixture(CONCEPT_MAZE,PLAYER_SPAWN),cornerCases=new Set(['1,1','17,1','9,2','7,6','17,13']);let cases=0;
  try{
    for(let y=0;y<CONCEPT_MAZE.length;y++)for(let x=0;x<CONCEPT_MAZE[y].length;x++)if(CONCEPT_MAZE[y][x]==='.'){
      for(let d=0;d<8;d++){
        f.motion.reset();f.player.x=x;f.player.y=y;update(f,x,y,d*Math.PI/4);cases++;
        const diagnostic=f.motion.diagnostics();assert.ok(diagnostic.ready,`No seed at ${x},${y}, heading ${d}`);
        assert.ok(diagnostic.stationClear,`Unsafe seed at ${x},${y}, heading ${d}`);assert.ok(diagnostic.arcLength>=diagnostic.bodyLength);
        if(cornerCases.has(x+','+y)||process.env.DRAGON_FULL_MAZE==='1')assertWallGeometry(f);
      }
    }
    assert.equal(cases,1280);
  }finally{f.look.dispose();}
});

test('Full production-maze audit: every legal edge after alternating left/right turns',
  {skip:process.env.DRAGON_FULL_MAZE!=='1'},()=>{
    const f=fixture(CONCEPT_MAZE,PLAYER_SPAWN),open=(x,y)=>CONCEPT_MAZE[y]?.[x]==='.';let edges=0,poses=0;
    try{
      for(let y=0;y<CONCEPT_MAZE.length;y++)for(let x=0;x<CONCEPT_MAZE[y].length;x++)if(open(x,y))for(let d=0;d<8;d++){
        const heading=d*Math.PI/4,dx=Math.round(Math.sin(heading)),dy=Math.round(Math.cos(heading));
        if(!open(x+dx,y+dy)||dx&&dy&&(!open(x+dx,y)||!open(x,y+dy)))continue;
        edges++;f.motion.reset();f.player.x=x;f.player.y=y;update(f,x,y,heading+((x+y+d)%2?Math.PI/2:-Math.PI/2));
        f.player.x=x+dx;f.player.y=y+dy;
        for(let frame=1;frame<=8;frame++){
          update(f,x+dx*frame/8,y+dy*frame/8,heading,1/60);assertPose(f);poses++;
          if(frame%2===0)assertWallGeometry(f);
        }
      }
      assert.equal(edges,668);assert.equal(poses,5344);
    }finally{f.look.dispose();}
  });
