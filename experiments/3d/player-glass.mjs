import * as THREE from './vendor/three.module.min.js';
import {createSnakeFinish} from './snake-light.mjs';

function filament(points,radius=.007){
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),32,radius,8,false);
}

// The face/chin are open surfaces with a real mouth opening. An inset copy
// or a glowing sphere would fill that opening, so the light is authored as
// narrow strands inside the forehead, cheeks and front of the hinged chin.
const faceStrand=filament([[0,.413,.311],[0,.448,.304],[0,.485,.287],[0,.521,.264]],.008);
faceStrand.translate(0,0,-.012);
const cheekStrands=[-1,1].map(side=>filament([
  [side*.285,.382,.182],[side*.313,.427,.151],[side*.285,.485,.152]
],.005));
const chinStrand=filament([[-.23,.22,.215],[-.13,.227,.295],[0,.226,.322],[.13,.227,.295],[.23,.22,.215]],.006);
// Match the existing jaw hinge; all animation is inherited, including bites.
chinStrand.translate(0,-.259,.035);
// This red light sits between the green skull cap and the helmet dome. It
// stops well above the helmet skirt, avoiding a red ring through the face.
const helmetStrand=filament([[0,.708,-.20],[0,.743,-.10],[0,.756,0],[0,.754,.10],[0,.725,.21]],.009);

export class PlayerGlass{
  constructor(){
    // Its face already reads well in this study. Keep the selected player
    // finish identical while comparing the snake material refinements.
    this.face=createSnakeFinish(0x80ce0b,{role:'player'});
    this.helmet=createSnakeFinish(0xea0923,{role:'player'});
    this.material=this.face.material;
    this.cores=[];
  }
  attach(player){
    this.player=player;
    const group=player.getObjectByName('Uplifted face and fitted helmet');
    for(const name of ['Pressed red metal helmet','Rolled metal helmet edge','Thin swept front visor']){
      const mesh=player.getObjectByName(name);mesh.material=this.helmet.material;
    }
    const add=(parent,geometry,material,name)=>{
      const mesh=new THREE.Mesh(geometry,material);mesh.name=name;
      parent.add(mesh);this.cores.push(mesh);return mesh;
    };
    add(group,faceStrand,this.face.coreMaterial,'Green forehead neon core');
    for(const [i,geometry] of cheekStrands.entries())add(group,geometry,this.face.coreMaterial,'Green cheek neon core '+i);
    add(player.userData.jaw,chinStrand,this.face.coreMaterial,'Hinged chin neon core');
    add(group,helmetStrand,this.helmet.coreMaterial,'Ruby helmet neon core');
    player.userData.finishVersion='dark-neon-glass-v1';
    this.update(null);
  }
  update(state){
    // Shield feedback adds to the normal glass finish; ending a shield must
    // restore its green emission, not turn it off as the old skin shader did.
    this.face.material.emissive.copy(this.face.tint);
    this.face.material.emissiveIntensity=state?.shield ? .30 : .12;
    this.face.coreMaterial.color.copy(this.face.tint).multiplyScalar(state?.shield?3.2:2.4).addScalar(.012);
  }
  dispose(){this.face.dispose();this.helmet.dispose();}
}
