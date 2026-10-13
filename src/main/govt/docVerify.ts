/**
 * Document Verification — cross-checks an uploaded paper against what the scheme asked for and
 * against the citizen's own profile.
 *
 * Local checks (always): format, size, image sharpness/resolution, ID-number validity (Aadhaar
 * Verhoeff, PAN, IFSC), keyword fit and name match on a PDF's text layer.
 * AI read (when the user's Claude login is reachable): the paper's type, name, number, dates and
 * amounts are read off even a photo, then compared the same way.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import {
  DOCS, findIdInText, isValidAadhaar, isValidIfsc, isValidPan, keywordScore, nameMatches, type DocId,
} from '../../shared/govt/documents';
import type { DocCheck, DocStatus } from '../../shared/govt/cases';
import type { CitizenProfile } from '../../shared/govt/profile';
import { readDocument, type DocRead, type Llm } from './ai';
import { isImageExt, type FitResult } from './docFit';

type Canvas = import('@napi-rs/canvas').Canvas;

/** Variance of the Laplacian on a downscaled greyscale copy — low means blurry. */
export async function sharpness(path: string): Promise<{ score: number; width: number; height: number } | null> {
  try {
    const cv = await import('@napi-rs/canvas');
    const img = await cv.loadImage(readFileSync(path));
    const k = Math.min(1, 640 / Math.max(img.width, img.height));
    const w = Math.max(8, Math.round(img.width * k)), h = Math.max(8, Math.round(img.height * k));
    const c: Canvas = cv.createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let sum = 0, sum2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const v = 4 * g[y * w + x] - g[y * w + x - 1] - g[y * w + x + 1] - g[(y - 1) * w + x] - g[(y + 1) * w + x];
      sum += v; sum2 += v * v; n++;
    }
    const mean = sum / n;
    return { score: sum2 / n - mean * mean, width: img.width, height: img.height };
  } catch { return null; }
}

async function pdfText(path: string): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(readFileSync(path)) });
    try { return (await parser.getText()).text.slice(0, 40_000); } finally { await parser.destroy().catch(() => undefined); }
  } catch { return ''; }
}

const ID_LABEL: Record<string, string> = { aadhaar: 'Aadhaar', pan: 'PAN', ifsc: 'IFSC', none: '' };
const BLUR_LIMIT = 45; // Laplacian variance below this reads as out-of-focus on a scanned page

export interface VerifyResult {
  status: DocStatus;
  checks: DocCheck[];
  fields?: Record<string, string>;
}

const REJECT_IDS: ReadonlySet<DocCheck['id']> = new Set(['format_bad', 'size_cannot', 'type_mismatch', 'type_words', 'id_invalid', 'expired']);

export function statusOf(checks: readonly DocCheck[]): DocStatus {
  if (checks.some((c) => c.ok === false && REJECT_IDS.has(c.id))) return 'rejected';
  if (checks.some((c) => c.ok === false || (c.ok === null && c.id !== 'ai_off' && c.id !== 'scanned_pdf'))) return 'attention';
  return 'verified';
}

