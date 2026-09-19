import * as THREE from './vendor/three.module.min.js';
import {rayBoxDistance} from './flashlight-mask.mjs';

// A fully feathered near field, tilted toward the ground just ahead of the
// muzzle. One maze cell is two world units. Keep Original's golden palette.
// The original near point light supplies the distinct wet-floor glint. Keep
// this broad fill gentle so its larger specular patch does not bury that glint.
export const ORIGINAL_GLOW={color:0xffd276,power:3,angle:1.12,penumbra:1,
  height:1.8,forward:.65,targetForward:1.65,targetHeight:.30,reach:3.9};

// Optional art study; all original values are captured once, never inferred
// from already-adjusted values. No new lights, shadow maps or geometry.
export const CHAMPAGNE={color:0xffc451,power:44,angle:1.12,penumbra:1,
  height:1.60,forward:.72,targetForward:1.95,targetHeight:.20,reach:4.8,fill:.90,decor:.77,
  bodyEnvironment:.86,bodyCore:.92};
export class Atmosphere {
  constructor(scene){
    this.scene=scene;this.mode='original';this.saved=new WeakMap();this.group=null;
    this.body=scene.player.getObjectByName('Dragon continuous faceted torso and tail');
    this.bodyCore=scene.player.getObjectByName('Dragon structured mint chest and belly core');
    this.originalBody=this.body?.material;
    if(this.body){
      this.softBody=this.originalBody.clone();
      this.softBody.onBeforeCompile=this.originalBody.onBeforeCompile;
      this.softBody.customProgramCacheKey=this.originalBody.customProgramCacheKey;
      this.softBody.roughness=.067;this.softBody.clearcoatRoughness=.08;
      this.softBody.envMapIntensity*=CHAMPAGNE.bodyEnvironment;this.softBody.clearcoat=.56;
    }
    this.originalCore=this.bodyCore?.material;
    if(this.bodyCore)this.quietCore=this.originalCore.clone();
    this.throats=['Dragon warm golden throat inside the mouth','Dragon warm golden green tongue and throat']
      .map(name=>scene.player.getObjectByName(name)).filter(Boolean).map(object=>({object,original:object.material}));
    if(this.throats.length){
      this.throat=this.throats[0].original.clone();
      this.throat.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float throatL=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.22,.82,.28)*throatL,.68)*1.12;`);
      };
      this.throat.customProgramCacheKey=()=> 'champagne-existing-throat-v1';
    }
  }
  value(object,key,scale){
    let saved=this.saved.get(object);if(!saved){saved={};this.saved.set(object,saved);}
    if(!(key in saved))saved[key]=object[key]?.clone?object[key].clone():object[key];
    if(object[key]?.isColor)object[key].copy(saved[key]).multiplyScalar(scale);
    else object[key]=saved[key]*scale;
  }
  set(value){
    this.mode=value==='champagne'?'champagne':'original';this.apply();
  }
  apply(){
    const s=this.scene,on=this.mode==='champagne',c=CHAMPAGNE;
    // Ruins/world changes install their exact base rig before reapplying this.
    s.lighting.fill.intensity=(s.worldStyle==='ruins'?1.15:.85)*(on?c.fill:1);
    s.lighting.ambient.intensity=(s.worldStyle==='ruins'?.25:.22)*(on?.96:1);
    const lamp=on?c:ORIGINAL_GLOW;
    s.flashlight.color.setHex(lamp.color);s.flashlight.angle=lamp.angle;
    s.flashlight.penumbra=lamp.penumbra;s.flashlight.decay=on?1.35:1.5;
    s.flashlight.distance=lamp.reach;
    s.flashlight.shadow.radius=2;
    s.glow.color.setHex(on?c.color:0xffc347);s.glow.distance=on?2.4:3.6;
    if(this.body)this.body.material=on?this.softBody:this.originalBody;
    if(this.bodyCore)this.bodyCore.material=on?this.quietCore:this.originalCore;
    for(const {object,original} of this.throats)object.material=on?this.throat:original;
    const group=s.staticGroup;
    if(group){
      for(const name of ['stone-wall-inlays','stone-wall-spill','Violet wall strips','Violet wall reflection ribbons','Recessed luminous sigils','Violet sigil reflection ribbons']){
        const material=group.getObjectByName(name)?.material;if(material)this.value(material,'color',on?c.decor:1);
      }
      for(const light of group.children.filter(o=>o.name==='Violet stone crown bounce'))this.value(light,'intensity',on?c.decor:1);
      const floor=group.getObjectByName('maze-paving')?.material;
      if(floor&&s.worldStyle==='ruins'){
        this.value(floor,'clearcoat',on?.67:1);this.value(floor,'clearcoatRoughness',on?1.65:1);
        this.value(floor,'roughness',on?1.06:1);
      }
    }
    s.wetFloor.uniforms.wetMystic.value=on?1:0;
    this.group=group;
  }
  update(player){
    if(this.group!==this.scene.staticGroup)this.apply();
    if(this.mode!=='champagne')return;
    const s=this.scene,c=CHAMPAGNE;
    // Light real stone and crystal surfaces. No painted floor cone or halo:
    // the broad, downward near field has a fully feathered angular falloff.
    s.beam.visible=s.halo.visible=false;
    if(this.body){this.softBody.emissiveIntensity=this.originalBody.emissiveIntensity;this.quietCore.color.copy(this.originalCore.color).multiplyScalar(c.bodyCore);}
    for(const lamp of s.staticGroup?.userData.ruinsCarvings?.lamps??[])lamp.light.intensity*=c.decor;
    if(!player||player.dead||player.hidden)return;
    const x=s.player.position.x,z=s.player.position.z,dx=Math.sin(s.playerYaw),dz=Math.cos(s.playerYaw);
    let clearance=c.reach;
    for(const box of s.staticGroup?.userData.wallBounds??[])clearance=Math.min(clearance,rayBoxDistance(x,z,dx,dz,box,c.reach));
    // The source stays on the dragon's side of nearby stone, above the
    // muzzle. Range and aim produce a soft pool about one–two cells ahead.
    const forward=Math.min(c.forward,Math.max(.12,clearance-.20));
    s.flashlight.position.set(x+dx*forward,c.height,z+dz*forward);
    s.flashlight.target.position.set(x+dx*c.targetForward,c.targetHeight,z+dz*c.targetForward);
    const near=THREE.MathUtils.smoothstep(clearance,.9,2.5);
    s.flashlight.intensity=c.power*(.78+.22*near);
    s.glow.position.set(x+dx*.52,1.02,z+dz*.52);s.glow.intensity=.65;
  }
  diagnostics(){return {mode:this.mode,settings:CHAMPAGNE};}
}
