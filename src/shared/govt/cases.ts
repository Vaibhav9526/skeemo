/**
 * A case file — the folder that travels from desk to desk (carried by the peon) for one
 * scheme application. Types and small pure helpers only.
 */
import type { Answers } from './eligibility';
import type { DocId } from './documents';

export const DESKS = ['reception', 'registration', 'documents', 'eligibility', 'form', 'help'] as const;
export type DeskId = (typeof DESKS)[number];

/** The five numbered counters, in journey order (the sign boards on the wall). */
export const JOURNEY: readonly DeskId[] = ['registration', 'documents', 'eligibility', 'form', 'help'];

export const isDeskId = (v: unknown): v is DeskId => typeof v === 'string' && (DESKS as readonly string[]).includes(v);

/** One line of a document report, rendered by the UI in the citizen's language. */
export interface DocCheck {
  id:
    | 'format_ok' | 'format_bad' | 'size_ok' | 'size_fixed' | 'size_cannot' | 'size_small' | 'size_grown'
    | 'legible' | 'blurry' | 'low_res' | 'id_valid' | 'id_invalid' | 'id_missing'
    | 'name_match' | 'name_mismatch' | 'name_missing' | 'name_unknown' | 'type_match' | 'type_mismatch' | 'type_words' | 'type_unknown' | 'type_detected' | 'ocr_empty'
    | 'expired' | 'not_expired' | 'ai_off' | 'scanned_pdf' | 'photo_ok' | 'photo_big' | 'income_over';
  ok: boolean | null;
  /** Numbers / names the sentence needs (before, after, limit, found, expected …). */
  data?: Record<string, string | number>;
}

export type DocStatus = 'verified' | 'attention' | 'rejected';

export interface DocRecord {
  docId: DocId;
  /** The file the citizen picked. */
  originalName: string;
  /** The ready-to-upload copy (compressed / resized / converted if it had to be). */
  fittedPath: string;
  fittedName: string;
  bytesBefore: number;
  bytesAfter: number;
  /** The upload limit the file was fitted to, in KB. */
  limitKB: number;
  status: DocStatus;
  checks: DocCheck[];
  /** What the AI read off the paper, if it could (name, number …). */
  fields?: Record<string, string>;
  at: number;
}

export interface CaseFile {
  id: string;
  schemeId: string;
  createdAt: number;
  /** Where the folder physically is right now. */
  desk: DeskId;
  answers: Answers;
  docs: Partial<Record<DocId, DocRecord>>;
  /** Result of the last eligibility run on the full set of answers. */
  eligibility?: 'eligible' | 'ineligible';
  submittedAt?: number;
}

/** "SMD-2026-4F7A2C" — short, readable aloud, unique enough for a local file. */
export function newCaseId(now = Date.now(), rand = Math.random): string {
  const y = new Date(now).getFullYear();
  const tail = Math.floor(rand() * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
  return `SMD-${y}-${tail}`;
}

export const CASE_ID = /^SMD-\d{4}-[0-9A-F]{6}$/;

/** The counter the citizen should visit next, given what the folder already holds. */
export function nextDesk(c: CaseFile, required: readonly DocId[]): DeskId {
  const done = required.every((d) => c.docs[d] && c.docs[d]!.status !== 'rejected');
  if (!done) return 'documents';
  if (!c.eligibility) return 'eligibility';
  if (c.eligibility === 'ineligible') return 'help';
  if (!c.submittedAt) return 'form';
  return 'help';
}

export function docsProgress(c: CaseFile, required: readonly DocId[]): { done: number; total: number } {
  return { done: required.filter((d) => c.docs[d] && c.docs[d]!.status !== 'rejected').length, total: required.length };
}
