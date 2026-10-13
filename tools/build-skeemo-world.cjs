// Skeemo office — drawn tile by tile.
//
// Paints the whole office as pixel art on a 16px tile grid (42 x 24 tiles = 672 x 384 art pixels) and writes:
//   src/renderer/src/assets/govt/skeemo-office.png   backdrop (every art pixel is 3x3 so the GPU can downscale it cleanly)
//   src/renderer/src/assets/govt/skeemo-front.png    desk fronts + monitors, drawn OVER the seated staff
//   src/renderer/src/assets/govt/skeemo-layout.json  where everything is (desk seats, standing spots, walkable floor, notice board)
// The layout JSON is the single source of truth: scene/govt/layout.ts reads it.
//
//   node tools/build-skeemo-world.cjs [--preview out.png]
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');

const OUT = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'govt');
const T = 16, COLS = 42, ROWS = 24, W = COLS * T, H = ROWS * T, S = 3;

const P = {
  wall: '#f1e8d4', wallLo: '#e4d8bd', wallHi: '#f8f2e4', rail: '#8a5a37', railHi: '#a9764a', railLo: '#6b4429',
  floorA: '#eadcbf', floorB: '#e3d3b2', grout: '#d2c19c', floorShade: '#cdbb94',
  woodTop: '#d0975c', woodTopHi: '#e2ae72', woodTopLo: '#b8804a', woodFront: '#a8693a', woodFrontLo: '#8d5530', woodPost: '#7c4a28', woodPostHi: '#98623a',
  glow: '#f6c862', glowHi: '#ffe39a',
  ink: '#3a2e2a', dark: '#2c333d', darkHi: '#445060', screen: '#7fb6c8',
  sage: '#5d8b73', sageDk: '#3d6a56', sageLt: '#8fb5a0', chalk: '#2f4f43', cream: '#fbf5e4',
  navy: '#3b5978', navyHi: '#557a9e', navyLo: '#2a4059', chrome: '#b9c3cc', chromeLo: '#8c98a3',
  cork: '#c79f69', corkHi: '#d6b17c', corkLo: '#b58a55',
  pot: '#b8643c', potHi: '#cf7c52', potLo: '#8f4a2a', leaf: '#4d9b52', leafHi: '#6dbb6a', leafLo: '#337a3c',
  saffron: '#e8a33d', red: '#c0392b', redLo: '#8e2a2a', green: '#2f8f4a', white: '#ffffff',
  sky: '#bfe3f2', skyLo: '#9fd0e6', cloud: '#f4fbff',
};

const c = createCanvas(W * S, H * S);
const g = c.getContext('2d');
g.imageSmoothingEnabled = false;
g.scale(S, S);
const fc = createCanvas(W * S, H * S);
const fg = fc.getContext('2d');
fg.imageSmoothingEnabled = false;
fg.scale(S, S);

let ctx = g;
const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
const px = (x, y, col) => R(x, y, 1, 1, col);
// deterministic noise so rebuilds are byte-identical
let seed = 1337;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

// ─── 5x7 pixel font ─────────────────────────────────────────────────────────
const GLYPH = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.####|#....|#....|#....|#....|#....|.####',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.####|#....|#....|#.###|#...#|#...#|.###.', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '#####|..#..|..#..|..#..|..#..|..#..|#####',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
  3: '####.|....#|....#|.###.|....#|....#|####.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '.###.|#....|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|....#|.###.', '&': '.##..|#..#.|.##..|.#.##|#..#.|#..#.|.##.#',
  '-': '.....|.....|.....|#####|.....|.....|.....', '.': '.....|.....|.....|.....|.....|.##..|.##..', ' ': '.....|.....|.....|.....|.....|.....|.....',
};
const textWidth = (s, k = 1) => s.length * 6 * k - k;
function text(s, x, y, col, k = 1) {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const rows = (GLYPH[ch] ?? GLYPH[' ']).split('|');
    rows.forEach((row, ry) => [...row].forEach((v, rx) => { if (v === '#') R(cx + rx * k, y + ry * k, k, k, col); }));
    cx += 6 * k;
  }
}
const centered = (s, cx, y, col, k = 1) => text(s, Math.round(cx - textWidth(s, k) / 2), y, col, k);

