/**
 * The Librarian's desk — a folder of everything the class has produced, kept per work
 * session (the way a chat app keeps one conversation per chat). A session starts the
 * first time the desk is used after the app launches and can also be started by hand.
 *
 *   <root>/sessions.json            { current, sessions: [{ id, name, createdAt }] }
 *   <root>/<session>/files.json     [{ id, name, kind, size, addedAt, agent }]
 *   <root>/<session>/<kind>/<file>  the files themselves (copies — originals stay where the tool wrote them)
 *
 * No electron imports: the directory is injected so this runs under plain node.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

export type DeskKind = 'pdf' | 'text' | 'research' | 'image' | 'other';
export const DESK_KINDS: readonly DeskKind[] = ['pdf', 'text', 'research', 'image', 'other'];

export interface DeskSession { id: string; name: string; createdAt: number }
export interface DeskFile { id: string; name: string; kind: DeskKind; size: number; addedAt: number; agent: string }
export interface DeskSessionInfo extends DeskSession { files: number; bytes: number; counts: Record<DeskKind, number> }

const ID = /^[a-f0-9]{10}$/;
const MAX_TEXT = 2_000_000;
const emptyCounts = (): Record<DeskKind, number> => ({ pdf: 0, text: 0, research: 0, image: 0, other: 0 });

export function kindOf(name: string): DeskKind {
  const e = extname(name).toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (['.txt', '.md', '.markdown', '.csv'].includes(e)) return 'text';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(e)) return 'image';
  return 'other';
}

const safeName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'untitled';
const newId = () => randomBytes(5).toString('hex');

function writeJson(path: string, data: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), 'utf8');
  renameSync(tmp, path);
}

interface Index { current: string | null; sessions: DeskSession[] }

export class Desk {
  private index: Index | null = null;
  private launched = false;
  constructor(private readonly root: string, private readonly now: () => number = Date.now) {}

  private loadIndex(): Index {
    if (this.index) return this.index;
    let idx: Index = { current: null, sessions: [] };
    try {
      const raw = JSON.parse(readFileSync(join(this.root, 'sessions.json'), 'utf8')) as Index;
      if (Array.isArray(raw.sessions)) idx = { current: raw.current ?? null, sessions: raw.sessions.filter((s) => ID.test(s.id)) };
    } catch { /* first run */ }
    this.index = idx;
    return idx;
  }
  private saveIndex(): void { mkdirSync(this.root, { recursive: true }); writeJson(join(this.root, 'sessions.json'), this.loadIndex()); }

  private filesOf(id: string): DeskFile[] {
    try { return JSON.parse(readFileSync(join(this.root, id, 'files.json'), 'utf8')) as DeskFile[]; } catch { return []; }
  }
  private saveFiles(id: string, files: DeskFile[]): void { mkdirSync(join(this.root, id), { recursive: true }); writeJson(join(this.root, id, 'files.json'), files); }

  /** Every app launch is a fresh session — made lazily so an unused launch leaves nothing behind. */
  private ensureCurrent(): DeskSession {
    const idx = this.loadIndex();
    if (!this.launched) {
      this.launched = true;
      const last = idx.sessions.find((s) => s.id === idx.current);
      // Reuse an empty session from an earlier launch instead of piling up blanks.
      if (!(last && this.filesOf(last.id).length === 0)) return this.newSession();
    }
    return idx.sessions.find((s) => s.id === idx.current) ?? this.newSession();
  }

  newSession(name?: string): DeskSession {
    const idx = this.loadIndex();
    this.launched = true;
    const at = this.now();
    const n = idx.sessions.length + 1;
    const d = new Date(at);
    const s: DeskSession = {
      id: newId(),
      name: safeName(name ?? '') !== 'untitled' && name ? safeName(name) : `Session ${n} · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
      createdAt: at,
    };
    idx.sessions.unshift(s);
    idx.current = s.id;
    mkdirSync(join(this.root, s.id), { recursive: true });
    this.saveIndex();
    return s;
  }

  sessions(): { current: string; sessions: DeskSessionInfo[] } {
    const cur = this.ensureCurrent();
    const out = this.loadIndex().sessions.map((s) => {
      const files = this.filesOf(s.id);
      const counts = emptyCounts();
      for (const f of files) counts[f.kind] += 1;
      return { ...s, files: files.length, bytes: files.reduce((n, f) => n + f.size, 0), counts };
    });
    return { current: cur.id, sessions: out };
  }

  select(id: string): boolean {
    const idx = this.loadIndex();
    if (!idx.sessions.some((s) => s.id === id)) return false;
    idx.current = id;
    this.saveIndex();
    return true;
  }

  rename(id: string, name: string): boolean {
    const s = this.loadIndex().sessions.find((x) => x.id === id);
    if (!s) return false;
    s.name = safeName(name);
    this.saveIndex();
    return true;
  }

  /** Remove a session and everything in it. */
  remove(id: string): boolean {
    const idx = this.loadIndex();
    if (!ID.test(id) || !idx.sessions.some((s) => s.id === id)) return false;
    rmSync(join(this.root, id), { recursive: true, force: true });
    idx.sessions = idx.sessions.filter((s) => s.id !== id);
    if (idx.current === id) idx.current = idx.sessions[0]?.id ?? null;
    this.saveIndex();
    return true;
  }

  /** Empty a session but keep it (the "Clear chat" of the desk). */
  clear(id: string): boolean {
    if (!ID.test(id) || !this.loadIndex().sessions.some((s) => s.id === id)) return false;
    for (const k of DESK_KINDS) rmSync(join(this.root, id, k), { recursive: true, force: true });
    this.saveFiles(id, []);
    return true;
  }

  list(id: string): DeskFile[] {
    if (!ID.test(id)) return [];
    return this.filesOf(id).sort((a, b) => b.addedAt - a.addedAt);
  }

  private place(sessionId: string, kind: DeskKind, name: string, write: (dest: string) => void, agent: string): DeskFile {
    const dir = join(this.root, sessionId, kind);
    mkdirSync(dir, { recursive: true });
    const files = this.filesOf(sessionId);
    const ext = extname(name);
    const stem = basename(name, ext);
    let final = name;
    for (let i = 2; existsSync(join(dir, final)); i++) final = `${stem} (${i})${ext}`;
    const dest = join(dir, final);
    write(dest);
    const f: DeskFile = { id: newId(), name: final, kind, size: statSync(dest).size, addedAt: this.now(), agent: agent.slice(0, 40) };
    files.push(f);
    this.saveFiles(sessionId, files);
    return f;
  }

  /** File a finished piece of work (a PDF, a converted image…) into the current session. */
  addFile(srcPath: string, agent: string, kind?: DeskKind): DeskFile {
    const s = this.ensureCurrent();
    const name = safeName(basename(srcPath));
    return this.place(s.id, kind ?? kindOf(name), name, (dest) => copyFileSync(srcPath, dest), agent);
  }

  /** File a note or research finding as a text file in the current session. */
  saveText(name: string, text: string, kind: 'text' | 'research', agent: string): DeskFile {
    const s = this.ensureCurrent();
    const base = safeName(name).replace(/\.(txt|md)$/i, '');
    return this.place(s.id, kind, `${base}.txt`, (dest) => writeFileSync(dest, text.slice(0, MAX_TEXT), 'utf8'), agent);
  }

  removeFile(sessionId: string, fileId: string): boolean {
    if (!ID.test(sessionId) || !ID.test(fileId)) return false;
    const files = this.filesOf(sessionId);
    const f = files.find((x) => x.id === fileId);
    if (!f) return false;
    rmSync(join(this.root, sessionId, f.kind, f.name), { force: true });
    this.saveFiles(sessionId, files.filter((x) => x.id !== fileId));
    return true;
  }

  pathOf(sessionId: string, fileId: string): string | null {
    if (!ID.test(sessionId) || !ID.test(fileId)) return null;
    const f = this.filesOf(sessionId).find((x) => x.id === fileId);
    return f ? join(this.root, sessionId, f.kind, f.name) : null;
  }
}
