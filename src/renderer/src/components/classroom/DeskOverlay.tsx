import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/store/store';
import type { DeskFileInfo, DeskKind, DeskSessionInfo } from '../../../../preload/index';
import { Face } from './IdCard';
import { closeDesk, panFloorTo, useDeskOpen } from './deskBus';
import { fmtBytes } from './FileToolResult';

const KINDS: Array<{ kind: DeskKind; title: string; tint: string; deep: string; hint: string }> = [
  { kind: 'pdf', title: 'Documents', tint: '#e5def9', deep: '#cfc3f3', hint: 'PDFs & slides' },
  { kind: 'research', title: 'Research', tint: '#d9ecff', deep: '#bcdcfb', hint: 'Findings & answers' },
  { kind: 'text', title: 'Notes', tint: '#d9f1e4', deep: '#bfe6d0', hint: 'Text files' },
  { kind: 'image', title: 'Images', tint: '#ffe4d8', deep: '#fbcdb9', hint: 'Pictures' },
  { kind: 'other', title: 'Other', tint: '#fff0c9', deep: '#f7e0a0', hint: 'Everything else' },
];
const ext = (n: string) => (/\.([a-z0-9]+)$/i.exec(n)?.[1] ?? 'file').toUpperCase().slice(0, 4);
const when = (ts: number) => new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The Librarian's desk: a Finder-style folder of everything the class has produced, one
 * "chat" per work session — New chat starts a fresh session, Clear chat empties this one.
 */
export function DeskOverlay() {
  const open = useDeskOpen();
  return open ? <DeskBody /> : null;
}

