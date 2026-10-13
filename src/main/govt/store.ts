/**
 * Samadhaan's local data: the citizen profile, their case files and app settings.
 * Plain JSON files in a directory handed in by the caller — no electron imports, so it runs
 * (and is tested) under plain node. Writes are atomic (temp file + rename).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeStoredProfile, type CitizenProfile } from '../../shared/govt/profile';
import { CASE_ID, DESKS, newCaseId, type CaseFile, type DeskId, type DocRecord } from '../../shared/govt/cases';
import { isDocId } from '../../shared/govt/documents';
import { isSchemeId } from '../../shared/govt/schemes';
import type { Answers } from '../../shared/govt/eligibility';

export interface GovtSettings {
  language: string;
  /** Read worker replies aloud automatically. */
  autoVoice: boolean;
  /** The citizen agreed to let the AI read uploaded papers (the file is sent to their own Claude account). */
  aiDocRead: boolean;
  /** Override for the SuperJargon executable. */
  superJargonPath: string;
  /** ElevenLabs voice ids per desk (empty = built-in default). */
  voices: Record<string, string>;
}

export const DEFAULT_SETTINGS: GovtSettings = { language: 'en', autoVoice: false, aiDocRead: false, superJargonPath: '', voices: {} };

function writeJson(path: string, data: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
  renameSync(tmp, path);
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

const MAX_CASES = 200;

function cleanAnswers(v: unknown): Answers {
  const out: Answers = {};
  if (v && typeof v === 'object') {
    for (const [k, a] of Object.entries(v as Record<string, unknown>)) {
      if (/^[a-z0-9_]{1,40}$/.test(k) && (a === 'yes' || a === 'no')) out[k] = a;
    }
  }
  return out;
}

function cleanDoc(raw: unknown): DocRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as DocRecord;
  if (!isDocId(d.docId) || typeof d.fittedPath !== 'string' || !['verified', 'attention', 'rejected'].includes(d.status)) return null;
  return {
    docId: d.docId, originalName: String(d.originalName ?? '').slice(0, 200), fittedPath: d.fittedPath,
    fittedName: String(d.fittedName ?? '').slice(0, 200), bytesBefore: Number(d.bytesBefore) || 0, bytesAfter: Number(d.bytesAfter) || 0,
    limitKB: Number(d.limitKB) || 0, status: d.status, checks: Array.isArray(d.checks) ? d.checks.slice(0, 30) : [],
    ...(d.fields && typeof d.fields === 'object' ? { fields: d.fields } : {}), at: Number(d.at) || Date.now(),
  };
}

function cleanCase(raw: unknown): CaseFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as CaseFile;
  if (typeof c.id !== 'string' || !CASE_ID.test(c.id) || !isSchemeId(c.schemeId)) return null;
  const docs: CaseFile['docs'] = {};
  for (const [k, v] of Object.entries(c.docs ?? {})) {
    const rec = cleanDoc(v);
    if (rec && isDocId(k) && rec.docId === k) docs[k] = rec;
  }
  return {
    id: c.id, schemeId: c.schemeId, createdAt: Number(c.createdAt) || Date.now(),
    desk: (DESKS as readonly string[]).includes(c.desk) ? c.desk : 'registration',
    answers: cleanAnswers(c.answers), docs,
    ...(c.eligibility === 'eligible' || c.eligibility === 'ineligible' ? { eligibility: c.eligibility } : {}),
    ...(typeof c.submittedAt === 'number' ? { submittedAt: c.submittedAt } : {}),
  };
}

export class GovtStore {
  constructor(private readonly dir: string, private readonly now: () => number = Date.now) {}

  private file(name: string): string {
    mkdirSync(this.dir, { recursive: true });
    return join(this.dir, name);
  }

  // ── profile ──
  getProfile(): CitizenProfile | null {
    return sanitizeStoredProfile(readJson<unknown>(this.file('profile.json'), null));
  }
  saveProfile(p: CitizenProfile): void { writeJson(this.file('profile.json'), p); }
  /** Forget the citizen entirely: profile and every case file record. Fitted files stay on disk. */
  clearProfile(): void {
    rmSync(this.file('profile.json'), { force: true });
    rmSync(this.file('cases.json'), { force: true });
  }

