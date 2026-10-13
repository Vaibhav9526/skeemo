// Skeemo office — the "Modern" illustrated map.
//
// Takes the supplied picture (reference/govt-office-modern.png), crops it to 1599x900, upscales it 2x, sharpens it and repaints
// the signs, the banner (now SKEEMO) and a cork notice board over the left poster/TV with crisp text. Writes:
//   src/renderer/src/assets/govt/skeemo-modern.jpg        backdrop
//   src/renderer/src/assets/govt/skeemo-modern-front.png  desk fronts + monitors, drawn OVER the seated staff (transparent elsewhere)
//   src/renderer/src/assets/govt/skeemo-modern-layout.json  same shape as skeemo-layout.json (see scene/govt/layout.ts)
// One world unit = 3 source pixels; the PNG/JPG hold 2 pixels per source pixel, so layout.scale = 6.
//
//   node tools/build-skeemo-modern.cjs
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'reference', 'govt-office-modern.png');
const OUT = path.join(ROOT, 'src', 'renderer', 'src', 'assets', 'govt');
const CW = 1599, CH = 900, UP = 2, DIV = 3;
const W = CW / DIV, H = CH / DIV;           // world units
const SCALE = UP * DIV;                      // texture px per world unit

const DESKS = [
  { id: 'registration', x: 255, l: 130, r: 385, sign: [172, 222, 353, 279], num: '1', label: 'REGISTRATION' },
  { id: 'documents', x: 535, l: 415, r: 655, sign: [453, 222, 629, 279], num: '2', label: 'DOCUMENTS' },
  { id: 'eligibility', x: 800, l: 682, r: 915, sign: [714, 222, 889, 279], num: '3', label: 'ELIGIBILITY' },
  { id: 'form', x: 1065, l: 945, r: 1185, sign: [974, 222, 1155, 279], num: '4', label: 'FORM' },
  { id: 'help', x: 1335, l: 1215, r: 1468, sign: [1246, 222, 1429, 279], num: '5', label: 'HELP' },
];
const BANNER = [566, 32, 1033, 138];
const RECEPTION_SIGN = [725, 676, 876, 712];
const BOARD = [28, 40, 456, 184];   // cork notice board, over the left poster + TV (source px)

function sharpen(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const src = img.data;
  const tmp = new Float32Array(src.length);
  const blur = new Uint8ClampedArray(src.length);
  const k = [1, 4, 6, 4, 1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let t = -2; t <= 2; t++) s += k[t + 2] * src[(y * w + Math.min(w - 1, Math.max(0, x + t))) * 4 + c];
    tmp[(y * w + x) * 4 + c] = s / 16;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let t = -2; t <= 2; t++) s += k[t + 2] * tmp[(Math.min(h - 1, Math.max(0, y + t)) * w + x) * 4 + c];
    blur[(y * w + x) * 4 + c] = s / 16;
  }
  for (let i = 0; i < src.length; i += 4) for (let c = 0; c < 3; c++) src[i + c] = Math.max(0, Math.min(255, src[i + c] + amount * (src[i + c] - blur[i + c])));
  ctx.putImageData(img, 0, 0);
}

