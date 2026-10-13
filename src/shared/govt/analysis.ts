/**
 * What the vault concludes about a file from the text OCR read off it: which paper it is, whether the
 * number on it is genuine (Aadhaar checksum, PAN / IFSC shape), whether it carries the citizen's name and
 * whether it has expired. Pure — the OCR itself lives in main/govt/ocr.ts.
 */
import { DOCS, DOC_IDS, findIdInText, isValidAadhaar, keywordScore, nameMatches, type DocId } from './documents';
import type { DocCheck } from './cases';
import type { CitizenProfile } from './profile';

export type VaultStatus = 'valid' | 'check' | 'invalid';

export interface Analysis {
  docType: DocId | null;
  status: VaultStatus;
  checks: DocCheck[];
  /** Masked values worth showing (never a full Aadhaar number). */
  fields: Record<string, string>;
}

const MIN_TEXT = 25;

/** Every paper type ranked by how many of its telltale words appear in `text`. */
export function classifyText(text: string): Array<{ id: DocId; score: number }> {
  const out = DOC_IDS.filter((id) => DOCS[id].keywords.length).map((id) => {
    const spec = DOCS[id];
    let score = keywordScore(spec, text);
    if (spec.idCheck === 'aadhaar' && findIdInText('aadhaar', text)) score += 3;
    if (spec.idCheck === 'pan' && findIdInText('pan', text)) score += 3;
    if (spec.idCheck === 'ifsc' && findIdInText('ifsc', text)) score += 2;
    return { id, score };
  }).filter((x) => x.score > 0);
  return out.sort((a, b) => b.score - a.score);
}

const DATE = /(?:valid\s*(?:up\s*to|upto|till|until|to|thru)|expiry(?:\s*date)?|expires?(?:\s*on)?|date\s*of\s*expiry)\s*[:\-]?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/gi;

/** Explicit expiry dates found in the text that are already in the past. */
export function expiredDates(text: string, now: Date): { found: boolean; expired: boolean } {
  let found = false, expired = false;
  for (const m of text.matchAll(DATE)) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (Number.isNaN(d.getTime())) continue;
    found = true;
    if (d < now) expired = true;
  }
  return { found, expired };
}

const mask = (id: DocId, v: string) => (id === 'aadhaar' ? `XXXX XXXX ${v.slice(-4)}` : v);

/**
 * `expected` pins the paper type (the vault slot or the counter asked for it); without it the best-scoring
 * type is used.
 */
export function analyzeDocument(text: string, profile: CitizenProfile, opts: { expected?: DocId; now?: Date } = {}): Analysis {
  const now = opts.now ?? new Date();
  const clean = text.replace(/\s+/g, ' ').trim();
  const checks: DocCheck[] = [];
  const fields: Record<string, string> = {};
  if (clean.length < MIN_TEXT) {
    return { docType: opts.expected ?? null, status: 'check', checks: [{ id: 'ocr_empty', ok: null }], fields };
  }
  const ranked = classifyText(clean);
  const best = ranked[0];
  const docType: DocId | null = opts.expected ?? (best && best.score >= 2 ? best.id : best && best.score >= 1 && ranked.length === 1 ? best.id : null);
  if (!docType) {
    return { docType: null, status: 'check', checks: [{ id: 'type_unknown', ok: null }], fields };
  }
  const spec = DOCS[docType];
  if (opts.expected) {
    const score = ranked.find((r) => r.id === docType)?.score ?? 0;
    if (score > 0) checks.push({ id: 'type_match', ok: true });
    else if (clean.length > 200) checks.push({ id: 'type_words', ok: false, data: { expected: spec.name.en } });
    else checks.push({ id: 'type_unknown', ok: null });
  } else {
    checks.push({ id: 'type_detected', ok: true, data: { doc: docType } });
  }

  if (spec.idCheck !== 'none') {
    const found = findIdInText(spec.idCheck, clean);
    const label = spec.idCheck === 'aadhaar' ? 'Aadhaar' : spec.idCheck === 'pan' ? 'PAN' : 'IFSC';
    if (found) {
      checks.push({ id: 'id_valid', ok: true, data: { kind: label, value: mask(docType, found) } });
      fields.number = mask(docType, found);
    } else if (spec.idCheck === 'aadhaar') {
      const raw = /(?<!\d)([2-9]\d{3})[\s-]?(\d{4})[\s-]?(\d{4})(?!\d)/.exec(clean);
      if (raw && !isValidAadhaar(`${raw[1]}${raw[2]}${raw[3]}`)) checks.push({ id: 'id_invalid', ok: false, data: { kind: label, value: `XXXX XXXX ${raw[3]}` } });
      else checks.push({ id: 'id_missing', ok: null, data: { kind: label } });
    } else {
      checks.push({ id: 'id_missing', ok: null, data: { kind: label } });
    }
  }

  if (spec.hasName) {
    if (nameMatches(profile.name, clean)) checks.push({ id: 'name_match', ok: true });
    else checks.push({ id: 'name_missing', ok: false, data: { expected: profile.name } });
  }

  const exp = expiredDates(clean, now);
  if (exp.found) checks.push(exp.expired ? { id: 'expired', ok: false } : { id: 'not_expired', ok: true });

  const status: VaultStatus = checks.some((c) => (c.id === 'id_invalid' || c.id === 'expired' || c.id === 'type_words') && c.ok === false)
    ? 'invalid'
    : checks.some((c) => c.ok === false || c.ok === null) ? 'check' : 'valid';
  return { docType, status, checks, fields };
}
