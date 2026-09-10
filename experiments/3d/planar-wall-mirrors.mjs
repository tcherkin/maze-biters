import * as THREE from './vendor/three.module.min.js';
import {MirrorCaptureMaterials} from './mirror-capture.mjs';
import {ProjectionCamera} from './projection-camera.mjs';

// All visible exposed planes use the same current-frame reflection path.
// Coplanar stones share a strip; interior joints never compete for captures.
const COLUMNS=4,ROWS=6,SLOTS=COLUMNS*ROWS,TILE_WIDTH=512,TILE_HEIGHT=96;
export const planarDeclarations=`
uniform sampler2D wallPlanarColor;
uniform int wallPlanarCount;
uniform vec4 wallPlanarPlanes[${SLOTS}];
uniform mat4 wallPlanarMatrices[${SLOTS}];
uniform vec2 wallPlanarScales[${SLOTS}];
varying vec3 vMirrorWorld;
vec4 planarReflection(vec3 faceNormalWorld) {
  for(int i=0;i<${SLOTS};i++) {
    if(i>=wallPlanarCount) break;
    vec4 plane=wallPlanarPlanes[i];
    if(dot(faceNormalWorld,plane.xyz)<.99 || abs(dot(plane.xyz,vMirrorWorld)+plane.w)>.035) continue;
    vec4 p=wallPlanarMatrices[i]*vec4(vMirrorWorld,1.);
    vec2 uv=p.xy/p.w*.5+.5;
    float edge=smoothstep(.002,.025,min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y)));
    if(edge<=0.) continue;
    uv=(uv*wallPlanarScales[i]+vec2(mod(float(i),${COLUMNS}.),floor(float(i)/${COLUMNS}.)))/vec2(${COLUMNS}.,${ROWS}.);
    vec4 sampleColor=texture2D(wallPlanarColor,uv);
    // Empty space beyond the finite paving is not a blue reflected surface.
    // Remove transparent-clear filtering from RGB before the wall blend.
    return vec4(sampleColor.rgb/max(sampleColor.a,.0001),sampleColor.a*edge);
  }
  return vec4(0.);
}
`;

