import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { DESK_ORDER } from '@/scene/govt/layout';
import { recommend } from '@shared/govt/eligibility';
import { SCHEMES, SCHEME_BY_ID } from '@shared/govt/schemes';
import { JOURNEY, docsProgress, nextDesk, type DeskId } from '@shared/govt/cases';
import { ACTORS, lookFor, type ActorId } from '../art/people';
import { Icon, Logo } from '../icons';
import { AgentFace, MicButton, Pixie, SchemeBrief, SpeakButton, VoiceError, useAutoSpeak } from '../ui';
import { useActiveCase, useGovt } from '../state';
import { useChat, type Block, type Msg } from './chatStore';
import { sendMessage } from './agents';
import { MENTION_LIST } from './mentions';
import { ReceptionTool } from './tools/ReceptionTool';
import { RegistrationTool } from './tools/RegistrationTool';
import { DocumentsTool } from './tools/DocumentsTool';
import { EligibilityTool } from './tools/EligibilityTool';
import { FormTool } from './tools/FormTool';
import { useTx } from '../useTx';
import { stopSpeaking } from '../voice';

/** The card each counter puts under its greeting. Help has none — it is just conversation. */
function ToolFor({ desk }: { desk: DeskId }) {
  switch (desk) {
    case 'reception': return <ReceptionTool />;
    case 'registration': return <RegistrationTool />;
    case 'documents': return <DocumentsTool />;
    case 'eligibility': return <EligibilityTool />;
    case 'form': return <FormTool />;
    default: return null;
  }
}

