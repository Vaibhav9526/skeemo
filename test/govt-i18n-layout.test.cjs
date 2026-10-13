'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const LOCALES = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'ur', 'kn', 'ml', 'pa'];
const load = (code) => loadTs(`src/renderer/src/govt/locales/${code}.ts`).default;

function flat(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));
}
const tokens = (s) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((t) => t.replace(/\s/g, '')).sort().join(',');

test('every language has exactly the English key tree and the same {{placeholders}}', () => {
  const en = new Map(flat(load('en')));
  assert.ok(en.size > 250, `English has ${en.size} strings`);
  for (const code of LOCALES.filter((c) => c !== 'en')) {
    const other = new Map(flat(load(code)));
    const missing = [...en.keys()].filter((k) => !other.has(k));
    const extra = [...other.keys()].filter((k) => !en.has(k));
    assert.deepEqual(missing, [], `${code} is missing keys`);
    assert.deepEqual(extra, [], `${code} has unknown keys`);
    for (const [k, v] of en) {
      assert.equal(typeof other.get(k), 'string', `${code}.${k}`);
      assert.ok(other.get(k).trim().length > 0, `${code}.${k} is empty`);
      assert.equal(tokens(other.get(k)), tokens(v), `${code}.${k} placeholders differ`);
    }
  }
});

test('every key the UI asks for exists in English', () => {
  const en = new Map(flat(load('en')));
  const root = path.resolve(__dirname, '..', 'src/renderer/src/govt');
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory() && f.name !== 'locales') walk(p); else if (/\.tsx?$/.test(f.name)) files.push(p); } })(root);
  const used = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z_.]+)'/g)) used.add(m[1]);
  const missing = [...used].filter((k) => !en.has(k));
  assert.deepEqual(missing, []);
  // the keys built from data ids
  for (const o of ['farmer', 'farm_labourer', 'student', 'homemaker', 'daily_wage', 'self_employed', 'street_vendor', 'artisan', 'private_job', 'govt_job', 'retired', 'unemployed', 'other']) assert.ok(en.has(`occ.${o}`), o);
  for (const id of ['format_ok', 'format_bad', 'size_ok', 'size_fixed', 'size_cannot', 'size_small', 'size_grown', 'legible', 'blurry', 'low_res', 'id_valid', 'id_invalid', 'id_missing', 'name_match', 'name_mismatch', 'name_unknown', 'type_match', 'type_mismatch', 'type_unknown', 'expired', 'not_expired', 'ai_off', 'scanned_pdf', 'photo_ok', 'photo_big', 'income_over']) assert.ok(en.has(`doccheck.${id}`), id);
  for (const d of ['reception', 'registration', 'documents', 'eligibility', 'form', 'help', 'peon']) assert.ok(en.has(`desk.${d}.title`) && en.has(`desk.${d}.short`), d);
  for (const k of ['ageMinOk', 'ageMinBad', 'ageMaxOk', 'ageMaxBad', 'genderOk', 'genderBad', 'incomeOk', 'incomeBad', 'occOk', 'occBad', 'exclOk', 'exclBad', 'catOk', 'catBad', 'areaOk', 'areaBad', 'anyOk', 'anyBad']) assert.ok(en.has(`elig.${k}`), k);
});

// ─── the floor ──────────────────────────────────────────────────────────────

const lay = loadTs('src/renderer/src/scene/govt/layout.ts');

test('the entrance, every counter front and the chaprasi post are reachable on foot', () => {
  const spots = [lay.PEON_HOME, ...lay.DESK_ORDER.map((d) => lay.DESKS[d].front)];
  for (const p of spots) assert.ok(lay.isWalkable(p.x, p.y), `${p.x},${p.y} must be walkable`);
  for (const d of lay.DESK_ORDER) {
    const r = lay.findRoute(lay.ENTRANCE, lay.DESKS[d].front);
    assert.ok(r.length >= 1, d);
    assert.deepEqual(r[r.length - 1], lay.DESKS[d].front);
    for (const w of r.slice(0, -1)) assert.ok(lay.isWalkable(w.x, w.y), `${d}: waypoint ${w.x},${w.y}`);
  }
  const r = lay.findRoute(lay.DESKS.registration.front, lay.DESKS.help.front);
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i];
    for (let t = 0; t <= 1; t += 0.05) assert.ok(lay.isWalkable(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t), `leg ${i}`);
  }
});

test('seated workers sit behind desks, visitors stand in front, and the desk fronts cover the workers', () => {
  for (const d of lay.DESK_ORDER) {
    const s = lay.DESKS[d];
    assert.ok(s.seat.y < s.front.y, d);
    assert.ok(!lay.isWalkable(s.seat.x, s.seat.y), `${d}: the seat is behind the desk, off the walking floor`);
    const piece = lay.FRONT_PIECES.find((p) => p.id === d);
    assert.ok(piece, `${d} has a front piece`);
    assert.ok(piece.rect.x0 < s.seat.x && s.seat.x < piece.rect.x1, 'the piece spans the worker');
    assert.ok(piece.rect.y0 < s.seat.y && piece.z > s.seat.y, 'drawn over the worker');
    assert.ok(piece.z < s.front.y, 'but under the visitor standing in front');
  }
});

test('the world art and layout were built together', () => {
  const dir = path.resolve(__dirname, '../src/renderer/src/assets/govt');
  for (const f of ['skeemo-office.png', 'skeemo-front.png', 'skeemo-layout.json']) assert.ok(fs.existsSync(path.join(dir, f)), f);
  const png = fs.readFileSync(path.join(dir, 'skeemo-office.png'));
  assert.equal(png.readUInt32BE(16), lay.WORLD_W * lay.BACKDROP_SCALE);
  assert.equal(png.readUInt32BE(20), lay.WORLD_H * lay.BACKDROP_SCALE);
  assert.ok(lay.NOTICE_BOARD.w > 150 && lay.NOTICE_BOARD.y >= 0);
});

// ─── @mentions ──────────────────────────────────────────────────────────────

const M = loadTs('src/renderer/src/govt/chat/mentions.ts');
test('@mentions call a counter and strip themselves from the message', () => {
  assert.deepEqual(M.parseMention('@documents what is needed for kisan'), { target: 'documents', rest: 'what is needed for kisan' });
  assert.deepEqual(M.parseMention('please @help me with the form'), { target: 'help', rest: 'please me with the form' });
  assert.deepEqual(M.parseMention('@vault'), { target: 'vault', rest: '' });
  assert.deepEqual(M.parseMention('@Docs'), { target: 'documents', rest: '' });
  assert.deepEqual(M.parseMention('mail me at a@b.com'), { target: null, rest: 'mail me at a@b.com' });
  assert.deepEqual(M.parseMention('@nobody hi'), { target: null, rest: '@nobody hi' });
  assert.equal(M.MENTION_LIST.length, 7);
});
