import {route,TILE} from './route.js';

const CREEP=.40;
const HEAD_START=.45;
const TAIL_END=.50;
const RAMP_FRACTION=.20;
const COMPRESSION_LIMIT=16;
const BODY_COMPRESSION_FRACTION=.30;

// The current grid route replaces each corner cell by one quarter-circle.
// Straight cells keep TILE distance; a corner cell uses its actual arc length.
// This preserves the existing arc-distance clock, not equal-duration game ticks.
function makeCells(){
  const lengths=[];
  for(const piece of route.pieces){
    const count=piece.type==='arc'?1:Math.round(piece.length/TILE);
    if(!(count>0)||(piece.type!=='arc'&&Math.abs(piece.length-count*TILE)>1e-6))
      throw new Error('Cell motion requires whole grid cells between rounded corners');
    for(let i=0;i<count;i++)lengths.push(piece.length/count);
  }
  function intervals(values){
    let start=0;
    return Object.freeze(values.map((length,index)=>{
      const end=index===values.length-1?route.total:start+length;
      const cell=Object.freeze({start,end,length:end-start,index});
      start=end;
      return cell;
    }));
  }
  return {forward:intervals(lengths),reverse:intervals([...lengths].reverse()),
    minLength:Math.min(...lengths)};
}
const CELLS=makeCells();

function settings(options){
  return {enabled:options.enabled??true,cells:options.reverse?CELLS.reverse:CELLS.forward};
}

function locate(distance,cells){
  const lap=Math.floor(distance/route.total);
  const wrapped=Math.max(0,Math.min(route.total,distance-lap*route.total));
  let low=0,high=cells.length-1;
  while(low<high){
    const middle=(low+high)>>1;
    if(wrapped<cells[middle].end)high=middle;else low=middle+1;
  }
  const cell=cells[low];
  return {cell,lap,phase:Math.max(0,Math.min(1,(wrapped-cell.start)/cell.length))};
}

// Integral of a flat-topped velocity stroke with raised-cosine ramps. Each
// ramp occupies 20% of the window; the middle 60% has constant velocity.
// Velocity and acceleration vanish at both window edges. The integral is C2
// through all four ramp/plateau joins, without a sharp central velocity peak.
function glide(phase,start,end){
  if(phase<=start)return {value:0,rate:0};
  if(phase>=end)return {value:1,rate:0};
  const t=(phase-start)/(end-start),r=RAMP_FRACTION,normalizer=1-r;
  if(t>=r&&t<=1-r)
    return {value:(t-r/2)/normalizer,rate:1/(normalizer*(end-start))};
  const u=t<r?t:1-t,angle=Math.PI*u/r;
  const integral=.5*(u-r/Math.PI*Math.sin(angle))/normalizer;
  return {value:t<r?integral:1-integral,
    rate:.5*(1-Math.cos(angle))/(normalizer*(end-start))};
}

function headState(distance,enabled,cells){
  const at=locate(distance,cells),headGlide=glide(at.phase,HEAD_START,1);
  const progress=CREEP*at.phase+(1-CREEP)*headGlide.value;
  return {...at,headGlide,
    headDistance:enabled?at.lap*route.total+at.cell.start+at.cell.length*progress:distance,
    headSpeedFactor:enabled?CREEP+(1-CREEP)*headGlide.rate:1};
}

// All lengths share exactly H(s). Tail catch-up is a relative displacement,
// never a second orientation/path calculation or a history-dependent spring.
// Tail catches first (phase 0..0.5), then the head releases that compression
// (phase 0.45..1). A small overlap blends the handoff; the nonzero baseline
// keeps all parts moving rather than reproducing the source game's full rest.
export function cellMotionState(distance,nominalLength,options={}){
  const {enabled,cells}=settings(options);
  const headSpan=options.headSpan??0,tailSpan=options.tailSpan??0;
  const minBodyGap=options.minBodyGap??4;
  if(!Number.isFinite(distance)||!Number.isFinite(nominalLength)||nominalLength<0||
     !Number.isFinite(headSpan)||headSpan<0||!Number.isFinite(tailSpan)||tailSpan<0||
     !Number.isFinite(minBodyGap)||!(minBodyGap>0))
    throw new Error('Invalid cell-motion distances');
  const head=headState(distance,enabled,cells);
  const ordinaryBodySpan=Math.max(0,nominalLength-headSpan-tailSpan);
  const availableCompression=Math.max(0,ordinaryBodySpan-minBodyGap);
  // A single cap for all cells avoids a displacement jump where metric cell
  // length changes. T'=creep+(1-creep-C/L)*headBump'+C/L*tailBump',
  // so C <= (1-creep)*minCellLength guarantees both speeds >= creep.
  // The material-span limit prevents a short body from collapsing. Such a
  // small body cannot support the same pronounced alternation as a long one.
  const maxCompression=enabled?Math.min(COMPRESSION_LIMIT,availableCompression,
    BODY_COMPRESSION_FRACTION*ordinaryBodySpan,(1-CREEP)*CELLS.minLength):0;
  const tailGlide=glide(head.phase,0,TAIL_END);
  const compression=maxCompression*(tailGlide.value-head.headGlide.value);
  const tailSpeedFactor=head.headSpeedFactor+maxCompression/head.cell.length*
    (tailGlide.rate-head.headGlide.rate);
  return {headDistance:head.headDistance,tailDistance:head.headDistance-nominalLength+compression,
    compression,maxCompression,headSpeedFactor:head.headSpeedFactor,tailSpeedFactor,
    cyclePhase:head.phase,cellPhase:head.phase,cellIndex:head.cell.index,
    cellCount:cells.length,cellDistance:head.cell.length};
}

// Every cell maps monotonically onto itself, so inverse lookup stays inside
// that exact cell, including negative distances, reverse travel, and lap joins.
// Head ownership and length never affect this inverse or the head waveform.
export function distanceForCellHead(headDistance,options={}){
  if(!Number.isFinite(headDistance))throw new Error('Invalid displayed head distance');
  const {enabled,cells}=settings(options);
  if(!enabled)return headDistance;
  const {cell,lap,phase:target}=locate(headDistance,cells);
  let low=0,high=1,t=target;
  for(let i=0;i<40;i++){
    const bump=glide(t,HEAD_START,1);
    const error=CREEP*t+(1-CREEP)*bump.value-target;
    if(Math.abs(error)<1e-13)break;
    if(error>0)high=t;else low=t;
    const next=t-error/(CREEP+(1-CREEP)*bump.rate);
    t=next>low&&next<high?next:(low+high)/2;
  }
  return lap*route.total+cell.start+cell.length*t;
}
