'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { createCanvas } = require('@napi-rs/canvas');

const D = loadTs('src/shared/govt/documents.ts');
const N = loadTs('src/shared/govt/notices.ts');
const A = loadTs('src/shared/govt/analysis.ts');
const VT = loadTs('src/shared/govt/vaultTypes.ts');
const { Vault } = loadTs('src/main/govt/vault.ts');
const { ocrFile } = loadTs('src/main/govt/ocr.ts');
const { fitFile } = loadTs('src/main/govt/docFit.ts');
const { verifyDocument } = loadTs('src/main/govt/docVerify.ts');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skeemo-'));
const profile = (over = {}) => ({
  name: 'Ramesh Patil', state: 'Maharashtra', income: 120000, occupation: 'farmer', age: 34, gender: 'male',
  category: 'obc', area: 'rural', look: { seed: 0 }, createdAt: 1, ...over,
});

// ─── notice board ───────────────────────────────────────────────────────────

test('notices: a scholarship window closing soon comes first and counts the days', () => {
  const student = profile({ occupation: 'student', category: 'sc', income: 200000, area: 'urban', age: 20 });
  const n = N.computeNotices(student, new Date(2026, 9, 13), 4); // 13 Oct 2026
  assert.ok(n.length >= 2);
  assert.equal(n[0].kind, 'closing');
  assert.equal(n[0].scheme.id, 'scholarship-sc');
  assert.equal(n[0].daysLeft, 18);
  assert.equal(n[0].closes, '2026-10-31');
  assert.ok(n.filter((x) => x.kind === 'closing').every((x) => x.daysLeft <= 75));
  assert.ok(!n.some((x) => x.scheme.id === 'scholarship-st'), 'a scheme the citizen is ruled out of is never pinned');
});

test('notices: a closed window rolls to next year and only shows once it is near', () => {
  assert.equal(N.daysUntil(10, 31, new Date(2026, 10, 2)).date.getFullYear(), 2027);
  assert.equal(N.daysUntil(10, 31, new Date(2026, 9, 31)).days, 0);
  const spring = N.computeNotices(profile(), new Date(2026, 2, 1), 6);
  assert.ok(spring.every((x) => x.kind === 'trending'), 'nothing is closing within 75 days of 1 March');
  const nov = N.computeNotices(profile(), new Date(2026, 10, 20), 6);
  assert.equal(nov[0].scheme.id, 'pmfby');
  assert.equal(nov[0].daysLeft, 25);
});

// ─── what the vault concludes from OCR text ─────────────────────────────────

const aadhaarNumber = (() => { for (let d = 0; d < 10; d++) if (D.isValidAadhaar(`23456789012${d}`)) return `23456789012${d}`; return ''; })();
const spaced = `${aadhaarNumber.slice(0, 4)} ${aadhaarNumber.slice(4, 8)} ${aadhaarNumber.slice(8)}`;

test('analysis: an Aadhaar with the right name and a genuine number is valid, and the number is masked', () => {
  const a = A.analyzeDocument(`Government of India Unique Identification Authority of India Aadhaar Name: Ramesh Ganpat Patil Year of Birth 1990 ${spaced}`, profile());
  assert.equal(a.docType, 'aadhaar');
  assert.equal(a.status, 'valid');
  assert.match(a.fields.number, /^XXXX XXXX \d{4}$/);
  assert.ok(!JSON.stringify(a).includes(aadhaarNumber));
});

test('analysis: a wrong name needs a look, and an expired paper is invalid', () => {
  const other = A.analyzeDocument(`Government of India Aadhaar Name: Sunita Verma ${spaced}`, profile());
  assert.equal(other.status, 'check');
  assert.ok(other.checks.some((c) => c.id === 'name_missing' && c.ok === false));
  const old = A.analyzeDocument('Income certificate issued to Ramesh Patil annual income 120000 tehsildar revenue department Valid upto 31/03/2020', profile());
  assert.equal(old.docType, 'income_cert');
  assert.equal(old.status, 'invalid');
  assert.ok(old.checks.some((c) => c.id === 'expired' && c.ok === false));
  const fresh = A.analyzeDocument('Income certificate issued to Ramesh Patil annual income 120000 tehsildar revenue department Valid upto 31/03/2031', profile(), { now: new Date(2026, 9, 13) });
  assert.equal(fresh.status, 'valid');
});

test('analysis: nothing readable, or something unrecognisable, never claims to be valid', () => {
  assert.equal(A.analyzeDocument('', profile()).status, 'check');
  assert.equal(A.analyzeDocument('  ', profile()).checks[0].id, 'ocr_empty');
  const lunch = A.analyzeDocument('Menu of the day: dal rice and some pickle served with a salad and sweet', profile());
  assert.equal(lunch.docType, null);
  assert.equal(lunch.status, 'check');
  const long = 'Menu of the day dal rice and some pickle served with a salad and sweet and lots more words to pass the length check. '.repeat(3);
  const pinned = A.analyzeDocument(long, profile(), { expected: 'aadhaar' });
  assert.equal(pinned.status, 'invalid');
  assert.ok(pinned.checks.some((c) => c.id === 'type_words'));
});

