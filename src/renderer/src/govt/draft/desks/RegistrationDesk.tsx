import { CATEGORY_EMOJI } from '../categoryIcons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_LABEL, SCHEME_BY_ID, SCHEME_CATEGORIES, schemesIn, type SchemeCategory } from '@shared/govt/schemes';
import { evaluate } from '@shared/govt/eligibility';
import { floor } from '@/scene/govt/draft/floorBusDraft';
import { useGovt } from '../state';
import { MicButton, Say, SchemeBrief, VoiceError, useAutoSpeak } from '../ui';
import { useTx } from '../useTx';

/** Registration: choose a topic by answering questions (form) or just say / type what you need. Then the file is opened and the peon takes it to Document Verification. */
export function RegistrationDesk() {
  const { t, i18n } = useTranslation('govtdraft');
  const tx = useTx();
  const profile = useGovt((s) => s.profile);
  const prefill = useGovt((s) => s.prefill);
  const register = useGovt((s) => s.registerScheme);
  const [tab, setTab] = useState<'form' | 'chat'>('form');
  const [category, setCategory] = useState<SchemeCategory | ''>('');
  const [schemeId, setSchemeId] = useState('');
  const [text, setText] = useState('');
  const [asking, setAsking] = useState(false);
  const [reply, setReply] = useState('');
  const [found, setFound] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prefill.schemeId && SCHEME_BY_ID[prefill.schemeId]) { setSchemeId(prefill.schemeId); setCategory(SCHEME_BY_ID[prefill.schemeId].category); setTab('form'); }
    else if (prefill.category) { setCategory(prefill.category); setSchemeId(''); setTab('form'); }
  }, [prefill]);

  const hello = t('desk.registration.hello');
  useAutoSpeak('registration-hello', hello, 'registration');

  const scheme = schemeId ? SCHEME_BY_ID[schemeId] : null;
  const verdict = scheme && profile ? evaluate(scheme, profile) : null;

  const ask = async (said?: string) => {
    const msg = (said ?? text).trim();
    if (!msg) return;
    setText(msg); setAsking(true); setError(''); setFound([]); setReply('');
    floor({ type: 'busy', actor: 'registration', on: true });
    const r = await window.cth.govtAiMatch({ text: msg, lang: i18n.language }).catch(() => null);
    floor({ type: 'busy', actor: 'registration', on: false });
    setAsking(false);
    if (!r || !r.ok) { setError(r && !r.ok ? r.error : t('common.failed')); return; }
    setFound(r.ids);
    setReply(r.reply || (r.ids.length ? t('desk.registration.foundN', { count: r.ids.length }) : t('desk.registration.noneFound')));
  };

  const choose = (id: string) => { setSchemeId(id); setCategory(SCHEME_BY_ID[id].category); setTab('form'); };

  const submit = async () => {
    if (!schemeId) return;
    setBusy(true); setError('');
    const c = await register(schemeId);
    setBusy(false);
    if (!c) setError(t('common.failed'));
  };

  return (
    <>
      <Say id="registration-hello" desk="registration" text={hello}>{hello}</Say>
      <div className="g-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'form'} className={tab === 'form' ? 'on' : ''} onClick={() => setTab('form')}>📋 {t('desk.registration.tabForm')}</button>
        <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>💬 {t('desk.registration.tabChat')}</button>
      </div>

      {tab === 'form' && (
        <>
          <section className="g-card">
            <div className="g-h">{t('desk.registration.q1')}</div>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {SCHEME_CATEGORIES.map((c) => (
                <label key={c} className={`g-opt${category === c ? ' sel' : ''}`}>
                  <input type="radio" name="topic" checked={category === c} onChange={() => { setCategory(c); setSchemeId(''); }} />
                  <span>{CATEGORY_EMOJI[c]} <b>{tx(CATEGORY_LABEL[c])}</b></span>
                </label>
              ))}
              <label className="g-opt" onClick={() => setTab('chat')}>
                <input type="radio" name="topic" checked={false} readOnly />
                <span>❓ {t('desk.registration.notSure')}</span>
              </label>
            </div>
          </section>

          {category && (
            <section className="g-card">
              <div className="g-h">{t('desk.registration.q2')}</div>
              <div className="g-field" style={{ marginTop: 8 }}>
                <select aria-label={t('desk.registration.q2')} value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
                  <option value="">{t('common.choose')}</option>
                  {schemesIn(category).map((s) => <option key={s.id} value={s.id}>{tx(s.name)}</option>)}
                </select>
              </div>
            </section>
          )}

          {scheme && (
            <section className="g-card sel">
              <div className="g-h">{t('desk.registration.q3')}</div>
              <div style={{ marginTop: 8 }}><SchemeBrief scheme={scheme} /></div>
              {verdict?.status === 'ineligible' && <div className="g-note" style={{ marginTop: 10 }}>⚠ {t('desk.registration.heads')}</div>}
              <button className="g-btn go wide" style={{ marginTop: 12 }} disabled={busy} onClick={() => void submit()}>{t('desk.registration.register')} →</button>
            </section>
          )}
        </>
      )}

      {tab === 'chat' && (
        <section className="g-card">
          <div className="g-h">{t('desk.registration.describe')}</div>
          <div className="g-row" style={{ alignItems: 'flex-end', marginTop: 8 }}>
            <div className="g-field" style={{ flex: 1 }}>
              <textarea rows={3} value={text} placeholder={t('desk.registration.describePh')} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }} />
            </div>
            <MicButton onText={(s) => void ask(s)} />
          </div>
          <button className="g-btn wide" style={{ marginTop: 10 }} disabled={asking || !text.trim()} onClick={() => void ask()}>{asking ? t('common.thinking') : t('desk.registration.find')}</button>
          <VoiceError />
          {error && <div className="g-err" role="alert" style={{ marginTop: 8 }}>{error}</div>}
          {reply && <div className="g-msg agent" style={{ marginTop: 10 }}>{reply}</div>}
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {found.map((id) => (
              <div key={id} className="g-card pick" onClick={() => choose(id)}>
                <SchemeBrief scheme={SCHEME_BY_ID[id]} compact />
                <button className="g-btn small go" style={{ marginTop: 8 }}>{t('desk.registration.pickThis')}</button>
              </div>
            ))}
          </div>
        </section>
      )}
      {error && tab === 'form' && <div className="g-err" role="alert">{error}</div>}
    </>
  );
}
