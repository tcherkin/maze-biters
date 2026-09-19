import {CELL_SIZE,WALL_WIDTH} from './world.mjs';
import {dragonLengthZ} from './dragon-form.mjs';
import {ensureDragonDetail,resetDragonDetail} from './dragon-detail.mjs';

// Presentation only. The contact/root and the engine's speed are never changed.
// A distance-addressed trail survives reversals (including ricochet). At a 180°
// retrace it deliberately folds over itself, as requested, instead of shrinking
// or relocating its tail. A finite skinned mesh approximates this centerline;
// diagnostics expose its chord error and any unsatisfied clearance constraint.
const EPS=1e-8,FILLET_RADIUS=.45,HISTORY_MARGIN=2.5;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const point=(x,z)=>({x,z});
const length=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

export function dragonWallBounds(maze,layout){
  const xs=[],zs=[],bounds=[],wall=(x,z)=>maze[z]?.[x]==='#';
  for(let x=0;x<layout.cols;x++)xs.push(layout.x(x)-WALL_WIDTH/2,layout.x(x)+WALL_WIDTH/2);
  for(let z=0;z<layout.rows;z++)zs.push(layout.z(z)-WALL_WIDTH/2,layout.z(z)+WALL_WIDTH/2);
  for(let j=0;j<zs.length-1;j++)for(let i=0;i<xs.length-1;i++){
    const x=i>>1,z=j>>1,filled=!(i%2)&&!(j%2)?wall(x,z):
      i%2&&!(j%2)?wall(x,z)&&wall(x+1,z):!(i%2)?wall(x,z)&&wall(x,z+1):
      wall(x,z)&&wall(x+1,z)&&wall(x,z+1)&&wall(x+1,z+1);
    if(filled)bounds.push({minX:xs[i],maxX:xs[i+1],minZ:zs[j],maxZ:zs[j+1]});
  }
  return bounds;
}
function distancePointBox(p,b){return Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),Math.max(b.minZ-p.z,0,p.z-b.maxZ));}
function distancePointSegment(x,z,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,d=dx*dx+dz*dz,t=d?clamp(((x-a.x)*dx+(z-a.z)*dz)/d,0,1):0;
  return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
}
function segmentHitsBox(a,b,box){
  let lo=0,hi=1;const dx=b.x-a.x,dz=b.z-a.z;
  if(Math.abs(dx)<EPS){if(a.x<box.minX||a.x>box.maxX)return false;}
  else{const s=(box.minX-a.x)/dx,t=(box.maxX-a.x)/dx;lo=Math.max(lo,Math.min(s,t));hi=Math.min(hi,Math.max(s,t));if(lo>hi)return false;}
  if(Math.abs(dz)<EPS){if(a.z<box.minZ||a.z>box.maxZ)return false;}
  else{const s=(box.minZ-a.z)/dz,t=(box.maxZ-a.z)/dz;lo=Math.max(lo,Math.min(s,t));hi=Math.min(hi,Math.max(s,t));if(lo>hi)return false;}
  return true;
}
export function dragonSegmentClear(a,b,radius,walls){
  for(const wall of walls){
    if(Math.max(a.x,b.x)+radius<wall.minX||Math.min(a.x,b.x)-radius>wall.maxX||
      Math.max(a.z,b.z)+radius<wall.minZ||Math.min(a.z,b.z)-radius>wall.maxZ)continue;
    if(segmentHitsBox(a,b,wall))return false;
    let d=Math.min(distancePointBox(a,wall),distancePointBox(b,wall));
    d=Math.min(d,distancePointSegment(wall.minX,wall.minZ,a,b),distancePointSegment(wall.minX,wall.maxZ,a,b),
      distancePointSegment(wall.maxX,wall.minZ,a,b),distancePointSegment(wall.maxX,wall.maxZ,a,b));
    if(d<radius-1e-7)return false;
  }
  return true;
}
function takePiece(pool){
  const i=pool.index++;return pool.objects[i]??(pool.objects[i]={a:point(0,0),b:point(0,0)});
}
function addLine(pool,a,b){
  const d=length(a,b);if(d<=EPS)return;
  const piece=takePiece(pool);piece.kind='line';piece.a.x=a.x;piece.a.z=a.z;piece.b.x=b.x;piece.b.z=b.z;piece.length=d;
  pool.route.push(piece);
}
function samplePiece(piece,d,out){
  if(piece.kind==='line'){
    const t=clamp(d/piece.length,0,1);out.x=piece.a.x+(piece.b.x-piece.a.x)*t;out.z=piece.a.z+(piece.b.z-piece.a.z)*t;
    out.tx=(piece.b.x-piece.a.x)/piece.length;out.tz=(piece.b.z-piece.a.z)/piece.length;
  }else{
    const a=piece.start+piece.turn*clamp(d/piece.length,0,1),sign=Math.sign(piece.turn);
    out.x=piece.cx+Math.cos(a)*piece.radius;out.z=piece.cz+Math.sin(a)*piece.radius;
    out.tx=-Math.sin(a)*sign;out.tz=Math.cos(a)*sign;
  }
  return out;
}
function sampleRoute(pieces,d,out){
  for(const piece of pieces){if(d<=piece.length+EPS)return samplePiece(piece,d,out);d-=piece.length;}
  const last=pieces.at(-1);return last?samplePiece(last,last.length,out):Object.assign(out,{x:0,z:0,tx:0,tz:-1});
}
function routeYaw(pieces,d,sample){
  sampleRoute(pieces,d,sample);let yaw=Math.atan2(-sample.tx,-sample.tz),distance=0;
  // Linear skinning must never interpolate two opposing 180° frames. Rotate
  // their cross sections through a short distance window around the fold; the
  // centerline itself still retraces the exact path and may overlap itself.
  for(let i=0;i<pieces.length-1;i++){
    const before=pieces[i],after=pieces[i+1];distance+=before.length;
    const reach=.28;if(Math.abs(d-distance)>reach)continue;
    samplePiece(before,before.length,sample);const a=Math.atan2(-sample.tx,-sample.tz);
    samplePiece(after,0,sample);const b=Math.atan2(-sample.tx,-sample.tz),delta=angleDelta(b,a);
    if(Math.abs(delta)<.25)continue;
    const t=clamp((d-distance+reach)/(reach*2),0,1);yaw=a+(Math.abs(delta)>Math.PI-.025?Math.PI:delta)*(t*t*(3-2*t));
    break;
  }
  return yaw;
}
function arcClear(arc,radius,walls,a,b){
  const steps=Math.max(2,Math.ceil(arc.length/.045));samplePiece(arc,0,a);
  // The extra sagitta covers every point between these exact arc samples.
  const margin=arc.radius*(1-Math.cos(Math.abs(arc.turn)/steps/2));
  for(let i=1;i<=steps;i++){
    samplePiece(arc,arc.length*i/steps,b);if(!dragonSegmentClear(a,b,radius+margin,walls))return false;
    a.x=b.x;a.z=b.z;
  }
  return true;
}
function curveRoute(points,radius,walls,issues,pool){
  pool.index=0;pool.route.length=0;const previous=pool.previous;previous.x=points[0].x;previous.z=points[0].z;
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],ab=length(a,b),bc=length(b,c);
    if(ab<EPS||bc<EPS)continue;
    const ux=(b.x-a.x)/ab,uz=(b.z-a.z)/ab,vx=(c.x-b.x)/bc,vz=(c.z-b.z)/bc;
    const turn=Math.atan2(ux*vz-uz*vx,ux*vx+uz*vz),theta=Math.abs(turn);
    if(theta>Math.PI-.025){issues.add('self-overlap');addLine(pool,previous,b);previous.x=b.x;previous.z=b.z;continue;}
    if(theta<.025){addLine(pool,previous,b);previous.x=b.x;previous.z=b.z;continue;}
    const trim=Math.min(FILLET_RADIUS*Math.tan(theta/2),ab*.45,bc*.45),r=trim/Math.tan(theta/2);
    const start=pool.start,end=pool.end,sign=Math.sign(turn);start.x=b.x-ux*trim;start.z=b.z-uz*trim;end.x=b.x+vx*trim;end.z=b.z+vz*trim;
    const arc=pool.arc;arc.kind='arc';arc.cx=start.x-uz*sign*r;arc.cz=start.z+ux*sign*r;arc.radius=r;arc.turn=turn;arc.length=r*theta;
    arc.start=Math.atan2(start.z-arc.cz,start.x-arc.cx);
    if(r>.025&&arcClear(arc,radius,walls,pool.arcA,pool.arcB)){
      addLine(pool,previous,start);const piece=takePiece(pool);piece.kind='arc';piece.cx=arc.cx;piece.cz=arc.cz;
      piece.radius=r;piece.turn=turn;piece.length=arc.length;piece.start=arc.start;pool.route.push(piece);previous.x=end.x;previous.z=end.z;
    }else{addLine(pool,previous,b);previous.x=b.x;previous.z=b.z;if(theta>.15)issues.add('tight-bend');}
  }
  addLine(pool,previous,points.at(-1));return pool.route;
}
function polylineLength(points){let d=0;for(let i=1;i<points.length;i++)d+=length(points[i-1],points[i]);return d;}

