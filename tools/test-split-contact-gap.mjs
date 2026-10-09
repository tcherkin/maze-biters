import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createLiveSnakeRenderer} from '../src/render/live-snake.js?v=1.02.03.00';
import {createLiveMouthService} from '../src/render/live-mouth.js?v=1.02.03.00';
import {createContactRuntime,snakeContactShape} from '../src/engine/contact-runtime.js?v=1.02.03.00';
import {shapeDistance} from '../src/engine/continuous-contact.js?v=1.02.03.00';
const require=createRequire(import.meta.url);let native;
for(const path of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{native=require(path);break;}catch{}
}
if(!native)throw Error('Native Canvas required');
const {createCanvas,Image,loadImage}=native,clone=body=>body.map(p=>({...p}));
function bytes(url){const b=readFileSync(fileURLToPath(url)),parts=[b.subarray(0,8)];for(let p=8;p<b.length;){const n=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8);if(type!=='caBX')parts.push(b.subarray(p,p+n+12));p+=n+12;}return Buffer.concat(parts);}
const oldDocument=globalThis.document,oldImage=globalThis.Image;
globalThis.document={createElement:()=>createCanvas(1,1)};
globalThis.Image=class extends Image{set src(value){super.src=bytes(value);}};
try{
  const manifestContext={};vm.runInNewContext(readFileSync(new URL('../src/config/render-atlas.js',import.meta.url),'utf8'),manifestContext);
  const atlas=await loadImage(fileURLToPath(new URL('../assets/atlases/4k/modern-characters-160.png',import.meta.url)));
  const surface=createCanvas(atlas.width,atlas.height),ctx=surface.getContext('2d');ctx.drawImage(atlas,0,0);
  const sprites={};for(const name of ['Head3','Head3Close'])sprites[name]={__hvSpriteName:name,region:manifestContext.MAZE_BITERS_RENDER_ATLAS.characters[`player:p1:normal:${name}`]};
  const player={x:16,y:16,dir:{x:0,y:1},moveFromX:16,moveFromY:8,moveToX:16,moveToY:16,moveStartedAt:1000,moveDuration:760};
  const position=(p,t,out={})=>{const u=Math.max(0,Math.min(1,(t-p.moveStartedAt)/p.moveDuration));out.x=p.moveFromX+(p.moveToX-p.moveFromX)*u;out.y=p.moveFromY+(p.moveToY-p.moveFromY)*u;return out;};
  const mouth=createLiveMouthService({tile:16,makeCanvas:createCanvas,yieldTask:async()=>{},playerPosition:position,
    readSprite(s){const[,x,y,w,h]=s.region;return ctx.getImageData(x,y,w,h);},
    drawSource(g,s,x,y,w,h){const[,sx,sy,sw,sh]=s.region;g.drawImage(atlas,sx,sy,sw,sh,x,y,w,h);return true;}});
  await mouth.prepare({player:{p1:{normal:sprites}}});
  const renderer=createLiveSnakeRenderer({tile:16,playerPosition:position});await renderer.prepare();
  const original={body:Array.from({length:5},(_,i)=>({x:18-i,y:12})),dir:{x:1,y:0},color:'#35e55b',reversing:false,lastMove:1000};
  renderer.capture(original,1000);
  let snakes=[original],score=0,cutTime=null,cutPlan=null;const events=[],runtime=createContactRuntime();
  const options={open:sprites.Head3,closed:sprites.Head3Close,bank:1};
  const actors=()=>[{entity:player,kind:'player',surfaceSpeed:.4,jumpPad:32,shape:(t,out)=>mouth.geometry(player,t,options,out),breakpoints:(a,b)=>mouth.breakpoints(player,a,b)},
    ...snakes.map(s=>({entity:s,kind:'snake',surfaceSpeed:3,jumpPad:32,revision:s.body.length,shape:(t,out)=>snakeContactShape(renderer,s,t,out),breakpoints:(a,b)=>renderer.contactBreakpoints(s,a,b)}))];
  function resolve(a,b,hit){
    events.push({time:hit.time,index:hit.partB.index,role:hit.partB.role,count:b.entity.body.length});
    if(b.entity!==original){score+=25;return{kind:'unexpected-tail',settled:true};}
    assert.equal(hit.partB.index,2,'actual downward mouth reaches the middle cell, not a nominal grid target');
    const token=renderer.capture(original,hit.time);
    snakes=[{...original,body:clone(original.body.slice(0,2))},
      {...original,body:clone(original.body.slice(3)).reverse(),dir:{x:-1,y:0}}];
    cutTime=hit.time;cutPlan=renderer.split(original,snakes,token,{t:hit.time,index:2,player});
    mouth.bite(player,cutPlan.visualStart,cutPlan.duration,hit.time);score+=10;return{kind:'split'};
  }
  runtime.step(1000,1000,actors,resolve);
  for(let t=1016;t<=1760;t+=16)runtime.step(t-16,t,actors,resolve);
  runtime.step(1752,1760,actors,resolve);
  assert.equal(events.length,1,`consumed split material must not score again: ${JSON.stringify(events)}`);
  assert.equal(score,10);assert.deepEqual(snakes.map(s=>s.body.length),[2,2]);
  let samples=0,minimumClearance=Infinity;
  for(let t=cutTime;t<=cutPlan.endAt+1;t+=.5){
    const front=renderer.getWorldGeometry(snakes[0],t),rear=renderer.getWorldGeometry(snakes[1],t);
    const a=front.sample(front.collisionTailDistance),b=rear.sample(rear.collisionTailDistance);
    assert.ok(Math.abs(a.x-b.x-16)<1e-7,`logical consumed-cell gap remains16px during birth, got${a.x-b.x}`);
    const playerShape=mouth.geometry(player,t,options,{});
    for(const s of snakes){const distance=shapeDistance(playerShape,snakeContactShape(renderer,s,t,{})).distance;minimumClearance=Math.min(minimumClearance,distance);assert.ok(distance>.02,'real player fits through split gap');}
    samples++;
  }
  // Artwork remains the accepted gradual birth: the missing collision span
  // must not cut the renderer's shrinking half-cell ghost out of the picture.
  assert.ok(renderer.inspect(snakes[0],cutTime).length>72);
  assert.ok(renderer.getWorldGeometry(snakes[0],cutTime).collisionTailDistance>7.9);
  assert.ok(Math.abs(renderer.inspect(snakes[0],cutPlan.endAt).length-72)<1e-7);
  console.log(JSON.stringify({events,score,remaining:snakes.map(s=>s.body.length),cutPlan,gapSamples:samples,minimumOpaqueClearance:minimumClearance},null,2));
}finally{
  if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  if(oldImage===undefined)delete globalThis.Image;else globalThis.Image=oldImage;
}