(async () => {
  const img = await loadImage(SRC);
  const c = createCanvas(CW * UP, CH * UP);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const mid = createCanvas(Math.round(CW * 1.5), Math.round(CH * 1.5));
  const m = mid.getContext('2d');
  m.imageSmoothingQuality = 'high';
  m.drawImage(img, 0, 0, CW, CH, 0, 0, mid.width, mid.height);
  g.drawImage(mid, 0, 0, c.width, c.height);
  sharpen(g, c.width, c.height, 0.55);

  const S = UP;
  const SANS = '"Segoe UI", "Arial"';
  const fit = (t, maxW, size, weight = 'bold') => {
    let s = size;
    for (; s > 6; s--) { g.font = `${weight} ${s}px ${SANS}`; if (g.measureText(t).width <= maxW) break; }
    return s;
  };
  const plate = ([x0, y0, x1, y1], top = '#2a4a8f', bottom = '#183268') => {
    const x = x0 * S, y = y0 * S, w = (x1 - x0) * S, h = (y1 - y0) * S;
    g.fillStyle = '#10204a'; g.beginPath(); g.roundRect(x - 2, y - 2, w + 4, h + 4, 12); g.fill();
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.beginPath(); g.roundRect(x, y, w, h, 10); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 2; g.beginPath(); g.roundRect(x + 3, y + 3, w - 6, h - 6, 8); g.stroke();
    return { x, y, w, h };
  };

  // desk signs: number badge + one crisp English line
  for (const d of DESKS) {
    const { x, y, w, h } = plate(d.sign);
    g.fillStyle = '#ffb347'; g.beginPath(); g.roundRect(x + 14, y + h / 2 - 20, 40, 40, 8); g.fill();
    g.fillStyle = '#10204a'; g.font = `bold 28px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(d.num, x + 34, y + h / 2 + 2);
    g.fillStyle = '#fff'; g.textAlign = 'left';
    const s = fit(d.label, w - 80, 34); g.font = `bold ${s}px ${SANS}`;
    g.fillText(d.label, x + 66, y + h / 2 + 2);
  }
  { // reception plate
    const { x, y, w, h } = plate(RECEPTION_SIGN, '#27468a', '#172e63');
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const s = fit('RECEPTION', w - 20, 30); g.font = `bold ${s}px ${SANS}`; g.fillText('RECEPTION', x + w / 2, y + h / 2 + 2);
  }
  { // banner: keep the emblem, repaint the rest
    const [x0, y0, x1, y1] = BANNER;
    const x = x0 * S, y = y0 * S, w = (x1 - x0) * S, h = (y1 - y0) * S, emb = Math.round(w * 0.18);
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#24427f'); gr.addColorStop(1, '#14275a');
    g.fillStyle = gr; g.fillRect(x + emb, y + 4, w - emb - 4, h - 8);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const cx = x + emb + (w - emb) / 2;
    g.fillStyle = '#fff'; g.font = `800 ${Math.round(h * 0.52)}px ${SANS}`; g.fillText('SKEEMO', cx, y + h * 0.58);
    g.fillStyle = '#ffd37a'; const s2 = fit('Government Scheme Help Centre', w - emb - 60, Math.round(h * 0.2)); g.font = `bold ${s2}px ${SANS}`; g.fillText('Government Scheme Help Centre', cx, y + h * 0.82);
    const rw = w - emb - 120, rx = cx - rw / 2, ry = y + h * 0.9;
    g.fillStyle = '#ff9933'; g.fillRect(rx, ry, rw / 3, 5); g.fillStyle = '#fff'; g.fillRect(rx + rw / 3, ry, rw / 3, 5); g.fillStyle = '#138808'; g.fillRect(rx + (2 * rw) / 3, ry, rw / 3, 5);
  }
  { // cork notice board over the poster + TV
    const [x0, y0, x1, y1] = BOARD;
    const x = x0 * S, y = y0 * S, w = (x1 - x0) * S, h = (y1 - y0) * S;
    g.fillStyle = '#5a3a22'; g.beginPath(); g.roundRect(x - 8, y - 8, w + 16, h + 16, 12); g.fill();
    g.fillStyle = '#8b5a37'; g.beginPath(); g.roundRect(x - 4, y - 4, w + 8, h + 8, 9); g.fill();
    g.fillStyle = '#c79f69'; g.fillRect(x, y, w, h);
    let seed = 9; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 1400; i++) { g.fillStyle = rnd() > 0.5 ? '#d6b17c' : '#b58a55'; g.fillRect(x + rnd() * w, y + rnd() * h, 3, 3); }
    g.fillStyle = '#2f4f43'; g.beginPath(); g.roundRect(x + 24, y + 14, w - 48, 40, 8); g.fill();
    g.fillStyle = '#fbf5e4'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold 26px ${SANS}`; g.fillText('NOTICE BOARD', x + w / 2, y + 35);
  }

  // output backdrop
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'skeemo-modern.jpg'), c.toBuffer('image/jpeg', 92));

  // front pieces: copies of the desk fronts + monitors, so the seated staff can sit "behind" the counter
  const fc = createCanvas(c.width, c.height);
  const f = fc.getContext('2d');
  const front = [];
  for (const d of DESKS) {
    const r = [d.l - 6, 303, d.r + 6, 442];
    f.drawImage(c, r[0] * S, r[1] * S, (r[2] - r[0]) * S, (r[3] - r[1]) * S, r[0] * S, r[1] * S, (r[2] - r[0]) * S, (r[3] - r[1]) * S);
    front.push({ id: d.id, rect: r.map((v) => v / DIV), z: 442 / DIV });
  }
  const rr = [668, 603, 937, 726];
  f.drawImage(c, rr[0] * S, rr[1] * S, (rr[2] - rr[0]) * S, (rr[3] - rr[1]) * S, rr[0] * S, rr[1] * S, (rr[2] - rr[0]) * S, (rr[3] - rr[1]) * S);
  front.push({ id: 'reception', rect: rr.map((v) => v / DIV), z: 726 / DIV });
  fs.writeFileSync(path.join(OUT, 'skeemo-modern-front.png'), fc.toBuffer('image/png'));

  const u = (a) => a.map((v) => Math.round((v / DIV) * 100) / 100);
  const desks = {};
  for (const d of DESKS) {
    desks[d.id] = { x: d.x / DIV, seat: { x: d.x / DIV, y: 364 / DIV }, front: { x: d.x / DIV, y: 462 / DIV }, hit: u([d.l - 6, 245, d.r + 6, 442]), sign: u(d.sign) };
  }
  desks.reception = { x: 800 / DIV, seat: { x: 800 / DIV, y: 650 / DIV }, front: { x: 800 / DIV, y: 752 / DIV }, hit: u([650, 560, 957, 726]), sign: u(RECEPTION_SIGN) };
  const layout = {
    width: W, height: H, scale: SCALE,
    peonHome: { x: 560 / DIV, y: 655 / DIV }, entrance: { x: 800 / DIV, y: 846 / DIV },
    desks, front,
    walkable: [u([40, 205, 1560, 736]), u([678, 726, 926, 852]), u([520, 746, 690, 770])],
    blocked: [
      ...DESKS.map((d) => u([d.l - 14, 272, d.r + 14, 444])),
      u([14, 330, 126, 600]), u([1470, 330, 1588, 600]),
      u([640, 590, 964, 726]),
      u([20, 170, 90, 290]), u([20, 552, 98, 672]), u([1500, 552, 1582, 672]),
      u([580, 646, 650, 742]), u([960, 646, 1020, 742]),
      u([450, 90, 530, 215]), u([1060, 90, 1135, 215]),
    ],
    noticeBoard: { x: BOARD[0] / DIV, y: BOARD[1] / DIV + 6, w: (BOARD[2] - BOARD[0]) / DIV, h: (BOARD[3] - BOARD[1]) / DIV - 6 },
    clock: { x: 1520 / DIV, y: 68 / DIV },
  };
  fs.writeFileSync(path.join(OUT, 'skeemo-modern-layout.json'), JSON.stringify(layout, null, 1));
  console.log(`wrote modern map ${c.width}x${c.height} (world ${W}x${H}, scale ${SCALE})`);
})();