test('vault folders file every paper type somewhere sensible', () => {
  assert.equal(VT.folderOf('aadhaar'), 'identity');
  assert.equal(VT.folderOf('income_cert'), 'income');
  assert.equal(VT.folderOf('land_record'), 'land');
  assert.equal(VT.folderOf('bank_passbook'), 'bank');
  assert.equal(VT.folderOf(null), 'other');
  for (const id of D.DOC_IDS) assert.ok(VT.VAULT_FOLDERS.includes(VT.folderOf(id)), id);
});

// ─── vault store ────────────────────────────────────────────────────────────

test('vault: keeps a copy, survives a reload, refuses bad files, and removes cleanly', () => {
  const dir = tmp();
  const src = path.join(dir, 'in.png');
  fs.writeFileSync(src, Buffer.from('89504e470d0a1a0a0000', 'hex'));
  const v = new Vault(path.join(dir, 'vault'), () => 1700000000000);
  const analysis = A.analyzeDocument('Government of India Aadhaar Name: Ramesh Patil', profile());
  const r = v.add(src, 'my aadhaar.png', analysis, 'ocr');
  assert.equal(r.ok, true);
  assert.equal(r.doc.name, 'my aadhaar.png');
  assert.ok(fs.existsSync(v.pathOf(r.doc.id)));
  assert.equal(new Vault(path.join(dir, 'vault')).list().length, 1);
  assert.equal(v.add(src, 'notes.docx', analysis, 'ocr').error, 'bad_type');
  assert.equal(v.add(path.join(dir, 'missing.png'), 'x.png', analysis, 'none').error, 'unreadable');
  assert.equal(v.pathOf('../../etc/passwd'), null);
  assert.equal(v.remove(r.doc.id), true);
  assert.equal(v.list().length, 0);
  assert.equal(v.remove(r.doc.id), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ─── OCR ────────────────────────────────────────────────────────────────────

test('ocr: reads the words off a picture on this machine (Windows built-in OCR)', { skip: process.platform !== 'win32' }, async () => {
  const dir = tmp();
  const c = createCanvas(1000, 420);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 1000, 420);
  g.fillStyle = '#000'; g.font = 'bold 48px Arial';
  g.fillText('Government of India', 40, 90); g.fillText('Name: Ramesh Patil', 40, 170); g.fillText('Income Certificate 120000', 40, 250);
  const png = path.join(dir, 'scan.png');
  fs.writeFileSync(png, c.toBuffer('image/png'));
  const r = await ocrFile(png, 'scan.png');
  if (!r.ok && r.reason === 'no_engine') return; // no OCR language pack installed on this machine
  assert.equal(r.ok, true);
  assert.match(r.text, /Government of India/i);
  assert.match(r.text, /Ramesh Patil/i);
  assert.equal(A.analyzeDocument(r.text, profile()).docType, 'income_cert');
  assert.equal((await ocrFile(path.join(dir, 'x.docx'), 'x.docx')).ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('verify: OCR text lets a plain photo be cross-checked like a PDF', async () => {
  const dir = tmp();
  const c = createCanvas(1600, 1100);
  const g = c.getContext('2d');
  g.fillStyle = '#f4f0e6'; g.fillRect(0, 0, 1600, 1100);
  g.fillStyle = '#111'; g.font = 'bold 60px Arial';
  for (let i = 0; i < 8; i++) g.fillText('PERMANENT ACCOUNT NUMBER CARD', 60, 100 + i * 120);
  const src = path.join(dir, 'pan.jpg');
  fs.writeFileSync(src, c.toBuffer('image/jpeg', 95));
  const fit = await fitFile({ path: src, name: 'pan.jpg', formats: D.DOCS.pan.formats, maxKB: 500, outDir: path.join(dir, 'out') });
  const good = await verifyDocument({ docId: 'pan', originalPath: src, originalName: 'pan.jpg', fit, limitKB: 500, profile: profile(), llm: null, ocrText: 'Income Tax Department Permanent Account Number ABCDE1234F Name RAMESH GANPAT PATIL Father Name Ganpat' });
  assert.ok(good.checks.some((x) => x.id === 'id_valid' && x.ok === true));
  assert.ok(good.checks.some((x) => x.id === 'name_match'));
  assert.ok(!good.checks.some((x) => x.id === 'ai_off'), 'OCR text counts as a reading');
  const wrong = await verifyDocument({ docId: 'pan', originalPath: src, originalName: 'pan.jpg', fit, limitKB: 500, profile: profile(), llm: null, ocrText: 'Menu of the day dal rice pickle salad and sweet with lots of extra words so that the text is long enough to be judged. '.repeat(3) });
  assert.equal(wrong.status, 'rejected');
  fs.rmSync(dir, { recursive: true, force: true });
});
