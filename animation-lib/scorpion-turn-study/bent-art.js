import {TILE} from './motion.js?v=1.02.03.00';
import {traceAlphaContours,beginContactShape,appendContactPolygon,simplifyContactPolygon} from '../../src/render/contact-shapes.js?v=1.02.03.00';

const SOURCE = 160, WIDTH = 320, SCALE = TILE / SOURCE;
const REAR = 48, FRONT = 224, SPAN = FRONT - REAR;
const TOP = 40, HEIGHT = 80, GUARD = 2, STRIPS = 32;
const OVERLAP = .16, MITER_LIMIT = .6;
let loading, loadedAtlas, currentRenderer, resourceCollector = null;

// Source contour excludes the leg roots outside the armored shaft and shell.
// The hooked stinger ends before x48; the face and pincer roots start at224.
const TOP_PROFILE = [
  46,63, 80,62, 96,60, 104,59, 108,57, 112,57, 116,54, 120,52,
  124,50, 128,50, 132,47, 136,46, 140,44, 144,44, 148,44, 152,44,
  156,45, 160,46, 164,49, 168,51, 172,56, 176,52, 180,49,
  184,47, 188,47, 192,46, 196,44, 200,44, 208,46, 216,49,
  220,52, 224,55, 226,56
];

function shellTop(x) {
  if (x <= TOP_PROFILE[0]) return TOP_PROFILE[1];
  for (let i = 2; i < TOP_PROFILE.length; i += 2) {
    if (x <= TOP_PROFILE[i]) {
      const t = (x - TOP_PROFILE[i - 2]) / (TOP_PROFILE[i] - TOP_PROFILE[i - 2]);
      return TOP_PROFILE[i - 1] + t * (TOP_PROFILE[i + 1] - TOP_PROFILE[i - 1]);
    }
  }
  return TOP_PROFILE[TOP_PROFILE.length - 1];
}

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width; result.height = height;
  if (resourceCollector) resourceCollector.push(result);
  return result;
}

function extractLegs(pixels) {
  const seen = new Uint8Array(WIDTH * SOURCE), queue = new Int32Array(WIDTH * SOURCE);
  const components = [], owner = new Uint8Array(WIDTH * SOURCE);
  for (let side = 0; side < 2; side++) {
    const firstY = side ? 116 : 0, lastY = side ? 159 : 43;
    for (let y = firstY; y <= lastY; y++) for (let x = 88; x < 226; x++) {
      const seed = y * WIDTH + x;
      if (seen[seed] || pixels[seed * 4 + 3] < 32) continue;
      let read = 0, count = 1, minX = x, maxX = x, minY = y, maxY = y;
      queue[0] = seed; seen[seed] = 1;
      while (read < count) {
        const index = queue[read++], py = Math.floor(index / WIDTH), px = index % WIDTH;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy, next = ny * WIDTH + nx;
          if (nx < 88 || nx >= 226 || ny < firstY || ny > lastY ||
              seen[next] || pixels[next * 4 + 3] < 32) continue;
          seen[next] = 1; queue[count++] = next;
        }
      }
      if (count < 24) continue;
      const label = components.length + 1;
      for (let i = 0; i < count; i++) {
        owner[queue[i]] = label;
      }
      components.push({side, minX, maxX, minY, maxY});
    }
  }

  // Grow all eight disconnected feet toward their own roots simultaneously.
  // A shared ownership map prevents a rectangular crop from carrying a second
  // leg or a piece of neighboring armor when the body makes a deep U.
  const rootGuard = 2;
  function inRootBand(x, y, side) {
    return x >= 88 && x < 226 && y >= 0 && y < SOURCE &&
      (side ? y >= SOURCE - shellTop(x) - rootGuard : y <= shellTop(x) + rootGuard);
  }
  let read = 0, count = 0;
  for (let index = 0; index < owner.length; index++) if (owner[index]) queue[count++] = index;
  while (read < count) {
    const index = queue[read++], label = owner[index], component = components[label - 1];
    const x = index % WIDTH, y = Math.floor(index / WIDTH);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, next = ny * WIDTH + nx;
      if (!inRootBand(nx, ny, component.side) || owner[next] || pixels[next * 4 + 3] < 32) continue;
      owner[next] = label; queue[count++] = next;
    }
  }
  // Preserve the original antialias fringe, but do not adopt disconnected dust.
  const solidCount = count;
  for (let i = 0; i < solidCount; i++) {
    const index = queue[i], label = owner[index], component = components[label - 1];
    const x = index % WIDTH, y = Math.floor(index / WIDTH);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, next = ny * WIDTH + nx;
      if (!inRootBand(nx, ny, component.side) || owner[next] || !pixels[next * 4 + 3]) continue;
      owner[next] = label;
    }
  }

  const legs = [];
  for (let i = 0; i < components.length; i++) {
      const label = i + 1, component = components[i];
      let minX = WIDTH, maxX = 0, minY = SOURCE, maxY = 0, rootTotal = 0, rootCount = 0;
      for (let index = 0; index < owner.length; index++) {
        if (owner[index] !== label) continue;
        const x = index % WIDTH, y = Math.floor(index / WIDTH);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        const edge = component.side ? SOURCE - shellTop(x) : shellTop(x);
        if (Math.abs(y - edge) <= rootGuard && pixels[index * 4 + 3] >= 32) {
          rootTotal += x; rootCount++;
        }
      }
      const anchor = rootCount ? rootTotal / rootCount : (component.minX + component.maxX) / 2;
      minX = Math.max(88, minX - 1); maxX = Math.min(225, maxX + 1);
      minY = Math.max(0, minY - 1); maxY = Math.min(SOURCE - 1, maxY + 1);
      const image = canvas(maxX - minX + 1, maxY - minY + 1);
      const context = image.getContext('2d'), data = context.createImageData(image.width, image.height);
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const index = y * WIDTH + x;
        if (owner[index] !== label) continue;
        const source = index * 4, destination = ((y - minY) * image.width + x - minX) * 4;
        data.data.set(pixels.subarray(source, source + 4), destination);
      }
      context.putImageData(data, 0, 0);
      legs.push({image, anchor, x: minX, y: minY,
        contact:traceAlphaContours(data,{threshold:32,tolerance:.5,id:`scorpion-leg-${i}`})});
  }
  return legs;
}