// ─── layout (art pixels) ────────────────────────────────────────────────────
const DESK_X = { registration: 72, documents: 204, eligibility: 336, form: 468, help: 600 };
const DESK_W = 88;
const SEAT_Y = 172, FRONT_Y = 234;
const SIGN = { registration: 'REGISTRATION', documents: 'DOCUMENTS', eligibility: 'ELIGIBILITY', form: 'FORM', help: 'HELP' };
const NUM = { registration: '1', documents: '2', eligibility: '3', form: '4', help: '5' };
const REC = { x: 336, w: 168, seatY: 346, frontY: 382, top: 320 };
const BENCH_Y = 268, BENCH_X = [168, 336, 504];
const BOARD = { x: 16, y: 8, w: 224, h: 82 };

// ─── tiles ──────────────────────────────────────────────────────────────────
function floorTiles() {
  for (let ty = 7; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const x = tx * T, y = ty * T;
    R(x, y, T, T, (tx + ty) % 2 ? P.floorA : P.floorB);
    R(x, y, T, 1, P.grout); R(x, y, 1, T, P.grout);
    for (let i = 0; i < 5; i++) px(x + 2 + Math.floor(rnd() * 12), y + 2 + Math.floor(rnd() * 12), (tx + ty) % 2 ? P.floorB : P.floorA);
  }
  // soft shadow where the wall meets the floor
  R(0, 112, W, 3, P.floorShade); R(0, 115, W, 2, P.grout);
}

function wall() {
  R(0, 0, W, 112, P.wall);
  for (let x = 0; x < W; x += 24) R(x, 0, 1, 96, P.wallLo);       // faint panel seams
  R(0, 0, W, 2, P.wallHi);
  // dado rail + wainscot
  R(0, 92, W, 4, P.railHi); R(0, 96, W, 16, P.rail); R(0, 96, W, 1, P.railHi); R(0, 111, W, 1, P.railLo);
  for (let x = 0; x < W; x += 28) { R(x + 2, 99, 24, 11, P.railLo); R(x + 3, 100, 22, 9, P.rail); }
  // side walls
  R(0, 0, 6, H, P.railLo); R(W - 6, 0, 6, H, P.railLo); R(6, 0, 2, H, P.rail); R(W - 8, 0, 2, H, P.rail);
}

function windowAt(x, y, panes = 3) {
  const w = panes * 36 + 4, h = 56;
  R(x - 3, y - 3, w + 6, h + 6, P.railLo); R(x - 2, y - 2, w + 4, h + 4, P.rail);
  for (let i = 0; i < panes; i++) {
    const px0 = x + i * 36 + 2;
    R(px0, y, 32, h, P.sky); R(px0, y + 26, 32, h - 26, P.skyLo);
    R(px0 + 4, y + 8, 12, 4, P.cloud); R(px0 + 8, y + 5, 10, 4, P.cloud); R(px0 + 18, y + 15, 10, 3, P.cloud);
    R(px0, y + h - 8, 32, 8, '#7fb98a'); R(px0 + 6, y + h - 12, 8, 4, '#6aa77a'); // hills
    R(px0 + 31, y, 1, h, P.rail);
  }
  R(x, y + h, w, 4, P.railHi); R(x - 4, y + h + 3, w + 8, 3, P.railLo);
}

function clock(cx, cy) {
  for (let yy = -9; yy <= 9; yy++) for (let xx = -9; xx <= 9; xx++) { const d = xx * xx + yy * yy; if (d <= 81) px(cx + xx, cy + yy, d > 64 ? P.railLo : P.cream); }
  px(cx, cy, P.ink); R(cx, cy - 6, 1, 6, P.ink); R(cx, cy, 5, 1, P.ink);
  for (const [dx, dy] of [[0, -7], [7, 0], [0, 7], [-7, 0]]) px(cx + dx, cy + dy, P.ink);
}

