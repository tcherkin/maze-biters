/**
 * Measure authored poses without changing their pixels. All rectangles and
 * anchors use absolute source-image coordinates; rectangle ends are exclusive.
 * Grid boundaries are rounded once, so fractional cell sizes have no gaps.
 */
export function registerSheet(imageData,{cols=4,rows=2,attachment}={}){
  const {width,height,data}=imageData||{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
     !data||data.length!==width*height*4){
    throw new TypeError('Expected RGBA image data with positive integer dimensions.');
  }
  if(!Number.isInteger(cols)||!Number.isInteger(rows)||
     cols<1||rows<1||cols>width||rows>height){
    throw new RangeError('The sprite grid must contain nonempty integer cells.');
  }
  if(attachment!=='left'&&attachment!=='right'){
    throw new TypeError('Attachment must be "left" or "right".');
  }

  const frames=[];
  for(let row=0;row<rows;row++) for(let col=0;col<cols;col++){
    const index=row*cols+col;
    const x=Math.round(col*width/cols),right=Math.round((col+1)*width/cols);
    const y=Math.round(row*height/rows),bottom=Math.round((row+1)*height/rows);
    const cell={x,y,width:right-x,height:bottom-y};
    let minX=right,minY=bottom,maxX=x-1,maxY=y-1;
    for(let py=y;py<bottom;py++) for(let px=x;px<right;px++){
      if(data[(py*width+px)*4+3]<128) continue;
      minX=Math.min(minX,px);
      minY=Math.min(minY,py);
      maxX=Math.max(maxX,px);
      maxY=Math.max(maxY,py);
    }
    if(maxX<minX){
      throw new RangeError(`Sprite ${index} has no significant alpha pixels.`);
    }
    const bounds={x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};
    const anchorX=attachment==='left'?minX+8:maxX-8;
    if(anchorX<minX||anchorX>maxX){
      throw new RangeError(`Sprite ${index} is too narrow for an 8-pixel inset.`);
    }

    let runStart=-1,bestStart=-1,bestEnd=-1;
    for(let py=y;py<=bottom;py++){
      const opaque=py<bottom&&data[(py*width+anchorX)*4+3]>=200;
      if(opaque&&runStart<0) runStart=py;
      if(!opaque&&runStart>=0){
        if(py-runStart>bestEnd-bestStart){
          bestStart=runStart;
          bestEnd=py;
        }
        runStart=-1;
      }
    }
    if(bestStart<0){
      throw new RangeError(`Sprite ${index} has no opaque attachment run.`);
    }
    const anchor={x:anchorX,y:(bestStart+bestEnd)/2,diameter:bestEnd-bestStart};
    // anchor.x is the geometric cut edge for either attachment direction.
    // Keeping the remaining cell extent preserves every other pose pixel.
    const sourceRect=attachment==='left'
      ?{x:anchorX,y,width:right-anchorX,height:bottom-y}
      :{x,y,width:anchorX-x,height:bottom-y};
    if(sourceRect.width<1){
      throw new RangeError(`Sprite ${index} has no pixels beyond its attachment.`);
    }
    frames.push({index,cell,bounds,anchor,sourceRect});
  }
  return frames;
}
