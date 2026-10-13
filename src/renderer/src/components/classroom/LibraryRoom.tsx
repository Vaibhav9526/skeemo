import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Agent } from '@/store/store';
import { Face } from './IdCard';
import { IconBooks } from './icons';

type Doc = { id: string; name: string; addedAt: number; chars: number; chunks: number };

/**
 * The Library — a side-on, 2D "anime" room you walk through (←/→ or A/D, Shift to run,
 * or click the floor), unlike the top-down staff room. Entering plays a speed-line
 * wipe; leaving closes an iris over the room. Every book you have given the Librarian
 * is a real spine on the shelves (click to pull it out), and you can donate more at the
 * counter. Pure DOM/SVG/CSS — no assets — and the camera runs on a rAF loop that writes
 * transforms directly, so walking never re-renders React.
 */

const H = 720;              // design height; everything is laid out in these units, then scaled to the window
const FLOOR = 150;          // floor strip height
const UNIT_W = 380;         // one shelving bay
const ROWS = 3;
const ROW_CAP = 11;
const PER_UNIT = ROWS * ROW_CAP;
const SHELF_X0 = 640;       // first bay starts here (entrance + counter come before it)
const INK = '#2a2036';
const SPINES = ['#f28b82', '#fbbc74', '#f7d974', '#8fd3a8', '#8ec5fc', '#b79ced', '#f4a6c6', '#7fd1cf'];
const COUNTER_X = 260;      // donate slot
const LIBRARIAN_X = 470;
const DOOR_X = 90;

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const title = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');

function spine(d: Doc) {
  const h = hash(d.id);
  return {
    color: SPINES[h % SPINES.length],
    height: clamp(70 + Math.round(Math.log10(Math.max(1, d.chars)) * 7) + (h % 18), 74, 124),
    width: clamp(18 + Math.round(Math.sqrt(d.chunks)) + ((h >> 3) % 6), 18, 36),
    band: (h >> 5) % 3,
  };
}

type Near = null | { kind: 'door' | 'donate' | 'librarian'; label: string };

