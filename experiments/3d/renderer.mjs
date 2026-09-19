import * as THREE from './vendor/three.module.min.js';
import {ProjectionCamera,pointerDirection,cameraNorthLimit} from './projection-camera.mjs';
import {MotionZoom} from './motion-zoom.mjs';
import {CameraFollow} from './camera-follow.mjs';
import {CameraPresentation,cameraLookAhead} from './camera-presentation.mjs';
import {snakeRoute,sampleSnake} from './motion.mjs';
import {createPlayerModel} from './models/player.mjs';
import {createCrystalBiter} from './models/crystal-biter.mjs';
import {createNeonHedgehog} from './models/neon-hedgehog.mjs';
import {createCrystalTurtle} from './models/crystal-turtle.mjs';
import {createCrystalDragon} from './models/crystal-dragon.mjs';
import {createCrystalDragon as createCrystalDragonV1} from './models/crystal-dragon-v1.mjs';
import {createCrystalDragon as createCrystalDragonV2} from './models/crystal-dragon-v2.mjs';
import {createCrystalDragon as createCrystalDragonV3} from './models/crystal-dragon-v3.mjs';
import {createCrystalDragon as createCrystalDragonV4} from './models/crystal-dragon-v4.mjs';
import {DragonMotion} from './dragon-motion.mjs';
import {DragonMotion as DragonMotionV1} from './dragon-motion-v1.mjs';
import {DragonMotion as DragonMotionV2} from './dragon-motion-v2.mjs';
import {DragonPaddling} from './dragon-paddling.mjs';
import {DragonPresence} from './dragon-presence.mjs';
import {DragonForm} from './dragon-form.mjs';
import {DragonPaddling as DragonPaddlingV1} from './dragon-paddling-v1.mjs';
import {DragonPaddling as DragonPaddlingV2} from './dragon-paddling-v2.mjs';
import {DragonPaddling as DragonPaddlingV3} from './dragon-paddling-v3.mjs';
import {TurtleGait} from './turtle-gait.mjs';
import {createCrystalBiter as createCrystalBiterV1} from './models/crystal-biter-v1.mjs';
import {createCrystalBiter as createCrystalBiterV2} from './models/crystal-biter-v2.mjs';
import {createCrystalBiter as createCrystalBiterV3} from './models/crystal-biter-v3.mjs';
import {BiterGait} from './biter-gait.mjs';
import {BiterGait as BiterGaitV2} from './biter-gait-v2.mjs';
import {BiterGait as BiterGaitV3} from './biter-gait-v3.mjs';
import {PlayerCrystalDust} from './player-vapor.mjs';
import {createSnakeHead,animateSnakeMouth,snakeSegmentGeometry,snakeSegmentAccentGeometry} from './models/snake.mjs';
import {snakeMouthOpening} from './snake-mouth.mjs';
import {BiteEffects,biteSnakeSample,biteTailShape,biteHeadGrowth,biteHeadOrigin,growingTailGeometry} from './bite-effects.mjs';
import {PlayerEaten} from './player-eaten.mjs';
import {lightDuskScene,buildDuskMaze,disposeDuskMaze,setDuskLightingVariant} from './environment.mjs';
import {dressCrystalRuins,setRuinsLighting} from './ruins-materials.mjs';
import {updateRuinsCarvings} from './ruins-carvings.mjs';
import {Atmosphere,ORIGINAL_GLOW} from './atmosphere.mjs';
import {WetFloor} from './wet-floor.mjs';
import {ruinsSegmentGeometry,ruinsTailGeometry,ruinsAccentGeometry,RUINS_WIDTH,RUINS_HEIGHT,setRuinsFinish} from './ruins-snakes.mjs';
import {GroundBeamMask} from './flashlight-mask.mjs';
import {WallMirrors} from './wall-mirrors.mjs';
import {SnakeLight,createSnakeFinish,snakeCoreGeometry,addSnakeHeadCores,copySnakeCore} from './snake-light.mjs';
import {PlayerGlass} from './player-glass.mjs';
import {NeonPolish} from './neon-polish.mjs';
import {worldLayout,MODEL_SCALE,HEAD_SCALE,PLAYER_SCALE,CELL_SIZE,WALL_WIDTH,WALL_HEIGHT,DEFAULT_TILT,DEFAULT_ZOOM,DEFAULT_PROJECTION} from './world.mjs';
const dummy=new THREE.Object3D();
snakeSegmentGeometry.computeBoundingBox();
const plateLength=snakeSegmentGeometry.boundingBox.max.z-snakeSegmentGeometry.boundingBox.min.z;
const BEAM_LENGTH=4.4,BEAM_WIDTH=5.6,BEAM_OFFSET=1.6,BEAM_GAIN=2;
// Preserve the original golden wet-floor glint and gentle near-field bounce.
// Stronger fill this close bleaches the broad lime muzzle.
const NEAR_GLOW_INTENSITY=1.1;

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
  constructor(canvas,{playerModel='old',lighting='current',worldStyle='current'}={}){
    this.worldStyle=worldStyle==='ruins'?'ruins':'current';this.mirrorsRequested=true;
    this.lightingVariant=lighting==='contrast'?'contrast':'current';
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.setClearColor(0x060913);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.transmissionResolutionScale=.5;
    this.scene=new THREE.Scene();
    this.camera=new ProjectionCamera();
    // Keep maze north at the top even at a perfectly vertical viewing angle.
    this.camera.up.set(0,0,-1);
    this.lighting=lightDuskScene(this.renderer,this.scene);
    this.wallMirrors=new WallMirrors(this.renderer);
    this.wetFloor=new WetFloor(this.renderer);
    setRuinsLighting(this.lighting,this.scene,this.worldStyle==='ruins');
    this.wallMirrors.setEnabled(this.worldStyle!=='ruins');
    this.snakeLight=new SnakeLight(this.scene);
    this.neonPolish=new NeonPolish();
    this.staticGroup=null;
    this.snakes=new Map();this.zoom=DEFAULT_ZOOM;this.targetZoom=DEFAULT_ZOOM;this.center=new THREE.Vector2();
    this.motionZoom=new MotionZoom();this.cameraZoom=1;
    this.cameraPresentation=new CameraPresentation();
    this.cameraFollow=new CameraFollow();
    this.tiltDegrees=DEFAULT_TILT;this.targetTiltDegrees=DEFAULT_TILT;
    this.projection=DEFAULT_PROJECTION;this.targetProjection=DEFAULT_PROJECTION;
    if(['dragon','dragon-v1','dragon-v2','dragon-v3','dragon-v4','turtle','hedgehog','crystal','crystal-v1','crystal-v2','crystal-v3'].includes(playerModel)){
      this.playerGlass=playerModel==='dragon'?createCrystalDragon():playerModel==='dragon-v1'?createCrystalDragonV1():playerModel==='dragon-v2'?createCrystalDragonV2():playerModel==='dragon-v3'?createCrystalDragonV3():playerModel==='dragon-v4'?createCrystalDragonV4():playerModel==='turtle'?createCrystalTurtle():playerModel==='hedgehog'?createNeonHedgehog():playerModel==='crystal-v1'?createCrystalBiterV1():playerModel==='crystal-v2'?createCrystalBiterV2():playerModel==='crystal-v3'?createCrystalBiterV3():createCrystalBiter();
      this.player=this.playerGlass.model;this.playerMaterial=this.playerGlass.material;
      if(playerModel.startsWith('dragon')){
        const Motion=playerModel==='dragon-v1'?DragonMotionV1:(playerModel==='dragon-v2'||playerModel==='dragon-v3'||playerModel==='dragon-v4')?DragonMotionV2:DragonMotion;
        this.player.userData.dragonMotion=new Motion({rig:this.player.userData.dragonRig,scale:PLAYER_SCALE});
        if(playerModel==='dragon')this.player.userData.dragonPaddling=new DragonPaddling({rig:this.player.userData.paddleRig});
        if(playerModel==='dragon')this.player.userData.dragonPresence=new DragonPresence({rig:this.player.userData.presenceRig});
        if(playerModel==='dragon-v2')this.player.userData.dragonPaddling=new DragonPaddlingV1({rig:this.player.userData.paddleRig});
        if(playerModel==='dragon-v3')this.player.userData.dragonPaddling=new DragonPaddlingV2({rig:this.player.userData.paddleRig});
        if(playerModel==='dragon-v4')this.player.userData.dragonPaddling=new DragonPaddlingV3({rig:this.player.userData.paddleRig});
      }else if(playerModel!=='crystal-v1'){
        const Gait=playerModel==='turtle'?TurtleGait:playerModel==='crystal-v2'?BiterGaitV2:playerModel==='crystal-v3'?BiterGaitV3:BiterGait;
        this.player.userData.gait=new Gait({body:this.player.userData.bodyRig,paws:this.player.userData.paws,scale:PLAYER_SCALE});
      }
    }else{
      this.playerGlass=new PlayerGlass();this.playerMaterial=this.playerGlass.material;
      this.player=createPlayerModel(this.playerMaterial);this.playerGlass.attach(this.player);
    }
    this.player.scale.setScalar(PLAYER_SCALE);this.scene.add(this.player);
    this.dust=new PlayerCrystalDust();this.dust.setEnabled(false);this.scene.add(this.dust.group);
    this.bites=new BiteEffects();this.bites.setWorldStyle(this.worldStyle);this.scene.add(this.bites.group);
    for(const slot of this.bites.slots)this.neonPolish.register(slot.finish);
    this.predation=new PlayerEaten(this.bites.bloom.assets);this.scene.add(this.predation.bloom.group);
    this.dragonForm=playerModel==='dragon'?new DragonForm(this.player,this.bites.bloom.assets):null;
    if(this.dragonForm)this.scene.add(this.dragonForm.bloom.group);
    // Most of the beam is real surface illumination. A faint floor spill
    // softens its footprint without competing with the lit armor and walls.
    this.halo=this.lightStamp(false);this.beam=this.lightStamp(true);
    this.beamMask=new GroundBeamMask(this.beam,{length:BEAM_LENGTH,width:BEAM_WIDTH,offset:BEAM_OFFSET});
    this.scene.add(this.halo,this.beam);
    this.glow=new THREE.PointLight(0xffc347,NEAR_GLOW_INTENSITY,3.6,2);this.scene.add(this.glow);
    this.flashlight=new THREE.SpotLight(ORIGINAL_GLOW.color,ORIGINAL_GLOW.power,ORIGINAL_GLOW.reach,ORIGINAL_GLOW.angle,ORIGINAL_GLOW.penumbra,1.5);
    this.flashlight.shadow.radius=2;
    this.flashlight.castShadow=true;this.flashlight.shadow.mapSize.set(1024,1024);
    this.flashlight.shadow.camera.near=.1;this.flashlight.shadow.camera.far=12;
    this.flashlight.shadow.bias=-.0002;this.flashlight.shadow.normalBias=.02;
    this.scene.add(this.flashlight,this.flashlight.target);
    this.playerYaw=0;this.lastPlayer=null;
    this.atmosphere=new Atmosphere(this);
  }
  resetView(){
    this.targetZoom=DEFAULT_ZOOM;
    this.targetTiltDegrees=DEFAULT_TILT;
    this.targetProjection=DEFAULT_PROJECTION;
  }
  setHudOverlay(element){this.hudOverlay=element;}
  lightStamp(beam){
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
    const ctx=canvas.getContext('2d');
    if(beam){
      const pixels=ctx.createImageData(128,256);
      const smooth=value=>{const t=THREE.MathUtils.clamp(value,0,1);return t*t*(3-2*t);};
      for(let y=0;y<256;y++) for(let x=0;x<128;x++){
        const along=(.5-y/255)*BEAM_LENGTH+BEAM_OFFSET,across=Math.abs((x-63.5)/64);
        // Broad oval glow: width never narrows toward the source. Feather all
        // edges and the rear into the unchanged close halo around the dragon.
        const radiusSquared=(across/.73)**2+((along-1.05)/1.85)**2;
        const source=smooth(along/.6),end=1-smooth((along-2.65)/1.15);
        const border=1-smooth((across-.75)/.25);
        const strength=.09*Math.exp(-1.6*radiusSquared)*source*end*border;
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
    this.wetFloor.release();
    if(this.staticGroup) disposeDuskMaze(this.staticGroup);
    this.staticGroup=buildDuskMaze(maze,{worldStyle:this.worldStyle});this.scene.add(this.staticGroup);
    if(this.worldStyle==='ruins'){dressCrystalRuins(this.staticGroup);this.wetFloor.attach(this.staticGroup);}
    else this.wallMirrors.attach(this.staticGroup);
    setDuskLightingVariant(this.staticGroup,this.lightingVariant);
    this.beamMask.setWalls(this.staticGroup.userData.wallBounds);
    this.dust.setWalls(this.staticGroup.userData.wallBounds);
    this.maze=maze;
    this.atmosphere?.apply();
  }
  reset(snapshot){
    // A restart of the same maze need not destroy its buffers and compiled
    // glass/reflection programs. Reuse the roster entries that still exist.
    if(!this.maze||JSON.stringify(this.maze)!==JSON.stringify(snapshot.maze))this.buildMaze(snapshot.maze);
    const roster=new Map(snapshot.snakes.map(s=>[s.id,s]));
    for(const [id,item] of this.snakes){
      if(!roster.has(id)){this.removeSnake(item);this.snakes.delete(id);}
      else{item.finish.setColor(roster.get(id).color);item.headUpdatedAt=undefined;}
    }
    this.playerYaw=0;this.lastPlayer=null;
    this.motionZoom.reset();this.cameraPresentation.beginLevel();
    this.dust.reset();
    this.player.userData.gait?.reset();
    this.player.userData.dragonMotion?.reset(snapshot);
    this.player.userData.dragonPaddling?.reset();
    this.player.userData.dragonPresence?.reset();
    this.bites.reset();
    this.predation.reset();
    this.dragonForm?.reset();
    this.snakeLight.reset();
  }
  async prepare(snapshot){
    this.reset(snapshot);this.render(snapshot,0);
    await this.renderer.compileAsync(this.scene,this.camera);
    await this.wallMirrors.prepare(this.scene,this.camera);
    this.render(snapshot,0);
  }
  makeSnake(s){
    const finish=createSnakeFinish(s.color),{material,skinMaterial,accentMaterial,coreMaterial}=finish;
    this.neonPolish.register(finish);
    const group=new THREE.Group(),head=createSnakeHead(material);
    addSnakeHeadCores(head,finish);
    head.scale.setScalar(HEAD_SCALE);
    group.add(head);
    const plates=new THREE.InstancedMesh(snakeSegmentGeometry,material,64);plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);plates.frustumCulled=false;plates.castShadow=plates.receiveShadow=true;group.add(plates);
    const accents=new THREE.InstancedMesh(snakeSegmentAccentGeometry,accentMaterial,64);accents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);accents.frustumCulled=false;accents.receiveShadow=true;group.add(accents);
    const tail=new THREE.Mesh(growingTailGeometry,material);tail.morphTargetInfluences[0]=1;tail.castShadow=tail.receiveShadow=true;group.add(tail);
    const formerTail=new THREE.Mesh(growingTailGeometry,material);formerTail.morphTargetInfluences[0]=1;formerTail.castShadow=formerTail.receiveShadow=true;formerTail.visible=false;group.add(formerTail);
    const corePlates=new THREE.InstancedMesh(snakeCoreGeometry(snakeSegmentGeometry),coreMaterial,64);
    corePlates.name='Body luminous cores';corePlates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);corePlates.frustumCulled=false;
    const coreTail=new THREE.Mesh(snakeCoreGeometry(growingTailGeometry),coreMaterial),coreFormerTail=new THREE.Mesh(snakeCoreGeometry(growingTailGeometry),coreMaterial);
    coreTail.name='Tail luminous core';coreFormerTail.name='Transforming tail luminous core';
    group.add(corePlates,coreTail,coreFormerTail);
    tail.scale.set(MODEL_SCALE,MODEL_SCALE,CELL_SIZE*1.25);
    const spine=makeSpine(512);
    const skin=new THREE.Mesh(spine.geometry,skinMaterial);skin.frustumCulled=false;skin.castShadow=skin.receiveShadow=true;group.add(skin);
    this.scene.add(group);
    const item={group,head,plates,accents,tail,formerTail,spine,skin,material,skinMaterial,accentMaterial,finish,corePlates,coreTail,coreFormerTail};
    this.configureSnakeStyle(item);this.snakeLight.attach(item);return item;
  }
  configureSnakeStyle(item){
    const ruins=this.worldStyle==='ruins';
    item.plates.geometry=ruins?ruinsSegmentGeometry:snakeSegmentGeometry;
    item.accents.geometry=ruins?ruinsAccentGeometry:snakeSegmentAccentGeometry;
    for(const mesh of [item.tail,item.formerTail]){mesh.geometry=ruins?ruinsTailGeometry:growingTailGeometry;mesh.updateMorphTargets();}
    item.corePlates.geometry=snakeCoreGeometry(item.plates.geometry);
    for(const mesh of [item.coreTail,item.coreFormerTail]){mesh.geometry=snakeCoreGeometry(item.tail.geometry);mesh.updateMorphTargets();}
    setRuinsFinish(item.finish,ruins);
  }
  removeSnake(item){
    this.neonPolish.unregister(item.finish);
    this.scene.remove(item.group);this.snakeLight.remove(item);item.plates.dispose();item.corePlates.dispose();item.accents.dispose();item.spine.geometry.dispose();item.finish.dispose();
  }
  drawSnake(item,s,time){
    const layout=this.layout,ruins=this.worldStyle==='ruins',sx=ruins?RUINS_WIDTH:1,sy=ruins?RUINS_HEIGHT:1;
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
    item.head.scale.set(HEAD_SCALE*growth*(ruins?.86:1),HEAD_SCALE*growth*sy,HEAD_SCALE*growth);item.head.visible=growth>0;
    item.formerTail.visible=growth<1;
    if(growth<1){
      const origin=biteHeadOrigin(transition),shape=biteTailShape(origin.event.snake,time,origin.previous);
      item.formerTail.position.copy(item.head.position);item.formerTail.position.y=shape.y*sy;
      item.formerTail.rotation.y=targetYaw+Math.PI;
      item.formerTail.morphTargetInfluences[0]=shape.morph;
      item.formerTail.scale.set(MODEL_SCALE*(1-growth)*sx,MODEL_SCALE*(1-growth)*sy,shape.z*(1-growth));
    }
    item.plates.count=item.accents.count=Math.max(0,n-2);
    for(let i=1;i<n-1;i++){
      const p=sample(i);
      // Fill the committed interval with armor, retaining only a fine flexible
      // joint. The chord shortens through a bend or during the gathering phase.
      const before=sample(i-.5),after=sample(i+.5);
      const span=Math.hypot(after.x-before.x,after.y-before.y)*CELL_SIZE*.96;
      dummy.position.set(layout.x(p.x),.30*MODEL_SCALE*sy,layout.z(p.y));dummy.rotation.set(0,Math.atan2(p.dx,p.dy),0);dummy.scale.set(MODEL_SCALE*sx,MODEL_SCALE*sy,span/plateLength);dummy.updateMatrix();item.plates.setMatrixAt(i-1,dummy.matrix);item.accents.setMatrixAt(i-1,dummy.matrix);
    }
    item.plates.instanceMatrix.needsUpdate=true;
    item.accents.instanceMatrix.needsUpdate=true;
    item.corePlates.count=item.plates.count;
    item.corePlates.instanceMatrix.array.set(item.plates.instanceMatrix.array);item.corePlates.instanceMatrix.needsUpdate=true;
    item.tail.visible=n>1;
    if(n>1){
      const tail=sample(n-1),shape=biteTailShape(s,time,transition);
      item.tail.morphTargetInfluences[0]=shape.morph;
      item.tail.scale.set(MODEL_SCALE*sx,MODEL_SCALE*sy,shape.z);
      item.tail.position.set(layout.x(tail.x),shape.y*sy,layout.z(tail.y));
      item.tail.rotation.y=Math.atan2(tail.dx,tail.dy);
    }
    copySnakeCore(item.coreTail,item.tail);copySnakeCore(item.coreFormerTail,item.formerTail);
    const {geometry,positions,normals,sides}=item.spine;
    const count=n===1?0:Math.min(512,(n-1)*16+1);
    for(let r=0;r<count;r++){
      const u=(n-1)*r/(count-1),p=sample(u);
      const length=Math.hypot(p.dx,p.dy)||1,nx=-p.dy/length,nz=p.dx/length;
      const radius=.207*MODEL_SCALE*sx*Math.min(1,Math.max(.12,(n-1-u)*1.7));
      for(let j=0;j<sides;j++){
        const angle=j/sides*Math.PI*2,c=Math.cos(angle),v=Math.sin(angle),k=(r*sides+j)*3;
        positions[k]=layout.x(p.x)+nx*c*radius;positions[k+1]=.29*MODEL_SCALE*sy+v*radius*.87*sy/sx;positions[k+2]=layout.z(p.y)+nz*c*radius;
        const ellipse=.87*sy/sx,normalLength=Math.hypot(c,v/ellipse);
        normals[k]=nx*c/normalLength;normals[k+1]=v/ellipse/normalLength;normals[k+2]=nz*c/normalLength;
      }
    }
    geometry.setDrawRange(0,Math.max(0,count-1)*sides*6);
    geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;
    this.snakeLight.sample(item,s,sample,layout);
  }
  render(snapshot,dt,elapsed=dt){
    const canvas=this.renderer.domElement,width=canvas.clientWidth,height=canvas.clientHeight;
    if(width!==this.width||height!==this.height){this.width=width;this.height=height;this.renderer.setSize(width,height,false);}
    const p=snapshot.player;
    const layout=this.layout;
    this.bites.beginFrame(snapshot,layout,dt);
    this.predation.beginFrame(snapshot,layout,dt);
    this.zoom=THREE.MathUtils.damp(this.zoom,this.targetZoom,7,dt);
    // The slider remains the closest framing. Movement only opens the view;
    // existing perspective, camera bounds and the HUD safe area use that view.
    const motionFactor=this.motionZoom.update(snapshot,elapsed);
    this.cameraZoom=this.cameraPresentation.update(snapshot,this.zoom,motionFactor,dt);
    this.tiltDegrees=THREE.MathUtils.damp(this.tiltDegrees,THREE.MathUtils.clamp(this.targetTiltDegrees,0,75),7,dt);
    this.projection=THREE.MathUtils.damp(this.projection,THREE.MathUtils.clamp(this.targetProjection,0,1),7,dt);
    if(Math.abs(this.projection-this.targetProjection)<.00001)this.projection=THREE.MathUtils.clamp(this.targetProjection,0,1);
    const tilt=THREE.MathUtils.degToRad(this.tiltDegrees),groundProjection=Math.cos(tilt);
    // Fit the projected board and the raised models, rather than stretching
    // the old top-down image. The ground footprint also governs camera bounds.
    const projectedHeight=(layout.height+1)*groundProjection+2*Math.sin(tilt)+1.2;
    const aspect=width/Math.max(1,height),viewH=Math.max(projectedHeight,(layout.width+1.6)/aspect)/this.cameraZoom,viewW=viewH*aspect;
    this.camera.left=-viewW/2;this.camera.right=viewW/2;this.camera.top=viewH/2;this.camera.bottom=-viewH/2;
    this.camera.setProjection(this.projection);
    const boundX=Math.max(0,(layout.width+1)/2-viewW/2);
    const worldH=viewH/groundProjection;
    const tracking=p&&!p.dead&&!p.hidden&&!snapshot.paused&&!snapshot.complete&&!snapshot.gameOver;
    const lead=tracking?cameraLookAhead(this.motionZoom.vx*CELL_SIZE,this.motionZoom.vy*CELL_SIZE,viewW,worldH):{x:0,y:0};
    const focused=p&&this.cameraPresentation.focus;
    const targetX=focused?THREE.MathUtils.clamp(layout.x(p.visual.x)+lead.x,-boundX,boundX):0;
    const boundZ=Math.max(0,(layout.height+1)/2-worldH/2);
    let northLimit=-boundZ;
    if(this.hudOverlay){
      const topInset=Math.max(0,this.hudOverlay.getBoundingClientRect().bottom-canvas.getBoundingClientRect().top);
      if(topInset>0){
        // Extend only the northward pan. The full scene still renders behind
        // the glass while the player explores the rest of the maze.
        northLimit=Math.min(northLimit,cameraNorthLimit(this.camera,tilt,
          layout.z(0)-WALL_WIDTH/2,WALL_HEIGHT+.04,topInset+4,height));
      }
    }
    const targetY=focused?THREE.MathUtils.clamp(layout.z(p.visual.y)+lead.y,northLimit,boundZ):0;
    if(this.resetCamera){this.center.set(targetX,targetY);this.cameraFollow.reset();this.resetCamera=false;}
    this.cameraFollow.update(this.center,targetX,targetY,dt);
    this.cameraFollow.clamp(this.center,-boundX,boundX,northLimit,boundZ);
    const distance=this.camera.focusDistance;
    this.camera.position.set(this.center.x,distance*groundProjection,this.center.y+distance*Math.sin(tilt));this.camera.lookAt(this.center.x,0,this.center.y);this.camera.updateMatrixWorld();
    if(p){
      this.player.visible=!p.hidden;
      this.player.scale.setScalar(PLAYER_SCALE);
      this.player.position.set(layout.x(p.visual.x),p.dead?-.08:0,layout.z(p.visual.y));
      const target=Math.atan2(p.dir.x,p.dir.y);
      // Seed the long body in the same reserved direction as its new life,
      // before route construction. Ordinary movement still turns smoothly.
      if(this.player.userData.dragonMotion&&!p.dead&&(!this.lastPlayer||this.lastPlayer.dead||this.lastPlayer.lives!==p.lives))this.playerYaw=target;
      const delta=Math.atan2(Math.sin(target-this.playerYaw),Math.cos(target-this.playerYaw));
      this.lastPlayer??={};this.lastPlayer.dead=p.dead;this.lastPlayer.lives=p.lives;
      this.playerYaw+=delta*(1-Math.exp(-18*dt));this.player.rotation.y=this.playerYaw;
      this.player.userData.jaw.rotation.x=p.dead?.22:(this.player.userData.idleJaw??.08)+(this.player.userData.idleJawAmplitude??.14)*(.5+.5*Math.sin(snapshot.time/130));
      this.halo.visible=this.beam.visible=!p.dead&&!p.hidden;
      this.halo.position.set(layout.x(p.visual.x),.025,layout.z(p.visual.y));
      this.beam.position.set(layout.x(p.visual.x)+Math.sin(this.playerYaw)*BEAM_OFFSET,.026,layout.z(p.visual.y)+Math.cos(this.playerYaw)*BEAM_OFFSET);
      this.beam.rotation.set(-Math.PI/2,0,Math.PI+this.playerYaw);
      const x=this.player.position.x,z=this.player.position.z,dx=Math.sin(this.playerYaw),dz=Math.cos(this.playerYaw);
      this.glow.position.set(x+dx*.65,1.15,z+dz*.65);this.glow.intensity=p.dead||p.hidden?0:NEAR_GLOW_INTENSITY;
      // Above the armor and wall coping, just ahead of the helmet. A broad,
      // almost level cone reaches both upward and vertical model surfaces.
      this.flashlight.position.set(x+dx*ORIGINAL_GLOW.forward,ORIGINAL_GLOW.height,z+dz*ORIGINAL_GLOW.forward);
      this.flashlight.target.position.set(x+dx*ORIGINAL_GLOW.targetForward,ORIGINAL_GLOW.targetHeight,z+dz*ORIGINAL_GLOW.targetForward);
      this.flashlight.intensity=p.dead||p.hidden?0:ORIGINAL_GLOW.power;
      if(this.beam.visible&&this.atmosphere.mode==='original')this.beamMask.update(x,z,this.playerYaw);
    }else{
      this.player.visible=this.halo.visible=this.beam.visible=false;
      this.glow.intensity=this.flashlight.intensity=0;
    }
    this.dragonForm?.pose(p);
    this.player.userData.gait?.update(this.player,p,snapshot.time,elapsed,snapshot.paused);
    this.player.userData.dragonMotion?.update(this.player,p,snapshot,layout,elapsed,this.staticGroup?.userData.wallBounds);
    this.player.userData.dragonPaddling?.update(this.player,p,snapshot,elapsed,this.staticGroup.userData.wallBounds);
    this.player.userData.dragonPresence?.update(this.player,p,snapshot,elapsed,this.player.userData.dragonPaddling?.activity??0);
    if(this.dust.enabled)this.dust.update(snapshot.time,this.player.position,Boolean(p&&!p.dead&&!p.hidden),elapsed);
    this.bites.update(this.player);
    const ids=new Set(snapshot.snakes.map(s=>s.id));
    this.snakeLight.beginFrame();
    for(const [id,item] of this.snakes) if(!ids.has(id)){this.removeSnake(item);this.snakes.delete(id);}
    for(const s of snapshot.snakes){
      if(!this.snakes.has(s.id)) this.snakes.set(s.id,this.makeSnake(s));
      this.drawSnake(this.snakes.get(s.id),s,snapshot.time);
    }
    this.predation.update(snapshot,this.player,this.snakes);
    this.dragonForm?.update(snapshot,layout,this.snakes);
    this.player.userData.applyPose?.();
    this.playerGlass.update(p);
    this.snakeLight.update(this.camera,dt);
    updateRuinsCarvings(this.staticGroup,snapshot.time);
    this.atmosphere.update(p);
    this.wetFloor.render(this.scene,this.camera);
    if(this.wetFloor.floor){
      // The planar pass already refreshed the same actors' shadow maps.
      // Reuse them for the main view instead of rendering every caster twice.
      const shadows=this.renderer.shadowMap,auto=shadows.autoUpdate,needs=shadows.needsUpdate;
      try{shadows.autoUpdate=false;shadows.needsUpdate=false;this.wallMirrors.render(this.scene,this.camera);}
      finally{shadows.autoUpdate=auto;shadows.needsUpdate=needs;}
    }else this.wallMirrors.render(this.scene,this.camera);
  }
  setMirrorWalls(enabled){this.mirrorsRequested=Boolean(enabled);this.wallMirrors.setEnabled(this.mirrorsRequested&&this.worldStyle!=='ruins');}
  setWorldStyle(value){
    const next=value==='ruins'?'ruins':'current';if(next===this.worldStyle)return;
    this.worldStyle=next;this.wallMirrors.setEnabled(this.mirrorsRequested&&next!=='ruins');
    setRuinsLighting(this.lighting,this.scene,next==='ruins');
    if(this.maze)this.buildMaze(this.maze);
    for(const item of this.snakes.values())this.configureSnakeStyle(item);
    this.bites.setWorldStyle(next);
  }
  setNeonPolish(enabled){this.neonPolish.setEnabled(enabled);}
  setNeonLook(look){this.neonPolish.setLook(look);}
  setAtmosphere(value){this.atmosphere.set(value);}
  setLightingVariant(value){
    this.lightingVariant=value==='contrast'?'contrast':'current';
    if(this.staticGroup)setDuskLightingVariant(this.staticGroup,this.lightingVariant);
  }
  pointerDirection(clientX,clientY){
    const anchor=this.player.getWorldPosition(new THREE.Vector3());anchor.y+=.9;
    return pointerDirection(this.camera,this.renderer.domElement.getBoundingClientRect(),clientX,clientY,anchor);
  }
  playerScreenPosition(){
    const point=this.player.getWorldPosition(new THREE.Vector3());
    point.y+=.9;point.project(this.camera);
    const rect=this.renderer.domElement.getBoundingClientRect();
    return {x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};
  }
  diagnostics(){return {worldStyle:this.worldStyle,wetFloor:this.wetFloor.diagnostics(),dragonPresence:this.player.userData.dragonPresence?.diagnostics(),dragonPaddling:this.player.userData.dragonPaddling?.diagnostics(),dragonMotion:this.player.userData.dragonMotion?.diagnostics(),lightingVariant:this.lightingVariant,floorBackgroundGain:this.staticGroup?.userData.floorBackgroundGain,stoneBackgroundGain:this.staticGroup?.userData.stoneBackgroundGain,three:THREE.REVISION,drawCalls:this.wallMirrors.lastTotalCalls,triangles:this.wallMirrors.lastTotalTriangles,wallMirrors:this.wallMirrors.diagnostics(),geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,pixelRatio:this.renderer.getPixelRatio(),zoom:this.cameraZoom,baseZoom:this.zoom,motionZoom:this.motionZoom.diagnostics(),tiltDegrees:this.tiltDegrees,projection:this.projection,perspective:this.camera.isPerspectiveCamera,focusDistance:this.camera.focusDistance,shadows:this.renderer.shadowMap.enabled,models:'concept-v5',playerModel:this.player.userData.modelVersion,grid:this.layout&&[this.layout.cols,this.layout.rows],cellSpacing:CELL_SIZE,beamLength:BEAM_LENGTH,beamWidth:BEAM_WIDTH,beamIntensityGain:BEAM_GAIN,flashlightShadows:this.flashlight.castShadow,overheadLamps:this.lighting.pools.length,crystalDust:this.dust.diagnostics()};}
}
