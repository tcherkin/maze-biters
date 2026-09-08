import * as THREE from './vendor/three.module.min.js';
import {snakeRoute,sampleSnake} from './motion.mjs';
import {createPlayerModel} from './models/player.mjs';
import {PlayerVapor} from './player-vapor.mjs';
import {createSnakeHead,animateSnakeMouth,snakeSegmentGeometry,snakeSegmentAccentGeometry} from './models/snake.mjs';
import {snakeMouthOpening} from './snake-mouth.mjs';
import {BiteEffects,biteSnakeSample,biteTailShape,biteHeadGrowth,biteHeadOrigin,growingTailGeometry} from './bite-effects.mjs';
import {PlayerEaten} from './player-eaten.mjs';
import {lightDuskScene,buildDuskMaze,disposeDuskMaze} from './environment.mjs';
import {GroundBeamMask} from './flashlight-mask.mjs';
import {worldLayout,MODEL_SCALE,HEAD_SCALE,PLAYER_SCALE,CELL_SIZE,DEFAULT_TILT,DEFAULT_ZOOM} from './world.mjs';
const dummy=new THREE.Object3D();
snakeSegmentGeometry.computeBoundingBox();
const plateLength=snakeSegmentGeometry.boundingBox.max.z-snakeSegmentGeometry.boundingBox.min.z;
const BEAM_LENGTH=10.2,BEAM_WIDTH=4.6,BEAM_OFFSET=4.8,BEAM_GAIN=2;
const FLASHLIGHT_INTENSITY=150,FLASHLIGHT_HEIGHT=1.8,FLASHLIGHT_TARGET_HEIGHT=.95;

