import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GovtFloor } from '@/scene/govt/draft/GovtFloorDraft';
import { useDirectionSync } from '@/i18n/useDirection';
import { GOVT_LANGUAGES } from '@shared/govt/languages';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { JOURNEY, docsProgress, nextDesk, type DeskId } from '@shared/govt/cases';
import { ACTORS, lookFor, type ActorId } from './art/people';
import { useActiveCase, useGovt } from './state';
import { DeskHeader, Pixie } from './ui';
import { useTx } from './useTx';
import { stopSpeaking } from './voice';
import { ProfileSetup } from './ProfileSetup';
import { SettingsSheet } from './SettingsSheet';
import { ReceptionDesk } from './desks/ReceptionDesk';
import { RegistrationDesk } from './desks/RegistrationDesk';
import { DocumentsDesk } from './desks/DocumentsDesk';
import { EligibilityDesk } from './desks/EligibilityDesk';
import { FormDesk } from './desks/FormDesk';
import { HelpDesk } from './desks/HelpDesk';
import logo from '@brand/skeemo-logo.png?url';
import './draft.css';
import { useGovt as useSkeemo, type AppStyle } from '../state';

function DeskPanel({ desk }: { desk: DeskId }) {
  const openDesk = useGovt((s) => s.openDesk);
  const actor = ACTORS[desk as ActorId];
  const close = () => { stopSpeaking(); openDesk(null); };
  return (
    <aside className="g-panel" aria-label={actor.title}>
      <DeskHeader actor={desk as ActorId} onClose={close} />
      {desk === 'help' ? <HelpDesk /> : (
        <div className="g-body">
          {desk === 'reception' && <ReceptionDesk />}
          {desk === 'registration' && <RegistrationDesk />}
          {desk === 'documents' && <DocumentsDesk />}
          {desk === 'eligibility' && <EligibilityDesk />}
          {desk === 'form' && <FormDesk />}
        </div>
      )}
    </aside>
  );
}

function Journey() {
  const { t } = useTranslation('govtdraft');
  const tx = useTx();
  const c = useActiveCase();
  const desk = useGovt((s) => s.desk);
  const openDesk = useGovt((s) => s.openDesk);
  const scheme = c ? SCHEME_BY_ID[c.schemeId] : null;
  const now: DeskId = c && scheme ? nextDesk(c, scheme.docs) : 'registration';
  const done = (d: DeskId): boolean => {
    if (!c || !scheme) return false;
    if (d === 'registration') return true;
    if (d === 'documents') { const p = docsProgress(c, scheme.docs); return p.done === p.total; }
    if (d === 'eligibility') return c.eligibility === 'eligible';
    if (d === 'form') return !!c.submittedAt;
    return false;
  };
  return (
    <nav className="g-journey" aria-label={t('journey.label')}>
      <button className="g-step" onClick={() => openDesk('reception')} style={{ flex: '0 0 auto' }}>
        <span className="n" aria-hidden>🏛</span><span className="l">{t('desk.reception.title')}</span>
      </button>
      <div className="g-caseinfo">
        <b>{scheme ? tx(scheme.name) : t('journey.noFile')}</b>
        <span>{c ? c.id : t('journey.start')}</span>
      </div>
      {JOURNEY.map((d, i) => (
        <button key={d} className={`g-step${done(d) ? ' done' : ''}${now === d ? ' now' : ''}${desk === d ? ' now' : ''}`} onClick={() => openDesk(d)} aria-current={desk === d ? 'step' : undefined}>
          <span className="n" aria-hidden>{done(d) ? '✓' : i + 1}</span>
          <span className="l">{t(`desk.${d}.short`)}</span>
        </button>
      ))}
    </nav>
  );
}

export function DraftApp() {
  const { t, i18n } = useTranslation('govtdraft');
  useDirectionSync();
  const ready = useGovt((s) => s.ready);
  const profile = useGovt((s) => s.profile);
  const settings = useGovt((s) => s.settings);
  const desk = useGovt((s) => s.desk);
  const profileOpen = useGovt((s) => s.profileOpen);
  const settingsOpen = useGovt((s) => s.settingsOpen);
  const openDesk = useGovt((s) => s.openDesk);
  const setLang = useGovt((s) => s.setLang);
  const setSettings = useGovt((s) => s.setSettings);

  useEffect(() => { void useGovt.getState().boot(); }, []);
  useEffect(() => { document.title = 'Skeemo'; }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const st = useGovt.getState();
      if (st.settingsOpen) st.setSettingsOpen(false);
      else if (st.profileOpen) st.setProfileOpen(false);
      else if (st.desk && !(e.target instanceof HTMLTextAreaElement && e.target.value)) { stopSpeaking(); st.openDesk(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const look = useMemo(() => (profile ? lookFor(profile) : null), [profile]);

  if (!ready) return <div className="g-root"><div className="g-boot">Skeemo…</div></div>;

  return (
    <div className="g-root">
      <header className="g-top">
        <div className="brand">
          <img src={logo} alt="" />
          <div>Skeemo<small>{t('app.tagline')}</small></div>
        </div>
        <span className="spacer" />
        <select className="g-select" aria-label="Theme" value="draft" onChange={(e) => useSkeemo.getState().setStyle(e.target.value as AppStyle)}>
          <option value="classic">Classic</option>
          <option value="modern">Modern</option>
          <option value="draft">Draft</option>
        </select>
        <select className="g-select" aria-label={t('common.language')} value={i18n.language} onChange={(e) => void setLang(e.target.value)}>
          {GOVT_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
        </select>
        <button className={`g-chipbtn plain${settings?.autoVoice ? ' on' : ''}`} aria-pressed={!!settings?.autoVoice}
          title={settings?.hasKey ? t('settings.autoVoice') : t('voice.needKey')}
          onClick={async () => {
            if (!settings?.hasKey) { useGovt.getState().setSettingsOpen(true); return; }
            setSettings(await window.cth.govtSettingsSet({ autoVoice: !settings.autoVoice }));
            if (settings.autoVoice) stopSpeaking();
          }}>🔊 {settings?.autoVoice ? t('voice.on') : t('voice.off')}</button>
        <button className="g-chipbtn plain" onClick={() => useGovt.getState().setSettingsOpen(true)}>⚙ {t('settings.title')}</button>
        {profile && look && (
          <button className="g-chipbtn" onClick={() => useGovt.getState().setProfileOpen(true)} title={t('settings.editProfile')}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff8e7', overflow: 'hidden', display: 'grid', placeItems: 'end center' }}>
              <Pixie look={look} scale={2} bust label={profile.name} />
            </span>
            {profile.name.split(' ')[0]}
          </button>
        )}
      </header>

      <main className="g-main">
        <div className="g-floor">
          {profile && look && <GovtFloor look={look} citizenName={profile.name.split(' ')[0]} desk={desk} onDesk={(d) => openDesk(d)} />}
          {profile && <Journey />}
        </div>
        {profile && desk && <DeskPanel desk={desk} key={desk} />}
      </main>

      {(!profile || profileOpen) && <ProfileSetup existing={profile} onClose={profile ? () => useGovt.getState().setProfileOpen(false) : undefined} />}
      {settingsOpen && <SettingsSheet />}
    </div>
  );
}
