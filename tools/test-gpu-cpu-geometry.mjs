import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>fs.readFileSync(new URL('../src/render/gpu/'+name,import.meta.url),'utf8');
const source=read('gpu-canvas.js'),runtime=read('runtime.js'),passes=read('retained-passes.js'),ribbon=read('ribbon-geometry.js');
assert(source.includes('const DIAGNOSTICS_OPT=true,REUSE=true'));
assert(source.includes('const GPU_GEOMETRY=true'));
assert(![source,runtime,passes].some(s=>s.includes('__gpuCpuStudy')||s.includes('__gpuGeometryStudy')));
assert(runtime.includes('gpu.frameCounters(beforeCounters)')&&runtime.includes('gpu.frameCounters(afterCounters)'));
assert(source.includes('let profilingEnabled=!DIAGNOSTICS_OPT'));
assert(source.includes('if(!profilingEnabled)return'));
assert(source.includes('for(const r of s.gpuRibbons)r.dispose()'));
assert(ribbon.includes('instance:true')&&ribbon.includes('view.set(input.subarray(0,length))'));
assert(ribbon.includes('geometry.destroy(true);shader.destroy();mesh.destroy()'));
const code=source.slice(source.indexOf('class Affine{'),source.indexOf('const identity='));
const ctx=vm.createContext({});vm.runInContext(code+';this.A=Affine;',ctx);
const out=new ctx.A();
for(let i=0;i<1000;i++){
 const m={a:Math.cos(i*.07),b:Math.sin(i*.03),c:Math.sin(i*.11),d:Math.cos(i*.13),e:i/7,f:-i/3},x=i*.1,y=i*.05,sx=(i%2?-1:1)*1.25,sy=.75;
 out.set(m).translateSelf(x,y).scaleSelf(sx,sy);
 const expected={a:m.a*sx,b:m.b*sx,c:m.c*sy,d:m.d*sy,e:m.e+m.a*x+m.c*y,f:m.f+m.b*x+m.d*y};
 // Different associativity can change the last double bit; production uses the
 // original translateSelf order, which is checked explicitly here.
 expected.e=m.e+(m.a*x+m.c*y);expected.f=m.f+(m.b*x+m.d*y);
 for(const k of Object.keys(expected))assert.equal(out[k],expected[k]);
 const copy=new ctx.A(out);out.set();for(const k of Object.keys(expected))assert.equal(copy[k],expected[k]);
}
console.log('PASS CPU defaults, on-demand profiling, compact instancing, resource disposal and 1000 independent affine states.');