export function LibraryRoom({ librarian, onLeave, onAskLibrarian, onOpenDesk }: { librarian: Agent | null; onLeave: () => void; onAskLibrarian: (prefill?: string) => void; onOpenDesk: () => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [open, setOpen] = useState<Doc | null>(null);
  const [near, setNear] = useState<Near>(null);
  const [leaving, setLeaving] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    const list = await window.cth.libraryList().catch(() => [] as Doc[]);
    if (seen.current) {
      const added = list.filter((d) => !seen.current!.has(d.id)).map((d) => d.id);
      if (added.length) setFresh(new Set(added));
    }
    seen.current = new Set(list.map((d) => d.id));
    setDocs(list);
    setLoaded(true);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const donate = useCallback(async () => {
    if (busy) return;
    setBusy(true); setErrors([]);
    try {
      const res = await window.cth.libraryAdd();
      setErrors(res.errors ?? []);
      await refresh();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Could not add the books.']);
    } finally { setBusy(false); }
  }, [busy, refresh]);

  const leave = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onLeave, 520);
  }, [leaving, onLeave]);

  // ── layout ──
  const units = Math.max(3, Math.ceil((docs.length + 1) / PER_UNIT) + (docs.length >= PER_UNIT ? 1 : 0));
  const worldW = SHELF_X0 + units * UNIT_W + 360;
  const placed = useMemo(() => docs.map((d, i) => {
    const unit = Math.floor(i / PER_UNIT);
    const within = i % PER_UNIT;
    return { d, unit, row: Math.floor(within / ROW_CAP), s: spine(d), i };
  }), [docs]);

  // ── camera + player (refs only: no React renders while walking) ──
  const worldRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<HTMLDivElement>(null);
  const meBody = useRef<HTMLDivElement>(null);
  const npcBody = useRef<HTMLDivElement>(null);
  const st = useRef({ px: 170, target: null as number | null, cam: 0, face: 1, keys: new Set<string>(), worldW, nearKind: '' as string, modal: false, walking: false, zoom: 1, zoomT: 1, panning: false });
  st.current.worldW = worldW;
  st.current.modal = !!open;

  // Click / E on the Librarian: the camera flies in on her, then her desk opens.
  const visitLibrarian = useCallback(() => {
    const s = st.current;
    if (s.panning) return;
    s.panning = true; s.zoomT = 1.9; s.target = null;
    window.setTimeout(() => { onOpenDesk(); s.zoomT = 1; s.panning = false; }, 950);
  }, [onOpenDesk]);

  const interact = useCallback((kind: string) => {
    if (kind === 'door') leave();
    else if (kind === 'donate') void donate();
    else if (kind === 'librarian') visitLibrarian();
  }, [leave, donate, visitLibrarian]);
  const interactRef = useRef(interact);
  interactRef.current = interact;

  useEffect(() => {
    const s = st.current;
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (s.modal) setOpen(null); else leave(); return; }
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'Shift'].includes(k)) { if (k !== 'Shift') e.preventDefault(); s.keys.add(k); }
      if ((k === 'e' || k === 'Enter') && s.nearKind && !s.modal) { e.preventDefault(); interactRef.current(s.nearKind); }
    };
    const up = (e: KeyboardEvent) => { s.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const base = clamp(window.innerHeight / H, 0.55, 1.5);
      s.zoom += (s.zoomT - s.zoom) * Math.min(1, dt * 3.5);
      const sc = base * s.zoom;
      const vw = window.innerWidth / sc;
      const frozen = s.modal || s.panning;
      const L = s.keys.has('ArrowLeft') || s.keys.has('a');
      const R = s.keys.has('ArrowRight') || s.keys.has('d');
      let dir = 0;
      if (L !== R && !frozen) { dir = L ? -1 : 1; s.target = null; }
      else if (s.target !== null && !frozen) {
        const d = s.target - s.px;
        if (Math.abs(d) < 6) s.target = null; else dir = Math.sign(d);
      }
      const run = s.keys.has('Shift');
      s.px = clamp(s.px + dir * (run ? 440 : 250) * dt, 50, s.worldW - 50);
      if (dir) s.face = dir;
      const walking = dir !== 0;
      if (walking !== s.walking) { s.walking = walking; meRef.current?.classList.toggle('lr-walk', walking); }
      const want = clamp((s.panning ? LIBRARIAN_X : s.px) - vw / 2, 0, Math.max(0, s.worldW - vw));
      s.cam += (want - s.cam) * Math.min(1, dt * 5);
      // While flying in on the Librarian, lift the view so she sits mid-screen (the room is anchored to the floor).
      const lift = (360 * base - 206 * sc) * clamp((s.zoom - 1) / 0.9, 0, 1);
      const tr = (f: number) => `translate3d(${-s.cam * f * sc}px,${-lift}px,0) scale(${sc})`;
      if (worldRef.current) worldRef.current.style.transform = tr(1);
      if (farRef.current) farRef.current.style.transform = tr(0.4);
      if (fgRef.current) fgRef.current.style.transform = tr(1.35);
      if (meRef.current) meRef.current.style.transform = `translate3d(${s.px - 45}px,0,0)`;
      if (meBody.current) meBody.current.style.transform = `scaleX(${s.face})`;
      if (npcBody.current) npcBody.current.style.transform = `scaleX(${s.px < LIBRARIAN_X ? -1 : 1})`;
      let kind = '';
      let label = '';
      if (Math.abs(s.px - DOOR_X) < 70) { kind = 'door'; label = 'Leave the library'; }
      else if (Math.abs(s.px - COUNTER_X) < 70) { kind = 'donate'; label = 'Donate books'; }
      else if (Math.abs(s.px - LIBRARIAN_X) < 80) { kind = 'librarian'; label = "Visit the Librarian's desk"; }
      if (kind !== s.nearKind) { s.nearKind = kind; setNear(kind ? { kind: kind as 'door', label } : null); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, [leave]);

  const walkTo = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (st.current.panning) return;
    const sc = clamp(window.innerHeight / H, 0.55, 1.5) * st.current.zoom;
    st.current.target = (e.clientX + st.current.cam * sc) / sc;
  };

  const nearLabel = near && !open ? near : null;
  const motes = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ l: (i * 47) % 100, d: 9 + (i % 7) * 2, dl: -((i * 1.7) % 12), s: 2 + (i % 3) })), []);
  const petals = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ l: (i * 29) % 100, d: 8 + (i % 5) * 2, dl: -((i * 2.3) % 10) })), []);

  return (
    <div className={`lr-root${leaving ? ' lr-out' : ''}`} onMouseDown={walkTo} role="dialog" aria-label="The Library">
      <LibraryStyles />

      {/* sky + sun */}
      <div className="lr-sky">
        <div className="lr-sun" />
        <div className="lr-cloud lr-c1" /><div className="lr-cloud lr-c2" /><div className="lr-cloud lr-c3" />
        {petals.map((p, i) => <i key={i} className="lr-petal" style={{ left: `${p.l}%`, animationDuration: `${p.d}s`, animationDelay: `${p.dl}s` }} />)}
      </div>

      {/* far parallax: distant arches */}
      <div ref={farRef} className="lr-layer" style={{ width: worldW }}>
        {Array.from({ length: Math.ceil(worldW / 520) }, (_, i) => (
          <div key={i} className="lr-arch" style={{ left: 120 + i * 520 }}><div className="lr-arch-glass" /></div>
        ))}
      </div>

      {/* the room */}
      <div ref={worldRef} className="lr-layer lr-world" style={{ width: worldW, height: H }}>
        <div className="lr-wall" style={{ bottom: FLOOR, height: H - FLOOR }} />
        <div className="lr-wainscot" style={{ bottom: FLOOR }} />
        <div className="lr-floor" style={{ height: FLOOR }} />
        <div className="lr-rug" style={{ left: 60, width: 520 }} />
        <div className="lr-rug lr-rug2" style={{ left: SHELF_X0 + 140, width: Math.max(560, units * UNIT_W - 280) }} />

        {/* windows on the wall between the bays */}
        {Array.from({ length: Math.max(1, Math.floor(units / 2)) }, (_, i) => (
          <div key={i} className="lr-window" style={{ left: SHELF_X0 + (i * 2 + 1) * UNIT_W - 70, bottom: FLOOR + 290 }}>
            <div className="lr-window-sky" />
            <span className="lr-bar-v" /><span className="lr-bar-h" />
          </div>
        ))}

        {/* door */}
        <div className="lr-door" style={{ left: DOOR_X - 60, bottom: FLOOR }}>
          <div className="lr-door-panel" />
          <div className="lr-door-sign">EXIT</div>
        </div>

        {/* counter: donate box + librarian */}
        <div className="lr-counter" style={{ left: COUNTER_X - 100, bottom: FLOOR - 6 }}>
          <div className="lr-donate"><span>DONATE</span><i className="lr-slot" /></div>
          <div className="lr-counter-top" />
        </div>
        <div className="lr-lamp" style={{ left: COUNTER_X - 20, bottom: FLOOR + 218 }} />
        <div className="lr-lamp" style={{ left: LIBRARIAN_X - 20, bottom: FLOOR + 218 }} />
        <div className="lr-sign" style={{ left: 190, bottom: FLOOR + 330 }}>The Library</div>

        <div className="lr-actor" style={{ left: LIBRARIAN_X - 45, bottom: FLOOR - 24 }}>
          {librarian && (
            <button type="button" className="lr-bubble" onClick={() => visitLibrarian()} title="Visit the Librarian's desk">
              <Face agent={librarian} size={34} />
              <span>{docs.length ? 'My desk is this way~' : 'Bring me a book~'}</span>
            </button>
          )}
          <div ref={npcBody} className="lr-chibi"><Chibi hair="#8d6bd1" outfit="#7c6bb8" trim="#ffffff" glasses bun book /></div>
        </div>

        {/* shelving bays */}
        {Array.from({ length: units }, (_, u) => (
          <div key={u} className="lr-bay" style={{ left: SHELF_X0 + u * UNIT_W, width: UNIT_W - 14, bottom: FLOOR, height: 470 }}>
            {Array.from({ length: ROWS }, (_, r) => (
              <div key={r} className="lr-row">
                {placed.filter((p) => p.unit === u && p.row === r).map((p) => (
                  <button
                    key={p.d.id}
                    type="button"
                    className={`lr-book${fresh.has(p.d.id) ? ' lr-drop' : ''}`}
                    style={{ height: p.s.height, width: p.s.width, background: p.s.color, animationDelay: `${(p.i % 6) * 0.08}s` }}
                    onClick={() => setOpen(p.d)}
                    title={title(p.d.name)}
                    aria-label={`Open ${title(p.d.name)}`}
                  >
                    <b className={`lr-band lr-band${p.s.band}`} />
                    <span className="lr-spine-text">{title(p.d.name)}</span>
                  </button>
                ))}
                <i className="lr-plank" />
              </div>
            ))}
          </div>
        ))}

        {/* the student */}
        <div ref={meRef} className="lr-actor lr-me" style={{ left: 0, bottom: FLOOR - 24 }}>
          {nearLabel && (
            <div className="lr-prompt"><kbd>E</kbd> {nearLabel.label}</div>
          )}
          <div ref={meBody} className="lr-chibi lr-chibi-me"><Chibi hair="#3b2a5a" outfit="#4a6fa5" trim="#f2f2f2" bag /></div>
        </div>
      </div>

      {/* near parallax: blurred foreground plants */}
      <div ref={fgRef} className="lr-layer lr-fg" style={{ width: worldW }}>
        {Array.from({ length: Math.ceil(worldW / 900) }, (_, i) => (
          <div key={i} className="lr-fern" style={{ left: 380 + i * 900 }} />
        ))}
      </div>

      <div className="lr-rays" />
      {motes.map((m, i) => <i key={i} className="lr-mote" style={{ left: `${m.l}%`, width: m.s, height: m.s, animationDuration: `${m.d}s`, animationDelay: `${m.dl}s` }} />)}
      <div className="lr-vignette" />

      {/* HUD */}
      <div className="lr-hud lr-hud-top">
        <button type="button" className="lr-btn" onClick={leave}>← Leave <kbd>Esc</kbd></button>
        <div className="lr-title"><IconBooks size={20} /> The Library <small>{loaded ? `${docs.length} book${docs.length === 1 ? '' : 's'}` : '…'}</small></div>
        <span style={{ flex: 1 }} />
        <button type="button" className="lr-btn lr-btn-hot" disabled={busy} onClick={() => { void donate(); }}>{busy ? 'Reading…' : '+ Donate books'}</button>
      </div>
      <div className="lr-hud lr-hud-bottom">
        <span><kbd>←</kbd><kbd>→</kbd> walk</span><span><kbd>Shift</kbd> run</span><span>click the floor to go there</span><span>click a book to pull it out</span>
      </div>
      {errors.length > 0 && (
        <div className="lr-errors" role="alert">{errors.map((e) => <div key={e}>{e}</div>)}</div>
      )}
      {loaded && docs.length === 0 && (
        <div className="lr-empty">The shelves are empty.<br />Donate PDFs, slides, Word files, EPUBs or notes — the Librarian will shelve them and every character can answer from them with <code>@memory-notes</code>.</div>
      )}

      {/* a pulled-out book */}
      {open && (() => {
        const sp = spine(open);
        return (
          <div className="lr-modal" onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setOpen(null); }}>
            <div className="lr-card">
              <div className="lr-card-spine" style={{ background: sp.color }} />
              <div className="lr-card-body">
                <div className="lr-card-kicker">From the shelf</div>
                <h2>{title(open.name)}</h2>
                <p>{open.name}</p>
                <dl>
                  <div><dt>Length</dt><dd>≈ {Math.max(1, Math.round(open.chars / 1800))} pages · {Math.max(1, Math.round(open.chars / 1000))}k characters</dd></div>
                  <div><dt>Shelved</dt><dd>{new Date(open.addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
                  <div><dt>Indexed</dt><dd>{open.chunks} passages the class can search</dd></div>
                </dl>
                <div className="lr-card-actions">
                  <button type="button" className="lr-btn lr-btn-hot" onClick={() => { const n = title(open.name); setOpen(null); onAskLibrarian(`@memory-notes what does "${n}" say about `); }}>Ask the Librarian about it</button>
                  <button type="button" className="lr-btn" onClick={() => {
                    if (!window.confirm(`Take "${title(open.name)}" off the shelf for good?`)) return;
                    const id = open.id; setOpen(null);
                    void window.cth.libraryRemove(id).then(() => refresh());
                  }}>Remove</button>
                  <button type="button" className="lr-btn" onClick={() => setOpen(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* entrance wipe: slanted speed-line panels sweep across, the title flashes, then they leave */}
      <div className="lr-wipe" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ animationDelay: `${i * 0.05}s`, left: `${i * 20 - 6}%` }} />)}
        <div className="lr-wipe-title"><IconBooks size={44} /><span>The Library</span></div>
      </div>
    </div>
  );
}

