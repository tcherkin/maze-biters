// A transition is a curve of MATERIAL positions, not independently filtered
// headings. Its tangent and curvature are spatial derivatives of that curve.
// Each endpoint snapshot is sampled once at the logical commit; rebuilding a
// rounded grid route can therefore never replace already visible geometry.
const mix=(a,b,t)=>a+(b-a)*t;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const finite=value=>Number.isFinite(value);
const WINDOW=Symbol('material curve window');
const RETIRING_TAIL=Symbol('retiring tail source');

export function createMaterialCurve(fromPath,fromStart,fromEnd,toPath,toStart,toEnd){
  // A capture must not retain a mutable curve from the preceding step. Copy
  // its current control points; history stays bounded to these two poses.
  if(fromPath.snapshot)fromPath=fromPath.snapshot();
  if(toPath.snapshot)toPath=toPath.snapshot();
  // Repeated holds/captures at phase zero must not retain a stack of wrappers.
  // These windows only translate arc distance and are algebraically identical
  // to one offset on their original immutable source.
  while(fromPath[WINDOW]){const w=fromPath[WINDOW];fromStart+=w.start;fromEnd+=w.start;fromPath=w.path;}
  while(toPath[WINDOW]){const w=toPath[WINDOW];toStart+=w.start;toEnd+=w.start;toPath=w.path;}
  const oldLength=Math.max(.001,fromEnd-fromStart),newLength=Math.max(.001,toEnd-toStart);
  const count=Math.max(2,Math.ceil(Math.max(oldLength,newLength)/1.25));
  const old=new Float64Array((count+1)*4),next=new Float64Array(old.length),points=new Float64Array(old.length);
  const lengths=new Float64Array(count+1),a={},b={},scratch={};let progress=NaN,total=0,straight=false;
  const linear=new Uint8Array(count),runStart=new Float64Array(count),runEnd=new Float64Array(count);
  const coefficients=new Float64Array(count*4);
  for(let i=0;i<=count;i++){
    fromPath.sample(fromStart+oldLength*i/count,a);toPath.sample(toStart+newLength*i/count,b);
    const k=i*4;
    old[k]=a.x;old[k+1]=a.y;old[k+2]=a.tx*oldLength/count;old[k+3]=a.ty*oldLength/count;
    next[k]=b.x;next[k+1]=b.y;next[k+2]=b.tx*newLength/count;next[k+3]=b.ty*newLength/count;
  }
  function segment(index,u,out){
    const k=index*4,ax=coefficients[k],ay=coefficients[k+1],bx=coefficients[k+2],by=coefficients[k+3];
    out.x=points[k]+u*(points[k+2]+u*(bx+u*ax));
    out.y=points[k+1]+u*(points[k+3]+u*(by+u*ay));
    out.dx=points[k+2]+u*(2*bx+3*u*ax);out.dy=points[k+3]+u*(2*by+3*u*ay);
    out.ddx=2*bx+6*u*ax;out.ddy=2*by+6*u*ay;
    out.speed=Math.hypot(out.dx,out.dy);return out;
  }
  function integral(index,u){
    return u*(speedAt(index,0)+4*speedAt(index,u/2)+speedAt(index,u))/6;
  }
  function speedAt(index,u){
    const k=index*4;
    return Math.hypot(points[k+2]+u*(2*coefficients[k+2]+3*u*coefficients[k]),
      points[k+3]+u*(2*coefficients[k+3]+3*u*coefficients[k+1]));
  }
  function update(value){
    const p=Math.max(0,Math.min(1,value));if(p===progress)return api;
    progress=p;for(let i=0;i<points.length;i++)points[i]=mix(old[i],next[i],p);
    total=0;lengths[0]=0;
    for(let i=0;i<count;i++){
      const k=i*4,j=k+4,dx=points[j]-points[k],dy=points[j+1]-points[k+1],l=Math.hypot(dx,dy);
      coefficients[k]=points[k+2]+points[j+2]-2*dx;coefficients[k+1]=points[k+3]+points[j+3]-2*dy;
      coefficients[k+2]=3*dx-2*points[k+2]-points[j+2];coefficients[k+3]=3*dy-2*points[k+3]-points[j+3];
      linear[i]=l>1e-9&&Math.abs(points[k+2]*dy-points[k+3]*dx)<1e-8*l
        &&Math.abs(points[j+2]*dy-points[j+3]*dx)<1e-8*l
        &&points[k+2]*dx+points[k+3]*dy>0&&points[j+2]*dx+points[j+3]*dy>0
        &&(points[k+2]+points[j+2])*dx+(points[k+3]+points[j+3])*dy<=3*l*l?1:0;
      total+=linear[i]?l:integral(i,1);lengths[i+1]=total;
      runStart[i]=linear[i]&&i>0&&linear[i-1]?runStart[i-1]:lengths[i];
    }
    for(let i=count-1;i>=0;i--)runEnd[i]=linear[i]&&i<count-1&&linear[i+1]?runEnd[i+1]:lengths[i+1];
    const dx=points[count*4]-points[0],dy=points[count*4+1]-points[1],span=Math.hypot(dx,dy);
    straight=span>1e-8;for(let i=0;straight&&i<=count;i++){
      const k=i*4;straight=Math.abs((points[k]-points[0])*dy-(points[k+1]-points[1])*dx)<1e-7*span
        &&Math.abs(points[k+2]*dy-points[k+3]*dx)<1e-7*span;
    }
    return api;
  }
  function sample(distance,out={}){
    if(!finite(distance))throw Error('Non-finite material curve distance');
    // Preserve exact endpoints, including the first pose of a new commit.
    if(progress===0||progress===1){
      const path=progress===0?fromPath:toPath,start=progress===0?fromStart:toStart;
      return path.sample(start+distance,out);
    }
    let low=0,high=count-1;
    while(low<high){const middle=(low+high)>>1;if(distance<lengths[middle+1])high=middle;else low=middle+1;}
    const local=Math.max(0,Math.min(lengths[low+1]-lengths[low],distance-lengths[low]));
    if(linear[low]){
      const k=low*4,j=k+4,dx=points[j]-points[k],dy=points[j+1]-points[k+1],length=Math.hypot(dx,dy);
      out.tx=dx/length;out.ty=dy/length;out.angle=Math.atan2(out.ty,out.tx);out.curve=0;
      const extension=distance<0?distance:distance>total?distance-total:0;
      out.x=points[k]+(local+extension)*out.tx;out.y=points[k+1]+(local+extension)*out.ty;
      return out;
    }
    let u=local/Math.max(1e-12,lengths[low+1]-lengths[low]);
    for(let n=0;n<3;n++){
      const error=integral(low,u)-local;
      u=Math.max(0,Math.min(1,u-error/Math.max(1e-9,speedAt(low,u))));
    }
    segment(low,u,scratch);const speed=Math.max(1e-9,scratch.speed);
    out.tx=scratch.dx/speed;out.ty=scratch.dy/speed;out.angle=Math.atan2(out.ty,out.tx);
    out.curve=(scratch.dx*scratch.ddy-scratch.dy*scratch.ddx)/(speed*speed*speed);
    const extension=distance<0?distance:distance>total?distance-total:0;
    out.x=scratch.x+extension*out.tx;out.y=scratch.y+extension*out.ty;
    return out;
  }
  const api={sample,update,ribbonSpan(s,maximum,direction=1){
      if(progress===0||progress===1){const p=progress===0?fromPath:toPath,start=progress===0?fromStart:toStart;
        return p.ribbonSpan(start+s,maximum,direction);}
      if(straight)return maximum;
      const probe=s+direction*1e-7;let lo=0,hi=count-1;
      while(lo<hi){const mid=(lo+hi)>>1;if(probe<lengths[mid+1])hi=mid;else lo=mid+1;}
      return linear[lo]?Math.min(maximum,Math.max(.0001,direction>0?runEnd[lo]-s:s-runStart[lo])):Math.min(maximum,1.25);
    },
    snapshot(){
      if(progress===0||progress===1){
        const p=progress===0?fromPath:toPath,start=progress===0?fromStart:toStart,len=progress===0?oldLength:newLength;
        return {[WINDOW]:{path:p,start},total:len,sample(s,out={}){return p.sample(start+s,out);},ribbonSpan(s,m,d=1){return p.ribbonSpan(start+s,m,d);}};
      }
      // Construct a detached curve using its own current geometric samples.
      const savedProgress=progress;
      const detached=createMaterialCurve({sample, ribbonSpan:api.ribbonSpan},0,total,{sample,ribbonSpan:api.ribbonSpan},0,total);
      // Its sampled nodes are immutable after this update, and do not need
      // either original source path. A middle blend always uses those nodes.
      detached.update(.5);detached.detachSources();update(savedProgress);return detached;
    },
    detachSources(){fromPath=null;toPath=null;},
    clone(){const cloned=createMaterialCurve(fromPath,fromStart,fromEnd,toPath,toStart,toEnd);return cloned.update(progress);},
    get total(){return progress===0?oldLength:progress===1?newLength:total;},
    get materialProgress(){return progress;}};
  update(0);return api;
}

