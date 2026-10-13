import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DOCS } from '@shared/govt/documents';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { formatRupees } from '@shared/govt/profile';
import { floor } from '@/scene/govt/draft/floorBusDraft';
import { useActiveCase, useGovt } from '../state';
import { Say, SchemeBrief, useAutoSpeak } from '../ui';

/** Form Submission: hands the citizen to SuperJargon, which watches the real portal and talks them through each field. */
export function FormDesk() {
  const { t, i18n } = useTranslation('govtdraft');
  const c = useActiveCase();
  const profile = useGovt((s) => s.profile);
  const settings = useGovt((s) => s.settings);
  const setSettings = useGovt((s) => s.setSettings);
  const replace = useGovt((s) => s.replaceCase);
  const open = useGovt((s) => s.openDesk);
  const send = useGovt((s) => s.sendFile);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ started: boolean; portalOpened: boolean; prompt: string } | null>(null);
  const [error, setError] = useState('');
  const scheme = c ? SCHEME_BY_ID[c.schemeId] : null;
  const hello = !c ? t('desk.form.noCase') : c.eligibility === 'ineligible' ? t('desk.form.notEligible') : t('desk.form.hello');
  useAutoSpeak(`form-hello-${c?.id ?? ''}`, hello, 'form');

  if (!c || !scheme || !profile) {
    return (
      <>
        <Say id="form-none" desk="form" text={hello}>{hello}</Say>
        <button className="g-btn alt" onClick={() => open('registration')}>{t('desk.documents.goRegister')} →</button>
      </>
    );
  }
  const blocked = c.eligibility === 'ineligible';
  const unchecked = !c.eligibility;

  const launch = async () => {
    setBusy(true); setError('');
    floor({ type: 'busy', actor: 'form', on: true });
    const r = await window.cth.govtGuideLaunch({ caseId: c.id, lang: i18n.language }).catch(() => null);
    floor({ type: 'busy', actor: 'form', on: false });
    setBusy(false);
    if (!r || !r.ok) { setError(r && !r.ok ? r.error : t('common.failed')); return; }
    setResult(r);
    floor({ type: 'say', actor: 'form', text: r.started ? t('desk.form.sayStarted') : t('desk.form.sayNoExe') });
  };

  const rows: Array<[string, string]> = [
    [t('profile.name'), profile.name], [t('profile.age'), String(profile.age)], [t('profile.gender'), t(`gender.${profile.gender}`)],
    [t('profile.state'), profile.state], [t('profile.occupation'), t(`occ.${profile.occupation}`)],
    [t('profile.income'), formatRupees(profile.income)], [t('profile.category'), t(`cat.${profile.category}`)],
    ...Object.values(c.docs).flatMap((d) => (d?.fields?.number ? [[DOCS[d.docId].name.en, d.fields.number] as [string, string]] : [])),
    [t('desk.form.reference'), c.id],
  ];

  return (
    <>
      <Say id={`form-hello-${c.id}`} desk="form" text={hello}>{hello}</Say>
      <section className="g-card"><SchemeBrief scheme={scheme} compact /></section>

      {c.submittedAt ? (
        <section className="g-card" style={{ textAlign: 'center' }}>
          <span className="g-stamp ok">{t('status.submitted')}</span>
          <p style={{ marginBottom: 0 }}>{t('desk.form.done')}</p>
          <button className="g-btn ghost small" style={{ marginTop: 8 }} onClick={() => void send('help')}>{t('desk.form.toHelp')}</button>
        </section>
      ) : (
        <>
          <section className="g-card">
            <div className="g-h">{t('desk.form.sheet')}</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 2 }}>
              {rows.map(([k, v]) => <div key={k} className="g-row" style={{ justifyContent: 'space-between', fontSize: 13 }}><span className="g-muted">{k}</span><b style={{ textAlign: 'right' }}>{v}</b></div>)}
            </div>
            <button className="g-btn ghost small" style={{ marginTop: 8 }} onClick={() => void window.cth.govtDocOpenFolder(c.id)}>📂 {t('desk.documents.openFolder')}</button>
          </section>

          {unchecked && <div className="g-note">⚠ {t('desk.form.uncheckedWarn')}</div>}
          {blocked && <div className="g-err" role="alert">{t('desk.form.blocked')}</div>}

          <button className="g-btn go wide" disabled={busy || blocked} onClick={() => void launch()}>🧭 {busy ? t('common.opening') : t('desk.form.launch')}</button>
          {!settings?.superJargonFound && (
            <div className="g-note">
              {t('desk.form.exeMissing')}{' '}
              <button className="g-btn small ghost" onClick={async () => { const r = await window.cth.govtGuideBrowse(); if (r.ok && r.settings) setSettings(r.settings); }}>{t('desk.form.browse')}</button>
            </div>
          )}
          {error && <div className="g-err" role="alert">{error}</div>}
          {result && (
            <section className="g-card">
              <div className="g-check"><span className={`mark ${result.started ? 'ok' : 'wait'}`}>{result.started ? '✓' : '!'}</span><span>{result.started ? t('desk.form.started') : t('desk.form.notStarted')}</span></div>
              <div className="g-check"><span className={`mark ${result.portalOpened ? 'ok' : 'wait'}`}>{result.portalOpened ? '✓' : '!'}</span><span>{result.portalOpened ? t('desk.form.portalOpened') : t('desk.form.portalOpenManual', { url: scheme.portal })}</span></div>
              <div className="g-check"><span className="mark ok">✓</span><span>{t('desk.form.promptCopied')}</span></div>
              <div className="g-note" style={{ marginTop: 6, whiteSpace: 'pre-wrap', maxHeight: 130, overflowY: 'auto' }}>{result.prompt}</div>
              <div className="g-row" style={{ marginTop: 8 }}>
                <button className="g-btn ghost small" onClick={() => void navigator.clipboard?.writeText(result.prompt)}>{t('desk.form.copyAgain')}</button>
              </div>
            </section>
          )}
          <button className="g-btn alt wide" disabled={blocked} onClick={async () => { const n = await window.cth.govtCaseSubmitted(c.id); if (n) { replace(n); floor({ type: 'say', actor: 'form', text: t('desk.form.sayDone') }); } }}>
            ✔ {t('desk.form.markDone')}
          </button>
        </>
      )}
    </>
  );
}