function plant(cx, baseY, big = false) {
  const s = big ? 1.25 : 1;
  const pw = Math.round(14 * s);
  R(cx - pw / 2, baseY - Math.round(14 * s), pw, Math.round(14 * s), P.pot); R(cx - pw / 2, baseY - Math.round(14 * s), pw, 3, P.potHi); R(cx - pw / 2, baseY - 3, pw, 3, P.potLo);
  R(cx - pw / 2 - 1, baseY - Math.round(15 * s), pw + 2, 3, P.potHi);
  const top = baseY - Math.round(14 * s);
  const leaves = [[-9, -14, 8, 6], [1, -17, 8, 6], [-4, -22, 8, 7], [-11, -9, 7, 5], [4, -10, 8, 5], [-3, -12, 6, 5]];
  for (const [dx, dy, w, h] of leaves) { const lx = cx + Math.round(dx * s), ly = top + Math.round(dy * s); R(lx, ly, Math.round(w * s), Math.round(h * s), P.leaf); R(lx, ly, Math.round(w * s), 2, P.leafHi); R(lx + 1, ly + Math.round(h * s) - 1, Math.round(w * s) - 2, 1, P.leafLo); }
  R(cx - 1, top - 4, 2, 5, P.leafLo);
  R(cx - pw / 2 - 2, baseY, pw + 4, 3, P.floorShade);
}

function cooler(x, baseY) {
  R(x, baseY - 30, 14, 30, P.white); R(x, baseY - 30, 14, 2, P.chrome); R(x + 2, baseY - 10, 10, 6, '#cfe3ee'); R(x + 5, baseY - 22, 4, 3, P.red);
  R(x + 1, baseY - 52, 12, 22, '#9fd3ee'); R(x + 2, baseY - 52, 10, 3, '#cdeaf7'); R(x + 3, baseY - 48, 2, 14, '#e6f6fd');
  R(x - 1, baseY, 16, 3, P.floorShade);
}

function cabinet(x, y) {
  R(x, y, 64, 26, P.woodFront); R(x, y, 64, 4, P.woodTop); R(x, y + 4, 64, 1, P.woodTopHi);
  R(x + 2, y + 7, 28, 17, P.woodFrontLo); R(x + 34, y + 7, 28, 17, P.woodFrontLo); R(x + 14, y + 14, 4, 2, P.glow); R(x + 46, y + 14, 4, 2, P.glow);
  for (const [i, col] of [P.red, P.navy, P.sage, P.saffron].entries()) R(x + 40 + i * 4, y - 12, 3, 12, col);
  R(x + 6, y - 6, 8, 6, P.cream); R(x + 7, y - 5, 6, 1, P.chrome);
}

function bench(cx, y) {
  const x0 = cx - 48;
  for (let i = 0; i < 3; i++) {
    const sx = x0 + i * 32;
    R(sx + 1, y, 30, 10, P.navy); R(sx + 1, y, 30, 2, P.navyHi); R(sx + 1, y + 8, 30, 2, P.navyLo);   // back rest
    R(sx + 1, y + 12, 30, 12, P.navy); R(sx + 1, y + 12, 30, 2, P.navyHi); R(sx + 1, y + 22, 30, 2, P.navyLo);
    R(sx + 30, y, 1, 24, P.navyLo);
  }
  R(x0, y + 8, 3, 22, P.chrome); R(x0 + 93, y + 8, 3, 22, P.chrome); R(x0, y + 28, 3, 2, P.chromeLo); R(x0 + 93, y + 28, 3, 2, P.chromeLo);
  R(x0 - 1, y + 30, 98, 3, P.floorShade);
}

function signBoard(cx, y, label, num) {
  const w = Math.max(80, textWidth(label) + 28);
  const x = cx - Math.floor(w / 2);
  R(x, y, w, 20, P.chalk); R(x, y, w, 1, P.sageLt); R(x, y + 19, w, 1, '#1f3a30');
  R(x + 1, y + 1, 1, 18, P.sageLt); R(x + w - 2, y + 1, 1, 18, '#1f3a30');
  R(x + 4, y + 4, 11, 12, P.saffron); R(x + 4, y + 4, 11, 1, '#f4c370'); centered(num, x + 9.5 | 0, y + 6, P.chalk);
  text(label, x + 19, y + 7, P.cream);
  R(x + 10, y - 6, 1, 6, P.chromeLo); R(x + w - 11, y - 6, 1, 6, P.chromeLo);   // hanging rods
}