// A solitary head is rigid, but its native position is its CENTER, not its
// nape. Interpolating the napes then rotating around them makes that center
// orbit sideways into a neighbouring wall. Keep the full-size line centered
// on the committed cell path throughout the turn.
export function createRigidHeadCurve(from,until,length,centerVia=null){
  const a={...from},b={...until},delta=wrap(b.angle-a.angle),half=length/2;
  const ax=a.x+half*Math.cos(a.angle),ay=a.y+half*Math.sin(a.angle);
  const bx=b.x+half*Math.cos(b.angle),by=b.y+half*Math.sin(b.angle);
  const via=centerVia?{x:centerVia.x,y:centerVia.y}:null;
  const first=via?Math.hypot(via.x-ax,via.y-ay):0;
  const second=via?Math.hypot(bx-via.x,by-via.y):0;
  const fraction=first+second>1e-8?first/(first+second):0;
  let progress=0;
  return {total:length,get materialProgress(){return progress;},update(p){progress=Math.max(0,Math.min(1,p));return this;},
    sample(s,out={}){const angle=a.angle+delta*progress;out.tx=Math.cos(angle);out.ty=Math.sin(angle);out.angle=angle;out.curve=0;
      let x,y;
      if(via&&fraction>1e-8&&fraction<1-1e-8){
        // A new perpendicular commit may interrupt the preceding visual
        // step. Traverse its remaining corridor to the old cell first, not
        // a diagonal shortcut across the closed inside corner.
        const firstLeg=progress<fraction,p=firstLeg?progress/fraction:(progress-fraction)/(1-fraction);
        x=mix(firstLeg?ax:via.x,firstLeg?via.x:bx,p);y=mix(firstLeg?ay:via.y,firstLeg?via.y:by,p);
      }else{x=mix(ax,bx,progress);y=mix(ay,by,progress);}
      out.x=x+(s-half)*out.tx;out.y=y+(s-half)*out.ty;return out;},
    ribbonSpan(s,maximum){return maximum;},snapshot(){const rear=this.sample(0);return createRigidHeadCurve(rear,rear,length);},
    clone(){return createRigidHeadCurve(a,b,length,via).update(progress);}};
}