export class DragonMotion{
  constructor({rig,scale=2.1}){
    if(!rig?.bones?.length||rig.bones.length!==rig.restZ?.length)throw new Error('Dragon motion needs matching independent bones and restZ');
    this.rig=rig;this.scale=scale;this.baseBodyLength=-Math.min(...rig.restZ)*scale;this.bodyLength=this.baseBodyLength;
    this.radius=Math.max(.36,...(rig.stationRadii??[]))*scale;
    this.samples=rig.restZ.map(()=>({x:0,z:0,tx:0,tz:-1}));this.scratchA={};this.scratchB={};
    this.curvePool={objects:[],route:[],index:0,previous:point(0,0),start:point(0,0),end:point(0,0),arc:{},arcA:{},arcB:{}};
    this.reset();
  }
  reset(){
    resetDragonDetail(this.rig);
    if(this.samples.length!==this.rig.restZ.length)this.samples=this.rig.restZ.map(()=>({x:0,z:0,tx:0,tz:-1}));
    this.history=[];this.pieces=[];this.lastTime=null;this.lastLogical=null;this.wasDead=false;
    this.travel=0;this.issues=new Set();this.ready=false;this.reconstructed=0;this.chordLength=0;
    this.stationClear=true;this.seedDirection=null;this.arcLength=0;this.maxJointAngle=0;this.pathKey=null;
    this.walls=null;this.lastRootYaw=null;
    this.lastCompactness=null;this.lastVisualLength=null;this.bodyLength=this.baseBodyLength;
    this.routeEpoch=null;this.routeSequence=null;this.generation=null;
    for(let i=0;i<this.rig.bones.length;i++){this.rig.bones[i].position.set(0,0,this.rig.restZ[i]);this.rig.bones[i].quaternion.identity();}
  }
  clear(a,b,radius=this.radius){return dragonSegmentClear(a,b,radius,this.walls);}
  seed(start,yaw,maze,layout){
    const required=this.bodyLength+HISTORY_MARGIN,back=yaw+Math.PI,candidates=[];
    // A curved initial neck keeps the spawn looking forward even when the wall
    // immediately behind it makes a straight body impossible.
    for(const radius of [.45,.32,.60,.24])for(const turn of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI*.75,-Math.PI*.75]){
      if(radius!==.45&&turn===0)continue;
      const path=[point(start.x,start.z)];let heading=back;
      if(turn){
        const steps=Math.ceil(Math.abs(turn)*radius/.055),k=Math.sign(turn)/radius;
        for(let i=1;i<=steps;i++){
          const a=back+turn*i/steps;path.push(point(start.x+(Math.cos(back)-Math.cos(a))/k,start.z+(Math.sin(a)-Math.sin(back))/k));
        }
        heading+=turn;
      }
      if(path.some((p,i)=>i&&!this.clear(path[i-1],p)))continue;
      const end=path.at(-1),remaining=required-polylineLength(path),straight=point(end.x+Math.sin(heading)*remaining,end.z+Math.cos(heading)*remaining);
      if(this.clear(end,straight))candidates.push({path:[...path,straight],cost:Math.abs(turn)});
      else{
        const continuation=this.seedGrid(end,heading,Math.max(0,remaining),maze,layout);
        if(continuation)candidates.push({path:[...path,...continuation],cost:Math.abs(turn)+.8});
      }
    }
    candidates.sort((a,b)=>a.cost-b.cost);
    if(!candidates.length){this.issues.add('insufficient-spawn-clearance');return null;}
    const result=candidates[0].path;this.seedDirection=point(result[1].x-start.x,result[1].z-start.z);return result;
  }
  seedGrid(start,heading,required,maze,layout){
    const nodes=[];
    for(let y=0;y<layout.rows;y++)for(let x=0;x<layout.cols;x++)if(maze[y]?.[x]!=='#'){
      const p=point(layout.x(x),layout.z(y));if(length(start,p)<CELL_SIZE*1.6&&length(start,p)>.05&&
        Math.abs(angleDelta(Math.atan2(p.x-start.x,p.z-start.z),heading))<.40&&this.clear(start,p))
        nodes.push({p,x,y,cost:length(start,p)+Math.abs(angleDelta(Math.atan2(p.x-start.x,p.z-start.z),heading))});
    }
    nodes.sort((a,b)=>a.cost-b.cost);let visits=0;
    const visit=(node,path,total,previousHeading,seen)=>{
      if(total>=required)return path;if(++visits>600)return null;
      const choices=[];
      for(const [dx,dy]of [[0,-1],[-1,0],[1,0],[0,1]]){
        const x=node.x+dx,y=node.y+dy,key=x+','+y;if(maze[y]?.[x]===undefined||maze[y][x]==='#'||seen.has(key))continue;
        const p=point(layout.x(x),layout.z(y)),heading=Math.atan2(dx,dy);if(!this.clear(node.p,p))continue;
        choices.push({p,x,y,key,heading,cost:Math.abs(angleDelta(heading,previousHeading))});
      }
      choices.sort((a,b)=>a.cost-b.cost);
      for(const next of choices){const copy=new Set(seen);copy.add(next.key);const result=visit(next,[...path,next.p],total+length(node.p,next.p),next.heading,copy);if(result)return result;}
      return null;
    };
    for(const node of nodes){const result=visit(node,[node.p],length(start,node.p),Math.atan2(node.p.x-start.x,node.p.z-start.z),new Set([node.x+','+node.y]));if(result)return result;}
    return null;
  }
  append(current,player,layout,exact=false){
    const previous=this.history[0],d=length(previous,current);if(d<EPS)return;
    let middle=null;
    // A rendering frame can cross a committed grid corner. Preserve that known
    // engine endpoint rather than drawing a diagonal shortcut through masonry.
    if(!exact&&this.lastLogical&&(this.lastLogical.x!==player.x||this.lastLogical.y!==player.y)){
      const corner=point(layout.x(this.lastLogical.x),layout.z(this.lastLogical.y));
      const detour=length(previous,corner)+length(corner,current);
      if(detour>d+.005&&detour<d+CELL_SIZE*.8&&this.clear(previous,corner)&&this.clear(corner,current))middle=corner;
    }
    if(!middle&&!this.clear(previous,current)){
      this.issues.add('unsafe-head-displacement');
      // Keep the actual root location and previous tail. This explicit failure
      // is not repaired by teleporting to an invented route or shrinking.
    }
    if(middle){this.history.unshift(middle);this.reconstructed++;this.travel+=length(previous,middle)+length(middle,current);}
    else this.travel+=d;
    this.history.unshift(point(current.x,current.z));
    // Exact collinear collapse bounds storage without smoothing actual turns.
    while(this.history.length>2){
      const [a,b,c]=this.history,ab=length(a,b),bc=length(b,c);
      if(ab<EPS){this.history.splice(1,1);continue;}
      if(Math.abs((b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x))<1e-7*ab*bc&&
        (b.x-a.x)*(c.x-b.x)+(b.z-a.z)*(c.z-b.z)>0)this.history.splice(1,1);else break;
    }
    let total=0;
    for(let i=1;i<this.history.length;i++){
      const segment=length(this.history[i-1],this.history[i]);total+=segment;
      if(total>this.bodyLength+HISTORY_MARGIN){
        const keep=segment-(total-this.bodyLength-HISTORY_MARGIN),a=this.history[i-1],b=this.history[i];
        this.history[i]=point(a.x+(b.x-a.x)*keep/segment,a.z+(b.z-a.z)*keep/segment);this.history.length=i+1;break;
      }
    }
  }
  update(root,player,snapshot,layout,dt,wallBounds){
    if(!player)return;
    const time=snapshot.time??0,route=player.route,previousTime=this.lastTime;
    if(player.dead||player.hidden){this.wasDead=true;this.lastTime=time;return;}
    const key=snapshot.level??0;
    if(this.wasDead||this.lastTime!==null&&time<this.lastTime||this.pathKey!==null&&this.pathKey!==key||
      this.generation!==null&&this.generation!==snapshot.generation||this.routeEpoch!==null&&route&&this.routeEpoch!==route.epoch)this.reset();
    if(snapshot.paused&&this.ready)return;
    if(this.lastTime===time&&this.ready)return;
    this.pathKey=key;this.generation=snapshot.generation??null;this.lastTime=time;
    // Renderer reset owns maze changes. Snapshot creates new maze arrays each
    // frame, so comparing/stringifying their identity here would be wasted work.
    if(!this.walls)this.walls=wallBounds??dragonWallBounds(snapshot.maze,layout);
    else if(wallBounds)this.walls=wallBounds;
    const current=point(root.position.x,root.position.z);
    const routeAdvanced=route?.points?.length&&route.points.at(-1).sequence>this.routeSequence;
    const compactness=root.userData.dragonCompactness??0;
    const visualLength=root.userData.dragonVisualLength??2-compactness;
    if(ensureDragonDetail(root,this.rig,visualLength))this.samples=this.rig.restZ.map(()=>({x:0,z:0,tx:0,tz:-1}));
    this.bodyLength=this.baseBodyLength+Math.max(0,visualLength-2)*CELL_SIZE;
    const moved=!this.history.length||length(this.history[0],current)>EPS||routeAdvanced;
    if(!moved&&this.ready&&this.lastRootYaw===root.rotation.y&&this.lastVisualLength===visualLength)return;
    this.lastCompactness=compactness;this.lastVisualLength=visualLength;
    this.issues.clear();
    if(!this.history.length){
      this.history=this.seed(current,root.rotation.y,snapshot.maze,layout)??[];if(!this.history.length)return;
      this.routeEpoch=route?.epoch??null;this.routeSequence=route?.points?.at(-1)?.sequence??null;
    }else{
      if(route){
        const firstRoute=this.routeSequence===null;
        if(this.routeSequence!==null&&route.points.length&&route.points[0].sequence>this.routeSequence+1)this.issues.add('missing-committed-history');
        for(const waypoint of route.points){
          if(this.routeSequence!==null&&waypoint.sequence<=this.routeSequence)continue;
          if(waypoint.time>time)continue;
          if(firstRoute&&previousTime!==null&&waypoint.time<=previousTime){this.routeSequence=waypoint.sequence;continue;}
          this.append(point(layout.x(waypoint.x),layout.z(waypoint.y)),player,layout,true);this.routeSequence=waypoint.sequence;
        }
        this.routeEpoch=route.epoch;
      }
      this.append(current,player,layout,Boolean(route));
    }
    this.lastLogical={x:player.x,y:player.y};
    this.pieces=curveRoute(this.history,this.radius,this.walls,this.issues,this.curvePool);
    this.arcLength=this.pieces.reduce((sum,p)=>sum+p.length,0);
    if(this.arcLength<this.bodyLength-EPS){this.issues.add('insufficient-history');return;}
    this.ready=true;this.stationClear=true;this.chordLength=0;this.maxJointAngle=0;
    const yaw=root.rotation.y,c=Math.cos(yaw),s=Math.sin(yaw);this.lastRootYaw=yaw;let previousYaw=0;
    for(let i=0;i<this.rig.bones.length;i++){
      const distance=-dragonLengthZ(this.rig.restZ[i],visualLength)*this.scale;
      const sample=sampleRoute(this.pieces,Math.max(0,distance),this.samples[i]),bone=this.rig.bones[i];
      if(distance<0){sample.x=root.position.x-Math.sin(yaw)*distance;sample.z=root.position.z-Math.cos(yaw)*distance;}
      if(i===0){bone.position.set(0,0,-distance/this.scale);bone.quaternion.identity();previousYaw=yaw;continue;}
      const dx=sample.x-root.position.x,dz=sample.z-root.position.z;
      bone.position.set((dx*c-dz*s)/this.scale,0,(dx*s+dz*c)/this.scale);
      let worldYaw=distance<=0?yaw:routeYaw(this.pieces,distance,this.scratchA);
      // Join the rigid head frame without an opposing first skinning interval.
      const neck=clamp(distance/.34,0,1);worldYaw=yaw+angleDelta(worldYaw,yaw)*(neck*neck*(3-2*neck));
      // A cap on adjacent FRAME rotation (never translation or bone scale)
      // avoids the singularity of linearly blended opposing rotations. The
      // worst midpoint cross-section factor is cos(.55/2), above 96.2%.
      worldYaw=previousYaw+clamp(angleDelta(worldYaw,previousYaw),-.55,.55);
      bone.rotation.set(0,angleDelta(worldYaw,yaw),0);
      this.maxJointAngle=Math.max(this.maxJointAngle,Math.abs(angleDelta(worldYaw,previousYaw)));previousYaw=worldYaw;
      this.chordLength+=length(this.samples[i-1],sample);
      const r=Math.max(this.rig.stationRadii?.[i]??this.radius/this.scale,this.rig.stationRadii?.[i-1]??this.radius/this.scale)*this.scale;
      if(!this.clear(this.samples[i-1],sample,r))this.stationClear=false;
    }
    if(!this.stationClear)this.issues.add('body-clearance');
  }
  diagnostics(){return {ready:this.ready,feasible:this.ready&&!Array.from(this.issues).some(i=>i!=='self-overlap'&&i!=='tight-bend'),
    issues:[...this.issues],selfOverlap:this.issues.has('self-overlap'),bodyLength:this.bodyLength*(1-.59*(this.lastCompactness??0)),arcLength:this.arcLength,
    chordLength:this.chordLength,chordDeficit:this.bodyLength*(1-.59*(this.lastCompactness??0))-this.chordLength,maxJointAngle:this.maxJointAngle,
    stationClear:this.stationClear,travel:this.travel,reconstructed:this.reconstructed,historyPoints:this.history.length,
    seedDirection:this.seedDirection,stations:this.samples.map(p=>({x:p.x,z:p.z}))};}
}