// ─── desks ──────────────────────────────────────────────────────────────────
function deskBack(cx) {
  // chair behind the seated worker, and the floor shadow
  R(cx - 16, 214, DESK_W + 8 - 40, 6, P.floorShade);
  R(cx - 13, 150, 26, 24, P.dark); R(cx - 13, 150, 26, 3, P.darkHi); R(cx - 11, 172, 22, 4, P.dark);
}

function deskFront(cx) {
  ctx = fg;
  const x0 = cx - DESK_W / 2, x1 = cx + DESK_W / 2;
  // monitor (back view)
  R(cx - 13, 158, 26, 17, P.dark); R(cx - 13, 158, 26, 2, P.darkHi); R(cx - 11, 160, 22, 12, '#252b33'); R(cx - 2, 166, 4, 3, P.darkHi);
  R(cx - 3, 175, 6, 3, P.dark); R(cx - 7, 177, 14, 2, P.dark);
  // counter top
  R(x0 + 6, 178, DESK_W - 12, 14, P.woodTop); R(x0 + 6, 178, DESK_W - 12, 2, P.woodTopHi); R(x0 + 6, 190, DESK_W - 12, 2, P.woodTopLo);
  for (let i = 0; i < 6; i++) R(x0 + 10 + i * 13, 182 + (i % 2) * 3, 8, 1, P.woodTopLo);
  // things on the counter
  R(x0 + 12, 168, 8, 10, P.dark); R(x0 + 13, 169, 6, 3, '#6fd08a'); R(x0 + 13, 173, 6, 1, P.darkHi);       // phone
  R(cx + 20, 178, 12, 8, P.white); R(cx + 21, 180, 8, 1, P.chrome); R(cx + 21, 182, 6, 1, P.chrome);        // papers
  R(x1 - 20, 170, 8, 8, P.pot); R(x1 - 21, 168, 10, 2, P.potHi); R(x1 - 19, 162, 3, 6, P.leaf); R(x1 - 16, 160, 3, 8, P.leafHi); R(x1 - 22, 164, 4, 4, P.leaf);
  // front panel
  R(x0 + 6, 192, DESK_W - 12, 22, P.woodFront); R(x0 + 6, 192, DESK_W - 12, 2, P.woodFrontLo);
  R(x0 + 8, 198, DESK_W - 16, 3, P.glow); R(x0 + 8, 198, DESK_W - 16, 1, P.glowHi);
  for (let i = 0; i < 5; i++) R(x0 + 14 + i * 14, 205, 1, 7, P.woodFrontLo);
  R(x0 + 6, 213, DESK_W - 12, 1, P.woodFrontLo);
  // side posts
  for (const sx of [x0, x1 - 6]) {
    R(sx, 164, 6, 50, P.woodPost); R(sx, 164, 6, 3, P.woodPostHi); R(sx + 1, 164, 1, 50, P.woodPostHi); R(sx + 5, 164, 1, 50, P.railLo); R(sx, 213, 6, 1, P.railLo);
  }
  ctx = g;
}

function receptionBack() {
  const x0 = REC.x - REC.w / 2;
  R(x0 + 10, 366, REC.w - 20, 4, P.floorShade);
  R(REC.x - 13, 308, 26, 26, P.dark); R(REC.x - 13, 308, 26, 3, P.darkHi);
}