// Logical 2 -> 1 can precede the end of the painted tail's bite clock. A new
// solo movement must not replace that still-visible curved remnant with the
// rigid skull's straight extension. Keep its captured material shape attached
// to the same nape until the independent length morph has consumed it.
export function attachRetiringTail(head,fromPath,fromRear){
  let source=fromPath[RETIRING_TAIL];
  if(!source){
    const path=fromPath.snapshot?fromPath.snapshot():fromPath;
    source={path,rear:fromRear,origin:path.sample(fromRear)};
  }
  return retiringTail(head,source);
}
function retiringTail(head,source){
  const anchor={},origin=source.origin;
  const api={kind:'retiring-tail',[RETIRING_TAIL]:source,
    get total(){return head.total;},get materialProgress(){return head.materialProgress;},
    update(p){head.update(p);return api;},
    sample(s,out={}){
      if(s>=0)return head.sample(s,out);
      source.path.sample(source.rear+s,out);head.sample(0,anchor);
      const delta=anchor.angle-origin.angle,c=Math.cos(delta),n=Math.sin(delta);
      const x=out.x-origin.x,y=out.y-origin.y,tx=out.tx,ty=out.ty;
      out.x=anchor.x+c*x-n*y;out.y=anchor.y+n*x+c*y;
      out.tx=c*tx-n*ty;out.ty=n*tx+c*ty;
      out.angle=Math.atan2(out.ty,out.tx);return out;
    },
    ribbonSpan(s,maximum,direction=1){
      if(s+direction*1e-7<0)return source.path.ribbonSpan(source.rear+s,
        Math.min(maximum,direction>0?Math.max(.0001,-s):Infinity),direction);
      return head.ribbonSpan(s,Math.min(maximum,direction<0?Math.max(.0001,s):Infinity),direction);
    },
    snapshot(){return retiringTail(head.snapshot(),source);},
    clone(){return retiringTail(head.clone(),source);}};
  return api;
}

