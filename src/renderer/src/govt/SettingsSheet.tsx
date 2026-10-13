import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTORS, type ActorId } from './art/people';
import { useGovt } from './state';
import { Icon } from './icons';
import { GOVT_LANGUAGES } from '@shared/govt/languages';

const VOICE_DESKS: ActorId[] = ['reception', 'registration', 'documents', 'eligibility', 'form', 'help', 'peon'];

export function SettingsSheet() {
  const { t, i18n } = useTranslation('govt');
  const settings = useGovt((s) => s.settings);
  const setSettings = useGovt((s) => s.setSettings);
  const setLang = useGovt((s) => s.setLang);
  const close = () => useGovt.getState().setSettingsOpen(false);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [voices, setVoices] = useState<Record<string, string>>({});
  if (!settings) return null;

  const saveKey = async () => {
    const r = await window.cth.govtVoiceSetKey(key.trim());
    if (!r.ok) { setMsg(r.error ?? t('common.failed')); return; }
    setKey(''); setMsg(t('settings.keySaved'));
    setSettings(await window.cth.govtSettingsGet());
  };

  return (
    <div className="sk-modal" role="dialog" aria-modal="true" aria-labelledby="sk-set-title" onClick={close}>
      <div className="sk-sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h1 id="sk-set-title">{t('settings.title')}</h1>
          <button className="sk-icon-btn" aria-label={t('common.close')} onClick={close}><Icon name="x" size={18} /></button>
        </header>
        <div className="content">
          <section className="sk-card sk-col">
            <div className="sk-title"><Icon name="globe" size={16} /> {t('common.language')}</div>
            <div className="sk-row">
              {GOVT_LANGUAGES.map((l) => (
                <button key={l.code} className={`sk-chip${i18n.language === l.code ? ' on' : ''}`} onClick={() => void setLang(l.code)}>{l.native}</button>
              ))}
            </div>
          </section>

          <section className="sk-card sk-col">
            <div className="sk-title"><Icon name="speaker" size={16} /> {t('settings.voice')}</div>
            <p className="sk-muted">{t('settings.voiceWhy')}</p>
            <div className="sk-row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
              <div className="sk-field" style={{ flex: 1 }}>
                <label htmlFor="el-key">{t('settings.elKey')} {settings.hasKey && <span className="sk-chip ok">{t('settings.keySet')}</span>}</label>
                <input id="el-key" type="password" autoComplete="off" value={key} placeholder={settings.hasKey ? '••••••••••••' : 'sk_…'} onChange={(e) => setKey(e.target.value)} />
              </div>
              <button className="sk-btn" disabled={!key.trim()} onClick={() => void saveKey()}>{t('common.save')}</button>
              {settings.hasKey && <button className="sk-btn ghost" onClick={async () => { await window.cth.govtVoiceSetKey(''); setSettings(await window.cth.govtSettingsGet()); setMsg(t('settings.keyRemoved')); }}>{t('common.remove')}</button>}
            </div>
            {!settings.encrypted && <div className="sk-err">{t('settings.noEncrypt')}</div>}
            {msg && <div className="sk-hint" role="status">{msg}</div>}
            <label className="sk-opt" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={settings.autoVoice} onChange={async (e) => setSettings(await window.cth.govtSettingsSet({ autoVoice: e.target.checked }))} style={{ marginTop: 4 }} />
              <span><b>{t('settings.autoVoice')}</b><br /><span className="sk-small sk-muted">{t('settings.autoVoiceWhy')}</span></span>
            </label>
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 550 }}>{t('settings.voicesPer')}</summary>
              <div className="sk-col" style={{ marginTop: 10, gap: 8 }}>
                {VOICE_DESKS.map((d) => (
                  <div key={d} className="sk-row" style={{ flexWrap: 'nowrap' }}>
                    <span style={{ width: 150 }}>{ACTORS[d].name}</span>
                    <input className="sk-input" placeholder={settings.defaultVoices[d]} value={voices[d] ?? settings.voices[d] ?? ''}
                      onChange={(e) => setVoices({ ...voices, [d]: e.target.value })}
                      onBlur={async () => { if (voices[d] !== undefined) setSettings(await window.cth.govtSettingsSet({ voices: { [d]: voices[d] } })); }} />
                  </div>
                ))}
                <span className="sk-hint">{t('settings.voiceIdHint')}</span>
              </div>
            </details>
          </section>

          <section className="sk-card sk-col">
            <div className="sk-title"><Icon name="compass" size={16} /> {t('settings.sj')}</div>
            <div className="sk-row">
              <span className={`sk-chip ${settings.superJargonFound ? 'ok' : 'warn'}`}>{settings.superJargonFound ? t('settings.sjFound') : t('settings.sjMissing')}</span>
              <button className="sk-btn ghost sm" onClick={async () => { const r = await window.cth.govtGuideBrowse(); if (r.ok && r.settings) setSettings(r.settings); }}>{t('desk.form.browse')}</button>
            </div>
          </section>

          <section className="sk-card sk-col">
            <div className="sk-title"><Icon name="user" size={16} /> {t('settings.you')}</div>
            <div className="sk-row">
              <button className="sk-btn ghost" onClick={() => { close(); useGovt.getState().setProfileOpen(true); }}>{t('settings.editProfile')}</button>
              <button className="sk-btn ghost" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={async () => {
                if (!window.confirm(t('settings.confirmReset'))) return;
                await window.cth.govtProfileClear();
                useGovt.setState({ profile: null, cases: [], activeCaseId: null, desk: 'reception', view: 'office' });
                close();
              }}>{t('settings.reset')}</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