function SchemesBlock({ ids }: { ids: string[] }) {
  const { t } = useTranslation('govt');
  const openDesk = useGovt((s) => s.openDesk);
  const choose = (id: string) => { useGovt.setState({ prefill: { schemeId: id } }); openDesk('registration'); };
  return (
    <div className="sk-card sk-list sk-tool" style={{ padding: '4px 14px' }}>
      {ids.map((id) => SCHEME_BY_ID[id] && (
        <div className="sk-item" key={id} style={{ alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}><SchemeBrief scheme={SCHEME_BY_ID[id]} compact /></div>
          <button className="sk-btn sm" onClick={() => choose(id)}>{t('desk.registration.pickThis')}</button>
        </div>
      ))}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  if (b.type === 'schemes') return <SchemesBlock ids={b.ids} />;
  return <div className="sk-tool"><EligibilityTool resultOnly /></div>;
}

function Bubble({ m, desk }: { m: Msg; desk: DeskId }) {
  const actor = ACTORS[desk as ActorId];
  return (
    <>
      <div className={`sk-msg ${m.role}`}>
        {m.role === 'agent' && <span className="face"><AgentFace actor={actor.id} /></span>}
        <div className="sk-bubble">
          {m.role === 'agent' && <SpeakButton id={`m-${m.id}`} text={m.text} desk={actor.id} />}
          {m.text}
        </div>
      </div>
      {m.blocks?.map((b, i) => <BlockView key={i} b={b} />)}
    </>
  );
}

function Steps({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('govt');
  const c = useActiveCase();
  const desk = useGovt((s) => s.desk);
  const openDesk = useGovt((s) => s.openDesk);
  const scheme = c ? SCHEME_BY_ID[c.schemeId] : null;
  if (!c || !scheme) return null;
  const now = nextDesk(c, scheme.docs);
  const done = (d: DeskId): boolean => {
    if (d === 'registration') return true;
    if (d === 'documents') { const p = docsProgress(c, scheme.docs); return p.done === p.total; }
    if (d === 'eligibility') return c.eligibility === 'eligible';
    if (d === 'form') return !!c.submittedAt;
    return false;
  };
  return (
    <div className={`sk-steps${compact ? ' compact' : ''}`} aria-label={t('journey.label')}>
      {JOURNEY.filter((d) => d !== 'help').map((d, i) => (
        <button key={d} className={`sk-step${done(d) ? ' done' : ''}${now === d || desk === d ? ' now' : ''}`} onClick={() => openDesk(d)} title={t(`desk.${d}.title`)}>
          {done(d) ? <Icon name="check" size={13} /> : <span>{i + 1}</span>}
          {!compact && t(`desk.${d}.short`)}
        </button>
      ))}
    </div>
  );
}

function Composer({ desk }: { desk: DeskId }) {
  const { t } = useTranslation('govt');
  const [text, setText] = useState('');
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const busy = useChat((s) => !!s.busy[desk]);
  const mention = /(^|\s)@([a-z]*)$/i.exec(text);
  const options = mention ? MENTION_LIST.filter((m) => m.key.startsWith(mention[2].toLowerCase())) : [];
  const first = ACTORS[desk as ActorId].name.split(' ')[0];

  const submit = (said?: string) => {
    const v = (said ?? text).trim();
    if (!v || busy) return;
    setText('');
    void sendMessage(v);
  };
  const choose = (key: string) => {
    if (!mention) return;
    setText(text.slice(0, mention.index + mention[1].length) + `@${key} `);
    setSel(0);
    ref.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (options.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((sel + 1) % options.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((sel - 1 + options.length) % options.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); choose(options[sel].key); return; }
      if (e.key === 'Escape') { e.stopPropagation(); setText(text.replace(/@[a-z]*$/i, '')); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };
  useEffect(() => { ref.current?.focus(); }, [desk]);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; } }, [text]);

  return (
    <div className="sk-compose-wrap">
      <div className="sk-compose">
        {options.length > 0 && (
          <div className="sk-mention" role="listbox">
            {options.map((o, i) => (
              <button key={o.key} className={i === sel ? 'on' : ''} role="option" aria-selected={i === sel} onMouseDown={(e) => { e.preventDefault(); choose(o.key); }}>
                {o.target === 'vault' ? <Icon name="vault" size={18} /> : <span style={{ width: 28 }}><AgentFace actor={o.target as ActorId} scale={1} /></span>}
                <span><b>@{o.key}</b> <span className="sk-small sk-muted">{o.target === 'vault' ? t('nav.vault') : t(`desk.${o.target}.title`)}</span></span>
              </button>
            ))}
          </div>
        )}
        <div className="sk-compose-box">
          <button className="sk-icon-btn sk-plus" aria-label={t('chat.mention')} title={t('chat.mention')} onClick={() => { setText((v) => (v && !v.endsWith(' ') ? `${v} @` : `${v}@`)); ref.current?.focus(); }}><Icon name="plus" size={18} /></button>
          <textarea
            ref={ref} rows={1} value={text} placeholder={t('chat.placeholder', { name: first })} aria-label={t('chat.placeholder', { name: first })}
            onChange={(e) => { setText(e.target.value); setSel(0); }} onKeyDown={onKey}
          />
          <MicButton onText={(s) => submit(s)} />
          <button className="sk-send" disabled={!text.trim() || busy} onClick={() => submit()} aria-label={t('common.send')}><Icon name="arrowUp" size={18} /></button>
        </div>
        <VoiceError />
      </div>
    </div>
  );
}

/** The conversation itself — used by both the docked chat and the focus chat. */
export function ThreadPane({ desk, compact = false }: { desk: DeskId; compact?: boolean }) {
  const { t } = useTranslation('govt');
  const profile = useGovt((s) => s.profile);
  const handoffs = useGovt((s) => s.handoffs);
  const thread = useChat((s) => s.threads[desk]) ?? [];
  const busy = useChat((s) => !!s.busy[desk]);
  const active = useActiveCase();
  const actor = ACTORS[desk as ActorId];
  const end = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const tx = useTx();

  const count = desk === 'documents' ? (active ? SCHEME_BY_ID[active.schemeId]?.docs.length ?? 0 : 0) : SCHEMES.length;
  const hello = desk === 'documents' && !active ? t('desk.documents.noCase') : t(`desk.${desk}.hello`, { name: profile?.name ?? '', count });
  useAutoSpeak(`hello-${desk}`, hello, actor.id);
  const mine = useMemo(() => handoffs.filter((h) => h.desk === desk).slice(-1)[0], [handoffs, desk]);
  const tool = useRef<HTMLDivElement | null>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); if (compact) requestAnimationFrame(() => tool.current?.scrollIntoView({ block: 'start' })); }, [desk, compact]);
  useEffect(() => { if (thread.length || busy) end.current?.scrollIntoView({ block: 'end' }); }, [thread.length, busy]);

  // quick starts: Help has fixed questions, Registration offers the schemes that fit the citizen best
  const chips = useMemo(() => {
    if (desk === 'help') return [t('desk.help.q1'), t('desk.help.q2'), t('desk.help.q3')];
    if (desk === 'registration' && profile) return recommend(profile).slice(0, 3).map((m) => tx(m.scheme.name));
    return [];
  }, [desk, profile, t, tx]);
  const empty = thread.length === 0;

  return (
    <>
      <div className="sk-msgs sk-scroll" ref={scroller}>
        <div className="sk-msgs-inner">
          {empty && compact && chips.length > 0 && (
            <div className="sk-row" style={{ marginTop: 8 }}>
              {chips.map((c) => <button key={c} className="sk-chip" onClick={() => void sendMessage(c)}>{c}</button>)}
            </div>
          )}
          {empty && !compact && (
            <div className="sk-hero">
              <span className="sk-hero-face"><Pixie look={actor.look} scale={compact ? 3 : 4} bust label={actor.name} /></span>
              <h2>{t('chat.hi', { name: actor.name.split(' ')[0] })}</h2>
              <p>{t('chat.what')}</p>
              {chips.length > 0 && (
                <div className="sk-row" style={{ justifyContent: 'center', marginTop: 12 }}>
                  {chips.map((c) => <button key={c} className="sk-chip" onClick={() => void sendMessage(c)}>{c}</button>)}
                </div>
              )}
            </div>
          )}
          {mine && mine.text !== desk && (
            <div className="sk-small sk-muted" style={{ textAlign: 'center' }}>{t('chat.handoff', { from: t(`desk.${mine.text}.title`) })}</div>
          )}
          <div className="sk-msg agent">
            <span className="face"><AgentFace actor={actor.id} /></span>
            <div className="sk-bubble"><SpeakButton id={`hello-${desk}`} text={hello} desk={actor.id} />{hello}</div>
          </div>
          <div className="sk-tool" ref={tool}><ToolFor desk={desk} /></div>
          {thread.map((m) => <Bubble key={m.id} m={m} desk={desk} />)}
          {busy && <div className="sk-msg agent"><span className="face"><AgentFace actor={actor.id} /></span><div className="sk-bubble"><span className="sk-typing"><i /><i /><i /></span></div></div>}
          <div ref={end} />
        </div>
      </div>
      <Composer desk={desk} />
    </>
  );
}