// A forward decision only adds future rail beyond the already visible nape.
// Once continuity has been verified by the caller, travel along that ONE rail
// instead of cross-fading material positions across the inside of its bends.
export function createRouteWindowCurve(path,fromHead,fromLength,toHead,toLength){
  let progress=0,start=fromHead-fromLength,length=fromLength;
  const api={kind:'route-window',
    update(value){const p=Math.max(0,Math.min(1,value));if(p===progress)return api;
      progress=p;length=mix(fromLength,toLength,p);start=mix(fromHead,toHead,p)-length;return api;},
    sample(distance,out={}){return path.sample(start+distance,out);},
    ribbonSpan(distance,maximum,direction=1){return path.ribbonSpan(start+distance,maximum,direction);},
    snapshot(){const at=start,span=length;return {total:span,[WINDOW]:{path,start:at},
      sample(distance,out={}){return path.sample(at+distance,out);},
      ribbonSpan(distance,maximum,direction=1){return path.ribbonSpan(at+distance,maximum,direction);}};},
    clone(){return createRouteWindowCurve(path,fromHead,fromLength,toHead,toLength).update(progress);},
    get total(){return length;},get materialProgress(){return progress;}};
  return api;
}

// Only an UNKNOWN leading tail corner may change occupied rail. Keep that
// short prefix local: the established body and rigid head still travel one
// immutable rounded path, never a whole-body cross-fade through its bends.
function frozenJoinedPrefix(part,span,path,join){return {total:part.total+span,
  sample(s,out={}){return s<part.total?part.sample(s,out):path.sample(join+s-part.total,out);},
  ribbonSpan(s,maximum,direction=1){
    const before=s+direction*1e-7<part.total;
    const remaining=before&&direction>0?part.total-s:!before&&direction<0?s-part.total:Infinity;
    const available=Math.min(maximum,Math.max(.0001,remaining));
    return before?part.ribbonSpan(s,available,direction):path.ribbonSpan(join+s-part.total,available,direction);
  }};}

