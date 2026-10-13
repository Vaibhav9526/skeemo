'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const P = loadTs('src/shared/govt/profile.ts');
const D = loadTs('src/shared/govt/documents.ts');
const S = loadTs('src/shared/govt/schemes.ts');
const E = loadTs('src/shared/govt/eligibility.ts');
const C = loadTs('src/shared/govt/cases.ts');
const L = loadTs('src/shared/govt/languages.ts');

const profile = (over = {}) => ({
  name: 'Ramesh Patil', state: 'Maharashtra', income: 120000, occupation: 'farmer', age: 34, gender: 'male',
  category: 'obc', area: 'rural', look: { seed: 0 }, createdAt: 1, ...over,
});

// ─── profile ────────────────────────────────────────────────────────────────

test('parseIncome understands lakh / crore / commas / rupee signs', () => {
  assert.equal(P.parseIncome('120000'), 120000);
  assert.equal(P.parseIncome('1,20,000'), 120000);
  assert.equal(P.parseIncome('₹ 2.5 lakh'), 250000);
  assert.equal(P.parseIncome('1.2L'), 120000);
  assert.equal(P.parseIncome('1 crore'), 10000000);
  assert.equal(P.parseIncome('50k'), 50000);
  assert.ok(Number.isNaN(P.parseIncome('a lot')));
});

test('validateProfile accepts a good draft and reports every bad field', () => {
  const ok = P.validateProfile({ name: '  Asha   Nair ', age: 31, gender: 'female', state: 'Kerala', occupation: 'private_job', incomeText: '3 lakh', category: 'general', area: 'urban' });
  assert.equal(ok.ok, true);
  assert.equal(ok.profile.name, 'Asha Nair');
  assert.equal(ok.profile.income, 300000);
  const bad = P.validateProfile({ name: 'A', age: 3, gender: 'x', state: 'Atlantis', occupation: 'wizard', incomeText: 'lots' });
  assert.equal(bad.ok, false);
  for (const k of ['name', 'age', 'gender', 'state', 'occupation', 'income']) assert.ok(bad.issues.includes(k), k);
});

test('sanitizeStoredProfile drops anything malformed', () => {
  assert.equal(P.sanitizeStoredProfile(null), null);
  assert.equal(P.sanitizeStoredProfile({ name: 'x' }), null);
  assert.equal(P.sanitizeStoredProfile(profile()).name, 'Ramesh Patil');
});

// ─── documents ──────────────────────────────────────────────────────────────

test('Aadhaar numbers are checked with the Verhoeff checksum', () => {
  // build a valid one: find the check digit that makes the checksum pass
  let valid = null;
  for (let d = 0; d < 10 && !valid; d++) { const n = `23456789012${d}`; if (D.isValidAadhaar(n)) valid = n; }
  assert.ok(valid, 'one check digit must validate');
  assert.equal(D.isValidAadhaar(`${valid.slice(0, 4)} ${valid.slice(4, 8)} ${valid.slice(8)}`), true);
  const wrong = `${valid.slice(0, 11)}${(Number(valid[11]) + 1) % 10}`;
  assert.equal(D.isValidAadhaar(wrong), false);
  assert.equal(D.isValidAadhaar('0123 4567 8901'), false);
  assert.equal(D.findIdInText('aadhaar', `my number is ${valid.slice(0, 4)} ${valid.slice(4, 8)} ${valid.slice(8)} ok`), valid);
});

test('PAN / IFSC patterns and name matching', () => {
  assert.equal(D.isValidPan('ABCDE1234F'), true);
  assert.equal(D.isValidPan('ABCD1234F'), false);
  assert.equal(D.isValidIfsc('SBIN0001234'), true);
  assert.equal(D.isValidIfsc('SBIN1001234'), false);
  assert.equal(D.nameMatches('Ramesh Patil', 'RAMESH GANPAT PATIL'), true);
  assert.equal(D.nameMatches('Ramesh Patil', 'Suresh Kumar'), false);
});

test('every scheme only asks for documents that exist', () => {
  for (const s of S.SCHEMES) for (const d of s.docs) assert.ok(D.DOCS[d], `${s.id} → ${d}`);
  for (const d of Object.values(D.DOCS)) { assert.ok(d.maxKB > 0 && d.formats.length > 0, d.id); if (d.minKB) assert.ok(d.minKB < d.maxKB); }
});

// ─── schemes ────────────────────────────────────────────────────────────────

