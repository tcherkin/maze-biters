// Local presentation study. No collision, pathfinding or production timing changes.
(function(root){
  'use strict';
  const clamp=value=>Math.max(0,Math.min(1,value));
  const ease=value=>value*value*(3-2*value);
  const direction=(a,b)=>({x:Math.sign(b.x-a.x),y:Math.sign(b.y-a.y)});
  const angle=d=>Math.atan2(d.y,d.x);
  const delta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
  const corner=(a,b)=>!!a&&!!b&&a.x*b.x+a.y*b.y===0;

  function pose(state,index,t,adapter,out={}){
    const s=state.snake,body=s.body,last=body.length-1;
    const head=index===0,cell=body[index];
    if(!cell) return null;
    const face=head?s.dir:direction(cell,body[last-1]);
    const base=adapter.position(s,index,t,out);
    out.x=base.x;out.y=base.y;out.fromDir=face;out.toDir=face;
    out.angle=angle(face);out.progress=1;out.active=false;out.trim=null;
    const elapsed=Math.max(0,t-state.time);
    const old=state.previousBody;
    if(!old||old.length!==body.length) return out;

    // Two-cell snakes have no third point from which to anticipate a bend.
    // Their inward end already arrived at this cell before the tick: keep
    // that position and settle orientation during the existing hold phase.
    if(body.length===2&&((!head&&!s.reversing)||(head&&s.reversing))){
      const oldFace=head?state.previousDir:direction(old[last],old[last-1]);
      if(corner(oldFace,face)){
        const p=clamp(elapsed/(state.delay*.45));
        out.fromDir=oldFace;out.toDir=face;out.progress=p;
        out.angle=angle(oldFace)+delta(angle(oldFace),angle(face))*ease(p);
        out.active=p<1;
      }
      return out;
    }

    // The inward-moving end already anticipates the next logical cell on
    // straights. Extend that same half-tick phase to corners (never after it).
    const inward=body.length>2&&((!head&&!s.reversing)||(head&&s.reversing));
    if(inward){
      const neighbour=body[head?1:last-1];
      const beyond=body[head?2:last-2];
      const incoming=direction(cell,neighbour),outgoing=direction(neighbour,beyond);
      if(corner(incoming,outgoing)){
        const p=clamp((elapsed/state.delay-.5)/.5);
        const toFace=head?{x:-outgoing.x,y:-outgoing.y}:outgoing;
        out.x=cell.x+(neighbour.x-cell.x)*p;
        out.y=cell.y+(neighbour.y-cell.y)*p;
        out.fromDir=face;out.toDir=toFace;out.progress=p;
        out.angle=angle(face)+delta(angle(face),angle(toFace))*ease(p);
        out.active=p<1;
        out.trim={index:head?1:last-1,head};
        return out;
      }
    }

    // Outward-moving head / retreating tail: retain the old endpoint and
    // turn it while it slides out. The adjacent elbow remains underneath.
    const outward=(head&&!s.reversing)||(!head&&s.reversing)||body.length===1;
    if(outward){
      const from=old[index];
      const oldFace=head?state.previousDir:direction(from,old[last-1]);
      if(from&&corner(oldFace,face)){
        const p=clamp(elapsed/(s.visualMoveDuration||state.delay*.55));
        out.x=from.x+(cell.x-from.x)*p;
        out.y=from.y+(cell.y-from.y)*p;
        out.fromDir=oldFace;out.toDir=face;out.progress=p;
        out.angle=angle(oldFace)+delta(angle(oldFace),angle(face))*ease(p);
        out.active=p<1;
      }
    }
    return out;
  }

  function clipAhead(ctx,endpoint,tile){
    const sign=endpoint.trim.head?-1:1;
    const nx=Math.cos(endpoint.angle)*sign,ny=Math.sin(endpoint.angle)*sign;
    const tx=-ny,ty=nx,extent=tile*5;
    const x=(endpoint.x+.5)*tile,y=(endpoint.y+.5)*tile;
    ctx.beginPath();
    ctx.moveTo(x+tx*extent,y+ty*extent);
    ctx.lineTo(x-tx*extent,y-ty*extent);
    ctx.lineTo(x-tx*extent+nx*extent,y-ty*extent+ny*extent);
    ctx.lineTo(x+tx*extent+nx*extent,y+ty*extent+ny*extent);
    ctx.closePath();ctx.clip();
  }

  function drawEnd(ctx,state,endpoint,head,adapter){
    const tile=adapter.tile,s=state.snake;
    // Pick the closest real directional view and only rotate the remainder.
    // No alpha cross-fade, second head, new texture, filter or blur per frame.
    const sourceDir=endpoint.progress<.5?endpoint.fromDir:endpoint.toDir;
    const number=adapter.directionNumber(sourceDir);
    ctx.save();
    ctx.translate((endpoint.x+.5)*tile,(endpoint.y+.5)*tile);
    ctx.rotate(delta(angle(sourceDir),endpoint.angle));
    ctx.imageSmoothingEnabled=true;
    if(head) adapter.occlusion(ctx,s,number,-tile/2,-tile/2,tile);
    adapter.sprite(ctx,s,head?(s.body.length===1?'UNIQUE_HEAD':'HEAD'):'TAIL',
      number,-tile/2,-tile/2,tile);
    ctx.restore();
  }

  // Reuse endpoint output objects across frames. Only the corner's adjacent
  // body tile is clipped; no offscreen surfaces are created by this renderer.
  function createRenderer(adapter){
    const headPose={},tailPose={};
    return function render(ctx,state,t,{clipToCorridor=true}={}){
      const s=state.snake,body=s.body,tile=adapter.tile,last=body.length-1;
      if(!body.length) return;
      pose(state,0,t,adapter,headPose);
      if(last>0) pose(state,last,t,adapter,tailPose);
      // Outside a local turn use the exact original renderer, including its
      // specialised reverse-neck masks, filtering and straight-tail reveals.
      if(!headPose.active&&!headPose.trim&&
         (last===0||(!tailPose.active&&!tailPose.trim))){
        adapter.render(ctx,s,t);
        return;
      }
      ctx.save();
      if(clipToCorridor){
        ctx.beginPath();
        for(const cell of state.path) ctx.rect(cell.x*tile,cell.y*tile,tile,tile);
        ctx.clip();
      }
      // Same painter's order as production: tail, stationary trail, head.
      if(last>0) drawEnd(ctx,state,tailPose,false,adapter);
      for(let i=last-1;i>0;i--){
        const cell=body[i],a=direction(cell,body[i-1]),b=direction(cell,body[i+1]);
        ctx.save();
        if(headPose.trim?.index===i) clipAhead(ctx,headPose,tile);
        if(last>0&&tailPose.trim?.index===i) clipAhead(ctx,tailPose,tile);
        const isCorner=corner(a,b);
        if(isCorner||!adapter.follower?.(ctx,s,i,t)){
          adapter.sprite(ctx,s,isCorner?'TURN':'BODY_DIRECTIONAL',
            isCorner?adapter.turnNumber(a,b):adapter.directionNumber(a),
            cell.x*tile,cell.y*tile,tile);
        }
        ctx.restore();
      }
      drawEnd(ctx,state,headPose,true,adapter);
      ctx.restore();
    };
  }
  root.MazeBitersSoftTurns=Object.freeze({pose,createRenderer});
})(globalThis);