function receptionFront() {
  ctx = fg;
  const x0 = REC.x - REC.w / 2, x1 = REC.x + REC.w / 2;
  R(REC.x - 13, 322, 26, 17, P.dark); R(REC.x - 13, 322, 26, 2, P.darkHi); R(REC.x - 11, 324, 22, 12, '#252b33'); R(REC.x - 2, 330, 4, 3, P.darkHi);
  R(REC.x - 3, 339, 6, 3, P.dark); R(REC.x - 7, 341, 14, 2, P.dark);
  R(x0 + 8, 342, REC.w - 16, 12, P.woodTop); R(x0 + 8, 342, REC.w - 16, 2, P.woodTopHi); R(x0 + 8, 352, REC.w - 16, 2, P.woodTopLo);
  for (let i = 0; i < 9; i++) R(x0 + 14 + i * 17, 346 + (i % 2) * 3, 10, 1, P.woodTopLo);
  R(x0 + 18, 331, 8, 11, P.dark); R(x0 + 19, 332, 6, 3, '#6fd08a');
  R(x1 - 40, 334, 12, 8, P.white); R(x1 - 39, 336, 8, 1, P.chrome);
  R(x1 - 24, 330, 9, 12, P.pot); R(x1 - 25, 328, 11, 2, P.potHi); R(x1 - 22, 320, 3, 8, P.leaf); R(x1 - 19, 318, 3, 10, P.leafHi); R(x1 - 26, 323, 5, 5, P.leaf);
  R(x0 + 8, 354, REC.w - 16, 28, P.woodFront); R(x0 + 8, 354, REC.w - 16, 2, P.woodFrontLo);
  R(x0 + 10, 360, REC.w - 20, 3, P.glow); R(x0 + 10, 360, REC.w - 20, 1, P.glowHi);
  // name plate
  R(REC.x - 34, 366, 68, 12, P.chalk); R(REC.x - 34, 366, 68, 1, P.sageLt); centered('RECEPTION', REC.x, 370, P.cream);
  for (const sx of [x0, x1 - 8]) { R(sx, 322, 8, 60, P.woodPost); R(sx, 322, 8, 3, P.woodPostHi); R(sx + 1, 322, 1, 60, P.woodPostHi); R(sx + 7, 322, 1, 60, P.railLo); }
  ctx = g;
}

function rug(cx, y) {
  R(cx - 38, y, 76, 12, P.redLo); R(cx - 36, y + 1, 72, 10, P.red); R(cx - 32, y + 3, 64, 6, '#d65a47'); R(cx - 36, y + 1, 72, 1, '#e07a68');
  for (let i = 0; i < 8; i++) { R(cx - 30 + i * 8, y + 4, 4, 1, P.saffron); }
  for (let i = 0; i < 12; i++) { px(cx - 38 + i * 7, y + 12, P.redLo); px(cx - 38 + i * 7, y - 1, P.redLo); }
}

// the mascot's head, tiny — a khaki cap, a wink and a grin (used on the banner)
function mascot(x, y) {
  R(x + 2, y + 10, 18, 11, '#c58a5b'); R(x + 3, y + 21, 16, 2, '#c58a5b');                      // face
  R(x + 1, y + 4, 20, 7, '#9b8545'); R(x + 3, y + 1, 16, 4, '#b39c55'); R(x + 1, y + 10, 20, 2, '#7d6b34'); // cap + band
  R(x + 6, y + 13, 3, 2, P.ink); R(x + 13, y + 14, 4, 1, P.ink);                                 // eyes (one winking)
  R(x + 5, y + 18, 12, 1, P.ink); R(x + 6, y + 19, 10, 2, P.white); R(x + 8, y + 19, 1, 2, P.ink); R(x + 12, y + 19, 1, 2, P.ink); // moustache + grin
  R(x + 1, y + 22, 20, 3, '#b8452f');                                                           // red towel
}

function banner() {
  const w = 184, x = Math.round(W / 2 - w / 2), y = 10;
  R(x - 2, y - 2, w + 4, 50, P.railLo); R(x - 1, y - 1, w + 2, 48, P.rail);
  R(x, y, w, 46, P.chalk); R(x, y, w, 1, P.sageLt); R(x + 3, y + 3, w - 6, 40, '#274238');
  mascot(x + 10, y + 10);
  text('SKEEMO', x + 42, y + 10, P.cream, 3);
  text('SCHEME HELP CENTRE', x + 42, y + 36, P.saffron, 1);
  R(x + 42, y + 32, 40, 1, P.saffron); R(x + 84, y + 32, 40, 1, P.cream); R(x + 126, y + 32, 40, 1, P.green);
}