test('scheme catalogue is well formed and bilingual', () => {
  const ids = new Set();
  for (const s of S.SCHEMES) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`); ids.add(s.id);
    for (const f of [s.name, s.short, s.benefit]) { assert.ok(f.en.length > 3 && f.hi.length > 3, s.id); }
    assert.match(s.portal, /^https:\/\//, s.id);
    assert.ok(S.SCHEME_CATEGORIES.includes(s.category), s.id);
    for (const q of s.questions ?? []) assert.ok(q.text.en && q.text.hi && (q.need === 'yes' || q.need === 'no'), `${s.id}/${q.id}`);
  }
  assert.ok(S.SCHEMES.length >= 25);
  for (const c of S.SCHEME_CATEGORIES) assert.ok(S.schemesIn(c).length > 0, c);
});

test('searchSchemes finds schemes from English, Hindi and Hinglish', () => {
  assert.equal(S.searchSchemes('I am a farmer and want money support')[0].id, 'pm-kisan');
  assert.ok(S.searchSchemes('मुझे घर चाहिए').some((s) => s.id.startsWith('pmay')));
  assert.equal(S.searchSchemes('street vendor loan')[0].id, 'pm-svanidhi');
  assert.ok(S.searchSchemes('scholarship for sc student').some((s) => s.id === 'scholarship-sc'));
  assert.deepEqual(S.searchSchemes('   '), []);
});

// ─── eligibility ────────────────────────────────────────────────────────────

test('a farmer is eligible for PM-KISAN once the questions are answered', () => {
  const s = S.SCHEME_BY_ID['pm-kisan'];
  const open = E.evaluate(s, profile());
  assert.equal(open.status, 'incomplete');
  assert.equal(open.pending.length, 2);
  const yes = E.evaluate(s, profile(), { has_land: 'yes', income_tax: 'no' });
  assert.equal(yes.status, 'eligible');
  const taxpayer = E.evaluate(s, profile(), { has_land: 'yes', income_tax: 'yes' });
  assert.equal(taxpayer.status, 'ineligible');
  assert.equal(taxpayer.failed[0].kind, 'question');
});

test('hard rules reject straight away, with the reason', () => {
  const student = E.evaluate(S.SCHEME_BY_ID['pm-kisan'], profile({ occupation: 'student' }));
  assert.equal(student.status, 'ineligible');
  assert.ok(student.failed.some((c) => c.kind === 'occupation'));
  const young = E.evaluate(S.SCHEME_BY_ID.apy, profile({ age: 45 }), { bank: 'yes', income_tax: 'no' });
  assert.equal(young.status, 'ineligible');
  assert.ok(young.failed.some((c) => c.kind === 'age_max'));
  const rich = E.evaluate(S.SCHEME_BY_ID['scholarship-sc'], profile({ occupation: 'student', category: 'sc', income: 900000 }));
  assert.ok(rich.failed.some((c) => c.kind === 'income'));
  const man = E.evaluate(S.SCHEME_BY_ID.pmuy, profile());
  assert.ok(man.failed.some((c) => c.kind === 'gender'));
});

test('"either / or" schemes (Stand-Up India) pass for SC/ST or women only', () => {
  const s = S.SCHEME_BY_ID['standup-india'];
  const answers = { greenfield: 'yes' };
  assert.equal(E.evaluate(s, profile({ category: 'general', gender: 'male' }), answers).status, 'ineligible');
  assert.equal(E.evaluate(s, profile({ category: 'sc', gender: 'male' }), answers).status, 'eligible');
  assert.equal(E.evaluate(s, profile({ category: 'general', gender: 'female' }), answers).status, 'eligible');
});

test('senior citizens qualify for Ayushman Vay Vandana at 70 regardless of income', () => {
  const s = S.SCHEME_BY_ID['pmjay-vvy'];
  assert.equal(E.evaluate(s, profile({ age: 71, income: 9_000_000, occupation: 'retired' })).status, 'eligible');
  assert.equal(E.evaluate(s, profile({ age: 69 })).status, 'ineligible');
});

test('recommend() drops ruled-out schemes and ranks the clearest first', () => {
  const rec = E.recommend(profile());
  assert.ok(rec.length > 3);
  assert.ok(rec.every((m) => m.verdict.status !== 'ineligible'));
  assert.ok(rec.some((m) => m.scheme.id === 'pm-kisan'));
  assert.ok(!rec.some((m) => m.scheme.id === 'pmuy'));          // a man is never offered Ujjwala
  for (let i = 1; i < rec.length; i++) assert.ok(rec[i - 1].verdict.pending.length <= rec[i].verdict.pending.length);
});

test('alternatives() suggests something else, same category first', () => {
  const alts = E.alternatives(S.SCHEME_BY_ID['pm-kisan'], profile({ occupation: 'farmer' }));
  assert.ok(alts.length > 0 && alts.every((a) => a.scheme.id !== 'pm-kisan'));
  assert.equal(alts[0].scheme.category, 'agriculture');
});

// ─── cases & languages ──────────────────────────────────────────────────────

test('case ids look right and the next desk follows the file', () => {
  const id = C.newCaseId(Date.UTC(2026, 0, 1), () => 0.5);
  assert.match(id, C.CASE_ID);
  const base = { id, schemeId: 'apy', createdAt: 1, desk: 'documents', answers: {}, docs: {} };
  const req = ['aadhaar', 'bank_passbook'];
  assert.equal(C.nextDesk(base, req), 'documents');
  const rec = (docId, status = 'verified') => ({ docId, status });
  const withDocs = { ...base, docs: { aadhaar: rec('aadhaar'), bank_passbook: rec('bank_passbook') } };
  assert.equal(C.nextDesk(withDocs, req), 'eligibility');
  assert.equal(C.nextDesk({ ...withDocs, eligibility: 'eligible' }, req), 'form');
  assert.equal(C.nextDesk({ ...withDocs, eligibility: 'ineligible' }, req), 'help');
  assert.equal(C.nextDesk({ ...withDocs, eligibility: 'eligible', submittedAt: 5 }, req), 'help');
  assert.deepEqual(C.docsProgress({ ...base, docs: { aadhaar: rec('aadhaar', 'rejected') } }, req), { done: 0, total: 2 });
});

test('the voice model is chosen per language', () => {
  assert.equal(L.voiceModelFor('hi'), 'eleven_flash_v2_5');
  assert.equal(L.voiceModelFor('en'), 'eleven_flash_v2_5');
  assert.equal(L.voiceModelFor('bn'), 'eleven_v3');
  assert.equal(L.voiceModelFor('ur'), 'eleven_v3');
  assert.equal(L.GOVT_LANGUAGES.length, 11);
  assert.equal(L.languageInfo('ur').dir, 'rtl');
  assert.equal(L.languageInfo('nope').code, 'en');
});