function cacheFrame(atlas, frame) {
  const whole = canvas(WIDTH, SOURCE), context = whole.getContext('2d');
  const headX = (frame * 8 + 2) * SOURCE, tailX = headX + SOURCE;
  context.drawImage(atlas, tailX, 0, SOURCE, SOURCE, 0, 0, SOURCE, SOURCE);
  context.drawImage(atlas, headX, 0, SOURCE, SOURCE, SOURCE, 0, SOURCE, SOURCE);
  const pixels = context.getImageData(0, 0, WIDTH, SOURCE).data;
  const legs = extractLegs(pixels);
  const rear = canvas(REAR, SOURCE), front = canvas(WIDTH - FRONT, SOURCE);
  rear.getContext('2d').drawImage(atlas, tailX, 0, REAR, SOURCE, 0, 0, REAR, SOURCE);
  front.getContext('2d').drawImage(atlas, headX + FRONT - SOURCE, 0,
    WIDTH - FRONT, SOURCE, 0, 0, WIDTH - FRONT, SOURCE);
  const body = canvas(SPAN + GUARD * 2, HEIGHT), bodyContext = body.getContext('2d');
  const bodyPixels = bodyContext.createImageData(body.width, body.height);
  for (let x = 0; x < body.width; x++) {
    const sourceX = REAR - GUARD + x, top = shellTop(sourceX), bottom = 160 - top;
    for (let y = 0; y < HEIGHT; y++) {
      const sourceY = TOP + y;
      if (sourceY < top || sourceY > bottom) continue;
      const source = (sourceY * WIDTH + sourceX) * 4, destination = (y * body.width + x) * 4;
      bodyPixels.data[destination] = pixels[source];
      bodyPixels.data[destination + 1] = pixels[source + 1];
      bodyPixels.data[destination + 2] = pixels[source + 2];
      bodyPixels.data[destination + 3] = pixels[source + 3];
    }
  }
  bodyContext.putImageData(bodyPixels, 0, 0);
  function crop(data,width,x,y,w,h){const result={width:w,height:h,data:new Uint8ClampedArray(w*h*4)};
    for(let row=0;row<h;row++)result.data.set(data.subarray(((row+y)*width+x)*4,((row+y)*width+x+w)*4),row*w*4);return result;}
  const contact={
    whole:traceAlphaContours({width:WIDTH,height:SOURCE,data:pixels},{threshold:32,tolerance:.5,id:'scorpion-whole'}),
    rear:traceAlphaContours(crop(pixels,WIDTH,0,0,REAR,SOURCE),{threshold:32,tolerance:.5,id:'scorpion-stinger'}),
    front:traceAlphaContours(crop(pixels,WIDTH,FRONT,0,WIDTH-FRONT,SOURCE),{threshold:32,tolerance:.5,id:'scorpion-claws'}),
    body:traceAlphaContours(crop(bodyPixels.data,body.width,GUARD,0,SPAN,HEIGHT),{threshold:32,tolerance:.125,id:'scorpion-body'})
  };
  // Split contour edges wherever the renderer switches affine triangles.
  // Merely bending a few source vertices would chord across the actual mesh.
  const step=SPAN/STRIPS;
  for(const part of contact.body.parts){const result=[];
    for(let j=0;j<part.points.length;j++){
      const a=part.points[j],b=part.points[(j+1)%part.points.length],dx=b.x-a.x,dy=b.y-a.y,ts=[0];
      for(let strip=0;strip<=STRIPS;strip++)if(Math.abs(dx)>1e-10){const t=(strip*step-a.x)/dx;if(t>1e-8&&t<1-1e-8)ts.push(t);}
      for(let strip=0;strip<STRIPS;strip++){
        const denominator=dx/step-dy/HEIGHT;if(Math.abs(denominator)<1e-10)continue;
        const t=(a.y/HEIGHT-(a.x-strip*step)/step)/denominator,x=a.x+t*dx;
        if(t>1e-8&&t<1-1e-8&&x>strip*step+1e-8&&x<(strip+1)*step-1e-8)ts.push(t);
      }
      ts.sort((x,y)=>x-y);let last=-1;
      for(const t of ts)if(t-last>1e-8){result.push({x:a.x+t*dx,y:a.y+t*dy});last=t;}
    }part.points=result;
  }
  return {whole, rear, front, body, legs,contact};
}