export function createJoinedPrefixCurve(fromPath,fromTail,fromJoin,fromHead,path,toTail,join,toHead,visibleTailSpan=0){
  if(fromPath.snapshot)fromPath=fromPath.snapshot();
  const prefix=createTurningPrefix(fromPath,fromTail,fromJoin,path,toTail,join);
  const oldSuffix=fromHead-fromJoin,newSuffix=toHead-join;
  let progress=0,suffix=oldSuffix,compression=0,tailCurve=0,tailBase=0;
  const basePoint={},tailTurn=visibleTailSpan>0?prefix.tailBendTurn||0:0;
  function configureTail(){
    // A two-cell snake's analytic corner lies beyond its entire painted tail.
    // Let that leading material flex about its unchanged base, without moving
    // or distorting the rigid head. Unit arc length and native endpoints stay
    // exact. The C2 envelope's derivative is <1, so the tip cannot overshoot
    // its final heading or wobble back against the ongoing turn.
    const envelope=64*progress**3*(1-progress)**3;
    tailCurve=tailTurn*.28*envelope/Math.max(.001,visibleTailSpan);
    tailBase=visibleTailSpan+compression;
    if(tailCurve)prefix.sample(tailBase,basePoint);
  }
  const api={kind:'joined-prefix',
    update(value){progress=Math.max(0,Math.min(1,value));prefix.update(progress);suffix=mix(oldSuffix,newSuffix,progress);configureTail();return api;},
    setCompression(value){compression=value;configureTail();return api;},
    sample(s,out={}){
      if(tailCurve&&s<tailBase){
        const d=s-tailBase,h=tailCurve*d/2,scale=Math.abs(h)<1e-8?1-h*h/6:Math.sin(h)/h;
        const middle=basePoint.angle+h,angle=basePoint.angle+2*h;
        out.x=basePoint.x+d*scale*Math.cos(middle);out.y=basePoint.y+d*scale*Math.sin(middle);
        out.tx=Math.cos(angle);out.ty=Math.sin(angle);out.angle=angle;out.curve=tailCurve;return out;
      }
      return s<prefix.total?prefix.sample(s,out):path.sample(join+s-prefix.total,out);
    },
    ribbonSpan(s,maximum,direction=1){
      if(tailCurve&&s+direction*1e-7<tailBase)return Math.min(maximum,1.2,
        direction>0?Math.max(.0001,tailBase-s):Infinity);
      const before=s+direction*1e-7<prefix.total;
      const remaining=before&&direction>0?prefix.total-s:!before&&direction<0?s-prefix.total:Infinity;
      const available=Math.min(maximum,Math.max(.0001,remaining));
      return before?prefix.ribbonSpan(s,available,direction):path.ribbonSpan(join+s-prefix.total,available,direction);
    },
    snapshot(){
      if(progress===0||progress===1){const source=progress===0?fromPath:path,start=progress===0?fromTail:toTail;
        const total=progress===0?fromHead-fromTail:toHead-toTail;
        return {[WINDOW]:{path:source,start},total,sample(s,out={}){return source.sample(start+s,out);},
          ribbonSpan(s,m,d=1){return source.ribbonSpan(start+s,m,d);}};}
      // A succession of interrupted turns must not retain every preceding
      // prefix constructor and its source closure. Detach numeric controls
      // just as the ordinary material curve does for a mid-step capture.
      const fixed={sample:api.sample,ribbonSpan:api.ribbonSpan};
      const detached=createMaterialCurve(fixed,0,prefix.total,fixed,0,prefix.total);
      detached.update(.5);detached.detachSources();
      return frozenJoinedPrefix(detached,suffix,path,join);
    },
    clone(){return createJoinedPrefixCurve(fromPath,fromTail,fromJoin,fromHead,path,toTail,join,toHead,visibleTailSpan)
      .update(progress).setCompression(compression);},
    get total(){return prefix.total+suffix;},get prefixLength(){return prefix.total;},
    get materialProgress(){return progress;}};
  return api;
}

