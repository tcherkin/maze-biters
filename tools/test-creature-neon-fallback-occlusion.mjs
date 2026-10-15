import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {createSnakeNeon} from '../src/render/snake-neon.js';
const require=createRequire(import.meta.url);let native;
for(const location of ['@napi-rs/canvas',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')])try{native=require(location);break;}catch{}
assert.ok(native,'native Canvas required');
const {createCanvas}=native,W=128,H=96,TILE=16;
// Use a supported immutable snake-material size: arbitrary small canvases
// intentionally bypass emission and cannot demonstrate an occlusion failure.
const texture=createCanvas(160,57),g=texture.getContext('2d');g.fillStyle='#a8ef36';g.fillRect(0,0,160,57);
const mask=createCanvas(W,H);mask.getContext('2d').fillRect(0,0,W,H);
const grid=Array.from({length:H/TILE},(_,y)=>Array.from({length:W/TILE},(_,x)=>!x||!y||x===7||y===5?'#':'.').join(''));
const a={minX:8,minY:8,maxX:36,maxY:36},b={minX:78,minY:46,maxX:110,maxY:78};
const body={brainAggression:0},scorpion={brainAggression:0};
function fixture(create){
  const lost=new WeakSet();let capture=null;
  const makeCanvas=(w,h)=>{const c=createCanvas(w,h),ctx=c.getContext('2d');ctx.isContextLost=()=>lost.has(c);c.addEventListener=()=>{};return c;};
  const neon=create({width:W,height:H,tile:TILE,makeCanvas,creaturesEnabled:true,
    snake:{getNeonSources:()=>[texture]}});
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');let nativeCalls=0;
  const drawB=target=>{nativeCalls++;capture??=target.canvas;target.fillStyle='#a33b57';target.fillRect(84,52,16,16);};
  function begin(){ctx.clearRect(0,0,W,H);ctx.fillStyle='#071016';ctx.fillRect(0,0,W,H);
    assert.equal(neon.beginFrame(ctx,{grid,key:'fixed',drawWallArtwork:c=>{c.fillStyle='#5468e7';c.fillRect(0,0,W,4);},time:1000,
      viewport:{left:0,top:0,right:W,bottom:H},foregroundBounds:[]}),true);
    neon.snakeContext().drawImage(texture,80,48,24,24);}
  function first(){assert.equal(neon.drawCreature(scorpion,{kind:'scorpion',bounds:a,scale:5,glints:false,
    draw:c=>{c.fillStyle='#8974bc';c.fillRect(12,12,16,16);}}),true);}
  // Prime the hunter kind once, then fail only its offscreen capture. The
  // following scorpion still succeeds and narrows the shared foreground crop.
  begin();neon.drawCreature(body,{kind:'hunter',bounds:b,scale:5,glints:false,draw:drawB});
  assert.ok(capture);lost.add(capture);nativeCalls=0;
  function frame({manual=false,throwAfter=false}={}){
    begin();first();
    const draw=target=>{drawB(target);if(throwAfter)throw Error('partial native painter');};
    if(manual){neon.setForegroundBounds(b);draw(neon.actorsContext());}
    else if(!neon.drawCreature(body,{kind:'hunter',bounds:b,scale:5,glints:false,draw})){
      // The pre-fix engine fallback reused this stale actor context. Retain
      // it here so the counterfactual proves the regression is observable.
      draw(neon.actorsContext());
    }
    neon.present(ctx,mask,{x:W/2,y:H/2,zoom:1});
    return [...ctx.getImageData(90,58,1,1).data];
  }
  return{frame,neon,get calls(){return nativeCalls;}};
}
const expected=[163,59,87,255];
const current=fixture(createSnakeNeon),manual=current.frame({manual:true});assert.deepEqual(manual,expected);
const calls=current.calls,actual=current.frame();assert.equal(current.calls-calls,1,'one failed-capture native draw');
assert.deepEqual(actual,manual,'native fallback blocks preceding emission outside the previous creature crop');

// Exercise the exact former return-false branch in an isolated imported copy,
// never by editing the runtime or weakening the expected opaque pixel.
const url=new URL('../src/render/snake-neon.js',import.meta.url),source=await readFile(url,'utf8');
const fixed=`    if(!pose){
      // A failed per-kind capture must not inherit the preceding creature's
      // narrow foreground crop. Paint native art once through a fresh mask.
      setForegroundBounds(b);
      if(active&&foreground?.useWidth&&foreground?.useHeight)foregroundUsed=true;
      committed=true; // A partially throwing native painter must not replay.
      draw(active?actorContext:raw,()=>{});
      return true;
    }`;
const normalized=source.replaceAll('\r\n','\n');assert.equal(normalized.split(fixed).length,2);
const counterfactual=normalized.replace(fixed,'    if(!pose)return false;').replace(/from '([^']+)'/g,(_m,s)=>`from '${new URL(s,url).href}'`);
const old=(await import('data:text/javascript,'+encodeURIComponent(counterfactual))).createSnakeNeon;
const previous=fixture(old),leaked=previous.frame();
assert.notDeepEqual(leaked,expected,'the old crop-reuse branch demonstrably leaks emission through the native fallback');
assert.equal(previous.calls,1,'the visual failure is masking, not a duplicate painter');

const partial=fixture(createSnakeNeon);const partialCalls=partial.calls;partial.frame({throwAfter:true});
assert.equal(partial.calls-partialCalls,1,'partially committed fallback does not replay on failure');
assert.ok(partial.neon.diagnostics().errors.some(e=>e.name==='creature-light'),'partial failure is explicit, not hidden');
console.log(JSON.stringify({passed:true,nativePixel:actual,oldLeakedPixel:leaked,callbackOnce:true,partialThrowNoReplay:true,
  scope:'Narrow failed-capture foreground regression; native Canvas, no performance measurement or GPU appearance claim.'},null,2));