export class PlanarWallMirrors {
  constructor(renderer){
    this.renderer=renderer;this.planes=[];this.selected=[];this.target=null;
    this.cameras=Array.from({length:SLOTS},()=>new ProjectionCamera());
    this.direction=new THREE.Vector3();this.targetPoint=new THREE.Vector3();this.view=new THREE.Vector3();
    this.crop=new THREE.Matrix4();
    this.rotateCrop=new THREE.Matrix4().makeRotationZ(Math.PI/2);
    this.drawSize=new THREE.Vector2();this.clearColor=new THREE.Color();
    this.materials=new MirrorCaptureMaterials({unlit:true});
    this.uniforms={wallPlanarColor:{value:null},wallPlanarCount:{value:0},
      wallPlanarPlanes:{value:Array.from({length:SLOTS},()=>new THREE.Vector4())},
      wallPlanarScales:{value:Array.from({length:SLOTS},()=>new THREE.Vector2(1,1))},
      wallPlanarMatrices:{value:Array.from({length:SLOTS},()=>new THREE.Matrix4())}};
    this.calls=0;this.triangles=0;
    this.tileWidth=TILE_WIDTH;this.tileHeight=TILE_HEIGHT;
  }
  sizeTarget(){
    const renderer=this.renderer;
    renderer.getDrawingBufferSize(this.drawSize);
    const desired=this.drawSize.x>3000?4:this.drawSize.x>1600?2:1;
    const maximum=renderer.capabilities.maxTextureSize;
    const scale=Math.max(1,Math.min(desired,Math.floor(maximum/(COLUMNS*TILE_WIDTH)),Math.floor(maximum/(ROWS*TILE_HEIGHT))));
    const width=TILE_WIDTH*scale,height=TILE_HEIGHT*scale;
    // A size tier changes only when the display size changes, never as the
    // perspective slider moves or actors enter a different mirror.
    if(this.target&&(this.tileWidth!==width||this.tileHeight!==height))this.release();
    this.tileWidth=width;this.tileHeight=height;
    if(!this.target){
      this.target=new THREE.WebGLRenderTarget(width*COLUMNS,height*ROWS,{type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType});
      this.target.texture.colorSpace=THREE.LinearSRGBColorSpace;this.target.texture.generateMipmaps=false;
    }
  }
  attach(group){
    const geometry=group.getObjectByName('stone-wall-blocks')?.geometry;
    this.planes=[];this.selected=[];if(!geometry)return;
    const {position:p,normal:n,mirrorSide:side}=geometry.attributes,groups=new Map(),bounds=group.userData.wallBounds||[];
    for(let i=0;i<p.count;i+=3){
      if(side.getX(i)<.5||Math.max(Math.abs(n.getX(i)),Math.abs(n.getZ(i)))<.999)continue;
      const normal=new THREE.Vector3(n.getX(i),0,n.getZ(i)).normalize();
      // Probe beyond the carved inset into the structural footprint. Ends
      // between neighboring stones are recessed joints, not open mirrors.
      const cx=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3+normal.x*.04;
      const cz=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3+normal.z*.04;
      if(bounds.some(b=>cx>b.minX&&cx<b.maxX&&cz>b.minZ&&cz<b.maxZ))continue;
      const constant=-(normal.x*p.getX(i)+normal.z*p.getZ(i));
      const key=[Math.round(normal.x),Math.round(normal.z),Math.round(constant*40)].join(':');
      let entry=groups.get(key);
      if(!entry){entry={key,plane:new THREE.Plane(normal,constant),segments:[]};groups.set(key,entry);}
      entry.segments.push({minX:Math.min(p.getX(i),p.getX(i+1),p.getX(i+2)),maxX:Math.max(p.getX(i),p.getX(i+1),p.getX(i+2)),
        minZ:Math.min(p.getZ(i),p.getZ(i+1),p.getZ(i+2)),maxZ:Math.max(p.getZ(i),p.getZ(i+1),p.getZ(i+2))});
    }
    this.planes=[...groups.values()];
  }
  choose(camera){
    camera.getWorldDirection(this.view);
    this.selected=this.planes.filter(entry=>{
      if(camera.isOrthographicCamera?entry.plane.normal.dot(this.view)>-.001:entry.plane.distanceToPoint(camera.position)<=.001)return false;
      return entry.segments.some(b=>{
        let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
        for(const x of [b.minX,b.maxX])for(const z of [b.minZ,b.maxZ])for(const y of [.09,1.03]){
          this.targetPoint.set(x,y,z).project(camera);
          left=Math.min(left,this.targetPoint.x);right=Math.max(right,this.targetPoint.x);
          bottom=Math.min(bottom,this.targetPoint.y);top=Math.max(top,this.targetPoint.y);
        }
        return right>=-1.04&&left<=1.04&&top>=-1.04&&bottom<=1.04;
      });
    });
    // Unsupported future layouts must not silently swap visible wall methods.
    if(this.selected.length>SLOTS)throw new Error('Visible mirror planes exceed the atlas capacity');
  }
  render(scene,camera){
    this.calls=this.triangles=0;this.uniforms.wallPlanarCount.value=0;
    this.choose(camera);if(!this.selected.length)return;
    // Only the narrow physical wall band needs pixels. A full-screen mirror
    // camera would shade the whole maze again, most of it never sampled.
    this.sizeTarget();
    const renderer=this.renderer,width=this.tileWidth,height=this.tileHeight,atlasWidth=width*COLUMNS,atlasHeight=height*ROWS;
    const clipping=renderer.clippingPlanes,auto=renderer.autoClear;
    renderer.getClearColor(this.clearColor);const clearAlpha=renderer.getClearAlpha();
    const shadows=renderer.shadowMap,shadowAuto=shadows?.autoUpdate,shadowNeeds=shadows?.needsUpdate;
    const previousTarget=renderer.getRenderTarget(),cubeFace=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    try{
      this.materials.begin(scene);
      this.target.viewport.set(0,0,atlasWidth,atlasHeight);
      this.target.scissor.copy(this.target.viewport);this.target.scissorTest=false;
      renderer.setClearColor(0,0);renderer.setRenderTarget(this.target);renderer.clear();renderer.autoClear=false;
      for(let i=0;i<this.selected.length;i++){
        const entry=this.selected[i],plane=entry.plane,reflection=this.cameras[i];
        reflection.copy(camera,false);
        reflection.position.copy(camera.position).addScaledVector(plane.normal,-2*plane.distanceToPoint(camera.position));
        camera.getWorldDirection(this.direction);this.direction.reflect(plane.normal);
        reflection.up.copy(camera.up).reflect(plane.normal);
        reflection.lookAt(this.targetPoint.copy(reflection.position).add(this.direction));reflection.updateMatrixWorld();
        let minX=1,minY=1,maxX=-1,maxY=-1;
        for(const b of entry.segments)for(const x of [b.minX,b.maxX])for(const z of [b.minZ,b.maxZ])for(const y of [.09,1.03]){
          this.targetPoint.set(x,y,z).project(reflection);
          minX=Math.min(minX,this.targetPoint.x);maxX=Math.max(maxX,this.targetPoint.x);
          minY=Math.min(minY,this.targetPoint.y);maxY=Math.max(maxY,this.targetPoint.y);
        }
        minX=Math.max(-1.02,minX-.015);maxX=Math.min(1.02,maxX+.015);
        minY=Math.max(-1.02,minY-.015);maxY=Math.min(1.02,maxY+.015);
        const sx=2/Math.max(.01,maxX-minX),sy=2/Math.max(.01,maxY-minY);
        this.crop.set(sx,0,0,-(maxX+minX)*sx*.5,0,sy,0,-(maxY+minY)*sy*.5,0,0,1,0,0,0,0,1);
        // Perspective exposes tall X-facing sides. Rotate their crop so the
        // long side uses the tile's 512 samples instead of only its 96 rows.
        const rotated=(maxY-minY)*(camera.top-camera.bottom)>(maxX-minX)*(camera.right-camera.left);
        if(rotated)this.crop.premultiply(this.rotateCrop);
        // Give diagonal grout enough real samples on large displays. Short
        // mirrors shade only their needed rectangle inside the reserved slot.
        const pixelsX=(maxX-minX)*this.drawSize.x*.5,pixelsY=(maxY-minY)*this.drawSize.y*.5;
        const captureWidth=Math.min(width,Math.max(8,Math.ceil((rotated?pixelsY:pixelsX)*1.25/8)*8));
        const captureHeight=Math.min(height,Math.max(8,Math.ceil((rotated?pixelsX:pixelsY)*1.25/8)*8));
        this.uniforms.wallPlanarScales.value[i].set(captureWidth/width,captureHeight/height);
        reflection.projectionMatrix.premultiply(this.crop);reflection.projectionMatrixInverse.copy(reflection.projectionMatrix).invert();
        this.uniforms.wallPlanarPlanes.value[i].set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
        this.uniforms.wallPlanarMatrices.value[i].multiplyMatrices(reflection.projectionMatrix,reflection.matrixWorldInverse);
        // Remove everything behind the physical mirror, including its own
        // wall thickness. Foreground walls still occlude the reflected actor.
        renderer.clippingPlanes=[new THREE.Plane(plane.normal,plane.constant-.025)];
        // Render-target rectangles are physical texels. The public renderer
        // viewport/scissor setters multiply by devicePixelRatio, which would
        // enlarge and overlap these atlas tiles on scaled/Retina displays.
        this.target.viewport.set((i%COLUMNS)*width,Math.floor(i/COLUMNS)*height,captureWidth,captureHeight);
        this.target.scissor.copy(this.target.viewport);this.target.scissorTest=true;
        renderer.setRenderTarget(this.target);
        renderer.render(scene,reflection);this.calls+=renderer.info.render.calls;this.triangles+=renderer.info.render.triangles;
        // First strip updates full-scene shadows. Three disables global mirror
        // clipping in shadow passes; every other strip reuses those same maps.
        if(shadows){shadows.autoUpdate=false;shadows.needsUpdate=false;}
      }
    }finally{
      this.materials.end();renderer.clippingPlanes=clipping;renderer.autoClear=auto;renderer.setClearColor(this.clearColor,clearAlpha);
      if(shadows){shadows.autoUpdate=shadowAuto;shadows.needsUpdate=shadowNeeds;}
      this.target.viewport.set(0,0,atlasWidth,atlasHeight);this.target.scissor.copy(this.target.viewport);this.target.scissorTest=false;
      renderer.setRenderTarget(previousTarget,cubeFace,mip);
    }
    this.uniforms.wallPlanarColor.value=this.target.texture;this.uniforms.wallPlanarCount.value=this.selected.length;
  }
  release(){this.uniforms.wallPlanarCount.value=0;this.uniforms.wallPlanarColor.value=null;this.target?.dispose();this.target=null;}
  dispose(){this.release();this.materials.dispose();}
}