function noticeBoard() {
  const { x, y, w, h } = BOARD;
  R(x - 3, y - 3, w + 6, h + 6, P.railLo); R(x - 2, y - 2, w + 4, h + 4, P.rail);
  R(x, y, w, h, P.cork); R(x, y, w, 2, P.corkHi);
  for (let i = 0; i < 260; i++) px(x + 1 + Math.floor(rnd() * (w - 2)), y + 1 + Math.floor(rnd() * (h - 2)), rnd() > 0.5 ? P.corkHi : P.corkLo);
  // header plank
  R(x + 6, y + 3, w - 12, 12, P.chalk); R(x + 6, y + 3, w - 12, 1, P.sageLt); centered('NOTICE BOARD', x + w / 2, y + 6, P.cream);
}

// ─── paint ──────────────────────────────────────────────────────────────────
R(0, 0, W, H, P.floorA);
floorTiles();
wall();
banner();
noticeBoard();
windowAt(452, 22, 3);
clock(612, 40);
cabinet(580, 70);
cooler(640, 136);
plant(644, 296, true); plant(30, 296, true);
for (const k of Object.keys(DESK_X)) { deskBack(DESK_X[k]); signBoard(DESK_X[k], 124, SIGN[k], NUM[k]); }
for (const bx of BENCH_X) bench(bx, BENCH_Y);
receptionBack();
rug(REC.x, 370);
plant(REC.x - REC.w / 2 - 20, 380); plant(REC.x + REC.w / 2 + 20, 380);
for (const k of Object.keys(DESK_X)) deskFront(DESK_X[k]);
receptionFront();

// ─── layout json ────────────────────────────────────────────────────────────
const desks = {};
const FG = [];
for (const k of Object.keys(DESK_X)) {
  const cx = DESK_X[k];
  desks[k] = { x: cx, seat: { x: cx, y: SEAT_Y }, front: { x: cx, y: FRONT_Y }, hit: [cx - 48, 120, cx + 48, 216], sign: [cx - 44, 124, cx + 44, 144] };
  FG.push({ id: k, rect: [cx - 46, 156, cx + 46, 215], z: 216 });
}
desks.reception = { x: REC.x, seat: { x: REC.x, y: REC.seatY }, front: { x: REC.x, y: REC.frontY }, hit: [REC.x - 90, 300, REC.x + 90, 382], sign: [REC.x - 34, 366, REC.x + 34, 378] };
FG.push({ id: 'reception', rect: [REC.x - 86, 316, REC.x + 86, 384], z: 376 });

const layout = {
  width: W, height: H, scale: S,
  peonHome: { x: 150, y: 338 }, entrance: { x: REC.x, y: 392 },
  desks, front: FG,
  walkable: [[26, 124, 646, 384]],
  blocked: [
    ...Object.values(DESK_X).map((cx) => [cx - 50, 150, cx + 50, 220]),
    ...BENCH_X.map((bx) => [bx - 52, BENCH_Y - 4, bx + 52, BENCH_Y + 36]),
    [REC.x - REC.w / 2 - 6, 304, REC.x + REC.w / 2 + 6, 372],
    [14, 120, 50, 150], [14, 280, 50, 300], [622, 280, 660, 300], [REC.x - REC.w / 2 - 36, 364, REC.x - REC.w / 2 - 6, 384], [REC.x + REC.w / 2 + 6, 364, REC.x + REC.w / 2 + 36, 384],
    [630, 100, 656, 140],
  ],
  noticeBoard: { x: BOARD.x, y: BOARD.y + 18, w: BOARD.w, h: BOARD.h - 20 },
  clock: { x: 612, y: 40 },
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'skeemo-office.png'), c.toBuffer('image/png'));
fs.writeFileSync(path.join(OUT, 'skeemo-front.png'), fc.toBuffer('image/png'));
fs.writeFileSync(path.join(OUT, 'skeemo-layout.json'), JSON.stringify(layout, null, 1));
const prev = process.argv.indexOf('--preview');
if (prev > 0) {
  const pc = createCanvas(W * S, H * S);
  const pg = pc.getContext('2d');
  pg.drawImage(c, 0, 0); pg.drawImage(fc, 0, 0);
  fs.writeFileSync(process.argv[prev + 1], pc.toBuffer('image/png'));
}
console.log(`wrote ${W}x${H} art px (${W * S}x${H * S} png) → ${path.relative(process.cwd(), OUT)}`);
