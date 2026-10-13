import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDirectionSync } from '@/i18n/useDirection';
import { GOVT_LANGUAGES } from '@shared/govt/languages';
import { lookFor } from './art/people';
import { useGovt, type AppStyle, type View } from './state';
import { Pixie } from './ui';
import { Icon, Logo } from './icons';
import { stopSpeaking } from './voice';
import { ProfileSetup } from './ProfileSetup';
import { SettingsSheet } from './SettingsSheet';
import { OfficeView } from './OfficeView';
import { ChatView } from './chat/ChatView';
import { VaultView } from './vault/VaultView';
import { NoticeOverlay } from './NoticeOverlay';
import { DraftApp } from './draft/DraftApp';
import './skeemo.css';
import './skeemo2.css';

/** Skeemo — scheme eligibility and benefit navigator. Three rooms: the office, the focus chat, the vault. */
export function SkeemoApp() {
  const { t, i18n } = useTranslation('govt');
  useDirectionSync();
  const ready = useGovt((s) => s.ready);
  const profile = useGovt((s) => s.profile);
  const settings = useGovt((s) => s.settings);
  const view = useGovt((s) => s.view);
  const profileOpen = useGovt((s) => s.profileOpen);
  const settingsOpen = useGovt((s) => s.settingsOpen);
  const setView = useGovt((s) => s.setView);
  const setLang = useGovt((s) => s.setLang);
  const setSettings = useGovt((s) => s.setSettings);
  const style = useGovt((s) => s.style);
  const setStyle = useGovt((s) => s.setStyle);

  useEffect(() => { void useGovt.getState().boot(); }, []);
  useEffect(() => { document.title = 'Skeemo'; void window.cth.setTitleBarOverlay('#ffffff', '#1e2420').catch(() => undefined); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const st = useGovt.getState();
      if (st.settingsOpen) st.setSettingsOpen(false);
      else if (st.profileOpen) st.setProfileOpen(false);
      else if (st.view !== 'office' && !(e.target instanceof HTMLTextAreaElement && e.target.value)) { stopSpeaking(); st.setView('office'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const look = useMemo(() => (profile ? lookFor(profile) : null), [profile]);
  if (style === 'draft') return <DraftApp />;
  if (!ready) return <div className="sk-root"><div className="sk-boot">Skeemo</div></div>;

  const nav: Array<[View, string, 'office' | 'chat' | 'vault']> = [['office', t('nav.office'), 'office'], ['chat', t('nav.chat'), 'chat'], ['vault', t('nav.vault'), 'vault']];

  return (
    <div className="sk-root" data-style={style}>
      <header className="sk-top">
        <div className="sk-brand"><Logo size={28} /> <span>Skeemo</span></div>
        {profile && (
          <nav className="sk-tabnav" aria-label="Skeemo">
            {nav.map(([v, label, icon]) => (
              <button key={v} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}><Icon name={icon} size={16} /> {label}</button>
            ))}
          </nav>
        )}
        <span className="sk-spacer" />
        {profile && view === 'office' && (
          <label className="sk-selectbox" title={t('style.label')}>
            <Icon name="map" size={15} />
            <select aria-label={t('style.label')} value={style} onChange={(e) => setStyle(e.target.value as AppStyle)}>
              <option value="classic">{t('style.classic')}</option>
              <option value="modern">{t('style.modern')}</option>
              <option value="draft">{t('style.draft')}</option>
            </select>
          </label>
        )}
        <label className="sk-selectbox" title={t('common.language')}>
          <Icon name="globe" size={15} />
          <select aria-label={t('common.language')} value={i18n.language} onChange={(e) => void setLang(e.target.value)}>
            {GOVT_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
        </label>
        <button
          className={`sk-icon-btn sk-bar-btn${settings?.autoVoice ? ' on' : ''}`} aria-pressed={!!settings?.autoVoice} title={settings?.hasKey ? (settings?.autoVoice ? t('voice.on') : t('voice.off')) : t('voice.needKey')} aria-label={t('settings.autoVoice')}
          onClick={async () => {
            if (!settings?.hasKey) { useGovt.getState().setSettingsOpen(true); return; }
            setSettings(await window.cth.govtSettingsSet({ autoVoice: !settings.autoVoice }));
            if (settings.autoVoice) stopSpeaking();
          }}
        ><Icon name="speaker" size={19} /></button>
        <button className="sk-icon-btn sk-bar-btn" aria-label={t('settings.title')} title={t('settings.title')} onClick={() => useGovt.getState().setSettingsOpen(true)}><Icon name="settings" size={19} /></button>
        {profile && look && (
          <button className="sk-avatar-pill" onClick={() => useGovt.getState().setProfileOpen(true)} title={t('settings.editProfile')}>
            <span className="face"><Pixie look={look} scale={2} bust label={profile.name} /></span>
            <span>{profile.name.split(' ')[0]}</span>
          </button>
        )}
      </header>

      <main className="sk-main">
        {profile && view === 'office' && <OfficeView />}
        {profile && view === 'chat' && <ChatView />}
        {profile && view === 'vault' && <VaultView />}
      </main>

      {(!profile || profileOpen) && <ProfileSetup existing={profile} onClose={profile ? () => useGovt.getState().setProfileOpen(false) : undefined} />}
      <NoticeOverlay />
      {settingsOpen && <SettingsSheet />}
    </div>
  );
}
