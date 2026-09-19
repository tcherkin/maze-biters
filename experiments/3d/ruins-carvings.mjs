import * as THREE from './vendor/three.module.min.js';

const V=(x,y)=>new THREE.Vector2(x,y);
const up=new THREE.Vector3(0,1,0);
const violet=new THREE.Color(.40,.065,1.35),cold=new THREE.Color(.14,.38,1.3);
const chamfer=(w,h,c)=>[V(-w/2+c,-h/2),V(w/2-c,-h/2),V(w/2,-h/2+c),V(w/2,h/2-c),V(w/2-c,h/2),V(-w/2+c,h/2),V(-w/2,h/2-c),V(-w/2,-h/2+c)];
const shifted=(path,x,y)=>path.map(p=>V(p.x+x,p.y+y));
const glyphs={
  crystal:[[-.12,0,0,.18],[0,.18,.12,0],[.12,0,0,-.18],[0,-.18,-.12,0]]
};

// Replace an exposed wall face with a tessellated face containing real holes,
// sloping reveals and recessed floors. No plane sits behind a "painted" hole.
export class RuinsCarvings {
  constructor(){this.lines=[];this.strokes=[];this.features=[];this.faces=0;}
  face(vertices,block,faceIndex,shade,emit){
    const p=vertices.map(v=>new THREE.Vector3(v.x,v.y,v.z)),origin=p[0].clone().add(p[3]).multiplyScalar(.5);origin.y=0;
    const tangent=p[0].clone().sub(p[3]).setY(0).normalize(),normal=new THREE.Vector3().crossVectors(tangent,up),length=p[0].distanceTo(p[3]);
    const at=(a,depth=0)=>origin.clone().addScaledVector(tangent,a.x).addScaledVector(normal,depth).addScaledVector(up,a.y);
    const outline=[V(-length/2,p[3].y),V(length/2,p[0].y),V(length/2,p[1].y),V(-length/2,p[2].y)],holes=[],pockets=[];
    const seed=block.seed>>>0,sector=(Math.floor(block.x/6)+Math.floor(block.z/6)+12)%4;
    const double=sector===0||sector===3,levels=double?[.225,.86]:[.86];
    const ink=seed%7===0?cold:violet;
    const addPocket=(path,depth,inset,kind)=>{holes.push(path);pockets.push({path,depth,inset,kind});};
    const bandLength=Math.max(.12,length-.13),bandWidth=.067;
    const bandOn=(seed+faceIndex)%7!==0;
    for(const y of levels){
      addPocket(shifted(chamfer(bandLength,bandWidth,.015),0,y),.052,.014,'channel');
      if(bandOn)this.lines.push({center:at(V(0,y),-.042),capture:at(V(0,y),.009),tangent,normal,length:Math.max(.08,bandLength-.05),color:ink.clone().multiplyScalar(y<.4?.72:1)});
    }
    // Only the south-facing cap of a vertical dead end carries a diamond.
    // Corners, junctions, long faces and north/east/west ends stay unmarked.
    const marked=block.southEnd&&normal.z>.99;
    let symbol=null,lit=false;
    if(marked){
      symbol='crystal';lit=(Math.floor(seed/11)+faceIndex)%4!==0;
      const shape=[V(0,-.255),V(.23,0),V(0,.255),V(-.23,0)];
      addPocket(shifted(shape,0,.535),.073,.039,'glyph');
      for(const [ax,ay,bx,by] of glyphs[symbol])this.strokes.push({a:at(V(ax,ay+.535),-.061),b:at(V(bx,by+.535),-.061),normal,lit,seed,color:ink.clone().multiplyScalar(1.05)});
    }
    // Short weathered incisions occupy the quieter flanks of broad blocks.
    // Their locations are fixed in stone; no random or animated texture noise.
    if(length>1.4&&seed%3===0){
      const x=(seed%2?1:-1)*length*.35;
      addPocket(shifted([V(-.013,-.16),V(.012,-.03),V(-.009,.045),V(.015,.17),V(.043,.16),V(.021,.04),V(.04,-.035),V(.012,-.17)],x,.535),.026,.004,'scar');
    }
    const surface=[...outline,...holes.flat()];
    const tri=(a,b,c,tone=1)=>{
      // ShapeUtils may return either winding, while visible stone is one-sided.
      const ab=b.clone().sub(a),ac=c.clone().sub(a);
      if(ab.cross(ac).dot(normal)<0)[b,c]=[c,b];
      emit(a,b,c,shade.clone().multiplyScalar(tone));
    };
    for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(outline,holes))tri(at(surface[a]),at(surface[b]),at(surface[c]));
    for(const pocket of pockets){
      const center=pocket.path.reduce((a,b)=>a.add(b),V(0,0)).multiplyScalar(1/pocket.path.length);
      const bounds=new THREE.Box2().setFromPoints(pocket.path),size=bounds.getSize(V(0,0));
      const sx=Math.max(.3,1-2*pocket.inset/size.x),sy=Math.max(.3,1-2*pocket.inset/size.y);
      const inner=pocket.path.map(p=>V(center.x+(p.x-center.x)*sx,center.y+(p.y-center.y)*sy));
      for(let i=0;i<inner.length;i++){
        const j=(i+1)%inner.length,a=at(pocket.path[i]),b=at(pocket.path[j]),c=at(inner[j],-pocket.depth),d=at(inner[i],-pocket.depth);
        const tone=pocket.kind==='scar'?.38:.63+((i+seed)%3)*.17;
        tri(a,b,c,tone);tri(a,c,d,tone);
      }
      for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(inner,[]))tri(at(inner[a],-pocket.depth),at(inner[b],-pocket.depth),at(inner[c],-pocket.depth),pocket.kind==='glyph'?.23:.32);
      this.features.push({kind:pocket.kind,depth:pocket.depth,center:at(center),normal:normal.clone(),seed,symbol:pocket.kind==='glyph'?symbol:null,lit:pocket.kind==='glyph'?lit:bandOn});
    }
    this.faces++;return true;
  }
  finish(group,glowTexture,owned){
    const bar=new THREE.BoxGeometry(1,.018,.014),ribbon=new THREE.PlaneGeometry(1,.16);
    const bright=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),dim=new THREE.MeshStandardMaterial({color:0x211a36,roughness:.62,metalness:.12});
    const soft=new THREE.MeshBasicMaterial({color:0xffffff,map:glowTexture,transparent:true,opacity:1.70,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    owned.push(bar,ribbon);
    const transform=new THREE.Matrix4(),axis=new THREE.Vector3(),vertical=new THREE.Vector3();
    const instanced=(name,geometry,material,entries,pose,flags={})=>{
      if(!entries.length){material.dispose();return;}
      const mesh=new THREE.InstancedMesh(geometry,material,entries.length);mesh.name=name;Object.assign(mesh.userData,flags);
      if(flags.wetReflectionOnly)mesh.visible=false;
      entries.forEach((e,i)=>{pose(e);mesh.setMatrixAt(i,transform);if(e.color)mesh.setColorAt(i,e.color);});
      mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);return mesh;
    };
    const linePose=(e,capture)=>{transform.makeBasis(e.tangent,up,e.normal);transform.scale(new THREE.Vector3(e.length,1,1));transform.setPosition(capture?e.capture:e.center);};
    instanced('Violet wall strips',bar,bright,this.lines,e=>linePose(e,false),{wetReflectionHide:true});
    instanced('Violet wall reflection ribbons',ribbon,soft,this.lines,e=>linePose(e,true),{wetReflectionOnly:true});
    const strokePose=(e,capture=false)=>{axis.copy(e.b).sub(e.a);const length=axis.length();axis.divideScalar(length);vertical.crossVectors(e.normal,axis);transform.makeBasis(axis,vertical,e.normal);transform.scale(new THREE.Vector3(length,1,1));transform.setPosition(e.a.clone().add(e.b).multiplyScalar(.5).addScaledVector(e.normal,capture?.070:0));};
    // Treat the narrow glyph strokes like the channels in the wet capture:
    // integrate their light across a soft footprint, without frame history.
    const litStrokes=this.strokes.filter(s=>s.lit);
    const luminous=instanced('Recessed luminous sigils',bar,bright.clone(),litStrokes,e=>strokePose(e),{wetReflectionHide:true});
    const reflected=instanced('Violet sigil reflection ribbons',ribbon,soft.clone(),litStrokes,e=>strokePose(e,true),{wetReflectionOnly:true});
    instanced('Dormant carved sigils',bar,dim,this.strokes.filter(s=>!s.lit).map(s=>({...s,color:null})),strokePose);
    group.userData.ruinsCarvings={faces:this.faces,features:this.features,bands:this.lines.length,symbols:Object.keys(glyphs),litStrokes,luminous,reflected,lamps:[]};
  }
}

const pulseColor=new THREE.Color();
export function updateRuinsCarvings(group,time){
  const state=group?.userData.ruinsCarvings;if(!state)return;
  const t=time/1000;
  // Smooth, shallow, independent fluctuations. No random per-frame jumps;
  // a paused game and both reflection passes see exactly the same brightness.
  const intensity=seed=>{const phase=(seed%1009)*.017;return 1+.045*Math.sin(t*2.1+phase)+.025*Math.sin(t*5.3+phase*1.7)-.16*Math.pow(.5+.5*Math.sin(t*1.17+phase*2.3),16);};
  state.litStrokes.forEach((stroke,i)=>{
    pulseColor.copy(stroke.color).multiplyScalar(intensity(stroke.seed));
    state.luminous.setColorAt(i,pulseColor);state.reflected.setColorAt(i,pulseColor);
  });
  if(state.luminous){state.luminous.instanceColor.needsUpdate=true;state.reflected.instanceColor.needsUpdate=true;}
  for(const {light,seed,base} of state.lamps)light.intensity=base*intensity(seed);
}
