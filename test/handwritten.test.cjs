'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { parseHandwrittenRequest, hasHandwrittenAlias, extractHtml, sanitizeHandwrittenHtml } = loadTs('src/shared/handwritten.ts');
const { runHandwritten } = loadTs('src/main/handwritten.ts');

const f = (name) => ({ path: `D:\in\${name}`, name });

test('only a real @handwritten token counts', () => {
  for (const t of ['hello', 'a@handwritten', '@handwrittenx', 'mail me@handwritten.com']) assert.equal(hasHandwrittenAlias(t), false, t);
  assert.equal(hasHandwrittenAlias('@handwritten explain gravity'), true);
  assert.equal(hasHandwrittenAlias('please (@handwritten) this'), true);
});

test('parse: question, image-only and bad input', () => {
  assert.equal(parseHandwrittenRequest('hi', []), null);
  assert.equal(parseHandwrittenRequest('@handwritten explain a transistor', []).question, 'explain a transistor');
  assert.equal(parseHandwrittenRequest('@handwritten', [f('q.png')]).files.length, 1);
  assert.throws(() => parseHandwrittenRequest('@handwritten', []), /Ask something/);
  assert.throws(() => parseHandwrittenRequest('@handwritten x', [f('notes.docx')]), /images and PDFs/);
  assert.throws(() => parseHandwrittenRequest('@handwritten x', Array.from({ length: 6 }, (_, i) => f(`${i}.png`))), /Up to/);
});

test('extractHtml pulls the page out of fences and chatter', () => {
  assert.match(extractHtml('Sure!\n```html\n<!doctype html><html><body>x</body></html>\n```\nenjoy'), /^<!doctype html>.*<\/html>$/s);
  assert.equal(extractHtml('no page here'), null);
});

test('sanitize removes scripts, handlers and remote loads but keeps svg', () => {
  const out = sanitizeHandwrittenHtml('<html><script>x()</script><link rel=stylesheet href="http://a"><svg onclick="x()"><circle r="2"/></svg><img src="https://e.com/a.png"><div style="background:url(https://e.com/x)">@import url(a);</div></html>');
  assert.doesNotMatch(out, /script|onclick|https?:|@import|<link/i);
  assert.match(out, /<svg><circle r="2"\/><\/svg>/);
});

test('runHandwritten writes the rendered PDF, and surfaces failures', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hw-'));
  try {
    const req = { question: 'How does a lever work?', files: [] };
    let seen;
    const ok = await runHandwritten(req, dir, {
      llm: async (p, _t, files) => { seen = { p, files }; return { ok: true, text: '<!doctype html><html><body><svg/></body></html>' }; },
      renderPdf: async () => Buffer.from('%PDF-1.4\n/Type /Page\n%%EOF'),
      now: () => 1,
    });
    assert.equal(ok.ok, true);
    assert.match(seen.p, /inline <svg>/);
    assert.ok(fs.existsSync(ok.outputs[0].output));
    assert.match(path.basename(ok.outputs[0].output), /^handwritten-how-does-a-lever-work-/);

    const noPage = await runHandwritten(req, dir, { llm: async () => ({ ok: true, text: 'sorry' }), renderPdf: async () => Buffer.alloc(0) });
    assert.equal(noPage.ok, false);
    const llmFail = await runHandwritten(req, dir, { llm: async () => ({ ok: false, error: 'boom' }), renderPdf: async () => Buffer.alloc(0) });
    assert.equal(llmFail.error, 'boom');
    const renderFail = await runHandwritten(req, dir, { llm: async () => ({ ok: true, text: '<html></html>' }), renderPdf: async () => { throw new Error('nope'); } });
    assert.match(renderFail.error, /nope/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