function expand(out, index, x, y, previousX, previousY, nextX, nextY) {
  const dx = x - previousX, dy = y - previousY, ex = nextX - x, ey = nextY - y;
  const inverse = 1 / Math.hypot(dx, dy), inverseNext = 1 / Math.hypot(ex, ey);
  const nx = dy * inverse, ny = -dx * inverse, px = ey * inverseNext, py = -ex * inverseNext;
  let amount = OVERLAP / Math.max(1e-8, 1 + nx * px + ny * py);
  const length = Math.hypot(nx + px, ny + py) * amount;
  if (length > MITER_LIMIT) amount *= MITER_LIMIT / length;
  out[index] = x + (nx + px) * amount; out[index + 1] = y + (ny + py) * amount;
}

function triangle(ctx, image, scratch, ax, ay, bx, by, cx, cy, a, b, c, d, e, f) {
  expand(scratch, 0, ax, ay, cx, cy, bx, by);
  expand(scratch, 2, bx, by, ax, ay, cx, cy);
  expand(scratch, 4, cx, cy, bx, by, ax, ay);
  ctx.save(); ctx.beginPath();
  ctx.moveTo(scratch[0], scratch[1]); ctx.lineTo(scratch[2], scratch[3]);
  ctx.lineTo(scratch[4], scratch[5]); ctx.closePath(); ctx.clip();
  ctx.transform(a, b, c, d, e, f); ctx.drawImage(image, 0, 0); ctx.restore();
}

function rigid(ctx, image, point, x, y) {
  ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(point.angle);
  ctx.drawImage(image, x * SCALE, y * SCALE, image.width * SCALE, image.height * SCALE);
  ctx.restore();
}

