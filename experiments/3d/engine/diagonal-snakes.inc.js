  // Steering follows the physical leading end, including after a split or a
  // retreat. The old failed route is memory, not the head's current heading.
  function experimentSnakeHeading(s,tail=false){
    const body=s.body;
    if(body.length<2)return tail?{x:-s.dir.x,y:-s.dir.y}:s.dir;
    const end=tail?body.at(-1):body[0],next=tail?body.at(-2):body[1];
    return {x:end.x-next.x,y:end.y-next.y};
  }
  function experimentSnakeTurnAllowed(heading,d){
    return !!d&&heading.x*d.x+heading.y*d.y>=0;
  }
  function experimentSnakeTurnOptions(heading,options){
    const legal=options.filter(d=>experimentSnakeTurnAllowed(heading,d));
    // On the eight compass directions positive dot + nonzero cross means
    // exactly 45 degrees. Keep straight travel; use 90 only without a 45 exit.
    const gentle=legal.some(d=>heading.x*d.x+heading.y*d.y>0&&heading.x*d.y-heading.y*d.x!==0);
    return gentle?legal.filter(d=>heading.x*d.x+heading.y*d.y>0):legal;
  }

  // A diagonal crosses the interiors of two neighbouring cells as well as its
  // destination. Use the same body/obstacle rules for all three, including
  // retreat and the solitary head's remembered route.
  function experimentSnakeStepOpen(origin,d,s,ignoreTail=true){
    if(!experimentStepOpen(origin,d,
      (x,y)=>canEnter(x,y,s,ignoreTail))) return false;
    if(!d.x||!d.y) return true;
    // A player may occupy the destination (a real bite), but a flank contact
    // must not be skipped while the head travels between cell centres.
    if(playerAt(origin.x+d.x,origin.y)||playerAt(origin.x,origin.y+d.y)) return false;

    const destination={x:origin.x+d.x,y:origin.y+d.y};
    for(const other of snakes){
      for(let i=1;i<other.body.length;i++){
        const a=other.body[i-1],b=other.body[i];
        // Destination occupancy alone cannot describe an X intersection of
        // two diagonal body edges. Reject their interior intersection too.
        if(experimentSnakeEdgesCross(origin,destination,a,b)) return false;
      }
    }
    return true;
  }

  function experimentSnakeEdgesCross(a,b,c,d){
    const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y;
    const divisor=rx*sy-ry*sx;
    if(Math.abs(divisor)<1e-9) return false;
    const qx=c.x-a.x,qy=c.y-a.y;
    const t=(qx*sy-qy*sx)/divisor;
    const u=(qx*ry-qy*rx)/divisor;
    return t>1e-9&&t<1-1e-9&&u>1e-9&&u<1-1e-9;
  }

  // Dijkstra rather than breadth-first search: a diagonal covers sqrt(2)
  // cells of distance. The cached field therefore measures real travel, not
  // a count of key presses, and cannot promise a route through a wall corner.
  function experimentBuildRouteField(target,cellIsOpen){
    const field=new Float64Array(COLS*ROWS);
    field.fill(-1);
    const heap=[];
    const push=(entry)=>{
      let i=heap.length;
      heap.push(entry);
      while(i>0){
        const parent=(i-1)>>1;
        if(heap[parent].distance<=entry.distance) break;
        heap[i]=heap[parent];
        i=parent;
      }
      heap[i]=entry;
    };
    const pop=()=>{
      const first=heap[0],last=heap.pop();
      if(heap.length){
        let i=0;
        while(i*2+1<heap.length){
          let child=i*2+1;
          if(child+1<heap.length&&
             heap[child+1].distance<heap[child].distance) child++;
          if(heap[child].distance>=last.distance) break;
          heap[i]=heap[child];
          i=child;
        }
        heap[i]=last;
      }
      return first;
    };
    const inBounds=(x,y)=>x>=0&&y>=0&&x<COLS&&y<ROWS;
    const open=(x,y)=>inBounds(x,y)&&cellIsOpen(x,y);
    if(!inBounds(target.x,target.y)) return field;
    field[target.y*COLS+target.x]=0;
    push({x:target.x,y:target.y,distance:0});
    while(heap.length){
      const cell=pop(),cellIndex=cell.y*COLS+cell.x;
      if(cell.distance>field[cellIndex]+1e-9) continue;
      for(const d of experimentDirections){
        if(!experimentStepOpen(cell,d,open)) continue;
        const x=cell.x+d.x,y=cell.y+d.y,index=y*COLS+x;
        const distance=cell.distance+experimentStepLength(d);
        if(field[index]>=0&&field[index]<=distance+1e-9) continue;
        field[index]=distance;
        push({x,y,distance});
      }
    }
    return field;
  }

  function experimentSnakeTravelLength(oldBody,newBody,wasReversing){
    if(!oldBody.length||oldBody.length!==newBody.length) return 1;
    const same=(a,b)=>a.x===b.x&&a.y===b.y;
    const forward=newBody.slice(1).every((cell,i)=>same(cell,oldBody[i]));
    const reverse=newBody.slice(0,-1).every((cell,i)=>same(cell,oldBody[i+1]));
    // The decision can change reverse mode on this very tick. Inspect the
    // actual topology shift before using the mode as a stationary fallback.
    const tailLed=reverse&&!forward || reverse===forward&&wasReversing;
    const index=tailLed?oldBody.length-1:0;
    const dx=newBody[index].x-oldBody[index].x;
    const dy=newBody[index].y-oldBody[index].y;
    return Math.max(1,Math.hypot(dx,dy));
  }