function DeskBody() {
  const librarian = useStore((s) => s.agents.find((a) => a.character === 'librarian' && !a.archived) ?? null);
  const [sessions, setSessions] = useState<DeskSessionInfo[]>([]);
  const [current, setCurrent] = useState('');
  const [files, setFiles] = useState<DeskFileInfo[]>([]);
  const [folder, setFolder] = useState<DeskKind | null>(null);
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const setFullscreen = useStore((s) => s.setFullscreen);

  const reload = useCallback(async (pick?: string) => {
    const s = await window.cth.deskSessions().catch(() => null);
    if (!s) return;
    const id = pick ?? s.current;
    setSessions(s.sessions); setCurrent(id);
    setFiles(await window.cth.deskList(id).catch(() => []));
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const leave = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    panFloorTo(null); // fly the floor camera back out
    window.setTimeout(closeDesk, 260);
  }, [leaving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (folder) setFolder(null); else leave(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); search.current?.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [folder, leave]);

  const cur = sessions.find((s) => s.id === current);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => files.filter((f) => (!folder || f.kind === folder) && (!needle || f.name.toLowerCase().includes(needle) || f.agent.toLowerCase().includes(needle))), [files, folder, needle]);
  const by = (k: DeskKind) => files.filter((f) => f.kind === k);

  const choose = async (id: string) => { await window.cth.deskSelect(id); setFolder(null); setQ(''); await reload(id); };
  const fresh = async () => { const s = await window.cth.deskNew(); setFolder(null); setQ(''); await reload(s.id); };
  const clear = async () => {
    if (!cur || !window.confirm(`Clear everything in "${cur.name}"? The files are deleted from the desk (copies elsewhere are kept).`)) return;
    await window.cth.deskClear(cur.id); await reload(cur.id);
  };
  const del = async (s: DeskSessionInfo) => {
    if (!window.confirm(`Delete "${s.name}" and its ${s.files} file${s.files === 1 ? '' : 's'}?`)) return;
    await window.cth.deskDelete(s.id); await reload();
  };
  const commitRename = async (id: string, name: string) => { setRenaming(null); if (name.trim()) await window.cth.deskRename(id, name.trim()); await reload(id); };

  return (
    <div className={`dk-root${leaving ? ' dk-out' : ''}`} role="dialog" aria-label="The Librarian's desk">
      <DeskStyles />
      <aside className="dk-side">
        <div className="dk-brand">
          {librarian ? <Face agent={librarian} size={34} card /> : null}
          <strong>The Desk</strong>
          <span style={{ flex: 1 }} />
          <button type="button" className="dk-x" onClick={leave} title="Close (Esc)">✕</button>
        </div>
        {librarian && (
          <button type="button" className="dk-ghost" onClick={() => { setFullscreen(librarian.id); leave(); }}>Chat with {librarian.name}</button>
        )}
        <button type="button" className="dk-new" onClick={() => { void fresh(); }}>+ New chat</button>
        <button type="button" className="dk-ghost" onClick={() => { void clear(); }} disabled={!cur || cur.files === 0}>Clear chat</button>
        <div className="dk-label">CHATS</div>
        <div className="dk-list">
          {sessions.map((s) => (
            <div key={s.id} className={`dk-sess${s.id === current ? ' on' : ''}`} onClick={() => { void choose(s.id); }}>
              {renaming === s.id
                ? <input autoFocus defaultValue={s.name} className="dk-rename" onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => { void commitRename(s.id, e.target.value); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }} />
                : <span className="dk-sname" onDoubleClick={() => setRenaming(s.id)} title="Double-click to rename">{s.name}</span>}
              <span className="dk-scount">{s.files}</span>
              <button type="button" className="dk-sdel" title="Delete this chat" onClick={(e) => { e.stopPropagation(); void del(s); }}>×</button>
            </div>
          ))}
          {sessions.length === 0 && <div className="dk-empty-s">No chats yet.</div>}
        </div>
        <div className="dk-foot">Each time the app opens, a new chat starts. Everything you make — PDFs, cheat sheets, converted files, saved answers — is filed here.</div>
      </aside>

      <main className="dk-main">
        <div className="dk-top">
          <label className="dk-search">
            <span aria-hidden="true">⌕</span>
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this chat's files…" />
            <kbd>Ctrl F</kbd>
          </label>
          <span className="dk-size">{cur ? `${cur.files} file${cur.files === 1 ? '' : 's'} · ${fmtBytes(cur.bytes)}` : ''}</span>
        </div>

        <div className="dk-scroll">
          <div className="dk-head">
            <div>
              <h1>{folder ? <><button type="button" className="dk-back" onClick={() => setFolder(null)}>← {cur?.name ?? 'Desk'}</button> / {KINDS.find((k) => k.kind === folder)?.title}</> : (cur?.name ?? 'The Desk')}</h1>
              <p>{cur ? `Started ${when(cur.createdAt)}` : ''}</p>
            </div>
            <button type="button" className="dk-ghost dk-refresh" onClick={() => { void reload(current); }}>Refresh</button>
          </div>

          {!folder && !needle && (
            <>
              <h2>Folders <span className="dk-badge">{KINDS.length}</span></h2>
              <div className="dk-grid">
                {KINDS.map((k) => {
                  const list = by(k.kind);
                  const bytes = list.reduce((n, f) => n + f.size, 0);
                  return (
                    <button key={k.kind} type="button" className="dk-folder" style={{ ['--tint' as string]: k.tint, ['--deep' as string]: k.deep }} onClick={() => setFolder(k.kind)}>
                      <i className="dk-tab" />
                      <span className="dk-front">
                        <span className="dk-ftitle">{k.title}</span>
                        <span className="dk-rule" />
                        <span className="dk-frow">
                          <span className="dk-chips">{list.slice(0, 3).map((f) => <b key={f.id}>{ext(f.name).slice(0, 3)}</b>)}{list.length > 3 && <b>+{list.length - 3}</b>}{!list.length && <em>{k.hint}</em>}</span>
                          <span className="dk-fmeta">{list.length} item{list.length === 1 ? '' : 's'} · {fmtBytes(bytes)}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {(folder || needle || files.length > 0) && (
            <>
              <h2>{needle ? 'Search results' : folder ? 'Files' : 'Recent'} <span className="dk-badge">{shown.length}</span></h2>
              <div className="dk-files">
                {(folder || needle ? shown : shown.slice(0, 8)).map((f) => (
                  <div key={f.id} className="dk-file">
                    <span className="dk-ext">{ext(f.name)}</span>
                    <span className="dk-fname" title={f.name}>{f.name}</span>
                    <span className="dk-by">{f.agent}</span>
                    <span className="dk-fs">{fmtBytes(f.size)}</span>
                    <span className="dk-fd">{when(f.addedAt)}</span>
                    <button type="button" onClick={() => { void window.cth.deskOpen(current, f.id); }}>Open</button>
                    <button type="button" onClick={() => { void window.cth.deskReveal(current, f.id); }}>Show</button>
                    <button type="button" className="dk-danger" onClick={() => { void window.cth.deskRemoveFile(current, f.id).then(() => reload(current)); }}>Delete</button>
                  </div>
                ))}
                {shown.length === 0 && <div className="dk-empty">{needle ? 'No files match.' : 'This folder is empty.'}</div>}
              </div>
            </>
          )}

          {files.length === 0 && !folder && (
            <div className="dk-empty dk-empty-big">
              Nothing here yet in this chat.<br />
              PDFs from <code>@handwritten</code> and <code>@cheat-sheet</code>, files from <code>@convert</code> / <code>@compress</code>, and any reply you press <em>Save to desk</em> on will be filed here.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function DeskStyles() {
  return (
    <style>{`
.dk-root{position:fixed;inset:0;z-index:340;display:flex;background:#fff;color:#1b1b2f;font-family:var(--cth-font-ui,system-ui,sans-serif);animation:dk-in .55s cubic-bezier(.2,.8,.2,1) both;transform-origin:50% 55%}
.dk-root.dk-out{animation:dk-away .26s ease-in forwards}
@keyframes dk-in{from{opacity:0;transform:scale(1.35);filter:blur(10px)}}
@keyframes dk-away{to{opacity:0;transform:scale(.96)}}
.dk-side{width:280px;flex:none;display:flex;flex-direction:column;gap:8px;padding:18px 16px;background:#f7f6fb;border-right:1px solid #ebe8f3;min-height:0}
.dk-brand{display:flex;align-items:center;gap:10px;font-size:18px;margin-bottom:6px}
.dk-x{border:none;background:transparent;cursor:pointer;font-size:15px;color:#8a85a0;border-radius:8px;padding:4px 8px}.dk-x:hover{background:#ebe8f3}
.dk-new{border:none;cursor:pointer;padding:10px 12px;border-radius:12px;background:#1b1b2f;color:#fff;font:700 14px var(--cth-font-ui,system-ui)}
.dk-ghost{border:none;cursor:pointer;padding:9px 12px;border-radius:12px;background:#fff;color:#1b1b2f;font:600 13px var(--cth-font-ui,system-ui);box-shadow:inset 0 0 0 1px #e1ddee}
.dk-ghost:disabled{opacity:.5;cursor:default}
.dk-label{margin-top:8px;font-size:11px;font-weight:700;color:#8a85a0;letter-spacing:.6px}
.dk-list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:2px}
.dk-sess{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:10px;cursor:pointer;font-size:14px}
.dk-sess:hover{background:#efedf7}.dk-sess.on{background:#fff;box-shadow:inset 0 0 0 1px #e1ddee;font-weight:700}
.dk-sname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dk-scount{font-size:12px;color:#8a85a0}
.dk-sdel{border:none;background:transparent;color:#b0abc4;cursor:pointer;font-size:16px;padding:0 2px;visibility:hidden}.dk-sess:hover .dk-sdel{visibility:visible}.dk-sdel:hover{color:#d33}
.dk-rename{flex:1;min-width:0;font:inherit;border:1px solid #b9b0e8;border-radius:6px;padding:2px 6px;outline:none}
.dk-empty-s{font-size:12px;color:#8a85a0;padding:8px}
.dk-foot{font-size:11px;line-height:15px;color:#8a85a0;padding-top:8px;border-top:1px solid #ebe8f3}
.dk-main{flex:1;min-width:0;display:flex;flex-direction:column}
.dk-top{display:flex;align-items:center;gap:16px;padding:20px 32px 14px;border-bottom:1px solid #f0eef6}
.dk-search{display:flex;align-items:center;gap:10px;width:min(520px,100%);padding:9px 14px;border-radius:12px;box-shadow:inset 0 0 0 1.5px #cfcbe0;color:#8a85a0;font-size:16px}
.dk-search:focus-within{box-shadow:inset 0 0 0 2px #7c6bd1}
.dk-search input{flex:1;min-width:0;border:none;outline:none;font:14px var(--cth-font-ui,system-ui);color:#1b1b2f;background:transparent}
.dk-search kbd{font:600 11px var(--cth-font-ui,system-ui);padding:2px 6px;border-radius:5px;background:#f0eef6;color:#6b6585}
.dk-size{margin-left:auto;font-size:13px;color:#6b6585}
.dk-scroll{flex:1;min-height:0;overflow:auto;padding:22px 32px 40px}
.dk-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px}
.dk-head h1{margin:0;font-size:30px;font-weight:600}.dk-head p{margin:2px 0 0;font-size:13px;color:#6b6585}
.dk-back{border:none;background:transparent;cursor:pointer;font:inherit;color:#7c6bd1;padding:0}
.dk-refresh{padding:8px 14px}
.dk-scroll h2{margin:22px 0 12px;font-size:20px;font-weight:600;display:flex;align-items:center;gap:10px}
.dk-badge{font-size:13px;font-weight:600;padding:2px 9px;border-radius:999px;background:#f0eef6;color:#4b4565}
.dk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:22px 26px}
.dk-folder{position:relative;height:178px;border:none;background:none;padding:0;cursor:pointer;text-align:left;font:inherit;transition:transform .18s cubic-bezier(.3,1.5,.5,1)}
.dk-folder:hover{transform:translateY(-4px) rotate(-.6deg)}
.dk-folder::before{content:"";position:absolute;left:0;right:0;top:14px;bottom:0;border-radius:18px;background:var(--deep);box-shadow:0 6px 18px rgba(80,60,140,.1)}
.dk-tab{position:absolute;left:0;top:0;width:46%;height:30px;border-radius:14px 22px 0 0;background:var(--deep);clip-path:polygon(0 0,78% 0,100% 100%,0 100%)}
.dk-front{position:absolute;left:0;right:0;top:28px;bottom:0;border-radius:18px;background:var(--tint);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7),0 -2px 6px rgba(80,60,140,.08);padding:18px 18px 14px;display:flex;flex-direction:column}
.dk-ftitle{font:600 17px "Cascadia Mono",Consolas,monospace;margin-top:14px;color:#2a2640}
.dk-rule{height:1px;background:rgba(42,38,64,.22);margin:10px 0 12px}
.dk-frow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}
.dk-chips{display:flex;align-items:center}
.dk-chips b{width:30px;height:30px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px var(--tint);display:flex;align-items:center;justify-content:center;font:700 9px var(--cth-font-ui,system-ui);color:#4b4565;margin-right:-8px}
.dk-chips em{font-style:normal;font-size:12px;color:#6b6585}
.dk-fmeta{font-size:13px;color:#4b4565;white-space:nowrap}
.dk-files{display:flex;flex-direction:column;border-radius:14px;box-shadow:inset 0 0 0 1px #ebe8f3;overflow:hidden}
.dk-file{display:flex;align-items:center;gap:12px;padding:10px 14px;font-size:13px;border-bottom:1px solid #f3f1f8}.dk-file:last-child{border-bottom:none}.dk-file:hover{background:#faf9fd}
.dk-ext{width:40px;flex:none;text-align:center;font:700 10px var(--cth-font-ui,system-ui);padding:6px 0;border-radius:8px;background:#e5def9;color:#4b3f8a}
.dk-fname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.dk-by{color:#7c6bd1;font-weight:600;width:90px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dk-fs{width:64px;flex:none;color:#6b6585;text-align:right}.dk-fd{width:128px;flex:none;color:#6b6585}
.dk-file button{border:none;cursor:pointer;padding:5px 10px;border-radius:8px;background:#f0eef6;color:#1b1b2f;font:600 12px var(--cth-font-ui,system-ui)}
.dk-file button:hover{background:#e5e0f3}.dk-file .dk-danger{color:#c0392b}
.dk-empty{padding:18px;font-size:13px;color:#6b6585;text-align:center}
.dk-empty-big{margin-top:30px;padding:28px;border-radius:16px;background:#f7f6fb;line-height:22px;font-size:14px}
@media (prefers-reduced-motion:reduce){.dk-root,.dk-root.dk-out{animation:none}.dk-folder{transition:none}}
`}</style>
  );
}