  // ── settings ──
  getSettings(): GovtSettings {
    const raw = readJson<Partial<GovtSettings>>(this.file('settings.json'), {});
    const voices: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.voices ?? {})) if (typeof v === 'string' && /^[A-Za-z0-9]{10,40}$/.test(v)) voices[k] = v;
    return {
      language: typeof raw.language === 'string' ? raw.language : 'en',
      autoVoice: raw.autoVoice === true,
      aiDocRead: raw.aiDocRead === true,
      superJargonPath: typeof raw.superJargonPath === 'string' ? raw.superJargonPath : '',
      voices,
    };
  }
  saveSettings(patch: Partial<GovtSettings>): GovtSettings {
    const next = { ...this.getSettings(), ...patch };
    writeJson(this.file('settings.json'), next);
    return next;
  }

  /** Secret blob (the encrypted ElevenLabs key) — opaque to this class. */
  getSecret(): string { return readJson<{ v?: string }>(this.file('secret.json'), {}).v ?? ''; }
  saveSecret(v: string): void { writeJson(this.file('secret.json'), { v }); }

  // ── cases ──
  listCases(): CaseFile[] {
    const raw = readJson<unknown[]>(this.file('cases.json'), []);
    return (Array.isArray(raw) ? raw : []).map(cleanCase).filter((c): c is CaseFile => !!c);
  }
  private saveCases(cases: CaseFile[]): void { writeJson(this.file('cases.json'), cases.slice(0, MAX_CASES)); }

  getCase(id: string): CaseFile | null { return this.listCases().find((c) => c.id === id) ?? null; }

  createCase(schemeId: string): CaseFile {
    if (!isSchemeId(schemeId)) throw new Error('Unknown scheme.');
    const cases = this.listCases();
    let id = newCaseId(this.now());
    while (cases.some((c) => c.id === id)) id = newCaseId(this.now());
    const c: CaseFile = { id, schemeId, createdAt: this.now(), desk: 'registration', answers: {}, docs: {} };
    this.saveCases([c, ...cases]);
    return c;
  }

  /** Apply a change to one case and save it. Returns the new copy, or null if it is gone. */
  updateCase(id: string, fn: (c: CaseFile) => CaseFile): CaseFile | null {
    const cases = this.listCases();
    const i = cases.findIndex((c) => c.id === id);
    if (i < 0) return null;
    const next = cleanCase(fn(structuredClone(cases[i])));
    if (!next) return null;
    cases[i] = next;
    this.saveCases(cases);
    return next;
  }

  moveCase(id: string, desk: DeskId): CaseFile | null { return this.updateCase(id, (c) => ({ ...c, desk })); }
  setAnswers(id: string, answers: Answers): CaseFile | null { return this.updateCase(id, (c) => ({ ...c, answers: cleanAnswers({ ...c.answers, ...answers }) })); }
  setDoc(id: string, rec: DocRecord): CaseFile | null { return this.updateCase(id, (c) => ({ ...c, docs: { ...c.docs, [rec.docId]: rec }, ...(c.eligibility ? { eligibility: undefined } : {}) })); }
  removeDoc(id: string, docId: string): CaseFile | null {
    return this.updateCase(id, (c) => {
      const docs = { ...c.docs };
      if (isDocId(docId)) delete docs[docId];
      return { ...c, docs };
    });
  }
  setEligibility(id: string, result: 'eligible' | 'ineligible'): CaseFile | null { return this.updateCase(id, (c) => ({ ...c, eligibility: result })); }
  markSubmitted(id: string): CaseFile | null { return this.updateCase(id, (c) => ({ ...c, submittedAt: this.now() })); }
  removeCase(id: string): boolean {
    const cases = this.listCases();
    const next = cases.filter((c) => c.id !== id);
    if (next.length === cases.length) return false;
    this.saveCases(next);
    return true;
  }
}
