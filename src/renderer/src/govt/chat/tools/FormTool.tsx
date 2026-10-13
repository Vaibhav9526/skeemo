import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DOCS } from '@shared/govt/documents';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { formatRupees } from '@shared/govt/profile';
import { floor } from '@/scene/govt/floorBus';
import { useActiveCase, useGovt } from '../../state';
import { Icon } from '../../icons';
import { SchemeBrief, StatusIcon } from '../../ui';

/** Form Submission: hands the citizen to SuperJargon, which watches the real portal and talks them through each field. */
export function FormTool() {
  const { t, i18n } = useTranslation('govt');
  const c = useActiveCase();
  const profile = useGovt((s) => s.profile);
  const settings = useGovt((s) => s.settings);
  const setSettings = useGovt((s) => s.setSettings);
  const replace = useGovt((s) => s.replaceCase);
  const openDesk = useGovt((s) => s.openDesk);
  const send = useGovt((s) => s.sendFile);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ started: boolean; portalOpened: boolean; prompt: string } | null>(null);
  const [error, setError] = useState('');
  const scheme = c ? SCHEME_BY_ID[c.schemeId] : null;

  if (!c || !scheme || !profile) {
    return (
      <div className="sk-card sk-col">
        <p className="sk-muted">{t('desk.form.noCase')}</p>
        <button className="sk-btn" style={{ alignSelf: 'flex-start' }} onClick={() => openDesk('registration')}>{t('desk.documents.goRegister')} <Icon name="arrowRight" size={16} /></button>
      </div>
    );
  }
  const blocked = c.eligibility === 'ineligible';

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

  if (c.submittedAt) {
    return (
      <div className="sk-card sk-col">
        <div className="sk-row"><span className="sk-stamp ok">{t('status.submitted')}</span></div>
        <p>{t('desk.form.done')}</p>
        <button className="sk-btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => void send('help')}>{t('desk.form.toHelp')}</button>
      </div>
    );
  }

  return (
    <div className="sk-card sk-col" style={{ gap: 14 }}>
      <SchemeBrief scheme={scheme} compact />
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 550 }}>{t('desk.form.sheet')}</summary>
        <div className="sk-col" style={{ gap: 4, marginTop: 8 }}>
          {rows.map(([k, v]) => <div key={k} className="sk-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><span className="sk-muted">{k}</span><b style={{ textAlign: 'right', fontWeight: 550 }}>{v}</b></div>)}
        </div>
      </details>
      {!c.eligibility && <div className="sk-note">{t('desk.form.uncheckedWarn')}</div>}
      {blocked && <div className="sk-err" role="alert">{t('desk.form.blocked')}</div>}
      <div className="sk-row">
        <button className="sk-btn" disabled={busy || blocked} onClick={() => void launch()}><Icon name="compass" size={16} /> {busy ? t('common.opening') : t('desk.form.launch')}</button>
        <button className="sk-btn ghost sm" onClick={() => void window.cth.govtDocOpenFolder(c.id)}><Icon name="folder" size={14} /> {t('desk.documents.openFolder')}</button>
      </div>
      {!settings?.superJargonFound && (
        <div className="sk-note">
          {t('desk.form.exeMissing')}{' '}
          <button className="sk-btn sm ghost" onClick={async () => { const r = await window.cth.govtGuideBrowse(); if (r.ok && r.settings) setSettings(r.settings); }}>{t('desk.form.browse')}</button>
        </div>
      )}
      {error && <div className="sk-err" role="alert">{error}</div>}
      {result && (
        <div className="sk-col" style={{ gap: 2 }}>
          <div className="sk-check"><StatusIcon ok={result.started ? true : null} /><span>{result.started ? t('desk.form.started') : t('desk.form.notStarted')}</span></div>
          <div className="sk-check"><StatusIcon ok={result.portalOpened ? true : null} /><span>{result.portalOpened ? t('desk.form.portalOpened') : t('desk.form.portalOpenManual', { url: scheme.portal })}</span></div>
          <div className="sk-check"><StatusIcon ok /><span>{t('desk.form.promptCopied')}</span></div>
          <button className="sk-btn ghost sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => void navigator.clipboard?.writeText(result.prompt)}>{t('desk.form.copyAgain')}</button>
        </div>
      )}
      <button className="sk-btn warm" disabled={blocked} style={{ alignSelf: 'flex-start' }} onClick={async () => { const n = await window.cth.govtCaseSubmitted(c.id); if (n) { replace(n); floor({ type: 'say', actor: 'form', text: t('desk.form.sayDone') }); } }}>
        <Icon name="check" size={16} /> {t('desk.form.markDone')}
      </button>
    </div>
  );
}
