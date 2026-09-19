// Exercise the production head lighting over signed local coordinates.
// Count coordinates outside legacy pow's specified domain, then check the
// replacement's GPU output. Desktop emulation cannot reproduce Apple hardware.
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:1000,height:600}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/__snake-portability__',route=>route.fulfill({contentType:'text/html',body:'<style>body{margin:0}</style><canvas></canvas>'}));
    await page.goto('http://127.0.0.1:8093/__snake-portability__');
    const report=await page.evaluate(async()=>{
      const T=await import('/experiments/3d/vendor/three.module.min.js');
      const {createSnakeFinish,addSnakeHeadCores}=await import('/experiments/3d/snake-light.mjs');
      const {createSnakeHead,animateSnakeMouth}=await import('/experiments/3d/models/snake.mjs');
      const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
      renderer.setSize(1000,600);renderer.setClearColor(0x101426);
      const target=new T.WebGLRenderTarget(64,64),camera=new T.Camera(),scene=new T.Scene();
      const finish=createSnakeFinish('#ff2277');finish.setLook('balanced');
      const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <lights_physical_fragment>'};
      finish.headMaterial.onBeforeCompile(shader);
      const source=shader.fragmentShader.slice(shader.fragmentShader.indexOf('if(neonPolish'),shader.fragmentShader.indexOf('#include <lights_physical_fragment>'));
      const checks=[];
      for(const role of [1,2])for(const legacy of [true,false]){
        let body=source;
        if(legacy)body=body.replace('float brow=','outsidePowDomain=browOffset<0.||lipOffset<0.;float brow=');
        const mat=new T.ShaderMaterial({glslVersion:T.GLSL3,uniforms:{...shader.uniforms,neonHeadRole:{value:role}},
          vertexShader:'out vec2 coord; void main(){coord=uv;gl_Position=vec4(position.xy,0.,1.);}',
          fragmentShader:`in vec2 coord;out vec4 result;uniform float neonPolish;uniform float neonHeadRole;uniform vec3 neonSourceTint;uniform vec3 neonHeadFill;
          void main(){bool outsidePowDomain=false;vec3 vNeonLocal=vec3(.2,coord.y*.8-.2,coord.x*.8-.4);vec3 totalEmissiveRadiance=vec3(0.);${body}
          bool invalid=outsidePowDomain||any(isnan(totalEmissiveRadiance))||any(isinf(totalEmissiveRadiance));result=invalid?vec4(1.,0.,0.,1.):vec4(0.,1.,0.,1.);}`});
        const plane=new T.Mesh(new T.PlaneGeometry(2,2),mat);scene.add(plane);
        renderer.setRenderTarget(target);renderer.render(scene,camera);
        const pixels=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(target,0,0,64,64,pixels);
        let invalid=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>128)invalid++;
        checks.push({role,check:legacy?'legacy undefined pow domain':'fixed nonfinite output',invalid});scene.remove(plane);plane.geometry.dispose();mat.dispose();
      }
      target.dispose();finish.dispose();renderer.setRenderTarget(null);
      const display=new T.Scene(),view=new T.PerspectiveCamera(38,1000/600,.1,100);
      view.position.set(0,3.1,5.3);view.lookAt(0,.25,0);
      display.add(new T.HemisphereLight(0xd6eaff,0x312043,3));
      const key=new T.DirectionalLight(0xffffff,4);key.position.set(-3,5,4);display.add(key);
      const envScene=new T.Scene();envScene.background=new T.Color(0x91abc9);
      const pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(envScene);display.environment=environment.texture;
      for(const [i,color] of ['#ff1544','#ffb51b','#05bfe7','#e800a0'].entries()){
        const f=createSnakeFinish(color);f.setLook('balanced');
        const head=createSnakeHead(f.material);addSnakeHeadCores(head,f);animateSnakeMouth(head,i/3);
        head.position.x=(i-1.5)*1.05;head.rotation.y=(i-1.5)*.35;head.scale.setScalar(1.5);display.add(head);
      }
      renderer.render(display,view);renderer.getContext().finish();
      return {checks,glError:renderer.getContext().getError()};
    });
    await page.screenshot({path:path.resolve(__dirname,'../preview-snake-portability.png')});
    for(const c of report.checks)assert.ok(c.check.startsWith('legacy')?c.invalid>0:c.invalid===0,JSON.stringify(c));
    assert.equal(report.glError,0);assert.deepEqual(errors,[]);console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
