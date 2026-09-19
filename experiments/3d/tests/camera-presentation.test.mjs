import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraPresentation,cameraLookAhead} from '../camera-presentation.mjs';
import {CameraFollow} from '../camera-follow.mjs';
import {MotionZoom} from '../motion-zoom.mjs';
const snapshot=()=>({started:true,paused:false,player:{dead:false,hidden:false}});
const advance=(c,s,seconds,hz=60)=>{
  const rows=[];for(let i=0;i<seconds*hz;i++)rows.push(c.update(s,1.5,1,1/hz));return rows;
};

test('Menu stays at 1x; level opens smoothly toward 1.5x at every frame rate',()=>{
  const ends=[];
  for(const hz of [30,60,144]){
    const c=new CameraPresentation(),s=snapshot();s.paused=true;
    assert.ok(advance(c,s,2,hz).every(z=>z===1));
    s.paused=false;const rows=advance(c,s,5,hz);
    assert.ok(rows[0]>1&&rows[0]<1.503/hz+1);
    assert.ok(rows.every((z,i)=>z<=1.5&&(!i||z>=rows[i-1])));
    assert.equal(rows.at(-1),1.5);ends.push(rows[hz-1]);
  }
  assert.ok(Math.max(...ends)-Math.min(...ends)<1e-10);
});

test('Death, distant respawn, replay and next level retain the current zoom',()=>{
  const c=new CameraPresentation(),s=snapshot();advance(c,s,5);
  s.player.dead=true;const before=c.zoom;const death=advance(c,s,1);
  assert.ok(death[0]<before&&death[0]>before-.002);
  s.player.hidden=true;advance(c,s,1);
  s.player={dead:false,hidden:false,lives:2,visual:{x:20,y:2}};
  const old=c.zoom;const reborn=advance(c,s,5);
  assert.ok(Math.abs(reborn[0]-old)<.01);assert.equal(c.zoom,1.5);
  c.beginLevel();assert.equal(c.zoom,1.5);
  const replay=advance(c,s,9);
  assert.ok(replay.some(z=>z<1.003));assert.equal(replay.at(-1),1.5);
  assert.ok(replay.slice(1).every((z,i)=>Math.abs(z-replay[i])<.01));
});

test('Motion zoom and tab gaps remain smooth; pause freezes the opening',()=>{
  const c=new CameraPresentation(),s=snapshot();advance(c,s,.5);
  s.paused=true;const old=c.zoom;advance(c,s,3);assert.equal(c.zoom,old);
  s.paused=false;advance(c,s,5);
  const z=c.update(s,1.5,.86,1/60);assert.ok(z<1.5&&z>1.49);
  const gap=c.update(s,1.5,.86,20);assert.ok(Math.abs(gap-z)<.01);
});

test('Lookahead follows actual velocity, stays inside narrow views and reverses symmetrically',()=>{
  assert.deepEqual(cameraLookAhead(0,0,20,12),{x:0,y:0});
  for(const [vx,vy] of [[6,0],[0,-6],[12,12],[-100,100]]){
    const a=cameraLookAhead(vx,vy,20,12),b=cameraLookAhead(-vx,-vy,20,12);
    assert.ok(Math.hypot(a.x/1.6,a.y/.96)<=1+1e-10);
    assert.ok(Math.abs(a.x+b.x)<1e-10&&Math.abs(a.y+b.y)<1e-10);
  }
});

test('Abrupt wall stops settle with minimal overshoot and no fast backward swing',()=>{
  for(const hz of [30,60,144])for(const speed of [5.263,10.526])
    for(const [dx,dy] of [[1,0],[0,-1],[Math.SQRT1_2,Math.SQRT1_2]]){
      const f=new CameraFollow(),motion=new MotionZoom(),center={x:0,y:0};
      let overshoot=0,returnSpeed=0,largestStep=0,previous=0;
      for(let i=0;i<=hz*9;i++){
        const t=i/hz,position=speed*Math.min(3,t);
        motion.update({generation:1,time:t*1000,player:{id:1,lives:3,
          visual:{x:position*dx,y:position*dy}}},i?1/hz:0);
        const lead=cameraLookAhead(motion.vx,motion.vy,20,18);
        f.update(center,position*dx+lead.x,position*dy+lead.y,i?1/hz:0);
        const progress=center.x*dx+center.y*dy;
        if(t>=3){
          overshoot=Math.max(overshoot,progress-position);
          returnSpeed=Math.max(returnSpeed,-f.vx*dx-f.vy*dy);
          largestStep=Math.max(largestStep,Math.abs(progress-previous));
        }
        previous=progress;
      }
      assert.ok(overshoot<.25,`wall overshoot ${overshoot} cells at ${hz}fps`);
      assert.ok(returnSpeed<.23,`return must be barely perceptible: ${returnSpeed} cells/s`);
      assert.ok(largestStep<speed/hz*1.05,'a wall stop cannot produce a camera jump');
      assert.ok(Math.abs(previous-speed*3)<.001,'camera settles back on the stationary player');
    }
});

test('The gentler pan retains the full 1.25x movement zoom',()=>{
  const c=new CameraPresentation(),s=snapshot();advance(c,s,5);
  for(let i=0;i<420;i++)c.update(s,1.5,5/6,1/60);
  assert.equal(c.zoom,1.25);
});