function createRenderer(atlas) {
  const resources = [], previousCollector = resourceCollector;
  let frames;
  resourceCollector = resources;
  try { frames = [cacheFrame(atlas, 0), cacheFrame(atlas, 1)]; }
  catch (error) {
    for (const resource of resources) resource.width = resource.height = 1;
    throw error;
  } finally { resourceCollector = previousCollector; }
  let valid = true, disposed = false;
  const invalidate = () => { valid = false; };
  for (const resource of resources) resource.addEventListener?.('contextlost', invalidate);
  function dispose() {
    if (disposed) return;
    disposed = true; valid = false;
    for (const resource of resources) {
      resource.removeEventListener?.('contextlost', invalidate);
      resource.width = resource.height = 1;
    }
  }
  const samples = Array.from({length: STRIPS + 1}, () => ({}));
  const edges = new Float64Array((STRIPS + 1) * 4), scratch = new Float64Array(6), legPoint = {};
  const sourceStep = SPAN / STRIPS, halfWidth = HEIGHT * SCALE / 2;
  const maximumContour=Math.max(0,...frames.flatMap(frame=>frame.contact.body.parts.map(part=>part.points.length)));
  const contactScratch={keep:new Uint8Array(maximumContour),stack:new Int32Array(maximumContour*4)};

  function sampleMesh(pose) {
    if (typeof pose.sample !== 'function') throw new TypeError('Bent art requires pose.sample(offset, out).');
    let straight = true;
    for (let i = 0; i <= STRIPS; i++) {
      const sourceX = REAR + i * sourceStep;
      const point = pose.sample((sourceX - SOURCE) * SCALE, samples[i]);
      const nx = -point.ty * halfWidth, ny = point.tx * halfWidth, offset = i * 4;
      edges[offset] = point.x - nx; edges[offset + 1] = point.y - ny;
      edges[offset + 2] = point.x + nx; edges[offset + 3] = point.y + ny;
      if (i && (Math.abs(point.tx - samples[0].tx) > 1e-8 ||
          Math.abs(point.ty - samples[0].ty) > 1e-8)) straight = false;
    }
    return straight;
  }
  function draw(ctx, pose) {
    if (!valid) return false;
    const art = frames[pose.frame & 1],straight=sampleMesh(pose);
    if (straight) {
      // Exact native artwork on straight approach/departure, including all
      // antialiased detail that may sit outside the isolated bend masks.
      rigid(ctx, art.whole, samples[0], -REAR, -SOURCE / 2);
      return true;
    }
    for (let i = 0; i < art.legs.length; i++) {
      const leg = art.legs[i];
      const point = pose.sample((leg.anchor - SOURCE) * SCALE, legPoint);
      rigid(ctx, leg.image, point, leg.x - leg.anchor, leg.y - SOURCE / 2);
    }
    rigid(ctx, art.rear, samples[0], -REAR, -SOURCE / 2);
    rigid(ctx, art.front, samples[STRIPS], 0, -SOURCE / 2);

    // One exterior clip permits overlapping triangles to cover raster seams
    // without painting beyond the actual continuously curved ribbon.
    ctx.save(); ctx.beginPath(); ctx.moveTo(edges[0], edges[1]);
    for (let i = 1; i <= STRIPS; i++) ctx.lineTo(edges[i * 4], edges[i * 4 + 1]);
    for (let i = STRIPS; i >= 0; i--) ctx.lineTo(edges[i * 4 + 2], edges[i * 4 + 3]);
    ctx.closePath(); ctx.clip();
    for (let i = 0; i < STRIPS; i++) {
      const offset = i * 4, next = offset + 4, sourceX = GUARD + i * sourceStep;
      const ax = edges[offset], ay = edges[offset + 1], dx = edges[offset + 2], dy = edges[offset + 3];
      const bx = edges[next], by = edges[next + 1], cx = edges[next + 2], cy = edges[next + 3];
      const a1 = (bx - ax) / sourceStep, b1 = (by - ay) / sourceStep;
      triangle(ctx, art.body, scratch, ax, ay, bx, by, cx, cy, a1, b1,
        (cx - bx) / HEIGHT, (cy - by) / HEIGHT, ax - a1 * sourceX, ay - b1 * sourceX);
      const a2 = (cx - dx) / sourceStep, b2 = (cy - dy) / sourceStep;
      triangle(ctx, art.body, scratch, ax, ay, cx, cy, dx, dy, a2, b2,
        (dx - ax) / HEIGHT, (dy - ay) / HEIGHT, ax - a2 * sourceX, ay - b2 * sourceX);
    }
    ctx.restore();
    return true;
  }

  function geometry(pose,{scale=1}={},out={}){
    if(!valid)return null;const art=frames[pose.frame&1],straight=sampleMesh(pose);beginContactShape(out);
    function rigidContact(cached,point,x,y,role){
      const cos=Math.cos(point.angle),sin=Math.sin(point.angle);
      for(const part of cached.parts)appendContactPolygon(out,part.id,part.points,(p,q)=>{
        const px=(p.x+x)*SCALE,py=(p.y+y)*SCALE;
        q.x=(point.x+cos*px-sin*py)*scale;q.y=(point.y+sin*px+cos*py)*scale;
      },{role});
    }
    if(straight)rigidContact(art.contact.whole,samples[0],-REAR,-SOURCE/2,'scorpion');
    else{
      for(const leg of art.legs){pose.sample((leg.anchor-SOURCE)*SCALE,legPoint);rigidContact(leg.contact,legPoint,leg.x-leg.anchor,leg.y-SOURCE/2,'leg');}
      rigidContact(art.contact.rear,samples[0],-REAR,-SOURCE/2,'tail');
      rigidContact(art.contact.front,samples[STRIPS],0,-SOURCE/2,'head');
      for(const part of art.contact.body.parts){const mapped=appendContactPolygon(out,part.id,part.points,(p,q)=>{
        const x=Math.max(0,Math.min(SPAN,p.x)),strip=Math.min(STRIPS-1,Math.floor(x/sourceStep));
        const u=(x-strip*sourceStep)/sourceStep,v=p.y/HEIGHT,i=strip*4,n=i+4;
        const ax=edges[i],ay=edges[i+1],dx=edges[i+2],dy=edges[i+3];
        const bx=edges[n],by=edges[n+1],cx=edges[n+2],cy=edges[n+3];
        q.x=(v<=u?ax+u*(bx-ax)+v*(cx-bx):ax+u*(cx-dx)+v*(dx-ax))*scale;
        q.y=(v<=u?ay+u*(by-ay)+v*(cy-by):ay+u*(cy-dy)+v*(dy-ay))*scale;
      },{role:'body'});simplifyContactPolygon(mapped,.25*SCALE*scale,contactScratch);}
    }
    out.frame=pose.frame&1;out.straight=straight;out.alphaThreshold=32;out.discreteFrames=true;
    out.tolerance=.5*SCALE*scale;return out;
  }

  return Object.freeze({draw, geometry, contactStraight:sampleMesh, dispose, get valid() { return valid; },
    resources: Object.freeze(resources.slice()), stats: Object.freeze({
    sourceWidth: atlas.naturalWidth, sourceHeight: atlas.naturalHeight,
    sourceCellSize: SOURCE, rearSource: REAR, frontSource: FRONT,
    flexibleSourceSpan: SPAN, flexibleWorldSpan: SPAN * SCALE,
    ribbonSourceHeight: HEIGHT, conservativeHalfWidth: halfWidth,
    curvatureLimit: 1 / halfWidth,
    cachedCanvases: 8 + frames[0].legs.length + frames[1].legs.length,
    legsPerFrame: Object.freeze([frames[0].legs.length, frames[1].legs.length]),
    strips: STRIPS, triangles: STRIPS * 2, torsoSamples: STRIPS + 1,
    maximumDrawCalls: STRIPS * 2 + 2 + Math.max(frames[0].legs.length, frames[1].legs.length),
    straightDrawCalls: 1, runtimeCanvasCreation: false, runtimePixelReads: false
  })});
}

export async function loadBentArt() {
  if (currentRenderer?.valid) return currentRenderer;
  if (!loading) loading = (async () => {
    if (!loadedAtlas) {
      const atlas = new Image();
      atlas.src = new URL('./assets/scorpion.png', import.meta.url).href;
      await atlas.decode();
      if (atlas.naturalWidth !== SOURCE * 16 || atlas.naturalHeight !== SOURCE) {
        throw new Error('Bent scorpion requires the original 2560 × 160 atlas.');
      }
      loadedAtlas = atlas;
    }
    const next = createRenderer(loadedAtlas);
    currentRenderer?.dispose();
    currentRenderer = next;
    return next;
  })().finally(() => { loading = null; });
  return loading;
}