function Chibi({ hair, outfit, trim, glasses, bun, bag, book }: { hair: string; outfit: string; trim: string; glasses?: boolean; bun?: boolean; bag?: boolean; book?: boolean }) {
  const skin = '#ffe2cf';
  const line = { stroke: INK, strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="0 0 90 160" width={90} height={160} aria-hidden="true">
      <ellipse cx="45" cy="156" rx="27" ry="5" fill="rgba(42,32,54,0.22)" />
      {/* hair behind the head */}
      <g className="lr-tail"><path d="M30 30 C8 34 4 66 14 84 C20 76 22 62 34 52 Z" fill={hair} {...line} /></g>
      {bag && <rect x="19" y="64" width="15" height="34" rx="6" fill="#e7a24a" {...line} />}
      <g className="lr-arm lr-arm-b"><rect x="33" y="64" width="10" height="34" rx="5" fill={skin} {...line} /></g>
      <g className="lr-leg lr-leg-b"><rect x="35" y="104" width="12" height="44" rx="5" fill="#f4eaf7" {...line} /><rect x="33" y="145" width="19" height="10" rx="5" fill="#fff" {...line} /></g>
      <g className="lr-leg lr-leg-f"><rect x="43" y="104" width="12" height="44" rx="5" fill="#fff6fb" {...line} /><rect x="41" y="145" width="19" height="10" rx="5" fill="#fff" {...line} /></g>
      <path d="M22 96 Q45 106 68 96 L72 116 Q45 124 18 116 Z" fill="#2d2f5a" {...line} />
      <rect x="25" y="56" width="40" height="48" rx="15" fill={outfit} {...line} />
      <path d="M38 56 L50 70 L62 56 Z" fill={trim} {...line} />
      <path d="M52 66 l8 4 l-3 8 l-5 -5 Z" fill="#e8505b" {...line} />
      {bun && <circle cx="30" cy="10" r="10" fill={hair} {...line} />}
      <ellipse cx="38" cy="34" rx="27" ry="27" fill={hair} {...line} />
      <circle cx="50" cy="38" r="23" fill={skin} {...line} />
      <path d="M22 34 C20 10 50 2 72 16 C76 22 74 28 72 30 C66 18 48 20 40 30 C36 36 28 38 22 34 Z" fill={hair} {...line} />
      <ellipse cx="62" cy="40" rx="4.6" ry="6.8" fill="#3b2a6a" />
      <circle cx="63.6" cy="37" r="2" fill="#fff" /><circle cx="60.6" cy="43" r="1" fill="#fff" />
      <path d="M56 30 q6 -4 12 0" fill="none" {...line} strokeWidth={1.8} />
      <ellipse cx="57" cy="50" rx="5" ry="3" fill="#ff9aa2" opacity="0.65" />
      <path d="M64 53 q3 2 6 0" fill="none" {...line} strokeWidth={1.6} />
      {glasses && <g fill="rgba(255,255,255,0.35)" {...line} strokeWidth={1.8}><circle cx="62" cy="40" r="8.5" /><path d="M53.5 40 L40 36" fill="none" /></g>}
      <g className="lr-arm lr-arm-f">
        <rect x="40" y="62" width="11" height="36" rx="5.5" fill={outfit} {...line} />
        <circle cx="45.5" cy="100" r="5.5" fill={skin} {...line} />
        {book && <g><rect x="46" y="88" width="22" height="17" rx="2" fill="#f28b82" {...line} /><path d="M49 92h14M49 97h10" stroke="#fff" strokeWidth="2" /></g>}
      </g>
    </svg>
  );
}

