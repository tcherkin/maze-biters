// Isolated dead-end fixtures. Painter copied from the frozen maze study;
// the production wall artwork, neighbour masks, palette, and floor stay intact.
export const CELL = 36;
export const WORLD_WIDTH = 21 * CELL, WORLD_HEIGHT = 15 * CELL;
export const MAZE_ATLAS_URL = './assets/game-maze-pipes.png';
const COLUMNS = 21, ROWS = 15, HUE = 248, PALETTE_ROW = 2, SPRITE_SIZE = 160;
const WALL_STEPS = [
  {dx: 0, dy: -1, bit: 1, opposite: 4}, {dx: 1, dy: 0, bit: 2, opposite: 8},
  {dx: 0, dy: 1, bit: 4, opposite: 1}, {dx: -1, dy: 0, bit: 8, opposite: 2}
];

function makeFixture(variant) {
  const roomLeft = variant === 'narrow' ? 5 : 14;
  const mutableGrid = Array.from({length: ROWS}, () => Array(COLUMNS).fill('#'));
  for (let x = 1; x <= 17; x++) mutableGrid[7][x] = '.';
  for (let y = 6; y <= 8; y++) for (let x = roomLeft; x <= roomLeft + 3; x++) mutableGrid[y][x] = '.';
  const grid = Object.freeze(mutableGrid.map(row => row.join('')));
  const isWall = (x, y) => grid[y]?.[x] === '#';
  const blocks = Array.from({length: ROWS - 1}, (_, y) =>
    Array.from({length: COLUMNS - 1}, (_, x) =>
      isWall(x, y) && isWall(x + 1, y) && isWall(x, y + 1) && isWall(x + 1, y + 1)));
  const blockAt = (x, y) => !!blocks[y]?.[x];
  const territory = Array.from({length: ROWS}, (_, y) =>
    Array.from({length: COLUMNS}, (_, x) => isWall(x, y) && (
      blockAt(x, y) || blockAt(x - 1, y) || blockAt(x, y - 1) || blockAt(x - 1, y - 1))));
  const masks = Array.from({length: ROWS}, () => Array(COLUMNS).fill(null));
  const connect = (x, y, nx, ny) => {
    const step = WALL_STEPS.find(s => s.dx === nx - x && s.dy === ny - y);
    if (!step) return;
    masks[y][x] = (masks[y][x] ?? 0) | step.bit;
    masks[ny][nx] = (masks[ny][nx] ?? 0) | step.opposite;
  };
  for (let y = 0; y < ROWS - 1; y++) for (let x = 0; x < COLUMNS - 1; x++) {
    if (!blockAt(x, y)) continue;
    if (!blockAt(x, y - 1)) connect(x, y, x + 1, y);
    if (!blockAt(x + 1, y)) connect(x + 1, y, x + 1, y + 1);
    if (!blockAt(x, y + 1)) connect(x + 1, y + 1, x, y + 1);
    if (!blockAt(x - 1, y)) connect(x, y + 1, x, y);
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) {
    if (!isWall(x, y) || territory[y][x]) continue;
    masks[y][x] ??= 0;
    for (const step of WALL_STEPS) {
      const nx = x + step.dx, ny = y + step.dy;
      if (!isWall(nx, ny)) continue;
      if (step.dx === 1 || step.dy === 1 || territory[ny][nx]) connect(x, y, nx, ny);
    }
  }
  return Object.freeze({
    variant, grid, masks: Object.freeze(masks.map(Object.freeze)),
    blocks: Object.freeze(blocks.map(Object.freeze)), isWall, blockAt,
    corridorY: 7.5 * CELL,
    turnCenter: Object.freeze({x: (roomLeft + 2) * CELL, y: 7.5 * CELL}),
    stopSeam: Object.freeze({x: 17 * CELL, y: 7.5 * CELL}),
    roomCells: Object.freeze({left: roomLeft, right: roomLeft + 3, top: 6, bottom: 8}),
    roomBounds: Object.freeze({left: roomLeft * CELL, right: (roomLeft + 4) * CELL,
      top: 6 * CELL, bottom: 9 * CELL}),
    capColumn: 18
  });
}

export const DEAD_END_FIXTURES = Object.freeze({narrow: makeFixture('narrow'), wide: makeFixture('wide')});
export const DEAD_END_GRIDS = Object.freeze({narrow: DEAD_END_FIXTURES.narrow.grid, wide: DEAD_END_FIXTURES.wide.grid});
export const TURN_CENTERS = Object.freeze({narrow: DEAD_END_FIXTURES.narrow.turnCenter, wide: DEAD_END_FIXTURES.wide.turnCenter});

export function isDeadEndWall(x, y, variant = 'narrow') {
  const fixture = DEAD_END_FIXTURES[variant];
  if (!fixture) throw new Error(`Unknown dead-end fixture: ${variant}`);
  return fixture.grid[y]?.[x] !== '.';
}