export async function verifyDocument(opts: {
  docId: DocId;
  /** The file as the citizen picked it. */
  originalPath: string;
  originalName: string;
  fit: FitResult;
  limitKB: number;
  profile: CitizenProfile;
  llm: Llm | null;
  /** The scheme's income ceiling, to compare an income certificate against. */
  incomeLimit?: number;
  /** Words read off the file by local OCR (or its PDF text layer). */
  ocrText?: string;
}): Promise<VerifyResult> {
  const { docId, fit, profile } = opts;
  const spec = DOCS[docId];
  const checks: DocCheck[] = [];
  const ext = extname(opts.originalName).toLowerCase();
  const isImage = isImageExt(ext);

  // ── format & size ──
  if (fit.action === 'failed') {
    checks.push({ id: fit.reason === 'too_big' ? 'size_cannot' : 'format_bad', ok: false, data: { limit: opts.limitKB, accepted: spec.formats.join(', ').toUpperCase() } });
    return { status: 'rejected', checks };
  }
  checks.push({ id: 'format_ok', ok: true });
  const kb = (n: number) => Math.round(n / 1024);
  if (fit.action === 'kept') checks.push({ id: 'size_ok', ok: true, data: { size: kb(fit.bytesAfter), limit: opts.limitKB } });
  else if (fit.action === 'enlarged') checks.push({ id: 'size_grown', ok: true, data: { before: kb(fit.bytesBefore), after: kb(fit.bytesAfter) } });
  else checks.push({ id: 'size_fixed', ok: true, data: { before: kb(fit.bytesBefore), after: kb(fit.bytesAfter), limit: opts.limitKB } });
  if (fit.rasterised) checks.push({ id: 'scanned_pdf', ok: null });

  // ── picture quality ──
  let text = '';
  if (isImage || fit.outName.toLowerCase().endsWith('.jpg')) {
    const sh = await sharpness(isImage ? opts.originalPath : fit.outPath);
    if (sh) {
      const minSide = Math.min(sh.width, sh.height);
      if (spec.id === 'photo') {
        checks.push(minSide >= 200 ? { id: 'photo_ok', ok: true, data: { w: sh.width, h: sh.height } } : { id: 'low_res', ok: false, data: { w: sh.width, h: sh.height } });
        if (sh.score < BLUR_LIMIT / 3) checks.push({ id: 'blurry', ok: false });
      } else if (minSide < 500) checks.push({ id: 'low_res', ok: false, data: { w: sh.width, h: sh.height } });
      else checks.push(sh.score < BLUR_LIMIT ? { id: 'blurry', ok: false } : { id: 'legible', ok: true });
    }
  } else if (ext === '.pdf') {
    text = await pdfText(opts.originalPath);
  }
  if (text.replace(/\s/g, '').length < 60 && opts.ocrText) text = opts.ocrText;

  // The passport photo needs no reading — only picture checks apply.
  if (spec.imageOnly) return { status: statusOf(checks), checks };

  // ── what the paper says (AI read, else the PDF text layer) ──
  let read: DocRead | null = null;
  if (opts.llm) {
    const r = await readDocument(opts.llm, fit.outPath || opts.originalPath, docId).catch(() => null);
    if (r && r.ok) read = r.read;
  }
  if (!read && !text) checks.push({ id: 'ai_off', ok: null });
  const haystack = [text, read ? `${read.name} ${read.idNumber} ${read.address} ${read.state}` : ''].join('\n');

  // type
  if (read) {
    if (read.docType === 'unknown') checks.push({ id: 'type_unknown', ok: null });
    else if (read.docType === docId) checks.push({ id: 'type_match', ok: true });
    else checks.push({ id: 'type_mismatch', ok: false, data: { found: DOCS[read.docType].name.en, expected: spec.name.en } });
    if (!read.legible) checks.push({ id: 'blurry', ok: false });
  } else if (text.length > 60) {
    if (keywordScore(spec, text) > 0) checks.push({ id: 'type_match', ok: true });
    // plenty of text and none of the wording a genuine one carries → almost certainly the wrong file
    else checks.push(text.length > 200 ? { id: 'type_words', ok: false, data: { expected: spec.name.en } } : { id: 'type_unknown', ok: null });
  }

  // ID number
  if (spec.idCheck !== 'none') {
    const raw = read?.idNumber || '';
    const candidate = (raw && findIdInText(spec.idCheck, raw)) || findIdInText(spec.idCheck, haystack);
    if (candidate) {
      checks.push({ id: 'id_valid', ok: true, data: { kind: ID_LABEL[spec.idCheck], value: spec.idCheck === 'aadhaar' ? `XXXX XXXX ${candidate.slice(-4)}` : candidate } });
    } else if (raw) {
      const valid = spec.idCheck === 'aadhaar' ? isValidAadhaar(raw) : spec.idCheck === 'pan' ? isValidPan(raw) : isValidIfsc(raw);
      checks.push({ id: valid ? 'id_valid' : 'id_invalid', ok: valid, data: { kind: ID_LABEL[spec.idCheck], value: raw.slice(0, 20) } });
    } else if (text.length > 60 || read) checks.push({ id: 'id_missing', ok: null, data: { kind: ID_LABEL[spec.idCheck] } });
  }

  // holder name vs profile
  if (spec.hasName) {
    const printed = read?.name || '';
    if (printed || text.length > 60) {
      const ok = nameMatches(profile.name, `${printed}\n${text}`);
      checks.push({ id: ok ? 'name_match' : 'name_mismatch', ok, data: { found: printed || '—', expected: profile.name } });
    } else if (read) checks.push({ id: 'name_unknown', ok: null });
  }

  if (read?.expired === true) checks.push({ id: 'expired', ok: false });
  else if (read?.expired === false) checks.push({ id: 'not_expired', ok: true });

  if (docId === 'income_cert' && read?.amount != null && opts.incomeLimit !== undefined && read.amount > opts.incomeLimit) {
    checks.push({ id: 'income_over', ok: false, data: { amount: read.amount, limit: opts.incomeLimit } });
  }

  const fields: Record<string, string> = {};
  if (read) {
    if (read.name) fields.name = read.name;
    if (read.idNumber) fields.number = docId === 'aadhaar' ? `XXXX XXXX ${read.idNumber.replace(/\D/g, '').slice(-4)}` : read.idNumber;
    if (read.dob) fields.dob = read.dob;
    if (read.address) fields.address = read.address;
    if (read.state) fields.state = read.state;
    if (read.amount != null) fields.amount = String(read.amount);
    if (read.notes) fields.notes = read.notes;
  }
  return { status: statusOf(checks), checks, ...(Object.keys(fields).length ? { fields } : {}) };
}
