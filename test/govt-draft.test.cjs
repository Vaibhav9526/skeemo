'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const LOCALES = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'ur', 'kn', 'ml', 'pa'];
const ROOT = path.resolve(__dirname, '..', 'src/renderer/src');
const DRAFT = path.join(ROOT, 'govt/draft');
const load = (code) => loadTs(`src/renderer/src/govt/draft/locales/${code}.ts`).default;
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(path.join(d, f.name)) : [path.join(d, f.name)]));

test('draft: every language has the English key tree', () => {
  const en = new Set(flat(load('en')).map(([k]) => k));
  for (const code of LOCALES.filter((c) => c !== 'en')) {
    const other = new Set(flat(load(code)).map(([k]) => k));
    assert.deepEqual([...en].filter((k) => !other.has(k)), [], `${code} is missing keys`);
  }
});

test('draft: the keys its screens ask for exist in its own English strings', () => {
  const en = new Set(flat(load('en')).map(([k]) => k));
  const files = walk(DRAFT).filter((f) => /\.tsx?$/.test(f) && !f.includes(`${path.sep}locales${path.sep}`));
  const missing = [];
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z_.]+)'/g)) if (!en.has(m[1])) missing.push(m[1]);
  assert.deepEqual([...new Set(missing)], []);
});

test('draft stays separate: it uses its own store, bus and namespace, and nothing in the current UI imports its screens', () => {
  for (const f of walk(DRAFT).filter((x) => /\.tsx?$/.test(x))) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/useTranslation\('govt'\)/.test(src), `${path.relative(ROOT, f)} uses the current namespace`);
    assert.ok(!/scene\/govt\/(floorBus|GovtFloor|layout)'/.test(src), `${path.relative(ROOT, f)} reaches into the current floor`);
  }
  const outside = walk(path.join(ROOT, 'govt')).filter((f) => !f.startsWith(DRAFT) && /\.tsx?$/.test(f));
  const importers = outside.filter((f) => /govt\/draft\/|\.\/draft\//.test(fs.readFileSync(f, 'utf8'))).map((f) => path.basename(f));
  assert.deepEqual(importers, ['SkeemoApp.tsx']);
});

test('draft: the backdrop and layout exist', () => {
  assert.ok(fs.statSync(path.join(ROOT, 'assets/draft/govt-office.jpg')).size > 100000);
  assert.ok(fs.existsSync(path.join(ROOT, 'scene/govt/draft/layoutDraft.ts')));
});