function floor(c, fixture) {
  const {isWall} = fixture, w = WORLD_WIDTH, h = WORLD_HEIGHT;
  const depth = c.createRadialGradient(w * .5, h * .43, CELL * 1.5, w * .5, h * .48, Math.max(w, h) * .72);
  depth.addColorStop(0, `hsl(${HUE},58%,4.8%)`);
  depth.addColorStop(.58, `hsl(${HUE},54%,3%)`);
  depth.addColorStop(1, `hsl(${HUE},48%,1.2%)`);
  c.fillStyle = depth; c.fillRect(0, 0, w, h);
  const drift = c.createLinearGradient(0, h, w, 0);
  drift.addColorStop(0, `hsla(${HUE},78%,28%,0)`);
  drift.addColorStop(.52, `hsla(${HUE},78%,28%,.035)`);
  drift.addColorStop(1, `hsla(${HUE},78%,28%,0)`);
  c.fillStyle = drift; c.fillRect(0, 0, w, h);
  c.save(); c.beginPath();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) {
    if (isWall(x, y)) continue;
    const cx = (x + .5) * CELL, cy = (y + .5) * CELL;
    if (x + 1 < COLUMNS && !isWall(x + 1, y)) {c.moveTo(cx, cy); c.lineTo(cx + CELL, cy);}
    if (y + 1 < ROWS && !isWall(x, y + 1)) {c.moveTo(cx, cy); c.lineTo(cx, cy + CELL);}
  }
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [width, color] of [
    [15, `hsla(${HUE},88%,11.2%,.72)`], [11, `hsla(${HUE},84%,7.7%,.78)`],
    [7, `hsla(${HUE},72%,4.55%,.86)`], [3, `hsla(${HUE},56%,1.75%,.94)`],
    [.9, 'rgba(0,0,0,.98)']
  ]) {c.lineWidth = width * CELL / 16; c.strokeStyle = color; c.stroke();}
  c.restore();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) {
    if (isWall(x, y)) continue;
    const hash = (x * 73 + y * 151 + HUE * 7) >>> 0;
    if (hash % 6 !== 0) continue;
    c.fillStyle = `hsla(${HUE},78%,70%,${.09 + ((hash >>> 8) % 4) * .018})`;
    c.fillRect((x + (3 + hash % 10) / 16) * CELL,
      (y + (3 + ((hash >>> 4) % 10)) / 16) * CELL, CELL / 16, CELL / 16);
  }
}

function fillTerritories(c, fixture) {
  const {blockAt} = fixture, overlap = 3 * CELL / 16;
  c.save(); c.beginPath();
  for (let y = 0; y < ROWS - 1; y++) for (let x = 0; x < COLUMNS - 1; x++) {
    if (blockAt(x, y)) c.rect((x + .5) * CELL - overlap, (y + .5) * CELL - overlap,
      CELL + overlap * 2, CELL + overlap * 2);
  }
  c.fillStyle = `hsl(${HUE},48%,1.1%)`; c.fill(); c.clip();
  c.beginPath();
  for (let y = 0; y < ROWS - 1; y++) for (let x = 0; x < COLUMNS - 1; x++) {
    if (!blockAt(x, y)) continue;
    const left = (x + .5) * CELL - overlap, top = (y + .5) * CELL - overlap;
    const right = (x + 1.5) * CELL + overlap, bottom = (y + 1.5) * CELL + overlap;
    if (!blockAt(x, y - 1)) {c.moveTo(left, top); c.lineTo(right, top);}
    if (!blockAt(x + 1, y)) {c.moveTo(right, top); c.lineTo(right, bottom);}
    if (!blockAt(x, y + 1)) {c.moveTo(right, bottom); c.lineTo(left, bottom);}
    if (!blockAt(x - 1, y)) {c.moveTo(left, bottom); c.lineTo(left, top);}
  }
  c.lineCap = 'square'; c.lineJoin = 'miter';
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    c.lineWidth = CELL * (1.1 * (1 - t) + .025 * t);
    c.strokeStyle = `hsl(${HUE},${58 + 10 * t}%,${2.2 + 12.8 * t}%)`; c.stroke();
  }
  c.restore();
}

// The owning study caches this static painter once per variant at its chosen
// backing resolution; animation frames only blit that existing background.
export function drawDeadEndMaze(c, atlas, variant = 'narrow') {
  if (!atlas || !(atlas.naturalWidth || atlas.width)) throw new Error('Game maze atlas has not loaded');
  const fixture = DEAD_END_FIXTURES[variant];
  if (!fixture) throw new Error(`Unknown dead-end fixture: ${variant}`);
  c.save();
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  floor(c, fixture); fillTerritories(c, fixture);
  c.filter = 'brightness(78%) contrast(120%)';
  c.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in c) c.imageSmoothingQuality = 'high';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) {
    const mask = fixture.masks[y][x];
    if (mask === null) continue;
    c.drawImage(atlas, mask * SPRITE_SIZE, PALETTE_ROW * SPRITE_SIZE, SPRITE_SIZE, SPRITE_SIZE,
      x * CELL, y * CELL, CELL, CELL);
  }
  c.restore();
}