function createTurningPrefix(fromPath,fromTail,fromJoin,path,toTail,join){
  const a=fromPath.sample(fromTail),b=fromPath.sample(fromJoin),c=path.sample(toTail),j=path.sample(join);
  const oldLength=fromJoin-fromTail,newLength=join-toTail,turn=wrap(j.angle-c.angle);
  const radius=(newLength-oldLength)/Math.abs(turn),oldMid=fromPath.sample((fromTail+fromJoin)/2);
  if(Math.abs(Math.abs(turn)-Math.PI/2)<1e-6&&Math.abs(radius-18)<1e-5
    &&Math.abs(wrap(a.angle-b.angle))<1e-6&&Math.abs(wrap(oldMid.angle-b.angle))<1e-6
    &&Math.hypot(a.x+oldLength*b.tx-b.x,a.y+oldLength*b.ty-b.y)<1e-5){
    let p=0,angle=0,arcStartX=b.x,arcStartY=b.y,tx=b.tx,ty=b.ty;
    const sign=Math.sign(turn),cx=j.x-sign*radius*j.ty,cy=j.y+sign*radius*j.tx;
    const api={tailBendTurn:turn,update(value){p=Math.max(0,Math.min(1,value));angle=turn*p;
      tx=Math.cos(j.angle-angle);ty=Math.sin(j.angle-angle);
      arcStartX=cx+sign*radius*ty;arcStartY=cy-sign*radius*tx;return api;},
      sample(s,out={}){
        if(p===0)return fromPath.sample(fromTail+s,out);
        if(p===1)return path.sample(toTail+s,out);
        const local=s-oldLength;
        if(local<=0){out.x=arcStartX+tx*local;out.y=arcStartY+ty*local;out.tx=tx;out.ty=ty;out.curve=0;}
        else if(local>=Math.abs(angle)*radius){const d=local-Math.abs(angle)*radius;
          out.x=j.x+j.tx*d;out.y=j.y+j.ty*d;out.tx=j.tx;out.ty=j.ty;out.curve=0;}
        else{const direction=j.angle-angle+sign*local/radius;out.tx=Math.cos(direction);out.ty=Math.sin(direction);
          out.x=cx+sign*radius*out.ty;out.y=cy-sign*radius*out.tx;out.curve=sign/radius;}
        out.angle=Math.atan2(out.ty,out.tx);return out;
      },
      ribbonSpan(s,maximum,direction=1){const at=s+direction*1e-7;
        const boundary=at<oldLength?oldLength:oldLength+Math.abs(angle)*radius;
        if(at<oldLength)return direction>0?Math.min(maximum,Math.max(.0001,boundary-s)):maximum;
        return Math.min(maximum,1.25,Math.max(.0001,direction>0?boundary-s:s-oldLength));
      },
      snapshot(){return createTurningPrefix(fromPath,fromTail,fromJoin,path,toTail,join).update(p);},
      get total(){return oldLength+Math.abs(angle)*radius;}};
    return api;
  }
  // Interrupted native steps can start partway through that local turn.
  // Blend its HEADING FIELD in arc-length coordinates, not its positions.
  // k=(oldLength*(1-p)*oldK+newLength*p*newK)/length, so an accepted
  // minimum radius is preserved throughout, including an opposite next turn.
  const fractions=[0,1];
  function knots(p,start,end){let s=start,guard=0;
    while(s<end-1e-7&&guard++<4096){s+=Math.min(.75,end-s,Math.max(.0001,p.ribbonSpan(s,end-s,1)));
      fractions.push((s-start)/(end-start));}}
  knots(fromPath,fromTail,fromJoin);knots(path,toTail,join);
  fractions.sort((x,y)=>x-y);
  const u=fractions.filter((v,i)=>!i||v-fractions[i-1]>1e-8),n=u.length;
  const old=new Float64Array(n),next=new Float64Array(n),angles=new Float64Array(n);
  const xs=new Float64Array(n),ys=new Float64Array(n);let p=0,length=oldLength;
  for(let i=n-1;i>=0;i--){
    let oa=fromPath.sample(fromTail+oldLength*u[i]).angle,na=path.sample(toTail+newLength*u[i]).angle;
    if(i<n-1){oa=old[i+1]+wrap(oa-old[i+1]);na=next[i+1]+wrap(na-next[i+1]);}
    old[i]=oa;next[i]=na;
  }
  const shift=old[n-1]-next[n-1];for(let i=0;i<n;i++)next[i]+=shift;
  function integrate(a0,a1,d){const h=(a1-a0)/2,scale=Math.abs(h)<1e-8?1-h*h/6:Math.sin(h)/h;
    return {x:d*scale*Math.cos((a0+a1)/2),y:d*scale*Math.sin((a0+a1)/2)};}
  const api={update(value){p=Math.max(0,Math.min(1,value));length=mix(oldLength,newLength,p);
    for(let i=0;i<n;i++)angles[i]=mix(old[i],next[i],p);
    xs[n-1]=j.x;ys[n-1]=j.y;
    for(let i=n-2;i>=0;i--){const q=integrate(angles[i],angles[i+1],(u[i+1]-u[i])*length);
      xs[i]=xs[i+1]-q.x;ys[i]=ys[i+1]-q.y;}return api;},
    sample(s,out={}){
      if(p===0)return fromPath.sample(fromTail+s,out);if(p===1)return path.sample(toTail+s,out);
      let low=0,high=n-2;const fraction=Math.max(0,Math.min(1,s/length));
      while(low<high){const middle=(low+high)>>1;if(fraction<u[middle+1])high=middle;else low=middle+1;}
      const extent=(u[low+1]-u[low])*length,local=s-u[low]*length,k=(angles[low+1]-angles[low])/extent;
      const angle=angles[low]+k*Math.max(0,Math.min(extent,local));
      const q=integrate(angles[low],angle,Math.max(0,Math.min(extent,local)));
      out.tx=Math.cos(angle);out.ty=Math.sin(angle);out.angle=angle;out.curve=k;
      const excess=local<0?local:local>extent?local-extent:0;
      out.x=xs[low]+q.x+excess*out.tx;out.y=ys[low]+q.y+excess*out.ty;return out;
    },ribbonSpan(s,maximum){return Math.min(maximum,.75);},
    snapshot(){return createTurningPrefix(fromPath,fromTail,fromJoin,path,toTail,join).update(p);},
    get total(){return length;}};
  return api.update(0);
}
