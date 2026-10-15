import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createPairedContext, pairedContextStatus} from '../src/render/neon-context.js?v=1.02.05.00';
import {createNeonMaterial, enhancePixels, emissionPixels} from '../src/render/neon-material.js?v=1.02.05.00';

const require=createRequire(import.meta.url);
let native;
for(const path of [process.env.CODEX_CANVAS_PACKAGE,'@napi-rs/canvas',
  join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')].filter(Boolean)){
  try{native=require(path);break;}catch{}
}
if(!native)throw Error('Native Canvas required; set CODEX_CANVAS_PACKAGE.');
const {createCanvas}=native;
const pixels=surface=>surface.getContext('2d').getImageData(0,0,surface.width,surface.height).data;
const canvas=(width=240,height=160)=>createCanvas(width,height);
const tests=[];
const test=(name,run)=>tests.push({name,run});
function ribbon(){
  const image=canvas(480,74),g=image.getContext('2d'),data=g.createImageData(480,74);
  for(let y=0;y<74;y++)for(let x=0;x<480;x++){
    const i=(y*480+x)*4,t=(x%160)/159,v=Math.max(0,Math.min(1,(y-8)/58));
    data.data[i]=30+180*v;data.data[i+1]=80+165*(1-v)+8*t;
    data.data[i+2]=7+35*v;data.data[i+3]=255;
  }
  g.putImageData(data,0,0);return image;
}
function fromPixels(source,data){
  const result=canvas(source.width,source.height),g=result.getContext('2d'),image=g.createImageData(source.width,source.height);
  image.data.set(data);g.putImageData(image,0,0);return result;
}
function opaqueEmission(source){
  const output=emissionPixels(pixels(source),.7);
  for(let i=0;i<output.length;i+=4){
    const alpha=output[i+3]/255;
    for(let c=0;c<3;c++)output[i+c]*=alpha;
    output[i+3]=255;
  }
  return fromPixels(source,output);
}
function samePixels(a,b,message){assert.deepEqual(pixels(a),pixels(b),message);}
function snapshot(ctx){return {matrix:ctx.getTransform().toJSON(),alpha:ctx.globalAlpha,op:ctx.globalCompositeOperation};}

test('prepared ribbon caches exact enhancement and opaque screen emission once',()=>{
  let allocations=0;
  const material=createNeonMaterial({canvasFactory(w,h){allocations++;return canvas(w,h);}});
  const image=ribbon(),original=pixels(image).slice(),a=canvas(),b=canvas();
  material.prewarm([image]);
  let normal,light;
  material.wrapContext(a.getContext('2d')).paintPreparedSurface((target,resolve,mode)=>{
    assert.equal(target,a.getContext('2d'));assert.equal(mode.emission,false);normal=resolve(image);
  });
  material.wrapEmissionContext(b.getContext('2d')).paintPreparedSurface((target,resolve,mode)=>{
    assert.equal(target,b.getContext('2d'));assert.equal(mode.emission,true);light=resolve(image);
  });
  samePixels(normal,fromPixels(image,enhancePixels(original,.7)));
  samePixels(light,opaqueEmission(image));
  assert.deepEqual(pixels(image),original);
  assert.equal(allocations,2);assert.equal(material.stats().pixelReads,1);
  assert.equal(material.stats().totalCachedBytes,480*74*8);
  const values=pixels(light);for(let i=3;i<values.length;i+=4)assert.equal(values[i],255);
});

test('opaque emission strip overlaps cannot brighten the prepared material',()=>{
  const image=ribbon(),material=createNeonMaterial({canvasFactory:canvas});
  let light;material.wrapEmissionContext(canvas().getContext('2d')).paintPreparedSurface((_,resolve)=>{light=resolve(image);});
  const single=canvas(90,74),overlap=canvas(90,74),a=single.getContext('2d'),b=overlap.getContext('2d');
  a.drawImage(light,170,0,90,74,0,0,90,74);
  b.drawImage(light,170,0,47,74,0,0,47,74);b.drawImage(light,213,0,47,74,43,0,47,74);
  samePixels(single,overlap,'overlap has no repeated semitransparent accumulation');
});

test('nested prepared passes retain independent camera, actor and emission transforms and alpha',()=>{
  const image=ribbon(),material=createNeonMaterial({canvasFactory:canvas});material.prewarm([image]);
  const surfaces=[canvas(),canvas(),canvas()],expected=[canvas(),canvas(),canvas()];
  const contexts=surfaces.map(s=>s.getContext('2d')),refs=expected.map(s=>s.getContext('2d'));
  const matrices=[[1.7,0,0,1.7,23,17],[1,0,0,1,0,0],[1.3,0,0,1.3,2,5]];
  for(let i=0;i<3;i++)for(const ctx of [contexts[i],refs[i]]){
    ctx.setTransform(...matrices[i]);ctx.globalAlpha=.61;
    ctx.beginPath();ctx.rect(5,5,106,70);ctx.clip();
  }
  const originalState=contexts.map(snapshot),scratch=canvas();let calls=0;
  const pair=createPairedContext(material.wrapContext(createPairedContext(contexts[0],contexts[1])),
    material.wrapEmissionContext(contexts[2]));
  const enhanced=fromPixels(image,enhancePixels(pixels(image),.7)),light=opaqueEmission(image);
  const paint=(target,texture)=>{
    const g=scratch.getContext('2d'),m=target.getTransform();
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,scratch.width,scratch.height);
    g.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);
    g.drawImage(texture,160,8,160,58,14.25,21.5,74,27);
    target.save();target.setTransform(1,0,0,1,0,0);target.drawImage(scratch,0,0);target.restore();
  };
  pair.paintPreparedSurface((target,resolve,mode)=>{
    const texture=resolve(image);assert.ok(texture);calls++;
    assert.equal(mode.emission,target===contexts[2]);paint(target,texture);return 42;
  });
  for(let i=0;i<3;i++)paint(refs[i],i===2?light:enhanced);
  assert.equal(calls,3,'all nested destinations receive their own prepared paint');
  for(let i=0;i<3;i++){
    samePixels(surfaces[i],expected[i],`destination ${i} correctly registered`);
    assert.deepEqual(snapshot(contexts[i]),originalState[i]);
  }
  assert.notDeepEqual(pixels(surfaces[0]),pixels(surfaces[1]),'camera not borrowed by actor capture');
  assert.equal(material.stats().pixelReads,1);
});

