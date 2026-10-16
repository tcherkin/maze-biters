import assert from 'node:assert/strict';
export function removeGpuReflection(source){
 const replace=(a,b='')=>{assert.equal(source.split(a).length-1,1,'exact GPU reflection hook');source=source.replace(a,b);};
 replace('      gpu?.releaseUpload(s.canvas);s.canvas.width=s.canvas.height=1;','      s.canvas.width=s.canvas.height=1;');
 replace('    floorGpu?.dispose();wallGpu?.dispose();\n    if(gpu){gpu.release(canvas);gpu.release(wallCanvas);}\n');
 replace('  const gpu=globalThis.__gpu2d;\n');
 replace("gpu?gpu.makeSurface(Math.ceil(width*scale),Math.ceil(height*scale),'floor-light',true):");
 replace("gpu?gpu.makeSurface(canvas.width,canvas.height,'wall-light',true):");
 replace("  const floorGpu=gpu?.createLightBatch(canvas,'floor'),wallGpu=gpu?.createLightBatch(wallCanvas,'walls');\n");
 const a=source.indexOf('  function stampWallsGPU('),b=source.indexOf('  function stampWalls(image',a);
 assert.ok(a>=0&&b>a,'separate GPU stamp implementation');
 source=source.slice(0,a)+source.slice(b);
 replace('    if(wallGpu)return stampWallsGPU(image,x,y,tx,ty,weight,amount);\n');
 replace('    if(floorGpu)return stampGPU(image,x,y,weight,wallImage,wallAmount);\n');
 replace('floorGpu?.begin();wallGpu?.begin();');
 replace('    floorGpu?.flush();wallGpu?.flush();\n');
 return source;
}
// Remove ONLY the reviewed renderer boundary. Never normalize simulation
// functions or arbitrary statements when checking the historical engine pin.
export function removeGpuPresentation(source){
 const newline=source.includes('\r\n')?'\r\n':'\n';
 const replace=(a,b='')=>{
  a=a.replaceAll('\n',newline);b=b.replaceAll('\n',newline);
  assert.equal(source.split(a).length-1,1,'exact GPU presentation boundary: '+a.slice(0,100));
  source=source.replace(a,b);
 };
 replace("const displayCtx = canvas.getContext('2d',{alpha:!!globalThis.__gpu2d});","const displayCtx = canvas.getContext('2d',{alpha:false});");
 replace('    gpu:globalThis.__gpu2d,\n');
 replace('      globalThis.MazeBitersRenderer?.hide?.();\n');
 replace('    globalThis.MazeBitersRenderer?.invalidateUploads?.();\n');
 replace('    const nativeFrameContext=ctx;\n    if(globalThis.__gpu2d)ctx=globalThis.MazeBitersRenderer.begin(ctx);\n');
 replace('    if(globalThis.__gpu2d){globalThis.MazeBitersRenderer.finish();ctx=nativeFrameContext;restoreGameplayScreenTransform();}\n');
 replace('    if(globalThis.MazeBitersRenderer?.failed){\n      ctx=displayCtx;CentralGameClock.reanchor(t);requestAnimationFrame(loop);return;\n    }\n');
 replace('      if(globalThis.__gpu2d){ctx=displayCtx;globalThis.MazeBitersRenderer.fail(error);CentralGameClock.reanchor(t);requestAnimationFrame(loop);return;}\n');
 return source;
}
