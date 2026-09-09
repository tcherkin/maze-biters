// Keep Chromium's real HTTP cache enabled. A loopback fixture serves immutable
// old unversioned modules, then the actual current HTML and versioned files.
const path=require('node:path');
const fs=require('node:fs');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MAZE_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'../../..');
const app=fs.readFileSync(path.join(root,'experiments/3d/app.mjs'),'utf8');
const model=fs.readFileSync(path.join(root,'experiments/3d/models/player.mjs'),'utf8');
const version=app.match(/const VERSION\s*=\s*'([^']+)'/)?.[1];
const modelVersion=model.match(/\w+\.userData\.modelVersion='([^']+)'/)?.[1];
assert.ok(version&&modelVersion,'The actual app and model expose their current versions');
const staleVersion='cached-old-player-fixture';
const staleModel=model.replace(/(\w+)\.userData\.modelVersion='[^']+';/,`$1.userData.modelVersion='${staleVersion}';`)+`\nexport const __cachedBuild='${staleVersion}';\n`;
const hits=new Map(),errors=[];
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg','.woff':'font/woff','.woff2':'font/woff2'};
const server=http.createServer((request,response)=>{
  try{
    const url=new URL(request.url,'http://127.0.0.1');
    hits.set(url.pathname+url.search,(hits.get(url.pathname+url.search)||0)+1);
    const pathname=decodeURIComponent(url.pathname).replace(/^\/maze-biters\//,'/');
    if(pathname==='/__cache-prime__.html'){
      response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
      response.end(`<!doctype html><script type="module">
        const player=await import('./experiments/3d/models/player.mjs');
        await import('./experiments/3d/renderer.mjs');
        globalThis.__cachePrimed=player.__cachedBuild;
      </script>`);return;
    }
    if(pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}
    let file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){response.writeHead(404);response.end();return;}
    const extension=path.extname(file);
    let body=pathname==='/experiments/3d/models/player.mjs'&&!url.search
      ?Buffer.from(staleModel):fs.readFileSync(file);
    // Negative control recreates the former document-only cache buster. This
    // response is test-only; neither actual entry HTML is changed on disk.
    if(extension==='.html'&&url.searchParams.get('cache-fixture')==='legacy'){
      body=Buffer.from(body.toString('utf8')
        .replace(/<script type="importmap">[\s\S]*?<\/script>/,'')
        .replace(/\?v=[^"']+/g,''));
    }
    response.writeHead(200,{'Content-Type':mime[extension]||'application/octet-stream',
      'Cache-Control':extension==='.html'?'no-store':'public, max-age=31536000, immutable'});
    response.end(body);
  }catch(error){errors.push(error.message);response.writeHead(500);response.end();}
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const checks=[];
  try{
    for(const prefix of ['','maze-biters/']){
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      try{
        const page=await context.newPage(),pageErrors=[];
        let requests=[];
        page.on('pageerror',error=>pageErrors.push(error.message));
        page.on('console',message=>{if(message.type()==='error')pageErrors.push(message.text());});
        page.on('request',request=>requests.push(request.url()));
        const playerPath=`/${prefix}experiments/3d/models/player.mjs`;
        await page.goto(`${origin}/${prefix}__cache-prime__.html?pass=1`);
        await page.waitForFunction(value=>globalThis.__cachePrimed===value,staleVersion);
        const firstHits=hits.get(playerPath)||0;
        assert.equal(firstHits,1,'The old player module is first fetched into the browser HTTP cache');
        await page.goto(`${origin}/${prefix}__cache-prime__.html?pass=2`);
        await page.waitForFunction(value=>globalThis.__cachePrimed===value,staleVersion);
        assert.equal(hits.get(playerPath),firstHits,'A second document reuses the old module from real HTTP cache without contacting the server');

        await page.goto(`${origin}/${prefix}experiments/3d/?v=${version}&cache-fixture=legacy`);
        await page.getByRole('button',{name:'Влез в играта',exact:true}).waitFor({timeout:60000});
        const stale=await page.evaluate(()=>__mazeBiters3D.diagnostics());
        assert.equal(stale.version,version,'The legacy control loads the current app');
        assert.equal(stale.renderer.playerModel,staleVersion,'Changing only the document URL reproduces a current app with the old cached player model');
        checks.push({prefix,legacyReproduced:true,oldModuleServerFetches:hits.get(playerPath)});

        for(const entry of ['experiments/3d/','3d/']){
          requests=[];
          await page.goto(`${origin}/${prefix}${entry}?v=${version}`);
          await page.getByRole('button',{name:'Влез в играта',exact:true}).click({timeout:60000});
          await page.waitForFunction(()=>globalThis.__mazeBiters3D?.snapshot().started);
          const current=await page.evaluate(()=>({diagnostics:__mazeBiters3D.diagnostics(),
            visibleVersion:document.getElementById('build')?.textContent,
            base:document.baseURI,snakes:__mazeBiters3D.snapshot().snakes.length}));
          assert.equal(current.diagnostics.version,version,'The actual entry runs the current app version');
          assert.equal(current.diagnostics.renderer.playerModel,modelVersion,'The actual rendered player bypasses the previously cached old module');
          assert.ok(current.visibleVersion.includes(version),'The visible build label comes from the running app');
          assert.equal(current.base,`${origin}/${prefix}`,'The alias keeps relative assets inside its project base');
          assert.ok(current.snakes>0,'The actual game starts after cache recovery');
          const modules=requests.map(url=>new URL(url)).filter(url=>url.pathname.endsWith('.mjs'));
          assert.ok(modules.some(url=>url.pathname.endsWith('/models/player.mjs')),'The real nested player model was requested');
          assert.ok(modules.some(url=>url.pathname.endsWith('/renderer.mjs')),'The real renderer was requested');
          assert.ok(modules.every(url=>url.searchParams.get('v')===version),'Every requested production module, including nested dependencies, carries the running build version');
          assert.ok(requests.some(url=>new URL(url).pathname.endsWith('/engine/maze-biters-experiment.js')&&new URL(url).searchParams.get('v')===version),'The isolated classic engine script is also versioned');
          assert.ok(requests.some(url=>new URL(url).pathname.endsWith('/style.css')&&new URL(url).searchParams.get('v')===version),'The experimental stylesheet is also versioned');
          const three=requests.filter(url=>new URL(url).pathname.endsWith('/vendor/three.module.min.js'));
          assert.equal(new Set(three).size,1,'All modules use one canonical Three.js module URL');
          assert.equal(three.length,1,'The Three.js module is evaluated from one browser module-graph dependency');
          assert.equal(new URL(three[0]).search,'','The unchanged Three.js vendor stays shared and cacheable');
          assert.equal(hits.get(playerPath),firstHits,'Loading the fixed entries never refetches or invalidates the stale unversioned cache');
          checks.push({entry:`/${prefix}${entry}`,version:current.diagnostics.version,
            playerModel:current.diagnostics.renderer.playerModel,modules:modules.length,threeURLs:new Set(three).size});
        }
        assert.deepEqual(pageErrors,[],'The current and legacy-control pages emit no browser or JavaScript errors');
      }finally{await context.close();}
    }
    assert.deepEqual(errors,[],'The HTTP cache fixture serves all requests successfully');
    console.log(JSON.stringify({ok:true,checks},null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
