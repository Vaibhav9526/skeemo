/**
 * The file vault — the citizen's papers kept in one place, each read by OCR and judged valid / needs a
 * look / invalid. Plain files + one JSON index in a directory handed in by the caller (no electron
 * imports, so it runs under plain node). The index keeps only masked values; the full text OCR read is
 * never written to disk.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { isDocId, type DocId } from '../../shared/govt/documents';
import type { DocCheck } from '../../shared/govt/cases';
import type { Analysis } from '../../shared/govt/analysis';
import type { VaultDoc } from '../../shared/govt/vaultTypes';

export type { VaultDoc };

const ID = /^[a-f0-9]{10}$/;
export const VAULT_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.bmp']);
export const MAX_VAULT_BYTES = 50 * 1024 * 1024;
const MAX_DOCS = 500;

const safeName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document';

function writeJson(path: string, data: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), 'utf8');
  renameSync(tmp, path);
}

function clean(raw: unknown): VaultDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as VaultDoc;
  if (typeof d.id !== 'string' || !ID.test(d.id) || !VAULT_EXT.has(String(d.ext))) return null;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(d.fields ?? {})) if (typeof v === 'string' && /^[a-z]{1,16}$/.test(k)) fields[k] = v.slice(0, 80);
  return {
    id: d.id, name: safeName(String(d.name ?? '')), ext: d.ext, size: Number(d.size) || 0, addedAt: Number(d.addedAt) || 0,
    docType: isDocId(d.docType) ? d.docType : null,
    status: d.status === 'valid' || d.status === 'invalid' ? d.status : 'check',
    checks: Array.isArray(d.checks) ? d.checks.slice(0, 20) : [], fields,
    read: d.read === 'ocr' || d.read === 'pdf-text' ? d.read : 'none',
  };
}

export class Vault {
  constructor(private readonly dir: string, private readonly now: () => number = Date.now) {}

  private index(): string {
    mkdirSync(join(this.dir, 'files'), { recursive: true });
    return join(this.dir, 'index.json');
  }

  list(): VaultDoc[] {
    try {
      const f = this.index();
      if (!existsSync(f)) return [];
      const raw = JSON.parse(readFileSync(f, 'utf8')) as unknown[];
      return (Array.isArray(raw) ? raw : []).map(clean).filter((d): d is VaultDoc => !!d);
    } catch { return []; }
  }

  get(id: string): VaultDoc | null { return this.list().find((d) => d.id === id) ?? null; }

  pathOf(id: string): string | null {
    const d = ID.test(id) ? this.get(id) : null;
    if (!d) return null;
    const p = join(this.dir, 'files', `${d.id}${d.ext}`);
    return existsSync(p) ? p : null;
  }

  /** Copy `srcPath` into the vault and record what the analysis said. */
  add(srcPath: string, originalName: string, analysis: Analysis, read: VaultDoc['read']): { ok: true; doc: VaultDoc } | { ok: false; error: 'too_big' | 'bad_type' | 'unreadable' } {
    const ext = extname(originalName).toLowerCase();
    if (!VAULT_EXT.has(ext)) return { ok: false, error: 'bad_type' };
    let size: number;
    try { const st = statSync(srcPath); if (!st.isFile() || st.size === 0) return { ok: false, error: 'unreadable' }; size = st.size; } catch { return { ok: false, error: 'unreadable' }; }
    if (size > MAX_VAULT_BYTES) return { ok: false, error: 'too_big' };
    const id = randomBytes(5).toString('hex');
    const idx = this.index();
    try { copyFileSync(srcPath, join(this.dir, 'files', `${id}${ext}`)); } catch { return { ok: false, error: 'unreadable' }; }
    const doc: VaultDoc = {
      id, name: safeName(originalName), ext, size, addedAt: this.now(), docType: analysis.docType, status: analysis.status,
      checks: analysis.checks, fields: analysis.fields, read,
    };
    writeJson(idx, [doc, ...this.list()].slice(0, MAX_DOCS));
    return { ok: true, doc };
  }

  remove(id: string): boolean {
    if (!ID.test(id)) return false;
    const all = this.list();
    const doc = all.find((d) => d.id === id);
    if (!doc) return false;
    try { rmSync(join(this.dir, 'files', `${doc.id}${doc.ext}`), { force: true }); } catch { /* already gone */ }
    writeJson(this.index(), all.filter((d) => d.id !== id));
    return true;
  }
}
