/**
 * On-demand translation of the scheme / document copy into languages we do not ship by hand,
 * cached on disk so each string is translated once per language. No electron imports.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { translateBatch, type Llm } from './ai';

const MAX_PER_CALL = 24;
const MAX_CHARS = 700;
const MAX_ENTRIES = 6000;

type Cache = Record<string, string>;

const key = (lang: string, s: string) => `${lang}:${createHash('sha1').update(s).digest('hex').slice(0, 20)}`;

export class TranslationCache {
  private data: Cache | null = null;
  constructor(private readonly dir: string) {}

  private load(): Cache {
    if (this.data) return this.data;
    try {
      const f = join(this.dir, 'translations.json');
      this.data = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Cache) : {};
    } catch { this.data = {}; }
    return this.data;
  }

  private save(): void {
    const d = this.load();
    const keys = Object.keys(d);
    if (keys.length > MAX_ENTRIES) for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete d[k];
    mkdirSync(this.dir, { recursive: true });
    const f = join(this.dir, 'translations.json');
    writeFileSync(`${f}.tmp`, JSON.stringify(d), 'utf8');
    renameSync(`${f}.tmp`, f);
  }

  /** Cached translations for `strings`; strings not yet translated map to '' (caller shows English). */
  peek(lang: string, strings: readonly string[]): string[] {
    const d = this.load();
    return strings.map((s) => d[key(lang, s)] ?? '');
  }

  /** Translate whatever is missing (in small batches), cache it, and return all of it. */
  async fill(llm: Llm, lang: string, strings: readonly string[]): Promise<{ ok: true; out: string[] } | { ok: false; error: string; out: string[] }> {
    const d = this.load();
    const todo = [...new Set(strings.filter((s) => s && s.length <= MAX_CHARS && !d[key(lang, s)]))];
    let error = '';
    for (let i = 0; i < todo.length; i += MAX_PER_CALL) {
      const part = todo.slice(i, i + MAX_PER_CALL);
      const r = await translateBatch(llm, lang, part);
      if (!r.ok) { error = r.error; break; }
      part.forEach((s, j) => { if (r.out[j]?.trim()) d[key(lang, s)] = r.out[j].trim(); });
      this.save();
    }
    const out = strings.map((s) => d[key(lang, s)] ?? '');
    return error && out.some((o, i) => !o && strings[i]) ? { ok: false, error, out } : { ok: true, out };
  }
}