test('alpha-only actor role survives nested paired material wrappers without changing light role',()=>{
  const destinations=[canvas(),canvas(),canvas()].map(c=>c.getContext('2d'));
  const material=createNeonMaterial({canvasFactory:canvas});
  const mode={occlusion:true};
  const all=createPairedContext(destinations[0],destinations[1],{secondaryPreparedMode:mode});
  mode.occlusion=false; // The pair owns a snapshot, not a caller-mutated flag.
  const pair=createPairedContext(material.wrapContext(all),material.wrapEmissionContext(destinations[2]));
  const observed=[];
  pair.paintPreparedSurface((target,_resolve,prepared)=>observed.push({
    destination:destinations.indexOf(target),emission:prepared.emission,occlusion:!!prepared.occlusion}));
  assert.deepEqual(observed,[{destination:0,emission:false,occlusion:false},
    {destination:1,emission:false,occlusion:true},{destination:2,emission:true,occlusion:false}]);
  assert.throws(()=>createPairedContext(destinations[0],destinations[1],{secondaryPreparedMode:true}),/mode/);
});

test('moving prepared silhouettes stay current without per-frame texture reads or allocations',()=>{
  let allocations=0;
  const material=createNeonMaterial({canvasFactory(w,h){allocations++;return canvas(w,h);}}),image=ribbon();
  const normal=canvas(),emission=canvas(),scratch=canvas();
  const pair=createPairedContext(material.wrapContext(normal.getContext('2d')),material.wrapEmissionContext(emission.getContext('2d')));
  material.prewarm([image]);let first;
  for(let frame=0;frame<80;frame++){
    normal.getContext('2d').clearRect(0,0,240,160);emission.getContext('2d').clearRect(0,0,240,160);
    pair.paintPreparedSurface((target,resolve)=>{
      const texture=resolve(image);if(!texture)return;
      const g=scratch.getContext('2d');g.clearRect(0,0,240,160);
      g.drawImage(texture,160,8,160,58,frame+3,50,100,36);target.drawImage(scratch,0,0);
    });
    if(!frame)first=pixels(emission).slice();
  }
  assert.notDeepEqual(pixels(emission),first,'emission follows the changing scratch shape');
  assert.equal(allocations,2);assert.equal(material.stats().pixelReads,1);
  assert.equal(material.stats().cacheBuilds,1);assert.equal(material.stats().cachedSprites,1);
  assert.equal(material.stats().preparedDraws,80);assert.equal(material.stats().preparedEmissionDraws,80);
});

test('zero strength or unavailable emission can skip the dynamic pass without losing normal art',()=>{
  const image=ribbon(),normal=canvas(),emission=canvas();
  const material=createNeonMaterial({strength:0,canvasFactory(){throw Error('must not allocate');}});
  const pair=createPairedContext(material.wrapContext(normal.getContext('2d'),0),material.wrapEmissionContext(emission.getContext('2d'),0));
  pair.paintPreparedSurface((target,resolve,mode)=>{
    const texture=resolve(image);
    if(mode.emission){assert.equal(texture,null);return;}
    assert.equal(texture,image);target.drawImage(texture,0,0);
  });
  assert.ok(pixels(normal).some(v=>v>0));assert.ok(pixels(emission).every(v=>v===0));
  assert.equal(material.stats().pixelReads,0);
});

test('prepared secondary errors disable capture without stopping subsequent primary paints',()=>{
  const primary=canvas().getContext('2d'),secondary=canvas().getContext('2d');
  const pair=createPairedContext(primary,secondary);let visible=0,captured=0;
  for(let i=0;i<3;i++)assert.equal(pair.paintPreparedSurface((target,resolve,mode)=>{
    assert.equal(mode.emission,false);assert.equal(resolve(primary.canvas),primary.canvas);
    if(target===secondary){captured++;throw Error('prepared capture lost');}
    visible++;target.fillRect(i*10,0,5,5);return 42;
  }),42);
  assert.equal(visible,3);assert.equal(captured,1);
  assert.equal(pairedContextStatus(pair).secondaryEnabled,false);
  assert.equal(pairedContextStatus(pair).lastError,'prepared capture lost');
  assert.throws(()=>pair.paintPreparedSurface(null),/painter/);
  const failed=createPairedContext(primary,secondary);
  assert.throws(()=>failed.paintPreparedSurface(()=>{throw Error('primary failure');}),/primary failure/);
  assert.equal(pairedContextStatus(failed).secondaryEnabled,true);
});

let failures=0;
for(const {name,run} of tests){try{run();console.log(`PASS ${name}`);}catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}}
console.log(`${tests.length-failures}/${tests.length} prepared neon surface tests passed`);
if(failures)process.exitCode=1;
