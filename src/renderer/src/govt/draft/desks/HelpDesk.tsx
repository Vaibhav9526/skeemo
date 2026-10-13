import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { floor } from '@/scene/govt/draft/floorBusDraft';
import { useActiveCase, useGovt } from '../state';
import { MicButton, SpeakButton, VoiceError, useAutoSpeak } from '../ui';
import { useTx } from '../useTx';

interface Msg { id: string; role: 'user' | 'agent'; text: string }

/** Help & Support: ask anything, get a straight answer in your language — by typing or speaking. */
export function HelpDesk() {
  const { t, i18n } = useTranslation('govtdraft');
  const tx = useTx();
  const c = useActiveCase();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);
  const scheme = c ? SCHEME_BY_ID[c.schemeId] : null;
  const hello = t('desk.help.hello');
  const last = msgs[msgs.length - 1];
  useAutoSpeak(last ? `help-${last.id}` : 'help-hello', last?.role === 'agent' ? last.text : hello, 'help');
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, busy]);

  const ask = async (said?: string) => {
    const q = (said ?? text).trim();
    if (!q || busy) return;
    setText('');
    const user: Msg = { id: `u${Date.now()}`, role: 'user', text: q };
    setMsgs((m) => [...m, user]);
    setBusy(true);
    floor({ type: 'busy', actor: 'help', on: true });
    const r = await window.cth.govtAiHelp({ question: q, lang: i18n.language, caseId: c?.id, history: msgs.slice(-6).map((m) => ({ role: m.role, text: m.text })) }).catch(() => null);
    floor({ type: 'busy', actor: 'help', on: false });
    setBusy(false);
    setMsgs((m) => [...m, { id: `a${Date.now()}`, role: 'agent', text: r && r.ok ? r.reply : (r && !r.ok ? r.error : t('common.failed')) }]);
  };

  const quick = [
    t('desk.help.q1'), t('desk.help.q2'), t('desk.help.q3'),
    ...(scheme ? [t('desk.help.q4', { scheme: tx(scheme.name) }), t('desk.help.q5', { scheme: tx(scheme.name) })] : []),
  ];

  return (
    <>
      <div className="g-body" style={{ padding: 14 }}>
        <div className="g-say">
          <span className="speak"><SpeakButton id="help-hello" desk="help" text={hello} /></span>
          {hello}
        </div>
        {msgs.length === 0 && (
          <div className="g-row">
            {quick.map((q) => <button key={q} className="g-chip" style={{ cursor: 'pointer' }} onClick={() => void ask(q)}>{q}</button>)}
          </div>
        )}
        <div className="g-chat">
          {msgs.map((m) => (
            <div key={m.id} className={`g-msg ${m.role}`}>
              {m.text}
              {m.role === 'agent' && <div style={{ marginTop: 4, textAlign: 'right' }}><SpeakButton id={`help-${m.id}`} desk="help" text={m.text} className="g-iconbtn" /></div>}
            </div>
          ))}
          {busy && <div className="g-msg agent">…</div>}
        </div>
        <VoiceError />
        <div ref={end} />
      </div>
      <div className="g-composer">
        <textarea className="g-input" rows={1} value={text} placeholder={t('desk.help.ph')} aria-label={t('desk.help.ph')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }} />
        <MicButton onText={(s) => void ask(s)} />
        <button className="g-btn" disabled={busy || !text.trim()} onClick={() => void ask()}>{t('common.send')}</button>
      </div>
    </>
  );
}
