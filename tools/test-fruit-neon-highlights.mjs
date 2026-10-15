// Native-art regression for the fruit-only neutral-highlight correction.
// Reference function hashes were captured from the frozen1.02.16.01 baseline;
// this test never weakens the snake saturation gate or changes egg response.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPickupNeonMaterial,fruitEmissionPixels,eggEmissionPixels} from '../src/render/pickup-neon-material.js';
import {enhancePixels,emissionPixels as oldSnakeEmission} from '../src/render/neon-material.js';
const require=createRequire(import.meta.url);let native;
for(const location of ['@napi-rs/canvas',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')]){try{native=require(location);break;}catch{}}
assert.ok(native,'Native Canvas dependency required');const {createCanvas,loadImage}=native;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const digest=fn=>createHash('sha256').update(fn.toString().replace(/\r\n/g,'\n')).digest('hex');
assert.equal(digest(oldSnakeEmission),'86909260dc1991b175d9942b0e753b8fa89ddf57dfc193c95541a66c0351a5a9');
assert.equal(digest(enhancePixels),'23a2c23968b791d7e6fef6335ba6d37d5bc5cf523f73e794fdbf3943c7932913');
assert.equal(digest(eggEmissionPixels),'8f9f0924146297357e049bf39c5f8cba392286ad882c4c70be4acd9518ec0506');
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
const crop=(image,x,size)=>{const c=createCanvas(size,size);c.getContext('2d').drawImage(image,x,0,size,size,0,0,size,size);return c;};
function roundtrip(bytes,size){const c=createCanvas(size,size),ctx=c.getContext('2d'),image=ctx.createImageData(size,size);image.data.set(bytes);ctx.putImageData(image,0,0);return pixels(c);}
// Independent value-response oracle. Its alpha has no saturation term. Hue
// assertions below use cross-products rather than the production RGB formula.
function expectedAlpha(high,alpha,power){
  if(!alpha||high<=48)return 0;
  const value=high/255,x=Math.max(0,Math.min(1,(value-.22)/.33)),y=Math.max(0,Math.min(1,(value-.42)/.52));
  return Math.round(alpha*Math.min(1,Math.max(0,power)*x*x*(3-2*x)*(.08+.76*y*y*(3-2*y))));
}
function inspectPixel(source,result,power,label){
  const high=Math.max(source[0],source[1],source[2]);
  assert.equal(result[3],expectedAlpha(high,source[3],power),`${label}: independent value-only opacity`);
  assert.ok(result[3]<=source[3],`${label}: cannot grow source alpha`);
  if(!result[3])assert.deepEqual([...result],[0,0,0,0]);
  else for(let c=0;c<3;c++)assert.ok(Math.abs(result[c]*high-source[c]*(204+.2*high))<=high*.5+1e-8,`${label}: hue ratio retained within byte rounding`);
}
const report={passed:true,referencePins:3,nativePixels:0,neutralHighlightsRestored:0,saturatedPixelsUnchanged:0,
  transparentPixelsProtected:0,darkPixelsProtected:0,numericPoses:0,desaturationSteps:0,eggFramesUnchanged:0,cacheProfiles:0,fruits:[]};
for(const size of [80,160]){
  const quality=size===80?'hd':'4k',atlas=await loadImage(path.join(root,`assets/atlases/${quality}/modern-fruits-${size}.png`));
  const owned=[],cache=createPickupNeonMaterial({makeCanvas:(w,h)=>{const c=createCanvas(w,h);owned.push(c);return c;}}),requests=[];
  for(let index=0;index<4;index++){
    const source=pixels(crop(atlas,index*size,size)),copy=new Uint8ClampedArray(source),old=oldSnakeEmission(source,.7),next=fruitEmissionPixels(source,.7);
    const row={quality,fruit:['apple','pear','strawberry','watermelon'][index],neutralHighlights:0,previouslyUnlit:0,restored:0,saturatedUnchanged:0,changedEmissionPixels:0};
    for(let i=0;i<source.length;i+=4){
      const s=source.subarray(i,i+4),n=next.subarray(i,i+4),o=old.subarray(i,i+4),high=Math.max(s[0],s[1],s[2]),low=Math.min(s[0],s[1],s[2]),saturation=high?(high-low)/high:0;
      inspectPixel(s,n,.7,`${quality}/${index}/${i/4}`);report.nativePixels++;
      if(s[3]>=250&&high>=224&&saturation<.18){
        row.neutralHighlights++;assert.equal(o[3],0);row.previouslyUnlit++;assert.ok(n[3]>0);row.restored++;report.neutralHighlightsRestored++;
      }
      if(s[3]>0&&high>48&&high-low>12&&saturation>=.52){assert.deepEqual(n,o);row.saturatedUnchanged++;report.saturatedPixelsUnchanged++;}
      if(!s[3]){assert.equal(n[3],0);report.transparentPixelsProtected++;}
      if(high<=48){assert.equal(n[3],0);report.darkPixelsProtected++;}
      if(n.some((value,c)=>value!==o[c]))row.changedEmissionPixels++;
    }
    assert.ok(row.restored>0);assert.deepEqual(source,copy,'native source bytes remain untouched');
    const request={source:atlas,rect:[index*size,0,size,size],kind:'fruit'},result=cache.get(request);
    assert.deepEqual(pixels(result.material),roundtrip(enhancePixels(source,.7),size),'base material is exactly the pre-fix canonical enhancement');
    assert.deepEqual(pixels(result.emission),roundtrip(next,size),'cache really dispatches corrected fruit emission');
    requests.push({request,result});report.fruits.push(row);
  }
  const eggAtlas=await loadImage(path.join(root,`assets/atlases/${quality}/modern-eggs-${size}.png`));
  for(let index=0;index<4;index++){
    const source=pixels(crop(eggAtlas,index*size,size)),request={source:eggAtlas,rect:[index*size,0,size,size],kind:'egg'},result=cache.get(request);
    assert.deepEqual(pixels(result.material),roundtrip(enhancePixels(source,.7),size));
    assert.deepEqual(pixels(result.emission),roundtrip(eggEmissionPixels(source,.7),size),'egg uses the pinned unchanged response');
    requests.push({request,result});report.eggFramesUnchanged++;
  }
  assert.equal(cache.stats().entries,8);assert.equal(cache.stats().builds,8);assert.equal(cache.stats().cpuReads,8);
  assert.equal(owned.length,16);assert.equal(cache.stats().nativeBytes,8*2*size*size*4);
  for(let repeat=0;repeat<20;repeat++)for(const {request,result}of requests){assert.equal(cache.get(request),result);assert.equal(cache.stats().lastReadbacks,0);}
  assert.equal(cache.stats().cpuReads,8);assert.equal(cache.stats().builds,8);assert.equal(owned.length,16);
  cache.dispose();assert.equal(cache.stats().bytes,0);assert.ok(owned.every(c=>c.width===1&&c.height===1));report.cacheProfiles++;
}

// Desaturate each hue toward white at fixed value/alpha. Brightness must not
// collapse as it crosses the former .18/.52 saturation thresholds. Discrete
// RGB is allowed only its unavoidable one-input-byte quantization staircase.
for(const high of [80,160,224,255])for(const alpha of [64,255])for(const power of [0,.7,2])for(const hue of [[1,.07,.2],[.1,1,.45],[.2,.4,1]]){
  const start=hue.map(value=>Math.round(value*high));let previous=null,previousLuminance=-1;
  for(let step=0;step<=255;step++){
    const source=new Uint8ClampedArray([...start.map(value=>Math.round(value+(high-value)*step/255)),alpha]);
    const copy=new Uint8ClampedArray(source),next=fruitEmissionPixels(source,power);
    inspectPixel(source,next,power,'desaturation');assert.deepEqual(source,copy);report.numericPoses++;
    const luminance=(.2126*next[0]+.7152*next[1]+.0722*next[2])*next[3]/255;
    assert.ok(luminance+1e-10>=previousLuminance,'desaturating a bright skin pixel never creates a dark highlight pit');
    if(previous){
      assert.equal(next[3],previous[3],'opacity is independent of saturation at fixed value');
      for(let c=0;c<3;c++){assert.ok(next[c]>=previous[c]);assert.ok(next[c]-previous[c]<=Math.ceil((204+.2*high)/high));}
      report.desaturationSteps++;
    }
    previous=next;previousLuminance=luminance;
  }
}
for(const rgba of [[0,0,0,255],[18,11,7,255],[48,30,12,255],[255,255,255,0],[255,240,220,1],[255,236,221,255]]){
  const source=new Uint8ClampedArray(rgba);for(const power of [0,.7,1,2]){inspectPixel(source,fruitEmissionPixels(source,power),power,'seed/contour');report.numericPoses++;}
}
assert.deepEqual([...fruitEmissionPixels(new Uint8ClampedArray([255,236,221,255]),.7)],[255,236,221,150],'measured HD apple highlight must emit its native pale hue');
report.interpretation='Read-only native-pixel and cache proof: fruit highlight emission restored; fully saturated emission, material, egg response and dark/transparent details preserved. Browser DUSK/occlusion and visual approval remain separate.';
console.log(JSON.stringify(report,null,2));
