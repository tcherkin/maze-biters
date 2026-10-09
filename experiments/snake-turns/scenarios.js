(function(global){
  'use strict';

  // Isolated visual-study fixtures. These routes are prescribed, not game AI;
  // no collision, pathfinding, timing, or gameplay decisions are replaced.
  const width=12;
  const height=9;
  const center={x:5,y:4};
  const definitions=Object.freeze({
    'elbow-forward':Object.freeze({route:'elbow',reversing:false,label:'Elbow · forward'}),
    'elbow-reverse':Object.freeze({route:'elbow',reversing:true,label:'Elbow · tail-led reverse'}),
    'serpentine-forward':Object.freeze({route:'serpentine',reversing:false,label:'Serpentine · forward'}),
    'serpentine-reverse':Object.freeze({route:'serpentine',reversing:true,label:'Serpentine · tail-led reverse'})
  });
  const names=Object.freeze(Object.keys(definitions));
  const vertices={
    elbow:[{x:2,y:1},{x:8,y:1},{x:8,y:7},{x:2,y:7}],
    serpentine:[
      {x:2,y:1},{x:8,y:1},{x:8,y:3},{x:4,y:3},
      {x:4,y:5},{x:8,y:5},{x:8,y:7},{x:2,y:7}
    ]
  };
  const copyPoint=p=>({x:p.x,y:p.y});
  const subtract=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
  const wrap=(index,size)=>(index%size+size)%size;

  function rotate(p,quarterTurns){
    let x=p.x-center.x;
    let y=p.y-center.y;
    for(let i=0;i<quarterTurns;i++) [x,y]=[-y,x];
    return {x:center.x+x,y:center.y+y};
  }

  function routeCells(route,quarterTurns){
    const corners=vertices[route];
    const path=[];
    for(let i=0;i<corners.length;i++){
      const from=corners[i];
      const to=corners[(i+1)%corners.length];
      const dx=Math.sign(to.x-from.x);
      const dy=Math.sign(to.y-from.y);
      const distance=Math.abs(to.x-from.x)+Math.abs(to.y-from.y);
      for(let j=0;j<distance;j++){
        path.push(rotate({x:from.x+dx*j,y:from.y+dy*j},quarterTurns));
      }
    }
    return path;
  }

  function bodyAt(state,index){
    return Array.from({length:state.length},(_,i)=>
      copyPoint(state.path[wrap(index-i,state.path.length)]));
  }

  function travelAt(state,index){
    const next=index+(state.reversing?-1:1);
    return subtract(
      state.path[wrap(next,state.path.length)],
      state.path[wrap(index,state.path.length)]
    );
  }

  function turnBetween(before,after){
    // Canvas coordinates have positive y downward.
    const cross=before.x*after.y-before.y*after.x;
    return cross>0?'clockwise':cross<0?'counterclockwise':null;
  }

  function advance(state,initial){
    const s=state.snake;
    const oldBody=s.body.map(copyPoint);
    const oldDir=copyPoint(s.dir);
    const wasReversing=s.reversing;
    const oldTravel=wasReversing
      ? {x:-oldDir.x,y:-oldDir.y}
      : copyPoint(oldDir);
    const oldDirection=copyPoint(state.direction);
    const oldTailDirection=copyPoint(state.tailDirection);
    state.index=wrap(state.index+(state.reversing?-1:1),state.path.length);
    s.body=bodyAt(state,state.index);
    state.previousBody=oldBody;
    state.previousDir=oldDir;
    state.previousHeadTravelDirection=oldTravel;
    state.previousDirection=oldDirection;
    state.direction=subtract(s.body[0],oldBody[0]);
    state.tailDirection=subtract(s.body.at(-1),oldBody.at(-1));
    state.event={
      headTurn:turnBetween(oldDirection,state.direction),
      tailTurn:turnBetween(oldTailDirection,state.tailDirection)
    };
    // In retreat the visible head still faces away from its neck. The tail,
    // not the head-facing vector, leads the prescribed movement.
    s.dir=s.body.length>1
      ? subtract(s.body[0],s.body[1])
      : state.reversing
        ? {x:-state.direction.x,y:-state.direction.y}
        : copyPoint(state.direction);
    if(state.reversing){
      s.reverseHeadOldRouteDir=subtract(oldBody[0],s.body[0]);
      s.tailGuide={...s.body.at(-1),dir:copyPoint(state.tailDirection)};
      s.reverseSteps++;
    }
    if(!initial){
      state.time+=state.delay;
      state.stepCount++;
    }
    state.adapter.recordStep(
      s,oldBody,state.time,state.delay,oldTravel,wasReversing
    );
    s.lastMove=state.time;
    return state;
  }

  function create(name,adapter,{length=5,quarterTurns=0}={}){
    const definition=Object.prototype.hasOwnProperty.call(definitions,name)
      ? definitions[name]
      : null;
    if(!definition) throw new RangeError(`Unknown snake-turn scenario: ${name}`);
    if(!adapter||typeof adapter.recordStep!=='function'||
       !Number.isFinite(adapter.delay)||adapter.delay<=0){
      throw new TypeError('Scenario adapter requires recordStep() and a positive delay.');
    }
    if(!Number.isInteger(length)||length<1||length>5){
      throw new RangeError('Snake-turn study length must be an integer from 1 to 5.');
    }
    if(!Number.isInteger(quarterTurns)){
      throw new RangeError('Scenario quarterTurns must be an integer.');
    }
    const rotation=wrap(quarterTurns,4);
    const state={
      name,label:definition.label,width,height,length,quarterTurns:rotation,
      reversing:definition.reversing,route:definition.route,
      path:routeCells(definition.route,rotation),
      index:definition.reversing?5:3,time:1000,stepCount:0,
      delay:adapter.delay*(definition.reversing?2:1)
    };
    if(typeof adapter.configureCorridor==='function'){
      adapter.configureCorridor(state.path,width,height);
    }
    // Keep the external bridge out of snapshots shared by the two renderers.
    Object.defineProperty(state,'adapter',{value:adapter});
    const body=bodyAt(state,state.index);
    const seedDirection=travelAt(state,state.index-(state.reversing?-1:1));
    state.direction=seedDirection;
    state.tailDirection=travelAt(
      state,state.index-state.length+1-(state.reversing?-1:1)
    );
    state.snake={
      body,
      dir:body.length>1
        ? subtract(body[0],body[1])
        : state.reversing
          ? {x:-seedDirection.x,y:-seedDirection.y}
          : copyPoint(seedDirection),
      color:'#35e55b',__renderSpriteSet:'Green',
      reversing:state.reversing,reverseSteps:0,lastMove:state.time-state.delay
    };
    // Record one real movement at the initial positive timestamp so the first
    // paused frame already has the same visual history as subsequent frames.
    return advance(state,true);
  }

  function step(state){
    return advance(state,false);
  }

  global.MazeBitersTurnScenarios=Object.freeze({create,step,names,definitions});
})(globalThis);
