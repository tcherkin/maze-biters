import * as THREE from './vendor/three.module.min.js';

// A dolly/FOV family converges to the exact orthographic view while keeping
// scale at the focus plane fixed. The real eye moves too, so glass lighting,
// reflections and raycasts agree with the image at intermediate strengths.
const DISTANCE=50,MIN_PERSPECTIVE=.002;
export class ProjectionCamera extends THREE.OrthographicCamera {
  constructor(){
    super(-20,20,14,-14,.1,150);
    this.projectionAmount=0;this.focusDistance=DISTANCE;
    this.isPerspectiveCamera=false;this.up.set(0,0,-1);
  }
  setProjection(amount){
    this.projectionAmount=THREE.MathUtils.clamp(amount,0,1);
    // Subpixel differences near zero do not justify an infinitely distant
    // eye and the loss of depth/light precision that would entail.
    const strength=this.projectionAmount<MIN_PERSPECTIVE?0:this.projectionAmount;
    this.isPerspectiveCamera=strength>0;this.isOrthographicCamera=!this.isPerspectiveCamera;
    this.focusDistance=strength?DISTANCE/strength:DISTANCE;
    this.near=Math.max(.1,this.focusDistance-80);this.far=this.focusDistance+100;
    this.updateProjectionMatrix();
  }
  updateProjectionMatrix(){
    if(!this.isPerspectiveCamera){super.updateProjectionMatrix();return;}
    const scale=this.near/(this.focusDistance*this.zoom);
    this.projectionMatrix.makePerspective(this.left*scale,this.right*scale,this.top*scale,this.bottom*scale,
      this.near,this.far,this.coordinateSystem);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
  copy(source,recursive){
    super.copy(source,recursive);
    this.isPerspectiveCamera=Boolean(source.isPerspectiveCamera);
    this.isOrthographicCamera=!this.isPerspectiveCamera;
    this.projectionAmount=source.projectionAmount??0;this.focusDistance=source.focusDistance??DISTANCE;
    return this;
  }
}

// Translate the camera's ground focus so a raised northern edge lands at a
// given screen Y. Account for perspective depth, not just the ground footprint.
// Infinity means the requested edge is above the horizon and needs no limit.
export function cameraNorthLimit(camera,tilt,northZ,northHeight,topPixels,screenHeight){
  const q=(camera.top-(camera.top-camera.bottom)*topPixels/Math.max(1,screenHeight))/camera.zoom;
  const c=Math.cos(tilt),s=Math.sin(tilt),inverseDistance=camera.isPerspectiveCamera?1/camera.focusDistance:0;
  const denominator=c-q*s*inverseDistance;
  if(denominator<=1e-6)return Infinity;
  return northZ+(q-northHeight*(s+q*c*inverseDistance))/denominator;
}

// Use the same body-height anchor as the visible tap guide. A ground-plane
// ray alone would bias a tap right beside the face toward the far corridor.
export function pointerDirection(camera,rect,clientX,clientY,anchor){
  if(rect.width<=0||rect.height<=0)return null;
  camera.updateMatrixWorld();
  const center=anchor.clone().project(camera);
  const dx=clientX-(rect.left+(center.x+1)*rect.width/2),dy=clientY-(rect.top+(1-center.y)*rect.height/2);
  if(Math.hypot(dx,dy)<12)return null;
  const ndc=new THREE.Vector2((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2);
  const raycaster=new THREE.Raycaster();raycaster.setFromCamera(ndc,camera);
  if(raycaster.ray.direction.y>=-1e-6)return null;
  const point=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-anchor.y),new THREE.Vector3());
  if(!point)return null;
  const angle=Math.round(Math.atan2(point.z-anchor.z,point.x-anchor.x)/(Math.PI/4))*(Math.PI/4);
  return {x:Math.round(Math.cos(angle)),y:Math.round(Math.sin(angle))};
}