function LibraryStyles() {
  return (
    <style>{`
.lr-root{position:fixed;inset:0;z-index:320;overflow:hidden;background:#ffd9c2;font-family:var(--cth-font-ui,system-ui,sans-serif);color:${INK};user-select:none;cursor:default;animation:lr-in 1.2s cubic-bezier(.2,.8,.2,1) both}
.lr-root.lr-out{animation:lr-iris .52s cubic-bezier(.6,0,.4,1) forwards}
@keyframes lr-in{0%,40%{transform:scale(1.12);filter:blur(6px) brightness(1.15)}100%{transform:none;filter:none}}
@keyframes lr-iris{from{clip-path:circle(150% at 50% 62%)}to{clip-path:circle(0% at 50% 62%)}}
.lr-sky{position:absolute;inset:0;background:linear-gradient(180deg,#8fd0ff 0%,#c9e8ff 38%,#ffe9d6 70%,#ffd0b8 100%);overflow:hidden}
.lr-sun{position:absolute;top:8%;right:14%;width:170px;height:170px;border-radius:50%;background:radial-gradient(circle,#fffbe6 0 30%,#ffe9a8 31% 48%,rgba(255,233,168,.0) 70%);filter:blur(1px);animation:lr-pulse 6s ease-in-out infinite}
@keyframes lr-pulse{50%{transform:scale(1.08);opacity:.85}}
.lr-cloud{position:absolute;height:60px;border-radius:60px;background:#fff;opacity:.85;filter:blur(1px);animation:lr-drift linear infinite}
.lr-cloud::before,.lr-cloud::after{content:"";position:absolute;background:#fff;border-radius:50%}
.lr-cloud::before{width:70px;height:70px;left:22px;top:-32px}.lr-cloud::after{width:50px;height:50px;left:80px;top:-20px}
.lr-c1{top:14%;width:190px;animation-duration:70s;left:-20%}.lr-c2{top:30%;width:140px;animation-duration:95s;animation-delay:-40s;left:-20%;opacity:.7}.lr-c3{top:6%;width:230px;animation-duration:120s;animation-delay:-80s;left:-20%;opacity:.6}
@keyframes lr-drift{to{transform:translateX(160vw)}}
.lr-petal{position:absolute;top:-20px;width:11px;height:8px;border-radius:70% 0 70% 0;background:#ffb7c9;opacity:.9;animation:lr-fall linear infinite}
@keyframes lr-fall{0%{transform:translate(0,-10px) rotate(0)}50%{transform:translate(-60px,50vh) rotate(180deg)}100%{transform:translate(20px,105vh) rotate(380deg)}}
.lr-layer{position:absolute;left:0;bottom:0;transform-origin:left bottom;will-change:transform;pointer-events:none}
.lr-world>*{pointer-events:auto}
.lr-arch{position:absolute;bottom:210px;width:260px;height:420px;border-radius:130px 130px 0 0;background:#b9a0d6;opacity:.55;box-shadow:inset 0 0 0 10px rgba(255,255,255,.35)}
.lr-arch-glass{position:absolute;inset:18px;border-radius:112px 112px 0 0;background:linear-gradient(180deg,#bfe4ff,#fff1de);opacity:.8}
.lr-wall{position:absolute;left:0;right:0;background:linear-gradient(180deg,#f3dcc4,#f8e8d4);}
.lr-wall::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(185,120,90,.07) 0 22px,rgba(255,255,255,.0) 22px 44px)}
.lr-wainscot{position:absolute;left:0;right:0;height:70px;background:linear-gradient(180deg,#a9744e,#8a5a3a);border-top:5px solid #c99a72}
.lr-floor{position:absolute;left:0;right:0;bottom:0;background:repeating-linear-gradient(90deg,#c88f5f 0 118px,#b97f52 118px 120px),#c88f5f;box-shadow:inset 0 14px 22px rgba(80,40,20,.35)}
.lr-floor::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.18),transparent 40%)}
.lr-rug{position:absolute;bottom:6px;height:60px;border-radius:50%;background:radial-gradient(ellipse,#e56b7a 0 55%,#c04c63 56% 70%,#f6d7a2 71% 76%,#c04c63 77%);opacity:.9;pointer-events:none}
.lr-rug2{background:radial-gradient(ellipse,#6f8fd8 0 55%,#4d6fb8 56% 70%,#f6d7a2 71% 76%,#4d6fb8 77%)}
.lr-window{position:absolute;width:140px;height:210px;border-radius:70px 70px 6px 6px;background:#fff;box-shadow:0 0 0 9px #8a5a3a,0 0 0 12px #c99a72,0 12px 30px rgba(0,0,0,.2);overflow:hidden}
.lr-window-sky{position:absolute;inset:0;background:linear-gradient(180deg,#8fd0ff,#ffe9d6)}
.lr-bar-v,.lr-bar-h{position:absolute;background:#8a5a3a}.lr-bar-v{left:50%;top:0;bottom:0;width:6px;margin-left:-3px}.lr-bar-h{top:90px;left:0;right:0;height:6px}
.lr-door{position:absolute;width:130px;height:300px}
.lr-door-panel{position:absolute;inset:0;border-radius:64px 64px 0 0;background:linear-gradient(90deg,#9a6a45,#b98558);box-shadow:0 0 0 8px #6e4529,inset 0 0 0 8px rgba(255,255,255,.12)}
.lr-door-panel::after{content:"";position:absolute;right:20px;top:62%;width:12px;height:12px;border-radius:50%;background:#ffd35a;box-shadow:0 0 0 2px #b8860b}
.lr-door-sign{position:absolute;left:30px;right:30px;top:-34px;text-align:center;font-weight:800;font-size:13px;letter-spacing:2px;color:#fff;background:#3fa56b;border-radius:6px;padding:3px 0;box-shadow:0 0 12px #7cf0a8}
.lr-counter{position:absolute;width:330px;height:150px}
.lr-donate{position:absolute;left:0;bottom:0;width:200px;height:132px;border-radius:8px 8px 0 0;background:linear-gradient(180deg,#8d6bd1,#6e4fb0);box-shadow:inset 0 0 0 4px rgba(255,255,255,.25);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#fff;font-weight:800;letter-spacing:3px;font-size:14px}
.lr-slot{display:block;width:120px;height:12px;border-radius:6px;background:#2a2036;box-shadow:0 0 14px 4px rgba(255,214,90,.7);animation:lr-glow 2.2s ease-in-out infinite}
@keyframes lr-glow{50%{box-shadow:0 0 22px 8px rgba(255,214,90,.95)}}
.lr-counter-top{position:absolute;left:-10px;right:-6px;bottom:128px;height:16px;border-radius:6px;background:#d6a577;box-shadow:0 4px 0 #8a5a3a}
.lr-counter::after{content:"";position:absolute;left:210px;right:0;bottom:0;height:128px;background:linear-gradient(180deg,#a9744e,#8a5a3a);border-radius:6px 6px 0 0}
.lr-lamp{position:absolute;width:40px;height:30px;border-radius:20px 20px 4px 4px;background:#ffd35a;box-shadow:0 0 40px 20px rgba(255,211,90,.55);animation:lr-flicker 4s infinite}
@keyframes lr-flicker{0%,100%{opacity:1}47%{opacity:.88}50%{opacity:1}}
.lr-sign{position:absolute;padding:6px 20px;border-radius:8px;background:#fff7e8;font-weight:800;font-size:22px;letter-spacing:2px;box-shadow:0 0 0 4px #8a5a3a;font-family:Georgia,serif;transform:rotate(-1.5deg)}
.lr-actor{position:absolute;width:90px;height:160px;will-change:transform}
.lr-chibi{width:90px;height:160px;animation:lr-breathe 3.2s ease-in-out infinite;transform-origin:50% 100%}
@keyframes lr-breathe{50%{translate:0 -2px}}
.lr-leg,.lr-arm,.lr-tail{transform-box:fill-box;transform-origin:50% 0}
.lr-tail{transform-origin:100% 0;animation:lr-sway 2.6s ease-in-out infinite alternate}
@keyframes lr-sway{from{transform:rotate(-4deg)}to{transform:rotate(5deg)}}
.lr-walk .lr-chibi{animation:lr-bob .26s ease-in-out infinite alternate}
@keyframes lr-bob{from{translate:0 0}to{translate:0 -5px}}
.lr-walk .lr-leg-f{animation:lr-step .52s ease-in-out infinite alternate}
.lr-walk .lr-leg-b{animation:lr-step .52s ease-in-out infinite alternate-reverse}
.lr-walk .lr-arm-f{animation:lr-step .52s ease-in-out infinite alternate-reverse}
.lr-walk .lr-arm-b{animation:lr-step .52s ease-in-out infinite alternate}
.lr-walk .lr-tail{animation-duration:.5s}
@keyframes lr-step{from{transform:rotate(-26deg)}to{transform:rotate(26deg)}}
.lr-prompt{position:absolute;left:50%;bottom:172px;transform:translateX(-50%);white-space:nowrap;padding:5px 12px;border-radius:999px;background:#fff;box-shadow:0 4px 14px rgba(42,32,54,.3),0 0 0 2px ${INK};font-size:14px;font-weight:700;animation:lr-pop .25s ease-out}
@keyframes lr-pop{from{opacity:0;transform:translate(-50%,8px)}}
kbd{display:inline-block;min-width:18px;padding:0 5px;margin:0 2px;border-radius:5px;background:#fff;box-shadow:0 2px 0 ${INK},0 0 0 1.5px ${INK};font:700 12px/18px var(--cth-font-ui,system-ui);text-align:center}
.lr-bubble{position:absolute;left:50%;bottom:176px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;white-space:nowrap;border:none;cursor:pointer;padding:5px 12px 5px 5px;border-radius:999px;background:#fff;box-shadow:0 4px 14px rgba(42,32,54,.25),0 0 0 2px ${INK};font:700 13px var(--cth-font-ui,system-ui);color:${INK}}
.lr-bubble:hover{transform:translateX(-50%) translateY(-2px)}
.lr-bay{position:absolute;box-sizing:border-box;padding:16px 14px 0;background:linear-gradient(90deg,#7b4d31,#8a5a3a 6%,#8a5a3a 94%,#6e4529);border-radius:10px 10px 0 0;box-shadow:inset 0 0 0 5px #5f3a22,inset 0 30px 40px rgba(0,0,0,.18),0 10px 30px rgba(60,30,10,.35);display:flex;flex-direction:column;justify-content:space-between}
.lr-row{position:relative;height:139px;display:flex;align-items:flex-end;gap:3px;padding:0 4px 12px;background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.08) 30%,rgba(0,0,0,.18))}
.lr-plank{position:absolute;left:-14px;right:-14px;bottom:0;height:12px;background:linear-gradient(180deg,#d6a577,#b9824f);box-shadow:0 3px 0 #5f3a22}
.lr-book{position:relative;flex:none;border:none;cursor:pointer;padding:0;border-radius:3px 3px 1px 1px;box-shadow:inset -3px 0 0 rgba(0,0,0,.18),inset 2px 0 0 rgba(255,255,255,.35),0 0 0 1.5px ${INK};display:flex;align-items:center;justify-content:center;overflow:hidden;transform-origin:50% 100%;transition:transform .18s cubic-bezier(.3,1.6,.5,1),filter .18s}
.lr-book:hover,.lr-book:focus-visible{transform:translateY(-16px) rotate(-3deg);filter:drop-shadow(0 8px 6px rgba(0,0,0,.35)) brightness(1.08);z-index:3;outline:none}
.lr-spine-text{writing-mode:vertical-rl;max-height:78%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 11px var(--cth-font-ui,system-ui);color:${INK};padding:2px 0}
.lr-band{position:absolute;left:0;right:0;height:5px;background:rgba(255,255,255,.7);top:9px;box-shadow:0 8px 0 rgba(255,255,255,.7)}
.lr-band1{background:#ffd35a;box-shadow:0 8px 0 #ffd35a}.lr-band2{top:auto;bottom:9px;background:rgba(42,32,54,.5);box-shadow:0 -8px 0 rgba(42,32,54,.5)}
.lr-drop{animation:lr-drop .7s cubic-bezier(.3,1.5,.5,1) both}
@keyframes lr-drop{0%{transform:translateY(-420px) rotate(-18deg);opacity:0}60%{opacity:1}100%{transform:none}}
.lr-fg{pointer-events:none;z-index:4}
.lr-fern{position:absolute;bottom:-30px;width:220px;height:300px;filter:blur(5px);opacity:.9;background:radial-gradient(ellipse at 50% 100%,#2f7d4f 0 40%,transparent 41%),radial-gradient(ellipse at 28% 90%,#3f9b63 0 30%,transparent 31%),radial-gradient(ellipse at 74% 88%,#2a6e45 0 32%,transparent 33%)}
.lr-rays{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(105deg,rgba(255,244,200,0) 0 120px,rgba(255,244,200,.16) 150px,rgba(255,244,200,0) 210px);mix-blend-mode:soft-light;animation:lr-ray 9s ease-in-out infinite alternate}
@keyframes lr-ray{from{opacity:.6;transform:translateX(-30px)}to{opacity:1;transform:translateX(30px)}}
.lr-mote{position:absolute;bottom:-10px;border-radius:50%;background:#fff7d6;opacity:.7;pointer-events:none;animation:lr-float linear infinite}
@keyframes lr-float{to{transform:translate(40px,-100vh)}}
.lr-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 55%,transparent 55%,rgba(60,20,70,.38))}
.lr-hud{position:absolute;left:0;right:0;display:flex;align-items:center;gap:12px;padding:14px 20px;z-index:10;pointer-events:none}
.lr-hud>*{pointer-events:auto}
.lr-hud-top{top:0}.lr-hud-bottom{bottom:0;justify-content:center;gap:22px;font-size:12px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(42,32,54,.8);padding-bottom:12px}
.lr-title{display:flex;align-items:center;gap:8px;padding:6px 16px;border-radius:999px;background:rgba(255,255,255,.88);font:800 16px Georgia,serif;box-shadow:0 0 0 2px ${INK}}
.lr-title small{font:600 12px var(--cth-font-ui,system-ui);color:#6b5d7d}
.lr-btn{border:none;cursor:pointer;padding:8px 14px;border-radius:12px;background:#fff;color:${INK};font:700 13px var(--cth-font-ui,system-ui);box-shadow:0 3px 0 ${INK},0 0 0 2px ${INK};transition:transform .1s}
.lr-btn:active{transform:translateY(2px);box-shadow:0 1px 0 ${INK},0 0 0 2px ${INK}}
.lr-btn:disabled{opacity:.6;cursor:wait}
.lr-btn-hot{background:#ffd35a}
.lr-errors{position:absolute;top:66px;right:20px;z-index:11;max-width:380px;padding:8px 12px;border-radius:10px;background:#fff0f0;color:#b3261e;font-size:12px;box-shadow:0 0 0 2px #b3261e}
.lr-empty{position:absolute;left:50%;top:26%;transform:translateX(-50%);z-index:9;width:min(480px,86vw);text-align:center;padding:14px 18px;border-radius:16px;background:rgba(255,255,255,.9);font-size:14px;line-height:21px;box-shadow:0 0 0 2px ${INK};pointer-events:none}
.lr-modal{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(42,32,54,.5);backdrop-filter:blur(3px);animation:lr-fade .2s}
@keyframes lr-fade{from{opacity:0}}
.lr-card{display:flex;width:min(560px,92vw);border-radius:14px;background:#fffaf0;box-shadow:0 0 0 3px ${INK},0 24px 60px rgba(0,0,0,.4);overflow:hidden;animation:lr-card .35s cubic-bezier(.3,1.4,.5,1)}
@keyframes lr-card{from{transform:translateY(40px) rotate(-3deg) scale(.9);opacity:0}}
.lr-card-spine{width:34px;flex:none;box-shadow:inset -4px 0 0 rgba(0,0,0,.15)}
.lr-card-body{padding:20px 24px;flex:1;min-width:0}
.lr-card-kicker{font:700 11px var(--cth-font-ui,system-ui);letter-spacing:2px;text-transform:uppercase;color:#8d6bd1}
.lr-card h2{margin:4px 0 2px;font:800 24px/28px Georgia,serif;overflow-wrap:anywhere}
.lr-card p{margin:0 0 12px;font-size:12px;color:#6b5d7d;overflow-wrap:anywhere}
.lr-card dl{margin:0 0 16px;display:grid;gap:6px}.lr-card dl div{display:flex;gap:10px;font-size:13px}.lr-card dt{width:64px;font-weight:700;color:#6b5d7d}.lr-card dd{margin:0}
.lr-card-actions{display:flex;flex-wrap:wrap;gap:10px}
.lr-wipe{position:absolute;inset:0;z-index:50;pointer-events:none;overflow:hidden;animation:lr-wipe-gone 0s 1.25s forwards}
@keyframes lr-wipe-gone{to{visibility:hidden}}
.lr-wipe i{position:absolute;top:-10%;height:120%;width:26%;transform:skewX(-14deg) translateX(-160%);background:repeating-linear-gradient(100deg,#fff 0 14px,#d9c8ff 14px 18px),#fff;box-shadow:0 0 0 4px ${INK};animation:lr-strip 1.2s cubic-bezier(.7,0,.3,1) both}
.lr-wipe i:nth-child(odd){background:repeating-linear-gradient(100deg,#ffe3ee 0 14px,#ffb7c9 14px 18px),#ffe3ee}
@keyframes lr-strip{0%{transform:skewX(-14deg) translateX(-460%)}38%,62%{transform:skewX(-14deg) translateX(0)}100%{transform:skewX(-14deg) translateX(560%)}}
.lr-wipe-title{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:14px;font:900 52px Georgia,serif;letter-spacing:4px;color:${INK};text-shadow:3px 3px 0 #fff,-3px -3px 0 #fff,3px -3px 0 #fff,-3px 3px 0 #fff;animation:lr-title 1.2s ease both}
@keyframes lr-title{0%,30%{opacity:0;transform:translate(-50%,-50%) scale(.7) rotate(-4deg)}42%,60%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(-2deg)}75%,100%{opacity:0;transform:translate(-50%,-60%) scale(1.15)}}
@media (prefers-reduced-motion: reduce){
  .lr-root,.lr-root.lr-out,.lr-wipe,.lr-wipe i,.lr-wipe-title,.lr-cloud,.lr-petal,.lr-mote,.lr-rays,.lr-sun,.lr-tail,.lr-chibi,.lr-lamp,.lr-slot{animation:none!important}
  .lr-wipe{display:none}
  .lr-root.lr-out{opacity:0;transition:opacity .4s}
}
`}</style>
  );
}