const ago = (ts: number, now: number, t: (k: string, o?: Record<string, unknown>) => string): string => {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return t('chat.now');
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};

/** Left list: every counter is a conversation, with its last message and how long ago. */
function Sidebar() {
  const { t } = useTranslation('govt');
  const profile = useGovt((s) => s.profile);
  const desk = useGovt((s) => s.desk);
  const openDesk = useGovt((s) => s.openDesk);
  const setView = useGovt((s) => s.setView);
  const threads = useChat((s) => s.threads);
  const busy = useChat((s) => s.busy);
  const clear = useChat((s) => s.clear);
  const [q, setQ] = useState('');
  const now = Date.now();
  const look = useMemo(() => (profile ? lookFor(profile) : null), [profile]);
  const rows = DESK_ORDER.filter((d) => !q.trim() || `${ACTORS[d as ActorId].name} ${t(`desk.${d}.title`)}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <aside className="sk-rail" aria-label={t('chat.counters')}>
      <div className="sk-rail-brand"><Logo size={26} /> Skeemo</div>
      <button className="sk-newchat" onClick={() => { clear(desk); stopSpeaking(); }}><Icon name="plus" size={16} /> {t('chat.newChat')}</button>
      <div className="sk-rail-search"><Icon name="search" size={16} /><input value={q} placeholder={t('chat.search')} aria-label={t('chat.search')} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="sk-rail-label">{t('chat.chats')}</div>
      <div className="sk-rail-list sk-scroll">
        {rows.map((d) => {
          const a = ACTORS[d as ActorId];
          const list = threads[d] ?? [];
          const last = list[list.length - 1];
          return (
            <button key={d} className={`sk-agent${desk === d ? ' on' : ''}`} onClick={() => openDesk(d)} aria-current={desk === d ? 'true' : undefined}>
              <span className="face"><AgentFace actor={a.id} /></span>
              <span className="meta">
                <span className="line"><b>{t(`desk.${d}.title`)}</b><em>{last ? ago(last.ts, now, t) : ''}</em></span>
                <span className="prev">{busy[d] ? t('chat.typing') : last ? last.text : a.name}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="sk-rail-foot">
        <span className="face">{profile && look && <Pixie look={look} scale={2} bust label={profile.name} />}</span>
        <b>{profile?.name.split(' ')[0] ?? t('chat.you')}</b>
        <button className="sk-btn ghost sm" onClick={() => setView('office')}>{t('chat.exit')}</button>
      </div>
    </aside>
  );
}

/** Focus chat: a quiet messenger — the counters down the left, one conversation in the middle; call another counter with @name. */
export function ChatView() {
  const { t } = useTranslation('govt');
  const desk = useGovt((s) => s.desk);
  const clear = useChat((s) => s.clear);
  const actor = ACTORS[desk as ActorId];
  return (
    <div className="sk-chat">
      <Sidebar />
      <section className="sk-thread" aria-label={t(`desk.${desk}.title`)}>
        <header className="sk-thread-head">
          <span className="face"><AgentFace actor={actor.id} scale={2} /></span>
          <div className="who"><b>{actor.name}</b><span>{t(`desk.${desk}.title`)}</span></div>
          <Steps />
          <button className="sk-btn ghost sm" onClick={() => clear(desk)}>{t('chat.clear')}</button>
        </header>
        <ThreadPane desk={desk} />
      </section>
    </div>
  );
}

/** The chat docked beside the office floor: the counter you are standing at, with a way to open the full focus chat. */
export function DockChat() {
  const { t } = useTranslation('govt');
  const desk = useGovt((s) => s.desk);
  const setView = useGovt((s) => s.setView);
  const busy = useChat((s) => !!s.busy[desk]);
  const actor = ACTORS[desk as ActorId];
  return (
    <aside className="sk-dock" aria-label={t(`desk.${desk}.title`)}>
      <div className="sk-dock-top">
        <span className="sk-dock-tab on">{t('nav.chat')}</span>
        <span style={{ flex: 1 }} />
        <button className="sk-btn ghost sm" onClick={() => setView('chat')}>{t('chat.focus')} <Icon name="expand" size={13} /></button>
      </div>
      <div className="sk-idcard">
        <span className="face"><AgentFace actor={actor.id} scale={3} /></span>
        <div className="meta">
          <small>{t('chat.counterId')}</small>
          <b>{actor.name}</b>
          <span>{t(`desk.${desk}.title`)}</span>
          <em className={busy ? 'busy' : ''}>{busy ? t('chat.typing') : t('chat.ready')}</em>
        </div>
        <Steps compact />
      </div>
      <ThreadPane desk={desk} compact />
    </aside>
  );
}