function makeSpine(rings){
  const sides=12,positions=new Float32Array(rings*sides*3),normals=new Float32Array(positions.length);
  const indices=[];
  for(let r=0;r<rings-1;r++) for(let s=0;s<sides;s++){
    const a=r*sides+s,b=r*sides+(s+1)%sides,c=a+sides,d=b+sides;
    indices.push(a,b,c,b,d,c);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  return {geometry,positions,normals,sides,rings};
}

export class DuskScene{
  constructor(canvas){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.setClearColor(0x060913);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.scene=new THREE.Scene();
    this.camera=new THREE.OrthographicCamera(-20,20,14,-14,.1,150);
    // Keep maze north at the top even at a perfectly vertical viewing angle.
    this.camera.up.set(0,0,-1);
    this.lighting=lightDuskScene(this.renderer,this.scene);
    this.staticGroup=null;
    this.snakes=new Map();this.zoom=DEFAULT_ZOOM;this.targetZoom=DEFAULT_ZOOM;this.center=new THREE.Vector2();
    this.tiltDegrees=DEFAULT_TILT;this.targetTiltDegrees=DEFAULT_TILT;
    this.playerMaterial=new THREE.MeshPhysicalMaterial({color:0x83d51f,roughness:.24,metalness:.06,clearcoat:1,clearcoatRoughness:.10,envMapIntensity:1.15});
    this.player=createPlayerModel(this.playerMaterial);this.player.scale.setScalar(PLAYER_SCALE);this.scene.add(this.player);
    this.vapor=new PlayerVapor();this.scene.add(this.vapor.group);
    this.bites=new BiteEffects();this.scene.add(this.bites.group);
    this.predation=new PlayerEaten(this.bites.bloom.assets);this.scene.add(this.predation.bloom.group);
    // Most of the beam is real surface illumination. A faint floor spill
    // softens its footprint without competing with the lit armor and walls.
    this.halo=this.lightStamp(false);this.beam=this.lightStamp(true);
    this.beamMask=new GroundBeamMask(this.beam,{length:BEAM_LENGTH,width:BEAM_WIDTH,offset:BEAM_OFFSET});
    this.scene.add(this.halo,this.beam);
    this.glow=new THREE.PointLight(0xffc347,2.2*BEAM_GAIN,3.6,2);this.scene.add(this.glow);
    this.flashlight=new THREE.SpotLight(0xffd276,FLASHLIGHT_INTENSITY,11.4,.48,.70,1.5);
    this.flashlight.castShadow=true;this.flashlight.shadow.mapSize.set(1024,1024);
    this.flashlight.shadow.camera.near=.1;this.flashlight.shadow.camera.far=12;
    this.flashlight.shadow.bias=-.0002;this.flashlight.shadow.normalBias=.02;
    this.scene.add(this.flashlight,this.flashlight.target);
    this.playerYaw=0;this.lastPlayer=null;
  }
  lightStamp(beam){
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
    const ctx=canvas.getContext('2d');
    if(beam){
      const pixels=ctx.createImageData(128,256);
      const smooth=value=>{const t=THREE.MathUtils.clamp(value,0,1);return t*t*(3-2*t);};
      for(let y=0;y<256;y++) for(let x=0;x<128;x++){
        const reach=(242-y)/242,across=Math.abs((x-63.5)/64);
        const spread=.45+.40*Math.sin(Math.max(0,reach)*Math.PI/2);
        // Gaussian spill rounds off the narrow source and dissolves the sides;
        // smooth end fades keep the finite light stamp from exposing its edges.
        const lateral=Math.exp(-2.2*(across/spread)**2);
        const source=smooth((reach+.054)/.11),end=1-smooth((reach-.58)/.42);
        const border=1-smooth((across-.80)/.20);
        const strength=.12*lateral*Math.exp(-1.15*(reach/.8)**2)*source*end*border;
        const i=(y*128+x)*4;
        pixels.data[i]=255;pixels.data[i+1]=193;pixels.data[i+2]=54;pixels.data[i+3]=Math.round(255*strength*BEAM_GAIN);
      }
      ctx.putImageData(pixels,0,0);
    }else{
      const gradient=ctx.createRadialGradient(64,128,0,64,128,63);
      gradient.addColorStop(0,'rgba(255,184,58,.18)');gradient.addColorStop(.5,'rgba(255,160,38,.05)');gradient.addColorStop(1,'rgba(255,155,30,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,256);
    }
    // Canvas colors are authored in sRGB. Treating yellow bytes as linear
    // light, then tone-mapping them, used to wash the beam toward white.
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(beam?BEAM_WIDTH:2.8,beam?BEAM_LENGTH:4.2),material);
    if(beam)mesh.userData.length=BEAM_LENGTH;
    mesh.rotation.x=-Math.PI/2;mesh.position.y=.045;
    return mesh;
  }
  buildMaze(maze){
    this.layout=worldLayout(maze);
    if(this.staticGroup) disposeDuskMaze(this.staticGroup);
    this.staticGroup=buildDuskMaze(maze);this.scene.add(this.staticGroup);
    this.beamMask.setWalls(this.staticGroup.userData.wallBounds);
    this.maze=maze;
  }
  reset(snapshot){
    this.buildMaze(snapshot.maze);
    for(const item of this.snakes.values()) this.removeSnake(item);
    this.snakes.clear();this.center.set(0,0);this.resetCamera=true;this.playerYaw=0;this.lastPlayer=null;
    this.vapor.reset();
    this.bites.reset();
    this.predation.reset();
  }
  makeSnake(s){
    const bodyColor=new THREE.Color(s.color);
    const material=new THREE.MeshPhysicalMaterial({color:bodyColor,roughness:.21,metalness:.18,clearcoat:1,clearcoatRoughness:.10,envMapIntensity:1.2});
    const group=new THREE.Group(),head=createSnakeHead(material);
    head.scale.setScalar(HEAD_SCALE);
    group.add(head);
    const plates=new THREE.InstancedMesh(snakeSegmentGeometry,material,64);plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);plates.frustumCulled=false;plates.castShadow=plates.receiveShadow=true;group.add(plates);
    const accentMaterial=new THREE.MeshStandardMaterial({color:bodyColor.clone().multiplyScalar(.65),roughness:.30,metalness:.16});
    const accents=new THREE.InstancedMesh(snakeSegmentAccentGeometry,accentMaterial,64);accents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);accents.frustumCulled=false;accents.receiveShadow=true;group.add(accents);
    const tail=new THREE.Mesh(growingTailGeometry,material);tail.morphTargetInfluences[0]=1;tail.castShadow=tail.receiveShadow=true;group.add(tail);
    const formerTail=new THREE.Mesh(growingTailGeometry,material);formerTail.morphTargetInfluences[0]=1;formerTail.castShadow=formerTail.receiveShadow=true;formerTail.visible=false;group.add(formerTail);
    tail.scale.set(MODEL_SCALE,MODEL_SCALE,CELL_SIZE*1.25);
    const spine=makeSpine(512);
    const skinMaterial=new THREE.MeshPhysicalMaterial({color:bodyColor.clone().multiplyScalar(.72),roughness:.30,metalness:.07,clearcoat:.65,clearcoatRoughness:.16});
    const skin=new THREE.Mesh(spine.geometry,skinMaterial);skin.frustumCulled=false;skin.castShadow=skin.receiveShadow=true;group.add(skin);
    this.scene.add(group);
    return {group,head,plates,accents,tail,formerTail,spine,skin,material,skinMaterial,accentMaterial};
  }
  removeSnake(item){
    this.scene.remove(item.group);item.plates.dispose();item.accents.dispose();item.spine.geometry.dispose();item.material.dispose();item.skinMaterial.dispose();item.accentMaterial.dispose();
  }
  drawSnake(item,s,time){
    const layout=this.layout;
    const route=snakeRoute(s,time),n=s.body.length,transition=this.bites.transitions.get(s.id);
    const sample=index=>transition?biteSnakeSample(s,time,index,transition):sampleSnake(route,index);
    const head=sample(0);
    item.head.position.set(layout.x(head.x),0,layout.z(head.y));
    const targetYaw=Math.hypot(head.dx,head.dy)>.001
      ?Math.atan2(head.dx,head.dy):Math.atan2(s.dir.x,s.dir.y);
    if(n===1&&item.headUpdatedAt!==undefined){
      // A lone head has no neck to provide a curved tangent. Turn its visible
      // pose over game time, retaining the last pose when the body is eaten.
      const elapsed=Math.max(0,time-item.headUpdatedAt)/1000;
      const delta=Math.atan2(Math.sin(targetYaw-item.head.rotation.y),Math.cos(targetYaw-item.head.rotation.y));
      item.head.rotation.y+=delta*(1-Math.exp(-18*elapsed));
    }else item.head.rotation.y=targetYaw;
    item.headUpdatedAt=time;
    animateSnakeMouth(item.head,snakeMouthOpening(s.id,time));
    const growth=biteHeadGrowth(time,transition);
    item.head.scale.setScalar(HEAD_SCALE*growth);item.head.visible=growth>0;
    item.formerTail.visible=growth<1;
    if(growth<1){
      const origin=biteHeadOrigin(transition),shape=biteTailShape(origin.event.snake,time,origin.previous);
      item.formerTail.position.copy(item.head.position);item.formerTail.position.y=shape.y;
      item.formerTail.rotation.y=targetYaw+Math.PI;
      item.formerTail.morphTargetInfluences[0]=shape.morph;
      item.formerTail.scale.set(MODEL_SCALE*(1-growth),MODEL_SCALE*(1-growth),shape.z*(1-growth));
    }
    item.plates.count=item.accents.count=Math.max(0,n-2);
    for(let i=1;i<n-1;i++){
      const p=sample(i);
      // Fill the committed interval with armor, retaining only a fine flexible
      // joint. The chord shortens through a bend or during the gathering phase.
      const before=sample(i-.5),after=sample(i+.5);
      const span=Math.hypot(after.x-before.x,after.y-before.y)*CELL_SIZE*.96;
      dummy.position.set(layout.x(p.x),.30*MODEL_SCALE,layout.z(p.y));dummy.rotation.set(0,Math.atan2(p.dx,p.dy),0);dummy.scale.set(MODEL_SCALE,MODEL_SCALE,span/plateLength);dummy.updateMatrix();item.plates.setMatrixAt(i-1,dummy.matrix);item.accents.setMatrixAt(i-1,dummy.matrix);
    }
    item.plates.instanceMatrix.needsUpdate=true;
    item.accents.instanceMatrix.needsUpdate=true;
    item.tail.visible=n>1;
    if(n>1){
      const tail=sample(n-1),shape=biteTailShape(s,time,transition);
      item.tail.morphTargetInfluences[0]=shape.morph;
      item.tail.scale.z=shape.z;
      item.tail.position.set(layout.x(tail.x),shape.y,layout.z(tail.y));
      item.tail.rotation.y=Math.atan2(tail.dx,tail.dy);
    }
    const {geometry,positions,normals,sides}=item.spine;
    const count=n===1?0:Math.min(512,(n-1)*16+1);
    for(let r=0;r<count;r++){
      const u=(n-1)*r/(count-1),p=sample(u);
      const length=Math.hypot(p.dx,p.dy)||1,nx=-p.dy/length,nz=p.dx/length;
      const radius=.207*MODEL_SCALE*Math.min(1,Math.max(.12,(n-1-u)*1.7));
      for(let j=0;j<sides;j++){
        const angle=j/sides*Math.PI*2,c=Math.cos(angle),v=Math.sin(angle),k=(r*sides+j)*3;
        positions[k]=layout.x(p.x)+nx*c*radius;positions[k+1]=.29*MODEL_SCALE+v*radius*.87;positions[k+2]=layout.z(p.y)+nz*c*radius;
        const normalLength=Math.hypot(c,v/.87);
        normals[k]=nx*c/normalLength;normals[k+1]=v/.87/normalLength;normals[k+2]=nz*c/normalLength;
      }
    }
    geometry.setDrawRange(0,Math.max(0,count-1)*sides*6);
    geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;
  }
  render(snapshot,dt){
    const canvas=this.renderer.domElement,width=canvas.clientWidth,height=canvas.clientHeight;
    if(width!==this.width||height!==this.height){this.width=width;this.height=height;this.renderer.setSize(width,height,false);this.resetCamera=true;}
    const p=snapshot.player;
    const layout=this.layout;
    this.bites.beginFrame(snapshot,layout,dt);
    this.predation.beginFrame(snapshot,layout,dt);
    this.zoom=THREE.MathUtils.damp(this.zoom,this.targetZoom,7,dt);
    this.tiltDegrees=THREE.MathUtils.damp(this.tiltDegrees,THREE.MathUtils.clamp(this.targetTiltDegrees,0,55),7,dt);
    const tilt=THREE.MathUtils.degToRad(this.tiltDegrees),groundProjection=Math.cos(tilt);
    // Fit the projected board and the raised models, rather than stretching
    // the old top-down image. The ground footprint also governs camera bounds.
    const projectedHeight=(layout.height+1)*groundProjection+2*Math.sin(tilt)+1.2;
    const aspect=width/Math.max(1,height),viewH=Math.max(projectedHeight,(layout.width+1.6)/aspect)/this.zoom,viewW=viewH*aspect;
    const boundX=Math.max(0,(layout.width+1)/2-viewW/2);
    const targetX=p?THREE.MathUtils.clamp(layout.x(p.visual.x),-boundX,boundX):0;
    const worldH=viewH/groundProjection;
    const boundZ=Math.max(0,(layout.height+1)/2-worldH/2);
    const targetY=p?THREE.MathUtils.clamp(layout.z(p.visual.y),-boundZ,boundZ):0;
    if(this.resetCamera){this.center.set(targetX,targetY);this.resetCamera=false;}
    this.center.x=THREE.MathUtils.damp(this.center.x,targetX,6,dt);this.center.y=THREE.MathUtils.damp(this.center.y,targetY,6,dt);
    this.camera.left=-viewW/2;this.camera.right=viewW/2;this.camera.top=viewH/2;this.camera.bottom=-viewH/2;
    this.camera.position.set(this.center.x,50*groundProjection,this.center.y+50*Math.sin(tilt));this.camera.lookAt(this.center.x,0,this.center.y);this.camera.updateProjectionMatrix();
    if(p){
      this.player.visible=!p.hidden;
      this.player.scale.setScalar(PLAYER_SCALE);
      this.player.position.set(layout.x(p.visual.x),p.dead?-.08:0,layout.z(p.visual.y));
      const target=Math.atan2(p.dir.x,p.dir.y),delta=Math.atan2(Math.sin(target-this.playerYaw),Math.cos(target-this.playerYaw));
      this.playerYaw+=delta*(1-Math.exp(-18*dt));this.player.rotation.y=this.playerYaw;
      this.player.userData.jaw.rotation.x=p.dead?.22:.08+.14*(.5+.5*Math.sin(snapshot.time/130));
      this.playerMaterial.emissive.setHex(p.shield?0x214912:0x000000);this.playerMaterial.emissiveIntensity=p.shield?.35:0;
      this.halo.visible=this.beam.visible=!p.dead&&!p.hidden;
      this.halo.position.set(layout.x(p.visual.x),.025,layout.z(p.visual.y));
      this.beam.position.set(layout.x(p.visual.x)+Math.sin(this.playerYaw)*BEAM_OFFSET,.026,layout.z(p.visual.y)+Math.cos(this.playerYaw)*BEAM_OFFSET);
      this.beam.rotation.set(-Math.PI/2,0,Math.PI+this.playerYaw);
      const x=this.player.position.x,z=this.player.position.z,dx=Math.sin(this.playerYaw),dz=Math.cos(this.playerYaw);
      this.glow.position.set(x+dx*.65,1.15,z+dz*.65);this.glow.intensity=p.dead||p.hidden?0:2.2*BEAM_GAIN;
      // Above the armor and wall coping, just ahead of the helmet. A broad,
      // almost level cone reaches both upward and vertical model surfaces.
      this.flashlight.position.set(x+dx*.82,FLASHLIGHT_HEIGHT,z+dz*.82);
      this.flashlight.target.position.set(x+dx*9.9,FLASHLIGHT_TARGET_HEIGHT,z+dz*9.9);
      this.flashlight.intensity=p.dead||p.hidden?0:FLASHLIGHT_INTENSITY;
      if(this.beam.visible)this.beamMask.update(x,z,this.playerYaw);
    }else{
      this.player.visible=this.halo.visible=this.beam.visible=false;
      this.glow.intensity=this.flashlight.intensity=0;
    }
    this.vapor.update(snapshot.time,this.player.position,this.playerYaw,Boolean(p&&!p.dead&&!p.hidden),this.camera);
    this.bites.update(this.player);
    const ids=new Set(snapshot.snakes.map(s=>s.id));
    for(const [id,item] of this.snakes) if(!ids.has(id)){this.removeSnake(item);this.snakes.delete(id);}
    for(const s of snapshot.snakes){
      if(!this.snakes.has(s.id)) this.snakes.set(s.id,this.makeSnake(s));
      this.drawSnake(this.snakes.get(s.id),s,snapshot.time);
    }
    this.predation.update(snapshot,this.player,this.snakes);
    this.renderer.render(this.scene,this.camera);
  }
  playerScreenPosition(){
    const point=this.player.getWorldPosition(new THREE.Vector3());
    point.y+=.9;point.project(this.camera);
    const rect=this.renderer.domElement.getBoundingClientRect();
    return {x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};
  }
  diagnostics(){return {three:THREE.REVISION,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,pixelRatio:this.renderer.getPixelRatio(),zoom:this.zoom,tiltDegrees:this.tiltDegrees,shadows:this.renderer.shadowMap.enabled,models:'concept-v5',grid:this.layout&&[this.layout.cols,this.layout.rows],cellSpacing:CELL_SIZE,beamLength:BEAM_LENGTH,beamWidth:BEAM_WIDTH,beamIntensityGain:BEAM_GAIN,flashlightShadows:this.flashlight.castShadow,overheadLamps:this.lighting.pools.length,vaporPuffs:this.vapor.puffs.length};}
}
